import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260801230000_workspace_pedagogical_comments.sql"
), "utf8");
const aggregateMigration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260802020000_workspace_comment_aggregates.sql"
), "utf8");
const IDS = Object.freeze({
  owner: "10000000-0000-4000-8000-000000000001",
  learnerA: "10000000-0000-4000-8000-000000000002",
  learnerB: "10000000-0000-4000-8000-000000000003",
  workspace: "20000000-0000-4000-8000-000000000001",
  course: "30000000-0000-4000-8000-000000000001",
  module: "40000000-0000-4000-8000-000000000001",
  lesson: "50000000-0000-4000-8000-000000000001",
  microsequence: "60000000-0000-4000-8000-000000000001",
  card: "70000000-0000-4000-8000-000000000001",
  selectionA: "80000000-0000-4000-8000-000000000001",
  selectionB: "80000000-0000-4000-8000-000000000002",
  commentA: "90000000-0000-4000-8000-000000000001",
  commentB: "90000000-0000-4000-8000-000000000002"
});
const HASH = "a".repeat(64);

async function database() {
  const db = new PGlite();
  await db.exec(`
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
      language sql immutable as $$ select decode(repeat('ab', 32), 'hex') $$;
    create table auth.users(id uuid primary key, email text not null);
    create table private.authoring_workspaces(
      id uuid primary key, owner_id uuid not null, deleted_at timestamptz
    );
    create table private.educational_workspace_members(
      workspace_id uuid not null, user_id uuid not null, role text not null,
      primary key(workspace_id, user_id)
    );
    create table private.authoring_workspace_publications(
      workspace_id uuid not null, course_id uuid not null
    );
    create table private.educational_workspace_receipts(
      actor_id uuid not null references auth.users(id), request_id text not null,
      operation text not null, payload_hash text not null, result jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '7 days',
      primary key(actor_id, request_id),
      constraint educational_workspace_receipts_operation_v1 check (
        operation in ('create', 'update', 'invite', 'accept_invite', 'cancel_invite',
          'set_role', 'remove_member', 'transfer_owner', 'leave')
      )
    );
    create function private.educational_workspace_can_v1(
      p_workspace_id uuid, p_actor_id uuid, p_capability text
    ) returns boolean language sql stable as $$
      select coalesce((select case
        when p_capability = 'comment' then role in ('owner','author','reviewer','learner')
        when p_capability = 'review' then role in ('owner','author','reviewer')
        else false end
      from private.educational_workspace_members
      where workspace_id = p_workspace_id and user_id = p_actor_id), false)
    $$;
    create function private.require_educational_workspace_capability_v1(
      p_workspace_id uuid, p_actor_id uuid, p_capability text
    ) returns text language plpgsql stable as $$
    declare v_role text;
    begin
      select role into v_role from private.educational_workspace_members
      where workspace_id = p_workspace_id and user_id = p_actor_id;
      if v_role is null or not private.educational_workspace_can_v1(
        p_workspace_id, p_actor_id, p_capability
      ) then raise exception 'Ação não permitida neste workspace.' using errcode='42501';
      end if;
      return v_role;
    end $$;
    create table public.courses(
      id uuid primary key, contract_key text not null, title text not null,
      current_revision_hash text
    );
    create table public.modules(
      id uuid primary key, course_id uuid not null, contract_key text not null
    );
    create table public.lessons(
      id uuid primary key, course_id uuid not null, module_id uuid not null,
      contract_key text not null
    );
    create table public.microsequences(
      id uuid primary key, course_id uuid not null, lesson_id uuid not null,
      contract_key text not null
    );
    create table public.cards(
      id uuid primary key, course_id uuid not null, microsequence_id uuid not null,
      contract_key text not null, title text not null, deleted_at timestamptz
    );
    create table public.user_course_selections(
      id uuid primary key, user_id uuid not null, course_id uuid not null
    );
    create table public.card_comments(
      id uuid primary key, selection_id uuid not null, user_id uuid not null,
      course_id uuid not null, card_id uuid not null, category text not null,
      status text not null, body text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint card_comments_status_v1 check(status in ('open','resolved'))
    );
    insert into auth.users values
      ('${IDS.owner}', 'owner@example.test'),
      ('${IDS.learnerA}', 'a@example.test'),
      ('${IDS.learnerB}', 'b@example.test');
    insert into private.authoring_workspaces values('${IDS.workspace}', '${IDS.owner}', null);
    insert into private.educational_workspace_members values
      ('${IDS.workspace}', '${IDS.owner}', 'owner'),
      ('${IDS.workspace}', '${IDS.learnerA}', 'learner'),
      ('${IDS.workspace}', '${IDS.learnerB}', 'learner');
    insert into public.courses values('${IDS.course}', 'curso', 'Curso', '${HASH}');
    insert into public.modules values('${IDS.module}', '${IDS.course}', 'modulo');
    insert into public.lessons values('${IDS.lesson}', '${IDS.course}', '${IDS.module}', 'licao');
    insert into public.microsequences values(
      '${IDS.microsequence}', '${IDS.course}', '${IDS.lesson}', 'micro'
    );
    insert into public.cards values(
      '${IDS.card}', '${IDS.course}', '${IDS.microsequence}', 'card', 'Card', null
    );
    insert into private.authoring_workspace_publications values(
      '${IDS.workspace}', '${IDS.course}'
    );
    insert into public.user_course_selections values
      ('${IDS.selectionA}', '${IDS.learnerA}', '${IDS.course}'),
      ('${IDS.selectionB}', '${IDS.learnerB}', '${IDS.course}');
  `);
  await db.exec(migration);
  await db.exec(`
    insert into public.card_comments(
      id, selection_id, user_id, course_id, card_id, category, status, body
    ) values
      ('${IDS.commentA}', '${IDS.selectionA}', '${IDS.learnerA}', '${IDS.course}',
       '${IDS.card}', 'question', 'open', 'Pode explicar?'),
      ('${IDS.commentB}', '${IDS.selectionB}', '${IDS.learnerB}', '${IDS.course}',
       '${IDS.card}', 'confusing', 'open', 'Não entendi.');
  `);
  await db.exec(aggregateMigration);
  return db;
}

test("observação infere workspace e conserva a revisão sem copiar o card", async () => {
  const db = await database();
  try {
    const rows = await db.query(`
      select workspace_id, course_revision_hash, pg_column_size(comment.*) as bytes
      from public.card_comments comment order by id
    `);
    assert.equal(rows.rows[0].workspace_id, IDS.workspace);
    assert.equal(rows.rows[0].course_revision_hash, HASH);
    assert.equal(rows.rows[0].bytes < 4096, true);
    assert.doesNotMatch(migration, /card_snapshot|content_snapshot|comment_history/iu);
  } finally {
    await db.close();
  }
});

test("estudante lê somente a própria observação e responsável lê a turma", async () => {
  const db = await database();
  try {
    const learner = await db.query(`
      select private.list_educational_workspace_comments_v1(
        $1, $2, 20, null, null, null, null
      ) as value
    `, [IDS.learnerA, IDS.workspace]);
    assert.equal(learner.rows[0].value.items.length, 1);
    assert.equal(learner.rows[0].value.items[0].body, "Pode explicar?");
    assert.deepEqual(learner.rows[0].value.items[0].entityPath, [
      "curso", "modulo", "licao", "micro", "card"
    ]);

    const owner = await db.query(`
      select private.list_educational_workspace_comments_v1(
        $1, $2, 20, null, null, array['question'], array['open']
      ) as value
    `, [IDS.owner, IDS.workspace]);
    assert.equal(owner.rows[0].value.items.length, 1);
    assert.equal(owner.rows[0].value.items[0].author.email, "a@example.test");
  } finally {
    await db.close();
  }
});

test("síntese corrente agrega a turma para responsáveis e somente o próprio autor para estudantes", async () => {
  const db = await database();
  try {
    const owner = await db.query(`
      select private.educational_workspace_comment_summary_v1($1, $2) as value
    `, [IDS.owner, IDS.workspace]);
    assert.deepEqual(owner.rows[0].value.byCategory, {
      question: 1,
      possibleError: 0,
      confusing: 1,
      suggestion: 0,
      observation: 0
    });
    assert.equal(owner.rows[0].value.totalCount, 2);
    assert.equal(owner.rows[0].value.openCount, 2);
    assert.equal(owner.rows[0].value.focusCards.length, 1);
    assert.equal(owner.rows[0].value.focusCards[0].totalCount, 2);
    assert.equal(owner.rows[0].value.focusCards[0].targetAvailable, true);
    assert.deepEqual(owner.rows[0].value.focusCards[0].entityPath, [
      "curso", "modulo", "licao", "micro", "card"
    ]);

    const learner = await db.query(`
      select private.educational_workspace_comment_summary_v1($1, $2) as value
    `, [IDS.learnerA, IDS.workspace]);
    assert.equal(learner.rows[0].value.totalCount, 1);
    assert.equal(learner.rows[0].value.focusCards[0].totalCount, 1);
    assert.doesNotMatch(aggregateMigration, /create table|comment_history|author_count/iu);
  } finally {
    await db.close();
  }
});

test("resposta, resolução e vínculo com correção são idempotentes e autorizados", async () => {
  const db = await database();
  try {
    const respond = await db.query(`
      select private.manage_educational_workspace_comment_v1(
        $1, 'comment:respond:0001', $2, $3, 'respond_comment',
        '{"response":"A explicação foi ampliada."}'::jsonb
      ) as value
    `, [IDS.owner, IDS.workspace, IDS.commentA]);
    assert.equal(respond.rows[0].value.status, "considered");
    const replay = await db.query(`
      select private.manage_educational_workspace_comment_v1(
        $1, 'comment:respond:0001', $2, $3, 'respond_comment',
        '{"response":"A explicação foi ampliada."}'::jsonb
      ) as value
    `, [IDS.owner, IDS.workspace, IDS.commentA]);
    assert.equal(replay.rows[0].value.idempotent, true);

    await db.query(`
      select private.manage_educational_workspace_comment_v1(
        $1, 'comment:link:0001', $2, $3, 'link_comment_correction',
        $4::jsonb
      )
    `, [IDS.owner, IDS.workspace, IDS.commentA, JSON.stringify({
      correctionRequestId: "workspace:repair:0001",
      entityPath: ["curso", "modulo", "licao", "micro", "card"]
    })]);
    const updated = await db.query(`
      select status, response, correction_request_id, correction_entity_path
      from public.card_comments where id = $1
    `, [IDS.commentA]);
    assert.equal(updated.rows[0].status, "incorporated");
    assert.equal(updated.rows[0].response, "A explicação foi ampliada.");
    assert.equal(updated.rows[0].correction_request_id, "workspace:repair:0001");
    const storage = await db.query(`
      select pg_column_size(comment.*) as comment_bytes,
        pg_column_size(receipt.*) as receipt_bytes
      from public.card_comments comment
      cross join private.educational_workspace_receipts receipt
      where comment.id = $1 and receipt.request_id = 'comment:link:0001'
    `, [IDS.commentA]);
    assert.equal(storage.rows[0].comment_bytes <= 1024, true);
    assert.equal(storage.rows[0].receipt_bytes <= 1024, true);

    await assert.rejects(() => db.query(`
      select private.manage_educational_workspace_comment_v1(
        $1, 'comment:respond:learner', $2, $3, 'respond_comment',
        '{"response":"Tentativa."}'::jsonb
      )
    `, [IDS.learnerA, IDS.workspace, IDS.commentA]), /não permitida/iu);
  } finally {
    await db.close();
  }
});

test("tabela não permite forjar resposta fora das RPCs contextuais", async () => {
  const db = await database();
  try {
    const privileges = await db.query(`
      select
        has_table_privilege('authenticated', 'public.card_comments', 'SELECT') as can_select,
        has_table_privilege('authenticated', 'public.card_comments', 'INSERT') as can_insert,
        has_table_privilege('authenticated', 'public.card_comments', 'UPDATE') as can_update,
        has_table_privilege('authenticated', 'public.card_comments', 'DELETE') as can_delete
    `);
    assert.deepEqual(privileges.rows[0], {
      can_select: false,
      can_insert: false,
      can_update: false,
      can_delete: false
    });
  } finally {
    await db.close();
  }
});
