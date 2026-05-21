import { validateCard } from "../../domain/cards.js";
import { buildTechnicalCardBudget } from "../schemas/bottomUpSchema.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function normalizedStringContent(card = {}) {
  const content = card?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (content && typeof content === "object") {
    return [
      text(content?.text),
      text(content?.intro),
      text(content?.prompt),
      text(content?.title),
      text(content?.code)
    ]
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function normalizedForbiddenScanText(card = {}) {
  const base = normalizedStringContent(card);
  if (text(card?.resourceType) === "table" && card?.content && typeof card.content === "object") {
    const columns = Array.isArray(card.content?.columns) ? card.content.columns : [];
    const rows = Array.isArray(card.content?.rows) ? card.content.rows : [];
    const rowText = rows
      .flatMap((row) => (Array.isArray(row) ? row : []))
      .map((cell) => String(cell ?? "").trim())
      .filter(Boolean)
      .join(" ");
    return [base, columns.map((item) => text(item)).filter(Boolean).join(" "), rowText].filter(Boolean).join(" ");
  }
  if (text(card?.resourceType) === "graph" && card?.content && typeof card.content === "object") {
    const vertices = Array.isArray(card.content?.vertices) ? card.content.vertices : [];
    const edges = Array.isArray(card.content?.edges) ? card.content.edges : [];
    const vertexText = vertices
      .map((vertex) => [text(vertex?.id), text(vertex?.label)].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(" ");
    const edgeText = edges
      .map((edge) => [text(edge?.from), text(edge?.to), text(edge?.label), text(edge?.weight)].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(" ");
    return [base, vertexText, edgeText].filter(Boolean).join(" ");
  }
  return base;
}

function inferCardRole(card = {}, planned = {}) {
  if (text(planned?.role)) {
    return text(planned.role);
  }
  const resourceType = text(card?.resourceType);
  if (resourceType === "block_gap_fill" || resourceType === "code") {
    return "active_practice";
  }
  if (resourceType === "table") {
    return "guided_example";
  }
  return "microtheory";
}

function isPracticeRole(role = "") {
  return ["active_practice", "analogous_practice", "cumulative_review", "correction"].includes(text(role));
}

function cardLooksLikePractice(card = {}) {
  const source = normalizeToken(normalizedForbiddenScanText(card));
  return /\b(complete|preencha|classifique|associe|corrija|responda|escolha)\b/u.test(source) || /_{2,}|\[\[/.test(source);
}

function requiresPractice(packet = {}, cardPlan = []) {
  if (text(packet?.interactionMode) === "answer_local_doubt" && !requiresDensePractice(packet)) {
    return false;
  }
  const evidenceItems = [
    ...list(packet?.currentMicrosequence?.expectedEvidence),
    ...cardPlan.flatMap((item) => list(item?.expectedEvidence))
  ];
  if (!evidenceItems.length) {
    return /^(practice|extend_practice|repair_gap)$/i.test(text(packet?.currentMicrosequence?.coverageRole)) ||
      /^(guided_production|execution|classification|calculation|construction|correction|variation)$/i.test(text(packet?.currentMicrosequence?.practiceMode));
  }
  const evidence = evidenceItems.join(" ").toLowerCase();
  return /\b(aplicar|resolver|construir|corrigir|comparar|classificar|executar|produzir|variation|construction|execution|classification|calculation|correction)\b/u.test(
    evidence
  );
}

function requiresDensePractice(packet = {}) {
  const request = text(packet?.userRequest).toLowerCase();
  return text(packet?.interactionMode) === "add_practice"
    || /\b(bastante pratica|bastante prática|muita pratica|muita prática|mais pratica|mais prática|pratica variada|prática variada|exercicios|exercícios|treino guiado)\b/u.test(request);
}

function cardAccumulatesTooMuch(card = {}) {
  const source = normalizedStringContent(card).toLowerCase();
  let signals = 0;
  if (/\b(defin|conceit|é quando|significa)\b/u.test(source)) signals += 1;
  if (/\b(exemplo|por exemplo|caso)\b/u.test(source)) signals += 1;
  if (/\b(agora resolva|faça|tente|responda|complete|calcule)\b/u.test(source)) signals += 1;
  if (/\b(erro|corrija|correção)\b/u.test(source)) signals += 1;
  if (/\b(resumo|retomada|consolid)\b/u.test(source)) signals += 1;
  const paragraphs = source.split(/\n{2,}/).filter(Boolean).length;
  return signals >= 4 || paragraphs >= 4 || source.length > 900;
}

function shouldBlockCondensedCard(packet = {}, role = "") {
  const interactionMode = text(packet?.interactionMode);
  if (["answer_local_doubt", "add_practice", "repair"].includes(interactionMode)) {
    return true;
  }
  return isPracticeRole(role);
}

function practiceHasLocalContext(card = {}) {
  const resourceType = text(card?.resourceType);
  if (resourceType === "block_gap_fill") {
    return normalizedStringContent(card).length >= 20;
  }
  if (resourceType === "code") {
    return Boolean(text(card?.title) || text(card?.content?.intro) || text(card?.content?.code));
  }
  if (resourceType === "table") {
    return Array.isArray(card?.content?.rows) && card.content.rows.length > 0;
  }
  return normalizedStringContent(card).length >= 20;
}

function mentionsVolatileMissingContext(card = {}) {
  return /\b(card|tabela|figura|trecho)\s+(anterior|acima)\b/i.test(normalizedStringContent(card));
}

function normalizeToken(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesForbiddenTerm(sourceText, forbiddenTerms = []) {
  const normalizedSource = normalizeToken(sourceText);
  return list(forbiddenTerms).some((term) => {
    const normalizedTerm = normalizeToken(term);
    return normalizedTerm && normalizedSource.includes(normalizedTerm);
  });
}

function hasTemplateArtifact(card = {}) {
  const rawTitle = text(card?.title);
  const rawSource = [rawTitle, normalizedForbiddenScanText(card)].filter(Boolean).join(" ");
  const source = normalizeToken(rawSource);
  const titleSource = normalizeToken(rawTitle);
  const repeatedGapMarkup = rawSource.match(/\[\[([^:\]|]+)::([^\]]+)\]\]/gu);
  const hasRepeatedGapMarkup = (repeatedGapMarkup || []).some((match) => {
    const [, answer = "", optionsText = ""] = match.match(/\[\[([^:\]|]+)::([^\]]+)\]\]/u) || [];
    const options = optionsText.split("|").map((item) => normalizeToken(item)).filter(Boolean);
    const normalizedAnswer = normalizeToken(answer);
    return options.length > 1 && options.every((option) => option === normalizedAnswer);
  });
  if (hasRepeatedGapMarkup) {
    return true;
  }
  return /\b(outro elemento|um detalhe lateral|nesta etapa,\s*explicar que|pedir que o estudante|comparar os elementos minimos|compare os elementos minimos)\b/u.test(source)
    || /\b(explicar|mostrar|pedir|variar|retomar|consolidar)\b.{0,80}\b(microssequencia|acao observavel|pratica|aluno|estudante)\b/u.test(titleSource);
}

function tablePracticeHasConcreteAction(card = {}) {
  if (text(card?.resourceType) !== "table") {
    return true;
  }
  const content = card?.content && typeof card.content === "object" ? card.content : {};
  const source = normalizeToken(normalizedForbiddenScanText(card));
  const rows = Array.isArray(content?.rows) ? content.rows : [];
  if (/\buse a tabela para conferir a funcao local\b/u.test(source)) {
    return false;
  }
  return rows.length > 0;
}

function hasReadyStudentText(card = {}) {
  const source = normalizeToken([
    text(card?.title),
    normalizedForbiddenScanText(card)
  ].filter(Boolean).join(" "));
  if (!source) {
    return false;
  }
  return !/\b(use a tabela para conferir a funcao local de)\b/u.test(source);
}

function buildIssue(path, message, severity = "error") {
  return { path, message, severity };
}

export function validateBottomUpDidacticQuality(payload = {}, packet = {}, cardPlan = [], options = {}) {
  const issues = [];
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  const plannedByPosition = new Map((Array.isArray(cardPlan) ? cardPlan : []).map((item) => [Number(item?.position), item]));
  const expectedPractice = requiresPractice(packet, cardPlan);
  const practiceCards = cards.filter((card, index) => {
    const planned = plannedByPosition.get(Number(card?.position) || index + 1);
    return isPracticeRole(inferCardRole(card, planned)) || cardLooksLikePractice(card);
  });
  const hasPractice = practiceCards.length > 0;

  cards.forEach((card, index) => {
    const path = `$.cards[${index}]`;
    const planned = plannedByPosition.get(Number(card?.position) || index + 1);
    const role = inferCardRole(card, planned);
    if (!role) {
      issues.push(buildIssue(path, "Cada card precisa ter função didática reconhecível."));
    }
    if (cardAccumulatesTooMuch(card)) {
      issues.push(buildIssue(
        path,
        "Divida este card: ele acumula explicação, exemplo e prática.",
        shouldBlockCondensedCard(packet, role) ? "error" : "warning"
      ));
    }
    if (isPracticeRole(role) && !practiceHasLocalContext(card)) {
      issues.push(buildIssue(path, "A prática precisa carregar os dados necessários para resposta."));
    }
    if (isPracticeRole(role) && !tablePracticeHasConcreteAction(card)) {
      issues.push(buildIssue(path, "A prática em tabela precisa ter enunciado direto, lacuna ou alvo observável e dados verificáveis."));
    }
    if (mentionsVolatileMissingContext(card)) {
      issues.push(buildIssue(path, "A sequência depende de contexto volátil ausente dentro do próprio card."));
    }
    if (hasTemplateArtifact(card)) {
      issues.push(buildIssue(path, "Remova artefatos de template e escreva material final pronto para o aluno."));
    }
    if (!hasReadyStudentText(card)) {
      issues.push(buildIssue(path, "Escreva texto didático final no próprio card, não uma rubrica genérica."));
    }
    if (planned?.resourceType && text(card?.resourceType) !== text(planned.resourceType)) {
      issues.push(buildIssue(path, "O recurso planejado não foi usado e não há fallback justificável.", "warning"));
    }
  });

  if (cards.length && isPracticeRole(inferCardRole(cards[0], plannedByPosition.get(Number(cards[0]?.position))))) {
    issues.push(buildIssue("$.cards[0]", "Explique antes de cobrar uso quando o conteúdo é novo."));
  }
  if (expectedPractice && !hasPractice) {
    issues.push(buildIssue("$.cards", "A evidência esperada exige aplicação; inclua prática autossuficiente."));
  }
  if (requiresDensePractice(packet) && practiceCards.length < 2) {
    issues.push(buildIssue("$.cards", "O pedido exige mais prática básica; inclua ao menos 2 cards de prática autossuficiente."));
  }
  if (cards.length > 1 && !text(normalizedStringContent(cards[cards.length - 1]))) {
    issues.push(buildIssue("$.cards", "O último trecho deve reconectar a trilha ou consolidar o ponto atual.", "warning"));
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

export function validateMicrosequenceCards(payload, density = "standard", options = {}) {
  const errors = [];
  const summary = typeof payload?.summary === "string" ? payload.summary.trim() : "";
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  const normalizedCards = cards
    .map((card, index) => {
      const result = validateCard(card, `$.cards[${index}]`);
      if (!result.ok) {
        result.errors.forEach((error) => errors.push(error));
        return null;
      }
      return result.value;
    })
    .filter(Boolean);

  if (!summary) {
    errors.push({
      path: "$.summary",
      message: "Resumo da versão é obrigatório."
    });
  }

  const technicalBudget = buildTechnicalCardBudget(density, options?.modelCapabilities);
  if (normalizedCards.length > technicalBudget.maxCardsPerCall) {
    errors.push({
      path: "$.cards",
      message: `A chamada excedeu o orçamento técnico do provider: ${normalizedCards.length} cards para o máximo ${technicalBudget.maxCardsPerCall}.`
    });
  }

  const didactic = validateBottomUpDidacticQuality(
    { summary, cards: normalizedCards },
    options?.packet,
    options?.cardPlan,
    options
  );
  didactic.issues
    .filter((issue) => issue.severity !== "warning")
    .forEach((issue) => errors.push({ path: issue.path, message: issue.message }));

  const moduleExclude = Array.isArray(options?.packet?.module?.exclude) ? options.packet.module.exclude : [];
  if (moduleExclude.length) {
    const combined = [summary, ...normalizedCards.map((card) => normalizedForbiddenScanText(card))].filter(Boolean).join("\n");
    const leaked = list(moduleExclude).filter((term) => includesForbiddenTerm(combined, [term]));
    if (leaked.length) {
      errors.push({
        path: "$",
        message: `Conteúdo fora do escopo (exclude do módulo): ${leaked.join(", ")}.`
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      summary,
      cards: normalizedCards
    },
    report: {
      ok: errors.length === 0,
      density,
      cardCount: normalizedCards.length,
      technicalBudget,
      issues: [
        ...errors.map((error) => error.message),
        ...didactic.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)
      ]
    }
  };
}
