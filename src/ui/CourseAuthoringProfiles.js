import { renderUiIcon } from "./renderUiIcons.js";
import { escapeDesignHtml as escapeHtml, formatDesignValue, renderDesignValueInput } from "./courseDesignControls.js";

function button(action, label, { disabled = false, icon = "edit", attributes = "" } = {}) {
  return `<button type="button" data-course-authoring-action="${action}"` +
    ` aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${disabled ? " disabled" : ""}${attributes}>` +
    renderUiIcon(icon, "course-authoring-button-icon") + "</button>";
}

export function formatProfilePreference(definition, preference) {
  if (!preference) return "Não copiar";
  if (preference.mode === "automatic") return "Automático pelo contexto";
  if (preference.value == null || preference.value === "" || Array.isArray(preference.value) && !preference.value.length) return "Valor pendente";
  return formatDesignValue(definition, preference.value);
}

function renderEditor(state) {
  const draft = state.profileEditor;
  if (!draft) return "";
  const fields = state.courseDesign.definitions.map((definition) => {
    const preference = draft.preferences.find((item) => item.parameterId === definition.id);
    const mode = preference?.mode || "omit";
    return `<details class="course-profile-preference" data-design-value-owner data-parameter-id="${definition.id}">` +
      `<summary>${escapeHtml(definition.label)}<span>${escapeHtml(formatProfilePreference(definition, preference))}</span></summary>` +
      `<label for="profile-mode-${definition.id}">Preferência</label>` +
      `<select id="profile-mode-${definition.id}" name="mode:${definition.id}" data-design-mode>` +
      [["omit", "Não copiar este parâmetro"], ["automatic", "Automático pelo contexto"], ["fixed", "Fixar valor"]].map(([value, label]) =>
        `<option value="${value}"${mode === value ? " selected" : ""}>${label}</option>`).join("") + "</select>" +
      `<div class="course-design-fixed-values" data-design-values${mode === "fixed" ? "" : " hidden"}>` +
      renderDesignValueInput(definition, preference?.value, {
        disabled: mode !== "fixed", prefix: "course-profile", name: `value:${definition.id}`
      }) + "</div></details>";
  }).join("");
  return '<form class="course-profile-editor" data-course-profile-editor>' +
    `<label>Nome do perfil<input name="name" maxlength="100" required value="${escapeHtml(draft.name)}"></label>` +
    fields + '<div class="course-design-form-actions">' +
    `<button type="submit" aria-label="Salvar perfil" title="Salvar perfil"${state.profileBusy ? " disabled" : ""}>` +
    renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
    button("cancel-profile-editor", "Descartar edição do perfil", { icon: "remove-state", disabled: state.profileBusy }) +
    "</div></form>";
}

function renderPreview(state) {
  const preview = state.profilePreview;
  if (!preview) return "";
  const definitions = state.courseDesign.definitions;
  const label = (id) => definitions.find((definition) => definition.id === id)?.label || id;
  const scopes = { course: "curso", module: "módulo", lesson: "lição", didactic_microsequence: "microssequência", study_unit: "unidade de estudo" };
  return '<form class="course-profile-preview" data-course-profile-apply>' +
    `<h3>Aplicar ${escapeHtml(preview.profile.name)}</h3>` +
    '<p>As preferências serão copiadas para este curso. O conteúdo existente permanece como foi produzido. Alterações futuras no perfil não se propagam.</p>' +
    '<ul>' + preview.assignments.map((assignment) => `<li>${escapeHtml(label(assignment.parameterId))}: ` +
      `${escapeHtml(formatDesignValue(definitions.find((item) => item.id === assignment.parameterId), assignment.value))}</li>`).join("") + '</ul>' +
    (preview.exceptions.length ? '<fieldset><legend>Exceções existentes</legend>' +
      '<p>Serão preservadas. Marque somente as exceções que deseja remover ao reaplicar o perfil.</p>' +
      preview.exceptions.map((exception, index) =>
        `<label class="course-profile-exception"><input type="checkbox" name="removeException" value="${index}"` +
        `${state.profileRemovedExceptions?.includes(String(index)) ? " checked" : ""}` +
        `${exception.assignment.origin === "research_condition" || state.profileBusy ? " disabled" : ""}>` +
        `<span>${escapeHtml(label(exception.parameterId))} · ${scopes[exception.scope.kind]} ` +
        `<small>${escapeHtml(exception.scopeLabel)}</small> · ` +
        `${escapeHtml(formatDesignValue(definitions.find((item) => item.id === exception.parameterId), exception.assignment.value))}` +
        `${exception.assignment.origin === "research_condition" ? " · condição de pesquisa protegida" : ""}</span></label>`).join("") + '</fieldset>' : '<p>Não há exceções locais para remover.</p>') +
    (preview.conflicts.length ? '<p class="course-authoring-notice is-error" role="alert">Há condições de pesquisa incompatíveis. Resolva os escopos conflitantes antes de aplicar o perfil.</p>' : "") +
    '<div class="course-design-form-actions">' +
    `<button type="submit" aria-label="Confirmar aplicação do perfil" title="Confirmar aplicação do perfil"${state.profileBusy || state.designBusy || preview.conflicts.length ? " disabled" : ""}>` +
    renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
    button("cancel-profile-preview", "Cancelar aplicação do perfil", { icon: "remove-state", disabled: state.profileBusy || state.designBusy }) +
    "</div></form>";
}

export function renderCourseAuthoringProfiles(state) {
  const busy = state.profileBusy || state.designBusy || Boolean(state.pendingProfileMutation) || state.pendingDesignCommands?.size > 0;
  const list = state.authoringProfiles || [];
  return `<details class="course-authoring-profiles"${state.profilesOpen ? " open" : ""}>` +
    '<summary>Perfis de autoria</summary><p>Preferências reutilizáveis da sua conta. Aplicar copia valores e decisões automáticas; não muda a identidade, o acesso ou o conteúdo do curso.</p>' +
    (state.profileFailure ? `<p role="alert" class="course-authoring-notice is-error">${escapeHtml(state.profileFailure)}</p>` : "") +
    (state.pendingProfileMutation && !state.profileBusy ? button("retry-profile-mutation", "Repetir gravação do perfil", { icon: "rotate", disabled: state.designBusy }) : "") +
    (state.profileMessage ? `<p role="status">${escapeHtml(state.profileMessage)}</p>` : "") +
    '<div class="course-design-form-actions">' +
    button("new-authoring-profile", "Criar perfil", { icon: "add", disabled: busy || list.length >= 32 }) +
    button("refresh-authoring-profiles", "Recarregar perfis", { icon: "rotate", disabled: busy }) + '</div>' +
    (state.profilesLoading ? '<p role="status">Carregando perfis…</p>' : "") +
    '<ul class="course-profile-list">' + list.map((profile) => '<li><span>' + escapeHtml(profile.name) +
      '</span><div class="course-design-form-actions">' +
      button("preview-authoring-profile", `Aplicar perfil ${profile.name}`, { icon: "preview", disabled: busy, attributes: ` data-profile-id="${profile.profileId}"` }) +
      button("edit-authoring-profile", `Editar perfil ${profile.name}`, { disabled: busy, attributes: ` data-profile-id="${profile.profileId}"` }) +
      button("delete-authoring-profile", `Excluir perfil ${profile.name}`, { icon: "trash", disabled: busy, attributes: ` data-profile-id="${profile.profileId}"` }) + '</div></li>').join("") + '</ul>' +
    renderEditor(state) + renderPreview(state) + '</details>';
}
