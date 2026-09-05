import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const readMigration = (name) => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const [pre, change, correction, compositionSource, wrapperSource, analyticsSource, materializerSource] = await Promise.all([
  "20260905094108_normalize_applied_design_discriminator.sql",
  "20260905094109_preserve_applied_design_on_focal_edits.sql",
  "20260905095110_correct_applied_design_discriminator.sql",
  "20260902044404_cut_legacy_authoring_runtime.sql",
  "20260902160602_preserve_course_design_on_focal_mcp_corrections.sql",
  "20260905080544_scoped_authoring_preferences_and_profiles.sql",
  "20260905083846_contextual_automatic_design_application.sql"
].map(readMigration));

function definition(source, name, metadataArgument = false) {
  const start = source.toLowerCase().indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf("$function$;", source.indexOf("$function$", start) + 10);
  assert.ok(end > start, name);
  let value = source.slice(start, end + 11).replaceAll("\r\n", "\n");
  if (metadataArgument) value = value.replace(/p_request_id text(\s*\))/u,
    (_, closing) => `p_request_id text, p_course_metadata jsonb DEFAULT NULL${closing}`);
  return value;
}

const precursorDefinitions = [
  definition(compositionSource, "private.commit_course_composition_core_v1", true),
  definition(wrapperSource, "public.commit_course_composition_for_actor_v1", true),
  definition(analyticsSource, "public.get_owned_course_authoring_analytics_for_actor_v3"),
  definition(materializerSource, "private.materialize_course_authoring_part_core_v1")
];
const snapshot = { contract: "aralearn.study-unit-design-snapshot.v2", parameterCatalogVersion: "1.1.0",
  parameters: [{ parameterId: "fixture", value: 3, reason: null }], appliedAt: "2026-09-02T00:00:00Z" };
const application = { mode: "expository", introducedInstructionalAnalysisUnitIds: [], explanationApplications: [],
  practiceApplications: [], componentRefs: [], usedInstructionalAnalysisUnitIds: [], curriculumScopeItemIds: [] };
const discriminator = { contract: "aralearn.study-unit-design-application.v1" };

async function fixture(revision = "20260905092640") {
  const database = new PGlite();
  // Testa a transição de dados com scripts completos e definições precursoras
  // reais. Os RPCs não são chamados nesta base mínima; pgTAP015/018 os exercem
  // no Supabase real, inclusive autoridade, conteúdo, CAS e idempotência.
  await database.exec(`set check_function_bodies=off; create schema private;
    create table private.course_entities(entity_id text,entity_type text,
      design_snapshot jsonb,design_application jsonb,created_origin text,last_revision_origin text,updated_at timestamptz,
      constraint course_entities_design_current_v1 check(design_snapshot is null or
        jsonb_typeof(design_snapshot)='object' and design_snapshot->>'contract'='aralearn.study-unit-design-snapshot.v2'
        and design_application->>'contract'='aralearn.study-unit-design-application.v1'));
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql as $$
      select '{"schemaRevision":"${revision}","features":[]}'::jsonb $$;
    ${precursorDefinitions.join("\n")}`);
  return database;
}

async function insert(database, id, value, stale = false) {
  await database.query("insert into private.course_entities values($1,'study_unit',$2,$3,'gpt','gpt',$4)",
    [id, JSON.stringify(snapshot), JSON.stringify(value), stale ? "2026-09-03" : "2026-09-01"]);
}

test("PRE, invalidação e correção preservam dados úteis na ordem de rollout", async () => {
  const database = await fixture();
  try {
    for (const [id, contract, stale] of [
      ["current-missing", false, false], ["current-explicit", true, false],
      ["stale-missing", false, true], ["stale-explicit", true, true]
    ]) await insert(database, id, { ...application, ...(contract ? discriminator : {}) }, stale);
    await database.exec(pre);
    const before = (await database.query("select * from private.course_entities order by entity_id")).rows;
    assert.ok(before.every((row) => row.design_application.contract === discriminator.contract));
    await database.exec(change);
    await database.exec(correction);
    const after = (await database.query("select * from private.course_entities order by entity_id")).rows;
    assert.deepEqual(after.map((row) => row.design_snapshot), before.map((row) => row.design_snapshot));
    for (const row of after) assert.deepEqual(row.design_application,
      row.entity_id.startsWith("stale") ? null : { ...application, ...discriminator });
    assert.equal((await database.query("select public.get_aralearn_runtime_manifest()->>'schemaRevision' revision")).rows[0].revision, "20260905095110");
    const body = (await database.query("select pg_get_functiondef('private.materialize_course_authoring_part_core_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure) definition")).rows[0].definition;
    assert.equal([...body.matchAll(/\) \|\| \(unit.value->'designApplication'\),/gu)].length, 2);
  } finally { await database.close(); }
});

test("PRE recusa forma, discriminador e tamanho incompatíveis sem descartar a aplicação", async () => {
  const database = await fixture();
  try {
    // Estado deliberadamente desconhecido para provar o bloqueio da recuperação.
    await database.exec("alter table private.course_entities drop constraint course_entities_design_current_v1");
    const base = { ...application, componentRefs: [""] };
    const size = (await database.query("select octet_length($1::jsonb::text) bytes", [JSON.stringify(base)])).rows[0].bytes;
    for (const invalid of [{ mode: "expository", unknown: true }, { ...application, contract: "v999" },
      { ...application, contract: null }, { ...application, componentRefs: ["x".repeat(65530 - size)] }]) {
      await database.exec("delete from private.course_entities");
      await insert(database, "negative", invalid);
      await assert.rejects(database.exec(pre), /contrato desconhecido|forma não corresponde/u);
      await database.exec("rollback");
      assert.deepEqual((await database.query("select design_application from private.course_entities")).rows[0].design_application, invalid);
    }
  } finally { await database.close(); }
});

test("entrada local fora de ordem é restrita ao estado vazio sem retroceder a revisão", async () => {
  const database = await fixture("20260905094109");
  try {
    await insert(database, "requires-recovery", application);
    await assert.rejects(database.exec(pre), /reconciliação/u);
    await database.exec("rollback");
    assert.deepEqual((await database.query("select design_snapshot from private.course_entities")).rows[0].design_snapshot, snapshot);
    await database.exec("delete from private.course_entities");
    await database.exec(pre);
    assert.equal((await database.query("select public.get_aralearn_runtime_manifest()->>'schemaRevision' revision")).rows[0].revision, "20260905094109");
  } finally { await database.close(); }
});
