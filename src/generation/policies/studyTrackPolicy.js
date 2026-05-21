const LOCAL_DOUBT_PATTERNS = [
  /\bn[aã]o\s+sei\b/i,
  /\bn[aã]o\s+entendi\b/i,
  /\bn[aã]o\s+ficou\s+claro\b/i,
  /\bfiquei\s+com\s+d[uú]vida\b/i,
  /\bd[uú]vida\b/i,
  /\bo\s+que\s+(?:e|é|s[aã]o)\b/i,
  /\bpara\s+que\s+serve\b/i,
  /\bqual\s+(?:a\s+)?diferen[cç]a\b/i,
  /\bsigla\b/i
];

const STOPWORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "eu",
  "me",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
  "que",
  "sao",
  "são",
  "se",
  "um",
  "uma"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function comparable(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function unique(values = [], limit = 40) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const normalized = text(value).replace(/^[`"“”']+|[`"“”']+$/g, "");
    const key = comparable(normalized);
    if (!normalized || !key || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  });
  return result.slice(0, limit);
}

function collectStrings(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  return Object.values(value).flatMap(collectStrings);
}

function splitDoubtPhrase(value) {
  return text(value)
    .replace(/[?!.,;:()[\]{}]/g, " ")
    .split(/\s+(?:e|ou)\s+|[,/]+/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractQuotedTerms(value) {
  const source = text(value);
  const terms = [];
  for (const match of source.matchAll(/`([^`]{1,60})`|["“”']([^"“”']{1,60})["“”']/g)) {
    terms.push(text(match[1] || match[2]));
  }
  return terms;
}

function extractAcronyms(value) {
  const source = text(value);
  const terms = [];
  for (const match of source.matchAll(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,8}(?:\/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{1,4})?\b/g)) {
    terms.push(match[0]);
  }
  for (const match of source.matchAll(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\b/g)) {
    terms.push(match[0]);
  }
  return terms;
}

function extractDoubtTailTerms(value) {
  const source = text(value);
  const terms = [];
  const patterns = [
    /\bo\s+que\s+(?:e|é|s[aã]o)\s+([^?.!,;\n]+)/gi,
    /\bpara\s+que\s+serve(?:m)?\s+([^?.!,;\n]+)/gi,
    /\bn[aã]o\s+sei\s+(?:o\s+que\s+)?(?:e|é|s[aã]o)?\s*([^?.!,;\n]+)/gi,
    /\bn[aã]o\s+entendi\s+([^?.!,;\n]+)/gi,
    /\bexplique\s+([^?.!,;\n]+)/gi
  ];

  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      splitDoubtPhrase(match[1]).forEach((entry) => terms.push(entry));
    }
  });

  return terms
    .map((term) =>
      term
        .replace(/^(?:a|as|o|os|um|uma|sobre|do|da|de|dos|das)\s+/i, "")
        .replace(/\s+(?:aqui|nisso|neste|nessa|nesses|tamb[eé]m)$/i, "")
        .trim()
    )
    .filter((term) => {
      const normalized = comparable(term);
      if (!normalized || STOPWORDS.has(normalized)) {
        return false;
      }
      return term.length <= 60 && normalized.length >= 2;
    });
}

export function extractStudyTrackAnchors(userPrompt) {
  const source = text(userPrompt);
  const terms = [
    ...extractQuotedTerms(source),
    ...extractAcronyms(source),
    ...extractDoubtTailTerms(source)
  ];
  return unique(terms, 12);
}

function looksLikeLocalDoubt(userPrompt) {
  const source = text(userPrompt);
  return LOCAL_DOUBT_PATTERNS.some((pattern) => pattern.test(source));
}

function collectDomainTerms({ lesson = {}, microsequence = {}, selectedLessonTopicRefs = [] } = {}) {
  const terms = [];
  const structured = lesson?.sourceGuideStructured || {};
  const domainMap = lesson?.domainMap || {};

  terms.push(lesson?.title, lesson?.description, lesson?.objective);
  terms.push(structured.lessonGoal, structured.notationRules, structured.commonErrors);
  terms.push(microsequence?.title, microsequence?.description, microsequence?.didacticPurpose, microsequence?.coverageRole);
  terms.push(...(Array.isArray(microsequence?.tags) ? microsequence.tags : []));
  terms.push(...(Array.isArray(microsequence?.domainRefs) ? microsequence.domainRefs : []));
  terms.push(...(Array.isArray(microsequence?.practiceVariantRefs) ? microsequence.practiceVariantRefs : []));
  terms.push(...(Array.isArray(microsequence?.scopeLabels) ? microsequence.scopeLabels : []));
  terms.push(...(Array.isArray(selectedLessonTopicRefs) ? selectedLessonTopicRefs.flatMap((item) => [item?.label, item?.refKey]) : []));

  (Array.isArray(domainMap.items) ? domainMap.items : []).forEach((item) => {
    terms.push(
      item?.id,
      item?.label,
      item?.kind,
      ...(Array.isArray(item?.expectedEvidence) ? item.expectedEvidence : []),
      ...(Array.isArray(item?.commonErrors) ? item.commonErrors : []),
      ...(Array.isArray(item?.prerequisites) ? item.prerequisites : []),
      ...(Array.isArray(item?.representations) ? item.representations : []),
      ...(Array.isArray(item?.assessmentFormats) ? item.assessmentFormats : [])
    );
  });

  (Array.isArray(domainMap.practiceVariants) ? domainMap.practiceVariants : []).forEach((variant) => {
    terms.push(
      variant?.id,
      variant?.domainItemRef,
      variant?.variantKind,
      variant?.purpose,
      variant?.representation,
      variant?.expectedStudentAction,
      variant?.commonErrorTarget
    );
  });

  (Array.isArray(lesson?.microsequenceLine || lesson?.microsequences) ? lesson.microsequenceLine || lesson.microsequences : []).forEach((item) => {
    terms.push(
      item?.title,
      item?.objective,
      item?.description,
      item?.didacticPurpose,
      item?.coverageRole,
      ...(Array.isArray(item?.tags) ? item.tags : []),
      ...(Array.isArray(item?.domainRefs) ? item.domainRefs : []),
      ...(Array.isArray(item?.scopeLabels) ? item.scopeLabels : [])
    );
  });

  return unique(collectStrings(terms).flatMap((item) => [item, ...extractQuotedTerms(item), ...extractAcronyms(item)]), 90);
}

function collectBridgeTargets({ lesson = {}, microsequence = {}, selectedLessonTopicRefs = [] } = {}) {
  return unique(
    [
      microsequence?.title,
      microsequence?.goal,
      microsequence?.didacticPurpose,
      ...(Array.isArray(microsequence?.scopeLabels) ? microsequence.scopeLabels : []),
      lesson?.title,
      lesson?.sourceGuideStructured?.lessonGoal,
      ...(Array.isArray(selectedLessonTopicRefs) ? selectedLessonTopicRefs.map((item) => item?.label || item?.refKey) : [])
    ],
    8
  );
}

export function buildStudyTrackPolicy({
  userPrompt,
  lesson = {},
  microsequence = {},
  selectedLessonTopicRefs = []
} = {}) {
  const anchors = extractStudyTrackAnchors(userPrompt);
  const localDoubt = looksLikeLocalDoubt(userPrompt);
  const requiredAnchors = localDoubt ? anchors : [];
  const bridgeBackTargets = collectBridgeTargets({ lesson, microsequence, selectedLessonTopicRefs });

  return {
    mode: localDoubt ? "clarify_local_doubt" : "extend_current_track",
    userIntent: localDoubt
      ? "esclarecer dúvida local e retornar à trilha didática"
      : "gerar continuidade aderente à trilha didática",
    requiredAnchors,
    allowedContextTerms: unique([...requiredAnchors, ...collectDomainTerms({ lesson, microsequence, selectedLessonTopicRefs })], 100),
    bridgeBackTargets,
    obligations: localDoubt
      ? [
          "Responder diretamente aos termos perguntados antes de abrir qualquer conteúdo novo.",
          "Explicar siglas, termos técnicos e palavras em inglês de forma local e operacional.",
          "Usar analogia externa apenas se ela estiver explicitamente conectada ao conteúdo da lição.",
          "Reatar a explicação à microssequência atual e preparar a próxima prática da trilha."
        ]
      : [
          "Preservar escopo, vocabulário e progressão da lição.",
          "Evitar inserir tópico paralelo sem ponte didática explícita."
        ]
  };
}

function containsTerm(source, term) {
  const normalizedSource = comparable(source);
  const normalizedTerm = comparable(term);
  if (!normalizedSource || !normalizedTerm) {
    return false;
  }
  if (/^[a-z0-9]{1,8}$/.test(normalizedTerm)) {
    const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(normalizedSource);
  }
  return normalizedSource.includes(normalizedTerm);
}

export function textContainsStudyTrackTerm(source, term) {
  return containsTerm(source, term);
}

export function validatePlanAgainstStudyTrack(plan, studyTrackPolicy = {}) {
  if (studyTrackPolicy?.mode !== "clarify_local_doubt") {
    return [];
  }
  const requiredAnchors = Array.isArray(studyTrackPolicy.requiredAnchors) ? studyTrackPolicy.requiredAnchors : [];
  if (!requiredAnchors.length) {
    return [];
  }
  const planText = [plan?.microsequenceGoal, plan?.reason].map(text).join(" ");
  return requiredAnchors
    .filter((anchor) => !containsTerm(planText, anchor))
    .map((anchor) => `Plano não responde explicitamente à dúvida local sobre "${anchor}".`);
}
