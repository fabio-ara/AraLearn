import { getChoiceOptionComparableValue } from "../../core/choiceOptions.js";
import { parseTextGapTokens } from "../../core/textGaps.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToken(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasGapSyntax(value) {
  return parseTextGapTokens(value).length > 0;
}

function collectChoiceOptionTexts(options = []) {
  return (Array.isArray(options) ? options : []).map((option, index) => text(getChoiceOptionComparableValue(option, index))).filter(Boolean);
}

function collectCompositeBlockStrings(card = {}) {
  return (Array.isArray(card?.blocks) ? card.blocks : []).flatMap((block) => {
    const kind = text(block?.kind);
    if (kind === "heading" || kind === "paragraph") {
      return [text(block?.value)];
    }
    if (kind === "choice") {
      return [
        text(block?.question),
        ...collectChoiceOptionTexts(block?.options)
      ];
    }
    return [
      text(block?.prompt),
      text(block?.code)
    ];
  }).filter(Boolean);
}

function cardMainText(card = {}) {
  if (text(card?.resource) === "composite") {
    return collectCompositeBlockStrings(card).join(" ");
  }
  const optionText = collectChoiceOptionTexts(card.options).join(" ");
  return [card.text, card.question, card.prompt, card.accessibleText, card.code, optionText].map(text).filter(Boolean).join(" ");
}

function requiresNarrativePrompt(card = {}) {
  return ["flow", "tree", "graph", "relation_map", "matrix", "plane", "formula"].includes(text(card?.resource));
}

function cardFullText(card = {}) {
  return [cardMainText(card), text(card.after)].filter(Boolean).join(" ");
}

function cardLooksOpenEndedPractice(card = {}) {
  if (text(card.exercise) === "choice") {
    return false;
  }
  if (text(card.resource) === "paragraph" && hasGapSyntax(card.text)) {
    return false;
  }
  return /\b(explique|responda|justifique|liste|descreva|nomeie|indique|escreva)\b/iu.test(cardMainText(card));
}

function referencesExternalCase(card = {}) {
  return /\b(caso|problema|situacao|situação|tabela acima|card anterior|como vimos|no material|no pdf)\b/iu.test(cardMainText(card));
}

function cardMaterializesContext(card = {}) {
  if (text(card.resource) === "choice") {
    return Array.isArray(card.options) && card.options.length >= 3;
  }
  if (text(card.resource) === "table") {
    return Array.isArray(card.rows) && card.rows.length > 0;
  }
  if (text(card.resource) === "composite") {
    const blocks = Array.isArray(card?.blocks) ? card.blocks : [];
    const hasChoice = blocks.some((block) => text(block?.kind) === "choice");
    const hasRenderableCase = blocks.some((block) => {
      const kind = text(block?.kind);
      if (kind === "graph") {
        return Array.isArray(block?.vertices) && block.vertices.length > 0 && Array.isArray(block?.edges) && block.edges.length > 0;
      }
      if (kind === "table") {
        return Array.isArray(block?.rows) && block.rows.length > 0;
      }
      if (kind === "paragraph") {
        return text(block?.value).length > 0;
      }
      return text(block?.prompt).length > 0;
    });
    return hasRenderableCase && (text(card?.exercise) !== "choice" || hasChoice);
  }
  if (text(card.resource) === "graph") {
    return Array.isArray(card.vertices) && card.vertices.length > 0 && Array.isArray(card.edges) && card.edges.length > 0;
  }
  if (text(card.resource) === "relation_map") {
    return (
      Array.isArray(card?.leftSet?.items) &&
      card.leftSet.items.length > 0 &&
      Array.isArray(card?.rightSet?.items) &&
      card.rightSet.items.length > 0 &&
      Array.isArray(card?.relations) &&
      card.relations.length > 0
    );
  }
  if (text(card.resource) === "flow") {
    return !!(card?.structure && typeof card.structure === "object" && Array.isArray(card.structure.items) && card.structure.items.length > 0);
  }
  if (text(card.resource) === "tree") {
    return Array.isArray(card.nodes) && card.nodes.length > 0;
  }
  if (text(card.resource) === "code") {
    return text(card.code).length > 0;
  }
  if (text(card.resource) === "matrix") {
    return (Array.isArray(card.values) && card.values.length > 0) || (Array.isArray(card.sequence) && card.sequence.length > 0);
  }
  if (text(card.resource) === "plane") {
    return (
      (Array.isArray(card.x) && card.x.length > 0 && Array.isArray(card.y) && card.y.length > 0) ||
      (Array.isArray(card.vector) && card.vector.length > 0) ||
      (Array.isArray(card.vectors) && card.vectors.length > 0) ||
      (Array.isArray(card.sum) && card.sum.length > 0) ||
      Boolean(card.scale && typeof card.scale === "object" && Array.isArray(card.scale.vector) && card.scale.vector.length > 0) ||
      (Array.isArray(card.distance) && card.distance.length > 0) ||
      (Array.isArray(card.result) && card.result.length > 0) ||
      (typeof card.result === "string" && text(card.result).length > 0)
    );
  }
  if (text(card.resource) === "formula") {
    return Boolean(card.expression && typeof card.expression === "object" && text(card.accessibleText));
  }
  return cardMainText(card).length >= 20;
}

function containsInternalTechnicalLanguage(card = {}) {
  return /\b(prompt|schema|json|container|validador|pipeline|recurso|llm)\b/iu.test(cardMainText(card));
}

function mentionsForbiddenTerms(card = {}, terms = []) {
  const source = normalizeToken(cardMainText(card));
  return (Array.isArray(terms) ? terms : []).some((term) => {
    const token = normalizeToken(term);
    return token && source.includes(token);
  });
}

function mentionsKnownSignal(card = {}, signals = []) {
  const sourceText = cardFullText(card);
  const source = normalizeToken(sourceText);
  const sourceTokens = new Set(uniqueNormalizedTokensFromText(sourceText));
  return (Array.isArray(signals) ? signals : []).some((signal) => {
    const token = normalizeToken(signal);
    if (token && source.includes(token)) {
      return true;
    }
    const signalTokens = uniqueNormalizedTokensFromText(signal);
    if (!signalTokens.length) {
      return false;
    }
    let matches = 0;
    signalTokens.forEach((item) => {
      if (sourceTokens.has(item)) {
        matches += 1;
      }
    });
    return matches >= Math.min(2, signalTokens.length);
  });
}

function plannedRoleLooksLikePractice(role = "") {
  return ["practice", "practice_more", "fix_error", "review"].includes(text(role));
}

function normalizedList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((item) => normalizeToken(item))
    .filter(Boolean);
}

function uniqueNormalizedTokensFromText(value = "") {
  return [...new Set(
    normalizeToken(value)
      .replace(/\[\[[\s\S]*?\]\]/g, " gap ")
      .split(/[^a-z0-9]+/i)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
  )];
}

function overlapRatio(left = [], right = []) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (!union.size) {
    return 0;
  }
  let intersection = 0;
  union.forEach((item) => {
    if (leftSet.has(item) && rightSet.has(item)) {
      intersection += 1;
    }
  });
  return intersection / union.size;
}

function extractGapMetadata(card = {}) {
  const raw = text(card?.resource) === "code" ? String(card?.code || "") : text(card?.text);
  const parts = parseTextGapTokens(raw);
  if (!parts.length) {
    return null;
  }
  const firstToken = parts[0];
  const options = firstToken.options.map((item) => normalizeToken(item)).filter(Boolean);
  return {
    answer: normalizeToken(firstToken.answer),
    options,
    stemTokens: uniqueNormalizedTokensFromText(raw)
  };
}

function cardCaseSignature(card = {}) {
  const resource = text(card?.resource);
  if (resource === "paragraph") {
    return JSON.stringify({
      resource,
      text: normalizeToken(card?.text)
    });
  }
  if (resource === "choice") {
    return JSON.stringify({
      resource,
      question: normalizeToken(card?.question),
      options: normalizedList(collectChoiceOptionTexts(card.options))
    });
  }
  if (resource === "composite") {
    return JSON.stringify({
      resource,
      blocks: (Array.isArray(card?.blocks) ? card.blocks : []).map((block) => {
        const kind = text(block?.kind);
        if (kind === "heading" || kind === "paragraph") {
          return { kind, value: normalizeToken(block?.value) };
        }
        if (kind === "choice") {
          return {
            kind,
            question: normalizeToken(block?.question),
            options: normalizedList(collectChoiceOptionTexts(block.options))
          };
        }
        if (kind === "graph") {
          return {
            kind,
            prompt: normalizeToken(block?.prompt),
            vertices: (Array.isArray(block?.vertices) ? block.vertices : []).map((item) => normalizeToken(item?.label || item?.id)),
            edges: (Array.isArray(block?.edges) ? block.edges : []).map((item) => `${normalizeToken(item?.from)}>${normalizeToken(item?.to)}:${normalizeToken(item?.label)}`)
          };
        }
        return {
          kind,
          prompt: normalizeToken(block?.prompt),
          values: JSON.stringify(block || "")
        };
      })
    });
  }
  if (resource === "code") {
    return JSON.stringify({
      resource,
      prompt: normalizeToken(card?.prompt),
      code: normalizeToken(card?.code),
      question: normalizeToken(card?.question),
      options: normalizedList(collectChoiceOptionTexts(card.options))
    });
  }
  if (resource === "table") {
    return JSON.stringify({
      resource,
      columns: normalizedList(card?.columns),
      rows: (Array.isArray(card?.rows) ? card.rows : []).map((row) => normalizedList(row)),
      question: normalizeToken(card?.question),
      options: normalizedList(collectChoiceOptionTexts(card.options))
    });
  }
  if (resource === "graph") {
    return JSON.stringify({
      resource,
      prompt: normalizeToken(card?.prompt),
      vertices: (Array.isArray(card?.vertices) ? card.vertices : []).map((item) => normalizeToken(item?.label || item?.id)),
      edges: (Array.isArray(card?.edges) ? card.edges : []).map((item) => `${normalizeToken(item?.from)}>${normalizeToken(item?.to)}:${normalizeToken(item?.label)}`),
      question: normalizeToken(card?.question),
      options: normalizedList(collectChoiceOptionTexts(card.options))
    });
  }
  if (resource === "relation_map") {
    return JSON.stringify({
      resource,
      prompt: normalizeToken(card?.prompt),
      leftSet: (Array.isArray(card?.leftSet?.items) ? card.leftSet.items : []).map((item) => normalizeToken(item?.label || item?.id)),
      rightSet: (Array.isArray(card?.rightSet?.items) ? card.rightSet.items : []).map((item) => normalizeToken(item?.label || item?.id)),
      relations: (Array.isArray(card?.relations) ? card.relations : []).map((item) => `${normalizeToken(item?.from)}>${normalizeToken(item?.to)}`),
      pairList: normalizedList(card?.pairList),
      question: normalizeToken(card?.question),
      options: normalizedList(collectChoiceOptionTexts(card.options))
    });
  }
  if (resource === "matrix") {
    return JSON.stringify({
      resource,
      prompt: normalizeToken(card?.prompt),
      question: normalizeToken(card?.question),
      options: normalizedList(collectChoiceOptionTexts(card.options)),
      values: Array.isArray(card?.values) ? card.values : [],
      sequence: Array.isArray(card?.sequence) ? card.sequence : [],
      highlight: card?.highlight || null,
      dividerAfterColumn: Number.isInteger(card?.dividerAfterColumn) ? card.dividerAfterColumn : null
    });
  }
  if (resource === "plane") {
    return JSON.stringify({
      resource,
      prompt: normalizeToken(card?.prompt),
      question: normalizeToken(card?.question),
      options: normalizedList(collectChoiceOptionTexts(card.options)),
      x: Array.isArray(card?.x) ? card.x : [],
      y: Array.isArray(card?.y) ? card.y : [],
      vector: Array.isArray(card?.vector) ? card.vector : [],
      vectors: Array.isArray(card?.vectors) ? card.vectors : [],
      sum: Array.isArray(card?.sum) ? card.sum : [],
      scale: card?.scale || null,
      distance: Array.isArray(card?.distance) ? card.distance : [],
      result: card?.result ?? null
    });
  }
  if (resource === "formula") {
    return JSON.stringify({
      resource,
      prompt: normalizeToken(card?.prompt),
      notation: text(card?.notation),
      accessibleText: normalizeToken(card?.accessibleText),
      expression: card?.expression || null,
      question: normalizeToken(card?.question),
      options: normalizedList(collectChoiceOptionTexts(card.options))
    });
  }
  if (resource === "flow" || resource === "tree") {
    return JSON.stringify({
      resource,
      prompt: normalizeToken(card?.prompt),
      question: normalizeToken(card?.question),
      options: normalizedList(collectChoiceOptionTexts(card.options)),
      values: JSON.stringify(resource === "flow" ? (card?.structure || "") : (card?.nodes || ""))
    });
  }
  return normalizeToken(cardMainText(card));
}

function gapLooksLikeRepeatedCase(current = {}, previous = {}) {
  const currentGap = extractGapMetadata(current);
  const previousGap = extractGapMetadata(previous);
  if (!currentGap || !previousGap) {
    return false;
  }
  if (!currentGap.answer || currentGap.answer !== previousGap.answer) {
    return false;
  }
  if (overlapRatio(currentGap.options, previousGap.options) < 0.66) {
    return false;
  }
  return overlapRatio(currentGap.stemTokens, previousGap.stemTokens) >= 0.5;
}

export function validateGeneratedCardsDidactic(cards = [], generationContract = {}) {
  const didacticErrors = [];
  const didacticWarnings = [];
  const directIssues = [];
  const planByPosition = new Map((Array.isArray(generationContract?.plan) ? generationContract.plan : []).map((item) => [Number(item.position), item]));
  const guide = generationContract?.guide || {};
  const knownErrorSignals = [
    ...(Array.isArray(generationContract?.knownErrors) ? generationContract.knownErrors : []),
    ...(Array.isArray(generationContract?.microsequence?.checks) ? generationContract.microsequence.checks : []),
    ...(Array.isArray(generationContract?.plan) ? generationContract.plan.flatMap((item) => item?.checks || []) : []),
    ...((Array.isArray(generationContract?.context?.refs) ? generationContract.context.refs : []).flatMap((item) => item?.checks || [])),
    ...(Array.isArray(generationContract?.context?.next?.checks) ? generationContract.context.next.checks : [])
  ].map((item) => text(item)).filter(Boolean);
  const firstPlanCard = Array.isArray(generationContract?.plan) ? generationContract.plan[0] : null;
  const sortedCards = cards.slice().sort((a, b) => Number(a.position) - Number(b.position));

  cards.forEach((card, index) => {
    const prefix = `cards[${index}]`;
    const planned = planByPosition.get(Number(card?.position));
    const looksLikePractice = plannedRoleLooksLikePractice(planned?.role) || text(card.kind) === "exercise";
    const isFixError = text(planned?.role) === "fix_error";
    const mentionsAvoid = mentionsForbiddenTerms(card, guide.avoid);
    const mentionsKnownError = mentionsKnownSignal(card, knownErrorSignals);
    const explicitErrorFraming = /\b(confus[aã]o|confundir|troca|equ[ii]voco|erro)\b/iu.test(cardFullText(card));

    if (text(card.kind) === "theory" && hasGapSyntax(card.text)) {
      directIssues.push(`${prefix} kind=theory não pode conter lacunas.`);
    }
    if (text(card.resource) === "paragraph" && !text(card.text)) {
      directIssues.push(`${prefix} paragraph precisa ter text não vazio.`);
    }
    if (text(card.resource) === "choice" && !text(card.question)) {
      directIssues.push(`${prefix} choice precisa ter question não vazio.`);
    }
    if (text(card.kind) === "theory" && requiresNarrativePrompt(card) && !text(card.prompt)) {
      directIssues.push(`${prefix} card teórico visual precisa ter prompt curto explicando o caso no próprio card.`);
    }
    if (text(card.kind) === "exercise" && !["gap", "choice"].includes(text(card.exercise))) {
      directIssues.push(`${prefix} kind=exercise precisa usar exercise gap ou choice.`);
    }
    if (looksLikePractice && cardLooksOpenEndedPractice(card)) {
      directIssues.push(`${prefix} prática aberta: use lacuna por opções ou choice.`);
    }
    if (looksLikePractice && referencesExternalCase(card) && !cardMaterializesContext(card)) {
      directIssues.push(`${prefix} cita contexto externo sem materializar os dados necessários no próprio card.`);
    }
    if (containsInternalTechnicalLanguage(card)) {
      directIssues.push(`${prefix} linguagem técnica interna rejeitada.`);
    }
    if (mentionsForbiddenTerms(card, guide.exclude)) {
      directIssues.push(`${prefix} usa termo proibido de guide.exclude.`);
    }
    if (mentionsAvoid && (!isFixError || !mentionsKnownError)) {
      directIssues.push(`${prefix} usa termo de guide.avoid.`);
    }
    if (isFixError && knownErrorSignals.length && explicitErrorFraming && !mentionsKnownError) {
      directIssues.push(`${prefix} fix_error precisa corrigir erro conhecido do escopo.`);
    }
  });

  sortedCards.forEach((card, index) => {
    if (index === 0) {
      return;
    }
    const currentPlan = planByPosition.get(Number(card?.position));
    const previousCard = sortedCards[index - 1];
    const previousPlan = planByPosition.get(Number(previousCard?.position));
    const currentRole = text(currentPlan?.role);
    const previousRole = text(previousPlan?.role);
    if (!["practice_more", "fix_error"].includes(currentRole)) {
      return;
    }
    if (!plannedRoleLooksLikePractice(previousRole)) {
      return;
    }
    if (cardCaseSignature(card) === cardCaseSignature(previousCard)) {
      directIssues.push(`cards[${index}] ${currentRole} repete o mesmo caso do card anterior sem variação suficiente.`);
      return;
    }
    if (text(card?.resource) === "paragraph" && text(previousCard?.resource) === "paragraph" && gapLooksLikeRepeatedCase(card, previousCard)) {
      directIssues.push(`cards[${index}] ${currentRole} reaproveita o mesmo caso concreto do card anterior com pouca variação didática.`);
    }
  });

  if (firstPlanCard && text(firstPlanCard.kind) === "theory") {
    const firstGenerated = cards.slice().sort((a, b) => Number(a.position) - Number(b.position))[0];
    if (firstGenerated && text(firstGenerated.kind) !== "theory") {
      directIssues.push("cards[0] prática antes da explicação inicial.");
    }
  }

  didacticErrors.push(...directIssues);

  return {
    ok: didacticErrors.length === 0,
    didacticErrors,
    didacticWarnings,
    didacticAudit: {
      directIssues: directIssues.map((message) => ({ message, blocksValidation: true })),
      blockingIssues: directIssues.map((message) => ({ message, blocksValidation: true })),
      actionableIssues: [],
      heuristicSignals: [],
      allIssues: directIssues.map((message) => ({ message, blocksValidation: true }))
    }
  };
}
