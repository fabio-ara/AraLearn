const BACKSTAGE_TERMS = [
  "prompt",
  "pipeline",
  "schema",
  "json",
  "validador",
  "sourceguide",
  "domainmap",
  "coverage",
  "llm",
  "ia generativa",
  "contrato",
  "auditoria",
  "etapa anterior",
  "card anterior",
  "material acima",
  "conforme o pdf"
];

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function auditCourseForgeBackstageVocabulary({ card = {}, lessonContext = {} } = {}) {
  const visibleFields = [card.title, card.say, card.ask, card.after, card.feedback, card.text]
    .map(text)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const lessonTopic = [lessonContext.title, lessonContext.description, ...(lessonContext.tags || [])]
    .map(text)
    .join(" ")
    .toLowerCase();
  const courseSeemsTechnical = /json|prompt|llm|ia|api|software|programa[cç][aã]o/.test(lessonTopic);
  const issues = BACKSTAGE_TERMS.filter((term) => visibleFields.includes(term));
  return {
    ok: issues.length === 0 || courseSeemsTechnical,
    issues,
    requiresReview: issues.length > 0 && courseSeemsTechnical
  };
}
