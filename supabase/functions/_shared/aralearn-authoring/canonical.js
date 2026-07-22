import { validateProjectDocument } from "../aralearn/runtime/domain/aralearnProject.js";
import {
  contractToRelationalRows,
  microsequenceFragmentToRelationalRows
} from "../aralearn/runtime/persistence/contractToRelationalRows.js";
import { canonicalCourseHash } from "../aralearn/runtime/persistence/canonicalCourseHash.js";
import { assertValidRelationalCourse } from "../aralearn/runtime/persistence/validateRelationalCourse.js";
import { AuthoringApiError } from "./errors.js";
import { validateCard } from "../aralearn/runtime/domain/cards.js";

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

function sequentialUuid(index) {
  return `00000000-0000-5000-8000-${String(index).padStart(12, "0")}`;
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

async function namespacedRows(document, namespace) {
  const identityKeys = [];
  contractToRelationalRows(document, {
    uuidFactory(identityKey) {
      identityKeys.push(String(identityKey));
      return sequentialUuid(identityKeys.length);
    }
  });
  const entries = await Promise.all(
    [...new Set(identityKeys)].map(async (identityKey) => [
      identityKey,
      await sha256Uuid(`${namespace}:${identityKey}`)
    ])
  );
  const identities = new Map(entries);
  return contractToRelationalRows(document, {
    uuidFactory(identityKey) {
      const id = identities.get(String(identityKey));
      if (!id) throw new Error(`Identidade relacional não preparada: ${identityKey}.`);
      return id;
    }
  });
}

async function officialRows(document) {
  return namespacedRows(document, "aralearn:official-catalog:v1");
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
  const pending = [fragment];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string" && value.includes("\uFFFD")) {
      fragmentError(
        "invalid_fragment_encoding",
        "fragment",
        "invalid_encoding",
        "A parte contém caractere de substituição e deve ser regenerada a partir da fonte correta."
      );
    }
    if (Array.isArray(value)) pending.push(...value);
    else if (value && typeof value === "object") pending.push(...Object.values(value));
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

  const expectedClaims = sortedUnique(
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
  const rows = official
    ? await officialRows(document)
    : identityNamespace
      ? await namespacedRows(document, `aralearn:private-authoring:v1:${identityNamespace}`)
      : contractToRelationalRows(document);
  const relationalRowCount = Object.values(rows).reduce(
    (total, value) => total + (Array.isArray(value) ? value.length : 0),
    0
  );
  if ((official || identityNamespace) && relationalRowCount > 30000) {
    throw new AuthoringApiError(
      413,
      "course_too_complex",
      "O curso excede 30 mil linhas relacionais. Divida o conteúdo antes de publicar.",
      { relationalRowCount, maximum: 30000 }
    );
  }
  try {
    assertValidRelationalCourse(rows);
  } catch (error) {
    throw new AuthoringApiError(
      422,
      "invalid_relational_course",
      error instanceof Error ? error.message : "O curso relacional é inválido."
    );
  }
  return {
    document: projectForCourse(course),
    course,
    rows,
    relationalRowCount,
    contentHash: await canonicalCourseHash(course)
  };
}

export async function deterministicImportId(courseId, contentHash) {
  return sha256Uuid(`aralearn-catalog-import:${courseId}:${contentHash}`);
}
