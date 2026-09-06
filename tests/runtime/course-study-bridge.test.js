import test from "node:test";
import assert from "node:assert/strict";

import { CourseStudyBridge } from "../../src/study/CourseStudyBridge.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";

test("ponte separa cache local e verificação fresca de acesso da carga de conteúdo", async () => {
  const calls = [];
  const course = { courseId: COURSE_ID, revision: 4 };
  const bridge = new CourseStudyBridge({ controller: {
    async listCourses() { throw new Error("Rede proibida"); },
    async loadCourseDocument() { throw new Error("Rede proibida"); },
    async clearCourse() {},
    async listCachedCourses(options) { calls.push(["cache-list", options]); return { items: [course] }; },
    async loadCachedCourseDocument(id) { calls.push(["cache-course", id]); return { course, document: { courses: [] } }; },
    async checkCourseAccess(id) { calls.push(["access", id]); return course; }
  } });
  assert.deepEqual((await bridge.listCachedCourses({ cursor: null })).items, [course]);
  assert.equal((await bridge.loadCachedCourse(COURSE_ID)).revision, 4);
  assert.deepEqual(await bridge.checkCourseAccess(COURSE_ID), course);
  assert.deepEqual(calls, [["cache-list", { cursor: null }], ["cache-course", COURSE_ID], ["access", COURSE_ID]]);
});

test("a ponte do Estudo delega lista, composição e limpeza a uma única cadeia", async () => {
  const calls = [];
  const document = {
    contract: "aralearn.course.v1",
    courses: [{ id: COURSE_ID, title: "Curso", goal: "Aprender.", modules: [] }]
  };
  const controller = {
    async listCourses(options) {
      calls.push(["list", options]);
      return { items: [{ courseId: COURSE_ID, title: "Curso" }], hasMore: false };
    },
    async loadCourseDocument(courseId, options) {
      calls.push(["load", courseId, options]);
      return {
        course: { courseId, title: "Curso", goal: "Aprender.", revision: 3 },
        rows: [],
        document,
        offline: true,
        stale: true,
        readOnly: true
      };
    },
    async hasVerifiedCourseDocument(courseId, options) {
      calls.push(["offline", courseId, options]);
      return options.revision === 3;
    },
    async clearCourse(courseId, options) { calls.push(["clear", courseId, options]); }
  };
  const bridge = new CourseStudyBridge({ controller });

  assert.equal((await bridge.listAccessibleCourses({ limit: 12 })).items[0].courseId, COURSE_ID);
  const result = await bridge.loadCourse(COURSE_ID, { entityPageSize: 200 });
  assert.equal(result.courseId, COURSE_ID);
  assert.equal(result.revision, 3);
  assert.equal(result.readOnly, true);
  assert.equal(result.document, document);
  assert.equal(await bridge.hasOfflineCourse(COURSE_ID, { revision: 3 }), true);
  await bridge.clearCourse(COURSE_ID, { clearLists: false });
  assert.deepEqual(calls, [
    ["list", { limit: 12 }],
    ["load", COURSE_ID, { entityPageSize: 200 }],
    ["offline", COURSE_ID, { revision: 3 }],
    ["clear", COURSE_ID, { clearLists: false }]
  ]);
});

test("informa indisponibilidade offline quando o controlador ainda não oferece a consulta", async () => {
  const bridge = new CourseStudyBridge({
    controller: {
      async listCourses() { return { items: [], hasMore: false }; },
      async loadCourseDocument() { throw new Error("não usado"); },
      async clearCourse() {}
    }
  });

  assert.equal(await bridge.hasOfflineCourse(COURSE_ID, { revision: 3 }), false);
});

test("recusa controlador parcial para não criar um segundo paginador", () => {
  assert.throws(
    () => new CourseStudyBridge({ controller: { listCourses() {} } }),
    /Controlador canônico/u
  );
});
