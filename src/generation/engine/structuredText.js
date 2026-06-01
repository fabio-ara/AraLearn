function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseJsonText(rawText = "") {
  const source = text(rawText);
  const candidates = [
    source,
    source.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  const firstBrace = source.indexOf("{");
  if (firstBrace < 0) {
    throw new Error("Resposta textual sem JSON utilizável.");
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = firstBrace; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(source.slice(firstBrace, index + 1));
      }
    }
  }
  throw new Error("Resposta textual com JSON incompleto.");
}
