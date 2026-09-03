import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_REFERENCE_PAGES = 100;
const HUMAN_TASK_IDENTITY_CONTRACT = "aralearn.human-task-identity.v1";

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function humanReference(value, label, { stringOnly = false } = {}) {
  if (!stringOnly && Number.isSafeInteger(value) && value >= 1) {
    return { kind: "position", value };
  }
  if (typeof value === "string" && value === value.trim() && value &&
      [...value].length <= 300) {
    const normalized = normalizedText(value);
    if (normalized) return { kind: "text", value, normalized };
  }
  throw new AuthoringApiError(
    422,
    "invalid_human_reference",
    `${label} precisa ser um título ou uma posição humana a partir de 1.`
  );
}

function notFound(label) {
  throw new AuthoringApiError(404, "human_reference_not_found", `${label} não foi localizado.`);
}

function ambiguous(label, count) {
  throw new AuthoringApiError(
    409,
    "ambiguous_human_reference",
    `${label} corresponde a mais de um objeto; use um título mais específico ou a posição.`,
    { matchingCount: count }
  );
}

function uniqueBy(items, identity) {
  return [...new Map(items.map((item) => [identity(item), item])).values()];
}

function textMatches(items, reference, texts, label) {
  const exact = items.filter((item) => texts(item).some((value) =>
    normalizedText(value) === reference.normalized));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) ambiguous(label, exact.length);
  const plausible = items.filter((item) => texts(item).some((value) => {
    const normalized = normalizedText(value);
    if (!normalized) return false;
    return normalized.includes(reference.normalized);
  }));
  if (plausible.length === 1) return plausible[0];
  if (plausible.length > 1) ambiguous(label, plausible.length);
  return notFound(label);
}

function positionedMatch(items, reference, position, texts, label) {
  if (reference.kind === "text") return textMatches(items, reference, texts, label);
  const matches = items.filter((item, index) => {
    const stored = Number(position(item));
    return Number.isSafeInteger(stored) ? stored + 1 === reference.value : index + 1 === reference.value;
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) ambiguous(label, matches.length);
  return notFound(label);
}

function pageCursorKey(cursor) {
  return cursor == null ? "null" : JSON.stringify(cursor);
}

async function allCourseMatches({ adapter, principal, title, deadlineAt }) {
  const matches = [];
  const seenCursors = new Set();
  let cursor = null;
  for (let pageIndex = 0; pageIndex < MAX_REFERENCE_PAGES; pageIndex += 1) {
    const key = pageCursorKey(cursor);
    if (seenCursors.has(key)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A paginação de Cursos repetiu o mesmo ponto."
      );
    }
    seenCursors.add(key);
    const page = await adapter.listCourses({
      principal,
      query: title,
      limit: 50,
      beforeUpdatedAt: cursor?.beforeUpdatedAt ?? null,
      beforeId: cursor?.beforeId ?? null,
      deadlineAt
    });
    if (!plainObject(page) || !Array.isArray(page.items)) {
      throw new AuthoringApiError(503, "course_service_unavailable", "A lista de Cursos é inválida.");
    }
    matches.push(...page.items.filter((item) =>
      plainObject(item) && typeof item.courseId === "string" && typeof item.title === "string"));
    if (page.hasMore !== true) return matches;
    if (!plainObject(page.nextCursor)) {
      throw new AuthoringApiError(503, "course_service_unavailable", "A lista de Cursos perdeu o cursor.");
    }
    cursor = page.nextCursor;
  }
  throw new AuthoringApiError(
    503,
    "course_service_unavailable",
    "A busca de Cursos excedeu o limite seguro de paginação."
  );
}

async function resolveCourse({ adapter, principal, course, deadlineAt }) {
  const reference = humanReference(course, "O Curso", { stringOnly: true });
  const listed = uniqueBy(await allCourseMatches({
    adapter,
    principal,
    title: reference.value,
    deadlineAt
  }), (item) => item.courseId);
  const match = textMatches(listed, reference, (item) => [item.title], "O Curso");
  const detail = await adapter.getCourse({
    principal,
    courseId: match.courseId,
    includeOutline: false,
    deadlineAt
  });
  const revision = Number(detail?.revision ?? detail?.courseRevision);
  if (!plainObject(detail) || detail.courseId !== match.courseId ||
      !Number.isSafeInteger(revision) || revision < 1) {
    throw new AuthoringApiError(503, "course_service_unavailable", "O Curso localizado não pôde ser relido.");
  }
  return {
    id: match.courseId,
    title: String(detail.title || match.title),
    revision,
    deepLink: detail.deepLink ?? match.deepLink ?? null
  };
}

function resolvePart(planRead, referenceValue) {
  const reference = humanReference(referenceValue, "A Parte");
  const parts = Array.isArray(planRead?.plan?.parts) ? planRead.plan.parts : [];
  return positionedMatch(
    parts,
    reference,
    (part) => part.position,
    (part) => [part.title],
    "A Parte"
  );
}

function partMicrosequences(part) {
  if (Array.isArray(part?.microsequences)) return part.microsequences;
  return (Array.isArray(part?.microsequenceIds) ? part.microsequenceIds : []).map((id, index) => ({
    id,
    productionPosition: index,
    title: id
  }));
}

function resolveMicrosequence(planRead, part, referenceValue) {
  const reference = humanReference(referenceValue, "A Microssequência");
  const candidates = part
    ? partMicrosequences(part)
    : (Array.isArray(planRead?.plan?.parts) ? planRead.plan.parts : [])
      .flatMap(partMicrosequences);
  return positionedMatch(
    candidates,
    reference,
    (microsequence) => microsequence.productionPosition ?? microsequence.position,
    (microsequence) => [microsequence.title],
    "A Microssequência"
  );
}

async function listStudyUnits({
  adapter,
  principal,
  course,
  part,
  microsequence,
  deadlineAt
}) {
  const scopeKind = microsequence
    ? "didactic_microsequence"
    : part
      ? "authoring_part"
      : "course";
  const scopeId = microsequence?.id ?? part?.id ?? null;
  const items = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursorStudyUnitId = null;
  for (let pageIndex = 0; pageIndex < MAX_REFERENCE_PAGES; pageIndex += 1) {
    const cursorKey = cursorStudyUnitId ?? "null";
    if (seenCursors.has(cursorKey)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A paginação de Unidades repetiu o mesmo ponto."
      );
    }
    seenCursors.add(cursorKey);
    const page = await adapter.listCourseStudyUnits({
      principal,
      courseId: course.id,
      expectedRevision: course.revision,
      scopeKind,
      scopeId,
      cursorStudyUnitId,
      direction: "forward",
      limit: 24,
      maxBytes: 512 * 1024,
      inspectionVersion: 2,
      deadlineAt
    });
    if (!plainObject(page) || !Array.isArray(page.items)) {
      throw new AuthoringApiError(503, "course_service_unavailable", "A lista de Unidades é inválida.");
    }
    for (const item of page.items) {
      const id = item?.studyUnit?.id;
      if (typeof id !== "string" || seenIds.has(id)) continue;
      seenIds.add(id);
      items.push(item);
    }
    if (page.hasMore !== true) return items;
    const next = page.nextCursor?.studyUnitId;
    if (typeof next !== "string" || !next) {
      throw new AuthoringApiError(503, "course_service_unavailable", "A lista de Unidades perdeu o cursor.");
    }
    cursorStudyUnitId = next;
  }
  throw new AuthoringApiError(
    503,
    "course_service_unavailable",
    "A busca de Unidades excedeu o limite seguro de paginação."
  );
}

function resolveStudyUnitReferences(items, values) {
  if (!Array.isArray(values) || values.length > 64) {
    throw new AuthoringApiError(422, "invalid_human_reference", "As Unidades precisam formar uma seleção limitada.");
  }
  const resolved = values.map((value) => {
    const reference = humanReference(value, "A Unidade");
    if (reference.kind === "text") {
      return textMatches(items, reference, (item) => [item.studyUnit?.title], "A Unidade");
    }
    const ordinal = items.filter((item) => Number(item.ordinal) === reference.value);
    if (ordinal.length === 1) return ordinal[0];
    if (ordinal.length > 1) ambiguous("A Unidade", ordinal.length);
    return positionedMatch(
      items,
      reference,
      (_item, index) => index,
      (item) => [item.studyUnit?.title],
      "A Unidade"
    );
  });
  if (new Set(resolved.map((item) => item.studyUnit.id)).size !== resolved.length) {
    throw new AuthoringApiError(
      422,
      "duplicate_human_reference",
      "A seleção repete a mesma Unidade."
    );
  }
  return resolved;
}

async function resolveSource({ adapter, principal, course, source, deadlineAt }) {
  const reference = humanReference(source, "A Fonte");
  const items = [];
  const seenCursors = new Set();
  let cursor = null;
  for (let pageIndex = 0; pageIndex < MAX_REFERENCE_PAGES; pageIndex += 1) {
    const key = cursor ?? "null";
    if (seenCursors.has(key)) {
      throw new AuthoringApiError(503, "course_service_unavailable", "A paginação de Fontes repetiu o mesmo ponto.");
    }
    seenCursors.add(key);
    const page = await adapter.getCourseSources({
      principal,
      courseId: course.id,
      expectedRevision: course.revision,
      mode: "catalog",
      cursor,
      limit: 24,
      deadlineAt
    });
    if (!plainObject(page) || !Array.isArray(page.items)) {
      throw new AuthoringApiError(503, "course_service_unavailable", "O catálogo de Fontes é inválido.");
    }
    items.push(...page.items);
    if (page.nextCursor == null) break;
    if (typeof page.nextCursor !== "string" || !page.nextCursor) {
      throw new AuthoringApiError(503, "course_service_unavailable", "O catálogo de Fontes perdeu o cursor.");
    }
    cursor = page.nextCursor;
  }
  return positionedMatch(
    uniqueBy(items, (item) => `${item.sourceId}\0${item.revision ?? 0}`),
    reference,
    (_item, index) => index,
    (item) => [item.title, item.citationText],
    "A Fonte"
  );
}

async function resolveInternalSource({ adapter, principal, course, sourceId, deadlineAt }) {
  if (typeof sourceId !== "string" || sourceId !== sourceId.trim() || !sourceId ||
      [...sourceId].length > 240) {
    throw new TypeError("A identidade interna da Fonte é inválida.");
  }
  const read = await adapter.getCourseSources({
    principal,
    courseId: course.id,
    expectedRevision: course.revision,
    mode: "source",
    sourceId,
    targetKind: null,
    targetId: null,
    cursor: null,
    limit: 1,
    deadlineAt
  });
  const source = Array.isArray(read?.items) && read.items.length === 1 &&
    plainObject(read.items[0]) && read.items[0].sourceId === sourceId
    ? read.items[0]
    : null;
  if (!source) {
    throw new AuthoringApiError(
      503,
      "course_service_unavailable",
      "A Fonte recém-gravada não pôde ser relida."
    );
  }
  return source;
}

/**
 * Resolve referências humanas sobre o estado vivo. Identidades e fences ficam
 * neste retorno interno e nunca precisam fazer parte do schema da tool.
 */
export async function resolveHumanCourseContext({
  adapter,
  principal,
  course,
  part = null,
  microsequence = null,
  studyUnits = [],
  source = null,
  internalSourceId = null,
  deadlineAt = null
}) {
  if (!adapter || !principal) throw new TypeError("Dependências da resolução humana são inválidas.");
  if (source !== null && internalSourceId !== null) {
    throw new TypeError("A resolução da Fonte recebeu duas autoridades.");
  }
  const resolvedCourse = await resolveCourse({ adapter, principal, course, deadlineAt });
  let plan = null;
  let resolvedPart = null;
  let resolvedMicrosequence = null;
  if (part !== null || microsequence !== null) {
    plan = await adapter.getCourseInstructionalPlan({
      principal,
      courseId: resolvedCourse.id,
      recentLimit: 1,
      deadlineAt
    });
    const revision = Number(plan?.courseRevision);
    if (!plainObject(plan?.plan) || !Number.isSafeInteger(revision) || revision < 1) {
      throw new AuthoringApiError(503, "course_service_unavailable", "O planejamento do Curso é inválido.");
    }
    resolvedCourse.revision = revision;
    if (typeof plan.plan.title === "string" && plan.plan.title) resolvedCourse.title = plan.plan.title;
    if (part !== null) resolvedPart = resolvePart(plan, part);
    if (microsequence !== null) {
      resolvedMicrosequence = resolveMicrosequence(plan, resolvedPart, microsequence);
    }
  }
  const resolvedStudyUnits = studyUnits.length
    ? resolveStudyUnitReferences(await listStudyUnits({
        adapter,
        principal,
        course: resolvedCourse,
        part: resolvedPart,
        microsequence: resolvedMicrosequence,
        deadlineAt
      }), studyUnits)
    : [];
  const resolvedSource = internalSourceId !== null
    ? await resolveInternalSource({
        adapter,
        principal,
        course: resolvedCourse,
        sourceId: internalSourceId,
        deadlineAt
      })
    : source === null
      ? null
      : await resolveSource({
        adapter,
        principal,
        course: resolvedCourse,
        source,
        deadlineAt
      });
  return {
    course: resolvedCourse,
    plan,
    part: resolvedPart,
    microsequence: resolvedMicrosequence,
    studyUnits: resolvedStudyUnits,
    source: resolvedSource
  };
}

function ambiguousWriteFailure(error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  const code = String(error?.code || "").toUpperCase();
  return status === 408 || status === 429 || status >= 500 ||
    new Set([
      "REQUEST_TIMEOUT", "NETWORK_ERROR", "FETCH_FAILED", "ETIMEDOUT",
      "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN",
      "COURSE_SOURCE_PDF_WRITE_UNCERTAIN"
    ]).has(code) || error?.name === "AbortError" ||
    error?.name === "TypeError" && /fetch|network|load failed/iu.test(String(error.message || ""));
}

function staleWriteFailure(error) {
  const code = String(error?.code || "").toLowerCase();
  return code === "stale_course_state" || code === "40001";
}

async function internalRequestId(factory) {
  const value = await factory();
  if (typeof value !== "string" || !REQUEST_ID_PATTERN.test(value)) {
    throw new TypeError("A fábrica interna produziu requestId inválido.");
  }
  return value;
}

function defaultRequestId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new TypeError("Gerador seguro de requestId indisponível.");
  }
  return globalThis.crypto.randomUUID();
}

function deterministicUuidFromHash(hash) {
  const bytes = hash.slice(0, 32).split("");
  bytes[12] = "8";
  bytes[16] = ((Number.parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const value = bytes.join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20, 32)
  ].join("-");
}

async function defaultEntityId({ requestId, slot }) {
  const hash = await sha256Hex([HUMAN_TASK_IDENTITY_CONTRACT, requestId, slot].join("\0"));
  return deterministicUuidFromHash(hash);
}

async function internalEntityId(factory, requestId, slot) {
  if (typeof slot !== "string" || !slot || slot.length > 160) {
    throw new TypeError("O slot interno da identidade é inválido.");
  }
  const value = await factory({ requestId, slot });
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError("A fábrica interna produziu identidade inválida.");
  }
  return value;
}

/**
 * Coordena uma escrita humana concreta: os handlers fornecem leitura, build e
 * commit do caso de uso; este ponto mantém requestId, replay e CAS internos.
 */
export async function executeTrustedCourseWrite({
  load,
  build,
  commit,
  requestIdFactory = defaultRequestId,
  entityIdFactory = defaultEntityId,
  maxCasRetries = 1
}) {
  if (typeof load !== "function" || typeof build !== "function" ||
      typeof commit !== "function" || typeof requestIdFactory !== "function" ||
      typeof entityIdFactory !== "function" ||
      !Number.isSafeInteger(maxCasRetries) || maxCasRetries < 0 || maxCasRetries > 2) {
    throw new TypeError("Dependências da escrita confiável são inválidas.");
  }
  let state = await load();
  let casAttempts = 0;
  while (true) {
    const requestId = await internalRequestId(requestIdFactory);
    const built = await build(state, {
      newId: (slot) => internalEntityId(entityIdFactory, requestId, slot)
    });
    if (!plainObject(built) || Object.hasOwn(built, "requestId")) {
      throw new TypeError("O caso de uso deve devolver argumentos sem requestId.");
    }
    const request = { ...built, requestId };
    try {
      return await commit(request);
    } catch (firstError) {
      let error = firstError;
      if (ambiguousWriteFailure(firstError)) {
        try {
          return await commit(request);
        } catch (replayError) {
          // Depois de uma confirmação divergente, qualquer falha no replay
          // ainda deixa a escrita original incerta. Publicar o segundo erro
          // como transitório permitiria uma nova identidade e outra Fonte.
          error = firstError?.code === "course_source_pdf_write_uncertain"
            ? firstError
            : replayError;
        }
      }
      if (!staleWriteFailure(error) || casAttempts >= maxCasRetries) throw error;
      casAttempts += 1;
      state = await load();
    }
  }
}
