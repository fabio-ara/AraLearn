import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RESOURCE_PACKAGE_DEFINITIONS, RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

const styles = fs.readFileSync(new URL("../../public/styles.css", import.meta.url), "utf8").replace(/\r\n?/gu, "\n");
const tokens = fs.readFileSync(new URL("../../public/styles-tokens.css", import.meta.url), "utf8").replace(/\r\n?/gu, "\n");
const references = fs.readFileSync(new URL("../../public/study-references.css", import.meta.url), "utf8");
const graphvizPackageSources = [
  "../../src/resources/packages/graph/index.js",
  "../../src/resources/packages/software-system-context/index.js",
  "../../src/resources/packages/software-container/index.js",
  "../../src/resources/packages/system-internal-block/index.js"
].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assertUsesType(selector, token) {
  assert.match(
    styles,
    new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*font-size:\\s*var\\(--type-${token}\\)`, "u"),
    `${selector} precisa usar --type-${token}`
  );
}

test("conteúdo primário dos resources compartilha a escala tipográfica do texto explicado", () => {
  for (const selector of [
    ".multiple-choice-option",
    ".runtime-ordering-value",
    ".package-er-entity-content",
    ".package-relational-table",
    ".package-set-name",
    ".runtime-matrix-item",
    ".package-math-graph-label-content",
    ".package-chart-legend",
    ".package-plane-legend",
    ".package-formula math",
    ".package-reaction-equation",
    ".package-flow-node"
  ]) assertUsesType(selector, "base");

  assert.doesNotMatch(styles, /\.package-formula math\s*\{[^}]*font-size:\s*clamp/gu);
});

test("prosa e estruturas densas usam degraus próprios e opções preservam leitura e toque", () => {
  assert.match(tokens, /--type-prose:\s*0\.96875rem;/u);
  assert.match(tokens, /--leading-prose:\s*1\.5;/u);
  assert.match(tokens, /--type-dense:\s*0\.9375rem;/u);
  assert.match(tokens, /--leading-dense:\s*1\.44;/u);
  assert.match(tokens, /--type-diagram:\s*16px;/u);
  assert.match(tokens, /--type-diagram-secondary:\s*14\.5px;/u);
  assert.match(tokens, /--type-diagram-detail:\s*13\.5px;/u);

  assertUsesType(".card-sheet-content", "prose");
  assertUsesType(".runtime-annotated-text-source", "prose");
  assert.match(styles, /\.runtime-flow-prompt\s*\{[^}]*padding:\s*6px;[^}]*gap:\s*4px/u);
  assert.match(styles, /\.token-options\s*\{[^}]*gap:\s*4px/u);
  assert.match(styles, /\.token-option\s*\{[^}]*min-height:\s*44px/u);
  assert.match(styles, /\.token-option\s*\{[^}]*min-width:\s*44px/u);
  assertUsesType(".token-option", "base");
  assert.match(styles, /\.token-option\s*\{[^}]*font-weight:\s*400/u);
  assert.match(styles, /\.token-option\s*\{[^}]*line-height:\s*var\(--leading-normal\)/u);
  assert.match(styles, /\.token-option\s*\{[^}]*overflow-wrap:\s*anywhere/u);

  for (const selector of [
    ".runtime-code-block pre",
    ".package-terminal-session pre",
    ".package-packet-legend li",
    ".runtime-table th,\n.runtime-table td"
  ]) assertUsesType(selector, "dense");

  assert.match(styles, /\.card-sheet-content\s*\{[^}]*line-height:\s*var\(--leading-prose\)/u);
  assert.match(styles, /\.runtime-table th,\n\.runtime-table td\s*\{[^}]*line-height:\s*var\(--leading-dense\)/u);
  assert.match(styles, /\.runtime-text-gap-blank\s*\{[^}]*font-size:\s*var\(--type-base\)/u);
  assertUsesType(".package-system-diagram-node-content", "diagram");
  assert.match(styles, /\.package-system-diagram-node-label \.runtime-text-gap-blank,[^{]*\{[^}]*font-size:\s*var\(--type-diagram\)/u);
  assert.match(styles, /\.runtime-markdown-paragraph \+ \.runtime-markdown-paragraph,[^{]*\{[^}]*margin-top:\s*8px/u);
});

test("metadados acadêmicos compactos usam apenas os degraus tipográficos secundários", () => {
  for (const selector of [
    ".package-reaction-state",
    ".package-flow-edge-label",
    ".runtime-interlinear-abbreviations"
  ]) assertUsesType(selector, "sm");

  assert.doesNotMatch(styles, /--resource-svg-label-size/u, "Vega deriva a tipografia interna sem token SVG artesanal");
});

test("Graphviz calcula caixas e trajetórias com a mesma tipografia que permanece na renderização", () => {
  assert.doesNotMatch(
    styles,
    /\.package-(?:math-graph|system-diagram)-svg\s+text\s*\{[^}]*(?:font-size|font-family)\s*:/u,
    "CSS não pode trocar a métrica tipográfica depois que o Graphviz calcula a geometria"
  );
  for (const source of graphvizPackageSources) {
    assert.match(source, /fontname=\\"Arial\\"/u);
    assert.match(source, /edge \[fontname=\\"Arial\\", fontsize=\\"1[34]\\"/u);
  }
});

test("inventário tipográfico cobre exatamente o catálogo instalado, sem diretórios auxiliares", () => {
  const documentation = fs.readFileSync(new URL("../../docs/componentes-didaticos.md", import.meta.url), "utf8");
  const documented = [...documentation.matchAll(/^\| `(aralearn\.(?:resource|response)\.[a-z_]+)` \|/gmu)].map((match) => match[1]);
  const installed = RESOURCE_PACKAGE_DEFINITIONS.map(({ manifest }) => manifest.id);
  assert.equal(new Set(documented).size, documented.length);
  assert.deepEqual(documented.sort(), installed.sort());
  assert.equal(installed.length, 38);
  assert.equal(RESOURCE_PACKAGE_DEFINITIONS.filter(({ manifest }) => manifest.slots.includes("response")).length, 4);
});

function themeTokens(dark) {
  const declarations = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/gu)].map((match) => [match[1], match[2].trim()]));
  const values = { ...declarations(tokens.match(/:root\s*\{([^}]+)\}/u)[1]),
    ...(dark ? declarations(tokens.match(/:root\[data-color-mode="dark"\]\s*\{([^}]+)\}/u)[1]) : {}) };
  return (name) => {
    const seen = new Set();
    while (values[name]?.startsWith("var(")) {
      assert.ok(!seen.has(name), `Ciclo no token ${name}`);
      seen.add(name);
      name = values[name].slice(4, -1);
    }
    assert.match(values[name] || "", /^#[\da-f]{6}$/iu, `Cor concreta de ${name}`);
    return values[name];
  };
}

function contrastRatio(first, second) {
  const luminance = (hex) => hex.slice(1).match(/../gu).map((pair) => Number.parseInt(pair, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("leitura e apoio mantêm contraste AA nos fundos reais de cards, ferramentas e opções", () => {
  for (const dark of [false, true]) {
    const resolve = themeTokens(dark);
    for (const foreground of ["--resource-text", "--resource-text-secondary"]) {
      for (const background of ["--surface-canvas", "--resource-surface", "--resource-surface-subtle", "--resource-surface-sunken",
        "--resource-accent-subtle", "--resource-correct-subtle", "--resource-error-subtle", "--resource-warning-subtle"]) {
        const ratio = contrastRatio(resolve(foreground), resolve(background));
        assert.ok(ratio >= 4.5, `${dark ? "escuro" : "claro"}: ${foreground}/${background} = ${ratio}`);
      }
    }
  }
  assert.match(styles, /\.card-sheet-content\s*\{[^}]*color:\s*var\(--resource-text\)/u);
  assert.match(styles, /\.multiple-choice-option\s*\{[^}]*color:\s*var\(--resource-text\)/u);
  assert.match(references, /\.study-explanation-body\s*\{[^}]*color:\s*var\(--resource-text\)/u);
  assert.match(references, /\.study-citation-reference\s*\{[^}]*color:\s*var\(--resource-text\)/u);
});

test("convenções de código, títulos, notação matemática e texto ampliável permanecem na origem comum", () => {
  assert.match(tokens, /--font-mono:[^;]*monospace;/u);
  for (const selector of [".runtime-code-block pre", ".package-terminal-session pre", ".multiple-choice-code", ".package-packet-row-offset"]) {
    assert.match(styles, new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*font-family:\\s*var\\(--font-mono\\)`, "u"));
  }
  assert.doesNotMatch(styles, /font-family:\s*"Cascadia/u, "A família mono deve ter uma origem");
  assert.match(styles, /\.runtime-card-title\s*\{[^}]*font-variant-caps:\s*normal;[^}]*text-transform:\s*none;/u);
  assert.doesNotMatch(styles, /\.package-(?:rich-math|formula) math\s*\{[^}]*font-family:/u);
  assert.doesNotMatch(styles, /--type-small/u, "Ferramentas precisam usar um degrau existente");
  for (const name of ["prose", "dense", "base", "sm", "xs"]) assert.match(tokens, new RegExp(`--type-${name}:\\s*[\\d.]+rem;`, "u"));
});

function renderValidated(packageId, data) {
  const value = { id: "typography-extreme", package: packageId, version: "1.0.0", data };
  const result = RESOURCE_PACKAGE_REGISTRY.validateInstance(value, "content");
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  return RESOURCE_PACKAGE_REGISTRY.renderInstance(value, "content");
}

test("prosa longa, IPA, CJK, ruby e RTL com matemática conservam escrita e direção", () => {
  const long = "Conexões preservam relações, pressupostos e fontes. ".repeat(150);
  const prose = renderValidated("aralearn.resource.paragraph", { text: long, languageTag: "pt-BR" });
  assert.ok(prose.includes(long.trim()));
  const ipa = "[ˈt͡ʃĩː] /ɲ/ /ʁ/";
  const rich = renderValidated("aralearn.resource.paragraph", { format: "rich", languageTag: "ar", textDirection: "rtl", blocks: [
    { kind: "paragraph", inlines: [
      { kind: "text", text: "العلاقة بين العناصر", languageTag: "ar", textDirection: "rtl" },
      { kind: "text", text: ipa, languageTag: "und-fonipa", textDirection: "ltr" },
      { kind: "ruby", base: "漢字", reading: "かんじ", languageTag: "ja", textDirection: "ltr" },
      { kind: "math", notation: "mathematics", accessibleText: "x ao quadrado", expression: { type: "superscript", base: { type: "identifier", value: "x" }, exponent: { type: "number", value: "2" } } }
    ] }
  ] });
  for (const fragment of [ipa, "العلاقة بين العناصر", 'lang="ar" dir="rtl"', 'lang="und-fonipa" dir="ltr"', "漢字", "かんじ", "<ruby", "<rt", "<msup>", 'class="package-rich-math is-inline" dir="ltr"']) {
    assert.ok(rich.includes(fragment), fragment);
  }
});

test("frações, raízes e glosas alinhadas conservam estrutura e alternativa textual", () => {
  const formula = renderValidated("aralearn.resource.formula", { notation: "mathematics", accessibleText: "Raiz da razão entre x e dois.", expression: {
    type: "root", radicand: { type: "fraction", numerator: { type: "identifier", value: "x" }, denominator: { type: "number", value: "2" } }
  } });
  assert.match(formula, /<msqrt><mfrac>/u);
  assert.match(formula, /aria-label="Raiz da razão entre x e dois\."/u);
  const gloss = renderValidated("aralearn.resource.interlinear_gloss", { languageTag: "ar", textDirection: "rtl", units: [
    { id: "one", form: "كِتاب", gloss: "livro" }, { id: "two", form: "t͡ʃĩː", gloss: "som" }
  ], translation: "O livro e o som.", abbreviations: [] });
  assert.match(gloss, /lang="ar" dir="rtl"/u);
  assert.match(gloss, /runtime-interlinear-form">كِتاب<\/span><span class="runtime-interlinear-unit-gloss">livro/u);
  assert.ok(gloss.includes("t͡ʃĩː"));
});
