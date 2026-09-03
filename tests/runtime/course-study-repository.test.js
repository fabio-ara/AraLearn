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
          studyUnits: [{
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
            feedback: [], topics: []
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
        studyUnits: [{
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
          feedback: [], topics: []
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
          feedback: [], topics: []
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
    async updateCache(key, updater) {
      const next = updater(structuredClone(values.get(key) ?? null));
      if (next == null) values.delete(key);
      else values.set(key, structuredClone(next));
      return structuredClone(next);
    },
    async updateCaches(keys, updater) {
      const current = Object.fromEntries(keys.map((key) => [
        key,
        structuredClone(values.get(key) ?? null)
      ]));
      const next = updater(current);
      for (const key of keys) {
        if (next[key] == null) values.delete(key);
        else values.set(key, structuredClone(next[key]));
      }
      return structuredClone(next);
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
    studyUnits: [{
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
      feedback: [], topics: []
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
        document: { contract: "aralearn.course.v1", courses: [documents.get(courseId)] }
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
        contract: "aralearn.course-personal-state.v2",
        courseId,
        revision: 0,
        state: {
          version: 2,
          progress: { version: 3, lessons: {} },
          reviewMarks: {}
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

test("mantém a composição carregada até a revisão anunciada ser validada", async () => {
  const previousCourse = course(COURSE_A, "a");
  const currentCourse = structuredClone(previousCourse);
  currentCourse.title = "Curso atualizado";
  let announcedRevision = 3;
  let currentCompositionIsValid = false;
  const loadOptions = [];
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [{
            courseId: COURSE_A,
            title: announcedRevision === 3 ? previousCourse.title : currentCourse.title,
            goal: previousCourse.goal,
            revision: announcedRevision,
            moduleCount: 1,
            lessonCount: 1,
            microsequenceCount: 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse(_courseId, options) {
        loadOptions.push(structuredClone(options));
        if (announcedRevision === 4 && currentCompositionIsValid) {
          return {
            revision: 4,
            document: { contract: "aralearn.course.v1", courses: [currentCourse] }
          };
        }
        return {
          revision: 3,
          document: { contract: "aralearn.course.v1", courses: [previousCourse] },
          stale: announcedRevision !== 3,
          readOnly: announcedRevision !== 3
        };
      },
      async clearCourse() {}
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("não usado"); }
    },
    cache: cache()
  });

  await repository.initialize();
  await repository.loadCourse(COURSE_A);
  announcedRevision = 4;
  await repository.refreshCourses();

  assert.equal(repository.loadProject().courses[0].title, previousCourse.title);
  assert.deepEqual(repository.loadRuntimeStatus(COURSE_A), {
    offline: false,
    stale: true,
    readOnly: true,
    pending: false
  });

  const preserved = await repository.loadCourse(COURSE_A);
  assert.equal(preserved.title, previousCourse.title);
  assert.deepEqual(loadOptions.at(-1), { verifiedRevision: 4 });
  assert.equal(repository.loadProject().courses[0].title, previousCourse.title);

  currentCompositionIsValid = true;
  const promoted = await repository.loadCourse(COURSE_A);
  assert.equal(promoted.title, currentCourse.title);
  assert.deepEqual(repository.loadRuntimeStatus(COURSE_A), {
    offline: false,
    stale: false,
    readOnly: false,
    pending: false
  });
});

test("expõe o contexto canônico da Unidade carregada para gravação autoral", async () => {
  const courseValue = course(COURSE_A, "a");
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [{
            courseId: COURSE_A,
            title: courseValue.title,
            goal: courseValue.goal,
            revision: 7,
            ownership: "owned",
            canEdit: true,
            moduleCount: 1,
            lessonCount: 1,
            microsequenceCount: 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse() {
        return {
          revision: 7,
          document: { contract: "aralearn.course.v1", courses: [courseValue] },
          rows: [{
            entityType: "study_unit",
            entityId: "unit-a",
            parentId: "micro-a",
            version: 3
          }]
        };
      },
      async clearCourse() {}
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("Não usado."); }
    },
    cache: cache()
  });
  const reference = {
    courseId: COURSE_A,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: "unit-a"
  };

  await repository.initialize();
  assert.equal(repository.loadStudyUnitCompositionContext(reference), null);
  await repository.loadCourse(COURSE_A);
  assert.deepEqual(repository.loadStudyUnitCompositionContext(reference), {
    courseId: COURSE_A,
    courseRevision: 7,
    didacticMicrosequenceId: "micro-a",
    studyUnitId: "unit-a",
    studyUnitVersion: 3
  });
  assert.equal(repository.loadStudyUnitCompositionContext({
    ...reference,
    studyUnitId: "unit-inexistente"
  }), null);
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
        return { document: { contract: "aralearn.course.v1", courses: [courseValue] } };
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
    readOnly: true,
    pending: false
  });
  assert.equal(cursors.length, 1);
  assert.equal(repository.loadReviewItems().length, 1);
  assert.equal(repository.hasMoreReviewItems(), true);
  await repository.loadMoreReviewItems();
  assert.equal(cursors.length, 2);
  assert.equal(repository.loadReviewItems().length, 2);
  assert.equal(repository.hasMoreReviewItems(), false);
});

test("atualiza progresso e Rever alterados em outro dispositivo", async () => {
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
        return { document: { contract: "aralearn.course.v1", courses: [courseValue] } };
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
    contract: "aralearn.course-personal-state.v2",
    courseId: COURSE_A,
    revision: 1,
    updatedAt: "2026-08-17T12:30:00.000Z",
    state: {
      version: 2,
      progress: {
        version: 3,
        lessons: {
          "lesson-a": {
            cursorStudyUnitId: "unit-a",
            completedStudyUnitIds: ["unit-a"]
          }
        }
      },
      reviewMarks: { "unit-a": "2026-08-17T12:20:00.000Z" }
    }
  };

  const refreshedProject = await repository.refreshPersonalState();

  assert.deepEqual(refreshedProject, repository.loadProject());
  assert.equal(repository.isStudyUnitCompleted(reference), true);
  assert.equal(repository.loadCourseSummaries()[0].completedStudyUnitCount, 1);
  assert.equal(repository.isStudyUnitMarkedForReview(reference), true);
  assert.equal(repository.loadReviewItems()[0].studyUnitId, "unit-a");
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
          document: { contract: "aralearn.course.v1", courses: [documents.get(courseId)] }
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
        return { document: { contract: "aralearn.course.v1", courses: [courseValue] } };
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
  assert.equal(repository.loadRuntimeStatus(COURSE_A).pending, true);

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

test("limpeza local fecha o Estudo sem reenviar pendências, enquanto a saída comum faz flush", async () => {
  const createRepositoryWithPendingProgress = async () => {
    const courseValue = course(COURSE_A, "a");
    const state = { acceptMutation: false, mutationCalls: 0 };
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
          return { document: { contract: "aralearn.course.v1", courses: [courseValue] } };
        },
        async clearCourse() {}
      },
      api: {
        async listCourseReviewItems() {
          return { items: [], hasMore: false, nextCursor: null };
        },
        async loadPersonalState() { return null; },
        async mutatePersonalState({ courseId }) {
          state.mutationCalls += 1;
          if (!state.acceptMutation) throw new TypeError("Failed to fetch");
          return {
            courseId,
            revision: 1,
            updatedAt: "2026-08-17T12:00:00.000Z",
            idempotent: false
          };
        }
      },
      cache: cache(),
      clock: () => "2026-08-17T12:00:00.000Z"
    });
    await repository.initialize();
    await repository.loadCourse(COURSE_A);
    await repository.setStudyUnitCompleted({
      courseId: COURSE_A,
      moduleId: "module-a",
      lessonId: "lesson-a",
      microsequenceId: "micro-a",
      studyUnitId: "unit-a"
    }, true);
    assert.equal(state.mutationCalls, 1);
    return { repository, state };
  };

  const destructive = await createRepositoryWithPendingProgress();
  destructive.state.acceptMutation = true;
  await destructive.repository.close({ flush: false });
  assert.equal(destructive.state.mutationCalls, 1);

  const ordinary = await createRepositoryWithPendingProgress();
  ordinary.state.acceptMutation = true;
  await ordinary.repository.close();
  assert.equal(ordinary.state.mutationCalls, 2);
});

test("citações são buscadas somente por Unidade carregada e vinculadas à revisão do Curso", async () => {
  const calls = [];
  const clearedCourses = [];
  let citationFailure = "";
  const document = course(COURSE_A, "a");
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [{
            courseId: COURSE_A,
            title: document.title,
            goal: document.goal,
            revision: 4,
            ownership: "shared",
            canEdit: false,
            moduleCount: 1,
            lessonCount: 1,
            microsequenceCount: 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse() {
        return { document: { contract: "aralearn.course.v1", courses: [document] } };
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
        throw new Error("Não deve alterar estado pessoal.");
      },
      async getStudyUnitCitations(courseId, studyUnitId, options) {
        calls.push({ courseId, studyUnitId, options });
        if (citationFailure === "stale") {
          throw Object.assign(new Error("Revisão base desatualizada."), {
            status: 500,
            code: "40001"
          });
        }
        if (citationFailure === "revoked") {
          throw Object.assign(new Error("Curso não encontrado"), {
            status: 404,
            code: "PT404"
          });
        }
        return {
          contract: "aralearn.course-study-citations.v1",
          courseId,
          courseRevision: 4,
          studyUnitId,
          citations: [{
            sourceId: "fonte-publica",
            title: "Fonte pública",
            citationText: "Autoria. Fonte pública. 2026.",
            url: "https://example.test/fonte",
            editionOrVersion: null,
            anchors: [{
              anchorId: "anchor-publica",
              selector: { kind: "page_range", startPage: 8, endPage: 9 }
            }]
          }]
        };
      }
    },
    cache: cache()
  });
  await repository.initialize();
  await repository.loadCourse(COURSE_A);

  const citations = await repository.loadStudyUnitCitations({
    courseId: COURSE_A,
    studyUnitId: "unit-a"
  });
  assert.deepEqual(calls, [{
    courseId: COURSE_A,
    studyUnitId: "unit-a",
    options: { expectedRevision: 4 }
  }]);
  assert.equal(citations.citations[0].title, "Fonte pública");
  assert.equal("verificationExcerpt" in citations.citations[0].anchors[0], false);

  citationFailure = "stale";
  await assert.rejects(
    repository.loadStudyUnitCitations({
      courseId: COURSE_A,
      studyUnitId: "unit-removed-after-revision-4"
    }),
    (error) => error?.code === "course_revision_changed" &&
      error?.status === 409 && error?.cause?.code === "40001"
  );
  assert.equal(repository.loadProject().courses[0]?.id, COURSE_A);
  assert.equal(repository.loadCourseSummaries()[0]?.courseId, COURSE_A);
  assert.deepEqual(clearedCourses, []);

  citationFailure = "revoked";
  await assert.rejects(
    repository.loadStudyUnitCitations({ courseId: COURSE_A, studyUnitId: "unit-a" }),
    (error) => error?.status === 404 && error?.code === "PT404"
  );
  assert.deepEqual(repository.loadProject().courses, []);
  assert.deepEqual(repository.loadCourseSummaries(), []);
  assert.deepEqual(clearedCourses, [COURSE_A]);
});

test("revogação nas observações purga o Curso, mas anotação ausente não", async () => {
  const courseValue = course(COURSE_A, "a");
  const cleared = [];
  let failureCode = "ANNOTATION_NOT_FOUND";
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
        return { document: { contract: "aralearn.course.v1", courses: [courseValue] } };
      },
      async clearCourse(courseId) { cleared.push(courseId); }
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("Não usado."); },
      async getMyCourseAnchoredAnnotations() {
        const error = new Error(failureCode === "PT404"
          ? "Curso inacessível."
          : "Observação ausente.");
        error.status = failureCode === "PT404" ? 400 : 404;
        error.code = failureCode;
        throw error;
      },
      async executeMyCourseAnchoredAnnotationCommand() { throw new Error("Não usado."); }
    },
    cache: cache()
  });
  await repository.initialize();
  await repository.loadCourse(COURSE_A);
  const target = {
    courseId: COURSE_A,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: "unit-a"
  };

  await assert.rejects(
    repository.refreshAnnotationsForPath(target),
    /Observação ausente/u
  );
  assert.equal(repository.loadProject().courses.length, 1);
  assert.deepEqual(cleared, []);

  failureCode = "PT404";
  await assert.rejects(
    repository.refreshAnnotationsForPath(target),
    /Curso inacessível/u
  );
  assert.equal(repository.loadProject().courses.length, 0);
  assert.deepEqual(cleared, [COURSE_A]);
});

test("valida e persiste a seleção e a posição locais em um envelope fechado", async () => {
  const store = cache();
  const navigationKey = "course.v1.study-navigation";
  await store.putCache(navigationKey, {
    contract: "aralearn.course-study-navigation.v1",
    selectedCourseId: COURSE_A,
    positions: {
      [COURSE_A]: {
        view: "microsequence",
        entityPath: [COURSE_A, "module-a", "lesson-a", "micro-a", "unit-a"],
        microsequenceMode: "play",
        updatedAt: "2026-08-17T11:00:00.000Z",
        internalDebugField: true
      }
    },
    updatedAt: "2026-08-17T11:00:00.000Z"
  });
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [{
            courseId: COURSE_A,
            title: "Curso A",
            goal: "Aprender.",
            revision: 7,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse() { throw new Error("não usado"); },
      async clearCourse() {},
      async hasOfflineCourse() { return false; }
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("não usado"); }
    },
    cache: store,
    clock: () => "2026-08-17T12:00:00.000Z"
  });

  await repository.initialize();
  assert.deepEqual(repository.loadStudyNavigation(), {
    contract: "aralearn.course-study-navigation.v1",
    selectedCourseId: COURSE_A,
    positions: {},
    updatedAt: "2026-08-17T12:00:00.000Z"
  });

  const saved = await repository.saveStudyNavigation({
    selectedCourseId: COURSE_A,
    position: {
      view: "microsequence",
      entityPath: [COURSE_A, "module-a", "lesson-a", "micro-a", "unit-a"],
      microsequenceMode: "overview"
    }
  });
  assert.deepEqual(saved, {
    contract: "aralearn.course-study-navigation.v1",
    selectedCourseId: COURSE_A,
    positions: {
      [COURSE_A]: {
        view: "microsequence",
        entityPath: [COURSE_A, "module-a", "lesson-a", "micro-a", "unit-a"],
        microsequenceMode: "overview",
        updatedAt: "2026-08-17T12:00:00.000Z"
      }
    },
    updatedAt: "2026-08-17T12:00:00.000Z"
  });
  saved.positions[COURSE_A].entityPath[4] = "mutado-fora";
  assert.equal(repository.loadStudyNavigation().positions[COURSE_A].entityPath[4], "unit-a");
  assert.deepEqual(await store.getCache(navigationKey), repository.loadStudyNavigation());

  await assert.rejects(
    repository.saveStudyNavigation({
      selectedCourseId: COURSE_A,
      position: {
        view: "microsequence",
        entityPath: [COURSE_B, "module-a", "lesson-a", "micro-a", "unit-a"],
        microsequenceMode: "play"
      }
    }),
    /outro curso/u
  );
  assert.equal(repository.loadStudyNavigation().positions[COURSE_A].entityPath[0], COURSE_A);
});

test("flush aguarda a gravação local da navegação antes de concluir", async () => {
  const store = cache();
  const originalUpdateCache = store.updateCache.bind(store);
  let blockNavigationWrite = false;
  let releaseWrite;
  let signalWriteStarted;
  const writeStarted = new Promise((resolve) => { signalWriteStarted = resolve; });
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  store.updateCache = async (key, updater) => {
    if (blockNavigationWrite && key === "course.v1.study-navigation") {
      signalWriteStarted();
      await writeGate;
    }
    return originalUpdateCache(key, updater);
  };
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [{
            courseId: COURSE_A,
            title: "Curso A",
            goal: "Aprender.",
            revision: 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse() { throw new Error("não usado"); },
      async clearCourse() {},
      async hasOfflineCourse() { return false; }
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("não usado"); }
    },
    cache: store,
    clock: () => "2026-08-17T12:00:00.000Z"
  });
  await repository.initialize();
  blockNavigationWrite = true;

  const save = repository.saveStudyNavigation({
    selectedCourseId: COURSE_A,
    position: {
      view: "lesson",
      entityPath: [COURSE_A, "module-a", "lesson-a", "micro-a", "unit-a"],
      microsequenceMode: "play"
    }
  });
  await writeStarted;
  let flushFinished = false;
  const flush = repository.flush().then(() => { flushFinished = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flushFinished, false);

  releaseWrite();
  await Promise.all([save, flush]);
  assert.equal(flushFinished, true);
  assert.equal(
    (await store.getCache("course.v1.study-navigation")).positions[COURSE_A].view,
    "lesson"
  );
});

test("limpeza de posição inválida não apaga uma retomada mais nova de outra aba", async () => {
  const store = cache();
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [{
            courseId: COURSE_A,
            title: "Curso A",
            goal: "Aprender A.",
            revision: 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse() { throw new Error("não usado"); },
      async clearCourse() {},
      async hasOfflineCourse() { return false; }
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("não usado"); }
    },
    cache: store,
    clock: () => "2026-08-21T12:00:00.000Z"
  });
  await repository.initialize();
  await repository.saveStudyNavigation({
    selectedCourseId: COURSE_A,
    position: {
      view: "course",
      entityPath: [COURSE_A, "module-a", "lesson-a", "micro-a", "unit-a"],
      microsequenceMode: "play"
    }
  });
  const stalePosition = repository.loadStudyNavigation().positions[COURSE_A];
  const newerPosition = {
    view: "lesson",
    entityPath: [COURSE_A, "module-a", "lesson-a", "micro-a", "unit-a"],
    microsequenceMode: "play",
    updatedAt: "2026-08-21T12:01:00.000Z"
  };
  await store.updateCache("course.v1.study-navigation", (current) => ({
    ...current,
    positions: { ...current.positions, [COURSE_A]: newerPosition },
    updatedAt: newerPosition.updatedAt
  }));

  assert.equal(await repository.clearStudyNavigationPosition(COURSE_A, {
    expectedPosition: stalePosition
  }), false);
  assert.deepEqual(repository.loadStudyNavigation().positions[COURSE_A], newerPosition);
  assert.deepEqual(
    (await store.getCache("course.v1.study-navigation")).positions[COURSE_A],
    newerPosition
  );

  assert.equal(await repository.clearStudyNavigationPosition(COURSE_A, {
    expectedPosition: newerPosition
  }), true);
  assert.equal(repository.loadStudyNavigation().positions[COURSE_A], undefined);
});

test("revogação poda a posição inacessível e limpar progresso preserva o Curso selecionado", async () => {
  const documents = new Map([
    [COURSE_A, course(COURSE_A, "a")],
    [COURSE_B, course(COURSE_B, "b")]
  ]);
  const cleared = [];
  let revokeCourseB = false;
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [...documents].map(([courseId, value], index) => ({
            courseId,
            title: value.title,
            goal: value.goal,
            revision: index + 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          })),
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse(courseId) {
        if (courseId === COURSE_B && revokeCourseB) {
          throw Object.assign(new Error("Acesso revogado."), {
            status: 403,
            code: "42501"
          });
        }
        return {
          document: { contract: "aralearn.course.v1", courses: [documents.get(courseId)] }
        };
      },
      async clearCourse(courseId, options) { cleared.push([courseId, options]); },
      async hasOfflineCourse(courseId) { return courseId === COURSE_B; }
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("não usado"); }
    },
    cache: cache(),
    clock: () => "2026-08-17T12:00:00.000Z"
  });
  await repository.initialize();
  await repository.saveStudyNavigation({
    selectedCourseId: COURSE_A,
    position: {
      view: "course",
      entityPath: [COURSE_A, "module-a", "lesson-a", "micro-a", "unit-a"],
      microsequenceMode: "play"
    }
  });
  await repository.saveStudyNavigation({
    selectedCourseId: COURSE_B,
    position: {
      view: "microsequence",
      entityPath: [COURSE_B, "module-b", "lesson-b", "micro-b", "unit-b"],
      microsequenceMode: "play"
    }
  });
  assert.equal(await repository.refreshCourseOfflineAvailability(COURSE_B), true);
  assert.equal(repository.loadCourseSummaries()[1].availableOffline, true);

  revokeCourseB = true;
  await assert.rejects(() => repository.loadCourse(COURSE_B), /Acesso revogado/u);
  assert.deepEqual(repository.loadCourseSummaries().map(({ courseId }) => courseId), [COURSE_A]);
  assert.deepEqual(cleared, [[COURSE_B, { clearLists: true }]]);
  assert.deepEqual(repository.loadStudyNavigation(), {
    contract: "aralearn.course-study-navigation.v1",
    selectedCourseId: COURSE_A,
    positions: {
      [COURSE_A]: {
        view: "course",
        entityPath: [COURSE_A, "module-a", "lesson-a", "micro-a", "unit-a"],
        microsequenceMode: "play",
        updatedAt: "2026-08-17T12:00:00.000Z"
      }
    },
    updatedAt: "2026-08-17T12:00:00.000Z"
  });

  assert.equal(await repository.clearStudyNavigationPosition(COURSE_A), true);
  assert.deepEqual(repository.loadStudyNavigation(), {
    contract: "aralearn.course-study-navigation.v1",
    selectedCourseId: COURSE_A,
    positions: {},
    updatedAt: "2026-08-17T12:00:00.000Z"
  });
  assert.equal(await repository.clearStudyNavigationPosition(COURSE_A), false);
});

test("refresh online apaga cache e navegação de Curso que deixou de ser acessível", async () => {
  const cleared = [];
  let accessibleCourseIds = [COURSE_A, COURSE_B];
  const store = cache();
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: accessibleCourseIds.map((courseId, index) => ({
            courseId,
            title: `Curso ${index + 1}`,
            goal: "Aprender.",
            revision: 1,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          })),
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse() { throw new Error("não usado"); },
      async clearCourse(courseId) { cleared.push(courseId); },
      async hasOfflineCourse(courseId) { return courseId === COURSE_B; }
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("não usado"); }
    },
    cache: store,
    clock: () => "2026-08-17T12:00:00.000Z"
  });
  await repository.initialize();
  await repository.saveStudyNavigation({
    selectedCourseId: COURSE_B,
    position: {
      view: "microsequence",
      entityPath: [COURSE_B, "module-b", "lesson-b", "micro-b", "unit-b"],
      microsequenceMode: "play"
    }
  });
  assert.equal(await repository.refreshCourseOfflineAvailability(COURSE_B), true);

  accessibleCourseIds = [COURSE_A];
  await repository.refreshCourses();

  assert.deepEqual(cleared, [COURSE_B]);
  assert.deepEqual(repository.loadCourseSummaries().map(({ courseId }) => courseId), [COURSE_A]);
  assert.deepEqual(repository.loadStudyNavigation(), {
    contract: "aralearn.course-study-navigation.v1",
    selectedCourseId: COURSE_A,
    positions: {},
    updatedAt: "2026-08-17T12:00:00.000Z"
  });
});

test("consulta disponibilidade offline somente para o Curso selecionado e sua revisão", async () => {
  const offlineRevisions = new Map([[COURSE_A, 7]]);
  let courseARevision = 7;
  const checks = [];
  const repository = new CourseStudyRepository({
    bridge: {
      async listAccessibleCourses() {
        return {
          items: [{
            courseId: COURSE_A,
            title: "Curso A",
            goal: "Aprender A.",
            revision: courseARevision,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }, {
            courseId: COURSE_B,
            title: "Curso B",
            goal: "Aprender B.",
            revision: 9,
            studyUnitCount: 1,
            completedStudyUnitCount: 0
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async loadCourse() { throw new Error("não usado"); },
      async clearCourse() {},
      async hasOfflineCourse(courseId, options) {
        checks.push([courseId, structuredClone(options)]);
        return offlineRevisions.get(courseId) === options.revision;
      }
    },
    api: {
      async listCourseReviewItems() {
        return { items: [], hasMore: false, nextCursor: null };
      },
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new Error("não usado"); }
    },
    cache: cache()
  });

  await repository.initialize();
  assert.deepEqual(checks, [[COURSE_A, { revision: 7 }]]);
  assert.deepEqual(repository.loadCourseSummaries().map((item) => item.availableOffline), [
    true,
    false
  ]);

  assert.equal(await repository.refreshCourseOfflineAvailability(COURSE_B), false);
  offlineRevisions.set(COURSE_B, 9);
  assert.equal(await repository.refreshCourseOfflineAvailability(COURSE_B), true);
  assert.deepEqual(checks.slice(1), [
    [COURSE_B, { revision: 9 }],
    [COURSE_B, { revision: 9 }]
  ]);
  assert.equal(repository.loadCourseSummaries()[1].availableOffline, true);

  courseARevision = 8;
  await repository.refreshCourses();
  assert.equal(repository.loadCourseSummaries()[0].availableOffline, false);
  assert.deepEqual(checks.at(-1), [COURSE_A, { revision: 8 }]);

  offlineRevisions.set(COURSE_A, 8);
  await repository.refreshCourses();
  assert.equal(repository.loadCourseSummaries()[0].availableOffline, true);
  assert.deepEqual(checks.at(-1), [COURSE_A, { revision: 8 }]);
});
