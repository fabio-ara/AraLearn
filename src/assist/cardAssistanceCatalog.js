import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";

const MAX_CANDIDATES = 6;
const MAX_CONTENT_INSTANCES = 4;
const MAX_FEEDBACK_INSTANCES = 3;

function text(value, maxLength = 400) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function fail(message) {
  const error = new Error(message);
  error.name = "CardAssistanceCatalogError";
  error.code = "INVALID_CARD_ASSISTANCE_CATALOG";
  throw error;
}

function normalizePackageSpec(value, slot, registry) {
  const packageId = text(value?.package, 240);
  const version = text(value?.version, 80);
  if (!packageId || !version) {
    fail(`A composição contém um package sem identidade ou versão em ${slot}.`);
  }
  let manifest;
  try {
    manifest = registry.get(packageId, version)?.manifest
      || registry.getAuthoringContract(packageId, version)?.manifest;
  } catch {
    fail(`O catálogo indicou o package indisponível ${packageId}@${version}.`);
  }
  if (!manifest || !Array.isArray(manifest.slots) || !manifest.slots.includes(slot)) {
    fail(`O package ${packageId}@${version} não pode ocupar o slot ${slot}.`);
  }
  return { package: packageId, version };
}

function normalizeComposition(candidate, registry) {
  const source = candidate?.composition || candidate?.plan || candidate;
  const role = source?.role === "practice" ? "practice" : source?.role === "theory"
    ? "theory"
    : "";
  if (!role) fail("A composição do catálogo deve declarar role theory ou practice.");
  const rawContent = Array.isArray(source?.content) ? source.content : [];
  const rawFeedback = Array.isArray(source?.feedback) ? source.feedback : [];
  if (rawContent.length > MAX_CONTENT_INSTANCES || rawFeedback.length > MAX_FEEDBACK_INSTANCES) {
    fail("A composição excede o limite de resources por card.");
  }
  const content = rawContent
    .map((spec) => normalizePackageSpec(spec, "content", registry));
  const feedback = rawFeedback
    .map((spec) => normalizePackageSpec(spec, "feedback", registry));
  const response = source?.response
    ? normalizePackageSpec(source.response, "response", registry)
    : null;
  if (role === "theory" && response) {
    fail("Uma composição teórica não pode declarar response.");
  }
  if (role === "practice" && !response) {
    fail("Uma composição prática deve declarar response.");
  }
  if (role === "theory" && content.length === 0) {
    fail("Uma composição teórica deve conter ao menos um resource expositivo.");
  }
  if (response && content.length > 0 && !content.some((spec) => {
    const manifest = registry.get(spec.package, spec.version)?.manifest
      || registry.getAuthoringContract(spec.package, spec.version)?.manifest;
    return manifest?.responseCompatibility?.includes(response.package);
  })) {
    fail("A composição não contém content compatível com a response escolhida.");
  }
  return { role, content, response, feedback };
}

function packageSpecFromSearchCandidate(candidate) {
  return {
    package: text(candidate?.packageId, 240),
    version: text(candidate?.version, 80)
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function collectContextText(value, result = []) {
  if (result.join(" ").length >= 4000 || value == null) return result;
  if (typeof value === "string") {
    const normalized = text(value, 800);
    if (normalized) result.push(normalized);
    return result;
  }
  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item) => collectContextText(item, result));
    return result;
  }
  if (typeof value === "object") {
    Object.values(value).slice(0, 30).forEach((item) => collectContextText(item, result));
  }
  return result;
}

function activeConversationText(turns) {
  if (!Array.isArray(turns)) return [];
  return turns.slice(-4).flatMap((turn) => [
    text(turn?.userRequest || turn?.request, 700),
    text(turn?.assistantResponse, 500)
  ]).filter(Boolean);
}

function packageSearchIntent(catalog, query, limit) {
  const currentCard = query?.currentCard || {};
  const profiles = typeof catalog?.getProfile === "function"
    ? [
        ...(Array.isArray(currentCard.content) ? currentCard.content : []),
        ...(currentCard.response ? [currentCard.response] : [])
      ].map((spec) => catalog.getProfile(spec?.package, spec?.version)).filter(Boolean)
    : [];
  const hierarchyText = collectContextText(query?.didacticContext);
  const conversationText = activeConversationText(query?.priorConversation);
  const originalIntent = text(query?.intent, 12000);
  const normalizedIntent = originalIntent.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const namesRepresentation = /\b(?:grafico|formula|tabela|diagrama|texto|codigo|mapa|arvore|grafo|fluxograma|matriz|plano|reacao|glosa)\b/.test(normalizedIntent);
  const contextualQuery = (namesRepresentation ? originalIntent : unique([
    originalIntent,
    text(currentCard.title, 300),
    ...hierarchyText,
    ...conversationText
  ]).join(" ")).slice(0, 12000);
  const contentProfiles = profiles.filter(({ slots }) => slots?.includes("content"));
  const responseProfiles = profiles.filter(({ slots }) => slots?.includes("response"));
  return {
    query: contextualQuery || originalIntent,
    slot: "content",
    cardRole: currentCard.role === "practice" ? "practice" : currentCard.role === "theory"
      ? "theory"
      : "",
    disciplineIds: namesRepresentation
      ? []
      : unique(contentProfiles.flatMap(({ disciplineIds = [] }) => disciplineIds)),
    structureIds: namesRepresentation
      ? []
      : unique(contentProfiles.flatMap(({ structureIds = [] }) => structureIds)),
    taskOperationIds: namesRepresentation
      ? []
      : unique(contentProfiles.flatMap(({ taskOperationIds = [] }) => taskOperationIds)),
    practiceModeIds: currentCard.role === "practice"
      ? unique(responseProfiles.flatMap(({ practiceModeIds = [] }) => practiceModeIds))
      : [],
    knowledgeObjects: namesRepresentation ? [] : unique([
      ...contentProfiles.flatMap(({ knowledgeObjects = [] }) => knowledgeObjects),
      text(currentCard.title, 300),
      ...hierarchyText
    ]).slice(0, 24),
    mustPreserve: [],
    limit
  };
}

function responseSpec(packageId, registry) {
  const profile = registry.listCatalog({ slot: "response" })
    .find(({ id }) => id === packageId);
  return profile ? { package: profile.id, version: profile.version } : null;
}

function currentFeedbackSpecs(query, registry) {
  const current = Array.isArray(query?.currentCard?.feedback)
    ? query.currentCard.feedback
    : [];
  return current.slice(0, 1).map((spec) => {
    try {
      return normalizePackageSpec(spec, "feedback", registry);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function fitRank(value) {
  return value === "canonical" ? 3 : value === "versatile" ? 2 : 1;
}

function availableResponseIds(candidates) {
  return unique(candidates.flatMap(({ responseCompatibility = [] }) => responseCompatibility));
}

function queryRequestsCombination(query) {
  const normalized = text(query?.intent, 12000)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(?:combine|combinar|junto|juntos|simultaneamente|acompanhad[oa]|mais de um)\b/.test(normalized)
    || /\b(?:grafico|formula|tabela|diagrama|texto|codigo|mapa|arvore|grafo)\b[^.]{0,80}\be\b[^.]{0,80}\b(?:grafico|formula|tabela|diagrama|texto|codigo|mapa|arvore|grafo)\b/.test(normalized);
}

function explicitlyNamedCandidate(candidate, query) {
  const intent = text(query?.intent, 12000)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const labelTokens = text(candidate?.label, 240)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]{4,}/g) || [];
  return labelTokens.length > 0 && labelTokens.every((token) => intent.includes(token));
}

function complementaryCandidates(left, right, query) {
  if (!left || !right || left.packageId === right.packageId) return false;
  if (fitRank(left.fit) < 2 || fitRank(right.fit) < 2) return false;
  if (queryRequestsCombination(query)) return true;
  const leftMatches = new Set(left.matched || []);
  const rightMatches = new Set(right.matched || []);
  const leftAddsMeaning = [...leftMatches].some((item) => !rightMatches.has(item));
  const rightAddsMeaning = [...rightMatches].some((item) => !leftMatches.has(item));
  const currentContentCount = Array.isArray(query?.currentCard?.content)
    ? query.currentCard.content.length
    : 0;
  return currentContentCount > 1 || (leftAddsMeaning && rightAddsMeaning);
}

function candidateSets(contentCandidates, query) {
  const selected = [...contentCandidates]
    .sort((left, right) => (
      Number(explicitlyNamedCandidate(right, query)) -
      Number(explicitlyNamedCandidate(left, query))
    ))
    .slice(0, 4);
  const explicitlyNamed = selected.filter((candidate) => (
    explicitlyNamedCandidate(candidate, query)
  ));
  if (queryRequestsCombination(query) && explicitlyNamed.length > 1) {
    return [explicitlyNamed.slice(0, MAX_CONTENT_INSTANCES), ...selected.map((candidate) => [candidate])];
  }
  const sets = selected.map((candidate) => [candidate]);
  for (let left = 0; left < selected.length; left += 1) {
    for (let right = left + 1; right < selected.length; right += 1) {
      if (complementaryCandidates(selected[left], selected[right], query)) {
        sets.splice(Math.min(1, sets.length), 0, [selected[left], selected[right]]);
      }
      if (sets.filter((set) => set.length > 1).length >= 2) return sets;
    }
  }
  return sets;
}

function composeIndividualPackages(result, query, registry, limit) {
  const packages = Array.isArray(result?.candidates) ? result.candidates : [];
  const contentCandidates = packages.filter((candidate) => {
    try {
      const manifest = registry.get(candidate?.packageId, candidate?.version)?.manifest
        || registry.getAuthoringContract(candidate?.packageId, candidate?.version)?.manifest;
      return manifest?.slots?.includes("content");
    } catch {
      return false;
    }
  });
  const feedback = currentFeedbackSpecs(query, registry);
  const compositions = [];
  for (const candidateSet of candidateSets(contentCandidates, query)) {
    const content = candidateSet.map(packageSpecFromSearchCandidate);
    const desiredResource = text(result?.coverage?.desiredResource, 500)
      || text(query?.intent, 500)
      || "a representação solicitada";
    const combinedLabel = candidateSet.map(({ label, packageId }) => (
      text(label, 240) || text(packageId, 240)
    )).join(" + ");
    const catalogFit = candidateSet.reduce((fit, candidate) => (
      fitRank(candidate.fit) < fitRank(fit) ? candidate.fit : fit
    ), "canonical");
    const base = {
      label: combinedLabel,
      description: unique(candidateSet.map(({ reason }) => text(reason, 450))).join(" "),
      catalogDisclosure: catalogFit === "substitute"
        ? `Usei ${combinedLabel} como aproximação porque o catálogo instalado não contém uma representação exata para ${desiredResource}.`
        : "",
      catalogFit
    };
    const compositionIdentity = content.map((spec) => `${spec.package}@${spec.version}`).join("+");
    compositions.push({
      ...base,
      id: `${compositionIdentity}+theory`,
      composition: { role: "theory", content, response: null, feedback: [] }
    });
    for (const responseId of availableResponseIds(candidateSet).slice(0, 2)) {
      const response = responseSpec(responseId, registry);
      if (!response) continue;
      compositions.push({
        ...base,
        id: `${compositionIdentity}+${response.package}@${response.version}`,
        label: `${base.label} + prática`,
        composition: { role: "practice", content, response, feedback }
      });
    }
    if (compositions.length >= limit * 2) break;
  }
  // Intercala exposição e prática para que uma shortlist pequena não suprima um dos papéis.
  const theory = compositions.filter(({ composition }) => composition.role === "theory");
  const practice = compositions.filter(({ composition }) => composition.role === "practice");
  const interleaved = [];
  for (let index = 0; interleaved.length < limit; index += 1) {
    if (theory[index]) interleaved.push(theory[index]);
    if (interleaved.length < limit && practice[index]) interleaved.push(practice[index]);
    if (!theory[index] && !practice[index]) break;
  }
  return interleaved;
}

export function normalizeCardAssistanceCatalogCandidates(
  values,
  { registry = RESOURCE_PACKAGE_REGISTRY, limit = MAX_CANDIDATES } = {}
) {
  if (!Array.isArray(values)) {
    fail("A busca no catálogo não devolveu uma lista de composições.");
  }
  const safeLimit = Math.max(1, Math.min(MAX_CANDIDATES, Number(limit) || MAX_CANDIDATES));
  const candidates = values.slice(0, safeLimit).map((candidate, index) => ({
    id: text(candidate?.id, 200),
    label: text(candidate?.label, 240) || `Composição ${index + 1}`,
    description: text(candidate?.description || candidate?.reason, 900),
    catalogDisclosure: text(candidate?.catalogDisclosure, 900),
    catalogFit: text(candidate?.catalogFit, 40),
    composition: normalizeComposition(candidate, registry)
  }));
  if (!candidates.length || candidates.some(({ id }) => !id)) {
    fail("A busca no catálogo não encontrou composições identificáveis.");
  }
  if (new Set(candidates.map(({ id }) => id)).size !== candidates.length) {
    fail("A busca no catálogo devolveu composições repetidas.");
  }
  return candidates;
}

export async function queryCardAssistanceCatalog(
  catalog,
  query,
  { registry = RESOURCE_PACKAGE_REGISTRY, limit = MAX_CANDIDATES } = {}
) {
  const representationSearch = typeof catalog?.searchRepresentations === "function"
    ? catalog.searchRepresentations
    : typeof catalog === "function" ? catalog : null;
  const packageSearch = typeof catalog?.search === "function" ? catalog.search : null;
  const search = representationSearch || packageSearch;
  if (typeof search !== "function") {
    fail("A recomposição exige um catálogo de representações disponível.");
  }
  const safeLimit = Math.max(1, Math.min(MAX_CANDIDATES, Number(limit) || MAX_CANDIDATES));
  const result = await search.call(catalog, representationSearch
    ? { ...query, limit: safeLimit }
    : packageSearchIntent(catalog, query, safeLimit));
  const rawCandidates = packageSearch && !representationSearch &&
      (result?.candidates || []).some(({ packageId }) => text(packageId, 240))
    ? composeIndividualPackages(result, query, registry, safeLimit)
    : Array.isArray(result) ? result : result?.candidates;
  return normalizeCardAssistanceCatalogCandidates(
    rawCandidates,
    { registry, limit }
  );
}

export function cardAssistanceCandidatePrompt(candidate, registry = RESOURCE_PACKAGE_REGISTRY) {
  const describe = (spec, slot) => {
    const manifest = registry.get(spec.package, spec.version)?.manifest
      || registry.getAuthoringContract(spec.package, spec.version)?.manifest;
    const authoring = registry.getAuthoringContract(spec.package, spec.version);
    const contract = authoring?.contract || authoring;
    return {
      slot,
      package: spec.package,
      version: spec.version,
      label: text(manifest?.label, 240),
      purpose: text(manifest?.purpose, 700),
      limitations: Array.isArray(manifest?.limitations)
        ? manifest.limitations.map((item) => text(item, 400)).filter(Boolean).slice(0, 5)
        : [],
      intent: text(contract?.intent, 700),
      rules: Array.isArray(contract?.rules)
        ? contract.rules.map((item) => text(item, 400)).filter(Boolean).slice(0, 8)
        : [],
      example: contract?.example || null
    };
  };
  const composition = candidate.composition;
  return {
    id: candidate.id,
    label: candidate.label,
    description: candidate.description,
    catalogDisclosure: candidate.catalogDisclosure,
    catalogFit: candidate.catalogFit,
    role: composition.role,
    resources: [
      ...composition.content.map((spec) => describe(spec, "content")),
      ...(composition.response ? [describe(composition.response, "response")] : []),
      ...composition.feedback.map((spec) => describe(spec, "feedback"))
    ]
  };
}
