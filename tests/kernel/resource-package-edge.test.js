import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_PACKAGE_REGISTRY as browserRegistry } from "../../src/resources/packages/index.js";
import { RESOURCE_PACKAGE_REGISTRY as edgeRegistry } from "../../supabase/functions/_shared/aralearn/runtime/resources/packages/index.js";

test("browser e Edge derivam catálogo e contrato do mesmo package", () => {
  assert.deepEqual(edgeRegistry.listCatalog(), browserRegistry.listCatalog());
  assert.deepEqual(
    edgeRegistry.getAuthoringContract("aralearn.resource.paragraph", "1.0.0"),
    browserRegistry.getAuthoringContract("aralearn.resource.paragraph", "1.0.0")
  );
});
