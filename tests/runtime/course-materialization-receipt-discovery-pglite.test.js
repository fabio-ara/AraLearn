import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

import { definition } from "../support/authoringMaterializationPglite.js";

// Integração SQL da descoberta focal de recibo sobre um Postgres real embarcado.
// Auth e acesso corrente são stubs explícitos: esta prova cobre a visibilidade
// da função, o recorte por ator/curso/Parte, a classificação dos recibos
// (vigente, expirado, ilegível) e a ausência de escrita. Ambiguidade é a mesma
// leitura devolvendo mais de uma tentativa; concorrência entre sessões continua
// coberta pelos testes hospedados.
const MIGRATION = "20261017124500_materialization_receipt_discovery.sql";
const READER = "public.discover_course_part_materialization_receipts_for_actor_v1";
const ACTOR = "40000000-0000-4000-8000-000000000001";
const OTHER_ACTOR = "40000000-0000-4000-8000-000000000002";
const COURSE = "10000000-0000-4000-8000-000000000001";
const OWNED_COURSE = "10000000-0000-4000-8000-000000000002";
const FOREIGN_COURSE = "10000000-0000-4000-8000-000000000003";
const PART = "20000000-0000-4000-8000-000000000001";
const OTHER_PART = "20000000-0000-4000-8000-000000000002";
const REQUEST = "materializacao-original-0001";
const RECEIPT = { contract: "aralearn.course-part-materialization.v1", courseId: COURSE, courseRevision: 7,
  authoringPartId: PART, changed: true, studyUnitCount: 2, idempotent: true };

const read = name => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

async function database() {
  const db = new PGlite();
  await db.exec(`set check_function_bodies=off; create schema private; create schema auth; create schema extensions;
    create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key);
    insert into auth.users(id) values ('${ACTOR}'),('${OTHER_ACTOR}');
    create table public.courses(id uuid primary key,owner_id uuid,revision bigint default 1);
    insert into public.courses(id,owner_id) values
      ('${COURSE}','${ACTOR}'),('${OWNED_COURSE}','${ACTOR}'),('${FOREIGN_COURSE}','${OTHER_ACTOR}');
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,
      request_hash text,result jsonb,created_at timestamptz default now(),
      expires_at timestamptz default now()+interval '14 days',primary key(actor_id,request_id));
    create function private.require_service_role() returns void language plpgsql as \$\$begin
      if current_setting('test.denied',true)='service' then raise exception 'service denied' using errcode='42501'; end if; end\$\$;
    create function private.require_course_access_v1(c uuid,a uuid,w boolean) returns void language plpgsql as \$\$begin
      if not exists(select 1 from public.courses course where course.id=c and course.owner_id=a) then
        raise exception 'owner denied' using errcode='42501'; end if; end\$\$`);
  const source = (await read(MIGRATION)).replaceAll("\r\n", "\n");
  await db.exec(definition(source, READER));
  const acl = /revoke all on function[\s\S]*?to service_role;/u.exec(source)?.[0];
  assert.ok(acl, "a migração precisa revogar a execução pública e conceder ao service_role");
  await db.exec(acl);
  return { db, source };
}

const receiptInsert = ({ operation = "materialize_course_authoring_part_v2", course = COURSE,
  actor = ACTOR, request = REQUEST, expires = "+ interval '14 days'", created = "now()",
  result = RECEIPT } = {}) =>
  `insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result,created_at,expires_at)
   values ('${actor}','${request}','${operation}','${course}','${"a".repeat(64)}','${JSON.stringify(result)}'::jsonb,
     ${created},now() ${expires})`;

const discovery = async (db, actor, course, part = null) =>
  (await db.query(`select ${READER}('${actor}','${course}',${part === null ? "null" : `'${part}'`}) value`))
    .rows[0].value;

async function state(db) {
  const receipts = await db.query("select actor_id,request_id,operation,course_id,result,created_at,expires_at from private.course_change_receipts order by request_id,actor_id,course_id");
  const courses = await db.query("select id,owner_id,revision from public.courses order by id");
  return JSON.stringify({ receipts: receipts.rows, courses: courses.rows });
}

test("tentativa vigente do próprio ator é devolvida com Parte e contagens, sem alterar estado", async () => {
  const { db } = await database();
  await db.exec(receiptInsert());
  const before = await state(db);
  const value = await discovery(db, ACTOR, COURSE, PART);
  assert.equal(value.contract, "aralearn.course-part-materialization-discovery.v1");
  assert.equal(value.courseId, COURSE);
  assert.equal(value.authoringPartId, PART);
  assert.equal(value.status, "candidate");
  assert.equal(value.illegible, 0);
  assert.deepEqual(value.expired, []);
  assert.equal(value.candidates.length, 1);
  assert.equal(value.candidates[0].requestId, REQUEST);
  assert.equal(value.candidates[0].authoringPartId, PART);
  assert.equal(value.candidates[0].courseRevision, 7);
  assert.equal(value.candidates[0].changed, true);
  assert.equal(value.candidates[0].studyUnitCount, 2);
  // Sem filtro de Parte, a mesma tentativa continua sendo a única do curso; o
  // eco da Parte pedida é o único campo que muda.
  const whole = await discovery(db, ACTOR, COURSE);
  assert.equal(whole.authoringPartId, null);
  assert.deepEqual(whole.candidates, value.candidates);
  assert.equal(whole.expired.length, 0);
  // A Parte informada recorta o resultado: outra Parte não recebe esta tentativa.
  const other = await discovery(db, ACTOR, COURSE, OTHER_PART);
  assert.equal(other.status, "none");
  assert.deepEqual(other.candidates, []);
  assert.equal(await state(db), before, "a descoberta não cria, altera nem remove recibo");
  await db.close();
});

test("mais de uma tentativa vigente devolve ambiguidade sem eleger a mais recente", async () => {
  const { db } = await database();
  await db.exec(receiptInsert({ request: "materializacao-original-0002", created: "now() - interval '2 hours'" }));
  await db.exec(receiptInsert({ request: "materializacao-original-0003", created: "now() - interval '1 hour'",
    result: { ...RECEIPT, courseRevision: 9, changed: false, studyUnitCount: 1 } }));
  const value = await discovery(db, ACTOR, COURSE, PART);
  assert.equal(value.status, "ambiguous");
  assert.deepEqual(value.candidates.map(item => item.requestId),
    ["materializacao-original-0003", "materializacao-original-0002"]);
  assert.deepEqual(value.candidates.map(item => item.changed), [false, true]);
  assert.equal(value.illegible, 0);
  await db.close();
});

test("recibo expirado e recibo ilegível não são conferidos como tentativa vigente", async () => {
  const { db } = await database();
  await db.exec(receiptInsert({ request: "materializacao-original-0004", expires: "- interval '1 second'" }));
  await db.exec(receiptInsert({ request: "materializacao-original-0005",
    result: { contract: "aralearn.course-part-materialization.v1", courseId: COURSE } }));
  const value = await discovery(db, ACTOR, COURSE, PART);
  assert.equal(value.status, "none");
  assert.deepEqual(value.candidates, []);
  assert.deepEqual(value.expired.map(item => item.requestId), ["materializacao-original-0004"]);
  assert.equal(value.expired[0].authoringPartId, PART);
  assert.equal(value.illegible, 1, "a linha sem forma de recibo não é silenciada");
  await db.close();
});

test("leitura exige o helper de serviço e o dono do curso; aqui a negação é um stub", async () => {
  const { db } = await database();
  await db.exec(receiptInsert());
  await assert.rejects(() => discovery(db, OTHER_ACTOR, COURSE), /owner denied|42501/u);
  await assert.rejects(() => discovery(db, ACTOR, FOREIGN_COURSE), /owner denied|42501/u);
  await db.exec("select set_config('test.denied','service',false)");
  await assert.rejects(() => discovery(db, ACTOR, COURSE), /service denied|42501/u);
  await db.exec("select set_config('test.denied','',false)");
  assert.equal((await discovery(db, ACTOR, COURSE)).status, "candidate");
  // A tentativa de outro curso do mesmo ator não aparece no recorte deste curso.
  await db.exec(receiptInsert({ request: "materializacao-outro-curso-0006", course: OWNED_COURSE }));
  const value = await discovery(db, ACTOR, COURSE);
  assert.deepEqual(value.candidates.map(item => item.requestId), [REQUEST]);
  const ownCourse = await discovery(db, ACTOR, OWNED_COURSE);
  assert.deepEqual(ownCourse.candidates.map(item => item.requestId), ["materializacao-outro-curso-0006"]);
  await db.close();
});

test("somente service_role executa o leitor e a função é security definer com search_path fixo", async () => {
  const { db } = await database();
  for (const role of ["anon", "authenticated"]) {
    const row = (await db.query(`select has_function_privilege('${role}','${READER}(uuid,uuid,uuid)','execute') allowed`)).rows[0];
    assert.equal(row.allowed, false, role);
  }
  assert.equal((await db.query(`select has_function_privilege('service_role','${READER}(uuid,uuid,uuid)','execute') allowed`)).rows[0].allowed, true);
  const definition_row = (await db.query("select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='discover_course_part_materialization_receipts_for_actor_v1'")).rows[0];
  assert.equal(definition_row.prosecdef, true);
  assert.ok(definition_row.proconfig.some(item => item.startsWith("search_path=")), "o search_path é fixo na definição");
  await db.close();
});

