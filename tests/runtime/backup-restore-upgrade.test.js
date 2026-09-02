import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
