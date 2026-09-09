import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeCourseSourcesRead, normalizeCourseStudyCitationsRead } from "../src/domain/courseSources.js";
import { normalizeCourseDesignRead, COURSE_DESIGN_PARAMETER_CATALOG_VERSION } from "../src/domain/courseDesignParameters.js";
import { normalizeCourseAnchoredAnnotationPage } from "../src/domain/courseAnchoredAnnotations.js";
import { compareRuntimeManifest } from "./verifyHostedBackend.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = path.join(repositoryRoot, "supabase", "migrations");
const migrationFilePattern = /^(?:001|\d{14})_[a-z0-9_]+\.sql$/u;
const defaultMigrations = Object.freeze([
  "20260902044404_cut_legacy_authoring_runtime.sql",
  "20260902123759_drop_legacy_chat_openai_action_origin.sql",
  "20260902160602_preserve_course_design_on_focal_mcp_corrections.sql",
  "20260902180219_count_expository_parameter_usage_in_analytics.sql",
  "20260902234800_bind_real_chatgpt_action_callback.sql",
  "20260903025658_harden_course_source_pdf_lifecycle.sql"
].map((name) => path.join(migrationDirectory, name)));
const defaultFixture = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "restore",
  "course-source-current-state-before-cut.sql"
);
const DEFAULT_SOURCE_CONTAINER = "supabase_db_aralearn";
const COURSE_ID = "74000000-0000-4000-8000-000000000002";
const ACTOR_ID = "74000000-0000-4000-8000-000000000001";
const CONTEXTUAL_BASE = "20260908105357_copyable_course_source_reader.sql";
const contextualFixture = path.join(repositoryRoot, "tests/fixtures/restore/contextual-state-before-354.sql");
const CONTEXT_OWNER = "74540000-0000-4000-8000-000000000001";
const CONTEXT_READER = "74540000-0000-4000-8000-000000000002";
const CONTEXT_PRIVATE = "74540000-0000-4000-8000-000000000101";
const CONTEXT_PUBLIC = "74540000-0000-4000-8000-000000000102";

// The fixed checkpoint proves the historical cut. The tail is always derived
// from the repository and must reach the exact current manifest, without gaps.
export function pendingUpgradeMigrations(names, boundary, expectedRevision, applied = []) {
  if (!Array.isArray(names) || names.some((name) => !migrationFilePattern.test(name)) ||
      new Set(names.map((name) => name.split("_", 1)[0])).size !== names.length || !names.includes(boundary) ||
      !/^\d{14}$/u.test(expectedRevision) || !Array.isArray(applied) ||
      applied.some((revision) => !/^(?:001|\d{14})$/u.test(revision))) {
    throw new TypeError("A cadeia de migrations ou sua história é inválida.");
  }
  const ordered = [...names].sort();
  if (ordered.at(-1).slice(0, 14) !== expectedRevision ||
      boundary.slice(0, 14) > expectedRevision || applied.some((revision) => revision > expectedRevision)) {
    throw new TypeError("A última migration e o manifesto corrente precisam coincidir.");
  }
  const revisions = new Set(applied);
  return ordered.filter((name) => name > boundary && !revisions.has(name.slice(0, 14)));
}

export function contextualUpgradeStages(tail) {
  if (!Array.isArray(tail) || tail.some((name, index) => !migrationFilePattern.test(name) || index > 0 && name <= tail[index - 1])) {
    throw new TypeError("A continuação contextual precisa de migrations ordenadas e únicas.");
  }
  const boundary = tail.indexOf(CONTEXTUAL_BASE);
  if (boundary < 0 || boundary === tail.length - 1) {
    throw new TypeError("O upgrade precisa atravessar a base de #353 antes de inserir a fixture contextual.");
  }
  return { beforeContextual: tail.slice(0, boundary + 1), contextual: tail.slice(boundary + 1) };
}

function command(command, args, { allowFailure = false, timeout = 120_000, input } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    input,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim().slice(-8000);
    throw new Error(`${command} falhou (${result.status}).${detail ? `\n${detail}` : ""}`);
  }
  return result;
}

function insideRepository(candidate, expectedDirectory, pattern) {
  const absolute = path.resolve(repositoryRoot, candidate);
  const directory = path.resolve(repositoryRoot, expectedDirectory);
  const relative = path.relative(directory, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) ||
      !pattern.test(relative.replaceAll("\\", "/"))) {
    throw new TypeError(`Arquivo fora do escopo permitido: ${candidate}`);
  }
  return absolute;
}

function argumentsFrom(argv) {
  const values = { migrations: [], fixture: defaultFixture,
    sourceContainer: DEFAULT_SOURCE_CONTAINER };
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!value || !new Set(["--migration", "--fixture", "--source-container"]).has(name)) {
      throw new TypeError(
        "Use --migration <arquivo> (repetível), --fixture <arquivo> ou " +
        "--source-container <nome>."
      );
    }
    if (name === "--migration") values.migrations.push(value);
    if (name === "--fixture") values.fixture = value;
    if (name === "--source-container") values.sourceContainer = value;
  }
  if (!/^supabase_db_[a-z0-9_-]+$/u.test(values.sourceContainer)) {
    throw new TypeError("O contêiner de origem precisa ser uma stack Supabase local.");
  }
  if (values.migrations.length === 0) values.migrations.push(...defaultMigrations);
  values.migrations = values.migrations.map((migration) => insideRepository(
    migration, "supabase/migrations", migrationFilePattern
  ));
  const migrationNames = values.migrations.map((migration) => path.basename(migration));
  if (migrationNames.some((name, index) => index > 0 &&
      name <= migrationNames[index - 1])) {
    throw new TypeError("As migrations precisam estar em ordem estritamente crescente.");
  }
  values.fixture = insideRepository(
    values.fixture,
    "tests/fixtures/restore",
    /^[a-z0-9_-]+\.sql$/u
  );
  return values;
}

function containerRunning(name) {
  const result = command("docker", [
    "inspect", "--format", "{{.State.Running}}", name
  ], { allowFailure: true });
  return result.status === 0 && result.stdout.trim() === "true";
}

async function waitForPostgres(container) {
  let stableReads = 0;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const health = command("docker", [
      "inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
      container
    ], { allowFailure: true, timeout: 5000 });
    const ready = health.status === 0 && new Set(["healthy", "none"]).has(
      health.stdout.trim()
    ) ? command("docker", [
        "exec", container, "psql", "-U", "supabase_admin", "-d", "postgres",
        "-X", "-At", "-c",
        "select not pg_is_in_recovery() and current_setting('transaction_read_only')='off'"
      ], { allowFailure: true, timeout: 5000 }) : { status: 1, stdout: "" };
    stableReads = ready.status === 0 && ready.stdout.trim() === "t" ? stableReads + 1 : 0;
    if (stableReads >= 3) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`O Postgres descartável ${container} não ficou pronto.`);
}

async function startDisposableContainer(container, image) {
  command("docker", [
    "run", "--detach", "--network", "none", "--name", container, "--entrypoint", "sh", image,
    "-c", "docker-entrypoint.sh postgres -D /etc/postgresql"
  ]);
  await waitForPostgres(container);
}

async function recoverPostgresDatabase(container) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const exists = command("docker", [
      "exec", container, "psql", "-U", "supabase_admin", "-d", "template1",
      "-X", "-At", "-c", "select exists(select 1 from pg_database where datname='postgres')"
    ], { allowFailure: true, timeout: 5000 });
    if (exists.status === 0) {
      const repaired = exists.stdout.trim() === "t"
        ? command("docker", [
          "exec", container, "psql", "-U", "supabase_admin", "-d", "template1",
          "-v", "ON_ERROR_STOP=1", "-c", "alter database postgres with allow_connections true"
        ], { allowFailure: true })
        : command("docker", [
          "exec", container, "createdb", "-U", "supabase_admin", "-T", "template0", "postgres"
        ], { allowFailure: true });
      if (repaired.status === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("O banco descartável não pôde ser recuperado para nova tentativa.");
}

async function resetPostgresDatabase(container) {
  let lastFailure = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForPostgres(container);
    const steps = [[
      "exec", container, "psql", "-U", "supabase_admin", "-d", "template1",
      "-v", "ON_ERROR_STOP=1", "-c", "alter database postgres with allow_connections false"
    ], [
      "exec", container, "psql", "-U", "supabase_admin", "-d", "template1",
      "-v", "ON_ERROR_STOP=1", "-c",
      "select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres'"
    ], ["exec", container, "dropdb", "-U", "supabase_admin", "postgres"], [
      "exec", container, "createdb", "-U", "supabase_admin", "-T", "template0", "postgres"
    ]];
    let complete = true;
    for (const args of steps) {
      const result = command("docker", args, { allowFailure: true });
      if (result.status !== 0) {
        complete = false;
        lastFailure = String(result.stderr || result.stdout || "").trim().slice(-2000);
        break;
      }
    }
    if (complete) {
      await waitForPostgres(container);
      return;
    }
    await recoverPostgresDatabase(container);
  }
  throw new Error(`Não foi possível preparar o banco descartável.\n${lastFailure}`.trim());
}

function bounded(stream, limit = 64 * 1024) {
  let text = "";
  stream.on("data", (chunk) => {
    text = (text + chunk.toString("utf8")).slice(-limit);
  });
  return () => text;
}

async function pipeProcesses(sourceCommand, sourceArgs, targetCommand, targetArgs) {
  const source = spawn(sourceCommand, sourceArgs, { cwd: repositoryRoot });
  const target = spawn(targetCommand, targetArgs, { cwd: repositoryRoot });
  const sourceError = bounded(source.stderr);
  const targetError = bounded(target.stderr);
  source.stdout.pipe(target.stdin);
  const close = (child) => new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
  const [sourceCode, targetCode] = await Promise.all([close(source), close(target)]);
  if (sourceCode !== 0 || targetCode !== 0) {
    throw new Error(
      `A transferência do backup falhou (${sourceCode}/${targetCode}).\n` +
      `${sourceError()}\n${targetError()}`.trim()
    );
  }
}

async function cloneDatabase(source, target) {
  await resetPostgresDatabase(target);
  await pipeProcesses(
    "docker",
    // Only platform structure prepares this historical fixture. Current rows
    // would be discarded below and may depend on catalog data during COPY.
    // The later dump/restore of the actual proof still includes all its data.
    ["exec", source, "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc", "--no-owner",
      "--schema-only"],
    "docker",
    ["exec", "-i", target, "pg_restore", "-U", "supabase_admin", "-d", "postgres",
      "--no-owner", "--exit-on-error"]
  );
}

function resetDisposableApplicationState(container, firstFinalMigration) {
  const finalBoundary = path.basename(firstFinalMigration).slice(0, 14);
  const sql = `
    begin;
    do $drop_storage_policies$
    declare policy_value record;
    begin
      for policy_value in
        select schemaname,tablename,policyname from pg_policies where schemaname='storage'
      loop
        execute format(
          'drop policy %I on %I.%I',
          policy_value.policyname,policy_value.schemaname,policy_value.tablename
        );
      end loop;
    end;
    $drop_storage_policies$;
    drop schema if exists private cascade;
    drop schema if exists public cascade;
    create schema public authorization pg_database_owner;
    grant usage on schema public to public;
    truncate table auth.users cascade;
    delete from supabase_migrations.schema_migrations
    where version >= '${finalBoundary}';
    commit;
  `;
  command("docker", [
    "exec", container, "psql", "-U", "supabase_admin", "-d", "postgres",
    "-X", "-v", "ON_ERROR_STOP=1", "-c", sql
  ]);
}

function migrationsBefore(firstMigration) {
  const boundary = path.basename(firstMigration);
  const names = readdirSync(migrationDirectory)
    .filter((name) => migrationFilePattern.test(name) && name < boundary)
    .sort();
  if (names.length === 0) {
    throw new Error(`Não há migrations anteriores a ${boundary}.`);
  }
  return names;
}

function applyMigrationFiles(container, migrationNames, containerDirectory) {
  // Like the CLI, record each successful migration before the next preflight.
  // One psql process keeps that ordering without hundreds of Docker processes.
  const input = migrationNames.map((name) =>
    `\\i ${containerDirectory}/${name}\n${migrationRecordSql(name)};\n`).join("");
  command("docker", ["cp", migrationDirectory, `${container}:${containerDirectory}`]);
  command("docker", [
    "exec", "-i", container, "psql", "-U", "supabase_admin", "-d", "postgres",
    "-X", "-v", "ON_ERROR_STOP=1"
  ], { timeout: 15 * 60_000, input });
}

async function restoreBackupFile(source, backupPath, target) {
  await resetPostgresDatabase(target);
  await pipeProcesses(
    "docker",
    ["exec", source, "cat", backupPath],
    "docker",
    ["exec", "-i", target, "pg_restore", "-U", "supabase_admin", "-d", "postgres",
      "--no-owner", "--exit-on-error"]
  );
}

function copyAndApply(container, localPath, containerPath) {
  command("docker", ["cp", localPath, `${container}:${containerPath}`]);
  command("docker", [
    "exec", container, "psql", "-U", "supabase_admin", "-d", "postgres",
    "-X", "-v", "ON_ERROR_STOP=1", "-f", containerPath
  ]);
}

function migrationRecordSql(migration) {
  const match = /^(001|\d{14})_([a-z0-9_]+)\.sql$/u.exec(path.basename(migration));
  if (!match) throw new TypeError(`Migration final inválida: ${migration}`);
  return "insert into supabase_migrations.schema_migrations(version,statements,name) " +
    `values('${match[1]}',null,'${match[2]}') on conflict(version) do update set name=excluded.name`;
}

function queryJson(container, sql) {
  const result = command("docker", [
    "exec", container, "psql", "-U", "supabase_admin", "-d", "postgres",
    "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql
  ]);
  const value = result.stdout.trim();
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`A consulta de prova não devolveu JSON: ${value.slice(0, 1000)}`);
  }
}

// Restore reparses BETWEEN into associative AND checks. PostgreSQL's own
// pretty deparser removes those redundant parentheses without changing a
// predicate. Only the four observed CHECK definitions receive this treatment;
// every other schema byte (apart from the random psql guard) remains compared.
export function normalizeApplicationSchemaDump(source, constraints = []) {
  let normalized = source.replaceAll("\r\n", "\n")
    .split("\n").filter((line) => !/^\\(?:un)?restrict \S+$/u.test(line)).join("\n");
  for (const { identifier, definition, canonical } of constraints) {
    const prefix = `    CONSTRAINT ${identifier} `;
    const literal = `${prefix}${definition}`;
    assert.equal(normalized.split(literal).length - 1, 1,
      `A definição CHECK ${identifier} não aparece uma única vez no dump.`);
    normalized = normalized.replace(literal, `${prefix}${canonical}`);
  }
  return normalized;
}

function applicationSchemaDump(container) {
  const constraints = queryJson(container, `select jsonb_agg(jsonb_build_object(
    'identifier',quote_ident(conname),'definition',pg_get_constraintdef(oid,false),
    'canonical',pg_get_constraintdef(oid,true)) order by conname)
    from pg_constraint where conname in ('course_instructional_plans_part_range_v1',
      'course_source_anchors_excerpt_v1','course_source_anchors_human_locator_v1',
      'course_source_anchors_identity_v1') and contype='c'`);
  assert.equal(constraints.length, 4, "Os quatro CHECKs de recuperação precisam existir.");
  return normalizeApplicationSchemaDump(command("docker", [
    "exec", container, "pg_dump", "-U", "supabase_admin", "-d", "postgres",
    "--schema-only", "--schema=public", "--schema=private", "--no-owner"
  ]).stdout, constraints);
}

const technicalMeasureSql = `
  select jsonb_build_object(
    'buckets',(select count(*) from storage.buckets),
    'storageObjectPolicies',(select count(*) from pg_policies
      where schemaname='storage' and tablename='objects'),
    'pdfStoragePolicies',(select count(*) from pg_policies
      where schemaname='storage' and tablename='objects'
        and (coalesce(qual,'')||coalesce(with_check,'')) like '%course-source-pdfs%'),
    'sourceTables',(select count(*) from pg_class relation
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='private' and relation.relkind='r'
        and relation.relname like 'course_source%'),
    'sourceColumns',(select count(*) from pg_attribute attribute
      join pg_class relation on relation.oid=attribute.attrelid
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='private' and relation.relkind='r'
        and relation.relname like 'course_source%'
        and attribute.attnum>0 and not attribute.attisdropped),
    'sourceIndexes',(select count(*) from pg_index index_value
      join pg_class relation on relation.oid=index_value.indrelid
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='private' and relation.relname like 'course_source%'),
    'sourceConstraints',(select count(*) from pg_constraint constraint_value
      join pg_class relation on relation.oid=constraint_value.conrelid
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='private' and relation.relname like 'course_source%'),
    'sourceTriggers',(select count(*) from pg_trigger trigger_value
      join pg_class relation on relation.oid=trigger_value.tgrelid
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='private' and relation.relname like 'course_source%'
        and not trigger_value.tgisinternal),
    'sourceFunctions',(select count(*) from pg_proc function_value
      join pg_namespace namespace on namespace.oid=function_value.pronamespace
      where namespace.nspname in('public','private') and function_value.prokind in('f','p')
        and pg_get_functiondef(function_value.oid) like '%course_source%')
  )
`;

const beforeStateSql = `
  select jsonb_build_object(
    'migrationRevision',(select max(version) from supabase_migrations.schema_migrations),
    'course',(select jsonb_build_object('title',title,'revision',revision)
      from public.courses where id='${COURSE_ID}'),
    'planItems',(select jsonb_object_agg(item_kind,value) from(
      select item_kind,count(*) value from private.course_instructional_plan_items
      where course_id='${COURSE_ID}' group by item_kind
    ) counted),
    'parts',(select count(*) from private.course_authoring_parts
      where course_id='${COURSE_ID}'),
    'materializations',(select count(*) from private.course_authoring_part_materializations
      where course_id='${COURSE_ID}'),
    'steps',(select count(*) from private.course_authoring_part_materialization_steps
      where course_id='${COURSE_ID}'),
    'sourceRevisions',(select count(*) from private.course_source_revisions
      where course_id='${COURSE_ID}'),
    'legacySource',(select jsonb_build_object(
      'rows',count(*),
      'idLength',max(char_length(source_id)),
      'status',max(status),
      'origin',max(origin),
      'citationMissing',bool_and(citation_text is null),
      'linkedAsLegacy',(select count(*) from private.course_source_attribution_sources link
        where link.course_id='${COURSE_ID}' and link.source_id=repeat('legacy-ref-',26)||'end'
          and link.relation='legacy_reference')
    ) from private.course_source_revisions where course_id='${COURSE_ID}'
      and source_id=repeat('legacy-ref-',26)||'end'),
    'anchorRevisions',(select count(*) from private.course_source_anchor_revisions
      where course_id='${COURSE_ID}'),
    'attributionRevisions',(select count(*) from private.course_source_attributions
      where course_id='${COURSE_ID}'),
    'attachments',(select jsonb_object_agg(status,value) from(
      select status,count(*) value from private.course_source_attachments
      where course_id='${COURSE_ID}' group by status
    ) counted),
    'uploadIntents',(select jsonb_build_object(
      'open',count(*) filter(where expires_at>statement_timestamp()),
      'expired',count(*) filter(where expires_at<=statement_timestamp())
    ) from private.course_source_pdf_upload_intents where course_id='${COURSE_ID}'),
    'deleteIntents',(select count(*) from private.course_source_pdf_delete_intents
      where course_id='${COURSE_ID}'),
    'observations',(select jsonb_object_agg(state,value) from(
      select state,count(*) value from private.course_anchored_annotations
      where course_id='${COURSE_ID}' group by state
    ) counted),
    'receipts',(select jsonb_build_object(
      'open',count(*) filter(where expires_at>statement_timestamp()),
      'expired',count(*) filter(where expires_at<=statement_timestamp())
    ) from private.course_change_receipts where course_id='${COURSE_ID}'),
    'storageObjects',(select count(*) from storage.objects
      where bucket_id='course-source-pdfs' and name like '${COURSE_ID}/%')
  )
`;

const afterStateSql = `
  select jsonb_build_object(
    'manifestRevision',public.get_aralearn_runtime_manifest()->>'schemaRevision',
    'migrationRevision',(select max(version) from supabase_migrations.schema_migrations),
    'course',(select jsonb_build_object('title',title,'revision',revision)
      from public.courses where id='${COURSE_ID}'),
    'structure',(select jsonb_object_agg(entity_type,value) from(
      select entity_type,count(*) value from private.course_entities
      where course_id='${COURSE_ID}' group by entity_type
    ) counted),
    'planItems',(select jsonb_object_agg(item_kind,value) from(
      select item_kind,count(*) value from private.course_instructional_plan_items
      where course_id='${COURSE_ID}' group by item_kind
    ) counted),
    'parts',(select count(*) from private.course_authoring_parts
      where course_id='${COURSE_ID}'),
    'partMicrosequences',(select count(*)
      from private.course_authoring_part_didactic_microsequences
      where course_id='${COURSE_ID}'),
    'studyUnitDesign',(select jsonb_build_object(
      'snapshotContract',design_snapshot->>'contract',
      'applicationContract',design_application->>'contract',
      'ceiling',(select parameter.value->'value'
        from jsonb_array_elements(design_snapshot->'parameters') parameter(value)
        where parameter.value->>'parameterId'
          ='new_analysis_unit_ceiling_per_expository_study_unit'),
      'introduced',design_application->'introducedInstructionalAnalysisUnitIds',
      'createdOrigin',created_origin,
      'lastRevisionOrigin',last_revision_origin
    ) from private.course_entities where course_id='${COURSE_ID}'
      and entity_type='study_unit' and entity_id='unit-restore'),
    'configuration',jsonb_build_object(
      'parameter',(select value from private.course_design_parameter_assignments
        where course_id='${COURSE_ID}' and scope_kind='didactic_microsequence'
          and scope_ref='micro-restore'
          and parameter_id='new_analysis_unit_ceiling_per_expository_study_unit'),
      'guidance',(select guidance from private.course_authoring_guidance_assignments
        where course_id='${COURSE_ID}' and scope_kind='didactic_microsequence'
          and scope_ref='micro-restore'),
      'componentPolicy',(select policy->>'availability'
        from private.course_component_policy_assignments
        where course_id='${COURSE_ID}' and scope_kind='didactic_microsequence'
          and scope_ref='micro-restore')
    ),
    'source',(select jsonb_build_object(
      'rows',count(*),'title',max(title),'version',max(revision)
    ) from private.course_sources where course_id='${COURSE_ID}'
      and source_id='source-restore'),
    'importedLegacySource',(select jsonb_build_object(
      'rows',count(*),
      'idChanged',bool_and(source_id<>repeat('legacy-ref-',26)||'end'),
      'idWithinCurrentLimit',bool_and(char_length(source_id)<=240),
      'status',max(status),
      'kind',max(kind),
      'title',max(title),
      'citationPreserved',bool_and(citation_text=repeat('legacy-ref-',26)||'end'),
      'origin',max(origin),
      'availability',max(availability),
      'verificationStatus',max(verification_status),
      'studyVisibility',max(study_visibility)
    ) from private.course_sources where course_id='${COURSE_ID}'
      and citation_text=repeat('legacy-ref-',26)||'end'),
    'importedLegacyLink',(select jsonb_build_object(
      'rows',count(*),'relation',max(link.relation),
      'target',max(attribution.target_id),
      'sourceMatches',bool_and(link.source_id=source.source_id)
    ) from private.course_source_attribution_sources link
      join private.course_source_attributions attribution
        on attribution.course_id=link.course_id and attribution.id=link.attribution_id
      join private.course_sources source
        on source.course_id=link.course_id and source.source_id=link.source_id
      where link.course_id='${COURSE_ID}'
        and source.citation_text=repeat('legacy-ref-',26)||'end'),
    'legacySourceEnums',jsonb_build_object(
      'sourceStatus',(select count(*) from private.course_sources
        where course_id='${COURSE_ID}' and status='unresolved_legacy'),
      'sourceOrigin',(select count(*) from private.course_sources
        where course_id='${COURSE_ID}' and origin='imported_legacy'),
      'linkRelation',(select count(*) from private.course_source_attribution_sources link
        where link.course_id='${COURSE_ID}' and link.relation='legacy_reference')
    ),
    'anchor',(select jsonb_build_object(
      'rows',count(*),'locator',max(human_locator),'version',max(revision),
      'sourceVersion',max(source_revision)
    ) from private.course_source_anchors where course_id='${COURSE_ID}'
      and anchor_id='anchor-restore'),
    'attribution',(select jsonb_build_object(
      'rows',(select count(*) from private.course_source_attributions
        where course_id='${COURSE_ID}' and target_kind='study_unit'
          and target_id='unit-restore'),
      'targetVersion',(select max(target_version) from private.course_source_attributions
        where course_id='${COURSE_ID}' and target_kind='study_unit'
          and target_id='unit-restore'),
      'sourceIds',(select jsonb_agg(link.source_id order by link.source_ordinal)
        from private.course_source_attribution_sources link
        join private.course_source_attributions attribution
          on attribution.course_id=link.course_id and attribution.id=link.attribution_id
        where attribution.course_id='${COURSE_ID}'
          and attribution.target_kind='study_unit' and attribution.target_id='unit-restore'),
      'anchorIds',(select jsonb_agg(link.anchor_id order by link.anchor_ordinal)
        from private.course_source_attribution_anchors link
        join private.course_source_attributions attribution
          on attribution.course_id=link.course_id and attribution.id=link.attribution_id
        where attribution.course_id='${COURSE_ID}'
          and attribution.target_kind='study_unit' and attribution.target_id='unit-restore'),
      'technicalColumns',(select count(*) from information_schema.columns
        where table_schema='private' and table_name in(
          'course_source_attributions','course_source_attribution_sources',
          'course_source_attribution_anchors'
        ) and column_name in(
          'revision','attribution_hash','source_revision','anchor_revision'
        ))
    )),
    'attachments',(select jsonb_build_object(
      'active',count(*) filter(where status='active'),
      'removed',count(*) filter(where status='removed'),
      'sourceVersions',jsonb_agg(distinct source_revision order by source_revision)
    ) from private.course_source_attachments where course_id='${COURSE_ID}'),
    'uploadIntents',(select jsonb_build_object(
      'open',count(*) filter(where expires_at>statement_timestamp()),
      'expired',count(*) filter(where expires_at<=statement_timestamp())
    ) from private.course_source_pdf_upload_intents where course_id='${COURSE_ID}'),
    'deleteIntents',(select count(*) from private.course_source_pdf_delete_intents
      where course_id='${COURSE_ID}'),
    'observations',(select jsonb_object_agg(state,value) from(
      select state,count(*) value from private.course_anchored_annotations
      where course_id='${COURSE_ID}' group by state
    ) counted),
    'resolvedObservationSourceLinks',(select owner_response_source_links
      from private.course_anchored_annotations
      where course_id='${COURSE_ID}'
        and id='74000000-0000-4000-8000-000000000021'),
    'studyCitations',(private.course_study_citations_payload_v1(
      '${COURSE_ID}','unit-restore',4
    )->'citations'),
    'receipts',(select jsonb_build_object(
      'open',count(*) filter(where expires_at>statement_timestamp()),
      'expired',count(*) filter(where expires_at<=statement_timestamp())
    ) from private.course_change_receipts where course_id='${COURSE_ID}'),
    'legacy',jsonb_build_object(
      'sourceRevisions',to_regclass('private.course_source_revisions') is not null,
      'anchorRevisions',to_regclass('private.course_source_anchor_revisions') is not null,
      'materializations',to_regclass('private.course_authoring_part_materializations') is not null,
      'steps',to_regclass('private.course_authoring_part_materialization_steps') is not null,
      'events',to_regclass('private.course_events') is not null
    ),
    'storageObjects',(select count(*) from storage.objects
      where bucket_id='course-source-pdfs' and name like '${COURSE_ID}/%')
  )
`;

function assertBeforeState(state, expectedMigrationRevision) {
  assert.deepEqual(state, {
    migrationRevision: expectedMigrationRevision,
    course: { title: "Curso descartável de restauração", revision: 4 },
    planItems: {
      evidence_requirement: 1,
      instructional_analysis_unit: 1,
      intended_learning_outcome: 1
    },
    parts: 1,
    materializations: 2,
    steps: 2,
    sourceRevisions: 3,
    legacySource: {
      rows: 1,
      idLength: 289,
      status: "unresolved_legacy",
      origin: "imported_legacy",
      citationMissing: true,
      linkedAsLegacy: 1
    },
    anchorRevisions: 2,
    attributionRevisions: 2,
    attachments: { active: 1, removed: 1 },
    uploadIntents: { open: 1, expired: 1 },
    deleteIntents: 1,
    observations: { open: 1, resolved: 1 },
    receipts: { open: 1, expired: 1 },
    storageObjects: 0
  });
}

function assertAfterState(state, expectedManifestRevision) {
  assert.equal(state.manifestRevision, expectedManifestRevision);
  assert.equal(state.migrationRevision, expectedManifestRevision);
  assert.deepEqual(state.course, {
    title: "Curso descartável de restauração",
    revision: 4
  });
  assert.deepEqual(state.structure, {
    lesson: 1,
    microsequence: 1,
    module: 1,
    study_unit: 1
  });
  assert.deepEqual(state.planItems, {
    evidence_requirement: 1,
    instructional_analysis_unit: 1,
    intended_learning_outcome: 1
  });
  assert.equal(state.parts, 1);
  assert.equal(state.partMicrosequences, 1);
  assert.deepEqual(state.studyUnitDesign, {
    snapshotContract: "aralearn.study-unit-design-snapshot.v1",
    applicationContract: "aralearn.study-unit-design-application.v1",
    ceiling: 1,
    introduced: ["74000000-0000-4000-8000-000000000012"],
    createdOrigin: "gpt",
    lastRevisionOrigin: "gpt"
  });
  assert.deepEqual(state.configuration, {
    parameter: 1,
    guidance: "Use títulos diretos e preserve toda novidade necessária.",
    componentPolicy: "all"
  });
  assert.deepEqual(state.source, { rows: 1, title: "Título corrente", version: 2 });
  assert.deepEqual(state.importedLegacySource, {
    rows: 1,
    idChanged: true,
    idWithinCurrentLimit: true,
    status: "active",
    kind: "other",
    title: "Referência importada",
    citationPreserved: true,
    origin: "imported",
    availability: "unknown",
    verificationStatus: "unverified",
    studyVisibility: "hidden"
  });
  assert.deepEqual(state.importedLegacyLink, {
    rows: 1,
    relation: "needs_verification",
    target: "unit-restore",
    sourceMatches: true
  });
  assert.deepEqual(state.legacySourceEnums, {
    sourceStatus: 0,
    sourceOrigin: 0,
    linkRelation: 0
  });
  assert.deepEqual(state.anchor, {
    rows: 1,
    locator: "pp. 2–3",
    version: 2,
    sourceVersion: 2
  });
  assert.equal(state.attribution.rows, 1);
  assert.equal(state.attribution.targetVersion, 1);
  assert.equal(state.attribution.sourceIds[0], "source-restore");
  assert.match(state.attribution.sourceIds[1], /^[0-9a-f-]{36}$/u);
  assert.deepEqual(state.attribution.anchorIds, ["anchor-restore"]);
  assert.equal(state.attribution.technicalColumns, 0);
  assert.deepEqual(state.attachments, {
    active: 1,
    removed: 1,
    sourceVersions: [2]
  });
  assert.deepEqual(state.uploadIntents, { open: 1, expired: 0 });
  assert.equal(state.deleteIntents, 1);
  assert.deepEqual(state.observations, { open: 1, resolved: 1 });
  assert.deepEqual(state.resolvedObservationSourceLinks, [{
    sourceId: "source-restore",
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-restore" }]
  }]);
  assert.equal(state.studyCitations.length, 1);
  assert.equal(state.studyCitations[0].sourceId, "source-restore");
  assert.deepEqual(state.studyCitations[0].anchors.map(({ anchorId }) => anchorId), [
    "anchor-restore"
  ]);
  assert.deepEqual(state.receipts, { open: 1, expired: 0 });
  assert.deepEqual(state.legacy, {
    sourceRevisions: false,
    anchorRevisions: false,
    materializations: false,
    steps: false,
    events: false
  });
  assert.equal(state.storageObjects, 0);
}

// These are the useful fields shared by the historical checkpoint and today's
// model. Generated catalogs and newly explicit metadata have separate checks.
const preservedStateSql = `select jsonb_build_object(
  'course',(select to_jsonb(v) from (select id,owner_id,title,goal,revision
    from public.courses where id='${COURSE_ID}') v),
  'entities',(select jsonb_agg(to_jsonb(v) order by entity_type,entity_id) from (
    select entity_type,entity_id,parent_type,parent_id,position,content,version,
      created_origin,last_revision_origin from private.course_entities where course_id='${COURSE_ID}') v),
  'plan',(select to_jsonb(v) from (select id,audience,instructional_scope,
    preferred_authoring_part_min,preferred_authoring_part_max,part_count_origin,version
    from private.course_instructional_plans where course_id='${COURSE_ID}') v),
  'planItems',(select jsonb_agg(to_jsonb(v) order by id) from (select id,instructional_plan_id,
    item_kind,position,statement,version from private.course_instructional_plan_items
    where course_id='${COURSE_ID}') v),
  'parameters',(select jsonb_agg(to_jsonb(v) order by scope_kind,scope_ref,parameter_id) from (
    select scope_kind,scope_ref,parameter_id,value,origin,reason
    from private.course_design_parameter_assignments where course_id='${COURSE_ID}') v),
  'guidance',(select jsonb_agg(to_jsonb(v) order by scope_kind,scope_ref) from (
    select scope_kind,scope_ref,guidance,origin,reason
    from private.course_authoring_guidance_assignments where course_id='${COURSE_ID}') v),
  'parts',(select jsonb_agg(to_jsonb(v) order by id) from (select id,instructional_plan_id,
    position,title,intent,version from private.course_authoring_parts where course_id='${COURSE_ID}') v),
  'memberships',(select jsonb_agg(to_jsonb(v) order by authoring_part_id,didactic_microsequence_id)
    from private.course_authoring_part_didactic_microsequences v where course_id='${COURSE_ID}'),
  'sources',(select jsonb_agg(to_jsonb(v) order by source_id) from (select source_id,revision,status,
    kind,title,publication_date,identifier,language,citation_text,url,edition_or_version,
    origin,availability,verification_status,study_visibility from private.course_sources
    where course_id='${COURSE_ID}') v),
  'anchors',(select jsonb_agg(to_jsonb(v) order by anchor_id) from (select anchor_id,revision,
    source_id,source_revision,status,selector,verification_excerpt,human_locator
    from private.course_source_anchors where course_id='${COURSE_ID}') v),
  'attachments',(select jsonb_agg(to_jsonb(v) order by source_id,content_hash) from (select source_id,
    source_revision,content_hash,byte_size,media_type,storage_path,status,version
    from private.course_source_attachments where course_id='${COURSE_ID}') v),
  'observations',(select jsonb_agg(to_jsonb(v) order by id) from (select id,actor_id,target_kind,
    target_id,raw_text,state,owner_response,version from private.course_anchored_annotations
    where course_id='${COURSE_ID}') v),
  'appliedDecisions',(select jsonb_agg(jsonb_build_object('id',entity_id,
    'appliedAt',design_snapshot->'appliedAt','parameters',(
      select jsonb_agg(value-'reason' order by value->>'parameterId')
      from jsonb_array_elements(design_snapshot->'parameters')))
    order by entity_id) from private.course_entities
    where course_id='${COURSE_ID}' and design_snapshot is not null)
)`;

const contextualStateSql = `select jsonb_build_object(
  'courses',(select jsonb_agg(to_jsonb(v) order by id) from (select id,owner_id,title,goal,revision,visibility,annotation_set_version
    from public.courses where id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}')) v),
  'entities',(select jsonb_agg(to_jsonb(v) order by course_id,entity_type,entity_id) from (select course_id,entity_type,entity_id,
    parent_type,parent_id,position,content,version,created_origin,last_revision_origin,design_snapshot,design_application
    from private.course_entities where course_id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}')) v),
  'reviews',(select jsonb_agg(jsonb_build_object('courseId',course_id,'entityType',entity_type,'entityId',entity_id,'value',content_review)
    order by course_id,entity_type,entity_id) from private.course_entities
    where course_id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}') and entity_type in('microsequence','study_unit')),
  'access',(select jsonb_agg(to_jsonb(v) order by course_id,user_id) from public.course_access v where course_id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}')),
  'sources',(select jsonb_agg(to_jsonb(v) order by course_id,source_id) from private.course_sources v where course_id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}')),
  'attributions',(select jsonb_agg(to_jsonb(v) order by course_id,id) from private.course_source_attributions v where course_id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}')),
  'sourceLinks',(select jsonb_agg(to_jsonb(v) order by course_id,attribution_id,source_ordinal) from private.course_source_attribution_sources v where course_id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}')),
  'observations',(select jsonb_agg(to_jsonb(v) order by id) from private.course_anchored_annotations v where course_id='${CONTEXT_PRIVATE}'),
  'observationReceipts',(select jsonb_agg(to_jsonb(v) order by request_id) from private.course_change_receipts v
    where course_id='${CONTEXT_PRIVATE}' and operation='execute_course_anchored_annotation'),
  'changeReceipts',(select jsonb_agg(to_jsonb(v) order by request_id) from private.course_change_receipts v where course_id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}'))
)`;

export function assertContextualPreservation(before, after) {
  assert.equal(before.courses.length, 2, "A prova contextual exige os cursos privado e explicitamente público.");
  assert.deepEqual(before.courses.map(({ id, visibility }) => ({ id, visibility })), [
    { id: CONTEXT_PRIVATE, visibility: "private" }, { id: CONTEXT_PUBLIC, visibility: "public" }
  ]);
  assert.equal(before.entities.length, 10, "A fixture precisa de duas bases e quatro unidades completas.");
  assert.equal(before.sources.length, 2);
  assert.equal(before.attributions.length, 4);
  assert.equal(before.access.length, 1);
  assert.equal(before.observationReceipts.length, 11, "Versões da fixture precisam de recibos reais.");
  assert.equal(before.courses[0].annotation_set_version, 11);
  assert.deepEqual(before.observationReceipts.map(({ result }) => result.annotationSetVersion).sort((a, b) => a - b),
    Array.from({ length: 11 }, (_, index) => index + 1), "Cada mudança precisa do contador confirmado no recibo.");
  for (const receipt of before.observationReceipts) {
    assert.equal(receipt.actor_id, CONTEXT_OWNER);
    assert.equal(receipt.course_id, CONTEXT_PRIVATE);
    assert.equal(receipt.operation, "execute_course_anchored_annotation");
    assert.equal(receipt.result.contract, "aralearn.course-anchored-annotation-receipt.v1");
    assert.equal(receipt.result.changed, true);
  }
  for (const observation of before.observations) {
    assert.deepEqual(before.observationReceipts.filter(({ result }) => result.annotationId === observation.id)
      .map(({ result }) => result.annotationVersion).sort((a, b) => a - b),
    Array.from({ length: observation.version }, (_, index) => index + 1), "As versões precisam pertencer à observação preservada.");
  }
  assert.deepEqual(before.observations.map(({ target_kind, target_id, state, version }) => ({ target_kind, target_id, state, version })), [
    { target_kind: "study_unit", target_id: "unit-context-a", state: "open", version: 2 },
    { target_kind: "study_unit", target_id: "unit-context-b", state: "considered", version: 5 },
    { target_kind: "didactic_microsequence", target_id: "micro-context", state: "open", version: 4 }
  ]);
  const oldReview = before.reviews.find((review) => review.courseId === CONTEXT_PRIVATE && review.entityType === "microsequence");
  assert.match(oldReview?.value?.approvedBasisHash || "", /^[a-f0-9]{64}$/u, "A revisão anterior precisa ter sido registrada.");
  assert.equal(oldReview.value.approvedBy, CONTEXT_OWNER);
  const migratedReviews = before.reviews.map((review) => ({ ...review,
    value: review.value?.approvedBasisHash ? { legacyMicrosequenceReview: review.value } : review.value }));
  assert.deepEqual(after, { ...before, reviews: migratedReviews },
    "Upgrade contextual alterou dados úteis ou inventou revisão por objeto.");
}

function readContextualEntityPage(container, actor, courseId) {
  const role = actor ? "authenticated" : "anon";
  return queryJson(container, `with claims as materialized (
    select set_config('request.jwt.claim.sub','${actor || ""}',true),set_config('request.jwt.claim.role','${role}',true),
      set_config('request.jwt.claims','${JSON.stringify({ role, ...(actor ? { sub: actor } : {}) })}',true)
  ) select public.list_course_entities_v1('${courseId}',(select revision from public.courses where id='${courseId}'),10,null,null) from claims`);
}

function verifyContextualUpgrade(container, before) {
  const after = queryJson(container, contextualStateSql);
  assertContextualPreservation(before, after);
  const read = queryJson(container, `with claims as materialized (
    select set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true)
  ) select jsonb_build_object(
    'policies',(select jsonb_agg(content_review_policy order by id) from public.courses where id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}')),
    'entities',(select jsonb_agg(jsonb_build_object('courseId',e.course_id,'entityType',e.entity_type,'entityId',e.entity_id,
      'complete',private.course_content_complete_v1(e.course_id,case when e.entity_type='study_unit' then 'study_unit' else 'microsequence_explanation' end,e.entity_id),
      'owner',private.course_entity_readable_v1(e.course_id,'${CONTEXT_OWNER}',e.entity_type,e.entity_id,e.parent_id),
      'anonymous',private.course_entity_readable_v1(e.course_id,null,e.entity_type,e.entity_id,e.parent_id),
      'granted',private.course_entity_readable_v1(e.course_id,'${CONTEXT_READER}',e.entity_type,e.entity_id,e.parent_id),
      'reviewState',private.course_content_review_v1(e.course_id,case when e.entity_type='study_unit' then 'study_unit' else 'microsequence_explanation' end,e.entity_id)->>'state',
      'appliedExplanationBasis',e.applied_explanation_basis) order by e.course_id,e.entity_type,e.entity_id)
      from private.course_entities e where e.course_id in('${CONTEXT_PRIVATE}','${CONTEXT_PUBLIC}') and e.entity_type in('microsequence','study_unit')),
    'observations',public.get_owned_course_anchored_annotations_for_actor_v1('${CONTEXT_OWNER}','${CONTEXT_PRIVATE}',
      (select revision from public.courses where id='${CONTEXT_PRIVATE}'),null,'inbox',array['author'],'{}',array['open','considered'],'{}',true,'{}',null,null,false,null,null,24)) from claims`);
  assert.deepEqual(read.policies, ["saved", "saved"], "Upgrade inventou restrição de revisão.");
  assert.equal(read.entities.length, 6);
  for (const entity of read.entities) {
    assert.equal(entity.complete, true, `Conteúdo contextual incompleto: ${entity.entityId}`);
    assert.equal(entity.owner, true);
    assert.equal(entity.granted, true, "Acesso concedido ou público deixou de ler conteúdo completo salvo.");
    assert.equal(entity.anonymous, entity.courseId === CONTEXT_PUBLIC, "Privacidade explícita não foi preservada.");
    assert.equal(entity.reviewState, entity.entityType === "microsequence" ? "draft" : "unregistered",
      "Uma revisão de conjunto não pode inventar a revisão de cada objeto.");
    assert.equal(entity.appliedExplanationBasis, null, "Upgrade inventou proveniência de produção.");
  }
  const observations = normalizeCourseAnchoredAnnotationPage(read.observations);
  assert.equal(observations.hasMore, false);
  assert.equal(observations.items.length, 3);
  for (const saved of before.observations) {
    const item = observations.items.find((annotation) => annotation.annotationId === saved.id);
    assert.ok(item, "Observação anterior sumiu do leitor autoral corrente.");
    assert.equal(item.annotationVersion, saved.version);
    assert.equal(item.rawText, saved.raw_text);
    assert.equal(item.state, saved.state);
    assert.equal(item.target.kind, saved.target_kind, "Upgrade atribuiu um novo alvo à observação antiga.");
    assert.equal(item.target.id, saved.target_id);
    if (item.target.kind === "study_unit") {
      assert.equal(item.capabilities.canResolve, false);
      assert.equal(item.capabilities.canWithdraw, false);
    }
  }
  const readers = [[CONTEXT_OWNER, CONTEXT_PRIVATE], [CONTEXT_READER, CONTEXT_PRIVATE], [null, CONTEXT_PUBLIC]];
  for (const [actor, courseId] of readers) {
    const page = readContextualEntityPage(container, actor, courseId);
    const saved = before.entities.filter((entity) => entity.course_id === courseId);
    assert.equal(page.items.length, saved.length, "O leitor corrente omitiu objetos salvos e autorizados.");
    for (const entity of saved) {
      const item = page.items.find((candidate) => candidate.entityType === entity.entity_type && candidate.entityId === entity.entity_id);
      assert.ok(item, `Objeto ausente da leitura: ${entity.entity_id}`);
      assert.deepEqual(item.content, entity.content, "Leitura autorizada substituiu conteúdo completo por placeholder.");
      assert.equal(item.version, entity.version);
    }
  }
  return { checkpoint: CONTEXTUAL_BASE.slice(0, 14), courses: after.courses.length, entities: after.entities.length,
    sources: after.sources.length, sourceAttributions: after.attributions.length, pendingObservations: observations.items.map((item) => ({
      id: item.annotationId, targetKind: item.target.kind, state: item.state, version: item.annotationVersion })),
    observationReceipts: after.observationReceipts.length, annotationSetVersion: after.courses[0].annotation_set_version,
    preservedGroups: Object.keys(after),
    preservedSha256: createHash("sha256").update(JSON.stringify(after)).digest("hex"),
    review: "legacy declaration preserved; no object review invented", savedContentReadChecks: read.entities,
    currentEntityReaderContexts: readers.length, storedFiles: false };
}

function assertCurrentState(historical, current, expectedRevision) {
  assert.equal(current.manifestRevision, expectedRevision);
  assert.equal(current.migrationRevision, expectedRevision);
  for (const key of ["course", "structure", "planItems", "parts", "partMicrosequences",
    "configuration", "source", "importedLegacySource", "importedLegacyLink", "legacySourceEnums",
    "anchor", "attribution", "attachments", "uploadIntents", "deleteIntents", "observations",
    "receipts", "legacy", "storageObjects"]) {
    assert.deepEqual(current[key], historical[key], `O upgrade alterou ${key}.`);
  }
  assert.equal(current.studyUnitDesign.snapshotContract, "aralearn.study-unit-design-snapshot.v2");
  for (const key of ["ceiling", "createdOrigin", "lastRevisionOrigin"]) {
    assert.deepEqual(current.studyUnitDesign[key], historical.studyUnitDesign[key], key);
  }
  const links = current.resolvedObservationSourceLinks.map(({ sourceId, relation, anchors }) =>
    ({ sourceId, relation, anchors }));
  assert.deepEqual(links, historical.resolvedObservationSourceLinks);
}

function readAppliedRevisions(container) {
  return queryJson(container, "select coalesce(jsonb_agg(version order by version),'[]'::jsonb) " +
    "from supabase_migrations.schema_migrations");
}

export function verifyApplicationConvergence(clean, restored, expectedManifest) {
    const upgradedSchema = applicationSchemaDump(restored);
    const cleanSchema = applicationSchemaDump(clean);
    assert.equal(cleanSchema, upgradedSchema,
      "Instalação limpa e upgrade divergem no schema executável ou nas permissões.");
    const catalogsSql = `select jsonb_build_object(
      'parameters',(select jsonb_agg(to_jsonb(definition)-'created_at' order by parameter_id)
        from private.course_design_parameter_definitions definition),
      'components',private.course_component_catalog_v1())`;
    const cleanCatalogs = queryJson(clean, catalogsSql);
    assert.deepEqual(cleanCatalogs, queryJson(restored, catalogsSql),
      "Instalação limpa e upgrade divergem nas definições ou padrões dos catálogos correntes.");
    compareRuntimeManifest(expectedManifest, queryJson(clean,
      "select public.get_aralearn_runtime_manifest()"));
    assert.deepEqual(readAppliedRevisions(clean), readAppliedRevisions(restored),
      "Instalação limpa e upgrade possuem histórias de migrations diferentes.");

  return Object.freeze({
    schemaSha256: createHash("sha256").update(cleanSchema).digest("hex"),
    schemaBytes: Buffer.byteLength(cleanSchema),
    matchesUpgrade: true,
    catalogSha256: createHash("sha256").update(JSON.stringify(cleanCatalogs)).digest("hex"),
    parameterCount: cleanCatalogs.parameters.length,
    authorizationIncluded: true
  });
}

export async function verifyBackupRestoreUpgrade({
  migrations = defaultMigrations,
  fixture = defaultFixture,
  sourceContainer = DEFAULT_SOURCE_CONTAINER
} = {}) {
  const resolved = argumentsFrom([
    ...migrations.flatMap((migration) => ["--migration", migration]),
    "--fixture", fixture,
    "--source-container", sourceContainer
  ]);
  const expectedManifest = JSON.parse(readFileSync(path.join(
    repositoryRoot, "supabase", "runtime-manifest.json"
  ), "utf8"));
  const availableMigrations = readdirSync(migrationDirectory).filter((name) => migrationFilePattern.test(name));
  const historicalBoundary = path.basename(resolved.migrations.at(-1));
  contextualUpgradeStages(pendingUpgradeMigrations(availableMigrations, historicalBoundary, expectedManifest.schemaRevision));
  if (!containerRunning(resolved.sourceContainer)) {
    throw new Error("A stack Supabase local de origem não está em execução.");
  }
  const token = randomBytes(6).toString("hex");
  const image = `aralearn-restore-base-${token}`;
  const source = `aralearn_restore_source_${token}`;
  const restored = `aralearn_restore_target_${token}`;
  const clean = `aralearn_restore_clean_${token}`;
  const backupPath = `/tmp/aralearn-backup-${token}.dump`;
  try {
    command("docker", ["commit", "--pause=false", resolved.sourceContainer, image]);
    await startDisposableContainer(source, image);
    await cloneDatabase(resolved.sourceContainer, source);
    resetDisposableApplicationState(source, resolved.migrations[0]);
    const preCutMigrations = migrationsBefore(resolved.migrations[0]);
    applyMigrationFiles(
      source,
      preCutMigrations,
      `/tmp/pre-cut-migrations-${token}`
    );
    copyAndApply(source, resolved.fixture, `/tmp/fixture-${token}.sql`);
    const before = {
      technical: queryJson(source, technicalMeasureSql),
      state: queryJson(source, beforeStateSql)
    };
    assertBeforeState(before.state, preCutMigrations.at(-1).slice(0, 14));
    command("docker", [
      "exec", source, "pg_dump", "-U", "supabase_admin", "-d", "postgres",
      "-Fc", "--no-owner", "-f", backupPath
    ]);

    await startDisposableContainer(restored, image);
    await restoreBackupFile(source, backupPath, restored);
    applyMigrationFiles(restored, resolved.migrations.map((migration) => path.basename(migration)),
      `/tmp/checkpoint-migrations-${token}`);

    const after = {
      technical: queryJson(restored, technicalMeasureSql),
      state: queryJson(restored, afterStateSql)
    };
    const migrationNames = resolved.migrations.map((migration) => path.basename(migration));
    assertAfterState(after.state, migrationNames.at(-1).slice(0, 14));
    assert.ok(
      after.technical.sourceTriggers < before.technical.sourceTriggers,
      "O corte não reduziu os triggers técnicos de Fontes."
    );
    assert.ok(
      after.technical.sourceFunctions < before.technical.sourceFunctions,
      "O corte não reduziu as funções técnicas de Fontes."
    );

    const preserved = queryJson(restored, preservedStateSql);
    const sourceNames = queryJson(restored, `select jsonb_agg(jsonb_build_object(
      'sourceId',source_id,'authorship',authorship) order by source_id)
      from private.course_sources where course_id='${COURSE_ID}'`);
    const tail = pendingUpgradeMigrations(availableMigrations, historicalBoundary,
      expectedManifest.schemaRevision, readAppliedRevisions(restored));
    const stages = contextualUpgradeStages(tail);
    applyMigrationFiles(restored, stages.beforeContextual, `/tmp/pre-contextual-migrations-${token}`);
    copyAndApply(restored, contextualFixture, `/tmp/contextual-fixture-${token}.sql`);
    const contextualBefore = queryJson(restored, contextualStateSql);
    const previousReview = queryJson(restored, `select jsonb_build_object(
      'private',private.course_microsequence_review_v1('${CONTEXT_PRIVATE}','micro-context')->>'state',
      'public',private.course_microsequence_review_v1('${CONTEXT_PUBLIC}','micro-context')->>'state')`);
    assert.deepEqual(previousReview, { private: "current", public: "draft" },
      "A fixture anterior precisa distinguir revisão registrada e conteúdo sem revisão.");
    applyMigrationFiles(restored, stages.contextual, `/tmp/current-migrations-${token}`);
    const contextual = verifyContextualUpgrade(restored, contextualBefore);
    const currentState = queryJson(restored, afterStateSql);
    assertCurrentState(after.state, currentState, expectedManifest.schemaRevision);
    assert.deepEqual(queryJson(restored, preservedStateSql), preserved,
      "O upgrade corrente alterou conteúdo, identidade ou decisão aplicada da fixture.");
    const currentRead = queryJson(restored, `with claims as materialized (
      select set_config('request.jwt.claim.role','service_role',true),
        set_config('request.jwt.claims','{"role":"service_role","sub":"${ACTOR_ID}"}',true)
    ) select jsonb_build_object('manifest',public.get_aralearn_runtime_manifest(),
      'sources',public.get_owned_course_sources_for_actor_v1('${ACTOR_ID}','${COURSE_ID}',4,'catalog'),
      'design',public.get_owned_course_design_for_actor_v3('${ACTOR_ID}','${COURSE_ID}',
        'didactic_microsequence','micro-restore',24,null),
      'citations',private.course_study_citations_payload_v1('${COURSE_ID}','unit-restore',4)) from claims`);
    compareRuntimeManifest(expectedManifest, currentRead.manifest);
    const sources = normalizeCourseSourcesRead(currentRead.sources);
    const citations = normalizeCourseStudyCitationsRead(currentRead.citations);
    const design = normalizeCourseDesignRead(currentRead.design);
    assert.equal(design.parameterCatalogVersion, COURSE_DESIGN_PARAMETER_CATALOG_VERSION);
    assert.equal(sources.items.length, sourceNames.length);
    for (const old of sourceNames) {
      const source = sources.items.find((item) => item.sourceId === old.sourceId);
      assert.ok(source, "Fonte histórica ausente do leitor corrente.");
      assert.equal(source.citationMode, "manual");
      assert.deepEqual(source.authors, old.authorship === null ? [] : [{ literal: old.authorship }]);
      // The historical checkpoint predates source_role; its subsequent nullable
      // column must become an empty suggestion, never an invented attribution.
      assert.deepEqual(source.defaultRoles, []);
    }
    assert.equal(citations.citations.length, after.state.studyCitations.length);
    const repeated = pendingUpgradeMigrations(availableMigrations, historicalBoundary,
      expectedManifest.schemaRevision, readAppliedRevisions(restored));
    assert.deepEqual(repeated, [], "Repetir a seleção reaplicaria uma migration já registrada.");

    const legacyReview = queryJson(restored, `select jsonb_build_object(
      'review',private.course_microsequence_review_v1('${COURSE_ID}','micro-restore'),
      'registered',(select count(*) from private.course_entities where course_id='${COURSE_ID}'
        and content_review is not null),
      'explanations',(select count(*) from private.course_entities where course_id='${COURSE_ID}'
        and entity_type='microsequence' and content ? 'explanation'),
      'visibility',(select visibility from public.courses where id='${COURSE_ID}'),
      'complete',private.course_content_complete_v1('${COURSE_ID}','study_unit','unit-restore'),
      'ownerReadable',private.course_entity_readable_v1('${COURSE_ID}','${ACTOR_ID}',
        'study_unit','unit-restore','micro-restore'),
      'studentReadable',private.course_entity_readable_v1('${COURSE_ID}',null,
        'study_unit','unit-restore','micro-restore'))`);
    assert.equal(legacyReview.review.state, "unregistered");
    assert.equal(legacyReview.registered, 0, "Upgrade inventou uma decisão de revisão.");
    assert.equal(legacyReview.explanations, 0, "Upgrade gerou apoio retroativamente.");
    assert.equal(legacyReview.visibility, "private", "Upgrade publicou a fixture histórica privada.");
    assert.equal(legacyReview.complete, false, "Placeholder histórico foi apresentado como conteúdo completo.");
    assert.equal(legacyReview.ownerReadable, true, "Proprietário perdeu acesso autoral ao acervo histórico.");
    assert.equal(legacyReview.studentReadable, false, "Visitante recebeu acesso ao placeholder de curso privado.");

    await startDisposableContainer(clean, image);
    await cloneDatabase(resolved.sourceContainer, clean);
    const orderedMigrations = [...availableMigrations].sort();
    resetDisposableApplicationState(clean, path.join(migrationDirectory, orderedMigrations[0]));
    applyMigrationFiles(clean, orderedMigrations, `/tmp/clean-migrations-${token}`);
    const cleanInstall = verifyApplicationConvergence(clean, restored, expectedManifest);

    return Object.freeze({
      contract: "aralearn.backup-restore-upgrade-proof.v3",
      migrations: Object.freeze(migrationNames),
      before,
      after,
      current: Object.freeze({
        schemaRevision: expectedManifest.schemaRevision,
        migrations: tail,
        preservedGroups: Object.keys(preserved),
        preservedSha256: createHash("sha256").update(JSON.stringify(preserved)).digest("hex"),
        sourceContract: sources.contract,
        citationContract: citations.contract,
        designContract: design.contract,
        parameterCatalogVersion: design.parameterCatalogVersion,
        repeatPendingMigrations: repeated.length,
        legacyReview,
        contextual: Object.freeze({ ...contextual, migrations: stages.contextual }),
        cleanInstall: Object.freeze({ migrations: orderedMigrations.length, ...cleanInstall })
      }),
      storage: Object.freeze({
        databaseBackupContainsMetadataOnly: before.state.storageObjects === 0,
        objectRecoveryRequiresStorageBackup: true
      }),
      disposable: true
    });
  } finally {
    for (const container of [source, restored, clean]) {
      command("docker", ["rm", "-f", "-v", container], { allowFailure: true });
    }
    command("docker", ["image", "rm", "-f", image], { allowFailure: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = await verifyBackupRestoreUpgrade(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
