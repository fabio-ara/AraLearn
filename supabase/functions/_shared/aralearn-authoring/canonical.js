import { validateProjectDocument } from "../aralearn/runtime/domain/aralearnProject.js";
import {
  microsequenceFragmentToRelationalRows
} from "../aralearn/runtime/persistence/contractToRelationalRows.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";
import { validateCard } from "../aralearn/runtime/domain/cards.js";

const FORBIDDEN_BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u;

function fieldFromPath(path) {
  const match = String(path || "$").match(/(?:^|\.|\[)([^.[\]]+)\]?$/);
  return match?.[1] || String(path || "$");
}

function fragmentError(code, path, reason, message, details = {}) {
  throw new AuthoringApiError(422, code, message, {
    path,
    field: fieldFromPath(path),
    reason,
    ...details
  });
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function stripGapAnswers(value) {
  return value.replace(/\[\[[\s\S]*?\]\]/gu, "[[lacuna]]");
}

function appendVisibleScalar(bucket, value) {
  if (typeof value === "string") {
    const normalized = stripGapAnswers(value).trim();
    if (normalized) bucket.push(normalized);
  } else if (typeof value === "number" || typeof value === "boolean") {
    bucket.push(String(value));
  }
}

function appendVisibleArray(bucket, values) {
  if (!Array.isArray(values)) return;
  const serialized = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      appendVisibleArray(bucket, value);
      serialized.push(value.map((entry) => String(entry ?? "")).join(" "));
    } else {
      appendVisibleScalar(bucket, value);
      serialized.push(String(value ?? ""));
    }
  }
  const joined = serialized.filter(Boolean).join(" ").trim();
  if (joined) bucket.push(joined);
}

function appendVisibleOptions(bucket, options) {
  for (const option of Array.isArray(options) ? options : []) {
    appendVisibleScalar(bucket, option?.kind === "code" ? option?.code : option?.text);
  }
}

function appendVisibleFlow(bucket, node) {
  if (!node || typeof node !== "object") return;
  for (const field of ["text", "condition", "expression", "init", "update", "iterator", "iterable", "comment", "match"]) {
    appendVisibleScalar(bucket, node[field]);
  }
  for (const field of ["items", "thenBranch", "elseBranch", "body", "defaultBranch"]) {
    for (const child of Array.isArray(node[field]) ? node[field] : []) appendVisibleFlow(bucket, child);
  }
  for (const branch of Array.isArray(node.cases) ? node.cases : []) appendVisibleFlow(bucket, branch);
  for (const branch of Array.isArray(node.branches) ? node.branches : []) appendVisibleFlow(bucket, branch);
}

function appendVisibleFormula(bucket, node) {
  if (!node || typeof node !== "object") return;
  for (const field of ["value", "open", "close"]) appendVisibleScalar(bucket, node[field]);
  for (const field of [
    "children", "numerator", "denominator", "radicand", "index", "base",
    "exponent", "subscript", "superscript", "content"
  ]) {
    const value = node[field];
    if (Array.isArray(value)) value.forEach((child) => appendVisibleFormula(bucket, child));
    else appendVisibleFormula(bucket, value);
  }
}

function appendVisibleRelationSet(bucket, setValue) {
  appendVisibleScalar(bucket, setValue?.label);
  for (const item of Array.isArray(setValue?.items) ? setValue.items : []) {
    appendVisibleScalar(bucket, item?.label);
  }
}

function appendVisibleBlock(bucket, block) {
  if (!block || typeof block !== "object") return;
  const resource = block.resource || block.kind;
  appendVisibleScalar(bucket, block.title);
  if (resource === "heading" || resource === "paragraph") {
    appendVisibleScalar(bucket, block.value ?? block.text);
  } else if (resource === "choice") {
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "code") {
    appendVisibleScalar(bucket, block.prompt);
    appendVisibleScalar(bucket, block.code);
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "table") {
    appendVisibleArray(bucket, block.columns);
    appendVisibleArray(bucket, block.rows);
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "flow") {
    appendVisibleScalar(bucket, block.prompt);
    appendVisibleFlow(bucket, block.structure);
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "tree") {
    appendVisibleScalar(bucket, block.prompt);
    for (const node of Array.isArray(block.nodes) ? block.nodes : []) {
      appendVisibleScalar(bucket, node?.label);
    }
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "graph") {
    appendVisibleScalar(bucket, block.prompt);
    for (const vertex of Array.isArray(block.vertices) ? block.vertices : []) {
      appendVisibleScalar(bucket, vertex?.label);
    }
    for (const edge of Array.isArray(block.edges) ? block.edges : []) {
      appendVisibleScalar(bucket, edge?.label);
      appendVisibleScalar(bucket, edge?.weight);
    }
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "relation_map") {
    appendVisibleScalar(bucket, block.prompt);
    appendVisibleRelationSet(bucket, block.leftSet);
    appendVisibleRelationSet(bucket, block.rightSet);
    for (const relation of Array.isArray(block.relations) ? block.relations : []) {
      appendVisibleScalar(bucket, relation?.label);
    }
    appendVisibleArray(bucket, block.pairList);
    appendVisibleArray(bucket, block.relationTable?.columns);
    appendVisibleArray(bucket, block.relationTable?.rows);
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "matrix") {
    appendVisibleScalar(bucket, block.prompt);
    appendVisibleScalar(bucket, block.name);
    appendVisibleArray(bucket, block.values);
    for (const item of Array.isArray(block.sequence) ? block.sequence : []) {
      appendVisibleScalar(bucket, item?.name);
      appendVisibleScalar(bucket, item?.connector);
      appendVisibleArray(bucket, item?.values);
    }
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "plane") {
    appendVisibleScalar(bucket, block.prompt);
    for (const field of ["x", "y", "vector", "vectors", "sum", "distance", "result"]) {
      if (Array.isArray(block[field])) appendVisibleArray(bucket, block[field]);
      else appendVisibleScalar(bucket, block[field]);
    }
    appendVisibleScalar(bucket, block.scale?.k);
    appendVisibleArray(bucket, block.scale?.vector);
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "formula") {
    appendVisibleScalar(bucket, block.prompt);
    appendVisibleScalar(bucket, block.accessibleText);
    appendVisibleFormula(bucket, block.expression);
    appendVisibleScalar(bucket, block.question);
    appendVisibleOptions(bucket, block.options);
  } else if (resource === "composite") {
    for (const child of Array.isArray(block.blocks) ? block.blocks : []) {
      appendVisibleBlock(bucket, child);
    }
  }
}

function cardPromptSnapshot(card) {
  const values = [];
  appendVisibleBlock(values, card);
  return normalizeContextLiteral(values.join("\n"));
}

function normalizeContextLiteral(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function projectForCourse(course) {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [structuredClone(course)]
  };
}

function assertOneCourse(document) {
  const validation = validateProjectDocument(document);
  if (!validation.ok) {
    throw new AuthoringApiError(
      422,
      "invalid_course_contract",
      "O curso viola o contrato público AraLearn v3.",
      { errors: validation.errors }
    );
  }
  if (document.courses.length !== 1) {
    throw new AuthoringApiError(
      422,
      "invalid_course_count",
      "A operação exige exatamente um curso."
    );
  }
  return document.courses[0];
}

function uuidFromDigest(digest) {
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function sha256Uuid(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value))
  );
  return uuidFromDigest(digest);
}

export async function deterministicRequestUuid(value) {
  return sha256Uuid(`aralearn:authoring:v1:${String(value)}`);
}

export function validateAuthoringFragment(fragment) {
  if (!fragment || typeof fragment !== "object" || Array.isArray(fragment)) {
    fragmentError("invalid_fragment", "fragment", "wrong_type", "fragment deve ser um objeto.", {
      expected: "microsequence part object",
      actualType: fragment === null ? "null" : Array.isArray(fragment) ? "array" : typeof fragment
    });
  }
  if (fragment.contract === "aralearn.contract") {
    fragmentError(
      "whole_course_part_forbidden",
      "fragment.contract",
      "whole_course_forbidden",
      "A autoria assistida deve enviar microssequências em partes, não o curso inteiro."
    );
  }
  const pending = [{ value: fragment, path: "fragment" }];
  while (pending.length) {
    const { value, path } = pending.pop();
    if (typeof value === "string" && value.includes("\uFFFD")) {
      fragmentError(
        "invalid_fragment_encoding",
        path,
        "invalid_encoding",
        "A parte contém caractere de substituição e deve ser regenerada a partir da fonte correta."
      );
    }
    if (typeof value === "string" && hasUnpairedSurrogate(value)) {
      fragmentError(
        "invalid_fragment_encoding",
        path,
        "invalid_unicode",
        "A parte contém uma sequência Unicode incompleta. Regere o texto a partir da fonte correta."
      );
    }
    if (typeof value === "string" && FORBIDDEN_BIDI_CONTROL_PATTERN.test(value)) {
      fragmentError(
        "invalid_fragment_encoding",
        path,
        "forbidden_bidi_control",
        "A parte contém controle bidirecional invisível. Use languageTag e textDirection para declarar idioma e direção."
      );
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => pending.push({ value: entry, path: `${path}[${index}]` }));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([field, entry]) => pending.push({
        value: entry,
        path: `${path}.${field}`
      }));
    }
  }
  const microsequences = Array.isArray(fragment.microsequences)
    ? fragment.microsequences
    : [fragment.microsequence || fragment].filter((value) => Array.isArray(value?.cards));
  if (!microsequences.length) {
    fragmentError(
      "invalid_fragment",
      "fragment.microsequences",
      "required",
      "fragment.microsequences deve conter uma ou mais microssequências completas."
    );
  }
  for (const [microsequenceIndex, microsequence] of microsequences.entries()) {
    for (const [index, card] of (microsequence.cards || []).entries()) {
      const cardPath = `fragment.microsequences[${microsequenceIndex}].cards[${index}]`;
      const validation = validateCard(card, cardPath);
      if (!validation.ok) {
        const first = validation.errors[0] || {};
        fragmentError(
          "invalid_fragment",
          first.path || cardPath,
          first.code || "contract_violation",
          first.message ? `${first.path || cardPath}: ${first.message}` : "Um card viola os critérios estruturais e didáticos do AraLearn.",
          { errors: validation.errors }
        );
      }
    }
    try {
      microsequenceFragmentToRelationalRows(microsequence);
    } catch (error) {
      fragmentError(
        "invalid_fragment",
        `fragment.microsequences[${microsequenceIndex}]`,
        "relational_constraint",
        error instanceof Error ? error.message : "Microssequência inválida."
      );
    }
  }
  return { kind: "microsequence_part", count: microsequences.length };
}

function authoringMicrosequences(fragment) {
  if (Array.isArray(fragment?.microsequences)) return fragment.microsequences;
  if (fragment?.microsequence) return [fragment.microsequence];
  if (Array.isArray(fragment?.cards)) return [fragment];
  return [];
}

function sortedUnique(values, label) {
  const normalized = values.map((value) => String(value || "").trim());
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) {
    throw new AuthoringApiError(422, "part_plan_mismatch", `${label} contém identificadores ausentes ou duplicados.`);
  }
  return normalized.sort();
}

function sortedDistinct(values, label) {
  const normalized = values.map((value) => String(value || "").trim());
  if (normalized.some((value) => !value)) {
    throw new AuthoringApiError(422, "part_plan_mismatch", `${label} contém identificadores ausentes.`);
  }
  return [...new Set(normalized)].sort();
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function partMismatch(message, details = undefined) {
  throw new AuthoringApiError(422, "part_plan_mismatch", message, details);
}

function assertSameSet(actual, expected, label) {
  const actualValues = sortedUnique(Array.isArray(actual) ? actual : [], label);
  const expectedValues = sortedUnique(Array.isArray(expected) ? expected : [], label);
  if (!sameValues(actualValues, expectedValues)) partMismatch(`${label} diverge do planejamento.`);
}

export function assertFragmentMatchesSpecification(fragment, specification) {
  validateAuthoringFragment(fragment);
  const ownership = specification?.ownership || {};
  for (const field of ["courseId", "moduleId", "lessonId"]) {
    if (fragment?.[field] !== ownership[field]) {
      partMismatch(`O destino ${field} do fragmento diverge da propriedade reservada.`);
    }
  }
  const microsequences = authoringMicrosequences(fragment);
  const expectedMicrosequenceIds = sortedUnique(
    Array.isArray(specification?.ownership?.microsequenceIds)
      ? specification.ownership.microsequenceIds
      : [],
    "A propriedade da parte"
  );
  const actualMicrosequenceIds = sortedUnique(
    microsequences.map((microsequence) => microsequence?.id),
    "O fragmento"
  );
  if (!expectedMicrosequenceIds.length || !sameValues(expectedMicrosequenceIds, actualMicrosequenceIds)) {
    throw new AuthoringApiError(
      422,
      "part_plan_mismatch",
      "O fragmento deve conter exatamente as microssequências reservadas para a parte.",
      { expectedMicrosequenceIds, actualMicrosequenceIds }
    );
  }

  const structured = new Map(
    (Array.isArray(specification?.structure?.microsequences)
      ? specification.structure.microsequences
      : []).map((microsequence) => [microsequence?.id, microsequence])
  );
  for (const microsequence of microsequences) {
    const planned = structured.get(microsequence.id);
    if (!planned) partMismatch(`A microssequência ${microsequence.id} não possui estrutura planejada.`);
    for (const field of ["title", "goal", "role"]) {
      if (microsequence[field] !== planned[field]) {
        partMismatch(`A microssequência ${microsequence.id} alterou ${field}.`);
      }
    }
    for (const field of ["dependsOn", "covers", "checks", "errors"]) {
      assertSameSet(
        microsequence[field] || [],
        planned[field] || [],
        `A microssequência ${microsequence.id}.${field}`
      );
    }
  }

  const plannedCards = Array.isArray(specification?.cardPlan) ? specification.cardPlan : [];
  const expectedCardIds = sortedUnique(plannedCards.map((card) => card?.cardId), "O plano de cards");
  const actualCards = microsequences.flatMap((microsequence) =>
    (Array.isArray(microsequence?.cards) ? microsequence.cards : []).map((card, index) => ({
      card,
      microsequenceId: microsequence.id,
      position: index + 1
    }))
  );
  const actualCardIds = sortedUnique(actualCards.map(({ card }) => card?.id), "O fragmento de cards");
  if (!expectedCardIds.length || !sameValues(expectedCardIds, actualCardIds)) {
    throw new AuthoringApiError(
      422,
      "part_plan_mismatch",
      "O fragmento deve conter exatamente os cards previstos para a parte.",
      { expectedCardIds, actualCardIds }
    );
  }
  const actualById = new Map(actualCards.map((entry) => [entry.card.id, entry]));
  for (const planned of plannedCards) {
    const actual = actualById.get(planned.cardId);
    if (!actual || actual.microsequenceId !== planned.microsequenceId || actual.position !== planned.position) {
      throw new AuthoringApiError(
        422,
        "part_plan_mismatch",
        `O card ${planned.cardId || "sem identificador"} não ocupa a posição planejada.`
      );
    }
    for (const field of ["resource", "kind", "exercise"]) {
      if (actual.card[field] !== planned[field]) {
        partMismatch(`O card ${planned.cardId} alterou ${field}.`);
      }
    }
    if (planned.codeLanguage !== undefined && actual.card.language !== planned.codeLanguage) {
      partMismatch(`O card ${planned.cardId} alterou a linguagem de código planejada.`);
    }
    if (planned.notation !== undefined && actual.card.notation !== planned.notation) {
      partMismatch(`O card ${planned.cardId} alterou a notação planejada.`);
    }
    for (const field of ["languageTag", "textDirection"]) {
      if (planned[field] !== undefined && actual.card[field] !== planned[field]) {
        partMismatch(`O card ${planned.cardId} alterou ${field}.`);
      }
    }
    const promptSnapshot = cardPromptSnapshot(actual.card);
    for (const [anchorIndex, anchor] of (planned.contextAnchors || []).entries()) {
      if (!promptSnapshot.includes(normalizeContextLiteral(anchor))) {
        const plannedIndex = plannedCards.indexOf(planned);
        throw new AuthoringApiError(
          422,
          "missing_card_context",
          `O card ${planned.cardId} não materializa no enunciado o contexto planejado: ${anchor}.`,
          {
            path: `specification.cardPlan[${plannedIndex}].contextAnchors[${anchorIndex}]`,
            field: "contextAnchors",
            reason: "missing_from_prompt",
            cardId: planned.cardId,
            anchor
          }
        );
      }
    }
  }
  return true;
}

function rejectUnknownIds(values, allowed, field) {
  const unknown = values.find((value) => !allowed.has(value));
  if (unknown) {
    throw new AuthoringApiError(
      422,
      "part_continuity_mismatch",
      `${field} contém identificador não autorizado: ${unknown}.`
    );
  }
}

export function assertSubmissionMatchesContinuity(submission, specification) {
  const stateDelta = submission?.stateDelta || {};
  const ledgerClaims = new Set(
    (Array.isArray(specification?.ledger?.claims) ? specification.ledger.claims : [])
      .filter((claim) => {
        const allowed = Array.isArray(claim?.allowedPartKeys) ? claim.allowedPartKeys : [];
        return allowed.length === 0 || allowed.includes(specification?.partKey);
      })
      .map((claim) => claim?.claimId)
  );
  const ledgerTerms = new Set(
    (Array.isArray(specification?.ledger?.terms) ? specification.ledger.terms : [])
      .map((term) => term?.termId)
  );
  const plannedTerms = new Set([
    ...(Array.isArray(specification?.availableTermIds) ? specification.availableTermIds : []),
    ...(Array.isArray(specification?.cardPlan) ? specification.cardPlan : [])
      .flatMap((card) => Array.isArray(card?.introducedTermIds) ? card.introducedTermIds : [])
  ]);
  const plannedOutcomes = new Set(
    (Array.isArray(specification?.learningOutcomes) ? specification.learningOutcomes : [])
      .map((outcome) => outcome?.id)
      .filter((id) => typeof id === "string" && id)
  );
  const plannedErrors = new Set(
    (Array.isArray(specification?.structure?.microsequences)
      ? specification.structure.microsequences
      : []).flatMap((microsequence) => Array.isArray(microsequence?.errors) ? microsequence.errors : [])
  );
  rejectUnknownIds(stateDelta.usedClaimIds || [], ledgerClaims, "stateDelta.usedClaimIds");
  rejectUnknownIds(stateDelta.introducedTermIds || [], plannedTerms, "stateDelta.introducedTermIds");
  rejectUnknownIds(stateDelta.introducedTermIds || [], ledgerTerms, "stateDelta.introducedTermIds");
  rejectUnknownIds(stateDelta.coveredOutcomeIds || [], plannedOutcomes, "stateDelta.coveredOutcomeIds");
  const assignedOutcomeIds = sortedUnique(
    Array.isArray(specification?.outcomeIds) ? specification.outcomeIds : [],
    "Os resultados atribuídos à parte"
  );
  const coveredOutcomeIds = sortedUnique(
    Array.isArray(stateDelta.coveredOutcomeIds) ? stateDelta.coveredOutcomeIds : [],
    "stateDelta.coveredOutcomeIds"
  );
  if (!sameValues(assignedOutcomeIds, coveredOutcomeIds)) {
    throw new AuthoringApiError(
      422,
      "part_continuity_mismatch",
      "stateDelta.coveredOutcomeIds deve cobrir exatamente os resultados atribuídos à parte."
    );
  }
  rejectUnknownIds(stateDelta.resolvedErrorIds || [], plannedErrors, "stateDelta.resolvedErrorIds");

  const expectedClaims = sortedDistinct(
    (Array.isArray(specification?.cardPlan) ? specification.cardPlan : [])
      .flatMap((card) => Array.isArray(card?.claimIds) ? card.claimIds : []),
    "As afirmações previstas"
  );
  const usedClaims = sortedUnique(stateDelta.usedClaimIds || [], "stateDelta.usedClaimIds");
  if (!sameValues(expectedClaims, usedClaims)) {
    throw new AuthoringApiError(
      422,
      "part_continuity_mismatch",
      "stateDelta.usedClaimIds deve corresponder exatamente às afirmações previstas nos cards."
    );
  }
  const expectedIntroducedTerms = sortedUnique(
    (Array.isArray(specification?.cardPlan) ? specification.cardPlan : [])
      .flatMap((card) => Array.isArray(card?.introducedTermIds) ? card.introducedTermIds : []),
    "Os termos introduzidos previstos"
  );
  const introducedTerms = sortedUnique(
    stateDelta.introducedTermIds || [],
    "stateDelta.introducedTermIds"
  );
  if (!sameValues(expectedIntroducedTerms, introducedTerms)) {
    throw new AuthoringApiError(
      422,
      "part_continuity_mismatch",
      "stateDelta.introducedTermIds deve corresponder exatamente aos termos introduzidos nos cards."
    );
  }

  const sourceIds = new Set(
    (Array.isArray(specification?.ledger?.sources) ? specification.ledger.sources : [])
      .map((source) => source?.sourceId)
  );
  for (const item of submission?.evidence || []) {
    if (typeof item?.sourceId !== "string" || !sourceIds.has(item.sourceId)) {
      throw new AuthoringApiError(422, "part_continuity_mismatch", "evidence contém fonte não autorizada.");
    }
    if (item.claimId != null && (typeof item.claimId !== "string" || !ledgerClaims.has(item.claimId))) {
      throw new AuthoringApiError(422, "part_continuity_mismatch", "evidence contém afirmação não autorizada.");
    }
  }
  const requiredEvidenceSources = new Set(
    (Array.isArray(specification?.cardPlan) ? specification.cardPlan : [])
      .flatMap((card) => Array.isArray(card?.sourceIds) ? card.sourceIds : [])
  );
  const requiredEvidenceClaims = new Set(expectedClaims);
  const evidencedSources = new Set((submission?.evidence || []).map((item) => item?.sourceId));
  const evidencedClaims = new Set(
    (submission?.evidence || []).map((item) => item?.claimId).filter(Boolean)
  );
  for (const sourceId of requiredEvidenceSources) {
    if (!evidencedSources.has(sourceId)) {
      throw new AuthoringApiError(
        422,
        "part_continuity_mismatch",
        `evidence não comprova a fonte prevista: ${sourceId}.`
      );
    }
  }
  for (const claimId of requiredEvidenceClaims) {
    if (!evidencedClaims.has(claimId)) {
      throw new AuthoringApiError(
        422,
        "part_continuity_mismatch",
        `evidence não comprova a afirmação prevista: ${claimId}.`
      );
    }
  }
  return true;
}

function readJsonPointer(document, pointer) {
  if (pointer === "") return document;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    throw new AuthoringApiError(422, "invalid_preserve_pointer", "preserveFields deve usar JSON Pointer.");
  }
  let current = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (current == null || typeof current !== "object"
        || !Object.prototype.hasOwnProperty.call(current, token)) {
      throw new AuthoringApiError(
        422,
        "invalid_preserve_pointer",
        `O campo preservado não existe na submissão anterior: ${pointer}.`
      );
    }
    current = current[token];
  }
  return current;
}

export function assertPreservedPointers(previousFragment, nextFragment, pointers = []) {
  for (const pointer of [...new Set(pointers)]) {
    const previous = readJsonPointer(previousFragment, pointer);
    const next = readJsonPointer(nextFragment, pointer);
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      throw new AuthoringApiError(
        422,
        "preservation_violation",
        `O reparo alterou um campo marcado para preservação: ${pointer}.`
      );
    }
  }
  return true;
}

export async function prepareCourseDocument(document, {
  official = false,
  requireReady = false,
  identityNamespace = null
} = {}) {
  const course = assertOneCourse(document);
  if (requireReady) {
    const pending = [];
    for (const moduleValue of course.modules) {
      for (const lesson of moduleValue.lessons) {
        for (const microsequence of lesson.microsequences) {
          if (microsequence.status !== "ready") pending.push(microsequence.id);
        }
      }
    }
    if (pending.length) {
      throw new AuthoringApiError(
        409,
        "course_incomplete",
        "O curso ainda contém microssequências não aprovadas.",
        { microsequenceIds: pending.slice(0, 100), total: pending.length }
      );
    }
  }
  if (official && identityNamespace) {
    throw new TypeError("A identidade oficial não pode receber um namespace externo.");
  }
  const revisionDocument = projectForCourse(course);
  return {
    document: revisionDocument,
    course,
    contentHash: await sha256Hex(canonicalJsonStringify(revisionDocument))
  };
}
