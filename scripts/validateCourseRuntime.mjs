import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "espree";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FEATURES = Object.freeze([
  "flat-runtime-manifest-v1",
  "single-live-course-identity-v1",
  "paged-live-course-composition-v1",
  "direct-course-access-v1",
  "course-cas-idempotency-v1",
  "oauth-only-authoring-mcp",
  "package-library-v1",
  "package-contract-discovery-v1",
  "person-profile-v1",
  "study-only-course-access-v1",
  "private-person-avatar-v1",
  "self-account-deletion-v1",
  "course-instructional-plan-v1",
  "course-authoring-part-materialization-v1",
  "course-study-unit-inspection-v1",
  "course-design-parameters-v1",
  "course-authoring-guidance-v1",
  "course-component-policy-v1",
  "course-sources-v1",
  "course-source-provenance-v1",
  "course-source-pdf-attachments-v1",
  "course-anchored-annotations-v1",
  "course-annotation-subject-classification-v1",
  "course-personal-state-v2",
  "course-audit-cycle-v1",
  "course-authoring-corrections-v1",
  "course-audit-annotation-links-v1",
  "course-variant-comparisons-v1",
  "course-variant-comparison-list-v1",
  "course-authoring-analytics-v1",
  "course-variant-factual-comparison-v1",
  "contextual-study-unit-edit-v1"
]);

const CANONICAL_RUNTIME_FILES = Object.freeze([
  "public/main.js",
  "src/domain/courseAnchoredAnnotations.js",
  "src/domain/courseAuditCycle.js",
  "src/domain/courseAuthoringAnalytics.js",
  "src/domain/courseAuthoringPlan.js",
  "src/domain/courseComposition.js",
  "src/domain/courseDesignParameters.js",
  "src/domain/courseEntities.js",
  "src/domain/courseSources.js",
  "src/domain/courseVariants.js",
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
  "src/ui/CourseInspectionSequence.js",
  "src/ui/CourseObservationsPanel.js",
  "src/ui/CourseSourcesPanel.js",
  "src/ui/CourseVariantsPanel.js",
  "src/ui/courseAuthoringRoute.js",
  "src/ui/courseAuthoringViewModel.js",
  "src/ui/renderStudyUnitObservationSheet.js",
  "supabase/functions/_shared/aralearn-authoring/courseApiServer.js",
  "supabase/functions/_shared/aralearn-authoring/courseAuthoringState.js",
  "supabase/functions/_shared/aralearn-authoring/courseKnowledge.js",
  "supabase/functions/_shared/aralearn-authoring/courseMcpTools.js",
  "supabase/functions/_shared/aralearn-authoring/courseMcpAppResource.js",
  "supabase/functions/_shared/aralearn-authoring/courseProtocol.js",
  "supabase/functions/_shared/aralearn-authoring/courseRouter.js",
  "supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js",
  "supabase/functions/_shared/aralearn-authoring/courseToolExecutor.js",
  "supabase/functions/aralearn-course-api/index.ts",
  "supabase/functions/aralearn-authoring-mcp/index.ts"
]);

const EDGE_RUNTIME_ENTRY_FILES = Object.freeze([
  "supabase/functions/aralearn-course-api/index.ts",
  "supabase/functions/aralearn-authoring-mcp/index.ts"
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
  "loadCommentForPath"
]);

const COURSE_PERSONAL_STATE_REPOSITORY =
  "src/persistence/CoursePersonalStateRepository.js";
const LEGACY_PERSONAL_OBSERVATIONS_ACCESS =
  /\b(?:state|personalState)(?:\?\.|\.)observations\b/u;

const STUDY_UNIT_SOURCE_CONTRACT_FILES = new Set([
  "src/resources/kernel/studyUnitEnvelope.js",
  "supabase/functions/_shared/aralearn/runtime/resources/kernel/studyUnitEnvelope.js"
]);

const COURSE_AUDIT_AUTHORING_GUIDANCE_CONTRACT_FILES = new Set([
  "src/domain/courseAuditCycle.js",
  "supabase/functions/_shared/aralearn/runtime/domain/courseAuditCycle.js"
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

function equalArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function legacyPersonalObservationsStayInHandoffConverter(source) {
  const start = source.indexOf("function legacyObservationIntents(");
  const end = source.indexOf("\nfunction mergeAnnotationHandoff(", start);
  const accesses = [...source.matchAll(
    /\b(?:state|personalState)(?:\?\.|\.)observations\b/gu
  )];
  return start >= 0 && end > start && accesses.length === 2 &&
    accesses.every((match) => match.index > start && match.index < end);
}

async function validateManifest() {
  const manifest = JSON.parse(await read("supabase/runtime-manifest.json"));
  if (manifest.schemaRevision !== "20260820224424" || manifest.contractVersion !== 1 ||
      !equalArray(manifest.requiredFeatures, REQUIRED_FEATURES)) {
    fail("O manifesto estático não descreve exatamente o runtime canônico de Curso.");
  }
  const courseMigration = await read(
    "supabase/migrations/20260817140000_course_identity_cutover.sql"
  );
  const profileMigration = await read(
    "supabase/migrations/20260817150000_course_profiles_access.sql"
  );
  const authoringPlanMigration = await read(
    "supabase/migrations/20260817160000_course_authoring_plan.sql"
  );
  const inspectionMigration = await read(
    "supabase/migrations/20260817170000_course_study_unit_inspection.sql"
  );
  const designMigration = await read(
    "supabase/migrations/20260817180000_course_design_parameters.sql"
  );
  const sourcesMigration = await read(
    "supabase/migrations/20260817190000_course_sources_provenance.sql"
  );
  const annotationsMigration = await read(
    "supabase/migrations/20260817200000_course_anchored_annotations.sql"
  );
  const auditMigration = await read(
    "supabase/migrations/20260817210000_course_audit_corrections.sql"
  );
  const variantsMigration = await read(
    "supabase/migrations/20260818042341_course_variant_comparisons.sql"
  );
  const variantListingManifestMigration = await read(
    "supabase/migrations/20260818052044_course_variant_listing_manifest.sql"
  );
  const sourcePdfMigration = await read(
    "supabase/migrations/20260820061206_course_source_pdf_attachments.sql"
  );
  const authoringAnalyticsMigration = await read(
    "supabase/migrations/20260820063156_course_authoring_analytics.sql"
  );
  const completeVariantComparisonMigration = await read(
    "supabase/migrations/20260820065720_complete_course_variant_comparison.sql"
  );
  const avatarPathMigration = await read(
    "supabase/migrations/20260820101500_fix_person_avatar_path_validation.sql"
  );
  const contextualCompositionMigration = await read(
    "supabase/migrations/20260820224424_canonical_study_unit_composition_edits.sql"
  );
  if (!courseMigration.includes("$advance_course_runtime_manifest$") ||
      !courseMigration.includes("'schemaRevision', '20260817140000'") ||
      !profileMigration.includes("$advance_profile_access_runtime_manifest$") ||
      !profileMigration.includes("'schemaRevision', '20260817150000'") ||
      !authoringPlanMigration.includes(
        "$advance_course_instructional_plan_runtime_manifest$"
      ) ||
      !authoringPlanMigration.includes("'schemaRevision', '20260817160000'") ||
      !inspectionMigration.includes(
        "$advance_course_study_unit_inspection_runtime_manifest$"
      ) ||
      !inspectionMigration.includes("'schemaRevision', '20260817170000'") ||
      !designMigration.includes("$advance_course_design_runtime_manifest$") ||
      !designMigration.includes("'schemaRevision','20260817180000'") ||
      !sourcesMigration.includes("$advance_course_sources_runtime_manifest$") ||
      !sourcesMigration.includes("'schemaRevision','20260817190000'") ||
      !annotationsMigration.includes("$advance_course_anchored_annotations_manifest$") ||
      !annotationsMigration.includes("'schemaRevision','20260817200000'") ||
      !annotationsMigration.includes(
        "where existing.value<>'course-personal-state-v1'"
      ) ||
      !auditMigration.includes("$advance_course_audit_corrections_manifest$") ||
      !auditMigration.includes("'schemaRevision','20260817210000'") ||
      !variantsMigration.includes("$advance_course_variant_comparisons_manifest$") ||
      !variantsMigration.includes("'schemaRevision','20260818042341'") ||
      !variantListingManifestMigration.includes("$advance_course_variant_listing_manifest$") ||
      !variantListingManifestMigration.includes("'schemaRevision','20260818052044'") ||
      !sourcePdfMigration.includes("$advance_course_source_pdf_runtime_manifest$") ||
      !sourcePdfMigration.includes("'schemaRevision','20260820061206'") ||
      !authoringAnalyticsMigration.includes("$advance_course_authoring_analytics_runtime_manifest$") ||
      !authoringAnalyticsMigration.includes("'schemaRevision','20260820063156'") ||
      !completeVariantComparisonMigration.includes(
        "$advance_course_variant_factual_comparison_runtime_manifest$"
      ) ||
      !completeVariantComparisonMigration.includes("'schemaRevision','20260820065720'") ||
      !avatarPathMigration.includes("$advance_person_avatar_path_runtime_manifest$") ||
      !avatarPathMigration.includes("to_jsonb('20260820101500'::text)") ||
      !contextualCompositionMigration.includes(
        "$advance_contextual_composition_manifest$"
      ) ||
      !contextualCompositionMigration.includes(
        "to_jsonb('20260820224424'::text)"
      ) ||
      !contextualCompositionMigration.includes(
        "contextual-study-unit-edit-v1"
      ) ||
      !contextualCompositionMigration.includes(
        "if p_channel = 'mcp' then"
      ) ||
      !contextualCompositionMigration.includes(
        "return v_result - 'channel' - 'applicationOrigin'"
      )) {
    fail("A migration de Curso não avança o manifesto remoto.");
  }
  for (const feature of REQUIRED_FEATURES) {
    if (!courseMigration.includes(`'${feature}'`) &&
        !profileMigration.includes(`'${feature}'`) &&
        !authoringPlanMigration.includes(`'${feature}'`) &&
        !inspectionMigration.includes(`'${feature}'`) &&
        !designMigration.includes(`'${feature}'`) &&
        !sourcesMigration.includes(`'${feature}'`) &&
        !annotationsMigration.includes(`'${feature}'`) &&
        !auditMigration.includes(`'${feature}'`) &&
        !variantsMigration.includes(`'${feature}'`) &&
        !variantListingManifestMigration.includes(`'${feature}'`) &&
        !sourcePdfMigration.includes(`'${feature}'`) &&
        !authoringAnalyticsMigration.includes(`'${feature}'`) &&
        !completeVariantComparisonMigration.includes(`'${feature}'`) &&
        !avatarPathMigration.includes(`'${feature}'`) &&
        !contextualCompositionMigration.includes(`'${feature}'`)) {
      fail(`A migration de Curso não declara ${feature}.`);
    }
  }
  if (!courseMigration.includes("pg_temp.course_content_import_v1") ||
      courseMigration.includes("course_content_import_gate")) {
    fail("A importação do Curso não está limitada à staging TEMP transacional.");
  }
}

async function validateRuntimeFiles() {
  const entries = await Promise.all(CANONICAL_RUNTIME_FILES.map(async (runtimePath) => ({
    relativePath: runtimePath,
    source: await read(runtimePath)
  })));
  const edgeGraph = await collectEdgeRuntimeGraph();
  const browserAuthoringPlan = entries.find(({ relativePath }) =>
    relativePath === "src/domain/courseAuthoringPlan.js")?.source;
  const edgeAuthoringPlan = edgeGraph.get(path.join(
    repositoryRoot,
    "supabase/functions/_shared/aralearn/runtime/domain/courseAuthoringPlan.js"
  ));
  if (!browserAuthoringPlan || browserAuthoringPlan !== edgeAuthoringPlan) {
    fail("O domínio do plano instrucional diverge entre navegador e Edge.");
  }
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
  const browserCourseAuditCycle = entries.find(({ relativePath }) =>
    relativePath === "src/domain/courseAuditCycle.js")?.source;
  const edgeCourseAuditCycle = edgeGraph.get(path.join(
    repositoryRoot,
    "supabase/functions/_shared/aralearn/runtime/domain/courseAuditCycle.js"
  ));
  if (!browserCourseAuditCycle || browserCourseAuditCycle !== edgeCourseAuditCycle) {
    fail("O domínio do ciclo de auditoria diverge entre navegador e Edge.");
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
      if (symbol === "authoringGuidance" &&
          COURSE_AUDIT_AUTHORING_GUIDANCE_CONTRACT_FILES.has(relativePath)) {
        continue;
      }
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
    if (LEGACY_PERSONAL_OBSERVATIONS_ACCESS.test(source) && (
      relativePath !== COURSE_PERSONAL_STATE_REPOSITORY ||
      !legacyPersonalObservationsStayInHandoffConverter(source)
    )) {
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
  const authStore = await read("src/persistence/AuthSessionStore.js");
  const courseStore = await read("src/persistence/CourseLocalStore.js");
  if (!authStore.includes("aralearn-auth-v1") ||
      !courseStore.includes("aralearn-course-v1")) {
    fail("Os namespaces locais canônicos não estão isolados.");
  }
}

async function validateEdgeAndMcp() {
  if (await exists("supabase/functions/aralearn-authoring-action/index.ts")) {
    fail("A Edge Function substituída aralearn-authoring-action ainda existe.");
  }
  const config = await read("supabase/config.toml");
  if (!config.includes("[functions.aralearn-course-api]") ||
      config.includes("[functions.aralearn-authoring-action]")) {
    fail("supabase/config.toml não aponta exclusivamente para a API de Cursos.");
  }
  const courseApi = await read("supabase/functions/aralearn-course-api/index.ts");
  if (!courseApi.includes("ARALEARN_COURSE_API_ALLOWED_ORIGINS") ||
      !courseApi.includes("ARALEARN_PUBLIC_APP_URL")) {
    fail("A API de Cursos não usa a configuração canônica de origem e deep link.");
  }
  const toolsModule = await import(pathToFileURL(path.join(
    repositoryRoot,
    "supabase/functions/_shared/aralearn-authoring/courseMcpTools.js"
  )).href);
  const names = toolsModule.COURSE_MCP_TOOLS.map(({ name }) => name);
  for (const required of [
    "listarCursos", "lerCurso", "criarCurso", "alterarCurso",
    "gerirPessoas", "consultarComponentesDidaticos"
  ]) {
    if (!names.includes(required)) fail(`O MCP não oferece ${required}.`);
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
    "As funções da versão publicada foram preservadas"
  ]) {
    if (!deployment.includes(required)) {
      fail(`O fluxo de implantação não contém ${required}.`);
    }
  }
  if (deployment.includes("secrets set \"ARALEARN_AUTHORING_ACTION_")) {
    fail("O fluxo de implantação ainda grava secrets da Action substituída.");
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
        deployment.indexOf("As funções da versão publicada foram preservadas") ||
      /functions\s+delete|Remove-AraLearnSupabaseFunctionIfPresent/u.test(deployment)) {
    fail("A implantação não preserva a ordem segura entre configuração, smoke e manutenção do runtime publicado.");
  }
}

await validateManifest();
await validateRuntimeFiles();
await validateEdgeAndMcp();
await validateDeploymentPath();

console.log(
  "Runtime de Curso validado: identidade viva única, composição paginada, acesso direto, " +
  "estado pessoal, perfil humano, acesso de Estudo, avatar privado, inspeção vertical, " +
  "desenho parametrizado, Autoria visual e MCP."
);
