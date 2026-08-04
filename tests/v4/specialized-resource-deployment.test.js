import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildSpecializedValidationCases,
  REACTION_TYPES,
  SPECIALIZED_RESOURCES,
  SYSTEM_MAP_GROUP_KINDS,
  SYSTEM_MAP_NODE_KINDS
} from "../../scripts/runResourceCorpusValidation.js";

const migration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260729060000_specialized_resources.sql",
    import.meta.url
  ),
  "utf8"
);
const runtimeManifest = JSON.parse(
  fs.readFileSync(
    new URL("../../supabase/runtime-manifest.json", import.meta.url),
    "utf8"
  )
);

test("implantação reconhece os resources especializados sem alterar o contrato v4", () => {
  for (const resource of SPECIALIZED_RESOURCES) {
    assert.match(
      migration,
      new RegExp(
        `alter type public\\.card_resource add value if not exists '${resource}'`,
        "u"
      )
    );
  }
  assert.match(migration, /'schemaRevision', '20260729060000'/u);
  assert.equal(runtimeManifest.schemaRevision, "20260803020000");
  assert.equal(runtimeManifest.contractVersion, 4);
});

test("corpus cobre tipos semânticos de mapa de sistema e reação", () => {
  const cases = buildSpecializedValidationCases();
  const systemMaps = cases.filter((scenario) => scenario.resource === "system_map");
  const reactions = cases.filter((scenario) => scenario.resource === "reaction");

  assert.deepEqual(
    systemMaps.map((scenario) => scenario.groupKind),
    [...SYSTEM_MAP_GROUP_KINDS]
  );
  assert.deepEqual(
    systemMaps.map((scenario) => scenario.nodeKind),
    [...SYSTEM_MAP_NODE_KINDS]
  );
  assert.deepEqual(
    reactions.map((scenario) => scenario.reactionType),
    [...REACTION_TYPES]
  );
  assert.ok(systemMaps.every((scenario) =>
    scenario.card.links.length > 0 &&
    scenario.card.highlight.groupIds.length > 0 &&
    scenario.card.highlight.nodeIds.length > 0 &&
    scenario.card.highlight.linkIds.length > 0));
  assert.ok(reactions.every((scenario) =>
    scenario.card.reactants.length > 0 &&
    scenario.card.products.length > 0 &&
    Array.isArray(scenario.card.conditions)));
});
