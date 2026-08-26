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
const MATERIALIZATION_ID = "80000000-0000-4000-8000-000000000008";
const MATERIALIZATION_HISTORY_IDS = Object.freeze([
  "81000000-0000-4000-8000-000000000008",
  "82000000-0000-4000-8000-000000000008",
  "83000000-0000-4000-8000-000000000008"
]);
const EVENT_ID = "9";
const PLAN_ID = "a0000000-0000-4000-8000-00000000000a";
const MATERIALIZATION_STEP_IDS = Object.freeze([
  "b0000000-0000-4000-8000-00000000000b",
  "c0000000-0000-4000-8000-00000000000c",
  "d0000000-0000-4000-8000-00000000000d",
  "e0000000-0000-4000-8000-00000000000e"
]);

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
    deepLink: `#/authoring/courses/${courseId}?section=structure`
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

function authoringPlanFixture(overrides = {}) {
  return {
    contract: "aralearn.course-instructional-plan.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    plan: {
      id: PLAN_ID,
      version: 3,
      title: "Fundamentos",
      objective: "Compreender relações essenciais.",
      audience: "Pessoas iniciantes.",
      scope: "Relações fundamentais.",
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
        version: 1
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
          curriculumPath: {
            moduleId: "module-a",
            moduleTitle: "Base",
            lessonId: "lesson-a",
            lessonTitle: "Relações"
          },
          studyUnitCount: 3
        }],
        progress: {
          state: "materializing",
          microsequenceCount: 2,
          studyUnitCount: 7,
          materializations: [{
            id: MATERIALIZATION_ID,
            status: "running",
            progressState: "partial",
            channel: "mcp",
            version: 1,
            completedStepCount: 2,
            failedStepCount: 0,
            totalStepCount: 4,
            startedAt: "2026-08-17T10:00:00Z",
            updatedAt: "2026-08-17T10:10:00Z",
            completedAt: null,
            summary: "2 de 4 etapas concluídas"
          }],
          lastMaterialization: {
            id: MATERIALIZATION_ID,
            status: "running",
            version: 1,
            completedStepCount: 2,
            failedStepCount: 0,
            totalStepCount: 4,
            startedAt: "2026-08-17T10:00:00Z",
            updatedAt: "2026-08-17T10:10:00Z",
            completedAt: null
          }
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
          studyUnitCount: 0,
          materializations: [],
          lastMaterialization: null
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
    recentActivity: [{
      eventId: EVENT_ID,
      revision: 5,
      kind: "materialization_step_recorded",
      channel: "mcp",
      instructionalPlanItemId: null,
      partId: PART_ID,
      materializationId: MATERIALIZATION_ID,
      createdAt: "2026-08-17T10:10:00Z"
    }],
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
  const supportedScopes = ["course", "lesson", "didactic_microsequence"];
  const definitions = [{
    id: "new_analysis_unit_ceiling_per_expository_study_unit",
    label: "Novas unidades de análise por Unidade expositiva",
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
  const guidanceRevision = {
    revisionId: "91000000-0000-4000-8000-000000000019",
    guidance: "Explique cada termo antes de depender dele.",
    origin: "author",
    reason: "Evitar pressupostos ocultos."
  };
  const currentScope = { kind: scope.kind, ref: scope.ref };
  const inherited = scope.kind !== "course";
  return {
    contract: "aralearn.course-design.v1",
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
      const local = index === 0 ? localParameter : null;
      return {
        parameterId: definition.id,
        localAssignment: local,
        effectiveAssignment: local ? {
          ...structuredClone(local),
          sourceScope: currentScope,
          inherited: false
        } : {
          changeId: inherited ? "7" : null,
          value: structuredClone(definition.defaultValue),
          origin: inherited ? "author" : "system_default",
          reason: inherited ? "Decisão definida no Curso." : "Hipótese inicial do produto.",
          sourceScope: inherited ? { kind: "course", ref: COURSE_ID } : null,
          inherited
        }
      };
    }),
    guidance: {
      localRevision: scope.kind === "course" ? guidanceRevision : null,
      effectiveRevisions: [{
        ...guidanceRevision,
        sourceScope: { kind: "course", ref: COURSE_ID },
        currentInterpretation: {
          interpretationId: "4",
          guidanceRevisionId: guidanceRevision.revisionId,
          interpretation: {
            summary: "Definir os termos antes do uso.",
            directives: [{ kind: "require", statement: "Definir todo termo novo." }],
            divergences: [],
            questions: ["Qual exemplo deve abrir a explicação?"]
          },
          createdAt: "2026-08-17T12:00:00Z"
        }
      }]
    },
    componentCatalog: { version: "1-3e5629f8", options: componentOptions },
    targetPlanItems,
    componentPolicy: {
      localChange: localPolicy,
      effectiveChange: localPolicy ? {
        ...structuredClone(localPolicy),
        sourceScope: currentScope,
        inherited: false
      } : {
        changeId: null,
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
    },
    recentApplications: [{
      materializationId: MATERIALIZATION_ID,
      stepId: MATERIALIZATION_STEP_IDS[0],
      didacticMicrosequenceId: "micro-a",
      recordedAt: "2026-08-17T12:10:00Z",
      contextHash: "b".repeat(64),
      studyUnitCount: 3,
      modeCounts: { expository: 1, practice: 1, mixed: 1 },
      introducedInstructionalAnalysisUnitIds: [ANALYSIS_ID],
      developedExplanationForms: ["plain_definition", "concrete_example"],
      practiceOpportunityCount: 2,
      variedDimensions: ["case_or_data"],
      componentRefs: [componentOptions[0].ref]
    }]
  };
}

function partMaterializationFixture(overrides = {}) {
  const step = ({ id, position, kind, status, target = null, production = null,
    resultFacts = {} }) => ({
    id,
    position,
    kind,
    targetDidacticMicrosequenceId: target,
    productionPosition: production,
    status,
    version: status === "pending" ? 1 : 2,
    resultFacts,
    updatedAt: status === "pending"
      ? "2026-08-17T10:00:00Z"
      : "2026-08-17T10:10:00Z",
    completedAt: status === "pending" ? null : "2026-08-17T10:10:00Z"
  });
  const steps = [
    step({
      id: MATERIALIZATION_STEP_IDS[0],
      position: 0,
      kind: "context_load",
      status: "completed",
      resultFacts: { loadedSources: 2 }
    }),
    step({
      id: MATERIALIZATION_STEP_IDS[1],
      position: 1,
      kind: "didactic_microsequence_materialization",
      status: "completed",
      target: "micro-a",
      production: 0,
      resultFacts: { studyUnitCount: 4 }
    }),
    step({
      id: MATERIALIZATION_STEP_IDS[2],
      position: 2,
      kind: "validation",
      status: "pending"
    }),
    step({
      id: MATERIALIZATION_STEP_IDS[3],
      position: 3,
      kind: "didactic_microsequence_materialization",
      status: "pending",
      target: "micro-b",
      production: 1
    })
  ];
  return {
    contract: "aralearn.course-authoring-part-materialization.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    authoringPartId: PART_ID,
    materialization: {
      id: MATERIALIZATION_ID,
      authoringPartVersion: 2,
      channel: "mcp",
      status: "running",
      version: 3,
      designContext: { focus: "Aplicação concreta" },
      contextHash: "a".repeat(64),
      resultFacts: {},
      startedAt: "2026-08-17T10:00:00Z",
      updatedAt: "2026-08-17T10:10:00Z",
      completedAt: null,
      steps,
      nextPendingStep: steps[2]
    },
    ...overrides
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
    async loadPartMaterialization() {
      return partMaterializationFixture();
    },
    async mutateAuthoringPlan() {
      return undefined;
    },
    async mutateCourseDesign() {
      return {
        contract: "aralearn.course-design-change.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "93000000-0000-4000-8000-000000000039",
        idempotent: false,
        changed: false,
        change: null
      };
    },
    async requestPartMaterialization() {
      return { delivery: "clipboard" };
    },
    async clearCourse() {
      return undefined;
    }
  };
  Object.assign(controller, overrides);
  return controller;
}

test("lista abre diretamente Cursos concretos com destino canônico em um toque", async () => {
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
    new RegExp(buildCourseAuthoringRoute(COURSE_ID, { section: "overview" }).replace("?", "\\?"), "u")
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

test("Conteúdo delega hierarquia, renderer e edição a uma única sequência", async () => {
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
          revision: 5
        };
      },
      async loadAuthoringOutline(courseId) {
        calls.push(["outline", courseId]);
        return outlineFixture(courseId);
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
  assert.deepEqual(calls, [["outline", COURSE_ID]]);
  assert.match(root.innerHTML, /<h1>Conteúdo<\/h1>/u);
  assert.match(root.innerHTML, /Hierarquia e edição estrutural/u);
  assert.match(root.innerHTML, /Editar Curso/u);
  assert.match(root.innerHTML, /Abrir Base em Conteúdo/u);
  assert.match(root.innerHTML, /data-course-inspection-host/u);
  assert.doesNotMatch(root.innerHTML, />Estrutura<|>Inspeção</u);
  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "edit-content-entity",
            targetKind: "lesson",
            targetId: "lesson-a"
          }
        };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(openedPaths, [{
    entityPath: [COURSE_ID, "module-a", "lesson-a"],
    returnRoute: buildCourseAuthoringRoute(COURSE_ID, { section: "content" })
  }]);
  assert.equal(surface.destroy(), true);
  assert.equal(root.innerHTML, "");
  assert.equal(await surface.open(), true);
  assert.deepEqual(calls, [["outline", COURSE_ID], ["outline", COURSE_ID]]);
  assert.match(root.innerHTML, /<h1>Conteúdo<\/h1>/u);
});

test("Planejamento mostra plano vivo, Partes e fatos recentes sem JSON nem segunda hierarquia", async () => {
  const root = new FakeRoot();
  let outlineReads = 0;
  let inspectionReads = 0;
  let materializationReads = 0;
  const basePlan = authoringPlanFixture();
  basePlan.recentActivity.unshift({
    eventId: "8",
    revision: 4,
    kind: "plan_changed",
    channel: "application",
    instructionalPlanItemId: ANALYSIS_ID,
    partId: null,
    materializationId: null,
    createdAt: "2026-08-17T10:05:00Z"
  });
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
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
        return {
          ...basePlan,
          plan: {
            ...basePlan.plan,
            objective: "Comparar <origem> e aplicação.",
            parts: [{
              ...basePlan.plan.parts[0],
              title: "<img src=x onerror=alert(1)>"
            }, basePlan.plan.parts[1]]
          }
        };
      },
      async loadAuthoringOutline() {
        outlineReads += 1;
        throw new Error("Planejamento não deve carregar a composição do Curso.");
      },
      async loadAuthoringStudyUnits() {
        inspectionReads += 1;
        throw new Error("Planejamento não deve carregar Unidades de estudo.");
      },
      async loadPartMaterialization() {
        materializationReads += 1;
        throw new Error("Planejamento não deve carregar etapas sem ação humana.");
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.equal(outlineReads, 0);
  assert.equal(inspectionReads, 0);
  assert.equal(materializationReads, 0);
  assert.match(root.innerHTML, /<h1>Planejamento<\/h1>/u);
  assert.match(root.innerHTML, /<h3>Objetivo<\/h3>/u);
  assert.match(root.innerHTML, /Comparar &lt;origem&gt; e aplicação\./u);
  assert.match(root.innerHTML, /7–12/u);
  assert.match(root.innerHTML, /Escolha automática/u);
  assert.match(root.innerHTML, /Resultados de aprendizagem/u);
  assert.match(root.innerHTML, /Comparar relações essenciais\./u);
  assert.match(root.innerHTML, /Parte 1/u);
  assert.match(root.innerHTML, /Materialização.*etapa|Etapa de materialização registrada/isu);
  assert.match(
    root.innerHTML,
    /<details class="course-authoring-recent-activity">[\s\S]*Relação entre grandezas\.[\s\S]*<\/details>/u
  );
  assert.match(root.innerHTML, />Abrir Parte</u);
  assert.match(root.innerHTML, /data-course-authoring-action="materialize-part"/u);
  assert.match(root.innerHTML, /data-course-authoring-action="context-chat"/u);
  assert.match(root.innerHTML, /<details class="course-authoring-part-tools"/u);
  assert.doesNotMatch(root.innerHTML, /<img|authoringState|mandate|receipt|fila|já materializ/iu);
  assert.doesNotMatch(root.innerHTML, /\{[^}]*"parts"/u);
});

test("Parâmetros lê somente o escopo e separa pedagogia, orientação, componentes e produção", async () => {
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
  assert.match(root.innerHTML, /<h2 id="course-authoring-section-title">Parâmetros<\/h2>/u);
  assert.match(root.innerHTML, /Hipótese operacional do produto/u);
  assert.match(root.innerHTML, /Texto original/u);
  assert.match(root.innerHTML, /Interpretação estruturada/u);
  assert.match(root.innerHTML, /Política editorial e técnica/u);
  assert.match(root.innerHTML, /Política de produção/u);
  assert.match(root.innerHTML, /não mede qualidade, aprendizagem nem conformidade/u);
  assert.equal((root.innerHTML.match(/class="course-design-component-option"/gu) || []).length, 32);
  assert.doesNotMatch(root.innerHTML, /<pre|\{\s*"/u);
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
  assert.match(root.innerHTML, /não são definidos em Módulo/u);
  assert.match(root.innerHTML, /<fieldset disabled>/u);
  assert.doesNotMatch(root.innerHTML, /data-course-design-parameter/u);
  assert.match(root.innerHTML, /Decisão definida no Curso/u);
});

test("Microssequência atribui itens estáveis do plano e recarrega plano e desenho", async () => {
  const root = new FakeRoot();
  const calls = [];
  let revision = 5;
  let planReads = 0;
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
  let design = courseDesignFixture({
    courseRevision: revision,
    scope,
    ancestors,
    children: [],
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
        planReads += 1;
        return { ...authoringPlanFixture(), courseRevision: revision };
      },
      async loadCourseDesign() {
        return structuredClone(design);
      },
      async mutateCourseDesign(request) {
        calls.push(structuredClone(request));
        revision += 1;
        design = courseDesignFixture({
          courseRevision: revision,
          scope,
          ancestors,
          children: [],
          targetPlanItems: {
            instructionalAnalysisUnitIds: structuredClone(
              request.command.instructionalAnalysisUnitIds
            ),
            evidenceRequirementIds: structuredClone(request.command.evidenceRequirementIds)
          }
        });
        return {
          contract: "aralearn.course-design-change.v1",
          courseId: COURSE_ID,
          courseRevision: revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: {
            changeId: "21",
            type: request.command.type,
            scope: structuredClone(request.command.scope)
          }
        };
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
  assert.equal(planReads, 1);
  assert.match(root.innerHTML, /Cobertura planejada desta Microssequência/u);
  assert.match(root.innerHTML, /Relação entre grandezas/u);
  assert.match(root.innerHTML, /Resolver um caso novo/u);

  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-design-target-items]"; },
      elements: {
        instructionalAnalysisUnitIds: [{ value: ANALYSIS_ID, checked: false }],
        evidenceRequirementIds: [{ value: EVIDENCE_ID, checked: true }]
      }
    }
  });
  for (let attempt = 0; attempt < 8 && planReads < 2; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0], requestId: "<uuid>" }, {
    requestId: "<uuid>",
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    command: {
      type: "set_target_plan_items",
      scope: { kind: "didactic_microsequence", ref: "micro-a" },
      instructionalAnalysisUnitIds: [],
      evidenceRequirementIds: [EVIDENCE_ID]
    }
  });
  assert.equal(
    planReads,
    2,
    root.innerHTML.match(/course-authoring-notice[^>]*>([^<]+)/u)?.[1] || "sem aviso de desenho"
  );
  assert.match(root.innerHTML, /Cobertura planejada salva para esta Microssequência/u);
});

test("salvar e limpar parâmetro usa CAS, origem explícita e restaura herança", async () => {
  const root = new FakeRoot();
  const calls = [];
  let revision = 5;
  let design = courseDesignFixture({
    localParameter: {
      changeId: "8",
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
            changeId: String(8 + revision),
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
            changeId: null,
            value: 2,
            origin: "system_default",
            reason: "Hipótese inicial do produto.",
            sourceScope: null,
            inherited: false
          };
        }
        design.courseRevision = revision;
        return {
          contract: "aralearn.course-design-change.v1",
          courseId: COURSE_ID,
          courseRevision: revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: {
            changeId: String(revision + 8),
            type: request.command.type,
            scope: structuredClone(request.command.scope)
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
          changeId: "14",
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
          contract: "aralearn.course-design-change.v1",
          courseId: COURSE_ID,
          courseRevision: revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: {
            changeId: "14",
            type: request.command.type,
            scope: structuredClone(request.command.scope)
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
          contract: "aralearn.course-design-change.v1",
          courseId: COURSE_ID,
          courseRevision: revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: {
            changeId: "14",
            type: request.command.type,
            scope: structuredClone(request.command.scope)
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

test("deep link abre qualquer materialização e mantém retorno à mesma Parte", async () => {
  const root = new FakeRoot();
  const calls = [];
  const fixture = partMaterializationFixture();
  fixture.materialization.designContext = {
    contract: "aralearn.course-design-context.v2",
    courseId: COURSE_ID,
    componentCatalogVersion: "1-technical",
    focus: "Comparar <origem> com aplicação",
    sourceSet: ["A", "B"]
  };
  fixture.materialization.steps[0].resultFacts = {
    observation: "Contexto <script>alert(1)</script> carregado",
    loadedSources: 2,
    sourceAttributionApplicationHash: "c".repeat(64),
    designApplication: { contract: "internal" }
  };
  fixture.materialization.nextPendingStep = fixture.materialization.steps[2];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async loadPartMaterialization(...args) {
        calls.push(args);
        return fixture;
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, {
        section: "planning",
        authoringPartId: PART_ID,
        materializationId: MATERIALIZATION_ID
      })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.deepEqual(calls, [[COURSE_ID, PART_ID, MATERIALIZATION_ID]]);
  assert.match(root.innerHTML, /Etapas e resultados/u);
  assert.match(root.innerHTML, /Próxima: etapa 3 · Validar produção/u);
  assert.match(root.innerHTML, /Carregar contexto/u);
  assert.match(root.innerHTML, /Fatos da etapa/u);
  assert.match(root.innerHTML, /Fontes carregadas/u);
  assert.match(root.innerHTML, /Unidades/u);
  assert.match(root.innerHTML, /Foco/u);
  assert.doesNotMatch(root.innerHTML, /Loaded Sources|Study Unit Count|Focus/u);
  assert.match(root.innerHTML, /Comparar &lt;origem&gt; com aplicação/u);
  assert.match(root.innerHTML, /Contexto &lt;script&gt;alert\(1\)&lt;\/script&gt; carregado/u);
  assert.doesNotMatch(root.innerHTML, /<script|"designContext"|"resultFacts"/u);
  assert.doesNotMatch(root.innerHTML, /Course Id|Component Catalog Version|c{64}|Design Application/u);
  assert.match(root.innerHTML, /returnAuthoringPartId=/u);
  assert.match(root.innerHTML, /returnMaterializationId=/u);
  assert.match(root.innerHTML, new RegExp(
    buildCourseAuthoringRoute(COURSE_ID, {
      section: "planning", authoringPartId: PART_ID
    }).replaceAll("&", "&amp;").replace("?", "\\?"),
    "u"
  ));
  assert.equal(calls.length, 1);

  const directRoot = new FakeRoot();
  const directSurface = createCourseAuthoringSurface({
    root: directRoot,
    controller: controllerFixture(),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, {
        section: "content",
        moduleId: "module-a",
        returnAuthoringPartId: PART_ID,
        returnMaterializationId: MATERIALIZATION_ID
      })
    },
    windowValue: new FakeWindow()
  });
  assert.equal(await directSurface.open(), true);
  assert.match(directRoot.innerHTML, /aria-label="Voltar à execução"/u);
  assert.match(directRoot.innerHTML, new RegExp(
    buildCourseAuthoringRoute(COURSE_ID, {
      section: "planning",
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }).replaceAll("&", "&amp;").replace("?", "\\?"),
    "u"
  ));
});

test("Parte mostra histórico completo com execução parcial, concluída e falha anterior", async () => {
  const root = new FakeRoot();
  const plan = authoringPlanFixture();
  const [partialId, completedId, failedId] = MATERIALIZATION_HISTORY_IDS;
  plan.plan.parts[0].progress = {
    state: "materializing",
    microsequenceCount: 2,
    studyUnitCount: 7,
    materializations: [{
      id: MATERIALIZATION_ID,
      status: "running",
      progressState: "running",
      channel: "mcp",
      version: 1,
      completedStepCount: 0,
      failedStepCount: 0,
      totalStepCount: 3,
      startedAt: "2026-08-17T14:00:00Z",
      updatedAt: "2026-08-17T14:00:00Z",
      completedAt: null,
      summary: "A execução está preparando o contexto."
    }, {
      id: partialId,
      status: "running",
      progressState: "partial",
      channel: "application",
      version: 2,
      completedStepCount: 1,
      failedStepCount: 0,
      totalStepCount: 3,
      startedAt: "2026-08-17T13:00:00Z",
      updatedAt: "2026-08-17T13:02:00Z",
      completedAt: null,
      summary: "A estrutura foi iniciada e pode ser retomada."
    }, {
      id: completedId,
      status: "completed",
      progressState: "completed",
      channel: "actions",
      version: 4,
      completedStepCount: 3,
      failedStepCount: 0,
      totalStepCount: 3,
      startedAt: "2026-08-17T12:00:00Z",
      updatedAt: "2026-08-17T12:05:00Z",
      completedAt: "2026-08-17T12:05:00Z",
      summary: "Duas Unidades foram produzidas."
    }, {
      id: failedId,
      status: "failed",
      progressState: "failed",
      channel: "mcp",
      version: 2,
      completedStepCount: 1,
      failedStepCount: 1,
      totalStepCount: 3,
      startedAt: "2026-08-17T11:00:00Z",
      updatedAt: "2026-08-17T11:02:00Z",
      completedAt: "2026-08-17T11:02:00Z",
      summary: "Revise a Fonte pendente e tente novamente."
    }],
    lastMaterialization: {
      id: MATERIALIZATION_ID,
      status: "running",
      version: 1,
      completedStepCount: 0,
      failedStepCount: 0,
      totalStepCount: 3,
      startedAt: "2026-08-17T14:00:00Z",
      updatedAt: "2026-08-17T14:00:00Z",
      completedAt: null
    }
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({ async loadAuthoringPlan() { return plan; } }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, {
        section: "planning", authoringPartId: PART_ID
      })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.match(root.innerHTML, /4 execuções/u);
  assert.match(root.innerHTML, />Em andamento</u);
  assert.match(root.innerHTML, />Parcial</u);
  assert.match(root.innerHTML, />Concluída</u);
  assert.match(root.innerHTML, />Falhou</u);
  assert.match(root.innerHTML, /Aplicativo/u);
  assert.match(root.innerHTML, /Actions/u);
  assert.match(root.innerHTML, /MCP/u);
  assert.match(root.innerHTML, /Revise a Fonte pendente e tente novamente/u);
  assert.ok(root.innerHTML.indexOf(MATERIALIZATION_ID) < root.innerHTML.indexOf(partialId));
  assert.ok(root.innerHTML.indexOf(partialId) < root.innerHTML.indexOf(completedId));
  assert.ok(root.innerHTML.indexOf(completedId) < root.innerHTML.indexOf(failedId));
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

test("edita título canônico e plano humano sem JSON nem autoridade duplicada", async () => {
  const root = new FakeRoot();
  const calls = [];
  let revision = 5;
  let title = "Fundamentos";
  let objective = "Objetivo anterior.";
  let plan = {
    ...authoringPlanFixture(),
    plan: {
      ...authoringPlanFixture().plan,
      objective,
      audience: "Público anterior.",
      scope: "Escopo anterior."
    }
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title,
          goal: objective,
          revision,
          ownership: "owned",
          canEdit: true
        };
      },
      async loadAuthoringPlan() {
        return structuredClone(plan);
      },
      async mutateAuthoringPlan(value) {
        calls.push(structuredClone(value));
        revision += 1;
        title = value.title;
        objective = value.objective;
        plan = {
          ...plan,
          courseRevision: revision,
          plan: {
            ...plan.plan,
            version: plan.plan.version + 1,
            title,
            objective,
            audience: value.audience,
            scope: value.scope,
            preferredPartCount: value.preferredPartCount
          }
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
  await surface.open();
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-planning-edit" } };
      }
    }
  });
  assert.match(root.innerHTML, /name="rangeMinimum"[^>]*value="7"/u);
  assert.doesNotMatch(root.innerHTML, /JSON|authoringState|brief/iu);

  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-planning]"; },
      elements: {
        title: { value: "Fundamentos revisados" },
        objective: { value: "Novo objetivo." },
        audience: { value: "Pesquisadores iniciantes." },
        scope: { value: "Relações e aplicações." },
        rangeMinimum: { value: "8" },
        rangeMaximum: { value: "10" },
        rangeOrigin: { value: "research_condition" }
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
    expectedPlanVersion: 3,
    operation: "update_plan",
    title: "Fundamentos revisados",
    objective: "Novo objetivo.",
    audience: "Pesquisadores iniciantes.",
    scope: "Relações e aplicações.",
    preferredPartCount: {
      minimum: 8,
      maximum: 10,
      origin: "research_condition"
    }
  });
  assert.match(root.innerHTML, /Planejamento salvo/u);
  assert.doesNotMatch(root.innerHTML, /data-course-authoring-planning/u);
});

test("repete alteração do plano com o mesmo requestId e payload após perder a resposta", async () => {
  const root = new FakeRoot();
  const calls = [];
  const confirmations = new Map();
  let closed = 0;
  let revision = 5;
  let title = "Fundamentos";
  let objective = "Objetivo anterior.";
  let plan = {
    ...authoringPlanFixture(),
    plan: { ...authoringPlanFixture().plan, objective }
  };
  const locationValue = {
    pathname: "/",
    search: "",
    hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title,
          goal: objective,
          revision,
          ownership: "owned",
          canEdit: true
        };
      },
      async loadAuthoringPlan() {
        return structuredClone(plan);
      },
      async mutateAuthoringPlan(value) {
        calls.push(structuredClone(value));
        if (confirmations.has(value.requestId)) return;
        revision = 6;
        title = value.title;
        objective = value.objective;
        plan = {
          ...plan,
          courseRevision: revision,
          plan: {
            ...plan.plan,
            version: plan.plan.version + 1,
            title,
            objective,
            audience: value.audience,
            scope: value.scope,
            preferredPartCount: value.preferredPartCount
          }
        };
        confirmations.set(value.requestId, true);
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
        return { dataset: { courseAuthoringAction: "open-planning-edit" } };
      }
    }
  });
  const submit = {
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-planning]"; },
      elements: {
        title: { value: "Fundamentos revisados" },
        objective: { value: "Novo objetivo." },
        audience: { value: "Público." },
        scope: { value: "Escopo." },
        rangeMinimum: { value: "7" },
        rangeMaximum: { value: "12" },
        rangeOrigin: { value: "author" }
      }
    }
  };

  root.listeners.get("submit")(submit);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedCourseRevision, 5);
  assert.equal(calls[0].expectedPlanVersion, 3);
  assert.match(root.innerHTML, /confirmar a mesma operação/u);
  assert.match(root.innerHTML, /data-course-authoring-planning/u);
  root.listeners.get("click")({
    preventDefault() {},
    target: { closest: () => ({ dataset: { courseAuthoringAction: "show-list" } }) }
  });
  assert.equal(
    locationValue.hash,
    buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
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
  assert.equal(calls[1].expectedCourseRevision, 5);
  assert.equal(calls[1].expectedPlanVersion, 3);
  assert.equal(confirmations.size, 1);
  assert.match(root.innerHTML, /Planejamento salvo/u);
  assert.doesNotMatch(root.innerHTML, /data-course-authoring-planning/u);
});

test("planejamento preserva formulário e envelope até concluir a releitura confirmada", async () => {
  const root = new FakeRoot();
  let revision = 5;
  let mutationCalls = 0;
  let planReads = 0;
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
      async loadAuthoringPlan() {
        planReads += 1;
        if (planReads > 1) return reread;
        return authoringPlanFixture();
      },
      async mutateAuthoringPlan() {
        mutationCalls += 1;
        revision = 6;
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
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest: () => ({ dataset: { courseAuthoringAction: "open-planning-edit" } })
    }
  });
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches: (selector) => selector === "[data-course-authoring-planning]",
      elements: {
        title: { value: "Fundamentos revisados" },
        objective: { value: "Novo objetivo." },
        audience: { value: "Público." },
        scope: { value: "Escopo." },
        rangeMinimum: { value: "7" },
        rangeMaximum: { value: "12" },
        rangeOrigin: { value: "author" }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(mutationCalls, 1);
  assert.match(root.innerHTML, /data-course-authoring-planning/u);
  assert.equal(surface.close(), "deferred", "O envelope só pode ser limpo após a releitura.");
  rejectReread(new TypeError("Falha ao reler o planejamento"));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(mutationCalls, 1);
  assert.match(root.innerHTML, /gravação foi confirmada, mas a tela pode estar desatualizada/u);
  assert.doesNotMatch(root.innerHTML, /confirmar a mesma operação/u);
  assert.doesNotMatch(root.innerHTML, /data-course-authoring-planning/u);
  assert.equal(surface.close(), true);
});

test("Partes oferecem operações explícitas e preservam a hierarquia didática nos vínculos", async () => {
  const root = new FakeRoot();
  const calls = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async mutateAuthoringPlan(value) {
        calls.push(structuredClone(value));
      }
    }),
    locationValue: {
      pathname: "/app",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });
  await surface.open();

  for (const action of [
    "add-part", "edit-part", "move-part-down", "split-part", "join-parts",
    "remove-part", "edit-part-link", "materialize-part"
  ]) {
    assert.match(root.innerHTML, new RegExp(`data-course-authoring-action="${action}"`, "u"));
  }

  root.listeners.get("click")({
    target: {
      closest() { return { dataset: { courseAuthoringAction: "add-part" } }; }
    }
  });
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-part]"; },
      elements: {
        partId: { value: "" },
        title: { value: "Síntese" },
        intent: { value: "Consolidar o que foi produzido." }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[0].operation, "add_part");
  assert.equal(calls[0].position, 2);
  assert.match(calls[0].id, /^[0-9a-f-]{36}$/u);
  assert.equal(calls[0].expectedCourseRevision, 5);
  assert.equal(calls[0].expectedPlanVersion, 3);

  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: { courseAuthoringAction: "edit-part", partId: PART_ID }
        };
      }
    }
  });
  assert.match(
    root.innerHTML,
    new RegExp(`name="partId" value="${PART_ID}"`, "u")
  );
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-part]"; },
      elements: {
        partId: { value: PART_ID },
        title: { value: "Relações essenciais" },
        intent: { value: "Materializar relações essenciais." }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual({
    operation: calls[1].operation,
    id: calls[1].id,
    title: calls[1].title,
    intent: calls[1].intent
  }, {
    operation: "update_part",
    id: PART_ID,
    title: "Relações essenciais",
    intent: "Materializar relações essenciais."
  });

  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "split-part",
            partId: PART_ID,
            afterMicrosequenceId: "micro-a"
          }
        };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[2].operation, "split_part");
  assert.equal(calls[2].partId, PART_ID);
  assert.match(calls[2].newPartId, /^[0-9a-f-]{36}$/u);
  assert.equal(calls[2].newPartPosition, 1);
  assert.equal(calls[2].title, "Relações iniciais: continuação");
  assert.equal(calls[2].intent, "Materializar exemplos fundamentais.");
  assert.deepEqual(calls[2].microsequenceIds, ["micro-b"]);

  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "join-parts",
            partId: SECOND_PART_ID,
            previousPartId: PART_ID
          }
        };
      }
    }
  });
  assert.equal(calls.length, 3, "A união não deve alterar o Curso antes da confirmação local.");
  assert.match(root.innerHTML, /role="alertdialog"[\s\S]*Unir Partes\?/u);
  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "confirm-part-confirmation",
            partId: SECOND_PART_ID
          }
        };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual({
    operation: calls[3].operation,
    sourcePartId: calls[3].sourcePartId,
    targetPartId: calls[3].targetPartId
  }, {
    operation: "join_parts",
    sourcePartId: SECOND_PART_ID,
    targetPartId: PART_ID
  });

  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "edit-part-link",
            partId: PART_ID,
            microsequenceId: "micro-a"
          }
        };
      }
    }
  });
  assert.match(root.innerHTML, /data-course-authoring-link/u);
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-link]"; },
      elements: {
        microsequenceId: { value: "micro-a" },
        partId: { value: SECOND_PART_ID }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual({
    operation: calls[4].operation,
    microsequenceId: calls[4].microsequenceId,
    partId: calls[4].partId
  }, {
    operation: "move_microsequence",
    microsequenceId: "micro-a",
    partId: SECOND_PART_ID
  });
});

test("atribui microssequência existente por escolha legível somente quando solicitado", async () => {
  const root = new FakeRoot();
  const calls = [];
  let outlineReads = 0;
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async loadAuthoringOutline(courseId) {
        outlineReads += 1;
        const value = structuredClone(outlineFixture(courseId));
        value.counts.microsequenceCount = 2;
        value.outline.modules[0].lessons[0].microsequences.push({
          id: "micro-c",
          title: "Terceiro caso",
          studyUnitCount: 0
        });
        return value;
      },
      async mutateAuthoringPlan(value) {
        calls.push(structuredClone(value));
      }
    }),
    locationValue: {
      pathname: "/app",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });
  await surface.open();
  assert.equal(outlineReads, 0);

  root.listeners.get("click")({
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-microsequence-assignment" } };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(outlineReads, 1);
  assert.match(root.innerHTML, /Base · Relações · Terceiro caso/u);
  assert.doesNotMatch(root.innerHTML, /value="micro-a"/u);

  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) {
        return selector === "[data-course-authoring-assignment]";
      },
      elements: {
        microsequenceId: { value: "micro-c" },
        partId: { value: SECOND_PART_ID }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual({
    operation: calls[0].operation,
    microsequenceId: calls[0].microsequenceId,
    partId: calls[0].partId,
    expectedCourseRevision: calls[0].expectedCourseRevision,
    expectedPlanVersion: calls[0].expectedPlanVersion
  }, {
    operation: "assign_microsequence",
    microsequenceId: "micro-c",
    partId: SECOND_PART_ID,
    expectedCourseRevision: 5,
    expectedPlanVersion: 3
  });
});

test("pedido de materialização entrega texto natural e deep link sem fingir execução", async () => {
  const root = new FakeRoot();
  const deliveries = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async requestPartMaterialization(value) {
        deliveries.push(structuredClone(value));
        return { delivery: "clipboard" };
      }
    }),
    locationValue: {
      origin: "https://example.test",
      pathname: "/app",
      search: "?theme=dark",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });
  await surface.open();
  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: { courseAuthoringAction: "materialize-part", partId: PART_ID }
        };
      }
    }
  });
  assert.equal(deliveries.length, 0, "Abrir o compositor não deve copiar nem alterar o Curso.");
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-chat-form]"; },
      elements: {
        action: { value: "materialize_authoring_part" },
        instruction: {
          value: "Materialize esta Parte e registre somente o que for confirmado no AraLearn."
        }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(deliveries.length, 1);
  assert.match(deliveries[0].requestId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual(Object.keys(deliveries[0]).sort(), ["requestId", "requestText"]);
  assert.match(deliveries[0].requestText, new RegExp(COURSE_ID, "u"));
  assert.match(deliveries[0].requestText, /Revisão observada ao copiar: 5/u);
  assert.match(
    deliveries[0].requestText,
    new RegExp(
      `https://example\\.test/app\\?theme=dark${buildCourseAuthoringRoute(COURSE_ID, {
        section: "planning",
        authoringPartId: PART_ID
      }).replaceAll("?", "\\?")}`,
      "u"
    )
  );
  assert.match(deliveries[0].requestText, /Relações iniciais/u);
  assert.match(
    deliveries[0].requestText,
    /Materialize esta Parte e registre somente o que for confirmado no AraLearn/u
  );
  assert.match(deliveries[0].requestText, /Limite a produção à Parte identificada/u);
  assert.doesNotMatch(deliveries[0].requestText, /fila|já materializ/iu);
  assert.doesNotMatch(root.innerHTML, /Parte materializada/u);
});

test("estrutura vazia oferece preparo no ChatGPT e impede pedido de materialização impossível", async () => {
  const root = new FakeRoot();
  const deliveries = [];
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
  emptyPlan.recentActivity = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async loadAuthoringPlan() {
        return emptyPlan;
      },
      async requestPartMaterialization(value) {
        deliveries.push(structuredClone(value));
        return { delivery: "clipboard" };
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

  assert.match(root.innerHTML, /Prepare a estrutura/u);
  assert.match(root.innerHTML, /data-course-authoring-action="prepare-structure"/u);
  assert.doesNotMatch(root.innerHTML, /data-course-authoring-action="materialize-part"/u);
  root.listeners.get("click")({
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "materialize-part", partId: SECOND_PART_ID } };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deliveries.length, 0);

  root.listeners.get("click")({
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "prepare-structure", partId: SECOND_PART_ID } };
      }
    }
  });
  assert.equal(deliveries.length, 0, "Abrir o compositor não deve copiar o pedido automaticamente.");
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-chat-form]"; },
      elements: {
        action: { value: "prepare_structure" },
        instruction: { value: "Prepare a estrutura mínima e vincule-a ao planejamento persistido." }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deliveries.length, 1);
  assert.match(deliveries[0].requestText, /Ação: preparar a estrutura/u);
  assert.match(deliveries[0].requestText, /Vincule as Microssequências às Partes/u);
  assert.match(deliveries[0].requestText, /Não invente conteúdo ou fatos/u);
  assert.doesNotMatch(deliveries[0].requestText, /Ação: materializar a Parte/u);
});

test("Módulo copia pedido contextual com escopo, caminho e retorno canônico", async () => {
  const root = new FakeRoot();
  const deliveries = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async requestPartMaterialization(value) {
        deliveries.push(structuredClone(value));
        return { delivery: "clipboard" };
      }
    }),
    locationValue: {
      origin: "https://example.test",
      pathname: "/app",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "content" })
    },
    windowValue: new FakeWindow()
  });
  await surface.open();
  assert.match(root.innerHTML, /data-course-inspection-host/u);

  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "context-chat",
            targetKind: "module",
            targetId: "module-a",
            targetLabel: "Base",
            targetPath: "Base"
          }
        };
      }
    }
  });
  assert.equal(deliveries.length, 0, "Abrir o compositor deve preservar o painel ativo.");
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-chat-form]"; },
      elements: {
        action: { value: "review" },
        instruction: {
          value: "Revise este Módulo e discuta comigo antes de propor qualquer alteração."
        }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(deliveries.length, 1);
  assert.match(deliveries[0].requestText, /Ação: revisar/u);
  assert.match(deliveries[0].requestText, /Alvo: Módulo “Base”, identidade module-a/u);
  assert.match(deliveries[0].requestText, /Caminho: Base/u);
  assert.match(
    deliveries[0].requestText,
    /section=content&moduleId=module-a/u
  );
  assert.match(deliveries[0].requestText, /discuta comigo antes de propor qualquer alteração/iu);
});

test("itens estáveis do plano são editados por nome acadêmico e versão, nunca como JSON", async () => {
  const root = new FakeRoot();
  const calls = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async mutateAuthoringPlan(value) {
        calls.push(structuredClone(value));
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
  assert.match(root.innerHTML, /Resultados de aprendizagem/u);
  assert.match(root.innerHTML, /Unidades de análise instrucional/u);
  assert.match(root.innerHTML, /Requisitos de evidência/u);

  root.listeners.get("click")({
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "edit-plan-item",
            planList: "intendedLearningOutcomes",
            itemId: OUTCOME_ID
          }
        };
      }
    }
  });
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-plan-item]"; },
      elements: {
        id: { value: OUTCOME_ID },
        listName: { value: "intendedLearningOutcomes" },
        statement: { value: "Comparar e justificar relações essenciais." }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual({ ...calls[0], requestId: "<uuid>" }, {
    requestId: "<uuid>",
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    expectedPlanVersion: 3,
    operation: "update_plan_item",
    kind: "intended_learning_outcome",
    id: OUTCOME_ID,
    statement: "Comparar e justificar relações essenciais."
  });
  assert.doesNotMatch(root.innerHTML, /authoringState|JSON|brief/iu);
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
  assert.match(root.innerHTML, /Pessoa proprietária/u);
  assert.match(root.innerHTML, /Acesso direto ao Estudo/u);
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

test("Conteúdo deriva a hierarquia leve sem carregar outra composição", async () => {
  const root = new FakeRoot();
  const calls = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async loadAuthoringOutline(courseId) {
        calls.push(["outline", courseId]);
        return outlineFixture(courseId);
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
  assert.deepEqual(calls, [["outline", COURSE_ID]]);
  assert.match(root.innerHTML, /data-course-inspection-host/u);
  assert.match(root.innerHTML, /Base/u);
  assert.match(root.innerHTML, /Relações/u);
  assert.doesNotMatch(root.innerHTML, /course-authoring-outline|Estrutura técnica/u);
});

test("back interno retorna da tarefa à Visão geral e então à lista", async () => {
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
  assert.equal(locationValue.hash, buildCourseAuthoringRoute(COURSE_ID, { section: "overview" }));
  assert.match(root.innerHTML, /<h1>Visão geral<\/h1>/u);
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
  assert.match(
    css,
    /\.course-authoring-chat-composer \{[\s\S]*?height: min\(620px, calc\([\s\S]*?100dvh - max\(12px, var\(--safe-top\)\) - max\(12px, var\(--safe-bottom-tappable\)\)[\s\S]*?\)\);[\s\S]*?grid-template-rows: auto auto minmax\(0, 1fr\);[\s\S]*?overflow: hidden;/u
  );
  assert.match(
    css,
    /\.course-authoring-chat-composer form \{[\s\S]*?overflow-y: auto;[\s\S]*?scrollbar-gutter: stable;/u
  );
  assert.match(css, /@media \(max-width: 380px\)/u);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.course-authoring-task-menu > nav \{[\s\S]*?width: min\(82vw, 320px\)/u);
  assert.match(
    css,
    /\.course-authoring-course-header \{[\s\S]*?grid-template-columns: var\(--tap\) minmax\(0, 1fr\) var\(--tap\)/u
  );
  assert.match(
    css,
    /\.course-authoring-course-heading \.course-authoring-eyebrow \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/u
  );
  assert.match(
    css,
    /\.course-authoring-course-heading h1 \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/u
  );
  assert.match(
    css,
    /\.course-authoring-course-heading \.course-authoring-meta \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/u
  );
  assert.doesNotMatch(css, /-webkit-line-clamp: 4/u);
  assert.doesNotMatch(css, /\.course-authoring-sections\.has-standard/u);
  assert.match(css, /min-height: var\(--tap\)/u);
  assert.doesNotMatch(css, /width: min\(100%, (?:560|620|720|760|820|1180)px\)/u);
  assert.doesNotMatch(css, /@media \(min-width: (?:640|680|900)px\)/u);
  assert.doesNotMatch(css, /course-authoring-sidebar-navigation/u);
  assert.doesNotMatch(css, /course-authoring-(?:sections|primary-navigation|area-menu)/u);
  assert.doesNotMatch(
    surfaceSource,
    /globalThis\.confirm|confirmValue/u,
    "A Autoria deve usar confirmações próprias, com foco e contexto preservados."
  );
});

test("Visão geral revela as sete tarefas humanas em um único nível", () => {
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
    section: "overview",
    course,
    knownCourse: course,
    loading: false,
    failure: null,
    sourceTarget: null
  });

  assert.match(markup, /<h1>Visão geral<\/h1>/u);
  assert.match(markup, /Curso próprio/u);
  assert.equal((markup.match(/Compreender relações essenciais\./gu) || []).length, 1);
  assert.match(markup, /data-course-authoring-task-list/u);
  assert.equal((markup.match(/class="course-authoring-task-card"/gu) || []).length, 7);
  assert.doesNotMatch(markup, /class="course-authoring-sections"|course-authoring-primary-navigation/u);
  assert.doesNotMatch(markup, /course-authoring-sidebar-navigation/u);
  for (const label of [
    "Planejamento", "Conteúdo", "Parâmetros e componentes", "Fontes", "Revisão",
    "Variantes e pesquisa", "Pessoas e acesso"
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
