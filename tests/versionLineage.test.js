import test from "node:test";
import assert from "node:assert/strict";

import { buildVersionLineageLabel, getScopedVersionDisplayId, getVersionDisplayId } from "../src/ui/versionLineage.js";

test("buildVersionLineageLabel mostra apenas a versão quando não há parent", () => {
  assert.equal(buildVersionLineageLabel({ id: "v1" }, []), "v1");
});

test("buildVersionLineageLabel mostra a origem quando o parent existe", () => {
  const versions = [{ id: "v1" }, { id: "v4", parentVersionId: "v1" }];
  assert.equal(buildVersionLineageLabel(versions[1], versions), "v1 → v4");
});

test("getVersionDisplayId usa versionNumber quando id ainda não existe", () => {
  assert.equal(getVersionDisplayId({ versionNumber: 3 }), "v3");
});

test("getScopedVersionDisplayId prioriza numeração pública quando disponível", () => {
  assert.equal(getScopedVersionDisplayId({ versionNumber: 1, publicNumber: 7 }, "L"), "L7");
});
