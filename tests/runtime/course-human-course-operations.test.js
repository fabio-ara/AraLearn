import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { courseAuthoringAnalyticsFixture } from "../helpers/courseAuthoringAnalyticsFixture.js";
import { assembleCourseAuthoringExport, buildCourseAuthoringComparison } from "../../src/domain/courseAuthoringComparison.js";

const LEFT = "30600000-0000-4000-8000-000000000101";
const RIGHT = "30600000-0000-4000-8000-000000000102";
const principal = { actorId: "30600000-0000-4000-8000-000000000001", authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] };
const readPrincipal = { ...principal, scopes: ["authoring:read"] };
const call = (adapter, name, rawArguments, actor = principal) => executeHumanCourseTask({ adapter, principal: actor, name, rawArguments });
function readers() {
  const calls = [];
  const adapter = { publicAppUrl: "https://app.example", calls,
    listCourses: async request => { calls.push(["list", request]); return { items: [{ courseId: request.query === "Direita" ? RIGHT : LEFT, title: request.query }], hasMore: false }; },
    getCourse: async request => { calls.push(["get", request]); return { courseId: request.courseId, title: request.courseId === RIGHT ? "Direita" : "Esquerda", revision: 7, deepLink: "https://app.example/#/study" }; }
  };
  return adapter;
}
function page(courseId = LEFT, title = "Esquerda", studyUnits = []) { return courseAuthoringAnalyticsFixture({ courseId, title, studyUnits }); }
function exportValue({ large = false } = {}) {
  const document = JSON.parse(readFileSync(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
  const course = document.courses[0]; course.id = LEFT; course.title = "Esquerda";
  if (large) {
    const micro = course.modules[0].lessons[0].microsequences[0];
    const template = micro.studyUnits[0];
    micro.studyUnits = Array.from({ length: 30 }, (_, index) => ({ ...structuredClone(template), id: `literal-${index}`, position: index + 1,
      content: [{ id: `paragraph-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: `Literal ${index}: 日本語 😀 <texto> *ênfase* "aspas" `.repeat(200) } }] }));
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
  adapter.rpc = async (name, input) => { rpcs.push([name, input]); return name.startsWith("list_") ? { items: [{ courseId: LEFT, title: "Esquerda", canCopy: true }, { courseId: RIGHT, title: "Direita", canCopy: false }], hasMore: false } : { courseId: LEFT, canCopy: true }; };
  assert.deepEqual((await adapter.listCourses({ principal, copySourcesOnly: true })).items.map(item => item.courseId), [LEFT]);
  await adapter.getCourse({ principal, courseId: LEFT, copySourcesOnly: true });
  await adapter.listCourses({ principal }); await adapter.getCourse({ principal, courseId: LEFT });
  assert.deepEqual(rpcs.map(([name]) => name), ["list_courses_for_actor_v1", "get_course_for_actor_v1", "list_owned_courses_for_actor_v1", "get_owned_course_for_actor_v1"]);
  adapter.rpc = async () => ({ items: null, canCopy: false });
  await assert.rejects(adapter.listCourses({ principal, copySourcesOnly: true }), error => error.status === 503);
  await assert.rejects(adapter.getCourse({ principal, courseId: LEFT, copySourcesOnly: true }), error => error.status === 404);
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
  assert.equal(output.context.authoringExport.scope.ref, "unit-selected");
});

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
  adapter.getCourse = async request => ({ courseId: request.courseId, title: "Esquerda", revision: 8 });
  await assert.rejects(call(adapter, "exportar_autoria", { recorte: { curso: "Esquerda" }, continuacao: firstContinuation }), error => error.code === "human_read_context_changed");
});
