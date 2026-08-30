import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  AUTHORING_PROTOCOL_V1_TOOLS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringActionProjectionV1.js";
import { COURSE_MCP_TOOLS } from
  "../../supabase/functions/_shared/aralearn-authoring/courseMcpTools.js";
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
  mcp: new Map(COURSE_MCP_TOOLS.map((tool) => [tool.name, tool]))
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

function findPropertySchema(root, property) {
  if (!root || typeof root !== "object") return null;
  if (root.properties?.[property]) return root.properties[property];
  for (const child of Array.isArray(root) ? root : Object.values(root)) {
    const found = findPropertySchema(child, property);
    if (found) return found;
  }
  return null;
}

test("guarda estrutural publica as rotas esperadas para nove intenções", () => {
  assert.equal(fixture.format, "aralearn.authoring-tool-selection-eval.v1");
  assert.equal(fixture.cases.length, 9);
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, 9);

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
        if (expectation.intentProperty) {
          const sourceIntent = tool.inputSchema.properties?.sourceIntent;
          assert.equal(sourceIntent?.minProperties, 1);
          assert.equal(sourceIntent?.maxProperties, 1);
          assert.ok(
            sourceIntent?.properties?.[expectation.intentProperty],
            `${scenario.id}/${surface}: ${expectation.intentProperty} não pertence ao contrato`
          );
          assert.equal(
            sourceIntent?.properties?.mode,
            undefined,
            `${scenario.id}/${surface}: mode não deve competir com a intenção em Actions`
          );
        }
        const newSource = findPropertySchema(tool.inputSchema, "newSource");
        assert.ok(newSource, `${scenario.id}/${surface}: criação de Fonte ausente`);
        for (const managed of [
          "kind", "origin", "availability", "verificationStatus", "studyVisibility"
        ]) {
          assert.equal(
            newSource.properties?.[managed],
            undefined,
            `${scenario.id}/${surface}: ${managed} não pertence à criação`
          );
        }
      }
    }
  }
});

test("criação natural de Parte usa ferramenta dedicada sem identidade do chamador", () => {
  const scenario = fixture.cases.find(({ id }) => id === "add_part");
  for (const surface of ["actions", "mcp"]) {
    const tool = toolsBySurface[surface].get(scenario[surface].tool);
    assert.ok(tool, `${surface}: add_part não foi publicado`);
    const command = surface === "actions"
      ? tool.inputSchema.properties.planCommand
      : tool.inputSchema;
    assert.equal(Object.hasOwn(command.properties, "id"), false);
    assert.ok(command.properties.title);
    assert.ok(command.properties.intent);
    assert.ok(command.properties.position);
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
