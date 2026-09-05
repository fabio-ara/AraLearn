
import { validateStudyUnitEnvelope } from "../resources/kernel/studyUnitEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import {
  activateManualInlineFields,
  materializePackageManualEditFields,
  readManualInlineFieldValues,
  serializeManualEditableNode
} from "./manualInlineFields.js";

export { materializePackageManualEditFields, serializeManualEditableNode };

export function isAmbiguousManualStudyUnitWriteFailure(error) {
  const rawStatus = error?.status ?? error?.response?.status;
  const status = rawStatus == null || rawStatus === "" ? null : Number(rawStatus);
  const code = String(error?.code || error?.response?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  if (error?.ambiguous === true ||
      error?.name === "AbortError" || error?.name === "TimeoutError") return true;
  if (status != null && Number.isFinite(status)) {
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
  }
  if ([
    "40001", "access_revoked", "course_access_revoked", "course_not_found",
    "course_not_owned", "course_revision_changed", "forbidden",
    "invalid_course_command", "invalid_tool_argument", "pt404"
  ].includes(code) || code.startsWith("invalid_")) return false;
  return [
    "failed_to_fetch", "gateway_timeout", "network_error", "network_unavailable",
    "offline", "request_timeout", "service_unavailable"
  ].includes(code) ||
    /(?:failed to fetch|fetch failed|network|offline|load failed|connection|socket|timeout)/u
      .test(message) ||
    (status == null && !code);
}

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
  if (typeof parent[last] !== "string") return false;
  parent[last] = String(rawValue ?? "");
  return true;
}

function resolveTarget(studyUnit, targetId) {
  const requested = text(targetId).trim();
  if (requested === "study_unit") {
    return {
      value: studyUnit,
      targetKind: "study_unit",
      targets: [{ path: "title", label: "Título" }]
    };
  }
  const [slot, ...idParts] = requested.split(":");
  const instanceId = idParts.join(":");
  if (!new Set(["content", "response", "feedback"]).has(slot) || !instanceId) return null;
  const instances = slot === "response"
    ? (studyUnit.response ? [studyUnit.response] : [])
    : studyUnit[slot];
  const instance = (Array.isArray(instances) ? instances : [])
    .find((candidate) => text(candidate?.id) === instanceId);
  if (!instance) return null;
  return {
    value: instance.data,
    targetKind: instance.package,
    slot,
    instanceId: instance.id,
    targets: RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, slot)
  };
}

export function listManualStudyUnitEditablePaths(studyUnit = {}, targetId = "study_unit") {
  const resolved = resolveTarget(studyUnit, targetId);
  if (!resolved) return [];
  return resolved.targets.map((target) => {
    const value = readPath(resolved.value, target.path);
    return {
      path: target.path,
      label: target.label || target.path,
      value,
      valueType: typeof value,
      preserveWhitespace: target.preserveWhitespace === true
    };
  }).filter(({ valueType }) => valueType === "string");
}

export function listManualStudyUnitTargetIds(studyUnit = {}) {
  const entries = [
    ...(Array.isArray(studyUnit.content)
      ? studyUnit.content.map((instance) => ["content", instance])
      : []),
    ...(studyUnit.response ? [["response", studyUnit.response]] : []),
    ...(Array.isArray(studyUnit.feedback)
      ? studyUnit.feedback.map((instance) => ["feedback", instance])
      : [])
  ];
  return entries
    .map(([slot, instance]) => `${slot}:${instance?.id || ""}`)
    .filter((targetId) => targetId.split(":")[1] &&
      listManualStudyUnitEditablePaths(studyUnit, targetId).length > 0);
}

export function buildManualStudyUnitEditModel(studyUnit = {}, targetId = "study_unit") {
  const resolved = resolveTarget(studyUnit, targetId);
  if (!resolved) return null;
  const pathFields = listManualStudyUnitEditablePaths(studyUnit, targetId);
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

export function applyManualStudyUnitEdit(studyUnit = {}, targetId = "study_unit", values = {}) {
  const nextStudyUnit = structuredClone(studyUnit);
  const resolved = resolveTarget(nextStudyUnit, targetId);
  if (!resolved) throw new Error("O recurso selecionado deixou de existir.");
  const allowedPaths = new Set(
    resolved.targets
      .filter(({ path }) => typeof readPath(resolved.value, path) === "string")
      .map(({ path }) => path)
  );
  const pathValues = values?.pathValues && typeof values.pathValues === "object"
    ? values.pathValues
    : targetId === "study_unit" && Object.hasOwn(values || {}, "title")
      ? { title: values.title }
      : {};
  Object.entries(pathValues).forEach(([path, value]) => {
    if (!allowedPaths.has(path)) return;
    const oldValue = readPath(resolved.value, path);
    const newValue = String(value ?? "");
    if (!writePath(resolved.value, path, newValue)) return;
    if (resolved.slot === "content") {
      RESOURCE_PACKAGE_REGISTRY.reconcileResponseTextEdit(nextStudyUnit, {
        instanceId: resolved.instanceId, path, oldValue, newValue
      });
    }
  });
  const validation = validateStudyUnitEnvelope(
    nextStudyUnit,
    RESOURCE_PACKAGE_REGISTRY,
    "$.manualEdit.studyUnit"
  );
  if (!validation.valid) {
    throw new Error("A edição deixou a unidade de estudo incompleta ou inválida.");
  }
  return nextStudyUnit;
}

export function activateManualStudyUnitEdit(container, draftValues = null) {
  return activateManualInlineFields(container, draftValues);
}

export function readManualStudyUnitEditPathValues(container) {
  return readManualInlineFieldValues(container);
}
