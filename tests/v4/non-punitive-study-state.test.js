import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), "utf8");

test("migração elimina telemetria e fecha um contrato de estado funcional", () => {
  const migration = read(
    "supabase", "migrations", "20260802000000_non_punitive_study_state.sql"
  );
  assert.match(migration, /drop column if exists first_viewed_at/iu);
  assert.match(migration, /drop column if exists attempts/iu);
  assert.match(migration, /drop column if exists last_result/iu);
  assert.match(migration, /drop column if exists last_activity_at/iu);
  assert.match(migration, /add column review_marked_at timestamptz/iu);
  assert.match(migration, /apply_non_punitive_study_state_batch_v1/iu);
  assert.match(migration, /private\.apply_study_path_batch_v1/u);
  assert.match(migration, /drop function public\.apply_sync_batch_without_situated_comments_v1/u);
  assert.match(migration, /updated_at = now\(\)/u);
});

test("migração do estado funcional compila e aceita um lote vazio autenticado", async () => {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function extensions.digest(bytea, text) returns bytea
      language sql immutable as $$ select decode(repeat('00', 32), 'hex') $$;
    create function private.try_uuid(text) returns uuid language plpgsql immutable as $$
      begin return $1::uuid; exception when others then return null; end
    $$;
    create function private.current_personal_row(text, uuid, uuid) returns jsonb
      language sql stable as $$ select '{}'::jsonb $$;
    create function private.local_row(text, jsonb) returns jsonb
      language sql stable as $$ select $2 $$;
    create function private.jsonb_to_camel(jsonb) returns jsonb
      language sql stable as $$ select $1 $$;
    create function private.selection_row(uuid) returns jsonb
      language sql stable as $$ select '{}'::jsonb $$;
    create function public.apply_sync_batch_without_situated_comments_v1(uuid, jsonb)
      returns jsonb language sql as $$ select jsonb_build_object('status', 'applied') $$;
    create table public.courses(
      id uuid primary key, status text, deleted_at timestamptz,
      document_storage_enabled boolean
    );
    create table public.user_course_selections(
      id uuid, user_id uuid, course_id uuid, position integer,
      primary key(user_id, id)
    );
    create table public.lesson_progress(
      id uuid primary key, selection_id uuid, user_id uuid, course_id uuid,
      lesson_id uuid, cursor integer, first_viewed_at timestamptz,
      completed_at timestamptz, last_activity_at timestamptz,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.card_progress(
      id uuid primary key, selection_id uuid, user_id uuid, course_id uuid,
      card_id uuid, first_viewed_at timestamptz, completed_at timestamptz,
      attempts integer, last_result text, last_activity_at timestamptz,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.card_comments(id uuid, selection_id uuid, user_id uuid);
    create table public.study_paths(
      id uuid primary key, owner_id uuid, title text not null, position integer
    );
    create table public.study_path_courses(
      id uuid primary key, path_id uuid, owner_id uuid,
      selection_id uuid, position integer
    );
    create table private.sync_devices(
      id uuid, user_id uuid, last_processed_mutation_sequence bigint default 0,
      last_pulled_sequence bigint default 0, last_seen_at timestamptz,
      inactive_at timestamptz, primary key(user_id, id)
    );
    create table private.sync_idempotency(
      user_id uuid, mutation_id uuid, request_hash text, entity_type text,
      entity_id uuid, operation text, device_id uuid, client_sequence bigint,
      applied_sequence bigint, outcome text default 'applied', error_code text,
      error_message text, primary key(user_id, mutation_id)
    );
    create table private.sync_changes(
      sequence bigint, audience_user_id uuid, entity_type text, entity_id uuid
    );
    create table private.sync_retention_policy(
      singleton boolean, compacted_through_sequence bigint
    );
    insert into private.sync_retention_policy values(true, 0);
  `);
  await database.exec(read(
    "supabase", "migrations", "20260802000000_non_punitive_study_state.sql"
  ));
  const userId = "10000000-0000-4000-8000-000000000001";
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  const result = await database.query(
    "select public.apply_non_punitive_study_state_batch_v1($1, '[]'::jsonb) as value",
    ["20000000-0000-4000-8000-000000000001"]
  );
  assert.deepEqual(result.rows[0].value, { status: "applied", results: [] });
  const pathMutation = [{
    mutationId: "30000000-0000-4000-8000-000000000001",
    sequence: 1,
    entityType: "studyPaths",
    entityId: "40000000-0000-4000-8000-000000000001",
    operation: "insert",
    changedFields: ["title", "position"],
    payload: { title: "Trilha de teste", position: 0 }
  }];
  const pathResult = await database.query(
    "select public.apply_sync_batch($1, $2::jsonb) as value",
    ["20000000-0000-4000-8000-000000000001", JSON.stringify(pathMutation)]
  );
  assert.equal(pathResult.rows[0].value.results[0].status, "applied");
  const paths = await database.query("select title, position from public.study_paths");
  assert.deepEqual(paths.rows, [{ title: "Trilha de teste", position: 0 }]);
  const columns = await database.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'card_progress'
    order by column_name
  `);
  assert.equal(columns.rows.some(({ column_name: name }) => name === "review_marked_at"), true);
  for (const forbidden of ["attempts", "first_viewed_at", "last_activity_at", "last_result"]) {
    assert.equal(columns.rows.some(({ column_name: name }) => name === forbidden), false);
  }
  await database.close();
});

test("projeções usam nome intencional e nunca reconstroem atividade", () => {
  const migration = read(
    "supabase", "migrations", "20260802010000_non_punitive_study_projections.sql"
  );
  assert.match(migration, /last_study_state_at timestamptz/u);
  assert.match(migration, /'lastStudyStateAt'/u);
  assert.doesNotMatch(migration, /lastActivityAt|last_activity_at/u);
  assert.match(migration, /'schemaRevision', '20260802010000'/u);
  assert.match(migration, /'non-punitive-study-projections-v1'/u);
});

test("projeções são executáveis e devolvem apenas a data do estado funcional", async () => {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function private.require_workspace_actor_v4(uuid, text)
      returns void language plpgsql as $$ begin null; end $$;
    create function private.can_review_catalog_v5(uuid)
      returns boolean language sql stable as $$ select false $$;
    create table public.user_course_selections(
      id uuid primary key, user_id uuid not null, course_id uuid not null,
      position integer not null, created_at timestamptz not null default now()
    );
    create table public.courses(
      id uuid primary key, owner_id uuid, contract_key text not null,
      title text not null, goal text not null, publication_seq bigint not null,
      catalog_revision bigint not null, content_hash text not null,
      module_count bigint not null, lesson_count bigint not null,
      status text not null, deleted_at timestamptz,
      document_storage_enabled boolean not null, completion_state text not null
    );
    create table public.lesson_progress(
      selection_id uuid not null, updated_at timestamptz not null
    );
    create table public.card_progress(
      selection_id uuid not null, updated_at timestamptz not null
    );
    create table public.study_paths(id uuid primary key, owner_id uuid, title text);
    create table public.study_path_courses(owner_id uuid, selection_id uuid, path_id uuid);
    create table private.authoring_workspaces(
      id uuid primary key, owner_id uuid, title text, source_submission_id uuid,
      updated_at timestamptz, deleted_at timestamptz
    );
    create table private.authoring_workspace_publications(
      workspace_id uuid, course_id uuid, target text, updated_at timestamptz
    );
    create table private.catalog_review_submissions(
      id uuid primary key, author_id uuid, source_course_id uuid, title text,
      status text, completion_state text, reviewer_id uuid,
      claim_expires_at timestamptz, submitted_at timestamptz, updated_at timestamptz
    );
  `);
  await database.exec(read(
    "supabase", "migrations", "20260802010000_non_punitive_study_projections.sql"
  ));
  const userId = "10000000-0000-4000-8000-000000000001";
  const selectionId = "20000000-0000-4000-8000-000000000001";
  const courseId = "30000000-0000-4000-8000-000000000001";
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await database.exec(`
    insert into public.courses values(
      '${courseId}', null, 'course', 'Curso', 'Meta', 1, 1,
      repeat('a', 64), 1, 1, 'published', null, true, 'complete'
    );
    insert into public.user_course_selections(id, user_id, course_id, position)
      values('${selectionId}', '${userId}', '${courseId}', 0);
    insert into public.lesson_progress values('${selectionId}', '2026-08-01T12:00:00Z');
    insert into public.card_progress values('${selectionId}', '2026-08-01T13:00:00Z');
  `);
  const result = await database.query(
    "select public.list_current_state_central_v1('trails') as value"
  );
  assert.equal(result.rows[0].value.items[0].lastStudyStateAt, "2026-08-01T13:00:00+00:00");
  assert.equal(Object.hasOwn(result.rows[0].value.items[0], "lastActivityAt"), false);
  await database.close();
});

test("runtime de estudo não emite abertura, tentativa ou resultado", () => {
  const sources = [
    read("src", "ui", "lessonEditorApp.js"),
    read("src", "persistence", "RelationalProjectRepository.js"),
    read("src", "persistence", "DomainMutationService.js")
  ].join("\n");
  assert.doesNotMatch(sources, /recordCardView|recordCardAttempt|firstViewedAt|lastActivityAt/u);
  assert.doesNotMatch(sources, /\blastResult\b/u);
  assert.match(sources, /setCardReviewMark/u);
  assert.match(sources, /loadPersonalObservationItems/u);
});

test("documentação delimita pergunta, inferência e retenção antes de indicadores", () => {
  const guide = read("docs", "estado-de-estudo-nao-punitivo.md");
  const matrix = read("docs", "matriz-rastreabilidade-pedagogica.md");
  for (const term of [
    "Pergunta que responde", "Inferência proibida", "Persistência"
  ]) assert.match(guide, new RegExp(term, "u"));
  assert.match(guide, /Dados\s+comportamentais não devem ser coletados/u);
  for (const id of ["LA-01", "LA-02", "LA-03"]) assert.match(matrix, new RegExp(id, "u"));
});
