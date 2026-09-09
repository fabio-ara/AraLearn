import { normalizeMicrosequenceExplanationPlan } from "./courseExplanation.js";
import { UUID_PATTERN } from "./identifiers.js";

const TYPES = Object.freeze({
  set_context: ["audience", "prerequisites"],
  save_scope_item: ["id", "statement", "position"],
  remove_scope_item: ["id"],
  save_module: ["moduleId", "title", "objective", "position"],
  save_lesson: ["lessonId", "moduleId", "title", "objective", "position"],
  save_microsequence: ["microsequenceId", "lessonId", "title", "objective", "position",
    "dependencyMicrosequenceIds", "scopeItemIds", "explanationPlan"],
  remove_branch: ["targetKind", "targetId"]
});
const CHILDREN = { module: "lessons", lesson: "microsequences" };
const fail = message => { throw new TypeError(message); };
const text = (value, maximum = 240) => typeof value === "string" && value === value.trim() &&
  value.length > 0 && value.length <= maximum && !/\p{Cc}/u.test(value);

function exact(value, fields, optional = []) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || fields.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !fields.includes(key) && !optional.includes(key))) fail("O mapa curricular contém uma estrutura inválida.");
}

export function normalizeCurricularMap(value) {
  exact(value, ["audience", "prerequisites", "scopeItems", "modules"]);
  if (typeof value.audience !== "string" || value.audience.length > 4000 || /\p{Cc}/u.test(value.audience) ||
      !Array.isArray(value.prerequisites) || value.prerequisites.length > 64 ||
      value.prerequisites.some(item => !text(item, 2000))) fail("O contexto curricular é inválido.");
  const ids = new Set();
  function list(items, kind) {
    if (!Array.isArray(items) || items.length > (kind === "scope_item" ? 256 : 64)) fail("A lista curricular é inválida.");
    return items.map((item, index) => {
      const identity = kind === "scope_item" ? "id" : `${kind}Id`;
      const child = CHILDREN[kind];
      const fields = TYPES[`save_${kind}`].filter(key => !["moduleId", "lessonId"].includes(key) || key === identity);
      exact(item, [...fields, ...(child ? [child] : [])]);
      if (item.position !== index || ids.has(`${kind}:${item[identity]}`)) fail("O mapa repete identidades ou posições.");
      ids.add(`${kind}:${item[identity]}`);
      const { [child]: descendants, ...own } = item;
      const normalized = normalizeCurricularMapSlice({ type: `save_${kind}`, ...own });
      delete normalized.type;
      return { ...normalized, ...(child ? { [child]: list(descendants, kind === "module" ? "lesson" : "microsequence") } : {}) };
    });
  }
  return { audience: value.audience, prerequisites: [...value.prerequisites], scopeItems: list(value.scopeItems, "scope_item"), modules: list(value.modules, "module") };
}

export function normalizeCurricularMapRead(value, expectedCourseId) {
  exact(value, ["contract", "courseId", "courseRevision", "planVersion", "map", "mapApprovalReference", "completeness"]);
  if (value.contract !== "aralearn.course-curricular-map.v1" || !UUID_PATTERN.test(value.courseId) ||
      expectedCourseId !== undefined && value.courseId !== expectedCourseId ||
      !Number.isSafeInteger(value.courseRevision) || value.courseRevision < 1 ||
      !Number.isSafeInteger(value.planVersion) || value.planVersion < 1 ||
      typeof value.mapApprovalReference !== "string" || value.mapApprovalReference.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/u.test(value.mapApprovalReference)) fail("A leitura não identifica a base curricular solicitada.");
  const map = normalizeCurricularMap(value.map);
  const completeness = inspectCurricularMapCompleteness(map);
  if (JSON.stringify(value.completeness) !== JSON.stringify(completeness)) fail("A completude do mapa não corresponde ao conteúdo.");
  return { ...value, map, completeness };
}

export function normalizeCurricularMapChange(value, { courseId, expectedCourseRevision, expectedPlanVersion, approval } = {}) {
  exact(value, ["contract", "courseId", "courseRevision", "planVersion", "approval", "changed", "idempotent"], ["deepLink"]);
  if (value.contract !== "aralearn.course-curricular-map-change.v1" || !UUID_PATTERN.test(value.courseId) ||
      courseId !== undefined && value.courseId !== courseId || !["draft", "approved"].includes(value.approval) ||
      approval !== undefined && value.approval !== approval || typeof value.changed !== "boolean" || typeof value.idempotent !== "boolean" ||
      !Number.isSafeInteger(value.courseRevision) || value.courseRevision < 1 || !Number.isSafeInteger(value.planVersion) || value.planVersion < 1 ||
      !value.idempotent && (expectedCourseRevision !== undefined && value.courseRevision !== expectedCourseRevision + Number(value.changed) ||
        expectedPlanVersion !== undefined && value.planVersion !== expectedPlanVersion + Number(value.changed))) fail("A confirmação não corresponde ao recorte curricular.");
  if (value.deepLink !== undefined) {
    const url = new URL(value.deepLink);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) fail("O destino curricular é inválido.");
  }
  return { ...value };
}

export function normalizeCurricularMapSlice(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || !Object.hasOwn(TYPES, value.type) ||
      Object.keys(value).some(key => key !== "type" && !TYPES[value.type].includes(key)) || Object.keys(value).length < 2) {
    fail("O recorte curricular deve indicar uma operação tipada e seus campos.");
  }
  const result = structuredClone(value);
  for (const [key, item] of Object.entries(result)) {
    if (["type", "explanationPlan"].includes(key)) continue;
    if (key === "position") {
      if (!Number.isSafeInteger(item) || item < 0 || item > (value.type.includes("scope_item") ? 255 : 63)) fail("Posição curricular inválida.");
    } else if (["prerequisites", "dependencyMicrosequenceIds", "scopeItemIds"].includes(key)) {
      if (!Array.isArray(item) || item.length > 64 || new Set(item).size !== item.length ||
          item.some(entry => !text(entry, key === "prerequisites" ? 2000 : 240))) fail("Referências curriculares inválidas.");
    } else if (!text(item, ["audience", "objective", "statement"].includes(key) ? 2000 : key === "title" ? 300 : 240)) {
      fail("O campo curricular está vazio ou excede seu alcance.");
    }
  }
  if (Object.hasOwn(result, "explanationPlan")) result.explanationPlan = normalizeMicrosequenceExplanationPlan(result.explanationPlan);
  const identity = value.type.includes("scope_item") ? "id" : value.type === "remove_branch" ? "targetId"
    : value.type.startsWith("save_") ? `${value.type.slice(5)}Id` : null;
  if (identity && !text(result[identity])) fail("O recorte precisa da identidade estável do objeto.");
  if (value.type.includes("scope_item") && !UUID_PATTERN.test(result.id)) fail("A identidade do item de escopo é inválida.");
  if (value.type === "remove_branch" && !["module", "lesson", "microsequence"].includes(result.targetKind)) fail("O ramo curricular é inválido.");
  return result;
}

function collection(map, kind) {
  if (kind === "module") return map.modules.map(item => ({ item, siblings: map.modules }));
  return map.modules.flatMap(module => kind === "lesson"
    ? module.lessons.map(item => ({ item, siblings: module.lessons, parent: module }))
    : module.lessons.flatMap(lesson => lesson.microsequences.map(item => ({ item, siblings: lesson.microsequences, parent: lesson }))));
}
function reindex(values) { values.forEach((item, position) => { item.position = position; }); }
function move(item, siblings, position) {
  const old = siblings.indexOf(item);
  if (old >= 0) siblings.splice(old, 1);
  siblings.splice(Math.min(position ?? (old >= 0 ? old : siblings.length), siblings.length), 0, item);
  reindex(siblings);
}

/** Applies only the selected semantic fields; descendants and other branches keep identities and values. */
export function applyCurricularMapSlice(map, input) {
  const command = normalizeCurricularMapSlice(input);
  const result = structuredClone(map);
  const { type, position, ...fields } = command;
  if (type === "set_context") return { ...result, ...fields };
  if (type.includes("scope_item")) {
    const item = result.scopeItems.find(value => value.id === command.id);
    if (type === "remove_scope_item") {
      if (!item) fail("O item de escopo não existe nesta versão do mapa.");
      result.scopeItems.splice(result.scopeItems.indexOf(item), 1);
      reindex(result.scopeItems);
    } else {
      if (!item && !fields.statement) fail("Um novo item de escopo precisa de enunciado.");
      const updated = item ?? { id: fields.id };
      Object.assign(updated, fields);
      move(updated, result.scopeItems, position);
    }
    return result;
  }
  const kind = type === "remove_branch" ? command.targetKind : type.slice(5);
  const identity = `${kind}Id`;
  const current = collection(result, kind).find(({ item }) => item[identity] === (fields[identity] ?? command.targetId));
  if (type === "remove_branch") {
    if (!current) fail("O ramo não existe nesta versão do mapa.");
    current.siblings.splice(current.siblings.indexOf(current.item), 1);
    reindex(current.siblings);
    return result;
  }
  const parentKind = kind === "lesson" ? "module" : kind === "microsequence" ? "lesson" : null;
  const parentId = parentKind ? fields[`${parentKind}Id`] : null;
  const parent = parentKind ? (parentId ? collection(result, parentKind).find(({ item }) => item[`${parentKind}Id`] === parentId)?.item : current?.parent) : null;
  if (parentKind && !parent) fail("Indique o ramo pai existente para este recorte.");
  if (parentKind) delete fields[`${parentKind}Id`];
  const siblings = parent ? parent[CHILDREN[parentKind]] : result.modules;
  if (!current && (!fields.title || !fields.objective)) fail("Um novo ramo precisa de título e objetivo.");
  const item = current?.item ?? { ...(CHILDREN[kind] ? { [CHILDREN[kind]]: [] } : {
    dependencyMicrosequenceIds: [], scopeItemIds: [],
    explanationPlan: { purpose: fields.objective, prerequisites: [], relations: [], sourceIds: [] }
  }) };
  if (current && current.siblings !== siblings) {
    current.siblings.splice(current.siblings.indexOf(item), 1);
    reindex(current.siblings);
  }
  Object.assign(item, fields);
  move(item, siblings, position);
  if (siblings.length > 64) fail("O ramo ultrapassa o limite de objetos irmãos.");
  return result;
}

export function inspectCurricularMapCompleteness(map) {
  const pending = [];
  const micros = collection(map, "microsequence").map(({ item }) => item);
  const order = new Map(micros.map((item, index) => [item.microsequenceId, index]));
  const scopes = new Set(map.scopeItems.map(item => item.id));
  const covered = new Set(micros.flatMap(item => item.scopeItemIds));
  if (!map.audience?.trim()) pending.push({ reason: "audience_missing" });
  if (!map.modules.length) pending.push({ reason: "modules_missing" });
  if (!scopes.size) pending.push({ reason: "scope_missing" });
  for (const { item } of collection(map, "module")) if (!item.lessons.length) pending.push({ reason: "lessons_missing", targetId: item.moduleId });
  for (const { item } of collection(map, "lesson")) if (!item.microsequences.length) pending.push({ reason: "microsequences_missing", targetId: item.lessonId });
  for (const item of map.scopeItems) if (!covered.has(item.id)) pending.push({ reason: "scope_uncovered", targetId: item.id });
  for (const item of micros) {
    for (const reference of item.dependencyMicrosequenceIds) if (!order.has(reference) || order.get(reference) >= order.get(item.microsequenceId)) {
      pending.push({ reason: order.has(reference) ? "dependency_order" : "dependency_missing", targetId: item.microsequenceId, reference });
    }
    for (const reference of item.scopeItemIds) if (!scopes.has(reference)) pending.push({ reason: "scope_reference_missing", targetId: item.microsequenceId, reference });
  }
  return { complete: pending.length === 0, pending };
}
