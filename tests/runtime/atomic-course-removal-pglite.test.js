import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260804160000_atomic_private_course_removal.sql",
  import.meta.url
);

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const HASH = "a".repeat(64);
const STALE_HASH = "b".repeat(64);

async function prepareDatabase({ beforeMigration = null } = {}) {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;

    create table auth.users(id uuid primary key);
    insert into auth.users(id) values ('${USER_A}'), ('${USER_B}');

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table public.courses(
      id uuid primary key,
      owner_id uuid references auth.users(id),
      status text not null default 'published',
      deleted_at timestamptz,
      document_storage_enabled boolean not null default true,
      contract_key text not null default 'course',
      title text not null default 'Curso',
      goal text not null default '',
      content_hash text,
      current_revision_hash text,
      revision_artifact_hash text,
      publication_seq bigint not null default 1,
      module_count integer not null default 0,
      lesson_count integer not null default 0,
      microsequence_count integer not null default 0,
      card_count integer not null default 0,
      updated_at timestamptz not null default now()
    );
    create table public.user_course_selections(
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      course_id uuid not null references public.courses(id) on delete cascade,
      position integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(user_id, course_id)
    );
    create table public.lesson_progress(
      id uuid primary key,
      selection_id uuid not null references public.user_course_selections(id)
        on delete cascade
    );

    create table private.sync_changes(
      sequence bigint generated always as identity primary key,
      audience_user_id uuid,
      course_id uuid,
      entity_type text not null,
      entity_id uuid,
      operation text not null
    );
    create table private.catalog_publishers(
      user_id uuid primary key references auth.users(id)
    );
    insert into private.catalog_publishers(user_id)
    values ('${USER_A}'), ('${USER_B}');
    create table private.course_revisions(course_id uuid primary key);
    create table private.authoring_workspaces(
      id uuid primary key,
      owner_id uuid not null references auth.users(id),
      title text not null,
      purpose text not null default '',
      brief text not null default '',
      revision bigint not null default 1,
      source_course_id uuid,
      source_revision_hash text,
      source_submission_id uuid,
      deleted_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table private.authoring_workspace_entities(
      workspace_id uuid not null references private.authoring_workspaces(id),
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null default 0,
      content jsonb not null default '{}'::jsonb,
      version integer not null default 1,
      updated_at timestamptz not null default now(),
      primary key(workspace_id, entity_type, entity_id),
      foreign key(workspace_id, parent_type, parent_id)
        references private.authoring_workspace_entities(
          workspace_id, entity_type, entity_id
        ) deferrable initially deferred
    );
    create table private.authoring_workspace_publications(
      workspace_id uuid not null references private.authoring_workspaces(id)
        on delete cascade,
      workspace_course_id text not null,
      target text not null,
      course_id uuid not null references public.courses(id) on delete cascade,
      content_hash text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id, workspace_course_id, target),
      unique(workspace_id, target, course_id)
    );
    create table private.authoring_workspace_requests(
      owner_id uuid not null references auth.users(id),
      request_id text not null,
      operation text not null,
      payload_hash text not null,
      workspace_id uuid,
      result jsonb not null,
      primary key(owner_id, request_id)
    );
    create table private.authoring_workspace_events(
      id bigint generated always as identity primary key,
      workspace_id uuid not null,
      revision bigint not null,
      operation text not null,
      summary jsonb not null,
      actor_id uuid,
      created_at timestamptz not null default now()
    );
    create table private.authoring_workspace_observations(
      id uuid primary key,
      workspace_id uuid not null,
      entity_type text not null,
      entity_path text[] not null
    );
    create table private.authoring_workspace_observation_receipts(
      actor_id uuid not null,
      request_id text not null,
      result jsonb not null,
      primary key(actor_id, request_id)
    );
    create table private.educational_workspace_receipts(
      actor_id uuid not null,
      request_id text not null,
      result jsonb not null,
      primary key(actor_id, request_id)
    );
    create table private.educational_workspace_members(
      workspace_id uuid not null,
      user_id uuid not null,
      role text not null default 'owner',
      primary key(workspace_id, user_id)
    );
    create table private.educational_workspace_invitations(
      id uuid primary key,
      workspace_id uuid not null
    );
    create table private.catalog_review_submissions(
      id uuid primary key,
      review_workspace_id uuid,
      updated_at timestamptz not null default now()
    );
    create table public.card_comments(
      id uuid primary key,
      workspace_id uuid
    );

    create function private.require_workspace_actor_v5(uuid, text)
    returns void language sql as $$ select $$;
    create function private.can_publish_catalog_v5(uuid)
    returns boolean language sql stable as $$
      select exists(
        select 1 from private.catalog_publishers publisher
        where publisher.user_id = $1
      )
    $$;
    create function private.can_review_catalog_v5(uuid)
    returns boolean language sql stable as $$ select true $$;
    create function private.educational_workspace_can_v1(
      p_workspace_id uuid, p_actor_id uuid, p_capability text
    ) returns boolean language sql stable as $$
      select exists(
        select 1 from private.educational_workspace_members member
        where member.workspace_id = p_workspace_id
          and member.user_id = p_actor_id
      )
    $$;
    create function private.workspace_result_v5(
      workspace private.authoring_workspaces,
      idempotent boolean,
      summary jsonb
    ) returns jsonb language sql stable as $$
      select jsonb_build_object(
        'workspaceId', workspace.id,
        'revision', workspace.revision,
        'idempotent', idempotent,
        'summary', summary
      )
    $$;
    create function private.prune_authoring_workspace_state_v5(uuid, text)
    returns void language sql as $$ select $$;
    create function public.create_authoring_workspace_v5(
      p_owner_id uuid, p_workspace_id uuid, p_request_id text,
      p_payload_hash text, p_title text, p_source_course_id uuid,
      p_source_revision_hash text, p_source_submission_id uuid,
      p_brief text, p_rows jsonb
    ) returns jsonb language sql as $$
      select jsonb_build_object(
        'workspaceId', p_workspace_id, 'revision', 1, 'idempotent', false
      )
    $$;
    create function public.delete_authoring_workspace_v5(
      uuid, uuid, text, text
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;

    create function private.cleanup_workspace_course_publication_v5()
    returns trigger language plpgsql as $$
    begin
      if old.entity_type = 'course' then
        delete from private.authoring_workspace_publications publication
        where publication.workspace_id = old.workspace_id
          and publication.workspace_course_id = old.entity_id;
      end if;
      return old;
    end
    $$;
    create trigger authoring_workspace_course_publication_cleanup_v5
    after delete on private.authoring_workspace_entities
    for each row execute function
      private.cleanup_workspace_course_publication_v5();

    create function private.cleanup_archived_course_publication_v5()
    returns trigger language plpgsql as $$
    begin
      delete from private.authoring_workspace_publications publication
      where publication.course_id = new.id;
      return new;
    end
    $$;
    create trigger archived_course_publication_cleanup_v5
    after update of status, deleted_at, document_storage_enabled
    on public.courses for each row
    when (
      new.deleted_at is not null
      or new.status <> 'published'
      or not new.document_storage_enabled
    ) execute function private.cleanup_archived_course_publication_v5();

    create function private.capture_selection_delete_for_test()
    returns trigger language plpgsql as $$
    begin
      insert into private.sync_changes(
        audience_user_id, course_id, entity_type, entity_id, operation
      ) values (
        old.user_id, old.course_id, 'courseSelections', old.id, 'delete'
      );
      return old;
    end
    $$;
    create trigger user_course_selections_sync
    after delete on public.user_course_selections
    for each row execute function private.capture_selection_delete_for_test();

    create function private.delete_unselected_personal_course()
    returns trigger language plpgsql as $$
    begin
      if pg_trigger_depth() = 1 then
        delete from public.courses course
        where course.id = old.course_id
          and course.owner_id = old.user_id
          and not exists(
            select 1 from public.user_course_selections selection
            where selection.course_id = course.id
          );
      end if;
      return old;
    end
    $$;
    create trigger user_course_selections_delete_personal_root
    after delete on public.user_course_selections
    for each row execute function private.delete_unselected_personal_course();

    create function private.capture_catalog_publication()
    returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger courses_catalog_publication_sync
    after update on public.courses for each row execute function
      private.capture_catalog_publication();
  `);
  if (beforeMigration) await beforeMigration(database);
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
  return database;
}

async function insertWorkspace(database, {
  workspaceId,
  ownerId = USER_A,
  roots,
  publication = null
}) {
  await database.query(
    `insert into private.authoring_workspaces(id, owner_id, title)
     values ($1, $2, 'Workspace de teste')`,
    [workspaceId, ownerId]
  );
  await database.query(
    `insert into private.educational_workspace_members(workspace_id, user_id)
     values ($1, $2)`,
    [workspaceId, ownerId]
  );
  for (const [position, root] of roots.entries()) {
    await database.query(
      `insert into private.authoring_workspace_entities(
         workspace_id, entity_type, entity_id, position, content
       ) values ($1, 'course', $2, $3, jsonb_build_object(
         'id', $2::text, 'title', $4::text, 'goal', 'Meta'
       ))`,
      [workspaceId, root.id, position, root.title]
    );
  }
  if (publication) {
    await database.query(
      `insert into private.authoring_workspace_publications(
         workspace_id, workspace_course_id, target, course_id, content_hash
       ) values ($1, $2, $3, $4, $5)`,
      [
        workspaceId,
        publication.rootId,
        publication.target || "private",
        publication.courseId,
        HASH
      ]
    );
  }
}

test("migração executa e fecha composições em UPDATE e DELETE físicos", async () => {
  const database = await prepareDatabase();
  try {
    const singleWorkspace = "10000000-0000-4000-8000-000000000001";
    const singleCourse = "20000000-0000-4000-8000-000000000001";
    const singleSelection = "30000000-0000-4000-8000-000000000001";
    await database.query(
      `insert into public.courses(
         id, owner_id, current_revision_hash, content_hash
       ) values ($1, $2, $3, $3)`,
      [singleCourse, USER_A, HASH]
    );
    await insertWorkspace(database, {
      workspaceId: singleWorkspace,
      roots: [{ id: "course-single", title: "Curso único" }],
      publication: {
        rootId: "course-single",
        courseId: singleCourse
      }
    });
    await database.query(
      `insert into public.user_course_selections(id, user_id, course_id)
       values ($1, $2, $3)`,
      [singleSelection, USER_A, singleCourse]
    );

    await database.query(
      "delete from public.user_course_selections where id = $1",
      [singleSelection]
    );
    assert.equal((await database.query(
      "select count(*)::integer as value from public.courses where id = $1",
      [singleCourse]
    )).rows[0].value, 0);
    const closedSingle = (await database.query(
      `select deleted_at is not null as deleted
       from private.authoring_workspaces where id = $1`,
      [singleWorkspace]
    )).rows[0];
    assert.equal(closedSingle.deleted, true);

    const multiWorkspace = "10000000-0000-4000-8000-000000000002";
    const multiCourse = "20000000-0000-4000-8000-000000000002";
    const multiSelection = "30000000-0000-4000-8000-000000000002";
    await database.query(
      `insert into public.courses(
         id, owner_id, current_revision_hash, content_hash
       ) values ($1, $2, $3, $3)`,
      [multiCourse, USER_A, HASH]
    );
    await insertWorkspace(database, {
      workspaceId: multiWorkspace,
      roots: [
        { id: "course-a", title: "Curso A" },
        { id: "course-b", title: "Curso B" }
      ],
      publication: { rootId: "course-a", courseId: multiCourse }
    });
    await database.query(
      `insert into public.user_course_selections(id, user_id, course_id)
       values ($1, $2, $3)`,
      [multiSelection, USER_A, multiCourse]
    );
    await database.query(
      "delete from public.user_course_selections where id = $1",
      [multiSelection]
    );
    const retained = (await database.query(
      `select revision, deleted_at
       from private.authoring_workspaces where id = $1`,
      [multiWorkspace]
    )).rows[0];
    assert.equal(Number(retained.revision), 2);
    assert.equal(retained.deleted_at, null);
    assert.deepEqual((await database.query(
      `select entity_id, position
       from private.authoring_workspace_entities
       where workspace_id = $1 and entity_type = 'course'
       order by position`,
      [multiWorkspace]
    )).rows, [{ entity_id: "course-b", position: 0 }]);
  } finally {
    await database.close();
  }
});

test("upgrade reconcilia somente identidades comprovadas e preserva projetos", async () => {
  const archivedCourse = "22000000-0000-4000-8000-000000000001";
  const activeCourse = "22000000-0000-4000-8000-000000000002";
  const staleCourse = "22000000-0000-4000-8000-000000000003";
  const ambiguousCourse = "22000000-0000-4000-8000-000000000004";
  const archivedWorkspace = "12000000-0000-4000-8000-000000000001";
  const missingSourceWorkspace = "12000000-0000-4000-8000-000000000002";
  const olderActiveWorkspace = "12000000-0000-4000-8000-000000000003";
  const currentActiveWorkspace = "12000000-0000-4000-8000-000000000004";
  const staleWorkspace = "12000000-0000-4000-8000-000000000005";
  const ambiguousWorkspace = "12000000-0000-4000-8000-000000000006";
  const database = await prepareDatabase({
    beforeMigration: async (pendingDatabase) => {
      await pendingDatabase.query(
        `insert into public.courses(
           id, owner_id, status, deleted_at, document_storage_enabled,
           current_revision_hash, content_hash
         ) values
           ($1, $5, 'archived', now(), false, $6, $6),
           ($2, $5, 'published', null, true, $6, $6),
           ($3, $5, 'published', null, true, $6, $6),
           ($4, $5, 'published', null, true, $6, $6)`,
        [
          archivedCourse,
          activeCourse,
          staleCourse,
          ambiguousCourse,
          USER_A,
          HASH
        ]
      );
      await insertWorkspace(pendingDatabase, {
        workspaceId: archivedWorkspace,
        roots: [
          { id: "archived-root", title: "Publicação arquivada" },
          { id: "retained-root", title: "Projeto preservado" }
        ],
        publication: {
          rootId: "archived-root",
          courseId: archivedCourse
        }
      });
      for (const [workspaceId, sourceCourseId, sourceHash, roots] of [
        [missingSourceWorkspace, null, HASH, [
          { id: "missing-root", title: "Origem ausente" }
        ]],
        [olderActiveWorkspace, activeCourse, STALE_HASH, [
          { id: "older-root", title: "Origem anterior" }
        ]],
        [currentActiveWorkspace, activeCourse, HASH, [
          { id: "current-root", title: "Origem corrente" }
        ]],
        [staleWorkspace, staleCourse, STALE_HASH, [
          { id: "stale-root", title: "Somente revisão anterior" }
        ]],
        [ambiguousWorkspace, ambiguousCourse, HASH, [
          { id: "ambiguous-a", title: "Raiz A" },
          { id: "ambiguous-b", title: "Raiz B" }
        ]]
      ]) {
        await insertWorkspace(pendingDatabase, {
          workspaceId,
          roots
        });
        await pendingDatabase.query(
          `update private.authoring_workspaces
           set source_course_id = $2, source_revision_hash = $3
           where id = $1`,
          [workspaceId, sourceCourseId, sourceHash]
        );
      }
      await pendingDatabase.query(
        `update private.authoring_workspaces
         set source_course_id = $2, source_revision_hash = $3
         where id = $1`,
        [archivedWorkspace, archivedCourse, HASH]
      );
      await pendingDatabase.query(
        `update private.authoring_workspaces
         set updated_at = case id
           when $1 then now() - interval '1 day'
           when $2 then now()
           else updated_at
         end
         where id in ($1, $2)`,
        [olderActiveWorkspace, currentActiveWorkspace]
      );
    }
  });
  try {
    const rows = (await database.query(
      `select id, deleted_at is not null as deleted, source_course_id
       from private.authoring_workspaces
       where id in ($1, $2, $3, $4, $5, $6)
       order by id`,
      [
        archivedWorkspace,
        missingSourceWorkspace,
        olderActiveWorkspace,
        currentActiveWorkspace,
        staleWorkspace,
        ambiguousWorkspace
      ]
    )).rows;
    assert.deepEqual(rows, [
      { id: archivedWorkspace, deleted: false, source_course_id: null },
      { id: missingSourceWorkspace, deleted: false, source_course_id: null },
      { id: olderActiveWorkspace, deleted: false, source_course_id: null },
      {
        id: currentActiveWorkspace,
        deleted: false,
        source_course_id: activeCourse
      },
      { id: staleWorkspace, deleted: false, source_course_id: null },
      { id: ambiguousWorkspace, deleted: false, source_course_id: null }
    ]);
    assert.deepEqual((await database.query(
      `select entity_id, position
       from private.authoring_workspace_entities
       where workspace_id = $1 and entity_type = 'course'
       order by position`,
      [archivedWorkspace]
    )).rows, [{ entity_id: "retained-root", position: 0 }]);
    assert.deepEqual((await database.query(
      `select entity_id
       from private.authoring_workspace_entities
       where workspace_id in ($1, $2, $3)
         and entity_type = 'course'
       order by entity_id`,
      [olderActiveWorkspace, staleWorkspace, ambiguousWorkspace]
    )).rows, [
      { entity_id: "ambiguous-a" },
      { entity_id: "ambiguous-b" },
      { entity_id: "older-root" },
      { entity_id: "stale-root" }
    ]);
    assert.deepEqual((await database.query(
      `select workspace_id, course_id
       from private.authoring_workspace_publications
       where course_id = $1`,
      [activeCourse]
    )).rows, [{
      workspace_id: currentActiveWorkspace,
      course_id: activeCourse
    }]);
    assert.equal((await database.query(
      `select count(*)::integer as value
       from private.authoring_workspace_publications
       where course_id in ($1, $2, $3)`,
      [archivedCourse, staleCourse, ambiguousCourse]
    )).rows[0].value, 0);
    await database.query(
      `update public.courses
       set document_storage_enabled = false
       where id = $1`,
      [activeCourse]
    );
    assert.equal((await database.query(
      `select deleted_at is not null as deleted
       from private.authoring_workspaces where id = $1`,
      [currentActiveWorkspace]
    )).rows[0].deleted, true);
  } finally {
    await database.close();
  }
});

test("excluir a raiz de origem libera uma nova composição sem apagar as demais", async () => {
  const database = await prepareDatabase();
  try {
    const courseId = "23000000-0000-4000-8000-000000000001";
    const composedWorkspace = "13000000-0000-4000-8000-000000000001";
    const reopenedWorkspace = "13000000-0000-4000-8000-000000000002";
    await database.query(
      `insert into public.courses(
         id, owner_id, contract_key, current_revision_hash, content_hash
       ) values ($1, $2, 'source-root', $3, $3)`,
      [courseId, USER_A, HASH]
    );
    await insertWorkspace(database, {
      workspaceId: composedWorkspace,
      roots: [
        { id: "source-root", title: "Raiz da publicação" },
        { id: "independent-root", title: "Outra raiz" }
      ],
      publication: { rootId: "source-root", courseId }
    });
    await database.query(
      `update private.authoring_workspaces
       set source_course_id = $2, source_revision_hash = $3
       where id = $1`,
      [composedWorkspace, courseId, HASH]
    );

    await database.query(
      `delete from private.authoring_workspace_entities
       where workspace_id = $1
         and entity_type = 'course'
         and entity_id = 'source-root'`,
      [composedWorkspace]
    );
    const retained = (await database.query(
      `select source_course_id, source_revision_hash, deleted_at
       from private.authoring_workspaces where id = $1`,
      [composedWorkspace]
    )).rows[0];
    assert.equal(retained.source_course_id, null);
    assert.equal(retained.source_revision_hash, null);
    assert.equal(retained.deleted_at, null);
    assert.deepEqual((await database.query(
      `select entity_id from private.authoring_workspace_entities
       where workspace_id = $1 and entity_type = 'course'`,
      [composedWorkspace]
    )).rows, [{ entity_id: "independent-root" }]);
    assert.equal((await database.query(
      `select count(*)::integer as value
       from private.authoring_workspace_publications
       where course_id = $1`,
      [courseId]
    )).rows[0].value, 0);

    const reservation = (await database.query(
      `select public.resume_or_reserve_authoring_workspace_v1(
         $1, $2, $3, 'reopen-source-0001', $4
       ) as result`,
      [USER_A, courseId, reopenedWorkspace, HASH]
    )).rows[0].result;
    assert.equal(reservation.reservationState, "reserved");
    assert.equal(reservation.workspaceId, reopenedWorkspace);
  } finally {
    await database.close();
  }
});

test("retirada oficial limpa duas seleções e todo estado dependente", async () => {
  const database = await prepareDatabase();
  try {
    const official = "40000000-0000-4000-8000-000000000001";
    const selectionA = "50000000-0000-4000-8000-000000000001";
    const selectionB = "50000000-0000-4000-8000-000000000002";
    const sharedSelection = "50000000-0000-4000-8000-000000000003";
    const officialWorkspace = "60000000-0000-4000-8000-000000000001";
    const sharedWorkspace = "60000000-0000-4000-8000-000000000002";
    const sharedPrivate = "40000000-0000-4000-8000-000000000002";
    const dualPrivate = "40000000-0000-4000-8000-000000000003";
    await database.query(
      `insert into public.courses(
         id, owner_id, current_revision_hash, content_hash
       ) values
         ($1, null, $4, $4),
         ($2, $5, $4, $4),
         ($3, $5, $4, $4)`,
      [official, sharedPrivate, dualPrivate, HASH, USER_A]
    );
    await insertWorkspace(database, {
      workspaceId: officialWorkspace,
      roots: [{ id: "official-root", title: "Curso oficial" }],
      publication: {
        rootId: "official-root",
        courseId: official,
        target: "catalog"
      }
    });
    await database.query(
      `insert into private.authoring_workspace_publications(
         workspace_id, workspace_course_id, target, course_id, content_hash
       ) values ($1, 'official-root', 'private', $2, $3)`,
      [officialWorkspace, dualPrivate, HASH]
    );
    await insertWorkspace(database, {
      workspaceId: sharedWorkspace,
      roots: [{ id: "shared-root", title: "Curso compartilhado" }],
      publication: {
        rootId: "shared-root",
        courseId: sharedPrivate,
        target: "private"
      }
    });
    await database.query(
      `insert into private.educational_workspace_members(
         workspace_id, user_id, role
       ) values ($1, $2, 'author')`,
      [sharedWorkspace, USER_B]
    );
    await database.query(
      `insert into public.user_course_selections(id, user_id, course_id)
       values ($1, $4, $6), ($2, $5, $6), ($3, $5, $7)`,
      [
        selectionA,
        selectionB,
        sharedSelection,
        USER_A,
        USER_B,
        official,
        sharedPrivate
      ]
    );
    await database.query(
      `insert into public.lesson_progress(id, selection_id)
       values
         ('70000000-0000-4000-8000-000000000001', $1),
         ('70000000-0000-4000-8000-000000000002', $2)`,
      [selectionA, selectionB]
    );

    await database.query(
      "select set_config('request.jwt.claim.sub', $1, false)",
      [USER_B]
    );
    const publisherTrails = (await database.query(
      "select public.list_trail_items_v1(100, null, null) as result"
    )).rows[0].result;
    const officialItem = publisherTrails.items.find(
      (item) => item.workspaceId === officialWorkspace
    );
    assert.equal(officialItem?.source, "workspace");
    assert.equal(officialItem?.courseId, official);
    assert.equal(officialItem?.origin, "catalog");
    assert.equal(officialItem?.canRemove, true);
    const sharedItem = publisherTrails.items.find(
      (item) => item.workspaceId === sharedWorkspace
    );
    assert.equal(sharedItem?.courseId, sharedPrivate);
    assert.equal(sharedItem?.origin, "private");
    assert.equal(sharedItem?.canRemove, false);
    const reused = (await database.query(
      `select public.resume_or_reserve_authoring_workspace_v1(
         $1, $2, '61000000-0000-4000-8000-000000000001',
         'publisher-open-0001', $3
       ) as result`,
      [USER_B, official, HASH]
    )).rows[0].result;
    assert.equal(reused.workspaceId, officialWorkspace);
    await database.query(
      "delete from private.catalog_publishers where user_id = $1",
      [USER_B]
    );
    assert.equal((await database.query(
      `select private.educational_workspace_can_v1(
         $1, $2, 'author'
       ) as allowed`,
      [officialWorkspace, USER_B]
    )).rows[0].allowed, false);
    const trailsAfterRevocation = (await database.query(
      "select public.list_trail_items_v1(100, null, null) as result"
    )).rows[0].result;
    assert(!trailsAfterRevocation.items.some(
      (item) => item.workspaceId === officialWorkspace
    ));
    await assert.rejects(
      database.query(
        `select public.resume_or_reserve_authoring_workspace_v1(
           $1, $2, '61000000-0000-4000-8000-000000000002',
           'publisher-open-0002', $3
         )`,
        [USER_B, official, HASH]
      ),
      (error) => error?.code === "42501"
    );

    await database.query(
      `update public.courses
       set document_storage_enabled = false
       where id = $1`,
      [official]
    );
    await assert.rejects(
      database.query(
        `insert into public.user_course_selections(id, user_id, course_id)
         values ('50000000-0000-4000-8000-000000000004', $1, $2)`,
        [USER_A, official]
      ),
      (error) => error?.code === "40001"
    );

    assert.equal((await database.query(
      `select count(*)::integer as value
       from public.user_course_selections
       where course_id = $1`,
      [official]
    )).rows[0].value, 0);
    assert.equal((await database.query(
      "select count(*)::integer as value from public.lesson_progress"
    )).rows[0].value, 0);
    assert.equal((await database.query(
      `select count(*)::integer as value from private.sync_changes
       where entity_type = 'courseSelections' and operation = 'delete'`
    )).rows[0].value, 2);
    assert.equal((await database.query(
      `select deleted_at is not null as deleted
       from private.authoring_workspaces where id = $1`,
      [officialWorkspace]
    )).rows[0].deleted, true);
  } finally {
    await database.close();
  }
});

test("reserva concorrente e exclusão de workspace aplicam CAS e replay", async () => {
  const database = await prepareDatabase();
  try {
    const reservationCourseId = "80000000-0000-4000-8000-000000000001";
    const workspaceId = "81000000-0000-4000-8000-000000000001";
    await database.query(
      `insert into public.courses(
         id, owner_id, current_revision_hash, content_hash
       ) values ($1, $2, $3, $3)`,
      [reservationCourseId, USER_A, HASH]
    );
    await database.query(
      `select public.resume_or_reserve_authoring_workspace_v1(
         $1, $2, $3, 'reserve-request-0001', $4
       )`,
      [USER_A, reservationCourseId, workspaceId, HASH]
    );
    await assert.rejects(
      database.query(
        `select public.resume_or_reserve_authoring_workspace_v1(
           $1, $2, $3, 'reserve-request-0002', $4
         )`,
        [USER_A, reservationCourseId, workspaceId, HASH]
      ),
      (error) => error?.code === "40001"
    );
    await database.query(
      "update public.courses set status = 'archived' where id = $1",
      [reservationCourseId]
    );
    assert.equal((await database.query(
      `select count(*)::integer as value
       from private.authoring_course_workspace_reservations
       where course_id = $1`,
      [reservationCourseId]
    )).rows[0].value, 0);
    await assert.rejects(
      database.query(
        `select public.finalize_reserved_authoring_workspace_v1(
           $1, $2, 'reserve-request-0001', $3, 'Curso reservado',
           $4, $3, null, '', '[]'::jsonb
         )`,
        [USER_A, workspaceId, HASH, reservationCourseId]
      ),
      (error) => error?.code === "42501"
    );

    const courseId = "80000000-0000-4000-8000-000000000002";
    await database.query(
      `insert into public.courses(
         id, owner_id, current_revision_hash, content_hash
       ) values ($1, $2, $3, $3)`,
      [courseId, USER_A, HASH]
    );
    const boundWorkspace = "81100000-0000-4000-8000-000000000001";
    const conflictingWorkspace = "81100000-0000-4000-8000-000000000002";
    await insertWorkspace(database, {
      workspaceId: boundWorkspace,
      roots: [{ id: "bound-root", title: "Composição corrente" }],
      publication: { rootId: "bound-root", courseId }
    });
    await insertWorkspace(database, {
      workspaceId: conflictingWorkspace,
      roots: [{ id: "conflicting-root", title: "Composição concorrente" }]
    });
    await assert.rejects(
      database.query(
        `insert into private.authoring_workspace_publications(
           workspace_id, workspace_course_id, target, course_id, content_hash
         ) values ($1, 'conflicting-root', 'private', $2, $3)`,
        [conflictingWorkspace, courseId, HASH]
      ),
      (error) => error?.code === "40001"
        && /composição corrente está em outro workspace/iu.test(error.message)
    );

    const deleteWorkspaceId = "82000000-0000-4000-8000-000000000001";
    await insertWorkspace(database, {
      workspaceId: deleteWorkspaceId,
      roots: [{ id: "delete-me", title: "Excluir" }]
    });
    await database.query(
      `insert into private.authoring_workspace_requests(
         owner_id, request_id, operation, payload_hash, workspace_id, result
       ) values ($1, 'old-request-0001', 'update_metadata', $2, $3::uuid,
         jsonb_build_object('workspaceId', $3::text))`,
      [USER_A, HASH, deleteWorkspaceId]
    );
    await database.query(
      `insert into private.authoring_workspace_observation_receipts(
         actor_id, request_id, result
       ) values ($1, 'observation-old-0001',
         jsonb_build_object('workspaceId', $2::text))`,
      [USER_A, deleteWorkspaceId]
    );
    await database.query(
      `insert into private.educational_workspace_receipts(
         actor_id, request_id, result
       ) values ($1, 'education-old-0001',
         jsonb_build_object('workspaceId', $2::text))`,
      [USER_A, deleteWorkspaceId]
    );
    await assert.rejects(
      database.query(
        `select public.delete_authoring_workspace_v5(
           $1, $2, 'delete-request-0001', $3, 2
         )`,
        [USER_A, deleteWorkspaceId, HASH]
      ),
      (error) => error?.code === "40001"
    );
    const removed = (await database.query(
      `select public.delete_authoring_workspace_v5(
         $1, $2, 'delete-request-0001', $3, 1
       ) as result`,
      [USER_A, deleteWorkspaceId, HASH]
    )).rows[0].result;
    assert.equal(removed.deleted, true);
    assert.equal(removed.idempotent, false);
    const replayed = (await database.query(
      `select public.delete_authoring_workspace_v5(
         $1, $2, 'delete-request-0001', $3, 1
       ) as result`,
      [USER_A, deleteWorkspaceId, HASH]
    )).rows[0].result;
    assert.equal(replayed.idempotent, true);
    assert.deepEqual((await database.query(
      `select request_id
       from private.authoring_workspace_requests
       where workspace_id = $1
       order by request_id`,
      [deleteWorkspaceId]
    )).rows, [{ request_id: "delete-request-0001" }]);
    assert.equal((await database.query(
      `select count(*)::integer as value
       from private.authoring_workspace_observation_receipts
       where result->>'workspaceId' = $1`,
      [deleteWorkspaceId]
    )).rows[0].value, 0);
    assert.equal((await database.query(
      `select count(*)::integer as value
       from private.educational_workspace_receipts
       where result->>'workspaceId' = $1`,
      [deleteWorkspaceId]
    )).rows[0].value, 0);
  } finally {
    await database.close();
  }
});
