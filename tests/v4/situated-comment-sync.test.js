import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migration = fs.readFileSync(path.join(
  repositoryRoot,
  "supabase",
  "migrations",
  "20260801180000_situated_personal_comments.sql"
), "utf8");

const USER_ID = "10000000-0000-4000-8000-000000000001";
const DEVICE_ID = "20000000-0000-4000-8000-000000000002";
const COURSE_ID = "30000000-0000-4000-8000-000000000003";
const SELECTION_ID = "40000000-0000-4000-8000-000000000004";
const CARD_ID = "50000000-0000-4000-8000-000000000005";
const LEGACY_CARD_ID = "50000000-0000-4000-8000-000000000015";
const COMMENT_ID = "60000000-0000-4000-8000-000000000006";

async function databaseWithPreviousContract() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema private;
    create schema extensions;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function extensions.digest(bytea, text) returns bytea
      language sql immutable as $$select decode(repeat('00', 32), 'hex')$$;
    create function private.try_uuid(value text) returns uuid
      language plpgsql immutable as $$
      begin
        return value::uuid;
      exception when others then
        return null;
      end;
    $$;

    create table public.user_course_selections(
      id uuid primary key,
      user_id uuid not null,
      course_id uuid not null,
      unique(id, user_id, course_id)
    );
    create table public.card_comments(
      id uuid primary key,
      selection_id uuid not null,
      user_id uuid not null,
      course_id uuid not null,
      card_id uuid not null,
      body text not null check(btrim(body) <> ''),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(selection_id, card_id)
    );
    create table private.sync_devices(
      id uuid not null,
      user_id uuid not null,
      last_processed_mutation_sequence bigint not null default 0,
      last_seen_at timestamptz not null default now(),
      inactive_at timestamptz,
      primary key(user_id, id)
    );
    create table private.sync_changes(
      sequence bigint generated always as identity primary key,
      audience_user_id uuid not null,
      entity_type text not null,
      entity_id uuid not null
    );
    create table private.sync_idempotency(
      user_id uuid not null,
      mutation_id uuid not null,
      request_hash text not null,
      entity_type text not null,
      entity_id uuid,
      operation text not null,
      device_id uuid,
      client_sequence bigint,
      applied_sequence bigint,
      outcome text not null default 'applied',
      error_code text,
      error_message text,
      primary key(user_id, mutation_id),
      unique(user_id, device_id, client_sequence)
    );
    create function private.current_personal_row(
      p_entity_type text,
      p_entity_id uuid,
      p_user_id uuid
    ) returns jsonb language sql stable as $$
      select case when p_entity_type = 'comments' then (
        select to_jsonb(comment_row)
        from public.card_comments comment_row
        where comment_row.id = p_entity_id and comment_row.user_id = p_user_id
      ) else null end
    $$;
    create function public.apply_sync_batch(uuid, jsonb) returns jsonb
      language sql as $$select jsonb_build_object('status', 'applied', 'results', '[]'::jsonb)$$;

    insert into public.user_course_selections(id, user_id, course_id)
    values('${SELECTION_ID}', '${USER_ID}', '${COURSE_ID}');
    insert into public.card_comments(
      id, selection_id, user_id, course_id, card_id, body
    ) values(
      '70000000-0000-4000-8000-000000000007',
      '${SELECTION_ID}', '${USER_ID}', '${COURSE_ID}', '${LEGACY_CARD_ID}', 'Anterior'
    );
  `);
  await database.exec(migration);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [USER_ID]);
  return database;
}

function mutation({
  mutationId = "80000000-0000-4000-8000-000000000008",
  sequence = 1,
  operation = "upsert",
  category = "question",
  body = "Como isto funciona?"
} = {}) {
  return {
    mutationId,
    sequence,
    courseId: COURSE_ID,
    entityType: "comments",
    entityId: COMMENT_ID,
    operation,
    changedFields: operation === "delete" ? [] : ["category", "body"],
    payload: operation === "delete"
      ? { selectionId: SELECTION_ID, cardId: CARD_ID }
      : { selectionId: SELECTION_ID, cardId: CARD_ID, category, body }
  };
}

test("migration converte notas antigas e instala somente o contrato situado", async () => {
  const database = await databaseWithPreviousContract();
  try {
    const legacy = await database.query(`
      select category, status from public.card_comments
      where body = 'Anterior'
    `);
    assert.deepEqual(legacy.rows, [{ category: "observation", status: "open" }]);

    await assert.rejects(
      database.query(
        "select public.apply_sync_batch($1, $2::jsonb)",
        [DEVICE_ID, JSON.stringify([mutation()])]
      ),
      /apply_situated_comment_batch_v1/u
    );
  } finally {
    await database.close();
  }
});

test("RPC situado cria, deduplica e retira uma única observação corrente", async () => {
  const database = await databaseWithPreviousContract();
  try {
    const firstMutation = mutation();
    const inserted = await database.query(
      "select public.apply_situated_comment_batch_v1($1, $2::jsonb) as result",
      [DEVICE_ID, JSON.stringify([firstMutation])]
    );
    assert.equal(
      inserted.rows[0].result.results[0].status,
      "applied",
      JSON.stringify(inserted.rows[0].result.results[0])
    );
    assert.equal(inserted.rows[0].result.results[0].idempotent, false);

    const saved = await database.query(`
      select category, body, status from public.card_comments where id = $1
    `, [COMMENT_ID]);
    assert.deepEqual(saved.rows, [{
      category: "question",
      body: "Como isto funciona?",
      status: "open"
    }]);

    const repeated = await database.query(
      "select public.apply_situated_comment_batch_v1($1, $2::jsonb) as result",
      [DEVICE_ID, JSON.stringify([firstMutation])]
    );
    assert.equal(repeated.rows[0].result.results[0].idempotent, true);
    assert.equal((await database.query(
      "select count(*)::integer as count from public.card_comments where id = $1",
      [COMMENT_ID]
    )).rows[0].count, 1);

    const removal = mutation({
      mutationId: "90000000-0000-4000-8000-000000000009",
      sequence: 2,
      operation: "delete"
    });
    const removed = await database.query(
      "select public.apply_situated_comment_batch_v1($1, $2::jsonb) as result",
      [DEVICE_ID, JSON.stringify([removal])]
    );
    assert.equal(removed.rows[0].result.results[0].status, "applied");
    assert.equal((await database.query(
      "select count(*)::integer as count from public.card_comments where id = $1",
      [COMMENT_ID]
    )).rows[0].count, 0);
  } finally {
    await database.close();
  }
});

test("RPC situado rejeita categoria e texto fora do contrato sem gravar", async () => {
  const database = await databaseWithPreviousContract();
  try {
    const invalid = mutation({ category: "other", body: "x".repeat(1001) });
    const response = await database.query(
      "select public.apply_situated_comment_batch_v1($1, $2::jsonb) as result",
      [DEVICE_ID, JSON.stringify([invalid])]
    );
    assert.equal(response.rows[0].result.results[0].status, "rejected");
    assert.equal(response.rows[0].result.results[0].code, "23514");
    assert.equal((await database.query(
      "select count(*)::integer as count from public.card_comments where id = $1",
      [COMMENT_ID]
    )).rows[0].count, 0);
  } finally {
    await database.close();
  }
});
