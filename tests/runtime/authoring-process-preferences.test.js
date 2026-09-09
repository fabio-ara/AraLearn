import assert from "node:assert/strict";
import test from "node:test";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";
import {
  AUTHORING_PROCESS_PARAMETER_DEFINITIONS,
  AUTHORING_PROCESS_PREFERENCES_CONTRACT,
  AUTHORING_PROCESS_CHANGE_CONTRACT,
  defaultAuthoringProcessPreferences,
  normalizeAuthoringProcessPreferences,
  normalizeAuthoringProcessPreferencesChange,
  resolveAuthoringProcessPreferences,
  createAuthoringProcessMandate
} from "../../src/domain/authoringProcessPreferences.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const selection = { courseId: COURSE, moduleId: "module", lessonId: "lesson", microsequenceId: "micro", studyUnitId: "unit" };
const PARAMETER = "authoring_chat_response_word_target";
const account = (preferences = defaultAuthoringProcessPreferences(), revision = 0) => ({
  contract: AUTHORING_PROCESS_PREFERENCES_CONTRACT, revision, preferences,
  updatedAt: revision ? "2026-09-09T03:00:00.000Z" : null
});
function setPreference(preferences, value) {
  return { ...preferences, parameters: preferences.parameters.map(parameter => parameter.parameterId === PARAMETER
    ? { parameterId: PARAMETER, mode: "fixed", value } : parameter) };
}
function setCondition(design, value, origin = "research_condition") {
  design.parameters.find(parameter => parameter.parameterId === PARAMETER).effectiveAssignment = {
    mode: "fixed", value, origin, reason: "Condição explícita para esta fixture.",
    sourceScope: { kind: "course", ref: COURSE }, inherited: true
  };
  return design;
}

test("processo reutiliza as definições e mantém foco, recorte, pausas e revisão independentes", () => {
  assert.equal(AUTHORING_PROCESS_PARAMETER_DEFINITIONS.length, 5);
  for (const definition of AUTHORING_PROCESS_PARAMETER_DEFINITIONS) {
    assert.equal(definition, COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === definition.id));
  }
  const original = defaultAuthoringProcessPreferences();
  const changed = normalizeAuthoringProcessPreferences({ ...original, focus: "content", cadence: "batch", reviewPoints: [] });
  assert.deepEqual(changed.parameters, original.parameters);
  for (const value of [
    { ...original, focus: "brief" }, { ...original, cadence: "on_request" },
    { ...original, reviewPoints: ["explanation", "explanation"] },
    { ...original, visibility: "public" },
    { ...original, parameters: original.parameters.slice(1) },
    { ...original, parameters: original.parameters.map((entry, index) => index ? entry : {
      parameterId: "study_unit_content_word_target", mode: "fixed", value: 180
    }) }
  ]) assert.throws(() => normalizeAuthoringProcessPreferences(value));
});

test("preferência pessoal resolve ausência e mantém condição autoral/pesquisa do curso", () => {
  const personal = account(setPreference(defaultAuthoringProcessPreferences(), 200), 1);
  const design = courseDesignFixture(selection);
  const original = structuredClone({ personal, design });
  let resolved = resolveAuthoringProcessPreferences({ account: personal, courseDesign: design });
  assert.equal(resolved.preferences.parameters.find(({ parameterId }) => parameterId === PARAMETER).value, 200);
  assert.equal(resolved.source, "account");
  assert.deepEqual({ personal, design }, original);
  for (const origin of ["author", "research_condition"]) {
    resolved = resolveAuthoringProcessPreferences({ account: personal, courseDesign: setCondition(structuredClone(design), 90, origin) });
    assert.equal(resolved.preferences.parameters.find(({ parameterId }) => parameterId === PARAMETER).value, 90);
    assert.equal(resolved.courseConditions[0].assignment.origin, origin);
  }
});

test("mudança pessoal é percebida sem alterar o mandato acordado ou rematerializar o curso", () => {
  const courseDesign = courseDesignFixture(selection);
  const first = resolveAuthoringProcessPreferences({ account: account(setPreference(defaultAuthoringProcessPreferences(), 120), 1), courseDesign });
  const mandate = createAuthoringProcessMandate(first, { ...first.preferences, focus: "content", cadence: "microsequence" });
  const changed = resolveAuthoringProcessPreferences({
    account: account(setPreference(defaultAuthoringProcessPreferences(), 240), 2), courseDesign, mandate
  });
  assert.equal(changed.personalPreferencesChanged, true);
  assert.equal(changed.courseConditionsChanged, false);
  assert.equal(changed.requiresReconciliation, false);
  assert.deepEqual(changed.preferences, mandate.preferences);
  assert.equal(changed.currentPreferences.parameters.find(({ parameterId }) => parameterId === PARAMETER).value, 240);
  assert.equal(changed.preferences.parameters.find(({ parameterId }) => parameterId === PARAMETER).value, 120);
  assert.equal(changed.source, "mandate");
});

test("mudança de condição exige conciliação e mandato não contorna pesquisa", () => {
  const courseDesign = setCondition(courseDesignFixture(selection), 120);
  const first = resolveAuthoringProcessPreferences({ account: account(), courseDesign });
  const mandate = createAuthoringProcessMandate(first);
  assert.throws(() => createAuthoringProcessMandate(first, setPreference(first.preferences, 200)));
  const changed = resolveAuthoringProcessPreferences({ account: account(), courseDesign: setCondition(courseDesignFixture(selection), 90), mandate });
  assert.equal(changed.requiresReconciliation, true);
  assert.equal(changed.courseConditionsChanged, true);
  assert.deepEqual(changed.researchConflicts, [PARAMETER]);
  assert.deepEqual(changed.preferences, mandate.preferences);
  assert.throws(() => resolveAuthoringProcessPreferences({ account: account(), courseDesign,
    mandate: { ...mandate, courseId: "20000000-0000-4000-8000-000000000002" } }));
});

test("valor automático já aplicado não se transforma em preferência fixa pessoal", () => {
  const courseDesign = courseDesignFixture(selection);
  const parameter = courseDesign.parameters.find(({ parameterId }) => parameterId === PARAMETER);
  parameter.effectiveAssignment = { mode: "automatic", value: 180, origin: "automatic", reason: "Calibração anterior.",
    sourceScope: { kind: "study_unit", ref: "unit" }, inherited: false };
  const resolved = resolveAuthoringProcessPreferences({ account: account(setPreference(defaultAuthoringProcessPreferences(), 240), 1), courseDesign });
  assert.deepEqual(resolved.preferences.parameters.find(({ parameterId }) => parameterId === PARAMETER), {
    parameterId: PARAMETER, mode: "automatic", value: null
  });
  assert.equal(resolved.courseConditions[0].assignment.value, 180);
});

test("confirmação vincula requestId, revisão e preferências efetivamente enviadas", () => {
  const preferences = defaultAuthoringProcessPreferences();
  const expected = { expectedRevision: 0, preferences, requestId: "process-save-1" };
  const receipt = { contract: AUTHORING_PROCESS_CHANGE_CONTRACT, revision: 1, preferences,
    requestId: expected.requestId, changed: true, idempotent: false, updatedAt: "2026-09-09T03:00:00Z" };
  assert.equal(normalizeAuthoringProcessPreferencesChange(receipt, expected).revision, 1);
  for (const changes of [{ revision: 2 }, { requestId: "other-save-1" }, { preferences: { ...preferences, focus: "content" } }]) {
    assert.throws(() => normalizeAuthoringProcessPreferencesChange({ ...receipt, ...changes }, expected));
  }
});
