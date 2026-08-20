import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildDatabaseRestoreBootstrapSql,
  buildDatabaseRestoreCatalogSql,
  buildLegacyStorageRemovalPlan,
  buildRestoredForeignKeyVerificationSql,
  classifyCourseSourcePdfObjects,
  createCleanupBackup,
  parseStorageCliListing,
  rehearseDatabaseRestore,
  rehearseStorageRestore,
  runProcess,
  verifyCleanupBackup
} from "../../scripts/courseCutover/legacyCleanupBackup.mjs";
import {
  COURSE_SOURCE_PDF_BUCKET,
  LEGACY_CLEANUP_CONTRACTS,
  LEGACY_STORAGE_BUCKETS,
  sha256Canonical
} from "../../scripts/courseCutover/legacyCleanupPlan.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function currentInputs() {
  const finalManifest = JSON.parse(await fs.readFile(path.join(
    repositoryRoot,
    "supabase/runtime-manifest.json"
  ), "utf8"));
  const parityInventory = JSON.parse(await fs.readFile(path.join(
    repositoryRoot,
    "docs/evidence/paridade-vertical-banco.v1.json"
  ), "utf8"));
  const legacyTargets = JSON.parse(await fs.readFile(path.join(
    repositoryRoot,
    "scripts/courseCutover/legacyCleanupTargets.v1.json"
  ), "utf8"));
  return { finalManifest, parityInventory, legacyTargets };
}

function fakeSnapshot({ finalManifest, parityInventory, legacyTargets }) {
  const tables = legacyTargets.objects.filter((object) => object.startsWith("table:"))
    .map((object) => ({
    table: object.slice("table:".length),
    rowCount: object === "table:public.legacy_catalog_courses" ? 8 : 0,
    rowFingerprint: "0".repeat(32)
  }));
  return {
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
    legacyCatalogCourses: [1, 2, 3, 4].map((number) => ({
      id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
      classification: "deleted_unlinked_tombstone",
      deletedAt: "2026-08-20T00:00:00.000Z",
      rowFingerprint: String(number).repeat(32)
    })),
    courseSourcePdfAttachments: [],
    courseSourcePdfObjects: []
  };
}

function fakeDatabaseRestoreCatalog({
  projectRef = "jrfkphuhcseqmratijjr",
  tableProfiles = [],
  foreignKeyCount = 0
} = {}) {
  const tables = tableProfiles.map((profile) => {
    const separator = profile.table.indexOf(".");
    return {
      schema: profile.table.slice(0, separator),
      name: profile.table.slice(separator + 1),
      rowCount: profile.rowCount,
      rowFingerprint: profile.rowFingerprint
    };
  });
  const coveredSchemas = new Set(tables.map(({ schema }) => schema));
  for (const [schema, name] of [
    ["auth", "users"],
    ["private", "restore_fixture"],
    ["public", "restore_fixture"],
    ["storage", "buckets"],
    ["supabase_migrations", "schema_migrations"]
  ]) {
    if (!coveredSchemas.has(schema)) {
      tables.push({
        schema,
        name,
        rowCount: 0,
        rowFingerprint: "d41d8cd98f00b204e9800998ecf8427e"
      });
    }
  }
  tables.sort((left, right) =>
    `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`));
  const foreignKeys = Array.from({ length: foreignKeyCount }, (_, index) => ({
    schema: "public",
    table: `child_${String(index).padStart(3, "0")}`,
    name: `child_${String(index).padStart(3, "0")}_parent_fkey`,
    referencedSchema: "auth",
    referencedTable: "users",
    definition: "FOREIGN KEY (user_id) REFERENCES auth.users(id)",
    validated: true
  }));
  return {
    contract: "aralearn.course-legacy-cleanup-database-restore-catalog.v1",
    projectRef,
    schemas: ["auth", "private", "public", "storage", "supabase_migrations"],
    tables,
    foreignKeys
  };
}

test("o backup reúne dump, snapshot, buckets e hashes fora do repositório", async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-cleanup-"));
  context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const outputDirectory = path.join(temporaryRoot, "backup");
  const managementHelperPath = path.join(temporaryRoot, "management-helper.ps1");
  await fs.writeFile(managementHelperPath, "# auxiliar de teste\n");
  const { finalManifest, parityInventory, legacyTargets } = await currentInputs();
  const snapshot = fakeSnapshot({ finalManifest, parityInventory, legacyTargets });
  const projectRef = "jrfkphuhcseqmratijjr";
  const databaseRestoreCatalog = fakeDatabaseRestoreCatalog({
    projectRef,
    tableProfiles: snapshot.tables
  });
  const storageCatalog = {
    contract: "aralearn.course-legacy-cleanup-storage-catalog.v1",
    projectRef,
    buckets: [...LEGACY_STORAGE_BUCKETS, COURSE_SOURCE_PDF_BUCKET].map((id) => ({
      id, name: id, public: false, fileSizeLimit: null, allowedMimeTypes: null,
      createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z"
    })),
    objects: [{
      id: "00000000-0000-4000-8000-000000000001",
      bucketId: LEGACY_STORAGE_BUCKETS[0],
      name: "artifacts/sha256/a.json",
      metadata: { mimetype: "application/json" },
      userMetadata: null,
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
      lastAccessedAt: "2026-08-20T00:00:00Z"
    }]
  };
  const calls = [];
  const processRunner = async (command, argumentsList) => {
    calls.push({ command, argumentsList });
    if (command.toLowerCase().includes("powershell")) {
      const sqlPath = argumentsList[argumentsList.indexOf("-SqlFile") + 1];
      const outputPath = argumentsList[argumentsList.indexOf("-OutputFile") + 1];
      const sqlName = path.basename(sqlPath);
      const property = sqlName === "catalog-snapshot.sql" ?
        { jsonb_build_object: snapshot } : sqlName === "database-restore-catalog.sql" ?
          { database_restore_catalog: databaseRestoreCatalog } :
          { storage_catalog: storageCatalog };
      await fs.writeFile(outputPath, JSON.stringify([property]));
      return { code: 0, stdout: "", stderr: "" };
    }
    if (argumentsList.includes("storage") && argumentsList.includes("ls")) {
      const bucketId = argumentsList.find((value) => value.startsWith("ss:///"))
        .slice("ss:///".length).replace(/\/$/u, "");
      const stdout = bucketId === LEGACY_STORAGE_BUCKETS[0] ?
        `/${bucketId}/artifacts/sha256/a.json\n` : "";
      return { code: 0, stdout, stderr: "" };
    }
    if (argumentsList.includes("storage") && argumentsList.includes("cp")) {
      const target = argumentsList[argumentsList.indexOf("--project-ref") - 1];
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, "conteúdo do objeto\n");
      return { code: 0, stdout: "", stderr: "" };
    }
    const fileIndex = argumentsList.indexOf("--file");
    assert.notEqual(fileIndex, -1);
    const target = argumentsList[fileIndex + 1];
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `dump:${path.basename(target)}\n`);
    return { code: 0, stdout: "", stderr: "" };
  };
  const manifest = await createCleanupBackup({
    repositoryRoot,
    outputDirectory,
    finalManifestPath: path.join(repositoryRoot, "supabase/runtime-manifest.json"),
    parityInventoryPath: path.join(
      repositoryRoot,
      "docs/evidence/paridade-vertical-banco.v1.json"
    ),
    legacyTargetsPath: path.join(
      repositoryRoot,
      "scripts/courseCutover/legacyCleanupTargets.v1.json"
    ),
    projectRef,
    managementHelperPath,
    processRunner,
    now: () => new Date("2026-08-20T02:00:00.000Z")
  });
  assert.equal(manifest.verification.status, "verified");
  assert.deepEqual(manifest.storageBuckets.map(({ id }) => id), [
    ...LEGACY_STORAGE_BUCKETS,
    COURSE_SOURCE_PDF_BUCKET
  ]);
  assert.equal(manifest.legacyCatalogCourses.length, 4);
  assert.equal(manifest.storageBuckets[0].objects[0].responseContentType, "application/json");
  assert.ok(manifest.files.some(({ path: file }) => file === "database/schema.sql"));
  assert.ok(manifest.files.some(({ path: file }) => file === "database/platform-schema.sql"));
  assert.ok(manifest.files.some(({ path: file }) => file === "database/platform-data.sql"));
  const databaseDumpCalls = calls.filter(({ argumentsList }) => argumentsList.includes("dump"));
  assert.equal(databaseDumpCalls.length, 5);
  assert.ok(databaseDumpCalls
    .every(({ argumentsList }) => argumentsList.includes("--project-ref") &&
      !argumentsList.includes("--db-url") && !argumentsList.includes("--dry-run") &&
      !argumentsList.includes("--debug")));
  assert.equal(databaseDumpCalls.filter(({ argumentsList }) =>
    argumentsList.includes("auth,storage,supabase_migrations")).length, 2);
  assert.ok(calls.filter(({ argumentsList }) => argumentsList.includes("storage"))
    .every(({ argumentsList }) => argumentsList.includes("--project-ref") &&
      argumentsList.includes("--experimental")));
  assert.deepEqual((await verifyCleanupBackup(outputDirectory)).files, manifest.files);

  const dataFile = path.join(outputDirectory, "database/data.sql");
  await fs.appendFile(dataFile, "alteração");
  await assert.rejects(
    verifyCleanupBackup(outputDirectory),
    (error) => error.code === "cleanup_backup_hash_mismatch"
  );
});

test("a listagem do CLI aceita somente caminhos do bucket esperado", () => {
  assert.deepEqual(parseStorageCliListing([
    "/bucket/dir/a.json", "/bucket/b.json"
  ].join("\n"), "bucket"), ["b.json", "dir/a.json"]);
  assert.throws(() => parseStorageCliListing("/outro/a.json", "bucket"),
    (error) => error.code === "invalid_cleanup_storage_listing");
  assert.throws(() => parseStorageCliListing("/bucket/../a.json", "bucket"),
    (error) => error.code === "unsafe_backup_path");
});

test("a execução do ensaio transmite os dumps sem copiá-los para argumentos", async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-process-input-"));
  context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const inputPath = path.join(temporaryRoot, "parte.sql");
  await fs.writeFile(inputPath, "parte-do-arquivo");
  const result = await runProcess(process.execPath, [
    "-e", "process.stdin.pipe(process.stdout)"
  ], { inputParts: ["início-", { file: inputPath }, "-fim"] });
  assert.equal(result.stdout, "início-parte-do-arquivo-fim");
});

test("o ensaio cataloga todos os esquemas e usa placeholders que interrompem chamadas", () => {
  const projectRef = "jrfkphuhcseqmratijjr";
  const catalogSql = buildDatabaseRestoreCatalogSql(projectRef);
  const bootstrapSql = buildDatabaseRestoreBootstrapSql();
  const foreignKeySql = buildRestoredForeignKeyVerificationSql();
  for (const schema of ["auth", "private", "public", "storage", "supabase_migrations"]) {
    assert.ok(catalogSql.includes(`'${schema}'`), schema);
    assert.ok(foreignKeySql.includes(`'${schema}'`), schema);
  }
  assert.match(catalogSql, /rowFingerprint/u);
  assert.match(catalogSql, /pg_get_constraintdef/u);
  assert.match(bootstrapSql, /raise exception using message='aralearn_restore_placeholder_v1'/u);
  assert.doesNotMatch(bootstrapSql, /return old/iu);
  assert.match(bootstrapSql, /create extension if not exists pgcrypto with schema extensions/iu);
  assert.match(foreignKeySql, /session_replication_role/u);
});

test("o backup pós-cutover recusa catálogo sem o bucket de PDFs", async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-bucket-gate-"));
  context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const managementHelperPath = path.join(temporaryRoot, "management-helper.ps1");
  await fs.writeFile(managementHelperPath, "# auxiliar de teste\n");
  const { finalManifest, parityInventory, legacyTargets } = await currentInputs();
  const snapshot = fakeSnapshot({ finalManifest, parityInventory, legacyTargets });
  const projectRef = "jrfkphuhcseqmratijjr";
  const processRunner = async (command, argumentsList) => {
    assert.ok(command.toLowerCase().includes("powershell"));
    const sqlPath = argumentsList[argumentsList.indexOf("-SqlFile") + 1];
    const outputPath = argumentsList[argumentsList.indexOf("-OutputFile") + 1];
    const property = path.basename(sqlPath) === "catalog-snapshot.sql" ?
      { jsonb_build_object: snapshot } : {
        storage_catalog: {
          contract: "aralearn.course-legacy-cleanup-storage-catalog.v1",
          projectRef,
          buckets: LEGACY_STORAGE_BUCKETS.map((id) => ({ id, name: id, public: false })),
          objects: []
        }
      };
    await fs.writeFile(outputPath, JSON.stringify([property]));
    return { code: 0, stdout: "", stderr: "" };
  };
  await assert.rejects(createCleanupBackup({
    repositoryRoot,
    outputDirectory: path.join(temporaryRoot, "backup"),
    finalManifestPath: path.join(repositoryRoot, "supabase/runtime-manifest.json"),
    parityInventoryPath: path.join(
      repositoryRoot, "docs/evidence/paridade-vertical-banco.v1.json"
    ),
    legacyTargetsPath: path.join(
      repositoryRoot, "scripts/courseCutover/legacyCleanupTargets.v1.json"
    ),
    projectRef,
    managementHelperPath,
    processRunner
  }), (error) => error.code === "cleanup_storage_bucket_missing");
});

test("a classificação de PDFs distingue vínculo, órfão e divergência", () => {
  const hash = "a".repeat(64);
  const linkedName = `00000000-0000-4000-8000-000000000001/${hash}.pdf`;
  const noLinkName = `00000000-0000-4000-8000-000000000002/${"b".repeat(64)}.pdf`;
  const missingMetadataName = `00000000-0000-4000-8000-000000000003/${"c".repeat(64)}.pdf`;
  const snapshot = {
    courseSourcePdfAttachments: [
      { storage_path: linkedName, content_hash: hash, byte_size: 12,
        media_type: "application/pdf" },
      { storage_path: "00000000-0000-4000-8000-000000000004/missing.pdf",
        content_hash: "d".repeat(64), byte_size: 9, media_type: "application/pdf" }
    ],
    courseSourcePdfObjects: [
      { name: linkedName, metadata: { size: 12, mimetype: "application/pdf" } },
      { name: noLinkName, metadata: { size: 7, mimetype: "application/pdf" } },
      { name: missingMetadataName, metadata: null }
    ]
  };
  const storageBucket = {
    objects: [
      { name: linkedName, sha256: hash, byteSize: 12, localPath: "storage/linked" },
      { name: noLinkName, sha256: "b".repeat(64), byteSize: 7, localPath: "storage/no-link" },
      { name: missingMetadataName, sha256: "c".repeat(64), byteSize: 8,
        localPath: "storage/no-metadata" }
    ]
  };
  assert.deepEqual(
    classifyCourseSourcePdfObjects({ snapshot, storageBucket }).map(({ classification }) =>
      classification
    ).sort(),
    ["attachment_missing_object", "linked", "orphan_missing_link",
      "orphan_missing_metadata"].sort()
  );
});

test("o plano dos buckets exige hashes verificados e não inclui PDFs correntes", async () => {
  const { finalManifest } = await currentInputs();
  const backupManifest = {
    contract: LEGACY_CLEANUP_CONTRACTS.backup,
    finalManifestHash: sha256Canonical(finalManifest),
    verification: { status: "verified", verifiedAt: "2026-08-20T00:00:00Z" },
    storageBuckets: [
      ...LEGACY_STORAGE_BUCKETS.map((id, index) => ({
        id,
        verified: true,
        objects: [{ name: `object-${index}`, sha256: String(index + 1).repeat(64), byteSize: 1 }]
      })),
      { id: COURSE_SOURCE_PDF_BUCKET, verified: true, objects: [] }
    ]
  };
  const plan = buildLegacyStorageRemovalPlan({ backupManifest, finalManifest });
  assert.deepEqual(plan.buckets.map(({ id }) => id), LEGACY_STORAGE_BUCKETS);
  assert.equal(plan.buckets.some(({ id }) => id === COURSE_SOURCE_PDF_BUCKET), false);
  const changed = structuredClone(backupManifest);
  changed.storageBuckets[0].verified = false;
  assert.throws(() => buildLegacyStorageRemovalPlan({
    backupManifest: changed,
    finalManifest
  }), (error) => error.code === "unverified_cleanup_backup");
});

test("a restauração exige destino local vazio, token e compara os dados", async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-restore-"));
  context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(temporaryRoot, "database"));
  await fs.mkdir(path.join(temporaryRoot, "inputs"));
  for (const file of [
    "roles.sql", "platform-schema.sql", "schema.sql", "platform-data.sql", "data.sql"
  ]) {
    await fs.writeFile(path.join(temporaryRoot, "database", file), `${file}\n`);
  }
  const tableProfiles = [{
    table: "private.legacy_rows",
    rowCount: 2,
    rowFingerprint: "a".repeat(32)
  }];
  const databaseRestoreCatalog = fakeDatabaseRestoreCatalog({
    tableProfiles,
    foreignKeyCount: 12
  });
  const evidence = {
    "final-runtime-manifest.json": { kind: "manifest" },
    "database-inventory.json": { kind: "inventory" },
    "legacy-cleanup-targets.json": { kind: "targets" },
    "catalog-snapshot.json": { kind: "snapshot" },
    "runtime-consumers.json": { kind: "runtime" },
    "storage-catalog-before.json": { kind: "storage" },
    "database-restore-catalog-before.json": databaseRestoreCatalog,
    "database-restore-catalog-after.json": databaseRestoreCatalog
  };
  for (const [file, value] of Object.entries(evidence)) {
    await fs.writeFile(path.join(temporaryRoot, "inputs", file),
      `${JSON.stringify(value)}\n`);
  }
  const files = [];
  const relativeFiles = [
    "roles.sql", "platform-schema.sql", "schema.sql", "platform-data.sql", "data.sql"
  ].map((file) =>
    `database/${file}`).concat(Object.keys(evidence).map((file) => `inputs/${file}`));
  for (const file of relativeFiles) {
    const content = await fs.readFile(path.join(temporaryRoot, ...file.split("/")));
    files.push({
      path: file,
      sha256: (await import("node:crypto")).createHash("sha256").update(content).digest("hex"),
      byteSize: content.length
    });
  }
  const manifest = {
    contract: LEGACY_CLEANUP_CONTRACTS.backup,
    sourceProjectRef: "jrfkphuhcseqmratijjr",
    sourceDatabaseFingerprint: sha256Canonical(databaseRestoreCatalog),
    finalManifestHash: sha256Canonical(evidence["final-runtime-manifest.json"]),
    parityInventoryHash: sha256Canonical(evidence["database-inventory.json"]),
    legacyTargetsHash: sha256Canonical(evidence["legacy-cleanup-targets.json"]),
    catalogSnapshotHash: sha256Canonical(evidence["catalog-snapshot.json"]),
    runtimeConsumerEvidenceHash: sha256Canonical(evidence["runtime-consumers.json"]),
    storageCatalogHash: sha256Canonical(evidence["storage-catalog-before.json"]),
    databaseRestoreCatalogHash: sha256Canonical(databaseRestoreCatalog),
    files,
    tableProfiles,
    storageBuckets: [...LEGACY_STORAGE_BUCKETS, COURSE_SOURCE_PDF_BUCKET]
      .map((id) => ({ id, verified: true, objects: [] })),
    verification: { status: "verified", verifiedAt: "2026-08-20T00:00:00Z" }
  };
  await fs.writeFile(path.join(temporaryRoot, "backup-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`);
  const calls = [];
  const processRunner = async (command, argumentsList, options = {}) => {
    calls.push({ command, argumentsList, options });
    if (argumentsList[0] === "context") {
      return { code: 0, stdout: "npipe:////./pipe/dockerDesktopLinuxEngine\n", stderr: "" };
    }
    if (argumentsList[0] === "inspect") {
      return { code: 0, stdout: `${"a".repeat(64)} public.ecr.aws/supabase/postgres:17\n`,
        stderr: "" };
    }
    const commandIndex = argumentsList.indexOf("--command");
    if (commandIndex >= 0 && argumentsList[commandIndex + 1].startsWith("select count")) {
      return { code: 0, stdout: "0\n", stderr: "" };
    }
    if (commandIndex >= 0 && argumentsList[commandIndex + 1].startsWith("do ")) {
      return { code: 0, stdout: `${JSON.stringify({
        sessionReplicationRole: "origin",
        foreignKeyCount: 12,
        schemas: ["auth", "private", "public", "storage", "supabase_migrations"]
      })}\n`, stderr: "" };
    }
    if (commandIndex >= 0) {
      return { code: 0, stdout: `${JSON.stringify(databaseRestoreCatalog)}\n`, stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const token = `RESTORE-DISPOSABLE-${sha256Canonical(manifest).slice(0, 20).toUpperCase()}`;
  const report = await rehearseDatabaseRestore({
    backupDirectory: temporaryRoot,
    targetContainer: "supabase_db_aralearn",
    targetDatabase: "aralearn_restore_rehearsal",
    confirmationToken: token,
    processRunner,
    now: () => new Date("2026-08-20T03:00:00.000Z")
  });
  assert.equal(report.tableProfiles.find(({ schema, name }) =>
    schema === "private" && name === "legacy_rows").rowCount, 2);
  assert.equal(report.foreignKeys.foreignKeyCount, 12);
  assert.ok(calls.some(({ argumentsList }) => argumentsList.includes("--single-transaction")));
  assert.ok(calls.some(({ options }) => Array.isArray(options.inputParts) &&
    options.inputParts.includes("\nset local session_replication_role=replica;\n") &&
    options.inputParts.includes("\nset local session_replication_role=origin;\n") &&
    options.inputParts.some((part) => typeof part === "string" &&
      part.includes("aralearn_restore_placeholder_v1")) &&
    options.inputParts.some((part) => part?.file?.endsWith("platform-schema.sql")) &&
    options.inputParts.some((part) => part?.file?.endsWith("platform-data.sql"))));
  assert.ok(calls.filter(({ argumentsList }) => argumentsList[0] === "exec")
    .every(({ argumentsList }) => argumentsList.includes("supabase_admin")));
  const storageRequests = [];
  const storageToken = `RESTORE-DISPOSABLE-STORAGE-${sha256Canonical(manifest)
    .slice(0, 20).toUpperCase()}`;
  const storageReport = await rehearseStorageRestore({
    backupDirectory: temporaryRoot,
    targetSupabaseUrl: "http://127.0.0.1:54321",
    targetServiceRoleKey: "chave-local-de-teste",
    confirmationToken: storageToken,
    fetchImpl: async (url, options) => {
      storageRequests.push({ url, options });
      return new Response("{}", { status: 200 });
    }
  });
  assert.equal(storageReport.objects.length, 0);
  assert.equal(storageRequests.length, 3);
  await assert.rejects(rehearseDatabaseRestore({
    backupDirectory: temporaryRoot,
    targetContainer: "supabase_db_aralearn",
    targetDatabase: "postgres",
    confirmationToken: token,
    processRunner
  }), (error) => error.code === "unsafe_restore_target");
});
