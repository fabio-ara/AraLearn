import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import {
  applyManualStudyUnitEdit,
  buildManualStudyUnitEditModel,
  listManualStudyUnitEditablePaths,
  listManualStudyUnitTargetIds
} from "../../src/ui/manualStudyUnitEdit.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));
const sourceStudyUnit = fixture.courses[0].modules[0].lessons[0]
  .microsequences[0].studyUnits[0];

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
