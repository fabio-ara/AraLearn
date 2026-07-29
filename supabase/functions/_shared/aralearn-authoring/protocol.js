import { AuthoringApiError } from "./errors.js";
import { validateProjectDocument } from "../aralearn/runtime/domain/aralearnProject.js";
import {
  isExerciseCardShape,
  isTheoryCardShape
} from "../aralearn/runtime/domain/cardExerciseSupport.js";
import {
  AuthoringGapError,
  compileAuthoringFragmentGaps
} from "../aralearn/runtime/core/authoringGaps.js";
import { AUTHORING_PLAN_LIMITS } from "./planLimits.js";
import { listResourceIds } from "../aralearn/runtime/resources/registry/index.js";

export const STANDARD_BODY_LIMIT = Number.POSITIVE_INFINITY;
export const PLAN_BODY_LIMIT = Number.POSITIVE_INFINITY;
// GPT Actions e integrações equivalentes trabalham melhor com operações
// pequenas. Sessões humanas ainda podem usar o limite amplo para importação
// administrativa, mas clientes por chave recebem este teto no plano compacto.
export const ACTION_PLAN_BODY_LIMIT = 96 * 1024;
export const ACTION_RESPONSE_BODY_LIMIT = 90 * 1024;
// Inclui o envelope JSON completo e deixa margem para os limites da Edge.
export const MANUAL_IMPORT_BODY_LIMIT = Number.POSITIVE_INFINITY;
export const PART_FRAGMENT_LIMIT = Number.POSITIVE_INFINITY;
export const PART_SPECIFICATION_LIMIT = Number.POSITIVE_INFINITY;
export const LEDGER_CHUNK_BODY_LIMIT = Number.POSITIVE_INFINITY;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PART_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LANGUAGE_TAG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-(?:[A-Za-z0-9]{5,8}|\d[A-Za-z0-9]{3}))*$/u;
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
const CARD_RESOURCES = new Set(listResourceIds());
const CARD_KINDS = new Set(["theory", "exercise"]);
const CARD_EXERCISES = new Set(["none", "gap", "choice"]);
const LEARNING_FUNCTIONS = new Set([
  "foundation", "worked_example", "guided_practice", "independent_practice",
  "contrast", "error_diagnosis", "integration"
]);
const PRACTICE_FUNCTIONS = new Set([
  "guided_practice", "independent_practice", "contrast", "error_diagnosis", "integration"
]);
const LESS_SUPPORTED_PRACTICE_FUNCTIONS = new Set([
  "independent_practice", "contrast", "error_diagnosis", "integration"
]);
const LEDGER_SECTIONS = new Set(["sources", "claims", "terms"]);
const MICROSEQUENCE_ROLES = new Set(["explain", "practice", "review", "support"]);
const MICROSEQUENCE_STATUSES = new Set(["generated", "needs_review", "ready"]);
const PART_SUBMISSION_FIELDS = new Set([
  "artifact", "version", "runId", "partKey", "requestId", "mode", "attempt",
  "baseLedgerSha256", "fragment", "evidence", "stateDelta"
]);
const AUTHORING_FRAGMENT_FIELDS = new Set([
  "courseId", "moduleId", "lessonId", "microsequences"
]);
const AUTHORING_MICROSEQUENCE_FIELDS = new Set([
  "id", "title", "goal", "role", "status", "dependsOn", "covers", "checks",
  "errors", "cards"
]);
const AUTHORING_EVIDENCE_FIELDS = new Set(["sourceId", "claimId", "cardIds"]);
const CONCEPT_RELATIONS = new Set([
  "requires", "part_of", "contrasts", "represents", "applies", "causes"
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function fieldFromPath(path) {
  const match = String(path || "$").match(/(?:^|\.|\[)([^.[\]]+)\]?$/);
  return match?.[1] || String(path || "$");
}

function validationDetails(path, reason, options = {}) {
  const { expected, value, ...extra } = options;
  delete extra.status;
  delete extra.code;
  return {
    path,
    field: fieldFromPath(path),
    reason,
    ...(expected ? { expected } : {}),
    ...(Object.prototype.hasOwnProperty.call(options, "value")
      ? { actualType: valueType(value) }
      : {}),
    ...extra
  };
}

function invalidPayloadAt(path, reason, message, options = {}) {
  throw new AuthoringApiError(
    options.status || 422,
    options.code || "invalid_payload",
    message,
    validationDetails(path, reason, options)
  );
}

function boundedObject(value, field, { maxBytes = 32 * 1024, required = false } = {}) {
  if (value == null && !required) return {};
  if (!isPlainObject(value)) {
    invalidPayloadAt(
      field,
      value == null ? "required" : "wrong_type",
      value == null ? `${field} é obrigatório.` : `${field} deve ser um objeto.`,
      { expected: "object", value }
    );
  }
  if (byteLength(value) > maxBytes) {
    invalidPayloadAt(field, "too_large", `${field} excede o tamanho permitido.`, {
      status: 413,
      code: "payload_too_large",
      expected: `object with at most ${maxBytes} bytes`,
      value,
      maxBytes
    });
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

function requiredText(value, field, { max = 500, path = field, plan = false } = {}) {
  const result = typeof value?.[field] === "string" ? value[field].trim() : "";
  if (!result) {
    const actual = value?.[field];
    const reason = actual == null ? "required" : typeof actual !== "string" ? "wrong_type" : "empty";
    const message = reason === "wrong_type"
      ? `${path} deve ser texto.`
      : `${path} é obrigatório.`;
    if (plan) planErrorAt(path, reason, message, { expected: "non-empty string", value: actual });
    invalidPayloadAt(path, reason, message, { expected: "non-empty string", value: actual });
  }
  if (result.length > max) {
    const message = `${path} excede o tamanho permitido.`;
    if (plan) planErrorAt(path, "too_long", message, {
      expected: `string with at most ${max} characters`,
      value: value[field],
      maxLength: max
    });
    invalidPayloadAt(path, "too_long", message, {
      expected: `string with at most ${max} characters`,
      value: value[field],
      maxLength: max
    });
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
    const reason = !Array.isArray(value) ? "wrong_type" : value.length > max ? "too_many_items" : "wrong_item_type";
    planErrorAt(field, reason, `${field} deve ser uma lista de objetos.`, {
      expected: `array of at most ${max} objects`,
      value,
      maxItems: max
    });
  }
  return value;
}

function uniqueRecordIds(records, field, idField) {
  const seen = new Set();
  for (const [index, record] of records.entries()) {
    const path = `${field}[${index}].${idField}`;
    const id = requiredText(record, idField, { max: 160, path, plan: true });
    if (seen.has(id)) {
      planErrorAt(path, "duplicate", `${path} repete o identificador ${id}.`, { value: id });
    }
    seen.add(id);
  }
  return seen;
}

function assertReferences(values, allowed, field) {
  const missing = values.find((value) => !allowed.has(value));
  if (missing) {
    planErrorAt(
      field,
      "invalid_reference",
      `${field} aponta para identificador inexistente: ${missing}.`,
      { value: missing }
    );
  }
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
    if (!isTheoryCardShape(card)) {
      planError(`${label}: resource ${card.resource} não aceita a combinação theory/${card.exercise}.`);
    }
    return;
  }
  if (!isExerciseCardShape(card)) {
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
  if (!isPlainObject(value)) {
    planErrorAt("plan.course", value == null ? "required" : "wrong_type", "plan.course deve ser um objeto.", {
      expected: "object",
      value
    });
  }
  const allowed = new Set([
    "id", "title", "goal", "audience", "prerequisites", "depth", "language",
    "include", "exclude", "notation", "modules"
  ]);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length) {
    planErrorAt(`plan.course.${unknown[0]}`, "unknown_field", `plan.course contém campo desconhecido: ${unknown[0]}.`);
  }
  const projectCourse = project.courses[0];
  const modules = objectList(value.modules, "plan.course.modules", {
    max: AUTHORING_PLAN_LIMITS.modules
  }).map((moduleValue, index) => {
    const label = `plan.course.modules[${index}]`;
    const fields = Object.keys(moduleValue);
    if (fields.some((field) => !["id", "title", "goal", "lessonIds"].includes(field))) {
      const unknownField = fields.find((field) => !["id", "title", "goal", "lessonIds"].includes(field));
      planErrorAt(`${label}.${unknownField}`, "unknown_field", `${label} contém campo desconhecido: ${unknownField}.`);
    }
    const id = requiredText(moduleValue, "id", { max: 160, path: `${label}.id`, plan: true });
    const projectModule = projectCourse.modules.find((item) => item.id === id);
    if (!projectModule) {
      planErrorAt(`${label}.id`, "invalid_reference", `${label}.id aponta para módulo inexistente: ${id}.`, { value: id });
    }
    const lessonIds = stringSet(moduleValue.lessonIds, `plan.course.modules[${id}].lessonIds`, { min: 1 });
    const expectedLessonIds = new Set(projectModule.lessons.map((lesson) => lesson.id));
    assertReferences(lessonIds, expectedLessonIds, `plan.course.modules[${id}].lessonIds`);
    if (lessonIds.length !== expectedLessonIds.size) planError(`plan.course.modules[${id}] deve cobrir todas as lições.`);
    return {
      id,
      title: requiredText(moduleValue, "title", { max: 240, path: `${label}.title`, plan: true }),
      goal: requiredText(moduleValue, "goal", { max: 20000, path: `${label}.goal`, plan: true }),
      lessonIds
    };
  });
  if (!modules.length || modules.length !== projectCourse.modules.length) {
    planError("plan.course.modules deve corresponder ao esqueleto integral.");
  }
  uniqueRecordIds(modules, "plan.course.modules", "id");
  const id = requiredText(value, "id", { max: 160, path: "plan.course.id", plan: true });
  if (id !== projectCourse.id) {
    planErrorAt("plan.course.id", "mismatch", "plan.course.id diverge do esqueleto.", {
      expectedValue: projectCourse.id,
      actualValue: id
    });
  }
  return {
    id,
    title: requiredText(value, "title", { max: 240, path: "plan.course.title", plan: true }),
    goal: requiredText(value, "goal", { max: 20000, path: "plan.course.goal", plan: true }),
    audience: requiredText(value, "audience", { max: 20000, path: "plan.course.audience", plan: true }),
    prerequisites: stringSet(value.prerequisites, "plan.course.prerequisites"),
    depth: requiredText(value, "depth", { max: 20000, path: "plan.course.depth", plan: true }),
    language: (() => {
      const language = requiredText(value, "language", {
        max: 63,
        path: "plan.course.language",
        plan: true
      });
      if (!LANGUAGE_TAG_PATTERN.test(language)) {
        planErrorAt(
          "plan.course.language",
          "invalid_language_tag",
          "plan.course.language deve usar uma etiqueta BCP 47 simples, como pt-BR, en, ar ou zh-Hant.",
          { value: language }
        );
      }
      return language;
    })(),
    include: stringSet(value.include, "plan.course.include"),
    exclude: stringSet(value.exclude, "plan.course.exclude"),
    notation: stringSet(value.notation, "plan.course.notation"),
    modules
  };
}

function validateConceptMap(value) {
  if (!isPlainObject(value)) {
    planErrorAt(
      "plan.conceptMap",
      value == null ? "required" : "wrong_type",
      "plan.conceptMap deve ser um objeto com concepts e relations.",
      { expected: "object", value }
    );
  }
  const unknownField = Object.keys(value).find((field) => !["concepts", "relations"].includes(field));
  if (unknownField) {
    planErrorAt(
      `plan.conceptMap.${unknownField}`,
      "unknown_field",
      `plan.conceptMap contém campo desconhecido: ${unknownField}.`
    );
  }
  const concepts = objectList(value.concepts, "plan.conceptMap.concepts", {
    max: AUTHORING_PLAN_LIMITS.concepts
  }).map((concept, index) => ({
    id: requiredText(concept, "id", {
      max: 160,
      path: `plan.conceptMap.concepts[${index}].id`,
      plan: true
    }),
    label: requiredText(concept, "label", {
      max: AUTHORING_PLAN_LIMITS.labelLength,
      path: `plan.conceptMap.concepts[${index}].label`,
      plan: true
    })
  }));
  if (!concepts.length) {
    planErrorAt("plan.conceptMap.concepts", "too_few_items", "plan.conceptMap.concepts não pode ser vazio.", {
      expected: "non-empty array",
      value: value.concepts
    });
  }
  const conceptIds = uniqueRecordIds(concepts, "plan.conceptMap.concepts", "id");
  const relations = objectList(value.relations, "plan.conceptMap.relations", {
    max: AUTHORING_PLAN_LIMITS.conceptRelations
  }).map((relation, index) => {
    const label = `plan.conceptMap.relations[${index}]`;
    if (Object.keys(relation).some((field) => !["from", "to", "relation"].includes(field))) {
      const unknown = Object.keys(relation).find((field) => !["from", "to", "relation"].includes(field));
      planErrorAt(`${label}.${unknown}`, "unknown_field", `${label} contém campo desconhecido: ${unknown}.`);
    }
    const normalized = {
      from: requiredText(relation, "from", { max: 160, path: `${label}.from`, plan: true }),
      to: requiredText(relation, "to", { max: 160, path: `${label}.to`, plan: true }),
      relation: requiredText(relation, "relation", { max: 40, path: `${label}.relation`, plan: true })
    };
    assertReferences([normalized.from, normalized.to], conceptIds, label);
    if (normalized.from === normalized.to) {
      planErrorAt(
        label,
        "self_relation",
        `${label} não pode relacionar um conceito a ele mesmo.`,
        { conceptId: normalized.from }
      );
    }
    if (!CONCEPT_RELATIONS.has(normalized.relation)) {
      planErrorAt(
        `${label}.relation`,
        "invalid_relation",
        `${label}.relation deve ser requires, part_of, contrasts, represents, applies ou causes.`,
        { value: normalized.relation }
      );
    }
    return normalized;
  });
  const requirementsByConcept = new Map();
  relations.forEach((relation, index) => {
    if (relation.relation !== "requires") return;
    if (!requirementsByConcept.has(relation.from)) {
      requirementsByConcept.set(relation.from, []);
    }
    requirementsByConcept.get(relation.from).push({
      conceptId: relation.to,
      relationIndex: index
    });
  });
  const visitState = new Map();
  for (const conceptId of conceptIds) {
    if (visitState.has(conceptId)) continue;
    visitState.set(conceptId, "visiting");
    const pending = [{ conceptId, requirementIndex: 0 }];
    while (pending.length) {
      const frame = pending[pending.length - 1];
      const requirements = requirementsByConcept.get(frame.conceptId) || [];
      if (frame.requirementIndex >= requirements.length) {
        visitState.set(frame.conceptId, "visited");
        pending.pop();
        continue;
      }
      const requirement = requirements[frame.requirementIndex];
      frame.requirementIndex += 1;
      if (visitState.get(requirement.conceptId) === "visiting") {
        planErrorAt(
          `plan.conceptMap.relations[${requirement.relationIndex}]`,
          "concept_requirement_cycle",
          "As relações requires não podem formar um ciclo de pré-requisitos.",
          {
            conceptId: frame.conceptId,
            prerequisiteConceptId: requirement.conceptId
          }
        );
      }
      if (!visitState.has(requirement.conceptId)) {
        visitState.set(requirement.conceptId, "visiting");
        pending.push({
          conceptId: requirement.conceptId,
          requirementIndex: 0
        });
      }
    }
  }
  return { concepts, relations };
}

function validateLearningOutcomes(value) {
  const outcomes = objectList(value, "plan.learningOutcomes", {
    max: AUTHORING_PLAN_LIMITS.learningOutcomes
  });
  if (outcomes.length === 0) {
    planError("plan.learningOutcomes deve conter ao menos um resultado de aprendizagem.");
  }
  const normalized = outcomes.map((outcome, index) => {
    const label = `plan.learningOutcomes[${index}]`;
    const unknown = Object.keys(outcome).filter(
      (field) => !["id", "statement", "evidence"].includes(field)
    );
    if (unknown.length) planError(`${label} contém campo desconhecido: ${unknown[0]}.`);
    const id = requiredText(outcome, "id", { max: 160, path: `${label}.id`, plan: true });
    if (!IDENTIFIER_PATTERN.test(id)) {
      planError(`${label}.id deve ser um identificador estável.`);
    }
    return {
      id,
      statement: requiredText(outcome, "statement", { max: 20000, path: `${label}.statement`, plan: true }),
      evidence: requiredText(outcome, "evidence", { max: 20000, path: `${label}.evidence`, plan: true })
    };
  });
  uniqueRecordIds(normalized, "plan.learningOutcomes", "id");
  return normalized;
}

function inferredPlanPath(message) {
  const match = String(message || "").match(/\b(?:plan|specification)(?:\.[A-Za-z0-9_$:-]+|\[[^\]]+\])*/u);
  return match?.[0] || "$";
}

function planError(message, details = undefined) {
  throw new AuthoringApiError(
    422,
    "invalid_plan",
    message,
    details || validationDetails(inferredPlanPath(message), "invalid_value")
  );
}

function planErrorAt(path, reason, message, options = {}) {
  planError(message, validationDetails(path, reason, options));
}

function stringSet(value, field, {
  min = 0,
  max = AUTHORING_PLAN_LIMITS.stringSetItems
} = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some(
    (entry) => typeof entry !== "string"
      || !entry.trim()
      || entry !== entry.trim()
      || entry.trim().length > AUTHORING_PLAN_LIMITS.stringSetItemLength
  )) {
    const reason = !Array.isArray(value)
      ? "wrong_type"
      : value.length < min
        ? "too_few_items"
        : value.length > max
          ? "too_many_items"
          : "invalid_item";
    planErrorAt(field, reason, `${field} deve ser uma lista de identificadores.`, {
      expected: `array with ${min} to ${max} non-empty strings`,
      value,
      minItems: min,
      maxItems: max
    });
  }
  const normalized = [...value];
  if (new Set(normalized).size !== normalized.length) {
    planErrorAt(field, "duplicate", `${field} contém duplicatas.`, { value });
  }
  return normalized;
}

function validateOperations(value) {
  const operations = objectList(value, "plan.operations", {
    max: AUTHORING_PLAN_LIMITS.operations
  });
  if (operations.length === 0) {
    planErrorAt(
      "plan.operations",
      "too_few_items",
      "plan.operations deve declarar ao menos uma operação observável.",
      { expected: "non-empty array", value }
    );
  }
  const normalized = operations.map((operation, index) => {
    const label = `plan.operations[${index}]`;
    const unknown = Object.keys(operation).filter(
      (field) => !["id", "label", "evidence", "representation"].includes(field)
    );
    if (unknown.length) {
      planErrorAt(`${label}.${unknown[0]}`, "unknown_field", `${label} contém campo desconhecido: ${unknown[0]}.`);
    }
    const id = requiredText(operation, "id", { max: 160, path: `${label}.id`, plan: true });
    if (!IDENTIFIER_PATTERN.test(id)) {
      planErrorAt(`${label}.id`, "invalid_identifier", `${label}.id deve ser um identificador estável.`, {
        value: id
      });
    }
    if (!isPlainObject(operation.representation)) {
      planErrorAt(
        `${label}.representation`,
        "wrong_type",
        `${label}.representation deve declarar os recursos adequados à operação.`,
        { expected: "object", value: operation.representation }
      );
    }
    const representationUnknown = Object.keys(operation.representation).filter(
      (field) => !["preferredResources", "allowedResources", "rationale"].includes(field)
    );
    if (representationUnknown.length) {
      planErrorAt(
        `${label}.representation.${representationUnknown[0]}`,
        "unknown_field",
        `${label}.representation contém campo desconhecido: ${representationUnknown[0]}.`
      );
    }
    const preferredResources = stringSet(
      operation.representation.preferredResources,
      `${label}.representation.preferredResources`,
      { min: 1, max: 4 }
    );
    const allowedResources = stringSet(
      operation.representation.allowedResources,
      `${label}.representation.allowedResources`,
      { min: 1, max: CARD_RESOURCES.size }
    );
    const invalidResource = [...preferredResources, ...allowedResources].find(
      (resource) => !CARD_RESOURCES.has(resource)
    );
    if (invalidResource) {
      planErrorAt(
        `${label}.representation`,
        "invalid_resource",
        `${label}.representation contém resource desconhecido: ${invalidResource}.`,
        { value: invalidResource, allowed: [...CARD_RESOURCES] }
      );
    }
    const preferredOutsideAllowed = preferredResources.find(
      (resource) => !allowedResources.includes(resource)
    );
    if (preferredOutsideAllowed) {
      planErrorAt(
        `${label}.representation.preferredResources`,
        "not_allowed",
        `${preferredOutsideAllowed} precisa constar também em allowedResources.`,
        { value: preferredOutsideAllowed }
      );
    }
    return {
      id,
      label: requiredText(operation, "label", {
        max: AUTHORING_PLAN_LIMITS.labelLength,
        path: `${label}.label`,
        plan: true
      }),
      evidence: requiredText(operation, "evidence", {
        max: 20000,
        path: `${label}.evidence`,
        plan: true
      }),
      representation: {
        preferredResources,
        allowedResources,
        rationale: requiredText(operation.representation, "rationale", {
          max: 20000,
          path: `${label}.representation.rationale`,
          plan: true
        })
      }
    };
  });
  uniqueRecordIds(normalized, "plan.operations", "id");
  return normalized;
}

function validateMisconceptions(value) {
  const misconceptions = objectList(value, "plan.misconceptions", {
    max: AUTHORING_PLAN_LIMITS.misconceptions
  });
  const normalized = misconceptions.map((misconception, index) => {
    const label = `plan.misconceptions[${index}]`;
    const unknown = Object.keys(misconception).filter(
      (field) => !["id", "statement", "correctionEvidence"].includes(field)
    );
    if (unknown.length) {
      planErrorAt(`${label}.${unknown[0]}`, "unknown_field", `${label} contém campo desconhecido: ${unknown[0]}.`);
    }
    const id = requiredText(misconception, "id", {
      max: 160,
      path: `${label}.id`,
      plan: true
    });
    if (!IDENTIFIER_PATTERN.test(id)) {
      planErrorAt(`${label}.id`, "invalid_identifier", `${label}.id deve ser um identificador estável.`, {
        value: id
      });
    }
    return {
      id,
      statement: requiredText(misconception, "statement", {
        max: 20000,
        path: `${label}.statement`,
        plan: true
      }),
      correctionEvidence: requiredText(misconception, "correctionEvidence", {
        max: 20000,
        path: `${label}.correctionEvidence`,
        plan: true
      })
    };
  });
  uniqueRecordIds(normalized, "plan.misconceptions", "id");
  return normalized;
}

function assertUniqueLearningComponentIds(groups) {
  const owners = new Map();
  for (const [group, records] of Object.entries(groups)) {
    for (const record of records) {
      const previous = owners.get(record.id);
      if (previous) {
        planErrorAt(
          `plan.${group}`,
          "component_id_collision",
          `plan.${group} reutiliza o identificador pedagógico ${record.id}, que já pertence a plan.${previous}.`,
          { componentId: record.id, existingGroup: previous, conflictingGroup: group }
        );
      }
      owners.set(record.id, group);
    }
  }
}

function validateProjectSkeleton(project) {
  if (!isPlainObject(project)) {
    planErrorAt("plan.project", project == null ? "required" : "wrong_type", "plan.project deve ser um objeto.", {
      expected: "AraLearn v4 project object",
      value: project
    });
  }
  const validation = validateProjectDocument(project);
  if (!validation.ok) {
    const first = validation.errors[0] || {};
    const contractPath = String(first.path || "$").replace(/^\$/, "plan.project");
    const message = first.message
      ? `${contractPath}: ${first.message}`
      : "plan.project viola o contrato AraLearn v4.";
    planErrorAt(contractPath, first.code || "contract_violation", message, {
      expected: "valid AraLearn v4 project skeleton",
      errors: validation.errors
    });
  }
  const normalized = validation.value;
  if (normalized.contract !== "aralearn.contract" || normalized.version !== 4
      || normalized.kind !== "project" || normalized.courses.length !== 1) {
    planError("plan.project deve conter exatamente um curso AraLearn v4.");
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

function validatePartOutline(part, index, project, label = `plan.parts[${index}]`) {
  const allowedFields = new Set([
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys",
    "ownership", "cardIds", "outcomeIds", "conceptIds", "operationIds",
    "misconceptionIds"
  ]);
  const unknown = Object.keys(part).filter((field) => !allowedFields.has(field));
  if (unknown.length) planError(`${label} contém campo desconhecido: ${unknown[0]}.`);
  if (!isPlainObject(part.ownership)) {
    planErrorAt(
      `${label}.ownership`,
      part.ownership == null ? "required" : "wrong_type",
      `${label}.ownership deve ser um objeto com courseId, moduleId, lessonId e microsequenceIds.`,
      { expected: "ownership object", value: part.ownership }
    );
  }
  const ownership = part.ownership;
  const normalizedOwnership = {
    courseId: requiredText(ownership, "courseId", { max: 160, path: `${label}.ownership.courseId`, plan: true }),
    moduleId: requiredText(ownership, "moduleId", { max: 160, path: `${label}.ownership.moduleId`, plan: true }),
    lessonId: requiredText(ownership, "lessonId", { max: 160, path: `${label}.ownership.lessonId`, plan: true }),
    microsequenceIds: stringSet(ownership.microsequenceIds, `${label}.ownership.microsequenceIds`, { min: 1 })
  };
  const course = project.courses.find((item) => item.id === normalizedOwnership.courseId);
  const moduleValue = course?.modules.find((item) => item.id === normalizedOwnership.moduleId);
  const lesson = moduleValue?.lessons.find((item) => item.id === normalizedOwnership.lessonId);
  if (!course || !moduleValue || !lesson) {
    planErrorAt(`${label}.ownership`, "invalid_reference", `${label}.ownership aponta para uma estrutura inexistente.`, {
      ownership: normalizedOwnership
    });
  }
  return {
    key: validatePartKey(part.key),
    title: requiredText(part, "title", { max: 300, path: `${label}.title`, plan: true }),
    boundary: requiredText(part, "boundary", { max: 20000, path: `${label}.boundary`, plan: true }),
    cutReason: requiredText(part, "cutReason", { max: 20000, path: `${label}.cutReason`, plan: true }),
    dependsOnPartKeys: stringSet(part.dependsOnPartKeys || [], `${label}.dependsOnPartKeys`),
    ownership: normalizedOwnership,
    cardIds: stringSet(part.cardIds, `${label}.cardIds`, { min: 1, max: 1000 }),
    outcomeIds: stringSet(part.outcomeIds, `${label}.outcomeIds`, { min: 1, max: 1000 }),
    conceptIds: stringSet(part.conceptIds, `${label}.conceptIds`, { min: 1, max: 1000 }),
    operationIds: stringSet(part.operationIds, `${label}.operationIds`, { min: 1, max: 1000 }),
    misconceptionIds: stringSet(
      part.misconceptionIds,
      `${label}.misconceptionIds`,
      { max: 1000 }
    )
  };
}

function validatePartSpecification(part, index, project) {
  const label = `specification`;
  const allowedFields = new Set([
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys", "ownership",
    "outcomeIds", "conceptIds", "operationIds", "misconceptionIds", "structure",
    "cardPlan", "allowedSourceIds", "availableTermIds", "preserve"
  ]);
  const unknownFields = Object.keys(part || {}).filter((field) => !allowedFields.has(field));
  if (unknownFields.length) planError(`${label} contém campo desconhecido: ${unknownFields[0]}.`);
  const outline = validatePartOutline(Object.fromEntries([
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys",
    "ownership", "outcomeIds", "conceptIds", "operationIds", "misconceptionIds"
  ].map((field) => [field, part?.[field]]).concat([[
    "cardIds",
    Array.isArray(part?.cardPlan) ? part.cardPlan.map((card) => card?.cardId) : []
  ]])), index, project, label);
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
  for (const [microsequenceIndex, microsequence] of structuredMicrosequences.entries()) {
    const microsequencePath = `${label}.structure.microsequences[${microsequenceIndex}]`;
    const allowedMicroFields = new Set([
      "id", "title", "goal", "role", "status", "dependsOn", "dependencyRationale",
      "covers", "checks", "errors"
    ]);
    const unknown = Object.keys(microsequence).filter((field) => !allowedMicroFields.has(field));
    if (unknown.length) {
      planErrorAt(`${microsequencePath}.${unknown[0]}`, "unknown_field", `${microsequencePath} contém campo desconhecido: ${unknown[0]}.`);
    }
    if (!Object.hasOwn(microsequence, "dependencyRationale")) {
      planErrorAt(
        `${microsequencePath}.dependencyRationale`,
        "missing_field",
        `${microsequencePath}.dependencyRationale é obrigatório; use um objeto vazio quando não houver dependência.`
      );
    }
    for (const field of ["title", "goal", "role", "status"]) {
      requiredText(microsequence, field, { max: 20000, path: `${microsequencePath}.${field}`, plan: true });
    }
    if (!MICROSEQUENCE_ROLES.has(microsequence.role)) {
      planErrorAt(`${microsequencePath}.role`, "invalid_value", `${microsequencePath}.role é inválido.`, {
        expected: [...MICROSEQUENCE_ROLES],
        value: microsequence.role
      });
    }
    if (microsequence.status !== "planned") {
      planErrorAt(`${microsequencePath}.status`, "invalid_value", `${microsequencePath}.status deve ser planned.`, {
        expectedValue: "planned",
        actualValue: microsequence.status
      });
    }
    const dependencies = stringSet(microsequence.dependsOn || [], `${microsequencePath}.dependsOn`);
    const rationale = boundedObject(
      microsequence.dependencyRationale || {},
      `${microsequencePath}.dependencyRationale`,
      { required: true }
    );
    if (Object.keys(rationale).length !== dependencies.length
        || Object.keys(rationale).some((dependency) => !dependencies.includes(dependency))) {
      planErrorAt(
        `${microsequencePath}.dependencyRationale`,
        "dependency_rationale_mismatch",
        `${microsequencePath}.dependencyRationale deve justificar cada dependência.`,
        { dependencies }
      );
    }
    dependencies.forEach((dependency) => {
      if (typeof rationale[dependency] !== "string" || !rationale[dependency].trim()
          || rationale[dependency].length > 4000) {
        planErrorAt(
          `${microsequencePath}.dependencyRationale.${dependency}`,
          "invalid_value",
          `${microsequencePath}.dependencyRationale.${dependency} deve ser uma justificativa não vazia.`,
          { expected: "non-empty string with at most 4000 characters", value: rationale[dependency] }
        );
      }
    });
    for (const field of ["covers", "checks", "errors"]) {
      stringSet(microsequence[field] || [], `${microsequencePath}.${field}`);
    }
  }
  const seenCardIds = new Set();
  const normalizedCardPlan = cardPlan.map((card, cardIndex) => {
    const cardPath = `${label}.cardPlan[${cardIndex}]`;
    const allowedCardFields = new Set([
      "cardId", "microsequenceId", "position", "resource", "kind", "exercise",
      "purpose", "evidence", "outcomeIds", "operationId", "codeLanguage", "notation",
      "languageTag", "textDirection", "targetError", "learningFunction", "resourceRationale",
      "variationFocus", "contextAnchors", "introducedTermIds",
      "requiredTermIds", "conceptIds", "retrievedConceptIds", "misconceptionIds",
      "sourceIds", "claimIds"
    ]);
    const unknown = Object.keys(card).filter((field) => !allowedCardFields.has(field));
    if (unknown.length) {
      planErrorAt(`${cardPath}.${unknown[0]}`, "unknown_field", `${cardPath} contém campo desconhecido: ${unknown[0]}.`);
    }
    const cardId = requiredText(card, "cardId", { max: 160, path: `${cardPath}.cardId`, plan: true });
    const microsequenceId = requiredText(card, "microsequenceId", {
      max: 160,
      path: `${cardPath}.microsequenceId`,
      plan: true
    });
    const position = Number(card.position);
    const resource = requiredText(card, "resource", { max: 40, path: `${cardPath}.resource`, plan: true });
    const kind = requiredText(card, "kind", { max: 40, path: `${cardPath}.kind`, plan: true });
    const exercise = requiredText(card, "exercise", { max: 40, path: `${cardPath}.exercise`, plan: true });
    const learningFunction = requiredText(card, "learningFunction", {
      max: 40,
      path: `${cardPath}.learningFunction`,
      plan: true
    });
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
    const operationId = requiredText(card, "operationId", {
      max: 160,
      path: `${cardPath}.operationId`,
      plan: true
    });
    if (!IDENTIFIER_PATTERN.test(operationId)) {
      planErrorAt(
        `${cardPath}.operationId`,
        "invalid_identifier",
        `${cardPath}.operationId deve ser um identificador estável.`,
        { value: operationId }
      );
    }
    const isPractice = PRACTICE_FUNCTIONS.has(learningFunction);
    if (isPractice !== (kind === "exercise")) {
      planErrorAt(
        `${cardPath}.learningFunction`,
        "learning_function_mismatch",
        `${cardPath}.learningFunction deve descrever uma prática somente em card kind exercise; foundation e worked_example pertencem a cards teóricos.`,
        { learningFunction, kind, exercise }
      );
    }
    const normalized = {
      cardId,
      microsequenceId,
      position,
      resource,
      kind,
      exercise,
      purpose: requiredText(card, "purpose", { max: 20000, path: `${cardPath}.purpose`, plan: true }),
      evidence: requiredText(card, "evidence", { max: 20000, path: `${cardPath}.evidence`, plan: true }),
      outcomeIds: stringSet(card.outcomeIds, `${cardPath}.outcomeIds`, { min: 1 }),
      operationId,
      learningFunction,
      resourceRationale: requiredText(card, "resourceRationale", {
        max: 20000,
        path: `${cardPath}.resourceRationale`,
        plan: true
      }),
      contextAnchors: stringSet(card.contextAnchors, `${cardPath}.contextAnchors`, {
        min: isPractice ? 1 : 0,
        max: 50
      }),
      introducedTermIds: stringSet(card.introducedTermIds, `${cardPath}.introducedTermIds`),
      requiredTermIds: stringSet(card.requiredTermIds, `${cardPath}.requiredTermIds`),
      conceptIds: stringSet(card.conceptIds, `${cardPath}.conceptIds`, { min: 1 }),
      retrievedConceptIds: stringSet(
        card.retrievedConceptIds,
        `${cardPath}.retrievedConceptIds`
      ),
      misconceptionIds: stringSet(card.misconceptionIds, `${cardPath}.misconceptionIds`),
      sourceIds: stringSet(card.sourceIds, `${cardPath}.sourceIds`),
      claimIds: stringSet(card.claimIds || [], `${cardPath}.claimIds`)
    };
    assertReferences(
      normalized.retrievedConceptIds,
      new Set(normalized.conceptIds),
      `${cardPath}.retrievedConceptIds`
    );
    if (learningFunction === "error_diagnosis" && normalized.misconceptionIds.length === 0) {
      planErrorAt(
        `${cardPath}.misconceptionIds`,
        "missing_misconception",
        `${cardPath}.misconceptionIds deve identificar o erro examinado por error_diagnosis.`
      );
    }
    if (resource === "code") {
      normalized.codeLanguage = requiredText(card, "codeLanguage", {
        max: 80,
        path: `${cardPath}.codeLanguage`,
        plan: true
      });
    } else if (card.codeLanguage !== undefined) {
      planErrorAt(
        `${cardPath}.codeLanguage`,
        "not_applicable",
        `${cardPath}.codeLanguage só pode ser usado com resource code.`
      );
    }
    if (resource === "formula") {
      const notation = requiredText(card, "notation", {
        max: 20,
        path: `${cardPath}.notation`,
        plan: true
      });
      if (!["mathematics", "chemistry"].includes(notation)) {
        planErrorAt(
          `${cardPath}.notation`,
          "invalid_notation",
          `${cardPath}.notation deve ser mathematics ou chemistry.`,
          { value: notation }
        );
      }
      normalized.notation = notation;
    } else if (card.notation !== undefined) {
      planErrorAt(
        `${cardPath}.notation`,
        "not_applicable",
        `${cardPath}.notation só pode ser usado com resource formula.`
      );
    }
    const languageTag = optionalText(card, "languageTag", { max: 63 });
    if (languageTag !== undefined) {
      if (!languageTag || !LANGUAGE_TAG_PATTERN.test(languageTag)) {
        planErrorAt(
          `${cardPath}.languageTag`,
          "invalid_language_tag",
          `${cardPath}.languageTag deve usar uma etiqueta BCP 47 simples.`,
          { value: card.languageTag }
        );
      }
      normalized.languageTag = languageTag;
    }
    const textDirection = optionalText(card, "textDirection", { max: 4 });
    if (textDirection !== undefined) {
      if (!["auto", "ltr", "rtl"].includes(textDirection)) {
        planErrorAt(
          `${cardPath}.textDirection`,
          "invalid_text_direction",
          `${cardPath}.textDirection deve ser auto, ltr ou rtl.`,
          { value: card.textDirection }
        );
      }
      normalized.textDirection = textDirection;
    }
    if (kind === "exercise" || PRACTICE_FUNCTIONS.has(learningFunction)) {
      normalized.targetError = requiredText(card, "targetError", {
        max: 20000,
        path: `${cardPath}.targetError`,
        plan: true
      });
      normalized.variationFocus = requiredText(card, "variationFocus", {
        max: 20000,
        path: `${cardPath}.variationFocus`,
        plan: true
      });
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
  const assignedOutcomeIds = new Set(outline.outcomeIds);
  for (const [cardIndex, card] of normalizedCardPlan.entries()) {
    assertReferences(card.outcomeIds, assignedOutcomeIds, `specification.cardPlan[${cardIndex}].outcomeIds`);
  }
  const outcomesWithObservablePractice = new Set(
    normalizedCardPlan
      .filter((card) => PRACTICE_FUNCTIONS.has(card.learningFunction))
      .flatMap((card) => card.outcomeIds)
  );
  const outcomeWithoutPractice = outline.outcomeIds.find((outcomeId) =>
    !outcomesWithObservablePractice.has(outcomeId)
  );
  if (outcomeWithoutPractice) {
    planErrorAt(
      "specification.cardPlan",
      "outcome_without_observable_practice",
      `specification.cardPlan não associa o resultado ${outcomeWithoutPractice} a uma prática observável.`,
      { outcomeId: outcomeWithoutPractice }
    );
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
  const externalInstruction = new Map();
  for (const entry of Array.isArray(continuity.workedOperations)
    ? continuity.workedOperations
    : []) {
    const operationId = typeof entry?.operationId === "string" ? entry.operationId.trim() : "";
    const microsequenceId = typeof entry?.microsequenceId === "string"
      ? entry.microsequenceId.trim()
      : "";
    if (!operationId || !microsequenceId || !external.has(microsequenceId)) continue;
    if (!externalInstruction.has(operationId)) externalInstruction.set(operationId, new Set());
    externalInstruction.get(operationId).add(microsequenceId);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    const microsequenceIndex = specification.structure.microsequences.findIndex((item) => item.id === id);
    const dependencyPath = `specification.structure.microsequences[${microsequenceIndex}].dependsOn`;
    if (visiting.has(id)) {
      planErrorAt(dependencyPath, "dependency_cycle", `A microssequência ${id} forma um ciclo de dependências.`, {
        microsequenceId: id
      });
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of microsequences.get(id)?.dependsOn || []) {
      if (!microsequences.has(dependency) && !external.has(dependency)) {
        planErrorAt(
          dependencyPath,
          "missing_dependency",
          `${dependencyPath} contém ${dependency}, que não pertence à parte nem ao contexto causal aprovado.`,
          { microsequenceId: id, dependencyId: dependency }
        );
      }
      if (microsequences.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of microsequences.keys()) visit(id);

  const cardsByOperation = new Map();
  for (const card of specification.cardPlan) {
    if (!cardsByOperation.has(card.operationId)) cardsByOperation.set(card.operationId, []);
    cardsByOperation.get(card.operationId).push(card);
  }
  const comesBefore = (earlier, later) => earlier.microsequenceId === later.microsequenceId
    ? earlier.position < later.position
    : hasDependencyPath(microsequences, later.microsequenceId, earlier.microsequenceId);
  for (const [operationId, cards] of cardsByOperation) {
    const instruction = cards.filter((card) =>
      card.learningFunction === "foundation" || card.learningFunction === "worked_example"
    );
    const practices = cards.filter((card) => PRACTICE_FUNCTIONS.has(card.learningFunction));
    if (!practices.length) continue;
    for (const practice of practices) {
      const externalMicrosequenceIds = externalInstruction.get(operationId) || new Set();
      const hasApprovedExternalInstruction = hasExternalDependencyPath(
        microsequences,
        practice.microsequenceId,
        externalMicrosequenceIds
      );
      if (!hasApprovedExternalInstruction
          && !instruction.some((entry) => comesBefore(entry, practice))) {
        const cardIndex = specification.cardPlan.findIndex((item) => item.cardId === practice.cardId);
        const path = `specification.cardPlan[${cardIndex}].learningFunction`;
        planErrorAt(
          path,
          "missing_instructional_predecessor",
          `${path} pratica a operação ${operationId} sem foundation ou worked_example anterior da mesma operação.`,
          { operationId, cardId: practice.cardId }
        );
      }
    }
    if (practices.length === 1) continue;
    const seenVariations = new Set();
    for (const practice of practices) {
      const variation = practice.variationFocus.normalize("NFC").toLowerCase();
      if (seenVariations.has(variation)) {
        const cardIndex = specification.cardPlan.findIndex((item) => item.cardId === practice.cardId);
        const path = `specification.cardPlan[${cardIndex}].variationFocus`;
        planErrorAt(
          path,
          "repeated_variation",
          `${path} repete a variação de outra prática da operação ${operationId}.`,
          { operationId }
        );
      }
      seenVariations.add(variation);
    }
    const guided = practices.filter((card) => card.learningFunction === "guided_practice");
    const lessSupported = practices.filter((card) =>
      LESS_SUPPORTED_PRACTICE_FUNCTIONS.has(card.learningFunction)
    );
    const prematurePractice = lessSupported.find((practice) =>
      !guided.some((guidedCard) => comesBefore(guidedCard, practice))
    );
    if (prematurePractice) {
      const firstIndex = specification.cardPlan.findIndex(
        (item) => item.cardId === prematurePractice.cardId
      );
      const path = `specification.cardPlan[${firstIndex}].learningFunction`;
      planErrorAt(
        path,
        "inverted_support_progression",
        `${path} apresenta prática com menor apoio antes de qualquer guided_practice da operação ${operationId}.`,
        { operationId }
      );
    }
  }
  return { microsequences, external, externalInstruction };
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

function hasExternalDependencyPath(microsequences, fromId, targetIds, visited = new Set()) {
  if (!targetIds.size || visited.has(fromId)) return false;
  visited.add(fromId);
  for (const dependency of microsequences.get(fromId)?.dependsOn || []) {
    if (targetIds.has(dependency)) return true;
    if (microsequences.has(dependency)
        && hasExternalDependencyPath(microsequences, dependency, targetIds, visited)) {
      return true;
    }
  }
  return false;
}

function assertConceptRetrievalCausality(specification, continuity, didacticGraph) {
  const introductions = specification.cardPlan.filter((card) =>
    ["foundation", "worked_example"].includes(card.learningFunction)
  );
  const externalByConcept = new Map();
  for (const entry of Array.isArray(continuity.introducedConcepts)
    ? continuity.introducedConcepts
    : []) {
    const conceptId = typeof entry?.conceptId === "string"
      ? entry.conceptId.trim()
      : "";
    const microsequenceId = typeof entry?.microsequenceId === "string"
      ? entry.microsequenceId.trim()
      : "";
    if (!conceptId || !microsequenceId || !didacticGraph.external.has(microsequenceId)) {
      continue;
    }
    if (!externalByConcept.has(conceptId)) externalByConcept.set(conceptId, new Set());
    externalByConcept.get(conceptId).add(microsequenceId);
  }
  const comesBefore = (earlier, later) => earlier.microsequenceId === later.microsequenceId
    ? earlier.position < later.position
    : hasDependencyPath(
      didacticGraph.microsequences,
      later.microsequenceId,
      earlier.microsequenceId
    );

  specification.cardPlan.forEach((card, cardIndex) => {
    if (PRACTICE_FUNCTIONS.has(card.learningFunction)) {
      const missing = card.conceptIds.find(
        (conceptId) => !card.retrievedConceptIds.includes(conceptId)
      );
      if (missing) {
        planErrorAt(
          `specification.cardPlan[${cardIndex}].retrievedConceptIds`,
          "practice_concept_not_retrieved",
          `A prática ${card.cardId} deve declarar ${missing} como conceito retomado.`,
          { cardId: card.cardId, conceptId: missing }
        );
      }
    }
    card.retrievedConceptIds.forEach((conceptId) => {
      const localIntroduction = introductions.some((candidate) =>
        candidate.conceptIds.includes(conceptId)
        && !candidate.retrievedConceptIds.includes(conceptId)
        && comesBefore(candidate, card)
      );
      const externalIntroduction = hasExternalDependencyPath(
        didacticGraph.microsequences,
        card.microsequenceId,
        externalByConcept.get(conceptId) || new Set()
      );
      if (!localIntroduction && !externalIntroduction) {
        planErrorAt(
          `specification.cardPlan[${cardIndex}].retrievedConceptIds`,
          "concept_retrieved_before_introduction",
          `${conceptId} foi marcado como retomada sem uma introdução anterior na cadeia causal.`,
          { cardId: card.cardId, conceptId }
        );
      }
    });
  });
}

function assertConceptPrerequisiteCausality(
  specification,
  continuity,
  didacticGraph,
  conceptRelations
) {
  const requirementsByConcept = new Map();
  for (const relation of Array.isArray(conceptRelations) ? conceptRelations : []) {
    if (relation?.relation !== "requires") continue;
    const conceptId = typeof relation?.from === "string" ? relation.from.trim() : "";
    const prerequisiteConceptId = typeof relation?.to === "string" ? relation.to.trim() : "";
    if (!conceptId || !prerequisiteConceptId) continue;
    if (!requirementsByConcept.has(conceptId)) {
      requirementsByConcept.set(conceptId, new Set());
    }
    requirementsByConcept.get(conceptId).add(prerequisiteConceptId);
  }
  if (!requirementsByConcept.size) return;

  const prerequisiteClosure = (conceptId) => {
    const prerequisites = new Set();
    const pending = [conceptId];
    while (pending.length) {
      const dependentConceptId = pending.pop();
      for (const prerequisiteConceptId of requirementsByConcept.get(dependentConceptId) || []) {
        if (prerequisites.has(prerequisiteConceptId)) continue;
        prerequisites.add(prerequisiteConceptId);
        pending.push(prerequisiteConceptId);
      }
    }
    prerequisites.delete(conceptId);
    return prerequisites;
  };
  const introductions = specification.cardPlan.filter((card) =>
    ["foundation", "worked_example"].includes(card.learningFunction)
  );
  const externalByConcept = new Map();
  for (const entry of Array.isArray(continuity.introducedConcepts)
    ? continuity.introducedConcepts
    : []) {
    const conceptId = typeof entry?.conceptId === "string"
      ? entry.conceptId.trim()
      : "";
    const microsequenceId = typeof entry?.microsequenceId === "string"
      ? entry.microsequenceId.trim()
      : "";
    if (!conceptId || !microsequenceId || !didacticGraph.external.has(microsequenceId)) {
      continue;
    }
    if (!externalByConcept.has(conceptId)) externalByConcept.set(conceptId, new Set());
    externalByConcept.get(conceptId).add(microsequenceId);
  }
  const comesBefore = (earlier, later) => earlier.microsequenceId === later.microsequenceId
    ? earlier.position < later.position
    : hasDependencyPath(
      didacticGraph.microsequences,
      later.microsequenceId,
      earlier.microsequenceId
    );

  specification.cardPlan.forEach((card, cardIndex) => {
    const dependentConceptIds = PRACTICE_FUNCTIONS.has(card.learningFunction)
      ? card.conceptIds
      : card.retrievedConceptIds;
    for (const conceptId of dependentConceptIds) {
      for (const prerequisiteConceptId of prerequisiteClosure(conceptId)) {
        const localIntroduction = introductions.some((candidate) =>
          candidate.conceptIds.includes(prerequisiteConceptId)
          && !candidate.retrievedConceptIds.includes(prerequisiteConceptId)
          && comesBefore(candidate, card)
        );
        const externalIntroduction = hasExternalDependencyPath(
          didacticGraph.microsequences,
          card.microsequenceId,
          externalByConcept.get(prerequisiteConceptId) || new Set()
        );
        if (localIntroduction || externalIntroduction) continue;
        const path = PRACTICE_FUNCTIONS.has(card.learningFunction)
          ? `specification.cardPlan[${cardIndex}].conceptIds`
          : `specification.cardPlan[${cardIndex}].retrievedConceptIds`;
        planErrorAt(
          path,
          "concept_prerequisite_not_presented",
          `${conceptId} requer ${prerequisiteConceptId}, que ainda não foi apresentado na cadeia causal.`,
          { cardId: card.cardId, conceptId, prerequisiteConceptId }
        );
      }
    }
  });
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

export function validateIntegrationId(value) {
  const clientId = typeof value === "string" ? value.trim() : "";
  if (!RUN_ID_PATTERN.test(clientId)) {
    throw new AuthoringApiError(400, "invalid_integration_id", "Identificador de integração inválido.");
  }
  return clientId;
}

export function validatePartKey(value) {
  const partKey = typeof value === "string" ? value.trim() : "";
  if (!PART_KEY_PATTERN.test(partKey)) {
    throw new AuthoringApiError(400, "invalid_part_key", "Identificador de parte inválido.");
  }
  return partKey;
}

function validateIntegrationLifetime(value) {
  const days = value == null ? 90 : Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      "expiresInDays deve ser um inteiro entre 1 e 365."
    );
  }
  return days;
}

export function validateCreatePrivateIntegrationPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const allowed = new Set(["requestId", "name", "expiresInDays"]);
  const unknown = Object.keys(payload).find((field) => !allowed.has(field));
  if (unknown) {
    throw new AuthoringApiError(422, "invalid_payload", `Campo desconhecido: ${unknown}.`);
  }
  return {
    requestId: validateRequestId(payload.requestId),
    name: requiredText(payload, "name", { max: 80 }),
    expiresInDays: validateIntegrationLifetime(payload.expiresInDays)
  };
}

export function validateRotatePrivateIntegrationPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const allowed = new Set(["requestId", "expiresInDays"]);
  const unknown = Object.keys(payload).find((field) => !allowed.has(field));
  if (unknown) {
    throw new AuthoringApiError(422, "invalid_payload", `Campo desconhecido: ${unknown}.`);
  }
  return {
    requestId: validateRequestId(payload.requestId),
    expiresInDays: validateIntegrationLifetime(payload.expiresInDays)
  };
}

export function validateCreateRunPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const target = String(payload.target || "catalog").trim();
  if (!new Set(["catalog", "private"]).has(target)) {
    throw new AuthoringApiError(422, "invalid_payload", "Destino de autoria inválido.");
  }
  const normalizedIntent = validatePublicationIntent(payload.publicationIntent);
  if (target === "private" && payload.collectionId != null) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      "Cursos privados não pertencem ao catálogo."
    );
  }
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

function normalizeExpectedPlanContext(expectedRun = null) {
  if (typeof expectedRun === "string") {
    return { runId: expectedRun, contractKey: null };
  }
  if (!expectedRun || typeof expectedRun !== "object" || Array.isArray(expectedRun)) {
    return { runId: null, contractKey: null };
  }
  return {
    runId: expectedRun.runId == null ? null : validateRunId(expectedRun.runId),
    contractKey: typeof expectedRun.contractKey === "string"
      ? expectedRun.contractKey.trim()
      : null
  };
}

export function validatePlanPayload(payload, expectedRun = null) {
  if (!isPlainObject(payload)) {
    invalidPayloadAt("$", "wrong_type", "O corpo deve ser um objeto JSON.", {
      expected: "object",
      value: payload
    });
  }
  if (!isPlainObject(payload.plan)) {
    planErrorAt(
      "plan",
      payload.plan == null ? "required" : "wrong_type",
      "plan deve ser um objeto.",
      { expected: "course plan object", value: payload.plan }
    );
  }
  if (payload.plan.artifact !== "aralearn.course-plan" || payload.plan.version !== 1) {
    const path = payload.plan.artifact !== "aralearn.course-plan" ? "plan.artifact" : "plan.version";
    planErrorAt(path, "invalid_value", "plan deve usar o artefato aralearn.course-plan versão 1.", {
      expectedArtifact: "aralearn.course-plan",
      expectedVersion: 1,
      actualArtifact: payload.plan.artifact,
      actualVersion: payload.plan.version
    });
  }
  const expectedContext = normalizeExpectedPlanContext(expectedRun);
  const planRunId = validateRunId(payload.plan.runId);
  if (expectedContext.runId && planRunId !== expectedContext.runId) {
    planError("plan.runId não corresponde à execução da URL.");
  }
  const allowedPlanFields = new Set([
    "artifact", "version", "runId", "project", "ledgerManifest", "course",
    "learningOutcomes", "operations", "misconceptions", "conceptMap", "parts",
    "acceptanceCriteria"
  ]);
  const unknownPlanFields = Object.keys(payload.plan).filter((field) => !allowedPlanFields.has(field));
  if (unknownPlanFields.length) {
    planErrorAt(`plan.${unknownPlanFields[0]}`, "unknown_field", `plan contém campo desconhecido: ${unknownPlanFields[0]}.`);
  }
  const project = validateProjectSkeleton(payload.plan.project);
  if (expectedContext.contractKey && project.courses[0]?.id !== expectedContext.contractKey) {
    planErrorAt(
      "plan.project.courses[0].id",
      "run_contract_key_mismatch",
      "plan.project.courses[0].id deve usar exatamente o contractKey da execução.",
      {
        expectedValue: expectedContext.contractKey,
        actualValue: project.courses[0]?.id
      }
    );
  }
  const ledgerManifest = validateLedgerManifest(payload.plan.ledgerManifest, planRunId);
  const course = validateCoursePlan(payload.plan.course, project);
  const learningOutcomes = validateLearningOutcomes(payload.plan.learningOutcomes);
  const operations = validateOperations(payload.plan.operations);
  const misconceptions = validateMisconceptions(payload.plan.misconceptions);
  const conceptMap = validateConceptMap(payload.plan.conceptMap);
  assertUniqueLearningComponentIds({
    learningOutcomes,
    operations,
    misconceptions,
    concepts: conceptMap.concepts
  });
  const acceptanceCriteria = stringSet(
    payload.plan.acceptanceCriteria,
    "plan.acceptanceCriteria",
    { min: 1, max: 1000 }
  );
  const parts = payload.plan.parts;
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 256) {
    const reason = !Array.isArray(parts) ? "wrong_type" : parts.length === 0 ? "too_few_items" : "too_many_items";
    planErrorAt("plan.parts", reason, "plan.parts deve conter de 1 a 256 partes.", {
      expected: "array with 1 to 256 part objects",
      value: parts,
      minItems: 1,
      maxItems: 256
    });
  }
  const seen = new Set();
  const normalizedParts = parts.map((part, index) => {
    if (!isPlainObject(part)) {
      planErrorAt(`plan.parts[${index}]`, "wrong_type", `plan.parts[${index}] deve ser um objeto.`, {
        expected: "part object",
        value: part
      });
    }
    const normalized = validatePartOutline(part, index, project);
    const key = normalized.key;
    if (seen.has(key)) {
      planErrorAt(`plan.parts[${index}].key`, "duplicate", `plan.parts[${index}].key repete ${key}.`, { value: key });
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
  const operationIds = new Set(operations.map((operation) => operation.id));
  const conceptIds = new Set(conceptMap.concepts.map((concept) => concept.id));
  const misconceptionIds = new Set(misconceptions.map((misconception) => misconception.id));
  normalizedParts.forEach((part, index) => {
    const path = `plan.parts[${index}]`;
    assertReferences(part.outcomeIds, outcomeIds, `${path}.outcomeIds`);
    assertReferences(part.operationIds, operationIds, `${path}.operationIds`);
    assertReferences(part.conceptIds, conceptIds, `${path}.conceptIds`);
    assertReferences(part.misconceptionIds, misconceptionIds, `${path}.misconceptionIds`);
  });
  const assignedOutcomeIds = new Set(normalizedParts.flatMap((part) => part.outcomeIds));
  assertReferences([...outcomeIds], assignedOutcomeIds, "plan.learningOutcomes");
  const assignedOperationIds = new Set(normalizedParts.flatMap((part) => part.operationIds));
  assertReferences([...operationIds], assignedOperationIds, "plan.operations");
  const assignedConceptIds = new Set(normalizedParts.flatMap((part) => part.conceptIds));
  assertReferences([...conceptIds], assignedConceptIds, "plan.conceptMap.concepts");
  const assignedMisconceptionIds = new Set(
    normalizedParts.flatMap((part) => part.misconceptionIds)
  );
  assertReferences([...misconceptionIds], assignedMisconceptionIds, "plan.misconceptions");
  return {
    requestId: validateRequestId(payload.requestId),
    plan: {
      ...payload.plan,
      runId: planRunId,
      project,
      ledgerManifest,
      course,
      learningOutcomes,
      operations,
      misconceptions,
      conceptMap,
      acceptanceCriteria,
      parts: normalizedParts
    }
  };
}

export function validatePartSpecificationEnvelope(payload) {
  if (!isPlainObject(payload)) {
    invalidPayloadAt("$", "wrong_type", "O corpo deve ser um objeto JSON.", {
      expected: "object",
      value: payload
    });
  }
  if (!isPlainObject(payload.specification)) {
    planErrorAt(
      "specification",
      payload.specification == null ? "required" : "wrong_type",
      "specification deve ser um objeto.",
      { expected: "part specification object", value: payload.specification }
    );
  }
  if (byteLength(payload.specification) > PART_SPECIFICATION_LIMIT) {
    throw new AuthoringApiError(413, "payload_too_large", "A especificação excede o limite seguro de transporte.");
  }
  return {
    requestId: validateRequestId(payload.requestId),
    planHash: validateSha256(payload.planHash, "planHash"),
    specification: payload.specification
  };
}

const PART_SPECIFICATION_OUTLINE_FIELDS = Object.freeze([
  "key",
  "title",
  "boundary",
  "cutReason",
  "dependsOnPartKeys",
  "ownership",
  "outcomeIds",
  "conceptIds",
  "operationIds",
  "misconceptionIds"
]);

function completePartSpecification(specification, next, project) {
  const outline = next?.outline;
  if (!isPlainObject(outline)) {
    throw new AuthoringApiError(
      409,
      "stale_part_outline",
      "O contorno persistido da parte não está disponível. Consulte a próxima parte novamente."
    );
  }
  const completed = { ...specification };
  for (const field of PART_SPECIFICATION_OUTLINE_FIELDS) {
    if (completed[field] === undefined) {
      completed[field] = structuredClone(outline[field]);
    }
  }

  const ownership = completed.ownership;
  const course = project?.courses?.find((item) => item?.id === ownership?.courseId);
  const moduleValue = course?.modules?.find((item) => item?.id === ownership?.moduleId);
  const lesson = moduleValue?.lessons?.find((item) => item?.id === ownership?.lessonId);
  if (course && moduleValue && lesson) {
    const immutableStructure = projectStructureSlice(course, moduleValue, lesson);
    if (completed.structure === undefined) {
      completed.structure = immutableStructure;
    } else if (isPlainObject(completed.structure)) {
      completed.structure = {
        ...immutableStructure,
        ...completed.structure
      };
    }
  }
  return completed;
}

export function validatePartSpecificationPayload(payload, route, run) {
  const envelope = validatePartSpecificationEnvelope(payload);
  const next = run?.nextPart;
  if (!next || next.partKey !== route.partKey) {
    throw new AuthoringApiError(409, "stale_part_outline", "Outra parte ocupa a primeira posição causal pendente.");
  }
  const specification = completePartSpecification(
    envelope.specification,
    next,
    run?.plan?.project
  );
  if (byteLength(specification) > PART_SPECIFICATION_LIMIT) {
    throw new AuthoringApiError(413, "payload_too_large", "A especificação excede o limite seguro de transporte.");
  }
  const normalized = validatePartSpecification(specification, next.position, run?.plan?.project);
  const expected = next.outline;
  const actual = {
    key: normalized.key,
    title: normalized.title,
    boundary: normalized.boundary,
    cutReason: normalized.cutReason,
    dependsOnPartKeys: normalized.dependsOnPartKeys,
    ownership: normalized.ownership,
    cardIds: normalized.cardPlan.map((card) => card.cardId),
    outcomeIds: normalized.outcomeIds,
    conceptIds: normalized.conceptIds,
    operationIds: normalized.operationIds,
    misconceptionIds: normalized.misconceptionIds
  };
  if (!sameJson(actual, expected)) {
    const fields = Object.keys(expected || {});
    const mismatchedField = fields.find((field) => !sameJson(actual?.[field], expected?.[field])) || "$";
    const path = mismatchedField === "$" ? "specification" : `specification.${mismatchedField}`;
    throw new AuthoringApiError(
      422,
      "part_outline_mismatch",
      `${path} diverge do contorno reservado no plano. Reutilize exatamente o valor devolvido por next_part.`,
      validationDetails(path, "outline_mismatch", { mismatchedField })
    );
  }
  const ledger = run?.plan?.ledger || {};
  const sourceIds = new Set((ledger.sources || []).map((source) => source.sourceId));
  const claimIds = new Set((ledger.claims || []).map((claim) => claim.claimId));
  const termIds = new Set((ledger.terms || []).map((term) => term.termId));
  const operationIds = new Set(normalized.operationIds);
  const operationsById = new Map(
    (run?.plan?.operations || []).map((operation) => [operation.id, operation])
  );
  const conceptIds = new Set(normalized.conceptIds);
  const misconceptionIds = new Set(normalized.misconceptionIds);
  assertReferences(normalized.allowedSourceIds, sourceIds, "specification.allowedSourceIds");
  assertReferences(normalized.availableTermIds, termIds, "specification.availableTermIds");
  for (const card of normalized.cardPlan) {
    assertReferences(stringSet(card.sourceIds || [], "specification.cardPlan[].sourceIds"), sourceIds, "specification.cardPlan[].sourceIds");
    assertReferences(stringSet(card.claimIds || [], "specification.cardPlan[].claimIds"), claimIds, "specification.cardPlan[].claimIds");
    assertReferences(stringSet(card.introducedTermIds || [], "specification.cardPlan[].introducedTermIds"), termIds, "specification.cardPlan[].introducedTermIds");
    assertReferences(stringSet(card.requiredTermIds || [], "specification.cardPlan[].requiredTermIds"), termIds, "specification.cardPlan[].requiredTermIds");
    assertReferences([card.operationId], operationIds, "specification.cardPlan[].operationId");
    const representation = operationsById.get(card.operationId)?.representation;
    if (!representation?.allowedResources?.includes(card.resource)) {
      planErrorAt(
        `specification.cardPlan[${card.cardId}].resource`,
        "resource_not_allowed_for_operation",
        `O resource ${card.resource} não foi autorizado para a operação ${card.operationId}.`,
        {
          operationId: card.operationId,
          resource: card.resource,
          allowedResources: representation?.allowedResources || []
        }
      );
    }
    assertReferences(card.conceptIds, conceptIds, "specification.cardPlan[].conceptIds");
    assertReferences(
      card.retrievedConceptIds,
      conceptIds,
      "specification.cardPlan[].retrievedConceptIds"
    );
    assertReferences(
      card.misconceptionIds,
      misconceptionIds,
      "specification.cardPlan[].misconceptionIds"
    );
  }
  for (const operationId of operationIds) {
    const operation = operationsById.get(operationId);
    const cards = normalized.cardPlan.filter((card) => card.operationId === operationId);
    const practiceCards = cards.filter((card) => card.kind === "exercise");
    const cardsThatMustUsePreferred = practiceCards.length ? practiceCards : cards;
    if (!cardsThatMustUsePreferred.some(
      (card) => operation?.representation?.preferredResources?.includes(card.resource)
    )) {
      planErrorAt(
        "specification.cardPlan",
        "preferred_resource_missing",
        practiceCards.length
          ? `A prática da operação ${operationId} precisa usar ao menos um dos recursos preferenciais declarados no plano.`
          : `A operação ${operationId} precisa usar ao menos um dos recursos preferenciais declarados no plano.`,
        {
          operationId,
          preferredResources: operation?.representation?.preferredResources || [],
          actualResources: [...new Set(cardsThatMustUsePreferred.map((card) => card.resource))],
          practiceRequired: practiceCards.length > 0
        }
      );
    }
  }
  const plannedCards = new Map(normalized.cardPlan.map((card) => [card.cardId, card]));
  const continuity = run?.continuity || {};
  const previouslyIntroduced = new Set(
    Array.isArray(continuity?.stateDelta?.introducedTermIds)
      ? continuity.stateDelta.introducedTermIds
      : []
  );
  const didacticGraph = assertDidacticCausality(normalized, continuity);
  assertConceptRetrievalCausality(normalized, continuity, didacticGraph);
  assertConceptPrerequisiteCausality(
    normalized,
    continuity,
    didacticGraph,
    run?.plan?.conceptMap?.relations
  );
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
      || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new AuthoringApiError(422, "invalid_payload", "O chunk do ledger é inválido.");
  }
  if (byteLength(payload.items) > LEDGER_CHUNK_BODY_LIMIT) {
    throw new AuthoringApiError(413, "payload_too_large", "Os itens do chunk excedem o limite seguro de transporte.");
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
      const accessedOn = optionalIsoDate(item, "accessedOn");
      if (stability === "volatile" && !accessedOn) {
        planErrorAt(
          `ledger.sources[${index}].accessedOn`,
          "required_for_volatile_source",
          `ledger.sources[${index}].accessedOn é obrigatório para fonte volátil.`
        );
      }
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
      const language = requiredText(item, "language", { max: 63 });
      if (!LANGUAGE_TAG_PATTERN.test(language)) {
        planErrorAt(
          `ledger.terms[${index}].language`,
          "invalid_language_tag",
          `ledger.terms[${index}].language deve usar uma etiqueta BCP 47 simples.`,
          { value: language }
        );
      }
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

function assertNoUnknownFields(value, allowed, path, label) {
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (!unknown) return;
  const unknownPath = path === "$" ? unknown : `${path}.${unknown}`;
  invalidPayloadAt(
    unknownPath,
    "unknown_field",
    `${unknownPath} é um campo desconhecido em ${label}.`,
    { value: value[unknown] }
  );
}

function validateFormalIdentifier(value, path) {
  if (typeof value !== "string") {
    invalidPayloadAt(path, value == null ? "required" : "wrong_type", `${path} deve ser texto.`, {
      expected: "stable identifier string",
      value
    });
  }
  if (!IDENTIFIER_PATTERN.test(value)) {
    invalidPayloadAt(
      path,
      "invalid_identifier",
      `${path} deve ser um identificador estável sem espaços.`,
      { expected: "1 to 160 safe identifier characters", value }
    );
  }
}

function validateFormalText(value, path, { max = 20000 } = {}) {
  if (typeof value !== "string") {
    invalidPayloadAt(path, value == null ? "required" : "wrong_type", `${path} deve ser texto.`, {
      expected: "non-empty string",
      value
    });
  }
  if (!value.trim()) {
    invalidPayloadAt(path, "empty", `${path} não pode ser vazio.`, {
      expected: "non-empty string",
      value
    });
  }
  if (Number.isFinite(max) && value.length > max) {
    invalidPayloadAt(path, "too_long", `${path} excede o tamanho permitido.`, {
      expected: `string with at most ${max} characters`,
      value,
      maxLength: max
    });
  }
}

function validateFormalStringSet(value, path, { identifiers = false } = {}) {
  if (!Array.isArray(value)) {
    invalidPayloadAt(path, value == null ? "required" : "wrong_type", `${path} deve ser uma lista.`, {
      expected: "array of unique non-empty strings",
      value
    });
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (identifiers) {
      validateFormalIdentifier(entry, entryPath);
      return;
    }
    if (typeof entry !== "string") {
      invalidPayloadAt(entryPath, "wrong_type", `${entryPath} deve ser texto.`, {
        expected: "non-empty string",
        value: entry
      });
    }
    if (!entry.trim()) {
      invalidPayloadAt(entryPath, "empty", `${entryPath} não pode ser vazio.`, {
        expected: "non-empty string",
        value: entry
      });
    }
    if (entry !== entry.trim()) {
      invalidPayloadAt(
        entryPath,
        "non_canonical_whitespace",
        `${entryPath} não pode começar ou terminar com espaços.`,
        { expected: "trimmed non-empty string", value: entry }
      );
    }
  });
  if (new Set(value).size !== value.length) {
    invalidPayloadAt(path, "duplicate", `${path} não pode conter duplicatas.`, { value });
  }
}

function validateFormalFragment(fragment) {
  assertNoUnknownFields(fragment, AUTHORING_FRAGMENT_FIELDS, "fragment", "fragment");
  ["courseId", "moduleId", "lessonId"].forEach((field) => {
    validateFormalIdentifier(fragment[field], `fragment.${field}`);
  });
  if (!Array.isArray(fragment.microsequences)) {
    invalidPayloadAt(
      "fragment.microsequences",
      fragment.microsequences == null ? "required" : "wrong_type",
      "fragment.microsequences deve ser uma lista.",
      { expected: "non-empty array", value: fragment.microsequences }
    );
  }
  if (!fragment.microsequences.length) {
    invalidPayloadAt(
      "fragment.microsequences",
      "too_few_items",
      "fragment.microsequences deve conter ao menos uma microssequência.",
      { expected: "non-empty array", value: fragment.microsequences, minItems: 1 }
    );
  }
  const microsequenceIds = new Set();
  fragment.microsequences.forEach((microsequence, index) => {
    const path = `fragment.microsequences[${index}]`;
    if (!isPlainObject(microsequence)) {
      invalidPayloadAt(path, "wrong_type", `${path} deve ser um objeto.`, {
        expected: "microsequence object",
        value: microsequence
      });
    }
    assertNoUnknownFields(
      microsequence,
      AUTHORING_MICROSEQUENCE_FIELDS,
      path,
      "microssequência"
    );
    validateFormalIdentifier(microsequence.id, `${path}.id`);
    if (microsequenceIds.has(microsequence.id)) {
      invalidPayloadAt(`${path}.id`, "duplicate", `${path}.id não pode repetir outra microssequência.`, {
        value: microsequence.id
      });
    }
    microsequenceIds.add(microsequence.id);
    validateFormalText(microsequence.title, `${path}.title`);
    validateFormalText(microsequence.goal, `${path}.goal`);
    if (!MICROSEQUENCE_ROLES.has(microsequence.role)) {
      const reason = microsequence.role == null
        ? "required"
        : typeof microsequence.role !== "string" ? "wrong_type" : "invalid_value";
      invalidPayloadAt(`${path}.role`, reason, `${path}.role é inválido.`, {
        expected: "explain, practice, review or support",
        value: microsequence.role
      });
    }
    if (!MICROSEQUENCE_STATUSES.has(microsequence.status)) {
      const reason = microsequence.status == null
        ? "required"
        : typeof microsequence.status !== "string" ? "wrong_type" : "invalid_value";
      invalidPayloadAt(`${path}.status`, reason, `${path}.status é inválido.`, {
        expected: "generated, needs_review or ready",
        value: microsequence.status
      });
    }
    ["dependsOn", "covers", "checks", "errors"].forEach((field) => {
      if (Object.hasOwn(microsequence, field)) {
        validateFormalStringSet(microsequence[field], `${path}.${field}`);
      }
    });
    if (!Array.isArray(microsequence.cards)) {
      invalidPayloadAt(
        `${path}.cards`,
        microsequence.cards == null ? "required" : "wrong_type",
        `${path}.cards deve ser uma lista.`,
        { expected: "non-empty array of card objects", value: microsequence.cards }
      );
    }
    if (!microsequence.cards.length) {
      invalidPayloadAt(`${path}.cards`, "too_few_items", `${path}.cards não pode ser vazio.`, {
        expected: "non-empty array of card objects",
        value: microsequence.cards,
        minItems: 1
      });
    }
    const invalidCardIndex = microsequence.cards.findIndex((card) => !isPlainObject(card));
    if (invalidCardIndex >= 0) {
      const cardPath = `${path}.cards[${invalidCardIndex}]`;
      invalidPayloadAt(cardPath, "wrong_type", `${cardPath} deve ser um objeto.`, {
        expected: "card object",
        value: microsequence.cards[invalidCardIndex]
      });
    }
  });
}

function validateFormalEvidence(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    invalidPayloadAt("evidence", "wrong_type", "evidence deve ser uma lista.", {
      expected: "array with at most 200 evidence objects",
      value
    });
  }
  if (value.length > 200) {
    invalidPayloadAt("evidence", "too_many_items", "evidence deve conter no máximo 200 itens.", {
      expected: "array with at most 200 evidence objects",
      value,
      maxItems: 200
    });
  }
  value.forEach((item, index) => {
    const path = `evidence[${index}]`;
    if (!isPlainObject(item)) {
      invalidPayloadAt(path, "wrong_type", `${path} deve ser um objeto.`, {
        expected: "evidence object",
        value: item
      });
    }
    assertNoUnknownFields(item, AUTHORING_EVIDENCE_FIELDS, path, "evidence");
    validateFormalText(item.sourceId, `${path}.sourceId`, { max: Number.POSITIVE_INFINITY });
    if (Object.hasOwn(item, "claimId")) {
      validateFormalText(item.claimId, `${path}.claimId`, { max: Number.POSITIVE_INFINITY });
    }
    if (Object.hasOwn(item, "cardIds")) {
      validateFormalStringSet(item.cardIds, `${path}.cardIds`, { identifiers: true });
    }
  });
  return value;
}

export function validatePartPayload(payload, route) {
  if (!isPlainObject(payload)) {
    invalidPayloadAt("$", "wrong_type", "O corpo deve ser um objeto JSON.", {
      expected: "part submission object",
      value: payload
    });
  }
  assertNoUnknownFields(payload, PART_SUBMISSION_FIELDS, "$", "submissão de parte");
  if (!isPlainObject(payload.fragment)) {
    invalidPayloadAt(
      "fragment",
      payload.fragment == null ? "required" : "wrong_type",
      "fragment deve ser um objeto.",
      { expected: "microsequence part object", value: payload.fragment }
    );
  }
  validateFormalFragment(payload.fragment);
  const identity = validateCausalIdentity(payload, {
    artifact: "aralearn.part-submission",
    runId: route.runId,
    partKey: route.partKey,
    staleCode: "stale_part_spec"
  });
  const mode = payload.mode;
  if (!PART_MODES.has(mode)) {
    invalidPayloadAt("mode", payload.mode == null ? "required" : "invalid_value", "mode deve ser build, repair ou rebuild.", {
      expected: "build, repair or rebuild",
      value: payload.mode
    });
  }
  const authoringFragment = payload.fragment;
  if (byteLength(authoringFragment) >= PART_FRAGMENT_LIMIT) {
    throw new AuthoringApiError(
      413,
      "part_too_large",
      "O fragmento formal deve ocupar menos de 90 kB. Divida o planejamento em partes menores."
    );
  }
  let fragment;
  try {
    fragment = compileAuthoringFragmentGaps(authoringFragment);
  } catch (error) {
    if (error instanceof AuthoringGapError) {
      invalidPayloadAt(error.path, error.reason, error.message, error.details);
    }
    throw error;
  }
  if (byteLength(fragment) >= PART_FRAGMENT_LIMIT) {
    throw new AuthoringApiError(
      413,
      "part_too_large",
      "A parte deve ocupar menos de 90 kB. Divida o planejamento em partes menores."
    );
  }
  const evidence = validateFormalEvidence(payload.evidence);
  return {
    artifact: payload.artifact,
    version: 1,
    ...identity,
    requestId: validateRequestId(payload.requestId),
    mode,
    baseLedgerSha256: validateSha256(payload.baseLedgerSha256, "baseLedgerSha256"),
    fragment,
    authoringFragment,
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

export function validateDeliveryPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const phase = requiredText(payload, "phase", { max: 40 });
  if (!new Set(["plan", "part_specification", "part_build", "part_audit", "final_validation"]).has(phase)) {
    throw new AuthoringApiError(422, "invalid_payload", "phase de entrega inválida.");
  }
  return {
    requestId: validateRequestId(payload.requestId),
    phase,
    summary: requiredText(payload, "summary", { max: 1000 }),
    partKey: payload.partKey == null ? null : validatePartKey(payload.partKey)
  };
}

export function validateDeliveryApprovalPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const phase = requiredText(payload, "phase", { max: 40 });
  if (!new Set(["plan", "part_specification", "part_build", "part_audit", "final_validation"]).has(phase)) {
    throw new AuthoringApiError(422, "invalid_payload", "phase de entrega inválida.");
  }
  return { requestId: validateRequestId(payload.requestId), phase };
}

export function validateSimpleCommandPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  return { requestId: validateRequestId(payload.requestId) };
}

export function validateImportPayload(payload) {
  if (!isPlainObject(payload) || !isPlainObject(payload.document)) {
    throw new AuthoringApiError(422, "invalid_payload", "document deve ser um objeto AraLearn v4.");
  }
  if (byteLength(payload.document) > MANUAL_IMPORT_BODY_LIMIT) {
    throw new AuthoringApiError(
      413,
      "course_too_large",
      "O documento do curso excede o limite seguro de transporte de uma única chamada."
    );
  }
  const target = String(payload.target || "catalog").trim();
  if (!new Set(["catalog", "private"]).has(target)) {
    throw new AuthoringApiError(422, "invalid_payload", "Destino de importação inválido.");
  }
  if (target === "private" && payload.collectionId != null) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      "Cursos privados não pertencem a uma coleção do catálogo."
    );
  }
  return {
    requestId: validateRequestId(payload.requestId),
    target,
    collectionId: payload.collectionId == null ? null : validateRunId(payload.collectionId),
    publicationIntent: validatePublicationIntent(payload.publicationIntent),
    document: payload.document
  };
}

function validateCatalogRevision(value, field = "baseRevision") {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      `${field} deve ser um inteiro positivo.`
    );
  }
  return revision;
}

function assertCatalogPayloadFields(payload, allowed) {
  if (!isPlainObject(payload)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  const unknown = Object.keys(payload).find((field) => !allowed.has(field));
  if (unknown) {
    throw new AuthoringApiError(422, "invalid_payload", `Campo desconhecido: ${unknown}.`);
  }
}

function validateCatalogDescription(value, { optional = false } = {}) {
  if (value == null && optional) return null;
  if (value == null) return "";
  if (typeof value !== "string" || value.length > 1000) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      "description deve ser texto com até 1000 caracteres."
    );
  }
  return value.trim();
}

function validateCatalogOrder(payload, itemName, idField) {
  if (!Array.isArray(payload.order) || payload.order.length > 1000) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      `order deve conter no máximo 1000 ${itemName}.`
    );
  }
  const seen = new Set();
  return payload.order.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new AuthoringApiError(
        422,
        "invalid_payload",
        `order[${index}] deve ser um objeto.`
      );
    }
    const allowed = new Set([idField, "baseRevision"]);
    const unknown = Object.keys(item).find((field) => !allowed.has(field));
    if (unknown || !Object.hasOwn(item, idField) || !Object.hasOwn(item, "baseRevision")) {
      throw new AuthoringApiError(
        422,
        "invalid_payload",
        `order[${index}] deve informar somente ${idField} e baseRevision.`
      );
    }
    const id = validateRunId(item[idField]);
    if (seen.has(id)) {
      throw new AuthoringApiError(422, "invalid_payload", `order repete ${idField}: ${id}.`);
    }
    seen.add(id);
    return {
      [idField]: id,
      baseRevision: validateCatalogRevision(
        item.baseRevision,
        `order[${index}].baseRevision`
      )
    };
  });
}

export function validateCreateCatalogCollectionPayload(payload) {
  assertCatalogPayloadFields(
    payload,
    new Set(["requestId", "contractKey", "title", "description"])
  );
  const contractKey = requiredText(payload, "contractKey", { max: 120 });
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/u.test(contractKey)) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      "contractKey deve usar letras minúsculas, números e hífens."
    );
  }
  return {
    requestId: validateRequestId(payload.requestId),
    contractKey,
    title: requiredText(payload, "title", { max: 160 }),
    description: validateCatalogDescription(payload.description)
  };
}

export function validateRenameCatalogCollectionPayload(payload) {
  assertCatalogPayloadFields(
    payload,
    new Set(["requestId", "baseRevision", "title", "description"])
  );
  return {
    requestId: validateRequestId(payload.requestId),
    baseRevision: validateCatalogRevision(payload.baseRevision),
    title: requiredText(payload, "title", { max: 160 }),
    description: Object.hasOwn(payload, "description")
      ? validateCatalogDescription(payload.description)
      : null
  };
}

export function validateRetireCatalogCollectionPayload(payload) {
  assertCatalogPayloadFields(
    payload,
    new Set(["requestId", "baseRevision", "replacementCollectionId"])
  );
  return {
    requestId: validateRequestId(payload.requestId),
    baseRevision: validateCatalogRevision(payload.baseRevision),
    replacementCollectionId: validateRunId(payload.replacementCollectionId)
  };
}

export function validateReorderCatalogCollectionsPayload(payload) {
  assertCatalogPayloadFields(payload, new Set(["requestId", "order"]));
  const order = validateCatalogOrder(payload, "coleções", "collectionId");
  if (!order.length) {
    throw new AuthoringApiError(422, "invalid_payload", "order deve conter ao menos uma coleção.");
  }
  return {
    requestId: validateRequestId(payload.requestId),
    order
  };
}

export function validateMoveCatalogCoursePayload(payload) {
  assertCatalogPayloadFields(
    payload,
    new Set(["requestId", "baseRevision", "targetCollectionId"])
  );
  return {
    requestId: validateRequestId(payload.requestId),
    baseRevision: validateCatalogRevision(payload.baseRevision),
    targetCollectionId: validateRunId(payload.targetCollectionId)
  };
}

export function validateReorderCatalogCoursesPayload(payload) {
  assertCatalogPayloadFields(payload, new Set(["requestId", "order"]));
  return {
    requestId: validateRequestId(payload.requestId),
    order: validateCatalogOrder(payload, "cursos", "courseId")
  };
}

function validatePersonalLibraryTitle(value, field, maxLength) {
  if (typeof value !== "string") {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      `${field} deve ser texto.`
    );
  }
  const title = value.trim();
  if (!title || title.length > maxLength) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      `${field} deve ter entre 1 e ${maxLength} caracteres.`
    );
  }
  return title;
}

export function validateCreatePersonalStudyPathPayload(payload) {
  assertCatalogPayloadFields(payload, new Set(["requestId", "title"]));
  return {
    requestId: validateRequestId(payload.requestId),
    title: validatePersonalLibraryTitle(payload.title, "title", 120)
  };
}

export function validateRenamePersonalStudyPathPayload(payload) {
  return validateCreatePersonalStudyPathPayload(payload);
}

export function validateDeletePersonalStudyPathPayload(payload) {
  assertCatalogPayloadFields(payload, new Set(["requestId"]));
  return { requestId: validateRequestId(payload.requestId) };
}

export function validateMovePersonalCourseSelectionPayload(payload) {
  assertCatalogPayloadFields(payload, new Set(["requestId", "targetPathId"]));
  if (!Object.hasOwn(payload, "targetPathId")) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      "targetPathId é obrigatório e aceita null para Sem trilha."
    );
  }
  return {
    requestId: validateRequestId(payload.requestId),
    targetPathId: payload.targetPathId == null
      ? null
      : validateRunId(payload.targetPathId)
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
  if (method === "GET" && path === "/v1/contracts/resources") {
    return { name: "listAuthoringResources" };
  }
  const resourceMatch = path.match(/^\/v1\/contracts\/resources\/([a-z_]+)$/);
  if (resourceMatch && method === "GET") {
    return { name: "getAuthoringResource", resource: resourceMatch[1] };
  }
  if (method === "GET" && path === "/v1/library/courses") {
    return { name: "listPersonalLibraryCourses" };
  }
  if (method === "GET" && path === "/v1/library/paths") {
    return { name: "listPersonalStudyPaths" };
  }
  if (method === "POST" && path === "/v1/library/paths") {
    return { name: "createPersonalStudyPath" };
  }
  let libraryMatch;
  libraryMatch = path.match(/^\/v1\/library\/paths\/([^/]+)$/);
  if (libraryMatch && new Set(["PATCH", "DELETE"]).has(method)) {
    return {
      name: method === "PATCH"
        ? "renamePersonalStudyPath"
        : "deletePersonalStudyPath",
      pathId: validateRunId(libraryMatch[1])
    };
  }
  libraryMatch = path.match(/^\/v1\/library\/selections\/([^/]+)\/path$/);
  if (libraryMatch && method === "PUT") {
    return {
      name: "movePersonalCourseSelection",
      selectionId: validateRunId(libraryMatch[1])
    };
  }
  if (method === "GET" && path === "/v1/catalog/collections") {
    return { name: "listCatalogCollections" };
  }
  if (method === "POST" && path === "/v1/catalog/collections") {
    return { name: "createCatalogCollection" };
  }
  if (method === "PUT" && path === "/v1/catalog/collections/order") {
    return { name: "reorderCatalogCollections" };
  }
  let catalogMatch = path.match(/^\/v1\/catalog\/collections\/([^/]+)\/courses\/order$/);
  if (catalogMatch && method === "PUT") {
    return {
      name: "reorderCatalogCourses",
      collectionId: validateRunId(catalogMatch[1])
    };
  }
  catalogMatch = path.match(/^\/v1\/catalog\/collections\/([^/]+)\/courses$/);
  if (catalogMatch && method === "GET") {
    return {
      name: "listCatalogCourses",
      collectionId: validateRunId(catalogMatch[1])
    };
  }
  catalogMatch = path.match(/^\/v1\/catalog\/collections\/([^/]+)\/retire$/);
  if (catalogMatch && method === "POST") {
    return {
      name: "retireCatalogCollection",
      collectionId: validateRunId(catalogMatch[1])
    };
  }
  catalogMatch = path.match(/^\/v1\/catalog\/collections\/([^/]+)$/);
  if (catalogMatch && method === "PATCH") {
    return {
      name: "renameCatalogCollection",
      collectionId: validateRunId(catalogMatch[1])
    };
  }
  catalogMatch = path.match(/^\/v1\/catalog\/courses\/([^/]+)\/placement$/);
  if (catalogMatch && method === "PUT") {
    return {
      name: "moveCatalogCourse",
      courseId: validateRunId(catalogMatch[1])
    };
  }
  catalogMatch = path.match(/^\/v1\/catalog\/courses\/([^/]+)$/);
  if (catalogMatch && method === "GET") {
    return {
      name: "getCatalogCourse",
      courseId: validateRunId(catalogMatch[1])
    };
  }
  if (method === "GET" && path === "/v1/integrations") {
    return { name: "listPrivateIntegrations" };
  }
  if (method === "POST" && path === "/v1/integrations") {
    return { name: "createPrivateIntegration" };
  }
  let integrationMatch = path.match(/^\/v1\/integrations\/([^/]+)\/(rotate)$/);
  if (integrationMatch && method === "POST") {
    return {
      name: "rotatePrivateIntegration",
      clientId: validateIntegrationId(integrationMatch[1])
    };
  }
  integrationMatch = path.match(/^\/v1\/integrations\/([^/]+)$/);
  if (integrationMatch && method === "DELETE") {
    return {
      name: "revokePrivateIntegration",
      clientId: validateIntegrationId(integrationMatch[1])
    };
  }
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
  match = path.match(/^\/v1\/runs\/([^/]+)\/(block|resume|deliver|approve-delivery)$/);
  if (match && method === "POST") {
    return {
      name: ({
        block: "blockRun",
        resume: "resumeRun",
        deliver: "deliverRun",
        "approve-delivery": "approveDeliveryRun"
      })[match[2]],
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
