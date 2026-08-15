import {
  normalizeEffectiveDesignSnapshot
} from "../aralearn/runtime/authoring/instructionalDesignValidation.js";
import {
  packageRefKey,
  resolveVersionedResourceSets,
  versionedRefKey
} from "../aralearn/runtime/authoring/resourceSetResolution.js";
import {
  RESOURCE_CATALOG,
  RESOURCE_PACKAGE_REGISTRY
} from "../aralearn/runtime/resources/catalog/resourceCatalog.js";
import { AuthoringApiError } from "./errors.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function ref(value) {
  return { id: text(value?.id), version: text(value?.version) };
}

function fallbackPolicy(snapshot) {
  const resolved = list(snapshot?.resolvedValues).find(({ definitionRef }) => (
    definitionRef?.id === "representation_fallback_policy"
  ));
  return resolved?.value?.kind === "enum" ? text(resolved.value.value) : "";
}

function candidateRoles({ intent, profile }) {
  const slot = text(intent?.slot);
  const cardRole = text(intent?.cardRole);
  if (slot === "response") return ["response"];
  if (slot === "content" && cardRole === "practice") return ["embedded_practice"];
  if (slot === "content" || cardRole === "theory") return ["exposition"];
  if (cardRole === "practice") {
    return profile?.slots?.includes("content")
      ? ["embedded_practice"]
      : ["response"];
  }
  return [
    ...(profile?.slots?.includes("content") ? ["exposition", "embedded_practice"] : []),
    ...(profile?.slots?.includes("response") ? ["response"] : []),
    ...(!profile?.slots?.includes("content") && !profile?.slots?.includes("response")
      ? ["exposition"]
      : [])
  ];
}

function compositionRole({ cardRole, slot }) {
  if (slot === "response") return "response";
  if (slot === "content" && cardRole === "practice") return "embedded_practice";
  return "exposition";
}

function requiredSlot(role) {
  return role === "response" ? "response" : "content";
}

function authorizeWithSet({
  fit = "",
  limitation = "",
  packageRef,
  profile,
  resourceSet,
  role,
  snapshotFallbackPolicy
}) {
  const errors = [];
  const resourceSetRef = ref(resourceSet);
  if (!resourceSet.packages.some((candidate) => (
    packageRefKey(candidate) === packageRefKey(packageRef)
  ))) {
    errors.push("O package não pertence a este ResourceSet.");
  }
  if (!profile?.slots?.includes(requiredSlot(role))) {
    errors.push(`O package não pode cumprir o papel ${role}.`);
  }
  if (fit && !resourceSet.selectionConstraints.allowedFits.includes(fit)) {
    errors.push(`O fit ${fit} não é permitido por este ResourceSet.`);
  }
  if (role === "embedded_practice"
    && resourceSet.selectionConstraints.allowEmbeddedPractice !== true) {
    errors.push("Este ResourceSet não permite prática incorporada.");
  }
  if (profile?.slots?.includes("response")
    && resourceSet.selectionConstraints.allowResponsePackages !== true) {
    errors.push("Este ResourceSet não permite packages de resposta.");
  }
  if (fit === "versatile" || fit === "substitute") {
    const policyAllowsFit = snapshotFallbackPolicy === "allow_substitute_with_limitation"
      || (fit === "versatile"
        && snapshotFallbackPolicy === "allow_versatile_with_limitation");
    if (!policyAllowsFit) {
      errors.push(
        `A política efetiva ${snapshotFallbackPolicy || "não resolvida"} bloqueia ${fit}.`
      );
    }
    if (resourceSet.selectionConstraints.onNoAdequateRepresentation !== "record_limitation") {
      errors.push(`Este ResourceSet bloqueia seleção ${fit} sem representação canônica.`);
    }
    if (!text(limitation)) {
      errors.push(`Uma seleção ${fit} precisa registrar a limitação de representação.`);
    }
  }
  return {
    allowed: errors.length === 0,
    authorizedByResourceSetRef: resourceSetRef,
    errors
  };
}

function authorizerFor({
  fit = "",
  limitation = "",
  packageRef,
  profile,
  resourceSets,
  roles,
  snapshotFallbackPolicy
}) {
  const denials = [];
  for (const role of roles) {
    for (const resourceSet of resourceSets) {
      const authorization = authorizeWithSet({
        fit,
        limitation,
        packageRef,
        profile,
        resourceSet,
        role,
        snapshotFallbackPolicy
      });
      if (authorization.allowed) return { ...authorization, role };
      denials.push(...authorization.errors);
    }
  }
  return {
    allowed: false,
    authorizedByResourceSetRef: null,
    errors: [...new Set(denials.length
      ? denials
      : ["Nenhum ResourceSet efetivo autoriza este package."])]
  };
}

export function legacyResourceCatalogAccess({ catalog = RESOURCE_CATALOG } = {}) {
  return Object.freeze({
    availability: Object.freeze({
      mode: "legacy_unrestricted",
      snapshotRef: null,
      resourceSetRefs: Object.freeze([])
    }),
    catalog
  });
}

export function createRestrictedResourceCatalogAccess({
  effectiveSnapshot: rawEffectiveSnapshot,
  resourceSets,
  catalog = RESOURCE_CATALOG,
  packageRegistry = RESOURCE_PACKAGE_REGISTRY
} = {}) {
  let effectiveSnapshot;
  try {
    effectiveSnapshot = normalizeEffectiveDesignSnapshot(rawEffectiveSnapshot);
  } catch (cause) {
    throw new AuthoringApiError(
      409,
      "invalid_effective_design_snapshot",
      cause instanceof Error ? cause.message : "O snapshot efetivo é inválido."
    );
  }
  const resolved = resolveVersionedResourceSets({
    refs: effectiveSnapshot.resourceSetRefs,
    resourceSets,
    expectedCatalogVersion: catalog.catalogVersion,
    packageRegistry,
    resolutionPath: effectiveSnapshot.resolutionPath
  });
  if (!resolved.ok) {
    throw new AuthoringApiError(
      409,
      "invalid_effective_resource_sets",
      resolved.errors.map(({ message }) => message).join(" ")
    );
  }
  const effectiveSets = resolved.resourceSets;
  const packageRefs = [...new Map(resolved.availability.map(({ package: packageRef }) => [
    packageRefKey(packageRef),
    packageRef
  ])).values()];
  const snapshotFallbackPolicy = fallbackPolicy(effectiveSnapshot);
  const restrictedCatalog = catalog.restrict({
    packageRefs,
    authorizeCandidate({ candidate, intent, profile }) {
      const limitation = candidate.fit === "canonical" ? "" : candidate.reason;
      const authorization = authorizerFor({
        fit: candidate.fit,
        limitation,
        packageRef: {
          packageId: candidate.packageId,
          version: candidate.version
        },
        profile,
        resourceSets: effectiveSets,
        roles: candidateRoles({ intent, profile }),
        snapshotFallbackPolicy
      });
      if (!authorization.allowed) return null;
      return {
        authorizedByResourceSetRef: authorization.authorizedByResourceSetRef,
        limitations: candidate.fit === "canonical" ? [] : [limitation]
      };
    },
    authorizeComposition({ cardRole, fit, limitation, packageRef, profile, slot }) {
      return authorizerFor({
        fit,
        limitation,
        packageRef,
        profile,
        resourceSets: effectiveSets,
        roles: [compositionRole({ cardRole, slot })],
        snapshotFallbackPolicy
      });
    }
  });
  return Object.freeze({
    availability: Object.freeze({
      mode: "resource_set_restricted",
      snapshotRef: Object.freeze(ref(effectiveSnapshot)),
      resourceSetRefs: Object.freeze(effectiveSnapshot.resourceSetRefs.map((value) => (
        Object.freeze(ref(value))
      )))
    }),
    catalog: restrictedCatalog
  });
}

export async function resolveResourceCatalogAccess({
  adapter,
  principal,
  workspaceId = "",
  snapshotRef = null,
  deadlineAt = null,
  catalog = RESOURCE_CATALOG,
  packageRegistry = RESOURCE_PACKAGE_REGISTRY
} = {}) {
  const normalizedWorkspaceId = text(workspaceId);
  const normalizedSnapshotRef = ref(snapshotRef);
  const hasWorkspace = Boolean(normalizedWorkspaceId);
  const hasSnapshot = Boolean(normalizedSnapshotRef.id && normalizedSnapshotRef.version);
  if (hasWorkspace !== hasSnapshot) {
    throw new AuthoringApiError(
      422,
      "incomplete_resource_catalog_context",
      "workspaceId e snapshotRef precisam ser informados juntos."
    );
  }
  if (!hasWorkspace) return legacyResourceCatalogAccess({ catalog });
  if (typeof adapter?.getAuthoringEffectiveDesignSnapshot !== "function"
    || typeof adapter?.getAuthoringResourceSet !== "function"
    || typeof adapter?.getAuthoringDesignState !== "function") {
    throw new AuthoringApiError(
      500,
      "resource_catalog_context_unavailable",
      "O backend não oferece a leitura confiável do desenho instrucional."
    );
  }
  const effectiveSnapshot = await adapter.getAuthoringEffectiveDesignSnapshot({
    principal,
    workspaceId: normalizedWorkspaceId,
    snapshotRef: normalizedSnapshotRef,
    deadlineAt
  });
  if (versionedRefKey(effectiveSnapshot) !== versionedRefKey(normalizedSnapshotRef)) {
    throw new AuthoringApiError(
      409,
      "effective_snapshot_identity_mismatch",
      "O snapshot devolvido pelo backend não corresponde à referência solicitada."
    );
  }
  if (effectiveSnapshot?.scope?.kind !== "microsequence"
    || !text(effectiveSnapshot?.scope?.ref)) {
    throw new AuthoringApiError(
      409,
      "effective_snapshot_not_current",
      "Somente o snapshot corrente de uma microssequência pode restringir a materialização."
    );
  }
  const currentState = await adapter.getAuthoringDesignState({
    principal,
    workspaceId: normalizedWorkspaceId,
    scopeKind: "microsequence",
    scopeRef: effectiveSnapshot.scope.ref,
    deadlineAt
  });
  if (currentState?.effectiveDesignState !== "resolved"
    || versionedRefKey(currentState.effectiveSnapshot)
      !== versionedRefKey(normalizedSnapshotRef)) {
    throw new AuthoringApiError(
      409,
      "effective_snapshot_not_current",
      "O snapshot informado não é o snapshot efetivo corrente da microssequência."
    );
  }
  const resourceSets = await Promise.all(list(effectiveSnapshot.resourceSetRefs).map(
    (resourceSetRef) => adapter.getAuthoringResourceSet({
      principal,
      workspaceId: normalizedWorkspaceId,
      resourceSetRef: ref(resourceSetRef),
      deadlineAt
    })
  ));
  return createRestrictedResourceCatalogAccess({
    effectiveSnapshot,
    resourceSets,
    catalog,
    packageRegistry
  });
}
