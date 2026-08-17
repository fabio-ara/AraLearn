import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";
import { SupabaseHttpClient } from "./SupabaseHttpClient.js";

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const AVATAR_BUCKET = "person-avatars";
const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
});
const AVATAR_OBJECT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;

function first(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function uuid(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new TypeError(`${label} inválido.`);
  return normalized;
}

function positiveInteger(value, label, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new TypeError(`${label} inválido.`);
  }
  return normalized;
}

function cursor(value, label) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} inválido.`);
  }
  const beforeUpdatedAt = String(value.beforeUpdatedAt || "").trim();
  const beforeId = uuid(value.beforeId, `${label}: identidade`);
  if (!RFC3339.test(beforeUpdatedAt) || !Number.isFinite(Date.parse(beforeUpdatedAt))) {
    throw new TypeError(`${label}: data inválida.`);
  }
  return { beforeUpdatedAt, beforeId };
}

function entityCursor(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Cursor de entidades inválido.");
  }
  const entityType = String(value.entityType || "").trim();
  const entityId = String(value.entityId || "").trim();
  if (!entityType || !entityId || entityType.length > 40 || entityId.length > 240) {
    throw new TypeError("Cursor de entidades inválido.");
  }
  return { entityType, entityId };
}

function timestamp(value, label) {
  const normalized = String(value || "").trim();
  if (!RFC3339.test(normalized) || !Number.isFinite(Date.parse(normalized))) {
    throw new TypeError(`${label} inválida.`);
  }
  return normalized;
}

function exactObject(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((field) => !fields.has(field))) {
    throw new TypeError(`${label} inválido.`);
  }
  return value;
}

function hasControlCharacter(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint < 32 || codePoint === 127;
  });
}

function reviewCursor(value) {
  if (value == null) return null;
  const source = exactObject(value, new Set([
    "beforeMarkedAt", "beforeCourseId", "beforeStudyUnitId"
  ]), "Cursor da fila Rever");
  if (Object.keys(source).length !== 3) {
    throw new TypeError("Cursor da fila Rever inválido.");
  }
  const beforeStudyUnitId = String(source.beforeStudyUnitId || "").trim();
  if (!beforeStudyUnitId || beforeStudyUnitId.length > 240 ||
      hasControlCharacter(beforeStudyUnitId)) {
    throw new TypeError("Cursor da fila Rever inválido.");
  }
  return {
    beforeMarkedAt: timestamp(source.beforeMarkedAt, "Data da fila Rever"),
    beforeCourseId: uuid(source.beforeCourseId, "Curso da fila Rever"),
    beforeStudyUnitId
  };
}

function normalizeReviewItem(value) {
  const source = exactObject(value, new Set([
    "courseId", "studyUnitId", "title", "context", "entityPath", "reviewMarkedAt"
  ]), "Item da fila Rever");
  if (Object.keys(source).length !== 6 || !Array.isArray(source.entityPath) ||
      source.entityPath.length !== 5) {
    throw new TypeError("Item da fila Rever inválido.");
  }
  const courseId = uuid(source.courseId, "Curso da fila Rever");
  const studyUnitId = String(source.studyUnitId || "").trim();
  const title = String(source.title || "").trim();
  const context = String(source.context || "").trim();
  const entityPath = source.entityPath.map((identity) => String(identity || "").trim());
  if (!studyUnitId || studyUnitId.length > 240 || !title || title.length > 500 ||
      !context || context.length > 1_000 ||
      entityPath.some((identity) => !identity || identity.length > 240) ||
      entityPath[0].toLowerCase() !== courseId || entityPath[4] !== studyUnitId) {
    throw new TypeError("Item da fila Rever inválido.");
  }
  return {
    courseId,
    studyUnitId,
    title,
    context,
    entityPath,
    reviewMarkedAt: timestamp(source.reviewMarkedAt, "Marcação para Rever")
  };
}

function normalizeReviewPage(value) {
  const source = exactObject(value, new Set([
    "contract", "items", "hasMore", "nextCursor"
  ]), "Página da fila Rever");
  if (Object.keys(source).length !== 4 ||
      source.contract !== "aralearn.course-review-list.v1" ||
      !Array.isArray(source.items) || typeof source.hasMore !== "boolean") {
    throw new TypeError("Página da fila Rever inválida.");
  }
  const items = source.items.map(normalizeReviewItem);
  const identities = new Set(items.map((item) => `${item.courseId}\u0000${item.studyUnitId}`));
  if (identities.size !== items.length || (source.hasMore && items.length === 0)) {
    throw new TypeError("Página da fila Rever inválida.");
  }
  const nextCursor = source.hasMore ? reviewCursor(source.nextCursor) : null;
  if (!source.hasMore && source.nextCursor != null) {
    throw new TypeError("Página da fila Rever inválida.");
  }
  return {
    contract: source.contract,
    items,
    hasMore: source.hasMore,
    nextCursor
  };
}

function plainObject(value, label) {
  const prototype = value && typeof value === "object" ? Object.getPrototypeOf(value) : null;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (prototype !== Object.prototype && prototype !== null)) {
    throw new TypeError(`${label} inválido.`);
  }
  return structuredClone(value);
}

function authenticationFailure(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  return status === 401 || new Set([
    "AUTH_REQUIRED",
    "BAD_JWT",
    "INVALID_JWT",
    "JWT_EXPIRED",
    "PGRST301"
  ]).has(code);
}

function storageObjectPath(objectKey) {
  const normalized = String(objectKey || "").trim().toLowerCase();
  if (!AVATAR_OBJECT_KEY.test(normalized)) {
    throw new TypeError("Objeto de avatar inválido.");
  }
  return normalized.split("/").map(encodeURIComponent).join("/");
}

export class CourseApiClient {
  constructor({ projectUrl, publishableKey, authClient, fetchImpl = globalThis.fetch } = {}) {
    if (!authClient || typeof authClient.getAccessToken !== "function") {
      throw new TypeError("Cliente de autenticação obrigatório.");
    }
    this.authClient = authClient;
    this.http = new SupabaseHttpClient({ projectUrl, publishableKey, fetchImpl });
  }

  async rpc(name, parameters = {}, options = {}) {
    try {
      const accessToken = await this.authClient.getAccessToken();
      if (!accessToken) {
        const error = new Error("Entre novamente para continuar.");
        error.status = 401;
        error.code = "AUTH_REQUIRED";
        throw error;
      }
      return first(await this.http.rpc(name, parameters, { ...options, accessToken }));
    } catch (error) {
      if (authenticationFailure(error)) {
        await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
        this.authClient.emit?.("SESSION_INVALID");
        error.authRequired = true;
      }
      throw error;
    }
  }

  listCourses({
    query = "",
    limit = 24,
    cursor: cursorValue = null,
    ownerOnly = false
  } = {}) {
    const normalizedQuery = String(query || "").trim();
    if (normalizedQuery.length > 120) throw new TypeError("Busca de Cursos longa demais.");
    const normalizedCursor = cursor(cursorValue, "Cursor de Cursos");
    return this.rpc(ownerOnly ? "list_owned_courses_v1" : "list_courses_v1", {
      p_query: normalizedQuery || null,
      p_limit: positiveInteger(limit, "Limite de Cursos", { maximum: 50 }),
      p_before_updated_at: normalizedCursor?.beforeUpdatedAt || null,
      p_before_id: normalizedCursor?.beforeId || null
    });
  }

  async listCourseReviewItems({ limit = 100, cursor: cursorValue = null } = {}) {
    const normalizedCursor = reviewCursor(cursorValue);
    return normalizeReviewPage(await this.rpc("list_course_review_items_v1", {
      p_limit: positiveInteger(limit, "Limite da fila Rever", { maximum: 100 }),
      p_before_marked_at: normalizedCursor?.beforeMarkedAt || null,
      p_before_course_id: normalizedCursor?.beforeCourseId || null,
      p_before_study_unit_id: normalizedCursor?.beforeStudyUnitId || null
    }));
  }

  getCourse(courseId, { ownerOnly = false } = {}) {
    return this.rpc(ownerOnly ? "get_owned_course_v1" : "get_course_v1", {
      p_course_id: uuid(courseId, "Curso")
    });
  }

  getCourseEntities(courseId, {
    revision,
    cursor: cursorValue = null,
    limit = 500,
    ownerOnly = false
  } = {}) {
    const normalizedCursor = entityCursor(cursorValue);
    return this.rpc(
      ownerOnly ? "list_owned_course_entities_v1" : "list_course_entities_v1",
      {
      p_course_id: uuid(courseId, "Curso"),
      p_expected_revision: positiveInteger(revision, "Versão de estado"),
      p_limit: positiveInteger(limit, "Limite de entidades", { maximum: 1_000 }),
      p_after_entity_type: normalizedCursor?.entityType || null,
      p_after_entity_id: normalizedCursor?.entityId || null
      },
      { timeoutMs: 60_000 }
    );
  }

  loadPersonalState(courseId) {
    return this.rpc("load_course_personal_state_v1", {
      p_course_id: uuid(courseId, "Curso")
    });
  }

  mutatePersonalState({ courseId, expectedRevision, operations, requestId = createUuid() }) {
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 512) {
      throw new TypeError("Operações do estado pessoal inválidas.");
    }
    const normalizedOperations = structuredClone(operations);
    if (new TextEncoder().encode(JSON.stringify(normalizedOperations)).byteLength > 65_536) {
      throw new TypeError("Operações do estado pessoal excedem o limite.");
    }
    return this.rpc("mutate_course_personal_state_v1", {
      p_course_id: uuid(courseId, "Curso"),
      p_expected_revision: positiveInteger(expectedRevision, "Versão do estado pessoal", {
        minimum: 0
      }),
      p_operations: normalizedOperations,
      p_request_id: uuid(requestId, "Identidade da alteração")
    });
  }

  async executeCourseAction(name, argumentsValue = {}) {
    const actionName = String(name || "").trim();
    if (!/^[a-z][A-Za-z0-9]{2,79}$/u.test(actionName)) {
      throw new TypeError("Operação de Curso inválida.");
    }
    const body = plainObject(argumentsValue, "Argumentos da operação");
    try {
      const accessToken = await this.authClient.getAccessToken();
      if (!accessToken) {
        const error = new Error("Entre novamente para continuar.");
        error.status = 401;
        throw error;
      }
      const response = await this.http.request(
        `/functions/v1/aralearn-course-api/app/${encodeURIComponent(actionName)}`,
        { method: "POST", body, accessToken, timeoutMs: 60_000 }
      );
      return response?.data ?? null;
    } catch (error) {
      if (authenticationFailure(error)) {
        await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
        this.authClient.emit?.("SESSION_INVALID");
        error.authRequired = true;
      }
      throw error;
    }
  }

  getPersonProfile() {
    return this.executeCourseAction("gerirPessoas", {
      operation: "read_profile"
    });
  }

  updatePersonProfile(patch) {
    const normalized = plainObject(patch, "Alteração de perfil");
    const allowed = new Set(["displayName", "avatarObjectKey"]);
    if (!Object.keys(normalized).length ||
        Object.keys(normalized).some((field) => !allowed.has(field))) {
      throw new TypeError("Alteração de perfil inválida.");
    }
    return this.executeCourseAction("gerirPessoas", {
      operation: "update_profile",
      ...normalized
    });
  }

  listCourseAccess(courseId) {
    return this.executeCourseAction("gerirPessoas", {
      operation: "list_access",
      courseId: uuid(courseId, "Curso")
    });
  }

  grantCourseAccess({
    courseId,
    email,
    confirmed,
    requestId = createUuid()
  } = {}) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (confirmed !== true || normalizedEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+$/u.test(normalizedEmail)) {
      throw new TypeError("Concessão de acesso inválida.");
    }
    return this.executeCourseAction("gerirPessoas", {
      operation: "grant_access",
      courseId: uuid(courseId, "Curso"),
      email: normalizedEmail,
      confirmed: true,
      requestId: uuid(requestId, "Identidade da alteração")
    });
  }

  revokeCourseAccess({
    courseId,
    userId,
    confirmed,
    requestId = createUuid()
  } = {}) {
    if (confirmed !== true) throw new TypeError("Revogação de acesso inválida.");
    return this.executeCourseAction("gerirPessoas", {
      operation: "revoke_access",
      courseId: uuid(courseId, "Curso"),
      userId: uuid(userId, "Pessoa"),
      confirmed: true,
      requestId: uuid(requestId, "Identidade da alteração")
    });
  }

  async uploadAvatar(file, { objectId = createUuid() } = {}) {
    const size = Number(file?.size);
    const contentType = String(file?.type || "").trim().toLowerCase();
    const extension = AVATAR_EXTENSIONS[contentType];
    const userId = uuid(this.authClient.getSession?.()?.user?.id, "Pessoa");
    if (!extension || !Number.isSafeInteger(size) || size < 1 || size > AVATAR_MAX_BYTES) {
      throw new TypeError("Use uma imagem JPEG, PNG ou WebP de até 512 KiB.");
    }
    const objectKey = `${userId}/${uuid(objectId, "Identidade do avatar")}.${extension}`;
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) {
      const error = new Error("Entre novamente para continuar.");
      error.status = 401;
      error.code = "AUTH_REQUIRED";
      throw error;
    }
    try {
      await this.http.request(
        `/storage/v1/object/${AVATAR_BUCKET}/${storageObjectPath(objectKey)}`,
        {
          method: "POST",
          body: file,
          rawBody: true,
          accessToken,
          headers: {
            "Content-Type": contentType,
            "x-upsert": "false"
          }
        }
      );
      return { objectKey, contentType, size };
    } catch (error) {
      if (authenticationFailure(error)) {
        await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
        this.authClient.emit?.("SESSION_INVALID");
        error.authRequired = true;
      }
      throw error;
    }
  }

  async loadAvatar(objectKey) {
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) throw Object.assign(new Error("Entre novamente para continuar."), {
      status: 401,
      code: "AUTH_REQUIRED"
    });
    return this.http.request(
      `/storage/v1/object/authenticated/${AVATAR_BUCKET}/${storageObjectPath(objectKey)}`,
      { accessToken, responseType: "blob" }
    );
  }

  async deleteOwnAvatar(objectKey) {
    const normalized = String(objectKey || "").trim().toLowerCase();
    const userId = uuid(this.authClient.getSession?.()?.user?.id, "Pessoa");
    storageObjectPath(normalized);
    if (!normalized.startsWith(`${userId}/`)) {
      throw new TypeError("Somente o próprio avatar pode ser removido.");
    }
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) throw Object.assign(new Error("Entre novamente para continuar."), {
      status: 401,
      code: "AUTH_REQUIRED"
    });
    return this.http.request(`/storage/v1/object/${AVATAR_BUCKET}`, {
      method: "DELETE",
      body: { prefixes: [normalized] },
      accessToken
    });
  }

  async deleteMyAccount({ confirmation } = {}) {
    if (confirmation !== "EXCLUIR MINHA CONTA") {
      throw new TypeError("A confirmação de exclusão da conta é inválida.");
    }
    const userId = uuid(this.authClient.getSession?.()?.user?.id, "Pessoa");
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) throw Object.assign(new Error("Entre novamente para continuar."), {
      status: 401,
      code: "AUTH_REQUIRED"
    });
    const objectKeys = [];
    for (let offset = 0; offset < 1_000; offset += 100) {
      const items = await this.http.request(`/storage/v1/object/list/${AVATAR_BUCKET}`, {
        method: "POST",
        body: {
          prefix: `${userId}/`,
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" }
        },
        accessToken
      });
      if (!Array.isArray(items)) throw new TypeError("A listagem de avatares é inválida.");
      for (const item of items) {
        const name = String(item?.name || "").trim().toLowerCase();
        const objectKey = name.includes("/") ? name : `${userId}/${name}`;
        if (AVATAR_OBJECT_KEY.test(objectKey)) objectKeys.push(objectKey);
      }
      if (items.length < 100) break;
      if (offset === 900) {
        throw new Error("A conta possui objetos demais para exclusão segura automática.");
      }
    }
    for (let index = 0; index < objectKeys.length; index += 100) {
      await this.http.request(`/storage/v1/object/${AVATAR_BUCKET}`, {
        method: "DELETE",
        body: { prefixes: objectKeys.slice(index, index + 100) },
        accessToken
      });
    }
    return this.rpc("delete_my_account_v1", {
      p_confirmation: confirmation
    }, { timeoutMs: 60_000 });
  }
}
