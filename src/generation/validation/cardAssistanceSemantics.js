import { RESOURCE_PACKAGE_REGISTRY } from "../../resources/packages/index.js";

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return text(value)
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/gu, " ");
}

function guideTerms(contextPacket, fieldName) {
  const terms = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    list(value[fieldName]).map(text).filter(Boolean).forEach((item) => terms.push(item));
    Object.values(value).forEach(visit);
  };
  visit(contextPacket?.hierarchy || {});
  return [...new Set(terms)];
}

function visibleEntries(card) {
  const visible = RESOURCE_PACKAGE_REGISTRY.prepareCardForSemantics(card);
  const entries = [{ path: "$.title", value: text(visible.title) }];
  const add = (instance, slot, index) => {
    entries.push({
      path: slot === "response" ? "$.response" : `$.${slot}[${index}]`,
      value: RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, slot)
    });
  };
  list(visible.content).forEach((instance, index) => add(instance, "content", index));
  if (visible.response) add(visible.response, "response", 0);
  list(visible.feedback).forEach((instance, index) => add(instance, "feedback", index));
  return entries.filter(({ value }) => value);
}

function guideFindings(entries, terms, code, message) {
  return terms.flatMap((term) => {
    const needle = normalized(term);
    if (!needle) return [];
    return entries
      .filter(({ value }) => normalized(value).includes(needle))
      .map(({ path }, occurrence) => ({ code, path, term, occurrence: occurrence + 1, message }));
  });
}

function externalReferenceFindings(entries) {
  const patterns = [
    /\b(?:como|conforme)\s+(?:visto|explicado|mostrado)\s+(?:antes|acima|anteriormente)\b/giu,
    /\b(?:no|do|o)\s+card\s+(?:anterior|seguinte)\b/giu
  ];
  return entries.flatMap(({ path, value }) => patterns.flatMap((pattern) => {
    pattern.lastIndex = 0;
    return [...value.matchAll(pattern)].map((match, occurrence) => ({
      code: "external_reference",
      path,
      term: match[0],
      occurrence: occurrence + 1,
      message: "O card depende de uma referência externa implícita em vez de situar o estudante."
    }));
  }));
}

function authorizedSourceIds(contextPacket) {
  const result = new Set();
  ["previous", "current", "next"].forEach((location) => {
    list(contextPacket?.cards?.[location]?.sources)
      .map(text)
      .filter(Boolean)
      .forEach((sourceId) => result.add(sourceId));
  });
  return result;
}

export function validateCardAssistanceSemantics(card = {}, contextPacket = {}) {
  const entries = visibleEntries(card);
  const findings = [
    ...guideFindings(
      entries,
      guideTerms(contextPacket, "exclude"),
      "guide_exclude",
      "O card usa conteúdo excluído pelo guide da autoria."
    ),
    ...guideFindings(
      entries,
      guideTerms(contextPacket, "avoid"),
      "guide_avoid",
      "O card usa conteúdo que o guide orienta evitar."
    ),
    ...externalReferenceFindings(entries)
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
  const errors = [...new Set(findings.map(({ message }) => message))];
  return { ok: errors.length === 0, errors, findings };
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
