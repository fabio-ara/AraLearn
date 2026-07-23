import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const OPENAPI_ROOT = path.join(ROOT, "docs", "openapi");
const GENERAL_PATH = path.join(
  OPENAPI_ROOT,
  "aralearn-authoring-api.yaml"
);
const EDITORIAL_PATH = path.join(
  OPENAPI_ROOT,
  "aralearn-authoring-api-chatgpt-editorial.yaml"
);
const PRIVATE_PATH = path.join(
  OPENAPI_ROOT,
  "aralearn-authoring-api-chatgpt-private.yaml"
);
const PRIVATE_COMPACT_PATH = path.join(
  OPENAPI_ROOT,
  "aralearn-authoring-api-chatgpt-private-action.yaml"
);
const CARD_SCHEMA_PATH = path.join(
  ROOT,
  "authoring",
  "schemas",
  "card.schema.json"
);
const CARD_SCHEMA_REFERENCE = "../../authoring/schemas/card.schema.json";
const PUBLISH_PATH = "/functions/v1/aralearn-authoring-api/v1/runs/{runId}/publish";
const ACTION_PREFIX = "/functions/v1/aralearn-authoring-api";
const AUTHORING_PATHS = Object.freeze([
  "/v1/contracts/resources",
  "/v1/contracts/resources/{resource}",
  "/v1/runs",
  "/v1/runs/{runId}",
  "/v1/runs/{runId}/plan",
  "/v1/runs/{runId}/ledger/{section}/{position}",
  "/v1/runs/{runId}/plan/finalize",
  "/v1/runs/{runId}/next-part",
  "/v1/runs/{runId}/parts/{partKey}/specification",
  "/v1/runs/{runId}/parts/{partKey}",
  "/v1/runs/{runId}/parts/{partKey}/submission",
  "/v1/runs/{runId}/parts/{partKey}/audit",
  "/v1/runs/{runId}/parts/{partKey}/reopen",
  "/v1/runs/{runId}/validate",
  "/v1/runs/{runId}/block",
  "/v1/runs/{runId}/resume",
  "/v1/runs/{runId}/cancel",
  "/v1/runs/{runId}/publish"
]);
const CATALOG_PATHS = Object.freeze([
  "/v1/catalog/collections",
  "/v1/catalog/collections/order",
  "/v1/catalog/collections/{collectionId}",
  "/v1/catalog/collections/{collectionId}/retire",
  "/v1/catalog/collections/{collectionId}/courses",
  "/v1/catalog/collections/{collectionId}/courses/order",
  "/v1/catalog/courses/{courseId}",
  "/v1/catalog/courses/{courseId}/placement",
  "/v1/catalog/courses/{courseId}/structure"
]);
const PERSONAL_LIBRARY_PATHS = Object.freeze([
  "/v1/library/courses",
  "/v1/library/courses/{courseId}",
  "/v1/library/courses/{courseId}/structure",
  "/v1/library/paths",
  "/v1/library/paths/{pathId}",
  "/v1/library/selections/{selectionId}/path"
]);
const COURSE_REVISION_ROUTES = Object.freeze([
  {
    suffix: "/revisions",
    method: "post",
    actionOperationId: "abrirCorrecaoPontual"
  },
  {
    suffix: "/revisions/{revisionId}",
    method: "get",
    actionOperationId: "consultarEstadoDaCorrecaoPontual"
  },
  {
    suffix: "/revisions/{revisionId}/fragment",
    method: "get",
    actionOperationId: "consultarFragmentoDaCorrecaoPontual"
  },
  {
    suffix: "/revisions/{revisionId}/patch",
    method: "put",
    actionOperationId: "gravarCorrecaoPontual"
  },
  {
    suffix: "/revisions/{revisionId}/apply",
    method: "post",
    actionOperationId: "aplicarCorrecaoPontual"
  }
]);
const HTTP_METHODS = Object.freeze(["get", "post", "put", "patch", "delete"]);
const COMPACT_PRIVATE_ROUTES = Object.freeze([
  ["/v1/contracts/resources", "get"],
  ["/v1/runs", "get"],
  ["/v1/runs", "post"],
  ["/v1/runs/{runId}", "get"],
  ["/v1/runs/{runId}/plan", "put"],
  ["/v1/runs/{runId}/ledger/{section}/{position}", "put"],
  ["/v1/runs/{runId}/plan/finalize", "post"],
  ["/v1/runs/{runId}/next-part", "get"],
  ["/v1/runs/{runId}/parts/{partKey}/specification", "put"],
  ["/v1/runs/{runId}/parts/{partKey}", "put"],
  ["/v1/runs/{runId}/parts/{partKey}/audit", "post"],
  ["/v1/runs/{runId}/parts/{partKey}/reopen", "post"],
  ["/v1/runs/{runId}/validate", "post"],
  ["/v1/runs/{runId}/block", "post"],
  ["/v1/runs/{runId}/resume", "post"],
  ["/v1/runs/{runId}/cancel", "post"],
  ["/v1/runs/{runId}/publish", "post"],
  ["/v1/library/courses", "get"],
  ["/v1/library/courses/{courseId}", "patch"],
  ["/v1/library/courses/{courseId}/structure", "get"],
  ["/v1/library/paths", "get"],
  ["/v1/library/paths", "post"],
  ["/v1/library/paths/{pathId}", "patch"],
  ["/v1/library/paths/{pathId}", "delete"],
  ["/v1/library/selections/{selectionId}/path", "put"],
  ["/v1/library/revisions", "post", "abrirCorrecaoPontual"],
  ["/v1/library/revisions/{revisionId}", "get", "consultarEstadoDaCorrecaoPontual"],
  ["/v1/library/revisions/{revisionId}/fragment", "get", "consultarFragmentoDaCorrecaoPontual"],
  ["/v1/library/revisions/{revisionId}/patch", "put", "gravarCorrecaoPontual"],
  ["/v1/library/revisions/{revisionId}/apply", "post", "aplicarCorrecaoPontual"]
]);

function resolvePointer(document, reference) {
  if (reference === "#") return document;
  if (!reference.startsWith("#/")) return undefined;
  return reference.slice(2).split("/").reduce((value, segment) => {
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    return value?.[key];
  }, document);
}

function resolveReference(document, reference, externalDocuments) {
  if (reference.startsWith("#")) {
    return {
      document,
      identity: document.$id || "documento-principal",
      target: resolvePointer(document, reference)
    };
  }
  const [resource, fragment = ""] = reference.split("#", 2);
  const externalDocument = externalDocuments.get(resource);
  if (!externalDocument) {
    throw new Error(`Referência externa não suportada no perfil Action: ${reference}`);
  }
  const target = fragment
    ? resolvePointer(externalDocument, `#${fragment}`)
    : externalDocument;
  return {
    document: externalDocument,
    identity: externalDocument.$id || resource,
    target
  };
}

function externalRootWithoutDefinitions(target, reference) {
  if (reference.includes("#")) return structuredClone(target);
  const result = structuredClone(target);
  delete result.$schema;
  delete result.$id;
  delete result.$defs;
  return result;
}

function recursiveReferenceBoundary(reference) {
  return {
    type: "object",
    description:
      `Nó recursivo formal de ${reference}. Use a estrutura exata devolvida pelo contrato do recurso.`,
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      kind: { type: "string" },
      type: { type: "string" },
      value: {},
      text: { type: "string" },
      operator: { type: "string" },
      items: { type: "array", items: { type: "object", properties: {} } },
      children: { type: "array", items: { type: "object", properties: {} } }
    }
  };
}

function inlineLocalReferences(
  value,
  document,
  externalDocuments = new Map(),
  active = new Set()
) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      inlineLocalReferences(item, document, externalDocuments, active)
    );
  }
  if (!value || typeof value !== "object") return value;
  if (typeof value.$ref === "string") {
    if (/^#\/\$defs\/schema\d+_node$/u.test(value.$ref)) {
      return recursiveReferenceBoundary(value.$ref);
    }
    const resolved = resolveReference(document, value.$ref, externalDocuments);
    const referenceIdentity = `${resolved.identity}::${value.$ref}`;
    if (active.has(referenceIdentity)) {
      return recursiveReferenceBoundary(value.$ref);
    }
    if (!resolved.target) throw new Error(`Referência inexistente: ${value.$ref}`);
    const nextActive = new Set(active);
    nextActive.add(referenceIdentity);
    const target = resolved.document === document
      ? structuredClone(resolved.target)
      : externalRootWithoutDefinitions(resolved.target, value.$ref);
    return inlineLocalReferences(
      { ...target, ...Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "$ref")
      ) },
      resolved.document,
      externalDocuments,
      nextActive
    );
  }
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      inlineLocalReferences(item, document, externalDocuments, active)
    ])
  );
  if (result.type === "object" && !result.properties) {
    result.properties = {};
  }
  return result;
}

function deduplicateParameters(parameters) {
  const byIdentity = new Map();
  parameters.forEach((parameter) => {
    byIdentity.set(`${parameter.in}:${parameter.name}`, parameter);
  });
  return [...byIdentity.values()];
}

function removePathFieldsFromRequest(operation, sourcePath) {
  const schema =
    operation.requestBody?.content?.["application/json"]?.schema;
  if (!schema?.properties) return;
  const pathFields = [...sourcePath.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1]);
  pathFields.forEach((field) => {
    delete schema.properties[field];
  });
  if (Array.isArray(schema.required)) {
    schema.required = schema.required.filter(
      (field) => !pathFields.includes(field)
    );
    if (!schema.required.length) delete schema.required;
  }
}

function actionPathItem(generalDocument, sourcePath, externalDocuments) {
  const source = generalDocument.paths[sourcePath];
  if (!source) throw new Error(`Rota ausente no OpenAPI geral: ${sourcePath}`);
  const result = {};
  HTTP_METHODS.forEach((method) => {
    if (!source[method]) return;
    const operation = inlineLocalReferences(
      structuredClone(source[method]),
      generalDocument,
      externalDocuments
    );
    const inherited = inlineLocalReferences(
      structuredClone(source.parameters || []),
      generalDocument,
      externalDocuments
    );
    const own = operation.parameters || [];
    const parameters = deduplicateParameters([...inherited, ...own]);
    if (parameters.length) operation.parameters = parameters;
    else delete operation.parameters;
    removePathFieldsFromRequest(operation, sourcePath);
    operation.responses = Object.fromEntries(
      Object.entries(operation.responses || {}).map(([status, response]) => [
        status,
        { description: response.description || "Resposta da operação." }
      ])
    );
    delete operation.security;
    result[method] = operation;
  });
  return result;
}

function removeActionPaths(document, sourcePaths) {
  sourcePaths.forEach((sourcePath) => {
    delete document.paths[`${ACTION_PREFIX}${sourcePath}`];
  });
}

function removeRevisionActionPaths(document) {
  COURSE_REVISION_ROUTES.forEach(({ suffix }) => {
    for (const target of ["catalog", "library", "{revisionTarget}"]) {
      delete document.paths[
        `${ACTION_PREFIX}/v1/${target}${suffix}`
      ];
    }
  });
}

function injectActionPaths(
  document,
  generalDocument,
  sourcePaths,
  externalDocuments = new Map()
) {
  sourcePaths.forEach((sourcePath) => {
    document.paths[`${ACTION_PREFIX}${sourcePath}`] =
      actionPathItem(generalDocument, sourcePath, externalDocuments);
  });
}

function revisionActionPathItem(
  generalDocument,
  sourcePath,
  route,
  externalDocuments
) {
  const pathItem = actionPathItem(
    generalDocument,
    sourcePath,
    externalDocuments
  );
  pathItem[route.method].operationId = route.actionOperationId;
  return pathItem;
}

function injectRevisionActionPaths(
  document,
  generalDocument,
  target,
  externalDocuments = new Map()
) {
  const concreteTarget = target === "catalog" ? "catalog" : "library";
  COURSE_REVISION_ROUTES.forEach((route) => {
    const sourcePath = `/v1/${concreteTarget}${route.suffix}`;
    document.paths[`${ACTION_PREFIX}${sourcePath}`] =
      revisionActionPathItem(
        generalDocument,
        sourcePath,
        route,
        externalDocuments
      );
  });
}

export function buildEditorialActionDocument(
  editorialDocument,
  generalDocument,
  externalDocuments = new Map()
) {
  const document = structuredClone(editorialDocument);
  removeActionPaths(document, [
    ...AUTHORING_PATHS,
    ...CATALOG_PATHS,
    ...PERSONAL_LIBRARY_PATHS
  ]);
  removeRevisionActionPaths(document);
  injectActionPaths(document, generalDocument, AUTHORING_PATHS, externalDocuments);
  injectActionPaths(document, generalDocument, CATALOG_PATHS, externalDocuments);
  injectRevisionActionPaths(
    document,
    generalDocument,
    "catalog",
    externalDocuments
  );
  const createRun = document.paths[
    "/functions/v1/aralearn-authoring-api/v1/runs"
  ].post.requestBody.content["application/json"].schema;
  delete createRun.allOf;
  createRun.properties.target.enum = ["catalog"];
  const publicationBranches = createRun.properties.publicationIntent.oneOf || [];
  const updatePublication = publicationBranches.find(
    (candidate) => candidate.properties?.mode?.const === "update"
  );
  createRun.properties.publicationIntent = {
    type: "object",
    additionalProperties: false,
    required: ["mode"],
    properties: {
      mode: { type: "string", enum: ["create", "update"] },
      existingCourseId: structuredClone(
        updatePublication?.properties?.existingCourseId || { type: "string" }
      ),
      expectedContentHash: structuredClone(
        updatePublication?.properties?.expectedContentHash || { type: "string" }
      )
    },
    allOf: [{
      if: {
        properties: { mode: { const: "update" } },
        required: ["mode"]
      },
      then: {
        required: ["existingCourseId", "expectedContentHash"]
      }
    }]
  };
  return document;
}

export function buildPrivateActionDocument(
  editorialDocument,
  generalDocument,
  externalDocuments = new Map()
) {
  const document = structuredClone(editorialDocument);
  document.info.title = "AraLearn Authoring API: perfil pessoal";
  document.info.description =
    "Cria, produz, revisa, valida e materializa cursos pessoais AraLearn por partes.";
  removeActionPaths(document, CATALOG_PATHS);
  injectActionPaths(
    document,
    generalDocument,
    PERSONAL_LIBRARY_PATHS,
    externalDocuments
  );
  removeRevisionActionPaths(document);
  injectRevisionActionPaths(
    document,
    generalDocument,
    "private",
    externalDocuments
  );

  const createRun = document.paths[
    "/functions/v1/aralearn-authoring-api/v1/runs"
  ].post.requestBody.content["application/json"].schema;
  delete createRun.allOf;
  createRun.properties.target.enum = ["private"];
  createRun.properties.target.description =
    "O curso pertence somente ao autor autenticado.";
  delete createRun.properties.collectionId;
  createRun.properties.publicationIntent = {
    type: "object",
    additionalProperties: false,
    required: ["mode"],
    properties: {
      mode: {
        type: "string",
        enum: ["create"],
        description: "Cursos pessoais sempre começam como uma criação independente."
      }
    }
  };

  const completion = document.paths[PUBLISH_PATH].post;
  completion.operationId = "concluirCursoPessoal";
  completion.summary = "Materializa o curso validado na conta do autor";
  completion.description =
    "Materializa de forma transacional a árvore relacional validada e a torna visível somente ao autor.";
  completion.responses["200"].description = "Curso pessoal materializado.";
  completion.responses["202"].description =
    "Materialização em andamento. Consulte a execução com o mesmo requestId.";
  completion.responses.default.description = "Falha ao materializar o curso pessoal.";

  return document;
}

function openObject(properties = {}) {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      value: {},
      ...properties
    }
  };
}

function compactRequestSchema(operationId) {
  const requestId = { type: "string", description: "Identificador idempotente da chamada." };
  const planHash = { type: "string", description: "Hash do plano devolvido pelo servidor." };
  const generic = openObject({ requestId });
  const schemas = {
    criarExecucaoDeAutoria: openObject({
      requestId,
      target: { type: "string", enum: ["private"] },
      title: { type: "string" },
      contractKey: { type: "string" },
      brief: openObject({ audience: { type: "string" } }),
      publicationIntent: openObject({ mode: { type: "string", enum: ["create"] } })
    }),
    gravarPlanoDeAutoria: openObject({ requestId, plan: openObject({ artifact: { type: "string" } }) }),
    gravarTrechoDoRegistro: openObject({ requestId, planHash, items: { type: "array", items: openObject() } }),
    finalizarPlanoDeAutoria: openObject({ requestId, planHash }),
    gravarEspecificacaoDaParte: openObject({ requestId, planHash, specification: openObject({ key: { type: "string" } }) }),
    gravarParteDoCurso: openObject({
      requestId,
      artifact: { type: "string" },
      version: { type: "integer" },
      mode: { type: "string" },
      attempt: { type: "integer" },
      baseLedgerSha256: { type: "string" },
      fragment: openObject(),
      stateDelta: openObject()
    }),
    auditarParteDoCurso: openObject({
      requestId,
      artifact: { type: "string" },
      version: { type: "integer" },
      attempt: { type: "integer" },
      submissionSha256: { type: "string" },
      submissionReadReceipt: { type: "string" },
      decision: { type: "string" },
      gates: openObject(),
      findings: { type: "array", items: openObject() }
    }),
    reabrirParteDoCurso: openObject({ requestId, findings: { type: "array", items: openObject() } }),
    criarTrilhaPessoal: openObject({ requestId, title: { type: "string" } }),
    renomearTrilhaPessoal: openObject({ requestId, title: { type: "string" }, baseRevision: { type: "integer" } }),
    excluirTrilhaPessoal: openObject({ requestId, baseRevision: { type: "integer" } }),
    moverCursoParaTrilha: openObject({ requestId, pathId: { type: ["string", "null"] }, baseRevision: { type: "integer" } }),
    renomearCursoPessoal: openObject({ requestId, title: { type: "string" }, baseRevision: { type: "integer" } }),
    abrirCorrecaoPontual: openObject({ requestId, courseId: { type: "string" }, microsequenceId: { type: "string" }, instruction: { type: "string" } }),
    gravarCorrecaoPontual: openObject({ requestId, fragment: openObject() }),
    aplicarCorrecaoPontual: openObject({ requestId, baseContentHash: { type: "string" } })
  };
  return schemas[operationId] || generic;
}

function compactActionOperation(generalDocument, sourcePath, method, replacementOperationId) {
  const sourcePathItem = generalDocument.paths[sourcePath];
  const sourceOperation = sourcePathItem?.[method];
  if (!sourceOperation) {
    throw new Error(`Operação compacta ausente: ${method.toUpperCase()} ${sourcePath}.`);
  }
  const inherited = inlineLocalReferences(structuredClone(sourcePathItem.parameters || []), generalDocument);
  const own = inlineLocalReferences(structuredClone(sourceOperation.parameters || []), generalDocument);
  const operationId = replacementOperationId || sourceOperation.operationId;
  const operation = {
    operationId,
    summary: sourceOperation.summary || operationId,
    description: "Use o contrato de autoria e os dados devolvidos pelo servidor.",
    "x-openai-isConsequential": sourceOperation["x-openai-isConsequential"] === true,
    responses: {
      "200": { description: "Operação concluída." },
      "400": { description: "Dados inválidos ou estado incompatível." },
      default: { description: "Falha estruturada da operação." }
    }
  };
  const parameters = deduplicateParameters([...inherited, ...own]);
  if (parameters.length) operation.parameters = parameters;
  if (sourceOperation.requestBody) {
    operation.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: compactRequestSchema(operationId)
        }
      }
    };
  }
  return operation;
}

export function buildCompactPrivateActionDocument(generalDocument) {
  const document = {
    openapi: "3.1.0",
    info: {
      title: "AraLearn: autoria pessoal",
      version: "1.0.0",
      description: "Cria e organiza cursos pessoais por partes. O servidor valida todo conteúdo antes de materializá-lo.",
      license: {
        name: "MIT",
        url: "https://github.com/fabio-ara/AraLearn/blob/main/LICENSE.md"
      }
    },
    servers: [{ url: "https://seu-projeto.supabase.co" }],
    security: [{ AuthoringApiKey: [] }],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        AuthoringApiKey: { type: "apiKey", in: "header", name: "X-AraLearn-API-Key" }
      }
    }
  };
  COMPACT_PRIVATE_ROUTES.forEach(([sourcePath, method, replacementOperationId]) => {
    const actionPath = `${ACTION_PREFIX}${sourcePath}`;
    document.paths[actionPath] ||= {};
    document.paths[actionPath][method] = compactActionOperation(
      generalDocument,
      sourcePath,
      method,
      replacementOperationId
    );
  });
  const completion = document.paths[PUBLISH_PATH]?.post;
  completion.operationId = "concluirCursoPessoal";
  completion.summary = "Materializa o curso pessoal validado";
  completion.description = "Materializa a árvore relacional validada somente na conta do autor.";
  return document;
}

export function serializeActionDocument(document) {
  return stringify(document, {
    indent: 2,
    lineWidth: 0,
    minContentWidth: 0,
    simpleKeys: true
  });
}

export async function generateChatGptActionProfiles() {
  const [editorialSource, general, cardSchema] = await Promise.all([
    readFile(EDITORIAL_PATH, "utf8").then(parse),
    readFile(GENERAL_PATH, "utf8").then(parse),
    readFile(CARD_SCHEMA_PATH, "utf8").then(JSON.parse)
  ]);
  const externalDocuments = new Map([
    [CARD_SCHEMA_REFERENCE, cardSchema]
  ]);
  const editorial = buildEditorialActionDocument(
    editorialSource,
    general,
    externalDocuments
  );
  const personal = buildPrivateActionDocument(
    editorial,
    general,
    externalDocuments
  );
  await writeFile(EDITORIAL_PATH, serializeActionDocument(editorial), "utf8");
  await writeFile(PRIVATE_PATH, serializeActionDocument(personal), "utf8");
  await writeFile(
    PRIVATE_COMPACT_PATH,
    serializeActionDocument(buildCompactPrivateActionDocument(general)),
    "utf8"
  );
  console.log(
    "Perfis da Action do ChatGPT gerados: pessoal e editorial."
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateChatGptActionProfiles();
}
