// One-time IndexedDB upgrade. No renderer, reader or authoring fallback imports this.
// Originals remain exportable through the existing draft-recovery mechanism.
import { STUDY_DRAFT_RECOVERY_CACHE_KEY, STUDY_DRAFT_RECOVERY_CONTRACT } from "./studyDraftRecovery.js";

const consultations = new Set(["aralearn.resource.dictionary", "aralearn.resource.grammar", "aralearn.resource.reading"]);
const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const plain = value => value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;

// The cache also holds binary media and unrelated structured-clone values.
// Only component-bearing documents need JSON conversion or recovery snapshots.
function needsConversion(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return false;
  visited.add(value);
  if (plain(value) && (consultations.has(value.package) || value.package === "aralearn.response.open" ||
      value.package === "aralearn.resource.table" && ["prompt", "caption", "layout"].some(key => Object.hasOwn(value.data ?? {}, key)))) return true;
  return (Array.isArray(value) || plain(value)) && Object.values(value).some(child => needsConversion(child, visited));
}

export function convertCachedCourseContentV7(value) {
  const identifiers = new Set();
  const collect = node => {
    if (Array.isArray(node)) node.forEach(collect);
    else if (plain(node)) {
      if (node.package && typeof node.id === "string") identifiers.add(node.id);
      Object.values(node).forEach(collect);
    }
  };
  collect(value);
  let ordinal = 0;
  const nextId = () => {
    let id;
    do { id = `converted-v7-${++ordinal}`; } while (identifiers.has(id));
    identifiers.add(id); return id;
  };
  const component = node => {
    const data = node.data;
    if (consultations.has(node.package)) {
      return [paragraph(node.id, data.title), ...(data.prompt ? [paragraph(nextId(), data.prompt)] : []),
        ...data.items.flatMap(item => [paragraph(nextId(), item.label),
          ...(item.description ? [paragraph(nextId(), item.description)] : []),
          // Offline prose retains the original address without weakening URL rules.
          ...(item.target.kind === "url" ? [paragraph(nextId(), item.target.url)] : [])])];
    }
    if (node.package === "aralearn.resource.table" && ["prompt", "caption", "layout"].some(key => Object.hasOwn(data, key))) {
      const { prompt, caption } = data;
      const semantic = Object.fromEntries(Object.entries(data).filter(([key]) => !["prompt", "caption", "layout"].includes(key)));
      if (caption) semantic.note = caption;
      return [...(prompt ? [paragraph(nextId(), prompt)] : []), { ...node, data: semantic }];
    }
    return [structuredClone(node)];
  };
  const convert = node => {
    if (Array.isArray(node)) return node.flatMap(item => plain(item) && item.package ? component(item) : [convert(item)]);
    if (!plain(node)) return structuredClone(node);
    let input = node;
    if (node.response?.package === "aralearn.response.open") {
      const { prompt, placeholder } = node.response.data;
      input = { ...node, role: "theory", response: null, feedback: [],
        content: [...node.content, paragraph(node.response.id, prompt),
          ...(placeholder ? [paragraph(nextId(), placeholder)] : []), ...node.feedback] };
    }
    const result = Object.fromEntries(Object.entries(input).map(([key, child]) => [key, convert(child)]));
    if (Object.hasOwn(node, "content") && JSON.stringify(node.content) !== JSON.stringify(result.content)) {
      if (node.contentReview?.state === "current") result.contentReview = { ...node.contentReview, state: "stale" };
      if (node.aiInspection?.state === "current") result.aiInspection = { ...node.aiInspection, state: "stale" };
    }
    return result;
  };
  return convert(value);
}

export function upgradeCachedCourseContentV7(store) {
  const rows = [];
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) { rows.push(cursor.value); cursor.continue(); return; }
    try {
      const recoveryRow = rows.find(row => row.key === STUDY_DRAFT_RECOVERY_CACHE_KEY);
      const recoveries = recoveryRow ? structuredClone(recoveryRow.value) : { contract: STUDY_DRAFT_RECOVERY_CONTRACT, entries: [] };
      if (recoveries.contract !== STUDY_DRAFT_RECOVERY_CONTRACT || !Array.isArray(recoveries.entries)) throw new TypeError("Recuperação desconhecida.");
      for (const row of rows.filter(item => item.key !== STUDY_DRAFT_RECOVERY_CACHE_KEY)) {
        if (!needsConversion(row.value)) continue;
        const next = convertCachedCourseContentV7(row.value);
        if (JSON.stringify(row.value) === JSON.stringify(next)) continue;
        let recoveryId = `component-upgrade-v7-${recoveries.entries.length + 1}`;
        while (recoveries.entries.some(entry => entry.recoveryId === recoveryId)) recoveryId += "x";
        recoveries.entries.push({ recoveryId, sourceCourseId: null, requestId: null, command: null,
          studyUnit: null, targetId: null, originalSnapshot: structuredClone(row) });
        store.put({ ...row, value: next });
      }
      // Earlier recoveries are immutable evidence, not executable legacy content.
      // A command containing a retired shape loses replay authority and can be exported.
      for (const entry of recoveries.entries) if (entry.command && needsConversion(entry.command)) entry.command = null;
      if (recoveries.entries.length) store.put({ key: STUDY_DRAFT_RECOVERY_CACHE_KEY, value: recoveries });
    } catch {
      // A failed conversion rolls back every row and retains the original database.
      store.transaction.abort();
    }
  };
}
