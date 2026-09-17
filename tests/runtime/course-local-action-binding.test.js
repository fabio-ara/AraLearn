import assert from "node:assert/strict";
import test from "node:test";
import { chatGptAction, courseAction, CHATGPT_ACTION_ORIGIN,
  LOCAL_APPLICATION_ORIGIN } from "../support/localSupabaseE2e.js";
import { wireClient, channelFixtures, materializeChannelPart } from "../../supabase/tests/course-authoring-channels-local-smoke.mjs";
import { COURSE_HUMAN_TASKS } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { humanMaterializationUnitPlan, reconcileHumanExplanation, explanationContentBasis } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js";
import { inspectExplanationReconciliation } from "../../src/domain/courseExplanationReconciliation.js";
import { resolveCourseSourceOccurrence } from "../../src/domain/courseSourceOccurrences.js";

const CONFIG = Object.freeze({ projectUrl: "http://127.0.0.1:54321",
  publishableKey: "synthetic-public-key", adminKey: "synthetic-admin-key" });
const TOKEN = "synthetic-channel-token";
const CONTRACT = "5.0.0:synthetic-transport";
const measurementSize = text => ({ utf8Bytes: Buffer.byteLength(text, "utf8"),
  utf16CodeUnits: text.length, unicodeCodePoints: [...text].length });
const response = value => new Response(JSON.stringify(value), { status: 200,
  headers: { "Content-Type": "application/json", "x-aralearn-authoring-contract": CONTRACT } });

test("fixture dos canais vincula seis requisitos, fontes literais e reconciliação ao repertório explícito", async () => {
  const fixture = channelFixtures("Curso sintético dos canais");
  const analysis = fixture.repertoire.filter(entry => entry.task === "manter_unidade_analise");
  const evidence = fixture.repertoire.filter(entry => entry.task === "manter_requisito_evidencia");
  const bindings = fixture.repertoire.filter(entry => entry.task === "vincular_repertorio_instrucional");
  assert.equal(analysis.length, 1);
  assert.equal(evidence.length, 6);
  assert.equal(new Set(evidence.map(entry => entry.args.enunciado)).size, 6);
  assert.equal(bindings.length, 6);
  const context = { plan: { plan: {
    instructionalAnalysisUnits: analysis.map((entry, index) => ({ id: `idea-${index}`, statement: entry.args.enunciado })),
    evidenceRequirements: evidence.map((entry, index) => ({ id: `requirement-${index}`, statement: entry.args.enunciado }))
  } } };
  let introduced = 0;
  for (const [index, explanation] of fixture.lots.flatMap(lot => lot.materialization.explicacoes).entries()) {
    const binding = bindings.find(entry => entry.args.microssequencia === explanation.microssequencia).args;
    assert.deepEqual(binding.analise, [analysis[0].args.enunciado]);
    assert.deepEqual(binding.evidencias, [evidence[index].args.enunciado]);
    const normalized = await reconcileHumanExplanation(explanation.conteudo, explanation.reconciliacao, context);
    const checked = inspectExplanationReconciliation(normalized, { contentBasis: await explanationContentBasis(normalized),
      analysisUnitIds: ["idea-0"], evidenceRequirementIds: [`requirement-${index}`] });
    assert.equal(checked.ready, true, JSON.stringify(checked.blockers));
    introduced += checked.introduced.length;
    assert.deepEqual(checked.requirements, [`requirement-${index}`]);
  }
  assert.equal(introduced, 1, "a ideia é introduzida no primeiro caso e retomada nos demais");
  for (const lot of fixture.lots) {
    for (const entry of [...lot.materialization.unidades, ...lot.materialization.explicacoes]) {
      if (entry.aplicacaoPedagogica) {
        const application = entry.aplicacaoPedagogica;
        assert.equal(application.ideiasUtilizadas.some(idea => application.explicacoes.some(value => value.ideia === idea)), false,
          "reexplicar uma ideia é retomada, não uso sem reexplicação");
      }
      for (const link of entry.fontes) {
        assert.equal(link.relacao, "supported_by");
        assert.deepEqual(link.ancoras, [1]);
        const occurrence = link.ocorrencias[0];
        const resolved = resolveCourseSourceOccurrence(entry.conteudo, { occurrenceId: "synthetic-occurrence",
          slot: "content", resourceId: entry.conteudo.content[occurrence.recurso - 1].id,
          path: occurrence.folha, quote: occurrence.trecho, prefix: null, suffix: null },
        { targetKind: entry.conteudo.role ? "study_unit" : "microsequence_explanation" });
        assert.equal(resolved.status, "resolved");
      }
    }
    for (const unit of lot.materialization.unidades.filter(entry => entry.conteudo.role === "practice")) {
      assert.equal(unit.conteudo.response.package, "aralearn.response.choice");
      assert.equal(humanMaterializationUnitPlan(unit).feedbackLocal, true);
    }
  }
});

test("smoke dos canais prepara propostas antes da escrita e conserva a mesma referência pronta", async () => {
  const lot = channelFixtures("Curso sintético").lots[0];
  const calls = [];
  const client = { call: async (task, args) => {
    calls.push({ task, args });
    return { context: { parte: { microssequencias: lot.part.microssequencias },
      preflight: { state: "ready", referencia: "prepared-same-basis", blockers: [] } } };
  } };
  await materializeChannelPart(client, lot);
  assert.deepEqual(calls.map(call => call.task), ["preparar_materializacao", "materializar_parte"]);
  assert.deepEqual(calls[0].args.unidades, lot.materialization.unidades.map(humanMaterializationUnitPlan));
  assert.deepEqual(calls[0].args.explicacoes, lot.materialization.explicacoes);
  assert.deepEqual(calls[1].args, { ...lot.materialization, referenciaPreparo: "prepared-same-basis" });
  const blockedCalls = [];
  await assert.rejects(() => materializeChannelPart({ call: async task => {
    blockedCalls.push(task);
    return { context: { preflight: { state: "blocked", referencia: null,
      blockers: [{ code: "human_reference_not_found" }] } } };
  } }, lot), /human_reference_not_found/u);
  assert.deepEqual(blockedCalls, ["preparar_materializacao"], "a escrita não é usada para descobrir lacunas");
});

test("helper Actions envia tarefa agrupada, conserva a direta e não modifica a rota do app", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, ...options, payload: JSON.parse(options.body) });
    return response({ result: "persistido" });
  });
  const observation = Object.freeze({ curso: "Curso sintético", microssequencia: "Sockets",
    texto: "Explicitar a relação com o processo 🔎." });
  const observed = await chatGptAction(CONFIG, "registrar_observacao", observation, TOKEN);
  assert.deepEqual(observed.payload, { result: "persistido" });
  assert.equal(calls[0].url, `${CONFIG.projectUrl}/functions/v1/aralearn-authoring-action/observacoes_autorais`);
  assert.deepEqual(calls[0].payload, { tarefa: "registrar_observacao", argumentos: observation });
  assert.equal(calls[0].headers.Origin, CHATGPT_ACTION_ORIGIN);
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].headers.apikey, CONFIG.publishableKey);
  assert.equal(calls[0].method, "POST");

  const resume = Object.freeze({ curso: "Curso sintético" });
  await chatGptAction(CONFIG, "retomar_curso", resume, TOKEN);
  assert.equal(calls[1].url, `${CONFIG.projectUrl}/functions/v1/aralearn-authoring-action/retomar_curso`);
  assert.deepEqual(calls[1].payload, resume);
  await chatGptAction(CONFIG, "consultar_preferencias_autoria", undefined, TOKEN);
  assert.deepEqual(calls[2].payload, { tarefa: "consultar_preferencias_autoria", argumentos: {} });

  const appArguments = { courseId: "synthetic-course", operation: "read" };
  await courseAction(CONFIG, "getCourse", appArguments, TOKEN);
  assert.equal(calls[3].url, `${CONFIG.projectUrl}/functions/v1/aralearn-course-api/app/getCourse`);
  assert.deepEqual(calls[3].payload, appArguments);
  assert.equal(calls[3].headers.Origin, LOCAL_APPLICATION_ORIGIN);
  await assert.rejects(() => chatGptAction(CONFIG, "tarefa_inexistente", {}, TOKEN),
    error => error.code === "unknown_human_task");
  assert.equal(calls.length, 4, "tarefa desconhecida não é enviada");
});

test("smoke Actions mede o envelope real e conserva 56 tarefas em 30 operações", async t => {
  const calls = [], measurements = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, ...options, payload: JSON.parse(options.body) });
    return response({ result: "resposta sintética" });
  });
  const client = wireClient(CONFIG, "actions", TOKEN, measurements);
  await client.initialize();
  assert.equal(calls.length, 0, "Actions não envia initialize MCP");
  // This test exercises transport only; task handlers own argument validation.
  const args = Object.freeze({ curso: "Curso sintético: notação 🔎" });
  for (const task of COURSE_HUMAN_TASKS) {
    assert.deepEqual(await client.call(task.name, args), { result: "resposta sintética" });
  }
  assert.equal(COURSE_HUMAN_TASKS.length, 56);
  assert.deepEqual(measurements.map(item => item.task), COURSE_HUMAN_TASKS.map(task => task.name));
  assert.equal(new Set(measurements.map(item => item.operationName)).size, 30);
  assert.equal(measurements.filter(item => item.operationName !== item.task).length, 32);
  for (const [index, item] of measurements.entries()) {
    const call = calls[index];
    assert.equal(call.url, `${CONFIG.projectUrl}/functions/v1/aralearn-authoring-action/${item.operationName}`);
    assert.deepEqual(call.payload, item.operationName === item.task ? args
      : { tarefa: item.task, argumentos: args });
    assert.deepEqual(item.arguments, measurementSize(JSON.stringify(args)));
    assert.deepEqual(item.request, measurementSize(call.body));
    assert.equal(item.method, "POST");
    assert.equal(item.contract, CONTRACT);
    assert.equal(call.headers.Origin, CHATGPT_ACTION_ORIGIN);
    assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  }
  const structure = measurements.find(item => item.task === "reordenar_unidades");
  assert.equal(structure.operationName, "estrutura_curricular");
  assert.ok(structure.request.utf8Bytes > structure.arguments.utf8Bytes);
  const upload = measurements.find(item => item.task === "guardar_audio");
  assert.equal(upload.operationName, "guardar_audio");
  assert.deepEqual(upload.request, upload.arguments);
  assert.deepEqual(args, { curso: "Curso sintético: notação 🔎" });
});

test("smoke MCP conserva ferramentas semânticas e o protocolo sem envelope Actions", async t => {
  const calls = [], measurements = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ url, ...options, payload });
    const result = payload.method === "tools/list" ? { tools: COURSE_HUMAN_TASKS }
      : payload.method === "initialize" ? { protocolVersion: "2025-11-25", capabilities: {} }
        : { structuredContent: { result: "resposta sintética MCP" } };
    return response({ jsonrpc: "2.0", id: payload.id, result });
  });
  const client = wireClient(CONFIG, "mcp", TOKEN, measurements);
  await client.initialize();
  assert.deepEqual(calls.map(call => call.payload.method), ["initialize", "tools/list"]);
  const args = { preferencias: { foco: "conteudo" } };
  assert.deepEqual(await client.call("salvar_preferencias_autoria", args), { result: "resposta sintética MCP" });
  assert.deepEqual(calls[2].payload, { jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "salvar_preferencias_autoria", arguments: args } });
  for (const [index, call] of calls.entries()) {
    assert.equal(call.url, `${CONFIG.projectUrl}/functions/v1/aralearn-authoring-mcp`);
    assert.equal(call.headers.Origin, LOCAL_APPLICATION_ORIGIN);
    assert.equal(call.headers["MCP-Protocol-Version"], "2025-11-25");
    assert.equal(Object.hasOwn(measurements[index], "operationName"), false);
    assert.deepEqual(measurements[index].request, measurementSize(call.body));
  }
  assert.equal(measurements[2].task, "salvar_preferencias_autoria");
  assert.equal(measurements[2].method, "tools/call");
});
