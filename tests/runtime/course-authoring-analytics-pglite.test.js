import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import {
  COURSE_AUTHORING_ANALYTICS_CONTRACT,
  normalizeCourseAuthoringAnalyticsPage
} from "../../src/domain/courseAuthoringAnalytics.js";

const migrationUrl = new URL(
  "../../supabase/migrations/20260902040050_simplify_course_authoring_analytics.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const THIRD = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const EMPTY_COURSE = "20000000-0000-4000-8000-000000000002";
const PART = "30000000-0000-4000-8000-000000000001";
const MATERIALIZATION_A1 = "40000000-0000-4000-8000-000000000001";
const MATERIALIZATION_A2 = "40000000-0000-4000-8000-000000000002";
const MATERIALIZATION_B = "40000000-0000-4000-8000-000000000003";
const ANALYSIS_A = "50000000-0000-4000-8000-000000000001";
const ANALYSIS_B = "50000000-0000-4000-8000-000000000002";
const EVIDENCE = "60000000-0000-4000-8000-000000000001";

const PARAMETER_DEFINITIONS = Object.freeze([{
  id: "new_analysis_unit_ceiling_per_expository_study_unit",
  ordinal: 1,
  valueKind: "integer",
  label: "Novas unidades de análise por Unidade expositiva",
  defaultValue: 2
}, {
  id: "required_explanation_forms",
  ordinal: 2,
  valueKind: "set",
  label: "Formas de explicação requeridas",
  defaultValue: ["plain_definition"]
}, {
  id: "minimum_distinct_practice_opportunities_per_evidence_requirement",
  ordinal: 3,
  valueKind: "integer",
  label: "Oportunidades distintas por requisito de evidência",
  defaultValue: 2
}, {
  id: "required_practice_variation_dimensions",
  ordinal: 4,
  valueKind: "set",
  label: "Dimensões requeridas de variação da prática",
  defaultValue: ["case_or_data"]
}]);

function query(kind = "course", ref = null) {
  return { scope: { kind, ref } };
}

function parameterSnapshot(ceiling) {
  return PARAMETER_DEFINITIONS.map((definition) => ({
    parameterId: definition.id,
    value: definition.id ===
      "new_analysis_unit_ceiling_per_expository_study_unit"
      ? ceiling
      : structuredClone(definition.defaultValue),
    origin: "research_condition",
    reason: "Condição explícita da fixture.",
    sourceScope: { kind: "didactic_microsequence", ref: "fixture" }
  }));
}

function designContext(microsequenceId, ceiling, direction, courseRevision) {
  const guidanceId = `${microsequenceId === "micro-a" ? "71000000" : "72000000"}` +
    "-0000-4000-8000-000000000001";
  return {
    contract: "aralearn.course-design-context.v2",
    courseId: COURSE,
    courseRevision,
    authoringPartId: PART,
    componentCatalogVersion: "fixture",
    instructionalAnalysisUnits: [{
      id: ANALYSIS_A,
      position: 0,
      statement: "Distinguir endereço de rede e porta de serviço.",
      version: 1
    }, {
      id: ANALYSIS_B,
      position: 1,
      statement: "Relacionar socket, processo e porta.",
      version: 1
    }],
    evidenceRequirements: [{
      id: EVIDENCE,
      position: 0,
      statement: "Escolher a porta correta em casos variados.",
      version: 1
    }],
    guidanceRevisions: [{
      revisionId: guidanceId,
      guidance: direction,
      origin: "author",
      reason: "Direção editorial da fixture.",
      sourceScope: { kind: "didactic_microsequence", ref: microsequenceId },
      currentInterpretation: null
    }],
    targets: [{
      didacticMicrosequenceId: microsequenceId,
      instructionalAnalysisUnitIds: [ANALYSIS_A, ANALYSIS_B],
      evidenceRequirementIds: [EVIDENCE],
      parameters: parameterSnapshot(ceiling),
      guidanceRevisionIds: [guidanceId],
      componentPolicy: null,
      sourceAttributions: {
        instructionalAnalysisUnits: [], evidenceRequirements: []
      }
    }]
  };
}

function designApplication(microsequenceId, units) {
  return {
    contextHash: "a".repeat(64),
    didacticMicrosequenceId: microsequenceId,
    studyUnits: units
  };
}

function applicationUnit(id, {
  introduced,
  forms = ["plain_definition"],
  practices = [],
  components = ["aralearn.resource.paragraph@1.0.0"]
}) {
  return {
    studyUnitId: id,
    mode: practices.length ? "mixed" : "expository",
    introducedInstructionalAnalysisUnitIds: introduced,
    explanationApplications: introduced.map((analysisId) => ({
      instructionalAnalysisUnitId: analysisId,
      developedForms: forms,
      notApplicable: []
    })),
    practiceApplications: practices,
    componentRefs: components
  };
}

async function databaseWithAnalyticsRpc({ fullMigration = false } = {}) {
  const migration = await fs.readFile(migrationUrl, "utf8");
  const start = migration.indexOf(
    "create function public.get_owned_course_authoring_analytics_for_actor_v2("
  );
  const end = migration.indexOf("\nrevoke all on function", start);
  assert.ok(start >= 0 && end > start, "a definição literal da RPC v2 deve existir");
  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create schema private;
    create table auth.users(id uuid primary key);
    create table public.courses(
      id uuid primary key,owner_id uuid not null,title text not null,
      revision bigint not null,created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table private.course_entities(
      course_id uuid not null,entity_type text not null,entity_id text not null,
      parent_type text,parent_id text,position integer not null,content jsonb not null,
      version bigint not null,created_at timestamptz not null,updated_at timestamptz not null,
      primary key(course_id,entity_type,entity_id)
    );
    create table private.course_events(
      id bigint generated always as identity primary key,course_id uuid not null,
      revision bigint not null,operation text not null,summary jsonb not null,
      actor_id uuid,created_at timestamptz not null
    );
    create table private.course_authoring_parts(
      id uuid primary key,course_id uuid not null,instructional_plan_id uuid not null,
      position integer,title text not null,intent text not null,version bigint not null,
      retired_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now()
    );
    create table private.course_authoring_part_didactic_microsequences(
      course_id uuid not null,authoring_part_id uuid not null,
      didactic_microsequence_id text not null,production_position integer not null
    );
    create table private.course_authoring_part_materializations(
      id uuid primary key,course_id uuid not null,authoring_part_id uuid not null,
      channel text not null,status text not null,design_context jsonb not null
    );
    create table private.course_authoring_part_materialization_steps(
      id uuid primary key,course_id uuid not null,materialization_id uuid not null,
      step_kind text not null,target_didactic_microsequence_id text,status text not null,
      result_facts jsonb not null,completed_at timestamptz
    );
    create table private.course_design_parameter_definitions(
      parameter_id text primary key,ordinal smallint not null,catalog_version text not null,
      value_kind text not null,supported_scopes text[] not null,definition jsonb not null,
      default_value jsonb not null,created_at timestamptz default now()
    );
    create table private.course_design_parameter_changes(
      id bigint generated always as identity primary key,course_id uuid not null,
      course_revision bigint not null,parameter_id text not null,scope_kind text not null,
      scope_ref text not null,action text not null,value jsonb,origin text,reason text,
      actor_id uuid,channel text not null,created_at timestamptz not null
    );
    create table private.course_source_attributions(
      course_id uuid not null,id uuid not null,target_kind text not null,
      target_id text not null,target_version bigint not null,target_hash text not null,
      revision bigint not null,attribution_hash text not null,created_at timestamptz default now()
    );
    create table private.course_source_attribution_sources(
      course_id uuid not null,attribution_id uuid not null,source_ordinal integer not null,
      source_id text not null,source_revision bigint not null,relation text not null
    );
    create table private.course_source_attribution_anchors(
      course_id uuid not null,attribution_id uuid not null,source_ordinal integer not null,
      anchor_ordinal integer not null,source_id text not null,source_revision bigint not null,
      anchor_id text not null,anchor_revision bigint not null
    );
    create table private.course_anchored_annotations(
      id uuid primary key,course_id uuid not null,origin text not null,channel text not null,
      target_kind text not null,target_id text not null,state text not null
    );
    create table private.course_authoring_corrections(
      course_id uuid not null,correction_id uuid not null,correction_version bigint not null,
      status text not null,target_study_unit_id text not null,
      primary key(course_id,correction_id,correction_version)
    );
    create function private.require_service_role()
    returns void language sql stable as $$select null::void$$;
    create function private.require_course_access_v1(uuid,uuid,boolean)
    returns text language plpgsql stable as $$
    begin
      if not exists(select 1 from public.courses course
        where course.id=$1 and (not $3 or course.owner_id=$2)) then
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
  if (fullMigration) {
    await database.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create index course_events_analytics_v1_idx
        on private.course_events(operation,created_at desc,id desc);
      create function public.get_owned_course_authoring_analytics_for_actor_v1(
        uuid,uuid,bigint,jsonb
      ) returns jsonb language sql stable as $$select '{}'::jsonb$$;
      create function public.get_aralearn_runtime_manifest()
      returns jsonb language sql stable security definer set search_path=pg_catalog as $$
        select '{
          "schemaRevision":"20260831183106",
          "contractVersion":1,
          "features":["course-authoring-analytics-v1"]
        }'::jsonb
      $$;
    `);
    await database.exec(migration);
  } else {
    await database.exec(migration.slice(start, end));
  }
  return { database, migration };
}

async function insertEntity(database, values) {
  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content,
      version,created_at,updated_at
    ) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
  `, values);
}

async function seed(database) {
  await database.query("insert into auth.users(id) values($1),($2)", [OWNER, THIRD]);
  await database.query(`
    insert into public.courses(id,owner_id,title,revision) values
      ($1,$2,'Curso de redes',7),($3,$2,'Curso vazio',1)
  `, [COURSE, OWNER, EMPTY_COURSE]);
  await insertEntity(database, [
    COURSE, "module", "module-a", null, null, 0,
    JSON.stringify({ title: "Módulo" }), 1,
    "2026-08-19T08:00:00Z", "2026-08-19T08:00:00Z"
  ]);
  await insertEntity(database, [
    COURSE, "lesson", "lesson-a", "module", "module-a", 0,
    JSON.stringify({ title: "Lição" }), 1,
    "2026-08-19T08:00:00Z", "2026-08-19T08:00:00Z"
  ]);
  for (const [microId, position, title] of [
    ["micro-a", 0, "Teto um"], ["micro-b", 1, "Teto dois"]
  ]) {
    await insertEntity(database, [
      COURSE, "microsequence", microId, "lesson", "lesson-a", position,
      JSON.stringify({ title }), 1,
      "2026-08-19T08:00:00Z", "2026-08-19T08:00:00Z"
    ]);
  }
  const contents = [{
    id: "unit-a1", micro: "micro-a", position: 1, title: "Endereço e porta",
    content: [{ id: "p1", package: "aralearn.resource.paragraph", version: "1.0.0",
      data: { text: "Explicação." } }], response: null, feedback: []
  }, {
    id: "unit-a2", micro: "micro-a", position: 2, title: "Socket e processo",
    content: [{ id: "t1", package: "aralearn.resource.table", version: "1.0.0",
      data: { columns: [], rows: [] } }],
    response: { id: "r1", package: "aralearn.response.choice", version: "1.0.0",
      data: { prompt: "Escolha.", options: [] } }, feedback: []
  }, {
    id: "unit-b1", micro: "micro-b", position: 1, title: "Relação integrada",
    createdAt: "2026-08-19T09:30:00Z",
    updatedAt: "2026-08-19T09:30:00Z",
    content: [{ id: "p2", package: "aralearn.resource.paragraph", version: "1.0.0",
      data: { text: "Explicação integrada." } }],
    response: { id: "r2", package: "aralearn.response.choice", version: "1.0.0",
      data: { prompt: "Escolha.", options: [] } }, feedback: []
  }, {
    id: "unit-b2", micro: "micro-b", position: 2, title: "Unidade sem snapshot",
    updatedAt: "2026-08-19T11:30:00Z",
    content: [{ id: "c1", package: "aralearn.resource.code", version: "1.0.0",
      data: { code: "listen()" } }], response: null, feedback: []
  }];
  for (const unit of contents) {
    await insertEntity(database, [
      COURSE, "study_unit", unit.id, "microsequence", unit.micro, unit.position,
      JSON.stringify({
        title: unit.title, role: "theory", content: unit.content,
        response: unit.response, feedback: unit.feedback, topics: []
      }), 1, unit.createdAt ?? "2026-08-19T09:00:00Z",
      unit.updatedAt ?? "2026-08-19T09:00:00Z"
    ]);
  }
  await database.query(`
    insert into private.course_authoring_parts(
      id,course_id,instructional_plan_id,position,title,intent,version
    ) values($1,$2,'31000000-0000-4000-8000-000000000001',0,
      'Parte de redes','Comparar tetos.',1)
  `, [PART, COURSE]);
  await database.query(`
    insert into private.course_authoring_part_didactic_microsequences(
      course_id,authoring_part_id,didactic_microsequence_id,production_position
    ) values($1,$2,'micro-a',0),($1,$2,'micro-b',1)
  `, [COURSE, PART]);
  for (const definition of PARAMETER_DEFINITIONS) {
    await database.query(`
      insert into private.course_design_parameter_definitions(
        parameter_id,ordinal,catalog_version,value_kind,supported_scopes,
        definition,default_value
      ) values($1,$2,'1.0.0',$3,array['course','lesson','didactic_microsequence'],
        $4::jsonb,$5::jsonb)
    `, [
      definition.id, definition.ordinal, definition.valueKind,
      JSON.stringify({ label: definition.label }), JSON.stringify(definition.defaultValue)
    ]);
  }
  const applications = [{
    materializationId: MATERIALIZATION_A1,
    stepId: "41000000-0000-4000-8000-000000000001",
    micro: "micro-a", ceiling: 1, revision: 4, channel: "mcp",
    completedAt: "2026-08-19T09:00:00Z",
    units: [
      applicationUnit("unit-a1", { introduced: [ANALYSIS_A] }),
      applicationUnit("unit-a2", {
        introduced: [ANALYSIS_B], forms: ["mechanism", "contrast"],
        practices: [{
          evidenceRequirementId: EVIDENCE,
          opportunityId: "opportunity-a",
          invariantTaskOperation: "escolher porta",
          variedDimensions: ["case_or_data", "context"]
        }],
        components: ["aralearn.resource.table@1.0.0", "aralearn.response.choice@1.0.0"]
      })
    ]
  }, {
    materializationId: MATERIALIZATION_A2,
    stepId: "41000000-0000-4000-8000-000000000002",
    micro: "micro-a", ceiling: 1, revision: 6, channel: "mcp",
    completedAt: "2026-08-19T10:00:00Z",
    units: [applicationUnit("unit-a1", { introduced: [ANALYSIS_A] })]
  }, {
    materializationId: MATERIALIZATION_B,
    stepId: "41000000-0000-4000-8000-000000000003",
    micro: "micro-b", ceiling: 2, revision: 5, channel: "actions",
    completedAt: "2026-08-19T09:30:00Z",
    units: [
      applicationUnit("unit-b1", {
        introduced: [ANALYSIS_A, ANALYSIS_B], forms: ["worked_example"],
        practices: [{
          evidenceRequirementId: EVIDENCE,
          opportunityId: "opportunity-b",
          invariantTaskOperation: "escolher porta",
          variedDimensions: ["case_or_data"]
        }],
        components: ["aralearn.resource.paragraph@1.0.0", "aralearn.response.choice@1.0.0"]
      }),
      applicationUnit("unit-b2", {
        introduced: [],
        components: ["aralearn.resource.code@1.0.0"]
      })
    ]
  }];
  for (const item of applications) {
    const context = designContext(
      item.micro,
      item.ceiling,
      item.micro === "micro-a" ? "Parágrafos curtos." : "Exemplo antes da prática.",
      item.revision
    );
    await database.query(`
      insert into private.course_authoring_part_materializations(
        id,course_id,authoring_part_id,channel,status,design_context
      ) values($1,$2,$3,$4,'completed',$5::jsonb)
    `, [item.materializationId, COURSE, PART, item.channel, JSON.stringify(context)]);
    await database.query(`
      insert into private.course_authoring_part_materialization_steps(
        id,course_id,materialization_id,step_kind,target_didactic_microsequence_id,
        status,result_facts,completed_at
      ) values($1,$2,$3,'didactic_microsequence_materialization',$4,
        'completed',$5::jsonb,$6)
    `, [
      item.stepId, COURSE, item.materializationId, item.micro,
      JSON.stringify({ designApplication: designApplication(item.micro, item.units) }),
      item.completedAt
    ]);
  }
  await database.query(`
    insert into private.course_design_parameter_changes(
      course_id,course_revision,parameter_id,scope_kind,scope_ref,action,value,
      origin,reason,actor_id,channel,created_at
    ) values
      ($1,2,$2,'course',$4,'set','2','author','Curso',$3,'application',now()),
      ($1,3,$2,'didactic_microsequence','micro-a','set','1','author','Teto 1',$3,'application',now()),
      ($1,4,$2,'didactic_microsequence','micro-b','set','2','research_condition','Teto 2',$3,'mcp',now()),
      ($1,5,$2,'module','module-a','clear',null,null,'Remover override',$3,'actions',now())
  `, [COURSE, PARAMETER_DEFINITIONS[0].id, OWNER, COURSE]);
  await database.query(`
    insert into private.course_events(
      course_id,revision,operation,summary,actor_id,created_at
    ) values
      ($1,4,'replace_course_composition',
        '{"channel":"mcp","createdCount":0,"updatedCount":1}',$2,
        '2026-08-19T10:30:00Z'),
      ($1,5,'replace_course_composition',
        '{"channel":"actions","createdCount":1,"updatedCount":1}',$2,
        '2026-08-19T10:45:00Z'),
      ($1,6,'replace_course_composition',
        '{"applicationOrigin":"manual","createdCount":0,"updatedCount":1}',$2,
        '2026-08-19T11:00:00Z'),
      ($1,7,'replace_course_composition',
        '{"applicationOrigin":"provider_assistance","createdCount":0,"updatedCount":1}',$2,
        '2026-08-19T12:00:00Z')
  `, [COURSE, OWNER]);
  await database.query(`
    insert into private.course_anchored_annotations(
      id,course_id,origin,channel,target_kind,target_id,state
    ) values
      ('81000000-0000-4000-8000-000000000001',$1,'author','authoring_interface',
        'study_unit','unit-a1','open'),
      ('81000000-0000-4000-8000-000000000002',$1,'learner','study_interface',
        'study_unit','unit-a2','resolved'),
      ('81000000-0000-4000-8000-000000000003',$1,'human_audit','audit_interface',
        'study_unit','unit-b1','open'),
      ('81000000-0000-4000-8000-000000000004',$1,'author','authoring_chat',
        'didactic_microsequence','micro-a','open')
  `, [COURSE]);
  await database.query(`
    insert into private.course_authoring_corrections(
      course_id,correction_id,correction_version,status,target_study_unit_id
    ) values
      ($1,'82000000-0000-4000-8000-000000000001',1,'applied','unit-a1'),
      ($1,'82000000-0000-4000-8000-000000000002',1,'rejected','unit-a2')
  `, [COURSE]);
  const attributionId = "83000000-0000-4000-8000-000000000001";
  await database.query(`
    insert into private.course_source_attributions(
      course_id,id,target_kind,target_id,target_version,target_hash,revision,
      attribution_hash
    ) select $1,$2,'study_unit',entity.entity_id,entity.version,
      private.course_source_json_hash_v1(jsonb_build_object(
        'targetKind','study_unit','content',entity.content
      )),1,private.course_source_json_hash_v1('[]'::jsonb)
    from private.course_entities entity
    where entity.course_id=$1 and entity.entity_type='study_unit'
      and entity.entity_id='unit-a1'
  `, [COURSE, attributionId]);
  await database.query(`
    insert into private.course_source_attribution_sources(
      course_id,attribution_id,source_ordinal,source_id,source_revision,relation
    ) values($1,$2,0,'source-a',1,'supported_by')
  `, [COURSE, attributionId]);
  await database.query(`
    insert into private.course_source_attribution_anchors(
      course_id,attribution_id,source_ordinal,anchor_ordinal,source_id,
      source_revision,anchor_id,anchor_revision
    ) values($1,$2,0,0,'source-a',1,'anchor-a',1)
  `, [COURSE, attributionId]);
  const staleAttributionId = "83000000-0000-4000-8000-000000000002";
  await database.query(`
    insert into private.course_source_attributions(
      course_id,id,target_kind,target_id,target_version,target_hash,revision,
      attribution_hash
    ) values($1,$2,'study_unit','unit-a1',1,repeat('0',64),2,repeat('1',64))
  `, [COURSE, staleAttributionId]);
  await database.query(`
    insert into private.course_source_attribution_sources(
      course_id,attribution_id,source_ordinal,source_id,source_revision,relation
    ) values($1,$2,0,'source-stale',1,'informed_by')
  `, [COURSE, staleAttributionId]);
}

async function load(database, actor, courseId, revision, analyticsQuery) {
  const result = await database.query(`
    select public.get_owned_course_authoring_analytics_for_actor_v2(
      $1,$2,$3,$4::jsonb
    ) value
  `, [actor, courseId, revision, JSON.stringify(analyticsQuery)]);
  return result.rows[0].value;
}

test("snapshot v2 deriva desenho e autoria sem facts, cursor ou maquinaria técnica", async () => {
  const { database } = await databaseWithAnalyticsRpc();
  await seed(database);
  const raw = await load(database, OWNER, COURSE, 7, query());
  const snapshot = normalizeCourseAuthoringAnalyticsPage(raw, {
    expectedCourseId: COURSE,
    expectedQuery: query()
  });
  assert.equal(snapshot.contract, COURSE_AUTHORING_ANALYTICS_CONTRACT);
  assert.equal(snapshot.design.studyUnitCount, 4);
  assert.equal(snapshot.design.parameters.length, 4);
  assert.deepEqual(snapshot.design.introductionsByStudyUnit.map((unit) => (
    unit.introducedCount
  )), [1, 1, 2, 0]);
  assert.deepEqual(snapshot.design.explanationForms.map(({ form }) => form), [
    "contrast", "mechanism", "plain_definition", "worked_example"
  ]);
  assert.equal(snapshot.design.practiceByRequirement[0].opportunityCount, 2);
  assert.deepEqual(snapshot.design.practiceVariationDimensions, [{
    dimension: "case_or_data", opportunityCount: 2
  }, {
    dimension: "context", opportunityCount: 1
  }]);
  assert.deepEqual(snapshot.design.components.map(({ componentRef, instanceCount }) => ({
    componentRef, instanceCount
  })), [{
    componentRef: "aralearn.resource.code@1.0.0", instanceCount: 1
  }, {
    componentRef: "aralearn.resource.paragraph@1.0.0", instanceCount: 2
  }, {
    componentRef: "aralearn.resource.table@1.0.0", instanceCount: 1
  }, {
    componentRef: "aralearn.response.choice@1.0.0", instanceCount: 2
  }]);
  assert.deepEqual(snapshot.design.sourcesByRole, [{
    role: "supported_by", sourceCount: 1, anchorCount: 1, studyUnitCount: 1
  }]);
  assert.deepEqual(snapshot.authorship.observations, {
    createdCount: 4, openCount: 3, resolvedCount: 1
  });
  assert.equal(snapshot.authorship.explicitParameterChangeCount, 4);
  assert.equal(snapshot.authorship.manualEditCount, 1);
  assert.deepEqual(snapshot.authorship.repairs, { acceptedCount: 1, rejectedCount: 1 });
  assert.deepEqual(snapshot.authorship.studyUnitChangesByOrigin, [{
    origin: "gpt", createdCount: 4, revisedCount: 4
  }, {
    origin: "manual", createdCount: 0, revisedCount: 1
  }, {
    origin: "provider_assistance", createdCount: 0, revisedCount: 1
  }]);
  assert.ok(snapshot.missingData.some((message) => /não possuem aplicação pedagógica/iu.test(message)));
  assert.equal(snapshot.missingData.some((message) => /sem origem/iu.test(message)), false);
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /facts|dataset|cursor|run|step|duration|hash|payload/iu);
  await database.close();
});

test("teto 1 e 2 preservam o inventário e mudam somente a distribuição", async () => {
  const { database } = await databaseWithAnalyticsRpc();
  await seed(database);
  const ceilingOne = normalizeCourseAuthoringAnalyticsPage(
    await load(database, OWNER, COURSE, 7, query("didactic_microsequence", "micro-a")),
    { expectedCourseId: COURSE, expectedQuery: query("didactic_microsequence", "micro-a") }
  );
  const ceilingTwo = normalizeCourseAuthoringAnalyticsPage(
    await load(database, OWNER, COURSE, 7, query("didactic_microsequence", "micro-b")),
    { expectedCourseId: COURSE, expectedQuery: query("didactic_microsequence", "micro-b") }
  );
  assert.deepEqual(
    ceilingOne.design.analysisUnits.map(({ statement }) => statement),
    ceilingTwo.design.analysisUnits.map(({ statement }) => statement)
  );
  assert.deepEqual(ceilingOne.design.introductionsByStudyUnit.map(({ introducedCount }) => (
    introducedCount
  )), [1, 1]);
  assert.deepEqual(ceilingTwo.design.introductionsByStudyUnit.map(({ introducedCount }) => (
    introducedCount
  )), [2, 0]);
  const ceilingParameter = (snapshot) => snapshot.design.parameters.find(({ parameterId }) => (
    parameterId === "new_analysis_unit_ceiling_per_expository_study_unit"
  ));
  assert.deepEqual(ceilingParameter(ceilingOne).effectiveValues, [{
    value: 1, origin: "research_condition", studyUnitCount: 2
  }]);
  assert.deepEqual(ceilingParameter(ceilingTwo).effectiveValues, [{
    value: 2, origin: "research_condition", studyUnitCount: 1
  }]);
  assert.equal(ceilingOne.authorship.manualEditCount, null);
  assert.equal(ceilingOne.authorship.explicitParameterChangeCount, 3);
  assert.deepEqual(ceilingOne.authorship.observations, {
    createdCount: 3, openCount: 2, resolvedCount: 1
  });
  assert.ok(ceilingOne.missingData.some((message) => /Edições manuais ou assistidas/iu.test(message)));
  assert.ok(ceilingOne.missingData.some((message) => /Mudanças GPT de composição/iu.test(message)));
  await database.close();
});

test("escopos, ausências e autorização permanecem factuais", async () => {
  const { database } = await databaseWithAnalyticsRpc();
  await seed(database);
  const unitQuery = query("study_unit", "unit-a1");
  const unit = normalizeCourseAuthoringAnalyticsPage(
    await load(database, OWNER, COURSE, 7, unitQuery),
    { expectedCourseId: COURSE, expectedQuery: unitQuery }
  );
  assert.equal(unit.design.studyUnitCount, 1);
  assert.equal(unit.scope.selected.label, "Endereço e porta");
  assert.equal(unit.scope.options.length, 8);
  assert.deepEqual(unit.authorship.observations, {
    createdCount: 1, openCount: 1, resolvedCount: 0
  });

  const empty = normalizeCourseAuthoringAnalyticsPage(
    await load(database, OWNER, EMPTY_COURSE, 1, query()),
    { expectedCourseId: EMPTY_COURSE, expectedQuery: query() }
  );
  assert.equal(empty.design.studyUnitCount, 0);
  assert.equal(empty.design.parameters.length, 4);
  assert.equal(empty.design.parameters.every(({ effectiveValues }) => (
    effectiveValues.length === 0
  )), true);
  assert.deepEqual(empty.authorship.observations, {
    createdCount: 0, openCount: 0, resolvedCount: 0
  });

  await assert.rejects(
    load(database, THIRD, COURSE, 7, query()),
    (error) => error.code === "42501"
  );
  await assert.rejects(
    load(database, OWNER, COURSE, 6, query()),
    (error) => error.code === "40001"
  );
  await assert.rejects(
    load(database, OWNER, COURSE, 7, { datasets: ["activity"] }),
    (error) => error.code === "22023"
  );
  await database.close();
});

test("migration corta RPC/index v1, restringe execução e avança feature v2", async () => {
  const migration = await fs.readFile(migrationUrl, "utf8");
  assert.match(migration, /drop function public\.get_owned_course_authoring_analytics_for_actor_v1/u);
  assert.match(migration, /drop index if exists private\.course_events_analytics_v1_idx/u);
  assert.match(migration, /revoke all on function public\.get_owned_course_authoring_analytics_for_actor_v2\([\s\S]*from public,anon,authenticated,service_role;/u);
  assert.match(migration, /grant execute on function public\.get_owned_course_authoring_analytics_for_actor_v2\([\s\S]*to service_role;/u);
  assert.match(migration, /'schemaRevision','20260902040050'/u);
  assert.match(migration, /'course-authoring-analytics-v2'/u);
  assert.doesNotMatch(migration, /'course-authoring-analytics-v1',100/u);
});

test("upgrade PGlite aplica o corte inteiro e publica somente RPC/feature v2", async () => {
  const { database } = await databaseWithAnalyticsRpc({ fullMigration: true });
  const result = await database.query(`
    select
      to_regprocedure(
        'public.get_owned_course_authoring_analytics_for_actor_v1(uuid,uuid,bigint,jsonb)'
      ) is null as old_rpc_removed,
      to_regprocedure(
        'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)'
      ) is not null as new_rpc_present,
      to_regclass('private.course_events_analytics_v1_idx') is null as old_index_removed,
      public.get_aralearn_runtime_manifest() as manifest,
      has_function_privilege(
        'service_role',
        'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)',
        'execute'
      ) as service_can_execute,
      has_function_privilege(
        'authenticated',
        'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)',
        'execute'
      ) as client_cannot_execute
  `);
  const value = result.rows[0];
  assert.equal(value.old_rpc_removed, true);
  assert.equal(value.new_rpc_present, true);
  assert.equal(value.old_index_removed, true);
  assert.equal(value.manifest.schemaRevision, "20260902040050");
  assert.deepEqual(value.manifest.features, ["course-authoring-analytics-v2"]);
  assert.equal(value.service_can_execute, true);
  assert.equal(value.client_cannot_execute, false);
  await database.close();
});
