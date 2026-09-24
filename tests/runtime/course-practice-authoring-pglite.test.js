import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await fs.readFile(new URL("../../supabase/migrations/20260916025635_evaluable_offline_authoring_practice.sql", import.meta.url), "utf8");
const current = await fs.readFile(new URL("../../supabase/migrations/20260924172159_revisao_v7_component_removal.sql", import.meta.url), "utf8");
const guardStart = current.indexOf("create or replace function private.assert_course_practice_authoring_v1(");
const guardEnd = current.indexOf("revoke all on function", guardStart);
const guard = current.slice(guardStart, current.indexOf(";", guardEnd) + 1);
const precursor = await fs.readFile(new URL("../../supabase/migrations/20260902044404_cut_legacy_authoring_runtime.sql", import.meta.url), "utf8");
const start = precursor.indexOf("CREATE OR REPLACE FUNCTION private.commit_course_composition_core_v1(");
const end = precursor.indexOf("$function$;", precursor.indexOf("$function$", start) + 10);
const core = precursor.slice(start, end + 11).replace("p_request_id text)", "p_request_id text,p_course_metadata jsonb default null)");
const COURSE = "10000000-0000-4000-8000-000000000001";
const legacyResponse = { id: "answer", package: "aralearn.response.open", version: "1.0.0", data: { prompt: "Explique." } };
const feedback = [{ id: "feedback", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "O resultado decorre da relação local." } }];
const choice = { id: "answer", package: "aralearn.response.choice", version: "1.0.0", data: { question: "Qual é o caso?",
  selectionMode: "single", selectionCriterion: "correct", answerIds: ["a"], options: [{ id: "a", text: "Local" }, { id: "b", text: "Remoto" }] } };

test("guard vigente mantém validação no core real, sem exceção para resposta removida", async () => {
  const db = new PGlite();
  try {
    // O core é definição real com dependências não executadas; este teste exerce
    // migração e guard SQL. Auth/PostgREST e escrita completa pertencem à integração.
    await db.exec(`set check_function_bodies=off; create role anon; create role authenticated; create role service_role;
      create schema private; create schema auth; create schema extensions;
      create table public.courses(id uuid,revision bigint);
      create table private.course_change_receipts(actor_id uuid);
      create table private.course_entities(course_id uuid,entity_type text,entity_id text,content jsonb,design_snapshot jsonb);
      create function public.get_aralearn_runtime_manifest() returns jsonb language sql as $$select '{"schemaRevision":"previous","features":[]}'::jsonb$$;
      create function private.course_component_catalog_v1() returns jsonb language sql immutable as $$select '{"version":"previous"}'::jsonb$$;
      create function private.valid_course_component_policy_v1(policy jsonb) returns boolean language sql stable as $$select policy->>'catalogVersion'=private.course_component_catalog_v1()->>'version'$$;
      create table private.course_component_policy_assignments(policy jsonb,origin text,reason text,
        constraint course_component_policy_assignments_policy_v1 check(private.valid_course_component_policy_v1(policy)));
      insert into private.course_component_policy_assignments values('{"catalogVersion":"previous","allowedRefs":["aralearn.response.open@1.0.0"]}','author','Condição histórica');
      ${core}`);
    const legacy = { title: "Legado", response: legacyResponse, feedback: [] };
    await db.query("insert into private.course_entities values($1,'study_unit','legacy',$2,$3)",
      [COURSE, legacy, { componentPolicy: { catalogVersion: "previous" } }]);
    const before = (await db.query("select * from private.course_entities")).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query("select * from private.course_entities")).rows, before);
    const installed = (await db.query("select pg_get_functiondef('private.commit_course_composition_core_v1(uuid,uuid,bigint,jsonb,jsonb,text,jsonb)'::regprocedure) value")).rows[0].value;
    assert.ok(installed.indexOf("perform private.assert_course_practice_authoring_v1") > installed.indexOf("if v_course.revision <> p_expected_revision"));
    assert.ok(installed.indexOf("perform private.assert_course_practice_authoring_v1") < installed.indexOf("insert into private.course_entities"));

    await db.exec(guard);
    const check = (id, content) => db.query("select private.assert_course_practice_authoring_v1($1,$2)",
      [COURSE, [{ entityType: "study_unit", entityId: id, content }]]);
    // Current catalog contains no deleted response; the guard must reject even an unchanged value.
    await db.exec(`create or replace function private.course_component_catalog_v1() returns jsonb language sql immutable security definer set search_path=pg_catalog as $$select '{"options":[{"ref":"aralearn.response.choice@1.0.0"}]}'::jsonb$$;`);
    await assert.rejects(check("new", legacy), /unknown_response_component/u);
    await assert.rejects(check("legacy", { ...legacy, title: "Título alterado" }), /unknown_response_component/u);
    await assert.rejects(check("new", { response: choice, feedback: [] }), /practice_offline_feedback_required/u);
    await assert.rejects(check("new", { response: choice, feedback: [{ ...feedback[0], data: { text: " " } }] }), /practice_offline_feedback_required/u);
    await check("new", { response: choice, feedback });
    await check("legacy", { response: choice, feedback });
    await check("theory", { response: null, feedback: [] });
    assert.equal((await db.query("select has_function_privilege('authenticated','private.assert_course_practice_authoring_v1(uuid,jsonb)','execute') value")).rows[0].value, false);
  } finally { await db.close(); }
});
