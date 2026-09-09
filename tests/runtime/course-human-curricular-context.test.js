import test from "node:test";
import assert from "node:assert/strict";
import { resolveHumanCourseContext } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTaskExecutor.js";

const courseId = "20000000-0000-4000-8000-000000000001";
const principal = { actorId: "10000000-0000-4000-8000-000000000001" };
function fixture() {
  const calls = [];
  const plan = { courseRevision: 8, plan: { version: 3, title: "Curso", parts: [], curriculum: { modules: [
    { id: "module-a", title: "Fundamentos", position: 0, lessons: [{ id: "lesson-a", title: "Introdução", position: 0,
      microsequences: [{ id: "micro-a", title: "Relações", position: 0 }] }] },
    { id: "module-b", title: "Aplicações", position: 1, lessons: [{ id: "lesson-b", title: "Introdução", position: 0,
      microsequences: [{ id: "micro-b", title: "Relações", position: 0 }, { id: "micro-c", title: "Condições", position: 1 }] }] }
  ] } } };
  const adapter = {
    async listCourses() { return { items: [{ courseId, title: "Curso" }], hasMore: false }; },
    async getCourse() { return { courseId, title: "Curso", revision: 7 }; },
    async getCourseInstructionalPlan() { return structuredClone(plan); },
    async listCourseStudyUnits(request) { calls.push(request); return { items: [{ ordinal: 1, studyUnit: { id: "unit", title: "Unidade" } }], hasMore: false }; }
  };
  return { adapter, plan, calls, resolve: extra => resolveHumanCourseContext({ adapter, principal, course: "Curso", ...extra }) };
}

test("resolver curricular usa módulo e lição humanos e microssequência do ramo sem exigir partes", async () => {
  const f = fixture();
  const context = await f.resolve({ module: "aplicacoes", lesson: 1, microsequence: "relações" });
  assert.equal(context.module.id, "module-b");
  assert.equal(context.lesson.id, "lesson-b");
  assert.equal(context.microsequence.id, "micro-b");
  assert.equal(context.course.revision, 8);
  assert.equal(context.part, null);
  assert.equal((await f.resolve({ module: 2, microsequence: 2 })).microsequence.id, "micro-c");
  assert.equal((await f.resolve({ microsequence: "Condições" })).microsequence.id, "micro-c");
});

test("referências repetidas, ramo incompatível e parte incompatível não escolhem alvo fora do escopo", async () => {
  const f = fixture();
  for (const args of [{ lesson: "Introdução" }, { lesson: 1 }, { microsequence: "Relações" }]) {
    await assert.rejects(f.resolve(args), error => error.code === "ambiguous_human_reference");
  }
  await assert.rejects(f.resolve({ module: "Fundamentos", microsequence: "Condições" }), error => error.status === 404);
  f.plan.plan.parts = [{ id: "part", title: "Parte", position: 0, microsequences: [{ id: "micro-a", title: "Relações" }] }];
  await assert.rejects(f.resolve({ module: "Aplicações", part: 1, microsequence: "Relações" }), error => error.status === 404);
});

test("unidades são buscadas no módulo ou lição resolvidos pelo reader corrente", async () => {
  const f = fixture();
  await f.resolve({ module: 2, studyUnits: [1] });
  assert.equal(f.calls[0].scopeKind, "module");
  assert.equal(f.calls[0].scopeId, "module-b");
  await f.resolve({ module: 1, lesson: 1, studyUnits: [1] });
  assert.equal(f.calls[1].scopeKind, "lesson");
  assert.equal(f.calls[1].scopeId, "lesson-a");
  assert.equal(f.calls[1].expectedRevision, 8);
});
