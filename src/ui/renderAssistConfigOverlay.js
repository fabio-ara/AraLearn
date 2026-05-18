import { renderUiIcon } from "./renderUiIcons.js";
import { listCourseModelOptions } from "../generation/runtime/courseModelSemantics.js";

const MICROSEQUENCE_RANGE_MIN = 1;
const MICROSEQUENCE_RANGE_MAX = 12;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOptionList(items = [], selectedValue = "") {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const value = escapeHtml(item?.value || "");
      const label = escapeHtml(item?.label || item?.value || "");
      return `<option value="${value}"${item?.value === selectedValue ? " selected" : ""}>${label}</option>`;
    })
    .join("");
}

function renderIconAction(action, iconName, title, { disabled = false, extraClassName = "" } = {}) {
  return (
    `<button class="icon-ghost assist-config-icon-action ${escapeHtml(extraClassName)}" type="button" data-action="${escapeHtml(action)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"${disabled ? ' disabled aria-disabled="true"' : ""}>` +
    renderUiIcon(iconName, "assist-config-action-icon") +
    "</button>"
  );
}

function renderBooleanToggle({ field, title, iconName, checked = false } = {}) {
  return (
    `<button class="assist-config-toggle-chip${checked ? " is-active" : ""}" type="button" data-action="toggle-assist-config-flag" data-field="${escapeHtml(field)}" aria-pressed="${checked ? "true" : "false"}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">` +
    renderUiIcon(iconName, "assist-config-toggle-icon") +
    "</button>"
  );
}

function clampInteger(value, fallback, min = MICROSEQUENCE_RANGE_MIN, max = MICROSEQUENCE_RANGE_MAX) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function toPercent(value, min = MICROSEQUENCE_RANGE_MIN, max = MICROSEQUENCE_RANGE_MAX) {
  const span = Math.max(1, max - min);
  return ((value - min) / span) * 100;
}

function renderMicrosequenceRangeField(profileTuning = {}) {
  const minValue = clampInteger(profileTuning.minMicrosequences, 3);
  const maxValue = Math.max(minValue, clampInteger(profileTuning.maxMicrosequences, 8));
  const targetValue = Math.min(
    maxValue,
    Math.max(minValue, clampInteger(profileTuning.targetMicrosequences, 5))
  );
  const style = [
    `--assist-range-start:${toPercent(minValue)}`,
    `--assist-range-target:${toPercent(targetValue)}`,
    `--assist-range-end:${toPercent(maxValue)}`
  ].join(";");

  return (
    '<div class="assist-config-field assist-config-microsequence-range-field">' +
    renderFieldLabel(
      "microsequence",
      "Microssequências por lição",
      "Faixa de granularidade do top-down para cada lição"
    ) +
    `<div class="assist-config-range-shell" data-field="assist-config-microsequence-range-shell" style="${style}">` +
    '<div class="assist-config-range-track" aria-hidden="true"></div>' +
    '<div class="assist-config-range-band" aria-hidden="true"></div>' +
    `<div class="assist-config-range-handle-label assist-config-range-handle-label-min" data-role="assist-config-min-microsequences-label">${escapeHtml(minValue)}</div>` +
    `<div class="assist-config-range-handle-label assist-config-range-handle-label-target" data-role="assist-config-target-microsequences-label">${escapeHtml(targetValue)}</div>` +
    `<div class="assist-config-range-handle-label assist-config-range-handle-label-max" data-role="assist-config-max-microsequences-label">${escapeHtml(maxValue)}</div>` +
    `<input class="assist-config-range-input assist-config-range-input-min" data-field="assist-config-min-microsequences" type="range" min="${MICROSEQUENCE_RANGE_MIN}" max="${MICROSEQUENCE_RANGE_MAX}" step="1" value="${escapeHtml(minValue)}" aria-label="Microssequências por lição mínimo" title="Mínimo de microssequências por lição">` +
    `<input class="assist-config-range-input assist-config-range-input-target" data-field="assist-config-target-microsequences" type="range" min="${MICROSEQUENCE_RANGE_MIN}" max="${MICROSEQUENCE_RANGE_MAX}" step="1" value="${escapeHtml(targetValue)}" aria-label="Microssequências por lição esperado" title="Quantidade esperada de microssequências por lição">` +
    `<input class="assist-config-range-input assist-config-range-input-max" data-field="assist-config-max-microsequences" type="range" min="${MICROSEQUENCE_RANGE_MIN}" max="${MICROSEQUENCE_RANGE_MAX}" step="1" value="${escapeHtml(maxValue)}" aria-label="Microssequências por lição máximo" title="Máximo de microssequências por lição">` +
    "</div>" +
    '<div class="assist-config-range-values" aria-hidden="true">' +
    `<span>Mín. ${escapeHtml(minValue)}</span>` +
    `<span>Máx. ${escapeHtml(maxValue)}</span>` +
    "</div></div>"
  );
}

function renderFieldLabel(iconName, label, title = "") {
  const resolvedTitle = title || label;
  return (
    `<span class="assist-config-inline-label" title="${escapeHtml(resolvedTitle)}" aria-label="${escapeHtml(resolvedTitle)}">` +
    renderUiIcon(iconName, "assist-config-field-icon") +
    `<span>${escapeHtml(label)}</span></span>`
  );
}

function renderSectionLabel(iconName, label, title = "") {
  const resolvedTitle = title || label;
  return (
    `<p class="assist-config-section-label" title="${escapeHtml(resolvedTitle)}" aria-label="${escapeHtml(resolvedTitle)}">` +
    renderUiIcon(iconName, "assist-config-section-icon") +
    `<span>${escapeHtml(label)}</span></p>`
  );
}

export function renderAssistConfigPanel({
  didacticProfileId,
  profileTuning = {},
  didacticProfileOptions = [],
  profileEditor = null,
  inline = false
} = {}) {
  const courseModelOptions = listCourseModelOptions(profileTuning.courseModel?.learningTrail || "");
  const isProfileEditing = Boolean(profileEditor?.active);
  const canDeleteProfile = profileEditor?.canDelete === true;
  const canEditProfile = profileEditor?.canEdit === true && !isProfileEditing;
  const canSaveProfile = profileEditor?.canSave === true;
  const profileLabel = profileEditor?.draftLabel || "";
  const profileState = profileEditor?.state || "saved";
  const profileStateIconName =
    profileState === "editing"
      ? "edit"
      : profileState === "dirty"
        ? "draft-state"
        : "ready-state";
  return (
    '<section class="assist-config-panel assist-config-panel-inline' +
    (inline ? " is-inline" : "") +
    '" aria-label="Planejamento didático">' +
    '<header class="assist-config-inline-head">' +
    '<div class="assist-config-inline-heading">' +
    (inline
      ? '<div class="assist-config-inline-title-row" title="Parâmetros que entram no planejamento top-down da trilha" aria-label="Parâmetros que entram no planejamento top-down da trilha">' +
        renderUiIcon("trail", "assist-config-inline-title-icon") +
        '<h3 class="assist-config-inline-title">Planejamento didático</h3>' +
        "</div>"
      : renderSectionLabel("trail", "Planejamento didático", "Parâmetros que entram no planejamento top-down da trilha")) +
    "</div>" +
    '<div class="lesson-top-actions assist-config-head-actions">' +
    renderIconAction("assist-config-reset-profile", "draft-state", "Resetar perfil") +
    "</div></header>" +
    '<label class="field assist-config-field assist-config-course-request-field">' +
    renderFieldLabel("trail", "Perfil", "Descreve o perfil e a trilha para a IA completar a modelagem") +
    `<textarea data-field="assist-config-course-model-description" aria-label="Modelagem do curso" title="Descreve o curso para a IA completar a modelagem" placeholder="Descreva a trilha do curso, a progressão de microssequências e o perfil do estudante.">${escapeHtml(profileTuning.courseModel?.description || "")}</textarea>` +
    '<div class="assist-config-profile-toolbar">' +
    '<div class="assist-config-profile-toolbar-main">' +
    (isProfileEditing
      ? `<input data-field="assist-config-profile" type="text" value="${escapeHtml(profileLabel)}" autocomplete="off" spellcheck="false" placeholder="Nome do perfil" title="Nome do perfil">`
      : '<select data-field="assist-config-profile" aria-label="Perfil didático" title="Escolhe o estilo-base da trilha">' +
        renderOptionList(didacticProfileOptions, didacticProfileId) +
        "</select>") +
    "</div>" +
    '<div class="assist-config-profile-toolbar-actions">' +
    renderIconAction("assist-config-start-create-profile", "add", "Criar novo perfil", { disabled: isProfileEditing }) +
    renderIconAction("assist-config-delete-profile", "trash", "Excluir perfil selecionado", { disabled: !canDeleteProfile }) +
    renderIconAction("assist-config-edit-profile", "edit", "Editar nome do perfil selecionado", { disabled: !canEditProfile }) +
    renderIconAction("assist-config-infer-course-model", "sparkles", "Ler o pedido e completar o planejamento", { extraClassName: "is-primary" }) +
    "</div>" +
    "</div>" +
    "</label>" +
    '<label class="field assist-config-field assist-config-student-field">' +
    renderFieldLabel("prompt", "Para quem", "Ajusta a trilha ao nível e ao tempo do estudante") +
    `<input data-field="assist-config-target-student-profile" type="text" value="${escapeHtml(profileTuning.targetStudentProfile || "")}" autocomplete="off" spellcheck="false" placeholder="Perfil do estudante" title="Ajusta a trilha ao nível e ao tempo do estudante">` +
    "</label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("trail", "Trilha", "Que tipo de trilha didática organiza este curso") +
    '<select data-field="assist-config-course-learning-trail" aria-label="Trilha do curso" title="Que tipo de trilha didática organiza este curso">' +
    renderOptionList([{ value: "", label: "Selecionar" }, ...courseModelOptions.learningTrail], profileTuning.courseModel?.learningTrail || "") +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("microsequence", "Progressão de microssequências", "Como uma microssequência sucede a outra nesta trilha") +
    '<select data-field="assist-config-course-microsequence-progression" aria-label="Progressão de microssequências" title="Como uma microssequência sucede a outra nesta trilha">' +
    renderOptionList(
      [{ value: "", label: profileTuning.courseModel?.learningTrail ? "Selecionar" : "Escolha a trilha" }, ...courseModelOptions.microsequenceProgression],
      profileTuning.courseModel?.microsequenceProgression || ""
    ) +
    "</select></label>" +
    renderMicrosequenceRangeField(profileTuning) +
    '<div class="assist-config-footer">' +
    '<div class="assist-config-footer-main">' +
    renderBooleanToggle({
      field: "requireCoreCoverageBeforeExtensions",
      title: "Esgotar assunto antes de expandir",
      iconName: "ready-state",
      checked: profileTuning.requireCoreCoverageBeforeExtensions !== false
    }) +
    "</div>" +
    '<div class="assist-config-footer-actions">' +
    renderIconAction("assist-config-profile-state", profileStateIconName, `Estado do perfil: ${profileState}`, { extraClassName: `assist-config-status-action is-${profileState}`, disabled: true }) +
    renderIconAction("assist-config-save-profile", "save", "Salvar perfil", { disabled: !canSaveProfile, extraClassName: "assist-config-save-action" }) +
    "</div>" +
    "</div>" +
    "</section>"
  );
}

export function renderAssistConfigOverlay(options = {}) {
  return (
    '<section class="editor-overlay assist-config-overlay" aria-label="Planejamento didático">' +
    '<article class="editor-sheet comment-sheet assist-config-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="assist-config-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">Planejamento didático</p>' +
    "</header>" +
    '<div class="editor-body assist-config-body">' +
    renderAssistConfigPanel(options) +
    "</div>" +
    "</article></section>"
  );
}
