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
      || !educationalWorkspaces || !workspaceCapabilityEnforcement || !workspaceCurrentState) {
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
    "A publicação inicial não resolve uma coleção padrão no contrato v4."
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
  console.log(
    `Corte validado até ${workspaceCurrentState.fileName}: workspaces educacionais, observações situadas, estado corrente paginado, OAuth/MCP/Action e uma revisão corrente por curso publicado.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
