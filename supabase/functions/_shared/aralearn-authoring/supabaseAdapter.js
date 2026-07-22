import { deterministicRequestUuid, prepareCourseDocument } from "./canonical.js";
import { AuthoringApiError, asAuthoringApiError } from "./errors.js";
import { publishOfficialDocumentStep } from "./officialPublisher.js";
import { materializePrivateDocumentStep } from "./privatePublisher.js";
import { derivePrivateIntegrationApiKey, sha256Hex } from "./security.js";

function first(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

function normalizeUrl(value) {
  const result = String(value || "").trim().replace(/\/+$/, "");
  if (!result) throw new Error("SUPABASE_URL ausente no servidor.");
  return result;
}

function retryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function validationMessage(databaseCode, body, fallback) {
  if (databaseCode !== "22023") return fallback;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 1_000 || /\b(private|constraint|schema|table)\b/i.test(message)) {
    return fallback;
  }
  return message;
}

function apiError(status, body, fallbackCode = "database_error") {
  const databaseCode = String(body?.code || "");
  if (status === 401) return new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
  if (status === 408) {
    return new AuthoringApiError(
      503,
      "service_timeout",
      "O Supabase não respondeu dentro do tempo esperado."
    );
  }
  if (status === 403 || databaseCode === "42501") {
    return new AuthoringApiError(403, "not_authorized", "A operação não foi autorizada.");
  }
  if (databaseCode === "40001") {
    return new AuthoringApiError(
      409,
      "stale_authoring_state",
      "O estado da autoria mudou; atualize e tente novamente."
    );
  }
  if (databaseCode === "55P03") {
    return new AuthoringApiError(
      503,
      "publication_lease_unavailable",
      "A publicação já está sendo processada."
    );
  }
  if (databaseCode === "AR409") {
    return new AuthoringApiError(
      409,
      "course_incomplete",
      "A execução ainda não produziu um curso completo e validado."
    );
  }
  if (databaseCode === "AR422") {
    return new AuthoringApiError(
      422,
      "collection_unavailable",
      "A coleção escolhida não está mais disponível."
    );
  }
  if (status === 409 || databaseCode === "23505") {
    return new AuthoringApiError(
      409,
      "conflict",
      "A operação conflita com um registro existente."
    );
  }
  if (databaseCode === "55000") {
    return new AuthoringApiError(409, "invalid_state", "A operação não é válida no estado atual.");
  }
  if (databaseCode === "54000") {
    return new AuthoringApiError(
      413,
      "staging_quota_exceeded",
      "O limite de armazenamento temporário foi atingido."
    );
  }
  if (databaseCode === "P0002") {
    return new AuthoringApiError(404, "not_found", "O recurso solicitado não foi encontrado.");
  }
  if (databaseCode === "28000") return new AuthoringApiError(401, "invalid_client", "Credencial de autoria inválida.");
  if (databaseCode === "P0001" && /limite|rate/i.test(String(body?.message || ""))) {
    return new AuthoringApiError(429, "rate_limited", "Limite temporário da API de autoria excedido.");
  }
  if (status === 429) {
    return new AuthoringApiError(429, "rate_limited", "Limite temporário da API de autoria excedido.");
  }
  if (status === 422 || databaseCode === "23514" || databaseCode === "22023") {
    return new AuthoringApiError(
      422,
      "invalid_command",
      validationMessage(databaseCode, body, "Os dados enviados são inválidos.")
    );
  }
  if (status >= 500) {
    return new AuthoringApiError(
      503,
      "service_unavailable",
      "O serviço de autoria está temporariamente indisponível."
    );
  }
  return new AuthoringApiError(
    status || 500,
    fallbackCode,
    "A operação no banco não pôde ser concluída."
  );
}

export class SupabaseAuthoringAdapter {
  constructor({
    supabaseUrl,
    serviceRoleKey,
    publishableKey,
    integrationKeySecret = serviceRoleKey,
    fetchImpl = globalThis.fetch,
    attempts = 3,
    requestTimeoutMs = 12_000,
    publicationDeadlineMs = 35_000,
    publicationFinalizeTimeoutMs = 100_000,
    publicationLeaseSeconds = 130,
    scheduleBackground = /** @type {null | ((task: Promise<unknown>) => void)} */ (null),
    leaseTokenFactory = () => globalThis.crypto.randomUUID()
  }) {
    this.supabaseUrl = normalizeUrl(supabaseUrl);
    this.serviceRoleKey = String(serviceRoleKey || "").trim();
    this.publishableKey = String(publishableKey || "").trim();
    this.integrationKeySecret = String(integrationKeySecret || "");
    this.fetchImpl = fetchImpl;
    this.attempts = attempts;
    this.requestTimeoutMs = requestTimeoutMs;
    this.publicationDeadlineMs = publicationDeadlineMs;
    this.publicationFinalizeTimeoutMs = publicationFinalizeTimeoutMs;
    this.publicationLeaseSeconds = publicationLeaseSeconds;
    this.scheduleBackground = scheduleBackground;
    this.leaseTokenFactory = leaseTokenFactory;
    this.publicationCache = new Map();
    this.nextMaintenanceAttemptAt = 0;
    if (!this.serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente no servidor.");
    if (!this.publishableKey) throw new Error("A chave pública do Supabase está ausente no servidor.");
  }

  async #request(url, init, {
    retry = true,
    deadlineAt = null,
    timeoutMs = this.requestTimeoutMs
  } = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      const remaining = deadlineAt == null ? timeoutMs : deadlineAt - Date.now();
      if (remaining <= 0) {
        throw new AuthoringApiError(503, "service_timeout", "O prazo da operação no Supabase terminou.");
      }
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(1, Math.min(timeoutMs, remaining))
      );
      try {
        const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        const source = await response.text();
        let body = null;
        try {
          body = source ? JSON.parse(source) : null;
        } catch {
          body = source;
        }
        if (response.ok) return body;
        const error = apiError(response.status, body);
        if (!retry || !retryableStatus(response.status) || attempt === this.attempts) throw error;
        lastError = error;
      } catch (error) {
        const normalized = controller.signal.aborted
          ? new AuthoringApiError(
            503,
            "service_timeout",
            "O Supabase não respondeu dentro do tempo esperado."
          )
          : error instanceof AuthoringApiError
            ? error
            : new AuthoringApiError(
              503,
              "service_unavailable",
              "Não foi possível alcançar o Supabase."
            );
        lastError = normalized;
        if (!retry
            || (normalized instanceof AuthoringApiError
              && !new Set(["service_timeout", "service_unavailable"]).has(normalized.code))
            || attempt === this.attempts) {
          throw normalized;
        }
      } finally {
        clearTimeout(timeout);
      }
      const delay = attempt * 200;
      if (deadlineAt != null && Date.now() + delay >= deadlineAt) {
        throw lastError || new AuthoringApiError(
          503,
          "service_timeout",
          "O prazo da operação no Supabase terminou."
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw lastError || new AuthoringApiError(503, "service_unavailable", "Serviço indisponível.");
  }

  async rpc(functionName, payload, { deadlineAt = null, timeoutMs = this.requestTimeoutMs } = {}) {
    return this.#request(`${this.supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }, { deadlineAt, timeoutMs });
  }

  async #userForJwt(jwt, { deadlineAt = null } = {}) {
    const body = await this.#request(`${this.supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${jwt}`
      }
    }, { retry: false, deadlineAt });
    if (!body?.id) {
      throw new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
    }
    return body;
  }

  async resolvePrincipal(authentication, { deadlineAt = null } = {}) {
    let payload;
    if (authentication.kind === "api_key") {
      payload = {
        p_api_key_hash: await sha256Hex(authentication.credential),
        p_user_id: null
      };
    } else {
      const user = await this.#userForJwt(authentication.credential, { deadlineAt });
      payload = { p_api_key_hash: null, p_user_id: user.id };
    }
    const principal = first(await this.rpc("resolve_authoring_api_client", payload, { deadlineAt }));
    if (principal?.status === "rate_limited") {
      throw new AuthoringApiError(
        429,
        "rate_limited",
        "Limite temporário da API de autoria excedido."
      );
    }
    if (!principal || principal.active === false) {
      throw new AuthoringApiError(401, "invalid_client", "Cliente de autoria inválido ou revogado.");
    }
    const scopes = Array.isArray(principal.scopes) ? principal.scopes : [];
    const resolved = {
      actorId: principal.actorId || principal.actor_id || principal.actorUserId || principal.actor_user_id || payload.p_user_id,
      clientId: principal.clientId || principal.client_id || null,
      authenticationKind: authentication.kind,
      scopes: authentication.kind === "jwt"
        ? [...new Set([
          ...scopes,
          "authoring:private:read",
          "authoring:private:write",
          "authoring:private:audit"
        ])]
        : scopes,
      rateLimit: principal.rateLimit || principal.rate_limit || null
    };
    if (Date.now() >= this.nextMaintenanceAttemptAt) {
      this.nextMaintenanceAttemptAt = Date.now() + 60 * 60 * 1000;
      const maintenance = this.rpc(
        "maybe_cleanup_authoring_history",
        {},
        { timeoutMs: 12_000, deadlineAt: Date.now() + 13_000 }
      ).then((rawResult) => {
        const result = first(rawResult) || {};
        const retryAfterMs = result.status === "partial"
          ? 10_000
          : result.status === "completed"
            ? 24 * 60 * 60 * 1000
            : 60 * 60 * 1000;
        this.nextMaintenanceAttemptAt = Date.now() + retryAfterMs;
        return result;
      }).catch(() => {
        this.nextMaintenanceAttemptAt = Date.now() + 60 * 60 * 1000;
        return null;
      });
      if (typeof this.scheduleBackground === "function") {
        try {
          this.scheduleBackground(maintenance);
        } catch {
          // Manutenção oportunista não pode impedir a requisição de autoria.
        }
      }
    }
    return resolved;
  }

  async replayCommand({ principal, requestId, apiRequestHash, requiredScope, deadlineAt = null }) {
    return first(await this.rpc("replay_authoring_command_dispatch", {
      p_actor_id: principal.actorId,
      p_client_id: principal.clientId,
      p_request_id: requestId,
      p_api_request_hash: apiRequestHash,
      p_required_scope: requiredScope
    }, { deadlineAt }));
  }

  async getRun({ principal, runId, deadlineAt = null }) {
    const run = first(await this.rpc("get_authoring_run", {
      p_run_id: runId,
      p_actor_id: principal.actorId
    }, { deadlineAt }));
    if (!run) throw new AuthoringApiError(404, "run_not_found", "Execução de autoria não encontrada.");
    this.#assertRunScope(principal, run, "read");
    return run;
  }

  async listRuns({
    principal,
    limit = 25,
    beforeUpdatedAt = null,
    beforeRunId = null,
    deadlineAt = null
  }) {
    const result = first(await this.rpc("list_authoring_runs", {
      p_actor_id: principal.actorId,
      p_limit: limit,
      p_before_updated_at: beforeUpdatedAt,
      p_before_run_id: beforeRunId
    }, { deadlineAt })) || { items: [], nextCursor: null };
    const items = Array.isArray(result.items) ? result.items : [];
    return {
      ...result,
      items: items.filter((run) => this.#runScopeAllowed(principal, run, "read"))
    };
  }

  async getRunSummary({ principal, runId, deadlineAt = null }) {
    const run = first(await this.rpc("get_authoring_run_summary", {
      p_run_id: runId,
      p_actor_id: principal.actorId
    }, { deadlineAt }));
    if (!run) throw new AuthoringApiError(404, "run_not_found", "Execução de autoria não encontrada.");
    this.#assertRunScope(principal, run, "read");
    return run;
  }

  async getNextPart({ principal, runId, deadlineAt = null }) {
    const run = first(await this.rpc("get_next_authoring_part", {
      p_run_id: runId,
      p_actor_id: principal.actorId
    }, { deadlineAt }));
    if (!run) throw new AuthoringApiError(404, "run_not_found", "Execução de autoria não encontrada.");
    this.#assertRunScope(principal, run, "read");
    return run;
  }

  async getPartSubmission({ principal, runId, partKey, deadlineAt = null }) {
    await this.getRunSummary({ principal, runId, deadlineAt });
    const submission = first(await this.rpc("get_authoring_part_submission", {
      p_run_id: runId,
      p_part_key: partKey,
      p_actor_id: principal.actorId
    }, { deadlineAt }));
    if (!submission) {
      throw new AuthoringApiError(404, "part_not_found", "Parte de autoria não encontrada.");
    }
    return submission;
  }

  async command({
    principal,
    requestId,
    runId = null,
    command,
    partKey = null,
    payload = {},
    deadlineAt = null
  }) {
    return first(await this.rpc("dispatch_authoring_command", {
      p_actor_id: principal.actorId,
      p_client_id: principal.clientId,
      p_request_id: requestId,
      p_run_id: runId,
      p_command: command,
      p_part_key: partKey,
      p_payload: payload
    }, { deadlineAt }));
  }

  async createPrivateIntegration({
    principal,
    requestId,
    name,
    expiresInDays,
    deadlineAt = null
  }) {
    const apiKey = await derivePrivateIntegrationApiKey(
      this.integrationKeySecret,
      principal.actorId,
      requestId
    );
    const result = first(await this.rpc("create_private_authoring_integration", {
      p_actor_user_id: principal.actorId,
      p_request_id: requestId,
      p_name: name,
      p_key_prefix: apiKey.slice(0, 16),
      p_api_key_hash: await sha256Hex(apiKey),
      p_expires_in_days: expiresInDays
    }, { deadlineAt }));
    if (result?.status === "limit_reached") {
      throw new AuthoringApiError(
        409,
        "integration_limit_reached",
        "Revogue uma integração pessoal antes de criar outra."
      );
    }
    const idempotent = result?.idempotent === true;
    return {
      ...result,
      secretAvailable: !idempotent,
      ...(idempotent ? {} : { apiKey })
    };
  }

  async listPrivateIntegrations({ principal, deadlineAt = null }) {
    return first(await this.rpc("list_private_authoring_integrations", {
      p_actor_user_id: principal.actorId
    }, { deadlineAt })) || { items: [], activeLimit: 5 };
  }

  async rotatePrivateIntegration({
    principal,
    clientId,
    requestId,
    expiresInDays,
    deadlineAt = null
  }) {
    const apiKey = await derivePrivateIntegrationApiKey(
      this.integrationKeySecret,
      principal.actorId,
      requestId
    );
    const result = first(await this.rpc("rotate_private_authoring_integration", {
      p_actor_user_id: principal.actorId,
      p_client_id: clientId,
      p_request_id: requestId,
      p_new_key_prefix: apiKey.slice(0, 16),
      p_new_api_key_hash: await sha256Hex(apiKey),
      p_expires_in_days: expiresInDays
    }, { deadlineAt }));
    const idempotent = result?.idempotent === true;
    return {
      ...result,
      secretAvailable: !idempotent,
      ...(idempotent ? {} : { apiKey })
    };
  }

  async revokePrivateIntegration({ principal, clientId, deadlineAt = null }) {
    return first(await this.rpc("revoke_private_authoring_integration", {
      p_actor_user_id: principal.actorId,
      p_client_id: clientId
    }, { deadlineAt }));
  }

  #runScopeAllowed(principal, run, action) {
    const target = run?.publicationTarget || run?.target || "catalog";
    const scopes = new Set(Array.isArray(principal?.scopes) ? principal.scopes : []);
    if (scopes.has("*")) return true;
    return target === "private"
      ? scopes.has(`authoring:private:${action}`)
      : scopes.has(`authoring:${action}`);
  }

  #assertRunScope(principal, run, action) {
    if (this.#runScopeAllowed(principal, run, action)) return;
    throw new AuthoringApiError(403, "insufficient_scope", "A credencial não permite acessar este destino.");
  }

  #publicationFailureIsTransient(error) {
    return error?.status === 408
      || error?.status === 429
      || error?.status >= 500
      || new Set([
      "service_timeout", "service_unavailable", "rate_limited",
      "publication_lease_unavailable"
      ]).has(error?.code);
  }

  #throwStoredPublicationError(publicationError, {
    allowAuthorizationRecovery = false,
    allowAutomaticCollectionRecovery = false
  } = {}) {
    if (!publicationError || publicationError.kind !== "deterministic") return;
    if (allowAuthorizationRecovery
        && new Set(["not_authorized", "invalid_client"]).has(publicationError.code)) {
      return;
    }
    if (allowAutomaticCollectionRecovery
        && publicationError.code === "collection_unavailable") {
      return;
    }
    const status = Number(publicationError.httpStatus);
    throw new AuthoringApiError(
      status >= 400 && status <= 599 ? status : 422,
      String(publicationError.code || "publication_failed"),
      String(publicationError.message || "A publicação exige correção antes de continuar.")
    );
  }

  #publishingResponse(runId, current, overrides = {}) {
    return {
      status: "publishing",
      phase: overrides.phase || current?.publicationPhase || "staging",
      runId,
      documentHash: current?.documentHash || null,
      percent: overrides.percent ?? (overrides.phase === "finalizing" ? 99 : null),
      pollAfterSeconds: overrides.pollAfterSeconds ?? 3,
      ...(Number.isInteger(overrides.nextStep) ? { nextStep: overrides.nextStep } : {}),
      ...(Number.isInteger(overrides.totalSteps) ? { totalSteps: overrides.totalSteps } : {}),
      ...(typeof overrides.leaseAcquired === "boolean"
        ? { leaseAcquired: overrides.leaseAcquired }
        : {}),
      ...(current?.publicationError ? { publicationError: current.publicationError } : {})
    };
  }

  async #finalizePublicationInBackground({
    runId,
    leaseToken,
    operation,
    cacheKey,
    failureFunctionName = "record_authoring_publication_failure"
  }) {
    try {
      const result = await this.rpc(operation.functionName, {
        ...operation.payload,
        p_lease_token: leaseToken
      }, {
        deadlineAt: Date.now() + this.publicationFinalizeTimeoutMs + 5_000,
        timeoutMs: this.publicationFinalizeTimeoutMs
      });
      if (result?.status !== "published") {
        throw new AuthoringApiError(
          502,
          "publication_not_confirmed",
          "O banco não confirmou a publicação do curso."
        );
      }
      this.publicationCache.delete(cacheKey);
      return result;
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      const kind = this.#publicationFailureIsTransient(normalized)
        ? "transient"
        : "deterministic";
      await this.rpc(failureFunctionName, {
        p_run_id: runId,
        p_lease_token: leaseToken,
        p_kind: kind,
        p_code: normalized.code,
        p_message: normalized.message,
        p_http_status: normalized.status
      }, { timeoutMs: 5_000, deadlineAt: Date.now() + 6_000 }).catch(() => null);
      return null;
    }
  }

  async publishRun({ principal, runId, requestId, deadlineAt = null }) {
    deadlineAt = Math.min(
      deadlineAt ?? Number.POSITIVE_INFINITY,
      Date.now() + this.publicationDeadlineMs
    );
    const current = await this.getRunSummary({ principal, runId, deadlineAt });
    if (current.status === "published") {
      return {
        status: "published",
        runId,
        courseId: current.courseId || null,
        documentHash: current.documentHash || null,
        idempotent: true
      };
    }
    this.#throwStoredPublicationError(current.publicationError, {
      allowAuthorizationRecovery: true,
      allowAutomaticCollectionRecovery: true
    });
    if (current.status === "publishing"
        && current.publicationPhase === "finalizing"
        && current.publicationLeaseUntil
        && Date.parse(current.publicationLeaseUntil) > Date.now()) {
      return this.#publishingResponse(runId, current, {
        phase: "finalizing",
        leaseAcquired: false
      });
    }
    const publisherIdentity = principal.clientId
      || principal.authenticationKind
      || "session";
    const prepareRequestId = await deterministicRequestUuid(
      `${requestId}:prepare:${publisherIdentity}`
    );
    // O comando também funciona como handoff autorizado. Ele precisa ocorrer
    // antes de qualquer novo chunk: uma chave revogada não pode deixar o
    // staging preso ao publicador anterior nem permitir trabalho em seu nome.
    const preparation = await this.command({
      principal,
      runId,
      requestId: prepareRequestId,
      command: "prepare_publish",
      deadlineAt
    });
    const document = preparation?.document || preparation?.assembledDocument;
    if (!document) {
      throw new AuthoringApiError(
        409,
        "course_incomplete",
        "A execução ainda não produziu um curso completo e validado."
      );
    }
    const target = preparation.publicationTarget || preparation.target || "catalog";
    if (!new Set(["catalog", "private"]).has(target)) {
      throw new AuthoringApiError(422, "unsupported_target", "Destino de autoria inválido.");
    }
    // A primeira preparação usa uma chave estável, portanto uma repetição pode
    // devolver o retrato inicial. O cursor persistido da execução é a fonte de
    // verdade e impede que a mesma Idempotency-Key congele a publicação.
    const step = Math.max(
      Number(current.publicationStep || 0),
      Number(preparation.publicationStep || 0)
    );
    const cacheKey = String(preparation.documentHash || current.documentHash || runId);
    let prepared = this.publicationCache.get(cacheKey) || null;
    if (!prepared) {
      prepared = await prepareCourseDocument(document, target === "catalog"
        ? { official: true, requireReady: true }
        : { requireReady: true, identityNamespace: runId });
      this.publicationCache.clear();
      this.publicationCache.set(cacheKey, prepared);
    }
    const progress = target === "catalog"
      ? await publishOfficialDocumentStep(document, {
      rpc: (functionName, payload) => this.rpc(functionName, payload, {
        deadlineAt,
        timeoutMs: functionName === "finalize_authoring_official_course_import"
          ? this.publicationFinalizeTimeoutMs
          : this.requestTimeoutMs
      }),
      step,
      maxOperations: 2,
      prepared,
      deferFinalize: true,
      authoring: {
        runId,
        publicationIntent: preparation.publicationIntent || current.publicationIntent,
        baseCourseId: preparation.baseCourseId || current.baseCourseId || null,
        baseContentHash: preparation.baseContentHash || current.baseContentHash || null
      }
      })
      : await materializePrivateDocumentStep(document, {
        rpc: (functionName, payload) => this.rpc(functionName, payload, {
          deadlineAt,
          timeoutMs: functionName === "finalize_authoring_private_course_import"
            ? this.publicationFinalizeTimeoutMs
            : this.requestTimeoutMs
        }),
        runId,
        actorId: principal.actorId,
        clientId: principal.clientId,
        step,
        maxOperations: 2,
        prepared,
        deferFinalize: true
      });
    if (progress.status !== "published") {
      if (progress.status === "finalizing") {
        if (typeof this.scheduleBackground !== "function") {
          throw new AuthoringApiError(
            503,
            "background_runtime_unavailable",
            "O executor seguro da publicação em segundo plano não está disponível."
          );
        }
        const leaseToken = this.leaseTokenFactory();
        const privateTarget = target === "private";
        const claim = first(await this.rpc(
          privateTarget
            ? "claim_authoring_private_materialization"
            : "claim_authoring_publication",
          {
          p_run_id: runId,
          p_actor_id: principal.actorId,
          p_client_id: principal.clientId,
          p_lease_token: leaseToken,
          p_lease_seconds: this.publicationLeaseSeconds
          }, { deadlineAt, timeoutMs: 5_000 }));
        if (claim?.status === "published") {
          this.publicationCache.delete(cacheKey);
          return claim;
        }
        this.#throwStoredPublicationError(claim?.publicationError);
        if (claim?.leaseAcquired) {
          const task = this.#finalizePublicationInBackground({
            runId,
            leaseToken,
            operation: progress.finalizeOperation,
            cacheKey,
            failureFunctionName: privateTarget
              ? "record_authoring_private_materialization_failure"
              : "record_authoring_publication_failure"
          });
          this.scheduleBackground(task);
        }
        return this.#publishingResponse(runId, current, {
          phase: "finalizing",
          percent: 99,
          nextStep: progress.nextStep,
          totalSteps: progress.totalSteps,
          leaseAcquired: Boolean(claim?.leaseAcquired),
          pollAfterSeconds: Number(claim?.pollAfterSeconds || 3)
        });
      }
      const progressRequestId = await deterministicRequestUuid(
        `${requestId}:progress:${progress.nextStep}`
      );
      const recorded = await this.command({
        principal,
        runId,
        requestId: progressRequestId,
        command: "prepare_publish",
        payload: { nextStep: progress.nextStep },
        deadlineAt
      });
      return {
        status: "publishing",
        phase: "staging",
        runId,
        documentHash: preparation.documentHash || current.documentHash || null,
        percent: progress.percent,
        nextStep: progress.nextStep,
        totalSteps: progress.totalSteps,
        pollAfterSeconds: 1,
        idempotent: Boolean(recorded?.idempotent)
      };
    }
    return progress.publication;
  }

  async importDocument({
    principal,
    requestId,
    target,
    collectionId,
    publicationIntent,
    document,
    prepared = null,
    apiRequestHash = null,
    deadlineAt = null
  }) {
    if (target !== "catalog") {
      throw new AuthoringApiError(422, "unsupported_target", "A API de autoria importa somente para o catálogo.");
    }
    const normalized = prepared
      || await prepareCourseDocument(document, { official: true, requireReady: true });
    const identity = `${principal.actorId}:import:${requestId}`;
    const runId = await deterministicRequestUuid(identity);
    return this.command({
      principal,
      runId,
      requestId,
      command: "import_document",
      payload: {
        publicationTarget: target,
        collectionId,
        publicationIntent,
        document: normalized.document,
        title: normalized.course.title,
        contractKey: normalized.course.id,
        documentHash: normalized.contentHash,
        validation: { valid: true, contract: "aralearn.contract", version: 3 },
        ...(apiRequestHash ? { _apiRequestHash: apiRequestHash } : {})
      },
      deadlineAt
    });
  }
}
