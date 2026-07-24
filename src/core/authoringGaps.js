import {
  flowHasStructuredPractice,
  listResourceGapFields,
  resourceSupportsGap
} from "./resourceGaps.js";
import { buildTextGapToken, hasTextGapSyntax } from "./textGaps.js";

const GAP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const GAP_MARKER_PATTERN = /\{gap:([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\}/gu;
const GAP_NOTATION_PATTERN = /\{gap(?:[:\s}])/iu;
const PATH_PART_PATTERN = /([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]/gu;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAnswer(value) {
  return text(value).normalize("NFKC").toLowerCase();
}

function isValidAnswerLiteral(value) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 120
    && value === value.trim()
    && !/[\r\n]/u.test(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function markerFor(id) {
  return `{gap:${id}}`;
}

function markerIds(value) {
  return [...String(value ?? "").matchAll(GAP_MARKER_PATTERN)].map((match) => match[1]);
}

function assertNoResidualGapNotation(value, basePath) {
  const serialized = JSON.stringify(value);
  const remaining = markerIds(serialized);
  if (remaining.length) {
    fail(
      basePath,
      "marker_outside_target",
      `O marcador ${markerFor(remaining[0])} aparece fora do alvo declarado.`
    );
  }
  if (GAP_NOTATION_PATTERN.test(serialized)) {
    fail(
      basePath,
      "malformed_marker",
      "Há uma notação de lacuna malformada ou fora de um campo interativo."
    );
  }
}

function assertNoAuthoringRegex(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoAuthoringRegex(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  Object.entries(value).forEach(([key, item]) => {
    const itemPath = `${path}.${key}`;
    if (key === "regex") {
      fail(
        itemPath,
        "unsupported_regex",
        "A autoria aceita somente respostas alternativas literais; remova regex."
      );
    }
    assertNoAuthoringRegex(item, itemPath);
  });
}

function assertLiteralFlowVariants(card, basePath) {
  if (text(card?.resource) === "flow") {
    assertNoAuthoringRegex(card?.structure, `${basePath}.structure`);
    return;
  }
  if (text(card?.resource) !== "composite") return;

  (Array.isArray(card?.blocks) ? card.blocks : []).forEach((block, index) => {
    if (text(block?.kind) === "flow") {
      assertNoAuthoringRegex(block?.structure, `${basePath}.blocks[${index}].structure`);
    }
  });
}

function flowPracticeEntry(definition) {
  const entry = { blank: true };
  if (definition.response === "choice") {
    entry.mode = "choice";
    entry.options = [
      {
        id: `gap-${definition.id}-answer`,
        value: definition.answer,
        enabled: true
      },
      ...definition.distractors.map((value, index) => ({
        id: `gap-${definition.id}-distractor-${index + 1}`,
        value,
        enabled: true
      }))
    ];
  } else if (definition.acceptedAnswers.length) {
    entry.variants = definition.acceptedAnswers.map((value, index) => ({
      id: `gap-${definition.id}-accepted-${index + 1}`,
      value
    }));
  }
  return entry;
}

function listFlowAuthoringFields(structure, path = "structure", result = []) {
  if (!structure || typeof structure !== "object" || Array.isArray(structure)) {
    return result;
  }
  const kind = text(structure.kind);
  if (["start", "end", "input", "output", "process"].includes(kind)) {
    result.push({ owner: structure, key: "text", path: `${path}.text`, value: structure.text });
  } else if (["if_then", "if_then_else", "while", "do_while", "for"].includes(kind)) {
    result.push({
      owner: structure,
      key: "condition",
      path: `${path}.condition`,
      value: structure.condition
    });
  }
  ["items", "thenBranch", "elseBranch", "body", "defaultBranch"].forEach((fieldName) => {
    (Array.isArray(structure[fieldName]) ? structure[fieldName] : []).forEach((item, index) => {
      listFlowAuthoringFields(item, `${path}.${fieldName}[${index}]`, result);
    });
  });
  if (kind === "if_chain") {
    (Array.isArray(structure.cases) ? structure.cases : []).forEach((caseValue, index) => {
      result.push({
        owner: caseValue,
        key: "condition",
        path: `${path}.cases[${index}].condition`,
        value: caseValue?.condition
      });
      (Array.isArray(caseValue?.thenBranch) ? caseValue.thenBranch : []).forEach(
        (item, itemIndex) => {
          listFlowAuthoringFields(
            item,
            `${path}.cases[${index}].thenBranch[${itemIndex}]`,
            result
          );
        }
      );
    });
  }
  if (kind === "switch_case") {
    (Array.isArray(structure.cases) ? structure.cases : []).forEach((caseValue, index) => {
      (Array.isArray(caseValue?.body) ? caseValue.body : []).forEach((item, itemIndex) => {
        listFlowAuthoringFields(
          item,
          `${path}.cases[${index}].body[${itemIndex}]`,
          result
        );
      });
    });
  }
  return result;
}

function compileFlowAuthoringGaps(result, definitions, byId, basePath) {
  const fields = listFlowAuthoringFields(result.structure);
  const markerLocations = new Map();
  fields.forEach((entry) => {
    if (hasTextGapSyntax(entry.value)) {
      fail(
        `${basePath}.${entry.path}`,
        "mixed_notation",
        "Não misture gaps declarativas com delimitadores internos [[...]]."
      );
    }
    const ids = markerIds(entry.value);
    ids.forEach((id) => {
      if (!byId.has(id)) {
        fail(
          `${basePath}.${entry.path}`,
          "undeclared_marker",
          `O marcador ${markerFor(id)} não possui definição em gaps.`
        );
      }
      const locations = markerLocations.get(id) || [];
      locations.push(entry.path);
      markerLocations.set(id, locations);
    });
  });
  definitions.forEach((definition, index) => {
    const locations = markerLocations.get(definition.id) || [];
    if (!locations.length) {
      fail(
        `${basePath}.gaps[${index}].id`,
        "marker_missing",
        `Inclua ${markerFor(definition.id)} no texto de um nó do fluxograma.`,
        { allowedTargets: fields.map((entry) => entry.path) }
      );
    }
    if (locations.length > 1) {
      fail(
        `${basePath}.gaps[${index}].id`,
        "marker_repeated",
        `${markerFor(definition.id)} deve aparecer uma única vez no recurso.`,
        { locations }
      );
    }
  });
  fields.forEach((entry) => {
    const ids = markerIds(entry.value);
    if (!ids.length) return;
    if (ids.length !== 1 || text(entry.value) !== markerFor(ids[0])) {
      fail(
        `${basePath}.${entry.path}`,
        "flow_marker_must_fill_field",
        "No recurso flow, o marcador deve ocupar sozinho o campo textual do nó."
      );
    }
    const definition = byId.get(ids[0]);
    if (entry.owner.practice?.text) {
      fail(
        `${basePath}.${entry.path}`,
        "practice_conflict",
        "O nó não pode combinar marcador autoral com practice.text já declarado."
      );
    }
    entry.owner[entry.key] = definition.answer;
    entry.owner.practice = {
      ...(entry.owner.practice && typeof entry.owner.practice === "object"
        ? entry.owner.practice
        : {}),
      text: flowPracticeEntry(definition)
    };
  });
  delete result.gaps;
  assertNoResidualGapNotation(result, basePath);
  return result;
}

function compileCompositeAuthoringGaps(result, definitions, byId, basePath) {
  const markerLocations = new Map();
  const fieldGroups = [];

  (Array.isArray(result.blocks) ? result.blocks : []).forEach((block, blockIndex) => {
    const blockPath = `blocks[${blockIndex}]`;
    const blockKind = text(block?.kind);
    const isFlow = blockKind === "flow";
    const fields = (isFlow
      ? listFlowAuthoringFields(block?.structure)
      : listResourceGapFields(block)
    ).map((entry) => ({
      ...entry,
      localPath: entry.path,
      path: `${blockPath}.${entry.path}`
    }));
    const markerOrder = [];

    fields.forEach((entry) => {
      if (hasTextGapSyntax(entry.value)) {
        fail(
          `${basePath}.${entry.path}`,
          "mixed_notation",
          "Não misture gaps declarativas com delimitadores internos [[...]]."
        );
      }
      const ids = markerIds(entry.value);
      ids.forEach((id) => {
        if (!byId.has(id)) {
          fail(
            `${basePath}.${entry.path}`,
            "undeclared_marker",
            `O marcador ${markerFor(id)} não possui definição em gaps.`
          );
        }
        const locations = markerLocations.get(id) || [];
        locations.push(entry.path);
        markerLocations.set(id, locations);
        markerOrder.push(id);
      });
    });

    fieldGroups.push({
      block,
      blockKind,
      blockPath,
      fields,
      isFlow,
      markerOrder
    });
  });

  definitions.forEach((definition, index) => {
    const locations = markerLocations.get(definition.id) || [];
    if (!locations.length) {
      fail(
        `${basePath}.gaps[${index}].id`,
        "marker_missing",
        `Inclua ${markerFor(definition.id)} em um campo interativo de um bloco.`,
        { allowedTargets: fieldGroups.flatMap((group) => group.fields.map((entry) => entry.path)) }
      );
    }
    if (locations.length > 1) {
      fail(
        `${basePath}.gaps[${index}].id`,
        "marker_repeated",
        `${markerFor(definition.id)} deve aparecer uma única vez no recurso.`,
        { locations }
      );
    }
  });

  fieldGroups.forEach((group) => {
    if (group.isFlow) {
      group.fields.forEach((entry) => {
        const ids = markerIds(entry.value);
        if (!ids.length) return;
        if (ids.length !== 1 || text(entry.value) !== markerFor(ids[0])) {
          fail(
            `${basePath}.${entry.path}`,
            "flow_marker_must_fill_field",
            "No recurso flow, o marcador deve ocupar sozinho o campo textual do nó."
          );
        }
        const definition = byId.get(ids[0]);
        if (entry.owner.practice?.text) {
          fail(
            `${basePath}.${entry.path}`,
            "practice_conflict",
            "O nó não pode combinar marcador autoral com practice.text já declarado."
          );
        }
        entry.owner[entry.key] = definition.answer;
        entry.owner.practice = {
          ...(entry.owner.practice && typeof entry.owner.practice === "object"
            ? entry.owner.practice
            : {}),
          text: flowPracticeEntry(definition)
        };
      });
      return;
    }

    group.fields.forEach((entry) => {
      setPath(result, entry.path, replaceMarkers(entry.value, byId));
    });
    if (group.blockKind === "formula") {
      if (hasTextGapSyntax(group.block?.accessibleText)) {
        fail(
          `${basePath}.${group.blockPath}.accessibleText`,
          "mixed_notation",
          "Não misture gaps declarativas com delimitadores internos [[...]]."
        );
      }
      const mirrorOrder = markerIds(group.block?.accessibleText);
      if (
        mirrorOrder.length !== group.markerOrder.length
        || mirrorOrder.some((id, index) => id !== group.markerOrder[index])
      ) {
        fail(
          `${basePath}.${group.blockPath}.accessibleText`,
          "accessibility_mirror_mismatch",
          "accessibleText deve repetir os mesmos marcadores da expressão, na mesma ordem."
        );
      }
      group.block.accessibleText = replaceMarkers(group.block.accessibleText, byId);
    }
  });

  delete result.gaps;
  assertNoResidualGapNotation(result, basePath);
  return result;
}

function pathParts(path) {
  const source = String(path || "");
  const parts = [];
  let consumed = "";
  for (const match of source.matchAll(PATH_PART_PATTERN)) {
    parts.push(match[1] ?? Number(match[2]));
    consumed += match[0];
    if (match.index + match[0].length < source.length && source[match.index + match[0].length] === ".") {
      consumed += ".";
    }
  }
  if (consumed.replace(/\.$/u, "") !== source) {
    throw new Error(`Caminho de lacuna inválido: ${source}.`);
  }
  return parts;
}

function setPath(root, path, value) {
  const parts = pathParts(path);
  let target = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    target = target?.[parts[index]];
    if (!target || typeof target !== "object") {
      throw new Error(`O alvo ${path} não existe no recurso.`);
    }
  }
  target[parts.at(-1)] = value;
}

function replaceMarkers(value, definitions) {
  return String(value ?? "").replace(GAP_MARKER_PATTERN, (marker, id) => {
    const definition = definitions.get(id);
    if (!definition) return marker;
    return buildTextGapToken(
      definition.answer,
      definition.response === "choice"
        ? [definition.answer, ...definition.distractors]
        : [],
      definition.response === "text"
        ? definition.acceptedAnswers
        : []
    );
  });
}

function fail(path, reason, message, details = {}) {
  throw new AuthoringGapError(message, { path, reason, details });
}

function validateGapDefinition(value, index, basePath) {
  const path = `${basePath}.gaps[${index}]`;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "wrong_type", "Cada lacuna deve ser um objeto.");
  }
  const allowed = new Set([
    "id",
    "response",
    "answer",
    "distractors",
    "acceptedAnswers"
  ]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    fail(`${path}.${unknown}`, "unknown_field", `Campo desconhecido na lacuna: ${unknown}.`);
  }
  const id = text(value.id);
  if (!GAP_ID_PATTERN.test(id)) {
    fail(`${path}.id`, "invalid_identifier", "id deve ser estável e usar letras, números, ponto, hífen, sublinhado ou dois-pontos.");
  }
  const response = text(value.response);
  if (!["choice", "text"].includes(response)) {
    fail(`${path}.response`, "invalid_value", "response deve ser choice ou text.");
  }
  if (!isValidAnswerLiteral(value.answer)) {
    fail(
      `${path}.answer`,
      "invalid_answer",
      "answer deve ter entre 1 e 120 caracteres, ocupar uma linha e não ter espaços nas extremidades."
    );
  }
  const answer = value.answer;
  if (Object.hasOwn(value, "distractors") && !Array.isArray(value.distractors)) {
    fail(`${path}.distractors`, "wrong_type", "distractors deve ser uma lista.");
  }
  if (Object.hasOwn(value, "acceptedAnswers") && !Array.isArray(value.acceptedAnswers)) {
    fail(
      `${path}.acceptedAnswers`,
      "wrong_type",
      "acceptedAnswers deve ser uma lista."
    );
  }
  const distractors = value.distractors || [];
  const acceptedAnswers = value.acceptedAnswers || [];
  if (distractors.some((item) => !isValidAnswerLiteral(item))) {
    fail(
      `${path}.distractors`,
      "invalid_distractor",
      "Cada distrator deve ter entre 1 e 120 caracteres, ocupar uma linha e não ter espaços nas extremidades."
    );
  }
  if (acceptedAnswers.some((item) => !isValidAnswerLiteral(item))) {
    fail(
      `${path}.acceptedAnswers`,
      "invalid_accepted_answer",
      "Cada resposta aceita deve ter entre 1 e 120 caracteres, ocupar uma linha e não ter espaços nas extremidades."
    );
  }
  const normalizedOptions = [answer, ...distractors].map(normalizeAnswer);
  if (new Set(normalizedOptions).size !== normalizedOptions.length) {
    fail(`${path}.distractors`, "duplicate_option", "A resposta e os distratores precisam ser distintos.");
  }
  const normalizedAcceptedAnswers = [answer, ...acceptedAnswers].map(normalizeAnswer);
  if (new Set(normalizedAcceptedAnswers).size !== normalizedAcceptedAnswers.length) {
    fail(
      `${path}.acceptedAnswers`,
      "duplicate_accepted_answer",
      "A resposta principal e as respostas aceitas precisam ser distintas."
    );
  }
  if (response === "choice" && (distractors.length < 1 || distractors.length > 5)) {
    fail(`${path}.distractors`, "invalid_count", "Uma lacuna choice precisa de 1 a 5 distratores.");
  }
  if (response === "text" && distractors.length) {
    fail(`${path}.distractors`, "unexpected_field", "Uma lacuna text não usa distratores.");
  }
  if (response === "choice" && acceptedAnswers.length) {
    fail(
      `${path}.acceptedAnswers`,
      "unexpected_field",
      "Uma lacuna choice não usa respostas alternativas digitadas."
    );
  }
  if (acceptedAnswers.length > 8) {
    fail(
      `${path}.acceptedAnswers`,
      "invalid_count",
      "Uma lacuna text aceita no máximo 8 respostas alternativas declaradas."
    );
  }
  return { id, response, answer, distractors, acceptedAnswers };
}

export class AuthoringGapError extends Error {
  constructor(message, { path = "fragment", reason = "invalid_gap", details = {} } = {}) {
    super(message);
    this.name = "AuthoringGapError";
    this.path = path;
    this.reason = reason;
    this.details = details;
  }
}

export function compileAuthoringCardGaps(card, basePath = "card") {
  const result = clone(card);
  assertLiteralFlowVariants(result, basePath);
  if (!Object.hasOwn(result || {}, "gaps")) {
    if (result?.kind === "exercise" && result?.exercise === "gap") {
      const usesStructuredFlowPractice =
        (
          result.resource === "flow"
          && flowHasStructuredPractice(result)
        )
        || (
          result.resource === "composite"
          && (Array.isArray(result.blocks) ? result.blocks : []).some(
            (block) => text(block?.kind) === "flow" && flowHasStructuredPractice(block)
          )
        );
      if (usesStructuredFlowPractice) {
        if (GAP_NOTATION_PATTERN.test(JSON.stringify(result))) {
          fail(
            `${basePath}.gaps`,
            "formal_gaps_required",
            "Marcadores {gap:id} exigem a lista gaps; práticas estruturadas de flow usam somente practice."
          );
        }
        return result;
      }
      fail(
        `${basePath}.gaps`,
        "formal_gaps_required",
        "Cards de lacuna enviados à autoria devem declarar gaps e usar marcadores {gap:id}."
      );
    }
    return result;
  }

  if (!Array.isArray(result.gaps) || !result.gaps.length) {
    fail(`${basePath}.gaps`, "invalid_count", "gaps deve conter ao menos uma lacuna.");
  }
  if (result.gaps.length > 120) {
    fail(`${basePath}.gaps`, "invalid_count", "gaps deve conter no máximo 120 lacunas.");
  }
  if (result.kind !== "exercise" || result.exercise !== "gap") {
    fail(
      `${basePath}.gaps`,
      "incompatible_exercise",
      "gaps só pode ser usado em card exercise com exercise gap."
    );
  }
  if (!resourceSupportsGap(result.resource)) {
    fail(
      `${basePath}.resource`,
      "unsupported_resource",
      `O recurso ${text(result.resource) || "(ausente)"} não aceita lacunas.`
    );
  }

  const definitions = result.gaps.map((entry, index) =>
    validateGapDefinition(entry, index, basePath)
  );
  const byId = new Map();
  definitions.forEach((definition, index) => {
    if (byId.has(definition.id)) {
      fail(
        `${basePath}.gaps[${index}].id`,
        "duplicate_id",
        `A lacuna ${definition.id} foi declarada mais de uma vez.`
      );
    }
    byId.set(definition.id, definition);
  });

  if (result.resource === "flow") {
    return compileFlowAuthoringGaps(result, definitions, byId, basePath);
  }
  if (result.resource === "composite") {
    return compileCompositeAuthoringGaps(result, definitions, byId, basePath);
  }

  const fields = listResourceGapFields(result);
  const markerLocations = new Map();
  const markerOrder = [];
  fields.forEach((entry) => {
    if (hasTextGapSyntax(entry.value)) {
      fail(
        `${basePath}.${entry.path}`,
        "mixed_notation",
        "Não misture gaps declarativas com delimitadores internos [[...]]."
      );
    }
    markerIds(entry.value).forEach((id) => {
      const definition = byId.get(id);
      if (!definition) {
        fail(
          `${basePath}.${entry.path}`,
          "undeclared_marker",
          `O marcador ${markerFor(id)} não possui definição em gaps.`
        );
      }
      const locations = markerLocations.get(id) || [];
      locations.push(entry.path);
      markerLocations.set(id, locations);
      markerOrder.push(id);
    });
  });

  definitions.forEach((definition, index) => {
    const locations = markerLocations.get(definition.id) || [];
    if (!locations.length) {
      fail(
        `${basePath}.gaps[${index}].id`,
        "marker_missing",
        `Inclua ${markerFor(definition.id)} em um campo interativo de ${result.resource}.`,
        { allowedTargets: fields.map((entry) => entry.path) }
      );
    }
    if (locations.length > 1) {
      fail(
        `${basePath}.gaps[${index}].id`,
        "marker_repeated",
        `${markerFor(definition.id)} deve aparecer uma única vez no recurso.`,
        { locations }
      );
    }
  });

  fields.forEach((entry) => {
    setPath(result, entry.path, replaceMarkers(entry.value, byId));
  });

  if (result.resource === "formula") {
    const mirrorOrder = markerIds(result.accessibleText);
    if (
      mirrorOrder.length !== markerOrder.length
      || mirrorOrder.some((id, index) => id !== markerOrder[index])
    ) {
      fail(
        `${basePath}.accessibleText`,
        "accessibility_mirror_mismatch",
        "accessibleText deve repetir os mesmos marcadores da expressão, na mesma ordem."
      );
    }
    result.accessibleText = replaceMarkers(result.accessibleText, byId);
  }

  delete result.gaps;
  assertNoResidualGapNotation(result, basePath);
  return result;
}

export function compileAuthoringFragmentGaps(fragment) {
  const result = clone(fragment);
  const microsequences = Array.isArray(result?.microsequences)
    ? result.microsequences
    : result?.microsequence
      ? [result.microsequence]
      : Array.isArray(result?.cards)
        ? [result]
        : [];
  microsequences.forEach((microsequence, microsequenceIndex) => {
    if (!Array.isArray(microsequence?.cards)) return;
    microsequence.cards = microsequence.cards.map((card, cardIndex) =>
      compileAuthoringCardGaps(
        card,
        `fragment.microsequences[${microsequenceIndex}].cards[${cardIndex}]`
      )
    );
  });
  return result;
}
