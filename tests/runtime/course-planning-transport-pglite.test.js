import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { expandPlanningTransport, expandReviewPlanningTransport, PLANNING_TRANSPORT_ENCODING,
  REVIEW_PLANNING_TRANSPORT_ENCODING } from "../../supabase/functions/_shared/aralearn-authoring/coursePlanningTransport.js";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { defaultAuthoringProcessPreferences } from "../../src/domain/authoringProcessPreferences.js";

const read = async (name) => (await fs.readFile(
  new URL("../../supabase/migrations/" + name, import.meta.url), "utf8")).replaceAll(String.fromCharCode(13) + String.fromCharCode(10), String.fromCharCode(10));

// Recorta a definição real de uma função de uma migração, como fazem os testes irmãos.
function definition(source, name) {
  const start = source.search(new RegExp("create (?:or replace )?function " + name.replaceAll(".", ".") + "\\(", "iu"));
  assert.ok(start >= 0, name);
  const delimiter = /as\s+(\$\w*\$)/iu.exec(source.slice(start));
  assert.ok(delimiter, name);
  const body = start + delimiter.index + delimiter[0].length;
  return source.slice(start, source.indexOf(delimiter[1] + ";", body) + delimiter[1].length + 1);
}

const originalFlow = await read("20260903160000_global_curriculum_authoring_flow.sql");
const mapReference = await read("20260909025135_contextual_curricular_map_reference.sql");
const delta = await read("20261016162436_planning_transport_deduplication.sql");
const reviewPlanDelta = await read("20261017140000_review_plan_focal_read.sql");
const leanReviewDelta = await read("20261017181734_review_plan_lean_projection.sql");
const conditionalReviewPlanDelta = await read("20261019174421_conditional_review_plan_snapshot.sql");

// Cadeia legada real: definição original de 20260903160000 mais as duas cirurgias
// posteriores (shared explanations 20260907222912 e correction queue 20260909032748).
const LEGACY_PATCH = [
  "do $legacy_patch$",
  "declare d text;",
  "begin",
  "  select replace(pg_get_functiondef('private.get_course_instructional_plan_for_actor_v3(uuid,uuid)'::regprocedure), chr(13)||chr(10), chr(10)) into d;",
  "  d := replace(d, $t1$'objective',coalesce(microsequence.content->>'goal',''),$t1$,",
  "    $r1$'objective',coalesce(microsequence.content->>'goal',''),'explanationPlan',microsequence.content->'explanationPlan',$r1$);",
  "  d := replace(d, $t2$'goal',coalesce(microsequence.content->>'goal',''),$t2$,",
  "    $r2$'goal',coalesce(microsequence.content->>'goal',''),'explanationPlan',microsequence.content->'explanationPlan','explanation',microsequence.content->'explanation','contentReview',private.course_microsequence_review_v1(p_course_id,microsequence.entity_id),$r2$);",
  "  d := replace(d, $t3$'objective',coalesce(microsequence.content->>'goal',''),'explanationPlan',microsequence.content->'explanationPlan',$t3$,",
  "    $r3$'objective',coalesce(microsequence.content->>'goal',''),'explanationPlan',microsequence.content->'explanationPlan','explanation',microsequence.content->'explanation','contentReview',private.course_content_review_v1(p_course_id,'microsequence_explanation',microsequence.entity_id),$r3$);",
  "  d := replace(d, $t4$'contentReview',private.course_microsequence_review_v1(p_course_id,microsequence.entity_id),$t4$,",
  "    $r4$'contentReview',private.course_content_review_v1(p_course_id,'microsequence_explanation',microsequence.entity_id),$r4$);",
  "  execute d;",
  "end $legacy_patch$"
].join(String.fromCharCode(10));

const ACTOR = "10000000-0000-4000-8000-000000000001";
const COURSE = ACTOR;
const PLAN = "20000000-0000-4000-8000-000000000001";
const GUARD_BYTES = 1835008;
const GUARD_MESSAGE = /excede o limite de leitura/u;

const microsequenceId = (index) => "ms-" + String(index + 1).padStart(3, "0");

// Variedade real de conteúdo: completa, mínima (campos ausentes viram null) e parcial.
const microsequenceContent = (index, textBytes, contentStyle) => {
  if (contentStyle !== "full" && index % 3 === 1) return JSON.stringify({ dependsOn: [] });
  const explanation = { title: "Explicacao " + (index + 1),
    content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "t".repeat(textBytes) } }] };
  if (contentStyle !== "full" && index % 3 === 2) return JSON.stringify({ title: "Microssequencia " + (index + 1), explanation });
  return JSON.stringify({ title: "Microssequencia " + (index + 1), goal: "Explicar o caso " + (index + 1),
    role: "explain", dependsOn: [], explanationPlan: { purpose: "Plano da base " + (index + 1),
      prerequisites: [], relations: [], sourceIds: ["source-1"] }, explanation });
};

const microsequenceEntity = (index, textBytes, contentStyle) => "('" + COURSE + "','microsequence','" + microsequenceId(index) +
  "','lesson','lesson-1'," + index + ",'" + microsequenceContent(index, textBytes, contentStyle).replaceAll("'", "''") + "'::jsonb,'{}'::jsonb)";

async function fixture(options) {
  const settings = options || {};
  const microsequences = settings.microsequences || 0;
  const textBytes = settings.textBytes || 200;
  const contentStyle = settings.contentStyle || "mixed";
  const partAssignments = settings.partAssignments || [];
  const moduleContent = JSON.stringify({ title: "Modulo 1" });
  const lessonContent = JSON.stringify({ title: "Licao 1" });
  const db = new PGlite();
  const statements = [
    "set check_function_bodies=off",
    "create schema private; create schema extensions",
    "create role anon; create role authenticated; create role service_role",
    "create table public.courses(id uuid primary key, owner_id uuid, revision bigint default 1, title text, goal text, updated_at timestamptz default now())",
    "insert into public.courses(id,owner_id,revision,title,goal) values ('" + COURSE + "','" + ACTOR + "',7,'Curso sintetico','Objetivo')",
    "create table private.course_instructional_plans(id uuid primary key, course_id uuid, version bigint default 1, audience text, instructional_scope jsonb, curriculum_map_status text, preferred_authoring_part_min integer, preferred_authoring_part_max integer, part_count_origin text, updated_at timestamptz default now())",
    "insert into private.course_instructional_plans(id,course_id,version,audience,instructional_scope,curriculum_map_status,preferred_authoring_part_min,preferred_authoring_part_max,part_count_origin) values ('" + PLAN + "','" + COURSE + "',1,'Turma','{}'::jsonb,'approved',1,2,'automatic')",
    "create table private.course_instructional_plan_items(id uuid primary key, course_id uuid, instructional_plan_id uuid, item_kind text, position integer, statement text, description text, version bigint default 1, updated_at timestamptz default now())",
    "create table private.course_entities(course_id uuid, entity_type text, entity_id text, parent_type text, parent_id text, position integer, content jsonb, design_application jsonb default '{}'::jsonb, primary key(course_id,entity_type,entity_id))",
    "create table private.course_design_target_plan_items(course_id uuid, didactic_microsequence_id text, plan_item_id uuid, plan_item_kind text)",
    "create table private.course_authoring_parts(id uuid primary key, course_id uuid, instructional_plan_id uuid, version bigint default 1, position integer, title text, intent text, progression jsonb, updated_at timestamptz default now())",
    "create table private.course_authoring_part_didactic_microsequences(course_id uuid, authoring_part_id uuid, didactic_microsequence_id text, production_position integer)",
    "create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable as $m$ select jsonb_build_object('schemaRevision','test','features','[]'::jsonb) $m$",
    "create function private.require_service_role() returns void language plpgsql as $f$ begin if current_setting('test.denied',true)='service' then raise exception 'Operacao restrita ao servico de autoria.' using errcode='42501'; end if; end $f$",
    "create function private.require_course_access_v1(p_course_id uuid,p_actor_id uuid,p_require_owner boolean) returns text language plpgsql as $f$ begin if p_actor_id is null then raise exception 'Autenticacao obrigatoria.' using errcode='42501'; end if; if p_require_owner and not exists(select 1 from public.courses where id=p_course_id and owner_id=p_actor_id) then raise exception 'Edicao do Curso nao autorizada.' using errcode='42501'; end if; return 'owned'; end $f$",
    "create function private.course_content_review_v1(p_course_id uuid,p_kind text,p_entity_id text) returns jsonb language sql stable as $f$ select jsonb_build_object('state','current','kind',p_kind,'microsequenceId',p_entity_id) $f$",
    "create function private.course_authoring_part_progress_v1(p_course_id uuid,p_part_id uuid) returns jsonb language sql stable as $f$ select jsonb_build_object('state','planned','partId',p_part_id::text) $f$",
    "create function private.current_course_curricular_map_v1(p_course_id uuid) returns jsonb language sql stable as $f$ select jsonb_build_object('audience','Turma','prerequisites','[]'::jsonb,'scopeItems','[]'::jsonb,'modules','[]'::jsonb) $f$",
    "create function extensions.digest(p_data bytea,p_algo text) returns bytea language sql immutable as $f$ select decode(md5(encode(p_data,'hex'))||md5(encode(p_data,'hex')),'hex') $f$"
  ];
  for (const statement of statements) await db.exec(statement);
  await db.exec(definition(originalFlow, "private.get_course_instructional_plan_for_actor_v3"));
  await db.exec(LEGACY_PATCH);
  await db.exec(definition(originalFlow, "public.get_owned_course_instructional_plan_for_actor_v3"));
  await db.exec(definition(mapReference, "public.get_owned_course_instructional_plan_for_actor_v4"));
  if (microsequences > 0) {
    await db.exec("insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,design_application) values " +
      "('" + COURSE + "','module','module-1',null,null,0,'" + moduleContent + "'::jsonb,'{}'::jsonb)," +
      "('" + COURSE + "','lesson','lesson-1','module','module-1',0,'" + lessonContent + "'::jsonb,'{}'::jsonb)," +
      Array.from({ length: microsequences }, (unused, index) => microsequenceEntity(index, textBytes, contentStyle)).join(","));
  }
  const partIds = partAssignments.map((unused, index) =>
    "90000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"));
  for (let index = 0; index < partAssignments.length; index += 1) {
    await db.exec("insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,progression) values ('" +
      partIds[index] + "','" + COURSE + "','" + PLAN + "'," + index + ",'Parte " + (index + 1) + "','','[]'::jsonb)");
  }
  const membership = [];
  partAssignments.forEach((indices, partIndex) => {
    indices.forEach((microsequenceIndex, productionPosition) => {
      membership.push("('" + COURSE + "','" + partIds[partIndex] + "','" + microsequenceId(microsequenceIndex) + "'," + productionPosition + ")");
    });
  });
  if (membership.length > 0) {
    await db.exec("insert into private.course_authoring_part_didactic_microsequences(course_id,authoring_part_id,didactic_microsequence_id,production_position) values " + membership.join(","));
  }
  if (settings.rich) {
    const prerequisite = "30000000-0000-4000-8000-000000000001";
    const outcome = "30000000-0000-4000-8000-000000000002";
    const analysis = "30000000-0000-4000-8000-000000000003";
    const evidence = "30000000-0000-4000-8000-000000000004";
    const scope = "30000000-0000-4000-8000-000000000005";
    await db.exec(
      "insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description) values " +
      "('" + prerequisite + "','" + COURSE + "','" + PLAN + "','declared_prerequisite',0,'Pré-requisito rico','')," +
      "('" + outcome + "','" + COURSE + "','" + PLAN + "','intended_learning_outcome',0,'Resultado rico','')," +
      "('" + analysis + "','" + COURSE + "','" + PLAN + "','instructional_analysis_unit',0,'Relação rica','Descrição rica')," +
      "('" + evidence + "','" + COURSE + "','" + PLAN + "','evidence_requirement',0,'Evidência rica','')," +
      "('" + scope + "','" + COURSE + "','" + PLAN + "','curriculum_scope_item',0,'Escopo rico','');" +
      "insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind) values " +
      "('" + COURSE + "','ms-001','" + scope + "','curriculum_scope_item')," +
      "('" + COURSE + "','ms-002','" + scope + "','curriculum_scope_item');" +
      "update private.course_entities set content=content||'{\"dependsOn\":[\"ms-002\"]}'::jsonb " +
      "where course_id='" + COURSE + "' and entity_type='microsequence' and entity_id='ms-001'"
    );
  }
  return db;
}

const v4Text = async (db) => (await db.query(
  "select public.get_owned_course_instructional_plan_for_actor_v4($1,$2)::text as value", [ACTOR, COURSE])).rows[0].value;
const v5Payload = async (db) => (await db.query(
  "select public.get_owned_course_instructional_plan_for_actor_v5($1,$2) as value", [ACTOR, COURSE])).rows[0].value;
const reviewPayload = async (db) => (await db.query(
  "select public.get_owned_course_review_plan_for_actor_v1($1,$2) as value", [ACTOR, COURSE])).rows[0].value;
const conditionalReviewPayload = async (db, fingerprint = null, actor = ACTOR) => (await db.query(
  "select public.get_owned_course_review_plan_for_actor_v2($1,$2,$3) as value",
  [actor, COURSE, fingerprint])).rows[0].value;
const queryValue = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].value;
const withoutContentReview = value => {
  const result = structuredClone(value);
  for (const moduleValue of result.plan.curriculum.modules) {
    for (const lesson of moduleValue.lessons) {
      for (const item of lesson.microsequences) delete item.contentReview;
    }
  }
  for (const part of result.plan.parts) {
    for (const item of part.microsequences) delete item.contentReview;
  }
  return result;
};
const leanReviewProjection = value => ({
  contract: "aralearn.course-review-plan.v1",
  courseId: value.courseId,
  courseRevision: value.courseRevision,
  plan: {
    id: value.plan.id,
    version: value.plan.version,
    title: value.plan.title,
    objective: value.plan.objective,
    audience: value.plan.audience,
    curriculumMapStatus: value.plan.curriculumMapStatus,
    declaredPrerequisites: structuredClone(value.plan.declaredPrerequisites),
    curriculum: { modules: value.plan.curriculum.modules.map(moduleValue => ({
      id: moduleValue.id, position: moduleValue.position,
      title: moduleValue.title, objective: moduleValue.objective,
      lessons: moduleValue.lessons.map(lesson => ({
        id: lesson.id, position: lesson.position,
        title: lesson.title, objective: lesson.objective,
        microsequences: lesson.microsequences.map(microsequence => ({
          id: microsequence.id, position: microsequence.position,
          title: microsequence.title, objective: microsequence.objective,
          explanationPlan: structuredClone(microsequence.explanationPlan),
          explanation: structuredClone(microsequence.explanation),
          dependencyMicrosequenceIds: structuredClone(microsequence.dependencyMicrosequenceIds)
        }))
      }))
    })) },
    curriculumScopeItems: value.plan.curriculumScopeItems.map(scopeItem => ({
      id: scopeItem.id, position: scopeItem.position, statement: scopeItem.statement,
      curriculumTargets: structuredClone(scopeItem.curriculumTargets)
    })),
    parts: value.plan.parts.map(part => ({
      id: part.id, position: part.position, title: part.title,
      intent: part.intent, progression: structuredClone(part.progression), version: part.version,
      microsequences: part.microsequences.map(entry => ({
        id: entry.id,
        productionPosition: entry.productionPosition,
        curriculumPath: structuredClone(entry.curriculumPath),
        title: entry.title,
        goal: entry.goal,
        explanationPlan: structuredClone(entry.explanationPlan),
        explanation: structuredClone(entry.explanation)
      }))
    })),
    updatedAt: value.plan.updatedAt
  }
});

function finalContextAdapter(reviewPlan) {
  const units = ["ms-001", "ms-002", "ms-003"].map((microsequenceId, index) => ({
    ordinal: index + 1,
    version: 1,
    curriculumPath: { didacticMicrosequence: { id: microsequenceId,
      title: "Microssequencia " + microsequenceId.slice(-1) } },
    studyUnit: { id: "unit-" + (index + 1), version: 1,
      title: "Unidade " + (index + 1), kind: "theory",
      content: [{ id: "paragraph-" + (index + 1), package: "aralearn.resource.paragraph",
        version: "1.0.0", data: { text: "Conteudo focal rico " + (index + 1) + "." } }],
      response: null, feedback: [] },
    authorship: {}
  }));
  return {
    publicAppUrl: "https://app.example/",
    annotationSetVersion: 1,
    async listCourses() {
      return { items: [{ courseId: COURSE, title: "Curso sintetico" }], hasMore: false, nextCursor: null };
    },
    async getCourse() { return { courseId: COURSE, title: "Curso sintetico", revision: 7 }; },
    async getCourseReviewPlan() { return structuredClone(reviewPlan); },
    async getAuthoringProcessPreferences() {
      return { contract: "aralearn.authoring-process-preferences.v1", revision: 0,
        updatedAt: null, preferences: defaultAuthoringProcessPreferences() };
    },
    async getCourseInspectionTriageOutline({ courseId, expectedRevision }) {
      const microsequences = [...new Map(units.map(item => [item.curriculumPath.didacticMicrosequence.id,
        item.curriculumPath.didacticMicrosequence])).values()]
        .map((item, position) => ({ id: item.id, title: item.title, position }));
      return { contract: "aralearn.course-inspection-triage-outline.v1", courseId,
        courseRevision: expectedRevision, plan: { title: "Curso sintetico",
          curriculum: { modules: [{ id: "module-1", title: "Modulo", position: 0, lessons: [
            { id: "lesson-1", title: "Licao", position: 0, microsequences }] }] }, parts: [],
          studyUnits: units.map(item => ({ id: item.studyUnit.id, title: item.studyUnit.title,
            ordinal: item.ordinal, curriculumPath: { moduleId: "module-1", lessonId: "lesson-1",
              didacticMicrosequenceId: item.curriculumPath.didacticMicrosequence.id }, authoringPartId: null })) } };
    },
    async listCourseStudyUnits(input) {
      if (input.anchorStudyUnitId) {
        const item = units.find(unit => unit.studyUnit.id === input.anchorStudyUnitId);
        return { courseRevision: 7, items: item ? [{ ...structuredClone(item),
          curriculumPath: { module: { id: "module-1" }, lesson: { id: "lesson-1" },
            didacticMicrosequence: { id: item.curriculumPath.didacticMicrosequence.id } }, authoringPart: null }] : [],
          hasMore: false, nextCursor: null };
      }
      return { items: structuredClone(units), hasMore: false, nextCursor: null };
    },
    async getCourseContentReview(input) {
      return { contract: "aralearn.course-content-review.v1", courseId: input.courseId,
        courseRevision: 7, targetKind: input.targetKind, targetId: input.targetId,
        entityVersion: 1, basisHash: "a".repeat(64), contentReview: { state: "draft" },
        reviewPolicy: "saved" };
    },
    async getCourseContentInspection(input) {
      return { contract: "aralearn.course-ai-inspection.v1", courseId: input.courseId,
        courseRevision: 7, targetKind: input.targetKind, targetId: input.targetId,
        basisHash: "b".repeat(64), inspection: { state: "unregistered", basisHash: "b".repeat(64) },
        pedagogicalBasis: { targetKind: input.targetKind, targetId: input.targetId, audience: null,
          microsequence: {}, planItems: [], dependencies: [], studyUnits: [], citations: [],
          additionalContext: {} } };
    },
    async getCourseContentInspectionReceipt() { return null; },
    async getCourseSources(input) {
      if (input.mode === "source") return { items: [{ id: input.sourceId,
        title: "Fonte prevista", sourceLinks: [] }], nextCursor: null };
      if (input.mode === "target") return { items: [{ targetKind: input.targetKind,
        targetId: input.targetId, sourceLinks: [] }], nextCursor: null };
      return { items: [], nextCursor: null };
    },
    async getCourseAnchoredAnnotations() {
      return { items: [], annotationSetVersion: 1, courseRevision: 7,
        hasMore: false, nextCursor: null };
    }
  };
}

const prepareReview = async (adapter, args) => executeHumanCourseTask({ adapter,
  principal: { actorId: ACTOR, scopes: ["authoring:read", "authoring:write"] },
  name: "preparar_revisao", rawArguments: { curso: "Curso sintetico", auditoria: true, ...args } });

test("produtor legado real e v5 reconstituem o mesmo texto, e v4 nao muda", async () => {
  const db = await fixture({ microsequences: 6, textBytes: 300, partAssignments: [[0, 2, 1], [3, 4]], rich: true });
  const legacyText = await v4Text(db);
  const legacySerialized = JSON.stringify(JSON.parse(legacyText));
  assert.ok(legacyText.includes("ms-003"), "fixture cobre multiplas partes");
  await db.exec(delta);
  assert.equal(await v4Text(db), legacyText, "v4 continua devolvendo a arvore completa identica");
  const payload = await v5Payload(db);
  assert.equal(payload.payloadEncoding, PLANNING_TRANSPORT_ENCODING);
  const expanded = expandPlanningTransport(payload);
  assert.equal(JSON.stringify(expanded), legacySerialized, "texto da expansao igual ao do produtor legado");
  const compactBytes = Buffer.byteLength(JSON.stringify(payload));
  assert.ok(compactBytes < Buffer.byteLength(legacySerialized), "compacto menor que o legado " + compactBytes);
});

test("curriculo vazio e microssequencia sem lote permanecem identicos", async () => {
  const empty = await fixture({ microsequences: 0, partAssignments: [] });
  const emptyLegacy = JSON.parse(await v4Text(empty));
  await empty.exec(delta);
  assert.equal(JSON.stringify(expandPlanningTransport(await v5Payload(empty))), JSON.stringify(emptyLegacy));
  assert.equal(JSON.stringify(JSON.parse(await v4Text(empty))), JSON.stringify(emptyLegacy));

  const partial = await fixture({ microsequences: 3, textBytes: 120, partAssignments: [[0]] });
  const partialLegacy = JSON.parse(await v4Text(partial));
  await partial.exec(delta);
  assert.equal(JSON.stringify(expandPlanningTransport(await v5Payload(partial))), JSON.stringify(partialLegacy));
});

test("guard mede a representacao pedida e a v5 tambem estoura quando ela excede", async () => {
const db = await fixture({ microsequences: 2, textBytes: 500000, contentStyle: "full", partAssignments: [[0, 1]] });
  await db.exec(delta);
  const compactBytes = Number((await db.query(
    "select octet_length(public.get_owned_course_instructional_plan_for_actor_v5($1,$2)::text) as bytes", [ACTOR, COURSE])).rows[0].bytes);
  assert.ok(compactBytes < GUARD_BYTES, "compacto " + compactBytes);
  await assert.rejects(() => db.query("select private.get_course_instructional_plan_for_actor_v3($1,$2)", [ACTOR, COURSE]), GUARD_MESSAGE);

const wider = await fixture({ microsequences: 4, textBytes: 500000, contentStyle: "full", partAssignments: [[0, 1, 2, 3]] });
  await wider.exec(delta);
  await assert.rejects(() => wider.query("select public.get_owned_course_instructional_plan_for_actor_v5($1,$2)", [ACTOR, COURSE]), GUARD_MESSAGE);
});

test("encadeamento local da v5: gates de servico e de escopo propagam a negacao (stubs)", async () => {
  const db = await fixture({ microsequences: 1, textBytes: 50, partAssignments: [[0]] });
  await db.exec(delta);
  await db.exec("set test.denied='service'");
  await assert.rejects(() => db.query("select public.get_owned_course_instructional_plan_for_actor_v5($1,$2)", [ACTOR, COURSE]), /servico de autoria/u);
  await db.exec("set test.denied=''");
  await assert.rejects(() => db.query("select public.get_owned_course_instructional_plan_for_actor_v5($1,$2)", ["90000000-0000-4000-8000-000000000009", COURSE]), /nao autorizada/u);
  assert.equal((await v5Payload(db)).approvalBasis.courseRevision, 7);
});

test("projecao de revisao conserva somente o recorte consumido e nao chama helpers descartados", async () => {
  const db = await fixture({ microsequences: 6, textBytes: 300, partAssignments: [[0, 2, 1], [3, 4]] });
  try {
    await db.exec(delta);
    const integral = JSON.parse(await v4Text(db));
    await db.exec(reviewPlanDelta);
    await db.exec(leanReviewDelta);

    const fullExpanded = expandPlanningTransport(await v5Payload(db));
    assert.equal(JSON.stringify(fullExpanded), JSON.stringify(integral), "v5 continua igual ao produtor integral");

    const review = await reviewPayload(db);
    assert.equal(review.payloadEncoding, REVIEW_PLANNING_TRANSPORT_ENCODING);
    const reviewExpanded = expandReviewPlanningTransport(review);
    assert.deepEqual(reviewExpanded, leanReviewProjection(fullExpanded),
      "a leitura de revisão conserva exatamente os campos consumidores e seus valores");
    assert.equal(Object.hasOwn(reviewExpanded.plan, "instructionalAnalysisUnits"), false);
    assert.equal(Object.hasOwn(reviewExpanded.plan, "evidenceRequirements"), false);
    assert.equal(Object.hasOwn(reviewExpanded.plan, "counts"), false);
    assert.equal(Object.hasOwn(reviewExpanded, "approvalBasis"), false);

    await db.exec(`drop function private.course_content_review_v1(uuid,text,text);
      create function private.course_content_review_v1(p_course_id uuid,p_target_kind text,p_target_id text) returns jsonb
      language plpgsql as $f$ begin raise exception 'course_content_review_v1 nao deve ocorrer'; end $f$;
      drop function private.course_authoring_part_progress_v1(uuid,uuid);
      create function private.course_authoring_part_progress_v1(p_course_id uuid,p_part_id uuid) returns jsonb
      language plpgsql as $f$ begin raise exception 'course_authoring_part_progress_v1 nao deve ocorrer'; end $f$;
      drop function private.current_course_curricular_map_v1(uuid);
      create function private.current_course_curricular_map_v1(p_course_id uuid) returns jsonb
      language plpgsql as $f$ begin raise exception 'current_course_curricular_map_v1 nao deve ocorrer'; end $f$`);
    const withoutReviewEvaluation = await reviewPayload(db);
    assert.deepEqual(expandReviewPlanningTransport(withoutReviewEvaluation), leanReviewProjection(fullExpanded));
  } finally { await db.close(); }
});

test("handler real entrega o mesmo contexto final para plano integral e projecao lean ricos", async () => {
  const db = await fixture({ microsequences: 6, textBytes: 300,
    partAssignments: [[0, 2, 1], [3, 4]], rich: true });
  try {
    await db.exec(delta);
    const before = withoutContentReview(expandPlanningTransport(await v5Payload(db)));
    await db.exec(reviewPlanDelta);
    await db.exec(leanReviewDelta);
    const after = expandReviewPlanningTransport(await reviewPayload(db));
    const cases = [
      { name: "curso", args: {} },
      { name: "parte", args: { parte: 1 } },
      { name: "microssequencia", args: { microssequencia: "Microssequencia 1" } },
      { name: "unidades", args: { unidades: [2, 1, 3] } }
    ];
    for (const current of cases) {
      const complete = await prepareReview(finalContextAdapter(before), current.args);
      const projected = await prepareReview(finalContextAdapter(after), current.args);
      assert.deepEqual(projected.context, complete.context,
        current.name + ": contexto final preservado pela projecao lean");
    }
  } finally { await db.close(); }
});

test("leitura de revisao cobre vazio, parte/micro sem unidades materializadas, ACL e guard", async () => {
  const empty = await fixture({ microsequences: 0, partAssignments: [] });
  try {
    await empty.exec(delta);
    await empty.exec(reviewPlanDelta);
    await empty.exec(leanReviewDelta);
    assert.deepEqual(expandReviewPlanningTransport(await reviewPayload(empty)),
      leanReviewProjection(JSON.parse(await v4Text(empty))));
  } finally { await empty.close(); }

  const partial = await fixture({ microsequences: 3, textBytes: 120, partAssignments: [[0, 2]] });
  try {
    await partial.exec(delta);
    await partial.exec(reviewPlanDelta);
    await partial.exec(leanReviewDelta);
    const review = expandReviewPlanningTransport(await reviewPayload(partial));
    assert.equal(review.plan.parts[0].microsequences.length, 2);
    assert.equal(review.plan.curriculum.modules[0].lessons[0].microsequences.length, 3);
    assert.equal(review.plan.curriculum.modules[0].lessons[0].microsequences[1].contentReview, undefined);
    assert.equal(await queryValue(partial, "select count(*)::integer value from private.course_entities where entity_type='study_unit'"), 0);
    assert.equal(await queryValue(partial, "select has_function_privilege('service_role','public.get_owned_course_review_plan_for_actor_v1(uuid,uuid)','execute') value"), true);
    assert.equal(await queryValue(partial, "select has_function_privilege('authenticated','public.get_owned_course_review_plan_for_actor_v1(uuid,uuid)','execute') value"), false);
    assert.equal(await queryValue(partial, "select has_function_privilege('anon','public.get_owned_course_review_plan_for_actor_v1(uuid,uuid)','execute') value"), false);

    await partial.exec("set test.denied='service'");
    await assert.rejects(() => reviewPayload(partial), /servico de autoria/u);
    await partial.exec("set test.denied=''");
    await assert.rejects(() => partial.query(
      "select public.get_owned_course_review_plan_for_actor_v1($1,$2)",
      ["90000000-0000-4000-8000-000000000009", COURSE]), /nao autorizada/u);
  } finally { await partial.close(); }

  const large = await fixture({ microsequences: 4, textBytes: 500000, contentStyle: "full", partAssignments: [[0, 1, 2, 3]] });
  try {
    await large.exec(delta);
    await large.exec(reviewPlanDelta);
    await large.exec(leanReviewDelta);
    await assert.rejects(() => reviewPayload(large), GUARD_MESSAGE);
  } finally { await large.close(); }
});

test("curso grande le a estrutura sem executar a revisao global por microssequencia", async () => {
  const assignments = Array.from({ length: 12 }, (unused, part) =>
    Array.from({ length: 8 }, (ignored, offset) => part * 8 + offset));
  const db = await fixture({ microsequences: 96, textBytes: 500, partAssignments: assignments });
  try {
    await db.exec(delta);
    await db.exec(reviewPlanDelta);
    await db.exec(leanReviewDelta);
    await db.exec(`drop function private.course_content_review_v1(uuid,text,text);
      create function private.course_content_review_v1(p_course_id uuid,p_target_kind text,p_target_id text) returns jsonb
      language plpgsql as $f$ begin raise exception 'course_content_review_v1 nao pode ser avaliada no plano focal'; end $f$;
      drop function private.course_authoring_part_progress_v1(uuid,uuid);
      create function private.course_authoring_part_progress_v1(p_course_id uuid,p_part_id uuid) returns jsonb
      language plpgsql as $f$ begin raise exception 'progresso nao pode ser avaliado no plano focal'; end $f$;
      drop function private.current_course_curricular_map_v1(uuid);
      create function private.current_course_curricular_map_v1(p_course_id uuid) returns jsonb
      language plpgsql as $f$ begin raise exception 'mapa integral nao pode ser avaliado no plano focal'; end $f$`);
    const review = expandReviewPlanningTransport(await reviewPayload(db));
    assert.equal(review.plan.curriculum.modules[0].lessons[0].microsequences.length, 96);
    assert.equal(review.plan.parts.length, 12);
    assert.equal(review.plan.parts.every(part => part.microsequences.length === 8), true);
    assert.equal(review.plan.curriculum.modules[0].lessons[0].microsequences
      .every(item => item.contentReview === undefined), true);
    assert.equal(review.plan.parts.every(part => !Object.hasOwn(part, "progress")), true);
    assert.equal(Object.hasOwn(review, "approvalBasis"), false);
    await assert.rejects(() => v5Payload(db),
      "o caminho v5 continua exercendo os helpers completos");
  } finally { await db.close(); }
});

test("plano condicional mantém a representação exata e invalida cada família de origem sem depender da revisão", async () => {
  const db = await fixture({ microsequences: 3, textBytes: 120,
    partAssignments: [[0, 2], [1]], rich: true });
  try {
    await db.exec(delta);
    await db.exec(reviewPlanDelta);
    await db.exec(leanReviewDelta);
    await db.exec(conditionalReviewPlanDelta);
    const original = expandReviewPlanningTransport(await reviewPayload(db));
    let full = await conditionalReviewPayload(db);
    assert.equal(full.contract, "aralearn.course-review-plan.snapshot.v1");
    assert.equal(full.notModified, false);
    assert.equal(full.courseRevision, 7);
    assert.equal(full.planVersion, 1);
    assert.match(full.fingerprint, /^[0-9a-f]{64}$/u);
    assert.deepEqual(expandReviewPlanningTransport(full.representation), original,
      "cold path conserva integralmente payload, encoding e approvalBasis do contrato anterior");
    const initialFingerprint = full.fingerprint;
    await db.exec(`create or replace function public.get_owned_course_review_plan_for_actor_v1(p_actor_id uuid,p_course_id uuid)
      returns jsonb language plpgsql stable as $f$ begin raise exception 'plano completo nao deve ser reconstruido no warm path'; end $f$`);
    const unchanged = await conditionalReviewPayload(db, initialFingerprint);
    assert.deepEqual(unchanged, {
      contract: "aralearn.course-review-plan.snapshot.v1", courseId: COURSE,
      courseRevision: 7, planVersion: 1, fingerprint: initialFingerprint, notModified: true
    }, "warm path retorna somente o envelope compacto após recalcular as fontes");
    await db.exec(definition(leanReviewDelta, "public.get_owned_course_review_plan_for_actor_v1"));

    await db.exec(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,design_application)
      values ('${COURSE}','study_unit','unit-1','microsequence','ms-001',0,
        '{"title":"Unidade inicial"}'::jsonb,'{"curriculumScopeItemIds":[]}'::jsonb)`);
    const mutations = [
      { name: "curso", sql: `update public.courses set goal='Objetivo alterado sem bump' where id='${COURSE}'` },
      { name: "plano", sql: `update private.course_instructional_plans set audience='Público alterado' where course_id='${COURSE}'` },
      { name: "itens do plano", sql: `update private.course_instructional_plan_items set statement='Resultado alterado' where course_id='${COURSE}' and item_kind='intended_learning_outcome'` },
      { name: "currículo module/lesson", sql: `update private.course_entities set content=content||'{"title":"Módulo alterado"}'::jsonb where course_id='${COURSE}' and entity_type='module'` },
      { name: "corpo da explicação", sql: `update private.course_entities set content=jsonb_set(content,'{explanationPlan,purpose}','"Propósito alterado"') where course_id='${COURSE}' and entity_type='microsequence' and entity_id='ms-001'` },
      { name: "título e aplicação da unidade", sql: `update private.course_entities set content='{"title":"Unidade alterada"}'::jsonb, design_application='{"curriculumScopeItemIds":["30000000-0000-4000-8000-000000000005"]}'::jsonb where course_id='${COURSE}' and entity_type='study_unit'` },
      { name: "vínculo do escopo", sql: `update private.course_design_target_plan_items set didactic_microsequence_id='ms-003' where course_id='${COURSE}' and didactic_microsequence_id='ms-001'` },
      { name: "parte autoral", sql: `update private.course_authoring_parts set title='Parte alterada' where course_id='${COURSE}' and position=0` },
      { name: "associação da parte", sql: `update private.course_authoring_part_didactic_microsequences set production_position=9 where course_id='${COURSE}' and authoring_part_id=(select id from private.course_authoring_parts where course_id='${COURSE}' and position=0) and didactic_microsequence_id='ms-001'` }
    ];
    let previousFingerprint = initialFingerprint;
    for (const mutation of mutations) {
      await db.exec(mutation.sql);
      const changed = await conditionalReviewPayload(db, previousFingerprint);
      assert.equal(changed.notModified, false, mutation.name + ": fonte alterada exige representação completa");
      assert.notEqual(changed.fingerprint, previousFingerprint, mutation.name + ": fingerprint muda sem bump de revisão");
      assert.equal(changed.courseRevision, 7, mutation.name + ": não depende de revisão incrementada");
      const exact = expandReviewPlanningTransport(changed.representation);
      assert.deepEqual(exact, expandReviewPlanningTransport(await reviewPayload(db)),
        mutation.name + ": payload continua idêntico ao leitor vigente");
      const confirmed = await conditionalReviewPayload(db, changed.fingerprint);
      assert.equal(confirmed.notModified, true, mutation.name + ": fingerprint atual pode ser reutilizado");
      previousFingerprint = changed.fingerprint;
    }

    await assert.rejects(() => conditionalReviewPayload(db, "not-a-fingerprint"), /impressão digital.*inválida/iu);
    await assert.rejects(() => conditionalReviewPayload(db, previousFingerprint, "90000000-0000-4000-8000-000000000009"),
      /nao autorizada/u, "ACL é verificada mesmo em requisição condicional");
    await db.exec("update public.courses set owner_id='90000000-0000-4000-8000-000000000009' where id='" + COURSE + "'");
    await assert.rejects(() => conditionalReviewPayload(db, previousFingerprint),
      /nao autorizada/u, "revogação do proprietário prevalece sobre fingerprint ainda em cache");
    assert.equal(await queryValue(db, "select has_function_privilege('service_role','public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,text)','execute') value"), true);
    assert.equal(await queryValue(db, "select has_function_privilege('authenticated','public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,text)','execute') value"), false);
    assert.equal(await queryValue(db, "select has_function_privilege('anon','public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,text)','execute') value"), false);
    assert.equal(await queryValue(db, "select public.get_aralearn_runtime_manifest()->>'schemaRevision' value"), "20261019174421");
    assert.equal(await queryValue(db, "select public.get_aralearn_runtime_manifest()->'features' ? 'course-review-plan-conditional-snapshot-v1' value"), true);
  } finally { await db.close(); }
});
