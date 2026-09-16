import { createCourseMicrosequenceReview } from "../../src/ui/CourseMicrosequenceReview.js";
import { createCourseInspectionSequence } from "../../src/ui/CourseInspectionSequence.js";
import { microsequenceReviewExport, REVIEW_COURSE_ID as courseId, REVIEW_MS_ID as microsequenceId } from "../helpers/courseMicrosequenceReviewFixture.js";

export function mountMicrosequenceReviewFixture(root) {
  const cache = new Map();
  const probe = { calls: [], revision: 7, basis: "a".repeat(64), reviews: {}, uncertain: false,
    explanationText: "Um socket é a interface local usada pelo processo.", sources: null, changes: [],
    observations: [], observationWrites: [], observationLostResponse: false, delayObservationRead: false, finishObservationRead: null, withUnits: true,
    withPdf: false, pdfReads: [], openedSources: [] };
  const observationReceipts = new Map();
  let pendingEdit = null;
  const controller = {
    store: { async getCache(key) { return structuredClone(cache.get(key) || null); }, async putCache(key, value) {
      if (value === null) cache.delete(key); else cache.set(key, structuredClone(value));
    } },
    async getCourseObservationComparison(_courseId, request) {
      const item = probe.observations.find(value => value.annotationId === request.annotationId);
      if (item.annotationVersion !== request.expectedAnnotationVersion || item.targetSetVersion !== request.expectedTargetSetVersion) throw Object.assign(new Error('A observação mudou.'), {status: 409});
      const target = item.targets.find(value => value.kind === request.targetKind && value.id === request.targetId);
      return {contract: 'aralearn.course-observation-comparison.v1', courseId, courseRevision: probe.revision, annotationId: item.annotationId,
        annotationVersion: item.annotationVersion, targetSetVersion: item.targetSetVersion, target: {kind: target.kind, id: target.id}, basis: structuredClone(target.basis), current: structuredClone(target.current)};
    },
    async loadCourseAnchoredAnnotations(_courseId, options) {
      const items = structuredClone(probe.observations.filter(item => options.query.mode === "detail"
        ? item.annotationId === options.query.annotationId
        : (!options.query.hierarchy || item.target.kind === options.query.hierarchy.target.kind && item.target.id === options.query.hierarchy.target.id) && ["open", "considered"].includes(item.state)));
      if (probe.delayObservationRead) await new Promise(resolve => { probe.finishObservationRead = resolve; });
      for (const item of items) for (const target of item.targets || []) {
        if (target.basis) target.basis = {hash: target.basis.hash, deferred: true};
        if (target.current) target.current = {hash: target.current.hash, deferred: true};
      }
      return { contract: "aralearn.course-anchored-annotation-page.v1", courseId, courseRevision: probe.revision,
        annotationSetVersion: probe.observations.length, query: options.query,
        summary: { matchingTotal: items.length, byOrigin: { author: items.length }, byChannel: { authoring_interface: items.length },
          byState: { open: items.length }, unclassifiedTotal: items.length }, items, hasMore: false, nextCursor: null };
    },
    async mutateCourseAnchoredAnnotations(request) {
      probe.observationWrites.push(structuredClone(request));
      if (observationReceipts.has(request.requestId)) return structuredClone(observationReceipts.get(request.requestId));
      const command = request.command; const previous = probe.observations.find(item => item.annotationId === command.annotationId);
      if (previous && previous.annotationVersion !== command.expectedAnnotationVersion) throw Object.assign(new Error("A observação mudou."), { status: 409 });
      const target = command.target || previous.target;
      const path = [{ kind: "course", id: courseId, label: "Curso", version: probe.revision },
        { kind: target.kind, id: target.id, label: "Objeto", version: 2 }];
      const classification = { method: "target_scope_unclassified", methodVersion: 1, taxonomyRevision: probe.revision, subjects: [] };
      const timestamp = "2026-09-09T04:00:00.000Z";
      const item = { contract: "aralearn.course-anchored-annotation.v1", courseId,
        annotationId: command.annotationId, annotationVersion: previous ? previous.annotationVersion + 1 : 1,
        provenance: { origin: "author", channel: "authoring_interface" }, contributor: { kind: "self", role: "author", ref: "self", label: "Você" },
        target: { kind: target.kind, id: target.id, observedPath: path, currentAvailable: true, currentPath: path,
          deepLink: `#/authoring/courses/${courseId}?section=content` },
        observedRevision: { certainty: "known", courseRevision: probe.revision, targetVersion: 2 }, rawText: command.rawText ?? previous?.rawText,
        category: command.category ?? previous?.category ?? null, briefSummary: command.briefSummary ?? previous?.briefSummary ?? null, state: "open", ownerResponse: null,
        subjectClassification: { status: "unclassified", automatic: classification, effective: classification, correctedAt: null },
        timestamps: { capturedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, firstConsideredAt: null,
          respondedAt: null, resolvedAt: null, withdrawnAt: null },
        capabilities: { canRevise: true, canWithdraw: false, canConsider: true, canRespond: true,
          canResolve: false, canReopen: false, canCorrectSubjects: true },
        deepLink: `#/authoring/courses/${courseId}?section=review&annotationId=${command.annotationId}` };
      item.targetSetVersion = previous?.targetSetVersion || 1;
      item.targets = structuredClone(previous?.targets || (command.targets || [target]).map(value => {
        const content = value.kind === 'microsequence_explanation' ? { text: probe.explanationText } : { title: 'Interface local' };
        const snapshot = { hash: probe.basis, content, sourceLinks: [], sources: [] };
        return { ...value, state: 'pending', path: [{ kind: value.kind, id: value.id, label: value.kind === 'microsequence_explanation' ? 'Interfaces' : 'Interface local', version: 2 }], basis: snapshot, current: structuredClone(snapshot) };
      }));
      if (command.type === 'decide_anchored_annotation') {
        for (const selected of command.targets) {
          const incidence = item.targets.find(value => value.kind === selected.kind && value.id === selected.id);
          if (selected.expectedBasisHash !== incidence.current.hash) throw Object.assign(new Error('A base mudou.'), { status: 409 });
          incidence.state = command.decision === 'approve' ? 'approved' : 'cancelled'; incidence.basis = null; incidence.current = null;
        }
        if (item.targets.every(value => value.state !== 'pending')) {
          item.state = 'resolved'; item.rawText = null; item.timestamps.resolvedAt = timestamp;
          for (const key of Object.keys(item.capabilities)) item.capabilities[key] = false;
        }
      }
      if (previous) probe.observations.splice(probe.observations.indexOf(previous), 1, item); else probe.observations.push(item);
      const receipt = { contract: "aralearn.course-anchored-annotation-change.v1", courseId, courseRevision: probe.revision,
        annotationSetVersion: probe.observations.length, requestId: request.requestId, changed: true, idempotent: false, annotation: item };
      observationReceipts.set(request.requestId, receipt);
      if (probe.observationLostResponse) throw Object.assign(new Error("Resposta perdida"), { status: 504 });
      return structuredClone(receipt);
    },
    async getContentReview(_courseId, targetKind, targetId) { return { contract: "aralearn.course-content-review.v1", courseId,
      targetKind, targetId, courseRevision: probe.revision, entityVersion: 2, reviewPolicy: "saved", basisHash: probe.basis,
      contentReview: probe.reviews[`${targetKind}:${targetId}`] || { state: "draft" } }; },
    async exportCourseAuthoring() { return microsequenceReviewExport({ revision: probe.revision, explanationText: probe.explanationText, withUnits: probe.withUnits, withPdf: probe.withPdf }); },
    async getCourseSourceAttachmentDownload(request) {
      probe.pdfReads.push(structuredClone(request));
      return { signedUrl: `https://example.test/author-source.pdf?token=synthetic-${probe.pdfReads.length}` };
    },
    async loadAuthoringInspectionPosition() { return null; },
    async saveAuthoringInspectionPosition() {},
    async loadCourseDocument() { return { document: (await controller.exportCourseAuthoring()).artifact.document }; },
    async loadAuthoringStudyUnits(_courseId, options) {
      if (!probe.withUnits && options.scope) return {
        contract: "aralearn.course-study-unit-inspection-page.v2", courseId, courseRevision: probe.revision,
        scope: options.scope, totalCount: 0, scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 0 }, items: [],
        hasPrevious: false, hasMore: false, previousCursor: null, nextCursor: null, pageBytes: 512,
        offline: false, stale: false, offlineKnown: false, readFailure: null
      };
      const exported = microsequenceReviewExport({ revision: probe.revision, explanationText: probe.explanationText });
      const unit = exported.artifact.document.courses[0].modules[0].lessons[0].microsequences[0].studyUnits
        .find(value => value.id === options.anchorStudyUnitId);
      return { courseRevision: probe.revision, items: [{ studyUnit: unit, version: 2 }], offline: false, stale: false };
    },
    async setContentReview(request) {
      probe.calls.push({ kind: "review", request: structuredClone(request) });
      if (probe.uncertain) throw Object.assign(new Error("Sem resposta do serviço"), { status: 504 });
      probe.reviews[`${request.targetKind}:${request.targetId}`] = request.reviewed
        ? { state: "current", reviewedAt: "2026-09-09T12:00:00Z" } : { state: "draft" };
      probe.revision++;
      return { ...await controller.getContentReview(courseId, request.targetKind, request.targetId),
        contract: "aralearn.course-content-review-change.v1", changed: true,
        idempotent: probe.calls.filter(value => value.request.requestId === request.requestId).length > 1 };
    },
    async loadPendingMicrosequenceExplanationEdit() { return structuredClone(pendingEdit); },
    async saveMicrosequenceExplanation(request) {
      pendingEdit = structuredClone(request); probe.calls.push({ kind: "save", request: structuredClone(request) });
      if (probe.uncertain) throw Object.assign(new Error("Sem resposta do serviço"), { status: 504 });
      pendingEdit = null; probe.explanationText = request.explanation.content[0].data.text;
      probe.revision++; probe.basis = "b".repeat(64);
      for (const [key, review] of Object.entries(probe.reviews)) if (review.state === "current") probe.reviews[key] = { ...review, state: "stale" };
      return { courseId, revision: probe.revision, microsequenceVersion: 3, changed: true, idempotent: false };
    }
  };
  root.innerHTML = '<button type="button" id="open-review">Inspecionar Explicação</button><button type="button" id="open-unit-review">Revisar unidade</button>' +
    '<button type="button" id="open-empty-inspection">Conteúdo sem unidades</button><div id="inspection-root"></div>';
  const ui = createCourseMicrosequenceReview({ root, controller,
    openSourceUrl(url) { probe.openedSources.push(url); },
    onEditSources(target) { probe.sources = target; }, onChanged(revision) { probe.changes.push(revision); } });
  root.querySelector("button").addEventListener("click", event => void ui.open({ courseId, microsequenceId,
    expectedRevision: probe.revision, button: event.currentTarget }));
  root.querySelector("#open-unit-review").addEventListener("click", event => void ui.open({ courseId, microsequenceId,
    targetKind: "study_unit", targetId: "unit-theory", expectedRevision: probe.revision, button: event.currentTarget }));
  root.querySelector("#open-empty-inspection").addEventListener("click", () => {
    probe.withUnits = false;
    const inspection = createCourseInspectionSequence({ root: root.querySelector("#inspection-root"), controller,
      course: { courseId, revision: probe.revision, ownership: "owned", canEdit: true },
      routeTarget: { kind: "didactic_microsequence", id: microsequenceId } });
    void inspection.open();
  });
  globalThis.__reviewFixture = { probe, ui, controller };
  globalThis.__REVIEW_FIXTURE_READY__ = true;
}
