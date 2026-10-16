import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { expandPlanningTransport, PLANNING_TRANSPORT_ENCODING } from "../../supabase/functions/_shared/aralearn-authoring/coursePlanningTransport.js";

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
    role: "explain", dependsOn: [], explanationPlan: { purpose: "Plano da base " + (index + 1) }, explanation });
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
  const partIds = partAssignments.map((unused, index) => "90000000-0000-4000-8000-00000000000" + (index + 1));
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
  return db;
}

const v4Text = async (db) => (await db.query(
  "select public.get_owned_course_instructional_plan_for_actor_v4($1,$2)::text as value", [ACTOR, COURSE])).rows[0].value;
const v5Payload = async (db) => (await db.query(
  "select public.get_owned_course_instructional_plan_for_actor_v5($1,$2) as value", [ACTOR, COURSE])).rows[0].value;

test("produtor legado real e v5 reconstituem o mesmo texto, e v4 nao muda", async () => {
  const db = await fixture({ microsequences: 6, textBytes: 300, partAssignments: [[0, 2, 1], [3, 4]] });
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
