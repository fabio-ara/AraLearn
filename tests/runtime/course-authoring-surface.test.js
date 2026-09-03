import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createCourseAuthoringSurface,
  renderCourseAuthoringSurface
} from "../../src/ui/CourseAuthoringSurface.js";
import { buildCourseAuthoringRoute } from "../../src/ui/courseAuthoringRoute.js";
import { normalizeCourseListPage } from "../../src/ui/courseAuthoringViewModel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_COURSE_ID = "20000000-0000-4000-8000-000000000002";
const PART_ID = "30000000-0000-4000-8000-000000000003";
const SECOND_PART_ID = "40000000-0000-4000-8000-000000000004";
const OUTCOME_ID = "50000000-0000-4000-8000-000000000005";
const ANALYSIS_ID = "60000000-0000-4000-8000-000000000006";
const EVIDENCE_ID = "70000000-0000-4000-8000-000000000007";
const FOUNDATIONS_SCOPE_ID = "80000000-0000-4000-8000-000000000008";
const TRANSFER_SCOPE_ID = "90000000-0000-4000-8000-000000000009";
const PLAN_ID = "a0000000-0000-4000-8000-00000000000a";

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  contains() {
    return true;
  }

  querySelector() {
    return null;
  }
}

class TrackingRoot extends FakeRoot {
  constructor() {
    super();
    this.renderWrites = [];
    this.renderedHtml = this.innerHTML;
    Object.defineProperty(this, "innerHTML", {
      configurable: true,
      get: () => this.renderedHtml,
      set: (value) => {
        this.renderedHtml = String(value);
        this.renderWrites.push(this.renderedHtml);
      }
    });
  }
}



class FakeWindow {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }
}

function deferredValue() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function courseDetailFixture(overrides = {}) {
  return {
    courseId: COURSE_ID,
    title: "Fundamentos",
    goal: "Compreender relações essenciais.",
    revision: 5,
    ownership: "owned",
    canEdit: true,
    ...overrides
  };
}

function authoringHeader(html) {
  return String(html).match(
    /<header class="course-authoring-course-header">[\s\S]*?<\/header>/u
  )?.[0] || "";
}

function assertAccessibleSyncIndicator(html, labelPattern) {
  const header = authoringHeader(html);
  assert.ok(header, "O cabeçalho do Curso deve permanecer renderizado.");
  const control = header.match(
    /<(?:button|span)\b[^>]*aria-label="([^"]*(?:sincron|conex|nuvem)[^"]*)"[^>]*>[\s\S]*?<svg\b[\s\S]*?<\/(?:button|span)>/iu
  );
  assert.ok(control, "O cabeçalho deve nomear o indicador iconográfico de sincronização.");
  assert.match(control[1], labelPattern);
}

function outlineFixture(courseId = COURSE_ID) {
  return {
    contract: "aralearn.course.v1",
    courseId,
    title: "Fundamentos",
    goal: "Compreender relações essenciais.",
    revision: 5,
    ownership: "owned",
    canEdit: true,
    counts: {
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 0,
      microsequenceCount: 1,
      studyUnitCount: 1
    },
    createdAt: "2026-08-17T09:00:00Z",
    updatedAt: "2026-08-17T10:00:00Z",
    outline: {
      courseId,
      title: "Fundamentos",
      goal: "Compreender relações essenciais.",
      modules: [{
        id: "module-a",
        title: "Base",
        lessons: [{
          id: "lesson-a",
          title: "Relações",
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Primeiro caso",
            studyUnitCount: 1
          }]
        }]
      }]
    },
    deepLink: `#/authoring/courses/${courseId}?section=content`
  };
}

function listPage(overrides = {}) {
  return {
    contract: "aralearn.course-list.v1",
    items: [{
      courseId: COURSE_ID,
      title: "Fundamentos",
      goal: "Compreender relações essenciais.",
      revision: 5,
      ownership: "owned",
      canEdit: true,
      moduleCount: 1,
      lessonCount: 2,
      topicCount: 0,
      microsequenceCount: 3,
      studyUnitCount: 4
    }, {
      courseId: SECOND_COURSE_ID,
      title: "Aplicações",
      revision: 2,
      ownership: "owned",
      canEdit: true,
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 0,
      microsequenceCount: 1,
      studyUnitCount: 1
    }],
    hasMore: false,
    nextCursor: null,
    ...overrides
  };
}

function curriculumFixture() {
  return {
    modules: [{
      id: "module-a",
      position: 0,
      title: "Base",
      lessons: [{
        id: "lesson-a",
        position: 0,
        title: "Relações",
        microsequences: [{
          id: "micro-a",
          position: 0,
          title: "Primeiro caso",
          goal: "Explicar a primeira relação.",
          role: "explain"
        }, {
          id: "micro-b",
          position: 1,
          title: "Segundo caso",
          goal: "Praticar a relação em outro caso.",
          role: "practice"
        }]
      }]
    }, {
      id: "module-b",
      position: 1,
      title: "Aplicações",
      lessons: [{
        id: "lesson-b",
        position: 0,
        title: "Casos de transferência",
        microsequences: [{
          id: "micro-c",
          position: 0,
          title: "Aplicação em novos contextos",
          goal: "Comparar relações em situações novas.",
          role: "practice"
        }]
      }, {
        id: "lesson-c",
        position: 1,
        title: "Evolução e limites",
        microsequences: [{
          id: "micro-d",
          position: 0,
          title: "Quando uma relação deixa de valer",
          goal: "Reconhecer quando uma associação precisa ser revista.",
          role: "explain"
        }]
      }]
    }]
  };
}

function curriculumScopeFixture({ foundationsState = "planned" } = {}) {
  return [{
    id: FOUNDATIONS_SCOPE_ID,
    position: 0,
    statement: "Compreender relações fundamentais e seu uso imediato.",
    state: foundationsState,
    curriculumTargets: [{
      moduleId: "module-a",
      lessonId: "lesson-a",
      didacticMicrosequenceIds: ["micro-a", "micro-b"]
    }]
  }, {
    id: TRANSFER_SCOPE_ID,
    position: 1,
    statement: "Transferir relações e reconhecer quando precisam ser revistas.",
    state: "planned",
    curriculumTargets: [{
      moduleId: "module-b",
      lessonId: "lesson-b",
      didacticMicrosequenceIds: ["micro-c"]
    }, {
      moduleId: "module-b",
      lessonId: "lesson-c",
      didacticMicrosequenceIds: ["micro-d"]
    }]
  }];
}

function authoringPlanFixture(overrides = {}) {
  return {
    contract: "aralearn.course-instructional-plan.v3",
    courseId: COURSE_ID,
    courseRevision: 5,
    plan: {
      id: PLAN_ID,
      version: 3,
      title: "Fundamentos",
      objective: "Compreender relações essenciais.",
      audience: "Pessoas iniciantes.",
      scope: "Relações fundamentais.",
      curriculum: curriculumFixture(),
      curriculumScopeItems: curriculumScopeFixture(),
      preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
      intendedLearningOutcomes: [{
        id: OUTCOME_ID,
        position: 0,
        statement: "Comparar relações essenciais.",
        version: 1
      }],
      instructionalAnalysisUnits: [{
        id: ANALYSIS_ID,
        position: 0,
        statement: "Relação entre grandezas.",
        description: "Relação entre duas grandezas que precisa ser distinguida de coincidência.",
        version: 1,
        introducedAt: {
          studyUnitId: "unit-a",
          didacticMicrosequenceId: "micro-a",
          title: "Unidade A"
        },
        usedBy: [],
        revisitedBy: []
      }],
      evidenceRequirements: [{
        id: EVIDENCE_ID,
        position: 0,
        statement: "Resolver um caso novo.",
        version: 1
      }],
      parts: [{
        id: PART_ID,
        title: "Relações iniciais",
        intent: "Materializar exemplos fundamentais.",
        version: 2,
        position: 0,
        microsequences: [{
          id: "micro-a",
          productionPosition: 0,
          title: "Primeiro caso",
          goal: "Explicar a primeira relação.",
          role: "explain",
          curriculumPath: {
            moduleId: "module-a",
            moduleTitle: "Base",
            lessonId: "lesson-a",
            lessonTitle: "Relações"
          },
          studyUnitCount: 4
        }, {
          id: "micro-b",
          productionPosition: 1,
          title: "Segundo caso",
          goal: "Praticar a relação em outro caso.",
          role: "practice",
          curriculumPath: {
            moduleId: "module-a",
            moduleTitle: "Base",
            lessonId: "lesson-a",
            lessonTitle: "Relações"
          },
          studyUnitCount: 3
        }],
        progress: {
          state: "materialized",
          microsequenceCount: 2,
          studyUnitCount: 7
        }
      }, {
        id: SECOND_PART_ID,
        title: "Aplicações",
        intent: "Transferir relações para novos contextos.",
        version: 1,
        position: 1,
        microsequences: [],
        progress: {
          state: "planned",
          microsequenceCount: 0,
          studyUnitCount: 0
        }
      }],
      counts: {
        intendedLearningOutcomeCount: 1,
        instructionalAnalysisUnitCount: 1,
        evidenceRequirementCount: 1,
        authoringPartCount: 2,
        linkedDidacticMicrosequenceCount: 2,
        studyUnitCount: 7
      },
      updatedAt: "2026-08-17T10:10:00Z"
    },
    ...overrides
  };
}

function courseDesignFixture({
  courseRevision = 5,
  scope = { kind: "course", ref: COURSE_ID, label: "Fundamentos" },
  ancestors = [],
  children = [{ kind: "module", ref: "module-a", label: "Base", position: 0 }],
  localParameter = null,
  localPolicy = null,
  targetPlanItems = null
} = {}) {
  const supportedScopes = ["course", "lesson", "didactic_microsequence", "study_unit"];
  const definitions = [{
    id: "new_analysis_unit_ceiling_per_expository_study_unit",
    label: "Novas unidades de análise por unidade expositiva",
    valueSchema: { type: "integer", minimum: 1, maximum: 8 },
    defaultValue: 2
  }, {
    id: "required_explanation_forms",
    label: "Formas exigidas de explicação",
    valueSchema: {
      type: "set",
      allowedValues: [
        "plain_definition", "concrete_example", "mechanism", "contrast",
        "application_condition", "limit_or_exception", "worked_example", "representation_link"
      ],
      minimumItems: 1,
      maximumItems: 8
    },
    defaultValue: ["plain_definition", "concrete_example", "mechanism", "contrast"]
  }, {
    id: "minimum_distinct_practice_opportunities_per_evidence_requirement",
    label: "Oportunidades distintas de prática",
    valueSchema: { type: "integer", minimum: 1, maximum: 16 },
    defaultValue: 2
  }, {
    id: "required_practice_variation_dimensions",
    label: "Dimensões exigidas de variação",
    valueSchema: {
      type: "set",
      allowedValues: [
        "case_or_data", "context", "task_feature", "external_representation", "support_level"
      ],
      minimumItems: 1,
      maximumItems: 5
    },
    defaultValue: ["case_or_data"]
  }].map((definition) => ({
    ...definition,
    construct: `Construto de ${definition.label}.`,
    operationalization: "Usa somente identidades e fatos persistidos.",
    limitations: "O registro não prova qualidade nem aprendizagem.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: ["https://doi.org/10.1111/j.1467-9280.2006.01693.x"],
    supportedScopes
  }));
  const componentOptions = Array.from({ length: 32 }, (_, index) => ({
    ref: `aralearn.resource.component_${String(index + 1).padStart(2, "0")}@1.0.0`,
    label: `Componente ${index + 1}`,
    purpose: `Finalidade acadêmica ${index + 1}.`
  }));
  const guidanceAssignment = {
    guidance: "Explique cada termo antes de depender dele.",
    origin: "author",
    reason: "Evitar pressupostos ocultos."
  };
  const currentScope = { kind: scope.kind, ref: scope.ref };
  const inherited = scope.kind !== "course";
  return {
    contract: "aralearn.course-design.v2",
    courseId: COURSE_ID,
    courseRevision,
    parameterCatalogVersion: "1.0.0",
    scopeContext: {
      current: scope,
      ancestors,
      children,
      childCount: children.length,
      hasMoreChildren: false,
      nextChildCursor: null
    },
    definitions,
    parameters: definitions.map((definition, index) => {
      const local = index === 0 && localParameter ? {
        value: structuredClone(localParameter.value),
        origin: localParameter.origin,
        reason: localParameter.reason
      } : null;
      return {
        parameterId: definition.id,
        localAssignment: local,
        effectiveAssignment: local ? {
          ...structuredClone(local),
          sourceScope: currentScope,
          inherited: false
        } : {
          value: structuredClone(definition.defaultValue),
          origin: inherited ? "author" : "system_default",
          reason: inherited ? "Decisão definida no Curso." : "Hipótese inicial do produto.",
          sourceScope: inherited ? { kind: "course", ref: COURSE_ID } : null,
          inherited
        }
      };
    }),
    guidance: {
      localAssignment: scope.kind === "course" ? guidanceAssignment : null,
      effectiveAssignments: [{
        ...guidanceAssignment,
        sourceScope: { kind: "course", ref: COURSE_ID },
        inherited
      }]
    },
    componentCatalog: { version: "1-3e5629f8", options: componentOptions },
    targetPlanItems,
    componentPolicy: {
      localAssignment: localPolicy ? {
        policy: structuredClone(localPolicy.policy),
        origin: localPolicy.origin,
        reason: localPolicy.reason
      } : null,
      effectiveAssignment: localPolicy ? {
        policy: structuredClone(localPolicy.policy),
        origin: localPolicy.origin,
        reason: localPolicy.reason,
        sourceScope: currentScope,
        inherited: false
      } : {
        policy: {
          catalogVersion: "1-3e5629f8",
          availability: "all",
          allowedRefs: [],
          excludedRefs: [],
          preferredRefs: []
        },
        origin: "system_default",
        reason: "Todos os componentes começam disponíveis.",
        sourceScope: null,
        inherited: false
      }
    }
  };
}

function controllerFixture(overrides = {}) {
  const controller = {
    async listCourses() {
      return listPage();
    },
    async getCourse(courseId) {
      return {
        courseId,
        title: "Fundamentos",
        goal: "Compreender relações essenciais.",
        revision: 5,
        ownership: "owned",
        canEdit: true
      };
    },
    async loadAuthoringOutline(courseId) {
      return outlineFixture(courseId);
    },
    async loadAuthoringStudyUnits() {
      throw new Error("A raiz falsa não monta a sequência de Inspeção.");
    },
    async loadAuthoringInspectionPosition() {
      return null;
    },
    async saveAuthoringInspectionPosition() {
      return undefined;
    },
    async listCourseAccess(courseId) {
      return {
        contract: "aralearn.course-people.v1",
        courseId,
        owner: {
          userId: "30000000-0000-4000-8000-000000000003",
          displayName: "Pessoa proprietária",
          avatarObjectKey: null
        },
        people: []
      };
    },
    async grantCourseAccess() {
      return { changed: true };
    },
    async revokeCourseAccess() {
      return { changed: true };
    },
    async createCourse() {
      return { courseId: SECOND_COURSE_ID, revision: 1 };
    },
    async loadAuthoringPlan(courseId) {
      return { ...authoringPlanFixture(), courseId };
    },
    async loadCourseDesign() {
      return courseDesignFixture();
    },
    async mutateCourseDesign() {
      return {
        contract: "aralearn.course-design-change.v2",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "93000000-0000-4000-8000-000000000039",
        idempotent: false,
        changed: false,
        change: null
      };
    },
    async clearCourse() {
      return undefined;
    }
  };
  Object.assign(controller, overrides);
  return controller;
}

test("lista abre Curso materializado diretamente no Conteúdo em um toque", async () => {
  const calls = [];
  const root = new FakeRoot();
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async listCourses(options) {
        calls.push(options);
        return listPage();
      }
    }),
    locationValue: { pathname: "/", search: "", hash: "" },
    historyValue: { state: null, replaceState() {} },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.deepEqual(calls, [{ query: "", limit: 24, cursor: null }]);
  assert.match(root.innerHTML, /<h1>Meus cursos<\/h1>/u);
  assert.match(root.innerHTML, /aria-label="Voltar ao Estudo"/u);
  assert.match(root.innerHTML, /data-cardinality="many"/u);
  assert.match(root.innerHTML, /3 microssequências · 4 unidades/u);
  assert.doesNotMatch(root.innerHTML, /Compartilhado|Somente leitura/u);
  assert.match(
    root.innerHTML,
    new RegExp(buildCourseAuthoringRoute(COURSE_ID, { section: "content" }).replace("?", "\\?"), "u")
  );
  assert.match(root.innerHTML, /<svg/u);
  assert.doesNotMatch(root.innerHTML, /<textarea|Workspace|Trilha|Coleção|publicação/iu);
});

test("lista oferece retorno visível ao Estudo", async () => {
  const root = new FakeRoot();
  let closed = 0;
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture(),
    locationValue: { pathname: "/", search: "", hash: "" },
    windowValue: new FakeWindow(),
    onClose() {
      closed += 1;
    }
  });
  await surface.open();
  const node = {
    dataset: { courseAuthoringAction: "close-surface" },
    closest() { return this; }
  };
  root.listeners.get("click")({ target: node, preventDefault() {} });
  assert.equal(closed, 1);
  assert.equal(surface.opened, false);
  assert.equal(root.innerHTML, "");
});

test("rascunho de criação na lista exige cancelamento explícito antes de sair", async () => {
  const root = new FakeRoot();
  let closed = 0;
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture(),
    locationValue: { pathname: "/", search: "", hash: "" },
    windowValue: new FakeWindow(),
    onClose() { closed += 1; }
  });
  await surface.open();
  root.listeners.get("click")({
    preventDefault() {},
    target: { closest: () => ({ dataset: { courseAuthoringAction: "open-create" } }) }
  });
  assert.equal(surface.close(), "deferred");
  assert.equal(surface.handleBack(), true);
  assert.equal(surface.opened, true);
  assert.equal(closed, 0);

  root.listeners.get("click")({
    preventDefault() {},
    target: { closest: () => ({ dataset: { courseAuthoringAction: "cancel-create" } }) }
  });
  assert.equal(surface.close(), true);
  assert.equal(surface.opened, false);
  assert.equal(closed, 1);
});

test("paginação da lista encaminha o cursor opaco e acrescenta a página seguinte", async () => {
  const cursor = {
    beforeUpdatedAt: "2026-08-17T11:00:00Z",
    beforeId: COURSE_ID
  };
  const calls = [];
  const root = new FakeRoot();
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async listCourses(options) {
        calls.push(options);
        return options.cursor ? {
          items: [{ courseId: SECOND_COURSE_ID, title: "Aplicações", revision: 2 }],
          hasMore: false,
          nextCursor: null
        } : {
          items: [{ courseId: COURSE_ID, title: "Fundamentos", revision: 5 }],
          hasMore: true,
          nextCursor: cursor
        };
      }
    }),
    locationValue: { pathname: "/", search: "", hash: "" },
    windowValue: new FakeWindow()
  });
  await surface.open();

  const node = {
    dataset: { courseAuthoringAction: "load-more-courses" },
    closest() { return this; }
  };
  root.listeners.get("click")({ target: node, preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, [
    { query: "", limit: 24, cursor: null },
    { query: "", limit: 24, cursor }
  ]);
  assert.match(root.innerHTML, /Fundamentos/u);
  assert.match(root.innerHTML, /Aplicações/u);
  assert.doesNotMatch(root.innerHTML, /data-course-authoring-action="load-more-courses"/u);
});

test("Conteúdo monta uma única sequência sem árvore paralela nem carga de outline", async () => {
  const calls = [];
  const openedPaths = [];
  const root = new FakeRoot();
  const windowValue = new FakeWindow();
  const locationValue = {
    pathname: "/",
    search: "?theme=dark",
    hash: buildCourseAuthoringRoute(COURSE_ID, { section: "content" })
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        calls.push(["course", courseId]);
        return {
          courseId,
          title: "Fundamentos",
          goal: "Compreender relações essenciais.",
          revision: 5,
          ownership: "owned",
          canEdit: true
        };
      },
      async loadAuthoringOutline(courseId) {
        calls.push(["outline", courseId]);
        throw new Error("Conteúdo não deve carregar a árvore paralela.");
      }
    }),
    locationValue,
    historyValue: { state: null, replaceState() {} },
    windowValue,
    onOpenStudyContent(value) {
      openedPaths.push(structuredClone(value));
      return true;
    }
  });

  assert.equal(await surface.open(), true);
  assert.deepEqual(calls, [["course", COURSE_ID]]);
  assert.match(root.innerHTML, /<h1 title="Fundamentos">Fundamentos<\/h1>/u);
  assert.match(root.innerHTML, /<p class="course-authoring-context-title">Conteúdo<\/p>/u);
  assert.doesNotMatch(root.innerHTML, /Inspeção do conteúdo|Leia as Unidades como elas aparecem em Estudo/u);
  assert.doesNotMatch(root.innerHTML, /course-authoring-content-hierarchy|Estrutura do Curso/u);
  assert.match(
    root.innerHTML,
    /class="course-authoring-task-menu"[\s\S]*data-target-kind="course"[\s\S]*<span>Editar Curso<\/span>/u
  );
  assert.match(root.innerHTML, /data-course-inspection-host/u);
  assert.doesNotMatch(root.innerHTML, />Estrutura<|>Inspeção</u);
  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "edit-content-entity",
            targetKind: "course"
          }
        };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(openedPaths, [{
    entityPath: [COURSE_ID],
    returnRoute: buildCourseAuthoringRoute(COURSE_ID, { section: "content" })
  }]);
  assert.equal(surface.destroy(), true);
  assert.equal(root.innerHTML, "");
  assert.equal(await surface.open(), true);
  assert.deepEqual(calls, [["course", COURSE_ID], ["course", COURSE_ID]]);
  assert.match(root.innerHTML, /<h1 title="Fundamentos">Fundamentos<\/h1>/u);
});

test("menu de tarefas fecha antes de trocar de seção", async () => {
  const root = new FakeRoot();
  const locationValue = {
    pathname: "/",
    search: "",
    hash: buildCourseAuthoringRoute(COURSE_ID)
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture(),
    locationValue,
    historyValue: { state: null, replaceState() {} },
    windowValue: new FakeWindow()
  });
  assert.equal(await surface.open(), true);

  const menu = { open: true };
  const node = {
    dataset: { courseAuthoringAction: "change-section", section: "planning" },
    getAttribute(name) {
      return name === "href"
        ? buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
        : null;
    },
    closest(selector) {
      return selector === ".course-authoring-task-menu, .course-authoring-part-tools"
        ? menu
        : null;
    }
  };
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest(selector) {
        return selector === "[data-course-authoring-action]" ? node : null;
      }
    }
  });

  assert.equal(menu.open, false);
  surface.destroy();
});

test("Planejamento mostra o mapa curricular completo antes e separado dos lotes de produção", async () => {
  let outlineReads = 0;
  let inspectionReads = 0;
  const basePlan = authoringPlanFixture();
  const plannedParts = [basePlan.plan.parts[0], {
    ...basePlan.plan.parts[1],
    title: "<img src=x onerror=alert(1)>",
    microsequences: [{
      id: "micro-c",
      productionPosition: 0,
      title: "Aplicação em novos contextos",
      goal: "Comparar relações em situações novas.",
      role: "practice",
      curriculumPath: {
        moduleId: "module-b",
        moduleTitle: "Aplicações",
        lessonId: "lesson-b",
        lessonTitle: "Casos de transferência"
      },
      studyUnitCount: 0
    }],
    progress: {
      state: "planned",
      microsequenceCount: 1,
      studyUnitCount: 0
    }
  }];
  const responseWithParts = (parts) => ({
    ...basePlan,
    plan: {
      ...basePlan.plan,
      objective: "Comparar <origem> e aplicação.",
      curriculumScopeItems: curriculumScopeFixture({
        foundationsState: parts.some((part) => part.progress.state === "materialized")
          ? "developed"
          : "planned"
      }),
      parts,
      counts: {
        ...basePlan.plan.counts,
        authoringPartCount: parts.length,
        linkedDidacticMicrosequenceCount: parts.reduce(
          (total, part) => total + part.microsequences.length,
          0
        ),
        studyUnitCount: parts.reduce(
          (total, part) => total + part.progress.studyUnitCount,
          0
        )
      }
    }
  });
  const controllerFor = (parts) => controllerFixture({
    async getCourse(courseId) {
      return {
        courseId,
        title: "Fundamentos",
        goal: "Comparar <origem> e aplicação.",
        revision: 5,
        ownership: "owned",
        canEdit: true
      };
    },
    async loadAuthoringPlan() {
      return responseWithParts(parts);
    },
    async loadAuthoringOutline() {
      outlineReads += 1;
      throw new Error("Planejamento não deve carregar a composição materializada do curso.");
    },
    async loadAuthoringStudyUnits() {
      inspectionReads += 1;
      throw new Error("Planejamento não deve carregar unidades de estudo materializadas.");
    }
  });
  const surfaceFor = (root, parts) => createCourseAuthoringSurface({
    root,
    controller: controllerFor(parts),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });
  const curriculumMapFrom = (html) => {
    const start = html.indexOf("course-authoring-curriculum-map");
    assert.ok(start >= 0, "O planejamento precisa expor o mapa curricular global.");
    const coverageStart = html.indexOf("course-authoring-scope-coverage", start);
    const lotsStart = html.indexOf("course-authoring-parts", start);
    const end = [coverageStart, lotsStart].filter((index) => index > start).sort(
      (left, right) => left - right
    )[0];
    return html.slice(start, end);
  };
  const assertCompleteCurriculumMap = (html) => {
    const curriculumMap = curriculumMapFrom(html);
    assert.match(curriculumMap, /Mapa curricular/u);
    assert.match(
      curriculumMap,
      /Base[\s\S]*Relações[\s\S]*Primeiro caso[\s\S]*Explicar a primeira relação\.[\s\S]*Segundo caso[\s\S]*Praticar a relação em outro caso\./u
    );
    assert.match(
      curriculumMap,
      /Aplicações[\s\S]*Casos de transferência[\s\S]*Aplicação em novos contextos[\s\S]*Comparar relações em situações novas\.[\s\S]*Evolução e limites[\s\S]*Quando uma relação deixa de valer[\s\S]*Reconhecer quando uma associação precisa ser revista\./u
    );
    assert.doesNotMatch(curriculumMap, /\bpartes?\b/iu);
    return curriculumMap;
  };
  const assertScopeCoverage = (html, { foundationsState }) => {
    const mapStart = html.indexOf("course-authoring-curriculum-map");
    const coverageMarker = html.indexOf("course-authoring-scope-coverage", mapStart);
    const coverageStart = html.lastIndexOf("<details", coverageMarker);
    const lotsStart = html.indexOf("course-authoring-parts", coverageStart);
    assert.ok(coverageStart > mapStart, "A cobertura humana deve complementar o mapa curricular.");
    if (lotsStart >= 0) {
      assert.ok(coverageStart < lotsStart, "A cobertura do escopo deve vir antes dos lotes.");
    }
    const coverage = html.slice(coverageStart, lotsStart > coverageStart ? lotsStart : undefined);
    assert.match(
      coverage,
      /<details[^>]*class="[^"]*course-authoring-scope-coverage[^"]*"[\s\S]*?<summary[^>]*>[\s\S]*?Cobertura do escopo[\s\S]*?<\/summary>/u,
      "A inspeção detalhada da cobertura deve usar divulgação progressiva."
    );
    assert.match(
      coverage,
      /Compreender relações fundamentais e seu uso imediato\.[\s\S]*Base[\s\S]*Relações[\s\S]*Primeiro caso[\s\S]*Segundo caso/u
    );
    assert.match(
      coverage,
      /Transferir relações e reconhecer quando precisam ser revistas\.[\s\S]*Aplicações[\s\S]*Casos de transferência[\s\S]*Aplicação em novos contextos[\s\S]*Evolução e limites[\s\S]*Quando uma relação deixa de valer/u
    );
    assert.match(coverage, new RegExp(foundationsState, "u"));
    assert.match(coverage, /Planejado/u);
    assert.doesNotMatch(
      coverage,
      /StudyUnits?|AnalysisUnits?|instructional|evidenceRequirements|curriculumScopeItems|curriculumTargets/u
    );
    const visibleCoverage = coverage.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ");
    for (const internalId of [FOUNDATIONS_SCOPE_ID, TRANSFER_SCOPE_ID, "module-a", "lesson-a"]) {
      assert.doesNotMatch(visibleCoverage, new RegExp(internalId, "u"));
    }
    assert.doesNotMatch(
      visibleCoverage,
      /\b\d+\s+(?:itens|módulos|lições|microssequências|unidades)\b/iu,
      "A pessoa autora deve inspecionar cobertura, não contagens internas."
    );
  };

  const mapOnlyRoot = new FakeRoot();
  const mapOnlySurface = surfaceFor(mapOnlyRoot, []);
  assert.equal(await mapOnlySurface.open(), true);
  assertCompleteCurriculumMap(mapOnlyRoot.innerHTML);
  assertScopeCoverage(mapOnlyRoot.innerHTML, { foundationsState: "Planejado" });
  assert.doesNotMatch(mapOnlyRoot.innerHTML, /Desenvolvido/u);
  assert.equal(
    (mapOnlyRoot.innerHTML.match(/data-course-authoring-part-card=/gu) || []).length,
    0,
    "O mapa precisa ser inspecionável antes que exista qualquer lote de produção."
  );
  assert.doesNotMatch(mapOnlyRoot.innerHTML, /StudyUnits?|AnalysisUnits?|evidenceRequirements/u);
  mapOnlySurface.destroy();

  const root = new FakeRoot();
  const surface = surfaceFor(root, plannedParts);
  assert.equal(await surface.open(), true);
  assert.equal(outlineReads, 0);
  assert.equal(inspectionReads, 0);
  assert.match(root.innerHTML, /<h1 title="Fundamentos">Fundamentos<\/h1>/u);
  assert.match(root.innerHTML, /<p class="course-authoring-context-title">Planejamento<\/p>/u);
  assert.match(root.innerHTML, /<h3>Objetivo<\/h3>/u);
  assert.match(root.innerHTML, /Comparar &lt;origem&gt; e aplicação\./u);
  assert.doesNotMatch(root.innerHTML, /7–12|Escolha automática/u);
  assertCompleteCurriculumMap(root.innerHTML);
  assertScopeCoverage(root.innerHTML, { foundationsState: "Desenvolvido" });

  const curriculumMapStart = root.innerHTML.indexOf("course-authoring-curriculum-map");
  const productionPartsStart = root.innerHTML.indexOf("course-authoring-parts");
  assert.ok(
    productionPartsStart > curriculumMapStart,
    "O mapa curricular deve vir antes dos lotes operacionais de produção."
  );
  const productionParts = root.innerHTML.slice(productionPartsStart);
  assert.match(productionParts, /Lotes de produção/u);
  assert.match(
    productionParts,
    /divisão[\s\S]*produção[\s\S]*(?:não altera|sem mudar)[\s\S]*mapa curricular/iu,
    "A interface deve explicar que as partes organizam a produção sem virar hierarquia curricular."
  );
  assert.match(productionParts, /Relações iniciais/u);
  assert.match(productionParts, /Materializar exemplos fundamentais\./u);
  assert.match(productionParts, /&lt;img src=x onerror=alert\(1\)&gt;/u);
  assert.match(productionParts, /Transferir relações para novos contextos\./u);
  assert.doesNotMatch(
    productionParts,
    /Quando uma relação deixa de valer/u,
    "Uma microssequência pode pertencer ao mapa curricular antes de entrar em um lote."
  );
  assert.equal(
    (productionParts.match(/data-course-authoring-part-card=/gu) || []).length,
    2,
    "As partes aprovadas devem permanecer visíveis como lotes de produção separados."
  );
  assert.doesNotMatch(root.innerHTML, /Uma Parte em foco/iu);
  assert.doesNotMatch(root.innerHTML, /class="course-authoring-part-navigation"/u);
  assert.match(
    root.innerHTML,
    new RegExp(`section=planning&amp;authoringPartId=${PART_ID}`, "u")
  );
  assert.match(
    root.innerHTML,
    new RegExp(`section=planning&amp;authoringPartId=${SECOND_PART_ID}`, "u")
  );
  assert.doesNotMatch(root.innerHTML, /StudyUnits?|AnalysisUnits?|evidenceRequirements/u);
  assert.doesNotMatch(
    root.innerHTML,
    /course-authoring-(?:materialization|recent-activity)|Etapas e resultados|Fatos da etapa|resultFacts|contextHash|>MCP<|>Actions</iu
  );
  assert.doesNotMatch(root.innerHTML, /materialize-part|context-chat|Trabalhar no ChatGPT|Copiar pedido/u);
  assert.doesNotMatch(root.innerHTML, /course-authoring-part-tools|Adicionar Parte|Editar Parte/u);
  assert.doesNotMatch(root.innerHTML, /<img|authoringState|mandate|receipt|fila|já materializ/iu);
  assert.doesNotMatch(root.innerHTML, /\{[^}]*"parts"/u);
  surface.destroy();
});


test("refresh do Planejamento aplica revisão nova uma vez sem telas intermediárias", async () => {
  const root = new TrackingRoot();
  const courseRead = deferredValue();
  const planRead = deferredValue();
  let delayed = false;
  const initialPlan = authoringPlanFixture();
  const updatedObjective = "Distinguir relações essenciais em situações novas.";
  const updatedPlan = {
    ...initialPlan,
    courseRevision: 6,
    plan: {
      ...initialPlan.plan,
      version: initialPlan.plan.version + 1,
      objective: updatedObjective,
      updatedAt: "2026-08-17T11:00:00Z"
    }
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse() {
        return delayed
          ? courseRead.promise
          : courseDetailFixture();
      },
      async loadAuthoringPlan() {
        return delayed ? planRead.promise : initialPlan;
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });

  await surface.open();
  delayed = true;
  root.renderWrites.length = 0;
  const refreshing = surface.refresh();

  assert.equal(root.renderWrites.length, 0);
  assert.match(root.innerHTML, /Compreender relações essenciais\./u);
  courseRead.resolve(courseDetailFixture({
    goal: updatedObjective,
    revision: 6
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(root.renderWrites.length, 0);
  assert.match(root.innerHTML, /Compreender relações essenciais\./u);
  assert.doesNotMatch(
    root.innerHTML,
    /Planejamento indisponível|Carregando planejamento/u
  );

  planRead.resolve(updatedPlan);
  assert.equal(await refreshing, true);
  assert.equal(root.renderWrites.length, 1, "A revisão nova deve ser aplicada atomicamente.");
  assert.equal(
    root.renderWrites.some((html) =>
      /Planejamento indisponível|Carregando planejamento/u.test(html)
    ),
    false
  );
  assert.match(root.innerHTML, new RegExp(updatedObjective.replace(".", "\\."), "u"));
  assertAccessibleSyncIndicator(root.innerHTML, /sincron|nuvem/iu);
});

test("falha de refresh preserva o Planejamento e sinaliza a indisponibilidade de sincronização", async () => {
  const root = new TrackingRoot();
  const courseRead = deferredValue();
  let delayed = false;
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse() {
        return delayed ? courseRead.promise : courseDetailFixture();
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });

  await surface.open();
  delayed = true;
  root.renderWrites.length = 0;
  const refreshing = surface.refresh();
  assert.match(root.innerHTML, /Compreender relações essenciais\./u);
  assert.doesNotMatch(
    root.innerHTML,
    /Planejamento indisponível|Carregando planejamento/u
  );

  const offline = new Error("Failed to fetch");
  offline.code = "failed_to_fetch";
  courseRead.reject(offline);
  assert.equal(await refreshing, false);
  assert.match(root.innerHTML, /Compreender relações essenciais\./u);
  assert.equal(
    root.renderWrites.some((html) =>
      /Planejamento indisponível|Carregando planejamento/u.test(html)
    ),
    false
  );
  assertAccessibleSyncIndicator(root.innerHTML, /sem (?:sincronização|conexão)|offline/iu);
});

test("refresh de Parâmetros preserva Curso e desenho até aplicar o snapshot completo", async () => {
  const root = new TrackingRoot();
  const courseRead = deferredValue();
  const designRead = deferredValue();
  let delayed = false;
  let designReads = 0;
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse() {
        return delayed ? courseRead.promise : courseDetailFixture();
      },
      async loadCourseDesign() {
        designReads += 1;
        return delayed ? designRead.promise : courseDesignFixture();
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "parameters" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.match(root.innerHTML, /Hipótese inicial do produto\./u);
  delayed = true;
  root.renderWrites.length = 0;
  const refreshing = surface.refresh();

  assert.equal(root.renderWrites.length, 0);
  assert.match(root.innerHTML, /Hipótese inicial do produto\./u);
  assert.doesNotMatch(root.innerHTML, /Carregando Curso|Parâmetros indisponíveis/u);

  courseRead.resolve(courseDetailFixture({ revision: 6 }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(designReads, 2);
  assert.equal(root.renderWrites.length, 0);
  assert.match(root.innerHTML, /Hipótese inicial do produto\./u);

  designRead.resolve(courseDesignFixture({
    courseRevision: 6,
    localParameter: {
      changeId: "9",
      value: 4,
      origin: "author",
      reason: "Critério atualizado pelo autor."
    }
  }));
  assert.equal(await refreshing, true);
  assert.equal(root.renderWrites.length, 1);
  assert.match(root.innerHTML, /Critério atualizado pelo autor\./u);
  assert.doesNotMatch(root.innerHTML, /Carregando Curso|Parâmetros indisponíveis/u);
});

test("refresh de Pessoas preserva Curso e lista até aplicar o snapshot completo", async () => {
  const root = new TrackingRoot();
  const courseRead = deferredValue();
  const peopleRead = deferredValue();
  let delayed = false;
  let peopleReads = 0;
  const initialPeople = {
    contract: "aralearn.course-people.v1",
    courseId: COURSE_ID,
    owner: {
      userId: "30000000-0000-4000-8000-000000000003",
      displayName: "Pessoa proprietária",
      avatarObjectKey: null
    },
    people: []
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse() {
        return delayed ? courseRead.promise : courseDetailFixture();
      },
      async listCourseAccess() {
        peopleReads += 1;
        return delayed ? peopleRead.promise : initialPeople;
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "people" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.match(root.innerHTML, /Pessoa proprietária/u);
  delayed = true;
  root.renderWrites.length = 0;
  const refreshing = surface.refresh();

  assert.equal(root.renderWrites.length, 0);
  assert.match(root.innerHTML, /Pessoa proprietária/u);
  assert.doesNotMatch(root.innerHTML, /Carregando Curso|Pessoas indisponíveis/u);

  courseRead.resolve(courseDetailFixture({ revision: 6 }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(peopleReads, 2);
  assert.equal(root.renderWrites.length, 0);
  assert.match(root.innerHTML, /Pessoa proprietária/u);

  peopleRead.resolve({
    ...initialPeople,
    people: [{
      userId: "40000000-0000-4000-8000-000000000004",
      displayName: "Pessoa revisora",
      avatarObjectKey: null
    }]
  });
  assert.equal(await refreshing, true);
  assert.equal(root.renderWrites.length, 1);
  assert.match(root.innerHTML, /Pessoa revisora/u);
  assert.doesNotMatch(root.innerHTML, /Carregando Curso|Pessoas indisponíveis/u);
});


test("Parâmetros lê somente o escopo e separa pedagogia, direção editorial e componentes", async () => {
  const root = new FakeRoot();
  const reads = [];
  let outlineReads = 0;
  let planReads = 0;
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async loadCourseDesign(courseId, options) {
        reads.push({ courseId, options: structuredClone(options) });
        return courseDesignFixture();
      },
      async loadAuthoringOutline() {
        outlineReads += 1;
        throw new Error("Parâmetros não carrega a estrutura integral.");
      },
      async loadAuthoringPlan() {
        planReads += 1;
        throw new Error("Parâmetros não mistura a política de produção.");
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "parameters" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.deepEqual(reads, [{
    courseId: COURSE_ID,
    options: {
      scope: { kind: "course", ref: COURSE_ID },
      limit: 32,
      cursor: null
    }
  }]);
  assert.equal(outlineReads, 0);
  assert.equal(planReads, 0);
  assert.match(root.innerHTML, /<h1 title="Fundamentos">Fundamentos<\/h1>/u);
  assert.match(
    root.innerHTML,
    /<p class="course-authoring-context-title">Parâmetros<\/p>/u
  );
  assert.match(
    root.innerHTML,
    /<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">Parâmetros, direção editorial e componentes<\/h2>/u
  );
  assert.doesNotMatch(root.innerHTML, /Os valores iniciais são hipóteses operacionais/iu);
  assert.match(
    root.innerHTML,
    /<dl class="course-design-resolution"><div><dt class="course-authoring-visually-hidden">Origem e escopo<\/dt><dd>Padrão do produto · Produto<\/dd><\/div><\/dl>/u
  );
  assert.match(
    root.innerHTML,
    /<summary class="course-authoring-icon-action" aria-label="Ajustar [^"]+"[^>]*><svg/u
  );
  assert.equal((root.innerHTML.match(/class="course-design-parameter"/gu) || []).length, 4);
  assert.match(root.innerHTML, /aria-label="Editar direção editorial neste escopo"[^>]*><svg/u);
  assert.match(root.innerHTML, /aria-label="Ajustar componentes neste escopo"[^>]*><svg/u);
  assert.doesNotMatch(
    root.innerHTML,
    /<summary[^>]*>(?:Ajustar|Editar direção editorial)/u
  );
  assert.match(
    root.innerHTML,
    /<summary class="course-authoring-icon-action" aria-label="Ajustar [^"]+"[^>]*>[\s\S]*?<\/summary><p class="course-design-reason">Hipótese inicial do produto\.<\/p>/u
  );
  assert.match(root.innerHTML, /Valor vigente/u);
  assert.match(root.innerHTML, /Direção editorial/u);
  assert.doesNotMatch(root.innerHTML, /Interpretação estruturada|Revisar interpretação/u);
  assert.match(root.innerHTML, /<h3 id="course-design-guidance-title">Direção editorial<\/h3>/u);
  assert.match(root.innerHTML, /Nunca comprime nem remove conteúdo necessário/iu);
  assert.match(root.innerHTML, /distribui em mais unidades de estudo/iu);
  assert.doesNotMatch(root.innerHTML, /StudyUnits?|AnalysisUnits?/u);
  assert.match(root.innerHTML, /<h3 id="course-design-policy-title">Componentes<\/h3>/u);
  assert.doesNotMatch(root.innerHTML, /Planejado × aplicado|materialização|contextHash/iu);
  assert.equal((root.innerHTML.match(/class="course-design-component-option"/gu) || []).length, 32);
  assert.doesNotMatch(root.innerHTML, /<pre|\{\s*"/u);
});

test("Parâmetros recolhe texto migratório de bastidor sem perder orientação nem justificativa", async () => {
  const root = new FakeRoot();
  const design = courseDesignFixture();
  const imported = {
    guidance: "Fixture course-design-cutover com hash 3e5629f8c0de.",
    origin: "migration",
    reason: "Orientação preservada pelo corte #122."
  };
  design.guidance.localAssignment = structuredClone(imported);
  design.guidance.effectiveAssignments = [{
    ...structuredClone(imported),
    sourceScope: { kind: "course", ref: COURSE_ID },
    inherited: false
  }];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async loadCourseDesign() {
        return structuredClone(design);
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "parameters" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.match(root.innerHTML, /<small>Importada<\/small>/u);
  assert.doesNotMatch(root.innerHTML, /Migrada do planejamento/u);
  assert.match(
    root.innerHTML,
    /<blockquote>Fixture course-design-cutover com hash 3e5629f8c0de\.<\/blockquote><p class="course-design-reason">Orientação preservada pelo corte #122\.<\/p>/u
  );
  assert.doesNotMatch(root.innerHTML, /Ainda não há interpretação estruturada/u);
  assert.doesNotMatch(root.innerHTML, /Interpretar direção editorial/u);
  assert.match(
    root.innerHTML,
    /<textarea name="guidance"[^>]*>Fixture course-design-cutover com hash 3e5629f8c0de\.<\/textarea>/u
  );
  assert.match(
    root.innerHTML,
    /<textarea name="reason"[^>]*>Orientação preservada pelo corte #122\.<\/textarea>/u
  );
});

test("Módulo mostra herança, mas desabilita atribuição de parâmetro pedagógico", async () => {
  const root = new FakeRoot();
  const calls = [];
  const design = courseDesignFixture({
    scope: { kind: "module", ref: "module-a", label: "Base" },
    ancestors: [{ kind: "course", ref: COURSE_ID, label: "Fundamentos" }],
    children: [{ kind: "lesson", ref: "lesson-a", label: "Relações", position: 0 }]
  });
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async loadCourseDesign(courseId, options) {
        calls.push({ courseId, options: structuredClone(options) });
        return structuredClone(design);
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, {
        section: "parameters",
        moduleId: "module-a"
      })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.deepEqual(calls[0].options.scope, { kind: "module", ref: "module-a" });
  assert.match(root.innerHTML, /Módulo: Base/u);
  assert.match(root.innerHTML, /Herdado de Fundamentos · Definido pelo autor/u);
  assert.match(root.innerHTML, /não são definidos em Módulo/u);
  assert.match(root.innerHTML, /<fieldset disabled>/u);
  assert.doesNotMatch(root.innerHTML, /data-course-design-parameter/u);
  assert.match(root.innerHTML, /Decisão definida no Curso/u);
});

test("Microssequência mostra parâmetros em linguagem humana sem expor o metamodelo do plano", async () => {
  const root = new FakeRoot();
  const revision = 5;
  const scope = {
    kind: "didactic_microsequence",
    ref: "micro-a",
    label: "Primeiro caso"
  };
  const ancestors = [{ kind: "course", ref: COURSE_ID, label: "Fundamentos" }, {
    kind: "module",
    ref: "module-a",
    label: "Base"
  }, {
    kind: "lesson",
    ref: "lesson-a",
    label: "Relações"
  }];
  const design = courseDesignFixture({
    courseRevision: revision,
    scope,
    ancestors,
    children: [{ kind: "study_unit", ref: "unit-a", label: "Unidade A", position: 0 }],
    targetPlanItems: {
      instructionalAnalysisUnitIds: [ANALYSIS_ID],
      evidenceRequirementIds: []
    }
  });
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title: "Fundamentos",
          goal: "Compreender relações essenciais.",
          revision,
          ownership: "owned",
          canEdit: true
        };
      },
      async loadAuthoringPlan() {
        return { ...authoringPlanFixture(), courseRevision: revision };
      },
      async loadCourseDesign() {
        return structuredClone(design);
      },
      async mutateCourseDesign() {
        assert.fail("A cobertura do planejamento não possui segundo writer visual.");
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, {
        section: "parameters",
        didacticMicrosequenceId: "micro-a"
      })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.match(root.innerHTML, /unidades de estudo desta microssequência usam estes valores/iu);
  assert.match(root.innerHTML, /Cada unidade preserva a configuração usada na produção/iu);
  assert.match(root.innerHTML, /Abrir unidade de estudo/iu);
  assert.doesNotMatch(root.innerHTML, /StudyUnits?|AnalysisUnits?/u);
  assert.doesNotMatch(root.innerHTML, /Requisitos de evidência|Unidades de análise instrucional/u);
  assert.doesNotMatch(root.innerHTML, /data-course-design-target-items|Salvar cobertura/u);
});

test("salvar e limpar parâmetro usa CAS, origem explícita e restaura herança", async () => {
  const root = new FakeRoot();
  const calls = [];
  let revision = 5;
  let design = courseDesignFixture({
    localParameter: {
      value: 3,
      origin: "author",
      reason: "Decisão local anterior."
    }
  });
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title: "Fundamentos",
          goal: "Compreender relações essenciais.",
          revision,
          ownership: "owned",
          canEdit: true
        };
      },
      async loadCourseDesign() {
        return structuredClone(design);
      },
      async mutateCourseDesign(request) {
        calls.push(structuredClone(request));
        revision += 1;
        const parameter = design.parameters[0];
        if (request.command.type === "set_parameter") {
          const assignment = {
            value: request.command.value,
            origin: request.command.origin,
            reason: request.command.reason
          };
          parameter.localAssignment = assignment;
          parameter.effectiveAssignment = {
            ...assignment,
            sourceScope: { kind: "course", ref: COURSE_ID },
            inherited: false
          };
        } else {
          parameter.localAssignment = null;
          parameter.effectiveAssignment = {
            value: 2,
            origin: "system_default",
            reason: "Hipótese inicial do produto.",
            sourceScope: null,
            inherited: false
          };
        }
        design.courseRevision = revision;
        return {
          contract: "aralearn.course-design-change.v2",
          courseId: COURSE_ID,
          courseRevision: revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: {
            type: request.command.type,
            scope: structuredClone(request.command.scope),
            parameterId: request.command.parameterId ?? null
          }
        };
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "parameters" })
    },
    windowValue: new FakeWindow()
  });
  await surface.open();
  const parameterForm = root.innerHTML.match(
    /<form class="course-design-parameter-form"[\s\S]*?<\/form>/u
  )?.[0] || "";
  assert.match(parameterForm, /name="reason"/u);
  assert.match(parameterForm, /aria-label="Salvar neste escopo"/u);
  assert.doesNotMatch(parameterForm, /Este formulário fixa uma decisão explícita/iu);
  assert.doesNotMatch(parameterForm, /<option value="automatic"/u);
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-design-parameter]"; },
      elements: {
        parameterId: { value: "new_analysis_unit_ceiling_per_expository_study_unit" },
        parameterValue: { value: "4" },
        origin: { value: "research_condition" },
        reason: { value: "Condição experimental registrada." }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0], requestId: "<uuid>" }, {
    requestId: "<uuid>",
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    command: {
      type: "set_parameter",
      scope: { kind: "course", ref: COURSE_ID },
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
      value: 4,
      origin: "research_condition",
      reason: "Condição experimental registrada."
    }
  });
  assert.match(root.innerHTML, /Parâmetro salvo neste escopo/u);

  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "clear-design-parameter",
            parameterId: "new_analysis_unit_ceiling_per_expository_study_unit"
          }
        };
      }
    }
  });
  assert.equal(calls.length, 1, "Restaurar herança deve aguardar confirmação local.");
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "confirm-action-confirmation" } };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].command, {
    type: "clear_parameter",
    scope: { kind: "course", ref: COURSE_ID },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit"
  });
  assert.equal(calls[1].expectedCourseRevision, 6);
  assert.match(root.innerHTML, /valor herdado voltou a valer/u);
});

test("repete mutação de desenho com o mesmo requestId e payload após perder a resposta", async () => {
  const root = new FakeRoot();
  const calls = [];
  const confirmations = new Map();
  let closed = 0;
  let revision = 5;
  let design = courseDesignFixture();
  const locationValue = {
    pathname: "/",
    search: "",
    hash: buildCourseAuthoringRoute(COURSE_ID, { section: "parameters" })
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title: "Fundamentos",
          goal: "Compreender relações essenciais.",
          revision,
          ownership: "owned",
          canEdit: true
        };
      },
      async loadCourseDesign() {
        return structuredClone(design);
      },
      async mutateCourseDesign(request) {
        calls.push(structuredClone(request));
        if (confirmations.has(request.requestId)) {
          return {
            ...confirmations.get(request.requestId),
            idempotent: true
          };
        }
        revision = 6;
        const assignment = {
          value: request.command.value,
          origin: request.command.origin,
          reason: request.command.reason
        };
        design = {
          ...design,
          courseRevision: revision,
          parameters: design.parameters.map((parameter, index) => index === 0 ? {
            ...parameter,
            localAssignment: assignment,
            effectiveAssignment: {
              ...assignment,
              sourceScope: { kind: "course", ref: COURSE_ID },
              inherited: false
            }
          } : parameter)
        };
        const result = {
          contract: "aralearn.course-design-change.v2",
          courseId: COURSE_ID,
          courseRevision: revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: {
            type: request.command.type,
            scope: structuredClone(request.command.scope),
            parameterId: request.command.parameterId ?? null
          }
        };
        confirmations.set(request.requestId, result);
        const error = new TypeError("Failed to fetch");
        error.code = "network_error";
        throw error;
      }
    }),
    locationValue,
    windowValue: new FakeWindow(),
    onClose() { closed += 1; }
  });
  await surface.open();
  const submit = {
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-design-parameter]"; },
      elements: {
        parameterId: { value: "new_analysis_unit_ceiling_per_expository_study_unit" },
        parameterValue: { value: "4" },
        origin: { value: "author" },
        reason: { value: "Decisão editorial explícita." }
      }
    }
  };

  root.listeners.get("submit")(submit);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedCourseRevision, 5);
  assert.match(root.innerHTML, /confirmar a mesma operação/u);
  root.listeners.get("click")({
    preventDefault() {},
    target: { closest: () => ({ dataset: { courseAuthoringAction: "show-list" } }) }
  });
  assert.equal(
    locationValue.hash,
    buildCourseAuthoringRoute(COURSE_ID, { section: "parameters" })
  );
  assert.equal(surface.handleBack(), true);
  assert.equal(surface.close(), "deferred");
  assert.equal(surface.opened, true);
  assert.equal(closed, 0);

  root.listeners.get("submit")(submit);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(confirmations.size, 1);
  assert.match(root.innerHTML, /Parâmetro salvo neste escopo/u);
  assert.match(root.innerHTML, /value="4"/u);
});

test("desenho mantém o envelope até a releitura e não reaplica escrita já confirmada", async () => {
  const root = new FakeRoot();
  let revision = 5;
  let mutationCalls = 0;
  let rejectReread;
  const reread = new Promise((resolve, reject) => { rejectReread = reject; });
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title: "Fundamentos",
          goal: "Compreender relações essenciais.",
          revision,
          ownership: "owned",
          canEdit: true
        };
      },
      async loadCourseDesign() {
        if (mutationCalls > 0) return reread;
        return courseDesignFixture({ courseRevision: revision });
      },
      async mutateCourseDesign(request) {
        mutationCalls += 1;
        revision = 6;
        return {
          contract: "aralearn.course-design-change.v2",
          courseId: COURSE_ID,
          courseRevision: revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: {
            type: request.command.type,
            scope: structuredClone(request.command.scope),
            parameterId: request.command.parameterId ?? null
          }
        };
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "parameters" })
    },
    windowValue: new FakeWindow()
  });
  await surface.open();
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches: (selector) => selector === "[data-course-design-parameter]",
      elements: {
        parameterId: { value: "new_analysis_unit_ceiling_per_expository_study_unit" },
        parameterValue: { value: "4" },
        origin: { value: "author" },
        reason: { value: "Decisão editorial confirmada." }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(mutationCalls, 1);
  assert.equal(surface.close(), "deferred", "O envelope só pode ser limpo após a releitura.");
  rejectReread(new TypeError("Falha ao reler o desenho"));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(mutationCalls, 1);
  assert.match(root.innerHTML, /gravação foi confirmada, mas a tela pode estar desatualizada/u);
  assert.doesNotMatch(root.innerHTML, /confirmar a mesma operação/u);
  assert.equal(surface.close(), true, "A confirmação remove o envelope sem pedir nova escrita.");
});

test("cria Curso privado pela mesma operação canônica disponível ao MCP", async () => {
  const root = new FakeRoot();
  const calls = [];
  const locationValue = { pathname: "/", search: "", hash: "" };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async createCourse(value) {
        calls.push(value);
        return { courseId: SECOND_COURSE_ID, revision: 1 };
      }
    }),
    locationValue,
    windowValue: new FakeWindow()
  });
  await surface.open();
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-create" } };
      }
    }
  });
  assert.match(root.innerHTML, /data-course-authoring-create/u);
  assert.match(root.innerHTML, /course-authoring-create-title/u);

  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-create]"; },
      elements: {
        title: { value: "Novo Curso" },
        objective: { value: "Investigar relações." }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.match(calls[0].requestId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual({ ...calls[0], requestId: "<uuid>" }, {
    requestId: "<uuid>",
    title: "Novo Curso",
    objective: "Investigar relações."
  });
  assert.equal(
    locationValue.hash,
    buildCourseAuthoringRoute(SECOND_COURSE_ID)
  );
});

test("repete criação confirmada com o mesmo requestId e payload após perder a resposta", async () => {
  const root = new FakeRoot();
  const calls = [];
  const receipts = new Map();
  let closed = 0;
  const locationValue = { pathname: "/", search: "", hash: "" };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async createCourse(value) {
        calls.push(structuredClone(value));
        const receipt = receipts.get(value.requestId);
        if (receipt) return structuredClone(receipt);
        const result = { courseId: SECOND_COURSE_ID, revision: 1 };
        receipts.set(value.requestId, result);
        const error = new TypeError("Failed to fetch");
        error.code = "network_error";
        throw error;
      }
    }),
    locationValue,
    windowValue: new FakeWindow(),
    onClose() { closed += 1; }
  });
  await surface.open();
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-create" } };
      }
    }
  });
  const submit = {
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-create]"; },
      elements: {
        title: { value: "Novo Curso" },
        objective: { value: "Investigar relações." }
      }
    }
  };

  root.listeners.get("submit")(submit);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.match(root.innerHTML, /confirmar a mesma operação/u);
  assert.match(root.innerHTML, /data-course-authoring-create/u);
  assert.equal(await surface.refresh(), "deferred");
  assert.equal(surface.close(), "deferred");
  assert.equal(surface.handleBack(), true);
  assert.equal(surface.opened, true);
  assert.equal(closed, 0);

  root.listeners.get("submit")(submit);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(receipts.size, 1);
  assert.equal(
    locationValue.hash,
    buildCourseAuthoringRoute(SECOND_COURSE_ID)
  );
  assert.equal(surface.close(), true);
  assert.equal(closed, 1);
});






test("Planejamento sem estrutura usa vínculos persistidos e não oferece compositor de clipboard", async () => {
  const root = new FakeRoot();
  const emptyPlan = structuredClone(authoringPlanFixture());
  emptyPlan.plan.parts = [{
    ...emptyPlan.plan.parts[1],
    position: 0
  }];
  emptyPlan.plan.counts = {
    ...emptyPlan.plan.counts,
    authoringPartCount: 1,
    linkedDidacticMicrosequenceCount: 0,
    studyUnitCount: 0
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async loadAuthoringPlan() {
        return emptyPlan;
      }
    }),
    locationValue: {
      origin: "https://example.test",
      pathname: "/app",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });
  await surface.open();

  assert.doesNotMatch(root.innerHTML, /open-microsequence-assignment|Adicionar Parte/u);
  assert.match(root.innerHTML, /Conteúdo ainda não materializado/u);
  assert.doesNotMatch(root.innerHTML, /Vincule uma microssequência/u);
  assert.doesNotMatch(
    root.innerHTML,
    /Trabalhar no ChatGPT|Copiar pedido|context-chat|prepare-structure|materialize-part/u
  );
});


test("deep link compartilhado é recusado pela Autoria", async () => {
  const root = new FakeRoot();
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title: "Aplicações",
          goal: "Praticar.",
          brief: null,
          revision: 5,
          ownership: "shared",
          canEdit: false,
          authoringState: null
        };
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), false);
  assert.doesNotMatch(root.innerHTML, /section=planning|>Planejamento<\/span>/u);
  assert.match(root.innerHTML, /Somente o proprietário pode acessar esta área/u);
  assert.doesNotMatch(root.innerHTML, /Orientações|Partes de autoria|Decisões/u);
});

test("Pessoas concede e revoga somente após confirmação explícita, sem diretório nem e-mail exibido", async () => {
  const root = new FakeRoot();
  const changes = [];
  let people = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async listCourseAccess(courseId) {
        return {
          contract: "aralearn.course-people.v1",
          courseId,
          owner: {
            userId: "30000000-0000-4000-8000-000000000003",
            displayName: "Pessoa proprietária",
            avatarObjectKey: null
          },
          people
        };
      },
      async grantCourseAccess(value) {
        changes.push(["grant", value]);
        people = [{
          userId: "40000000-0000-4000-8000-000000000004",
          displayName: "Pessoa estudante",
          avatarObjectKey: null
        }];
      },
      async revokeCourseAccess(value) {
        changes.push(["revoke", value]);
        people = [];
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "people" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.match(root.innerHTML, /<h1 title="Fundamentos">Fundamentos<\/h1>/u);
  assert.match(root.innerHTML, /<p class="course-authoring-context-title">Pessoas e acesso<\/p>/u);
  assert.match(
    root.innerHTML,
    /<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">Pessoas e acesso<\/h2>/u
  );
  assert.match(root.innerHTML, /Pessoa proprietária/u);
  assert.doesNotMatch(root.innerHTML, /Acesso direto ao Estudo/u);
  assert.doesNotMatch(root.innerHTML, /@|diretório/iu);

  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-grant" } };
      }
    }
  });
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-grant]"; },
      elements: { email: { value: "student@example.test" } }
    }
  });
  assert.equal(changes.length, 0, "Conceder acesso deve aguardar a confirmação local.");
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "confirm-action-confirmation" } };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(changes[0][0], "grant");
  assert.match(changes[0][1].requestId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual({ ...changes[0][1], requestId: "<uuid>" }, {
    requestId: "<uuid>",
    courseId: COURSE_ID,
    email: "student@example.test",
    confirmed: true
  });
  assert.doesNotMatch(root.innerHTML, /Pessoa estudante/u);
  assert.match(root.innerHTML, /Solicitação recebida/u);
  assert.match(root.innerHTML, /não informa se o endereço corresponde a uma conta/u);
  assert.match(root.innerHTML, /Use Atualizar Curso depois/u);
  assert.doesNotMatch(root.innerHTML, /student@example\.test/u);
  await surface.refresh();
  assert.match(root.innerHTML, /Pessoa estudante/u);

  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "revoke-access",
            userId: "40000000-0000-4000-8000-000000000004",
            displayName: "Pessoa estudante"
          }
        };
      }
    }
  });
  assert.equal(changes.length, 1, "Revogar acesso deve aguardar a confirmação local.");
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "confirm-action-confirmation" } };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(changes[1][0], "revoke");
  assert.match(changes[1][1].requestId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual({ ...changes[1][1], requestId: "<uuid>" }, {
    requestId: "<uuid>",
    courseId: COURSE_ID,
    userId: "40000000-0000-4000-8000-000000000004",
    confirmed: true
  });
  assert.match(root.innerHTML, /Acesso revogado; o estado pessoal foi preservado/u);
});

test("resposta ambígua em Pessoas bloqueia navegação e saída até o cancelamento explícito", async () => {
  const root = new FakeRoot();
  let closed = 0;
  const locationValue = {
    pathname: "/",
    search: "",
    hash: buildCourseAuthoringRoute(COURSE_ID, { section: "people" })
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async grantCourseAccess() {
        const error = new TypeError("Failed to fetch");
        error.code = "network_error";
        throw error;
      }
    }),
    locationValue,
    windowValue: new FakeWindow(),
    onClose() { closed += 1; }
  });

  await surface.open();
  root.listeners.get("click")({
    preventDefault() {},
    target: { closest: () => ({ dataset: { courseAuthoringAction: "open-grant" } }) }
  });
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches: (selector) => selector === "[data-course-authoring-grant]",
      elements: { email: { value: "student@example.test" } }
    }
  });
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest: () => ({ dataset: { courseAuthoringAction: "confirm-action-confirmation" } })
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(root.innerHTML, /confirmar a mesma operação/u);

  root.listeners.get("click")({
    preventDefault() {},
    target: { closest: () => ({ dataset: { courseAuthoringAction: "show-list" } }) }
  });
  assert.equal(
    locationValue.hash,
    buildCourseAuthoringRoute(COURSE_ID, { section: "people" })
  );
  assert.equal(surface.handleBack(), true);
  assert.equal(surface.close(), "deferred");
  assert.equal(surface.opened, true);
  assert.equal(closed, 0);

  root.listeners.get("click")({
    preventDefault() {},
    target: { closest: () => ({ dataset: { courseAuthoringAction: "cancel-grant" } }) }
  });
  root.listeners.get("click")({
    preventDefault() {},
    target: { closest: () => ({ dataset: { courseAuthoringAction: "show-list" } }) }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(locationValue.hash, "");
  assert.match(root.innerHTML, /<h1>Meus cursos<\/h1>/u);
});

test("Conteúdo carrega só o Curso e entrega toda a navegação à sequência", async () => {
  const root = new FakeRoot();
  const calls = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        calls.push(["course", courseId]);
        return {
          courseId,
          title: "Fundamentos",
          goal: "Compreender relações essenciais.",
          revision: 5,
          ownership: "owned",
          canEdit: true
        };
      },
      async loadAuthoringOutline(courseId) {
        calls.push(["outline", courseId]);
        throw new Error("Conteúdo não deve carregar outline.");
      },
      async loadAuthoringStudyUnits() {
        calls.push(["inspection"]);
        throw new Error("Estrutura não deveria carregar Unidades de estudo");
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "content" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.deepEqual(calls, [["course", COURSE_ID]]);
  assert.match(root.innerHTML, /data-course-inspection-host/u);
  assert.doesNotMatch(root.innerHTML, /course-authoring-outline|Estrutura do Curso|Base · Relações/u);
});

test("deep link de outra Unit no mesmo Curso relê a revisão produzida fora da tela", async () => {
  const root = new FakeRoot();
  const windowValue = new FakeWindow();
  const locationValue = {
    pathname: "/",
    search: "",
    hash: buildCourseAuthoringRoute(COURSE_ID, {
      section: "content",
      studyUnitId: "unit-1"
    })
  };
  let reads = 0;
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        reads += 1;
        return courseDetailFixture({ courseId, revision: 4 + reads });
      }
    }),
    locationValue,
    windowValue
  });

  assert.equal(await surface.open(), true);
  assert.equal(reads, 1);
  locationValue.hash = buildCourseAuthoringRoute(COURSE_ID, {
    section: "content",
    studyUnitId: "unit-2"
  });
  windowValue.dispatch("hashchange");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 2);
});

test("back interno retorna do Conteúdo diretamente à lista sem overview intermediário", async () => {
  const root = new FakeRoot();
  const windowValue = new FakeWindow();
  const locationValue = {
    pathname: "/app",
    search: "",
    hash: buildCourseAuthoringRoute(COURSE_ID, { section: "content" })
  };
  const replacements = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture(),
    locationValue,
    historyValue: {
      state: { area: "authoring" },
      replaceState(...args) {
        replacements.push(args);
      }
    },
    windowValue
  });

  await surface.open();
  assert.equal(surface.handleBack(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(locationValue.hash, "");
  assert.deepEqual(replacements, [[{ area: "authoring" }, "", "/app"]]);
  assert.match(root.innerHTML, /<h1>Meus cursos<\/h1>/u);
});

test("offline conhecido e acesso revogado têm estados próprios", async () => {
  const offlineRoot = new FakeRoot();
  const offlineSurface = createCourseAuthoringSurface({
    root: offlineRoot,
    controller: controllerFixture({
      async listCourses() {
        return listPage({ offline: true, stale: true });
      }
    }),
    locationValue: { pathname: "/", search: "", hash: "" },
    windowValue: new FakeWindow()
  });
  await offlineSurface.open();
  assert.match(offlineRoot.innerHTML, /Exibindo o que já está neste dispositivo/u);

  const revokedRoot = new FakeRoot();
  const revokedSurface = createCourseAuthoringSurface({
    root: revokedRoot,
    controller: controllerFixture({
      async getCourse() {
        const error = new Error("not found");
        error.status = 404;
        throw error;
      },
      async loadAuthoringOutline() {
        const error = new Error("not found");
        error.status = 404;
        throw error;
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "content" })
    },
    windowValue: new FakeWindow()
  });
  await revokedSurface.open();
  assert.match(revokedRoot.innerHTML, /O acesso a este Curso não está mais disponível/u);
  assert.doesNotMatch(revokedRoot.innerHTML, /not found/u);
});

test("renderer escapa conteúdo e CSS mantém moldura compacta com um rolador de página", async () => {
  const page = normalizeCourseListPage({
    items: [{ courseId: COURSE_ID, title: "<script>alert(1)</script>" }],
    hasMore: false,
    nextCursor: null
  });
  const markup = renderCourseAuthoringSurface({
    view: "list",
    query: "",
    loading: false,
    list: page,
    failure: null
  });
  assert.doesNotMatch(markup, /<script>/u);
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);

  const css = await readFile(new URL("../../public/course-authoring.css", import.meta.url), "utf8");
  const surfaceSource = await readFile(
    new URL("../../src/ui/CourseAuthoringSurface.js", import.meta.url),
    "utf8"
  );
  assert.match(css, /\.course-authoring-surface \{[\s\S]*?box-sizing: border-box/u);
  assert.match(
    css,
    /\.course-authoring-root \{[\s\S]*?height: 100dvh;[\s\S]*?overflow-y: auto;[\s\S]*?overflow-x: clip;[\s\S]*?scrollbar-gutter: stable;[\s\S]*?overscroll-behavior: contain;/u
  );
  assert.match(
    css,
    /\.course-authoring-surface \{[\s\S]*?width: min\(100%, 430px\);[\s\S]*?max-width: 430px;/u
  );
  assert.match(css, /\.course-authoring-frame \{[\s\S]*?max-width: 430px;/u);
  assert.doesNotMatch(css, /course-authoring-chat-(?:composer|backdrop)/u);
  assert.doesNotMatch(surfaceSource, /course-authoring-chat|Trabalhar no ChatGPT|Copiar pedido/u);
  assert.match(
    surfaceSource,
    /const routeChanged = Boolean\(state\.routeKey && state\.routeKey !== nextKey\);\s*if \(routeChanged\) \{\s*destroyInspectionSequence\(\);[\s\S]*?root\.scrollTop = 0;/u
  );
  assert.match(css, /@media \(max-width: 380px\)/u);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.course-authoring-task-menu > nav \{[\s\S]*?width: min\(82vw, 320px\)/u);
  assert.match(
    css,
    /\.course-authoring-course-header:has\(> \.course-authoring-header-actions\) \{[\s\S]*?grid-template-columns: var\(--tap\) minmax\(0, 1fr\) auto/u
  );
  assert.match(
    surfaceSource,
    /const title = AUTHORING_SECTION_LABELS\[state\.section\] \|\| "Autoria";[\s\S]*?<h1 title="\$\{escapeHtml\(course\?\.title \|\| "Curso"\)\}">[\s\S]*?course-authoring-context-title/u
  );
  assert.match(
    css,
    /\.course-authoring-course-heading \{[\s\S]*?text-align: center;/u
  );
  assert.match(
    css,
    /\.course-authoring-eyebrow \{[\s\S]*?letter-spacing: 0;[\s\S]*?text-transform: none;/u
  );
  const contextTitleRule = css.match(
    /\.course-authoring-context-title \{([\s\S]*?)\}/u
  )?.[1];
  assert.ok(contextTitleRule);
  assert.match(contextTitleRule, /overflow:\s*hidden/u);
  assert.match(contextTitleRule, /text-overflow:\s*ellipsis/u);
  assert.match(contextTitleRule, /white-space:\s*nowrap/u);
  assert.doesNotMatch(
    contextTitleRule,
    /text-transform:\s*uppercase/u
  );
  assert.match(surfaceSource, /class="course-authoring-context-title">\$\{escapeHtml\(title\)\}/u);
  assert.match(
    css,
    /\.course-authoring-course-header \{[\s\S]*?height: calc\(var\(--tap\) \+ 8px\);/u
  );
  assert.match(
    css,
    /\.course-authoring-part-counts span \{[\s\S]*?white-space: nowrap;/u
  );
  assert.doesNotMatch(css, /-webkit-line-clamp: 4/u);
  assert.doesNotMatch(css, /\.course-authoring-sections\.has-standard/u);
  assert.match(css, /min-height: var\(--tap\)/u);
  assert.doesNotMatch(css, /width: min\(100%, (?:560|620|720|760|820|1180)px\)/u);
  assert.doesNotMatch(css, /@media \(min-width: (?:640|680|900)px\)/u);
  assert.doesNotMatch(css, /course-authoring-sidebar-navigation/u);
  assert.doesNotMatch(css, /course-authoring-(?:sections|area-menu)/u);
  assert.match(css, /\.course-authoring-primary-navigation \{/u);
  assert.doesNotMatch(
    css,
    /course-authoring-(?:overview|task-grid|task-section|materialization|recent-activity|detail-navigation|planning-metric-counts)|course-inspection-(?:spacer|boundary|preview)/u
  );
  assert.doesNotMatch(
    surfaceSource,
    /globalThis\.confirm|confirmValue/u,
    "A Autoria deve usar confirmações próprias, com foco e contexto preservados."
  );
});

test("shell mantém Conteúdo e Planejamento icon-only e recolhe destinos ocasionais", () => {
  const course = {
    courseId: COURSE_ID,
    title: "Fundamentos",
    goal: "Compreender relações essenciais.",
    revision: 5,
    ownership: "owned",
    canEdit: true,
    counts: null
  };
  const markup = renderCourseAuthoringSurface({
    view: "course",
    section: "content",
    course,
    knownCourse: course,
    loading: false,
    failure: null,
    sourceTarget: null
  });

  assert.match(markup, /<h1 title="Fundamentos">Fundamentos<\/h1>/u);
  assert.match(markup, /<p class="course-authoring-context-title">Conteúdo<\/p>/u);
  assert.equal((markup.match(/class="course-authoring-primary-destination/gu) || []).length, 2);
  const primary = markup.match(
    /<nav class="course-authoring-primary-navigation"[\s\S]*?<\/nav>/u
  )?.[0];
  assert.ok(primary);
  assert.match(primary, /aria-label="Conteúdo"/u);
  assert.match(primary, /aria-label="Planejamento"/u);
  assert.doesNotMatch(primary, /<strong>|>Conteúdo<|>Planejamento</u);
  assert.match(markup, /<details class="course-authoring-task-menu"/u);
  assert.doesNotMatch(markup, /Visão geral|section=overview|course-authoring-overview/u);
  assert.doesNotMatch(markup, /course-authoring-sidebar-navigation/u);
  for (const label of [
    "Parâmetros", "Fontes", "Revisão", "Dados de autoria", "Pessoas e acesso"
  ]) assert.match(markup, new RegExp(`<strong>${label}<\\/strong>`, "u"));
  for (const section of ["planning", "content", "parameters", "sources", "review", "research", "people"]) {
    assert.match(markup, new RegExp(`section=${section}`, "u"));
  }
});

test("Meus cursos não repete propriedade em texto visual", () => {
  const markup = renderCourseAuthoringSurface({
    view: "list",
    query: "",
    list: listPage(),
    loading: false,
    failure: null
  });

  assert.match(markup, /<h1>Meus cursos<\/h1>/u);
  assert.doesNotMatch(markup, /Seu Curso|· Seu Curso/u);
});
