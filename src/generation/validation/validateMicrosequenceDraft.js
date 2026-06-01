import { isExerciseCardShape, isTheoryCardShape } from "../../domain/cardExerciseSupport.js";

const REQUIRED_FIELDS = ["position", "resource", "kind", "exercise", "goal"];
const ALLOWED_FIELDS = new Set(REQUIRED_FIELDS);
const THEORY_ROLES = new Set(["explain", "example", "next"]);
const EXERCISE_ROLES = new Set(["practice", "practice_more", "fix_error"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(errors = []) {
  return { ok: false, errors, plan: [] };
}

function parseDraftResponse(rawResponse) {
  if (typeof rawResponse === "string") {
    try {
      return parseDraftResponse(JSON.parse(rawResponse));
    } catch {
      return { ok: false, errors: ["JSON incorreto."] };
    }
  }
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) {
    return { ok: false, errors: ["JSON incorreto."] };
  }
  if (!Array.isArray(rawResponse.draft)) {
    return { ok: false, errors: ['A resposta precisa ser {"draft":[...]}.'] };
  }
  return { ok: true, draft: rawResponse.draft };
}

function validateRoleCompatibility({ role = "", item = {}, prefix = "", errors = [] } = {}) {
  if (THEORY_ROLES.has(role)) {
    if (!isTheoryCardShape(item)) {
      errors.push(`${prefix} ${role} precisa usar kind=theory e exercise=none.`);
    }
    if (text(item?.resource) === "choice") {
      errors.push(`${prefix} ${role} não pode usar choice como teoria.`);
    }
    return;
  }
  if (EXERCISE_ROLES.has(role)) {
    if (isExerciseCardShape(item)) {
      return;
    }
    errors.push(`${prefix} ${role} precisa usar paragraph/gap ou recurso contextual com exercise=choice.`);
    return;
  }
  if (role === "review") {
    const theoryReview = isTheoryCardShape(item);
    const exerciseReview = isExerciseCardShape(item);
    if (theoryReview || exerciseReview) {
      return;
    }
    errors.push(`${prefix} review precisa usar theory/none, paragraph/gap ou recurso contextual com exercise=choice.`);
  }
}

function collectDraftSignals(draftContract = {}) {
  return [
    text(draftContract?.microsequence?.goal),
    text(draftContract?.request?.prompt),
    text(draftContract?.request?.preferredResource),
    ...(Array.isArray(draftContract?.microsequence?.checks) ? draftContract.microsequence.checks : []),
    ...(Array.isArray(draftContract?.plan) ? draftContract.plan.flatMap((item) => [item?.goal, ...(Array.isArray(item?.checks) ? item.checks : [])]) : [])
  ].map((item) => text(item)).filter(Boolean).join(" ");
}

function hasMatrixOpeningSignals(draftContract = {}) {
  const preferred = text(draftContract?.request?.preferredResource);
  if (preferred === "matrix") {
    return true;
  }
  return /\b(matriz|matrizes|linha|linhas|coluna|colunas|i,j|posição|posicao|matricial|sequência matricial|sequencia matricial|soma matricial|sistema matricial)\b/i.test(
    collectDraftSignals(draftContract)
  );
}

function hasPlaneOpeningSignals(draftContract = {}) {
  const preferred = text(draftContract?.request?.preferredResource);
  if (preferred === "plane") {
    return true;
  }
  return /\b(vetor|vetores|plano|coordenada|coordenadas|cartesiano|cartesiana|ponto|pontos|soma de vetores|escala|distância|distancia)\b/i.test(
    collectDraftSignals(draftContract)
  );
}

function isVisualOpeningJustified({ resource = "", slot = {}, draftContract = {} } = {}) {
  const normalizedResource = text(resource);
  const normalizedRole = text(slot?.role);
  if (!["explain", "example"].includes(normalizedRole)) {
    return false;
  }
  if (normalizedResource === "matrix") {
    return hasMatrixOpeningSignals(draftContract);
  }
  if (normalizedResource === "plane") {
    return hasPlaneOpeningSignals(draftContract);
  }
  return false;
}

export function validateMicrosequenceDraft(rawResponse, draftContract = {}) {
  const parsed = parseDraftResponse(rawResponse);
  if (!parsed.ok) {
    return fail(parsed.errors);
  }

  const errors = [];
  const expectedCount = Number(draftContract?.output?.cardCount || 0);
  const draft = parsed.draft;
  const planByPosition = new Map(
    (Array.isArray(draftContract?.plan) ? draftContract.plan : []).map((item) => [Number(item.position), item])
  );
  const allowedResources = new Set((Array.isArray(draftContract?.resources) ? draftContract.resources : []).map(text));

  if (draft.length !== expectedCount) {
    errors.push("quantidade errada.");
  }

  const finalPlan = draft.map((item, index) => {
    const prefix = `draft[${index}]`;
    Object.keys(item || {}).forEach((fieldName) => {
      if (!ALLOWED_FIELDS.has(fieldName)) {
        errors.push(`${prefix} campo fora do schema: ${fieldName}.`);
      }
    });
    REQUIRED_FIELDS.forEach((fieldName) => {
      if (item?.[fieldName] === undefined) {
        errors.push(`${prefix} campo obrigatório ausente: ${fieldName}.`);
      }
    });
    const position = Number(item?.position);
    const slot = planByPosition.get(position);
    if (!Number.isInteger(position) || !slot) {
      errors.push(`${prefix} position errada.`);
      return null;
    }
    if (!allowedResources.has(text(item?.resource))) {
      errors.push(`${prefix} resource fora do conjunto permitido.`);
    }
    if (!text(item?.goal)) {
      errors.push(`${prefix} goal vazio.`);
    }
    const normalizedItem = {
      ...item,
      resource: text(item?.resource),
      kind: text(item?.kind),
      exercise: text(item?.exercise),
      goal: text(item?.goal)
    };
    validateRoleCompatibility({
      role: text(slot?.role),
      item: normalizedItem,
      prefix,
      errors
    });
    return {
      position,
      role: text(slot?.role),
      resource: text(normalizedItem?.resource),
      kind: text(normalizedItem?.kind),
      exercise: text(normalizedItem?.exercise),
      goal: text(normalizedItem?.goal),
      checks: Array.isArray(slot?.checks) ? slot.checks : []
    };
  }).filter(Boolean);

  const firstSlot = Array.isArray(draftContract?.plan) ? draftContract.plan[0] : null;
  if (
    firstSlot
    && ["explain", "example", "next"].includes(text(firstSlot.role))
    && allowedResources.has("paragraph")
    && text(finalPlan[0]?.resource) !== "paragraph"
    && !isVisualOpeningJustified({
      resource: finalPlan[0]?.resource,
      slot: firstSlot,
      draftContract
    })
  ) {
    errors.push("draft[0] abertura teórica precisa usar paragraph quando esse recurso está permitido.");
  }

  const lastSlot = Array.isArray(draftContract?.plan) ? draftContract.plan.at(-1) : null;
  const isBranch = Boolean(text(draftContract?.microsequence?.branchOf));
  if (
    isBranch
    && lastSlot
    && text(lastSlot.role) === "next"
    && allowedResources.has("paragraph")
    && text(finalPlan.at(-1)?.resource) !== "paragraph"
  ) {
    errors.push("draft final de branch precisa usar paragraph para explicitar o retorno quando esse recurso está permitido.");
  }

  return {
    ok: errors.length === 0,
    errors,
    plan: finalPlan
  };
}
