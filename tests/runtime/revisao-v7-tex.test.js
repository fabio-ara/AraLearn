import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { accessibleDelimitedTexText, parseTexNotation, validateTexNotation, splitTexDelimitedText } from "../../src/resources/sdk/mathExpression.js";
import { renderPackageInline } from "../../src/resources/sdk/html.js";
import { RESOURCE_PACKAGE_REGISTRY as registry } from "../../src/resources/packages/index.js";
import { readPackageStudyUnitText, renderPackageStudyUnitBlocks } from "../../src/render/renderPackageStudyUnit.js";
import { renderCourseStudyScreen } from "../../src/study/CourseStudyScreen.js";
import { listCourseSourceOccurrenceTargets } from "../../src/domain/courseSourceOccurrences.js";

const instance = (name, data) => ({ id: "representation", package: `aralearn.resource.${name}`, version: "1.0.0", data });
const accepted = [String.raw`\frac{a+b}{c}`, String.raw`\sqrt[3]{x}`, String.raw`x_i^2`,
  String.raw`\left[\frac{x}{2}\right]`, String.raw`\int_0^1 x^2\,dx`,
  String.raw`\frac{\partial u}{\partial x}`, String.raw`\sum_{i=1}^{n}{i^2}`,
  String.raw`\mathrm{H}_2\mathrm{O}`, String.raw`\alpha+\beta\leq\pi`, String.raw`\sin(x)+\cos(y)`];

test("TeX seguro preserva a notação em vez de enviar AST à autoria", () => {
  for (const tex of accepted) {
    assert.equal(validateTexNotation(tex).ok, true, tex);
    const resource = instance("formula", { tex, accessibleText: "Leitura equivalente da fórmula." });
    assert.equal(registry.validateInstance(resource, "content").valid, true, tex);
    assert.match(registry.renderInstance(resource, "content"), /<math/u);
  }
  const contract = registry.getAuthoringContract("aralearn.resource.formula", "1.0.0");
  assert.equal(contract.schema.properties.expression, undefined);
  assert.ok(contract.schema.properties.tex);
  assert.equal(parseTexNotation(String.raw`\left[\frac{x}{2}\right]`).type, "fenced");
  assert.equal(parseTexNotation(String.raw`\frac{\partial u}{\partial x}`).type, "derivative");
});

test("notação inválida ou com semântica não implementada é recusada de forma localizada", () => {
  for (const tex of [String.raw`\left(x\right]`, String.raw`x^2^3`, String.raw`a_i_j`,
    String.raw`\unknown{x}`, String.raw`\input{file}`, String.raw`\href{https://x}{y}`,
    String.raw`\mathbf{x}`, "<script>alert(1)</script>", String.raw`\frac{a}`, "{".repeat(60) + "x" + "}".repeat(60)]) {
    const validation = validateTexNotation(tex);
    assert.equal(validation.ok, false, tex);
    assert.ok(validation.errors[0].message);
  }
  const bad = instance("table", { columns: ["Valor"], rows: [[String.raw`\(\unknown{x}\)`]] });
  assert.match(registry.validateInstance(bad, "content").errors.join(" "), /rows\[0\]\[0\]/u);
});

test("prosa, tabela, feedback e rich usam o mesmo TeX, sem interpretar moeda ou código", () => {
  const value = String.raw`A fração \(\frac{1}{2}\) vale 0,5; R$ 10 e $20 são preços.`;
  assert.equal(splitTexDelimitedText(value).segments.filter(part => part.kind === "math").length, 1);
  const prose = instance("paragraph", { text: value });
  assert.equal(registry.validateInstance(prose, "feedback").valid, true);
  const html = registry.renderInstance(prose, "feedback");
  assert.match(html, /<mfrac>/u);
  assert.match(html, /R\$ 10 e \$20/u);
  assert.doesNotMatch(renderPackageInline("`\\(x\\)`"), /<math/u);
  const rich = instance("paragraph", { format: "rich", blocks: [
    { kind: "paragraph", inlines: [{ kind: "text", text: "A metade é " }, { kind: "math", notation: "mathematics", tex: String.raw`\frac{1}{2}`, accessibleText: "um meio" }] },
    { kind: "math", notation: "chemistry", tex: String.raw`\mathrm{H}_2\mathrm{O}`, accessibleText: "água, H dois O" }
  ] });
  assert.equal(registry.validateInstance(rich, "content").valid, true);
  assert.match(registry.renderInstance(rich, "content"), /display="block"/u);
  assert.equal(listCourseSourceOccurrenceTargets({ content: [rich] }).filter(target => target.path.endsWith("accessibleText")).length, 2);
  const formula = instance("formula", { tex: "x=1", accessibleText: "x igual a um" });
  assert.ok(listCourseSourceOccurrenceTargets({ content: [formula] }).some(target => target.path === "accessibleText"));
});

// D008/D009: a projeção textual reutiliza a verbalização que o aria-label do MathML já
// usa. A fonte canônica citável continua crua; só a leitura projetada muda.
const BS = String.fromCharCode(92);
const TICK = String.fromCharCode(96);
const tex = (source) => BS + source;
const delimited = (source) => tex("(") + source + tex(")");

test("a projeção textual verbaliza TeX delimitado sem tocar literal nem delimitador solto", () => {
  const plain = "Uma explicação sem notação, com R$ 10 e 20% de desconto.";
  assert.equal(accessibleDelimitedTexText(plain), plain, "Texto sem delimitador permanece idêntico.");
  const unbalanced = "Abre " + tex("(") + "x-3 e não fecha.";
  assert.equal(accessibleDelimitedTexText(unbalanced), unbalanced, "Delimitador solto não vira projeção parcial.");
  const literal = "O trecho " + TICK + delimited(tex("frac{1}{2}")) + TICK + " é literal.";
  assert.equal(accessibleDelimitedTexText(literal), "O trecho " + delimited(tex("frac{1}{2}")) + " é literal.",
    "Crase protege o literal; o marcador sai na projeção.");
  assert.equal(accessibleDelimitedTexText(delimited(tex("frac{1}{2}"))), "(1)/(2)");
  assert.equal(accessibleDelimitedTexText("Vale " + delimited("x-3") + " no fim."), "Vale x - 3 no fim.");
});

test("accessibleText verbaliza prosa, tabela e rich e preserva código, terminal e citação", () => {
  const fraction = delimited(tex("frac{1}{2}"));
  const prose = instance("paragraph", { text: "A fração " + fraction + " vale " + delimited("x-3") + ".", languageTag: "pt-BR" });
  assert.equal(registry.validateInstance(prose, "content").valid, true);
  const proseText = registry.accessibleText(prose, "content");
  assert.ok(proseText.includes("A fração (1)/(2) vale x - 3."), proseText);
  assert.equal(proseText.includes(tex("(")), false, proseText);

  const table = instance("table", { columns: ["Valor"], rows: [[fraction]] });
  assert.equal(registry.validateInstance(table, "content").valid, true);
  const tableText = registry.accessibleText(table, "content");
  assert.ok(tableText.includes("(1)/(2)"), tableText);
  assert.equal(tableText.includes(tex("(")), false, tableText);

  const richWithRuby = instance("paragraph", { format: "rich", blocks: [{ kind: "paragraph", inlines: [
    { kind: "ruby", base: "学校", reading: "がっこう", readingLanguageTag: "ja-Kana" },
    { kind: "text", text: " e " + fraction + "." }
  ] }] });
  const richText = registry.accessibleText(richWithRuby, "content");
  assert.ok(richText.includes("学校 (がっこう)"), richText);
  assert.ok(richText.includes("(1)/(2)"), richText);
  assert.equal(richText.includes(tex("(")), false, richText);

  // Notação literal de código e terminal conserva os bytes autorais.
  const code = instance("code", { prompt: "Sem notação.", language: "python", code: "x = " + fraction + "  # literal" });
  assert.ok(registry.accessibleText(code, "content").includes(fraction));
  const terminal = instance("terminal_session", { prompt: "Sessão", environment: "bash", interactions: [{ input: "echo " + fraction, stdout: "ok" }] });
  assert.equal(registry.validateInstance(terminal, "content").valid, true);
  assert.ok(registry.accessibleText(terminal, "content").includes(fraction));

  // A ocorrência citável continua apontando para o texto canônico, com a notação crua.
  const unit = { id: "tex-unit", position: 1, title: "Notação", role: "theory", content: [prose], response: null, feedback: [], topics: [] };
  const [occurrence] = listCourseSourceOccurrenceTargets(unit).filter(target => target.resourceId === "representation");
  assert.ok(occurrence);
  assert.ok(occurrence.text.includes(fraction), occurrence.text);
});

test("literal entre crases não é interpretado e o registry projeta só a matemática legítima", () => {
  const fraction = delimited(tex("frac{1}{2}"));
  const literal = TICK + delimited("x-3") + TICK;
  const prose = instance("paragraph", { text: "Veja " + literal + " e a fração " + fraction + ".", languageTag: "pt-BR" });
  assert.equal(registry.validateInstance(prose, "content").valid, true);
  assert.equal(registry.accessibleText(prose, "content"),
    "Veja " + delimited("x-3") + " e a fração (1)/(2).");

  // Sem notação delimitada, a crase continua sendo apresentação e sai como antes.
  const plain = instance("paragraph", { text: "Use " + TICK + "x" + TICK + " como literal." });
  assert.equal(registry.accessibleText(plain, "content"), "Use x como literal.");

  // Nó text do rich usa a mesma desambiguação, com matemática legítima no mesmo item.
  const rich = instance("paragraph", { format: "rich", blocks: [{ kind: "paragraph", inlines: [
    { kind: "text", text: "O código " + literal + " é literal." },
    { kind: "text", text: " A fração " + fraction + " é um meio." }
  ] }] });
  assert.equal(registry.validateInstance(rich, "content").valid, true);
  assert.equal(registry.accessibleText(rich, "content"),
    "O código " + delimited("x-3") + " é literal. A fração (1)/(2) é um meio.");

  // A citação canônica continua com a autoria integral: crases e notação crua.
  const unit = { id: "literal-unit", position: 1, title: "Literal", role: "theory", content: [prose], response: null, feedback: [], topics: [] };
  const [occurrence] = listCourseSourceOccurrenceTargets(unit).filter(target => target.resourceId === "representation");
  assert.equal(occurrence.text, "Veja " + literal + " e a fração " + fraction + ".");
});

test("mascaramento dentro da fórmula preserva a notação completa em vez de silenciar", () => {
  const marker = "\uE000" + "x" + "\uE001";
  const masked = delimited("x-" + marker);
  assert.equal(accessibleDelimitedTexText(masked), masked);
  const unbalanced = "Abre " + tex("(") + "x-3 e não fecha.";
  assert.equal(accessibleDelimitedTexText(unbalanced), unbalanced);
});

test("resumo de navegação e envelope não expõem TeX cru e o corpo segue MathML", async () => {
  const fraction = delimited(tex("frac{1}{2}"));
  const prose = instance("paragraph", { text: "A fração " + fraction + " vale 0,5.", languageTag: "pt-BR" });
  const unit = { id: "explanation-theory", position: 1, title: "Fração", role: "theory", content: [prose], response: null, feedback: [], topics: [] };

  const envelope = readPackageStudyUnitText(unit);
  assert.ok(envelope.includes("(1)/(2)"), envelope);
  assert.equal(envelope.includes(tex("(")), false, envelope);
  const body = renderPackageStudyUnitBlocks(unit);
  assert.ok(body.includes("<math"), "O corpo precisa renderizar MathML.");
  assert.equal(body.includes(tex("(")), false, "O corpo não expõe a fonte TeX.");

  const project = JSON.parse(await readFile(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  studyUnit.content = [prose];
  const progress = { version: 1, lessons: { [course.id + "::" + moduleValue.id + "::" + lesson.id]: {
    cursorStudyUnitId: studyUnit.id, completedStudyUnitIds: [studyUnit.id] } } };
  const selection = { courseId: course.id, moduleId: moduleValue.id, lessonId: lesson.id,
    microsequenceId: microsequence.id, studyUnitId: studyUnit.id, studyUnitIndex: 0 };
  const common = { project, selection, course, moduleValue, lesson, microsequence, studyUnit, progress, coursePermissionsById: {} };

  const overview = renderCourseStudyScreen({ ...common, view: "microsequence", microsequenceMode: "overview" });
  const subtitles = [...overview.matchAll(/<p class="card-subtitle">([^<]*)<\/p>/gu)].map(match => match[1]);
  const summary = subtitles.find(value => value.includes("fração"));
  assert.ok(summary, "O resumo do card de unidade precisa descrever o conteúdo.");
  assert.ok(summary.includes("(1)/(2)"), summary);
  assert.equal(summary.includes(tex("(")), false, summary);

  const play = renderCourseStudyScreen({ ...common, view: "microsequence", microsequenceMode: "play" });
  assert.ok(play.includes("<math"), "A unidade aberta mantém MathML no corpo.");
  assert.equal(play.includes(tex("(")), false, "A unidade aberta não expõe a fonte TeX.");
});
