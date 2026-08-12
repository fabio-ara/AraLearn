import { validateProjectDocument } from "../domain/aralearnProject.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import {
  RELATIONAL_ROW_COLLECTIONS,
  RelationalMappingError,
  createEmptyRelationalRows,
  createIdentityAllocator,
  defaultUuidFactory
} from "./relationalSchema.js";

function text(value) {
  return typeof value === "string" ? value : "";
}

function validationError(result) {
  return new RelationalMappingError("Documento canônico inválido.", result.errors || []);
}

function createState({ uuidFactory = defaultUuidFactory, identityMap = new Map() } = {}) {
  const rows = createEmptyRelationalRows();
  const allocator = createIdentityAllocator({ uuidFactory, identityMap });
  return {
    rows,
    add(collection, identityKey, values) {
      const row = allocator.row(identityKey, values);
      rows[collection].push(row);
      return row;
    }
  };
}

function addList(state, collection, identityPath, parentFields, statementType, values = []) {
  values.forEach((value, position) => state.add(collection, `${identityPath}/${statementType}:${position}`, {
    ...parentFields,
    statementType,
    position,
    value: text(value)
  }));
}

function addGuide(state, { courseId, ownerType, ownerId, guide, identityPath }) {
  const guideRow = state.add("guides", `${identityPath}/guide`, {
    courseId,
    ownerType,
    ownerId,
    goal: text(guide.goal)
  });
  for (const itemType of ["include", "exclude", "notation", "avoid"]) {
    (guide[itemType] || []).forEach((value, position) => state.add("guideItems", `${identityPath}/guide/${itemType}:${position}`, {
      courseId,
      guideId: guideRow.id,
      itemType,
      position,
      value: text(value)
    }));
  }
}

function addCard(state, card, { courseId, lessonId, microsequenceId, topicIds, identityPath }) {
  const cardRow = state.add("cards", identityPath, {
    courseId,
    lessonId,
    microsequenceId,
    contractKey: card.id,
    position: card.position,
    role: card.role,
    title: card.title
  });
  card.sources.forEach((value, position) => state.add("cardSources", `${identityPath}/source:${position}`, {
    courseId, cardId: cardRow.id, position, value
  }));
  card.topics.forEach((topicContractKey, position) => state.add("cardTopics", `${identityPath}/topic:${position}`, {
    courseId,
    cardId: cardRow.id,
    topicId: topicIds.get(topicContractKey) || null,
    topicContractKey,
    position
  }));
  const slots = [
    ...card.content.map((value, position) => ({ slot: "content", position, value })),
    ...(card.response ? [{ slot: "response", position: 0, value: card.response }] : []),
    ...card.feedback.map((value, position) => ({ slot: "feedback", position, value }))
  ];
  slots.forEach(({ slot, position, value }) => {
    const validation = RESOURCE_PACKAGE_REGISTRY.validateInstance(value, slot);
    if (!validation.valid) throw new RelationalMappingError(validation.errors.join(" "));
    state.add("packageInstances", `${identityPath}/${slot}:${value.id}`, {
      courseId,
      cardId: cardRow.id,
      slot,
      position,
      contractKey: value.id,
      packageId: value.package,
      packageVersion: value.version,
      packageData: structuredClone(value.data)
    });
  });
}

function mapDocument(document, options = {}) {
  const validation = validateProjectDocument(document);
  if (!validation.ok) throw validationError(validation);
  const canonical = validation.value;
  const state = createState(options);
  const project = state.add("projectMeta", "library", {
    contract: canonical.contract,
    scope: canonical.scope || null,
    hasScope: Boolean(canonical.scope)
  });
  canonical.courses.forEach((course, coursePosition) => {
    const coursePath = `course:${course.id}`;
    const courseRow = state.add("courses", coursePath, {
      projectId: project.id,
      courseId: null,
      contractKey: course.id,
      contractScope: canonical.scope || null,
      position: coursePosition,
      title: course.title,
      goal: course.goal
    });
    courseRow.courseId = courseRow.id;
    course.modules.forEach((module, modulePosition) => {
      const modulePath = `${coursePath}/module:${module.id}`;
      const moduleRow = state.add("modules", modulePath, {
        courseId: courseRow.id,
        contractKey: module.id,
        position: modulePosition,
        title: module.title
      });
      addGuide(state, { courseId: courseRow.id, ownerType: "module", ownerId: moduleRow.id, guide: module.guide, identityPath: modulePath });
      module.lessons.forEach((lesson, lessonPosition) => {
        const lessonPath = `${modulePath}/lesson:${lesson.id}`;
        const lessonRow = state.add("lessons", lessonPath, {
          courseId: courseRow.id,
          moduleId: moduleRow.id,
          contractKey: lesson.id,
          position: lessonPosition,
          title: lesson.title
        });
        addGuide(state, { courseId: courseRow.id, ownerType: "lesson", ownerId: lessonRow.id, guide: lesson.guide, identityPath: lessonPath });
        const topicIds = new Map();
        lesson.topics.forEach((topic, position) => {
          const topicPath = `${lessonPath}/topic:${topic.id}`;
          const topicRow = state.add("topics", topicPath, {
            courseId: courseRow.id,
            lessonId: lessonRow.id,
            contractKey: topic.id,
            position,
            label: topic.label,
            topicKind: topic.kind
          });
          topicIds.set(topic.id, topicRow.id);
          addList(state, "topicStatements", topicPath, { courseId: courseRow.id, topicId: topicRow.id }, "check", topic.checks);
          addList(state, "topicStatements", topicPath, { courseId: courseRow.id, topicId: topicRow.id }, "error", topic.errors);
        });
        const microIds = new Map();
        const microRows = lesson.microsequences.map((micro, position) => {
          const microPath = `${lessonPath}/micro:${micro.id}`;
          const row = state.add("microsequences", microPath, {
            courseId: courseRow.id,
            lessonId: lessonRow.id,
            contractKey: micro.id,
            position,
            title: micro.title,
            goal: micro.goal,
            role: micro.role,
            branchOfId: null,
            branchOfContractKey: micro.branchOf || null,
            hasBranchOf: Boolean(micro.branchOf),
            hasErrors: true
          });
          microIds.set(micro.id, row.id);
          return { micro, row, microPath };
        });
        microRows.forEach(({ micro, row, microPath }) => {
          row.branchOfId = micro.branchOf ? microIds.get(micro.branchOf) || null : null;
          addList(state, "microsequenceStatements", microPath, { courseId: courseRow.id, microsequenceId: row.id }, "cover", micro.covers);
          addList(state, "microsequenceStatements", microPath, { courseId: courseRow.id, microsequenceId: row.id }, "check", micro.checks);
          addList(state, "microsequenceStatements", microPath, { courseId: courseRow.id, microsequenceId: row.id }, "error", micro.errors);
          micro.dependsOn.forEach((dependsOnContractKey, position) => state.add("dependencies", `${microPath}/dependency:${position}`, {
            courseId: courseRow.id,
            lessonId: lessonRow.id,
            microsequenceId: row.id,
            dependsOnMicrosequenceId: microIds.get(dependsOnContractKey) || null,
            dependsOnContractKey,
            position
          }));
          micro.cards.forEach((card) => addCard(state, card, {
            courseId: courseRow.id,
            lessonId: lessonRow.id,
            microsequenceId: row.id,
            topicIds,
            identityPath: `${microPath}/card:${card.id}`
          }));
        });
      });
    });
  });
  return state.rows;
}

export function contractToRelationalRows(document, options = {}) {
  return mapDocument(structuredClone(document), options);
}

export function microsequenceFragmentToRelationalRows(fragment, options = {}) {
  const document = {
    contract: "aralearn.library.v1",
    courses: [{
      id: options.courseContractKey || "fragment-course",
      title: "Fragmento",
      goal: "Transportar uma microssequência relacional.",
      modules: [{
        id: options.moduleContractKey || "fragment-module",
        title: "Fragmento",
        guide: { goal: "Fragmento.", include: [], exclude: [], notation: [], avoid: [] },
        lessons: [{
          id: options.lessonContractKey || "fragment-lesson",
          title: "Fragmento",
          guide: { goal: "Fragmento.", include: [], exclude: [], notation: [], avoid: [] },
          topics: options.topics || [],
          microsequences: [structuredClone(fragment)]
        }]
      }]
    }]
  };
  const rows = mapDocument(document, options);
  const generatedCourseId = rows.courses[0].id;
  const generatedLessonId = rows.lessons[0].id;
  const keep = new Set(["microsequences", "microsequenceStatements", "dependencies", "cards", "cardSources", "cardTopics", "packageInstances"]);
  RELATIONAL_ROW_COLLECTIONS.forEach((collection) => {
    if (!keep.has(collection)) rows[collection] = [];
    else rows[collection].forEach((row) => {
      if (row.courseId === generatedCourseId) row.courseId = options.courseId || generatedCourseId;
      if (row.lessonId === generatedLessonId) row.lessonId = options.lessonId || generatedLessonId;
    });
  });
  return rows;
}
