#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildCourseCutoverSql,
  canonicalSha256,
  CourseCutoverImportError,
  prepareCourseCutover,
  verifyAppliedCourseCutover
} from "./courseCutoverImporter.mjs";
import {
  createRevisionArtifactLoader,
  readCourseCutoverSnapshot,
  readCourseCutoverVerification,
  runPsql
} from "./courseCutoverSource.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const DEFAULT_MIGRATION = path.join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260817140000_course_identity_cutover.sql"
);
const DEFAULT_PROFILE_ACCESS_MIGRATION = path.join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260817150000_course_profiles_access.sql"
);
const DEFAULT_AUTHORING_PLAN_MIGRATION = path.join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260817160000_course_authoring_plan.sql"
);
const DEFAULT_STUDY_UNIT_INSPECTION_MIGRATION = path.join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260817170000_course_study_unit_inspection.sql"
);
const DEFAULT_POOLER_URL = path.join(REPOSITORY_ROOT, "supabase/.temp/pooler-url");
const DEFAULT_PROJECT_REF = path.join(REPOSITORY_ROOT, "supabase/.temp/project-ref");
const DEFAULT_ATTESTATION_DIRECTORY = path.resolve(
  REPOSITORY_ROOT,
  "../AraLearn_private/evidence/course-cutover"
);
const SNAPSHOT_PROCESS_TIMEOUT_MS = 90_000;
const APPLY_PROCESS_TIMEOUT_MS = 12 * 60 * 1000;

function fail(code, message) {
  throw new CourseCutoverImportError(code, message);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArguments(argv) {
  const parsed = {
    apply: false,
    secretsStdin: false,
    resolutionsPath: null,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") parsed.apply = true;
    else if (argument === "--secrets-stdin") parsed.secretsStdin = true;
    else if (argument === "--help") parsed.help = true;
    else if (argument === "--resolutions") {
      parsed.resolutionsPath = argv[index + 1] || null;
      index += 1;
    } else {
      fail("invalid_cutover_argument", "Argumento desconhecido para o corte de Cursos.");
    }
  }
  return parsed;
}

async function readLimitedFile(filePath, maxBytes) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > maxBytes) {
    fail("invalid_cutover_file", "Arquivo auxiliar ausente ou acima do limite seguro.");
  }
  return fs.readFile(filePath, "utf8");
}

async function readStdinJson() {
  if (process.stdin.isTTY) {
    fail("cutover_secrets_required", "Segredos efêmeros não foram recebidos pela entrada padrão.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 64 * 1024) {
      fail("cutover_secrets_too_large", "Entrada de segredos excedeu o limite seguro.");
    }
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    fail("invalid_cutover_secrets", "Entrada de segredos não contém um objeto JSON válido.");
  }
}

function isInsideRepository(candidate) {
  const relative = path.relative(REPOSITORY_ROOT, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sha256Text(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function hasExactFields(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === allowed.size &&
    Object.keys(value).every((field) => allowed.has(field));
}

function assertSafeAttestation(report) {
  const preparedFields = new Set([
    "contract", "generatedAt", "snapshotHash", "resolutionsHash",
    "migrationHash", "phase", "courses"
  ]);
  const verifiedFields = new Set([
    ...preparedFields, "verifiedAt", "verification"
  ]);
  const reportFields = report?.phase === "verified" ? verifiedFields : preparedFields;
  const hashFields = ["snapshotHash", "resolutionsHash", "migrationHash"];
  const courseFields = new Set([
    "courseId", "manifestHash", "documentHash", "rowHash",
    "entityStateHash", "counts"
  ]);
  const countFields = new Set([
    "modules", "lessons", "topics", "microsequences", "studyUnits",
    "packageInstances", "sourceReferences", "topicReferences"
  ]);
  if (!hasExactFields(report, reportFields) ||
      report.contract !== "aralearn.course-cutover-attestation.v1" ||
      !new Set(["prepared", "verified"]).has(report.phase) ||
      !Number.isFinite(Date.parse(report.generatedAt)) ||
      hashFields.some((field) => !/^[0-9a-f]{64}$/u.test(report[field] || "")) ||
      !Array.isArray(report.courses) || report.courses.length < 1 ||
      report.courses.some((course) =>
        !hasExactFields(course, courseFields) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
          .test(course.courseId || "") ||
        ["manifestHash", "documentHash", "rowHash", "entityStateHash"]
          .some((field) => !/^[0-9a-f]{64}$/u.test(course[field] || "")) ||
        !course.counts || typeof course.counts !== "object" ||
        Array.isArray(course.counts) || Object.keys(course.counts).length < 1 ||
        Object.entries(course.counts).some(([field, value]) =>
          !countFields.has(field) || !Number.isSafeInteger(value) || value < 0)
      ) || (report.phase === "verified" && (
        !Number.isFinite(Date.parse(report.verifiedAt)) ||
        !hasExactFields(report.verification, new Set(["recomposed", "courseCount"])) ||
        report.verification.recomposed !== true ||
        report.verification.courseCount !== report.courses.length
      ))) {
    fail(
      "invalid_private_attestation",
      "A atestação privada contém campos ou valores fora do contrato seguro."
    );
  }
}

function attestationCourses(preparation) {
  return preparation.prepared.map(({ entry, manifest }) => ({
    courseId: entry.courseId,
    manifestHash: manifest.manifestHash,
    documentHash: manifest.documentHash,
    rowHash: manifest.rowHash,
    entityStateHash: manifest.entityStateHash,
    counts: manifest.counts
  })).sort((left, right) => left.courseId.localeCompare(right.courseId));
}

async function writePrivateAttestation(report, {
  directory = DEFAULT_ATTESTATION_DIRECTORY,
  runId
} = {}) {
  assertSafeAttestation(report);
  const absolute = path.resolve(directory);
  if (isInsideRepository(absolute)) {
    fail(
      "private_attestation_path_required",
      "A atestação do corte deve permanecer fora do repositório público."
    );
  }
  try {
    await fs.mkdir(absolute, { recursive: true });
    const filePath = path.join(
      absolute,
      `course-identity-${runId}-${report.phase}.json`
    );
    await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (error instanceof CourseCutoverImportError) throw error;
    fail(
      "private_attestation_write_failed",
      "A atestação privada do corte não pôde ser gravada."
    );
  }
}

async function readResolutions(resolutionsPath) {
  if (!resolutionsPath) return {};
  const absolute = path.resolve(resolutionsPath);
  if (isInsideRepository(absolute)) {
    fail(
      "private_resolution_path_required",
      "Resoluções semânticas do corte devem permanecer fora do repositório público."
    );
  }
  let value;
  try {
    value = JSON.parse(await readLimitedFile(absolute, 1024 * 1024));
  } catch (error) {
    if (error instanceof CourseCutoverImportError) throw error;
    fail("invalid_cutover_resolutions", "Arquivo privado de resoluções é inválido.");
  }
  if (value?.contract !== "aralearn.course-cutover-resolutions.v1" ||
      !value.planeAxes || typeof value.planeAxes !== "object" ||
      Array.isArray(value.planeAxes)) {
    fail("invalid_cutover_resolutions", "Contrato das resoluções semânticas é inválido.");
  }
  return value;
}

async function readOptionalLinkedFile(filePath) {
  try {
    return text(await readLimitedFile(filePath, 8 * 1024));
  } catch {
    return "";
  }
}

async function resolveSessions(stdinSecrets = {}) {
  const databaseUrl = text(
    stdinSecrets.databaseUrl || process.env.COURSE_CUTOVER_DATABASE_URL
  ) || await readOptionalLinkedFile(DEFAULT_POOLER_URL);
  const databasePassword = text(
    stdinSecrets.databasePassword || process.env.COURSE_CUTOVER_DATABASE_PASSWORD
  );
  const projectRef = await readOptionalLinkedFile(DEFAULT_PROJECT_REF);
  const supabaseUrl = text(
    stdinSecrets.supabaseUrl || process.env.COURSE_CUTOVER_SUPABASE_URL
  ) || (projectRef ? `https://${projectRef}.supabase.co` : "");
  const publishableKey = text(
    stdinSecrets.publishableKey || process.env.COURSE_CUTOVER_PUBLISHABLE_KEY
  );
  const accessToken = text(
    stdinSecrets.accessToken || process.env.COURSE_CUTOVER_USER_ACCESS_TOKEN
  );
  const dockerContainer = text(
    stdinSecrets.psqlContainer || process.env.COURSE_CUTOVER_PSQL_CONTAINER
  ) || "supabase_db_aralearn";
  if (!databaseUrl || !databasePassword || !supabaseUrl || !publishableKey ||
      !accessToken) {
    fail(
      "cutover_session_required",
      "O corte exige sessões novas do PostgreSQL e do usuário autenticado."
    );
  }
  return {
    database: {
      databaseUrl,
      password: databasePassword,
      dockerContainer
    },
    supabase: { supabaseUrl, publishableKey, accessToken }
  };
}

function aggregateSummary(preparation, applied) {
  const totals = preparation.summary.counts.reduce((result, item) => {
    for (const [name, value] of Object.entries(item)) {
      result[name] = (result[name] || 0) + value;
    }
    return result;
  }, {});
  return {
    status: applied ? "applied" : "validated",
    courseCount: preparation.summary.courseCount,
    artifactCount: preparation.summary.artifactCount,
    overlapCount: preparation.summary.overlapCount,
    entityCount: preparation.summary.entityCount,
    totals
  };
}

export async function runCourseIdentityCutover({
  apply = false,
  sessions,
  resolutions = {},
  migrationSql,
  profileAccessMigrationSql,
  authoringPlanMigrationSql,
  studyUnitInspectionMigrationSql,
  readSnapshot = readCourseCutoverSnapshot,
  createArtifactLoader = createRevisionArtifactLoader,
  prepare = prepareCourseCutover,
  buildSql = buildCourseCutoverSql,
  executeSql = runPsql,
  readVerification = readCourseCutoverVerification,
  verifyApplied = verifyAppliedCourseCutover,
  writeAttestation = writePrivateAttestation,
  attestationDirectory = DEFAULT_ATTESTATION_DIRECTORY,
  now = () => new Date()
} = {}) {
  if (!sessions?.database || !sessions?.supabase ||
      typeof migrationSql !== "string" ||
      typeof profileAccessMigrationSql !== "string" ||
      typeof authoringPlanMigrationSql !== "string" ||
      typeof studyUnitInspectionMigrationSql !== "string") {
    fail("invalid_cutover_execution", "Sessões ou migrations do corte estão ausentes.");
  }
  const snapshotSession = {
    ...sessions.database,
    processTimeoutMs: SNAPSHOT_PROCESS_TIMEOUT_MS
  };
  const firstSnapshot = await readSnapshot(snapshotSession);
  let artifactReader = null;
  try {
    artifactReader = await createArtifactLoader(sessions.supabase);
    const preparation = await prepare(firstSnapshot, {
      artifactLoader: artifactReader.loader,
      resolutions
    });
    const generatedAt = now().toISOString();
    const runId = `${generatedAt.replaceAll(/[^0-9]/gu, "")}-${process.pid}`;
    const attestationBase = {
      contract: "aralearn.course-cutover-attestation.v1",
      generatedAt,
      snapshotHash: preparation.snapshotHash,
      resolutionsHash: canonicalSha256(resolutions),
      migrationHash: sha256Text(
        `${migrationSql}\n${profileAccessMigrationSql}\n${authoringPlanMigrationSql}` +
          `\n${studyUnitInspectionMigrationSql}`
      )
    };
    await writeAttestation({
      ...attestationBase,
      phase: "prepared",
      courses: attestationCourses(preparation)
    }, { directory: attestationDirectory, runId });
    if (!apply) return aggregateSummary(preparation, false);

    const freshSnapshot = await readSnapshot(snapshotSession);
    if (canonicalSha256(freshSnapshot) !== preparation.snapshotHash) {
      fail(
        "course_cutover_source_drift",
        "A origem mudou entre o preflight e a transação; nenhuma escrita foi feita."
      );
    }
    const sql = buildSql(
      preparation,
      migrationSql,
      profileAccessMigrationSql,
      authoringPlanMigrationSql,
      studyUnitInspectionMigrationSql
    );
    await executeSql(sql, {
      ...sessions.database,
      processTimeoutMs: APPLY_PROCESS_TIMEOUT_MS
    });
    const verification = await readVerification({
      ...sessions.database,
      processTimeoutMs: SNAPSHOT_PROCESS_TIMEOUT_MS
    });
    const verifiedCourses = verifyApplied(preparation, verification);
    await writeAttestation({
      ...attestationBase,
      phase: "verified",
      verifiedAt: now().toISOString(),
      verification: {
        recomposed: true,
        courseCount: verifiedCourses.length
      },
      courses: verifiedCourses
    }, { directory: attestationDirectory, runId });
    return aggregateSummary(preparation, true);
  } finally {
    if (artifactReader?.directory) {
      await fs.rm(artifactReader.directory, { recursive: true, force: true });
    }
  }
}

function helpText() {
  return [
    "Uso: node scripts/courseCutover/runCourseIdentityCutover.mjs [opções]",
    "",
    "Sem --apply, não escreve no banco; valida e grava atestação privada.",
    "  --apply                 executa TEMP + COPY + migrations 1400/1500/1600/1700 em uma transação",
    "  --secrets-stdin         lê as sessões efêmeras de um objeto JSON no stdin",
    "  --resolutions ARQUIVO   lê decisões semânticas de arquivo fora do repositório",
    "  --help                  mostra esta ajuda",
    "",
    "Variáveis efêmeras aceitas: COURSE_CUTOVER_DATABASE_PASSWORD,",
    "COURSE_CUTOVER_PUBLISHABLE_KEY e COURSE_CUTOVER_USER_ACCESS_TOKEN.",
    "URL do banco/Supabase e contêiner psql também podem ser sobrescritos por",
    "COURSE_CUTOVER_DATABASE_URL, COURSE_CUTOVER_SUPABASE_URL e",
    "COURSE_CUTOVER_PSQL_CONTAINER."
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const argumentsValue = parseArguments(argv);
  if (argumentsValue.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  const stdinSecrets = argumentsValue.secretsStdin ? await readStdinJson() : {};
  const sessions = await resolveSessions(stdinSecrets);
  const resolutions = await readResolutions(argumentsValue.resolutionsPath);
  const migrationSql = await readLimitedFile(DEFAULT_MIGRATION, 4 * 1024 * 1024);
  const profileAccessMigrationSql = await readLimitedFile(
    DEFAULT_PROFILE_ACCESS_MIGRATION,
    4 * 1024 * 1024
  );
  const authoringPlanMigrationSql = await readLimitedFile(
    DEFAULT_AUTHORING_PLAN_MIGRATION,
    4 * 1024 * 1024
  );
  const studyUnitInspectionMigrationSql = await readLimitedFile(
    DEFAULT_STUDY_UNIT_INSPECTION_MIGRATION,
    4 * 1024 * 1024
  );
  const result = await runCourseIdentityCutover({
    apply: argumentsValue.apply,
    sessions,
    resolutions,
    migrationSql,
    profileAccessMigrationSql,
    authoringPlanMigrationSql,
    studyUnitInspectionMigrationSql
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    const code = error instanceof CourseCutoverImportError
      ? error.code
      : "course_cutover_failed";
    const message = error instanceof CourseCutoverImportError
      ? error.message
      : "O corte falhou sem expor detalhes potencialmente sensíveis.";
    process.stderr.write(`${JSON.stringify({ status: "aborted", code, message })}\n`);
    process.exitCode = 1;
  });
}
