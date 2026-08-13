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

function auditedPracticeCard() {
  return {
    id: "catalog-audit-card",
    position: 1,
    title: "Leitura de tendência",
    role: "practice",
    content: [exampleInstance("aralearn.resource.chart", "content", "chart-content")],
    response: exampleInstance("aralearn.response.choice", "response", "choice-response"),
    feedback: [exampleInstance("aralearn.resource.paragraph", "feedback", "feedback-text")],
    topics: ["tendência"],
    sources: []
  };
}

test("catálogo organiza todo package em sete famílias canônicas e facetas controladas", () => {
  const manifests = RESOURCE_PACKAGE_REGISTRY.listCatalog();
  const explored = RESOURCE_CATALOG.explore();
  assert.equal(RESOURCE_CATALOG.families.length, 7);
  assert.deepEqual(RESOURCE_CATALOG.families, RESOURCE_FAMILIES);
  assert.equal(explored.packageCount, manifests.length);
  assert.equal(explored.policy.contract, "aralearn.resource-selection-policy.v1");
  assert.match(explored.policy.theoryDensity, /um avanço conceitual por card/u);
  assert.equal(explored.families.length, 7);
  explored.families.forEach(({ count }) => assert.ok(count > 0));

  const allowed = {
    familyIds: new Set(RESOURCE_FAMILIES.map(({ id }) => id)),
    disciplineIds: new Set(RESOURCE_VOCABULARIES.disciplines.map(({ id }) => id)),
    structureIds: new Set(RESOURCE_VOCABULARIES.structures.map(({ id }) => id)),
    operationIds: new Set(RESOURCE_VOCABULARIES.operations.map(({ id }) => id)),
    practiceModeIds: new Set(RESOURCE_VOCABULARIES.practiceModes.map(({ id }) => id))
  };
  manifests.forEach((manifest) => {
    const profile = RESOURCE_CATALOG.getProfile(manifest.id, manifest.version);
    assert.ok(profile, manifest.id);
    assert.ok(manifest.academic.taxonomy.operationIds.length, manifest.id);
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
    operationIds: ["operation.trace"]
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

test("inspeção e contratos em lote mantêm limites e ausência item a item", () => {
  const inspected = RESOURCE_CATALOG.inspect([
    { packageId: "aralearn.resource.chart" },
    { packageId: "aralearn.resource.inexistente" }
  ]);
  assert.equal(inspected.items[0].status, "ok");
  assert.equal(inspected.items[1].status, "not_found");

  const contracts = RESOURCE_CATALOG.contracts([
    { packageId: "aralearn.resource.paragraph" },
    { packageId: "aralearn.resource.chart" },
    { packageId: "aralearn.response.choice" },
    { packageId: "aralearn.resource.inexistente" }
  ]);
  assert.equal(contracts.items.length, 4);
  assert.equal(contracts.items[0].definition.schema.type, "object");
  assert.equal(contracts.items[3].status, "not_found");
  assert.throws(() => RESOURCE_CATALOG.contracts([
    "aralearn.resource.paragraph",
    "aralearn.resource.chart",
    "aralearn.response.choice",
    "aralearn.response.gap",
    "aralearn.response.ordering"
  ]), /entre 1 e 4/u);
});

test("validação e auditoria separam conteúdo, resposta e feedback sem simular prévia", () => {
  const card = auditedPracticeCard();
  const validation = RESOURCE_CATALOG.validateCard(card);
  assert.equal(validation.valid, true, validation.errors.join(" "));
  assert.deepEqual(validation.composition.map(({ slot }) => slot), [
    "content", "response", "feedback"
  ]);

  const audit = RESOURCE_CATALOG.auditRepresentation({
    card,
    intent: {
      query: "gráfico estatístico de tendência",
      disciplineIds: ["discipline.statistics"],
      structureIds: ["structure.quantitative_series"],
      operationIds: ["operation.compare"],
      practiceModeIds: ["practice.selection"]
    }
  });
  assert.equal(audit.structural.valid, true);
  assert.equal(audit.overallFit, "canonical");
  assert.deepEqual(audit.selections.map(({ basis }) => basis), [
    "semantic_fit", "response_affordance", "feedback_legibility"
  ]);
  assert.ok(audit.accessibleText);
  assert.deepEqual(audit.visualPreview, {
    rendered: false,
    reason: "A auditoria do catálogo não executa layout, hidratação nem captura visual."
  });

  const preview = RESOURCE_CATALOG.previewDescriptor(card);
  assert.equal(preview.rendered, false);
  assert.equal(preview.structural.valid, true);
  assert.match(preview.reason, /renderer do aplicativo/u);
});

test("auditoria nunca aprova semanticamente um card estruturalmente inválido", () => {
  const card = auditedPracticeCard();
  card.content[0].data = {};
  const audit = RESOURCE_CATALOG.auditRepresentation({
    card,
    intent: {
      structureIds: ["structure.quantitative_series"],
      operationIds: ["operation.compare"]
    }
  });
  assert.equal(audit.structural.valid, false);
  assert.equal(audit.overallFit, "substitute");
  assert.equal(audit.selections[0].fit, "substitute");
  assert.ok(audit.selections[0].missing.includes("contract:content"));
  assert.match(audit.warnings[0], /estruturalmente inválido/u);
});
