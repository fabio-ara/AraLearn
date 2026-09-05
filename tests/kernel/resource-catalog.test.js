import assert from "node:assert/strict";
import test from "node:test";

import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";
import {
  RESOURCE_FAMILIES,
  RESOURCE_VOCABULARIES
} from "../../src/resources/catalog/vocabularies.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

function exampleInstance(packageId, slot, id) {
  const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .find(({ id: candidateId }) => candidateId === packageId);
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, manifest.version);
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id,
    package: packageId,
    version: manifest.version,
    data: contract.contract.example
  }, slot);
}

function auditedPracticeStudyUnit() {
  return {
    id: "catalog-audit-card",
    position: 1,
    title: "Leitura de tendência",
    role: "practice",
    content: [exampleInstance("aralearn.resource.chart", "content", "chart-content")],
    response: exampleInstance("aralearn.response.choice", "response", "choice-response"),
    feedback: [exampleInstance("aralearn.resource.paragraph", "feedback", "feedback-text")],
    topics: ["tendência"]
  };
}

test("catálogo organiza todo package em sete famílias canônicas e facetas controladas", () => {
  const manifests = RESOURCE_PACKAGE_REGISTRY.listCatalog();
  const explored = RESOURCE_CATALOG.explore();
  assert.equal(RESOURCE_CATALOG.families.length, 7);
  assert.deepEqual(RESOURCE_CATALOG.families, RESOURCE_FAMILIES);
  assert.equal(explored.packageCount, manifests.length);
  assert.equal(explored.policy.contract, "aralearn.resource-selection-policy.v1");
  assert.match(explored.policy.theoryDensity, /foco conceitual identificável/u);
  assert.equal(explored.families.length, 7);
  explored.families.forEach(({ count }) => assert.ok(count > 0));

  const allowed = {
    familyIds: new Set(RESOURCE_FAMILIES.map(({ id }) => id)),
    disciplineIds: new Set(RESOURCE_VOCABULARIES.disciplines.map(({ id }) => id)),
    structureIds: new Set(RESOURCE_VOCABULARIES.structures.map(({ id }) => id)),
    taskOperationIds: new Set(RESOURCE_VOCABULARIES.taskOperations.map(({ id }) => id)),
    practiceModeIds: new Set(RESOURCE_VOCABULARIES.practiceModes.map(({ id }) => id))
  };
  manifests.forEach((manifest) => {
    const profile = RESOURCE_CATALOG.getProfile(manifest.id, manifest.version);
    assert.ok(profile, manifest.id);
    assert.ok(manifest.academic.taxonomy.taskOperationIds.length, manifest.id);
    assert.equal(profile.familyIds.includes(profile.primaryFamilyId), true, manifest.id);
    for (const [field, ids] of Object.entries(allowed)) {
      assert.equal(profile[field].every((id) => ids.has(id)), true, `${manifest.id}: ${field}`);
    }
  });
});

test("busca distingue uso canônico, versátil e substitutivo sem bloquear", () => {
  const canonical = RESOURCE_CATALOG.search({
    query: "topologia de rede",
    disciplineIds: ["discipline.engineering"],
    structureIds: ["structure.network_topology"],
    taskOperationIds: ["task_operation.trace"]
  });
  assert.equal(canonical.coverage.status, "canonical");
  assert.equal(canonical.coverage.chatDisclosure, null);
  assert.equal(canonical.candidates[0].packageId, "aralearn.resource.network_topology");

  const versatile = RESOURCE_CATALOG.search({
    disciplineIds: ["discipline.language"],
    structureIds: ["structure.hierarchy"]
  });
  assert.equal(versatile.coverage.status, "versatile");
  assert.equal(versatile.candidates[0].packageId, "aralearn.resource.tree");

  const substitute = RESOURCE_CATALOG.search({
    query: "árvore sintática",
    disciplineIds: ["discipline.language"],
    structureIds: ["structure.hierarchy"],
    notationIsLearningObject: true
  });
  assert.equal(substitute.coverage.status, "substitute");
  assert.equal(substitute.candidates[0].packageId, "aralearn.resource.tree");
  assert.match(substitute.coverage.chatDisclosure, /como aproximação/u);
  assert.throws(
    () => RESOURCE_CATALOG.search({ structureIds: ["structure.inexistente"] }),
    /identificador desconhecido/u
  );
});

test("modalidade prática ausente impede classificação canônica", () => {
  const result = RESOURCE_CATALOG.search({
    query: "plano cartesiano",
    structureIds: ["structure.coordinate_space"],
    practiceModeIds: ["practice.typing"]
  });
  const plane = result.candidates.find(({ packageId }) => (
    packageId === "aralearn.resource.plane"
  ));
  assert.ok(plane);
  assert.equal(plane.fit, "substitute");
  assert.ok(plane.missing.includes("practice:practice.typing"));
});

test("faceta operacional explícita prevalece sobre coincidência lexical em contraindicação", () => {
  const result = RESOURCE_CATALOG.search({
    query: "Reconstruir a ordem das etapas de um procedimento.",
    slot: "response",
    studyUnitRole: "practice",
    taskOperationIds: ["task_operation.order"],
    practiceModeIds: ["practice.ordering"]
  });
  assert.equal(result.coverage.status, "canonical");
  assert.equal(result.candidates[0].packageId, "aralearn.response.ordering");
  assert.ok(result.candidates[0].matched.includes("taskOperation:task_operation.order"));
  assert.equal(result.candidates[0].missing.includes("taskOperation:task_operation.transform"), false);
});

test("operação inicial distingue explicação principal de ferramentas auxiliares textuais", () => {
  const result = RESOURCE_CATALOG.search({
    query: "Explicar uma sequência linear de passos sem decisão.",
    structureIds: ["structure.prose"],
    studyUnitRole: "theory",
    slot: "content"
  });
  assert.equal(result.candidates[0].packageId, "aralearn.resource.paragraph");
  assert.equal(result.candidates[0].fit, "canonical");
  assert.ok(result.candidates[0].matched.includes("taskOperation:task_operation.explain"));

  for (const packageId of ["aralearn.resource.dictionary", "aralearn.resource.grammar", "aralearn.resource.reading"]) {
    const profile = RESOURCE_CATALOG.getProfile(packageId, "1.0.0");
    assert.ok(profile, packageId);
    const direct = RESOURCE_CATALOG.search({ query: profile.label, slot: "content" });
    assert.equal(direct.candidates[0].packageId, packageId, profile.label);
  }
});

test("operação omitida não é inventada a partir de negações ou menções internas", () => {
  for (const query of [
    "Não explicar o procedimento.",
    "Sem explicar o procedimento.",
    "Texto de consulta sem calcular resultados.",
    "Dicionário para comparar significados."
  ]) {
    const result = RESOURCE_CATALOG.search({ query, slot: "content" });
    assert.equal(result.candidates.some(({ matched, missing }) => (
      [...matched, ...missing].some((facet) => facet.startsWith("taskOperation:"))
    )), false, query);
  }
});

test("versão do catálogo incorpora perfis, vocabulários e política", () => {
  assert.match(RESOURCE_CATALOG.catalogVersion, /^1-[0-9a-f]{8}$/u);
  const formerIdentityOnlyVersion = (() => {
    let hash = 0x811c9dc5;
    const source = RESOURCE_PACKAGE_REGISTRY.listCatalog()
      .map(({ id, version }) => `${id}@${version}`).sort().join("|");
    for (const character of source) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
    return `1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  })();
  assert.notEqual(RESOURCE_CATALOG.catalogVersion, formerIdentityOnlyVersion);
});

test("inspeção em lote e contrato exato mantêm os limites progressivos", () => {
  const inspected = RESOURCE_CATALOG.inspect([
    { packageId: "aralearn.resource.chart" },
    { packageId: "aralearn.resource.inexistente" }
  ]);
  assert.equal(inspected.items[0].status, "ok");
  assert.equal(inspected.items[1].status, "not_found");

  const contracts = RESOURCE_CATALOG.contracts([
    { packageId: "aralearn.resource.paragraph" }
  ]);
  assert.equal(contracts.items.length, 1);
  assert.deepEqual(contracts.items[0].definition,
    RESOURCE_PACKAGE_REGISTRY.getAuthoringContract("aralearn.resource.paragraph", "1.0.0"));
  assert.throws(() => RESOURCE_CATALOG.contracts([
    "aralearn.resource.paragraph",
    "aralearn.resource.chart"
  ]), /precisa ser 1/u);
});

test("validação separa slots e entrega a prévia ao renderer canônico", () => {
  const studyUnit = auditedPracticeStudyUnit();
  const validation = RESOURCE_CATALOG.validateStudyUnit(studyUnit);
  assert.equal(validation.valid, true, validation.errors.join(" "));
  assert.deepEqual(validation.composition.map(({ slot }) => slot), [
    "content", "response", "feedback"
  ]);

  const preview = RESOURCE_CATALOG.previewStudyUnitDescriptor(studyUnit);
  assert.equal(preview.structural.valid, true);
  assert.equal(preview.previewMode, "client_renderer");
  assert.deepEqual(preview.studyUnit, studyUnit);
  assert.ok(preview.accessibleText);
});
