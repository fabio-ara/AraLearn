import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_PACKAGE_REGISTRY as browserRegistry } from "../../src/resources/packages/index.js";
import { RESOURCE_PACKAGE_REGISTRY as edgeRegistry } from "../../supabase/functions/_shared/aralearn/runtime/resources/packages/index.js";
import { routeRequest } from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";

test("browser e Edge derivam catálogo e contrato do mesmo package", () => {
  assert.deepEqual(edgeRegistry.listCatalog(), browserRegistry.listCatalog());
  assert.deepEqual(
    edgeRegistry.getAuthoringContract("aralearn.resource.paragraph", "1.0.0"),
    browserRegistry.getAuthoringContract("aralearn.resource.paragraph", "1.0.0")
  );
});

test("biblioteca de resources não mantém endpoints REST paralelos ao MCP", () => {
  assert.throws(
    () => routeRequest("GET", "/v1/packages"),
    (error) => error?.status === 404 && error?.code === "not_found"
  );
  assert.throws(
    () => routeRequest("GET", "/v1/packages/aralearn.resource.paragraph"),
    (error) => error?.status === 404 && error?.code === "not_found"
  );
});
