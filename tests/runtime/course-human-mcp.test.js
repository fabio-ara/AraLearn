import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  COURSE_HUMAN_TASK_CATALOG_HASH,
  COURSE_HUMAN_TASK_CATALOG_METADATA,
  COURSE_HUMAN_TASKS,
  courseHumanTaskIsAllowed,
  courseHumanTasksForPrincipal,
  executeHumanCourseTask
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";

const ORIGIN = "https://client.example";
const RESOURCE_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000002";
const PRINCIPAL = Object.freeze({
  actorId: "30000000-0000-4000-8000-000000000003",
  authenticationKind: "oauth",
  scopes: Object.freeze(["authoring:read", "authoring:write"])
});
const READ_PRINCIPAL = Object.freeze({
  ...PRINCIPAL,
  scopes: Object.freeze(["authoring:read"])
});
const EXPECTED_NAMES = Object.freeze([
  "retomar_curso",
  "consultar_planejamento",
  "preparar_materializacao",
  "consultar_configuracao",
  "consultar_observacoes",
  "preparar_revisao",
  "consultar_fontes",
  "consultar_componentes",
  "criar_curso",
  "salvar_parte",
  "materializar_parte",
  "ajustar_configuracao",
  "registrar_observacao",
  "aplicar_correcoes",
  "manter_fonte",
  "incorporar_pdf_como_fonte"
]);

function adapter(principal = PRINCIPAL) {
  return {
    publicAppUrl: "https://app.example",
    supabaseUrl: "https://project.example",
    async resolvePrincipal() {
      return principal;
    },
    async listCourses({ query }) {
      return {
        items: query && !"Redes para iniciantes".toLocaleLowerCase("pt-BR")
          .includes(String(query).toLocaleLowerCase("pt-BR"))
          ? []
          : [{
              courseId: COURSE_ID,
              title: "Redes para iniciantes",
              revision: 7,
              deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}`
            }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourse() {
      return {
        courseId: COURSE_ID,
        title: "Redes para iniciantes",
        revision: 7,
        deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}`
      };
    },
    async getCourseInstructionalPlan() {
      return {
        courseId: COURSE_ID,
        courseRevision: 7,
        plan: {
          id: "40000000-0000-4000-8000-000000000004",
          version: 3,
          title: "Redes para iniciantes",
          objective: "Explicar serviços em rede.",
          instructionalAnalysisUnits: [{
            id: "50000000-0000-4000-8000-000000000005",
            position: 0,
            statement: "Socket relaciona processo e comunicação."
          }],
          evidenceRequirements: [],
          parts: [{
            id: PART_ID,
            version: 2,
            position: 0,
            title: "Sockets",
            intent: "Relacionar processos e comunicação em rede.",
            microsequences: []
          }]
        }
      };
    }
  };
}

function mcpHandler(principal = PRINCIPAL) {
  return createAuthoringMcpHandler({
    adapter: adapter(principal),
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: "https://project.example/auth/v1"
  });
}

function request(method, params = {}) {
  return new Request(RESOURCE_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer token",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
}

function visit(value, callback, path = "$") {
  if (!value || typeof value !== "object") return;
  callback(value, path);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, callback, `${path}[${index}]`));
  } else {
    Object.entries(value).forEach(([key, entry]) => visit(entry, callback, `${path}.${key}`));
  }
}

test("#272 catálogo MCP publica somente as dezesseis tarefas humanas", () => {
  assert.deepEqual(COURSE_HUMAN_TASKS.map(({ name }) => name), EXPECTED_NAMES);
  assert.equal(new Set(EXPECTED_NAMES).size, 16);
  const actualHash = createHash("sha256")
    .update(JSON.stringify(COURSE_HUMAN_TASKS))
    .digest("hex");
  assert.equal(COURSE_HUMAN_TASK_CATALOG_HASH, `sha256:${actualHash}`);
  assert.equal(COURSE_HUMAN_TASK_CATALOG_METADATA.version, "2.0.0");
  assert.ok(JSON.stringify(COURSE_HUMAN_TASKS).length < 32_000);
});

test("salvar_parte grava estrutura e inventário completos sem expor identidades técnicas", async () => {
  const writes = [];
  const value = {
    ...adapter(),
    async getCourseInstructionalPlan() {
      return {
        courseId: COURSE_ID,
        courseRevision: 7,
        plan: {
          id: "40000000-0000-4000-8000-000000000004",
          version: 3,
          title: "Redes para iniciantes",
          objective: "Explicar serviços em rede.",
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: []
        }
      };
    },
    async listCourseEntities() {
      return { revision: 7, items: [], hasMore: false, nextCursor: null };
    },
    async saveCourseAuthoringPart(input) {
      writes.push(structuredClone(input));
      return {
        contract: "aralearn.course-authoring-part-change.v1",
        courseId: COURSE_ID,
        courseRevision: 8,
        planVersion: 4,
        authoringPartId: input.part.partId,
        changed: true,
        idempotent: false
      };
    }
  };
  const output = await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: {
      curso: "Redes para iniciantes",
      titulo: "Sockets",
      intencao: "Construir o modelo antes da prática.",
      microssequencias: [{
        modulo: "Comunicação",
        objetivoDoModulo: "Explicar como processos se comunicam em rede.",
        licao: "Sockets",
        objetivoDaLicao: "Relacionar processo, endereço e transporte.",
        titulo: "O que é um socket",
        objetivo: "Definir socket sem pressupor o modelo de transporte.",
        funcao: "explicar",
        unidadesDeAnalise: ["Socket é uma interface entre processo e transporte."],
        requisitosDeEvidencia: ["Distinguir processo, socket e conexão."]
      }, {
        modulo: "Comunicação",
        objetivoDoModulo: "Explicar como processos se comunicam em rede.",
        licao: "Sockets",
        objetivoDaLicao: "Relacionar processo, endereço e transporte.",
        titulo: "Prática de identificação",
        objetivo: "Mobilizar a distinção em casos variados.",
        funcao: "praticar",
        unidadesDeAnalise: [],
        requisitosDeEvidencia: ["Distinguir processo, socket e conexão."]
      }]
    }
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].expectedCourseRevision, 7);
  assert.equal(writes[0].expectedPlanVersion, 3);
  assert.equal(writes[0].part.position, 0);
  assert.deepEqual(writes[0].part.microsequences.map(({ role }) => role), [
    "explain", "practice"
  ]);
  assert.equal(writes[0].part.microsequences[0].moduleId,
    writes[0].part.microsequences[1].moduleId);
  assert.equal(writes[0].part.microsequences[0].lessonId,
    writes[0].part.microsequences[1].lessonId);
  assert.equal(writes[0].part.microsequences[1].analysisUnits.length, 0);
  assert.equal(writes[0].part.microsequences[0].evidenceRequirements[0].id,
    writes[0].part.microsequences[1].evidenceRequirements[0].id);
  assert.equal(output.context.part.microsequenceCount, 2);
  assert.doesNotMatch(
    JSON.stringify(output.context),
    /courseId|partId|moduleId|lessonId|requestId/iu
  );
});

test("salvar_parte não atribui a mesma novidade a duas Microssequências", async () => {
  const value = {
    ...adapter(),
    async getCourseInstructionalPlan() {
      return {
        courseRevision: 7,
        plan: {
          version: 3,
          title: "Redes para iniciantes",
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: []
        }
      };
    },
    async listCourseEntities() {
      return { revision: 7, items: [], hasMore: false, nextCursor: null };
    },
    async saveCourseAuthoringPart() {
      assert.fail("A duplicidade semântica precisa falhar antes do commit.");
    }
  };
  const micro = (titulo) => ({
    modulo: "Comunicação",
    objetivoDoModulo: "Explicar comunicação em rede.",
    licao: "Sockets",
    objetivoDaLicao: "Relacionar processo e transporte.",
    titulo,
    objetivo: `Explicar ${titulo}.`,
    funcao: "explicar",
    unidadesDeAnalise: ["Socket relaciona processo e transporte."],
    requisitosDeEvidencia: []
  });
  await assert.rejects(() => executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: {
      curso: "Redes para iniciantes",
      titulo: "Sockets",
      intencao: "Construir a progressão.",
      microssequencias: [micro("Definição"), micro("Mecanismo")]
    }
  }), (error) => error.code === "analysis_unit_assigned_to_multiple_microsequences");
});

test("salvar_parte exige novidade somente quando a Microssequência vai explicar", async () => {
  const definition = COURSE_HUMAN_TASKS.find(({ name }) => name === "salvar_parte");
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    definition.inputSchema
  );
  const microsequence = (funcao) => ({
    modulo: "Comunicação",
    objetivoDoModulo: "Construir um modelo de comunicação em rede.",
    licao: "Sockets",
    objetivoDaLicao: "Relacionar processos e transporte.",
    titulo: funcao === "explicar" ? "Definição" : "Consolidação",
    objetivo: funcao === "explicar"
      ? "Explicar uma novidade."
      : "Retomar conhecimentos já estabelecidos.",
    funcao,
    unidadesDeAnalise: [],
    requisitosDeEvidencia: []
  });
  const args = {
    curso: "Redes para iniciantes",
    titulo: "Sockets",
    intencao: "Construir e consolidar o modelo.",
    microssequencias: [microsequence("explicar")]
  };
  assert.equal(validate(args), false);
  assert.equal(validate({ ...args, microssequencias: [microsequence("revisar")] }), true);
  await assert.rejects(() => executeHumanCourseTask({
    adapter: adapter(), principal: PRINCIPAL, name: "salvar_parte", rawArguments: args
  }), (error) => error.code === "missing_instructional_analysis_unit");
});

test("preparar_materializacao separa o inventário focal de duas Microssequências", async () => {
  const analysisEstablished = "50000000-0000-4000-8000-000000000004";
  const analysisA = "50000000-0000-4000-8000-000000000005";
  const analysisB = "50000000-0000-4000-8000-000000000006";
  const analysisOutsidePart = "50000000-0000-4000-8000-000000000007";
  const evidenceA = "60000000-0000-4000-8000-000000000001";
  const evidenceB = "60000000-0000-4000-8000-000000000002";
  const microA = "micro-definicao";
  const microB = "micro-mecanismo";
  const existingStudyUnitId = "70000000-0000-4000-8000-000000000001";
  const parameterDefinitions = [
    ["new_analysis_unit_ceiling_per_expository_study_unit", "Novas unidades de análise"],
    ["required_explanation_forms", "Formas de explicação"],
    ["minimum_distinct_practice_opportunities_per_evidence_requirement", "Práticas"],
    ["required_practice_variation_dimensions", "Variação da prática"]
  ];
  const design = (scopeRef, targetAnalysis, targetEvidence, ceiling) => ({
    scopeContext: { current: { label: scopeRef === microA ? "Definição" : "Mecanismo" } },
    definitions: parameterDefinitions.map(([id, label]) => ({ id, label })),
    parameters: parameterDefinitions.map(([parameterId], index) => ({
      parameterId,
      localAssignment: null,
      effectiveAssignment: {
        value: index === 0 ? ceiling : index === 1 ? ["plain_definition"] :
          index === 2 ? 2 : ["case_or_data"],
        inherited: true,
        origin: "automatic",
        reason: "Calibração focal.",
        sourceScope: { kind: "course" }
      }
    })),
    guidance: { localAssignment: null, effectiveAssignments: [] },
    targetPlanItems: {
      instructionalAnalysisUnitIds: targetAnalysis,
      evidenceRequirementIds: targetEvidence
    },
    componentPolicy: {
      effectiveAssignment: {
        policy: {
          catalogVersion: "fixture",
          availability: "all",
          allowedRefs: [],
          excludedRefs: [],
          preferredRefs: []
        },
        inherited: false,
        origin: "system_default",
        reason: "Política padrão.",
        sourceScope: null
      }
    }
  });
  const value = {
    ...adapter(),
    async getCourseInstructionalPlan() {
      return {
        courseId: COURSE_ID,
        courseRevision: 7,
        plan: {
          id: "40000000-0000-4000-8000-000000000004",
          version: 3,
          title: "Redes para iniciantes",
          objective: "Explicar serviços em rede.",
          instructionalAnalysisUnits: [{
            id: analysisEstablished,
            position: 0,
            statement: "Processos trocam dados por serviços de transporte.",
            introduced: true,
            introducedPartPosition: 0
          }, {
            id: analysisA,
            position: 1,
            statement: "Socket liga processo e transporte.",
            introduced: false,
            introducedPartPosition: null
          }, {
            id: analysisB,
            position: 2,
            statement: "Endereço localiza uma ponta da comunicação.",
            introduced: false,
            introducedPartPosition: null
          }, {
            id: analysisOutsidePart,
            position: 3,
            statement: "Novidade de outra Parte.",
            introduced: true,
            introducedPartPosition: 2
          }],
          evidenceRequirements: [{
            id: evidenceA, position: 0, statement: "Distinguir processo e socket."
          }, {
            id: evidenceB, position: 1, statement: "Relacionar endereço e comunicação."
          }],
          parts: [{
            id: "20000000-0000-4000-8000-000000000001",
            version: 1,
            position: 0,
            title: "Processos",
            intent: "Estabelecer o conhecimento anterior.",
            microsequences: []
          }, {
            id: PART_ID,
            version: 2,
            position: 1,
            title: "Sockets",
            intent: "Construir o modelo em duas etapas.",
            microsequences: [{
              id: microA,
              productionPosition: 0,
              title: "Definição",
              goal: "Definir socket e sua relação com o processo.",
              role: "explain",
              curriculumPath: { moduleTitle: "Comunicação", lessonTitle: "Sockets" }
            }, {
              id: microB,
              productionPosition: 1,
              title: "Mecanismo",
              goal: "Explicar como o endereço participa da comunicação.",
              role: "explain",
              curriculumPath: { moduleTitle: "Comunicação", lessonTitle: "Sockets" }
            }]
          }]
        }
      };
    },
    async listCourseStudyUnits() {
      return {
        items: [{
          studyUnit: {
            id: existingStudyUnitId,
            position: 1,
            title: "Definição já produzida"
          },
          curriculumPath: {
            didacticMicrosequence: { id: microA, title: "Definição", position: 0 }
          }
        }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourseDesign({ scopeKind, scopeRef }) {
      if (scopeKind === "study_unit") {
        assert.equal(scopeRef, existingStudyUnitId);
        const current = design(microA, [analysisA], [evidenceA], 2);
        current.parameters[0].effectiveAssignment = {
          value: 2,
          inherited: false,
          origin: "research_condition",
          reason: "Comparação deliberada.",
          sourceScope: { kind: "study_unit", ref: existingStudyUnitId }
        };
        return current;
      }
      return scopeRef === microA
        ? design(scopeRef, [analysisA], [evidenceA], 1)
        : design(scopeRef, [analysisB], [evidenceB], 2);
    }
  };

  const output = await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "preparar_materializacao",
    rawArguments: { curso: "Redes para iniciantes", parte: 2 }
  });

  assert.equal(output.result, "Preparei o recorte focal da Parte 2: Sockets.");
  assert.equal(Object.hasOwn(output.context, "instructionalAnalysisUnits"), false);
  assert.deepEqual(output.context.part.establishedAnalysisUnits, [{
    position: 1,
    statement: "Processos trocam dados por serviços de transporte."
  }]);
  assert.equal(output.context.part.microsequences.length, 2);
  assert.deepEqual(output.context.part.microsequences.map((microsequence) => ({
    title: microsequence.title,
    analysis: microsequence.instructionalAnalysisUnits,
    evidence: microsequence.evidenceRequirements,
    objective: microsequence.objective,
    function: microsequence.function,
    ceiling: microsequence.configuration.parameters[0].effectiveValue
  })), [{
    title: "Definição",
    analysis: [{ position: 2, statement: "Socket liga processo e transporte." }],
    evidence: [{ position: 1, statement: "Distinguir processo e socket." }],
    objective: "Definir socket e sua relação com o processo.",
    function: "explicar",
    ceiling: 1
  }, {
    title: "Mecanismo",
    analysis: [{ position: 3, statement: "Endereço localiza uma ponta da comunicação." }],
    evidence: [{ position: 2, statement: "Relacionar endereço e comunicação." }],
    objective: "Explicar como o endereço participa da comunicação.",
    function: "explicar",
    ceiling: 2
  }]);
  assert.equal(output.context.part.microsequences.every((microsequence) =>
    !Object.hasOwn(microsequence.configuration, "targets")), true);
  assert.deepEqual(
    output.context.part.microsequences[0].existingStudyUnitOverrides.map((unit) => ({
      position: unit.position,
      title: unit.title,
      ceiling: unit.configuration.parameters[0].effectiveValue,
      sourceScope: unit.configuration.parameters[0].sourceScope
    })),
    [{
      position: 1,
      title: "Definição já produzida",
      ceiling: 2,
      sourceScope: "study_unit"
    }]
  );
  assert.deepEqual(
    output.context.part.microsequences[1].existingStudyUnitOverrides,
    []
  );
  assert.doesNotMatch(JSON.stringify(output.context.part), /Novidade de outra Parte/u);
  assert.doesNotMatch(JSON.stringify(output.context.part), /[0-9a-f]{8}-[0-9a-f-]{27,}/iu);
});

test("#272 schemas, descrições e annotations distinguem leitura de escrita", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const forbidden = /^(?:id|ids|courseId|revision|version|hash|path|requestId|expectedRevision|expectedPlanVersion|cursor)$/iu;
  for (const task of COURSE_HUMAN_TASKS) {
    assert.doesNotThrow(() => ajv.compile(task.inputSchema), task.name);
    assert.match(task.description, /^Use\b/u, task.name);
    assert.match(task.description, /\bNão\b/iu, task.name);
    assert.equal(task.annotations.openWorldHint, false, task.name);
    assert.equal(task.annotations.destructiveHint, false, task.name);
    assert.equal(typeof task.annotations.readOnlyHint, "boolean", task.name);
    for (const [name, property] of Object.entries(task.inputSchema.properties || {})) {
      assert.doesNotMatch(name, forbidden, `${task.name}.${name}`);
      assert.ok(property.description?.length >= 12, `${task.name}.${name}`);
    }
    visit(task.inputSchema, (entry, path) => {
      for (const name of Object.keys(entry.properties || {})) {
        if (name === "file_id") continue;
        assert.doesNotMatch(name, forbidden, `${task.name}:${path}.${name}`);
      }
    });
  }
  const config = ajv.compile(COURSE_HUMAN_TASKS.find(({ name }) => (
    name === "ajustar_configuracao"
  )).inputSchema);
  const source = ajv.compile(COURSE_HUMAN_TASKS.find(({ name }) => (
    name === "manter_fonte"
  )).inputSchema);
  const components = ajv.compile(COURSE_HUMAN_TASKS.find(({ name }) => (
    name === "consultar_componentes"
  )).inputSchema);
  assert.equal(config({ curso: "Redes" }), false);
  assert.equal(source({ curso: "Redes" }), false);
  assert.equal(components({}), false);
});

test("#272 autorização filtra writes e recusa input mecânico antes do domínio", async () => {
  assert.equal(courseHumanTaskIsAllowed("retomar_curso", READ_PRINCIPAL), true);
  assert.equal(courseHumanTaskIsAllowed("criar_curso", READ_PRINCIPAL), false);
  assert.equal(courseHumanTasksForPrincipal(READ_PRINCIPAL).length, 8);
  assert.equal(courseHumanTasksForPrincipal({ actorId: PRINCIPAL.actorId, scopes: [] }).length, 0);
  await assert.rejects(
    () => executeHumanCourseTask({
      adapter: adapter(),
      principal: PRINCIPAL,
      name: "retomar_curso",
      rawArguments: { titulo: "Redes", courseId: COURSE_ID }
    }),
    (error) => error.status === 422 && error.code === "unknown_human_task_argument"
  );
  await assert.rejects(
    () => executeHumanCourseTask({
      adapter: adapter(READ_PRINCIPAL),
      principal: READ_PRINCIPAL,
      name: "criar_curso",
      rawArguments: { titulo: "Novo", objetivo: "Objetivo" }
    }),
    (error) => error.status === 403 && error.code === "insufficient_scope"
  );
});

test("#272 tools/list expõe catálogo focal sem alias e respeita o escopo OAuth", async () => {
  const fullResponse = await mcpHandler()(request("tools/list", {
    _meta: { progressToken: "human-catalog" }
  }));
  const full = await fullResponse.json();
  assert.deepEqual(full.result.tools.map(({ name }) => name), EXPECTED_NAMES);
  assert.deepEqual(full.result._meta.humanTaskCatalog, COURSE_HUMAN_TASK_CATALOG_METADATA);
  assert.equal(fullResponse.headers.get("X-AraLearn-Authoring-Projection"), null);
  assert.match(
    fullResponse.headers.get("X-AraLearn-Authoring-Mcp-Catalog"),
    /aralearn\.human-authoring-tasks/u
  );
  for (const tool of full.result.tools) {
    assert.deepEqual(tool.securitySchemes, [{ type: "oauth2", scopes: ["offline_access"] }]);
  }

  const readResponse = await mcpHandler(READ_PRINCIPAL)(request("tools/list"));
  const read = await readResponse.json();
  assert.equal(read.result.tools.length, 8);
  assert.equal(read.result.tools.every(({ annotations }) => annotations.readOnlyHint), true);

  const invalidResponse = await mcpHandler()(request("tools/list", { cursor: "legacy" }));
  const invalid = await invalidResponse.json();
  assert.equal(invalid.error.code, -32602);

  const deniedResponse = await mcpHandler(READ_PRINCIPAL)(request("tools/call", {
    name: "criar_curso",
    arguments: { titulo: "Novo", objetivo: "Objetivo" }
  }));
  const denied = await deniedResponse.json();
  assert.equal(denied.result.isError, true);
  assert.equal(denied.result.structuredContent.error.code, "insufficient_scope");
  assert.equal(Object.hasOwn(denied.result.structuredContent, "requestId"), false);
  assert.equal(Object.hasOwn(denied.result.structuredContent.error, "recovery"), false);
});

test("#272 chamada MCP retorna coordenação curta e contexto sem estado técnico", async () => {
  const response = await mcpHandler()(request("tools/call", {
    name: "retomar_curso",
    arguments: { titulo: "Redes para iniciantes" }
  }));
  const payload = await response.json();
  assert.equal(payload.result.isError, false);
  assert.equal(payload.result.structuredContent.result, "Retomei o Curso “Redes para iniciantes”.");
  assert.equal(Object.hasOwn(payload.result.structuredContent, "ok"), false);
  assert.equal(Object.hasOwn(payload.result.structuredContent, "requestId"), false);
  assert.equal(Object.hasOwn(payload.result.structuredContent, "data"), false);
  assert.doesNotMatch(payload.result.content[0].text, /https?:\/\//u);
  assert.match(payload.result.content[0].text, /Abrir no AraLearn\./u);
  const serializedContext = JSON.stringify(payload.result.structuredContent.context);
  assert.doesNotMatch(serializedContext, /courseId|requestId|revision|version|hash|path|resultFacts/iu);

});

test("#272 corpus de seleção MCP cobre cada objetivo e negativas sem ferramenta", async () => {
  const golden = JSON.parse(await fs.readFile(new URL(
    "../fixtures/human-authoring-golden-prompts.v2.json",
    import.meta.url
  ), "utf8"));
  const names = new Set(EXPECTED_NAMES);
  const positive = golden.cases.filter(({ expectedTool }) => expectedTool !== null);
  const negative = golden.cases.filter(({ expectedTool }) => expectedTool === null);
  for (const name of names) {
    assert.equal(positive.filter(({ expectedTool }) => expectedTool === name).length, 2, name);
  }
  assert.equal(negative.length, 8);
  assert.equal(negative.every(({ class: className }) => className === "negative"), true);
});

test("#272 manter_fonte relê criação por identidade interna e preserva outros vínculos", async () => {
  const sources = [{
    sourceId: "source-existing-a",
    revision: 2,
    title: "Manual duplicado",
    kind: "document",
    authorship: null,
    publicationDate: null,
    identifier: null,
    language: null,
    citationText: null,
    url: null,
    editionOrVersion: null,
    origin: "author_provided",
    availability: "unknown",
    verificationStatus: "unverified",
    studyVisibility: "hidden",
    anchors: [{
      anchorId: "anchor-existing-a",
      revision: 1,
      humanLocator: "Seção 4.2",
      verificationExcerpt: "Trecho A"
    }]
  }, {
    sourceId: "source-other",
    revision: 3,
    title: "Outra Fonte",
    anchors: [{
      anchorId: "anchor-other",
      revision: 2,
      humanLocator: "Página 2",
      verificationExcerpt: "Trecho B"
    }]
  }];
  const sourceCommands = [];
  const sourceAdapter = {
    ...adapter(),
    async listCourseStudyUnits() {
      return {
        items: [{
          ordinal: 1,
          version: 4,
          studyUnit: { id: "unit-one", title: "Unidade um", version: 4 }
        }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourseSources(options) {
      if (options.mode === "source") {
        const source = sources.find(({ sourceId }) => sourceId === options.sourceId);
        return { source, items: source ? [source] : [], nextCursor: null };
      }
      if (options.mode === "target") {
        return {
          items: [{
            sourceLinks: [{
              sourceId: "source-other",
              relation: "supported_by",
              anchors: [{ anchorId: "anchor-other" }]
            }]
          }],
          nextCursor: null
        };
      }
      return { items: sources, nextCursor: null };
    },
    async executeCourseSourceCommand(value) {
      sourceCommands.push(structuredClone(value.command));
      if (value.command.type === "save_source" &&
          !sources.some(({ sourceId }) => sourceId === value.command.sourceId)) {
        sources.push({
          sourceId: value.command.sourceId,
          revision: 1,
          ...structuredClone(value.command.source),
          anchors: []
        });
      }
      return { changed: true };
    }
  };

  const created = await executeHumanCourseTask({
    adapter: sourceAdapter,
    principal: PRINCIPAL,
    name: "manter_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      metadados: { tipo: "document", titulo: "Manual duplicado" }
    }
  });
  assert.match(created.result, /Atualizei a Fonte/u);
  assert.equal(sourceCommands[0].type, "save_source");
  assert.notEqual(sourceCommands[0].sourceId, "source-existing-a");

  await executeHumanCourseTask({
    adapter: sourceAdapter,
    principal: PRINCIPAL,
    name: "manter_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      fonte: 1,
      vinculos: [{
        unidade: "Unidade um",
        relacao: "informed_by",
        ancoras: ["Seção 4.2"]
      }]
    }
  });
  const binding = sourceCommands.at(-1);
  assert.equal(binding.type, "set_target_sources");
  assert.deepEqual(binding.sourceLinks.map(({ sourceId }) => sourceId), [
    "source-other", "source-existing-a"
  ]);
  assert.deepEqual(binding.sourceLinks[0].anchors, [{
    anchorId: "anchor-other"
  }]);
});

test("#272 PDF aceita download_url somente como dado gerido pelo transporte", async () => {
  const pdfTask = COURSE_HUMAN_TASKS.find(({ name }) => name === "incorporar_pdf_como_fonte");
  assert.equal(Object.hasOwn(pdfTask.inputSchema.properties.pdf.properties, "download_url"), false);
  const sources = [];
  const ingestions = [];
  const pdfAdapter = {
    ...adapter(),
    async getCourseSources() {
      return { items: sources, nextCursor: null };
    },
    async getCourseSourcePdfIngestionReceipt() {
      return null;
    },
    async fetchImpl(url) {
      assert.match(String(url), /^https:\/\/files\.oaiusercontent\.com\//u);
      return new Response(new TextEncoder().encode("%PDF-1.4\n%%EOF"), {
        status: 200,
        headers: { "Content-Type": "application/pdf" }
      });
    },
    async ingestCourseSourcePdf(value) {
      ingestions.push(value);
      sources.push({
        sourceId: value.sourceIntent.sourceId,
        revision: 1,
        title: value.sourceIntent.source.title
      });
      return { stored: true };
    }
  };
  const output = await executeHumanCourseTask({
    adapter: pdfAdapter,
    principal: PRINCIPAL,
    name: "incorporar_pdf_como_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      titulo: "Manual do proxy",
      intencao: "Manter o documento entre as Fontes.",
      pdf: {
        file_id: "file-123",
        file_name: "manual.pdf",
        mime_type: "application/pdf",
        download_url: "https://files.oaiusercontent.com/manual.pdf?token=temporary"
      }
    }
  });
  assert.equal(output.result, "Mantive o PDF entre as Fontes do Curso.");
  assert.equal(ingestions.length, 1);
  assert.equal(ingestions[0].fileIdentity.fileId, "file-123");
});

test("#272 PDF anexado a Fonte existente relê a Fonte solicitada após o commit", async () => {
  const existing = {
    sourceId: "source-existing",
    revision: 2,
    title: "Manual existente",
    citationText: "Manual existente"
  };
  const pdfAdapter = {
    ...adapter(),
    async ingestCourseSourcePdf() {
      assert.fail("O recibo existente deve impedir nova ingestão.");
    },
    async getCourseSources({ mode, sourceId }) {
      if (mode === "catalog") return { items: [existing], nextCursor: null };
      return {
        source: sourceId === existing.sourceId ? existing : null,
        items: sourceId === existing.sourceId ? [existing] : [],
        nextCursor: null
      };
    },
    async getCourseSourcePdfIngestionReceipt() {
      return { stored: true };
    }
  };
  const output = await executeHumanCourseTask({
    adapter: pdfAdapter,
    principal: PRINCIPAL,
    name: "incorporar_pdf_como_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      fonte: "Manual existente",
      titulo: "Título opcional que não identifica a Fonte",
      intencao: "Anexar o PDF à Fonte já escolhida.",
      pdf: {
        file_id: "file-existing",
        mime_type: "application/pdf",
        download_url: "https://files.oaiusercontent.com/existing.pdf?token=temporary"
      }
    }
  });
  assert.equal(output.result, "Mantive o PDF entre as Fontes do Curso.");
});

test("#272 resultado final remove maquinaria técnica mesmo depois de anexar guidance", async () => {
  const output = await executeHumanCourseTask({
    adapter: {
      ...adapter(),
      async getCourseSources() {
        return {
          items: [{
            title: "Fonte legível",
            steps: [{ payload: { requestId: "internal" } }],
            runs: [{ duration: 12 }],
            materialization: { hash: "a".repeat(64) }
          }],
          nextCursor: null
        };
      }
    },
    principal: PRINCIPAL,
    name: "consultar_fontes",
    rawArguments: { curso: "Redes para iniciantes" }
  });
  const serialized = JSON.stringify(output.context);
  assert.doesNotMatch(serialized, /steps|payload|requestId|runs|duration|materialization|hash/iu);
  assert.match(serialized, /guidance/iu);
});

test("#272 guidance participa do limite do envelope final", async () => {
  await assert.rejects(() => executeHumanCourseTask({
    adapter: {
      ...adapter(),
      async getCourseSources() {
        return {
          items: [{ title: "Fonte extensa", excerpt: "x".repeat(522_000) }],
          nextCursor: null
        };
      }
    },
    principal: PRINCIPAL,
    name: "consultar_fontes",
    rawArguments: { curso: "Redes para iniciantes" }
  }), (error) => error.status === 413 && error.code === "human_task_result_too_large");
});

test("#272 Observações de uma Parte paginam todas as Units e excluem outros alvos", async () => {
  let unitPages = 0;
  const scopedAdapter = {
    ...adapter(),
    async listCourseStudyUnits({ cursorStudyUnitId }) {
      unitPages += 1;
      return cursorStudyUnitId === null
        ? {
            items: [{ ordinal: 1, studyUnit: { id: "unit-part-a", title: "Unit A" } }],
            hasMore: true,
            nextCursor: { studyUnitId: "unit-part-a" }
          }
        : {
            items: [{ ordinal: 2, studyUnit: { id: "unit-part-b", title: "Unit B" } }],
            hasMore: false,
            nextCursor: null
          };
    },
    async getCourseAnchoredAnnotations() {
      return {
        items: [{
          annotationId: "annotation-part",
          target: { kind: "study_unit", id: "unit-part-b" },
          rawText: "Observação da Parte."
        }, {
          annotationId: "annotation-outside",
          target: { kind: "study_unit", id: "unit-outside" },
          rawText: "Observação de outra Parte."
        }],
        nextCursor: null
      };
    }
  };
  const output = await executeHumanCourseTask({
    adapter: scopedAdapter,
    principal: PRINCIPAL,
    name: "consultar_observacoes",
    rawArguments: { curso: "Redes para iniciantes", parte: 1 }
  });
  assert.equal(output.result, "1 Observação encontrada.");
  assert.equal(unitPages, 2);
  assert.match(JSON.stringify(output.context), /Observação da Parte/u);
  assert.doesNotMatch(JSON.stringify(output.context), /outra Parte/u);
});

test("#272 configuração invalida todo o pedido antes da primeira escrita", async () => {
  let writes = 0;
  await assert.rejects(() => executeHumanCourseTask({
    adapter: {
      ...adapter(),
      async applyCourseDesignCommand() {
        writes += 1;
        return { changed: true };
      }
    },
    principal: PRINCIPAL,
    name: "ajustar_configuracao",
    rawArguments: {
      curso: "Redes para iniciantes",
      parametrosPedagogicos: {
        tetoNovasUnidadesDeAnalise: 2,
        formasDeExplicacao: ["forma-inexistente"]
      }
    }
  }), (error) => typeof error.code === "string");
  assert.equal(writes, 0);
});

test("#272 configuração e Observações escrevem por objetivos focais", async () => {
  const designCommands = [];
  const observationBatches = [];
  const writeAdapter = {
    ...adapter(),
    async getCourseDesign() {
      return {
        definitions: [{
          id: "new_analysis_unit_ceiling_per_expository_study_unit",
          label: "Novas unidades de análise"
        }],
        parameters: [{
          parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
          localAssignment: { value: 1 },
          effectiveAssignment: { value: 1, inherited: false, origin: "author" }
        }],
        guidance: { localAssignment: null, effectiveAssignments: [] },
        targetPlanItems: null
      };
    },
    async applyCourseDesignCommand(value) {
      designCommands.push(structuredClone(value.command));
      return { changed: true };
    },
    async listCourseStudyUnits() {
      return {
        items: [{
          ordinal: 1,
          version: 2,
          studyUnit: { id: "unit-one", title: "Unidade um", version: 2 }
        }, {
          ordinal: 2,
          version: 3,
          studyUnit: { id: "unit-two", title: "Unidade dois", version: 3 }
        }],
        hasMore: false,
        nextCursor: null
      };
    },
    async createCourseAnchoredAnnotations(value) {
      observationBatches.push(structuredClone(value));
      return { changed: true, createdCount: value.commands.length };
    }
  };
  const configured = await executeHumanCourseTask({
    adapter: writeAdapter,
    principal: PRINCIPAL,
    name: "ajustar_configuracao",
    rawArguments: {
      curso: "Redes para iniciantes",
      parametrosPedagogicos: { tetoNovasUnidadesDeAnalise: 1 },
      direcaoEditorial: "Use títulos informativos; crie mais Units se necessário."
    }
  });
  assert.deepEqual(designCommands.map(({ type }) => type), [
    "set_parameter", "set_guidance"
  ]);
  assert.equal(designCommands.every(({ origin }) => origin === "automatic"), true);
  assert.doesNotMatch(JSON.stringify(configured.context), /definitions|componentCatalog|recentApplications/u);

  await executeHumanCourseTask({
    adapter: writeAdapter,
    principal: PRINCIPAL,
    name: "ajustar_configuracao",
    rawArguments: {
      curso: "Redes para iniciantes",
      unidade: "Unidade um",
      condicao: "pesquisa",
      parametrosPedagogicos: { tetoNovasUnidadesDeAnalise: 2 }
    }
  });
  assert.deepEqual(designCommands.at(-1), {
    type: "set_parameter",
    scope: { kind: "study_unit", ref: "unit-one" },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 2,
    origin: "research_condition",
    reason: "Condição de pesquisa fixada explicitamente."
  });

  const observed = await executeHumanCourseTask({
    adapter: writeAdapter,
    principal: PRINCIPAL,
    name: "registrar_observacao",
    rawArguments: {
      curso: "Redes para iniciantes",
      unidades: [1, 2],
      texto: "A transição precisa ser revista.",
      categoria: "suggestion"
    }
  });
  assert.equal(observationBatches.length, 1);
  assert.deepEqual(observationBatches[0].commands.map(({ target }) => target.id), [
    "unit-one", "unit-two"
  ]);
  assert.equal(new Set(observationBatches[0].commands.map(({ annotationId }) =>
    annotationId)).size, 2);
  assert.equal(new Set(observationBatches[0].commands.map(({ capturedAt }) =>
    capturedAt)).size, 1);
  assert.match(observed.result, /separadamente em 2 Unidades/u);
});
