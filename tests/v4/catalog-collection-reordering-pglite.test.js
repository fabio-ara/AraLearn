import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260808021000_alphabetic_catalog.sql",
  import.meta.url
);

const EDITOR_ID = "10000000-0000-4000-8000-000000000001";
const COLLECTION_Z = "20000000-0000-4000-8000-000000000001";
const COLLECTION_A = "20000000-0000-4000-8000-000000000002";
const COLLECTION_OTHER = "20000000-0000-4000-8000-000000000004";
const COURSE_Z = "30000000-0000-4000-8000-000000000001";
const COURSE_A = "30000000-0000-4000-8000-000000000002";
const PLACEMENT_Z = "40000000-0000-4000-8000-000000000001";
const PLACEMENT_A = "40000000-0000-4000-8000-000000000002";

async function prepareDatabase() {
  const database = new PGlite();
  const historicalSchema = `
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;

    create table auth.users(id uuid primary key);
    insert into auth.users(id) values ('${EDITOR_ID}');

    create function auth.uid()
    returns uuid language sql stable as $$ select null::uuid $$;

    create table public.courses(
      id uuid primary key,
      owner_id uuid,
      status text not null,
      contract_key text not null unique,
      title text not null,
      goal text not null default '',
      publication_seq bigint not null default 1,
      content_hash text not null,
      current_revision_hash text,
      revision_artifact_hash text,
      module_count bigint not null default 0,
      lesson_count bigint not null default 0,
      microsequence_count bigint not null default 0,
      card_count bigint not null default 0,
      document_storage_enabled boolean not null default true,
      catalog_revision bigint not null default 1,
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );

    create table public.user_course_selections(
      id uuid primary key,
      user_id uuid not null,
      course_id uuid not null references public.courses(id)
    );

    create table public.catalog_collections(
      id uuid primary key,
      contract_key text not null unique,
      title text not null,
      description text not null default '',
      position integer not null default 0 check (position >= 0),
      is_published boolean not null default true,
      revision bigint not null default 1 check (revision > 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );

    create table public.catalog_collection_courses(
      id uuid primary key,
      collection_id uuid not null references public.catalog_collections(id),
      course_id uuid not null references public.courses(id),
      position integer not null default 0 check (position >= 0),
      revision bigint not null default 1 check (revision > 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );

    create function private.touch_revision()
    returns trigger language plpgsql set search_path = pg_catalog as $$
    begin
      new.updated_at := now();
      new.revision := old.revision + 1;
      return new;
    end
    $$;
    create trigger catalog_collections_touch_revision
    before update on public.catalog_collections
    for each row execute function private.touch_revision();
    create trigger catalog_collection_courses_touch_revision
    before update on public.catalog_collection_courses
    for each row execute function private.touch_revision();

    create table private.catalog_management_receipts_v5(
      actor_id uuid not null references auth.users(id) on delete cascade,
      request_id text not null,
      operation text not null,
      payload_hash text not null,
      result jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '14 days',
      primary key(actor_id, request_id),
      constraint catalog_management_receipts_operation_v5 check (
        operation in (
          'create_collection', 'update_collection', 'retire_collection',
          'move_collection', 'move_course', 'remove_course'
        )
      )
    );

    create function private.require_workspace_actor_v4(
      p_actor_id uuid, p_scope text
    ) returns void language plpgsql security definer
    set search_path = pg_catalog, auth as $$
    begin
      if p_actor_id is null
         or not exists (select 1 from auth.users where id = p_actor_id) then
        raise exception 'Ator inválido.' using errcode = '42501';
      end if;
    end
    $$;

    create function private.require_workspace_actor_v5(
      p_actor_id uuid, p_scope text
    ) returns void language plpgsql security definer
    set search_path = pg_catalog, auth as $$
    begin
      if p_actor_id is null
         or not exists (select 1 from auth.users where id = p_actor_id) then
        raise exception 'Ator inválido.' using errcode = '42501';
      end if;
    end
    $$;

    create function private.can_publish_catalog_v5(p_actor_id uuid)
    returns boolean language sql stable security definer
    set search_path = pg_catalog, auth as $$
      select exists(select 1 from auth.users where id = p_actor_id)
    $$;

    create function private.require_catalog_admin_actor(
      p_actor_id uuid, p_owner_only boolean
    ) returns void language plpgsql security definer
    set search_path = pg_catalog, auth as $$
    begin
      if p_actor_id is null
         or not exists (select 1 from auth.users where id = p_actor_id) then
        raise exception 'Ator inválido.' using errcode = '42501';
      end if;
    end
    $$;

    create function private.has_active_app_role(
      p_actor_id uuid, p_role text
    ) returns boolean language sql stable security definer
    set search_path = pg_catalog, auth as $$
      select exists(select 1 from auth.users where id = p_actor_id)
    $$;

    create function private.catalog_management_payload_hash_v5(
      p_operation text, p_payload jsonb
    ) returns text language sql immutable security definer
    set search_path = pg_catalog as $$
      select md5(jsonb_build_object(
        'operation', p_operation, 'payload', p_payload
      )::text) || md5('aralearn:' || jsonb_build_object(
        'operation', p_operation, 'payload', p_payload
      )::text)
    $$;

    create function private.complete_catalog_management_v5(
      p_actor_id uuid,
      p_request_id text,
      p_operation text,
      p_payload_hash text,
      p_result jsonb
    ) returns jsonb language plpgsql security definer
    set search_path = pg_catalog, private as $$
    declare
      v_result jsonb := p_result || jsonb_build_object('idempotent', false);
    begin
      insert into private.catalog_management_receipts_v5(
        actor_id, request_id, operation, payload_hash, result
      ) values (
        p_actor_id, p_request_id, p_operation, p_payload_hash, v_result
      );
      return v_result;
    end
    $$;

    create function private.normalize_catalog_collection_positions_v5()
    returns void language sql as $$ select $$;
    create function private.normalize_catalog_course_positions_v5(uuid)
    returns void language sql as $$ select $$;

    create function public.move_catalog_collection_v5(
      uuid, uuid, text, bigint, integer
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.move_catalog_course_v5(
      uuid, uuid, text, bigint, uuid, integer
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;

    create function public.publish_authoring_workspace_course_v5(
      p_owner_id uuid,
      p_workspace_id uuid,
      p_request_id text,
      p_payload_hash text,
      p_expected_revision bigint,
      p_target text,
      p_completion_state text,
      p_existing_course_id uuid,
      p_expected_content_hash text,
      p_collection_id uuid,
      p_submission_id uuid,
      p_metadata jsonb,
      p_artifact jsonb
    ) returns jsonb language plpgsql as $function$
    declare
      v_course_id uuid := p_existing_course_id;
    begin
    update public.catalog_collection_courses item
    set collection_id = p_collection_id,
        position = coalesce((
          select max(other.position) + 1
          from public.catalog_collection_courses other
          where other.collection_id = p_collection_id
            and other.course_id <> v_course_id
            and other.deleted_at is null
        ), 0),
        deleted_at = null,
        updated_at = now()
    where item.course_id = v_course_id and item.deleted_at is null;
    if not found then
      insert into public.catalog_collection_courses(
        collection_id, course_id, position
      ) values (
        p_collection_id, v_course_id,
        coalesce((
          select max(item.position) + 1
          from public.catalog_collection_courses item
          where item.collection_id = p_collection_id
            and item.deleted_at is null
        ), 0)
      );
    end if;
      return '{}'::jsonb;
    end;
    $function$;

    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable as $$
      select jsonb_build_object(
        'schemaRevision', '20260808020000',
        'features', jsonb_build_array(
          'catalog-collection-ordering-v1', 'unified-trails-v1'
        )
      )
    $$;

    insert into public.catalog_collections(
      id, contract_key, title, description, position
    ) values
      ('${COLLECTION_Z}', 'zeta', 'Zeta', '', 0),
      ('${COLLECTION_A}', 'arvore', 'Árvore', '', 99),
      ('${COLLECTION_OTHER}', 'outros', 'Outros cursos', '', 1);

    insert into public.courses(
      id, owner_id, status, contract_key, title, goal, content_hash
    ) values
      (
        '${COURSE_Z}', null, 'published', 'curso-z', 'Zulu', '',
        repeat('a', 64)
      ),
      (
        '${COURSE_A}', null, 'published', 'curso-a', 'Abelha', '',
        repeat('b', 64)
      );

    insert into public.catalog_collection_courses(
      id, collection_id, course_id, position
    ) values
      ('${PLACEMENT_Z}', '${COLLECTION_Z}', '${COURSE_Z}', 99),
      ('${PLACEMENT_A}', '${COLLECTION_Z}', '${COURSE_A}', 0);
  `;
  // A função implantada foi criada por uma migration com CRLF. O PostgreSQL
  // conserva essas quebras em prosrc e pg_get_functiondef, enquanto a migration
  // corretiva versionada usa LF.
  await database.exec(historicalSchema.replace(/\n/gu, "\r\n"));
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
  return database;
}

test("migration remove posições e contratos de reordenação", async (t) => {
  const database = await prepareDatabase();
  t.after(() => database.close());

  const columns = await database.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('catalog_collections', 'catalog_collection_courses')
      and column_name = 'position'
  `);
  assert.deepEqual(columns.rows, []);

  const signatures = await database.query(`
    select to_regprocedure(
      'public.move_catalog_collection_v5(uuid,uuid,text,bigint,integer)'
    ) as move_collection,
    to_regprocedure(
      'public.move_catalog_course_v5(uuid,uuid,text,bigint,uuid,integer)'
    ) as legacy_move_course,
    to_regprocedure(
      'public.move_catalog_course_v5(uuid,uuid,text,bigint,uuid)'
    ) as transfer_course
  `);
  assert.equal(signatures.rows[0].move_collection, null);
  assert.equal(signatures.rows[0].legacy_move_course, null);
  assert.ok(signatures.rows[0].transfer_course);

  const publication = await database.query(`
    select pg_get_functiondef(
      'public.publish_authoring_workspace_course_v5(
        uuid,uuid,text,text,bigint,text,text,uuid,text,uuid,uuid,jsonb,jsonb
      )'::regprocedure
    ) as definition
  `);
  assert.doesNotMatch(publication.rows[0].definition, /\bposition\b/u);
  assert.match(
    publication.rows[0].definition,
    /insert into public\.catalog_collection_courses\(\s*collection_id, course_id\s*\)/u
  );

  const operations = await database.query(`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conname = 'catalog_management_receipts_operation_v5'
  `);
  assert.doesNotMatch(operations.rows[0].definition, /move_collection/u);
});

test("paginação permanece estável por identidade, não por título ou posição", async (t) => {
  const database = await prepareDatabase();
  t.after(() => database.close());

  const collections = (await database.query(
    `select public.list_authoring_catalog_collections_v4(
       $1, 2, null, ''
     ) as result`,
    [EDITOR_ID]
  )).rows[0].result;
  assert.deepEqual(
    collections.items.map((item) => item.collectionId),
    [COLLECTION_Z, COLLECTION_A]
  );
  assert.deepEqual(collections.nextCursor, { afterId: COLLECTION_A });
  assert.ok(collections.items.every((item) => !("position" in item)));

  const nextCollections = (await database.query(
    `select public.list_authoring_catalog_collections_v4(
       $1, 2, $2, ''
     ) as result`,
    [EDITOR_ID, collections.nextCursor.afterId]
  )).rows[0].result;
  assert.deepEqual(
    nextCollections.items.map((item) => item.collectionId),
    [COLLECTION_OTHER]
  );

  const courses = (await database.query(
    `select public.list_authoring_catalog_courses_v4(
       $1, $2, 1, null, ''
     ) as result`,
    [EDITOR_ID, COLLECTION_Z]
  )).rows[0].result;
  assert.deepEqual(
    courses.items.map((item) => item.courseId),
    [COURSE_Z]
  );
  assert.deepEqual(courses.nextCursor, { afterId: COURSE_Z });
  assert.ok(courses.items.every((item) => !("position" in item)));
});

test("mover curso é somente transferência com CAS e idempotência", async (t) => {
  const database = await prepareDatabase();
  t.after(() => database.close());

  const transferred = (await database.query(
    `select public.move_catalog_course_v5(
       $1, $2, $3, 1, $4
     ) as result`,
    [EDITOR_ID, COURSE_Z, "transfer-course-0001", COLLECTION_A]
  )).rows[0].result;
  assert.equal(transferred.status, "moved");
  assert.equal(transferred.fromCollectionId, COLLECTION_Z);
  assert.equal(transferred.collectionId, COLLECTION_A);
  assert.equal(transferred.placementRevision, 2);
  assert.equal(transferred.idempotent, false);
  assert.ok(!("position" in transferred));

  const replay = (await database.query(
    `select public.move_catalog_course_v5(
       $1, $2, $3, 1, $4
     ) as result`,
    [EDITOR_ID, COURSE_Z, "transfer-course-0001", COLLECTION_A]
  )).rows[0].result;
  assert.equal(replay.idempotent, true);
  assert.equal(replay.placementRevision, 2);

  await assert.rejects(
    database.query(
      `select public.move_catalog_course_v5(
         $1, $2, $3, 1, $4
       ) as result`,
      [EDITOR_ID, COURSE_Z, "transfer-course-0002", COLLECTION_Z]
    ),
    /Revisão da classificação desatualizada/u
  );
});

test("manifesto anuncia apenas o catálogo alfabético", async (t) => {
  const database = await prepareDatabase();
  t.after(() => database.close());

  const manifest = (await database.query(
    "select public.get_aralearn_runtime_manifest() as result"
  )).rows[0].result;
  assert.equal(manifest.schemaRevision, "20260808021000");
  assert.ok(manifest.features.includes("alphabetic-catalog-v1"));
  assert.ok(manifest.features.includes("unified-trails-v1"));
  assert.ok(!manifest.features.includes("catalog-collection-ordering-v1"));
});
