import { validateCardEnvelope } from "../resources/kernel/cardEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";

function text(value) {
  return typeof value === "string" ? value : "";
}

function parsePath(path) {
  const segments = [];
  String(path || "").replace(/([^.[]+)|\[(\d+)\]/gu, (_match, key, index) => {
    segments.push(index === undefined ? key : Number(index));
    return "";
  });
  return segments;
}

function readPath(target, path) {
  return parsePath(path).reduce((value, segment) => value?.[segment], target);
}

function writePath(target, path, rawValue) {
  const segments = parsePath(path);
  const last = segments.pop();
  if (last === undefined) return false;
  const parent = segments.reduce((value, segment) => value?.[segment], target);
  if (!parent || typeof parent !== "object" || !Object.hasOwn(parent, last)) return false;
  const current = parent[last];
  if (typeof current === "number") {
    const numeric = Number(String(rawValue).trim());
    if (!Number.isFinite(numeric)) return false;
    parent[last] = numeric;
  } else {
    parent[last] = String(rawValue ?? "");
  }
  return true;
}

function resolveTarget(card, targetId) {
  const requested = text(targetId).trim();
  if (requested === "card") {
    return {
      value: card,
      targetKind: "card",
      targets: [{ path: "title", label: "Título" }]
    };
  }
  const [slot, ...idParts] = requested.split(":");
  const instanceId = idParts.join(":");
  if (!new Set(["content", "response", "feedback"]).has(slot) || !instanceId) return null;
  const instances = slot === "response"
    ? (card.response ? [card.response] : [])
    : card[slot];
  const instance = (Array.isArray(instances) ? instances : [])
    .find((candidate) => text(candidate?.id) === instanceId);
  if (!instance) return null;
  return {
    value: instance.data,
    targetKind: instance.package,
    targets: RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, slot)
  };
}

export function listManualCardEditablePaths(card = {}, targetId = "card") {
  const resolved = resolveTarget(card, targetId);
  if (!resolved) return [];
  return resolved.targets.map((target) => ({
    path: target.path,
    label: target.label || target.path,
    value: readPath(resolved.value, target.path),
    valueType: typeof readPath(resolved.value, target.path)
  }));
}

export function buildManualCardEditModel(card = {}, targetId = "card") {
  const resolved = resolveTarget(card, targetId);
  if (!resolved) return null;
  const pathFields = listManualCardEditablePaths(card, targetId);
  return {
    targetId,
    targetKind: resolved.targetKind,
    pathFields,
    fields: pathFields
      .filter(({ path }) => !path.includes(".") && !path.includes("["))
      .map((field) => ({
        key: field.path,
        label: field.label,
        type: "textarea",
        value: field.value
      }))
  };
}

export function applyManualCardEdit(card = {}, targetId = "card", values = {}) {
  const nextCard = structuredClone(card);
  const resolved = resolveTarget(nextCard, targetId);
  if (!resolved) throw new Error("O recurso selecionado deixou de existir.");
  const allowedPaths = new Set(resolved.targets.map(({ path }) => path));
  const pathValues = values?.pathValues && typeof values.pathValues === "object"
    ? values.pathValues
    : targetId === "card" && Object.hasOwn(values || {}, "title")
      ? { title: values.title }
      : {};
  Object.entries(pathValues).forEach(([path, value]) => {
    if (allowedPaths.has(path)) writePath(resolved.value, path, value);
  });
  const validation = validateCardEnvelope(nextCard, RESOURCE_PACKAGE_REGISTRY, "$.manualEdit.card");
  if (!validation.valid) {
    throw new Error(`A edição deixou o card inválido: ${validation.errors[0]}`);
  }
  return nextCard;
}

function fieldText(node) {
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return node.value;
  return String(node.textContent ?? "").replace(/\r\n?/gu, "\n");
}

export function activateManualCardEdit(container, draftValues = null) {
  if (!container) return;
  const values = draftValues?.pathValues && typeof draftValues.pathValues === "object"
    ? draftValues.pathValues
    : {};
  const fields = [...container.querySelectorAll("[data-manual-edit-path]")];
  fields.forEach((field, index) => {
    const path = field.getAttribute("data-manual-edit-path");
    if (Object.hasOwn(values, path)) {
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.value = String(values[path] ?? "");
      } else {
        field.textContent = String(values[path] ?? "");
      }
    }
    field.dataset.manualEditReady = "true";
    if (index === 0) field.dataset.cardAuthoringFocus = "manual-first-field";
  });
  container.classList.add("is-manual-edit-ready");
}

export function readManualCardEditPathValues(container) {
  if (!container) return {};
  return Object.fromEntries(
    [...container.querySelectorAll("[data-manual-edit-path]")]
      .map((node) => [node.getAttribute("data-manual-edit-path"), fieldText(node)])
      .filter(([path]) => Boolean(path))
  );
}
