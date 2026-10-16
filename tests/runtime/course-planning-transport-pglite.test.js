import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { expandPlanningTransport, PLANNING_TRANSPORT_ENCODING } from "../../supabase/functions/_shared/aralearn-authoring/coursePlanningTransport.js";

const read = async (name) => (await fs.readFile(
  new URL("../../supabase/migrations/" + name, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const migration = await read("20261016162436_planning_transport_deduplication.sql");

const ACTOR = "10000000-0000-4000-8000-000000000001";
const COURSE = ACTOR;
const PLAN = "20000000-0000-4000-8000-000000000001";
const PART = "30000000-0000-4000-8000-000000000001";
const IDEA = "40000000-0000-4000-8000-000000000001";
const SCOPE = "40000000-0000-4000-8000-000000000002";
const EVIDENCE = "40000000-0000-4000-8000-000000000003";
const PREREQ = "40000000-0000-4000-8000-000000000004";
const GUARD_BYTES = 1835008;
const LEGACY_PART_KEYS = ["contentReview", "curriculumPath", "explanation", "explanationPlan", "goal", "id", "productionPosition", "role", "studyUnitCount", "title"];

const microsequenceId = (index) => "ms-" + String(index + 1).padStart(3, "0");

const microsequenceContent = (index, textBytes) => JSON.stringify({
  title: "Microssequencia " + (index + 1),
  goal: "Explicar o caso " + (index + 1),
  role: "explain",
  dependsOn: [],
  explanationPlan: { purpose: "Plano da base " + (index + 1), prerequisites: [], relations: [], sourceIds: [] },
  explanation: { title: "Explicacao " + (index + 1),
    content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "t".repeat(textBytes) } }] }
});



// Confere o texto canonico do jsonb: mesma arvore implica o mesmo texto, e o digest de reuso nao muda.
const canonicalJson = (value) => Array.isArray(value)
  ? "[" + value.map(canonicalJson).join(",") + "]"
  : (value && typeof value === "object"
    ? "{" + Object.keys(value).sort((left, right) => left.length - right.length || (left < right ? -1 : left > right ? 1 : 0))
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}"
    : JSON.stringify(value));
const microsequenceEntity = (index, textBytes) => "('" + COURSE + "','microsequence','" + microsequenceId(index) +
  "','lesson','lesson-1'," + index + ",'" + microsequenceContent(index, textBytes).replaceAll("'", "''") + "'::jsonb,'{}'::jsonb)";

async function fixture(options) {
  const settings = options || {};
  const microsequences = settings.microsequences || 2;
  const textBytes = settings.textBytes || 200;
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
    "insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description) values " +
      "('" + IDEA + "','" + COURSE + "','" + PLAN + "','instructional_analysis_unit',0,'Relacao central','')," +
      "('" + EVIDENCE + "','" + COURSE + "','" + PLAN + "','evidence_requirement',0,'Distinguir os casos','')," +
      "('" + SCOPE + "','" + COURSE + "','" + PLAN + "','curriculum_scope_item',0,'Escopo central','')," +
      "('" + PREREQ + "','" + COURSE + "','" + PLAN + "','declared_prerequisite',0,'Pre-requisito','')",
    "create table private.course_entities(course_id uuid, entity_type text, entity_id text, parent_type text, parent_id text, position integer, content jsonb, design_application jsonb default '{}'::jsonb, primary key(course_id,entity_type,entity_id))",
    "create table private.course_design_target_plan_items(course_id uuid, didactic_microsequence_id text, plan_item_id uuid, plan_item_kind text)",
    "create table private.course_authoring_parts(id uuid primary key, course_id uuid, instructional_plan_id uuid, version bigint default 1, position integer, title text, intent text, progression jsonb, updated_at timestamptz default now())",
    "insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,progression) values ('" + PART + "','" + COURSE + "','" + PLAN + "',0,'Parte 1','','[]'::jsonb)",
    "create table private.course_authoring_part_didactic_microsequences(course_id uuid, authoring_part_id uuid, didactic_microsequence_id text, production_position integer)",
    "create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable as $m$ select jsonb_build_object('schemaRevision','test','features','[]'::jsonb) $m$",
    "create function private.require_service_role() returns void language plpgsql as $f$ begin if current_setting('test.denied',true)='service' then raise exception 'Operacao restrita ao servico de autoria.' using errcode='42501'; end if; end $f$",
    "create function private.require_course_access_v1(p_course_id uuid,p_actor_id uuid,p_require_owner boolean) returns text language plpgsql as $f$ begin if p_actor_id is null then raise exception 'Autenticacao obrigatoria.' using errcode='42501'; end if; if p_require_owner and not exists(select 1 from public.courses where id=p_course_id and owner_id=p_actor_id) then raise exception 'Edicao do Curso nao autorizada.' using errcode='42501'; end if; return 'owned'; end $f$",
    "create function private.course_content_review_v1(p_course_id uuid,p_kind text,p_entity_id text) returns jsonb language sql stable as $f$ select jsonb_build_object('state','current','kind',p_kind,'microsequenceId',p_entity_id) $f$",
    "create function private.course_authoring_part_progress_v1(p_course_id uuid,p_part_id uuid) returns jsonb language sql stable as $f$ select jsonb_build_object('state','planned','partId',p_part_id::text) $f$",
    "create function private.current_course_curricular_map_v1(p_course_id uuid) returns jsonb language sql stable as $f$ select jsonb_build_object('audience','Turma','prerequisites','[]'::jsonb,'scopeItems','[]'::jsonb,'modules','[]'::jsonb) $f$",
    "create function extensions.digest(p_data bytea,p_algo text) returns bytea language sql immutable as $f$ select decode(md5(encode(p_data,'hex'))||md5(encode(p_data,'hex')),'hex') $f$",
    "insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,design_application) values " +
      "('" + COURSE + "','module','module-1',null,null,0,'" + moduleContent + "'::jsonb,'{}'::jsonb)," +
      "('" + COURSE + "','lesson','lesson-1','module','module-1',0,'" + lessonContent + "'::jsonb,'{}'::jsonb)," +
      Array.from({ length: microsequences }, (unused, index) => microsequenceEntity(index, textBytes)).join(","),
    "insert into private.course_authoring_part_didactic_microsequences(course_id,authoring_part_id,didactic_microsequence_id,production_position) values " +
      Array.from({ length: microsequences }, (unused, index) => "('" + COURSE + "','" + PART + "','" + microsequenceId(index) + "'," + index + ")").join(",")
  ];
  for (const statement of statements) await db.exec(statement);
  await db.exec(migration);
  return db;
}

test("v5 compacta o transporte e reconstitui exatamente a arvore legada de v3", async () => {
  const db = await fixture({ microsequences: 3, textBytes: 400 });
  const complete = (await db.query("select private.get_course_instructional_plan_for_actor_v3($1,$2) as plan", [ACTOR, COURSE])).rows[0].plan;
  const payload = (await db.query("select public.get_owned_course_instructional_plan_for_actor_v5($1,$2) as payload", [ACTOR, COURSE])).rows[0].payload;
  assert.equal(complete.payloadEncoding, undefined);
  assert.equal(payload.payloadEncoding, PLANNING_TRANSPORT_ENCODING);
  const expanded = expandPlanningTransport(payload);
  const expected = { ...complete, approvalBasis: payload.approvalBasis };
  assert.deepStrictEqual(expanded, expected);
  assert.equal(canonicalJson(expanded), canonicalJson(expected));
  const curriculumMicrosequences = complete.plan.curriculum.modules[0].lessons[0].microsequences;
  assert.equal(curriculumMicrosequences.length, 3);
  assert.equal(complete.plan.parts[0].microsequences.length, 3);
  assert.deepStrictEqual(Object.keys(complete.plan.parts[0].microsequences[0]).sort(), LEGACY_PART_KEYS);
  assert.deepStrictEqual(Object.keys(payload.plan.parts[0].microsequences[0]).sort(), ["curriculumPath", "id", "productionPosition", "studyUnitCount"]);
  const compactBytes = Buffer.byteLength(JSON.stringify(payload));
  const completeBytes = Buffer.byteLength(JSON.stringify(complete));
  assert.ok(compactBytes < completeBytes, "compacto menor que legado");
  const first = expanded.plan.parts[0].microsequences[0];
  assert.equal(first.goal, curriculumMicrosequences[0].objective);
  assert.equal(first.title, curriculumMicrosequences[0].title);
  assert.deepStrictEqual(first.explanation, curriculumMicrosequences[0].explanation);
  assert.deepStrictEqual(first.contentReview, { state: "current", kind: "microsequence_explanation", microsequenceId: first.id });
  assert.equal(complete.plan.parts[0].progress.partId, PART);
  console.log("[472] bytes legado=" + completeBytes + " compacto=" + compactBytes);
});

test("guard mede a representacao pedida: v3 estoura e v5 permanece abaixo", async () => {
  const db = await fixture({ microsequences: 2, textBytes: 500000 });
  const compactBytes = Number((await db.query(
    "select octet_length(public.get_owned_course_instructional_plan_for_actor_v5($1,$2)::text) as bytes", [ACTOR, COURSE])).rows[0].bytes);
  assert.ok(compactBytes < GUARD_BYTES, "compacto " + compactBytes);
  console.log("[472] guard=" + GUARD_BYTES + " compactoGrande=" + compactBytes);
  await assert.rejects(() => db.query("select private.get_course_instructional_plan_for_actor_v3($1,$2)", [ACTOR, COURSE]), /excede o limite/u);
});

test("v5 preserva o gate de servico e o escopo do proprietario", async () => {
  const db = await fixture({ microsequences: 1, textBytes: 100 });
  await db.exec("set test.denied='service'");
  await assert.rejects(() => db.query("select public.get_owned_course_instructional_plan_for_actor_v5($1,$2)", [ACTOR, COURSE]), /servico de autoria/u);
  await db.exec("set test.denied=''");
  await assert.rejects(() => db.query("select public.get_owned_course_instructional_plan_for_actor_v5($1,$2)", ["90000000-0000-4000-8000-000000000009", COURSE]), /nao autorizada/u);
  const payload = (await db.query("select public.get_owned_course_instructional_plan_for_actor_v5($1,$2) as payload", [ACTOR, COURSE])).rows[0].payload;
  assert.equal(payload.payloadEncoding, PLANNING_TRANSPORT_ENCODING);
  assert.equal(payload.approvalBasis.courseRevision, 7);
});
