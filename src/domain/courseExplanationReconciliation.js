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
    if (text.trim() && !targets.some(target => target.resourceId === instance.id && target.text === text)) {
      targets.push({ slot: "content", resourceId: instance.id, path: "$", text });
    }
  }
  return targets;
}

function locatedRange(text, entry) {
  const ranges = [];
  for (let start = text.indexOf(entry.quote); start >= 0; start = text.indexOf(entry.quote, start + 1)) {
    if (entry.prefix !== null && !text.slice(0, start).endsWith(entry.prefix)) continue;
    if (entry.suffix !== null && !text.slice(start + entry.quote.length).startsWith(entry.suffix)) continue;
    ranges.push([start, start + entry.quote.length]);
  }
  return ranges.length === 1 ? ranges[0] : null;
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
    const range = target ? locatedRange(target.text, entry) : null;
    if (!range) add("explanation_reconciliation_locator_stale", "Uma passagem não corresponde univocamente à base corrente.", { entry: index + 1 });
    else rangesByTarget.get(key).push(range);
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
    const covered = rangesByTarget.get(`${target.resourceId}\0${target.path}`);
    // indexOf/slice ranges use UTF-16 offsets; iterate codepoints while retaining
    // those offsets so a supplementary character cannot hide the final passage.
    let offset = 0;
    const missing = [...target.text].some(character => {
      const start = offset; offset += character.length;
      return !/\s/u.test(character) && !covered.some(([from, end]) => start >= from && offset <= end);
    });
    if (missing) add("explanation_reconciliation_unmapped", "Há conteúdo da base sem classificação inspecionável.",
      { resourceId: target.resourceId, path: target.path });
  }
  return { ready: blockers.length === 0, blockers, introduced: [...introduced], requirements: [...requirements], deferred };
}
