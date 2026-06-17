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

function parseGapBody(body = "") {
  const source = String(body || "");
  const separatorIndex = source.indexOf("::");
  const answer = text(separatorIndex >= 0 ? source.slice(0, separatorIndex) : source);
  const options = separatorIndex >= 0
    ? uniqueOptions([answer, ...source.slice(separatorIndex + 2).split("|")])
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
  return /\[\[[\s\S]*?\]\]/u.test(String(value || ""));
}

export function parseTextGapTokens(value = "") {
  return Array.from(String(value || "").matchAll(/\[\[([\s\S]*?)\]\]/gu)).map((match, index) => {
    const body = parseGapBody(match[1] || "");
    return {
      index,
      raw: match[0],
      source: String(match[1] || ""),
      start: Number(match.index || 0),
      end: Number(match.index || 0) + match[0].length,
      ...body
    };
  });
}

export function extractTextGapAnswers(value = "") {
  return parseTextGapTokens(value).map((token) => token.answer);
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

    const end = source.indexOf("]]", start + 2);
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
