import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import { validateCard } from "../domain/cards.js";

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

function findCardScope(scope, cardKey) {
  const normalizedCardKey = text(cardKey);
  const cards = Array.isArray(scope?.microsequence?.cards) ? scope.microsequence.cards : [];
  const matches = cards
    .map((card, cardIndex) => ({ card, cardIndex }))
    .filter(({ card }) => card?.id === normalizedCardKey);
  if (!normalizedCardKey || matches.length !== 1) {
    throw new InterventionScopeError(
      "O card selecionado não pertence uma única vez à microssequência autorizada.",
      "INVALID_GRANULAR_SELECTION"
    );
  }
  return matches[0];
}

function normalizeBlockIndexes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InterventionScopeError(
      "Selecione ao menos um bloco do card.",
      "INVALID_GRANULAR_SELECTION"
    );
  }
  const normalized = value.map((blockIndex) => Number(blockIndex));
  if (normalized.some((blockIndex) => !Number.isInteger(blockIndex) || blockIndex < 0)) {
    throw new InterventionScopeError(
      "A seleção contém índice de bloco inválido.",
      "INVALID_GRANULAR_SELECTION"
    );
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new InterventionScopeError(
      "A seleção contém o mesmo bloco mais de uma vez.",
      "INVALID_GRANULAR_SELECTION"
    );
  }
  return normalized.sort((left, right) => left - right);
}

function blockIdentity(block, blockIndex) {
  const explicitId = text(block?.id);
  return explicitId ? `id:${explicitId}` : `content:${blockIndex}`;
}

function resolveGranularTarget(scope, target = {}) {
  const level = text(target?.level);
  if (level !== "card" && level !== "blocks") {
    throw new InterventionScopeError(
      "O escopo granular deve apontar para um card inteiro ou para blocos do card.",
      "INVALID_GRANULAR_SELECTION"
    );
  }
  const { card, cardIndex } = findCardScope(scope, target?.cardKey);
  const normalized = {
    level,
    cardKey: card.id,
    cardIndex
  };
  if (level === "card") {
    if ((Array.isArray(target?.blockIndexes) && target.blockIndexes.length) ||
        (Array.isArray(target?.blocks) && target.blocks.length)) {
      throw new InterventionScopeError(
        "O escopo de card inteiro não pode declarar blocos isolados.",
        "INVALID_GRANULAR_SELECTION"
      );
    }
    return normalized;
  }

  const blocks = Array.isArray(card?.blocks) ? card.blocks : null;
  if (!blocks) {
    throw new InterventionScopeError(
      "O card selecionado não possui uma coleção de blocos editáveis isoladamente.",
      "INVALID_GRANULAR_SELECTION"
    );
  }
  const requestedIndexes = Array.isArray(target?.blockIndexes)
    ? target.blockIndexes
    : Array.isArray(target?.blocks)
      ? target.blocks.map((block) => block?.blockIndex)
      : [];
  const blockIndexes = normalizeBlockIndexes(requestedIndexes);
  if (blockIndexes.some((blockIndex) => blockIndex >= blocks.length)) {
    throw new InterventionScopeError(
      "A seleção aponta para um bloco inexistente no card.",
      "INVALID_GRANULAR_SELECTION"
    );
  }
  const allIdentities = blocks.map((block, blockIndex) => blockIdentity(block, blockIndex));
  if (new Set(allIdentities).size !== allIdentities.length) {
    throw new InterventionScopeError(
      "O card contém identidades de bloco ambíguas.",
      "INVALID_GRANULAR_SELECTION"
    );
  }
  return {
    ...normalized,
    blocks: blockIndexes.map((blockIndex) => ({
      blockIndex,
      blockIdentity: allIdentities[blockIndex]
    }))
  };
}

function granularTargetRequest(target = {}) {
  return {
    level: target?.level,
    cardKey: target?.cardKey,
    ...(target?.level === "blocks"
      ? { blockIndexes: (target?.blocks || []).map((block) => block?.blockIndex) }
      : {})
  };
}

function granularContextForSnapshot(projectDocument, scope, target) {
  return {
    context: contextForSnapshot(projectDocument, scope),
    target
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

function assertGranularCardComposition(beforeScope, afterScope, target) {
  const beforeCards = Array.isArray(beforeScope?.microsequence?.cards)
    ? beforeScope.microsequence.cards
    : [];
  const afterCards = Array.isArray(afterScope?.microsequence?.cards)
    ? afterScope.microsequence.cards
    : [];
  assertEqual(
    beforeCards.map((card) => card?.id),
    afterCards.map((card) => card?.id),
    "A intervenção tentou criar, remover, substituir ou reordenar cards."
  );
  assertEqual(
    beforeCards.map((card) => card?.position),
    afterCards.map((card) => card?.position),
    "A intervenção tentou alterar a ordem dos cards."
  );
  beforeCards.forEach((card, cardIndex) => {
    if (cardIndex !== target.cardIndex) {
      assertEqual(card, afterCards[cardIndex], "A intervenção tentou alterar outro card.");
    }
  });
  return {
    beforeCard: beforeCards[target.cardIndex],
    afterCard: afterCards[target.cardIndex]
  };
}

function blockInvariant(block = {}, blockIndex) {
  return {
    identity: blockIdentity(block, blockIndex),
    kind: text(block?.kind),
    hasId: Object.hasOwn(block || {}, "id"),
    id: block?.id,
    hasPosition: Object.hasOwn(block || {}, "position"),
    position: block?.position
  };
}

function assertSelectedBlocksChange(beforeCard, afterCard, target) {
  assertEqual(
    omit(beforeCard, ["blocks"]),
    omit(afterCard, ["blocks"]),
    "A intervenção em blocos tentou alterar propriedades do card."
  );
  const beforeBlocks = Array.isArray(beforeCard?.blocks) ? beforeCard.blocks : [];
  const afterBlocks = Array.isArray(afterCard?.blocks) ? afterCard.blocks : [];
  if (beforeBlocks.length !== afterBlocks.length) {
    throw new InterventionScopeError(
      "A intervenção em blocos tentou criar ou remover blocos.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }
  const selectedIndexes = new Set(target.blocks.map((block) => block.blockIndex));
  beforeBlocks.forEach((block, blockIndex) => {
    const afterBlock = afterBlocks[blockIndex];
    if (!afterBlock || typeof afterBlock !== "object" || Array.isArray(afterBlock)) {
      throw new InterventionScopeError(
        "A intervenção em blocos produziu um bloco inválido.",
        "OUT_OF_SCOPE_CHANGE"
      );
    }
    assertEqual(
      blockInvariant(block, blockIndex),
      blockInvariant(afterBlock, blockIndex),
      "A intervenção em blocos tentou substituir a identidade, o tipo ou a posição de um bloco."
    );
    if (!selectedIndexes.has(blockIndex)) {
      assertEqual(block, afterBlock, "A intervenção tentou alterar um bloco não selecionado.");
    }
  });
}

function assertGranularExistingMicrosequenceChange(beforeScope, afterScope, target) {
  const targetMicrosequenceKey = beforeScope.microsequence.id;
  assertExistingMicrosequenceChange(beforeScope, afterScope, targetMicrosequenceKey);
  assertEqual(
    omit(beforeScope.microsequence, ["cards"]),
    omit(afterScope.microsequence, ["cards"]),
    "A intervenção granular tentou alterar propriedades da microssequência."
  );
  const { beforeCard, afterCard } = assertGranularCardComposition(beforeScope, afterScope, target);
  if (!beforeCard || !afterCard) {
    throw new InterventionScopeError(
      "O card selecionado deixou de existir durante a intervenção.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }
  const cardValidation = validateCard(afterCard, "$.intervention.card");
  if (!cardValidation.ok) {
    const firstIssue = cardValidation.errors?.[0];
    throw new InterventionScopeError(
      `A intervenção produziu um card inválido${firstIssue?.path ? ` em ${firstIssue.path}` : ""}.`,
      "INVALID_GRANULAR_RESULT"
    );
  }
  if (target.level === "card") {
    assertEqual(
      { id: beforeCard.id, position: beforeCard.position },
      { id: afterCard.id, position: afterCard.position },
      "A intervenção no card tentou alterar sua identidade ou posição."
    );
    return;
  }
  assertSelectedBlocksChange(beforeCard, afterCard, target);
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

export function buildGranularInterventionScopeSnapshot(
  projectDocument = {},
  selection = {},
  target = {}
) {
  const scope = findScope(projectDocument, selection);
  if (!scope) {
    throw new InterventionScopeError(
      "Selecione uma microssequência válida antes de iniciar a intervenção granular.",
      "INVALID_SELECTION"
    );
  }
  const normalizedTarget = resolveGranularTarget(scope, target);
  return {
    selection: scope.selection,
    target: normalizedTarget,
    contextFingerprint: fingerprint(
      granularContextForSnapshot(projectDocument, scope, normalizedTarget)
    )
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

export function assertGranularInterventionResumeScope({
  savedSnapshot,
  projectDocument = {},
  selection = {}
} = {}) {
  if (!savedSnapshot?.contextFingerprint || !savedSnapshot?.selection || !savedSnapshot?.target) {
    throw new InterventionScopeError(
      "A intervenção granular anterior não possui contexto verificável. Inicie um novo pedido.",
      "STALE_INTERVENTION_SCOPE"
    );
  }
  let current;
  try {
    current = buildGranularInterventionScopeSnapshot(
      projectDocument,
      selection,
      granularTargetRequest(savedSnapshot.target)
    );
  } catch (error) {
    if (!(error instanceof InterventionScopeError)) throw error;
    throw new InterventionScopeError(
      "O card ou os blocos mudaram desde a tentativa anterior. Inicie um novo pedido.",
      "STALE_INTERVENTION_SCOPE"
    );
  }
  if (!equals(savedSnapshot.selection, current.selection) ||
      !equals(savedSnapshot.target, current.target) ||
      savedSnapshot.contextFingerprint !== current.contextFingerprint) {
    throw new InterventionScopeError(
      "O card ou os blocos mudaram desde a tentativa anterior. Inicie um novo pedido.",
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

export function assertGranularInterventionResultScope({
  previousProjectDocument = {},
  nextProjectDocument = {},
  selection = {},
  scopeSnapshot
} = {}) {
  const verifiedSnapshot = assertGranularInterventionResumeScope({
    savedSnapshot: scopeSnapshot,
    projectDocument: previousProjectDocument,
    selection
  });
  const beforeScope = findScope(previousProjectDocument, selection);
  assertDocumentEnvelope(previousProjectDocument, nextProjectDocument);
  const afterScope = findScope(nextProjectDocument, selection);
  if (!beforeScope || !afterScope) {
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
  assertGranularExistingMicrosequenceChange(beforeScope, afterScope, verifiedSnapshot.target);
  return {
    mode: "granular",
    level: verifiedSnapshot.target.level,
    targetMicrosequenceKey: beforeScope.microsequence.id,
    cardKey: verifiedSnapshot.target.cardKey,
    blockIndexes: verifiedSnapshot.target.level === "blocks"
      ? verifiedSnapshot.target.blocks.map((block) => block.blockIndex)
      : []
  };
}
