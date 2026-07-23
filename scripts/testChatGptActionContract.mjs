import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";
import {
  buildCompactPrivateActionDocument,
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
const COMPACT_PRIVATE_JSON_PATH = path.join(
  ROOT,
  "docs",
  "openapi",
  "aralearn-authoring-api-chatgpt-private-action.json"
);
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
  ["gravarPlanoDeAutoria", planEnvelope, "plan.course.prerequisites"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.course.include"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.course.exclude"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.course.notation"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.learningOutcomes.0.evidence"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.operations"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.operations.0.evidence"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.misconceptions"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.conceptMap"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.conceptMap.concepts"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.parts.0.ownership"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.parts.0.conceptIds"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.parts.0.operationIds"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.parts.0.misconceptionIds"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.project.courses.0.modules.0.guide.goal"],
  ["gravarPlanoDeAutoria", planEnvelope, "plan.project.courses.0.modules.0.lessons.0.guide.goal"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.ownership"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.conceptIds"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.operationIds"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.misconceptionIds"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.structure.microsequences.0.dependencyRationale"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.cardPlan.0.learningFunction"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.cardPlan.0.outcomeIds"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.cardPlan.0.operationId"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.cardPlan.0.conceptIds"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.cardPlan.0.retrievedConceptIds"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.cardPlan.0.misconceptionIds"],
  ["gravarEspecificacaoDaParte", partSpecification, "specification.cardPlan.0.contextAnchors"],
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
const compactPersonalPath = path.join(
  ROOT,
  "docs",
  "openapi",
  "aralearn-authoring-api-chatgpt-private-action.yaml"
);
const generalPath = path.join(
  ROOT,
  "docs",
  "openapi",
  "aralearn-authoring-api.yaml"
);
const cardSchemaReference = "../../authoring/schemas/card.schema.json";
const [editorialDocument, generalDocument, cardSchema] = await Promise.all([
  readFile(editorialPath, "utf8").then(parse),
  readFile(generalPath, "utf8").then(parse),
  readFile(
    path.join(ROOT, "authoring", "schemas", "card.schema.json"),
    "utf8"
  ).then(JSON.parse)
]);
const externalDocuments = new Map([[cardSchemaReference, cardSchema]]);
const generalAjv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false
});
const validateGeneralCreateRun = generalAjv.compile({
  $ref: "#/components/schemas/CreateRunRequest",
  components: generalDocument.components
});
const validGeneralPrivateRun = {
  ...createRunBase,
  target: "private"
};
assert.equal(
  validateGeneralCreateRun(validGeneralPrivateRun),
  true,
  `O OpenAPI geral rejeitou execução privada válida: ${formatErrors(validateGeneralCreateRun)}`
);
assert.equal(
  validateGeneralCreateRun({
    ...validGeneralPrivateRun,
    collectionId: RUN_ID
  }),
  false,
  "O OpenAPI geral aceitou coleção editorial em execução privada."
);
assert.equal(
  validateGeneralCreateRun({
    ...validGeneralPrivateRun,
    publicationIntent: {
      mode: "update",
      existingCourseId: RUN_ID,
      expectedContentHash: "a".repeat(64)
    }
  }),
  false,
  "O OpenAPI geral aceitou atualização editorial em execução privada."
);
assert.equal(
  validateGeneralCreateRun({
    ...validGeneralPrivateRun,
    title: "   "
  }),
  false,
  "O OpenAPI geral aceitou título vazio."
);
const specifyInstruction = generalDocument.components.schemas.SpecifyPartInstruction;
const buildInstruction = generalDocument.components.schemas.BuildPartInstruction;
for (const field of [
  "conceptIds",
  "operationIds",
  "misconceptionIds",
  "concepts",
  "conceptRelations",
  "operations",
  "misconceptions"
]) {
  assert.ok(
    specifyInstruction.required.includes(field)
      && Object.hasOwn(specifyInstruction.properties, field),
    `SpecifyPartInstruction não descreve ${field}.`
  );
  assert.ok(
    buildInstruction.required.includes(field)
      && Object.hasOwn(buildInstruction.properties, field),
    `BuildPartInstruction não descreve ${field}.`
  );
}
assert.ok(
  buildInstruction.required.includes("dependsOnPartKeys")
    && Object.hasOwn(buildInstruction.properties, "dependsOnPartKeys"),
  "BuildPartInstruction não descreve dependsOnPartKeys."
);
assert.ok(
  buildInstruction.properties.continuity.required.includes("introducedConcepts")
    && Object.hasOwn(
      buildInstruction.properties.continuity.properties,
      "introducedConcepts"
    ),
  "BuildPartInstruction não descreve a continuidade conceitual."
);
assert.equal(
  await readFile(personalPath, "utf8"),
  serializeActionDocument(
    buildPrivateActionDocument(
      editorialDocument,
      generalDocument,
      externalDocuments
    )
  ),
  "O perfil pessoal gerado está desatualizado."
);
const compactPersonalSource = await readFile(compactPersonalPath, "utf8");
const compactPersonalDocument = parse(compactPersonalSource);
const compactPersonalJsonDocument = JSON.parse(
  await readFile(COMPACT_PRIVATE_JSON_PATH, "utf8")
);
assert.equal(
  compactPersonalSource,
  serializeActionDocument(buildCompactPrivateActionDocument(generalDocument)),
  "O perfil compacto da Action está desatualizado."
);
assert.deepEqual(
  compactPersonalJsonDocument,
  buildCompactPrivateActionDocument(generalDocument),
  "A versão JSON da Action pessoal está desatualizada."
);
assert.equal(compactPersonalDocument.openapi, "3.1.0");
assert.ok(
  operations(compactPersonalDocument).length <= 30,
  "O perfil compacto não pode exceder 30 operações."
);
assert.ok(
  Buffer.byteLength(compactPersonalSource, "utf8") < 100_000,
  "O perfil compacto excede o tamanho seguro para o editor de Actions."
);
assert.doesNotMatch(
  compactPersonalSource,
  /\n\s+value:\s+\{\}\s*$/mu,
  "O perfil compacto não pode declarar objetos vazios que o editor de Actions rejeita."
);
assert.ok(
  compactPersonalDocument.paths[
    "/functions/v1/aralearn-authoring-api/v1/runs/{runId}/parts/{partKey}"
  ].put.requestBody.content["application/json"].schema.properties.evidence,
  "O perfil compacto precisa expor evidence ao gravar uma parte."
);
assert.ok(
  Object.keys(compactPersonalDocument.paths).some((routePath) => routePath.includes("/library/revisions/{revisionId}/apply")),
  "O perfil pessoal precisa expor a aplicação de correções pontuais."
);
for (const { operation } of operations(compactPersonalDocument)) {
  const schema = operation.requestBody?.content?.["application/json"]?.schema;
  if (schema) inspectObjectSchemas(schema, `${operation.operationId}.requestBody`);
}

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
  assert.equal(seenOperationIds.has("listarRecursosDeCard"), true);
  assert.equal(seenOperationIds.has("consultarRecursoDeCard"), true);
  assert.doesNotMatch(actionSource, /singlePracticeRationale/u);
  assert.match(actionSource, /\{gap:id\}/u);
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
  const partValidator = validators.get("gravarParteDoCurso");
  const fragmentWithUnknownRootField = structuredClone(actionPart);
  fragmentWithUnknownRootField.fragment.html = "<p>fora do contrato</p>";
  assert.equal(
    partValidator(fragmentWithUnknownRootField),
    false,
    `A Action ${profile.name} aceitou campo estranho na raiz do fragmento.`
  );
  const fragmentWithUnknownMicrosequenceField = structuredClone(actionPart);
  fragmentWithUnknownMicrosequenceField.fragment.microsequences[0].layout = "livre";
  assert.equal(
    partValidator(fragmentWithUnknownMicrosequenceField),
    false,
    `A Action ${profile.name} aceitou campo estranho na microssequência.`
  );
  const evidenceWithUnknownField = structuredClone(actionPart);
  evidenceWithUnknownField.evidence = [{ sourceId: "source-01", note: "descartada" }];
  assert.equal(
    partValidator(evidenceWithUnknownField),
    false,
    `A Action ${profile.name} aceitou campo de evidência que seria descartado.`
  );
  const planValidator = validators.get("gravarPlanoDeAutoria");
  const invalidLanguagePlan = structuredClone(planEnvelope);
  invalidLanguagePlan.plan.course.language = "pt_BR";
  assert.equal(
    planValidator(invalidLanguagePlan),
    false,
    `A Action ${profile.name} aceitou idioma fora de BCP 47.`
  );
  const inconsistentLedgerManifest = structuredClone(planEnvelope);
  inconsistentLedgerManifest.plan.ledgerManifest.sections.sources = {
    chunkCount: 0,
    itemCount: 1
  };
  assert.equal(
    planValidator(inconsistentLedgerManifest),
    false,
    `A Action ${profile.name} aceitou manifesto vazio com itens declarados.`
  );
  const malformedProjectTopic = structuredClone(planEnvelope);
  malformedProjectTopic.plan.project.courses[0].modules[0].lessons[0].topics = [
    { label: "Tema" }
  ];
  assert.equal(
    planValidator(malformedProjectTopic),
    false,
    `A Action ${profile.name} aceitou topic incompleto no projeto v3.`
  );
  const malformedProjectGuide = structuredClone(planEnvelope);
  delete malformedProjectGuide.plan.project.courses[0].modules[0].guide.avoid;
  assert.equal(
    planValidator(malformedProjectGuide),
    false,
    `A Action ${profile.name} aceitou guide incompleto no projeto v3.`
  );
  const nonCanonicalPrerequisite = structuredClone(planEnvelope);
  nonCanonicalPrerequisite.plan.course.prerequisites = [" requisito "];
  assert.equal(
    planValidator(nonCanonicalPrerequisite),
    false,
    `A Action ${profile.name} aceitou espaços nas extremidades de lista estrutural.`
  );
  const ledgerValidator = validators.get("gravarTrechoDoRegistro");
  const volatileSourceWithoutAccessDate = structuredClone(sourceChunk);
  volatileSourceWithoutAccessDate.items[0].stability = "volatile";
  delete volatileSourceWithoutAccessDate.items[0].accessedOn;
  assert.equal(
    ledgerValidator(volatileSourceWithoutAccessDate),
    false,
    `A Action ${profile.name} aceitou fonte volátil sem accessedOn.`
  );
  const specificationValidator = validators.get("gravarEspecificacaoDaParte");
  const codeLanguageOnParagraph = structuredClone(partSpecification);
  codeLanguageOnParagraph.specification.cardPlan[0].codeLanguage = "javascript";
  assert.equal(
    specificationValidator(codeLanguageOnParagraph),
    false,
    `A Action ${profile.name} aceitou codeLanguage em paragraph.`
  );
  const codeWithoutLanguage = structuredClone(partSpecification);
  codeWithoutLanguage.specification.cardPlan[0].resource = "code";
  assert.equal(
    specificationValidator(codeWithoutLanguage),
    false,
    `A Action ${profile.name} aceitou code sem codeLanguage.`
  );
  const formulaWithoutNotation = structuredClone(partSpecification);
  formulaWithoutNotation.specification.cardPlan[0].resource = "formula";
  assert.equal(
    specificationValidator(formulaWithoutNotation),
    false,
    `A Action ${profile.name} aceitou formula sem notation.`
  );
  const practiceFunctionOnTheory = structuredClone(partSpecification);
  practiceFunctionOnTheory.specification.cardPlan[0].learningFunction = "independent_practice";
  assert.equal(
    specificationValidator(practiceFunctionOnTheory),
    false,
    `A Action ${profile.name} aceitou função de prática em card teórico.`
  );
  const diagnosisWithoutMisconception = structuredClone(partSpecification);
  diagnosisWithoutMisconception.specification.cardPlan[1].learningFunction = "error_diagnosis";
  diagnosisWithoutMisconception.specification.cardPlan[1].misconceptionIds = [];
  assert.equal(
    specificationValidator(diagnosisWithoutMisconception),
    false,
    `A Action ${profile.name} aceitou diagnóstico de erro sem misconceptionIds.`
  );
  const exerciseWithoutTargetError = structuredClone(partSpecification);
  delete exerciseWithoutTargetError.specification.cardPlan[1].targetError;
  assert.equal(
    specificationValidator(exerciseWithoutTargetError),
    false,
    `A Action ${profile.name} aceitou prática sem targetError.`
  );
  const nonCanonicalContextAnchor = structuredClone(partSpecification);
  nonCanonicalContextAnchor.specification.cardPlan[1].contextAnchors = [" P e Q "];
  assert.equal(
    specificationValidator(nonCanonicalContextAnchor),
    false,
    `A Action ${profile.name} aceitou espaços nas extremidades de contextAnchors.`
  );
  const ninthPartAttempt = structuredClone(actionPart);
  ninthPartAttempt.attempt = 9;
  assert.equal(
    partValidator(ninthPartAttempt),
    false,
    `A Action ${profile.name} aceitou a nona tentativa de construção.`
  );
  const ninthAuditAttempt = structuredClone(actionAudit);
  ninthAuditAttempt.attempt = 9;
  assert.equal(
    validators.get("auditarParteDoCurso")(ninthAuditAttempt),
    false,
    `A Action ${profile.name} aceitou a nona tentativa de auditoria.`
  );
  const ninthReopenAttempt = structuredClone(actionReopen);
  ninthReopenAttempt.attempt = 9;
  assert.equal(
    validators.get("reabrirParteDoCurso")(ninthReopenAttempt),
    false,
    `A Action ${profile.name} aceitou a nona tentativa de reabertura.`
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
  plan: { ...plan, ledger },
  parts: [],
  continuity: {
    dependencyMicrosequenceIds: [],
    workedOperations: [],
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
