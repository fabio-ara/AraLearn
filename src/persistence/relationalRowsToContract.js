import { validateProjectDocument } from "../domain/aralearnProject.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { RelationalMappingError, groupRows, rowsInPosition } from "./relationalSchema.js";

const active = (rows, collection) => rowsInPosition(Array.isArray(rows?.[collection]) ? rows[collection] : []);

function createContext(rows) {
  return {
    courses: active(rows, "courses"),
    modulesByCourse: groupRows(active(rows, "modules"), "courseId"),
    lessonsByModule: groupRows(active(rows, "lessons"), "moduleId"),
    guides: new Map(active(rows, "guides").map((row) => [`${row.ownerType}:${row.ownerId}`, row])),
    guideItemsByGuide: groupRows(active(rows, "guideItems"), "guideId"),
    topicsByLesson: groupRows(active(rows, "topics"), "lessonId"),
    topicStatementsByTopic: groupRows(active(rows, "topicStatements"), "topicId"),
    microsequencesByLesson: groupRows(active(rows, "microsequences"), "lessonId"),
    microStatementsByMicro: groupRows(active(rows, "microsequenceStatements"), "microsequenceId"),
    dependenciesByMicro: groupRows(active(rows, "dependencies"), "microsequenceId"),
    cardsByMicro: groupRows(active(rows, "cards"), "microsequenceId"),
    cardSourcesByCard: groupRows(active(rows, "cardSources"), "cardId"),
    cardTopicsByCard: groupRows(active(rows, "cardTopics"), "cardId"),
    packagesByCard: groupRows(active(rows, "packageInstances"), "cardId")
  };
}

function statements(context, group, id, statementType) {
  return (context[group].get(id) || []).filter((row) => row.statementType === statementType).map((row) => row.value);
}

function guide(context, ownerType, ownerId) {
  const row = context.guides.get(`${ownerType}:${ownerId}`);
  if (!row) throw new RelationalMappingError(`Guide ausente para ${ownerType}:${ownerId}.`);
  const items = context.guideItemsByGuide.get(row.id) || [];
  const values = (itemType) => items.filter((item) => item.itemType === itemType).map((item) => item.value);
  return { goal: row.goal, include: values("include"), exclude: values("exclude"), notation: values("notation"), avoid: values("avoid") };
}

function packageInstance(row, slot) {
  const value = {
    id: row.contractKey,
    package: row.packageId,
    version: row.packageVersion,
    data: structuredClone(row.packageData)
  };
  const validation = RESOURCE_PACKAGE_REGISTRY.validateInstance(value, slot);
  if (!validation.valid) throw new RelationalMappingError(validation.errors.join(" "));
  return value;
}

function card(context, row) {
  const packages = context.packagesByCard.get(row.id) || [];
  const content = packages.filter((item) => item.slot === "content").map((item) => packageInstance(item, "content"));
  const responses = packages.filter((item) => item.slot === "response");
  const feedback = packages.filter((item) => item.slot === "feedback").map((item) => packageInstance(item, "feedback"));
  if (responses.length > 1) throw new RelationalMappingError(`Card ${row.contractKey} possui respostas concorrentes.`);
  return {
    id: row.contractKey,
    position: row.position,
    title: row.title,
    role: row.role,
    content,
    response: responses.length ? packageInstance(responses[0], "response") : null,
    feedback,
    topics: (context.cardTopicsByCard.get(row.id) || []).map((item) => item.topicContractKey),
    sources: (context.cardSourcesByCard.get(row.id) || []).map((item) => item.value)
  };
}

export function assembleMicrosequenceRow(context, row) {
  return {
    id: row.contractKey,
    title: row.title,
    goal: row.goal,
    role: row.role,
    ...(row.hasBranchOf ? { branchOf: row.branchOfContractKey } : {}),
    dependsOn: (context.dependenciesByMicro.get(row.id) || []).map((item) => item.dependsOnContractKey),
    covers: statements(context, "microStatementsByMicro", row.id, "cover"),
    checks: statements(context, "microStatementsByMicro", row.id, "check"),
    errors: statements(context, "microStatementsByMicro", row.id, "error"),
    cards: (context.cardsByMicro.get(row.id) || []).map((item) => card(context, item))
  };
}

function assembleProject(rows) {
  const context = createContext(rows);
  const meta = active(rows, "projectMeta")[0];
  return {
    contract: "aralearn.library.v1",
    ...(meta?.hasScope ? { scope: meta.scope } : {}),
    courses: context.courses.map((course) => ({
      id: course.contractKey,
      title: course.title,
      goal: course.goal,
      modules: (context.modulesByCourse.get(course.id) || []).map((module) => ({
        id: module.contractKey,
        title: module.title,
        guide: guide(context, "module", module.id),
        lessons: (context.lessonsByModule.get(module.id) || []).map((lesson) => ({
          id: lesson.contractKey,
          title: lesson.title,
          guide: guide(context, "lesson", lesson.id),
          topics: (context.topicsByLesson.get(lesson.id) || []).map((topic) => ({
            id: topic.contractKey,
            label: topic.label,
            kind: topic.topicKind,
            checks: statements(context, "topicStatementsByTopic", topic.id, "check"),
            errors: statements(context, "topicStatementsByTopic", topic.id, "error")
          })),
          microsequences: (context.microsequencesByLesson.get(lesson.id) || []).map((micro) => assembleMicrosequenceRow(context, micro))
        }))
      }))
    }))
  };
}

export function relationalRowsToContract(rows, { validate = true } = {}) {
  const document = assembleProject(rows);
  if (validate) {
    const result = validateProjectDocument(document);
    if (!result.ok) throw new RelationalMappingError("Documento remontado é inválido.", result.errors);
  }
  return document;
}

export function relationalRowsToMicrosequenceFragment(rows, microsequenceIdentity = null, { validate = true } = {}) {
  const context = createContext(rows);
  const candidates = active(rows, "microsequences");
  const row = microsequenceIdentity
    ? candidates.find((item) => item.id === microsequenceIdentity || item.contractKey === microsequenceIdentity)
    : candidates[0];
  if (!row) throw new RelationalMappingError("Microssequência relacional não encontrada.");
  const fragment = assembleMicrosequenceRow(context, row);
  if (validate && !Array.isArray(fragment.cards)) throw new RelationalMappingError("Fragmento inválido.");
  return fragment;
}
