import { readCardText } from "../core/cardRuntime.js";
import { isRunnableMicrosequence, resolveMicrosequenceRuntimeIncluded } from "../model/microsequenceStatus.js";
import {
  getRuntimePopupButtonEntry,
  renderCardRuntimeBlocksWithDock,
  renderPopupButtonDock
} from "../render/renderCardRuntime.js";
import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function entityId(entity) {
  return typeof entity?.id === "string" ? entity.id : "";
}

function cardsOf(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

function runnableCardsInLesson(lesson) {
  return (lesson?.microsequences || []).flatMap((microsequence) =>
    isRunnableMicrosequence(microsequence) ? cardsOf(microsequence) : []
  );
}

function lessonProgress(progress, course, moduleValue, lesson) {
  return readLessonProgressEntry(progress, {
    courseKey: entityId(course),
    moduleKey: entityId(moduleValue),
    lessonKey: entityId(lesson)
  });
}

function completedKeys(progress, course, moduleValue, lesson) {
  const entry = lessonProgress(progress, course, moduleValue, lesson);
  return Array.isArray(entry?.completedCardKeys) ? entry.completedCardKeys : [];
}

function lessonCounts(progress, course, moduleValue, lesson) {
  return {
    completed: completedKeys(progress, course, moduleValue, lesson).length,
    total: runnableCardsInLesson(lesson).length
  };
}

function moduleCounts(progress, course, moduleValue) {
  return (moduleValue?.lessons || []).reduce((result, lesson) => {
    const counts = lessonCounts(progress, course, moduleValue, lesson);
    result.completed += counts.completed;
    result.total += counts.total;
    return result;
  }, { completed: 0, total: 0 });
}

function courseCounts(progress, course) {
  return (course?.modules || []).reduce((result, moduleValue) => {
    const counts = moduleCounts(progress, course, moduleValue);
    result.completed += counts.completed;
    result.total += counts.total;
    return result;
  }, { completed: 0, total: 0 });
}

function percentage(completed, total) {
  return total ? Math.max(0, Math.min(100, (completed / total) * 100)) : 0;
}

function normalizeDescription(value, maximum = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1).trimEnd()}…` : text;
}

function metric(icon, value, label) {
  return (
    '<span class="progress-meta-item" title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '">' +
    renderUiIcon(icon, "progress-meta-item-icon") +
    '<span class="progress-meta-item-value">' + escapeHtml(value) + "</span></span>"
  );
}

function metaLine(completed, total, details = []) {
  return (
    '<p class="muted tiny progress-meta">' +
    [metric("progress", `${completed}/${total}`, `Progresso: ${completed}/${total}`), ...details]
      .join('<span class="progress-meta-separator" aria-hidden="true">·</span>') +
    "</p>"
  );
}

function brandTopbar() {
  return (
    '<header class="topbar home-topbar navigation-topbar">' +
    '<div class="topbar-space"></div>' +
    '<h1 class="topbar-title"><span class="brand-title">' +
    '<img class="brand-mark" src="assets/brand/aralearn-mark.png" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span></span></h1>' +
    '<div class="lesson-top-actions">' + syncButton() + "</div></header>"
  );
}

function syncButton() {
  return '<button class="icon-ghost" type="button" data-action="future-sync" title="Abrir biblioteca e sincronização" aria-label="Abrir biblioteca e sincronização">☁</button>';
}

function topbar(title, backTitle) {
  return (
    '<header class="topbar lesson-topbar navigation-topbar">' +
    '<button class="icon-ghost" type="button" data-action="go-back" title="' + escapeHtml(backTitle) + '" aria-label="' + escapeHtml(backTitle) + '">‹</button>' +
    '<div class="topbar-heading"><div class="topbar-title">' + escapeHtml(title) + "</div></div>" +
    '<div class="lesson-top-actions">' + syncButton() + "</div></header>"
  );
}

function sectionHeading(title) {
  return '<section class="section-heading-row centered-section-heading-row navigation-heading-row"><h2 class="section-heading">' + escapeHtml(title) + "</h2></section>";
}

function navigationCard({
  level,
  courseKey,
  moduleKey = "",
  lessonKey = "",
  itemKey,
  title,
  description = "",
  completed,
  total,
  detailIcon,
  detailCount,
  openAction,
  openTitle
}) {
  const keys =
    ' data-course-key="' + escapeHtml(courseKey) + '"' +
    (moduleKey ? ' data-module-key="' + escapeHtml(moduleKey) + '"' : "") +
    (lessonKey ? ' data-lesson-key="' + escapeHtml(lessonKey) + '"' : "") +
    (level === "module" ? ' data-module-key="' + escapeHtml(itemKey) + '"' : "") +
    (level === "lesson" ? ' data-lesson-key="' + escapeHtml(itemKey) + '"' : "") +
    (level === "microsequence" ? ' data-microsequence-key="' + escapeHtml(itemKey) + '"' : "");
  return (
    '<article class="clean-card progress-card structure-list-card navigation-list-card" data-structure-target="' + escapeHtml(level) + '"' + keys + ">" +
    '<div class="card-progress-fill" style="width:' + percentage(completed, total) + '%"></div>' +
    '<div class="lesson-copy structure-copy navigation-main">' +
    '<div class="structure-title-row navigation-title-row"><h3 class="card-title">' + escapeHtml(title) + "</h3></div>" +
    (description ? '<p class="card-subtitle">' + escapeHtml(description) + "</p>" : "") +
    "</div>" +
    metaLine(completed, total, [metric(detailIcon, String(detailCount), String(detailCount))]) +
    (openAction
      ? '<div class="lesson-actions structure-actions navigation-actions"><button class="open-mini" type="button" data-action="' + escapeHtml(openAction) + '"' + keys + ' title="' + escapeHtml(openTitle) + '" aria-label="' + escapeHtml(openTitle) + '">▶</button></div>'
      : "") +
    "</article>"
  );
}

function coursePreview(course, progress) {
  const counts = courseCounts(progress, course);
  const moduleCount = (course.modules || []).length;
  const lessonCount = (course.modules || []).reduce((total, moduleValue) => total + (moduleValue.lessons || []).length, 0);
  return (
    '<article class="clean-card course-card progress-card navigation-list-card" data-course-key="' + escapeHtml(entityId(course)) + '">' +
    '<div class="card-progress-fill" style="width:' + percentage(counts.completed, counts.total) + '%"></div>' +
    '<div class="course-copy navigation-main"><div class="course-title-row navigation-title-row"><h3 class="card-title">' + escapeHtml(course.title || "Curso") + "</h3></div>" +
    (course.goal ? '<p class="card-subtitle">' + escapeHtml(normalizeDescription(course.goal)) + "</p>" : "") +
    "</div>" +
    metaLine(counts.completed, counts.total, [
      metric("module", String(moduleCount), `${moduleCount} módulos`),
      metric("lesson", String(lessonCount), `${lessonCount} lições`)
    ]) +
    '<div class="course-actions navigation-actions"><button class="open-main" type="button" data-action="open-course" data-course-key="' + escapeHtml(entityId(course)) + '" title="Abrir curso" aria-label="Abrir curso">▶</button></div>' +
    "</article>"
  );
}

function renderHome(project, progress, studyPaths) {
  const courses = project.courses || [];
  const byId = new Map(courses.map((course) => [entityId(course), course]));
  const assigned = new Set();
  const paths = (Array.isArray(studyPaths) ? studyPaths : []).map((path) => {
    const items = (path.courses || []).map((entry) => byId.get(entry.courseId)).filter(Boolean);
    items.forEach((course) => assigned.add(entityId(course)));
    return '<section class="home-study-path">' +
      '<div class="centered-section-heading-row home-study-path-heading">' + renderUiIcon("trail", "home-study-path-icon") +
      '<h2 class="section-heading">' + escapeHtml(path.title || "Trilha") + "</h2></div>" +
      '<div class="navigation-list home-study-path-courses">' +
      (items.map((course) => coursePreview(course, progress)).join("") || '<p class="empty-state-copy home-study-path-empty">Sem cursos.</p>') +
      "</div></section>";
  });
  const remaining = courses.filter((course) => !assigned.has(entityId(course)));
  if (remaining.length || !paths.length) {
    paths.push('<section class="home-study-path">' +
      (paths.length ? '<div class="centered-section-heading-row home-study-path-heading"><h2 class="section-heading">Sem trilha</h2></div>' : "") +
      '<div class="navigation-list home-study-path-courses">' +
      (remaining.map((course) => coursePreview(course, progress)).join("") || (!courses.length ? '<article class="clean-card"><p class="empty-state-copy">Nenhum curso.</p></article>' : "")) +
      "</div></section>");
  }
  return '<section class="screen">' + brandTopbar() +
    '<main class="screen-content courses-home-screen navigation-screen">' +
    sectionHeading(studyPaths?.length ? "Trilhas" : "Cursos") +
    '<section class="courses-home-list navigation-list">' + paths.join("") + "</section></main></section>";
}

function renderCourse(course, progress) {
  const modules = (course.modules || []).map((moduleValue) => {
    const counts = moduleCounts(progress, course, moduleValue);
    return navigationCard({
      level: "module",
      courseKey: entityId(course),
      itemKey: entityId(moduleValue),
      title: moduleValue.title || entityId(moduleValue),
      description: normalizeDescription(moduleValue?.guide?.goal),
      completed: counts.completed,
      total: counts.total,
      detailIcon: "lesson",
      detailCount: (moduleValue.lessons || []).length,
      openAction: "open-module",
      openTitle: "Abrir módulo"
    });
  }).join("");
  return '<section class="screen">' + topbar("Módulos", "Menu principal") +
    '<main class="screen-content course-screen">' + sectionHeading(course.title || "Curso") +
    '<section class="navigation-list structure-navigation-list">' +
    (modules || '<section class="clean-card progress-card"><p class="empty-state-copy">Sem módulos.</p></section>') +
    "</section></main></section>";
}

function renderModule(course, moduleValue, progress) {
  const lessons = (moduleValue.lessons || []).map((lesson) => {
    const counts = lessonCounts(progress, course, moduleValue, lesson);
    return navigationCard({
      level: "lesson",
      courseKey: entityId(course),
      moduleKey: entityId(moduleValue),
      itemKey: entityId(lesson),
      title: lesson.title || entityId(lesson),
      description: normalizeDescription(lesson?.guide?.goal || lesson?.description),
      completed: counts.completed,
      total: counts.total,
      detailIcon: "microsequence",
      detailCount: (lesson.microsequences || []).length,
      openAction: "open-lesson",
      openTitle: "Abrir lição"
    });
  }).join("");
  return '<section class="screen">' + topbar("Lições", "Voltar") +
    '<main class="screen-content course-screen">' + sectionHeading(moduleValue.title || "Módulo") +
    '<section class="navigation-list structure-navigation-list">' +
    (lessons || '<section class="clean-card progress-card"><p class="empty-state-copy">Sem lições.</p></section>') +
    "</section></main></section>";
}

function renderLesson(course, moduleValue, lesson, progress) {
  const completed = new Set(completedKeys(progress, course, moduleValue, lesson));
  const available = (lesson.microsequences || []).filter(resolveMicrosequenceRuntimeIncluded);
  const rows = available.map((microsequence) => {
    const cards = cardsOf(microsequence);
    const done = cards.reduce((total, card) => total + (completed.has(card.id) ? 1 : 0), 0);
    return navigationCard({
      level: "microsequence",
      courseKey: entityId(course),
      moduleKey: entityId(moduleValue),
      lessonKey: entityId(lesson),
      itemKey: entityId(microsequence),
      title: microsequence.title || entityId(microsequence),
      description: normalizeDescription(microsequence.goal),
      completed: done,
      total: cards.length,
      detailIcon: "card",
      detailCount: cards.length,
      openAction: cards.length ? "play-microsequence" : "",
      openTitle: "Abrir microssequência"
    });
  }).join("");
  return '<section class="screen">' + topbar("", "Voltar") +
    '<main class="screen-content lesson-structure-screen navigation-screen"><section class="microsequence-group navigation-list">' +
    sectionHeading(lesson.title || "Lição") +
    (rows || '<section class="clean-card progress-card"><p class="empty-state-copy">Sem microssequências disponíveis.</p></section>') +
    "</section></main></section>";
}

function renderStudy(course, microsequence, cards, selection, runtimeOptions, continuePopup) {
  const safeIndex = Math.max(0, Math.min(Number(selection.cardIndex) || 0, Math.max(0, cards.length - 1)));
  const card = cards[safeIndex] || null;
  const bodyText = readCardText(card);
  const popupEntry = card ? getRuntimePopupButtonEntry(card) : null;
  const runtime = renderCardRuntimeBlocksWithDock(card, {
    omitRepeatedHeading: true,
    fallbackText: bodyText,
    ...(runtimeOptions || {}),
    omitPopupButtonBlock: Boolean(popupEntry)
  });
  const popupDock = popupEntry && continuePopup?.open
      ? renderPopupButtonDock(popupEntry.block, {
        ...(runtimeOptions || {}),
        blockKeyPrefix: `${continuePopup.blockKey}::popup`
      })
    : { bodyHtml: "", dockHtml: "" };
  const popupHtml = popupEntry && continuePopup?.open
    ? '<div class="study-continue-popup-shell"><section class="study-continue-popup">' +
      '<div class="study-continue-popup-body">' + popupDock.bodyHtml + "</div>" + popupDock.dockHtml +
      '<div class="study-continue-popup-actions"><button class="open-mini study-continue-popup-btn" type="button" data-action="continue-popup-next" title="Continuar" aria-label="Continuar">▶</button></div>' +
      "</section></div>"
    : "";
  const progress = cards.length ? ((safeIndex + 1) / cards.length) * 100 : 0;
  return '<section class="screen microsequence-workbench-screen">' + topbar(course?.title || "Curso", "Voltar para a lição") +
    '<main class="screen-content microsequence-generator-screen"><section class="workbench-surface" data-workbench-pane="preview">' +
    '<div class="workbench-surface-body"><section class="workbench-surface-pane workbench-preview-pane study-reader-screen">' +
    '<section class="study-reader-context"><div class="study-reader-line"><span class="study-reader-context-line study-reader-course-title">' + escapeHtml(microsequence?.title || "Microssequência") + "</span></div>" +
    '<div class="study-reader-progress"><span style="width:' + progress + '%"></span></div></section>' +
    '<section class="card-portrait editor-card-portrait study-stage"><article class="card-portrait-body card-portrait-sheet runtime-card-sheet">' +
    '<div class="runtime-card-title">' + escapeHtml(card?.title || card?.id || "Sem card") + "</div>" +
    '<div class="card-sheet-content">' + runtime.bodyHtml + "</div>" + runtime.dockHtml + "</article></section>" +
    '<div class="study-reader-stage-meta"><span class="study-reader-count" title="Card ' + (cards.length ? safeIndex + 1 : 0) + " de " + cards.length + '">' +
    renderUiIcon("card", "study-reader-count-icon") + '<span class="study-reader-count-value">' + (cards.length ? safeIndex + 1 : 0) + "/" + cards.length + "</span></span></div>" +
    '<section class="study-reader-footer"><div class="study-action-dock"><div class="study-action-stack"><div class="study-next-wrap' + (popupHtml ? " is-popup-open" : "") + '">' +
    '<button class="icon-ghost study-comment-btn" type="button" data-action="open-card-comment" title="Anotação pessoal" aria-label="Anotação pessoal"><span class="comment-glyph" aria-hidden="true"></span></button>' +
    '<button class="icon-ghost" type="button" data-action="prev-card" ' + (safeIndex <= 0 ? 'disabled aria-disabled="true"' : "") + ' title="Card anterior" aria-label="Card anterior">←</button>' +
    '<button class="open-mini study-continue-btn" type="button" data-action="next-card" ' + (!cards.length ? 'disabled aria-disabled="true"' : "") + ' title="Continuar" aria-label="Continuar">▶</button>' +
    popupHtml + "</div></div></div></section></section></div></section></main></section>";
}

export function renderLearnerScreen({ project, view, selection, course, moduleValue, lesson, microsequence, cards, support }) {
  if (view === "courses") return renderHome(project, support.progress, support.studyPaths);
  if (view === "course") return renderCourse(course, support.progress);
  if (view === "module") return renderModule(course, moduleValue, support.progress);
  if (view === "lesson") return renderLesson(course, moduleValue, lesson, support.progress);
  return renderStudy(course, microsequence, Array.isArray(cards) ? cards : [], selection, support.cardRuntimeOptions, support.continuePopup);
}
