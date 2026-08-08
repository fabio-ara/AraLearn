import test from "node:test";
import assert from "node:assert/strict";

import {
  synchronizationHasPersonalReplicaChanges,
  synchronizationRequiresFullReplicaRefresh
} from "../../src/sync/replicaRefreshPolicy.js";

test("mudança de seleção sincronizada recompõe a réplica oficial", () => {
  const result = {
    pushed: { accepted: 2, rejected: 0 },
    bootstrap: { status: "already_bootstrapped" },
    pulled: {
      applied: 2,
      appliedByStore: { courseSelections: 2 }
    },
    updatedCourses: 0,
    unavailableCourses: []
  };

  assert.equal(synchronizationHasPersonalReplicaChanges(result), true);
  assert.equal(synchronizationRequiresFullReplicaRefresh(result), true);
});

test("mudanças estruturais da réplica continuam exigindo recomposição completa", () => {
  const cases = [
    { bootstrap: { status: "applied" } },
    { pulled: { applied: 1, appliedByStore: { courseSelections: 1 } } },
    { updatedCourses: 1 },
    { unavailableCourses: [{ courseId: "course-1" }] }
  ];

  cases.forEach((result) => {
    assert.equal(synchronizationRequiresFullReplicaRefresh(result), true);
  });
});
