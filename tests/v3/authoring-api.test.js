import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { createAuthoringHandler } from "../../supabase/functions/_shared/aralearn-authoring/router.js";
import {
  publishOfficialDocumentStep
} from "../../supabase/functions/_shared/aralearn-authoring/officialPublisher.js";
import {
  materializePrivateDocumentStep
} from "../../supabase/functions/_shared/aralearn-authoring/privatePublisher.js";
import {
  SupabaseAuthoringAdapter
} from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";
import {
  prepareCourseDocument
} from "../../supabase/functions/_shared/aralearn-authoring/canonical.js";
import {
  canonicalJsonStringify
} from "../../supabase/functions/_shared/aralearn-authoring/canonicalJson.js";
import {
  compileAuthoringFragmentGaps
} from "../../supabase/functions/_shared/aralearn/runtime/core/authoringGaps.js";
import { buildNextPart } from "../../supabase/functions/_shared/aralearn-authoring/continuity.js";
import {
  issueSubmissionReadReceipt,
  sha256Hex,
  verifySubmissionReadReceipt
} from "../../supabase/functions/_shared/aralearn-authoring/security.js";
import {
  ACTION_RESPONSE_BODY_LIMIT,
  normalizeAuthoringPath,
  readJsonBody,
  validatePartPayload,
  validatePartSpecificationPayload
} from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { catalogIdentityUuidFactory } from "../../scripts/publishCatalogFixtures.mjs";

const API_KEY = `arl_${"A".repeat(24)}`;
const LIMITED_API_KEY = `arl_${"B".repeat(24)}`;
const ORIGIN = "https://fabio-ara.github.io";
const EMPTY_STATE_DELTA = Object.freeze({
  introducedTermIds: [],
  usedClaimIds: [],
  coveredOutcomeIds: [],
  resolvedErrorIds: [],
  notes: []
});
const PASSING_GATES = Object.freeze({
  planAlignment: true,
  contract: true,
  outcomeCoverage: true,
  sources: true,
  continuity: true,
  interactionCoherence: true,
  language: true,
  fieldPreservation: true,
  structuredElements: true,
  feedback: true
});
const TEST_RECEIPT_SECRET = "aralearn-test-receipt-secret-32-bytes-minimum";
const fixtureUrl = new URL("../fixtures/v3/project-minimal.json", import.meta.url);
const partStructures = new WeakMap();

test("submissão de parte compila a notação autoral de lacunas antes de persistir", () => {
  const runId = "6c8510b2-8c2e-4d94-a29c-a34f1430ea7a";
  const payload = validatePartPayload({
    artifact: "aralearn.part-submission",
    version: 1,
    runId,
    partKey: "parte-tabela",
    requestId: "parte-tabela-v1",
    mode: "build",
    attempt: 1,
    baseLedgerSha256: "a".repeat(64),
    fragment: {
      courseId: "curso",
      moduleId: "modulo",
      lessonId: "licao",
      microsequences: [{
        id: "micro",
        title: "Microssequência de prática",
        goal: "Completar corretamente a igualdade.",
        role: "practice",
        status: "generated",
        cards: [{
          id: "card",
          resource: "table",
          kind: "exercise",
          exercise: "gap",
          rows: [["2 + 2", "{gap:resultado}"]],
          gaps: [{
            id: "resultado",
            response: "choice",
            answer: "4",
            distractors: ["3", "5"]
          }]
        }]
      }]
    },
    stateDelta: EMPTY_STATE_DELTA
  }, { runId, partKey: "parte-tabela" });

  assert.equal(payload.fragment.microsequences[0].cards[0].rows[0][1], "[[4::4|3|5]]");
  assert.equal(Object.hasOwn(payload.fragment.microsequences[0].cards[0], "gaps"), false);
  assert.equal(
    payload.authoringFragment.microsequences[0].cards[0].rows[0][1],
    "{gap:resultado}"
  );
  assert.equal(payload.authoringFragment.microsequences[0].cards[0].gaps[0].id, "resultado");
  for (const field of ["courseId", "moduleId", "lessonId"]) {
    assert.equal(payload.authoringFragment[field], payload.fragment[field]);
  }
  assert.equal(payload.authoringFragment.microsequences[0].id, payload.fragment.microsequences[0].id);
  assert.equal(
    payload.authoringFragment.microsequences[0].cards[0].id,
    payload.fragment.microsequences[0].cards[0].id
  );
});

test("submissão formal rejeita campos desconhecidos e evidence fora do schema", () => {
  const runId = "6c8510b2-8c2e-4d94-a29c-a34f1430ea7a";
  const route = { runId, partKey: "parte-estrita" };
  const validPayload = () => ({
    artifact: "aralearn.part-submission",
    version: 1,
    runId,
    partKey: route.partKey,
    requestId: "parte-estrita-v1",
    mode: "build",
    attempt: 1,
    baseLedgerSha256: "a".repeat(64),
    fragment: {
      courseId: "curso",
      moduleId: "modulo",
      lessonId: "licao",
      microsequences: [{
        id: "micro",
        title: "Microssequência",
        goal: "Ensinar um conceito.",
        role: "explain",
        status: "generated",
        cards: [{ id: "card" }]
      }]
    },
    evidence: [{ sourceId: "source-1", claimId: "claim-1", cardIds: ["card"] }],
    stateDelta: EMPTY_STATE_DELTA
  });
  const expectInvalid = (mutate, path, reason) => {
    const submission = validPayload();
    mutate(submission);
    assert.throws(
      () => validatePartPayload(submission, route),
      (error) => {
        assert.equal(error instanceof AuthoringApiError, true);
        assert.equal(error.code, "invalid_payload");
        assert.equal(error.details?.path, path);
        assert.equal(error.details?.reason, reason);
        return true;
      }
    );
  };

  expectInvalid((value) => {
    value.unexpected = true;
  }, "unexpected", "unknown_field");
  expectInvalid((value) => {
    value.fragment.contract = "aralearn.contract";
  }, "fragment.contract", "unknown_field");
  expectInvalid((value) => {
    value.fragment.microsequences[0].unexpected = true;
  }, "fragment.microsequences[0].unexpected", "unknown_field");
  expectInvalid((value) => {
    delete value.fragment.microsequences[0].title;
  }, "fragment.microsequences[0].title", "required");
  expectInvalid((value) => {
    value.fragment.microsequences[0].role = "invented";
  }, "fragment.microsequences[0].role", "invalid_value");
  expectInvalid((value) => {
    value.evidence[0].quote = "campo não permitido";
  }, "evidence[0].quote", "unknown_field");
  expectInvalid((value) => {
    value.evidence[0].sourceId = 42;
  }, "evidence[0].sourceId", "wrong_type");
  expectInvalid((value) => {
    value.evidence[0].claimId = 42;
  }, "evidence[0].claimId", "wrong_type");
  expectInvalid((value) => {
    value.evidence[0].cardIds = [42];
  }, "evidence[0].cardIds[0]", "wrong_type");
  expectInvalid((value) => {
    value.evidence[0].cardIds = ["card", "card"];
  }, "evidence[0].cardIds", "duplicate");
});

function clone(value) {
  return structuredClone(value);
}

function operationRepresentation(resources = ["paragraph"]) {
  const allowedResources = [...new Set(resources.length ? resources : ["paragraph"])];
  return {
    preferredResources: allowedResources.slice(0, 4),
    allowedResources,
    rationale: "A representação corresponde à operação observável planejada."
  };
}

function operationFixture(id, resources = ["paragraph"]) {
  return {
    id,
    label: `Executar ${id}.`,
    evidence: "Registrar uma resposta observável para a operação.",
    representation: operationRepresentation(resources)
  };
}

async function fixture() {
  return JSON.parse(await fs.readFile(fixtureUrl, "utf8"));
}

function failure(status, code, message) {
  throw new AuthoringApiError(status, code, message);
}

function assertActionableValidation(result, { code, path, reason }) {
  assert.equal(result.response.status, 422, JSON.stringify(result.json));
  assert.equal(result.json.error.code, code);
  assert.equal(result.json.error.details?.path, path);
  assert.equal(result.json.error.details?.field, path.match(/(?:^|\.|\[)([^.[\]]+)\]?$/)?.[1]);
  assert.equal(result.json.error.details?.reason, reason);
  assert.match(result.json.error.message, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
}

class MemoryAuthoringAdapter {
  constructor(document) {
    this.document = document;
    this.runs = new Map();
    this.idempotency = new Map();
    this.commandCount = 0;
    this.publishCount = 0;
    this.fullRunReadCount = 0;
    this.summaryReadCount = 0;
    this.nextPartReadCount = 0;
    this.partSubmissionReadCount = 0;
    this.clock = 0;
    this.receiptSecret = TEST_RECEIPT_SECRET;
  }

  async resolvePrincipal(authentication) {
    if (authentication.kind === "api_key") {
      if (![API_KEY, LIMITED_API_KEY].includes(authentication.credential)) {
        failure(401, "invalid_client", "Cliente inválido.");
      }
      return {
        actorId: authentication.credential === API_KEY ? "owner" : "limited",
        clientId: authentication.credential.slice(0, 12),
        authenticationKind: "api_key",
        scopes: authentication.credential === API_KEY
          ? ["authoring:read", "authoring:write", "authoring:audit", "catalog:publish"]
          : ["authoring:read", "authoring:write"]
      };
    }
    if (authentication.credential === "jwt-owner") {
      return {
        actorId: "owner",
        clientId: null,
        authenticationKind: "jwt",
        scopes: ["authoring:read", "authoring:write", "authoring:audit", "course:import", "catalog:publish"]
      };
    }
    if (authentication.credential === "jwt-student") {
      return {
        actorId: "student", clientId: null, authenticationKind: "jwt",
        scopes: ["authoring:read", "authoring:write"]
      };
    }
    failure(401, "authentication_required", "Sessão inválida.");
  }

  #nextPart(run) {
    return run.parts.find((part) => part.status !== "approved") || null;
  }

  #continuity(run, targetPart) {
    const partsByKey = new Map(run.parts.map((part) => [part.partKey, part]));
    const dependencyKeys = new Set();
    const visit = (partKey) => {
      if (dependencyKeys.has(partKey)) return;
      const part = partsByKey.get(partKey);
      if (!part || part.status !== "approved") return;
      dependencyKeys.add(partKey);
      const outline = part.outline || part.specification || {};
      for (const dependency of outline.dependsOnPartKeys || []) visit(dependency);
    };
    const targetOutline = targetPart?.outline || targetPart?.specification || {};
    for (const dependency of targetOutline.dependsOnPartKeys || []) visit(dependency);
    const dependencies = run.parts
      .filter((part) => dependencyKeys.has(part.partKey))
      .sort((left, right) => left.position - right.position);
    const stateDelta = Object.fromEntries(Object.keys(EMPTY_STATE_DELTA).map((field) => [
      field,
      [...new Set(dependencies.flatMap((part) => part.submissionMeta?.stateDelta?.[field] || []))]
    ]));
    const dependencyMicrosequenceIds = [...new Set(dependencies.flatMap((part) =>
      part.specification?.ownership?.microsequenceIds || []
    ))];
    const workedOperations = dependencies.flatMap((part) =>
      (part.specification?.cardPlan || [])
        .filter((card) => card.learningFunction === "worked_example")
        .map((card) => ({
          operationId: card.operationId,
          microsequenceId: card.microsequenceId
        }))
    );
    return {
      approvedParts: dependencies.map((part) => ({
        partKey: part.partKey,
        fragmentHash: part.fragmentHash
      })),
      stateDelta,
      dependencyMicrosequenceIds,
      workedOperations
    };
  }

  #view(run) {
    const nextPart = this.#nextPart(run);
    const withoutFormalSource = (part) => {
      const result = clone(part);
      delete result.authoringFragment;
      delete result.authoringFragmentHash;
      return result;
    };
    const view = {
      ...clone(run),
      nextAction: run.plan && run.plan.ledgerFinalized === false ? "upload_ledger" : null,
      nextPart: nextPart ? withoutFormalSource(nextPart) : null,
      continuity: clone(this.#continuity(run, nextPart))
    };
    view.parts = view.parts.map(withoutFormalSource);
    if (view.nextPart && !view.nextPart.outline) {
      view.nextPart.outline = clone(view.nextPart.specification);
    }
    return view;
  }

  async listRuns({ principal, limit = 25, beforeUpdatedAt = null, beforeRunId = null }) {
    const cursor = beforeUpdatedAt && beforeRunId ? `${beforeUpdatedAt}:${beforeRunId}` : null;
    const ordered = [...this.runs.values()]
      .filter((run) => run.createdBy === principal.actorId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)
        || right.runId.localeCompare(left.runId));
    const afterCursor = cursor
      ? ordered.filter((run) => `${run.updatedAt}:${run.runId}` < cursor)
      : ordered;
    const page = afterCursor.slice(0, limit);
    const items = page.map((run) => ({
      runId: run.runId,
      title: run.title,
      status: run.status,
      updatedAt: run.updatedAt,
      nextAction: run.parts.some((part) => part.status !== "approved") ? "continue" : "validate",
      partCounts: run.parts.reduce((counts, part) => ({
        ...counts,
        [part.status]: (counts[part.status] || 0) + 1
      }), {})
    }));
    const last = page.at(-1);
    return {
      items,
      nextCursor: afterCursor.length > page.length && last
        ? { beforeUpdatedAt: last.updatedAt, beforeRunId: last.runId }
        : null
    };
  }

  async getRun({ principal, runId }) {
    this.fullRunReadCount += 1;
    const run = this.runs.get(runId);
    if (!run || run.createdBy !== principal.actorId) failure(404, "run_not_found", "Execução inexistente.");
    return this.#view(run);
  }

  async getRunAuthorizationSummary({ principal, runId }) {
    const run = this.runs.get(runId);
    if (!run || run.createdBy !== principal.actorId) failure(404, "run_not_found", "Execução inexistente.");
    return {
      runId,
      publicationTarget: run.publicationTarget,
      contractKey: run.contractKey
    };
  }

  async getRunSummary({ principal, runId }) {
    this.summaryReadCount += 1;
    const run = this.runs.get(runId);
    if (!run || run.createdBy !== principal.actorId) failure(404, "run_not_found", "Execução inexistente.");
    const summary = this.#view(run);
    delete summary.plan;
    delete summary.document;
    summary.parts = summary.parts.map((part) => {
      const item = clone(part);
      delete item.fragment;
      return item;
    });
    return summary;
  }

  async getNextPart({ principal, runId }) {
    this.nextPartReadCount += 1;
    const run = this.runs.get(runId);
    if (!run || run.createdBy !== principal.actorId) failure(404, "run_not_found", "Execução inexistente.");
    return this.#view(run);
  }

  async getPartSubmission({ principal, runId, partKey }) {
    this.partSubmissionReadCount += 1;
    const run = this.runs.get(runId);
    if (!run || run.createdBy !== principal.actorId) failure(404, "run_not_found", "Execução inexistente.");
    const part = run.parts.find((item) => item.partKey === partKey);
    if (!part) failure(404, "part_not_found", "Parte inexistente.");
    return {
      runId,
      partKey,
      position: part.position,
      title: part.title,
      status: part.status,
      attempt: part.attempt,
      baseLedgerSha256: part.submissionMeta?.baseLedgerSha256 || null,
      fragmentHash: part.fragmentHash,
      compiledFragmentHash: part.fragmentHash,
      submissionSha256: part.fragmentHash,
      specification: clone(part.specification),
      fragment: clone(part.fragment),
      authoringFragment: clone(part.authoringFragment),
      authoringFragmentHash: part.authoringFragmentHash,
      evidence: clone(part.submissionMeta?.evidence || []),
      stateDelta: clone(part.submissionMeta?.stateDelta || {}),
      latestAudit: part.audits.length ? clone(part.audits.at(-1)) : null
    };
  }

  async replayCommand({ principal, requestId, apiRequestHash }) {
    const existing = this.idempotency.get(`${principal.actorId}:${requestId}`);
    if (!existing) return null;
    if (existing.apiRequestHash !== apiRequestHash) {
      failure(422, "request_id_reused", "requestId incompatível.");
    }
    return { ...clone(existing.result), idempotent: true };
  }

  async command({ principal, requestId, runId, command, partKey, payload = {} }) {
    const idempotencyKey = `${principal.actorId}:${requestId}`;
    const fingerprint = canonicalJsonStringify({ runId, command, partKey, payload });
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) failure(422, "request_id_reused", "requestId incompatível.");
      return { ...clone(existing.result), idempotent: true };
    }
    this.commandCount += 1;
    let result;
    if (command === "create_run") {
      const run = {
        runId,
        createdBy: principal.actorId,
        publicationTarget: payload.publicationTarget,
        status: "planning",
        title: payload.title,
        brief: clone(payload.brief || {}),
        contractKey: payload.contractKey,
        publicationIntent: clone(payload.publicationIntent),
        revision: 0,
        plan: null,
        planHash: null,
        parts: [],
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, this.clock += 1)).toISOString()
      };
      this.runs.set(runId, run);
      result = { runId, status: run.status };
    } else if (command === "import_document") {
      const run = {
        runId,
        createdBy: principal.actorId,
        publicationTarget: payload.publicationTarget,
        status: "validated",
        title: payload.title,
        brief: {},
        plan: { kind: "document_import" },
        parts: [{
          partKey: "document",
          position: 0,
          status: "approved",
          fragment: clone(payload.document),
          authoringFragment: null,
          authoringFragmentHash: null,
          specification: {}
        }],
        validation: payload.validation,
        document: clone(payload.document),
        revision: 0,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, this.clock += 1)).toISOString()
      };
      this.runs.set(runId, run);
      result = { runId, status: run.status, documentHash: payload.documentHash };
    } else {
      const run = this.runs.get(runId);
      if (!run) failure(404, "run_not_found", "Execução inexistente.");
      if (command === "set_plan") {
        if (run.status !== "planning") failure(409, "invalid_state", "Plano fora de ordem.");
        run.plan = { ...clone(payload.plan), ledgerFinalized: false };
        run.planHash = await sha256Hex(JSON.stringify(run.plan));
        run.parts = payload.plan.parts.map((part, position) => ({
          partKey: part.key,
          position,
          title: part.title,
          outline: clone(part),
          specification: null,
          specificationHash: null,
          status: "planned",
          fragment: null,
          fragmentHash: null,
          authoringFragment: null,
          authoringFragmentHash: null,
          attempt: 0,
          audits: []
        }));
        run.status = "building";
        result = {
          runId, status: run.status, partCount: run.parts.length,
          nextAction: "upload_ledger"
        };
      } else if (command === "put_ledger_chunk") {
        if (!run.plan || run.plan.ledgerFinalized) failure(409, "invalid_state", "Ledger finalizado.");
        if (payload.planHash !== run.planHash) failure(409, "stale_authoring_state", "Plano desatualizado.");
        const descriptor = run.plan.ledgerManifest.sections[payload.section];
        if (!descriptor || payload.position < 0 || payload.position >= descriptor.chunkCount) {
          failure(422, "invalid_ledger_chunk", "Chunk fora do manifesto do ledger.");
        }
        run.ledgerChunks ||= { sources: [], claims: [], terms: [] };
        const current = run.ledgerChunks[payload.section][payload.position];
        if (current && canonicalJsonStringify(current) !== canonicalJsonStringify(payload.items)) {
          failure(409, "conflict", "Chunk incompatível.");
        }
        run.ledgerChunks[payload.section][payload.position] = clone(payload.items);
        result = {
          runId, status: run.status, section: payload.section,
          position: payload.position, nextAction: "upload_ledger"
        };
      } else if (command === "finalize_plan") {
        if (!run.plan || run.plan.ledgerFinalized) failure(409, "invalid_state", "Ledger finalizado.");
        if (payload.planHash !== run.planHash) failure(409, "stale_authoring_state", "Plano desatualizado.");
        if (run.plan.ledgerManifest.openIssues.length) {
          failure(422, "ledger_incomplete", "O plano ainda contém pendências abertas.");
        }
        const chunks = run.ledgerChunks || { sources: [], claims: [], terms: [] };
        for (const section of ["sources", "claims", "terms"]) {
          const descriptor = run.plan.ledgerManifest.sections[section];
          const received = chunks[section].filter((items) => Array.isArray(items));
          const itemCount = received.reduce((total, items) => total + items.length, 0);
          if (received.length !== descriptor.chunkCount || itemCount !== descriptor.itemCount
              || chunks[section].slice(0, descriptor.chunkCount).some((items) => !Array.isArray(items))) {
            failure(422, "ledger_incomplete", `Ledger incompleto na seção ${section}.`);
          }
        }
        run.plan.ledger = {
          sources: chunks.sources.flatMap((items) => items || []),
          claims: chunks.claims.flatMap((items) => items || []),
          terms: chunks.terms.flatMap((items) => items || []),
          openIssues: clone(run.plan.ledgerManifest.openIssues)
        };
        run.plan.ledgerFinalized = true;
        result = { runId, status: run.status, nextAction: "specify_part" };
      } else if (command === "cancel_run") {
        run.status = "cancelled";
        run.ledgerChunks = null;
        result = { runId, status: "cancelled" };
      } else if (command === "set_part_specification") {
        const part = run.parts.find((value) => value.partKey === partKey);
        if (!part) failure(404, "part_not_found", "Parte inexistente.");
        if (!run.plan?.ledgerFinalized) failure(409, "invalid_state", "Finalize o ledger primeiro.");
        if (payload.planHash !== run.planHash) failure(409, "stale_authoring_state", "Plano desatualizado.");
        if (part.specification) failure(409, "invalid_state", "A parte já possui especificação.");
        if (run.parts.some((value) => value.position < part.position && value.status !== "approved")) {
          failure(409, "invalid_state", "A parte anterior ainda não foi aprovada.");
        }
        part.specification = clone(payload.specification);
        part.specificationHash = await sha256Hex(JSON.stringify(part.specification));
        result = {
          runId,
          status: run.status,
          partKey,
          partStatus: part.status,
          nextAction: "build_part",
          planHash: run.planHash,
          specificationHash: part.specificationHash
        };
      } else if (command === "submit_part") {
        const part = run.parts.find((value) => value.partKey === partKey);
        if (!part) failure(404, "part_not_found", "Parte inexistente.");
        if (payload.expectedAttempt !== part.attempt + 1
            || !/^[a-f0-9]{64}$/.test(payload.baseLedgerSha256 || "")) {
          failure(409, "stale_part_spec", "Especificação causal ausente.");
        }
        const required = {
          build: "planned",
          repair: "repair_required",
          rebuild: "rebuild_required"
        }[payload.mode];
        if (part.status !== required) failure(409, "invalid_state", "Modo incompatível com o estado.");
        if (run.parts.some((value) => value.position < part.position && value.status !== "approved")) {
          failure(409, "invalid_state", "A parte anterior ainda não foi aprovada.");
        }
        part.fragment = clone(payload.fragment);
        part.authoringFragment = clone(payload.authoringFragment);
        part.attempt += 1;
        part.fragmentHash = await sha256Hex(JSON.stringify(part.fragment));
        part.authoringFragmentHash = await sha256Hex(JSON.stringify(part.authoringFragment));
        part.submissionMeta = {
          planHash: run.planHash,
          specificationHash: part.specificationHash,
          mode: payload.mode,
          baseLedgerSha256: payload.baseLedgerSha256,
          evidence: clone(payload.evidence || []),
          stateDelta: clone(payload.stateDelta || {})
        };
        part.status = "awaiting_audit";
        run.status = "auditing";
        result = {
          runId,
          status: run.status,
          partKey,
          partStatus: part.status,
          attempt: part.attempt,
          fragmentHash: part.fragmentHash,
          authoringFragmentHash: part.authoringFragmentHash
        };
      } else if (command === "audit_part") {
        const part = run.parts.find((value) => value.partKey === partKey);
        if (!part || part.status !== "awaiting_audit") failure(409, "invalid_state", "Parte fora de auditoria.");
        if (payload.expectedAttempt !== part.attempt
            || payload.submissionSha256 !== part.fragmentHash) {
          failure(409, "stale_submission", "Submissão causal ausente.");
        }
        part.status = {
          approve: "approved",
          repair: "repair_required",
          rebuild: "rebuild_required",
          blocked: "blocked"
        }[payload.decision];
        part.audits.push({
          attempt: part.attempt,
          decision: payload.decision,
          findings: clone(payload.findings)
        });
        if (payload.decision === "rebuild") {
          part.fragment = null;
          part.fragmentHash = null;
          part.authoringFragment = null;
          part.authoringFragmentHash = null;
        }
        run.status = payload.decision === "blocked"
          ? "blocked"
          : payload.decision === "approve"
          ? (run.parts.every((value) => value.status === "approved") ? "ready_for_validation" : "building")
          : payload.decision;
        result = { runId, status: run.status, partKey, decision: payload.decision };
      } else if (command === "reopen_part") {
        const part = run.parts.find((value) => value.partKey === partKey);
        if (run.status !== "ready_for_validation" || !part || part.status !== "approved") {
          failure(409, "invalid_state", "A parte não pode ser reaberta neste estado.");
        }
        if (payload.expectedAttempt !== part.attempt
            || payload.submissionSha256 !== part.fragmentHash) {
          failure(409, "stale_submission", "A parte indicada não é mais a versão aprovada atual.");
        }
        part.status = payload.decision === "repair" ? "repair_required" : "rebuild_required";
        part.audits.push({
          attempt: part.attempt,
          decision: payload.decision,
          phase: "final_validation",
          findings: clone(payload.findings)
        });
        if (payload.decision === "rebuild") {
          part.fragment = null;
          part.fragmentHash = null;
          part.authoringFragment = null;
          part.authoringFragmentHash = null;
        }
        run.status = payload.decision;
        run.document = null;
        run.validation = null;
        result = {
          runId,
          status: run.status,
          partKey,
          partStatus: part.status,
          decision: payload.decision
        };
      } else if (command === "validate") {
        if (payload.expectedRevision !== run.revision) {
          failure(409, "stale_authoring_state", "A execução mudou durante a validação.");
        }
        if (run.status !== "ready_for_validation" || !payload.valid || !payload.document) {
          failure(409, "course_incomplete", "Curso incompleto.");
        }
        run.status = "validated";
        run.document = clone(payload.document);
        run.validation = clone(payload.validation);
        result = { runId, status: run.status, documentHash: payload.documentHash };
      } else if (command === "block") {
        if (run.status === "blocked") failure(409, "invalid_state", "Execução já bloqueada.");
        run.previousStatus = run.status;
        run.status = "blocked";
        run.blocked = { ...clone(payload), partKey };
        result = { runId, status: "blocked", nextAction: "ask_user", blocked: clone(run.blocked) };
      } else if (command === "resume") {
        if (run.status !== "blocked") failure(409, "invalid_state", "Execução não bloqueada.");
        run.status = run.previousStatus;
        run.resolution = clone(payload.resolution);
        result = { runId, status: run.status, nextAction: "resume" };
      } else {
        failure(422, "unsupported_command", "Comando não implementado no teste.");
      }
    }
    const touched = this.runs.get(runId);
    if (touched) {
      touched.revision = Number(touched.revision || 0) + 1;
      touched.updatedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, this.clock += 1)).toISOString();
    }
    this.idempotency.set(idempotencyKey, {
      fingerprint,
      apiRequestHash: payload._apiRequestHash || null,
      result: clone(result)
    });
    return { ...result, idempotent: false };
  }

  async publishRun({ principal, runId }) {
    const run = this.runs.get(runId);
    if (!run || run.createdBy !== principal.actorId) failure(404, "run_not_found", "Execução inexistente.");
    if (run.status !== "validated" && run.status !== "published") {
      failure(409, "course_incomplete", "Curso não validado.");
    }
    if (run.status !== "published") {
      this.publishCount += 1;
      run.status = "published";
      run.courseId = "11111111-1111-5111-8111-111111111111";
    }
    return { runId, status: run.status, courseId: run.courseId };
  }

  async importDocument({ principal, requestId, target, document }) {
    return this.command({
      principal,
      runId: "22222222-2222-5222-8222-222222222222",
      requestId,
      command: "import_document",
      payload: {
        publicationTarget: target,
        title: document.courses[0].title,
        document,
        documentHash: "a".repeat(64),
        validation: { valid: true }
      }
    });
  }
}

class FaultInjectingMemoryAuthoringAdapter extends MemoryAuthoringAdapter {
  constructor(document, { before = [], after = [] } = {}) {
    super(document);
    this.failBefore = new Set(before.map(([command, requestId]) => `${command}:${requestId}`));
    this.loseAfter = new Set(after.map(([command, requestId]) => `${command}:${requestId}`));
  }

  async command(args) {
    const key = `${args.command}:${args.requestId}`;
    if (this.failBefore.delete(key)) {
      failure(503, "service_unavailable", "Falha transitória simulada antes do commit.");
    }
    const result = await super.command(args);
    if (this.loseAfter.delete(key)) {
      failure(503, "response_lost", "Resposta simuladamente perdida depois do commit.");
    }
    return result;
  }
}

async function invoke(handler, path, {
  method = "GET",
  body,
  credential = API_KEY,
  origin = ORIGIN,
  requestIdHeader = ""
} = {}) {
  const headers = { Origin: origin };
  if (credential) headers.Authorization = `Bearer ${credential}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (requestIdHeader) headers["Idempotency-Key"] = requestIdHeader;
  const response = await handler(new Request(`https://example.test${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  }));
  return { response, json: response.status === 204 ? null : await response.json() };
}

function authoringMicrosequences(value) {
  const microsequences = clone(value);
  microsequences.forEach((microsequence) => {
    microsequence.cards.forEach((card) => {
      if (card.kind !== "exercise" || card.exercise !== "gap") return;
      const gaps = [];
      Object.entries(card).forEach(([field, fieldValue]) => {
        if (typeof fieldValue !== "string") return;
        card[field] = fieldValue.replace(/\[\[([^:[\]]+)::([^\]]+)\]\]/gu, (
          _token,
          answer,
          optionText
        ) => {
          const options = optionText.split("|");
          const id = `${card.id}-gap-${gaps.length + 1}`;
          gaps.push({
            id,
            response: "choice",
            answer,
            distractors: options[0] === answer ? options.slice(1) : options
          });
          return `{gap:${id}}`;
        });
      });
      if (!gaps.length) throw new Error(`Card ${card.id} não contém lacuna interna para formalizar.`);
      card.gaps = gaps;
    });
  });
  return microsequences;
}

function partFixture(document) {
  const course = document.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const part = {
    courseId: course.id,
    moduleId: moduleValue.id,
    lessonId: lesson.id,
    microsequences: authoringMicrosequences(lesson.microsequences)
  };
  partStructures.set(part, {
    course: { id: course.id, title: course.title, goal: course.goal },
    module: { id: moduleValue.id, title: moduleValue.title, guide: clone(moduleValue.guide) },
    lesson: {
      id: lesson.id,
      title: lesson.title,
      guide: clone(lesson.guide),
      topics: clone(lesson.topics)
    }
  });
  return {
    project: (() => {
      const result = clone(document);
      result.courses[0].modules[0].lessons[0].microsequences = [];
      return result;
    })(),
    part
  };
}

function remapNestedIds(value, suffix) {
  const ids = new Set();
  const collect = (entry) => {
    if (Array.isArray(entry)) return entry.forEach(collect);
    if (!entry || typeof entry !== "object") return;
    if (typeof entry.id === "string") ids.add(entry.id);
    Object.values(entry).forEach(collect);
  };
  collect(value);
  const replacements = new Map([...ids].map((id) => [id, `${id}-${suffix}`]));
  const replace = (entry) => {
    if (typeof entry === "string") return replacements.get(entry) || entry;
    if (Array.isArray(entry)) return entry.map(replace);
    if (!entry || typeof entry !== "object") return entry;
    return Object.fromEntries(Object.entries(entry).map(([key, nested]) => [
      replacements.get(key) || key,
      replace(nested)
    ]));
  };
  return replace(value);
}

function multiPartFixture(document) {
  const complete = clone(document);
  const course = complete.courses[0];
  const moduleValue = course.modules[0];
  const firstLesson = moduleValue.lessons[0];
  const secondLesson = remapNestedIds(firstLesson, "continuation");
  secondLesson.title = "Lição de continuidade";
  moduleValue.lessons.push(secondLesson);

  const toPart = (lesson) => {
    const part = {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequences: authoringMicrosequences(lesson.microsequences).map((microsequence) => ({
        ...microsequence,
        status: "generated"
      }))
    };
    partStructures.set(part, {
      course: { id: course.id, title: course.title, goal: course.goal },
      module: { id: moduleValue.id, title: moduleValue.title, guide: clone(moduleValue.guide) },
      lesson: {
        id: lesson.id,
        title: lesson.title,
        guide: clone(lesson.guide),
        topics: clone(lesson.topics)
      }
    });
    return part;
  };
  const parts = [toPart(firstLesson), toPart(secondLesson)];
  const project = clone(complete);
  for (const projectModule of project.courses[0].modules) {
    for (const lesson of projectModule.lessons) lesson.microsequences = [];
  }
  return { complete, project, parts };
}

function planPartFixture(part, { key = "lesson-01", title = "Lição 1" } = {}) {
  const microsequenceIds = part.microsequences.map((item) => item.id);
  const hierarchy = partStructures.get(part);
  if (!hierarchy) throw new Error("Estrutura da fixture de parte não registrada.");
  return {
    key,
    title,
    boundary: "Produzir somente as microssequências reservadas.",
    cutReason: "A parte coincide com o limite da lição.",
    dependsOnPartKeys: [],
    ownership: {
      courseId: part.courseId,
      moduleId: part.moduleId,
      lessonId: part.lessonId,
      microsequenceIds
    },
    structure: {
      course: clone(hierarchy.course),
      module: clone(hierarchy.module),
      lesson: clone(hierarchy.lesson),
      microsequences: part.microsequences.map((microsequence) => ({
        id: microsequence.id,
        title: microsequence.title,
        goal: microsequence.goal,
        role: microsequence.role,
        status: "planned",
        dependsOn: clone(microsequence.dependsOn || []),
        dependencyRationale: Object.fromEntries(
          (microsequence.dependsOn || []).map((dependency) => [dependency, "Dependência causal planejada."])
        ),
        covers: clone(microsequence.covers || []),
        checks: clone(microsequence.checks || []),
        errors: clone(microsequence.errors || [])
      }))
    },
    cardPlan: part.microsequences.flatMap((microsequence) => {
      const exercises = microsequence.cards.filter((card) => card.kind === "exercise");
      let exerciseIndex = 0;
      return microsequence.cards.map((card, index) => {
        const isExercise = card.kind === "exercise";
        const currentExerciseIndex = isExercise ? exerciseIndex++ : -1;
        return {
          cardId: card.id,
          microsequenceId: microsequence.id,
          position: index + 1,
          resource: card.resource,
          kind: card.kind,
          exercise: card.exercise,
          purpose: "Cumprir o objetivo da parte.",
          evidence: "Verificação pela resposta registrada no card.",
          outcomeIds: ["outcome-1"],
          operationId: `${microsequence.id}-operation`,
          conceptIds: ["concept-1"],
          retrievedConceptIds: isExercise ? ["concept-1"] : [],
          misconceptionIds: isExercise ? ["misconception-1"] : [],
          learningFunction: isExercise
            ? exercises.length === 1 || currentExerciseIndex > 0
              ? "independent_practice"
              : "guided_practice"
            : "worked_example",
          resourceRationale: "Recurso previsto no planejamento.",
          contextAnchors: isExercise ? ["conjunção"] : [],
          sourceIds: [],
          claimIds: [],
          introducedTermIds: [],
          requiredTermIds: [],
          ...(isExercise ? {
            targetError: "Confundir a regra apresentada.",
            variationFocus: `Aplicar a mesma regra na prática ${currentExerciseIndex + 1}.`
          } : {})
        };
      });
    }),
    conceptIds: ["concept-1"],
    operationIds: microsequenceIds.map((microsequenceId) => `${microsequenceId}-operation`),
    misconceptionIds: ["misconception-1"],
    allowedSourceIds: [],
    availableTermIds: [],
    preserve: []
  };
}

function partOutlineFixture(specification, outcomeIds = ["outcome-1"]) {
  return {
    key: specification.key,
    title: specification.title,
    boundary: specification.boundary,
    cutReason: specification.cutReason,
    dependsOnPartKeys: clone(specification.dependsOnPartKeys || []),
    ownership: clone(specification.ownership),
    cardIds: specification.cardPlan.map((card) => card.cardId),
    outcomeIds: clone(outcomeIds),
    conceptIds: clone(specification.conceptIds || ["concept-1"]),
    operationIds: clone(
      specification.operationIds
        || [...new Set(specification.cardPlan.map((card) => card.operationId))]
    ),
    misconceptionIds: clone(specification.misconceptionIds || ["misconception-1"])
  };
}

test("especificação aceita o mesmo contorno devolvido por jsonb com chaves reordenadas", async () => {
  const { project, part } = partFixture(await fixture());
  const specification = {
    ...planPartFixture(part),
    outcomeIds: ["outcome-1"]
  };
  const outline = partOutlineFixture(specification);
  const persistedOutline = Object.fromEntries(Object.entries(outline).reverse());
  persistedOutline.ownership = Object.fromEntries(
    Object.entries(persistedOutline.ownership).reverse()
  );

  const result = validatePartSpecificationPayload({
    requestId: "specification-jsonb-order-0001",
    planHash: "a".repeat(64),
    specification
  }, { partKey: specification.key }, {
    nextPart: {
      partKey: specification.key,
      position: 0,
      outline: persistedOutline
    },
    plan: {
      project,
      operations: specification.operationIds.map((id) => operationFixture(
        id,
        specification.cardPlan
          .filter((card) => card.operationId === id)
          .map((card) => card.resource)
      )),
      misconceptions: specification.misconceptionIds.map((id) => ({ id })),
      conceptMap: {
        concepts: specification.conceptIds.map((id) => ({ id })),
        relations: []
      },
      ledger: { sources: [], claims: [], terms: [] }
    },
    continuity: {},
    parts: []
  });

  assert.deepEqual(result.specification.outcomeIds, ["outcome-1"]);
  assert.throws(() => validatePartSpecificationPayload({
    requestId: "specification-jsonb-order-0002",
    planHash: "a".repeat(64),
    specification: { ...specification, title: "Outro título" }
  }, { partKey: specification.key }, {
    nextPart: {
      partKey: specification.key,
      position: 0,
      outline: persistedOutline
    },
    plan: {
      project,
      operations: specification.operationIds.map((id) => operationFixture(
        id,
        specification.cardPlan
          .filter((card) => card.operationId === id)
          .map((card) => card.resource)
      )),
      misconceptions: specification.misconceptionIds.map((id) => ({ id })),
      conceptMap: {
        concepts: specification.conceptIds.map((id) => ({ id })),
        relations: []
      },
      ledger: { sources: [], claims: [], terms: [] }
    }
  }), (error) => error?.code === "part_outline_mismatch");
});

function planFixture(runId, project, parts, extra = {}) {
  const course = project.courses[0];
  return {
    artifact: "aralearn.course-plan",
    version: 1,
    runId,
    project,
    ledgerManifest: {
      artifact: "aralearn.course-ledger-manifest",
      version: 1,
      runId,
      sections: {
        sources: { chunkCount: 0, itemCount: 0 },
        claims: { chunkCount: 0, itemCount: 0 },
        terms: { chunkCount: 0, itemCount: 0 }
      },
      openIssues: []
    },
    course: {
      id: course.id,
      title: course.title,
      goal: course.goal,
      audience: "Estudantes do tema.",
      prerequisites: [],
      depth: "Fundamentos com prática guiada.",
      language: "pt-BR",
      include: ["Conteúdo previsto no esqueleto."],
      exclude: ["Conteúdo fora do objetivo."],
      notation: ["Manter a notação do esqueleto."],
      modules: course.modules.map((moduleValue) => ({
        id: moduleValue.id,
        title: moduleValue.title,
        goal: moduleValue.guide.goal,
        lessonIds: moduleValue.lessons.map((lesson) => lesson.id)
      }))
    },
    learningOutcomes: [{
      id: "outcome-1",
      statement: "Demonstrar o resultado de aprendizagem planejado.",
      evidence: "Concluir a prática prevista na parte."
    }],
    operations: [...new Map(
      parts
        .flatMap((part) => part.cardPlan
          ? part.cardPlan.map((card) => ({
            operationId: card.operationId,
            resource: card.resource
          }))
          : (part.operationIds || []).map((operationId) => ({
            operationId,
            resource: "paragraph"
          })))
        .map(({ operationId }) => [operationId, operationFixture(
          operationId,
          parts.flatMap((part) => (part.cardPlan || [])
            .filter((card) => card.operationId === operationId)
            .map((card) => card.resource))
        )])
    ).values()],
    misconceptions: [{
      id: "misconception-1",
      statement: "Aplicar uma regra incompatível com o caso.",
      correctionEvidence: "A resposta deve aplicar a operação declarada aos dados visíveis."
    }],
    conceptMap: {
      concepts: [{ id: "concept-1", label: "Conceito central" }],
      relations: []
    },
    parts: parts.map((part) => part.cardPlan ? partOutlineFixture(part) : clone(part)),
    acceptanceCriteria: ["Todas as partes devem cumprir o contrato e o plano."],
    ...extra
  };
}

function sourcedPlanFixture(runId, project, specifications) {
  const sourceId = "source-authoring-cycle";
  const claimId = "claim-authoring-cycle";
  const termId = "term-authoring-cycle";
  const firstCardId = specifications[0].cardPlan[0].cardId;
  const requiredCardId = specifications[1].cardPlan[0].cardId;
  specifications.forEach((specification, index) => {
    specification.allowedSourceIds = [sourceId];
    specification.availableTermIds = [termId];
    specification.cardPlan[0] = {
      ...specification.cardPlan[0],
      sourceIds: [sourceId],
      claimIds: [claimId],
      introducedTermIds: index === 0 ? [termId] : [],
      requiredTermIds: index === 1 ? [termId] : []
    };
  });
  specifications[1].dependsOnPartKeys = [specifications[0].key];
  const plan = planFixture(runId, project, specifications, {
    ledgerManifest: {
      artifact: "aralearn.course-ledger-manifest",
      version: 1,
      runId,
      sections: {
        sources: { chunkCount: 1, itemCount: 1 },
        claims: { chunkCount: 1, itemCount: 1 },
        terms: { chunkCount: 1, itemCount: 1 }
      },
      openIssues: []
    }
  });
  return {
    plan,
    chunks: {
      sources: [{
        sourceId,
        title: "Documentação de referência",
        kind: "documentation",
        locator: "https://example.test/reference",
        excerpt: "A conjunção exige que as duas proposições sejam verdadeiras.",
        stability: "versioned",
        author: "Equipe editorial",
        publishedOn: "2026-07-01",
        publishedVersion: "1.0",
        accessedOn: "2026-07-22",
        usageTerms: "Uso educacional permitido.",
        usageNotes: "Trecho usado para verificar o ciclo automatizado."
      }],
      claims: [{
        claimId,
        statement: "A conjunção é verdadeira somente quando ambas as parcelas são verdadeiras.",
        sourceIds: [sourceId],
        support: "A tabela-verdade da conjunção contém uma única linha verdadeira.",
        confidence: "high",
        allowedPartKeys: specifications.map((specification) => specification.key)
      }],
      terms: [{
        termId,
        form: "conjunção",
        language: "pt-BR",
        explanation: "Operação lógica verdadeira quando as duas proposições são verdadeiras.",
        gloss: "P e Q",
        firstTeachingCardId: firstCardId,
        requiredByCardIds: [requiredCardId],
        sourceIds: [sourceId]
      }]
    },
    ids: { sourceId, claimId, termId }
  };
}

function createRunBody(requestId, title = "Curso") {
  return {
    requestId,
    target: "catalog",
    title,
    contractKey: "course-fixture-minimal",
    publicationIntent: { mode: "create" }
  };
}

async function finalizeEmptyLedger(handler, runId, options = {}) {
  const pending = (await invoke(handler, `/v1/runs/${runId}/next-part`, options)).json.data;
  assert.equal(pending.action, "upload_ledger");
  const finalized = await invoke(handler, `/v1/runs/${runId}/plan/finalize`, {
    ...options,
    method: "POST",
    body: {
      requestId: options.requestId || `finalize-ledger-${runId.slice(0, 8)}`,
      planHash: pending.planHash
    }
  });
  assert.equal(finalized.response.status, 200, JSON.stringify(finalized.json));
  assert.equal(finalized.json.data.nextAction, "specify_part");
  assert.equal(finalized.json.data.nextActionPayload.action, "specify_part");
  return finalized.json.data;
}

async function specifyPart(handler, runId, specification, options = {}) {
  let outline = (await invoke(handler, `/v1/runs/${runId}/next-part`, options)).json.data;
  if (outline.action === "upload_ledger") {
    await finalizeEmptyLedger(handler, runId, {
      ...options,
      requestId: `finalize-${specification.key}-0001`
    });
    outline = (await invoke(handler, `/v1/runs/${runId}/next-part`, options)).json.data;
  }
  assert.equal(outline.action, "specify_part");
  const result = await invoke(handler, `/v1/runs/${runId}/parts/${specification.key}/specification`, {
    ...options,
    method: "PUT",
    body: {
      requestId: options.requestId || `specify-${specification.key}-0001`,
      planHash: outline.planHash,
      specification: { ...clone(specification), outcomeIds: clone(outline.outcomeIds) }
    }
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.json));
  assert.equal(result.json.data.nextAction, "build_part");
  assert.equal(result.json.data.nextActionPayload.action, "build_part");
  return (await invoke(handler, `/v1/runs/${runId}/next-part`, options)).json.data;
}

function submissionBody(specification, {
  requestId,
  fragment,
  mode = specification.mode,
  stateDelta = EMPTY_STATE_DELTA,
  evidence = []
}) {
  return {
    artifact: "aralearn.part-submission",
    version: 1,
    runId: specification.runId,
    partKey: specification.partKey,
    requestId,
    mode,
    attempt: specification.attempt,
    baseLedgerSha256: specification.baseLedgerSha256,
    fragment,
    evidence,
    stateDelta
  };
}

function auditBody(runId, partKey, submission, {
  requestId,
  decision,
  gates = PASSING_GATES,
  findings = [],
  instructions = ""
}) {
  return {
    artifact: "aralearn.part-audit",
    version: 1,
    runId,
    partKey,
    requestId,
    attempt: submission.attempt,
    submissionSha256: submission.fragmentHash,
    submissionReadReceipt: submission.submissionReadReceipt,
    decision,
    gates,
    findings,
    ...(instructions ? { instructions } : {})
  };
}

function auditFinding(issueId, gate = "outcomeCoverage") {
  return {
    issueId,
    severity: "error",
    gate,
    pointer: "/microsequences/0/cards/0",
    observed: "O conteúdo não atende ao critério examinado.",
    requiredChange: "Corrigir somente o problema indicado.",
    preserveFields: ["/courseId", "/moduleId", "/lessonId"],
    acceptanceTest: "A nova entrega atende ao critério sem alterar a propriedade reservada."
  };
}

function reopenPartBody(runId, partKey, submission, {
  requestId,
  decision = "repair",
  findings = [auditFinding("final-validation-failure", "contract")],
  instructions = ""
}) {
  return {
    artifact: "aralearn.final-validation-repair",
    version: 1,
    runId,
    partKey,
    requestId,
    attempt: submission.attempt,
    submissionSha256: submission.fragmentHash,
    decision,
    findings,
    ...(instructions ? { instructions } : {})
  };
}

test("rotas reconhecem o caminho direto e os prefixos exatos do gateway Supabase", () => {
  assert.equal(normalizeAuthoringPath("/v1/runs"), "/v1/runs");
  assert.equal(
    normalizeAuthoringPath("/aralearn-authoring-api/v1/runs"),
    "/v1/runs"
  );
  assert.equal(
    normalizeAuthoringPath("/functions/v1/aralearn-authoring-api/v1/runs/"),
    "/v1/runs"
  );
  assert.equal(
    normalizeAuthoringPath("/outra-funcao/aralearn-authoring-api/v1/runs"),
    "/outra-funcao/aralearn-authoring-api/v1/runs"
  );
});

test("API exige autenticação, origem permitida e separa autor de publicador", async () => {
  const document = await fixture();
  const adapter = new MemoryAuthoringAdapter(document);
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const missing = await invoke(handler, "/v1/runs", {
    method: "POST",
    credential: "",
    body: createRunBody("request-auth-1")
  });
  assert.equal(missing.response.status, 401);
  assert.equal(missing.json.error.code, "authentication_required");

  const origin = await invoke(handler, "/v1/runs", {
    method: "POST",
    origin: "https://intruso.example",
    body: createRunBody("request-auth-2")
  });
  assert.equal(origin.response.status, 403);
  assert.equal(origin.json.error.code, "origin_not_allowed");

  const limitedKey = await invoke(handler, "/v1/runs", {
    method: "POST",
    credential: LIMITED_API_KEY,
    body: createRunBody("request-auth-3")
  });
  assert.equal(limitedKey.response.status, 200);
  const limitedPublish = await invoke(handler, `/v1/runs/${limitedKey.json.data.runId}/publish`, {
    method: "POST",
    credential: LIMITED_API_KEY,
    body: { requestId: "request-auth-5" }
  });
  assert.equal(limitedPublish.response.status, 403);
  assert.equal(limitedPublish.json.error.code, "insufficient_scope");

  const studentJwt = await invoke(handler, "/v1/imports", {
    method: "POST",
    credential: "jwt-student",
    body: { requestId: "request-auth-4", target: "catalog", document }
  });
  assert.equal(studentJwt.response.status, 403);
  assert.equal(studentJwt.json.error.code, "insufficient_scope");

  const apiKeyImport = await invoke(handler, "/v1/imports", {
    method: "POST",
    credential: API_KEY,
    body: { requestId: "request-auth-6", target: "catalog", document }
  });
  assert.equal(apiKeyImport.response.status, 403);
  assert.equal(apiKeyImport.json.error.code, "manual_import_requires_session");
});

test("API rejeita autenticação ambígua e requestId reutilizado em outra rota", async () => {
  const adapter = new MemoryAuthoringAdapter(await fixture());
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const ambiguous = await handler(new Request("https://example.test/v1/runs", {
    method: "GET",
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${API_KEY}`,
      "X-AraLearn-API-Key": API_KEY
    }
  }));
  assert.equal(ambiguous.status, 400);
  assert.equal((await ambiguous.json()).error.code, "ambiguous_authentication");

  const requestId = "route-bound-request-0001";
  const created = await invoke(handler, "/v1/runs", {
    method: "POST",
    body: createRunBody(requestId)
  });
  assert.equal(created.response.status, 200);
  const reused = await invoke(handler, `/v1/runs/${created.json.data.runId}/block`, {
    method: "POST",
    body: {
      requestId,
      reason: "Aguardar uma decisão editorial.",
      questions: ["Qual recorte deve ser usado?"]
    }
  });
  assert.equal(reused.response.status, 422);
  assert.equal(reused.json.error.code, "request_id_reused");
});

test("comprovante de releitura é assinado, temporário e vinculado à identidade", async () => {
  const jwtPrincipal = {
    actorId: "11111111-1111-4111-8111-111111111111",
    clientId: null,
    authenticationKind: "jwt"
  };
  const apiPrincipal = {
    ...jwtPrincipal,
    clientId: "22222222-2222-4222-8222-222222222222",
    authenticationKind: "api_key"
  };
  const claims = {
    secret: TEST_RECEIPT_SECRET,
    principal: jwtPrincipal,
    runId: "33333333-3333-4333-8333-333333333333",
    partKey: "parte-1",
    attempt: 2,
    submissionSha256: "a".repeat(64),
    nowMs: 1_000_000,
    ttlSeconds: 300
  };
  const receipt = await issueSubmissionReadReceipt(claims);
  assert.match(receipt, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const verified = await verifySubmissionReadReceipt(receipt, claims);
  assert.equal(verified.actorUserId, jwtPrincipal.actorId);
  assert.equal(verified.apiClientId, null);
  const [receiptPayload, receiptSignature] = receipt.split(".");
  const forgedReceipt = `${receiptPayload}.${receiptSignature[0] === "A" ? "B" : "A"}${receiptSignature.slice(1)}`;

  await assert.rejects(
    verifySubmissionReadReceipt(forgedReceipt, claims),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_submission_read_receipt"
  );
  await assert.rejects(
    verifySubmissionReadReceipt(receipt, { ...claims, principal: apiPrincipal }),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_submission_read_receipt"
  );
  await assert.rejects(
    verifySubmissionReadReceipt(receipt, { ...claims, nowMs: 1_301_000 }),
    (error) => error instanceof AuthoringApiError
      && error.code === "submission_read_receipt_expired"
  );
});

test("plano e ledger exigem escopo antes de ler ou interpretar corpo grande", async () => {
  const adapter = new MemoryAuthoringAdapter(await fixture());
  adapter.resolvePrincipal = async () => ({
    actorId: "reader",
    clientId: "reader-client",
    authenticationKind: "api_key",
    scopes: ["authoring:read"]
  });
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  for (const path of [
    "/v1/runs/11111111-1111-4111-8111-111111111111/plan",
    "/v1/runs/11111111-1111-4111-8111-111111111111/ledger/sources/0"
  ]) {
    const response = await handler(new Request(`https://example.test${path}`, {
      method: "PUT",
      headers: {
        Origin: ORIGIN,
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: "{"
    }));
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.error.code, "insufficient_scope");
  }
});

test("leitura interrompe corpo transmitido assim que o limite é ultrapassado", async () => {
  let pulls = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new TextEncoder().encode(`"${"x".repeat(40)}"`));
      if (pulls >= 20) controller.close();
    }
  });
  const request = new Request("https://example.test/v1/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half"
  });
  await assert.rejects(
    readJsonBody(request, 100),
    (error) => error instanceof AuthoringApiError
      && error.status === 413
      && error.code === "payload_too_large"
  );
  assert.ok(pulls < 20, `o leitor consumiu ${pulls} blocos`);
});

test("Actions aplicam orçamento ao plano, resumo, próxima parte e submissão", async () => {
  const document = await fixture();
  const adapter = new MemoryAuthoringAdapter(document);
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const created = await invoke(handler, "/v1/runs", {
    method: "POST",
    body: createRunBody("budget-create-0001")
  });
  const runId = created.json.data.runId;

  adapter.listRuns = async () => ({
    items: Array.from({ length: 100 }, (_, index) => ({
      runId: `run-${index}`,
      title: "x".repeat(1000)
    })),
    nextCursor: null
  });
  const largeList = await invoke(handler, "/v1/runs?limit=100");
  assert.equal(largeList.response.status, 422);
  assert.equal(largeList.json.error.code, "run_list_too_large");

  const oversizedPlan = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: {
      requestId: "budget-plan-0001",
      plan: { padding: "x".repeat(100 * 1024) }
    }
  });
  assert.equal(oversizedPlan.response.status, 413);
  assert.equal(oversizedPlan.json.error.code, "payload_too_large");

  adapter.getRunSummary = async () => ({
    runId,
    title: "Resumo",
    brief: { padding: "x".repeat(70 * 1024) },
    parts: [{
      partKey: "p1",
      latestAudit: {
        attempt: 1,
        decision: "repair",
        findings: { findings: Array.from({ length: 200 }, () => ({ message: "x".repeat(500) })) }
      }
    }]
  });
  const compactSummary = await invoke(handler, `/v1/runs/${runId}`);
  assert.equal(compactSummary.response.status, 200, JSON.stringify(compactSummary.json));
  assert.equal(compactSummary.json.data.compact, true);
  assert.equal(compactSummary.json.data.brief, undefined);
  assert.equal(compactSummary.json.data.parts[0].latestAudit.findingCount, 200);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(compactSummary.json.data)).byteLength
      < ACTION_RESPONSE_BODY_LIMIT
  );

  adapter.getRunSummary = async () => ({
    runId,
    parts: Array.from({ length: 256 }, (_, index) => ({
      partKey: `p-${index}`,
      title: "x".repeat(500)
    }))
  });
  const largeSummary = await invoke(handler, `/v1/runs/${runId}`);
  assert.equal(largeSummary.response.status, 422);
  assert.equal(largeSummary.json.error.code, "run_summary_too_large");

  adapter.getNextPart = async () => ({
    runId,
    plan: { learningOutcomes: [], ledger: { sources: [], claims: [], terms: [], openIssues: [] } },
    nextPart: {
      partKey: "p1",
      title: "x".repeat(100 * 1024),
      status: "planned",
      attempt: 0,
      specification: { key: "p1", ownership: {}, cardPlan: [] }
    },
    parts: []
  });
  const largeNext = await invoke(handler, `/v1/runs/${runId}/next-part`);
  assert.equal(largeNext.response.status, 422);
  assert.equal(largeNext.json.error.code, "part_context_too_large");

  adapter.getPartSubmission = async () => ({
    runId,
    partKey: "p1",
    attempt: 1,
    fragmentHash: "a".repeat(64),
    specification: { padding: "s".repeat(35 * 1024) },
    fragment: { padding: "f".repeat(60 * 1024) }
  });
  const largeSubmission = await invoke(handler, `/v1/runs/${runId}/parts/p1/submission`);
  assert.equal(largeSubmission.response.status, 422);
  assert.equal(largeSubmission.json.error.code, "submission_context_too_large");
  const jwtSubmission = await invoke(handler, `/v1/runs/${runId}/parts/p1/submission`, {
    credential: "jwt-owner"
  });
  assert.equal(jwtSubmission.response.status, 200);
});

test("adaptador distingue JWT e API key, resume a chave e expõe rate limit como 429", async () => {
  const requests = [];
  let rateLimited = false;
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "33333333-3333-4333-8333-333333333333" }), {
        status: 200
      });
    }
    const payload = JSON.parse(init.body);
    if (rateLimited) {
      return new Response(JSON.stringify({ status: "rate_limited", active: true, scopes: [] }), {
        status: 200
      });
    }
    return new Response(JSON.stringify({
      active: true,
      actorId: payload.p_user_id || "44444444-4444-4444-8444-444444444444",
      clientId: payload.p_user_id ? null : "55555555-5555-4555-8555-555555555555",
      scopes: ["authoring:read"]
    }), { status: 200 });
  };
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    fetchImpl,
    attempts: 1
  });

  const jwtPrincipal = await adapter.resolvePrincipal({ kind: "jwt", credential: "jwt-value" });
  assert.equal(jwtPrincipal.actorId, "33333333-3333-4333-8333-333333333333");
  assert.equal(requests[0].init.headers.Authorization, "Bearer jwt-value");

  requests.length = 0;
  const keyPrincipal = await adapter.resolvePrincipal({ kind: "api_key", credential: API_KEY });
  assert.equal(keyPrincipal.clientId, "55555555-5555-4555-8555-555555555555");
  const resolverPayload = JSON.parse(requests[0].init.body);
  assert.match(resolverPayload.p_api_key_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(resolverPayload.p_api_key_hash, API_KEY);
  assert.equal(requests[0].init.headers.apikey, "server-secret");
  assert.equal("Authorization" in requests[0].init.headers, false);

  rateLimited = true;
  await assert.rejects(
    adapter.resolvePrincipal({ kind: "api_key", credential: API_KEY }),
    (error) => error instanceof AuthoringApiError && error.status === 429 && error.code === "rate_limited"
  );
});

test("adaptador distingue chave revogada de credencial sem autorização", async () => {
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      code: "28000",
      message: "Credencial de autoria inválida."
    }), { status: 403 })
  });

  await assert.rejects(
    adapter.resolvePrincipal({ kind: "api_key", credential: API_KEY }),
    (error) => error instanceof AuthoringApiError
      && error.status === 401
      && error.code === "invalid_client"
  );
});

test("adaptador limita espera remota e resposta 429 informa quando tentar novamente", async () => {
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    requestTimeoutMs: 15,
    attempts: 1,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
    })
  });
  await assert.rejects(
    adapter.rpc("get_authoring_run", { p_run_id: "run" }),
    (error) => error instanceof AuthoringApiError
      && error.status === 503
      && error.code === "service_timeout"
  );

  const rateLimitedHandler = createAuthoringHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolvePrincipal() {
        throw new AuthoringApiError(429, "rate_limited", "Limite temporário atingido.");
      }
    }
  });
  const response = await rateLimitedHandler(new Request("https://example.test/v1/runs", {
    headers: { Origin: ORIGIN, Authorization: `Bearer ${API_KEY}` }
  }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");

  const startedAt = Date.now();
  const slowerFinalizer = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    requestTimeoutMs: 5,
    publicationFinalizeTimeoutMs: 100,
    attempts: 1,
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return new Response(JSON.stringify({ status: "published" }), { status: 200 });
    }
  });
  const finalized = await slowerFinalizer.rpc(
    "finalize_authoring_official_course_import",
    {},
    { timeoutMs: slowerFinalizer.publicationFinalizeTimeoutMs }
  );
  assert.equal(finalized.status, "published");
  assert.ok(Date.now() - startedAt >= 20);

  const unavailable = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 2,
    requestTimeoutMs: 20,
    fetchImpl: async () => { throw new TypeError("network down"); }
  });
  await assert.rejects(
    unavailable.rpc("get_authoring_run", { p_run_id: "run" }),
    (error) => error instanceof AuthoringApiError
      && error.status === 503
      && error.code === "service_unavailable"
  );

  const sensitiveDatabaseMessage = "duplicate key on private.secret_table constraint secret_token_uidx";
  const opaqueFailure = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      code: "XX000",
      message: sensitiveDatabaseMessage
    }), { status: 500 })
  });
  await assert.rejects(
    opaqueFailure.rpc("get_authoring_run", { p_run_id: "run" }),
    (error) => error instanceof AuthoringApiError
      && error.status === 503
      && error.code === "service_unavailable"
      && error.message === "O serviço de autoria está temporariamente indisponível."
      && !error.message.includes(sensitiveDatabaseMessage)
  );

  for (const [databaseCode, sqlMessage] of [
    ["23505", "duplicate key violates constraint private_authoring_secret_uidx"],
    ["23514", "new row violates check constraint authoring_hidden_payload_check"],
    ["42501", "permission denied for table private.authoring_runs"]
  ]) {
    const sanitizedFailure = new SupabaseAuthoringAdapter({
      supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
      publishableKey: "public-key",
      attempts: 1,
      fetchImpl: async () => new Response(JSON.stringify({
        code: databaseCode,
        message: sqlMessage
      }), { status: 400 })
    });
    await assert.rejects(
      sanitizedFailure.rpc("apply_authoring_command", {}),
      (error) => error instanceof AuthoringApiError
        && !error.message.includes(sqlMessage)
        && !/private|constraint|table/i.test(error.message)
        && (databaseCode !== "23514"
          || (error.details?.sqlState === "23514"
            && error.details?.reason === "structural_violation"))
    );
  }

  const actionableValidationFailure = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      code: "22023",
      message: "O guia didático exige goal, include, exclude, notation e avoid."
    }), { status: 400 })
  });
  await assert.rejects(
    actionableValidationFailure.rpc("apply_authoring_command", {}),
    (error) => error instanceof AuthoringApiError
      && error.status === 422
      && error.code === "invalid_command"
      && error.message === "O guia didático exige goal, include, exclude, notation e avoid."
      && error.details?.sqlState === "22023"
      && error.details?.reason === "invalid_parameter"
  );

  const actionableStructureFailure = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      code: "23514",
      message: "A microssequência deve começar por fundamento ou exemplo resolvido."
    }), { status: 400 })
  });
  await assert.rejects(
    actionableStructureFailure.rpc("apply_authoring_command", {}),
    (error) => error instanceof AuthoringApiError
      && error.status === 422
      && error.code === "invalid_command"
      && error.message === "A microssequência deve começar por fundamento ou exemplo resolvido."
      && error.details?.sqlState === "23514"
      && error.details?.reason === "structural_violation"
  );

  for (const [httpStatus, databaseCode, expectedStatus, expectedCode] of [
    [409, "55P03", 503, "publication_lease_unavailable"],
    [409, "40001", 409, "stale_authoring_state"],
    [400, "AR409", 409, "course_incomplete"],
    [400, "AR422", 422, "collection_unavailable"],
    [408, "", 503, "service_timeout"]
  ]) {
    const databaseConflict = new SupabaseAuthoringAdapter({
      supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
      publishableKey: "public-key",
      attempts: 1,
      fetchImpl: async () => new Response(JSON.stringify({
        code: databaseCode,
        message: "Estado concorrente."
      }), { status: httpStatus })
    });
    await assert.rejects(
      databaseConflict.rpc("claim_authoring_publication", {}),
      (error) => error instanceof AuthoringApiError
        && error.status === expectedStatus
      && error.code === expectedCode
    );
  }

  let committedLeaseToken = null;
  let claimAttempts = 0;
  const lostClaimResponse = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 2,
    fetchImpl: async (_url, init) => {
      claimAttempts += 1;
      const payload = JSON.parse(init.body);
      if (claimAttempts === 1) {
        committedLeaseToken = payload.p_lease_token;
        throw new TypeError("a resposta se perdeu depois do commit");
      }
      assert.equal(payload.p_lease_token, committedLeaseToken);
      return new Response(JSON.stringify({
        status: "publishing",
        phase: "finalizing",
        leaseAcquired: true,
        idempotent: true
      }), { status: 200 });
    }
  });
  const recoveredClaim = await lostClaimResponse.rpc("claim_authoring_publication", {
    p_run_id: "77777777-7777-4777-8777-777777777777",
    p_actor_id: "owner",
    p_client_id: null,
    p_lease_token: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    p_lease_seconds: 130
  });
  assert.equal(claimAttempts, 2);
  assert.equal(recoveredClaim.leaseAcquired, true);
  assert.equal(recoveredClaim.idempotent, true);
});

test("publicação em andamento responde HTTP 202 para polling", async () => {
  const handler = createAuthoringHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolvePrincipal() {
        return {
          actorId: "owner",
          clientId: "client",
          authenticationKind: "api_key",
          scopes: ["catalog:publish"]
        };
      },
      async getRunAuthorizationSummary() {
        return { publicationTarget: "catalog" };
      },
      async publishRun() {
        return {
          status: "publishing",
          phase: "finalizing",
          runId: "77777777-7777-4777-8777-777777777777",
          percent: 99,
          pollAfterSeconds: 3,
          leaseAcquired: true
        };
      }
    }
  });
  const response = await invoke(
    handler,
    "/v1/runs/77777777-7777-4777-8777-777777777777/publish",
    { method: "POST", body: { requestId: "async-publish-request-001" } }
  );
  assert.equal(response.response.status, 202);
  assert.equal(response.json.data.phase, "finalizing");
  assert.equal(response.json.data.pollAfterSeconds, 3);
});

test("handler propaga um único prazo absoluto até a operação remota", async () => {
  let authenticationDeadline = null;
  let publicationDeadline = null;
  const handler = createAuthoringHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolvePrincipal(_authentication, options) {
        authenticationDeadline = options.deadlineAt;
        return {
          actorId: "owner",
          clientId: null,
          authenticationKind: "jwt",
          scopes: ["catalog:publish"]
        };
      },
      async getRunAuthorizationSummary() {
        return { publicationTarget: "catalog" };
      },
      async publishRun(options) {
        publicationDeadline = options.deadlineAt;
        return { status: "published", runId: options.runId, courseId: "course" };
      }
    }
  });
  const before = Date.now();
  const response = await invoke(
    handler,
    "/v1/runs/77777777-7777-4777-8777-777777777777/publish",
    { method: "POST", body: { requestId: "deadline-publish-request-001" } }
  );
  assert.equal(response.response.status, 200);
  assert.equal(publicationDeadline, authenticationDeadline);
  assert.ok(authenticationDeadline >= before + 39_000);
  assert.ok(authenticationDeadline <= before + 41_000);
});

test("requestId torna a criação idempotente e rejeita reutilização incompatível", async () => {
  const adapter = new MemoryAuthoringAdapter(await fixture());
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const body = createRunBody("request-idempotent-1");
  const first = await invoke(handler, "/v1/runs", { method: "POST", body });
  const second = await invoke(handler, "/v1/runs", { method: "POST", body });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(first.json.data.runId, second.json.data.runId);
  assert.equal(second.json.data.idempotent, true);
  assert.equal(adapter.commandCount, 1);

  const mismatch = await invoke(handler, "/v1/runs", {
    method: "POST",
    body: { ...body, title: "Outro curso" }
  });
  assert.equal(mismatch.response.status, 422);
  assert.equal(mismatch.json.error.code, "request_id_reused");
});

test("idempotência ignora a ordem das chaves do mesmo JSON", async () => {
  const adapter = new MemoryAuthoringAdapter(await fixture());
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const body = createRunBody("request-order-independent-1");
  const reordered = {
    publicationIntent: Object.fromEntries(Object.entries(body.publicationIntent).reverse()),
    contractKey: body.contractKey,
    title: body.title,
    target: body.target,
    requestId: body.requestId
  };

  const first = await invoke(handler, "/v1/runs", { method: "POST", body });
  const second = await invoke(handler, "/v1/runs", { method: "POST", body: reordered });

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(second.json.data.idempotent, true);
  assert.equal(first.json.data.runId, second.json.data.runId);
  assert.equal(adapter.commandCount, 1);
});

test("bloqueio pede decisão ao usuário e a retomada preserva o estado anterior", async () => {
  const adapter = new MemoryAuthoringAdapter(await fixture());
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const created = await invoke(handler, "/v1/runs", {
    method: "POST",
    body: createRunBody("blocked-create-1")
  });
  const runId = created.json.data.runId;
  const blocked = await invoke(handler, `/v1/runs/${runId}/block`, {
    method: "POST",
    body: {
      requestId: "blocked-command-1",
      reason: "A fonte não informa a regra necessária.",
      questions: ["Qual regra deve orientar esta parte?"]
    }
  });
  assert.equal(blocked.response.status, 200);
  assert.equal(blocked.json.data.status, "blocked");
  assert.equal(blocked.json.data.nextAction, "ask_user");

  const run = await invoke(handler, `/v1/runs/${runId}`);
  assert.equal(run.json.data.status, "blocked");
  assert.equal(typeof run.json.requestId, "string");
  assert.ok(run.json.requestId.length > 0);
  assert.equal(adapter.summaryReadCount, 1);
  assert.equal(adapter.fullRunReadCount, 0);
  const resumed = await invoke(handler, `/v1/runs/${runId}/resume`, {
    method: "POST",
    body: { requestId: "blocked-resume-01", resolution: { answer: "Use a regra indicada." } }
  });
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.json.data.status, "planning");
});

test("próxima parte reúne especificação, tentativa e continuidade aprovada", async () => {
  const result = await buildNextPart({
    runId: "11111111-1111-5111-8111-111111111111",
    planHash: "c".repeat(64),
    plan: {
      learningOutcomes: [{
        id: "outcome-1",
        statement: "Aplicar o resultado planejado.",
        evidence: "Resolver a atividade correspondente."
      }],
      conceptMap: { concepts: [{ id: "concept-1", label: "Conceito" }], relations: [] },
      operations: [operationFixture("operation-1")],
      misconceptions: [{
        id: "misconception-1",
        statement: "Erro previsível.",
        correctionEvidence: "A resposta correta refuta o erro."
      }],
      ledger: {
        sources: [{ sourceId: "source-1", title: "Fonte" }],
        claims: [{ claimId: "claim-1", sourceIds: ["source-1"], allowedPartKeys: ["parte-2"] }],
        terms: [{ termId: "term-1", sourceIds: ["source-1"] }],
        openIssues: ["Conferir a notação."]
      }
    },
    nextPart: {
      partKey: "parte-2",
      position: 1,
      title: "Parte 2",
      status: "repair_required",
      attempt: 2,
      specification: {
        key: "parte-2",
        ownership: { courseId: "c", moduleId: "m", lessonId: "l", microsequenceIds: ["ms-2"] },
        boundary: "Limite",
        cutReason: "Coesão",
        structure: {},
        cardPlan: [{ sourceIds: ["source-1"], introducedTermIds: ["term-1"], requiredTermIds: [] }],
        allowedSourceIds: ["source-1"],
        availableTermIds: ["term-1"],
        outcomeIds: ["outcome-1"],
        conceptIds: ["concept-1"],
        operationIds: ["operation-1"],
        misconceptionIds: ["misconception-1"]
      }
    },
    continuity: {
      approvedParts: [{ partKey: "parte-1", fragmentHash: "a".repeat(64) }],
      stateDelta: {
        introducedTermIds: ["term-1"],
        usedClaimIds: ["claim-1"],
        coveredOutcomeIds: ["outcome-1"],
        resolvedErrorIds: [],
        notes: ["Preservar notação."]
      },
      dependencyMicrosequenceIds: ["ms-1"],
      workedOperations: [{ operationId: "operation-1", microsequenceId: "ms-1" }],
      stateHash: "b".repeat(64)
    },
    parts: [{
      partKey: "parte-1",
      position: 0,
      status: "approved",
      fragmentHash: "a".repeat(64),
      submissionMeta: {
        stateDelta: {
          introducedTermIds: ["term-1"],
          usedClaimIds: ["claim-1"],
          coveredOutcomeIds: ["outcome-1"],
          resolvedErrorIds: [],
          notes: ["Preservar notação."]
        }
      }
    }, {
      partKey: "parte-2",
      position: 1,
      status: "repair_required",
      audits: [{ attempt: 2, decision: "repair", findings: { instructions: "Corrigir." } }]
    }]
  });
  assert.equal(result.action, "build_part");
  assert.equal(result.artifact, "aralearn.part-spec");
  assert.equal(result.partKey, "parte-2");
  assert.equal(result.key, "parte-2");
  assert.equal(result.mode, "repair");
  assert.equal(result.attempt, 3);
  assert.match(result.baseLedgerSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.planHash, "c".repeat(64));
  assert.match(result.specificationHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.ledger.sources.map((source) => source.sourceId), ["source-1"]);
  assert.deepEqual(result.ledger.claims.map((claim) => claim.claimId), ["claim-1"]);
  assert.deepEqual(result.ledger.terms.map((term) => term.termId), ["term-1"]);
  assert.deepEqual(result.learningOutcomes.map((outcome) => outcome.id), ["outcome-1"]);
  assert.deepEqual(result.concepts.map((concept) => concept.id), ["concept-1"]);
  assert.deepEqual(result.operations.map((operation) => operation.id), ["operation-1"]);
  assert.deepEqual(result.misconceptions.map((item) => item.id), ["misconception-1"]);
  assert.deepEqual(result.continuity.stateDelta.introducedTermIds, ["term-1"]);
  assert.deepEqual(result.continuity.dependencyMicrosequenceIds, ["ms-1"]);
  assert.deepEqual(result.continuity.workedOperations, [{
    operationId: "operation-1",
    microsequenceId: "ms-1"
  }]);
  assert.equal(result.continuity.stateHash, "b".repeat(64));
  assert.equal(result.previousAudit.decision, "repair");
});

test("próxima ação discrimina envio do registro e especificação da parte", async () => {
  const runId = "11111111-1111-5111-8111-111111111111";
  const planHash = "d".repeat(64);
  const ledgerManifest = {
    artifact: "aralearn.course-ledger-manifest",
    version: 1,
    runId,
    sections: {
      sources: { chunkCount: 0, itemCount: 0 },
      claims: { chunkCount: 0, itemCount: 0 },
      terms: { chunkCount: 0, itemCount: 0 }
    },
    openIssues: []
  };
  const ledgerProgress = Object.fromEntries(["sources", "claims", "terms"].map((section) => [
    section,
    {
      expectedChunks: 0,
      expectedItems: 0,
      receivedChunks: 0,
      receivedItems: 0,
      missingPositions: []
    }
  ]));
  const upload = await buildNextPart({
    runId,
    planHash,
    nextAction: "upload_ledger",
    plan: { ledgerManifest },
    ledgerProgress
  });
  assert.equal(upload.action, "upload_ledger");
  assert.equal(upload.artifact, "aralearn.ledger-upload");
  assert.equal(upload.planHash, planHash);
  assert.deepEqual(upload.ledgerProgress, ledgerProgress);

  const outline = {
    key: "part-1",
    title: "Parte 1",
    boundary: "Uma unidade causal.",
    cutReason: "A parte forma uma unidade didática completa.",
    dependsOnPartKeys: [],
    ownership: {
      courseId: "course-1",
      moduleId: "module-1",
      lessonId: "lesson-1",
      microsequenceIds: ["micro-1"]
    },
    cardIds: ["card-1"],
    outcomeIds: ["outcome-1"],
    conceptIds: ["concept-1"],
    operationIds: ["operation-1"],
    misconceptionIds: []
  };
  const specify = await buildNextPart({
    runId,
    planHash,
    brief: { title: "Curso" },
    plan: {
      project: {
        courses: [{
          id: "course-1",
          modules: [{ id: "module-1", lessons: [{ id: "lesson-1" }] }]
        }]
      },
      ledger: { sources: [], claims: [], terms: [], openIssues: [] },
      learningOutcomes: [{
        id: "outcome-1",
        statement: "Aplicar a unidade.",
        evidence: "Responder ao card planejado."
      }],
      conceptMap: { concepts: [{ id: "concept-1", label: "Conceito" }], relations: [] },
      operations: [operationFixture("operation-1")],
      misconceptions: []
    },
    nextPart: { partKey: "part-1", position: 0, outline }
  });
  assert.equal(specify.action, "specify_part");
  assert.equal(specify.artifact, "aralearn.part-outline");
  assert.equal(specify.key, "part-1");
  assert.equal(specify.partKey, "part-1");
  assert.equal(specify.planHash, planHash);
});

test("próxima parte não carrega o ledger global sem relação com a parte", async () => {
  const unrelatedSources = Array.from({ length: 900 }, (_, index) => ({
    sourceId: `unrelated-${index}`,
    title: `Fonte alheia ${index}`,
    excerpt: "x".repeat(500)
  }));
  const result = await buildNextPart({
    runId: "11111111-1111-5111-8111-111111111111",
    planHash: "a".repeat(64),
    plan: {
      project: { courses: [] },
      learningOutcomes: [{ id: "outcome-1", statement: "Resultado", evidence: "Evidência" }],
      conceptMap: { concepts: [{ id: "concept-1", label: "Conceito" }], relations: [] },
      operations: [operationFixture("operation-1")],
      misconceptions: [],
      ledger: {
        sources: [{ sourceId: "source-used", title: "Fonte usada" }, ...unrelatedSources],
        claims: [{ claimId: "claim-used", sourceIds: ["source-used"], allowedPartKeys: ["p1"] }],
        terms: [{
          termId: "term-used",
          sourceIds: ["source-used"],
          firstTeachingPartKey: "p1",
          requiredByPartKeys: ["p1"]
        }],
        openIssues: []
      }
    },
    nextPart: {
      partKey: "p1",
      position: 0,
      title: "Parte",
      status: "planned",
      attempt: 0,
      specification: {
        key: "p1",
        title: "Parte",
        ownership: { courseId: "c", moduleId: "m", lessonId: "l", microsequenceIds: ["ms"] },
        boundary: "Limite",
        cutReason: "Coesão",
        structure: {},
        cardPlan: [{
          cardId: "card-1",
          sourceIds: ["source-used"],
          claimIds: ["claim-used"],
          introducedTermIds: ["term-used"],
          requiredTermIds: []
        }],
        allowedSourceIds: ["source-used"],
        availableTermIds: ["term-used"],
        outcomeIds: ["outcome-1"],
        conceptIds: ["concept-1"],
        operationIds: ["operation-1"],
        misconceptionIds: []
      }
    },
    parts: []
  });
  assert.deepEqual(result.ledger.sources.map((item) => item.sourceId), ["source-used"]);
  assert.deepEqual(result.ledger.claims.map((item) => item.claimId), ["claim-used"]);
  assert.deepEqual(result.ledger.terms.map((item) => item.termId), ["term-used"]);
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).byteLength < ACTION_RESPONSE_BODY_LIMIT);
});

test("plano compacto é aceito e a entrega deve coincidir exatamente com a parte reservada", async () => {
  const document = await fixture();
  const { project, part } = partFixture(document);
  const adapter = new MemoryAuthoringAdapter(document);
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const created = await invoke(handler, "/v1/runs", {
    method: "POST",
    body: createRunBody("large-plan-create")
  });
  const runId = created.json.data.runId;
  const plan = planFixture(runId, project, [planPartFixture(part)]);
  const planned = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "large-plan-submit", plan }
  });
  assert.equal(planned.response.status, 200, JSON.stringify(planned.json));
  const specification = await specifyPart(handler, runId, planPartFixture(part), {
    requestId: "large-plan-specification"
  });

  const foreignDestination = clone(part);
  foreignDestination.courseId = "course-outside-plan";
  const destination = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    body: submissionBody(specification, {
      requestId: "foreign-destination",
      fragment: foreignDestination
    })
  });
  assert.equal(destination.response.status, 422);
  assert.equal(destination.json.error.code, "part_plan_mismatch");

  const changedDependency = clone(part);
  changedDependency.microsequences[0].dependsOn = ["microsequence-invented"];
  const dependency = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    body: submissionBody(specification, {
      requestId: "changed-dependency",
      fragment: changedDependency
    })
  });
  assert.equal(dependency.response.status, 422);
  assert.equal(dependency.json.error.code, "part_plan_mismatch");

  const foreignMicrosequence = clone(part);
  foreignMicrosequence.microsequences[0].id = "microsequence-outside-plan";
  const foreign = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    body: submissionBody(specification, {
      requestId: "foreign-microsequence",
      fragment: foreignMicrosequence,
      stateDelta: { ...EMPTY_STATE_DELTA, coveredOutcomeIds: ["outcome-1"] }
    })
  });
  assert.equal(foreign.response.status, 422);
  assert.equal(foreign.json.error.code, "part_plan_mismatch");

  const missingCard = clone(part);
  missingCard.microsequences[0].cards.pop();
  const missing = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    body: submissionBody(specification, {
      requestId: "missing-planned-card",
      fragment: missingCard,
      stateDelta: { ...EMPTY_STATE_DELTA, coveredOutcomeIds: ["outcome-1"] }
    })
  });
  assert.equal(missing.response.status, 422);
  assert.equal(missing.json.error.code, "part_plan_mismatch");

  const inventedClaim = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    body: submissionBody(specification, {
      requestId: "invented-claim-id",
      fragment: part,
      stateDelta: { ...EMPTY_STATE_DELTA, usedClaimIds: ["claim-invented"] }
    })
  });
  assert.equal(inventedClaim.response.status, 422);
  assert.equal(inventedClaim.json.error.code, "part_continuity_mismatch");

  for (const [field, requestId] of [
    ["introducedTermIds", "invented-term-id"],
    ["coveredOutcomeIds", "invented-outcome-id"],
    ["resolvedErrorIds", "invented-error-id"]
  ]) {
    const invented = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
      method: "PUT",
      body: submissionBody(specification, {
        requestId,
        fragment: part,
        stateDelta: { ...EMPTY_STATE_DELTA, [field]: [`${field}-invented`] }
      })
    });
    assert.equal(invented.response.status, 422);
    assert.equal(invented.json.error.code, "part_continuity_mismatch");
  }

  const inventedSource = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    body: submissionBody(specification, {
      requestId: "invented-source-id",
      fragment: part,
      evidence: [{ sourceId: "source-invented" }]
    })
  });
  assert.equal(inventedSource.response.status, 422);
  assert.equal(inventedSource.json.error.code, "part_continuity_mismatch");

  adapter.runs.get(runId).parts[0].specification.cardPlan[0].resource = "choice";
  const changedPlan = (await invoke(handler, `/v1/runs/${runId}/next-part`)).json.data;
  const changedResource = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    body: submissionBody(changedPlan, {
      requestId: "changed-card-resource",
      fragment: part
    })
  });
  assert.equal(changedResource.response.status, 422);
  assert.equal(changedResource.json.error.code, "part_plan_mismatch");
});

test("simulador percorre duas partes com ledger, falhas recuperáveis e publicação única", async () => {
  const document = await fixture();
  const { project, parts } = multiPartFixture(document);
  const specifications = [
    planPartFixture(parts[0], { key: "part-foundation", title: "Fundamentos" }),
    planPartFixture(parts[1], { key: "part-continuation", title: "Continuidade" })
  ];
  const adapter = new FaultInjectingMemoryAuthoringAdapter(document, {
    before: [["submit_part", "cycle-submit-transient"]],
    after: [
      ["set_plan", "cycle-plan-lost-response"],
      ["put_ledger_chunk", "cycle-source-lost-response"],
      ["finalize_plan", "cycle-finalize-lost-response"],
      ["audit_part", "cycle-audit-lost-response"]
    ]
  });
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });

  const created = await invoke(handler, "/v1/runs", {
    method: "POST",
    body: createRunBody("cycle-create-request", "Curso com duas partes")
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.json));
  const runId = created.json.data.runId;
  const { plan, chunks, ids } = sourcedPlanFixture(runId, project, specifications);
  const planBody = { requestId: "cycle-plan-lost-response", plan };

  const lostPlan = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: planBody
  });
  assert.equal(lostPlan.response.status, 503);
  assert.equal(lostPlan.json.error.code, "response_lost");
  const recoveredPlan = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: planBody
  });
  assert.equal(recoveredPlan.response.status, 200, JSON.stringify(recoveredPlan.json));
  assert.equal(recoveredPlan.json.data.idempotent, true);

  let pending = (await invoke(handler, `/v1/runs/${runId}/next-part`)).json.data;
  assert.equal(pending.action, "upload_ledger");
  assert.equal(pending.ledgerManifest.sections.sources.itemCount, 1);
  const planHash = pending.planHash;

  const earlyFinalize = await invoke(handler, `/v1/runs/${runId}/plan/finalize`, {
    method: "POST",
    body: { requestId: "cycle-finalize-too-early", planHash }
  });
  assert.equal(earlyFinalize.response.status, 422);
  assert.equal(earlyFinalize.json.error.code, "ledger_incomplete");

  const prematureSpecification = clone(specifications[0]);
  prematureSpecification.allowedSourceIds = [];
  prematureSpecification.availableTermIds = [];
  prematureSpecification.cardPlan = prematureSpecification.cardPlan.map((card) => ({
    ...card,
    sourceIds: [],
    claimIds: [],
    introducedTermIds: [],
    requiredTermIds: []
  }));
  const premature = await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-foundation/specification`,
    {
      method: "PUT",
      body: {
        requestId: "cycle-specification-too-early",
        planHash,
        specification: { ...prematureSpecification, outcomeIds: ["outcome-1"] }
      }
    }
  );
  assert.equal(premature.response.status, 409);
  assert.equal(premature.json.error.code, "invalid_state");

  const sourceBody = {
    requestId: "cycle-source-lost-response",
    planHash,
    items: chunks.sources
  };
  const lostSource = await invoke(handler, `/v1/runs/${runId}/ledger/sources/0`, {
    method: "PUT",
    body: sourceBody
  });
  assert.equal(lostSource.response.status, 503);
  assert.equal(lostSource.json.error.code, "response_lost");
  const recoveredSource = await invoke(handler, `/v1/runs/${runId}/ledger/sources/0`, {
    method: "PUT",
    body: sourceBody
  });
  assert.equal(recoveredSource.response.status, 200, JSON.stringify(recoveredSource.json));
  assert.equal(recoveredSource.json.data.idempotent, true);

  for (const section of ["claims", "terms"]) {
    const result = await invoke(handler, `/v1/runs/${runId}/ledger/${section}/0`, {
      method: "PUT",
      body: {
        requestId: `cycle-ledger-${section}-request`,
        planHash,
        items: chunks[section]
      }
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.json));
  }
  const reusedChunk = await invoke(handler, `/v1/runs/${runId}/ledger/sources/0`, {
    method: "PUT",
    body: {
      ...sourceBody,
      items: [{ ...chunks.sources[0], title: "Outra fonte" }]
    }
  });
  assert.equal(reusedChunk.response.status, 422);
  assert.equal(reusedChunk.json.error.code, "request_id_reused");

  const finalizeBody = { requestId: "cycle-finalize-lost-response", planHash };
  const lostFinalize = await invoke(handler, `/v1/runs/${runId}/plan/finalize`, {
    method: "POST",
    body: finalizeBody
  });
  assert.equal(lostFinalize.response.status, 503);
  const recoveredFinalize = await invoke(handler, `/v1/runs/${runId}/plan/finalize`, {
    method: "POST",
    body: finalizeBody
  });
  assert.equal(recoveredFinalize.response.status, 200, JSON.stringify(recoveredFinalize.json));
  assert.equal(recoveredFinalize.json.data.idempotent, true);

  const lateChunk = await invoke(handler, `/v1/runs/${runId}/ledger/sources/0`, {
    method: "PUT",
    body: {
      requestId: "cycle-source-after-finalize",
      planHash,
      items: chunks.sources
    }
  });
  assert.equal(lateChunk.response.status, 409);
  assert.equal(lateChunk.json.error.code, "invalid_state");

  const secondBeforeFirst = await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-continuation/specification`,
    {
      method: "PUT",
      body: {
        requestId: "cycle-second-part-too-early",
        planHash,
        specification: { ...specifications[1], outcomeIds: ["outcome-1"] }
      }
    }
  );
  assert.equal(secondBeforeFirst.response.status, 409);
  assert.equal(secondBeforeFirst.json.error.code, "stale_part_outline");

  let buildContext = await specifyPart(handler, runId, specifications[0], {
    requestId: "cycle-specify-foundation"
  });
  assert.equal(buildContext.partKey, "part-foundation");
  assert.equal(buildContext.ledger.sources[0].publishedVersion, "1.0");
  assert.deepEqual(buildContext.ledger.terms[0].requiredByCardIds, [
    specifications[1].cardPlan[0].cardId
  ]);

  const earlyPublish = await invoke(handler, `/v1/runs/${runId}/publish`, {
    method: "POST",
    body: { requestId: "cycle-publish-too-early" }
  });
  assert.equal(earlyPublish.response.status, 409);
  assert.equal(earlyPublish.json.error.code, "course_incomplete");
  const earlyValidation = await invoke(handler, `/v1/runs/${runId}/validate`, {
    method: "POST",
    body: { requestId: "cycle-validation-too-early" }
  });
  assert.equal(earlyValidation.response.status, 409);
  assert.equal(earlyValidation.json.error.code, "course_incomplete");

  const foundationSubmissionBody = submissionBody(buildContext, {
    requestId: "cycle-submit-transient",
    fragment: parts[0],
    evidence: [{ sourceId: ids.sourceId, claimId: ids.claimId }],
    stateDelta: {
      ...EMPTY_STATE_DELTA,
      introducedTermIds: [ids.termId],
      usedClaimIds: [ids.claimId],
      coveredOutcomeIds: ["outcome-1"]
    }
  });
  const transientSubmission = await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-foundation`,
    { method: "PUT", body: foundationSubmissionBody }
  );
  assert.equal(transientSubmission.response.status, 503, JSON.stringify(transientSubmission.json));
  assert.equal(adapter.runs.get(runId).parts[0].attempt, 0);
  const recoveredSubmission = await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-foundation`,
    { method: "PUT", body: foundationSubmissionBody }
  );
  assert.equal(recoveredSubmission.response.status, 200, JSON.stringify(recoveredSubmission.json));
  assert.equal(recoveredSubmission.json.data.attempt, 1);

  let submitted = (await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-foundation/submission`
  )).json.data;
  const repairAuditBody = auditBody(runId, "part-foundation", submitted, {
    requestId: "cycle-audit-lost-response",
    decision: "repair",
    gates: { ...PASSING_GATES, feedback: false },
    findings: [auditFinding("cycle-repair", "feedback")]
  });
  const lostAudit = await invoke(handler, `/v1/runs/${runId}/parts/part-foundation/audit`, {
    method: "POST",
    body: repairAuditBody
  });
  assert.equal(lostAudit.response.status, 503);
  const recoveredAudit = await invoke(handler, `/v1/runs/${runId}/parts/part-foundation/audit`, {
    method: "POST",
    body: repairAuditBody
  });
  assert.equal(recoveredAudit.response.status, 200, JSON.stringify(recoveredAudit.json));
  assert.equal(recoveredAudit.json.data.idempotent, true);
  assert.equal(adapter.runs.get(runId).parts[0].status, "repair_required");

  buildContext = (await invoke(handler, `/v1/runs/${runId}/next-part`)).json.data;
  assert.equal(buildContext.mode, "repair");
  let response = await invoke(handler, `/v1/runs/${runId}/parts/part-foundation`, {
    method: "PUT",
    body: submissionBody(buildContext, {
      requestId: "cycle-submit-repair",
      mode: "repair",
      fragment: parts[0],
      evidence: [{ sourceId: ids.sourceId, claimId: ids.claimId }],
      stateDelta: {
        ...EMPTY_STATE_DELTA,
        introducedTermIds: [ids.termId],
        usedClaimIds: [ids.claimId],
        coveredOutcomeIds: ["outcome-1"]
      }
    })
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.json));
  submitted = (await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-foundation/submission`
  )).json.data;
  response = await invoke(handler, `/v1/runs/${runId}/parts/part-foundation/audit`, {
    method: "POST",
    body: auditBody(runId, "part-foundation", submitted, {
      requestId: "cycle-audit-rebuild",
      decision: "rebuild",
      gates: { ...PASSING_GATES, planAlignment: false },
      findings: [auditFinding("cycle-rebuild", "planAlignment")]
    })
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.json));
  assert.equal(adapter.runs.get(runId).parts[0].fragment, null);

  buildContext = (await invoke(handler, `/v1/runs/${runId}/next-part`)).json.data;
  assert.equal(buildContext.mode, "rebuild");
  response = await invoke(handler, `/v1/runs/${runId}/parts/part-foundation`, {
    method: "PUT",
    body: submissionBody(buildContext, {
      requestId: "cycle-submit-rebuild",
      mode: "rebuild",
      fragment: parts[0],
      evidence: [{ sourceId: ids.sourceId, claimId: ids.claimId }],
      stateDelta: {
        ...EMPTY_STATE_DELTA,
        introducedTermIds: [ids.termId],
        usedClaimIds: [ids.claimId],
        coveredOutcomeIds: ["outcome-1"]
      }
    })
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.json));
  submitted = (await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-foundation/submission`
  )).json.data;
  response = await invoke(handler, `/v1/runs/${runId}/parts/part-foundation/audit`, {
    method: "POST",
    body: auditBody(runId, "part-foundation", submitted, {
      requestId: "cycle-audit-foundation-approve",
      decision: "approve"
    })
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.json));

  let outline = (await invoke(handler, `/v1/runs/${runId}/next-part`)).json.data;
  assert.equal(outline.action, "specify_part");
  assert.equal(outline.partKey, "part-continuation");
  response = await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-continuation/specification`,
    {
      method: "PUT",
      body: {
        requestId: "cycle-specify-continuation",
        planHash: outline.planHash,
        specification: { ...specifications[1], outcomeIds: outline.outcomeIds }
      }
    }
  );
  assert.equal(response.response.status, 200, JSON.stringify(response.json));
  buildContext = (await invoke(handler, `/v1/runs/${runId}/next-part`)).json.data;
  assert.deepEqual(buildContext.continuity.stateDelta.introducedTermIds, [ids.termId]);
  assert.deepEqual(buildContext.cardPlan[0].requiredTermIds, [ids.termId]);
  response = await invoke(handler, `/v1/runs/${runId}/parts/part-continuation`, {
    method: "PUT",
    body: submissionBody(buildContext, {
      requestId: "cycle-submit-continuation",
      fragment: parts[1],
      evidence: [{ sourceId: ids.sourceId, claimId: ids.claimId }],
      stateDelta: {
        ...EMPTY_STATE_DELTA,
        usedClaimIds: [ids.claimId],
        coveredOutcomeIds: ["outcome-1"]
      }
    })
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.json));
  let continuationSubmission = (await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-continuation/submission`
  )).json.data;
  response = await invoke(handler, `/v1/runs/${runId}/parts/part-continuation/audit`, {
    method: "POST",
    body: auditBody(runId, "part-continuation", continuationSubmission, {
      requestId: "cycle-audit-continuation-approve",
      decision: "approve"
    })
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.json));
  assert.equal(adapter.runs.get(runId).status, "ready_for_validation");

  response = await invoke(handler, `/v1/runs/${runId}/parts/part-foundation/reopen`, {
    method: "POST",
    body: reopenPartBody(runId, "part-foundation", submitted, {
      requestId: "cycle-reopen-foundation"
    })
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.json));
  const invalidWhileReopened = await invoke(handler, `/v1/runs/${runId}/validate`, {
    method: "POST",
    body: { requestId: "cycle-validate-while-reopened" }
  });
  assert.equal(invalidWhileReopened.response.status, 409);
  assert.equal(invalidWhileReopened.json.error.code, "course_incomplete");

  buildContext = (await invoke(handler, `/v1/runs/${runId}/next-part`)).json.data;
  response = await invoke(handler, `/v1/runs/${runId}/parts/part-foundation`, {
    method: "PUT",
    body: submissionBody(buildContext, {
      requestId: "cycle-submit-after-reopen",
      mode: "repair",
      fragment: parts[0],
      evidence: [{ sourceId: ids.sourceId, claimId: ids.claimId }],
      stateDelta: {
        ...EMPTY_STATE_DELTA,
        introducedTermIds: [ids.termId],
        usedClaimIds: [ids.claimId],
        coveredOutcomeIds: ["outcome-1"]
      }
    })
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.json));
  submitted = (await invoke(
    handler,
    `/v1/runs/${runId}/parts/part-foundation/submission`
  )).json.data;
  response = await invoke(handler, `/v1/runs/${runId}/parts/part-foundation/audit`, {
    method: "POST",
    body: auditBody(runId, "part-foundation", submitted, {
      requestId: "cycle-audit-after-reopen",
      decision: "approve"
    })
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.json));

  const validationBody = { requestId: "cycle-validate-complete" };
  const validated = await invoke(handler, `/v1/runs/${runId}/validate`, {
    method: "POST",
    body: validationBody
  });
  assert.equal(validated.response.status, 200, JSON.stringify(validated.json));
  assert.equal(validated.json.data.status, "validated");
  const repeatedValidation = await invoke(handler, `/v1/runs/${runId}/validate`, {
    method: "POST",
    body: validationBody
  });
  assert.equal(repeatedValidation.response.status, 200, JSON.stringify(repeatedValidation.json));
  assert.equal(repeatedValidation.json.data.idempotent, true);
  assert.equal(adapter.runs.get(runId).document.courses[0].modules[0].lessons.length, 2);

  const publishBody = { requestId: "cycle-publish-complete" };
  const published = await invoke(handler, `/v1/runs/${runId}/publish`, {
    method: "POST",
    body: publishBody
  });
  const repeatedPublication = await invoke(handler, `/v1/runs/${runId}/publish`, {
    method: "POST",
    body: publishBody
  });
  assert.equal(published.response.status, 200, JSON.stringify(published.json));
  assert.equal(repeatedPublication.response.status, 200, JSON.stringify(repeatedPublication.json));
  assert.equal(published.json.data.courseId, repeatedPublication.json.data.courseId);
  assert.equal(adapter.publishCount, 1);
});

test("jornada em partes respeita reparo, reconstrução, validação integral e publicação", async () => {
  const document = await fixture();
  const { project, part } = partFixture(document);
  part.microsequences[0].status = "generated";
  const adapter = new MemoryAuthoringAdapter(document);
  let receiptNow = Date.now();
  const handler = createAuthoringHandler({
    adapter,
    allowedOrigins: new Set([ORIGIN]),
    receiptClock: () => receiptNow
  });
  const created = await invoke(handler, "/v1/runs", {
    method: "POST",
    credential: "jwt-owner",
    body: createRunBody("journey-create-1")
  });
  const runId = created.json.data.runId;
  const plan = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    credential: "jwt-owner",
    body: {
      requestId: "journey-plan-01",
      plan: planFixture(runId, project, [planPartFixture(part)])
    }
  });
  assert.equal(plan.json.data.status, "building");

  let specification = await specifyPart(handler, runId, planPartFixture(part), {
    credential: "jwt-owner",
    requestId: "journey-specification"
  });
  assert.equal(adapter.nextPartReadCount, 7);
  assert.equal(adapter.fullRunReadCount, 0);
  const staleSpecification = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    credential: "jwt-owner",
    body: {
      ...submissionBody(specification, {
        requestId: "journey-stale-spec",
        fragment: part
      }),
      baseLedgerSha256: "0".repeat(64)
    }
  });
  assert.equal(staleSpecification.response.status, 409);
  assert.equal(staleSpecification.json.error.code, "stale_part_spec");

  const firstSubmissionBody = submissionBody(specification, {
    requestId: "journey-part-01",
    fragment: part,
    evidence: [],
    stateDelta: { ...EMPTY_STATE_DELTA, coveredOutcomeIds: ["outcome-1"] }
  });
  let result = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    credential: "jwt-owner",
    body: firstSubmissionBody
  });
  assert.equal(result.json.data.partStatus, "awaiting_audit");
  assert.equal(result.json.data.nextAction, "read_submission");
  assert.equal(
    result.json.data.nextActionPayload.path,
    `/v1/runs/${runId}/parts/lesson-01/submission`
  );
  let submission = result.json.data;
  const persistedSubmission = await invoke(
    handler,
    `/v1/runs/${runId}/parts/lesson-01/submission`,
    { credential: "jwt-owner" }
  );
  assert.equal(persistedSubmission.response.status, 200);
  assert.equal(adapter.partSubmissionReadCount, 1);
  assert.equal(persistedSubmission.json.data.attempt, submission.attempt);
  assert.equal(persistedSubmission.json.data.fragmentHash, submission.fragmentHash);
  assert.equal(
    persistedSubmission.json.data.compiledFragmentHash,
    persistedSubmission.json.data.fragmentHash
  );
  assert.equal(persistedSubmission.json.data.submissionSha256, submission.fragmentHash);
  assert.deepEqual(
    persistedSubmission.json.data.fragment,
    compileAuthoringFragmentGaps(part)
  );
  assert.deepEqual(persistedSubmission.json.data.authoringFragment, part);
  assert.match(persistedSubmission.json.data.authoringFragmentHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(persistedSubmission.json.data.evidence, []);
  assert.deepEqual(
    persistedSubmission.json.data.stateDelta.coveredOutcomeIds,
    ["outcome-1"]
  );
  assert.equal(persistedSubmission.json.data.specification.key, "lesson-01");
  assert.equal(persistedSubmission.json.data.latestAudit, null);
  assert.match(
    persistedSubmission.json.data.submissionReadReceipt,
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
  );
  submission = persistedSubmission.json.data;
  const repeatedSubmission = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    credential: "jwt-owner",
    body: firstSubmissionBody
  });
  assert.equal(repeatedSubmission.response.status, 200);
  assert.equal(repeatedSubmission.json.data.idempotent, true);
  assert.equal(
    adapter.runs.get(runId).parts[0].authoringFragmentHash,
    persistedSubmission.json.data.authoringFragmentHash
  );
  assert.deepEqual(
    adapter.runs.get(runId).parts[0].submissionMeta.stateDelta.introducedTermIds,
    []
  );
  const staleAudit = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: {
      ...auditBody(runId, "lesson-01", submission, {
        requestId: "journey-stale-audit",
        decision: "repair",
        gates: { ...PASSING_GATES, outcomeCoverage: false },
        findings: [auditFinding("coverage-stale")]
      }),
      submissionSha256: "f".repeat(64)
    }
  });
  assert.equal(staleAudit.response.status, 422);
  assert.equal(staleAudit.json.error.code, "invalid_submission_read_receipt");
  const commandCountBeforeForgery = adapter.commandCount;
  const missingReceiptBody = auditBody(runId, "lesson-01", submission, {
    requestId: "journey-missing-receipt",
    decision: "repair",
    gates: { ...PASSING_GATES, outcomeCoverage: false },
    findings: [auditFinding("missing-receipt")]
  });
  delete missingReceiptBody.submissionReadReceipt;
  const missingReceiptAudit = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: missingReceiptBody
  });
  assert.equal(missingReceiptAudit.response.status, 422);
  assert.equal(missingReceiptAudit.json.error.code, "invalid_payload");
  assert.equal(adapter.commandCount, commandCountBeforeForgery);
  const [persistedPayload, persistedSignature] = submission.submissionReadReceipt.split(".");
  const forgedReceiptAudit = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: {
      ...auditBody(runId, "lesson-01", submission, {
        requestId: "journey-forged-receipt",
        decision: "repair",
        gates: { ...PASSING_GATES, outcomeCoverage: false },
        findings: [auditFinding("forged-receipt")]
      }),
      submissionReadReceipt: `${persistedPayload}.${persistedSignature[0] === "A" ? "B" : "A"}${persistedSignature.slice(1)}`
    }
  });
  assert.equal(forgedReceiptAudit.response.status, 422);
  assert.equal(forgedReceiptAudit.json.error.code, "invalid_submission_read_receipt");
  assert.equal(adapter.commandCount, commandCountBeforeForgery);
  receiptNow += 301_000;
  const expiredReceiptAudit = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: auditBody(runId, "lesson-01", submission, {
      requestId: "journey-expired-receipt",
      decision: "repair",
      gates: { ...PASSING_GATES, outcomeCoverage: false },
      findings: [auditFinding("expired-receipt")]
    })
  });
  assert.equal(expiredReceiptAudit.response.status, 409);
  assert.equal(expiredReceiptAudit.json.error.code, "submission_read_receipt_expired");
  assert.equal(adapter.commandCount, commandCountBeforeForgery);
  submission = (await invoke(
    handler,
    `/v1/runs/${runId}/parts/lesson-01/submission`,
    { credential: "jwt-owner" }
  )).json.data;
  const repairAuditBody = auditBody(runId, "lesson-01", submission, {
    requestId: "journey-audit-1",
    decision: "repair",
    gates: { ...PASSING_GATES, outcomeCoverage: false },
    findings: [auditFinding("coverage-repair")]
  });
  result = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: repairAuditBody
  });
  assert.equal(result.json.data.decision, "repair");
  assert.equal(result.json.data.nextAction, "build_part");
  assert.equal(result.json.data.nextActionPayload.mode, "repair");
  receiptNow += 301_000;
  const repeatedAudit = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: repairAuditBody
  });
  assert.equal(repeatedAudit.response.status, 200);
  assert.equal(repeatedAudit.json.data.idempotent, true);
  const repairSource = await invoke(
    handler,
    `/v1/runs/${runId}/parts/lesson-01/submission`,
    { credential: "jwt-owner" }
  );
  assert.equal(repairSource.response.status, 200);
  assert.deepEqual(repairSource.json.data.authoringFragment, part);
  assert.deepEqual(
    repairSource.json.data.fragment,
    compileAuthoringFragmentGaps(part)
  );

  specification = (await invoke(
    handler,
    `/v1/runs/${runId}/next-part`,
    { credential: "jwt-owner" }
  )).json.data;

  const wrongMode = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    credential: "jwt-owner",
    body: submissionBody(specification, {
      requestId: "journey-wrong-1",
      mode: "build",
      fragment: part,
      stateDelta: { ...EMPTY_STATE_DELTA, coveredOutcomeIds: ["outcome-1"] }
    })
  });
  assert.equal(wrongMode.response.status, 409, JSON.stringify(wrongMode.json));

  const repairedSubmission = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    credential: "jwt-owner",
    body: submissionBody(specification, {
      requestId: "journey-repair-1",
      mode: "repair",
      fragment: part,
      stateDelta: { ...EMPTY_STATE_DELTA, coveredOutcomeIds: ["outcome-1"] }
    })
  });
  assert.equal(repairedSubmission.response.status, 200, JSON.stringify(repairedSubmission.json));
  submission = (await invoke(
    handler,
    `/v1/runs/${runId}/parts/lesson-01/submission`,
    { credential: "jwt-owner" }
  )).json.data;
  result = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: auditBody(runId, "lesson-01", submission, {
      requestId: "journey-audit-2",
      decision: "rebuild",
      gates: { ...PASSING_GATES, planAlignment: false },
      findings: [auditFinding("plan-alignment-rebuild", "planAlignment")]
    })
  });
  assert.equal(result.json.data.decision, "rebuild");
  assert.equal(adapter.runs.get(runId).parts[0].fragment, null);
  assert.equal(adapter.runs.get(runId).parts[0].authoringFragment, null);
  assert.equal(adapter.runs.get(runId).parts[0].fragmentHash, null);
  assert.equal(adapter.runs.get(runId).parts[0].authoringFragmentHash, null);

  specification = (await invoke(
    handler,
    `/v1/runs/${runId}/next-part`,
    { credential: "jwt-owner" }
  )).json.data;
  const rebuiltSubmission = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    credential: "jwt-owner",
    body: submissionBody(specification, {
      requestId: "journey-rebuild",
      mode: "rebuild",
      fragment: part,
      stateDelta: { ...EMPTY_STATE_DELTA, coveredOutcomeIds: ["outcome-1"] }
    })
  });
  assert.equal(rebuiltSubmission.response.status, 200, JSON.stringify(rebuiltSubmission.json));
  submission = (await invoke(
    handler,
    `/v1/runs/${runId}/parts/lesson-01/submission`,
    { credential: "jwt-owner" }
  )).json.data;
  assert.deepEqual(submission.authoringFragment, part);
  assert.match(submission.authoringFragmentHash, /^[0-9a-f]{64}$/);
  const invalidApproval = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: auditBody(runId, "lesson-01", submission, {
      requestId: "journey-audit-bad-gate",
      decision: "approve",
      gates: { ...PASSING_GATES, interactionCoherence: false }
    })
  });
  assert.equal(invalidApproval.response.status, 422);
  assert.equal(invalidApproval.json.error.code, "audit_not_approvable");
  const approvalWithFinding = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: auditBody(runId, "lesson-01", submission, {
      requestId: "journey-audit-bad-finding",
      decision: "approve",
      findings: [auditFinding("residual-problem")]
    })
  });
  assert.equal(approvalWithFinding.response.status, 422);
  await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: auditBody(runId, "lesson-01", submission, {
      requestId: "journey-audit-3",
      decision: "approve"
    })
  });

  // Uma inconsistência descoberta somente na montagem integral não deixa a
  // execução presa: o Auditor reabre a parte responsável e o Builder a repara.
  adapter.runs.get(runId).parts[0].fragment.microsequences[0].cards[0].text = "";
  const failedValidation = await invoke(handler, `/v1/runs/${runId}/validate`, {
    method: "POST",
    credential: "jwt-owner",
    body: { requestId: "journey-invalid-final" }
  });
  assert.equal(failedValidation.response.status, 422);
  assert.equal(
    failedValidation.json.error.details.recovery.pathTemplate,
    `/v1/runs/${runId}/parts/{partKey}/reopen`
  );
  const reopened = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/reopen`, {
    method: "POST",
    credential: "jwt-owner",
    body: reopenPartBody(runId, "lesson-01", submission, {
      requestId: "journey-reopen-final"
    })
  });
  assert.equal(reopened.response.status, 200, JSON.stringify(reopened.json));
  assert.equal(reopened.json.data.status, "repair");
  specification = (await invoke(
    handler,
    `/v1/runs/${runId}/next-part`,
    { credential: "jwt-owner" }
  )).json.data;
  const finalRepairSubmission = await invoke(handler, `/v1/runs/${runId}/parts/lesson-01`, {
    method: "PUT",
    credential: "jwt-owner",
    body: submissionBody(specification, {
      requestId: "journey-final-repair",
      mode: "repair",
      fragment: part,
      stateDelta: { ...EMPTY_STATE_DELTA, coveredOutcomeIds: ["outcome-1"] }
    })
  });
  assert.equal(finalRepairSubmission.response.status, 200, JSON.stringify(finalRepairSubmission.json));
  submission = (await invoke(
    handler,
    `/v1/runs/${runId}/parts/lesson-01/submission`,
    { credential: "jwt-owner" }
  )).json.data;
  await invoke(handler, `/v1/runs/${runId}/parts/lesson-01/audit`, {
    method: "POST",
    credential: "jwt-owner",
    body: auditBody(runId, "lesson-01", submission, {
      requestId: "journey-final-repair-audit",
      decision: "approve"
    })
  });

  const validation = await invoke(handler, `/v1/runs/${runId}/validate`, {
    method: "POST",
    credential: "jwt-owner",
    body: { requestId: "journey-valid-1" }
  });
  assert.equal(validation.response.status, 200);
  assert.equal(adapter.fullRunReadCount, 2);
  assert.equal(validation.json.data.status, "validated");
  assert.equal(validation.json.data.nextAction, "prepare_publish");
  assert.equal(validation.json.data.nextActionPayload.requiresExplicitConfirmation, true);
  assert.match(validation.json.data.documentHash, /^[0-9a-f]{64}$/);
  assert.equal(adapter.runs.get(runId).parts[0].fragment.microsequences[0].status, "generated");
  assert.equal(adapter.runs.get(runId).document.courses[0].modules[0].lessons[0].microsequences[0].status, "ready");

  const publication = await invoke(handler, `/v1/runs/${runId}/publish`, {
    method: "POST",
    credential: "jwt-owner",
    body: { requestId: "journey-publish" }
  });
  assert.equal(publication.response.status, 200);
  assert.equal(publication.json.data.status, "published");
  assert.equal(adapter.publishCount, 1);
});

test("validação integral rejeita ABA quando a execução muda durante a montagem", async () => {
  const document = await fixture();
  const { project, part } = partFixture(document);
  const specification = planPartFixture(part);
  let liveRevision = 7;
  let expectedRevision = null;
  const adapter = {
    async resolvePrincipal() {
      return {
        actorId: "owner",
        clientId: "validator",
        authenticationKind: "api_key",
        scopes: ["authoring:audit"]
      };
    },
    async getRun() {
      const snapshot = {
        runId: "12121212-1212-4212-8212-121212121212",
        revision: liveRevision,
        status: "ready_for_validation",
        plan: { project },
        parts: [{
          partKey: "lesson-01",
          position: 0,
          status: "approved",
          specification,
          fragment: compileAuthoringFragmentGaps(part)
        }]
      };
      // Simula reopen -> repair -> approve: o estado nominal volta a ser o
      // mesmo, mas a revisão monotônica já é outra.
      liveRevision += 2;
      return snapshot;
    },
    async getRunAuthorizationSummary() {
      return { publicationTarget: "catalog" };
    },
    async command({ payload }) {
      expectedRevision = payload.expectedRevision;
      if (payload.expectedRevision !== liveRevision) {
        failure(409, "stale_authoring_state", "A execução mudou durante a validação.");
      }
      return { status: "validated" };
    }
  };
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const result = await invoke(
    handler,
    "/v1/runs/12121212-1212-4212-8212-121212121212/validate",
    { method: "POST", body: { requestId: "validate-aba-request-0001" } }
  );
  assert.equal(expectedRevision, 7);
  assert.equal(result.response.status, 409);
  assert.equal(result.json.error.code, "stale_authoring_state");
});

test("duas validações HTTP idênticas reaproveitam o hash externo apesar de revisões distintas", async () => {
  const document = await fixture();
  const { project, part } = partFixture(document);
  const specification = planPartFixture(part);
  const runId = "13131313-1313-4313-8313-131313131313";
  let nextRevision = 7;
  let receipt = null;
  let commandCalls = 0;
  const expectedRevisions = [];
  const externalHashes = [];
  const adapter = {
    async resolvePrincipal() {
      return {
        actorId: "owner",
        clientId: "validator",
        authenticationKind: "api_key",
        scopes: ["authoring:audit"]
      };
    },
    async replayCommand() {
      // Simula duas requisições que chegam antes de qualquer recibo visível.
      return null;
    },
    async getRunAuthorizationSummary() {
      return { publicationTarget: "catalog" };
    },
    async getRun() {
      const revision = nextRevision;
      nextRevision += 2;
      return {
        runId,
        revision,
        status: "ready_for_validation",
        plan: { project },
        parts: [{
          partKey: "lesson-01",
          position: 0,
          status: "approved",
          specification,
          fragment: compileAuthoringFragmentGaps(part)
        }]
      };
    },
    async command({ payload }) {
      commandCalls += 1;
      expectedRevisions.push(payload.expectedRevision);
      externalHashes.push(payload._apiRequestHash);
      if (commandCalls === 1) {
        // Dá à segunda chamada a chance de representar a vencedora da trava
        // transacional; a primeira deve então receber o mesmo resultado.
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (!receipt) {
        receipt = {
          apiRequestHash: payload._apiRequestHash,
          result: { status: "validated", documentHash: payload.documentHash }
        };
      } else if (receipt.apiRequestHash !== payload._apiRequestHash) {
        failure(422, "request_reused", "A requisição foi reutilizada com outro conteúdo.");
      }
      return { ...receipt.result, idempotent: commandCalls > 1 };
    }
  };
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const options = {
    method: "POST",
    body: { requestId: "validate-concurrent-request-0001" }
  };
  const [first, second] = await Promise.all([
    invoke(handler, `/v1/runs/${runId}/validate`, options),
    invoke(handler, `/v1/runs/${runId}/validate`, options)
  ]);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.deepEqual([...expectedRevisions].sort((a, b) => a - b), [7, 9]);
  assert.equal(new Set(externalHashes).size, 1);
  assert.equal(first.json.data.documentHash, second.json.data.documentHash);
});

test("curso incompleto, parte inválida e curso inteiro em uma parte são rejeitados", async () => {
  const document = await fixture();
  const { project, part } = partFixture(document);
  const adapter = new MemoryAuthoringAdapter(document);
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const created = await invoke(handler, "/v1/runs", {
    method: "POST",
    body: createRunBody("invalid-create-1")
  });
  const runId = created.json.data.runId;
  const duplicateOutcomesPlan = planFixture(runId, project, [
    planPartFixture(part, { key: "p1", title: "Parte" })
  ]);
  duplicateOutcomesPlan.learningOutcomes.push(clone(duplicateOutcomesPlan.learningOutcomes[0]));
  const duplicateOutcomes = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "invalid-outcome-01", plan: duplicateOutcomesPlan }
  });
  assert.equal(duplicateOutcomes.response.status, 422);
  assert.equal(duplicateOutcomes.json.error.code, "invalid_plan");

  const missingOutcomeTextPlan = planFixture(runId, project, [
    planPartFixture(part, { key: "p1", title: "Parte" })
  ]);
  delete missingOutcomeTextPlan.learningOutcomes[0].evidence;
  const missingOutcomeText = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "invalid-outcome-02", plan: missingOutcomeTextPlan }
  });
  assert.equal(missingOutcomeText.response.status, 422);
  assert.equal(missingOutcomeText.json.error.code, "invalid_plan");
  assert.equal(missingOutcomeText.json.error.details.path, "plan.learningOutcomes[0].evidence");
  assert.equal(missingOutcomeText.json.error.details.reason, "required");

  const earlyInvalidPlan = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: {
      requestId: "invalid-plan-000",
      plan: { parts: [planPartFixture(partFixture(document).part, { key: "p1", title: "Parte" })] }
    }
  });
  assert.equal(earlyInvalidPlan.response.status, 422);
  assert.equal(earlyInvalidPlan.json.error.code, "invalid_plan");
  await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: {
      requestId: "invalid-plan-001",
      plan: planFixture(runId, project, [
        planPartFixture(part, { key: "p1", title: "Parte" })
      ])
    }
  });
  const incomplete = await invoke(handler, `/v1/runs/${runId}/validate`, {
    method: "POST",
    body: { requestId: "invalid-valid-01" }
  });
  assert.equal(incomplete.response.status, 409);
  assert.equal(incomplete.json.error.code, "course_incomplete");
  const specification = await specifyPart(
    handler,
    runId,
    planPartFixture(part, { key: "p1", title: "Parte" }),
    { requestId: "invalid-specification" }
  );

  const missingStateDelta = await invoke(handler, `/v1/runs/${runId}/parts/p1`, {
    method: "PUT",
    body: (() => {
      const body = submissionBody(specification, {
        requestId: "invalid-delta-01",
        fragment: part
      });
      delete body.stateDelta;
      return body;
    })()
  });
  assert.equal(missingStateDelta.response.status, 422);
  assert.equal(missingStateDelta.json.error.code, "invalid_payload");

  const obsoleteStateDelta = await invoke(handler, `/v1/runs/${runId}/parts/p1`, {
    method: "PUT",
    body: submissionBody(specification, {
      requestId: "invalid-delta-02",
      fragment: part,
      stateDelta: { introducedTerms: ["termo"] }
    })
  });
  assert.equal(obsoleteStateDelta.response.status, 422);
  assert.equal(obsoleteStateDelta.json.error.code, "invalid_state_delta");

  const invalidPart = await invoke(handler, `/v1/runs/${runId}/parts/p1`, {
    method: "PUT",
    body: submissionBody(specification, {
      requestId: "invalid-part-001",
      fragment: { arbitrary: true },
      stateDelta: EMPTY_STATE_DELTA
    })
  });
  assert.equal(invalidPart.response.status, 422);
  assert.equal(invalidPart.json.error.code, "invalid_payload");
  assert.equal(invalidPart.json.error.details?.path, "fragment.arbitrary");
  assert.equal(invalidPart.json.error.details?.reason, "unknown_field");

  const wholeCourse = await invoke(handler, `/v1/runs/${runId}/parts/p1`, {
    method: "PUT",
    body: submissionBody(specification, {
      requestId: "invalid-whole-01",
      fragment: document,
      stateDelta: EMPTY_STATE_DELTA
    })
  });
  assert.equal(wholeCourse.response.status, 422);
  assert.equal(wholeCourse.json.error.code, "invalid_payload");
  assert.equal(wholeCourse.json.error.details?.path, "fragment.contract");
  assert.equal(wholeCourse.json.error.details?.reason, "unknown_field");
});

test("erros de plano, especificação e parte indicam caminho, campo e motivo", async () => {
  const document = await fixture();
  const { project, part } = partFixture(document);
  const adapter = new MemoryAuthoringAdapter(document);
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const created = await invoke(handler, "/v1/runs", {
    method: "POST",
    body: createRunBody("actionable-errors-create-0001")
  });
  const runId = created.json.data.runId;
  const specification = planPartFixture(part, { key: "actionable-part", title: "Parte testável" });
  const validPlan = planFixture(runId, project, [specification]);

  const missingAudiencePlan = clone(validPlan);
  delete missingAudiencePlan.course.audience;
  assertActionableValidation(await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "actionable-plan-audience-0001", plan: missingAudiencePlan }
  }), {
    code: "invalid_plan",
    path: "plan.course.audience",
    reason: "required"
  });

  const wrongConceptMapPlan = clone(validPlan);
  wrongConceptMapPlan.conceptMap = [];
  assertActionableValidation(await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "actionable-concept-map-0001", plan: wrongConceptMapPlan }
  }), {
    code: "invalid_plan",
    path: "plan.conceptMap",
    reason: "wrong_type"
  });

  const missingConceptLabelPlan = clone(validPlan);
  delete missingConceptLabelPlan.conceptMap.concepts[0].label;
  assertActionableValidation(await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "actionable-concept-label-0001", plan: missingConceptLabelPlan }
  }), {
    code: "invalid_plan",
    path: "plan.conceptMap.concepts[0].label",
    reason: "required"
  });

  const invalidRelationPlan = clone(validPlan);
  invalidRelationPlan.conceptMap.concepts.push({
    id: "concept-2",
    label: "Conceito relacionado"
  });
  invalidRelationPlan.conceptMap.relations.push({
    from: "concept-1",
    to: "concept-2",
    relation: "serve para"
  });
  assertActionableValidation(await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "actionable-concept-relation-0001", plan: invalidRelationPlan }
  }), {
    code: "invalid_plan",
    path: "plan.conceptMap.relations[0].relation",
    reason: "invalid_relation"
  });

  const collidingComponentPlan = clone(validPlan);
  collidingComponentPlan.operations[0].id = collidingComponentPlan.learningOutcomes[0].id;
  assertActionableValidation(await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "actionable-component-collision-01", plan: collidingComponentPlan }
  }), {
    code: "invalid_plan",
    path: "plan.operations",
    reason: "component_id_collision"
  });

  const unknownOperationPlan = clone(validPlan);
  unknownOperationPlan.parts[0].operationIds = ["operation-unknown"];
  assertActionableValidation(await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "actionable-operation-reference-01", plan: unknownOperationPlan }
  }), {
    code: "invalid_plan",
    path: "plan.parts[0].operationIds",
    reason: "invalid_reference"
  });

  const missingOwnershipPlan = clone(validPlan);
  delete missingOwnershipPlan.parts[0].ownership;
  assertActionableValidation(await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "actionable-ownership-plan-0001", plan: missingOwnershipPlan }
  }), {
    code: "invalid_plan",
    path: "plan.parts[0].ownership",
    reason: "required"
  });

  const guideCases = [
    ["module", "goal"],
    ["module", "include"],
    ["module", "exclude"],
    ["module", "notation"],
    ["module", "avoid"],
    ["lesson", "goal"],
    ["lesson", "include"],
    ["lesson", "exclude"],
    ["lesson", "notation"],
    ["lesson", "avoid"]
  ];
  for (const [owner, field] of guideCases) {
    const invalidGuidePlan = clone(validPlan);
    const moduleValue = invalidGuidePlan.project.courses[0].modules[0];
    const guide = owner === "module" ? moduleValue.guide : moduleValue.lessons[0].guide;
    delete guide[field];
    const invalidGuide = await invoke(handler, `/v1/runs/${runId}/plan`, {
      method: "PUT",
      body: {
        requestId: `actionable-guide-${owner}-${field}-0001`,
        plan: invalidGuidePlan
      }
    });
    assert.equal(invalidGuide.response.status, 422, JSON.stringify(invalidGuide.json));
    assert.equal(invalidGuide.json.error.code, "invalid_plan");
    assert.match(invalidGuide.json.error.details.path, new RegExp(`^plan\\.project\\..*guide\\.${field}$`, "u"));
    assert.equal(invalidGuide.json.error.details.field, field);
    assert.equal(invalidGuide.json.error.details.reason, "contract_violation");
    assert.match(invalidGuide.json.error.message, new RegExp(`guide\\.${field}`, "u"));
  }

  const planned = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "actionable-valid-plan-0001", plan: validPlan }
  });
  assert.equal(planned.response.status, 200, JSON.stringify(planned.json));
  await finalizeEmptyLedger(handler, runId, { requestId: "actionable-finalize-ledger-0001" });
  const outline = (await invoke(handler, `/v1/runs/${runId}/next-part`)).json.data;
  assert.equal(outline.action, "specify_part");
  const validSpecification = {
    ...clone(specification),
    outcomeIds: clone(outline.outcomeIds)
  };

  const practiceWithoutFoundation = clone(validSpecification);
  practiceWithoutFoundation.cardPlan[0].learningFunction = "guided_practice";
  practiceWithoutFoundation.cardPlan[0].targetError = "Aplicar a regra sem compreender a base.";
  practiceWithoutFoundation.cardPlan[0].variationFocus = "Resolver outro caso da mesma regra.";
  practiceWithoutFoundation.cardPlan[0].contextAnchors = ["conjunção"];
  assertActionableValidation(await invoke(
    handler,
    `/v1/runs/${runId}/parts/${specification.key}/specification`,
    {
      method: "PUT",
      body: {
        requestId: "actionable-missing-foundation-0001",
        planHash: outline.planHash,
        specification: practiceWithoutFoundation
      }
    }
  ), {
    code: "invalid_plan",
    path: "specification.cardPlan[0].learningFunction",
    reason: "learning_function_mismatch"
  });

  const specificationDelta = clone(validSpecification);
  for (const field of [
    "key",
    "title",
    "boundary",
    "cutReason",
    "dependsOnPartKeys",
    "ownership",
    "outcomeIds",
    "conceptIds",
    "operationIds",
    "misconceptionIds"
  ]) delete specificationDelta[field];
  delete specificationDelta.structure.course;
  delete specificationDelta.structure.module;
  delete specificationDelta.structure.lesson;
  const acceptedSpecification = await invoke(
    handler,
    `/v1/runs/${runId}/parts/${specification.key}/specification`,
    {
      method: "PUT",
      body: {
        requestId: "actionable-ownership-spec-0001",
        planHash: outline.planHash,
        specification: specificationDelta
      }
    }
  );
  assert.equal(acceptedSpecification.response.status, 200, JSON.stringify(acceptedSpecification.json));
  assert.equal(acceptedSpecification.json.data.nextAction, "build_part");
  assert.equal(acceptedSpecification.json.data.nextActionPayload.action, "build_part");
  assert.deepEqual(
    adapter.runs.get(runId).parts[0].specification.ownership,
    validSpecification.ownership
  );
  assert.deepEqual(
    adapter.runs.get(runId).parts[0].specification.structure.course,
    validSpecification.structure.course
  );
  const buildContext = (await invoke(handler, `/v1/runs/${runId}/next-part`)).json.data;
  assert.equal(buildContext.action, "build_part");

  const invalidFragment = await invoke(handler, `/v1/runs/${runId}/parts/${specification.key}`, {
    method: "PUT",
    body: submissionBody(buildContext, {
      requestId: "actionable-invalid-fragment-0001",
      fragment: {
        courseId: part.courseId,
        moduleId: part.moduleId,
        lessonId: part.lessonId,
        microsequences: []
      }
    })
  });
  assertActionableValidation(invalidFragment, {
    code: "invalid_payload",
    path: "fragment.microsequences",
    reason: "too_few_items"
  });
});

test("plano devolve o contractKey da execução como erro corrigível antes de chegar ao banco", async () => {
  const document = await fixture();
  const { project, part } = partFixture(document);
  const adapter = new MemoryAuthoringAdapter(document);
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const created = await invoke(handler, "/v1/runs", {
    method: "POST",
    body: createRunBody("plan-contract-key-create-0001")
  });
  const runId = created.json.data.runId;
  const invalidPlan = planFixture(runId, project, [planPartFixture(part)]);
  const unexpectedCourseId = "course-id-invented-by-client";
  invalidPlan.project.courses[0].id = unexpectedCourseId;
  invalidPlan.course.id = unexpectedCourseId;
  invalidPlan.parts[0].ownership.courseId = unexpectedCourseId;

  const result = await invoke(handler, `/v1/runs/${runId}/plan`, {
    method: "PUT",
    body: { requestId: "plan-contract-key-write-0001", plan: invalidPlan }
  });

  assertActionableValidation(result, {
    code: "invalid_plan",
    path: "plan.project.courses[0].id",
    reason: "run_contract_key_mismatch"
  });
  assert.equal(result.json.error.details.expectedValue, "course-fixture-minimal");
  assert.equal(adapter.runs.get(runId).status, "planning");
});

test("importação manual cria execução validada, mas não publica na mesma requisição", async () => {
  const document = await fixture();
  const adapter = new MemoryAuthoringAdapter(document);
  const handler = createAuthoringHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const result = await invoke(handler, "/v1/imports", {
    method: "POST",
    credential: "jwt-owner",
    body: {
      requestId: "manual-import-01",
      target: "catalog",
      publicationIntent: { mode: "create" },
      document
    }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.json.data.status, "validated");
  assert.equal(typeof result.json.data.runId, "string");
  assert.equal(adapter.publishCount, 0);
});

test("publicação oficial é retomável e só confirma depois do finalizador", async () => {
  const document = await fixture();
  const calls = [];
  const rpc = async (name, payload) => {
    calls.push({ name, payload });
    if (name === "begin_official_course_import") return { status: "staging" };
    if (name === "begin_official_course_import_flow") return { status: "staging" };
    if (name === "finalize_official_course_import") {
      return { status: "published", courseId: payload.p_import_id };
    }
    return { status: "applied" };
  };
  let step = 0;
  let result;
  let sawPending = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    result = await publishOfficialDocumentStep(document, { rpc, step, maxOperations: 1 });
    if (result.status === "published") break;
    sawPending = true;
    assert.ok(result.nextStep > step);
    step = result.nextStep;
  }
  assert.equal(sawPending, true);
  assert.equal(result.status, "published");
  assert.equal(calls.at(-1).name, "finalize_official_course_import");
  assert.ok(calls.some((call) => call.name === "apply_official_course_import_chunk"));
});

test("reuso de publicação só termina a autoria quando o banco confirma a execução", async () => {
  const document = await fixture();
  const authoring = { runId: "77777777-7777-4777-8777-777777777777" };

  await assert.rejects(
    publishOfficialDocumentStep(document, {
      authoring,
      maxOperations: 1,
      rpc: async (name) => {
        assert.equal(name, "begin_authoring_official_course_import");
        return { status: "published", courseId: "11111111-1111-4111-8111-111111111111" };
      }
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "authoring_run_not_finalized"
  );

  const result = await publishOfficialDocumentStep(document, {
    authoring,
    maxOperations: 1,
    rpc: async (name) => {
      assert.equal(name, "begin_authoring_official_course_import");
      return {
        status: "published",
        courseId: "11111111-1111-4111-8111-111111111111",
        runFinalized: true,
        idempotent: true
      };
    }
  });
  assert.equal(result.status, "published");
  assert.equal(result.publication.runFinalized, true);
});

test("a mesma Idempotency-Key retoma a publicação sem devolver o documento integral", async () => {
  const catalogCourse = JSON.parse(await fs.readFile(new URL(
    "../../supabase/fixtures/catalog/fundamentos-ia-analise-dados-seed-course.json",
    import.meta.url
  ), "utf8"));
  const document = await fixture();
  document.courses = [catalogCourse];
  const prepared = await prepareCourseDocument(document, { official: true, requireReady: true });
  const backgroundTasks = [];
  let leaseSequence = 0;
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    fetchImpl: async () => { throw new Error("fetch inesperado"); },
    attempts: 1,
    scheduleBackground(task) {
      backgroundTasks.push(task);
    },
    leaseTokenFactory() {
      leaseSequence += 1;
      return `99999999-9999-4999-8999-${String(leaseSequence).padStart(12, "0")}`;
    }
  });
  const receipts = new Map();
  let publicationStep = 0;
  let status = "validated";
  let courseId = null;
  adapter.getRun = async () => assert.fail("a publicação consultou o rascunho integral");
  adapter.getRunSummary = async () => ({
    runId: "77777777-7777-4777-8777-777777777777",
    status,
    publicationStep,
    documentHash: prepared.contentHash,
    publicationIntent: "create",
    courseId
  });
  adapter.command = async ({ requestId, command, payload = {} }) => {
    if (receipts.has(requestId)) return { ...clone(receipts.get(requestId)), idempotent: true };
    let result;
    if (command === "prepare_publish") {
      if (payload.nextStep != null) publicationStep = payload.nextStep;
      status = "publishing";
      result = {
        status,
        runId: "77777777-7777-4777-8777-777777777777",
        document,
        documentHash: prepared.contentHash,
        publicationIntent: "create",
        publicationStep
      };
    } else {
      throw new Error(`Comando inesperado: ${command}`);
    }
    receipts.set(requestId, clone(result));
    return { ...result, idempotent: false };
  };
  adapter.rpc = async (name, payload) => {
    if (name === "begin_authoring_official_course_import") return { status: "staging" };
    if (name === "begin_official_course_import_flow") return { status: "staging" };
    if (name === "claim_authoring_publication") {
      return {
        status: "publishing",
        phase: "finalizing",
        leaseAcquired: true,
        pollAfterSeconds: 3
      };
    }
    if (name === "finalize_authoring_official_course_import") {
      status = "published";
      courseId = payload.p_import_id;
      return { status: "published", courseId };
    }
    if (name === "record_authoring_publication_failure") return { recorded: true };
    return { status: "applied" };
  };

  const principal = { actorId: "owner", clientId: null };
  const requestId = "same-publication-request";
  let result = await adapter.publishRun({
    principal,
    runId: "77777777-7777-4777-8777-777777777777",
    requestId
  });
  const stepAfterLostResponse = publicationStep;
  assert.equal(result.status, "publishing");
  assert.ok(stepAfterLostResponse > 0);
  assert.equal("document" in result, false);
  assert.equal("assembledDocument" in result, false);

  for (let attempt = 0; attempt < 100 && result.status !== "published"; attempt += 1) {
    result = await adapter.publishRun({
      principal,
      runId: "77777777-7777-4777-8777-777777777777",
      requestId
    });
    assert.equal("document" in result, false);
    assert.equal("assembledDocument" in result, false);
    if (result.phase === "finalizing") {
      await Promise.all(backgroundTasks.splice(0));
    }
  }
  assert.equal(result.status, "published");
  assert.ok(publicationStep >= stepAfterLostResponse);
  const compactReplay = await adapter.publishRun({
    principal,
    runId: "77777777-7777-4777-8777-777777777777",
    requestId
  });
  assert.deepEqual(Object.keys(compactReplay).sort(), [
    "courseId", "documentHash", "idempotent", "runId", "status"
  ]);
});

test("finalização em background usa lease físico, evita duplicação e recupera worker vencido", async () => {
  const document = await fixture();
  const prepared = await prepareCourseDocument(document, { official: true, requireReady: true });
  const outline = await publishOfficialDocumentStep(document, {
    rpc: async () => ({ status: "applied" }),
    maxOperations: 10_000,
    prepared,
    deferFinalize: true,
    authoring: { runId: "88888888-8888-4888-8888-888888888888" }
  });
  assert.equal(outline.status, "finalizing");

  const tasks = [];
  const leases = [];
  const failures = [];
  let leaseSequence = 0;
  let leaseUntil = 0;
  let activeToken = null;
  let runStatus = "publishing";
  let publicationError = null;
  let firstFailure;
  const firstWorker = new Promise((_resolve, reject) => { firstFailure = reject; });
  let finalizeCalls = 0;
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => { throw new Error("fetch inesperado"); },
    scheduleBackground(task) { tasks.push(task); },
    leaseTokenFactory() {
      leaseSequence += 1;
      return `aaaaaaaa-aaaa-4aaa-8aaa-${String(leaseSequence).padStart(12, "0")}`;
    }
  });
  adapter.getRunSummary = async () => ({
    runId: "88888888-8888-4888-8888-888888888888",
    status: runStatus,
    publicationStep: outline.nextStep,
    publicationPhase: leaseUntil > Date.now() ? "finalizing" : "staging",
    publicationLeaseUntil: leaseUntil ? new Date(leaseUntil).toISOString() : null,
    publicationError,
    documentHash: prepared.contentHash,
    assembledDocument: document,
    publicationIntent: "create",
    courseId: runStatus === "published" ? outline.courseId : null
  });
  adapter.command = async ({ command }) => {
    assert.equal(command, "prepare_publish");
    return {
      status: runStatus,
      runId: "88888888-8888-4888-8888-888888888888",
      document,
      documentHash: prepared.contentHash,
      publicationIntent: "create",
      publicationStep: outline.nextStep
    };
  };
  adapter.rpc = async (name, payload) => {
    if (name === "claim_authoring_publication") {
      if (leaseUntil > Date.now()) {
        return { status: "publishing", phase: "finalizing", leaseAcquired: false };
      }
      activeToken = payload.p_lease_token;
      leases.push(activeToken);
      leaseUntil = Date.now() + 30_000;
      publicationError = null;
      return { status: "publishing", phase: "finalizing", leaseAcquired: true };
    }
    if (name === "finalize_authoring_official_course_import") {
      finalizeCalls += 1;
      if (finalizeCalls === 1) return firstWorker;
      runStatus = "published";
      leaseUntil = 0;
      return { status: "published", courseId: outline.courseId };
    }
    if (name === "record_authoring_publication_failure") {
      if (runStatus === "published" || payload.p_lease_token !== activeToken) {
        failures.push({ recorded: false, token: payload.p_lease_token });
        return { recorded: false, superseded: true };
      }
      leaseUntil = 0;
      publicationError = {
        kind: payload.p_kind,
        code: payload.p_code,
        message: payload.p_message,
        httpStatus: payload.p_http_status
      };
      failures.push({ recorded: true, token: payload.p_lease_token });
      return { recorded: true };
    }
    throw new Error(`RPC inesperada: ${name}`);
  };

  const principal = { actorId: "owner", clientId: "client" };
  const startedAt = Date.now();
  const first = await adapter.publishRun({
    principal,
    runId: "88888888-8888-4888-8888-888888888888",
    requestId: "background-first-request"
  });
  assert.equal(first.status, "publishing");
  assert.equal(first.phase, "finalizing");
  assert.equal(first.leaseAcquired, true);
  assert.ok(Date.now() - startedAt < 1_000, "a resposta aguardou o finalizador");

  const concurrent = await adapter.publishRun({
    principal,
    runId: "88888888-8888-4888-8888-888888888888",
    requestId: "background-concurrent-request"
  });
  assert.equal(concurrent.leaseAcquired, false);
  assert.equal(finalizeCalls, 1);

  leaseUntil = Date.now() - 1;
  const recovered = await adapter.publishRun({
    principal,
    runId: "88888888-8888-4888-8888-888888888888",
    requestId: "background-recovery-request"
  });
  assert.equal(recovered.leaseAcquired, true);
  assert.equal(new Set(leases).size, 2, "o lease recuperado reutilizou o token antigo");
  await tasks[1];
  firstFailure(new AuthoringApiError(503, "service_unavailable", "Worker antigo interrompido."));
  await tasks[0];
  assert.equal(runStatus, "published");
  assert.deepEqual(failures, [{ recorded: false, token: leases[0] }]);

  const complete = await adapter.publishRun({
    principal,
    runId: "88888888-8888-4888-8888-888888888888",
    requestId: "background-recovery-request"
  });
  assert.equal(complete.status, "published");
});

test("falha determinística do finalizador fica visível e não entra em repetição", async () => {
  const document = await fixture();
  const prepared = await prepareCourseDocument(document, { official: true, requireReady: true });
  const outline = await publishOfficialDocumentStep(document, {
    rpc: async () => ({ status: "applied" }),
    maxOperations: 10_000,
    prepared,
    deferFinalize: true,
    authoring: { runId: "99999999-9999-4999-8999-999999999999" }
  });
  const tasks = [];
  let publicationError = null;
  let finalizeCalls = 0;
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => { throw new Error("fetch inesperado"); },
    scheduleBackground(task) { tasks.push(task); },
    leaseTokenFactory: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  });
  adapter.getRunSummary = async () => ({
    runId: "99999999-9999-4999-8999-999999999999",
    status: "publishing",
    publicationStep: outline.nextStep,
    publicationPhase: publicationError ? "failed" : "staging",
    publicationError,
    documentHash: prepared.contentHash,
    assembledDocument: document,
    publicationIntent: "create"
  });
  adapter.command = async ({ command }) => {
    assert.equal(command, "prepare_publish");
    return {
      status: "publishing",
      runId: "99999999-9999-4999-8999-999999999999",
      document,
      documentHash: prepared.contentHash,
      publicationIntent: "create",
      publicationStep: outline.nextStep
    };
  };
  adapter.rpc = async (name, payload) => {
    if (name === "claim_authoring_publication") {
      return { status: "publishing", phase: "finalizing", leaseAcquired: true };
    }
    if (name === "finalize_authoring_official_course_import") {
      finalizeCalls += 1;
      throw new AuthoringApiError(422, "invalid_command", "Estrutura inválida.");
    }
    if (name === "record_authoring_publication_failure") {
      publicationError = {
        kind: payload.p_kind,
        code: payload.p_code,
        message: payload.p_message,
        httpStatus: payload.p_http_status
      };
      return { recorded: true };
    }
    throw new Error(`RPC inesperada: ${name}`);
  };

  const principal = { actorId: "owner", clientId: null };
  const accepted = await adapter.publishRun({
    principal,
    runId: "99999999-9999-4999-8999-999999999999",
    requestId: "deterministic-background-request"
  });
  assert.equal(accepted.phase, "finalizing");
  await tasks[0];
  assert.equal(publicationError.kind, "deterministic");
  await assert.rejects(
    adapter.publishRun({
      principal,
      runId: "99999999-9999-4999-8999-999999999999",
      requestId: "deterministic-background-request"
    }),
    (error) => error instanceof AuthoringApiError
      && error.status === 422
      && error.code === "invalid_command"
  );
  assert.equal(finalizeCalls, 1);
});

test("erro genérico do banco na materialização privada permanece retomável", async () => {
  const document = await fixture();
  const prepared = await prepareCourseDocument(document, { requireReady: true });
  const outline = await materializePrivateDocumentStep(document, {
    rpc: async () => ({ status: "applied" }),
    runId: "abababab-abab-4bab-8bab-abababababab",
    actorId: "owner",
    clientId: "client",
    maxOperations: 10_000,
    prepared,
    deferFinalize: true
  });
  const tasks = [];
  let publicationError = null;
  let finalizeCalls = 0;
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => { throw new Error("fetch inesperado"); },
    scheduleBackground(task) { tasks.push(task); },
    leaseTokenFactory: () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  });
  adapter.getRunSummary = async () => ({
    runId: "abababab-abab-4bab-8bab-abababababab",
    status: "publishing",
    publicationTarget: "private",
    publicationStep: outline.nextStep,
    publicationPhase: publicationError ? "failed" : "staging",
    publicationError,
    documentHash: prepared.contentHash,
    assembledDocument: document,
    publicationIntent: "create"
  });
  adapter.command = async () => ({
    status: "publishing",
    runId: "abababab-abab-4bab-8bab-abababababab",
    publicationTarget: "private",
    document,
    documentHash: prepared.contentHash,
    publicationIntent: "create",
    publicationStep: outline.nextStep
  });
  adapter.rpc = async (name, payload) => {
    if (name === "claim_authoring_private_materialization") {
      publicationError = null;
      return { status: "publishing", phase: "finalizing", leaseAcquired: true };
    }
    if (name === "finalize_authoring_private_course_import") {
      finalizeCalls += 1;
      if (finalizeCalls === 1) {
        throw new AuthoringApiError(400, "database_error", "A operação no banco não pôde ser concluída.");
      }
      return { status: "published", courseId: outline.courseId };
    }
    if (name === "record_authoring_private_materialization_failure") {
      publicationError = {
        kind: payload.p_kind,
        code: payload.p_code,
        message: payload.p_message,
        httpStatus: payload.p_http_status
      };
      return { recorded: true };
    }
    throw new Error(`RPC inesperada: ${name}`);
  };

  const principal = { actorId: "owner", clientId: "client" };
  await adapter.publishRun({
    principal,
    runId: "abababab-abab-4bab-8bab-abababababab",
    requestId: "private-recoverable-db-error-1"
  });
  await tasks[0];
  assert.equal(publicationError.kind, "transient");

  const resumed = await adapter.publishRun({
    principal,
    runId: "abababab-abab-4bab-8bab-abababababab",
    requestId: "private-recoverable-db-error-2"
  });
  assert.equal(resumed.phase, "finalizing");
  await tasks[1];
  assert.equal(finalizeCalls, 2);
});

test("coleção indisponível chega ao claim; só a escolha automática aceita fallback", async () => {
  const document = await fixture();
  const prepared = await prepareCourseDocument(document, { official: true, requireReady: true });
  const outline = await publishOfficialDocumentStep(document, {
    rpc: async () => ({ status: "applied" }),
    maxOperations: 10_000,
    prepared,
    deferFinalize: true,
    authoring: { runId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd" }
  });
  const publicationError = {
    kind: "deterministic",
    code: "collection_unavailable",
    message: "A coleção automática deixou de existir.",
    httpStatus: 422
  };
  let status = "publishing";
  let claimCalls = 0;
  const tasks = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => { throw new Error("fetch inesperado"); },
    scheduleBackground(task) { tasks.push(task); },
    leaseTokenFactory: () => "dededede-dede-4ede-8ede-dededededede"
  });
  adapter.getRunSummary = async () => ({
    runId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
    status,
    collectionExplicit: false,
    publicationStep: outline.nextStep,
    publicationPhase: "failed",
    publicationError,
    documentHash: prepared.contentHash,
    assembledDocument: document,
    publicationIntent: "create",
    courseId: status === "published" ? outline.courseId : null
  });
  const order = [];
  adapter.command = async ({ command }) => {
    order.push(command);
    assert.equal(command, "prepare_publish");
    return {
      status: "publishing",
      runId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
      document,
      documentHash: prepared.contentHash,
      publicationIntent: "create",
      publicationStep: outline.nextStep
    };
  };
  adapter.rpc = async (name) => {
    order.push(name);
    if (name === "claim_authoring_publication") {
      claimCalls += 1;
      return { status: "publishing", phase: "finalizing", leaseAcquired: true };
    }
    if (name === "finalize_authoring_official_course_import") {
      status = "published";
      return { status: "published", courseId: outline.courseId };
    }
    if (name === "record_authoring_publication_failure") return { recorded: true };
    throw new Error(`RPC inesperada: ${name}`);
  };
  const principal = { actorId: "owner", clientId: "replacement-client" };
  const recovered = await adapter.publishRun({
    principal,
    runId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
    requestId: "automatic-collection-recovery"
  });
  assert.equal(recovered.phase, "finalizing");
  assert.equal(claimCalls, 1);
  assert.deepEqual(order.slice(0, 2), ["prepare_publish", "claim_authoring_publication"]);
  await tasks[0];
  assert.equal(status, "published");

  const explicitAdapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => { throw new Error("fetch inesperado"); },
    scheduleBackground() {
      assert.fail("coleção explícita indisponível não deve iniciar o worker");
    }
  });
  let explicitCommands = 0;
  let explicitClaimCalls = 0;
  explicitAdapter.getRunSummary = async () => ({
    runId: "efefefef-efef-4fef-8fef-efefefefefef",
    status: "publishing",
    collectionExplicit: true,
    publicationStep: outline.nextStep,
    publicationPhase: "failed",
    publicationError,
    documentHash: prepared.contentHash,
    assembledDocument: document,
    publicationIntent: "create"
  });
  explicitAdapter.command = async ({ command }) => {
    explicitCommands += 1;
    assert.equal(command, "prepare_publish");
    return {
      status: "publishing",
      runId: "efefefef-efef-4fef-8fef-efefefefefef",
      document,
      documentHash: prepared.contentHash,
      publicationIntent: "create",
      publicationStep: outline.nextStep
    };
  };
  explicitAdapter.rpc = async (name) => {
    assert.equal(name, "claim_authoring_publication");
    explicitClaimCalls += 1;
    return {
      status: "publishing",
      phase: "failed",
      leaseAcquired: false,
      publicationError
    };
  };
  await assert.rejects(
    explicitAdapter.publishRun({
      principal,
      runId: "efefefef-efef-4fef-8fef-efefefefefef",
      requestId: "explicit-collection-failure"
    }),
    (error) => error instanceof AuthoringApiError
      && error.status === 422
      && error.code === "collection_unavailable"
  );
  assert.equal(explicitCommands, 1);
  assert.equal(explicitClaimCalls, 1);
});

test("falha transitória do worker libera o lease e a tentativa seguinte conclui", async () => {
  const document = await fixture();
  const prepared = await prepareCourseDocument(document, { official: true, requireReady: true });
  const outline = await publishOfficialDocumentStep(document, {
    rpc: async () => ({ status: "applied" }),
    maxOperations: 10_000,
    prepared,
    deferFinalize: true,
    authoring: { runId: "abababab-abab-4bab-8bab-abababababab" }
  });
  const tasks = [];
  const leases = [];
  const recordedFailures = [];
  let publicationError = null;
  let runStatus = "publishing";
  let courseId = null;
  let finalizeCalls = 0;
  let leaseSequence = 0;
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async () => { throw new Error("fetch inesperado"); },
    scheduleBackground(task) { tasks.push(task); },
    leaseTokenFactory() {
      leaseSequence += 1;
      return `cccccccc-cccc-4ccc-8ccc-${String(leaseSequence).padStart(12, "0")}`;
    }
  });
  adapter.getRunSummary = async () => ({
    runId: "abababab-abab-4bab-8bab-abababababab",
    status: runStatus,
    publicationStep: outline.nextStep,
    publicationPhase: publicationError ? "staging" : "staging",
    publicationError,
    documentHash: prepared.contentHash,
    assembledDocument: document,
    publicationIntent: "create",
    courseId
  });
  adapter.command = async ({ command }) => {
    assert.equal(command, "prepare_publish");
    return {
      status: runStatus,
      runId: "abababab-abab-4bab-8bab-abababababab",
      document,
      documentHash: prepared.contentHash,
      publicationIntent: "create",
      publicationStep: outline.nextStep
    };
  };
  adapter.rpc = async (name, payload) => {
    if (name === "claim_authoring_publication") {
      leases.push(payload.p_lease_token);
      publicationError = null;
      return { status: "publishing", phase: "finalizing", leaseAcquired: true };
    }
    if (name === "finalize_authoring_official_course_import") {
      finalizeCalls += 1;
      if (finalizeCalls === 1) {
        throw new AuthoringApiError(503, "service_timeout", "Interrupção temporária.");
      }
      runStatus = "published";
      courseId = outline.courseId;
      return { status: "published", courseId };
    }
    if (name === "record_authoring_publication_failure") {
      recordedFailures.push({ ...payload });
      publicationError = {
        kind: payload.p_kind,
        code: payload.p_code,
        message: payload.p_message,
        httpStatus: payload.p_http_status
      };
      return { recorded: true };
    }
    throw new Error(`RPC inesperada: ${name}`);
  };

  const principal = { actorId: "owner", clientId: null };
  const first = await adapter.publishRun({
    principal,
    runId: "abababab-abab-4bab-8bab-abababababab",
    requestId: "transient-background-request"
  });
  assert.equal(first.status, "publishing");
  await tasks[0];
  assert.equal(recordedFailures[0].p_kind, "transient");
  assert.equal(recordedFailures[0].p_code, "service_timeout");

  const retried = await adapter.publishRun({
    principal,
    runId: "abababab-abab-4bab-8bab-abababababab",
    requestId: "transient-background-request"
  });
  assert.equal(retried.status, "publishing");
  assert.equal(retried.leaseAcquired, true);
  assert.equal(new Set(leases).size, 2);
  await tasks[1];

  const completed = await adapter.publishRun({
    principal,
    runId: "abababab-abab-4bab-8bab-abababababab",
    requestId: "transient-background-request"
  });
  assert.equal(completed.status, "published");
  assert.equal(finalizeCalls, 2);
});

test("publicação rejeita curso não aprovado antes de chamar qualquer RPC", async () => {
  const document = await fixture();
  document.courses[0].modules[0].lessons[0].microsequences[0].status = "needs_review";
  let calls = 0;
  await assert.rejects(
    publishOfficialDocumentStep(document, { rpc: async () => { calls += 1; } }),
    (error) => error instanceof AuthoringApiError && error.code === "course_incomplete"
  );
  assert.equal(calls, 0);
});

test("runtime canônico da Edge permanece idêntico aos validadores da aplicação", async () => {
  const pairs = [
    ["src/core/ids.js", "supabase/functions/_shared/aralearn/runtime/core/ids.js"],
    ["src/core/text.js", "supabase/functions/_shared/aralearn/runtime/core/text.js"],
    ["src/core/choiceOptions.js", "supabase/functions/_shared/aralearn/runtime/core/choiceOptions.js"],
    ["src/core/textGaps.js", "supabase/functions/_shared/aralearn/runtime/core/textGaps.js"],
    ["src/core/resourceGaps.js", "supabase/functions/_shared/aralearn/runtime/core/resourceGaps.js"],
    ["src/core/authoringGaps.js", "supabase/functions/_shared/aralearn/runtime/core/authoringGaps.js"],
    ["src/core/validation.js", "supabase/functions/_shared/aralearn/runtime/core/validation.js"],
    ["src/domain/aralearnProject.js", "supabase/functions/_shared/aralearn/runtime/domain/aralearnProject.js"],
    ["src/domain/cards.js", "supabase/functions/_shared/aralearn/runtime/domain/cards.js"],
    ["src/domain/cardExerciseSupport.js", "supabase/functions/_shared/aralearn/runtime/domain/cardExerciseSupport.js"],
    ["src/domain/resources.js", "supabase/functions/_shared/aralearn/runtime/domain/resources.js"],
    ["src/flowchart/flowchartStructure.js", "supabase/functions/_shared/aralearn/runtime/flowchart/flowchartStructure.js"],
    ["src/persistence/relationalSchema.js", "supabase/functions/_shared/aralearn/runtime/persistence/relationalSchema.js"],
    ["src/persistence/contractToRelationalRows.js", "supabase/functions/_shared/aralearn/runtime/persistence/contractToRelationalRows.js"],
    ["src/persistence/relationalRowsToContract.js", "supabase/functions/_shared/aralearn/runtime/persistence/relationalRowsToContract.js"],
    ["src/domain/formulaExpression.js", "supabase/functions/_shared/aralearn/runtime/domain/formulaExpression.js"],
    ["src/persistence/validateRelationalCourse.js", "supabase/functions/_shared/aralearn/runtime/persistence/validateRelationalCourse.js"],
    ["src/persistence/canonicalCourseHash.js", "supabase/functions/_shared/aralearn/runtime/persistence/canonicalCourseHash.js"]
  ];
  for (const [source, runtime] of pairs) {
    const [left, right] = await Promise.all([fs.readFile(source), fs.readFile(runtime)]);
    assert.deepEqual(right, left, `${runtime} divergiu de ${source}`);
  }
});

test("Edge deriva os mesmos UUIDs estáveis usados pelo publicador administrativo", async () => {
  const document = await fixture();
  const edge = await prepareCourseDocument(document, { official: true, requireReady: true });
  const administrative = contractToRelationalRows(document, {
    uuidFactory: catalogIdentityUuidFactory()
  });
  for (const collection of Object.keys(administrative)) {
    assert.deepEqual(
      edge.rows[collection].map((row) => row.id),
      administrative[collection].map((row) => row.id),
      `UUID divergente em ${collection}`
    );
  }
});
