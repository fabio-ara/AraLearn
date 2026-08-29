import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";

const GENERATION_CONTRACT = "aralearn.authoring-trusted-creation-identity.v1";
const CONTEXT_LIMITS = Object.freeze({ requestId: 128, courseId: 36, operation: 64 });

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deterministicUuidFromHash(hash) {
  const bytes = hash.slice(0, 32).split("");
  bytes[12] = "8";
  bytes[16] = ((Number.parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const value = bytes.join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20, 32)
  ].join("-");
}

async function generatedUuid(context, slot) {
  const hash = await sha256Hex([
    GENERATION_CONTRACT,
    context.courseId,
    context.requestId,
    context.operation,
    slot
  ].join("\0"));
  return deterministicUuidFromHash(hash);
}

async function fillUuid(value, field, context, slot) {
  if (isObject(value) && value[field] == null) {
    value[field] = await generatedUuid(context, slot);
  }
}

function requireExistingIdentity(value, field, label) {
  if (!isObject(value) || value[field] == null) {
    throw new AuthoringApiError(
      422,
      "invalid_tool_argument",
      `${label} precisa preservar a identidade lida da entidade existente.`
    );
  }
}

function requireExactlyOneReference(value, identityField, indexField, label) {
  if (!isObject(value)) return;
  const hasIdentity = value[identityField] != null;
  const hasIndex = value[indexField] != null;
  if (hasIdentity === hasIndex) {
    throw new AuthoringApiError(
      422,
      "invalid_tool_argument",
      `${label} precisa usar exatamente uma referência: ${identityField} ou ${indexField}.`
    );
  }
}

function requireHydrationArrayBound(value, maximum, label) {
  if (Array.isArray(value) && value.length > maximum) {
    throw new AuthoringApiError(
      422,
      "invalid_tool_argument",
      `${label} excede o limite de ${maximum} itens.`
    );
  }
}

function validateHydrationBounds(raw) {
  for (const [field, maximum] of Object.entries(CONTEXT_LIMITS)) {
    if (typeof raw[field] === "string" && raw[field].length > maximum) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_argument",
        `${field} excede o limite aceito.`
      );
    }
  }
  if (raw.operation === "update_audit_cycle" && isObject(raw.auditCommand)) {
    requireHydrationArrayBound(raw.auditCommand.checks, 31, "auditCommand.checks");
    requireHydrationArrayBound(raw.auditCommand.findings, 15, "auditCommand.findings");
  }
  if (raw.operation === "commit_course_composition") {
    requireHydrationArrayBound(raw.upserts, 200, "upserts");
    requireHydrationArrayBound(
      raw.sourceAttributionApplications,
      64,
      "sourceAttributionApplications"
    );
  }
  if (raw.operation === "advance_part_materialization" &&
      isObject(raw.materializationCommand)) {
    const command = raw.materializationCommand;
    requireHydrationArrayBound(command.steps, 64, "materializationCommand.steps");
    requireHydrationArrayBound(
      command.entityChanges?.upserts,
      64,
      "materializationCommand.entityChanges.upserts"
    );
    requireHydrationArrayBound(
      command.designApplication?.studyUnits,
      64,
      "materializationCommand.designApplication.studyUnits"
    );
    requireHydrationArrayBound(
      command.sourceAttributionApplication?.studyUnits,
      64,
      "materializationCommand.sourceAttributionApplication.studyUnits"
    );
  }
}

async function fillAuditChecks(checks, context, slotPrefix) {
  if (!Array.isArray(checks)) return;
  await Promise.all(checks.map((check, index) =>
    fillUuid(check, "checkId", context, `${slotPrefix}.check.${index}`)
  ));
}

function resolveCheckIndexes(findings, checks) {
  if (!Array.isArray(findings)) return;
  for (const [index, finding] of findings.entries()) {
    if (!isObject(finding)) continue;
    requireExactlyOneReference(
      finding,
      "checkId",
      "checkIndex",
      `auditCommand.findings[${index}]`
    );
    if (finding.checkIndex == null) continue;
    const checkIndex = finding.checkIndex;
    if (!Number.isSafeInteger(checkIndex) || checkIndex < 0 || checkIndex >= checks.length ||
        !isObject(checks[checkIndex]) || typeof checks[checkIndex].checkId !== "string") {
      throw new AuthoringApiError(
        422,
        "invalid_tool_argument",
        `auditCommand.findings[${index}].checkIndex não referencia uma verificação do mesmo lote.`
      );
    }
    if (finding.checkId == null) finding.checkId = checks[checkIndex].checkId;
    delete finding.checkIndex;
  }
}

async function fillAuditCommand(command, context) {
  if (!isObject(command)) return;
  if (command.type === "record_audit") {
    await fillUuid(command, "auditRunId", context, "audit.run");
    await fillAuditChecks(command.checks, context, "audit");
    if (Array.isArray(command.findings)) {
      await Promise.all(command.findings.map((finding, index) =>
        fillUuid(finding, "findingId", context, `audit.finding.${index}`)
      ));
      resolveCheckIndexes(command.findings, command.checks || []);
    }
    return;
  }
  if (command.type === "verify_finding") {
    await fillUuid(command, "auditRunId", context, "audit.verification.run");
    await fillAuditChecks(command.checks, context, "audit.verification");
    return;
  }
  if (command.type === "propose_authoring_correction") {
    if (command.expectedCorrectionVersion === 0) {
      await fillUuid(command, "correctionId", context, "audit.correction");
    } else if (Number.isSafeInteger(command.expectedCorrectionVersion) &&
        command.expectedCorrectionVersion > 0) {
      requireExistingIdentity(command, "correctionId", "auditCommand.correctionId");
    }
  }
}

async function fillCourseEntities(upserts, context, slotPrefix) {
  if (!Array.isArray(upserts)) return [];
  await Promise.all(upserts.map((entity, index) =>
    fillUuid(entity, "entityId", context, `${slotPrefix}.entity.${index}`)
  ));
  for (const [index, entity] of upserts.entries()) {
    if (!isObject(entity)) continue;
    if (entity.parentType !== null) {
      requireExactlyOneReference(
        entity,
        "parentId",
        "parentUpsertIndex",
        `upserts[${index}]`
      );
    }
    if (entity.parentUpsertIndex != null) {
      const parentIndex = entity.parentUpsertIndex;
      const parent = Number.isSafeInteger(parentIndex) ? upserts[parentIndex] : null;
      if (parentIndex < 0 || parentIndex >= upserts.length || !isObject(parent) ||
          typeof parent.entityId !== "string" || parent.entityType !== entity.parentType) {
        throw new AuthoringApiError(
          422,
          "invalid_tool_argument",
          `upserts[${index}].parentUpsertIndex não referencia um pai compatível no mesmo lote.`
        );
      }
      if (entity.parentId == null) entity.parentId = parent.entityId;
      delete entity.parentUpsertIndex;
    }
    if (entity.parentType === null && entity.parentId == null) entity.parentId = null;
  }
  resolveMicrosequenceIndexes(upserts);
  return upserts;
}

function referencedMicrosequence(upserts, upsertIndex, entity, label, {
  mustPrecede = false
} = {}) {
  const referenced = Number.isSafeInteger(upsertIndex) ? upserts[upsertIndex] : null;
  if (upsertIndex < 0 || upsertIndex >= upserts.length || !isObject(referenced) ||
      referenced.entityType !== "microsequence" ||
      typeof referenced.entityId !== "string" ||
      referenced.entityId === entity.entityId ||
      referenced.parentId !== entity.parentId ||
      mustPrecede && (!Number.isSafeInteger(referenced.position) ||
        !Number.isSafeInteger(entity.position) || referenced.position >= entity.position)) {
    throw new AuthoringApiError(
      422,
      "invalid_tool_argument",
      `${label} não referencia uma Microssequência compatível do mesmo lote e da mesma Lição.`
    );
  }
  return referenced;
}

function resolveMicrosequenceIndexes(upserts) {
  for (const [index, entity] of upserts.entries()) {
    if (!isObject(entity) || entity.entityType !== "microsequence" ||
        !isObject(entity.content)) continue;
    const content = entity.content;
    if (content.branchOfUpsertIndex != null) {
      if (content.branchOf != null) {
        throw new AuthoringApiError(
          422,
          "invalid_tool_argument",
          `upserts[${index}].content precisa usar branchOf existente ou branchOfUpsertIndex, não ambos.`
        );
      }
      const branch = referencedMicrosequence(
        upserts,
        content.branchOfUpsertIndex,
        entity,
        `upserts[${index}].content.branchOfUpsertIndex`
      );
      content.branchOf = branch.entityId;
      delete content.branchOfUpsertIndex;
    }
    if (content.dependsOnUpsertIndexes == null) continue;
    if (!Array.isArray(content.dependsOnUpsertIndexes) || !Array.isArray(content.dependsOn)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_argument",
        `upserts[${index}].content.dependsOnUpsertIndexes exige listas válidas.`
      );
    }
    const dependencies = [...content.dependsOn];
    for (const [dependencyIndex, upsertIndex] of content.dependsOnUpsertIndexes.entries()) {
      const dependency = referencedMicrosequence(
        upserts,
        upsertIndex,
        entity,
        `upserts[${index}].content.dependsOnUpsertIndexes[${dependencyIndex}]`,
        { mustPrecede: true }
      );
      dependencies.push(dependency.entityId);
    }
    if (dependencies.length > 256) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_argument",
        `upserts[${index}].content.dependsOn excede o limite de 256 itens após resolver o lote.`
      );
    }
    const normalized = dependencies.map((value) =>
      typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : value
    );
    if (new Set(normalized).size !== normalized.length) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_argument",
        `upserts[${index}].content.dependsOn não pode repetir uma Microssequência.`
      );
    }
    content.dependsOn = dependencies;
    delete content.dependsOnUpsertIndexes;
  }
}

function resolveStudyUnitIndexes(values, upserts, label) {
  if (!Array.isArray(values)) return;
  for (const [index, value] of values.entries()) {
    if (!isObject(value)) continue;
    requireExactlyOneReference(
      value,
      "studyUnitId",
      "studyUnitUpsertIndex",
      `${label}[${index}]`
    );
    if (value.studyUnitUpsertIndex == null) continue;
    const upsertIndex = value.studyUnitUpsertIndex;
    const entity = Number.isSafeInteger(upsertIndex) ? upserts[upsertIndex] : null;
    if (upsertIndex < 0 || upsertIndex >= upserts.length ||
        !isObject(entity) || entity.entityType !== "study_unit" ||
        typeof entity.entityId !== "string") {
      throw new AuthoringApiError(
        422,
        "invalid_tool_argument",
        `${label}[${index}].studyUnitUpsertIndex não referencia uma Unidade do mesmo lote.`
      );
    }
    if (value.studyUnitId == null) value.studyUnitId = entity.entityId;
    delete value.studyUnitUpsertIndex;
  }
}

async function fillComposition(raw, context) {
  const upserts = await fillCourseEntities(raw.upserts, context, "composition");
  resolveStudyUnitIndexes(
    raw.sourceAttributionApplications,
    upserts,
    "sourceAttributionApplications"
  );
}

async function fillMaterialization(command, context) {
  if (!isObject(command)) return;
  if (command.operation === "start") {
    await fillUuid(command, "materializationId", context, "materialization");
    if (Array.isArray(command.steps)) {
      await Promise.all(command.steps.map((step, index) =>
        fillUuid(step, "id", context, `materialization.step.${index}`)
      ));
    }
    return;
  }
  if (["record_step", "finish"].includes(command.operation)) {
    requireExistingIdentity(
      command,
      "materializationId",
      "materializationCommand.materializationId"
    );
  }
  if (command.operation !== "record_step" || !isObject(command.entityChanges)) return;
  const upserts = await fillCourseEntities(
    command.entityChanges.upserts,
    context,
    "materialization.entityChanges"
  );
  resolveStudyUnitIndexes(
    command.designApplication?.studyUnits,
    upserts,
    "materializationCommand.designApplication.studyUnits"
  );
  resolveStudyUnitIndexes(
    command.sourceAttributionApplication?.studyUnits,
    upserts,
    "materializationCommand.sourceAttributionApplication.studyUnits"
  );
}

/**
 * Completa somente identidades de entidades novas. O material de derivação usa
 * requestId e slots estruturais, portanto um replay recebe exatamente o mesmo
 * payload canônico. Identidades presentes continuam sendo tratadas como refs de
 * entidades já conhecidas pelo chamador.
 */
export async function withTrustedCreationIdentities(name, rawArguments) {
  if (name !== "alterarCurso" || !isObject(rawArguments) ||
      typeof rawArguments.requestId !== "string" ||
      typeof rawArguments.courseId !== "string" ||
      typeof rawArguments.operation !== "string") {
    return rawArguments;
  }
  validateHydrationBounds(rawArguments);
  const raw = structuredClone(rawArguments);
  const context = {
    requestId: raw.requestId,
    courseId: raw.courseId,
    operation: raw.operation
  };

  if (raw.operation === "update_instructional_plan" && isObject(raw.planCommand)) {
    if (raw.planCommand.type === "add_plan_item") {
      await fillUuid(raw.planCommand, "id", context, `plan-item.${raw.planCommand.kind || "unknown"}`);
    } else if (raw.planCommand.type === "add_part") {
      await fillUuid(raw.planCommand, "id", context, "part");
    } else if (raw.planCommand.type === "split_part") {
      await fillUuid(raw.planCommand, "newPartId", context, "split-part");
    }
  } else if (raw.operation === "update_course_sources" && isObject(raw.sourceCommand)) {
    if (raw.sourceCommand.type === "save_source" && raw.sourceCommand.expectedSourceRevision === 0) {
      await fillUuid(raw.sourceCommand, "sourceId", context, "source");
    } else if (raw.sourceCommand.type === "save_source" &&
        Number.isSafeInteger(raw.sourceCommand.expectedSourceRevision) &&
        raw.sourceCommand.expectedSourceRevision > 0) {
      requireExistingIdentity(raw.sourceCommand, "sourceId", "sourceCommand.sourceId");
    } else if (raw.sourceCommand.type === "save_anchor") {
      if (raw.sourceCommand.expectedAnchorRevision === 0) {
        await fillUuid(raw.sourceCommand, "anchorId", context, "source-anchor");
      } else if (Number.isSafeInteger(raw.sourceCommand.expectedAnchorRevision) &&
          raw.sourceCommand.expectedAnchorRevision > 0) {
        requireExistingIdentity(raw.sourceCommand, "anchorId", "sourceCommand.anchorId");
      }
    }
  } else if (raw.operation === "update_anchored_annotations" &&
      raw.annotationCommand?.type === "create_anchored_annotation") {
    await fillUuid(raw.annotationCommand, "annotationId", context, "anchored-annotation");
  } else if (raw.operation === "update_audit_cycle") {
    await fillAuditCommand(raw.auditCommand, context);
  } else if (raw.operation === "update_course_variants" &&
      raw.variantCommand?.type === "create_comparison_variants") {
    await fillUuid(raw.variantCommand, "comparisonSetId", context, "variant-comparison");
  } else if (raw.operation === "commit_course_composition") {
    await fillComposition(raw, context);
  } else if (raw.operation === "advance_part_materialization") {
    await fillMaterialization(raw.materializationCommand, context);
  }
  return raw;
}
