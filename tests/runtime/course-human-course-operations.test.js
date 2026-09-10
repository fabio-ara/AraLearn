import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { courseAuthoringAnalyticsFixture } from "../helpers/courseAuthoringAnalyticsFixture.js";
import { assembleCourseAuthoringExport, buildCourseAuthoringComparison } from "../../src/domain/courseAuthoringComparison.js";
import { createAuthoringActionHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import { encodeCourseActionTaskRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js";
import { ARALEARN_MCP_PROTOCOL_VERSION, createAuthoringMcpHandler } from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";

const LEFT = "30600000-0000-4000-8000-000000000101";
const RIGHT = "30600000-0000-4000-8000-000000000102";
const principal = { actorId: "30600000-0000-4000-8000-000000000001", authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] };
const readPrincipal = { ...principal, scopes: ["authoring:read"] };
const LITERAL_TEXT = 'Wi\u2011Fi, sequência literal \\u2011, 日本語 😀 e\u0301 <texto> "aspas" e \\ caminho.';
const sha256 = value => createHash("sha256").update(value).digest("hex");
const call = (adapter, name, rawArguments, actor = principal) => executeHumanCourseTask({ adapter, principal: actor, name, rawArguments });
function readers() {
  const calls = [];
  const adapter = { publicAppUrl: "https://app.example", calls,
    resolvePrincipal: async () => readPrincipal,
    resolveActionPrincipal: async () => ({ ...readPrincipal, authenticationKind: "action" }),
    listCourses: async request => { calls.push(["list", request]); return { items: [{ courseId: request.query === "Direita" ? RIGHT : LEFT, title: request.query }], hasMore: false }; },
    getCourse: async request => { calls.push(["get", request]); return { courseId: request.courseId, title: request.courseId === RIGHT ? "Direita" : "Esquerda", revision: 7, deepLink: "https://app.example/#/study" }; }
  };
  return adapter;
}
function page(courseId = LEFT, title = "Esquerda", studyUnits = []) { return courseAuthoringAnalyticsFixture({ courseId, title, studyUnits }); }
function exportValue({ large = false } = {}) {
  const document = JSON.parse(readFileSync(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
  const course = document.courses[0]; course.id = LEFT; course.title = "Esquerda";
  const firstUnit = course.modules[0].lessons[0].microsequences[0].studyUnits[0];
  firstUnit.content = [{ id: "literal-text", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: LITERAL_TEXT } }];
  if (large) {
    const micro = course.modules[0].lessons[0].microsequences[0];
    const template = micro.studyUnits[0];
    micro.studyUnits = Array.from({ length: 30 }, (_, index) => ({ ...structuredClone(template), id: `literal-${index}`, position: index + 1,
      content: [{ id: `paragraph-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: `Literal ${index}: ${LITERAL_TEXT} `.repeat(100) } }] }));
  }
  const units = course.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.microsequences.flatMap(micro => micro.studyUnits)))
    .map(unit => ({ studyUnitRef: unit.id, title: unit.title }));
  return assembleCourseAuthoringExport({ analytics: page(LEFT, "Esquerda", units), document });
}

test("cópia humana prepara a intenção sem efeito e recupera a mesma identidade sem reler origem", async () => {
  const adapter = readers(); const writes = [];
  adapter.copyCourse = async request => {
    writes.push(request);
    if (writes.length === 1) throw Object.assign(new Error("Resposta perdida"), { status: 503 });
    return { targetCourseId: RIGHT, idempotent: true };
  };
  const prepared = await call(adapter, "copiar_curso", { curso: "Esquerda", titulo: "Minha cópia" });
  assert.equal(writes.length, 0);
  assert.ok(adapter.calls.every(([, request]) => request.copySourcesOnly === true));
  const args = { curso: "Esquerda", titulo: "Minha cópia", confirmacao: prepared.context.confirmacao };
  adapter.listCourses = adapter.getCourse = async () => { throw Error("A origem não deve ser procurada novamente"); };
  await assert.rejects(call(adapter, "copiar_curso", args), /Resposta perdida/u);
  const recovered = await call(adapter, "copiar_curso", args);
  assert.equal(recovered.context.confirmacao, args.confirmacao);
  assert.equal(recovered.deepLink, `https://app.example/#/authoring/courses/${RIGHT}?section=planning`);
  const { deadlineAt: ignored1, ...first } = writes[0]; const { deadlineAt: ignored2, ...second } = writes[1];
  assert.ok(ignored1 > 0 && ignored2 > 0); assert.deepEqual(first, second);
  assert.equal(first.confirmed, true);
  assert.match(first.requestId, /^copy:[0-9]{13}:[a-f0-9-]{36}$/u);
  assert.equal(new Date(Number(first.requestId.split(":")[1])).toISOString(), first.requestedAt);
});

test("cópia humana recusa troca de conta, título, origem e escopo antes do writer", async () => {
  const adapter = readers(); let writes = 0;
  adapter.copyCourse = async () => { writes++; };
  const prepared = await call(adapter, "copiar_curso", { curso: "Esquerda", titulo: "Minha cópia" });
  const args = { curso: "Esquerda", titulo: "Minha cópia", confirmacao: prepared.context.confirmacao };
  for (const invalid of [{ ...args, titulo: "Outro" }, { ...args, curso: "Direita" }, { ...args, confirmacao: "inválida" }]) {
    await assert.rejects(call(adapter, "copiar_curso", invalid), error => error.status === 422);
  }
  await assert.rejects(call(adapter, "copiar_curso", args, { ...principal, actorId: RIGHT }), error => error.status === 422);
  await assert.rejects(call(adapter, "copiar_curso", args, readPrincipal), error => error.status === 403);
  assert.equal(writes, 0);
});

test("resolver de fontes copiáveis inclui concessão explícita e conserva o reader owner nas outras tarefas", async () => {
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://project.example", serverApiKey: "sb_secret_fixture", publishableKey: "sb_publishable_fixture", publicAppUrl: "https://app.example", fetchImpl: () => { throw Error("Unexpected network"); } });
  const rpcs = [];
  adapter.rpc = async (name, input) => { rpcs.push([name, input]); return name.startsWith("list_") ? { items: input.p_course_id
    ? [{ courseId: LEFT, title: "Esquerda", canCopy: true }]
    : [{ courseId: LEFT, title: "Esquerda", canCopy: true }, { courseId: RIGHT, title: "Direita", canCopy: false }], hasMore: false } : { courseId: LEFT, canCopy: true }; };
  assert.deepEqual((await adapter.listCourses({ principal, copySourcesOnly: true })).items.map(item => item.courseId), [LEFT]);
  await adapter.getCourse({ principal, courseId: LEFT, copySourcesOnly: true });
  await adapter.listCourses({ principal }); await adapter.getCourse({ principal, courseId: LEFT });
  assert.deepEqual(rpcs.map(([name]) => name), ["list_copyable_courses_for_actor_v1", "list_copyable_courses_for_actor_v1", "list_owned_courses_for_actor_v1", "get_owned_course_for_actor_v1"]);
  assert.equal(rpcs[0][1].p_course_id, null);
  assert.equal(rpcs[1][1].p_course_id, LEFT);
  assert.equal(rpcs[1][1].p_limit, 1);
  adapter.rpc = async () => ({ items: null, canCopy: false });
  await assert.rejects(adapter.listCourses({ principal, copySourcesOnly: true }), error => error.status === 503);
  await assert.rejects(adapter.getCourse({ principal, courseId: LEFT, copySourcesOnly: true }), error => error.status === 503);
  adapter.rpc = async () => ({ items: [] });
  await assert.rejects(adapter.getCourse({ principal, courseId: LEFT, copySourcesOnly: true }), error => error.status === 404);
  adapter.rpc = async () => ({ items: [{ courseId: RIGHT, canCopy: true }] });
  await assert.rejects(adapter.getCourse({ principal, courseId: LEFT, copySourcesOnly: true }), error => error.status === 503);
});

test("preparação de cópia relê a origem autorizada pela RPC corrente sem tocar no writer", async () => {
  const requests = [];
  const course = { courseId: LEFT, title: "Esquerda", revision: 7, canCopy: true, ownership: "shared" };
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://project.example",
    serverApiKey: "sb_secret_fixture", publishableKey: "sb_publishable_fixture", publicAppUrl: "https://app.example",
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/list_copyable_courses_for_actor_v1");
      const input = JSON.parse(options.body); requests.push(input);
      assert.equal(input.p_actor_id, principal.actorId);
      return Response.json({ contract: "aralearn.course-list.v2", items: [course], hasMore: false, nextCursor: null });
    }
  });
  const prepared = await call(adapter, "copiar_curso", { curso: "Esquerda", titulo: "Minha cópia" });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].p_query, "Esquerda");
  assert.equal(requests[0].p_course_id, null);
  assert.equal(requests[1].p_course_id, LEFT);
  assert.equal(prepared.context.titulo, "Minha cópia");
  assert.ok(prepared.context.confirmacao);
  assert.match(prepared.deepLink, new RegExp(LEFT, "u"));
});

test("comparação humana preserva inventário literal e IDs sem abrir leitura de curso alheio", async () => {
  const adapter = readers(); const left = page(); const right = page(RIGHT, "Direita");
  left.basis.analysisUnits = [{ ref: "analysis-one", position: 1, statement: "Literal 日本語", description: "steps, id e payload são palavras literais." }];
  const comparison = buildCourseAuthoringComparison({ left, right });
  adapter.compareCourseAuthoring = async request => { assert.deepEqual(request.left, { courseId: LEFT, expectedRevision: 7, scope: { kind: "course", ref: null } }); return comparison; };
  const output = await call(adapter, "comparar_cursos", { esquerda: { curso: "Esquerda" }, direita: { curso: "Direita" } }, readPrincipal);
  assert.deepEqual(output.context.authoringComparison, comparison);
  assert.ok(adapter.calls.every(([, request]) => request.copySourcesOnly === undefined));
  adapter.compareCourseAuthoring = async () => ({ ...comparison, left: { ...comparison.left, course: { ...comparison.left.course, revision: 8 } } });
  await assert.rejects(call(adapter, "comparar_cursos", { esquerda: { curso: "Esquerda" }, direita: { curso: "Direita" } }), /edição/u);
});

test("seleção humana de unidade usa a identidade do reader curricular", async () => {
  const adapter = readers(); const exported = exportValue();
  const selected = { kind: "study_unit", ref: "unit-selected", label: "Unidade escolhida" };
  exported.scope = selected; exported.analytics.scope = { selected, options: [selected] };
  adapter.listCourseStudyUnits = async () => ({ items: [{ ordinal: 1, studyUnit: { id: "unit-selected", title: "Unidade escolhida" } }], hasMore: false });
  adapter.getCourseAuthoringExport = async request => { assert.deepEqual(request.scope, { kind: "study_unit", ref: "unit-selected" }); return exported; };
  const output = await call(adapter, "exportar_autoria", { recorte: { curso: "Esquerda", unidade: 1 } }, readPrincipal);
  assert.equal(JSON.parse(output.context.fragmento.texto).authoringExport.scope.ref, "unit-selected");
});

for (const channel of ["actions", "mcp"]) for (const large of [false, true]) {
  test(`exportação ${channel} ${large ? "paginada" : "pequena"} conserva texto e hash sob troca de hífen no envelope`, async () => {
    const adapter = readers(); const exported = exportValue({ large });
    const original = structuredClone(exported); const reads = [];
    adapter.getCourseAuthoringExport = async request => { reads.push(request); return exported; };
    const origin = "https://chatgpt.com";
    const base = `https://project.example/functions/v1/aralearn-authoring-${channel === "actions" ? "action" : "mcp"}`;
    const handler = channel === "actions"
      ? createAuthoringActionHandler({ adapter, allowedOrigins: new Set([origin]), actionBaseUrl: base, publicAppUrl: adapter.publicAppUrl })
      : createAuthoringMcpHandler({ adapter, allowedOrigins: new Set([origin]), resourceUrl: base, authorizationServer: "https://project.example/auth/v1" });
    let continuation, rawLiteral = "", retainedLiteral = "", pages = 0;
    const digests = new Set(); let allFragmented = true;
    do {
      const args = { recorte: { curso: "Esquerda" }, ...(continuation ? { continuacao: continuation } : {}) };
      const action = channel === "actions" ? encodeCourseActionTaskRequest("exportar_autoria", args) : null;
      const response = await handler(new Request(action ? `${base}/${action.operationName}` : base, {
        method: "POST", headers: { Origin: origin, Authorization: "Bearer synthetic-export-token",
          "Content-Type": "application/json", Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION },
        body: JSON.stringify(action ? action.arguments : { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "exportar_autoria", arguments: args } })
      }));
      const raw = await response.text();
      assert.equal(response.status, 200, raw);
      // Simulação local da conversão observada no histórico, não prova do cliente real.
      const retained = raw.replaceAll("\u2011", "-");
      const rawPayload = JSON.parse(raw), retainedPayload = JSON.parse(retained);
      if (channel === "mcp") assert.equal(rawPayload.result.isError, false);
      const value = channel === "actions" ? rawPayload : rawPayload.result.structuredContent;
      const received = channel === "actions" ? retainedPayload : retainedPayload.result.structuredContent;
      if (channel === "mcp") assert.ok(retainedPayload.result.content[0].text.startsWith(received.result));
      assert.ok(JSON.stringify(value).length < 99_999);
      assert.ok(JSON.stringify(value.context).length <= 88_000);
      assert.ok(Buffer.byteLength(JSON.stringify(value.context)) <= 128 * 1024);
      const fragment = received.context.fragmento;
      allFragmented &&= Boolean(fragment);
      if (fragment) {
        assert.equal(fragment.formato, "application/json");
        assert.equal(fragment.inicio, retainedLiteral.length);
        assert.equal(fragment.fim, fragment.inicio + fragment.texto.length);
        rawLiteral += value.context.fragmento.texto;
        retainedLiteral += fragment.texto;
        assert.equal(fragment.texto.includes("\u2011"), false);
        if (!received.context.temMais) assert.equal(fragment.total, retainedLiteral.length);
      } else {
        // Antes da correção, o export pequeno expunha o caractere e perdia literalidade.
        const { continuacao: omittedCursor, temMais: omittedMore, ...context } = received.context;
        assert.equal(omittedCursor, null); assert.equal(omittedMore, false);
        retainedLiteral = JSON.stringify(context);
      }
      continuation = received.context.continuacao;
      assert.equal(received.context.temMais, continuation !== null);
      if (continuation) digests.add(JSON.parse(Buffer.from(continuation, "base64url").toString("utf8")).h);
      assert.ok(++pages < 40);
    } while (continuation);
    assert.deepEqual(JSON.parse(retainedLiteral), { authoringExport: original });
    assert.ok(allFragmented, "export pequeno também usa JSON literal protegido");
    assert.match(retainedLiteral, /\\u2011/u);
    assert.equal(sha256(retainedLiteral), sha256(rawLiteral));
    if (large) { assert.ok(pages > 1); assert.deepEqual([...digests], [sha256(retainedLiteral)]); }
    else assert.equal(pages, 1);
    assert.deepEqual(exported, original, "a representação não altera os dados entregues pelo adapter");
    assert.ok(reads.every(request => request.courseId === LEFT && request.expectedRevision === 7 &&
      request.scope.kind === "course" && request.scope.ref === null));
  });
}

test("exportação humana grande reconstrói JSON literal por fragmentos e recusa edição misturada", async () => {
  const adapter = readers(); const exported = exportValue({ large: true });
  adapter.getCourseAuthoringExport = async () => exported;
  let continuation; let literal = ""; let pages = 0; let firstContinuation;
  do {
    const output = await call(adapter, "exportar_autoria", { recorte: { curso: "Esquerda" }, ...(continuation ? { continuacao: continuation } : {}) }, readPrincipal);
    assert.ok(JSON.stringify(output).length < 99_999);
    const fragment = output.context.fragmento;
    assert.equal(fragment.inicio, literal.length); literal += fragment.texto; assert.equal(fragment.fim, literal.length);
    continuation = output.context.continuacao; firstContinuation ??= continuation; pages++;
    assert.ok(pages < 30);
  } while (continuation);
  assert.ok(pages > 1); assert.deepEqual(JSON.parse(literal), { authoringExport: exported });
  const text = exported.artifact.document.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[0].content[0].data;
  const originalText = text.text;
  text.text = text.text.replaceAll("\u2011", "-");
  await assert.rejects(call(adapter, "exportar_autoria", { recorte: { curso: "Esquerda" }, continuacao: firstContinuation }),
    error => error.code === "human_read_context_changed", "a mesma conversão nos dados reais continua sendo mudança material");
  text.text = originalText;
  adapter.getCourse = async request => ({ courseId: request.courseId, title: "Esquerda", revision: 8 });
  await assert.rejects(call(adapter, "exportar_autoria", { recorte: { curso: "Esquerda" }, continuacao: firstContinuation }), error => error.code === "human_read_context_changed");
});
