import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { normalizeCourseAuditCyclePage } from "../../src/domain/courseAuditCycle.js";

const migrationUrl = new URL(
  "../../supabase/migrations/20260817210000_course_audit_corrections.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const ACTOR = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const RUN = "11111111-1111-5111-8111-111111111111";
const FINDING = "22222222-2222-5222-8222-222222222222";
const ANNOTATION = "77777777-7777-5777-8777-777777777777";
const CORRECTION = "44444444-4444-5444-8444-444444444444";

async function databaseWithAuditAuthorities() {
  const migration = await fs.readFile(migrationUrl, "utf8");
  const start = migration.indexOf("create table private.course_instructional_audit_runs(");
  const end = migration.indexOf(
    "alter table private.course_instructional_audit_runs enable row level security;",
    start
  );
  assert.ok(start >= 0 && end > start, "bloco literal das autoridades deve existir");

  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create schema private;
    create table auth.users(id uuid primary key);
    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade
    );
    create table private.course_anchored_annotations(
      course_id uuid not null references public.courses(id) on delete cascade,
      id uuid not null,
      primary key(course_id,id)
    );
    create function private.valid_course_audit_text_v1(
      text,integer,integer,boolean,boolean
    ) returns boolean language sql immutable as $$select true$$;
    create function private.valid_course_annotation_path_v1(jsonb)
      returns boolean language sql immutable as $$select true$$;
    create function private.valid_course_audit_checks_v1(jsonb)
      returns boolean language sql immutable as $$select true$$;
    create function private.valid_course_audit_study_unit_content_v1(jsonb)
      returns boolean language sql immutable as $$select true$$;
    create function private.valid_course_source_links_shape_v1(jsonb,boolean)
      returns boolean language sql immutable as $$select true$$;
    create function private.valid_course_audit_timestamp_v1(text)
      returns boolean language sql immutable as $$select true$$;
  `);
  await database.exec(migration.slice(start, end));
  const projectionStart = migration.indexOf(
    "create function private.course_audit_run_projection_v1("
  );
  const projectionEnd = migration.indexOf(
    "create function private.course_audit_finding_projection_v1(", projectionStart
  );
  assert.ok(projectionStart >= 0 && projectionEnd > projectionStart);
  await database.exec(migration.slice(projectionStart, projectionEnd));
  return database;
}

function path() {
  return JSON.stringify([
    { kind: "course", id: COURSE, label: "Curso", version: 1 },
    { kind: "module", id: "module-a", label: "Módulo", version: 1 },
    { kind: "lesson", id: "lesson-a", label: "Lição", version: 1 },
    { kind: "didactic_microsequence", id: "micro-a", label: "Micro", version: 1 },
    { kind: "study_unit", id: "unit-a", label: "Unidade", version: 1 }
  ]);
}

function auditCheck(index, evidence = "Evidência pública.") {
  const dimensions = [
    "structural_conformance", "pedagogical_quality", "factual_quality", "editorial_quality"
  ];
  return {
    checkId: `33333333-3333-5333-8333-${String(index + 1).padStart(12, "0")}`,
    dimension: dimensions[index % dimensions.length],
    criterion: { code: `criterion_${index + 1}`, version: "1", statement: `Critério ${index + 1}.` },
    result: "not_checked",
    publicEvidence: evidence,
    adequacy: "not_assessed",
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks: []
  };
}

async function seedAuthorities(database) {
  const snapshot = JSON.stringify({ content: {}, sourceLinks: [], hash: "b".repeat(64) });
  await database.query("insert into auth.users(id) values($1),($2)", [OWNER, ACTOR]);
  await database.query("insert into public.courses(id,owner_id) values($1,$2)", [COURSE, OWNER]);
  await database.query(`
    insert into private.course_instructional_audit_runs(
      course_id,id,run_kind,origin,method,course_revision,context_hash,
      target_study_unit_id,target_version,target_hash,target_path,checks,
      findings_created,actor_id
    ) values($1,$2,'audit','human_audit',$3,1,$4,'unit-a',1,$5,$6,$7,1,$8)
  `, [
    COURSE, RUN, JSON.stringify({ id: "manual-review", version: "1" }),
    "a".repeat(64), "b".repeat(64), path(),
    JSON.stringify(Array.from({ length: 4 }, (_, index) => auditCheck(index))), ACTOR
  ]);
  await database.query(`
    insert into private.course_audit_findings(
      course_id,finding_id,finding_version,origin_audit_run_id,check_id,
      status,decision,code,severity,created_by,base_created_at,created_at
    ) values($1,$2,1,$3,$4,'open','recorded','missing_source_anchor','high',$5,now(),now())
  `, [COURSE, FINDING, RUN, "33333333-3333-5333-8333-000000000003", ACTOR]);
  await database.query(
    "insert into private.course_anchored_annotations(course_id,id) values($1,$2)",
    [COURSE, ANNOTATION]
  );
  await database.query(`
    insert into private.course_audit_finding_annotations(
      course_id,finding_id,finding_version,annotation_id,annotation_version
    ) values($1,$2,1,$3,1)
  `, [COURSE, FINDING, ANNOTATION]);
  await database.query(`
    insert into private.course_authoring_corrections(
      course_id,correction_id,correction_version,finding_id,finding_version,
      status,target_study_unit_id,base_target_version,base_target_hash,
      before_snapshot,after_snapshot,rationale,actor_id,base_created_at,created_at
    ) values($1,$2,1,$3,1,'proposed','unit-a',1,$4,$5,$5,'Correção focal',$6,now(),now())
  `, [COURSE, CORRECTION, FINDING, "b".repeat(64), snapshot, ACTOR]);
}

async function count(database, relation) {
  const result = await database.query(`select count(*)::integer value from ${relation}`);
  return result.rows[0].value;
}

test("autoridades são imutáveis, mas preservam SET NULL e cascades de privacidade", async () => {
  const database = await databaseWithAuditAuthorities();
  await seedAuthorities(database);

  for (const statement of [
    "update private.course_instructional_audit_runs set findings_created=0",
    "delete from private.course_audit_findings",
    "update private.course_authoring_corrections set rationale='alterada'",
    "delete from private.course_audit_finding_annotations"
  ]) {
    await assert.rejects(database.exec(statement), (error) => error.code === "55000");
  }

  await database.query("delete from auth.users where id=$1", [ACTOR]);
  const actors = await database.query(`
    select
      (select actor_id from private.course_instructional_audit_runs limit 1) run_actor,
      (select created_by from private.course_audit_findings limit 1) finding_actor,
      (select actor_id from private.course_authoring_corrections limit 1) correction_actor
  `);
  assert.deepEqual(actors.rows[0], {
    run_actor: null, finding_actor: null, correction_actor: null
  });

  await database.query(
    "delete from private.course_anchored_annotations where course_id=$1 and id=$2",
    [COURSE, ANNOTATION]
  );
  assert.equal(await count(database, "private.course_audit_finding_annotations"), 0);
  assert.equal(await count(database, "private.course_instructional_audit_runs"), 1);
  assert.equal(await count(database, "private.course_audit_findings"), 1);
  assert.equal(await count(database, "private.course_authoring_corrections"), 1);

  const catalog = await database.query(`
    select constraint_value.confdeltype,trigger_value.tgname,
      trigger_value.tgfoid='private.guard_course_audit_annotation_link_v1()'::regprocedure guard_exact
    from pg_constraint constraint_value
    join pg_trigger trigger_value
      on trigger_value.tgrelid=constraint_value.conrelid and not trigger_value.tgisinternal
    where constraint_value.conname='audit_finding_annotations_annotation_fk_v1'
      and trigger_value.tgname='course_audit_finding_annotations_immutable_v1'
  `);
  assert.deepEqual(catalog.rows[0], {
    confdeltype: "c",
    tgname: "course_audit_finding_annotations_immutable_v1",
    guard_exact: true
  });

  await database.query("delete from public.courses where id=$1", [COURSE]);
  assert.equal(await count(database, "private.course_instructional_audit_runs"), 0);
  assert.equal(await count(database, "private.course_audit_findings"), 0);
  assert.equal(await count(database, "private.course_authoring_corrections"), 0);
  await database.close();
});

test("runDetail no teto do comando continua inteiro, legível e cercado pós-write", async () => {
  const database = await databaseWithAuditAuthorities();
  const checks = Array.from({ length: 32 }, (_, index) => auditCheck(index, "😀".repeat(1300)));
  assert.ok(Buffer.byteLength(JSON.stringify({ checks }), "utf8") < 196608);
  await database.query("insert into auth.users(id) values($1)", [OWNER]);
  await database.query("insert into public.courses(id,owner_id) values($1,$2)", [COURSE, OWNER]);
  await database.query(`
    insert into private.course_instructional_audit_runs(
      course_id,id,run_kind,origin,method,course_revision,context_hash,
      target_study_unit_id,target_version,target_hash,target_path,checks,
      findings_created,actor_id
    ) values($1,$2,'audit','human_audit',$3,1,$4,'unit-a',1,$5,$6,$7,0,$8)
  `, [
    COURSE, RUN, JSON.stringify({ id: "manual-review", version: "1" }),
    "a".repeat(64), "b".repeat(64), path(), JSON.stringify(checks), OWNER
  ]);
  const projected = await database.query(
    "select private.course_audit_run_projection_v1($1,$2) value", [COURSE, RUN]
  );
  const runDetail = projected.rows[0].value;
  const page = normalizeCourseAuditCyclePage({
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId: COURSE,
    courseRevision: 1,
    auditSetVersion: 1,
    query: {
      mode: "detail", targetStudyUnitId: null, findingId: null,
      correctionId: null, auditRunId: RUN, states: [], dimensions: [],
      severities: [], annotationIds: []
    },
    summary: {
      matchingTotal: 0,
      byState: { open: 0, awaiting_verification: 0, resolved: 0, dismissed: 0 },
      byDimension: {
        structural_conformance: 0, pedagogical_quality: 0,
        factual_quality: 0, editorial_quality: 0
      },
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }
    },
    context: null,
    items: [],
    runs: [],
    detail: null,
    runDetail,
    hasMore: false,
    nextCursor: null
  });
  assert.equal(page.runDetail.checks.length, 32);
  assert.ok(Buffer.byteLength(JSON.stringify(page), "utf8") < 245760);

  const migration = await fs.readFile(migrationUrl, "utf8");
  assert.match(migration, /if v_change->'auditRunId'<>'null'::jsonb then[\s\S]*?'mode','detail'[\s\S]*?'auditRunId',v_change->'auditRunId'/u);
  await database.close();
});

test("validador SQL recusa StudyUnit parcial, default implícito e alias de pacote", async () => {
  const migration = await fs.readFile(migrationUrl, "utf8");
  const start = migration.indexOf(
    "create function private.valid_course_audit_resource_instance_v1("
  );
  const end = migration.indexOf(
    "create table private.course_instructional_audit_runs(", start
  );
  assert.ok(start >= 0 && end > start);
  const database = new PGlite();
  await database.exec("create schema private;");
  await database.exec(migration.slice(start, end));

  const canonical = {
    title: "Unidade",
    role: "theory",
    content: [{
      id: "content-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo." }
    }],
    response: null,
    feedback: [],
    topics: ["topic-a"]
  };
  const candidates = [
    canonical,
    { title: "Parcial" },
    { ...canonical, content: [{ id: "content-a", package: "aralearn.resource.paragraph", data: {} }] },
    { ...canonical, content: [{ id: "content-a", package: "paragraph", version: "1.0.0", data: {} }] },
    { ...canonical, alias: true }
  ];
  const result = await database.query(`
    select private.valid_course_audit_study_unit_content_v1(value) valid
    from jsonb_array_elements($1::jsonb) value
  `, [JSON.stringify(candidates)]);
  assert.deepEqual(result.rows.map(({ valid }) => valid), [true, false, false, false, false]);
  await database.close();
});
