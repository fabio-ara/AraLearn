import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  COURSE_CUTOVER_SOURCE_SQL,
  COURSE_CUTOVER_VERIFICATION_SQL,
  createRevisionArtifactLoader,
  parseCourseCutoverSnapshot,
  runPsql
} from "../../scripts/courseCutover/courseCutoverSource.mjs";
import {
  COURSE_CUTOVER_LEGACY_AUDIT_COUNT_FIELDS,
  canonicalSha256,
  courseCutoverLegacyAuditHash
} from "../../scripts/courseCutover/courseCutoverImporter.mjs";
import { runCourseIdentityCutover } from
  "../../scripts/courseCutover/runCourseIdentityCutover.mjs";

const legacyAudit = Object.freeze({
  contract: "aralearn.legacy-authoring-audit-cutover-preflight.v1",
  counts: Object.freeze(Object.fromEntries(
    COURSE_CUTOVER_LEGACY_AUDIT_COUNT_FIELDS.map((field) => [field, 0])
  ))
});
const legacyAuditHash = courseCutoverLegacyAuditHash(legacyAudit);
const taskOperationTerminologyMigrationSql = "task-operation-terminology-migration";
const postCutoverMigrations = Object.freeze([
  Object.freeze({
    version: "20260818042341",
    name: "course_variant_comparisons",
    sql: "course-variants-migration"
  }),
  Object.freeze({
    version: "20260818051209",
    name: "course_variant_comparison_listing",
    sql: "course-variant-listing-migration"
  }),
  Object.freeze({
    version: "20260818052044",
    name: "course_variant_listing_manifest",
    sql: "course-variant-manifest-migration"
  })
]);

test("ajuda descreve todas as migrations da transação hospedada", () => {
  const runner = new URL(
    "../../scripts/courseCutover/runCourseIdentityCutover.mjs",
    import.meta.url
  );
  const result = spawnSync(process.execPath, [fileURLToPath(runner), "--help"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /migrations 1300\/1400\/1500\/1600\/1700\/1800\/1900\/2000\/2100\/18042341\/18051209\/18052044\/20061206\/20063156\/20065720\/20101500 em uma transação/u
  );
});

test("snapshot SQL lê a árvore, os descritores e o preflight legado", () => {
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /with recursive legacy_audit_counts/iu);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /legacy-authoring-audit-cutover-preflight/u);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /observation_thread_corrections/u);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /materialization_state_workspaces/u);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /materialization_state_unmapped_workspaces/u);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /materialization_state_orphans/u);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /private\.authoring_workspace_entities/iu);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /private\.artifact_refs/iu);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /publication\.revision_artifact_hash/iu);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /targetHeader/u);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /entityVersion/u);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /entityCreatedAt/u);
  assert.match(COURSE_CUTOVER_SOURCE_SQL, /entityUpdatedAt/u);
  assert.doesNotMatch(COURSE_CUTOVER_SOURCE_SQL, /entityDefaults|publication_only/u);
  assert.match(
    COURSE_CUTOVER_SOURCE_SQL,
    /nullif\(btrim\(workspace_root\.content->>'goal'\), ''\)/u
  );
  assert.doesNotMatch(COURSE_CUTOVER_SOURCE_SQL, /storage\.objects/iu);
  assert.match(COURSE_CUTOVER_VERIFICATION_SQL, /private\.course_entities/u);
  assert.match(COURSE_CUTOVER_VERIFICATION_SQL, /course_source_attribution_sources/u);
  assert.match(COURSE_CUTOVER_VERIFICATION_SQL, /'createdAt', entity\.created_at/u);
});

test("parser aceita um único snapshot e rejeita ruído", () => {
  const value = {
    contract: "aralearn.course-cutover-source.v1",
    legacyAudit,
    legacyAuditHash,
    topology: []
  };
  assert.deepEqual(parseCourseCutoverSnapshot(JSON.stringify(value)), value);
  const withHistoricalThreads = structuredClone(value);
  withHistoricalThreads.legacyAudit.counts.observation_threads = 3;
  withHistoricalThreads.legacyAuditHash = courseCutoverLegacyAuditHash(
    withHistoricalThreads.legacyAudit
  );
  assert.deepEqual(
    parseCourseCutoverSnapshot(JSON.stringify(withHistoricalThreads)),
    withHistoricalThreads
  );
  const withKnownCounters = structuredClone(value);
  withKnownCounters.legacyAudit.counts.materialization_states = 247;
  withKnownCounters.legacyAudit.counts.materialization_state_workspaces = 2;
  withKnownCounters.legacyAuditHash = courseCutoverLegacyAuditHash(
    withKnownCounters.legacyAudit
  );
  assert.deepEqual(
    parseCourseCutoverSnapshot(JSON.stringify(withKnownCounters)),
    withKnownCounters
  );
  const withWrongCounterTopology = structuredClone(withKnownCounters);
  withWrongCounterTopology.legacyAudit.counts.materialization_state_workspaces = 1;
  withWrongCounterTopology.legacyAuditHash = courseCutoverLegacyAuditHash(
    withWrongCounterTopology.legacyAudit
  );
  assert.throws(
    () => parseCourseCutoverSnapshot(JSON.stringify(withWrongCounterTopology)),
    (error) => error.code === "legacy_authoring_audit_cutover_blocked"
  );
  const withFinding = structuredClone(value);
  withFinding.legacyAudit.counts.audit_findings = 1;
  assert.throws(
    () => parseCourseCutoverSnapshot(JSON.stringify(withFinding)),
    (error) => error.code === "legacy_authoring_audit_cutover_blocked"
  );
  const incomplete = structuredClone(value);
  delete incomplete.legacyAudit.counts.audit_runs;
  assert.throws(
    () => parseCourseCutoverSnapshot(JSON.stringify(incomplete)),
    (error) => error.code === "legacy_authoring_audit_cutover_blocked"
  );
  assert.throws(
    () => parseCourseCutoverSnapshot(JSON.stringify({
      ...value,
      legacyAuditHash: "a".repeat(64)
    })),
    (error) => error.code === "legacy_authoring_audit_cutover_blocked"
  );
  assert.throws(
    () => parseCourseCutoverSnapshot(`aviso\n${JSON.stringify(value)}`),
    (error) => error.code === "invalid_database_snapshot"
  );
});

test("psql recebe senha só pelo ambiente e suprime stderr", async () => {
  let observed = null;
  const spawnImpl = (command, args, options) => {
    observed = { command, args, options };
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.end('{"ok":true}');
      child.stderr.end('mensagem que não deve chegar ao erro');
      child.emit("close", 0);
    });
    return child;
  };
  const output = await runPsql("select 1;", {
    databaseUrl: "postgresql://postgres.example@db.example.test/postgres",
    password: "segredo-efêmero",
    dockerContainer: "supabase_db_aralearn",
    spawnImpl
  });
  assert.equal(output, '{"ok":true}');
  assert.equal(observed.command, "docker");
  assert.equal(observed.args.includes("segredo-efêmero"), false);
  assert.equal(observed.options.env.PGPASSWORD, "segredo-efêmero");
});

test("psql encerra o processo no prazo e só então falha fechado", async () => {
  const signals = [];
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = (signal) => {
      signals.push(signal);
      queueMicrotask(() => child.emit("close", null, signal));
      return true;
    };
    return child;
  };
  await assert.rejects(runPsql("select pg_sleep(60);", {
    databaseUrl: "postgresql://postgres.example@db.example.test/postgres",
    password: "segredo-efêmero",
    dockerContainer: "supabase_db_aralearn",
    spawnImpl,
    processTimeoutMs: 10,
    killGraceMs: 10
  }), (error) => error.code === "database_process_timeout");
  assert.deepEqual(signals, ["SIGTERM"]);
});

test("artefato usa a Edge autenticada e fica somente no temp do SO", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-cutover-test-"));
  try {
    const document = Buffer.from('{"contract":"synthetic"}', "utf8");
    const hash = createHash("sha256").update(document).digest("hex");
    const calls = [];
    const artifactReader = await createRevisionArtifactLoader({
      supabaseUrl: "https://project-ref.supabase.co",
      publishableKey: "publishable-test-key",
      accessToken: "user-session-token",
      tempRoot,
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(document, { status: 200 });
      }
    });
    const result = await artifactReader.loader({
      hash,
      bucket: "private-bucket",
      objectKey: "should/not/appear.json",
      sizeBytes: document.byteLength
    }, {
      legacyCourseId: "30000000-0000-4000-8000-000000000001",
      legacyRevisionHash: hash
    });
    assert.deepEqual(result, document);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /functions\/v1\/aralearn-course-revisions\//u);
    assert.doesNotMatch(calls[0].url, /private-bucket|should/u);
    assert.equal(calls[0].options.headers.apikey, "publishable-test-key");
    assert.equal(calls[0].options.headers.Authorization, "Bearer user-session-token");
    assert.deepEqual(await fs.readdir(artifactReader.directory), ["artifact-01.json"]);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("runner só escreve com --apply, relê drift e sempre limpa o temp", async () => {
  const sessions = { database: { marker: "db" }, supabase: { marker: "user" } };
  const firstSnapshot = { marker: "first" };
  const makePreparation = (snapshot) => ({
    snapshotHash: canonicalSha256(snapshot),
    sourceSnapshot: {
      legacyAudit,
      legacyAuditHash
    },
    prepared: [{
      entry: { courseId: "10000000-0000-4000-8000-000000000001" },
      manifest: {
        manifestHash: "1".repeat(64),
        documentHash: "2".repeat(64),
        rowHash: "3".repeat(64),
        sourceReferenceHash: "5".repeat(64),
        entityStateHash: "4".repeat(64),
        counts: { studyUnits: 8 }
      }
    }],
    summary: {
      courseCount: 8,
      artifactCount: 4,
      overlapCount: 4,
      entityCount: 16,
      counts: [{ studyUnits: 8 }, { studyUnits: 4 }]
    }
  });
  const directories = [];
  const createArtifactLoader = async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-runner-test-"));
    directories.push(directory);
    return { directory, loader: async () => Buffer.alloc(0) };
  };
  let executions = 0;
  const observedDatabaseOptions = [];
  const attestations = [];
  const writeAttestation = async (report) => { attestations.push(report); };
  const executeSql = async (_sql, options) => {
    executions += 1;
    observedDatabaseOptions.push(options);
  };
  const readOptions = [];
  const readSnapshot = async (options) => {
    readOptions.push(options);
    return firstSnapshot;
  };

  const preflight = await runCourseIdentityCutover({
    sessions,
    taskOperationTerminologyMigrationSql,
    migrationSql: "migration",
    profileAccessMigrationSql: "profile-migration",
    authoringPlanMigrationSql: "authoring-plan-migration",
    studyUnitInspectionMigrationSql: "study-unit-inspection-migration",
    courseDesignMigrationSql: "course-design-migration",
    courseSourcesMigrationSql: "course-sources-migration",
    courseAnnotationsMigrationSql: "course-annotations-migration",
    courseAuditMigrationSql: "course-audit-migration",
    postCutoverMigrations,
    readSnapshot,
    createArtifactLoader,
    prepare: async (snapshot) => makePreparation(snapshot),
    buildSql: () => "transaction",
    executeSql,
    writeAttestation
  });
  assert.equal(preflight.status, "validated");
  assert.equal(executions, 0);
  assert.equal(readOptions.at(-1).processTimeoutMs, 90_000);
  assert.equal(attestations.at(-1).phase, "prepared");
  assert.equal(attestations.at(-1).legacyAuditHash, legacyAuditHash);
  assert.equal(attestations.at(-1).courses[0].entityStateHash, "4".repeat(64));
  assert.equal(attestations.at(-1).migrationHash, createHash("sha256").update(
    [
      taskOperationTerminologyMigrationSql, "migration", "profile-migration",
      "authoring-plan-migration",
      "study-unit-inspection-migration", "course-design-migration",
      "course-sources-migration", "course-annotations-migration",
      "course-audit-migration", "course-variants-migration",
      "course-variant-listing-migration", "course-variant-manifest-migration"
    ].join("\n"),
    "utf8"
  ).digest("hex"));

  let reads = 0;
  await assert.rejects(runCourseIdentityCutover({
    apply: true,
    sessions,
    taskOperationTerminologyMigrationSql,
    migrationSql: "migration",
    profileAccessMigrationSql: "profile-migration",
    authoringPlanMigrationSql: "authoring-plan-migration",
    studyUnitInspectionMigrationSql: "study-unit-inspection-migration",
    courseDesignMigrationSql: "course-design-migration",
    courseSourcesMigrationSql: "course-sources-migration",
    courseAnnotationsMigrationSql: "course-annotations-migration",
    courseAuditMigrationSql: "course-audit-migration",
    postCutoverMigrations,
    readSnapshot: async () => (++reads === 1 ? firstSnapshot : { marker: "drift" }),
    createArtifactLoader,
    prepare: async (snapshot) => makePreparation(snapshot),
    buildSql: () => "transaction",
    executeSql,
    writeAttestation
  }), (error) => error.code === "course_cutover_source_drift");
  assert.equal(executions, 0);

  const applied = await runCourseIdentityCutover({
    apply: true,
    sessions,
    taskOperationTerminologyMigrationSql,
    migrationSql: "migration",
    profileAccessMigrationSql: "profile-migration",
    authoringPlanMigrationSql: "authoring-plan-migration",
    studyUnitInspectionMigrationSql: "study-unit-inspection-migration",
    courseDesignMigrationSql: "course-design-migration",
    courseSourcesMigrationSql: "course-sources-migration",
    courseAnnotationsMigrationSql: "course-annotations-migration",
    courseAuditMigrationSql: "course-audit-migration",
    postCutoverMigrations,
    readSnapshot: async () => firstSnapshot,
    createArtifactLoader,
    prepare: async (snapshot) => makePreparation(snapshot),
    buildSql: () => "transaction",
    executeSql,
    readVerification: async (options) => {
      assert.equal(options.processTimeoutMs, 90_000);
      return { marker: "verification" };
    },
    verifyApplied: () => [{
      courseId: "10000000-0000-4000-8000-000000000001",
      manifestHash: "1".repeat(64),
      documentHash: "2".repeat(64),
      rowHash: "3".repeat(64),
      sourceReferenceHash: "5".repeat(64),
      entityStateHash: "4".repeat(64),
      counts: { studyUnits: 8 }
    }],
    writeAttestation
  });
  assert.equal(applied.status, "applied");
  assert.equal(executions, 1);
  assert.equal(observedDatabaseOptions[0].processTimeoutMs, 12 * 60 * 1000);
  assert.deepEqual(attestations.slice(-2).map(({ phase }) => phase), [
    "prepared", "verified"
  ]);
  for (const directory of directories) {
    await assert.rejects(fs.stat(directory), (error) => error.code === "ENOENT");
  }
});

test("runner grava atestação mínima somente fora do repositório público", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-attestation-test-"));
  const artifactDirectories = [];
  const snapshot = { contract: "snapshot-for-attestation" };
  const preparation = {
    snapshotHash: canonicalSha256(snapshot),
    sourceSnapshot: {
      legacyAudit,
      legacyAuditHash
    },
    prepared: [{
      entry: { courseId: "10000000-0000-4000-8000-000000000001" },
      manifest: {
        manifestHash: "1".repeat(64),
        documentHash: "2".repeat(64),
        rowHash: "3".repeat(64),
        sourceReferenceHash: "5".repeat(64),
        entityStateHash: "4".repeat(64),
        counts: { studyUnits: 8 }
      }
    }],
    summary: {
      courseCount: 1,
      artifactCount: 0,
      overlapCount: 0,
      entityCount: 8,
      counts: [{ studyUnits: 8 }]
    }
  };
  const createArtifactLoader = async () => {
    const directory = await fs.mkdtemp(path.join(tempRoot, "artifact-"));
    artifactDirectories.push(directory);
    return { directory, loader: async () => Buffer.alloc(0) };
  };
  const common = {
    sessions: { database: { marker: "database-secret" }, supabase: { marker: "user-secret" } },
    resolutions: { planeAxes: { fingerprint: { x: "horizontal", y: "vertical" } } },
    taskOperationTerminologyMigrationSql:
      "task-operation-terminology-migration-without-content",
    migrationSql: "migration-without-content",
    profileAccessMigrationSql: "profile-migration-without-content",
    authoringPlanMigrationSql: "authoring-plan-migration-without-content",
    studyUnitInspectionMigrationSql: "study-unit-inspection-migration-without-content",
    courseDesignMigrationSql: "course-design-migration-without-content",
    courseSourcesMigrationSql: "course-sources-migration-without-content",
    courseAnnotationsMigrationSql: "course-annotations-migration-without-content",
    courseAuditMigrationSql: "course-audit-migration-without-content",
    postCutoverMigrations: [
      {
        version: "20260818042341",
        name: "course_variant_comparisons",
        sql: "course-variants-migration-without-content"
      },
      {
        version: "20260818051209",
        name: "course_variant_comparison_listing",
        sql: "course-variant-listing-migration-without-content"
      },
      {
        version: "20260818052044",
        name: "course_variant_listing_manifest",
        sql: "course-variant-manifest-migration-without-content"
      }
    ],
    readSnapshot: async () => snapshot,
    createArtifactLoader,
    prepare: async () => preparation,
    now: () => new Date("2026-08-17T15:30:00Z")
  };
  try {
    const attestationDirectory = path.join(tempRoot, "private-evidence");
    await runCourseIdentityCutover({ ...common, attestationDirectory });
    const files = await fs.readdir(attestationDirectory);
    assert.equal(files.length, 1);
    assert.match(files[0], /-prepared\.json$/u);
    const report = JSON.parse(await fs.readFile(
      path.join(attestationDirectory, files[0]), "utf8"
    ));
    assert.deepEqual(Object.keys(report).sort(), [
      "contract", "courses", "generatedAt", "legacyAuditCounts",
      "legacyAuditHash", "migrationHash", "phase", "resolutionsHash", "snapshotHash"
    ]);
    assert.deepEqual(Object.keys(report.courses[0]).sort(), [
      "counts", "courseId", "documentHash", "entityStateHash", "manifestHash",
      "rowHash", "sourceReferenceHash"
    ]);
    assert.equal(JSON.stringify(report).includes("database-secret"), false);
    assert.equal(JSON.stringify(report).includes("user-secret"), false);
    assert.equal(JSON.stringify(report).includes("horizontal"), false);

    await assert.rejects(runCourseIdentityCutover({
      ...common,
      attestationDirectory: path.join(process.cwd(), "evidence-must-not-exist")
    }), (error) => error.code === "private_attestation_path_required");
    await assert.rejects(
      fs.stat(path.join(process.cwd(), "evidence-must-not-exist")),
      (error) => error.code === "ENOENT"
    );
  } finally {
    for (const directory of artifactDirectories) {
      await assert.rejects(fs.stat(directory), (error) => error.code === "ENOENT");
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
