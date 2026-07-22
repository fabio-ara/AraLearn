import assert from "node:assert/strict";

const MUTABLE_ACTIONS = new Set([
  "save_plan",
  "upload_ledger",
  "finalize_plan",
  "specify_part",
  "build_part",
  "audit_part",
  "resume",
  "validate",
  "publish"
]);

const ROLE_BY_ACTION = Object.freeze({
  save_plan: "planner",
  upload_ledger: "planner",
  finalize_plan: "planner",
  next_part: "planner",
  specify_part: "planner",
  build_part: "builder",
  read_submission: "auditor",
  audit_part: "auditor",
  resume: "planner",
  validate: "auditor",
  publish: "publisher"
});

function clone(value) {
  return structuredClone(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

class SimulatedFailure extends Error {
  constructor(kind, code, options = {}) {
    super(code);
    this.name = "SimulatedFailure";
    this.kind = kind;
    this.code = code;
    this.correctable = options.correctable === true;
  }
}

class SimulatedAuthoringServer {
  constructor(options = {}) {
    this.run = {
      runId: options.runId || "11111111-1111-4111-8111-111111111111",
      status: "planning",
      nextAction: "save_plan",
      revision: 0,
      partIndex: 0,
      partCount: options.partCount || 1,
      attempt: 0,
      mode: "build"
    };
    this.options = {
      auditOutcomes: [...(options.auditOutcomes || ["approve"])],
      blockAfterAction: options.blockAfterAction || null,
      invalidPartOnce: options.invalidPartOnce === true,
      loseResponseOnceOn: options.loseResponseOnceOn || null,
      publishPolls: options.publishPolls || 1,
      failKindOn: options.failKindOn || null
    };
    this.auditIndex = 0;
    this.blocked = false;
    this.invalidPartRejected = false;
    this.responseLost = false;
    this.publishProgress = 0;
    this.events = [];
    this.calls = [];
    this.applyCounts = new Map();
    this.idempotency = new Map();
  }

  async read(runId) {
    assert.equal(runId, this.run.runId, "A retomada deve usar o mesmo runId.");
    this.events.push({ type: "read", revision: this.run.revision });
    return clone(this.run);
  }

  countApplied(action) {
    return this.applyCounts.get(action) || 0;
  }

  callsFor(action) {
    return this.calls.filter((entry) => entry.action === action);
  }

  assertExpectedAction(action) {
    if (action !== this.run.nextAction) {
      throw new SimulatedFailure("deterministic", "unexpected_action");
    }
  }

  rememberIdempotent(action, request, response) {
    if (!MUTABLE_ACTIONS.has(action) || action === "publish") return;
    const key = request.requestId;
    const fingerprint = canonicalJson(request);
    const previous = this.idempotency.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new SimulatedFailure("deterministic", "incompatible_request_id");
      }
      return clone(previous.response);
    }
    this.idempotency.set(key, { fingerprint, response: clone(response) });
    return null;
  }

  recoverIdempotent(action, request) {
    if (!MUTABLE_ACTIONS.has(action) || action === "publish") return null;
    const previous = this.idempotency.get(request.requestId);
    if (!previous) return null;
    if (previous.fingerprint !== canonicalJson(request)) {
      throw new SimulatedFailure("deterministic", "incompatible_request_id");
    }
    return clone(previous.response);
  }

  applyTransition(action, request) {
    this.assertExpectedAction(action);
    this.applyCounts.set(action, this.countApplied(action) + 1);

    switch (action) {
      case "save_plan":
        this.run.nextAction = "upload_ledger";
        break;
      case "upload_ledger":
        this.run.nextAction = "finalize_plan";
        break;
      case "finalize_plan":
        this.run.status = "building";
        this.run.nextAction = "next_part";
        break;
      case "next_part":
        this.run.nextAction = "specify_part";
        break;
      case "specify_part":
        this.run.nextAction = "build_part";
        this.run.mode = "build";
        break;
      case "build_part":
        this.run.attempt += 1;
        this.run.status = "auditing";
        this.run.nextAction = "read_submission";
        break;
      case "read_submission":
        this.run.nextAction = "audit_part";
        break;
      case "audit_part": {
        const decision = this.options.auditOutcomes[this.auditIndex] || "approve";
        this.auditIndex += 1;
        if (decision === "repair") {
          this.run.status = "repair";
          this.run.mode = "repair";
          this.run.nextAction = "build_part";
        } else if (decision === "rebuild") {
          this.run.status = "rebuild";
          this.run.mode = "rebuild";
          this.run.nextAction = "build_part";
        } else if (this.run.partIndex + 1 < this.run.partCount) {
          this.run.partIndex += 1;
          this.run.attempt = 0;
          this.run.status = "building";
          this.run.mode = "build";
          this.run.nextAction = "next_part";
        } else {
          this.run.status = "ready_for_validation";
          this.run.nextAction = "validate";
        }
        break;
      }
      case "resume":
        assert.ok(request.resolution, "A retomada exige uma resolução humana.");
        this.run.status = "building";
        this.run.nextAction = this.run.resumeNextAction;
        delete this.run.resumeNextAction;
        break;
      case "validate":
        this.run.status = "validated";
        this.run.nextAction = "publish";
        break;
      case "publish":
        this.publishProgress += 1;
        if (this.publishProgress >= this.options.publishPolls) {
          this.run.status = "published";
          this.run.nextAction = null;
        } else {
          this.run.status = "publishing";
          this.run.nextAction = "publish";
        }
        break;
      default:
        throw new SimulatedFailure("deterministic", "unknown_action");
    }

    if (!this.blocked && this.options.blockAfterAction === action) {
      this.blocked = true;
      this.run.resumeNextAction = this.run.nextAction;
      this.run.status = "blocked";
      this.run.nextAction = "resume";
    }

    this.run.revision += 1;
    return {
      status: this.run.status,
      nextAction: this.run.nextAction,
      revision: this.run.revision,
      pollAfterSeconds: action === "publish" && this.run.status === "publishing" ? 0 : undefined
    };
  }

  async execute(action, request) {
    this.calls.push({ action, request: clone(request) });
    this.events.push({ type: "action", action, revision: this.run.revision });

    const recovered = this.recoverIdempotent(action, request);
    if (recovered) return recovered;

    if (this.options.failKindOn?.action === action && !this.options.failKindOn.consumed) {
      this.options.failKindOn.consumed = true;
      throw new SimulatedFailure(
        this.options.failKindOn.kind,
        this.options.failKindOn.code || this.options.failKindOn.kind
      );
    }

    if (action === "build_part" && this.options.invalidPartOnce && !this.invalidPartRejected) {
      this.invalidPartRejected = true;
      throw new SimulatedFailure("deterministic", "invalid_part", { correctable: true });
    }

    const response = this.applyTransition(action, request);
    this.rememberIdempotent(action, request, response);

    if (!this.responseLost && this.options.loseResponseOnceOn === action) {
      this.responseLost = true;
      throw new SimulatedFailure("transient", "response_lost");
    }

    return response;
  }
}

function requestFor(snapshot, action, correction = 0, resolution = null) {
  const part = snapshot.partIndex + 1;
  const attempt = snapshot.attempt + 1;
  const requestId = [
    "request",
    action,
    `part${part}`,
    `attempt${attempt}`,
    `correction${correction}`
  ].join("-");
  const request = {
    requestId,
    runId: snapshot.runId,
    action,
    part,
    attempt,
    mode: snapshot.mode
  };
  if (action === "resume") request.resolution = resolution;
  if (correction > 0) request.correction = correction;
  return request;
}

async function executeWithRetry(server, action, request, maxTransientRetries) {
  let transientFailures = 0;
  while (true) {
    try {
      const response = await server.execute(action, request);
      if (action === "publish" && response.status === "publishing") continue;
      return response;
    } catch (error) {
      if (!(error instanceof SimulatedFailure)) throw error;
      if (error.kind !== "transient") throw error;
      transientFailures += 1;
      if (transientFailures > maxTransientRetries) {
        throw new SimulatedFailure("capacity", "retry_limit");
      }
    }
  }
}

async function runStateLoop({
  server,
  runId,
  publicationConfirmed = false,
  humanResolution = null,
  maxActions = Number.POSITIVE_INFINITY,
  maxTransientRetries = 2
}) {
  let performedActions = 0;
  let previousRole = null;
  const roleChanges = [];

  while (true) {
    const snapshot = await server.read(runId);
    if (["published", "cancelled"].includes(snapshot.status)) {
      return { reason: "terminal", snapshot, performedActions, roleChanges };
    }
    if (!snapshot.nextAction) {
      return { reason: "complete", snapshot, performedActions, roleChanges };
    }
    if (snapshot.nextAction === "resume" && !humanResolution) {
      return { reason: "human_decision", snapshot, performedActions, roleChanges };
    }
    if (snapshot.nextAction === "publish" && !publicationConfirmed) {
      return { reason: "publication_confirmation", snapshot, performedActions, roleChanges };
    }
    if (performedActions >= maxActions) {
      return { reason: "interrupted", snapshot, performedActions, roleChanges };
    }

    const role = ROLE_BY_ACTION[snapshot.nextAction];
    assert.ok(role, `Ação sem função definida: ${snapshot.nextAction}`);
    if (role !== previousRole) {
      roleChanges.push({ role, readRevision: snapshot.revision });
      previousRole = role;
    }

    let correction = 0;
    while (true) {
      const request = requestFor(
        snapshot,
        snapshot.nextAction,
        correction,
        snapshot.nextAction === "resume" ? humanResolution : null
      );
      try {
        await executeWithRetry(server, snapshot.nextAction, request, maxTransientRetries);
        break;
      } catch (error) {
        if (!(error instanceof SimulatedFailure)) throw error;
        if (error.kind === "auth") {
          return { reason: "auth_required", snapshot, performedActions, roleChanges };
        }
        if (error.kind === "capacity") {
          return { reason: "capacity", snapshot, performedActions, roleChanges };
        }
        if (error.kind === "conflict") break;
        if (error.kind === "deterministic" && error.correctable) {
          correction += 1;
          continue;
        }
        return {
          reason: "deterministic_failure",
          code: error.code,
          snapshot,
          performedActions,
          roleChanges
        };
      }
    }
    performedActions += 1;
  }
}

function assertRoleChangesFollowReads(server, roleChanges) {
  for (const change of roleChanges) {
    assert.ok(
      server.events.some((event) => event.type === "read" && event.revision === change.readRevision),
      `Mudança para ${change.role} ocorreu sem releitura persistida.`
    );
  }
}

async function happyPath() {
  const server = new SimulatedAuthoringServer({ partCount: 2, publishPolls: 2 });
  const beforeConfirmation = await runStateLoop({ server, runId: server.run.runId });
  assert.equal(beforeConfirmation.reason, "publication_confirmation");
  assert.equal(server.countApplied("publish"), 0, "A publicação começou sem confirmação final.");
  assert.equal(server.countApplied("audit_part"), 2);
  assertRoleChangesFollowReads(server, beforeConfirmation.roleChanges);

  const completed = await runStateLoop({
    server,
    runId: server.run.runId,
    publicationConfirmed: true
  });
  assert.equal(completed.reason, "terminal");
  assert.equal(completed.snapshot.status, "published");
  const publishCalls = server.callsFor("publish");
  assert.equal(publishCalls.length, 2);
  assert.equal(publishCalls[0].request.requestId, publishCalls[1].request.requestId);
  assert.equal(canonicalJson(publishCalls[0].request), canonicalJson(publishCalls[1].request));
}

async function invalidPartCorrection() {
  const server = new SimulatedAuthoringServer({ invalidPartOnce: true });
  const result = await runStateLoop({
    server,
    runId: server.run.runId,
    publicationConfirmed: true
  });
  assert.equal(result.snapshot.status, "published");
  const builds = server.callsFor("build_part");
  assert.equal(builds.length, 2);
  assert.notEqual(builds[0].request.requestId, builds[1].request.requestId);
  assert.equal(server.countApplied("build_part"), 1);
}

async function auditCorrection(decision) {
  const server = new SimulatedAuthoringServer({ auditOutcomes: [decision, "approve"] });
  const result = await runStateLoop({
    server,
    runId: server.run.runId,
    publicationConfirmed: true
  });
  assert.equal(result.snapshot.status, "published");
  assert.equal(server.countApplied("build_part"), 2);
  assert.equal(server.countApplied("audit_part"), 2);
  const modes = server.callsFor("build_part").map((entry) => entry.request.mode);
  assert.deepEqual(modes, ["build", decision]);
}

async function blockAndResume() {
  const server = new SimulatedAuthoringServer({ blockAfterAction: "finalize_plan" });
  const blocked = await runStateLoop({ server, runId: server.run.runId });
  assert.equal(blocked.reason, "human_decision");
  assert.equal(blocked.snapshot.status, "blocked");

  const resumed = await runStateLoop({
    server,
    runId: server.run.runId,
    humanResolution: "Mantenha o recorte planejado.",
    publicationConfirmed: true
  });
  assert.equal(resumed.snapshot.status, "published");
  assert.equal(server.countApplied("resume"), 1);
}

async function lostResponseAndIdempotency() {
  const server = new SimulatedAuthoringServer({ loseResponseOnceOn: "save_plan" });
  const result = await runStateLoop({
    server,
    runId: server.run.runId,
    publicationConfirmed: true
  });
  assert.equal(result.snapshot.status, "published");
  const calls = server.callsFor("save_plan");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].request.requestId, calls[1].request.requestId);
  assert.equal(canonicalJson(calls[0].request), canonicalJson(calls[1].request));
  assert.equal(server.countApplied("save_plan"), 1);

  const isolated = new SimulatedAuthoringServer();
  const snapshot = await isolated.read(isolated.run.runId);
  const request = requestFor(snapshot, "save_plan");
  const first = await isolated.execute("save_plan", request);
  const repeated = await isolated.execute("save_plan", clone(request));
  assert.deepEqual(repeated, first);
  assert.equal(isolated.countApplied("save_plan"), 1);
  await assert.rejects(
    isolated.execute("save_plan", { ...request, part: 99 }),
    (error) => error.code === "incompatible_request_id"
  );
}

async function interruptionAndResume() {
  const server = new SimulatedAuthoringServer({ partCount: 2 });
  const interrupted = await runStateLoop({
    server,
    runId: server.run.runId,
    maxActions: 5
  });
  assert.equal(interrupted.reason, "interrupted");
  const revisionAtInterruption = interrupted.snapshot.revision;

  const resumed = await runStateLoop({
    server,
    runId: server.run.runId,
    publicationConfirmed: true
  });
  assert.equal(resumed.snapshot.status, "published");
  assert.ok(resumed.snapshot.revision > revisionAtInterruption);
  assert.equal(server.countApplied("save_plan"), 1);
  assert.equal(server.countApplied("finalize_plan"), 1);
}

async function legitimateStops() {
  for (const [kind, reason] of [
    ["auth", "auth_required"],
    ["capacity", "capacity"],
    ["deterministic", "deterministic_failure"]
  ]) {
    const server = new SimulatedAuthoringServer({
      failKindOn: { action: "save_plan", kind }
    });
    const result = await runStateLoop({ server, runId: server.run.runId });
    assert.equal(result.reason, reason);
    assert.equal(server.countApplied("save_plan"), 0);
  }
}

async function conflictRereadsTheRun() {
  const server = new SimulatedAuthoringServer({
    failKindOn: { action: "save_plan", kind: "conflict" }
  });
  const result = await runStateLoop({
    server,
    runId: server.run.runId,
    publicationConfirmed: true
  });
  assert.equal(result.snapshot.status, "published");
  assert.equal(server.callsFor("save_plan").length, 2);
  assert.equal(server.countApplied("save_plan"), 1);
  const firstCallIndex = server.events.findIndex((event) => (
    event.type === "action" && event.action === "save_plan"
  ));
  const secondCallIndex = server.events.findIndex((event, index) => (
    index > firstCallIndex && event.type === "action" && event.action === "save_plan"
  ));
  assert.ok(
    server.events.slice(firstCallIndex + 1, secondCallIndex).some((event) => event.type === "read"),
    "O conflito foi repetido sem reler a execução."
  );
}

await happyPath();
await invalidPartCorrection();
await auditCorrection("repair");
await auditCorrection("rebuild");
await blockAndResume();
await lostResponseAndIdempotency();
await interruptionAndResume();
await legitimateStops();
await conflictRereadsTheRun();

console.log("Laço de autoria: fluxo, correções, retomada e idempotência aprovados.");
