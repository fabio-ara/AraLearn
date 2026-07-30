import { parseTextGapTokens } from "../../core/textGaps.js";

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalized(value) {
  return text(value)
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/gu, " ");
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

const VISIBLE_SCALAR_FIELDS = new Set([
  "title",
  "value",
  "text",
  "prompt",
  "question",
  "after",
  "accessibleText",
  "code",
  "name",
  "label",
  "unit",
  "detail",
  "note",
  "feedback",
  "weight",
  "condition",
  "expression",
  "init",
  "update",
  "iterator",
  "iterable",
  "match",
  "connector",
  "form",
  "traditional",
  "simplified",
  "reading",
  "ipa",
  "gloss",
  "translation",
  "result",
  "reactionType",
  "formula",
  "coefficient",
  "state",
  "charge"
]);
const VISIBLE_COLLECTION_FIELDS = new Set([
  "columns",
  "rows",
  "values",
  "pairList",
  "result",
  "x",
  "y",
  "vector",
  "vectors",
  "sum",
  "distance",
  "options",
  "variants",
  "shapeOptions",
  "conditions"
]);
const TECHNICAL_FIELDS = new Set([
  "id",
  "resource",
  "kind",
  "exercise",
  "position",
  "parentId",
  "from",
  "to",
  "targetIds",
  "itemIds",
  "answerIds",
  "sources",
  "topics"
]);

const TRIVIAL_GAP_ANSWERS = new Set([
  "true",
  "false",
  "verdadeiro",
  "falso",
  "sim",
  "nao",
  "yes",
  "no",
  "null",
  "undefined",
  "none",
  "nil",
  "e",
  "ou",
  "and",
  "or",
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "de",
  "do",
  "da",
  "em"
]);
const GAP_MASK = "⟦…⟧";
const ANSWER_REVEAL_PATTERN =
  /(?:\b(?:resposta(?: correta)?|resultado|valor correto|alternativa correta|solucao|answer|correct answer)\b\s*(?:e|is|:)|\bgabarito\b)/iu;
const EXTERNAL_REFERENCE_PATTERN =
  /\b(card anterior|tabela acima|material fornecido|material anexo|pdf anexo|no pdf|como visto anteriormente)\b/giu;
const SIGNED_NUMBER_SOURCE = "[+\\-−]?\\d+(?:[.,]\\d+)?";

function collectVisibleEntries(value, fieldName = "", path = "$") {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectVisibleEntries(item, fieldName, `${path}[${index}]`)
    );
  }
  if (typeof value !== "object") {
    return VISIBLE_SCALAR_FIELDS.has(fieldName) ||
      VISIBLE_COLLECTION_FIELDS.has(fieldName)
      ? [{ path, value: text(value) }].filter((entry) => entry.value)
      : [];
  }
  return Object.entries(value).flatMap(([childFieldName, childValue]) => {
    if (TECHNICAL_FIELDS.has(childFieldName)) return [];
    return collectVisibleEntries(
      childValue,
      childFieldName,
      `${path}.${childFieldName}`
    );
  });
}

function guideTerms(contextPacket, fieldName) {
  const terms = [
    contextPacket?.hierarchy?.module?.guide,
    contextPacket?.hierarchy?.lesson?.guide
  ].flatMap((guide) =>
    guide && Array.isArray(guide[fieldName])
      ? guide[fieldName]
      : []
  ).map(text).filter(Boolean);
  const seen = new Set();
  return terms.filter((term) => {
    const key = normalized(term);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function termMentionCount(value, term) {
  const source = normalized(value);
  const token = normalized(term);
  if (!source || token.length < 3) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= source.length - token.length) {
    const index = source.indexOf(token, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + token.length;
  }
  return count;
}

function guideTermFindings(entries, terms, code, message) {
  return entries.flatMap((entry) =>
    terms.flatMap((term) => {
      const count = termMentionCount(entry.value, term);
      return Array.from({ length: count }, (_unused, index) => ({
        code,
        path: entry.path,
        term: normalized(term),
        occurrence: index + 1,
        message
      }));
    })
  );
}

function externalReferenceFindings(entries) {
  return entries.flatMap((entry) => {
    const matches = [...normalized(entry.value).matchAll(EXTERNAL_REFERENCE_PATTERN)];
    return matches.map((match, index) => ({
      code: "external_reference_dependency",
      path: entry.path,
      term: normalized(match[0]),
      occurrence: index + 1,
      message:
        "O card depende de uma referência externa em vez de materializar o contexto."
    }));
  });
}

function maskCompiledTextGaps(value, path, answers) {
  if (typeof value === "string") {
    const tokens = parseTextGapTokens(value);
    if (!tokens.length) return value;
    let cursor = 0;
    let masked = "";
    tokens.forEach((token) => {
      masked += value.slice(cursor, token.start);
      masked += GAP_MASK;
      cursor = token.end;
      answers.push({ answer: token.answer, path });
    });
    return `${masked}${value.slice(cursor)}`;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      maskCompiledTextGaps(item, `${path}[${index}]`, answers)
    );
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([fieldName, childValue]) => [
      fieldName,
      maskCompiledTextGaps(childValue, `${path}.${fieldName}`, answers)
    ])
  );
}

function flowTextFieldName(value = {}) {
  const kind = text(value.kind);
  if (["start", "end", "input", "output", "process"].includes(kind)) {
    return "text";
  }
  if (["if_then", "if_then_else", "while", "do_while", "for"].includes(kind)) {
    return "condition";
  }
  return "";
}

function flowPracticeEntryIsActive(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (
      value.blank === true ||
      (Array.isArray(value.options) && value.options.length > 0) ||
      (Array.isArray(value.variants) && value.variants.length > 0)
    )
  );
}

function maskFlowPracticeOwner(owner, fieldName, path, answers) {
  if (!fieldName || !flowPracticeEntryIsActive(owner?.practice?.text)) return;
  const answer = text(owner[fieldName]);
  if (answer) answers.push({ answer, path: `${path}.${fieldName}` });
  owner[fieldName] = GAP_MASK;
  delete owner.practice;
}

function maskCompiledFlowGaps(node, path, answers) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  maskFlowPracticeOwner(node, flowTextFieldName(node), path, answers);

  ["items", "thenBranch", "elseBranch", "body", "defaultBranch"].forEach(
    (fieldName) => {
      list(node[fieldName]).forEach((child, index) => {
        maskCompiledFlowGaps(child, `${path}.${fieldName}[${index}]`, answers);
      });
    }
  );
  list(node.cases).forEach((caseValue, index) => {
    const casePath = `${path}.cases[${index}]`;
    if (text(node.kind) === "if_chain") {
      maskFlowPracticeOwner(caseValue, "condition", casePath, answers);
    }
    ["thenBranch", "body"].forEach((fieldName) => {
      list(caseValue?.[fieldName]).forEach((child, childIndex) => {
        maskCompiledFlowGaps(
          child,
          `${casePath}.${fieldName}[${childIndex}]`,
          answers
        );
      });
    });
  });
  list(node.branches).forEach((branch, index) => {
    list(branch?.items).forEach((child, childIndex) => {
      maskCompiledFlowGaps(
        child,
        `${path}.branches[${index}].items[${childIndex}]`,
        answers
      );
    });
  });
}

function maskStructuredFlowGaps(card, answers) {
  if (text(card?.resource) === "flow") {
    maskCompiledFlowGaps(card.structure, "$.structure", answers);
  }
  ["blocks", "afterBlocks"].forEach((collectionName) => {
    list(card?.[collectionName]).forEach((block, index) => {
      if (text(block?.kind) === "flow") {
        maskCompiledFlowGaps(
          block.structure,
          `$.${collectionName}[${index}].structure`,
          answers
        );
      }
    });
  });
}

function semanticTokens(value) {
  return normalized(value).match(/[\p{L}\p{N}]+/gu) || [];
}

function gapAnswerIsTrivial(value) {
  const comparable = normalized(value);
  if (!comparable || TRIVIAL_GAP_ANSWERS.has(comparable)) return true;
  if (/^[^\p{L}\p{N}]+$/u.test(comparable)) return true;
  if (/^[+\-−]?\d+(?:[.,]\d+)?(?:\s*%)?$/u.test(comparable)) return true;
  const tokens = semanticTokens(comparable);
  if (!tokens.length) return true;
  return tokens.length === 1 && [...tokens[0]].length === 1;
}

function numberValue(value) {
  const source = normalized(value).replace(/−/gu, "-").replace(",", ".");
  return new RegExp(`^${SIGNED_NUMBER_SOURCE}$`, "u").test(normalized(value))
    ? Number(source)
    : null;
}

function coordinateValues(value) {
  const source = normalized(value);
  const match = new RegExp(
    `^[([]\\s*(${SIGNED_NUMBER_SOURCE})\\s*[,;]\\s*(${SIGNED_NUMBER_SOURCE})\\s*[)\\]]$`,
    "u"
  ).exec(source);
  if (!match) return null;
  const values = match.slice(1).map(numberValue);
  return values.every(Number.isFinite) ? values : null;
}

function candidateCoordinates(value) {
  const source = normalized(value);
  const pattern = new RegExp(
    `[([]\\s*(${SIGNED_NUMBER_SOURCE})\\s*[,;]\\s*(${SIGNED_NUMBER_SOURCE})\\s*[)\\]]`,
    "gu"
  );
  return [...source.matchAll(pattern)].flatMap((match) => {
    const values = match.slice(1).map(numberValue);
    return values.every(Number.isFinite) ? [values] : [];
  });
}

function sameNumbers(left, right) {
  return left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]) || value === right[index]);
}

function symbolicComparable(value) {
  const comparable = normalized(value)
    .replace(/−/gu, "-")
    .replace(/\s+/gu, "");
  return /[+\-*/=<>≤≥]/u.test(comparable) ? comparable : "";
}

function containsLiteral(candidate, answer) {
  const source = normalized(candidate);
  const expected = normalized(answer);
  if (!source || !expected) return false;
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
    "u"
  ).test(source);
}

function containsAnswer(candidate, answer) {
  const answerCoordinate = coordinateValues(answer);
  if (answerCoordinate) {
    return candidateCoordinates(candidate).some((coordinate) =>
      sameNumbers(coordinate, answerCoordinate)
    );
  }
  const answerNumber = numberValue(answer);
  if (Number.isFinite(answerNumber)) {
    return containsLiteral(candidate, answer);
  }
  const answerSymbolic = symbolicComparable(answer);
  if (answerSymbolic) {
    return symbolicComparable(candidate).includes(answerSymbolic);
  }
  const candidateTokens = semanticTokens(candidate);
  const answerTokens = semanticTokens(answer);
  if (!answerTokens.length || candidateTokens.length < answerTokens.length) {
    return false;
  }
  return candidateTokens.some((_token, startIndex) =>
    answerTokens.every(
      (answerToken, offset) =>
        candidateTokens[startIndex + offset] === answerToken
    )
  );
}

function unequivocallyRevealsAnswer(candidate, answer) {
  return ANSWER_REVEAL_PATTERN.test(normalized(candidate)) &&
    containsAnswer(candidate, answer);
}

function finitePair(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const pair = value.map(Number);
  return pair.every(Number.isFinite) ? pair : null;
}

function numberText(value) {
  const number = Number(value);
  return String(Object.is(number, -0) ? 0 : number);
}

function coordinateText(value) {
  const pair = finitePair(value);
  return pair ? `(${numberText(pair[0])}, ${numberText(pair[1])})` : "";
}

function planeDerivedEntries(value, path) {
  const result = [];
  function addCoordinate(pair, suffix) {
    const coordinate = coordinateText(pair);
    if (coordinate) {
      result.push({ path: `${path}.geometry.${suffix}`, value: coordinate });
    }
  }
  addCoordinate(value?.vector, "vector");
  list(value?.vectors).forEach((vector, index) => {
    addCoordinate(vector, `vectors[${index}]`);
  });
  if (Array.isArray(value?.sum) && value.sum.length === 2) {
    const first = finitePair(value.sum[0]);
    const second = finitePair(value.sum[1]);
    if (first && second) {
      addCoordinate(first, "sum[0]");
      addCoordinate(second, "sum[1]");
    }
  }
  const scaleVector = finitePair(value?.scale?.vector);
  if (scaleVector) {
    addCoordinate(scaleVector, "scale.vector");
  }
  if (Array.isArray(value?.distance) && value.distance.length === 2) {
    addCoordinate(value.distance[0], "distance[0]");
    addCoordinate(value.distance[1], "distance[1]");
  }
  return result;
}

function collectPlaneDerivedEntries(card = {}) {
  const result = [];
  if (text(card.resource) === "plane") {
    result.push(...planeDerivedEntries(card, "$"));
  }
  ["blocks"].forEach((collectionName) => {
    list(card[collectionName]).forEach((block, index) => {
      if (text(block?.kind) === "plane") {
        result.push(
          ...planeDerivedEntries(block, `$.${collectionName}[${index}]`)
        );
      }
    });
  });
  return result;
}

function collectPreAttemptVisibleEntries(card = {}) {
  return collectVisibleEntries(card).filter((entry) =>
    entry.path !== "$.after" &&
    !entry.path.startsWith("$.afterBlocks")
  );
}

function gapAnswerLeakFindings(card = {}) {
  if (text(card.exercise) !== "gap") return [];
  const answers = [];
  const maskedCard = maskCompiledTextGaps(card, "$", answers);
  maskStructuredFlowGaps(maskedCard, answers);
  if (!answers.length) return [];

  const visibleEntries = [
    ...collectPreAttemptVisibleEntries(maskedCard),
    ...collectPlaneDerivedEntries(maskedCard)
  ];
  const seen = new Set();
  return answers.flatMap((entry) => {
    const answerKey = normalized(entry.answer);
    if (seen.has(answerKey)) return [];
    seen.add(answerKey);
    const trivial = gapAnswerIsTrivial(entry.answer);
    const leaks = visibleEntries.filter((candidate) =>
      trivial
        ? unequivocallyRevealsAnswer(candidate.value, entry.answer)
        : containsAnswer(candidate.value, entry.answer)
    );
    return leaks.map((leak, index) => ({
      code: "gap_answer_leak",
      path: leak.path,
      answerPath: entry.path,
      term: answerKey,
      occurrence: index + 1,
      message:
        `A resposta da lacuna "${entry.answer}" está exposta fora do próprio campo interativo (${leak.path}).`
    }));
  });
}

function authorizedSourceIds(contextPacket = {}) {
  const result = new Set(
    list(contextPacket.authorizedSources)
      .flatMap((source) => [text(source?.id), text(source?.name)])
      .filter(Boolean)
  );
  ["previous", "current", "next"].forEach((location) => {
    list(contextPacket?.cards?.[location]?.sources)
      .map(text)
      .filter(Boolean)
      .forEach((sourceId) => result.add(sourceId));
  });
  return result;
}

export function validateCardAssistanceSemantics(card = {}, contextPacket = {}) {
  const visibleEntries = collectVisibleEntries(card);
  const excludedTerms = guideTerms(contextPacket, "exclude");
  const avoidedTerms = guideTerms(contextPacket, "avoid");
  const findings = [
    ...guideTermFindings(
      visibleEntries,
      excludedTerms,
      "guide_exclude",
      "O card usa conteúdo excluído pelo guide da autoria."
    ),
    ...guideTermFindings(
      visibleEntries,
      avoidedTerms,
      "guide_avoid",
      "O card usa conteúdo que o guide orienta evitar."
    ),
    ...externalReferenceFindings(visibleEntries)
  ];

  const allowedSources = authorizedSourceIds(contextPacket);
  list(card.sources).map(text).filter(Boolean).forEach((sourceId, index) => {
    if (!allowedSources.has(sourceId)) {
      findings.push({
        code: "unauthorized_source",
        path: `$.sources[${index}]`,
        term: sourceId,
        occurrence: 1,
        message: `O card referencia source não autorizado: ${sourceId}.`
      });
    }
  });
  findings.push(...gapAnswerLeakFindings(card));
  const errors = [...new Set(findings.map((finding) => finding.message))];

  return {
    ok: errors.length === 0,
    errors,
    findings
  };
}

export function cardAssistanceSemanticFindingKey(finding = {}) {
  return JSON.stringify([
    text(finding.code),
    text(finding.path),
    text(finding.answerPath),
    text(finding.term),
    Number.isInteger(finding.occurrence) ? finding.occurrence : 0
  ]);
}
