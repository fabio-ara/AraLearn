import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { compareRuntimeManifest } from "../../scripts/verifyHostedBackend.mjs";
import { pendingUpgradeMigrations } from "../../scripts/verifyBackupRestoreUpgrade.mjs";

const migrationName = "20260907031059_declare_business_conflict_runtime_manifest.sql";
const feature = "course-business-conflicts-http-409-v1";
const expectedRevision = "20260907031059";
const migration = await fs.readFile(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const expected = JSON.parse(await fs.readFile(new URL("../../supabase/runtime-manifest.json", import.meta.url), "utf8"));

async function fixture({ revision = "20260905163000", applied = true, code = "PT409" } = {}) {
  const database = new PGlite();
  const manifest = { schemaRevision: revision, contractVersion: 1,
    features: expected.requiredFeatures.filter((item) => item !== feature).sort() };
  await database.exec(`
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key);
    ${applied ? "insert into supabase_migrations.schema_migrations values('20260907013604');" : ""}
    create role manifest_owner; create role manifest_reader;
    create function public.get_aralearn_runtime_manifest() returns jsonb
      language sql stable security definer set search_path=pg_catalog
      as $$ select '${JSON.stringify(manifest)}'::jsonb $$;
    alter function public.get_aralearn_runtime_manifest() owner to manifest_owner;
    revoke all on function public.get_aralearn_runtime_manifest() from public;
    grant execute on function public.get_aralearn_runtime_manifest() to manifest_reader;
    comment on function public.get_aralearn_runtime_manifest() is 'Preserve this metadata';
    create function public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)
      returns jsonb language plpgsql as $$ begin raise exception 'Synthetic sentinel' using errcode='${code}'; end $$;
    create table public.useful_fixture(id integer primary key, data jsonb);
    insert into public.useful_fixture values(1,'{"draft":"preserve","revision":7,"units":36}');
  `);
  return database;
}

async function snapshot(database) {
  return (await database.query(`select
    public.get_aralearn_runtime_manifest() manifest,
    (select to_jsonb(p)-'prosrc' from pg_proc p where oid='public.get_aralearn_runtime_manifest()'::regprocedure) metadata,
    obj_description('public.get_aralearn_runtime_manifest()'::regprocedure,'pg_proc') comment,
    (select jsonb_agg(to_jsonb(f) order by id) from public.useful_fixture f) data`)).rows[0];
}

test("manifesto PT409 avança somente a revisão/capacidade e conserva identidade, ACL e dados", async () => {
  const database = await fixture();
  try {
    const before = await snapshot(database);
    await database.exec(migration);
    const after = await snapshot(database);
    assert.equal(after.manifest.schemaRevision, expectedRevision);
    assert.equal(after.manifest.contractVersion, 1);
    assert.deepEqual(after.manifest.features, [...before.manifest.features, feature].sort());
    assert.deepEqual(after.metadata, before.metadata);
    assert.equal(after.comment, before.comment);
    assert.deepEqual(after.data, before.data);
    compareRuntimeManifest(expected, after.manifest);
  } finally { await database.close(); }
});

test("manifesto recusa revisão divergente, migration PT409 ausente ou sentinela antiga sem mudar estado", async () => {
  for (const options of [{ revision: "20260905162000" }, { applied: false }, { code: "40001" }]) {
    const database = await fixture(options);
    try {
      const before = await snapshot(database);
      await assert.rejects(database.exec(migration), /manifesto anterior divergiu|contrato PT409 precisa estar aplicado/u);
      await database.exec("rollback");
      assert.deepEqual(await snapshot(database), before);
    } finally { await database.close(); }
  }
});

test("gates exigem a revisão/capacidade PT409 exatas e a cadeia termina na nova declaração", async () => {
  const actual = { schemaRevision: expectedRevision, contractVersion: 1, features: expected.requiredFeatures };
  assert.equal(expected.schemaRevision, expectedRevision);
  assert.ok(expected.requiredFeatures.includes(feature));
  compareRuntimeManifest(expected, actual);
  assert.throws(() => compareRuntimeManifest(expected, { ...actual, schemaRevision: "20260905163000" }), /Aplique as migrations/u);
  assert.throws(() => compareRuntimeManifest(expected, { ...actual, features: actual.features.filter((item) => item !== feature) }), /course-business-conflicts-http-409-v1/u);
  const names = await fs.readdir(new URL("../../supabase/migrations/", import.meta.url));
  const boundary = "20260905163000_canonical_runtime_manifest_features.sql";
  assert.deepEqual(pendingUpgradeMigrations(names, boundary, expectedRevision), [
    "20260907013604_business_conflicts_use_http_409.sql", migrationName
  ]);
  assert.throws(() => pendingUpgradeMigrations(names, boundary, "20260905163000"), /última migration e o manifesto corrente/u);
});
