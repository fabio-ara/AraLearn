import { AuthoringApiError } from "./errors.js";
import {
  executeTrustedCourseWrite,
  resolveHumanCourseContext
} from "./courseHumanTaskExecutor.js";
import { resolveHumanSourceLinks } from "./courseHumanMaterialization.js";
import { validateCourseEntityContent } from
  "../aralearn/runtime/domain/courseEntities.js";
import { normalizeMicrosequenceExplanation } from "../aralearn/runtime/domain/courseExplanation.js";
import { canonicalAuthoringValue } from "../aralearn/runtime/domain/courseAuthoringBasis.js";
import { normalizeCourseObservationCorrectionReferences, normalizeCourseObservationCorrection } from
  "../aralearn/runtime/domain/courseAnchoredAnnotations.js";

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(code, message, status = 422) {
  throw new AuthoringApiError(status, code, message);
}

function validateCorrections(corrections, explanations) {
  if (!Array.isArray(corrections) || corrections.length > 64 ||
      !Array.isArray(explanations) || explanations.length > 64 ||
      corrections.length + explanations.length < 1 || corrections.length + explanations.length > 64) {
    fail("invalid_human_corrections", "Informe de 1 a 64 correções focais.");
  }
  for (const [index, correction] of corrections.entries()) {
    if (!plainObject(correction) || !Object.hasOwn(correction, "unidade") ||
        !plainObject(correction.conteudo) ||
        correction.fontes != null && !Array.isArray(correction.fontes)) {
      fail("invalid_human_corrections", `A correção ${index + 1} é inválida.`);
    }
  }
  for (const explanation of explanations) {
    if (!plainObject(explanation) || !Object.hasOwn(explanation, "microssequencia") ||
        Object.keys(explanation).some((key) => !["microssequencia", "conteudo", "fontes"].includes(key)) ||
        explanation.fontes !== undefined && !Array.isArray(explanation.fontes)) {
      fail("invalid_human_explanation", "A correção da Explicação precisa indicar microssequência, conteúdo e fontes pertinentes.");
    }
    try { normalizeMicrosequenceExplanation(explanation.conteudo); }
    catch (error) { fail("invalid_human_explanation", error.message); }
    if ((explanation.fontes ?? []).some((link) => !plainObject(link) ||
      link.ocorrencias !== undefined && (!Array.isArray(link.ocorrencias) ||
        link.ocorrencias.some((occurrence) => !plainObject(occurrence) || occurrence.lugar !== "conteudo")))) {
      fail("invalid_human_explanation", "A ocorrência da Explicação pertence somente ao conteúdo do apoio.");
    }
  }
}

async function loadExplanationCorrections({ adapter, principal, course, explanations, deadlineAt }) {
  if (!explanations.length) return [];
  const entities = [];
  let cursor = null;
  for (let page = 0; page < 100; page += 1) {
    const result = await adapter.listCourseEntities({ principal, courseId: course.id,
      expectedRevision: course.revision, limit: 200, afterEntityType: cursor?.entityType ?? null,
      afterEntityId: cursor?.entityId ?? null, deadlineAt });
    if (!result || !Array.isArray(result.items)) fail("course_service_unavailable", "A leitura da Explicação está incompleta; releia o recorte.", 503);
    entities.push(...result.items);
    if (!result.hasMore) break;
    if (!result.nextCursor || page === 99) fail("course_service_unavailable", "A leitura da Explicação está incompleta; releia o recorte.", 503);
    cursor = result.nextCursor;
  }
  const seen = new Set();
  return await Promise.all(explanations.map(async (entry) => {
    const context = await resolveHumanCourseContext({ adapter, principal, course: course.title,
      microsequence: entry.microssequencia, deadlineAt });
    const entity = entities.find((row) => row.entityType === "microsequence" && row.entityId === context.microsequence.id);
    if (context.course.revision !== course.revision || !entity) fail("course_revision_conflict", "O curso mudou; releia a Explicação antes de corrigir.", 409);
    if (seen.has(entity.entityId)) fail("invalid_human_explanation", "Uma correção não pode repetir a mesma Explicação.");
    seen.add(entity.entityId);
    const support = normalizeMicrosequenceExplanation(entry.conteudo);
    const content = { ...structuredClone(entity.content), explanation: support };
    const page = await adapter.getCourseSources({ principal, courseId: course.id, expectedRevision: course.revision,
      mode: "target", sourceId: null, targetKind: "microsequence_explanation", targetId: entity.entityId,
      cursor: null, limit: 1, deadlineAt });
    const currentLinks = page.items?.[0]?.sourceLinks ?? [];
    return { entity, content, support, currentLinks,
      sourceLinks: entry.fontes === undefined ? currentLinks : null, requestedSources: entry.fontes };
  }));
}

function microsequenceId(item) {
  const id = item?.curriculumPath?.didacticMicrosequence?.id ??
    item?.didacticMicrosequenceId ?? item?.microsequenceId;
  if (typeof id !== "string" || !id) {
    fail("course_service_unavailable", "A unidade de estudo não informa sua microssequência.", 503);
  }
  return id;
}

async function currentSourceLinks({ adapter, principal, course, unit, deadlineAt }) {
  const page = await adapter.getCourseSources({
    principal,
    courseId: course.id,
    expectedRevision: course.revision,
    mode: "target",
    sourceId: null,
    targetKind: "study_unit",
    targetId: unit.studyUnit.id,
    cursor: null,
    limit: 1,
    deadlineAt
  });
  const current = Array.isArray(page?.items) && page.items.length === 1
    ? page.items[0]
    : null;
  return Array.isArray(current?.sourceLinks) ? structuredClone(current.sourceLinks) : [];
}

async function loadCorrectionState({
  adapter,
  principal,
  course,
  corrections,
  explanations,
  observations,
  deadlineAt
}) {
  const resolved = await resolveHumanCourseContext({
    adapter,
    principal,
    course,
    studyUnits: corrections.map(({ unidade }) => unidade),
    deadlineAt
  });
  const prepared = await Promise.all(corrections.map(async (correction, index) => {
    const unit = resolved.studyUnits[index];
    const currentLinks = await currentSourceLinks({
      adapter,
      principal,
      course: resolved.course,
      unit,
      deadlineAt
    });
    const sourceLinks = correction.fontes === undefined ? currentLinks : null;
    const candidate = {
      ...correction.conteudo,
      id: unit.studyUnit.id,
      position: unit.studyUnit.position
    };
    const validation = validateCourseEntityContent("study_unit", candidate);
    if (!validation.valid) {
      fail(
        "invalid_human_study_unit",
        `A correção da unidade de estudo ${index + 1} é inválida: ${validation.errors.join(" ")}`
      );
    }
    const currentRole = unit.studyUnit?.role;
    if (!new Set(["theory", "practice"]).has(currentRole)) {
      fail(
        "course_service_unavailable",
        "A unidade de estudo não informa sua função instrucional corrente.",
        503
      );
    }
    if (validation.normalized.role !== currentRole) {
      fail(
        "invalid_human_study_unit",
        "Uma correção focal não pode mudar a função instrucional da unidade de estudo; " +
          "rematerialize a parte para redistribuir teoria e prática."
      );
    }
    const content = structuredClone(validation.normalized);
    delete content.id;
    delete content.position;
    return { unit, content, currentLinks, sourceLinks, requestedSources: correction.fontes };
  }));
  const preparedExplanations = await loadExplanationCorrections({ adapter, principal,
    course: resolved.course, explanations, deadlineAt });
  const targets = [...prepared.map(({ unit }) => ({ targetKind: "study_unit", targetId: unit.studyUnit.id })),
    ...preparedExplanations.map(({ entity }) => ({ targetKind: "microsequence_explanation", targetId: entity.entityId }))];
  const pendingObservations = await readPendingObservations({ adapter, principal, course: resolved.course, targets, deadlineAt });
  for (const reference of observations) {
    if (!targets.some((target) => target.targetKind === reference.targetKind && target.targetId === reference.targetId)) {
      fail("invalid_course_observation_correction", "A observação indicada não pertence ao recorte corrigido.");
    }
    if (!pendingObservations.some((annotation) => annotation.annotationId === reference.annotationId &&
        annotation.annotationVersion === reference.annotationVersion && annotation.target.kind === reference.targetKind &&
        annotation.target.id === reference.targetId)) {
      fail("course_observation_version_conflict", "A observação mudou; releia a fila antes de corrigir a versão indicada.", 409);
    }
  }
  return { ...resolved, prepared, preparedExplanations, pendingObservations };
}

async function readPendingObservations({ adapter, principal, course, targets, deadlineAt }) {
  if (typeof adapter.getCourseAnchoredAnnotations !== "function") {
    fail("course_service_unavailable", "A fila de observações precisa ser lida antes da correção.", 503);
  }
  const result = [];
  const unique = new Map(targets.map((target) => [`${target.targetKind}\0${target.targetId}`, target]));
  for (const { targetKind, targetId } of unique.values()) {
    let cursor = null;
    let annotationSetVersion = null;
    const cursors = new Set();
    for (let pageIndex = 0; pageIndex < 32; pageIndex += 1) {
      const page = await adapter.getCourseAnchoredAnnotations({ principal, courseId: course.id,
        expectedCourseRevision: course.revision, annotationSetVersion, cursor, limit: 24, deadlineAt,
        query: { mode: "target", origins: ["author"], channels: [], states: ["open", "considered"], categories: [],
          includeUncategorized: true, subjectIds: [], hierarchy: { target: { kind: targetKind, id: targetId }, includeDescendants: false }, annotationId: null } });
      if (!Array.isArray(page?.items) || page.items.some((entry) => entry.provenance?.origin !== "author" ||
          !["open", "considered"].includes(entry.state) || entry.target?.kind !== targetKind || entry.target?.id !== targetId) ||
          annotationSetVersion !== null && page.annotationSetVersion !== annotationSetVersion) {
        fail("course_service_unavailable", "A fila de observações está incompleta; releia o recorte.", 503);
      }
      result.push(...page.items);
      annotationSetVersion = page.annotationSetVersion;
      if (!page.hasMore) break;
      if (!page.nextCursor || cursors.has(page.nextCursor) || pageIndex === 31) {
        fail("course_service_unavailable", "A fila de observações perdeu o ponto de leitura.", 503);
      }
      cursor = page.nextCursor;
      cursors.add(cursor);
    }
  }
  return result;
}

function correctionUncertain(courseId, requestId) {
  throw new AuthoringApiError(409, "course_write_uncertain", "A correção ainda precisa ser reconciliada pela mesma tentativa; conserve a fila e o conteúdo salvo.",
    { requestId, targetCourseId: courseId, operation: "course_observation_correction" });
}

async function confirmPersistedObservationCorrection({ adapter, principal, courseId, requestId, deadlineAt }) {
  let receipt = normalizeCourseObservationCorrection(await adapter.getCourseObservationCorrection({ principal, courseId, requestId, deadlineAt }));
  if (receipt.status !== "persisted" || receipt.courseId !== courseId || receipt.requestId !== requestId) correctionUncertain(courseId, requestId);
  const course = await adapter.getCourse({ principal, courseId, includeOutline: false, deadlineAt });
  const revision = Number(course?.revision ?? course?.courseRevision);
  if (course?.courseId !== courseId || !Number.isSafeInteger(revision) || revision < 1) correctionUncertain(courseId, requestId);
  // Releitura real do conteúdo e dos vínculos, inclusive na retomada. O hash
  // opaco do recibo não substitui a leitura do objeto e da fila pelo canal.
  const targets = new Map(receipt.observations.map((reference) => [`${reference.targetKind}\0${reference.targetId}`, reference]));
  const seenTargets = new Set();
  let cursor = null;
  const cursors = new Set();
  for (let index = 0; index < 100; index += 1) {
    const page = await adapter.listCourseEntities({ principal, courseId, expectedRevision: revision, limit: 200,
      afterEntityType: cursor?.entityType ?? null, afterEntityId: cursor?.entityId ?? null, deadlineAt });
    if (!Array.isArray(page?.items)) correctionUncertain(courseId, requestId);
    for (const entity of page.items) {
      const kind = entity.entityType === "microsequence" ? "microsequence_explanation" : entity.entityType;
      const key = `${kind}\0${entity.entityId}`;
      if (!targets.has(key) || !plainObject(entity.content)) continue;
      await adapter.getCourseSources({ principal, courseId, expectedRevision: revision, mode: "target", sourceId: null,
        targetKind: kind, targetId: entity.entityId, cursor: null, limit: 1, deadlineAt });
      seenTargets.add(key);
    }
    if (!page.hasMore) break;
    const key = JSON.stringify(page.nextCursor);
    if (!page.nextCursor || cursors.has(key) || index === 99) correctionUncertain(courseId, requestId);
    cursor = page.nextCursor;
    cursors.add(key);
  }
  const pending = await readPendingObservations({ adapter, principal, course: { id: courseId, revision }, targets: [...targets.values()], deadlineAt });
  receipt = normalizeCourseObservationCorrection(await adapter.getCourseObservationCorrection({ principal, courseId, requestId, deadlineAt }));
  if (receipt.status !== "persisted" || receipt.courseId !== courseId || receipt.requestId !== requestId) correctionUncertain(courseId, requestId);
  const confirmations = receipt.observations.filter((entry) => entry.changed && !entry.confirmed &&
    entry.currentEffectHash === entry.effectHash && seenTargets.has(`${entry.targetKind}\0${entry.targetId}`) &&
    pending.some((annotation) => annotation.annotationId === entry.annotationId && annotation.annotationVersion === entry.annotationVersion &&
      annotation.target.kind === entry.targetKind && annotation.target.id === entry.targetId))
    .map(({ annotationId, annotationVersion, effectHash }) => ({ annotationId, annotationVersion, effectHash }));
  if (!confirmations.length) return receipt;
  const confirmed = normalizeCourseObservationCorrection(await adapter.confirmCourseObservationCorrection({ principal, courseId, requestId, confirmations, deadlineAt }));
  if (confirmed.status !== "persisted" || confirmed.courseId !== courseId || confirmed.requestId !== requestId) correctionUncertain(courseId, requestId);
  return confirmed;
}

export async function resumeHumanCourseObservationCorrection({ adapter, principal, courseId, requestId, deadlineAt = null }) {
  try {
    const receipt = await confirmPersistedObservationCorrection({ adapter, principal, courseId, requestId, deadlineAt });
    const confirmed = receipt.observations.filter((entry) => entry.confirmed).length;
    return { result: `Reconciliada a correção salva: ${confirmed} observações confirmadas; ${receipt.observations.length - confirmed} permanecem pendentes.`,
      deepLink: adapter.publicAppUrl ? `${String(adapter.publicAppUrl).replace(/\/+$/u, "")}/#/authoring/courses/${encodeURIComponent(courseId)}?section=content` : null,
      nextDecision: "Inspecione as pendências que continuaram na fila.",
      context: { correctionRequestId: requestId, confirmedObservationCount: confirmed, pendingObservationCount: receipt.observations.length - confirmed } };
  } catch (error) {
    if (error instanceof AuthoringApiError && [401, 403, 404].includes(error.status)) throw error;
    throw new AuthoringApiError(409, "course_write_uncertain", "A retomada ainda não confirmou o resultado; conserve a mesma tentativa.",
      { requestId, targetCourseId: courseId, operation: "course_observation_correction" });
  }
}

function preserveMatchingSourceIdentities(links, currentLinks, requestedSources) {
  const binding = (link) => canonicalAuthoringValue({ sourceId: link.sourceId,
    relation: link.relation, anchors: link.anchors.map(({ anchorId }) => anchorId).sort() });
  const occurrence = (entry) => {
    const value = { ...entry };
    delete value.occurrenceId;
    return canonicalAuthoringValue(value);
  };
  const used = new Set();
  return links.map((link, index) => {
    const matches = currentLinks.filter((current) => binding(current) === binding(link));
    if (matches.length > 1 || matches.length === 1 && used.has(matches[0].linkId)) {
      fail("ambiguous_human_source_link", "A correção não identifica um único vínculo da fonte; inspecione os vínculos antes de salvar.");
    }
    const previous = matches[0];
    if (!previous) return link;
    used.add(previous.linkId);
    const usedOccurrences = new Set();
    return { ...link, linkId: previous.linkId,
      occurrences: requestedSources[index].ocorrencias === undefined
        ? structuredClone(previous.occurrences) : link.occurrences.map((value) => {
          const existing = previous.occurrences.find((candidate) =>
            !usedOccurrences.has(candidate.occurrenceId) && occurrence(candidate) === occurrence(value));
          if (!existing) return value;
          usedOccurrences.add(existing.occurrenceId);
          return { ...value, occurrenceId: existing.occurrenceId };
        }) };
  });
}

export async function applyHumanCourseCorrections({
  adapter,
  principal,
  course,
  corrections = [],
  explanations = [],
  observations = [],
  deadlineAt = null
}) {
  validateCorrections(corrections, explanations);
  try { observations = normalizeCourseObservationCorrectionReferences(observations); }
  catch (error) { fail(error.code ?? "invalid_course_observation_correction", error.message); }
  let correctedCourseId = null;
  let firstCorrectedStudyUnitId = null;
  let correctedExplanations = [];
  let pendingObservationCount = 0;
  const receipt = await executeTrustedCourseWrite({
    load: async () => {
      const state = await loadCorrectionState({
        adapter,
        principal,
        course,
        corrections,
        explanations,
        observations,
        deadlineAt
      });
      correctedCourseId = state.course.id;
      firstCorrectedStudyUnitId = state.prepared[0]?.unit.studyUnit.id ?? null;
      correctedExplanations = state.preparedExplanations.map(({ entity, support }) => ({
        id: entity.entityId, title: support.title
      }));
      pendingObservationCount = state.pendingObservations.length;
      return state;
    },
    async build(state, { newId }) {
      const sourceCache = new Map();
      const applications = await Promise.all(state.prepared.map(async (entry, index) => ({
        studyUnitId: entry.unit.studyUnit.id,
        sourceLinks: entry.sourceLinks ?? preserveMatchingSourceIdentities(await resolveHumanSourceLinks({
          adapter, principal, courseContext: state, requested: entry.requestedSources,
          content: entry.content, newId, identityPrefix: `correction:${index}:source-link`,
          deadlineAt, sourceCache
        }), entry.currentLinks, entry.requestedSources)
      })));
      applications.push(...await Promise.all(state.preparedExplanations.map(async (entry, index) => ({
        targetKind: "microsequence_explanation", targetId: entry.entity.entityId,
        sourceLinks: entry.sourceLinks ?? preserveMatchingSourceIdentities(await resolveHumanSourceLinks({ adapter, principal, courseContext: state,
          requested: entry.requestedSources, content: entry.support, newId,
          identityPrefix: `explanation-correction:${index}`, deadlineAt, sourceCache }), entry.currentLinks, entry.requestedSources)
      }))));
      const contextualApplication = principal.authenticationKind === "application" &&
        state.prepared.length === 1 && !state.preparedExplanations.length;
      return {
        principal,
        courseId: state.course.id,
        expectedRevision: state.course.revision,
        ...(contextualApplication
          ? {
            expectedStudyUnitVersion: Number(state.prepared[0].unit.version),
            applicationOrigin: "provider_assistance"
          }
          : {}),
        upserts: [...state.prepared.map(({ unit, content }) => ({
          entityType: "study_unit",
          entityId: unit.studyUnit.id,
          parentType: "microsequence",
          parentId: microsequenceId(unit),
          position: unit.studyUnit.position,
          content
        })), ...state.preparedExplanations.map(({ entity, content }) => ({
          entityType: "microsequence", entityId: entity.entityId, parentType: entity.parentType,
          parentId: entity.parentId, position: entity.position, content
        }))],
        deletes: [],
        sourceAttributionApplications: applications,
        ...(observations.length ? { observations } : {}),
        deadlineAt
      };
    },
    commit: async ({ requestId, ...request }) => {
      if (!observations.length) return adapter.commitCourseComposition({ ...request, requestId });
      const correction = { ...request };
      delete correction.deletes;
      await adapter.commitCourseObservationCorrections({ ...correction, requestId });
      return await confirmPersistedObservationCorrection({ adapter, principal, courseId: request.courseId, requestId, deadlineAt });
    },
    ...(observations.length ? { maxCasRetries: 0, operation: "course_observation_correction",
      reconcile: async ({ request }) => ({ status: "confirmed", result: await confirmPersistedObservationCorrection({
        adapter, principal, courseId: request.courseId, requestId: request.requestId, deadlineAt }) }) } : {})
  });
  const contentDeepLink = correctedCourseId && adapter.publicAppUrl
    ? `${String(adapter.publicAppUrl).replace(/\/+$/u, "")}` +
      `/#/authoring/courses/${encodeURIComponent(correctedCourseId)}?section=content`
    : null;
  const explanationLinks = correctedExplanations.map(({ id, title }) => ({
    titulo: title,
    deepLink: contentDeepLink
      ? `${contentDeepLink}&didacticMicrosequenceId=${encodeURIComponent(id)}`
      : null
  }));
  return {
    result: explanations.length ? "Corrigi o conteúdo e as Explicações indicados; a revisão humana afetada precisa ser atualizada."
      : corrections.length === 1
      ? "A correção foi aplicada à unidade de estudo afetada."
      : `As ${corrections.length} correções coerentes foram aplicadas às unidades de estudo afetadas.`,
    deepLink: contentDeepLink && firstCorrectedStudyUnitId
      ? `${contentDeepLink}&studyUnitId=${encodeURIComponent(firstCorrectedStudyUnitId)}`
      : explanationLinks[0]?.deepLink ?? receipt.deepLink ?? null,
    nextDecision: "Quer reinspecionar o reparo ou rematerializar a parte para aplicar uma configuração alterada?",
    context: {
      correctionCount: corrections.length,
      explanationCorrectionCount: explanations.length,
      ...(explanationLinks.length ? { explicacoes: explanationLinks } : {}),
      ...(observations.length ? { correctionRequestId: receipt.requestId,
        confirmedObservationCount: receipt.observations.filter((entry) => entry.confirmed).length,
        pendingObservationCount: pendingObservationCount - receipt.observations.filter((entry) => entry.confirmed).length }
        : { pendingObservationCount }),
      sourceMode: [...corrections, ...explanations].some(({ fontes }) => fontes !== undefined)
        ? "explicit"
        : "preserved"
    }
  };
}
