import assert from "node:assert/strict";
import test from "node:test";

import { ArtifactGarbageCollector } from "../../supabase/functions/_shared/aralearn-authoring/artifactGarbageCollector.js";

test("coletor v4 reivindica tombstone, apaga objeto e conclui sem RPC de execução antiga", async () => {
  const calls = [];
  const collector = new ArtifactGarbageCollector({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: `sb_secret_${"a".repeat(40)}`,
    batchSize: 25,
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "claim_unreferenced_artifacts_v4") {
        return [{
          hash: "a".repeat(64),
          bucket: "aralearn-authoring-artifacts",
          objectKey: "sha256/aa/object.json"
        }];
      }
      if (name === "complete_artifact_gc_v4") return { completed: true };
      assert.fail(`RPC inesperada: ${name}`);
    },
    fetchImpl: async (url, init) => {
      assert.equal(
        url,
        "https://project.supabase.co/storage/v1/object/aralearn-authoring-artifacts/sha256/aa/object.json"
      );
      assert.equal(init.method, "DELETE");
      return new Response(null, { status: 200 });
    }
  });

  const result = await collector.collect();
  assert.deepEqual(result, {
    status: "completed",
    claimed: 1,
    deleted: 1
  });
  assert.deepEqual(calls.map(({ name }) => name), [
    "claim_unreferenced_artifacts_v4",
    "complete_artifact_gc_v4"
  ]);
});
