import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const forbiddenFiles = [
  "src/core/authoringGaps.js",
  "src/core/authoringResourceContract.js",
  "src/core/cardRuntime.js",
  "src/core/choiceOptions.js",
  "src/core/resourceGaps.js",
  "src/core/textGaps.js",
  "src/domain/cardExerciseSupport.js",
  "src/domain/cards.js",
  "src/domain/resources.js",
  "src/flowchart/flowchartExercise.js",
  "src/flowchart/flowchartLayout.js",
  "src/flowchart/flowchartLayoutEngine.js",
  "src/flowchart/flowchartProjection.js",
  "src/flowchart/flowchartShapes.js",
  "src/flowchart/flowchartViewport.js",
  "src/generation/resources/cardResourceDefinitions.js",
  "src/render/renderCardRuntime.js",
  "src/render/renderPackageCardRuntime.js",
  "src/resources/registry/authoring.js",
  "src/resources/registry/index.js",
  "src/assist/cardAssistanceScope.js",
  "src/domain/educationalWorkspace.js",
  "src/domain/microsequence.js",
  "src/editor/contractEditor.js",
  "src/generation/runtime/cardAssistanceRuntime.js",
  "src/persistence/WorkspaceDesignOfflineStore.js",
  "src/supabase/AuthoringWorkspaceClient.js",
  "src/supabase/LearningSpaces.js",
  "src/supabase/RemoteCourseCatalog.js",
  "src/ui/AuthoringWorkspaceSurface.js",
  "src/ui/LearningSpacesPanel.js",
  "src/ui/lessonEditorApp.js",
  "src/ui/renderLessonScreen.js",
  "scripts/buildAuthoringPackages.mjs",
  "scripts/testAuthoringPackages.mjs",
  "scripts/syncInstructionalDesignSchemas.mjs",
  "tests/runtime/atomic-course-removal-pglite.test.js",
  "tests/runtime/catalog-collection-reordering-pglite.test.js",
  "tests/runtime/catalog-review-pglite.test.js",
  "tests/runtime/authoring-analytics-domain.test.js",
  "tests/runtime/authoring-experiment-domain.test.js",
  "tests/runtime/instructional-conformance-audit.test.js",
  "tests/runtime/instructional-design-domain-v1.test.js",
  "tests/kernel/instructional-design-contracts.test.js",
  "supabase/tests/020_artifact_control_plane_test.sql",
  "supabase/tests/030_authoring_continuity_test.sql",
  "supabase/tests/040_parameterized_authoring_design_test.sql",
  "supabase/tests/050_authoring_design_conformance_audit_test.sql",
  "supabase/tests/060_authoring_experiments_test.sql",
  "supabase/tests/070_authoring_analytics_test.sql",
  "authoring/schemas/workspace-envelope.schema.json",
  "docs/downloads/authoring/manifest.json",
  "supabase/functions/_shared/aralearn-authoring/actionServer.js",
  "supabase/functions/_shared/aralearn-authoring/authoringRouter.js",
  "supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js",
  "supabase/functions/_shared/aralearn-authoring/workspaceEngine.js",
  "supabase/functions/_shared/aralearn/runtime/core/authoringGaps.js",
  "supabase/functions/_shared/aralearn/runtime/core/authoringResourceContract.js",
  "supabase/functions/_shared/aralearn/runtime/core/choiceOptions.js",
  "supabase/functions/_shared/aralearn/runtime/core/ids.js",
  "supabase/functions/_shared/aralearn/runtime/core/resourceGaps.js",
  "supabase/functions/_shared/aralearn/runtime/core/text.js",
  "supabase/functions/_shared/aralearn/runtime/core/textGaps.js",
  "supabase/functions/_shared/aralearn/runtime/domain/cardExerciseSupport.js",
  "supabase/functions/_shared/aralearn/runtime/domain/cards.js",
  "supabase/functions/_shared/aralearn/runtime/domain/resources.js",
  "supabase/functions/_shared/aralearn/runtime/resources/registry/authoring.js",
  "supabase/functions/_shared/aralearn/runtime/resources/registry/index.js"
];

const forbiddenDirectories = [
  "authoring",
  "authoring/core",
  "authoring/examples",
  "authoring/knowledge",
  "authoring/platforms",
  "docs/downloads/authoring",
  "src/authoring",
  "src/assist",
  "src/generation",
  "supabase/functions/_shared/aralearn/runtime/authoring"
];

const sourceRoots = [
  "src",
  "supabase/functions/_shared/aralearn/runtime"
];

const forbiddenSourcePatterns = [
  { expression: /\bcard\?*\.(?:resource|kind|exercise)\b/gu, label: "campos do card monolítico" },
  { expression: /\bafterBlocks\b/gu, label: "afterBlocks do card monolítico" },
  { expression: /\bcontractVersion\s*[:=]\s*["']?4\b/gu, label: "contrato monolítico v4" },
  { expression: /renderCardRuntime|renderPackageCardRuntime/gu, label: "renderizador substituído" },
  {
    expression: /(?:authoringResourceContract|authoringGaps|resourceGaps|textGaps|cardExerciseSupport|resources\/registry)/gu,
    label: "módulo substituído"
  }
];

async function exists(relativePath) {
  try {
    await access(path.join(repositoryRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function containsFiles(relativeDirectory) {
  try {
    const entries = await readdir(path.join(repositoryRoot, relativeDirectory), {
      recursive: true,
      withFileTypes: true
    });
    return entries.some((entry) => entry.isFile());
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function sourceFiles(relativeDirectory) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relativePath);
    return entry.name.endsWith(".js") ? [relativePath] : [];
  }));
  return nested.flat();
}

export async function auditCurrentArchitecture() {
  const findings = [];
  for (const relativePath of forbiddenFiles) {
    if (await exists(relativePath)) findings.push(`${relativePath}: arquivo abolido ainda existe.`);
  }
  for (const relativePath of forbiddenDirectories) {
    if (await containsFiles(relativePath)) {
      findings.push(`${relativePath}: diretório abolido ainda contém arquivos.`);
    }
  }
  const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
  for (const relativePath of files) {
    const source = await readFile(path.join(repositoryRoot, relativePath), "utf8");
    for (const { expression, label } of forbiddenSourcePatterns) {
      expression.lastIndex = 0;
      if (expression.test(source)) findings.push(`${relativePath}: contém ${label}.`);
    }
  }
  return findings;
}

const findings = await auditCurrentArchitecture();
if (findings.length) {
  process.stderr.write(`${findings.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Arquitetura corrente sem contratos ou superfícies abolidos.\n");
}
