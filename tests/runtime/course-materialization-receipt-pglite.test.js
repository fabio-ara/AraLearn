import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

import { definition } from "../support/authoringMaterializationPglite.js";

// Integração SQL do leitor focal de recibo sobre um Postgres real embarcado.
// Auth, composição e acesso corrente são stubs explícitos: esta prova cobre a
// ACL da função, a chave do lock, a atomicidade da leitura e os quatro estados,
// não o runtime hospedado. O estado em voo exige duas sessões concorrentes e é
// provado na camada da ferramenta; aqui a paridade da chave é estrutural.
const MIGRATION = "20261014143125_materialization_receipt_recovery.sql";
const MATERIALIZER_MIGRATION = "20260903160000_global_curriculum_authoring_flow.sql";
const READER = "public.get_course_part_materialization_receipt_for_actor_v1";
const ACTOR = "40000000-0000-4000-8000-000000000001";
const OTHER_ACTOR = "40000000-0000-4000-8000-000000000002";
const COURSE = "10000000-0000-4000-8000-000000000001";
const OWNED_COURSE = "10000000-0000-4000-8000-000000000002";
const FOREIGN_COURSE = "10000000-0000-4000-8000-000000000003";
const REQUEST = "materializacao-original-0001";
const LOCK_EXPRESSION = "'course-change-request:'||p_actor_id::text||':'||p_request_id";
const RECEIPT = { contract: "aralearn.course-part-materialization.v1", courseId: COURSE, courseRevision: 7,
  authoringPartId: "20000000-0000-4000-8000-000000000001", changed: true, studyUnitCount: 2, idempotent: false };

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
    create function private.require_service_role() returns void language plpgsql as $$begin
      if current_setting('test.denied',true)='service' then raise exception 'service denied' using errcode='42501'; end if; end$$;
    create function private.require_course_access_v1(c uuid,a uuid,w boolean) returns void language plpgsql as $$begin
      if not exists(select 1 from public.courses course where course.id=c and course.owner_id=a) then
        raise exception 'owner denied' using errcode='42501'; end if; end$$;`);
  const source = (await read(MIGRATION)).replaceAll("\r\n", "\n");
  await db.exec(definition(source, READER));
  const acl = /revoke all on function[\s\S]*?to service_role;/u.exec(source)?.[0];
  assert.ok(acl, "a migração precisa revogar a execução pública e conceder ao service_role");
  await db.exec(acl);
  return { db, source };
}

const receiptInsert = ({ operation = "materialize_course_authoring_part_v2", course = COURSE,
  actor = ACTOR, request = REQUEST, expires = "+ interval '14 days'", result = RECEIPT } = {}) =>
  `insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result,expires_at)
   values ('${actor}','${request}','${operation}','${course}','${"a".repeat(64)}','${JSON.stringify(result)}'::jsonb,now() ${expires})`;

const query = async (db, actor, course, request = REQUEST) =>
  (await db.query(`select ${READER}('${actor}','${course}','${request}') value`)).rows[0].value;

async function state(db) {
  const receipts = await db.query("select actor_id,request_id,operation,course_id,result,expires_at from private.course_change_receipts order by request_id,actor_id,course_id");
  const courses = await db.query("select id,owner_id,revision from public.courses order by id");
  return JSON.stringify({ receipts: receipts.rows, courses: courses.rows });
}

test("recibo materializado é lido pelo mesmo ator, curso e tentativa sem alterar estado", async () => {
  const { db } = await database();
  await db.exec(receiptInsert());
  const before = await state(db);
  const value = await query(db, ACTOR, COURSE);
  assert.equal(value.contract, "aralearn.course-part-materialization-receipt.v1");
  assert.equal(value.status, "confirmed");
  assert.equal(value.courseId, COURSE);
  assert.equal(value.requestId, REQUEST);
  assert.deepEqual(value.result, { ...RECEIPT, idempotent: true });
  assert.equal(await state(db), before, "a consulta do recibo não materializa nem apaga objetos");
  await db.close();
});

test("ausência e expiração não são convertidas em efeito nem em reversão", async () => {
  const { db } = await database();
  const absent = await query(db, ACTOR, COURSE);
  assert.deepEqual(absent, { contract: "aralearn.course-part-materialization-receipt.v1",
    status: "not_recorded", courseId: COURSE, requestId: REQUEST });
  await db.exec(receiptInsert({ expires: "- interval '1 second'" }));
  const before = await state(db);
  const expired = await query(db, ACTOR, COURSE);
  assert.deepEqual(expired, { contract: "aralearn.course-part-materialization-receipt.v1",
    status: "expired", courseId: COURSE, requestId: REQUEST });
  assert.equal(await state(db), before, "o recibo expirado permanece no banco e não é confirmado");
  await db.close();
});

test("mesmo requestId de outra operação ou de outro curso não é recibo desta materialização", async () => {
  const { db } = await database();
  const otherOperation = "materializacao-outra-operacao";
  const otherCourse = "materializacao-outro-curso";
  await db.exec(receiptInsert({ request: otherOperation, operation: "commit_course_composition" }));
  await assert.rejects(() => query(db, ACTOR, COURSE, otherOperation), /outra alteração|23514/u);
  await db.exec(receiptInsert({ request: otherCourse, course: OWNED_COURSE }));
  await assert.rejects(() => query(db, ACTOR, COURSE, otherCourse), /outra alteração|23514/u);
  // A tentativa pertencente ao curso próprio continua legível.
  const value = await query(db, ACTOR, OWNED_COURSE, otherCourse);
  assert.equal(value.status, "confirmed");
  assert.equal(value.courseId, OWNED_COURSE);
  await db.close();
});

test("autorização atual é conferida em cada leitura, inclusive após revogação", async () => {
  const { db } = await database();
  await db.exec(receiptInsert());
  await assert.rejects(() => query(db, OTHER_ACTOR, COURSE), /owner denied|42501/u);
  await db.exec("select set_config('test.denied','service',false)");
  await assert.rejects(() => query(db, ACTOR, COURSE), /service denied|42501/u);
  await db.exec("select set_config('test.denied','',false)");
  assert.equal((await query(db, ACTOR, COURSE)).status, "confirmed");
  await db.close();
});

test("somente service_role executa o leitor focal e a chave do lock é a do writer", async () => {
  const { db, source } = await database();
  for (const role of ["anon", "authenticated"]) {
    const row = (await db.query(`select has_function_privilege('${role}','${READER}(uuid,uuid,text)','execute') allowed`)).rows[0];
    assert.equal(row.allowed, false, role);
  }
  assert.equal((await db.query(`select has_function_privilege('service_role','${READER}(uuid,uuid,text)','execute') allowed`)).rows[0].allowed, true);
  // A falha do try é o único caminho para declarar escrita em voo; a chave
  // precisa ser idêntica à do materializador para que o lock seja o mesmo.
  const reader = definition(source, READER);
  assert.ok(reader.includes("pg_try_advisory_xact_lock(hashtextextended("), "a leitura tenta o lock da tentativa");
  assert.ok(reader.includes(LOCK_EXPRESSION), "a chave do lock do leitor é a da tentativa");
  assert.match(reader, /'status','in_flight'/u);
  const writer = definition((await read(MATERIALIZER_MIGRATION)).replaceAll("\r\n", "\n"),
    "public.materialize_course_authoring_part_for_actor_v2");
  assert.ok(writer.includes("pg_advisory_xact_lock(hashtextextended("), "o materializador toma o lock da tentativa");
  assert.ok(writer.includes(LOCK_EXPRESSION), "o materializador usa a mesma chave do leitor");
  assert.ok(writer.includes("'materialize_course_authoring_part_v2'"), "o recibo pertence à operação real da materialização");
  await db.close();
});

