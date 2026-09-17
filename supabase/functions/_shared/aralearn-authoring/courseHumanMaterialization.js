import { AuthoringApiError } from "./errors.js";
import {
  executeTrustedCourseWrite,
  resolveHumanCourseContext
} from "./courseHumanTaskExecutor.js";
import { validateCourseEntityContent } from
  "../aralearn/runtime/domain/courseEntities.js";
import { observeCoursePracticeDistribution } from
  "../aralearn/runtime/domain/coursePracticeDistribution.js";
import { normalizeCourseSourceLinks, requireCourseSourceEvidence } from "../aralearn/runtime/domain/courseSources.js";
import { normalizeCourseSourceOccurrence } from "../aralearn/runtime/domain/courseSourceOccurrences.js";
import { normalizeMicrosequenceExplanation } from "../aralearn/runtime/domain/courseExplanation.js";
import { requireCoursePracticeAuthoring } from "../aralearn/runtime/domain/coursePracticeAuthoring.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../aralearn/runtime/resources/packages/index.js";
import { inspectExplanationReconciliation } from "../aralearn/runtime/domain/courseExplanationReconciliation.js";
import { sha256Hex } from "./security.js";
import { canonicalAuthoringValue } from "../aralearn/runtime/domain/courseAuthoringBasis.js";
import { createHumanNavigation, buildHumanNavigationEnvelope } from "./courseHumanNavigation.js";
import {
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  COURSE_DESIGN_PARAMETER_CATALOG_VERSION,
  EXPLANATION_FORMS,
  PRACTICE_VARIATION_DIMENSIONS,
  normalizeCourseDesignParameterValue
} from "../aralearn/runtime/domain/courseDesignParameters.js";

const MAX_PART_STUDY_UNIT_PAGES = 100;
export const HUMAN_SOURCE_ROLES = Object.freeze({
  escopo_curricular: "curricular_scope", evidencia_de_avaliacao: "assessment_evidence",
  tecnica_conceitual: "technical_conceptual", leitura_complementar: "recommended_reading"
});

export function resolveHumanSourceRoles(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.length > 4 || (!allowEmpty && value.length === 0) ||
      value.some((role) => !Object.hasOwn(HUMAN_SOURCE_ROLES, role)) || new Set(value).size !== value.length) {
    fail("invalid_human_source_roles", "Informe explicitamente os papéis de uso da fonte, sem repetições.");
  }
  return value.map((role) => HUMAN_SOURCE_ROLES[role]);
}

export async function resolveHumanSourceOccurrences({ requested = [], content, newId, identityPrefix }) {
  if (!Array.isArray(requested) || requested.length > 16) fail("invalid_human_source_occurrence", "Informe até 16 ocorrências.");
  const slots = { conteudo: "content", resposta: "response", feedback: "feedback" };
  const fields = new Set(["lugar", "recurso", "folha", "trecho", "prefixo", "sufixo"]);
  return await Promise.all(requested.map(async (entry, index) => {
    if (!plainObject(entry) || Object.keys(entry).some((key) => !fields.has(key)) ||
        !Object.hasOwn(slots, entry.lugar) || !Number.isSafeInteger(entry.recurso) || entry.recurso < 1) {
      fail("invalid_human_source_occurrence", "Informe o lugar, a posição do recurso e o trecho literal da ocorrência.");
    }
    const slot = slots[entry.lugar];
    const instances = slot === "response" ? (content?.response ? [content.response] : []) : content?.[slot];
    const resource = Array.isArray(instances) ? instances[entry.recurso - 1] : null;
    if (!resource?.id) fail("human_reference_not_found", "O recurso da ocorrência não foi localizado.", 404);
    return normalizeCourseSourceOccurrence({ occurrenceId: await newId(`${identityPrefix}:occurrence:${index}`),
      slot, resourceId: resource.id, path: entry.folha, quote: entry.trecho,
      prefix: entry.prefixo ?? null, suffix: entry.sufixo ?? null });
  }));
}
const UNIT_PARAMETER_FIELD_TO_ID = Object.freeze(Object.fromEntries(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ humanField, id }) => [humanField, id])
));
const EXPLANATION_FORM_LABELS = COURSE_DESIGN_PARAMETER_DEFINITIONS
  .find(({ id }) => id === "required_explanation_forms").optionLabels;

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function fail(code, message, status = 422) {
  throw new AuthoringApiError(status, code, message);
}

function reference(value, label) {
  if (Number.isSafeInteger(value) && value >= 1) return { kind: "position", value };
  if (typeof value === "string" && value === value.trim() && normalizedText(value)) {
    return { kind: "text", value: normalizedText(value) };
  }
  return fail("invalid_human_reference", `${label} precisa ser um título ou posição a partir de 1.`);
}

function resolveReference(items, value, { position, texts, label }) {
  const requested = reference(value, label);
  let matches;
  if (requested.kind === "position") {
    matches = items.filter((item, index) => {
      const stored = Number(position(item));
      return Number.isSafeInteger(stored)
        ? stored + 1 === requested.value
        : index + 1 === requested.value;
    });
  } else {
    matches = items.filter((item) => texts(item).some((text) =>
      normalizedText(text) === requested.value));
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return fail("ambiguous_human_reference", `${label} é ambígua.`, 409);
  }
  return fail("human_reference_not_found", `${label} não foi localizada.`, 404);
}

function partMicrosequences(part) {
  return Array.isArray(part?.microsequences) ? part.microsequences : [];
}

function existingStudyUnitSlot(item) {
  const microsequenceId = item?.curriculumPath?.didacticMicrosequence?.id;
  const position = Number(item?.studyUnit?.position);
  const studyUnitId = item?.studyUnit?.id;
  if (typeof microsequenceId !== "string" || !microsequenceId ||
      !Number.isSafeInteger(position) || position < 1 ||
      typeof studyUnitId !== "string" || !studyUnitId) {
    fail(
      "course_service_unavailable",
      "Uma unidade de estudo existente da parte não possui posição curricular válida.",
      503
    );
  }
  return { key: `${microsequenceId}\0${position}`, studyUnitId };
}

async function listExistingPartStudyUnits({ adapter, principal, context, deadlineAt }) {
  const bySlot = new Map();
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursorStudyUnitId = null;
  for (let pageIndex = 0; pageIndex < MAX_PART_STUDY_UNIT_PAGES; pageIndex += 1) {
    const cursorKey = cursorStudyUnitId ?? "null";
    if (seenCursors.has(cursorKey)) {
      fail("course_service_unavailable", "A paginação da parte repetiu o mesmo ponto.", 503);
    }
    seenCursors.add(cursorKey);
    const page = await adapter.listCourseStudyUnits({
      principal,
      courseId: context.course.id,
      expectedRevision: context.course.revision,
      scopeKind: "authoring_part",
      scopeId: context.part.id,
      cursorStudyUnitId,
      direction: "forward",
      limit: 24,
      maxBytes: 512 * 1024,
      inspectionVersion: 2,
      deadlineAt
    });
    if (!plainObject(page) || !Array.isArray(page.items)) {
      fail("course_service_unavailable", "A lista de unidades de estudo da parte é inválida.", 503);
    }
    for (const item of page.items) {
      const slot = existingStudyUnitSlot(item);
      if (seenIds.has(slot.studyUnitId) || bySlot.has(slot.key)) {
        fail("course_service_unavailable", "A parte possui posições de unidade de estudo duplicadas.", 503);
      }
      seenIds.add(slot.studyUnitId);
      bySlot.set(slot.key, { studyUnitId: slot.studyUnitId, item });
    }
    if (page.hasMore !== true) return bySlot;
    const next = page.nextCursor?.studyUnitId;
    if (typeof next !== "string" || !next) {
      fail("course_service_unavailable", "A paginação da parte perdeu o ponto de retomada.", 503);
    }
    cursorStudyUnitId = next;
  }
  fail("course_service_unavailable", "A parte excedeu o limite seguro de paginação.", 503);
}

function planItems(plan, collection) {
  return Array.isArray(plan?.plan?.[collection]) ? plan.plan[collection] : [];
}

function resolvePlanItem(plan, collection, value, label) {
  return resolveReference(planItems(plan, collection), value, {
    position: () => Number.NaN,
    texts: (item) => [item.statement],
    label
  });
}

function boundedText(value, label, maximum) {
  if (typeof value !== "string" || value !== value.trim() || !value ||
      [...value].length > maximum || [...value].some((character) => {
        const code = character.codePointAt(0);
        return code <= 8 || code === 11 || code === 12 ||
          code >= 14 && code <= 31 || code === 127;
      })) {
    fail("invalid_human_materialization", `${label} é inválido.`);
  }
  return value;
}

function analysisDefinition(value) {
  if (!plainObject(value) ||
      Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "nome") || !Object.hasOwn(value, "descricao")) {
    return null;
  }
  return {
    statement: boundedText(value.nome, "O nome da ideia", 2_000),
    description: boundedText(value.descricao, "A descrição da ideia", 4_000)
  };
}

function resolveAnchor(anchors, value) {
  return resolveReference(anchors, value, {
    position: () => Number.NaN,
    texts: (anchor) => [
      anchor.humanLocator,
      anchor.verificationExcerpt
    ],
    label: "A âncora"
  });
}

export async function resolveHumanSourceLinks({
  adapter,
  principal,
  courseContext,
  requested,
  deadlineAt,
  sourceCache = new Map(),
  newId,
  content,
  allowMissingOccurrences = false,
  identityPrefix = "source-link"
}) {
  if (!Array.isArray(requested) || requested.length > 32) {
    fail("invalid_human_materialization", "Informe até 32 vínculos de fontes.");
  }
  if (!requested.length) return [];
  const links = [];
  for (const [index, entry] of requested.entries()) {
    if (!plainObject(entry) || !Object.hasOwn(entry, "fonte") ||
        typeof entry.relacao !== "string" ||
        Object.keys(entry).some((key) => !["fonte", "relacao", "papeis", "ancoras", "ocorrencias"].includes(key))) {
      fail("invalid_human_materialization", "Um vínculo de fonte da unidade de estudo é inválido.");
    }
    const cacheKey = `${typeof entry.fonte}:${String(entry.fonte)}`;
    let source = sourceCache.get(cacheKey);
    if (!source) {
      const resolved = await resolveHumanCourseContext({
        adapter,
        principal,
        course: courseContext.course.title,
        source: entry.fonte,
        deadlineAt
      });
      const detail = await adapter.getCourseSources({
        principal,
        courseId: courseContext.course.id,
        expectedRevision: courseContext.course.revision,
        mode: "source",
        sourceId: resolved.source.sourceId,
        targetKind: null,
        targetId: null,
        cursor: null,
        limit: 1,
        deadlineAt
      });
      const current = Array.isArray(detail?.items) && detail.items.length === 1
        ? detail.items[0]
        : null;
      if (!current || current.sourceId !== resolved.source.sourceId ||
          Number(current.revision) !== Number(resolved.source.revision)) {
        fail("human_reference_not_found", "A fonte corrente não foi localizada.", 404);
      }
      source = {
        ...current,
        sourceId: current.sourceId,
        anchors: Array.isArray(current.anchors) ? current.anchors : []
      };
      sourceCache.set(cacheKey, source);
    }
    if (entry.ancoras !== undefined && (!Array.isArray(entry.ancoras) || entry.ancoras.length > 8)) {
      fail("invalid_human_source_anchor", "Informe até oito âncoras do vínculo.");
    }
    const requestedAnchors = entry.ancoras ?? [];
    const selectedAnchors = requestedAnchors.map((anchor) => resolveAnchor(source.anchors, anchor));
    if (entry.relacao === "quoted_from" && !selectedAnchors.length) {
      fail("invalid_human_source_anchor", "Uma citação direta exige a localização informada na fonte.");
    }
    const link = {
      linkId: await newId(`${identityPrefix}:${index}`),
      sourceId: source.sourceId,
      relation: entry.relacao,
      roles: resolveHumanSourceRoles(entry.papeis),
      occurrences: await resolveHumanSourceOccurrences({ requested: entry.ocorrencias, content, newId,
        identityPrefix: `${identityPrefix}:${index}` }),
      anchors: selectedAnchors.map((anchor) => ({
        anchorId: anchor.anchorId
      }))
    };
    requireCourseSourceEvidence(link, source, { allowMissingOccurrences });
    links.push(link);
  }
  return normalizeCourseSourceLinks(links);
}

function componentRefs(content) {
  const instances = [
    ...(Array.isArray(content?.content) ? content.content : []),
    ...(content?.response ? [content.response] : []),
    ...(Array.isArray(content?.feedback) ? content.feedback : [])
  ];
  return [...new Set(instances.map((instance) => {
    const packageId = String(instance?.package || "");
    const version = String(instance?.version || "");
    return packageId && version ? `${packageId}@${version}` : "";
  }).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
}

// Position is a destination, never the identity of an object to replace.
// Untouched objects fill the remaining slots in their current relative order.
function arrangeMaterializationUnits(existingBySlot, requested, micros, add = null) {
  const report = (code, message, details = {}) => {
    if (add) add(code, message, details); else fail(code, message);
  };
  const planned = new Map();
  const retained = [];
  const consumed = new Set();
  for (const [index, unit] of requested.entries()) {
    try {
      const micro = resolveReference(micros, unit.microssequencia, { position: value => value.productionPosition ?? value.position,
        texts: value => [value.title], label: "A microssequência" });
      const candidates = [...existingBySlot.values()].filter(value =>
        value.item.curriculumPath.didacticMicrosequence.id === micro.id);
      const existing = unit.unidade === undefined ? null : resolveReference(candidates, unit.unidade, {
        position: value => value.item.studyUnit.position - 1,
        texts: value => [value.studyUnitId, value.item.studyUnit.title], label: "A unidade a substituir" });
      if (existing && consumed.has(existing.studyUnitId)) {
        report("duplicate_human_reference", "O lote repete a mesma unidade existente.", { unit: index + 1 }); continue;
      }
      if (existing) consumed.add(existing.studyUnitId);
      planned.set(index, { index, existing, microsequenceId: micro.id, position: unit.posicao });
    } catch (error) { report(error.code, error.message, { unit: index + 1 }); }
  }
  for (const micro of micros) {
    const current = [...existingBySlot.values()].filter(value => value.item.curriculumPath.didacticMicrosequence.id === micro.id);
    const supplied = [...planned.values()].filter(value => value.microsequenceId === micro.id);
    const untouched = current.filter(value => !consumed.has(value.studyUnitId))
      .sort((left, right) => left.item.studyUnit.position - right.item.studyUnit.position);
    const count = untouched.length + supplied.length;
    const reserved = new Set();
    for (const value of supplied) {
      if (!Number.isSafeInteger(value.position) || value.position < 1 || value.position > count || reserved.has(value.position)) {
        report("human_materialization_invalid_order", "A ordem final precisa ter posições distintas e consecutivas.", { unit: value.index + 1 });
      }
      reserved.add(value.position);
    }
    for (let position = 1; position <= count; position += 1) if (!reserved.has(position)) {
      const existing = untouched.shift();
      if (existing) retained.push({ existing, microsequenceId: micro.id, position });
    }
  }
  return { planned, retained };
}

function persistedPedagogicalUnit(item, microsequence, position, design) {
  const application = item.designApplication;
  return { source: { posicao: position, conteudo: item.studyUnit,
      aplicacaoPedagogica: { explicacoes: application.explanationApplications ?? [] } },
    inputIndex: `saved:${item.studyUnit.id}`, microsequence, content: item.studyUnit, design,
    noveltyIds: application.introducedInstructionalAnalysisUnitIds ?? [],
    usedIds: application.usedInstructionalAnalysisUnitIds ?? [],
    explanations: (application.explanationApplications ?? []).map(value => ({ ...value, notApplicable: value.notApplicable ?? [] })),
    practices: application.practiceApplications ?? [], curriculumScopeItemIds: application.curriculumScopeItemIds ?? [],
    componentRefs: componentRefs(item.studyUnit) };
}

export function humanMaterializationUnitPlan(unit) {
  // Preparation and writing consume the same authored candidate. Derived
  // component/response/feedback summaries are never a second source of truth.
  return structuredClone(unit);
}

export async function explanationContentBasis(explanation) {
  // JSONB preserves content, not object-key insertion order. The basis must
  // survive persistence while retaining the meaningful order of resources.
  return await sha256Hex(canonicalAuthoringValue({ title: explanation?.title, content: explanation?.content }));
}

export async function reconcileHumanExplanation(content, entries, context) {
  const explanation = normalizeMicrosequenceExplanation(content);
  if (entries === undefined) return explanation;
  if (!Array.isArray(entries) || !entries.length || entries.length > 512) {
    fail("invalid_explanation_reconciliation", "Informe as passagens classificadas da base.");
  }
  const micros = (context.plan?.plan?.curriculum?.modules ?? []).flatMap(module =>
    (module.lessons ?? []).flatMap(lesson => lesson.microsequences ?? []));
  explanation.reconciliation = {
    contract: "aralearn.explanation-reconciliation.v1", contentBasis: await explanationContentBasis(explanation),
    entries: entries.map(entry => ({ resourceId: explanation.content[entry.recurso - 1]?.id,
      path: entry.folha, quote: entry.trecho, prefix: entry.prefixo ?? null, suffix: entry.sufixo ?? null,
      role: entry.papel, reason: entry.motivo,
      analysisUnitIds: (entry.ideias ?? []).map(value => resolvePlanItem(context.plan, "instructionalAnalysisUnits", value, "A ideia").id),
      evidenceRequirementIds: (entry.requisitos ?? []).map(value => resolvePlanItem(context.plan, "evidenceRequirements", value, "O requisito").id),
      destinationMicrosequenceId: entry.destino == null ? null : resolveReference(micros, entry.destino, {
        position: () => Number.NaN, texts: item => [item.title], label: "O destino da retomada" }).id
    }))
  };
  const normalized = normalizeMicrosequenceExplanation(explanation);
  const inspection = inspectExplanationReconciliation(normalized, {
    contentBasis: await explanationContentBasis(normalized),
    analysisUnitIds: planItems(context.plan, "instructionalAnalysisUnits").map(item => item.id),
    evidenceRequirementIds: planItems(context.plan, "evidenceRequirements").map(item => item.id),
    microsequenceIds: micros.map(item => item.id)
  });
  if (!inspection.ready) {
    fail("invalid_explanation_reconciliation",
      "A descrição pedagógica precisa corresponder integralmente à base que será salva.");
  }
  return normalized;
}

// Preparation and writing consume the same candidate units. The preflight
// derives structural facts from content instead of maintaining a parallel plan.
export async function preflightHumanCourseMaterialization({ adapter, principal, context,
  planUnits = [], explanations = [], complete = false, deadlineAt = null }) {
  const blockers = [];
  const add = (code, message, details = {}) => blockers.push({ code, message, ...details });
  const capture = (callback, details = {}) => {
    try { return callback(); }
    catch (error) { add(error.code ?? "invalid_human_materialization", error.message, details); return null; }
  };
  const mapStatus = context.plan?.plan?.curriculumMapStatus;
  if (mapStatus === "draft" || mapStatus === "absent") {
    add("human_materialization_map_approval_required",
      "O mapa curricular precisa estar aprovado antes da materialização. Consulte o mapa e obtenha a aprovação da pessoa autora.",
      { curriculumMapStatus: mapStatus });
  } else if (mapStatus !== "approved") {
    add("course_service_unavailable", "O estado de aprovação do mapa curricular não pôde ser confirmado.");
  }
  const micros = partMicrosequences(context.part);
  const existingBySlot = await listExistingPartStudyUnits({ adapter, principal, context, deadlineAt });
  const groups = new Map();
  const sourceCache = new Map();
  const scopedDesigns = new Map();
  const arrangement = arrangeMaterializationUnits(existingBySlot, planUnits, micros, add);
  const targetMicrosequenceIds = new Set([...arrangement.planned.values()]
    .map(value => value.microsequenceId).filter(Boolean));
  const designMicros = complete ? micros : micros.filter(micro => targetMicrosequenceIds.has(micro.id));
  const designs = new Map(await Promise.all(designMicros.map(async micro => [micro.id, await adapter.getCourseDesign({
    principal, courseId: context.course.id, scopeKind: "didactic_microsequence", scopeRef: micro.id,
    childLimit: 1, childCursor: null, deadlineAt
  })])));
  if (!planUnits.length) add("human_materialization_plan_required",
    "Informe as unidades candidatas para conferir sua coerência antes de escrever.");
  for (const [index, planned] of planUnits.entries()) {
    const details = { unit: index + 1 };
    const micro = capture(() => resolveReference(micros, planned.microssequencia, {
      position: item => item.productionPosition ?? item.position, texts: item => [item.title], label: "A microssequência"
    }), details);
    // Continue inspecting independent prerequisites even if another reference is missing.
    const application = planned.aplicacaoPedagogica ?? {};
    const resolve = (collection, value, label) => capture(() => resolvePlanItem(context.plan, collection,
      analysisDefinition(value)?.statement ?? value, label), details)?.id ?? null;
    const noveltyIds = (application.ideiasIntroduzidas ?? []).map(value =>
      resolve("instructionalAnalysisUnits", value, "A ideia do repertório")).filter(Boolean);
    const usedIds = (application.ideiasUtilizadas ?? []).map(value =>
      resolve("instructionalAnalysisUnits", value, "A ideia do repertório")).filter(Boolean);
    const parsedExplanations = (application.explicacoes ?? []).map(entry => ({
      instructionalAnalysisUnitId: resolve("instructionalAnalysisUnits", entry.ideia, "A ideia do repertório"),
      developedForms: entry.formas ?? [],
      notApplicable: (entry.formasNaoAplicaveis ?? []).map(value => ({ form: value.forma, reason: value.motivo }))
    })).filter(entry => entry.instructionalAnalysisUnitId);
    const practices = (application.praticas ?? []).map(entry => {
      const id = resolve("evidenceRequirements", entry.requisito, "O requisito de evidência");
      return { evidenceRequirementId: id, opportunityId: entry.oportunidade,
        invariantTaskOperation: planItems(context.plan, "evidenceRequirements").find(item => item.id === id)?.statement,
        variedDimensions: entry.dimensoesVariadas ?? [] };
    }).filter(entry => entry.evidenceRequirementId);
    const curriculumScopeItemIds = (application.cobertura ?? []).map(value =>
      resolve("curriculumScopeItems", value, "O item de cobertura curricular")).filter(Boolean);
    const existing = arrangement.planned.get(index)?.existing?.item ?? null;
    let normalizedContent = null;
    const contentValidation = validateCourseEntityContent("study_unit", {
      ...(planned.conteudo ?? {}), id: `preflight-${index + 1}`, position: planned.posicao
    });
    if (!contentValidation.valid) {
      add("invalid_human_study_unit",
        `A unidade de estudo ${index + 1} é inválida: ${contentValidation.errors.join(" ")}`, details);
    } else {
      normalizedContent = structuredClone(contentValidation.normalized);
      try { requireCoursePracticeAuthoring(normalizedContent, existing?.studyUnit ?? null); }
      catch (error) { add(error.code ?? "invalid_human_study_unit", error.message, details); }
      delete normalizedContent.id;
      delete normalizedContent.position;
    }
    for (const entry of application.explicacoes ?? []) {
      const forms = entry.formas ?? [];
      const notApplicable = entry.formasNaoAplicaveis ?? [];
      if (!forms.length && !notApplicable.length || new Set(forms).size !== forms.length ||
          forms.some(form => !EXPLANATION_FORMS.includes(form)) ||
          new Set(notApplicable.map(value => value.forma)).size !== notApplicable.length ||
          notApplicable.some(value => !EXPLANATION_FORMS.includes(value.forma) || forms.includes(value.forma) ||
            typeof value.motivo !== "string" || !value.motivo.trim() || [...value.motivo.trim()].length > 240)) {
        add("invalid_human_materialization", "As formas aplicadas e não aplicáveis são incoerentes.", details);
      }
    }
    for (const entry of application.praticas ?? []) {
      if (typeof entry.oportunidade !== "string" || !entry.oportunidade.trim() || [...entry.oportunidade.trim()].length > 240 ||
          !Array.isArray(entry.dimensoesVariadas) || new Set(entry.dimensoesVariadas).size !== entry.dimensoesVariadas.length ||
          entry.dimensoesVariadas.some(value => !PRACTICE_VARIATION_DIMENSIONS.includes(value))) {
        add("invalid_human_materialization", "Uma aplicação de prática é inválida.", details);
      }
    }
    if (new Set(curriculumScopeItemIds).size !== curriculumScopeItemIds.length) add("duplicate_human_reference",
      "A unidade de estudo repete o mesmo item de cobertura.", details);
    for (const [sourceIndex, link] of (planned.fontes ?? []).entries()) {
      try {
        await resolveHumanSourceLinks({ adapter, principal, courseContext: context,
          requested: [link], content: normalizedContent ?? planned.conteudo ?? {},
          newId: key => `preflight-${index}-${sourceIndex}-${key}`, sourceCache, deadlineAt });
      } catch (error) { add(error.code ?? "invalid_human_source", error.message, details); }
    }
    if (!micro) continue;
    const scopedDesign = existing ? await adapter.getCourseDesign({ principal, courseId: context.course.id,
      scopeKind: "study_unit", scopeRef: existing.studyUnit.id, childLimit: 1, childCursor: null, deadlineAt }) : designs.get(micro.id);
    scopedDesigns.set(existing?.studyUnit.id ?? `new:${index}`, scopedDesign);
    capture(() => validateUnitConfiguration(planned.configuracao), details);
    const design = capture(() => applyUnitContextualCalibration(scopedDesign, planned.configuracao,
      { existing }), details);
    if (!design) continue;
    capture(() => designSnapshot(design, micro.id), details);
    for (const id of curriculumScopeItemIds) {
      if (!plannedCurriculumScopeIds(context.plan, micro.id).includes(id)) add("human_materialization_scope_outside_map",
        "Um item de cobertura não pertence à microssequência desta unidade de estudo.", details);
    }
    const targets = design.targetPlanItems;
    if (!targets) { add("course_service_unavailable", "O repertório vinculado não pôde ser lido.", details); continue; }
    for (const id of new Set([...noveltyIds, ...usedIds, ...parsedExplanations.map(entry => entry.instructionalAnalysisUnitId)])) {
      if (!targets.instructionalAnalysisUnitIds.includes(id)) add("human_materialization_analysis_not_linked",
        "Vincule a ideia à microssequência antes da materialização.", details);
    }
    for (const practice of practices) {
      if (!targets.evidenceRequirementIds.includes(practice.evidenceRequirementId)) add("human_materialization_requirement_not_linked",
        "Vincule o requisito à microssequência antes da materialização.", details);
    }
    const unit = { source: planned, inputIndex: index,
      microsequence: micro, noveltyIds, usedIds, explanations: parsedExplanations, practices,
      curriculumScopeItemIds, componentRefs: componentRefs(normalizedContent ?? planned.conteudo),
      content: normalizedContent ?? planned.conteudo ?? {}, design };
    if (!groups.has(micro.id)) groups.set(micro.id, { microsequenceId: micro.id, units: [] });
    groups.get(micro.id).units.push(unit);
  }
  for (const retained of arrangement.retained) {
    if (!complete && !targetMicrosequenceIds.has(retained.microsequenceId)) continue;
    const { item } = retained.existing;
    const application = item.designApplication, snapshot = item.designSnapshot;
    if (!application || !snapshot) {
      if (complete) add("human_materialization_existing_application_missing",
        "Registre as aplicações e a configuração aplicada da unidade existente antes de concluir o percurso.", { studyUnit: item.studyUnit.title });
      continue;
    }
    const micro = micros.find(value => value.id === retained.microsequenceId);
    // An omitted object keeps the configuration actually used to produce it.
    // Current intentions govern incoming units and the current repertoire only.
    const design = { ...designs.get(micro.id), parameters: (snapshot.parameters ?? []).map(parameter => ({
      parameterId: parameter.parameterId, effectiveAssignment: {
        mode: parameter.origin === "automatic" ? "automatic" : "fixed", value: parameter.value,
        origin: parameter.origin, reason: parameter.reason,
        sourceScope: parameter.sourceScopeKind ? { kind: parameter.sourceScopeKind } : null
      }
    })), componentPolicy: { effectiveAssignment: snapshot.componentPolicy } };
    scopedDesigns.set(item.studyUnit.id, design);
    const unit = persistedPedagogicalUnit(item, micro, retained.position, design);
    if (!groups.has(micro.id)) groups.set(micro.id, { microsequenceId: micro.id, units: [] });
    groups.get(micro.id).units.push(unit);
  }
  const allMicros = (context.plan?.plan?.curriculum?.modules ?? []).flatMap(module =>
    (module.lessons ?? []).flatMap(lesson => lesson.microsequences ?? []));
  const reconciliations = [];
  const savedSourceBases = [];
  const suppliedByMicro = new Map();
  for (const [index, entry] of (explanations ?? []).entries()) {
    try {
      const prepared = await prepareExplanations({ explanations: [entry], adapter, principal, context,
        deadlineAt, newId: async key => `preflight-explanation-${index}-${key}`, includeSaved: false });
      const value = prepared[0];
      if (suppliedByMicro.has(value.microsequenceId)) fail("invalid_human_explanation", "A parte repete a explicação de uma microssequência.");
      suppliedByMicro.set(value.microsequenceId, value);
    } catch (error) { add(error.code ?? "invalid_human_explanation", error.message, { explanation: index + 1 }); }
  }
  const relevantMicrosequenceIds = complete
    ? new Set(micros.map(item => item.id))
    : new Set([...targetMicrosequenceIds, ...suppliedByMicro.keys()]);
  for (const micro of micros.filter(item => relevantMicrosequenceIds.has(item.id))) {
    const supplied = suppliedByMicro.get(micro.id);
    const explanation = supplied ? supplied.content
      : allMicros.find(item => item.id === micro.id)?.explanation ?? micro.explanation;
    if (!explanation) { add("human_materialization_missing_explanation", "Salve e reconcilie a Explicação antes de produzir as unidades.", { microsequence: micro.title }); continue; }
    if (!supplied) {
      const sources = await adapter.getCourseSources({ principal, courseId: context.course.id,
        expectedRevision: context.course.revision, mode: "target", sourceId: null,
        targetKind: "microsequence_explanation", targetId: micro.id, cursor: null, limit: 1, deadlineAt });
      if (!Array.isArray(sources?.items) || sources.items.length !== 1) {
        add("course_service_unavailable", "As fontes da base salva não puderam ser relidas.", { microsequence: micro.title });
      } else {
        savedSourceBases.push([micro.id, sources.items[0]]);
        for (const link of sources.items[0].sourceLinks ?? []) {
          try {
            const detail = await adapter.getCourseSources({ principal, courseId: context.course.id,
              expectedRevision: context.course.revision, mode: "source", sourceId: link.sourceId,
              targetKind: null, targetId: null, cursor: null, limit: 1, deadlineAt });
            const source = detail?.items?.[0];
            if (!source || source.sourceId !== link.sourceId) fail("human_reference_not_found", "A fonte corrente não foi localizada.");
            sourceCache.set(`saved:${link.sourceId}`, source);
            requireCourseSourceEvidence(link, source);
          } catch (error) { add(error.code ?? "invalid_human_source", error.message, { microsequence: micro.title }); }
        }
      }
    }
    const reconciliation = inspectExplanationReconciliation(explanation, {
      contentBasis: await explanationContentBasis(explanation),
      analysisUnitIds: planItems(context.plan, "instructionalAnalysisUnits").map(item => item.id),
      evidenceRequirementIds: planItems(context.plan, "evidenceRequirements").map(item => item.id),
      microsequenceIds: allMicros.map(item => item.id)
    });
    reconciliations.push({ microssequencia: micro.title, ...reconciliation });
    reconciliation.blockers.forEach(blocker => blockers.push({ ...blocker, microsequence: micro.title }));
    const group = groups.get(micro.id);
    if (complete && group) {
      const introduced = new Set(group.units.flatMap(unit => unit.noveltyIds));
      const practiced = new Set(group.units.flatMap(unit => unit.practices.map(practice => practice.evidenceRequirementId)));
      for (const id of reconciliation.introduced) if (!introduced.has(id)) add("human_materialization_incomplete_analysis_inventory",
        "O percurso ainda não cobre um ensinamento introduzido na base.", { microsequence: micro.title,
          idea: planItems(context.plan, "instructionalAnalysisUnits").find(item => item.id === id)?.statement });
      for (const id of reconciliation.requirements) if (!practiced.has(id)) add("human_materialization_insufficient_practice",
        "Um requisito da base ainda não tem prática no percurso.", { microsequence: micro.title,
          requirement: planItems(context.plan, "evidenceRequirements").find(item => item.id === id)?.statement });
    } else if (complete && !group) add("human_materialization_incomplete_part",
      "O plano ainda não cobre esta microssequência.", { microsequence: micro.title });
  }
  for (const group of groups.values()) group.units.sort((left, right) => left.source.posicao - right.source.posicao);
  const affectedExistingStudyUnitIds = new Set([...existingBySlot.values()]
    .filter(entry => complete || targetMicrosequenceIds.has(
      entry.item.curriculumPath.didacticMicrosequence.id))
    .map(entry => entry.studyUnitId));
  capture(() => validatePedagogicalPart([...groups.values()], context.plan,
    affectedExistingStudyUnitIds, blockers, { complete }));
  const normalizedPlan = structuredClone(planUnits);
  const identity = await sha256Hex(canonicalAuthoringValue({ courseId: context.course.id, courseRevision: context.course.revision,
    part: context.part, plan: context.plan, designs: [...designs], scopedDesigns: [...scopedDesigns],
    existing: [...existingBySlot], sourceBases: [...sourceCache], savedSourceBases,
    explanations: [...suppliedByMicro], planUnits: normalizedPlan, complete }));
  const unique = [...new Map(blockers.map(blocker => [JSON.stringify(blocker), blocker])).values()];
  return { state: unique.length ? "blocked" : "ready", referencia: unique.length ? null : `materialization-v1:${identity}`,
    blockers: unique, reconciliations, completion: complete ? "complete" : "partial" };
}

function validateUnitConfiguration(configuration) {
  if (configuration === undefined) return;
  if (!plainObject(configuration) || Object.keys(configuration).some((field) =>
    !["parametros", "motivo", "direcaoEditorial"].includes(field)) ||
    !plainObject(configuration.parametros) || !Object.keys(configuration.parametros).length ||
    Object.keys(configuration.parametros).some((field) => !Object.hasOwn(UNIT_PARAMETER_FIELD_TO_ID, field))) {
    fail("invalid_human_materialization", "A calibração da unidade de estudo é inválida.");
  }
  boundedText(configuration.motivo, "O motivo da escolha contextual", 1000);
  for (const [field, value] of Object.entries(configuration.parametros)) {
    try { normalizeCourseDesignParameterValue(UNIT_PARAMETER_FIELD_TO_ID[field], value); }
    catch { fail("invalid_human_materialization", "A escolha contextual diverge do catálogo."); }
  }
  if (configuration?.direcaoEditorial !== undefined) {
    boundedText(configuration.direcaoEditorial, "A direção editorial", 4000);
  }
}

function pedagogicalMode(unit) {
  if (unit.conteudo.role === "theory") return "expository";
  return unit.aplicacaoPedagogica.explicacoes.length ? "mixed" : "practice";
}

function validateUnits(units) {
  if (!Array.isArray(units) || units.length < 1 || units.length > 64) {
    fail("invalid_human_materialization", "A materialização precisa conter de 1 a 64 unidades de estudo.");
  }
  for (const [index, unit] of units.entries()) {
    if (!plainObject(unit) || !plainObject(unit.conteudo) ||
        !plainObject(unit.aplicacaoPedagogica) ||
        !Number.isSafeInteger(unit.posicao) || unit.posicao < 1 ||
        !Array.isArray(unit.aplicacaoPedagogica.ideiasIntroduzidas) ||
        !Array.isArray(unit.aplicacaoPedagogica.ideiasUtilizadas) ||
        !Array.isArray(unit.aplicacaoPedagogica.explicacoes) ||
        !Array.isArray(unit.aplicacaoPedagogica.praticas) ||
        !Array.isArray(unit.aplicacaoPedagogica.cobertura) ||
        unit.fontes != null && !Array.isArray(unit.fontes)) {
      fail(
        "invalid_human_materialization",
        `A unidade de estudo ${index + 1} possui conteúdo ou aplicação pedagógica inválida.`
      );
    }
    validateUnitConfiguration(unit.configuracao);
  }
}

async function prepareUnits({ adapter, principal, context, units, deadlineAt, newId }) {
  const microsequences = partMicrosequences(context.part);
  if (!microsequences.length) {
    fail("human_part_has_no_microsequences", "A parte ainda não possui microssequências para materializar.");
  }
  const inventory = { upserts: [] };
  const groups = new Map();
  const sourceCache = new Map();
  for (const [unitIndex, unit] of units.entries()) {
    const microsequence = resolveReference(microsequences, unit.microssequencia, {
      position: (item) => item.productionPosition ?? item.position,
      texts: (item) => [item.title],
      label: "A microssequência"
    });
    const noveltyIds = unit.aplicacaoPedagogica.ideiasIntroduzidas.map((value) => (
      resolvePlanItem(
        context.plan,
        "instructionalAnalysisUnits",
        analysisDefinition(value)?.statement ?? value,
        "A ideia do repertório"
      ).id
    ));
    const usedIds = unit.aplicacaoPedagogica.ideiasUtilizadas.map((value) => (
      resolvePlanItem(
        context.plan,
        "instructionalAnalysisUnits",
        value,
        "A ideia do repertório"
      ).id
    ));
    const curriculumScopeItemIds = unit.aplicacaoPedagogica.cobertura.map((value) => {
      const scopeItem = resolvePlanItem(
        context.plan,
        "curriculumScopeItems",
        value,
        "O item de cobertura curricular"
      );
      const belongsToMicrosequence = Array.isArray(scopeItem.curriculumTargets) &&
        scopeItem.curriculumTargets.some((target) =>
          Array.isArray(target?.didacticMicrosequenceIds) &&
          target.didacticMicrosequenceIds.includes(microsequence.id));
      if (!belongsToMicrosequence) {
        fail(
          "human_materialization_scope_outside_map",
          "Um item de cobertura não pertence à microssequência desta unidade de estudo."
        );
      }
      return scopeItem.id;
    });
    if (new Set(curriculumScopeItemIds).size !== curriculumScopeItemIds.length) {
      fail("duplicate_human_reference", "A unidade de estudo repete o mesmo item de cobertura.");
    }
    const explanations = unit.aplicacaoPedagogica.explicacoes.map((entry) => {
      if (!plainObject(entry) || !Array.isArray(entry.formas)) {
        fail("invalid_human_materialization", "Uma aplicação de explicação é inválida.");
      }
      if (entry.formas.length > EXPLANATION_FORMS.length ||
          new Set(entry.formas).size !== entry.formas.length ||
          entry.formas.some((form) => !EXPLANATION_FORMS.includes(form))) {
        fail("invalid_human_materialization", "As formas de explicação são inválidas.");
      }
      const notApplicable = entry.formasNaoAplicaveis == null
        ? []
        : Array.isArray(entry.formasNaoAplicaveis)
          ? entry.formasNaoAplicaveis.map((item) => {
              if (!plainObject(item) || !EXPLANATION_FORMS.includes(item.forma) ||
                  typeof item.motivo !== "string" || !item.motivo.trim() ||
                  [...item.motivo.trim()].length > 240) {
                fail("invalid_human_materialization", "Uma forma não aplicável é inválida.");
              }
              return { form: item.forma, reason: item.motivo.trim() };
            })
          : fail("invalid_human_materialization", "As formas não aplicáveis são inválidas.");
      if (!entry.formas.length && !notApplicable.length ||
          new Set(notApplicable.map(({ form }) => form)).size !== notApplicable.length ||
          notApplicable.some(({ form }) => entry.formas.includes(form))) {
        fail("invalid_human_materialization", "As formas aplicadas e não aplicáveis são incoerentes.");
      }
      return {
        instructionalAnalysisUnitId: resolvePlanItem(
          context.plan,
          "instructionalAnalysisUnits",
          entry.ideia,
          "A ideia do repertório"
        ).id,
        developedForms: [...entry.formas],
        notApplicable
      };
    });
    const practices = unit.aplicacaoPedagogica.praticas.map((entry) => {
      if (!plainObject(entry) || typeof entry.oportunidade !== "string" ||
          !entry.oportunidade.trim() || [...entry.oportunidade.trim()].length > 240 ||
          !Array.isArray(entry.dimensoesVariadas) ||
          new Set(entry.dimensoesVariadas).size !== entry.dimensoesVariadas.length ||
          entry.dimensoesVariadas.some((dimension) =>
            !PRACTICE_VARIATION_DIMENSIONS.includes(dimension))) {
        fail("invalid_human_materialization", "Uma aplicação de prática é inválida.");
      }
      const requirement = resolvePlanItem(
        context.plan,
        "evidenceRequirements",
        entry.requisito,
        "O requisito de evidência"
      );
      return {
        evidenceRequirementId: requirement.id,
        opportunityId: entry.oportunidade.trim(),
        invariantTaskOperation: requirement.statement,
        variedDimensions: [...entry.dimensoesVariadas]
      };
    });
    const validation = validateCourseEntityContent("study_unit", {
      ...unit.conteudo,
      id: `human-preflight-${unitIndex + 1}`,
      position: unit.posicao
    });
    if (!validation.valid) {
      const reasons = validation.errors
        .map((error) => typeof error === "string" ? error : error?.message)
        .filter((message) => typeof message === "string" && message.trim());
      fail(
        "invalid_human_study_unit",
        `A unidade de estudo ${unit.posicao} é inválida: ${reasons.join(" ")}`
      );
    }
    const content = structuredClone(validation.normalized);
    try { requireCoursePracticeAuthoring(content); }
    catch (error) { fail(error.code, error.message); }
    delete content.id;
    delete content.position;
    const prepared = {
      inputIndex: unitIndex,
      source: unit,
      microsequence,
      noveltyIds,
      usedIds,
      curriculumScopeItemIds,
      explanations,
      practices,
      content,
      sourceLinks: await resolveHumanSourceLinks({
        adapter,
        principal,
        courseContext: context,
        requested: unit.fontes || [],
        deadlineAt,
        sourceCache,
        newId,
        content,
        identityPrefix: `study-unit:${unitIndex}:source-link`
      })
    };
    if (!groups.has(microsequence.id)) groups.set(microsequence.id, []);
    groups.get(microsequence.id).push(prepared);
  }
  const productionPositionById = new Map(microsequences.map((item, index) => [
    item.id,
    Number(item.productionPosition ?? item.position ?? index)
  ]));
  return {
    inventory,
    groups: [...groups.entries()].map(([microsequenceId, values]) => {
    if (new Set(values.map(({ source }) => source.posicao)).size !== values.length) {
      fail(
        "invalid_human_materialization",
        "A mesma microssequência não pode repetir a posição de uma unidade de estudo."
      );
    }
      return {
      microsequenceId,
      units: values.sort((left, right) => left.source.posicao - right.source.posicao)
      };
    }).sort((left, right) => (
      productionPositionById.get(left.microsequenceId) -
      productionPositionById.get(right.microsequenceId)
    ))
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function existingConfigurationConflict() {
  fail(
    "human_materialization_existing_configuration_conflict",
    "Esta unidade já possui outra configuração. Ajuste a configuração antes de revisar o conteúdo."
  );
}

function applyUnitContextualCalibration(design, configuration, { existing = null } = {}) {
  if (design?.parameters?.some((parameter) => parameter.conflicts?.length)) {
    fail("human_materialization_configuration_conflict", "Resolva a condição fixa e sua exceção antes de produzir.", 409);
  }
  const calibrated = structuredClone(design);
  const snapshot = existing?.designSnapshot;
  // Applying a contextual choice persists the snapshot, not an intention. Reuse
  // only that unit's valid automatic choices while its intention is still unset.
  // Both reads are revision-bound and the preflight identity includes the snapshot.
  if (snapshot?.contract === "aralearn.study-unit-design-snapshot.v2" &&
      snapshot.parameterCatalogVersion === COURSE_DESIGN_PARAMETER_CATALOG_VERSION &&
      snapshot.didacticMicrosequenceId === existing.curriculumPath?.didacticMicrosequence?.id &&
      Array.isArray(snapshot.parameters) && snapshot.parameters.length === COURSE_DESIGN_PARAMETER_DEFINITIONS.length &&
      new Set(snapshot.parameters.map(parameter => parameter?.parameterId)).size === snapshot.parameters.length) {
    for (const parameter of calibrated.parameters ?? []) {
      const effective = parameter.effectiveAssignment;
      if (effective?.mode !== "automatic" || effective.value !== null || effective.origin !== "system_default" ||
          effective.sourceScope != null || parameter.localAssignment != null) continue;
      const applied = snapshot.parameters.find(entry => entry?.parameterId === parameter.parameterId);
      const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameter.parameterId);
      if (applied?.origin !== "automatic" || !["study_unit", "course"].includes(applied.sourceScopeKind) ||
          !definition?.supportedScopes.includes(applied.sourceScopeKind)) continue;
      try {
        parameter.effectiveAssignment = { mode: "automatic",
          value: normalizeCourseDesignParameterValue(parameter.parameterId, applied.value),
          origin: "automatic", reason: boundedText(applied.reason, "A justificativa da calibração aplicada", 1_000),
          sourceScope: { kind: applied.sourceScopeKind }, inherited: applied.sourceScopeKind !== "study_unit" };
      } catch {
        // An invalid or obsolete applied value cannot fill a current calibration gap.
      }
    }
  }
  const requestedParameters = configuration === undefined ? [] : Object.entries(configuration.parametros);
  const fixedOrigins = new Set(["author", "research_condition"]);
  for (const [field, requestedValue] of requestedParameters) {
    if (requestedValue === null) continue;
    const parameterId = UNIT_PARAMETER_FIELD_TO_ID[field];
    const parameter = calibrated.parameters?.find((entry) =>
      entry.parameterId === parameterId);
    if (!parameter?.effectiveAssignment) {
      fail("course_service_unavailable", "A configuração da unidade divergiu do catálogo.", 503);
    }
    let value;
    try {
      value = normalizeCourseDesignParameterValue(parameterId, requestedValue);
    } catch (error) {
      fail(
        "invalid_human_materialization",
        error instanceof Error ? error.message : "Um parâmetro da unidade é inválido."
      );
    }
    if (existing) {
      const current = parameter.effectiveAssignment.value;
      if (current === null || current === undefined ||
          !sameJson(normalizeCourseDesignParameterValue(parameterId, current), value)) {
        existingConfigurationConflict();
      }
      continue;
    }
    if (parameter.effectiveAssignment.mode === "fixed" && fixedOrigins.has(parameter.effectiveAssignment.origin)) {
      if (!sameJson(parameter.effectiveAssignment.value, value)) {
        fail(
          "human_materialization_fixed_configuration_conflict",
          "A calibração automática da unidade não pode substituir uma condição fixada."
        );
      }
      continue;
    }
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameterId);
    parameter.effectiveAssignment = {
      mode: "automatic",
      value: structuredClone(value),
      inherited: false,
      origin: "automatic",
      reason: configuration.motivo.trim(),
      sourceScope: definition.supportedScopes.includes("study_unit")
        ? { kind: "study_unit", ref: "pending-study-unit" }
        : { kind: "course", ref: design.courseId }
    };
  }
  if (configuration?.direcaoEditorial !== undefined) {
    const guidance = boundedText(
      configuration.direcaoEditorial,
      "A direção editorial da unidade",
      4_000
    );
    const effective = Array.isArray(calibrated.guidance?.effectiveAssignments)
      ? calibrated.guidance.effectiveAssignments
      : [];
    if (existing) {
      if (!effective.some((assignment) => assignment?.guidance === guidance)) {
        existingConfigurationConflict();
      }
      return calibrated;
    }
    const fixed = effective.filter((assignment) => fixedOrigins.has(assignment?.origin));
    if (fixed.length && !fixed.some((assignment) => assignment.guidance === guidance)) {
      fail(
        "human_materialization_fixed_configuration_conflict",
        "A direção automática da unidade não pode substituir uma condição fixada."
      );
    }
    if (!fixed.length && !effective.some((assignment) =>
      assignment?.guidance === guidance)) {
      effective.push({
        guidance,
        inherited: false,
        origin: "automatic",
        reason: "Direção editorial calibrada automaticamente para esta unidade de estudo.",
        sourceScope: { kind: "study_unit", ref: "pending-study-unit" }
      });
    }
    calibrated.guidance = {
      ...(calibrated.guidance ?? {}),
      effectiveAssignments: effective
    };
  }
  for (const parameter of calibrated.parameters ?? []) {
    const effective = parameter?.effectiveAssignment;
    if (effective?.mode !== "automatic" || effective.value !== null && effective.value !== undefined) continue;
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameter.parameterId);
    if (!definition || definition.defaultValue === undefined) {
      fail("course_service_unavailable", "A configuração automática não possui valor derivável.", 503);
    }
    parameter.effectiveAssignment = {
      ...effective,
      value: normalizeCourseDesignParameterValue(parameter.parameterId, structuredClone(definition.defaultValue)),
      origin: "automatic",
      inherited: false,
      reason: "Padrão do produto aplicado à escolha delegada para esta unidade.",
      sourceScope: definition.supportedScopes.includes("study_unit")
        ? { kind: "study_unit", ref: "pending-study-unit" }
        : { kind: "course", ref: design.courseId }
    };
  }
  return calibrated;
}

function designSnapshot(design, microsequenceId) {
  const parameters = Array.isArray(design?.parameters) ? design.parameters : [];
  const directions = Array.isArray(design?.guidance?.effectiveAssignments)
    ? design.guidance.effectiveAssignments
    : [];
  const targetPlanItems = design?.targetPlanItems;
  const policy = design?.componentPolicy?.effectiveAssignment;
  if (parameters.length !== COURSE_DESIGN_PARAMETER_DEFINITIONS.length ||
      !plainObject(targetPlanItems) || !plainObject(policy)) {
    fail(
      "course_service_unavailable",
      "A configuração corrente da microssequência está incompleta.",
      503
    );
  }
  if (parameters.some((parameter) =>
    parameter?.effectiveAssignment?.value === null ||
    parameter?.effectiveAssignment?.value === undefined)) {
    fail(
      "human_materialization_contextual_calibration_required",
      "Uma unidade nova ainda está sem calibração contextual.",
      409
    );
  }
  return {
    contract: "aralearn.study-unit-design-snapshot.v2",
    parameterCatalogVersion: COURSE_DESIGN_PARAMETER_CATALOG_VERSION,
    didacticMicrosequenceId: microsequenceId,
    instructionalAnalysisUnitIds: [...targetPlanItems.instructionalAnalysisUnitIds],
    evidenceRequirementIds: [...targetPlanItems.evidenceRequirementIds],
    parameters: parameters.map((parameter) => ({
      parameterId: parameter.parameterId,
      value: structuredClone(parameter.effectiveAssignment.value),
      origin: parameter.effectiveAssignment.origin,
      reason: parameter.effectiveAssignment.reason,
      sourceScopeKind: parameter.effectiveAssignment.sourceScope?.kind ?? null
    })),
    editorialDirections: directions.map((direction) => ({
      direction: direction.guidance,
      origin: direction.origin,
      sourceScopeKind: direction.sourceScope?.kind ?? null
    })),
    componentPolicy: {
      policy: structuredClone(policy.policy),
      origin: policy.origin,
      sourceScopeKind: policy.sourceScope?.kind ?? null
    }
  };
}

function unitDesignApplication(unit) {
  return {
    mode: pedagogicalMode(unit.source),
    introducedInstructionalAnalysisUnitIds: unit.noveltyIds,
    explanationApplications: unit.explanations,
    usedInstructionalAnalysisUnitIds: unit.usedIds,
    curriculumScopeItemIds: unit.curriculumScopeItemIds,
    practiceApplications: unit.practices,
    componentRefs: componentRefs(unit.content)
  };
}

const PARAMETER_IDS = Object.freeze({
  ceiling: "new_analysis_unit_ceiling_per_expository_study_unit",
  explanationForms: "required_explanation_forms",
  practiceMinimum: "minimum_distinct_practice_opportunities_per_evidence_requirement",
  variationDimensions: "required_practice_variation_dimensions"
});

function effectiveParameter(design, parameterId) {
  const parameter = Array.isArray(design?.parameters)
    ? design.parameters.find((item) => item.parameterId === parameterId)
    : null;
  if (!plainObject(parameter?.effectiveAssignment)) {
    fail("course_service_unavailable", "A configuração pedagógica efetiva está incompleta.", 503);
  }
  if (parameter.effectiveAssignment.mode === "automatic" && parameter.effectiveAssignment.value === null) {
    fail(
      "human_materialization_contextual_calibration_required",
      "Uma unidade nova ainda está sem calibração contextual.",
      409
    );
  }
  return parameter.effectiveAssignment.value;
}

function validateComponentPolicy(componentRefsValue, policy) {
  const componentRefsSet = new Set(componentRefsValue);
  const excluded = new Set(policy.excludedRefs || []);
  const allowed = new Set(policy.allowedRefs || []);
  if ([...componentRefsSet].some((ref) => excluded.has(ref) ||
      policy.availability === "allow_only" && !allowed.has(ref))) {
    fail(
      "human_materialization_component_policy_violation",
      "Uma unidade de estudo usa um componente fora da política efetiva."
    );
  }
}

function curriculumMicrosequenceOrder(plan) {
  const result = new Map();
  const body = plainObject(plan?.plan) ? plan.plan : plan;
  const modules = Array.isArray(body?.curriculum?.modules) ? body.curriculum.modules : [];
  for (const moduleValue of modules) {
    const lessons = Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [];
    for (const lesson of lessons) {
      const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
      for (const microsequence of microsequences) {
        if (typeof microsequence?.id !== "string" || !microsequence.id ||
            result.has(microsequence.id)) {
          fail("course_service_unavailable", "A ordem curricular das microssequências é inválida.", 503);
        }
        result.set(microsequence.id, result.size);
      }
    }
  }
  return result;
}

function plannedCurriculumScopeIds(plan, microsequenceId) {
  return planItems(plan, "curriculumScopeItems")
    .filter((item) => Array.isArray(item?.curriculumTargets) &&
      item.curriculumTargets.some((target) =>
        Array.isArray(target?.didacticMicrosequenceIds) &&
        target.didacticMicrosequenceIds.includes(microsequenceId)))
    .map(({ id }) => id);
}

function establishedAnalysisUnitIds(
  plan,
  replacedStudyUnitIds,
  beforeMicrosequence,
  curriculumOrder
) {
  return new Set(planItems(plan, "instructionalAnalysisUnits")
    .filter((item) => {
      const introducedAt = item?.introducedAt;
      const studyUnitId = introducedAt?.studyUnitId;
      if (!(typeof item?.id === "string" && item.id &&
        plainObject(introducedAt) && typeof studyUnitId === "string" && studyUnitId &&
        !replacedStudyUnitIds.has(studyUnitId))) return false;
      const introductionOrder = curriculumOrder.get(introducedAt.didacticMicrosequenceId);
      if (!Number.isSafeInteger(introductionOrder)) {
        fail("course_service_unavailable", "A introdução de uma ideia não pertence ao mapa curricular.", 503);
      }
      return introductionOrder < beforeMicrosequence;
    })
    .map(({ id }) => id));
}

function introducedAnalysisUnitIds(plan, replacedStudyUnitIds) {
  return new Set(planItems(plan, "instructionalAnalysisUnits")
    .filter((item) => typeof item?.id === "string" && item.id &&
      plainObject(item?.introducedAt) &&
      typeof item.introducedAt.studyUnitId === "string" &&
      item.introducedAt.studyUnitId &&
      !replacedStudyUnitIds.has(item.introducedAt.studyUnitId))
    .map(({ id }) => id));
}

function validatePreservedAnalysisReferences(groups, plan, replacedStudyUnitIds, curriculumOrder, diagnostics, { complete = true } = {}) {
  const introductions = new Map();
  const activeAnalysisIds = new Set(groups.flatMap(group => group.units.flatMap(unit => [
    ...unit.noveltyIds, ...unit.usedIds,
    ...unit.explanations.map(entry => entry.instructionalAnalysisUnitId)
  ])));
  for (const item of planItems(plan, "instructionalAnalysisUnits")) {
    if (item.introducedAt && !replacedStudyUnitIds.has(item.introducedAt.studyUnitId)) {
      introductions.set(item.id, curriculumOrder.get(item.introducedAt.didacticMicrosequenceId));
    }
  }
  for (const group of groups) {
    for (const unit of group.units) {
      for (const id of unit.noveltyIds) introductions.set(id, curriculumOrder.get(group.microsequenceId));
    }
  }
  const microsequenceTitles = new Map((plan?.plan?.curriculum?.modules ?? []).flatMap(module =>
    (module.lessons ?? []).flatMap(lesson => (lesson.microsequences ?? []).map(micro => [micro.id, micro.title]))));
  for (const item of planItems(plan, "instructionalAnalysisUnits")) {
    const introducedInTarget = replacedStudyUnitIds.has(item.introducedAt?.studyUnitId);
    const referencedByTarget = [...(item.usedBy ?? []), ...(item.revisitedBy ?? [])]
      .some(reference => replacedStudyUnitIds.has(reference.studyUnitId));
    if (!activeAnalysisIds.has(item.id) && !introducedInTarget && !referencedByTarget) continue;
    for (const [field, code] of [["usedBy", "human_materialization_use_before_introduction"],
      ["revisitedBy", "human_materialization_explanation_before_introduction"]]) {
      for (const reference of item[field] ?? []) {
        // Units in this Part are already checked in their final accumulated order.
        if (replacedStudyUnitIds.has(reference.studyUnitId)) continue;
        const introductionOrder = introductions.get(item.id);
        const referenceOrder = curriculumOrder.get(reference.didacticMicrosequenceId);
        if (Number.isSafeInteger(introductionOrder) && Number.isSafeInteger(referenceOrder) &&
            introductionOrder <= referenceOrder) continue;
        const message = `A unidade preservada “${reference.title}” depende da ideia “${item.statement}”, ` +
          "mas sua introdução anterior não está registrada. Releia o conteúdo e registre a aplicação pedagógica antes de continuar.";
        if (!diagnostics) fail(code, message);
        diagnostics.push({ code, message, idea: item.statement, studyUnit: reference.title,
          microsequence: microsequenceTitles.get(reference.didacticMicrosequenceId) });
      }
    }
  }
}

function orderedPlanItemIds(items, requestedIds) {
  const requested = new Set(requestedIds);
  const ordered = items
    .filter((item) => requested.has(item?.id))
    .sort((left, right) => Number(left.position) - Number(right.position))
    .map(({ id }) => id);
  if (ordered.length !== requested.size) {
    fail("course_service_unavailable", "O repertório focal divergiu do planejamento.", 503);
  }
  return ordered;
}

function validatePedagogicalGroup(
  group,
  establishedAnalysis,
  introducedAnywhere,
  analysisLabels, diagnostics = null, { complete = true } = {}
) {
  const report = (code, message, status) => {
    if (!diagnostics) fail(code, message, status);
    diagnostics.push({ code, message });
  };
  const firstDesign = group.units[0]?.design;
  const targets = firstDesign?.targetPlanItems;
  if (!plainObject(targets)) {
    report("course_service_unavailable", "O recorte pedagógico corrente está incompleto.", 503);
    return;
  }
  const targetAnalysis = new Set(targets.instructionalAnalysisUnitIds || []);
  const targetEvidence = new Set(targets.evidenceRequirementIds || []);

  const representedAnalysis = new Set();
  const introducedInGroup = new Set();
  const developedByAnalysis = new Map([...targetAnalysis].map((id) => [id, new Set()]));
  const notApplicableByAnalysis = new Map([...targetAnalysis].map((id) => [id, new Set()]));
  const requiredFormsByAnalysis = new Map();
  const practiceByEvidence = new Map([...targetEvidence].map((id) => [id, {
    opportunities: new Set(),
    operation: null,
    dimensions: new Set(),
    minimum: 1,
    requiredDimensions: new Set()
  }]));

  for (const unit of group.units) {
    const design = unit.design;
    const policy = design?.componentPolicy?.effectiveAssignment?.policy;
    const unitTargets = design?.targetPlanItems;
    const parameter = id => { try { return effectiveParameter(design, id); }
      catch (error) { report(error.code, error.message, error.status); return undefined; } };
    const ceiling = parameter(PARAMETER_IDS.ceiling);
    const requiredForms = parameter(PARAMETER_IDS.explanationForms);
    const practiceMinimum = parameter(PARAMETER_IDS.practiceMinimum);
    const requiredDimensions = parameter(PARAMETER_IDS.variationDimensions);
    if (!plainObject(policy) || !plainObject(unitTargets) ||
        JSON.stringify(unitTargets.instructionalAnalysisUnitIds || []) !==
          JSON.stringify([...targetAnalysis]) ||
        JSON.stringify(unitTargets.evidenceRequirementIds || []) !==
          JSON.stringify([...targetEvidence]) ||
        !Number.isSafeInteger(ceiling) || ceiling < 1 ||
        !Array.isArray(requiredForms) || !Number.isSafeInteger(practiceMinimum) ||
        practiceMinimum < 1 || !Array.isArray(requiredDimensions)) {
      report("course_service_unavailable", "Os parâmetros efetivos essenciais são inválidos.", 503);
      continue;
    }
    const mode = pedagogicalMode(unit.source);
    const noveltySet = new Set(unit.noveltyIds);
    const usedSet = new Set(unit.usedIds);
    const explanationIds = unit.explanations.map((entry) =>
      entry.instructionalAnalysisUnitId);
    const explanationSet = new Set(explanationIds);
    if (new Set(unit.noveltyIds).size !== unit.noveltyIds.length ||
        usedSet.size !== unit.usedIds.length ||
        explanationSet.size !== unit.explanations.length) {
      report("invalid_human_materialization", "Uma unidade repete ideia introduzida, usada ou explicada.");
    }
    if ([...usedSet].some((id) => noveltySet.has(id) || explanationSet.has(id))) {
      report(
        "invalid_human_materialization",
        "Uma ideia usada sem reexplicação não pode ser também introduzida ou retomada na mesma unidade."
      );
    }
    if (unit.noveltyIds.some((id) => !targetAnalysis.has(id)) ||
        unit.usedIds.some((id) => !targetAnalysis.has(id)) ||
        unit.explanations.some(({ instructionalAnalysisUnitId }) =>
          !targetAnalysis.has(instructionalAnalysisUnitId)) ||
        unit.practices.some(({ evidenceRequirementId }) =>
          !targetEvidence.has(evidenceRequirementId))) {
      report(
        "human_materialization_outside_plan",
        "A aplicação pedagógica referencia uma ideia fora do repertório da microssequência."
      );
    }
    if (["expository", "mixed"].includes(mode) && unit.noveltyIds.length > ceiling) {
      report(
        "human_materialization_analysis_unit_ceiling_exceeded",
        `A unidade de estudo ${unit.source.posicao} excede o teto de novidades.`
      );
    }
    if (mode === "practice" && (unit.noveltyIds.length || unit.explanations.length) ||
        mode === "expository" && unit.practices.length > 0 ||
        mode === "mixed" && (unit.explanations.length === 0 || unit.practices.length === 0)) {
      report(
        "human_materialization_mode_mismatch",
        "A função didática da unidade não corresponde ao conteúdo e às aplicações informadas."
      );
    }

    const knownBeforeUnit = new Set(establishedAnalysis);
    for (const id of unit.usedIds) {
      if (!knownBeforeUnit.has(id)) {
        report(
          "human_materialization_use_before_introduction",
          "Uma unidade usa uma ideia antes que ela tenha sido estabelecida no percurso."
        );
      }
    }
    for (const id of unit.noveltyIds) {
      if (introducedAnywhere.has(id)) {
        report("human_materialization_duplicate_introduction", "Uma ideia foi introduzida mais de uma vez.");
      }
      if (!explanationSet.has(id)) {
        report(
          "human_materialization_incomplete_analysis_inventory",
          "Toda ideia nova precisa ser explicada na unidade em que é introduzida."
        );
      }
      introducedInGroup.add(id);
      requiredFormsByAnalysis.set(id, new Set(requiredForms));
    }
    for (const explanation of unit.explanations) {
      const id = explanation.instructionalAnalysisUnitId;
      if (!noveltySet.has(id) && !knownBeforeUnit.has(id)) {
        report(
          "human_materialization_explanation_before_introduction",
          "Uma explicação retoma uma ideia antes que ela tenha sido estabelecida no percurso."
        );
      }
      const developed = developedByAnalysis.get(id) ?? new Set();
      const notApplicable = notApplicableByAnalysis.get(id) ?? new Set();
      for (const form of explanation.developedForms) {
        if (notApplicable.has(form)) {
          report("human_materialization_explanation_form_conflict", "Uma forma foi aplicada e marcada como não aplicável.");
        }
        developed.add(form);
      }
      for (const { form } of explanation.notApplicable) {
        if (developed.has(form)) {
          report("human_materialization_explanation_form_conflict", "Uma forma foi aplicada e marcada como não aplicável.");
        }
        notApplicable.add(form);
      }
    }
    unit.noveltyIds.forEach((id) => {
      establishedAnalysis.add(id);
      introducedAnywhere.add(id);
    });
    unit.noveltyIds.forEach((id) => representedAnalysis.add(id));
    unit.usedIds.forEach((id) => representedAnalysis.add(id));
    explanationIds.forEach((id) => representedAnalysis.add(id));
    for (const practice of unit.practices) {
      const state = practiceByEvidence.get(practice.evidenceRequirementId);
      if (!state) continue;
      state.minimum = Math.max(state.minimum, practiceMinimum);
      requiredDimensions.forEach((dimension) => state.requiredDimensions.add(dimension));
      if (state.opportunities.has(practice.opportunityId)) {
        report("human_materialization_duplicate_practice", "Uma oportunidade de prática foi repetida.");
      }
      state.opportunities.add(practice.opportunityId);
      if (state.operation !== null && state.operation !== practice.invariantTaskOperation) {
        report("human_materialization_practice_operation_changed", "A operação-alvo mudou entre práticas do mesmo requisito.");
      }
      state.operation = practice.invariantTaskOperation;
      practice.variedDimensions.forEach((dimension) => state.dimensions.add(dimension));
    }
    try { validateComponentPolicy(unit.componentRefs ?? componentRefs(unit.content), policy); }
    catch (error) { report(error.code, error.message, error.status); }
  }

  if (!complete) return;
  if ([...targetAnalysis].some((id) => !representedAnalysis.has(id))) {
    report(
      "human_materialization_incomplete_analysis_inventory",
      "Toda ideia focal da microssequência precisa aparecer como introdução, uso ou retomada."
    );
  }
  for (const id of introducedInGroup) {
    const covered = new Set([
      ...(developedByAnalysis.get(id) ?? []),
      ...(notApplicableByAnalysis.get(id) ?? [])
    ]);
    const missing = [...(requiredFormsByAnalysis.get(id) || [])]
      .filter((form) => !covered.has(form));
    if (missing.length) {
      const idea = analysisLabels.get(id) || "ideia nova";
      const forms = missing.map((form) => EXPLANATION_FORM_LABELS[form] || form)
        .join(", ");
      report(
        "human_materialization_missing_explanation_form",
        `A ideia “${idea}” ainda precisa destas formas: ${forms}. Desenvolva-as ou justifique as que não se aplicam.`
      );
    }
  }
  for (const state of practiceByEvidence.values()) {
    if (state.opportunities.size < state.minimum ||
        [...state.requiredDimensions].some((dimension) => !state.dimensions.has(dimension))) {
      report(
        "human_materialization_insufficient_practice",
        "A prática não cumpre o mínimo ou as dimensões de variação efetivas."
      );
    }
  }
}

function validatePedagogicalPart(groups, plan, replacedStudyUnitIds, diagnostics = null, options = {}) {
  const curriculumOrder = curriculumMicrosequenceOrder(plan);
  validatePreservedAnalysisReferences(groups, plan, replacedStudyUnitIds, curriculumOrder, diagnostics, options);
  const orderedGroups = [...groups].map((group) => {
    const order = curriculumOrder.get(group.microsequenceId);
    if (!Number.isSafeInteger(order)) {
      fail("course_service_unavailable", "Uma microssequência da parte não pertence ao mapa curricular.", 503);
    }
    return { group, order };
  }).sort((left, right) => left.order - right.order);
  const establishedAnalysis = new Set();
  const introducedAnywhere = introducedAnalysisUnitIds(plan, replacedStudyUnitIds);
  const analysisLabels = new Map(planItems(plan, "instructionalAnalysisUnits")
    .map((item) => [item.id, item.statement]));
  for (const { group, order } of orderedGroups) {
    for (const id of establishedAnalysisUnitIds(
      plan,
      replacedStudyUnitIds,
      order,
      curriculumOrder
    )) establishedAnalysis.add(id);
    validatePedagogicalGroup(
      group,
      establishedAnalysis,
      introducedAnywhere,
      analysisLabels, diagnostics, options
    );
    const coveredScopeIds = new Set(group.units.flatMap((unit) =>
      unit.curriculumScopeItemIds));
    if (options.complete !== false && plannedCurriculumScopeIds(plan, group.microsequenceId)
      .some((id) => !coveredScopeIds.has(id))) {
      const message = "A microssequência precisa desenvolver os itens de escopo que o mapa curricular atribuiu a ela.";
      if (!diagnostics) fail("human_materialization_incomplete_scope_coverage", message);
      diagnostics.push({ code: "human_materialization_incomplete_scope_coverage", message });
    }
  }
}

async function prepareExplanations({ explanations, adapter, principal, context, deadlineAt, newId, includeSaved = true }) {
  const microsequences = partMicrosequences(context.part);
  explanations ??= [];
  if (!Array.isArray(explanations) || explanations.length > microsequences.length) {
    fail("human_materialization_missing_explanation", "Informe somente as explicações que deseja produzir ou alterar nesta parte.");
  }
  const seen = new Set();
  const prepared = [];
  const saved = (context.plan?.plan?.curriculum?.modules ?? []).flatMap(module =>
    (module.lessons ?? []).flatMap(lesson => lesson.microsequences ?? []));
  for (const [index, entry] of explanations.entries()) {
    if (!plainObject(entry) || !Array.isArray(entry.fontes) || Object.keys(entry).some((key) =>
      !["microssequencia", "conteudo", "fontes", "reconciliacao"].includes(key))) {
      fail("invalid_human_explanation", "A explicação precisa indicar microssequência, conteúdo e fontes utilizadas.");
    }
    const microsequence = resolveReference(microsequences, entry.microssequencia, {
      position: (item) => item.productionPosition ?? item.position,
      texts: (item) => [item.title], label: "microssequência da explicação"
    });
    if (seen.has(microsequence.id)) fail("invalid_human_explanation", "A parte repete a explicação de uma microssequência.");
    seen.add(microsequence.id);
    let content;
    try { content = await reconcileHumanExplanation(entry.conteudo, entry.reconciliacao, context); }
    catch (error) { fail("invalid_human_explanation", error.message); }
    const persistedSupport = saved.find(item => (item.id ?? item.microsequenceId) === microsequence.id)?.explanation ?? null;
    if (entry.reconciliacao === undefined && persistedSupport?.reconciliation &&
        canonicalAuthoringValue({ title: content.title, content: content.content }) ===
        canonicalAuthoringValue({ title: persistedSupport.title, content: persistedSupport.content })) {
      content.reconciliation = structuredClone(persistedSupport.reconciliation);
    }
    if (entry.fontes.some((link) => !plainObject(link) ||
      link.ocorrencias !== undefined && (!Array.isArray(link.ocorrencias) ||
        link.ocorrencias.some((occurrence) => !plainObject(occurrence) || occurrence.lugar !== "conteudo")))) {
      fail("invalid_human_explanation", "A fonte da explicação deve apontar ao seu conteúdo, sem resposta ou feedback de uma unidade.");
    }
    const sourceLinks = await resolveHumanSourceLinks({ adapter, principal, courseContext: context,
      requested: entry.fontes ?? [], deadlineAt, newId, content, identityPrefix: `explanation:${index}` });
    prepared.push({ microsequenceId: microsequence.id, content, sourceLinks });
  }
  if (!includeSaved) return prepared;
  for (const microsequence of microsequences.filter(item => !seen.has(item.id))) {
    const persisted = saved.find(item => (item.id ?? item.microsequenceId) === microsequence.id) ?? microsequence;
    if (!persisted.explanation) {
      fail("human_materialization_missing_explanation", `Salve a explicação de “${microsequence.title}” antes de produzir suas unidades, ou inclua-a neste pedido.`);
    }
    const content = normalizeMicrosequenceExplanation(persisted.explanation);
    const sources = await adapter.getCourseSources({ principal, courseId: context.course.id,
      expectedRevision: context.course.revision, mode: "target", sourceId: null,
      targetKind: "microsequence_explanation", targetId: microsequence.id, cursor: null, limit: 1, deadlineAt });
    if (!Array.isArray(sources?.items) || sources.items.length !== 1) {
      fail("course_service_unavailable", "As fontes da base salva não puderam ser relidas.", 503);
    }
    prepared.push({ microsequenceId: microsequence.id, content,
      sourceLinks: normalizeCourseSourceLinks(sources.items[0].sourceLinks ?? []) });
  }
  return prepared;
}

export async function materializeHumanCoursePart({
  adapter,
  principal,
  course,
  part,
  units,
  explanations,
  preparationReference = null,
  complete = false,
  deadlineAt = null
}) {
  validateUnits(units);
  let producedPartPosition = null;
  let producedContentTarget = null;
  let practiceObservations = [];
  const receipt = await executeTrustedCourseWrite({
    load: () => resolveHumanCourseContext({
      adapter,
      principal,
      course,
      part,
      deadlineAt
    }),
    async build(context, { newId }) {
      producedPartPosition = Number(context.part.position) + 1;
      const preflight = await preflightHumanCourseMaterialization({ adapter, principal, context,
        planUnits: units.map(humanMaterializationUnitPlan), explanations, complete, deadlineAt });
      if (preparationReference && preflight.referencia !== preparationReference) {
        throw new AuthoringApiError(409, "human_materialization_preflight_stale",
          "A base ou as intenções mudaram depois do preparo; releia o preflight antes de escrever.", { preflight });
      }
      if (preflight.state !== "ready") {
        throw new AuthoringApiError(422, "human_materialization_preflight_blocked",
          "Resolva os bloqueios agregados de preparar_materializacao antes de materializar.", { preflight });
      }
      const prepared = await prepareUnits({
        adapter,
        principal,
        context,
        units,
        deadlineAt,
        newId
      });
      const groups = prepared.groups;
      const existingBySlot = await listExistingPartStudyUnits({ adapter, principal, context, deadlineAt });
      const arrangement = arrangeMaterializationUnits(existingBySlot, units, partMicrosequences(context.part));
      const targetDesigns = new Map(await Promise.all(partMicrosequences(context.part).map(async micro => [micro.id,
        await adapter.getCourseDesign({ principal, courseId: context.course.id, scopeKind: "didactic_microsequence",
          scopeRef: micro.id, childLimit: 1, childCursor: null, deadlineAt })])));
      for (const group of groups) for (const unit of group.units) {
        const existing = arrangement.planned.get(unit.inputIndex).existing;
        const design = existing ? await adapter.getCourseDesign({ principal, courseId: context.course.id,
          scopeKind: "study_unit", scopeRef: existing.studyUnitId, childLimit: 1, childCursor: null, deadlineAt })
          : targetDesigns.get(group.microsequenceId);
        unit.design = applyUnitContextualCalibration(design, unit.source.configuracao, { existing: existing?.item });
      }
      // Repertoire and memberships are prerequisites, never invented by a write.
      const targetPlanItems = [...targetDesigns].map(([didacticMicrosequenceId, design]) => ({ didacticMicrosequenceId,
        instructionalAnalysisUnitIds: orderedPlanItemIds(planItems(context.plan, "instructionalAnalysisUnits"), design.targetPlanItems.instructionalAnalysisUnitIds),
        evidenceRequirementIds: orderedPlanItemIds(planItems(context.plan, "evidenceRequirements"), design.targetPlanItems.evidenceRequirementIds) }));
      practiceObservations = groups.map((group, index) => ({
        microssequencia: index + 1,
        observacao: observeCoursePracticeDistribution(group.units.map((unit) => ({
          studyUnitRef: String(unit.inputIndex), position: unit.source.posicao,
          mode: pedagogicalMode(unit.source)
        })))
      }));
      const preparedExplanations = await prepareExplanations({ explanations, adapter, principal,
        context, deadlineAt, newId, includeSaved: false });
      const preparedUnits = [];
      for (const group of groups) {
        for (const unit of group.units) {
          const existing = arrangement.planned.get(unit.inputIndex).existing;
          preparedUnits.push({
            inputIndex: unit.inputIndex,
            studyUnitId: existing?.studyUnitId ??
              await newId(`study-unit:${unit.inputIndex}`),
            position: unit.source.posicao,
            didacticMicrosequenceId: group.microsequenceId,
            content: structuredClone(unit.content),
            designSnapshot: designSnapshot(unit.design, group.microsequenceId),
            designApplication: unitDesignApplication(unit),
            sourceLinks: structuredClone(unit.sourceLinks)
          });
        }
      }
      preparedUnits.sort((left, right) => left.inputIndex - right.inputIndex);
      producedContentTarget = { courseId: context.course.id, partId: context.part.id };
      const placements = [...arrangement.retained.map(value => ({ studyUnitId: value.existing.studyUnitId, didacticMicrosequenceId: value.microsequenceId, position: value.position })),
        ...preparedUnits.map(({ studyUnitId, didacticMicrosequenceId, position }) => ({ studyUnitId, didacticMicrosequenceId, position }))];
      return {
        principal,
        courseId: context.course.id,
        authoringPartId: context.part.id,
        expectedCourseRevision: context.course.revision,
        expectedAuthoringPartVersion: context.part.version,
        planItemUpserts: prepared.inventory.upserts,
        placements, complete,
        targetPlanItems,
        explanations: preparedExplanations,
        units: preparedUnits.map((entry) => {
          const unit = { ...entry };
          delete unit.inputIndex;
          return unit;
        }),
        deadlineAt
      };
    },
    commit: (request) => adapter.materializeCourseAuthoringPart(request)
  });
  return {
    result: complete ? (producedPartPosition === 1 ? "Primeira parte produzida." : `Parte ${producedPartPosition} produzida.`)
      : "Fragmento salvo; a parte permanece em produção.",
    ...buildHumanNavigationEnvelope(producedContentTarget ? createHumanNavigation(adapter, {
      courseId: producedContentTarget.courseId, relation: "content", target: { kind: "authoring_part", id: producedContentTarget.partId }
    }) : null, [], { nextDecision: complete ? "Inspecione o percurso salvo e registre as decisões de revisão humana."
      : "Continue o lote autorizado; a conclusão conferirá a cobertura acumulada da parte." }),
    context: { distribuicaoDaPratica: practiceObservations, completion: complete ? "complete" : "partial",
      cursoRevision: receipt.courseRevision }
  };
}
