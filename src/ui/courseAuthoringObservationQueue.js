import { createUuid } from "../domain/identifiers.js";
import { normalizeCourseAnchoredAnnotationQuery, normalizeCourseAnchoredAnnotationReadOptions,
  normalizeCourseAnchoredAnnotationPage, normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationChange, courseObservationTargets, normalizeCourseObservationComparison } from "../domain/courseAnchoredAnnotations.js";
import { isAmbiguousManualStudyUnitWriteFailure } from "./manualStudyUnitEdit.js";

const copy = value => structuredClone(value);
export function isPendingAuthoringObservation(item) {
  return item?.provenance?.origin === "author" &&
    ["open", "considered"].includes(item.state);
}
export function authoringObservationQuery(targetKind = null, targetId = null) {
  return normalizeCourseAnchoredAnnotationQuery({ mode: targetKind ? "target" : "inbox", origins: ["author"],
    channels: [], states: ["open", "considered"], categories: [], includeUncategorized: true,
    subjectIds: [], hierarchy: targetKind ? { target: { kind: targetKind, id: targetId }, includeDescendants: false } : null, annotationId: null });
}
export function observationHasTarget(item, kind, id) {
  return courseObservationTargets(item).some(target => target.kind === kind && target.id === id);
}
export function filterAuthoringObservations(items, { target = "", category = "" } = {}) {
  return items.filter(item => (!category || (item.category || "none") === category) &&
    (!target || courseObservationTargets(item).some(t => `${t.kind}:${t.id}` === target)));
}
export function observationDecisionSelection(root) {
  const selection = {};
  for (const node of root.querySelectorAll("[data-observation-target-select]")) {
    selection[node.dataset.observationId] ||= [];
    if (node.checked && !node.disabled) selection[node.dataset.observationId].push(node.dataset.observationTargetKey);
  }
  return selection;
}
export async function loadObservationComparison(controller, courseId, item, targetKey) {
  const target = courseObservationTargets(item).find(value => `${value.kind}:${value.id}` === targetKey);
  if (!target || target.state !== "pending") throw new Error("Este alvo não está mais pendente.");
  const comparison = normalizeCourseObservationComparison(await controller.getCourseObservationComparison(courseId, {
    annotationId: item.annotationId, expectedAnnotationVersion: item.annotationVersion, expectedTargetSetVersion: item.targetSetVersion,
    targetKind: target.kind, targetId: target.id
  }));
  if (comparison.courseId !== courseId || comparison.annotationId !== item.annotationId || comparison.annotationVersion !== item.annotationVersion ||
    comparison.targetSetVersion !== item.targetSetVersion || comparison.target.kind !== target.kind || comparison.target.id !== target.id ||
    (comparison.basis?.hash || null) !== (target.basis?.hash || null)) throw new Error("A observação mudou. Atualize antes de comparar.");
  target.basis = comparison.basis; target.current = comparison.current; return target;
}
export function createObservationDecision(item, { decision = "approve", reason = null, targetKeys = null } = {}) {
  const targets = courseObservationTargets(item).filter(t => t.state === "pending" &&
    (!targetKeys || targetKeys.includes(`${t.kind}:${t.id}`)));
  return normalizeCourseAnchoredAnnotationCommand({ type: "decide_anchored_annotation", annotationId: item.annotationId,
    expectedAnnotationVersion: item.annotationVersion, expectedTargetSetVersion: item.targetSetVersion,
    decision, reason, targets: targets.map(t => ({ kind: t.kind, id: t.id, expectedBasisHash: t.current?.hash ?? null })) });
}
export function observationTargetCatalog(document, courseId) {
  const course = document?.courses?.find(c => c.id === courseId || c.courseId === courseId);
  const targets = [];
  for (const module of course?.modules || []) for (const lesson of module.lessons || []) {
    for (const micro of lesson.microsequences || []) {
      const context = [module.title, lesson.title, micro.title].filter(Boolean).join(" › ");
      targets.push({ kind: "microsequence_explanation", id: micro.id, label: `${context} · Explicação` });
      for (const unit of micro.studyUnits || []) targets.push({ kind: "study_unit", id: unit.id, label: `${context} › ${unit.title || unit.id}` });
    }
  }
  return targets;
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
    this.key = `course.v1.pending-authoring-observation:${courseId}:central`;
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
    const legacyKey = `course.v1.pending-authoring-observation:${this.courseId}:${this.targetKind}:${this.targetId}`;
    const current = await this.controller.store?.getCache(this.key);
    const saved = current || await this.controller.store?.getCache(legacyKey) || null;
    if (saved) {
      const command = normalizeCourseAnchoredAnnotationCommand(saved.command);
      if (saved.courseId !== this.courseId || !["create_anchored_annotation", "revise_anchored_annotation",
        "retarget_anchored_annotation", "decide_anchored_annotation"].includes(command.type)) {
        throw new TypeError("O envio pendente não pertence a esta fila.");
      }
      if (!current) {
        await this.controller.store?.putCache(this.key, saved);
        await this.controller.store?.putCache(legacyKey, null);
      }
    }
    this.pending = saved;
    return copy(saved);
  }
  async load() {
    const epoch = ++this.loadEpoch;
    const query = authoringObservationQuery();
    const items = []; const cursors = new Set(); const ids = new Set();
    let cursor = null; let annotationSetVersion = null;
    do {
      const page = await this.read(query, { cursor, annotationSetVersion });
      for (const item of page.items) {
        if (!isPendingAuthoringObservation(item) || ids.has(item.annotationId)) {
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
    if (!item && command.type === 'create_anchored_annotation') {
      const captured = Date.parse(command.capturedAt);
      if (!Number.isFinite(captured) || captured < Date.now() - 14 * 86400000) {
        throw Object.assign(new Error('O envio antigo já não tem confirmação recuperável. A tentativa deve ser encerrada antes de iniciar uma nova observação; seu texto continua no rascunho.'), {code: 'observation_recovery_expired'});
      }
    }
    if (!item || item.provenance.origin !== "author") return false;
    const exactVersion = command.type === "create_anchored_annotation" ? item.annotationVersion === 1
      : item.annotationVersion === command.expectedAnnotationVersion + 1;
    const sameText = ["create_anchored_annotation", "revise_anchored_annotation"].includes(command.type) &&
      item.rawText === command.rawText && item.category === command.category && item.briefSummary === command.briefSummary &&
      (command.type !== "create_anchored_annotation" || (command.targets || [command.target]).every(target =>
        observationHasTarget(item, target.kind, target.id)) && courseObservationTargets(item).length === (command.targets || [command.target]).length);
    const decisionMatches = command.type === "decide_anchored_annotation" && command.targets.every(selected =>
      courseObservationTargets(item).some(target => target.kind === selected.kind && target.id === selected.id &&
        target.state === (command.decision === "approve" ? "approved" : "cancelled")));
    const targetsMatch = command.type === "retarget_anchored_annotation" && command.targets.every(selected =>
      courseObservationTargets(item).some(t => t.state === "pending" && t.kind === selected.kind && t.id === selected.id)) &&
      courseObservationTargets(item).filter(t => t.state === "pending").length === command.targets.length &&
      item.targetSetVersion === command.expectedTargetSetVersion + 1;
    if (exactVersion && (sameText || decisionMatches || targetsMatch)) {
      await this.persistPending(null); return true;
    }
    return false;
  }
  async abandonExpiredAttempt() {
    try { await this.reconcilePending(); }
    catch (error) {
      if (error.code !== 'observation_recovery_expired') throw error;
      await this.persistPending(null); return true;
    }
    throw new Error('A tentativa ainda pode ser reconciliada. Retome o mesmo envio.');
  }
  async save({ rawText, category = null, editing = null, targets = null, command: suppliedCommand = null } = {}) {
    if (this.busy) throw new Error("Aguarde a confirmação da observação em envio.");
    this.busy = true;
    let writeStarted = false;
    try {
      if (this.pending) {
        if (await this.reconcilePending()) return { reconciled: true };
      } else {
        if (editing && (!isPendingAuthoringObservation(editing) || !editing.capabilities.canRevise)) throw new Error("Esta observação não está disponível para edição.");
        const command = normalizeCourseAnchoredAnnotationCommand(suppliedCommand || (editing ? {
          type: "revise_anchored_annotation", annotationId: editing.annotationId,
          expectedAnnotationVersion: editing.annotationVersion, rawText, category, briefSummary: editing.briefSummary
        } : { type: "create_anchored_annotation", annotationId: this.uuid(), target: targets?.[0] || { kind: this.targetKind, id: this.targetId },
          ...(targets ? { targets } : {}), rawText, category, briefSummary: null, capturedAt: new Date().toISOString() }));
        await this.persistPending({ requestId: this.uuid(), courseId: this.courseId,
          expectedCourseRevision: ["create_anchored_annotation", "retarget_anchored_annotation"].includes(command.type) ? this.expectedRevision : null, command });
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
  async decide(items, options = {}) {
    // Resolve the complete selection before the first write. Each transaction
    // and any uncertain retry retain that exact intent/version/basis.
    const commands = items.map(item => createObservationDecision(item, { ...options,
      targetKeys: options.targetKeysByAnnotation?.[item.annotationId] ?? options.targetKeys ?? null }));
    const key = `${this.key}:decisions`;
    let batch = await this.controller.store?.getCache(key);
    if (batch && JSON.stringify(batch.commands) !== JSON.stringify(commands)) {
      throw new Error("Retome a decisão pendente antes de escolher outro conjunto.");
    }
    batch ||= { commands, requests: commands.map(command => ({ requestId: this.uuid(), courseId: this.courseId,
      expectedCourseRevision: null, command })), completed: [] };
    await this.controller.store?.putCache(key, batch);
    const results = [];
    for (const request of batch.requests) {
      if (batch.completed.includes(request.requestId)) continue;
      if (this.pending && this.pending.requestId !== request.requestId) throw new Error("Confirme primeiro o envio pendente.");
      await this.persistPending(request);
      results.push(await this.save());
      batch.completed.push(request.requestId); await this.controller.store?.putCache(key, batch);
    }
    await this.controller.store?.putCache(key, null);
    await this.load();
    return results;
  }
  async resumeDecisions() {
    const batch = await this.controller.store?.getCache(`${this.key}:decisions`);
    if (!batch) return this.pending ? this.save() : false;
    for (const request of batch.requests) {
      const command = normalizeCourseAnchoredAnnotationCommand(request.command);
      if (request.courseId !== this.courseId || command.type !== "decide_anchored_annotation") throw new TypeError("Decisão pendente inválida.");
    }
    for (const request of batch.requests) {
      if (batch.completed.includes(request.requestId)) continue;
      await this.persistPending(request); await this.save(); batch.completed.push(request.requestId);
      await this.controller.store?.putCache(`${this.key}:decisions`, batch);
    }
    await this.controller.store?.putCache(`${this.key}:decisions`, null); await this.load(); return true;
  }
}
