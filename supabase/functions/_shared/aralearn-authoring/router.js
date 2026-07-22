import { assembleAuthoringRun } from "./assembler.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import {
  assertFragmentMatchesSpecification,
  assertPreservedPointers,
  assertSubmissionMatchesContinuity,
  deterministicRequestUuid,
  prepareCourseDocument
} from "./canonical.js";
import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import { buildNextPart } from "./continuity.js";
import {
  ACTION_PLAN_BODY_LIMIT,
  ACTION_RESPONSE_BODY_LIMIT,
  MANUAL_IMPORT_BODY_LIMIT,
  LEDGER_CHUNK_BODY_LIMIT,
  PLAN_BODY_LIMIT,
  STANDARD_BODY_LIMIT,
  normalizeAuthoringPath,
  readJsonBody,
  routeRequest,
  validateAuditPayload,
  validateBlockPayload,
  validateCreateRunPayload,
  validateImportPayload,
  validatePartPayload,
  validatePartSpecificationEnvelope,
  validatePartSpecificationPayload,
  validateLedgerChunkPayload,
  validateFinalizePlanPayload,
  validateCancelRunPayload,
  validatePlanPayload,
  validateReopenPartPayload,
  validateResumePayload,
  validateRunId,
  validateSimpleCommandPayload
} from "./protocol.js";
import {
  assertScope,
  corsHeaders,
  issueSubmissionReadReceipt,
  preflightHeaders,
  readAuthorization,
  sha256Hex,
  verifySubmissionReadReceipt
} from "./security.js";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
});

function responseBody(ok, requestId, value) {
  return ok
    ? { ok: true, requestId, data: value ?? null }
    : { ok: false, requestId, error: value };
}

function compactErrorDetails(value) {
  if (!value || typeof value !== "object") return value;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16 * 1024) return value;
  const errors = Array.isArray(value.errors) ? value.errors : [];
  if (!errors.length) return { truncated: true };
  return {
    errors: errors.slice(0, 20).map((error) => ({
      code: String(error?.code || "invalid").slice(0, 120),
      path: String(error?.path || "$").slice(0, 500),
      message: String(error?.message || "Dado inválido.").slice(0, 1000)
    })),
    omittedErrors: Math.max(0, errors.length - 20),
    truncated: true
  };
}

function jsonResponse(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function encodedJsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function compactActionRunSummary(run) {
  if (!run || typeof run !== "object" || Array.isArray(run)) return run;
  const compact = { ...run };
  delete compact.brief;
  if (Array.isArray(compact.parts)) {
    compact.parts = compact.parts.map((part) => {
      if (!part || typeof part !== "object" || !part.latestAudit) return part;
      const audit = part.latestAudit;
      const findings = audit?.findings?.findings;
      return {
        ...part,
        latestAudit: {
          attempt: audit.attempt,
          decision: audit.decision,
          findingCount: Array.isArray(findings) ? findings.length : 0,
          createdAt: audit.createdAt
        }
      };
    });
  }
  if (compact.validation && typeof compact.validation === "object") {
    const errors = Array.isArray(compact.validation.errors) ? compact.validation.errors : [];
    compact.validation = {
      valid: compact.validation.valid === true,
      errorCount: errors.length,
      documentHash: compact.validation.documentHash || compact.documentHash || null,
      compacted: true
    };
  }
  compact.compact = true;
  return compact;
}

function assertActionResponseBudget(data, code, message) {
  if (encodedJsonBytes(data) > ACTION_RESPONSE_BODY_LIMIT) {
    throw new AuthoringApiError(422, code, message);
  }
  return data;
}

function requestIdFromHeaders(request) {
  return String(request.headers.get("idempotency-key") || "").trim();
}

function reconcileRequestId(request, payload) {
  const header = requestIdFromHeaders(request);
  if (header && payload.requestId && header !== payload.requestId) {
    throw new AuthoringApiError(
      422,
      "request_id_mismatch",
      "Idempotency-Key e requestId devem ter o mesmo valor."
    );
  }
  return payload.requestId || header;
}

async function apiRequestHash(request, rawPayload) {
  const url = new URL(request.url);
  const path = normalizeAuthoringPath(url.pathname);
  return sha256Hex(`${request.method.toUpperCase()}\n${path}\n${canonicalJsonStringify(rawPayload)}`);
}

async function replayCommand(adapter, request, {
  principal, requestId, rawPayload, requiredScope = "authoring:write"
}) {
  if (typeof adapter.replayCommand !== "function") return null;
  return adapter.replayCommand({
    principal,
    requestId,
    apiRequestHash: await apiRequestHash(request, rawPayload),
    requiredScope
  });
}

async function commandPayload(request, rawPayload, payload) {
  return { ...payload, _apiRequestHash: await apiRequestHash(request, rawPayload) };
}

function withRoutePartIdentity(rawPayload, route) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return rawPayload;
  }
  return {
    ...rawPayload,
    runId: rawPayload.runId ?? route.runId,
    partKey: rawPayload.partKey ?? route.partKey
  };
}

async function readRunSummary(adapter, args) {
  return typeof adapter.getRunSummary === "function"
    ? adapter.getRunSummary(args)
    : adapter.getRun(args);
}

async function readNextPartState(adapter, args) {
  return typeof adapter.getNextPart === "function"
    ? adapter.getNextPart(args)
    : adapter.getRun(args);
}

async function executeRoute({
  request,
  route,
  adapter,
  principal,
  deadlineAt = null,
  receiptSecret,
  receiptClock
}) {
  if (deadlineAt != null) {
    const baseAdapter = adapter;
    adapter = new Proxy(baseAdapter, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        return (options = {}) => value.call(target, { ...options, deadlineAt });
      }
    });
  }
  if (route.name === "listRuns") {
    assertScope(principal, "authoring:read");
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit == null || rawLimit === "" ? 25 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AuthoringApiError(422, "invalid_pagination", "limit deve ser um inteiro entre 1 e 100.");
    }
    const beforeUpdatedAt = url.searchParams.get("beforeUpdatedAt");
    const beforeRunId = url.searchParams.get("beforeRunId");
    if ((beforeUpdatedAt == null) !== (beforeRunId == null)) {
      throw new AuthoringApiError(
        422,
        "invalid_pagination",
        "beforeUpdatedAt e beforeRunId devem ser informados juntos."
      );
    }
    let cursor = null;
    if (beforeUpdatedAt != null) {
      const parsed = new Date(beforeUpdatedAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new AuthoringApiError(422, "invalid_pagination", "beforeUpdatedAt deve usar ISO UTC.");
      }
      cursor = {
        beforeUpdatedAt: parsed.toISOString(),
        beforeRunId: validateRunId(beforeRunId)
      };
    }
    let data = await adapter.listRuns({ principal, limit, ...cursor });
    if (principal.authenticationKind === "api_key") {
      data = assertActionResponseBudget(
        data,
        "run_list_too_large",
        "A lista excede 90 KiB. Use um limite menor e continue pela paginação."
      );
    }
    return {
      data,
      requestId: null
    };
  }

  if (route.name === "getRun" || route.name === "nextPart" || route.name === "getPartSubmission") {
    assertScope(principal, "authoring:read");
    if (route.name === "getPartSubmission") {
      const submission = await adapter.getPartSubmission({
        principal,
        runId: route.runId,
        partKey: route.partKey
      });
      const submissionReadReceipt = await issueSubmissionReadReceipt({
        secret: receiptSecret,
        principal,
        runId: route.runId,
        partKey: route.partKey,
        attempt: submission?.attempt,
        submissionSha256: submission?.fragmentHash,
        nowMs: receiptClock()
      });
      const provenSubmission = { ...submission, submissionReadReceipt };
      return {
        data: principal.authenticationKind === "api_key"
          ? assertActionResponseBudget(
            provenSubmission,
            "submission_context_too_large",
            "A entrega excede 90 KiB. Reduza a parte antes de solicitar auditoria."
          )
          : provenSubmission,
        requestId: null
      };
    }
    const args = { principal, runId: route.runId };
    const run = route.name === "nextPart"
      ? await readNextPartState(adapter, args)
      : await readRunSummary(adapter, args);
    let data = route.name === "nextPart" ? await buildNextPart(run) : run;
    if (principal.authenticationKind === "api_key") {
      if (route.name === "getRun") data = compactActionRunSummary(data);
      data = assertActionResponseBudget(
        data,
        route.name === "nextPart" ? "part_context_too_large" : "run_summary_too_large",
        route.name === "nextPart"
          ? "O contexto da parte excede 90 KiB. Divida a parte e crie um novo plano."
          : "O resumo da execução excede 90 KiB. Reduza a quantidade de partes do plano."
      );
    }
    return {
      data,
      requestId: null
    };
  }

  // Autoriza a operação antes de interpretar um documento grande. Assim,
  // clientes sem permissão recebem sempre a mesma resposta e não usam a
  // validação do contrato como serviço lateral.
  if (route.name === "importDocument") {
    if (principal.clientId || principal.authenticationKind === "api_key") {
      throw new AuthoringApiError(
        403,
        "manual_import_requires_session",
        "A importação manual exige uma sessão de usuário autorizada."
      );
    }
    assertScope(principal, "course:import");
    assertScope(principal, "catalog:publish");
  }
  if (route.name === "setPlan" || route.name === "putLedgerChunk") {
    assertScope(principal, "authoring:write");
  }

  const limit = route.name === "importDocument"
    ? MANUAL_IMPORT_BODY_LIMIT
    : route.name === "putLedgerChunk"
      ? LEDGER_CHUNK_BODY_LIMIT
    : route.name === "setPlan"
      ? (principal.authenticationKind === "api_key" ? ACTION_PLAN_BODY_LIMIT : PLAN_BODY_LIMIT)
      : STANDARD_BODY_LIMIT;
  const rawPayload = await readJsonBody(request, limit);
  let payload;
  switch (route.name) {
    case "createRun":
      assertScope(principal, "authoring:write");
      payload = validateCreateRunPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const runId = await deterministicRequestUuid(
          `${principal.actorId}:run:${payload.requestId}`
        );
        return {
          data: await adapter.command({
            principal,
            runId,
            requestId: payload.requestId,
            command: "create_run",
            payload: await commandPayload(request, rawPayload, {
              publicationTarget: payload.target,
              collectionId: payload.collectionId,
              contractKey: payload.contractKey,
              title: payload.title,
              brief: payload.brief,
              publicationIntent: payload.publicationIntent
            })
          }),
          requestId: payload.requestId
        };
      }
    case "setPlan":
      assertScope(principal, "authoring:write");
      payload = validatePlanPayload(rawPayload, route.runId);
      reconcileRequestId(request, payload);
      return { data: await adapter.command({
        principal,
        runId: route.runId,
        requestId: payload.requestId,
        command: "set_plan",
        payload: await commandPayload(request, rawPayload, { plan: payload.plan })
      }), requestId: payload.requestId };
    case "putLedgerChunk":
      assertScope(principal, "authoring:write");
      payload = validateLedgerChunkPayload(rawPayload, route);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
        return {
          data: await adapter.command({
            principal,
            runId: route.runId,
            requestId: payload.requestId,
            command: "put_ledger_chunk",
            payload: await commandPayload(request, rawPayload, {
              planHash: payload.planHash,
              section: route.section,
              position: route.position,
              items: payload.items
            })
          }),
          requestId: payload.requestId
        };
      }
    case "finalizePlan":
      assertScope(principal, "authoring:write");
      payload = validateFinalizePlanPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
        return {
          data: await adapter.command({
            principal,
            runId: route.runId,
            requestId: payload.requestId,
            command: "finalize_plan",
            payload: await commandPayload(request, rawPayload, { planHash: payload.planHash })
          }),
          requestId: payload.requestId
        };
      }
    case "setPartSpecification":
      assertScope(principal, "authoring:write");
      {
        const envelope = validatePartSpecificationEnvelope(rawPayload);
        reconcileRequestId(request, envelope);
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: envelope.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: envelope.requestId };
        const run = await readNextPartState(adapter, {
          principal,
          runId: route.runId
        });
        payload = validatePartSpecificationPayload(rawPayload, route, run);
        reconcileRequestId(request, payload);
        return {
          data: await adapter.command({
            principal,
            runId: route.runId,
            partKey: route.partKey,
            requestId: payload.requestId,
            command: "set_part_specification",
            payload: await commandPayload(request, rawPayload, {
              planHash: payload.planHash,
              specification: payload.specification
            })
          }),
          requestId: payload.requestId
        };
      }
    case "submitPart":
      assertScope(principal, "authoring:write");
      payload = validatePartPayload(withRoutePartIdentity(rawPayload, route), route);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
        const command = {
          principal,
          runId: route.runId,
          partKey: route.partKey,
          requestId: payload.requestId,
          command: "submit_part",
          payload: await commandPayload(request, rawPayload, {
            mode: payload.mode,
            expectedAttempt: payload.attempt,
            baseLedgerSha256: payload.baseLedgerSha256,
            fragment: payload.fragment,
            evidence: payload.evidence,
            stateDelta: payload.stateDelta
          })
        };
        const run = await readNextPartState(adapter, {
          principal,
          runId: route.runId
        });
        const current = Array.isArray(run?.parts)
          ? run.parts.find((part) => part?.partKey === route.partKey)
          : null;
        if (current?.status === "awaiting_audit" && current.attempt === payload.attempt) {
          try {
            return { data: await adapter.command(command), requestId: payload.requestId };
          } catch (error) {
            if (error instanceof AuthoringApiError && error.code === "invalid_state") {
              throw new AuthoringApiError(409, "stale_part_spec", "A parte já recebeu outra submissão.");
            }
            throw error;
          }
        }
        const expected = await buildNextPart(run);
        if (!expected || expected.partKey !== route.partKey
            || expected.attempt !== payload.attempt
            || expected.baseLedgerSha256 !== payload.baseLedgerSha256) {
          throw new AuthoringApiError(
            409,
            "stale_part_spec",
            "A especificação da parte foi substituída. Consulte a próxima parte novamente."
          );
        }
        assertFragmentMatchesSpecification(payload.fragment, expected);
        assertSubmissionMatchesContinuity(payload, expected);
        if (payload.mode === "repair") {
          const previous = await adapter.getPartSubmission({
            principal,
            runId: route.runId,
            partKey: route.partKey
          });
          const preservePointers = [
            ...(Array.isArray(expected.preserve) ? expected.preserve : []),
            ...(Array.isArray(expected?.previousAudit?.findings)
              ? expected.previousAudit.findings.flatMap((finding) =>
                Array.isArray(finding?.preserveFields) ? finding.preserveFields : [])
              : [])
          ];
          assertPreservedPointers(previous.fragment, payload.fragment, preservePointers);
        }
        return { data: await adapter.command(command), requestId: payload.requestId };
      }
    case "auditPart":
      assertScope(principal, "authoring:audit");
      payload = validateAuditPayload(withRoutePartIdentity(rawPayload, route), route);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: payload.requestId, rawPayload,
          requiredScope: "authoring:audit"
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
        await verifySubmissionReadReceipt(payload.submissionReadReceipt, {
          secret: receiptSecret,
          principal,
          runId: route.runId,
          partKey: route.partKey,
          attempt: payload.attempt,
          submissionSha256: payload.submissionSha256,
          nowMs: receiptClock()
        });
        const command = {
          principal,
          runId: route.runId,
          partKey: route.partKey,
          requestId: payload.requestId,
          command: "audit_part",
          payload: await commandPayload(request, rawPayload, {
            expectedAttempt: payload.attempt,
            submissionSha256: payload.submissionSha256,
            decision: payload.decision,
            gates: payload.gates,
            findings: payload.findings,
            instructions: payload.instructions
          })
        };
        const run = await readNextPartState(adapter, {
          principal,
          runId: route.runId
        });
        const submitted = Array.isArray(run?.parts)
          ? run.parts.find((part) => part?.partKey === route.partKey)
          : null;
        if (submitted && submitted.status !== "awaiting_audit"
            && submitted.attempt === payload.attempt) {
          try {
            return { data: await adapter.command(command), requestId: payload.requestId };
          } catch (error) {
            if (error instanceof AuthoringApiError && error.code === "invalid_state") {
              throw new AuthoringApiError(409, "stale_submission", "A submissão já recebeu outra auditoria.");
            }
            throw error;
          }
        }
        if (!submitted || submitted.status !== "awaiting_audit"
            || submitted.attempt !== payload.attempt
            || submitted.fragmentHash !== payload.submissionSha256) {
          throw new AuthoringApiError(
            409,
            "stale_submission",
            "A submissão foi substituída. Consulte a execução antes de auditar novamente."
          );
        }
        return { data: await adapter.command(command), requestId: payload.requestId };
      }
    case "reopenPart":
      assertScope(principal, "authoring:audit");
      payload = validateReopenPartPayload(withRoutePartIdentity(rawPayload, route), route);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: payload.requestId, rawPayload,
          requiredScope: "authoring:audit"
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
        return {
          data: await adapter.command({
            principal,
            runId: route.runId,
            partKey: route.partKey,
            requestId: payload.requestId,
            command: "reopen_part",
            payload: await commandPayload(request, rawPayload, {
              expectedAttempt: payload.attempt,
              submissionSha256: payload.submissionSha256,
              decision: payload.decision,
              findings: payload.findings,
              instructions: payload.instructions
            })
          }),
          requestId: payload.requestId
        };
      }
    case "validateRun":
      assertScope(principal, "authoring:audit");
      payload = validateSimpleCommandPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: payload.requestId, rawPayload,
          requiredScope: "authoring:audit"
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
        const run = await adapter.getRun({ principal, runId: route.runId });
        let prepared;
        try {
          const document = assembleAuthoringRun(run);
          prepared = await prepareCourseDocument(document, { requireReady: true });
        } catch (error) {
          const normalized = asAuthoringApiError(error);
          throw new AuthoringApiError(
            normalized.status,
            normalized.code,
            normalized.message,
            {
              ...(normalized.details && typeof normalized.details === "object"
                ? compactErrorDetails(normalized.details)
                : {}),
              recovery: {
                method: "POST",
                pathTemplate: `/v1/runs/${route.runId}/parts/{partKey}/reopen`,
                decisions: ["repair", "rebuild"]
              }
            }
          );
        }
        return {
          data: await adapter.command({
            principal,
            runId: route.runId,
            requestId: payload.requestId,
            command: "validate",
            payload: await commandPayload(request, rawPayload, {
              expectedRevision: run.revision,
              valid: true,
              documentHash: prepared.contentHash,
              document: prepared.document,
              validation: {
                valid: true,
                contract: "aralearn.contract",
                version: 3
              }
            })
          }),
          requestId: payload.requestId
        };
      }
    case "publishRun":
      assertScope(principal, "catalog:publish");
      payload = validateSimpleCommandPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const data = await adapter.publishRun({
          principal,
          runId: route.runId,
          requestId: payload.requestId,
          deadlineAt
        });
        return {
          data,
          requestId: payload.requestId,
          httpStatus: data?.status === "publishing" ? 202 : 200
        };
      }
    case "cancelRun":
      assertScope(principal, "authoring:write");
      payload = validateCancelRunPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
        return {
          data: await adapter.command({
            principal,
            runId: route.runId,
            requestId: payload.requestId,
            command: "cancel_run",
            payload: await commandPayload(request, rawPayload, { reason: payload.reason })
          }),
          requestId: payload.requestId
        };
      }
    case "blockRun":
      assertScope(principal, "authoring:write");
      payload = validateBlockPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
      return { data: await adapter.command({
        principal,
        runId: route.runId,
        partKey: payload.partKey,
        requestId: payload.requestId,
        command: "block",
        payload: await commandPayload(request, rawPayload, {
          reason: payload.reason, questions: payload.questions
        })
      }), requestId: payload.requestId };
      }
    case "resumeRun":
      assertScope(principal, "authoring:write");
      payload = validateResumePayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommand(adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
      return { data: await adapter.command({
        principal,
        runId: route.runId,
        requestId: payload.requestId,
        command: "resume",
        payload: await commandPayload(request, rawPayload, { resolution: payload.resolution })
      }), requestId: payload.requestId };
      }
    case "importDocument":
      payload = validateImportPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const prepared = await prepareCourseDocument(
          payload.document, { official: true, requireReady: true }
        );
      return {
        data: await adapter.importDocument({
          principal,
          ...payload,
          prepared,
          apiRequestHash: await apiRequestHash(request, rawPayload)
        }),
        requestId: payload.requestId
      };
      }
    default:
      throw new AuthoringApiError(404, "not_found", "Endpoint inexistente.");
  }
}

export function createAuthoringHandler({
  adapter,
  allowedOrigins = new Set(),
  receiptSecret = adapter?.receiptSecret || adapter?.serviceRoleKey,
  receiptClock = () => Date.now()
}) {
  if (!adapter) throw new TypeError("O handler de autoria exige um adaptador.");
  if (typeof receiptClock !== "function") throw new TypeError("receiptClock deve ser uma função.");
  return async function handleAuthoringRequest(request) {
    let headers = { Vary: "Origin" };
    const traceId = globalThis.crypto?.randomUUID?.() || `trace-${Date.now()}`;
    const deadlineAt = Date.now() + 40_000;
    try {
      if (request.method === "OPTIONS") {
        headers = preflightHeaders(request, allowedOrigins);
        return new Response(null, { status: 204, headers });
      }
      headers = corsHeaders(request, allowedOrigins);
      const url = new URL(request.url);
      const route = routeRequest(request.method, url.pathname);
      const authentication = readAuthorization(request);
      const principal = await adapter.resolvePrincipal(authentication, { deadlineAt });
      const result = await executeRoute({
        request,
        route,
        adapter,
        principal,
        deadlineAt,
        receiptSecret,
        receiptClock
      });
      const requestId = requestIdFromHeaders(request) || result.requestId || traceId;
      return jsonResponse(
        result.httpStatus || 200,
        responseBody(true, requestId, result.data),
        headers
      );
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      if (normalized.status === 429) {
        headers = { ...headers, "Retry-After": "60" };
      }
      const compactDetails = compactErrorDetails(normalized.details);
      const details = compactDetails === undefined ? {} : { details: compactDetails };
      return jsonResponse(
        normalized.status,
        responseBody(false, requestIdFromHeaders(request) || traceId, {
          code: normalized.code,
          message: normalized.message,
          ...details
        }),
        headers
      );
    }
  };
}
