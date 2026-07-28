import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
const legacyCatalogPath = path.join(repositoryRoot, "src", "data", "embedded-courses");
const runtimeRoots = [
  path.join(repositoryRoot, "public"),
  path.join(repositoryRoot, "src", "persistence"),
  path.join(repositoryRoot, "src", "supabase"),
  path.join(repositoryRoot, "src", "sync"),
  path.join(repositoryRoot, "src", "ui")
];
const requiredTables = [
  "courses",
  "user_course_selections",
  "study_paths",
  "study_path_courses",
  "lesson_progress",
  "card_progress",
  "card_comments"
];
const retiredContentTables = [
  "modules", "lessons", "course_guides", "guide_items", "lesson_topics",
  "topic_statements", "microsequences", "microsequence_dependencies",
  "microsequence_statements", "cards", "card_blocks", "block_options",
  "block_nodes", "flow_nodes", "flow_cases", "flow_practices",
  "node_practices", "node_practice_items", "block_edges",
  "block_matrix_items", "block_cells", "block_points", "block_lines",
  "block_highlights", "card_refs", "learning_components",
  "learning_component_topic_links", "learning_component_relations",
  "learning_component_placements"
];
const requiredPrivateTables = ["sync_devices", "sync_idempotency", "sync_changes"];
const requiredArtifactControlTables = [
  "artifact_refs",
  "artifact_gc_tombstones",
  "authoring_runs",
  "authoring_parts",
  "authoring_requests",
  "run_artifacts",
  "course_revisions",
  "course_revision_sync_changes"
];
const retiredAuthoringTables = [
  "authoring_ledger_chunks",
  "authoring_audit_reports",
  "authoring_command_events",
  "authoring_command_receipts",
  "authoring_private_imports",
  "authoring_private_import_chunks",
  "authoring_private_import_stage_rows"
];
const retiredLegacyControlTables = [
  "catalog_submission_authoring_receipts",
  "catalog_course_submissions",
  "course_content_revision_receipts",
  "course_content_revisions",
  "official_catalog_import_stage_rows",
  "official_catalog_import_chunks",
  "official_catalog_imports"
];
const requiredArtifactControlFunctions = [
  "get_authoring_run_control_v3",
  "list_authoring_runs_control_v3",
  "begin_authoring_request_v3",
  "commit_authoring_transition_v3",
  "fail_authoring_request_v3",
  "release_authoring_request_v3",
  "replay_authoring_request_v3",
  "pull_course_revision_changes",
  "get_course_revision_artifact_v3",
  "list_unreferenced_artifacts_v3",
  "release_expired_authoring_artifact_links_v3",
  "claim_unreferenced_artifacts_v3",
  "complete_artifact_gc_v3"
];
const requiredFunctions = [
  "select_catalog_course",
  "unselect_catalog_course",
  "apply_sync_batch",
  "pull_sync_changes",
  "bootstrap_replica",
  "list_catalog_collections",
  "list_user_course_summaries",
  "delete_own_account"
];
const retiredFunctions = [
  "begin_official_course_import",
  "apply_official_course_import_chunk",
  "finalize_official_course_import",
  "resolve_private_course_revision_target",
  "replace_microsequence_cards",
  "validate_course_graph",
  "create_personal_course",
  "fork_catalog_course_for_editing",
  "clone_catalog_course",
  "refresh_personal_course_from_source",
  "get_personal_course_graph",
  "delete_personal_course",
  "get_selected_course_graph"
];
const retiredColumns = [
  "source_entity_id",
  "source_course_id",
  "source_publication_seq",
  "source_content_hash",
  "baseline_content_hash",
  "personalized_at"
];
const forbiddenRuntimePatterns = [
  [/\bclone_catalog_course\b|\bcloneCourse\s*\(/iu, "clonagem operacional do catálogo"],
  [/\brefresh_personal_course_from_source\b|\brefreshPersonalCourse\s*\(/iu, "refresh de cópia pessoal"],
  [/\bget_personal_course_graph\b|\bgetPersonalCourseGraph\s*\(/iu, "grafo de cópia pessoal"],
  [/\bget_selected_course_graph\b|\bdownloadSelectedCourseGraph\s*\(/iu, "fallback de árvore relacional remota"],
  [/\bdelete_personal_course\b|\bdeletePersonalCourse\s*\(/iu, "remoção de cópia pessoal"],
  [/\bcreate_personal_course\b|\bcreatePersonalCourse\s*\(/iu, "criação relacional de curso"],
  [/\bfork_catalog_course_for_editing\b|\bforkCourseForEditing\s*\(/iu, "copy-on-write relacional"],
  [/\bsourceEntityId\b|\bsource_entity_id\b/iu, "linhagem por entidade"],
  [/\bbaselineContentHash\b|\bsourceContentHash\b|\bsourcePublicationSeq\b/iu, "baseline de cópia"],
  [/\bconflicts?\b|SYNC_FAILURE_KIND\.CONFLICT/iu, "resolução de conflito"],
  [/aralearn-relational-v1/iu, "banco IndexedDB retirado"]
];

function fail(message) {
  throw new Error(message);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) fail(message);
}

function decodeJwtRole(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 3) return "";
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.role || "";
  } catch {
    return "";
  }
}

async function listSourceFiles(directory) {
  if (!await exists(directory)) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(entryPath));
    } else if (/\.(?:js|mjs)$/u.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

async function validateRuntimeConfig(filePath) {
  if (!await exists(filePath)) return;
  const source = await fs.readFile(filePath, "utf8");
  const match = source.match(/"supabasePublishableKey"\s*:\s*"([^"]*)"/u);
  const key = match?.[1] || "";
  if (/service[_-]?role/iu.test(key) || /^sb_secret_/iu.test(key) || decodeJwtRole(key) === "service_role") {
    fail(`Chave administrativa encontrada no runtime: ${path.relative(repositoryRoot, filePath)}.`);
  }
}

async function main() {
  const publicEntrySource = await fs.readFile(path.join(repositoryRoot, "public", "main.js"), "utf8");
  assertContains(
    publicEntrySource,
    /import\s+\{[^}]*\bcreateEditorSession\b[^}]*\}\s+from\s+["']\.\.\/src\/editor\/contractEditor\.js["']/u,
    "O entrypoint público não inicializa a sessão completa de edição."
  );
  assertContains(
    publicEntrySource,
    /import\s+\{\s*createLessonEditorApp\s*\}\s+from\s+["']\.\.\/src\/ui\/lessonEditorApp\.js["']/u,
    "O entrypoint público não usa o runtime completo do AraLearn."
  );
  if (/createLearnerApp|LearnerApp/iu.test(publicEntrySource)) {
    fail("O entrypoint público ainda seleciona o runtime reduzido retirado.");
  }

  const migrationNames = (await fs.readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const migrations = await Promise.all(migrationNames.map(async (fileName) => ({
    fileName,
    source: await fs.readFile(path.join(migrationsDirectory, fileName), "utf8")
  })));
  const migrationHistory = migrations.map(({ source }) => source).join("\n");
  const slimCutover = [...migrations].reverse().find(({ source }) =>
    /create\s+table\s+public\.user_course_selections\b/iu.test(source) &&
    /function\s+public\.select_catalog_course\s*\(/iu.test(source)
  );
  const authoringWorkflow = [...migrations].reverse().find(({ source }) =>
    /create\s+table\s+private\.authoring_runs\b/iu.test(source) &&
    /function\s+public\.apply_authoring_command\s*\(/iu.test(source)
  );
  const artifactControl = [...migrations].reverse().find(({ source }) =>
    /create\s+table\s+private\.artifact_refs\b/iu.test(source) &&
    /function\s+public\.begin_authoring_request_v3\s*\(/iu.test(source)
  );
  const relationalRemoval = migrations.find(({ fileName }) =>
    fileName === "20260728020000_remove_relational_course_legacy.sql"
  );

  if (!slimCutover) {
    fail("Migration destrutiva do catálogo compartilhado não encontrada.");
  }
  if (!authoringWorkflow) {
    fail("Migration do fluxo editorial por partes não encontrada.");
  }
  if (!artifactControl) {
    fail("Migration do plano de controle por artefatos não encontrada.");
  }
  if (!relationalRemoval) {
    fail("Migration destrutiva da árvore relacional não encontrada.");
  }
  if (await exists(legacyCatalogPath)) {
    fail("O catálogo operacional legado ainda existe em src/data/embedded-courses.");
  }

  for (const table of requiredTables) {
    assertContains(
      migrationHistory,
      new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${escapePattern(table)}\\b`, "iu"),
      `Tabela relacional obrigatória ausente: public.${table}.`
    );
    const literalRls = new RegExp(
      `alter\\s+table\\s+public\\.${escapePattern(table)}\\s+enable\\s+row\\s+level\\s+security`,
      "iu"
    ).test(migrationHistory);
    const dynamicRls = /alter\s+table\s+public\.%I\s+enable\s+row\s+level\s+security/iu.test(migrationHistory) &&
      new RegExp(`['"]${escapePattern(table)}['"]`, "iu").test(migrationHistory);
    if (!literalRls && !dynamicRls) fail(`RLS não foi habilitada em public.${table}.`);
  }

  for (const functionName of requiredFunctions) {
    assertContains(
      slimCutover.source,
      new RegExp(`function\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "iu"),
      `RPC do modelo enxuto ausente: public.${functionName}.`
    );
  }
  for (const table of requiredPrivateTables) {
    assertContains(
      slimCutover.source,
      new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+private\\.${escapePattern(table)}\\b`, "iu"),
      `Tabela técnica encapsulada ausente: private.${table}.`
    );
  }
  for (const table of requiredArtifactControlTables) {
    assertContains(
      artifactControl.source,
      new RegExp(`create\\s+table\\s+private\\.${escapePattern(table)}\\b`, "iu"),
      `Tabela do plano de controle ausente: private.${table}.`
    );
    assertContains(
      artifactControl.source,
      new RegExp(`revoke\\s+all\\s+on\\s+table\\s+private\\.${escapePattern(table)}\\s+from[^;]*authenticated`, "iu"),
      `Tabela do plano de controle sem revogação explícita: private.${table}.`
    );
  }
  for (const functionName of requiredArtifactControlFunctions) {
    assertContains(
      artifactControl.source,
      new RegExp(`function\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "iu"),
      `RPC do plano de controle ausente: public.${functionName}.`
    );
    assertContains(
      artifactControl.source,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${escapePattern(functionName)}\\s*\\([^;]*\\)\\s+to\\s+service_role\\s*;`, "iu"),
      `RPC do plano de controle sem GRANT de service role: public.${functionName}.`
    );
  }
  for (const table of retiredAuthoringTables) {
    assertContains(
      artifactControl.source,
      new RegExp(`drop\\s+table\\s+if\\s+exists\\s+private\\.${escapePattern(table)}\\b`, "iu"),
      `Tabela volumosa antiga sem remoção explícita: private.${table}.`
    );
  }
  for (const table of retiredLegacyControlTables) {
    assertContains(
      relationalRemoval.source,
      new RegExp(`drop\\s+table\\s+if\\s+exists\\s+private\\.${escapePattern(table)}\\b`, "iu"),
      `Tabela de controle legada sem remoção explícita: private.${table}.`
    );
  }
  for (const table of retiredContentTables) {
    assertContains(
      relationalRemoval.source,
      new RegExp(`drop\\s+table\\s+if\\s+exists\\s+public\\.${escapePattern(table)}\\b`, "iu"),
      `Tabela pedagógica relacional sem remoção explícita: public.${table}.`
    );
  }
  assertContains(
    artifactControl.source,
    /insert\s+into\s+storage\.buckets[\s\S]*aralearn-authoring-artifacts[\s\S]*aralearn-course-revisions/iu,
    "Buckets privados de autoria e revisão não são provisionados."
  );
  assertContains(
    artifactControl.source,
    /document_storage_enabled[\s\S]*current_revision_hash[\s\S]*course_revision_sync_changes/iu,
    "A publicação não troca o ponteiro de revisão e o feed de sincronização."
  );
  assertContains(
    artifactControl.source,
    /pg_advisory_xact_lock[\s\S]*artifact_gc_tombstones/iu,
    "Registro e coleta de artefatos não estão serializados."
  );
  const runTable = artifactControl.source.match(
    /create\s+table\s+private\.authoring_runs\s*\(([\s\S]*?)\n\);/iu
  )?.[1] || "";
  const partTable = artifactControl.source.match(
    /create\s+table\s+private\.authoring_parts\s*\(([\s\S]*?)\n\);/iu
  )?.[1] || "";
  if (/\b(plan|brief|assembled_document|validation_report)\s+jsonb\b/iu.test(runTable)
      || /\b(specification|submission|fragment|audit)\s+jsonb\b/iu.test(partTable)) {
    fail("O plano de controle voltou a armazenar corpos JSON completos.");
  }
  assertContains(
    authoringWorkflow.source,
    /create\s+or\s+replace\s+function\s+public\.is_app_admin\s*\(\)[\s\S]*?private\.has_active_app_role\(auth\.uid\(\),\s*'owner'\)[\s\S]*?\$\$;/iu,
    "A função administrativa não reconhece o papel owner."
  );
  if (/function\s+public\.is_app_admin\s*\(\)[\s\S]*?has_active_app_role\(auth\.uid\(\),\s*'catalog_publisher'\)/iu
    .test(authoringWorkflow.source)) {
    fail("catalog_publisher não pode receber poderes administrativos sobre dados pessoais.");
  }
  for (const functionName of retiredFunctions) {
    assertContains(
      relationalRemoval.source,
      new RegExp(`['"]${escapePattern(functionName)}['"]`, "iu"),
      `RPC retirada não está coberta pelo corte: ${functionName}.`
    );
  }
  assertContains(
    slimCutover.source,
    /drop\s+table\s+if\s+exists\s+public\.course_memberships\b/iu,
    "A tabela public.course_memberships não foi removida no corte enxuto."
  );
  for (const columnName of retiredColumns) {
    assertContains(
      slimCutover.source,
      new RegExp(`drop\\s+column\\s+if\\s+exists\\s+${escapePattern(columnName)}\\b`, "iu"),
      `Coluna de linhagem retirada sem DROP explícito: ${columnName}.`
    );
  }
  assertContains(
    slimCutover.source,
    /from\s+pg_indexes[\s\S]+indexname\s+like\s+'%\\_source%[\s\S]+indexname\s+like\s+'%\\_lineage%[\s\S]+indexname\s+like\s+'%\\_identity\\_key\\_uidx'[\s\S]+drop\s+index\s+if\s+exists/iu,
    "Os índices de source, lineage e identity_key não são removidos sistematicamente."
  );
  assertContains(
    slimCutover.source,
    /revoke\s+all\s+privileges\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/iu,
    "O corte não revoga os privilégios-padrão depois de criar todas as RPCs."
  );
  for (const functionName of requiredFunctions) {
    assertContains(
      migrationHistory,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${escapePattern(functionName)}\\s*\\([^;]*\\)\\s+to\\s+authenticated\\s*;`, "iu"),
      `RPC do app sem GRANT explícito para authenticated: public.${functionName}.`
    );
  }

  const runtimeFiles = (await Promise.all(runtimeRoots.map(listSourceFiles))).flat();
  for (const filePath of runtimeFiles) {
    const source = await fs.readFile(filePath, "utf8");
    for (const [pattern, label] of forbiddenRuntimePatterns) {
      if (pattern.test(source)) {
        fail(`${label} ainda existe no runtime: ${path.relative(repositoryRoot, filePath)}.`);
      }
    }
  }

  await Promise.all([
    validateRuntimeConfig(path.join(repositoryRoot, ".pages", "runtime-config.js")),
    validateRuntimeConfig(path.join(
      repositoryRoot,
      "android", "app", "build", "generated", "web-assets", "main", "www", "public", "runtime-config.js"
    ))
  ]);
  console.log(
    `Corte validado em ${relationalRemoval.fileName}: PostgreSQL reduzido ao plano de controle/estado pessoal e cursos mantidos como artefatos privados no Storage.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
