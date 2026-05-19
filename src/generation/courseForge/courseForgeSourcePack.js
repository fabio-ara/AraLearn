import { listCourseForgeSourceClaims, listCourseForgeSourceSpans, listCourseForgeSources } from "./courseForgeSourceLedger.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function truncateText(value = "", maxLength = 240) {
  const normalized = text(value);
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resolveSourcePackBudget(phaseId = "") {
  const normalizedPhaseId = text(phaseId);
  if (["plan_architecture", "repair_architecture", "plan_lessons", "plan_microsequences"].includes(normalizedPhaseId)) {
    return { maxChars: 9600, maxSources: 6, maxSpans: 18, maxSpansPerSource: 4, maxSpanChars: 260 };
  }
  if (["answer_locally", "audit_microsequences", "repair_microsequences", "build_cards", "repair_cards", "repair_card_adherence"].includes(normalizedPhaseId)) {
    return { maxChars: 7200, maxSources: 4, maxSpans: 12, maxSpansPerSource: 3, maxSpanChars: 220 };
  }
  return { maxChars: 8400, maxSources: 5, maxSpans: 14, maxSpansPerSource: 3, maxSpanChars: 240 };
}

function rolePriority(instructionalRole = "") {
  const normalized = text(instructionalRole);
  if (normalized === "exercise") return 70;
  if (normalized === "objective") return 65;
  if (normalized === "misconception") return 60;
  if (normalized === "definition") return 55;
  if (normalized === "example") return 45;
  if (normalized === "note") return 30;
  return 15;
}

function scoreSpan(span = {}, index = 0) {
  const confidence = text(span?.confidence);
  const assessmentSignals = normalizeArray(span?.assessmentSignals).map(text);
  const notationSignals = normalizeArray(span?.notationSignals).map(text);
  return (
    rolePriority(span?.instructionalRole) +
    (assessmentSignals.length ? 18 : 0) +
    (notationSignals.length ? 8 : 0) +
    (confidence === "high" ? 8 : confidence === "medium" ? 4 : 0) +
    Math.max(0, 12 - index)
  );
}

function buildSourceHeader(source = {}) {
  const topics = normalizeArray(source?.extractedTopics).map(text).filter(Boolean).slice(0, 4);
  const assessmentSignals = normalizeArray(source?.assessmentSignals).map(text).filter(Boolean).slice(0, 3);
  const teacherConventions = normalizeArray(source?.teacherConventions).map(text).filter(Boolean).slice(0, 3);

  return [
    `Fonte: ${text(source?.title) || text(source?.sourceId) || "anexo"} [${text(source?.kind) || "attachment"}]`,
    topics.length ? `- tópicos: ${topics.join(", ")}` : "",
    assessmentSignals.length ? `- sinais de avaliação: ${assessmentSignals.join(", ")}` : "",
    teacherConventions.length ? `- convenções do professor: ${teacherConventions.join(", ")}` : ""
  ].filter(Boolean);
}

function formatSpanLine(span = {}, maxSpanChars = 240) {
  const role = text(span?.instructionalRole) || "trecho";
  const topics = normalizeArray(span?.topics).map(text).filter(Boolean).slice(0, 3);
  const suffix = topics.length ? ` | tópicos: ${topics.join(", ")}` : "";
  return `- [${role}] ${truncateText(span?.text, maxSpanChars)}${suffix}`;
}

export function buildCourseForgeSourcePack({ sourceLedger = null, phaseId = "" } = {}) {
  const budget = resolveSourcePackBudget(phaseId);
  const sources = listCourseForgeSources(sourceLedger);
  const allSpans = listCourseForgeSourceSpans(sourceLedger);
  const allClaims = listCourseForgeSourceClaims(sourceLedger);
  const attachmentSources = sources.filter((source) => text(source?.kind) !== "user_instruction");
  const promptSources = sources.filter((source) => text(source?.kind) === "user_instruction");
  const preferredSources = attachmentSources.length ? attachmentSources : sources;

  if (!preferredSources.length) {
    return {
      text: "(sem fontes adicionais)",
      budget: {
        ...budget,
        includedSourceCount: 0,
        omittedSourceCount: 0,
        includedSpanCount: 0,
        omittedSpanCount: 0,
        truncated: false
      }
    };
  }

  const rankedSources = preferredSources
    .map((source) => {
      const rankedSpans = normalizeArray(source?.spans)
        .map((span, index) => ({
          ...structuredClone(span),
          _score: scoreSpan(span, index)
        }))
        .sort((left, right) => right._score - left._score);
      return {
        ...structuredClone(source),
        rankedSpans
      };
    })
    .sort((left, right) => {
      const rightExercise = right.rankedSpans.some((span) => text(span?.instructionalRole) === "exercise") ? 1 : 0;
      const leftExercise = left.rankedSpans.some((span) => text(span?.instructionalRole) === "exercise") ? 1 : 0;
      if (rightExercise !== leftExercise) {
        return rightExercise - leftExercise;
      }
      return Number(left?.priority || 0) - Number(right?.priority || 0);
    });

  const lines = [
    `Resumo do SourceLedger para ${text(phaseId) || "fase"}:`,
    `- fontes relevantes: ${preferredSources.length}; spans totais: ${allSpans.length}; claims totais: ${allClaims.length}; prompt complementar: ${promptSources.length}.`
  ];
  const includedSources = [];
  let includedSpanCount = 0;
  let omittedSpanCount = 0;
  let truncated = false;

  const appendLine = (line = "") => {
    if (!line) {
      return true;
    }
    const nextText = [...lines, line].join("\n");
    if (nextText.length > budget.maxChars) {
      truncated = true;
      return false;
    }
    lines.push(line);
    return true;
  };

  rankedSources.slice(0, budget.maxSources).forEach((source) => {
    const sourceHeader = buildSourceHeader(source);
    const chosenSpans = source.rankedSpans.slice(0, budget.maxSpansPerSource);
    const nextSourceLines = [
      ...sourceHeader,
      ...chosenSpans.map((span) => formatSpanLine(span, budget.maxSpanChars))
    ];
    const prospectiveSpanCount = includedSpanCount + chosenSpans.length;
    if (prospectiveSpanCount > budget.maxSpans) {
      omittedSpanCount += chosenSpans.length;
      truncated = true;
      return;
    }
    const checkpoint = [...lines];
    const appendedAll = nextSourceLines.every((line) => appendLine(line));
    if (!appendedAll) {
      lines.splice(0, lines.length, ...checkpoint);
      omittedSpanCount += chosenSpans.length;
      truncated = true;
      return;
    }
    includedSources.push(text(source?.sourceId));
    includedSpanCount += chosenSpans.length;
    omittedSpanCount += Math.max(0, source.rankedSpans.length - chosenSpans.length);
  });

  const omittedSourceCount = Math.max(0, preferredSources.length - includedSources.length);
  if (omittedSourceCount || omittedSpanCount || truncated) {
    appendLine(
      `- contexto resumido por budget: ${omittedSourceCount} fonte(s) e ${omittedSpanCount} trecho(s) ficaram fora deste prompt para preservar foco operacional.`
    );
  }

  return {
    text: lines.join("\n"),
    budget: {
      ...budget,
      includedSourceCount: includedSources.length,
      omittedSourceCount,
      includedSpanCount,
      omittedSpanCount,
      truncated
    }
  };
}
