import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(repositoryRoot, "supabase", "migrations", "001_aralearn_relational.sql");
const mainPath = path.join(repositoryRoot, "public", "main.js");
const legacyCatalogPath = path.join(repositoryRoot, "src", "data", "embedded-courses");
const requiredTables = [
  "courses",
  "course_memberships",
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
  "lesson_progress",
  "card_progress",
  "card_comments",
  "sync_devices",
  "sync_mutations",
  "sync_changes"
];
const requiredFunctions = [
  "clone_catalog_course",
  "refresh_personal_course_from_source",
  "apply_sync_batch",
  "pull_sync_changes",
  "replace_microsequence_cards",
  "validate_course_graph",
  "publish_official_course"
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

async function validateRuntimeConfig(filePath) {
  if (!await exists(filePath)) return;
  const source = await fs.readFile(filePath, "utf8");
  const match = source.match(/"supabasePublishableKey"\s*:\s*"([^"]*)"/);
  const key = match?.[1] || "";
  if (/service[_-]?role/i.test(key) || /^sb_secret_/i.test(key) || decodeJwtRole(key) === "service_role") {
    fail(`Chave administrativa encontrada no runtime: ${path.relative(repositoryRoot, filePath)}.`);
  }
}

async function main() {
  const [migration, runtimeMain] = await Promise.all([
    fs.readFile(migrationPath, "utf8"),
    fs.readFile(mainPath, "utf8")
  ]);

  if (await exists(legacyCatalogPath)) {
    fail("O catálogo operacional legado ainda existe em src/data/embedded-courses.");
  }
  for (const token of [
    "loadEmbeddedSeedProjectDocument",
    "createBrowserIndexedDbStore",
    "createProjectStorage",
    "catalogMode"
  ]) {
    if (runtimeMain.includes(token)) fail(`O entrypoint ainda contém o caminho legado ${token}.`);
  }
  for (const table of requiredTables) {
    assertContains(
      migration,
      new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${escapePattern(table)}\\b`, "i"),
      `Tabela relacional obrigatória ausente: public.${table}.`
    );
    const literalRls = new RegExp(
      `alter\\s+table\\s+public\\.${escapePattern(table)}\\s+enable\\s+row\\s+level\\s+security`,
      "i"
    ).test(migration);
    const dynamicRls = /alter\s+table\s+public\.%I\s+enable\s+row\s+level\s+security/i.test(migration) &&
      new RegExp(`['"]${escapePattern(table)}['"]`, "i").test(migration);
    if (!literalRls && !dynamicRls) {
      fail(`RLS não foi habilitada explicitamente em public.${table}.`);
    }
  }
  for (const functionName of requiredFunctions) {
    assertContains(
      migration,
      new RegExp(`function\\s+public\\.${escapePattern(functionName)}\\s*\\(`, "i"),
      `RPC relacional obrigatória ausente: public.${functionName}.`
    );
  }
  for (const outOfScopeTable of ["authoring_runs", "authoring_parts", "audit_reports"]) {
    if (new RegExp(`create\\s+table[^;]*\\b${outOfScopeTable}\\b`, "i").test(migration)) {
      fail(`Tabela fora do escopo corrigido encontrada: ${outOfScopeTable}.`);
    }
  }
  assertContains(
    migration,
    /revoke\s+all[^;]+from\s+(?:public\s*,\s*)?anon\b/i,
    "O schema não revoga explicitamente o acesso anônimo."
  );

  await Promise.all([
    validateRuntimeConfig(path.join(repositoryRoot, ".pages", "runtime-config.js")),
    validateRuntimeConfig(path.join(
      repositoryRoot,
      "android",
      "app",
      "build",
      "generated",
      "web-assets",
      "main",
      "www",
      "public",
      "runtime-config.js"
    ))
  ]);
  console.log("Corte relacional validado: sem catálogo legado, persistência documental ou chave administrativa no runtime.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
