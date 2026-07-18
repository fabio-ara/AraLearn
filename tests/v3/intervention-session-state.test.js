import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyInterventionSession,
  normalizeInterventionSessionEntry
} from "../../src/ui/interventionSessionState.js";

test("a sessão de intervenção guarda somente o contexto atual da microssequência", () => {
  const reference = {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a"
  };
  const session = createEmptyInterventionSession({ reference });

  assert.equal(session.microsequenceKey, "micro-a");
  assert.deepEqual(
    [session.courseKey, session.moduleKey, session.lessonKey, session.microsequenceKey],
    ["course-a", "module-a", "lesson-a", "micro-a"]
  );
});

test("a normalização descarta campos externos à sessão canônica", () => {
  const session = normalizeInterventionSessionEntry({
    courseKey: "course-a",
    status: "running",
    obsoleteField: "obsolete"
  });

  assert.equal(session.status, "running");
  assert.equal(Object.hasOwn(session, "obsoleteField"), false);
});
