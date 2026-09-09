import test from "node:test";
import assert from "node:assert/strict";
import Ajv from "ajv";
import { createHash } from "node:crypto";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { COURSE_COMPONENT_CATALOG } from "../../src/domain/courseDesignParameters.js";
import { COURSE_HUMAN_DESIGN_TASK_DEFINITIONS as definitions, COURSE_HUMAN_DESIGN_TASK_HANDLERS as handlers }
  from "../../supabase/functions/_shared/aralearn-authoring/courseHumanDesignTasks.js";

// Human resolution uses explicit reader fixtures. Writes and receipt recovery
// cross the real adapter HTTP transport; the database is an honest stub here.
// Transactional semantics are exercised separately by the PGlite test.
const courseId = "20000000-0000-4000-8000-000000000001";
const analysisId = "30000000-0000-4000-8000-000000000001";
const evidenceId = "30000000-0000-4000-8000-000000000002";
const principal = { actorId: "10000000-0000-4000-8000-000000000001", authenticationKind: "oauth" };
const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const valid = new Map(definitions.map(definition => [definition.name, new Ajv({ strict: false }).compile(definition.inputSchema)]));
function harness({ lost = false, pending = false, drift = false, denied = false, noOp = false } = {}) {
  const writes = [], recovery = [], reads = []; let revision = 5; let receipt = null;
  const plan = { version: 2, title: "Curso", parts: [], curriculum: { modules: [
    { id: "module", title: "Fundamentos", position: 0, lessons: [{ id: "lesson", title: "Relações", position: 0,
      microsequences: [{ id: "micro", title: "Ligação", position: 0 }] }] }
  ] }, instructionalAnalysisUnits: [{ id: analysisId, position: 0, version: 3, statement: "Interação", description: "Descrição preservada." }],
  evidenceRequirements: [{ id: evidenceId, position: 0, version: 1, statement: "Relacionar elementos", description: "Operação observável." }],
  curriculumScopeItems: [] };
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://database.example", publicAppUrl: "https://app.example",
    serverApiKey: "synthetic-service", publishableKey: "synthetic-public", attempts: 3, fetchImpl: async (url, init) => {
      const name = new URL(url).pathname.split("/").at(-1); const input = JSON.parse(init.body);
      assert.equal(new Headers(init.headers).get("apikey"), "synthetic-service");
      assert.equal(input.p_actor_id, principal.actorId); assert.equal(input.p_course_id, courseId);
      if (name === "get_course_change_receipt_for_actor_v1") {
        recovery.push(input); return json(pending ? { status: "absent" } : { status: "confirmed", result: { ...receipt, idempotent: true } });
      }
      assert.equal(name, "apply_course_design_command_for_actor_v3"); writes.push(input);
      if (denied) return new Response(JSON.stringify({ code: "42501", message: "synthetic owner denial" }), { status: 403 });
      assert.equal(input.p_request_hash, createHash("sha256").update(JSON.stringify({ courseId,
        expectedCourseRevision: input.p_expected_course_revision, command: input.p_command })).digest("hex"));
      const settings = ["set_guidance", "clear_guidance", "set_component_policy", "clear_component_policy"].includes(input.p_command.type);
      revision += Number(!noOp);
      receipt = { contract: settings ? "aralearn.course-design-change.v3" : "aralearn.course-instructional-design-change.v1",
        courseId: drift ? evidenceId : courseId, courseRevision: revision, requestId: input.p_request_id, changed: !noOp, idempotent: false,
        ...(settings ? { change: noOp ? null : { type: input.p_command.type, scope: input.p_command.scope, parameterId: null } }
          : { planVersion: plan.version + Number(!noOp && ["save_plan_item", "remove_plan_item", "set_target_plan_items"].includes(input.p_command.type)),
            commandType: input.p_command.type, scope: { ref: input.p_command.scope.ref, kind: input.p_command.scope.kind } }) };
      if (lost) throw new TypeError("fetch failed after synthetic commit");
      return json(receipt);
    } });
  adapter.listCourses = async () => ({ items: [{ courseId, title: "Curso" }], hasMore: false });
  adapter.getCourse = async () => ({ courseId, title: "Curso", revision });
  adapter.getCourseInstructionalPlan = async () => { reads.push(revision); return { courseId, courseRevision: revision, plan: structuredClone(plan) }; };
  adapter.listCourseStudyUnits = async () => ({ items: [{ ordinal: 1, version: 4, studyUnit: { id: "unit", title: "Interações" },
    authorship: { design: { application: { mode: "expository", analysisIdeas: { introduced: [{ name: "Interação", description: "Descrição preservada." }], used: [], developed: [] } } } } }], hasMore: false });
  adapter.getCourseDesign = async ({ scopeKind, scopeRef }) => ({ courseId, courseRevision: revision,
    scopeContext: { current: { kind: scopeKind, ref: scopeRef } }, componentCatalog: structuredClone(COURSE_COMPONENT_CATALOG),
    targetPlanItems: scopeKind === "didactic_microsequence" || scopeKind === "study_unit"
      ? { instructionalAnalysisUnitIds: [analysisId], evidenceRequirementIds: [] } : null });
  const run = (name, args) => {
    assert.equal(valid.get(name)(args), true, JSON.stringify(valid.get(name).errors));
    return handlers[name]({ adapter, principal, args });
  };
  return { adapter, writes, reads, recovery, run, plan };
}

test("catálogo mantém schemas pequenos, referências humanas e leitura de repertório aplicado", async () => {
  assert.equal(definitions.length, 8);
  for (const definition of definitions) {
    assert.equal(definition.inputSchema.additionalProperties, false);
    assert.doesNotMatch(JSON.stringify(definition.inputSchema), /requestId|courseId|expected.*Version|itemId|patch|sql/iu);
    assert.equal(typeof handlers[definition.name], "function");
  }
  const f = harness();
  const read = await f.run("consultar_repertorio_instrucional", { curso: "Curso", modulo: 1, licao: 1, microssequencia: "Ligação", unidade: 1 });
  assert.deepEqual(read.context.analise, [{ posicao: 1, enunciado: "Interação", descricao: "Descrição preservada." }]);
  assert.deepEqual(read.context.vinculos.analise, ["Interação"]);
  assert.equal(read.context.aplicacao.mode, "expository");
  assert.ok(read.context.componentes.every(item => item.nome));
  assert.equal(f.writes.length, 0);
  assert.equal(valid.get("manter_unidade_analise")({ curso: "Curso", operacao: "criar", enunciado: "Novo", patch: {} }), false);
});

test("manutenção cria identidade interna, edita o item exato e preserva descrição omitida", async () => {
  const f = harness();
  await f.run("manter_unidade_analise", { curso: "Curso", operacao: "criar", enunciado: "Relação" });
  const create = f.writes[0];
  assert.match(create.p_command.itemId, /^[a-f0-9-]{36}$/u);
  assert.equal(create.p_command.expectedItemVersion, 0); assert.equal(create.p_command.expectedPlanVersion, 2);
  assert.equal(create.p_channel, "mcp");
  await f.run("manter_unidade_analise", { curso: "Curso", operacao: "editar", item: "interacao", enunciado: "Interação revisada" });
  const edit = f.writes[1].p_command;
  assert.equal(edit.itemId, analysisId); assert.equal(edit.expectedItemVersion, 3); assert.equal(edit.description, "Descrição preservada.");
  await f.run("manter_requisito_evidencia", { curso: "Curso", operacao: "remover", item: 1 });
  assert.equal(f.writes[2].p_command.itemId, evidenceId); assert.equal(f.writes[2].p_command.type, "remove_plan_item");
  f.plan.instructionalAnalysisUnits.push({ ...f.plan.instructionalAnalysisUnits[0], id: evidenceId, position: 1 });
  await assert.rejects(f.run("manter_unidade_analise", { curso: "Curso", operacao: "editar", item: "Interação", enunciado: "Nova" }), error => error.code === "ambiguous_human_reference");
  assert.equal(f.writes.length, 3);
});

test("vínculo e aplicações resolvem natureza, unidade/versionamento e operação de evidência", async () => {
  const f = harness();
  await f.run("vincular_repertorio_instrucional", { curso: "Curso", microssequencia: 1, analise: ["Interação"], evidencias: [1] });
  assert.deepEqual(f.writes[0].p_command.instructionalAnalysisUnitIds, [analysisId]);
  assert.deepEqual(f.writes[0].p_command.evidenceRequirementIds, [evidenceId]);
  await f.run("registrar_aplicacoes_instrucionais", { curso: "Curso", microssequencia: 1, unidades: [{ unidade: 1, modo: "mixed",
    ideiasIntroduzidas: ["Interação"], ideiasUtilizadas: [], cobertura: [],
    explicacoes: [{ ideia: 1, formas: ["plain_definition"], formasNaoAplicaveis: [{ forma: "worked_example", motivo: "Exemplo desenvolvido na próxima unidade." }] }],
    praticas: [{ requisito: "Relacionar elementos", oportunidade: "caso-1", dimensoesVariadas: ["case_or_data"] }] }] });
  const command = f.writes[1].p_command; const unit = command.units[0];
  assert.deepEqual(command.scope, { kind: "didactic_microsequence", ref: "micro" });
  assert.equal(unit.studyUnitId, "unit"); assert.equal(unit.expectedStudyUnitVersion, 4);
  assert.deepEqual(unit.application.practiceApplications, [{ evidenceRequirementId: evidenceId, opportunityId: "caso-1", invariantTaskOperation: "Relacionar elementos", variedDimensions: ["case_or_data"] }]);
  assert.equal(Object.hasOwn(unit, "content"), false);
  await assert.rejects(f.run("vincular_repertorio_instrucional", { curso: "Curso", microssequencia: 1, analise: ["Relacionar elementos"], evidencias: [] }), error => error.status === 404);
  assert.equal(f.writes.length, 2);
});

test("orientações e componentes usam catálogo atual e preservam no-op e herança", async () => {
  const f = harness({ noOp: true });
  await f.run("ajustar_orientacao", { curso: "Curso", modulo: 1, orientacao: "Relacionar com os casos anteriores." });
  assert.deepEqual(f.writes[0].p_command.scope, { kind: "module", ref: "module" });
  await f.run("ajustar_orientacao", { curso: "Curso", licao: 1, orientacao: null });
  assert.equal(f.writes[1].p_command.type, "clear_guidance");
  await f.run("ajustar_componentes", { curso: "Curso", microssequencia: 1, disponibilidade: "somente_selecionados",
    permitidos: [COURSE_COMPONENT_CATALOG.options[0].label], preferidos: [1] });
  assert.deepEqual(f.writes[2].p_command.policy.allowedRefs, [COURSE_COMPONENT_CATALOG.options[0].ref]);
  await f.run("ajustar_componentes", { curso: "Curso", disponibilidade: "herdar" });
  assert.equal(f.writes[3].p_command.type, "clear_component_policy");
  await assert.rejects(f.run("ajustar_componentes", { curso: "Curso", disponibilidade: "herdar", preferidos: [1] }), error => error.status === 422);
});

test("resposta perdida recupera recibo e releitura da mesma tentativa sem repetir escrita", async () => {
  const f = harness({ lost: true });
  await f.run("manter_unidade_analise", { curso: "Curso", operacao: "criar", enunciado: "Relação" });
  assert.equal(f.writes.length, 1); assert.equal(f.recovery.length, 1);
  assert.equal(f.recovery[0].p_request_id, f.writes[0].p_request_id);
  assert.equal(f.recovery[0].p_request_hash, f.writes[0].p_request_hash);
  assert.equal(f.reads.at(-1), 6);
  const pending = harness({ lost: true, pending: true });
  await assert.rejects(pending.run("manter_unidade_analise", { curso: "Curso", operacao: "criar", enunciado: "Relação" }), error => error.code === "course_write_uncertain" && Boolean(error.details.requestId));
  assert.equal(pending.writes.length, 1);
});

test("dono negado e confirmação de outro curso não viram sucesso nem nova tentativa", async () => {
  const denied = harness({ denied: true });
  await assert.rejects(denied.run("manter_requisito_evidencia", { curso: "Curso", operacao: "remover", item: 1 }), error => error.status === 403);
  assert.equal(denied.writes.length, 1); assert.equal(denied.recovery.length, 0);
  const drift = harness({ drift: true });
  await assert.rejects(drift.run("manter_unidade_analise", { curso: "Curso", operacao: "criar", enunciado: "Novo" }), error => error.code === "course_write_uncertain");
  assert.equal(drift.writes.length, 1);
});

test("aplicação expressa envia calibração tipada, lê intenção e recupera legado sem conteúdo no comando", async () => {
  const f = harness(); const inspected = [];
  const getDesign = f.adapter.getCourseDesign;
  f.adapter.getCourseDesign = async args => { inspected.push(args); return getDesign(args); };
  await f.run("aplicar_configuracao_instrucional", { curso: "Curso", microssequencia: 1,
    unidades: [{ unidade: 1, calibracao: { parametros: { maximo_ideias_novas_por_unidade: 2 }, motivo: "Duas relações desenvolvidas nesta unidade." },
      aplicacao: { modo: "expository", ideiasIntroduzidas: [1], ideiasUtilizadas: [], cobertura: [],
        explicacoes: [{ ideia: 1, formas: ["plain_definition"] }], praticas: [] } }] });
  assert.equal(inspected[0].scopeKind, "study_unit"); assert.equal(inspected[0].scopeRef, "unit");
  const command = f.writes[0].p_command;
  assert.equal(command.type, "apply_study_unit_configuration");
  assert.deepEqual(command.units[0].automaticParameters, [{ parameterId: "new_analysis_unit_ceiling_per_expository_study_unit", value: 2,
    reason: "Duas relações desenvolvidas nesta unidade." }]);
  assert.equal(command.units[0].expectedStudyUnitVersion, 4);
  assert.equal(Object.hasOwn(command.units[0], "content"), false);
  assert.equal(Object.hasOwn(command.units[0], "designSnapshot"), false);
  assert.equal(valid.get("aplicar_configuracao_instrucional")({ curso: "Curso", microssequencia: 1,
    unidades: [{ unidade: 1, calibracao: { parametros: { sql: "x" }, motivo: "x" } }] }), false);
  const lost = harness({ lost: true });
  await lost.run("aplicar_configuracao_instrucional", { curso: "Curso", microssequencia: 1, unidades: [{ unidade: 1 }] });
  assert.equal(lost.writes.length, 1); assert.equal(lost.recovery.length, 1);
  assert.equal(Object.hasOwn(lost.writes[0].p_command.units[0], "application"), false);
});
