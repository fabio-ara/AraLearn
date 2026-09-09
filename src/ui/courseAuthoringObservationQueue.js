import { createUuid } from "../domain/identifiers.js";
import { normalizeCourseAnchoredAnnotationQuery, normalizeCourseAnchoredAnnotationReadOptions,
  normalizeCourseAnchoredAnnotationPage, normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationChange } from "../domain/courseAnchoredAnnotations.js";
import { isAmbiguousManualStudyUnitWriteFailure } from "./manualStudyUnitEdit.js";

const copy = value => structuredClone(value);
export function isPendingAuthoringObservation(item) {
  return item?.provenance?.origin === "author" &&
    ["microsequence_explanation", "study_unit"].includes(item.target?.kind) &&
    ["open", "considered"].includes(item.state);
}
export function authoringObservationQuery(targetKind, targetId) {
  return normalizeCourseAnchoredAnnotationQuery({ mode: "target", origins: ["author"],
    channels: [], states: ["open", "considered"], categories: [], includeUncategorized: true,
    subjectIds: [], hierarchy: { target: { kind: targetKind, id: targetId }, includeDescendants: false }, annotationId: null });
}
export function orderAuthoringObservations(items) {
  return [...items].sort((a, b) => a.timestamps.createdAt.localeCompare(b.timestamps.createdAt) ||
    a.annotationId.localeCompare(b.annotationId));
}

/** As annotations persistem a fila; o cache conserva a identidade da escrita incerta. */
export class CourseAuthoringObservationQueue {
  constructor({ controller, courseId, targetKind, targetId, expectedRevision, uuid = createUuid }) {
    if (!["microsequence_explanation", "study_unit"].includes(targetKind)) throw new TypeError("Objeto de observação inválido.");
    Object.assign(this, { controller, courseId, targetKind, targetId, expectedRevision, uuid });
    this.items = []; this.total = null; this.pending = null; this.busy = false; this.loadEpoch = 0;
    this.key = `course.v1.pending-authoring-observation:${courseId}:${targetKind}:${targetId}`;
  }
  async read(query, { cursor = null, annotationSetVersion = null, limit = 24, expectedCourseRevision = this.expectedRevision } = {}) {
    const options = normalizeCourseAnchoredAnnotationReadOptions({ expectedCourseRevision, annotationSetVersion, query, cursor, limit });
    const page = normalizeCourseAnchoredAnnotationPage(await this.controller.loadCourseAnchoredAnnotations(this.courseId, options));
    if (page.courseId !== this.courseId || JSON.stringify(page.query) !== JSON.stringify(options.query) ||
        expectedCourseRevision !== null && page.courseRevision !== expectedCourseRevision ||
        annotationSetVersion !== null && page.annotationSetVersion !== annotationSetVersion) {
      throw new Error("A fila retornada não corresponde a este objeto e à versão consultada.");
    }
    return page;
  }
  async restorePending() {
    const saved = await this.controller.store?.getCache(this.key) || null;
    if (saved) {
      const command = normalizeCourseAnchoredAnnotationCommand(saved.command);
      if (saved.courseId !== this.courseId || !["create_anchored_annotation", "revise_anchored_annotation"].includes(command.type) ||
          command.type === "create_anchored_annotation" &&
            (command.target.kind !== this.targetKind || command.target.id !== this.targetId)) {
        throw new TypeError("O envio pendente não pertence a esta fila.");
      }
    }
    this.pending = saved;
    return copy(saved);
  }
  async load() {
    const epoch = ++this.loadEpoch;
    const query = authoringObservationQuery(this.targetKind, this.targetId);
    const items = []; const cursors = new Set(); const ids = new Set();
    let cursor = null; let annotationSetVersion = null;
    do {
      const page = await this.read(query, { cursor, annotationSetVersion });
      for (const item of page.items) {
        if (!isPendingAuthoringObservation(item) || item.target.kind !== this.targetKind || item.target.id !== this.targetId || ids.has(item.annotationId)) {
          throw new Error("A fila contém uma observação fora do objeto ou repetida.");
        }
        ids.add(item.annotationId); items.push(item);
      }
      if (page.hasMore && (!page.items.length || cursors.has(page.nextCursor))) throw new Error("A paginação da fila não avançou.");
      annotationSetVersion = page.annotationSetVersion;
      cursor = page.hasMore ? page.nextCursor : null; cursors.add(cursor);
      if (!cursor) {
        if (items.length !== page.summary.matchingTotal) throw new Error("A fila está incompleta; atualize antes de editar.");
        const ordered = orderAuthoringObservations(items);
        if (epoch === this.loadEpoch) { this.items = ordered; this.total = items.length; }
        return copy(ordered);
      }
    } while (cursor);
  }
  async persistPending(value) {
    await this.controller.store?.putCache(this.key, value);
    this.pending = copy(value);
  }
  async reconcilePending() {
    if (!this.pending) return false;
    const command = this.pending.command;
    const query = normalizeCourseAnchoredAnnotationQuery({ mode: "detail", origins: [], channels: [], states: [],
      categories: [], includeUncategorized: true, subjectIds: [], hierarchy: null, annotationId: command.annotationId });
    const page = await this.read(query, { limit: 1 });
    const item = page.items.find(value => value.annotationId === command.annotationId);
    if (!item || item.target.kind !== this.targetKind || item.target.id !== this.targetId || item.provenance.origin !== "author") return false;
    const exactVersion = command.type === "create_anchored_annotation" ? item.annotationVersion === 1
      : item.annotationVersion === command.expectedAnnotationVersion + 1;
    if (exactVersion && item.rawText === command.rawText && item.category === command.category && item.briefSummary === command.briefSummary) {
      await this.persistPending(null); return true;
    }
    return false;
  }
  async save({ rawText, category = null, editing = null } = {}) {
    if (this.busy) throw new Error("Aguarde a confirmação da observação em envio.");
    this.busy = true;
    let writeStarted = false;
    try {
      if (this.pending) {
        if (await this.reconcilePending()) return { reconciled: true };
      } else {
        if (editing && (!isPendingAuthoringObservation(editing) || editing.target.kind !== this.targetKind ||
            editing.target.id !== this.targetId || !editing.capabilities.canRevise)) throw new Error("Esta observação não está disponível para edição.");
        const command = normalizeCourseAnchoredAnnotationCommand(editing ? {
          type: "revise_anchored_annotation", annotationId: editing.annotationId,
          expectedAnnotationVersion: editing.annotationVersion, rawText, category, briefSummary: editing.briefSummary
        } : { type: "create_anchored_annotation", annotationId: this.uuid(), target: { kind: this.targetKind, id: this.targetId },
          rawText, category, briefSummary: null, capturedAt: new Date().toISOString() });
        await this.persistPending({ requestId: this.uuid(), courseId: this.courseId,
          expectedCourseRevision: editing ? null : this.expectedRevision, command });
      }
      const request = copy(this.pending);
      let receipt;
      try {
        writeStarted = true;
        receipt = normalizeCourseAnchoredAnnotationChange(await this.controller.mutateCourseAnchoredAnnotations(request));
        if (receipt.courseId !== this.courseId || receipt.requestId !== request.requestId ||
            receipt.annotation && receipt.annotation.annotationId !== request.command.annotationId) {
          throw Object.assign(new Error("Confirmação de outro envio."), { ambiguous: true });
        }
      } catch (error) {
        if (error instanceof TypeError || error?.code === "invalid_course_anchored_annotation_change") error.ambiguous = true;
        throw error;
      }
      await this.persistPending(null);
      return { receipt };
    } catch (error) {
      if (writeStarted && !isAmbiguousManualStudyUnitWriteFailure(error)) await this.persistPending(null);
      throw error;
    } finally { this.busy = false; }
  }
}
