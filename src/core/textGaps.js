function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueOptions(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((item) => text(item))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function isEscapableGapCharacter(char = "") {
  return char === "\\" || char === ":" || char === "|" || char === "]";
}

function isEscapedCharacter(source = "", index = 0) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function splitUnescaped(source = "", delimiter = "|") {
  const parts = [];
  let current = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === delimiter && !isEscapedCharacter(source, index)) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function findUnescapedSeparatorIndex(source = "") {
  for (let index = 0; index < source.length - 1; index += 1) {
    if (source[index] === ":" && source[index + 1] === ":" && !isEscapedCharacter(source, index)) {
      return index;
    }
  }
  return -1;
}

function findGapEndIndex(source = "", fromIndex = 0) {
  for (let index = fromIndex; index < source.length - 1; index += 1) {
    if (source[index] === "]" && source[index + 1] === "]" && !isEscapedCharacter(source, index)) {
      return index;
    }
  }
  return -1;
}

function unescapeGapValue(value = "") {
  const source = String(value || "");
  let result = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "\\" && isEscapableGapCharacter(next)) {
      result += next;
      index += 1;
      continue;
    }
    result += char;
  }
  return text(result);
}

function scanTextGapTokens(value = "") {
  const source = String(value || "");
  const tokens = [];
  let cursor = 0;
  let tokenIndex = 0;

  while (cursor < source.length) {
    const start = source.indexOf("[[", cursor);
    if (start < 0) {
      break;
    }
    const end = findGapEndIndex(source, start + 2);
    if (end < 0) {
      break;
    }
    const bodySource = source.slice(start + 2, end);
    tokens.push({
      index: tokenIndex,
      raw: source.slice(start, end + 2),
      source: bodySource,
      start,
      end: end + 2
    });
    tokenIndex += 1;
    cursor = end + 2;
  }

  return tokens;
}

function parseGapBody(body = "") {
  const source = String(body || "");
  const separatorIndex = findUnescapedSeparatorIndex(source);
  const answer = unescapeGapValue(separatorIndex >= 0 ? source.slice(0, separatorIndex) : source);
  const options = separatorIndex >= 0
    ? uniqueOptions([answer, ...splitUnescaped(source.slice(separatorIndex + 2), "|").map((item) => unescapeGapValue(item))])
    : [];
  const distractors = options.filter((item) => item !== answer);
  return {
    answer,
    options,
    distractors,
    hasOptions: separatorIndex >= 0,
    valid: Boolean(answer) && options.includes(answer) && distractors.length >= 1
  };
}

export function hasTextGapSyntax(value = "") {
  return scanTextGapTokens(value).length > 0;
}

export function parseTextGapTokens(value = "") {
  return scanTextGapTokens(value).map((token) => ({
    ...token,
    ...parseGapBody(token.source)
  }));
}

export function extractTextGapAnswers(value = "") {
  return parseTextGapTokens(value).map((token) => token.answer);
}

export function stripTextGapSyntax(value = "") {
  const source = String(value || "");
  const tokens = scanTextGapTokens(source);
  if (!tokens.length) {
    return source;
  }

  let cursor = 0;
  let result = "";
  tokens.forEach((token) => {
    result += source.slice(cursor, token.start);
    result += parseGapBody(token.source).answer;
    cursor = token.end;
  });
  result += source.slice(cursor);
  return result;
}

export function escapeTextGapValue(value = "") {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/\|/g, "\\|").replace(/\]/g, "\\]");
}

export function buildTextGapToken(answer, options = []) {
  const normalizedAnswer = text(answer);
  const normalizedOptions = uniqueOptions([normalizedAnswer, ...(Array.isArray(options) ? options : [])]);
  return `[[${escapeTextGapValue(normalizedAnswer)}::${normalizedOptions.map((item) => escapeTextGapValue(item)).join("|")}]]`;
}

export function parseTextGapRenderableParts(value = "") {
  const source = String(value || "");
  const parts = [];
  let cursor = 0;
  let blankIndex = 0;

  while (cursor < source.length) {
    const start = source.indexOf("[[", cursor);
    if (start < 0) {
      const tail = source.slice(cursor);
      if (tail) {
        parts.push({ kind: "text", value: tail });
      }
      break;
    }

    if (start > cursor) {
      parts.push({ kind: "text", value: source.slice(cursor, start) });
    }

    const end = findGapEndIndex(source, start + 2);
    if (end < 0) {
      parts.push({ kind: "text", value: source.slice(start) });
      break;
    }

    const token = parseGapBody(source.slice(start + 2, end));
    parts.push({
      kind: "blank",
      index: blankIndex,
      expected: token.answer,
      options: token.options,
      distractors: token.distractors,
      valid: token.valid
    });
    blankIndex += 1;
    cursor = end + 2;
  }

  return parts;
}
