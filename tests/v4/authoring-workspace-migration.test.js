import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260729010000_authoring_workspaces_v4.sql",
    import.meta.url
  ),
  "utf8"
);
const engine = fs.readFileSync(
  new URL(
    "../../supabase/functions/_shared/aralearn-authoring/workspaceEngine.js",
    import.meta.url
  ),
  "utf8"
);

test("migração substitui execuções v3 por workspaces e revisões imutáveis", () => {
  for (const table of [
    "private.authoring_workspaces",
    "private.authoring_workspace_revisions",
    "private.authoring_workspace_requests"
  ]) {
    assert.match(migration, new RegExp(`create table ${table.replace(".", "\\.")}`, "u"));
  }
  for (const retired of [
    "private.run_artifacts",
    "private.authoring_parts",
    "private.authoring_requests",
    "private.authoring_runs"
  ]) {
    assert.match(migration, new RegExp(`drop table if exists ${retired.replace(".", "\\.")}`, "u"));
  }
  assert.match(migration, /current_artifact_hash text not null/u);
  assert.match(migration, /primary key\(workspace_id, revision\)/u);
});

test("toda mutação usa compare-and-swap e replay idempotente", () => {
  assert.match(migration, /for update;/u);
  assert.match(migration, /v_workspace\.revision <> p_expected_revision/u);
  assert.match(migration, /replay_authoring_workspace_request_v4/u);
  assert.match(migration, /requestId reutilizado com dados diferentes/u);

  const replayPosition = engine.indexOf("const replayed = await this.#replay");
  const readPosition = engine.indexOf(
    "const current = await this.#workspaceDocument",
    replayPosition
  );
  assert.ok(replayPosition >= 0 && readPosition > replayPosition);
});

test("publicação parcial é privada e o catálogo exige curso completo", () => {
  assert.match(
    migration,
    /p_target = 'catalog' and p_completion_state <> 'complete'/u
  );
  assert.match(
    migration,
    /completion_state in \('partial', 'complete'\)/u
  );
  assert.match(migration, /publish_private_preview/u);
  assert.match(migration, /publish_catalog_complete/u);
});

test("artefatos de workspaces e cursos publicados permanecem alcançáveis pelo GC", () => {
  assert.match(
    migration,
    /private\.authoring_workspace_revisions revision\s+where revision\.artifact_hash = ref\.hash/u
  );
  assert.match(
    migration,
    /private\.course_revisions revision\s+where revision\.artifact_hash = ref\.hash/u
  );
});

test("publicação reutiliza o artefato imutável quando o curso já é o documento do workspace", () => {
  assert.match(
    engine,
    /prepared\.contentHash === control\.artifact\?\.hash\s+\? control\.artifact/u
  );
  assert.match(
    engine,
    /: await this\.artifacts\.putJson\(prepared\.document,[\s\S]+COURSE_REVISION_BUCKET/u
  );
});
