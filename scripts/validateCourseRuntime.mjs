import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "espree";
import { renderCourseDesignParameterCatalogSql } from "./syncCourseDesignParameterCatalog.mjs";
import { checkResourcePackageCatalog } from "./syncResourcePackageCatalog.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FEATURES = Object.freeze([
  "flat-runtime-manifest-v1",
  "single-live-course-identity-v1",
  "paged-live-course-composition-v1",
  "direct-course-access-v1",
  "course-cas-idempotency-v1",
  "oauth-only-authoring-mcp",
  "isolated-mcp-oauth-principal-v1",
  "package-library-v1",
  "package-contract-discovery-v1",
  "person-profile-v2",
  "public-course-study-v1",
  "course-file-access-policy-v1",
  "owned-course-copy-recovery-v1",
  "study-only-course-access-v1",
  "private-person-avatar-v1",
  "self-account-deletion-v1",
  "course-analysis-repertoire-v1",
  "course-curricular-map-v1",
  "course-instructional-plan-v3",
  "course-authoring-part-save-v1",
  "course-authoring-part-materialization-atomic-v2",
  "course-study-unit-inspection-v2",
  "course-authoring-configuration-v3",
  "authoring-preference-profiles-v1",
  "course-sources-v1",
  "course-source-roles-v1",
  "course-source-provenance-v1",
  "course-source-pdf-attachments-v1",
  "course-source-pdf-ingestion-v1",
  "course-source-pdf-ingestion-receipt-v1",
  "course-source-pdf-access-lifecycle-v1",
  "course-source-human-locators-v1",
  "course-anchored-annotations-v1",
  "course-anchored-annotations-atomic-create-v1",
  "course-annotation-subject-classification-v1",
  "course-personal-state-v2",
  "course-authoring-analytics-v4",
  "course-independent-copy-v1",
  "course-authoring-comparison-v1",
  "course-authoring-export-v1",
  "contextual-study-unit-edit-v1",
  "current-data-lifecycle-v1",
  "course-source-current-state-v1",
  "single-authoring-runtime-v1",
  "course-product-operations-v1",
  "current-administrative-maintenance-v1",
  "gpt-actions-openapi-v1"
]);

const CANONICAL_RUNTIME_FILES = Object.freeze([
  "public/main.js",
  "src/domain/courseAnchoredAnnotations.js",
  "src/domain/courseAuthoringAnalytics.js",
  "src/domain/courseComposition.js",
  "src/domain/courseDesignParameters.js",
  "src/domain/courseEntities.js",
  "src/domain/courseSources.js",
  "src/persistence/AuthSessionStore.js",
  "src/persistence/CourseLocalStore.js",
  "src/persistence/CourseAnnotationRepository.js",
  "src/persistence/CoursePersonalStateRepository.js",
  "src/study/CourseStudyBridge.js",
  "src/study/CourseStudyApplication.js",
  "src/study/CourseStudyRepository.js",
  "src/study/CourseStudyScreen.js",
  "src/resources/kernel/studyUnitEnvelope.js",
  "src/supabase/CourseApiClient.js",
  "src/supabase/CourseController.js",
  "src/ui/CourseAuthoringSurface.js",
  "src/ui/CourseAnalyticsPanel.js",
  "src/ui/downloadTextFile.js",
  "src/ui/CourseDesignPanel.js",
  "src/ui/CourseAuthoringProfiles.js",
  "src/ui/courseDesignControls.js",
  "src/ui/CourseInspectionSequence.js",
  "src/ui/CourseObservationsPanel.js",
  "src/ui/CourseSourcesPanel.js",
  "src/ui/courseAuthoringRoute.js",
  "src/ui/courseAuthoringViewModel.js",
  "src/ui/renderStudyUnitObservationSheet.js",
  "supabase/functions/_shared/aralearn-authoring/courseApiServer.js",
  "supabase/functions/_shared/aralearn-authoring/courseAuthoringState.js",
  "supabase/functions/_shared/aralearn-authoring/courseKnowledge.js",
  "supabase/functions/_shared/aralearn-authoring/courseHumanTaskExecutor.js",
  "supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js",
  "supabase/functions/_shared/aralearn-authoring/courseHumanCorrections.js",
  "supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js",
  "supabase/functions/_shared/aralearn-authoring/courseProtocol.js",
  "supabase/functions/_shared/aralearn-authoring/courseRouter.js",
  "supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js",
  "supabase/functions/_shared/aralearn-authoring/actionOAuthServer.js",
  "supabase/functions/_shared/aralearn-authoring/courseActionServer.js",
  "supabase/functions/aralearn-course-api/index.ts",
  "supabase/functions/aralearn-authoring-mcp/index.ts",
  "supabase/functions/aralearn-authoring-action/index.ts"
]);

const EDGE_RUNTIME_ENTRY_FILES = Object.freeze([
  "supabase/functions/aralearn-course-api/index.ts",
  "supabase/functions/aralearn-authoring-mcp/index.ts",
  "supabase/functions/aralearn-authoring-action/index.ts"
]);

const FORBIDDEN_RUNTIME_SYMBOLS = Object.freeze([
  "RemoteCourseCatalog",
  "LearningSpaces",
  "IndexedDbRelationalStore",
  "RelationalSyncEngine",
  "TrailPersonalStateRepository",
  "AuthoringWorkspaceClient",
  "AuthoringWorkspaceSurface",
  "workspaceId",
  "workspaceCourseId",
  "trailItemId",
  "courseRef",
  "plannedParts",
  "materializedParts",
  "authoring:private:write",
  "stale_workspace_revision",
  "workspace_source_unauthorized",
  "salvarCardsNaMicrossequencia",
  "authoringGuidance",
  "componentOptions",
  "load_course_personal_state_v1",
  "mutate_course_personal_state_v1",
  "saveCommentForPath",
  "deleteCommentForPath",
  "loadCommentForPath",
  "aralearn.course-instructional-plan.v2",
  "get_owned_course_instructional_plan_for_actor_v2",
  "materialize_course_authoring_part_for_actor_v1"
]);

const LEGACY_PERSONAL_OBSERVATIONS_ACCESS =
  /\b(?:state|personalState)(?:\?\.|\.)observations\b/u;

const STUDY_UNIT_SOURCE_CONTRACT_FILES = new Set([
  "src/resources/kernel/studyUnitEnvelope.js",
  "supabase/functions/_shared/aralearn/runtime/resources/kernel/studyUnitEnvelope.js"
]);

const FORBIDDEN_COURSE_SOURCE_ALIASES = Object.freeze([
  { pattern: /aralearn\.course-design-context\.v1/u, label: "contexto de materialização v1" },
  { pattern: /\b(?:sourceUses|unitSourceUses)\b/u, label: "alias de atribuição de Fonte" },
  { pattern: /\b(?:view|operation)\s*:\s*["'](?:sources|update_sources)["']/u,
    label: "alias de operação de Fonte" }
]);

const WILDCARD_SCOPE_AUTHORIZATION =
  /(?:\bscopes?\s*\.\s*(?:has|includes)\s*\(\s*["']\*["']\s*\)|\bscope\s*={2,3}\s*["']\*["']|["']\*["']\s*={2,3}\s*scope\b)/u;

function fail(message) {
  throw new Error(message);
}

async function read(relativePath) {
  return fs.readFile(path.join(repositoryRoot, relativePath), "utf8");
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(repositoryRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

function typescriptModuleSpecifiers(source) {
  const result = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gmu;
  for (const match of source.matchAll(pattern)) result.push(match[1]);
  return [...new Set(result)];
}

function javascriptModuleSpecifiers(source) {
  const tree = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const result = [];
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if ([
      "ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"
    ].includes(node.type) && typeof node.source?.value === "string") {
      result.push(node.source.value);
    } else if (node.type === "ImportExpression" && typeof node.source?.value === "string") {
      result.push(node.source.value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === "object") pending.push(value);
    }
  }
  return [...new Set(result)];
}

function moduleSpecifiers(source, filePath) {
  return path.extname(filePath).toLowerCase() === ".ts"
    ? typescriptModuleSpecifiers(source)
    : javascriptModuleSpecifiers(source);
}

async function collectEdgeRuntimeGraph() {
  const functionsRoot = path.join(repositoryRoot, "supabase", "functions");
  const pending = EDGE_RUNTIME_ENTRY_FILES.map((relativePath) =>
    path.join(repositoryRoot, relativePath)
  );
  const graph = new Map();
  while (pending.length) {
    const filePath = path.resolve(pending.pop());
    if (graph.has(filePath)) continue;
    if (filePath !== functionsRoot && !filePath.startsWith(`${functionsRoot}${path.sep}`)) {
      fail(`Import Edge fora de supabase/functions: ${filePath}.`);
    }
    const source = await fs.readFile(filePath, "utf8");
    graph.set(filePath, source);
    for (const specifier of moduleSpecifiers(source, filePath)) {
      if (!specifier.startsWith(".")) continue;
      const dependency = path.resolve(path.dirname(filePath), specifier);
      if (dependency !== functionsRoot && !dependency.startsWith(`${functionsRoot}${path.sep}`)) {
        fail(`Import Edge fora do runtime permitido: ${specifier}.`);
      }
      pending.push(dependency);
    }
  }
  return graph;
}

function relativePath(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

const RUNTIME_MANIFEST_FUNCTION_REPLACEMENT =
  /create\s+or\s+replace\s+function\s+public\.get_aralearn_runtime_manifest\s*\(/iu;

function migrationAdvancesRuntimeManifest(fileName, source) {
  const revision = fileName.match(/^(\d{14})_.+\.sql$/u)?.[1];
  if (!revision || !RUNTIME_MANIFEST_FUNCTION_REPLACEMENT.test(source)) return null;
  const revisionNearManifestField = new RegExp(
    `(?:schemaRevision[\\s\\S]{0,160}["']${revision}["']|` +
      `["']${revision}["'][\\s\\S]{0,160}schemaRevision)`,
    "u"
  );
  return revisionNearManifestField.test(source) ? revision : null;
}

export async function latestRuntimeManifestMigration(migrationsDirectory = path.join(
  repositoryRoot,
  "supabase",
  "migrations"
)) {
  const entries = await fs.readdir(migrationsDirectory, { withFileTypes: true });
  const candidates = (await Promise.all(entries
    .filter((entry) => entry.isFile() && /^(\d{14})_.+\.sql$/u.test(entry.name))
    .map(async (entry) => {
      const source = await fs.readFile(path.join(migrationsDirectory, entry.name), "utf8");
      const revision = migrationAdvancesRuntimeManifest(entry.name, source);
      return revision ? { fileName: entry.name, revision } : null;
    })))
    .filter(Boolean)
    .sort((left, right) => left.revision.localeCompare(right.revision, "en"));
  const latest = candidates.at(-1);
  if (!latest) fail("Nenhuma migration avança get_aralearn_runtime_manifest.");
  return Object.freeze(latest);
}

export async function validateRuntimeManifestRevision(
  manifest,
  migrationsDirectory
) {
  const latest = await latestRuntimeManifestMigration(migrationsDirectory);
  if (manifest.schemaRevision !== latest.revision) {
    fail(
      `O manifesto estático está na revisão ${manifest.schemaRevision || "desconhecida"}; ` +
      `a migration ${latest.fileName} exige ${latest.revision}.`
    );
  }
  return latest;
}

async function validateManifest() {
  const manifest = JSON.parse(await read("supabase/runtime-manifest.json"));
  const required = [...REQUIRED_FEATURES];
  if (manifest.schemaRevision !== "20260905163000" ||
      manifest.contractVersion !== 1 ||
      !Array.isArray(manifest.requiredFeatures) ||
      manifest.requiredFeatures.length !== required.length ||
      new Set(manifest.requiredFeatures).size !== required.length ||
      required.some((feature) => !manifest.requiredFeatures.includes(feature))) {
    fail("O manifesto estático não descreve exatamente o runtime final de Curso.");
  }
  await validateRuntimeManifestRevision(manifest);
  checkResourcePackageCatalog(repositoryRoot);
  const migrations = (await fs.readdir(path.join(repositoryRoot, "supabase/migrations")))
    .filter(name => name.endsWith(".sql")).sort().reverse();
  let catalogMigration = "";
  for (const name of migrations) {
    const source = await read(`supabase/migrations/${name}`);
    if (source.includes("-- COURSE_DESIGN_CATALOG_BEGIN")) { catalogMigration = source; break; }
  }
  if (!catalogMigration.replaceAll("\r\n", "\n").includes(renderCourseDesignParameterCatalogSql())) {
    fail("A projeção SQL de parâmetros diverge do catálogo canônico.");
  }

  const cut = await read(
    "supabase/migrations/20260902044404_cut_legacy_authoring_runtime.sql"
  );
  for (const token of [
    "begin;",
    "$authoring_runtime_cut_preflight$",
    "$authoring_runtime_cut_postflight$",
    "course_design_parameter_assignments",
    "save_course_authoring_part_for_actor_v1",
    "get_owned_course_design_for_actor_v2",
    "apply_course_design_command_for_actor_v2",
    "create_course_anchored_annotations_for_actor_v1",
    "get_course_source_pdf_download_for_actor_v1",
    "alter table private.course_source_revisions rename to course_sources",
    "drop table private.course_events",
    "drop table private.course_authoring_part_materializations",
    "drop table private.course_instructional_audit_runs",
    "drop table private.course_variant_comparison_sets",
    "drop policy if exists course_source_pdfs_owner_insert_v1",
    "to_jsonb('20260902044404'::text)",
    "commit;"
  ]) {
    if (!cut.includes(token)) fail(`A migration final não demonstra ${token}.`);
  }
  const globalCurriculum = await read(
    "supabase/migrations/20260903160000_global_curriculum_authoring_flow.sql"
  );
  for (const token of [
    "get_owned_course_instructional_plan_for_actor_v3",
    "save_course_curricular_map_for_actor_v1",
    "materialize_course_authoring_part_for_actor_v2",
    "drop function public.get_owned_course_instructional_plan_for_actor_v2",
    "alter function public.materialize_course_authoring_part_for_actor_v1",
    "rename to materialize_course_authoring_part_core_v1",
    "'course-analysis-repertoire-v1'",
    "'course-authoring-part-materialization-atomic-v2'",
    "'course-curricular-map-v1'",
    "'course-instructional-plan-v3'",
    "to_jsonb('20260903160000'::text)",
    "commit;"
  ]) {
    if (!globalCurriculum.includes(token)) {
      fail(`O fluxo curricular global não demonstra ${token}.`);
    }
  }
  const openResponseCatalog = await read(
    "supabase/migrations/20260903193000_add_open_response_component.sql"
  );
  for (const token of [
    "'1-3e5629f8'",
    "'1-4616b2e5'",
    "aralearn.response.open@1.0.0",
    "course_component_policy_assignments",
    "{componentPolicy,policy,catalogVersion}",
    "to_jsonb('20260903193000'::text)",
    "commit;"
  ]) {
    if (!openResponseCatalog.includes(token)) {
      fail(`A instalação de resposta aberta não demonstra ${token}.`);
    }
  }
  const actionCallback = await read(
    "supabase/migrations/20260902234800_bind_real_chatgpt_action_callback.sql"
  );
  for (const token of [
    "https://(chatgpt[.]com|chat[.]openai[.]com)/aip/g-",
    "v_authorization.redirect_uri <> p_redirect_uri",
    "cardinality(v_client.redirect_uris) = 0",
    "to_jsonb('20260902234800'::text)"
  ]) {
    if (!actionCallback.includes(token)) {
      fail(`A hotfix do callback real de Actions não demonstra ${token}.`);
    }
  }
  const pdfLifecycleHardening = await read(
    "supabase/migrations/20260903025658_harden_course_source_pdf_lifecycle.sql"
  );
  for (const token of [
    "course-change-request:",
    "course-row:",
    "course-source-pdf-object:",
    "claim_pending_course_source_pdf_delete_for_source_for_actor_v1",
    "to_jsonb('20260903025658'::text)",
    "commit;"
  ]) {
    if (!pdfLifecycleHardening.includes(token)) {
      fail(`O endurecimento do ciclo de PDF não demonstra ${token}.`);
    }
  }
  const analyticsApplicability = await read(
    "supabase/migrations/20260902180219_count_expository_parameter_usage_in_analytics.sql"
  );
  for (const token of [
    "new_analysis_unit_ceiling_per_expository_study_unit",
    "design.application->>'mode' in('expository','mixed')",
    "to_jsonb('20260902180219'::text)"
  ]) {
    if (!analyticsApplicability.includes(token)) {
      fail(`A aplicabilidade de parâmetros em Analytics não demonstra ${token}.`);
    }
  }
  if (/drop\s+[^;]+\s+cascade\s*;/iu.test(cut) ||
      cut.includes("execute v_definition")) {
    fail("A migration final usa corte implícito ou restaura capacidade removida.");
  }
  const focalCorrection = await read(
    "supabase/migrations/20260902160602_preserve_course_design_on_focal_mcp_corrections.sql"
  );
  for (const token of [
    "v_design_preservable_study_unit_ids",
    "p_channel='mcp'",
    "p_application_origin='provider_assistance'",
    "'{appliedAt}'",
    "to_jsonb(entity.updated_at)",
    "private.course_component_refs_from_content_v1(entity.content)",
    "private.course_component_policy_allows_v1(",
    "to_jsonb('20260902160602'::text)"
  ]) {
    if (!focalCorrection.includes(token)) {
      fail(`A preservação do desenho na correção MCP não demonstra ${token}.`);
    }
  }
  for (const removed of [
    "src/domain/courseAuditCycle.js",
    "src/domain/courseVariants.js",
    "src/ui/CourseAuditPanel.js",
    "src/ui/CourseVariantsPanel.js",
    "supabase/functions/_shared/aralearn/runtime/domain/courseAuditCycle.js",
    "supabase/functions/_shared/aralearn/runtime/domain/courseVariants.js"
  ]) {
    if (await exists(removed)) fail(`O runtime removido ainda existe: ${removed}.`);
  }
}

async function validateRuntimeFiles() {
  const entries = await Promise.all(CANONICAL_RUNTIME_FILES.map(async (runtimePath) => ({
    relativePath: runtimePath,
    source: await read(runtimePath)
  })));
  const edgeGraph = await collectEdgeRuntimeGraph();
  const browserCourseDesign = entries.find(({ relativePath }) =>
    relativePath === "src/domain/courseDesignParameters.js")?.source;
  const edgeCourseDesign = edgeGraph.get(path.join(
    repositoryRoot,
    "supabase/functions/_shared/aralearn/runtime/domain/courseDesignParameters.js"
  ));
  if (!browserCourseDesign || browserCourseDesign !== edgeCourseDesign) {
    fail("O domínio do desenho parametrizado diverge entre navegador e Edge.");
  }
  const browserCourseSources = entries.find(({ relativePath }) =>
    relativePath === "src/domain/courseSources.js")?.source;
  const edgeCourseSources = edgeGraph.get(path.join(
    repositoryRoot,
    "supabase/functions/_shared/aralearn/runtime/domain/courseSources.js"
  ));
  if (!browserCourseSources || browserCourseSources !== edgeCourseSources) {
    fail("O domínio de Fontes diverge entre navegador e Edge.");
  }
  const browserAnchoredAnnotations = entries.find(({ relativePath }) =>
    relativePath === "src/domain/courseAnchoredAnnotations.js")?.source;
  const edgeAnchoredAnnotations = edgeGraph.get(path.join(
    repositoryRoot,
    "supabase/functions/_shared/aralearn/runtime/domain/courseAnchoredAnnotations.js"
  ));
  if (!browserAnchoredAnnotations || browserAnchoredAnnotations !== edgeAnchoredAnnotations) {
    fail("O domínio de observações ancoradas diverge entre navegador e Edge.");
  }
  for (const [filePath, source] of edgeGraph) {
    const runtimePath = relativePath(filePath);
    if (WILDCARD_SCOPE_AUTHORIZATION.test(source)) {
      fail(`${runtimePath} ainda aceita wildcard como escopo de autorização.`);
    }
    if (!entries.some((entry) => entry.relativePath === runtimePath)) {
      entries.push({ relativePath: runtimePath, source });
    }
  }
  for (const { relativePath, source } of entries) {
    for (const symbol of FORBIDDEN_RUNTIME_SYMBOLS) {
      if (source.includes(symbol)) {
        fail(`${relativePath} ainda usa o símbolo substituído ${symbol}.`);
      }
    }
    if (STUDY_UNIT_SOURCE_CONTRACT_FILES.has(relativePath) && /\bsources\b/u.test(source)) {
      fail(`${relativePath} ainda expõe StudyUnit.sources.`);
    }
    if (/\b(?:studyUnit|study_unit|cloned)(?:\?\.|\.)sources\b/u.test(source)) {
      fail(`${relativePath} ainda lê StudyUnit.sources.`);
    }
    if (LEGACY_PERSONAL_OBSERVATIONS_ACCESS.test(source)) {
      fail(`${relativePath} ainda lê state.observations do contrato pessoal removido.`);
    }
    for (const { pattern, label } of FORBIDDEN_COURSE_SOURCE_ALIASES) {
      if (pattern.test(source)) fail(`${relativePath} ainda usa ${label}.`);
    }
  }
  if (!entries.some(({ relativePath: runtimePath }) =>
    runtimePath.endsWith("/toolErrorEnvelope.js"))) {
    fail("O grafo Edge não alcançou o envelope de erros compartilhado.");
  }
  const main = entries.find(({ relativePath }) => relativePath === "public/main.js")?.source || "";
  for (const required of [
    "AuthSessionStore", "CourseLocalStore", "CourseApiClient", "CourseController",
    "CourseStudyBridge", "CourseStudyRepository", "createCourseAuthoringSurface"
  ]) {
    if (!main.includes(required)) fail(`O entrypoint não usa ${required}.`);
  }
  const adapter = entries.find(({ relativePath }) =>
    relativePath.endsWith("/courseSupabaseAdapter.js"))?.source || "";
  for (const required of [
    "aralearn.course-instructional-plan.v3",
    "get_owned_course_instructional_plan_for_actor_v3",
    "save_course_curricular_map_for_actor_v1",
    "materialize_course_authoring_part_for_actor_v2"
  ]) {
    if (!adapter.includes(required)) {
      fail(`O adapter final não usa ${required}.`);
    }
  }
  const authStore = await read("src/persistence/AuthSessionStore.js");
  const courseStore = await read("src/persistence/CourseLocalStore.js");
  if (!authStore.includes("aralearn-auth-v1") ||
      !courseStore.includes("aralearn-course-v1")) {
    fail("Os namespaces locais canônicos não estão isolados.");
  }
}

async function validateEdgeAndMcp() {
  if (!await exists("supabase/functions/aralearn-authoring-action/index.ts")) {
    fail("A Edge Function de Actions/OpenAPI não existe.");
  }
  const config = await read("supabase/config.toml");
  if (!config.includes("[functions.aralearn-course-api]") ||
      !config.includes("[functions.aralearn-authoring-action]")) {
    fail("supabase/config.toml não declara API de Cursos e Actions.");
  }
  const courseApi = await read("supabase/functions/aralearn-course-api/index.ts");
  if (!courseApi.includes("ARALEARN_COURSE_API_ALLOWED_ORIGINS") ||
      !courseApi.includes("ARALEARN_PUBLIC_APP_URL")) {
    fail("A API de Cursos não usa a configuração canônica de origem e deep link.");
  }
  const toolsModule = await import(pathToFileURL(path.join(
    repositoryRoot,
    "supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js"
  )).href);
  const names = toolsModule.COURSE_HUMAN_TASKS.map(({ name }) => name);
  const expected = [
    "copiar_curso", "comparar_cursos", "exportar_autoria",
    "consultar_perfis", "salvar_perfil", "excluir_perfil", "prever_aplicacao_perfil", "aplicar_perfil",
    "retomar_curso", "consultar_planejamento", "preparar_materializacao",
    "consultar_configuracao", "consultar_observacoes", "preparar_revisao",
    "consultar_fontes", "consultar_componentes", "criar_curso", "salvar_mapa_curricular",
    "salvar_parte",
    "materializar_parte", "ajustar_configuracao", "registrar_observacao",
    "aplicar_correcoes", "manter_fonte", "incorporar_pdf_como_fonte", "guardar_audio", "consultar_audios"
  ];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    fail("O catálogo MCP não corresponde às vinte e sete tarefas humanas esperadas.");
  }
  if (names.some((name) => /(?:Workspace|Trilha|Colecao|Coleção|Publicacao|Publicação)/u.test(name))) {
    fail("O MCP ainda expõe uma ferramenta do modelo substituído.");
  }
}

async function validateDeploymentPath() {
  const deployment = await read("scripts/deploySupabase.ps1");
  for (const required of [
    "functions deploy aralearn-authoring-mcp",
    "functions deploy aralearn-course-api",
    "ARALEARN_COURSE_API_ALLOWED_ORIGINS",
    "ARALEARN_PUBLIC_APP_URL",
    "As três funções foram atualizadas",
    "este script não executa rollback automático"
  ]) {
    if (!deployment.includes(required)) {
      fail(`O fluxo de implantação não contém ${required}.`);
    }
  }
  if (!deployment.includes("secrets set \"ARALEARN_AUTHORING_ACTION_ALLOWED_ORIGINS=") ||
      !deployment.includes("functions deploy aralearn-authoring-action")) {
    fail("O fluxo de implantação não preserva a configuração e a função de Actions.");
  }
  if (deployment.includes("ARALEARN_AUTHORING_ALLOWED_ORIGINS=") ||
      deployment.includes("secrets unset") ||
      deployment.indexOf("ARALEARN_AUTHORING_MCP_ALLOWED_ORIGINS=$origins") >
      deployment.indexOf("functions deploy aralearn-authoring-mcp") ||
      deployment.indexOf("functions deploy aralearn-course-api") >
        deployment.indexOf("Invoke-WebRequest") ||
      deployment.indexOf("Invoke-WebRequest") >
        deployment.indexOf("runHostedMcpOAuthSmoke.mjs") ||
      deployment.indexOf("runHostedMcpOAuthSmoke.mjs") >
        deployment.indexOf("As três funções foram atualizadas") ||
      /functions\s+delete|Remove-AraLearnSupabaseFunctionIfPresent/u.test(deployment)) {
    fail("A implantação não preserva a ordem segura entre configuração, smoke e manutenção do runtime publicado.");
  }
}

async function main() {
  await validateManifest();
  await validateRuntimeFiles();
  await validateEdgeAndMcp();
  await validateDeploymentPath();

  console.log(
    "Runtime de Curso validado: identidade viva única, composição paginada, acesso direto, " +
    "estado pessoal, perfil humano, acesso de Estudo, avatar privado, inspeção vertical, " +
    "desenho parametrizado, Autoria visual e MCP."
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
