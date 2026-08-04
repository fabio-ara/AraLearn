import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260804170000_catalog_collection_reordering.sql",
  import.meta.url
);

const EDITOR_ID = "10000000-0000-4000-8000-000000000001";
const PRIVATE_ID = "10000000-0000-4000-8000-000000000002";
const COLLECTION_A = "20000000-0000-4000-8000-000000000001";
const COLLECTION_B = "20000000-0000-4000-8000-000000000002";
const COLLECTION_C = "20000000-0000-4000-8000-000000000003";
const COLLECTION_OTHER = "20000000-0000-4000-8000-000000000004";

async function prepareDatabase({
  structuralTitle = "Outros cursos",
  structuralDescription =
    "Cursos oficiais ainda não associados a uma coleção temática."
} = {}) {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;

    create table auth.users(id uuid primary key);
    insert into auth.users(id) values ('${EDITOR_ID}'), ('${PRIVATE_ID}');

    create table private.app_role_assignments(
      user_id uuid not null references auth.users(id),
      role text not null,
      active boolean not null default true,
      revoked_at timestamptz
    );
    insert into private.app_role_assignments(user_id, role)
    values ('${EDITOR_ID}', 'catalog_publisher');

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

    create table private.catalog_management_receipts_v5(
      actor_id uuid not null references auth.users(id) on delete cascade,
      request_id text not null,
      operation text not null,
      payload_hash text not null,
      result jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '14 days',
      primary key(actor_id, request_id),
      constraint catalog_management_receipts_id_v5 check (
        request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
      ),
      constraint catalog_management_receipts_operation_v5 check (
        operation in (
          'create_collection', 'update_collection', 'retire_collection',
          'move_course', 'remove_course'
        )
      ),
      constraint catalog_management_receipts_hash_v5 check (
        payload_hash ~ '^[0-9a-f]{64}$'
      )
    );

    create function private.require_workspace_actor_v5(
      p_actor_id uuid,
      p_scope text
    ) returns void language plpgsql security definer
    set search_path = pg_catalog, private as $$
    begin
      if p_scope <> 'catalog:manage'
         or not exists (
           select 1 from auth.users actor where actor.id = p_actor_id
         ) then
        raise exception 'Ator inválido.' using errcode = '42501';
      end if;
    end
    $$;

    create function private.can_publish_catalog_v5(p_actor_id uuid)
    returns boolean language sql stable security definer
    set search_path = pg_catalog, private as $$
      select exists (
        select 1
        from private.app_role_assignments assignment
        where assignment.user_id = p_actor_id
          and assignment.role in ('owner', 'catalog_publisher')
          and assignment.active
          and assignment.revoked_at is null
      )
    $$;

    create function private.catalog_management_payload_hash_v5(
      p_operation text,
      p_payload jsonb
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
    begin
      insert into private.catalog_management_receipts_v5(
        actor_id, request_id, operation, payload_hash, result
      ) values (
        p_actor_id, p_request_id, p_operation, p_payload_hash,
        p_result || jsonb_build_object('idempotent', false)
      );
      return p_result || jsonb_build_object('idempotent', false);
    end
    $$;

    create function private.normalize_catalog_collection_positions_v5()
    returns void language sql security definer
    set search_path = pg_catalog, public as $$
      with ordered as materialized (
        select collection.id,
          row_number() over (
            order by
              case when collection.contract_key = 'outros' then 1 else 0 end,
              collection.position,
              collection.id
          )::integer - 1 as desired_position
        from public.catalog_collections collection
        where collection.is_published and collection.deleted_at is null
      )
      update public.catalog_collections collection
      set position = ordered.desired_position
      from ordered
      where collection.id = ordered.id
        and collection.position is distinct from ordered.desired_position
    $$;

    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable as $$ select '{}'::jsonb $$;

    insert into public.catalog_collections(
      id, contract_key, title, description, position
    ) values
      ('${COLLECTION_A}', 'concursos', 'Concursos', '', 0),
      ('${COLLECTION_B}', 'ia-dados', 'IA e dados', '', 1),
      ('${COLLECTION_C}', 'certificacoes', 'Certificações', '', 2),
      (
        '${COLLECTION_OTHER}', 'outros', '${structuralTitle}',
        '${structuralDescription}', 99
      );
  `);
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
  await database.exec(`
    create function public.update_catalog_collection_v5(
      p_actor_id uuid,
      p_collection_id uuid,
      p_request_id text,
      p_expected_revision bigint,
      p_title text,
      p_description text default null
    ) returns jsonb language plpgsql security definer
    set search_path = pg_catalog, public, private as $$
    declare
      v_payload_hash text;
      v_replay jsonb;
      v_collection public.catalog_collections%rowtype;
      v_result jsonb;
    begin
      v_payload_hash := private.catalog_management_payload_hash_v5(
        'update_collection',
        jsonb_build_object(
          'collectionId', p_collection_id,
          'expectedRevision', p_expected_revision,
          'title', p_title,
          'description', p_description
        )
      );
      v_replay := private.begin_catalog_management_v5(
        p_actor_id, p_request_id, 'update_collection', v_payload_hash
      );
      if v_replay is not null then return v_replay; end if;
      select * into v_collection
      from public.catalog_collections collection
      where collection.id = p_collection_id
      for update;
      if v_collection.revision <> p_expected_revision then
        raise exception 'Revisão da coleção desatualizada.'
          using errcode = '40001';
      end if;
      update public.catalog_collections collection
      set title = p_title,
          description = coalesce(p_description, collection.description)
      where collection.id = p_collection_id
      returning * into v_collection;
      v_result := jsonb_build_object(
        'status', 'updated',
        'collectionId', v_collection.id,
        'title', v_collection.title,
        'description', v_collection.description,
        'position', v_collection.position,
        'revision', v_collection.revision
      );
      return private.complete_catalog_management_v5(
        p_actor_id, p_request_id, 'update_collection',
        v_payload_hash, v_result
      );
    end
    $$;
  `);
  return database;
}

async function moveCollection(database, {
  actorId = EDITOR_ID,
  collectionId,
  requestId,
  expectedRevision,
  position
}) {
  return (await database.query(
    `select public.move_catalog_collection_v5(
       $1, $2, $3, $4, $5
     ) as result`,
    [actorId, collectionId, requestId, expectedRevision, position]
  )).rows[0].result;
}

async function activeOrder(database) {
  return (await database.query(
    `select id, contract_key, position, revision::integer
     from public.catalog_collections
     where is_published and deleted_at is null
     order by position, id`
  )).rows;
}

async function updateCollection(database, {
  collectionId,
  requestId,
  expectedRevision,
  title,
  description = null
}) {
  return (await database.query(
    `select public.update_catalog_collection_v5(
       $1, $2, $3, $4, $5, $6
     ) as result`,
    [
      EDITOR_ID, collectionId, requestId, expectedRevision,
      title, description
    ]
  )).rows[0].result;
}

test("reordenação persiste ordem compacta, CAS e replay sem mover Outros", async () => {
  const database = await prepareDatabase();
  try {
    const moved = await moveCollection(database, {
      collectionId: COLLECTION_C,
      requestId: "move-collection-request-0001",
      expectedRevision: 1,
      position: 0
    });
    assert.deepEqual(moved, {
      status: "moved",
      collectionId: COLLECTION_C,
      fromPosition: 2,
      position: 0,
      revision: 2,
      idempotent: false
    });
    assert.deepEqual((await activeOrder(database)).map((row) => [
      row.id, row.position
    ]), [
      [COLLECTION_C, 0],
      [COLLECTION_A, 1],
      [COLLECTION_B, 2],
      [COLLECTION_OTHER, 3]
    ]);

    const replay = await moveCollection(database, {
      collectionId: COLLECTION_C,
      requestId: "move-collection-request-0001",
      expectedRevision: 1,
      position: 0
    });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.revision, 2);

    await assert.rejects(
      moveCollection(database, {
        collectionId: COLLECTION_C,
        requestId: "move-collection-request-0001",
        expectedRevision: 1,
        position: 1
      }),
      (error) => error?.code === "23505"
    );
    await assert.rejects(
      moveCollection(database, {
        collectionId: COLLECTION_C,
        requestId: "move-collection-request-0002",
        expectedRevision: 1,
        position: 1
      }),
      (error) => error?.code === "40001"
    );

    const clamped = await moveCollection(database, {
      collectionId: COLLECTION_A,
      requestId: "move-collection-request-0003",
      expectedRevision: 2,
      position: 999
    });
    assert.equal(clamped.position, 2);
    assert.deepEqual((await activeOrder(database)).map((row) => [
      row.contract_key, row.position
    ]), [
      ["certificacoes", 0],
      ["ia-dados", 1],
      ["concursos", 2],
      ["outros", 3]
    ]);

    await assert.rejects(
      moveCollection(database, {
        collectionId: COLLECTION_OTHER,
        requestId: "move-collection-request-0004",
        expectedRevision: 2,
        position: 0
      }),
      (error) => error?.code === "23514"
    );
    assert.equal((await activeOrder(database)).at(-1).id, COLLECTION_OTHER);
  } finally {
    await database.close();
  }
});

test("conta sem papel editorial falha no banco sem alterar posições", async () => {
  const database = await prepareDatabase();
  try {
    const before = await activeOrder(database);
    await assert.rejects(
      moveCollection(database, {
        actorId: PRIVATE_ID,
        collectionId: COLLECTION_B,
        requestId: "private-move-collection-0001",
        expectedRevision: 1,
        position: 0
      }),
      (error) => error?.code === "42501"
    );
    assert.deepEqual(await activeOrder(database), before);
  } finally {
    await database.close();
  }
});

test("Outros conserva identidade sem bloquear normalização ou revisão", async () => {
  const database = await prepareDatabase({
    structuralTitle: "Diversos",
    structuralDescription: "Metadados desviados antes da proteção."
  });
  try {
    await assert.rejects(
      updateCollection(database, {
        collectionId: COLLECTION_OTHER,
        requestId: "rename-structural-collection-0001",
        expectedRevision: 2,
        title: "Diversos"
      }),
      (error) => error?.code === "23514"
        && /Outros cursos/u.test(error.message)
    );
    await assert.rejects(
      database.query(
        "delete from public.catalog_collections where id = $1",
        [COLLECTION_OTHER]
      ),
      (error) => error?.code === "23514"
    );

    const before = (await database.query(
      `select position, revision::integer
       from public.catalog_collections where id = $1`,
      [COLLECTION_OTHER]
    )).rows[0];
    await database.query(
      "update public.catalog_collections set position = 12 where id = $1",
      [COLLECTION_OTHER]
    );
    await database.query(
      "select private.normalize_catalog_collection_positions_v5()"
    );
    const after = (await database.query(
      `select title, description, position, revision::integer
       from public.catalog_collections where id = $1`,
      [COLLECTION_OTHER]
    )).rows[0];
    assert.equal(after.title, "Outros cursos");
    assert.equal(
      after.description,
      "Cursos oficiais ainda não associados a uma coleção temática."
    );
    assert.equal(after.position, 3);
    assert.equal(after.revision, before.revision + 2);
  } finally {
    await database.close();
  }
});
