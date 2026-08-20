import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import {
  COURSE_AUTHORING_ANALYTICS_CONTRACT,
  COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION,
  normalizeCourseAuthoringAnalyticsPage
} from "../../src/domain/courseAuthoringAnalytics.js";

const migrationUrl = new URL(
  "../../supabase/migrations/20260820063156_course_authoring_analytics.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const THIRD = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const PART = "30000000-0000-4000-8000-000000000001";
const MATERIALIZATION = "40000000-0000-4000-8000-000000000001";
const ANNOTATION = "50000000-0000-4000-8000-000000000001";
const AUDIT_RUN = "60000000-0000-4000-8000-000000000001";
const FINDING = "70000000-0000-4000-8000-000000000001";
const CORRECTION = "80000000-0000-4000-8000-000000000001";
const CHECKPOINT = "90000000-0000-4000-8000-000000000001";
const COMPARISON = "a0000000-0000-4000-8000-000000000001";

function query(overrides = {}) {
  return {
    datasets: [
      "activity", "materializations", "design", "sources", "annotations", "audits", "variants"
    ],
    channels: [],
    origins: [],
    states: [],
    from: null,
    to: null,
    limit: 200,
    cursor: null,
    ...overrides
  };
}

async function databaseWithAnalyticsRpc() {
  const migration = await fs.readFile(migrationUrl, "utf8");
  const start = migration.indexOf(
    "create function public.get_owned_course_authoring_analytics_for_actor_v1("
  );
  const end = migration.indexOf("\nrevoke all on function", start);
  assert.ok(start >= 0 && end > start, "a definição literal da RPC deve existir");

  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create schema private;
    create table auth.users(id uuid primary key);
    create table public.courses(
      id uuid primary key,owner_id uuid not null,title text not null,revision bigint not null
    );
    create table private.course_events(
      id bigint generated always as identity primary key,course_id uuid not null,
      revision bigint not null,operation text not null,summary jsonb not null,
      created_at timestamptz not null
    );
    create table private.course_authoring_parts(
      id uuid primary key,course_id uuid not null,title text not null
    );
    create table private.course_authoring_part_materializations(
      id uuid primary key,course_id uuid not null,authoring_part_id uuid not null,
      authoring_part_version bigint not null,channel text not null,status text not null,
      version bigint not null,design_context jsonb not null,started_at timestamptz not null,
      updated_at timestamptz not null,completed_at timestamptz
    );
    create table private.course_authoring_part_materialization_steps(
      id uuid primary key,course_id uuid not null,materialization_id uuid not null,
      step_kind text not null,status text not null
    );
    create table private.course_design_parameter_definitions(
      parameter_id text primary key,catalog_version text not null,value_kind text not null,
      definition jsonb not null
    );
    create table private.course_design_parameter_changes(
      id bigint generated always as identity primary key,course_id uuid not null,
      course_revision bigint not null,parameter_id text not null,scope_kind text not null,
      scope_ref text not null,action text not null,value jsonb,origin text,channel text not null,
      created_at timestamptz not null
    );
    create table private.course_authoring_guidance_revisions(
      id bigint generated always as identity primary key,revision_id uuid unique not null,
      course_id uuid not null,course_revision bigint not null,scope_kind text not null,
      scope_ref text not null,action text not null,guidance text,origin text,channel text not null,
      created_at timestamptz not null
    );
    create table private.course_authoring_guidance_interpretations(
      id bigint generated always as identity primary key,course_id uuid not null,
      course_revision bigint not null,guidance_revision_id uuid not null,
      interpretation jsonb not null,channel text not null,created_at timestamptz not null
    );
    create table private.course_component_policy_changes(
      id bigint generated always as identity primary key,course_id uuid not null,
      course_revision bigint not null,scope_kind text not null,scope_ref text not null,
      action text not null,policy jsonb,origin text,channel text not null,
      created_at timestamptz not null
    );
    create table private.course_source_revisions(
      course_id uuid not null,source_id text not null,revision bigint not null,status text not null,
      kind text,title text,citation_text text,url text,study_visibility text not null,
      created_at timestamptz not null,primary key(course_id,source_id,revision)
    );
    create table private.course_source_anchor_revisions(
      course_id uuid not null,anchor_id text not null,revision bigint not null,
      source_id text not null,source_revision bigint not null,status text not null,
      selector jsonb not null,verification_excerpt text,created_at timestamptz not null
    );
    create table private.course_source_attributions(
      course_id uuid not null,id uuid primary key,target_kind text not null,target_id text not null,
      target_version bigint not null,revision bigint not null,attribution_hash text not null,
      created_at timestamptz not null
    );
    create table private.course_source_attribution_sources(
      course_id uuid not null,attribution_id uuid not null,source_ordinal integer not null,
      source_id text not null
    );
    create table private.course_source_attribution_anchors(
      course_id uuid not null,attribution_id uuid not null,source_ordinal integer not null,
      anchor_ordinal integer not null
    );
    create table private.course_source_attachments(
      course_id uuid not null,source_id text not null,source_revision bigint not null,
      content_hash text not null,byte_size bigint not null,media_type text not null,
      created_at timestamptz not null
    );
    create table private.course_anchored_annotations(
      id uuid primary key,course_id uuid not null,origin text not null,channel text not null,
      target_kind text not null,target_id text not null,observed_course_revision bigint,
      observed_target_version bigint,automatic_method text not null,
      automatic_method_version bigint not null,effective_method text not null,
      effective_method_version bigint not null,effective_taxonomy_revision bigint,
      effective_subject_refs jsonb not null
    );
    create table private.course_anchored_annotation_events(
      id bigint generated always as identity primary key,course_id uuid not null,
      annotation_id uuid not null,annotation_version bigint not null,event_type text not null,
      metadata jsonb not null,created_at timestamptz not null
    );
    create table private.course_instructional_audit_runs(
      course_id uuid not null,id uuid not null,run_kind text not null,origin text not null,
      method jsonb not null,course_revision bigint not null,context_hash text not null,
      target_study_unit_id text not null,target_version bigint not null,target_path jsonb not null,
      checks jsonb not null,findings_created integer not null,created_at timestamptz not null,
      primary key(course_id,id)
    );
    create table private.course_audit_findings(
      course_id uuid not null,finding_id uuid not null,finding_version bigint not null,
      origin_audit_run_id uuid not null,status text not null,decision text not null,
      code text not null,severity text not null,created_at timestamptz not null,
      primary key(course_id,finding_id,finding_version)
    );
    create table private.course_authoring_corrections(
      course_id uuid not null,correction_id uuid not null,correction_version bigint not null,
      finding_id uuid not null,finding_version bigint not null,status text not null,
      target_study_unit_id text not null,base_target_version bigint not null,
      application jsonb,verification jsonb,rollback jsonb,created_at timestamptz not null,
      primary key(course_id,correction_id,correction_version)
    );
    create table private.course_audit_finding_annotations(
      course_id uuid not null,finding_id uuid not null,annotation_id uuid not null
    );
    create table private.course_variant_plan_checkpoints(
      id uuid primary key,owner_id uuid not null,source_course_id uuid not null,
      source_course_revision bigint not null,source_plan_version bigint not null,
      snapshot_hash text not null,created_at timestamptz not null
    );
    create table private.course_variant_comparison_sets(
      id uuid primary key,owner_id uuid not null,checkpoint_id uuid not null,
      source_course_id uuid not null,source_course_revision bigint not null,
      version bigint not null,created_at timestamptz not null
    );
    create table private.course_variant_comparison_members(
      comparison_set_id uuid not null,course_id uuid not null,label text not null,
      declared_parameter_differences jsonb not null,
      declared_component_policy_difference jsonb,attached_course_revision bigint not null,
      detached_at timestamptz,created_at timestamptz not null,
      primary key(comparison_set_id,course_id)
    );
    create function private.require_service_role()
    returns void language sql stable as $$select null::void$$;
    create function private.require_course_access_v1(uuid,uuid,boolean)
    returns text language plpgsql stable as $$
    begin
      if not exists(
        select 1 from public.courses course
        where course.id=$1 and (not $3 or course.owner_id=$2)
      ) then
        raise exception 'Edição do Curso não autorizada.' using errcode='42501';
      end if;
      return 'owned';
    end;
    $$;
    create function private.course_source_json_hash_v1(jsonb)
    returns text language sql immutable as $$
      select md5(coalesce($1::text,'null'))||md5('2'||coalesce($1::text,'null'))
    $$;
  `);
  await database.exec(migration.slice(start, end));
  return { database, migration };
}

async function seed(database) {
  await database.query("insert into auth.users(id) values($1),($2)", [OWNER, THIRD]);
  await database.query(
    "insert into public.courses(id,owner_id,title,revision) values($1,$2,'Curso de teste',7)",
    [COURSE, OWNER]
  );
  await database.query(
    `insert into private.course_events(course_id,revision,operation,summary,created_at)
     values($1,7,'advance_course_authoring_part_materialization',$2,'2026-08-19T10:00:00Z')`,
    [COURSE, JSON.stringify({
      activityKind: "part_materialization_completed",
      channel: "mcp",
      materializationId: MATERIALIZATION,
      createdCount: 1,
      updatedCount: 0,
      deletedCount: 0
    })]
  );
  await database.query(
    "insert into private.course_authoring_parts(id,course_id,title) values($1,$2,'Parte inicial')",
    [PART, COURSE]
  );
  await database.query(
    `insert into private.course_authoring_part_materializations(
       id,course_id,authoring_part_id,authoring_part_version,channel,status,version,
       design_context,started_at,updated_at,completed_at
     ) values($1,$2,$3,2,'mcp','completed',3,'{"profile":"v1"}',
       '2026-08-19T08:59:56.8Z','2026-08-19T09:00:00Z','2026-08-19T09:00:00Z')`,
    [MATERIALIZATION, COURSE, PART]
  );
  await database.query(
    `insert into private.course_authoring_part_materialization_steps(
       id,course_id,materialization_id,step_kind,status
     ) values('41000000-0000-4000-8000-000000000001',$1,$2,
       'didactic_microsequence_materialization','completed')`,
    [COURSE, MATERIALIZATION]
  );
  await database.exec(`
    insert into private.course_design_parameter_definitions(
      parameter_id,catalog_version,value_kind,definition
    ) values('required_explanation_forms','1.0.0','set','{"label":"Formas de explicação"}');
  `);
  await database.query(
    `insert into private.course_design_parameter_changes(
       course_id,course_revision,parameter_id,scope_kind,scope_ref,action,value,
       origin,channel,created_at
     ) values($1,6,'required_explanation_forms','course',$2,'set',
       '["mechanism"]','author','application','2026-08-19T08:00:00Z')`,
    [COURSE, COURSE]
  );
  await database.query(
    `insert into private.course_source_revisions(
       course_id,source_id,revision,status,kind,title,citation_text,url,study_visibility,created_at
     ) values($1,'source one',2,'active','document','Fonte principal','Citação',null,
       'citation','2026-08-19T07:00:00Z')`,
    [COURSE]
  );
  await database.query(
    `insert into private.course_source_attachments(
       course_id,source_id,source_revision,content_hash,byte_size,media_type,created_at
     ) values($1,'source one',2,$2,2048,'application/pdf','2026-08-19T07:01:00Z')`,
    [COURSE, "a".repeat(64)]
  );
  await database.query(
    `insert into private.course_anchored_annotations(
       id,course_id,origin,channel,target_kind,target_id,observed_course_revision,
       observed_target_version,automatic_method,automatic_method_version,effective_method,
       effective_method_version,effective_taxonomy_revision,effective_subject_refs
     ) values($1,$2,'learner','study_interface','study_unit','unit-a',5,2,
       'exact_topic_target',1,'human_topic_selection',1,6,$3)`,
    [ANNOTATION, COURSE, JSON.stringify([{ topicId: "topic-a", label: "Tópico A", topicVersion: 1 }])]
  );
  await database.query(
    `insert into private.course_anchored_annotation_events(
       course_id,annotation_id,annotation_version,event_type,metadata,created_at
     ) values($1,$2,2,'classification_corrected',$3,'2026-08-19T06:00:00Z')`,
    [COURSE, ANNOTATION, JSON.stringify({ category: "confusing", state: "open", subjectCount: 1 })]
  );
  const targetPath = JSON.stringify([
    { kind: "course", id: COURSE, label: "Curso" },
    { kind: "module", id: "module-a", label: "Módulo" },
    { kind: "lesson", id: "lesson-a", label: "Lição" },
    { kind: "didactic_microsequence", id: "micro-a", label: "Microssequência" },
    { kind: "study_unit", id: "unit-a", label: "Unidade A" }
  ]);
  await database.query(
    `insert into private.course_instructional_audit_runs(
       course_id,id,run_kind,origin,method,course_revision,context_hash,
       target_study_unit_id,target_version,target_path,checks,findings_created,created_at
     ) values($1,$2,'audit','automatic_audit',$3,5,$4,'unit-a',2,$5,'[]',1,
       '2026-08-19T05:00:00Z')`,
    [COURSE, AUDIT_RUN, JSON.stringify({ id: "audit-method", version: "1" }), "b".repeat(64), targetPath]
  );
  await database.query(
    `insert into private.course_audit_findings(
       course_id,finding_id,finding_version,origin_audit_run_id,status,decision,
       code,severity,created_at
     ) values($1,$2,1,$3,'open','recorded','missing_source','high',
       '2026-08-19T05:01:00Z')`,
    [COURSE, FINDING, AUDIT_RUN]
  );
  await database.query(
    `insert into private.course_authoring_corrections(
       course_id,correction_id,correction_version,finding_id,finding_version,status,
       target_study_unit_id,base_target_version,application,verification,rollback,created_at
     ) values($1,$2,1,$3,1,'proposed','unit-a',2,null,null,null,
       '2026-08-19T05:02:00Z')`,
    [COURSE, CORRECTION, FINDING]
  );
  await database.query(
    `insert into private.course_variant_plan_checkpoints(
       id,owner_id,source_course_id,source_course_revision,source_plan_version,
       snapshot_hash,created_at
     ) values($1,$2,$3,4,2,$4,'2026-08-19T04:00:00Z')`,
    [CHECKPOINT, OWNER, COURSE, "c".repeat(64)]
  );
  await database.query(
    `insert into private.course_variant_comparison_sets(
       id,owner_id,checkpoint_id,source_course_id,source_course_revision,version,created_at
     ) values($1,$2,$3,$4,4,1,'2026-08-19T04:01:00Z')`,
    [COMPARISON, OWNER, CHECKPOINT, COURSE]
  );
  await database.query(
    `insert into private.course_variant_comparison_members(
       comparison_set_id,course_id,label,declared_parameter_differences,
       declared_component_policy_difference,attached_course_revision,created_at
     ) values($1,$2,'Original','[]',null,4,'2026-08-19T04:02:00Z')`,
    [COMPARISON, COURSE]
  );
}

async function load(database, actor, analyticsQuery) {
  const result = await database.query(
    `select public.get_owned_course_authoring_analytics_for_actor_v1(
       $1,$2,7,$3::jsonb
     ) value`,
    [actor, COURSE, JSON.stringify(analyticsQuery)]
  );
  return result.rows[0].value;
}

test("RPC projeta os sete conjuntos sem dados pessoais nem textos protegidos", async () => {
  const { database } = await databaseWithAnalyticsRpc();
  await seed(database);
  const page = await load(database, OWNER, query());
  assert.equal(page.contract, "aralearn.course-authoring-analytics-rows.v1");
  assert.equal(page.courseId, COURSE);
  assert.equal(page.courseRevision, 7);
  assert.deepEqual(
    [...new Set(page.facts.map(({ dataset }) => dataset))].sort(),
    ["activity", "annotations", "audits", "design", "materializations", "sources", "variants"]
  );
  assert.equal(page.summary.factCount, page.facts.length);
  const normalized = normalizeCourseAuthoringAnalyticsPage({
    contract: COURSE_AUTHORING_ANALYTICS_CONTRACT,
    dictionaryVersion: COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION,
    courseId: page.courseId,
    courseRevision: page.courseRevision,
    generatedAt: page.generatedAt,
    query: page.query,
    metrics: [{
      id: "fact_count",
      version: 1,
      label: "Fatos no recorte",
      question: "Quantos fatos pertencem ao recorte?",
      definition: "Conta cada fato projetado uma vez.",
      unit: "count",
      denominator: null,
      missingData: "Ausências explícitas permanecem marcadas nos fatos.",
      prohibitedInferences: ["A contagem não mede aprendizagem ou qualidade."]
    }],
    overview: {
      metricId: "fact_count",
      title: "Fatos no recorte",
      question: "Quantos fatos pertencem ao recorte?",
      series: [{
        key: "all",
        label: "Todos",
        value: page.summary.factCount,
        unit: "count",
        denominator: page.summary.factCount,
        missing: false
      }]
    },
    facts: page.facts,
    nextCursor: page.nextCursor,
    limitations: ["Fatos de processo não medem aprendizagem."],
    deepLink: `https://fabio-ara.github.io/AraLearn/#/authoring/courses/${COURSE}?section=research`
  });
  assert.equal(normalized.facts.length, page.facts.length);
  const serialized = JSON.stringify(page);
  assert.doesNotMatch(serialized, new RegExp(OWNER, "u"));
  assert.doesNotMatch(serialized, /raw_text|before_snapshot|after_snapshot|Correção focal/iu);
  assert.equal(page.facts.find(({ dataset }) => dataset === "materializations")
    .values.duration_milliseconds, 3200);
  assert.equal(page.facts.find(({ dataset }) => dataset === "annotations")
    .subject.id, "topic-a");
  await database.close();
});

test("RPC aplica autorização, filtros e período no servidor", async () => {
  const { database } = await databaseWithAnalyticsRpc();
  await seed(database);
  await assert.rejects(load(database, THIRD, query()), (error) => error.code === "42501");

  const channelPage = await load(database, OWNER, query({
    channels: ["study_interface"]
  }));
  assert.ok(channelPage.facts.length > 0);
  assert.ok(channelPage.facts.every(({ channel }) => channel === "study_interface"));

  const statePage = await load(database, OWNER, query({
    datasets: ["materializations"],
    origins: ["automatic"],
    states: ["completed"],
    from: "2026-08-19T08:59:59.000Z",
    to: "2026-08-19T09:00:01.000Z"
  }));
  assert.equal(statePage.facts.length, 1);
  assert.equal(statePage.facts[0].dataset, "materializations");
  await database.close();
});

test("cursor keyset percorre o recorte sem repetição e conserva o resumo", async () => {
  const { database } = await databaseWithAnalyticsRpc();
  await seed(database);
  const firstQuery = query({ limit: 3 });
  const first = await load(database, OWNER, firstQuery);
  assert.equal(first.facts.length, 3);
  assert.match(first.nextCursor, /^[A-Za-z0-9_-]+$/u);

  const second = await load(database, OWNER, {
    ...firstQuery,
    cursor: first.nextCursor
  });
  assert.equal(first.summary.factCount, second.summary.factCount);
  assert.equal(
    first.facts.some(({ factId }) => second.facts.some((entry) => entry.factId === factId)),
    false
  );
  assert.ok(Date.parse(first.facts.at(-1).occurredAt) >= Date.parse(second.facts[0].occurredAt));
  await database.close();
});

test("migration limita a RPC ao service_role e avança o manifesto", async () => {
  const migration = await fs.readFile(migrationUrl, "utf8");
  assert.match(migration, /revoke all on function public\.get_owned_course_authoring_analytics_for_actor_v1\([\s\S]*from public,anon,authenticated,service_role;/u);
  assert.match(migration, /grant execute on function public\.get_owned_course_authoring_analytics_for_actor_v1\([\s\S]*to service_role;/u);
  assert.match(migration, /'schemaRevision','20260820063156'/u);
  assert.match(migration, /'course-authoring-analytics-v1'/u);
});
