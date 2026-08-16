import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import {
  AUTHORING_SERVER_INSTRUCTIONS,
  prepareAuthoringContext
} from "../../supabase/functions/_shared/aralearn-authoring/authoringKnowledge.js";
import {
  readInstructionalDesignContract
} from "../../supabase/functions/_shared/aralearn-authoring/authoringDesignService.js";
import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  authoringMcpToolIsAllowed,
  mapAuthoringMcpToolCall,
  validateAuthoringMcpToolOutput
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

// Regressão determinística do protocolo #106. Os replays do corpus não são
// chamadas a um modelo e estes testes não medem aprendizagem ou eficácia.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORPUS_PATH = path.join(
  ROOT,
  "authoring",
  "evals",
  "instructional-conformance-audit-scenarios.v1.json"
);
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000106";
const MICROSEQUENCE_PATH = ["course-a", "module-a", "lesson-a", "micro-a"];
const REQUEST_ID = "audit-request-00000001";
const AUDIT_RUN_REF = {
  id: "40000000-0000-4000-8000-000000000106",
  version: "1.0.0"
};
const PART_AUDIT_SCOPE = { kind: "part", ref: "part-a" };

const corpus = JSON.parse(await readFile(CORPUS_PATH, "utf8"));

function designTool() {
  return AUTHORING_WORKSPACE_MCP_TOOLS.find(
    ({ name }) => name === "gerirDesenhoInstrucional"
  );
}

function allScenarioFindings(scenario) {
  return [
    ...(scenario.expected?.deterministicFindings || []),
    ...(scenario.expected?.semanticFindings || []),
    ...(scenario.initialAudit?.finding ? [scenario.initialAudit.finding] : []),
    ...(scenario.reaudit?.newFindings || []),
    ...(scenario.candidateFinding ? [scenario.candidateFinding] : [])
  ];
}

function normalizedKey(value) {
  return String(value).replace(/[^A-Za-z0-9]/gu, "").toLowerCase();
}

function collectKeys(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, result));
    return result;
  }
  for (const [key, item] of Object.entries(value)) {
    result.push(normalizedKey(key));
    collectKeys(item, result);
  }
  return result;
}

function summary({ deterministic = 1, semantic = 0 } = {}) {
  const total = deterministic + semantic;
  return {
    dimensions: {
      structure: { status: deterministic ? "finding" : "conformant", findingCount: deterministic },
      design: { status: semantic ? "finding" : "conformant", findingCount: semantic },
      practice: { status: "conformant", findingCount: 0 },
      resources: { status: "conformant", findingCount: 0 },
      coverage: { status: "not_checked", findingCount: 0 },
      coherence: { status: "not_checked", findingCount: 0 },
      dependencies: { status: "not_checked", findingCount: 0 },
      redundancy: { status: "not_checked", findingCount: 0 },
      integration: { status: "not_checked", findingCount: 0 }
    },
    checks: { passed: 12, failed: deterministic, notApplicable: 2 },
    findings: { deterministic, semantic, total },
    metrics: [{
      id: "materialized_card_count",
      kind: "derived",
      value: 2,
      unit: "card",
      denominator: {
        count: 2,
        unit: "materialized_card",
        refs: { items: ["card-a", "card-b"], count: 2, truncated: false }
      },
      algorithm: {
        id: "aralearn.instructional-conformance",
        version: "1.0.0",
        inputRefs: {
          items: ["manifest-a@1.0.0", "card-a", "card-b"],
          count: 3,
          truncated: false
        }
      }
    }]
  };
}

function finding() {
  return {
    findingId: "30000000-0000-4000-8000-000000000106",
    code: "practice_after_required_theory",
    category: "practice",
    origin: "deterministic",
    severity: "high",
    status: "open",
    target: {
      entityType: "card",
      entityPath: [...MICROSEQUENCE_PATH, "card-a"],
      resourceTargetId: null
    },
    currentEntityPath: [...MICROSEQUENCE_PATH, "card-a"],
    targetAvailable: true,
    auditPartId: null,
    ruleRef: { kind: "requirement", id: "theoryBeforePractice", version: "1.0.0" },
    publicEvidence: "A prática ocupa a posição 1 e a teoria necessária a posição 2.",
    proposedRepair: "Reposicionar a prática depois da fundamentação.",
    detectedRevision: 10,
    auditRunRef: AUDIT_RUN_REF,
    artifactRefs: {
      analysisRef: { id: "analysis-a", version: "1.0.0" },
      effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
      blueprintRef: { id: "blueprint-a", version: "1.0.0" },
      bindingRef: { id: "binding-a", version: "1.0.0" },
      manifestRef: { id: "manifest-a", version: "1.0.0" },
      resourceSetRefs: {
        items: [{ id: "resource-set-a", version: "1.0.0" }],
        count: 1,
        truncated: false
      },
      microsequenceRefs: {
        items: ["micro-a"],
        count: 1,
        truncated: false
      }
    },
    verificationAuditRunRef: null,
    pendingCorrectionRequestId: null,
    pendingRevision: null,
    correctionRequestId: null,
    resultingRevision: null,
    verification: null,
    verifiedRevision: null
  };
}

function latestAuditRun(status = "semantic_pending") {
  return {
    ref: AUDIT_RUN_REF,
    kind: "audit",
    status,
    current: true,
    scope: { kind: "microsequence", ref: "micro-a" },
    startedRevision: 10,
    completedRevision: status === "complete" ? 11 : null,
    createdAt: "2026-08-15T12:00:00.000Z",
    completedAt: status === "complete" ? "2026-08-15T12:01:00.000Z" : null
  };
}

test("corpus #106 cobre exatamente os oito contrastes normativos", () => {
  assert.equal(
    corpus.contract,
    "aralearn.instructional-conformance-audit-scenarios.v1"
  );
  assert.equal(corpus.version, 1);
  assert.equal(corpus.evaluationKind, "engineering-regression");
  assert.deepEqual(corpus.scenarios.map(({ id }) => id), [
    "1", "2", "3", "4", "5", "6", "7", "8"
  ]);
  assert.match(corpus.claimBoundary, /não mede aprendizagem ou eficácia/iu);
  assert.deepEqual(corpus.protocol.runKinds, ["audit", "reaudit"]);
  assert.deepEqual(corpus.protocol.order, [
    "run_audit",
    "read_all_pages",
    "record_semantic_audit",
    "human_decision",
    "repair_approved_only",
    "new_run_for_reaudit"
  ]);

  const dns = corpus.scenarios[0].materialization.cards[0].text;
  assert.ok(corpus.scenarios.slice(0, 7).every(({ runKind }) => runKind === "audit"));
  assert.match(dns, /Domain Name System \(DNS\)/u);
  assert.match(dns, /base distribuída de registros de recursos/iu);
  assert.match(dns, /não aloca endereços por concessão/iu);
  assert.equal(corpus.scenarios[2].analysis.declaredPracticeCoverage, "2/2");
  assert.equal(corpus.scenarios[5].analysis.researchLock, true);
  assert.equal(corpus.scenarios[7].reaudit.readCurrentState, true);
  assert.equal(corpus.scenarios[7].initialAudit.kind, "audit");
  assert.equal(corpus.scenarios[7].reaudit.kind, "reaudit");
});

test("corpus não persiste raciocínio privado e mantém regra e alvo verificáveis", () => {
  const forbidden = new Set(corpus.protocol.forbiddenPersistence.map(normalizedKey));
  for (const key of collectKeys(corpus.scenarios)) {
    assert.equal(forbidden.has(key), false, `chave proibida persistida: ${key}`);
  }

  const rules = new Set(corpus.ruleCatalog.map(
    ({ kind, id, version }) => `${kind}|${id}|${version}`
  ));
  for (const scenario of corpus.scenarios) {
    const targets = new Set(
      (scenario.materialization.targetPaths || []).map((value) => JSON.stringify(value))
    );
    for (const item of allScenarioFindings(scenario)) {
      assert.ok(
        targets.has(JSON.stringify(item.target.entityPath)),
        `${scenario.id}/${item.code}: alvo inexistente`
      );
      assert.ok(
        rules.has(`${item.ruleRef.kind}|${item.ruleRef.id}|${item.ruleRef.version}`),
        `${scenario.id}/${item.code}: regra inexistente`
      );
      assert.ok(item.publicEvidence.length <= 1_000, scenario.id);
      assert.doesNotMatch(item.publicEvidence, /raciocínio|delibera(?:ção|r)|chain.of.thought/iu);
    }
  }
});

test("replays semânticos preservam núcleo e estabilidade não concede autoridade", () => {
  for (const id of ["1", "2", "3", "5", "7"]) {
    const scenario = corpus.scenarios.find((value) => value.id === id);
    assert.equal(scenario.repeatedSemanticRuns.length, 3, id);
    const baseline = scenario.repeatedSemanticRuns[0].findingKeys;
    for (const run of scenario.repeatedSemanticRuns.slice(1)) {
      assert.deepEqual(run.findingKeys, baseline, `${id}/run-${run.run}`);
    }
  }

  const falsePositive = corpus.scenarios.find(({ id }) => id === "7");
  assert.equal(falsePositive.candidateFinding.humanJustifiable, false);
  assert.equal(falsePositive.expected.humanDecision.outcome, "rejected");
  assert.equal(falsePositive.expected.humanDecision.repairAuthorized, false);
  assert.deepEqual(falsePositive.expected.semanticFindings, []);

  const candidates = corpus.scenarios.flatMap((scenario) => allScenarioFindings(scenario));
  const justifiableRate = candidates.filter(({ humanJustifiable }) => humanJustifiable).length
    / candidates.length;
  assert.ok(justifiableRate >= 0.8 && justifiableRate < 1);
});

test("checks determinísticos do corpus são derivados das observações", () => {
  const order = corpus.scenarios.find(({ id }) => id === "4");
  assert.equal(order.materialization.cardOrder[0].role, "practice");
  assert.equal(order.materialization.cardOrder[1].role, "theory");
  assert.equal(
    order.expected.deterministicFindings[0].code,
    "practice_after_required_theory"
  );

  const condition = corpus.scenarios.find(({ id }) => id === "6");
  const allowed = new Set(condition.materialization.allowedPackages);
  assert.ok(condition.materialization.actualPackages.some((value) => !allowed.has(value)));
  assert.equal(
    condition.expected.deterministicFindings[0].code,
    "actual_resources_preserve_resource_set_condition"
  );

  const repair = corpus.scenarios.find(({ id }) => id === "8");
  assert.notEqual(repair.initialAudit.auditRunRef.id, repair.reaudit.auditRunRef.id);
  assert.equal(repair.reaudit.verifications[0].outcome, "resolved");
  assert.equal(repair.materialization.afterRepair[0].role, "practice");
  assert.equal(repair.materialization.afterRepair[1].role, "theory");
  assert.equal(repair.reaudit.newFindings[0].code, "practice_after_required_theory");
});

test("knowledge JIT entrega protocolo e mantém rubrica fora do system prompt", async () => {
  const prepared = prepareAuthoringContext({
    intent: "audit",
    targetEntity: "microsequence",
    context: "auditar materialização, findings semânticos e reauditoria"
  });
  assert.ok(prepared.guidance.length <= 8);
  assert.ok(prepared.recommendedTools.includes("gerirDesenhoInstrucional"));
  const conformance = prepared.guidance.find(({ id }) => id === "design-conformance-audit");
  assert.ok(conformance);
  assert.match(conformance.text, /run_audit/iu);
  assert.match(conformance.text, /record_semantic_audit/iu);
  assert.match(conformance.text, /publicEvidence/u);
  assert.match(conformance.text, /não autoriza reparo/iu);

  assert.match(AUTHORING_SERVER_INSTRUCTIONS, /run_audit/iu);
  assert.match(AUTHORING_SERVER_INSTRUCTIONS, /record_semantic_audit/iu);
  assert.doesNotMatch(
    AUTHORING_SERVER_INSTRUCTIONS,
    /semantic_excessive_compression|semantic_practice_operation_mismatch/u
  );

  const prompt = await readFile(
    path.join(ROOT, "authoring", "platforms", "chatgpt", "INSTRUCTIONS.md"),
    "utf8"
  );
  assert.ok(prompt.length < 7_600);
  assert.match(prompt, /run_audit/iu);
  assert.doesNotMatch(prompt, /semantic_excessive_compression/u);
});

test("ferramenta coesa preserva 30 tools e pagina a view audit", () => {
  const definition = designTool();
  assert.equal(AUTHORING_WORKSPACE_MCP_TOOLS.length, 30);
  for (const operation of ["run_audit", "record_semantic_audit"]) {
    assert.ok(definition.inputSchema.properties.operation.enum.includes(operation));
  }
  assert.ok(definition.inputSchema.properties.view.enum.includes("audit"));
  for (const contractName of [
    "action_run_audit", "action_record_semantic_audit"
  ]) {
    assert.ok(definition.inputSchema.properties.contractName.enum.includes(contractName));
    assert.equal(mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
      operation: "contracts",
      workspaceId: WORKSPACE_ID,
      contractName
    }).body.contractName, contractName);
  }

  const mapped = mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: "audit",
    auditRunRef: AUDIT_RUN_REF,
    cursor: "25",
    limit: 25
  });
  assert.deepEqual(mapped.body, {
    operation: "read_slice",
    microsequencePath: MICROSEQUENCE_PATH,
    view: "audit",
    auditRunRef: AUDIT_RUN_REF,
    cursor: "25",
    limit: 25
  });

  const mappedPart = mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: "audit",
    auditScope: PART_AUDIT_SCOPE,
    limit: 20,
    componentCursor: "10",
    componentLimit: 10
  });
  assert.deepEqual(mappedPart.body, {
    operation: "read_slice",
    microsequencePath: MICROSEQUENCE_PATH,
    view: "audit",
    auditScope: PART_AUDIT_SCOPE,
    limit: 20,
    componentCursor: "10",
    componentLimit: 10
  });

  assert.throws(() => mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: "audit",
    auditRunRef: AUDIT_RUN_REF,
    auditScope: PART_AUDIT_SCOPE
  }), ({ code }) => code === "invalid_tool_arguments");
  assert.throws(() => mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: "overview",
    auditScope: PART_AUDIT_SCOPE
  }), ({ code }) => code === "invalid_tool_arguments");
  assert.throws(() => mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: "audit",
    auditScope: { kind: "course", ref: "course-a" }
  }), ({ code }) => code === "invalid_tool_arguments");

  assert.throws(() => mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: "overview",
    auditRunRef: AUDIT_RUN_REF
  }), ({ code }) => code === "invalid_tool_arguments");
  assert.throws(() => mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: "audit",
    limit: 51
  }), ({ code }) => code === "invalid_tool_arguments");
  assert.throws(() => mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: "overview",
    componentCursor: "10"
  }), ({ code }) => code === "invalid_tool_arguments");
  assert.throws(() => mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: "audit",
    componentLimit: 11
  }), ({ code }) => code === "invalid_tool_arguments");
  assert.throws(() => mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "contracts",
    workspaceId: WORKSPACE_ID,
    contractNames: ["action_run_audit", "action_record_semantic_audit"]
  }), ({ code }) => code === "invalid_tool_arguments");
});

test("run e registro semântico usam envelope CAS e autoridade de escrita", () => {
  const run = mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "run_audit",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    expectedRevision: 10,
    requestId: REQUEST_ID,
    payloadJson: JSON.stringify({
      kind: "audit",
      scope: { kind: "microsequence", ref: "micro-a" }
    })
  });
  assert.deepEqual(run.body, {
    operation: "run_audit",
    microsequencePath: MICROSEQUENCE_PATH,
    expectedRevision: 10,
    requestId: REQUEST_ID,
    payload: { kind: "audit", scope: { kind: "microsequence", ref: "micro-a" } }
  });

  const record = mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "record_semantic_audit",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    expectedRevision: 11,
    requestId: "audit-request-00000002",
    payloadJson: JSON.stringify({
      auditRunRef: AUDIT_RUN_REF,
      findings: [{
        code: "semantic_explanation_only_mentioned",
        category: "explanation",
        severity: "high",
        target: {
          entityType: "card",
          entityPath: [...MICROSEQUENCE_PATH, "card-a"],
          resourceTargetId: null
        },
        ruleRef: { kind: "requirement", id: "explanationRequirements", version: "1.0.0" },
        publicEvidence: "O requisito é apenas mencionado.",
        proposedRepair: null
      }],
      verifications: []
    })
  });
  assert.equal(record.body.operation, "record_semantic_audit");
  assert.equal(record.body.payload.findings[0].publicEvidence, "O requisito é apenas mencionado.");
  assert.equal(Object.hasOwn(record.body.payload.findings[0], "origin"), false);

  const readPrincipal = {
    authenticationKind: "oauth",
    actorId: "20000000-0000-4000-8000-000000000106",
    scopes: ["authoring:read"]
  };
  assert.equal(authoringMcpToolIsAllowed(
    "gerirDesenhoInstrucional", readPrincipal, { operation: "run_audit" }
  ), false);
  assert.equal(authoringMcpToolIsAllowed(
    "gerirDesenhoInstrucional",
    { ...readPrincipal, scopes: ["authoring:write"] },
    { operation: "run_audit" }
  ), true);
});

test("contracts JIT são fechados e rejeitam raciocínio privado", () => {
  const examples = {
    action_run_audit: {
      kind: "audit",
      scope: { kind: "microsequence", ref: "micro-a" }
    },
    action_record_semantic_audit: {
      auditRunRef: AUDIT_RUN_REF,
      findings: [{
        code: "semantic_explanation_only_mentioned",
        category: "explanation",
        severity: "high",
        target: {
          entityType: "card",
          entityPath: [...MICROSEQUENCE_PATH, "card-a"],
          resourceTargetId: null
        },
        ruleRef: { kind: "requirement", id: "explanationRequirements", version: "1.0.0" },
        publicEvidence: "O requisito é apenas mencionado.",
        proposedRepair: null
      }],
      verifications: []
    }
  };

  for (const [contractName, example] of Object.entries(examples)) {
    const response = readInstructionalDesignContract({
      workspaceId: WORKSPACE_ID,
      contractName
    });
    assert.equal(response.result.contractName, contractName);
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(response.result.schema);
    assert.equal(validate(example), true, ajv.errorsText(validate.errors));
    assert.equal(validate({ ...example, privateReasoning: "não persistir" }), false);
    assert.ok(Buffer.byteLength(JSON.stringify(response), "utf8") < 96 * 1_024);
  }
});

test("outputs de auditoria são compactos e fechados", () => {
  const auditPage = {
    latestAuditRun: latestAuditRun(),
    summary: summary(),
    components: {
      items: [],
      count: 0,
      nextCursor: null,
      truncated: false
    },
    findings: [finding()],
    total: 1,
    nextCursor: null,
    truncated: false
  };
  const readOutput = {
    ok: true,
    requestId: null,
    data: {
      operation: "read_slice",
      workspaceId: WORKSPACE_ID,
      revision: 10,
      result: {
        contract: "aralearn.authoring-design-slice.v1",
        view: "audit",
        availableViews: ["audit"],
        workspace: {},
        microsequence: {},
        coordination: {},
        states: {},
        artifacts: {
          analysisRef: null,
          effectiveSnapshotRef: null,
          blueprintRef: null,
          bindingRef: null,
          manifestRef: null,
          effectiveResourceSetRefs: [],
          blueprintHash: null,
          bindingHash: null,
          scopeEntityVersion: null,
          blueprintCreatedRevision: null
        },
        nextAction: "Apresentar os findings sem reparar.",
        audit: auditPage
      }
    }
  };
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    readOutput
  ));
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    {
      ...readOutput,
      data: {
        ...readOutput.data,
        result: {
          ...readOutput.data.result,
          audit: {
            ...auditPage,
            latestAuditRun: { ...auditPage.latestAuditRun, current: false }
          }
        }
      }
    }
  ));
  assert.throws(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    {
      ...readOutput,
      data: {
        ...readOutput.data,
        result: {
          ...readOutput.data.result,
          audit: {
            ...auditPage,
            latestAuditRun: {
              ...auditPage.latestAuditRun,
              current: undefined
            }
          }
        }
      }
    }
  ));
  assert.throws(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    {
      ...readOutput,
      data: {
        ...readOutput.data,
        result: {
          ...readOutput.data.result,
          audit: {
            ...auditPage,
            components: {
              items: [{
                ordinal: 1,
                microsequenceRef: "micro-a",
                microsequencePath: null,
                childAuditRunRef: AUDIT_RUN_REF,
                auditedRevision: null,
                contentHash: null,
                status: "not_audited",
                targetAvailable: true
              }],
              count: 1,
              nextCursor: null,
              truncated: false
            }
          }
        }
      }
    }
  ));
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    {
      ...readOutput,
      data: {
        ...readOutput.data,
        result: { ...readOutput.data.result, audit: null }
      }
    }
  ));

  const runOutput = {
    ok: true,
    requestId: REQUEST_ID,
    data: {
      operation: "run_audit",
      workspaceId: WORKSPACE_ID,
      revision: 11,
      replayed: false,
      result: {
        auditRunRef: AUDIT_RUN_REF,
        kind: "audit",
        status: "semantic_pending",
        scope: { kind: "microsequence", ref: "micro-a" },
        startedRevision: 10,
        findingCount: 1
      }
    }
  };
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    runOutput
  ));
  assert.ok(Buffer.byteLength(JSON.stringify(runOutput), "utf8") < 96 * 1_024);
  const largestAdvertisedPage = {
    ...readOutput,
    data: {
      ...readOutput.data,
      result: {
        ...readOutput.data.result,
        workspace: { brief: "b".repeat(16_000) },
        audit: {
          ...auditPage,
          components: {
            items: Array.from({ length: 10 }, (_, index) => {
              const microsequenceRef = `micro-${index}-${"m".repeat(220)}`;
              return {
                ordinal: index + 1,
                microsequenceRef,
                microsequencePath: [
                  `course-${"c".repeat(220)}`,
                  `module-${"o".repeat(220)}`,
                  `lesson-${"l".repeat(220)}`,
                  microsequenceRef
                ],
                childAuditRunRef: {
                  id: `audit-${index}-${"a".repeat(220)}`,
                  version: "1.0.0"
                },
                auditedRevision: 10,
                contentHash: "a".repeat(64),
                status: "complete",
                targetAvailable: true
              };
            }),
            count: 500,
            nextCursor: "10",
            truncated: true
          },
          findings: Array.from({ length: 2 }, (_, index) => ({
            ...finding(),
            findingId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            publicEvidence: "e".repeat(2_000),
            proposedRepair: "r".repeat(1_000),
            verification: "v".repeat(1_000),
            artifactRefs: {
              ...finding().artifactRefs,
              resourceSetRefs: {
                items: Array.from({ length: 20 }, (_, refIndex) => ({
                  id: `resource-set-${refIndex}-${"x".repeat(220)}`,
                  version: "1.0.0"
                })),
                count: 128,
                truncated: true
              },
              microsequenceRefs: {
                items: Array.from({ length: 20 }, (_, refIndex) =>
                  `micro-${refIndex}-${"x".repeat(220)}`),
                count: 500,
                truncated: true
              }
            }
          })),
          total: 500,
          nextCursor: "2",
          truncated: true
        }
      }
    }
  };
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    largestAdvertisedPage
  ));
  assert.ok(
    Buffer.byteLength(JSON.stringify(largestAdvertisedPage), "utf8") < 96 * 1_024
  );
  assert.throws(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    {
      ...runOutput,
      data: {
        ...runOutput.data,
        result: { ...runOutput.data.result, privateReasoning: "não permitido" }
      }
    }
  ));

  const recordOutput = {
    ok: true,
    requestId: "audit-request-00000002",
    data: {
      operation: "record_semantic_audit",
      workspaceId: WORKSPACE_ID,
      revision: 12,
      replayed: false,
      result: {
        auditRunRef: AUDIT_RUN_REF,
        status: "complete",
        recordedCount: 1,
        verifiedCount: 0,
        findingIds: ["30000000-0000-4000-8000-000000000107"],
        verificationFindingIds: []
      }
    }
  };
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    recordOutput
  ));
  assert.throws(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    {
      ...recordOutput,
      data: {
        ...recordOutput.data,
        result: {
          ...recordOutput.data.result,
          summary: summary({ deterministic: 1, semantic: 1 })
        }
      }
    }
  ));
});
