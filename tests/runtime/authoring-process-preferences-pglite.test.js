import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";
import { defaultAuthoringProcessPreferences, normalizeAuthoringProcessPreferencesRead,
  normalizeAuthoringProcessPreferencesChange } from "../../src/domain/authoringProcessPreferences.js";

const USER = "10000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const read = name => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const [migration, profiles] = await Promise.all([
  read("20260909025429_contextual_authoring_process_preferences.sql"),
  read("20260905080544_scoped_authoring_preferences_and_profiles.sql")
]);
function definition(name) {
  const expression = new RegExp(`create (?:or replace )?function ${name.replaceAll(".", "\\.")}\\(`, "iu");
  const start = profiles.search(expression);
  assert.ok(start >= 0, name);
  const end = profiles.indexOf("$function$;", profiles.indexOf("$function$", start) + 10);
  return profiles.slice(start, end + 11);
}

async function fixture() {
  const database = new PGlite();
  // Schema mínimo sintético; executa migration completa e normalizadores reais.
  // Auth JWT e o desenho dos cursos são comprovados na integração coordenada.
  await database.exec(`create schema private; create schema auth;
    create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key);
    create table private.course_design_parameter_definitions(parameter_id text primary key,ordinal integer,
      value_kind text,definition jsonb);
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,
      request_hash text,result jsonb,expires_at timestamptz default(now()+interval '1 day'),primary key(actor_id,request_id),
      constraint course_change_receipts_operation_v16 check(operation in('save_authoring_profile','delete_authoring_profile','other_course_operation')),
      constraint course_change_receipts_profile_scope_v1 check((course_id is null)=(operation in('save_authoring_profile','delete_authoring_profile'))));
    create table public.courses(id uuid primary key,revision bigint,visibility text);
    create table private.course_design_parameter_assignments(course_id uuid,parameter_id text,value jsonb);
    create function private.require_service_role() returns void language plpgsql as $$ begin
      if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
        raise exception 'Operação restrita ao serviço de autoria.' using errcode='42501'; end if; end $$;
    create function private.course_source_json_hash_v1(value jsonb) returns text language sql immutable as $$
      select encode(sha256(convert_to(value::text,'UTF8')),'hex') $$;
    set request.jwt.claim.role='service_role';
    ${definition("private.valid_course_design_parameter_value_v1")}
    ${definition("private.normalize_authoring_profile_preferences_v1")}`);
  for (const [index, item] of COURSE_DESIGN_PARAMETER_DEFINITIONS.entries()) {
    await database.query("insert into private.course_design_parameter_definitions values($1,$2,$3,$4)",
      [item.id, index + 1, item.valueSchema.type, JSON.stringify(item)]);
  }
  await database.query("insert into auth.users values($1),($2)", [USER, OTHER]);
  await database.query("insert into public.courses values($1,7,'private')", [USER]);
  await database.query("insert into private.course_design_parameter_assignments values($1,'authoring_chat_response_word_target','90')", [USER]);
  await database.exec(migration);
  return database;
}
const readPreferences = async (database, actor = USER) => (await database.query(
  "select public.get_authoring_process_preferences_for_actor_v1($1) result", [actor])).rows[0].result;
const save = async (database, preferences, expectedRevision, requestId, actor = USER) => (await database.query(
  "select public.save_authoring_process_preferences_for_actor_v1($1,$2,$3,$4) result",
  [actor, expectedRevision, JSON.stringify(preferences), requestId])).rows[0].result;

test("migration persiste preferência isolada, confirma replay/CAS e conserva curso e defaults de outra conta", async () => {
  const database = await fixture();
  try {
    const initial = normalizeAuthoringProcessPreferencesRead(await readPreferences(database));
    assert.equal(initial.revision, 0);
    assert.deepEqual(initial.preferences, defaultAuthoringProcessPreferences());
    const preferences = { ...initial.preferences, focus: "content", cadence: "batch", reviewPoints: ["explanation"] };
    const command = { preferences, expectedRevision: 0, requestId: "process-save-1" };
    const receipt = normalizeAuthoringProcessPreferencesChange(await save(database, preferences, 0, command.requestId), command);
    assert.equal(receipt.revision, 1);
    assert.equal(receipt.changed, true);
    assert.equal((await save(database, preferences, 0, command.requestId)).idempotent, true);
    assert.equal((await save(database, preferences, 1, "process-noop-1")).changed, false);
    await assert.rejects(save(database, { ...preferences, focus: "full_cycle" }, 0, command.requestId), error => error.code === "23514");
    await assert.rejects(save(database, preferences, 0, "process-stale-1"), error => error.code === "40001");
    const updated = await save(database, { ...preferences, reviewPoints: [] }, 1, "process-save-2");
    assert.equal(updated.revision, 2);
    assert.deepEqual((await readPreferences(database, OTHER)).preferences, initial.preferences);
    assert.equal((await readPreferences(database, OTHER)).revision, 0);
    assert.deepEqual((await database.query("select revision,visibility from public.courses")).rows, [{ revision: 7, visibility: "private" }]);
    assert.deepEqual((await database.query("select value from private.course_design_parameter_assignments")).rows, [{ value: 90 }]);
    assert.equal((await database.query("select count(*)::integer n from private.course_change_receipts")).rows[0].n, 3);
  } finally { await database.close(); }
});

test("RPC respeita grants de serviço, RLS e validação pelo catálogo real", async () => {
  const database = await fixture();
  try {
    const preferences = defaultAuthoringProcessPreferences();
    for (const change of [
      { ...preferences, focus: "unknown" }, { ...preferences, cadence: "each_part" },
      { ...preferences, reviewPoints: ["explanation", "explanation"] },
      { ...preferences, parameters: preferences.parameters.slice(1) },
      { ...preferences, parameters: preferences.parameters.map((item, index) => index ? item : {
        parameterId: "study_unit_content_word_target", mode: "fixed", value: 180
      }) },
      { ...preferences, parameters: preferences.parameters.map((item, index) => index ? item : { ...item, mode: "fixed", value: 999999 }) }
    ]) await assert.rejects(save(database, change, 0, "process-invalid-1"), error => error.code === "22023");
    assert.equal((await database.query("select count(*)::integer n from private.authoring_process_preferences")).rows[0].n, 0);
    for (const role of ["anon", "authenticated"]) {
      await database.exec(`set role ${role}`);
      await assert.rejects(readPreferences(database), error => error.code === "42501");
      await assert.rejects(save(database, preferences, 0, "process-denied-1"), error => error.code === "42501");
      await database.exec("reset role");
    }
    await database.exec("set request.jwt.claim.role='authenticated'");
    await assert.rejects(readPreferences(database), error => error.code === "42501");
    await database.exec("set request.jwt.claim.role='service_role'; set role service_role");
    assert.equal((await readPreferences(database)).revision, 0);
    await assert.rejects(database.query("select * from private.authoring_process_preferences"), error => error.code === "42501");
    await database.exec("reset role");
    const security = (await database.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.authoring_process_preferences'::regclass")).rows[0];
    assert.deepEqual(security, { relrowsecurity: true, relforcerowsecurity: true });
  } finally { await database.close(); }
});
