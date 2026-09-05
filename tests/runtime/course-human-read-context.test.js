import test from "node:test";
import assert from "node:assert/strict";
import {
  openHumanReadContinuation,
  paginateHumanReadContext
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanReadContext.js";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { createAuthoringActionHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";

const COURSE = { id: "10000000-0000-4000-8000-000000000001", revision: 7 };
const OTHER_COURSE = "10000000-0000-4000-8000-000000000002";
const TITLE = "Leitura literal";
const PRINCIPAL = { actorId: "20000000-0000-4000-8000-000000000001", scopes: ["authoring:read"] };
const ORIGIN = "https://chatgpt.com";
const ACTION_URL = "https://project.example/functions/v1/aralearn-authoring-action";
const MCP_URL = "https://project.example/functions/v1/aralearn-authoring-mcp";
const encodeCursor = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const execute = (adapter, name, args) => executeHumanCourseTask({
  adapter, principal: PRINCIPAL, name, rawArguments: { curso: TITLE, ...args }
});

function fixture({ units = [], sources = [], totalUnits = units.length } = {}) {
  const calls = { units: [], sources: [], annotations: [] };
  const adapter = {
    calls, revision: COURSE.revision, publicAppUrl: "https://app.example/",
    async resolvePrincipal() { return { ...PRINCIPAL, authenticationKind: "oauth" }; },
    async resolveActionPrincipal() { return { ...PRINCIPAL, authenticationKind: "action" }; },
    async listCourses() {
      return { items: [{ courseId: COURSE.id, title: TITLE },
        { courseId: OTHER_COURSE, title: "Outro curso" }], hasMore: false, nextCursor: null };
    },
    async getCourse({ courseId }) {
      return { courseId, revision: adapter.revision, title: courseId === COURSE.id ? TITLE : "Outro curso" };
    },
    async listCourseStudyUnits(input) {
      calls.units.push(input);
      const start = input.cursorStudyUnitId === null ? 0 : Number(input.cursorStudyUnitId.split("-").at(-1));
      const items = units.slice(start, start + input.limit);
      const end = start + items.length;
      return { items: structuredClone(items), hasMore: end < totalUnits,
        nextCursor: end < totalUnits ? { studyUnitId: `unit-${end}` } : null };
    },
    async getCourseSources(input) {
      calls.sources.push(input);
      const start = input.cursor === null ? 0 : Number(input.cursor.split("-").at(-1));
      const items = sources.slice(start, start + input.limit);
      const end = start + items.length;
      return { items: structuredClone(items), nextCursor: end < sources.length ? `source-${end}` : null };
    },
    async getCourseAnchoredAnnotations(input) {
      calls.annotations.push(input);
      return { items: [], nextCursor: null };
    }
  };
  return adapter;
}

function studyUnit(index, text = "O pacote conserva exatamente o texto, a ordem e os identificadores.") {
  return { ordinal: index, version: 4, studyUnit: {
    id: `unit-${index}`, version: 4, title: `Unidade ${index}`, kind: "theory",
    content: [{ id: `sequence-${index}`, package: "aralearn.resource.step_sequence", version: "1.0.0",
      data: { title: "Mudança de estado", steps: [{ id: "state-a", title: "Estado inicial", text },
        { id: "state-b", title: "Estado final", text: "β → 中" }] } },
    { id: `code-${index}`, package: "aralearn.resource.code", version: "1.0.0",
      data: { language: "json", code: JSON.stringify({ payload: { id: "literal-id", version: 2, steps: ["α", "β"] } }) } }],
    response: null, feedback: []
  }, authorship: { payload: { requestId: "literal-json-field", steps: [{ version: 3 }] } } };
}

async function channelCall(channel, adapter, name, args) {
  const handler = channel === "actions"
    ? createAuthoringActionHandler({ adapter, allowedOrigins: new Set([ORIGIN]),
      actionBaseUrl: ACTION_URL, publicAppUrl: adapter.publicAppUrl })
    : createAuthoringMcpHandler({ adapter, allowedOrigins: new Set([ORIGIN]),
      resourceUrl: MCP_URL, authorizationServer: "https://project.example/auth/v1" });
  const body = channel === "actions" ? args
    : { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const response = await handler(new Request(channel === "actions" ? `${ACTION_URL}/${name}` : MCP_URL, {
    method: "POST", headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-local-token",
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION }, body: JSON.stringify(body)
  }));
  const envelope = await response.text();
  const payload = JSON.parse(envelope);
  return { status: response.status, envelope,
    value: channel === "actions" ? payload : payload.result?.structuredContent, payload };
}

test("continuação liga tarefa, consulta, curso e revisão; argumentos reordenados conservam a leitura", async () => {
  const args = { curso: TITLE, busca: "IPA" };
  const state = await openHumanReadContinuation({ args, course: COURSE, task: "consultar_fontes" });
  const first = await paginateHumanReadContext({ sources: { items: [] } }, { state, nextPage: "source-24" });
  const reopened = await openHumanReadContinuation({
    args: { busca: "IPA", curso: TITLE, continuacao: first.continuacao }, course: COURSE, task: "consultar_fontes"
  });
  assert.equal(reopened.p, "source-24");
  for (const changed of [
    { course: { ...COURSE, id: OTHER_COURSE } },
    { course: { ...COURSE, revision: 8 } },
    { args: { curso: TITLE, busca: "Outro recorte" } },
    { task: "preparar_revisao" }
  ]) {
    await assert.rejects(() => openHumanReadContinuation({ course: COURSE, task: "consultar_fontes", ...changed,
      args: { ...(changed.args ?? args), continuacao: first.continuacao } }),
    error => error.status === 409 && error.code === "human_read_context_changed");
  }
});

test("continuações malformadas falham com 422 e mensagem sem conteúdo do cursor", async () => {
  const args = { curso: TITLE };
  const state = await openHumanReadContinuation({ args, course: COURSE, task: "preparar_revisao" });
  for (const cursor of ["", "not-json_PRIVATE_SENTINEL", "a".repeat(4097), encodeCursor([]),
    encodeCursor({ ...state, o: -1 }), encodeCursor({ ...state, p: {} }),
    encodeCursor({ ...state, h: "PRIVATE_SENTINEL" }), encodeCursor({ ...state, extra: true })]) {
    await assert.rejects(() => openHumanReadContinuation({ args: { ...args, continuacao: cursor },
      course: COURSE, task: "preparar_revisao" }), error => {
      assert.equal(error.status, 422);
      assert.equal(error.code, "invalid_read_continuation");
      assert.doesNotMatch(error.message, /PRIVATE_SENTINEL/u);
      return true;
    });
  }
});

test("fragmentos JSON preservam Unicode, aspas, escapes e limites de envelope sem cortar pares substitutos", async () => {
  const content = { studyUnits: [studyUnit(1, '𝄞😀漢字 العربية e\u0301 IPA /ɲ/ "aspas" \\ caminho\n'.repeat(8000))] };
  const literal = JSON.stringify(content);
  const args = { curso: TITLE };
  let cursor;
  let previousEnd = 0;
  const fragments = [];
  do {
    const state = await openHumanReadContinuation({ args: { ...args, ...(cursor ? { continuacao: cursor } : {}) },
      course: COURSE, task: "preparar_revisao" });
    const page = await paginateHumanReadContext(content, { state });
    const fragment = page.fragmento;
    assert.ok(fragment);
    assert.equal(fragment.formato, "application/json");
    assert.equal(fragment.inicio, previousEnd);
    assert.equal(fragment.total, literal.length);
    assert.equal(fragment.texto, literal.slice(fragment.inicio, fragment.fim));
    assert.equal(fragment.texto.isWellFormed(), true);
    assert.ok(fragment.fim > previousEnd);
    assert.ok(JSON.stringify({ result: "Leitura literal", deepLink: null, nextDecision: null, context: page }).length < 100_000);
    fragments.push(fragment.texto);
    previousEnd = fragment.fim;
    cursor = page.continuacao;
    assert.equal(page.temMais, cursor !== null);
    assert.ok(fragments.length < 100);
  } while (cursor);
  assert.ok(fragments.length > 2);
  assert.equal(fragments.join(""), literal);
  assert.deepEqual(JSON.parse(fragments.join("")), content);
});

test("fragmento pendente rejeita conteúdo alterado e só avança página depois do último trecho", async () => {
  const args = { curso: TITLE };
  const context = { text: "x".repeat(130_000) };
  const initial = await openHumanReadContinuation({ args, course: COURSE, task: "preparar_revisao" });
  const first = await paginateHumanReadContext(context, { state: initial, nextPage: "unit-12" });
  const state = await openHumanReadContinuation({ args: { ...args, continuacao: first.continuacao },
    course: COURSE, task: "preparar_revisao" });
  assert.equal(state.p, null);
  await assert.rejects(() => paginateHumanReadContext({ text: "y".repeat(130_000) }, { state, nextPage: "unit-12" }),
    error => error.status === 409 && error.code === "human_read_context_changed");
  const final = await paginateHumanReadContext(context, { state, nextPage: "unit-12" });
  assert.equal(final.fragmento.fim, JSON.stringify(context).length);
  const next = await openHumanReadContinuation({ args: { ...args, continuacao: final.continuacao },
    course: COURSE, task: "preparar_revisao" });
  assert.equal(next.p, "unit-12");
  assert.equal(next.o, 0);
  assert.equal(next.h, null);
});

test("busca sem resultado nas primeiras 24 fontes oferece continuação para a fonte 25", async () => {
  const sources = Array.from({ length: 25 }, (_, i) => ({ title: i === 24 ? "Fonética IPA" : `Fonte ${i + 1}` }));
  const adapter = fixture({ sources });
  const first = await execute(adapter, "consultar_fontes", { busca: "IPA" });
  assert.deepEqual(first.context.sources.items, []);
  assert.equal(first.context.temMais, true);
  assert.match(first.result, /neste trecho/u);
  assert.equal(adapter.calls.sources.length, 1);
  const second = await execute(adapter, "consultar_fontes", { busca: "IPA", continuacao: first.context.continuacao });
  assert.deepEqual(second.context.sources.items, [sources[24]]);
  assert.equal(second.context.continuacao, null);
  assert.equal(second.context.temMais, false);
  assert.deepEqual(adapter.calls.sources.map(input => [input.cursor, input.limit, input.expectedRevision]),
    [[null, 24, 7], ["source-24", 24, 7]]);
});

test("lista autorizada revela o curso 13 e recusa a continuação em outra conta antes da consulta", async () => {
  const adapter = fixture();
  const calls = [];
  const courses = Array.from({ length: 13 }, (_, i) => ({ title: `Curso autorizado ${i + 1}` }));
  const nextCursor = { beforeId: "10000000-0000-4000-8000-000000000012", beforeUpdatedAt: "2026-09-05T12:00:00Z" };
  adapter.listCourses = async input => {
    calls.push(input);
    assert.equal(input.principal.actorId, PRINCIPAL.actorId);
    return input.beforeId === null ? { items: courses.slice(0, 12), hasMore: true, nextCursor }
      : { items: courses.slice(12), hasMore: false, nextCursor: null };
  };
  const read = (args, principal = PRINCIPAL) => executeHumanCourseTask({ adapter, principal,
    name: "retomar_curso", rawArguments: args });
  const first = await read({});
  assert.deepEqual(first.context.courses, courses.slice(0, 12));
  assert.equal(first.context.temMais, true);
  await assert.rejects(() => read({ continuacao: first.context.continuacao }, {
    ...PRINCIPAL, actorId: "20000000-0000-4000-8000-000000000002"
  }), error => error.status === 409 && error.code === "human_read_context_changed");
  assert.equal(calls.length, 1, "não consultar os cursos da outra conta com o cursor recebido");
  const second = await read({ continuacao: first.context.continuacao });
  assert.deepEqual(second.context.courses, courses.slice(12));
  assert.equal(second.context.temMais, false);
  assert.equal(second.context.continuacao, null);
  assert.deepEqual(calls.map(({ limit, beforeId, beforeUpdatedAt }) => ({ limit, beforeId, beforeUpdatedAt })),
    [{ limit: 12, beforeId: null, beforeUpdatedAt: null }, { limit: 12, ...nextCursor }]);
});

test("revisão lê uma página de 12, conserva cada studyUnit literal e remove maquinaria dos metadados", async () => {
  const units = Array.from({ length: 24 }, (_, i) => studyUnit(i + 1));
  const adapter = fixture({ units, totalUnits: 1200 });
  const first = await execute(adapter, "preparar_revisao", {});
  assert.deepEqual(first.context.studyUnits.map(item => item.studyUnit), units.slice(0, 12).map(item => item.studyUnit));
  for (const item of first.context.studyUnits) {
    const metadata = { ...item };
    delete metadata.studyUnit;
    assert.deepEqual(Object.keys(metadata).sort(), ["authorship", "ordinal"]);
    assert.deepEqual(metadata.authorship, {});
    assert.doesNotMatch(JSON.stringify(metadata), /literal-json-field|requestId|payload|steps|version/u);
  }
  assert.equal(adapter.calls.units.length, 1, "não varrer as cem páginas do curso");
  assert.equal(adapter.calls.units[0].limit, 12);
  assert.equal(adapter.calls.units[0].expectedRevision, 7);
  assert.deepEqual(adapter.calls.annotations.map(input => input.query.hierarchy.target.id),
    units.slice(0, 12).map(item => item.studyUnit.id));
  const second = await execute(adapter, "preparar_revisao", { continuacao: first.context.continuacao });
  assert.deepEqual(second.context.studyUnits.map(item => item.studyUnit), units.slice(12).map(item => item.studyUnit));
  assert.ok(second.context.studyUnits.every(item => Object.keys(item.authorship).length === 0));
  assert.deepEqual(adapter.calls.units.map(input => input.cursorStudyUnitId), [null, "unit-12"]);
  assert.equal(adapter.calls.annotations.length, 24);
});

test("curso, busca ou revisão trocados recusam continuação antes de ler outra página", async () => {
  for (const change of [{ curso: "Outro curso" }, { busca: "Outro recorte" }, { revision: 8 }]) {
    const adapter = fixture({ sources: Array.from({ length: 25 }, (_, i) => ({ title: `Fonte ${i}` })) });
    const initial = await execute(adapter, "consultar_fontes", { busca: "Fonte" });
    if (change.revision) adapter.revision = change.revision;
    await assert.rejects(() => execute(adapter, "consultar_fontes", {
      busca: "Fonte", ...(change.revision ? {} : change), continuacao: initial.context.continuacao
    }), error => {
      assert.equal(error.status, 409);
      assert.equal(error.code, "human_read_context_changed");
      assert.doesNotMatch(JSON.stringify(error), /10000000|Fonte 24/u);
      return true;
    });
    assert.equal(adapter.calls.sources.length, 1);
  }
});

test("backend que repete cursor de fontes ou unidades falha sem devolver página duplicada", async () => {
  for (const name of ["consultar_fontes", "preparar_revisao"]) {
    const adapter = fixture({ sources: Array.from({ length: 25 }, (_, i) => ({ title: `Fonte ${i}` })),
      units: Array.from({ length: 24 }, (_, i) => studyUnit(i + 1)) });
    const first = await execute(adapter, name, {});
    if (name === "consultar_fontes") {
      adapter.getCourseSources = async ({ cursor }) => ({ items: [{ title: "PRIVATE_DUPLICATE" }], nextCursor: cursor });
    } else {
      adapter.listCourseStudyUnits = async ({ cursorStudyUnitId }) => ({ items: [studyUnit(13, "PRIVATE_DUPLICATE")],
        hasMore: true, nextCursor: { studyUnitId: cursorStudyUnitId } });
    }
    await assert.rejects(() => execute(adapter, name, { continuacao: first.context.continuacao }), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, "course_service_unavailable");
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE_DUPLICATE/u);
      return true;
    });
  }
});

test("MCP e Actions devolvem o mesmo JSON literal da revisão pelo nome corrente", async () => {
  const units = [studyUnit(1)];
  const direct = await execute(fixture({ units }), "preparar_revisao", {});
  for (const channel of ["actions", "mcp"]) {
    const response = await channelCall(channel, fixture({ units }), "preparar_revisao", { curso: TITLE });
    assert.equal(response.status, 200);
    assert.deepEqual(response.value, direct);
    assert.deepEqual(response.value.context.studyUnits.map(item => item.studyUnit), units.map(item => item.studyUnit));
    assert.doesNotMatch(response.envelope, /literal-json-field|requestId/u);
    assert.deepEqual(response.value.context.studyUnits[0].authorship, {});
    if (channel === "actions") assert.ok(response.envelope.length < 100_000);
  }
});

test("fontes extensas atravessam ambos os transportes em envelopes Actions abaixo de 100 mil caracteres", async () => {
  const sources = Array.from({ length: 24 }, (_, i) => ({ title: `Fonte ${i + 1}`,
    citationText: '😀 IPA /ɲ/ العربية 漢字 "\\\n'.repeat(60),
    authors: Array.from({ length: 10 }, (_, n) => ({ literal: `${n}: ${"Nome fornecido 漢字 ".repeat(24)}` })) }));
  const allPages = [];
  for (const channel of ["actions", "mcp"]) {
    const adapter = fixture({ sources });
    const pages = [];
    let cursor;
    do {
      const response = await channelCall(channel, adapter, "consultar_fontes", {
        curso: TITLE, ...(cursor ? { continuacao: cursor } : {})
      });
      assert.equal(response.status, 200);
      assert.ok(response.value?.context?.fragmento, response.envelope.slice(0,500));
      if (channel === "actions") assert.ok(response.envelope.length < 100_000);
      pages.push(response.value);
      cursor = response.value.context.continuacao;
      assert.ok(pages.length < 30);
    } while (cursor);
    assert.ok(pages.length > 1);
    assert.deepEqual(JSON.parse(pages.map(page => page.context.fragmento.texto).join("")),
      { sources: { items: sources, nextCursor: null } });
    allPages.push(pages);
  }
  assert.deepEqual(allPages[0], allPages[1]);
});
