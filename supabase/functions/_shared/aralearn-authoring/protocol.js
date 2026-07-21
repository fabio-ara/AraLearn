import { AuthoringApiError } from "./errors.js";
import { validateProjectDocument } from "../aralearn/runtime/domain/aralearnProject.js";

export const STANDARD_BODY_LIMIT = 96 * 1024;
export const PLAN_BODY_LIMIT = 4 * 1024 * 1024;
// GPT Actions e integrações equivalentes trabalham melhor com operações
// pequenas. Sessões humanas ainda podem usar o limite amplo para importação
// administrativa, mas clientes por chave recebem este teto no plano compacto.
export const ACTION_PLAN_BODY_LIMIT = 96 * 1024;
export const ACTION_RESPONSE_BODY_LIMIT = 90 * 1024;
// Inclui o envelope JSON completo e deixa margem para os limites da Edge.
export const MANUAL_IMPORT_BODY_LIMIT = 5 * 1024 * 1024;
export const PART_FRAGMENT_LIMIT = 90 * 1024;
export const PART_SPECIFICATION_LIMIT = 48 * 1024;
export const LEDGER_CHUNK_BODY_LIMIT = 64 * 1024;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PART_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SUBMISSION_RECEIPT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PART_MODES = new Set(["build", "repair", "rebuild"]);
const AUDIT_DECISIONS = new Set(["approve", "repair", "rebuild", "blocked"]);
const AUDIT_GATES = Object.freeze([
  "planAlignment", "contract", "outcomeCoverage", "sources", "continuity",
  "interactionCoherence", "language", "fieldPreservation", "structuredElements",
  "feedback"
]);
const SOURCE_KINDS = new Set([
  "attachment", "book", "article", "standard", "documentation", "web", "dataset", "other"
]);
const SOURCE_STABILITY = new Set(["stable", "versioned", "volatile"]);
const CLAIM_CONFIDENCE = new Set(["high", "medium", "low"]);
const CARD_RESOURCES = new Set([
  "paragraph", "choice", "composite", "code", "table", "flow", "tree",
  "graph", "relation_map", "matrix", "plane"
]);
const CARD_KINDS = new Set(["theory", "exercise"]);
const CARD_EXERCISES = new Set(["none", "gap", "choice"]);
const LEARNING_FUNCTIONS = new Set([
  "foundation", "worked_example", "guided_practice", "independent_practice",
  "contrast", "error_diagnosis", "integration"
]);
const PRACTICE_FUNCTIONS = new Set([
  "guided_practice", "independent_practice", "contrast", "error_diagnosis", "integration"
]);
const LEDGER_SECTIONS = new Set(["sources", "claims", "terms"]);
const MICROSEQUENCE_ROLES = new Set(["explain", "practice", "review", "support"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function boundedObject(value, field, { maxBytes = 32 * 1024, required = false } = {}) {
  if (value == null && !required) return {};
  if (!isPlainObject(value)) {
    throw new AuthoringApiError(422, "invalid_payload", `${field} deve ser um objeto.`);
  }
  if (byteLength(value) > maxBytes) {
    throw new AuthoringApiError(413, "payload_too_large", `${field} excede o tamanho permitido.`);
  }
  return value;
}

function validateStateDelta(value) {
  const delta = boundedObject(value, "stateDelta", { required: true });
  const fields = [
    "introducedTermIds",
    "usedClaimIds",
    "coveredOutcomeIds",
    "resolvedErrorIds",
    "notes"
  ];
  const unknown = Object.keys(delta).filter((field) => !fields.includes(field));
  if (unknown.length) {
    throw new AuthoringApiError(422, "invalid_state_delta", `Campo desconhecido em stateDelta: ${unknown[0]}.`);
  }
  for (const field of fields) {
    const values = delta[field];
    if (!Array.isArray(values) || values.length > 1000 || values.some(
      (entry) => typeof entry !== "string" || !entry.trim() || entry.trim().length > 500
    )) {
      throw new AuthoringApiError(
        422,
        "invalid_state_delta",
        `stateDelta.${field} deve ser uma lista de textos sucintos.`
      );
    }
    if (new Set(values.map((entry) => entry.trim())).size !== values.length) {
      throw new AuthoringApiError(422, "invalid_state_delta", `stateDelta.${field} contém duplicatas.`);
    }
  }
  return Object.fromEntries(fields.map((field) => [field, delta[field].map((entry) => entry.trim())]));
}

function requiredText(value, field, { max = 500 } = {}) {
  const result = typeof value?.[field] === "string" ? value[field].trim() : "";
  if (!result) {
    throw new AuthoringApiError(422, "invalid_payload", `${field} é obrigatório.`);
  }
  if (result.length > max) {
    throw new AuthoringApiError(422, "invalid_payload", `${field} excede o tamanho permitido.`);
  }
  return result;
}

function optionalText(value, field, { max = 500 } = {}) {
  if (value?.[field] == null) return undefined;
  if (typeof value[field] !== "string" || value[field].length > max) {
    planError(`${field} deve ser texto com até ${max} caracteres.`);
  }
  return value[field].trim();
}

function optionalIsoDate(value, field) {
  const result = optionalText(value, field, { max: 10 });
  if (result == null) return undefined;
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (!result || !ISO_DATE_PATTERN.test(result)
      || Number.isNaN(parsed.valueOf())
      || parsed.toISOString().slice(0, 10) !== result) {
    planError(`${field} deve usar o formato ISO YYYY-MM-DD.`);
  }
  return result;
}

function objectList(value, field, { max = 5000 } = {}) {
  if (!Array.isArray(value) || value.length > max || value.some((entry) => !isPlainObject(entry))) {
    planError(`${field} deve ser uma lista de objetos.`);
  }
  return value;
}

function uniqueRecordIds(records, field, idField) {
  const seen = new Set();
  for (const record of records) {
    const id = requiredText(record, idField, { max: 160 });
    if (seen.has(id)) planError(`${field} contém ${idField} duplicado: ${id}.`);
    seen.add(id);
  }
  return seen;
}

function assertReferences(values, allowed, field) {
  const missing = values.find((value) => !allowed.has(value));
  if (missing) planError(`${field} aponta para identificador inexistente: ${missing}.`);
}

function sameJson(left, right) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, normalize(value[key])])
      );
    }
    return value;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function projectStructureSlice(course, moduleValue, lesson) {
  return {
    course: {
      id: course.id,
      title: course.title,
      goal: course.goal
    },
    module: {
      id: moduleValue.id,
      title: moduleValue.title,
      guide: structuredClone(moduleValue.guide)
    },
    lesson: {
      id: lesson.id,
      title: lesson.title,
      guide: structuredClone(lesson.guide),
      topics: structuredClone(lesson.topics)
    }
  };
}

function assertCardExerciseShape(card, label) {
  if (card.kind === "theory") {
    if (card.exercise !== "none") {
      planError(`${label}: card teórico deve usar exercise none.`);
    }
    return;
  }
  if (card.exercise === "none") {
    planError(`${label}: card de exercício deve usar gap ou choice.`);
  }
  const allowed = card.resource === "paragraph"
    ? new Set(["gap"])
    : card.resource === "code"
      ? new Set(["gap", "choice"])
      : new Set(["choice"]);
  if (!allowed.has(card.exercise)) {
    planError(`${label}: exercise ${card.exercise} não é compatível com resource ${card.resource}.`);
  }
}

function validateLedgerManifest(value, runId) {
  if (!isPlainObject(value)) planError("plan.ledgerManifest é obrigatório.");
  const allowed = new Set(["artifact", "version", "runId", "sections", "openIssues"]);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length) planError(`plan.ledgerManifest contém campo desconhecido: ${unknown[0]}.`);
  if (value.artifact !== "aralearn.course-ledger-manifest" || value.version !== 1
      || validateRunId(value.runId) !== runId || !isPlainObject(value.sections)) {
    planError("plan.ledgerManifest deve identificar a execução e usar a versão 1.");
  }
  const sectionNames = Object.keys(value.sections);
  if (sectionNames.length !== LEDGER_SECTIONS.size
      || sectionNames.some((section) => !LEDGER_SECTIONS.has(section))) {
    planError("plan.ledgerManifest.sections deve declarar sources, claims e terms.");
  }
  const sections = {};
  for (const section of LEDGER_SECTIONS) {
    const descriptor = value.sections[section];
    if (!isPlainObject(descriptor)
        || Object.keys(descriptor).some((field) => !["chunkCount", "itemCount"].includes(field))
        || !Number.isInteger(descriptor.chunkCount) || descriptor.chunkCount < 0 || descriptor.chunkCount > 1000
        || !Number.isInteger(descriptor.itemCount) || descriptor.itemCount < 0 || descriptor.itemCount > 100000
        || (descriptor.itemCount === 0) !== (descriptor.chunkCount === 0)) {
      planError(`plan.ledgerManifest.sections.${section} é inválido.`);
    }
    sections[section] = { chunkCount: descriptor.chunkCount, itemCount: descriptor.itemCount };
  }
  return {
    artifact: "aralearn.course-ledger-manifest",
    version: 1,
    runId,
    sections,
    openIssues: stringSet(value.openIssues || [], "plan.ledgerManifest.openIssues", { max: 500 })
  };
}

function validateCoursePlan(value, project) {
  if (!isPlainObject(value)) planError("plan.course é obrigatório.");
  const allowed = new Set([
    "id", "title", "goal", "audience", "prerequisites", "depth", "language",
    "include", "exclude", "notation", "modules"
  ]);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length) planError(`plan.course contém campo desconhecido: ${unknown[0]}.`);
  const projectCourse = project.courses[0];
  const modules = objectList(value.modules, "plan.course.modules", { max: 500 }).map((moduleValue) => {
    const fields = Object.keys(moduleValue);
    if (fields.some((field) => !["id", "title", "goal", "lessonIds"].includes(field))) {
      planError("plan.course.modules contém campo desconhecido.");
    }
    const id = requiredText(moduleValue, "id", { max: 160 });
    const projectModule = projectCourse.modules.find((item) => item.id === id);
    if (!projectModule) planError(`plan.course.modules aponta para módulo inexistente: ${id}.`);
    const lessonIds = stringSet(moduleValue.lessonIds, `plan.course.modules[${id}].lessonIds`, { min: 1 });
    const expectedLessonIds = new Set(projectModule.lessons.map((lesson) => lesson.id));
    assertReferences(lessonIds, expectedLessonIds, `plan.course.modules[${id}].lessonIds`);
    if (lessonIds.length !== expectedLessonIds.size) planError(`plan.course.modules[${id}] deve cobrir todas as lições.`);
    return {
      id,
      title: requiredText(moduleValue, "title", { max: 240 }),
      goal: requiredText(moduleValue, "goal", { max: 20000 }),
      lessonIds
    };
  });
  if (!modules.length || modules.length !== projectCourse.modules.length) {
    planError("plan.course.modules deve corresponder ao esqueleto integral.");
  }
  uniqueRecordIds(modules, "plan.course.modules", "id");
  const id = requiredText(value, "id", { max: 160 });
  if (id !== projectCourse.id) planError("plan.course.id diverge do esqueleto.");
  return {
    id,
    title: requiredText(value, "title", { max: 240 }),
    goal: requiredText(value, "goal", { max: 20000 }),
    audience: requiredText(value, "audience", { max: 20000 }),
    prerequisites: stringSet(value.prerequisites || [], "plan.course.prerequisites"),
    depth: requiredText(value, "depth", { max: 20000 }),
    language: requiredText(value, "language", { max: 35 }),
    include: stringSet(value.include || [], "plan.course.include"),
    exclude: stringSet(value.exclude || [], "plan.course.exclude"),
    notation: stringSet(value.notation || [], "plan.course.notation"),
    modules
  };
}

function validateConceptMap(value) {
  if (!isPlainObject(value) || Object.keys(value).some((field) => !["concepts", "relations"].includes(field))) {
    planError("plan.conceptMap é inválido.");
  }
  const concepts = objectList(value.concepts, "plan.conceptMap.concepts", { max: 10000 }).map((concept) => ({
    id: requiredText(concept, "id", { max: 160 }),
    label: requiredText(concept, "label", { max: 1000 })
  }));
  if (!concepts.length) planError("plan.conceptMap.concepts não pode ser vazio.");
  const conceptIds = uniqueRecordIds(concepts, "plan.conceptMap.concepts", "id");
  const relations = objectList(value.relations, "plan.conceptMap.relations", { max: 20000 }).map((relation) => {
    if (Object.keys(relation).some((field) => !["from", "to", "relation"].includes(field))) {
      planError("plan.conceptMap.relations contém campo desconhecido.");
    }
    const normalized = {
      from: requiredText(relation, "from", { max: 160 }),
      to: requiredText(relation, "to", { max: 160 }),
      relation: requiredText(relation, "relation", { max: 1000 })
    };
    assertReferences([normalized.from, normalized.to], conceptIds, "plan.conceptMap.relations");
    return normalized;
  });
  return { concepts, relations };
}

function validateLearningOutcomes(value) {
  const outcomes = objectList(value, "plan.learningOutcomes", { max: 5000 });
  if (outcomes.length === 0) {
    planError("plan.learningOutcomes deve conter ao menos um resultado de aprendizagem.");
  }
  const normalized = outcomes.map((outcome, index) => {
    const label = `plan.learningOutcomes[${index}]`;
    const unknown = Object.keys(outcome).filter(
      (field) => !["id", "statement", "evidence"].includes(field)
    );
    if (unknown.length) planError(`${label} contém campo desconhecido: ${unknown[0]}.`);
    const id = requiredText(outcome, "id", { max: 160 });
    if (!IDENTIFIER_PATTERN.test(id)) {
      planError(`${label}.id deve ser um identificador estável.`);
    }
    return {
      id,
      statement: requiredText(outcome, "statement", { max: 20000 }),
      evidence: requiredText(outcome, "evidence", { max: 20000 })
    };
  });
  uniqueRecordIds(normalized, "plan.learningOutcomes", "id");
  return normalized;
}

function planError(message, details = undefined) {
  throw new AuthoringApiError(422, "invalid_plan", message, details);
}

function stringSet(value, field, { min = 0, max = 1000 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some(
    (entry) => typeof entry !== "string" || !entry.trim() || entry.trim().length > 500
  )) {
    planError(`${field} deve ser uma lista de identificadores.`);
  }
  const normalized = value.map((entry) => entry.trim());
  if (new Set(normalized).size !== normalized.length) planError(`${field} contém duplicatas.`);
  return normalized;
}

function validateProjectSkeleton(project) {
  if (!isPlainObject(project)) planError("plan.project é obrigatório.");
  const validation = validateProjectDocument(project);
  if (!validation.ok) {
    planError("plan.project viola o contrato AraLearn v3.", { errors: validation.errors });
  }
  const normalized = validation.value;
  if (normalized.contract !== "aralearn.contract" || normalized.version !== 3
      || normalized.kind !== "project" || normalized.courses.length !== 1) {
    planError("plan.project deve conter exatamente um curso AraLearn v3.");
  }
  const course = normalized.courses[0];
  if (!Array.isArray(course.modules) || course.modules.length === 0) {
    planError("O esqueleto deve conter ao menos um módulo.");
  }
  for (const moduleValue of course.modules) {
    if (!Array.isArray(moduleValue.lessons) || moduleValue.lessons.length === 0) {
      planError(`O módulo ${moduleValue.id} deve conter ao menos uma lição.`);
    }
    for (const lesson of moduleValue.lessons) {
      if (!Array.isArray(lesson.microsequences) || lesson.microsequences.length !== 0) {
        planError(`A lição ${lesson.id} deve manter microsequences vazia no esqueleto.`);
      }
    }
  }
  return normalized;
}

function validatePartOutline(part, index, project) {
  const label = `plan.parts[${index}]`;
  const allowedFields = new Set([
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys",
    "ownership", "cardIds", "outcomeIds"
  ]);
  const unknown = Object.keys(part).filter((field) => !allowedFields.has(field));
  if (unknown.length) planError(`${label} contém campo desconhecido: ${unknown[0]}.`);
  const ownership = boundedObject(part.ownership, `${label}.ownership`, { required: true });
  const normalizedOwnership = {
    courseId: requiredText(ownership, "courseId", { max: 160 }),
    moduleId: requiredText(ownership, "moduleId", { max: 160 }),
    lessonId: requiredText(ownership, "lessonId", { max: 160 }),
    microsequenceIds: stringSet(ownership.microsequenceIds, `${label}.ownership.microsequenceIds`, { min: 1 })
  };
  const course = project.courses.find((item) => item.id === normalizedOwnership.courseId);
  const moduleValue = course?.modules.find((item) => item.id === normalizedOwnership.moduleId);
  const lesson = moduleValue?.lessons.find((item) => item.id === normalizedOwnership.lessonId);
  if (!course || !moduleValue || !lesson) planError(`${label}.ownership aponta para uma estrutura inexistente.`);
  return {
    key: validatePartKey(part.key),
    title: requiredText(part, "title", { max: 300 }),
    boundary: requiredText(part, "boundary", { max: 20000 }),
    cutReason: requiredText(part, "cutReason", { max: 20000 }),
    dependsOnPartKeys: stringSet(part.dependsOnPartKeys || [], `${label}.dependsOnPartKeys`),
    ownership: normalizedOwnership,
    cardIds: stringSet(part.cardIds, `${label}.cardIds`, { min: 1, max: 1000 }),
    outcomeIds: stringSet(part.outcomeIds, `${label}.outcomeIds`, { min: 1, max: 1000 })
  };
}

function validatePartSpecification(part, index, project) {
  const label = `specification`;
  const allowedFields = new Set([
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys", "ownership",
    "outcomeIds", "structure", "cardPlan", "allowedSourceIds", "availableTermIds", "preserve"
  ]);
  const unknownFields = Object.keys(part || {}).filter((field) => !allowedFields.has(field));
  if (unknownFields.length) planError(`${label} contém campo desconhecido: ${unknownFields[0]}.`);
  const outline = validatePartOutline(Object.fromEntries([
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys",
    "ownership", "outcomeIds"
  ].map((field) => [field, part?.[field]]).concat([[
    "cardIds",
    Array.isArray(part?.cardPlan) ? part.cardPlan.map((card) => card?.cardId) : []
  ]])), index, project);
  const normalizedOwnership = outline.ownership;
  const structure = boundedObject(part.structure, `${label}.structure`, { required: true });
  if (Object.keys(structure).some((field) => !["course", "module", "lesson", "microsequences"].includes(field))) {
    planError(`${label}.structure contém campo desconhecido.`);
  }
  const projectCourse = project?.courses?.find((item) => item.id === normalizedOwnership.courseId);
  const projectModule = projectCourse?.modules?.find((item) => item.id === normalizedOwnership.moduleId);
  const projectLesson = projectModule?.lessons?.find((item) => item.id === normalizedOwnership.lessonId);
  if (!projectCourse || !projectModule || !projectLesson) {
    planError(`${label}.structure aponta para uma estrutura inexistente.`);
  }
  const expectedStructure = projectStructureSlice(projectCourse, projectModule, projectLesson);
  for (const field of ["course", "module", "lesson"]) {
    if (!isPlainObject(structure[field]) || !sameJson(structure[field], expectedStructure[field])) {
      planError(`${label}.structure.${field} diverge semanticamente do esqueleto do projeto.`);
    }
  }
  const cardPlan = part.cardPlan;
  if (!Array.isArray(cardPlan) || cardPlan.length === 0 || cardPlan.length > 1000
      || cardPlan.some((item) => !isPlainObject(item))) {
    planError(`${label}.cardPlan deve conter de 1 a 1000 cards planejados.`);
  }
  const owned = new Set(normalizedOwnership.microsequenceIds);
  const structuredMicrosequences = Array.isArray(structure.microsequences)
    ? structure.microsequences
    : [];
  const structuredIds = structuredMicrosequences.map((microsequence) => String(microsequence?.id || "").trim());
  if (structuredIds.length !== owned.size || new Set(structuredIds).size !== owned.size
      || structuredIds.some((id) => !owned.has(id))) {
    planError(`${label}.structure.microsequences deve corresponder exatamente à propriedade da parte.`);
  }
  for (const microsequence of structuredMicrosequences) {
    const allowedMicroFields = new Set([
      "id", "title", "goal", "role", "status", "dependsOn", "dependencyRationale",
      "covers", "checks", "errors"
    ]);
    const unknown = Object.keys(microsequence).filter((field) => !allowedMicroFields.has(field));
    if (unknown.length) planError(`${label}.structure.microsequences contém campo desconhecido: ${unknown[0]}.`);
    for (const field of ["title", "goal", "role", "status"]) requiredText(microsequence, field, { max: 20000 });
    if (!MICROSEQUENCE_ROLES.has(microsequence.role)) {
      planError(`${label}.structure.microsequences[].role é inváido.`);
    }
    if (microsequence.status !== "planned") {
      planError(`${label}.structure.microsequences[].status deve ser planned.`);
    }
    const dependencies = stringSet(microsequence.dependsOn || [], `${label}.structure.microsequences[].dependsOn`);
    const rationale = boundedObject(
      microsequence.dependencyRationale || {},
      `${label}.structure.microsequences[].dependencyRationale`,
      { required: true }
    );
    if (Object.keys(rationale).length !== dependencies.length
        || Object.keys(rationale).some((dependency) => !dependencies.includes(dependency))) {
      planError(`${label}.structure.microsequences[].dependencyRationale deve justificar cada dependência.`);
    }
    dependencies.forEach((dependency) => {
      if (typeof rationale[dependency] !== "string" || !rationale[dependency].trim()
          || rationale[dependency].length > 4000) {
        planError(`${label}.structure.microsequences[].dependencyRationale é inválido.`);
      }
    });
    for (const field of ["covers", "checks", "errors"]) {
      stringSet(microsequence[field] || [], `${label}.structure.microsequences[].${field}`);
    }
  }
  const seenCardIds = new Set();
  const normalizedCardPlan = cardPlan.map((card) => {
    const allowedCardFields = new Set([
      "cardId", "microsequenceId", "position", "resource", "kind", "exercise",
      "purpose", "evidence", "targetError", "learningFunction", "resourceRationale",
      "variationFocus", "introducedTermIds", "requiredTermIds", "sourceIds", "claimIds"
    ]);
    const unknown = Object.keys(card).filter((field) => !allowedCardFields.has(field));
    if (unknown.length) planError(`${label}.cardPlan contém campo desconhecido: ${unknown[0]}.`);
    const cardId = requiredText(card, "cardId", { max: 160 });
    const microsequenceId = requiredText(card, "microsequenceId", { max: 160 });
    const position = Number(card.position);
    const resource = requiredText(card, "resource", { max: 40 });
    const kind = requiredText(card, "kind", { max: 40 });
    const exercise = requiredText(card, "exercise", { max: 40 });
    const learningFunction = requiredText(card, "learningFunction", { max: 40 });
    if (seenCardIds.has(cardId)) planError(`${label}.cardPlan contém cardId duplicado: ${cardId}.`);
    seenCardIds.add(cardId);
    if (!owned.has(microsequenceId)) {
      planError(`${label}.cardPlan contém card fora das microssequências reservadas.`);
    }
    if (!Number.isInteger(position) || position < 1) {
      planError(`${label}.cardPlan.position deve ser inteiro positivo.`);
    }
    if (!CARD_RESOURCES.has(resource) || !CARD_KINDS.has(kind) || !CARD_EXERCISES.has(exercise)) {
      planError(`${label}.cardPlan contém resource, kind ou exercise inválido.`);
    }
    assertCardExerciseShape({ resource, kind, exercise }, `${label}.cardPlan[${cardId}]`);
    if (!LEARNING_FUNCTIONS.has(learningFunction)) {
      planError(`${label}.cardPlan contém learningFunction inválida.`);
    }
    const normalized = {
      cardId,
      microsequenceId,
      position,
      resource,
      kind,
      exercise,
      purpose: requiredText(card, "purpose", { max: 20000 }),
      evidence: requiredText(card, "evidence", { max: 20000 }),
      learningFunction,
      resourceRationale: requiredText(card, "resourceRationale", { max: 20000 }),
      introducedTermIds: stringSet(card.introducedTermIds, `${label}.cardPlan[].introducedTermIds`),
      requiredTermIds: stringSet(card.requiredTermIds, `${label}.cardPlan[].requiredTermIds`),
      sourceIds: stringSet(card.sourceIds, `${label}.cardPlan[].sourceIds`),
      claimIds: stringSet(card.claimIds || [], `${label}.cardPlan[].claimIds`)
    };
    if (kind === "exercise" || PRACTICE_FUNCTIONS.has(learningFunction)) {
      normalized.targetError = requiredText(card, "targetError", { max: 20000 });
      normalized.variationFocus = requiredText(card, "variationFocus", { max: 20000 });
    } else {
      const targetError = optionalText(card, "targetError", { max: 20000 });
      const variationFocus = optionalText(card, "variationFocus", { max: 20000 });
      if (targetError !== undefined) normalized.targetError = targetError;
      if (variationFocus !== undefined) normalized.variationFocus = variationFocus;
    }
    return normalized;
  });
  for (const microsequenceId of owned) {
    const cardsForMicrosequence = normalizedCardPlan
      .filter((card) => card.microsequenceId === microsequenceId)
      .sort((left, right) => left.position - right.position);
    const positions = cardsForMicrosequence
      .map((card) => card.position)
    if (!positions.length || positions.some((position, index) => position !== index + 1)) {
      planError(`${label}.cardPlan deve usar posições contínuas em ${microsequenceId}.`);
    }
  }
  const preserve = stringSet(part.preserve || [], `${label}.preserve`);
  if (preserve.some((pointer) => !pointer.startsWith("/"))) {
    planError(`${label}.preserve deve usar JSON Pointer.`);
  }
  return {
    ...part,
    ...outline,
    structure,
    cardPlan: normalizedCardPlan,
    allowedSourceIds: stringSet(part.allowedSourceIds, `${label}.allowedSourceIds`),
    availableTermIds: stringSet(part.availableTermIds || [], `${label}.availableTermIds`),
    preserve
  };
}

function assertDidacticCausality(specification, continuity = {}) {
  const microsequences = new Map(
    specification.structure.microsequences.map((microsequence) => [microsequence.id, microsequence])
  );
  const external = new Set(
    Array.isArray(continuity.dependencyMicrosequenceIds)
      ? continuity.dependencyMicrosequenceIds
      : []
  );
  const externalFounded = new Set(
    Array.isArray(continuity.foundedMicrosequenceIds)
      ? continuity.foundedMicrosequenceIds
      : []
  );
  const cardsByMicrosequence = new Map([...microsequences.keys()].map((id) => [
    id,
    specification.cardPlan
      .filter((card) => card.microsequenceId === id)
      .sort((left, right) => left.position - right.position)
  ]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) planError(`dependency-cycle: ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of microsequences.get(id)?.dependsOn || []) {
      if (!microsequences.has(dependency) && !external.has(dependency)) {
        planError(`dependency-missing: ${id} depende de ${dependency} fora do limite causal.`);
      }
      if (microsequences.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of microsequences.keys()) visit(id);

  const foundationMemo = new Map();
  function hasFoundation(id, stack = new Set()) {
    if (external.has(id)) return externalFounded.has(id);
    if (foundationMemo.has(id)) return foundationMemo.get(id);
    if (stack.has(id)) return false;
    stack.add(id);
    const local = (cardsByMicrosequence.get(id) || []).some(
      (card) => ["foundation", "worked_example"].includes(card.learningFunction)
    );
    const inherited = local || (microsequences.get(id)?.dependsOn || [])
      .some((dependency) => hasFoundation(dependency, new Set(stack)));
    foundationMemo.set(id, inherited);
    return inherited;
  }
  for (const [id, cards] of cardsByMicrosequence) {
    let localFoundationSeen = false;
    const inherited = (microsequences.get(id)?.dependsOn || [])
      .some((dependency) => hasFoundation(dependency));
    for (const card of cards) {
      if (["foundation", "worked_example"].includes(card.learningFunction)) {
        localFoundationSeen = true;
      }
      if (PRACTICE_FUNCTIONS.has(card.learningFunction)
          && !localFoundationSeen && !inherited) {
        planError(`missing-foundation: ${id} contém prática antes de uma base causal.`);
      }
    }
  }
  return { microsequences, external };
}

function hasDependencyPath(microsequences, fromId, targetId, visited = new Set()) {
  if (visited.has(fromId)) return false;
  visited.add(fromId);
  for (const dependency of microsequences.get(fromId)?.dependsOn || []) {
    if (dependency === targetId) return true;
    if (microsequences.has(dependency)
        && hasDependencyPath(microsequences, dependency, targetId, visited)) return true;
  }
  return false;
}

export function validateRequestId(value) {
  const requestId = typeof value === "string" ? value.trim() : "";
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new AuthoringApiError(
      422,
      "invalid_request_id",
      "requestId deve ter entre 8 e 128 caracteres seguros."
    );
  }
  return requestId;
}

export function validateRunId(value) {
  const runId = typeof value === "string" ? value.trim() : "";
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new AuthoringApiError(400, "invalid_run_id", "Identificador de execução inválido.");
  }
  return runId;
}

export function validatePartKey(value) {
  const partKey = typeof value === "string" ? value.trim() : "";
  if (!PART_KEY_PATTERN.test(partKey)) {
    throw new AuthoringApiError(400, "invalid_part_key", "Identificador de parte inválido.");
  }
  return partKey;
}

export function validateCreateRunPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const target = String(payload.target || "catalog").trim();
  if (target !== "catalog") {
    throw new AuthoringApiError(422, "invalid_payload", "A API de autoria publica somente no catálogo.");
  }
  const normalizedIntent = validatePublicationIntent(payload.publicationIntent);
  return {
    requestId: validateRequestId(payload.requestId),
    target,
    title: requiredText(payload, "title", { max: 300 }),
    contractKey: requiredText(payload, "contractKey", { max: 240 }),
    collectionId: payload.collectionId == null ? null : validateRunId(payload.collectionId),
    brief: boundedObject(payload.brief, "brief", { maxBytes: 32 * 1024 }),
    publicationIntent: normalizedIntent
  };
}

function validatePublicationIntent(value) {
  const publicationIntent = boundedObject(
    value,
    "publicationIntent",
    { maxBytes: 2048, required: true }
  );
  const mode = String(publicationIntent.mode || "").trim();
  const allowedIntentFields = mode === "create"
    ? new Set(["mode"])
    : new Set(["mode", "existingCourseId", "expectedContentHash"]);
  if (!["create", "update"].includes(mode)
      || Object.keys(publicationIntent).some((field) => !allowedIntentFields.has(field))) {
    throw new AuthoringApiError(
      422,
      "invalid_publication_intent",
      "A intenção de publicação é inválida."
    );
  }
  return mode === "create"
    ? { mode }
    : {
      mode,
      existingCourseId: validateRunId(publicationIntent.existingCourseId),
      expectedContentHash: validateSha256(
        publicationIntent.expectedContentHash,
        "publicationIntent.expectedContentHash"
      )
    };
}

export function validatePlanPayload(payload, expectedRunId = null) {
  if (!isPlainObject(payload) || !isPlainObject(payload.plan)) {
    throw new AuthoringApiError(422, "invalid_payload", "plan deve ser um objeto.");
  }
  if (payload.plan.artifact !== "aralearn.course-plan" || payload.plan.version !== 1) {
    planError("plan deve usar o artefato aralearn.course-plan versão 1.");
  }
  const planRunId = validateRunId(payload.plan.runId);
  if (expectedRunId && planRunId !== expectedRunId) {
    planError("plan.runId não corresponde à execução da URL.");
  }
  const allowedPlanFields = new Set([
    "artifact", "version", "runId", "project", "ledgerManifest", "course",
    "learningOutcomes", "conceptMap", "parts", "acceptanceCriteria"
  ]);
  const unknownPlanFields = Object.keys(payload.plan).filter((field) => !allowedPlanFields.has(field));
  if (unknownPlanFields.length) planError(`plan contém campo desconhecido: ${unknownPlanFields[0]}.`);
  const project = validateProjectSkeleton(payload.plan.project);
  const ledgerManifest = validateLedgerManifest(payload.plan.ledgerManifest, planRunId);
  const course = validateCoursePlan(payload.plan.course, project);
  const learningOutcomes = validateLearningOutcomes(payload.plan.learningOutcomes);
  const conceptMap = validateConceptMap(payload.plan.conceptMap);
  const acceptanceCriteria = stringSet(
    payload.plan.acceptanceCriteria,
    "plan.acceptanceCriteria",
    { min: 1, max: 1000 }
  );
  const parts = payload.plan.parts;
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 256) {
    throw new AuthoringApiError(422, "invalid_plan", "O plano deve conter de 1 a 256 partes.");
  }
  const seen = new Set();
  const normalizedParts = parts.map((part, index) => {
    if (!isPlainObject(part)) {
      throw new AuthoringApiError(422, "invalid_plan", `Parte ${index + 1} inválida.`);
    }
    const normalized = validatePartOutline(part, index, project);
    const key = normalized.key;
    if (seen.has(key)) {
      throw new AuthoringApiError(422, "invalid_plan", `A parte ${key} está duplicada.`);
    }
    seen.add(key);
    return normalized;
  });
  const microsequenceOwners = new Set();
  normalizedParts.forEach((part, index) => {
    for (const microsequenceId of part.ownership.microsequenceIds) {
      if (microsequenceOwners.has(microsequenceId)) {
        planError(`A microssequência ${microsequenceId} pertence a mais de uma parte.`);
      }
      microsequenceOwners.add(microsequenceId);
    }
    const previousKeys = new Set(normalizedParts.slice(0, index).map((item) => item.key));
    if (part.dependsOnPartKeys.some((key) => !previousKeys.has(key))) {
      planError(`A parte ${part.key} depende de parte inexistente ou posterior.`);
    }
  });
  const cardIds = new Set(normalizedParts.flatMap((part) => part.cardIds));
  if (cardIds.size !== normalizedParts.reduce((total, part) => total + part.cardIds.length, 0)) {
    planError("plan.parts.cardIds deve reservar cada card uma única vez.");
  }
  const outcomeIds = new Set(learningOutcomes.map((outcome) => outcome.id));
  for (const part of normalizedParts) assertReferences(part.outcomeIds, outcomeIds, `${part.key}.outcomeIds`);
  const assignedOutcomeIds = new Set(normalizedParts.flatMap((part) => part.outcomeIds));
  assertReferences([...outcomeIds], assignedOutcomeIds, "plan.learningOutcomes");
  return {
    requestId: validateRequestId(payload.requestId),
    plan: {
      ...payload.plan,
      runId: planRunId,
      project,
      ledgerManifest,
      course,
      learningOutcomes,
      conceptMap,
      acceptanceCriteria,
      parts: normalizedParts
    }
  };
}

export function validatePartSpecificationEnvelope(payload) {
  if (!isPlainObject(payload) || !isPlainObject(payload.specification)) {
    throw new AuthoringApiError(422, "invalid_payload", "specification deve ser um objeto.");
  }
  if (byteLength(payload.specification) > PART_SPECIFICATION_LIMIT) {
    throw new AuthoringApiError(413, "payload_too_large", "A especificação deve ocupar no máximo 48 KiB.");
  }
  return {
    requestId: validateRequestId(payload.requestId),
    planHash: validateSha256(payload.planHash, "planHash"),
    specification: payload.specification
  };
}

export function validatePartSpecificationPayload(payload, route, run) {
  const envelope = validatePartSpecificationEnvelope(payload);
  const next = run?.nextPart;
  if (!next || next.partKey !== route.partKey) {
    throw new AuthoringApiError(409, "stale_part_outline", "Outra parte ocupa a primeira posição causal pendente.");
  }
  const normalized = validatePartSpecification(envelope.specification, next.position, run?.plan?.project);
  const expected = next.outline;
  const actual = {
    key: normalized.key,
    title: normalized.title,
    boundary: normalized.boundary,
    cutReason: normalized.cutReason,
    dependsOnPartKeys: normalized.dependsOnPartKeys,
    ownership: normalized.ownership,
    cardIds: normalized.cardPlan.map((card) => card.cardId),
    outcomeIds: normalized.outcomeIds
  };
  if (!sameJson(actual, expected)) {
    throw new AuthoringApiError(422, "part_outline_mismatch", "A especificação diverge do contorno reservado no plano.");
  }
  const ledger = run?.plan?.ledger || {};
  const sourceIds = new Set((ledger.sources || []).map((source) => source.sourceId));
  const claimIds = new Set((ledger.claims || []).map((claim) => claim.claimId));
  const termIds = new Set((ledger.terms || []).map((term) => term.termId));
  assertReferences(normalized.allowedSourceIds, sourceIds, "specification.allowedSourceIds");
  assertReferences(normalized.availableTermIds, termIds, "specification.availableTermIds");
  for (const card of normalized.cardPlan) {
    assertReferences(stringSet(card.sourceIds || [], "specification.cardPlan[].sourceIds"), sourceIds, "specification.cardPlan[].sourceIds");
    assertReferences(stringSet(card.claimIds || [], "specification.cardPlan[].claimIds"), claimIds, "specification.cardPlan[].claimIds");
    assertReferences(stringSet(card.introducedTermIds || [], "specification.cardPlan[].introducedTermIds"), termIds, "specification.cardPlan[].introducedTermIds");
    assertReferences(stringSet(card.requiredTermIds || [], "specification.cardPlan[].requiredTermIds"), termIds, "specification.cardPlan[].requiredTermIds");
  }
  const plannedCards = new Map(normalized.cardPlan.map((card) => [card.cardId, card]));
  const continuity = run?.continuity || {};
  const previouslyIntroduced = new Set([
    ...(Array.isArray(continuity?.stateDelta?.introducedTermIds)
      ? continuity.stateDelta.introducedTermIds
      : []),
    ...(Array.isArray(run?.parts) ? run.parts : []).flatMap((part) =>
      part?.status === "approved" && Array.isArray(part?.submissionMeta?.stateDelta?.introducedTermIds)
        ? part.submissionMeta.stateDelta.introducedTermIds
        : []
    )
  ]);
  const didacticGraph = assertDidacticCausality(normalized, continuity);
  for (const term of ledger.terms || []) {
    const firstCard = plannedCards.get(term.firstTeachingCardId);
    if (firstCard && !firstCard.introducedTermIds.includes(term.termId)) {
      planError(`O card ${firstCard.cardId} deve introduzir ${term.termId}.`);
    }
    for (const card of normalized.cardPlan) {
      const declaresIntroduction = card.introducedTermIds.includes(term.termId);
      const declaresRequirement = card.requiredTermIds.includes(term.termId);
      if (declaresIntroduction !== (term.firstTeachingCardId === card.cardId)) {
        planError(`A introdução de ${term.termId} diverge do ledger.`);
      }
      const requiredByLedger = Array.isArray(term.requiredByCardIds)
        && term.requiredByCardIds.includes(card.cardId);
      if (declaresRequirement !== requiredByLedger) {
        planError(`O uso obrigatório de ${term.termId} diverge do ledger.`);
      }
      if (declaresRequirement && term.firstTeachingCardId !== card.cardId) {
        const localIntroduction = plannedCards.get(term.firstTeachingCardId);
        if (localIntroduction) {
          if (localIntroduction.microsequenceId === card.microsequenceId) {
            if (localIntroduction.position >= card.position) {
              planError(`term-required-before-introduction: ${term.termId}.`);
            }
          } else if (!hasDependencyPath(
            didacticGraph.microsequences,
            card.microsequenceId,
            localIntroduction.microsequenceId
          )) {
            planError(`term-required-without-causal-path: ${term.termId}.`);
          }
        } else if (!previouslyIntroduced.has(term.termId)) {
          planError(`term-required-before-introduction: ${term.termId}.`);
        }
      }
    }
  }
  return {
    requestId: envelope.requestId,
    planHash: envelope.planHash,
    specification: normalized
  };
}

export function validateLedgerChunkPayload(payload, route) {
  if (!isPlainObject(payload) || !LEDGER_SECTIONS.has(route.section)
      || !Array.isArray(payload.items)) {
    throw new AuthoringApiError(422, "invalid_payload", "O chunk do ledger é inválido.");
  }
  if (byteLength(payload.items) > 60 * 1024) {
    throw new AuthoringApiError(413, "payload_too_large", "Os itens do chunk excedem 60 kB.");
  }
  const allowedBySection = {
    sources: new Set([
      "sourceId", "title", "kind", "locator", "excerpt", "stability",
      "author", "publishedOn", "publishedVersion", "accessedOn", "usageTerms",
      "usageNotes"
    ]),
    claims: new Set([
      "claimId", "statement", "sourceIds", "support", "confidence", "allowedPartKeys"
    ]),
    terms: new Set([
      "termId", "form", "language", "explanation", "gloss",
      "firstTeachingCardId", "requiredByCardIds", "sourceIds"
    ])
  };
  const idField = { sources: "sourceId", claims: "claimId", terms: "termId" }[route.section];
  const ids = new Set();
  payload.items.forEach((item, index) => {
    if (!isPlainObject(item)) planError(`ledger.${route.section}[${index}] deve ser objeto.`);
    const unknown = Object.keys(item).find((field) => !allowedBySection[route.section].has(field));
    if (unknown) planError(`ledger.${route.section}[${index}] contém campo desconhecido: ${unknown}.`);
    const id = requiredText(item, idField, { max: 160 });
    if (ids.has(id)) planError(`ledger.${route.section} repete ${idField}: ${id}.`);
    ids.add(id);
    if (route.section === "sources") {
      const kind = requiredText(item, "kind", { max: 40 });
      const stability = requiredText(item, "stability", { max: 40 });
      if (!SOURCE_KINDS.has(kind) || !SOURCE_STABILITY.has(stability)) {
        planError(`ledger.sources[${index}] contém kind ou stability inválido.`);
      }
      requiredText(item, "title", { max: 1000 });
      requiredText(item, "locator", { max: 4000 });
      requiredText(item, "excerpt", { max: 2048 });
      optionalText(item, "author", { max: 500 });
      optionalIsoDate(item, "publishedOn");
      optionalText(item, "publishedVersion", { max: 500 });
      optionalIsoDate(item, "accessedOn");
      optionalText(item, "usageTerms", { max: 4096 });
      optionalText(item, "usageNotes", { max: 4096 });
    } else if (route.section === "claims") {
      const confidence = requiredText(item, "confidence", { max: 20 });
      if (!CLAIM_CONFIDENCE.has(confidence)) planError(`ledger.claims[${index}].confidence é inválido.`);
      requiredText(item, "statement", { max: 4096 });
      requiredText(item, "support", { max: 4096 });
      stringSet(item.sourceIds, `ledger.claims[${index}].sourceIds`, { min: 1 });
      stringSet(item.allowedPartKeys || [], `ledger.claims[${index}].allowedPartKeys`);
    } else {
      requiredText(item, "form", { max: 1000 });
      requiredText(item, "language", { max: 35 });
      requiredText(item, "explanation", { max: 4096 });
      requiredText(item, "firstTeachingCardId", { max: 160 });
      optionalText(item, "gloss", { max: 2000 });
      stringSet(item.requiredByCardIds || [], `ledger.terms[${index}].requiredByCardIds`);
      stringSet(item.sourceIds || [], `ledger.terms[${index}].sourceIds`);
    }
  });
  return {
    requestId: validateRequestId(payload.requestId),
    planHash: validateSha256(payload.planHash, "planHash"),
    items: payload.items
  };
}

export function validateFinalizePlanPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  return {
    requestId: validateRequestId(payload.requestId),
    planHash: validateSha256(payload.planHash, "planHash")
  };
}

export function validateCancelRunPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  return {
    requestId: validateRequestId(payload.requestId),
    reason: requiredText(payload, "reason", { max: 500 })
  };
}

function validateCausalIdentity(payload, { artifact, runId, partKey, staleCode }) {
  if (payload.artifact !== artifact || payload.version !== 1) {
    throw new AuthoringApiError(422, "invalid_artifact", `artifact deve ser ${artifact} na versão 1.`);
  }
  const bodyRunId = validateRunId(payload.runId);
  const bodyPartKey = validatePartKey(payload.partKey);
  if (bodyRunId !== runId || bodyPartKey !== partKey) {
    throw new AuthoringApiError(409, staleCode, "O artefato não corresponde à rota solicitada.");
  }
  const attempt = payload.attempt;
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 8) {
    throw new AuthoringApiError(422, "invalid_attempt", "attempt deve estar entre 1 e 8.");
  }
  return { runId: bodyRunId, partKey: bodyPartKey, attempt };
}

function validateSha256(value, field) {
  const hash = typeof value === "string" ? value.trim() : "";
  if (!SHA256_PATTERN.test(hash)) {
    throw new AuthoringApiError(422, "invalid_hash", `${field} deve ser um hash SHA-256.`);
  }
  return hash;
}

export function validatePartPayload(payload, route) {
  if (!isPlainObject(payload) || !isPlainObject(payload.fragment)) {
    throw new AuthoringApiError(422, "invalid_payload", "fragment deve ser um objeto.");
  }
  const identity = validateCausalIdentity(payload, {
    artifact: "aralearn.part-submission",
    runId: route.runId,
    partKey: route.partKey,
    staleCode: "stale_part_spec"
  });
  const mode = String(payload.mode || "build").trim();
  if (!PART_MODES.has(mode)) {
    throw new AuthoringApiError(422, "invalid_payload", "mode deve ser build, repair ou rebuild.");
  }
  if (byteLength(payload.fragment) >= PART_FRAGMENT_LIMIT) {
    throw new AuthoringApiError(
      413,
      "part_too_large",
      "A parte deve ocupar menos de 90 kB. Divida o planejamento em partes menores."
    );
  }
  const evidence = payload.evidence == null ? [] : payload.evidence;
  if (!Array.isArray(evidence) || evidence.length > 200 || evidence.some((item) => !isPlainObject(item))) {
    throw new AuthoringApiError(
      422,
      "invalid_evidence",
      "evidence deve conter no máximo 200 objetos sucintos."
    );
  }
  return {
    artifact: payload.artifact,
    version: 1,
    ...identity,
    requestId: validateRequestId(payload.requestId),
    mode,
    baseLedgerSha256: validateSha256(payload.baseLedgerSha256, "baseLedgerSha256"),
    fragment: payload.fragment,
    evidence,
    stateDelta: validateStateDelta(payload.stateDelta)
  };
}

function normalizeAuditFindings(findings) {
  if (!Array.isArray(findings) || findings.length > 100 || findings.some((finding) => !isPlainObject(finding))) {
    throw new AuthoringApiError(422, "invalid_findings", "findings deve conter até 100 achados estruturados.");
  }
  const findingFields = new Set([
    "issueId", "severity", "gate", "pointer", "observed",
    "requiredChange", "preserveFields", "acceptanceTest"
  ]);
  return findings.map((finding, index) => {
    const unknown = Object.keys(finding).find((field) => !findingFields.has(field));
    if (unknown) {
      throw new AuthoringApiError(
        422,
        "invalid_findings",
        `findings[${index}] contém campo desconhecido: ${unknown}.`
      );
    }
    const severity = requiredText(finding, "severity", { max: 10 });
    const gate = requiredText(finding, "gate", { max: 32 });
    const pointer = requiredText(finding, "pointer", { max: 1000 });
    if (!IDENTIFIER_PATTERN.test(requiredText(finding, "issueId", { max: 160 }))
        || !["error", "warning"].includes(severity)
        || !AUDIT_GATES.includes(gate)
        || !pointer.startsWith("/")) {
      throw new AuthoringApiError(422, "invalid_findings", `findings[${index}] é inválido.`);
    }
    const preserveFields = stringSet(
      finding.preserveFields,
      `findings[${index}].preserveFields`,
      { min: 1 }
    );
    if (preserveFields.some((value) => !value.startsWith("/"))) {
      throw new AuthoringApiError(
        422,
        "invalid_findings",
        `findings[${index}].preserveFields deve usar JSON Pointer.`
      );
    }
    return {
      issueId: finding.issueId.trim(),
      severity,
      gate,
      pointer,
      observed: requiredText(finding, "observed", { max: 4000 }),
      requiredChange: requiredText(finding, "requiredChange", { max: 4000 }),
      preserveFields,
      acceptanceTest: requiredText(finding, "acceptanceTest", { max: 4000 })
    };
  });
}

export function validateAuditPayload(payload, route) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const identity = validateCausalIdentity(payload, {
    artifact: "aralearn.part-audit",
    runId: route.runId,
    partKey: route.partKey,
    staleCode: "stale_submission"
  });
  const decision = String(payload.decision || "").trim();
  if (!AUDIT_DECISIONS.has(decision)) {
    throw new AuthoringApiError(
      422,
      "invalid_audit_decision",
      "decision deve ser approve, repair, rebuild ou blocked."
    );
  }
  const gates = boundedObject(payload.gates, "gates", { required: true });
  const gateKeys = Object.keys(gates);
  if (gateKeys.length !== AUDIT_GATES.length
      || gateKeys.some((gate) => !AUDIT_GATES.includes(gate))
      || AUDIT_GATES.some((gate) => typeof gates[gate] !== "boolean")) {
    throw new AuthoringApiError(422, "invalid_audit_gates", "gates deve conter os dez critérios booleanos.");
  }
  const normalizedFindings = normalizeAuditFindings(payload.findings);
  const instructions = typeof payload.instructions === "string" ? payload.instructions.trim() : "";
  const submissionReadReceipt = requiredText(payload, "submissionReadReceipt", { max: 4096 });
  if (!SUBMISSION_RECEIPT_PATTERN.test(submissionReadReceipt)) {
    throw new AuthoringApiError(
      422,
      "invalid_submission_read_receipt",
      "O comprovante de releitura é inválido."
    );
  }
  if (decision === "approve" && (AUDIT_GATES.some((gate) => gates[gate] !== true) || normalizedFindings.length)) {
    throw new AuthoringApiError(
      422,
      "audit_not_approvable",
      "A aprovação exige todos os critérios atendidos e nenhum achado."
    );
  }
  if (decision !== "approve" && normalizedFindings.length === 0 && !instructions) {
    throw new AuthoringApiError(422, "missing_audit_reason", "A decisão exige achado ou instrução.");
  }
  return {
    artifact: payload.artifact,
    version: 1,
    ...identity,
    requestId: validateRequestId(payload.requestId),
    submissionSha256: validateSha256(payload.submissionSha256, "submissionSha256"),
    submissionReadReceipt,
    decision,
    gates: Object.fromEntries(AUDIT_GATES.map((gate) => [gate, gates[gate]])),
    findings: normalizedFindings,
    instructions
  };
}

export function validateReopenPartPayload(payload, route) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const identity = validateCausalIdentity(payload, {
    artifact: "aralearn.final-validation-repair",
    runId: route.runId,
    partKey: route.partKey,
    staleCode: "stale_submission"
  });
  const decision = String(payload.decision || "").trim();
  if (!["repair", "rebuild"].includes(decision)) {
    throw new AuthoringApiError(
      422,
      "invalid_audit_decision",
      "decision deve ser repair ou rebuild."
    );
  }
  const findings = normalizeAuditFindings(payload.findings);
  const instructions = typeof payload.instructions === "string" ? payload.instructions.trim() : "";
  if (findings.length === 0 && !instructions) {
    throw new AuthoringApiError(422, "missing_audit_reason", "A reabertura exige achado ou instrução.");
  }
  return {
    artifact: payload.artifact,
    version: 1,
    ...identity,
    requestId: validateRequestId(payload.requestId),
    submissionSha256: validateSha256(payload.submissionSha256, "submissionSha256"),
    decision,
    findings,
    instructions
  };
}

export function validateBlockPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const questions = payload.questions == null ? [] : payload.questions;
  if (!Array.isArray(questions) || questions.length > 20 || questions.some(
    (value) => typeof value !== "string" || !value.trim() || value.trim().length > 500
  )) {
    throw new AuthoringApiError(422, "invalid_payload", "questions deve conter até 20 perguntas sucintas.");
  }
  return {
    requestId: validateRequestId(payload.requestId),
    reason: requiredText(payload, "reason", { max: 1000 }),
    questions: questions.map((value) => value.trim()),
    partKey: payload.partKey == null ? null : validatePartKey(payload.partKey)
  };
}

export function validateResumePayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const resolution = boundedObject(payload.resolution, "resolution", {
    maxBytes: 32 * 1024,
    required: true
  });
  if (Object.keys(resolution).length === 0) {
    throw new AuthoringApiError(422, "invalid_payload", "resolution deve ser um objeto não vazio.");
  }
  return {
    requestId: validateRequestId(payload.requestId),
    resolution
  };
}

export function validateSimpleCommandPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  return { requestId: validateRequestId(payload.requestId) };
}

export function validateImportPayload(payload) {
  if (!isPlainObject(payload) || !isPlainObject(payload.document)) {
    throw new AuthoringApiError(422, "invalid_payload", "document deve ser um objeto AraLearn v3.");
  }
  if (byteLength(payload.document) > 4 * 1024 * 1024) {
    throw new AuthoringApiError(
      413,
      "course_too_large",
      "O documento do curso deve ocupar no máximo 4 MiB. Divida o conteúdo em cursos menores."
    );
  }
  const target = String(payload.target || "catalog").trim();
  if (target !== "catalog") {
    throw new AuthoringApiError(422, "invalid_payload", "A API de autoria importa somente para o catálogo.");
  }
  return {
    requestId: validateRequestId(payload.requestId),
    target,
    collectionId: payload.collectionId == null ? null : validateRunId(payload.collectionId),
    publicationIntent: validatePublicationIntent(payload.publicationIntent),
    document: payload.document
  };
}

export function normalizeAuthoringPath(pathname) {
  let path = String(pathname || "").replace(/\/+$/, "") || "/";
  for (const prefix of [
    "/functions/v1/aralearn-authoring-api",
    "/aralearn-authoring-api"
  ]) {
    if (path === prefix) return "/";
    if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
  }
  return path;
}

export function routeRequest(method, pathname) {
  const path = normalizeAuthoringPath(pathname);
  if (method === "GET" && path === "/v1/runs") return { name: "listRuns" };
  if (method === "POST" && path === "/v1/runs") return { name: "createRun" };
  if (method === "POST" && path === "/v1/imports") return { name: "importDocument" };

  let match = path.match(/^\/v1\/runs\/([^/]+)$/);
  if (match && method === "GET") return { name: "getRun", runId: validateRunId(match[1]) };

  match = path.match(/^\/v1\/runs\/([^/]+)\/plan$/);
  if (match && method === "PUT") return { name: "setPlan", runId: validateRunId(match[1]) };

  match = path.match(/^\/v1\/runs\/([^/]+)\/ledger\/(sources|claims|terms)\/(\d+)$/);
  if (match && method === "PUT") {
    const position = Number(match[3]);
    if (!Number.isInteger(position) || position < 0 || position > 999) {
      throw new AuthoringApiError(400, "invalid_ledger_position", "Posição de chunk inválida.");
    }
    return {
      name: "putLedgerChunk",
      runId: validateRunId(match[1]),
      section: match[2],
      position
    };
  }

  match = path.match(/^\/v1\/runs\/([^/]+)\/plan\/finalize$/);
  if (match && method === "POST") {
    return { name: "finalizePlan", runId: validateRunId(match[1]) };
  }

  match = path.match(/^\/v1\/runs\/([^/]+)\/next-part$/);
  if (match && method === "GET") return { name: "nextPart", runId: validateRunId(match[1]) };

  match = path.match(/^\/v1\/runs\/([^/]+)\/parts\/([^/]+)\/specification$/);
  if (match && method === "PUT") {
    return {
      name: "setPartSpecification",
      runId: validateRunId(match[1]),
      partKey: validatePartKey(match[2])
    };
  }

  match = path.match(/^\/v1\/runs\/([^/]+)\/parts\/([^/]+)$/);
  if (match && method === "PUT") {
    return { name: "submitPart", runId: validateRunId(match[1]), partKey: validatePartKey(match[2]) };
  }

  match = path.match(/^\/v1\/runs\/([^/]+)\/parts\/([^/]+)\/submission$/);
  if (match && method === "GET") {
    return {
      name: "getPartSubmission",
      runId: validateRunId(match[1]),
      partKey: validatePartKey(match[2])
    };
  }

  match = path.match(/^\/v1\/runs\/([^/]+)\/parts\/([^/]+)\/audit$/);
  if (match && method === "POST") {
    return { name: "auditPart", runId: validateRunId(match[1]), partKey: validatePartKey(match[2]) };
  }

  match = path.match(/^\/v1\/runs\/([^/]+)\/parts\/([^/]+)\/reopen$/);
  if (match && method === "POST") {
    return { name: "reopenPart", runId: validateRunId(match[1]), partKey: validatePartKey(match[2]) };
  }

  match = path.match(/^\/v1\/runs\/([^/]+)\/(validate|publish)$/);
  if (match && method === "POST") {
    return {
      name: match[2] === "validate" ? "validateRun" : "publishRun",
      runId: validateRunId(match[1])
    };
  }
  match = path.match(/^\/v1\/runs\/([^/]+)\/(block|resume)$/);
  if (match && method === "POST") {
    return {
      name: match[2] === "block" ? "blockRun" : "resumeRun",
      runId: validateRunId(match[1])
    };
  }
  match = path.match(/^\/v1\/runs\/([^/]+)\/cancel$/);
  if (match && method === "POST") {
    return { name: "cancelRun", runId: validateRunId(match[1]) };
  }
  throw new AuthoringApiError(404, "not_found", "Endpoint inexistente.");
}

export async function readJsonBody(request, limit) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > limit) {
    throw new AuthoringApiError(413, "payload_too_large", "O corpo excede o tamanho permitido.");
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo JSON é obrigatório.");
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel("payload_too_large").catch(() => null);
      throw new AuthoringApiError(413, "payload_too_large", "O corpo excede o tamanho permitido.");
    }
    chunks.push(value);
  }
  if (!total) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo JSON é obrigatório.");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AuthoringApiError(400, "invalid_json", "O corpo não contém JSON válido.");
  }
}
