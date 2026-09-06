import { COURSE_DESIGN_PARAMETER_DEFINITIONS, normalizeCourseDesignParameterValue } from "./courseDesignParameters.js";
import { normalizeCourseSourceDocument, normalizeCourseSourceLinks, normalizeCourseSourceSelector } from "./courseSources.js";

const PARAMETER_IDS = new Set(COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id }) => id));
const HASH = /^[a-f0-9]{64}$/u;
export class CourseAuthoringBasisError extends Error {
  constructor(message, code = "invalid_course_authoring_basis") { super(message); this.name = "CourseAuthoringBasisError"; this.code = code; this.status = 422; }
}
function fail(message) { throw new CourseAuthoringBasisError(message); }
export function exactAuthoringObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail("Os campos da leitura de autoria são inválidos.");
  return value;
}
export function authoringText(value, maximum = 240) { if (typeof value !== "string" || !value.length || value.length > maximum) fail("O texto da leitura de autoria é inválido."); return value; }
export function authoringInteger(value, minimum = 0) { if (!Number.isSafeInteger(value) || value < minimum) fail("A contagem da leitura de autoria é inválida."); return value; }
function rows(value, normalize, maximum = 100000) { if (!Array.isArray(value) || value.length > maximum) fail("A lista da leitura de autoria é inválida."); return value.map(normalize); }
function unique(value, key) { if (new Set(value.map(key)).size !== value.length) fail("A leitura de autoria repete uma referência."); return value; }
function refs(value) { return unique(rows(value, (ref) => authoringText(ref)), (ref) => ref); }
function scope(value) {
  if (value === null) return null;
  exactAuthoringObject(value, ["kind", "ref"]);
  if (!["course", "module", "lesson", "didactic_microsequence", "study_unit"].includes(value.kind) || (value.kind === "course" ? value.ref !== null : value.ref !== null && typeof value.ref !== "string")) fail("O escopo da configuração é inválido.");
  return { kind: value.kind, ref: value.ref === null ? null : authoringText(value.ref) };
}
function parameter(value, requested) {
  exactAuthoringObject(value, requested ? ["parameterId", "mode", "value", "origin", "reason", "sourceScope"] : ["parameterId", "value", "origin", "reason", "sourceScope"]);
  if (!PARAMETER_IDS.has(value.parameterId) || !["author", "automatic", "research_condition", "migration", "system_default"].includes(value.origin)) fail("A configuração não pertence ao catálogo.");
  if (requested && !["fixed", "automatic"].includes(value.mode)) fail("O modo da configuração é inválido.");
  if (value.value === null && (!requested || value.mode !== "automatic")) fail("O valor aplicado da configuração está ausente.");
  return { parameterId: value.parameterId, ...(requested ? { mode: value.mode } : {}), value: value.value === null ? null : normalizeCourseDesignParameterValue(value.parameterId, value.value), origin: value.origin, reason: value.reason === null && !requested ? null : authoringText(value.reason, 1000), sourceScope: scope(value.sourceScope) };
}
export function normalizeCourseAuthoringParameter(value, { requested = false } = {}) { return parameter(value, requested); }
function declaration(value) {
  if (value === null) return null;
  exactAuthoringObject(value, ["mode", "introducedInstructionalAnalysisUnitIds", "usedInstructionalAnalysisUnitIds", "explanationApplications", "practiceApplications"]);
  if (!["expository", "practice", "mixed"].includes(value.mode)) fail("A declaração de composição é inválida.");
  return { mode: value.mode, introducedInstructionalAnalysisUnitIds: refs(value.introducedInstructionalAnalysisUnitIds), usedInstructionalAnalysisUnitIds: refs(value.usedInstructionalAnalysisUnitIds), explanationApplications: rows(value.explanationApplications, (entry) => {
    exactAuthoringObject(entry, ["instructionalAnalysisUnitId", "developedForms", "notApplicable"]);
    return { instructionalAnalysisUnitId: authoringText(entry.instructionalAnalysisUnitId), developedForms: refs(entry.developedForms), notApplicable: rows(entry.notApplicable, (exception) => {
      exactAuthoringObject(exception, ["form", "reason"]);
      return { form: authoringText(exception.form), reason: authoringText(exception.reason, 1000) };
    }) };
  }), practiceApplications: rows(value.practiceApplications, (entry) => {
    exactAuthoringObject(entry, ["evidenceRequirementId", "opportunityId", "variedDimensions"]);
    return { evidenceRequirementId: authoringText(entry.evidenceRequirementId), opportunityId: authoringText(entry.opportunityId), variedDimensions: refs(entry.variedDimensions) };
  }) };
}
function inventoryItem(value) { exactAuthoringObject(value, ["ref", "position", "statement", "description"]); return { ref: authoringText(value.ref), position: authoringInteger(value.position, 1), statement: authoringText(value.statement, 20000), description: value.description === "" ? "" : authoringText(value.description, 20000) }; }
function source(value) {
  exactAuthoringObject(value, ["sourceRef", "revision", "document", "attachments", "anchors"]);
  return { sourceRef: authoringText(value.sourceRef, 240), revision: authoringInteger(value.revision, 1), document: normalizeCourseSourceDocument(value.document), attachments: unique(rows(value.attachments, (entry) => {
    exactAuthoringObject(entry, ["contentHash", "byteSize", "mediaType"]);
    if (!HASH.test(entry.contentHash) || entry.mediaType !== "application/pdf") fail("O anexo lógico da Fonte é inválido.");
    return { contentHash: entry.contentHash, byteSize: authoringInteger(entry.byteSize, 1), mediaType: entry.mediaType };
  }, 8), (entry) => entry.contentHash), anchors: unique(rows(value.anchors, (entry) => {
    exactAuthoringObject(entry, ["anchorRef", "contentHash", "selector", "humanLocator"]);
    if (entry.contentHash !== null && !HASH.test(entry.contentHash)) fail("A Âncora contém um anexo inválido.");
    return { anchorRef: authoringText(entry.anchorRef, 240), contentHash: entry.contentHash, selector: normalizeCourseSourceSelector(entry.selector), humanLocator: entry.humanLocator === null ? null : authoringText(entry.humanLocator, 500) };
  }, 128), (entry) => entry.anchorRef) };
}
export function normalizeCourseAuthoringSource(value) { return source(value); }
export function normalizeCourseAuthoringBasis(value, { courseTitle = null, studyUnitCount = null } = {}) {
  exactAuthoringObject(value, ["inventoryScope", "analysisUnits", "evidenceRequirements", "sources", "studyUnits"]);
  exactAuthoringObject(value.inventoryScope, ["kind", "ref", "label"]);
  if (value.inventoryScope.kind !== "course" || value.inventoryScope.ref !== null || (courseTitle !== null && value.inventoryScope.label !== courseTitle)) fail("O inventário planejado precisa abranger o curso completo.");
  const normalized = { inventoryScope: { kind: "course", ref: null, label: authoringText(value.inventoryScope.label, 300) }, analysisUnits: unique(rows(value.analysisUnits, inventoryItem), (entry) => entry.ref), evidenceRequirements: unique(rows(value.evidenceRequirements, inventoryItem), (entry) => entry.ref), sources: unique(rows(value.sources, source), (entry) => entry.sourceRef), studyUnits: unique(rows(value.studyUnits, (unit) => {
    exactAuthoringObject(unit, ["studyUnitRef", "position", "title", "requestedParameters", "appliedParameters", "declaration", "components", "wordCount", "sourceLinks"]);
    const requestedParameters = unique(rows(unit.requestedParameters, (entry) => parameter(entry, true), PARAMETER_IDS.size), (entry) => entry.parameterId);
    if (requestedParameters.length !== PARAMETER_IDS.size) fail("A configuração solicitada precisa incluir todo o catálogo.");
    return { studyUnitRef: authoringText(unit.studyUnitRef), position: authoringInteger(unit.position, 1), title: authoringText(unit.title, 300), requestedParameters, appliedParameters: unit.appliedParameters === null ? null : unique(rows(unit.appliedParameters, (entry) => parameter(entry, false), PARAMETER_IDS.size), (entry) => entry.parameterId), declaration: declaration(unit.declaration), components: unique(rows(unit.components, (entry) => {
      exactAuthoringObject(entry, ["componentRef", "instanceRef", "slot"]);
      if (!["content", "response", "feedback"].includes(entry.slot)) fail("O local do recurso é inválido.");
      return { componentRef: authoringText(entry.componentRef, 240), instanceRef: authoringText(entry.instanceRef), slot: entry.slot };
    }), (entry) => entry.instanceRef), wordCount: authoringInteger(unit.wordCount), sourceLinks: normalizeCourseSourceLinks(unit.sourceLinks) };
  }), (entry) => entry.studyUnitRef) };
  unique(normalized.studyUnits, (entry) => entry.position);
  if (studyUnitCount !== null && normalized.studyUnits.length !== studyUnitCount) fail("A contagem não corresponde às unidades observadas.");
  const analysis = new Set(normalized.analysisUnits.map(({ ref }) => ref));
  const evidence = new Set(normalized.evidenceRequirements.map(({ ref }) => ref));
  const sources = new Map(normalized.sources.map((entry) => [entry.sourceRef, entry]));
  for (const unit of normalized.studyUnits) {
    const declared = unit.declaration;
    if (declared && [...declared.introducedInstructionalAnalysisUnitIds, ...declared.usedInstructionalAnalysisUnitIds, ...declared.explanationApplications.map((entry) => entry.instructionalAnalysisUnitId)].some((ref) => !analysis.has(ref))) fail("A declaração referencia conteúdo ausente do inventário.");
    if (declared?.practiceApplications.some((entry) => !evidence.has(entry.evidenceRequirementId))) fail("A prática referencia evidência ausente do inventário.");
    for (const link of unit.sourceLinks) {
      const linkedSource = sources.get(link.sourceId);
      if (!linkedSource || link.anchors.some(({ anchorId }) => !linkedSource.anchors.some(({ anchorRef }) => anchorRef === anchorId))) fail("O vínculo referencia Fonte ou Âncora ausente.");
    }
  }
  return normalized;
}

const DIMENSIONS = [
  ["novelty", "Novidade declarada", "Quantidade de unidades de análise declaradas como introduzidas em cada unidade de estudo.", "unidades de análise", "producer_declaration"],
  ["reuse", "Reuso declarado", "Quantidade de unidades de análise declaradas como utilizadas em cada unidade de estudo.", "unidades de análise", "producer_declaration"],
  ["revisits", "Retomadas declaradas", "Explicações de unidades de análise que não foram declaradas como introduzidas na mesma unidade de estudo.", "aplicações", "producer_declaration"],
  ["explanations", "Explicações declaradas", "Quantidade de formas desenvolvidas declaradas nas aplicações de explicação.", "formas desenvolvidas", "producer_declaration"],
  ["practice", "Práticas declaradas", "Quantidade de oportunidades distintas por exigência de evidência declaradas na unidade de estudo.", "oportunidades", "producer_declaration"],
  ["practice_position", "Posição da prática", "Posição curricular e modo declarado de cada unidade, sem avaliação da qualidade da sequência.", "unidades de estudo", "producer_declaration"],
  ["representations", "Recursos presentes", "Quantidade de instâncias de recursos nos espaços de conteúdo, resposta e feedback.", "instâncias", "content_count"],
  ["extent", "Extensão textual", "Contagem determinística de palavras nos campos autorais dos recursos; não mede tempo ou dificuldade.", "palavras", "content_count"],
  ["sources", "Fontes vinculadas", "Quantidade de Fontes distintas efetivamente vinculadas à unidade de estudo.", "Fontes", "content_count"]
];
function observation(unit, id) {
  const value = unit.declaration;
  if (id === "representations") return unit.components.length;
  if (id === "extent") return unit.wordCount;
  if (id === "sources") return new Set(unit.sourceLinks.map(({ sourceId }) => sourceId)).size;
  if (value === null) return null;
  if (id === "practice_position") return value.mode;
  if (["novelty", "revisits", "explanations"].includes(id) && value.mode === "practice") return undefined;
  if (id === "practice" && value.mode === "expository") return undefined;
  if (id === "novelty") return value.introducedInstructionalAnalysisUnitIds.length;
  if (id === "reuse") return value.usedInstructionalAnalysisUnitIds.length;
  if (id === "revisits") return value.explanationApplications.filter(({ instructionalAnalysisUnitId }) => !value.introducedInstructionalAnalysisUnitIds.includes(instructionalAnalysisUnitId)).length;
  if (id === "explanations") return value.explanationApplications.reduce((sum, entry) => sum + entry.developedForms.length, 0);
  return new Set(value.practiceApplications.map((entry) => `${entry.evidenceRequirementId}\u0000${entry.opportunityId}`)).size;
}
export function observeCourseAuthoringDimensions(basis) {
  return DIMENSIONS.map(([id, label, definition, unit, measurementBasis]) => {
    const distribution = new Map(); let missingCount = 0; let notApplicableCount = 0;
    for (const entry of basis.studyUnits) {
      const value = observation(entry, id);
      if (value === null) { missingCount += 1; continue; }
      if (value === undefined) { notApplicableCount += 1; continue; }
      if (!distribution.has(value)) distribution.set(value, { value, label: ({ expository: "Expositiva", practice: "Prática", mixed: "Mista" })[value] || String(value), count: 0, studyUnitRefs: [] });
      const group = distribution.get(value); group.count += 1; group.studyUnitRefs.push(entry.studyUnitRef);
    }
    const groups = [...distribution.values()].sort((a, b) => typeof a.value === "number" ? a.value - b.value : a.value.localeCompare(b.value));
    const denominator = basis.studyUnits.length - missingCount - notApplicableCount;
    return { id, label, definition, unit, basis: measurementBasis, value: denominator === 0 || id === "practice_position" ? null : groups.reduce((sum, entry) => sum + entry.value * entry.count, 0), denominator, missingCount, notApplicableCount, distribution: groups };
  });
}

export function canonicalAuthoringValue(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalAuthoringValue).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalAuthoringValue(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
