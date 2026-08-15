import {
  InstructionalDesignValidationError,
  deepFreezeInstructionalDesignValue,
  normalizeEffectiveDesignSnapshot,
  normalizeMaterializationManifest,
  normalizeResourceSet
} from "./instructionalDesignValidation.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function versionedRefKey(value) {
  return JSON.stringify([text(value?.id), text(value?.version)]);
}

export function packageRefKey(value) {
  return JSON.stringify([text(value?.packageId), text(value?.version)]);
}

function referenceFromKey(value) {
  const normalized = text(value);
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return null;
  return {
    id: normalized.slice(0, separator),
    version: normalized.slice(separator + 1)
  };
}

export function resourceSetRefsFromParameterValue(value) {
  if (value?.kind !== "set") return [];
  return list(value.values).map(referenceFromKey).filter(Boolean);
}

function error(code, message, details = {}) {
  return { code, message, ...details };
}

function scopeKey(value) {
  return `${text(value?.kind)}:${text(value?.ref)}`;
}

function validateEffectiveSnapshotPath(snapshot) {
  const scopeOrder = ["workspace", "course", "module", "lesson", "microsequence"];
  const targetIndex = scopeOrder.indexOf(snapshot?.scope?.kind);
  const expectedKinds = targetIndex >= 0 ? scopeOrder.slice(0, targetIndex + 1) : [];
  const path = list(snapshot?.resolutionPath);
  const pathKeys = new Set(path.map(scopeKey));
  const valid = JSON.stringify(path.map(({ kind }) => kind)) === JSON.stringify(expectedKinds)
    && scopeKey(path.at(-1)) === scopeKey(snapshot?.scope)
    && pathKeys.size === path.length
    && list(snapshot?.resolvedValues).every(({ resolution }) => (
      pathKeys.has(scopeKey(resolution?.sourceScope))
    ));
  return valid ? null : error(
    "invalid_effective_snapshot_path",
    "O caminho do snapshot não termina no escopo efetivo ou contém origem inválida."
  );
}

function requiredSlotForRole(role) {
  if (role === "response") return "response";
  if (["exposition", "embedded_practice"].includes(role)) return "content";
  return "";
}

function effectiveRepresentationFallbackPolicy(snapshot) {
  const resolved = list(snapshot?.resolvedValues).find(({ definitionRef }) => (
    definitionRef?.id === "representation_fallback_policy"
  ));
  return resolved?.value?.kind === "enum" ? text(resolved.value.value) : "";
}

export function resolveVersionedResourceSets({
  refs,
  resourceSets,
  expectedCatalogVersion = null,
  packageRegistry = null,
  resolutionPath = null
} = {}) {
  const errors = [];
  if (!Array.isArray(refs) || !Array.isArray(resourceSets)) {
    return {
      ok: false,
      errors: [error(
        "invalid_resource_set_collection",
        "Referências e ResourceSets precisam ser listas explícitas."
      )],
      resourceSets: deepFreezeInstructionalDesignValue([]),
      availability: deepFreezeInstructionalDesignValue([])
    };
  }
  const requestedRefs = list(refs);
  const requestedKeys = requestedRefs.map(versionedRefKey);
  const requestedKeySet = new Set(requestedKeys);
  if (requestedKeySet.size !== requestedKeys.length) {
    errors.push(error("duplicate_resource_set_ref", "A lista efetiva repete ResourceSet."));
  }
  const normalizedSets = [];
  list(resourceSets).forEach((resourceSet, index) => {
    if (!requestedKeySet.has(versionedRefKey(resourceSet))) return;
    try {
      normalizedSets.push(normalizeResourceSet(resourceSet));
    } catch (cause) {
      errors.push(error(
        "invalid_resource_set",
        `ResourceSet na posição ${index} é inválido.`,
        { cause }
      ));
    }
  });
  const setsByRef = new Map();
  normalizedSets.forEach((resourceSet) => {
    const key = versionedRefKey(resourceSet);
    if (setsByRef.has(key)) {
      errors.push(error("duplicate_resource_set", `ResourceSet duplicado: ${key}.`, {
        resourceSetRef: key
      }));
    } else {
      setsByRef.set(key, resourceSet);
    }
  });
  if (requestedKeys.length && typeof packageRegistry?.get !== "function") {
    errors.push(error(
      "resource_package_registry_required",
      "A resolução de ResourceSet exige o registry canônico de packages."
    ));
  }
  const pathKeys = Array.isArray(resolutionPath)
    ? new Set(resolutionPath.map(scopeKey))
    : null;
  if (requestedKeys.length && !Array.isArray(resolutionPath)) {
    errors.push(error(
      "resource_set_resolution_path_required",
      "A resolução de ResourceSet exige o caminho efetivo do snapshot."
    ));
  }
  const resolved = requestedKeys.map((key) => {
    const resourceSet = setsByRef.get(key);
    if (!resourceSet) {
      errors.push(error("resource_set_not_found", `ResourceSet não encontrado: ${key}.`, {
        resourceSetRef: key
      }));
      return null;
    }
    if (expectedCatalogVersion && resourceSet.resolvedCatalogVersion !== expectedCatalogVersion) {
      errors.push(error(
        "resource_catalog_version_mismatch",
        `ResourceSet ${key} foi resolvido com catálogo incompatível.`,
        { resourceSetRef: key }
      ));
    }
    if (resourceSet.resolvedCatalogVersion !== resourceSet.facetBasis.catalogVersion) {
      errors.push(error(
        "resource_catalog_provenance_mismatch",
        `ResourceSet ${key} diverge entre catálogo resolvido e facetas.`,
        { resourceSetRef: key }
      ));
    }
    if (pathKeys && !pathKeys.has(scopeKey(resourceSet.scope))) {
      errors.push(error(
        "resource_set_outside_resolution_path",
        `ResourceSet ${key} não pertence ao caminho efetivo do snapshot.`,
        { resourceSetRef: key }
      ));
    }
    if (typeof packageRegistry?.get === "function") {
      resourceSet.packages.forEach((packageRef) => {
        if (!packageRegistry.get(packageRef.packageId, packageRef.version)) {
          errors.push(error(
            "resource_package_not_installed",
            `ResourceSet ${key} referencia package indisponível: ${packageRefKey(packageRef)}.`,
            { resourceSetRef: key, packageRef: packageRefKey(packageRef) }
          ));
        }
      });
    }
    return resourceSet;
  }).filter(Boolean);
  const availability = resolved.flatMap((resourceSet) => (
    resourceSet.packages.map((packageRef) => ({
      resourceSetRef: { id: resourceSet.id, version: resourceSet.version },
      package: structuredClone(packageRef)
    }))
  ));
  if (errors.length) {
    return {
      ok: false,
      errors,
      resourceSets: deepFreezeInstructionalDesignValue([]),
      availability: deepFreezeInstructionalDesignValue([])
    };
  }
  return {
    ok: true,
    errors,
    resourceSets: deepFreezeInstructionalDesignValue(resolved),
    availability: deepFreezeInstructionalDesignValue(availability)
  };
}

function authorizeAgainstResolved({
  selection,
  snapshotKeys,
  resolved,
  packageRegistry,
  effectiveSnapshot
}) {
  const errors = [];
  const authorizerKey = versionedRefKey(selection?.authorizedByResourceSetRef);
  if (!snapshotKeys.has(authorizerKey)) {
    errors.push(error(
      "resource_set_not_in_snapshot",
      `A seleção referencia ResourceSet ausente do snapshot: ${authorizerKey}.`
    ));
  }
  const authorizer = resolved.resourceSets.find((resourceSet) => (
    versionedRefKey(resourceSet) === authorizerKey
  ));
  if (!authorizer) return { ok: false, errors, resourceSet: null };

  const packageKey = packageRefKey(selection?.package);
  if (!authorizer.packages.some((candidate) => packageRefKey(candidate) === packageKey)) {
    errors.push(error(
      "package_not_in_authorizing_resource_set",
      `Package ${packageKey} não pertence ao ResourceSet autorizador ${authorizerKey}.`
    ));
  }
  const packageDefinition = packageRegistry?.get?.(
    selection?.package?.packageId,
    selection?.package?.version
  );
  const requiredSlot = requiredSlotForRole(selection?.role);
  if (!requiredSlot || !packageDefinition?.manifest?.slots?.includes(requiredSlot)) {
    errors.push(error(
      "package_role_mismatch",
      `Package ${packageKey} não pode cumprir o papel ${text(selection?.role)}.`
    ));
  }
  if (!authorizer.selectionConstraints.allowedFits.includes(selection?.fit)) {
    errors.push(error(
      "fit_not_allowed_by_resource_set",
      `Fit ${selection?.fit} não é permitido pelo ResourceSet ${authorizerKey}.`
    ));
  }
  if (selection?.role === "embedded_practice"
    && authorizer.selectionConstraints.allowEmbeddedPractice !== true) {
    errors.push(error(
      "embedded_practice_not_allowed",
      `ResourceSet ${authorizerKey} não permite prática incorporada.`
    ));
  }
  if (packageDefinition?.manifest?.slots?.includes("response")
    && authorizer.selectionConstraints.allowResponsePackages !== true) {
    errors.push(error(
      "response_package_not_allowed",
      `ResourceSet ${authorizerKey} não permite response packages.`
    ));
  }
  if (selection?.fit === "substitute") {
    const fallbackPolicy = effectiveRepresentationFallbackPolicy(effectiveSnapshot);
    if (!fallbackPolicy) {
      errors.push(error(
        "representation_fallback_policy_missing",
        "O snapshot não resolve a política efetiva para representação indisponível."
      ));
    } else if (fallbackPolicy !== "allow_substitute_with_limitation") {
      errors.push(error(
        "substitute_blocked_by_effective_policy",
        `A política efetiva ${fallbackPolicy} não permite materialização substitute.`
      ));
    }
    if (authorizer.selectionConstraints.onNoAdequateRepresentation === "block") {
      errors.push(error(
        "substitute_blocked_by_resource_set",
        `ResourceSet ${authorizerKey} bloqueia materialização sem representação adequada.`
      ));
    } else if (!list(selection?.limitations).length) {
      errors.push(error(
        "substitute_without_limitation",
        "Seleção substitute precisa registrar a limitação de representação."
      ));
    }
  }
  return { ok: errors.length === 0, errors, resourceSet: authorizer };
}

export function authorizeResourceSelection({
  selection,
  effectiveSnapshot: rawEffectiveSnapshot,
  resourceSets,
  packageRegistry
} = {}) {
  let effectiveSnapshot;
  try {
    effectiveSnapshot = normalizeEffectiveDesignSnapshot(rawEffectiveSnapshot);
  } catch (cause) {
    if (cause instanceof InstructionalDesignValidationError) {
      return {
        ok: false,
        errors: [error("invalid_effective_snapshot", cause.message, { cause })],
        resourceSet: null
      };
    }
    throw cause;
  }
  const pathError = validateEffectiveSnapshotPath(effectiveSnapshot);
  if (pathError) return { ok: false, errors: [pathError], resourceSet: null };
  const snapshotKeys = new Set(effectiveSnapshot.resourceSetRefs.map(versionedRefKey));
  const resolved = resolveVersionedResourceSets({
    refs: list(effectiveSnapshot?.resourceSetRefs),
    resourceSets,
    packageRegistry,
    resolutionPath: effectiveSnapshot?.resolutionPath
  });
  if (!resolved.ok) return { ok: false, errors: resolved.errors, resourceSet: null };
  return authorizeAgainstResolved({
    selection,
    snapshotKeys,
    resolved,
    packageRegistry,
    effectiveSnapshot
  });
}

export function validateManifestResourceAuthorizations({
  effectiveSnapshot,
  materializationManifest,
  resourceSets,
  packageRegistry
} = {}) {
  let snapshot;
  let manifest;
  try {
    snapshot = normalizeEffectiveDesignSnapshot(effectiveSnapshot);
    manifest = normalizeMaterializationManifest(materializationManifest);
  } catch (cause) {
    if (cause instanceof InstructionalDesignValidationError) {
      return { ok: false, errors: [error("invalid_contract", cause.message, { cause })] };
    }
    throw cause;
  }
  const errors = [];
  const snapshotPathError = validateEffectiveSnapshotPath(snapshot);
  if (snapshotPathError) errors.push(snapshotPathError);
  if (versionedRefKey(manifest.analysisRef) !== versionedRefKey(snapshot.analysisRef)) {
    errors.push(error(
      "manifest_analysis_snapshot_mismatch",
      "Manifesto e snapshot precisam referenciar exatamente a mesma análise."
    ));
  }
  if (versionedRefKey(manifest.effectiveSnapshotRef) !== versionedRefKey(snapshot)) {
    errors.push(error(
      "manifest_effective_snapshot_mismatch",
      "O manifesto não pertence ao snapshot efetivo informado."
    ));
  }
  if (scopeKey(manifest.scope) !== scopeKey(snapshot.scope)) {
    errors.push(error(
      "manifest_snapshot_scope_mismatch",
      "Manifesto e snapshot precisam pertencer ao mesmo escopo."
    ));
  }
  const snapshotKeys = snapshot.resourceSetRefs.map(versionedRefKey).sort();
  const manifestKeys = manifest.resourceSetRefs.map(versionedRefKey).sort();
  if (JSON.stringify(snapshotKeys) !== JSON.stringify(manifestKeys)) {
    errors.push(error(
      "resource_set_snapshot_manifest_mismatch",
      "Snapshot e manifesto precisam referenciar exatamente os mesmos ResourceSets."
    ));
  }
  const resolved = resolveVersionedResourceSets({
    refs: snapshot.resourceSetRefs,
    resourceSets,
    packageRegistry,
    resolutionPath: snapshot.resolutionPath
  });
  errors.push(...resolved.errors);
  const snapshotKeySet = new Set(snapshotKeys);
  manifest.resourceSelections.forEach((selection, index) => {
    const authorization = resolved.ok ? authorizeAgainstResolved({
      selection,
      snapshotKeys: snapshotKeySet,
      resolved,
      packageRegistry,
      effectiveSnapshot: snapshot
    }) : { errors: [] };
    authorization.errors.forEach((entry) => errors.push({ ...entry, selectionIndex: index }));
  });
  const selections = new Map(manifest.resourceSelections.map((selection) => [selection.id, selection]));
  manifest.materializedResources.forEach((materialized, index) => {
    const selection = selections.get(materialized.selectionRef);
    if (!selection) {
      errors.push(error(
        "materialized_resource_without_selection",
        `Resource materializado ${materialized.id} não possui seleção correspondente.`,
        { materializedIndex: index }
      ));
    } else if (packageRefKey(selection.package) !== packageRefKey(materialized.package)
      || selection.role !== materialized.role) {
      errors.push(error(
        "materialized_resource_selection_mismatch",
        `Resource materializado ${materialized.id} diverge da seleção autorizada.`,
        { materializedIndex: index }
      ));
    }
  });
  return { ok: errors.length === 0, errors };
}
