import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATEGORY_ORDER = ["release", "parity", "docs", "verification", "web", "contracts", "backend", "database", "android", "orchestration", "unknown"];
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
// Estes consumidores verificam artefatos/recibos; não constroem o produto nem
// mudam a seleção/certificação dos gates. Scripts sem papel conhecido continuam amplos.
const PUBLICATION_VERIFIERS = new Map([
  ["scripts/verifyPublishedSite.mjs", ["tests/runtime/published-site-verification.test.js"]],
  ["scripts/verifyDeploymentArtifacts.ps1", ["tests/runtime/deployment-automation.test.js"]],
  ["scripts/androidNativeGate.py", ["tests/runtime/android-native-gate.test.js", "tests/runtime/deployment-automation.test.js"]],
  ["tests/helpers/androidNativeGateTests.py", ["tests/runtime/android-native-gate.test.js", "tests/runtime/deployment-automation.test.js"]]
]);
const VERIFIER_TESTS = new Set([...PUBLICATION_VERIFIERS.values()].flat());

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

// O OpenAPI gerado é JSON (também YAML válido). Sem conteúdo comparável,
// inclusive remoção/adição ou outro formato, manter o impacto conservador.
export function isReleaseMetadataOnly(file, before, after) {
  if (file === "android/app/build.gradle.kts") {
    const normalize = value => {
      if (typeof value !== "string") return null;
      const codes = [...value.matchAll(/\bversionCode\s*=\s*(\d+)/gu)];
      const names = [...value.matchAll(/\bversionName\s*=\s*"(\d+\.\d+\.\d+)"/gu)];
      if (codes.length !== 1 || names.length !== 1) return null;
      return {
        code: codes[0][1], name: names[0][1],
        content: value.replace(codes[0][0], "versionCode = <release>").replace(names[0][0], "versionName = <release>")
      };
    };
    const oldValue = normalize(before), newValue = normalize(after);
    return Boolean(oldValue && newValue && (oldValue.code !== newValue.code || oldValue.name !== newValue.name) &&
      oldValue.content === newValue.content);
  }
  const fields = file === "package.json" ? [["version"]]
    : file === "package-lock.json" ? [["version"], ["packages", "", "version"]]
      : file === "docs/downloads/aralearn-chatgpt-action-openapi.yaml" ? [["info", "version"]] : null;
  if (!fields) return false;
  try {
    const oldValue = JSON.parse(before);
    const newValue = JSON.parse(after);
    let changed = false;
    for (const keys of fields) {
      const parent = (value) => keys.slice(0, -1).reduce((item, key) => item?.[key], value);
      const left = parent(oldValue), right = parent(newValue), key = keys.at(-1);
      if (typeof left?.[key] !== "string" || typeof right?.[key] !== "string") return false;
      changed ||= left[key] !== right[key];
      delete left[key];
      delete right[key];
    }
    return changed && isDeepStrictEqual(oldValue, newValue);
  } catch { return false; }
}

/** Seleciona gates; o resultado não é um recibo de execução nem atesta PASS. */
export function classifyValidationImpact(paths, { root = repositoryRoot, readBase = null } = {}) {
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
    if (readBase && ["package.json", "package-lock.json", "docs/downloads/aralearn-chatgpt-action-openapi.yaml",
      "android/app/build.gradle.kts"].includes(file)) {
      try {
        if (isReleaseMetadataOnly(file, readBase(file), fs.readFileSync(path.join(root, file), "utf8"))) {
          add("release"); continue;
        }
      } catch { /* Conteúdo ausente mantém a classificação conservadora. */ }
    }
    if (file === "docs/evidence/paridade-vertical.v1.json") { add("parity"); continue; }
    if (PUBLICATION_VERIFIERS.has(file) || VERIFIER_TESTS.has(file)) {
      const consumers = PUBLICATION_VERIFIERS.get(file) || [file];
      if (consumers.some(test => !runtime.includes(test))) { unknown(file); continue; }
      add("verification");
      consumers.forEach(test => changedRuntime.add(test));
      continue;
    }
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
    // O job web da CI também executa runtime. Conservá-lo evita certificar
    // o verificador sem seus testes; a preparação local usa runtimeFiles abaixo.
    web: broad || categories.has("verification") || categories.has("web") || backend,
    contracts: broad || categories.has("contracts"),
    supabase: broad || backend || behavioralWeb,
    android: broad || categories.has("android")
  };
  const runtimeFiles = runtime.filter(file => {
    if (broad || changedRuntime.has(file)) return true;
    const source = sources.get(file);
    const name = path.basename(file);
    return categories.has("parity") && name === "vertical-parity-audit.test.js" ||
      categories.has("docs") && DOC_TESTS.has(name) ||
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
    e2eFiles: e2e.filter(file => !realSet.has(file) && changedE2e.has(file)),
    realE2eFiles: real.filter(file => requires.supabase || changedE2e.has(file))
  };
}
