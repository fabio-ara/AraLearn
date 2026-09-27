import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { defaultAuthoringProcessPreferences } from "../../src/domain/authoringProcessPreferences.js";
import { fixtureAppliedParameters, courseDesignFixture } from "../helpers/courseDesignFixture.js";
import { reconciledExplanationFixture } from "../helpers/reconciledExplanationFixture.js";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { createAuthoringMcpHandler, ARALEARN_MCP_PROTOCOL_VERSION } from
  "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import { createAuthoringActionHandler } from
  "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import { encodeCourseActionTaskRequest } from
  "../../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { completeFocalMaterialization } from
  "../../supabase/functions/_shared/aralearn-authoring/courseFocalMaterialization.js";
import { fixture, COURSE, IDEA, EVIDENCE } from "../support/authoringMaterializationPglite.js";

const TITLE = "Curso sintético";
const MICRO = "micro";
const MICRO_TITLE = "Sequência inicial";
const MICRO_2 = "micro-2";
const MICRO_3 = "micro-3";
const MICRO_2_TITLE = "Segunda sequencia";
const MICRO_3_TITLE = "Terceira sequencia";
const IDEA_2 = "30000000-0000-4000-8000-000000000002";
const IDEA_3 = "30000000-0000-4000-8000-000000000003";
const IDEA_4 = "30000000-0000-4000-8000-000000000004";
const EVIDENCE_2 = "40000000-0000-4000-8000-000000000002";
const EVIDENCE_3 = "40000000-0000-4000-8000-000000000003";
const EVIDENCE_4 = "40000000-0000-4000-8000-000000000004";
const EVIDENCE_5 = "40000000-0000-4000-8000-000000000005";
const PRINCIPAL = { actorId: COURSE, scopes: ["authoring:read", "authoring:write"] };

async function seedDraftCourse(options = {}) {
  const db = await fixture();
  await db.exec([
    "delete from private.course_authoring_part_didactic_microsequences",
    "delete from private.course_authoring_parts",
    "update private.course_instructional_plans set curriculum_map_status=" + (options.approved ? "'approved'" : "'draft'")
  ].join(";\n"));
  const explicacao = reconciledExplanationFixture([{ text: "Prosa humana preservada.", analysisUnitIds: [IDEA] }],
    { title: "Base anterior" });
  await db.query("update private.course_entities set content = jsonb_set(jsonb_set(content,'{explanation}', $1::jsonb)," +
    " '{title}', to_jsonb($4::text)) where course_id=$2 and entity_type='microsequence' and entity_id=$3",
  [JSON.stringify(explicacao), COURSE, MICRO, MICRO_TITLE]);
  await db.exec([
    "insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description) values",
    "  ('" + IDEA_2 + "'," + "'" + COURSE + "','" + COURSE + "','instructional_analysis_unit',1,'Segundo papel da oferta',''),",
    "  ('" + IDEA_3 + "','" + COURSE + "','" + COURSE + "','instructional_analysis_unit',2,'Terceiro papel da oferta',''),",
    "  ('" + IDEA_4 + "','" + COURSE + "','" + COURSE + "','instructional_analysis_unit',3,'Quarto papel da oferta',''),",
    "  ('" + EVIDENCE_2 + "','" + COURSE + "','" + COURSE + "','evidence_requirement',1,'Calcular a parcela variável',''),",
    "  ('" + EVIDENCE_3 + "','" + COURSE + "','" + COURSE + "','evidence_requirement',2,'Selecionar conclusões sustentadas',''),",
    "  ('" + EVIDENCE_4 + "','" + COURSE + "','" + COURSE + "','evidence_requirement',3,'Rejeitar generalização',''),",
    "  ('" + EVIDENCE_5 + "','" + COURSE + "','" + COURSE + "','evidence_requirement',4,'Aplicar a mesma quantidade','')"
  ].join("\n"));
  return { db };
}

function stateReader(db, { stalePlan = false } = {}) {
  const alvosDaMicrossequencia = async (microsequenceId = MICRO) => {
    const alvos = (await db.query(
      "select plan_item_id id, plan_item_kind kind from private.course_design_target_plan_items" +
      " where course_id=$1 and didactic_microsequence_id=$2 order by plan_item_kind, plan_item_id",
      [COURSE, microsequenceId])).rows;
    return { instructionalAnalysisUnitIds: alvos.filter(alvo => alvo.kind === "instructional_analysis_unit").map(alvo => alvo.id),
      evidenceRequirementIds: alvos.filter(alvo => alvo.kind === "evidence_requirement").map(alvo => alvo.id) };
  };
  const curso = async () => (await db.query("select revision from public.courses where id=$1", [COURSE])).rows[0].revision;
  const plano = async () => (await db.query(
    "select version, curriculum_map_status status from private.course_instructional_plans where course_id=$1", [COURSE])).rows[0];
  return {
    async getAuthoringProcessPreferences() {
      return { contract: "aralearn.authoring-process-preferences.v1", revision: 2,
        updatedAt: "2026-09-26T00:00:00Z",
        preferences: { ...defaultAuthoringProcessPreferences(),
          reviewPoints: ["curricular_map", "explanation", "study_unit"] } };
    },
    async listCourses() {
      return { items: [{ courseId: COURSE, title: TITLE }], hasMore: false, nextCursor: null };
    },
    async getCourse() {
      return { courseId: COURSE, title: TITLE, revision: await curso() };
    },
    async getCourseSources() {
      return { items: [{ sourceLinks: [] }], nextCursor: null };
    },
    async getCourseInstructionalPlan() {
      const plan = await plano();
      const micros = (await db.query(
        "select entity_id id, position, content from private.course_entities" +
        " where course_id=$1 and entity_type='microsequence' order by position", [COURSE])).rows;
      const partes = (await db.query(
        "select id, position, title, version from private.course_authoring_parts where course_id=$1 order by position, id", [COURSE])).rows;
      const membros = (await db.query(
        "select authoring_part_id, didactic_microsequence_id id, production_position from private.course_authoring_part_didactic_microsequences where course_id=$1 order by production_position",
        [COURSE])).rows;
      const tituloPorMicro = new Map(micros.map(micro => [micro.id, micro.content?.title ?? micro.id]));
      const dependenciasPorMicro = new Map(micros.map(micro => [micro.id, micro.content?.dependsOn ?? []]));
      const items = (await db.query(
        "select id, item_kind, position, statement, description from private.course_instructional_plan_items where course_id=$1 order by item_kind, position",
        [COURSE])).rows;
      const unidadesPersistidas = (await db.query("select entity_id, parent_id," +
        " design_application->'introducedInstructionalAnalysisUnitIds' ids" +
        " from private.course_entities where course_id=$1 and entity_type='study_unit'", [COURSE])).rows;
      const unidadesPorMicro = new Map();
      for (const unidade of unidadesPersistidas) {
        unidadesPorMicro.set(unidade.parent_id, (unidadesPorMicro.get(unidade.parent_id) ?? 0) + 1);
      }
      const introducaoPorIdeia = new Map();
      for (const unidade of unidadesPersistidas) {
        for (const ideia of unidade.ids ?? []) {
          if (!introducaoPorIdeia.has(ideia)) introducaoPorIdeia.set(ideia, { studyUnitId: unidade.entity_id,
            didacticMicrosequenceId: unidade.parent_id, title: tituloPorMicro.get(unidade.parent_id) ?? MICRO_TITLE });
        }
      }
      return { contract: "aralearn.course-instructional-plan.v3", courseRevision: await curso(),
        planVersion: Number(plan.version) + (stalePlan ? 5 : 0),
        plan: { version: Number(plan.version) + (stalePlan ? 5 : 0), title: TITLE,
          curriculumMapStatus: plan.status,
          curriculum: { modules: [{ id: "module", position: 0, title: "Módulo", lessons: [{ id: "lesson", position: 0,
            title: "Lição", microsequences: micros.map(micro => ({ id: micro.id, position: micro.position,
              title: micro.content?.title ?? micro.id,
              dependencyMicrosequenceIds: dependenciasPorMicro.get(micro.id) ?? [],
              ...(micro.content?.explanation ? { explanation: micro.content.explanation } : {}) })) }] }] },
          instructionalAnalysisUnits: items.filter(item => item.item_kind === "instructional_analysis_unit")
            .map(item => ({ id: item.id, position: item.position, statement: item.statement, description: item.description ?? "",
              introducedAt: introducaoPorIdeia.get(item.id) ?? null,
              usedBy: [], revisitedBy: [], version: 1 })),
          evidenceRequirements: items.filter(item => item.item_kind === "evidence_requirement")
            .map(item => ({ id: item.id, position: item.position, statement: item.statement, description: item.description ?? "" })),
          parts: partes.map(part => ({ id: part.id, position: part.position, title: part.title, version: part.version,
            microsequences: membros.filter(member => member.authoring_part_id === part.id)
              .map(member => ({ id: member.id, productionPosition: member.production_position,
                studyUnitCount: unidadesPorMicro.get(member.id) ?? 0,
                title: tituloPorMicro.get(member.id) ?? MICRO_TITLE })) })) } };
    },
    async getCourseDesign(request) {
      const scope = request.scopeKind === "course" ? "course"
        : request.scopeKind === "study_unit" ? "study_unit" : "didactic_microsequence";
      const base = courseDesignFixture({ courseId: COURSE, moduleId: "module", lessonId: "lesson",
        microsequenceId: MICRO, studyUnitId: request.scopeRef ?? "study-unit" },
      { scope, revision: await curso() });
      const aplicados = new Map(fixtureAppliedParameters([
        ["new_analysis_unit_ceiling_per_expository_study_unit", 1],
        ["required_explanation_forms", ["plain_definition"]],
        ["minimum_distinct_practice_opportunities_per_evidence_requirement", 1],
        ["required_practice_variation_dimensions", ["task_feature"]],
        ["authoring_chat_response_word_target", 90],
        ["study_unit_content_word_target", 180]
      ], { origin: "author", scope }).map(entrada => [entrada.parameterId, { ...entrada.effectiveAssignment,
        inherited: entrada.effectiveAssignment.sourceScope.kind !== scope,
        sourceScope: { ...entrada.effectiveAssignment.sourceScope,
          ref: entrada.effectiveAssignment.sourceScope.kind === "course" ? COURSE : MICRO } }]));
      return { ...base,
        targetPlanItems: scope === "course" ? base.targetPlanItems
          : await alvosDaMicrossequencia(scope === "didactic_microsequence" ? request.scopeRef ?? MICRO : MICRO),
        parameters: base.parameters.map(entrada => ({ ...entrada,
          effectiveAssignment: aplicados.get(entrada.parameterId) ?? entrada.effectiveAssignment })) };
    },
    async listCourseStudyUnits(request = {}) {
      let escopo = null;
      if (request.scopeKind === "authoring_part") {
        if (!request.scopeId) return { items: [], hasMore: false, nextCursor: null };
        escopo = new Set((await db.query("select didactic_microsequence_id id from" +
          " private.course_authoring_part_didactic_microsequences where course_id=$1 and authoring_part_id=$2",
        [COURSE, request.scopeId])).rows.map(linha => linha.id));
      } else if (request.scopeKind === "didactic_microsequence") {
        escopo = new Set(request.scopeId ? [request.scopeId] : []);
      }
      const linhas = (await db.query("select entity_id id, parent_id micro, position, version, content," +
        " design_snapshot, design_application from private.course_entities" +
        " where course_id=$1 and entity_type='study_unit' order by position, entity_id", [COURSE])).rows
        .filter(linha => escopo === null || escopo.has(linha.micro));
      const titulos = new Map((await db.query("select entity_id id, content->>'title' title" +
        " from private.course_entities where course_id=$1 and entity_type='microsequence'", [COURSE]))
        .rows.map(linha => [linha.id, linha.title ?? linha.id]));
      return { items: linhas.map((linha, index) => ({
        studyUnit: { id: linha.id, title: linha.content?.title ?? linha.id, role: linha.content?.role,
          position: Number(linha.position), content: linha.content?.content ?? [] },
        designSnapshot: linha.design_snapshot ?? undefined,
        designApplication: linha.design_application ?? undefined,
        version: Number(linha.version), ordinal: index + 1,
        curriculumPath: { didacticMicrosequence: { id: linha.micro, title: titulos.get(linha.micro) ?? linha.micro } },
        authorship: { createdOrigin: "ai", lastRevisionOrigin: "ai", design: {} }, authoringPart: null
      })), hasMore: false, nextCursor: null };
    }
  };
}

function sqlAdapter(db, writes, options = {}) {
  const lectura = stateReader(db, options);
  const traducir = (error) => {
    const codigo = String(error?.code ?? "");
    const mensaje = String(error?.message ?? "");
    if (codigo === "42501") return new AuthoringApiError(403, "not_authorized", "A operação não foi autorizada.");
    if (codigo === "23514" && /aprovacao do mapa curricular|aprovado antes da materializacao/u.test(mensaje)) {
      return new AuthoringApiError(409, "curricular_map_not_approved",
        "A produção só pode ser organizada depois da aprovação do mapa curricular. Aprove o mapa ou retome o foco autorizado antes de continuar.");
    }
    if (codigo === "23514" && /Uma dependencia curricular precisa estar produzida/u.test(mensaje)) {
      return new AuthoringApiError(409, "curricular_dependency_not_produced",
        "Há um pré-requisito curricular ainda sem unidade produzida fora deste lote. Produza essa dependência antes ou inclua as duas no mesmo pedido.");
    }
    if (codigo === "40001" || /mudou; releia/u.test(mensaje)) return new AuthoringApiError(409, "stale_course_state",
      "O curso ou o planejamento mudou; releia antes de continuar.");
    if (codigo === "23514") return new AuthoringApiError(409, "invalid_course_command", "A operação conflita com o estado existente.");
    return new AuthoringApiError(503, "course_service_unavailable",
      "O serviço de Cursos não concluiu a operação. [" + codigo + "] " + mensaje.slice(0, 200));
  };
  const cifrar = (valor) => createHash("sha256").update(typeof valor === "string" ? valor : JSON.stringify(valor)).digest("hex");
  return {
    ...lectura,
    writes,
    publicAppUrl: "https://app.example",
    supabaseUrl: "https://project.example",
    async resolvePrincipal() {
      return { ...PRINCIPAL, authenticationKind: "oauth" };
    },
    // Stub explícito da autenticação do canal Actions: confere apenas a forma do
    // hash do token. Não é prova de OAuth hospedado.
    async resolveActionPrincipal(hash) {
      assert.match(hash, /^[0-9a-f]{64}$/u);
      return { ...PRINCIPAL, authenticationKind: "action" };
    },
    async getCourseAnchoredAnnotations() {
      return { items: [], annotationSetVersion: 1, hasMore: false, nextCursor: null };
    },
    async getCourseContentReview({ courseId, targetKind, targetId }) {
      return { contract: "aralearn.course-content-review.v1", courseId,
        courseRevision: await lectura.getCourse().then(curso => curso.revision), targetKind, targetId,
        entityVersion: 1, basisHash: "a".repeat(64), contentReview: { state: "unregistered" }, reviewPolicy: "saved" };
    },
    async saveCourseAuthoringPart(request) {
      writes.push({ operation: "save", allowDraftMap: request.allowDraftMap === true });
      try {
        const rows = await db.query(
          "select public.save_course_authoring_part_for_actor_v1($1,$2,$3,$4,$5,$6,$7,$8) value",
          [request.principal.actorId, request.courseId, request.expectedCourseRevision, request.expectedPlanVersion,
            request.part, request.requestId,
            cifrar({ courseId: request.courseId, expectedCourseRevision: request.expectedCourseRevision,
              expectedPlanVersion: request.expectedPlanVersion, part: request.part }),
            request.allowDraftMap === true]);
        return { ...rows.rows[0].value, changed: rows.rows[0].value.idempotent !== true };
      } catch (error) { throw traducir(error); }
    },
    async materializeCourseAuthoringPart(request) {
      writes.push({ operation: "materialize", allowDraftMap: request.allowDraftMap === true, request: structuredClone(request) });
      try {
        const rows = await db.query(
          "select public.materialize_course_authoring_part_for_actor_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) value",
          [request.principal.actorId, request.courseId, request.authoringPartId, request.expectedCourseRevision,
            request.expectedAuthoringPartVersion, request.planItemUpserts, request.targetPlanItems, request.units,
            request.requestId,
            cifrar({ courseId: request.courseId, authoringPartId: request.authoringPartId, units: request.units,
              placements: request.placements, complete: request.complete }),
            request.explanations, request.complete,
            request.placements, request.allowDraftMap === true]);
        return rows.rows[0].value;
      } catch (error) { throw traducir(error); }
    }
  };
}

function gptPayload() {
  return {
    microssequencia: MICRO_TITLE,
    posicao: 1,
    conteudo: {
      title: "Prática 1 — Não confunda custo fixo com total",
      role: "practice",
      content: [{ id: "contexto", package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: "Uma oferta tem mensalidade e cobrança por uso." } }],
      response: { id: "resposta", package: "aralearn.response.choice", version: "1.0.0",
        data: { question: "Qual é o principal problema do raciocínio?", selectionMode: "single",
          selectionCriterion: "correct", answerIds: ["b"],
          options: [
            { id: "a", text: "A menor mensalidade sempre vence.", feedback: "A mensalidade é apenas uma parcela." },
            { id: "b", text: "Comparar só a parcela fixa ignora o uso.", feedback: "Correto: aplique as duas regras à mesma quantidade." },
            { id: "c", text: "Basta comparar os preços unitários.", feedback: "Isso ainda compara papéis diferentes." },
            { id: "d", text: "Regras diferentes impedem comparação.", feedback: "É possível comparar na mesma quantidade." }
          ] } },
      feedback: [{ id: "retorno", package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: "Identifique o papel de cada valor antes de somar." } }],
      topics: ["comparação de ofertas"]
    },
    aplicacaoPedagogica: {
      // O payload capturado apenas usava a ideia; como não há unidade anterior
      // que a estabeleça, o caso focal a introduz e a pratica na primeira
      // unidade (modo misto), preservando a forma e o conteúdo representativos.
      ideiasIntroduzidas: ["Relação central"],
      ideiasUtilizadas: [],
      explicacoes: [{ ideia: "Relação central", formas: ["plain_definition"], formasNaoAplicaveis: [] }],
      praticas: [{ requisito: "Distinguir os casos",
        oportunidade: "Diagnosticar a comparação indevida.", dimensoesVariadas: ["task_feature"] }],
      cobertura: []
    }
  };
}

// O segundo alvo utiliza a ideia já introduzida por A; o terceiro depende do
// segundo. A Parte continua sendo o agrupamento técnico do lote.
function payloadSegunda() {
  const base = gptPayload();
  return { ...base, microssequencia: MICRO_2_TITLE,
    aplicacaoPedagogica: { ...base.aplicacaoPedagogica, ideiasIntroduzidas: [], ideiasUtilizadas: ["Relação central"],
      explicacoes: [] } };
}

function payloadTerceira() {
  return { ...payloadSegunda(), microssequencia: MICRO_3_TITLE };
}

async function seedChainPart(db, adapter) {
  const explicacao = reconciledExplanationFixture([{ text: "Prosa humana preservada.", analysisUnitIds: [IDEA] }],
    { title: "Base anterior" });
  await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values" +
    " ($1,'microsequence','micro-2','lesson','lesson',1,$2::jsonb),($1,'microsequence','micro-3','lesson','lesson',2,$3::jsonb)",
  [COURSE, JSON.stringify({ title: MICRO_2_TITLE, dependsOn: [MICRO], explanation: explicacao }),
    JSON.stringify({ title: MICRO_3_TITLE, dependsOn: [MICRO_2], explanation: explicacao })]);
  await db.query("insert into private.course_design_target_plan_items values" +
    " ($1,'micro-2',$2,'instructional_analysis_unit'),($1,'micro-2',$3,'evidence_requirement')," +
    " ($1,'micro-3',$2,'instructional_analysis_unit'),($1,'micro-3',$3,'evidence_requirement')", [COURSE, IDEA, EVIDENCE]);
  const version = (await db.query("select version v from private.course_instructional_plans where course_id=$1",
    [COURSE])).rows[0].v;
  await adapter.saveCourseAuthoringPart({ principal: PRINCIPAL, courseId: COURSE, requestId: "chain-part-0001",
    expectedCourseRevision: 1, expectedPlanVersion: version, allowDraftMap: true,
    part: { partId: null, position: 0, title: "Parte técnica",
      intent: "Agrupar a cadeia sintética sem criar dependência pedagógica entre Microssequências.",
      progression: ["Produzir as Microssequências na ordem das dependências."],
      microsequences: [{ microsequenceId: MICRO, position: 0 }, { microsequenceId: MICRO_2, position: 1 },
        { microsequenceId: MICRO_3, position: 2 }] } });
}

async function setup(options = {}) {
  const { db } = await seedDraftCourse(options);
  // O curso real tem o catálogo completo de parâmetros; o fixture base guarda só
  // os dois usados pelos testes de materialização incremental.
  await db.exec("delete from private.course_design_parameter_definitions; insert into private.course_design_parameter_definitions values " +
    COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id }) => "('" + id + "')").join(","));
  const writes = [];
  return { db, writes, adapter: sqlAdapter(db, writes, options) };
}

async function runCore(adapter, name, args, principal = PRINCIPAL) {
  return await executeHumanCourseTask({ adapter, principal, name, rawArguments: args });
}

async function viaMcpHandler(adapter, name, args) {
  const resourceUrl = "https://edge.example/functions/v1/aralearn-authoring-mcp";
  const handler = createAuthoringMcpHandler({ adapter, resourceUrl,
    allowedOrigins: new Set(["https://chatgpt.com"]), authorizationServer: "https://project.example/auth/v1" });
  const response = await handler(new Request(resourceUrl, { method: "POST", headers: {
    Origin: "https://chatgpt.com", Authorization: "Bearer synthetic-token",
    Accept: "application/json, text/event-stream", "Content-Type": "application/json",
    "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
  }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name, arguments: args } }) }));
  const texto = await response.text();
  let payload;
  try { payload = JSON.parse(texto); } catch { payload = undefined; }
  return { status: response.status, payload, texto };
}

async function viaActionsHandler(adapter, name, args) {
  const actionBaseUrl = "https://project.example/functions/v1/aralearn-authoring-action";
  const handler = createAuthoringActionHandler({ adapter, allowedOrigins: new Set(["https://chatgpt.com"]),
    actionBaseUrl, publicAppUrl: "https://app.example/" });
  const encoded = encodeCourseActionTaskRequest(name, args);
  const response = await handler(new Request(actionBaseUrl + "/" + encoded.operationName, { method: "POST",
    headers: { Origin: "https://chatgpt.com", Authorization: "Bearer stub-action-token",
      "Content-Type": "application/json" },
    body: JSON.stringify(encoded.arguments) }));
  const texto = await response.text();
  let payload;
  try { payload = JSON.parse(texto); } catch { payload = undefined; }
  return { status: response.status, payload, texto };
}

async function snapshot(db) {
  const partes = (await db.query("select id, title, position from private.course_authoring_parts where course_id=$1 order by position, title", [COURSE])).rows;
  const unidades = (await db.query("select entity_id id, parent_id micro, position from private.course_entities" +
    " where course_id=$1 and entity_type='study_unit' order by position", [COURSE])).rows;
  const estado = (await db.query("select curriculum_map_status status from private.course_instructional_plans where course_id=$1", [COURSE])).rows[0].status;
  return { partes, unidades, estado };
}

const RETOMADA = { titulo: TITLE, microssequencia: MICRO_TITLE, autonomo: true };
const ARGS = { curso: TITLE, microssequencia: MICRO_TITLE, unidades: [gptPayload()], concluir: false };

async function retomadaAutonoma(adapter, { viaMcp = false } = {}) {
  if (!viaMcp) {
    const saida = await runCore(adapter, "retomar_curso", RETOMADA);
    return { referencia: saida.context?.referenciaProcesso ?? null, saida };
  }
  const resposta = await viaMcpHandler(adapter, "retomar_curso", RETOMADA);
  assert.ok(resposta.payload?.result, "status=" + resposta.status + " texto=" + resposta.texto.slice(0, 240));
  return { referencia: resposta.payload.result.structuredContent?.context?.referenciaProcesso ?? null, saida: resposta.payload.result };
}

test("núcleo humano: mapa em rascunho, zero partes e autonomia derivada criam a Parte e persistem a prática", async () => {
  const { db, writes, adapter } = await setup();
  try {
    const { referencia, saida } = await retomadaAutonoma(adapter);
    assert.ok(typeof referencia === "string" && referencia.length > 8);
    assert.deepEqual(saida.context.processoCorrente.pontosDeRevisao, []);
    assert.deepEqual((await adapter.getAuthoringProcessPreferences()).preferences.reviewPoints,
      ["curricular_map", "explanation", "study_unit"]);
    const preparo = await runCore(adapter, "preparar_materializacao", { ...ARGS, processo: referencia });
    assert.equal(preparo.context.preflight.state, "ready", JSON.stringify(preparo.context.preflight.blockers));
    assert.deepEqual((await snapshot(db)).partes, []);
    assert.equal(writes.length, 0);
    await runCore(adapter, "materializar_parte", { ...ARGS, processo: referencia });
    const estado = await snapshot(db);
    assert.equal(estado.partes.length, 1);
    assert.equal(estado.partes[0].title, MICRO_TITLE);
    assert.equal(estado.unidades.length, 1);
    assert.equal(estado.estado, "draft");
    assert.deepEqual(writes.map(item => item.allowDraftMap), [true, true]);
    assert.equal(writes.filter(item => item.operation === "save").length, 1);
  } finally { await db.close(); }
});

test("mesmo núcleo pelo canal MCP persiste a primeira prática com a Parte derivada", async () => {
  const { db, adapter } = await setup();
  try {
    const { referencia } = await retomadaAutonoma(adapter, { viaMcp: true });
    assert.ok(typeof referencia === "string" && referencia.length > 8);
    const preparo = await viaMcpHandler(adapter, "preparar_materializacao", { ...ARGS, processo: referencia });
    assert.equal(preparo.payload.result.structuredContent.context.preflight.state, "ready",
      JSON.stringify(preparo.payload.result.structuredContent.context.preflight.blockers));
    const salida = await viaMcpHandler(adapter, "materializar_parte", { ...ARGS, processo: referencia });
    assert.ok(salida.payload?.result, "status=" + salida.status + " texto=" + salida.texto.slice(0, 240));
    assert.equal(salida.payload.result.isError ?? false, false);
    const estado = await snapshot(db);
    assert.equal(estado.partes.length, 1);
    assert.equal(estado.unidades.length, 1);
    assert.equal(estado.estado, "draft");
  } finally { await db.close(); }
});

test("sem autonomia o núcleo recusa com causa específica e não escreve nada", async () => {
  const { db, writes, adapter } = await setup();
  try {
    await assert.rejects(() => runCore(adapter, "materializar_parte", ARGS), error => {
      assert.equal(error.status, 409);
      assert.equal(error.code, "curricular_map_not_approved");
      assert.ok(!/23514|private\.|A producao/u.test(error.message));
      return true;
    });
    const estado = await snapshot(db);
    assert.deepEqual(estado.partes, []);
    assert.deepEqual(estado.unidades, []);
    assert.equal(writes.length, 0);
  } finally { await db.close(); }
});

test("ator sem posse e planejamento divergente não vazam detalhe interno", async () => {
  const intruso = await setup();
  try {
    const { referencia } = await retomadaAutonoma(intruso.adapter);
    await assert.rejects(() => runCore(intruso.adapter, "materializar_parte", { ...ARGS, processo: referencia },
      { actorId: "99999999-0000-4000-8000-000000000009", scopes: ["authoring:write"] }), error => {
      assert.ok(error.status >= 400 && error.status < 500, String(error.status));
      assert.ok(/^[a-z_]{3,}$/u.test(String(error.code)), String(error.code));
      assert.ok(!/owner denied|private\.|envelope/u.test(String(error.message)));
      return true;
    });
    const estado = await snapshot(intruso.db);
    assert.deepEqual(estado.partes, []);
    assert.deepEqual(estado.unidades, []);
  } finally { await intruso.db.close(); }

  const conflito = await setup({ stalePlan: true });
  try {
    const { referencia } = await retomadaAutonoma(conflito.adapter);
    await assert.rejects(() => runCore(conflito.adapter, "materializar_parte", { ...ARGS, processo: referencia }), error => {
      assert.equal(error.status, 409, error.code + " :: " + error.message);
      assert.ok(["stale_course_state", "curricular_map_not_approved"].includes(error.code));
      assert.ok(!/40001|private\./u.test(error.message));
      return true;
    });
    const estado = await snapshot(conflito.db);
    assert.deepEqual(estado.partes, []);
    assert.deepEqual(estado.unidades, []);
  } finally { await conflito.db.close(); }
});

function planoCom(micros, parts = []) {
  return { plan: { version: 1, curriculumMapStatus: "draft",
    curriculum: { modules: [{ id: "m", position: 0, title: "M", lessons: [{ id: "l", position: 0, title: "L",
      microsequences: micros.map((micro, index) => ({ ...micro, position: index })) }] }] },
    parts } };
}

test("derivação preserva a posição do recorte e recusa ambiguidade", () => {
  const contexto = (plan) => ({ plan, part: null, course: { id: COURSE }, entities: [] });
  assert.throws(() => completeFocalMaterialization({ microssequencia: 2 },
    contexto(planoCom([{ id: "m1", title: "Única" }]))), /recorte/u);
  assert.throws(() => completeFocalMaterialization({ microssequencia: "Repetida" },
    contexto(planoCom([{ id: "m1", title: "Repetida" }, { id: "m2", title: "Repetida" }]))), /recorte/u);

  const unica = completeFocalMaterialization({ microssequencia: "Única" },
    contexto(planoCom([{ id: "m1", title: "Única" }])));
  assert.equal(unica.part.title, "Única");
  assert.equal(unica.microsequence.id, "m1");

  const partes = [{ id: "p1", position: 0, title: "Parte 1",
    microsequences: [{ id: "m1", productionPosition: 0, title: "Primeira" }] }];
  const seguinte = completeFocalMaterialization({ microssequencia: "Segunda" },
    contexto(planoCom([{ id: "m1", title: "Primeira" }, { id: "m2", title: "Segunda" }], partes)));
  assert.equal(seguinte.part.id, null);
  assert.equal(seguinte.part.position, 1);
  assert.equal(seguinte.microsequence.id, "m2");
  assert.equal(completeFocalMaterialization({ microssequencia: 1 },
    contexto(planoCom([{ id: "m1", title: "Primeira" }], partes))).part.id, "p1");
});

test("mapa aprovado dispensa autonomia para a Parte derivada", async () => {
  const { db, writes, adapter } = await setup({ approved: true });
  try {
    await runCore(adapter, "materializar_parte", ARGS);
    const estado = await snapshot(db);
    assert.equal(estado.partes.length, 1);
    assert.equal(estado.unidades.length, 1);
    assert.deepEqual(writes.map(item => item.allowDraftMap), [false, false]);
  } finally { await db.close(); }
});

test("mesmo núcleo pelo HANDLER Actions, com autenticação stub rotulada, persiste a primeira prática", async () => {
  const { db, adapter } = await setup();
  try {
    const retomada = await viaActionsHandler(adapter, "retomar_curso", RETOMADA);
    assert.ok(retomada.payload?.context, "status=" + retomada.status + " texto=" + retomada.texto.slice(0, 260));
    const referencia = retomada.payload.context.referenciaProcesso;
    assert.ok(typeof referencia === "string" && referencia.length > 8);
    const preparo = await viaActionsHandler(adapter, "preparar_materializacao", { ...ARGS, processo: referencia });
    assert.equal(preparo.payload?.context?.preflight?.state, "ready",
      JSON.stringify(preparo.payload?.context?.preflight?.blockers ?? preparo.texto.slice(0, 260)));
    const salida = await viaActionsHandler(adapter, "materializar_parte", { ...ARGS, processo: referencia });
    assert.ok(salida.payload?.context, "status=" + salida.status + " texto=" + salida.texto.slice(0, 300));
    const estado = await snapshot(db);
    assert.equal(estado.partes.length, 1);
    assert.equal(estado.partes[0].title, MICRO_TITLE);
    assert.equal(estado.unidades.length, 1);
    assert.equal(estado.estado, "draft");
  } finally { await db.close(); }
});

test("segunda microssequência não agrupada cria Parte 2 preservando Parte 1 e Unidade 1, e o retry não duplica", async () => {
  const { db, adapter, writes } = await setup();
  try {
    const explicacao2 = reconciledExplanationFixture([{ text: "Prosa humana preservada.", analysisUnitIds: [IDEA] }],
      { title: "Base anterior 2" });
    await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)" +
      " values($1,'microsequence','micro-2','lesson','lesson',1,$2::jsonb)",
    [COURSE, JSON.stringify({ title: "Segunda sequencia", dependsOn: [], explanation: explicacao2 })]);
    await db.query("insert into private.course_design_target_plan_items values" +
      "($1,'micro-2',$2,'instructional_analysis_unit'),($1,'micro-2',$3,'evidence_requirement')",
    [COURSE, IDEA, EVIDENCE]);

    const { referencia } = await retomadaAutonoma(adapter);
    await runCore(adapter, "materializar_parte", { ...ARGS, processo: referencia });
    const primeira = await snapshot(db);
    assert.equal(primeira.partes.length, 1);
    assert.equal(primeira.unidades.length, 1);

    // A segunda unidade usa a ideia já introduzida pela primeira; reintroduzi-la
    // seria recusado corretamente pelo núcleo.
    const payload2 = { ...gptPayload(), microssequencia: "Segunda sequencia",
      aplicacaoPedagogica: { ...gptPayload().aplicacaoPedagogica,
        ideiasIntroduzidas: [], ideiasUtilizadas: ["Relação central"], explicacoes: [] } };
    const segundaArgs = { curso: TITLE, microssequencia: "Segunda sequencia",
      unidades: [payload2], concluir: false, processo: referencia };
    const preparoSegunda = await runCore(adapter, "preparar_materializacao", segundaArgs);
    assert.equal(preparoSegunda.context.preflight.state, "ready", JSON.stringify(preparoSegunda.context.preflight.blockers));
    await runCore(adapter, "materializar_parte", segundaArgs);
    const estado = await snapshot(db);
    assert.equal(estado.partes.length, 2);
    assert.deepEqual(estado.partes.map(parte => parte.title), [MICRO_TITLE, "Segunda sequencia"]);
    assert.deepEqual(estado.unidades.map(unidade => unidade.micro), [MICRO, "micro-2"]);
    assert.equal(estado.estado, "draft");

    // Retry da mesma escrita derivada: repetir a requisição confirmada devolve o
    // recibo idempotente e não cria Parte nem Unidade.
    const envio = writes.filter(item => item.operation === "materialize").at(-1).request;
    const repetido = await adapter.materializeCourseAuthoringPart(envio);
    assert.equal(repetido.idempotent, true);
    const depois = await snapshot(db);
    assert.equal(depois.partes.length, 2);
    assert.equal(depois.unidades.length, 2);
    assert.deepEqual(depois.unidades, estado.unidades);
    assert.deepEqual(depois.partes, estado.partes);
  } finally { await db.close(); }
});

test("dependência curricular pendente bloqueia o foco sem refém de Microssequência fora do lote", async () => {
  const { db, adapter } = await setup();
  try {
    await seedChainPart(db, adapter);
    const { referencia } = await retomadaAutonoma(adapter);
    const argsSegunda = { curso: TITLE, microssequencia: MICRO_2_TITLE, unidades: [payloadSegunda()],
      concluir: false, processo: referencia };

    // B depende de A: sem unidade produzida, o preflight não promete prontidão.
    const preparoBloqueado = await runCore(adapter, "preparar_materializacao", argsSegunda);
    assert.equal(preparoBloqueado.context.preflight.state, "blocked");
    const bloqueio = preparoBloqueado.context.preflight.blockers
      .find(blocker => blocker.code === "curricular_dependency_not_produced");
    assert.ok(bloqueio, JSON.stringify(preparoBloqueado.context.preflight.blockers));
    assert.match(bloqueio.message, new RegExp(MICRO_TITLE, "u"), "o bloqueio nomeia a dependência");
    assert.match(bloqueio.message, /antes ou inclua as duas no mesmo lote/u, "o bloqueio informa o próximo passo");
    await assert.rejects(() => runCore(adapter, "materializar_parte", argsSegunda), error => {
      assert.equal(error.status, 422);
      assert.equal(error.code, "human_materialization_preflight_blocked");
      return true;
    });
    assert.deepEqual((await snapshot(db)).unidades, [], "nada é gravado antes da dependência");

    // O canal real entrega a causa nomeada para a recuperação do cliente.
    const envelope = await viaMcpHandler(adapter, "materializar_parte", argsSegunda);
    assert.equal(envelope.payload.result.isError, true);
    const erro = envelope.payload.result.structuredContent.error;
    assert.equal(erro.code, "human_materialization_preflight_blocked");
    assert.ok(erro.details.preflight.blockers.some(item => item.code === "curricular_dependency_not_produced"));

    // A não depende de ninguém: produzi-la não é refém de B nem de C.
    const preparoA = await runCore(adapter, "preparar_materializacao", { ...ARGS, processo: referencia });
    assert.equal(preparoA.context.preflight.state, "ready", JSON.stringify(preparoA.context.preflight.blockers));
    await runCore(adapter, "materializar_parte", { ...ARGS, processo: referencia });
    assert.deepEqual((await snapshot(db)).unidades.map(unidade => unidade.micro), [MICRO]);

    // Com A produzida, B libera; C segue fora do lote sem bloquear B.
    const preparoB = await runCore(adapter, "preparar_materializacao", argsSegunda);
    assert.equal(preparoB.context.preflight.state, "ready", JSON.stringify(preparoB.context.preflight.blockers));
    await runCore(adapter, "materializar_parte", argsSegunda);
    assert.deepEqual((await snapshot(db)).unidades.map(unidade => unidade.micro).sort(), [MICRO, MICRO_2]);
  } finally { await db.close(); }
});

test("dependência produzida fora do agrupamento técnico é reconhecida pelo estado persistido", async () => {
  const { db, adapter } = await setup();
  try {
    await seedChainPart(db, adapter);
    const { referencia } = await retomadaAutonoma(adapter);
    await runCore(adapter, "materializar_parte", { ...ARGS, processo: referencia });
    const argsSegunda = { curso: TITLE, microssequencia: MICRO_2_TITLE, unidades: [payloadSegunda()],
      concluir: false, processo: referencia };
    await runCore(adapter, "materializar_parte", argsSegunda);
    // A e B saem do agrupamento: a dependência de C precisa vir do estado
    // persistido, não da declaração do recorte desta escrita.
    await db.query("delete from private.course_authoring_part_didactic_microsequences" +
      " where course_id=$1 and didactic_microsequence_id=any($2)", [COURSE, [MICRO, MICRO_2]]);
    const argsTerceira = { curso: TITLE, microssequencia: MICRO_3_TITLE, unidades: [payloadTerceira()],
      concluir: false, processo: referencia };
    const preparo = await runCore(adapter, "preparar_materializacao", argsTerceira);
    assert.equal(preparo.context.preflight.state, "ready", JSON.stringify(preparo.context.preflight.blockers));
    await runCore(adapter, "materializar_parte", argsTerceira);
    assert.equal((await snapshot(db)).unidades.length, 3);
  } finally { await db.close(); }
});

test("recibo da Parte recusa requestId reutilizado com conteúdo diferente", async () => {
  const { db, adapter } = await setup();
  try {
    const version = (await db.query("select version v from private.course_instructional_plans where course_id=$1",
      [COURSE])).rows[0].v;
    const part = { partId: null, position: 0, title: "Parte técnica", intent: "Intenção sintética.",
      progression: ["Passo único."], microsequences: [{ microsequenceId: MICRO, position: 0 }] };
    const base = { principal: PRINCIPAL, courseId: COURSE, requestId: "recibo-conf-001",
      expectedCourseRevision: 1, expectedPlanVersion: version, allowDraftMap: true, part };
    await adapter.saveCourseAuthoringPart(base);
    await assert.rejects(() => adapter.saveCourseAuthoringPart({ ...base, part: { ...part, title: "Outro título" } }),
      error => {
        assert.equal(error.status, 409);
        assert.ok(!/private\.|23514|reutilizado/u.test(error.message));
        return true;
      });
    assert.equal((await snapshot(db)).partes.length, 1);
  } finally { await db.close(); }
});
