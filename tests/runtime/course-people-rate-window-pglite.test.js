import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "10000000-0000-4000-8000-000000000001";
const PERSON = "10000000-0000-4000-8000-000000000002";
const OTHER = "10000000-0000-4000-8000-000000000003";
const COURSE = "20000000-0000-4000-8000-000000000001";
const migration = "20260910210609_course_people_rate_window_atomic.sql";
const load = name => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const value = async (db, sql, args = []) => (await db.query(sql, args)).rows[0].value;
function functionSql(source, name, delimiter = "$function$") {
  const start = new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "u").exec(source);
  assert.ok(start, `Função precursora ${name}`);
  const end = source.indexOf(`${delimiter};`, start.index);
  assert.ok(end > start.index);
  return source.slice(start.index, end + delimiter.length + 1);
}

// RPCs e tabela de cotas reais em PGlite; somente Auth e a primitiva de hash
// recebem substitutos locais. Não representa OAuth, PostgREST ou sessão hospedada.
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create table public.person_profiles(user_id uuid primary key references auth.users(id),handle text,avatar_object_key text);
    create table public.courses(id uuid primary key,owner_id uuid,visibility text default 'private');
    create table public.course_access(course_id uuid,user_id uuid,granted_by uuid,can_copy boolean not null default false,
      primary key(course_id,user_id));
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      primary key(actor_id,request_id));
    create function private.require_service_role() returns void language sql as $$select$$;
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as $$select repeat(md5($1::text),2)$$;
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog
      as $$select '{"schemaRevision":"20260910134141","contractVersion":1,"features":["study-only-course-access-v1"]}'::jsonb$$;
    insert into auth.users values('${OWNER}'),('${PERSON}'),('${OTHER}');
    insert into public.person_profiles(user_id,handle) values('${OWNER}','autor'),('${PERSON}','pessoa'),('${OTHER}','outra');
    insert into public.courses values('${COURSE}','${OWNER}','private');
  `);
  const lifecycle = await load("20260821191340_harden_current_data_lifecycle.sql");
  const tableStart = lifecycle.indexOf("create table private.course_access_grant_rate_limits(");
  assert.ok(tableStart > 0);
  await db.exec(lifecycle.slice(tableStart, lifecycle.indexOf("\n);", tableStart) + 3));
  await db.exec(`alter table private.course_access_grant_rate_limits add column search_attempt_count bigint not null default 0
    check(search_attempt_count>=0)`);
  const identity = await load("20260905062817_public_course_access_and_identity.sql");
  for (const name of ["private.normalize_person_handle_v1", "private.course_ownership_v1",
    "private.consume_course_people_rate_v1", "public.search_course_access_people_for_actor_v1"]) {
    await db.exec(functionSql(identity, name));
  }
  await db.exec(functionSql(await load("20260817140000_course_identity_cutover.sql"), "private.require_course_access_v1"));
  await db.exec(functionSql(await load("20260905145236_independent_course_copies.sql"), "public.manage_course_access_for_actor_v3", "$f$"));
  await db.exec("revoke all on function private.consume_course_people_rate_v1(uuid,boolean) from public,anon,authenticated,service_role");
  const metadata = () => value(db, `select to_jsonb(p)-'prosrc' value from pg_proc p
    where p.oid='private.consume_course_people_rate_v1(uuid,boolean)'::regprocedure`);
  const before = await metadata();
  await db.exec(await load(migration));
  assert.deepEqual(await metadata(), before, "CREATE OR REPLACE preserva identidade, ACL e propriedades da função");
  return db;
}

async function seed(db, { expired = true, attempts = 1, searches = 1 } = {}) {
  await db.query(`insert into private.course_access_grant_rate_limits(
      actor_id,window_started_at,last_attempt_at,attempt_count,search_attempt_count)
    values($1,statement_timestamp()-$2::interval,statement_timestamp()-interval '30 seconds',$3,$4)`,
  [OWNER, expired ? "11 minutes" : "1 minute", attempts, searches]);
  await db.query(`insert into private.course_access_grant_rate_limits(actor_id,window_started_at,last_attempt_at,attempt_count,search_attempt_count)
    values($1,statement_timestamp()-interval '11 minutes',statement_timestamp()-interval '1 minute',2,3)`, [OTHER]);
}
const row = (db, actor = OWNER) => value(db, "select to_jsonb(r) value from private.course_access_grant_rate_limits r where actor_id=$1", [actor]);
const search = db => value(db, "select public.search_course_access_people_for_actor_v1($1,$2,'pessoa',10) value", [OWNER, COURSE]);
const grant = (db, requestId) => value(db, "select public.manage_course_access_for_actor_v3($1,$2,'grant_access','pessoa',$3,true,$4,false) value",
  [OWNER, COURSE, PERSON, requestId]);

for (const operation of ["busca", "concessão"]) {
  test(`${operation} real renova a janela vencida com os dois horários coerentes`, async () => {
    const db = await fixture();
    try {
      await seed(db);
      const before = await row(db);
      const other = await row(db, OTHER);
      const result = operation === "busca" ? await search(db) : await grant(db, "expired-window-grant");
      const after = await row(db);
      assert.ok(after.window_started_at > before.window_started_at);
      assert.equal(after.last_attempt_at, after.window_started_at);
      assert.equal(after.search_attempt_count, operation === "busca" ? 1 : 0);
      assert.equal(after.attempt_count, operation === "concessão" ? 1 : 0);
      assert.deepEqual(await row(db, OTHER), other, "Outro ator conserva sua janela e seus contadores");
      if (operation === "busca") {
        assert.deepEqual(result.items, [{ userId: PERSON, handle: "pessoa", avatarObjectKey: null }]);
        assert.equal(result.rateLimited, undefined);
        assert.equal(await value(db, "select count(*)::integer value from public.course_access"), 0);
      } else {
        assert.equal(result.changed, true);
        assert.equal(result.person.canCopy, false);
        assert.equal(result.person.userId, PERSON);
        assert.equal(await value(db, "select can_copy value from public.course_access where course_id=$1 and user_id=$2", [COURSE, PERSON]), false);
        assert.deepEqual(await value(db, "select result value from private.course_change_receipts where actor_id=$1 and request_id=$2", [OWNER, "expired-window-grant"]), result);
        const replay = await grant(db, "expired-window-grant");
        assert.equal(replay.idempotent, true);
        assert.deepEqual(await row(db), after, "Replay do recibo não consome outra concessão");
      }
      assert.equal(await value(db, "select public.get_aralearn_runtime_manifest()->>'schemaRevision' value"), "20260910210609");
    } finally { await db.close(); }
  });
}

test("janela ativa mantém limites separados de 60 buscas e 10 concessões e a CHECK temporal", async () => {
  const db = await fixture();
  try {
    await seed(db, { expired: false, attempts: 9, searches: 59 });
    const before = await row(db);
    const other = await row(db, OTHER);
    assert.equal((await search(db)).items.length, 1);
    assert.equal((await row(db)).attempt_count, 9);
    assert.equal((await search(db)).rateLimited, true);
    assert.equal((await grant(db, "active-window-grant")).changed, true);
    const blocked = await grant(db, "active-window-over-limit");
    assert.equal(blocked.rateLimited, true);
    assert.equal(blocked.changed, false);
    const after = await row(db);
    assert.equal(after.window_started_at, before.window_started_at);
    assert.ok(after.last_attempt_at >= before.last_attempt_at);
    assert.equal(after.search_attempt_count, 61);
    assert.equal(after.attempt_count, 11);
    assert.deepEqual(await row(db, OTHER), other);
    assert.equal(await value(db, "select count(*)::integer value from private.course_change_receipts"), 1);
    await assert.rejects(db.query("update private.course_access_grant_rate_limits set last_attempt_at=window_started_at-interval '1 second' where actor_id=$1", [OWNER]),
      error => error.code === "23514" && error.constraint === "course_access_grant_rate_limits_window_v1");
    assert.deepEqual(await row(db), after, "A CHECK continua impedindo horário incoerente");
  } finally { await db.close(); }
});
