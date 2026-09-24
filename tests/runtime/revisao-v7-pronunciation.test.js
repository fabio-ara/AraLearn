import assert from "node:assert/strict";
import test from "node:test";

import { listCourseSourceOccurrenceTargets } from "../../src/domain/courseSourceOccurrences.js";
import { RESOURCE_PACKAGE_REGISTRY as registry } from "../../src/resources/packages/index.js";
import { paragraphPackage } from "../../src/resources/packages/paragraph/index.js";
import { renderRichParagraph } from "../../src/resources/packages/paragraph/richText.js";
import { renderPackageStudyUnitBlocks } from "../../src/render/renderPackageStudyUnit.js";

const instance = (data, id = "pronunciation-explanation") => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data });
const rich = (inlines) => ({ format: "rich", languageTag: "pt-BR", textDirection: "ltr", blocks: [{ kind: "paragraph", inlines }] });
const ruby = (data) => ({ kind: "ruby", ...data });

// As três leituras do D010 usam BCP 47 registrado: ja-Kana (kana), zh-Latn-pinyin (pinyin)
// e pt-PT-fonipa/und-fonipa (IPA, com variedade da língua quando ela importa).
const readings = [
  { name: "kana", inline: ruby({ base: "学校", reading: "がっこう", readingLanguageTag: "ja-Kana" }), tag: "ja-Kana", text: "がっこう" },
  { name: "pinyin", inline: ruby({ base: "木", reading: "mù", readingLanguageTag: "zh-Latn-pinyin" }), tag: "zh-Latn-pinyin", text: "mù" },
  { name: "IPA de variedade", inline: ruby({ base: "casa", reading: "[ˈkazɐ]", languageTag: "pt-PT", readingLanguageTag: "pt-PT-fonipa" }), tag: "pt-PT-fonipa", text: "[ˈkazɐ]" },
  { name: "IPA sem língua determinada", inline: ruby({ base: "casa", reading: "[ˈkazɐ]", readingLanguageTag: "und-fonipa" }), tag: "und-fonipa", text: "[ˈkazɐ]" }
];

function findRubies(schema) {
  const found = [];
  const pending = [schema];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (node.properties?.kind?.const === "ruby") found.push(node);
    Object.values(node).forEach((value) => Array.isArray(value) ? pending.push(...value) : pending.push(value));
  }
  return found;
}

test("leitura anotada declara kana, pinyin e IPA pelo BCP 47 existente, sem vocabulário inventado", () => {
  for (const { name, inline } of readings) {
    const value = instance(rich([inline]));
    const validation = registry.validateInstance(value, "content");
    assert.equal(validation.valid, true, `${name}: ${validation.errors.join(" ")}`);
    assert.deepEqual(registry.normalizeInstance(value, "content"), value, name);
  }
});

test("o contrato recusa identificação inválida e qualquer notação de leitura inventada", () => {
  const invalid = [
    rich([ruby({ base: "casa", reading: "[ˈkazɐ]", readingLanguageTag: "pt_BR" })]),
    rich([ruby({ base: "casa", reading: "[ˈkazɐ]", readingLanguageTag: "und-" })]),
    rich([ruby({ base: "casa", reading: "kaza", readingNotation: "ipa" })]),
    rich([ruby({ base: "casa", reading: "kaza", readingLanguageTag: "und-fonipa", notation: "ipa" })]),
    rich([ruby({ base: "casa", reading: " ", readingLanguageTag: "und-fonipa" })])
  ];
  for (const data of invalid) assert.equal(registry.validateInstance(instance(data), "content").valid, false, JSON.stringify(data));
  assert.match(
    registry.validateInstance(instance(invalid[0]), "content").errors.join(" "),
    /leitura anotada precisa de uma identificação BCP 47 válida/u
  );
  const contract = registry.getAuthoringContract("aralearn.resource.paragraph", "1.0.0");
  const [rubySchema] = findRubies(contract.schema);
  assert.ok(rubySchema, "A superfície de autoria precisa expor o ramo ruby.");
  assert.deepEqual([...rubySchema.required].sort(), ["base", "kind", "reading"]);
  assert.deepEqual(Object.keys(rubySchema.properties).sort(), ["base", "kind", "languageTag", "reading", "readingLanguageTag", "textDirection"]);
  assert.doesNotMatch(JSON.stringify(contract.schema), /readingNotation|notationTag|readingKind/u, "Nenhuma notação de leitura proprietária entra no contrato.");
});

test("a leitura preserva escrita, sistema declarado, escape e a alternativa textual", () => {
  const html = registry.renderInstance(instance(rich(readings.map(({ inline }) => inline))), "content");
  assert.match(html, /<ruby role="group" aria-label="学校 \(がっこう\)">学校<rp>\(<\/rp><rt lang="ja-Kana" dir="auto">がっこう<\/rt><rp>\)<\/rp><\/ruby>/u);
  assert.match(html, /<rt lang="zh-Latn-pinyin" dir="auto">mù<\/rt>/u);
  assert.match(html, /<rt lang="pt-PT-fonipa" dir="auto">\[ˈkazɐ\]<\/rt>/u);
  assert.match(html, /<rt lang="und-fonipa" dir="auto">\[ˈkazɐ\]<\/rt>/u);

  // Sem declaração, o ruby lido antes continua idêntico: nenhuma regressão no par base/leitura.
  const legacy = registry.renderInstance(instance(rich([ruby({ base: "校内", reading: "こうない" })])), "content");
  assert.match(legacy, /<ruby role="group" aria-label="校内 \(こうない\)">校内<rp>\(<\/rp><rt>こうない<\/rt>/u);

  const hostile = registry.renderInstance(instance(rich([
    ruby({ base: "<script>alert(1)</script>", reading: "`x`", readingLanguageTag: "ja-Kana" })
  ])), "content");
  assert.match(hostile, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.match(hostile, /<code>x<\/code>/u);
  assert.doesNotMatch(hostile, /<script[ >]|javascript:/iu);
  assert.match(hostile, /<rt lang="ja-Kana" dir="auto">/u);

  // O renderer escapa a identificação por si só: nem uma declaração que burlasse o
  // contrato consegue criar atributo executável.
  const hostileTag = renderRichParagraph(rich([
    ruby({ base: "casa", reading: "[ˈkazɐ]", readingLanguageTag: "pt-PT-fonipa\" onload=\"alert(1)" })
  ]));
  assert.match(hostileTag, /<rt lang="pt-PT-fonipa&quot; onload=&quot;alert\(1\)" dir="auto">/u);
  const attributes = [.../<rt([^>]*)>/u.exec(hostileTag)[1].matchAll(/([a-z-]+)="([^"]*)"/gu)]
    .map(([, name, value]) => `${name}=${value}`);
  assert.deepEqual(attributes, ['lang=pt-PT-fonipa&quot; onload=&quot;alert(1)', 'dir=auto'],
    "A identificação hostil permanece dentro do valor do atributo, sem criar atributo novo.");

  const accessible = paragraphPackage.accessibleText(rich(readings.map(({ inline }) => inline)));
  assert.match(accessible, /学校 \(がっこう\)/u);
  assert.match(accessible, /木 \(mù\)/u);
  assert.match(accessible, /casa \(\[ˈkazɐ\]\)/u);
});

test("a leitura continua folha citável e alvo de prática, sem expor a identificação como conteúdo", () => {
  const data = rich(readings.map(({ inline }) => inline));
  const studyUnit = { id: "reading-unit", position: 1, title: "Leituras", role: "theory",
    content: [instance(data)], response: null, feedback: [], topics: [] };
  const targets = listCourseSourceOccurrenceTargets(studyUnit)
    .filter((target) => target.resourceId === "pronunciation-explanation");
  assert.deepEqual(targets.map(({ path }) => path), [
    "blocks[0].inlines[0].base", "blocks[0].inlines[0].reading",
    "blocks[0].inlines[1].base", "blocks[0].inlines[1].reading",
    "blocks[0].inlines[2].base", "blocks[0].inlines[2].reading",
    "blocks[0].inlines[3].base", "blocks[0].inlines[3].reading"
  ]);
  assert.ok(targets.every((target) => !target.path.includes("readingLanguageTag")),
    "A identificação do sistema não é conteúdo citável.");

  const practice = { ...studyUnit, role: "practice", response: {
    id: "reading-response", package: "aralearn.response.gap", version: "1.0.0", data: {
      prompt: "Recupere a leitura anotada.",
      blanks: [{ id: "pinyin", targetInstanceId: "pronunciation-explanation", targetPath: "blocks[0].inlines[1].reading",
        responseMode: "text", answer: "mù", label: "Leitura em pinyin" }]
    } } };
  assert.deepEqual(registry.validateStudyUnitRelations(practice), []);
  const html = renderPackageStudyUnitBlocks(practice);
  assert.match(html, /<rt lang="zh-Latn-pinyin" dir="auto"><span[^>]*data-action="complete-input"[^>]*data-complete-blank-index="0"[^>]*><\/span><\/rt>/u);
  assert.match(html, /<rt lang="ja-Kana" dir="auto">がっこう<\/rt>/u);
});
