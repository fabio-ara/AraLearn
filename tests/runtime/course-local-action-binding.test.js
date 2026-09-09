import assert from "node:assert/strict";
import test from "node:test";
import { chatGptAction, courseAction, CHATGPT_ACTION_ORIGIN,
  LOCAL_APPLICATION_ORIGIN } from "../support/localSupabaseE2e.js";
import { wireClient } from "../../supabase/tests/course-authoring-channels-local-smoke.mjs";
import { COURSE_HUMAN_TASKS } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";

const CONFIG = Object.freeze({ projectUrl: "http://127.0.0.1:54321",
  publishableKey: "synthetic-public-key", adminKey: "synthetic-admin-key" });
const TOKEN = "synthetic-channel-token";
const CONTRACT = "4.0.0:synthetic-transport";
const measurementSize = text => ({ utf8Bytes: Buffer.byteLength(text, "utf8"),
  utf16CodeUnits: text.length, unicodeCodePoints: [...text].length });
const response = value => new Response(JSON.stringify(value), { status: 200,
  headers: { "Content-Type": "application/json", "x-aralearn-authoring-contract": CONTRACT } });

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

test("smoke Actions mede o envelope real e conserva 54 tarefas em 30 operações", async t => {
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
  assert.equal(COURSE_HUMAN_TASKS.length, 54);
  assert.deepEqual(measurements.map(item => item.task), COURSE_HUMAN_TASKS.map(task => task.name));
  assert.equal(new Set(measurements.map(item => item.operationName)).size, 30);
  assert.equal(measurements.filter(item => item.operationName !== item.task).length, 30);
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
