import { SupabaseHttpClient } from "./SupabaseHttpClient.js";
import { defaultUuidFactory } from "../persistence/relationalSchema.js";

function mutationId() {
  return defaultUuidFactory();
}

const SUPABASE_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function authenticatedUserId(authClient) {
  const userId = String(authClient.getSession?.()?.user?.id || "").trim().toLowerCase();
  if (!SUPABASE_USER_ID_PATTERN.test(userId)) {
    throw new Error("A operação idempotente exige o UUID da sessão Supabase atual.");
  }
  return userId;
}

export class RemoteCourseCatalog {
  constructor({ projectUrl, publishableKey, authClient, fetchImpl = globalThis.fetch } = {}) {
    if (
      !authClient ||
      typeof authClient.getAccessToken !== "function" ||
      typeof authClient.getSession !== "function"
    ) {
      throw new TypeError("Cliente de autenticação obrigatório.");
    }
    this.authClient = authClient;
    this.http = new SupabaseHttpClient({ projectUrl, publishableKey, fetchImpl });
  }

  async rpc(name, parameters = {}) {
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) throw new Error("Autenticação necessária.");
    try {
      return await this.http.rpc(name, parameters, { accessToken });
    } catch (error) {
      if (error?.status === 401) {
        await this.authClient.clearSession();
        this.authClient.emit?.("SESSION_INVALID");
      }
      throw error;
    }
  }

  listCatalog() {
    return this.rpc("list_catalog_courses");
  }

  listLibrary() {
    return this.rpc("list_user_course_summaries");
  }

  async runIdempotentCourseRpc(
    operation,
    courseId,
    parameterName,
    requestMutationId = null,
    additionalParameters = {}
  ) {
    const userId = authenticatedUserId(this.authClient);
    const stateKey = `rpc.pending.${userId}:${operation}:${courseId}`;
    const sessionStore = this.authClient.sessionStore;
    let effectiveMutationId = requestMutationId;
    if (!effectiveMutationId && typeof sessionStore?.getSyncState === "function") {
      effectiveMutationId = await sessionStore.getSyncState(stateKey);
    }
    effectiveMutationId ||= mutationId();
    if (typeof sessionStore?.putSyncState === "function") {
      await sessionStore.putSyncState(stateKey, effectiveMutationId);
    }
    const result = await this.rpc(operation, {
      [parameterName]: courseId,
      ...additionalParameters,
      p_mutation_id: effectiveMutationId
    });
    if (typeof sessionStore?.putSyncState === "function") {
      await sessionStore.putSyncState(stateKey, null);
    }
    return result;
  }

  cloneCourse(sourceCourseId, requestMutationId = null) {
    return this.runIdempotentCourseRpc(
      "clone_catalog_course",
      sourceCourseId,
      "p_source_course_id",
      requestMutationId
    );
  }

  refreshCourse(personalCourseId, requestMutationId = null) {
    return this.runIdempotentCourseRpc(
      "refresh_personal_course_from_source",
      personalCourseId,
      "p_personal_course_id",
      requestMutationId
    );
  }

  deleteCourse(personalCourseId, baseRevision, requestMutationId = null) {
    return this.runIdempotentCourseRpc(
      "delete_personal_course",
      personalCourseId,
      "p_course_id",
      requestMutationId,
      { p_base_revision: Number(baseRevision || 0) }
    );
  }

  downloadCourseGraph(personalCourseId) {
    return this.rpc("get_personal_course_graph", { p_course_id: personalCourseId });
  }
}
