import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  assertCourseCutoverLegacyAudit,
  CourseCutoverImportError
} from "./courseCutoverImporter.mjs";

export const COURSE_CUTOVER_SOURCE_SQL = String.raw`
with recursive legacy_audit_counts(name,value) as (
  select 'audit_findings',count(*)
  from private.authoring_workspace_observations where kind='audit_finding'
  union all select 'audit_runs',count(*) from private.authoring_audit_runs
  union all select 'audit_run_microsequences',count(*)
  from private.authoring_audit_run_microsequences
  union all select 'audit_run_completions',count(*)
  from private.authoring_audit_run_completions
  union all select 'audit_run_components',count(*)
  from private.authoring_audit_run_components
  union all select 'audit_requests',count(*)
  from private.authoring_workspace_requests where operation in(
    'create_finding','decide_finding','link_finding_correction','verify_finding',
    'delete_finding','run_authoring_audit','record_authoring_semantic_audit'
  )
  union all select 'audit_events',count(*)
  from private.authoring_workspace_events where operation in(
    'create_finding','decide_finding','link_finding_correction','verify_finding',
    'delete_finding','run_authoring_audit','record_authoring_semantic_audit'
  )
  union all select 'active_audit_mandates',count(*)
  from private.authoring_workspaces
  where authoring_state#>>'{mandate,kind}' in('audit','repair_findings')
  union all select 'observation_threads',count(*)
  from private.trail_observation_threads
  union all select 'observation_thread_corrections',count(*)
  from private.trail_observation_threads
  where correction_request_id is not null
     or correction_entity_path is not null
     or correction_linked_at is not null
     or correction_resulting_revision is not null
  union all select 'instructional_analyses',count(*)
  from private.authoring_instructional_analyses
  union all select 'design_parameter_assignments',count(*)
  from private.authoring_design_parameter_assignments
  union all select 'resource_sets',count(*) from private.authoring_resource_sets
  union all select 'resource_set_members',count(*)
  from private.authoring_resource_set_members
  union all select 'effective_design_snapshots',count(*)
  from private.authoring_effective_design_snapshots
  union all select 'effective_design_snapshot_values',count(*)
  from private.authoring_effective_design_snapshot_values
  union all select 'effective_design_snapshot_resource_sets',count(*)
  from private.authoring_effective_design_snapshot_resource_sets
  union all select 'pedagogical_blueprints',count(*)
  from private.authoring_pedagogical_blueprints
  union all select 'pedagogical_blueprint_bindings',count(*)
  from private.authoring_pedagogical_blueprint_bindings
  union all select 'microsequence_design_bindings',count(*)
  from private.authoring_microsequence_design_bindings
  union all select 'materialization_states',count(*)
  from private.authoring_materialization_states
  union all select 'materialization_state_workspaces',count(distinct state.workspace_id)
  from private.authoring_materialization_states state
  union all select 'materialization_state_unmapped_workspaces',count(distinct state.workspace_id)
  from private.authoring_materialization_states state
  where not exists(
    select 1 from private.trail_items item
    where item.workspace_id=state.workspace_id
      and item.workspace_course_id is not null
  )
  union all select 'materialization_state_orphans',count(*)
  from private.authoring_materialization_states state
  left join private.authoring_workspaces workspace
    on workspace.id=state.workspace_id and workspace.deleted_at is null
  left join private.authoring_workspace_entities microsequence
    on microsequence.workspace_id=state.workspace_id
   and microsequence.entity_type='microsequence'
   and microsequence.entity_id=state.microsequence_ref
  where workspace.id is null or microsequence.workspace_id is null
  union all select 'materialization_manifests',count(*)
  from private.authoring_materialization_manifests
  union all select 'manifest_coverage',count(*)
  from private.authoring_manifest_coverage
  union all select 'manifest_metrics',count(*)
  from private.authoring_manifest_metrics
  union all select 'manifest_resource_selections',count(*)
  from private.authoring_manifest_resource_selections
  union all select 'manifest_materialized_resources',count(*)
  from private.authoring_manifest_materialized_resources
), legacy_audit as (
  select jsonb_build_object(
    'contract','aralearn.legacy-authoring-audit-cutover-preflight.v1',
    'counts',jsonb_object_agg(name,value)
  ) value
  from legacy_audit_counts
), mapping as (
  select
    item.id as course_id,
    item.workspace_id,
    item.workspace_course_id,
    item.course_id as legacy_course_id,
    case
      when item.workspace_id is not null and item.course_id is null
        then 'root_only'
      when item.workspace_id is not null and item.course_id is not null
        then 'root_and_publication'
      else 'invalid'
    end as source_kind
  from private.trail_items item
), workspace_tree as (
  select
    mapping.course_id,
    entity.entity_type,
    entity.entity_id,
    entity.parent_type,
    entity.parent_id,
    entity.position,
    entity.content,
    entity.version as entity_version,
    entity.created_at as entity_created_at,
    entity.updated_at as entity_updated_at
  from mapping
  join private.authoring_workspace_entities entity
    on entity.workspace_id = mapping.workspace_id
   and entity.entity_type = 'course'
   and entity.entity_id = mapping.workspace_course_id
  where mapping.workspace_id is not null
  union all
  select
    tree.course_id,
    child.entity_type,
    child.entity_id,
    child.parent_type,
    child.parent_id,
    child.position,
    child.content,
    child.version as entity_version,
    child.created_at as entity_created_at,
    child.updated_at as entity_updated_at
  from workspace_tree tree
  join mapping on mapping.course_id = tree.course_id
  join private.authoring_workspace_entities child
    on child.workspace_id = mapping.workspace_id
   and child.parent_type = tree.entity_type
   and child.parent_id = tree.entity_id
), source as (
  select
    mapping.*,
    workspace.revision as workspace_revision,
    case when mapping.workspace_id is null then null else jsonb_build_object(
      'title', coalesce(
        nullif(btrim(workspace_root.content->>'title'), ''),
        nullif(btrim(workspace.title), '')
      ),
      'goal', coalesce(
        nullif(btrim(workspace_root.content->>'goal'), ''),
        nullif(btrim(workspace.purpose), '')
      )
    ) end as workspace_header,
    publication.current_revision_hash as legacy_revision_hash,
    artifact.hash as artifact_hash,
    artifact.bucket as artifact_bucket,
    artifact.object_key as artifact_object_key,
    artifact.size_bytes as artifact_size_bytes
  from mapping
  left join private.authoring_workspaces workspace
    on workspace.id = mapping.workspace_id
  left join private.authoring_workspace_entities workspace_root
    on workspace_root.workspace_id = mapping.workspace_id
   and workspace_root.entity_type = 'course'
   and workspace_root.entity_id = mapping.workspace_course_id
  left join public.courses publication
    on publication.id = mapping.legacy_course_id
  left join private.artifact_refs artifact
    on artifact.hash = publication.revision_artifact_hash
)
select jsonb_build_object(
  'contract', 'aralearn.course-cutover-source.v1',
  'legacyAudit', (select value from legacy_audit),
  'legacyAuditHash', (
    select encode(
      extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex'
    ) from legacy_audit
  ),
  'topology', coalesce(jsonb_agg(jsonb_build_object(
    'courseId', source.course_id,
    'sourceKind', source.source_kind,
    'workspaceId', source.workspace_id,
    'workspaceCourseId', source.workspace_course_id,
    'workspaceRevision', source.workspace_revision,
    'legacyCourseId', source.legacy_course_id,
    'legacyRevisionHash', source.legacy_revision_hash,
    'targetHeader', source.workspace_header,
    'workspaceEntities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entityType', tree.entity_type,
        'entityId', tree.entity_id,
        'parentType', tree.parent_type,
        'parentId', tree.parent_id,
        'position', tree.position,
        'content', tree.content,
        'entityVersion', tree.entity_version,
        'entityCreatedAt', tree.entity_created_at,
        'entityUpdatedAt', tree.entity_updated_at
      ) order by
        case tree.entity_type
          when 'course' then 0 when 'module' then 1 when 'lesson' then 2
          when 'topic' then 3 when 'microsequence' then 4 when 'card' then 5
          else 99 end,
        tree.parent_type nulls first,
        tree.parent_id nulls first,
        tree.position,
        tree.entity_id
      )
      from workspace_tree tree
      where tree.course_id = source.course_id
    ), '[]'::jsonb),
    'artifact', case when source.artifact_hash is null then null
      else jsonb_build_object(
        'hash', source.artifact_hash,
        'bucket', source.artifact_bucket,
        'objectKey', source.artifact_object_key,
        'sizeBytes', source.artifact_size_bytes
      ) end
  ) order by source.course_id), '[]'::jsonb)
)
from source
`;

export const COURSE_CUTOVER_VERIFICATION_SQL = String.raw`
select jsonb_build_object(
  'contract', 'aralearn.course-cutover-verification.v1',
  'courses', coalesce(jsonb_agg(jsonb_build_object(
    'courseId', course.id,
    'title', course.title,
    'goal', course.goal,
    'sourceReferences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'studyUnitId', attribution.target_id,
        'sourceOrdinal', source_link.source_ordinal,
        'sourceId', source_link.source_id
      ) order by convert_to(attribution.target_id,'UTF8'),
        source_link.source_ordinal)
      from private.course_source_attributions attribution
      join private.course_source_attribution_sources source_link
        on source_link.course_id = attribution.course_id
       and source_link.attribution_id = attribution.id
      where attribution.course_id = course.id
        and attribution.target_kind = 'study_unit'
        and attribution.revision = 1
    ), '[]'::jsonb),
    'entities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entityType', entity.entity_type,
        'entityId', entity.entity_id,
        'parentType', entity.parent_type,
        'parentId', entity.parent_id,
        'position', entity.position,
        'content', entity.content,
        'version', entity.version,
        'createdAt', entity.created_at,
        'updatedAt', entity.updated_at
      ) order by entity.entity_type, entity.entity_id)
      from private.course_entities entity
      where entity.course_id = course.id
    ), '[]'::jsonb)
  ) order by course.id), '[]'::jsonb)
)
from public.courses course
`;

function cutoverError(code, message, details = null) {
  return new CourseCutoverImportError(code, message, details);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function seconds(milliseconds) {
  return (milliseconds / 1000).toFixed(3).replace(/(?:\.0+|0+)$/u, "");
}

function databaseSpec(databaseUrl, password, {
  dockerContainer = null,
  processTimeoutMs,
  killGraceMs
} = {}) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw cutoverError("invalid_database_session", "Conexão PostgreSQL inválida.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol) ||
      !text(parsed.hostname) || !text(decodeURIComponent(parsed.username))) {
    throw cutoverError("invalid_database_session", "Conexão PostgreSQL incompleta.");
  }
  const resolvedPassword = password || decodeURIComponent(parsed.password || "");
  if (!resolvedPassword) {
    throw cutoverError(
      "database_session_required",
      "O corte exige uma sessão PostgreSQL nova e autenticada."
    );
  }
  const connectionArguments = [
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--host", parsed.hostname,
    "--port", parsed.port || "5432",
    "--username", decodeURIComponent(parsed.username),
    "--dbname", decodeURIComponent(parsed.pathname.replace(/^\//u, "")) || "postgres"
  ];
  if (dockerContainer) {
    const containerConnectionArguments = [
      "--no-psqlrc",
      "--set", "ON_ERROR_STOP=1",
      "--username", decodeURIComponent(parsed.username),
      "--dbname", decodeURIComponent(parsed.pathname.replace(/^\//u, "")) || "postgres"
    ];
    return {
      command: "docker",
      args: [
        "exec", "-i", "-e", "PGPASSWORD", dockerContainer,
        "timeout", "-s", "TERM", "-k", seconds(killGraceMs),
        seconds(processTimeoutMs + killGraceMs),
        "psql", ...containerConnectionArguments
      ],
      env: { ...process.env, PGPASSWORD: resolvedPassword }
    };
  }
  return {
    command: "psql",
    args: connectionArguments,
    env: { ...process.env, PGPASSWORD: resolvedPassword }
  };
}

export function runPsql(input, {
  databaseUrl,
  password,
  dockerContainer = null,
  spawnImpl = spawn,
  maxOutputBytes = 64 * 1024 * 1024,
  processTimeoutMs = 12 * 60 * 1000,
  killGraceMs = 5_000
} = {}) {
  if (!Number.isInteger(processTimeoutMs) || processTimeoutMs < 1 ||
      processTimeoutMs > 30 * 60 * 1000 ||
      !Number.isInteger(killGraceMs) || killGraceMs < 1 || killGraceMs > 30_000) {
    throw cutoverError("invalid_database_timeout", "Limite do processo PostgreSQL inválido.");
  }
  const spec = databaseSpec(databaseUrl, password, {
    dockerContainer,
    processTimeoutMs,
    killGraceMs
  });
  return new Promise((resolve, reject) => {
    const child = spawnImpl(spec.command, spec.args, {
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const stdout = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let pendingError = null;
    let closed = false;
    let forceTimer = null;
    const processTimer = setTimeout(() => {
      stopProcess(cutoverError(
        "database_process_timeout",
        "PostgreSQL excedeu o limite da operação; a transação foi interrompida."
      ));
    }, processTimeoutMs);
    const clearTimers = () => {
      clearTimeout(processTimer);
      if (forceTimer) clearTimeout(forceTimer);
    };
    const stopProcess = (error) => {
      if (closed || pendingError) return;
      pendingError = error;
      child.stdin.destroy();
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => {
        if (!closed) child.kill("SIGKILL");
      }, killGraceMs);
    };
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        stopProcess(cutoverError(
          "database_output_limit",
          "Resposta PostgreSQL excedeu o limite."
        ));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 1024 * 1024) {
        stopProcess(cutoverError(
          "database_error_output_limit",
          "Resposta de erro do PostgreSQL excedeu o limite."
        ));
      }
    });
    child.once("error", () => {
      if (closed) return;
      closed = true;
      clearTimers();
      reject(pendingError || cutoverError(
        "database_session_unavailable",
        "Sessão PostgreSQL indisponível."
      ));
    });
    child.once("close", (code) => {
      if (closed) return;
      closed = true;
      clearTimers();
      if (pendingError) {
        reject(pendingError);
        return;
      }
      if (code !== 0) {
        reject(cutoverError(
          "database_command_failed",
          "PostgreSQL recusou a operação; nenhuma saída sensível foi exibida.",
          { exitCode: code }
        ));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.once("error", () => {
      stopProcess(cutoverError(
        "database_session_unavailable",
        "Sessão PostgreSQL indisponível."
      ));
    });
    child.stdin.end(input);
  });
}

export function parseCourseCutoverSnapshot(output) {
  const source = String(output || "").trim();
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw cutoverError("invalid_database_snapshot", "PostgreSQL não retornou um snapshot JSON único.");
  }
  if (value?.contract !== "aralearn.course-cutover-source.v1" ||
      !Array.isArray(value?.topology)) {
    throw cutoverError("invalid_database_snapshot", "Contrato do snapshot PostgreSQL é inválido.");
  }
  assertCourseCutoverLegacyAudit(value.legacyAudit, value.legacyAuditHash);
  return value;
}

export async function readCourseCutoverSnapshot(options = {}) {
  const output = await runPsql([
    "\\set ON_ERROR_STOP on",
    "\\pset format unaligned",
    "\\pset tuples_only on",
    `${COURSE_CUTOVER_SOURCE_SQL.trim()};`,
    ""
  ].join("\n"), options);
  return parseCourseCutoverSnapshot(output);
}

export async function readCourseCutoverVerification(options = {}) {
  const output = await runPsql([
    "\\set ON_ERROR_STOP on",
    "\\pset format unaligned",
    "\\pset tuples_only on",
    `${COURSE_CUTOVER_VERIFICATION_SQL.trim()};`,
    ""
  ].join("\n"), options);
  let value;
  try {
    value = JSON.parse(String(output || "").trim());
  } catch {
    throw cutoverError(
      "invalid_cutover_verification",
      "PostgreSQL não retornou uma verificação JSON única."
    );
  }
  if (value?.contract !== "aralearn.course-cutover-verification.v1" ||
      !Array.isArray(value?.courses)) {
    throw cutoverError(
      "invalid_cutover_verification",
      "Contrato da verificação pós-corte é inválido."
    );
  }
  return value;
}

function assertRevisionIdentity(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value || "")) {
    throw cutoverError("invalid_revision_request", `${label} da revisão é inválido.`);
  }
}

export async function createRevisionArtifactLoader({
  supabaseUrl,
  publishableKey,
  accessToken,
  fetchImpl = globalThis.fetch,
  tempRoot = os.tmpdir()
} = {}) {
  let base;
  try {
    base = new URL(supabaseUrl);
  } catch {
    throw cutoverError("invalid_supabase_session", "URL do Supabase inválida.");
  }
  if (base.protocol !== "https:" || !text(publishableKey) || !text(accessToken)) {
    throw cutoverError(
      "supabase_user_session_required",
      "A leitura exige chave publicável e sessão normal do usuário."
    );
  }
  const directory = await fs.mkdtemp(path.join(tempRoot, "aralearn-course-cutover-"));
  const cache = new Map();
  let ordinal = 0;
  const loader = async (artifact, context = {}) => {
    assertRevisionIdentity(context.legacyCourseId, "Curso");
    if (!/^[0-9a-f]{64}$/u.test(context.legacyRevisionHash || "") ||
        artifact?.hash !== context.legacyRevisionHash ||
        !Number.isInteger(artifact?.sizeBytes) || artifact.sizeBytes < 1 ||
        artifact.sizeBytes > 32 * 1024 * 1024) {
      throw cutoverError("invalid_revision_request", "Hash da revisão é inválido.");
    }
    const cacheKey = `${context.legacyCourseId}:${context.legacyRevisionHash}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const requestUrl = new URL(
      `/functions/v1/aralearn-course-revisions/${encodeURIComponent(context.legacyCourseId)}` +
      `/${encodeURIComponent(context.legacyRevisionHash)}`,
      base
    );
    const response = await fetchImpl(requestUrl, {
      method: "GET",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      redirect: "error",
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) {
      throw cutoverError(
        "revision_download_failed",
        "A sessão normal não pôde ler uma revisão; o corte foi interrompido.",
        { status: response.status }
      );
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 0 &&
        contentLength !== artifact.sizeBytes) {
      throw cutoverError(
        "revision_download_size_drift",
        "O tamanho anunciado da revisão divergiu; o corte foi interrompido."
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength !== artifact.sizeBytes) {
      throw cutoverError(
        "revision_download_size_drift",
        "O tamanho recebido da revisão divergiu; o corte foi interrompido."
      );
    }
    ordinal += 1;
    await fs.writeFile(
      path.join(directory, `artifact-${String(ordinal).padStart(2, "0")}.json`),
      bytes,
      { flag: "wx" }
    );
    cache.set(cacheKey, bytes);
    return bytes;
  };
  return Object.freeze({ loader, directory });
}
