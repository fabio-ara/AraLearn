import assert from "node:assert/strict";
import test from "node:test";

import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  executeTrustedCourseWrite,
  resolveHumanCourseContext
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTaskExecutor.js";

const PRINCIPAL = { actorId: "10000000-0000-4000-8000-000000000001" };
const COURSE_A = "20000000-0000-4000-8000-000000000001";
const COURSE_B = "20000000-0000-4000-8000-000000000002";
const PART_A = "30000000-0000-4000-8000-000000000001";

function courseAdapter({ courses, plan = null, units = [], sources = [] }) {
  const calls = [];
  return {
    calls,
    async listCourses(options) {
      calls.push(["listCourses", structuredClone(options)]);
      const second = options.beforeId != null;
      return second
        ? { items: courses.slice(1), hasMore: false, nextCursor: null }
        : {
            items: courses.slice(0, 1),
            hasMore: courses.length > 1,
            nextCursor: courses.length > 1
              ? { beforeUpdatedAt: "2026-09-02T12:00:00Z", beforeId: courses[0].courseId }
              : null
          };
    },
    async getCourse(options) {
      calls.push(["getCourse", structuredClone(options)]);
      const listed = courses.find(({ courseId }) => courseId === options.courseId);
      return {
        courseId: options.courseId,
        title: listed.title,
        revision: 7,
        deepLink: `#/authoring/courses/${options.courseId}?section=content`
      };
    },
    async getCourseInstructionalPlan(options) {
      calls.push(["getCourseInstructionalPlan", structuredClone(options)]);
      return structuredClone(plan);
    },
    async listCourseStudyUnits(options) {
      calls.push(["listCourseStudyUnits", structuredClone(options)]);
      const start = options.cursorStudyUnitId == null
        ? 0
        : units.findIndex(({ studyUnit }) => studyUnit.id === options.cursorStudyUnitId) + 1;
      const items = units.slice(start, start + 2);
      const hasMore = start + items.length < units.length;
      return {
        items,
        hasMore,
        nextCursor: hasMore ? { studyUnitId: items.at(-1).studyUnit.id } : null
      };
    },
    async getCourseSources(options) {
      calls.push(["getCourseSources", structuredClone(options)]);
      return {
        items: sources,
        nextCursor: null
      };
    }
  };
}

test("#272 resolve Curso por título humano normalizado e pagina sem aceitar ID público", async () => {
  const adapter = courseAdapter({
    courses: [
      { courseId: COURSE_B, title: "Outro Curso" },
      { courseId: COURSE_A, title: "Cálculo Básico" }
    ]
  });
  const context = await resolveHumanCourseContext({
    adapter,
    principal: PRINCIPAL,
    course: "calculo basico"
  });
  assert.deepEqual(context.course, {
    id: COURSE_A,
    title: "Cálculo Básico",
    revision: 7,
    deepLink: `#/authoring/courses/${COURSE_A}?section=content`
  });
  assert.equal(adapter.calls.filter(([name]) => name === "listCourses").length, 2);
  assert.deepEqual(adapter.calls.find(([name]) => name === "getCourse")[1], {
    principal: PRINCIPAL,
    courseId: COURSE_A,
    includeOutline: false,
    deadlineAt: null
  });
  await assert.rejects(() => resolveHumanCourseContext({
    adapter,
    principal: PRINCIPAL,
    course: COURSE_A
  }), (error) => error.code === "human_reference_not_found");
});

test("#272 recusa Curso ou Parte ambíguos sem escolher uma identidade por acaso", async () => {
  const duplicatedCourses = courseAdapter({
    courses: [
      { courseId: COURSE_A, title: "Redes" },
      { courseId: COURSE_B, title: "Rêdes" }
    ]
  });
  await assert.rejects(() => resolveHumanCourseContext({
    adapter: duplicatedCourses,
    principal: PRINCIPAL,
    course: "redes"
  }), (error) => error.status === 409 && error.code === "ambiguous_human_reference" &&
    error.details?.matchingCount === 2);

  const duplicatedParts = courseAdapter({
    courses: [{ courseId: COURSE_A, title: "Curso" }],
    plan: {
      courseRevision: 8,
      plan: {
        version: 2,
        title: "Curso",
        parts: [{ id: PART_A, position: 0, title: "Fundamentos", version: 1 }, {
          id: "30000000-0000-4000-8000-000000000002",
          position: 1,
          title: "Fúndamentos",
          version: 1
        }]
      }
    }
  });
  await assert.rejects(() => resolveHumanCourseContext({
    adapter: duplicatedParts,
    principal: PRINCIPAL,
    course: "Curso",
    part: "fundamentos"
  }), (error) => error.code === "ambiguous_human_reference");
});

test("#272 resolve Parte, Microssequência, Units e Fonte por posição ou título", async () => {
  const units = [{
    ordinal: 1,
    studyUnit: { id: "unit-dns", title: "Definição de DNS" },
    version: 2
  }, {
    ordinal: 2,
    studyUnit: { id: "unit-old", title: "Caso antigo" },
    version: 3
  }, {
    ordinal: 3,
    studyUnit: { id: "unit-practice", title: "Prática de DNS" },
    version: 1
  }];
  const adapter = courseAdapter({
    courses: [{ courseId: COURSE_A, title: "Redes" }],
    plan: {
      courseRevision: 8,
      plan: {
        version: 4,
        title: "Redes",
        parts: [{
          id: PART_A,
          position: 0,
          title: "Fundamentos",
          version: 2,
          microsequences: [{ id: "micro-dns", productionPosition: 0, title: "DNS" }, {
            id: "micro-dhcp", productionPosition: 1, title: "DHCP"
          }]
        }]
      }
    },
    units,
    sources: [{
      sourceId: "source-rfc-1035",
      revision: 1,
      title: "Domain names — implementation and specification",
      citationText: "RFC 1035"
    }]
  });
  const context = await resolveHumanCourseContext({
    adapter,
    principal: PRINCIPAL,
    course: "Redes",
    part: 1,
    microsequence: "dhcp",
    studyUnits: [1, "Caso antigo"],
    source: "rfc 1035"
  });
  assert.equal(context.course.revision, 8);
  assert.equal(context.part.id, PART_A);
  assert.equal(context.microsequence.id, "micro-dhcp");
  assert.deepEqual(context.studyUnits.map(({ studyUnit }) => studyUnit.id), [
    "unit-dns", "unit-old"
  ]);
  assert.equal(context.source.sourceId, "source-rfc-1035");
  const unitCall = adapter.calls.find(([name]) => name === "listCourseStudyUnits")[1];
  assert.equal(unitCall.courseId, COURSE_A);
  assert.equal(unitCall.expectedRevision, 8);
  assert.equal(unitCall.scopeKind, "didactic_microsequence");
  assert.equal(unitCall.scopeId, "micro-dhcp");
  assert.equal(Object.hasOwn(unitCall, "requestId"), false);
  const sourceCall = adapter.calls.find(([name]) => name === "getCourseSources")[1];
  assert.equal(sourceCall.limit, 24);

  await assert.rejects(() => resolveHumanCourseContext({
    adapter,
    principal: PRINCIPAL,
    course: "Redes",
    part: 1,
    studyUnits: [1, "Definição de DNS"]
  }), (error) => error.code === "duplicate_human_reference");
  await assert.rejects(() => resolveHumanCourseContext({
    adapter,
    principal: PRINCIPAL,
    course: "Redes",
    source: "Fonte inexistente"
  }), (error) => error.code === "human_reference_not_found");
  await assert.rejects(() => resolveHumanCourseContext({
    adapter,
    principal: PRINCIPAL,
    course: "Redes",
    source: "source-rfc-1035"
  }), (error) => error.code === "human_reference_not_found");
});

test("#272 escrita confiável injeta fences/requestId e repete exatamente a falha ambígua", async () => {
  let loads = 0;
  let requestIds = 0;
  const commits = [];
  const result = await executeTrustedCourseWrite({
    async load() {
      loads += 1;
      return { courseRevision: 7, planVersion: 3 };
    },
    async build(state, { newId }) {
      return {
        expectedCourseRevision: state.courseRevision,
        expectedPlanVersion: state.planVersion,
        command: {
          type: "add_part",
          id: await newId("part"),
          title: "Parte humana"
        }
      };
    },
    async commit(request) {
      commits.push(structuredClone(request));
      if (commits.length === 1) {
        const error = new TypeError("Failed to fetch");
        error.code = "NETWORK_ERROR";
        throw error;
      }
      return { changed: true, requestId: request.requestId };
    },
    requestIdFactory() {
      requestIds += 1;
      return "request-human-write-0001";
    }
  });
  assert.equal(result.changed, true);
  assert.equal(loads, 1);
  assert.equal(requestIds, 1);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[1], commits[0]);
  assert.equal(commits[0].expectedCourseRevision, 7);
  assert.equal(commits[0].expectedPlanVersion, 3);
  assert.equal(commits[0].requestId, "request-human-write-0001");
  assert.match(commits[0].command.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
});

test("#272 CAS relê e reconstrói; autorização e validação nunca entram em retry", async () => {
  let loads = 0;
  let ids = 0;
  const commits = [];
  const result = await executeTrustedCourseWrite({
    async load() {
      loads += 1;
      return { revision: loads === 1 ? 7 : 8 };
    },
    async build(state, { newId }) {
      return {
        expectedRevision: state.revision,
        entityId: await newId("study-unit"),
        value: "intenção preservada"
      };
    },
    async commit(request) {
      commits.push(structuredClone(request));
      if (commits.length === 1) {
        throw new AuthoringApiError(409, "stale_course_state", "O Curso mudou.");
      }
      return { expectedRevision: request.expectedRevision, requestId: request.requestId };
    },
    requestIdFactory() {
      ids += 1;
      return `request-cas-retry-000${ids}`;
    }
  });
  assert.equal(loads, 2);
  assert.equal(ids, 2);
  assert.deepEqual(commits.map(({ expectedRevision, requestId }) => ({
    expectedRevision,
    requestId
  })), [{
    expectedRevision: 7,
    requestId: "request-cas-retry-0001"
  }, {
    expectedRevision: 8,
    requestId: "request-cas-retry-0002"
  }]);
  assert.equal(result.expectedRevision, 8);
  assert.notEqual(commits[0].entityId, commits[1].entityId);

  for (const [status, code] of [[403, "insufficient_scope"], [422, "invalid_human_task"]]) {
    let attempts = 0;
    await assert.rejects(() => executeTrustedCourseWrite({
      async load() { return { revision: 9 }; },
      async build() { return { expectedRevision: 9 }; },
      async commit() {
        attempts += 1;
        throw new AuthoringApiError(status, code, "Falha definitiva.");
      },
      requestIdFactory: () => `request-no-retry-${status}`
    }), (error) => error.status === status && error.code === code);
    assert.equal(attempts, 1);
  }
});

test("#272 camada confiável rejeita requestId vindo do caso de uso ou fábrica inválida", async () => {
  await assert.rejects(() => executeTrustedCourseWrite({
    load: async () => ({}),
    build: async () => ({ requestId: "caller-controlled" }),
    commit: async () => ({}),
    requestIdFactory: () => "request-internal-0001"
  }), /sem requestId/iu);
  await assert.rejects(() => executeTrustedCourseWrite({
    load: async () => ({}),
    build: async () => ({}),
    commit: async () => ({}),
    requestIdFactory: () => "curto"
  }), /requestId inválido/iu);
});

test("#272 erro local sem sinal de transporte não é repetido como falha ambígua", async () => {
  let attempts = 0;
  await assert.rejects(() => executeTrustedCourseWrite({
    load: async () => ({}),
    build: async () => ({}),
    commit: async () => {
      attempts += 1;
      throw new Error("Falha de programação local.");
    },
    requestIdFactory: () => "request-local-error-0001"
  }), /Falha de programação local/u);
  assert.equal(attempts, 1);
});
