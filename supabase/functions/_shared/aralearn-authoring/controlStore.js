import { AuthoringApiError } from "./errors.js";

function first(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

export class ControlStore {
  constructor({ rpc }) {
    this.rpc = rpc;
  }

  async beginRequest({
    principal,
    requestId,
    runId,
    partKey,
    operation,
    payloadHash,
    leaseOwner,
    leaseSeconds = 60,
    deadlineAt = null
  }) {
    return first(await this.rpc("begin_authoring_request_v3", {
      p_owner_id: principal.actorId,
      p_client_id: principal.clientId,
      p_request_id: requestId,
      p_run_id: runId,
      p_part_key: partKey,
      p_operation: operation,
      p_payload_hash: payloadHash,
      p_lease_owner: leaseOwner,
      p_lease_seconds: leaseSeconds
    }, { deadlineAt }));
  }

  async commitTransition({
    principal,
    requestId,
    operation,
    runId,
    partKey,
    leaseOwner,
    metadata,
    artifacts,
    deadlineAt = null
  }) {
    return first(await this.rpc("commit_authoring_transition_v3", {
      p_owner_id: principal.actorId,
      p_request_id: requestId,
      p_operation: operation,
      p_run_id: runId,
      p_part_key: partKey,
      p_lease_owner: leaseOwner,
      p_metadata: metadata,
      p_artifacts: artifacts
    }, { deadlineAt }));
  }

  async failRequest({
    principal,
    requestId,
    operation,
    leaseOwner,
    error,
    deadlineAt = null
  }) {
    return first(await this.rpc("fail_authoring_request_v3", {
      p_owner_id: principal.actorId,
      p_request_id: requestId,
      p_operation: operation,
      p_lease_owner: leaseOwner,
      p_error_code: String(error?.code || "operation_failed").slice(0, 120),
      p_error_message: String(error?.message || "A operação falhou.").slice(0, 1000)
    }, { deadlineAt }));
  }

  async releaseRequest({
    principal,
    requestId,
    operation,
    leaseOwner,
    error,
    deadlineAt = null
  }) {
    return first(await this.rpc("release_authoring_request_v3", {
      p_owner_id: principal.actorId,
      p_request_id: requestId,
      p_operation: operation,
      p_lease_owner: leaseOwner,
      p_error_code: String(error?.code || "transient_failure").slice(0, 120),
      p_error_message: String(error?.message || "Falha transitória.").slice(0, 1000)
    }, { deadlineAt }));
  }

  async replayRequest({
    principal,
    requestId,
    payloadHash,
    deadlineAt = null
  }) {
    return first(await this.rpc("replay_authoring_request_v3", {
      p_owner_id: principal.actorId,
      p_request_id: requestId,
      p_payload_hash: payloadHash
    }, { deadlineAt }));
  }

  async getRun({ principal, runId, deadlineAt = null }) {
    const run = first(await this.rpc("get_authoring_run_control_v3", {
      p_owner_id: principal.actorId,
      p_run_id: runId
    }, { deadlineAt }));
    if (!run) {
      throw new AuthoringApiError(404, "run_not_found", "Execução de autoria não encontrada.");
    }
    return run;
  }

  async listRuns({
    principal,
    limit,
    beforeUpdatedAt,
    beforeRunId,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_authoring_runs_control_v3", {
      p_owner_id: principal.actorId,
      p_limit: limit,
      p_before_updated_at: beforeUpdatedAt,
      p_before_run_id: beforeRunId
    }, { deadlineAt })) || { items: [], nextCursor: null };
  }
}
