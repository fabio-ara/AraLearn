import { createEditorSession } from "/src/editor/contractEditor.js";
import { createLessonEditorApp } from "/src/ui/lessonEditorApp.js";
import { homeTrailSnapshotForProject } from "/tests/support/homeTrailSnapshot.js";

const response = await fetch("/tests/fixtures/package/resource-test-course.json", {
  cache: "no-store"
});
if (!response.ok) throw new Error("Não foi possível carregar o curso de teste.");

const project = await response.json();
const course = project.courses[0];
const cardCount = course.modules.reduce(
  (total, moduleValue) => total + moduleValue.lessons.reduce(
    (lessonTotal, lesson) => lessonTotal + lesson.microsequences.reduce(
      (microTotal, microsequence) => microTotal + microsequence.cards.length,
      0
    ),
    0
  ),
  0
);
const trailSnapshot = homeTrailSnapshotForProject(project, {
  groupTitle: "Avaliação local",
  permissions: {
    [course.id]: {
      origin: "private",
      canEdit: false,
      canDelete: false,
      canRemove: false,
      cardCount
    }
  }
});

const progressStorageKey = "aralearn.resource-test.progress.v1";
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

const state = {
  project: structuredClone(project),
  progress: loadLocalProgress(),
  reviewItems: [],
  comments: new Map()
};

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
  loadReviewItems: () => structuredClone(state.reviewItems),
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
  homeTrails: {
    loadTrailSnapshot: async () => structuredClone(trailSnapshot)
  },
  trailPersonalStateFactory: () => storage
});

globalThis.__RESOURCE_TEST_COURSE_READY__ = true;
