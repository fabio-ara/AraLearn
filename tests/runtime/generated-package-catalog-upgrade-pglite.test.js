import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { COURSE_COMPONENT_CATALOG } from "../../src/domain/courseDesignParameters.js";
import { checkResourcePackageCatalog } from "../../scripts/syncResourcePackageCatalog.mjs";

const migration = await fs.readFile(new URL(
  "../../supabase/migrations/20260905091101_generated_resource_package_catalog.sql", import.meta.url), "utf8");
const correction = await fs.readFile(new URL(
  "../../supabase/migrations/20260905092640_deduplicate_rich_paragraph_catalog.sql", import.meta.url), "utf8");
const audioMigration = await fs.readFile(new URL(
  "../../supabase/migrations/20260905114027_course_audio_media.sql", import.meta.url), "utf8");
const historicalCatalog = JSON.parse(correction.match(/as \$catalog\$ select '((?:[^']|'')+)'::jsonb \$catalog\$/u)[1].replaceAll("''", "'"));
const quote = (value) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";

async function previousDatabase({ extraRef = false, revision = "20260905083846" } = {}) {
  const database = new PGlite();
  const options = structuredClone(historicalCatalog.options);
  if (extraRef) options.push({ ref: "aralearn.resource.removed@1.0.0", label: "Anterior", purpose: "Prova negativa." });
  const policy = { catalogVersion: "1-4616b2e5", availability: "all", allowedRefs: [], excludedRefs: [], preferredRefs: [] };
  const snapshot = { contract: "aralearn.study-unit-design-snapshot.v2", parameters: [{ value: 3, reason: "Decisão anterior." }],
    componentPolicy: { policy, effectiveRefs: [options[0].ref], origin: "research_condition" } };
  await database.exec(`
    create schema private;
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql as $$
      select ${quote({ schemaRevision: revision, features: ["existing"] })} $$;
    create function private.course_component_catalog_v1() returns jsonb language sql immutable as $$
      select ${quote({ version: "1-4616b2e5", options })} $$;
    create function private.valid_course_component_policy_v1(policy jsonb) returns boolean language sql stable as $$
      select policy->>'catalogVersion'=private.course_component_catalog_v1()->>'version' $$;
    create table private.course_component_policy_assignments(
      id integer primary key, policy jsonb, origin text, reason text, updated_at timestamptz default '2026-09-01',
      constraint course_component_policy_assignments_policy_v1 check(private.valid_course_component_policy_v1(policy)));
    create table private.course_entities(entity_id text primary key,entity_type text,content jsonb,design_snapshot jsonb,version bigint);
    create table private.unrelated_recovery_fixture(id integer, draft jsonb, receipt jsonb);
    insert into private.course_component_policy_assignments(id,policy,origin,reason) values
      (1,${quote(policy)},'author','Escolha preservada.'),
      (2,${quote(policy)},'research_condition','Condição preservada.'),
      (3,${quote({ ...policy, availability: "allow_only", allowedRefs: [options[0].ref] })},'automatic','Razão preservada.');
    insert into private.course_entities values('unit-existing','study_unit',
      '{"content":[{"id":"paragraph-existing","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Texto anterior."}}]}',${quote(snapshot)},7);
    insert into private.unrelated_recovery_fixture values(1,'{"draft":"alteração não salva"}','{"requestId":"receipt-existing"}');
  `);
  return database;
}

test("catálogo SQL gerado acompanha registro e migra só metadados compatíveis", async () => {
  checkResourcePackageCatalog(process.cwd());
  const database = await previousDatabase();
  try {
    const before = (await database.query("select * from private.course_component_policy_assignments order by id")).rows;
    const entityBefore = (await database.query("select * from private.course_entities")).rows[0];
    const recoveryBefore = (await database.query("select * from private.unrelated_recovery_fixture")).rows;
    await database.exec(migration);
    await database.exec(correction);
    assert.deepEqual((await database.query("select private.course_component_catalog_v1() catalog")).rows[0].catalog, historicalCatalog);
    const after = (await database.query("select * from private.course_component_policy_assignments order by id")).rows;
    assert.deepEqual(after, before.map((row) => ({ ...row, policy: { ...row.policy, catalogVersion: historicalCatalog.version } })));
    const entityAfter = (await database.query("select * from private.course_entities")).rows[0];
    assert.deepEqual(entityAfter, entityBefore);
    assert.deepEqual((await database.query("select * from private.unrelated_recovery_fixture")).rows, recoveryBefore);
    assert.deepEqual((await database.query("select public.get_aralearn_runtime_manifest() manifest")).rows[0].manifest,
      { schemaRevision: "20260905092640", features: ["existing"] });
    await assert.rejects(database.exec("insert into private.course_component_policy_assignments(id,policy) values(4,'{\"catalogVersion\":\"unexpected\"}')"), /check constraint/u);
  } finally { await database.close(); }
});

test("extensão áudio e ferramentas atualiza catálogo/política corrente e preserva decisão histórica literal", async () => {
  const database = await previousDatabase();
  try {
    await database.exec(migration);
    await database.exec(correction);
    const beforePolicy = (await database.query("select * from private.course_component_policy_assignments order by id")).rows;
    const beforeEntities = (await database.query("select * from private.course_entities")).rows;
    const beforeRecovery = (await database.query("select * from private.unrelated_recovery_fixture")).rows;
    const start = audioMigration.indexOf("lock table private.course_component_policy_assignments in access exclusive mode;");
    const end = audioMigration.indexOf("-- Snapshots e aplicações históricos", start);
    assert.ok(start >= 0 && end > start);
    await database.exec(`begin;\n${audioMigration.slice(start, end)}\ncommit;`);
    assert.deepEqual((await database.query("select private.course_component_catalog_v1() catalog")).rows[0].catalog, COURSE_COMPONENT_CATALOG);
    assert.deepEqual((await database.query("select * from private.course_component_policy_assignments order by id")).rows,
      beforePolicy.map(row => ({ ...row, policy: { ...row.policy, catalogVersion: COURSE_COMPONENT_CATALOG.version } })));
    assert.deepEqual((await database.query("select * from private.course_entities")).rows, beforeEntities);
    assert.deepEqual((await database.query("select * from private.unrelated_recovery_fixture")).rows, beforeRecovery);
  } finally { await database.close(); }
});

test("corretiva exige fingerprint anterior exato antes de substituir a projeção", async () => {
  const database = await previousDatabase();
  try {
    await database.exec(migration);
    await database.exec(`create or replace function private.course_component_catalog_v1() returns jsonb language sql immutable as $$
      select ${quote({ ...COURSE_COMPONENT_CATALOG, schemaFingerprint: "sha256:" + "0".repeat(64) })} $$`);
    await assert.rejects(database.exec(correction), /contrato divergiu/u);
    await database.exec("rollback");
    assert.equal((await database.query("select public.get_aralearn_runtime_manifest()->>'schemaRevision' revision")).rows[0].revision, "20260905091101");
  } finally { await database.close(); }
});

test("upgrade compatível recusa referência removida ou runtime inesperado sem mudança parcial", async () => {
  for (const options of [{ extraRef: true }, { revision: "unknown" }]) {
    const database = await previousDatabase(options);
    try {
      await assert.rejects(database.exec(migration), /referências|divergiu/u);
      await database.exec("rollback");
      assert.equal((await database.query("select private.course_component_catalog_v1()->>'version' version")).rows[0].version, "1-4616b2e5");
      assert.equal((await database.query("select public.get_aralearn_runtime_manifest()->>'schemaRevision' revision")).rows[0].revision, options.revision || "20260905083846");
    } finally { await database.close(); }
  }
});
