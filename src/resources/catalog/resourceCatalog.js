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
const SEARCH_LIMIT = 12;
const INSPECT_LIMIT = 8;
const CONTRACT_LIMIT = 4;

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
    throw new RangeError(`${label} precisa ficar entre 1 e ${maximum}.`);
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
  if (intent.notationIsLearningObject && contraindicationHits.length) score -= 40;

  const missingStructural = missing.some((entry) => (
    entry.startsWith("structure:") || entry.startsWith("taskOperation:")
    || entry.startsWith("practice:") || entry.startsWith("preserve:")
  ));
  const disciplineRequested = intent.disciplineIds.length > 0;
  const disciplineMatched = matched.some((entry) => entry.startsWith("discipline:"));
  const queryExact = queryTokens.length > 0 && queryHits.length === queryTokens.length;
  let fit;
  if (!missingStructural && (!disciplineRequested || disciplineMatched)
      && contraindicationHits.length === 0
      && (intent.structureIds.length || intent.taskOperationIds.length || queryExact)) {
    fit = "canonical";
  } else if (!missingStructural && contraindicationHits.length === 0
      && (!disciplineRequested || disciplineMatched || !intent.notationIsLearningObject)
      && (matched.length || (!intent.query && !disciplineRequested))) {
    fit = "versatile";
  } else {
    fit = "substitute";
  }
  if (intent.notationIsLearningObject && contraindicationHits.length) fit = "substitute";

  const reason = fit === "canonical"
    ? "O package preserva as facetas e a intenção solicitadas."
    : fit === "versatile"
      ? "O package preserva a estrutura principal, com aplicação transversal."
      : "É a aproximação instalada mais próxima, mas não preserva todas as facetas solicitadas.";
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

function rankedCandidates(profiles, rawIntent) {
  const intent = normalizedIntent(rawIntent);
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
    const { intent, candidates } = rankedCandidates(profiles, rawIntent);
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

  function auditRepresentation({ studyUnit, intent = {} } = {}) {
    const structural = validateStudyUnit(studyUnit);
    const normalizedAuditIntent = normalizedIntent({ ...intent, limit: 32 });
    const contentProfiles = list(studyUnit?.content).map((instance) => (
      getProfile(instance?.package, instance?.version)
    )).filter(Boolean);
    const selections = allStudyUnitInstances(studyUnit).map(({ instance, slot, index }) => {
      const identity = {
        slot,
        index,
        instanceId: String(instance?.id || ""),
        packageId: String(instance?.package || ""),
        version: String(instance?.version || "")
      };
      if (slot === "content") {
        const instanceValidation = registry.validateInstance(instance, "content");
        const { candidates } = rankedCandidates(profiles, { ...intent, slot, limit: 32 });
        const candidate = candidates.find(({ packageId, version }) => (
          packageId === instance?.package && version === instance?.version
        ));
        return {
          ...identity,
          basis: "semantic_fit",
          fit: instanceValidation.valid ? candidate?.fit || "substitute" : "substitute",
          reason: !instanceValidation.valid
            ? "O conteúdo não satisfaz seu contrato estrutural."
            : candidate?.reason || "O package não pertence ao catálogo instalado.",
          matched: candidate?.matched || [],
          missing: [
            ...(candidate?.missing || []),
            ...(!instanceValidation.valid ? ["contract:content"] : [])
          ]
        };
      }
      if (slot === "response") {
        const profile = getProfile(instance?.package, instance?.version);
        const instanceValidation = registry.validateInstance(instance, "response");
        const compatibleContent = profile ? contentProfiles.filter(({ responseCompatibility }) => (
          responseCompatibility.includes(profile.packageId)
        )) : [];
        const modeHits = profile
          ? overlap(normalizedAuditIntent.practiceModeIds, profile.practiceModeIds)
          : [];
        const missingModes = normalizedAuditIntent.practiceModeIds.filter((id) => !modeHits.includes(id));
        const hasContent = contentProfiles.length > 0;
        const compatible = !hasContent || compatibleContent.length > 0;
        const fit = !profile || !instanceValidation.valid || missingModes.length || !compatible
          ? "substitute"
          : hasContent ? "canonical" : "versatile";
        return {
          ...identity,
          basis: "response_affordance",
          fit,
          reason: !profile
            ? "O package não pertence ao catálogo instalado."
            : !instanceValidation.valid
              ? "A resposta não satisfaz seu contrato estrutural."
              : missingModes.length
                ? "A operação de resposta não corresponde à modalidade de prática solicitada."
                : !compatible
                  ? "A resposta não está declarada como compatível com as representações de conteúdo da Unidade de estudo."
                  : hasContent
                    ? "A operação de resposta é compatível com ao menos uma representação de conteúdo da Unidade de estudo."
                    : "A operação de resposta é válida, mas não há conteúdo representacional para confirmar compatibilidade.",
          matched: [
            ...compatibleContent.map(({ packageId }) => `compatibility:${packageId}`),
            ...modeHits.map((id) => `practice:${id}`)
          ],
          missing: [
            ...(!compatible && hasContent ? ["compatibility:content"] : []),
            ...missingModes.map((id) => `practice:${id}`)
          ]
        };
      }
      const profile = getProfile(instance?.package, instance?.version);
      const instanceValidation = registry.validateInstance(instance, "feedback");
      let readable = false;
      if (instanceValidation.valid) {
        try {
          readable = Boolean(String(registry.accessibleText(instance, "feedback") || "").trim());
        } catch {
          readable = false;
        }
      }
      return {
        ...identity,
        basis: "feedback_legibility",
        fit: !profile || !instanceValidation.valid ? "substitute" : readable ? "canonical" : "versatile",
        reason: !profile
          ? "O package não pertence ao catálogo instalado."
          : !instanceValidation.valid
            ? "O feedback não satisfaz o contrato do slot."
            : readable
              ? "O package é válido no slot de feedback e fornece leitura textual acessível."
              : "O package é válido no slot de feedback, mas não fornece leitura textual acessível.",
        matched: readable ? ["slot:feedback", "accessibility:text"] : ["slot:feedback"],
        missing: readable ? [] : ["accessibility:text"]
      };
    });
    const overallFit = structural.valid
      ? selections.reduce((current, selection) => (
          FIT_ORDER[selection.fit] < FIT_ORDER[current] ? selection.fit : current
        ), "canonical")
      : "substitute";
    const warnings = [];
    if (!structural.valid) {
      warnings.push("A Unidade de estudo é estruturalmente inválida; corrija os contratos antes de avaliar o encaixe representacional.");
    }
    if (list(studyUnit?.content).length > 2) {
      warnings.push("A Unidade de estudo coordena mais de duas representações de conteúdo; confirme se a coordenação é parte da tarefa.");
    }
    if (JSON.stringify(studyUnit || {}).length > 24_000) {
      warnings.push("A Unidade de estudo é densa para inspeção móvel; avalie recorte ou decomposição.");
    }
    selections.filter(({ fit }) => fit === "substitute").forEach(({ packageId }) => {
      const profile = getProfile(packageId);
      if (profile) warnings.push(...profile.limitations);
    });
    let accessibleText = "";
    if (structural.valid) {
      accessibleText = allStudyUnitInstances(studyUnit).map(({ instance, slot }) => (
        registry.accessibleText(instance, slot)
      )).filter(Boolean).join(" ");
    }
    return {
      contract: CATALOG_CONTRACT,
      catalogVersion,
      structural,
      overallFit,
      selections,
      warnings: [...new Set(warnings)],
      accessibleText,
      visualPreview: {
        rendered: false,
        reason: "A auditoria do catálogo não executa layout, hidratação nem captura visual."
      }
    };
  }

  function previewStudyUnitDescriptor(studyUnit) {
    const structural = validateStudyUnit(studyUnit);
    return {
      contract: CATALOG_CONTRACT,
      catalogVersion,
      rendered: false,
      structural,
      packages: structural.composition,
      reason: "A prévia visual fiel precisa ser aberta no renderer do aplicativo; este núcleo não simula viewport, Graphviz ou Vega."
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

  function restrict({
    packageRefs,
    authorizeCandidate = null,
    authorizeComposition = null
  } = {}) {
    if (!Array.isArray(packageRefs)) {
      throw new TypeError("A visão restrita exige uma lista confiável de package@version.");
    }
    if (authorizeCandidate != null && typeof authorizeCandidate !== "function") {
      throw new TypeError("authorizeCandidate precisa ser uma função interna.");
    }
    if (authorizeComposition != null && typeof authorizeComposition !== "function") {
      throw new TypeError("authorizeComposition precisa ser uma função interna.");
    }
    const allowedKeys = new Set();
    packageRefs.forEach((request, index) => {
      const { packageId, version } = requestIdentity(request);
      if (!packageId || !version) {
        throw new RangeError(`packageRefs[${index}] precisa identificar package e versão exatos.`);
      }
      const key = `${packageId}@${version}`;
      if (!byIdentity.has(key)) {
        throw new RangeError(`ResourceSet referencia package indisponível: ${key}.`);
      }
      allowedKeys.add(key);
    });
    const selectedProfiles = profiles.filter((profile) => (
      allowedKeys.has(`${profile.packageId}@${profile.version}`)
    ));

    function restrictedProfile(packageId, version = "") {
      const normalizedId = String(packageId || "").trim();
      const normalizedVersion = String(version || "").trim();
      const profile = normalizedVersion
        ? selectedProfiles.find((candidate) => (
            candidate.packageId === normalizedId && candidate.version === normalizedVersion
          )) || null
        : latestProfile(selectedProfiles, normalizedId);
      return profile ? clone(profile) : null;
    }

    function assertAllowedRequests(requests) {
      return list(requests).map((request) => {
        const identity = requestIdentity(request);
        const profile = restrictedProfile(identity.packageId, identity.version);
        if (!profile) {
          const suffix = identity.version ? `@${identity.version}` : "";
          throw new RangeError(
            `Package ${identity.packageId || "desconhecido"}${suffix} não pertence ao ResourceSet efetivo.`
          );
        }
        return { identity, profile };
      });
    }

    function restrictedExplore({ slot = "" } = {}) {
      if (slot && !new Set(["content", "response", "feedback"]).has(slot)) {
        throw new RangeError("slot desconhecido.");
      }
      const selected = selectedProfiles.filter((profile) => (
        !slot || profile.slots.includes(slot)
      ));
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

    function restrictedSearch(rawIntent = {}) {
      const { intent, candidates } = rankedCandidates(selectedProfiles, rawIntent);
      const authorized = candidates.flatMap((candidate) => {
        if (!authorizeCandidate) return [candidate];
        const authorization = authorizeCandidate({
          candidate: clone(candidate),
          intent: clone(intent),
          profile: restrictedProfile(candidate.packageId, candidate.version)
        });
        if (!authorization) return [];
        return [{ ...candidate, ...clone(authorization) }];
      });
      const restrictedCoverage = coverage(authorized, intent);
      if (authorized[0]?.fit === "versatile") {
        restrictedCoverage.chatDisclosure = `O ResourceSet efetivo autoriza ${authorized[0].label} como representação versátil, não como equivalente canônico. Registre a limitação indicada.`;
      } else if (authorized[0]?.fit === "substitute") {
        restrictedCoverage.chatDisclosure = `O ResourceSet efetivo autoriza ${authorized[0].label} somente como aproximação. Registre a limitação indicada e não declare equivalência.`;
      }
      return {
        contract: CATALOG_CONTRACT,
        catalogVersion,
        coverage: restrictedCoverage,
        candidates: authorized.slice(0, intent.limit)
      };
    }

    function restrictedAssessCandidate(request, rawIntent = {}) {
      const [{ identity, profile }] = assertAllowedRequests([request]);
      const assessment = assessCandidate(identity, rawIntent);
      if (assessment.status !== "assessed" || !assessment.candidate) {
        return assessment;
      }
      if (!authorizeCandidate) {
        return { ...assessment, status: "authorized" };
      }
      const authorization = authorizeCandidate({
        candidate: clone(assessment.candidate),
        intent: clone(assessment.intent),
        profile: clone(profile)
      });
      return authorization
        ? {
            ...assessment,
            status: "authorized",
            candidate: { ...assessment.candidate, ...clone(authorization) }
          }
        : { ...assessment, status: "blocked" };
    }

    function restrictedInspect(requests) {
      const values = list(requests);
      validateLimit(values.length, 1, INSPECT_LIMIT, "A quantidade de packages");
      const allowed = assertAllowedRequests(values);
      return {
        contract: CATALOG_CONTRACT,
        catalogVersion,
        items: allowed.map(({ profile }) => ({ status: "ok", profile }))
      };
    }

    function restrictedContracts(requests) {
      const values = list(requests);
      validateLimit(values.length, 1, CONTRACT_LIMIT, "A quantidade de contratos");
      const allowed = assertAllowedRequests(values);
      return {
        contract: CATALOG_CONTRACT,
        catalogVersion,
        items: allowed.map(({ profile }) => ({
          status: "ok",
          packageId: profile.packageId,
          version: profile.version,
          definition: registry.getAuthoringContract(profile.packageId, profile.version)
        }))
      };
    }

    function availabilityErrors(studyUnit) {
      return allStudyUnitInstances(studyUnit).flatMap(({ instance, slot, index }) => {
        const packageId = String(instance?.package || "");
        const version = String(instance?.version || "");
        const profile = restrictedProfile(packageId, version);
        if (!profile) {
          return [`$.studyUnit.${slot}[${index}]: ${packageId}@${version} não pertence ao ResourceSet efetivo.`];
        }
        if (!authorizeComposition) return [];
        const result = authorizeComposition({
          studyUnitRole: String(studyUnit?.role || ""),
          packageRef: { packageId, version },
          profile,
          slot
        });
        if (result?.allowed === true) return [];
        return normalizedList(result?.errors?.length
          ? result.errors
          : [`${packageId}@${version} não está autorizado para o papel materializado.`]);
      });
    }

    function restrictedValidateStudyUnit(studyUnit) {
      const result = validateStudyUnit(studyUnit);
      const errors = [...result.errors, ...availabilityErrors(studyUnit)];
      return { ...result, valid: errors.length === 0, errors };
    }

    function restrictedAuditRepresentation(args = {}) {
      const result = auditRepresentation(args);
      const structural = restrictedValidateStudyUnit(args.studyUnit);
      const selections = result.selections.map((selection) => {
        if (!authorizeComposition) return selection;
        const profile = restrictedProfile(selection.packageId, selection.version);
        const authorization = profile ? authorizeComposition({
          studyUnitRole: String(args.studyUnit?.role || ""),
          fit: selection.fit,
          limitation: selection.reason,
          packageRef: {
            packageId: selection.packageId,
            version: selection.version
          },
          profile,
          slot: selection.slot
        }) : null;
        if (authorization?.allowed === true) {
          return {
            ...selection,
            authorizedByResourceSetRef: clone(authorization.authorizedByResourceSetRef)
          };
        }
        return {
          ...selection,
          fit: "substitute",
          reason: authorization?.errors?.join(" ")
            || "O package não pertence ao ResourceSet efetivo.",
          missing: [...new Set([
            ...selection.missing,
            "availability:resource_set"
          ])]
        };
      });
      const overallFit = structural.valid
        ? selections.reduce((current, selection) => (
            FIT_ORDER[selection.fit] < FIT_ORDER[current] ? selection.fit : current
          ), "canonical")
        : "substitute";
      const warnings = structural.valid
        ? result.warnings
        : [...new Set([
            ...result.warnings,
            ...structural.errors.filter((entry) => entry.includes("ResourceSet"))
          ])];
      return { ...result, structural, overallFit, selections, warnings };
    }

    function restrictedPreviewStudyUnitDescriptor(studyUnit) {
      const result = previewStudyUnitDescriptor(studyUnit);
      return { ...result, structural: restrictedValidateStudyUnit(studyUnit) };
    }

    return Object.freeze({
      contract: CATALOG_CONTRACT,
      catalogVersion,
      policyVersion: POLICY_VERSION,
      getProfile: restrictedProfile,
      explore: restrictedExplore,
      search: restrictedSearch,
      assessCandidate: restrictedAssessCandidate,
      inspect: restrictedInspect,
      contracts: restrictedContracts,
      validateStudyUnit: restrictedValidateStudyUnit,
      auditRepresentation: restrictedAuditRepresentation,
      previewStudyUnitDescriptor: restrictedPreviewStudyUnitDescriptor
    });
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
    auditRepresentation,
    previewStudyUnitDescriptor,
    restrict
  });
}

export const RESOURCE_PACKAGE_REGISTRY = createPackageRegistry(RESOURCE_PACKAGE_DEFINITIONS);
export const RESOURCE_CATALOG = createResourceCatalog(RESOURCE_PACKAGE_REGISTRY);
