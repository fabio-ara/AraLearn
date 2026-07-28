import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import {
  AUTHORING_MCP_TOOLS,
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/mcpTools.js";
import { createAuthoringHandler } from "../../supabase/functions/_shared/aralearn-authoring/router.js";
import { issueSubmissionReadReceipt } from "../../supabase/functions/_shared/aralearn-authoring/security.js";

const ORIGIN = "https://client.example";
const API_KEY_A = `arl_${"A".repeat(32)}`;
const API_KEY_B = `arl_${"B".repeat(32)}`;
const ACCEPT = "application/json, text/event-stream";
const EMPTY_STATE_DELTA = Object.freeze({
  introducedTermIds: [],
  usedClaimIds: [],
  coveredOutcomeIds: [],
  resolvedErrorIds: [],
  notes: []
});
const MINIMAL_FRAGMENT = Object.freeze({
  courseId: "course-test",
  moduleId: "module-test",
  lessonId: "lesson-test",
  microsequences: [{
    id: "micro-test",
    title: "Microssequência",
    goal: "Apresentar um conceito.",
    role: "explain",
    status: "needs_review",
    dependsOn: [],
    covers: [],
    checks: [],
    errors: [],
    cards: [{
      id: "card-test",
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Conceito",
      text: "Conteúdo do conceito.",
      after: "Síntese do conceito."
    }]
  }]
});
const PASSING_GATES = Object.freeze({
  planAlignment: true,
  contract: true,
  outcomeCoverage: true,
  sources: true,
  continuity: true,
  interactionCoherence: true,
  language: true,
  fieldPreservation: true,
  structuredElements: true,
  feedback: true
});

function readAuthoringExample(fileName) {
  return JSON.parse(
    fs.readFileSync(
      new URL(`../../authoring/examples/${fileName}`, import.meta.url),
      "utf8"
    )
  );
}

function assertInvalidToolArguments(toolName, argumentsValue, expectedPointer = null) {
  assert.throws(
    () => mapAuthoringMcpToolCall(toolName, argumentsValue),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_tool_arguments"
      && (
        expectedPointer == null
        || error.details?.pointer === expectedPointer
        || error.details?.path === expectedPointer
      )
  );
}

function principalFor(authentication) {
  const actor = authentication.credential === API_KEY_B ? "actor-b" : "actor-a";
  return {
    actorId: actor,
    clientId: `client-${actor}`,
    authenticationKind: "api_key",
    scopes: [
      "authoring:private:read",
      "authoring:private:write",
      "authoring:private:audit"
    ]
  };
}

function adapter(overrides = {}) {
  return {
    receiptSecret: "authoring-mcp-test-receipt-secret-32-bytes",
    async resolvePrincipal(authentication) {
      return principalFor(authentication);
    },
    ...overrides
  };
}

function createHandler(adapterValue = adapter()) {
  return createAuthoringMcpHandler({
    adapter: adapterValue,
    allowedOrigins: new Set([ORIGIN])
  });
}

function mcpRequest(message, {
  apiKey = API_KEY_A,
  authorization = null,
  origin = ORIGIN,
  accept = ACCEPT,
  protocolVersion = ARALEARN_MCP_PROTOCOL_VERSION,
  contentType = "application/json",
  path = "/functions/v1/aralearn-authoring-mcp",
  method = "POST",
  rawBody = null
} = {}) {
  const headers = new Headers();
  if (origin != null) headers.set("Origin", origin);
  if (accept != null) headers.set("Accept", accept);
  if (contentType != null) headers.set("Content-Type", contentType);
  if (protocolVersion != null) headers.set("MCP-Protocol-Version", protocolVersion);
  if (apiKey != null) headers.set("X-AraLearn-API-Key", apiKey);
  if (authorization != null) headers.set("Authorization", authorization);
  return new Request(`https://edge.example${path}`, {
    method,
    headers,
    ...(method === "POST" ? { body: rawBody ?? JSON.stringify(message) } : {})
  });
}

function rpc(method, params = {}, id = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

function callTool(name, argumentsValue, id = 1) {
  return rpc("tools/call", { name, arguments: argumentsValue }, id);
}

async function json(response) {
  return JSON.parse(await response.text());
}

test("MCP negocia 2025-11-25 sem sessão de transporte e anuncia somente tools", async () => {
  const handler = createHandler();
  const response = await handler(mcpRequest(rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "teste", version: "1" }
  }), { protocolVersion: null }));
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.result.protocolVersion, ARALEARN_MCP_PROTOCOL_VERSION);
  assert.deepEqual(body.result.capabilities, { tools: { listChanged: false } });
  assert.equal(Object.hasOwn(body.result.capabilities, "resources"), false);
  assert.equal(Object.hasOwn(body.result.capabilities, "prompts"), false);
  assert.equal(response.headers.get("mcp-session-id"), null);
  assert.equal(response.headers.get("mcp-protocol-version"), ARALEARN_MCP_PROTOCOL_VERSION);
});

test("initialize rejeita campos obrigatórios ausentes como parâmetro JSON-RPC inválido", async () => {
  const response = await createHandler()(mcpRequest(rpc("initialize", {
    protocolVersion: ARALEARN_MCP_PROTOCOL_VERSION,
    capabilities: {}
  }, "init-incompleto"), { protocolVersion: null }));
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.id, "init-incompleto");
  assert.equal(body.error.code, -32602);
});

test("MCP lista o fluxo de autoria sem expor gestão de chaves ou importação administrativa", async () => {
  const response = await createHandler()(mcpRequest(rpc("tools/list")));
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(
    body.result.tools.length,
    authoringMcpToolsForPrincipal(principalFor({ credential: API_KEY_A })).length
  );
  assert.ok(body.result.tools.length < AUTHORING_MCP_TOOLS.length);
  assert.equal(
    body.result.tools.every((tool) => tool.annotations.readOnlyHint
      ? !tool.inputSchema.required.includes("requestId")
        && !Object.hasOwn(tool.inputSchema.properties, "requestId")
      : tool.inputSchema.required.includes("requestId")),
    true
  );
  assert.equal(body.result.tools.some((tool) => /integra|importarDocumento/u.test(tool.name)), false);
  assert.equal(body.result.tools.some((tool) => tool.name === "concluirCurso"), true);
  const advertised = JSON.stringify(body.result.tools);
  for (const forbidden of ["service_role", "authoring_api_clients", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.equal(advertised.includes(forbidden), false);
  }
});

test("MCP aplica a mesma matriz de autenticação e escopos em tools/list e tools/call", async () => {
  const authoringRead = [
    "listarRecursosDeCard",
    "consultarRecursoDeCard",
    "listarExecucoesDeAutoria",
    "consultarExecucaoDeAutoria",
    "consultarProximaParte",
    "consultarEntregaDaParte"
  ];
  const authoringWrite = [
    "criarExecucaoDeAutoria",
    "gravarPlanoDeAutoria",
    "gravarTrechoDoRegistro",
    "finalizarPlanoDeAutoria",
    "gravarEspecificacaoDaParte",
    "gravarParteDoCurso",
    "bloquearExecucaoDeAutoria",
    "retomarExecucaoDeAutoria",
    "cancelarExecucaoDeAutoria"
  ];
  const authoringAudit = [
    "auditarParteDoCurso",
    "reabrirParteDoCurso",
    "validarCursoProduzido"
  ];
  const publish = ["concluirCurso"];
  const personalRead = [
    "listarCursosDaBibliotecaPessoal",
    "listarTrilhasPessoais"
  ];
  const personalWrite = [
    "criarTrilhaPessoal",
    "renomearTrilhaPessoal",
    "excluirTrilhaPessoal",
    "moverCursoParaTrilha"
  ];
  const catalog = [
    "listarColecoesDoCatalogo",
    "listarCursosDaColecao",
    "consultarCursoDoCatalogo",
    "criarColecaoDoCatalogo",
    "renomearColecaoDoCatalogo",
    "aposentarColecaoDoCatalogo",
    "reordenarColecoesDoCatalogo",
    "moverCursoNoCatalogo",
    "reordenarCursosDaColecao"
  ];
  const profiles = [
    {
      name: "leitura editorial",
      scopes: ["authoring:read"],
      expected: authoringRead
    },
    {
      name: "escrita editorial",
      scopes: ["authoring:write"],
      expected: authoringWrite
    },
    {
      name: "auditoria editorial",
      scopes: ["authoring:audit"],
      expected: authoringAudit
    },
    {
      name: "publicação de catálogo",
      scopes: ["catalog:publish"],
      expected: [...catalog, ...publish]
    },
    {
      name: "editorial completa",
      scopes: [
        "authoring:read",
        "authoring:write",
        "authoring:audit",
        "catalog:publish"
      ],
      expected: [
        ...authoringRead,
        ...authoringWrite,
        ...authoringAudit,
        ...publish,
        ...catalog
      ]
    },
    {
      name: "leitura pessoal",
      scopes: ["authoring:private:read"],
      expected: [...authoringRead, ...personalRead]
    },
    {
      name: "escrita pessoal",
      scopes: ["authoring:private:write"],
      expected: [...authoringWrite, ...publish, ...personalWrite]
    },
    {
      name: "auditoria pessoal",
      scopes: ["authoring:private:audit"],
      expected: authoringAudit
    },
    {
      name: "pessoal completa",
      scopes: [
        "authoring:private:read",
        "authoring:private:write",
        "authoring:private:audit"
      ],
      expected: [
        ...authoringRead,
        ...authoringWrite,
        ...authoringAudit,
        ...publish,
        ...personalRead,
        ...personalWrite
      ]
    },
    {
      name: "sem escopos",
      scopes: [],
      expected: []
    }
  ];
  const handlerForScopes = (scopes) => createHandler(adapter({
    async resolvePrincipal() {
      return {
        actorId: "actor-matrix",
        clientId: "client-matrix",
        authenticationKind: "api_key",
        scopes
      };
    }
  }));

  for (const profile of profiles) {
    const response = await handlerForScopes(profile.scopes)(
      mcpRequest(rpc("tools/list"))
    );
    const names = (await json(response)).result.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [...new Set(profile.expected)].sort(), profile.name);
  }

  assert.deepEqual(authoringMcpToolsForPrincipal({
    actorId: "actor-session",
    clientId: null,
    authenticationKind: "jwt",
    scopes: ["*"]
  }), []);

  for (const testCase of [
    {
      name: "editorial não usa biblioteca pessoal",
      scopes: ["authoring:read"],
      tool: "listarCursosDaBibliotecaPessoal"
    },
    {
      name: "pessoal não usa catálogo",
      scopes: ["authoring:private:read"],
      tool: "listarColecoesDoCatalogo"
    },
    {
      name: "leitura não usa escrita",
      scopes: ["authoring:private:read"],
      tool: "gravarPlanoDeAutoria"
    },
    {
      name: "escrita não usa auditoria",
      scopes: ["authoring:private:write"],
      tool: "auditarParteDoCurso"
    },
    {
      name: "auditoria não usa leitura",
      scopes: ["authoring:private:audit"],
      tool: "consultarExecucaoDeAutoria"
    }
  ]) {
    const response = await handlerForScopes(testCase.scopes)(
      mcpRequest(callTool(testCase.tool, null))
    );
    assert.equal(response.status, 403, testCase.name);
    assert.equal((await json(response)).error.data.code, "insufficient_scope", testCase.name);
  }

  const allowedButMalformed = await handlerForScopes(["authoring:private:read"])(
    mcpRequest(callTool("listarExecucoesDeAutoria", null))
  );
  assert.equal(allowedButMalformed.status, 200);
  assert.equal((await json(allowedButMalformed)).error.code, -32602);

  for (const testCase of [
    {
      name: "escrita editorial não cria execução pessoal",
      scopes: ["authoring:write"],
      target: "private",
      requestId: "matrix-target-editorial"
    },
    {
      name: "escrita pessoal não cria execução editorial",
      scopes: ["authoring:private:write"],
      target: "catalog",
      requestId: "matrix-target-private"
    }
  ]) {
    const response = await handlerForScopes(testCase.scopes)(
      mcpRequest(callTool("criarExecucaoDeAutoria", {
        requestId: testCase.requestId,
        target: testCase.target,
        title: "Curso",
        contractKey: `curso-${testCase.target}`,
        brief: {},
        publicationIntent: { mode: "create" }
      }))
    );
    assert.equal(response.status, 403, testCase.name);
    assert.equal((await json(response)).error.data.code, "insufficient_scope", testCase.name);
  }
});

test("MCP descreve os contratos aninhados necessários à autoria", async () => {
  const response = await createHandler()(mcpRequest(rpc("tools/list")));
  const tools = (await json(response)).result.tools;
  const schemas = new Map(tools.map((entry) => [entry.name, entry.inputSchema]));

  const plan = schemas.get("gravarPlanoDeAutoria").properties.plan;
  assert.deepEqual(
    plan.required,
    [
      "artifact", "version", "runId", "project", "ledgerManifest", "course",
      "learningOutcomes", "operations", "misconceptions", "conceptMap", "parts",
      "acceptanceCriteria"
    ]
  );
  assert.ok(plan.properties.course.required.includes("language"));
  assert.ok(plan.properties.course.required.includes("prerequisites"));
  assert.ok(plan.properties.parts.items.required.includes("ownership"));
  assert.deepEqual(
    plan.properties.conceptMap.properties.relations.items.properties.relation.enum,
    ["requires", "part_of", "contrasts", "represents", "applies", "causes"]
  );
  assert.deepEqual(
    plan.properties.operations.items.required,
    ["id", "label", "evidence", "representation"]
  );
  const representation =
    plan.properties.operations.items.properties.representation;
  assert.deepEqual(
    representation.required,
    ["preferredResources", "allowedResources", "rationale"]
  );
  assert.deepEqual(
    plan.properties.misconceptions.items.required,
    ["id", "statement", "correctionEvidence"]
  );

  const ledgerItem = schemas.get("gravarTrechoDoRegistro").properties.items.items;
  assert.equal(ledgerItem.anyOf.length, 3);
  assert.deepEqual(ledgerItem.anyOf.map((entry) => entry.required[0]), ["sourceId", "claimId", "termId"]);

  const specification = schemas.get("gravarEspecificacaoDaParte").properties.specification;
  assert.ok(specification.required.includes("ownership"));
  assert.ok(specification.required.includes("cardPlan"));
  const cardPlan = specification.properties.cardPlan.items;
  assert.ok(cardPlan.required.includes("operationId"));
  assert.ok(cardPlan.required.includes("conceptIds"));
  assert.ok(cardPlan.required.includes("retrievedConceptIds"));
  assert.ok(cardPlan.required.includes("misconceptionIds"));
  assert.ok(cardPlan.required.includes("contextAnchors"));
  assert.ok(
    specification.properties.structure.properties.microsequences.items.properties
      .dependencyRationale
  );

  const submission = schemas.get("gravarParteDoCurso").properties;
  assert.deepEqual(
    submission.fragment.required,
    ["courseId", "moduleId", "lessonId", "microsequences"]
  );
  assert.deepEqual(
    submission.stateDelta.required,
    ["introducedTermIds", "usedClaimIds", "coveredOutcomeIds", "resolvedErrorIds", "notes"]
  );

});

test("MCP impede destino privado de usar coleção editorial ou atualizar curso publicado", () => {
  const base = {
    requestId: "mcp-private-target-0001",
    target: "private",
    title: "Curso privado",
    contractKey: "curso-privado",
    brief: {},
    publicationIntent: { mode: "create" }
  };
  assertInvalidToolArguments("criarExecucaoDeAutoria", {
    ...base,
    collectionId: "11111111-1111-4111-8111-111111111111"
  }, "/arguments/collectionId");
  assertInvalidToolArguments("criarExecucaoDeAutoria", {
    ...base,
    publicationIntent: {
      mode: "update",
      existingCourseId: "22222222-2222-4222-8222-222222222222",
      expectedContentHash: "a".repeat(64)
    }
  });
});

test("MCP rejeita manifesto cujo número de trechos e itens não representa o mesmo vazio", () => {
  const plan = readAuthoringExample("02-plan.json");
  plan.ledgerManifest.sections.sources = { chunkCount: 0, itemCount: 1 };
  assertInvalidToolArguments("gravarPlanoDeAutoria", {
    requestId: "mcp-manifest-0001",
    runId: plan.runId,
    plan
  }, "/arguments/plan/ledgerManifest/sections/sources/itemCount");
});

test("MCP exige data de consulta para fonte volátil", () => {
  const chunk = readAuthoringExample("03-ledger-sources-chunk.json");
  const source = structuredClone(chunk.items[0]);
  source.stability = "volatile";
  delete source.accessedOn;
  assertInvalidToolArguments("gravarTrechoDoRegistro", {
    requestId: chunk.requestId,
    runId: "11111111-1111-4111-8111-111111111111",
    planHash: chunk.planHash,
    section: "sources",
    position: 0,
    items: [source]
  });
});

test("MCP aplica as condicionais pedagógicas e de recurso na especificação da parte", () => {
  const envelope = readAuthoringExample("07-part-specification.json");
  const runId = "11111111-1111-4111-8111-111111111111";
  const partKey = envelope.specification.key;
  const baseArguments = {
    requestId: envelope.requestId,
    runId,
    partKey,
    planHash: envelope.planHash
  };
  const cases = [
    {
      name: "código sem linguagem",
      mutate(specification) {
        specification.cardPlan[0].resource = "code";
        delete specification.cardPlan[0].codeLanguage;
      },
      pointer: "/arguments/specification/cardPlan/0/codeLanguage"
    },
    {
      name: "fórmula sem notação",
      mutate(specification) {
        specification.cardPlan[0].resource = "formula";
        delete specification.cardPlan[0].notation;
      },
      pointer: "/arguments/specification/cardPlan/0/notation"
    },
    {
      name: "prática sem erro-alvo",
      mutate(specification) {
        delete specification.cardPlan[1].targetError;
      },
      pointer: "/arguments/specification/cardPlan/1/targetError"
    },
    {
      name: "teoria com função de prática",
      mutate(specification) {
        specification.cardPlan[0].learningFunction = "guided_practice";
      },
      pointer: "/arguments/specification/cardPlan/0/learningFunction"
    },
    {
      name: "diagnóstico sem equívoco",
      mutate(specification) {
        specification.cardPlan[1].learningFunction = "error_diagnosis";
        specification.cardPlan[1].misconceptionIds = [];
      },
      pointer: "/arguments/specification/cardPlan/1/misconceptionIds"
    }
  ];

  for (const testCase of cases) {
    const specification = structuredClone(envelope.specification);
    testCase.mutate(specification);
    assertInvalidToolArguments(
      "gravarEspecificacaoDaParte",
      { ...baseArguments, specification },
      testCase.pointer
    );
  }
});

test("MCP expõe guide e topic com a mesma forma exata do contrato v3", () => {
  const planWithInvalidTopic = readAuthoringExample("02-plan.json");
  planWithInvalidTopic.project.courses[0].modules[0].lessons[0].topics = [{ label: "Tema" }];
  assertInvalidToolArguments("gravarPlanoDeAutoria", {
    requestId: "mcp-topic-shape-0001",
    runId: planWithInvalidTopic.runId,
    plan: planWithInvalidTopic
  }, "/arguments/plan/project/courses/0/modules/0/lessons/0/topics/0/id");

  const planWithInvalidGuide = readAuthoringExample("02-plan.json");
  delete planWithInvalidGuide.project.courses[0].modules[0].guide.avoid;
  assertInvalidToolArguments("gravarPlanoDeAutoria", {
    requestId: "mcp-guide-shape-0001",
    runId: planWithInvalidGuide.runId,
    plan: planWithInvalidGuide
  }, "/arguments/plan/project/courses/0/modules/0/guide/avoid");
});

test("MCP limita construção, auditoria e reabertura a oito tentativas", () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const partKey = "part-conjuncao";
  const submission = readAuthoringExample("09-part-submission.json");
  submission.attempt = 9;
  assertInvalidToolArguments("gravarParteDoCurso", submission, "/arguments/attempt");

  const audit = readAuthoringExample("10-audit.json");
  audit.attempt = 9;
  assertInvalidToolArguments("auditarParteDoCurso", audit, "/arguments/attempt");

  assertInvalidToolArguments("reabrirParteDoCurso", {
    requestId: "mcp-reopen-attempt-0001",
    artifact: "aralearn.final-validation-repair",
    version: 1,
    runId,
    partKey,
    attempt: 9,
    submissionSha256: "b".repeat(64),
    decision: "repair",
    findings: [],
    instructions: "Corrigir a parte."
  }, "/arguments/attempt");
});

test("MCP rejeita texto vazio e espaços não canônicos em listas estruturais", () => {
  assertInvalidToolArguments("criarColecaoDoCatalogo", {
    requestId: "mcp-empty-title-0001",
    contractKey: "colecao-vazia",
    title: "   ",
    description: ""
  }, "/arguments/title");

  const plan = readAuthoringExample("02-plan.json");
  plan.course.prerequisites = [" requisito "];
  assertInvalidToolArguments("gravarPlanoDeAutoria", {
    requestId: "mcp-canonical-set-0001",
    runId: plan.runId,
    plan
  }, "/arguments/plan/course/prerequisites/0");

  const envelope = readAuthoringExample("07-part-specification.json");
  envelope.specification.cardPlan[1].contextAnchors = [" P e Q "];
  assertInvalidToolArguments("gravarEspecificacaoDaParte", {
    requestId: envelope.requestId,
    runId: "11111111-1111-4111-8111-111111111111",
    partKey: envelope.specification.key,
    planHash: envelope.planHash,
    specification: envelope.specification
  }, "/arguments/specification/cardPlan/1/contextAnchors/0");
});

test("MCP rejeita limites triviais do plano antes de montar a requisição REST", () => {
  const source = JSON.parse(
    fs.readFileSync(
      new URL("../../authoring/examples/02-plan.json", import.meta.url),
      "utf8"
    )
  );
  const cases = [
    {
      name: "rótulo de operação",
      pointer: "/arguments/plan/operations/0/label",
      mutate: (plan) => {
        plan.operations[0].label = "x".repeat(1001);
      }
    },
    {
      name: "rótulo de conceito",
      pointer: "/arguments/plan/conceptMap/concepts/0/label",
      mutate: (plan) => {
        plan.conceptMap.concepts[0].label = "x".repeat(1001);
      }
    },
    {
      name: "módulos",
      pointer: "/arguments/plan/course/modules",
      mutate: (plan) => {
        plan.course.modules = Array.from({ length: 501 }, () => ({}));
      }
    },
    {
      name: "resultados de aprendizagem",
      pointer: "/arguments/plan/learningOutcomes",
      mutate: (plan) => {
        plan.learningOutcomes = Array.from({ length: 5001 }, () => ({}));
      }
    },
    {
      name: "operações",
      pointer: "/arguments/plan/operations",
      mutate: (plan) => {
        plan.operations = Array.from({ length: 5001 }, () => ({}));
      }
    },
    {
      name: "equívocos",
      pointer: "/arguments/plan/misconceptions",
      mutate: (plan) => {
        plan.misconceptions = Array.from({ length: 5001 }, () => ({}));
      }
    },
    {
      name: "conceitos",
      pointer: "/arguments/plan/conceptMap/concepts",
      mutate: (plan) => {
        plan.conceptMap.concepts = Array.from({ length: 10001 }, () => ({}));
      }
    },
    {
      name: "relações conceituais",
      pointer: "/arguments/plan/conceptMap/relations",
      mutate: (plan) => {
        plan.conceptMap.relations = Array.from({ length: 20001 }, () => ({}));
      }
    },
    {
      name: "lista de textos",
      pointer: "/arguments/plan/course/prerequisites",
      mutate: (plan) => {
        plan.course.prerequisites = Array.from(
          { length: 1001 },
          (_, index) => `prerequisito-${index}`
        );
      }
    }
  ];

  for (const testCase of cases) {
    const plan = structuredClone(source);
    testCase.mutate(plan);
    assert.throws(
      () => mapAuthoringMcpToolCall("gravarPlanoDeAutoria", {
        requestId: "plan-limit-schema-0001",
        runId: plan.runId,
        plan
      }),
      (error) => error instanceof AuthoringApiError
        && error.code === "invalid_tool_arguments"
        && error.details.pointer === testCase.pointer
        && ["max_items", "max_length"].includes(error.details.reason),
      testCase.name
    );
  }
});

test("MCP separa leituras sem requestId de mutações idempotentes", () => {
  const read = mapAuthoringMcpToolCall("listarExecucoesDeAutoria", { limit: 10 });
  assert.equal(read.method, "GET");
  assert.equal(read.requestId, null);
  assert.equal(read.body, null);

  assert.throws(
    () => mapAuthoringMcpToolCall("listarExecucoesDeAutoria", {
      requestId: "read-id-is-not-needed"
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_tool_arguments"
      && error.details.pointer === "/arguments/requestId"
      && error.details.reason === "unknown_field"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("cancelarExecucaoDeAutoria", {
      runId: "11111111-1111-4111-8111-111111111111",
      reason: "Cancelamento solicitado."
    }),
    (error) => error instanceof AuthoringApiError
      && error.details.pointer === "/arguments/requestId"
      && error.details.reason === "required"
  );
});

test("MCP expõe intenção de publicação create e update sem campos livres", () => {
  const common = {
    requestId: "publication-intent-0001",
    target: "catalog",
    title: "Curso",
    contractKey: "course-test",
    brief: {}
  };
  assert.equal(
    mapAuthoringMcpToolCall("criarExecucaoDeAutoria", {
      ...common,
      publicationIntent: { mode: "create" }
    }).body.publicationIntent.mode,
    "create"
  );
  const update = mapAuthoringMcpToolCall("criarExecucaoDeAutoria", {
    ...common,
    requestId: "publication-intent-0002",
    publicationIntent: {
      mode: "update",
      existingCourseId: "22222222-2222-4222-8222-222222222222",
      expectedContentHash: "a".repeat(64)
    }
  });
  assert.equal(update.body.publicationIntent.mode, "update");

  for (const publicationIntent of [
    { mode: "create", existingCourseId: "22222222-2222-4222-8222-222222222222" },
    { mode: "update", existingCourseId: "22222222-2222-4222-8222-222222222222" }
  ]) {
    assert.throws(
      () => mapAuthoringMcpToolCall("criarExecucaoDeAutoria", {
        ...common,
        requestId: `publication-invalid-${publicationIntent.mode}`,
        publicationIntent
      }),
      (error) => error instanceof AuthoringApiError
        && error.details.pointer === "/arguments/publicationIntent"
        && error.details.reason === "one_of"
    );
  }
});

test("MCP valida recursivamente gates e achados de auditoria", () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const base = {
    requestId: "audit-shape-0001",
    artifact: "aralearn.part-audit",
    version: 1,
    runId,
    partKey: "parte-1",
    attempt: 1,
    submissionSha256: "a".repeat(64),
    submissionReadReceipt: "receipt.signature",
    decision: "approve",
    gates: PASSING_GATES,
    findings: []
  };
  assert.equal(
    mapAuthoringMcpToolCall("auditarParteDoCurso", base).path,
    `/v1/runs/${runId}/parts/parte-1/audit`
  );
  const incompleteGates = { ...PASSING_GATES };
  delete incompleteGates.feedback;
  assert.throws(
    () => mapAuthoringMcpToolCall("auditarParteDoCurso", {
      ...base,
      requestId: "audit-shape-0002",
      gates: incompleteGates
    }),
    (error) => error instanceof AuthoringApiError
      && error.details.pointer === "/arguments/gates/feedback"
      && error.details.reason === "required"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("auditarParteDoCurso", {
      ...base,
      requestId: "audit-shape-0003",
      decision: "repair",
      gates: { ...PASSING_GATES, contract: false },
      findings: [{
        issueId: "issue-1",
        severity: "error",
        gate: "inventedGate",
        pointer: "/fragment/cards/0",
        observed: "O card diverge do contrato.",
        requiredChange: "Corrigir o card.",
        preserveFields: ["/fragment/cards/1"],
        acceptanceTest: "O contrato aceita o fragmento."
      }]
    }),
    (error) => error instanceof AuthoringApiError
      && error.details.pointer === "/arguments/findings/0/gate"
      && error.details.reason === "enum"
  );
});

test("MCP associa cada seção do registro ao tipo correto de item", () => {
  const base = {
    requestId: "ledger-shape-0001",
    runId: "11111111-1111-4111-8111-111111111111",
    planHash: "a".repeat(64),
    section: "sources",
    position: 0
  };
  const source = {
    sourceId: "source-1",
    title: "Fonte",
    kind: "book",
    locator: "capítulo 1",
    excerpt: "Trecho usado no curso.",
    stability: "stable"
  };
  assert.equal(
    mapAuthoringMcpToolCall("gravarTrechoDoRegistro", {
      ...base,
      items: [source]
    }).body.items[0].sourceId,
    "source-1"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("gravarTrechoDoRegistro", {
      ...base,
      requestId: "ledger-shape-0002",
      items: [{
        claimId: "claim-1",
        statement: "Afirmação",
        sourceIds: ["source-1"],
        support: "Trecho da fonte.",
        confidence: "high"
      }]
    }),
    (error) => error instanceof AuthoringApiError
      && error.details.pointer === "/arguments/items/0/sourceId"
      && error.details.reason === "required"
  );
});

test("MCP informa JSON Pointer para erro profundo antes de chamar a API", () => {
  const fragment = structuredClone(MINIMAL_FRAGMENT);
  fragment.microsequences[0].cards[0].position = 0;
  assert.throws(
    () => mapAuthoringMcpToolCall("gravarParteDoCurso", {
      requestId: "deep-shape-0001",
      artifact: "aralearn.part-submission",
      version: 1,
      runId: "11111111-1111-4111-8111-111111111111",
      partKey: "parte-1",
      mode: "build",
      attempt: 1,
      baseLedgerSha256: "a".repeat(64),
      fragment,
      evidence: [],
      stateDelta: EMPTY_STATE_DELTA
    }),
    (error) => error instanceof AuthoringApiError
      && error.details.pointer === "/arguments/fragment/microsequences/0/cards/0/position"
      && error.details.reason === "minimum"
  );
});

test("MCP não mistura campos estruturais de recursos diferentes", () => {
  const fragment = structuredClone(MINIMAL_FRAGMENT);
  Object.assign(fragment.microsequences[0].cards[0], {
    nodes: [{
      id: "node-1",
      label: "Nó indevido",
      type: "file",
      parentId: null
    }]
  });
  assert.throws(
    () => mapAuthoringMcpToolCall("gravarParteDoCurso", {
      requestId: "resource-shape-0001",
      artifact: "aralearn.part-submission",
      version: 1,
      runId: "11111111-1111-4111-8111-111111111111",
      partKey: "parte-1",
      mode: "build",
      attempt: 1,
      baseLedgerSha256: "a".repeat(64),
      fragment,
      evidence: [],
      stateDelta: EMPTY_STATE_DELTA
    }),
    (error) => error instanceof AuthoringApiError
      && error.details.pointer === "/arguments/fragment/microsequences/0/cards/0"
      && error.details.reason === "one_of"
  );
});

test("MCP rejeita estruturas internas inválidas de flow, formula e composite antes da rota", () => {
  const cases = [
    {
      name: "flow",
      requestId: "nested-flow-0001",
      card: {
        id: "card-flow",
        position: 1,
        resource: "flow",
        kind: "theory",
        exercise: "none",
        title: "Fluxo",
        structure: {
          id: "flow-root",
          kind: "sequence",
          items: [{
            id: "flow-step",
            kind: "process",
            text: "Processar",
            html: "<b>campo fora do contrato</b>"
          }]
        },
        after: "Síntese."
      },
      pointerSuffix: "/structure"
    },
    {
      name: "formula",
      requestId: "nested-formula-0001",
      card: {
        id: "card-formula",
        position: 1,
        resource: "formula",
        kind: "theory",
        exercise: "none",
        title: "Fração",
        prompt: "Observe a fração.",
        notation: "mathematics",
        accessibleText: "um meio",
        expression: {
          type: "fraction",
          numerator: { type: "number", value: "1" },
          denominator: {
            type: "number",
            value: "2",
            markup: "<mn>2</mn>"
          }
        },
        after: "Síntese."
      },
      pointerSuffix: "/expression"
    },
    {
      name: "composite",
      requestId: "nested-composite-0001",
      card: {
        id: "card-composite",
        position: 1,
        resource: "composite",
        kind: "theory",
        exercise: "none",
        title: "Composição",
        blocks: [{
          kind: "code",
          prompt: "Leia o código.",
          language: "javascript",
          code: "const total = 2;",
          structure: { kind: "sequence", items: [] }
        }],
        after: "Síntese."
      },
      pointerSuffix: "/blocks/0"
    }
  ];

  for (const testCase of cases) {
    const fragment = structuredClone(MINIMAL_FRAGMENT);
    fragment.microsequences[0].cards = [testCase.card];
    assert.throws(
      () => mapAuthoringMcpToolCall("gravarParteDoCurso", {
        requestId: testCase.requestId,
        artifact: "aralearn.part-submission",
        version: 1,
        runId: "11111111-1111-4111-8111-111111111111",
        partKey: "parte-1",
        mode: "build",
        attempt: 1,
        baseLedgerSha256: "a".repeat(64),
        fragment,
        evidence: [],
        stateDelta: EMPTY_STATE_DELTA
      }),
      (error) => error instanceof AuthoringApiError
        && error.details.pointer.endsWith(testCase.pointerSuffix)
        && error.details.reason === "one_of",
      `${testCase.name} precisa falhar no contrato da ferramenta`
    );
  }
});

test("MCP entrega a linguagem formal completa de cada recurso", async () => {
  const handler = createHandler();
  const listResponse = await handler(mcpRequest(callTool("listarRecursosDeCard", {
  })));
  const listData = (await json(listResponse)).result.structuredContent.data;
  assert.equal(listData.contract, "aralearn.authoring-resources.v1");
  assert.equal(listData.resources.some((entry) => entry.resource === "table"), true);
  assert.equal(
    listData.resources.find((entry) => entry.resource === "table").exercises.includes("gap"),
    true
  );

  const detailResponse = await handler(mcpRequest(callTool("consultarRecursoDeCard", {
    resource: "table"
  })));
  const detail = (await json(detailResponse)).result.structuredContent.data.definition;
  assert.equal(detail.resource, "table");
  assert.equal(detail.gapLanguage.marker, "{gap:id}");
  assert.equal(detail.gapTargets.includes("rows"), true);
  assert.equal(detail.example.gaps[0].id, "result");
});

test("MCP aceita chave arl_ pelo Bearer ou pelo cabeçalho dedicado", async () => {
  const handler = createHandler();
  for (const options of [
    { apiKey: API_KEY_A },
    { apiKey: null, authorization: `Bearer ${API_KEY_A}` }
  ]) {
    const response = await handler(mcpRequest(rpc("ping"), options));
    assert.equal(response.status, 200);
    assert.deepEqual((await json(response)).result, {});
  }
});

test("MCP rejeita ausência, JWT e credenciais ambíguas sem consultar ferramentas", async () => {
  let resolved = 0;
  const handler = createHandler(adapter({
    async resolvePrincipal(authentication) {
      resolved += 1;
      return principalFor(authentication);
    }
  }));
  const anonymous = await handler(mcpRequest(rpc("ping"), { apiKey: null }));
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get("www-authenticate"), /^Bearer /u);
  const jwt = await handler(mcpRequest(rpc("ping"), {
    apiKey: null,
    authorization: "Bearer user-jwt"
  }));
  assert.equal(jwt.status, 401);
  assert.equal((await json(jwt)).error.data.code, "api_key_required");
  const ambiguous = await handler(mcpRequest(rpc("ping"), {
    apiKey: API_KEY_A,
    authorization: `Bearer ${API_KEY_A}`
  }));
  assert.equal(ambiguous.status, 400);
  assert.equal(resolved, 0);
});

test("MCP valida Origin presente e permite cliente autenticado servidor-servidor sem Origin", async () => {
  let resolved = 0;
  const handler = createHandler(adapter({
    async resolvePrincipal() {
      resolved += 1;
      return principalFor({ credential: API_KEY_A });
    }
  }));
  for (const origin of ["https://attacker.example", `${ORIGIN}.attacker.example`]) {
    const response = await handler(mcpRequest(rpc("ping"), { origin }));
    assert.equal(response.status, 403);
    assert.equal((await json(response)).error.data.code, "origin_not_allowed");
  }
  assert.equal(resolved, 0, "Origin hostil deve ser rejeitada antes da autenticação.");
  const serverToServer = await handler(mcpRequest(rpc("ping"), { origin: null }));
  assert.equal(serverToServer.status, 200);
  assert.equal(resolved, 1);
  const anonymous = await handler(mcpRequest(rpc("ping"), { origin: null, apiKey: null }));
  assert.equal(anonymous.status, 401);
});

test("preflight MCP devolve somente a origem exata configurada", async () => {
  const handler = createHandler();
  const accepted = await handler(mcpRequest(null, { method: "OPTIONS", apiKey: null }));
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match(accepted.headers.get("access-control-allow-headers"), /MCP-Protocol-Version/u);
  const absent = await handler(mcpRequest(null, {
    method: "OPTIONS",
    apiKey: null,
    origin: null
  }));
  assert.equal(absent.status, 403);
  assert.throws(
    () => createAuthoringMcpHandler({ adapter: adapter(), allowedOrigins: new Set(["*"]) }),
    /não aceita origem curinga/u
  );
});

test("MCP diferencia rate limit, escopo insuficiente e falha de validação", async () => {
  const rateLimited = createHandler(adapter({
    async resolvePrincipal() {
      throw new AuthoringApiError(429, "rate_limited", "Limite temporário.");
    }
  }));
  const limited = await rateLimited(mcpRequest(rpc("ping")));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");

  let commands = 0;
  const privateHandler = createHandler(adapter({
    async command() {
      commands += 1;
      return {};
    }
  }));
  const forbidden = await privateHandler(mcpRequest(callTool("criarExecucaoDeAutoria", {
    requestId: "mcp-scope-0001",
    target: "catalog",
    title: "Curso",
    contractKey: "curso-catalogo",
    brief: {},
    publicationIntent: { mode: "create" }
  })));
  assert.equal(forbidden.status, 403);
  assert.equal((await json(forbidden)).error.data.code, "insufficient_scope");
  assert.equal(commands, 0);

  const invalid = await privateHandler(mcpRequest(callTool("criarExecucaoDeAutoria", {
    target: "private",
    title: "Curso",
    contractKey: "curso-privado",
    brief: {},
    publicationIntent: { mode: "create" }
  })));
  const invalidBody = await json(invalid);
  assert.equal(invalid.status, 200);
  assert.equal(invalidBody.result.isError, true);
  assert.equal(invalidBody.result.structuredContent.error.code, "invalid_tool_arguments");
  assert.equal(commands, 0);
});

test("MCP conserva isolamento entre duas chaves pessoais", async () => {
  const handler = createHandler(adapter({
    async listRuns({ principal }) {
      return { items: [{ runId: `run-${principal.actorId}`, owner: principal.actorId }] };
    }
  }));
  const argumentsValue = { limit: 10 };
  const responseA = await handler(mcpRequest(callTool("listarExecucoesDeAutoria", argumentsValue), {
    apiKey: API_KEY_A
  }));
  const responseB = await handler(mcpRequest(callTool("listarExecucoesDeAutoria", argumentsValue), {
    apiKey: API_KEY_B
  }));
  const dataA = (await json(responseA)).result.structuredContent.data;
  const dataB = (await json(responseB)).result.structuredContent.data;
  assert.equal(dataA.items[0].owner, "actor-a");
  assert.equal(dataB.items[0].owner, "actor-b");
  assert.notDeepEqual(dataA, dataB);
});

test("MCP e REST entregam o mesmo comando canônico ao adaptador", async () => {
  const restCommands = [];
  const mcpCommands = [];
  const baseAdapter = (commands) => adapter({
    async command(command) {
      commands.push(structuredClone(command));
      return { status: "planning", runId: command.runId };
    }
  });
  const requestId = "mcp-parity-0001";
  const payload = {
    requestId,
    target: "private",
    title: "Lógica de programação",
    contractKey: "curso-logica",
    brief: {},
    publicationIntent: { mode: "create" }
  };
  const rest = createAuthoringHandler({
    adapter: baseAdapter(restCommands),
    allowedOrigins: new Set([ORIGIN])
  });
  const restResponse = await rest(new Request("https://edge.example/v1/runs", {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      "X-AraLearn-API-Key": API_KEY_A,
      "Idempotency-Key": requestId
    },
    body: JSON.stringify(payload)
  }));
  assert.equal(restResponse.status, 200);

  const mcp = createHandler(baseAdapter(mcpCommands));
  const mcpResponse = await mcp(mcpRequest(callTool("criarExecucaoDeAutoria", payload)));
  assert.equal(mcpResponse.status, 200);
  assert.equal((await json(mcpResponse)).result.isError, false);
  const withoutDeadline = (commands) => commands.map((source) => {
    const command = { ...source };
    delete command.deadlineAt;
    return command;
  });
  assert.deepEqual(withoutDeadline(mcpCommands), withoutDeadline(restCommands));
});

test("MCP e REST compartilham o hash idempotente dos artefatos com identidade na rota", async () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const partKey = "parte-1";
  const submissionSha256 = "c".repeat(64);
  const receiptSecret = adapter().receiptSecret;
  const submissionReadReceipt = await issueSubmissionReadReceipt({
    secret: receiptSecret,
    principal: principalFor({ credential: API_KEY_A }),
    runId,
    partKey,
    attempt: 1,
    submissionSha256
  });
  const cases = [
    {
      name: "submitPart",
      tool: "gravarParteDoCurso",
      method: "PUT",
      path: `/v1/runs/${runId}/parts/${partKey}`,
      currentStatus: "awaiting_audit",
      arguments: {
        requestId: "mcp-parity-submit-0001",
        artifact: "aralearn.part-submission",
        version: 1,
        runId,
        partKey,
        mode: "build",
        attempt: 1,
        baseLedgerSha256: "b".repeat(64),
        fragment: MINIMAL_FRAGMENT,
        evidence: [],
        stateDelta: EMPTY_STATE_DELTA
      }
    },
    {
      name: "auditPart",
      tool: "auditarParteDoCurso",
      method: "POST",
      path: `/v1/runs/${runId}/parts/${partKey}/audit`,
      currentStatus: "approved",
      arguments: {
        requestId: "mcp-parity-audit-0001",
        artifact: "aralearn.part-audit",
        version: 1,
        runId,
        partKey,
        attempt: 1,
        submissionSha256,
        submissionReadReceipt,
        decision: "approve",
        gates: PASSING_GATES,
        findings: []
      }
    },
    {
      name: "reopenPart",
      tool: "reabrirParteDoCurso",
      method: "POST",
      path: `/v1/runs/${runId}/parts/${partKey}/reopen`,
      currentStatus: null,
      arguments: {
        requestId: "mcp-parity-reopen-0001",
        artifact: "aralearn.final-validation-repair",
        version: 1,
        runId,
        partKey,
        attempt: 1,
        submissionSha256,
        decision: "repair",
        findings: [],
        instructions: "Corrigir a falha indicada pela validação final."
      }
    }
  ];

  for (const testCase of cases) {
    const restCommands = [];
    const mcpCommands = [];
    const makeAdapter = (commands) => adapter({
      async command(command) {
        commands.push(structuredClone(command));
        return { accepted: true };
      },
      async getRunAuthorizationSummary() {
        return { publicationTarget: "private" };
      },
      async getNextPart() {
        return {
          parts: testCase.currentStatus == null ? [] : [{
            partKey,
            status: testCase.currentStatus,
            attempt: 1,
            fragmentHash: submissionSha256
          }]
        };
      }
    });
    const rest = createAuthoringHandler({
      adapter: makeAdapter(restCommands),
      allowedOrigins: new Set([ORIGIN]),
      receiptSecret
    });
    const restResponse = await rest(new Request(`https://edge.example${testCase.path}`, {
      method: testCase.method,
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "X-AraLearn-API-Key": API_KEY_A,
        "Idempotency-Key": testCase.arguments.requestId
      },
      body: JSON.stringify(testCase.arguments)
    }));
    assert.equal(restResponse.status, 200, `${testCase.name} pela API REST`);

    const mcpResponse = await createHandler(makeAdapter(mcpCommands))(
      mcpRequest(callTool(testCase.tool, testCase.arguments))
    );
    const mcpBody = await json(mcpResponse);
    assert.equal(mcpResponse.status, 200, `${testCase.name} pelo MCP`);
    assert.equal(mcpBody.result?.isError, false, JSON.stringify(mcpBody));
    assert.equal(restCommands.length, 1, `${testCase.name} deve produzir um comando REST`);
    assert.equal(mcpCommands.length, 1, `${testCase.name} deve produzir um comando MCP`);
    assert.equal(
      mcpCommands[0].payload._apiRequestHash,
      restCommands[0].payload._apiRequestHash,
      `${testCase.name} deve conservar a idempotência entre as duas portas`
    );
  }
});

test("MCP preserva requestId e deixa a idempotência no mesmo adaptador da API", async () => {
  const recorded = new Map();
  let commands = 0;
  const handler = createHandler(adapter({
    async command(command) {
      commands += 1;
      const previous = recorded.get(command.requestId);
      const current = JSON.stringify(command.payload);
      if (previous && previous !== current) {
        throw new AuthoringApiError(409, "idempotency_key_reused", "requestId usado com outro conteúdo.");
      }
      recorded.set(command.requestId, current);
      return { idempotent: Boolean(previous), runId: command.runId };
    }
  }));
  const base = {
    requestId: "mcp-idempotency-0001",
    target: "private",
    title: "Curso",
    contractKey: "curso-idempotente",
    brief: {},
    publicationIntent: { mode: "create" }
  };
  const first = await handler(mcpRequest(callTool("criarExecucaoDeAutoria", base, 1)));
  const replay = await handler(mcpRequest(callTool("criarExecucaoDeAutoria", base, 2)));
  assert.equal((await json(first)).result.structuredContent.data.idempotent, false);
  assert.equal((await json(replay)).result.structuredContent.data.idempotent, true);
  const incompatible = await handler(mcpRequest(callTool("criarExecucaoDeAutoria", {
    ...base,
    title: "Outro curso"
  }, 3)));
  const incompatibleBody = await json(incompatible);
  assert.equal(incompatible.status, 200);
  assert.equal(incompatibleBody.result.isError, true);
  assert.equal(incompatibleBody.result.structuredContent.error.code, "idempotency_key_reused");
  assert.equal(commands, 3);
});

test("MCP rejeita campo desconhecido em vez de descartá-lo no mapeamento REST", async () => {
  let commands = 0;
  const handler = createHandler(adapter({
    async command() {
      commands += 1;
      return {};
    }
  }));
  const response = await handler(mcpRequest(callTool("criarExecucaoDeAutoria", {
    requestId: "mcp-fields-0001",
    target: "private",
    title: "Curso",
    contractKey: "curso-campos",
    brief: {},
    publicationIntent: { mode: "create" },
    runId: "11111111-1111-4111-8111-111111111111"
  })));
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.result.isError, true);
  assert.equal(body.result.structuredContent.error.code, "invalid_tool_arguments");
  assert.equal(body.result.structuredContent.error.details.path, "$.arguments.runId");
  assert.equal(commands, 0);
});

test("mapeamento MCP preserva campos do artefato e remove somente identidades da rota", () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const mappedPart = mapAuthoringMcpToolCall("gravarParteDoCurso", {
    requestId: "mcp-map-part-0001",
    artifact: "aralearn.part-submission",
    version: 1,
    runId,
    partKey: "parte-1",
    mode: "build",
    attempt: 1,
    baseLedgerSha256: "a".repeat(64),
    fragment: MINIMAL_FRAGMENT,
    evidence: [],
    stateDelta: EMPTY_STATE_DELTA
  });
  assert.equal(mappedPart.path, `/v1/runs/${runId}/parts/parte-1`);
  assert.equal(Object.hasOwn(mappedPart.body, "runId"), false);
  assert.equal(Object.hasOwn(mappedPart.body, "partKey"), false);
  assert.equal(mappedPart.body.artifact, "aralearn.part-submission");
  assert.equal(mappedPart.body.version, 1);
  assert.deepEqual(mappedPart.body.evidence, []);

  const mappedBlock = mapAuthoringMcpToolCall("bloquearExecucaoDeAutoria", {
    requestId: "mcp-map-block-0001",
    runId,
    partKey: "parte-1",
    reason: "A fonte não esclarece o conceito."
  });
  assert.equal(mappedBlock.body.partKey, "parte-1");
});

test("MCP aplica os requisitos do Streamable HTTP stateless", async () => {
  const handler = createHandler();
  const wrongAccept = await handler(mcpRequest(rpc("ping"), { accept: "application/json" }));
  assert.equal(wrongAccept.status, 406);
  const wrongMedia = await handler(mcpRequest(rpc("ping"), { contentType: "text/plain" }));
  assert.equal(wrongMedia.status, 415);
  const missingVersion = await handler(mcpRequest(rpc("ping"), { protocolVersion: null }));
  assert.equal(missingVersion.status, 400);
  const invalidJson = await handler(mcpRequest(null, { rawBody: "{" }));
  assert.equal(invalidJson.status, 400);
  assert.equal((await json(invalidJson)).error.code, -32700);
  const getResponse = await handler(mcpRequest(null, { method: "GET" }));
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get("allow"), "POST, OPTIONS");
  const notification = await handler(mcpRequest({
    jsonrpc: "2.0",
    method: "notifications/initialized"
  }));
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");
});

test("MCP não converte método desconhecido em ferramenta nem revela detalhes internos", async () => {
  const handler = createHandler();
  const unknownMethod = await handler(mcpRequest(rpc("resources/list")));
  const unknownMethodBody = await json(unknownMethod);
  assert.equal(unknownMethod.status, 200);
  assert.equal(unknownMethodBody.error.code, -32601);

  const unknownTool = await handler(mcpRequest(callTool("administrarChaves", {
    requestId: "mcp-unknown-0001"
  })));
  const unknownToolBody = await json(unknownTool);
  assert.equal(unknownTool.status, 200);
  assert.equal(unknownToolBody.error.code, -32602);
  assert.equal(Object.hasOwn(unknownToolBody, "result"), false);

  const malformedCall = await handler(mcpRequest(rpc("tools/call", {
    name: "listarExecucoesDeAutoria",
    arguments: null
  }, 3)));
  assert.equal((await json(malformedCall)).error.code, -32602);

  for (const body of [unknownMethodBody, unknownToolBody]) {
    assert.equal(JSON.stringify(body).includes("service_role"), false);
  }
});
