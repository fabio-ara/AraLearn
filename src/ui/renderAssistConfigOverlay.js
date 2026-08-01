import { renderUiIcon } from "./renderUiIcons.js";
import { listCourseModelOptions } from "../generation/runtime/courseModelSemantics.js";

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
        : "save";

  return (
    '<section class="assist-config-panel assist-config-panel-inline' +
    (inline ? " is-inline" : "") +
    '" aria-label="Contexto didático da assistência">' +
    '<header class="assist-config-inline-head">' +
    '<div class="assist-config-inline-heading">' +
    (inline
      ? '<div class="assist-config-inline-title-row" title="Contexto usado para reparar ou criar cards" aria-label="Contexto usado para reparar ou criar cards">' +
        renderUiIcon("trail", "assist-config-inline-title-icon") +
        '<h3 class="assist-config-inline-title">Contexto didático</h3>' +
        "</div>"
      : renderSectionLabel("trail", "Contexto didático", "Contexto usado para reparar ou criar cards")) +
    "</div>" +
    '<div class="lesson-top-actions assist-config-head-actions">' +
    renderIconAction("assist-config-reset-profile", "draft-state", "Resetar perfil") +
    "</div></header>" +
    '<label class="field assist-config-field assist-config-course-request-field">' +
    renderFieldLabel("trail", "Curso", "Contextualiza a assistência de card no curso atual") +
    `<textarea data-field="assist-config-course-model-description" aria-label="Contexto do curso" title="Contextualiza a assistência de card no curso atual" placeholder="Descreva brevemente o curso e sua progressão.">${escapeHtml(profileTuning.courseModel?.description || "")}</textarea>` +
    '<div class="assist-config-profile-toolbar">' +
    '<div class="assist-config-profile-toolbar-main">' +
    (isProfileEditing
      ? `<input data-field="assist-config-profile" type="text" value="${escapeHtml(profileLabel)}" autocomplete="off" spellcheck="false" placeholder="Nome do perfil" title="Nome do perfil">`
      : '<select data-field="assist-config-profile" aria-label="Perfil didático" title="Escolhe o contexto-base da assistência">' +
        renderOptionList(didacticProfileOptions, didacticProfileId) +
        "</select>") +
    "</div>" +
    '<div class="assist-config-profile-toolbar-actions">' +
    renderIconAction("assist-config-start-create-profile", "add", "Criar novo perfil", {
      disabled: isProfileEditing
    }) +
    renderIconAction("assist-config-delete-profile", "trash", "Excluir perfil selecionado", {
      disabled: !canDeleteProfile
    }) +
    renderIconAction("assist-config-edit-profile", "edit", "Editar nome do perfil selecionado", {
      disabled: !canEditProfile
    }) +
    "</div></div></label>" +
    '<label class="field assist-config-field assist-config-student-field">' +
    renderFieldLabel("prompt", "Para quem", "Ajusta linguagem e apoio ao perfil do estudante") +
    `<textarea data-field="assist-config-target-student-profile" rows="2" autocomplete="off" spellcheck="false" placeholder="Perfil do estudante" title="Ajusta linguagem e apoio ao perfil do estudante">${escapeHtml(profileTuning.targetStudentProfile || "")}</textarea>` +
    "</label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("trail", "Trilha", "Organização didática que contextualiza o card") +
    '<select data-field="assist-config-course-learning-trail" aria-label="Trilha do curso" title="Organização didática que contextualiza o card">' +
    renderOptionList(
      [{ value: "", label: "Selecionar" }, ...courseModelOptions.learningTrail],
      profileTuning.courseModel?.learningTrail || ""
    ) +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel(
      "microsequence",
      "Progressão de microssequências",
      "Relação do card com a progressão didática do curso"
    ) +
    '<select data-field="assist-config-course-microsequence-progression" aria-label="Progressão de microssequências" title="Relação do card com a progressão didática do curso">' +
    renderOptionList(
      [
        {
          value: "",
          label: profileTuning.courseModel?.learningTrail ? "Selecionar" : "Escolha a trilha"
        },
        ...courseModelOptions.microsequenceProgression
      ],
      profileTuning.courseModel?.microsequenceProgression || ""
    ) +
    "</select></label>" +
    '<div class="assist-config-footer"><div class="assist-config-footer-actions">' +
    renderIconAction(
      "assist-config-profile-state",
      profileStateIconName,
      `Estado do perfil: ${profileState}`,
      {
        extraClassName: `assist-config-status-action is-${profileState}`,
        disabled: true
      }
    ) +
    renderIconAction("assist-config-save-profile", "save", "Salvar perfil", {
      disabled: !canSaveProfile,
      extraClassName: "assist-config-save-action"
    }) +
    "</div></div></section>"
  );
}

export function renderAssistConfigOverlay(options = {}) {
  return (
    '<section class="editor-overlay assist-config-overlay" aria-label="Contexto didático da assistência">' +
    '<article class="editor-sheet comment-sheet assist-config-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="assist-config-close" title="Fechar" aria-label="Fechar">' +
    renderUiIcon("remove-state", "home-tab-icon") +
    "</button>" +
    '<p class="editor-title">Contexto didático</p>' +
    "</header>" +
    '<div class="editor-body assist-config-body">' +
    renderAssistConfigPanel(options) +
    "</div></article></section>"
  );
}
