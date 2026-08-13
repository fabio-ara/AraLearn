import { createEditorSession } from "/src/editor/contractEditor.js";
import { createLessonEditorApp } from "/src/ui/lessonEditorApp.js";
import { homeTrailSnapshotForProject } from "/tests/support/homeTrailSnapshot.js";

const response = await fetch("/tests/fixtures/pedagogy/academic-stress-courses.json", { cache: "no-store" });
if (!response.ok) throw new Error("Não foi possível carregar os laboratórios acadêmicos.");

const completeProject = await response.json();
const requestedCourse = new URLSearchParams(location.search).get("curso") === "dataprev"
  ? "academic-dataprev-2026"
  : "academic-ifsp-tads";
const project = {
  ...completeProject,
  courses: completeProject.courses.filter(({ id }) => id === requestedCourse)
};
const countCards = (course) => course.modules
  .flatMap(({ lessons }) => lessons)
  .flatMap(({ microsequences }) => microsequences)
  .flatMap(({ cards }) => cards).length;
const permissions = Object.fromEntries(project.courses.map((course) => [course.id, {
  origin: "private",
  canEdit: true,
  canDelete: false,
  canRemove: false,
  cardCount: countCards(course)
}]));
const trailSnapshot = homeTrailSnapshotForProject(project, {
  groupTitle: "Laboratórios acadêmicos",
  permissions
});

const progressStorageKey = "aralearn.academic-stress.progress.v1";
function loadLocalProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(progressStorageKey) || "null");
    return value?.version === 1 && value.lessons && typeof value.lessons === "object"
      ? value
      : { version: 1, lessons: {} };
  } catch {
    return { version: 1, lessons: {} };
  }
}

const state = { project: structuredClone(project), progress: loadLocalProgress(), comments: new Map() };
const pathKey = (path) => JSON.stringify(path || {});
const storage = {
  loadProject: () => structuredClone(state.project),
  saveProject: async (next) => { state.project = structuredClone(next); },
  loadProgress: () => structuredClone(state.progress),
  saveProgress: async (next) => {
    state.progress = structuredClone(next);
    localStorage.setItem(progressStorageKey, JSON.stringify(state.progress));
  },
  initialize: async () => undefined,
  refresh: async () => undefined,
  setCourse: () => undefined,
  clearLocal: async () => true,
  loadReviewItems: () => [],
  isCardMarkedForReview: () => false,
  setCardReviewMark: async () => undefined,
  loadCommentForPath: (path) => structuredClone(state.comments.get(pathKey(path)) || null),
  saveCommentForPath: async (path, value) => {
    state.comments.set(pathKey(path), { ...structuredClone(value), status: "open" });
  },
  deleteCommentForPath: async (path) => { state.comments.delete(pathKey(path)); },
  flush: async () => undefined
};

createLessonEditorApp({
  root: document.querySelector("#app-root"),
  storage,
  editor: createEditorSession(storage),
  initialProject: state.project,
  homeTrails: { loadTrailSnapshot: async () => structuredClone(trailSnapshot) },
  trailPersonalStateFactory: () => storage
});

globalThis.__ACADEMIC_STRESS_COURSES_READY__ = true;
