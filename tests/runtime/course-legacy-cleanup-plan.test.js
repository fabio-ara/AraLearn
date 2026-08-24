import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildLegacyCleanupPlan,
  buildLegacyCleanupSnapshotSql,
  buildPdfOrphanRemovalPlan,
  generateLegacyCleanupSql,
  LEGACY_CLEANUP_CONTRACTS,
  LEGACY_DATABASE_OBJECT_COUNT,
  LEGACY_STORAGE_BUCKETS,
  scanLegacyRuntimeConsumers,
  sha256Canonical
} from "../../scripts/courseCutover/legacyCleanupPlan.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const parityInventory = JSON.parse(await fs.readFile(path.join(
  repositoryRoot,
  "docs/evidence/paridade-vertical-banco.v1.json"
), "utf8"));
const finalManifest = JSON.parse(await fs.readFile(path.join(
  repositoryRoot,
  "supabase/runtime-manifest.json"
), "utf8"));
const legacyTargets = JSON.parse(await fs.readFile(path.join(
  repositoryRoot,
  "scripts/courseCutover/legacyCleanupTargets.v1.json"
), "utf8"));

function fixture() {
  const tables = parityInventory.objects
    .filter(({ caseId, object }) =>
      caseId === "pre-course-database-removal" && object.startsWith("table:")
    )
    .map(({ object }) => ({
      table: object.slice("table:".length),
      rowCount: object === "table:public.legacy_catalog_courses" ? 8 : 0,
      rowFingerprint: "0".repeat(32)
    }));
  const legacyCatalogCourses = [1, 2, 3, 4].map((number) => ({
    id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    classification: "deleted_unlinked_tombstone",
    deletedAt: "2026-08-20T00:00:00.000Z",
    rowFingerprint: String(number).repeat(32)
  }));
  const catalogSnapshot = {
    contract: LEGACY_CLEANUP_CONTRACTS.snapshot,
    schemaRevision: finalManifest.schemaRevision,
    databaseManifest: {
      schemaRevision: finalManifest.schemaRevision,
      contractVersion: finalManifest.contractVersion,
      features: finalManifest.requiredFeatures
    },
    objects: parityInventory.objects
      .filter(({ caseId }) => caseId !== "pre-course-database-removal")
      .map(({ object }) => object)
      .concat(legacyTargets.objects)
      .sort(),
    tables,
    consumers: [],
    dependencies: [],
    legacyCatalogCourses,
    courseSourcePdfAttachments: [],
    courseSourcePdfObjects: []
  };
  const runtimeConsumers = {
    contract: LEGACY_CLEANUP_CONTRACTS.runtimeConsumers,
    finalManifestHash: sha256Canonical(finalManifest),
    parityInventoryHash: sha256Canonical(parityInventory),
    legacyTargetsHash: sha256Canonical(legacyTargets),
    filesHash: "a".repeat(64),
    matches: []
  };
  const backupManifest = {
    contract: LEGACY_CLEANUP_CONTRACTS.backup,
    finalManifestHash: sha256Canonical(finalManifest),
    parityInventoryHash: sha256Canonical(parityInventory),
    legacyTargetsHash: sha256Canonical(legacyTargets),
    catalogSnapshotHash: sha256Canonical(catalogSnapshot),
    runtimeConsumerEvidenceHash: sha256Canonical(runtimeConsumers),
    databaseRestoreCatalogHash: "b".repeat(64),
    sourceDatabaseFingerprint: "c".repeat(64),
    tableProfiles: tables,
    legacyCatalogCourses,
    storageBuckets: LEGACY_STORAGE_BUCKETS.map((id) => ({
      id,
      verified: true,
      objects: []
    })),
    courseSourcePdfObjects: [],
    verification: { status: "verified", verifiedAt: "2026-08-20T01:00:00.000Z" }
  };
  const smokeAttestation = {
    contract: LEGACY_CLEANUP_CONTRACTS.smoke,
    status: "passed",
    finalManifestHash: sha256Canonical(finalManifest),
    testedAt: "2026-08-20T01:30:00.000Z",
    checks: ["API de Curso", "MCP de Autoria", "Estudo"]
  };
  return {
    parityInventory,
    legacyTargets,
    finalManifest,
    catalogSnapshot,
    runtimeConsumers,
    backupManifest,
    smokeAttestation
  };
}

function planFixture() {
  return buildLegacyCleanupPlan(fixture());
}

test("o inventário de limpeza fixa os 1.550 objetos e separa os dois buckets", () => {
  const plan = planFixture();
  assert.equal(plan.removalObjectCount, LEGACY_DATABASE_OBJECT_COUNT);
  assert.deepEqual(plan.removalCategoryCounts, {
    bucket: 2,
    constraint: 634,
    function: 324,
    index: 245,
    policy: 9,
    rls: 107,
    table: 107,
    trigger: 117,
    view: 5
  });
  assert.deepEqual(plan.storageBuckets, LEGACY_STORAGE_BUCKETS);
  assert.equal(plan.databaseRoots.tables.length, 107);
  assert.equal(plan.databaseRoots.functions.length, 324);
  assert.equal(plan.allObjects.length,
    parityInventory.objects.filter(({ caseId }) =>
      caseId !== "pre-course-database-removal"
    ).length + legacyTargets.objects.length);
  assert.equal(plan.legacyCatalogCourses.length, 4);
});

test("a geração recusa token diferente e produz SQL transacional fail-closed", () => {
  const plan = planFixture();
  assert.throws(
    () => generateLegacyCleanupSql({ plan, confirmationToken: "REMOVE-OUTRO-PLANO" }),
    (error) => error.code === "invalid_cleanup_confirmation"
  );
  const sql = generateLegacyCleanupSql({
    plan,
    confirmationToken: plan.confirmationToken
  });
  for (const expected of [
    "\\set ON_ERROR_STOP on",
    "begin;",
    "pg_advisory_xact_lock",
    "verify_exact_preflight_inventory",
    "verify_no_current_consumers",
    "verify_dependency_inventory",
    "lock table",
    "verify_legacy_data_fingerprints",
    "verify_classified_legacy_courses",
    "verify_exact_postflight_inventory",
    "drop table if exists",
    "drop function if exists",
    "commit;"
  ]) assert.ok(sql.includes(expected), expected);
  assert.match(sql, /from pg_trigger[\s\S]+namespace_value\.nspname !~ '\^pg_'/u);
  assert.match(sql, /aralearn_cleanup_expected_tombstones[\s\S]+except[\s\S]+aralearn_cleanup_actual_tombstones/u);
  assert.doesNotMatch(sql, /count\(\*\) from public\.legacy_catalog_courses\) <> 4/u);
  assert.doesNotMatch(sql, /delete\s+from\s+(?:auth|storage)\./iu);
  assert.doesNotMatch(sql, /drop\s+(?:table|schema)\s+(?:auth|storage)\./iu);
  assert.match(sql, /Os buckets aralearn-authoring-artifacts e aralearn-course-revisions continuam intactos/u);
});

test("o preflight aborta diante de objeto, contagem ou dependência divergente", () => {
  const cases = [
    (input) => input.catalogSnapshot.objects.pop(),
    (input) => { input.catalogSnapshot.tables[0].rowCount += 1; },
    (input) => input.catalogSnapshot.consumers.push({
      kind: "foreign_key",
      dependent: "public.current_table/current_fk",
      referenced: "private.legacy_authoring_workspaces"
    })
  ];
  for (const change of cases) {
    const input = structuredClone(fixture());
    change(input);
    assert.throws(() => buildLegacyCleanupPlan(input));
  }
});

test("os quatro Cursos antigos precisam permanecer classificados e identificados por hash", () => {
  const input = structuredClone(fixture());
  input.catalogSnapshot.legacyCatalogCourses[0].classification = "unknown";
  assert.throws(
    () => buildLegacyCleanupPlan(input),
    (error) => error.code === "unclassified_legacy_catalog_courses"
  );
  const missing = structuredClone(fixture());
  missing.catalogSnapshot.legacyCatalogCourses.pop();
  assert.throws(
    () => buildLegacyCleanupPlan(missing),
    (error) => error.code === "unclassified_legacy_catalog_courses"
  );
});

test("o snapshot é somente leitura e inclui dependências, dados e PDFs de Fontes", () => {
  const sql = buildLegacyCleanupSnapshotSql({
    parityInventory,
    legacyTargets,
    finalManifest
  });
  assert.match(sql, /begin transaction isolation level repeatable read read only/u);
  assert.match(sql, /aralearn_cleanup_consumers/u);
  assert.match(sql, /aralearn_cleanup_dependencies/u);
  assert.match(sql, /courseSourcePdfAttachments/u);
  assert.match(sql, /courseSourcePdfObjects/u);
  assert.match(sql, /storage\.objects/u);
  assert.match(sql, /rollback;/u);
  assert.doesNotMatch(sql, /\b(?:delete\s+from|drop\s+(?:table|view|function)|truncate\s+)\b/iu);
});

test("o runtime publicado e as Edge Functions não consomem os alvos legados", async () => {
  const result = await scanLegacyRuntimeConsumers({
    repositoryRoot,
    parityInventory,
    legacyTargets,
    finalManifest
  });
  assert.deepEqual(result.matches, []);
  assert.match(result.filesHash, /^[0-9a-f]{64}$/u);
});

test("o validador v2 é autossuficiente e não depende do contrato pessoal legado", async () => {
  const migration = await fs.readFile(path.join(
    repositoryRoot,
    "supabase/migrations/20260817200000_course_anchored_annotations.sql"
  ), "utf8");
  const start = migration.indexOf(
    "create function private.valid_course_personal_state_v2(p_state jsonb)"
  );
  const end = migration.indexOf("$function$;", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const definition = migration.slice(start, end + "$function$;".length);
  assert.doesNotMatch(definition, /valid_course_personal_state_v1/u);
  for (const validation of [
    "p_state->>'version' is distinct from '2'",
    "field not in('version','progress','reviewMarks')",
    "v_progress->>'version' is distinct from '3'",
    "completedStudyUnitIds",
    "count(distinct study_unit_id #>> '{}')",
    "make_timestamp("
  ]) assert.ok(definition.includes(validation), validation);
});

test("o plano de órfãos PDF não inclui vínculo válido nem divergência ambígua", () => {
  const input = fixture();
  input.backupManifest.courseSourcePdfObjects = [
    { name: "a/missing-link.pdf", sha256: "1".repeat(64), byteSize: 10,
      classification: "orphan_missing_link" },
    { name: "a/missing-metadata.pdf", sha256: "2".repeat(64), byteSize: 20,
      classification: "orphan_missing_metadata" },
    { name: "a/linked.pdf", sha256: "3".repeat(64), byteSize: 30,
      classification: "linked" },
    { name: "a/divergent.pdf", sha256: "4".repeat(64), byteSize: 40,
      classification: "divergent_content" },
    { name: "a/missing-object.pdf", sha256: null, byteSize: null,
      classification: "attachment_missing_object" }
  ];
  const pdfPlan = buildPdfOrphanRemovalPlan({
    backupManifest: input.backupManifest,
    finalManifest
  });
  assert.deepEqual(pdfPlan.candidates.map(({ name }) => name), [
    "a/missing-link.pdf",
    "a/missing-metadata.pdf"
  ]);
  assert.match(pdfPlan.confirmationToken, /^REMOVE-ARALEARN-PDF-ORPHANS-/u);
});
