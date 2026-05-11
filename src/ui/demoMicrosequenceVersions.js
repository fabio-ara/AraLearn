import { createMicrosequenceVersionRecord } from "./microsequenceVersionState.js";

const LEGACY_DEMO_MICROSEQUENCE_VERSION_COUNT = 18;
const DEMO_MICROSEQUENCE_CARD_COUNTS = [3, 5, 7];
const DEMO_CARD_TITLE_PREFIXES = [
  ["Panorama", "Mapa", "Percurso", "Foco", "Resumo", "Comparação", "Fecho"],
  ["Rascunho", "Sequência", "Referência", "Conexão", "Detalhe", "Checklist", "Ancoragem"],
  ["Exploração", "Varredura", "Contexto", "Ajuste", "Extensão", "Contraste", "Revisão"]
];

function normalizeComparableText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function createFallbackCard() {
  return {
    key: "card-demo-base",
    title: "Card de exemplo",
    say: "Conteúdo de exemplo para a prévia da microssequência."
  };
}

function getBaseCards(microsequence) {
  const cards = Array.isArray(microsequence?.cards) ? microsequence.cards.filter(Boolean) : [];
  return cards.length ? cards : [createFallbackCard()];
}

function buildCardTitle(sourceCard, versionIndex, cardIndex) {
  const sourceTitle = String(sourceCard?.title || sourceCard?.key || `Card ${cardIndex + 1}`).trim();
  const prefix =
    DEMO_CARD_TITLE_PREFIXES[versionIndex]?.[cardIndex] ||
    `${versionIndex === 0 ? "Visão" : versionIndex === 1 ? "Rota" : "Leitura"} ${cardIndex + 1}`;
  return `${prefix}: ${sourceTitle}`;
}

function setRuntimeHeading(card, title) {
  if (!card.runtime || typeof card.runtime !== "object") {
    return;
  }

  card.runtime = structuredClone(card.runtime);
  card.runtime.title = title;
  if (!Array.isArray(card.runtime.blocks) || !card.runtime.blocks.length) {
    return;
  }

  const firstBlock = card.runtime.blocks[0];
  if (firstBlock?.kind === "heading") {
    card.runtime.blocks[0] = {
      ...firstBlock,
      value: title
    };
  }
}

function createCardVariant(sourceCard, versionIndex, cardIndex) {
  const card = structuredClone(sourceCard || createFallbackCard());
  const title = buildCardTitle(card, versionIndex, cardIndex);
  card.key = `${card.key || "card"}-v${versionIndex + 1}-${cardIndex + 1}`;
  card.title = title;
  setRuntimeHeading(card, title);
  return card;
}

function getComparableVersionSignature(version) {
  return JSON.stringify({
    title: version?.title || "",
    tags: Array.isArray(version?.tags) ? version.tags : [],
    cards: Array.isArray(version?.cards) ? version.cards : []
  });
}

function isLegacyDemoMicrosequenceEntry(entry) {
  if (!entry || !Array.isArray(entry.versions) || entry.versions.length !== LEGACY_DEMO_MICROSEQUENCE_VERSION_COUNT) {
    return false;
  }

  const firstSignature = getComparableVersionSignature(entry.versions[0]);
  return entry.versions.every((version, index) => {
    return (
      normalizeComparableText(version?.label) === `iteracao ${index + 1}` &&
      getComparableVersionSignature(version) === firstSignature
    );
  });
}

export function getDemoMicrosequenceActiveIndex(totalVersions) {
  if (!Number.isFinite(totalVersions) || totalVersions <= 1) {
    return 0;
  }

  return Math.min(Math.max(1, Math.floor((totalVersions - 1) / 2)), Math.max(0, totalVersions - 2));
}

export function buildDemoMicrosequenceVersions(microsequence) {
  const baseCards = getBaseCards(microsequence);
  return DEMO_MICROSEQUENCE_CARD_COUNTS.map((cardCount, versionIndex) => {
    const cards = Array.from({ length: cardCount }, (_, cardIndex) =>
      createCardVariant(baseCards[cardIndex % baseCards.length], versionIndex, cardIndex)
    );

    return createMicrosequenceVersionRecord(
      {
        ...microsequence,
        cards
      },
      {
        versionNumber: versionIndex + 1,
        label: `Versão ${versionIndex + 1}`,
        operationType: "seed"
      }
    );
  });
}

export function shouldSeedDemoMicrosequenceOverflow(entry) {
  return !entry || !Array.isArray(entry.versions) || entry.versions.length <= 1 || isLegacyDemoMicrosequenceEntry(entry);
}

export function syncDemoMicrosequenceOverflow(entry, microsequence) {
  if (!entry || !shouldSeedDemoMicrosequenceOverflow(entry)) {
    return false;
  }

  const previewVersions = buildDemoMicrosequenceVersions(microsequence);
  const activePreviewVersion = previewVersions[getDemoMicrosequenceActiveIndex(previewVersions.length)] || previewVersions[0] || null;
  entry.versions = previewVersions;
  entry.activeVersionId = activePreviewVersion?.id || "";
  return true;
}
