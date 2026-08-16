import { AuthoringApiError } from "./errors.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const ENTITY_TYPES = new Set(["course", "module", "lesson", "microsequence", "card"]);
const MUTATIONS = new Set([
  "create_structure",
  "save_microsequence_cards",
  "update_metadata",
  "save_card",
  "copy_entity",
  "rename_entity",
  "move_entity",
  "delete_entity",
  "merge_microsequences",
  "split_microsequence",
  "promote_module",
  "demote_course"
]);
const STRUCTURE_COMMON_FIELDS = Object.freeze([
  "entityType", "parentPath", "id", "title", "goal", "position"
]);
const STRUCTURE_GUIDE_FIELDS = Object.freeze([
  "include", "exclude", "notation", "avoid"
]);
const STRUCTURE_LESSON_FIELDS = Object.freeze(["topics"]);
const STRUCTURE_MICROSEQUENCE_FIELDS = Object.freeze([
  "role", "branchOf", "dependsOn", "covers", "checks", "errors"
]);
const STRUCTURE_PART_LIMIT = 40;
const PACKAGE_ID_PATTERN = /^aralearn\.(?:resource|response)\.[a-z0-9_]+$/u;
const SEMVER_PATTERN = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const DESIGN_ACTION_OPERATIONS = new Set([
  "read_slice",
  "contracts",
  "save_analysis",
  "set_parameter",
  "remove_parameter",
  "save_resource_set",
  "resolve_effective",
  "save_blueprint",
  "register_manifest",
  "run_audit",
  "record_semantic_audit",
  "register_experiment_variant_evidence",
  "record_experiment_diff_classification"
]);
const DESIGN_SLICE_VIEWS = new Set([
  "overview", "analysis", "parameters", "resource_set", "blueprint", "binding",
  "materialization", "audit", "experiment_context"
]);
const RESOURCE_SET_PAGE_DEFAULT_LIMIT = 50;
const RESOURCE_SET_PAGE_MAX_LIMIT = 100;
const AUDIT_PAGE_DEFAULT_LIMIT = 20;
const AUDIT_PAGE_MAX_LIMIT = 50;
const AUDIT_COMPONENT_PAGE_MAX_LIMIT = 10;
const DESIGN_CONTRACT_NAMES = new Set([
  "instructional_analysis",
  "design_parameter_definition",
  "design_parameter_assignment",
  "effective_design_snapshot",
  "materialization_manifest",
  "resource_set",
  "action_read_slice",
  "action_contracts",
  "action_save_analysis",
  "action_set_parameter",
  "action_remove_parameter",
  "action_save_resource_set",
  "action_resolve_effective",
  "action_save_blueprint",
  "action_register_manifest",
  "action_run_audit",
  "action_record_semantic_audit",
  "action_register_experiment_variant_evidence",
  "action_record_experiment_diff_classification"
]);
const DESIGN_ACTION_PAYLOAD_LIMITS = Object.freeze({
  save_analysis: 256 * 1024,
  set_parameter: 64 * 1024,
  remove_parameter: 64 * 1024,
  save_resource_set: 512 * 1024,
  resolve_effective: 64 * 1024,
  save_blueprint: 768 * 1024,
  register_manifest: 1024 * 1024,
  run_audit: 64 * 1024,
  record_semantic_audit: 512 * 1024,
  register_experiment_variant_evidence: 16 * 1024,
  record_experiment_diff_classification: 64 * 1024
});

const EXPERIMENT_ACTION_OPERATIONS = new Set([
  "list",
  "list_options",
  "read",
  "save_protocol",
  "validate",
  "generate_variants",
  "decide_difference",
  "request_correction",
  "freeze",
  "start_collection",
  "rotate_enrollment_code",
  "transition_collection",
  "assign_participant"
]);
const EXPERIMENT_ACTION_PAYLOAD_LIMITS = Object.freeze({
  save_protocol: 60_000,
  validate: 64 * 1024,
  generate_variants: 64 * 1024,
  decide_difference: 64 * 1024,
  request_correction: 64 * 1024,
  freeze: 64 * 1024,
  start_collection: 64 * 1024,
  rotate_enrollment_code: 64 * 1024,
  transition_collection: 64 * 1024,
  assign_participant: 64 * 1024
});

export const WORKSPACE_DESIGN_ACTION_BODY_LIMIT = 1_100_000;
export const WORKSPACE_EXPERIMENT_ACTION_BODY_LIMIT = 96 * 1024;
export const EXPERIMENT_ENROLLMENT_ACTION_BODY_LIMIT = 64_000;
export const WORKSPACE_ANALYTICS_ACTION_BODY_LIMIT = 96 * 1024;

function fail(code, message, details = undefined) {
  throw new AuthoringApiError(422, code, message, details);
}

function object(value, label = "payload") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_workspace_payload", `${label} deve ser um objeto.`);
  }
  return value;
}

function only(value, fields, label = "payload") {
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) fail("unknown_workspace_field", `${label}.${unknown} não é aceito.`, { field: unknown });
}

function requiredText(value, field, max = 300) {
  const result = typeof value?.[field] === "string" ? value[field].trim() : "";
  if (!result || result.length > max) fail("invalid_workspace_field", `${field} é inválido.`, { field });
  return result;
}

function stableBriefText(value, field = "brief") {
  const result = requiredText(value, field, 16_000);
  if (new TextEncoder().encode(result).byteLength > 16 * 1_024) {
    fail(
      "authoring_brief_too_large",
      `${field} deve ocupar no máximo 16 KiB em UTF-8.`,
      { field }
    );
  }
  return result;
}

function optionalUuid(value, field) {
  if (value?.[field] == null) return null;
  return workspaceUuid(value[field], field);
}

function positiveRevision(value, field = "expectedRevision") {
  const result = value?.[field];
  if (!Number.isInteger(result) || result < 1) {
    fail("invalid_workspace_revision", `${field} deve ser um inteiro positivo.`, { field });
  }
  return result;
}

function workspaceId(value, field = "id", max = 240) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) {
    fail("invalid_workspace_field", `${field} é inválido.`, { field });
  }
  return result;
}

function workspacePosition(value, field = "position") {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    fail("invalid_workspace_position", `${field} deve ser inteiro não negativo.`, { field });
  }
  return value;
}

function workspaceEntityPath(value, field, expectedLength) {
  if (!Array.isArray(value)
      || value.length !== expectedLength) {
    fail(
      "invalid_workspace_entity_path",
      `${field} deve conter ${expectedLength} id(s).`,
      { field, expectedLength }
    );
  }
  return value.map((entry, index) => workspaceId(entry, `${field}[${index}]`));
}

function entityDepth(entityType) {
  return ["course", "module", "lesson", "microsequence", "card"].indexOf(entityType) + 1;
}

function workspaceParentPath(value, field, entityType) {
  const depth = entityDepth(entityType);
  if (depth === 1) {
    if (value != null) {
      fail("invalid_workspace_parent", `${field} deve ser null para cursos.`, { field });
    }
    return null;
  }
  if (value == null) {
    fail("invalid_workspace_parent", `${field} é obrigatório para ${entityType}.`, { field });
  }
  return workspaceEntityPath(value, field, depth - 1);
}

function uniqueTextList(value, field, { maximum = 500 } = {}) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    fail("invalid_workspace_field", `${field} deve conter de 1 a ${maximum} itens.`, { field });
  }
  const result = value.map((entry, index) => workspaceId(entry, `${field}[${index}]`));
  if (new Set(result).size !== result.length) {
    fail("invalid_workspace_field", `${field} não aceita itens repetidos.`, { field });
  }
  return result;
}

function stringList(value, field, { maximum = 500 } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximum) {
    fail("invalid_workspace_field", `${field} deve ser uma lista com até ${maximum} itens.`, {
      field
    });
  }
  const result = value.map((entry, index) => workspaceId(entry, `${field}[${index}]`, 4_000));
  if (new Set(result).size !== result.length) {
    fail("invalid_workspace_field", `${field} não aceita itens repetidos.`, { field });
  }
  return result;
}

function topicList(value, field) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 200) {
    fail(
      "invalid_workspace_field",
      `${field} deve ser uma lista com até 200 tópicos.`,
      { field }
    );
  }
  const topics = value.map((rawTopic, index) => {
    const topicField = `${field}[${index}]`;
    const topic = object(rawTopic, topicField);
    only(topic, ["id", "label", "kind", "checks", "errors"], topicField);
    const kind = requiredText(topic, "kind", 40);
    if (!["concept", "procedure", "representation", "term"].includes(kind)) {
      fail("invalid_workspace_field", `${topicField}.kind é inválido.`, {
        field: `${topicField}.kind`
      });
    }
    return {
      id: requiredText(topic, "id", 240),
      label: requiredText(topic, "label", 300),
      kind,
      checks: stringList(topic.checks, `${topicField}.checks`, { maximum: 200 }),
      errors: stringList(topic.errors, `${topicField}.errors`, { maximum: 200 })
    };
  });
  const ids = topics.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    fail("invalid_workspace_field", `${field} não aceita ids repetidos.`, { field });
  }
  return topics;
}

function uniqueMicrosequencePaths(value, field) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    fail("invalid_workspace_field", `${field} deve conter de 1 a 100 caminhos.`, { field });
  }
  const result = value.map(
    (entry, index) => workspaceEntityPath(entry, `${field}[${index}]`, 4)
  );
  const keys = result.map((entry) => JSON.stringify(entry));
  if (new Set(keys).size !== keys.length) {
    fail("invalid_workspace_field", `${field} não aceita caminhos repetidos.`, { field });
  }
  return result;
}

function optionalText(value, field, max) {
  if (value?.[field] == null) return null;
  return requiredText(value, field, max);
}

function workspaceMode(value) {
  const result = value == null ? "move" : String(value);
  if (!["move", "copy"].includes(result)) {
    fail("invalid_workspace_mode", "mode deve ser move ou copy.", { field: "mode" });
  }
  return result;
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function validateMutationArguments(operation, rawArguments) {
  const argumentsValue = object(rawArguments, "arguments");
  if (operation === "create_structure") {
    only(argumentsValue, ["parts"], "arguments");
    if (!Array.isArray(argumentsValue.parts)
        || argumentsValue.parts.length < 1
        || argumentsValue.parts.length > STRUCTURE_PART_LIMIT) {
      fail(
        "invalid_workspace_structure",
        `parts deve conter de 1 a ${STRUCTURE_PART_LIMIT} partes estruturais.`
      );
    }
    const parts = argumentsValue.parts.map((rawPart, index) => {
      const part = object(rawPart, `arguments.parts[${index}]`);
      const entityType = workspaceEntityType(part.entityType);
      if (entityType === "card") {
        fail(
          "invalid_workspace_structure",
          "Cards são salvos por save_microsequence_cards.",
          { index }
        );
      }
      const allowedFields = entityType === "microsequence"
        ? [...STRUCTURE_COMMON_FIELDS, ...STRUCTURE_MICROSEQUENCE_FIELDS]
        : new Set(["module", "lesson"]).has(entityType)
          ? [
              ...STRUCTURE_COMMON_FIELDS,
              ...STRUCTURE_GUIDE_FIELDS,
              ...(entityType === "lesson" ? STRUCTURE_LESSON_FIELDS : [])
            ]
          : STRUCTURE_COMMON_FIELDS;
      only(part, allowedFields, `arguments.parts[${index}]`);
      const normalized = {
        entityType,
        parentPath: workspaceParentPath(
          part.parentPath,
          `parts[${index}].parentPath`,
          entityType
        ),
        id: requiredText(part, "id", 240),
        title: requiredText(part, "title", 300),
        goal: requiredText(part, "goal", 2_000),
        position: workspacePosition(part.position)
      };
      if (new Set(["module", "lesson"]).has(entityType)) {
        Object.assign(normalized, {
          include: stringList(part.include, `parts[${index}].include`),
          exclude: stringList(part.exclude, `parts[${index}].exclude`),
          notation: stringList(part.notation, `parts[${index}].notation`),
          avoid: stringList(part.avoid, `parts[${index}].avoid`),
          ...(entityType === "lesson"
            ? { topics: topicList(part.topics, `parts[${index}].topics`) }
            : {})
        });
      }
      if (entityType === "microsequence") {
        const role = part.role == null ? null : String(part.role);
        if (role != null && !["explain", "practice", "review", "support"].includes(role)) {
          fail("invalid_workspace_structure", "role de microssequência é inválido.", {
            index
          });
        }
        Object.assign(normalized, {
          ...(role == null ? {} : { role }),
          ...(part.branchOf == null ? {} : {
            branchOf: workspaceId(part.branchOf, `parts[${index}].branchOf`)
          }),
          dependsOn: stringList(part.dependsOn, `parts[${index}].dependsOn`),
          covers: stringList(part.covers, `parts[${index}].covers`),
          checks: stringList(part.checks, `parts[${index}].checks`),
          errors: stringList(part.errors, `parts[${index}].errors`)
        });
      }
      return normalized;
    });
    return { parts };
  }
  if (operation === "save_microsequence_cards") {
    only(
      argumentsValue,
      ["microsequencePath", "mode", "cards"],
      "arguments"
    );
    const mode = String(argumentsValue.mode || "");
    if (!["append", "replace"].includes(mode)) {
      fail("invalid_workspace_mode", "mode deve ser append ou replace.");
    }
    if (!Array.isArray(argumentsValue.cards)
        || argumentsValue.cards.length > 500
        || (mode === "append" && argumentsValue.cards.length < 1)
        || argumentsValue.cards.some(
          (card) => !card || typeof card !== "object" || Array.isArray(card)
        )) {
      fail(
        "invalid_workspace_cards",
        mode === "append"
          ? "append exige de 1 a 500 cards."
          : "replace aceita de 0 a 500 cards."
      );
    }
    return {
      microsequencePath: workspaceEntityPath(
        argumentsValue.microsequencePath,
        "microsequencePath",
        4
      ),
      mode,
      cards: structuredClone(argumentsValue.cards)
    };
  }
  if (operation === "update_metadata") {
    only(argumentsValue, [
      "entityType", "entityPath", "title", "goal", "include", "exclude",
      "notation", "avoid", "role", "branchOf",
      "dependsOn", "covers", "checks", "errors", "topics"
    ], "arguments");
    const entityType = workspaceEntityType(argumentsValue.entityType);
    if (entityType === "card") {
      fail(
        "invalid_workspace_metadata_type",
        "Use save_card para corrigir o conteúdo de um card."
      );
    }
    const fieldNames = Object.keys(argumentsValue)
      .filter((field) => !["entityType", "entityPath"].includes(field));
    if (fieldNames.length === 0) {
      fail("workspace_change_empty", "Informe ao menos um metadado para atualizar.");
    }
    const allowed = entityType === "course"
      ? new Set(["title", "goal"])
      : entityType === "module"
        ? new Set(["title", "goal", "include", "exclude", "notation", "avoid"])
        : entityType === "lesson"
          ? new Set([
            "title", "goal", "include", "exclude", "notation", "avoid", "topics"
          ])
        : new Set([
          "title", "goal", "role", "branchOf",
          "dependsOn", "covers", "checks", "errors"
        ]);
    const invalidField = fieldNames.find((field) => !allowed.has(field));
    if (invalidField) {
      fail(
        "invalid_workspace_metadata_field",
        `${invalidField} não pertence a ${entityType}.`,
        { entityType, field: invalidField }
      );
    }
    const normalized = {
      entityType,
      entityPath: workspaceEntityPath(
        argumentsValue.entityPath,
        "entityPath",
        entityDepth(entityType)
      )
    };
    for (const field of fieldNames) {
      if (["title", "goal"].includes(field)) {
        normalized[field] = requiredText(
          argumentsValue,
          field,
          field === "goal" ? 2_000 : 300
        );
      } else if (field === "role") {
        const role = String(argumentsValue.role || "");
        if (!["explain", "practice", "review", "support"].includes(role)) {
          fail("invalid_workspace_metadata_field", "role é inválido.");
        }
        normalized.role = role;
      } else if (field === "branchOf") {
        normalized.branchOf = argumentsValue.branchOf == null
          ? null
          : workspaceId(argumentsValue.branchOf, "branchOf");
      } else if (field === "topics") {
        normalized.topics = topicList(argumentsValue.topics, "topics");
      } else {
        normalized[field] = stringList(argumentsValue[field], field);
      }
    }
    return normalized;
  }
  if (operation === "save_card") {
    only(argumentsValue, ["cardPath", "card"], "arguments");
    const card = object(argumentsValue.card, "arguments.card");
    const cardPath = workspaceEntityPath(argumentsValue.cardPath, "cardPath", 5);
    if (!hasOwn(card, "id") || workspaceId(card.id, "card.id") !== cardPath[4]) {
      fail(
        "workspace_identity_change_forbidden",
        "O card completo deve preservar o id indicado em cardPath."
      );
    }
    return { cardPath, card: structuredClone(card) };
  }
  if (operation === "copy_entity") {
    only(argumentsValue, [
      "entityType", "entityPath", "targetParentPath", "newRootId", "position"
    ], "arguments");
    const entityType = workspaceEntityType(argumentsValue.entityType);
    return {
      entityType,
      entityPath: workspaceEntityPath(
        argumentsValue.entityPath,
        "entityPath",
        entityDepth(entityType)
      ),
      targetParentPath: workspaceParentPath(
        argumentsValue.targetParentPath,
        "targetParentPath",
        entityType
      ),
      newRootId: requiredText(argumentsValue, "newRootId", 240),
      position: workspacePosition(argumentsValue.position)
    };
  }
  if (operation === "rename_entity") {
    only(argumentsValue, ["entityType", "entityPath", "title"], "arguments");
    const entityType = workspaceEntityType(argumentsValue.entityType);
    return {
      entityType,
      entityPath: workspaceEntityPath(
        argumentsValue.entityPath,
        "entityPath",
        entityDepth(entityType)
      ),
      title: requiredText(argumentsValue, "title")
    };
  }
  if (operation === "move_entity") {
    only(
      argumentsValue,
      ["entityType", "entityPath", "targetParentPath", "position"],
      "arguments"
    );
    const entityType = workspaceEntityType(argumentsValue.entityType);
    return {
      entityType,
      entityPath: workspaceEntityPath(
        argumentsValue.entityPath,
        "entityPath",
        entityDepth(entityType)
      ),
      targetParentPath: workspaceParentPath(
        argumentsValue.targetParentPath,
        "targetParentPath",
        entityType
      ),
      position: workspacePosition(argumentsValue.position)
    };
  }
  if (operation === "delete_entity") {
    only(argumentsValue, ["entityType", "entityPath"], "arguments");
    const entityType = workspaceEntityType(argumentsValue.entityType);
    return {
      entityType,
      entityPath: workspaceEntityPath(
        argumentsValue.entityPath,
        "entityPath",
        entityDepth(entityType)
      )
    };
  }
  if (operation === "merge_microsequences") {
    only(argumentsValue, ["targetPath", "sourcePaths", "title", "goal"], "arguments");
    return {
      targetPath: workspaceEntityPath(argumentsValue.targetPath, "targetPath", 4),
      sourcePaths: uniqueMicrosequencePaths(argumentsValue.sourcePaths, "sourcePaths"),
      title: optionalText(argumentsValue, "title", 300),
      goal: optionalText(argumentsValue, "goal", 2_000)
    };
  }
  if (operation === "split_microsequence") {
    only(
      argumentsValue,
      ["sourcePath", "newMicrosequence", "cardIds", "position"],
      "arguments"
    );
    const newMicrosequence = object(
      argumentsValue.newMicrosequence,
      "arguments.newMicrosequence"
    );
    only(newMicrosequence, [
      "id", "title", "goal", "role", "branchOf",
      "dependsOn", "covers", "checks", "errors", "cards"
    ], "arguments.newMicrosequence");
    if (Array.isArray(newMicrosequence.cards) && newMicrosequence.cards.length > 0) {
      fail(
        "invalid_workspace_split",
        "newMicrosequence.cards deve ficar vazio; cardIds define os cards movidos.",
        { field: "newMicrosequence.cards" }
      );
    }
    const splitRole = String(newMicrosequence.role || "");
    if (!["explain", "practice", "review", "support"].includes(splitRole)
        || !Array.isArray(newMicrosequence.cards)) {
      fail(
        "invalid_workspace_split",
        "newMicrosequence deve declarar role e cards vazios válidos."
      );
    }
    return {
      sourcePath: workspaceEntityPath(argumentsValue.sourcePath, "sourcePath", 4),
      newMicrosequence: {
        id: requiredText(newMicrosequence, "id", 240),
        title: requiredText(newMicrosequence, "title", 300),
        goal: requiredText(newMicrosequence, "goal", 2_000),
        role: splitRole,
        branchOf: newMicrosequence.branchOf == null
          ? null
          : workspaceId(newMicrosequence.branchOf, "newMicrosequence.branchOf"),
        dependsOn: stringList(
          newMicrosequence.dependsOn,
          "newMicrosequence.dependsOn"
        ),
        covers: stringList(newMicrosequence.covers, "newMicrosequence.covers"),
        checks: stringList(newMicrosequence.checks, "newMicrosequence.checks"),
        errors: stringList(newMicrosequence.errors, "newMicrosequence.errors"),
        cards: []
      },
      cardIds: uniqueTextList(argumentsValue.cardIds, "cardIds"),
      position: workspacePosition(argumentsValue.position)
    };
  }
  if (operation === "promote_module") {
    only(
      argumentsValue,
      ["modulePath", "courseId", "title", "goal", "mode"],
      "arguments"
    );
    return {
      modulePath: workspaceEntityPath(argumentsValue.modulePath, "modulePath", 2),
      courseId: workspaceId(argumentsValue.courseId, "courseId"),
      title: optionalText(argumentsValue, "title", 300),
      goal: requiredText(argumentsValue, "goal", 2_000),
      mode: workspaceMode(argumentsValue.mode)
    };
  }
  if (operation === "demote_course") {
    only(
      argumentsValue,
      ["coursePath", "targetCoursePath", "moduleId", "title", "mode"],
      "arguments"
    );
    return {
      coursePath: workspaceEntityPath(argumentsValue.coursePath, "coursePath", 1),
      targetCoursePath: workspaceEntityPath(
        argumentsValue.targetCoursePath,
        "targetCoursePath",
        1
      ),
      moduleId: workspaceId(argumentsValue.moduleId, "moduleId"),
      title: optionalText(argumentsValue, "title", 300),
      mode: workspaceMode(argumentsValue.mode)
    };
  }
  fail("invalid_workspace_operation", "operation é inválida.");
}

export function workspaceUuid(value, field = "id") {
  const result = String(value || "").trim();
  if (!UUID_PATTERN.test(result)) fail("invalid_workspace_id", `${field} deve ser UUID.`, { field });
  return result;
}

export function workspaceRequestId(value) {
  const result = String(value || "").trim();
  if (!REQUEST_ID_PATTERN.test(result)) {
    fail("invalid_request_id", "requestId deve ter de 8 a 128 caracteres seguros.");
  }
  return result;
}

export function workspaceEntityType(value) {
  const result = String(value || "").trim();
  if (!ENTITY_TYPES.has(result)) fail("invalid_entity_type", "entityType é inválido.");
  return result;
}

export function validateCreateWorkspacePayload(payload) {
  object(payload);
  only(payload, [
    "requestId", "title", "brief", "sourceCourseId", "sourceSubmissionId"
  ]);
  const sourceCourseId = optionalUuid(payload, "sourceCourseId");
  const sourceSubmissionId = optionalUuid(payload, "sourceSubmissionId");
  if (sourceCourseId && sourceSubmissionId) {
    fail("ambiguous_workspace_source", "Escolha somente uma origem para o workspace.");
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    title: requiredText(payload, "title"),
    brief: payload.brief == null ? "" : stableBriefText(payload),
    sourceCourseId,
    sourceSubmissionId
  };
}

export function validateUpdateWorkspaceBriefPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "brief"]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    brief: stableBriefText(payload)
  };
}

export function validateWorkspaceMutationPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "operation", "arguments"]);
  const operation = String(payload.operation || "").trim();
  if (!MUTATIONS.has(operation)) fail("invalid_workspace_operation", "operation é inválida.");
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    operation,
    arguments: validateMutationArguments(operation, payload.arguments)
  };
}

export function validateWorkspaceImportPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "courseId", "workspaceCourseId", "position"]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    courseId: workspaceUuid(payload.courseId, "courseId"),
    workspaceCourseId: requiredText(payload, "workspaceCourseId", 240),
    position: workspacePosition(payload.position)
  };
}

export function validateWorkspacePublishPayload(payload) {
  object(payload);
  only(payload, [
    "requestId", "expectedRevision", "courseId", "target",
    "existingCourseId", "expectedContentHash", "collectionId", "submissionId"
  ]);
  const target = String(payload.target || "private");
  if (!["private", "catalog"].includes(target)) fail("invalid_publication_target", "target é inválido.");
  const existingCourseId = optionalUuid(payload, "existingCourseId");
  const expectedContentHash = payload.expectedContentHash == null
    ? null
    : String(payload.expectedContentHash);
  if ((existingCourseId === null) !== (expectedContentHash === null)) {
    fail(
      "invalid_publication_base",
      "existingCourseId e expectedContentHash devem ser informados juntos."
    );
  }
  if (expectedContentHash !== null
      && !/^[a-f0-9]{64}$/u.test(expectedContentHash)) {
    fail(
      "invalid_publication_base",
      "expectedContentHash deve identificar a publicação existente."
    );
  }
  const collectionId = optionalUuid(payload, "collectionId");
  const submissionId = optionalUuid(payload, "submissionId");
  if (target === "catalog" && !collectionId) {
    fail("catalog_collection_required", "A publicação oficial exige collectionId.");
  }
  if (target === "private" && collectionId) {
    fail("private_collection_forbidden", "A publicação privada não recebe collectionId.");
  }
  if (target === "private" && submissionId) {
    fail("private_submission_forbidden", "A publicação privada não recebe submissionId.");
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    courseId: requiredText(payload, "courseId", 240),
    target,
    existingCourseId,
    expectedContentHash,
    collectionId,
    submissionId
  };
}

export function validateDeleteWorkspacePayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision"]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload)
  };
}

export function validateRemovePersonalLibraryCoursePayload(payload) {
  object(payload);
  only(payload, ["requestId", "selectionId", "expectedContentHash"]);
  const expectedContentHash = String(payload.expectedContentHash || "");
  if (!/^[a-f0-9]{64}$/u.test(expectedContentHash)) {
    fail(
      "invalid_personal_library_revision",
      "expectedContentHash deve identificar o conteúdo selecionado atual."
    );
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    selectionId: workspaceUuid(payload.selectionId, "selectionId"),
    expectedContentHash
  };
}

export function validateSubmitCatalogReviewPayload(payload) {
  object(payload);
  only(payload, ["requestId", "courseId", "expectedContentHash", "note"]);
  const expectedContentHash = String(payload.expectedContentHash || "");
  if (!/^[a-f0-9]{64}$/u.test(expectedContentHash)) {
    fail(
      "invalid_review_revision",
      "expectedContentHash deve identificar a revisão privada escolhida."
    );
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    courseId: workspaceUuid(payload.courseId, "courseId"),
    expectedContentHash,
    note: optionalText(payload, "note", 4_000)
  };
}

export function validateCreateReviewWorkspacePayload(payload) {
  object(payload);
  only(payload, ["requestId", "title"]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    title: requiredText(payload, "title", 300)
  };
}

export function validateCatalogReviewDecisionPayload(payload) {
  object(payload);
  only(payload, ["requestId", "decision", "note"]);
  const decision = String(payload.decision || "");
  if (!["request_changes", "reject"].includes(decision)) {
    fail("invalid_review_decision", "decision deve ser request_changes ou reject.");
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    decision,
    note: requiredText(payload, "note", 4_000)
  };
}

export function validateCatalogReviewCommandPayload(payload) {
  object(payload);
  only(payload, ["requestId"]);
  return { requestId: workspaceRequestId(payload.requestId) };
}

function catalogDescription(payload, { optional = false } = {}) {
  if (payload.description == null) return optional ? null : "";
  if (typeof payload.description !== "string" || payload.description.length > 1_000) {
    fail("invalid_catalog_description", "description deve ter até 1000 caracteres.");
  }
  return payload.description;
}

export function validateCreateCatalogCollectionPayload(payload) {
  object(payload);
  only(payload, ["requestId", "contractKey", "title", "description"]);
  const contractKey = String(payload.contractKey || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/u.test(contractKey)) {
    fail(
      "invalid_catalog_contract_key",
      "contractKey deve usar letras minúsculas, números e hífens."
    );
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    contractKey,
    title: requiredText(payload, "title", 160),
    description: catalogDescription(payload)
  };
}

export function validateUpdateCatalogCollectionPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "title", "description"]);
  const title = optionalText(payload, "title", 160);
  const description = catalogDescription(payload, { optional: true });
  if (title == null && description == null) {
    fail(
      "catalog_change_empty",
      "Informe title ou description para atualizar a coleção."
    );
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    title,
    description
  };
}

export function validateRetireCatalogCollectionPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "replacementCollectionId"]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    replacementCollectionId: optionalUuid(payload, "replacementCollectionId")
  };
}

export function validateMoveCatalogCoursePayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedPlacementRevision", "targetCollectionId"]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedPlacementRevision: positiveRevision(
      payload,
      "expectedPlacementRevision"
    ),
    targetCollectionId: workspaceUuid(
      payload.targetCollectionId,
      "targetCollectionId"
    )
  };
}

const CONTINUITY_OPERATIONS = new Set([
  "replace_stable_brief",
  "record_approved_plan",
  "define_part",
  "remove_part",
  "record_decision",
  "remove_decision",
  "set_mandate",
  "clear_mandate",
  "record_finding",
  "decide_finding",
  "link_finding_correction",
  "verify_finding",
  "delete_finding"
]);

function continuityEntityTarget(value, label, { resource = false } = {}) {
  const entityType = requiredText(value, "entityType", 30);
  const depths = {
    workspace: 0,
    course: 1,
    module: 2,
    lesson: 3,
    microsequence: 4,
    card: 5,
    ...(resource ? { resource: 5 } : {})
  };
  if (!Object.hasOwn(depths, entityType)) {
    fail("invalid_authoring_continuity", `${label}.entityType é inválido.`);
  }
  return {
    entityType,
    entityPath: workspaceEntityPath(
      value.entityPath,
      `${label}.entityPath`,
      depths[entityType]
    )
  };
}

function continuityPartArgument(rawValue, label) {
  const value = object(rawValue, label);
  only(value, ["id", "title", "microsequenceIds"], label);
  return {
    id: requiredText(value, "id", 240),
    title: requiredText(value, "title", 300),
    microsequenceIds: uniqueTextList(
      value.microsequenceIds,
      `${label}.microsequenceIds`,
      { maximum: 500 }
    )
  };
}

function pedagogicalDiagnosisArgument(rawValue, label) {
  const value = object(rawValue, label);
  only(value, ["difficultyResponses"], label);
  if (!Array.isArray(value.difficultyResponses)
      || value.difficultyResponses.length < 1
      || value.difficultyResponses.length > 4) {
    fail(
      "invalid_authoring_decision",
      `${label}.difficultyResponses deve ter de 1 a 4 vínculos compactos.`
    );
  }
  const difficultyResponses = value.difficultyResponses.map((rawEntry, index) => {
    const field = `${label}.difficultyResponses[${index}]`;
    const entry = object(rawEntry, field);
    only(entry, ["difficulty", "response"], field);
    return {
      difficulty: requiredText(entry, "difficulty", 240),
      response: requiredText(entry, "response", 400)
    };
  });
  if (new Set(difficultyResponses.map(({ difficulty }) => difficulty)).size
      !== difficultyResponses.length) {
    fail(
      "invalid_authoring_decision",
      `${label}.difficultyResponses não aceita dificuldade repetida.`
    );
  }
  return { difficultyResponses };
}
function continuityDecisionArgument(rawValue, label) {
  const value = object(rawValue, label);
  only(value, [
    "id", "summary", "entityType", "entityId", "representationSelection",
    "pedagogicalDiagnosis"
  ], label);
  const entityType = optionalText(value, "entityType", 30);
  const entityId = optionalText(value, "entityId", 240);
  if ((entityType == null) !== (entityId == null)
      || (entityType && !ENTITY_TYPES.has(entityType))) {
    fail(
      "invalid_authoring_decision_target",
      `${label}.entityType e ${label}.entityId devem identificar juntos uma entidade.`
    );
  }
  let representationSelection;
  if (value.representationSelection != null) {
    const selection = object(
      value.representationSelection,
      `${label}.representationSelection`
    );
    only(selection, [
      "intent", "chosen", "fit", "desiredResource", "catalogVersion",
      "limitations", "chatDisclosure"
    ], `${label}.representationSelection`);
    const chosen = object(selection.chosen, `${label}.representationSelection.chosen`);
    only(chosen, ["packageId", "version"], `${label}.representationSelection.chosen`);
    const fit = requiredText(selection, "fit", 20);
    if (!new Set(["canonical", "versatile", "substitute"]).has(fit)) {
      fail("invalid_authoring_decision", `${label}.representationSelection.fit é inválido.`);
    }
    const desiredResource = optionalText(selection, "desiredResource", 1_000);
    const chatDisclosure = optionalText(selection, "chatDisclosure", 1_000);
    if (fit === "substitute" && (!desiredResource || !chatDisclosure)) {
      fail(
        "invalid_authoring_decision",
        `${label}.representationSelection substituto exige desiredResource e chatDisclosure.`
      );
    }
    if (fit !== "substitute" && chatDisclosure) {
      fail(
        "invalid_authoring_decision",
        `${label}.representationSelection.chatDisclosure pertence somente a substitute.`
      );
    }
    if (!new Set(["microsequence", "card"]).has(entityType)) {
      fail(
        "invalid_authoring_decision_target",
        `${label}.representationSelection deve estar ligada a card ou microssequência.`
      );
    }
    const packageId = requiredText(chosen, "packageId", 160);
    const version = requiredText(chosen, "version", 40);
    if (!PACKAGE_ID_PATTERN.test(packageId) || !SEMVER_PATTERN.test(version)) {
      fail(
        "invalid_authoring_decision",
        `${label}.representationSelection.chosen deve identificar uma versão exata de package.`
      );
    }
    representationSelection = {
      intent: requiredText(selection, "intent", 1_000),
      chosen: { packageId, version },
      fit,
      desiredResource,
      catalogVersion: requiredText(selection, "catalogVersion", 80),
      limitations: stringList(
        selection.limitations,
        `${label}.representationSelection.limitations`,
        { maximum: 12 }
      ),
      chatDisclosure
    };
  }
  const pedagogicalDiagnosis = value.pedagogicalDiagnosis == null
    ? null
    : pedagogicalDiagnosisArgument(
      value.pedagogicalDiagnosis,
      `${label}.pedagogicalDiagnosis`
    );
  if (pedagogicalDiagnosis && entityType !== "microsequence") {
    fail(
      "invalid_authoring_decision_target",
      `${label}.pedagogicalDiagnosis deve estar ligado a uma microssequência.`
    );
  }
  return {
    id: requiredText(value, "id", 240),
    summary: requiredText(value, "summary", 1_000),
    ...(entityType ? { entityType, entityId } : {}),
    ...(representationSelection ? { representationSelection } : {}),
    ...(pedagogicalDiagnosis ? { pedagogicalDiagnosis } : {})
  };
}

function continuityMandateArgument(rawValue, label) {
  const value = object(rawValue, label);
  only(value, ["id", "kind", "targetPartId", "findingIds", "note"], label);
  const kind = requiredText(value, "kind", 80);
  if (!new Set(["build_part", "repair_findings", "audit", "restructure"]).has(kind)) {
    fail("invalid_authoring_mandate", `${label}.kind é inválido.`);
  }
  const targetPartId = optionalText(value, "targetPartId", 240);
  const findingIds = value.findingIds == null
    ? []
    : uniqueTextList(value.findingIds, `${label}.findingIds`, { maximum: 50 })
      .map((findingId, index) =>
        workspaceUuid(findingId, `${label}.findingIds[${index}]`));
  const note = optionalText(value, "note", 2_000);
  if (kind === "build_part" && !targetPartId) {
    fail("invalid_authoring_mandate", `${label}.targetPartId é obrigatório.`);
  }
  if (kind === "repair_findings" && findingIds.length === 0) {
    fail("invalid_authoring_mandate", `${label}.findingIds é obrigatório.`);
  }
  if (kind !== "repair_findings" && findingIds.length > 0) {
    fail("invalid_authoring_mandate", `${label}.findingIds é incompatível.`);
  }
  if (kind === "repair_findings" && targetPartId) {
    fail("invalid_authoring_mandate", `${label}.targetPartId é incompatível.`);
  }
  return {
    id: requiredText(value, "id", 240),
    kind,
    ...(targetPartId ? { targetPartId } : {}),
    ...(findingIds.length ? { findingIds } : {}),
    ...(note ? { note } : {})
  };
}

export function validateWorkspaceContinuityActionPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "operation", "arguments"]);
  const operation = requiredText(payload, "operation", 40);
  if (!CONTINUITY_OPERATIONS.has(operation)) {
    fail("invalid_authoring_continuity_operation", "operation é inválida.");
  }
  const value = object(payload.arguments, "arguments");
  let argumentsValue;
  if (operation === "replace_stable_brief") {
    only(value, ["brief"], "arguments");
    argumentsValue = { brief: stableBriefText(value) };
  } else if (operation === "record_approved_plan") {
    only(value, ["parts", "decisions", "mandate"], "arguments");
    if (!Array.isArray(value.parts)
        || value.parts.length < 1
        || value.parts.length > 64) {
      fail("invalid_authoring_plan", "arguments.parts deve conter de 1 a 64 Partes.");
    }
    if (!Array.isArray(value.decisions)
        || value.decisions.length < 1
        || value.decisions.length > 128) {
      fail(
        "invalid_authoring_plan",
        "arguments.decisions deve conter de 1 a 128 decisões."
      );
    }
    argumentsValue = {
      parts: value.parts.map((part, index) =>
        continuityPartArgument(part, `arguments.parts[${index}]`)),
      decisions: value.decisions.map((decision, index) =>
        continuityDecisionArgument(decision, `arguments.decisions[${index}]`)),
      mandate: value.mandate == null
        ? null
        : continuityMandateArgument(value.mandate, "arguments.mandate")
    };
  } else if (operation === "define_part") {
    only(value, ["id", "title", "microsequenceIds"], "arguments");
    argumentsValue = {
      id: requiredText(value, "id", 240),
      title: requiredText(value, "title", 300),
      microsequenceIds: uniqueTextList(value.microsequenceIds, "microsequenceIds", {
        maximum: 500
      })
    };
  } else if (operation === "remove_part") {
    only(value, ["partId"], "arguments");
    argumentsValue = { partId: requiredText(value, "partId", 240) };
  } else if (operation === "record_decision") {
    argumentsValue = continuityDecisionArgument(value, "arguments");
  } else if (operation === "remove_decision") {
    only(value, ["decisionId"], "arguments");
    argumentsValue = { decisionId: requiredText(value, "decisionId", 240) };
  } else if (operation === "set_mandate") {
    argumentsValue = continuityMandateArgument(value, "arguments");
  } else if (operation === "clear_mandate") {
    only(value, [], "arguments");
    argumentsValue = {};
  } else if (operation === "record_finding") {
    only(value, [
      "entityType", "entityPath", "resourceTargetId", "category", "severity",
      "summary", "proposedRepair"
    ], "arguments");
    const target = continuityEntityTarget(value, "arguments", { resource: true });
    const severity = requiredText(value, "severity", 20);
    if (!new Set(["low", "medium", "high", "critical"]).has(severity)) {
      fail("invalid_authoring_finding", "severity é inválido.");
    }
    const resourceTargetId = optionalText(value, "resourceTargetId", 240);
    if ((target.entityType === "resource") !== (resourceTargetId != null)) {
      fail("invalid_authoring_finding", "resourceTargetId é inválido.");
    }
    argumentsValue = {
      ...target,
      ...(resourceTargetId ? { resourceTargetId } : {}),
      category: requiredText(value, "category", 64),
      severity,
      summary: requiredText(value, "summary", 1_000),
      proposedRepair: requiredText(value, "proposedRepair", 1_000)
    };
  } else if (operation === "decide_finding") {
    only(value, ["observationId", "decision"], "arguments");
    const decision = requiredText(value, "decision", 20);
    if (!new Set(["approved", "rejected"]).has(decision)) {
      fail("invalid_authoring_finding_decision", "decision é inválido.");
    }
    argumentsValue = {
      observationId: workspaceUuid(value.observationId, "observationId"),
      decision
    };
  } else if (operation === "link_finding_correction") {
    only(value, ["observationId", "correctionRequestId"], "arguments");
    argumentsValue = {
      observationId: workspaceUuid(value.observationId, "observationId"),
      correctionRequestId: workspaceRequestId(value.correctionRequestId)
    };
  } else if (operation === "verify_finding") {
    only(value, ["observationId", "outcome", "note"], "arguments");
    const outcome = requiredText(value, "outcome", 20);
    if (!new Set(["resolved", "still_open"]).has(outcome)) {
      fail("invalid_authoring_finding_verification", "outcome é inválido.");
    }
    const note = requiredText(value, "note", 1_000);
    argumentsValue = {
      observationId: workspaceUuid(value.observationId, "observationId"),
      outcome,
      note
    };
  } else {
    only(value, ["observationId"], "arguments");
    argumentsValue = {
      observationId: workspaceUuid(value.observationId, "observationId")
    };
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    operation,
    arguments: argumentsValue
  };
}

export function validateRemoveCatalogCoursePayload(payload) {
  object(payload);
  only(payload, [
    "requestId", "expectedPlacementRevision", "expectedContentHash"
  ]);
  const expectedContentHash = String(payload.expectedContentHash || "");
  if (!/^[a-f0-9]{64}$/u.test(expectedContentHash)) {
    fail(
      "invalid_catalog_revision",
      "expectedContentHash deve identificar o conteúdo oficial atual."
    );
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedPlacementRevision: positiveRevision(
      payload,
      "expectedPlacementRevision"
    ),
    expectedContentHash
  };
}

export function validateEducationalWorkspaceActionPayload(payload) {
  object(payload);
  only(payload, ["requestId", "operation", "payload"]);
  const operation = requiredText(payload, "operation", 40);
  if (!new Set([
    "create", "update", "invite", "accept_invite", "cancel_invite",
    "set_role", "remove_member", "transfer_owner", "leave"
  ]).has(operation)) {
    fail("invalid_workspace_governance_operation", "operation é inválida.");
  }
  const operationPayload = object(payload.payload, "payload.payload");
  if (JSON.stringify(operationPayload).length > 16_000) {
    fail("invalid_workspace_governance_payload", "payload.payload é grande demais.");
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    operation,
    payload: operationPayload
  };
}

export function validateEducationalWorkspaceCommentActionPayload(payload) {
  object(payload);
  only(payload, ["requestId", "operation", "payload"]);
  const operation = requiredText(payload, "operation", 40);
  if (!new Set([
    "respond_comment", "set_comment_status", "link_comment_correction"
  ]).has(operation)) {
    fail("invalid_workspace_comment_operation", "operation é inválida.");
  }
  const operationPayload = object(payload.payload, "payload.payload");
  if (operation === "respond_comment") {
    only(operationPayload, ["response"], "payload.payload");
    return {
      requestId: workspaceRequestId(payload.requestId), operation,
      payload: { response: requiredText(operationPayload, "response", 2000) }
    };
  }
  if (operation === "set_comment_status") {
    only(operationPayload, ["status", "note"], "payload.payload");
    const status = requiredText(operationPayload, "status", 20);
    if (!new Set(["open", "considered", "resolved"]).has(status)) {
      fail("invalid_workspace_comment_status", "status é inválido.");
    }
    const note = operationPayload.note == null
      ? ""
      : String(operationPayload.note).trim();
    if (note.length > 1000) {
      fail("invalid_workspace_comment_note", "note é grande demais.");
    }
    return {
      requestId: workspaceRequestId(payload.requestId), operation,
      payload: { status, note }
    };
  }
  only(operationPayload, ["correctionRequestId", "entityPath"], "payload.payload");
  const entityPath = operationPayload.entityPath;
  if (!Array.isArray(entityPath) || entityPath.length < 1 || entityPath.length > 5) {
    fail("invalid_workspace_comment_path", "entityPath deve conter de 1 a 5 ids.");
  }
  return {
    requestId: workspaceRequestId(payload.requestId), operation,
    payload: {
      correctionRequestId: workspaceRequestId(operationPayload.correctionRequestId),
      entityPath: entityPath.map((value, index) => workspaceId(
        value, `entityPath[${index}]`
      ))
    }
  };
}

export function validateWorkspaceObservationActionPayload(payload) {
  object(payload);
  only(payload, ["requestId", "operation", "payload"]);
  const operation = requiredText(payload, "operation", 20);
  if (!new Set(["create", "delete"]).has(operation)) {
    fail("invalid_workspace_observation_operation", "operation é inválida.");
  }
  const operationPayload = object(payload.payload, "payload.payload");
  if (operation === "delete") {
    only(operationPayload, ["observationId"], "payload.payload");
    return {
      requestId: workspaceRequestId(payload.requestId),
      operation,
      payload: { observationId: workspaceUuid(operationPayload.observationId, "observationId") }
    };
  }
  only(operationPayload, ["entityType", "entityPath", "resourceTargetId", "body"], "payload.payload");
  const entityType = requiredText(operationPayload, "entityType", 20);
  if (!new Set(["workspace", "course", "module", "lesson", "microsequence", "card", "resource"]).has(entityType)) {
    fail("invalid_workspace_observation_entity", "entityType é inválido.");
  }
  const entityPath = operationPayload.entityPath;
  const expectedDepth = {
    workspace: 0,
    course: 1,
    module: 2,
    lesson: 3,
    microsequence: 4,
    card: 5,
    resource: 5
  }[entityType];
  if (!Array.isArray(entityPath) || entityPath.length !== expectedDepth) {
    fail("invalid_workspace_observation_path", "entityPath é inválido.");
  }
  const resourceTargetId = operationPayload.resourceTargetId == null
    ? null
    : workspaceId(operationPayload.resourceTargetId, "resourceTargetId");
  if ((entityType === "resource") !== (resourceTargetId != null)) {
    fail("invalid_workspace_observation_resource", "resourceTargetId é inválido.");
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    operation,
    payload: {
      entityType,
      entityPath: entityPath.map((value, index) => workspaceId(value, `entityPath[${index}]`)),
      ...(resourceTargetId ? { resourceTargetId } : {}),
      body: requiredText(operationPayload, "body", 2000)
    }
  };
}

function jsonUtf8Size(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function validateWorkspaceDesignActionPayload(payload) {
  object(payload);
  const operation = requiredText(payload, "operation", 40);
  if (!DESIGN_ACTION_OPERATIONS.has(operation)) {
    fail("invalid_design_operation", "operation de desenho é inválida.");
  }
  if (operation === "contracts") {
    only(payload, ["operation", "contractName"]);
    const contractName = requiredText(payload, "contractName", 80);
    if (!DESIGN_CONTRACT_NAMES.has(contractName)) {
      fail("invalid_design_contract", "contractName de desenho é inválido.");
    }
    return { operation, contractName };
  }
  if (operation === "read_slice") {
    const view = payload.view == null ? "overview" : requiredText(payload, "view", 40);
    if (!DESIGN_SLICE_VIEWS.has(view)) {
      fail("invalid_design_slice_view", "view de desenho é inválida.");
    }
    if (view === "experiment_context") {
      only(payload, [
        "operation", "view", "experimentRef", "variantRevisionRef", "variantSetRef",
        "differenceRunRef", "cursor", "limit", "collection", "collectionSetRef",
        "collectionCursor", "collectionLimit"
      ]);
      const paired = (payload.experimentRef == null) === (payload.variantRevisionRef == null);
      if (!paired) {
        fail(
          "invalid_experiment_context_reference",
          "experimentRef e variantRevisionRef devem ser enviados juntos."
        );
      }
      const result = { operation, view };
      for (const field of ["experimentRef", "variantRevisionRef"]) {
        if (payload[field] == null) continue;
        const value = object(payload[field], field);
        only(value, ["id", "version"], field);
        result[field] = {
          id: requiredText(value, "id", 240),
          version: requiredText(value, "version", 80)
        };
      }
      if (payload.differenceRunRef != null) {
        if (payload.collection != null || payload.collectionSetRef != null
            || payload.collectionCursor != null || payload.collectionLimit != null) {
          fail(
            "mixed_experiment_context_pages",
            "Hunks e coleções do contexto usam paginações separadas."
          );
        }
        if (result.experimentRef == null) {
          fail(
            "invalid_experiment_difference_context",
            "differenceRunRef exige experimentRef e variantRevisionRef exatos."
          );
        }
        const differenceRunRef = object(payload.differenceRunRef, "differenceRunRef");
        only(differenceRunRef, ["id", "version"], "differenceRunRef");
        result.differenceRunRef = {
          id: requiredText(differenceRunRef, "id", 240),
          version: requiredText(differenceRunRef, "version", 80)
        };
      }
      if (payload.variantSetRef != null) {
        if (result.experimentRef != null || result.differenceRunRef != null
            || payload.collection != null) {
          fail(
            "unexpected_experiment_context_set_ref",
            "variantSetRef pertence somente à descoberta de contextos."
          );
        }
        const variantSetRef = object(payload.variantSetRef, "variantSetRef");
        only(variantSetRef, ["id", "version"], "variantSetRef");
        result.variantSetRef = {
          id: requiredText(variantSetRef, "id", 240),
          version: requiredText(variantSetRef, "version", 80)
        };
      }
      if (payload.cursor != null && result.experimentRef == null
          && result.variantSetRef == null && result.differenceRunRef == null) {
        fail(
          "missing_experiment_context_set_ref",
          "cursor de descoberta exige variantSetRef."
        );
      }
      if (payload.cursor != null) result.cursor = requiredText(payload, "cursor", 240);
      const limit = payload.limit == null ? 20 : payload.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        fail("invalid_experiment_context_limit", "limit de contextos deve ficar entre 1 e 20.");
      }
      result.limit = limit;
      if (payload.collection != null) {
        const collection = requiredText(payload, "collection", 40);
        if (!new Set([
          "factor_targets", "locks", "resource_sets", "target_paths",
          "difference_runs"
        ]).has(collection)) {
          fail(
            "invalid_experiment_context_collection",
            "collection de contexto experimental é inválida."
          );
        }
        if (payload.cursor != null || payload.variantSetRef != null
            || payload.differenceRunRef != null) {
          fail(
            "mixed_experiment_context_pages",
            "A subpágina de coleção não pode misturar discovery ou hunks."
          );
        }
        result.collection = collection;
        if (payload.collectionSetRef != null) {
          const collectionSetRef = object(payload.collectionSetRef, "collectionSetRef");
          only(collectionSetRef, ["id", "version"], "collectionSetRef");
          result.collectionSetRef = {
            id: requiredText(collectionSetRef, "id", 240),
            version: requiredText(collectionSetRef, "version", 80)
          };
        }
        if (payload.collectionCursor != null) {
          if (result.collectionSetRef == null) {
            fail(
              "missing_experiment_context_collection_set_ref",
              "collectionCursor exige collectionSetRef para manter a página ancorada."
            );
          }
          result.collectionCursor = requiredText(payload, "collectionCursor", 240);
        }
        const collectionLimit = payload.collectionLimit == null
          ? 20
          : payload.collectionLimit;
        if (!Number.isInteger(collectionLimit)
            || collectionLimit < 1 || collectionLimit > 20) {
          fail(
            "invalid_experiment_context_collection_limit",
            "collectionLimit deve ficar entre 1 e 20."
          );
        }
        result.collectionLimit = collectionLimit;
      } else if (payload.collectionSetRef != null
          || payload.collectionCursor != null || payload.collectionLimit != null) {
        fail(
          "unexpected_experiment_context_collection_page",
          "collectionSetRef/cursor/limit exigem collection."
        );
      }
      return result;
    }
    const result = {
      operation,
      view,
      microsequencePath: workspaceEntityPath(
        payload.microsequencePath,
        "microsequencePath",
        4
      )
    };
    if (!new Set(["resource_set", "audit"]).has(view)) {
      only(payload, ["operation", "microsequencePath", "view"]);
      return result;
    }
    if (view === "audit") {
      only(payload, [
        "operation", "microsequencePath", "view", "auditRunRef", "auditScope",
        "cursor", "limit", "componentCursor", "componentLimit"
      ]);
      if (payload.auditRunRef != null && payload.auditScope != null) {
        fail(
          "invalid_audit_slice_arguments",
          "Use auditRunRef ou auditScope, nunca ambos."
        );
      }
      if (payload.auditRunRef != null) {
        const auditRunRef = object(payload.auditRunRef, "auditRunRef");
        only(auditRunRef, ["id", "version"], "auditRunRef");
        result.auditRunRef = {
          id: workspaceUuid(auditRunRef.id, "auditRunRef.id"),
          version: requiredText(auditRunRef, "version", 80)
        };
      }
      if (payload.auditScope != null) {
        const auditScope = object(payload.auditScope, "auditScope");
        only(auditScope, ["kind", "ref"], "auditScope");
        const kind = requiredText(auditScope, "kind", 40);
        if (!new Set(["microsequence", "part"]).has(kind)) {
          fail("invalid_audit_scope", "auditScope.kind é inválido.");
        }
        result.auditScope = {
          kind,
          ref: requiredText(auditScope, "ref", 240)
        };
      }
      if (payload.cursor != null) {
        const cursor = requiredText(payload, "cursor", 20);
        if (!/^[1-9][0-9]{0,8}$/u.test(cursor)) {
          fail("invalid_audit_cursor", "O cursor de auditoria é inválido.");
        }
        result.cursor = cursor;
      }
      const limit = payload.limit == null ? AUDIT_PAGE_DEFAULT_LIMIT : payload.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > AUDIT_PAGE_MAX_LIMIT) {
        fail(
          "invalid_audit_limit",
          `limit deve ser um inteiro entre 1 e ${AUDIT_PAGE_MAX_LIMIT}.`,
          { field: "limit" }
        );
      }
      result.limit = limit;
      if (payload.componentCursor != null) {
        const componentCursor = requiredText(payload, "componentCursor", 20);
        if (!/^[1-9][0-9]{0,8}$/u.test(componentCursor)) {
          fail(
            "invalid_audit_component_cursor",
            "O cursor de microssequências da Parte é inválido."
          );
        }
        result.componentCursor = componentCursor;
      }
      const componentLimit = payload.componentLimit == null
        ? AUDIT_COMPONENT_PAGE_MAX_LIMIT
        : payload.componentLimit;
      if (!Number.isInteger(componentLimit)
        || componentLimit < 1
        || componentLimit > AUDIT_COMPONENT_PAGE_MAX_LIMIT) {
        fail(
          "invalid_audit_component_limit",
          `componentLimit deve ser um inteiro entre 1 e ${AUDIT_COMPONENT_PAGE_MAX_LIMIT}.`,
          { field: "componentLimit" }
        );
      }
      result.componentLimit = componentLimit;
      return result;
    }
    only(payload, [
      "operation", "microsequencePath", "view", "resourceSetRef", "cursor", "limit"
    ]);
    const resourceSetRef = object(payload.resourceSetRef, "resourceSetRef");
    only(resourceSetRef, ["id", "version"], "resourceSetRef");
    result.resourceSetRef = {
      id: requiredText(resourceSetRef, "id", 240),
      version: requiredText(resourceSetRef, "version", 80)
    };
    if (payload.cursor != null) result.cursor = requiredText(payload, "cursor", 240);
    const limit = payload.limit == null ? RESOURCE_SET_PAGE_DEFAULT_LIMIT : payload.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > RESOURCE_SET_PAGE_MAX_LIMIT) {
      fail(
        "invalid_resource_set_limit",
        `limit deve ser um inteiro entre 1 e ${RESOURCE_SET_PAGE_MAX_LIMIT}.`,
        { field: "limit" }
      );
    }
    result.limit = limit;
    return result;
  }
  only(payload, [
    "operation", "requestId", "expectedRevision", "microsequencePath", "payload"
  ]);
  const operationPayload = object(payload.payload, "payload.payload");
  const payloadLimit = DESIGN_ACTION_PAYLOAD_LIMITS[operation];
  if (jsonUtf8Size(operationPayload) > payloadLimit) {
    fail(
      "design_payload_too_large",
      `payload da operação ${operation} excede o teto técnico de ${payloadLimit} bytes.`,
      { operation, maximumBytes: payloadLimit }
    );
  }
  return {
    operation,
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    microsequencePath: workspaceEntityPath(
      payload.microsequencePath,
      "microsequencePath",
      4
    ),
    payload: operationPayload
  };
}

export function validateWorkspaceExperimentActionPayload(payload) {
  object(payload);
  const operation = requiredText(payload, "operation", 40);
  if (!EXPERIMENT_ACTION_OPERATIONS.has(operation)) {
    fail("invalid_experiment_operation", "operation experimental é inválida.");
  }
  if (operation === "list" || operation === "list_options") {
    only(payload, [
      "operation", "kind", "query", "experimentSetRef", "optionsSetRef",
      "cursor", "limit"
    ]);
    const optionKinds = new Set([
      "scope", "base", "factor_definition", "resource_set", "consent_policy",
      "instrument", "outcome"
    ]);
    if (operation === "list_options") {
      const kind = requiredText(payload, "kind", 40);
      if (!optionKinds.has(kind)) {
        fail("invalid_experiment_option_kind", "kind de opção experimental é inválido.");
      }
    } else if (payload.kind != null || payload.query != null
        || payload.optionsSetRef != null) {
      fail("unexpected_experiment_option_filter", "kind/query pertencem a list_options.");
    }
    if (operation === "list_options" && payload.experimentSetRef != null) {
      fail(
        "unexpected_experiment_set_ref",
        "experimentSetRef pertence à lista de experimentos."
      );
    }
    const limit = payload.limit == null ? 20 : payload.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      fail("invalid_experiment_limit", "limit experimental deve ficar entre 1 e 50.");
    }
    const setRefField = operation === "list" ? "experimentSetRef" : "optionsSetRef";
    let setRef = null;
    if (payload[setRefField] != null) {
      const source = object(payload[setRefField], setRefField);
      only(source, ["id", "version"], setRefField);
      setRef = {
        id: requiredText(source, "id", 240),
        version: requiredText(source, "version", 80)
      };
    }
    if (payload.cursor != null && setRef == null) {
      fail(
        "missing_experiment_list_set_ref",
        `cursor exige ${setRefField} para manter a página ancorada.`
      );
    }
    return {
      operation,
      ...(operation === "list_options" ? {
        kind: requiredText(payload, "kind", 40),
        ...(payload.query == null ? {} : { query: requiredText(payload, "query", 200) })
      } : {}),
      ...(setRef == null ? {} : { [setRefField]: setRef }),
      ...(payload.cursor == null ? {} : {
        cursor: requiredText(payload, "cursor", 240)
      }),
      limit
    };
  }
  if (operation === "read") {
    only(payload, [
      "operation", "experimentId", "section", "protocolRevision", "variantSetRef",
      "variantCursor", "variantLimit",
      "differenceSetRef", "differenceRunCursor", "differenceRunLimit",
      "differenceRunRef", "differenceCursor", "differenceLimit",
      "participantSetRef", "participantCursor", "participantLimit"
    ]);
    const section = payload.section == null
      ? "overview"
      : requiredText(payload, "section", 40);
    if (!new Set([
      "overview", "protocol", "variants", "differences", "participants"
    ]).has(section)) {
      fail("invalid_experiment_read_section", "section experimental é inválida.");
    }
    const result = {
      operation,
      experimentId: workspaceUuid(payload.experimentId, "experimentId"),
      section
    };
    if (section === "protocol" && payload.protocolRevision != null) {
      result.protocolRevision = positiveRevision(payload, "protocolRevision");
    } else if (section !== "protocol" && payload.protocolRevision != null) {
      fail("unexpected_experiment_protocol_revision", "protocolRevision exige section protocol.");
    }
    if (section === "variants") {
      const variantLimit = payload.variantLimit == null ? 20 : payload.variantLimit;
      if (!Number.isInteger(variantLimit) || variantLimit < 1 || variantLimit > 20) {
        fail("invalid_experiment_variant_limit", "variantLimit deve ficar entre 1 e 20.");
      }
      result.variantLimit = variantLimit;
      if (payload.variantSetRef != null) {
        const variantSetRef = object(payload.variantSetRef, "variantSetRef");
        only(variantSetRef, ["id", "version"], "variantSetRef");
        result.variantSetRef = {
          id: requiredText(variantSetRef, "id", 240),
          version: requiredText(variantSetRef, "version", 80)
        };
      }
      if (payload.variantCursor != null) {
        if (result.variantSetRef == null) {
          fail(
            "missing_experiment_variant_set_ref",
            "variantCursor exige variantSetRef para manter a página ancorada."
          );
        }
        result.variantCursor = requiredText(payload, "variantCursor", 240);
      }
    } else if (payload.variantSetRef != null
        || payload.variantCursor != null
        || payload.variantLimit != null) {
      fail("unexpected_experiment_variant_page", "A página de variantes exige section variants.");
    }
    if (section === "differences" && payload.differenceRunRef != null) {
      if (payload.differenceSetRef != null
          || payload.differenceRunCursor != null
          || payload.differenceRunLimit != null) {
        fail(
          "mixed_experiment_difference_pages",
          "A página de hunks não pode misturar o pin da lista de rodadas."
        );
      }
      const differenceRunRef = object(payload.differenceRunRef, "differenceRunRef");
      only(differenceRunRef, ["id", "version"], "differenceRunRef");
      result.differenceRunRef = {
        id: requiredText(differenceRunRef, "id", 240),
        version: requiredText(differenceRunRef, "version", 80)
      };
      const differenceLimit = payload.differenceLimit == null
        ? 20
        : payload.differenceLimit;
      if (!Number.isInteger(differenceLimit)
          || differenceLimit < 1
          || differenceLimit > 20) {
        fail("invalid_experiment_difference_limit", "differenceLimit deve ficar entre 1 e 20.");
      }
      result.differenceLimit = differenceLimit;
      if (payload.differenceCursor != null) {
        result.differenceCursor = requiredText(payload, "differenceCursor", 240);
      }
    } else if (section === "differences") {
      if (payload.differenceCursor != null || payload.differenceLimit != null) {
        fail(
          "invalid_experiment_difference_hunk_page",
          "differenceCursor/differenceLimit exigem differenceRunRef."
        );
      }
      if (payload.differenceSetRef != null) {
        const differenceSetRef = object(payload.differenceSetRef, "differenceSetRef");
        only(differenceSetRef, ["id", "version"], "differenceSetRef");
        result.differenceSetRef = {
          id: requiredText(differenceSetRef, "id", 240),
          version: requiredText(differenceSetRef, "version", 80)
        };
      }
      const differenceRunLimit = payload.differenceRunLimit == null
        ? 20
        : payload.differenceRunLimit;
      if (!Number.isInteger(differenceRunLimit)
          || differenceRunLimit < 1
          || differenceRunLimit > 20) {
        fail(
          "invalid_experiment_difference_run_limit",
          "differenceRunLimit deve ficar entre 1 e 20."
        );
      }
      result.differenceRunLimit = differenceRunLimit;
      if (payload.differenceRunCursor != null) {
        if (result.differenceSetRef == null) {
          fail(
            "missing_experiment_difference_set_ref",
            "differenceRunCursor exige differenceSetRef para manter a página ancorada."
          );
        }
        result.differenceRunCursor = requiredText(payload, "differenceRunCursor", 240);
      }
    }
    if (section !== "differences" && (
      payload.differenceSetRef != null
      || payload.differenceRunCursor != null
      || payload.differenceRunLimit != null
      || payload.differenceRunRef != null
      || payload.differenceCursor != null
      || payload.differenceLimit != null
    )) {
      fail(
        "unexpected_experiment_difference_page",
        "A página de diferenças exige section differences."
      );
    }
    if (section === "participants") {
      const participantLimit = payload.participantLimit == null
        ? 20
        : payload.participantLimit;
      if (!Number.isInteger(participantLimit)
          || participantLimit < 1
          || participantLimit > 20) {
        fail("invalid_experiment_participant_limit", "participantLimit deve ficar entre 1 e 20.");
      }
      result.participantLimit = participantLimit;
      if (payload.participantSetRef != null) {
        const participantSetRef = object(payload.participantSetRef, "participantSetRef");
        only(participantSetRef, ["id", "version"], "participantSetRef");
        result.participantSetRef = {
          id: requiredText(participantSetRef, "id", 240),
          version: requiredText(participantSetRef, "version", 80)
        };
      }
      if (payload.participantCursor != null) {
        if (result.participantSetRef == null) {
          fail(
            "missing_experiment_participant_set_ref",
            "participantCursor exige participantSetRef para manter a página ancorada."
          );
        }
        result.participantCursor = requiredText(payload, "participantCursor", 240);
      }
    } else if (payload.participantSetRef != null
        || payload.participantCursor != null
        || payload.participantLimit != null) {
      fail(
        "unexpected_experiment_participant_page",
        "A fila pseudônima exige section participants."
      );
    }
    return result;
  }
  only(payload, [
    "operation", "requestId", "expectedExperimentRevision",
    "expectedWorkspaceRevision", "payload"
  ]);
  const expectedExperimentRevision = payload.expectedExperimentRevision;
  if (!Number.isInteger(expectedExperimentRevision) || expectedExperimentRevision < 0) {
    fail(
      "invalid_experiment_revision",
      "expectedExperimentRevision deve ser zero na criação ou um inteiro positivo."
    );
  }
  const operationPayload = object(payload.payload, "payload.payload");
  const payloadLimit = EXPERIMENT_ACTION_PAYLOAD_LIMITS[operation];
  if (jsonUtf8Size(operationPayload) > payloadLimit) {
    fail(
      "experiment_payload_too_large",
      `payload da operação ${operation} excede ${payloadLimit} bytes.`,
      { operation, maximumBytes: payloadLimit }
    );
  }
  const workspaceFencedOperations = new Set([
    "validate", "generate_variants", "request_correction", "freeze"
  ]);
  if (workspaceFencedOperations.has(operation)
      && payload.expectedWorkspaceRevision == null) {
    fail(
      "missing_workspace_revision",
      `expectedWorkspaceRevision é obrigatório em ${operation}.`
    );
  }
  if (!workspaceFencedOperations.has(operation)
      && payload.expectedWorkspaceRevision != null) {
    fail(
      "unexpected_workspace_revision",
      `expectedWorkspaceRevision não pertence a ${operation}.`
    );
  }
  return {
    operation,
    requestId: workspaceRequestId(payload.requestId),
    expectedExperimentRevision,
    ...(payload.expectedWorkspaceRevision == null ? {} : {
      expectedWorkspaceRevision: positiveRevision(payload, "expectedWorkspaceRevision")
    }),
    payload: operationPayload
  };
}

export function validateExperimentEnrollmentActionPayload(payload) {
  object(payload);
  const operation = requiredText(payload, "operation", 40);
  if (!new Set(["read_policy", "enroll", "withdraw", "status", "record_outcome"]).has(operation)) {
    fail("invalid_experiment_enrollment_operation", "Operação de ingresso inválida.");
  }
  if (operation === "record_outcome") {
    only(payload, [
      "operation", "workspaceId", "enrollmentRef", "requestId", "instrumentRef",
      "outcomeRef", "wave", "valueKind", "value", "missingReason", "observedAt"
    ]);
    const valueKind = requiredText(payload, "valueKind", 20);
    if (!new Set(["numeric", "category", "boolean", "text", "missing"]).has(valueKind)) {
      fail("invalid_experiment_outcome_kind", "valueKind do outcome é inválido.");
    }
    const versionedRef = (field) => {
      const source = object(payload[field], field);
      only(source, ["id", "version"], field);
      return {
        id: requiredText(source, "id", 240),
        version: requiredText(source, "version", 80)
      };
    };
    const observedAt = requiredText(payload, "observedAt", 40);
    if (!Number.isFinite(Date.parse(observedAt))) {
      fail("invalid_experiment_outcome_time", "observedAt do outcome é inválido.");
    }
    if (valueKind === "missing") {
      if (payload.value != null || !requiredText(payload, "missingReason", 500)) {
        fail("invalid_experiment_missing_outcome", "Outcome ausente exige somente missingReason.");
      }
    } else if (payload.value == null || payload.missingReason != null) {
      fail("invalid_experiment_outcome_value", "Outcome observado exige value e não aceita missingReason.");
    }
    if (valueKind === "numeric" && (typeof payload.value !== "number" || !Number.isFinite(payload.value))) {
      fail("invalid_experiment_outcome_value", "Outcome numérico exige número finito.");
    }
    if (valueKind === "boolean" && typeof payload.value !== "boolean") {
      fail("invalid_experiment_outcome_value", "Outcome booleano exige boolean.");
    }
    if (new Set(["category", "text"]).has(valueKind)
        && (typeof payload.value !== "string" || !payload.value.trim()
          || payload.value.length > 1000)) {
      fail("invalid_experiment_outcome_value", "Outcome textual é inválido.");
    }
    return {
      operation,
      workspaceId: workspaceUuid(payload.workspaceId, "workspaceId"),
      enrollmentRef: workspaceUuid(payload.enrollmentRef, "enrollmentRef"),
      requestId: workspaceRequestId(payload.requestId),
      payload: {
        instrumentRef: versionedRef("instrumentRef"),
        outcomeRef: versionedRef("outcomeRef"),
        wave: requiredText(payload, "wave", 80),
        valueKind,
        value: valueKind === "missing" ? null : payload.value,
        missingReason: valueKind === "missing" ? requiredText(payload, "missingReason", 500) : null,
        observedAt
      }
    };
  }
  if (operation === "status" || operation === "withdraw") {
    const enrollmentRef = workspaceUuid(payload.enrollmentRef, "enrollmentRef");
    if (operation === "status") {
      only(payload, ["operation", "enrollmentRef"]);
      return { operation, enrollmentRef };
    }
    only(payload, ["operation", "enrollmentRef", "requestId"]);
    return {
      operation,
      enrollmentRef,
      requestId: workspaceRequestId(payload.requestId)
    };
  }
  const enrollmentCode = requiredText(payload, "enrollmentCode", 128);
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(enrollmentCode)) {
    fail("invalid_experiment_enrollment_code", "Código de ingresso inválido.");
  }
  if (operation === "read_policy") {
    only(payload, ["operation", "enrollmentCode"]);
    return { operation, enrollmentCode };
  }
  only(payload, [
    "operation", "enrollmentCode", "requestId", "consentPolicyRef",
    "consentAcknowledged"
  ]);
  if (payload.consentAcknowledged !== true) {
    fail(
      "experiment_consent_not_acknowledged",
      "O ingresso exige confirmação explícita da política lida."
    );
  }
  const consentPolicyRef = object(payload.consentPolicyRef, "consentPolicyRef");
  only(consentPolicyRef, ["id", "version"], "consentPolicyRef");
  return {
    operation,
    enrollmentCode,
    requestId: workspaceRequestId(payload.requestId),
    consentPolicyRef: {
      id: requiredText(consentPolicyRef, "id", 240),
      version: requiredText(consentPolicyRef, "version", 80)
    },
    consentAcknowledged: true
  };
}

export function validateWorkspaceAnalyticsActionPayload(payload) {
  object(payload);
  const operation = requiredText(payload, "operation", 20);
  if (!new Set(["overview", "dataset", "export"]).has(operation)) {
    fail("invalid_analytics_operation", "Operação de analytics inválida.");
  }
  const fields = operation === "overview"
    ? ["operation", "scope"]
    : ["operation", "scope", "dataset", "datasetSetRef", "cursor", "limit", "format"];
  only(payload, fields);
  const scope = object(payload.scope, "scope");
  only(scope, ["kind", "ref", "entityPath"], "scope");
  const kind = requiredText(scope, "kind", 40);
  if (!new Set(["workspace", "course", "module", "lesson", "microsequence", "experiment"]).has(kind)) {
    fail("invalid_analytics_scope", "kind do escopo de analytics é inválido.");
  }
  const normalizedScope = { kind };
  if (kind !== "workspace") normalizedScope.ref = requiredText(scope, "ref", 240);
  if (scope.entityPath != null) {
    normalizedScope.entityPath = workspaceEntityPath(scope.entityPath, "scope.entityPath");
  }
  if (operation === "overview") {
    if (!new Set(["workspace", "experiment"]).has(kind)) {
      fail(
        "invalid_analytics_overview_scope",
        "O overview aceita somente o workspace ou um experimento."
      );
    }
    return { operation, scope: normalizedScope };
  }
  const dataset = requiredText(payload, "dataset", 40);
  if (!new Set([
    "authoring_design", "authoring_process", "experiment_assignments", "experiment_outcomes"
  ]).has(dataset)) fail("invalid_analytics_dataset", "Dataset de analytics inválido.");
  if (dataset.startsWith("experiment_") !== (kind === "experiment")) {
    fail("invalid_analytics_dataset_scope", "Dataset e escopo de analytics são incompatíveis.");
  }
  const limit = payload.limit == null ? 20 : payload.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    fail("invalid_analytics_limit", "limit de analytics deve ficar entre 1 e 20.");
  }
  let normalizedRef = null;
  if (payload.datasetSetRef != null) {
    const source = object(payload.datasetSetRef, "datasetSetRef");
    only(source, ["id", "version"], "datasetSetRef");
    normalizedRef = {
      id: requiredText(source, "id", 240),
      version: requiredText(source, "version", 80)
    };
  }
  if (payload.cursor != null && normalizedRef == null) {
    fail("missing_analytics_set_ref", "cursor exige datasetSetRef exata.");
  }
  if (operation === "dataset" && payload.format != null) {
    fail("unexpected_analytics_format", "format pertence à exportação.");
  }
  const format = operation === "export" ? requiredText(payload, "format", 10) : null;
  if (format && !new Set(["csv", "json"]).has(format)) {
    fail("invalid_analytics_export_format", "Formato de exportação inválido.");
  }
  return {
    operation,
    scope: normalizedScope,
    dataset,
    ...(normalizedRef ? { datasetSetRef: normalizedRef } : {}),
    ...(payload.cursor == null ? {} : { cursor: requiredText(payload, "cursor", 240) }),
    limit,
    ...(format ? { format } : {})
  };
}

export function workspaceRoute(method, path) {
  if (path === "/v1/experiments/enrollment/actions" && method === "POST") {
    return { name: "manageExperimentEnrollment" };
  }
  let experimentMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/experiments\/actions$/u);
  if (experimentMatch && method === "POST") {
    return {
      name: "manageWorkspaceExperiment",
      workspaceId: workspaceUuid(experimentMatch[1], "workspaceId")
    };
  }
  const analyticsMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/analytics\/actions$/u);
  if (analyticsMatch && method === "POST") {
    return {
      name: "manageWorkspaceAnalytics",
      workspaceId: workspaceUuid(analyticsMatch[1], "workspaceId")
    };
  }
  let designMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/design\/actions$/u);
  if (designMatch && method === "POST") {
    return {
      name: "manageWorkspaceDesign",
      workspaceId: workspaceUuid(designMatch[1], "workspaceId")
    };
  }
  let observationMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/observations\/actions$/u);
  if (observationMatch && method === "POST") {
    return {
      name: "manageWorkspaceObservation",
      workspaceId: workspaceUuid(observationMatch[1], "workspaceId")
    };
  }
  observationMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/observations$/u);
  if (observationMatch && method === "GET") {
    return {
      name: "listWorkspaceObservations",
      workspaceId: workspaceUuid(observationMatch[1], "workspaceId")
    };
  }
  let commentMatch = path.match(
    /^\/v1\/educational-workspaces\/([^/]+)\/comments\/([^/]+)\/actions$/u
  );
  if (commentMatch && method === "POST") {
    return {
      name: "manageEducationalWorkspaceComment",
      workspaceId: workspaceUuid(commentMatch[1], "workspaceId"),
      commentId: workspaceUuid(commentMatch[2], "commentId")
    };
  }
  commentMatch = path.match(/^\/v1\/educational-workspaces\/([^/]+)\/comments$/u);
  if (commentMatch && method === "GET") {
    return {
      name: "listEducationalWorkspaceComments",
      workspaceId: workspaceUuid(commentMatch[1], "workspaceId")
    };
  }
  if (method === "POST" && path === "/v1/educational-workspaces/actions") {
    return { name: "manageEducationalWorkspace" };
  }
  let educationalMatch = path.match(/^\/v1\/educational-workspaces\/([^/]+)$/u);
  if (educationalMatch && method === "GET") {
    return {
      name: "getEducationalWorkspace",
      workspaceId: workspaceUuid(educationalMatch[1], "workspaceId")
    };
  }
  if (path === "/v1/workspaces") {
    if (method === "GET") return { name: "listWorkspaces" };
    if (method === "POST") return { name: "createWorkspace" };
  }
  let match = path.match(/^\/v1\/workspaces\/([^/]+)$/u);
  if (match && method === "GET") {
    return { name: "getWorkspace", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  if (match && method === "DELETE") {
    return { name: "deleteWorkspace", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/microsequence-cards$/u);
  if (match && method === "GET") {
    return {
      name: "listWorkspaceMicrosequenceCards",
      workspaceId: workspaceUuid(match[1], "workspaceId")
    };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/events$/u);
  if (match && method === "GET") {
    return { name: "getWorkspaceEvents", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/continuity\/actions$/u);
  if (match && method === "POST") {
    return {
      name: "manageWorkspaceContinuity",
      workspaceId: workspaceUuid(match[1], "workspaceId")
    };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/mutations$/u);
  if (match && method === "POST") {
    return { name: "mutateWorkspace", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/imports$/u);
  if (match && method === "POST") {
    return { name: "importCourseIntoWorkspace", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/publications$/u);
  if (match && method === "POST") {
    return { name: "publishWorkspaceCourse", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/courses\/([^/]+)\/content$/u);
  if (match && method === "GET") {
    return { name: "readCourseContent", courseId: workspaceUuid(match[1], "courseId") };
  }
  return null;
}
