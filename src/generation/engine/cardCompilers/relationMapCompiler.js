import { parsePipeList } from "../slotParser.js";
import { compileSingleChoiceFields } from "./choiceOptionCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseRelationItemsSlot(value = "") {
  const source = text(value).replace(/^[{[]|[}\]]$/gu, "");
  if (!source) {
    throw new Error("conjunto da relação precisa ter ao menos um item");
  }
  const items = source.includes("|")
    ? parsePipeList(source)
    : source.split(",").map((item) => text(item)).filter(Boolean);
  if (!items.length) {
    throw new Error("conjunto da relação precisa ter ao menos um item");
  }
  return items;
}

function splitRelationEntries(value = "") {
  const source = text(value).replace(/^\{|\}$/gu, "");
  if (!source) {
    return [];
  }
  if (source.includes("|")) {
    return parsePipeList(source);
  }
  const matches = [...source.matchAll(/([^|,]+?(?:->|>|-)\s*[^|,]+)(?=\s*(?:,|$))/gu)].map((match) => text(match[1]));
  if (matches.length) {
    return matches;
  }
  return source.split(",").map((item) => text(item)).filter(Boolean);
}

export function parseRelationPairToken(value = "") {
  const source = text(value).replace(/^\(|\)$/gu, "");
  if (!source) {
    throw new Error("par de relação vazio");
  }
  if (source.includes("->")) {
    const [fromLabel, toLabel] = source.split("->").map((item) => text(item));
    if (fromLabel && toLabel) {
      return [fromLabel, toLabel];
    }
  }
  if (source.includes(">")) {
    const [fromLabel, toLabel] = source.split(">").map((item) => text(item));
    if (fromLabel && toLabel) {
      return [fromLabel, toLabel];
    }
  }
  const hyphenParts = source.split(/\s*-\s*/u).map((item) => text(item)).filter(Boolean);
  if (hyphenParts.length === 2) {
    return hyphenParts;
  }
  const commaParts = source.split(/\s*,\s*/u).map((item) => text(item)).filter(Boolean);
  if (commaParts.length === 2) {
    return commaParts;
  }
  throw new Error("par de relação precisa usar item-esquerdo - item-direito");
}

export function parseRelationPairsSlot(value = "", { leftItems = [], rightItems = [] } = {}) {
  const pairs = splitRelationEntries(value).map((entry) => {
    const [fromLabel, toLabel] = parseRelationPairToken(entry);
    return { fromLabel, toLabel };
  });
  if (!pairs.length) {
    throw new Error("relação precisa ter ao menos um par");
  }
  const leftSet = new Set((Array.isArray(leftItems) ? leftItems : []).map((item) => text(item)));
  const rightSet = new Set((Array.isArray(rightItems) ? rightItems : []).map((item) => text(item)));
  pairs.forEach((pair) => {
    if (leftSet.size && !leftSet.has(pair.fromLabel)) {
      throw new Error(`item esquerdo inexistente na relação: ${pair.fromLabel}`);
    }
    if (rightSet.size && !rightSet.has(pair.toLabel)) {
      throw new Error(`item direito inexistente na relação: ${pair.toLabel}`);
    }
  });
  return pairs;
}

function setFromPipe(label, value, prefix) {
  return {
    label,
    items: parseRelationItemsSlot(value).map((item, index) => ({
      id: `${prefix}${index + 1}`,
      label: item
    }))
  };
}

export function compileRelationMapCard({ slots = {}, position = 0 }) {
  const leftSet = setFromPipe("U", slots[3], "u");
  const rightSet = setFromPipe("V", slots[4], "v");
  const leftMap = new Map(leftSet.items.map((item) => [item.label, item.id]));
  const rightMap = new Map(rightSet.items.map((item) => [item.label, item.id]));
  const relations = parseRelationPairsSlot(slots[5], {
    leftItems: leftSet.items.map((item) => item.label),
    rightItems: rightSet.items.map((item) => item.label)
  }).map(({ fromLabel, toLabel }) => {
    return {
      from: leftMap.get(fromLabel) || fromLabel,
      to: rightMap.get(toLabel) || toLabel
    };
  });
  return {
    position,
    resource: "relation_map",
    kind: "exercise",
    exercise: "choice",
    title: text(slots[1]),
    prompt: text(slots[2]),
    leftSet,
    rightSet,
    relations,
    question: text(slots[6]),
    ...compileSingleChoiceFields({ slots, optionStartIndex: 7, answerIndex: 10 }),
    after: text(slots[11])
  };
}
