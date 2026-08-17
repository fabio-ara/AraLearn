import test from "node:test";
import assert from "node:assert/strict";

import {
  CoursePersonalStateRepository,
  COURSE_PERSONAL_STATE_CACHE_CONTRACT,
  validateCoursePersonalState
} from "../../src/persistence/CoursePersonalStateRepository.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "20000000-0000-4000-8000-000000000002";

function course() {
  return {
    id: COURSE_ID,
    title: "Curso",
    modules: [{
      id: "module-a",
      title: "Módulo",
      lessons: [{
        id: "lesson-a",
        title: "Lição",
        microsequences: [{
          id: "micro-a",
          studyUnits: [
            { id: "unit-a", title: "Unidade A" },
            { id: "unit-b", title: "Unidade B" }
          ]
        }]
      }]
    }]
  };
}

function reference(unitId = "unit-a") {
  return {
    courseId: COURSE_ID,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: unitId
  };
}

function memoryCache() {
  const values = new Map();
  return {
    values,
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

function remote() {
  let revision = 0;
  let state = null;
  const calls = [];
  return {
    calls,
    async loadPersonalState(courseId) {
      assert.equal(courseId, COURSE_ID);
      return state == null ? null : {
        contract: "aralearn.course-personal-state.v1",
        courseId,
        revision,
        state: structuredClone(state),
        updatedAt: "2026-08-17T12:00:00.000Z"
      };
    },
    async mutatePersonalState(input) {
      calls.push(structuredClone(input));
      assert.equal(input.courseId, COURSE_ID);
      assert.equal(input.expectedRevision, revision);
      revision += 1;
      state ??= {
        version: 1,
        progress: { version: 3, lessons: {} },
        reviewMarks: {},
        observations: {}
      };
      for (const operation of input.operations) {
        const target = operation.collection === "progress.lessons"
          ? state.progress.lessons : state[operation.collection];
        if (operation.kind === "delete") delete target[operation.path];
        else target[operation.path] = structuredClone(operation.value);
      }
      return {
        courseId: COURSE_ID,
        revision,
        updatedAt: "2026-08-17T12:00:00.000Z",
        idempotent: false
      };
    }
  };
}

test("aplica o orçamento canônico de 512 KiB ao estado pessoal", () => {
  const observations = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [
    `unit-${index}`,
    {
      category: "observation",
      body: `Observação ${index} ${"x".repeat(900)}`,
      updatedAt: "2026-08-17T12:00:00.000Z"
    }
  ]));
  assert.throws(() => validateCoursePersonalState({
    version: 1,
    progress: { version: 3, lessons: {} },
    reviewMarks: {},
    observations
  }), /excede 512 KiB/u);
});

test("persiste progresso e observação pela identidade direta do Curso", async () => {
  const api = remote();
  const cache = memoryCache();
  const repository = new CoursePersonalStateRepository({
    courseId: COURSE_ID,
    api,
    cache,
    course: course(),
    clock: () => "2026-08-17T12:00:00.000Z",
    uuidFactory: () => REQUEST_ID
  });
  await repository.initialize();

  await repository.setStudyUnitCompleted(reference(), true);
  await repository.saveCommentForPath(reference(), {
    category: "possible_error",
    body: "  Verificar esta afirmação.  "
  });

  assert.equal(repository.isStudyUnitCompleted(reference()), true);
  const observation = repository.loadCommentForPath(reference());
  assert.equal(observation.body, "Verificar esta afirmação.");
  assert.deepEqual(Object.keys(observation).sort(), ["body", "category", "updatedAt"]);
  assert.throws(() => validateCoursePersonalState({
    version: 1,
    progress: { version: 3, lessons: {} },
    reviewMarks: {},
    observations: {
      "unit-a": { ...observation, status: "open" }
    }
  }), /status não pertence ao contrato/u);
  assert.equal(api.calls.every((call) => call.courseId === COURSE_ID), true);
  assert.equal(JSON.stringify(api.calls).includes("trail"), false);
  assert.equal(JSON.stringify(api.calls).includes("workspace"), false);
  assert.equal([...cache.values.keys()].every((key) =>
    key.startsWith(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_ID}`)), true);
});

test("mantém uma mutação offline pendente com requestId e corpo imutáveis", async () => {
  const cache = memoryCache();
  const calls = [];
  let offline = true;
  const api = {
    async loadPersonalState() { return null; },
    async mutatePersonalState(input) {
      calls.push(structuredClone(input));
      if (offline) {
        const error = new Error("offline");
        error.code = "network_error";
        error.status = 0;
        throw error;
      }
      return {
        courseId: COURSE_ID,
        revision: 1,
        updatedAt: "2026-08-17T12:00:00.000Z",
        idempotent: false
      };
    }
  };
  const repository = new CoursePersonalStateRepository({
    courseId: COURSE_ID,
    api,
    cache,
    course: course(),
    clock: () => "2026-08-17T12:00:00.000Z",
    uuidFactory: () => REQUEST_ID
  });
  await repository.initialize();
  const pending = await repository.setStudyUnitReviewMark(reference(), true);
  assert.equal(pending.pending, true);

  offline = false;
  await repository.flush();
  assert.equal(repository.snapshot().pending, false);
  assert.deepEqual(calls[0], calls[1]);
});

test("uma segunda edição não altera o corpo associado ao requestId já tentado", async () => {
  const cache = memoryCache();
  const calls = [];
  const generatedRequestIds = [
    "20000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000003"
  ];
  const requestIds = [...generatedRequestIds];
  let online = false;
  let revision = 0;
  const api = {
    async loadPersonalState() { return null; },
    async mutatePersonalState(input) {
      calls.push(structuredClone(input));
      if (!online) {
        const error = new Error("offline");
        error.code = "network_error";
        error.status = 0;
        throw error;
      }
      revision += 1;
      return {
        courseId: COURSE_ID,
        revision,
        updatedAt: "2026-08-17T12:00:00.000Z",
        idempotent: false
      };
    }
  };
  const repository = new CoursePersonalStateRepository({
    courseId: COURSE_ID,
    api,
    cache,
    course: course(),
    clock: () => "2026-08-17T12:00:00.000Z",
    uuidFactory: () => requestIds.shift()
  });
  await repository.initialize();
  await repository.setStudyUnitReviewMark(reference("unit-a"), true);
  const firstAttempt = structuredClone(calls[0]);
  await repository.setStudyUnitReviewMark(reference("unit-b"), true);
  assert.deepEqual(calls[1], firstAttempt);

  online = true;
  await repository.flush();
  assert.deepEqual(calls[2], firstAttempt);
  assert.notEqual(calls[3].requestId, firstAttempt.requestId);
  assert.equal(calls[3].expectedRevision, 1);
});

test("rebasa uma alteração offline sobre o estado confirmado por outro dispositivo", async () => {
  const cache = memoryCache();
  const calls = [];
  const remoteState = {
    version: 1,
    progress: { version: 3, lessons: {} },
    reviewMarks: { "unit-b": "2026-08-17T12:01:00.000Z" },
    observations: {}
  };
  let revision = 1;
  let firstMutation = true;
  const generatedRequestIds = [
    "20000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000003"
  ];
  const requestIds = [...generatedRequestIds];
  const api = {
    async loadPersonalState() {
      return {
        contract: "aralearn.course-personal-state.v1",
        courseId: COURSE_ID,
        revision,
        state: structuredClone(remoteState),
        updatedAt: "2026-08-17T12:01:00.000Z"
      };
    },
    async mutatePersonalState(input) {
      calls.push(structuredClone(input));
      if (firstMutation) {
        firstMutation = false;
        const error = new Error("stale");
        error.code = "40001";
        throw error;
      }
      assert.equal(input.expectedRevision, 1);
      assert.equal(input.requestId, generatedRequestIds[1]);
      for (const operation of input.operations) {
        const target = operation.collection === "progress.lessons"
          ? remoteState.progress.lessons : remoteState[operation.collection];
        if (operation.kind === "delete") delete target[operation.path];
        else target[operation.path] = structuredClone(operation.value);
      }
      revision += 1;
      return {
        courseId: COURSE_ID,
        revision,
        updatedAt: "2026-08-17T12:02:00.000Z",
        idempotent: false
      };
    }
  };
  let offline = true;
  const repository = new CoursePersonalStateRepository({
    courseId: COURSE_ID,
    api: {
      ...api,
      async mutatePersonalState(input) {
        if (offline) {
          const error = new Error("offline");
          error.code = "network_error";
          error.status = 0;
          throw error;
        }
        return api.mutatePersonalState(input);
      }
    },
    cache,
    course: course(),
    clock: () => "2026-08-17T12:02:00.000Z",
    uuidFactory: () => requestIds.shift()
  });
  await repository.initialize({ refresh: false });
  await repository.setStudyUnitReviewMark(reference("unit-a"), true);

  offline = false;
  await repository.flush();

  assert.equal(repository.snapshot().pending, false);
  assert.equal(repository.snapshot().revision, 2);
  assert.deepEqual(Object.keys(repository.loadCanonicalState().reviewMarks).sort(), [
    "unit-a",
    "unit-b"
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].expectedRevision, 0);
  assert.equal(calls[1].expectedRevision, 1);
  assert.notEqual(calls[0].requestId, calls[1].requestId);
});

test("PT404 apaga estado pessoal, Curso e listas locais", async () => {
  const cache = memoryCache();
  await cache.putCache(`course.v1.header:${COURSE_ID}`, { cached: true });
  await cache.putCache(`course.v1.entities:${COURSE_ID}:first`, { cached: true });
  await cache.putCache("course.v1.list:first", { cached: true });
  const api = {
    async loadPersonalState() {
      const error = new Error("inacessível");
      error.status = 400;
      error.code = "PT404";
      throw error;
    },
    async mutatePersonalState() { throw new Error("não usado"); }
  };
  const repository = new CoursePersonalStateRepository({ courseId: COURSE_ID, api, cache });

  await assert.rejects(() => repository.initialize(), /inacessível/u);
  assert.equal(cache.values.size, 0);
});

test("não mascara erro de programação como indisponibilidade de rede", async () => {
  const repository = new CoursePersonalStateRepository({
    courseId: COURSE_ID,
    api: {
      async loadPersonalState() { return null; },
      async mutatePersonalState() { throw new TypeError("contrato quebrado"); }
    },
    cache: memoryCache(),
    course: course(),
    uuidFactory: () => REQUEST_ID
  });
  await repository.initialize();
  await assert.rejects(
    () => repository.setStudyUnitReviewMark(reference(), true),
    /contrato quebrado/u
  );
});

test("projeta progresso não contíguo e preserva estado órfão após edição do Curso", async () => {
  const state = {
    version: 1,
    progress: {
      version: 3,
      lessons: {
        "lesson-a": {
          cursorStudyUnitId: "unit-removed",
          completedStudyUnitIds: ["unit-b", "unit-removed"]
        }
      }
    },
    reviewMarks: { "unit-removed": "2026-08-17T12:00:00.000Z" },
    observations: {
      "unit-removed": {
        category: "possible_error",
        body: "Preservar para o histórico de revisão.",
        updatedAt: "2026-08-17T12:00:00.000Z"
      }
    }
  };
  let revision = 1;
  const api = {
    async loadPersonalState() {
      return {
        contract: "aralearn.course-personal-state.v1",
        courseId: COURSE_ID,
        revision,
        state: structuredClone(state),
        updatedAt: "2026-08-17T12:00:00.000Z"
      };
    },
    async mutatePersonalState({ expectedRevision, operations }) {
      assert.equal(expectedRevision, revision);
      for (const operation of operations) {
        const target = operation.collection === "progress.lessons"
          ? state.progress.lessons
          : state[operation.collection];
        if (operation.kind === "delete") delete target[operation.path];
        else target[operation.path] = structuredClone(operation.value);
      }
      revision += 1;
      return {
        courseId: COURSE_ID,
        revision,
        updatedAt: "2026-08-17T12:01:00.000Z",
        idempotent: false
      };
    }
  };
  const repository = new CoursePersonalStateRepository({
    courseId: COURSE_ID,
    api,
    cache: memoryCache(),
    course: course(),
    clock: () => "2026-08-17T12:01:00.000Z",
    uuidFactory: () => REQUEST_ID
  });
  await repository.initialize();

  assert.deepEqual(repository.loadProgress().lessons, {
    [`${COURSE_ID}::module-a::lesson-a`]: {
      cursorStudyUnitId: "unit-b",
      completedStudyUnitIds: ["unit-b"]
    }
  });
  assert.deepEqual(repository.loadReviewItems(), []);

  await repository.clearProgressScope({
    courseId: COURSE_ID,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a"
  });
  repository.setCourse(course());
  assert.deepEqual(repository.loadProgress(), { version: 1, lessons: {} });
  assert.deepEqual(repository.loadCanonicalState().progress.lessons, {
    "lesson-a": {
      cursorStudyUnitId: "unit-removed",
      completedStudyUnitIds: ["unit-removed"]
    }
  });
  assert.equal(repository.loadCanonicalState().reviewMarks["unit-removed"],
    "2026-08-17T12:00:00.000Z");
  assert.equal(repository.loadCanonicalState().observations["unit-removed"].body,
    "Preservar para o histórico de revisão.");
  await repository.clearProgress();
  assert.deepEqual(repository.loadCanonicalState().progress.lessons, {
    "lesson-a": {
      cursorStudyUnitId: "unit-removed",
      completedStudyUnitIds: ["unit-removed"]
    }
  });
});
