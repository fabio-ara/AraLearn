import { validateScopeBuilderDraft } from "./scopeBuilderState.js";
import { renderScopeChipList } from "./scopeChips.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderModuleCard(moduleValue, moduleIndex) {
  return (
    '<section class="scope-module-card" data-module-index="' +
    escapeHtml(moduleIndex) +
    '">' +
    '<div class="scope-module-head">' +
    `<span class="scope-module-kicker">Módulo ${moduleIndex + 1}</span>` +
    '<button class="ghost-button tiny-button" type="button" data-action="remove-scope-module" data-module-index="' +
    escapeHtml(moduleIndex) +
    '">Remover</button></div>' +
    '<label class="scope-field"><span>Título do módulo</span>' +
    '<input type="text" data-scope-module-title value="' +
    escapeHtml(moduleValue.title) +
    '" placeholder="Ex.: Lógica Proposicional"></label>' +
    '<div class="scope-field-group">' +
    '<label class="scope-field"><span>O que entra</span>' +
    renderScopeChipList(moduleIndex, "include", moduleValue.include) +
    '<div class="scope-chip-adder">' +
    '<input type="text" data-chip-input="include" placeholder="Digite um termo e pressione Enter">' +
    '<button class="primary-button" type="button" data-action="add-scope-chip" data-module-index="' +
    escapeHtml(moduleIndex) +
    '" data-chip-field="include">+</button></div></label>' +
    '<label class="scope-field"><span>O que não entra</span>' +
    renderScopeChipList(moduleIndex, "exclude", moduleValue.exclude) +
    '<div class="scope-chip-adder">' +
    '<input type="text" data-chip-input="exclude" placeholder="Ex.: lógica de predicados">' +
    '<button class="primary-button" type="button" data-action="add-scope-chip" data-module-index="' +
    escapeHtml(moduleIndex) +
    '" data-chip-field="exclude">+</button></div></label></div>' +
    '<div class="scope-field-row">' +
    '<label class="scope-field"><span>Observações</span>' +
    '<textarea data-scope-module-notes rows="3" placeholder="O que o professor mais cobra, lista importante, estilo de avaliação.">' +
    escapeHtml(moduleValue.notes) +
    "</textarea></label>" +
    '<label class="scope-field scope-field-compact"><span>Cobrança</span>' +
    '<select data-scope-module-style>' +
    ['theoretical', 'practical', 'mixed']
      .map((style) => '<option value="' + style + '"' + (moduleValue.assessmentStyle === style ? " selected" : "") + ">" + ({
        theoretical: "Mais teórica",
        practical: "Mais prática",
        mixed: "Mista"
      })[style] + "</option>")
      .join("") +
    "</select></label></div></section>"
  );
}

export function renderScopeBuilder(draft, { busy = false, importOpen = false, importText = "", importError = "", message = "" } = {}) {
  const validation = validateScopeBuilderDraft(draft);
  const validationErrors = validation.ok ? [] : validation.errors;
  return (
    '<section class="scope-builder-shell">' +
    '<div class="panel-header">' +
    '<div><p class="eyebrow">Criar trilha</p><h2>Escopo</h2></div>' +
    '<div class="panel-actions">' +
    '<button class="icon-pill" type="button" data-action="toggle-import-scope-json" title="Importar JSON" aria-label="Importar JSON">⤓</button>' +
    '<button class="icon-pill" type="button" data-action="add-scope-module" title="Adicionar módulo" aria-label="Adicionar módulo">＋</button>' +
    '<button class="action-pill primary" type="button" data-action="generate-trail" ' +
    (!validation.ok || busy ? "disabled" : "") +
    '>Gerar trilha</button></div></div>' +
    (message ? '<p class="scope-builder-message">' + escapeHtml(message) + "</p>" : "") +
    '<div class="scope-form-grid">' +
    '<label class="scope-field"><span>Curso</span><input type="text" data-scope-course-title value="' +
    escapeHtml(draft.courseTitle) +
    '" placeholder="Ex.: Matemática para Informática"></label>' +
    '<label class="scope-field"><span>Objetivo opcional</span><input type="text" data-scope-course-goal value="' +
    escapeHtml(draft.courseGoal) +
    '" placeholder="Ex.: Estudar a disciplina seguindo a cobrança real do semestre"></label>' +
    '<label class="scope-field"><span>Evidência principal</span>' +
    '<input type="text" data-scope-evidence-priority value="' +
    escapeHtml((draft.evidencePriority || []).join(", ")) +
    '" placeholder="notebook, exercise_list, exam"></label></div>' +
    '<div class="scope-modules-stack">' +
    draft.modules.map((moduleValue, moduleIndex) => renderModuleCard(moduleValue, moduleIndex)).join("") +
    "</div>" +
    (validationErrors.length
      ? '<div class="scope-errors"><p>Contrato inválido:</p><ul>' +
        validationErrors.map((error) => "<li>" + escapeHtml(error.message) + "</li>").join("") +
        "</ul></div>"
      : "") +
    (importOpen
      ? '<section class="import-scope-panel">' +
        '<div class="panel-header"><h3>Importar JSON de escopo</h3>' +
        '<button class="ghost-button" type="button" data-action="toggle-import-scope-json">Fechar</button></div>' +
        '<textarea data-import-scope-json rows="10" placeholder=\'Cole aqui um JSON "aralearn.scope.v1".\'>' +
        escapeHtml(importText) +
        "</textarea>" +
        '<div class="panel-actions">' +
        '<button class="ghost-button" type="button" data-action="preview-import-scope-json">Pré-visualizar</button>' +
        '<button class="primary-button" type="button" data-action="apply-import-scope-json">Aplicar</button></div>' +
        (importError ? '<p class="scope-import-error">' + escapeHtml(importError) + "</p>" : "") +
        "</section>"
      : "") +
    "</section>"
  );
}
