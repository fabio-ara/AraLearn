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
  "pull_course_revision_changes",
  "get_course_revision_artifact_v4",
  "list_unreferenced_artifacts_v4",
  "claim_unreferenced_artifacts_v4",
  "complete_artifact_gc_v4",
  "register_authoring_artifact_v5"
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
  [/\bsyncConflicts?\b|SYNC_FAILURE_KIND\.CONFLICT/iu, "resolução de conflito legada"],
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

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) fail(message);
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
  const workspaceCutover = migrations.find(({ fileName }) =>
    fileName === "20260729010000_authoring_workspaces_v4.sql"
  );
  const oauthCutover = migrations.find(({ fileName }) =>
    fileName === "20260729050000_authoring_mcp_oauth_and_publication.sql"
  );
  const workspaceHardening = migrations.find(({ fileName }) =>
    fileName === "20260729070000_authoring_workspace_hardening.sql"
  );
  const oauthOnlyCutover = migrations.find(({ fileName }) =>
    fileName === "20260729080000_remove_static_authoring_api.sql"
  );
  const defaultCatalogCollection = migrations.find(({ fileName }) =>
    fileName === "20260729090000_catalog_default_collection.sql"
  );
  const actionOAuth = migrations.find(({ fileName }) =>
    fileName === "20260730100000_authoring_action_oauth.sql"
  );
  const actionOAuthLink = migrations.find(({ fileName }) =>
    fileName === "20260730110000_link_chatgpt_action_oauth.sql"
  );
  const actionOAuthRelink = migrations.find(({ fileName }) =>
    fileName === "20260730120000_allow_relink_chatgpt_action_oauth.sql"
  );
  const actionOAuthStableCallback = migrations.find(({ fileName }) =>
    fileName === "20260730130000_stabilize_chatgpt_action_callback.sql"
  );
  const composedAuthoring = migrations.find(({ fileName }) =>
    fileName === "20260730140000_composed_authoring_and_catalog_review.sql"
  );
  const workspaceCardTopicsFix = migrations.find(({ fileName }) =>
    fileName === "20260731120000_fix_workspace_card_topics.sql"
  );
  const unchangedPublicationFix = migrations.find(({ fileName }) =>
    fileName === "20260731160000_skip_unchanged_workspace_publication.sql"
  );
  const currentStateCentral = migrations.find(({ fileName }) =>
    fileName === "20260801120000_current_state_central.sql"
  );
  const situatedPersonalComments = migrations.find(({ fileName }) =>
    fileName === "20260801180000_situated_personal_comments.sql"
  );
  const educationalWorkspaces = migrations.find(({ fileName }) =>
    fileName === "20260801210000_educational_workspaces.sql"
  );
  const workspaceCapabilityEnforcement = migrations.find(({ fileName }) =>
    fileName === "20260801213000_workspace_capability_enforcement.sql"
  );
  const workspaceCurrentState = migrations.find(({ fileName }) =>
    fileName === "20260801220000_workspace_current_state.sql"
  );
  const workspacePedagogicalComments = migrations.find(({ fileName }) =>
    fileName === "20260801230000_workspace_pedagogical_comments.sql"
  );
  const workspaceCourseStateProjection = migrations.find(({ fileName }) =>
    fileName === "20260801233000_workspace_course_state_projection.sql"
  );
  const nonPunitiveStudyState = migrations.find(({ fileName }) =>
    fileName === "20260802000000_non_punitive_study_state.sql"
  );
  const nonPunitiveStudyProjections = migrations.find(({ fileName }) =>
    fileName === "20260802010000_non_punitive_study_projections.sql"
  );
  const workspaceCommentAggregates = migrations.find(({ fileName }) =>
    fileName === "20260802020000_workspace_comment_aggregates.sql"
  );
  const integratedLearningSpaces = migrations.find(({ fileName }) =>
    fileName === "20260803010000_integrated_learning_spaces.sql"
  );
  const workspaceEntityObservations = migrations.find(({ fileName }) =>
    fileName === "20260803020000_workspace_entity_observations.sql"
  );
  const atomicPrivateCourseRemoval = migrations.find(({ fileName }) =>
    fileName === "20260804160000_atomic_private_course_removal.sql"
  );
  const catalogCollectionReordering = migrations.find(({ fileName }) =>
    fileName === "20260804170000_catalog_collection_reordering.sql"
  );
  const unifiedTrails = migrations.find(({ fileName }) =>
    fileName === "20260807210000_unified_trails.sql"
  );
  const trailPersonalState = migrations.find(({ fileName }) =>
    fileName === "20260807220000_trail_personal_state.sql"
  );
  const trailObservationThreads = migrations.find(({ fileName }) =>
    fileName === "20260807225000_trail_observation_threads.sql"
  );
  const unifiedTrailsCleanCutover = migrations.find(({ fileName }) =>
    fileName === "20260807230000_unified_trails_clean_cutover.sql"
  );
  const alphabeticTrails = migrations.find(({ fileName }) =>
    fileName === "20260808020000_alphabetic_trails.sql"
  );
  const alphabeticCatalog = migrations.find(({ fileName }) =>
    fileName === "20260808021000_alphabetic_catalog.sql"
  );
  const alphabeticCatalogRuntime = migrations.find(({ fileName }) =>
    fileName === "20260808022000_align_alphabetic_catalog_runtime.sql"
  );
  const authoringContinuity = migrations.find(({ fileName }) =>
    fileName === "20260809010000_authoring_continuity.sql"
  );
  const authoringContinuityVolatility = migrations.find(({ fileName }) =>
    fileName === "20260809011000_align_authoring_continuity_volatility.sql"
  );
  const packageLibrary = migrations.find(({ fileName }) =>
    fileName === "20260812120000_package_library_contract.sql"
  );
  const catalogPackageCutover = migrations.find(({ fileName }) =>
    fileName === "20260812130000_cutover_catalog_package_artifacts.sql"
  );
  const packageCutoverCleanup = migrations.find(({ fileName }) =>
    fileName === "20260812131000_remove_package_cutover_workspaces.sql"
  );
  const packageCardListProjection = migrations.find(({ fileName }) =>
    fileName === "20260812132000_package_card_list_projection.sql"
  );
  const packageObservationTargets = migrations.find(({ fileName }) =>
    fileName === "20260812140000_package_observation_targets.sql"
  );
  const catalogRootReuse = migrations.find(({ fileName }) =>
    fileName === "20260812160000_reuse_catalog_authoring_root.sql"
  );
  const strictCatalogRootReuse = migrations.find(({ fileName }) =>
    fileName === "20260812161000_strict_catalog_root_reuse.sql"
  );
  const currentCatalogRootResolution = migrations.find(({ fileName }) =>
    fileName === "20260812162000_resolve_current_catalog_root.sql"
  );
  const discardCatalogMaterialization = migrations.find(({ fileName }) =>
    fileName === "20260812163000_discard_unpublished_catalog_materialization.sql"
  );
  const flatRuntimeManifest = migrations.find(({ fileName }) =>
    fileName === "20260812164000_flat_runtime_manifest.sql"
  );
  const removedRuntimeManifestWrappers = migrations.find(({ fileName }) =>
    fileName === "20260812164100_remove_runtime_manifest_wrappers.sql"
  );
  const authoringProductStateProjection = migrations.find(({ fileName }) =>
    fileName === "20260815233000_authoring_product_state_projection.sql"
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
  if (!workspaceCutover || !oauthCutover || !workspaceHardening || !oauthOnlyCutover
      || !defaultCatalogCollection || !actionOAuth || !actionOAuthLink || !actionOAuthRelink
      || !actionOAuthStableCallback || !composedAuthoring || !workspaceCardTopicsFix
      || !unchangedPublicationFix || !currentStateCentral || !situatedPersonalComments
      || !educationalWorkspaces || !workspaceCapabilityEnforcement || !workspaceCurrentState
      || !workspacePedagogicalComments || !workspaceCourseStateProjection
      || !nonPunitiveStudyState || !nonPunitiveStudyProjections
      || !workspaceCommentAggregates || !integratedLearningSpaces
      || !workspaceEntityObservations || !atomicPrivateCourseRemoval
      || !catalogCollectionReordering || !unifiedTrails || !trailPersonalState
      || !trailObservationThreads || !unifiedTrailsCleanCutover || !alphabeticTrails
      || !alphabeticCatalog || !alphabeticCatalogRuntime || !authoringContinuity
      || !authoringContinuityVolatility || !authoringProductStateProjection) {
    fail("Corte final de workspaces compostos/OAuth v5 não encontrado.");
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
    const declarationOrRename = [
      "pull_course_revision_changes",
      "register_authoring_artifact_v5"
    ].includes(functionName)
      ? new RegExp(`function\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "iu")
      : new RegExp(`rename\\s+to\\s+${escapePattern(functionName)}\\s*;`, "iu");
    assertContains(
      migrationHistory,
      declarationOrRename,
      `RPC do plano de controle ausente: public.${functionName}.`
    );
    assertContains(
      migrationHistory,
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
  for (const retired of [
    "authoring_runs", "authoring_parts", "authoring_requests", "run_artifacts"
  ]) {
    assertContains(
      workspaceCutover.source,
      new RegExp(`drop\\s+table\\s+if\\s+exists\\s+private\\.${retired}\\b`, "iu"),
      `Tabela do fluxo por partes não foi removida: private.${retired}.`
    );
  }
  for (const functionName of [
    "list_authoring_catalog_collections_v4",
    "list_authoring_catalog_courses_v4"
  ]) {
    assertContains(
      oauthCutover.source,
      new RegExp(`function\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "iu"),
      `Leitura de catálogo para autoria ausente: public.${functionName}.`
    );
  }
  assertContains(
    oauthCutover.source,
    /'atomic-card-assistance'/u,
    "O manifesto vigente não anuncia a assistência atômica de cards."
  );
  if (/'structured-bottom-up-generation'/u.test(oauthCutover.source)) {
    fail("O manifesto vigente ainda anuncia o bottom-up estruturado retirado.");
  }
  assertContains(
    workspaceHardening.source,
    /alter\s+function\s+private\.register_artifact_v3\(jsonb\)\s+rename\s+to\s+register_artifact_v4/iu,
    "O registro privado de artefatos ainda não foi consolidado no v4."
  );
  assertContains(
    workspaceHardening.source,
    /add\s+column\s+result\s+jsonb[\s\S]+alter\s+column\s+result\s+set\s+not\s+null/iu,
    "Os recibos idempotentes de workspace não preservam a resposta original."
  );
  assertContains(
    workspaceHardening.source,
    /p_before_revision\s+bigint\s+default\s+null[\s\S]+'nextCursor'/iu,
    "O feed anterior do workspace não possuía paginação completa."
  );
  assertContains(
    workspaceHardening.source,
    /'workspace-cursor-pagination'/u,
    "A migration histórica não anuncia a paginação que o corte v5 substitui."
  );
  assertContains(
    composedAuthoring.source,
    /drop\s+table\s+if\s+exists\s+private\.authoring_workspace_revisions\s+cascade/iu,
    "O corte v5 não remove os snapshots de revisão do workspace."
  );
  assertContains(
    composedAuthoring.source,
    /create\s+table\s+private\.authoring_workspace_entities\s*\(/iu,
    "O corte v5 não materializa uma linha corrente por parte do workspace."
  );
  assertContains(
    composedAuthoring.source,
    /create\s+table\s+private\.authoring_workspace_publications\s*\(/iu,
    "O corte v5 não conserva o vínculo corrente entre curso do workspace e publicação."
  );
  for (const functionName of [
    "create_authoring_workspace_v5",
    "commit_authoring_workspace_changes_v5",
    "update_authoring_workspace_brief_v5",
    "list_authoring_workspace_events_v5",
    "list_authoring_workspace_microsequence_cards_v5",
    "search_authoring_catalog_courses_v5",
    "submit_private_course_for_catalog_review_v5",
    "create_catalog_collection_v5"
  ]) {
    assertContains(
      composedAuthoring.source,
      new RegExp(`function\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "iu"),
      `RPC do corte composto ausente: public.${functionName}.`
    );
  }
  assertContains(
    composedAuthoring.source,
    /create\s+unique\s+index\s+course_revisions_single_current_v5_uidx\s+on\s+private\.course_revisions\s*\(\s*course_id\s*\)/iu,
    "O curso publicado ainda pode reter mais de uma revisão corrente no banco."
  );
  assertContains(
    composedAuthoring.source,
    /'workspace-publication-bindings'/u,
    "O manifesto vigente não anuncia a continuidade automática das publicações."
  );
  assertContains(
    composedAuthoring.source,
    /'workspace-microsequence-card-pagination'/u,
    "O manifesto vigente não anuncia a leitura paginada de cards da microssequência."
  );
  assertContains(
    composedAuthoring.source,
    /'global-catalog-course-search'/u,
    "O manifesto vigente não anuncia a busca global dos cursos do catálogo."
  );
  assertContains(
    workspaceCardTopicsFix.source,
    /entity_type\s*=\s*'lesson'[\s\S]+content\s*\?\s*'topics'/iu,
    "A correção vigente não separa topics filho de metadado atômico do card."
  );
  assertContains(
    workspaceCardTopicsFix.source,
    /workspace_entity_content_separation[\s\S]+structured-authoring-errors/iu,
    "A correção vigente não preserva diagnóstico estrutural consumível pelo assistente."
  );
  assertContains(
    workspaceCardTopicsFix.source,
    /'schemaRevision',\s*'20260731120000'/u,
    "O manifesto vigente não exige a correção dos metadados de card."
  );
  assertContains(
    unchangedPublicationFix.source,
    /reuse_unchanged_authoring_publication_v5[\s\S]+unchanged-publication-short-circuit/u,
    "A publicação idêntica ainda não possui confirmação transacional sem nova sincronização."
  );
  assertContains(
    unchangedPublicationFix.source,
    /'schemaRevision',\s*'20260731160000'/u,
    "O manifesto vigente não exige o atalho de publicação inalterada."
  );
  for (const functionName of [
    "get_current_state_central_v1",
    "list_current_state_central_v1"
  ]) {
    assertContains(
      currentStateCentral.source,
      new RegExp(`function\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "iu"),
      `A projeção corrente da Central não expõe public.${functionName}.`
    );
  }
  assertContains(
    currentStateCentral.source,
    /'schemaRevision',\s*'20260801120000'[\s\S]+'current-state-central-v1'/u,
    "O manifesto vigente não exige a projeção corrente da Central."
  );
  assertContains(
    situatedPersonalComments.source,
    /function\s+public\.apply_situated_comment_batch_v1\s*\([\s\S]+category[\s\S]+body/iu,
    "O contrato dedicado das observações situadas não foi instalado."
  );
  assertContains(
    situatedPersonalComments.source,
    /function\s+public\.apply_sync_batch\s*\([\s\S]+apply_situated_comment_batch_v1/iu,
    "O sync genérico ainda aceita silenciosamente o contrato antigo de comentários."
  );
  assertContains(
    situatedPersonalComments.source,
    /'schemaRevision',\s*'20260801180000'[\s\S]+'situated-personal-comments-v1'/u,
    "O manifesto vigente não exige observações pessoais situadas."
  );
  assertContains(
    educationalWorkspaces.source,
    /create\s+table\s+private\.educational_workspace_members[\s\S]+create\s+table\s+private\.educational_workspace_invitations/iu,
    "O domínio corrente não materializa membros e convites frugais do workspace."
  );
  assertContains(
    workspaceCapabilityEnforcement.source,
    /educational_workspace_can_v1[\s\S]+workspace-member-course-access-v1/iu,
    "As rotas de autoria e publicações não aplicam capacidades locais do workspace."
  );
  assertContains(
    workspaceCurrentState.source,
    /'schemaRevision',\s*'20260801220000'[\s\S]+'workspace-contextual-current-state-v1'/u,
    "O manifesto vigente não exige papéis contextuais na Central."
  );
  for (const functionName of [
    "list_current_educational_workspace_comments_v1",
    "manage_current_educational_workspace_comment_v1",
    "list_educational_workspace_comments_for_actor_v1",
    "manage_educational_workspace_comment_for_actor_v1"
  ]) {
    assertContains(
      workspacePedagogicalComments.source,
      new RegExp(`function\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "iu"),
      `A operação contextual de observações está ausente: public.${functionName}.`
    );
  }
  assertContains(
    workspacePedagogicalComments.source,
    /workspace_id[\s\S]+course_revision_hash[\s\S]+correction_request_id/iu,
    "As observações não preservam o vínculo mínimo com workspace, revisão e correção."
  );
  assertContains(
    workspaceCourseStateProjection.source,
    /'schemaRevision',\s*'20260801233000'[\s\S]+'workspace-course-state-projection-v1'/u,
    "O manifesto vigente não exige a projeção corrente dos cursos do workspace."
  );
  assertContains(
    workspaceCourseStateProjection.source,
    /'courses'[\s\S]+'readyMicrosequenceCount'[\s\S]+'publicationTargets'/u,
    "O workspace não projeta composição, prontidão e destinos dos cursos."
  );
  assertNotContains(
    workspaceCourseStateProjection.source,
    /create\s+table/iu,
    "A projeção corrente criou armazenamento paralelo."
  );
  assertContains(
    nonPunitiveStudyState.source,
    /drop\s+function\s+public\.apply_sync_batch_without_situated_comments_v1/iu,
    "O adaptador geral ainda conserva o fluxo anterior de estudo e observações."
  );
  assertContains(
    nonPunitiveStudyProjections.source,
    /'schemaRevision',\s*'20260802010000'[\s\S]+'non-punitive-study-projections-v1'/u,
    "As projeções ainda inferem atividade em vez de estado funcional corrente."
  );
  assertContains(
    workspaceCommentAggregates.source,
    /'schemaRevision',\s*'20260802020000'[\s\S]+'workspace-comment-aggregates-v1'/u,
    "O manifesto final não anuncia a síntese corrente de observações."
  );
  assertContains(
    integratedLearningSpaces.source,
    /drop\s+function\s+if\s+exists\s+public\.get_current_state_central_v1\s*\(\s*\)/iu,
    "A projeção antiga da Central não foi retirada."
  );
  assertContains(
    integratedLearningSpaces.source,
    /function\s+public\.list_trail_items_v1\s*\(/iu,
    "A projeção integrada de Trilhas não foi instalada."
  );
  assertContains(
    integratedLearningSpaces.source,
    /'integrated-trails-v1'[\s\S]*'plans-derived-from-current-content-v1'/iu,
    "O manifesto não anuncia Trilhas integradas e planos derivados do conteúdo."
  );
  assertContains(
    workspaceEntityObservations.source,
    /create\s+table\s+private\.authoring_workspace_observations\s*\(/iu,
    "As observações ligadas às partes do workspace não foram instaladas."
  );
  assertContains(
    atomicPrivateCourseRemoval.source,
    /delete_authoring_workspace_v5[\s\S]*p_expected_revision\s+bigint/iu,
    "A exclusão de workspace ainda não aplica CAS no banco."
  );
  assertContains(
    atomicPrivateCourseRemoval.source,
    /before\s+update\s+of\s+status\s*,\s*deleted_at\s*,\s*document_storage_enabled\s+or\s+delete\s+on\s+public\.courses/iu,
    "A retirada privada não encerra a composição na mesma transação."
  );
  assertContains(
    atomicPrivateCourseRemoval.source,
    /'schemaRevision',\s*'20260804160000'[\s\S]*'single-active-course-composition-v1'/iu,
    "O manifesto final não exige identidade única da composição publicada."
  );
  assertContains(
    catalogCollectionReordering.source,
    /function\s+private\.protect_structural_catalog_collection_v1\s*\([\s\S]+catalog_structural_collection_semantics[\s\S]+create\s+trigger\s+catalog_collections_protect_structural_other_v1/iu,
    "A identidade semântica da coleção Outros não está protegida no banco."
  );
  assertContains(
    alphabeticCatalog.source,
    /alter\s+table\s+public\.catalog_collections[\s\S]+drop\s+column\s+position[\s\S]+alter\s+table\s+public\.catalog_collection_courses[\s\S]+drop\s+column\s+position/iu,
    "O corte alfabético não removeu posições manuais de Coleções."
  );
  assertContains(
    alphabeticCatalog.source,
    /drop\s+function\s+if\s+exists\s+public\.move_catalog_collection_v5[\s\S]+create\s+function\s+public\.move_catalog_course_v5\s*\([\s\S]+p_target_collection_id\s+uuid\s*\)/iu,
    "O catálogo não eliminou a reordenação preservando a transferência entre Coleções."
  );
  assertNotContains(
    alphabeticCatalog.source,
    /p_after_position|p_position\s+integer\s+default\s+null/iu,
    "O contrato final de Coleções ainda expõe posição manual."
  );
  assertContains(
    alphabeticCatalogRuntime.source,
    /order by placement\.position, placement\.id[\s\S]+order by placement\.id/iu,
    "O resolvedor editorial não foi recompilado sem posição manual."
  );
  assertContains(
    alphabeticCatalogRuntime.source,
    /private\.require_workspace_actor_v4[\s\S]+private\.require_workspace_actor_v5/iu,
    "Os leitores alfabéticos não foram recompilados contra a autoridade v5."
  );
  assertContains(
    alphabeticCatalogRuntime.source,
    /alter\s+function\s+private\.valid_trail_personal_state_v1\(jsonb\)\s+stable[\s\S]+alter\s+function\s+private\.merge_trail_personal_state_v1\(jsonb,\s*jsonb\)\s+stable/iu,
    "As funções de estado pessoal ainda anunciam volatilidade incompatível."
  );
  assertContains(
    alphabeticCatalogRuntime.source,
    /provolatile\s*<>\s*'s'[\s\S]+proconfig[\s\S]+search_path=pg_catalog[\s\S]+20260808022000/iu,
    "O corte não confirma volatilidade, search_path e revisão finais."
  );
  assertContains(
    authoringContinuity.source,
    /add\s+column\s+authoring_state\s+jsonb\s+not\s+null\s+default[\s\S]+private\.valid_authoring_continuity_v1\(authoring_state\)/iu,
    "A continuidade autoral não possui um único estado corrente validado."
  );
  assertContains(
    authoringProductStateProjection.source,
    /get_authoring_workspace_product_states_v1[\s\S]+microsequence_state_map[\s\S]+authoring-product-state-projection-v1/iu,
    "Landing e Mapa não possuem uma projeção autoral compacta e canônica."
  );
  assertContains(
    packageLibrary.source,
    /20260812120000[\s\S]+contractVersion[\s\S]+package-library-v1[\s\S]+package-contract-discovery-v1/iu,
    "O manifesto não anuncia a biblioteca e a descoberta de packages."
  );
  assertContains(
    catalogPackageCutover.source,
    /package_library_cutover_audit[\s\S]+previous_revision_hash[\s\S]+package_revision_hash[\s\S]+current_revision_hash\s+is\s+distinct\s+from[\s\S]+catalog-package-artifact-cutover-v1/iu,
    "O corte remoto não registra backup lógico, CAS e artefatos por packages."
  );
  assertContains(
    packageCutoverCleanup.source,
    /delete\s+from\s+private\.authoring_workspaces[\s\S]+20260812131000/iu,
    "Os workspaces transitórios do corte não são removidos."
  );
  if (
    !packageCardListProjection.source.includes(
      "list_authoring_workspace_microsequence_cards_v5"
    )
    || !packageCardListProjection.source.includes("'role', page.content ->> 'role'")
    || !packageCardListProjection.source.includes("'packages', page.packages")
    || !packageCardListProjection.source.includes("package-card-list-projection-v1")
  ) {
    fail("A lista paginada de cards não projeta role e packages do envelope corrente.");
  }
  assertContains(
    authoringContinuityVolatility.source,
    /alter\s+function\s+private\.valid_authoring_continuity_v1\(jsonb\)\s+stable[\s\S]+alter\s+function\s+private\.normalize_authoring_continuity_v1\([\s\S]+\)\s+stable[\s\S]+alter\s+function\s+private\.remap_authoring_continuity_v1\([\s\S]+\)\s+stable/iu,
    "Os helpers de continuidade autoral ainda anunciam volatilidade incompatível."
  );
  assertContains(
    authoringContinuity.source,
    /octet_length\(p_state::text\)\s*>\s*65536[\s\S]+jsonb_array_length\(v_part->'microsequenceIds'\)\s*>\s*500/iu,
    "A continuidade autoral não fecha os limites econômicos do estado."
  );
  assertContains(
    authoringContinuity.source,
    /function\s+public\.get_authoring_workspace_continuity_v1\s*\([\s\S]+function\s+public\.update_authoring_workspace_continuity_v1\s*\([\s\S]+function\s+public\.manage_authoring_workspace_finding_v1\s*\(/iu,
    "As RPCs internas de retomada e achados não foram instaladas."
  );
  assertContains(
    authoringContinuity.source,
    /function\s+private\.educational_workspace_effective_role_v1[\s\S]+educational_workspace_can_v1\([\s\S]+then\s+'admin'[\s\S]+create\s+or\s+replace\s+function\s+private\.require_educational_workspace_capability_v1[\s\S]+educational_workspace_effective_role_v1/iu,
    "O guard de continuidade não reconhece a capacidade editorial global."
  );
  assertContains(
    authoringContinuity.source,
    /get_authoring_workspace_v5\(uuid,uuid,text\[\],boolean\)[\s\S]+educational_workspace_effective_role_v1\(v_workspace\.id,\s*p_owner_id\)[\s\S]+list_authoring_workspaces_v5\(uuid,integer,timestamptz,uuid\)[\s\S]+educational_workspace_effective_role_v1\(page\.id,\s*p_owner_id\)/iu,
    "As leituras autorais não projetam o papel efetivo do editor global."
  );
  assertContains(
    authoringContinuity.source,
    /function\s+private\.remap_authoring_continuity_v1[\s\S]+Merge cruza Partes[\s\S]+rename\s+to\s+commit_authoring_workspace_changes_without_continuity_v1[\s\S]+continuityMandateConsumed/iu,
    "O commit v5 não remapeia Partes e mandato no mesmo CAS de split/merge."
  );
  assertContains(
    authoringContinuity.source,
    /function\s+private\.authoring_finding_touched_by_commit_v1[\s\S]+v_pending_finding_ids[\s\S]+pending_correction_request_id\s*=\s*p_request_id[\s\S]+pending_revision\s*=\s*\(v_result->>'revision'\)::bigint[\s\S]+v_finding\.pending_correction_request_id/iu,
    "O commit v5 não preserva atomicamente o handoff dos achados tocados."
  );
  assertContains(
    authoringContinuity.source,
    /function\s+private\.authoring_audit_target_in_part_v1[\s\S]+targetPartId[\s\S]+function\s+public\.manage_authoring_workspace_finding_v1[\s\S]+p_operation\s+in\s*\(\s*'create',\s*'verify'\s*\)[\s\S]+\{mandate,kind\}[\s\S]+distinct\s+from\s+'audit'[\s\S]+authoring_audit_target_in_part_v1/iu,
    "Criação e reauditoria de achados não exigem mandato audit vigente."
  );
  assertContains(
    authoringContinuity.source,
    /p_entity_type\s*=\s*'microsequence'[\s\S]+array\[v_target_id\][\s\S]+p_entity_type\s+in\s*\('card',\s*'resource'\)[\s\S]+array\[p_entity_path\[4\]\]/iu,
    "A reauditoria focal perde o recorte após excluir micro, card ou resource."
  );
  assertContains(
    authoringContinuity.source,
    /add\s+column\s+audit_part_id\s+text[\s\S]+proposed_repair,\s*audit_revision,\s*audit_part_id[\s\S]+\{mandate,targetPartId\}[\s\S]+v_finding\.audit_part_id[\s\S]+authoring_observation_target_available_v1/iu,
    "A reauditoria focal não conserva a Parte de um ancestral já apagado."
  );
  assertContains(
    authoringContinuity.source,
    /set\s+status\s*=\s*'repaired'[\s\S]+v_consume_mandate\s*:=\s*true[\s\S]+elsif\s+p_operation\s*=\s*'verify'/iu,
    "O vínculo de correção não consome atomicamente o achado reparado."
  );
  assertContains(
    authoringContinuity.source,
    /function\s+private\.remap_authoring_continuity_v1[\s\S]+v_decisions[\s\S]+\{entityId\}[\s\S]+to_jsonb\(v_target_id\)[\s\S]+\{decisions\}/iu,
    "O merge não remapeia decisões da origem para a microssequência sobrevivente."
  );
  assertContains(
    authoringContinuity.source,
    /function\s+private\.authoring_post_change_path_v1[\s\S]+function\s+private\.assert_authoring_commit_mandate_v1[\s\S]+Mandato de auditoria não autoriza[\s\S]+Mandato build_part aceita somente[\s\S]+cardShellChangedPaths[\s\S]+Resource escapa dos achados autorizados[\s\S]+v_pre_change_path[\s\S]+v_post_change_path[\s\S]+Reestruturação escapa da Parte autorizada/iu,
    "O commit v5 não aplica integralmente o mandato autoral corrente."
  );
  assertContains(
    authoringContinuity.source,
    /v_entity_type\s*=\s*'card'[\s\S]+p_operation\s+in\s*\('split_microsequence',\s*'merge_microsequences'\)[\s\S]+v_pre_parent_id[\s\S]+v_post_parent_id[\s\S]+continuityRemap/iu,
    "Split/merge focal não valida os cards participantes na mesma Parte."
  );
  assertContains(
    authoringContinuity.source,
    /add\s+column\s+correction_resulting_revision[\s\S]+function\s+private\.authoring_comment_correction_revision_v1[\s\S]+event\.created_at\s*>\s*p_comment_created_at[\s\S]+changedCardPathsTruncated[\s\S]+incorporated exige vínculo com correção autoral validada[\s\S]+correction_resulting_revision\s*=\s*v_resulting_revision/iu,
    "Comentários situados ainda podem ser incorporados sem correção comprovada."
  );
  assertContains(
    authoringContinuity.source,
    /prune_authoring_workspace_terminal_findings_v1[\s\S]+interval\s+'90 days'[\s\S]+ordinal\s*>\s*100/iu,
    "A retenção não limita apenas o histórico terminal por workspace."
  );
  assertContains(
    authoringContinuity.source,
    /observation\.author_id\s*=\s*p_actor_id[\s\S]+educational_workspace_can_v1\([\s\S]+p_actor_id,\s*'review'[\s\S]+function\s+public\.get_authoring_workspace_continuity_v1[\s\S]+p_workspace_id,\s*p_actor_id,\s*'review'/iu,
    "A retomada e as observações não respeitam a fronteira de review."
  );
  assertContains(
    authoringContinuity.source,
    /targetPaths[\s\S]+authoring_observation_paths_related_v1[\s\S]+changedCardPaths[\s\S]+resourceTargets[\s\S]+resource_target->>'targetId'[\s\S]+A correção confirmada não alcança o resource do achado/iu,
    "O vínculo de correção não prova relação com qualquer alvo confirmado."
  );
  assertContains(
    authoringContinuity.source,
    /p_operation\s+not\s+in\s*\(\s*'define_part'[\s\S]+'record_approved_plan'[\s\S]+private\.authoring_workspace_requests[\s\S]+v_workspace\.revision\s*<>\s*p_expected_revision/iu,
    "A continuidade não usa operações fechadas, receipts e CAS."
  );
  assertContains(
    authoringContinuity.source,
    /p_entity_types\s+text\[\][\s\S]+p_kinds\s+text\[\][\s\S]+p_statuses\s+text\[\][\s\S]+p_limit\s+not\s+between\s+1\s+and\s+50/iu,
    "A listagem estrutural não oferece filtros e paginação limitada."
  );
  assertContains(
    authoringContinuity.source,
    /\{schemaRevision\}[\s\S]+20260809010000[\s\S]+'resumable-authoring-continuity-v1'/iu,
    "O manifesto não anuncia a continuidade autoral retomável."
  );
  assertNotContains(
    authoringContinuity.source,
    /authoring_(?:state_)?snapshot|prompt_(?:text|body)|card_snapshot/iu,
    "A continuidade autoral introduziu snapshots ou prompts persistidos."
  );
  assertContains(
    workspaceEntityObservations.source,
    /function\s+private\.manage_authoring_workspace_observation_v1\s*\(/iu,
    "A mutação atômica de observações do workspace não foi instalada."
  );
  assertContains(
    workspaceEntityObservations.source,
    /'schemaRevision',\s*'20260803020000'[\s\S]*'workspace-entity-observations-v1'/iu,
    "O manifesto final não exige as observações integradas às partes do workspace."
  );
  assertContains(
    unifiedTrails.source,
    /create\s+table\s+private\.trail_items[\s\S]+alter\s+table\s+public\.study_path_courses\s+rename\s+to\s+study_path_items/iu,
    "Trilhas não possui identidade própria e agrupamento remoto corrente."
  );
  assertContains(
    unifiedTrails.source,
    /0::integer\s+as\s+sort_path_position[\s\S]+0::integer\s+as\s+sort_item_position/iu,
    "A paginação de Trilhas ainda depende de posições mutáveis."
  );
  assertNotContains(
    unifiedTrails.source,
    /order\s+by\s+workspace\.updated_at\s+desc\s*,\s*workspace\.id\s*,\s*course\.position/iu,
    "A paginação de Trilhas ainda muda quando o workspace é atualizado."
  );
  assertContains(
    alphabeticTrails.source,
    /alter\s+table\s+public\.study_paths[\s\S]+drop\s+column\s+position[\s\S]+alter\s+table\s+public\.study_path_items[\s\S]+drop\s+column\s+position/iu,
    "O corte alfabético não removeu as posições manuais de Trilhas."
  );
  assertNotContains(
    alphabeticTrails.source,
    /p_after_path_position|p_after_item_position|'targetPosition'|p_operation\s*=\s*'move_(?:group|item)'/iu,
    "O contrato final de Trilhas ainda expõe ordenação manual."
  );
  assertContains(
    trailPersonalState.source,
    /'progress'\s*,\s*jsonb_build_object\(\s*'version'\s*,\s*3\s*,\s*'lessons'/iu,
    "O estado pessoal não usa IDs estáveis no progresso compacto v3."
  );
  assertNotContains(
    trailPersonalState.source,
    /['"]progress\.cards['"]/iu,
    "O estado pessoal ainda duplica um objeto por card concluído."
  );
  assertContains(
    trailPersonalState.source,
    /from\s+public\.user_course_selections\s+selection[\s\S]+join\s+private\.trail_item_courses\s+alias[\s\S]+join\s+private\.trail_items\s+item/iu,
    "O backfill não preserva cursos que têm somente seleção."
  );
  assertContains(
    trailPersonalState.source,
    /select\s+distinct\s+card_id[\s\S]+completedCardIds/iu,
    "A fusão do estado pessoal não deduplica conclusões da mesma lição."
  );
  assertContains(
    trailObservationThreads.source,
    /create\s+table\s+private\.trail_observation_threads[\s\S]+trail_item_id[\s\S]+card_id\s+text[\s\S]+status\s+text/iu,
    "A triagem de observações não está ligada à identidade de Trilhas."
  );
  assertNotContains(
    trailObservationThreads.source,
    /remap_trail|path_prefix|authoring_workspace_entity_trail_state_move/iu,
    "A persistência por IDs estáveis ainda carrega remapeamento hierárquico."
  );
  assertContains(
    unifiedTrailsCleanCutover.source,
    /drop\s+table\s+if\s+exists\s+public\.lesson_progress\s*;[\s\S]+drop\s+table\s+if\s+exists\s+public\.card_progress\s*;[\s\S]+drop\s+table\s+if\s+exists\s+public\.card_comments\s*;/iu,
    "O corte final não remove explicitamente as tabelas pessoais antigas."
  );
  assertNotContains(
    unifiedTrailsCleanCutover.source,
    /drop\s+table[^;]+(?:lesson_progress|card_progress|card_comments)[^;]+cascade/iu,
    "O corte final ainda mascara dependências antigas com DROP CASCADE."
  );
  for (const functionName of [
    "list_current_educational_workspace_comments_v1",
    "list_educational_workspace_comments_for_actor_v1",
    "manage_current_educational_workspace_comment_v1",
    "manage_educational_workspace_comment_for_actor_v1"
  ]) {
    assertNotContains(
      unifiedTrailsCleanCutover.source,
      new RegExp(`drop\\s+function[^;]+${escapePattern(functionName)}`, "iu"),
      `O corte final retiraria a operação MCP de observações ${functionName}.`
    );
  }
  for (const commentSource of [
    workspacePedagogicalComments.source,
    workspaceCommentAggregates.source
  ]) {
    assertNotContains(
      commentSource,
      /public\.(cards|microsequences|lessons|modules)\b/iu,
      "A triagem de observações ainda depende da árvore pedagógica relacional removida."
    );
  }
  assertContains(
    workspacePedagogicalComments.source,
    /revoke\s+all\s+on\s+table\s+public\.card_comments\s+from\s+public\s*,\s*anon\s*,\s*authenticated/iu,
    "A tabela de observações ainda permite forjar resposta fora das RPCs."
  );
  assertContains(
    oauthOnlyCutover.source,
    /drop\s+table\s+if\s+exists\s+private\.authoring_api_clients\s+cascade/iu,
    "A tabela de credenciais estáticas de autoria não foi removida."
  );
  assertContains(
    oauthOnlyCutover.source,
    /function\s+public\.resolve_authoring_oauth_principal\s*\(/iu,
    "O principal OAuth do MCP não foi materializado."
  );
  assertContains(
    oauthOnlyCutover.source,
    /create\s+function\s+private\.require_workspace_actor_v4\s*\(\s*p_owner_id\s+uuid,\s*p_scope\s+text/iu,
    "A guarda dos workspaces ainda não possui assinatura OAuth nativa."
  );
  assertContains(
    oauthOnlyCutover.source,
    /list_personal_library_courses\s*\(\s*uuid,\s*integer,\s*integer,\s*uuid,\s*text\s*\)/iu,
    "A biblioteca pessoal ainda não possui assinatura OAuth nativa."
  );
  assertContains(
    oauthOnlyCutover.source,
    /'oauth-only-authoring-mcp'/u,
    "O manifesto vigente não anuncia o corte OAuth-only."
  );
  assertContains(
    defaultCatalogCollection.source,
    /insert\s+into\s+public\.catalog_collections[\s\S]+'outros'[\s\S]+on\s+conflict\s*\(contract_key\)\s+do\s+nothing/iu,
    "A coleção padrão do catálogo não é provisionada de forma idempotente."
  );
  assertContains(
    defaultCatalogCollection.source,
    /function\s+public\.resolve_catalog_artifact_publisher_v4\s*\([\s\S]+collection\.contract_key\s*=\s*'outros'/iu,
    "A publicação inicial não resolve uma coleção padrão na biblioteca por packages."
  );
  assertContains(
    actionOAuth.source,
    /'confidential-gpt-action-oauth'/iu,
    "O manifesto vigente não anuncia o OAuth confidencial da Action."
  );
  assertContains(
    actionOAuthLink.source,
    /'gpt-action-oauth-linking'/iu,
    "O manifesto vigente não anuncia o vínculo posterior do GPT salvo."
  );
  assertContains(
    actionOAuthRelink.source,
    /drop\s+constraint\s+authoring_action_oauth_clients_creator_user_id_gpt_id_key/iu,
    "O vínculo OAuth anterior ainda impede a reconfiguração do mesmo GPT."
  );
  assertContains(
    actionOAuthRelink.source,
    /create\s+unique\s+index\s+authoring_action_oauth_one_active_gpt_per_creator_idx/iu,
    "O OAuth da Action não limita o GPT a um único vínculo ativo."
  );
  assertContains(
    actionOAuthRelink.source,
    /'gpt-action-oauth-relinking'/iu,
    "O manifesto vigente não anuncia a reconfiguração segura do GPT."
  );
  assertContains(
    actionOAuthStableCallback.source,
    /coalesce\(p_redirect_uri, ''\)\s*!~\s*'\^https:\/\/\(chatgpt\[\.\]com\|chat\[\.\]openai\[\.\]com\)\/aip\/g-/iu,
    "O OAuth da Action não restringe callbacks ao formato oficial do ChatGPT."
  );
  assertContains(
    actionOAuthStableCallback.source,
    /'gpt-action-oauth-stable-callback'/iu,
    "O manifesto vigente não anuncia o callback estável da Action."
  );
  assertContains(
    actionOAuthLink.source,
    /create\s+function\s+public\.create_authoring_action_oauth_client_setup_v4\s*\(/iu,
    "O OAuth da Action ainda depende do GPT antes de ele ser salvo."
  );
  assertContains(
    actionOAuthLink.source,
    /create\s+function\s+public\.link_authoring_action_oauth_client_v4\s*\(/iu,
    "O vínculo posterior do GPT salvo não foi instalado."
  );
  assertContains(
    actionOAuth.source,
    /create\s+table\s+private\.authoring_action_oauth_tokens[\s\S]+token_hash\s+text\s+primary\s+key/iu,
    "A Action não persiste tokens exclusivamente por hash."
  );
  for (const retiredEdgeModule of ["assembler.js", "planLimits.js"]) {
    if (await exists(path.join(
      repositoryRoot,
      "supabase",
      "functions",
      "_shared",
      "aralearn-authoring",
      retiredEdgeModule
    ))) {
      fail(`Módulo morto do motor por partes ainda existe: ${retiredEdgeModule}.`);
    }
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
  const runtimeManifest = JSON.parse(await fs.readFile(
    path.join(repositoryRoot, "supabase", "runtime-manifest.json"),
    "utf8"
  ));
  if (!packageObservationTargets ||
      !packageObservationTargets.source.includes("package-observation-targets-v1") ||
      !/v_slot\s+not\s+in\s*\(\s*'content'\s*,\s*'response'\s*,\s*'feedback'\s*\)/iu.test(packageObservationTargets.source)) {
    fail("Os alvos de observação não foram cortados para os slots dos packages.");
  }
  if (!catalogRootReuse
      || !catalogRootReuse.source.includes("catalog-authoring-root-reuse-v1")
      || !catalogRootReuse.source.includes("replace_catalog_authoring_document_v1")) {
    fail("O catálogo não reutiliza sua raiz autoral corrente.");
  }
  if (!strictCatalogRootReuse
      || !strictCatalogRootReuse.source.includes("strict-catalog-root-reuse-v1")
      || strictCatalogRootReuse.source.includes("publication.target = 'catalog'\n      and (")) {
    fail("A raiz oficial corrente ainda possui um caminho alternativo de transferência.");
  }
  if (!currentCatalogRootResolution
      || !currentCatalogRootResolution.source.includes("current-catalog-root-resolution-v1")
      || !currentCatalogRootResolution.source.includes("v_workspace_owner_id")) {
    fail("O publicador não resolve a raiz oficial independentemente do ator corrente.");
  }
  if (!discardCatalogMaterialization
      || !discardCatalogMaterialization.source.includes("discard-unpublished-catalog-materialization-v1")
      || !discardCatalogMaterialization.source.includes("Uma raiz publicada nao pode ser descartada")) {
    fail("Materializações administrativas interrompidas não têm limpeza estrita.");
  }
  if (!flatRuntimeManifest
      || !flatRuntimeManifest.source.includes("flat-runtime-manifest-v1")
      || !flatRuntimeManifest.source.includes("drop function if exists public.get_aralearn_runtime_manifest_before")) {
    fail("O manifesto remoto ainda depende da cadeia histórica de wrappers.");
  }
  if (!removedRuntimeManifestWrappers
      || !removedRuntimeManifestWrappers.source.includes("Wrappers historicos do manifesto ainda existem")) {
    fail("A remoção física dos wrappers históricos do manifesto não é verificada.");
  }
  if (runtimeManifest.schemaRevision !== "20260815233000" || runtimeManifest.contractVersion !== 1) {
    fail("O manifesto estático não aponta para o runtime autoral corrente.");
  }
  for (const feature of [
    "stable-trail-item-identity-v1",
    "atomic-trail-groups-v1",
    "trail-personal-state-v1",
    "atomic-trail-personal-state-v1",
    "stable-entity-personal-state-v1",
    "situated-trail-observations-v1",
    "workspace-trail-observations-v1",
    "unified-trails-clean-cutover-v1",
    "alphabetic-trails-v1",
    "alphabetic-catalog-v1",
    "resumable-authoring-continuity-v1",
    "package-library-v1",
    "package-contract-discovery-v1",
    "catalog-package-artifact-cutover-v1",
    "package-card-list-projection-v1",
    "package-observation-targets-v1",
    "catalog-authoring-root-reuse-v1",
    "strict-catalog-root-reuse-v1",
    "current-catalog-root-resolution-v1",
    "discard-unpublished-catalog-materialization-v1",
    "flat-runtime-manifest-v1",
    "parameterized-authoring-design-v1",
    "authoring-blueprint-artifact-receipt-v1",
    "authoring-product-state-projection-v1"
  ]) {
    if (!runtimeManifest.requiredFeatures.includes(feature)) {
      fail(`O manifesto estático não exige ${feature}.`);
    }
  }
  for (const retiredFeature of [
    "partial-private-publication",
    "situated-personal-comments-v1",
    "workspace-pedagogical-comments-v1",
    "non-punitive-study-state-v1",
    "non-punitive-study-projections-v1",
    "workspace-comment-aggregates-v1",
    "integrated-trails-v1",
    "catalog-collection-ordering-v1",
    "catalog-root-rebinding-v1"
  ]) {
    if (runtimeManifest.requiredFeatures.includes(retiredFeature)) {
      fail(`O manifesto estático ainda anuncia ${retiredFeature}.`);
    }
  }
  console.log(
    `Corte validado até ${runtimeManifest.schemaRevision}: biblioteca e catálogo por packages, manifesto remoto achatado, continuidade e desenho autoral parametrizado, alvos de observação package-native, raiz autoral oficial única e reutilizável, limpeza estrita de materializações interrompidas, Trilhas e Coleções alfabéticas, estado pessoal compacto, workspaces educacionais, OAuth/MCP/Action e uma revisão corrente por curso.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
