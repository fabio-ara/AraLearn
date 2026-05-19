import { toLegacyContractCard } from "../../domain/cards.js";
import { getActiveMicrosequenceVersion } from "../../domain/microsequence.js";
import { renderCardRuntimeArticle } from "../../render/renderCardRuntime.js";
import { IMPROVE_REASONS } from "./microsequenceActions.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderVersionTabs(microsequence) {
  const versions = Array.isArray(microsequence?.versions) ? microsequence.versions : [];
  if (!versions.length) {
    return "";
  }
  return (
    '<div class="version-strip">' +
    versions
      .map(
        (version) =>
          '<button class="version-tab' +
          (microsequence.activeVersionKey === version.key ? " active" : "") +
          '" type="button" data-action="select-microsequence-version" data-version-key="' +
          escapeHtml(version.key) +
          '">' +
          escapeHtml(version.mode) +
          "<small>" +
          escapeHtml(version.createdAt.slice(0, 16).replace("T", " ")) +
          "</small></button>"
      )
      .join("") +
    "</div>"
  );
}

function renderCards(activeVersion) {
  if (!activeVersion?.cards?.length) {
    return '<div class="empty-panel"><p>Microssequência planejada. Gere os cards para começar a estudar.</p></div>';
  }
  return (
    '<div class="study-cards-stack">' +
    activeVersion.cards.map((card) => renderCardRuntimeArticle(toLegacyContractCard(card))).join("") +
    "</div>"
  );
}

export function renderMicrosequenceStudy(context, providerSettings, message = "") {
  if (!context?.microsequence) {
    return (
      '<section class="study-panel"><div class="empty-panel">' +
      "<p>Selecione uma microssequência na árvore ou crie uma nova trilha.</p>" +
      "</div></section>"
    );
  }

  const { course, moduleValue, lesson, microsequence } = context;
  const activeVersion = getActiveMicrosequenceVersion(microsequence);
  return (
    '<section class="study-panel">' +
    '<div class="panel-header">' +
    '<div><p class="eyebrow">' +
    escapeHtml(course.title) +
    " · " +
    escapeHtml(moduleValue.title) +
    " · " +
    escapeHtml(lesson.title) +
    '</p><h2>' +
    escapeHtml(microsequence.title) +
    "</h2><p class=\"study-goal\">" +
    escapeHtml(microsequence.goal) +
    "</p></div>" +
    '<div class="study-badges"><span class="tree-status-badge" data-status="' +
    escapeHtml(microsequence.status) +
    '">' +
    escapeHtml(microsequence.status) +
    '</span><span class="tree-status-badge type-badge">' +
    escapeHtml(microsequence.type) +
    "</span></div></div>" +
    (message ? '<p class="scope-builder-message">' + escapeHtml(message) + "</p>" : "") +
    renderVersionTabs(microsequence) +
    '<section class="study-actions-panel">' +
    '<label class="scope-field"><span>Pedido local</span>' +
    '<textarea data-study-user-request rows="3" placeholder="Peça reforço, correção, mais prática ou um complemento local."></textarea></label>' +
    '<div class="scope-field-row">' +
    '<label class="scope-field scope-field-compact"><span>Motivo da melhoria</span>' +
    '<select data-study-improve-reason>' +
    IMPROVE_REASONS.map((item) => '<option value="' + escapeHtml(item.value) + '">' + escapeHtml(item.label) + "</option>").join("") +
    "</select></label>" +
    '<label class="scope-field scope-field-compact"><span>Densidade</span>' +
    '<select data-study-density>' +
    ["standard", "deep", "exam"]
      .map((density) => '<option value="' + density + '"' + (providerSettings.density === density ? " selected" : "") + ">" + escapeHtml(density) + "</option>")
      .join("") +
    "</select></label></div>" +
    '<div class="panel-actions">' +
    '<button class="primary-button" type="button" data-action="generate-cards">Gerar cards</button>' +
    '<button class="ghost-button" type="button" data-action="improve-microsequence">Melhorar explicação</button>' +
    '<button class="ghost-button" type="button" data-action="add-practice">Mais prática</button>' +
    '<button class="ghost-button" type="button" data-action="create-support">Criar complemento</button>' +
    '<button class="ghost-button" type="button" data-action="generate-next">Gerar próxima</button>' +
    '<button class="ghost-button" type="button" data-action="mark-ready">Marcar pronta</button></div></section>' +
    renderCards(activeVersion) +
    "</section>"
  );
}

