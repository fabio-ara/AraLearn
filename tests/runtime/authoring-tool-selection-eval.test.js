import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  AUTHORING_PROTOCOL_V1_TOOLS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringActionProjectionV1.js";
import {
  projectChatGptActionTransportTools,
  projectAuthoringProtocolToolsForActions
} from "../../scripts/projectChatGptActionSchemas.mjs";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/authoring-tool-selection-eval.json",
  import.meta.url
), "utf8"));
const toolsBySurface = {
  actions: new Map(projectChatGptActionTransportTools(
    projectAuthoringProtocolToolsForActions(AUTHORING_PROTOCOL_V1_TOOLS),
    AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
  ).map((tool) => [tool.name, tool])),
  mcp: new Map(AUTHORING_PROTOCOL_V1_TOOLS.map((tool) => [tool.name, tool]))
};

function schemaContainsLiteral(root, property, expected) {
  let found = false;
  function visit(value) {
    if (found || !value || typeof value !== "object") return;
    const schema = value.properties?.[property];
    if (schema?.const === expected || schema?.enum?.includes(expected)) {
      found = true;
      return;
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      visit(child);
    }
  }
  visit(root);
  return found;
}

test("guarda estrutural publica as rotas esperadas para oito intenções", () => {
  assert.equal(fixture.format, "aralearn.authoring-tool-selection-eval.v1");
  assert.equal(fixture.cases.length, 8);
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, 8);

  for (const scenario of fixture.cases) {
    assert.ok(scenario.prompt.length >= 40, `${scenario.id}: prompt realista ausente`);
    for (const surface of ["actions", "mcp"]) {
      const expectation = scenario[surface];
      const tool = toolsBySurface[surface].get(expectation.tool);
      assert.ok(tool, `${scenario.id}/${surface}: ferramenta não publicada`);
      for (const [property, literal] of Object.entries(expectation.selectors || {})) {
        const schemaProperty = property === "materializationOperation"
          ? "operation"
          : property;
        assert.equal(
          schemaContainsLiteral(tool.inputSchema, schemaProperty, literal),
          true,
          `${scenario.id}/${surface}: ${property}=${literal} não pertence ao contrato`
        );
      }
      if (expectation.fileField) {
        assert.ok(
          tool.inputSchema.properties?.[expectation.fileField],
          `${scenario.id}/${surface}: parâmetro de arquivo ausente`
        );
      }
    }
  }
});

test("fixture estrutural registra a política de identidades das criações", () => {
  const creations = fixture.cases.filter(({ actions, mcp }) =>
    actions.generatedIdentityFields?.length || mcp.generatedIdentityFields?.length
  );
  assert.ok(creations.length >= 3);
  for (const scenario of creations) {
    for (const surface of ["actions", "mcp"]) {
      assert.ok(
        scenario[surface].generatedIdentityFields?.length,
        `${scenario.id}/${surface}: política de identidade não registrada`
      );
    }
  }
});
