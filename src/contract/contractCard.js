import { normalizeCardEnvelope } from "../resources/kernel/cardEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";

const CONTENT_PACKAGES = RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" });
export const CONTRACT_CARD_KINDS = Object.freeze(CONTENT_PACKAGES.map(({ id }) => id));

function clone(value) {
  return structuredClone(value);
}

function packageManifest(packageId) {
  return RESOURCE_PACKAGE_REGISTRY.listCatalog().find(({ id }) => id === packageId) || null;
}

function normalizePackageId(value) {
  const requested = String(value || "").trim();
  if (requested.startsWith("aralearn.")) return requested;
  return `aralearn.resource.${requested.replace(/_/gu, "-") || "paragraph"}`;
}

export function getContractCardKind(card) {
  const packageId = typeof card === "string"
    ? normalizePackageId(card)
    : String(card?.content?.[0]?.package || "aralearn.resource.paragraph");
  return packageId.replace(/^aralearn\.resource\./u, "").replace(/-/gu, "_");
}

export function getContractCardKindLabel(card) {
  return packageManifest(normalizePackageId(getContractCardKind(card)))?.label || "Card";
}

export function createStarterContractCard(packageId = "aralearn.resource.paragraph") {
  const normalizedPackageId = normalizePackageId(packageId);
  const manifest = packageManifest(normalizedPackageId);
  if (!manifest?.slots.includes("content")) throw new RangeError(`Package de conteúdo inválido: ${normalizedPackageId}.`);
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(normalizedPackageId, manifest.version);
  return normalizeCardEnvelope({
    id: "novo-card",
    position: 1,
    title: manifest.label,
    role: "theory",
    content: [{ id: "conteudo-1", package: normalizedPackageId, version: manifest.version, data: contract.contract.example }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  }, RESOURCE_PACKAGE_REGISTRY);
}

export function sanitizeContractCard(input) {
  return normalizeCardEnvelope({
    ...clone(input || {}),
    topics: Array.isArray(input?.topics) ? input.topics : [],
    sources: Array.isArray(input?.sources) ? input.sources : [],
    feedback: Array.isArray(input?.feedback) ? input.feedback : []
  }, RESOURCE_PACKAGE_REGISTRY);
}

export function listContractAnswerValues(card) {
  const response = sanitizeContractCard(card).response;
  if (!response) return [];
  if (response.package === "aralearn.response.choice") return [...response.data.answerIds];
  if (response.package === "aralearn.response.gap") return response.data.blanks.map(({ answer }) => answer);
  if (response.package === "aralearn.response.ordering") {
    return response.data.targets.map(({ id }) => id);
  }
  return [];
}

export function cloneContractCard(card) {
  return clone(sanitizeContractCard(card));
}
