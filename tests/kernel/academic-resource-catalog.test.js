import assert from "node:assert/strict";
import test from "node:test";

import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";

const contentCatalog = RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" });

test("todo resource de conteúdo declara fundamento acadêmico e limites de uso", () => {
  contentCatalog.forEach((manifest) => {
    assert.ok(manifest.academic, manifest.id);
    assert.ok(manifest.academic.domains.length > 0, `${manifest.id}: domains`);
    assert.ok(manifest.academic.knowledgeObjects.length > 0, `${manifest.id}: knowledgeObjects`);
    assert.ok(manifest.academic.conventions.length > 0, `${manifest.id}: conventions`);
    assert.ok(manifest.academic.appropriateWhen.length > 0, `${manifest.id}: appropriateWhen`);
    assert.ok(manifest.academic.avoidWhen.length > 0, `${manifest.id}: avoidWhen`);
    assert.equal(Object.hasOwn(manifest.academic, "admission"), false, `${manifest.id}: policy local duplicada`);
    assert.ok(manifest.academic.practiceModes.includes("exposition"), `${manifest.id}: exposition`);
    assert.ok(manifest.limitations.length > 0, `${manifest.id}: limitations`);
  });
});

test("catálogo não reinstala packages que apenas ornamentavam lista ou tabela", () => {
  const ids = new Set(contentCatalog.map(({ id }) => id));
  assert.equal(ids.has("aralearn.resource.sequence"), false);
  assert.equal(ids.has("aralearn.resource.algorithm_trace"), false);
});

test("contratos de diagramas automáticos descrevem semântica, não geometria", () => {
  const automaticPackages = [
    "aralearn.resource.graph",
    "aralearn.resource.tree",
    "aralearn.resource.flow",
    "aralearn.resource.state_machine",
    "aralearn.resource.network_topology",
    "aralearn.resource.entity_relationship",
    "aralearn.resource.database_schema",
    "aralearn.resource.bpmn_process"
  ];
  automaticPackages.forEach((packageId) => {
    const manifest = contentCatalog.find(({ id }) => id === packageId);
    assert.ok(manifest, packageId);
    const serialized = JSON.stringify(RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, manifest.version));
    assert.doesNotMatch(serialized, /"(?:x|y|width|height|coordinates|position)"\s*:/iu, packageId);
  });
});

test("catálogo mantém separadas intenções que antes competiam por um diagrama genérico", () => {
  const ids = new Set(contentCatalog.map(({ id }) => id));
  [
    "aralearn.resource.graph",
    "aralearn.resource.network_topology",
    "aralearn.resource.entity_relationship",
    "aralearn.resource.database_schema",
    "aralearn.resource.state_machine",
    "aralearn.resource.state_transition_table",
    "aralearn.resource.flow",
    "aralearn.resource.bpmn_process",
    "aralearn.resource.memory_layout",
    "aralearn.resource.call_stack",
    "aralearn.resource.terminal_session"
  ].forEach((id) => assert.ok(ids.has(id), id));
});

test("diagrama de conjuntos distingue Venn de Euler sem receber geometria autoral", () => {
  const packageId = "aralearn.resource.set_diagram";
  const manifest = contentCatalog.find(({ id }) => id === packageId);
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, manifest.version);
  assert.deepEqual(contract.contract.required, ["kind", "sets", "regions"]);
  assert.deepEqual(contract.schema.properties.kind.enum, ["venn", "euler"]);
  assert.doesNotMatch(JSON.stringify(contract), /"(?:x|y|radius|coordinates)"\s*:/iu);
  assert.match(contract.manifest.purpose, /Venn|Euler/u);
  assert.match(RESOURCE_CATALOG.explore().policy.decision, /representação mais simples/u);
  const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: "set-diagram-academic-example",
    package: packageId,
    version: manifest.version,
    data: contract.contract.example
  }, "content");
  const rendered = RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, "content");
  assert.match(rendered, /data-set-diagram=/u);
  assert.match(rendered, /package-set-region-marker|package-set-key/u);
  assert.doesNotMatch(rendered, /package-set-labels/u);
});
