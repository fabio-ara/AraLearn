import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  routeRequest,
  validateAuditPayload,
  validateCancelRunPayload,
  validateFinalizePlanPayload,
  validateLedgerChunkPayload,
  validatePartPayload,
  validatePartSpecificationEnvelope,
  validatePlanPayload,
  validateReopenPartPayload,
  validateResumePayload
} from "../supabase/functions/_shared/aralearn-authoring/protocol.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const AUTHORING_ROOT = path.join(ROOT, "authoring");
const OUTPUT_ROOT = path.join(ROOT, "docs", "downloads", "authoring");
const BUILD_SCRIPT = path.join(SCRIPT_DIR, "buildAuthoringPackages.mjs");
const OPENAPI_PATH = path.join(ROOT, "docs", "openapi", "aralearn-authoring-api.yaml");
const CHATGPT_OPENAPI_PATH = path.join(
  ROOT,
  "docs",
  "openapi",
  "aralearn-authoring-api-chatgpt.yaml"
);
const COPILOT_OPENAPI_PATH = path.join(
  ROOT,
  "docs",
  "openapi",
  "aralearn-authoring-api-copilot-v2.json"
);
const CHATGPT_KNOWLEDGE_MANIFEST = path.join(
  AUTHORING_ROOT,
  "platforms",
  "chatgpt",
  "knowledge-files.json"
);
const CHATGPT_SETUP_PATH = path.join(AUTHORING_ROOT, "platforms", "chatgpt", "SETUP.md");
const PRIVACY_POLICY_URL = "https://github.com/fabio-ara/AraLearn/blob/main/docs/privacidade.md";
const PLATFORMS = ["chatgpt", "gemini", "microsoft-365", "claude", "generic"];
const REQUIRED_SCHEMAS = [
  "common.schema.json",
  "run.schema.json",
  "plan.schema.json",
  "ledger-manifest.schema.json",
  "ledger-chunk.schema.json",
  "ledger.schema.json",
  "ledger-slice.schema.json",
  "part-outline.schema.json",
  "part-specification.schema.json",
  "part-spec.schema.json",
  "part-submission.schema.json",
  "audit.schema.json",
  "repair.schema.json",
  "rebuild.schema.json",
  "blocked.schema.json",
  "plan-finalize.schema.json",
  "reopen.schema.json",
  "resume.schema.json",
  "cancel.schema.json",
  "publication-progress.schema.json"
];
const EXAMPLE_SCHEMAS = new Map([
  ["01-run.json", "run.schema.json"],
  ["02-plan.json", "plan.schema.json"],
  ["03-ledger-sources-chunk.json", "ledger-chunk.schema.json"],
  ["04-ledger-claims-chunk.json", "ledger-chunk.schema.json"],
  ["05-ledger-terms-chunk.json", "ledger-chunk.schema.json"],
  ["06-plan-finalize.json", "plan-finalize.schema.json"],
  ["07-part-specification.json", "part-specification.schema.json"],
  ["08-part-spec.json", "part-spec.schema.json"],
  ["09-part-submission.json", "part-submission.schema.json"],
  ["10-audit.json", "audit.schema.json"],
  ["11-publication-progress.json", "publication-progress.schema.json"],
  ["12-run-published.json", "run.schema.json"],
  ["alternatives/blocked.json", "blocked.schema.json"],
  ["alternatives/cancel.json", "cancel.schema.json"],
  ["alternatives/rebuild.json", "rebuild.schema.json"],
  ["alternatives/reopen.json", "reopen.schema.json"],
  ["alternatives/repair.json", "repair.schema.json"],
  ["alternatives/resume.json", "resume.schema.json"]
]);
const ROUTE_SAMPLES = [
  { method: "GET", sample: "/v1/runs", template: "/v1/runs", routeName: "listRuns", operationId: "listarExecucoesDeAutoria" },
  { method: "POST", sample: "/v1/runs", template: "/v1/runs", routeName: "createRun", operationId: "criarExecucaoDeAutoria" },
  { method: "POST", sample: "/v1/imports", template: "/v1/imports", routeName: "importDocument", operationId: "importarDocumentoAraLearn" },
  { method: "GET", sample: "/v1/runs/11111111-1111-4111-8111-111111111111", template: "/v1/runs/{runId}", routeName: "getRun", operationId: "consultarExecucaoDeAutoria" },
  { method: "PUT", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/plan", template: "/v1/runs/{runId}/plan", routeName: "setPlan", operationId: "gravarPlanoDeAutoria" },
  { method: "PUT", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/ledger/sources/0", template: "/v1/runs/{runId}/ledger/{section}/{position}", routeName: "putLedgerChunk", operationId: "gravarTrechoDoRegistro" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/plan/finalize", template: "/v1/runs/{runId}/plan/finalize", routeName: "finalizePlan", operationId: "finalizarPlanoDeAutoria" },
  { method: "GET", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/next-part", template: "/v1/runs/{runId}/next-part", routeName: "nextPart", operationId: "consultarProximaParte" },
  { method: "PUT", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/parts/part-1/specification", template: "/v1/runs/{runId}/parts/{partKey}/specification", routeName: "setPartSpecification", operationId: "gravarEspecificacaoDaParte" },
  { method: "PUT", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/parts/part-1", template: "/v1/runs/{runId}/parts/{partKey}", routeName: "submitPart", operationId: "gravarParteDoCurso" },
  { method: "GET", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/parts/part-1/submission", template: "/v1/runs/{runId}/parts/{partKey}/submission", routeName: "getPartSubmission", operationId: "consultarEntregaDaParte" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/parts/part-1/audit", template: "/v1/runs/{runId}/parts/{partKey}/audit", routeName: "auditPart", operationId: "auditarParteDoCurso" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/parts/part-1/reopen", template: "/v1/runs/{runId}/parts/{partKey}/reopen", routeName: "reopenPart", operationId: "reabrirParteDoCurso" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/validate", template: "/v1/runs/{runId}/validate", routeName: "validateRun", operationId: "validarCursoProduzido" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/publish", template: "/v1/runs/{runId}/publish", routeName: "publishRun", operationId: "publicarCursoNoCatalogo" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/block", template: "/v1/runs/{runId}/block", routeName: "blockRun", operationId: "bloquearExecucaoDeAutoria" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/resume", template: "/v1/runs/{runId}/resume", routeName: "resumeRun", operationId: "retomarExecucaoDeAutoria" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/cancel", template: "/v1/runs/{runId}/cancel", routeName: "cancelRun", operationId: "cancelarExecucaoDeAutoria" }
];
const LEGACY_FILES = [
  "validate_aralearn.py",
  "audit_semantics.py",
  "audit_code_layout.py",
  "merge_aralearn_parts.py",
  "__pycache__"
];
const QUALITY_GATES = [
  "planAlignment",
  "contract",
  "outcomeCoverage",
  "sources",
  "continuity",
  "interactionCoherence",
  "language",
  "fieldPreservation",
  "structuredElements",
  "feedback"
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function routeKey(method, routePath) {
  return `${method.toUpperCase()} ${routePath}`;
}

function parseYamlRoutes(source) {
  const routes = new Map();
  let currentPath = null;
  let currentKey = null;
  for (const line of source.split(/\r?\n/)) {
    const pathMatch = line.match(/^ {2}(\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentKey = null;
      continue;
    }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (currentPath && methodMatch) {
      currentKey = routeKey(methodMatch[1], currentPath);
      routes.set(currentKey, { operationId: null });
      continue;
    }
    const operationMatch = line.match(/^ {6}operationId:\s*(\S+)\s*$/);
    if (currentKey && operationMatch) {
      routes.get(currentKey).operationId = operationMatch[1];
    }
  }
  return routes;
}

function parseSwaggerRoutes(document) {
  const routes = new Map();
  for (const [routePath, pathItem] of Object.entries(document.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (!pathItem[method]) continue;
      routes.set(routeKey(method, routePath), { operationId: pathItem[method].operationId || null });
    }
  }
  return routes;
}

function yamlPathBlock(source, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startMatch = new RegExp(`^ {2}${escaped}:\\s*$`, "m").exec(source);
  assert.ok(startMatch, `Rota ausente no OpenAPI: ${routePath}`);
  const start = startMatch.index;
  const tail = source.slice(start + startMatch[0].length);
  const next = /\n(?= {2}\/[^\r\n]+:\s*$|components:\s*$)/m.exec(tail);
  return source.slice(start, next ? start + startMatch[0].length + next.index : source.length);
}

function assertRouteParity(actual, expectedSamples, label) {
  const expected = new Map(
    expectedSamples.map(({ method, template, operationId }) => [
      routeKey(method, template),
      { operationId }
    ])
  );
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), `${label}: conjunto de rotas divergente.`);
  for (const [key, route] of expected) {
    assert.equal(actual.get(key)?.operationId, route.operationId, `${label}: operationId divergente em ${key}.`);
  }
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(root);
  return files.sort();
}

function readStoredZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    assert.equal(method, 0, "Os pacotes determinísticos usam entradas sem compressão.");
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    entries.push({
      name: buffer.subarray(nameStart, nameStart + nameLength).toString("utf8"),
      content: buffer.subarray(contentStart, contentStart + compressedSize)
    });
    offset = contentStart + compressedSize;
  }
  return entries;
}

function assertPackagedMarkdownLinks(entries, archiveName) {
  const entryNames = new Set(entries.map((entry) => entry.name));
  for (const entry of entries.filter((item) => /(?:^|\/)README\.md$/u.test(item.name))) {
    const source = entry.content.toString("utf8");
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
      const rawTarget = match[1].trim().replace(/^<|>$/gu, "");
      if (!rawTarget || rawTarget.startsWith("#")
          || /^[a-z][a-z0-9+.-]*:/iu.test(rawTarget)) continue;
      const target = decodeURIComponent(rawTarget.split("#", 1)[0]);
      if (!target) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.name), target));
      const existsAsFile = entryNames.has(resolved);
      const prefix = `${resolved.replace(/\/$/u, "")}/`;
      const existsAsDirectory = [...entryNames].some((name) => name.startsWith(prefix));
      assert.ok(
        existsAsFile || existsAsDirectory,
        `${archiveName}: link interno quebrado em ${entry.name}: ${rawTarget}`
      );
    }
  }
}

for (const fileName of REQUIRED_SCHEMAS) {
  const absolute = path.join(AUTHORING_ROOT, "schemas", fileName);
  assert.equal(await exists(absolute), true, `Esquema ausente: ${fileName}`);
}

const schemas = [];
for (const absolute of (await listFiles(path.join(AUTHORING_ROOT, "schemas")))) {
  const schema = JSON.parse(await readFile(absolute, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.match(schema.$id, /^https:\/\//);
  schemas.push(schema);
}

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
for (const schema of schemas) ajv.addSchema(schema);
for (const schema of schemas) ajv.getSchema(schema.$id);

const examplesRoot = path.join(AUTHORING_ROOT, "examples");
const exampleFiles = (await listFiles(examplesRoot)).filter((file) => file.endsWith(".json"));
const parsedExamples = new Map();
assert.equal(exampleFiles.length, EXAMPLE_SCHEMAS.size, "A relação de exemplos e esquemas está incompleta.");
for (const absolute of exampleFiles) {
  const relative = path.relative(examplesRoot, absolute).replaceAll("\\", "/");
  const schemaName = EXAMPLE_SCHEMAS.get(relative);
  assert.ok(schemaName, `Exemplo sem esquema associado: ${relative}`);
  const example = JSON.parse(await readFile(absolute, "utf8"));
  parsedExamples.set(relative, example);
  if (Object.hasOwn(example, "artifact")) {
    assert.match(example.artifact, /^aralearn\./, `Artefato inválido em ${absolute}`);
  }
  if (Object.hasOwn(example, "version")) {
    assert.equal(example.version, 1, `Versão inesperada em ${absolute}`);
  }
  const schemaId = `https://fabio-ara.github.io/AraLearn/authoring/schemas/${schemaName}`;
  const validate = ajv.getSchema(schemaId);
  assert.ok(validate, `Esquema não compilado: ${schemaName}`);
  assert.equal(
    validate(example),
    true,
    `Exemplo inválido (${relative}): ${ajv.errorsText(validate.errors, { separator: " | " })}`
  );
}
assert.match(
  parsedExamples.get("10-audit.json").submissionSha256,
  /^[a-f0-9]{64}$/,
  "A auditoria deve copiar o fragmentHash canônico devolvido pela API."
);
assert.match(
  parsedExamples.get("10-audit.json").submissionReadReceipt,
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  "A auditoria deve devolver o comprovante recebido na releitura."
);
assert.deepEqual(
  Object.keys(parsedExamples.get("10-audit.json").gates),
  QUALITY_GATES,
  "A auditoria deve declarar os dez indicadores de qualidade na ordem normativa."
);
const sourceExample = parsedExamples.get("03-ledger-sources-chunk.json").items[0];
assert.equal(sourceExample.publishedOn, "2025-03-10");
assert.equal(sourceExample.publishedVersion, "1.0");
assert.equal(sourceExample.accessedOn, "2026-07-21");
assert.match(sourceExample.usageTerms, /síntese didática/);
const planExample = parsedExamples.get("02-plan.json");
assert.ok(planExample.ledgerManifest, "O plano deve declarar o manifesto do registro.");
assert.equal(Object.hasOwn(planExample, "ledger"), false, "O plano não deve transportar o registro completo.");
const planSchema = schemas.find((schema) => schema.$id.endsWith("/plan.schema.json"));
assert.equal(Object.hasOwn(planSchema.properties, "ledger"), false, "O esquema do plano ainda aceita o registro completo.");
for (const { method, sample, routeName } of ROUTE_SAMPLES) {
  assert.equal(routeRequest(method, sample).name, routeName, `O roteador não reconhece ${method} ${sample}.`);
}
const exampleRunId = planExample.runId;
const examplePartKey = parsedExamples.get("09-part-submission.json").partKey;
assert.doesNotThrow(() => validatePlanPayload(
  { requestId: "plan-request-0001", plan: planExample },
  exampleRunId
));
for (const [fileName, section] of [
  ["03-ledger-sources-chunk.json", "sources"],
  ["04-ledger-claims-chunk.json", "claims"],
  ["05-ledger-terms-chunk.json", "terms"]
]) {
  assert.doesNotThrow(() => validateLedgerChunkPayload(parsedExamples.get(fileName), { section }));
}
assert.throws(
  () => validateLedgerChunkPayload({
    ...structuredClone(parsedExamples.get("03-ledger-sources-chunk.json")),
    items: [{ ...sourceExample, publishedOn: "2025-02-30" }]
  }, { section: "sources" }),
  /publishedOn deve usar o formato ISO YYYY-MM-DD/
);
assert.doesNotThrow(() => validateFinalizePlanPayload(parsedExamples.get("06-plan-finalize.json")));
assert.doesNotThrow(() => validatePartSpecificationEnvelope(parsedExamples.get("07-part-specification.json")));
assert.doesNotThrow(() => validatePartPayload(
  parsedExamples.get("09-part-submission.json"),
  { runId: exampleRunId, partKey: examplePartKey }
));
assert.doesNotThrow(() => validateAuditPayload(
  parsedExamples.get("10-audit.json"),
  { runId: exampleRunId, partKey: examplePartKey }
));
assert.doesNotThrow(() => validateReopenPartPayload(
  parsedExamples.get("alternatives/reopen.json"),
  { runId: exampleRunId, partKey: examplePartKey }
));
assert.doesNotThrow(() => validateResumePayload(parsedExamples.get("alternatives/resume.json")));
assert.doesNotThrow(() => validateCancelRunPayload(parsedExamples.get("alternatives/cancel.json")));

const sourceFiles = await listFiles(AUTHORING_ROOT);
const sourceNames = sourceFiles.map((file) => file.replaceAll("\\", "/").toLowerCase());
for (const absolute of sourceFiles.filter((file) => file.endsWith(".json"))) {
  JSON.parse(await readFile(absolute, "utf8"));
}
for (const forbidden of LEGACY_FILES) {
  assert.equal(sourceNames.some((name) => name.includes(forbidden.toLowerCase())), false, `Arquivo legado incluído: ${forbidden}`);
}

const allText = (await Promise.all(
  sourceFiles
    .filter((file) => /\.(?:md|txt|json)$/i.test(file))
    .map((file) => readFile(file, "utf8"))
)).join("\n");
assert.doesNotMatch(allText, /sb_secret_[A-Za-z0-9._-]{12,}/);
assert.doesNotMatch(allText, /arl_[A-Za-z0-9_-]{20,}/);
assert.doesNotMatch(allText, /postgres(?:ql)?:\/\/[^\s]+/i);
assert.doesNotMatch(allText, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
assert.doesNotMatch(allText, /auditSha256|approvalSha256|aralearn\.approval/);
assert.doesNotMatch(allText, /\bplan\.ledger\b/, "As instruções ainda orientam a transportar o registro dentro do plano.");

const openApiText = await readFile(OPENAPI_PATH, "utf8");
assertRouteParity(parseYamlRoutes(openApiText), ROUTE_SAMPLES, "OpenAPI geral");
const importBlock = yamlPathBlock(openApiText, "/v1/imports");
assert.match(importBlock, /security:\s*\r?\n\s+- SupabaseBearer: \[\]/);
assert.doesNotMatch(importBlock, /AuthoringApiKey/, "A importação integral não pode aceitar chave de autoria.");
const publishBlock = yamlPathBlock(openApiText, "/v1/runs/{runId}/publish");
assert.match(publishBlock, /'202':/);
assert.match(publishBlock, /status publishing/);
assert.match(publishBlock, /mesmo requestId/);
assert.match(publishBlock, /pollAfterSeconds/);
assert.match(publishBlock, /45 segundos/);
assert.match(openApiText, /learningOutcomes/);
for (const field of [
  "publishedOn", "publishedVersion", "accessedOn", "usageTerms", "submissionReadReceipt",
  ...QUALITY_GATES
]) {
  assert.match(openApiText, new RegExp(`\\b${field}\\b`), `Campo ausente do OpenAPI: ${field}`);
}
for (const limit of ["96 KiB", "60 KiB", "48 KiB", "90 KiB"]) {
  assert.match(openApiText, new RegExp(limit.replace(" ", "\\s+")), `Limite ausente do OpenAPI: ${limit}`);
}
const copilotOpenApi = JSON.parse(await readFile(COPILOT_OPENAPI_PATH, "utf8"));
assert.equal(copilotOpenApi.swagger, "2.0");
assertRouteParity(
  parseSwaggerRoutes(copilotOpenApi),
  ROUTE_SAMPLES.filter(({ template }) => template !== "/v1/imports"),
  "OpenAPI do Microsoft 365"
);
assert.equal(Object.hasOwn(copilotOpenApi.paths, "/v1/imports"), false);
assert.deepEqual(Object.keys(copilotOpenApi.securityDefinitions || {}), ["AuthoringApiKey"]);
const copilotPublish = copilotOpenApi.paths["/v1/runs/{runId}/publish"].post;
assert.ok(copilotPublish.responses["202"]);
assert.match(copilotPublish.description, /status publishing/);
assert.match(copilotPublish.description, /mesmo requestId/);
assert.match(copilotPublish.description, /pollAfterSeconds/);
assert.match(copilotPublish.description, /45 segundos/);
const chatGptKnowledgeManifest = JSON.parse(await readFile(CHATGPT_KNOWLEDGE_MANIFEST, "utf8"));
assert.equal(chatGptKnowledgeManifest.artifact, "aralearn.chatgpt-knowledge-files");
assert.equal(chatGptKnowledgeManifest.version, 1);
assert.ok(chatGptKnowledgeManifest.files.length > 0);
assert.ok(chatGptKnowledgeManifest.files.length <= 20, "O GPT excede o limite de 20 arquivos de conhecimento.");
const chatGptSetup = await readFile(CHATGPT_SETUP_PATH, "utf8");
assert.match(chatGptSetup, new RegExp(PRIVACY_POLICY_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(chatGptSetup, /não deve ser compartilhado enquanto usar uma chave editorial comum/);
assert.match(chatGptSetup, /OAuth/);

execFileSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT, stdio: "inherit" });
const firstManifest = JSON.parse(await readFile(path.join(OUTPUT_ROOT, "manifest.json"), "utf8"));
const expectedDownloadFiles = [
  "aralearn-authoring-core.zip",
  ...PLATFORMS.map((platform) => `aralearn-authoring-${platform}.zip`),
  "manifest.json",
  "SHA256SUMS.txt"
];
for (const fileName of expectedDownloadFiles) {
  assert.equal(await exists(path.join(OUTPUT_ROOT, fileName)), true, `Download público ausente: ${fileName}`);
}
const publicAuthoringReadme = await readFile(path.join(AUTHORING_ROOT, "README.md"), "utf8");
const downloadsReadme = await readFile(path.join(OUTPUT_ROOT, "README.md"), "utf8");
for (const fileName of expectedDownloadFiles.filter((name) => name !== "manifest.json")) {
  assert.match(publicAuthoringReadme, new RegExp(fileName.replaceAll(".", "\\.")), `Link público ausente: ${fileName}`);
  assert.match(downloadsReadme, new RegExp(fileName.replaceAll(".", "\\.")), `Índice de downloads incompleto: ${fileName}`);
}
const firstHashes = new Map();
for (const archive of firstManifest.archives) {
  firstHashes.set(archive.file, sha256(await readFile(path.join(OUTPUT_ROOT, archive.file))));
}

execFileSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT, stdio: "inherit" });
const secondManifest = JSON.parse(await readFile(path.join(OUTPUT_ROOT, "manifest.json"), "utf8"));
assert.deepEqual(secondManifest, firstManifest, "O manifesto mudou entre duas gerações idênticas.");

for (const archive of secondManifest.archives) {
  const buffer = await readFile(path.join(OUTPUT_ROOT, archive.file));
  assert.equal(sha256(buffer), firstHashes.get(archive.file), `Pacote não determinístico: ${archive.file}`);
  assert.equal(sha256(buffer), archive.sha256, `Hash inválido: ${archive.file}`);
  const entries = readStoredZipEntries(buffer);
  assertPackagedMarkdownLinks(entries, archive.file);
  const names = entries.map((entry) => entry.name);
  assert.equal(names.length, new Set(names).size, `Pacote contém caminhos duplicados: ${archive.file}`);
  assert.ok(names.includes("aralearn-authoring/README.md"));
  assert.ok(names.includes("aralearn-authoring/core/workflow.md"));
  for (const schemaName of REQUIRED_SCHEMAS) {
    assert.ok(names.includes(`aralearn-authoring/schemas/${schemaName}`));
  }
  assert.ok(names.includes("aralearn-authoring/docs/aralearn-contract.md"));
  assert.ok(names.includes("aralearn-authoring/docs/recursos-de-card.md"));
  assert.equal(names.some((name) => LEGACY_FILES.some((forbidden) => name.toLowerCase().includes(forbidden.toLowerCase()))), false);
  const archiveText = entries
    .filter((entry) => /\.(?:md|txt|json|ya?ml)$/i.test(entry.name))
    .map((entry) => entry.content.toString("utf8"))
    .join("\n");
  assert.doesNotMatch(archiveText, /sb_secret_[A-Za-z0-9._-]{12,}/);
  assert.doesNotMatch(archiveText, /arl_[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(archiveText, /postgres(?:ql)?:\/\/[^\s]+/i);
  assert.doesNotMatch(archiveText, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  assert.match(archiveText, /status(?::| ) publishing/);
  assert.match(archiveText, /mesmo `?requestId`?/);
  assert.match(archiveText, /pollAfterSeconds/);
  assert.match(archiveText, /45 segundos/);
  if (archive.platform) {
    assert.ok(names.some((name) => name.startsWith(`aralearn-authoring/platforms/${archive.platform}/`)));
    for (const otherPlatform of PLATFORMS.filter((value) => value !== archive.platform)) {
      assert.equal(names.some((name) => name.startsWith(`aralearn-authoring/platforms/${otherPlatform}/`)), false);
    }
  } else {
    for (const platform of PLATFORMS) {
      assert.equal(names.some((name) => name.startsWith(`aralearn-authoring/platforms/${platform}/`)), false);
    }
  }
  const packagedOpenApi = entries.find(
    (entry) => entry.name === "aralearn-authoring/docs/openapi/aralearn-authoring-api.yaml"
  )?.content.toString("utf8");
  const packagedChatGptOpenApi = entries.find(
    (entry) => entry.name === "aralearn-authoring/docs/openapi/aralearn-authoring-api-chatgpt.yaml"
  )?.content.toString("utf8");
  const packagedCopilotOpenApi = entries.find(
    (entry) => entry.name === "aralearn-authoring/docs/openapi/aralearn-authoring-api-copilot-v2.json"
  )?.content.toString("utf8");
  if (archive.platform === "chatgpt") {
    assert.equal(packagedOpenApi, undefined, "O pacote ChatGPT deve usar o OpenAPI próprio.");
    assert.ok(packagedChatGptOpenApi, `OpenAPI do ChatGPT ausente em ${archive.file}`);
    assert.match(packagedChatGptOpenApi, /^openapi: 3\.1\.0$/m);
    assert.match(packagedChatGptOpenApi, /url: https:\/\/seu-projeto\.supabase\.co/);
    assert.match(packagedChatGptOpenApi, /AuthoringApiKey/);
    assert.match(packagedChatGptOpenApi, /schemas: \{\}/);
    assert.match(packagedChatGptOpenApi, /required: \[requestId, target, title, contractKey, brief, publicationIntent\]/);
    assert.match(packagedChatGptOpenApi, /publicationIntent:/);
    assert.match(packagedChatGptOpenApi, /enum: \[create, update\]/);
    assert.match(packagedChatGptOpenApi, /required: \[requestId, plan\]/);
    assert.match(packagedChatGptOpenApi, /required: \[id, statement, evidence\]/);
    assert.match(packagedChatGptOpenApi, /required: \[goal, include, exclude, notation, avoid\]/);
    assert.match(packagedChatGptOpenApi, /required: \[concepts, relations\]/);
    assert.match(packagedChatGptOpenApi, /required: \[from, to, relation\]/);
    assert.match(packagedChatGptOpenApi, /required: \[requestId, planHash, specification\]/);
    assert.match(packagedChatGptOpenApi, /required: \[artifact, version, requestId, mode, attempt, baseLedgerSha256, fragment, stateDelta\]/);
    assert.match(packagedChatGptOpenApi, /required: \[artifact, version, requestId, attempt, submissionSha256, submissionReadReceipt, decision, gates, findings\]/);
    assert.doesNotMatch(packagedChatGptOpenApi, /\$ref:|\{projectRef\}|\/v1\/imports|SupabaseBearer/);
    const expectedChatGptRoutes = ROUTE_SAMPLES
      .filter(({ template }) => template !== "/v1/imports")
      .map((sample) => ({
        ...sample,
        template: `/functions/v1/aralearn-authoring-api${sample.template}`
      }));
    assertRouteParity(parseYamlRoutes(packagedChatGptOpenApi), expectedChatGptRoutes, "Pacote ChatGPT");
  } else if (archive.platform === "microsoft-365") {
    assert.equal(packagedOpenApi, undefined, "O pacote Microsoft não deve misturar OpenAPI 3 e OpenAPI 2.");
    assert.ok(packagedCopilotOpenApi, `OpenAPI 2.0 ausente em ${archive.file}`);
    assertRouteParity(
      parseSwaggerRoutes(JSON.parse(packagedCopilotOpenApi)),
      ROUTE_SAMPLES.filter(({ template }) => template !== "/v1/imports"),
      "Pacote Microsoft 365"
    );
    const packagedPublish = JSON.parse(packagedCopilotOpenApi).paths["/v1/runs/{runId}/publish"].post;
    assert.ok(packagedPublish.responses["202"]);
    assert.match(packagedPublish.description, /45 segundos/);
  } else {
    assert.ok(packagedOpenApi, `OpenAPI ausente em ${archive.file}`);
    assert.equal(packagedCopilotOpenApi, undefined, `OpenAPI do Microsoft 365 incluído indevidamente em ${archive.file}`);
    assertRouteParity(
      parseYamlRoutes(packagedOpenApi),
      ROUTE_SAMPLES,
      `Pacote ${archive.platform || "comum"}`
    );
    const packagedPublish = yamlPathBlock(packagedOpenApi, "/v1/runs/{runId}/publish");
    assert.match(packagedPublish, /'202':/);
    assert.match(packagedPublish, /45 segundos/);
  }
  if (archive.platform === "chatgpt") {
    for (const recommended of chatGptKnowledgeManifest.files) {
      assert.ok(names.includes(`aralearn-authoring/${recommended}`), `Conhecimento ausente: ${recommended}`);
    }
    assert.match(archiveText, new RegExp(PRIVACY_POLICY_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(archiveText, /não deve ser compartilhado enquanto usar uma chave editorial comum/);
    assert.ok(
      names.includes("aralearn-authoring/platforms/chatgpt/prepareChatGptAction.ps1"),
      "O pacote ChatGPT inclui o preparador da Action"
    );
  } else if (archive.platform !== "microsoft-365") {
    assert.match(packagedOpenApi, /SupabaseBearer/);
  }
  if (archive.platform === "chatgpt" && await exists(CHATGPT_OPENAPI_PATH)) {
    assert.ok(names.includes("aralearn-authoring/docs/openapi/aralearn-authoring-api-chatgpt.yaml"));
  } else if (archive.platform !== "microsoft-365" && await exists(OPENAPI_PATH)) {
    assert.ok(names.includes("aralearn-authoring/docs/openapi/aralearn-authoring-api.yaml"));
  }
}

assert.deepEqual(
  secondManifest.archives.map((archive) => archive.platform).filter(Boolean),
  PLATFORMS
);

console.log("Pacotes de autoria: conteúdo, hashes, determinismo e ausência de segredos aprovados.");
