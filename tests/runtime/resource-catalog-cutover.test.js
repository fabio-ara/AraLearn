import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_CATALOG, RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { COURSE_COMPONENT_CATALOG_VERSION } from "../../src/domain/courseDesignParameters.js";
import { COURSE_COMPONENT_CATALOG_VERSION as edgeVersion } from "../../supabase/functions/_shared/aralearn/runtime/domain/courseDesignParameters.js";

test("catálogo corrente e Edge compartilham fingerprint e não admitem componentes removidos", () => {
  assert.equal(COURSE_COMPONENT_CATALOG_VERSION, edgeVersion);
  assert.equal(RESOURCE_CATALOG.catalogVersion, COURSE_COMPONENT_CATALOG_VERSION);
  for (const id of ["aralearn.response.open", "aralearn.resource.dictionary", "aralearn.resource.grammar", "aralearn.resource.reading"]) {
    assert.equal(RESOURCE_PACKAGE_REGISTRY.get(id, "1.0.0"), null);
    assert.ok(!RESOURCE_PACKAGE_REGISTRY.listCatalog().some(manifest => manifest.id === id));
    assert.throws(() => RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(id, "1.0.0"));
  }
  assert.ok(RESOURCE_PACKAGE_REGISTRY.listCatalog().every(manifest => manifest.authoringEligibility !== "legacy_only"));
});
