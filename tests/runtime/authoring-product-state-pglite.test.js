import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260815233000_authoring_product_state_projection.sql",
  import.meta.url
);

const ACTOR = "10000000-0000-4000-8000-000000000001";
const OTHER_ACTOR = "10000000-0000-4000-8000-000000000002";
const WORKSPACES = Object.freeze({
  planning: "20000000-0000-4000-8000-000000000001",
  analyzed: "20000000-0000-4000-8000-000000000002",
  ready: "20000000-0000-4000-8000-000000000003",
  audit: "20000000-0000-4000-8000-000000000004"
});

async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

async function setupDatabase() {
  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create schema private;
    create role anon;
    create role authenticated;
    create role service_role;
    create table auth.users(id uuid primary key);
    create table private.authoring_workspaces(
      id uuid primary key,
      owner_id uuid not null,
      revision bigint not null,
      deleted_at timestamptz
    );
    create table private.authoring_workspace_entities(
      workspace_id uuid not null,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null default 0,
      content jsonb not null default '{}'::jsonb,
      version bigint not null default 1,
      primary key(workspace_id,entity_type,entity_id)
    );
    create table private.authoring_workspace_observations(
      id uuid primary key,
      workspace_id uuid not null,
      kind text not null,
      status text,
      entity_type text not null,
      entity_path text[] not null
    );
    create table private.authoring_instructional_analyses(
      workspace_id uuid not null,
      analysis_id text not null,
      analysis_version text not null,
      scope_kind text not null,
      scope_ref text not null,
      scope_entity_version bigint,
      primary key(workspace_id,analysis_id,analysis_version)
    );
    create function private.require_workspace_actor_v5(uuid,text)
    returns void language plpgsql stable as $$
    begin
      if $1 <> '${ACTOR}'::uuid or $2 <> 'authoring:read' then
        raise exception 'Ator inválido.' using errcode='42501';
      end if;
    end
    $$;
    create function private.educational_workspace_can_v1(uuid,uuid,text)
    returns boolean language sql stable as $$
      select $2 = '${ACTOR}'::uuid and $3 = 'read' and exists (
        select 1 from private.authoring_workspaces workspace where workspace.id=$1
      )
    $$;
    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $$
      select jsonb_build_object(
        'schemaRevision','20260815230000',
        'contractVersion',1,
        'features','["authoring-blueprint-artifact-receipt-v1"]'::jsonb
      )
    $$;
    insert into auth.users(id) values('${ACTOR}'),('${OTHER_ACTOR}');
    insert into private.authoring_workspaces(id,owner_id,revision)
    values
      ('${WORKSPACES.planning}','${ACTOR}',3),
      ('${WORKSPACES.analyzed}','${ACTOR}',5),
      ('${WORKSPACES.ready}','${ACTOR}',7),
      ('${WORKSPACES.audit}','${ACTOR}',9);
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,content,version
    ) values
      ('${WORKSPACES.planning}','microsequence','micro-plan','lesson','lesson-a','{}',1),
      ('${WORKSPACES.analyzed}','microsequence','micro-analysis','lesson','lesson-a','{}',2),
      ('${WORKSPACES.ready}','microsequence','micro-ready','lesson','lesson-a',
       '{"status":"ready"}',1),
      ('${WORKSPACES.ready}','card','card-ready','microsequence','micro-ready','{}',1),
      ('${WORKSPACES.audit}','microsequence','micro-audit','lesson','lesson-a',
       '{"status":"ready"}',1),
      ('${WORKSPACES.audit}','card','card-audit','microsequence','micro-audit','{}',1);
    insert into private.authoring_instructional_analyses(
      workspace_id,analysis_id,analysis_version,scope_kind,scope_ref,
      scope_entity_version
    ) values
      ('${WORKSPACES.analyzed}','analysis-stale','1.0.0','microsequence',
       'micro-analysis',1),
      ('${WORKSPACES.analyzed}','analysis-current','1.0.0','microsequence',
       'micro-analysis',2);
    insert into private.authoring_workspace_observations(
      id,workspace_id,kind,status,entity_type,entity_path
    ) values(
      '30000000-0000-4000-8000-000000000001','${WORKSPACES.audit}',
      'audit_finding','open','card',
      array['course-a','module-a','lesson-a','micro-audit','card-audit']
    );
  `);
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
  return database;
}

test("projeção canônica distingue planejamento, análise, prontidão e auditoria", async () => {
  const database = await setupDatabase();
  try {
    const result = await scalar(database, `
      select public.get_authoring_workspace_product_states_v1(
        $1,$2::uuid[],true
      ) value
    `, [ACTOR, Object.values(WORKSPACES)]);
    const byId = new Map(result.items.map((item) => [item.workspaceId, item]));
    assert.equal(byId.get(WORKSPACES.planning).authoringState, "planning");
    assert.equal(
      byId.get(WORKSPACES.planning).microsequenceStateMap["micro-plan"],
      "p"
    );
    assert.equal(byId.get(WORKSPACES.analyzed).authoringState, "building");
    assert.equal(byId.get(WORKSPACES.analyzed).analyzedCount, 1);
    assert.equal(
      byId.get(WORKSPACES.analyzed).microsequenceStateMap["micro-analysis"],
      "a"
    );
    assert.equal(byId.get(WORKSPACES.ready).authoringState, "ready");
    assert.equal(
      byId.get(WORKSPACES.ready).microsequenceStateMap["micro-ready"],
      "r"
    );
    assert.equal(byId.get(WORKSPACES.audit).authoringState, "audit_pending");
    assert.equal(byId.get(WORKSPACES.audit).activeFindingCount, 1);
    assert.equal(
      byId.get(WORKSPACES.audit).microsequenceStateMap["micro-audit"],
      "f"
    );
  } finally {
    await database.close();
  }
});

test("projeção é fechada por acesso, escopo e revisão corrente da análise", async () => {
  const database = await setupDatabase();
  try {
    await assert.rejects(database.query(`
      select public.get_authoring_workspace_product_states_v1(
        $1,array[$2::uuid,$2::uuid],false
      )
    `, [ACTOR, WORKSPACES.planning]), /duplicados/u);
    await assert.rejects(database.query(`
      select public.get_authoring_workspace_product_states_v1(
        $1,array[$2::uuid],false
      )
    `, [OTHER_ACTOR, WORKSPACES.planning]), /Ator inválido/u);
    await database.query(`
      update private.authoring_workspace_entities
      set version=3
      where workspace_id=$1 and entity_type='microsequence'
        and entity_id='micro-analysis'
    `, [WORKSPACES.analyzed]);
    const result = await scalar(database, `
      select public.get_authoring_workspace_product_states_v1(
        $1,array[$2::uuid],true
      ) value
    `, [ACTOR, WORKSPACES.analyzed]);
    assert.equal(result.items[0].authoringState, "planning");
    assert.equal(result.items[0].microsequenceStateMap["micro-analysis"], "p");
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'authenticated',
        'public.get_authoring_workspace_product_states_v1(uuid,uuid[],boolean)',
        'EXECUTE'
      ) value
    `), false);
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'service_role',
        'public.get_authoring_workspace_product_states_v1(uuid,uuid[],boolean)',
        'EXECUTE'
      ) value
    `), true);
    const manifest = await scalar(database, `
      select public.get_aralearn_runtime_manifest() value
    `);
    assert.equal(manifest.schemaRevision, "20260815233000");
    assert.equal(
      manifest.features.includes("authoring-product-state-projection-v1"),
      true
    );
  } finally {
    await database.close();
  }
});

test("projeção agrega findings uma vez e mantém curso grande compacto", async () => {
  const database = await setupDatabase();
  try {
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,content,version
      )
      select
        $1,'microsequence','micro-large-' || value,'lesson','lesson-large',
        case when value % 3 = 0 then '{"status":"ready"}'::jsonb else '{}'::jsonb end,
        1
      from generate_series(1,1500) value
    `, [WORKSPACES.planning]);
    await database.query(`
      insert into private.authoring_workspace_observations(
        id,workspace_id,kind,status,entity_type,entity_path
      )
      select
        ('40000000-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid,
        $1,'audit_finding','open','microsequence',
        array['course-large','module-large','lesson-large','micro-large-' || value]
      from generate_series(10,1500,10) value
    `, [WORKSPACES.planning]);
    const result = await scalar(database, `
      select public.get_authoring_workspace_product_states_v1(
        $1,array[$2::uuid],true
      ) value
    `, [ACTOR, WORKSPACES.planning]);
    const [item] = result.items;
    assert.equal(item.microsequenceCount, 1501);
    assert.equal(item.activeFindingCount, 150);
    assert.equal(Object.keys(item.microsequenceStateMap).length, 1501);
    assert.equal(item.microsequenceStateMap["micro-large-10"], "f");
    assert.equal(item.microsequenceStateMap["micro-large-11"], "p");
    assert.equal(item.authoringState, "audit_pending");
  } finally {
    await database.close();
  }
});
