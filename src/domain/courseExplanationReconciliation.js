import { listCourseSourceOccurrenceTargets, normalizeCourseSourceOccurrence } from "./courseSourceOccurrences.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";

export const EXPLANATION_RECONCILIATION_CONTRACT = "aralearn.explanation-reconciliation.v1";
export const EXPLANATION_ELEMENT_ROLES = Object.freeze([
  "introduced", "established", "revisited", "preview", "example", "support", "deferred"
]);
const fields = ["resourceId", "path", "quote", "prefix", "suffix", "role", "analysisUnitIds",
  "evidenceRequirementIds", "destinationMicrosequenceId", "reason"];
const plain = value => Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonempty = (value, maximum = 4000) => typeof value === "string" && value.trim() && [...value].length <= maximum &&
  ![...value].some(character => {
    const point = character.codePointAt(0);
    return point < 32 && ![9, 10, 13].includes(point) || point >= 127 && point <= 159;
  });
const identifier = value => nonempty(value, 300) && value === value.trim() && !/[\t\r\n]/u.test(value);
const normalizedWhitespace = value => value.replace(/\s+/gu, " ").trim();
// The passage locator is derived state: the server confronts the declared
// selector with the current base and derives the literal range. Offsets,
// context strings and exact copies are never the author's obligation, and a
// real ambiguity returns explicit candidates in the same response.
export const RECONCILIATION_PASSAGE_TEXT_LIMIT = 1000;
export const RECONCILIATION_PASSAGE_LIMIT = 12;
export const RECONCILIATION_CANDIDATE_LIMIT = 8;

function presentationIndex(text, { stripMarkup = false } = {}) {
  const map = [], ends = [];
  let normalized = "", index = 0;
  while (index < text.length) {
    const character = text[index];
    if (stripMarkup && character === "`") { index += 1; continue; }
    if (/\s/u.test(character)) {
      let end = index;
      while (end < text.length && /\s/u.test(text[end])) end += 1;
      normalized += " ";
      map.push(index); ends.push(end);
      index = end;
      continue;
    }
    normalized += character;
    map.push(index); ends.push(index + character.length);
    index += character.length;
  }
  return { normalized, map, ends };
}

function selectorText(value, stripMarkup) {
  if (typeof value !== "string" || !value.length) return null;
  return presentationIndex(value, { stripMarkup }).normalized;
}

function indexedRanges(index, needle) {
  const ranges = [];
  for (let start = index.normalized.indexOf(needle); start >= 0; start = index.normalized.indexOf(needle, start + 1)) {
    ranges.push([start, start + needle.length]);
  }
  return ranges;
}

function literalSpan(index, [start, end]) {
  return [index.map[start], index.ends[end - 1]];
}

function passageCandidates(text, spans) {
  // A posição na lista é a ocorrência a informar; o texto é o trecho literal.
  return spans.slice(0, RECONCILIATION_CANDIDATE_LIMIT)
    .map(([start, end]) => text.slice(start, end).slice(0, RECONCILIATION_PASSAGE_TEXT_LIMIT));
}

export function locateExplanationPassage(text, selector = {}, { preserveMarkup = false } = {}) {
  const occurrence = Number.isSafeInteger(selector.occurrence) && selector.occurrence >= 1 ? selector.occurrence : null;
  let ambiguous = null;
  for (const stripMarkup of preserveMarkup ? [false, true] : [false]) {
    const index = presentationIndex(text, { stripMarkup });
    const needle = selectorText(selector.quote, stripMarkup);
    if (!needle) continue;
    const prefix = selectorText(selector.prefix, stripMarkup);
    const suffix = selectorText(selector.suffix, stripMarkup);
    const matches = indexedRanges(index, needle).filter(([start, end]) =>
      (prefix === null || index.normalized.slice(0, start).endsWith(prefix)) &&
      (suffix === null || index.normalized.slice(end).startsWith(suffix)));
    if (!matches.length) continue;
    if (occurrence !== null && occurrence <= matches.length) {
      return { status: "located", range: literalSpan(index, matches[occurrence - 1]) };
    }
    if (occurrence === null && matches.length === 1) return { status: "located", range: literalSpan(index, matches[0]) };
    ambiguous ||= { status: "ambiguous", candidates: passageCandidates(text, matches.map(match => literalSpan(index, match))) };
  }
  return ambiguous || { status: "missing" };
}

export function canonicalReconciliationLocator(text, [start, end]) {
  const quote = text.slice(start, end);
  const count = ({ prefix, suffix }) => {
    let found = 0;
    for (let cursor = text.indexOf(quote); cursor >= 0; cursor = text.indexOf(quote, cursor + 1)) {
      if (prefix !== null && !text.slice(0, cursor).endsWith(prefix)) continue;
      if (suffix !== null && !text.slice(cursor + quote.length).startsWith(suffix)) continue;
      found += 1;
    }
    return found;
  };
  if (count({ prefix: null, suffix: null }) === 1) return { quote, prefix: null, suffix: null };
  const suffix = text.slice(end, end + 500);
  if (suffix && count({ prefix: null, suffix }) === 1) return { quote, prefix: null, suffix };
  const prefix = text.slice(Math.max(0, start - 500), start);
  if (prefix && count({ prefix, suffix: null }) === 1) return { quote, prefix, suffix: null };
  if (prefix && suffix && count({ prefix, suffix }) === 1) return { quote, prefix, suffix };
  return { quote, prefix: null, suffix: null };
}


export function normalizeExplanationReconciliation(value) {
  if (!plain(value) || value.contract !== EXPLANATION_RECONCILIATION_CONTRACT ||
      !/^[a-f0-9]{64}$/u.test(value.contentBasis) || !Array.isArray(value.entries) ||
      !value.entries.length || value.entries.length > 512 ||
      Object.keys(value).some(key => !["contract", "contentBasis", "entries"].includes(key)) ||
      new TextEncoder().encode(JSON.stringify(value)).byteLength > 1572864) {
    throw new TypeError("A reconciliação exige a versão da base e suas passagens classificadas.");
  }
  return { contract: value.contract, contentBasis: value.contentBasis, entries: value.entries.map(entry => {
    if (!plain(entry) || Object.keys(entry).length !== fields.length || fields.some(key => !Object.hasOwn(entry, key)) ||
        !EXPLANATION_ELEMENT_ROLES.includes(entry.role) || !nonempty(entry.reason) ||
        [entry.analysisUnitIds, entry.evidenceRequirementIds].some(ids => !Array.isArray(ids) || ids.length > 64 ||
          ids.some(id => !identifier(id)) || new Set(ids).size !== ids.length) ||
        entry.destinationMicrosequenceId !== null && !identifier(entry.destinationMicrosequenceId) ||
        ["introduced", "established", "revisited"].includes(entry.role) && !entry.analysisUnitIds.length) {
      throw new TypeError("Uma passagem reconciliada tem classificação, localização ou repertório inválidos.");
    }
    normalizeCourseSourceOccurrence({ occurrenceId: "reconciliation", slot: "content", resourceId: entry.resourceId,
      path: entry.path, quote: entry.quote, prefix: entry.prefix, suffix: entry.suffix }, { targetKind: "microsequence_explanation" });
    return structuredClone(entry);
  }) };
}

export function explanationReconciliationTargets(explanation) {
  const targets = listCourseSourceOccurrenceTargets(explanation, { targetKind: "microsequence_explanation" });
  // Non-textual representations still require an explicit declaration on their
  // accessible content; they cannot disappear from the coverage denominator.
  for (const instance of explanation?.content ?? []) {
    if (!RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, "content").valid) continue;
    const text = RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, "content");
    // Compare presentation only; all passage locators and coverage retain the
    // original literal leaf, including whitespace and inline-code delimiters.
    const equivalentLeaf = targets.some(target => target.resourceId === instance.id &&
      normalizedWhitespace(target.preserveMarkup ? target.text.replace(/`/gu, "") : target.text) === normalizedWhitespace(text));
    // Previously saved declarations may also classify the accessible rendering.
    const declaredAccessible = Array.isArray(explanation.reconciliation?.entries) && explanation.reconciliation.entries.some(entry =>
      entry.resourceId === instance.id && entry.path === "$");
    if (text.trim() && (!equivalentLeaf || declaredAccessible)) {
      targets.push({ slot: "content", resourceId: instance.id, path: "$", text });
    }
  }
  return targets;
}

export function inspectExplanationReconciliation(explanation, { contentBasis, analysisUnitIds = [],
  evidenceRequirementIds = [], microsequenceIds = [] } = {}) {
  const blockers = [];
  const add = (code, message, details = {}) => blockers.push({ code, message, ...details });
  let reconciliation;
  try { reconciliation = normalizeExplanationReconciliation(explanation?.reconciliation); }
  catch { return { ready: false, blockers: [{ code: "explanation_reconciliation_required",
    message: "Classifique as passagens da Explicação corrente e vincule o repertório antes de declarar prontidão." }], introduced: [], requirements: [], deferred: [] }; }
  if (reconciliation.contentBasis !== contentBasis) add("explanation_reconciliation_stale",
    "A Explicação mudou depois da reconciliação; releia e reconcilie a base corrente.");
  const targets = explanationReconciliationTargets(explanation);
  for (const instance of explanation?.content ?? []) {
    if (!RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, "content").valid) {
      add("explanation_reconciliation_resource_unavailable", "Um recurso da base não tem leitura válida para reconciliação.", { resourceId: instance.id });
    }
  }
  const rangesByTarget = new Map(targets.map(target => [`${target.resourceId}\0${target.path}`, []]));
  const introduced = new Set();
  const requirements = new Set();
  const deferred = [];
  for (const [index, entry] of reconciliation.entries.entries()) {
    const key = `${entry.resourceId}\0${entry.path}`;
    const target = targets.find(item => item.resourceId === entry.resourceId && item.path === entry.path);
    const located = target
      ? locateExplanationPassage(target.text, entry, { preserveMarkup: target.preserveMarkup === true })
      : { status: "missing" };
    if (located.status !== "located") {
      add("explanation_reconciliation_locator_stale", "Uma passagem não corresponde univocamente à base corrente.",
        { entry: index + 1, ...(located.status === "ambiguous" ? { candidates: located.candidates } : {}) });
    } else rangesByTarget.get(key).push(located.range);
    for (const id of entry.analysisUnitIds) {
      if (!analysisUnitIds.includes(id)) add("human_reference_not_found", "Uma ideia da Explicação ainda não pertence ao repertório persistido.", { entry: index + 1 });
      if (entry.role === "introduced") introduced.add(id);
    }
    for (const id of entry.evidenceRequirementIds) {
      if (!evidenceRequirementIds.includes(id)) add("human_reference_not_found", "Um requisito da Explicação ainda não pertence ao repertório persistido.", { entry: index + 1 });
      if (!["preview", "deferred"].includes(entry.role)) requirements.add(id);
    }
    if (["preview", "deferred"].includes(entry.role)) {
      if (entry.role === "deferred" && !entry.destinationMicrosequenceId) {
        add("explanation_reconciliation_dependency_pending", "Uma dependência adiada ainda precisa de destino ou resolução.", { entry: index + 1 });
      }
      if (entry.destinationMicrosequenceId && !microsequenceIds.includes(entry.destinationMicrosequenceId)) {
        add("explanation_reconciliation_destination_missing", "O destino previsto deixou de existir.", { entry: index + 1 });
      }
      deferred.push({ entry: index + 1, destinationMicrosequenceId: entry.destinationMicrosequenceId,
        state: entry.destinationMicrosequenceId ? "planned" : "pending" });
    }
  }
  for (const target of targets) {
    const covered = [...rangesByTarget.get(`${target.resourceId}\0${target.path}`)]
      .sort((left, right) => left[0] - right[0]);
    const passages = [];
    const pending = text => {
      const trimmed = text.trim();
      if (!trimmed) return;
      passages.push(trimmed.slice(0, RECONCILIATION_PASSAGE_TEXT_LIMIT));
    };
    let offset = 0;
    for (const [from, end] of covered) {
      if (from > offset) pending(target.text.slice(offset, from));
      offset = Math.max(offset, end);
    }
    if (offset < target.text.length) pending(target.text.slice(offset));
    if (passages.length) add("explanation_reconciliation_unmapped", "Há conteúdo da base sem classificação inspecionável.",
      { resourceId: target.resourceId, path: target.path, passages: passages.slice(0, RECONCILIATION_PASSAGE_LIMIT),
        ...(passages.length > RECONCILIATION_PASSAGE_LIMIT ? { pending: passages.length } : {}) });
  }
  return { ready: blockers.length === 0, blockers, introduced: [...introduced], requirements: [...requirements], deferred };
}
