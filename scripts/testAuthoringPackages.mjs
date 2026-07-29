import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import {
  assertFragmentMatchesSpecification,
  assertSubmissionMatchesContinuity
} from "../supabase/functions/_shared/aralearn-authoring/canonical.js";
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
const STATE_LOOP_TEST_SCRIPT = path.join(SCRIPT_DIR, "testAuthoringStateLoop.mjs");
const OPENAPI_PATH = path.join(ROOT, "docs", "openapi", "aralearn-authoring-api.yaml");
const CHATGPT_OPENAPI_PROFILES = [
  {
    name: "private",
    target: "private",
    completionOperationId: "concluirCursoPessoal"
  },
  {
    name: "editorial",
    target: "catalog",
    completionOperationId: "publicarCursoNoCatalogo"
  }
].map((profile) => ({
  ...profile,
  fileName: `aralearn-authoring-api-chatgpt-${profile.name}.yaml`,
  absolutePath: path.join(
    ROOT,
    "docs",
    "openapi",
    `aralearn-authoring-api-chatgpt-${profile.name}.yaml`
  )
}));
const CHATGPT_ACTION_TEMPLATES = [
  "aralearn-authoring-api-chatgpt-private-action.json",
  "aralearn-authoring-api-chatgpt-private-action.yaml"
];
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
const PEDAGOGICAL_INSTRUCTION_PATHS = [
  "platforms/chatgpt/INSTRUCTIONS.md",
  "platforms/claude/PROJECT_INSTRUCTIONS.md",
  "platforms/claude/SKILL.md",
  "platforms/gemini/GEM_INSTRUCTIONS.md",
  "platforms/gemini/SKILL.md",
  "platforms/generic/SYSTEM_PROMPT.md",
  "platforms/microsoft-365/AGENT_INSTRUCTIONS.md",
  "platforms/microsoft-365/declarative-agent/instructions.txt"
];
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
  "next-part.schema.json",
  "card.schema.json",
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
  { method: "GET", sample: "/v1/contracts/resources", template: "/v1/contracts/resources", routeName: "listAuthoringResources", operationId: "listarRecursosDeCard" },
  { method: "GET", sample: "/v1/contracts/resources/code", template: "/v1/contracts/resources/{resource}", routeName: "getAuthoringResource", operationId: "consultarRecursoDeCard" },
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
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/deliver", template: "/v1/runs/{runId}/deliver", routeName: "deliverRun", operationId: "entregarFaseDeAutoria" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/approve-delivery", template: "/v1/runs/{runId}/approve-delivery", routeName: "approveDeliveryRun", operationId: "aprovarEntregaDeAutoria" },
  { method: "POST", sample: "/v1/runs/11111111-1111-4111-8111-111111111111/cancel", template: "/v1/runs/{runId}/cancel", routeName: "cancelRun", operationId: "cancelarExecucaoDeAutoria" }
];
const PRIVATE_INTEGRATION_ROUTE_SAMPLES = [
  { method: "GET", sample: "/v1/integrations", template: "/v1/integrations", routeName: "listPrivateIntegrations", operationId: "listarIntegracoesPessoais" },
  { method: "POST", sample: "/v1/integrations", template: "/v1/integrations", routeName: "createPrivateIntegration", operationId: "criarIntegracaoPessoal" },
  { method: "POST", sample: "/v1/integrations/11111111-1111-4111-8111-111111111111/rotate", template: "/v1/integrations/{clientId}/rotate", routeName: "rotatePrivateIntegration", operationId: "renovarIntegracaoPessoal" },
  { method: "DELETE", sample: "/v1/integrations/11111111-1111-4111-8111-111111111111", template: "/v1/integrations/{clientId}", routeName: "revokePrivateIntegration", operationId: "revogarIntegracaoPessoal" }
];
const CATALOG_ROUTE_SAMPLES = [
  { method: "GET", sample: "/v1/catalog/collections", template: "/v1/catalog/collections", routeName: "listCatalogCollections", operationId: "listarColecoesDoCatalogo" },
  { method: "POST", sample: "/v1/catalog/collections", template: "/v1/catalog/collections", routeName: "createCatalogCollection", operationId: "criarColecaoDoCatalogo" },
  { method: "PUT", sample: "/v1/catalog/collections/order", template: "/v1/catalog/collections/order", routeName: "reorderCatalogCollections", operationId: "reordenarColecoesDoCatalogo" },
  { method: "PATCH", sample: "/v1/catalog/collections/11111111-1111-4111-8111-111111111111", template: "/v1/catalog/collections/{collectionId}", routeName: "renameCatalogCollection", operationId: "renomearColecaoDoCatalogo" },
  { method: "POST", sample: "/v1/catalog/collections/11111111-1111-4111-8111-111111111111/retire", template: "/v1/catalog/collections/{collectionId}/retire", routeName: "retireCatalogCollection", operationId: "aposentarColecaoDoCatalogo" },
  { method: "GET", sample: "/v1/catalog/collections/11111111-1111-4111-8111-111111111111/courses", template: "/v1/catalog/collections/{collectionId}/courses", routeName: "listCatalogCourses", operationId: "listarCursosDaColecao" },
  { method: "PUT", sample: "/v1/catalog/collections/11111111-1111-4111-8111-111111111111/courses/order", template: "/v1/catalog/collections/{collectionId}/courses/order", routeName: "reorderCatalogCourses", operationId: "reordenarCursosDaColecao" },
  { method: "GET", sample: "/v1/catalog/courses/11111111-1111-4111-8111-111111111111", template: "/v1/catalog/courses/{courseId}", routeName: "getCatalogCourse", operationId: "consultarCursoDoCatalogo" },
  { method: "PUT", sample: "/v1/catalog/courses/11111111-1111-4111-8111-111111111111/placement", template: "/v1/catalog/courses/{courseId}/placement", routeName: "moveCatalogCourse", operationId: "moverCursoNoCatalogo" }
];
const PERSONAL_LIBRARY_ROUTE_SAMPLES = [
  { method: "GET", sample: "/v1/library/courses", template: "/v1/library/courses", routeName: "listPersonalLibraryCourses", operationId: "listarCursosDaBibliotecaPessoal" },
  { method: "GET", sample: "/v1/library/paths", template: "/v1/library/paths", routeName: "listPersonalStudyPaths", operationId: "listarTrilhasPessoais" },
  { method: "POST", sample: "/v1/library/paths", template: "/v1/library/paths", routeName: "createPersonalStudyPath", operationId: "criarTrilhaPessoal" },
  { method: "PATCH", sample: "/v1/library/paths/11111111-1111-4111-8111-111111111111", template: "/v1/library/paths/{pathId}", routeName: "renamePersonalStudyPath", operationId: "renomearTrilhaPessoal" },
  { method: "DELETE", sample: "/v1/library/paths/11111111-1111-4111-8111-111111111111", template: "/v1/library/paths/{pathId}", routeName: "deletePersonalStudyPath", operationId: "excluirTrilhaPessoal" },
  { method: "PUT", sample: "/v1/library/selections/11111111-1111-4111-8111-111111111111/path", template: "/v1/library/selections/{selectionId}/path", routeName: "movePersonalCourseSelection", operationId: "moverCursoParaTrilha" }
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

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
  strictRequired: false
});
ajv.addKeyword({ keyword: "x-aralearn-practiceGrouping", schemaType: "object", valid: true });
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
const partSpecificationExample = parsedExamples.get("07-part-specification.json").specification;
const plannedPracticeCards = partSpecificationExample.cardPlan.filter((card) => card.kind === "exercise");
const plannedWorkedExamples = partSpecificationExample.cardPlan.filter(
  (card) => card.learningFunction === "worked_example"
);
assert.equal(plannedPracticeCards.length, 1, "O exemplo mínimo deve conter uma prática.");
assert.equal(plannedWorkedExamples.length, 1, "A prática precisa ser precedida por exemplo resolvido.");
assert.equal(plannedPracticeCards[0].learningFunction, "independent_practice");
assert.equal(plannedPracticeCards[0].operationId, plannedWorkedExamples[0].operationId);
assert.deepEqual(plannedPracticeCards[0].outcomeIds, ["outcome-conjuncao"]);
assert.deepEqual(plannedPracticeCards[0].contextAnchors, ["P e Q"]);
assert.match(partSpecificationExample.cutReason, /condição indivisível/u);
const workedExampleCard = parsedExamples
  .get("09-part-submission.json")
  .fragment.microsequences[0].cards.find((card) => card.id === plannedWorkedExamples[0].cardId);
assert.match(plannedWorkedExamples[0].purpose, /resolver um caso concreto/iu);
assert.match(workedExampleCard.text, /P verdadeira e Q verdadeira/u);
assert.match(workedExampleCard.text, /pois as duas proposições são verdadeiras/u);
const planSchema = schemas.find((schema) => schema.$id.endsWith("/plan.schema.json"));
assert.equal(Object.hasOwn(planSchema.properties, "ledger"), false, "O esquema do plano ainda aceita o registro completo.");
const validatePlanSchema = ajv.getSchema(planSchema.$id);
const missingPrerequisitesPlan = structuredClone(planExample);
delete missingPrerequisitesPlan.course.prerequisites;
assert.equal(validatePlanSchema(missingPrerequisitesPlan), false, "O schema aceitou plano sem prerequisites explícito.");
const invalidLanguagePlan = structuredClone(planExample);
invalidLanguagePlan.course.language = "pt_BR";
assert.equal(validatePlanSchema(invalidLanguagePlan), false, "O schema aceitou idioma fora de BCP 47.");
const inconsistentLedgerManifest = structuredClone(planExample);
inconsistentLedgerManifest.ledgerManifest.sections.sources = {
  chunkCount: 0,
  itemCount: 1
};
assert.equal(
  validatePlanSchema(inconsistentLedgerManifest),
  false,
  "O schema aceitou manifesto vazio com itens declarados."
);
const malformedProjectTopic = structuredClone(planExample);
malformedProjectTopic.project.courses[0].modules[0].lessons[0].topics = [{ label: "Tema" }];
assert.equal(
  validatePlanSchema(malformedProjectTopic),
  false,
  "O schema aceitou topic incompleto no projeto v3."
);
const malformedProjectGuide = structuredClone(planExample);
delete malformedProjectGuide.project.courses[0].modules[0].guide.avoid;
assert.equal(
  validatePlanSchema(malformedProjectGuide),
  false,
  "O schema aceitou guide incompleto no projeto v3."
);
const nonCanonicalPrerequisite = structuredClone(planExample);
nonCanonicalPrerequisite.course.prerequisites = [" requisito "];
assert.equal(
  validatePlanSchema(nonCanonicalPrerequisite),
  false,
  "O schema aceitou espaços nas extremidades de lista estrutural."
);
const partSpecificationSchema = schemas.find(
  (schema) => schema.$id.endsWith("/part-specification.schema.json")
);
const validatePartSpecificationSchema = ajv.getSchema(partSpecificationSchema.$id);
assert.match(
  partSpecificationSchema.$defs.cardPlan.description,
  /operationId[\s\S]*(?:foundation|fundamento)[\s\S]*variationFocus/iu,
  "O schema precisa declarar continuidade e variação por operationId."
);
assert.equal(
  partSpecificationSchema.$defs.cardPlan["x-aralearn-practiceGrouping"].groupBy,
  "operationId",
  "O schema não identifica operationId como chave da contagem de práticas."
);
const missingContextAnchors = structuredClone(parsedExamples.get("07-part-specification.json"));
delete missingContextAnchors.specification.cardPlan[1].contextAnchors;
assert.equal(
  validatePartSpecificationSchema(missingContextAnchors),
  false,
  "O schema aceitou prática sem contextAnchors."
);
const nonCanonicalContextAnchor = structuredClone(
  parsedExamples.get("07-part-specification.json")
);
nonCanonicalContextAnchor.specification.cardPlan[1].contextAnchors = [" P e Q "];
assert.equal(
  validatePartSpecificationSchema(nonCanonicalContextAnchor),
  false,
  "O schema aceitou espaços nas extremidades de contextAnchors."
);
const codeLanguageOnParagraph = structuredClone(
  parsedExamples.get("07-part-specification.json")
);
codeLanguageOnParagraph.specification.cardPlan[0].codeLanguage = "javascript";
assert.equal(
  validatePartSpecificationSchema(codeLanguageOnParagraph),
  false,
  "O schema aceitou codeLanguage em recurso paragraph."
);
const codeWithoutLanguage = structuredClone(parsedExamples.get("07-part-specification.json"));
codeWithoutLanguage.specification.cardPlan[0].resource = "code";
assert.equal(
  validatePartSpecificationSchema(codeWithoutLanguage),
  false,
  "O schema aceitou recurso code sem codeLanguage."
);
const formulaWithoutNotation = structuredClone(parsedExamples.get("07-part-specification.json"));
formulaWithoutNotation.specification.cardPlan[0].resource = "formula";
assert.equal(
  validatePartSpecificationSchema(formulaWithoutNotation),
  false,
  "O schema aceitou recurso formula sem notation."
);
const practiceFunctionOnTheory = structuredClone(
  parsedExamples.get("07-part-specification.json")
);
practiceFunctionOnTheory.specification.cardPlan[0].learningFunction = "independent_practice";
assert.equal(
  validatePartSpecificationSchema(practiceFunctionOnTheory),
  false,
  "O schema aceitou função de prática em card teórico."
);
const exerciseWithoutTargetError = structuredClone(
  parsedExamples.get("07-part-specification.json")
);
delete exerciseWithoutTargetError.specification.cardPlan[1].targetError;
assert.equal(
  validatePartSpecificationSchema(exerciseWithoutTargetError),
  false,
  "O schema aceitou prática sem targetError."
);
const diagnosisWithoutMisconception = structuredClone(
  parsedExamples.get("07-part-specification.json")
);
diagnosisWithoutMisconception.specification.cardPlan[1].learningFunction =
  "error_diagnosis";
diagnosisWithoutMisconception.specification.cardPlan[1].misconceptionIds = [];
assert.equal(
  validatePartSpecificationSchema(diagnosisWithoutMisconception),
  false,
  "O schema aceitou diagnóstico de erro sem misconceptionIds."
);
const dependencyWithoutRationale = structuredClone(
  parsedExamples.get("07-part-specification.json")
);
dependencyWithoutRationale.specification.structure.microsequences[0].dependsOn = ["micro-approved"];
delete dependencyWithoutRationale.specification.structure.microsequences[0].dependencyRationale;
assert.equal(
  validatePartSpecificationSchema(dependencyWithoutRationale),
  false,
  "O schema aceitou microssequência dependente sem dependencyRationale."
);
const independentWithoutRationale = structuredClone(
  parsedExamples.get("07-part-specification.json")
);
delete independentWithoutRationale.specification.structure.microsequences[0].dependencyRationale;
assert.equal(
  validatePartSpecificationSchema(independentWithoutRationale),
  false,
  "O schema aceitou microssequência sem dependencyRationale vazio."
);
const nextPartSchema = schemas.find((schema) => schema.$id.endsWith("/next-part.schema.json"));
const validateNextPartSchema = ajv.getSchema(nextPartSchema.$id);
const buildInstruction = parsedExamples.get("08-part-spec.json");
assert.equal(
  validateNextPartSchema(buildInstruction),
  true,
  `A instrução build_part não corresponde ao schema: ${ajv.errorsText(validateNextPartSchema.errors)}`
);
const emptyLedgerProgress = Object.fromEntries(["sources", "claims", "terms"].map((section) => [
  section,
  {
    expectedChunks: 0,
    expectedItems: 0,
    receivedChunks: 0,
    receivedItems: 0,
    missingPositions: []
  }
]));
const uploadLedgerInstruction = {
  action: "upload_ledger",
  artifact: "aralearn.ledger-upload",
  version: 1,
  runId: planExample.runId,
  planHash: "d".repeat(64),
  ledgerManifest: planExample.ledgerManifest,
  ledgerProgress: emptyLedgerProgress
};
assert.equal(
  validateNextPartSchema(uploadLedgerInstruction),
  true,
  `A instrução upload_ledger não corresponde ao schema: ${ajv.errorsText(validateNextPartSchema.errors)}`
);
const outline = partSpecificationExample;
const specifyPartInstruction = {
  action: "specify_part",
  artifact: "aralearn.part-outline",
  version: 1,
  runId: planExample.runId,
  partKey: outline.key,
  position: 0,
  planHash: "d".repeat(64),
  key: outline.key,
  title: outline.title,
  boundary: outline.boundary,
  cutReason: outline.cutReason,
  dependsOnPartKeys: outline.dependsOnPartKeys,
  ownership: outline.ownership,
  cardIds: outline.cardPlan.map((card) => card.cardId),
  outcomeIds: outline.outcomeIds,
  conceptIds: outline.conceptIds,
  operationIds: outline.operationIds,
  misconceptionIds: outline.misconceptionIds,
  brief: {},
  project: planExample.project,
  ledger: buildInstruction.ledger,
  learningOutcomes: planExample.learningOutcomes,
  concepts: planExample.conceptMap.concepts.filter(
    (concept) => outline.conceptIds.includes(concept.id)
  ),
  conceptRelations: buildInstruction.conceptRelations,
  operations: planExample.operations.filter(
    (operation) => outline.operationIds.includes(operation.id)
  ),
  misconceptions: planExample.misconceptions.filter(
    (misconception) => outline.misconceptionIds.includes(misconception.id)
  )
};
assert.equal(
  validateNextPartSchema(specifyPartInstruction),
  true,
  `A instrução specify_part não corresponde ao schema: ${ajv.errorsText(validateNextPartSchema.errors)}`
);
const mismatchedAction = { ...buildInstruction, action: "specify_part" };
assert.equal(
  validateNextPartSchema(mismatchedAction),
  false,
  "O schema aceitou action incompatível com o artefato devolvido."
);
const readableError = partSpecificationExample.structure.microsequences[0].errors[0];
assert.match(
  readableError,
  /\s/u,
  "O erro didático precisa ser uma descrição legível, não um identificador opaco."
);
assert.deepEqual(
  parsedExamples.get("09-part-submission.json").stateDelta.resolvedErrorIds,
  [readableError],
  "resolvedErrorIds deve reutilizar exatamente a descrição didática planejada."
);
const ledgerSchema = schemas.find((schema) => schema.$id.endsWith("/ledger.schema.json"));
const validateLedgerSchema = ajv.getSchema(ledgerSchema.$id);
const volatileLedger = {
  artifact: "aralearn.course-ledger",
  version: 1,
  runId: planExample.runId,
  sources: [{ ...sourceExample, stability: "volatile" }],
  claims: [],
  terms: [],
  approvedParts: []
};
delete volatileLedger.sources[0].accessedOn;
assert.equal(validateLedgerSchema(volatileLedger), false, "O schema aceitou fonte volátil sem accessedOn.");
for (const { method, sample, routeName } of [
  ...ROUTE_SAMPLES,
  ...CATALOG_ROUTE_SAMPLES,
  ...PRIVATE_INTEGRATION_ROUTE_SAMPLES
]) {
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
const partContextExample = parsedExamples.get("08-part-spec.json");
const partSubmissionExample = parsedExamples.get("09-part-submission.json");
assert.doesNotThrow(() => assertFragmentMatchesSpecification(
  partSubmissionExample.fragment,
  partContextExample
));
assert.doesNotThrow(() => assertSubmissionMatchesContinuity(
  partSubmissionExample,
  partContextExample
));
const staleResolvedError = structuredClone(partSubmissionExample);
staleResolvedError.stateDelta.resolvedErrorIds = ["erro-uma-proposicao"];
assert.throws(
  () => assertSubmissionMatchesContinuity(staleResolvedError, partContextExample),
  /resolvedErrorIds contém identificador não autorizado/u,
  "A validação canônica não detectou a divergência histórica de resolvedErrorIds."
);
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

const qualityGuide = await readFile(path.join(AUTHORING_ROOT, "core", "quality.md"), "utf8");
const semanticAuditGuide = await readFile(path.join(AUTHORING_ROOT, "knowledge", "semantic-audit.md"), "utf8");
const safetyGuide = await readFile(path.join(AUTHORING_ROOT, "core", "safety.md"), "utf8");
const workflowGuide = await readFile(path.join(AUTHORING_ROOT, "core", "workflow.md"), "utf8");
const statesGuide = await readFile(path.join(AUTHORING_ROOT, "core", "states.md"), "utf8");
assert.match(qualityGuide, /sem conhecimentos prévios/u);
assert.match(qualityGuide, /Não pergunte se a pessoa é iniciante, intermediária ou avançada/u);
assert.match(qualityGuide, /A quantidade de práticas decorre da complexidade do resultado/u);
assert.match(qualityGuide, /O dimensionamento é uma decisão pedagógica obrigatória/u);
assert.match(qualityGuide, /Não trate a simples menção de vários itens/u);
assert.match(qualityGuide, /Antes de gravar o plano, faça uma revisão de cobertura/u);
assert.match(qualityGuide, /material autossuficiente, cobertura integral ou preparação para uma avaliação/u);
assert.match(qualityGuide, /cada produto, tecnologia, padrão, método ou ferramenta nomeada/u);
assert.match(qualityGuide, /bloco final de atividades inéditas integradas/u);
assert.match(qualityGuide, /Quando houver várias práticas da mesma operação, use `variationFocus` distintos/u);
assert.match(qualityGuide, /Dados voláteis aparecem no próprio card/u);
assert.match(qualityGuide, /Não anuncie o que a explicação fará nem descreva o próprio texto/u);
assert.match(qualityGuide, /Não use travessão/u);
assert.match(qualityGuide, /Não descreva a extensão com adjetivos vagos/u);
assert.match(qualityGuide, /Crases representam código, comando, identificador, literal, sintaxe/u);
assert.match(qualityGuide, /Leitura de representações estruturadas/u);
assert.match(semanticAuditGuide, /Uma prática mede uma decisão principal/u);
assert.match(semanticAuditGuide, /Cobertura antes da construção/u);
assert.match(semanticAuditGuide, /não aceite um dimensionamento sem mapa de cobertura/u);
assert.match(semanticAuditGuide, /texto de bastidor/u);
assert.match(semanticAuditGuide, /crases só representam código, comando, identificador, literal, sintaxe ou/iu);
assert.match(semanticAuditGuide, /grafo precisa mostrar entidades estáveis/u);
assert.match(semanticAuditGuide, /`repair`/u);
assert.match(semanticAuditGuide, /`rebuild`/u);
assert.match(semanticAuditGuide, /`blocked`/u);
assert.match(safetyGuide, /validação integral[\s\S]*confirmação do autor[\s\S]*permissão editorial/u);
assert.match(workflowGuide, /Laço orientado pelo estado persistido/u);
assert.match(workflowGuide, /cada entrega é um ponto obrigatório de parada/u);
assert.match(workflowGuide, /aprovação explícita do autor/u);
assert.match(workflowGuide, /Planejador, Construtor e Auditor[\s\S]*não divide o trabalho em vários pedidos/u);
assert.match(workflowGuide, /Para retomar[\s\S]*`runId`[\s\S]*novo chat não é requisito/u);
assert.match(workflowGuide, /decisão humana indispensável[\s\S]*autenticação[\s\S]*limite real[\s\S]*rejeição determinística[\s\S]*confirmação final de publicação/u);
assert.match(workflowGuide, /timeout, resposta perdida[\s\S]*mesmo identificador/u);
assert.match(workflowGuide, /O envio de um trecho do registro é recuperável/u);
assert.match(workflowGuide, /correção de conteúdo[\s\S]*outro `requestId`/u);
assert.match(workflowGuide, /Intérprete de código não é[\s\S]*estado de autoria/u);
assert.match(workflowGuide, /só é esperado depois de consultar a entrega/u);
assert.match(statesGuide, /cada entrega é um ponto obrigatório de parada/u);
assert.match(statesGuide, /retomada consulta o mesmo `runId`/u);
for (const resource of [
  "paragraph", "choice", "composite", "code", "table", "flow", "tree", "graph",
  "relation_map", "matrix", "plane"
]) {
  assert.match(qualityGuide, new RegExp(`\\b${resource}\\b`, "u"), `Recurso ausente da orientação didática: ${resource}`);
}

const pedagogicalInstructions = [];
for (const relative of PEDAGOGICAL_INSTRUCTION_PATHS) {
  const content = await readFile(path.join(AUTHORING_ROOT, relative), "utf8");
  if (relative === "platforms/chatgpt/INSTRUCTIONS.md") {
    assert.ok(content.length <= 8000, "As instruções do ChatGPT excedem o limite de 8.000 caracteres.");
    assert.match(content, /cada fase termina em uma entrega ao autor/iu);
    assert.match(content, /aguarde aprovação explícita/u);
  }
  pedagogicalInstructions.push(content);
  assert.match(content, /sem conhecimentos prévios/u, `${relative}: ponto de partida ausente.`);
  assert.match(content, /Não pergunte genericamente se (?:ela|a pessoa) é iniciante, intermediária ou avançada/u, `${relative}: pergunta genérica de nível ainda permitida.`);
  assert.match(content, /progressão causal/u, `${relative}: progressão causal ausente.`);
  assert.match(content, /dados voláteis/u, `${relative}: autonomia da prática ausente.`);
  assert.match(content, /doze recursos/u, `${relative}: catálogo v3 ausente.`);
  assert.match(content, /regras de linguagem/u, `${relative}: orientação de linguagem ausente.`);
  assert.match(content, /aprovação explícita/u, `${relative}: entrega sem aprovação explícita.`);
  assert.match(content, /(?:(?:Não execute|não execute).*`?nextAction`?|aprovação explícita antes da `?nextAction`?)/u, `${relative}: nextAction ainda pode avançar sem aprovação.`);
  assert.match(content, /(?:não exija|sem exigir) (?:um )?novo chat/iu, `${relative}: retomada ainda exige novo chat.`);
  assert.match(content, /(?:Releia a execução antes de mudar|Em novo pedido, releia (?:a execução|o `runId`)).*Planejador.*Construtor.*Auditor/u, `${relative}: separação de funções sem releitura.`);
  assert.match(content, /decisão humana indispensável/u, `${relative}: parada humana não delimitada.`);
  assert.match(content, /autenticação ausente/u, `${relative}: parada por autenticação ausente.`);
  assert.match(content, /limite real da ferramenta ou do modelo/u, `${relative}: parada por capacidade real ausente.`);
  assert.match(content, /rejeição determinística não corrigível/iu, `${relative}: rejeição definitiva não delimitada.`);
  assert.match(content, /confirmação final de publicação/u, `${relative}: confirmação final ausente.`);
  assert.match(
    content,
    /Nunca publique(?: no catálogo)? sem essa confirmação/u,
    `${relative}: publicação sem confirmação ainda possível.`
  );
  assert.match(
    content,
    /timeout, resposta perdida(?:, limite de requisições)? ou falha temporária[\s\S]*mesmo (?:`?requestId`?|identificador)/iu,
    `${relative}: repetição idempotente incompleta.`
  );
  assert.match(
    content,
    /(?:Conteúdo corrigido|Uma correção(?: de conteúdo)?|corrija o conteúdo)[\s\S]{0,80}(?:outro `requestId`|outro identificador)/iu,
    `${relative}: correção ainda pode reutilizar requestId.`
  );
}
assert.doesNotMatch(pedagogicalInstructions.join("\n"), /—/u, "As instruções pedagógicas contêm travessão.");

const actionGuide = await readFile(path.join(AUTHORING_ROOT, "platforms", "chatgpt", "ACTION_GUIDE.md"), "utf8");
assert.match(actionGuide, /aguarde aprovação explícita/u);
assert.match(actionGuide, /`runId` permite retomar uma interrupção[\s\S]*sem abrir novo chat/u);
assert.match(actionGuide, /timeout, resposta perdida[\s\S]*mesmo identificador e o mesmo corpo/u);
const genericIntegration = await readFile(path.join(AUTHORING_ROOT, "platforms", "generic", "INTEGRATION.md"), "utf8");
assert.match(genericIntegration, /Cada fase termina com uma entrega/u);
assert.match(genericIntegration, /interrupção é retomada pelo mesmo `runId`/u);
const declarativeInstructions = await readFile(
  path.join(AUTHORING_ROOT, "platforms", "microsoft-365", "declarative-agent", "instructions.txt"),
  "utf8"
);
const declarativeAgent = JSON.parse(await readFile(
  path.join(AUTHORING_ROOT, "platforms", "microsoft-365", "declarative-agent", "declarativeAgent.json"),
  "utf8"
));
assert.equal(declarativeAgent.instructions, declarativeInstructions.trim(), "As duas instruções do agente Microsoft divergiram.");

execFileSync(process.execPath, [STATE_LOOP_TEST_SCRIPT], { cwd: ROOT, stdio: "inherit" });

const openApiText = await readFile(OPENAPI_PATH, "utf8");
const openApiDocument = parse(openApiText);
const openApiSchemas = openApiDocument.components.schemas;
const partSubmissionSchema = schemas.find((schema) =>
  schema.$id.endsWith("/part-submission.schema.json")
);
assert.ok(partSubmissionSchema);
const validatePartSubmissionSchema = ajv.getSchema(partSubmissionSchema.$id);
const ninthPartAttempt = structuredClone(parsedExamples.get("09-part-submission.json"));
ninthPartAttempt.attempt = 9;
assert.equal(
  validatePartSubmissionSchema(ninthPartAttempt),
  false,
  "O schema aceitou a nona tentativa de construção."
);
const auditSchema = schemas.find((schema) =>
  schema.$id.endsWith("/audit.schema.json")
);
const validateAuditSchema = ajv.getSchema(auditSchema.$id);
const ninthAuditAttempt = structuredClone(parsedExamples.get("10-audit.json"));
ninthAuditAttempt.attempt = 9;
assert.equal(
  validateAuditSchema(ninthAuditAttempt),
  false,
  "O schema aceitou a nona tentativa de auditoria."
);
const reopenSchema = schemas.find((schema) =>
  schema.$id.endsWith("/reopen.schema.json")
);
const validateReopenSchema = ajv.getSchema(reopenSchema.$id);
const ninthReopenAttempt = structuredClone(parsedExamples.get("alternatives/reopen.json"));
ninthReopenAttempt.attempt = 9;
assert.equal(
  validateReopenSchema(ninthReopenAttempt),
  false,
  "O schema aceitou a nona tentativa de reabertura."
);
assert.equal(Object.hasOwn(partSubmissionSchema, "$defs"), false);
assert.equal(
  partSubmissionSchema.properties.fragment.properties.microsequences
    .items.properties.cards.items.$ref,
  "card.schema.json"
);
assert.equal(
  partSubmissionSchema.properties.evidence.items.additionalProperties,
  false
);
assert.ok(openApiDocument.paths["/v1/contracts/resources"]);
assert.ok(openApiDocument.paths["/v1/contracts/resources/{resource}"]);
assert.equal(
  Object.hasOwn(openApiDocument.paths, "/v1/{revisionTarget}/revisions"),
  false,
  "O OpenAPI geral não deve usar um primeiro segmento variável para as correções."
);
const openApiOperationIds = [];
for (const [routePath, pathItem] of Object.entries(openApiDocument.paths)) {
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const operation = pathItem[method];
    if (!operation) continue;
    openApiOperationIds.push(operation.operationId);
    assert.ok(
      Object.keys(operation.responses || {}).some(
        (status) => /^4\d\d$/u.test(status)
      ),
      `${method.toUpperCase()} ${routePath} não declara resposta 4XX.`
    );
  }
}
assert.equal(
  new Set(openApiOperationIds).size,
  openApiOperationIds.length,
  "O OpenAPI geral contém operationId duplicado."
);
assert.doesNotMatch(openApiText, /singlePracticeRationale/u);
assert.match(openApiText, /\{gap:id\}/u);
assert.ok(openApiSchemas.PlanRequest.properties.plan.required.includes("operations"));
assert.ok(openApiSchemas.PlanRequest.properties.plan.required.includes("misconceptions"));
assert.deepEqual(
  openApiSchemas.PlanRequest.properties.plan.properties.conceptMap
    .properties.relations.items.properties.relation.enum,
  ["requires", "part_of", "contrasts", "represents", "applies", "causes"]
);
assert.equal(openApiSchemas.PartRequest.properties.fragment.$ref, "#/components/schemas/AuthoringFragment");
assert.equal(openApiSchemas.AuthoringFragment.additionalProperties, false);
assert.equal(
  openApiSchemas.AuthoringFragment.properties.microsequences
    .items.additionalProperties,
  false
);
assert.equal(
  openApiSchemas.AuthoringFragment.properties.microsequences
    .items.properties.cards.items.$ref,
  "../../authoring/schemas/card.schema.json"
);
assert.equal(
  openApiSchemas.PartRequest.properties.evidence.items.additionalProperties,
  false
);
assert.deepEqual(
  openApiSchemas.NextPartInstruction.oneOf.map((entry) => entry.$ref),
  [
    "#/components/schemas/UploadLedgerInstruction",
    "#/components/schemas/SpecifyPartInstruction",
    "#/components/schemas/BuildPartInstruction"
  ],
  "O OpenAPI geral não discrimina as três instruções devolvidas por next-part."
);
assert.equal(openApiSchemas.NextPartInstruction.discriminator.propertyName, "action");
for (const field of ["action", "key", "planHash", "specificationHash"]) {
  assert.ok(
    openApiSchemas.BuildPartInstruction.required.includes(field),
    `BuildPartInstruction não exige ${field}.`
  );
}
assert.match(
  openApiSchemas.PartSpecification.properties.cardPlan.description,
  /operationId[\s\S]*(?:fundamento|exemplo resolvido)[\s\S]*variationFocus/iu,
  "O OpenAPI não declara continuidade e variação por operationId."
);
assert.equal(
  openApiSchemas.PartSpecification.properties.cardPlan["x-aralearn-practiceGrouping"].groupBy,
  "operationId",
  "O OpenAPI não identifica operationId como chave da contagem de práticas."
);
assertRouteParity(
  parseYamlRoutes(openApiText),
  [
    ...CATALOG_ROUTE_SAMPLES,
    ...PERSONAL_LIBRARY_ROUTE_SAMPLES,
    ...PRIVATE_INTEGRATION_ROUTE_SAMPLES,
    ...ROUTE_SAMPLES
  ],
  "OpenAPI geral"
);
const chatGptProfileDocuments = new Map();
for (const profile of CHATGPT_OPENAPI_PROFILES) {
  const text = await readFile(profile.absolutePath, "utf8");
  const routes = parseYamlRoutes(text);
  chatGptProfileDocuments.set(profile.name, { text, routes });
  for (const { method, template } of PRIVATE_INTEGRATION_ROUTE_SAMPLES) {
    assert.equal(
      routes.has(routeKey(method, template)),
      false,
      `A Action ${profile.name} não deve administrar integrações pessoais: ${method} ${template}`
    );
  }
  const profileRoutes = profile.name === "private"
    ? [...ROUTE_SAMPLES, ...PERSONAL_LIBRARY_ROUTE_SAMPLES]
    : [...ROUTE_SAMPLES, ...CATALOG_ROUTE_SAMPLES];
  const expectedRoutes = [
    ...profileRoutes
    .filter(({ template }) => template !== "/v1/imports")
    .map((sample) => ({
      ...sample,
      template: `/functions/v1/aralearn-authoring-api${sample.template}`,
      operationId: sample.template === "/v1/runs/{runId}/publish"
        ? profile.completionOperationId
        : sample.operationId
    }))
  ];
  assertRouteParity(routes, expectedRoutes, `Action ${profile.name}`);
  assert.match(text, new RegExp(`enum:\\s*(?:\\[\\s*)?-?\\s*${profile.target}`, "u"));
  if (profile.name === "private") {
    assert.doesNotMatch(text, /\bcatalog\b|catálogo|publicarCursoNoCatalogo|UUID da coleção/iu);
  } else {
    assert.doesNotMatch(text, /concluirCursoPessoal/u);
  }
}
const importBlock = yamlPathBlock(openApiText, "/v1/imports");
assert.match(importBlock, /security:\s*\r?\n\s+- SupabaseBearer: \[\]/);
assert.doesNotMatch(importBlock, /AuthoringApiKey/, "A importação integral não pode aceitar chave de autoria.");
const publishBlock = yamlPathBlock(openApiText, "/v1/runs/{runId}/publish");
assert.match(publishBlock, /["']202["']:/);
assert.match(publishBlock, /status accepted ou running/);
assert.match(publishBlock, /mesmo requestId/);
assert.match(publishBlock, /pollAfterSeconds/);
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
const copilotDefinitions = copilotOpenApi.definitions;
assert.equal(copilotDefinitions.PlanRequest.properties.plan.$ref, "#/definitions/CoursePlan");
assert.ok(copilotDefinitions.CoursePlan.required.includes("parts"));
assert.ok(copilotDefinitions.CoursePlan.required.includes("operations"));
assert.ok(copilotDefinitions.CoursePlan.required.includes("misconceptions"));
assert.ok(copilotDefinitions.PlanCourse.required.includes("language"));
assert.ok(copilotDefinitions.PlanCourse.required.includes("prerequisites"));
assert.ok(copilotDefinitions.PartOutline.required.includes("ownership"));
assert.ok(copilotDefinitions.PartOutline.required.includes("conceptIds"));
assert.ok(copilotDefinitions.PartOutline.required.includes("operationIds"));
assert.ok(copilotDefinitions.PartOutline.required.includes("misconceptionIds"));
assert.equal(copilotDefinitions.LedgerChunkRequest.properties.items.items.$ref, "#/definitions/LedgerItem");
assert.equal(
  copilotDefinitions.PartSpecificationRequest.properties.specification.$ref,
  "#/definitions/PartSpecification"
);
assert.ok(copilotDefinitions.PartSpecification.required.includes("cardPlan"));
assert.ok(copilotDefinitions.PartSpecification.required.includes("conceptIds"));
assert.ok(copilotDefinitions.PartSpecification.required.includes("operationIds"));
assert.ok(copilotDefinitions.PartSpecification.required.includes("misconceptionIds"));
assert.ok(copilotDefinitions.CardPlanItem.required.includes("operationId"));
assert.ok(copilotDefinitions.CardPlanItem.required.includes("conceptIds"));
assert.ok(copilotDefinitions.CardPlanItem.required.includes("retrievedConceptIds"));
assert.ok(copilotDefinitions.CardPlanItem.required.includes("misconceptionIds"));
assert.ok(copilotDefinitions.CardPlanItem.required.includes("contextAnchors"));
assert.ok(copilotDefinitions.MicrosequenceSpecification.properties.dependencyRationale);
assert.equal(copilotDefinitions.PartRequest.properties.fragment.$ref, "#/definitions/PartFragment");
assert.equal(copilotDefinitions.PartRequest.properties.stateDelta.$ref, "#/definitions/StateDelta");
assert.equal(copilotDefinitions.PartCard.additionalProperties, false);
for (const field of [
  "rows", "structure", "nodes", "vertices", "edges", "leftSet", "rightSet",
  "relations", "values", "sequence", "vector", "expression", "blocks", "gaps"
]) {
  assert.ok(
    Object.hasOwn(copilotDefinitions.PartCard.properties, field),
    `O contrato do Microsoft 365 não expõe PartCard.${field}.`
  );
}
assert.deepEqual(
  copilotDefinitions.StateDelta.required,
  ["introducedTermIds", "usedClaimIds", "coveredOutcomeIds", "resolvedErrorIds", "notes"]
);
assertRouteParity(
  parseSwaggerRoutes(copilotOpenApi),
  ROUTE_SAMPLES.filter(({ template }) => template !== "/v1/imports"),
  "OpenAPI do Microsoft 365"
);
assert.equal(Object.hasOwn(copilotOpenApi.paths, "/v1/imports"), false);
assert.deepEqual(Object.keys(copilotOpenApi.securityDefinitions || {}), ["AuthoringApiKey"]);
const copilotPublish = copilotOpenApi.paths["/v1/runs/{runId}/publish"].post;
assert.ok(copilotPublish.responses["202"]);
assert.match(copilotPublish.description, /status accepted ou running/);
assert.match(copilotPublish.description, /mesmo requestId/);
assert.match(copilotPublish.description, /pollAfterSeconds/);
const chatGptKnowledgeManifest = JSON.parse(await readFile(CHATGPT_KNOWLEDGE_MANIFEST, "utf8"));
assert.equal(chatGptKnowledgeManifest.artifact, "aralearn.chatgpt-knowledge-files");
assert.equal(chatGptKnowledgeManifest.version, 1);
assert.ok(chatGptKnowledgeManifest.files.length > 0);
assert.ok(chatGptKnowledgeManifest.files.length <= 20, "O GPT excede o limite de 20 arquivos de conhecimento.");
const chatGptSetup = await readFile(CHATGPT_SETUP_PATH, "utf8");
assert.match(chatGptSetup, new RegExp(PRIVACY_POLICY_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(chatGptSetup, /-Profile private/u);
assert.match(chatGptSetup, /-Profile editorial/u);
assert.match(chatGptSetup, /perfil pessoal não consegue publicar no catálogo/u);
assert.match(chatGptSetup, /OAuth/);

execFileSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT, stdio: "inherit" });
const firstManifest = JSON.parse(await readFile(path.join(OUTPUT_ROOT, "manifest.json"), "utf8"));
const expectedDownloadFiles = [
  "aralearn-authoring-core.zip",
  ...PLATFORMS.map((platform) => `aralearn-authoring-${platform}.zip`),
  "aralearn-chatgpt-system-prompt.md",
  "aralearn-chatgpt-knowledge.md",
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
  if (archive.file === "aralearn-authoring-chatgpt.zip") {
    assert.match(archiveText, /Padrões de autoria por área/u);
    assert.match(archiveText, /Programação, bancos de dados e automação/u);
    assert.match(archiveText, /Idiomas, linguística e sistemas de escrita/u);
    assert.match(archiveText, /Auditoria semântica dos cards/u);
    assert.match(archiveText, /crases só representam código, comando, identificador, literal, sintaxe ou/iu);
  }
  assert.doesNotMatch(archiveText, /sb_secret_[A-Za-z0-9._-]{12,}/);
  assert.doesNotMatch(archiveText, /arl_[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(archiveText, /postgres(?:ql)?:\/\/[^\s]+/i);
  assert.doesNotMatch(archiveText, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  assert.match(archiveText, /status(?::| )(?:accepted ou running|publishing)/);
  assert.match(archiveText, /mesmo `?requestId`?/);
  assert.match(archiveText, /pollAfterSeconds/);
  assert.match(archiveText, /revis(?:ão|ões) (?:JSON )?imutáve/iu);
  assert.match(archiveText, /sem conhecimentos prévios/u);
  assert.match(archiveText, /Dados voláteis aparecem no próprio card/u);
  assert.match(archiveText, /doze recursos do contrato v3/u);
  assert.match(archiveText, /Não use travessão/u);
  assert.match(archiveText, /validação integral[\s\S]*confirmação do autor[\s\S]*permissão editorial/u);
  assert.match(archiveText, /Laço orientado pelo estado persistido/u);
  assert.match(archiveText, /entrega[\s\S]{0,240}aprovação explícita/iu);
  assert.match(archiveText, /resposta perdida[\s\S]*mesmo identificador/u);
  assert.match(archiveText, /novo chat não é requisito/u);
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
  const packagedChatGptOpenApis = new Map(
    CHATGPT_OPENAPI_PROFILES.map((profile) => [
      profile.name,
      entries.find(
        (entry) => entry.name === `aralearn-authoring/docs/openapi/${profile.fileName}`
      )?.content.toString("utf8")
    ])
  );
  const packagedCopilotOpenApi = entries.find(
    (entry) => entry.name === "aralearn-authoring/docs/openapi/aralearn-authoring-api-copilot-v2.json"
  )?.content.toString("utf8");
  if (archive.platform === "chatgpt") {
    assert.equal(packagedOpenApi, undefined, "O pacote ChatGPT deve usar o OpenAPI próprio.");
    for (const profile of CHATGPT_OPENAPI_PROFILES) {
      const packagedChatGptOpenApi = packagedChatGptOpenApis.get(profile.name);
      assert.ok(packagedChatGptOpenApi, `OpenAPI ${profile.name} ausente em ${archive.file}`);
      const document = parse(packagedChatGptOpenApi);
      assert.equal(document.openapi, "3.1.0");
      assert.equal(document.servers[0].url, "https://seu-projeto.supabase.co");
      assert.equal(document.components.securitySchemes.AuthoringApiKey.name, "X-AraLearn-API-Key");
      const createSchema = document.paths[
        "/functions/v1/aralearn-authoring-api/v1/runs"
      ].post.requestBody.content["application/json"].schema;
      assert.deepEqual(createSchema.properties.target.enum, [profile.target]);
      assert.ok(createSchema.required.includes("publicationIntent"));
      if (profile.name === "private") {
        assert.deepEqual(createSchema.properties.publicationIntent.properties.mode.enum, ["create"]);
        assert.equal(Object.hasOwn(createSchema.properties, "collectionId"), false);
        assert.equal(
          Object.hasOwn(createSchema.properties.publicationIntent.properties, "existingCourseId"),
          false
        );
        assert.equal(
          Object.hasOwn(createSchema.properties.publicationIntent.properties, "expectedContentHash"),
          false
        );
      } else {
        assert.deepEqual(
          createSchema.properties.publicationIntent.properties.mode.enum,
          ["create", "update"]
        );
      }
      assert.doesNotMatch(packagedChatGptOpenApi, /\$ref:|\{projectRef\}|\/v1\/imports|SupabaseBearer/);
      const packagedProfileRoutes = profile.name === "private"
        ? [...ROUTE_SAMPLES, ...PERSONAL_LIBRARY_ROUTE_SAMPLES]
        : [...ROUTE_SAMPLES, ...CATALOG_ROUTE_SAMPLES];
      const expectedChatGptRoutes = [
        ...packagedProfileRoutes
        .filter(({ template }) => template !== "/v1/imports")
        .map((sample) => ({
          ...sample,
          template: `/functions/v1/aralearn-authoring-api${sample.template}`,
          operationId: sample.template === "/v1/runs/{runId}/publish"
            ? profile.completionOperationId
            : sample.operationId
        }))
      ];
      assertRouteParity(
        parseYamlRoutes(packagedChatGptOpenApi),
        expectedChatGptRoutes,
        `Pacote ChatGPT ${profile.name}`
      );
    }
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
    assert.match(packagedPublish.description, /status accepted ou running/);
  } else {
    assert.ok(packagedOpenApi, `OpenAPI ausente em ${archive.file}`);
    assert.equal(packagedCopilotOpenApi, undefined, `OpenAPI do Microsoft 365 incluído indevidamente em ${archive.file}`);
    assertRouteParity(
      parseYamlRoutes(packagedOpenApi),
      [
        ...CATALOG_ROUTE_SAMPLES,
        ...PERSONAL_LIBRARY_ROUTE_SAMPLES,
        ...PRIVATE_INTEGRATION_ROUTE_SAMPLES,
        ...ROUTE_SAMPLES
      ],
      `Pacote ${archive.platform || "comum"}`
    );
    const packagedPublish = yamlPathBlock(packagedOpenApi, "/v1/runs/{runId}/publish");
    assert.match(packagedPublish, /["']202["']:/);
    assert.match(packagedPublish, /status accepted ou running/);
  }
  if (archive.platform === "chatgpt") {
    for (const recommended of chatGptKnowledgeManifest.files) {
      assert.ok(names.includes(`aralearn-authoring/${recommended}`), `Conhecimento ausente: ${recommended}`);
    }
    assert.match(archiveText, new RegExp(PRIVACY_POLICY_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(archiveText, /perfil pessoal não consegue publicar no catálogo/u);
    assert.ok(
      names.includes("aralearn-authoring/platforms/chatgpt/prepareChatGptAction.ps1"),
      "O pacote ChatGPT inclui o preparador da Action"
    );
    for (const template of CHATGPT_ACTION_TEMPLATES) {
      assert.ok(
        names.includes(`aralearn-authoring/docs/openapi/${template}`),
        `Modelo da Action ausente: ${template}`
      );
    }
  } else if (archive.platform !== "microsoft-365") {
    assert.match(packagedOpenApi, /SupabaseBearer/);
  }
  if (archive.platform === "chatgpt") {
    for (const profile of CHATGPT_OPENAPI_PROFILES) {
      if (!await exists(profile.absolutePath)) continue;
      assert.ok(names.includes(`aralearn-authoring/docs/openapi/${profile.fileName}`));
    }
  } else if (archive.platform !== "microsoft-365" && await exists(OPENAPI_PATH)) {
    assert.ok(names.includes("aralearn-authoring/docs/openapi/aralearn-authoring-api.yaml"));
  }
}

assert.deepEqual(
  secondManifest.archives.map((archive) => archive.platform).filter(Boolean),
  PLATFORMS
);

console.log("Pacotes de autoria: conteúdo, hashes, determinismo e ausência de segredos aprovados.");
