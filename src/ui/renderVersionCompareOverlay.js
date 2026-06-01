import { getActiveMicrosequenceVersion } from "../domain/microsequence.js";
import { readCardText } from "../core/cardRuntime.js";
import { renderCardRuntimeBlocks } from "../render/renderCardRuntime.js";
import { renderLessonScreen } from "./renderLessonScreen.js";
import { splitVersionLineageLabel } from "./versionLineage.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatVersionTabTimestamp(value) {
  const iso = String(value || "").trim();
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, , month, day, hour, minute] = match;
    return `${day}/${month} ${hour}:${minute}`;
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const pad = (item) => String(item).padStart(2, "0");
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function readVersionTabLabel(version) {
  return version?.id || version?.label || "v?";
}

function renderChip(label) {
  return '<span class="didactic-tag comparison-chip">' + escapeHtml(label) + "</span>";
}

function buildDependsOnTitleMap(version = {}) {
  return new Map(
    (Array.isArray(version?.microsequences) ? version.microsequences : [])
      .map((item) => [String(item?.id || "").trim().toLowerCase(), item?.title || ""])
      .filter(([id, title]) => id && title)
  );
}

function resolveRefTitles(refIds = [], refTitleMap = new Map()) {
  return (Array.isArray(refIds) ? refIds : [])
    .map((refId) => {
      const normalizedId = String(refId || "").trim();
      if (!normalizedId) {
        return "";
      }
      return refTitleMap.get(normalizedId.toLowerCase()) || "";
    })
    .filter(Boolean);
}

function renderRuntimeCard(card, emptyMessage) {
  if (!card) {
    return (
      '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet runtime-card-sheet-empty">' +
      '<p class="runtime-paragraph">' +
      escapeHtml(emptyMessage) +
      "</p></article>"
    );
  }

  return (
    '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet">' +
    '<div class="runtime-card-title">' +
    escapeHtml(card.title || card.id || "Card") +
    "</div>" +
    '<div class="card-sheet-content">' +
    renderCardRuntimeBlocks(card, {
      omitRepeatedHeading: true,
      fallbackText: readCardText(card)
    }) +
    "</div></article>"
  );
}

function renderReadOnlyHeader(title, subtitle, showBack = false) {
  return (
    '<section class="study-reader-topbar comparison-readonly-topbar">' +
    (showBack
      ? '<button class="icon-ghost" type="button" data-action="back-to-comparison" title="Voltar à comparação" aria-label="Voltar à comparação">‹</button>'
      : '<div class="topbar-space"></div>') +
    '<div class="topbar-heading">' +
    '<div class="topbar-title">' +
    escapeHtml(title) +
    "</div>" +
    '<div class="topbar-subtitle tiny muted">' +
    escapeHtml(subtitle) +
    "</div></div>" +
    '<div class="topbar-space"></div>' +
    "</section>"
  );
}

function renderReadOnlyCardInspection(versionLabel, card, showBack = false) {
  return (
    '<section class="screen study-reader-screen">' +
    renderReadOnlyHeader(card?.title || "Card", `${versionLabel} · Somente leitura`, showBack) +
    '<main class="screen-content microsequence-screen">' +
    '<section class="card-portrait editor-card-portrait study-stage">' +
    renderRuntimeCard(card, "Não havia card nesta versão.") +
    "</section></main></section>"
  );
}

function renderReadOnlyMicrosequenceInspection(versionLabel, version, focusTarget = null, showBack = false, refTitles = []) {
  const cards = Array.isArray(version?.cards) ? version.cards : [];
  const targetCard =
    focusTarget?.scope === "card"
      ? cards.find((item, index) => item?.id === focusTarget.cardKey || index === focusTarget.currentIndex || index === focusTarget.previousIndex) || null
      : null;
  const selectedCard = targetCard || cards[0] || null;
  const cardTabs = cards
    .map((card, index) => {
      return (
        '<span class="editor-version-tab' +
        (selectedCard?.id === card?.id ? " active" : "") +
        '">' +
        '<span class="editor-version-tab-label">' +
        escapeHtml(String(index + 1)) +
        "</span></span>"
      );
    })
    .join("");

  return (
    '<section class="screen">' +
    renderReadOnlyHeader(version?.title || "Microssequência", `${versionLabel} · Somente leitura`, showBack) +
    '<main class="screen-content microsequence-generator-screen">' +
    '<section class="editor-step-nav">' +
    '<div class="editor-version-strip-wrap">' +
    '<div class="editor-version-label tiny muted">Versões da microssequência</div>' +
    '<div class="editor-version-legend"><p class="tiny muted">Visualizando: ' +
    escapeHtml(versionLabel) +
    "</p></div>" +
    '<div class="editor-version-tabbar"><div class="editor-version-strip" role="tablist" aria-label="Versões da microssequência">' +
    cardTabs +
    "</div></div></div>" +
    (refTitles.length
      ? '<div class="didactic-tag-row microsequence-tag-row">' + refTitles.map((title) => renderChip(title)).join("") + "</div>"
      : "") +
    "</section>" +
    '<section class="workbench-surface" data-workbench-pane="preview">' +
    '<div class="workbench-surface-body">' +
    '<section class="workbench-surface-pane workbench-preview-pane">' +
    '<div class="generator-preview-stage">' +
    renderRuntimeCard(selectedCard, "Não há cards nesta versão.") +
    "</div></section></div></section></main></section>"
  );
}

function createSelectionPath(courseKey = "", moduleKey = "", lessonKey = "", microsequenceKey = "") {
  return {
    courseKey,
    moduleKey,
    lessonKey,
    microsequenceKey,
    cardKey: null,
    cardIndex: 0
  };
}

function findModuleInCourse(course, moduleKey) {
  return (course?.modules || []).find((item) => item?.id === moduleKey) || null;
}

function findLessonInModule(moduleValue, lessonKey) {
  return (moduleValue?.lessons || []).find((item) => item?.id === lessonKey) || null;
}

function buildReadOnlyStructureScreen(comparison, sideKey, focusTarget = null) {
  const version = sideKey === "previous" ? comparison.previousVersion : comparison.currentVersion;
  const rootEntity = version?.snapshot || null;
  if (!rootEntity) {
    return '<p class="tiny muted">Sem conteúdo disponível nesta versão.</p>';
  }

  const subtitle = `${readVersionTabLabel(version)} · Somente leitura`;
  const commonEditorSupport = {
    progress: { version: 1, lessons: {} },
    readOnlyView: true,
    readOnlySubtitle: subtitle,
    readOnlyBackAction: "back-to-comparison",
    readOnlyBackTitle: "Voltar à comparação"
  };
  const target = focusTarget || { scope: comparison.level };

  if (target.scope === "course" || comparison.level === "course" && !focusTarget) {
    return renderLessonScreen({
      project: { courses: [rootEntity] },
      view: "course",
      selection: createSelectionPath(rootEntity.id || "comparison-course"),
      course: rootEntity,
      moduleValue: (rootEntity.modules || [])[0] || null,
      lesson: ((rootEntity.modules || [])[0]?.lessons || [])[0] || null,
      microsequence: (((rootEntity.modules || [])[0]?.lessons || [])[0]?.microsequences || [])[0] || null,
      cards: (getActiveMicrosequenceVersion((((rootEntity.modules || [])[0]?.lessons || [])[0]?.microsequences || [])[0])?.cards || []),
      microsequenceMode: "play",
      editorSupport: commonEditorSupport
    });
  }

  if (target.scope === "module") {
    const moduleValue =
      comparison.level === "module"
        ? rootEntity
        : findModuleInCourse(rootEntity, target.moduleKey);
    const course =
      comparison.level === "course"
        ? rootEntity
        : { id: "comparison-course", title: "Curso", modules: moduleValue ? [moduleValue] : [] };
    if (!moduleValue) {
      return '<p class="tiny muted">Este módulo não existe nesta versão.</p>';
    }
    return renderLessonScreen({
      project: { courses: [course] },
      view: "module",
      selection: createSelectionPath(course.id || "comparison-course", moduleValue.id || ""),
      course,
      moduleValue,
      lesson: (moduleValue.lessons || [])[0] || null,
      microsequence: (((moduleValue.lessons || [])[0]?.microsequences) || [])[0] || null,
      cards: (getActiveMicrosequenceVersion((((moduleValue.lessons || [])[0]?.microsequences) || [])[0])?.cards || []),
      microsequenceMode: "play",
      editorSupport: commonEditorSupport
    });
  }

  if (target.scope === "lesson") {
    let moduleValue = null;
    let lesson = null;
    if (comparison.level === "lesson") {
      lesson = rootEntity;
      moduleValue = { id: "comparison-module", title: "Módulo", lessons: [lesson] };
    } else if (comparison.level === "module") {
      moduleValue = rootEntity;
      lesson = findLessonInModule(moduleValue, target.lessonKey);
    } else {
      moduleValue = findModuleInCourse(rootEntity, target.moduleKey);
      lesson = findLessonInModule(moduleValue, target.lessonKey);
    }
    if (!moduleValue || !lesson) {
      return '<p class="tiny muted">Esta lição não existe nesta versão.</p>';
    }
    const course =
      comparison.level === "course"
        ? rootEntity
        : { id: "comparison-course", title: "Curso", modules: [moduleValue] };
    return renderLessonScreen({
      project: { courses: [course] },
      view: "lesson",
      selection: createSelectionPath(course.id || "comparison-course", moduleValue.id || "", lesson.id || ""),
      course,
      moduleValue,
      lesson,
      microsequence: (lesson.microsequences || [])[0] || null,
      cards: (getActiveMicrosequenceVersion((lesson.microsequences || [])[0])?.cards || []),
      microsequenceMode: "play",
      editorSupport: commonEditorSupport
    });
  }

  let lesson = null;
  if (comparison.level === "lesson") {
    lesson = rootEntity;
  } else if (comparison.level === "module") {
    const moduleValue = rootEntity;
    lesson = findLessonInModule(moduleValue, target.lessonKey);
  } else {
    const moduleValue = findModuleInCourse(rootEntity, target.moduleKey);
    lesson = findLessonInModule(moduleValue, target.lessonKey);
  }
  const microsequence = (lesson?.microsequences || []).find((item) => item?.id === target.microsequenceKey) || null;
  if (!microsequence) {
    return '<p class="tiny muted">Esta microssequência não existe nesta versão.</p>';
  }
  const refTitleMap = buildDependsOnTitleMap(lesson);
  const refTitles = resolveRefTitles(microsequence.dependsOn, refTitleMap);
  const cards = getActiveMicrosequenceVersion(microsequence)?.cards || [];
  if (target.scope === "card") {
    const card =
      cards.find((item, index) => item?.id === target.cardKey || index === target.currentIndex || index === target.previousIndex) || null;
    return renderReadOnlyCardInspection(readVersionTabLabel(version), card, true);
  }
  return renderReadOnlyMicrosequenceInspection(readVersionTabLabel(version), microsequence, target, true, refTitles);
}

function buildSummaryChips(comparison) {
  if (comparison.kind === "structure") {
    const summaryEntries = Array.isArray(comparison.summaryEntries) ? comparison.summaryEntries : [];
    const chips = [];
    const counts = summaryEntries.reduce(
      (acc, item) => {
        if (/adicionad/i.test(item.title)) acc.added += 1;
        else if (/removid/i.test(item.title)) acc.removed += 1;
        else if (/alterad/i.test(item.title)) acc.changed += 1;
        return acc;
      },
      { added: 0, removed: 0, changed: 0 }
    );
    if (!summaryEntries.length || summaryEntries[0]?.id === `${comparison.level}-metadata` && summaryEntries.length === 1) {
      chips.push(renderChip("Sem mudança estrutural relevante"));
    }
    if (counts.added) chips.push(renderChip(`${counts.added} ${counts.added === 1 ? "item adicionado" : "itens adicionados"}`));
    if (counts.removed) chips.push(renderChip(`${counts.removed} ${counts.removed === 1 ? "item removido" : "itens removidos"}`));
    if (counts.changed) chips.push(renderChip(`${counts.changed} ${counts.changed === 1 ? "item alterado" : "itens alterados"}`));
    return chips.join("");
  }

  const chips = [];
  if (comparison.summary.titleChanged) chips.push(renderChip("Título alterado"));
  if (comparison.summary.refsChanged) chips.push(renderChip("Refs alteradas"));
  if (comparison.composition.totals.added) chips.push(renderChip(`${comparison.composition.totals.added} card adicionado`));
  if (comparison.composition.totals.removed) chips.push(renderChip(`${comparison.composition.totals.removed} card removido`));
  if (comparison.composition.totals.changed || comparison.composition.totals.moved) {
    chips.push(renderChip(`${comparison.composition.totals.changed + comparison.composition.totals.moved} card alterado`));
  }
  if (!chips.length) {
    chips.push(renderChip("Sem mudança relevante"));
  }
  return chips.join("");
}

function renderSummaryEntry(item) {
  const targetAttr = item.target ? escapeHtml(JSON.stringify(item.target)) : "";
  return (
    '<article class="history-item-card comparison-summary-card">' +
    '<div class="history-item-card-body">' +
    '<span class="history-item-line history-item-line-primary">' +
    '<span class="history-item-origin">' +
    escapeHtml(item.title) +
    "</span></span>" +
    (item.lines || [])
      .map((line) => '<span class="history-item-line history-item-line-secondary">' + escapeHtml(line) + "</span>")
      .join("") +
    "</div>" +
    '<div class="history-item-actions">' +
    (item.canOpenPrevious
      ? '<button class="history-item-action history-item-action-default" type="button" data-action="open-version-compare-target" data-compare-tab="previous" data-compare-target="' +
        targetAttr +
        '" title="Ver em vA" aria-label="Ver em vA"><span class="history-item-action-label">Ver em vA</span></button>'
      : "") +
    (item.canOpenCurrent
      ? '<button class="history-item-action history-item-action-default" type="button" data-action="open-version-compare-target" data-compare-tab="current" data-compare-target="' +
        targetAttr +
        '" title="Ver em vB" aria-label="Ver em vB"><span class="history-item-action-label">Ver em vB</span></button>'
      : "") +
    (item.canCompare
      ? '<button class="history-item-action history-item-action-default" type="button" data-action="open-version-compare-target" data-compare-tab="current" data-compare-target="' +
        targetAttr +
        '" title="Comparar aqui" aria-label="Comparar aqui"><span class="history-item-action-label">Comparar aqui</span></button>'
      : "") +
    "</div></article>"
  );
}

function renderSummaryTab(comparison) {
  const summaryEntries = Array.isArray(comparison.summaryEntries) ? comparison.summaryEntries : [];
  return (
    '<section class="comparison-summary">' +
    '<p class="tiny muted">' +
    escapeHtml(`Comparando ${readVersionTabLabel(comparison.previousVersion)} com ${readVersionTabLabel(comparison.currentVersion)}`) +
    "</p>" +
    '<div class="dependency-chip-row comparison-chip-row">' +
    buildSummaryChips(comparison) +
    "</div>" +
    '<div class="history-list">' +
    summaryEntries.map((item) => renderSummaryEntry(item)).join("") +
    "</div></section>"
  );
}

function renderTabButton(tabId, label, active, timestamp = "") {
  const labelParts = splitVersionLineageLabel(label);
  return (
    '<button class="editor-version-tab' +
    (active ? " active" : "") +
    '" type="button" data-action="select-version-compare-tab" data-compare-tab="' +
    escapeHtml(tabId) +
    '" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '">' +
    '<span class="editor-version-tab-main">' +
    (labelParts.origin ? '<span class="editor-version-tab-origin">' + escapeHtml(labelParts.origin) + "</span>" : "") +
    '<span class="editor-version-tab-label">' +
    escapeHtml(labelParts.destination || label) +
    "</span></span>" +
    (timestamp ? '<span class="editor-version-tab-meta">' + escapeHtml(timestamp) + "</span>" : "") +
    "</button>"
  );
}

function renderCompareDecisionButton(sideKey, version, activeVersionId) {
  const versionId = version?.id || "";
  const label = readVersionTabLabel(version);
  const isActive = versionId && versionId === activeVersionId;

  if (isActive) {
    return (
      '<span class="chip-muted editor-version-status" aria-label="Em uso: ' +
      escapeHtml(label) +
      '" title="Em uso: ' +
      escapeHtml(label) +
      '">Em uso: ' +
      escapeHtml(label) +
      "</span>"
    );
  }

  return (
    '<button class="history-item-action history-item-action-default" type="button" data-action="use-version-compare-side" data-compare-side="' +
    escapeHtml(sideKey) +
    '" title="Usar ' +
    escapeHtml(label) +
    '" aria-label="Usar ' +
    escapeHtml(label) +
    '"><span class="history-item-action-label">Usar ' +
    escapeHtml(label) +
    "</span></button>"
  );
}

function renderDecisionBar(comparison) {
  return (
    '<div class="history-item-actions comparison-decision-bar">' +
    renderCompareDecisionButton("previous", comparison.previousVersion, comparison.activeVersionId || "") +
    renderCompareDecisionButton("current", comparison.currentVersion, comparison.activeVersionId || "") +
    "</div>"
  );
}

function renderVersionTab(comparison, tabId, focusTarget) {
  if (comparison.kind === "structure") {
    return buildReadOnlyStructureScreen(comparison, tabId, focusTarget);
  }

  const version = tabId === "previous" ? comparison.previousVersion : comparison.currentVersion;
  if (focusTarget?.scope === "card") {
    const card =
      (version.cards || []).find((item, index) => item?.id === focusTarget.cardKey || index === focusTarget.currentIndex || index === focusTarget.previousIndex) || null;
    return renderReadOnlyCardInspection(readVersionTabLabel(version), card, true);
  }

  return renderReadOnlyMicrosequenceInspection(
    readVersionTabLabel(version),
    version,
    focusTarget,
    Boolean(focusTarget),
    Array.isArray(version?.dependsOnTitles) ? version.dependsOnTitles : []
  );
}

export function renderVersionCompareOverlay({ comparison, uiState = {} }) {
  if (!comparison) {
    return "";
  }

  const activeTab = uiState?.activeTab === "previous" || uiState?.activeTab === "current" ? uiState.activeTab : "summary";
  const focusTarget = uiState?.focusTarget || null;
  const bodyMarkup =
    activeTab === "summary"
      ? renderSummaryTab(comparison)
      : renderVersionTab(comparison, activeTab, focusTarget);

  return (
    '<section class="editor-overlay" aria-label="Comparação de versões">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="version-compare-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">Comparar</p>' +
    '<div class="topbar-space"></div>' +
    "</header>" +
    '<div class="editor-body">' +
    '<div class="editor-version-tabbar">' +
    '<div class="editor-version-strip" role="tablist" aria-label="Comparação de versões">' +
    renderTabButton("summary", "Resumo", activeTab === "summary") +
    renderTabButton("previous", readVersionTabLabel(comparison.previousVersion), activeTab === "previous", formatVersionTabTimestamp(comparison.previousVersion?.updatedAt || comparison.previousVersion?.createdAt || "")) +
    renderTabButton("current", readVersionTabLabel(comparison.currentVersion), activeTab === "current", formatVersionTabTimestamp(comparison.currentVersion?.updatedAt || comparison.currentVersion?.createdAt || "")) +
    "</div></div>" +
    renderDecisionBar(comparison) +
    bodyMarkup +
    "</div></article></section>"
  );
}
