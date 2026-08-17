import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { CoursePersonalStateRepository } from
  "../../src/persistence/CoursePersonalStateRepository.js";

const migrationUrl = new URL(
  "../../supabase/migrations/20260817140000_course_identity_cutover.sql",
  import.meta.url
);
const profileAccessMigrationUrl = new URL(
  "../../supabase/migrations/20260817150000_course_profiles_access.sql",
  import.meta.url
);

const OWNER = "00000000-0000-4000-8000-000000000001";
const EDITOR = "00000000-0000-4000-8000-000000000002";
const LEARNER = "00000000-0000-4000-8000-000000000003";
const OUTSIDER = "00000000-0000-4000-8000-000000000004";
const SECOND_OWNER = "00000000-0000-4000-8000-000000000005";
const WORKSPACES = Array.from({ length: 6 }, (_, index) =>
  `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);
const TOMBSTONE_WORKSPACES = Array.from({ length: 10 }, (_, index) =>
  `11000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);
const COURSES = Array.from({ length: 8 }, (_, index) =>
  `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);
const PUBLICATIONS = Array.from({ length: 4 }, (_, index) =>
  `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);
const PERSONAL_REQUEST = "50000000-0000-4000-8000-000000000001";
const PERSONAL_REQUEST_STALE = "50000000-0000-4000-8000-000000000002";

const EXPERIMENT_TABLES = [
  "authoring_experiments",
  "authoring_experiment_protocol_revisions",
  "authoring_experiment_factors",
  "authoring_experiment_factor_targets",
  "authoring_experiment_factor_levels",
  "authoring_experiment_conditions",
  "authoring_experiment_condition_levels",
  "authoring_experiment_condition_resource_sets",
  "authoring_experiment_invariants",
  "authoring_experiment_instruments",
  "authoring_experiment_base_revisions",
  "authoring_experiment_base_microsequences",
  "authoring_experiment_base_invariants",
  "authoring_experiment_variants",
  "authoring_experiment_variant_revisions",
  "authoring_experiment_variant_parameter_locks",
  "authoring_experiment_variant_allowed_resource_sets",
  "authoring_experiment_variant_microsequences",
  "authoring_experiment_difference_runs",
  "authoring_experiment_difference_hunks",
  "authoring_experiment_difference_pages",
  "authoring_experiment_diff_classifications",
  "authoring_experiment_difference_decisions",
  "authoring_experiment_variant_corrections",
  "authoring_experiment_variant_freezes",
  "authoring_experiment_enrollment_codes",
  "authoring_experiment_enrollments",
  "authoring_experiment_assignments",
  "authoring_experiment_requests",
  "authoring_experiment_participant_requests",
  "authoring_experiment_lock_write_tokens",
  "authoring_experiment_selection_write_tokens",
  "authoring_experiment_outcome_observations"
];

const legacyPersonalState = JSON.stringify({
  version: 1,
  progress: {
    version: 3,
    lessons: {
      "lesson-5": {
        cursorCardId: "card-5",
        completedCardIds: ["card-5"]
      }
    }
  },
  reviewMarks: { "card-5": "2026-08-17T12:00:00.000Z" },
  observations: {
    "card-5": {
      category: "possible_error",
      body: "Verificar a formulação desta Unidade de estudo.",
      updatedAt: "2026-08-17T12:00:00.000Z"
    }
  }
});

function memoryCache() {
  const values = new Map();
  return {
    async getCache(key) { return structuredClone(values.get(key) ?? null); },
    async putCache(key, value) {
      if (value == null) values.delete(key);
      else values.set(key, structuredClone(value));
    },
    async deleteCachePrefix(prefix) {
      for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
    }
  };
}

async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

async function actor(database, actorId, role = "authenticated") {
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actorId]);
  await database.query("select set_config('request.jwt.claim.role',$1,false)", [role]);
}

function cutoverEntities(index) {
  const suffix = String(index + 1);
  const definitions = index === 0 ? [
    { entityType: "module", entityId: "module-a", parentType: null, parentId: null, position: 0, content: { title: "Módulo A" } },
    { entityType: "lesson", entityId: "lesson-a", parentType: "module", parentId: "module-a", position: 0, content: { title: "Lição A" } },
    { entityType: "topic", entityId: "topic-a", parentType: "lesson", parentId: "lesson-a", position: 0, content: { label: "Tópico A" } },
    { entityType: "microsequence", entityId: "micro-a", parentType: "lesson", parentId: "lesson-a", position: 0, content: { title: "Microssequência A", goal: "Explicar A", role: "explain" } },
    { entityType: "card", entityId: "card-a", parentType: "microsequence", parentId: "micro-a", position: 1, content: { title: "Unidade A", content: [], response: null, feedback: [], topics: [] } }
  ] : [
    { entityType: "module", entityId: `module-${suffix}`, parentType: null, parentId: null, position: 0, content: { title: `Módulo ${suffix}` } },
    { entityType: "lesson", entityId: `lesson-${suffix}`, parentType: "module", parentId: `module-${suffix}`, position: 0, content: { title: `Lição ${suffix}` } },
    { entityType: "microsequence", entityId: `micro-${suffix}`, parentType: "lesson", parentId: `lesson-${suffix}`, position: 0, content: { title: `Microssequência ${suffix}` } },
    { entityType: "card", entityId: `card-${suffix}`, parentType: "microsequence", parentId: `micro-${suffix}`, position: 1, content: { title: `Unidade ${suffix}`, content: [], response: null, feedback: [], topics: [] } }
  ];
  const publicationTimestamp = index >= 6
    ? `2026-08-${String(index - 3).padStart(2, "0")}T10:00:00Z`
    : null;
  return definitions.map((entity, entityIndex) => ({
    ...entity,
    entityVersion: index >= 6 ? 1 : (index + 1) * 10 + entityIndex + 1,
    entityCreatedAt: publicationTimestamp ||
      `2026-07-${suffix.padStart(2, "0")}T${String(entityIndex + 11).padStart(2, "0")}:00:00Z`,
    entityUpdatedAt: publicationTimestamp ||
      `2026-07-${suffix.padStart(2, "0")}T${String(entityIndex + 12).padStart(2, "0")}:00:00Z`
  }));
}

async function installImportStaging(database) {
  await database.exec(`
    create temporary table course_content_import_v1(
      course_id uuid not null,
      source_kind text not null,
      workspace_id uuid,
      workspace_revision bigint,
      legacy_course_id uuid,
      legacy_revision_hash text,
      manifest_hash text not null,
      course_title text not null,
      course_goal text not null,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null,
      entity_version bigint not null,
      entity_created_at timestamptz not null,
      entity_updated_at timestamptz not null,
      content jsonb not null
    )
  `);
  for (let index = 0; index < COURSES.length; index += 1) {
    const entities = cutoverEntities(index);
    await database.query(`
      insert into pg_temp.course_content_import_v1(
        course_id,source_kind,workspace_id,workspace_revision,
        legacy_course_id,legacy_revision_hash,manifest_hash,
        course_title,course_goal,
        entity_type,entity_id,parent_type,parent_id,position,
        entity_version,entity_created_at,entity_updated_at,content
      )
      select $1,$2,$3,$4,$5,$6,$7,$8,$9,
        entity.entity_type,entity.entity_id,
        entity.parent_type,entity.parent_id,entity.position,
        entity.entity_version,entity.entity_created_at,entity.entity_updated_at,
        entity.content
      from jsonb_to_recordset($10::jsonb) as entity(
        entity_type text,entity_id text,parent_type text,parent_id text,
        position integer,entity_version bigint,
        entity_created_at timestamptz,entity_updated_at timestamptz,content jsonb
      )
    `, [
      COURSES[index],
      index < 4 ? "root_only" : index < 6 ? "root_and_publication" : "publication_only",
      index < 6 ? WORKSPACES[index] : null,
      index < 6 ? 6 : null,
      index >= 4 ? PUBLICATIONS[index - 4] : null,
      index >= 4 ? String.fromCharCode(97 + index - 4).repeat(64) : null,
      String(index + 1).repeat(64),
      index < 6 ? `Curso raiz ${index + 1}` : `Publicação ${index - 3}`,
      index < 6 ? `Meta raiz ${index + 1}` : `Objetivo publicado ${index - 3}`,
      entities.map((entity) => ({
        entity_type: entity.entityType,
        entity_id: entity.entityId,
        parent_type: entity.parentType,
        parent_id: entity.parentId,
        position: entity.position,
        entity_version: entity.entityVersion,
        entity_created_at: entity.entityCreatedAt,
        entity_updated_at: entity.entityUpdatedAt,
        content: entity.content
      }))
    ]);
  }
}

async function legacyDatabase({
  seed = true,
  productOwners = 1,
  missingRoot = false,
  staging = seed
} = {}) {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create role supabase_auth_admin;
    create schema auth;
    create schema private;
    create schema extensions;
    create schema storage;
    grant usage on schema storage to authenticated;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function private.request_role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    create function private.require_service_role() returns void
      language plpgsql stable security definer as $$
    begin
      if private.request_role() is distinct from 'service_role' then
        raise exception 'service role obrigatório' using errcode='42501';
      end if;
    end $$;
    create function extensions.digest(bytea,text) returns bytea
      language sql immutable as $$
      select decode(md5(convert_from($1,'UTF8')) || md5(convert_from($1,'UTF8')),'hex')
    $$;
    create function extensions.gen_random_uuid() returns uuid
      language sql volatile as $$ select pg_catalog.gen_random_uuid() $$;
    create function public.get_aralearn_runtime_manifest() returns jsonb
      language sql stable security definer set search_path = pg_catalog as $$
      select jsonb_build_object(
        'schemaRevision','20260817130000',
        'contractVersion',1,
        'features',jsonb_build_array(
          'flat-runtime-manifest-v1',
          'task-operation-terminology-v1',
          'oauth-only-authoring-mcp',
          'package-library-v1',
          'package-contract-discovery-v1'
        )
      )
    $$;
    create function public.aralearn_mcp_access_token_hook(event jsonb)
      returns jsonb language sql stable as $$ select event $$;
    grant execute on function public.aralearn_mcp_access_token_hook(jsonb)
      to supabase_auth_admin;

    create table auth.users(id uuid primary key, email text unique);
    insert into auth.users values
      ('${OWNER}','owner@example.test'),
      ('${EDITOR}','editor@example.test'),
      ('${LEARNER}','learner@example.test'),
      ('${OUTSIDER}','outsider@example.test'),
      ('${SECOND_OWNER}','second-owner@example.test');

    create table storage.buckets(
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects(
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id) on delete cascade,
      name text not null,
      owner_id text,
      metadata jsonb,
      unique(bucket_id,name)
    );
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;

    create table private.app_role_assignments(
      user_id uuid not null references auth.users(id) on delete cascade,
      role text not null,
      active boolean not null default true,
      primary key(user_id,role)
    );

    create table public.courses(
      id uuid primary key,
      owner_id uuid,
      status text not null default 'published',
      deleted_at timestamptz,
      document_storage_enabled boolean not null default true,
      title text not null,
      goal text not null default '',
      catalog_revision bigint not null default 1,
      current_revision_hash text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table private.authoring_workspaces(
      id uuid primary key,
      owner_id uuid,
      title text not null,
      purpose text not null default '',
      brief text not null default '',
      revision bigint not null default 1,
      authoring_state jsonb not null default
        '{"version":1,"parts":[],"decisions":[],"mandate":null}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );
    create table private.authoring_workspace_entities(
      workspace_id uuid not null references private.authoring_workspaces(id),
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null,
      content jsonb not null,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id,entity_type,entity_id)
    );
    create table private.trail_items(
      id uuid primary key,
      workspace_id uuid,
      workspace_course_id text,
      course_id uuid references public.courses(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table private.trail_item_courses(
      course_id uuid primary key references public.courses(id),
      trail_item_id uuid not null references private.trail_items(id),
      linked_at timestamptz not null default now()
    );
    create table public.trail_personal_states(
      user_id uuid not null references auth.users(id) on delete cascade,
      trail_item_id uuid not null references private.trail_items(id),
      revision bigint not null default 1,
      completed_card_count integer not null default 0,
      state jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(user_id,trail_item_id)
    );
    create table private.educational_workspace_members(
      workspace_id uuid not null references private.authoring_workspaces(id),
      user_id uuid not null references auth.users(id) on delete cascade,
      role text not null,
      joined_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id,user_id)
    );
    create table public.user_course_selections(
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      course_id uuid not null references public.courses(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(user_id,course_id)
    );
    create table private.authoring_workspace_events(
      id bigint generated by default as identity primary key,
      workspace_id uuid not null references private.authoring_workspaces(id),
      revision bigint not null,
      operation text not null,
      summary jsonb not null,
      actor_id uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      unique(workspace_id,revision)
    );
    create table private.authoring_workspace_requests(
      owner_id uuid not null references auth.users(id) on delete cascade,
      request_id text not null,
      operation text not null,
      workspace_id uuid not null references private.authoring_workspaces(id),
      primary key(owner_id,request_id)
    );
    create table private.authoring_workspace_publications(
      workspace_id uuid not null references private.authoring_workspaces(id),
      workspace_course_id text not null,
      course_id uuid not null references public.courses(id),
      primary key(workspace_id,workspace_course_id,course_id)
    );
    create table private.catalog_review_submissions(
      id uuid primary key,
      status text not null
    );
    create view public.legacy_course_projection_v0 as
      select id,title from public.courses;
    grant select on public.legacy_course_projection_v0 to authenticated;
    create function public.legacy_course_count_v0() returns bigint
      language sql stable security definer as $$
      select count(*) from public.courses
    $$;
    grant execute on function public.legacy_course_count_v0() to authenticated;
  `);
  for (const tableName of EXPERIMENT_TABLES) {
    await database.exec(`create table private.${tableName}(id bigint primary key)`);
  }

  if (productOwners >= 1) {
    await database.query(
      "insert into private.app_role_assignments values($1,'owner',true)",
      [OWNER]
    );
  }
  if (productOwners >= 2) {
    await database.query(
      "insert into private.app_role_assignments values($1,'owner',true)",
      [SECOND_OWNER]
    );
  }
  if (!seed) return database;

  for (let index = 0; index < PUBLICATIONS.length; index += 1) {
    await database.query(`
      insert into public.courses(
        id,title,goal,catalog_revision,current_revision_hash,created_at,updated_at
      ) values($1,$2,$3,$4,repeat($5,64),$6,$6)
    `, [
      PUBLICATIONS[index],
      `Publicação ${index + 1}`,
      `Objetivo publicado ${index + 1}`,
      index + 2,
      String.fromCharCode(97 + index),
      `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00Z`
    ]);
  }
  for (let index = 0; index < WORKSPACES.length; index += 1) {
    await database.query(`
      insert into private.authoring_workspaces(
        id,owner_id,title,purpose,brief,revision,created_at,updated_at
      ) values($1,$2,$3,$4,$5,$6,$7,$7)
    `, [
      WORKSPACES[index], OWNER, `Workspace ${index + 1}`,
      `Objetivo da raiz ${index + 1}`, `Brief ${index + 1}`, 6,
      `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00Z`
    ]);
    if (!(missingRoot && index === WORKSPACES.length - 1)) {
      await database.query(`
        insert into private.authoring_workspace_entities(
          workspace_id,entity_type,entity_id,parent_type,parent_id,
          position,content,version,created_at,updated_at
        ) values($1,'course',$2,'project','project',0,$3,1,$4,$4)
      `, [
        WORKSPACES[index], `course-${index + 1}`,
        { title: `Curso raiz ${index + 1}`, goal: `Meta raiz ${index + 1}` },
        `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00Z`
      ]);
      const sourceEntities = cutoverEntities(index).map((entity) => ({
        entity_type: entity.entityType,
        entity_id: entity.entityId,
        parent_type: entity.entityType === "module" ? "course" : entity.parentType,
        parent_id: entity.entityType === "module"
          ? `course-${index + 1}`
          : entity.parentId,
        position: entity.position,
        content: entity.content,
        version: entity.entityVersion,
        created_at: entity.entityCreatedAt,
        updated_at: entity.entityUpdatedAt
      }));
      await database.query(`
        insert into private.authoring_workspace_entities(
          workspace_id,entity_type,entity_id,parent_type,parent_id,
          position,content,version,created_at,updated_at
        )
        select $1,entity.entity_type,entity.entity_id,
          entity.parent_type,entity.parent_id,entity.position,entity.content,
          entity.version,entity.created_at,entity.updated_at
        from jsonb_to_recordset($2::jsonb) as entity(
          entity_type text,entity_id text,parent_type text,parent_id text,
          position integer,content jsonb,version bigint,
          created_at timestamptz,updated_at timestamptz
        )
      `, [WORKSPACES[index], sourceEntities]);
    }
  }
  for (let index = 0; index < TOMBSTONE_WORKSPACES.length; index += 1) {
    await database.query(`
      insert into private.authoring_workspaces(
        id,owner_id,title,purpose,brief,revision,created_at,updated_at,deleted_at
      ) values($1,$2,$3,'','','1','2026-06-01T10:00:00Z',
        '2026-06-02T10:00:00Z','2026-06-02T10:00:00Z')
    `, [TOMBSTONE_WORKSPACES[index], OWNER, `Removido ${index + 1}`]);
  }
  for (let index = 0; index < COURSES.length; index += 1) {
    const root = index < 6;
    const publication = index >= 4 ? PUBLICATIONS[index - 4] : null;
    await database.query(`
      insert into private.trail_items(
        id,workspace_id,workspace_course_id,course_id,updated_at
      ) values($1,$2,$3,$4,$5)
    `, [
      COURSES[index], root ? WORKSPACES[index] : null,
      root ? `course-${index + 1}` : null,
      publication,
      `2026-08-${String(index + 9).padStart(2, "0")}T10:00:00Z`
    ]);
    if (publication) {
      await database.query(
        "insert into private.trail_item_courses(course_id,trail_item_id) values($1,$2)",
        [publication, COURSES[index]]
      );
    }
  }

  for (const workspaceId of WORKSPACES) {
    await database.query(`
      insert into private.educational_workspace_members(
        workspace_id,user_id,role,joined_at,updated_at
      ) values($1,$2,'owner','2026-07-01T00:00:00Z','2026-07-01T00:00:00Z')
    `, [workspaceId, OWNER]);
  }
  await database.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,course_id
    ) values
      ($1,'course-5',$2),
      ($3,'course-6',$4)
  `, [WORKSPACES[4], PUBLICATIONS[0], WORKSPACES[5], PUBLICATIONS[1]]);

  const eventOperations = [
    ["create", "create_structure", "replace_catalog_document", "save_card", "update_brief", "update_metadata"],
    ["create", "create_structure", "replace_catalog_document", "save_microsequence_cards", "save_microsequence_cards", "update_brief"],
    ["create", "create_structure", "replace_catalog_document", "save_microsequence_cards", "save_microsequence_cards", "update_brief"],
    ["create", "create_structure", "replace_catalog_document", "save_microsequence_cards", "save_microsequence_cards", "update_brief"],
    ["create", "save_microsequence_cards", "save_microsequence_cards", "save_microsequence_cards", "save_microsequence_cards", "save_microsequence_cards"],
    ["create", "save_microsequence_cards", "save_microsequence_cards", "save_microsequence_cards", "save_microsequence_cards", "save_microsequence_cards"]
  ];
  for (let workspaceIndex = 0; workspaceIndex < WORKSPACES.length; workspaceIndex += 1) {
    for (let revisionIndex = 0; revisionIndex < 6; revisionIndex += 1) {
      const operation = eventOperations[workspaceIndex][revisionIndex];
      await database.query(`
        insert into private.authoring_workspace_events(
          workspace_id,revision,operation,summary,actor_id,created_at
        ) values($1,$2,$3,$4,$5,$6)
      `, [
        WORKSPACES[workspaceIndex], revisionIndex + 1, operation,
        {
          operation,
          created: operation === "create" ? 1 : 0,
          updated: operation === "create" ? 0 : 1,
          deleted: 0,
          workspaceId: WORKSPACES[workspaceIndex],
          catalog: "legacy-only",
          publication: "legacy-only"
        },
        OWNER,
        `2026-07-${String(workspaceIndex + 1).padStart(2, "0")}T${String(revisionIndex + 10).padStart(2, "0")}:00:00Z`
      ]);
    }
  }

  let activeRequestIndex = 0;
  for (let workspaceIndex = 0; workspaceIndex < WORKSPACES.length; workspaceIndex += 1) {
    const requestCount = workspaceIndex === 0 ? 8 : 7;
    for (let index = 0; index < requestCount; index += 1) {
      activeRequestIndex += 1;
      await database.query(`
        insert into private.authoring_workspace_requests(
          owner_id,request_id,operation,workspace_id
        ) values($1,$2,'update_metadata',$3)
      `, [OWNER, `request-active-${activeRequestIndex}`, WORKSPACES[workspaceIndex]]);
    }
  }
  for (let index = 0; index < 9; index += 1) {
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,workspace_id
      ) values($1,$2,'delete_workspace',$3)
    `, [OWNER, `request-tombstone-${index + 1}`, TOMBSTONE_WORKSPACES[index]]);
  }
  await database.exec(`
    insert into private.catalog_review_submissions(id,status) values
      ('60000000-0000-4000-8000-000000000001','withdrawn'),
      ('60000000-0000-4000-8000-000000000002','withdrawn')
  `);
  await database.query(`
    insert into public.user_course_selections(
      id,user_id,course_id,created_at,updated_at
    ) values
      ('40000000-0000-4000-8000-000000000001',$1,$2,now(),now()),
      ('40000000-0000-4000-8000-000000000002',$1,$3,now(),now())
  `, [LEARNER, PUBLICATIONS[0], PUBLICATIONS[2]]);
  await database.query(`
    insert into public.trail_personal_states(
      user_id,trail_item_id,revision,completed_card_count,state
    ) values($1,$2,3,0,$3)
  `, [OWNER, COURSES[4], legacyPersonalState]);
  if (staging) await installImportStaging(database);
  return database;
}

async function applyMigration(database) {
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
}

async function applyProfileAccessMigration(database) {
  await database.exec(await fs.readFile(profileAccessMigrationUrl, "utf8"));
}

test("migra a topologia 4/2/2, preserva UUID e isola todos os nomes legacy", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  assert.deepEqual(
    await scalar(database, "select public.get_aralearn_runtime_manifest() as value"),
    {
      schemaRevision: "20260817140000",
      contractVersion: 1,
      features: [
        "flat-runtime-manifest-v1",
        "single-live-course-identity-v1",
        "paged-live-course-composition-v1",
        "direct-course-access-v1",
        "course-personal-state-v1",
        "course-cas-idempotency-v1",
        "oauth-only-authoring-mcp",
        "package-library-v1",
        "package-contract-discovery-v1"
      ]
    }
  );

  assert.equal(await scalar(database, "select count(*)::int as value from public.courses"), 8);
  assert.equal(await scalar(database, `
    select count(*)::int as value
    from pg_attribute
    where attrelid='public.courses'::regclass
      and attname='deleted_at' and not attisdropped
  `), 0);
  assert.equal(await scalar(database, `
    select count(*)::int as value from private.course_entities
    where entity_type in ('module','lesson','topic','microsequence','card')
  `), 33);
  assert.equal(await scalar(database, `
    select count(distinct course_id)::int as value from private.course_entities
  `), 8);
  assert.equal(await scalar(database, `
    select count(*)::int as value from private.course_entities
    where entity_type in ('project','course')
  `), 0);
  assert.equal(await scalar(database, `
    select parent_type is null and parent_id is null as value
    from private.course_entities where course_id=$1 and entity_type='module'
  `, [COURSES[0]]), true);
  assert.deepEqual(await database.query(`
    select version::int as version,created_at::text as created_at,
      updated_at::text as updated_at
    from private.course_entities
    where course_id=$1 and entity_type='module' and entity_id='module-a'
  `, [COURSES[0]]).then((result) => result.rows[0]), {
    version: 11,
    created_at: "2026-07-01 11:00:00+00",
    updated_at: "2026-07-01 12:00:00+00"
  });
  assert.equal(await scalar(database, `
    select bool_and(version=1
      and created_at='2026-08-03T10:00:00Z'::timestamptz
      and updated_at='2026-08-03T10:00:00Z'::timestamptz) as value
    from private.course_entities where course_id=$1
  `, [COURSES[6]]), true);
  assert.equal(await scalar(database, `
    select title as value from public.courses where id=$1
  `, [COURSES[4]]), "Curso raiz 5");
  assert.equal(await scalar(database, `
    select count(*)::int as value from public.courses where id=$1
  `, [PUBLICATIONS[0]]), 0);
  assert.equal(await scalar(database, `
    select revision::int as value from public.courses where id=$1
  `, [COURSES[6]]), 1);
  assert.equal(await scalar(database, `
    select course_id as value from public.course_personal_states
    where user_id=$1
  `, [OWNER]), COURSES[4]);
  const migratedPersonalState = await scalar(database, `
    select state as value from public.course_personal_states
    where user_id=$1 and course_id=$2
  `, [OWNER, COURSES[4]]);
  assert.deepEqual(migratedPersonalState.progress.lessons["lesson-5"], {
    cursorStudyUnitId: "card-5",
    completedStudyUnitIds: ["card-5"]
  });
  assert.equal(JSON.stringify(migratedPersonalState).includes("CardId"), false);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from pg_attribute
    where attrelid='public.course_personal_states'::regclass
      and attname='completed_study_unit_count' and not attisdropped
  `), 0);
  assert.equal(await scalar(database, `
    select to_regclass('private.course_content_import_gate') is null
      and to_regclass('pg_temp.course_content_import_v1') is null as value
  `), true);
  assert.equal(await scalar(database, `
    select count(*)::int as value from public.course_access
  `), 0);
  assert.deepEqual(await scalar(database, `
    select jsonb_agg(attribute_value.attname order by attribute_value.attnum) as value
    from pg_attribute attribute_value
    where attribute_value.attrelid='public.course_access'::regclass
      and attribute_value.attnum>0 and not attribute_value.attisdropped
  `), ["course_id", "user_id", "granted_by", "granted_at"]);

  for (const name of [
    "public.courses", "private.authoring_workspaces",
    "private.authoring_workspace_entities", "private.trail_items",
    "private.trail_item_courses", "public.trail_personal_states"
  ]) {
    if (name === "public.courses") continue;
    assert.equal(await scalar(database, "select to_regclass($1) is null as value", [name]), true);
  }
  for (const name of [
    "public.legacy_catalog_courses", "private.legacy_authoring_workspaces",
    "private.legacy_authoring_workspace_entities", "private.legacy_trail_items",
    "private.legacy_trail_item_courses", "public.legacy_trail_personal_states"
  ]) {
    assert.equal(await scalar(database, "select to_regclass($1) is not null as value", [name]), true);
  }
  await database.close();
});

test("rekeya os 36 eventos e elimina vocabulário e payload legacy", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);

  assert.equal(await scalar(database, `
    select count(*)::int as value from private.course_events
  `), 36);
  assert.equal(await scalar(database, `
    select count(*)::int as value
    from private.course_events event_value
    join private.legacy_trail_items item on item.id=event_value.course_id
    join private.authoring_workspace_events legacy_event
      on legacy_event.id=event_value.id
     and legacy_event.workspace_id=item.workspace_id
  `), 36);
  assert.deepEqual(await database.query(`
    select operation,count(*)::int as count
    from private.course_events group by operation order by operation
  `).then((result) => result.rows), [
    { operation: "create_course", count: 6 },
    { operation: "replace_course_composition", count: 25 },
    { operation: "update_course_metadata", count: 5 }
  ]);
  assert.deepEqual(await database.query(`
    select summary->>'changeKind' as change_kind,count(*)::int as count
    from private.course_events group by summary->>'changeKind'
    order by summary->>'changeKind'
  `).then((result) => result.rows), [
    { change_kind: "authoring_guidance_updated", count: 4 },
    { change_kind: "course_composition_replaced", count: 4 },
    { change_kind: "course_initialized", count: 6 },
    { change_kind: "course_metadata_updated", count: 1 },
    { change_kind: "didactic_microsequence_study_units_updated", count: 16 },
    { change_kind: "didactic_structure_materialized", count: 4 },
    { change_kind: "study_unit_updated", count: 1 }
  ]);
  assert.equal(await scalar(database, `
    select count(*)::int as value
    from private.course_events target_event
    join private.authoring_workspace_events source_event
      on source_event.id=target_event.id
    where (target_event.summary->>'createdCount')::int <>
        (source_event.summary->>'created')::int
      or (target_event.summary->>'updatedCount')::int <>
        (source_event.summary->>'updated')::int
      or (target_event.summary->>'deletedCount')::int <>
        (source_event.summary->>'deleted')::int
  `), 0);
  assert.equal(await scalar(database, `
    select count(*)::int as value from private.course_events
    where lower(operation || ' ' || summary::text) ~
      '(workspace|catalog|publication|create_structure|replace_catalog_document|save_card|save_microsequence_cards|update_brief)'
  `), 0);
  await database.close();
});

test("autorização concreta aplica owner, grants explícitos e falha fechada", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await actor(database, OWNER);
  const first = await scalar(database, "select public.list_courses_v1(null,2,null,null) as value");
  assert.equal(first.items.length, 2);
  assert.equal(first.hasMore, true);
  assert.equal(Object.hasOwn(first.items[0], "authoringState"), false);
  assert.equal(Object.hasOwn(first.items[0], "accessLevel"), false);
  const second = await scalar(database, `
    select public.list_courses_v1(null,2,$1,$2) as value
  `, [first.nextCursor.beforeUpdatedAt, first.nextCursor.beforeId]);
  assert.equal(second.items.length, 2);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.courseId)).size, 4);
  const listDefinition = await scalar(database, `
    select pg_get_functiondef(
      'private.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)'::regprocedure
    ) as value
  `);
  assert.doesNotMatch(listDefinition, /select\s+course\.\*/iu);
  assert.doesNotMatch(listDefinition, /page\.(?:brief|authoring_state|deleted_at)/iu);

  await database.query("update public.courses set brief=$2 where id=$1", [
    COURSES[0], "orientacao-privada-nao-pesquisavel"
  ]);

  await actor(database, EDITOR);
  const editorWithoutGrant = await scalar(database, "select public.list_courses_v1(null,24,null,null) as value");
  assert.deepEqual(editorWithoutGrant.items, []);
  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by)
    values($1,$2,$3)
  `, [COURSES[0], EDITOR, OWNER]);
  const editor = await scalar(database, "select public.list_courses_v1(null,24,null,null) as value");
  assert.deepEqual(editor.items.map((item) => item.courseId), [COURSES[0]]);
  assert.equal(editor.items[0].ownership, "shared");
  assert.equal(editor.items[0].canEdit, false);
  const privateSearch = await scalar(database, `
    select public.list_courses_v1('orientacao-privada-nao-pesquisavel',24,null,null)
      as value
  `);
  assert.deepEqual(privateSearch.items, []);
  await actor(database, OWNER);
  const ownerSearch = await scalar(database, `
    select public.list_courses_v1('orientacao-privada-nao-pesquisavel',24,null,null)
      as value
  `);
  assert.deepEqual(ownerSearch.items.map((item) => item.courseId), [COURSES[0]]);
  assert.equal(ownerSearch.items[0].completedStudyUnitCount, 0);
  await actor(database, EDITOR);
  const sharedCourse = await scalar(database, `
    select public.get_course_v1($1) as value
  `, [COURSES[0]]);
  assert.equal(sharedCourse.ownership, "shared");
  assert.equal(sharedCourse.canEdit, false);
  assert.equal(Object.hasOwn(sharedCourse, "brief"), false);
  assert.equal(Object.hasOwn(sharedCourse, "authoringState"), false);
  assert.equal(Object.hasOwn(sharedCourse, "outline"), false);
  await actor(database, EDITOR, "service_role");
  await assert.rejects(() => scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,$3,'update_metadata','Sem autoridade',null,null,null,null,null,$4
    ) as value
  `, [EDITOR, COURSES[0], sharedCourse.revision, "request-shared-denied"]),
  /não autorizada/u);

  await actor(database, LEARNER);
  const learner = await scalar(database, "select public.list_courses_v1(null,24,null,null) as value");
  assert.deepEqual(learner.items, []);

  await actor(database, OUTSIDER);
  const outsider = await scalar(database, "select public.list_courses_v1(null,24,null,null) as value");
  assert.deepEqual(outsider.items, []);
  await assert.rejects(
    () => scalar(database, "select public.get_course_v1($1) as value", [COURSES[0]]),
    /inexistente ou inacessível/u
  );
  await database.close();
});

test("RLS, grants e wrappers separam navegador autenticado do service role", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);

  for (const signature of [
    "public.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)",
    "public.get_course_for_actor_v1(uuid,uuid,boolean)",
    "public.create_course_for_actor_v1(uuid,text,text,text,text)",
    "public.commit_course_changes_for_actor_v1(uuid,uuid,bigint,text,text,text,text,jsonb,jsonb,jsonb,text)"
  ]) {
    assert.equal(await scalar(database, `
      select has_function_privilege('service_role',$1,'execute') as value
    `, [signature]), true);
    assert.equal(await scalar(database, `
      select has_function_privilege('authenticated',$1,'execute') as value
    `, [signature]), false);
  }
  for (const signature of [
    "public.list_courses_v1(text,integer,timestamptz,uuid)",
    "public.list_course_review_items_v1(integer,timestamptz,uuid,text)",
    "public.get_course_v1(uuid)",
    "public.list_course_entities_v1(uuid,bigint,integer,text,text)",
    "public.load_course_personal_state_v1(uuid)",
    "public.mutate_course_personal_state_v1(uuid,bigint,jsonb,uuid)"
  ]) {
    assert.equal(await scalar(database, `
      select has_function_privilege('authenticated',$1,'execute') as value
    `, [signature]), true);
    assert.equal(await scalar(database, `
      select has_function_privilege('service_role',$1,'execute') as value
    `, [signature]), false);
  }
  assert.equal(await scalar(database, `
    select count(*)::int as value from pg_class relation_value
    join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
    where (namespace_value.nspname,relation_value.relname) in (
      ('public','courses'),('private','course_entities'),
      ('public','course_access'),('public','course_personal_states')
    ) and relation_value.relrowsecurity and relation_value.relforcerowsecurity
  `), 4);
  assert.equal(await scalar(database, `
    select has_table_privilege('authenticated','public.courses','select')
      or has_table_privilege('service_role','private.course_events','select')
      or has_table_privilege(
        'authenticated','public.user_course_selections','select'
      )
      or has_table_privilege(
        'authenticated','public.legacy_course_projection_v0','select'
      )
      or has_function_privilege(
        'authenticated','public.legacy_course_count_v0()','execute'
      ) as value
  `), false);
  const executable = await database.query(`
    select role_value.role_name,
      namespace_value.nspname || '.' || procedure_value.proname || '('
        || pg_get_function_identity_arguments(procedure_value.oid) || ')' as signature
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid=procedure_value.pronamespace
    cross join (values
      ('anon'),('authenticated'),('service_role'),('supabase_auth_admin')
    ) role_value(role_name)
    where namespace_value.nspname in ('public','private')
      and has_function_privilege(
        role_value.role_name,procedure_value.oid,'execute'
      )
    order by role_value.role_name,signature
  `);
  assert.deepEqual(executable.rows, [
    {
      role_name: "anon",
      signature: "public.get_aralearn_runtime_manifest()"
    },
    ...[
      "public.get_aralearn_runtime_manifest()",
      "public.get_course_v1(p_course_id uuid)",
      "public.list_course_review_items_v1(p_limit integer, p_before_marked_at timestamp with time zone, p_before_course_id uuid, p_before_study_unit_id text)",
      "public.list_course_entities_v1(p_course_id uuid, p_expected_revision bigint, p_limit integer, p_after_entity_type text, p_after_entity_id text)",
      "public.list_courses_v1(p_query text, p_limit integer, p_before_updated_at timestamp with time zone, p_before_id uuid)",
      "public.load_course_personal_state_v1(p_course_id uuid)",
      "public.mutate_course_personal_state_v1(p_course_id uuid, p_expected_revision bigint, p_operations jsonb, p_request_id uuid)"
    ].sort().map((signature) => ({ role_name: "authenticated", signature })),
    ...[
      "public.commit_course_changes_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_operation text, p_title text, p_goal text, p_brief text, p_authoring_state jsonb, p_upserts jsonb, p_deletes jsonb, p_request_id text)",
      "public.create_course_for_actor_v1(p_actor_id uuid, p_title text, p_goal text, p_brief text, p_request_id text)",
      "public.get_aralearn_runtime_manifest()",
      "public.get_course_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_include_outline boolean)",
      "public.list_course_entities_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_limit integer, p_after_entity_type text, p_after_entity_id text)",
      "public.list_courses_for_actor_v1(p_actor_id uuid, p_query text, p_limit integer, p_before_updated_at timestamp with time zone, p_before_id uuid)"
    ].sort().map((signature) => ({ role_name: "service_role", signature })),
    {
      role_name: "supabase_auth_admin",
      signature: "public.aralearn_mcp_access_token_hook(event jsonb)"
    }
  ]);
  await database.close();
});

test("Estudo recebe cabeçalho fino e Autoria obtém outline sob a mesma revisão", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await actor(database, OWNER);

  const course = await scalar(database, "select public.get_course_v1($1) as value", [COURSES[0]]);
  assert.equal(course.counts.studyUnitCount, 1);
  assert.equal(Object.hasOwn(course, "outline"), false);
  assert.equal(Object.hasOwn(course, "brief"), false);
  assert.equal(Object.hasOwn(course, "authoringState"), false);

  await actor(database, OWNER, "service_role");
  const authoringCourse = await scalar(database, `
    select public.get_course_for_actor_v1($1,$2,true) as value
  `, [OWNER, COURSES[0]]);
  assert.equal(authoringCourse.outline.modules[0].lessons[0].microsequences[0].studyUnitCount, 1);
  assert.equal(authoringCourse.outline.modules[0].lessons[0].microsequences[0].id, "micro-a");
  await applyProfileAccessMigration(database);
  await actor(database, OWNER);
  const browserAuthoringCourse = await scalar(database, `
    select public.get_owned_course_v1($1) as value
  `, [COURSES[0]]);
  assert.equal(Object.hasOwn(browserAuthoringCourse, "outline"), false);
  assert.equal(browserAuthoringCourse.brief, "Brief 1");
  assert.deepEqual(browserAuthoringCourse.authoringState, {
    version: 1,
    parts: [],
    decisions: [],
    mandate: null
  });

  const seen = [];
  let cursor = null;
  do {
    const page = await scalar(database, `
      select public.list_course_entities_v1($1,$2,2,$3,$4) as value
    `, [COURSES[0], course.revision, cursor?.entityType ?? null, cursor?.entityId ?? null]);
    assert.equal(page.revision, course.revision);
    seen.push(...page.items.map((item) => `${item.entityType}:${item.entityId}`));
    cursor = page.hasMore ? page.nextCursor : null;
  } while (cursor);
  assert.deepEqual(seen, [
    "module:module-a", "lesson:lesson-a", "topic:topic-a",
    "microsequence:micro-a", "card:card-a"
  ]);
  await assert.rejects(
    () => scalar(database, `
      select public.list_course_entities_v1($1,$2,2,null,null) as value
    `, [COURSES[0], course.revision + 1]),
    /mudou/u
  );

  await actor(database, OWNER, "service_role");
  const summary = await scalar(database, `
    select public.get_course_for_actor_v1($1,$2,false) as value
  `, [OWNER, COURSES[0]]);
  assert.equal(Object.hasOwn(summary, "outline"), false);
  await database.close();
});

test("constraints e commit recusam envelope antigo, pai ausente e lacuna estrutural", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);

  await assert.rejects(() => database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'course','old-root',null,null,0,'{}')
  `, [COURSES[1]]));
  await assert.rejects(() => database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'lesson','orphan','module','missing',0,'{}')
  `, [COURSES[1]]));

  await actor(database, OWNER, "service_role");
  const invalid = [{
    entityType: "module", entityId: "module-gap", parentType: null,
    parentId: null, position: 2, content: { title: "Lacuna" }
  }];
  const currentRevision = await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSES[1]]);
  await assert.rejects(
    () => scalar(database, `
      select public.commit_course_changes_for_actor_v1(
        $1,$2,$3,'commit_entities',null,null,null,null,$4,'[]',$5
      ) as value
    `, [OWNER, COURSES[1], currentRevision, invalid, "request-invalid-structure"]),
    /estrutura de Curso inválida/u
  );
  assert.equal(await scalar(database, "select revision as value from public.courses where id=$1", [COURSES[1]]), currentRevision);

  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'module','module-second',null,null,1,'{}')
  `, [COURSES[0]]);
  await database.exec(`
    begin;
    set constraints private.course_entities_sibling_position_v1 deferred;
    update private.course_entities set position=1
      where course_id='${COURSES[0]}' and entity_type='module' and entity_id='module-a';
    update private.course_entities set position=0
      where course_id='${COURSES[0]}' and entity_type='module' and entity_id='module-second';
    commit;
  `);
  assert.equal(await scalar(database, `
    select position as value from private.course_entities
    where course_id=$1 and entity_type='module' and entity_id='module-a'
  `, [COURSES[0]]), 1);
  await database.close();
});

test("create e commit são idempotentes e protegem CAS", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");

  await database.query(`
    insert into private.course_change_receipts(
      actor_id,request_id,operation,course_id,request_hash,result,
      created_at,expires_at
    ) values($1,'request-expired-0001','update_metadata',$2,$3,'{}',
      now()-interval '15 days',now()-interval '2 days')
  `, [OWNER, COURSES[0], "a".repeat(64)]);

  const create = await scalar(database, `
    select public.create_course_for_actor_v1($1,'Curso novo','Aprender','Brief','request-create-0001') as value
  `, [OWNER]);
  assert.deepEqual(await scalar(database, `
    select summary as value from private.course_events
    where course_id=$1 and revision=1
  `, [create.courseId]), {
    changeKind: "course_initialized",
    createdCount: 0,
    updatedCount: 0,
    deletedCount: 0
  });
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_change_receipts
    where request_id='request-expired-0001'
  `), 0);
  const replay = await scalar(database, `
    select public.create_course_for_actor_v1($1,'Curso novo','Aprender','Brief','request-create-0001') as value
  `, [OWNER]);
  assert.equal(replay.courseId, create.courseId);
  assert.equal(replay.idempotent, true);

  const metadata = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,1,'update_metadata','Curso revisto',null,null,null,null,null,
      'request-metadata-0001'
    ) as value
  `, [OWNER, create.courseId]);
  assert.equal(metadata.revision, 2);
  assert.deepEqual(await scalar(database, `
    select summary as value from private.course_events
    where course_id=$1 and revision=2
  `, [create.courseId]), {
    changeKind: "course_metadata_updated",
    changedFields: ["title"],
    createdCount: 0,
    updatedCount: 0,
    deletedCount: 0
  });
  const metadataReplay = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,1,'update_metadata','Curso revisto',null,null,null,null,null,
      'request-metadata-0001'
    ) as value
  `, [OWNER, create.courseId]);
  assert.equal(metadataReplay.idempotent, true);
  const metadataBeforeNoop = await database.query(`
    select revision, updated_at from public.courses where id=$1
  `, [create.courseId]).then((result) => result.rows[0]);
  const eventCountBeforeMetadataNoop = await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [create.courseId]);
  const metadataNoop = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,2,'update_metadata','  Curso revisto  ',null,null,null,null,null,
      'request-metadata-noop-0001'
    ) as value
  `, [OWNER, create.courseId]);
  assert.equal(metadataNoop.revision, 2);
  assert.equal(metadataNoop.idempotent, false);
  assert.deepEqual(metadataNoop.changedFields, []);
  assert.equal(metadataNoop.createdCount, 0);
  assert.equal(metadataNoop.updatedCount, 0);
  assert.equal(metadataNoop.deletedCount, 0);
  assert.deepEqual(await database.query(`
    select revision, updated_at from public.courses where id=$1
  `, [create.courseId]).then((result) => result.rows[0]), metadataBeforeNoop);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [create.courseId]), eventCountBeforeMetadataNoop);
  const metadataNoopReplay = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,2,'update_metadata','  Curso revisto  ',null,null,null,null,null,
      'request-metadata-noop-0001'
    ) as value
  `, [OWNER, create.courseId]);
  assert.equal(metadataNoopReplay.idempotent, true);
  assert.equal(metadataNoopReplay.revision, 2);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [create.courseId]), eventCountBeforeMetadataNoop);
  await assert.rejects(
    () => scalar(database, `
      select public.commit_course_changes_for_actor_v1(
        $1,$2,1,'update_metadata','Outra revisão',null,null,null,null,null,
        'request-metadata-0002'
      ) as value
    `, [OWNER, create.courseId]),
    /mudou/u
  );
  await assert.rejects(
    () => scalar(database, `
      select public.commit_course_changes_for_actor_v1(
        $1,$2,2,'update_metadata',null,null,null,'{}',null,null,
        'request-invalid-authoring-state-0001'
      ) as value
    `, [OWNER, create.courseId]),
    /Metadados do Curso inválidos/u
  );

  const entities = [
    { entityType: "module", entityId: "m", parentType: null, parentId: null, position: 0, content: { title: "M" } },
    { entityType: "lesson", entityId: "l", parentType: "module", parentId: "m", position: 0, content: { title: "L" } },
    { entityType: "microsequence", entityId: "s", parentType: "lesson", parentId: "l", position: 0, content: { title: "S" } },
    { entityType: "card", entityId: "u", parentType: "microsequence", parentId: "s", position: 1, content: { title: "U", topics: [] } }
  ];
  const committed = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,2,'commit_entities',null,null,null,null,$3,'[]',
      'request-entities-0001'
    ) as value
  `, [OWNER, create.courseId, entities]);
  assert.equal(committed.revision, 3);
  assert.equal(committed.upsertedCount, 4);
  assert.equal(committed.createdCount, 4);
  assert.equal(committed.updatedCount, 0);
  assert.deepEqual(await scalar(database, `
    select summary as value from private.course_events
    where course_id=$1 and revision=3
  `, [create.courseId]), {
    changeKind: "course_composition_replaced",
    createdCount: 4,
    updatedCount: 0,
    deletedCount: 0
  });
  const entityStateBeforeNoop = await database.query(`
    select entity_type,entity_id,version,created_at,updated_at
    from private.course_entities where course_id=$1
    order by entity_type,entity_id
  `, [create.courseId]).then((result) => result.rows);
  const eventCountBeforeEntityNoop = await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [create.courseId]);
  const entityNoop = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,3,'commit_entities',null,null,null,null,$3,'[]',
      'request-entities-noop-0001'
    ) as value
  `, [OWNER, create.courseId, entities]);
  assert.equal(entityNoop.revision, 3);
  assert.equal(entityNoop.idempotent, false);
  assert.equal(entityNoop.createdCount, 0);
  assert.equal(entityNoop.updatedCount, 0);
  assert.equal(entityNoop.upsertedCount, 0);
  assert.equal(entityNoop.deletedCount, 0);
  assert.deepEqual(await database.query(`
    select entity_type,entity_id,version,created_at,updated_at
    from private.course_entities where course_id=$1
    order by entity_type,entity_id
  `, [create.courseId]).then((result) => result.rows), entityStateBeforeNoop);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [create.courseId]), eventCountBeforeEntityNoop);
  const entityNoopReplay = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,3,'commit_entities',null,null,null,null,$3,'[]',
      'request-entities-noop-0001'
    ) as value
  `, [OWNER, create.courseId, entities]);
  assert.equal(entityNoopReplay.idempotent, true);
  assert.equal(entityNoopReplay.revision, 3);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [create.courseId]), eventCountBeforeEntityNoop);
  const changedEntities = entities.map((entity) => entity.entityId === "u"
    ? { ...entity, content: { ...entity.content, title: "U revisada" } }
    : entity);
  const oneChangedEntity = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,3,'commit_entities',null,null,null,null,$3,'[]',
      'request-entities-change-0001'
    ) as value
  `, [OWNER, create.courseId, changedEntities]);
  assert.equal(oneChangedEntity.revision, 4);
  assert.equal(oneChangedEntity.createdCount, 0);
  assert.equal(oneChangedEntity.updatedCount, 1);
  assert.equal(oneChangedEntity.upsertedCount, 1);
  assert.equal(oneChangedEntity.deletedCount, 0);
  assert.deepEqual(await scalar(database, `
    select summary as value from private.course_events
    where course_id=$1 and revision=4
  `, [create.courseId]), {
    changeKind: "course_composition_replaced",
    createdCount: 0,
    updatedCount: 1,
    deletedCount: 0
  });
  assert.deepEqual(await database.query(`
    select entity_id,version from private.course_entities
    where course_id=$1 order by entity_id
  `, [create.courseId]).then((result) => result.rows), [
    { entity_id: "l", version: 1 },
    { entity_id: "m", version: 1 },
    { entity_id: "s", version: 1 },
    { entity_id: "u", version: 2 }
  ]);
  assert.deepEqual(await database.query(`
    select operation from private.course_events
    where course_id=$1 order by revision
  `, [create.courseId]).then((result) => result.rows.map((row) => row.operation)), [
    "create_course", "update_course_metadata", "replace_course_composition",
    "replace_course_composition"
  ]);
  const removed = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,4,'commit_entities',null,null,null,null,'[]',$3,
      'request-delete-tree-0001'
    ) as value
  `, [OWNER, create.courseId, [{ entityType: "module", entityId: "m" }]]);
  assert.equal(removed.deletedCount, 4);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1
  `, [create.courseId]), 0);
  assert.equal(await scalar(database, `
    select (summary->>'deletedCount')::integer as value
    from private.course_events where course_id=$1 and revision=5
  `, [create.courseId]), 4);
  await database.close();
});

test("estado pessoal conserva CAS, replay idempotente e rekey", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await actor(database, OWNER);
  const migrated = await scalar(database, "select public.load_course_personal_state_v1($1) as value", [COURSES[4]]);
  assert.equal(migrated.courseId, COURSES[4]);
  assert.equal(migrated.revision, 3);

  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by) values
      ($1,$2,$3)
  `, [COURSES[6], LEARNER, OWNER]);
  await actor(database, LEARNER);

  const operations = [{
    kind: "set", collection: "reviewMarks", path: "card-a",
    value: "2026-08-17T12:00:00Z"
  }];
  const changed = await scalar(database, `
    select public.mutate_course_personal_state_v1($1,0,$2,$3) as value
  `, [COURSES[6], operations, PERSONAL_REQUEST]);
  assert.equal(changed.revision, 1);
  assert.equal(changed.idempotent, false);
  const replay = await scalar(database, `
    select public.mutate_course_personal_state_v1($1,0,$2,$3) as value
  `, [COURSES[6], operations, PERSONAL_REQUEST]);
  assert.equal(replay.idempotent, true);
  await assert.rejects(
    () => scalar(database, `
      select public.mutate_course_personal_state_v1($1,0,$2,$3) as value
    `, [COURSES[6], operations, PERSONAL_REQUEST_STALE]),
    /estado pessoal mudou/u
  );
  const loaded = await scalar(database, "select public.load_course_personal_state_v1($1) as value", [COURSES[6]]);
  assert.equal(loaded.state.reviewMarks["card-a"], "2026-08-17T12:00:00Z");
  await assert.rejects(
    () => scalar(database, `
      select public.mutate_course_personal_state_v1($1,1,$2,$3) as value
    `, [COURSES[6], [{
      kind: "set", collection: "reviewMarks", path: "card-invalid-date",
      value: "2026-99-99T99:99:99Z"
    }], "efefefef-efef-4efe-8efe-efefefefefef"]),
    /estado pessoal inválido/iu
  );
  assert.equal(await scalar(database, `
    select private.valid_course_personal_state_v1(jsonb_build_object(
      'version', 1,
      'progress', jsonb_build_object('version', 3, 'lessons', '{}'::jsonb),
      'reviewMarks', '{}'::jsonb,
      'observations', (
        select jsonb_object_agg(
          'unit-' || value,
          jsonb_build_object(
            'category', 'observation',
            'body', 'Observação ' || value || ' ' || repeat('x', 900),
            'updatedAt', '2026-08-17T12:00:00Z'
          )
        )
        from generate_series(1, 600) value
      )
    )) as value
  `), false);
  await database.close();
});

test("estado pessoal valida instantes ISO-Z sem depender da sessão", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  const validState = (reviewTimestamp, observationTimestamp) => ({
    version: 1,
    progress: { version: 3, lessons: {} },
    reviewMarks: { "study-unit-review": reviewTimestamp },
    observations: {
      "study-unit-observation": {
        category: "observation",
        body: "Registro temporal verificável.",
        updatedAt: observationTimestamp
      }
    }
  });
  for (const timestamp of [
    "2024-02-29T23:59:59Z",
    "2026-08-17T12:00:00.123456Z",
    "9999-12-31T23:59:59.999999Z"
  ]) {
    assert.equal(await scalar(database, `
      select private.valid_course_personal_state_v1($1::jsonb) as value
    `, [JSON.stringify(validState(timestamp, timestamp))]), true, timestamp);
  }
  for (const timestamp of [
    "2023-02-29T12:00:00Z",
    "2026-13-01T12:00:00Z",
    "2026-04-31T12:00:00Z",
    "2026-08-17T25:00:01Z",
    "2026-08-17T12:61:00Z",
    "2026-08-17T12:00:61Z",
    "2026-08-17T12:00:00+00:00"
  ]) {
    assert.equal(await scalar(database, `
      select private.valid_course_personal_state_v1($1::jsonb) as value
    `, [JSON.stringify(validState(timestamp, timestamp))]), false, timestamp);
  }
  await database.close();
});

test("estado JS atravessa a RPC e edição preserva evidência órfã sem inflar o Estudo", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await actor(database, OWNER);
  const requestIds = [
    "51000000-0000-4000-8000-000000000010",
    "51000000-0000-4000-8000-000000000011",
    "51000000-0000-4000-8000-000000000012"
  ];
  const repository = new CoursePersonalStateRepository({
    courseId: COURSES[0],
    api: {
      async loadPersonalState(courseId) {
        return scalar(database, `
          select public.load_course_personal_state_v1($1) as value
        `, [courseId]);
      },
      async mutatePersonalState({
        courseId, expectedRevision, operations, requestId
      }) {
        return scalar(database, `
          select public.mutate_course_personal_state_v1($1,$2,$3,$4) as value
        `, [courseId, expectedRevision, operations, requestId]);
      }
    },
    cache: memoryCache(),
    course: {
      id: COURSES[0],
      title: "Curso raiz 1",
      modules: [{
        id: "module-a",
        lessons: [{
          id: "lesson-a",
          microsequences: [{ id: "micro-a", cards: [{ id: "card-a", title: "Unidade A" }] }]
        }]
      }]
    },
    clock: () => "2026-08-17T12:00:00.000Z",
    uuidFactory: () => requestIds.shift()
  });
  const reference = {
    courseId: COURSES[0],
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: "card-a"
  };
  await repository.initialize();
  await repository.setStudyUnitCompleted(reference, true);
  await repository.setStudyUnitReviewMark(reference, true);
  await repository.saveCommentForPath(reference, {
    category: "possible_error",
    body: "Conferir o vínculo entre a explicação e a fonte."
  });

  const persistedBeforeEdit = await scalar(database, `
    select state as value from public.course_personal_states
    where user_id=$1 and course_id=$2
  `, [OWNER, COURSES[0]]);
  assert.deepEqual(persistedBeforeEdit.progress.lessons["lesson-a"], {
    cursorStudyUnitId: "card-a",
    completedStudyUnitIds: ["card-a"]
  });

  const courseRevision = await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSES[0]]);
  await actor(database, OWNER, "service_role");
  const removed = await scalar(database, `
    select public.commit_course_changes_for_actor_v1(
      $1,$2,$3,'commit_entities',null,null,null,null,'[]',$4,
      'request-delete-study-unit-0001'
    ) as value
  `, [OWNER, COURSES[0], courseRevision, [{ entityType: "card", entityId: "card-a" }]]);
  assert.equal(removed.deletedCount, 1);

  await actor(database, OWNER);
  const list = await scalar(database, `
    select public.list_courses_v1(null,50,null,null) as value
  `);
  assert.equal(list.items.find(({ courseId }) =>
    courseId === COURSES[0]).completedStudyUnitCount, 0);
  const persistedAfterEdit = await scalar(database, `
    select state as value from public.course_personal_states
    where user_id=$1 and course_id=$2
  `, [OWNER, COURSES[0]]);
  assert.deepEqual(persistedAfterEdit, persistedBeforeEdit);
  assert.equal(persistedAfterEdit.reviewMarks["card-a"],
    "2026-08-17T12:00:00.000Z");
  assert.equal(persistedAfterEdit.observations["card-a"].category, "possible_error");
  const reviewQueue = await scalar(database, `
    select public.list_course_review_items_v1(50,null,null,null) as value
  `);
  assert.equal(reviewQueue.items.some(({ courseId, studyUnitId }) =>
    courseId === COURSES[0] && studyUnitId === "card-a"), false);
  const reopened = await scalar(database, `
    select public.get_course_v1($1) as value
  `, [COURSES[0]]);
  const reopenedEntities = await scalar(database, `
    select public.list_course_entities_v1($1,$2,100,null,null) as value
  `, [COURSES[0], reopened.revision]);
  assert.equal(reopened.counts.studyUnitCount, 0);
  assert.equal(reopenedEntities.items.some(({ entityId }) => entityId === "card-a"), false);
  await database.close();
});

test("aborta owner ambíguo e raiz ausente sem inventar fallback", async () => {
  const ambiguous = await legacyDatabase({ productOwners: 2 });
  await assert.rejects(() => applyMigration(ambiguous), /exatamente um owner ativo/u);
  await ambiguous.close();

  const missing = await legacyDatabase({ missingRoot: true });
  await assert.rejects(() => applyMigration(missing), /Raiz viva, owner ou título ausente/u);
  await missing.close();

  const unstaged = await legacyDatabase({ staging: false });
  await assert.rejects(() => applyMigration(unstaged), /staging TEMP/u);
  await unstaged.close();

  const invalidManifest = await legacyDatabase();
  await invalidManifest.query(`
    update pg_temp.course_content_import_v1 set manifest_hash='incompleto'
    where course_id=$1
  `, [COURSES[0]]);
  await assert.rejects(() => applyMigration(invalidManifest), /manifestos/u);
  await invalidManifest.close();

  const invalidEntityMetadata = await legacyDatabase();
  await invalidEntityMetadata.query(`
    update pg_temp.course_content_import_v1 set entity_version=entity_version+1
    where course_id=$1 and entity_type='module'
  `, [COURSES[0]]);
  await assert.rejects(
    () => applyMigration(invalidEntityMetadata),
    /manifestos|staging|estrutura convertida/iu
  );
  await invalidEntityMetadata.close();

  const eventDrift = await legacyDatabase();
  await eventDrift.exec(`
    update private.authoring_workspace_events set operation='legacy_drift'
    where id=(select min(id) from private.authoring_workspace_events)
  `);
  await assert.rejects(() => applyMigration(eventDrift), /Vocabulário/u);
  await eventDrift.close();

  const inaccessiblePersonalState = await legacyDatabase();
  await inaccessiblePersonalState.query(`
    update public.trail_personal_states set user_id=$1
  `, [LEARNER]);
  await assert.rejects(
    () => applyMigration(inaccessiblePersonalState),
    /sem acesso canônico/u
  );
  await inaccessiblePersonalState.close();
});

test("banco sem dados aplica o schema e lista zero Cursos", async () => {
  const database = await legacyDatabase({ seed: false, productOwners: 0 });
  await applyMigration(database);
  await actor(database, OUTSIDER);
  const result = await scalar(database, "select public.list_courses_v1(null,24,null,null) as value");
  assert.deepEqual(result.items, []);
  assert.equal(result.hasMore, false);
  assert.equal(await scalar(database, `
    select to_regclass('private.course_content_import_gate') is null
      and to_regclass('pg_temp.course_content_import_v1') is null as value
  `), true);
  await database.close();
});

test("perfil humano nasce sem inferir nome e o manifesto descreve a fronteira 1500", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await applyProfileAccessMigration(database);

  assert.deepEqual(
    await scalar(database, "select public.get_aralearn_runtime_manifest() as value"),
    {
      schemaRevision: "20260817150000",
      contractVersion: 1,
      features: [
        "flat-runtime-manifest-v1",
        "single-live-course-identity-v1",
        "paged-live-course-composition-v1",
        "direct-course-access-v1",
        "course-personal-state-v1",
        "course-cas-idempotency-v1",
        "oauth-only-authoring-mcp",
        "package-library-v1",
        "package-contract-discovery-v1",
        "person-profile-v1",
        "study-only-course-access-v1",
        "private-person-avatar-v1",
        "self-account-deletion-v1"
      ]
    }
  );
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.person_profiles
  `), 5);
  assert.equal(await scalar(database, `
    select display_name is null and avatar_object_key is null as value
    from public.person_profiles where user_id=$1
  `, [OWNER]), true);
  await database.exec(`
    insert into auth.users(id,email) values
      ('00000000-0000-4000-8000-000000000006','new.person@example.test')
  `);
  assert.equal(await scalar(database, `
    select display_name is null as value from public.person_profiles
    where user_id='00000000-0000-4000-8000-000000000006'
  `), true);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'public',public,
      'limit',file_size_limit,
      'types',to_jsonb(allowed_mime_types)
    ) as value from storage.buckets where id='person-avatars'
  `), {
    public: false,
    limit: 524288,
    types: ["image/jpeg", "image/png", "image/webp"]
  });
  assert.equal(await scalar(database, `
    select to_regprocedure('public.delete_own_account(text)') is null as value
  `), true);
  await database.close();
});

test("acesso direto concede apenas Estudo, preserva estado na revogação e não registra e-mail", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await applyProfileAccessMigration(database);
  await actor(database, OWNER, "service_role");

  const granted = await scalar(database, `
    select public.manage_course_access_for_actor_v1(
      $1,$2,'grant_access','learner@example.test',null,true,'request-grant-0001'
    ) as value
  `, [OWNER, COURSES[0]]);
  assert.equal(granted.changed, true);
  assert.equal(granted.person.userId, LEARNER);
  assert.equal(JSON.stringify(granted).includes("learner@example.test"), false);
  const replay = await scalar(database, `
    select public.manage_course_access_for_actor_v1(
      $1,$2,'grant_access','learner@example.test',null,true,'request-grant-0001'
    ) as value
  `, [OWNER, COURSES[0]]);
  assert.equal(replay.idempotent, true);

  await actor(database, LEARNER);
  const study = await scalar(database, `
    select public.list_courses_v1(null,50,null,null) as value
  `);
  assert.equal(study.items.some((course) =>
    course.courseId === COURSES[0] && course.ownership === "shared"), true);
  const authoring = await scalar(database, `
    select public.list_owned_courses_v1(null,50,null,null) as value
  `);
  assert.equal(authoring.items.some((course) => course.courseId === COURSES[0]), false);
  await assert.rejects(
    () => scalar(database, "select public.get_owned_course_v1($1) as value", [COURSES[0]]),
    /Edição do Curso não autorizada/u
  );
  await scalar(database, `
    select public.mutate_course_personal_state_v1($1,0,$2,$3) as value
  `, [COURSES[0], [{
    kind: "set",
    collection: "reviewMarks",
    path: "card-a",
    value: "2026-08-17T12:00:00Z"
  }], "50000000-0000-4000-8000-000000000099"]);
  const reviewItems = await scalar(database, `
    select public.list_course_review_items_v1(50,null,null,null) as value
  `);
  assert.equal(reviewItems.contract, "aralearn.course-review-list.v1");
  assert.deepEqual(reviewItems.items[0].entityPath, [
    COURSES[0], "module-a", "lesson-a", "micro-a", "card-a"
  ]);
  assert.equal(reviewItems.items[0].title, "Unidade A");

  await actor(database, OWNER, "service_role");
  const revoked = await scalar(database, `
    select public.manage_course_access_for_actor_v1(
      $1,$2,'revoke_access',null,$3,true,'request-revoke-0001'
    ) as value
  `, [OWNER, COURSES[0], LEARNER]);
  assert.equal(revoked.changed, true);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.course_personal_states
    where user_id=$1 and course_id=$2
  `, [LEARNER, COURSES[0]]), 1);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events
    where course_id=$1 and operation in ('grant_course_access','revoke_course_access')
      and summary::text like '%@%'
  `, [COURSES[0]]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_change_receipts
    where course_id=$1 and result::text like '%@%'
  `, [COURSES[0]]), 0);

  await database.query(`
    insert into private.course_change_receipts(
      actor_id,request_id,operation,course_id,request_hash,result,created_at,expires_at
    )
    select $1,
      case when index_value=101 then 'request-expired-reused'
        else 'expired-access-' || lpad(index_value::text,4,'0') end,
      'grant_access',$2,repeat('a',64),'{}'::jsonb,
      now()-interval '2 days',
      now()-interval '2 hours' + index_value * interval '1 second'
    from generate_series(1,101) index_value
  `, [OWNER, COURSES[0]]);
  const reused = await scalar(database, `
    select public.manage_course_access_for_actor_v1(
      $1,$2,'grant_access','learner@example.test',null,true,'request-expired-reused'
    ) as value
  `, [OWNER, COURSES[0]]);
  assert.equal(reused.changed, true);
  await database.close();
});

test("RLS de perfil e avatar permite apenas a própria pessoa ou relação owner-grantee", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await applyProfileAccessMigration(database);
  await actor(database, OWNER, "service_role");
  for (const [email, requestId] of [
    ["learner@example.test", "request-grant-rls-learner"],
    ["editor@example.test", "request-grant-rls-editor"]
  ]) {
    await scalar(database, `
      select public.manage_course_access_for_actor_v1(
        $1,$2,'grant_access',$3,null,true,$4
      ) as value
    `, [OWNER, COURSES[0], email, requestId]);
  }
  await database.query(`
    insert into storage.objects(bucket_id,name,owner_id) values
      ('person-avatars',$1,$2),
      ('person-avatars',$3,$4),
      ('person-avatars',$5,$6)
  `, [
    `${OWNER}/70000000-0000-4000-8000-000000000001.jpg`, OWNER,
    `${LEARNER}/70000000-0000-4000-8000-000000000002.png`, LEARNER,
    `${EDITOR}/70000000-0000-4000-8000-000000000003.webp`, EDITOR
  ]);

  await actor(database, LEARNER);
  await database.exec("set role authenticated");
  try {
    assert.deepEqual(
      await database.query("select user_id from public.person_profiles order by user_id")
        .then((result) => result.rows.map((row) => row.user_id)),
      [OWNER, LEARNER]
    );
    assert.deepEqual(
      await database.query("select owner_id from storage.objects order by owner_id")
        .then((result) => result.rows.map((row) => row.owner_id)),
      [OWNER, LEARNER]
    );
  } finally {
    await database.exec("reset role");
  }
  await database.close();
});

test("privilégios 1500 fecham variantes shared do service e permitem somente a superfície final", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await applyProfileAccessMigration(database);

  const privilege = (role, signature) => scalar(database, `
    select has_function_privilege($1,$2,'EXECUTE') as value
  `, [role, signature]);
  assert.equal(await privilege("authenticated", "public.list_owned_courses_v1(text,integer,timestamptz,uuid)"), true);
  assert.equal(await privilege("authenticated", "public.delete_my_account_v1(text)"), true);
  assert.equal(await privilege("authenticated", "private.can_read_person_v1(text)"), true);
  assert.equal(await privilege("anon", "public.list_owned_courses_v1(text,integer,timestamptz,uuid)"), false);
  assert.equal(await privilege("service_role", "public.list_owned_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)"), true);
  assert.equal(await privilege("service_role", "public.get_person_profile_for_actor_v1(uuid)"), true);
  assert.equal(await privilege("service_role", "public.manage_course_access_for_actor_v1(uuid,uuid,text,text,uuid,boolean,text)"), true);
  assert.equal(await privilege("service_role", "public.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)"), false);
  assert.equal(await privilege("authenticated", "public.manage_course_access_for_actor_v1(uuid,uuid,text,text,uuid,boolean,text)"), false);
  assert.equal(await scalar(database, `
    select has_table_privilege('authenticated','public.person_profiles','SELECT')
      and not has_table_privilege('authenticated','public.person_profiles','UPDATE') as value
  `), true);
  await database.close();
});

test("exclusão canônica exige literal e remoção física prévia do avatar", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await applyProfileAccessMigration(database);
  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by)
    values($1,$2,$3)
  `, [COURSES[0], LEARNER, OWNER]);
  const objectKey = `${OWNER}/70000000-0000-4000-8000-000000000009.jpg`;
  await database.query(`
    insert into storage.objects(bucket_id,name,owner_id)
    values('person-avatars',$1,$2)
  `, [objectKey, OWNER]);
  await actor(database, OWNER);
  await assert.rejects(
    () => scalar(database, "select public.delete_my_account_v1('EXCLUIR') as value"),
    /Confirmação inválida/u
  );
  await assert.rejects(
    () => scalar(database, "select public.delete_my_account_v1('EXCLUIR MINHA CONTA') as value"),
    /Remova os objetos privados de avatar/u
  );
  await database.query(`
    delete from storage.objects where bucket_id='person-avatars' and name=$1
  `, [objectKey]);
  assert.deepEqual(await scalar(database, `
    select public.delete_my_account_v1('EXCLUIR MINHA CONTA') as value
  `), {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal(await scalar(database, `
    select count(*)::integer as value from auth.users where id=$1
  `, [OWNER]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.courses where owner_id=$1
  `, [OWNER]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.person_profiles where user_id=$1
  `, [OWNER]), 0);
  await database.close();
});

test("exclusão de pessoa compartilhada anonimiza recibos e eventos sem apagar o Curso", async () => {
  const database = await legacyDatabase();
  await applyMigration(database);
  await applyProfileAccessMigration(database);
  await actor(database, OWNER, "service_role");
  await scalar(database, `
    select public.manage_course_access_for_actor_v1(
      $1,$2,'grant_access','learner@example.test',null,true,'request-delete-grantee'
    ) as value
  `, [OWNER, COURSES[0]]);
  await database.query(`
    insert into public.course_personal_states(user_id,course_id,state)
    values($1,$2,$3::jsonb)
  `, [LEARNER, COURSES[0], JSON.stringify({
    version: 1,
    progress: { version: 3, lessons: {} },
    reviewMarks: {},
    observations: {}
  })]);

  await actor(database, LEARNER);
  assert.deepEqual(await scalar(database, `
    select public.delete_my_account_v1('EXCLUIR MINHA CONTA') as value
  `), {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });

  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.courses where id=$1
  `, [COURSES[0]]), 1);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from auth.users where id=$1
  `, [LEARNER]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.course_access where user_id=$1
  `, [LEARNER]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.course_personal_states where user_id=$1
  `, [LEARNER]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events
    where summary::text like '%' || $1::text || '%'
  `, [LEARNER]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_change_receipts
    where result::text like '%' || $1::text || '%'
  `, [LEARNER]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events
    where summary->>'targetAccountDeleted' = 'true'
  `), 1);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_change_receipts
    where result#>>'{person,accountDeleted}' = 'true'
  `), 1);
  await database.close();
});
