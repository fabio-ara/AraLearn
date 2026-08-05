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

function requiredWorkspacePosition(value, field = "position") {
  if (value == null) {
    fail("invalid_workspace_position", `${field} deve ser inteiro não negativo.`, { field });
  }
  return workspacePosition(value, field);
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
      ["microsequencePath", "mode", "cards", "status"],
      "arguments"
    );
    const mode = String(argumentsValue.mode || "");
    const status = String(argumentsValue.status || "");
    if (!["append", "replace"].includes(mode)) {
      fail("invalid_workspace_mode", "mode deve ser append ou replace.");
    }
    if (!["planned", "generated", "needs_review", "ready"].includes(status)) {
      fail("invalid_workspace_status", "status de materialização é inválido.");
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
    if (mode === "replace" && argumentsValue.cards.length === 0 && status !== "planned") {
      fail(
        "invalid_workspace_status",
        "replace vazio exige status planned."
      );
    }
    return {
      microsequencePath: workspaceEntityPath(
        argumentsValue.microsequencePath,
        "microsequencePath",
        4
      ),
      mode,
      cards: structuredClone(argumentsValue.cards),
      status
    };
  }
  if (operation === "update_metadata") {
    only(argumentsValue, [
      "entityType", "entityPath", "title", "goal", "include", "exclude",
      "notation", "avoid", "role", "status", "branchOf",
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
          "title", "goal", "role", "status", "branchOf",
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
      } else if (field === "status") {
        const status = String(argumentsValue.status || "");
        if (!["planned", "generated", "needs_review", "ready"].includes(status)) {
          fail("invalid_workspace_metadata_field", "status é inválido.");
        }
        normalized.status = status;
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
      "id", "title", "goal", "role", "status", "branchOf",
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
    const splitStatus = String(newMicrosequence.status || "");
    if (!["explain", "practice", "review", "support"].includes(splitRole)
        || !["planned", "generated", "needs_review", "ready"].includes(splitStatus)
        || !Array.isArray(newMicrosequence.cards)) {
      fail(
        "invalid_workspace_split",
        "newMicrosequence deve declarar role, status e cards vazios válidos."
      );
    }
    return {
      sourcePath: workspaceEntityPath(argumentsValue.sourcePath, "sourcePath", 4),
      newMicrosequence: {
        id: requiredText(newMicrosequence, "id", 240),
        title: requiredText(newMicrosequence, "title", 300),
        goal: requiredText(newMicrosequence, "goal", 2_000),
        role: splitRole,
        status: splitStatus,
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
    brief: payload.brief == null ? "" : requiredText(payload, "brief", 16_000),
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
    brief: requiredText(payload, "brief", 16_000)
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

export function validateMoveCatalogCollectionPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "position"]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    position: requiredWorkspacePosition(payload.position)
  };
}

export function validateMoveCatalogCoursePayload(payload) {
  object(payload);
  only(payload, [
    "requestId", "expectedPlacementRevision", "targetCollectionId", "position"
  ]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedPlacementRevision: positiveRevision(
      payload,
      "expectedPlacementRevision"
    ),
    targetCollectionId: workspaceUuid(
      payload.targetCollectionId,
      "targetCollectionId"
    ),
    position: workspacePosition(payload.position)
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
    if (!new Set(["open", "considered", "resolved", "incorporated"]).has(status)) {
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

export function workspaceRoute(method, path) {
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
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/context$/u);
  if (match && method === "POST") {
    return {
      name: "updateWorkspaceBrief",
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
