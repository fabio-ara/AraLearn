import assert from "node:assert/strict";
import test from "node:test";

import {
  projectAuthoringDesignSlice,
  projectAuthoringWorkspaceOverview
} from "../../src/authoring/authoringWorkspaceProjection.js";
import {
  createAuthoringDestinationRegistry,
  normalizeAuthoringDesign,
  normalizeAuthoringWorkspaceOverview
} from "../../src/ui/authoringWorkspaceViewModel.js";

const WORKSPACE_ID = "20000000-0000-4000-8000-000000000105";
const PATH = Object.freeze(["course-a", "module-a", "lesson-a", "micro-a"]);

function projectedDesign() {
  return projectAuthoringDesignSlice({
    slice: {
      workspaceId: WORKSPACE_ID,
      revision: 7,
      result: {
        microsequence: { title: "Sinais", path: PATH },
        parameterDefinitions: {
          relevant: [{
            id: "novelty_level",
            version: "1.2.0",
            label: "Novidade",
            valueType: "integer",
            constraints: { minimum: 1, maximum: 5 }
          }]
        },
        assignments: [{
          id: "assignment-a",
          version: "2.0.0",
          definitionRef: { id: "novelty_level", version: "1.2.0" },
          scope: { kind: "microsequence", ref: "micro-a" },
          mode: "manual_override"
        }],
        locks: [],
        effectiveSnapshot: {
          resolvedValues: [{
            definitionRef: { id: "novelty_level", version: "1.2.0" },
            value: { kind: "integer", value: 2 },
            resolution: { assignmentMode: "manual_override", inheritance: "local" }
          }]
        },
        effectiveResourceSets: []
      }
    },
    capability: "author"
  });
}

test("view-model preserva refs versionadas e separa valor canônico do controle escalar", () => {
  const design = normalizeAuthoringDesign(projectedDesign());
  const parameter = design.parameters[0];

  assert.deepEqual(parameter.definitionRef, { id: "novelty_level", version: "1.2.0" });
  assert.deepEqual(parameter.assignmentRef, { id: "assignment-a", version: "2.0.0" });
  assert.deepEqual(parameter.value, { kind: "integer", value: 2 });
  assert.equal(parameter.editableValue, 2);
  assert.equal(parameter.valueText, "2");
  assert.deepEqual(parameter.range, { min: 1, max: 5, step: 1 });
});

test("overview mantém lacunas e alvos indisponíveis sem fabricar navegação", () => {
  const overview = normalizeAuthoringWorkspaceOverview({
    workspaceId: WORKSPACE_ID,
    title: "Curso",
    parts: [{
      partId: "part-a",
      title: "Parte A",
      microsequences: [{
        key: "missing-a",
        title: "Conteúdo retirado",
        state: "missing",
        stateLabel: "Indisponível"
      }]
    }],
    findings: [{
      findingId: "finding-a",
      summary: "Alvo retirado",
      targetAvailable: false,
      returnContext: { findingId: "finding-a" },
      entityPath: PATH,
      readerTarget: { entityPath: PATH }
    }],
    findingsTotal: 25,
    findingsTruncated: true,
    findingsNextCursor: { createdAt: "2026-08-15T12:00:00Z", id: "finding-a" }
  });

  assert.equal(overview.parts[0].microsequences[0].state.key, "missing");
  assert.equal(overview.parts[0].microsequences[0].entityPath, null);
  assert.equal(overview.findings[0].targetAvailable, false);
  assert.equal(overview.findings[0].readerTarget, null);
  assert.deepEqual(overview.findings[0].returnContext, { findingId: "finding-a" });
  assert.equal(overview.findingsTotal, 25);
  assert.equal(overview.findingsTruncated, true);
  assert.deepEqual(overview.findingsNextCursor, {
    createdAt: "2026-08-15T12:00:00Z",
    id: "finding-a"
  });
});

test("registry mantém quatro destinos atuais e aceita Resultados sem alterar o shell", () => {
  const current = createAuthoringDestinationRegistry();
  const extended = createAuthoringDestinationRegistry([{
    key: "results",
    label: "Resultados",
    icon: "chart",
    available: ({ hasData }) => hasData === true
  }]);

  assert.deepEqual(current.map(({ key }) => key), ["map", "design", "content", "audit"]);
  assert.deepEqual(extended.map(({ key }) => key), ["map", "design", "content", "audit", "results"]);
  assert.equal(extended.at(-1).available({ hasData: false }), false);
  assert.equal(extended.at(-1).available({ hasData: true }), true);
});

test("mapa usa máscara canônica f/a, activeCount truncado e mantém micros sem Parte", () => {
  const course = {
    id: "course-a",
    title: "Curso",
    modules: [{
      id: "module-a",
      title: "Módulo",
      lessons: [{
        id: "lesson-a",
        title: "Lição",
        microsequences: [
          { id: "micro-a", title: "Com finding", cardCount: 0 },
          { id: "micro-b", title: "Analisada", cardCount: 0 },
          { id: "micro-c", title: "Fora da Parte", cardCount: 0 }
        ]
      }]
    }]
  };
  const overview = projectAuthoringWorkspaceOverview({
    outline: { workspaceId: WORKSPACE_ID, revision: 9, title: "Curso", content: { courses: [course] } },
    resume: {
      workspaceId: WORKSPACE_ID,
      revision: 9,
      content: {
        parts: [{
          id: "part-a",
          title: "Parte A",
          microsequenceIds: ["micro-a", "micro-b", "micro-missing"],
          microsequenceStateMask: "fax"
        }],
        unassignedMicrosequenceStateMap: { "micro-c": "f" },
        findings: { items: [], summary: { activeCount: 25 }, truncated: true }
      }
    }
  });

  assert.equal(overview.state, "audit_pending");
  assert.equal(overview.findingsTotal, 25);
  assert.equal(overview.parts[0].microsequences[0].state, "audit_pending");
  assert.equal(overview.parts[0].microsequences[1].state, "analyzed");
  assert.equal(overview.parts[0].microsequences[2].state, "missing");
  assert.equal(overview.parts[1].microsequences[0].state, "audit_pending");
});

test("conflito tem precedência e expõe request para retry sem aparecer como pendente", () => {
  const projected = projectAuthoringDesignSlice({
    slice: {
      workspaceId: WORKSPACE_ID,
      revision: 4,
      result: {
        microsequence: { title: "Sinais", path: PATH },
        parameterDefinitions: { relevant: [{
          id: "novelty_level",
          version: "1.2.0",
          label: "Novidade",
          valueType: "integer",
          constraints: { minimum: 1, maximum: 5 }
        }] },
        assignments: [],
        locks: [],
        effectiveSnapshot: { resolvedValues: [] },
        effectiveResourceSets: []
      }
    },
    capability: "author",
    pendingOperations: [{
      requestId: "40000000-0000-4000-8000-000000000004",
      status: "conflict",
      errorMessage: "O workspace mudou.",
      definitionRef: { id: "novelty_level", version: "1.2.0" }
    }]
  });

  assert.equal(projected.pending, false);
  assert.equal(projected.conflict, true);
  assert.equal(projected.parameters[0].pending, false);
  assert.equal(projected.parameters[0].conflict, true);
  assert.equal(projected.parameters[0].pendingRequestId, "40000000-0000-4000-8000-000000000004");
});
