import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";

export const COURSE_SOURCE_MAX_OCCURRENCES = 16;
const FIELDS = ["occurrenceId", "slot", "resourceId", "path", "quote", "prefix", "suffix"];
const SLOTS = ["content", "response", "feedback"];
const PATH_PATTERN = /^[A-Za-z_$][\w$]*(?:\[\d+\]|\.[A-Za-z_$][\w$]*)*$/u;
const hasControl = value => [...value].some(character => {
  const point = character.codePointAt(0);
  return point >= 127 && point <= 159 || point < 32 && ![9, 10, 13].includes(point);
});

function fail(message) {
  throw Object.assign(new TypeError(message), { code: "invalid_course_source_occurrence" });
}

function literal(value, maximum, label, { nullable = false, identifier = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.length || [...value].length > maximum || hasControl(value) ||
      identifier && (value !== value.trim() || /[\t\r\n]/u.test(value))) fail(`${label} inválido.`);
  return value;
}

export function normalizeCourseSourceOccurrence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).length !== FIELDS.length ||
      FIELDS.some((field) => !Object.hasOwn(value, field))) fail("A ocorrência precisa conter apenas seu alvo e trecho literal.");
  const occurrence = {
    occurrenceId: literal(value.occurrenceId, 240, "Identidade da ocorrência", { identifier: true }),
    slot: value.slot,
    resourceId: literal(value.resourceId, 240, "Identidade do recurso", { identifier: true }),
    path: literal(value.path, 240, "Folha textual", { identifier: true }),
    quote: literal(value.quote, 4_000, "Trecho"),
    prefix: literal(value.prefix, 500, "Contexto anterior", { nullable: true }),
    suffix: literal(value.suffix, 500, "Contexto posterior", { nullable: true })
  };
  if (!SLOTS.includes(occurrence.slot) || !PATH_PATTERN.test(occurrence.path) ||
      (occurrence.path.match(/[A-Za-z_$][\w$]*/gu) || []).some(part => ["__proto__", "constructor", "prototype"].includes(part))) fail("O alvo da ocorrência é inválido.");
  return occurrence;
}

export function normalizeCourseSourceOccurrences(value) {
  if (!Array.isArray(value) || value.length > COURSE_SOURCE_MAX_OCCURRENCES) fail("A lista de ocorrências excede o limite permitido.");
  const occurrences = value.map(normalizeCourseSourceOccurrence);
  if (new Set(occurrences.map(({ occurrenceId }) => occurrenceId)).size !== occurrences.length) fail("A lista repete a identidade de uma ocorrência.");
  return occurrences;
}

function readOwnPath(data, path) {
  return (path.match(/[^.[\]]+|\[(\d+)\]/gu) || []).reduce((value, part) => {
    const key = part.startsWith("[") ? Number(part.slice(1, -1)) : part;
    return value && typeof value === "object" && Object.hasOwn(value, key) ? value[key] : undefined;
  }, data);
}

function slotInstances(studyUnit, slot) {
  if (slot === "response") return studyUnit?.response ? [studyUnit.response] : [];
  return Array.isArray(studyUnit?.[slot]) ? studyUnit[slot] : [];
}

export function listCourseSourceOccurrenceTargets(studyUnit) {
  return SLOTS.flatMap((slot) => slotInstances(studyUnit, slot).flatMap((instance) => {
    if (RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, slot).valid !== true) return [];
    return RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, slot).flatMap((target) => {
      const value = readOwnPath(instance.data, target.path);
      return typeof value === "string" ? [{
        slot, resourceId: instance.id, path: target.path, label: target.label, text: value,
        preserveMarkup: target.preserveMarkup === true
      }] : [];
    });
  }));
}

function matchingQuoteCount(text, { quote, prefix, suffix }) {
  let found = 0;
  for (let start = text.indexOf(quote); start >= 0; start = text.indexOf(quote, start + 1)) {
    if (prefix !== null && !text.slice(0, start).endsWith(prefix)) continue;
    if (suffix !== null && !text.slice(start + quote.length).startsWith(suffix)) continue;
    if (++found > 1) return found;
  }
  return found;
}

function resolveFromTargets(targets, occurrence) {
  const candidates = targets.filter((target) => target.slot === occurrence.slot &&
    target.resourceId === occurrence.resourceId && target.path === occurrence.path);
  const resolved = candidates.length === 1 && matchingQuoteCount(candidates[0].text, occurrence) === 1;
  return { ...occurrence, status: resolved ? "resolved" : "needs_review" };
}

export function resolveCourseSourceOccurrence(studyUnit, value) {
  return resolveFromTargets(listCourseSourceOccurrenceTargets(studyUnit), normalizeCourseSourceOccurrence(value));
}

export function resolveCourseSourceOccurrences(studyUnit, value) {
  const targets = listCourseSourceOccurrenceTargets(studyUnit);
  return normalizeCourseSourceOccurrences(value).map((occurrence) => resolveFromTargets(targets, occurrence));
}

// A mesma lista de folhas já usada pelo editor instrumenta a cópia de renderização.
// Não acrescenta contenteditable nem marcadores ao conteúdo persistido.
export function courseSourceOccurrenceTextTargets(studyUnit, values) {
  const occurrences = values.map((value) => normalizeCourseSourceOccurrence(
    Object.fromEntries(FIELDS.map((field) => [field, value[field]]))
  ));
  const targets = listCourseSourceOccurrenceTargets(studyUnit);
  const resolved = occurrences.filter((occurrence) => resolveFromTargets(targets, occurrence).status === "resolved");
  return targets.filter((target) => resolved.some((occurrence) => occurrence.slot === target.slot &&
    occurrence.resourceId === target.resourceId && occurrence.path === target.path));
}
