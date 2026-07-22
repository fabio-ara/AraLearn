import { canonicalStringify } from "../persistence/canonicalCourseHash.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedSelection(selection = {}) {
  return {
    courseKey: text(selection?.courseKey),
    moduleKey: text(selection?.moduleKey),
    lessonKey: text(selection?.lessonKey),
    microsequenceKey: text(selection?.microsequenceKey)
  };
}

function findScope(projectDocument = {}, selection = {}) {
  const normalized = normalizedSelection(selection);
  if (Object.values(normalized).some((value) => !value)) {
    return null;
  }
  const course = (projectDocument.courses || []).find((item) => item?.id === normalized.courseKey);
  const moduleValue = (course?.modules || []).find((item) => item?.id === normalized.moduleKey);
  const lesson = (moduleValue?.lessons || []).find((item) => item?.id === normalized.lessonKey);
  const microsequenceIndex = (lesson?.microsequences || []).findIndex(
    (item) => item?.id === normalized.microsequenceKey
  );
  const microsequence = microsequenceIndex >= 0 ? lesson.microsequences[microsequenceIndex] : null;
  if (!course || !moduleValue || !lesson || !microsequence) {
    return null;
  }
  return {
    selection: normalized,
    course,
    moduleValue,
    lesson,
    microsequence,
    microsequenceIndex
  };
}

function omit(object = {}, omittedFields = []) {
  const omitted = new Set(omittedFields);
  return Object.fromEntries(
    Object.entries(object || {}).filter(([fieldName]) => !omitted.has(fieldName))
  );
}

function equals(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function assertEqual(left, right, message) {
  if (!equals(left, right)) {
    throw new InterventionScopeError(message, "OUT_OF_SCOPE_CHANGE");
  }
}

function fingerprint(value) {
  const source = canonicalStringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}:${source.length}`;
}

function contextForSnapshot(projectDocument, scope) {
  return {
    contract: projectDocument?.contract,
    version: projectDocument?.version,
    kind: projectDocument?.kind,
    course: omit(scope.course, ["modules"]),
    module: omit(scope.moduleValue, ["lessons"]),
    lesson: scope.lesson
  };
}

function assertDocumentEnvelope(before = {}, after = {}) {
  assertEqual(
    omit(before, ["courses"]),
    omit(after, ["courses"]),
    "A intervenção tentou alterar propriedades externas à árvore do curso."
  );
  const beforeCourses = Array.isArray(before.courses) ? before.courses : [];
  const afterCourses = Array.isArray(after.courses) ? after.courses : [];
  if (beforeCourses.length !== afterCourses.length) {
    throw new InterventionScopeError(
      "A intervenção tentou criar ou remover curso fora do escopo autorizado.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }
  if (!equals(beforeCourses.map((item) => item?.id), afterCourses.map((item) => item?.id))) {
    throw new InterventionScopeError(
      "A intervenção tentou reordenar ou substituir cursos fora do escopo autorizado.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }
}

function assertLessonBoundary(beforeScope, afterScope) {
  assertEqual(
    omit(beforeScope.course, ["modules"]),
    omit(afterScope.course, ["modules"]),
    "A intervenção tentou alterar dados do curso fora da microssequência."
  );
  assertEqual(
    beforeScope.course.modules.map((item) => item?.id),
    afterScope.course.modules.map((item) => item?.id),
    "A intervenção tentou alterar a composição dos módulos."
  );
  beforeScope.course.modules.forEach((moduleValue, moduleIndex) => {
    if (moduleValue.id !== beforeScope.moduleValue.id) {
      assertEqual(
        moduleValue,
        afterScope.course.modules[moduleIndex],
        "A intervenção tentou alterar outro módulo."
      );
    }
  });
  assertEqual(
    omit(beforeScope.moduleValue, ["lessons"]),
    omit(afterScope.moduleValue, ["lessons"]),
    "A intervenção tentou alterar dados do módulo fora da microssequência."
  );
  assertEqual(
    beforeScope.moduleValue.lessons.map((item) => item?.id),
    afterScope.moduleValue.lessons.map((item) => item?.id),
    "A intervenção tentou alterar a composição das lições."
  );
  beforeScope.moduleValue.lessons.forEach((lesson, lessonIndex) => {
    if (lesson.id !== beforeScope.lesson.id) {
      assertEqual(
        lesson,
        afterScope.moduleValue.lessons[lessonIndex],
        "A intervenção tentou alterar outra lição."
      );
    }
  });
  assertEqual(
    omit(beforeScope.lesson, ["microsequences"]),
    omit(afterScope.lesson, ["microsequences"]),
    "A intervenção tentou alterar dados da lição fora da microssequência."
  );
}

function assertExistingMicrosequenceChange(beforeScope, afterScope, targetMicrosequenceKey) {
  const beforeMicrosequences = beforeScope.lesson.microsequences || [];
  const afterMicrosequences = afterScope.lesson.microsequences || [];
  assertEqual(
    beforeMicrosequences.map((item) => item?.id),
    afterMicrosequences.map((item) => item?.id),
    "A intervenção tentou alterar a composição das microssequências."
  );
  const targetIndex = beforeMicrosequences.findIndex((item) => item?.id === targetMicrosequenceKey);
  if (targetIndex < 0) {
    throw new InterventionScopeError(
      "A microssequência de destino não pertence ao contexto autorizado.",
      "INVALID_TARGET"
    );
  }
  beforeMicrosequences.forEach((microsequence, index) => {
    if (index !== targetIndex) {
      assertEqual(
        microsequence,
        afterMicrosequences[index],
        "A intervenção tentou alterar outra microssequência."
      );
      return;
    }
    assertEqual(
      omit(microsequence, ["cards", "status"]),
      omit(afterMicrosequences[index], ["cards", "status"]),
      "A intervenção tentou alterar propriedades não autorizadas da microssequência."
    );
  });
}

function assertNextPlannedTarget(beforeScope, targetMicrosequenceKey) {
  const nextMain = (beforeScope.lesson.microsequences || [])
    .slice(beforeScope.microsequenceIndex + 1)
    .find((item) => !item?.branchOf);
  if (!nextMain?.id || nextMain.id !== targetMicrosequenceKey) {
    throw new InterventionScopeError(
      "A intervenção tentou preencher uma etapa diferente da próxima microssequência da trilha.",
      "INVALID_TARGET"
    );
  }
}

function assertBranchChange(beforeScope, afterScope, targetMicrosequenceKey) {
  const beforeMicrosequences = beforeScope.lesson.microsequences || [];
  const afterMicrosequences = afterScope.lesson.microsequences || [];
  if (afterMicrosequences.length !== beforeMicrosequences.length + 1) {
    throw new InterventionScopeError(
      "A intervenção de apoio deve inserir exatamente uma microssequência.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }
  const expectedIndex = beforeScope.microsequenceIndex + 1;
  const inserted = afterMicrosequences[expectedIndex];
  if (!inserted?.id || inserted.id !== targetMicrosequenceKey) {
    throw new InterventionScopeError(
      "A nova microssequência não foi inserida logo após a etapa selecionada.",
      "INVALID_TARGET"
    );
  }
  if (inserted.branchOf !== beforeScope.microsequence.id) {
    throw new InterventionScopeError(
      "A nova microssequência perdeu o vínculo com a etapa selecionada.",
      "INVALID_TARGET"
    );
  }
  const dependencyIds = Array.isArray(inserted.dependsOn) ? inserted.dependsOn : [];
  if (!dependencyIds.includes(beforeScope.microsequence.id)) {
    throw new InterventionScopeError(
      "A nova microssequência deve depender da etapa selecionada.",
      "INVALID_TARGET"
    );
  }
  if (!Array.isArray(inserted.cards) || inserted.cards.length === 0) {
    throw new InterventionScopeError(
      "A nova microssequência não contém cards validados.",
      "INVALID_TARGET"
    );
  }
  const withoutInserted = afterMicrosequences.filter((_, index) => index !== expectedIndex);
  assertEqual(
    beforeMicrosequences,
    withoutInserted,
    "A intervenção tentou alterar microssequências preexistentes ao criar a etapa de apoio."
  );
}

export class InterventionScopeError extends Error {
  constructor(message, code = "INVALID_INTERVENTION_SCOPE") {
    super(message);
    this.name = "InterventionScopeError";
    this.code = code;
  }
}

export function buildInterventionScopeSnapshot(projectDocument = {}, selection = {}) {
  const scope = findScope(projectDocument, selection);
  if (!scope) {
    throw new InterventionScopeError(
      "Selecione uma microssequência válida antes de iniciar a intervenção.",
      "INVALID_SELECTION"
    );
  }
  return {
    selection: scope.selection,
    contextFingerprint: fingerprint(contextForSnapshot(projectDocument, scope))
  };
}

export function assertInterventionResumeScope({
  savedSnapshot,
  projectDocument = {},
  selection = {}
} = {}) {
  if (!savedSnapshot?.contextFingerprint || !savedSnapshot?.selection) {
    throw new InterventionScopeError(
      "A intervenção anterior não possui contexto verificável. Inicie um novo pedido.",
      "STALE_INTERVENTION_SCOPE"
    );
  }
  const current = buildInterventionScopeSnapshot(projectDocument, selection);
  if (!equals(savedSnapshot.selection, current.selection) ||
      savedSnapshot.contextFingerprint !== current.contextFingerprint) {
    throw new InterventionScopeError(
      "A microssequência mudou desde a tentativa anterior. Inicie um novo pedido sobre o conteúdo atual.",
      "STALE_INTERVENTION_SCOPE"
    );
  }
  return current;
}

export function assertInterventionResultScope({
  previousProjectDocument = {},
  nextProjectDocument = {},
  selection = {},
  targetMicrosequenceKey = "",
  targetMode = "current",
  actionIntent = ""
} = {}) {
  const beforeScope = findScope(previousProjectDocument, selection);
  const normalizedTargetKey = text(targetMicrosequenceKey);
  if (!beforeScope || !normalizedTargetKey) {
    throw new InterventionScopeError(
      "A intervenção não informou um destino válido.",
      "INVALID_TARGET"
    );
  }
  assertDocumentEnvelope(previousProjectDocument, nextProjectDocument);
  const afterScope = findScope(nextProjectDocument, selection);
  if (!afterScope) {
    throw new InterventionScopeError(
      "A intervenção removeu o contexto selecionado.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }
  (previousProjectDocument.courses || []).forEach((course, courseIndex) => {
    if (course.id !== beforeScope.course.id) {
      assertEqual(
        course,
        nextProjectDocument.courses[courseIndex],
        "A intervenção tentou alterar outro curso."
      );
    }
  });
  assertLessonBoundary(beforeScope, afterScope);

  const createsBranch = text(targetMode) === "new_after_current" || text(actionIntent) === "branch_after_current";
  if (createsBranch) {
    assertBranchChange(beforeScope, afterScope, normalizedTargetKey);
    return { mode: "branch", targetMicrosequenceKey: normalizedTargetKey };
  }
  if (text(actionIntent) === "next_planned") {
    assertNextPlannedTarget(beforeScope, normalizedTargetKey);
  } else if (normalizedTargetKey !== beforeScope.microsequence.id) {
    throw new InterventionScopeError(
      "A intervenção tentou aplicar a resposta em outra microssequência.",
      "INVALID_TARGET"
    );
  }
  assertExistingMicrosequenceChange(beforeScope, afterScope, normalizedTargetKey);
  return { mode: "existing", targetMicrosequenceKey: normalizedTargetKey };
}
