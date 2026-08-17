import test from "node:test";
import assert from "node:assert/strict";

import { CourseStudyBridge } from "../../src/study/CourseStudyBridge.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";

test("a ponte do Estudo delega lista, composição e limpeza a uma única cadeia", async () => {
  const calls = [];
  const document = {
    contract: "aralearn.library.v1",
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
    async clearCourse(courseId) { calls.push(["clear", courseId]); }
  };
  const bridge = new CourseStudyBridge({ controller });

  assert.equal((await bridge.listAccessibleCourses({ limit: 12 })).items[0].courseId, COURSE_ID);
  const result = await bridge.loadCourse(COURSE_ID, { entityPageSize: 200 });
  assert.equal(result.courseId, COURSE_ID);
  assert.equal(result.revision, 3);
  assert.equal(result.readOnly, true);
  assert.equal(result.document, document);
  await bridge.clearCourse(COURSE_ID);
  assert.deepEqual(calls, [
    ["list", { limit: 12 }],
    ["load", COURSE_ID, { entityPageSize: 200 }],
    ["clear", COURSE_ID]
  ]);
});

test("recusa controlador parcial para não criar um segundo paginador", () => {
  assert.throws(
    () => new CourseStudyBridge({ controller: { listCourses() {} } }),
    /Controlador canônico/u
  );
});
