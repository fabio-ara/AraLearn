import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { renderStudyToolActions, resolveStudyTools } from "../../src/study/studyTools.js";

const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const authoredTool = (id, name, data) => ({ id, package: `aralearn.resource.${name}`, version: "1.0.0", data });
const unit = (content) => ({ id: "contextual-unit", position: 1, title: "Atividade com cálculo",
  role: "theory", content, response: null, feedback: [], topics: [] });

test("o apoio contextual oferece a calculadora sem bloco escolhido na autoria", () => {
  const studyUnit = unit([paragraph("lead", "Compare a estimativa com o cálculo da máscara de sub-rede.")]);
  assert.deepEqual(resolveStudyTools(studyUnit), [], "A unidade sem ferramenta continua vazia por padrão");
  const tools = resolveStudyTools(studyUnit, RESOURCE_PACKAGE_REGISTRY, true);
  assert.deepEqual(tools.map(({ instance, label, icon }) => [instance.id, instance.package, instance.version, label, icon]),
    [["study-contextual-calculator", "aralearn.resource.calculator", "1.0.0", "Calculadora", "calculator"]]);
  const html = renderStudyToolActions(studyUnit, RESOURCE_PACKAGE_REGISTRY, { compact: true, contextual: true });
  assert.match(html, /data-study-tool-id="study-contextual-calculator"/u);
  assert.match(html, /aria-label="Calculadora"/u);
  assert.equal(renderStudyToolActions(studyUnit, RESOURCE_PACKAGE_REGISTRY, { compact: true }), "",
    "Hosts de inspeção e revisão seguem sem apoio contextual");
});

test("a calculadora contextual não duplica o recurso autoral nem resolve o enunciado", () => {
  const authored = unit([paragraph("lead", "Caso prático."),
    authoredTool("calculator", "calculator", { title: "Conferir a máscara", angleUnit: "radians" })]);
  assert.deepEqual(resolveStudyTools(authored, RESOURCE_PACKAGE_REGISTRY, true).map(({ instance }) => instance.id),
    ["calculator"], "O recurso escolhido na autoria prevalece sem duplicação");

  const [entry] = resolveStudyTools(unit([paragraph("lead", "Caso prático.")]), RESOURCE_PACKAGE_REGISTRY, true);
  assert.equal(RESOURCE_PACKAGE_REGISTRY.validateInstance(entry.instance, "content").valid, true);
  assert.equal(entry.instance.data.initialExpression, undefined, "A ferramenta não extrai nem resolve o enunciado");
  assert.equal(entry.instance.data.prompt, undefined, "A ferramenta não sugere nem transcreve o enunciado");
  const html = RESOURCE_PACKAGE_REGISTRY.renderInstance(entry.instance, "content", { instanceId: entry.instance.id });
  assert.match(html, /data-calculator-input[^>]*value=""/u);
  assert.equal(typeof RESOURCE_PACKAGE_REGISTRY.bindToolInteraction, "function");
});
