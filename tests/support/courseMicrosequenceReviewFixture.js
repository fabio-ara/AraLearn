import { createCourseMicrosequenceReview } from "../../src/ui/CourseMicrosequenceReview.js";
import { microsequenceReviewExport, REVIEW_COURSE_ID as courseId, REVIEW_MS_ID as microsequenceId } from "../helpers/courseMicrosequenceReviewFixture.js";

export function mountMicrosequenceReviewFixture(root) {
  const cache = new Map();
  const probe = { calls: [], revision: 7, basis: "a".repeat(64), state: "draft", uncertain: false,
    explanationText: "Um socket é a interface local usada pelo processo.", sources: null, changes: [] };
  let pendingEdit = null;
  const controller = {
    store: { async getCache(key) { return structuredClone(cache.get(key) || null); }, async putCache(key, value) {
      if (value === null) cache.delete(key); else cache.set(key, structuredClone(value));
    } },
    async getMicrosequenceReview() { return { courseId, microsequenceId, basisHash: probe.basis, contentReview: { state: probe.state } }; },
    async exportCourseAuthoring() { return microsequenceReviewExport({ revision: probe.revision, explanationText: probe.explanationText }); },
    async loadAuthoringStudyUnits(_courseId, options) {
      const exported = microsequenceReviewExport({ revision: probe.revision, explanationText: probe.explanationText });
      const unit = exported.artifact.document.courses[0].modules[0].lessons[0].microsequences[0].studyUnits
        .find(value => value.id === options.anchorStudyUnitId);
      return { courseRevision: probe.revision, items: [{ studyUnit: unit, version: 2 }], offline: false, stale: false };
    },
    async approveMicrosequenceContent(request) {
      probe.calls.push({ kind: "approve", request: structuredClone(request) });
      if (probe.uncertain) throw Object.assign(new Error("Sem resposta do serviço"), { status: 504 });
      probe.state = "current"; probe.revision = 8;
      return { courseId, microsequenceId, basisHash: request.expectedBasisHash, courseRevision: probe.revision,
        contentReview: { state: "current" }, idempotent: probe.calls.filter(value => value.kind === "approve").length > 1 };
    },
    async loadPendingMicrosequenceExplanationEdit() { return structuredClone(pendingEdit); },
    async saveMicrosequenceExplanation(request) {
      pendingEdit = structuredClone(request); probe.calls.push({ kind: "save", request: structuredClone(request) });
      if (probe.uncertain) throw Object.assign(new Error("Sem resposta do serviço"), { status: 504 });
      pendingEdit = null; probe.explanationText = request.explanation.content[0].data.text;
      probe.revision++; probe.basis = "b".repeat(64); probe.state = "draft";
      return { courseId, revision: probe.revision, microsequenceVersion: 3, changed: true, idempotent: false };
    }
  };
  root.innerHTML = '<button type="button" id="open-review">Inspecionar Explicação</button>';
  const ui = createCourseMicrosequenceReview({ root, controller,
    onEditSources(target) { probe.sources = target; }, onChanged(revision) { probe.changes.push(revision); } });
  root.querySelector("button").addEventListener("click", event => void ui.open({ courseId, microsequenceId,
    expectedRevision: probe.revision, button: event.currentTarget }));
  globalThis.__reviewFixture = { probe, ui, controller };
  globalThis.__REVIEW_FIXTURE_READY__ = true;
}
