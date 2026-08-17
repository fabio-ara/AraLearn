import test from "node:test";
import assert from "node:assert/strict";

import { CourseStudyRepository } from "../../src/study/CourseStudyRepository.js";

const COURSE_A = "10000000-0000-4000-8000-000000000001";
const COURSE_B = "20000000-0000-4000-8000-000000000002";

function course(courseId, suffix) {
  return {
    id: courseId,
    title: `Curso ${suffix}`,
    goal: "Aprender.",
    modules: [{
      id: `module-${suffix}`,
      title: "Módulo",
      guide: { goal: "Guiar.", include: [], exclude: [], notation: [], avoid: [] },
      lessons: [{
        id: `lesson-${suffix}`,
        title: "Lição",
        guide: { goal: "Ensinar.", include: [], exclude: [], notation: [], avoid: [] },
        topics: [],
        microsequences: [{
          id: `micro-${suffix}`,
          title: "Microssequência",
          goal: "Explicar.",
          role: "explain",
          dependsOn: [], covers: [], checks: [], errors: [],
          cards: [{
            id: `unit-${suffix}`,
            position: 1,
            title: "Unidade",
            role: "theory",
            content: [{
              id: `paragraph-${suffix}`,
              package: "aralearn.resource.paragraph",
              version: "1.0.0",
              data: { text: "Conteúdo." }
            }],
            response: null,
            feedback: [], topics: [], sources: []
          }]
        }]
      }]
    }]
  };
}

function addSecondModule(courseValue, suffix) {
  courseValue.modules.push({
    id: `module-${suffix}`,
    title: "Outro Módulo",
    guide: { goal: "Separar.", include: [], exclude: [], notation: [], avoid: [] },
    lessons: [{
      id: `lesson-${suffix}`,
      title: "Outra Lição",
      guide: { goal: "Preservar.", include: [], exclude: [], notation: [], avoid: [] },
      topics: [],
      microsequences: [{
        id: `micro-${suffix}`,
        title: "Outra Microssequência",
        goal: "Verificar.",
        role: "explain",
        dependsOn: [], covers: [], checks: [], errors: [],
        cards: [{
          id: `unit-${suffix}-first`,
          position: 1,
          title: "Primeira Unidade",
          role: "theory",
          content: [{
            id: `paragraph-${suffix}-first`,
            package: "aralearn.resource.paragraph",
            version: "1.0.0",
            data: { text: "Conteúdo anterior." }
          }],
          response: null,
          feedback: [], topics: [], sources: []
        }, {
          id: `unit-${suffix}`,
          position: 2,
          title: "Unidade posterior",
          role: "theory",
          content: [{
            id: `paragraph-${suffix}`,
            package: "aralearn.resource.paragraph",
            version: "1.0.0",
            data: { text: "Outro conteúdo." }
          }],
          response: null,
          feedback: [], topics: [], sources: []
        }]
      }]
    }]
  });
}

function cache() {
  const values = new Map();
  return {
    async getCache(key) { return structuredClone(values.get(key) ?? null); },
    async putCache(key, value) {
      if (value == null) values.delete(key);
      else values.set(key, structuredClone(value));
    },
    async deleteCachePrefix(prefix) {
      for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
    }
  };
}

test("compõe a tela de Estudo de Cursos e isola estado pessoal por courseId", async () => {
  const courseA = course(COURSE_A, "a");
  addSecondModule(courseA, "c");
  courseA.modules[0].lessons[0].microsequences.push({
    id: "micro-a-later",
    title: "Microssequência posterior",
    goal: "Preservar escopo.",
    role: "explain",
    dependsOn: [], covers: [], checks: [], errors: [],
    cards: [{
      id: "unit-a-later",
      position: 2,
      title: "Unidade posterior",
      role: "theory",
      content: [{
        id: "paragraph-a-later",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Conteúdo posterior." }
      }],
      response: null,
      feedback: [], topics: [], sources: []
    }]
  });
  const documents = new Map([
    [COURSE_A, courseA],
    [COURSE_B, course(COURSE_B, "b")]
  ]);
  const remoteStates = new Map();
  const clearedCourses = [];
  const loadedCourses = [];
  const bridge = {
    async listAccessibleCourses() {
      return {
        items: [...documents].map(([courseId, value]) => ({
          courseId, title: value.title, goal: value.goal, revision: 1,
          moduleCount: 1, lessonCount: 1, studyUnitCount: 1,
          completedStudyUnitCount: 0
        })),
        hasMore: false,
        nextCursor: null
      };
    },
    async loadCourse(courseId) {
      loadedCourses.push(courseId);
      return {
        document: { contract: "aralearn.library.v1", courses: [documents.get(courseId)] }
      };
    },
    async clearCourse(courseId) {
      clearedCourses.push(courseId);
    }
  };
  const api = {
    async listCourseReviewItems() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async loadPersonalState(courseId) { return remoteStates.get(courseId) || null; },
    async mutatePersonalState({ courseId, expectedRevision, operations }) {
      const current = remoteStates.get(courseId) || {
        contract: "aralearn.course-personal-state.v1",
        courseId,
        revision: 0,
        state: {
          version: 1,
          progress: { version: 3, lessons: {} },
          reviewMarks: {}, observations: {}
        }
      };
      assert.equal(current.revision, expectedRevision);
      for (const operation of operations) {
        const target = operation.collection === "progress.lessons"
          ? current.state.progress.lessons : current.state[operation.collection];
        if (operation.kind === "delete") delete target[operation.path];
        else target[operation.path] = structuredClone(operation.value);
      }
      current.revision += 1;
      current.updatedAt = "2026-08-17T12:00:00.000Z";
      remoteStates.set(courseId, current);
      return {
        courseId,
        revision: current.revision,
        updatedAt: current.updatedAt,
        idempotent: false
      };
    }
  };
  const repository = new CourseStudyRepository({
    bridge,
    api,
    cache: cache(),
    clock: () => "2026-08-17T12:00:00.000Z"
  });
  await repository.initialize();

  assert.deepEqual(repository.loadProject().courses.map(({ id }) => id), [COURSE_A, COURSE_B]);
  assert.deepEqual(loadedCourses, []);
  assert.deepEqual(repository.loadProject().courses[0].modules, []);
  assert.equal(repository.loadCourseSummaries()[0].studyUnitCount, 1);
  assert.equal(repository.resolveCourseContractKey(COURSE_A), COURSE_A);
  const reference = {
    courseId: COURSE_B,
    moduleId: "module-b",
    lessonId: "lesson-b",
    microsequenceId: "micro-b",
    studyUnitId: "unit-b"
  };
  await repository.loadCourse(COURSE_B);
  await repository.setStudyUnitCompleted(reference, true);
  assert.equal(repository.isStudyUnitCompleted(reference), true);
  const referenceA = {
    courseId: COURSE_A,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: "unit-a"
  };
  await repository.loadCourse(COURSE_A);
  await repository.setStudyUnitCompleted(referenceA, true);
  await repository.clearCourseProgress(COURSE_B);
  assert.equal(repository.isStudyUnitCompleted(reference), false);
  assert.equal(repository.isStudyUnitCompleted(referenceA), true);
  const referenceC = {
    courseId: COURSE_A,
    moduleId: "module-c",
    lessonId: "lesson-c",
    microsequenceId: "micro-c",
    studyUnitId: "unit-c"
  };
  await repository.setStudyUnitCompleted(referenceC, true);
  const referenceLater = {
    courseId: COURSE_A,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a-later",
    studyUnitId: "unit-a-later"
  };
  await repository.setStudyUnitCompleted(referenceLater, true);
  await repository.clearProgressScope({
    courseId: COURSE_A,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: "unit-a"
  });
  assert.equal(repository.isStudyUnitCompleted(referenceA), false);
  assert.equal(repository.isStudyUnitCompleted(referenceLater), false);
  assert.equal(repository.isStudyUnitCompleted(referenceC), true);
  await repository.setStudyUnitCompleted(referenceA, true);
  await repository.setStudyUnitCompleted(referenceLater, true);
  await repository.clearProgressScope({
    courseId: COURSE_A,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a"
  });
  assert.equal(repository.isStudyUnitCompleted(referenceA), false);
  assert.equal(repository.isStudyUnitCompleted(referenceLater), true);
  assert.equal(repository.isStudyUnitCompleted(referenceC), true);
  assert.equal(repository.loadCourseSummaries()[0].completedStudyUnitCount, 2);
  assert.equal(remoteStates.has(COURSE_A), true);
  assert.equal(remoteStates.has(COURSE_B), true);
  assert.deepEqual(loadedCourses, [COURSE_B, COURSE_A]);

  documents.delete(COURSE_B);
  await repository.refreshCourses();
  assert.deepEqual(repository.loadProject().courses.map(({ id }) => id), [COURSE_A]);
  assert.deepEqual(clearedCourses, [COURSE_B]);
  assert.equal(remoteStates.has(COURSE_B), true);
});

test("carrega a fila Rever por páginas somente quando solicitado", async () => {
  const courseValue = course(COURSE_A, "a");
  const cursors = [];
  const review = (unitId, markedAt) => ({
    courseId: COURSE_A,
    title: unitId,
    context: "Curso · Módulo · Lição · Microssequência",
    entityPath: [COURSE_A, "module-a", "lesson-a", "micro-a", unitId],
    reviewMarkedAt: markedAt
  });
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [{
            courseId: COURSE_A,
            title: courseValue.title,
            goal: courseValue.goal,
            revision: 1,
            studyUnitCount: 2,
            completedStudyUnitCount: 0
          }],
          hasMore: false,
          nextCursor: null,
          offline: true,
          stale: true,
          readOnly: true
        };
      },
      async loadCourse() {
        return { document: { contract: "aralearn.library.v1", courses: [courseValue] } };
      },
      async clearCourse() {}
    },
    api: {
      async listCourseReviewItems({ limit, cursor }) {
        assert.equal(limit, 20);
        cursors.push(structuredClone(cursor));
        return cursor == null
          ? {
              items: [review("unit-a", "2026-08-17T12:00:00.000Z")],
              hasMore: true,
              nextCursor: {
                beforeMarkedAt: "2026-08-17T12:00:00.000Z",
                beforeCourseId: COURSE_A,
                beforeStudyUnitId: "unit-a"
              }
            }
          : {
              items: [review("unit-b", "2026-08-17T11:00:00.000Z")],
              hasMore: false,
              nextCursor: null
            };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("Não usado."); }
    },
    cache: cache()
  });

  await repository.initialize();
  assert.deepEqual(repository.loadRuntimeStatus(COURSE_A), {
    offline: true,
    stale: true,
    readOnly: true
  });
  assert.equal(cursors.length, 1);
  assert.equal(repository.loadReviewItems().length, 1);
  assert.equal(repository.hasMoreReviewItems(), true);
  await repository.loadMoreReviewItems();
  assert.equal(cursors.length, 2);
  assert.equal(repository.loadReviewItems().length, 2);
  assert.equal(repository.hasMoreReviewItems(), false);
});

test("atualiza progresso, Rever e observação alterados em outro dispositivo", async () => {
  const courseValue = course(COURSE_A, "a");
  let remoteState = null;
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [{
            courseId: COURSE_A,
            title: courseValue.title,
            goal: courseValue.goal,
            revision: 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse() {
        return { document: { contract: "aralearn.library.v1", courses: [courseValue] } };
      },
      async clearCourse() {}
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() {
        return structuredClone(remoteState);
      },
      async mutatePersonalState() {
        throw new Error("Não usado.");
      }
    },
    cache: cache(),
    clock: () => "2026-08-17T12:00:00.000Z"
  });
  await repository.initialize();
  await repository.loadCourse(COURSE_A);
  const reference = {
    courseId: COURSE_A,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: "unit-a"
  };
  remoteState = {
    contract: "aralearn.course-personal-state.v1",
    courseId: COURSE_A,
    revision: 1,
    updatedAt: "2026-08-17T12:30:00.000Z",
    state: {
      version: 1,
      progress: {
        version: 3,
        lessons: {
          "lesson-a": {
            cursorStudyUnitId: "unit-a",
            completedStudyUnitIds: ["unit-a"]
          }
        }
      },
      reviewMarks: { "unit-a": "2026-08-17T12:20:00.000Z" },
      observations: {
        "unit-a": {
          category: "possible_error",
          body: "A formulação remota precisa de revisão.",
          updatedAt: "2026-08-17T12:25:00.000Z"
        }
      }
    }
  };

  const refreshedProject = await repository.refreshPersonalState();

  assert.deepEqual(refreshedProject, repository.loadProject());
  assert.equal(repository.isStudyUnitCompleted(reference), true);
  assert.equal(repository.loadCourseSummaries()[0].completedStudyUnitCount, 1);
  assert.equal(repository.isStudyUnitMarkedForReview(reference), true);
  assert.equal(repository.loadReviewItems()[0].studyUnitId, "unit-a");
  assert.equal(
    repository.loadCommentForPath(reference).body,
    "A formulação remota precisa de revisão."
  );
});

test("retira somente o Curso cujo acesso foi revogado durante o refresh pessoal", async () => {
  const documents = new Map([
    [COURSE_A, course(COURSE_A, "a")],
    [COURSE_B, course(COURSE_B, "b")]
  ]);
  const clearedCourses = [];
  let revokedCourseId = "";
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [...documents].map(([courseId, value]) => ({
            courseId,
            title: value.title,
            goal: value.goal,
            revision: 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          })),
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse(courseId) {
        return {
          document: { contract: "aralearn.library.v1", courses: [documents.get(courseId)] }
        };
      },
      async clearCourse(courseId) {
        clearedCourses.push(courseId);
      }
    },
    api: {
      async listCourseReviewItems() {
        return {
          items: [{
            courseId: COURSE_B,
            title: "Unidade B",
            context: "Curso B",
            entityPath: [COURSE_B, "module-b", "lesson-b", "micro-b", "unit-b"],
            reviewMarkedAt: "2026-08-17T12:00:00.000Z"
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadPersonalState(courseId) {
        if (courseId === revokedCourseId) {
          throw Object.assign(new Error("Acesso revogado."), { status: 403, code: "42501" });
        }
        return null;
      },
      async mutatePersonalState() {
        throw new Error("Não usado.");
      }
    },
    cache: cache()
  });
  await repository.initialize();
  await repository.loadCourse(COURSE_A);
  await repository.loadCourse(COURSE_B);
  revokedCourseId = COURSE_B;

  const projectAfterRevocation = await repository.refreshPersonalState();

  assert.deepEqual(projectAfterRevocation.courses.map(({ id }) => id), [COURSE_A]);
  assert.deepEqual(repository.loadCourseSummaries().map(({ courseId }) => courseId), [COURSE_A]);
  assert.deepEqual(repository.loadReviewItems(), []);
  assert.deepEqual(clearedCourses, [COURSE_B]);
  assert.doesNotThrow(() => repository.loadProgress());
});

test("flush purga Curso revogado após mutação offline pendente e libera ciclos seguintes", async () => {
  const courseValue = course(COURSE_A, "a");
  const clearedCourses = [];
  let accessible = true;
  let offline = true;
  let revoked = false;
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: accessible ? [{
            courseId: COURSE_A,
            title: courseValue.title,
            goal: courseValue.goal,
            revision: 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }] : [],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse() {
        return { document: { contract: "aralearn.library.v1", courses: [courseValue] } };
      },
      async clearCourse(courseId) {
        clearedCourses.push(courseId);
      }
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() {
        return null;
      },
      async mutatePersonalState() {
        if (offline) throw new TypeError("Failed to fetch");
        if (revoked) {
          throw Object.assign(new Error("Acesso revogado."), { status: 403, code: "42501" });
        }
        throw new Error("Mutação inesperada.");
      }
    },
    cache: cache(),
    clock: () => "2026-08-17T12:00:00.000Z"
  });
  await repository.initialize();
  await repository.loadCourse(COURSE_A);
  const reference = {
    courseId: COURSE_A,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: "unit-a"
  };
  await repository.setStudyUnitCompleted(reference, true);
  assert.equal(repository.isStudyUnitCompleted(reference), true);

  offline = false;
  revoked = true;
  accessible = false;
  await repository.flush();

  assert.deepEqual(repository.loadProject().courses, []);
  assert.deepEqual(clearedCourses, [COURSE_A]);
  await repository.refreshCourses();
  await repository.refreshPersonalState();
  await repository.flush();
  assert.deepEqual(repository.loadCourseSummaries(), []);
  assert.deepEqual(repository.loadReviewItems(), []);
});
