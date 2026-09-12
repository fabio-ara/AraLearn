import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { renderPackageStudyUnitBlocks } from "../../src/render/renderPackageStudyUnit.js";
import {
  applyManualStudyUnitEdit,
  buildManualStudyUnitEditModel,
  listManualStudyUnitEditablePaths,
  listManualStudyUnitTargetIds,
  serializeManualEditableNode
} from "../../src/ui/manualStudyUnitEdit.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));
const sourceStudyUnit = fixture.courses[0].modules[0].lessons[0]
  .microsequences[0].studyUnits[0];

test("serialização de edição preserva notação e exclui somente os marcadores transitórios de citação", () => {
  const text = data => ({ nodeType: 3, data });
  const element = (tagName, children, dataset = {}) => ({ nodeType: 1, tagName, childNodes: children, dataset });
  const field = element("SPAN", [text("Use /ʃ/ e "), element("STRONG", [text("quadro"),
    element("SPAN", [element("BUTTON", [text("1")])], { sourceMarkerPlacement: "true" })]),
  text(" para 中文 e العربية; fonte 2 continua sendo conteúdo.")]);
  assert.equal(serializeManualEditableNode(field), "Use /ʃ/ e **quadro** para 中文 e العربية; fonte 2 continua sendo conteúdo.");
});

test("seleção para edição é neutra e preserva parágrafo e ferramenta válidos", () => {
  const unit = structuredClone(sourceStudyUnit);
  unit.content.push({ id: "calculator", package: "aralearn.resource.calculator", version: "1.0.0",
    data: { title: "Verificação numérica", angleUnit: "radians", initialExpression: "2+3" } });
  const targets = listManualStudyUnitTargetIds(unit);
  const selected = renderPackageStudyUnitBlocks(unit, { resourceSelectionEnabled: true,
    resourceSelectionTargetIds: targets, selectedResourceTargetIds: ["content:calculator"] });
  assert.match(selected, /Selecionar recurso para edição/u);
  assert.match(selected, /Retirar recurso da seleção/u);
  assert.doesNotMatch(selected, /reparo/u);
  assert.match(selected, /data-calculator-input/u);
  const inline = renderPackageStudyUnitBlocks(unit, { resourceSelectionEnabled: true,
    resourceSelectionTargetIds: targets, selectedResourceTargetIds: ["content:calculator"],
    manualEditingTargetId: "content:calculator" });
  assert.match(inline, /data-manual-target-id="content:calculator"/u);
  assert.match(inline, /data-package-manual-targets=/u);
  assert.match(inline, /data-package-manual-field-path="title"/u);
  assert.doesNotMatch(inline, /data-resource-target-id="content:calculator"/u);
  assert.match(inline, /Verificação numérica/u);
  assert.match(inline, /aralearn.resource.paragraph/u);
});

test("ferramentas renderizam cada folha declarada para edição sem interpretar texto literal", () => {
  for (const packageName of ["calculator", "grammar", "dictionary", "reading", "audio"]) {
    const definition = RESOURCE_PACKAGE_REGISTRY.get(`aralearn.resource.${packageName}`, "1.0.0");
    const instance = { id: "tool", package: definition.manifest.id, version: "1.0.0",
      data: structuredClone(definition.authoringContract.example) };
    const unit = { id: "literal-tool", position: 1, title: "Ferramenta sintética", role: "theory",
      content: [instance], response: null, feedback: [], topics: [] };
    const targetId = "content:tool";
    const html = renderPackageStudyUnitBlocks(unit, { resourceSelectionEnabled: true,
      resourceSelectionTargetIds: [targetId], selectedResourceTargetIds: [targetId], manualEditingTargetId: targetId });
    for (const { path } of listManualStudyUnitEditablePaths(unit, targetId)) {
      assert.ok(html.includes(`data-package-manual-field-path="${encodeURIComponent(path)}"`), `${packageName}: ${path}`);
    }
    const first = listManualStudyUnitEditablePaths(unit, targetId)[0];
    const changed = applyManualStudyUnitEdit(unit, targetId, { pathValues: { [first.path]: "Literal <img src=x> **sem formato**" } });
    const rendered = renderPackageStudyUnitBlocks(changed);
    assert.match(rendered, /Literal &lt;img src=x&gt; \*\*sem formato\*\*/u);
    assert.doesNotMatch(rendered, /<img src=x>|<strong>sem formato/u);
    assert.doesNotMatch(JSON.stringify(changed), /data-package-manual|\uE002|\uE003/u);
  }
});

test("edição manual usa a identidade da instância e preserva o envelope atual", () => {
  const targetId = `content:${sourceStudyUnit.content[0].id}`;
  assert.deepEqual(
    listManualStudyUnitEditablePaths(sourceStudyUnit, targetId).map(({ path }) => path),
    ["text"]
  );
  assert.equal(
    buildManualStudyUnitEditModel(sourceStudyUnit, targetId).targetKind,
    "aralearn.resource.paragraph"
  );
  const edited = applyManualStudyUnitEdit(sourceStudyUnit, targetId, {
    pathValues: { text: "A conjunção exige duas proposições verdadeiras." }
  });
  assert.equal(edited.content[0].data.text,
    "A conjunção exige duas proposições verdadeiras.");
  assert.equal(edited.content[0].id, sourceStudyUnit.content[0].id);
  assert.equal(edited.content[0].package, sourceStudyUnit.content[0].package);
  assert.notEqual(edited, sourceStudyUnit);
  assert.notEqual(edited.content[0], sourceStudyUnit.content[0]);
});

test("título e feedback são editáveis sem expor identidade ou estrutura", () => {
  const titled = applyManualStudyUnitEdit(sourceStudyUnit, "study_unit", {
    pathValues: { title: "Conjunção lógica", id: "outra", position: "9" }
  });
  assert.equal(titled.title, "Conjunção lógica");
  assert.equal(titled.id, sourceStudyUnit.id);
  assert.equal(titled.position, sourceStudyUnit.position);

  const feedbackId = `feedback:${sourceStudyUnit.feedback[0].id}`;
  const edited = applyManualStudyUnitEdit(sourceStudyUnit, feedbackId, {
    pathValues: { text: "Se uma for falsa, o resultado será falso." }
  });
  assert.equal(edited.feedback[0].data.text,
    "Se uma for falsa, o resultado será falso.");
  assert.equal(edited.feedback[0].version, "1.0.0");
});

test("edição recusa envelope inválido e aceita no-op sem alterar o original", () => {
  assert.throws(() => applyManualStudyUnitEdit(sourceStudyUnit, "study_unit", {
    pathValues: { title: "" }
  }), /unidade de estudo incompleta ou inválida/u);
  const targetId = `content:${sourceStudyUnit.content[0].id}`;
  const noOp = applyManualStudyUnitEdit(sourceStudyUnit, targetId, {
    pathValues: { text: sourceStudyUnit.content[0].data.text }
  });
  assert.deepEqual(noOp, sourceStudyUnit);
});

test("edição textual reconcilia a resposta praticada sem editor paralelo", () => {
  const unit = {
    id: "manual-practice",
    position: 1,
    title: "Prática",
    role: "practice",
    content: [{
      id: "body",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Use DNS aqui." }
    }],
    response: {
      id: "answer",
      package: "aralearn.response.gap",
      version: "1.0.0",
      data: {
        blanks: [{
          id: "protocol",
          targetInstanceId: "body",
          targetPath: "text:protocol",
          responseMode: "choice",
          answer: "DNS",
          acceptedAnswers: ["Domain Name System"],
          distractors: ["TCP"]
        }]
      }
    },
    feedback: [],
    topics: []
  };
  const edited = applyManualStudyUnitEdit(unit, "content:body", {
    pathValues: { text: "Use TCP aqui." }
  });
  assert.equal(edited.content[0].data.text, "Use TCP aqui.");
  assert.equal(edited.response.data.blanks[0].answer, "TCP");
  assert.equal(edited.response.data.blanks[0].acceptedAnswers, undefined);
  assert.deepEqual(edited.response.data.blanks[0].distractors, ["DNS"]);
});

test("editar alternativas da lacuna preserva identidades e reconcilia apenas a ocorrência da resposta", () => {
  const unit = {
    id: "answer-options", position: 1, title: "Lacunas", role: "practice", topics: [], feedback: [],
    content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "O hipervisor controla a VM. Outro hipervisor também controla a VM." } }],
    response: { id: "response", package: "aralearn.response.gap", version: "1.0.0", data: { blanks: [0, 1].map(index => ({
      id: `blank-${index}`, targetInstanceId: "body", targetPath: `text:blank-${index}`, label: `Lacuna ${index + 1}`,
      responseMode: "choice", answer: "hipervisor", distractors: ["sistema convidado", "distribuição"]
    })) } }
  };
  const changed = applyManualStudyUnitEdit(unit, "response:response", { pathValues: {
    "blanks[1].answer": "monitor de máquinas virtuais",
    "blanks[1].label": "Segundo ambiente",
    "blanks[1].distractors[0]": "sistema visitante",
    "blanks[1].targetInstanceId": "not-allowed"
  } });
  assert.equal(changed.content[0].data.text, "O hipervisor controla a VM. Outro monitor de máquinas virtuais também controla a VM.");
  assert.deepEqual(changed.response.data.blanks[0], unit.response.data.blanks[0]);
  assert.equal(changed.response.data.blanks[1].targetInstanceId, "body");
  assert.equal(changed.response.data.blanks[1].id, "blank-1");
  assert.equal(changed.response.data.blanks[1].label, "Segundo ambiente");
  assert.equal(changed.response.data.blanks[1].distractors[0], "sistema visitante");
  assert.equal(unit.content[0].data.text, "O hipervisor controla a VM. Outro hipervisor também controla a VM.");
  assert.throws(() => applyManualStudyUnitEdit(unit, "response:response", { pathValues: {
    "blanks[0].distractors[0]": "hipervisor"
  } }), /incompleta ou inválida/u);
  assert.deepEqual(applyManualStudyUnitEdit(changed, "response:response", { pathValues: {
    "blanks[1].label": "Segundo ambiente"
  } }), changed);
});

test("alternativas editáveis são restritas à autoria e preservam o renderer de Estudo", () => {
  const unit = structuredClone(fixture.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[1]);
  const ordinary = renderPackageStudyUnitBlocks(unit);
  assert.doesNotMatch(ordinary, /runtime-authoring-gap-options|Conferir resposta/u);
  const editable = renderPackageStudyUnitBlocks(unit, { authoringPracticePreview: true, authoringPracticeEditing: true,
    resourceSelectionEnabled: true, manualEditingTargetId: `response:${unit.response.id}` });
  assert.match(editable, /runtime-authoring-gap-options" open/u);
  assert.match(editable, /data-package-manual-field-path="blanks%5B0%5D.answer"/u);
  assert.match(editable, /Resposta correta/u);
});

test("todo package de conteúdo usa o mesmo contrato de folhas textuais", () => {
  const catalog = RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" });
  assert.ok(catalog.length >= 20);
  for (const [index, manifest] of catalog.entries()) {
    const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
      manifest.id,
      manifest.version
    );
    const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
      id: `manual-package-${index + 1}`,
      package: manifest.id,
      version: manifest.version,
      data: contract.contract.example
    }, "content");
    const unit = {
      id: `manual-unit-${index + 1}`,
      position: 1,
      title: manifest.label,
      role: "theory",
      content: [instance],
      response: null,
      feedback: [],
      topics: []
    };
    const targetId = `content:${instance.id}`;
    const fields = listManualStudyUnitEditablePaths(unit, targetId);
    assert.deepEqual(listManualStudyUnitTargetIds(unit), fields.length ? [targetId] : []);
    if (!fields.length) continue;
    const first = fields[0];
    const edited = applyManualStudyUnitEdit(unit, targetId, {
      pathValues: { [first.path]: `${first.value} · edição` }
    });
    assert.notDeepEqual(edited, unit, `${manifest.id} deve aceitar sua folha declarada`);
    assert.equal(instance.package, manifest.id);
  }
});
