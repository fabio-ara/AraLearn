import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

// Checkpoint histórico isolado: conserva a prova da migration 20260902160602.
// A semântica corrente é coberta por applied-design-upgrade-pglite.test.js e
// supabase/tests/018_component_policy_snapshot_preservation_test.sql.
const migrationUrl = new URL(
  "../../supabase/migrations/20260902160602_preserve_course_design_on_focal_mcp_corrections.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const COURSE = "20000000-0000-4000-8000-000000000001";

function upsert(unitId, { role = "theory", parentId = "micro-a", position = 1 } = {}) {
  return JSON.stringify([{
    entityType: "study_unit",
    entityId: unitId,
    parentType: "microsequence",
    parentId,
    position,
    content: {
      title: `Unidade ${unitId} corrigida`,
      role,
      content: [{
        id: "body",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Conteúdo focal corrigido." }
      }],
      response: null,
      feedback: [],
      topics: []
    }
  }]);
}

function sourceApplication(unitId) {
  return JSON.stringify([{ studyUnitId: unitId, sourceLinks: [] }]);
}

async function databaseBeforeFix() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema private;
    create schema extensions;

    create table public.courses(
      id uuid primary key,
      revision bigint not null default 1
    );
    create table private.course_entities(
      course_id uuid not null,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null,
      content jsonb not null,
      version bigint not null default 1,
      created_origin text,
      last_revision_origin text,
      design_snapshot jsonb,
      design_application jsonb,
      updated_at timestamptz not null default statement_timestamp(),
      primary key(course_id,entity_type,entity_id)
    );
    create table private.course_change_receipts(
      actor_id uuid not null,
      request_id text not null,
      result jsonb not null,
      expires_at timestamptz not null default statement_timestamp()+interval '1 day',
      primary key(actor_id,request_id)
    );

    create function private.require_service_role()
    returns void language sql as $$select$$;
    create function private.require_course_access_v1(uuid,uuid,boolean)
    returns void language sql as $$select$$;
    create function private.course_component_refs_from_content_v1(p_content jsonb)
    returns text[] language sql immutable as $$
      select coalesce(array_agg(
        (item.value->>'package')||'@'||(item.value->>'version')
        order by item.ordinal
      ),'{}'::text[])
      from jsonb_array_elements(p_content->'content')
        with ordinality item(value,ordinal)
    $$;
    create function private.course_component_policy_allows_v1(
      p_policy jsonb,p_ref text
    ) returns boolean language sql immutable as $$
      select not (p_policy->'excludedRefs' ? p_ref)
        and (
          p_policy->>'availability'='all'
          or p_policy->'allowedRefs' ? p_ref
        )
    $$;
    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $$
      select '{"schemaRevision":"20260902123759","contractVersion":1,
        "features":["single-authoring-runtime-v1"]}'::jsonb
    $$;

    create function public.commit_course_composition_for_actor_v1(
      p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
      p_upserts jsonb,p_deletes jsonb,p_source_attribution_applications jsonb,
      p_request_id text
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,public,private as $$
    declare
      v_result jsonb;
    begin
      update private.course_entities entity
      set parent_type=nullif(p_upserts->0->>'parentType',''),
        parent_id=nullif(p_upserts->0->>'parentId',''),
        position=(p_upserts->0->>'position')::integer,
        content=p_upserts->0->'content',
        version=entity.version+1,
        updated_at=statement_timestamp()
      where entity.course_id=p_course_id
        and entity.entity_type=p_upserts->0->>'entityType'
        and entity.entity_id=p_upserts->0->>'entityId';
      update public.courses set revision=revision+1 where id=p_course_id;
      v_result:=jsonb_build_object(
        'courseId',p_course_id,'revision',p_expected_revision+1,
        'updatedCount',1,'createdCount',0,'deletedCount',0,
        'idempotent',false
      );
      insert into private.course_change_receipts(actor_id,request_id,result)
      values(p_actor_id,p_request_id,v_result);
      return v_result;
    end $$;

    create function public.commit_course_composition_for_actor_v1(
      uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text
    ) returns jsonb language sql as $$select '{}'::jsonb$$;

    insert into public.courses(id) values('${COURSE}');
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content,
      design_snapshot,design_application,created_origin,last_revision_origin
    ) select '${COURSE}','study_unit',unit_id,'microsequence','micro-a',1,
      jsonb_build_object(
        'title','Unidade '||unit_id,'role','theory','content','[]'::jsonb,
        'response',null,'feedback','[]'::jsonb,'topics','[]'::jsonb
      ),
      '{"contract":"aralearn.study-unit-design-snapshot.v1",
        "appliedAt":"2026-09-01T00:00:00Z","parameters":[],
        "editorialDirections":[],"instructionalAnalysisUnitIds":[],
        "componentPolicy":{"policy":{"catalogVersion":"2.0.2",
          "availability":"all","allowedRefs":[],"excludedRefs":[],
          "preferredRefs":[]},"origin":"automatic",
          "sourceScopeKind":"course"}}'::jsonb,
      '{"contract":"aralearn.study-unit-design-application.v1",
        "introducedInstructionalAnalysisUnitIds":[],
        "explanationApplications":[],"practiceApplications":[],
        "componentRefs":[]}'::jsonb,
      'gpt','gpt'
    from unnest(array[
      'mcp-preserved','manual-invalidated','role-invalidated',
      'allow-only-invalidated','excluded-invalidated'
    ]) unit_id;
  `);
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
  return database;
}

async function setComponentPolicy(database, unitId, policy) {
  await database.query(`
    update private.course_entities
    set design_snapshot=jsonb_set(
      design_snapshot,'{componentPolicy,policy}',$3::jsonb,true
    )
    where course_id=$1 and entity_type='study_unit' and entity_id=$2
  `, [COURSE, unitId, JSON.stringify(policy)]);
}

function componentPolicy({
  availability,
  allowedRefs = [],
  excludedRefs = []
}) {
  return {
    catalogVersion: "2.0.2",
    availability,
    allowedRefs,
    excludedRefs,
    preferredRefs: []
  };
}

async function commit(database, {
  unitId,
  revision,
  requestId,
  channel,
  origin = null,
  expectedUnitVersion = null,
  role = "theory"
}) {
  return database.query(`
    select public.commit_course_composition_for_actor_v1(
      $1::uuid,$2::uuid,$3::bigint,$4::bigint,$5::jsonb,'[]'::jsonb,$6::jsonb,
      $7::text,$8::text,$9::text
    ) value
  `, [
    OWNER,
    COURSE,
    revision,
    expectedUnitVersion,
    upsert(unitId, { role }),
    sourceApplication(unitId),
    channel,
    origin,
    requestId
  ]);
}

async function design(database, unitId) {
  const result = await database.query(`
    select design_snapshot snapshot,design_application application,
      updated_at "updatedAt",last_revision_origin "lastRevisionOrigin"
    from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id=$2
  `, [COURSE, unitId]);
  return result.rows[0];
}

test("migration preserva desenho corrente na correção MCP da mesma função", async () => {
  const database = await databaseBeforeFix();
  await setComponentPolicy(database, "mcp-preserved", componentPolicy({
    availability: "allow_only",
    allowedRefs: ["aralearn.resource.paragraph@1.0.0"]
  }));
  await commit(database, {
    unitId: "mcp-preserved",
    revision: 1,
    requestId: "focal-mcp-preserve-0001",
    channel: "mcp"
  });

  const state = await design(database, "mcp-preserved");
  assert.equal(state.snapshot.contract, "aralearn.study-unit-design-snapshot.v1");
  assert.equal(state.application.contract, "aralearn.study-unit-design-application.v1");
  assert.deepEqual(state.application.componentRefs, [
    "aralearn.resource.paragraph@1.0.0"
  ]);
  assert.equal(new Date(state.snapshot.appliedAt).getTime(), state.updatedAt.getTime());
  assert.equal(state.lastRevisionOrigin, "gpt");
  assert.equal((await database.query(`
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' revision
  `)).rows[0].revision, "20260902160602");
});

test("allow_only fora da lista invalida desenho da correção MCP", async () => {
  const database = await databaseBeforeFix();
  await setComponentPolicy(database, "allow-only-invalidated", componentPolicy({
    availability: "allow_only",
    allowedRefs: ["aralearn.resource.table@1.0.0"]
  }));
  await commit(database, {
    unitId: "allow-only-invalidated",
    revision: 1,
    requestId: "focal-mcp-allow-only-0001",
    channel: "mcp"
  });

  const state = await design(database, "allow-only-invalidated");
  assert.equal(state.snapshot, null);
  assert.equal(state.application, null);
});

test("componente explicitamente excluído invalida desenho da correção MCP", async () => {
  const database = await databaseBeforeFix();
  await setComponentPolicy(database, "excluded-invalidated", componentPolicy({
    availability: "all",
    excludedRefs: ["aralearn.resource.paragraph@1.0.0"]
  }));
  await commit(database, {
    unitId: "excluded-invalidated",
    revision: 1,
    requestId: "focal-mcp-excluded-0001",
    channel: "mcp"
  });

  const state = await design(database, "excluded-invalidated");
  assert.equal(state.snapshot, null);
  assert.equal(state.application, null);
});

test("application/manual continua invalidando desenho após edição explícita", async () => {
  const database = await databaseBeforeFix();
  await commit(database, {
    unitId: "manual-invalidated",
    revision: 1,
    expectedUnitVersion: 1,
    requestId: "focal-manual-invalidate-0001",
    channel: "application",
    origin: "manual"
  });

  const state = await design(database, "manual-invalidated");
  assert.equal(state.snapshot, null);
  assert.equal(state.application, null);
  assert.equal(state.lastRevisionOrigin, "human");
});

test("application/provider_assistance preserva o mesmo caso focal do MCP", async () => {
  const database = await databaseBeforeFix();
  await commit(database, {
    unitId: "manual-invalidated",
    revision: 1,
    expectedUnitVersion: 1,
    requestId: "focal-provider-preserve-0001",
    channel: "application",
    origin: "provider_assistance"
  });

  const state = await design(database, "manual-invalidated");
  assert.equal(state.snapshot.contract, "aralearn.study-unit-design-snapshot.v1");
  assert.equal(state.application.contract, "aralearn.study-unit-design-application.v1");
  assert.equal(state.lastRevisionOrigin, "gpt");
});

test("mudança de função pelo canal MCP invalida desenho até rematerializar", async () => {
  const database = await databaseBeforeFix();
  await commit(database, {
    unitId: "role-invalidated",
    revision: 1,
    requestId: "focal-mcp-role-change-0001",
    channel: "mcp",
    role: "practice"
  });

  const state = await design(database, "role-invalidated");
  assert.equal(state.snapshot, null);
  assert.equal(state.application, null);
});
