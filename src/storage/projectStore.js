import { stripTextGapSyntax } from "../core/textGaps.js";
import { validateContractDocument } from "../contract/validateContract.js";

function sanitizeAfterBlock(block) {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return block;
  }

  const nextBlock = { ...block };
  if (nextBlock.kind === "paragraph" && typeof nextBlock.value === "string") {
    nextBlock.value = stripTextGapSyntax(nextBlock.value);
  }
  if (nextBlock.kind === "code" && typeof nextBlock.code === "string") {
    nextBlock.code = stripTextGapSyntax(nextBlock.code);
  }
  return nextBlock;
}

function sanitizeStoredCard(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) {
    return card;
  }

  return {
    ...card,
    ...(typeof card.after === "string" ? { after: stripTextGapSyntax(card.after) } : {}),
    ...(Array.isArray(card.afterBlocks)
      ? { afterBlocks: card.afterBlocks.map((block) => sanitizeAfterBlock(block)) }
      : {})
  };
}

function sanitizeStoredProjectDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return document;
  }

  return {
    ...document,
    courses: (Array.isArray(document.courses) ? document.courses : []).map((course) => ({
      ...course,
      modules: (Array.isArray(course?.modules) ? course.modules : []).map((moduleValue) => ({
        ...moduleValue,
        lessons: (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).map((lesson) => ({
          ...lesson,
          microsequences: (Array.isArray(lesson?.microsequences) ? lesson.microsequences : []).map((microsequence) => ({
            ...microsequence,
            cards: (Array.isArray(microsequence?.cards) ? microsequence.cards : [])
              .map((card) => sanitizeStoredCard(card))
          }))
        }))
      }))
    }))
  };
}

export function parseProjectDocument(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return null;
  }

  const parsed = sanitizeStoredProjectDocument(JSON.parse(rawValue));
  const result = validateContractDocument(parsed);

  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Projeto inválido no armazenamento: ${summary}`);
  }

  return result.value;
}

export function serializeProjectDocument(projectDocument) {
  const result = validateContractDocument(projectDocument);

  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Projeto inválido: ${summary}`);
  }

  return JSON.stringify(result.value, null, 2);
}
