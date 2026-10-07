import { AuthoringApiError } from "./errors.js";
import { COURSE_AUTHORING_CALIBRATION_RECOVERY } from "./courseKnowledge.js";
import {
  executeTrustedCourseWrite,
  resolveHumanCourseContext
} from "./courseHumanTaskExecutor.js";
import { validateCourseEntityContent } from
  "../aralearn/runtime/domain/courseEntities.js";
import { observeCoursePracticeDistribution } from
  "../aralearn/runtime/domain/coursePracticeDistribution.js";
import { normalizeCourseSourceLinks, requireCourseSourceEvidence } from "../aralearn/runtime/domain/courseSources.js";
import { normalizeCourseSourceOccurrence, listCourseSourceOccurrenceTargets, locateCourseSourceOccurrenceTargets }
  from "../aralearn/runtime/domain/courseSourceOccurrences.js";
import { normalizeMicrosequenceExplanation } from "../aralearn/runtime/domain/courseExplanation.js";
import { requireCoursePracticeAuthoring } from "../aralearn/runtime/domain/coursePracticeAuthoring.js";
import { inspectBpmnAuthoring, requireBpmnAuthoring } from "../aralearn/runtime/resources/packages/bpmn-process/semantics.js";
import { inspectPedagogicalEvidence } from "../aralearn/runtime/domain/coursePedagogicalAudit.js";
import { inspectCourseAudioReadiness, normalizeCourseMediaRead } from "../aralearn/runtime/domain/courseMedia.js";
import { canonicalReconciliationLocator, explanationReconciliationTargets, inspectExplanationReconciliation,
  locateExplanationPassage, normalizeExplanationReconciliation, RECONCILIATION_PASSAGE_LIMIT,
  RECONCILIATION_PASSAGE_TEXT_LIMIT }
  from "../aralearn/runtime/domain/courseExplanationReconciliation.js";
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
const PRACTICE_VARIATION_DIMENSION_LABELS = Object.freeze(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) =>
    id === "required_practice_variation_dimensions")?.optionLabels ?? {}
);
export const HUMAN_SOURCE_ROLES = Object.freeze({
  escopo_curricular: "curricular_scope", evidencia_de_avaliacao: "assessment_evidence",
  tecnica_conceitual: "technical_conceptual", leitura_complementar: "recommended_reading"
});

// A Explicação só aceita ocorrência no próprio conteúdo; o autor informa o alvo
// semântico (lugar, recurso e trecho literal) e nunca o nome interno da folha.
export const EXPLANATION_SOURCE_OCCURRENCE_OPTIONS = Object.freeze({ targetKind: "microsequence_explanation" });

export function resolveHumanSourceRoles(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.length > 4 || (!allowEmpty && value.length === 0) ||
      value.some((role) => !Object.hasOwn(HUMAN_SOURCE_ROLES, role)) || new Set(value).size !== value.length) {
    fail("invalid_human_source_roles", "Informe explicitamente os papéis de uso da fonte, sem repetições.");
  }
  return value.map((role) => HUMAN_SOURCE_ROLES[role]);
}

// O autor declara o alvo semântico (lugar, recurso e trecho literal) e o servidor
// resolve a folha exata no registro de folhas do componente. Uma correspondência
// única localiza a citação; ausência volta como pendência, pluralidade volta como
// decisão humana (alvo por posição ou rótulo público) e repetição dentro da mesma
// folha exige prefixo e sufixo. Nada é gravado sem resolução única.
const SOURCE_OCCURRENCE_ALVO_LIMIT = 300;
const SOURCE_OCCURRENCE_PART_LIST_LIMIT = 12;

const occurrencePartName = label => String(label || "").replace(/^Editar\s+/u, "");

// Candidatos numerados com rótulo humano e texto: dado suficiente para escolher sem
// adivinhar o nome interno da folha, que nunca é exposto.
function occurrencePartCandidates(located) {
  return located.slice(0, 8).map((candidate, index) =>
    `${index + 1}. ${occurrencePartName(candidate.label)} — ${candidate.text.slice(0, 300)}`);
}

function occurrencePartRoute(located) {
  const listed = located.slice(0, SOURCE_OCCURRENCE_PART_LIST_LIMIT)
    .map((candidate, index) => `${index + 1}. ${occurrencePartName(candidate.label)}`).join("; ");
  return located.length > SOURCE_OCCURRENCE_PART_LIST_LIMIT
    ? `${listed}; e mais ${located.length - SOURCE_OCCURRENCE_PART_LIST_LIMIT} partes, escolhíveis pelo rótulo público`
    : listed;
}

function selectLocatedPart(located, alvo) {
  if (Number.isSafeInteger(alvo)) return alvo >= 1 && alvo <= located.length ? [located[alvo - 1]] : [];
  if (typeof alvo !== "string") return [];
  const wanted = normalizedText(alvo);
  if (!wanted) return [];
  return located.filter((candidate) => normalizedText(candidate.label) === wanted ||
    normalizedText(occurrencePartName(candidate.label)) === wanted);
}

export async function resolveHumanSourceOccurrences({ requested = [], content, newId, identityPrefix,
  options = {} }) {
  if (!Array.isArray(requested) || requested.length > 16) fail("invalid_human_source_occurrence", "Informe até 16 ocorrências.");
  const slots = { conteudo: "content", resposta: "response", feedback: "feedback" };
  const fields = new Set(["lugar", "recurso", "trecho", "prefixo", "sufixo", "alvo"]);
  const targets = listCourseSourceOccurrenceTargets(content, options);
  const occurrences = [];
  const blockers = [];
  for (const [index, entry] of requested.entries()) {
    if (!plainObject(entry) || Object.keys(entry).some((key) => !fields.has(key)) ||
        !Object.hasOwn(slots, entry.lugar) || !Number.isSafeInteger(entry.recurso) || entry.recurso < 1 ||
        typeof entry.trecho !== "string" || !entry.trecho.length ||
        [entry.prefixo, entry.sufixo].some((value) => value !== undefined && value !== null && typeof value !== "string") ||
        entry.alvo !== undefined && !(Number.isSafeInteger(entry.alvo) && entry.alvo >= 1) &&
          !(typeof entry.alvo === "string" && entry.alvo.trim().length > 0 &&
            entry.alvo.length <= SOURCE_OCCURRENCE_ALVO_LIMIT)) {
      fail("invalid_human_source_occurrence",
        "Informe o lugar, a posição do recurso e o trecho literal da ocorrência, com prefixo e sufixo textuais; o alvo aceita a posição ou o rótulo público da parte.");
    }
    const slot = slots[entry.lugar];
    const instances = slot === "response" ? (content?.response ? [content.response] : []) : content?.[slot];
    const resource = Array.isArray(instances) ? instances[entry.recurso - 1] : null;
    if (!resource?.id) fail("human_reference_not_found", "O recurso da ocorrência não foi localizado.", 404);
    const prefix = entry.prefixo ?? null;
    const suffix = entry.sufixo ?? null;
    const located = locateCourseSourceOccurrenceTargets(targets, { slot, resourceId: resource.id,
      quote: entry.trecho, prefix, suffix });
    const blocker = (code, message, extra = {}) => ({ code, message, entry: index + 1,
      resourceId: String(resource.id), ...extra });
    if (located.length === 0) {
      blockers.push(blocker("source_occurrence_not_located",
        "O trecho literal não foi localizado no recurso indicado; confira o recurso e o trecho literal."));
      continue;
    }
    if (located.length === 1 && located[0].matches > 1) {
      blockers.push(blocker("source_occurrence_repeated_in_part",
        "O trecho repete dentro de uma única parte do recurso; informe prefixo e sufixo para distinguir a ocorrência."));
      continue;
    }
    let selected = null;
    if (located.length > 1 || entry.alvo !== undefined) {
      const informed = entry.alvo !== undefined;
      const chosen = selectLocatedPart(located, informed ? entry.alvo : null);
      if (chosen.length !== 1) {
        const needsChoice = chosen.length > 1 || !informed;
        blockers.push(blocker(needsChoice ? "ambiguous_source_occurrence" : "source_occurrence_part_not_found",
          chosen.length > 1
            ? "Mais de uma parte do recurso tem o rótulo informado; escolha pela posição da lista ou por um rótulo que identifique uma única parte."
            : !informed
              ? `O trecho aparece em ${located.length} partes do recurso; informe alvo pela posição ou pelo rótulo público da parte (${occurrencePartRoute(located)}).`
              : `O alvo informado não identifica uma parte do trecho; use a posição ou o rótulo público (${occurrencePartRoute(located)}).`,
          { candidates: occurrencePartCandidates(located) }));
        continue;
      }
      if (chosen[0].matches > 1) {
        blockers.push(blocker("source_occurrence_repeated_in_part",
          "O trecho repete dentro da parte escolhida; informe prefixo e sufixo para distinguir a ocorrência."));
        continue;
      }
      selected = chosen[0];
    }
    const path = selected ? selected.path : located[0].path;
    occurrences.push(normalizeCourseSourceOccurrence({
      occurrenceId: await newId(`${identityPrefix}:occurrence:${index}`),
      slot, resourceId: resource.id, path, quote: entry.trecho, prefix, suffix }));
  }
  if (blockers.length) fail("invalid_human_source_occurrence",
    "Uma ou mais ocorrências não correspondem ao conteúdo salvo; nenhuma citação foi gravada.", 422, { blockers });
  return occurrences;
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

function fail(code, message, status = 422, details = undefined) {
  throw new AuthoringApiError(status, code, message, details);
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

export async function listExistingPartStudyUnits({ adapter, principal, context, deadlineAt }) {
  const bySlot = new Map();
  const seenIds = new Set();
  // A Parte persistida é lida pelo próprio agrupamento. A Parte técnica derivada
  // ainda não existe no banco e o leitor real recusa "authoring_part" sem
  // identidade; ela é lida pelas Microssequências reais do recorte, o que também
  // preserva unidades já existentes dessas Microssequências ainda sem Parte.
  const persistedPartId = typeof context.part?.id === "string" && context.part.id ? context.part.id : null;
  const scopes = persistedPartId
    ? [{ scopeKind: "authoring_part", scopeId: persistedPartId }]
    : partMicrosequences(context.part)
      .filter(micro => typeof micro?.id === "string" && micro.id)
      .map(micro => ({ scopeKind: "didactic_microsequence", scopeId: micro.id }));
  if (!scopes.length) {
    fail("course_service_unavailable", "A parte técnica não possui microssequência para conferir as unidades existentes.", 503);
  }
  for (const scope of scopes) {
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
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
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
      if (page.hasMore !== true) { cursorStudyUnitId = null; break; }
      const next = page.nextCursor?.studyUnitId;
      if (typeof next !== "string" || !next) {
        fail("course_service_unavailable", "A paginação da parte perdeu o ponto de retomada.", 503);
      }
      cursorStudyUnitId = next;
    }
    if (cursorStudyUnitId !== null) {
      fail("course_service_unavailable", "A parte excedeu o limite seguro de paginação.", 503);
    }
  }
  return bySlot;
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
  options = {},
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
        options, identityPrefix: `${identityPrefix}:${index}` }),
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

function persistedPedagogicalUnit(item, microsequence, position, design, plan) {
  const application = item.designApplication ?? {};
  const recordedIntroductions = planItems(plan, "instructionalAnalysisUnits")
    .filter(idea => idea.introducedAt?.studyUnitId === item.studyUnit.id).map(idea => idea.id);
  return { source: { posicao: position, conteudo: item.studyUnit,
      aplicacaoPedagogica: { explicacoes: application.explanationApplications ?? [] } },
    inputIndex: `saved:${item.studyUnit.id}`, preserved: true, microsequence, content: item.studyUnit, design,
    noveltyIds: application.introducedInstructionalAnalysisUnitIds ?? recordedIntroductions,
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

// The declaration names the passage; the server derives the literal locator.
// A whole-leaf classification needs no artificial decomposition, and long
// leaves are sliced by the server, never by the author.
function declaredReconciliationLocator(target, entry) {
  const located = locateExplanationPassage(target.text, { quote: entry.trecho, prefix: entry.prefixo ?? null,
    suffix: entry.sufixo ?? null, occurrence: entry.ocorrencia ?? null },
  { preserveMarkup: target.preserveMarkup === true });
  if (located.status !== "located") {
    return { quote: entry.trecho, prefix: entry.prefixo ?? null, suffix: entry.sufixo ?? null };
  }
  return canonicalReconciliationLocator(target.text, located.range);
}

function wholeLeafReconciliationLocators(target) {
  const text = target.text;
  if (text.length <= 4000) return [{ quote: text, prefix: null, suffix: null }];
  const locators = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 4000, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf("\n", end);
      if (boundary > start + 1000) end = boundary + 1;
    }
    locators.push(canonicalReconciliationLocator(text, [start, end]));
    start = end;
  }
  return locators;
}

// A declaração humana nomeia a função do recurso inteiro (trecho omitido) ou de
// um trecho literal. O servidor deriva as folhas e o locator canônico; nunca
// exige o nome interno do campo. O trecho localiza uma folha única pelo mesmo
// mecanismo das citações: a pluralidade volta como candidatos e `alvo` escolhe
// pela posição ou pelo rótulo público. A representação acessível agregada (`$`)
// é folha legítima e permanece no denominador, mas só é escolhida quando é o
// único conteúdo que contém o trecho, para não duplicar a mesma decisão.
const RECONCILIATION_DECLARATION_FIELDS = new Set(["recurso", "trecho", "ocorrencia", "prefixo", "sufixo",
  "alvo", "papel", "motivo", "ideias", "requisitos", "destino"]);

function locateReconciliationDeclaration(entry, resourceTargets, index) {
  const blocker = (message, extra = {}) => ({ code: "explanation_reconciliation_locator_stale",
    message, entry: index + 1, ...extra });
  if (entry.trecho === undefined || entry.trecho === null) return { targets: resourceTargets };
  const located = [];
  for (const target of resourceTargets) {
    const result = locateExplanationPassage(target.text, { quote: entry.trecho, prefix: entry.prefixo ?? null,
      suffix: entry.sufixo ?? null, occurrence: entry.ocorrencia ?? null },
    { preserveMarkup: target.preserveMarkup === true });
    if (result.status !== "missing") located.push({ ...target, location: result });
  }
  const primary = located.filter(target => target.path !== "$");
  const pool = primary.length ? primary : located;
  if (!pool.length) {
    return { blocker: blocker("O trecho literal não foi localizado no recurso indicado; confira o recurso e o trecho literal.",
      { passages: resourceTargets.slice(0, RECONCILIATION_PASSAGE_LIMIT)
        .map(target => target.text.slice(0, RECONCILIATION_PASSAGE_TEXT_LIMIT)) }) };
  }
  let selected = pool[0];
  if (pool.length > 1 || entry.alvo !== undefined) {
    const chosen = selectLocatedPart(pool, entry.alvo ?? null);
    if (chosen.length !== 1) return { blocker: blocker(entry.alvo === undefined
      ? `O trecho aparece em ${pool.length} partes do recurso; informe alvo pela posição ou pelo rótulo público da parte.`
      : "O alvo informado não identifica uma parte do trecho; use a posição ou o rótulo público.",
    { candidates: occurrencePartCandidates(pool) }) };
    selected = chosen[0];
  }
  if (selected.location.status === "ambiguous") return { blocker: blocker(
    "O trecho repete dentro da parte escolhida; use prefixo, sufixo ou a ocorrência para distinguir a passagem.",
    { candidates: selected.location.candidates }) };
  return { targets: [selected] };
}

// A declaração humana pode citar um papel que exige ideia sem informá-la, e a
// normalização canônica recusa isso com TypeError. Reutiliza o próprio validador
// para atribuir a recusa à passagem exata, sem transformar falha inesperada em
// entrada inválida nem afrouxar a validação.
const RECONCILIATION_ROLES_REQUIRING_IDEA = Object.freeze(["introduced", "established", "revisited"]);
function reconciliationEntryBlockers(reconciliation) {
  const entries = Array.isArray(reconciliation?.entries) ? reconciliation.entries : [];
  const blockers = [];
  entries.forEach((entry, index) => {
    try {
      normalizeExplanationReconciliation({ contract: reconciliation.contract,
        contentBasis: reconciliation.contentBasis, entries: [entry] });
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      const needsIdea = plainObject(entry) &&
        RECONCILIATION_ROLES_REQUIRING_IDEA.includes(entry.role) &&
        Array.isArray(entry.analysisUnitIds) && entry.analysisUnitIds.length === 0;
      blockers.push({ code: needsIdea ? "explanation_reconciliation_missing_idea" : "explanation_reconciliation_invalid_entry",
        message: needsIdea
          ? `A passagem de papel “${entry.role}” precisa citar ao menos uma ideia do repertório.`
          : "Uma passagem não corresponde ao contrato da reconciliação salva.",
        entry: index + 1 });
    }
  });
  if (!blockers.length) {
    // A recusa de conjunto (mais de 512 passagens ou acima do tamanho serializado)
    // não é ausência de classificação: o autor classificou, e a orientação precisa
    // dizer isso sem espelhar o TypeError bruto do validador.
    blockers.push({ code: "explanation_reconciliation_too_large",
      message: "A reconciliação excede os limites do contrato da base (número de passagens ou tamanho serializado); reduza as passagens declaradas antes de salvar." });
  }
  return blockers;
}

export async function reconcileHumanExplanation(content, entries, context) {
  const explanation = normalizeMicrosequenceExplanation(content);
  if (entries === undefined && explanation.reconciliation === undefined) return explanation;
  const micros = (context.plan?.plan?.curriculum?.modules ?? []).flatMap(module =>
    (module.lessons ?? []).flatMap(lesson => lesson.microsequences ?? []));
  if (entries !== undefined) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 512) {
      fail("invalid_explanation_reconciliation", "Informe as passagens classificadas da base.");
    }
    const targets = explanationReconciliationTargets(explanation);
    const declared = [];
    for (const [index, entry] of entries.entries()) {
      const declarationBlocker = (message, extra = {}) => ({ code: "invalid_explanation_reconciliation",
        message, entry: index + 1, ...extra });
      if (!plainObject(entry) || Object.keys(entry).some(key => !RECONCILIATION_DECLARATION_FIELDS.has(key))) {
        const legacy = plainObject(entry) && Object.hasOwn(entry, "folha");
        fail("invalid_explanation_reconciliation", legacy
          ? "O campo folha foi removido no catálogo 10.0.0: informe recurso, papel, motivo, ideias e requisitos e, para um trecho, informe trecho/alvo; o servidor deriva a folha exata."
          : "Cada declaração informa recurso, papel, motivo, ideias e requisitos, com trecho, ocorrência, prefixo, sufixo e alvo opcionais.",
        undefined, { blockers: [declarationBlocker(legacy
          ? "O nome interno da folha não pertence mais ao contrato da reconciliação."
          : "A declaração contém um campo que não pertence ao contrato da reconciliação.")] });
      }
      const instance = explanation.content[(Number.isSafeInteger(entry?.recurso) ? entry.recurso : 0) - 1];
      const resourceTargets = targets.filter(item => item.resourceId === instance?.id && item.text.trim());
      if (!resourceTargets.length) {
        fail("invalid_explanation_reconciliation",
          "Uma declaração não corresponde a uma base com texto salvo na posição informada.", undefined,
          { blockers: [{ code: "explanation_reconciliation_locator_stale",
            message: "O recurso indicado não corresponde a uma base com texto salvo na posição informada.", entry: index + 1,
            ...(instance?.id ? { resourceId: String(instance.id) } : {}),
            passages: targets.filter(item => item.text.trim()).slice(0, RECONCILIATION_PASSAGE_LIMIT)
              .map(item => item.text.slice(0, RECONCILIATION_PASSAGE_TEXT_LIMIT)) }] });
      }
      const selection = locateReconciliationDeclaration(entry, resourceTargets, index);
      if (selection.blocker) fail("invalid_explanation_reconciliation",
        "Uma declaração não corresponde univocamente à base salva; nenhuma reconciliação foi gravada.", undefined,
        { blockers: [selection.blocker] });
      for (const target of selection.targets) {
        const locators = entry.trecho === undefined || entry.trecho === null
          ? wholeLeafReconciliationLocators(target)
          : [declaredReconciliationLocator(target, entry)];
        for (const locator of locators) declared.push({ ...locator, resourceId: target.resourceId, path: target.path, entry });
      }
    }
    explanation.reconciliation = {
      contract: "aralearn.explanation-reconciliation.v1", contentBasis: await explanationContentBasis(explanation),
      entries: declared.map(({ entry, ...locator }) => ({ ...locator, role: entry.papel, reason: entry.motivo,
        analysisUnitIds: (entry.ideias ?? []).map(value => resolvePlanItem(context.plan, "instructionalAnalysisUnits", value, "A ideia").id),
        evidenceRequirementIds: (entry.requisitos ?? []).map(value => resolvePlanItem(context.plan, "evidenceRequirements", value, "O requisito").id),
        destinationMicrosequenceId: entry.destino == null ? null : resolveReference(micros, entry.destino, {
          position: () => Number.NaN, texts: item => [item.title], label: "O destino da retomada" }).id
      }))
    };
  }
  // Inline declarations are new write input too. Never refresh their hash to
  // conceal a stale basis; unchanged legacy is restored from storage by callers.
  if (entries !== undefined) {
    try {
      normalizeExplanationReconciliation(explanation.reconciliation);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new AuthoringApiError(422, "invalid_explanation_reconciliation",
        "A descrição pedagógica precisa corresponder integralmente à base que será salva.",
        { blockers: reconciliationEntryBlockers(explanation.reconciliation) });
    }
  }
  const normalized = normalizeMicrosequenceExplanation(explanation);
  const inspection = inspectExplanationReconciliation(normalized, {
    contentBasis: await explanationContentBasis(normalized),
    analysisUnitIds: planItems(context.plan, "instructionalAnalysisUnits").map(item => item.id),
    evidenceRequirementIds: planItems(context.plan, "evidenceRequirements").map(item => item.id),
    microsequenceIds: micros.map(item => item.id)
  });
  if (!inspection.ready) {
    throw new AuthoringApiError(422, "invalid_explanation_reconciliation",
      "A descrição pedagógica precisa corresponder integralmente à base que será salva.",
      { blockers: inspection.blockers });
  }
  return normalized;
}

// Preparation and writing consume the same candidate units. The preflight
// derives structural facts from content instead of maintaining a parallel plan.
export async function preflightHumanCourseMaterialization({ adapter, principal, context,
  planUnits = [], explanations = [], complete = false, allowDraftCurricularMap = false,
  deadlineAt = null }) {
  const blockers = [];
  const bpmnIssues = [];
  const add = (code, message, details = {}) => blockers.push({ code, message, ...details });
  const capture = (callback, details = {}) => {
    try { return callback(); }
    catch (error) {
      // Somente campos humanos e curtos atravessam o bloqueador; nenhum payload interno.
      const projected = {};
      for (const key of ["studyUnit", "microsequence", "field", "parameter", "requested", "current", "applied", "idea"]) {
        const entry = error?.details?.[key];
        if (typeof entry === "string" && entry.length <= 4000) projected[key] = entry;
      }
      add(error.code ?? "invalid_human_materialization", error.message, { ...details, ...projected });
      return null;
    }
  };
  const mapStatus = context.plan?.plan?.curriculumMapStatus;
  if (mapStatus === "draft" && !allowDraftCurricularMap) {
    add("human_materialization_map_approval_required",
      "O mapa curricular está em rascunho. Aprove a versão inspecionada pela pessoa ou produza com autonomia explícita solicitada para este curso.",
      { curriculumMapStatus: mapStatus });
  } else if (mapStatus === "absent") {
    add("human_materialization_map_approval_required",
      "Ainda não há mapa curricular salvo para este curso; construa e salve o mapa antes de materializar.",
      { curriculumMapStatus: mapStatus });
  } else if (mapStatus !== "approved" && !(mapStatus === "draft" && allowDraftCurricularMap)) {
    add("course_service_unavailable", "O estado de aprovação do mapa curricular não pôde ser confirmado.");
  }
  const micros = partMicrosequences(context.part);
  const curriculumMicros = (context.plan?.plan?.curriculum?.modules ?? [])
    .flatMap(module => (module.lessons ?? []).flatMap(lesson => lesson.microsequences ?? []));
  const existingBySlot = await listExistingPartStudyUnits({ adapter, principal, context, deadlineAt });
  const groups = new Map();
  const sourceCache = new Map();
  const scopedDesigns = new Map();
  const audioCandidates = planUnits.map((unit, index) => ({ content: unit.conteudo, unit: index + 1 }));
  const arrangement = arrangeMaterializationUnits(existingBySlot, planUnits, micros, add);
  for (const retained of arrangement.retained) {
    const saved = retained.existing.item.studyUnit;
    bpmnIssues.push(...inspectBpmnAuthoring(saved, saved).map(issue => ({ ...issue, studyUnit: saved.title })));
  }
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
    const contentValidation = capture(() => validateCourseEntityContent("study_unit", {
      ...(planned.conteudo ?? {}), id: `preflight-${index + 1}`, position: planned.posicao
    }), details);
    if (contentValidation && !contentValidation.valid) {
      const reasons = contentValidation.errors
        .map(error => typeof error === "string" ? error : error?.message)
        .filter(message => typeof message === "string" && message.trim());
      add("invalid_human_study_unit",
        `A unidade de estudo ${index + 1} é inválida: ${reasons.join(" ")}`, details);
    } else if (contentValidation?.valid) {
      normalizedContent = structuredClone(contentValidation.normalized);
      try { requireCoursePracticeAuthoring(normalizedContent); }
      catch (error) { add(error.code ?? "invalid_human_study_unit", error.message, details); }
      for (const issue of inspectBpmnAuthoring(normalizedContent, existing?.studyUnit)) {
        bpmnIssues.push({ ...issue, ...details });
        if (issue.blocking) add(issue.code, issue.message, { ...details, path: issue.path });
      }
      for (const issue of inspectPedagogicalEvidence({ content: normalizedContent, practices,
        requirements: planItems(context.plan, "evidenceRequirements") }).issues) {
        add(issue.code, issue.message, { ...details, path: issue.path });
      }
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
      { existing, studyUnit: planned.conteudo?.title ?? existing?.studyUnit?.title ?? null }), details);
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
  const changedIntroductionIds = new Set([...groups.values()].flatMap(group => group.units.flatMap(unit => unit.noveltyIds)));
  const replacedIds = new Set([...arrangement.planned.values()].map(value => value.existing?.studyUnitId).filter(Boolean));
  const movedIds = new Set(arrangement.retained.filter(value => value.position !== value.existing.item.studyUnit.position)
    .map(value => value.existing.studyUnitId));
  for (const idea of planItems(context.plan, "instructionalAnalysisUnits")) {
    if (replacedIds.has(idea.introducedAt?.studyUnitId) || movedIds.has(idea.introducedAt?.studyUnitId)) {
      changedIntroductionIds.add(idea.id);
    }
  }
  for (const retained of arrangement.retained) {
    if (!complete && !targetMicrosequenceIds.has(retained.microsequenceId)) continue;
    const { item } = retained.existing;
    const application = item.designApplication, snapshot = item.designSnapshot;
    if (complete && (!application || !snapshot)) {
      add("human_materialization_existing_application_missing",
        "Registre as aplicações e a configuração aplicada da unidade existente antes de concluir o percurso.", { studyUnit: item.studyUnit.title });
      continue;
    }
    const micro = micros.find(value => value.id === retained.microsequenceId);
    // Partial production consumes only recorded relationships of omitted units.
    // Their historical configuration is relevant only to an integral audit.
    const design = complete ? { ...designs.get(micro.id), parameters: (snapshot.parameters ?? []).map(parameter => ({
      parameterId: parameter.parameterId, effectiveAssignment: {
        mode: parameter.origin === "automatic" ? "automatic" : "fixed", value: parameter.value,
        origin: parameter.origin, reason: parameter.reason,
        sourceScope: parameter.sourceScopeKind ? { kind: parameter.sourceScopeKind } : null
      }
    })), componentPolicy: { effectiveAssignment: snapshot.componentPolicy } } : designs.get(micro.id);
    if (complete) scopedDesigns.set(item.studyUnit.id, design);
    const unit = persistedPedagogicalUnit(item, micro, retained.position, design, context.plan);
    if (!groups.has(micro.id)) groups.set(micro.id, { microsequenceId: micro.id, units: [] });
    groups.get(micro.id).units.push(unit);
  }
  // O materializador exige que cada dependência curricular da microssequência
  // produzida esteja persistida ou integre exatamente o lote desta escrita.
  // Repetir esse recorte evita devolver "ready" a uma escrita que o SQL recusa,
  // sem transformar uma Microssequência vizinha fora do alvo num pré-requisito.
  const batchMicrosequenceIds = new Set(micros
    .filter(micro => complete || targetMicrosequenceIds.has(micro.id))
    .map(micro => micro.id));
  const persistedUnitCounts = new Map();
  for (const part of Array.isArray(context.plan?.plan?.parts) ? context.plan.plan.parts : []) {
    for (const micro of Array.isArray(part?.microsequences) ? part.microsequences : []) {
      if (typeof micro?.id === "string" && Number.isSafeInteger(micro.studyUnitCount)) {
        persistedUnitCounts.set(micro.id, micro.studyUnitCount);
      }
    }
  }
  const declaredDependencies = new Map(curriculumMicros
    .filter(micro => typeof micro?.id === "string")
    .map(micro => [micro.id, Array.isArray(micro.dependencyMicrosequenceIds)
      ? micro.dependencyMicrosequenceIds.filter(id => typeof id === "string" && id) : []]));
  const dependencyIsProduced = async (microsequenceId) => {
    if (persistedUnitCounts.has(microsequenceId)) return persistedUnitCounts.get(microsequenceId) > 0;
    try {
      const page = await adapter.listCourseStudyUnits({ principal, courseId: context.course.id,
        expectedRevision: context.course.revision, scopeKind: "didactic_microsequence", scopeId: microsequenceId,
        cursorStudyUnitId: null, direction: "forward", limit: 1, maxBytes: 64 * 1024,
        inspectionVersion: 2, deadlineAt });
      if (!plainObject(page) || !Array.isArray(page.items)) {
        add("course_service_unavailable", "Não foi possível conferir as dependências curriculares desta produção.");
        return null;
      }
      return page.items.length > 0;
    } catch (error) {
      add(error?.code ?? "course_service_unavailable",
        "Não foi possível conferir as dependências curriculares desta produção.");
      return null;
    }
  };
  for (const micro of micros) {
    if (!batchMicrosequenceIds.has(micro.id)) continue;
    for (const dependencyId of declaredDependencies.get(micro.id) ?? []) {
      if (batchMicrosequenceIds.has(dependencyId)) continue;
      if (await dependencyIsProduced(dependencyId) !== false) continue;
      const dependency = curriculumMicros.find(item => item?.id === dependencyId);
      add("curricular_dependency_not_produced",
        `A microssequência “${micro.title}” depende de “${dependency?.title ?? dependencyId}”, ` +
        "que ainda não tem unidade produzida. Produza essa dependência antes ou inclua as duas no mesmo lote.",
        { microsequence: micro.title });
    }
  }
  const allMicros = curriculumMicros;
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
    } catch (error) {
      const declared = Array.isArray(error?.details?.blockers) ? error.details.blockers : [];
      if (declared.length) declared.forEach(blocker => blockers.push({ ...blocker, explanation: index + 1 }));
      else add(error.code ?? "invalid_human_explanation", error.message, { explanation: index + 1 });
    }
  }
  const relevantMicrosequenceIds = complete
    ? new Set(micros.map(item => item.id))
    : new Set([...targetMicrosequenceIds, ...suppliedByMicro.keys()]);
  for (const micro of micros.filter(item => relevantMicrosequenceIds.has(item.id))) {
    const supplied = suppliedByMicro.get(micro.id);
    const explanation = supplied ? supplied.content
      : allMicros.find(item => item.id === micro.id)?.explanation ?? micro.explanation;
    if (!explanation) { add("human_materialization_missing_explanation", "Salve e reconcilie a Explicação antes de produzir as unidades.", { microsequence: micro.title }); continue; }
    audioCandidates.push({ content: explanation, microsequence: micro.title });
    bpmnIssues.push(...inspectBpmnAuthoring(explanation, explanation)
      .map(issue => ({ ...issue, explanation: micro.title })));
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
      for (const id of reconciliation.introduced) if (!introduced.has(id)) {
        const statement = planItems(context.plan, "instructionalAnalysisUnits").find(item => item.id === id)?.statement;
        add("human_materialization_incomplete_analysis_inventory",
          `O percurso ainda precisa apresentar o ensino de “${statement ?? id}” numa unidade da sequência.`,
          { microsequence: micro.title, idea: statement });
      }
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
    affectedExistingStudyUnitIds, blockers, { complete, changedIntroductionIds }));
  const normalizedPlan = structuredClone(planUnits);
  const audioInstances = audioCandidates.flatMap(({ content }) => [content?.content, content?.feedback]
    .flatMap(instances => Array.isArray(instances) ? instances : []))
    .filter(instance => instance?.package === "aralearn.resource.audio");
  const hasAudio = audioInstances.length > 0;
  let audioLibrary = null;
  if (hasAudio) {
    audioLibrary = [];
    const hasFile = audioInstances.some(instance => Array.isArray(instance.data?.tracks) &&
      instance.data.tracks.some(track => track?.kind === "file"));
    try { if (hasFile) {
      let cursor = null;
      const seen = new Set();
      do {
        const page = normalizeCourseMediaRead(await adapter.getCourseMedia({ principal, courseId: context.course.id,
          expectedRevision: context.course.revision, mode: "catalog", cursor, limit: 50, deadlineAt }));
        if (page.courseId !== context.course.id || page.courseRevision !== context.course.revision ||
            page.nextCursor !== null && seen.has(page.nextCursor)) fail("course_revision_conflict", "A biblioteca de áudio mudou; releia o recorte.", 409);
        audioLibrary.push(...page.items);
        cursor = page.nextCursor; seen.add(cursor);
      } while (cursor !== null && seen.size <= MAX_PART_STUDY_UNIT_PAGES);
      if (cursor !== null) fail("course_service_unavailable", "A biblioteca de áudio excedeu o limite de leitura.", 503);
    }
    } catch (error) {
      add(error.code ?? "course_media_unavailable", "Não foi possível conferir as gravações deste recorte. Consulte a biblioteca de áudio antes de materializar.");
    }
    for (const { content, ...scope } of audioCandidates) for (const issue of inspectCourseAudioReadiness(content, audioLibrary)) {
      add(issue.code, issue.message, { ...scope, path: issue.path });
    }
  }
  const identity = await sha256Hex(canonicalAuthoringValue({ courseId: context.course.id, courseRevision: context.course.revision,
    part: context.part, plan: context.plan, designs: [...designs], scopedDesigns: [...scopedDesigns],
    existing: [...existingBySlot], sourceBases: [...sourceCache], savedSourceBases,
    explanations: [...suppliedByMicro], planUnits: normalizedPlan, audioLibrary, complete }));
  const unique = [...new Map(blockers.map(blocker => [JSON.stringify(blocker), blocker])).values()];
  return { state: unique.length ? "blocked" : "ready", referencia: unique.length ? null : `materialization-v1:${identity}`,
    blockers: unique, reconciliations, completion: complete ? "complete" : "partial",
    ...(bpmnIssues.length ? { bpmnReview: { state: "needs_review", issues: bpmnIssues } } : {}) };
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

function boundedDiagnostic(value, limit = 240) {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// O conflito nomeia o campo divergente e contrasta o solicitado com o vigente,
// sem reler o curso: os dados vêm do design corrente e da configuração pedida.
function existingConfigurationConflict(details = {}) {
  const where = details.studyUnit ? ` na unidade “${details.studyUnit}”` : "";
  const field = details.field ? ` no campo “${details.field}”` : "";
  const compare = details.field
    ? ` Solicitado: ${boundedDiagnostic(details.requested) ?? "—"}; intenção efetiva corrente: ${boundedDiagnostic(details.current) ?? "—"}; valor aplicado na unidade: ${boundedDiagnostic(details.applied) ?? "—"}.`
    : "";
  fail(
    "human_materialization_existing_configuration_conflict",
    `Esta unidade já possui outra configuração${where}${field}.${compare}`,
    undefined,
    Object.keys(details).length ? details : undefined
  );
}

function applyUnitContextualCalibration(design, configuration, { existing = null, studyUnit = null } = {}) {
  if (design?.parameters?.some((parameter) => parameter.conflicts?.length)) {
    fail("human_materialization_configuration_conflict", "Resolva a condição fixa e sua exceção antes de produzir.", 409);
  }
  const calibrated = structuredClone(design);
  const snapshot = existing?.designSnapshot;
  // Guarda a intenção efetiva ORIGINAL: o reuso do aplicado não pode reescrever
  // a camada relatada no diagnóstico nem afirmar que ela já era o valor novo.
  const effectiveBeforeReuse = new Map((calibrated.parameters ?? [])
    .map(parameter => [parameter.parameterId, parameter.effectiveAssignment?.value ?? null]));
  // Applying a contextual choice persists the snapshot, not an intention. Reuse
  // that unit's valid automatic choices while its control remains automatic.
  // Both reads are revision-bound and the preflight identity includes the snapshot.
  if (snapshot?.contract === "aralearn.study-unit-design-snapshot.v2" &&
      snapshot.parameterCatalogVersion === COURSE_DESIGN_PARAMETER_CATALOG_VERSION &&
      snapshot.didacticMicrosequenceId === existing.curriculumPath?.didacticMicrosequence?.id &&
      Array.isArray(snapshot.parameters) && snapshot.parameters.length === COURSE_DESIGN_PARAMETER_DEFINITIONS.length &&
      new Set(snapshot.parameters.map(parameter => parameter?.parameterId)).size === snapshot.parameters.length) {
    for (const parameter of calibrated.parameters ?? []) {
      const effective = parameter.effectiveAssignment;
      // Reusa quando a intenção corrente ainda é automática sem valor (regra original)
      // ou quando é uma calibração automática já registrada, sem sobrepor fixação,
      // pesquisa ou intenção humana corrente.
      const unsetAutomatic = effective?.mode === "automatic" && effective.value === null &&
        effective.origin === "system_default" && effective.sourceScope == null && parameter.localAssignment == null;
      const appliedAutomatic = effective?.mode === "automatic" && effective.origin === "automatic";
      if (!unsetAutomatic && !appliedAutomatic) continue;
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
        existingConfigurationConflict({ ...(studyUnit ? { studyUnit } : {}), field, parameter: field,
          requested: boundedDiagnostic(value), current: boundedDiagnostic(effectiveBeforeReuse.get(parameterId)),
          applied: boundedDiagnostic(snapshot?.parameters?.find(entry => entry?.parameterId === parameterId)?.value ?? null) });
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
        existingConfigurationConflict({ ...(studyUnit ? { studyUnit } : {}), field: "direção editorial",
          requested: boundedDiagnostic(guidance), current: boundedDiagnostic(effective[0]?.guidance ?? null),
          applied: null });
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
  // Unresolved automatic choices belong to the producing agent's contextual
  // judgement. A product default is not a persisted authorial decision.
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

function validatePreservedAnalysisReferences(groups, plan, replacedStudyUnitIds, curriculumOrder, diagnostics,
  { complete = true, changedIntroductionIds = new Set() } = {}) {
  const introductions = new Map();
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
    if (!complete && !changedIntroductionIds.has(item.id)) continue;
    for (const [field, code] of [["usedBy", "human_materialization_use_before_introduction"],
      ["revisitedBy", "human_materialization_explanation_before_introduction"]]) {
      for (const reference of item[field] ?? []) {
        // Units represented in these groups are checked in their final order.
        if (replacedStudyUnitIds.has(reference.studyUnitId)) continue;
        const introductionOrder = introductions.get(item.id);
        const referenceOrder = curriculumOrder.get(reference.didacticMicrosequenceId);
        if (Number.isSafeInteger(introductionOrder) && Number.isSafeInteger(referenceOrder) &&
            introductionOrder <= referenceOrder) continue;
        const message = `A unidade preservada “${reference.title}” depende da ideia “${item.statement}”, ` +
          "mas a alteração não conserva seu ensino antes desse uso.";
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
  analysisLabels, diagnostics = null,
  { complete = true, changedIntroductionIds = new Set(), microsequenceLabels = new Map(),
    evidenceLabels = new Map() } = {}
) {
  const report = (code, message, status, details = undefined) => {
    if (!diagnostics) fail(code, message, status, details);
    diagnostics.push({ code, message, ...details });
  };
  const microsequenceTitle = microsequenceLabels.get(group.microsequenceId);
  const microsequenceDetail = microsequenceTitle ? { microsequence: microsequenceTitle } : {};
  const firstDesign = group.units.find(unit => !unit.preserved)?.design ?? group.units[0]?.design;
  const targets = firstDesign?.targetPlanItems;
  if (!plainObject(targets)) {
    report("course_service_unavailable", "O recorte pedagógico corrente está incompleto.", 503);
    return;
  }
  const targetAnalysis = new Set(targets.instructionalAnalysisUnitIds || []);
  const targetEvidence = new Set(targets.evidenceRequirementIds || []);
  const preserved = group.units.filter(unit => unit.preserved);

  const representedAnalysis = new Set();
  const introducedInGroup = new Set();
  const developedByAnalysis = new Map([...targetAnalysis].map((id) => [id, new Set()]));
  const notApplicableByAnalysis = new Map([...targetAnalysis].map((id) => [id, new Set()]));
  const requiredFormsByAnalysis = new Map();
  const introductionByAnalysis = new Map();
  const practiceByEvidence = new Map([...targetEvidence].map((id) => [id, {
    opportunities: new Set(),
    operation: null,
    dimensions: new Set(),
    minimum: 1,
    requiredDimensions: new Set()
  }]));

  for (const unit of group.units) {
    if (!complete && unit.preserved) {
      // An omitted unit is evidence about the sequence, not a new candidate.
      // Only changed introductions can make its prior uses relevant here.
      for (const id of unit.usedIds) {
        if (changedIntroductionIds.has(id) && !establishedAnalysis.has(id)) {
          report("human_materialization_use_before_introduction",
            `A alteração deixaria “${unit.content.title}” usando “${analysisLabels.get(id) ?? id}” antes de ensiná-la.`,
            undefined, { idea: analysisLabels.get(id) ?? id, studyUnit: unit.content.title, ...microsequenceDetail });
        }
      }
      for (const explanation of unit.explanations) {
        const id = explanation.instructionalAnalysisUnitId;
        if (changedIntroductionIds.has(id) && !unit.noveltyIds.includes(id) && !establishedAnalysis.has(id)) {
          report("human_materialization_explanation_before_introduction",
            `A alteração deixaria “${unit.content.title}” retomando “${analysisLabels.get(id) ?? id}” antes de ensiná-la.`,
            undefined, { idea: analysisLabels.get(id) ?? id, studyUnit: unit.content.title, ...microsequenceDetail });
        }
      }
      unit.noveltyIds.forEach(id => { establishedAnalysis.add(id); introducedAnywhere.add(id); });
      continue;
    }
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
        const idea = analysisLabels.get(id) ?? id;
        report(
          "human_materialization_use_before_introduction",
          `A unidade “${unit.content.title}” usa “${idea}” antes do ensino correspondente no percurso.`,
          undefined, { idea, studyUnit: unit.content.title, ...microsequenceDetail }
        );
      }
    }
    for (const id of unit.noveltyIds) {
      if (introducedAnywhere.has(id) || !complete && preserved.some(saved => saved.noveltyIds.includes(id))) {
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
      if (!introductionByAnalysis.has(id)) introductionByAnalysis.set(id, unit.content.title);
    }
    for (const explanation of unit.explanations) {
      const id = explanation.instructionalAnalysisUnitId;
      if (!noveltySet.has(id) && !knownBeforeUnit.has(id)) {
        report(
          "human_materialization_explanation_before_introduction",
          `A unidade “${unit.content.title}” retoma “${analysisLabels.get(id) ?? id}” antes do ensino correspondente no percurso.`,
          undefined, { idea: analysisLabels.get(id) ?? id, studyUnit: unit.content.title, ...microsequenceDetail }
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
    if (!complete) for (const saved of preserved) {
      for (const explanation of unit.explanations) {
        const previous = saved.explanations.find(value => value.instructionalAnalysisUnitId === explanation.instructionalAnalysisUnitId);
        if (previous && (explanation.developedForms.some(form => previous.notApplicable.some(value => value.form === form)) ||
            explanation.notApplicable.some(value => (previous.developedForms ?? []).includes(value.form)))) {
          report("human_materialization_explanation_form_conflict",
            `A nova explicação contradiz uma forma já desenvolvida em “${saved.content.title}”.`);
        }
      }
      for (const practice of unit.practices) for (const previous of saved.practices) {
        if (previous.evidenceRequirementId !== practice.evidenceRequirementId) continue;
        if (previous.opportunityId === practice.opportunityId) report("human_materialization_duplicate_practice",
          `A nova prática repete a oportunidade já presente em “${saved.content.title}”.`);
        if (previous.invariantTaskOperation != null && previous.invariantTaskOperation !== practice.invariantTaskOperation) {
          report("human_materialization_practice_operation_changed",
            `A nova prática muda a operação de aprendizagem compartilhada com “${saved.content.title}”.`);
        }
      }
    }
    try { validateComponentPolicy(unit.componentRefs ?? componentRefs(unit.content), policy); }
    catch (error) { report(error.code, error.message, error.status); }
  }

  if (!complete) return;
  const missingAnalysis = [...targetAnalysis].filter((id) => !representedAnalysis.has(id));
  if (missingAnalysis.length) {
    report(
      "human_materialization_incomplete_analysis_inventory",
      `O percurso ainda precisa apresentar ${missingAnalysis.map((id) => `“${analysisLabels.get(id) ?? id}”`).join(", ")} como introdução, uso ou retomada.`,
      undefined, { ...microsequenceDetail,
        ...(missingAnalysis.length === 1 ? { idea: analysisLabels.get(missingAnalysis[0]) ?? missingAnalysis[0] } : {}) }
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
      const introduction = introductionByAnalysis.get(id) ?? null;
      const where = microsequenceTitle ? ` na microssequência “${microsequenceTitle}”` : "";
      report(
        "human_materialization_missing_explanation_form",
        `A unidade “${introduction ?? "de introdução"}”${where} introduz “${idea}”, e a configuração aplicada exige ${forms}; as declarações de ensino das unidades ainda não cobrem essa exigência. A divergência é entre a configuração aplicada e as declarações de ensino das unidades, não uma conclusão sobre o conteúdo.`,
        undefined,
        { ...microsequenceDetail, idea, ...(introduction ? { studyUnit: introduction } : {}) }
      );
    }
  }
  for (const [evidenceId, state] of practiceByEvidence.entries()) {
    const missingDimensions = [...state.requiredDimensions]
      .filter((dimension) => !state.dimensions.has(dimension));
    const missingOpportunities = state.opportunities.size < state.minimum;
    if (missingOpportunities || missingDimensions.length) {
      const requirement = evidenceLabels.get(evidenceId) ?? evidenceId;
      const opportunityLabel = state.opportunities.size === 1
        ? "oportunidade distinta declarada"
        : "oportunidades distintas declaradas";
      const reasons = [
        `${state.opportunities.size} ${opportunityLabel}; mínimo efetivo ${state.minimum}`
      ];
      if (missingDimensions.length) {
        const labels = missingDimensions.map((dimension) =>
          PRACTICE_VARIATION_DIMENSION_LABELS[dimension] ?? dimension);
        reasons.push(`faltam as dimensões de variação exigidas: ${labels.join(", ")}`);
      }
      report(
        "human_materialization_insufficient_practice",
        `A prática não cumpre o mínimo ou as dimensões de variação efetivas para o requisito “${requirement}”: ${reasons.join("; ")}.`,
        undefined,
        { ...microsequenceDetail, requirement }
      );
    }
  }
}

function validatePedagogicalPart(groups, plan, replacedStudyUnitIds, diagnostics = null, options = {}) {
  const curriculumOrder = curriculumMicrosequenceOrder(plan);
  const microsequenceLabels = new Map((plan?.plan?.curriculum?.modules ?? []).flatMap(module =>
    (module.lessons ?? []).flatMap(lesson => (lesson.microsequences ?? []).map(micro => [micro.id, micro.title]))));
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
  const evidenceLabels = new Map(planItems(plan, "evidenceRequirements")
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
      analysisLabels, diagnostics, { ...options, microsequenceLabels, evidenceLabels }
    );
    const coveredScopeIds = new Set(group.units.flatMap((unit) =>
      unit.curriculumScopeItemIds));
    const plannedScopeIds = plannedCurriculumScopeIds(plan, group.microsequenceId);
    if (options.complete !== false && (!plannedScopeIds.length ||
      plannedScopeIds.some((id) => !coveredScopeIds.has(id)))) {
      const message = plannedScopeIds.length
        ? "A microssequência precisa desenvolver os itens de escopo que o mapa curricular atribuiu a ela."
        : "A microssequência ainda não tem cobertura declarada no mapa; indique os itens de escopo antes de concluir esta produção.";
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
    const persistedSupport = saved.find(item => (item.id ?? item.microsequenceId) === microsequence.id)?.explanation ?? null;
    let content;
    try {
      requireBpmnAuthoring(normalizeMicrosequenceExplanation(entry.conteudo), persistedSupport);
      content = await reconcileHumanExplanation(entry.conteudo, entry.reconciliacao, context);
    }
    catch (error) {
      // Actionable diagnostics (pending passages, candidates) travel with the
      // failure instead of being replaced by a generic message.
      if (Array.isArray(error?.details?.blockers) && error.details.blockers.length) throw error;
      fail("invalid_human_explanation", error.message);
    }
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
      requested: entry.fontes ?? [], deadlineAt, newId, content,
      options: EXPLANATION_SOURCE_OCCURRENCE_OPTIONS, identityPrefix: `explanation:${index}` });
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
  allowDraftCurricularMap = false,
  deadlineAt = null
}) {
  validateUnits(units);
  let producedPartPosition = null;
  let producedContentTarget = null;
  let practiceObservations = [];
  let bpmnReview = null;
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
        planUnits: units.map(humanMaterializationUnitPlan), explanations, complete,
        allowDraftCurricularMap, deadlineAt });
      if (preparationReference && preflight.referencia !== preparationReference) {
        throw new AuthoringApiError(409, "human_materialization_preflight_stale",
          "A base ou as intenções mudaram depois do preparo; releia o preflight antes de escrever.", { preflight });
      }
      if (preflight.state !== "ready") {
        throw new AuthoringApiError(422, "human_materialization_preflight_blocked",
          "Resolva os bloqueios agregados de preparar_materializacao antes de materializar.", { preflight });
      }
      bpmnReview = preflight.bpmnReview ?? null;
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
      const partMicros = partMicrosequences(context.part);
      const arrangement = arrangeMaterializationUnits(existingBySlot, units, partMicros);
      const writtenMicrosequenceIds = new Set(groups.map(group => group.microsequenceId));
      const designMicros = complete ? partMicros : partMicros.filter(micro => writtenMicrosequenceIds.has(micro.id));
      const targetDesigns = new Map(await Promise.all(designMicros.map(async micro => [micro.id,
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
        allowDraftMap: allowDraftCurricularMap,
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
      : "Gravação parcial: o conteúdo solicitado foi salvo, mas a parte ainda não está concluída.",
    ...buildHumanNavigationEnvelope(producedContentTarget ? createHumanNavigation(adapter, {
      courseId: producedContentTarget.courseId, relation: "content", target: { kind: "authoring_part", id: producedContentTarget.partId }
    }) : null, [], { nextDecision: complete
      ? "Use preparar_revisao com auditoria: true para uma segunda leitura pedagógica do percurso salvo. Registre as seis dimensões, incluindo configuration; corrija insuficiências antes de considerar a produção satisfatória."
      : "A gravação é parcial: continue somente o que falta, confira o acumulado e conclua a parte antes da inspeção final. Só então use preparar_revisao com auditoria: true e as seis dimensões, incluindo configuration." }),
    context: { distribuicaoDaPratica: practiceObservations, completion: complete ? "complete" : "partial",
      ...(bpmnReview ? { bpmnReview } : {}),
      qualidadePedagogica: "pending_independent_inspection",
      cursoRevision: receipt.courseRevision }
  };
}

// Recuperação curta e acionável para o retorno de preparar_materializacao: nomeia
// o ensino ausente ou o uso prematuro no percurso, sem repetir códigos, campos ou
// estado interno. A barreira didática permanece; só o próximo passo fica explícito.
export function humanMaterializationRecovery(preflight) {
  const blockers = Array.isArray(preflight?.blockers) ? preflight.blockers : [];
  const mapApproval = blockers.find(blocker => blocker.code === "human_materialization_map_approval_required");
  if (mapApproval) return mapApproval.curriculumMapStatus === "absent"
    ? "Ainda não há mapa curricular salvo neste curso; construa e salve o mapa antes de produzir a unidade."
    : "O mapa curricular está em rascunho. Se a revisão curricular faz parte do pedido, apresente o mapa salvo para a pessoa aprovar; se o pedido já autoriza produzir sem essa revisão, retome a produção com autonomia explícita.";
  const inventory = blockers.find(blocker =>
    blocker.code === "human_materialization_incomplete_analysis_inventory" && blocker.idea);
  if (inventory) return `Apresente o ensino de “${inventory.idea}” no percurso desta microssequência, respeitando a posição de prática escolhida, e repita a verificação.`;
  const useBefore = blockers.find(blocker =>
    blocker.code === "human_materialization_use_before_introduction" && blocker.idea);
  if (useBefore) return `Apresente o ensino de “${useBefore.idea}” antes da unidade “${useBefore.studyUnit ?? "em uso"}” e repita a verificação.`;
  const formGap = blockers.find(blocker =>
    blocker.code === "human_materialization_missing_explanation_form");
  if (formGap) {
    const target = `${formGap.idea ? `a ideia “${formGap.idea}”` : "a ideia de introdução"}${formGap.studyUnit ? ` na unidade de introdução “${formGap.studyUnit}”` : ""}`;
    return `As declarações de ensino das unidades ainda não cobrem ${target}. ` + COURSE_AUTHORING_CALIBRATION_RECOVERY;
  }
  const existingConfiguration = blockers.find(blocker =>
    blocker.code === "human_materialization_existing_configuration_conflict");
  if (existingConfiguration) return COURSE_AUTHORING_CALIBRATION_RECOVERY;
  if (blockers.length) return "Corrija as pendências de percurso indicadas e repita a verificação.";
  return null;
}
