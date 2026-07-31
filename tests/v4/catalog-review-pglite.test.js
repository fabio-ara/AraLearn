import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const migration = fs.readFileSync(path.join(
  repositoryRoot,
  "supabase",
  "migrations",
  "20260730140000_composed_authoring_and_catalog_review.sql"
), "utf8");

const IDS = Object.freeze({
  author: "10000000-0000-4000-8000-000000000001",
  reviewerA: "10000000-0000-4000-8000-000000000002",
  reviewerB: "10000000-0000-4000-8000-000000000003",
  course: "20000000-0000-4000-8000-000000000001",
  submissionA: "30000000-0000-4000-8000-000000000001",
  sameHashReplay: "30000000-0000-4000-8000-000000000002",
  submissionB: "30000000-0000-4000-8000-000000000003",
  submissionC: "30000000-0000-4000-8000-000000000004",
  duplicateActive: "30000000-0000-4000-8000-000000000005",
  closedHashResubmission: "30000000-0000-4000-8000-000000000006",
  workspaceA: "40000000-0000-4000-8000-000000000001",
  workspaceB: "40000000-0000-4000-8000-000000000002"
});
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function definitionBlock(qualifiedName) {
  const start = migration.indexOf(`create function ${qualifiedName}(`);
  assert.notEqual(start, -1, qualifiedName);
  const end = migration.indexOf("$function$;", start);
  assert.notEqual(end, -1, qualifiedName);
  return migration.slice(start, end + "$function$;".length);
}

function submissionDdl() {
  const start = migration.indexOf(
    "create table private.catalog_review_submissions"
  );
  const end = migration.indexOf(
    "create function private.close_catalog_review_workspace_v5",
    start
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return migration.slice(start, end);
}

async function rpc(database, functionName, placeholders, parameters) {
  const result = await database.query(
    `select public.${functionName}(${placeholders}) as value`,
    parameters
  );
  return result.rows[0].value;
}

async function publishPrivateRevision(database, hash) {
  await database.query(
    "insert into private.artifact_refs(hash) values ($1) on conflict do nothing",
    [hash]
  );
  await database.query(`
    insert into private.course_revisions(
      course_id, revision_hash, artifact_hash, validation_status, published_at
    ) values ($1, $2, $2, 'validated', now())
  `, [IDS.course, hash]);
  await database.query(`
    update public.courses
    set current_revision_hash = $2,
        revision_artifact_hash = $2
    where id = $1
  `, [IDS.course, hash]);
}

async function selectCurrentPrivateRevision(database, hash) {
  await database.query(`
    update public.courses
    set current_revision_hash = $2,
        revision_artifact_hash = $2
    where id = $1
  `, [IDS.course, hash]);
}

async function createDatabase() {
  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create schema private;

    create table auth.users (
      id uuid primary key
    );
    create table public.catalog_collections (
      id uuid primary key
    );
    create table private.artifact_refs (
      hash text primary key
    );
    create table public.courses (
      id uuid primary key,
      owner_id uuid not null references auth.users(id),
      status text not null,
      deleted_at timestamptz,
      document_storage_enabled boolean not null default true,
      current_revision_hash text,
      revision_artifact_hash text,
      completion_state text not null,
      title text not null,
      goal text not null
    );
    create table private.course_revisions (
      course_id uuid not null references public.courses(id),
      revision_hash text not null,
      artifact_hash text not null references private.artifact_refs(hash),
      validation_status text not null,
      published_at timestamptz,
      primary key(course_id, revision_hash)
    );
    create table private.authoring_workspaces (
      id uuid primary key,
      owner_id uuid not null references auth.users(id),
      source_submission_id uuid,
      brief text not null default '',
      deleted_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table private.authoring_workspace_entities (
      workspace_id uuid not null references private.authoring_workspaces(id)
        on delete cascade
    );
    create table private.authoring_workspace_events (
      workspace_id uuid not null references private.authoring_workspaces(id)
        on delete cascade
    );
    create table private.authoring_workspace_requests (
      workspace_id uuid not null references private.authoring_workspaces(id)
        on delete cascade
    );
    create table private.catalog_reviewers (
      actor_id uuid primary key references auth.users(id)
    );

    create function private.require_workspace_actor_v5(
      p_actor_id uuid,
      p_scope text
    )
    returns void
    language plpgsql
    as $$
    begin
      if p_actor_id is null or p_scope is null then
        raise exception 'Identidade inválida.' using errcode = '42501';
      end if;
    end;
    $$;

    create function private.can_review_catalog_v5(p_actor_id uuid)
    returns boolean
    language sql
    stable
    as $$
      select exists (
        select 1
        from private.catalog_reviewers reviewer
        where reviewer.actor_id = p_actor_id
      );
    $$;
  `);
  await database.exec(submissionDdl());
  for (const name of [
    "private.close_catalog_review_workspace_v5",
    "public.submit_private_course_for_catalog_review_v5",
    "public.list_catalog_reviews_v5",
    "public.claim_catalog_review_v5",
    "public.link_catalog_review_workspace_v5",
    "public.decide_catalog_review_v5",
    "public.withdraw_catalog_review_v5"
  ]) {
    await database.exec(definitionBlock(name));
  }
  await database.query(
    "insert into auth.users(id) values ($1), ($2), ($3)",
    [IDS.author, IDS.reviewerA, IDS.reviewerB]
  );
  await database.query(
    "insert into private.catalog_reviewers(actor_id) values ($1), ($2)",
    [IDS.reviewerA, IDS.reviewerB]
  );
  await database.query(
    "insert into private.artifact_refs(hash) values ($1)",
    [HASH_A]
  );
  await database.query(`
    insert into public.courses(
      id, owner_id, status, document_storage_enabled,
      current_revision_hash, revision_artifact_hash,
      completion_state, title, goal
    ) values (
      $2, $1, 'published', true, $3, $3,
      'partial', 'Curso de teste', 'Validar o fluxo editorial.'
    )
  `, [IDS.author, IDS.course, HASH_A]);
  await database.query(`
    insert into private.course_revisions(
      course_id, revision_hash, artifact_hash, validation_status, published_at
    ) values ($1, $2, $2, 'validated', now())
  `, [IDS.course, HASH_A]);
  return database;
}

test("PostgreSQL aplica reenvio, parecer e concessão editorial sem snapshots", async () => {
  const database = await createDatabase();
  try {
    const first = await rpc(
      database,
      "submit_private_course_for_catalog_review_v5",
      "$1, $2, $3, $4, $5",
      [IDS.author, IDS.submissionA, IDS.course, HASH_A, "Primeira versão."]
    );
    assert.equal(first.idempotent, false);
    assert.equal(first.status, "submitted");

    const sameHash = await rpc(
      database,
      "submit_private_course_for_catalog_review_v5",
      "$1, $2, $3, $4, $5",
      [IDS.author, IDS.sameHashReplay, IDS.course, HASH_A, "Primeira versão."]
    );
    assert.equal(sameHash.submissionId, IDS.submissionA);
    assert.equal(sameHash.idempotent, true);

    await publishPrivateRevision(database, HASH_B);
    const replacement = await rpc(
      database,
      "submit_private_course_for_catalog_review_v5",
      "$1, $2, $3, $4, $5",
      [IDS.author, IDS.submissionB, IDS.course, HASH_B, "Versão ampliada."]
    );
    assert.equal(replacement.submissionId, IDS.submissionB);
    const superseded = await database.query(`
      select status, artifact_hash, reviewer_note, decided_at
      from private.catalog_review_submissions
      where id = $1
    `, [IDS.submissionA]);
    assert.equal(superseded.rows[0].status, "superseded");
    assert.equal(superseded.rows[0].artifact_hash, null);
    assert.match(superseded.rows[0].reviewer_note, /substituída/u);
    assert.ok(superseded.rows[0].decided_at);

    const claimed = await rpc(
      database,
      "claim_catalog_review_v5",
      "$1, $2",
      [IDS.reviewerA, IDS.submissionB]
    );
    assert.equal(claimed.reviewerId, IDS.reviewerA);
    assert.ok(claimed.leaseExpiresAt);

    await publishPrivateRevision(database, HASH_C);
    await assert.rejects(
      () => rpc(
        database,
        "submit_private_course_for_catalog_review_v5",
        "$1, $2, $3, $4, $5",
        [IDS.author, IDS.submissionC, IDS.course, HASH_C, "Correção concorrente."]
      ),
      (error) => error?.code === "RS409"
    );

    await database.query(`
      insert into private.authoring_workspaces(
        id, owner_id, source_submission_id
      ) values ($1, $2, $3)
    `, [IDS.workspaceA, IDS.reviewerA, IDS.submissionB]);
    await rpc(
      database,
      "link_catalog_review_workspace_v5",
      "$1, $2, $3",
      [IDS.reviewerA, IDS.submissionB, IDS.workspaceA]
    );
    const resumed = await rpc(
      database,
      "claim_catalog_review_v5",
      "$1, $2",
      [IDS.reviewerA, IDS.submissionB]
    );
    assert.equal(resumed.reviewWorkspaceId, IDS.workspaceA);
    assert.equal(resumed.idempotent, true);

    await rpc(
      database,
      "decide_catalog_review_v5",
      "$1, $2, $3, $4",
      [
        IDS.reviewerA,
        IDS.submissionB,
        "request_changes",
        "Inclua uma prática de recuperação de desastre."
      ]
    );
    const history = await rpc(
      database,
      "list_catalog_reviews_v5",
      "$1, $2, $3, $4, $5",
      [IDS.author, "mine", 20, null, null]
    );
    const decided = history.items.find(
      (item) => item.submissionId === IDS.submissionB
    );
    assert.equal(decided.sourceRevisionHash, HASH_B);
    assert.equal(
      decided.reviewerNote,
      "Inclua uma prática de recuperação de desastre."
    );
    assert.ok(decided.decidedAt);
    const closedWorkspace = await database.query(
      "select 1 from private.authoring_workspaces where id = $1",
      [IDS.workspaceA]
    );
    assert.equal(closedWorkspace.rows.length, 0);

    await selectCurrentPrivateRevision(database, HASH_B);
    const repeatedClosedHash = await rpc(
      database,
      "submit_private_course_for_catalog_review_v5",
      "$1, $2, $3, $4, $5",
      [
        IDS.author,
        IDS.closedHashResubmission,
        IDS.course,
        HASH_B,
        "Reenvio deliberado da mesma revisão encerrada."
      ]
    );
    assert.equal(
      repeatedClosedHash.submissionId,
      IDS.closedHashResubmission
    );
    assert.equal(repeatedClosedHash.idempotent, false);
    const repeatedArtifact = await database.query(
      "select count(*)::integer as count from private.artifact_refs where hash = $1",
      [HASH_B]
    );
    assert.equal(repeatedArtifact.rows[0].count, 1);
    await rpc(
      database,
      "withdraw_catalog_review_v5",
      "$1, $2",
      [IDS.author, IDS.closedHashResubmission]
    );

    await selectCurrentPrivateRevision(database, HASH_C);
    const resubmitted = await rpc(
      database,
      "submit_private_course_for_catalog_review_v5",
      "$1, $2, $3, $4, $5",
      [IDS.author, IDS.submissionC, IDS.course, HASH_C, "Parecer incorporado."]
    );
    assert.equal(resubmitted.status, "submitted");

    await rpc(
      database,
      "claim_catalog_review_v5",
      "$1, $2",
      [IDS.reviewerA, IDS.submissionC]
    );
    await database.query(`
      insert into private.authoring_workspaces(
        id, owner_id, source_submission_id
      ) values ($1, $2, $3)
    `, [IDS.workspaceB, IDS.reviewerA, IDS.submissionC]);
    await rpc(
      database,
      "link_catalog_review_workspace_v5",
      "$1, $2, $3",
      [IDS.reviewerA, IDS.submissionC, IDS.workspaceB]
    );
    await database.query(`
      update private.catalog_review_submissions
      set review_started_at = now() - interval '31 minutes',
          claim_expires_at = now() - interval '1 minute'
      where id = $1
    `, [IDS.submissionC]);

    const reassigned = await rpc(
      database,
      "claim_catalog_review_v5",
      "$1, $2",
      [IDS.reviewerB, IDS.submissionC]
    );
    assert.equal(reassigned.reviewerId, IDS.reviewerB);
    assert.equal(reassigned.reviewWorkspaceId, null);
    const abandonedWorkspace = await database.query(
      "select 1 from private.authoring_workspaces where id = $1",
      [IDS.workspaceB]
    );
    assert.equal(abandonedWorkspace.rows.length, 0);

    await assert.rejects(
      () => database.query(`
        insert into private.catalog_review_submissions(
          id, author_id, source_course_id, source_revision_hash, artifact_hash,
          completion_state, title, goal
        ) values ($1, $2, $3, $4, $4, 'partial', 'Duplicado', 'Duplicado')
      `, [
        IDS.duplicateActive,
        IDS.author,
        IDS.course,
        HASH_C
      ]),
      (error) => error?.code === "23505"
    );
  } finally {
    await database.close();
  }
});
