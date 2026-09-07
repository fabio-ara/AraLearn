import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import { pendingUpgradeMigrations } from "../../scripts/verifyBackupRestoreUpgrade.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = fs.readFileSync(path.join(
  repositoryRoot, "scripts", "verifyBackupRestoreUpgrade.mjs"
), "utf8");
const fixture = fs.readFileSync(path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "restore",
  "course-source-current-state-before-cut.sql"
), "utf8");

test("#274 restauração usa apenas contêineres e bancos descartáveis", () => {
  assert.match(script, /docker[\s\S]+commit[\s\S]+--pause=false/u);
  assert.match(script, /aralearn_restore_source_/u);
  assert.match(script, /aralearn_restore_target_/u);
  assert.match(script, /resetPostgresDatabase\(target\)/u);
  assert.match(script, /pg_dump/u);
  assert.match(script, /pg_restore/u);
  assert.match(script, /finally\s*\{[\s\S]+"rm", "-f", "-v"/u);
  assert.match(script, /"image", "rm", "-f"/u);
  assert.doesNotMatch(script, /--linked|db reset|supabase stop/u);
});

test("#307 restauração preserva o checkpoint histórico e continua até o manifesto corrente", () => {
  const cut = script.indexOf("20260902044404_cut_legacy_authoring_runtime.sql");
  const actionOrigin = script.indexOf(
    "20260902123759_drop_legacy_chat_openai_action_origin.sql"
  );
  const focalCorrection = script.indexOf(
    "20260902160602_preserve_course_design_on_focal_mcp_corrections.sql"
  );
  const analyticsApplicability = script.indexOf(
    "20260902180219_count_expository_parameter_usage_in_analytics.sql"
  );
  const actionCallback = script.indexOf(
    "20260902234800_bind_real_chatgpt_action_callback.sql"
  );
  const pdfLifecycleHardening = script.indexOf(
    "20260903025658_harden_course_source_pdf_lifecycle.sql"
  );
  assert.ok(cut >= 0 && actionOrigin > cut && focalCorrection > actionOrigin &&
    analyticsApplicability > focalCorrection && actionCallback > analyticsApplicability &&
    pdfLifecycleHardening > actionCallback);
  assert.match(script, /values\.migrations\.push\(\.\.\.defaultMigrations\)/u);
  assert.match(script, /const preCutMigrations = migrationsBefore\(resolved\.migrations\[0\]\)/u);
  assert.match(script, /applyMigrationFiles\([\s\S]+pre-cut-migrations-/u);
  assert.match(script, /\(\?:001\|\\d\{14\}\)/u);
  assert.match(script, /cloneDatabase\(resolved\.sourceContainer, source\)/u);
  assert.match(script, /resetDisposableApplicationState\(source, resolved\.migrations\[0\]\)/u);
  assert.match(script, /drop schema if exists private cascade/u);
  assert.match(script, /drop schema if exists public cascade/u);
  assert.match(script, /where schemaname='storage'/u);
  assert.match(script, /delete from supabase_migrations\.schema_migrations/u);
  assert.match(script, /recordAppliedMigration\(restored, migration\)/u);
  assert.match(script, /state\.migrationRevision, expectedManifestRevision/u);
  assert.match(script, /for \(const \[index, migration\] of resolved\.migrations\.entries\(\)\)/u);
  assert.match(script, /assertAfterState\(after\.state, migrationNames\.at\(-1\)/u);
  assert.match(script, /aralearn\.backup-restore-upgrade-proof\.v3/u);
});

test("preparação histórica clona somente schema, mas a restauração do backup permanece integral", async () => {
  const calls = [];
  const context = vm.createContext({
    resetPostgresDatabase: async (target) => calls.push(["reset", target]),
    pipeProcesses: async (...args) => calls.push(structuredClone(args))
  });
  const clone = script.slice(script.indexOf("async function cloneDatabase("),
    script.indexOf("function resetDisposableApplicationState("));
  const restore = script.slice(script.indexOf("async function restoreBackupFile("),
    script.indexOf("function copyAndApply("));
  vm.runInContext(`${clone}\n${restore}`, context);
  await context.cloneDatabase("local-current", "synthetic-history");
  assert.deepEqual(calls[0], ["reset", "synthetic-history"]);
  assert.ok(calls[1][1].includes("--schema-only"));
  assert.ok(calls[1][3].includes("--exit-on-error"));
  calls.length = 0;
  await context.restoreBackupFile("synthetic-history", "/tmp/proof.dump", "restored-proof");
  assert.deepEqual(calls[0], ["reset", "restored-proof"]);
  assert.deepEqual(calls[1], ["docker", ["exec", "synthetic-history", "cat", "/tmp/proof.dump"],
    "docker", ["exec", "-i", "restored-proof", "pg_restore", "-U", "supabase_admin", "-d", "postgres",
      "--no-owner", "--exit-on-error"]]);
  const proof = script.slice(script.indexOf("export async function verifyBackupRestoreUpgrade("));
  assert.match(proof, /"pg_dump"[\s\S]*?"-Fc", "--no-owner", "-f", backupPath/u);
  assert.doesNotMatch(proof, /--schema-only|--exclude-table-data|--disable-triggers/u);
});

test("história pré-corte é registrada pela cadeia reaplicada, incluindo migration 001", () => {
  const calls = [];
  const context = vm.createContext({ path, command: (...args) => calls.push(structuredClone(args)),
    migrationDirectory: "/repo/supabase/migrations" });
  const apply = script.slice(script.indexOf("function applyMigrationFiles("),
    script.indexOf("async function restoreBackupFile("));
  const record = script.slice(script.indexOf("function recordAppliedMigration("),
    script.indexOf("function queryJson("));
  vm.runInContext(`${apply}\n${record}`, context);
  const names = ["001_initial.sql", "20260901000000_checkpoint.sql"];
  context.applyMigrationFiles("synthetic-history", names, "/tmp/history");
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[1][1].slice(-4), ["-f", "/tmp/history/001_initial.sql", "-f", "/tmp/history/20260901000000_checkpoint.sql"]);
  assert.match(calls[2][1].at(-1), /values\('001',null,'initial'\)/u);
  assert.match(calls[3][1].at(-1), /values\('20260901000000',null,'checkpoint'\)/u);
  assert.throws(() => context.recordAppliedMigration("synthetic-history", "001bad_invalid.sql"), /Migration final inválida/u);
});

test("#307 upgrade ordena todas as migrations pendentes e repetir a seleção não reaplica SQL", () => {
  const first = "20260903025658_checkpoint.sql";
  const middle = "20260905094108_preservation.sql";
  const last = "20260905162000_current.sql";
  const names = [last, first, middle];
  assert.deepEqual(pendingUpgradeMigrations(names, first, "20260905162000"), [middle, last]);
  assert.deepEqual(pendingUpgradeMigrations(names, first, "20260905162000", ["20260905162000"]), [middle]);
  assert.deepEqual(pendingUpgradeMigrations(names, first, "20260905162000", [
    "20260903025658", "20260905094108", "20260905162000"
  ]), []);
});

test("#307 upgrade recusa manifesto divergente, origem ausente e histórias malformadas", () => {
  const first = "20260903025658_checkpoint.sql";
  const last = "20260905162000_current.sql";
  for (const args of [
    [[first, last], first, "20260903025658"],
    [[first, last], first, "20260906162000"],
    [[last], first, "20260905162000"],
    [[first, last, last], first, "20260905162000"],
    [[first, last, "20260905162000_duplicate.sql"], first, "20260905162000"],
    [[first, "../../outside.sql"], first, "20260905162000"],
    [[first, last], first, "20260905162000", ["20260906162000"]],
    [[first, last], first, "20260905162000", [null]]
  ]) assert.throws(() => pendingUpgradeMigrations(...args), TypeError);
});

test("#274 fixture cobre estado útil e resíduos encerrados para o corte", () => {
  for (const object of [
    "course_instructional_plans",
    "course_instructional_plan_items",
    "course_authoring_parts",
    "course_design_parameter_changes",
    "course_authoring_part_materializations",
    "course_authoring_part_materialization_steps",
    "course_source_revisions",
    "course_source_anchor_revisions",
    "course_source_attributions",
    "course_source_attachments",
    "course_source_pdf_upload_intents",
    "course_source_pdf_delete_intents",
    "course_anchored_annotations",
    "course_change_receipts"
  ]) assert.match(fixture, new RegExp(`(?:into|update) private\\.${object}`, "u"), object);
  assert.match(fixture, /'instructional_analysis_unit'/u);
  assert.match(fixture, /'evidence_requirement'/u);
  assert.match(fixture, /'active',1/u);
  assert.match(fixture, /'removed',2/u);
  assert.match(fixture, /'open',null,1/u);
  assert.match(fixture, /'resolved',now\(\)-interval '1 hour',2/u);
  assert.match(fixture, /restore\.receipt\.live/u);
  assert.match(fixture, /restore\.receipt\.expired/u);
  assert.match(fixture, /restore\.upload\.live/u);
  assert.match(fixture, /restore\.upload\.expired/u);
  assert.match(fixture, /repeat\('legacy-ref-',26\)\|\|'end'/u);
  assert.match(fixture, /'unresolved_legacy'/u);
  assert.match(fixture, /'legacy_reference'/u);
  assert.match(script, /importedLegacySource/u);
  assert.match(script, /citationPreserved/u);
  assert.match(script, /needs_verification/u);
  assert.match(script, /legacySourceEnums/u);
  assert.doesNotMatch(fixture, /(?:insert\s+into|update|delete\s+from) storage\./iu);
});

test("#274 mede redução técnica e registra a fronteira do backup de Storage", () => {
  for (const measure of [
    "buckets", "storageObjectPolicies", "pdfStoragePolicies", "sourceTables",
    "sourceColumns", "sourceIndexes", "sourceConstraints", "sourceTriggers",
    "sourceFunctions"
  ]) assert.match(script, new RegExp(`'${measure}'`, "u"), measure);
  assert.match(script, /databaseBackupContainsMetadataOnly/u);
  assert.match(script, /objectRecoveryRequiresStorageBackup:\s*true/u);
});
