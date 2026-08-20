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
  const calls = []; const openedCourses = []; let detached = false;
  const controller = {
    async listCourseVariantComparisons(courseId, revision) {
      calls.push(["list", courseId, revision]);
      return {
        contract: "aralearn.course-variant-comparison-list.v1",
        sourceCourseId: COURSE_ID, sourceCourseRevision: 4,
        items: [{ comparisonSetId: SET_ID, checkpointId: "30000000-0000-4000-8000-000000000003", checkpointHash: "a".repeat(64), checkpointCourseRevision: 4, memberCount: 2, attachedCount: detached ? 0 : 2, detachedCount: detached ? 2 : 0, createdAt: "2026-08-18T12:00:00Z", updatedAt: "2026-08-18T12:00:00Z" }]
      };
    },
    async loadCourseVariantComparison(courseId, options) {
      calls.push(["open", courseId, options.comparisonSetId, options.expectedCourseRevision]);
      return {
        contract: "aralearn.course-variant-comparison.v1", comparisonSetId: SET_ID,
        planning: {
          checkpointId: "30000000-0000-4000-8000-000000000003",
          checkpointHash: "a".repeat(64), courseRevision: 4, planVersion: 2,
          snapshot: { plan: { objective: "Planejamento comum verificável", audience: "Pesquisadores" } }
        },
        source: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", currentCourseRevision: 4, checkpointCourseRevision: 4, changedSinceCheckpoint: false, checkpointId: "30000000-0000-4000-8000-000000000003", checkpointHash: "a".repeat(64) },
        members: [{
          courseId: "40000000-0000-4000-8000-000000000004", position: 0, label: "Z", title: "Z", goal: "Objetivo",
          attachedCourseRevision: 1, currentCourseRevision: 1, changedSinceAttached: false,
          parameterDifferences: [], componentPolicyDifference: null,
          effectiveParameters: [{
            scopeKind: "course", scopeId: "course",
            parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
            value: 2, origin: "system_default", sourceScope: null
          }],
          effectiveComponentPolicies: [{
            scopeKind: "course", scopeId: "course",
            policy: { catalogVersion: "1", availability: "all", allowedRefs: [], excludedRefs: [], preferredRefs: [] },
            origin: "system_default", sourceScope: null
          }],
          componentsUsed: [],
          references: { sourceCount: 1, anchorCount: 1, pdfCount: 1, sharedPdfCount: 1, fingerprint: "d".repeat(64) },
          materialization: {
            plannedPartCount: 1, notStartedPartCount: 1, runningPartCount: 0,
            completedPartCount: 0, failedPartCount: 0, studyUnitCount: 0,
            latestUpdatedAt: null, partFingerprint: "b".repeat(64),
            studyUnitFingerprint: "c".repeat(64),
            parts: [{
              partId: "50000000-0000-4000-8000-000000000005", position: 0,
              title: "Parte comum", intent: "Materializar separadamente.", version: 1,
              status: "not_started", materializationId: null,
              materializationVersion: null, updatedAt: null, studyUnitCount: 0
            }],
            studyUnits: [], truncated: { parts: false, studyUnits: false }
          }
        }, {
          courseId: "41000000-0000-4000-8000-000000000005", position: 1,
          label: "A", title: "A", goal: "Objetivo",
          attachedCourseRevision: 1, currentCourseRevision: 1,
          changedSinceAttached: false, parameterDifferences: [],
          componentPolicyDifference: null, effectiveParameters: [],
          effectiveComponentPolicies: [], componentsUsed: [],
          references: { sourceCount: 0, anchorCount: 0, pdfCount: 0, sharedPdfCount: 0, fingerprint: "e".repeat(64) },
          materialization: {
            plannedPartCount: 0, notStartedPartCount: 0, runningPartCount: 0,
            completedPartCount: 0, failedPartCount: 0, studyUnitCount: 0,
            latestUpdatedAt: null, partFingerprint: "f".repeat(64),
            studyUnitFingerprint: "1".repeat(64), parts: [], studyUnits: [],
            truncated: { parts: false, studyUnits: false }
          }
        }],
        differences: {
          referenceCourseId: "40000000-0000-4000-8000-000000000004",
          declared: [], observedExpected: [], accidentalDeviations: [], factual: [],
          missingData: [{
            courseId: "40000000-0000-4000-8000-000000000004",
            referenceCourseId: null, kind: "materialization", scopeKind: null,
            scopeId: null, key: "materialization", expectedValue: null,
            actualValue: null,
            explanation: "A materialização independente ainda não foi iniciada."
          }]
        }
      };
    },
    async mutateCourseVariants({ command }) {
      calls.push(["detach", command.comparisonSetId, command.courseId]);
      detached = true;
      return { changed: true };
    }
  };
  const root = new Root();
  const panel = createCourseVariantsPanel({ root, controller, course: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", revision: 4 }, onOpenCourse: (courseId) => openedCourses.push(courseId), confirmValue: () => true });
  await panel.open();
  assert.match(root.innerHTML, /Planejamento compartilhado/u);
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "open", setId: SET_ID } }) } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [["list", COURSE_ID, 4], ["open", COURSE_ID, SET_ID, 4]]);
  assert.match(root.innerHTML, /Comparação/u);
  assert.match(root.innerHTML, /Referência · Z: Z/u);
  assert.match(root.innerHTML, /Planejamento comum verificável/u);
  assert.match(root.innerHTML, /1 não iniciada/u);
  assert.match(root.innerHTML, /Parte comum<\/strong> · versão 1/u);
  assert.match(root.innerHTML, /1 PDF compartilhado sem duplicar o arquivo/u);
  assert.doesNotMatch(root.innerHTML, /0\/1 Partes/u);
  assert.match(root.innerHTML, /Dados ausentes ou incompletos/u);
  assert.match(root.innerHTML, /Abrir origem/u);
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "visit", courseId: "40000000-0000-4000-8000-000000000004" } }) } });
  assert.deepEqual(openedCourses, ["40000000-0000-4000-8000-000000000004"]);
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "detach", courseId: "40000000-0000-4000-8000-000000000004" } }) } });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(-2), [
    ["detach", SET_ID, "40000000-0000-4000-8000-000000000004"],
    ["list", COURSE_ID, 4]
  ]);
  assert.match(root.innerHTML, /exige duas variantes ativas/u);
  assert.doesNotMatch(root.innerHTML, />Comparar</u);
  assert.equal(calls.filter(([operation]) => operation === "open").length, 1);
  panel.destroy();
});

test("painel reutiliza o catálogo real ao oferecer restrição de componentes", async () => {
  const root = new Root();
  const controller = {
    async listCourseVariantComparisons() {
      return { contract: "aralearn.course-variant-comparison-list.v1", sourceCourseId: COURSE_ID, sourceCourseRevision: 4, items: [] };
    },
    async loadCourseDesign() {
      return { componentCatalog: { version: "1-3e5629f8", options: [{ ref: "aralearn.resource.text@1.0.0", label: "Texto", purpose: "Apresenta conteúdo." }] } };
    }
  };
  const panel = createCourseVariantsPanel({ root, controller, course: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", revision: 4 } });
  await panel.open();
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "create" } }) } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(root.innerHTML, /Restringir aos componentes selecionados/u);
  assert.match(root.innerHTML, /aralearn\.resource\.text@1\.0\.0/u);
  panel.destroy();
});
