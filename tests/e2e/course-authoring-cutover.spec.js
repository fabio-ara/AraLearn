import { expect, test } from "@playwright/test";

const COURSE_IDS = Object.freeze([
  "10000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003"
]);
const CREATED_COURSE_ID = "40000000-0000-4000-8000-000000000004";
const OWNER_ID = "50000000-0000-4000-8000-000000000005";
const STUDENT_ID = "60000000-0000-4000-8000-000000000006";

function captureClientErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function expectNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => {
    const surface = document.querySelector(".course-authoring-surface");
    const frame = document.querySelector(".course-authoring-frame");
    if (!surface || !frame) return null;
    const surfaceRect = surface.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      document: document.documentElement.scrollWidth <= window.innerWidth + 1,
      surface: surface.scrollWidth <= surface.clientWidth + 1,
      frame: frame.scrollWidth <= frame.clientWidth + 1,
      insideViewport: surfaceRect.left >= -1 && surfaceRect.right <= window.innerWidth + 1,
      frameWidth: Math.round(frameRect.width)
    };
  })).toMatchObject({
    document: true,
    surface: true,
    frame: true,
    insideViewport: true
  });
  const frameWidth = await page.locator(".course-authoring-frame").evaluate(
    (element) => element.getBoundingClientRect().width
  );
  const section = await page.locator(".course-authoring-surface").getAttribute("data-section");
  const maximum = section === "inspection"
    ? page.viewportSize().width
    : section === "parameters" ? 720.5 : 430.5;
  expect(frameWidth).toBeLessThanOrEqual(maximum);
}

async function mountCourseAuthoring(page, {
  cardinality = "many",
  hash = ""
} = {}) {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto(hash ? `/${hash}` : "/");
  await page.evaluate(async ({
    requestedCardinality,
    courseIds,
    createdCourseId,
    ownerId,
    studentId
  }) => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    root.id = "course-authoring-root";
    document.body.append(root);

    const { createCourseAuthoringSurface } = await import(
      "/src/ui/CourseAuthoringSurface.js"
    );

    const definitions = [{
      courseId: courseIds[0],
      title: "Fundamentos de relações",
      goal: "Compreender relações essenciais por meio de exemplos graduais.",
      revision: 5,
      plan: {
        id: "71000000-0000-4000-8000-000000000011",
        version: 3,
        audience: "Pessoas iniciantes.",
        scope: "Relações e evidências.",
        preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
        intendedLearningOutcomes: [],
        instructionalAnalysisUnits: [{
          id: "79000000-0000-4000-8000-000000000019",
          position: 0,
          statement: "Relação entre nomes e endereços.",
          version: 1
        }],
        evidenceRequirements: [{
          id: "7a000000-0000-4000-8000-00000000001a",
          position: 0,
          statement: "Explicar um caso novo de resolução.",
          version: 1
        }],
        parts: [{
          id: "70000000-0000-4000-8000-000000000007",
          title: "Relações iniciais",
          intent: "Materializar a comparação orientada.",
          version: 1,
          position: 0,
          microsequences: [{
            id: "microsequence-a",
            productionPosition: 0,
            title: "Comparação orientada",
            curriculumPath: {
              moduleId: "module-a",
              moduleTitle: "Base conceitual",
              lessonId: "lesson-a",
              lessonTitle: "Relações e evidências"
            },
            studyUnitCount: 2
          }],
          progress: {
            state: "materializing",
            microsequenceCount: 1,
            studyUnitCount: 2,
            lastMaterialization: {
              id: "75000000-0000-4000-8000-000000000015",
              status: "running",
              version: 2,
              completedStepCount: 1,
              failedStepCount: 0,
              totalStepCount: 2,
              startedAt: "2026-08-17T12:00:00.000Z",
              updatedAt: "2026-08-17T12:02:00.000Z",
              completedAt: null
            }
          }
        }],
        counts: {
          intendedLearningOutcomeCount: 0,
          instructionalAnalysisUnitCount: 1,
          evidenceRequirementCount: 1,
          authoringPartCount: 1,
          linkedDidacticMicrosequenceCount: 1,
          studyUnitCount: 2
        },
        updatedAt: "2026-08-17T12:00:00.000Z"
      }
    }, {
      courseId: courseIds[1],
      title: "Aplicações comparadas",
      goal: "Aplicar os conceitos em situações contrastantes.",
      revision: 2,
      plan: {
        id: "72000000-0000-4000-8000-000000000012",
        version: 1,
        audience: null,
        scope: null,
        preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
        intendedLearningOutcomes: [],
        instructionalAnalysisUnits: [],
        evidenceRequirements: [],
        parts: [],
        counts: {
          intendedLearningOutcomeCount: 0,
          instructionalAnalysisUnitCount: 0,
          evidenceRequirementCount: 0,
          authoringPartCount: 0,
          linkedDidacticMicrosequenceCount: 0,
          studyUnitCount: 0
        },
        updatedAt: "2026-08-17T12:00:00.000Z"
      }
    }, {
      courseId: courseIds[2],
      title: "Leitura crítica de dados",
      goal: "Interpretar evidências com cautela.",
      revision: 3,
      plan: {
        id: "73000000-0000-4000-8000-000000000013",
        version: 1,
        audience: null,
        scope: null,
        preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
        intendedLearningOutcomes: [],
        instructionalAnalysisUnits: [],
        evidenceRequirements: [],
        parts: [],
        counts: {
          intendedLearningOutcomeCount: 0,
          instructionalAnalysisUnitCount: 0,
          evidenceRequirementCount: 0,
          authoringPartCount: 0,
          linkedDidacticMicrosequenceCount: 0,
          studyUnitCount: 0
        },
        updatedAt: "2026-08-17T12:00:00.000Z"
      }
    }];
    const count = requestedCardinality === "zero" ? 0 :
      requestedCardinality === "one" ? 1 : definitions.length;
    const courses = definitions.slice(0, count);
    const outlineFor = (courseId) => {
      const detail = courseDetail(courseId);
      return {
        contract: "aralearn.course.v1",
        ...detail,
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T12:00:00.000Z",
        outline: {
          courseId,
          title: detail.title,
          goal: detail.goal,
          modules: [{
            id: "module-a",
            title: "Base conceitual",
            lessons: [{
              id: "lesson-a",
              title: "Relações e evidências",
              topics: [],
              microsequences: [{
                id: "microsequence-a",
                title: "Comparação orientada",
                goal: "Comparar duas relações sem confundir associação e causa.",
                studyUnitCount: 60
              }]
            }]
          }]
        },
        deepLink: `#/authoring/courses/${courseId}?section=structure`
      };
    };
    const studyUnits = Array.from({ length: 60 }, (_, index) => {
      const ordinal = index + 1;
      const diagram = ordinal === 1 ? [{
        id: "set-diagram-1",
        package: "aralearn.resource.set_diagram",
        version: "1.0.0",
        data: {
          prompt: "Compare os conjuntos.",
          kind: "venn",
          sets: [{ id: "a", symbol: "A", label: "Grupo A" },
            { id: "b", symbol: "B", label: "Grupo B" }],
          regions: [{ id: "a-only", setIds: ["a"], items: ["x"] },
            { id: "both", setIds: ["a", "b"], items: ["y"] }]
        }
      }] : [{
        id: `paragraph-${ordinal}`,
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: `Conteúdo curricular da Unidade ${ordinal}.` }
      }];
      const practice = ordinal === 1;
      return {
        id: `study-unit-${String(ordinal).padStart(2, "0")}`,
        position: ordinal,
        title: ordinal === 1 ? "Exemplo guiado com diagrama" : `Unidade curricular ${ordinal}`,
        role: practice ? "practice" : "theory",
        content: diagram,
        response: practice ? {
          id: "choice-1",
          package: "aralearn.response.choice",
          version: "1.0.0",
          data: {
            question: "Qual elemento pertence aos dois conjuntos?",
            selectionMode: "single",
            selectionCriterion: "correct",
            options: [{ id: "x", kind: "text", text: "x" },
              { id: "y", kind: "text", text: "y" }],
            answerIds: ["y"]
          }
        } : null,
        feedback: [],
        topics: [],
        sources: []
      };
    });
    const probe = {
      listReads: 0,
      headerReads: 0,
      outlineReads: 0,
      inspectionReads: [],
      positionLoads: 0,
      positionSaves: [],
      peopleReads: 0,
      planReads: 0,
      designReads: [],
      designMutations: [],
      materializationReads: [],
      createCalls: [],
      planMutations: [],
      materializationRequests: [],
      closeCalls: 0
    };
    const counts = {
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 0,
      microsequenceCount: 1,
      studyUnitCount: 60
    };
    const courseDetail = (courseId) => {
      const course = courses.find((item) => item.courseId === courseId);
      if (!course) {
        const error = new Error("Curso ausente");
        error.status = 404;
        throw error;
      }
      return {
        courseId: course.courseId,
        title: course.title,
        goal: course.goal,
        revision: course.revision,
        ownership: "owned",
        canEdit: true,
        counts
      };
    };
    const designDefinitions = [{
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
      operationalization: "Usa identidades e fatos persistidos pela materialização.",
      limitations: "O registro não prova qualidade nem aprendizagem.",
      defaultStatus: "product_hypothesis",
      evidenceRefs: ["https://doi.org/10.1111/j.1467-9280.2006.01693.x"],
      supportedScopes: ["course", "lesson", "didactic_microsequence"]
    }));
    const componentOptions = Array.from({ length: 32 }, (_, index) => ({
      ref: `aralearn.resource.component_${String(index + 1).padStart(2, "0")}@1.0.0`,
      label: `Componente ${index + 1}`,
      purpose: `Finalidade acadêmica ${index + 1}.`
    }));
    const moduleScopes = [
      { kind: "module", ref: "module-a", label: "Base conceitual", position: 0 },
      ...Array.from({ length: 54 }, (_, index) => ({
        kind: "module",
        ref: `module-${String(index + 2).padStart(2, "0")}`,
        label: `Módulo adicional ${index + 2}`,
        position: index + 1
      }))
    ];
    let designChangeId = 20;
    let interpretationSequence = 20;
    const designState = new Map();
    const scopeKey = (scope) => `${scope.kind}:${scope.ref}`;
    const scopeFromKey = (value) => {
      const separator = value.indexOf(":");
      return { kind: value.slice(0, separator), ref: value.slice(separator + 1) };
    };
    const ensureDesignState = (courseId) => {
      if (!designState.has(courseId)) {
        const initialGuidanceId = courseId === courseIds[0]
          ? "81000000-0000-4000-8000-000000000018"
          : crypto.randomUUID();
        designState.set(courseId, {
          parameterAssignments: new Map(),
          guidance: new Map([[
            `course:${courseId}`,
            {
              revisionId: initialGuidanceId,
              guidance: "Explique cada termo antes de depender dele.",
              origin: "author",
              reason: "Evitar pressupostos ocultos."
            }
          ]]),
          interpretations: new Map([[
            initialGuidanceId,
            {
              interpretationId: "11",
              guidanceRevisionId: initialGuidanceId,
              interpretation: {
                summary: "Definir os termos antes do uso.",
                directives: [{ kind: "require", statement: "Definir todo termo novo." }],
                divergences: [],
                questions: ["Qual exemplo deve abrir a explicação?"]
              },
              createdAt: "2026-08-17T12:00:00.000Z"
            }
          ]]),
          policies: new Map(),
          targetPlanItems: new Map([["microsequence-a", {
            instructionalAnalysisUnitIds: ["79000000-0000-4000-8000-000000000019"],
            evidenceRequirementIds: []
          }]])
        });
      }
      return designState.get(courseId);
    };
    const scopeDescriptor = (courseId, scope) => {
      const course = courseDetail(courseId);
      if (scope.kind === "course") return { kind: "course", ref: courseId, label: course.title };
      if (scope.kind === "module") {
        const found = moduleScopes.find((item) => item.ref === scope.ref);
        if (!found) throw new Error("Módulo ausente");
        return { kind: found.kind, ref: found.ref, label: found.label };
      }
      if (scope.kind === "lesson") {
        const label = scope.ref === "lesson-a" ? "Relações e evidências" : `Lição ${scope.ref}`;
        return { kind: "lesson", ref: scope.ref, label };
      }
      if (scope.kind === "didactic_microsequence") {
        const label = scope.ref === "microsequence-a" ? "Comparação orientada" : `Microssequência ${scope.ref}`;
        return { kind: "didactic_microsequence", ref: scope.ref, label };
      }
      throw new Error("Escopo ausente");
    };
    const scopePath = (courseId, scope) => {
      const courseScope = scopeDescriptor(courseId, { kind: "course", ref: courseId });
      if (scope.kind === "course") return [courseScope];
      const moduleRef = scope.kind === "module" ? scope.ref : "module-a";
      const moduleScope = scopeDescriptor(courseId, { kind: "module", ref: moduleRef });
      if (scope.kind === "module") return [courseScope, moduleScope];
      const lessonRef = scope.kind === "lesson" ? scope.ref : "lesson-a";
      const lessonScope = scopeDescriptor(courseId, { kind: "lesson", ref: lessonRef });
      if (scope.kind === "lesson") return [courseScope, moduleScope, lessonScope];
      return [courseScope, moduleScope, lessonScope, scopeDescriptor(courseId, scope)];
    };
    const immediateChildren = (courseId, scope) => {
      if (scope.kind === "course") return moduleScopes;
      if (scope.kind === "module") return [{
        kind: "lesson",
        ref: scope.ref === "module-a" ? "lesson-a" : `lesson-${scope.ref}`,
        label: scope.ref === "module-a" ? "Relações e evidências" : `Lição de ${scope.ref}`,
        position: 0
      }];
      if (scope.kind === "lesson") return [{
        kind: "didactic_microsequence",
        ref: scope.ref === "lesson-a" ? "microsequence-a" : `micro-${scope.ref}`,
        label: scope.ref === "lesson-a" ? "Comparação orientada" : `Microssequência de ${scope.ref}`,
        position: 0
      }];
      return [];
    };
    const buildCourseDesign = (courseId, { scope, limit = 32, cursor = null }) => {
      const course = courseDetail(courseId);
      const store = ensureDesignState(courseId);
      const path = scopePath(courseId, scope);
      const current = path.at(-1);
      const allChildren = immediateChildren(courseId, scope);
      const cursorIndex = cursor == null ? -1 : allChildren.findIndex((item) => item.ref === cursor);
      const start = cursorIndex + 1;
      const children = allChildren.slice(start, start + limit);
      const hasMoreChildren = start + children.length < allChildren.length;
      const parameterAt = (candidate, parameterId) =>
        store.parameterAssignments.get(scopeKey(candidate))?.get(parameterId) || null;
      const parameters = designDefinitions.map((definition) => {
        const localAssignment = parameterAt(current, definition.id);
        const explicit = [...path].reverse().map((candidate) => ({
          assignment: parameterAt(candidate, definition.id),
          scope: candidate
        })).find(({ assignment }) => assignment && assignment.origin !== "automatic");
        const automatic = [...path].reverse().map((candidate) => ({
          assignment: parameterAt(candidate, definition.id),
          scope: candidate
        })).find(({ assignment }) => assignment?.origin === "automatic");
        const selected = explicit || automatic || null;
        return {
          parameterId: definition.id,
          localAssignment: localAssignment ? structuredClone(localAssignment) : null,
          effectiveAssignment: selected ? {
            ...structuredClone(selected.assignment),
            sourceScope: { kind: selected.scope.kind, ref: selected.scope.ref },
            inherited: scopeKey(selected.scope) !== scopeKey(current)
          } : {
            changeId: null,
            value: structuredClone(definition.defaultValue),
            origin: "system_default",
            reason: "Hipótese operacional inicial do produto.",
            sourceScope: null,
            inherited: false
          }
        };
      });
      const effectiveRevisions = path.map((candidate) => ({
        revision: store.guidance.get(scopeKey(candidate)),
        scope: candidate
      })).filter(({ revision }) => revision).map(({ revision, scope: source }) => ({
        ...structuredClone(revision),
        sourceScope: { kind: source.kind, ref: source.ref },
        currentInterpretation: structuredClone(store.interpretations.get(revision.revisionId) || null)
      }));
      const localPolicy = store.policies.get(scopeKey(current)) || null;
      const selectedPolicy = [...path].reverse().map((candidate) => ({
        change: store.policies.get(scopeKey(candidate)),
        scope: candidate
      })).find(({ change }) => change) || null;
      return {
        contract: "aralearn.course-design.v1",
        courseId,
        courseRevision: course.revision,
        parameterCatalogVersion: "1.0.0",
        scopeContext: {
          current,
          ancestors: path.slice(0, -1),
          children,
          childCount: allChildren.length,
          hasMoreChildren,
          nextChildCursor: hasMoreChildren ? children.at(-1).ref : null
        },
        definitions: structuredClone(designDefinitions),
        parameters,
        guidance: {
          localRevision: structuredClone(store.guidance.get(scopeKey(current)) || null),
          effectiveRevisions
        },
        componentCatalog: { version: "1-3e5629f8", options: structuredClone(componentOptions) },
        targetPlanItems: current.kind === "didactic_microsequence"
          ? structuredClone(store.targetPlanItems.get(current.ref) || {
              instructionalAnalysisUnitIds: [],
              evidenceRequirementIds: []
            })
          : null,
        componentPolicy: {
          localChange: structuredClone(localPolicy),
          effectiveChange: selectedPolicy ? {
            ...structuredClone(selectedPolicy.change),
            sourceScope: {
              kind: selectedPolicy.scope.kind,
              ref: selectedPolicy.scope.ref
            },
            inherited: scopeKey(selectedPolicy.scope) !== scopeKey(current)
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
          materializationId: "75000000-0000-4000-8000-000000000015",
          stepId: "76000000-0000-4000-8000-000000000016",
          didacticMicrosequenceId: "microsequence-a",
          recordedAt: "2026-08-17T12:10:00.000Z",
          contextHash: "c".repeat(64),
          studyUnitCount: 3,
          modeCounts: { expository: 1, practice: 1, mixed: 1 },
          introducedInstructionalAnalysisUnitIds: [
            "79000000-0000-4000-8000-000000000019"
          ],
          developedExplanationForms: ["plain_definition", "concrete_example"],
          practiceOpportunityCount: 2,
          variedDimensions: ["case_or_data"],
          componentRefs: [componentOptions[0].ref]
        }]
      };
    };
    let inspectionPosition = null;
    const controller = {
      async listCourses({ query = "" } = {}) {
        probe.listReads += 1;
        const normalizedQuery = String(query).trim().toLocaleLowerCase("pt-BR");
        const items = courses.filter((course) =>
          !normalizedQuery || course.title.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
        ).map((course) => ({
          ...courseDetail(course.courseId)
        }));
        return {
          contract: "aralearn.course-list.v1",
          items,
          hasMore: false,
          nextCursor: null
        };
      },
      async getCourse(courseId) {
        probe.headerReads += 1;
        return courseDetail(courseId);
      },
      async loadAuthoringOutline(courseId) {
        probe.outlineReads += 1;
        return outlineFor(courseId);
      },
      async loadAuthoringStudyUnits(courseId, options) {
        probe.inspectionReads.push(structuredClone(options));
        const detail = courseDetail(courseId);
        if (options.expectedRevision !== detail.revision) {
          const error = new Error("Revisão alterada");
          error.code = "course_revision_changed";
          throw error;
        }
        const source = courseId === courseIds[0] ? studyUnits : [];
        const anchorIndex = options.anchorStudyUnitId
          ? source.findIndex(({ id }) => id === options.anchorStudyUnitId)
          : -1;
        const cursorIndex = options.cursor
          ? source.findIndex(({ id }) => id === options.cursor.studyUnitId)
          : -1;
        if ((options.anchorStudyUnitId && anchorIndex < 0) ||
            (options.cursor && cursorIndex < 0)) {
          const error = new Error("Unidade ausente");
          error.status = 404;
          throw error;
        }
        let start;
        let selected;
        if (options.direction === "backward" && cursorIndex >= 0) {
          start = Math.max(0, cursorIndex - options.limit);
          selected = source.slice(start, cursorIndex);
        } else {
          start = cursorIndex >= 0 ? cursorIndex + 1 : Math.max(0, anchorIndex);
          selected = source.slice(start, start + options.limit);
        }
        const end = start + selected.length;
        const items = selected.map((studyUnit, index) => ({
          studyUnit: structuredClone(studyUnit),
          version: 1,
          updatedAt: "2026-08-17T12:00:00.000Z",
          ordinal: start + index + 1,
          curriculumPath: {
            module: { id: "module-a", position: 0, title: "Base conceitual" },
            lesson: { id: "lesson-a", position: 0, title: "Relações e evidências" },
            didacticMicrosequence: {
              id: "microsequence-a",
              position: 0,
              title: "Comparação orientada"
            }
          },
          authoringPart: {
            id: "70000000-0000-4000-8000-000000000007",
            position: 0,
            title: "Relações iniciais",
            state: "materialized"
          },
          deepLink: `#/authoring/courses/${courseId}?section=inspection&studyUnitId=${studyUnit.id}`
        }));
        return {
          contract: "aralearn.course-study-unit-inspection-page.v1",
          courseId,
          courseRevision: detail.revision,
          scope: structuredClone(options.scope),
          totalCount: source.length,
          scopeOptions: {
            authoringParts: [{
              id: "70000000-0000-4000-8000-000000000007",
              position: 0,
              title: "Relações iniciais",
              state: "materialized"
            }],
            unassignedStudyUnitCount: 0
          },
          items,
          hasPrevious: start > 0,
          hasMore: end < source.length,
          previousCursor: start > 0 && items.length
            ? { studyUnitId: items[0].studyUnit.id }
            : null,
          nextCursor: end < source.length && items.length
            ? { studyUnitId: items.at(-1).studyUnit.id }
            : null,
          pageBytes: 32_768
        };
      },
      async loadAuthoringInspectionPosition() {
        probe.positionLoads += 1;
        return inspectionPosition ? structuredClone(inspectionPosition) : null;
      },
      async saveAuthoringInspectionPosition(courseId, position) {
        probe.positionSaves.push({ courseId, ...structuredClone(position) });
        inspectionPosition = structuredClone(position);
      },
      async createCourse(value) {
        probe.createCalls.push(structuredClone(value));
        courses.push({
          courseId: createdCourseId,
          title: value.title,
          goal: value.objective,
          revision: 1,
          plan: {
            id: "74000000-0000-4000-8000-000000000014",
            version: 1,
            audience: null,
            scope: null,
            preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
            intendedLearningOutcomes: [],
            instructionalAnalysisUnits: [],
            evidenceRequirements: [],
            parts: [],
            counts: {
              intendedLearningOutcomeCount: 0,
              instructionalAnalysisUnitCount: 0,
              evidenceRequirementCount: 0,
              authoringPartCount: 0,
              linkedDidacticMicrosequenceCount: 0,
              studyUnitCount: 0
            },
            updatedAt: "2026-08-17T12:00:00.000Z"
          }
        });
        return { courseId: createdCourseId, revision: 1 };
      },
      async loadAuthoringPlan(courseId) {
        probe.planReads += 1;
        const course = courses.find((item) => item.courseId === courseId);
        if (!course) throw new Error("Curso ausente");
        return {
          contract: "aralearn.course-instructional-plan.v1",
          courseId,
          courseRevision: course.revision,
          plan: {
            ...structuredClone(course.plan),
            title: course.title,
            objective: course.goal
          },
          recentActivity: []
        };
      },
      async loadCourseDesign(courseId, options) {
        probe.designReads.push({ courseId, ...structuredClone(options) });
        return buildCourseDesign(courseId, options);
      },
      async mutateCourseDesign(request) {
        probe.designMutations.push(structuredClone(request));
        const course = courses.find((item) => item.courseId === request.courseId);
        if (!course) throw new Error("Curso ausente");
        if (request.expectedCourseRevision !== course.revision) {
          const error = new Error("Revisão alterada");
          error.code = "course_revision_changed";
          throw error;
        }
        const store = ensureDesignState(request.courseId);
        const command = request.command;
        const changeId = String(++designChangeId);
        let changeScope = command.scope ? structuredClone(command.scope) : null;
        if (command.type === "set_parameter") {
          const key = scopeKey(command.scope);
          const assignments = store.parameterAssignments.get(key) || new Map();
          assignments.set(command.parameterId, {
            changeId,
            value: structuredClone(command.value),
            origin: command.origin,
            reason: command.reason
          });
          store.parameterAssignments.set(key, assignments);
        } else if (command.type === "clear_parameter") {
          store.parameterAssignments.get(scopeKey(command.scope))?.delete(command.parameterId);
        } else if (command.type === "set_guidance") {
          store.guidance.set(scopeKey(command.scope), {
            revisionId: crypto.randomUUID(),
            guidance: command.guidance,
            origin: command.origin,
            reason: command.reason
          });
        } else if (command.type === "clear_guidance") {
          store.guidance.delete(scopeKey(command.scope));
        } else if (command.type === "interpret_guidance") {
          const knownRevision = [...store.guidance.entries()].find(([, revision]) =>
            revision.revisionId === command.guidanceRevisionId);
          if (!knownRevision) throw new Error("Orientação ausente");
          changeScope = scopeFromKey(knownRevision[0]);
          store.interpretations.set(command.guidanceRevisionId, {
            interpretationId: String(++interpretationSequence),
            guidanceRevisionId: command.guidanceRevisionId,
            interpretation: structuredClone(command.interpretation),
            createdAt: "2026-08-17T12:12:00.000Z"
          });
        } else if (command.type === "set_component_policy") {
          store.policies.set(scopeKey(command.scope), {
            changeId,
            policy: structuredClone(command.policy),
            origin: command.origin,
            reason: command.reason
          });
        } else if (command.type === "clear_component_policy") {
          store.policies.delete(scopeKey(command.scope));
        } else if (command.type === "set_target_plan_items") {
          store.targetPlanItems.set(command.scope.ref, {
            instructionalAnalysisUnitIds: structuredClone(
              command.instructionalAnalysisUnitIds
            ),
            evidenceRequirementIds: structuredClone(command.evidenceRequirementIds)
          });
        } else {
          throw new Error("Comando de desenho desconhecido");
        }
        course.revision += 1;
        return {
          contract: "aralearn.course-design-change.v1",
          courseId: request.courseId,
          courseRevision: course.revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: { changeId, type: command.type, scope: changeScope }
        };
      },
      async loadPartMaterialization(courseId, authoringPartId, materializationId) {
        probe.materializationReads.push({
          courseId,
          authoringPartId,
          materializationId
        });
        const steps = [{
          id: "76000000-0000-4000-8000-000000000016",
          position: 0,
          kind: "context_load",
          targetDidacticMicrosequenceId: null,
          productionPosition: null,
          status: "completed",
          version: 2,
          resultFacts: { loadedSources: 2 },
          updatedAt: "2026-08-17T12:01:00.000Z",
          completedAt: "2026-08-17T12:01:00.000Z"
        }, {
          id: "77000000-0000-4000-8000-000000000017",
          position: 1,
          kind: "validation",
          targetDidacticMicrosequenceId: null,
          productionPosition: null,
          status: "pending",
          version: 1,
          resultFacts: {},
          updatedAt: "2026-08-17T12:00:00.000Z",
          completedAt: null
        }];
        return {
          contract: "aralearn.course-authoring-part-materialization.v1",
          courseId,
          courseRevision: 5,
          authoringPartId,
          materialization: {
            id: materializationId,
            authoringPartVersion: 1,
            channel: "mcp",
            status: "running",
            version: 2,
            designContext: { focus: "Comparação orientada" },
            resultFacts: {},
            startedAt: "2026-08-17T12:00:00.000Z",
            updatedAt: "2026-08-17T12:02:00.000Z",
            completedAt: null,
            steps,
            nextPendingStep: steps[1]
          }
        };
      },
      async mutateAuthoringPlan(value) {
        probe.planMutations.push(structuredClone(value));
        const course = courses.find((item) => item.courseId === value.courseId);
        if (value.operation !== "update_plan") return;
        course.title = value.title;
        course.goal = value.objective;
        course.plan.audience = value.audience || null;
        course.plan.scope = value.scope || null;
        course.plan.preferredPartCount = structuredClone(value.preferredPartCount);
        course.plan.version += 1;
        course.plan.updatedAt = "2026-08-17T12:05:00.000Z";
        course.revision += 1;
      },
      async requestPartMaterialization(value) {
        probe.materializationRequests.push(structuredClone(value));
        return { delivery: "chat" };
      },
      async clearCourse() {},
      async listCourseAccess(courseId) {
        probe.peopleReads += 1;
        return {
          contract: "aralearn.course-people.v1",
          courseId,
          owner: {
            userId: ownerId,
            displayName: "Pessoa proprietária",
            avatarObjectKey: null
          },
          people: [{
            userId: studentId,
            displayName: "Pessoa estudante",
            avatarObjectKey: null,
            grantedAt: "2026-08-17T12:00:00.000Z"
          }]
        };
      },
      async grantCourseAccess() { return { changed: true }; },
      async revokeCourseAccess() { return { changed: true }; }
    };
    const authoringWindow = {
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
      requestAnimationFrame: window.requestAnimationFrame.bind(window),
      cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
      scrollBy: window.scrollBy.bind(window),
      matchMedia: window.matchMedia.bind(window),
      BroadcastChannel: window.BroadcastChannel
    };
    const surface = createCourseAuthoringSurface({
      root,
      controller,
      locationValue: window.location,
      historyValue: window.history,
      windowValue: authoringWindow,
      confirmValue: () => true,
      onClose() { probe.closeCalls += 1; }
    });
    globalThis.__courseAuthoringHarness = { surface, probe };
    await surface.open();
  }, {
    requestedCardinality: cardinality,
    courseIds: COURSE_IDS,
    createdCourseId: CREATED_COURSE_ID,
    ownerId: OWNER_ID,
    studentId: STUDENT_ID
  });
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
    "aria-busy",
    "false"
  );
}

test.describe("Autoria canônica mobile-first", () => {
  for (const width of [360, 390, 430, 1280]) {
    test(`lista de muitos Cursos permanece legível em ${width} px`, async ({ page }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
      await mountCourseAuthoring(page, { cardinality: "many" });

      await expect(page.getByRole("heading", { name: "Meus cursos" })).toBeVisible();
      await expect(page.locator(".course-authoring-course-list")).toHaveAttribute(
        "data-cardinality",
        "many"
      );
      await expect(page.locator(".course-authoring-course-card")).toHaveCount(3);
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: testInfo.outputPath(`course-authoring-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      expect(clientErrors).toEqual([]);
    });
  }

  for (const width of [360, 1280]) {
    test(`etapas retomáveis abrem sob demanda sem overflow em ${width} px`, async ({
      page
    }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
      const planningHash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
      await mountCourseAuthoring(page, { cardinality: "many", hash: planningHash });

      expect(await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.materializationReads)).toEqual([]);
      await page.getByRole("button", { name: "Ver etapas" }).click();
      await expect(page.getByText("Etapas da materialização", { exact: true })).toBeVisible();
      await expect(page.getByText("Próxima: etapa 2 · Validar produção", {
        exact: true
      })).toBeVisible();
      await expect(page.getByLabel("Etapas da materialização")
        .getByText("Comparação orientada", { exact: true })).toBeVisible();
      expect(await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.materializationReads)).toEqual([{
        courseId: COURSE_IDS[0],
        authoringPartId: "70000000-0000-4000-8000-000000000007",
        materializationId: "75000000-0000-4000-8000-000000000015"
      }]);
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: testInfo.outputPath(`course-authoring-materialization-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      expect(clientErrors).toEqual([]);
    });
  }


  for (const width of [360, 390, 430, 1280]) {
    test(`Parâmetros preserva controles progressivos sem overflow em ${width} px`, async ({
      page
    }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 820 : 900 });
      const parametersHash = `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`;
      await mountCourseAuthoring(page, { cardinality: "many", hash: parametersHash });

      await expect(page.getByRole("heading", { name: "Parâmetros", exact: true })).toBeVisible();
      await expect(page.locator(".course-design-parameter")).toHaveCount(4);
      await expect(page.locator(".course-design-component-option")).toHaveCount(32);
      await expect(page.getByText("Hipótese operacional do produto").first()).toBeVisible();
      await expect(page.getByText("Política de produção", { exact: true })).toBeVisible();
      await expect(page.getByText("Planejado × aplicado", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe)).toMatchObject({
        outlineReads: 0,
        planReads: 0,
        designReads: [{
          courseId: COURSE_IDS[0],
          scope: { kind: "course", ref: COURSE_IDS[0] },
          limit: 32,
          cursor: null
        }]
      });

      await page.screenshot({
        path: testInfo.outputPath(`course-parameters-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      expect(clientErrors).toEqual([]);
    });
  }
});

for (const width of [360, 390, 430, 1280]) {
  test(`Inspeção virtualiza 60 Unidades de estudo em ${width} px`, async ({ page }, testInfo) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
    const inspectionHash = `#/authoring/courses/${COURSE_IDS[0]}?section=inspection`;
    await mountCourseAuthoring(page, { cardinality: "many", hash: inspectionHash });

    await expect(page.getByRole("heading", { name: "Inspeção" })).toBeVisible();
    await expect(page.getByText("60 Unidades de estudo", { exact: true })).toBeVisible();
    await expect(page.locator(".course-inspection-sticky-context")).toBeVisible();
    await expect(page.getByLabel("Filtrar por Parte")).toHaveValue("course:");
    await expect(page.locator("[data-set-diagram-state=ready]")).toHaveCount(1);
    await expect(page.locator(
      '.package-instance[data-package="aralearn.response.choice"] button'
    ).first()).toBeDisabled();
    await expectNoHorizontalOverflow(page);

    for (let iteration = 0; iteration < 6; iteration += 1) {
      const before = await page.locator("[data-inspection-ordinal]").evaluateAll((items) =>
        Math.max(0, ...items.map((item) => Number(item.dataset.inspectionOrdinal))));
      const count = await page.locator("[data-inspection-study-unit]").count();
      expect(count).toBeLessThanOrEqual(36);
      if (before >= 60) break;
      const load = page.locator('[data-inspection-load="forward"]');
      await expect(load).toHaveCount(1);
      await load.click();
      await expect.poll(() => page.locator("[data-inspection-ordinal]").evaluateAll((items) =>
        Math.max(0, ...items.map((item) => Number(item.dataset.inspectionOrdinal))))
      ).toBeGreaterThan(before);
    }

    await expect(page.locator('[data-inspection-study-unit="study-unit-60"]')).toHaveCount(1);
    expect(await page.locator("[data-inspection-study-unit]").count()).toBeLessThanOrEqual(36);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`course-inspection-${width}.png`),
      animations: "disabled"
    });
    expect(clientErrors).toEqual([]);
  });
}

test("Parâmetros pagina 55 Módulos e permite descer até Lição sem carregar outline", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const parametersHash = `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: parametersHash });

  await expect(page.locator("#course-design-child-scope option")).toHaveCount(33);
  await page.getByRole("button", { name: "Carregar mais escopos" }).click();
  await expect(page.locator("#course-design-child-scope option")).toHaveCount(56);
  await page.getByLabel("Abrir módulo").selectOption("module-a");
  await page.getByRole("button", { name: "Abrir escopo" }).click();
  await expect(page.getByText("Módulo: Base conceitual", { exact: true })).toBeVisible();
  await expect(page.locator(".course-design-parameter")).toHaveCount(4);
  await page.getByText("Entender e ajustar", { exact: true }).first().click();
  await expect(page.getByText("Parâmetros pedagógicos não são definidos em Módulo", {
    exact: false
  }).first()).toBeVisible();
  await expect(page.locator("[data-course-design-parameter]")).toHaveCount(0);

  await page.getByLabel("Abrir lição").selectOption("lesson-a");
  await page.getByRole("button", { name: "Abrir escopo" }).click();
  await expect(page.getByText("Lição: Relações e evidências", { exact: true })).toBeVisible();
  await expect(page.locator("[data-course-design-parameter]")).toHaveCount(4);
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.outlineReads)).toBe(0);
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

for (const width of [360, 1280]) {
  test(`Microssequência atribui cobertura planejada sem JSON em ${width} px`, async ({ page }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width, height: width < 600 ? 820 : 900 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}` +
      "?section=parameters&didacticMicrosequenceId=microsequence-a";
    await mountCourseAuthoring(page, { cardinality: "many", hash });

    await expect(page.getByRole("heading", {
      name: "Cobertura planejada desta Microssequência"
    })).toBeVisible();
    const analysis = page.getByRole("checkbox", {
      name: "Relação entre nomes e endereços."
    });
    const evidence = page.getByRole("checkbox", {
      name: "Explicar um caso novo de resolução."
    });
    await expect(analysis).toBeChecked();
    await expect(evidence).not.toBeChecked();
    await analysis.uncheck();
    await evidence.check();
    await page.getByRole("button", { name: "Salvar cobertura" }).click();
    await expect(page.getByText(
      "Cobertura planejada salva para esta Microssequência."
    )).toBeVisible();

    const probe = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe);
    expect(probe.planReads).toBe(2);
    expect(probe.designMutations.at(-1)).toMatchObject({
      courseId: COURSE_IDS[0],
      expectedCourseRevision: 5,
      command: {
        type: "set_target_plan_items",
        scope: { kind: "didactic_microsequence", ref: "microsequence-a" },
        instructionalAnalysisUnitIds: [],
        evidenceRequirementIds: ["7a000000-0000-4000-8000-00000000001a"]
      }
    });
    await expectNoHorizontalOverflow(page);
    expect(clientErrors).toEqual([]);
  });
}

test("lista distingue zero e um Curso sem criar outra superfície", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await mountCourseAuthoring(page, { cardinality: "zero" });
  await expect(page.getByRole("heading", { name: "Nenhum Curso ainda" })).toBeVisible();
  await expect(page.locator(".course-authoring-course-card")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.reload();
  await mountCourseAuthoring(page, { cardinality: "one" });
  await expect(page.locator(".course-authoring-course-list")).toHaveAttribute(
    "data-cardinality",
    "one"
  );
  await expect(page.locator(".course-authoring-course-card")).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("deep link separa Planejamento, Parâmetros, outline, Inspeção e Pessoas", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const planningHash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: planningHash });

  await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
  await expect(page.getByText("Relações e evidências.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe)).toMatchObject({
    headerReads: 1,
    outlineReads: 0,
    inspectionReads: [],
    planReads: 1
  });

  await page.getByRole("link", { name: "Parâmetros" }).click();
  await expect(page.getByRole("heading", { name: "Parâmetros", exact: true })).toBeVisible();
  await expect(page.locator(".course-design-parameter")).toHaveCount(4);
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe)).toMatchObject({
    outlineReads: 0,
    planReads: 1,
    designReads: [{
      courseId: COURSE_IDS[0],
      scope: { kind: "course", ref: COURSE_IDS[0] },
      limit: 32,
      cursor: null
    }]
  });
  await page.locator("#course-design-child-scope").focus();
  const parametersScroll = await page.evaluate(() => {
    const scroller = document.scrollingElement;
    scroller.scrollTop = Math.min(180, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    return scroller.scrollTop;
  });
  await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.refresh());
  await expect(page.getByRole("heading", { name: "Parâmetros", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`
  );
  await expect.poll(() => page.evaluate(() => document.scrollingElement.scrollTop))
    .toBe(parametersScroll);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe("course-design-child-scope");

  await page.getByRole("link", { name: "Estrutura" }).click();
  await expect(page.getByRole("heading", { name: "Estrutura" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Base conceitual" })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.outlineReads)).toBe(1);

  await page.getByRole("link", { name: "Inspeção" }).click();
  await expect(page.getByRole("heading", { name: "Inspeção" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exemplo guiado com diagrama" })).toBeVisible();
  await expect(page.locator("[data-set-diagram-state=ready]")).toHaveCount(1);
  await expect(page.locator(
    '.package-instance[data-package="aralearn.response.choice"] button'
  ).first()).toBeDisabled();
  const scrollBeforeRefresh = await page.evaluate(() => {
    const scroller = document.scrollingElement;
    scroller.scrollTop = Math.min(120, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    return scroller.scrollTop;
  });
  await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.refresh());
  await expect(page.getByRole("heading", { name: "Inspeção" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.scrollingElement.scrollTop))
    .toBe(scrollBeforeRefresh);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=inspection`
  );

  await page.getByRole("link", { name: "Pessoas" }).click();
  await expect(page.getByRole("heading", { name: "Pessoas" })).toBeVisible();
  await expect(page.getByText("Pessoa proprietária")).toBeVisible();
  await expect(page.getByText("Pessoa estudante")).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.peopleReads)).toBe(1);
  expect(await page.evaluate(() => ({
    outlineReads: globalThis.__courseAuthoringHarness.probe.outlineReads,
    inspectionReads: globalThis.__courseAuthoringHarness.probe.inspectionReads.length
  }))).toEqual({ outlineReads: 1, inspectionReads: 1 });

  await page.getByRole("button", { name: "Voltar aos Cursos" }).click();
  await expect(page.getByRole("heading", { name: "Meus cursos" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Parâmetros salva decisões, interpreta texto sem sobrescrevê-lo e limpa política local", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 430, height: 860 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  const parameter = page.locator(
    '[data-parameter-id="new_analysis_unit_ceiling_per_expository_study_unit"]'
  );
  await parameter.getByText("Entender e ajustar", { exact: true }).click();
  await parameter.getByRole("spinbutton", { name: "Valor", exact: true }).fill("4");
  await parameter.getByLabel("Origem da decisão").selectOption("research_condition");
  await parameter.getByLabel("Por que usar este valor?").fill(
    "Condição experimental registrada antes da produção."
  );
  await parameter.getByRole("button", { name: "Salvar neste escopo" }).click();
  await expect(page.getByText("Parâmetro salvo neste escopo.")).toBeVisible();

  await page.getByText("Editar orientação neste escopo", { exact: true }).click();
  const guidanceEditor = page.locator(".course-design-local-editor");
  await guidanceEditor.getByLabel("Texto original").fill(
    "Defina DNS, mostre resolução de nomes e contraste com DHCP."
  );
  await guidanceEditor.getByLabel("Origem da decisão").selectOption("author");
  await guidanceEditor.getByLabel("Justificativa").fill(
    "Preservar a progressão conceitual solicitada pelo autor."
  );
  await guidanceEditor.getByRole("button", { name: "Salvar texto original" }).click();
  await expect(page.getByText(
    "Texto original salvo; interpretações anteriores não foram sobrescritas."
  )).toBeVisible();
  await expect(page.getByRole("blockquote")).toContainText(
    "Defina DNS, mostre resolução de nomes e contraste com DHCP."
  );

  await page.getByText("Interpretar separadamente", { exact: true }).click();
  const interpretationEditor = page.locator(".course-design-interpretation-editor");
  await interpretationEditor.getByLabel("Resumo estruturado").fill(
    "Desenvolver DNS antes de compará-lo com DHCP."
  );
  await interpretationEditor.getByLabel("Exigir").fill(
    "Definir DNS em linguagem direta.\nMostrar um exemplo nome → IP."
  );
  await interpretationEditor.getByLabel("Evitar").fill(
    "Usar comprimento do texto como medida de densidade."
  );
  await interpretationEditor.getByLabel("Divergências").fill(
    "A orientação não especifica qual registro DNS usar."
  );
  await interpretationEditor.getByLabel("Perguntas em aberto").fill(
    "Qual exemplo deve apresentar a hierarquia?"
  );
  await interpretationEditor.getByRole("button", { name: "Salvar interpretação" }).click();
  await expect(page.getByText(
    "Interpretação salva separadamente do texto original."
  )).toBeVisible();
  await expect(page.getByRole("blockquote")).toContainText(
    "Defina DNS, mostre resolução de nomes e contraste com DHCP."
  );
  await expect(page.locator(".course-design-interpretation > p")).toHaveText(
    "Desenvolver DNS antes de compará-lo com DHCP."
  );

  await page.getByText("Ajustar componentes neste escopo", { exact: true }).click();
  const policy = page.locator(".course-design-policy");
  await policy.getByLabel("Disponibilidade").selectOption("allow_only");
  await policy.getByLabel("Permitir").nth(0).check();
  await policy.getByLabel("Permitir").nth(1).check();
  await policy.getByLabel("Excluir").nth(1).check();
  await policy.getByLabel("Preferir").nth(0).check();
  await policy.getByLabel("Origem da decisão").selectOption("author");
  await policy.getByLabel("Justificativa").fill(
    "Usar somente os componentes necessários à explicação e à prática."
  );
  await policy.getByRole("button", { name: "Salvar política" }).click();
  await expect(page.getByText("Política de componentes salva neste escopo.")).toBeVisible();

  await page.getByText("Ajustar componentes neste escopo", { exact: true }).click();
  await page.locator('[data-course-authoring-action="clear-design-policy"]').click();
  await expect(page.getByText(
    "A política local foi removida; a política herdada voltou a valer."
  )).toBeVisible();

  const mutations = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.designMutations);
  expect(mutations.map((mutation) => mutation.command.type)).toEqual([
    "set_parameter",
    "set_guidance",
    "interpret_guidance",
    "set_component_policy",
    "clear_component_policy"
  ]);
  expect(mutations.map((mutation) => mutation.expectedCourseRevision)).toEqual([5, 6, 7, 8, 9]);
  expect(mutations[0].command).toMatchObject({
    scope: { kind: "course", ref: COURSE_IDS[0] },
    value: 4,
    origin: "research_condition"
  });
  expect(mutations[2].command).not.toHaveProperty("scope");
  expect(mutations[3].command.policy).toMatchObject({
    catalogVersion: "1-3e5629f8",
    availability: "allow_only"
  });
  expect(mutations[3].command.policy.allowedRefs).toEqual([
    "aralearn.resource.component_01@1.0.0"
  ]);
  expect(mutations[3].command.policy.excludedRefs).toEqual([
    "aralearn.resource.component_02@1.0.0"
  ]);
  expect(mutations[3].command.policy.preferredRefs).toEqual([
    "aralearn.resource.component_01@1.0.0"
  ]);
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("criação e edição persistem pelo controlador compartilhado", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 430, height: 860 });
  await mountCourseAuthoring(page, { cardinality: "one" });

  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await page.getByLabel("Título").fill("Curso criado na Autoria");
  await page.getByLabel("Objetivo").fill("Investigar a comparação de explicações.");
  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curso criado na Autoria" })).toBeVisible();
  const createCalls = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.createCalls);
  expect(createCalls).toHaveLength(1);
  expect(createCalls[0]).toMatchObject({
    title: "Curso criado na Autoria",
    objective: "Investigar a comparação de explicações.",
    requestId: expect.any(String)
  });

  await page.getByRole("button", { name: "Editar planejamento" }).click();
  await page.getByLabel("Título do Curso").fill("Curso revisado na Autoria");
  await page.getByLabel("Objetivo").fill("Comparar explicações com critérios explícitos.");
  await page.getByRole("button", { name: "Salvar planejamento" }).click();

  await expect(page.getByRole("heading", { name: "Curso revisado na Autoria" })).toBeVisible();
  await expect(page.getByText("Planejamento salvo.")).toBeVisible();
  const planMutations = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.planMutations);
  expect(planMutations).toHaveLength(1);
  expect(planMutations[0]).toMatchObject({
    courseId: CREATED_COURSE_ID,
    expectedCourseRevision: 1,
    expectedPlanVersion: 1,
    operation: "update_plan",
    title: "Curso revisado na Autoria",
    objective: "Comparar explicações com critérios explícitos.",
    preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
    requestId: expect.any(String)
  });
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});
