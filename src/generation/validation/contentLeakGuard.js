const BLOCKED_PATTERNS = Object.freeze([
  { pattern: /\bCARD\s+\d+\b/iu, reason: "marcador estrutural CARD n" },
  { pattern: /\bAUDIT\b/iu, reason: "marcador estrutural AUDIT" },
  { pattern: /\bPATCH\s+MICROSEQUENCE\b/iu, reason: "marcador estrutural de patch" },
  { pattern: /^\s*\d+\s*:/mu, reason: "linha estrutural numerada" },
  { pattern: /```json/iu, reason: "bloco JSON interno" },
  { pattern: /\b(prompt|schema|LLM|validador)\b/iu, reason: "vocabulário interno de geração" },
  { pattern: /\b(este card|neste flashcard|o usuário deve|conforme solicitado)\b/iu, reason: "texto editorial artificial" }
]);

const BLOCKED_PLACEHOLDERS = Object.freeze([
  "Alternativa A",
  "Alternativa B",
  "Alternativa C",
  "erro 1",
  "erro 2",
  "Opção correta para este caso",
  "Texto gerado automaticamente"
]);

function unquote(value = "") {
  const source = typeof value === "string" ? value.trim() : "";
  if (source.length < 2) return source;
  const first = source[0];
  const last = source[source.length - 1];
  if (!((first === "\"" && last === "\"") || (first === "'" && last === "'"))) {
    return source;
  }
  return source.slice(1, -1);
}

export function findGeneratedContentLeak(value = "") {
  const source = unquote(value);
  if (!source) return null;
  const placeholder = BLOCKED_PLACEHOLDERS.find((item) =>
    source.toLocaleLowerCase("pt-BR").includes(item.toLocaleLowerCase("pt-BR"))
  );
  if (placeholder) {
    return { kind: "placeholder", reason: `placeholder proibido: ${placeholder}` };
  }
  const blocked = BLOCKED_PATTERNS.find((item) => item.pattern.test(source));
  return blocked ? { kind: "structural", reason: blocked.reason } : null;
}
