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
  "modules",
  "lessons",
  "course_guides",
  "guide_items",
  "lesson_topics",
  "topic_statements",
  "microsequences",
  "microsequence_dependencies",
  "microsequence_statements",
  "cards",
  "card_blocks",
  "block_options",
  "block_nodes",
  "flow_nodes",
  "flow_cases",
  "flow_practices",
  "node_practices",
  "node_practice_items",
  "block_edges",
  "block_matrix_items",
  "block_cells",
  "block_points",
  "block_lines",
  "block_highlights",
  "card_refs",
  "user_course_selections",
  "study_paths",
  "study_path_courses",
  "lesson_progress",
  "card_progress",
  "card_comments"
];
const requiredPrivateTables = ["sync_devices", "sync_idempotency", "sync_changes"];
const requiredFunctions = [
  "select_catalog_course",
  "unselect_catalog_course",
  "get_selected_course_graph",
  "apply_sync_batch",
  "pull_sync_changes",
  "bootstrap_replica",
  "list_catalog_collections",
  "list_user_course_summaries",
  "delete_own_account"
];
const requiredCopyOnWriteFunctions = [
  "create_personal_course",
  "fork_catalog_course_for_editing"
];
const retiredFunctions = [
  "clone_catalog_course",
  "refresh_personal_course_from_source",
  "get_personal_course_graph",
  "delete_personal_course"
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
  [/\bdelete_personal_course\b|\bdeletePersonalCourse\s*\(/iu, "remoção de cópia pessoal"],
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
    /import\s+\{\s*createEditorSession\s*\}\s+from\s+["']\.\.\/src\/editor\/contractEditor\.js["']/u,
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
  const copyOnWriteCutover = [...migrations].reverse().find(({ source }) =>
    /function\s+public\.fork_catalog_course_for_editing\s*\(/iu.test(source) &&
    /function\s+public\.create_personal_course\s*\(/iu.test(source)
  );

  if (!slimCutover) {
    fail("Migration destrutiva do catálogo compartilhado não encontrada.");
  }
  if (!copyOnWriteCutover) {
    fail("Migration de copy-on-write para autoria pessoal não encontrada.");
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
  for (const functionName of requiredCopyOnWriteFunctions) {
    assertContains(
      copyOnWriteCutover.source,
      new RegExp(`function\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "iu"),
      `RPC de copy-on-write ausente: public.${functionName}.`
    );
    assertContains(
      copyOnWriteCutover.source,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${escapePattern(functionName)}\\s*\\([^;]*\\)\\s+to\\s+authenticated\\s*;`, "iu"),
      `RPC de copy-on-write sem GRANT explícito: public.${functionName}.`
    );
  }
  assertContains(
    copyOnWriteCutover.source,
    /alter\s+table\s+public\.courses[\s\S]*add\s+column\s+owner_id\s+uuid[\s\S]*add\s+column\s+source_course_id\s+uuid/iu,
    "A autoria sob demanda não mantém propriedade e origem somente na raiz do curso."
  );
  if (/add\s+column\s+source_entity_id\b/iu.test(copyOnWriteCutover.source)) {
    fail("A migration de copy-on-write reintroduziu linhagem por entidade filha.");
  }
  for (const table of requiredPrivateTables) {
    assertContains(
      slimCutover.source,
      new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+private\\.${escapePattern(table)}\\b`, "iu"),
      `Tabela técnica encapsulada ausente: private.${table}.`
    );
  }
  for (const functionName of retiredFunctions) {
    assertContains(
      slimCutover.source,
      new RegExp(`drop\\s+function\\s+if\\s+exists\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "iu"),
      `RPC retirada sem DROP explícito: public.${functionName}.`
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
      slimCutover.source,
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

  for (const outOfScopeTable of ["authoring_runs", "authoring_parts", "audit_reports"]) {
    if (new RegExp(`create\\s+table[^;]*\\b${outOfScopeTable}\\b`, "iu").test(migrationHistory)) {
      fail(`Tabela de autoria futura encontrada no app do estudante: ${outOfScopeTable}.`);
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
    `Corte enxuto validado em ${slimCutover.fileName} + ${copyOnWriteCutover.fileName}: runtime completo, catálogo compartilhado, estado pessoal mínimo e autoria por copy-on-write.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
