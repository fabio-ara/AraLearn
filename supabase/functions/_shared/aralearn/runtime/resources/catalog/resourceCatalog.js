import { validateStudyUnitEnvelope } from "../kernel/studyUnitEnvelope.js";
import { createPackageRegistry } from "../kernel/packageRegistry.js";
import { RESOURCE_PACKAGE_DEFINITIONS } from "../packages/generated.js";
import {
  inferAcademicTaxonomy,
  normalizeFacetText,
  RESOURCE_FAMILIES,
  RESOURCE_VOCABULARIES
} from "./vocabularies.js";
import { RESOURCE_SELECTION_POLICY } from "./resourcePolicy.js";

const CATALOG_CONTRACT = "aralearn.resource-library.v1";
const POLICY_VERSION = 1;
const FIT_ORDER = Object.freeze({ canonical: 3, versatile: 2, substitute: 1 });
const SEARCH_LIMIT = 8;
const INSPECT_LIMIT = 8;
const CONTRACT_LIMIT = 1;

function clone(value) {
  return structuredClone(value);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedList(value) {
  return [...new Set(list(value).map(String).map((item) => item.trim()).filter(Boolean))];
}

function tokens(value) {
  const ignored = new Set(["com", "das", "dos", "em", "para", "por", "que", "sem", "uma"]);
  return (normalizeFacetText(value).match(/[\p{L}\p{N}]{2,}/gu) || [])
    .filter((token) => token.length > 2 && !ignored.has(token));
}

function semverParts(version) {
  return String(version).split(".").map(Number);
}

function compareVersions(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function validateLimit(value, fallback, maximum, label = "limit") {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(maximum === 1
      ? `${label} precisa ser 1.`
      : `${label} precisa ficar entre 1 e ${maximum}.`);
  }
  return value;
}

function vocabularySet(field) {
  const records = field === "familyIds"
    ? RESOURCE_FAMILIES
    : RESOURCE_VOCABULARIES[
      field === "practiceModeIds" ? "practiceModes" : `${field.slice(0, -3)}s`
    ];
  return new Set((records || []).map(({ id }) => id));
}

function validatedFacetIds(field, value) {
  const ids = normalizedList(value);
  const allowed = vocabularySet(field);
  const unknown = ids.find((id) => !allowed.has(id));
  if (unknown) throw new RangeError(`${field} contém identificador desconhecido: ${unknown}.`);
  return ids;
}

function latestProfile(profiles, packageId) {
  return profiles
    .filter((profile) => profile.packageId === packageId)
    .sort((left, right) => compareVersions(right.version, left.version))[0] || null;
}

function requestIdentity(request) {
  if (typeof request === "string") return { packageId: request, version: "" };
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { packageId: "", version: "" };
  }
  return {
    packageId: String(request.packageId || "").trim(),
    version: String(request.version || "").trim()
  };
}

function overlap(requested, available) {
  const availableSet = new Set(available);
  return requested.filter((id) => availableSet.has(id));
}

function publicProfile(manifest) {
  const taxonomy = inferAcademicTaxonomy({
    domains: manifest.academic.domains,
    knowledgeObjects: manifest.academic.knowledgeObjects,
    conventions: manifest.academic.conventions,
    taskOperations: manifest.taskOperations,
    practiceModes: manifest.academic.practiceModes,
    taxonomy: manifest.academic.taxonomy
  });
  return Object.freeze({
    packageId: manifest.id,
    version: manifest.version,
    label: manifest.label,
    purpose: manifest.purpose,
    slots: Object.freeze([...manifest.slots]),
    ...(manifest.tool ? { tool: Object.freeze({ ...manifest.tool }) } : {}),
    primaryFamilyId: taxonomy.primaryFamilyId,
    familyIds: Object.freeze([...taxonomy.familyIds]),
    disciplineIds: Object.freeze([...taxonomy.disciplineIds]),
    structureIds: Object.freeze([...taxonomy.structureIds]),
    taskOperationIds: Object.freeze([...taxonomy.taskOperationIds]),
    practiceModeIds: Object.freeze([...taxonomy.practiceModeIds]),
    specificity: taxonomy.specificity,
    taskOperations: Object.freeze([...manifest.taskOperations]),
    knowledgeObjects: Object.freeze([...manifest.academic.knowledgeObjects]),
    conventions: Object.freeze([...manifest.academic.conventions]),
    useWhen: Object.freeze([...manifest.academic.appropriateWhen]),
    avoidWhen: Object.freeze([...manifest.academic.avoidWhen]),
    responseCompatibility: Object.freeze([...(manifest.responseCompatibility || [])]),
    limitations: Object.freeze([...(manifest.limitations || [])]),
    accessibility: manifest.accessibility || ""
  });
}

function facetRecords(records, profiles, field) {
  return records.map((record) => ({
    ...record,
    count: profiles.filter((profile) => profile[field].includes(record.id)).length
  })).filter(({ count }) => count > 0);
}

function searchText(profile) {
  return normalizeFacetText([
    profile.packageId,
    profile.label,
    profile.purpose,
    ...profile.taskOperations,
    ...profile.knowledgeObjects,
    ...profile.conventions,
    ...profile.useWhen
  ].join(" "));
}

function avoidanceText(profile) {
  return normalizeFacetText(profile.avoidWhen.join(" "));
}

function searchCandidate(profile, intent) {
  const matched = [];
  const missing = [];
  let score = 0;
  const facets = [
    ["discipline", intent.disciplineIds, profile.disciplineIds, 18],
    ["structure", intent.structureIds, profile.structureIds, 28],
    ["taskOperation", intent.taskOperationIds, profile.taskOperationIds, 16],
    ["practice", intent.practiceModeIds, profile.practiceModeIds, 8]
  ];
  for (const [label, requested, available, weight] of facets) {
    if (!requested.length) continue;
    const hits = overlap(requested, available);
    hits.forEach((id) => matched.push(`${label}:${id}`));
    requested.filter((id) => !hits.includes(id)).forEach((id) => missing.push(`${label}:${id}`));
    score += hits.length * weight;
    score -= (requested.length - hits.length) * Math.ceil(weight / 2);
  }

  const queryTokens = tokens(intent.query);
  const haystack = searchText(profile);
  const queryHits = queryTokens.filter((token) => haystack.includes(token));
  score += queryHits.length * 4;
  if (queryTokens.length && queryHits.length === queryTokens.length) score += 12;
  if (normalizeFacetText(profile.packageId) === normalizeFacetText(intent.query)
      || normalizeFacetText(profile.label) === normalizeFacetText(intent.query)) score += 80;
  queryHits.forEach((token) => matched.push(`query:${token}`));

  const knowledgeTokens = tokens(intent.knowledgeObjects.join(" "));
  const knowledgeHits = knowledgeTokens.filter((token) => haystack.includes(token));
  score += knowledgeHits.length * 5;
  knowledgeHits.forEach((token) => matched.push(`knowledge:${token}`));

  const preservationTokens = tokens(intent.mustPreserve.join(" "));
  const preservationHits = preservationTokens.filter((token) => haystack.includes(token));
  score += preservationHits.length * 7;
  preservationTokens.filter((token) => !preservationHits.includes(token))
    .forEach((token) => missing.push(`preserve:${token}`));

  const avoid = avoidanceText(profile);
  const contraindicationHits = queryTokens.filter((token) => avoid.includes(token));
  const decisiveContraindication = intent.notationIsLearningObject &&
    contraindicationHits.length > 0;
  if (decisiveContraindication) score -= 40;

  const missingStructural = missing.some((entry) => (
    entry.startsWith("structure:") || entry.startsWith("taskOperation:")
    || entry.startsWith("practice:") || entry.startsWith("preserve:")
  ));
  const disciplineRequested = intent.disciplineIds.length > 0;
  const disciplineMatched = matched.some((entry) => entry.startsWith("discipline:"));
  const queryExact = queryTokens.length > 0 && queryHits.length === queryTokens.length;
  let fit;
  if (!missingStructural && (!disciplineRequested || disciplineMatched)
      && !decisiveContraindication
      && (intent.structureIds.length || intent.taskOperationIds.length || queryExact)) {
    fit = "canonical";
  } else if (!missingStructural && !decisiveContraindication
      && (!disciplineRequested || disciplineMatched || !intent.notationIsLearningObject)
      && (matched.length || (!intent.query && !disciplineRequested))) {
    fit = "versatile";
  } else {
    fit = "substitute";
  }
  if (decisiveContraindication) fit = "substitute";

  const reason = fit === "canonical"
    ? "Os metadados do package cobrem os sinais estruturados e lexicais informados."
    : fit === "versatile"
      ? "Os metadados cobrem sinais parciais ou transversais; isso não verifica a intenção livre."
      : "Os metadados deixam sinais estruturados ou lexicais sem cobertura; a adequação depende de avaliação.";
  return {
    packageId: profile.packageId,
    version: profile.version,
    label: profile.label,
    primaryFamilyId: profile.primaryFamilyId,
    fit,
    score,
    matched: [...new Set(matched)],
    missing: [...new Set(missing)],
    reason,
    useWhen: [...profile.useWhen],
    avoidWhen: [...profile.avoidWhen],
    responseCompatibility: [...profile.responseCompatibility]
  };
}

function normalizedIntent(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("A intenção de busca precisa ser um objeto.");
  }
  const slot = String(raw.slot || "").trim();
  if (slot && !new Set(["content", "response", "feedback"]).has(slot)) {
    throw new RangeError("slot desconhecido.");
  }
  const studyUnitRole = String(raw.studyUnitRole || "").trim();
  if (studyUnitRole && !new Set(["theory", "practice"]).has(studyUnitRole)) {
    throw new RangeError("studyUnitRole precisa ser theory ou practice.");
  }
  return {
    query: String(raw.query || "").trim(),
    slot,
    studyUnitRole,
    disciplineIds: validatedFacetIds("disciplineIds", raw.disciplineIds),
    structureIds: validatedFacetIds("structureIds", raw.structureIds),
    taskOperationIds: validatedFacetIds("taskOperationIds", raw.taskOperationIds),
    practiceModeIds: validatedFacetIds("practiceModeIds", raw.practiceModeIds),
    knowledgeObjects: normalizedList(raw.knowledgeObjects),
    mustPreserve: normalizedList(raw.mustPreserve),
    notationIsLearningObject: raw.notationIsLearningObject === true,
    limit: validateLimit(raw.limit, SEARCH_LIMIT, 32)
  };
}

function effectiveSlot(intent) {
  if (intent.slot) return intent.slot;
  return intent.studyUnitRole === "theory" ? "content" : "";
}

function rankedCandidates(profiles, rawIntent, maximumLimit = 32) {
  const intent = normalizedIntent(rawIntent);
  validateLimit(intent.limit, SEARCH_LIMIT, maximumLimit);
  const slot = effectiveSlot(intent);
  const candidates = profiles
    .filter((profile) => !slot || profile.slots.includes(slot))
    .map((profile) => searchCandidate(profile, intent))
    .sort((left, right) => (
      FIT_ORDER[right.fit] - FIT_ORDER[left.fit]
      || right.score - left.score
      || left.label.localeCompare(right.label, "pt-BR")
      || left.packageId.localeCompare(right.packageId, "en")
    ));
  return { intent, candidates };
}

function coverage(candidates, intent) {
  const best = candidates[0] || null;
  const desiredResource = intent.query || [
    ...intent.structureIds,
    ...intent.taskOperationIds,
    ...intent.knowledgeObjects
  ].join(", ") || "representação solicitada";
  if (!best) {
    return {
      status: "blocked",
      desiredResource,
      chatDisclosure: `O conjunto de resources disponível não contém uma representação autorizada para ${desiredResource}. Registre a limitação e aguarde outra decisão antes de materializar.`
    };
  }
  return {
    status: best.fit,
    desiredResource,
    chatDisclosure: best.fit === "substitute"
      ? `Usei ${best.label} como aproximação porque o catálogo instalado não contém uma representação exata para ${desiredResource}.`
      : null
  };
}

function allStudyUnitInstances(studyUnit) {
  return [
    ...list(studyUnit?.content).map((instance, index) => ({ instance, slot: "content", index })),
    ...(studyUnit?.response ? [{ instance: studyUnit.response, slot: "response", index: 0 }] : []),
    ...list(studyUnit?.feedback).map((instance, index) => ({ instance, slot: "feedback", index }))
  ];
}

export function createResourceCatalog(registry) {
  if (!registry || typeof registry.listCatalog !== "function") {
    throw new TypeError("O catálogo exige um registry de packages.");
  }
  const profiles = Object.freeze(registry.listCatalog().map(publicProfile));
  const byIdentity = new Map(profiles.map((profile) => [
    `${profile.packageId}@${profile.version}`,
    profile
  ]));
  const catalogVersion = `1-${fnv1a(JSON.stringify({
    policyVersion: POLICY_VERSION,
    policy: RESOURCE_SELECTION_POLICY,
    families: RESOURCE_FAMILIES,
    vocabularies: RESOURCE_VOCABULARIES,
    profiles: [...profiles].sort((left, right) => (
      `${left.packageId}@${left.version}`.localeCompare(
        `${right.packageId}@${right.version}`,
        "en"
      )
    ))
  }))}`;
  const representationTerms = Object.freeze([...new Set([
    ...profiles.flatMap((profile) => [
      profile.label,
      profile.packageId.split(".").at(-1)?.replaceAll("_", " ")
    ]),
    ...RESOURCE_VOCABULARIES.structures.flatMap((record) => [
      record.label,
      ...(record.aliases || [])
    ])
  ].map(normalizeFacetText).filter(Boolean))].sort((left, right) => (
    right.length - left.length || left.localeCompare(right, "pt-BR")
  )));

  function getProfile(packageId, version = "") {
    const normalizedId = String(packageId || "").trim();
    const normalizedVersion = String(version || "").trim();
    const profile = normalizedVersion
      ? byIdentity.get(`${normalizedId}@${normalizedVersion}`) || null
      : latestProfile(profiles, normalizedId);
    return profile ? clone(profile) : null;
  }

  function explore({ slot = "" } = {}) {
    if (slot && !new Set(["content", "response", "feedback"]).has(slot)) {
      throw new RangeError("slot desconhecido.");
    }
    const selected = profiles.filter((profile) => !slot || profile.slots.includes(slot));
    return {
      contract: CATALOG_CONTRACT,
      catalogVersion,
      policyVersion: POLICY_VERSION,
      policy: clone(RESOURCE_SELECTION_POLICY),
      packageCount: selected.length,
      families: RESOURCE_FAMILIES.map((family) => ({
        ...family,
        count: selected.filter(({ familyIds }) => familyIds.includes(family.id)).length
      })).filter(({ count }) => count > 0),
      facets: {
        disciplines: facetRecords(RESOURCE_VOCABULARIES.disciplines, selected, "disciplineIds"),
        structures: facetRecords(RESOURCE_VOCABULARIES.structures, selected, "structureIds"),
        taskOperations: facetRecords(
          RESOURCE_VOCABULARIES.taskOperations,
          selected,
          "taskOperationIds"
        ),
        practiceModes: facetRecords(RESOURCE_VOCABULARIES.practiceModes, selected, "practiceModeIds")
      }
    };
  }

  function search(rawIntent = {}) {
    const { intent, candidates } = rankedCandidates(profiles, rawIntent, SEARCH_LIMIT);
    return {
      contract: CATALOG_CONTRACT,
      catalogVersion,
      coverage: coverage(candidates, intent),
      candidates: candidates.slice(0, intent.limit)
    };
  }

  function inspect(requests) {
    const values = list(requests);
    validateLimit(values.length, 1, INSPECT_LIMIT, "A quantidade de packages");
    return {
      contract: CATALOG_CONTRACT,
      catalogVersion,
      items: values.map((request) => {
        const { packageId, version } = requestIdentity(request);
        const profile = getProfile(packageId, version);
        return profile
          ? { status: "ok", profile }
          : { status: "not_found", packageId, ...(version ? { version } : {}) };
      })
    };
  }

  function contracts(requests) {
    const values = list(requests);
    validateLimit(values.length, 1, CONTRACT_LIMIT, "A quantidade de contratos");
    return {
      contract: CATALOG_CONTRACT,
      catalogVersion,
      items: values.map((request) => {
        const { packageId, version } = requestIdentity(request);
        const profile = getProfile(packageId, version);
        if (!profile) return {
          status: "not_found",
          packageId,
          ...(version ? { version } : {})
        };
        return {
          status: "ok",
          packageId: profile.packageId,
          version: profile.version,
          definition: registry.getAuthoringContract(profile.packageId, profile.version)
        };
      })
    };
  }

  function validateStudyUnit(studyUnit) {
    const result = validateStudyUnitEnvelope(studyUnit, registry, "$.studyUnit");
    return {
      contract: CATALOG_CONTRACT,
      catalogVersion,
      valid: result.valid,
      errors: [...result.errors],
      composition: allStudyUnitInstances(studyUnit).map(({ instance, slot, index }) => ({
        slot,
        index,
        instanceId: String(instance?.id || ""),
        packageId: String(instance?.package || ""),
        version: String(instance?.version || "")
      }))
    };
  }

  function previewStudyUnitDescriptor(studyUnit) {
    const structural = validateStudyUnit(studyUnit);
    const accessibleText = structural.valid
      ? allStudyUnitInstances(studyUnit).map(({ instance, slot }) => (
          registry.accessibleText(instance, slot)
        )).filter(Boolean).join(" ")
      : "";
    return {
      contract: CATALOG_CONTRACT,
      catalogVersion,
      structural,
      packages: structural.composition,
      studyUnit: structural.valid ? structuredClone(studyUnit) : null,
      accessibleText,
      previewMode: structural.valid ? "client_renderer" : "unavailable"
    };
  }

  function assessCandidate(request, rawIntent = {}) {
    const { packageId, version } = requestIdentity(request);
    const profile = getProfile(packageId, version);
    if (!profile) {
      return {
        contract: CATALOG_CONTRACT,
        catalogVersion,
        status: "not_found",
        packageId,
        ...(version ? { version } : {})
      };
    }
    const { intent, candidates } = rankedCandidates([profile], {
      ...rawIntent,
      limit: 1
    });
    const candidate = candidates[0] || null;
    return {
      contract: CATALOG_CONTRACT,
      catalogVersion,
      status: candidate ? "assessed" : "incompatible_slot",
      intent,
      candidate
    };
  }


  return Object.freeze({
    contract: CATALOG_CONTRACT,
    catalogVersion,
    policyVersion: POLICY_VERSION,
    representationTerms,
    families: Object.freeze(RESOURCE_FAMILIES.map((family) => Object.freeze({ ...family }))),
    getProfile,
    explore,
    search,
    assessCandidate,
    inspect,
    contracts,
    validateStudyUnit,
    previewStudyUnitDescriptor
  });
}

export const RESOURCE_PACKAGE_REGISTRY = createPackageRegistry(RESOURCE_PACKAGE_DEFINITIONS);
export const RESOURCE_CATALOG = createResourceCatalog(RESOURCE_PACKAGE_REGISTRY);
