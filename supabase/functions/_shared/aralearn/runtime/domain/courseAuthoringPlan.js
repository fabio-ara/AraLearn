import { normalizeCourseSourceLinks } from "./courseSources.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_LINKED_MICROSEQUENCES = 192;

const PART_COUNT_ORIGINS = Object.freeze([
  "automatic",
  "author",
  "research_condition"
]);

const PLAN_ITEM_KINDS = Object.freeze({
  intendedLearningOutcomes: "intended_learning_outcome",
  instructionalAnalysisUnits: "instructional_analysis_unit",
  evidenceRequirements: "evidence_requirement"
});

const PLAN_FIELDS = new Set([
  "id",
  "title",
  "objective",
  "audience",
  "scope",
  "preferredPartCount",
  ...Object.keys(PLAN_ITEM_KINDS),
  "parts"
]);

const ITEM_FIELDS = new Set(["id", "position", "statement", "sourceLinks"]);
const PART_FIELDS = new Set([
  "id",
  "position",
  "title",
  "intent",
  "microsequenceIds"
]);

const COMMAND_TYPES = Object.freeze([
  "update_plan",
  "add_plan_item",
  "update_plan_item",
  "remove_plan_item",
  "reorder_plan_items",
  "add_part",
  "update_part",
  "remove_part",
  "reorder_parts",
  "split_part",
  "join_parts",
  "assign_microsequence",
  "move_microsequence",
  "remove_microsequence"
]);

const ITEM_KIND_COLLECTION = Object.freeze({
  intended_learning_outcome: "intendedLearningOutcomes",
  instructional_analysis_unit: "instructionalAnalysisUnits",
  evidence_requirement: "evidenceRequirements"
});

export class CourseAuthoringPlanError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "CourseAuthoringPlanError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new CourseAuthoringPlanError(code, message, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail("invalid_course_authoring_plan_json", "O plano precisa conter somente dados JSON.");
  }
}

function exactFields(value, allowed, code, label) {
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) fail(code, `${label} contém o campo desconhecido ${unknown}.`, { field: unknown });
}

function hasControlCharacter(value, allowLayoutWhitespace = true) {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    if (point >= 127 && point <= 159) return true;
    if (point >= 32) return false;
    return !allowLayoutWhitespace || ![9, 10, 13].includes(point);
  });
}

function requiredText(value, maximum, code, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maximum || hasControlCharacter(normalized)) {
    fail(code, `${label} é inválido.`);
  }
  return normalized;
}

function optionalText(value, maximum, code, label) {
  if (typeof value !== "string" || value.length > maximum || hasControlCharacter(value)) {
    fail(code, `${label} é inválido.`);
  }
  return value;
}

function uuid(value, code, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail(code, `${label} precisa ser um UUID canônico.`);
  }
  return value;
}

function contiguousPositions(values, code, label) {
  const sorted = values.map(({ position }) => position).sort((left, right) => left - right);
  if (sorted.some((position, index) => position !== index)) {
    fail(code, `${label} precisa usar posições contíguas a partir de zero.`);
  }
}

function normalizeItems(value, collection) {
  if (!Array.isArray(value) || value.length > 256) {
    fail("invalid_course_authoring_plan_items", `${collection} precisa ser uma lista limitada.`);
  }
  const identities = new Set();
  const items = value.map((candidate, index) => {
    if (!isPlainObject(candidate)) {
      fail("invalid_course_authoring_plan_item", `O item ${index} de ${collection} é inválido.`);
    }
    exactFields(candidate, ITEM_FIELDS, "unknown_course_authoring_plan_item_field", "O item de planejamento");
    const id = uuid(candidate.id, "invalid_course_authoring_plan_item_id", "A identidade do item de planejamento");
    const position = Number(candidate.position);
    if (!Number.isSafeInteger(position) || position < 0 || identities.has(id)) {
      fail("invalid_course_authoring_plan_item", `O item ${index} de ${collection} possui identidade ou posição inválida.`);
    }
    identities.add(id);
      return {
        id,
        position,
      statement: requiredText(
        candidate.statement,
        2000,
        "invalid_course_authoring_plan_item_statement",
        "O enunciado do item de planejamento"
        ),
        sourceLinks: normalizeCourseSourceLinks(candidate.sourceLinks)
    };
  });
  contiguousPositions(items, "invalid_course_authoring_plan_item_positions", collection);
  return items.sort((left, right) => left.position - right.position);
}

function microsequenceId(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized !== value || normalized.length > 240 ||
      hasControlCharacter(normalized, false)) {
    fail("invalid_course_authoring_part_microsequence", "A identidade de microssequência é inválida.");
  }
  return normalized;
}

function normalizeParts(value) {
  if (!Array.isArray(value) || value.length > 64) {
    fail("invalid_course_authoring_parts", "As Partes precisam formar uma lista de até 64 itens.");
  }
  const partIds = new Set();
  const assignedMicrosequences = new Set();
  const parts = value.map((candidate, index) => {
    if (!isPlainObject(candidate)) {
      fail("invalid_course_authoring_part", `A Parte ${index} é inválida.`);
    }
    exactFields(candidate, PART_FIELDS, "unknown_course_authoring_part_field", "A Parte");
    const id = uuid(candidate.id, "invalid_course_authoring_part_id", "A identidade da Parte");
    const position = Number(candidate.position);
    if (!Number.isSafeInteger(position) || position < 0 || partIds.has(id)) {
      fail("invalid_course_authoring_part", `A Parte ${index} possui identidade ou posição inválida.`);
    }
    partIds.add(id);
    if (!Array.isArray(candidate.microsequenceIds) || candidate.microsequenceIds.length > 64) {
      fail("invalid_course_authoring_part_microsequences", "Os vínculos da Parte precisam formar uma lista limitada.");
    }
    const microsequenceIds = candidate.microsequenceIds.map(microsequenceId);
    if (new Set(microsequenceIds).size !== microsequenceIds.length) {
      fail("duplicate_course_authoring_part_microsequence", "A Parte repete uma microssequência.");
    }
    for (const identity of microsequenceIds) {
      if (assignedMicrosequences.has(identity)) {
        fail(
          "course_authoring_microsequence_assigned_twice",
          "Uma microssequência pode pertencer a somente uma Parte.",
          { microsequenceId: identity }
        );
      }
      assignedMicrosequences.add(identity);
    }
    return {
      id,
      position,
      title: requiredText(candidate.title, 300, "invalid_course_authoring_part_title", "O título da Parte"),
      intent: optionalText(candidate.intent, 4000, "invalid_course_authoring_part_intent", "A intenção da Parte"),
      microsequenceIds
    };
  });
  if (assignedMicrosequences.size > MAX_LINKED_MICROSEQUENCES) {
    fail(
      "too_many_course_authoring_part_microsequences",
      `O plano excede ${MAX_LINKED_MICROSEQUENCES} vínculos de microssequência.`
    );
  }
  contiguousPositions(parts, "invalid_course_authoring_part_positions", "As Partes");
  return parts.sort((left, right) => left.position - right.position);
}

export function normalizeCourseAuthoringPlan(value) {
  const candidate = cloneJson(value);
  if (!isPlainObject(candidate)) {
    fail("invalid_course_authoring_plan", "O plano de Autoria precisa ser um objeto.");
  }
  exactFields(candidate, PLAN_FIELDS, "unknown_course_authoring_plan_field", "O plano de Autoria");
  const missingField = [...PLAN_FIELDS].find((field) => !Object.hasOwn(candidate, field));
  if (missingField) {
    fail("missing_course_authoring_plan_field", `O plano de Autoria não contém ${missingField}.`, { field: missingField });
  }
  if (!isPlainObject(candidate.preferredPartCount)) {
    fail("invalid_course_authoring_part_count", "A faixa preferencial de Partes é inválida.");
  }
  exactFields(
    candidate.preferredPartCount,
    new Set(["minimum", "maximum", "origin"]),
    "unknown_course_authoring_part_count_field",
    "A faixa preferencial de Partes"
  );
  const minimum = Number(candidate.preferredPartCount.minimum);
  const maximum = Number(candidate.preferredPartCount.maximum);
  const origin = candidate.preferredPartCount.origin;
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) ||
      minimum < 1 || maximum > 64 || minimum > maximum ||
      !PART_COUNT_ORIGINS.includes(origin)) {
    fail("invalid_course_authoring_part_count", "A faixa preferencial de Partes é inválida.");
  }
  const normalized = {
    id: uuid(candidate.id, "invalid_course_authoring_plan_id", "A identidade do plano de Autoria"),
    title: requiredText(candidate.title, 300, "invalid_course_title", "O título do Curso"),
    objective: requiredText(candidate.objective, 2000, "invalid_course_authoring_objective", "O objetivo do Curso"),
    audience: optionalText(candidate.audience, 4000, "invalid_course_authoring_audience", "O público do Curso"),
    scope: optionalText(candidate.scope, 8000, "invalid_course_authoring_scope", "O escopo do Curso"),
    preferredPartCount: { minimum, maximum, origin },
    intendedLearningOutcomes: normalizeItems(
      candidate.intendedLearningOutcomes,
      "Os resultados de aprendizagem pretendidos"
    ),
    instructionalAnalysisUnits: normalizeItems(
      candidate.instructionalAnalysisUnits,
      "As unidades de análise instrucional"
    ),
    evidenceRequirements: normalizeItems(candidate.evidenceRequirements, "Os requisitos de evidência"),
    parts: normalizeParts(candidate.parts)
  };
  const totalItems = normalized.intendedLearningOutcomes.length +
    normalized.instructionalAnalysisUnits.length +
    normalized.evidenceRequirements.length;
  if (totalItems > 512) {
    fail("too_many_course_authoring_plan_items", "O plano excede 512 itens de planejamento.");
  }
  return normalized;
}

function commandObject(value, fields) {
  if (!isPlainObject(value)) {
    fail("invalid_course_authoring_plan_command", "O comando do plano é inválido.");
  }
  exactFields(
    value,
    new Set(["type", ...fields]),
    "unknown_course_authoring_plan_command_field",
    "O comando do plano"
  );
  if (!COMMAND_TYPES.includes(value.type)) {
    fail("invalid_course_authoring_plan_command", "O tipo do comando do plano é inválido.");
  }
  return value;
}

function collectionForKind(plan, kind) {
  const collection = ITEM_KIND_COLLECTION[kind];
  if (!collection) {
    fail("invalid_course_authoring_plan_item_kind", "O tipo do item de planejamento é inválido.");
  }
  return plan[collection];
}

function insertAt(values, value, position) {
  if (!Number.isSafeInteger(position) || position < 0 || position > values.length) {
    fail("invalid_course_authoring_plan_position", "A posição solicitada é inválida.");
  }
  values.splice(position, 0, value);
  values.forEach((item, index) => { item.position = index; });
}

function sameItem(left, right) {
  return left.id === right.id && left.statement === right.statement &&
    JSON.stringify(left.sourceLinks) === JSON.stringify(right.sourceLinks);
}

function samePart(left, right) {
  return left.id === right.id && left.title === right.title && left.intent === right.intent;
}

function reorderByIds(values, orderedIds, label) {
  if (!Array.isArray(orderedIds) || orderedIds.length !== values.length ||
      new Set(orderedIds).size !== orderedIds.length) {
    fail("invalid_course_authoring_plan_reorder", `A reordenação de ${label} é inválida.`);
  }
  const byId = new Map(values.map((value) => [value.id, value]));
  if (orderedIds.some((id) => !byId.has(id))) {
    fail("invalid_course_authoring_plan_reorder", `A reordenação de ${label} é inválida.`);
  }
  return orderedIds.map((id, position) => ({ ...byId.get(id), position }));
}

function removeMicrosequence(plan, identity) {
  for (const part of plan.parts) {
    const index = part.microsequenceIds.indexOf(identity);
    if (index >= 0) {
      part.microsequenceIds.splice(index, 1);
      return { part, index };
    }
  }
  return null;
}

function orderedUuidList(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail("invalid_course_authoring_plan_command", `${label} precisa ser uma lista limitada.`);
  }
  const normalized = value.map((id) => uuid(
    id,
    "invalid_course_authoring_plan_command_id",
    `Cada identidade de ${label}`
  ));
  if (new Set(normalized).size !== normalized.length) {
    fail("invalid_course_authoring_plan_command", `${label} repete uma identidade.`);
  }
  return normalized;
}

export function normalizeCourseAuthoringPlanCommand(commandValue) {
  const command = cloneJson(commandValue);
  if (!isPlainObject(command) || !COMMAND_TYPES.includes(command.type)) {
    fail("invalid_course_authoring_plan_command", "O comando do plano é inválido.");
  }
  const result = { type: command.type };
  if (command.type === "update_plan") {
    commandObject(command, [
      "title", "objective", "audience", "scope", "preferredPartCount"
    ]);
    const fields = ["title", "objective", "audience", "scope", "preferredPartCount"];
    if (!fields.some((field) => Object.hasOwn(command, field))) {
      fail("empty_course_authoring_plan_command", "O comando não contém alteração.");
    }
    if (Object.hasOwn(command, "title")) {
      result.title = requiredText(command.title, 300, "invalid_course_title", "O título do Curso");
    }
    if (Object.hasOwn(command, "objective")) {
      result.objective = requiredText(
        command.objective,
        2000,
        "invalid_course_authoring_objective",
        "O objetivo do Curso"
      );
    }
    for (const [field, maximum, label] of [
      ["audience", 4000, "O público do Curso"],
      ["scope", 8000, "O escopo do Curso"]
    ]) {
      if (Object.hasOwn(command, field)) {
        result[field] = optionalText(command[field], maximum, "invalid_course_authoring_plan_command", label);
      }
    }
    if (Object.hasOwn(command, "preferredPartCount")) {
      const probe = planFixtureForCommandRange(command.preferredPartCount);
      result.preferredPartCount = normalizeCourseAuthoringPlan(probe).preferredPartCount;
    }
    return result;
  }

  if (["add_plan_item", "update_plan_item", "remove_plan_item", "reorder_plan_items"].includes(command.type)) {
    const fields = command.type === "add_plan_item"
      ? ["kind", "id", "position", "statement", "sourceLinks"]
      : command.type === "update_plan_item"
        ? ["kind", "id", "statement", "sourceLinks"]
        : command.type === "remove_plan_item"
          ? ["kind", "id"]
          : ["kind", "orderedIds"];
    commandObject(command, fields);
    if (!Object.hasOwn(ITEM_KIND_COLLECTION, command.kind)) {
      fail("invalid_course_authoring_plan_item_kind", "O tipo do item de planejamento é inválido.");
    }
    result.kind = command.kind;
    if (command.type === "reorder_plan_items") {
      result.orderedIds = orderedUuidList(command.orderedIds, 256, "itens de planejamento");
      return result;
    }
    result.id = uuid(command.id, "invalid_course_authoring_plan_item_id", "A identidade do item de planejamento");
    if (command.type === "add_plan_item") {
      const position = Number(command.position);
      if (!Number.isSafeInteger(position) || position < 0 || position > 255) {
        fail("invalid_course_authoring_plan_position", "A posição solicitada é inválida.");
      }
      result.position = position;
    }
    if (command.type === "add_plan_item" || command.type === "update_plan_item") {
      result.statement = requiredText(
        command.statement,
        2000,
        "invalid_course_authoring_plan_item_statement",
        "O enunciado do item de planejamento"
      );
      result.sourceLinks = normalizeCourseSourceLinks(command.sourceLinks);
    }
    return result;
  }

  if (["add_part", "update_part", "remove_part", "reorder_parts"].includes(command.type)) {
    const fields = command.type === "add_part"
      ? ["id", "position", "title", "intent"]
      : command.type === "update_part"
        ? ["id", "title", "intent"]
        : command.type === "remove_part"
          ? ["id"]
          : ["orderedIds"];
    commandObject(command, fields);
    if (command.type === "reorder_parts") {
      result.orderedIds = orderedUuidList(command.orderedIds, 64, "Partes");
      return result;
    }
    result.id = uuid(command.id, "invalid_course_authoring_part_id", "A identidade da Parte");
    if (command.type === "add_part") {
      const position = Number(command.position);
      if (!Number.isSafeInteger(position) || position < 0 || position > 63) {
        fail("invalid_course_authoring_plan_position", "A posição solicitada é inválida.");
      }
      result.position = position;
    }
    if (command.type === "add_part" || command.type === "update_part") {
      result.title = requiredText(command.title, 300, "invalid_course_authoring_part_title", "O título da Parte");
      result.intent = optionalText(command.intent, 4000, "invalid_course_authoring_part_intent", "A intenção da Parte");
    }
    return result;
  }

  if (command.type === "split_part") {
    commandObject(command, [
      "partId", "newPartId", "newPartPosition", "title", "intent", "microsequenceIds"
    ]);
    result.partId = uuid(command.partId, "invalid_course_authoring_part_id", "A identidade da Parte de origem");
    result.newPartId = uuid(command.newPartId, "invalid_course_authoring_part_id", "A identidade da nova Parte");
    const position = Number(command.newPartPosition);
    if (!Number.isSafeInteger(position) || position < 0 || position > 63 || result.partId === result.newPartId) {
      fail("invalid_course_authoring_part_split", "A divisão da Parte é inválida.");
    }
    result.newPartPosition = position;
    result.title = requiredText(command.title, 300, "invalid_course_authoring_part_title", "O título da Parte");
    result.intent = optionalText(command.intent, 4000, "invalid_course_authoring_part_intent", "A intenção da Parte");
    if (!Array.isArray(command.microsequenceIds) || command.microsequenceIds.length > 64) {
      fail("invalid_course_authoring_part_split", "A divisão da Parte é inválida.");
    }
    result.microsequenceIds = command.microsequenceIds.map(microsequenceId);
    if (new Set(result.microsequenceIds).size !== result.microsequenceIds.length) {
      fail("invalid_course_authoring_part_split", "A divisão da Parte repete uma microssequência.");
    }
    return result;
  }

  if (command.type === "join_parts") {
    commandObject(command, ["sourcePartId", "targetPartId"]);
    result.sourcePartId = uuid(command.sourcePartId, "invalid_course_authoring_part_id", "A identidade da Parte de origem");
    result.targetPartId = uuid(command.targetPartId, "invalid_course_authoring_part_id", "A identidade da Parte de destino");
    if (result.sourcePartId === result.targetPartId) {
      fail("invalid_course_authoring_part_join", "A união exige duas Partes diferentes.");
    }
    return result;
  }

  const fields = command.type === "remove_microsequence"
    ? ["microsequenceId"]
    : ["partId", "microsequenceId", "position"];
  commandObject(command, fields);
  result.microsequenceId = microsequenceId(command.microsequenceId);
  if (command.type !== "remove_microsequence") {
    result.partId = uuid(command.partId, "invalid_course_authoring_part_id", "A identidade da Parte");
    const position = Number(command.position);
    if (!Number.isSafeInteger(position) || position < 0 || position > 63) {
      fail("invalid_course_authoring_microsequence_position", "A posição de produção é inválida.");
    }
    result.position = position;
  }
  return result;
}

function planFixtureForCommandRange(preferredPartCount) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Curso",
    objective: "Objetivo",
    audience: "",
    scope: "",
    preferredPartCount,
    intendedLearningOutcomes: [],
    instructionalAnalysisUnits: [],
    evidenceRequirements: [],
    parts: []
  };
}

export function applyCourseAuthoringPlanCommand(planValue, commandValue) {
  const plan = normalizeCourseAuthoringPlan(planValue);
  const command = normalizeCourseAuthoringPlanCommand(commandValue);

  if (command.type === "update_plan") {
    commandObject(command, [
      "title", "objective", "audience", "scope", "preferredPartCount"
    ]);
    const patchFields = [
      "title", "objective", "audience", "scope", "preferredPartCount"
    ];
    if (!patchFields.some((field) => Object.hasOwn(command, field))) {
      fail("empty_course_authoring_plan_command", "O comando não contém alteração.");
    }
    for (const field of patchFields) {
      if (Object.hasOwn(command, field)) plan[field] = cloneJson(command[field]);
    }
    return normalizeCourseAuthoringPlan(plan);
  }

  if (["add_plan_item", "update_plan_item", "remove_plan_item", "reorder_plan_items"].includes(command.type)) {
    const fields = command.type === "add_plan_item"
      ? ["kind", "id", "position", "statement", "sourceLinks"]
      : command.type === "update_plan_item"
        ? ["kind", "id", "statement", "sourceLinks"]
        : command.type === "remove_plan_item"
          ? ["kind", "id"]
          : ["kind", "orderedIds"];
    commandObject(command, fields);
    const collection = collectionForKind(plan, command.kind);
    if (command.type === "reorder_plan_items") {
      plan[ITEM_KIND_COLLECTION[command.kind]] = reorderByIds(
        collection,
        command.orderedIds,
        "itens de planejamento"
      );
    } else {
      const id = uuid(command.id, "invalid_course_authoring_plan_item_id", "A identidade do item de planejamento");
      const index = collection.findIndex((item) => item.id === id);
      if (command.type === "add_plan_item") {
        const item = normalizeItems([{
          id,
          position: 0,
          statement: command.statement,
          sourceLinks: command.sourceLinks
        }], "O item de planejamento")[0];
        if (index >= 0) {
          if (!sameItem(collection[index], item)) {
            fail("course_authoring_plan_item_conflict", "A identidade do item já possui outro conteúdo.");
          }
        } else insertAt(collection, item, Number(command.position));
      } else if (command.type === "update_plan_item") {
        if (index < 0) fail("course_authoring_plan_item_not_found", "O item de planejamento não existe.");
        collection[index].statement = requiredText(
          command.statement,
          2000,
          "invalid_course_authoring_plan_item_statement",
          "O enunciado do item de planejamento"
        );
        collection[index].sourceLinks = normalizeCourseSourceLinks(command.sourceLinks);
      } else if (index >= 0) {
        collection.splice(index, 1);
        collection.forEach((item, position) => { item.position = position; });
      }
    }
    return normalizeCourseAuthoringPlan(plan);
  }

  if (["add_part", "update_part", "remove_part", "reorder_parts"].includes(command.type)) {
    const fields = command.type === "add_part"
      ? ["id", "position", "title", "intent"]
      : command.type === "update_part"
        ? ["id", "title", "intent"]
        : command.type === "remove_part"
          ? ["id"]
          : ["orderedIds"];
    commandObject(command, fields);
    if (command.type === "reorder_parts") {
      plan.parts = reorderByIds(plan.parts, command.orderedIds, "Partes");
    } else {
      const id = uuid(command.id, "invalid_course_authoring_part_id", "A identidade da Parte");
      const index = plan.parts.findIndex((part) => part.id === id);
      if (command.type === "add_part") {
        const part = normalizeParts([{
          id,
          position: 0,
          title: command.title,
          intent: command.intent,
          microsequenceIds: []
        }])[0];
        if (index >= 0) {
          if (!samePart(plan.parts[index], part)) {
            fail("course_authoring_part_conflict", "A identidade da Parte já possui outro conteúdo.");
          }
        } else insertAt(plan.parts, part, Number(command.position));
      } else if (command.type === "update_part") {
        if (index < 0) fail("course_authoring_part_not_found", "A Parte não existe.");
        plan.parts[index].title = requiredText(
          command.title,
          300,
          "invalid_course_authoring_part_title",
          "O título da Parte"
        );
        plan.parts[index].intent = optionalText(
          command.intent,
          4000,
          "invalid_course_authoring_part_intent",
          "A intenção da Parte"
        );
      } else if (index >= 0) {
        plan.parts.splice(index, 1);
        plan.parts.forEach((part, position) => { part.position = position; });
      }
    }
    return normalizeCourseAuthoringPlan(plan);
  }

  if (command.type === "split_part") {
    commandObject(command, [
      "partId", "newPartId", "newPartPosition", "title", "intent",
      "microsequenceIds"
    ]);
    const sourceId = uuid(command.partId, "invalid_course_authoring_part_id", "A identidade da Parte de origem");
    const newId = uuid(command.newPartId, "invalid_course_authoring_part_id", "A identidade da nova Parte");
    const existingNew = plan.parts.find((part) => part.id === newId);
    if (existingNew) return normalizeCourseAuthoringPlan(plan);
    const source = plan.parts.find((part) => part.id === sourceId);
    if (!source) fail("course_authoring_part_not_found", "A Parte de origem não existe.");
    if (!Array.isArray(command.microsequenceIds) ||
        new Set(command.microsequenceIds).size !== command.microsequenceIds.length ||
        command.microsequenceIds.some((id) => !source.microsequenceIds.includes(id))) {
      fail("invalid_course_authoring_part_split", "A divisão da Parte é inválida.");
    }
    const moved = command.microsequenceIds.map(microsequenceId);
    source.microsequenceIds = source.microsequenceIds.filter((id) => !moved.includes(id));
    insertAt(plan.parts, {
      id: newId,
      position: 0,
      title: requiredText(command.title, 300, "invalid_course_authoring_part_title", "O título da Parte"),
      intent: optionalText(command.intent, 4000, "invalid_course_authoring_part_intent", "A intenção da Parte"),
      microsequenceIds: moved
    }, Number(command.newPartPosition));
    return normalizeCourseAuthoringPlan(plan);
  }

  if (command.type === "join_parts") {
    commandObject(command, ["sourcePartId", "targetPartId"]);
    const sourceId = uuid(command.sourcePartId, "invalid_course_authoring_part_id", "A identidade da Parte de origem");
    const targetId = uuid(command.targetPartId, "invalid_course_authoring_part_id", "A identidade da Parte de destino");
    const target = plan.parts.find((part) => part.id === targetId);
    if (!target) fail("course_authoring_part_not_found", "A Parte de destino não existe.");
    const sourceIndex = plan.parts.findIndex((part) => part.id === sourceId);
    if (sourceIndex < 0) return normalizeCourseAuthoringPlan(plan);
    if (sourceId === targetId) fail("invalid_course_authoring_part_join", "A união exige duas Partes diferentes.");
    target.microsequenceIds.push(...plan.parts[sourceIndex].microsequenceIds);
    plan.parts.splice(sourceIndex, 1);
    plan.parts.forEach((part, position) => { part.position = position; });
    return normalizeCourseAuthoringPlan(plan);
  }

  if (["assign_microsequence", "move_microsequence", "remove_microsequence"].includes(command.type)) {
    const fields = command.type === "remove_microsequence"
      ? ["microsequenceId"]
      : ["partId", "microsequenceId", "position"];
    commandObject(command, fields);
    const identity = microsequenceId(command.microsequenceId);
    if (command.type === "remove_microsequence") {
      removeMicrosequence(plan, identity);
      return normalizeCourseAuthoringPlan(plan);
    }
    const partId = uuid(command.partId, "invalid_course_authoring_part_id", "A identidade da Parte");
    const target = plan.parts.find((part) => part.id === partId);
    if (!target) fail("course_authoring_part_not_found", "A Parte de destino não existe.");
    const position = Number(command.position);
    const currentPart = plan.parts.find((part) => part.microsequenceIds.includes(identity));
    const currentIndex = currentPart?.microsequenceIds.indexOf(identity) ?? -1;
    if (currentPart?.id === partId && currentIndex === position) {
      return normalizeCourseAuthoringPlan(plan);
    }
    if (command.type === "assign_microsequence" && currentPart) {
      fail(
        "course_authoring_microsequence_already_assigned",
        "A microssequência já pertence a uma Parte.",
        { microsequenceId: identity, authoringPartId: currentPart.id }
      );
    }
    if (command.type === "move_microsequence" && !currentPart) {
      fail(
        "course_authoring_microsequence_not_assigned",
        "A microssequência ainda não pertence a uma Parte.",
        { microsequenceId: identity }
      );
    }
    removeMicrosequence(plan, identity);
    if (!Number.isSafeInteger(position) || position < 0 || position > target.microsequenceIds.length) {
      fail("invalid_course_authoring_microsequence_position", "A posição de produção é inválida.");
    }
    target.microsequenceIds.splice(position, 0, identity);
    return normalizeCourseAuthoringPlan(plan);
  }

  fail("invalid_course_authoring_plan_command", "O tipo do comando do plano é inválido.");
}

function timestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function deriveAuthoringPartProgress({
  partId,
  microsequenceIds = [],
  entities = [],
  materializations = [],
  steps = []
}) {
  uuid(partId, "invalid_course_authoring_part_id", "A identidade da Parte");
  const linkedIds = [...new Set(microsequenceIds.map(microsequenceId))];
  const linkedSet = new Set(linkedIds);
  const studyUnitCounts = new Map(linkedIds.map((identity) => [identity, 0]));
  for (const entity of entities) {
    if (entity?.entityType === "card" && linkedSet.has(entity.parentId)) {
      studyUnitCounts.set(entity.parentId, studyUnitCounts.get(entity.parentId) + 1);
    }
  }
  const attempts = materializations
    .filter((attempt) => attempt?.partId === partId)
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")) ||
      String(right.id || "").localeCompare(String(left.id || "")));
  const latest = attempts[0] || null;
  const latestSteps = latest
    ? steps.filter((step) => step?.materializationId === latest.id)
    : [];
  const studyUnitCount = [...studyUnitCounts.values()].reduce((total, count) => total + count, 0);
  let state = "planned";
  if (latest?.status === "running") state = "materializing";
  else if (latest?.status === "failed") state = "attention_required";
  else if (latest?.status === "completed" && linkedIds.length > 0 &&
      [...studyUnitCounts.values()].every((count) => count > 0)) state = "materialized";
  else if (linkedIds.length > 0 || studyUnitCount > 0) state = "partially_materialized";
  const lastMaterialization = latest ? {
    id: uuid(latest.id, "invalid_course_authoring_materialization_id", "A identidade da materialização"),
    status: latest.status,
    version: Number(latest.version),
    completedStepCount: latestSteps.filter(({ status }) => status === "completed").length,
    failedStepCount: latestSteps.filter(({ status }) => status === "failed").length,
    totalStepCount: latestSteps.length,
    startedAt: timestamp(latest.startedAt),
    updatedAt: timestamp(latest.updatedAt),
    completedAt: timestamp(latest.completedAt)
  } : null;
  if (lastMaterialization &&
      (!Number.isSafeInteger(lastMaterialization.version) || lastMaterialization.version < 1 ||
       !["running", "completed", "failed"].includes(lastMaterialization.status))) {
    fail("invalid_course_authoring_materialization", "A materialização da Parte é inválida.");
  }
  return {
    state,
    microsequenceCount: linkedIds.length,
    studyUnitCount,
    lastMaterialization
  };
}

export { COMMAND_TYPES, PART_COUNT_ORIGINS, PLAN_ITEM_KINDS };
