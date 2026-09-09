import assert from "node:assert/strict";
import test from "node:test";
import { COURSE_HUMAN_STRUCTURE_TASK_DEFINITIONS as definitions, COURSE_HUMAN_STRUCTURE_TASK_HANDLERS as handlers } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanStructureTasks.js";
import { mutateCourseStructure, reorderCourseStudyUnits } from "../../supabase/functions/_shared/aralearn-authoring/courseStructureMutation.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { sha256Hex } from "../../supabase/functions/_shared/aralearn-authoring/security.js";
import { applyCurricularMapSlice } from "../../src/domain/courseCurricularMapSlices.js";

const PRINCIPAL = { actorId: "10000000-0000-4000-8000-000000000001", channel: "mcp" };
const COURSE = "20000000-0000-4000-8000-000000000001";
const SCOPE = "30000000-0000-4000-8000-000000000001";
const copy = value => structuredClone(value);
function fixture() {
  const calls = [], receipts = new Map();
  const state = { title: "Curso estrutural", revision: 7, version: 3, failOnce: false, failAlways: false, absent: false,
    map: { audience: "Adultos", prerequisites: [], scopeItems: [{ id: SCOPE, position: 0, statement: "Compreender relações" }], modules: [
      { moduleId: "m1", title: "Introdução", objective: "Situar", position: 0, lessons: [
        { lessonId: "l1", title: "Princípios", objective: "Explicar", position: 0, microsequences: [
          { microsequenceId: "a", title: "Conceito", objective: "Compreender", position: 0, dependencyMicrosequenceIds: [], scopeItemIds: [SCOPE],
            explanationPlan: { purpose: "Explicar conceito", prerequisites: ["Preservar"], relations: ["Relação original"], sourceIds: ["source-original"] } },
          { microsequenceId: "b", title: "Aplicação", objective: "Aplicar", position: 1, dependencyMicrosequenceIds: ["a"], scopeItemIds: [SCOPE],
            explanationPlan: { purpose: "Aplicar conceito", prerequisites: [], relations: [], sourceIds: [] } }
        ] }
      ] },
      { moduleId: "m2", title: "Continuação", objective: "Ampliar", position: 1, lessons: [
        { lessonId: "l2", title: "Princípios", objective: "Outros", position: 0, microsequences: [] }
      ] }
    ] }, units: [{ id: "u1", title: "Primeira" }, { id: "u2", title: "Segunda" }, { id: "u3", title: "Terceira" }] };
  const write = async (request, response) => {
    if (!receipts.has(request.requestId)) {
      receipts.set(request.requestId, copy(response));
      state.revision = response.courseRevision;
      state.version = response.planVersion ?? state.version;
      if (request.courseMetadata) state.title = request.courseMetadata.title;
    } else response = { ...receipts.get(request.requestId), idempotent: true };
    if (state.failOnce || state.failAlways) { state.failOnce = false; throw new AuthoringApiError(503, "request_timeout", "Resposta perdida"); }
    return response;
  };
  const adapter = { publicAppUrl: "https://example.test", state, calls,
    async listCourses(args) { calls.push(["list", copy(args)]); return { items: state.absent ? [] : [{ courseId: COURSE, title: state.title }], hasMore: false }; },
    async getCourse(args) {
      calls.push(["get", copy(args)]); if (state.absent) throw new AuthoringApiError(404, "course_not_found", "Ausente");
      return { courseId: COURSE, title: state.title, goal: "Objetivo preservado", revision: state.revision, deepLink: "https://example.test/course" };
    },
    async getCourseInstructionalPlan(args) {
      calls.push(["plan", copy(args)]);
      return { courseId: COURSE, courseRevision: state.revision, plan: { title: state.title, version: state.version, curriculumScopeItems: state.map.scopeItems,
        curriculum: { modules: state.map.modules.map(module => ({ ...copy(module), id: module.moduleId,
          lessons: module.lessons.map(lesson => ({ ...copy(lesson), id: lesson.lessonId,
            microsequences: lesson.microsequences.map(micro => ({ ...copy(micro), id: micro.microsequenceId })) })) })) } } };
    },
    async getCourseCurricularMap(args) { calls.push(["map", copy(args)]); return { courseId: COURSE, courseRevision: state.revision, planVersion: state.version, map: copy(state.map) }; },
    async saveCourseCurricularMapSlice(request) {
      calls.push(["slice", copy(request)]);
      if (!receipts.has(request.requestId)) state.map = applyCurricularMapSlice(state.map, request.command);
      return write(request, { courseRevision: request.expectedCourseRevision + 1, planVersion: request.expectedPlanVersion + 1, idempotent: false });
    },
    async commitCourseComposition(request) { calls.push(["metadata", copy(request)]); return write(request, { courseRevision: request.expectedRevision + 1, idempotent: false }); },
    async rpc(name, args, options) {
      calls.push(["rpc", name, copy(args), copy(options)]);
      const request = { requestId: args.p_request_id };
      if (name === "reorder_course_study_units_for_actor_v1") return write(request, { contract: "aralearn.course-study-unit-order.v1", courseId: COURSE,
        courseRevision: args.p_expected_revision + 1, microsequenceId: args.p_microsequence_id, studyUnitIds: args.p_study_unit_ids, changed: true, idempotent: false, affectedEntityCount: 3 });
      const command = args.p_command;
      return write(request, { contract: "aralearn.course-structure-change.v1", courseId: COURSE, courseRevision: args.p_expected_revision + 1,
        planVersion: args.p_expected_plan_version + 1, operation: command.operation, targetKind: command.kind,
        targetId: command.operation === "duplicate" ? `copy-${(await sha256Hex(`${PRINCIPAL.actorId}:${args.p_request_id}:${command.kind}:${command.targetId}`)).slice(0, 48)}` : command.targetId,
        affectedEntityCount: 4, changed: true, idempotent: false });
    },
    async listCourseStudyUnits(args) {
      calls.push(["units", copy(args)]);
      const offset = args.cursorStudyUnitId ? state.units.findIndex(item => item.id === args.cursorStudyUnitId) + 1 : 0;
      const items = state.units.slice(offset, offset + 2).map(studyUnit => ({ studyUnit }));
      return { items, hasMore: offset + 2 < state.units.length, nextCursor: { studyUnitId: items.at(-1)?.studyUnit.id } };
    },
    async getCourseSources() { return { items: [{ sourceId: "source-new", title: "Fonte útil", position: 0, revision: 1 }], nextCursor: null }; },
    async maintainCourse(request) { calls.push(["delete", copy(request)]); const absent = state.absent; state.absent = true; return { status: absent ? "already_absent" : "completed" }; }
  };
  return adapter;
}
const run = (adapter, name, args) => handlers[name]({ adapter, principal: PRINCIPAL, args: { curso: "Curso estrutural", ...args }, deadlineAt: 9999999999999 });

test("catálogo expõe sete operações pequenas, sem patch livre e com destrutividade explícita", () => {
  assert.equal(definitions.length, 7);
  for (const item of definitions) {
    assert.equal(item.inputSchema.additionalProperties, false);
    assert.equal(typeof handlers[item.name], "function");
    assert.equal(item.options.readOnly, false);
    assert.equal(item.options.destructive, ["excluir_curso", "remover_ramo_curricular"].includes(item.name));
    assert.equal(JSON.stringify(item.inputSchema).includes("upserts"), false);
  }
});

test("rename preserva objetivo; resposta perdida relê por ID e repete o mesmo pedido mesmo após mudar título", async () => {
  const adapter = fixture(); adapter.state.failOnce = true;
  const result = await run(adapter, "alterar_curso", { titulo: "Título novo" });
  assert.match(result.result, /Recuperei/u);
  const writes = adapter.calls.filter(([name]) => name === "metadata");
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0][1], writes[1][1]);
  assert.deepEqual(writes[0][1].courseMetadata, { title: "Título novo", objective: "Objetivo preservado" });
  assert.equal(adapter.calls.filter(([name]) => name === "list").length, 1);
  await run(adapter, "alterar_curso", { titulo: "Título novo", retomada: result.context.retomada });
  assert.deepEqual(adapter.calls.filter(([name]) => name === "metadata").at(-1)[1], writes[0][1]);
});

test("incluir e editar recorte preserva descendentes, fontes e intenção não indicada; criação mantém ID no replay", async () => {
  const adapter = fixture(), before = copy(adapter.state.map.modules[0].lessons[0].microsequences[0]);
  await run(adapter, "salvar_ramo_curricular", { tipo: "microssequencia", alvo: { modulo: "Introdução", licao: "Princípios", microssequencia: "Conceito" },
    objetivo: "Objetivo novo", cobertura: ["Compreender relações"], dependencias: [], explicacao: { proposito: "Propósito novo", fontes: ["Fonte útil"] } });
  const changed = adapter.state.map.modules[0].lessons[0].microsequences[0];
  assert.equal(changed.microsequenceId, before.microsequenceId);
  assert.deepEqual(changed.explanationPlan, { ...before.explanationPlan, purpose: "Propósito novo", sourceIds: ["source-new"] });
  assert.deepEqual(changed.scopeItemIds, [SCOPE]);
  assert.equal(adapter.state.map.modules[0].lessons[0].microsequences.length, 2);
  adapter.state.failOnce = true;
  await run(adapter, "salvar_ramo_curricular", { tipo: "licao", destino: { modulo: "Introdução" }, titulo: "Lição acrescentada", objetivo: "Aprofundar", posicao: 2 });
  const writes = adapter.calls.filter(([name]) => name === "slice").slice(-2);
  assert.deepEqual(writes[0][1], writes[1][1]);
  assert.match(writes[0][1].command.lessonId, /^[a-f0-9-]{36}$/u);
  assert.equal(adapter.state.map.modules[0].lessons.length, 2);
});

test("mover/duplicar/remover usa IDs resolvidos e RPC tipada sem retry automático; ambiguidade e extras impedem escrita", async () => {
  for (const name of ["mover_ramo_curricular", "duplicar_ramo_curricular", "remover_ramo_curricular"]) {
    const adapter = fixture();
    await run(adapter, name, { alvo: { modulo: "Introdução", licao: "Princípios" },
      ...(name === "duplicar_ramo_curricular" ? { titulo: "Cópia", destino: { modulo: "Continuação" } } : name === "mover_ramo_curricular" ? { destino: { modulo: "Continuação" }, posicao: 1 } : {}) });
    const call = adapter.calls.find(([kind]) => kind === "rpc");
    assert.equal(call[1], "mutate_course_structure_for_actor_v1");
    assert.equal(call[2].p_command.targetId, "l1");
    assert.equal(call[3].retry, false);
    assert.equal(JSON.stringify(call[2]).includes("explanation"), false);
  }
  const adapter = fixture();
  await assert.rejects(run(adapter, "remover_ramo_curricular", { alvo: { licao: "Princípios" } }), error => error.code === "ambiguous_human_reference");
  await assert.rejects(run(adapter, "remover_ramo_curricular", { alvo: { modulo: "Introdução" }, upserts: [] }), error => error.status === 422);
  assert.equal(adapter.calls.some(([name]) => name === "rpc"), false);
});

test("incerteza devolve retomada original; referência rejeita intenção/conta/patch adulterados", async () => {
  const adapter = fixture(); adapter.state.failAlways = true;
  let token;
  await assert.rejects(run(adapter, "duplicar_ramo_curricular", { alvo: { modulo: "Introdução" }, titulo: "Cópia" }), error => {
    token = error.details?.retomada; return error.code === "course_write_uncertain" && typeof token === "string";
  });
  adapter.state.failAlways = false;
  const result = await run(adapter, "duplicar_ramo_curricular", { alvo: { modulo: "Introdução" }, titulo: "Cópia", retomada: token });
  assert.match(result.result, /Recuperei/u);
  await assert.rejects(run(adapter, "duplicar_ramo_curricular", { alvo: { modulo: "Introdução" }, titulo: "Outra", retomada: token }), error => error.status === 422);
  const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8")); decoded.request.upserts = [{ sql: "forbidden" }];
  await assert.rejects(run(adapter, "duplicar_ramo_curricular", { alvo: { modulo: "Introdução" }, titulo: "Cópia", retomada: Buffer.from(JSON.stringify(decoded)).toString("base64url") }), error => error.status === 422);
  assert.equal(adapter.calls.filter(([name]) => name === "rpc").length, 3);
});

test("exclusão preparada conserva curso e tentativa sem resolver título reutilizado", async () => {
  const adapter = fixture();
  const prepared = await run(adapter, "excluir_curso", {});
  assert.equal(adapter.calls.some(([name]) => name === "delete"), false);
  await run(adapter, "excluir_curso", { confirmacao: prepared.context.confirmacao });
  await run(adapter, "excluir_curso", { confirmacao: prepared.context.confirmacao });
  const calls = adapter.calls.filter(([name]) => name === "delete");
  assert.deepEqual(calls[0][1], calls[1][1]);
  assert.equal(adapter.calls.filter(([name]) => name === "list").length, 1);
});

test("reordenar unidades lê páginas do recorte completo e rejeita omissão ou repetição", async () => {
  const adapter = fixture(), alvo = { modulo: "Introdução", licao: "Princípios", microssequencia: "Conceito" };
  await run(adapter, "reordenar_unidades", { alvo, unidades: ["Terceira", 1, "Segunda"] });
  const rpc = adapter.calls.find(([name]) => name === "rpc");
  assert.equal(rpc[1], "reorder_course_study_units_for_actor_v1");
  assert.deepEqual(rpc[2].p_study_unit_ids, ["u3", "u1", "u2"]);
  assert.equal(adapter.calls.filter(([name]) => name === "units").length, 2);
  await assert.rejects(run(adapter, "reordenar_unidades", { alvo, unidades: [1, 2] }), error => error.status === 422);
  await assert.rejects(run(adapter, "reordenar_unidades", { alvo, unidades: [1, "Primeira", 3] }), error => error.status === 422);
  assert.equal(adapter.calls.filter(([name]) => name === "rpc").length, 1);
});

test("transportes recusam confirmação de outro alvo, versão ou ordem sem declarar sucesso", async () => {
  const adapter = fixture(); adapter.rpc = async () => ({ contract: "wrong" });
  await assert.rejects(mutateCourseStructure(adapter, { principal: PRINCIPAL, courseId: COURSE, expectedRevision: 7, expectedPlanVersion: 3,
    command: { operation: "move", kind: "module", targetId: "m1", parentId: null, position: 1, title: null }, requestId: "transport-attempt" }), error => error.status === 503);
  await assert.rejects(reorderCourseStudyUnits(adapter, { principal: PRINCIPAL, courseId: COURSE, expectedRevision: 7, microsequenceId: "a",
    studyUnitIds: ["u1", "u2"], requestId: "transport-attempt" }), error => error.status === 503);
});
