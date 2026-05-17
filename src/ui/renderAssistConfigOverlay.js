import { renderUiIcon } from "./renderUiIcons.js";
import { listCourseModelOptions } from "../generation/runtime/courseModelSemantics.js";

const COURSE_MODEL_OPTIONS = listCourseModelOptions();

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

function renderProviderStatusChip({ localStatus = {}, isLocalModel = false, hasApiKey = false } = {}) {
  if (isLocalModel) {
    const statusName = localStatus.checking ? "checking" : localStatus.ok ? "ready" : "offline";
    const label = localStatus.checking ? "Local testando" : localStatus.ok ? "Local ativo" : "Local offline";
    return (
      `<button class="assist-config-status-chip is-${statusName}" type="button" data-action="test-codex-cli-connection" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
      renderUiIcon(localStatus.ok ? "ready-state" : localStatus.checking ? "progress" : "remove-state", "assist-config-status-icon") +
      `<span>${escapeHtml(label)}</span>` +
      "</button>"
    );
  }

  const label = hasApiKey ? "API pronta" : "Chave ausente";
  return (
    `<span class="assist-config-status-chip is-${hasApiKey ? "ready" : "idle"}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
    renderUiIcon(hasApiKey ? "ready-state" : "intent", "assist-config-status-icon") +
    `<span>${escapeHtml(label)}</span>` +
    "</span>"
  );
}

function renderIconAction(action, iconName, title) {
  return (
    `<button class="icon-ghost assist-config-icon-action" type="button" data-action="${escapeHtml(action)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">` +
    renderUiIcon(iconName, "assist-config-action-icon") +
    "</button>"
  );
}

function renderLabeledAction(action, iconName, label, title) {
  return (
    `<button class="assist-config-text-action" type="button" data-action="${escapeHtml(action)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">` +
    renderUiIcon(iconName, "assist-config-action-icon") +
    `<span>${escapeHtml(label)}</span>` +
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

function renderNumberField({ field, iconName, title, value } = {}) {
  return (
    '<label class="field assist-config-field assist-config-number-field">' +
    `<span class="assist-config-inline-label" title="${escapeHtml(title)}">` +
    renderUiIcon(iconName, "assist-config-field-icon") +
    `<span>${escapeHtml(title)}</span></span>` +
    `<input data-field="${escapeHtml(field)}" type="number" min="1" step="1" value="${escapeHtml(value)}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}">` +
    "</label>"
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

function renderToggleList(listName, options = [], selectedValues = [], title = "") {
  const selectedSet = new Set(Array.isArray(selectedValues) ? selectedValues : []);
  return (
    `<div class="assist-config-chip-list" title="${escapeHtml(title)}">` +
    (Array.isArray(options) ? options : [])
      .map((option) => (
        `<button class="assist-config-pick-chip${selectedSet.has(option.value) ? " is-active" : ""}" type="button" ` +
        `data-action="toggle-assist-course-model-list" data-list="${escapeHtml(listName)}" data-value="${escapeHtml(option.value)}" ` +
        `title="${escapeHtml(option.label)}" aria-pressed="${selectedSet.has(option.value) ? "true" : "false"}">` +
        `${escapeHtml(option.label)}</button>`
      ))
      .join("") +
    "</div>"
  );
}

export function renderAssistConfigOverlay({
  model,
  apiKey,
  didacticProfileId,
  profileTuning = {},
  codexEndpoint,
  codexToken,
  modelOptions = [],
  didacticProfileOptions = [],
  localStatus = {}
} = {}) {
  const isCodexLocal = model === "codex-cli-local";
  const statusChip = renderProviderStatusChip({
    localStatus,
    isLocalModel: isCodexLocal,
    hasApiKey: Boolean(String(apiKey || "").trim())
  });

  return (
    '<section class="editor-overlay assist-config-overlay" aria-label="Ajustes da IA">' +
    '<article class="editor-sheet comment-sheet assist-config-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="assist-config-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">IA</p>' +
    '<div class="lesson-top-actions assist-config-head-actions">' +
    statusChip +
    renderIconAction("assist-config-reset-profile", "draft-state", "Resetar perfil") +
    "</div></header>" +
    '<div class="editor-body assist-config-body">' +
    '<div class="assist-config-grid">' +
    '<label class="field assist-config-field">' +
    renderFieldLabel("sparkles", "Motor", "Escolhe quem gera a trilha") +
    '<select data-field="assist-config-model" aria-label="Motor" title="Escolhe quem gera a trilha">' +
    renderOptionList(modelOptions, model) +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("tags", "Perfil", "Escolhe o estilo-base da trilha") +
    '<select data-field="assist-config-profile" aria-label="Perfil didático" title="Escolhe o estilo-base da trilha">' +
    renderOptionList(didacticProfileOptions, didacticProfileId) +
    "</select></label>" +
    "</div>" +
    '<label class="field assist-config-field assist-config-secret-field">' +
    renderFieldLabel("intent", "API", "Autoriza o uso do motor remoto") +
    `<input data-field="assist-config-api-key" type="password" value="${escapeHtml(apiKey || "")}" autocomplete="off" spellcheck="false" placeholder="Chave da API" title="Autoriza o uso do motor remoto">` +
    "</label>" +
    '<label class="field assist-config-field assist-config-student-field">' +
    renderFieldLabel("prompt", "Para quem", "Ajusta a trilha ao nível e ao tempo do estudante") +
    `<input data-field="assist-config-target-student-profile" type="text" value="${escapeHtml(profileTuning.targetStudentProfile || "")}" autocomplete="off" spellcheck="false" placeholder="Perfil do estudante" title="Ajusta a trilha ao nível e ao tempo do estudante">` +
    "</label>" +
    '<label class="field assist-config-field assist-config-course-request-field">' +
    renderFieldLabel("edit", "Curso", "Descreve o curso para a IA completar a modelagem") +
    `<textarea data-field="assist-config-course-model-description" aria-label="Modelagem do curso" title="Descreve o curso para a IA completar a modelagem" placeholder="Descreva o tipo de curso, as representações, a progressão e as dificuldades do estudante.">${escapeHtml(profileTuning.courseModel?.description || "")}</textarea>` +
    '<div class="assist-config-inline-actions">' +
    renderLabeledAction("assist-config-infer-course-model", "sparkles", "Ler pedido", "Ler o pedido e completar a modelagem do curso") +
    "</div>" +
    "</label>" +
    '<div class="assist-config-grid">' +
    '<label class="field assist-config-field">' +
    renderFieldLabel("folder", "Natureza", "Que tipo de curso é este") +
    '<select data-field="assist-config-course-material-nature" aria-label="Natureza do curso" title="Que tipo de curso é este">' +
    renderOptionList([{ value: "", label: "Selecionar" }, ...COURSE_MODEL_OPTIONS.materialNature], profileTuning.courseModel?.materialNature || "") +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("module", "Progressão", "Como a trilha deve avançar") +
    '<select data-field="assist-config-course-progression-mode" aria-label="Progressão do curso" title="Como a trilha deve avançar">' +
    renderOptionList([{ value: "", label: "Selecionar" }, ...COURSE_MODEL_OPTIONS.progressionMode], profileTuning.courseModel?.progressionMode || "") +
    "</select></label>" +
    "</div>" +
    '<section class="assist-config-semantic-section">' +
    renderFieldLabel("tags", "Representações", "Formas centrais do conteúdo") +
    renderToggleList(
      "centralRepresentations",
      COURSE_MODEL_OPTIONS.centralRepresentations,
      profileTuning.courseModel?.centralRepresentations || [],
      "Formas centrais do conteúdo"
    ) +
    "</section>" +
    '<section class="assist-config-semantic-section">' +
    renderFieldLabel("lesson", "Operações", "O que o estudante mais precisa fazer") +
    renderToggleList(
      "cognitiveOperations",
      COURSE_MODEL_OPTIONS.cognitiveOperations,
      profileTuning.courseModel?.cognitiveOperations || [],
      "O que o estudante mais precisa fazer"
    ) +
    "</section>" +
    '<section class="assist-config-semantic-section">' +
    renderFieldLabel("intent", "Dificuldades", "Onde o estudante costuma travar") +
    renderToggleList(
      "expectedDifficulties",
      COURSE_MODEL_OPTIONS.expectedDifficulties,
      profileTuning.courseModel?.expectedDifficulties || [],
      "Onde o estudante costuma travar"
    ) +
    "</section>" +
    '<section class="assist-config-semantic-section">' +
    renderFieldLabel("ready-state", "Prática", "Como a prática deve aparecer") +
    renderToggleList(
      "practiceModes",
      COURSE_MODEL_OPTIONS.practiceModes,
      profileTuning.courseModel?.practiceModes || [],
      "Como a prática deve aparecer"
    ) +
    "</section>" +
    '<div class="assist-config-number-grid">' +
    renderNumberField({
      field: "assist-config-conceptual-reappearances",
      iconName: "card",
      title: "Retoma ideia",
      value: profileTuning.conceptualReappearances || 3
    }) +
    renderNumberField({
      field: "assist-config-operational-reappearances",
      iconName: "module",
      title: "Retoma prática",
      value: profileTuning.operationalReappearances || 4
    }) +
    renderNumberField({
      field: "assist-config-min-microsequences",
      iconName: "microsequence",
      title: "Blocos mín",
      value: profileTuning.minMicrosequences || 3
    }) +
    renderNumberField({
      field: "assist-config-target-microsequences",
      iconName: "lesson",
      title: "Blocos alvo",
      value: profileTuning.targetMicrosequences || 5
    }) +
    renderNumberField({
      field: "assist-config-max-microsequences",
      iconName: "folder",
      title: "Blocos máx",
      value: profileTuning.maxMicrosequences || 8
    }) +
    "</div>" +
    '<div class="assist-config-toggle-row">' +
    '<span class="assist-config-toggle-group">' +
    renderBooleanToggle({
      field: "requireCoreCoverageBeforeExtensions",
      title: "Fecha o núcleo antes de expandir",
      iconName: "ready-state",
      checked: profileTuning.requireCoreCoverageBeforeExtensions !== false
    }) +
    '<span class="assist-config-toggle-text" title="Fecha o núcleo antes de expandir">Fecha núcleo</span>' +
    "</span>" +
    '<span class="assist-config-toggle-group">' +
    renderBooleanToggle({
      field: "requireVocabularyMap",
      title: "Explica vocabulário, siglas e notação",
      iconName: "title",
      checked: profileTuning.requireVocabularyMap !== false
    }) +
    '<span class="assist-config-toggle-text" title="Explica vocabulário, siglas e notação">Explica vocabulário</span>' +
    "</span>" +
    "</div>" +
    (isCodexLocal
      ? '<section class="assist-config-local-panel">' +
        '<div class="assist-config-local-grid">' +
        '<label class="field assist-config-field assist-config-secret-field">' +
        renderFieldLabel("folder", "Endpoint", "Endereço do motor local") +
        `<input data-field="assist-config-codex-endpoint" type="text" value="${escapeHtml(codexEndpoint || "")}" autocomplete="off" spellcheck="false" placeholder="Endpoint local" title="Endereço do motor local">` +
        "</label>" +
        '<label class="field assist-config-field assist-config-secret-field">' +
        renderFieldLabel("card", "Token", "Chave do motor local") +
        `<input data-field="assist-config-codex-token" type="password" value="${escapeHtml(codexToken || "")}" autocomplete="off" spellcheck="false" placeholder="Token local" title="Chave do motor local">` +
        "</label>" +
        "</div>" +
        '<div class="assist-config-local-actions">' +
        renderLabeledAction("test-codex-cli-connection", "progress", "Testar", "Testar local") +
        renderLabeledAction("copy-codex-cli-script", "lesson", "Script", "Copiar script local") +
        renderLabeledAction("copy-codex-cli-endpoint", "module", "Endpoint", "Copiar endpoint") +
        renderLabeledAction("copy-codex-cli-health-command", "prompt", "Comando", "Copiar teste local") +
        "</div>" +
        (localStatus.error && !localStatus.checking
          ? `<p class="tiny muted assist-config-status-text">${escapeHtml(localStatus.error)}</p>`
          : "") +
        "</section>"
      : "") +
    "</div>" +
    "</article></section>"
  );
}
