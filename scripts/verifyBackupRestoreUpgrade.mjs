import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = path.join(repositoryRoot, "supabase", "migrations");
const migrationFilePattern = /^(?:001|\d{14})_[a-z0-9_]+\.sql$/u;
const defaultMigrations = Object.freeze([
  "20260902044404_cut_legacy_authoring_runtime.sql",
  "20260902123759_drop_legacy_chat_openai_action_origin.sql"
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

function command(command, args, { allowFailure = false, timeout = 120_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
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
    "run", "--detach", "--name", container, "--entrypoint", "sh", image,
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
    ["exec", source, "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc", "--no-owner"],
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
  command("docker", ["cp", migrationDirectory, `${container}:${containerDirectory}`]);
  command("docker", [
    "exec", container, "psql", "-U", "supabase_admin", "-d", "postgres",
    "-X", "-v", "ON_ERROR_STOP=1",
    ...migrationNames.flatMap((name) => ["-f", `${containerDirectory}/${name}`])
  ], { timeout: 15 * 60_000 });
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

function recordAppliedMigration(container, migration) {
  const match = /^(\d{14})_([a-z0-9_]+)\.sql$/u.exec(path.basename(migration));
  if (!match) throw new TypeError(`Migration final inválida: ${migration}`);
  command("docker", [
    "exec", container, "psql", "-U", "supabase_admin", "-d", "postgres",
    "-X", "-v", "ON_ERROR_STOP=1", "-c",
    `insert into supabase_migrations.schema_migrations(version,statements,name) ` +
    `values('${match[1]}',null,'${match[2]}') on conflict(version) do update ` +
    `set name=excluded.name`
  ]);
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
  if (!containerRunning(resolved.sourceContainer)) {
    throw new Error("A stack Supabase local de origem não está em execução.");
  }
  const token = randomBytes(6).toString("hex");
  const image = `aralearn-restore-base-${token}`;
  const source = `aralearn_restore_source_${token}`;
  const restored = `aralearn_restore_target_${token}`;
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
    for (const [index, migration] of resolved.migrations.entries()) {
      copyAndApply(restored, migration, `/tmp/migration-${index + 1}-${token}.sql`);
      recordAppliedMigration(restored, migration);
    }

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

    return Object.freeze({
      contract: "aralearn.backup-restore-upgrade-proof.v2",
      migrations: Object.freeze(migrationNames),
      before,
      after,
      storage: Object.freeze({
        databaseBackupContainsMetadataOnly: before.state.storageObjects === 0,
        objectRecoveryRequiresStorageBackup: true
      }),
      disposable: true
    });
  } finally {
    for (const container of [source, restored]) {
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
