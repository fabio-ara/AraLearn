import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { graphvizLayoutAttributes } from "../../src/resources/sdk/graphviz.js";

const GRAPHVIZ_PACKAGE_DIRECTORIES = Object.freeze([
  "bpmn-process",
  "database-schema",
  "entity-relationship",
  "flow",
  "graph",
  "network-topology",
  "relation-map",
  "software-container",
  "software-system-context",
  "state-machine",
  "system-internal-block",
  "tree"
]);

const BLOCK_FLOW_PACKAGES = Object.freeze([
  "aralearn.resource.bpmn_process",
  "aralearn.resource.database_schema",
  "aralearn.resource.entity_relationship",
  "aralearn.resource.flow",
  "aralearn.resource.network_topology",
  "aralearn.resource.software_container",
  "aralearn.resource.software_system_context",
  "aralearn.resource.state_machine",
  "aralearn.resource.tree"
]);

function renderExample(packageId, dataTransform = (data) => data) {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, "1.0.0");
  return RESOURCE_PACKAGE_REGISTRY.renderInstance({
    id: `layout-${packageId}`,
    package: packageId,
    version: "1.0.0",
    data: dataTransform(structuredClone(contract.contract.example))
  }, "content");
}

test("SDK traduz fluxo de leitura em orientação Graphviz sem aceitar rankdir local", () => {
  assert.deepEqual(graphvizLayoutAttributes("block", { pad: "0.2" }), { pad: "0.2", rankdir: "TB" });
  assert.deepEqual(graphvizLayoutAttributes("inline", { pad: "0.2" }), { pad: "0.2", rankdir: "LR" });
  assert.deepEqual(graphvizLayoutAttributes("free", { pad: "0.2" }), { pad: "0.2" });
  assert.throws(() => graphvizLayoutAttributes("diagonal"), /Eixo de leitura Graphviz inválido/u);
  assert.throws(() => graphvizLayoutAttributes("block", { rankdir: "LR" }), /política compartilhada/u);
});

test("packages Graphviz usam uma única política de orientação", () => {
  GRAPHVIZ_PACKAGE_DIRECTORIES.forEach((directory) => {
    const source = fs.readFileSync(
      new URL(`../../src/resources/packages/${directory}/index.js`, import.meta.url),
      "utf8"
    );
    assert.match(source, /graphvizLayoutAttributes\(/u, directory);
    assert.doesNotMatch(source, /\brankdir\b/u, directory);
  });
});

test("diagramas relacionais seguem o fluxo sem transpor notações acadêmicas", () => {
  BLOCK_FLOW_PACKAGES.forEach((packageId) => {
    assert.match(renderExample(packageId), /rankdir=&quot;TB&quot;/u, packageId);
  });

  assert.match(
    renderExample("aralearn.resource.graph", (data) => ({ ...data, layout: "hierarchical" })),
    /rankdir=&quot;TB&quot;/u
  );
  assert.doesNotMatch(renderExample("aralearn.resource.graph"), /rankdir=/u);
  assert.match(renderExample("aralearn.resource.relation_map"), /rankdir=&quot;LR&quot;/u);
  assert.match(renderExample("aralearn.resource.system_internal_block"), /rankdir=&quot;LR&quot;/u);
});
