import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { COURSE_COMPONENT_CATALOG } from "../../src/domain/courseDesignParameters.js";
import { checkResourcePackageCatalog } from "../../scripts/syncResourcePackageCatalog.mjs";
import { componentPolicyIntegritySql } from "../../scripts/verifyBackupRestoreUpgrade.mjs";

const migration = await fs.readFile(new URL(
  "../../supabase/migrations/20260905091101_generated_resource_package_catalog.sql", import.meta.url), "utf8");
const correction = await fs.readFile(new URL(
  "../../supabase/migrations/20260905092640_deduplicate_rich_paragraph_catalog.sql", import.meta.url), "utf8");
const audioMigration = await fs.readFile(new URL(
  "../../supabase/migrations/20260905114027_course_audio_media.sql", import.meta.url), "utf8");
const historicalCatalog = JSON.parse(correction.match(/as \$catalog\$ select '((?:[^']|'')+)'::jsonb \$catalog\$/u)[1].replaceAll("''", "'"));
// O catálogo congelado da migração de áudio precede a descoberta de hub/repetidor.
const audioCatalog = JSON.parse(audioMigration.match(/as \$catalog\$ select '((?:[^']|'')+)'::jsonb \$catalog\$/u)[1].replaceAll("''", "'"));
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

test("extensão áudio e ferramentas atualiza catálogo/política daquela revisão e preserva decisão histórica literal", async () => {
  assert.equal(audioCatalog.version, "1-5f0fd13d");
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
    assert.deepEqual((await database.query("select private.course_component_catalog_v1() catalog")).rows[0].catalog, audioCatalog);
    assert.deepEqual((await database.query("select * from private.course_component_policy_assignments order by id")).rows,
      beforePolicy.map(row => ({ ...row, policy: { ...row.policy, catalogVersion: audioCatalog.version } })));
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

// A correção incremental do autoíndice não regrava conteúdo, decisões ou políticas.
const networkMigration = await fs.readFile(new URL(
  "../../supabase/migrations/20260908000533_refresh_network_component_catalog.sql", import.meta.url), "utf8");
const fingerprintMigration = await fs.readFile(new URL(
  "../../supabase/migrations/20260908023156_refresh_generated_package_fingerprint.sql", import.meta.url), "utf8");
const catalogFrom = (source) => JSON.parse(source.match(/as \$catalog\$ select '((?:[^']|'')+)'::jsonb \$catalog\$/u)[1].replaceAll("''", "'"));
const networkCatalog = catalogFrom(networkMigration);
const fingerprintCatalog = catalogFrom(fingerprintMigration);

async function fingerprintDatabase({ revision = "20260908020737", catalog = networkCatalog } = {}) {
  const database = new PGlite();
  await database.exec(`
    create schema private;
    create role catalog_reader;
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql as $$
      select ${quote({ schemaRevision: revision, contractVersion: 1, features: ["existing"] })} $$;
    create function private.course_component_catalog_v1() returns jsonb
      language sql immutable security definer set search_path=pg_catalog as $$ select ${quote(catalog)} $$;
    revoke all on function private.course_component_catalog_v1() from public;
    grant execute on function private.course_component_catalog_v1() to catalog_reader;
    create table private.catalog_preservation_fixture(id integer primary key, value jsonb);
    insert into private.catalog_preservation_fixture values(1,${quote({
      policy: { catalogVersion: networkCatalog.version, availability: "all" },
      content: { title: "Conteúdo sintético preservado" },
      designSnapshot: { catalogVersion: "historical", reason: "Escolha aplicada anterior." },
      contentReview: null, requestId: "synthetic-existing-receipt"
    })});
  `);
  return database;
}

async function fingerprintSnapshot(database) {
  return (await database.query(`select private.course_component_catalog_v1() catalog,
    public.get_aralearn_runtime_manifest() manifest,
    (select to_jsonb(p)-'prosrc' from pg_proc p where oid='private.course_component_catalog_v1()'::regprocedure) metadata,
    (select jsonb_agg(to_jsonb(f) order by id) from private.catalog_preservation_fixture f) useful`)).rows[0];
}

test("impressão regenerada altera só fingerprint e manifesto, preservando opções, ACL e dados úteis", async () => {
  const database = await fingerprintDatabase();
  try {
    const before = await fingerprintSnapshot(database);
    await database.exec(fingerprintMigration);
    const after = await fingerprintSnapshot(database);
    assert.deepEqual(after.catalog, fingerprintCatalog);
    assert.deepEqual({ ...after.catalog, schemaFingerprint: before.catalog.schemaFingerprint }, before.catalog);
    assert.notEqual(after.catalog.schemaFingerprint, before.catalog.schemaFingerprint);
    assert.deepEqual(after.metadata, before.metadata);
    assert.deepEqual(after.useful, before.useful);
    assert.deepEqual(after.manifest, { ...before.manifest, schemaRevision: "20260908023156" });
  } finally { await database.close(); }
});

test("impressão regenerada recusa origem divergente e alteração incidental de opções sem aplicação parcial", async () => {
  for (const options of [{ revision: "unexpected" },
    { catalog: { ...networkCatalog, schemaFingerprint: "sha256:" + "0".repeat(64) } },
    { catalog: { ...networkCatalog, options: networkCatalog.options.slice(1) } }]) {
    const database = await fingerprintDatabase(options);
    try {
      const before = await fingerprintSnapshot(database);
      await assert.rejects(database.exec(fingerprintMigration), /divergiu|preservar versão, opções/u);
      await database.exec("rollback");
      assert.deepEqual(await fingerprintSnapshot(database), before);
    } finally { await database.close(); }
  }
});

const reconciliationName = "20260929100247_reconcile_component_policy_catalog_versions.sql";
const migrationDirectory = new URL("../../supabase/migrations/", import.meta.url);
const readMigration = name => fs.readFile(new URL(name, migrationDirectory), "utf8");
const reconciliation = await readMigration(reconciliationName);
const v7Migration = await readMigration("20260924172159_revisao_v7_component_removal.sql");
const v7Catalog = catalogFrom(v7Migration);
const currentPolicyCatalog = catalogFrom(await readMigration("20260928100000_revisao_v10_bpmn_inspection_runtime.sql"));
const validator = (await readMigration("20260903193000_add_open_response_component.sql"))
  .match(/create or replace function private\.valid_course_component_policy_v1\(p_policy jsonb\)[\s\S]*?\$function\$;/u)[0];
const policyTable = (await readMigration("20260902044404_cut_legacy_authoring_runtime.sql"))
  .match(/create table private\.course_component_policy_assignments\([\s\S]*?\n\);/u)[0]
  .replace(/constraint course_component_policy_assignments_policy_v1 check\([\s\S]*?\n {2}\)/u,
    "constraint course_component_policy_assignments_policy_v1 check(private.valid_course_component_policy_v1(policy) and octet_length(policy::text)<=4096)");
const syntheticCourse = "10000000-0000-4000-8000-000000000001";
const paragraphRef = "aralearn.resource.paragraph@1.0.0";
const choiceRef = "aralearn.response.choice@1.0.0";
const setCatalog = catalog => `create or replace function private.course_component_catalog_v1() returns jsonb
  language sql immutable security definer set search_path=pg_catalog as $$ select ${quote(catalog)} $$;`;

async function policyDatabase({ versions = [v7Catalog.version, "1-96666628", currentPolicyCatalog.version],
  unknownRef = false, nullAvailability = false, revision = "20260929082030" } = {}) {
  const db = new PGlite();
  await db.exec(`create schema private; create role policy_reader;
    create function public.get_aralearn_runtime_manifest() returns jsonb
      language sql stable security definer set search_path=pg_catalog as $$
      select ${quote({ schemaRevision: revision, contractVersion: 1, features: ["synthetic-feature"] })} $$;
    ${setCatalog(v7Catalog)}
    ${validator}
    create table public.courses(id uuid primary key,revision bigint,updated_at timestamptz);
    insert into public.courses values('${syntheticCourse}',17,'2026-09-01');
    ${policyTable}
    alter table private.course_component_policy_assignments enable row level security;
    alter table private.course_component_policy_assignments force row level security;
    grant select on private.course_component_policy_assignments to policy_reader;
    revoke all on function private.course_component_catalog_v1(),private.valid_course_component_policy_v1(jsonb),
      public.get_aralearn_runtime_manifest() from public;
    grant execute on function private.course_component_catalog_v1(),private.valid_course_component_policy_v1(jsonb),
      public.get_aralearn_runtime_manifest() to policy_reader;
    create table private.course_entities(entity_id text,content jsonb,design_snapshot jsonb,version bigint);
    insert into private.course_entities values('synthetic-unit','{"text":"Conteúdo preservado"}',
      '{"componentPolicy":{"catalogVersion":"historical","reason":"Decisão aplicada preservada"}}',9);
    create table private.course_change_receipts(request_id text,result jsonb);
    insert into private.course_change_receipts values('synthetic-receipt','{"courseRevision":17,"applied":true}');`);
  for (const [index, version] of versions.entries()) {
    const oldCatalog = { ...v7Catalog, version, options: [...v7Catalog.options] };
    if (unknownRef) oldCatalog.options.push({ ref: "synthetic.removed@1.0.0" });
    await db.exec(setCatalog(oldCatalog));
    const policy = { catalogVersion: version, availability: index === 0 ? "all" : "allow_only",
      allowedRefs: index === 0 ? [] : [paragraphRef, choiceRef], excludedRefs: ["aralearn.resource.table@1.0.0"],
      preferredRefs: [unknownRef ? "synthetic.removed@1.0.0" : paragraphRef] };
    if (nullAvailability) policy.availability = null;
    if (unknownRef && index !== 0) policy.allowedRefs.push("synthetic.removed@1.0.0");
    await db.query(`insert into private.course_component_policy_assignments
      (course_id,scope_kind,scope_ref,policy,origin,reason,updated_at) values($1,$2,$3,$4,$5,$6,'2026-09-01')`,
    [syntheticCourse, index === 0 ? "course" : "didactic_microsequence", index === 0 ? syntheticCourse : `synthetic-ms-${index}`,
      policy, index === 0 ? "author" : "research_condition", `Razão sintética ${index}, com 'aspas' e\nlinha preservada.`]);
  }
  await db.exec(setCatalog(currentPolicyCatalog));
  return db;
}

async function policySnapshot(db) {
  return (await db.query(`select
    (select coalesce(jsonb_agg(to_jsonb(p) order by scope_kind,scope_ref),'[]'::jsonb) from private.course_component_policy_assignments p) policies,
    (select jsonb_agg(to_jsonb(c) order by id) from public.courses c) courses,
    (select jsonb_agg(to_jsonb(e) order by entity_id) from private.course_entities e) entities,
    (select jsonb_agg(to_jsonb(r) order by request_id) from private.course_change_receipts r) receipts,
    (select jsonb_agg(to_jsonb(c) order by conname) from pg_constraint c where conrelid='private.course_component_policy_assignments'::regclass) constraints,
    (select jsonb_build_object('owner',relowner,'acl',relacl,'rls',relrowsecurity,'forceRls',relforcerowsecurity)
      from pg_class where oid='private.course_component_policy_assignments'::regclass) relation,
    (select jsonb_agg(to_jsonb(p)-'prosrc' order by proname) from pg_proc p
      where oid in ('private.course_component_catalog_v1()'::regprocedure,'private.valid_course_component_policy_v1(jsonb)'::regprocedure,
        'public.get_aralearn_runtime_manifest()'::regprocedure)) functions,
    private.course_component_catalog_v1() catalog, public.get_aralearn_runtime_manifest() manifest`)).rows[0];
}

test("reconciliação preserva todas as escolhas, CHECK/ACL, snapshots e recibos; reaplicação não regrava linhas", async () => {
  const db = await policyDatabase();
  try {
    const before = await policySnapshot(db);
    assert.equal((await db.query(componentPolicyIntegritySql)).rows[0].jsonb_build_object.invalid, 2);
    await db.exec(reconciliation);
    const after = await policySnapshot(db);
    assert.deepEqual(after, { ...before,
      policies: before.policies.map(row => ({ ...row, policy: { ...row.policy, catalogVersion: currentPolicyCatalog.version } })),
      manifest: { ...before.manifest, schemaRevision: "20260929100247" } });
    const xmins = () => db.query("select xmin::text from private.course_component_policy_assignments order by scope_kind,scope_ref");
    const rowVersions = (await xmins()).rows;
    await db.exec(reconciliation);
    assert.deepEqual(await policySnapshot(db), after);
    assert.deepEqual((await xmins()).rows, rowVersions);
    assert.equal((await db.query(componentPolicyIntegritySql)).rows[0].jsonb_build_object.invalid, 0);
    for (const policy of [
      { ...after.policies[0].policy, catalogVersion: v7Catalog.version },
      { ...after.policies[0].policy, preferredRefs: ["synthetic.invalid@1.0.0"] },
      { ...after.policies[0].policy, preferredRefs: [paragraphRef, paragraphRef] },
      { ...after.policies[0].policy, excludedRefs: [paragraphRef] },
      { ...after.policies[0].policy, allowedRefs: null },
      { ...after.policies[0].policy, availability: "allow_only", allowedRefs: [] }
    ]) {
      await assert.rejects(db.query("update private.course_component_policy_assignments set policy=$1 where scope_kind='course'", [policy]), /check constraint/u);
      assert.deepEqual(await policySnapshot(db), after);
    }
  } finally { await db.close(); }
});

test("reconciliação recusa versão desconhecida/NULL, referência removida ou catálogo/runtime divergente sem reparar dados", async () => {
  for (const options of [{ versions: ["unknown"] }, { versions: [null] }, { unknownRef: true },
    { nullAvailability: true, versions: [v7Catalog.version] },
    { revision: "unexpected" }, { fingerprint: "unexpected" }]) {
    const db = await policyDatabase(options);
    try {
      if (options.fingerprint) await db.exec(setCatalog({ ...currentPolicyCatalog, schemaFingerprint: options.fingerprint }));
      const before = await policySnapshot(db);
      if (options.nullAvailability) assert.equal((await db.query(`select private.valid_course_component_policy_v1(
        jsonb_set(policy,'{catalogVersion}',private.course_component_catalog_v1()->'version',false)) result
        from private.course_component_policy_assignments`)).rows[0].result, null,
      "O preflight exige IS TRUE mesmo quando um CHECK aceitaria o resultado SQL NULL.");
      await assert.rejects(db.exec(reconciliation), /divergiu|reconciliação exclusiva/u);
      await db.exec("rollback");
      assert.deepEqual(await policySnapshot(db), before);
    } finally { await db.close(); }
  }
});

test("reconciliação admite instalação sem políticas sem fabricar decisões", async () => {
  const db = await policyDatabase({ versions: [] });
  try {
    const before = await policySnapshot(db);
    await db.exec(reconciliation);
    assert.deepEqual(await policySnapshot(db), { ...before, manifest: { ...before.manifest, schemaRevision: "20260929100247" } });
  } finally { await db.close(); }
});

test("fixture do upgrade preenche os dois escopos sob o CHECK real e participa da verificação final", async () => {
  const db = await policyDatabase({ versions: [] });
  try {
    const source = await fs.readFile(new URL("../fixtures/restore/contextual-state-before-354.sql", import.meta.url), "utf8");
    const start = source.indexOf("-- Atravessa as mudanças de catálogo");
    assert.ok(start >= 0);
    await db.exec("insert into public.courses values('74540000-0000-4000-8000-000000000101',23,'2026-09-08')");
    await db.exec(source.slice(start, source.indexOf("\\if", start)));
    assert.deepEqual((await db.query(componentPolicyIntegritySql)).rows[0].jsonb_build_object,
      { total: 2, invalid: 0, scopes: ["course", "didactic_microsequence"] });
    const before = await policySnapshot(db);
    await db.exec(reconciliation);
    const after = await policySnapshot(db);
    assert.deepEqual(after.policies, before.policies);
    assert.deepEqual(after.courses, before.courses);
  } finally { await db.close(); }
});

test("traversal dos catálogos detecta políticas antigas inválidas e exige reconciliação até a última revisão", async () => {
  const db = await policyDatabase({ versions: [v7Catalog.version, v7Catalog.version] });
  try {
    await db.exec(setCatalog(v7Catalog));
    const before = await policySnapshot(db);
    const names = (await fs.readdir(migrationDirectory)).filter(name => name.endsWith(".sql") && name > "20260924172159_revisao_v7_component_removal.sql").sort();
    let catalogChanges = 0;
    for (const name of names) {
      const source = await readMigration(name);
      if (name === reconciliationName) {
        const broken = (await db.query(componentPolicyIntegritySql)).rows[0].jsonb_build_object;
        assert.equal(broken.invalid, 2, "Sem reconciliação, as duas políticas precisam expor o defeito histórico.");
        assert.deepEqual(broken.scopes, ["course", "didactic_microsequence"]);
      }
      // Executa a reconciliação inteira. Migrações de catálogo sem reconciliação
      // contribuem seu bloco real; as demais mudanças de domínio não são simuladas.
      if (/\b(?:update|lock table)\s+private\.course_component_policy_assignments/iu.test(source)) await db.exec(source);
      else if (source.includes("-- RESOURCE_PACKAGE_CATALOG_BEGIN")) {
        await db.exec(source.match(/-- RESOURCE_PACKAGE_CATALOG_BEGIN[\s\S]*?-- RESOURCE_PACKAGE_CATALOG_END/u)[0]);
        catalogChanges += 1;
      }
    }
    assert.ok(catalogChanges >= 2);
    assert.equal((await db.query(componentPolicyIntegritySql)).rows[0].jsonb_build_object.invalid, 0,
      "Toda mudança futura de catálogo precisa terminar com as políticas persistidas válidas.");
    const after = await policySnapshot(db);
    assert.deepEqual(after.policies.map(row => ({ ...row, policy: { ...row.policy, catalogVersion: v7Catalog.version } })), before.policies);
    assert.deepEqual(after.courses, before.courses);
    assert.deepEqual(after.entities, before.entities);
    assert.deepEqual(after.receipts, before.receipts);
  } finally { await db.close(); }
});
