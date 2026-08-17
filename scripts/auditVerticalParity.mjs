import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  AUTHORING_APPLICATION_ONLY_TOOLS,
  AUTHORING_WORKSPACE_MCP_TOOLS
} from "../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultRegistryPath = "docs/evidence/paridade-vertical.v1.json";
const databaseObjectTypes = new Set([
  "table",
  "view",
  "materialized_view",
  "function",
  "bucket",
  "index",
  "constraint",
  "trigger",
  "policy",
  "rls"
]);
const classifications = new Set([
  "ui",
  "mcp",
  "internal",
  "migration-temporary",
  "remove"
]);
function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedRelativePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//u, "");
}

function absoluteInside(repositoryRoot, relativePath) {
  const normalized = normalizedRelativePath(relativePath);
  const absolute = path.resolve(repositoryRoot, normalized);
  const relative = path.relative(repositoryRoot, absolute);
  if (!normalized || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

async function pathExists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function compilePattern(value, label, findings) {
  if (typeof value !== "string" || !value.startsWith("^") || !value.endsWith("$")) {
    findings.push(`${label}: o seletor deve ser uma expressão regular ancorada.`);
    return null;
  }
  try {
    return new RegExp(value, "u");
  } catch (error) {
    findings.push(`${label}: expressão regular inválida (${error.message}).`);
    return null;
  }
}

async function readJson(absolutePath) {
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function edgeFunctionNames(repositoryRoot) {
  const directory = path.join(repositoryRoot, "supabase", "functions");
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && entry.name !== "tests")
    .map((entry) => entry.name)
    .sort();
}

async function currentRuntimeInventory(repositoryRoot) {
  const manifest = await readJson(path.join(repositoryRoot, "supabase", "runtime-manifest.json"));
  return {
    mcpTools: AUTHORING_WORKSPACE_MCP_TOOLS.map((definition) => definition.name).sort(),
    applicationTools: AUTHORING_APPLICATION_ONLY_TOOLS.map((definition) => definition.name).sort(),
    edgeFunctions: await edgeFunctionNames(repositoryRoot),
    manifestFeatures: list(manifest.requiredFeatures).map(String).sort(),
    databaseObjects: null
  };
}

function canonicalDatabaseObject(type, identifier) {
  const normalizedType = String(type || "").trim();
  const normalizedIdentifier = String(identifier || "").trim();
  if (!databaseObjectTypes.has(normalizedType) || !normalizedIdentifier) return null;
  return `${normalizedType}:${normalizedIdentifier}`;
}

function databaseRelationParent(value) {
  const child = /^(?:index|constraint|trigger|policy):([^/]+)\//u.exec(value);
  if (child) return `table:${child[1]}`;
  const rls = /^rls:([^=]+)=(?:disabled|enabled|forced)$/u.exec(value);
  return rls ? `table:${rls[1]}` : null;
}

export function parseDatabaseInventory(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  if (text.startsWith("[") || text.startsWith("{")) {
    const parsed = JSON.parse(text);
    const values = Array.isArray(parsed) ? parsed : parsed.objects;
    if (!Array.isArray(values)) throw new TypeError("O inventário JSON do banco exige uma lista ou { objects }.");
    return [...new Set(values.map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (typeof entry?.object === "string") return entry.object.trim();
      return canonicalDatabaseObject(entry?.type, entry?.identifier);
    }).filter(Boolean))].sort();
  }
  return [...new Set(text.split(/\r?\n/u).map((line) => {
    const [type, ...identifier] = line.split("|");
    return canonicalDatabaseObject(type, identifier.join("|"));
  }).filter(Boolean))].sort();
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function checkReference(reference, {
  repositoryRoot,
  label,
  findings,
  sourceCache
}) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    findings.push(`${label}: referência inválida.`);
    return null;
  }
  const absolute = absoluteInside(repositoryRoot, reference.path);
  if (!absolute || !await pathExists(absolute)) {
    findings.push(`${label}: arquivo inexistente (${reference.path || "sem caminho"}).`);
    return null;
  }
  let source = sourceCache.get(absolute);
  if (source === undefined) {
    source = await readFile(absolute, "utf8");
    sourceCache.set(absolute, source);
  }
  if (typeof reference.token !== "string" || !reference.token) {
    findings.push(`${label}: informe o símbolo, seletor ou ação visível em token.`);
    return source;
  }
  if (!source.includes(reference.token)) {
    findings.push(`${label}: ${reference.path} não contém ${JSON.stringify(reference.token)}.`);
  }
  return source;
}

async function checkTestFiles(caseRecord, context) {
  const sources = [];
  for (const [index, relativePath] of list(caseRecord.tests).entries()) {
    const source = await checkReference(
      { path: relativePath, token: "test(" },
      { ...context, label: `${caseRecord.id}.tests[${index}]` }
    );
    if (source != null) sources.push(source);
  }
  const testedObjects = [
    ...list(caseRecord.objects?.mcpTools),
    ...list(caseRecord.objects?.applicationTools),
    ...list(caseRecord.objects?.edgeFunctions)
  ];
  for (const objectName of testedObjects) {
    if (!sources.some((source) => source.includes(objectName))) {
      context.findings.push(
        `${caseRecord.id}: ${objectName} não aparece em nenhum teste associado ao caso de uso.`
      );
    }
  }
}

function objectClaims(cases, exactField, patternField, findings) {
  return cases.map((caseRecord) => ({
    caseRecord,
    exact: new Set(list(caseRecord.objects?.[exactField]).map(String)),
    patterns: list(caseRecord.objects?.[patternField]).map((value, index) => ({
      source: value,
      expression: compilePattern(
        value,
        `${caseRecord.id}.objects.${patternField}[${index}]`,
        findings
      )
    })).filter((entry) => entry.expression)
  }));
}

function verifyCoverage({
  label,
  actual,
  claims,
  findings,
  requirePatternMatch = true
}) {
  const actualSet = new Set(actual);
  for (const value of actualSet) {
    const owners = claims.filter(({ exact, patterns }) => exact.has(value)
      || patterns.some(({ expression }) => expression.test(value)));
    if (owners.length === 0) findings.push(`${label}: objeto real sem caso de uso: ${value}.`);
    if (owners.length > 1) {
      findings.push(`${label}: ${value} pertence a mais de um caso (${owners.map(
        ({ caseRecord }) => caseRecord.id
      ).join(", ")}).`);
    }
  }
  for (const { caseRecord, exact, patterns } of claims) {
    for (const value of exact) {
      if (!actualSet.has(value)) {
        findings.push(`${caseRecord.id}: ${label} registrado, mas inexistente: ${value}.`);
      }
    }
    if (requirePatternMatch) {
      for (const { source, expression } of patterns) {
        if (![...actualSet].some((value) => expression.test(value))) {
          findings.push(`${caseRecord.id}: seletor de ${label} não encontra objeto real: ${source}.`);
        }
      }
    }
  }
}

function databaseClaims(cases, findings) {
  const primaryClaims = objectClaims(cases, "database", "databasePatterns", findings);
  const internalClaims = objectClaims(
    cases,
    "databaseInternal",
    "databaseInternalPatterns",
    findings
  );
  return { primaryClaims, internalClaims };
}

function databaseOwners(value, { primaryClaims, internalClaims }) {
  let owners = primaryClaims.filter(({ exact, patterns }) => exact.has(value)
      || patterns.some(({ expression }) => expression.test(value)));
  if (owners.length === 0) {
    owners = internalClaims.filter(({ exact, patterns }) => exact.has(value)
      || patterns.some(({ expression }) => expression.test(value)));
  }
  const parent = owners.length === 0 ? databaseRelationParent(value) : null;
  if (parent) return databaseOwners(parent, { primaryClaims, internalClaims });
  return owners;
}

function validateDatabaseStructure(objects, findings, label) {
  const objectSet = new Set(objects);
  const rlsByTable = new Map();
  for (const object of objectSet) {
    const parent = databaseRelationParent(object);
    if (parent && !objectSet.has(parent)) {
      findings.push(`${label}: ${object} referencia relação ausente (${parent}).`);
    }
    if (object.startsWith("rls:") && parent) {
      const states = rlsByTable.get(parent) || [];
      states.push(object);
      rlsByTable.set(parent, states);
    }
  }
  for (const table of [...objectSet].filter((object) => object.startsWith("table:"))) {
    const states = rlsByTable.get(table) || [];
    if (states.length !== 1) {
      findings.push(
        `${label}: ${table} deve possuir exatamente um estado RLS; encontrados ${states.length}.`
      );
    }
  }
}

function validateDatabaseSelectors({ exactObjects, claims, findings }) {
  const actualSet = new Set(exactObjects);
  for (const { caseRecord, exact, patterns } of [
    ...claims.primaryClaims,
    ...claims.internalClaims
  ]) {
    for (const value of exact) {
      if (!actualSet.has(value)) {
        findings.push(`${caseRecord.id}: objeto de banco registrado, mas inexistente: ${value}.`);
      }
    }
    for (const { source, expression } of patterns) {
      if (![...actualSet].some((value) => expression.test(value))) {
        findings.push(
          `${caseRecord.id}: seletor de objeto de banco não encontra objeto real: ${source}.`
        );
      }
    }
  }
}

export function buildExactDatabaseInventory(registry, databaseObjects) {
  const findings = [];
  const cases = list(registry?.cases);
  const claims = databaseClaims(cases, findings);
  const exactObjects = [...new Set(list(databaseObjects).map(String))].sort();
  validateDatabaseStructure(exactObjects, findings, "Inventário regenerado do banco");
  const objects = exactObjects.flatMap((object) => {
    const owners = databaseOwners(object, claims);
    if (owners.length === 0) {
      findings.push(`objeto de banco: objeto real sem caso de uso: ${object}.`);
      return [];
    }
    if (owners.length > 1) {
      findings.push(`objeto de banco: ${object} pertence a mais de um caso (${owners.map(
        ({ caseRecord }) => caseRecord.id
      ).join(", ")}).`);
      return [];
    }
    return [{ object, caseId: owners[0].caseRecord.id }];
  });
  validateDatabaseSelectors({
    exactObjects: objects.map((entry) => entry.object),
    claims,
    findings
  });
  return {
    findings,
    inventory: {
      contract: "aralearn.vertical-parity.database-inventory.v1",
      source: "pg_catalog(public, private: relações, funções, índices, restrições, triggers não internos, policies e estado RLS) + storage.buckets",
      objects
    }
  };
}

function validateExactDatabaseInventory({ registry, exactInventory, findings }) {
  if (exactInventory?.contract !== "aralearn.vertical-parity.database-inventory.v1") {
    findings.push("Inventário exato do banco: contrato inválido.");
    return [];
  }
  const cases = list(registry.cases);
  const caseIds = new Set(cases.map((caseRecord) => caseRecord.id));
  const claims = databaseClaims(cases, findings);
  const seen = new Set();
  const entries = list(exactInventory.objects);
  const ordered = entries.map((entry) => entry?.object);
  if (JSON.stringify(ordered) !== JSON.stringify([...ordered].sort())) {
    findings.push("Inventário exato do banco: objetos fora da ordem canônica.");
  }
  for (const [index, entry] of entries.entries()) {
    const label = `Inventário exato do banco.objects[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
        || typeof entry.object !== "string"
        || !/^(?:table|view|materialized_view|function|bucket|index|constraint|trigger|policy|rls):\S/iu.test(entry.object)) {
      findings.push(`${label}: objeto inválido.`);
      continue;
    }
    if (seen.has(entry.object)) findings.push(`${label}: objeto duplicado (${entry.object}).`);
    seen.add(entry.object);
    if (!caseIds.has(entry.caseId)) {
      findings.push(`${label}: caso inexistente (${entry.caseId || "ausente"}).`);
      continue;
    }
    const owners = databaseOwners(entry.object, claims);
    if (owners.length !== 1) {
      findings.push(`${label}: os seletores não determinam um único caso para ${entry.object}.`);
      continue;
    }
    if (owners[0].caseRecord.id !== entry.caseId) {
      findings.push(
        `${label}: vínculo ${entry.caseId} diverge do caso ${owners[0].caseRecord.id}.`
      );
    }
  }
  validateDatabaseStructure([...seen], findings, "Inventário exato do banco");
  validateDatabaseSelectors({ exactObjects: [...seen], claims, findings });
  return entries.filter((entry) => entry && typeof entry.object === "string");
}

function compareLiveDatabaseInventory({ actual, exactEntries, findings }) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(exactEntries.map((entry) => entry.object));
  for (const object of actualSet) {
    if (!expectedSet.has(object)) {
      findings.push(`objeto de banco real novo sem registro exato: ${object}.`);
    }
  }
  for (const object of expectedSet) {
    if (!actualSet.has(object)) {
      findings.push(`objeto de banco registrado deixou de existir: ${object}.`);
    }
  }
}

function validatePolicy(registry, findings) {
  if (registry.contract !== "aralearn.vertical-parity.v1") {
    findings.push("Registro: contrato ausente ou diferente de aralearn.vertical-parity.v1.");
  }
  const policy = registry.policy || {};
  for (const field of [
    "compatibilityInFinalState",
    "legacyAliasesInFinalState",
    "fallbacksInFinalState"
  ]) {
    if (policy[field] !== false) {
      findings.push(`Registro: ${field} deve ser false; o estado final não conserva legado.`);
    }
  }
  if (policy.finalStage !== "#130" || policy.temporaryMigrationRequiresRemoval !== true) {
    findings.push("Registro: toda transição deve declarar remoção até #130.");
  }
  if (typeof policy.databaseInventoryPath !== "string" || !policy.databaseInventoryPath) {
    findings.push("Registro: databaseInventoryPath exato é obrigatório.");
  }
}

function validateCaseShape(caseRecord, ids, findings) {
  if (!caseRecord || typeof caseRecord !== "object" || Array.isArray(caseRecord)) {
    findings.push("Registro: caso de uso inválido.");
    return false;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(caseRecord.id || "")) {
    findings.push(`Registro: id de caso inválido (${caseRecord.id || "ausente"}).`);
  } else if (ids.has(caseRecord.id)) {
    findings.push(`Registro: caso duplicado (${caseRecord.id}).`);
  }
  ids.add(caseRecord.id);
  if (typeof caseRecord.intent !== "string" || !caseRecord.intent.trim()) {
    findings.push(`${caseRecord.id}: intenção ausente.`);
  }
  if (!classifications.has(caseRecord.classification)) {
    findings.push(`${caseRecord.id}: classificação inválida (${caseRecord.classification}).`);
  }
  if (["migration-temporary", "remove"].includes(caseRecord.classification)
      && caseRecord.removeBy !== "#130") {
    findings.push(`${caseRecord.id}: transição ou remoção sem removeBy #130.`);
  }
  if (!["migration-temporary", "remove"].includes(caseRecord.classification)
      && Object.hasOwn(caseRecord, "removeBy")) {
    findings.push(`${caseRecord.id}: removeBy só é válido para estado temporário ou remoção.`);
  }
  if (typeof caseRecord.justification !== "string" || !caseRecord.justification.trim()) {
    findings.push(`${caseRecord.id}: justificativa ausente.`);
  }
  return true;
}

export async function auditVerticalParity({
  repositoryRoot = defaultRepositoryRoot,
  registry = null,
  registryPath = defaultRegistryPath,
  runtimeInventory = null,
  databaseInventory = undefined
} = {}) {
  const findings = [];
  const absoluteRegistry = absoluteInside(repositoryRoot, registryPath);
  const effectiveRegistry = registry || (
    absoluteRegistry ? await readJson(absoluteRegistry) : null
  );
  if (!effectiveRegistry) return ["Registro de paridade vertical inexistente."];
  validatePolicy(effectiveRegistry, findings);
  const cases = list(effectiveRegistry.cases);
  if (!cases.length) findings.push("Registro: nenhum caso de uso declarado.");
  const ids = new Set();
  const sourceCache = new Map();
  const inventory = runtimeInventory || await currentRuntimeInventory(repositoryRoot);
  if (databaseInventory !== undefined) inventory.databaseObjects = databaseInventory;

  for (const caseRecord of cases) {
    if (!validateCaseShape(caseRecord, ids, findings)) continue;
    const context = { repositoryRoot, findings, sourceCache };
    if (caseRecord.classification === "ui" && list(caseRecord.ui).length === 0) {
      findings.push(`${caseRecord.id}: estado de produto sem consumidor em Estudo ou Autoria.`);
    }
    for (const [field, references] of [
      ["ui", caseRecord.ui],
      ["visibleEffects", caseRecord.visibleEffects],
      ["persistence", caseRecord.persistence],
      ["routes", caseRecord.routes]
    ]) {
      for (const [index, reference] of list(references).entries()) {
        await checkReference(reference, {
          ...context,
          label: `${caseRecord.id}.${field}[${index}]`
        });
      }
    }
    if (caseRecord.classification === "ui" && list(caseRecord.persistence).length === 0) {
      findings.push(`${caseRecord.id}: superfície persistente sem backend ou armazenamento local associado.`);
    }
    const mcpNames = list(caseRecord.objects?.mcpTools);
    const applicationNames = list(caseRecord.objects?.applicationTools);
    if ((mcpNames.length || applicationNames.length) && list(caseRecord.routes).length === 0) {
      findings.push(`${caseRecord.id}: operação de ferramenta sem rota associada.`);
    }
    const definitions = [
      ...mcpNames.map((name) => AUTHORING_WORKSPACE_MCP_TOOLS.find(
        (definition) => definition.name === name
      )),
      ...applicationNames.map((name) => AUTHORING_APPLICATION_ONLY_TOOLS.find(
        (definition) => definition.name === name
      ))
    ].filter(Boolean);
    if (definitions.some((definition) => definition.annotations?.readOnlyHint !== true)
        && list(caseRecord.visibleEffects).length === 0) {
      findings.push(`${caseRecord.id}: operação mutável sem efeito observável na interface.`);
    }
    await checkTestFiles(caseRecord, context);
  }

  const exactDatabasePath = absoluteInside(
    repositoryRoot,
    effectiveRegistry.policy?.databaseInventoryPath
  );
  let exactDatabaseEntries = [];
  if (!exactDatabasePath || !await pathExists(exactDatabasePath)) {
    findings.push("Inventário exato do banco inexistente.");
  } else {
    exactDatabaseEntries = validateExactDatabaseInventory({
      registry: effectiveRegistry,
      exactInventory: await readJson(exactDatabasePath),
      findings
    });
  }

  verifyCoverage({
    label: "ferramenta MCP",
    actual: inventory.mcpTools,
    claims: objectClaims(cases, "mcpTools", "mcpToolPatterns", findings),
    findings
  });
  verifyCoverage({
    label: "action exclusiva do aplicativo",
    actual: inventory.applicationTools,
    claims: objectClaims(cases, "applicationTools", "applicationToolPatterns", findings),
    findings
  });
  verifyCoverage({
    label: "Edge Function",
    actual: inventory.edgeFunctions,
    claims: objectClaims(cases, "edgeFunctions", "edgeFunctionPatterns", findings),
    findings
  });
  verifyCoverage({
    label: "feature do manifesto",
    actual: inventory.manifestFeatures,
    claims: objectClaims(cases, "manifestFeatures", "manifestFeaturePatterns", findings),
    findings
  });
  if (Array.isArray(inventory.databaseObjects)) {
    compareLiveDatabaseInventory({
      actual: inventory.databaseObjects,
      exactEntries: exactDatabaseEntries,
      findings
    });
  }
  return findings;
}

function commandLineArguments(argv) {
  const result = {
    registryPath: defaultRegistryPath,
    databasePath: null,
    regenerateDatabasePath: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--registry") result.registryPath = argv[++index];
    else if (argument === "--database-inventory") result.databasePath = argv[++index];
    else if (argument === "--regenerate-database-inventory") {
      result.regenerateDatabasePath = argv[++index];
    }
    else throw new TypeError(`Argumento desconhecido: ${argument}.`);
  }
  return result;
}

async function main() {
  const options = commandLineArguments(process.argv.slice(2));
  if (options.databasePath != null && options.regenerateDatabasePath != null) {
    throw new TypeError("Escolha auditoria ou regeneração do inventário do banco.");
  }
  if (options.regenerateDatabasePath != null) {
    const raw = options.regenerateDatabasePath === "-"
      ? await readStandardInput()
      : await readFile(path.resolve(options.regenerateDatabasePath), "utf8");
    const registryAbsolute = absoluteInside(defaultRepositoryRoot, options.registryPath);
    if (!registryAbsolute) throw new TypeError("Caminho inválido para o registro de paridade.");
    const registry = await readJson(registryAbsolute);
    const { findings, inventory } = buildExactDatabaseInventory(
      registry,
      parseDatabaseInventory(raw)
    );
    if (findings.length) {
      process.stderr.write(`${findings.join("\n")}\n`);
      process.exitCode = 1;
      return;
    }
    const target = absoluteInside(
      defaultRepositoryRoot,
      registry.policy?.databaseInventoryPath
    );
    if (!target) throw new TypeError("Caminho inválido para o inventário exato do banco.");
    await writeFile(target, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
    process.stdout.write(
      `Inventário exato regenerado com ${inventory.objects.length} objetos classificados.\n`
    );
    return;
  }
  let databaseInventory;
  if (options.databasePath != null) {
    const raw = options.databasePath === "-"
      ? await readStandardInput()
      : await readFile(path.resolve(options.databasePath), "utf8");
    databaseInventory = parseDatabaseInventory(raw);
  }
  const findings = await auditVerticalParity({
    registryPath: options.registryPath,
    ...(databaseInventory === undefined ? {} : { databaseInventory })
  });
  if (findings.length) {
    process.stderr.write(`${findings.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  const databaseNote = databaseInventory === undefined
    ? " Inventário exato versionado validado; o job Supabase compara o banco real."
    : ` Banco real idêntico aos ${databaseInventory.length} objetos registrados.`;
  process.stdout.write(`Paridade vertical registrada para UI, ferramentas, Edge, manifesto e testes.${databaseNote}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
