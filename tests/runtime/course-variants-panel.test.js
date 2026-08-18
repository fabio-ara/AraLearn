import assert from "node:assert/strict";
import test from "node:test";
import { createCourseVariantsPanel } from "../../src/ui/CourseVariantsPanel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SET_ID = "20000000-0000-4000-8000-000000000002";

class Root {
  constructor() { this.innerHTML = ""; this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
}

test("painel de variantes enumera conjuntos e abre uma comparação vinculada ao Curso", async () => {
  const calls = [];
  const controller = {
    async listCourseVariantComparisons(courseId, revision) {
      calls.push(["list", courseId, revision]);
      return {
        contract: "aralearn.course-variant-comparison-list.v1",
        sourceCourseId: COURSE_ID, sourceCourseRevision: 4,
        items: [{ comparisonSetId: SET_ID, checkpointId: "30000000-0000-4000-8000-000000000003", checkpointHash: "a".repeat(64), checkpointCourseRevision: 4, memberCount: 2, attachedCount: 2, detachedCount: 0, createdAt: "2026-08-18T12:00:00Z", updatedAt: "2026-08-18T12:00:00Z" }]
      };
    },
    async loadCourseVariantComparison(courseId, options) {
      calls.push(["open", courseId, options.comparisonSetId, options.expectedCourseRevision]);
      return {
        contract: "aralearn.course-variant-comparison.v1", comparisonSetId: SET_ID,
        source: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", currentCourseRevision: 4, checkpointCourseRevision: 4, changedSinceCheckpoint: false, checkpointId: "30000000-0000-4000-8000-000000000003", checkpointHash: "a".repeat(64) },
        members: [{ courseId: "40000000-0000-4000-8000-000000000004", label: "A", title: "A", goal: "Objetivo", attachedCourseRevision: 1, currentCourseRevision: 1, changedSinceAttached: false, detachedAt: null, parameterDifferences: [], componentPolicyDifference: null, materialization: { partCount: 0, completedCount: 0, runningCount: 0, latestUpdatedAt: null } }]
      };
    }
  };
  const root = new Root();
  const panel = createCourseVariantsPanel({ root, controller, course: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", revision: 4 } });
  await panel.open();
  assert.match(root.innerHTML, /Planejamento compartilhado/u);
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "open", setId: SET_ID } }) } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [["list", COURSE_ID, 4], ["open", COURSE_ID, SET_ID, 4]]);
  assert.match(root.innerHTML, /Comparação/u);
  panel.destroy();
});
