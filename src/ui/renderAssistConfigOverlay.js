import { renderUiIcon } from "./renderUiIcons.js";
import { listCourseModelOptions } from "../generation/runtime/courseModelSemantics.js";
import {
  listReappearanceLevelOptions,
  resolveConceptualReappearanceLevel,
  resolveOperationalReappearanceLevel
} from "../generation/runtime/courseForgeProfileTuning.js";

const COURSE_MODEL_OPTIONS = listCourseModelOptions();
const REAPPEARANCE_LEVEL_OPTIONS = listReappearanceLevelOptions();
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
    '<div class="assist-config-range-target-marker" aria-hidden="true"></div>' +
    `<input class="assist-config-range-input assist-config-range-input-min" data-field="assist-config-min-microsequences" type="range" min="${MICROSEQUENCE_RANGE_MIN}" max="${MICROSEQUENCE_RANGE_MAX}" step="1" value="${escapeHtml(minValue)}" aria-label="Microssequências por lição mínimo" title="Mínimo de microssequências por lição">` +
    `<input class="assist-config-range-input assist-config-range-input-target" data-field="assist-config-target-microsequences" type="range" min="${MICROSEQUENCE_RANGE_MIN}" max="${MICROSEQUENCE_RANGE_MAX}" step="1" value="${escapeHtml(targetValue)}" aria-label="Microssequências por lição esperado" title="Quantidade esperada de microssequências por lição">` +
    `<input class="assist-config-range-input assist-config-range-input-max" data-field="assist-config-max-microsequences" type="range" min="${MICROSEQUENCE_RANGE_MIN}" max="${MICROSEQUENCE_RANGE_MAX}" step="1" value="${escapeHtml(maxValue)}" aria-label="Microssequências por lição máximo" title="Máximo de microssequências por lição">` +
    "</div>" +
    '<div class="assist-config-range-values" aria-hidden="true">' +
    `<span data-role="assist-config-min-microsequences-label">Mín ${escapeHtml(minValue)}</span>` +
    `<span data-role="assist-config-target-microsequences-label">Esperado ${escapeHtml(targetValue)}</span>` +
    `<span data-role="assist-config-max-microsequences-label">Máx ${escapeHtml(maxValue)}</span>` +
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

export function renderAssistConfigOverlay({
  didacticProfileId,
  profileTuning = {},
  didacticProfileOptions = [],
} = {}) {
  return (
    '<section class="editor-overlay assist-config-overlay" aria-label="Ajustes da IA">' +
    '<article class="editor-sheet comment-sheet assist-config-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="assist-config-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">IA</p>' +
    '<div class="lesson-top-actions assist-config-head-actions">' +
    renderIconAction("assist-config-reset-profile", "draft-state", "Resetar perfil") +
    "</div></header>" +
    '<div class="editor-body assist-config-body">' +
    '<section class="assist-config-panel">' +
    renderSectionLabel("tags", "Planejamento", "Parâmetros que entram no planejamento top-down da trilha") +
    '<div class="assist-config-grid">' +
    '<label class="field assist-config-field">' +
    renderFieldLabel("tags", "Perfil", "Escolhe o estilo-base da trilha") +
    '<select data-field="assist-config-profile" aria-label="Perfil didático" title="Escolhe o estilo-base da trilha">' +
    renderOptionList(didacticProfileOptions, didacticProfileId) +
    "</select></label>" +
    '<label class="field assist-config-field assist-config-student-field">' +
    renderFieldLabel("prompt", "Para quem", "Ajusta a trilha ao nível e ao tempo do estudante") +
    `<input data-field="assist-config-target-student-profile" type="text" value="${escapeHtml(profileTuning.targetStudentProfile || "")}" autocomplete="off" spellcheck="false" placeholder="Perfil do estudante" title="Ajusta a trilha ao nível e ao tempo do estudante">` +
    "</label>" +
    "</div>" +
    '<label class="field assist-config-field assist-config-course-request-field">' +
    renderFieldLabel("edit", "Curso", "Descreve o curso para a IA completar a modelagem") +
    `<textarea data-field="assist-config-course-model-description" aria-label="Modelagem do curso" title="Descreve o curso para a IA completar a modelagem" placeholder="Descreva o tipo de curso, as formas centrais, a progressão e as travas do estudante.">${escapeHtml(profileTuning.courseModel?.description || "")}</textarea>` +
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
    '<div class="assist-config-grid">' +
    '<label class="field assist-config-field">' +
    renderFieldLabel("tags", "Forma principal", "Representação dominante da trilha") +
    '<select data-field="assist-config-course-primary-representation" aria-label="Forma principal" title="Representação dominante da trilha">' +
    renderOptionList([{ value: "", label: "Selecionar" }, ...COURSE_MODEL_OPTIONS.representations], profileTuning.courseModel?.primaryRepresentation || "") +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("tags", "Forma secundária", "Representação de apoio ou ponte") +
    '<select data-field="assist-config-course-secondary-representation" aria-label="Forma secundária" title="Representação de apoio ou ponte">' +
    renderOptionList([{ value: "", label: "Nenhuma" }, ...COURSE_MODEL_OPTIONS.representations], profileTuning.courseModel?.secondaryRepresentation || "") +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("lesson", "Operação principal", "A ação cognitiva dominante da trilha") +
    '<select data-field="assist-config-course-primary-operation" aria-label="Operação principal" title="A ação cognitiva dominante da trilha">' +
    renderOptionList([{ value: "", label: "Selecionar" }, ...COURSE_MODEL_OPTIONS.operations], profileTuning.courseModel?.primaryOperation || "") +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("ready-state", "Prática preferida", "A forma de prática que deve dominar a trilha") +
    '<select data-field="assist-config-course-preferred-practice-mode" aria-label="Prática preferida" title="A forma de prática que deve dominar a trilha">' +
    renderOptionList([{ value: "", label: "Selecionar" }, ...COURSE_MODEL_OPTIONS.practiceModes], profileTuning.courseModel?.preferredPracticeMode || "") +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("intent", "Trava principal", "A dificuldade dominante do estudante") +
    '<select data-field="assist-config-course-primary-difficulty" aria-label="Trava principal" title="A dificuldade dominante do estudante">' +
    renderOptionList([{ value: "", label: "Selecionar" }, ...COURSE_MODEL_OPTIONS.difficulties], profileTuning.courseModel?.primaryDifficulty || "") +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("intent", "Trava secundária", "A dificuldade de apoio logo atrás da principal") +
    '<select data-field="assist-config-course-secondary-difficulty" aria-label="Trava secundária" title="A dificuldade de apoio logo atrás da principal">' +
    renderOptionList([{ value: "", label: "Nenhuma" }, ...COURSE_MODEL_OPTIONS.difficulties], profileTuning.courseModel?.secondaryDifficulty || "") +
    "</select></label>" +
    "</div>" +
    "</section>" +
    '<section class="assist-config-panel">' +
    renderSectionLabel("progress", "Ritmo", "Parâmetros de densidade, retomada e fechamento do núcleo") +
    '<div class="assist-config-rhythm-grid">' +
    '<label class="field assist-config-field">' +
    renderFieldLabel("card", "Retomada conceitual", "Quanto a trilha tende a voltar ao conceito antes de avançar") +
    '<select data-field="assist-config-conceptual-reappearances" aria-label="Retomada conceitual" title="Quanto a trilha tende a voltar ao conceito antes de avançar">' +
    renderOptionList(REAPPEARANCE_LEVEL_OPTIONS, resolveConceptualReappearanceLevel(profileTuning.conceptualReappearances || 3)) +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderFieldLabel("module", "Retomada de prática", "Quanto a trilha tende a voltar ao uso antes de avançar") +
    '<select data-field="assist-config-operational-reappearances" aria-label="Retomada de prática" title="Quanto a trilha tende a voltar ao uso antes de avançar">' +
    renderOptionList(REAPPEARANCE_LEVEL_OPTIONS, resolveOperationalReappearanceLevel(profileTuning.operationalReappearances || 4)) +
    "</select></label>" +
    "</div>" +
    renderMicrosequenceRangeField(profileTuning) +
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
    "</section>" +
    "</div>" +
    "</article></section>"
  );
}
