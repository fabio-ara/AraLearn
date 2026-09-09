import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATEGORY_ORDER = ["docs", "web", "contracts", "backend", "database", "android", "orchestration", "unknown"];
const ROOT_DOCUMENTS = new Set(["README.md", "LICENSE.md", "CHANGELOG.md", "CONTRIBUTING.md"]);
const CONTRACT_DOCUMENTS = new Set(["docs/aralearn-contract.md", "docs/autoria-actions.md", "docs/autoria-mcp.md"]);
const STYLE_TESTS = new Set([
  "frontend-style-audit.test.js", "theme-and-icons.test.js", "resource-typography.test.js",
  "final-ux-contract.test.js", "android-workbench-safe-area.test.js", "vertical-parity-audit.test.js"
]);
const DOC_TESTS = new Set([
  "documentation-audit.test.js", "readable-references.test.js", "terminology-audit.test.js",
  "research-governance-docs.test.js"
]);
const WEB_REFERENCES = /(?:src\/(?:ui|study|persistence|supabase|storage|runtime|assist|generation|render|bibliography)\/|public\/|["']public["'])/u;
const CONTRACT_REFERENCES = /(?:src\/(?:domain|core|contract|resources|flowchart|model)\/|supabase\/functions\/|buildChatGptActionOpenApi|projectHumanAuthoringActions)/u;
const DATABASE_REFERENCES = /(?:supabase\/(?:migrations|tests)\/|@electric-sql\/pglite|scripts\/(?:runLocalMcpOAuthSmoke|verifyBackupRestoreUpgrade))/u;
const ANDROID_REFERENCES = /(?:android\/|["']android["']|buildAndroid|androidNativeGate)/u;

export function normalizeRepositoryPath(value) {
  if (typeof value !== "string" || !value || value !== value.trim() ||
      value.includes("\\") || [...value].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127) ||
      value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return "";
  return value.split("/").some(segment => !segment || segment === "." || segment === "..") ? "" : value;
}

export function isDocumentationPath(value) {
  const file = normalizeRepositoryPath(value);
  if (!file || /^(?:.*\/)?(?:AGENTS(?:\.override)?|SKILL)\.md$/u.test(file) || CONTRACT_DOCUMENTS.has(file)) return false;
  return ROOT_DOCUMENTS.has(file) || file === "docs/evidence/registro-buscas-bibliograficas.csv" ||
    /^docs\/[^/]+\.(?:md|bib)$/u.test(file) || /^ux-atlas\/.+\.md$/u.test(file);
}

function testInventory(root, directory, suffix) {
  // A falha de inventário é um erro, nunca uma lista vazia que possa virar PASS.
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(suffix))
    .map(entry => `${directory}/${entry.name}`).sort();
}

/** Seleciona gates; o resultado não é um recibo de execução nem atesta PASS. */
export function classifyValidationImpact(paths, { root = repositoryRoot } = {}) {
  const runtime = [
    ...testInventory(root, "tests/kernel", ".test.js"),
    ...testInventory(root, "tests/runtime", ".test.js")
  ].sort();
  const e2e = testInventory(root, "tests/e2e", ".spec.js");
  const sources = new Map([...runtime, ...e2e].map(file => [file, fs.readFileSync(path.join(root, file), "utf8")]));
  // O opt-in é identificado pelo contrato de execução do teste, não pelo sufixo "local".
  const real = e2e.filter(file => sources.get(file).includes("ARALEARN_E2E_REAL_SUPABASE"));
  const realSet = new Set(real);
  const categories = new Set();
  const unknownPaths = new Set();
  const changedRuntime = new Set();
  const changedE2e = new Set();
  let behavioralWeb = false;
  let styleOnly = true;
  const add = (...values) => values.forEach(value => categories.add(value));
  const unknown = value => { unknownPaths.add(value); add("unknown"); };
  const shared = () => { add("web", "contracts", "backend", "database"); behavioralWeb = true; styleOnly = false; };
  const input = Array.isArray(paths) ? paths : paths instanceof Set ? [...paths] : null;
  if (!input) unknown("<invalid path list>");
  else if (!input.length) unknown("<no paths>");

  for (const value of input || []) {
    const file = normalizeRepositoryPath(value);
    if (!file) { unknown(typeof value === "string" ? value : "<invalid path>"); continue; }
    if (isDocumentationPath(file)) { add("docs"); continue; }
    if (CONTRACT_DOCUMENTS.has(file) || file === "docs/downloads/aralearn-chatgpt-action-openapi.yaml") {
      add("contracts", "backend"); styleOnly = false; continue;
    }
    if (/^public\/.+\.(?:css|png|svg|ico|woff2?)$/u.test(file) ||
        /^scripts\/auditFrontend(?:Styles|Residues)\.mjs$/u.test(file)) {
      add("web"); continue;
    }
    if (/^android\//u.test(file) || /^scripts\/buildAndroid[^/]*\.ps1$/u.test(file)) {
      add("android"); styleOnly = false; continue;
    }
    if (/^supabase\/(?:migrations|tests)\//u.test(file) || file === "supabase/config.toml") {
      add("database", "backend", "contracts"); styleOnly = false; continue;
    }
    if (/^supabase\/functions\//u.test(file)) {
      if (file.startsWith("supabase/functions/_shared/aralearn/runtime/")) shared();
      else { add("backend", "contracts"); styleOnly = false; }
      continue;
    }
    if (/^src\/(?:core|contract|domain|resources|flowchart|model)\//u.test(file) ||
        file === "scripts/syncEdgeResourceRuntime.mjs") { shared(); continue; }
    if (/^src\/(?:ui|study|persistence|supabase|storage|runtime|assist|generation|render|bibliography)\/.+\.js$/u.test(file) ||
        /^public\/.+\.(?:js|html)$/u.test(file)) {
      add("web"); behavioralWeb = true; styleOnly = false; continue;
    }
    if (/^scripts\/(?:buildChatGptActionOpenApi|projectHumanAuthoringActions)\.mjs$/u.test(file)) {
      add("contracts", "backend"); styleOnly = false; continue;
    }
    if (sources.has(file)) {
      const source = sources.get(file);
      if (runtime.includes(file)) changedRuntime.add(file);
      else changedE2e.add(file);
      if (e2e.includes(file)) {
        add("web");
        if (realSet.has(file)) { add("backend", "database", "contracts"); behavioralWeb = true; styleOnly = false; }
      } else if (STYLE_TESTS.has(path.basename(file))) {
        add("web");
        if (ANDROID_REFERENCES.test(source)) add("android");
      }
      else if (DOC_TESTS.has(path.basename(file))) add("docs");
      else {
        let recognized = false;
        if (WEB_REFERENCES.test(source)) { add("web"); behavioralWeb = true; styleOnly = false; recognized = true; }
        if (CONTRACT_REFERENCES.test(source) || file.startsWith("tests/kernel/")) { shared(); recognized = true; }
        if (DATABASE_REFERENCES.test(source)) { add("database", "backend", "contracts"); recognized = true; }
        if (ANDROID_REFERENCES.test(source)) { add("android"); recognized = true; }
        if (!recognized) unknown(file);
      }
      continue;
    }
    if (/^(?:\.github\/|scripts\/)/u.test(file) ||
        /^(?:package(?:-lock)?\.json|deno\.lock|playwright(?:\.[^.]+)*\.config\.js|eslint\.config\.js)$/u.test(file)) {
      add("orchestration"); styleOnly = false; continue;
    }
    unknown(file);
  }

  const broad = categories.has("unknown") || categories.has("orchestration");
  const backend = categories.has("backend") || categories.has("database");
  const requires = {
    web: broad || categories.has("web") || backend,
    contracts: broad || categories.has("contracts"),
    supabase: broad || backend || behavioralWeb,
    android: broad || categories.has("android")
  };
  const runtimeFiles = runtime.filter(file => {
    if (broad || changedRuntime.has(file)) return true;
    const source = sources.get(file);
    const name = path.basename(file);
    return categories.has("docs") && DOC_TESTS.has(name) ||
      categories.has("web") && (STYLE_TESTS.has(name) || !styleOnly && WEB_REFERENCES.test(source)) ||
      requires.contracts && (file.startsWith("tests/kernel/") || CONTRACT_REFERENCES.test(source)) ||
      requires.supabase && DATABASE_REFERENCES.test(source) ||
      requires.android && ANDROID_REFERENCES.test(source);
  });
  return {
    schemaVersion: 1,
    docsOnly: Boolean(input?.length) && input.every(isDocumentationPath),
    categories: CATEGORY_ORDER.filter(category => categories.has(category)),
    unknownPaths: [...unknownPaths].sort(),
    requires,
    runtimeFiles,
    e2eFiles: e2e.filter(file => !realSet.has(file) && (requires.web || changedE2e.has(file))),
    realE2eFiles: real.filter(file => requires.supabase || changedE2e.has(file))
  };
}
