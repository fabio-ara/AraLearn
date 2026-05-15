const OPERATIONS = new Set(["create", "extend", "repair", "replace", "merge", "reorder", "reinforce"]);
const LEVELS = new Set(["project", "course", "module", "lesson", "microsequence"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAttachments(attachments = []) {
  return Array.isArray(attachments)
    ? attachments
        .map((item, index) => ({
          id: text(item?.id) || `attachment_${index + 1}`,
          name: text(item?.name) || `Anexo ${index + 1}`,
          kind: text(item?.kind) || "attachment",
          mimeType: text(item?.mimeType || item?.type) || "application/octet-stream",
          textContent: text(item?.textContent),
          fileRef: text(item?.fileRef)
        }))
        .filter((item) => item.name)
    : [];
}

export function resolveCourseForgeIntent(input = {}) {
  const operation = text(input.operation) || "create";
  if (!OPERATIONS.has(operation)) {
    throw new Error(`Operação top-down inválida: "${operation}".`);
  }

  const level = text(input?.scope?.level) || "project";
  if (!LEVELS.has(level)) {
    throw new Error(`Escopo top-down inválido: "${level}".`);
  }

  return {
    intentId: "courseforge.intent.v1",
    operation,
    scope: {
      level,
      courseKey: text(input?.scope?.courseKey),
      moduleKey: text(input?.scope?.moduleKey),
      lessonKey: text(input?.scope?.lessonKey),
      microsequenceKey: text(input?.scope?.microsequenceKey)
    },
    promptText: text(input.promptText),
    attachments: normalizeAttachments(input.attachments),
    selectedTopDownProfileId: text(input.selectedTopDownProfileId) || "codex_all",
    phaseModelOverrides: input.phaseModelOverrides && typeof input.phaseModelOverrides === "object"
      ? structuredClone(input.phaseModelOverrides)
      : {},
    createdAt: text(input.createdAt) || new Date().toISOString()
  };
}
