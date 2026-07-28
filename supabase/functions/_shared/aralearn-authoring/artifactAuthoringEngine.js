import {
  ArtifactStore,
  AUTHORING_ARTIFACT_BUCKET,
  COURSE_REVISION_BUCKET
} from "./artifactStore.js";
import { assembleAuthoringRun } from "./assembler.js";
import { prepareCourseDocument } from "./canonical.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { ControlStore } from "./controlStore.js";
import { AuthoringApiError, asAuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";

function withoutTransportFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = { ...value };
  delete result._apiRequestHash;
  return result;
}

function referenceFor(descriptor, role, { partKey = null, attempt = null } = {}) {
  return {
    ...descriptor,
    role,
    ...(partKey ? { partKey } : {}),
    ...(Number.isInteger(attempt) && attempt > 0 ? { attempt } : {})
  };
}

function artifact(control, role, { partKey = null, attempt = null } = {}) {
  const candidates = (control.artifacts || []).filter((entry) =>
    entry.role === role
    && (partKey == null || entry.partKey === partKey)
    && (attempt == null || entry.attempt === attempt)
  );
  return candidates.at(-1) || null;
}

function ledgerArtifacts(control) {
  return (control.artifacts || [])
    .filter((entry) => /^ledger:(sources|claims|terms):\d+$/u.test(entry.role))
    .sort((left, right) => left.role.localeCompare(right.role, "en"));
}

function compactControl(control) {
  if (!control || typeof control !== "object") return control;
  const result = { ...control };
  delete result.artifacts;
  delete result.ownerId;
  result.nextAction = control.status === "planning"
    ? control.planHash ? "upload_ledger" : "set_plan"
    : control.status === "ready_for_validation"
      ? "validate"
      : control.status === "validated"
        ? "prepare_publish"
        : control.status === "published"
          ? null
          : "consult_state";
  return result;
}

function currentPart(control) {
  return (control.parts || []).find((part) => part.partKey === control.currentPartKey)
    || (control.parts || []).find((part) => part.status !== "approved")
    || null;
}

function dependencyParts(control, target) {
  const parts = Array.isArray(control?.parts) ? control.parts : [];
  const byKey = new Map(parts.map((part) => [part.partKey, part]));
  const dependencyKeys = new Set();
  const pending = [...(target?.dependsOnPartKeys || [])];
  while (pending.length) {
    const partKey = pending.pop();
    if (dependencyKeys.has(partKey)) continue;
    dependencyKeys.add(partKey);
    const part = byKey.get(partKey);
    for (const dependency of part?.dependsOnPartKeys || []) pending.push(dependency);
  }
  return parts
    .filter((part) => dependencyKeys.has(part.partKey) && part.status === "approved")
    .sort((left, right) => left.position - right.position);
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

function uniquePairs(values, fields) {
  const entries = new Map();
  for (const value of values) {
    if (!value || fields.some((field) => typeof value[field] !== "string" || !value[field])) {
      continue;
    }
    const key = fields.map((field) => value[field]).join("\u0000");
    if (!entries.has(key)) entries.set(key, value);
  }
  return [...entries.values()].sort((left, right) => {
    const leftKey = fields.map((field) => left[field]).join("\u0000");
    const rightKey = fields.map((field) => right[field]).join("\u0000");
    return leftKey.localeCompare(rightKey, "en");
  });
}

function artifactType(command) {
  return {
    create_run: "aralearn.authoring-brief",
    set_plan: "aralearn.course-plan",
    put_ledger_chunk: "aralearn.ledger-chunk",
    set_part_specification: "aralearn.part-spec",
    submit_part: "aralearn.part-submission",
    audit_part: "aralearn.part-audit",
    reopen_part: "aralearn.final-validation-repair",
    validate: "aralearn.contract",
    import_document: "aralearn.contract",
    block: "aralearn.authoring-block",
    resume: "aralearn.authoring-resume",
    cancel_run: "aralearn.authoring-cancel"
  }[command] || `aralearn.authoring.${command}`;
}

function transientFailure(error) {
  return error?.status === 408
    || error?.status === 429
    || error?.status >= 500
    || new Set([
      "service_timeout",
      "service_unavailable",
      "storage_unavailable",
      "storage_rate_limited",
      "publication_lease_unavailable"
    ]).has(error?.code);
}

export class ArtifactAuthoringEngine {
  constructor({
    rpc,
    supabaseUrl,
    serverApiKey,
    fetchImpl = globalThis.fetch,
    leaseTokenFactory = () => globalThis.crypto.randomUUID(),
    leaseSeconds = 90,
    logger = (entry) => console.info(JSON.stringify(entry))
  }) {
    this.artifacts = new ArtifactStore({ supabaseUrl, serverApiKey, fetchImpl });
    this.control = new ControlStore({ rpc });
    this.leaseTokenFactory = leaseTokenFactory;
    this.leaseSeconds = leaseSeconds;
    this.logger = logger;
  }

  async replay({ principal, requestId, payloadHash, deadlineAt = null }) {
    return this.control.replayRequest({ principal, requestId, payloadHash, deadlineAt });
  }

  async #put(value, command, role, options = {}) {
    const descriptor = await this.artifacts.putJson(value, {
      artifactType: options.artifactType || artifactType(command),
      bucket: options.bucket || AUTHORING_ARTIFACT_BUCKET
    });
    return referenceFor(descriptor, role, options);
  }

  async #commandArtifacts(command, payload, partKey) {
    const clean = withoutTransportFields(payload);
    switch (command) {
      case "create_run":
        return [await this.#put(clean.brief || {}, command, "brief")];
      case "set_plan":
        return [await this.#put(clean.plan, command, "plan")];
      case "put_ledger_chunk":
        return [await this.#put(
          clean.items,
          command,
          `ledger:${clean.section}:${clean.position}`
        )];
      case "set_part_specification":
        return [await this.#put(clean.specification, command, "specification", {
          partKey,
          attempt: Number(clean.specification?.attempt || 0)
        })];
      case "submit_part": {
        const attempt = Number(clean.expectedAttempt || 0);
        const submission = { ...clean };
        delete submission.stateDelta;
        const values = [
          this.#put(submission, command, "submission", { partKey, attempt })
        ];
        if (clean.stateDelta) {
          values.push(this.#put(
            clean.stateDelta,
            command,
            "state_delta",
            { partKey, attempt, artifactType: "aralearn.authoring-state-delta" }
          ));
        }
        return Promise.all(values);
      }
      case "audit_part":
      case "reopen_part":
        return [await this.#put(clean, command, "audit", {
          partKey,
          attempt: Number(clean.expectedAttempt || 0)
        })];
      case "validate":
      case "import_document":
        return [await this.#put(clean.document, command, "final_document", {
          bucket: COURSE_REVISION_BUCKET
        })];
      case "block":
      case "resume":
      case "cancel_run":
        return [await this.#put(clean, command, "context", { partKey })];
      default:
        return [];
    }
  }

  async #metadata(command, payload, artifacts) {
    const clean = withoutTransportFields(payload);
    if (command === "create_run") {
      const intent = clean.publicationIntent || { mode: "create" };
      return {
        publicationTarget: clean.publicationTarget,
        collectionId: clean.collectionId || null,
        title: clean.title,
        contractKey: clean.contractKey,
        publicationMode: intent.mode || "create",
        baseCourseId: intent.existingCourseId || null,
        baseRevisionHash: intent.expectedContentHash || null
      };
    }
    if (command === "set_plan") {
      return {
        parts: (clean.plan?.parts || []).map((part, position) => ({
          partKey: part.key,
          position,
          title: part.title,
          dependsOnPartKeys: part.dependsOnPartKeys || []
        }))
      };
    }
    if (command === "put_ledger_chunk") {
      return {
        planHash: clean.planHash,
        section: clean.section,
        position: clean.position
      };
    }
    if (command === "finalize_plan") return { planHash: clean.planHash };
    if (command === "submit_part") {
      return {
        expectedAttempt: clean.expectedAttempt,
        baseLedgerSha256: clean.baseLedgerSha256,
        fragmentHash: await sha256Hex(canonicalJsonStringify(clean.fragment))
      };
    }
    if (command === "audit_part" || command === "reopen_part") {
      return {
        expectedAttempt: clean.expectedAttempt,
        submissionSha256: clean.submissionSha256,
        decision: clean.decision,
        allGatesPassed: command === "reopen_part"
          ? false
          : Object.values(clean.gates || {}).every((value) => value === true),
        findingCount: Array.isArray(clean.findings) ? clean.findings.length : 0
      };
    }
    if (command === "validate" || command === "import_document") {
      const course = clean.document?.courses?.[0] || {};
      const modules = Array.isArray(course.modules) ? course.modules : [];
      const lessons = modules.flatMap((moduleValue) => (
        Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []
      ));
      const microsequences = lessons.flatMap((lesson) => (
        Array.isArray(lesson?.microsequences) ? lesson.microsequences : []
      ));
      return {
        documentHash: artifacts.find((entry) => entry.role === "final_document")?.hash,
        projectId: clean.document?.id || null,
        contractScope: clean.document?.scope || null,
        title: course.title || clean.title,
        goal: course.goal || "",
        contractKey: course.id || clean.contractKey,
        moduleCount: modules.length,
        lessonCount: lessons.length,
        microsequenceCount: microsequences.length,
        cardCount: microsequences.reduce(
          (total, microsequence) => total + (
            Array.isArray(microsequence?.cards) ? microsequence.cards.length : 0
          ),
          0
        ),
        publicationTarget: clean.publicationTarget || "catalog",
        collectionId: clean.collectionId || null,
        publicationMode: clean.publicationIntent?.mode || "create",
        baseCourseId: clean.publicationIntent?.existingCourseId || null,
        baseRevisionHash: clean.publicationIntent?.expectedContentHash || null
      };
    }
    if (command === "publish") return { goal: clean.goal || "" };
    return {};
  }

  async command({
    principal,
    requestId,
    runId,
    partKey = null,
    command,
    payload = {},
    deadlineAt = null
  }) {
    const startedAt = performance.now();
    const canonicalPayload = canonicalJsonStringify({
      command,
      payload: withoutTransportFields(payload)
    });
    const bytesReceived = new TextEncoder().encode(canonicalPayload).byteLength;
    const suppliedHash = String(payload?._apiRequestHash || "");
    const payloadHash = /^[a-f0-9]{64}$/u.test(suppliedHash)
      ? suppliedHash
      : await sha256Hex(canonicalPayload);
    const leaseOwner = this.leaseTokenFactory();
    let sqlQueryCount = 1;
    const sqlStartedAt = performance.now();
    const request = await this.control.beginRequest({
      principal,
      requestId,
      runId,
      partKey,
      operation: command,
      payloadHash,
      leaseOwner,
      leaseSeconds: this.leaseSeconds,
      deadlineAt
    });
    let sqlDurationMs = performance.now() - sqlStartedAt;
    if (!request?.leaseAcquired) {
      this.logger({
        event: "authoring_operation",
        runId,
        requestId,
        operation: command,
        partKey,
        attempt: payload?.expectedAttempt || null,
        result: request?.status || "unknown",
        idempotent: true,
        leaseAcquired: false,
        leaseExpired: request?.leaseExpired === true,
        sqlQueryCount,
        bytesReceived,
        sqlDurationMs: Math.round(sqlDurationMs),
        totalDurationMs: Math.round(performance.now() - startedAt)
      });
      if (request?.status === "failed") {
        throw new AuthoringApiError(
          422,
          request.errorCode || "operation_failed",
          request.errorMessage || "A operação anterior falhou."
        );
      }
      if (request?.status === "succeeded" && runId) {
        return { ...compactControl(await this.control.getRun({
          principal, runId, deadlineAt
        })), idempotent: true };
      }
      return request;
    }

    try {
      let effectivePayload = payload;
      const processingStartedAt = performance.now();
      if (command === "validate" && !payload?.document) {
        const run = await this.getRun({ principal, runId, full: true, deadlineAt });
        sqlQueryCount += 1;
        const document = assembleAuthoringRun(run);
        const prepared = await prepareCourseDocument(document, { requireReady: true });
        effectivePayload = {
          ...payload,
          expectedRevision: run.revision,
          valid: true,
          documentHash: prepared.contentHash,
          document: prepared.document,
          validation: {
            valid: true,
            contract: "aralearn.contract",
            version: 3
          }
        };
      } else if (command === "import_document") {
        const prepared = await prepareCourseDocument(
          payload.document,
          { official: true, requireReady: true }
        );
        effectivePayload = {
          ...payload,
          document: prepared.document,
          documentHash: prepared.contentHash
        };
      }
      const processingDurationMs = performance.now() - processingStartedAt;
      const storageStartedAt = performance.now();
      const artifacts = await this.#commandArtifacts(command, effectivePayload, partKey);
      const storageDurationMs = performance.now() - storageStartedAt;
      const metadata = await this.#metadata(command, effectivePayload, artifacts);
      const commitStartedAt = performance.now();
      const result = await this.control.commitTransition({
        principal,
        requestId,
        operation: command,
        runId,
        partKey,
        leaseOwner,
        metadata,
        artifacts,
        deadlineAt
      });
      sqlQueryCount += 1;
      sqlDurationMs += performance.now() - commitStartedAt;
      this.logger({
        event: "authoring_operation",
        runId,
        requestId,
        operation: command,
        partKey,
        attempt: effectivePayload?.expectedAttempt || null,
        result: result?.status || "succeeded",
        idempotent: false,
        leaseAcquired: true,
        leaseExpired: request?.leaseExpired === true,
        artifactCount: artifacts.length,
        sqlQueryCount,
        bytesReceived,
        bytesWritten: artifacts.reduce((total, entry) => total + Number(entry.sizeBytes || 0), 0),
        processingDurationMs: Math.round(processingDurationMs),
        storageDurationMs: Math.round(storageDurationMs),
        sqlDurationMs: Math.round(sqlDurationMs),
        totalDurationMs: Math.round(performance.now() - startedAt)
      });
      return compactControl(result);
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      const release = transientFailure(normalized)
        && typeof this.control.releaseRequest === "function";
      await this.control[release ? "releaseRequest" : "failRequest"]({
        principal,
        requestId,
        operation: command,
        leaseOwner,
        error: normalized,
        deadlineAt
      }).catch(() => null);
      sqlQueryCount += 1;
      this.logger({
        event: "authoring_operation",
        runId,
        requestId,
        operation: command,
        partKey,
        attempt: payload?.expectedAttempt || null,
        result: "failed",
        errorCode: normalized.code,
        retryable: release,
        leaseAcquired: true,
        leaseExpired: request?.leaseExpired === true,
        sqlQueryCount,
        bytesReceived,
        sqlDurationMs: Math.round(sqlDurationMs),
        totalDurationMs: Math.round(performance.now() - startedAt)
      });
      throw normalized;
    }
  }

  async #loadBase(control) {
    const briefReference = artifact(control, "brief");
    const planReference = artifact(control, "plan");
    const ledgerReferences = ledgerArtifacts(control);
    const references = [
      ...(briefReference ? [briefReference] : []),
      ...(planReference ? [planReference] : []),
      ...ledgerReferences
    ];
    const values = await this.artifacts.getManyJson(references);
    let cursor = 0;
    const brief = briefReference ? values[cursor++] : {};
    const plan = planReference ? values[cursor++] : null;
    if (plan && ledgerReferences.length) {
      plan.ledger = {
        sources: [],
        claims: [],
        terms: [],
        openIssues: plan.ledgerManifest?.openIssues || []
      };
      for (const reference of ledgerReferences) {
        const [, section] = reference.role.split(":");
        plan.ledger[section].push(...values[cursor++]);
      }
      plan.ledgerFinalized = control.status !== "planning";
    }
    return { brief, plan };
  }

  async #loadContinuity(control, next) {
    const dependencies = dependencyParts(control, next);
    const approved = (control.parts || [])
      .filter((part) => part.status === "approved")
      .sort((left, right) => left.position - right.position);
    const specifications = new Map();
    const deltas = new Map();
    const references = [];
    const assignments = [];
    for (const part of dependencies) {
      const reference = artifact(control, "specification", { partKey: part.partKey });
      if (reference) {
        references.push(reference);
        assignments.push({ kind: "specification", partKey: part.partKey });
      }
    }
    for (const part of approved) {
      const reference = artifact(control, "state_delta", {
        partKey: part.partKey,
        attempt: part.attempt || null
      });
      if (reference) {
        references.push(reference);
        assignments.push({ kind: "delta", partKey: part.partKey });
      }
    }
    const values = await this.artifacts.getManyJson(references);
    assignments.forEach((assignment, index) => {
      (assignment.kind === "specification" ? specifications : deltas)
        .set(assignment.partKey, values[index]);
    });

    const stateFields = [
      "introducedTermIds",
      "usedClaimIds",
      "coveredOutcomeIds",
      "resolvedErrorIds",
      "notes"
    ];
    const stateDelta = Object.fromEntries(stateFields.map((field) => [
      field,
      uniqueSorted(dependencies.flatMap((part) => deltas.get(part.partKey)?.[field] || []))
    ]));
    const dependencyMicrosequenceIds = [];
    const workedOperations = [];
    const introducedConcepts = [];
    for (const part of dependencies) {
      const specification = specifications.get(part.partKey) || {};
      dependencyMicrosequenceIds.push(...(specification.ownership?.microsequenceIds || []));
      for (const card of specification.cardPlan || []) {
        if (!["foundation", "worked_example"].includes(card?.learningFunction)
            || typeof card?.microsequenceId !== "string") {
          continue;
        }
        if (typeof card.operationId === "string" && card.operationId) {
          workedOperations.push({
            operationId: card.operationId,
            microsequenceId: card.microsequenceId
          });
        }
        const retrieved = new Set(card.retrievedConceptIds || []);
        for (const conceptId of card.conceptIds || []) {
          if (!retrieved.has(conceptId)) {
            introducedConcepts.push({ conceptId, microsequenceId: card.microsequenceId });
          }
        }
      }
    }
    const stateHash = await sha256Hex(canonicalJsonStringify(
      approved
        .map((part) => ({
          partKey: part.partKey,
          fragmentHash: part.fragmentHash,
          stateDelta: deltas.get(part.partKey) || null
        }))
        .sort((left, right) => left.partKey.localeCompare(right.partKey, "en"))
    ));
    return {
      approvedParts: dependencies.map((part) => ({
        partKey: part.partKey,
        fragmentHash: part.fragmentHash
      })),
      stateDelta,
      dependencyMicrosequenceIds: uniqueSorted(dependencyMicrosequenceIds),
      workedOperations: uniquePairs(
        workedOperations,
        ["operationId", "microsequenceId"]
      ),
      introducedConcepts: uniquePairs(
        introducedConcepts,
        ["conceptId", "microsequenceId"]
      ),
      stateHash
    };
  }

  async getRun({ principal, runId, full = true, deadlineAt = null }) {
    const control = await this.control.getRun({ principal, runId, deadlineAt });
    if (!full) return compactControl(control);
    const { brief, plan } = await this.#loadBase(control);
    const parts = [];
    for (const part of control.parts || []) {
      const specReference = artifact(control, "specification", { partKey: part.partKey });
      const submissionReference = artifact(control, "submission", {
        partKey: part.partKey,
        attempt: part.attempt || null
      }) || artifact(control, "submission", { partKey: part.partKey });
      const auditReference = artifact(control, "audit", {
        partKey: part.partKey,
        attempt: part.attempt || null
      }) || artifact(control, "audit", { partKey: part.partKey });
      const stateDeltaReference = artifact(control, "state_delta", {
        partKey: part.partKey,
        attempt: submissionReference?.attempt || part.attempt || null
      });
      const references = [
        specReference,
        submissionReference,
        stateDeltaReference,
        auditReference
      ].filter(Boolean);
      const values = await this.artifacts.getManyJson(references);
      let cursor = 0;
      const specification = specReference ? values[cursor++] : null;
      const submission = submissionReference ? values[cursor++] : null;
      const stateDelta = stateDeltaReference ? values[cursor++] : null;
      const auditValue = auditReference ? values[cursor] : null;
      parts.push({
        ...part,
        outline: plan?.parts?.find((outline) => outline.key === part.partKey) || null,
        specification,
        fragment: submission?.fragment || null,
        authoringFragment: submission?.authoringFragment || null,
        submissionMeta: submission ? {
          evidence: submission.evidence || [],
          stateDelta
        } : {},
        audits: auditValue ? [auditValue] : [],
        latestAudit: auditValue
      });
    }
    const nextPart = currentPart(control);
    return {
      ...compactControl(control),
      brief,
      plan,
      parts,
      nextPart: nextPart ? parts.find((part) => part.partKey === nextPart.partKey) : null
    };
  }

  async getNextPart({ principal, runId, deadlineAt = null }) {
    const control = await this.control.getRun({ principal, runId, deadlineAt });
    const { brief, plan } = await this.#loadBase(control);
    const next = currentPart(control);
    if (!next) return { ...compactControl(control), brief, plan, nextPart: null };
    const specificationReference = artifact(control, "specification", {
      partKey: next.partKey
    });
    const auditReference = artifact(control, "audit", {
      partKey: next.partKey,
      attempt: next.attempt || null
    });
    const values = await this.artifacts.getManyJson(
      [specificationReference, auditReference].filter(Boolean)
    );
    let cursor = 0;
    const specification = specificationReference ? values[cursor++] : null;
    const latestAudit = auditReference ? values[cursor] : null;
    const continuity = await this.#loadContinuity(control, next);
    return {
      ...compactControl(control),
      brief,
      plan,
      parts: control.parts,
      continuity,
      nextPart: {
        ...next,
        outline: plan?.parts?.find((part) => part.key === next.partKey) || null,
        specification: specificationReference ? specification : null,
        ...(auditReference ? { latestAudit, audits: [latestAudit] } : {})
      }
    };
  }

  async getPartSubmission({ principal, runId, partKey, deadlineAt = null }) {
    const control = await this.control.getRun({ principal, runId, deadlineAt });
    const part = (control.parts || []).find((entry) => entry.partKey === partKey);
    if (!part) {
      throw new AuthoringApiError(404, "part_not_found", "Parte de autoria não encontrada.");
    }
    const reference = artifact(control, "submission", {
      partKey,
      attempt: part.attempt || null
    }) || artifact(control, "submission", { partKey });
    if (!reference) {
      throw new AuthoringApiError(404, "submission_not_found", "A parte ainda não possui submissão.");
    }
    const stateDeltaReference = artifact(control, "state_delta", {
      partKey,
      attempt: reference.attempt || null
    });
    const [submission, stateDelta] = await this.artifacts.getManyJson(
      [reference, stateDeltaReference].filter(Boolean)
    );
    return {
      ...submission,
      ...(stateDeltaReference ? { stateDelta } : {}),
      runId,
      partKey,
      attempt: reference.attempt || part.attempt,
      fragmentHash: part.fragmentHash,
      submissionSha256: part.fragmentHash
    };
  }

  async listRuns(options) {
    const result = await this.control.listRuns(options);
    return {
      ...result,
      items: (result.items || []).map(compactControl)
    };
  }
}
