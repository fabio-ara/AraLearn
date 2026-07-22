import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";
import {
  buildPrivateActionDocument,
  serializeActionDocument
} from "./buildChatGptActionProfiles.mjs";
import {
  validateAuditPayload,
  validateBlockPayload,
  validateCancelRunPayload,
  validateCreateRunPayload,
  validateFinalizePlanPayload,
  validateLedgerChunkPayload,
  validatePartPayload,
  validatePartSpecificationPayload,
  validatePlanPayload,
  validateReopenPartPayload,
  validateResumePayload,
  validateSimpleCommandPayload
} from "../supabase/functions/_shared/aralearn-authoring/protocol.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const ACTION_PROFILES = [
  {
    name: "pessoal",
    fileName: "aralearn-authoring-api-chatgpt-private.yaml",
    target: "private",
    completionOperationId: "concluirCursoPessoal",
    forbiddenOperationId: "publicarCursoNoCatalogo"
  },
  {
    name: "editorial",
    fileName: "aralearn-authoring-api-chatgpt-editorial.yaml",
    target: "catalog",
    completionOperationId: "publicarCursoNoCatalogo",
    forbiddenOperationId: "concluirCursoPessoal"
  }
];
const EXAMPLES = path.join(ROOT, "authoring", "examples");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PART_KEY = "part-conjuncao";
const METHODS = ["get", "post", "put", "patch", "delete"];

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(EXAMPLES, relativePath), "utf8"));
}

function without(value, fields) {
  return Object.fromEntries(
    Object.entries(value).filter(([field]) => !fields.includes(field))
  );
}

function requestSchema(document, operationId) {
  for (const pathItem of Object.values(document.paths || {})) {
    for (const method of METHODS) {
      const operation = pathItem?.[method];
      if (operation?.operationId !== operationId) continue;
      return operation.requestBody?.content?.["application/json"]?.schema || null;
    }
  }
  throw new Error(`Operação ausente na Action: ${operationId}.`);
}

function operations(document) {
  const result = [];
  for (const [routePath, pathItem] of Object.entries(document.paths || {})) {
    for (const method of METHODS) {
      const operation = pathItem?.[method];
      if (operation) result.push({ routePath, method, operation });
    }
  }
  return result;
}

function inspectObjectSchemas(schema, location) {
  if (!schema || typeof schema !== "object") return;
  assert.ok(!("$ref" in schema), `${location} não pode depender de $ref no editor de Actions.`);
  if (schema.type === "object") {
    assert.ok(
      schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties),
      `${location} deve declarar properties.`
    );
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key === "example" || key === "examples") continue;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => inspectObjectSchemas(entry, `${location}.${key}[${index}]`));
    } else if (value && typeof value === "object") {
      inspectObjectSchemas(value, `${location}.${key}`);
    }
  }
}

function removeAtPath(value, dottedPath) {
  const clone = structuredClone(value);
  const segments = dottedPath.split(".");
  let cursor = clone;
  for (const segment of segments.slice(0, -1)) {
    cursor = /^\d+$/.test(segment) ? cursor[Number(segment)] : cursor[segment];
  }
  delete cursor[segments.at(-1)];
  return clone;
}

function formatErrors(validate) {
  return (validate.errors || [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

const plan = await readJson("02-plan.json");
const sourceChunk = await readJson("03-ledger-sources-chunk.json");
const claimChunk = await readJson("04-ledger-claims-chunk.json");
const termChunk = await readJson("05-ledger-terms-chunk.json");
const finalizePlan = await readJson("06-plan-finalize.json");
const partSpecification = await readJson("07-part-specification.json");
const partSubmission = await readJson("09-part-submission.json");
const audit = await readJson("10-audit.json");
const reopen = await readJson("alternatives/reopen.json");
const resume = await readJson("alternatives/resume.json");
const cancel = await readJson("alternatives/cancel.json");

const createRunBase = {
  requestId: "create-run-0001",
  title: plan.course.title,
  contractKey: plan.course.id,
  brief: {
    audience: plan.course.audience,
    language: plan.course.language,
    depth: plan.course.depth,
    objective: plan.course.goal,
    scope: plan.course.include,
    exclusions: plan.course.exclude
  },
  publicationIntent: { mode: "create" }
};
const planEnvelope = { requestId: "plan-request-0001", plan };
const block = {
  requestId: "block-run-0001",
  reason: "A fonte necessária não foi fornecida.",
  questions: ["Qual material deve fundamentar esta parte?"],
  partKey: PART_KEY
};
const simple = { requestId: "simple-command-0001" };
const actionPart = without(partSubmission, ["runId", "partKey"]);
const actionAudit = without(audit, ["runId", "partKey"]);
const actionReopen = without(reopen, ["runId", "partKey"]);
const repairAudit = {
  ...actionAudit,
  requestId: "audit-conjuncao-repair-0001",
  decision: "repair",
  gates: { ...actionAudit.gates, feedback: false },
  findings: reopen.findings,
  instructions: "Corrija somente o feedback indicado."
};

const historicalRequiredFields = [
  ["criarExecucaoDeAutoria", null, "publicationIntent"],
  ["criarExecucaoDeAutoria", null, "publicationIntent.mode"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.artifact"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.project"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.course"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.learningOutcomes.0.evidence"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.conceptMap"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.conceptMap.concepts"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.parts.0.ownership"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.project.courses.0.modules.0.guide.goal"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.project.courses.0.modules.0.lessons.0.guide.goal"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.ownership"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.structure.microsequences.0.dependencyRationale"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.cardPlan.0.learningFunction"],
  ["gravarParteDoCurso", actionPart, "stateDelta.introducedTermIds"],
  ["auditarParteDoCurso", actionAudit, "gates.planAlignment"],
  ["auditarParteDoCurso", repairAudit, "findings.0.issueId"],
  ["reabrirParteDoCurso", actionReopen, "findings.0.acceptanceTest"]
];

const editorialPath = path.join(
  ROOT,
  "docs",
  "openapi",
  "aralearn-authoring-api-chatgpt-editorial.yaml"
);
const personalPath = path.join(
  ROOT,
  "docs",
  "openapi",
  "aralearn-authoring-api-chatgpt-private.yaml"
);
const editorialDocument = parse(await readFile(editorialPath, "utf8"));
assert.equal(
  await readFile(personalPath, "utf8"),
  serializeActionDocument(buildPrivateActionDocument(editorialDocument)),
  "O perfil pessoal gerado está desatualizado."
);

let totalOperations = 0;
let totalCases = 0;
for (const profile of ACTION_PROFILES) {
  const actionPath = path.join(ROOT, "docs", "openapi", profile.fileName);
  const actionSource = await readFile(actionPath, "utf8");
  const document = parse(actionSource);
  assert.equal(document.openapi, "3.1.0", `A Action ${profile.name} deve usar OpenAPI 3.1.0.`);
  assert.ok(document.components?.schemas && typeof document.components.schemas === "object");

  const seenOperationIds = new Set();
  for (const { routePath, method, operation } of operations(document)) {
    assert.ok(operation.operationId, `${method.toUpperCase()} ${routePath} não tem operationId.`);
    assert.ok(!seenOperationIds.has(operation.operationId), `operationId duplicado: ${operation.operationId}.`);
    seenOperationIds.add(operation.operationId);
    assert.ok((operation.summary || "").length <= 300, `${operation.operationId} excede 300 caracteres.`);

    const placeholders = [...routePath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
    const pathParameters = (operation.parameters || []).filter((parameter) => parameter.in === "path");
    const names = pathParameters.map((parameter) => parameter.name);
    assert.deepEqual([...new Set(names)], names, `${operation.operationId} repete parâmetro de caminho.`);
    assert.deepEqual([...names].sort(), [...placeholders].sort(), `${operation.operationId} diverge da URL.`);

    const schema = operation.requestBody?.content?.["application/json"]?.schema;
    if (schema) {
      inspectObjectSchemas(schema, `${operation.operationId}.requestBody`);
      for (const name of placeholders) {
        assert.ok(
          !Object.hasOwn(schema.properties || {}, name),
          `${operation.operationId} não deve repetir ${name} no corpo.`
        );
      }
    }
  }
  assert.equal(seenOperationIds.has(profile.completionOperationId), true);
  assert.equal(seenOperationIds.has(profile.forbiddenOperationId), false);
  if (profile.target === "private") {
    assert.doesNotMatch(
      actionSource,
      /\bcatalog\b|catálogo/iu,
      "A Action pessoal expõe um destino editorial."
    );
  }

  const createRun = { ...createRunBase, target: profile.target };
  const actionCases = [
    ["criarExecucaoDeAutoria", createRun],
    ["gravarPlanoDeAutoria", planEnvelope],
    ["gravarTrechoDoRegistro", sourceChunk],
    ["gravarTrechoDoRegistro", claimChunk],
    ["gravarTrechoDoRegistro", termChunk],
    ["finalizarPlanoDeAutoria", finalizePlan],
    ["gravarEspecificacaoDaParte", partSpecification],
    ["gravarParteDoCurso", actionPart],
    ["auditarParteDoCurso", actionAudit],
    ["auditarParteDoCurso", repairAudit],
    ["reabrirParteDoCurso", actionReopen],
    ["validarCursoProduzido", simple],
    [profile.completionOperationId, simple],
    ["bloquearExecucaoDeAutoria", block],
    ["retomarExecucaoDeAutoria", resume],
    ["cancelarExecucaoDeAutoria", cancel]
  ];
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validators = new Map();
  for (const [operationId, body] of actionCases) {
    let validate = validators.get(operationId);
    if (!validate) {
      validate = ajv.compile(requestSchema(document, operationId));
      validators.set(operationId, validate);
    }
    assert.ok(validate(body), `${profile.name}/${operationId} rejeitou o exemplo: ${formatErrors(validate)}`);
    const required = requestSchema(document, operationId).required || [];
    for (const field of required) {
      const invalid = structuredClone(body);
      delete invalid[field];
      assert.equal(validate(invalid), false, `${profile.name}/${operationId} aceitou corpo sem ${field}.`);
    }
  }
  for (const [operationId, bodyTemplate, fieldPath] of historicalRequiredFields) {
    const validate = validators.get(operationId);
    const body = bodyTemplate || createRun;
    const invalid = removeAtPath(body, fieldPath);
    assert.equal(
      validate(invalid),
      false,
      `${profile.name}/${operationId} ainda aceita a ausência de ${fieldPath}.`
    );
  }
  assert.equal(
    validators.get("gravarTrechoDoRegistro")({ ...sourceChunk, items: [] }),
    false,
    `A Action ${profile.name} não pode aceitar trecho vazio.`
  );
  const createValidator = validators.get("criarExecucaoDeAutoria");
  assert.equal(
    createValidator({ ...createRun, target: profile.target === "private" ? "catalog" : "private" }),
    false,
    `O perfil ${profile.name} aceitou o destino do outro perfil.`
  );
  if (profile.target === "private") {
    assert.equal(createValidator({ ...createRun, collectionId: RUN_ID }), false);
    assert.equal(
      createValidator({
        ...createRun,
        publicationIntent: {
          mode: "update",
          existingCourseId: RUN_ID,
          expectedContentHash: "a".repeat(64)
        }
      }),
      false,
      "O perfil pessoal aceitou atualização editorial."
    );
  }
  validateCreateRunPayload(createRun);
  totalOperations += seenOperationIds.size;
  totalCases += actionCases.length;
}

const preparationDirectory = await mkdtemp(path.join(os.tmpdir(), "aralearn-action-profiles-"));
try {
  for (const profile of ACTION_PROFILES) {
    const outputPath = path.join(preparationDirectory, `${profile.name}.yaml`);
    execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        path.join(ROOT, "scripts", "prepareChatGptAction.ps1"),
        "-ProjectUrl",
        "https://abcdefghijklmnopqrst.supabase.co",
        "-Profile",
        profile.target === "private" ? "private" : "editorial",
        "-OutputPath",
        outputPath
      ],
      { cwd: ROOT, stdio: "pipe" }
    );
    const prepared = parse(await readFile(outputPath, "utf8"));
    assert.equal(prepared.servers[0].url, "https://abcdefghijklmnopqrst.supabase.co");
    const schema = requestSchema(prepared, "criarExecucaoDeAutoria");
    assert.deepEqual(schema.properties.target.enum, [profile.target]);
    assert.equal(
      operations(prepared).some(({ operation }) => (
        operation.operationId === profile.completionOperationId
      )),
      true
    );
  }
  const defaultOutputPath = path.join(preparationDirectory, "default.yaml");
  execFileSync(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      path.join(ROOT, "scripts", "prepareChatGptAction.ps1"),
      "-ProjectUrl",
      "https://abcdefghijklmnopqrst.supabase.co",
      "-OutputPath",
      defaultOutputPath
    ],
    { cwd: ROOT, stdio: "pipe" }
  );
  const defaultDocument = parse(await readFile(defaultOutputPath, "utf8"));
  assert.deepEqual(
    requestSchema(defaultDocument, "criarExecucaoDeAutoria").properties.target.enum,
    ["private"],
    "O preparador deve escolher o perfil pessoal quando o perfil não for informado."
  );
} finally {
  await rm(preparationDirectory, { force: true, recursive: true });
}
validatePlanPayload(planEnvelope, RUN_ID);
validateLedgerChunkPayload(sourceChunk, { section: "sources", position: 0 });
validateLedgerChunkPayload(claimChunk, { section: "claims", position: 0 });
validateLedgerChunkPayload(termChunk, { section: "terms", position: 0 });
assert.throws(
  () => validateLedgerChunkPayload({ ...sourceChunk, items: [] }, { section: "sources", position: 0 }),
  /chunk do ledger é inválido/i
);
validateFinalizePlanPayload(finalizePlan);

const ledger = {
  sources: sourceChunk.items,
  claims: claimChunk.items,
  terms: termChunk.items
};
validatePartSpecificationPayload(partSpecification, { runId: RUN_ID, partKey: PART_KEY }, {
  nextPart: { partKey: PART_KEY, position: 0, outline: plan.parts[0] },
  plan: { project: plan.project, ledger },
  parts: [],
  continuity: {
    dependencyMicrosequenceIds: [],
    foundedMicrosequenceIds: [],
    stateDelta: { introducedTermIds: [] }
  }
});
validatePartPayload(partSubmission, { runId: RUN_ID, partKey: PART_KEY });
validateAuditPayload(audit, { runId: RUN_ID, partKey: PART_KEY });
validateAuditPayload(
  { ...repairAudit, runId: RUN_ID, partKey: PART_KEY },
  { runId: RUN_ID, partKey: PART_KEY }
);
validateReopenPartPayload(reopen, { runId: RUN_ID, partKey: PART_KEY });
validateSimpleCommandPayload(simple);
validateBlockPayload(block);
validateResumePayload(resume);
validateCancelRunPayload(cancel);

console.log(
  `Contratos das Actions: ${ACTION_PROFILES.length} perfis, ${totalOperations} operações e ${totalCases} corpos representativos aprovados.`
);
