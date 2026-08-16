import {
  DESIGN_PARAMETER_CATALOG
} from "./instructionalDesignContracts.js";
import {
  assertInstructionalDesignPersistenceSafety,
  deepFreezeInstructionalDesignValue,
  normalizeResourceSet
} from "./instructionalDesignValidation.js";

export const INSTRUCTIONAL_EXPERIMENT_MODEL_VERSION = "1.0.0";
export const INSTRUCTIONAL_EXPERIMENT_PROTOCOL_CONTRACT =
  "InstructionalExperimentProtocol@1";
export const EXPERIMENT_ASSIGNMENT_ALGORITHMS = Object.freeze({
  seededRandom: "sha256-first-64-modulo@1",
  balancedSimple: "least-count-stable-condition-order@1"
});
export const EXPERIMENT_FACTUAL_DIFF_ALGORITHM_REF = Object.freeze({
  id: "canonical-json-pointer-fnv1a64-diff",
  version: "2.0.0"
});
export const EXPERIMENT_DIFFERENCE_CLASSIFICATIONS = Object.freeze([
  "directly_required",
  "inevitable_derived",
  "accidental_unplanned"
]);
export const EXPERIMENT_FREEZE_POLICY = Object.freeze({
  collectionMutation: "forbidden",
  correction: "new_variant_revision",
  participantContinuation: "explicit_decision"
});

const FACTOR_KINDS = new Set(["parameter", "resource_set"]);
const ASSIGNMENT_RULES = new Set(["manual", "seeded_random", "balanced_simple"]);
const INVARIANT_KINDS = new Set(["sources", "targets", "analysis", "structure"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SEMVER_PATTERN = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const SCOPE_KINDS = new Set([
  "course", "lesson", "microsequence"
]);
const SCOPE_DEPTH = Object.freeze({
  workspace: 0,
  course: 1,
  module: 2,
  lesson: 3,
  microsequence: 4
});
const FROZEN_PIN_FIELDS = Object.freeze([
  "microsequenceRef",
  "contentArtifactHash",
  "designSnapshotRef",
  "materializationManifestRef",
  "auditRunRef",
  "differenceReviewRef"
]);

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [
    key,
    stableValue(value[key])
  ]));
}

function fingerprint(value) {
  return JSON.stringify(stableValue(value));
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function deterministicDifferenceId(difference) {
  return `h-${fnv1a64(fingerprint({
    kind: difference.kind,
    path: difference.path,
    before: difference.before,
    after: difference.after
  }))}`;
}

function pushError(errors, path, message, code) {
  errors.push({ path, message, code });
}

function closedObject(errors, value, path, fields, required = fields) {
  if (!plainObject(value)) {
    pushError(errors, path, "Precisa ser um objeto.", "invalid_experiment_object");
    return false;
  }
  const allowed = new Set(fields);
  Object.keys(value).filter((key) => !allowed.has(key)).forEach((key) => {
    pushError(
      errors,
      `${path}.${key}`,
      "Campo desconhecido.",
      "unknown_experiment_field"
    );
  });
  required.filter((key) => !Object.hasOwn(value, key)).forEach((key) => {
    pushError(
      errors,
      `${path}.${key}`,
      "Campo obrigatório ausente.",
      "missing_experiment_field"
    );
  });
  return true;
}

function requireText(errors, value, path, maximum = 2_000) {
  if (!text(value) || value !== value.trim() || value.length > maximum) {
    pushError(errors, path, "Texto ausente, não canônico ou longo demais.", "invalid_text");
    return "";
  }
  return value;
}

function validateVersionedRef(errors, value, path, { semver = false } = {}) {
  if (!closedObject(errors, value, path, ["id", "version"])) return null;
  const id = requireText(errors, value.id, `${path}.id`, 240);
  const version = requireText(errors, value.version, `${path}.version`, 80);
  if (semver && version && !SEMVER_PATTERN.test(version)) {
    pushError(errors, `${path}.version`, "Versão semântica inválida.", "invalid_version");
  }
  return id && version ? { id, version } : null;
}

function refKey(value) {
  return `${text(value?.id)}@${text(value?.version)}`;
}

function validateScope(errors, value, path) {
  if (!closedObject(errors, value, path, ["kind", "ref"])) return null;
  if (!SCOPE_KINDS.has(value.kind)) {
    pushError(errors, `${path}.kind`, "Escopo inválido.", "invalid_experiment_scope");
  }
  requireText(errors, value.ref, `${path}.ref`, 240);
  return errors.length ? null : value;
}

function validateStringList(errors, value, path, { minimum = 0, maximum = 128 } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    pushError(
      errors,
      path,
      `Precisa conter entre ${minimum} e ${maximum} itens.`,
      "invalid_experiment_list"
    );
    return [];
  }
  value.forEach((entry, index) => requireText(errors, entry, `${path}[${index}]`, 500));
  if (new Set(value).size !== value.length) {
    pushError(errors, path, "A lista precisa ser única.", "duplicate_experiment_value");
  }
  return value;
}

function validateRefList(errors, value, path, maximum = 128) {
  if (!Array.isArray(value) || value.length > maximum) {
    pushError(errors, path, `Precisa conter no máximo ${maximum} referências.`, "invalid_experiment_list");
    return [];
  }
  value.forEach((entry, index) => validateVersionedRef(errors, entry, `${path}[${index}]`));
  const keys = value.map(refKey);
  if (new Set(keys).size !== keys.length) {
    pushError(errors, path, "Referências repetidas.", "duplicate_experiment_reference");
  }
  return value;
}

function definitionMap(definitions) {
  return new Map((Array.isArray(definitions) ? definitions : []).map((definition) => [
    refKey(definition),
    definition
  ]));
}

function resourceSetMap(resourceSets, errors) {
  const result = new Map();
  (Array.isArray(resourceSets) ? resourceSets : []).forEach((raw, index) => {
    try {
      const resourceSet = normalizeResourceSet(raw);
      result.set(refKey(resourceSet), resourceSet);
    } catch (cause) {
      pushError(
        errors,
        `$.resourceSets[${index}]`,
        cause instanceof Error ? cause.message : "ResourceSet inválido.",
        "invalid_experiment_resource_set"
      );
    }
  });
  return result;
}

function validateParameterValue(errors, definition, value, path) {
  if (!plainObject(value) || !text(value.kind)) {
    pushError(errors, path, "Valor de parâmetro inválido.", "invalid_experiment_factor_value");
    return;
  }
  if (value.kind !== definition.valueType) {
    pushError(
      errors,
      `${path}.kind`,
      `O parâmetro exige valor ${definition.valueType}.`,
      "experiment_factor_type_mismatch"
    );
    return;
  }
  const constraints = definition.constraints || {};
  if (value.kind === "integer") {
    closedObject(errors, value, path, ["kind", "value"]);
    if (!Number.isInteger(value.value)) {
      pushError(errors, `${path}.value`, "Precisa ser inteiro.", "invalid_experiment_factor_value");
    }
    if (typeof constraints.minimum === "number" && value.value < constraints.minimum) {
      pushError(errors, `${path}.value`, "Abaixo do mínimo do parâmetro.", "experiment_factor_out_of_range");
    }
    if (typeof constraints.maximum === "number" && value.value > constraints.maximum) {
      pushError(errors, `${path}.value`, "Acima do máximo do parâmetro.", "experiment_factor_out_of_range");
    }
    return;
  }
  if (value.kind === "range") {
    closedObject(errors, value, path, ["kind", "minimum", "maximum"]);
    if (!Number.isFinite(value.minimum) || !Number.isFinite(value.maximum)
        || value.minimum > value.maximum) {
      pushError(errors, path, "Intervalo inválido.", "invalid_experiment_factor_value");
    }
    if (typeof constraints.minimum === "number" && value.minimum < constraints.minimum) {
      pushError(errors, `${path}.minimum`, "Abaixo do mínimo do parâmetro.", "experiment_factor_out_of_range");
    }
    if (typeof constraints.maximum === "number" && value.maximum > constraints.maximum) {
      pushError(errors, `${path}.maximum`, "Acima do máximo do parâmetro.", "experiment_factor_out_of_range");
    }
    return;
  }
  if (value.kind === "enum") {
    closedObject(errors, value, path, ["kind", "value"]);
    requireText(errors, value.value, `${path}.value`, 240);
    const allowed = Array.isArray(constraints.allowedEnumValues)
      ? constraints.allowedEnumValues
      : [];
    if (allowed.length && !allowed.includes(value.value)) {
      pushError(errors, `${path}.value`, "Categoria não autorizada.", "experiment_factor_out_of_range");
    }
    return;
  }
  if (value.kind === "set") {
    closedObject(errors, value, path, ["kind", "values"]);
    if (!Array.isArray(value.values) || new Set(value.values.map(fingerprint)).size !== value.values.length) {
      pushError(errors, `${path}.values`, "Conjunto inválido ou repetido.", "invalid_experiment_factor_value");
      return;
    }
    if (constraints.setItemPattern) {
      const pattern = new RegExp(constraints.setItemPattern, "u");
      value.values.forEach((entry, index) => {
        if (typeof entry !== "string" || !pattern.test(entry)) {
          pushError(
            errors,
            `${path}.values[${index}]`,
            "Item fora do contrato do conjunto.",
            "experiment_factor_out_of_range"
          );
        }
      });
    }
    return;
  }
  if (value.kind === "vector") {
    closedObject(errors, value, path, ["kind", "components"]);
    if (!Array.isArray(value.components) || value.components.length < 1) {
      pushError(errors, `${path}.components`, "Vetor vazio.", "invalid_experiment_factor_value");
      return;
    }
    const dimensions = [];
    value.components.forEach((component, index) => {
      const componentPath = `${path}.components[${index}]`;
      if (!closedObject(errors, component, componentPath, ["dimension", "value", "unit"])) return;
      dimensions.push(requireText(errors, component.dimension, `${componentPath}.dimension`, 240));
      requireText(errors, component.unit, `${componentPath}.unit`, 120);
      if (!["string", "number", "boolean"].includes(typeof component.value)
          || (typeof component.value === "number" && !Number.isFinite(component.value))) {
        pushError(errors, `${componentPath}.value`, "Componente inválido.", "invalid_experiment_factor_value");
      }
    });
    if (new Set(dimensions).size !== dimensions.length) {
      pushError(errors, `${path}.components`, "Dimensão repetida.", "duplicate_experiment_value");
    }
    return;
  }
  if (value.kind === "relation") {
    closedObject(errors, value, path, ["kind", "nodes", "edges"]);
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
      pushError(errors, path, "Relação inválida.", "invalid_experiment_factor_value");
      return;
    }
    const nodes = new Set(value.nodes);
    if (nodes.size !== value.nodes.length) {
      pushError(errors, `${path}.nodes`, "Nó repetido.", "duplicate_experiment_value");
    }
    value.edges.forEach((edge, index) => {
      const edgePath = `${path}.edges[${index}]`;
      if (!closedObject(errors, edge, edgePath, ["from", "to", "kind"])) return;
      if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
        pushError(errors, edgePath, "Aresta aponta para nó ausente.", "invalid_experiment_factor_value");
      }
      const allowedKinds = Array.isArray(constraints.relationKinds)
        ? constraints.relationKinds
        : [];
      if (allowedKinds.length && !allowedKinds.includes(edge.kind)) {
        pushError(errors, `${edgePath}.kind`, "Relação não autorizada.", "experiment_factor_out_of_range");
      }
    });
  }
}

function validateAssignmentRule(errors, value, path) {
  if (!closedObject(errors, value, path, ["rule", "seed"], ["rule"])) return;
  if (!ASSIGNMENT_RULES.has(value.rule)) {
    pushError(errors, `${path}.rule`, "Regra de atribuição inválida.", "invalid_assignment_rule");
    return;
  }
  if (value.rule === "seeded_random") {
    requireText(errors, value.seed, `${path}.seed`, 512);
  } else if (Object.hasOwn(value, "seed")) {
    pushError(errors, `${path}.seed`, "seed pertence somente a seeded_random.", "unexpected_assignment_seed");
  }
}

function canonicalProtocol(protocol) {
  const value = clone(protocol);
  value.factors.forEach((factor) => {
    factor.targets.sort((left, right) => (
      SCOPE_DEPTH[left.kind] - SCOPE_DEPTH[right.kind]
      || left.ref.localeCompare(right.ref, "en")
    ));
  });
  value.factors.sort((left, right) => left.factorId.localeCompare(right.factorId, "en"));
  value.conditions.forEach((condition) => {
    condition.values.sort((left, right) => left.factorId.localeCompare(right.factorId, "en"));
  });
  value.conditions.sort((left, right) => left.conditionId.localeCompare(right.conditionId, "en"));
  value.invariants.sort((left, right) => left.localeCompare(right, "en"));
  value.instrumentRefs.sort((left, right) => refKey(left).localeCompare(refKey(right), "en"));
  value.outcomeRefs.sort((left, right) => refKey(left).localeCompare(refKey(right), "en"));
  return value;
}

export class InstructionalExperimentValidationError extends Error {
  constructor(code, message, errors = []) {
    super(message);
    this.name = "InstructionalExperimentValidationError";
    this.code = code;
    this.errors = errors;
  }
}

export function validateInstructionalExperimentProtocol(raw, {
  definitions = DESIGN_PARAMETER_CATALOG,
  resourceSets = [],
  requireResourceSets = true,
  allowedTargets = null
} = {}) {
  const errors = [];
  try {
    assertInstructionalDesignPersistenceSafety(raw);
  } catch (cause) {
    pushError(
      errors,
      "$",
      cause instanceof Error ? cause.message : "Estado persistente inseguro.",
      "unsafe_experiment_persistence"
    );
  }
  if (!closedObject(errors, raw, "$", [
    "title", "hypothesis", "baseRef", "scope", "factors", "conditions",
    "invariants", "assignment", "consentPolicyRef", "instrumentRefs", "outcomeRefs"
  ], [
    "title", "baseRef", "scope", "factors", "conditions", "invariants",
    "assignment", "consentPolicyRef", "instrumentRefs", "outcomeRefs"
  ])) {
    return { ok: false, errors };
  }
  requireText(errors, raw.title, "$.title", 300);
  if (raw.hypothesis != null) requireText(errors, raw.hypothesis, "$.hypothesis", 2_000);
  validateVersionedRef(errors, raw.baseRef, "$.baseRef");
  validateScope(errors, raw.scope, "$.scope");
  validateStringList(errors, raw.invariants, "$.invariants", { minimum: 4, maximum: 4 });
  const invariantKinds = new Set(Array.isArray(raw.invariants) ? raw.invariants : []);
  raw.invariants?.forEach((kind, index) => {
    if (!INVARIANT_KINDS.has(kind)) {
      pushError(
        errors,
        `$.invariants[${index}]`,
        "Invariante fora do conjunto fechado.",
        "invalid_experiment_invariant"
      );
    }
  });
  INVARIANT_KINDS.forEach((kind) => {
    if (!invariantKinds.has(kind)) {
      pushError(
        errors,
        "$.invariants",
        `Invariante obrigatório ausente: ${kind}.`,
        "missing_experiment_invariant"
      );
    }
  });
  validateVersionedRef(errors, raw.consentPolicyRef, "$.consentPolicyRef");
  validateRefList(errors, raw.instrumentRefs, "$.instrumentRefs", 32);
  validateRefList(errors, raw.outcomeRefs, "$.outcomeRefs", 32);
  validateAssignmentRule(errors, raw.assignment, "$.assignment");

  if (!Array.isArray(raw.factors) || raw.factors.length < 1 || raw.factors.length > 8) {
    pushError(errors, "$.factors", "Precisa conter entre 1 e 8 fatores.", "invalid_experiment_factors");
  }
  if (!Array.isArray(raw.conditions) || raw.conditions.length < 2 || raw.conditions.length > 32) {
    pushError(errors, "$.conditions", "Precisa conter entre 2 e 32 condições explícitas.", "invalid_experiment_conditions");
  }

  const definitionsByRef = definitionMap(definitions);
  const resourceSetsByRef = resourceSetMap(resourceSets, errors);
  const allowedTargetKeys = Array.isArray(allowedTargets)
    ? new Set(allowedTargets.map((target) => `${target?.kind}:${text(target?.ref)}`))
    : null;
  const allowedTargetsByKey = new Map(
    (Array.isArray(allowedTargets) ? allowedTargets : []).map((target) => [
      `${target?.kind}:${text(target?.ref)}`,
      target
    ])
  );
  const factorsById = new Map();
  const factorTargetSlots = new Map();
  const resourceFactorTargets = [];
  (Array.isArray(raw.factors) ? raw.factors : []).forEach((factor, index) => {
    const path = `$.factors[${index}]`;
    if (!closedObject(
      errors,
      factor,
      path,
      ["factorId", "definitionRef", "kind", "targets"]
    )) return;
    const factorId = requireText(errors, factor.factorId, `${path}.factorId`, 120);
    const definitionRef = validateVersionedRef(errors, factor.definitionRef, `${path}.definitionRef`);
    if (!FACTOR_KINDS.has(factor.kind)) {
      pushError(errors, `${path}.kind`, "Tipo de fator inválido.", "invalid_experiment_factor_kind");
    }
    if (factorId && factorsById.has(factorId)) {
      pushError(errors, `${path}.factorId`, "Fator repetido.", "duplicate_experiment_factor");
    }
    const definition = definitionRef ? definitionsByRef.get(refKey(definitionRef)) : null;
    if (definitionRef && !definition) {
      pushError(errors, `${path}.definitionRef`, "Definição inexistente.", "unknown_experiment_factor_definition");
    }
    if (!Array.isArray(factor.targets)
        || factor.targets.length < 1
        || factor.targets.length > 500) {
      pushError(
        errors,
        `${path}.targets`,
        "O fator precisa afetar entre 1 e 500 alvos explícitos.",
        "invalid_experiment_factor_targets"
      );
    }
    const targetKeys = new Set();
    (Array.isArray(factor.targets) ? factor.targets : []).forEach((target, targetIndex) => {
      const targetPath = `${path}.targets[${targetIndex}]`;
      validateScope(errors, target, targetPath);
      const key = `${target?.kind}:${text(target?.ref)}`;
      if (targetKeys.has(key)) {
        pushError(errors, targetPath, "Alvo repetido.", "duplicate_experiment_factor_target");
      }
      targetKeys.add(key);
      if (factor.kind === "resource_set") {
        const targetPathValue = allowedTargetsByKey.get(key)?.entityPath;
        for (const previous of resourceFactorTargets) {
          const previousDepth = SCOPE_DEPTH[previous.target?.kind];
          const currentDepth = SCOPE_DEPTH[target?.kind];
          let overlaps = previousDepth === currentDepth
            ? previous.target?.ref === target?.ref
            : true;
          if (previousDepth !== currentDepth
              && Array.isArray(previous.entityPath)
              && Array.isArray(targetPathValue)) {
            const shorter = previous.entityPath.length <= targetPathValue.length
              ? previous.entityPath
              : targetPathValue;
            const longer = shorter === previous.entityPath
              ? targetPathValue
              : previous.entityPath;
            overlaps = shorter.every((segment, segmentIndex) => (
              segment === longer[segmentIndex]
            ));
          }
          if (overlaps) {
            pushError(
              errors,
              targetPath,
              "Fatores ResourceSet não podem ocupar alvos sobrepostos por ancestralidade.",
              "overlapping_experiment_resource_set_targets"
            );
            break;
          }
        }
        resourceFactorTargets.push({
          target,
          entityPath: targetPathValue
        });
      }
      if (definitionRef) {
        const slotKey = `${refKey(definitionRef)}|${key}`;
        const existingFactorId = factorTargetSlots.get(slotKey);
        if (existingFactorId && existingFactorId !== factorId) {
          pushError(
            errors,
            targetPath,
            "Outro fator já ocupa esta definição no mesmo alvo exato.",
            "duplicate_experiment_factor_target_slot"
          );
        } else if (factorId) {
          factorTargetSlots.set(slotKey, factorId);
        }
      }
      if (SCOPE_DEPTH[target?.kind] < SCOPE_DEPTH[raw.scope?.kind]
          || (target?.kind === raw.scope?.kind && target?.ref !== raw.scope?.ref)) {
        pushError(
          errors,
          targetPath,
          "Alvo fora do escopo declarado do protocolo.",
          "experiment_factor_target_outside_scope"
        );
      }
      if (allowedTargetKeys && !allowedTargetKeys.has(key)) {
        pushError(
          errors,
          targetPath,
          "Alvo ausente do conjunto canônico da base.",
          "experiment_factor_target_outside_base"
        );
      }
      if (definition && !definition.supportedScopes?.includes(target?.kind)) {
        pushError(
          errors,
          targetPath,
          "A definição não aceita o escopo deste alvo.",
          "experiment_factor_scope_mismatch"
        );
      }
    });
    if (factor.kind === "resource_set"
        && definitionRef?.id !== "available_resource_set_refs") {
      pushError(errors, `${path}.definitionRef`, "Fator ResourceSet precisa usar available_resource_set_refs.", "invalid_resource_set_factor");
    }
    if (factor.kind === "parameter"
        && definitionRef?.id === "available_resource_set_refs") {
      pushError(errors, `${path}.kind`, "available_resource_set_refs é fator ResourceSet.", "invalid_resource_set_factor");
    }
    if (factorId) factorsById.set(factorId, { ...factor, definition });
  });

  const conditionIds = new Set();
  const tuples = new Set();
  (Array.isArray(raw.conditions) ? raw.conditions : []).forEach((condition, index) => {
    const path = `$.conditions[${index}]`;
    if (!closedObject(errors, condition, path, ["conditionId", "label", "values"])) return;
    const conditionId = requireText(errors, condition.conditionId, `${path}.conditionId`, 120);
    requireText(errors, condition.label, `${path}.label`, 300);
    if (conditionIds.has(conditionId)) {
      pushError(errors, `${path}.conditionId`, "Condição repetida.", "duplicate_experiment_condition");
    }
    conditionIds.add(conditionId);
    if (!Array.isArray(condition.values)
        || condition.values.length !== factorsById.size) {
      pushError(
        errors,
        `${path}.values`,
        "A condição precisa declarar exatamente um valor para cada fator.",
        "incomplete_experiment_condition"
      );
      return;
    }
    const seenFactors = new Set();
    condition.values.forEach((entry, valueIndex) => {
      const valuePath = `${path}.values[${valueIndex}]`;
      if (!plainObject(entry)) {
        pushError(errors, valuePath, "Valor de condição inválido.", "invalid_experiment_condition_value");
        return;
      }
      const factorId = requireText(errors, entry.factorId, `${valuePath}.factorId`, 120);
      const factor = factorsById.get(factorId);
      if (!factor) {
        pushError(errors, `${valuePath}.factorId`, "Fator inexistente.", "unknown_experiment_factor");
        return;
      }
      if (seenFactors.has(factorId)) {
        pushError(errors, `${valuePath}.factorId`, "Fator repetido na condição.", "duplicate_experiment_factor");
      }
      seenFactors.add(factorId);
      if (factor.kind === "resource_set") {
        closedObject(errors, entry, valuePath, ["factorId", "resourceSetRef"]);
        const resourceSetRef = validateVersionedRef(
          errors,
          entry.resourceSetRef,
          `${valuePath}.resourceSetRef`
        );
        if (resourceSetRef && requireResourceSets
            && !resourceSetsByRef.has(refKey(resourceSetRef))) {
          pushError(
            errors,
            `${valuePath}.resourceSetRef`,
            "ResourceSet exato não foi fornecido ou não existe.",
            "unknown_experiment_resource_set"
            );
        } else if (resourceSetRef && resourceSetsByRef.has(refKey(resourceSetRef))) {
          const resourceSet = resourceSetsByRef.get(refKey(resourceSetRef));
          const resourceScope = resourceSet?.scope;
          const uncovered = (Array.isArray(factor.targets) ? factor.targets : []).filter(
            (target) => {
              if (resourceScope?.kind === "workspace") return false;
              if (SCOPE_DEPTH[resourceScope?.kind] > SCOPE_DEPTH[target?.kind]) return true;
              if (resourceScope?.kind === target?.kind) {
                return resourceScope?.ref !== target?.ref;
              }
              return !(
                resourceScope?.kind === raw.scope?.kind
                && resourceScope?.ref === raw.scope?.ref
              );
            }
          );
          if (uncovered.length) {
            pushError(
              errors,
              `${valuePath}.resourceSetRef`,
              "O ResourceSet precisa cobrir todos os alvos explícitos do fator.",
              "experiment_resource_set_target_subset"
            );
          }
        }
      } else {
        closedObject(errors, entry, valuePath, ["factorId", "value"]);
        if (factor.definition) {
          validateParameterValue(errors, factor.definition, entry.value, `${valuePath}.value`);
        }
      }
    });
    const tuple = fingerprint([...condition.values].sort((left, right) => (
      text(left.factorId).localeCompare(text(right.factorId), "en")
    )));
    if (tuples.has(tuple)) {
      pushError(errors, `${path}.values`, "Tupla de condição repetida.", "duplicate_experiment_condition_tuple");
    }
    tuples.add(tuple);
  });

  return errors.length
    ? { ok: false, errors }
    : { ok: true, errors: [], value: deepFreezeInstructionalDesignValue(canonicalProtocol(raw)) };
}

export function normalizeInstructionalExperimentProtocol(raw, options = {}) {
  const result = validateInstructionalExperimentProtocol(raw, options);
  if (!result.ok) {
    throw new InstructionalExperimentValidationError(
      "INVALID_INSTRUCTIONAL_EXPERIMENT_PROTOCOL",
      `Protocolo experimental inválido: ${result.errors.map(({ path, message }) => `${path} ${message}`).join(" ")}`,
      result.errors
    );
  }
  return result.value;
}

function defaultDigest(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new InstructionalExperimentValidationError(
      "EXPERIMENT_DIGEST_UNAVAILABLE",
      "SHA-256 não está disponível neste runtime."
    );
  }
  return globalThis.crypto.subtle.digest("SHA-256", bytes);
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function assignSeededExperimentCondition({
  protocolRef,
  seed,
  participantRef,
  conditionRefs,
  digest = defaultDigest
}) {
  const errors = [];
  const normalizedProtocolRef = validateVersionedRef(errors, protocolRef, "$.protocolRef");
  const normalizedSeed = requireText(errors, seed, "$.seed", 512);
  const normalizedParticipantRef = requireText(
    errors,
    participantRef,
    "$.participantRef",
    240
  );
  validateRefList(errors, conditionRefs, "$.conditionRefs", 64);
  if (!Array.isArray(conditionRefs) || conditionRefs.length < 2) {
    pushError(errors, "$.conditionRefs", "A atribuição exige ao menos duas condições.", "insufficient_experiment_conditions");
  }
  if (errors.length) {
    throw new InstructionalExperimentValidationError(
      "INVALID_SEEDED_EXPERIMENT_ASSIGNMENT",
      "A atribuição seeded é inválida.",
      errors
    );
  }
  const stableConditions = conditionRefs.map(clone).sort((left, right) => (
    left.id.localeCompare(right.id, "en")
    || left.version.localeCompare(right.version, "en")
  ));
  const encoder = new TextEncoder();
  const digestBytes = async (value) => {
    const bytes = new Uint8Array(await digest(encoder.encode(value)));
    if (bytes.byteLength !== 32) {
      throw new InstructionalExperimentValidationError(
        "INVALID_EXPERIMENT_DIGEST",
        "O digest da atribuição precisa ter 32 bytes."
      );
    }
    return bytes;
  };
  const secretHash = bytesToHex(await digestBytes(normalizedSeed));
  const secretCommitment = bytesToHex(await digestBytes(
    `aralearn-experiment-assignment-secret@1\n${secretHash}`
  ));
  const material = [
    `algorithm=${EXPERIMENT_ASSIGNMENT_ALGORITHMS.seededRandom}`,
    `secretHash=${secretHash}`,
    `protocolRef=${refKey(normalizedProtocolRef)}`,
    `participantRef=${normalizedParticipantRef}`,
    `conditionRefs=${stableConditions.map(refKey).join("\n")}`
  ].join("\n");
  const hashBytes = await digestBytes(material);
  let first64 = 0n;
  for (const value of hashBytes.slice(0, 8)) first64 = (first64 << 8n) | BigInt(value);
  const index = Number(first64 % BigInt(stableConditions.length));
  return deepFreezeInstructionalDesignValue({
    algorithm: EXPERIMENT_ASSIGNMENT_ALGORITHMS.seededRandom,
    conditionRef: stableConditions[index],
    conditionOrdinal: index + 1,
    secretCommitment,
    assignmentFingerprint: bytesToHex(hashBytes)
  });
}

function publicDiffValue(value) {
  if (value === undefined) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length <= 2_000) return clone(value);
  return {
    truncated: true,
    kind: Array.isArray(value) ? "array" : typeof value,
    size: serialized.length
  };
}

function arrayEntryIdentity(value) {
  if (!plainObject(value)) return "";
  if (text(value.packageId) && text(value.version)) {
    return `package:${value.packageId}@${value.version}`;
  }
  if (plainObject(value.ref) && text(value.ref.id) && text(value.ref.version)) {
    return `ref:${refKey(value.ref)}`;
  }
  for (const field of [
    "id", "entityId", "factorId", "conditionId", "microsequenceRef",
    "differenceId"
  ]) {
    if (text(value[field])) return `${field}:${value[field]}`;
  }
  return "";
}

function identifiableArray(left, right) {
  if ((!left.length && !right.length)
      || left.some((entry) => !arrayEntryIdentity(entry))
      || right.some((entry) => !arrayEntryIdentity(entry))) return false;
  const leftIds = left.map(arrayEntryIdentity);
  const rightIds = right.map(arrayEntryIdentity);
  return new Set(leftIds).size === leftIds.length
    && new Set(rightIds).size === rightIds.length;
}

function pushDifference(items, maximum, difference) {
  if (items.length >= maximum) {
    throw new InstructionalExperimentValidationError(
      "EXPERIMENT_DIFFERENCE_LIMIT_EXCEEDED",
      `A materialização excede o teto factual de ${maximum} hunks.`
    );
  }
  items.push(difference);
  return 1;
}

function diffValues(left, right, path, items, maximum, traversal) {
  traversal.visited += 1;
  if ((traversal.visited & 255) === 0
      && Number.isFinite(traversal.deadlineAt)
      && Date.now() >= traversal.deadlineAt) {
    throw new InstructionalExperimentValidationError(
      "EXPERIMENT_DIFFERENCE_DEADLINE_REACHED",
      "O prazo cooperativo do diff factual foi atingido."
    );
  }
  if (Object.is(left, right)) return 0;
  if (plainObject(left) && plainObject(right)) {
    let total = 0;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      total += diffValues(
        left[key],
        right[key],
        `${path}/${key.replace(/~/gu, "~0").replace(/\//gu, "~1")}`,
        items,
        maximum,
        traversal
      );
    }
    return total;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (identifiableArray(left, right)) {
      let total = 0;
      const leftById = new Map(left.map((entry) => [arrayEntryIdentity(entry), entry]));
      const rightById = new Map(right.map((entry) => [arrayEntryIdentity(entry), entry]));
      const leftOrder = [...leftById.keys()];
      const rightOrder = [...rightById.keys()];
      if (
        leftOrder.length === rightOrder.length
        && leftOrder.every((identity) => rightById.has(identity))
        && leftOrder.some((identity, index) => identity !== rightOrder[index])
      ) {
        total += pushDifference(items, maximum, {
          differenceId: `moved:${path || "/"}`,
          path: path || "/",
          kind: "moved",
          before: leftOrder,
          after: rightOrder
        });
      }
      const identities = [...new Set([...leftOrder, ...rightOrder])].sort();
      for (const identity of identities) {
        const segment = encodeURIComponent(identity).replace(/~/gu, "%7E");
        total += diffValues(
          leftById.get(identity),
          rightById.get(identity),
          `${path}/@${segment}`,
          items,
          maximum,
          traversal
        );
      }
      return total;
    }
    let total = 0;
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      total += diffValues(
        left[index],
        right[index],
        `${path}/${index}`,
        items,
        maximum,
        traversal
      );
    }
    return total;
  }
  const kind = left === undefined ? "added" : right === undefined ? "removed" : "changed";
  const differenceId = `${kind}:${path || "/"}`;
  return pushDifference(items, maximum, {
    differenceId,
    path: path || "/",
    kind,
    before: publicDiffValue(left),
    after: publicDiffValue(right)
  });
}

export function diffExperimentVariantMaterializations(base, candidate, {
  maximum = 5_000,
  baselineRef = null,
  candidateVariantRevisionRef = null,
  deadlineAt = null
} = {}) {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5_000) {
    throw new RangeError("maximum precisa ficar entre 1 e 5000.");
  }
  assertInstructionalDesignPersistenceSafety(base);
  assertInstructionalDesignPersistenceSafety(candidate);
  if ((baselineRef == null) !== (candidateVariantRevisionRef == null)) {
    throw new InstructionalExperimentValidationError(
      "INVALID_EXPERIMENT_DIFFERENCE_REFERENCE",
      "baselineRef e candidateVariantRevisionRef devem ser pinados juntos."
    );
  }
  if (baselineRef != null) {
    const errors = [];
    closedObject(errors, baselineRef, "$.baselineRef", ["kind", "ref"]);
    if (!new Set(["base", "variant_revision"]).has(baselineRef?.kind)) {
      pushError(errors, "$.baselineRef.kind", "Tipo de baseline inválido.", "invalid_difference_baseline");
    }
    validateVersionedRef(errors, baselineRef?.ref, "$.baselineRef.ref");
    validateVersionedRef(
      errors,
      candidateVariantRevisionRef,
      "$.candidateVariantRevisionRef"
    );
    if (errors.length) {
      throw new InstructionalExperimentValidationError(
        "INVALID_EXPERIMENT_DIFFERENCE_REFERENCE",
        "As referências do diff experimental são inválidas.",
        errors
      );
    }
  }
  const items = [];
  const total = diffValues(base, candidate, "", items, maximum, {
    visited: 0,
    deadlineAt
  });
  const numberedItems = items.map((item, index) => ({
    ...item,
    differenceId: deterministicDifferenceId(item),
    ordinal: index + 1
  }));
  return deepFreezeInstructionalDesignValue({
    algorithm: `${EXPERIMENT_FACTUAL_DIFF_ALGORITHM_REF.id}@${EXPERIMENT_FACTUAL_DIFF_ALGORITHM_REF.version}`,
    ...(baselineRef == null ? {} : {
      baselineRef: clone(baselineRef),
      candidateVariantRevisionRef: clone(candidateVariantRevisionRef)
    }),
    items: numberedItems,
    total,
    truncated: total > items.length
  });
}

export function normalizeExperimentDifferenceClassifications(raw, {
  allowedDifferenceRefs
} = {}) {
  const errors = [];
  const allowed = new Set(
    Array.isArray(allowedDifferenceRefs) ? allowedDifferenceRefs.map(refKey) : []
  );
  if (!Array.isArray(raw) || raw.length > 100) {
    throw new InstructionalExperimentValidationError(
      "INVALID_EXPERIMENT_DIFFERENCE_CLASSIFICATION",
      "A classificação deve conter no máximo 100 itens."
    );
  }
  const seen = new Set();
  raw.forEach((entry, index) => {
    const path = `$[${index}]`;
    if (!closedObject(errors, entry, path, [
      "differenceRef", "classification", "publicRationale", "evidenceRefs"
    ])) return;
    const differenceRef = validateVersionedRef(
      errors,
      entry.differenceRef,
      `${path}.differenceRef`
    );
    const differenceKey = refKey(differenceRef);
    if (allowed.size && !allowed.has(differenceKey)) {
      pushError(errors, `${path}.differenceRef`, "Hunk factual inexistente.", "unknown_experiment_difference");
    }
    if (seen.has(differenceKey)) {
      pushError(errors, `${path}.differenceRef`, "Hunk classificado mais de uma vez.", "duplicate_experiment_difference");
    }
    seen.add(differenceKey);
    if (!EXPERIMENT_DIFFERENCE_CLASSIFICATIONS.includes(entry.classification)) {
      pushError(errors, `${path}.classification`, "Classificação inválida.", "invalid_experiment_difference_classification");
    }
    requireText(errors, entry.publicRationale, `${path}.publicRationale`, 2_000);
    validateStringList(errors, entry.evidenceRefs, `${path}.evidenceRefs`, {
      minimum: entry.classification === "accidental_unplanned" ? 0 : 1,
      maximum: 32
    });
  });
  if (errors.length) {
    throw new InstructionalExperimentValidationError(
      "INVALID_EXPERIMENT_DIFFERENCE_CLASSIFICATION",
      "A classificação semântica do diff é inválida.",
      errors
    );
  }
  return deepFreezeInstructionalDesignValue(
    clone(raw).sort((left, right) => (
      refKey(left.differenceRef).localeCompare(refKey(right.differenceRef), "en")
    ))
  );
}

export function validateExperimentFreezeReceipt(raw) {
  const errors = [];
  if (!closedObject(errors, raw, "$", [
    "variantRevisionRef", "baseRef", "protocolRef", "conditionRef", "microsequencePins",
    "frozenAt", "policy"
  ])) {
    return { ok: false, errors };
  }
  validateVersionedRef(errors, raw.variantRevisionRef, "$.variantRevisionRef");
  validateVersionedRef(errors, raw.baseRef, "$.baseRef");
  validateVersionedRef(errors, raw.protocolRef, "$.protocolRef");
  validateVersionedRef(errors, raw.conditionRef, "$.conditionRef");
  if (!Array.isArray(raw.microsequencePins)
      || raw.microsequencePins.length < 1
      || raw.microsequencePins.length > 500) {
    pushError(
      errors,
      "$.microsequencePins",
      "O freeze precisa pinar de 1 a 500 microssequências.",
      "invalid_freeze_pins"
    );
  }
  const microsequenceRefs = [];
  (Array.isArray(raw.microsequencePins) ? raw.microsequencePins : []).forEach((pin, index) => {
    const path = `$.microsequencePins[${index}]`;
    if (!closedObject(errors, pin, path, FROZEN_PIN_FIELDS)) return;
    microsequenceRefs.push(requireText(errors, pin.microsequenceRef, `${path}.microsequenceRef`, 240));
    if (!SHA256_PATTERN.test(pin.contentArtifactHash || "")) {
      pushError(errors, `${path}.contentArtifactHash`, "Hash de conteúdo inválido.", "invalid_freeze_hash");
    }
    FROZEN_PIN_FIELDS.filter((field) => !new Set([
      "microsequenceRef", "contentArtifactHash"
    ]).has(field)).forEach((field) => {
      validateVersionedRef(errors, pin[field], `${path}.${field}`);
    });
  });
  if (new Set(microsequenceRefs).size !== microsequenceRefs.length) {
    pushError(
      errors,
      "$.microsequencePins",
      "Microssequência repetida no freeze.",
      "duplicate_freeze_pin"
    );
  }
  if (!Number.isFinite(Date.parse(raw.frozenAt || ""))) {
    pushError(errors, "$.frozenAt", "Data de freeze inválida.", "invalid_freeze_date");
  }
  if (fingerprint(raw.policy) !== fingerprint(EXPERIMENT_FREEZE_POLICY)) {
    pushError(errors, "$.policy", "Política de freeze divergente.", "invalid_freeze_policy");
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, errors: [], value: deepFreezeInstructionalDesignValue(clone(raw)) };
}

export function assertFrozenExperimentVariantUnchanged(previous, next) {
  const validatedPrevious = validateExperimentFreezeReceipt(previous);
  const validatedNext = validateExperimentFreezeReceipt(next);
  const errors = [...validatedPrevious.errors, ...validatedNext.errors];
  if (!errors.length
      && refKey(previous.variantRevisionRef) !== refKey(next.variantRevisionRef)) {
    pushError(
      errors,
      "$.variantRevisionRef",
      "A comparação exige a mesma revisão congelada.",
      "freeze_variant_mismatch"
    );
  }
  ["baseRef", "protocolRef", "conditionRef"].forEach((field) => {
    if (!errors.length && fingerprint(previous[field]) !== fingerprint(next[field])) {
      pushError(errors, `$.${field}`, "Pin congelado não pode mudar.", "frozen_variant_mutation");
    }
  });
  const canonicalPins = (value) => [...value].sort((left, right) => (
    left.microsequenceRef.localeCompare(right.microsequenceRef, "en")
  ));
  if (!errors.length && fingerprint(canonicalPins(previous.microsequencePins))
      !== fingerprint(canonicalPins(next.microsequencePins))) {
    pushError(
      errors,
      "$.microsequencePins",
      "O bundle congelado não pode mudar.",
      "frozen_variant_mutation"
    );
  }
  if (!errors.length && fingerprint(previous.policy) !== fingerprint(next.policy)) {
    pushError(errors, "$.policy", "Política congelada não pode mudar.", "frozen_variant_mutation");
  }
  if (errors.length) {
    throw new InstructionalExperimentValidationError(
      "EXPERIMENT_VARIANT_FROZEN",
      "A variante congelada é imutável; a correção exige nova revisão e decisão explícita de continuidade.",
      errors
    );
  }
  return true;
}

export function instructionalExperimentContract() {
  return {
    contract: INSTRUCTIONAL_EXPERIMENT_PROTOCOL_CONTRACT,
    modelVersion: INSTRUCTIONAL_EXPERIMENT_MODEL_VERSION,
    factorKinds: [...FACTOR_KINDS],
    scopeKinds: [...SCOPE_KINDS],
    invariantKinds: [...INVARIANT_KINDS],
    assignmentRules: [...ASSIGNMENT_RULES],
    assignmentAlgorithms: clone(EXPERIMENT_ASSIGNMENT_ALGORITHMS),
    differenceClassifications: [...EXPERIMENT_DIFFERENCE_CLASSIFICATIONS],
    freezePolicy: clone(EXPERIMENT_FREEZE_POLICY),
    boundaries: {
      conditionsAreExplicit: true,
      automaticFactorialDesign: false,
      resourceSetIsAvailabilityNotRequirement: true,
      consentPolicyRefRequired: true,
      gptCanCreateProtocol: false,
      gptCanAssignParticipant: false,
      gptCanFreeze: false
    }
  };
}
