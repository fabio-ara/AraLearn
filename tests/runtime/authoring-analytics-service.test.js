import assert from "node:assert/strict";
import test from "node:test";

import {
  executeAuthoringAnalyticsAction,
  executeExperimentOutcomeAction
} from "../../supabase/functions/_shared/aralearn-authoring/authoringAnalyticsService.js";
import {
  validateExperimentEnrollmentActionPayload,
  validateWorkspaceAnalyticsActionPayload
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";
import {
  authoringApplicationToolDefinition,
  authoringMcpToolDefinition,
  validateAuthoringApplicationToolOutput
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const ACTOR = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const EXPERIMENT = "30000000-0000-4000-8000-000000000001";
const ENROLLMENT = "40000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);

function envelope(data) {
  return { ok: true, requestId: null, data };
}

test("analytics permanece app-only e valida paginação pinada", () => {
  assert.equal(authoringMcpToolDefinition("consultarAnalyticsInstrucional"), null);
  assert.ok(authoringApplicationToolDefinition("consultarAnalyticsInstrucional"));
  assert.throws(() => validateWorkspaceAnalyticsActionPayload({
    operation: "dataset",
    scope: { kind: "workspace" },
    dataset: "authoring_design",
    cursor: "20"
  }), /datasetSetRef/u);
  assert.throws(() => validateWorkspaceAnalyticsActionPayload({
    operation: "dataset",
    scope: { kind: "workspace" },
    dataset: "experiment_outcomes"
  }), /incompatíveis/u);
  assert.throws(() => validateWorkspaceAnalyticsActionPayload({
    operation: "overview",
    scope: { kind: "lesson", ref: "lesson-a" }
  }), /somente o workspace ou um experimento/u);
});

test("overview e dataset preservam pin, dicionário e teto progressivo", async () => {
  const calls = [];
  const adapter = {
    async getAuthoringAnalyticsOverview(options) {
      calls.push(options);
      return {
        schemaVersion: "1.0.0",
        workspaceRevision: 7,
        scope: { kind: "workspace" },
        overviewSetRef: { id: "analytics-overview", version: HASH },
        permissions: { design: true, process: true, learning: true, experiment: false, export: true },
        sections: [{ key: "learning", label: "Aprendizagem", question: "O quê?", visualizations: [], empty: true }]
      };
    },
    async listAuthoringAnalyticsDataset(options) {
      calls.push(options);
      return {
        schemaVersion: "1.0.0",
        dataset: "authoring_design",
        scope: { kind: "workspace" },
        datasetSetRef: { id: "analytics-design", version: HASH },
        dictionary: [{ metricRef: { id: "design.assignment_origin", version: "1.0.0" }, label: "Origem" }],
        page: { items: [{ rowKind: "parameter", origin: "auto" }], count: 1, nextCursor: null, truncated: false }
      };
    }
  };
  const overview = await executeAuthoringAnalyticsAction({
    adapter, principal: { actorId: ACTOR }, workspaceId: WORKSPACE,
    operation: "overview", scope: { kind: "workspace" }
  });
  const dataset = await executeAuthoringAnalyticsAction({
    adapter, principal: { actorId: ACTOR }, workspaceId: WORKSPACE,
    operation: "dataset", scope: { kind: "workspace" }, dataset: "authoring_design"
  });
  assert.equal(overview.sections[0].empty, true);
  assert.equal(dataset.page.items[0].origin, "auto");
  assert.doesNotThrow(() => validateAuthoringApplicationToolOutput(
    "consultarAnalyticsInstrucional", envelope(overview)
  ));
  assert.doesNotThrow(() => validateAuthoringApplicationToolOutput(
    "consultarAnalyticsInstrucional", envelope(dataset)
  ));
  assert.equal(calls.length, 2);
});

test("exportação cria chunks CSV/JSON equivalentes e outcome usa receipt", async () => {
  const adapter = {
    async listAuthoringAnalyticsDataset() {
      return {
        schemaVersion: "1.0.0",
        dataset: "experiment_outcomes",
        scope: { kind: "experiment", ref: EXPERIMENT },
        datasetSetRef: { id: "analytics-outcomes", version: HASH },
        dictionary: [],
        page: {
          items: [{ rowKind: "outcome", participantRef: `participant:${ENROLLMENT}`, value: 3 }],
          count: 1, nextCursor: null, truncated: false
        }
      };
    },
    async recordAuthoringExperimentOutcome(options) {
      assert.match(options.payloadHash, /^[a-f0-9]{64}$/u);
      return {
        observationRef: "50000000-0000-4000-8000-000000000001",
        enrollmentRef: ENROLLMENT,
        experimentId: EXPERIMENT,
        datasetRevision: 1,
        idempotent: false
      };
    }
  };
  for (const format of ["csv", "json"]) {
    const exported = await executeAuthoringAnalyticsAction({
      adapter, principal: { actorId: ACTOR }, workspaceId: WORKSPACE,
      operation: "export", scope: { kind: "experiment", ref: EXPERIMENT },
      dataset: "experiment_outcomes", format
    });
    assert.equal(exported.complete, true);
    assert.match(exported.chunk, /participant:/u);
    assert.doesNotThrow(() => validateAuthoringApplicationToolOutput(
      "consultarAnalyticsInstrucional", envelope(exported)
    ));
  }
  const validated = validateExperimentEnrollmentActionPayload({
    operation: "record_outcome",
    workspaceId: WORKSPACE,
    enrollmentRef: ENROLLMENT,
    requestId: "outcome:record:0001",
    instrumentRef: { id: "instrument-a", version: "1.0.0" },
    outcomeRef: { id: "outcome-a", version: "1.0.0" },
    wave: "post",
    valueKind: "missing",
    value: null,
    missingReason: "não coletado",
    observedAt: "2026-08-16T16:00:00.000Z"
  });
  const receipt = await executeExperimentOutcomeAction({
    adapter, principal: { actorId: ACTOR }, ...validated
  });
  assert.equal(receipt.datasetRevision, 1);
});
