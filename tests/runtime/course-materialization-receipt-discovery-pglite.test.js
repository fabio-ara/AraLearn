import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

import { definition } from "../support/authoringMaterializationPglite.js";
import { CourseSupabaseAdapter } from
  "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

// Integração SQL da descoberta paginada de recibo sobre um Postgres real
// embarcado. Auth e acesso corrente são stubs explícitos: esta prova cobre a
// visibilidade da função, o recorte por ator/curso/Parte, a ordenação que não
// deixa acervo vencido esconder a tentativa vigente, os totais globais do
// recorte, a continuação completa e a ausência de escrita.
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

const read = name => fs.readFile(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8");

async function database() {
  const db = new PGlite();
  await db.exec("set check_function_bodies=off; create schema private; create schema auth; create schema extensions;"
    + " create role anon; create role authenticated; create role service_role;"
    + " create table auth.users(id uuid primary key);"
    + " insert into auth.users(id) values ('" + ACTOR + "'),('" + OTHER_ACTOR + "');"
    + " create table public.courses(id uuid primary key,owner_id uuid,revision bigint default 1);"
    + " insert into public.courses(id,owner_id) values ('" + COURSE + "','" + ACTOR + "'),('"
    + OWNED_COURSE + "','" + ACTOR + "'),('" + FOREIGN_COURSE + "','" + OTHER_ACTOR + "');"
    + " create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,"
    + " request_hash text,result jsonb,created_at timestamptz default now(),"
    + " expires_at timestamptz default now()+interval '14 days',primary key(actor_id,request_id));"
    + " create function private.require_service_role() returns void language plpgsql as $$begin"
    + " if current_setting('test.denied',true)='service' then raise exception 'service denied' using errcode='42501'; end if; end$$;"
    + " create function private.require_course_access_v1(c uuid,a uuid,w boolean) returns void language plpgsql as $$begin"
    + " if not exists(select 1 from public.courses course where course.id=c and course.owner_id=a) then"
    + " raise exception 'owner denied' using errcode='42501'; end if; end$$;");
  const source = (await read(MIGRATION)).replaceAll("\r\n", "\n");
  await db.exec(definition(source, READER));
  const acl = /revoke all on function[\s\S]*?to service_role;/u.exec(source)?.[0];
  assert.ok(acl, "a migração precisa revogar a execução pública e conceder ao service_role");
  await db.exec(acl);
  return { db, source };
}

const row = ({ actor = ACTOR, request, course = COURSE, expires = "+ interval '14 days'",
  created = "now()", result = RECEIPT }) => "('" + actor + "','" + request
  + "','materialize_course_authoring_part_v2','" + course + "','" + "a".repeat(64) + "','"
  + JSON.stringify(result) + "'::jsonb," + created + ",now() " + expires + ")";
const insert = (db, rows) => db.exec("insert into private.course_change_receipts(actor_id,request_id,operation,"
  + "course_id,request_hash,result,created_at,expires_at) values " + rows.join(","));
const expiredRow = (index) => row({ request: "materializacao-vencida-" + String(index).padStart(4, "0") + "-1",
  expires: "- interval '1 hour'", created: "now() - interval '" + index + " hours'" });
const discovery = async (db, actor, course, part = null, limit = 32, cursor = null) =>
  (await db.query("select " + READER + "('" + actor + "','" + course + "',"
    + (part === null ? "null" : "'" + part + "'") + "," + limit + ","
    + (cursor === null ? "null" : "'" + cursor + "'") + ") value")).rows[0].value;

async function state(db) {
  const receipts = await db.query("select actor_id,request_id,operation,course_id,result,created_at,expires_at from private.course_change_receipts order by request_id,actor_id,course_id");
  const courses = await db.query("select id,owner_id,revision from public.courses order by id");
  return JSON.stringify({ receipts: receipts.rows, courses: courses.rows });
}

test("tentativa vigente do próprio ator é devolvida com Parte, totais e sem alterar estado", async () => {
  const { db } = await database();
  await insert(db, [row({ request: REQUEST })]);
  const before = await state(db);
  const value = await discovery(db, ACTOR, COURSE, PART);
  assert.equal(value.contract, "aralearn.course-part-materialization-discovery.v1");
  assert.equal(value.authoringPartId, PART);
  assert.equal(value.status, "candidate");
  assert.equal(value.candidateCount, 1);
  assert.equal(value.expiredCount, 0);
  assert.equal(value.illegible, 0);
  assert.equal(value.hasMore, false);
  assert.equal(value.nextCursor, null);
  assert.deepEqual(value.items.map(item => item.requestId), [REQUEST]);
  assert.equal(value.items[0].authoringPartId, PART);
  assert.equal(value.items[0].expired, false);
  assert.equal(value.items[0].studyUnitCount, 2);
  const other = await discovery(db, ACTOR, COURSE, OTHER_PART);
  assert.equal(other.status, "none");
  assert.deepEqual(other.items, []);
  assert.equal(await state(db), before, "a descoberta não cria, altera nem remove recibo");
  await db.close();
});

test("acervo vencido numeroso não esconde a tentativa vigente e a continuação esgota o recorte", async () => {
  const { db } = await database();
  const expired = [];
  for (let index = 0; index < 64; index += 1) expired.push(expiredRow(index));
  await insert(db, expired);
  await insert(db, [row({ request: REQUEST, created: "now() - interval '3 days'" })]);
  const first = await discovery(db, ACTOR, COURSE, PART);
  assert.equal(first.status, "candidate");
  assert.equal(first.candidateCount, 1);
  assert.equal(first.expiredCount, 64);
  assert.equal(first.hasMore, true);
  assert.equal(typeof first.nextCursor, "string");
  assert.equal(first.items.length, 32);
  assert.equal(first.items[0].requestId, REQUEST, "a vigente vem antes das expiradas");
  assert.equal(first.items.slice(1).every(item => item.expired), true);
  const seen = new Set(first.items.map(item => item.requestId));
  let cursor = first.nextCursor;
  let pages = 1;
  while (cursor !== null) {
    const next = await discovery(db, ACTOR, COURSE, PART, 32, cursor);
    pages += 1;
    assert.equal(next.status, "candidate", "o status é do recorte inteiro, não da página");
    assert.equal(next.candidateCount, 1);
    for (const item of next.items) {
      assert.equal(seen.has(item.requestId), false, "nenhuma tentativa volta em outra página");
      seen.add(item.requestId);
      assert.equal(item.expired, true);
    }
    cursor = next.nextCursor;
  }
  assert.equal(pages, 3);
  assert.equal(seen.size, 65, "a continuação percorre o recorte inteiro");
  assert.equal(seen.has(REQUEST), true);
  await db.close();
});

test("mais de uma tentativa vigente continua ambígua em qualquer página", async () => {
test("instante idêntico não duplica nem omite linha na continuação", async () => {
  const { db } = await database();
  const expired = [];
  for (let index = 0; index < 64; index += 1) expired.push(expiredRow(index));
  await insert(db, expired);
  await insert(db, [row({ request: REQUEST })]);
  // Todas as linhas passam a compartilhar o instante: só o desempate ordena.
  await db.exec("update private.course_change_receipts set created_at = (select max(created_at) from private.course_change_receipts)");
  const expected = [REQUEST];
  for (let index = 0; index < 64; index += 1) {
    expected.push("materializacao-vencida-" + String(index).padStart(4, "0") + "-1");
  }
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = await discovery(db, ACTOR, COURSE, PART, 7, cursor);
    pages += 1;
    assert.equal(page.status, "candidate", "a unicidade é do recorte, não da página");
    assert.equal(page.candidateCount, 1);
    for (const item of page.items) seen.push(item.requestId);
    cursor = page.nextCursor;
  } while (cursor !== null);
  assert.equal(pages, 10, "65 linhas em páginas de 7");
  assert.equal(seen.length, 65, "nenhuma linha se repete entre páginas");
  assert.deepEqual([...seen].sort(), [...expected].sort());
  assert.deepEqual(seen, [...expected].sort(), "a ordenação e o cursor usam a mesma chave");
  await db.close();
});
  const { db } = await database();
  const expired = [];
  for (let index = 0; index < 64; index += 1) expired.push(expiredRow(index));
  await insert(db, expired);
  await insert(db, [row({ request: "materializacao-original-0002", created: "now() - interval '2 days'" }),
    row({ request: "materializacao-original-0003", created: "now() - interval '1 day'",
      result: { ...RECEIPT, courseRevision: 9, changed: false, studyUnitCount: 1 } })]);
  const page = await discovery(db, ACTOR, COURSE, PART, 1);
  assert.equal(page.status, "ambiguous");
  assert.equal(page.candidateCount, 2);
  assert.equal(page.items.length, 1, "a página é menor que o recorte e a ambiguidade permanece");
  assert.equal(page.hasMore, true);
  const following = await discovery(db, ACTOR, COURSE, PART, 1, page.nextCursor);
  assert.equal(following.status, "ambiguous");
  assert.equal(following.candidateCount, 2);
  assert.equal(following.items[0].requestId, "materializacao-original-0002");
  await db.close();
});

test("recibo expirado, ilegível e continuação inválida não são confirmados como vigentes", async () => {
  const { db } = await database();
  await insert(db, [row({ request: "materializacao-original-0004", expires: "- interval '1 second'" }),
    row({ request: "materializacao-original-0005",
      result: { contract: "aralearn.course-part-materialization.v1", courseId: COURSE } })]);
  const value = await discovery(db, ACTOR, COURSE, PART);
  assert.equal(value.status, "none");
  assert.deepEqual(value.items.map(item => item.requestId), ["materializacao-original-0004"]);
  assert.deepEqual(value.items.map(item => item.expired), [true], "o expirado aparece marcado, nunca como vigente");
  assert.equal(value.candidateCount, 0);
  assert.equal(value.expiredCount, 1);
  assert.equal(value.illegible, 1, "a linha sem forma de recibo não é silenciada");
  await assert.rejects(() => discovery(db, ACTOR, COURSE, PART, 0), /22023|inválida/u);
  await assert.rejects(() => discovery(db, ACTOR, COURSE, PART, 32, "sem-forma"), /22023|inválida/u);
  await assert.rejects(() => discovery(db, ACTOR, COURSE, PART, 65), /22023|inválida/u);
  await db.close();
});

test("leitura exige o helper de serviço e o dono do curso; aqui a negação é um stub", async () => {
  await assert.rejects(() => discovery(db, OTHER_ACTOR, COURSE), /owner denied|42501/u);
  await assert.rejects(() => discovery(db, ACTOR, FOREIGN_COURSE), /owner denied|42501/u);
  await db.exec("select set_config('test.denied','service',false)");
  await assert.rejects(() => discovery(db, ACTOR, COURSE), /service denied|42501/u);
  await db.exec("select set_config('test.denied','',false)");
  await insert(db, [row({ request: "materializacao-outro-curso-0006", course: OWNED_COURSE })]);
  assert.deepEqual((await discovery(db, ACTOR, COURSE)).items.map(item => item.requestId), [REQUEST]);
  assert.deepEqual((await discovery(db, ACTOR, OWNED_COURSE)).items.map(item => item.requestId),
    ["materializacao-outro-curso-0006"]);
  await db.close();
});

test("somente service_role executa o leitor e a função é security definer com search_path fixo", async () => {
  const { db } = await database();
  for (const role of ["anon", "authenticated"]) {
    const allowed = (await db.query("select has_function_privilege('" + role + "','" + READER
      + "(uuid,uuid,uuid,integer,text)','execute') allowed")).rows[0].allowed;
    assert.equal(allowed, false, role);
  }
  const service = (await db.query("select has_function_privilege('service_role','" + READER
    + "(uuid,uuid,uuid,integer,text)','execute') allowed")).rows[0].allowed;
  assert.equal(service, true);
  const signature = (await db.query("select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='discover_course_part_materialization_receipts_for_actor_v1'")).rows[0];
  assert.equal(signature.prosecdef, true);
  assert.ok(signature.proconfig.some(item => item.startsWith("search_path=")), "o search_path é fixo na definição");
  await db.close();
});


test("recibo de outro ator no mesmo curso não aparece nem altera os totais do dono", async () => {
  const { db } = await database();
  await insert(db, [row({ request: REQUEST }),
    row({ actor: OTHER_ACTOR, request: "materializacao-de-outro-ator-0001" }),
    row({ actor: OTHER_ACTOR, request: "materializacao-de-outro-ator-0002",
      expires: "- interval '1 hour'" })]);
  const value = await discovery(db, ACTOR, COURSE);
  assert.deepEqual(value.items.map(item => item.requestId), [REQUEST]);
  assert.equal(value.candidateCount, 1);
  assert.equal(value.expiredCount, 0, "o acervo alheio não entra no recorte do dono");
  assert.equal(value.illegible, 0);
  assert.equal(value.hasMore, false);
  await db.close();
});
  const { db } = await database();
  await insert(db, [row({ request: REQUEST })]);
