import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse as parseYaml } from "yaml";
import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  mapAuthoringMcpToolCall
} from "../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "docs", "downloads", "authoring");
const CHATGPT_INSTRUCTIONS_MAX_CHARACTERS = 7_600;
const forbiddenStaticAuthoring =
  /aralearn-authoring-api|X-AraLearn-API-Key|\barl_(?:\.{3}|[A-Za-z0-9_-]{4,})|ARALEARN_AUTHORING_(?:INTEGRATION|RECEIPT)_SECRET|authoring_api_(?:clients|keys)/iu;

function assertKnowledgeHasNoWrappedProse(content, fileName) {
  let inFence = false;
  let previousProseLine = false;
  for (const line of String(content || "").split(/\r?\n/gu)) {
    const trimmed = line.trim();
    if (/^```/u.test(trimmed)) {
      inFence = !inFence;
      previousProseLine = false;
      continue;
    }
    if (inFence) continue;
    if (!trimmed) {
      previousProseLine = false;
      continue;
    }
    const isStructural = /^(?:#{1,6} |>|\||[-*+] |\d+\. |---|\*\*\*|___)/u.test(trimmed);
    if (isStructural) {
      previousProseLine = false;
      continue;
    }
    assert.doesNotMatch(
      line,
      /^ {2,}[\p{Ll}]/u,
      `${fileName} conserva uma continuação de prosa quebrada artificialmente.`
    );
    assert.equal(
      previousProseLine,
      false,
      `${fileName} conserva uma quebra interna de parágrafo.`
    );
    previousProseLine = true;
  }
}

function resolveLocalReference(document, reference) {
  assert.match(
    reference,
    /^#(?:\/(?:[^~/]|~[01])*)*$/u,
    `A especificação contém referência externa ou JSON Pointer inválido: ${reference}.`
  );
  if (reference === "#") return document;
  let current = document;
  for (const token of reference.slice(2).split("/")) {
    const key = token.replace(/~1/gu, "/").replace(/~0/gu, "~");
    assert.ok(
      current != null && typeof current === "object" && Object.hasOwn(current, key),
      `A especificação contém $ref sem destino: ${reference}.`
    );
    current = current[key];
  }
  return current;
}

function dereferenceLocalSchema(document, schema, activeReferences = new Set()) {
  if (Array.isArray(schema)) {
    return schema.map((item) =>
      dereferenceLocalSchema(document, item, activeReferences)
    );
  }
  if (!schema || typeof schema !== "object") return schema;
  if (typeof schema.$ref === "string") {
    assert.deepEqual(
      Object.keys(schema),
      ["$ref"],
      `${schema.$ref} não deve ocultar irmãos no contrato da Action.`
    );
    assert.equal(
      activeReferences.has(schema.$ref),
      false,
      `Referência circular inesperada: ${schema.$ref}.`
    );
    const nextReferences = new Set(activeReferences);
    nextReferences.add(schema.$ref);
    return dereferenceLocalSchema(
      document,
      resolveLocalReference(document, schema.$ref),
      nextReferences
    );
  }
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      dereferenceLocalSchema(document, value, activeReferences)
    ])
  );
}

function assertAllLocalReferencesResolve(document) {
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string") {
      resolveLocalReference(document, value.$ref);
    }
    Object.values(value).forEach(visit);
  };
  visit(document);
}

function assertActionInputObjectSchemasDeclareProperties(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertActionInputObjectSchemasDeclareProperties(item, [...path, index])
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  const declaresObject = value.type === "object"
    || (Array.isArray(value.type) && value.type.includes("object"));
  if (declaresObject && value.additionalProperties !== true) {
    assert.equal(
      value.properties != null && typeof value.properties === "object"
        && !Array.isArray(value.properties),
      true,
      `${path.join(".")} precisa declarar properties para a Action do ChatGPT.`
    );
  }
  Object.entries(value).forEach(([key, child]) =>
    assertActionInputObjectSchemasDeclareProperties(child, [...path, key])
  );
}

function actionInputValidator(actionSchema, operationId) {
  const operation = actionSchema.paths[`/${operationId}`]?.post;
  assert.ok(operation, `A Action não expõe ${operationId}.`);
  const requestSchema = operation.requestBody?.content?.["application/json"]?.schema;
  assert.ok(requestSchema, `${operationId} não declara corpo application/json.`);
  const resolved = dereferenceLocalSchema(actionSchema, requestSchema);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(resolved);
  return {
    resolved,
    validate,
    errorsText: () => ajv.errorsText(validate.errors)
  };
}

function build() {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "buildAuthoringPackages.mjs")], {
    cwd: ROOT,
    stdio: "pipe"
  });
}

function readStoredZipEntries(archive) {
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    assert.ok(offset + 30 <= archive.length, "Cabeçalho ZIP local truncado.");
    const compressionMethod = archive.readUInt16LE(offset + 8);
    const compressedBytes = archive.readUInt32LE(offset + 18);
    const uncompressedBytes = archive.readUInt32LE(offset + 22);
    const nameBytes = archive.readUInt16LE(offset + 26);
    const extraBytes = archive.readUInt16LE(offset + 28);
    assert.equal(compressionMethod, 0, "O pacote determinístico precisa usar entradas ZIP armazenadas.");
    assert.equal(compressedBytes, uncompressedBytes);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameBytes + extraBytes;
    const contentEnd = contentStart + compressedBytes;
    assert.ok(contentEnd <= archive.length, "Entrada ZIP truncada.");
    const name = archive.subarray(nameStart, nameStart + nameBytes).toString("utf8");
    assert.equal(entries.has(name), false, `Entrada ZIP duplicada: ${name}.`);
    entries.set(name, archive.subarray(contentStart, contentEnd));
    offset = contentEnd;
  }
  assert.equal(archive.readUInt32LE(offset), 0x02014b50, "Diretório central ZIP ausente.");
  return entries;
}

build();
const firstManifest = await readFile(path.join(OUTPUT, "manifest.json"), "utf8");
build();
const secondManifest = await readFile(path.join(OUTPUT, "manifest.json"), "utf8");
assert.equal(secondManifest, firstManifest, "Pacotes de autoria devem ser determinísticos.");

const manifest = JSON.parse(secondManifest);
assert.equal(manifest.version, 4);
assert.equal(manifest.transport, "mcp+openapi-action");
assert.equal(manifest.archives.length, 6);
assert.ok(manifest.archives.every((archive) => /^[a-f0-9]{64}$/u.test(archive.sha256)));
assert.deepEqual(
  manifest.files.map(({ file }) => file),
  [
    "aralearn-chatgpt-system-prompt.md",
    "aralearn-chatgpt-knowledge-core.md",
    "aralearn-chatgpt-knowledge-resources.md",
    "aralearn-chatgpt-action-openapi.yaml"
  ]
);
for (const artifact of manifest.files) {
  const content = await readFile(path.join(OUTPUT, artifact.file));
  assert.equal(content.length, artifact.bytes);
  assert.equal(createHash("sha256").update(content).digest("hex"), artifact.sha256);
}
for (const archive of manifest.archives) {
  const content = await readFile(path.join(OUTPUT, archive.file));
  assert.equal(content.length, archive.bytes);
  assert.equal(createHash("sha256").update(content).digest("hex"), archive.sha256);
  const extracted = readStoredZipEntries(content);
  assert.equal(extracted.size, archive.files.length);
  for (const expectedFile of archive.files) {
    const extractedContent = extracted.get(expectedFile.path);
    assert.ok(extractedContent, `${archive.file} não contém ${expectedFile.path}.`);
    assert.equal(extractedContent.length, expectedFile.bytes);
    assert.equal(
      createHash("sha256").update(extractedContent).digest("hex"),
      expectedFile.sha256
    );
    assert.doesNotMatch(
      extractedContent.toString("utf8"),
      forbiddenStaticAuthoring,
      `${archive.file}!${expectedFile.path} conserva a API estática de autoria.`
    );
  }
  if (archive.file === "aralearn-authoring-chatgpt.zip") {
    const setup = extracted.get("aralearn-authoring/platforms/chatgpt/SETUP.md")?.toString("utf8");
    assert.match(setup || "", /OAuth 2\.1/u);
    assert.match(setup || "", /aralearn-authoring-mcp/u);
    for (const [filePath, content] of extracted) {
      if (filePath.endsWith(".md") && !filePath.endsWith("/LICENSE.md")) {
        assertKnowledgeHasNoWrappedProse(content.toString("utf8"), filePath);
      }
    }
    assert.ok(
      extracted.has("aralearn-authoring/platforms/chatgpt/ACTION_OPENAPI.yaml"),
      "O pacote ChatGPT não contém o schema da Action."
    );
  }
  const paths = new Set(archive.files.map(({ path: filePath }) => filePath));
  for (const requiredPath of [
    "aralearn-authoring/docs/persistencia-relacional.md",
    "aralearn-authoring/docs/fundamentacao-pedagogica-dos-resources.md"
  ]) {
    assert.ok(paths.has(requiredPath), `${archive.file} não contém ${requiredPath}.`);
  }
  assert.ok(
    [...paths].every((filePath) => !filePath.includes("/docs/screenshots/")),
    `${archive.file} duplicou capturas públicas dentro do pacote.`
  );
}

const prompt = await readFile(
  path.join(OUTPUT, "aralearn-chatgpt-system-prompt.md"),
  "utf8"
);
const coreKnowledge = await readFile(
  path.join(OUTPUT, "aralearn-chatgpt-knowledge-core.md"),
  "utf8"
);
const resourceKnowledge = await readFile(
  path.join(OUTPUT, "aralearn-chatgpt-knowledge-resources.md"),
  "utf8"
);
const knowledge = `${coreKnowledge}\n${resourceKnowledge}`;
const localMarkdownLink = /\]\((?!https?:\/\/|mailto:|#)[^)]+\)/u;
assert.ok(
  prompt.length <= CHATGPT_INSTRUCTIONS_MAX_CHARACTERS,
  `Instruções do ChatGPT excedem ${CHATGPT_INSTRUCTIONS_MAX_CHARACTERS} caracteres.`
);
assert.doesNotMatch(coreKnowledge, localMarkdownLink);
assert.doesNotMatch(resourceKnowledge, localMarkdownLink);
assertKnowledgeHasNoWrappedProse(prompt, "Instruções");
assertKnowledgeHasNoWrappedProse(coreKnowledge, "Conhecimento essencial");
assertKnowledgeHasNoWrappedProse(resourceKnowledge, "Resources didáticos");
assert.match(coreKnowledge, /OAuth 2\.1/u);
assert.match(coreKnowledge, /gateway MCP/u);
for (const required of [
  "expectedRevision",
  "microteoria",
  "Trilhas",
  "reorganizarWorkspace",
  "move_entity",
  "merge_microsequences",
  "consultarCatalogo",
  "listarCursosDaBibliotecaPessoal",
  "prepararAutoriaAraLearn"
]) {
  assert.ok(prompt.includes(required), `Prompt sem ${required}.`);
}
for (const obsolete of [
  "consultarProximaParte",
  "entregarFaseDeAutoria",
  "submissionReadReceipt",
  "planHash",
  "partial",
  "needs_review"
]) {
  assert.equal(prompt.includes(obsolete), false, `Prompt conserva ${obsolete}.`);
  assert.equal(knowledge.includes(obsolete), false, `Conhecimento conserva ${obsolete}.`);
}
for (const obsoleteRule of [
  /ready[^\n.]*chamada separada/iu,
  /combinar conteúdo e chancela é erro/iu,
  /não é válido corrigir conteúdo e declará-lo pronto/iu
]) {
  assert.doesNotMatch(prompt, obsoleteRule);
  assert.doesNotMatch(coreKnowledge, obsoleteRule);
}
assert.match(coreKnowledge, /workspace-mutation\.schema\.json/u);
assert.match(resourceKnowledge, /consultarRecursosDeCard/u);
assert.doesNotMatch(coreKnowledge, /schemas\/card\.schema\.json/u);
assert.doesNotMatch(resourceKnowledge, /schemas\/card\.schema\.json/u);
assert.ok(
  Buffer.byteLength(coreKnowledge) < 180_000,
  "Conhecimento essencial cresceu além do limite de contexto planejado."
);
assert.ok(
  Buffer.byteLength(resourceKnowledge) < 180_000,
  "Conhecimento de resources cresceu além do limite de contexto planejado."
);

const actionSource = await readFile(
  path.join(OUTPUT, "aralearn-chatgpt-action-openapi.yaml"),
  "utf8"
);
const actionSchema = parseYaml(actionSource);
assert.equal(actionSchema.openapi, "3.1.0");
assert.equal(
  actionSchema.components.schemas != null
    && typeof actionSchema.components.schemas === "object",
  true,
  "components.schemas deve existir como objeto."
);
assert.equal(
  Array.isArray(actionSchema.components.schemas),
  false,
  "components.schemas deve ser um objeto."
);
assertAllLocalReferencesResolve(actionSchema);
for (const [name, schema] of Object.entries(actionSchema.components.schemas)) {
  if (name.startsWith("Input")) {
    assertActionInputObjectSchemasDeclareProperties(schema, ["components", "schemas", name]);
  }
}
assert.deepEqual(
  actionSchema.components.schemas.AraLearnActionError.required,
  ["ok", "requestId", "error"]
);
assert.deepEqual(
  actionSchema.components.schemas.AraLearnActionError
    .properties.error.required,
  ["code", "message", "issues", "recovery"]
);
assert.deepEqual(
  actionSchema.components.schemas.AraLearnActionSuccess.required,
  ["ok", "requestId", "data"]
);
assert.equal(
  actionSchema.components.schemas.AraLearnActionSuccess
    .properties.data.additionalProperties,
  true
);
for (const field of [
  "workspaceId",
  "revision",
  "courseId",
  "contentHash",
  "publicationSeq",
  "unchanged",
  "submissionId",
  "items",
  "nextCursor",
  "content"
]) {
  assert.ok(
    actionSchema.components.schemas.AraLearnActionSuccess
      .properties.data.properties[field],
    `O envelope de sucesso da Action não ensina o campo ${field}.`
  );
}
const actionErrorDetails = actionSchema.components.schemas.AraLearnActionError
  .properties.error.properties.details;
assert.equal(actionErrorDetails.type, "object");
assert.equal(actionErrorDetails.additionalProperties, true);
assert.equal(actionErrorDetails.properties.path.type, "string");
assert.equal(actionErrorDetails.properties.field.type, "string");
assert.equal(actionErrorDetails.properties.errors.type, "array");
assert.equal(
  actionSchema.components.schemas.AraLearnActionError
    .properties.error.properties.issues.maxItems,
  20
);
assert.equal(
  actionSchema.components.schemas.AraLearnActionError
    .properties.error.properties.issues.items.properties.rule.type,
  "string"
);
assert.deepEqual(
  actionSchema.components.schemas.AraLearnActionError
    .properties.error.properties.recovery.required,
  ["strategy", "retryable", "requestIdMode", "steps"]
);
assert.deepEqual(
  Object.values(actionSchema.paths).map(({ post }) => post.operationId),
  AUTHORING_WORKSPACE_MCP_TOOLS.map(({ name }) => name)
);
assert.match(
  actionSchema.paths["/salvarCardsNaMicrossequencia"].post
    .responses["200"].description,
  /validado estruturalmente; isso não representa aprovação pedagógica/iu
);
assert.match(
  actionSchema.components.schemas.InputPrepararAutoriaAraLearn
    .properties.intent.description,
  /audit audita ou reaudita sem escrever/iu
);
assert.ok(
  actionSchema.components.schemas.InputPrepararAutoriaAraLearn
    .properties.intent.enum.includes("repair")
);
assert.ok(
  Object.values(actionSchema.paths).every(({ post }) =>
    post.description.length <= 300
    && post.requestBody?.content?.["application/json"]?.schema
  ),
  "Cada operação da Action precisa conservar descrição curta e input schema."
);
for (const definition of AUTHORING_WORKSPACE_MCP_TOOLS) {
  const operation = actionSchema.paths[`/${definition.name}`].post;
  const inputComponentName =
    `Input${definition.name.slice(0, 1).toUpperCase()}${definition.name.slice(1)}`;
  assert.equal(
    operation.requestBody.required,
    true,
    `${definition.name} precisa exigir o corpo da solicitação.`
  );
  assert.equal(
    operation.requestBody.content["application/json"].schema.$ref,
    `#/components/schemas/${inputComponentName}`,
    `${definition.name} precisa referenciar seu contrato canônico em components.schemas.`
  );
  assert.ok(
    actionSchema.components.schemas[inputComponentName],
    `components.schemas não contém ${inputComponentName}.`
  );
  const inputContract = actionInputValidator(actionSchema, definition.name);
  assert.deepEqual(
    inputContract.resolved,
    definition.inputSchema,
    `${definition.name} divergiu do input contract canônico.`
  );
  const successFields = definition.outputSchema.oneOf[0]
    .properties.data.required || [];
  assert.equal(
    operation.responses["200"].content["application/json"].schema.$ref,
    "#/components/schemas/AraLearnActionSuccess"
  );
  for (const field of successFields) {
    assert.match(
      operation.responses["200"].description,
      new RegExp(`(?:^|, |: )${field}(?:,|\\.)`, "u"),
      `${definition.name} não descreve o campo de sucesso ${field}.`
    );
  }
  assert.equal(
    operation["x-openai-isConsequential"],
    Boolean(definition._meta?.["aralearn/actionConsequentialHint"]),
    `${definition.name} divergiu da política explícita de confirmação da Action.`
  );
  for (const status of ["400", "401", "403", "409", "413", "422", "429", "default"]) {
    const response = operation.responses[status];
    assert.match(
      response.$ref,
      /^#\/components\/responses\/[A-Za-z]+$/u,
      `${definition.name} precisa declarar o envelope estruturado para ${status}.`
    );
    const componentName = response.$ref.split("/").at(-1);
    assert.equal(
      actionSchema.components.responses[componentName]
        .content["application/json"].schema.$ref,
      "#/components/schemas/AraLearnActionError"
    );
  }
}

const dataprevWorkspaceId = "11111111-1111-4111-8111-111111111111";
const dataprevCoursePath = ["course-dataprev-teste"];
const dataprevModulePath = [
  ...dataprevCoursePath,
  "module-computacao-nuvem-virtualizacao"
];
const dataprevLessonPath = [...dataprevModulePath, "lesson-modelos-nuvem"];
const dataprevMicrosequencePath = [
  ...dataprevLessonPath,
  "micro-iaas-paas-saas"
];
const dataprevStructurePayload = {
  requestId: "dataprev-structure-action-0001",
  workspaceId: dataprevWorkspaceId,
  expectedRevision: 1,
  parts: [
    {
      entityType: "course",
      parentPath: null,
      id: dataprevCoursePath[0],
      title: "Dataprev: Teste",
      goal: "Preparar uma pessoa iniciante para a prova de Analista de Processamento da FGV."
    },
    {
      entityType: "module",
      parentPath: dataprevCoursePath,
      id: dataprevModulePath[1],
      title: "Computação em Nuvem e Virtualização",
      goal: "Cobrir integralmente a ementa com progressão autossuficiente e prática no estilo FGV.",
      include: [
        "IaaS, PaaS e SaaS",
        "nuvens privada, pública e híbrida",
        "IaC, contêineres, Kubernetes e plataforma VMware"
      ],
      avoid: ["Não presumir conhecimento prévio."]
    },
    {
      entityType: "lesson",
      parentPath: dataprevModulePath,
      id: dataprevLessonPath[2],
      title: "Fundamentos e modelos de nuvem",
      goal: "Distinguir modelos de serviço, implantação e responsabilidade compartilhada.",
      topics: [
        {
          id: "topic-service-models",
          label: "IaaS, PaaS e SaaS",
          kind: "concept",
          checks: ["classifica cenários da FGV pela camada gerenciada"],
          errors: ["classificar somente pelo nome do fornecedor"]
        }
      ]
    },
    {
      entityType: "microsequence",
      parentPath: dataprevLessonPath,
      id: dataprevMicrosequencePath[3],
      title: "IaaS, PaaS e SaaS",
      goal: "Classificar os modelos pela divisão de responsabilidades.",
      role: "explain",
      covers: ["IaaS", "PaaS", "SaaS"],
      checks: ["justifica a classificação de um cenário"],
      errors: ["confundir serviço em nuvem com modelo de implantação"]
    }
  ]
};
const dataprevCards = [
  {
    id: "card-modelos-teoria",
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Responsabilidade por camada",
    text: "Em IaaS, o cliente gerencia mais camadas; em PaaS, concentra-se na aplicação e nos dados; em SaaS, utiliza a aplicação pronta.",
    after: "A responsabilidade do provedor aumenta de IaaS para SaaS."
  },
  {
    id: "card-modelos-gap",
    resource: "table",
    kind: "exercise",
    exercise: "gap",
    title: "Complete a divisão de responsabilidades",
    columns: ["Modelo", "Responsabilidade típica do cliente"],
    rows: [
      ["IaaS", "Gerencia {gap:iaas-layer}."],
      ["PaaS", "Gerencia principalmente {gap:paas-layer}."],
      ["SaaS", "Usa a {gap:saas-layer}."]
    ],
    gaps: [
      {
        id: "iaas-layer",
        response: "choice",
        answer: "sistema operacional",
        distractors: ["datacenter físico", "aplicação SaaS"]
      },
      {
        id: "paas-layer",
        response: "choice",
        answer: "aplicação e dados",
        distractors: ["energia elétrica", "hipervisor"]
      },
      {
        id: "saas-layer",
        response: "choice",
        answer: "aplicação pronta",
        distractors: ["infraestrutura física", "plataforma de contêineres"]
      }
    ],
    after: "A abstração cresce de IaaS para SaaS."
  }
];
const dataprevCardsPayload = {
  requestId: "dataprev-cards-action-0001",
  workspaceId: dataprevWorkspaceId,
  expectedRevision: 2,
  microsequencePath: dataprevMicrosequencePath,
  mode: "replace",
  cardsJson: JSON.stringify(dataprevCards)
};

for (const [operationId, payload] of [
  ["criarEstruturaNoWorkspace", dataprevStructurePayload],
  ["salvarCardsNaMicrossequencia", dataprevCardsPayload]
]) {
  const request = new Request(
    `${actionSchema.servers[0].url}/${operationId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
  assert.equal(request.method, "POST");
  assert.equal(new URL(request.url).pathname.endsWith(`/${operationId}`), true);
  const transmittedPayload = await request.json();
  const inputContract = actionInputValidator(actionSchema, operationId);
  assert.equal(
    inputContract.validate(transmittedPayload),
    true,
    `${operationId} rejeitou o payload Dataprev: ${inputContract.errorsText()}.`
  );
  const routed = mapAuthoringMcpToolCall(operationId, transmittedPayload);
  assert.equal(routed.method, "POST");
  assert.match(routed.path, /\/mutations$/u);
}

const structuralActionCases = [
  ["reorganizarWorkspace", {
    operation: "copy_entity",
    requestId: "action-copy-entity-0001",
    workspaceId: dataprevWorkspaceId,
    expectedRevision: 3,
    entityType: "module",
    entityPath: dataprevModulePath,
    targetParentPath: dataprevCoursePath,
    newRootId: "module-copy"
  }],
  ["reorganizarWorkspace", {
    operation: "rename_entity",
    requestId: "action-rename-entity-0001",
    workspaceId: dataprevWorkspaceId,
    expectedRevision: 3,
    entityType: "course",
    entityPath: dataprevCoursePath,
    title: "Dataprev: Teste revisto"
  }],
  ["reorganizarWorkspace", {
    operation: "move_entity",
    requestId: "action-move-entity-0001",
    workspaceId: dataprevWorkspaceId,
    expectedRevision: 3,
    entityType: "lesson",
    entityPath: dataprevLessonPath,
    targetParentPath: dataprevModulePath,
    position: 0
  }],
  ["reorganizarWorkspace", {
    operation: "merge_microsequences",
    requestId: "action-merge-micro-0001",
    workspaceId: dataprevWorkspaceId,
    expectedRevision: 3,
    targetPath: dataprevMicrosequencePath,
    sourcePaths: [[
      ...dataprevLessonPath,
      "micro-iaas-paas-saas-review"
    ]]
  }],
  ["reorganizarWorkspace", {
    operation: "split_microsequence",
    requestId: "action-split-micro-0001",
    workspaceId: dataprevWorkspaceId,
    expectedRevision: 3,
    sourcePath: dataprevMicrosequencePath,
    newId: "micro-service-models-practice",
    title: "Prática de modelos de serviço",
    goal: "Consolidar a classificação dos modelos.",
    role: "practice",
    cardIds: ["card-modelos-gap"]
  }],
  ["reorganizarWorkspace", {
    operation: "promote_module",
    requestId: "action-promote-module-0001",
    workspaceId: dataprevWorkspaceId,
    expectedRevision: 3,
    modulePath: dataprevModulePath,
    courseId: "course-cloud",
    goal: "Estudar nuvem como curso independente."
  }],
  ["reorganizarWorkspace", {
    operation: "demote_course",
    requestId: "action-demote-course-0001",
    workspaceId: dataprevWorkspaceId,
    expectedRevision: 3,
    coursePath: dataprevCoursePath,
    targetCoursePath: ["course-target"],
    moduleId: "module-dataprev"
  }],
  ["excluirDoWorkspace", {
    operation: "delete_entity",
    requestId: "action-delete-entity-0001",
    workspaceId: dataprevWorkspaceId,
    expectedRevision: 3,
    entityType: "microsequence",
    entityPath: dataprevMicrosequencePath
  }],
  ["excluirDoWorkspace", {
    operation: "delete_workspace",
    requestId: "action-delete-workspace-0001",
    workspaceId: dataprevWorkspaceId,
    expectedRevision: 3
  }]
];
for (const [operationId, payload] of structuralActionCases) {
  const inputContract = actionInputValidator(actionSchema, operationId);
  assert.equal(
    inputContract.validate(payload),
    true,
    `${operationId}/${payload.operation} perdeu argumentos no YAML: `
      + inputContract.errorsText()
  );
  assert.doesNotThrow(() => mapAuthoringMcpToolCall(operationId, payload));
}

const structureInput = actionInputValidator(
  actionSchema,
  "criarEstruturaNoWorkspace"
);
assert.equal(
  structureInput.validate({
    ...dataprevStructurePayload,
    parts: undefined,
    entity: dataprevStructurePayload.parts[0]
  }),
  false,
  "A Action não deve regressar ao payload genérico de entidade inteira."
);
const cardsInput = actionInputValidator(
  actionSchema,
  "salvarCardsNaMicrossequencia"
);
assert.equal(
  cardsInput.validate({
    ...dataprevCardsPayload,
    cardsJson: undefined,
    cards: dataprevCards
  }),
  false,
  "A Action deve transportar cards pelo campo cardsJson contratado."
);

assert.equal(
  actionSchema.servers[0].url,
  "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-action"
);
assert.equal(
  actionSchema.components.securitySchemes.AraLearnOAuth.flows.authorizationCode.authorizationUrl,
  "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-action/oauth/authorize"
);
assert.equal(
  actionSchema.components.securitySchemes.AraLearnOAuth.flows.authorizationCode.tokenUrl,
  "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-action/oauth/token"
);
assert.ok(
  Buffer.byteLength(actionSource) < 85_000,
  "O schema da Action excede o orçamento robusto de 85 mil bytes."
);
assert.ok(
  Object.keys(actionSchema.paths).length <= 30,
  "A Custom GPT Action não pode expor mais de 30 operações."
);

const expectedSums = [...manifest.archives, ...manifest.files]
  .map((artifact) => `${artifact.sha256}  ${artifact.file}`)
  .join("\n") + "\n";
assert.equal(
  await readFile(path.join(OUTPUT, "SHA256SUMS.txt"), "utf8"),
  expectedSums,
  "SHA256SUMS.txt precisa cobrir exatamente todos os artefatos do manifesto."
);

for (const artifact of [...manifest.archives, ...manifest.files]) {
  const content = await readFile(path.join(OUTPUT, artifact.file));
  assert.doesNotMatch(
    content.toString("utf8"),
    forbiddenStaticAuthoring,
    `${artifact.file} conserva a API estática de autoria.`
  );
}

const schemaNames = (await readdir(path.join(ROOT, "authoring", "schemas"))).sort();
assert.deepEqual(schemaNames, [
  "catalog-review.schema.json",
  "workspace-envelope.schema.json",
  "workspace-events.schema.json",
  "workspace-mutation.schema.json",
  "workspace-publication.schema.json"
]);
for (const schemaName of schemaNames) {
  JSON.parse(await readFile(path.join(ROOT, "authoring", "schemas", schemaName), "utf8"));
}

const exampleNames = (await readdir(path.join(ROOT, "authoring", "examples"), {
  withFileTypes: true
}))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(exampleNames, [
  "01-workspace-create.json",
  "02-rename-entity.json",
  "03-private-preview.json",
  "README.md"
]);

console.log("Pacotes MCP de autoria validados.");
