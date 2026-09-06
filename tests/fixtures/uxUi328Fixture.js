import { curriculumMapFixture } from "./courseCurriculumMapFixture.js";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";

export const UX_UI_328_COURSE_ID = "e3280000-0000-4000-8000-000000000001";

// Synthetic controller fixture: no account, persistence, or network mutation.
// The two materialization events model production at different revisions/times.
export function createUxUi328Fixture() {
  const courseId = UX_UI_328_COURSE_ID;
  const map = curriculumMapFixture({ moduleCount: 2, lessonCount: 2, microsequenceCount: 2 });
  map.courseId = courseId;
  const course = { courseId, title: "Curso sintético de redes de computadores e relações entre mecanismos, evidências e condições de aplicação",
    goal: "Reconhecer a estrutura de redes de computadores, explicar o encaminhamento de quadros e comparar os meios físicos segundo suas condições de aplicação. ".repeat(5).trim(),
    revision: 3, ownership: "owned", canEdit: true, visibility: "private", publicFileAccess: "restricted",
    counts: { moduleCount: 2, lessonCount: 4, topicCount: 0, microsequenceCount: 8, studyUnitCount: 0 } };
  const micros = map.curriculum.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.microsequences.map(micro => ({ module, lesson, micro }))));
  const units = [], events = [], requests = [], positionSaves = [];
  const parts = [0, 1].map(index => ({ id: `e3280000-0000-4000-8000-00000000001${index}`, title: `Lote sintético ${index + 1}: ${index ? "aplicações posteriores" : "fundamentos iniciais"}`,
    intent: "Comparar casos sintéticos sem alterar cursos existentes.", version: 1, position: index, progression: [], microsequences: [],
    progress: { state: "planned", microsequenceCount: 0, studyUnitCount: 0 } }));
  function materializeBatch(batchIndex, timestamp) {
    if (events.some(event => event.batchIndex === batchIndex)) throw new Error("Lote sintético já materializado.");
    const firstOrdinal = units.length + 1;
    for (let index = 0; index < 18; index += 1) {
      const ordinal = firstOrdinal + index;
      const path = micros[batchIndex * 4 + Math.floor(index / 5)];
      units.push({ studyUnit: { id: `ux328-unit-${String(ordinal).padStart(2, "0")}`, position: index + 1,
        title: `Unidade ${ordinal}: encaminhamento de quadros em redes de computadores com condições e limites explicitados`, role: "theory",
        content: [{ id: `ux328-paragraph-${ordinal}`, package: "aralearn.resource.paragraph", version: "1.0.0",
          data: { text: "Um switch aprende a porta de origem a partir do quadro recebido. A tabela permite consultar a porta associada ao endereço de destino. Este conteúdo é exclusivamente sintético para conferir a interface." } }], response: null, feedback: [], topics: [] },
        version: 1, updatedAt: timestamp, ordinal,
        curriculumPath: { module: { id: path.module.id, position: path.module.position, title: path.module.title },
          lesson: { id: path.lesson.id, position: path.lesson.position, title: path.lesson.title },
          didacticMicrosequence: { id: path.micro.id, position: path.micro.position, title: path.micro.title } },
        authoringPart: { id: parts[batchIndex].id, position: batchIndex, title: parts[batchIndex].title, state: "materialized" },
        authorship: { createdOrigin: "gpt", lastRevisionOrigin: "gpt", design: { application: null } },
        deepLink: `#/authoring/courses/${courseId}?section=content&studyUnitId=ux328-unit-${String(ordinal).padStart(2, "0")}` });
    }
    parts[batchIndex].progress = { state: "materialized", microsequenceCount: 4, studyUnitCount: 18 };
    parts[batchIndex].microsequences = micros.slice(batchIndex * 4, batchIndex * 4 + 4).map(({ module, lesson, micro }, productionPosition) => ({
      id: micro.id, productionPosition, title: micro.title, goal: micro.objective, role: micro.role,
      curriculumPath: { moduleId: module.id, moduleTitle: module.title, lessonId: lesson.id, lessonTitle: lesson.title },
      studyUnitCount: units.filter(item => item.curriculumPath.didacticMicrosequence.id === micro.id).length }));
    course.revision += 1;
    course.counts.studyUnitCount = units.length;
    events.push({ batchIndex, timestamp, revision: course.revision, firstOrdinal, lastOrdinal: units.length });
  }
  materializeBatch(0, "2026-09-04T12:00:00.000Z");
  materializeBatch(1, "2026-09-05T15:00:00.000Z");
  units.at(-1).studyUnit.role = "practice";
  units.at(-1).studyUnit.response = { id: "ux328-choice-36", package: "aralearn.response.choice", version: "1.0.0",
    data: { question: "Qual informação permite aprender a porta associada a um endereço?", selectionMode: "single", selectionCriterion: "correct",
      options: [{ id: "source", kind: "text", text: "O endereço de origem do quadro recebido." },
        { id: "destination", kind: "text", text: "Somente o tamanho do endereço de destino." }], answerIds: ["source"] } };
  map.curriculumScopeItems = ["Redes de computadores.", "Meios de transmissão.", "IEEE 802.3.", "H.323.", "Abrev. técnica", "Alternativas...", "Explicar quando o quadro é encaminhado.",
    ...Array.from({ length: 38 }, (_, index) => `Item sintético ${index + 8}: condições de aplicação, exemplos e limites do encaminhamento de quadros.`)].map((statement, index) => ({
    id: `e3280000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`, position: index, state: "developed", statement,
    curriculumTargets: [{ moduleId: "module-1", lessonId: "lesson-1-1", didacticMicrosequenceIds: ["micro-1-1-1", "micro-1-1-2"] }],
    developedIn: units.slice(0, 2).map(item => ({ studyUnitId: item.studyUnit.id, didacticMicrosequenceId: item.curriculumPath.didacticMicrosequence.id, title: item.studyUnit.title })) }));
  const annotations = [];
  function annotation(rawText, unitId = units[0].studyUnit.id) {
    const targetUnit = units.find(item => item.studyUnit.id === unitId);
    const path = [{ kind: "course", id: courseId, label: course.title, version: course.revision }, { kind: "study_unit", id: unitId, label: targetUnit.studyUnit.title, version: 1 }];
    return { contract: "aralearn.course-anchored-annotation.v1", annotationId: `e3280000-0000-4000-8000-${String(annotations.length + 1).padStart(12, "0")}`, annotationVersion: 1, courseId, deepLink: null,
      provenance: { origin: "author", channel: "authoring_interface" }, contributor: { kind: "self", role: "author", ref: "self", label: "Você" },
      target: { kind: "study_unit", id: unitId, observedPath: path, currentAvailable: true, currentPath: path, deepLink: targetUnit.deepLink },
      observedRevision: { certainty: "known", courseRevision: course.revision, targetVersion: 1 }, rawText, category: null, briefSummary: null,
      subjectClassification: { status: "unclassified", automatic: { method: "target_scope_unclassified", methodVersion: 1, taxonomyRevision: course.revision, subjects: [] },
        effective: { method: "target_scope_unclassified", methodVersion: 1, taxonomyRevision: course.revision, subjects: [] }, correctedAt: null },
      state: "open", ownerResponse: null, timestamps: { capturedAt: "2026-09-06T10:00:00.000Z", createdAt: "2026-09-06T10:00:00.000Z", updatedAt: "2026-09-06T10:00:00.000Z", firstConsideredAt: null, respondedAt: null, resolvedAt: null, withdrawnAt: null },
      capabilities: { canRevise: true, canWithdraw: true, canConsider: true, canRespond: true, canResolve: true, canReopen: false, canCorrectSubjects: true } };
  }
  annotations.push(annotation("Conferir a relação entre o endereço de origem e a porta aprendida."));
  annotations.push(annotation("Observação longa sintética para verificar composição e leitura: ".repeat(12), units[1].studyUnit.id));
  const plan = { id: "e3280000-0000-4000-8000-000000000030", version: 1, audience: null, scope: null, declaredPrerequisites: [],
    curriculumMapStatus: "approved", curriculum: map.curriculum, curriculumScopeItems: map.curriculumScopeItems,
    preferredPartCount: { minimum: 2, maximum: 2, origin: "automatic" }, intendedLearningOutcomes: [], instructionalAnalysisUnits: [], evidenceRequirements: [], parts,
    counts: { intendedLearningOutcomeCount: 0, instructionalAnalysisUnitCount: 0, evidenceRequirementCount: 0, authoringPartCount: 2, linkedDidacticMicrosequenceCount: 8, studyUnitCount: 36 }, updatedAt: events.at(-1).timestamp };
  const rejectMutation = async () => { throw new Error("Escrita fora desta reprodução sintética."); };
  const controller = {
    async listCourses() { return { items: [structuredClone(course)], hasMore: false, nextCursor: null }; },
    async getCourse() { return structuredClone(course); },
    async loadAuthoringOutline() { return { contract: "aralearn.course.v1", ...structuredClone(course), outline: { courseId, title: course.title, goal: course.goal, modules: structuredClone(map.curriculum.modules) }, deepLink: `#/authoring/courses/${courseId}?section=content` }; },
    async loadAuthoringStudyUnits(_courseId, options) {
      requests.push({ kind: "inspection", options: structuredClone(options) });
      const scopeKind = options.scope?.kind || "course";
      const pathKind = scopeKind === "didactic_microsequence" ? "didacticMicrosequence" : scopeKind;
      const source = units.filter(item => scopeKind === "course" || (scopeKind === "authoring_part"
        ? item.authoringPart?.id === options.scope.id : scopeKind === "unassigned"
          ? item.authoringPart === null : item.curriculumPath[pathKind]?.id === options.scope.id));
      const latest = source.reduce((best, item, index) => best < 0 || item.updatedAt > source[best].updatedAt ? index : best, -1);
      const anchorIndex = options.entry === "latest_updated" ? latest : source.findIndex(item => item.studyUnit.id === options.anchorStudyUnitId);
      const cursorIndex = source.findIndex(item => item.studyUnit.id === options.cursor?.studyUnitId);
      if (options.anchorStudyUnitId && anchorIndex < 0 || options.cursor && cursorIndex < 0) {
        throw Object.assign(new Error("Unidade sintética ausente neste escopo."), { status: 404 });
      }
      const start = options.direction === "backward" && cursorIndex >= 0 ? Math.max(0, cursorIndex - options.limit) : cursorIndex >= 0 ? cursorIndex + 1 : Math.max(0, anchorIndex);
      const end = options.direction === "backward" && cursorIndex >= 0 ? cursorIndex : Math.min(source.length, start + options.limit);
      const items = source.slice(start, end).map((item, index) => ({ ...structuredClone(item), ordinal: start + index + 1 }));
      return { contract: "aralearn.course-study-unit-inspection-page.v2", courseId, courseRevision: course.revision, scope: structuredClone(options.scope), totalCount: source.length,
        scopeOptions: { authoringParts: parts.map(part => ({ id: part.id, position: part.position, title: part.title, state: part.progress.state })), unassignedStudyUnitCount: 0 },
        items, hasPrevious: start > 0, hasMore: end < source.length, previousCursor: start > 0 ? { studyUnitId: items[0].studyUnit.id } : null,
        nextCursor: end < source.length ? { studyUnitId: items.at(-1).studyUnit.id } : null, pageBytes: JSON.stringify(items).length };
    },
    async loadAuthoringInspectionPosition() { return null; },
    async saveAuthoringInspectionPosition(_courseId, value) { positionSaves.push(structuredClone(value)); },
    async loadAuthoringPlan() { return { contract: "aralearn.course-instructional-plan.v3", courseId, courseRevision: course.revision, plan: { ...structuredClone(plan), title: course.title, objective: course.goal } }; },
    async loadCourseDesign(_courseId, { scope }) {
      requests.push({ kind: "design", scope: structuredClone(scope) });
      const item = units.find(unit => unit.studyUnit.id === scope.ref) || units[0];
      const path = item.curriculumPath;
      const selection = { courseId, moduleId: path.module.id, lessonId: path.lesson.id, microsequenceId: path.didacticMicrosequence.id, studyUnitId: item.studyUnit.id };
      const value = courseDesignFixture(selection, { scope: scope.kind, revision: course.revision });
      const scopes = [{ kind: "course", ref: courseId, label: course.title }, ...["module", "lesson", "didacticMicrosequence"].map(kind => ({ kind: kind === "didacticMicrosequence" ? "didactic_microsequence" : kind, ref: path[kind].id, label: path[kind].title })), { kind: "study_unit", ref: item.studyUnit.id, label: item.studyUnit.title }];
      const currentIndex = scopes.findIndex(candidate => candidate.kind === scope.kind);
      value.scopeContext = { current: scopes[currentIndex], ancestors: scopes.slice(0, currentIndex), children: scopes.slice(currentIndex + 1, currentIndex + 2).map(child => ({ ...child, position: 0 })), childCount: currentIndex < 4 ? 1 : 0, hasMoreChildren: false, nextChildCursor: null };
      const fixed = value.parameters.find(parameter => parameter.parameterId === "study_unit_content_word_target");
      fixed.effectiveAssignment = { mode: "fixed", value: 180, origin: "author", reason: "Comprimento fixo escolhido apenas para esta fixture.", sourceScope: { kind: "course", ref: courseId }, inherited: currentIndex > 0 };
      if (!currentIndex) fixed.localAssignment = { mode: "fixed", value: 180, origin: "author", reason: fixed.effectiveAssignment.reason };
      return value;
    },
    async loadCourseAnchoredAnnotations(_courseId, options) {
      requests.push({ kind: "annotations", options: structuredClone(options) });
      const targetId = options.query?.hierarchy?.target?.id;
      const items = annotations.filter(item => !targetId || item.target.id === targetId);
      return { contract: "aralearn.course-anchored-annotation-page.v1", courseId, courseRevision: course.revision, annotationSetVersion: annotations.length,
        query: structuredClone(options.query), summary: { matchingTotal: items.length, byOrigin: { author: items.length }, byChannel: { authoring_interface: items.length }, byState: { open: items.length }, unclassifiedTotal: items.length },
        items: structuredClone(items), hasMore: false, nextCursor: null };
    },
    async mutateCourseAnchoredAnnotations(input) {
      requests.push({ kind: "annotation-mutation", input: structuredClone(input) });
      const item = annotation(input.command.rawText, input.command.target.id); item.annotationId = input.command.annotationId; annotations.push(item);
      return { contract: "aralearn.course-anchored-annotation-change.v1", courseId, courseRevision: course.revision, annotationSetVersion: annotations.length, requestId: input.requestId, idempotent: false, changed: true, annotation: structuredClone(item) };
    },
    createCourse: rejectMutation, mutateCourseDesign: rejectMutation, commitCourseComposition: rejectMutation
  };
  return { course, map, plan, units, events, annotations, requests, positionSaves, controller };
}
