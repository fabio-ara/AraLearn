const CSS_IDENTIFIER_PATTERN = /[.#](-?(?:[_a-zA-Z]|[^\0-\x7f])(?:[_a-zA-Z0-9-]|[^\0-\x7f])*)/gu;

const DYNAMIC_CLASS_PREFIXES = Object.freeze([
  // Os tons do plano cartesiano são compostos a partir do contrato do card.
  "tone-"
]);

function findBlockEnd(source, openIndex) {
  let depth = 1;
  let quote = "";
  let escaped = false;
  let inComment = false;

  for (let index = openIndex + 1; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "/" && next === "*") {
      inComment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Folha de estilos inválida: bloco CSS não foi fechado.");
}

function findNextBlockStart(source, startIndex) {
  let quote = "";
  let escaped = false;
  let inComment = false;
  let parentheses = 0;
  let brackets = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "/" && next === "*") {
      inComment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(") {
      parentheses += 1;
    } else if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
    } else if (character === "[") {
      brackets += 1;
    } else if (character === "]") {
      brackets = Math.max(0, brackets - 1);
    } else if (character === "{" && parentheses === 0 && brackets === 0) {
      return index;
    }
  }
  return -1;
}

function splitSelectors(selectorList) {
  const selectors = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;

  for (let index = 0; index < selectorList.length; index += 1) {
    const character = selectorList[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (character === "," && parentheses === 0 && brackets === 0) {
      selectors.push(selectorList.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(selectorList.slice(start).trim());
  return selectors.filter(Boolean);
}

function collectRuntimeIdentifiers(runtimeSources) {
  const identifiers = new Set();
  for (const match of String(runtimeSources || "").matchAll(/-?(?:[_a-zA-Z]|[^\0-\x7f])(?:[_a-zA-Z0-9-]|[^\0-\x7f])*/gu)) {
    identifiers.add(match[0]);
  }
  return identifiers;
}

function selectorIsUsed(selector, runtimeIdentifiers) {
  const identifiers = [...selector.matchAll(CSS_IDENTIFIER_PATTERN)].map((match) => match[1]);
  if (!identifiers.length) return true;
  return identifiers.every((identifier) =>
    runtimeIdentifiers.has(identifier) ||
    DYNAMIC_CLASS_PREFIXES.some((prefix) => identifier.startsWith(prefix))
  );
}

function pruneRuleList(source, runtimeIdentifiers) {
  let output = "";
  let cursor = 0;

  while (cursor < source.length) {
    const openIndex = findNextBlockStart(source, cursor);
    if (openIndex < 0) {
      output += source.slice(cursor);
      break;
    }
    const closeIndex = findBlockEnd(source, openIndex);
    const rawHeader = source.slice(cursor, openIndex);
    const leadingWhitespace = rawHeader.match(/^\s*/u)?.[0] || "";
    const header = rawHeader.slice(leadingWhitespace.length).trimEnd();
    const body = source.slice(openIndex + 1, closeIndex);

    if (header.startsWith("@media") || header.startsWith("@supports") || header.startsWith("@container") || header.startsWith("@layer")) {
      const prunedBody = pruneRuleList(body, runtimeIdentifiers);
      if (prunedBody.trim()) {
        output += leadingWhitespace + header + "{" + prunedBody + "}";
      }
    } else if (header.startsWith("@")) {
      output += leadingWhitespace + header + "{" + body + "}";
    } else {
      const selectors = splitSelectors(header).filter((selector) => selectorIsUsed(selector, runtimeIdentifiers));
      if (selectors.length) {
        output += leadingWhitespace + selectors.join(",\n") + " {" + body + "}";
      }
    }
    cursor = closeIndex + 1;
  }
  return output;
}

export function pruneStudentCss(cssSource, runtimeSources) {
  const runtimeIdentifiers = collectRuntimeIdentifiers(runtimeSources);
  return pruneRuleList(String(cssSource || ""), runtimeIdentifiers).trim() + "\n";
}

