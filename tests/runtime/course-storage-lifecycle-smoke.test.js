import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const smokePath = path.join(
  repositoryRoot,
  "supabase",
  "tests",
  "course-storage-lifecycle-local-smoke.mjs"
);
const source = fs.readFileSync(smokePath, "utf8");

test("#274 prova Storage muta objetos somente pela API e limita o ambiente ao local", () => {
  assert.match(source, /localSupabaseConfiguration\(environment\)/u);
  assert.match(source, /\/storage\/v1/u);
  assert.match(source, /\/object\/sign\/\$\{PDF_BUCKET\}/u);
  assert.match(source, /get_course_source_pdf_download_for_actor_v1/u);
  assert.match(source, /method:\s*"DELETE"/u);
  assert.doesNotMatch(
    source,
    /(?:insert\s+into|update|delete\s+from|truncate|alter\s+table)\s+storage\./iu
  );
  assert.doesNotMatch(source, /\/rest\/v1\/(?:storage\.objects|storage\.buckets)/iu);
});

test("#274 prova os quatro estados e limpa cada fixture mesmo após falha", () => {
  for (const state of ["active", "removed", "reactivated", "orphanCollected"]) {
    assert.match(source, new RegExp(`${state}: true`, "u"));
  }
  assert.match(source, /storageMutationPath:\s*"storage-api"/u);
  assert.match(source, /finally\s*\{/u);
  assert.match(source, /deleteStorageObjects\(config, \[\.\.\.cleanupPaths\]\)/u);
  assert.match(source, /removeLocalUser\(config, userId\)/u);
});

test("#274 órfão é revalidado no banco e só então removido pela Storage API", () => {
  assert.match(source, /get_current_maintenance_for_actor_v1/u);
  assert.match(source, /classification === "pdf_course_missing"/u);
  assert.match(source, /authorize_current_orphan_removal_for_actor_v1/u);
  assert.match(source, /authorization\.authorized, true/u);
  assert.match(source, /deleteStorageObjects\(config, \[authorization\.objectPath\]\)/u);
});
