import assert from "node:assert/strict";
import test from "node:test";

import { RESOURCE_PACKAGE_REGISTRY as registry } from "../../src/resources/packages/index.js";
import { paragraphPackage } from "../../src/resources/packages/paragraph/index.js";
import { renderPackageStudyUnitBlocks } from "../../src/render/renderPackageStudyUnit.js";
import { applyManualStudyUnitEdit, listManualStudyUnitEditablePaths } from "../../src/ui/manualStudyUnitEdit.js";
import { richParagraphData, richParagraphInstance, richParagraphStudyUnit } from "../fixtures/package/rich-paragraph.js";

const instanceWith = (data) => ({ ...richParagraphInstance, data });

test("prosa corrente preserva exatamente normalização, apresentação e contrato útil", () => {
  for (const text of ["ação e órgão", "  texto\r\n\r\n- item\r\n- outro  ", "学习 xuéxí", "日本語", "[ɐ̃] /ʁ/", "عربي English 3/4", "`x + y` e **ênfase**"]) {
    const data = { text, languageTag: "pt-BR", textDirection: "auto" };
    assert.deepEqual(paragraphPackage.normalize(data), {
      text: text.replace(/\r\n?/g, "\n").trim(), languageTag: "pt-BR", textDirection: "auto"
    });
    assert.equal(registry.validateInstance(instanceWith(data), "content").valid, true);
    assert.deepEqual(paragraphPackage.editableTargets(data).map(({ path }) => path), ["text"]);
  }
  assert.equal(registry.validateInstance(instanceWith({ format: "plain", text: "Forma explícita." }), "content").valid, true);
});

test("parágrafo rico valida e renderiza matemática inline/bloco, ruby e bidi sem executar marcação", () => {
  const result = registry.validateInstance(richParagraphInstance, "content");
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.deepEqual(registry.normalizeInstance(richParagraphInstance, "content"), richParagraphInstance);
  const html = renderPackageStudyUnitBlocks(richParagraphStudyUnit);
  assert.match(html, /<math display="inline"/u);
  assert.match(html, /<math display="block"/u);
  assert.match(html, /<mfrac><mn>3<\/mn><mn>4<\/mn><\/mfrac>/u);
  assert.match(html, /<ruby role="group" aria-label="学习 \(xuéxí\)">学习<rp>\(<\/rp><rt>xuéxí<\/rt>/u);
  assert.match(html, /lang="ja"/u);
  assert.match(html, /lang="ar" dir="rtl"/u);
  assert.match(html, /lang="en" dir="ltr"/u);
  assert.match(html, /<code>x \+ y<\/code>/u);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.doesNotMatch(html, /<script[ >]|onerror=|javascript:/iu);
  const accessible = paragraphPackage.accessibleText(richParagraphData);
  assert.match(accessible, /três dividido por quatro/u);
  assert.match(accessible, /学习 \(xuéxí\)/u);
  assert.match(accessible, /学校 \(がっこう\)/u);
});

test("contrato recusa forma ambígua, markup estrutural, notação inválida, idioma e limites excedidos", () => {
  const invalidData = [
    { ...richParagraphData, text: "Texto concorrente." },
    { text: "Texto", blocks: richParagraphData.blocks },
    { format: "html", text: "<b>texto</b>" },
    { format: "rich", blocks: [{ kind: "html", html: "<script>1</script>" }] },
    { ...richParagraphData, languageTag: "pt_BR" },
    { format: "rich", blocks: [{ kind: "paragraph", inlines: [{ kind: "text", text: "`crase aberta" }] }] },
    { format: "rich", blocks: [{ kind: "paragraph", inlines: [{ kind: "ruby", base: "学", reading: " " }] }] },
    { format: "rich", blocks: [{ ...richParagraphData.blocks[1], expression: { type: "identifier", value: "<img src=x onerror=alert(1)>" } }] },
    { format: "rich", blocks: [{ ...richParagraphData.blocks[1], accessibleText: " " }] },
    { format: "rich", blocks: [{ ...richParagraphData.blocks[1], expression: { type: "fraction", numerator: { type: "number", value: "1" } } }] },
    { format: "rich", blocks: [{ kind: "paragraph", inlines: [{ kind: "text", text: "a".repeat(7000) }, { kind: "text", text: "b".repeat(7000) }] }] },
    { format: "rich", blocks: Array.from({ length: 129 }, () => ({ kind: "paragraph", inlines: [{ kind: "text", text: "A" }] })) }
  ];
  for (const data of invalidData) {
    assert.equal(registry.validateInstance(instanceWith(data), "content").valid, false);
    assert.throws(() => registry.normalizeInstance(instanceWith(data), "content"), TypeError);
  }
});

test("edição textual altera prosa e leitura ruby sem modificar AST, identidade ou disposição", () => {
  const targetId = "content:rich-explanation";
  const paths = listManualStudyUnitEditablePaths(richParagraphStudyUnit, targetId).map(({ path }) => path);
  assert.ok(paths.includes("blocks[0].inlines[0].text"));
  assert.ok(paths.includes("blocks[2].inlines[0].base"));
  assert.ok(paths.includes("blocks[2].inlines[0].reading"));
  assert.ok(paths.every((path) => !path.includes("expression") && !path.includes("accessibleText")));
  const edited = applyManualStudyUnitEdit(richParagraphStudyUnit, targetId, { pathValues: {
    "blocks[0].inlines[0].text": "A razão expressa a comparação. Em ",
    "blocks[2].inlines[0].reading": "xué xí",
    "blocks[1].expression": "quebrar estrutura"
  } });
  assert.equal(edited.content[0].data.blocks[0].inlines[0].text, "A razão expressa a comparação. Em ");
  assert.equal(edited.content[0].data.blocks[2].inlines[0].reading, "xué xí");
  assert.deepEqual(edited.content[0].data.blocks[1], richParagraphData.blocks[1]);
  assert.equal(edited.content[0].version, "1.0.0");
  assert.deepEqual(richParagraphStudyUnit.content[0].data, richParagraphData);
});

test("prática em trecho rico usa o mesmo marcador e preserva a matemática adjacente", () => {
  const unit = structuredClone(richParagraphStudyUnit);
  unit.role = "practice";
  unit.response = { id: "rich-response", package: "aralearn.response.gap", version: "1.0.0", data: {
    prompt: "Complete a palavra que nomeia a comparação.",
    blanks: [{ id: "ratio", targetInstanceId: "rich-explanation", targetPath: "blocks[0].inlines[0].text", answer: "razão", responseMode: "text" }]
  } };
  assert.deepEqual(registry.validateStudyUnitRelations(unit), []);
  const html = renderPackageStudyUnitBlocks(unit);
  assert.match(html, /data-complete-blank-index="0"/u);
  assert.match(html, /<math display="inline"/u);
  assert.match(html, /<ruby[^>]*>学习/u);
});
