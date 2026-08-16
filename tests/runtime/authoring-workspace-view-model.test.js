import assert from "node:assert/strict";
import test from "node:test";

import {
  projectAuthoringAuditSlice,
  projectAuthoringDesignSlice,
  projectAuthoringWorkspaceOverview
} from "../../src/authoring/authoringWorkspaceProjection.js";
import {
  createAuthoringDestinationRegistry,
  mergeAuthoringExperimentSections,
  normalizeAuthoringExperiment,
  normalizeAuthoringExperimentList,
  normalizeAuthoringDesign,
  normalizeAuthoringAuditSlice,
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
  assert.equal(overview.findings[0].legacyCompatible, true);
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

test("lista experimental preserva opções bounded e somente bases aprovadas", () => {
  const result = normalizeAuthoringExperimentList({
    workspaceId: WORKSPACE_ID,
    revision: 12,
    experimentSetRef: { id: "experiment-set", version: "12" },
    items: [{
      id: "experiment-a",
      title: "Novidade por passo",
      status: "correction_required",
      protocolRevision: 3,
      scope: { kind: "lesson", ref: "lesson-a", label: "Lição A" },
      factorCount: 2,
      conditionCount: 3,
      variantCount: 3
    }],
    options: {
      scopes: [{
        scope: { kind: "course", ref: "course-a" },
        label: "Curso A",
        entityPath: ["course-a"]
      }],
      bases: [{
        ref: { id: "base-a", version: "2.0.0" },
        label: "Base aprovada",
        approved: true
      }, {
        ref: { id: "base-draft", version: "1.0.0" },
        label: "Base em edição",
        approved: false
      }],
      factorDefinitions: [{
        ref: { id: "new_units", version: "1.0.0" },
        label: "Novidade",
        valueType: "integer",
        unit: "unidades por passo",
        constraints: { minimum: 1, maximum: 5 }
      }, {
        ref: { id: "available_resources", version: "1.0.0" },
        label: "Resources disponíveis",
        kind: "resource_set",
        targets: [{ kind: "microsequence", ref: "micro-a", label: "Sinais" }]
      }],
      resourceSets: [{
        ref: { id: "resources-a", version: "4.0.0" },
        label: "Texto e tabela",
        memberCount: 2
      }],
      consentPolicies: [{
        ref: { id: "consent-a", version: "1.0.0" },
        label: "Consentimento A"
      }],
      instruments: [{ ref: { id: "instrument-a", version: "1.0.0" }, label: "Instrumento A" }],
      outcomes: [{ ref: { id: "retention-a", version: "1.0.0" }, label: "Retenção" }]
    }
  });

  assert.equal(result.workspaceRevision, 12);
  assert.deepEqual(result.experimentSetRef, { id: "experiment-set", version: "12" });
  assert.equal(result.items[0].statusLabel, "Correções necessárias");
  assert.equal(result.items[0].conditionCount, 3);
  assert.deepEqual(result.options.scopes[0], {
    kind: "course", ref: "course-a", label: "Curso A", entityPath: ["course-a"]
  });
  assert.equal(result.options.bases.length, 1);
  assert.deepEqual(result.options.bases[0].ref, { id: "base-a", version: "2.0.0" });
  assert.equal(result.options.factorDefinitions[0].range.min, 1);
  assert.equal(result.options.factorDefinitions[1].kind, "resource_set");
  assert.equal(result.options.resourceSets[0].memberCount, 2);
  assert.equal(result.options.consentPolicies[0].label, "Consentimento A");
  assert.equal(result.options.outcomes[0].label, "Retenção");
});

test("detalhe experimental separa Resources permitidos, materializados e diferenças acidentais", () => {
  const experiment = normalizeAuthoringExperiment({
    workspaceId: WORKSPACE_ID,
    revision: 19,
    experiment: {
      id: "experiment-a",
      title: "Disponibilidade de representações",
      status: "ready",
      protocolRevision: 4,
      base: {
        ref: { id: "base-a", version: "2.0.0" },
        label: "Base B17",
        approved: true
      },
      scope: { kind: "microsequence", ref: "micro-a", label: "Sinais" },
      factors: [{
        factorId: "factor-resources",
        ref: { id: "available_resources", version: "1.0.0" },
        label: "Resources disponíveis",
        kind: "resource_set",
        targets: [{ kind: "microsequence", ref: "micro-a", label: "Sinais" }]
      }],
      conditions: [{
        id: "condition-a",
        label: "Condição A",
        values: [{
          factorId: "factor-resources",
          resourceSetRef: { id: "resources-a", version: "4.0.0" },
          resourceSetLabel: "Texto e tabela",
          allowedCount: 2
        }]
      }],
      assignment: {
        rule: "seeded_random",
        seedConfigured: true,
        algorithm: "sha256-counter-v1",
        commitment: "commitment-a"
      },
      variants: [{
        variantRevisionRef: { id: "variant-a", version: "1.0.0" },
        conditionId: "condition-a",
        label: "Variante A",
        status: "audited",
        allowedResources: {
          items: [{ ref: { id: "paragraph", version: "1.0.0" }, label: "Parágrafo" }],
          count: 2,
          truncated: true
        },
        materializedResources: {
          items: [{ ref: { id: "paragraph", version: "1.0.0" }, label: "Parágrafo" }],
          count: 1
        }
      }],
      differences: [{
        differenceRef: { id: "difference-a", version: "1.0.0" },
        category: "accidental_unplanned",
        title: "Prática removida",
        description: "A variante retirou uma prática não manipulada.",
        decision: "pending"
      }],
      actions: { decide: true, requestCorrection: true, freeze: true }
    }
  });

  assert.equal(experiment.statusLabel, "Variantes auditadas");
  assert.equal(experiment.assignment.rule, "seeded_random");
  assert.equal(experiment.assignment.seedConfigured, true);
  assert.equal(Object.hasOwn(experiment.assignment, "seed"), false);
  assert.equal(experiment.conditions[0].values[0].allowedCount, 2);
  assert.deepEqual(experiment.factors[0].targets.map(({ kind, ref }) => ({ kind, ref })), [
    { kind: "microsequence", ref: "micro-a" }
  ]);
  assert.equal(experiment.variants.items[0].allowedResources.count, 2);
  assert.equal(experiment.variants.items[0].allowedResources.truncated, true);
  assert.equal(experiment.variants.items[0].materializedResources.count, 1);
  assert.equal(experiment.differences.items[0].category, "accidental_unplanned");
  assert.deepEqual(experiment.differences.items[0].differenceRef, {
    id: "difference-a", version: "1.0.0"
  });
  assert.equal(experiment.actions.freeze, true);
  assert.equal(experiment.actions.requestCorrection, true);
});

test("seções reais de variante e diff preservam refs, freeze, proveniência e decisão humana", () => {
  const overview = normalizeAuthoringExperiment({
    workspaceId: WORKSPACE_ID,
    workspaceRevision: 31,
    experiment: {
      id: "experiment-service",
      experimentRevision: 9,
      section: "overview",
      title: "Estudo focal",
      state: "ready",
      actions: {
        saveProtocol: true,
        generateVariants: true,
        decideDifference: true,
        requestCorrection: true,
        startCollection: true,
        rotateEnrollmentCode: true,
        transitionCollection: ["pause", "close"],
        assignParticipant: true
      }
    }
  });
  const protocol = normalizeAuthoringExperiment({
    workspaceId: WORKSPACE_ID,
    workspaceRevision: 31,
    experiment: {
      id: "experiment-service",
      experimentRevision: 9,
      section: "protocol",
      protocolRef: { id: "protocol-a", version: "4" },
      protocolRevision: 4,
      protocol: {
        title: "Estudo focal",
        scope: { kind: "lesson", ref: "lesson-a", label: "Lição A" },
        conditions: [{
          conditionId: "condition-a",
          conditionRef: { id: "condition-a", version: "2" },
          label: "Condição A",
          values: []
        }]
      }
    }
  });
  const variants = normalizeAuthoringExperiment({
    workspaceId: WORKSPACE_ID,
    workspaceRevision: 31,
    experiment: {
      id: "experiment-service",
      experimentRevision: 9,
      section: "variants",
      variantSetRef: { id: "variant-set", version: "9" },
      items: [{
        variantRevisionRef: { id: "variant-a", version: "3" },
        baseRef: { id: "base-a", version: "7" },
        protocolRef: { id: "protocol-a", version: "4" },
        conditionRef: { id: "condition-a", version: "2" },
        state: "frozen",
        frozenAt: "2026-08-16T12:00:00.000Z",
        workspaceRevision: 44,
        provenanceHash: "a".repeat(64),
        provenancePinCount: 8,
        currentness: { base: true, protocol: true, condition: true },
        limitationRefs: [{ id: "limitation-a", version: "1" }],
        readerTarget: {
          workspaceId: "child-workspace",
          entityPath: ["course-a", "module-a", "lesson-a", "micro-a"],
          courseId: "course-a",
          access: "private",
          contentHash: "b".repeat(64)
        }
      }],
      count: 1,
      nextCursor: null,
      truncated: false
    }
  });
  const runs = normalizeAuthoringExperiment({
    workspaceId: WORKSPACE_ID,
    workspaceRevision: 31,
    experiment: {
      id: "experiment-service",
      experimentRevision: 9,
      section: "differences",
      mode: "runs",
      differenceSetRef: { id: "difference-set", version: "9" },
      differenceRunRef: null,
      items: [{
        differenceRef: { id: "difference-run-a", version: "5" },
        baselineRef: { kind: "base", ref: { id: "base-a", version: "7" } },
        candidateVariantRevisionRef: { id: "variant-a", version: "3" },
        state: "classified",
        hunkCount: 6,
        classifiedCount: 4
      }],
      count: 1,
      nextCursor: null,
      truncated: false
    }
  });
  const hunks = normalizeAuthoringExperiment({
    workspaceId: WORKSPACE_ID,
    workspaceRevision: 31,
    experiment: {
      id: "experiment-service",
      experimentRevision: 9,
      section: "differences",
      mode: "hunks",
      differenceSetRef: null,
      differenceRunRef: { id: "difference-run-a", version: "5" },
      items: [{
        differenceRef: { id: "hunk-a", version: "2" },
        path: "M01 / explicação",
        kind: "content",
        beforeSummary: "Exemplo textual.",
        afterSummary: "Exemplo visual.",
        classification: "directly_required",
        publicRationale: "Mudança prevista pelo fator.",
        humanDecision: "accept"
      }],
      count: 1,
      nextCursor: null,
      truncated: false
    }
  });

  const variant = variants.variants.items[0];
  assert.equal(variant.conditionId, "condition-a");
  assert.equal(variant.status, "frozen");
  assert.equal(variant.frozen, true);
  assert.equal(variant.workspaceRevision, 44);
  assert.deepEqual(variant.baseRef, { id: "base-a", version: "7" });
  assert.equal(variant.provenancePinCount, 8);
  assert.equal(overview.actions.generate, true);
  assert.equal(overview.actions.decide, true);
  assert.equal(overview.actions.requestCorrection, true);
  assert.equal(overview.actions.start, true);
  assert.equal(overview.actions.rotateCode, true);
  assert.equal(overview.actions.assign, true);
  assert.equal(overview.actions.pause, true);
  assert.deepEqual(protocol.conditions[0].conditionRef, {
    id: "condition-a", version: "2"
  });

  const run = runs.differences.items[0];
  assert.deepEqual(run.differenceRunRef, { id: "difference-run-a", version: "5" });
  assert.deepEqual(run.baseline.ref, { id: "base-a", version: "7" });
  assert.equal(run.count, 6);
  assert.equal(run.pendingCount, 2);
  assert.deepEqual(runs.differences.differenceSetRef, { id: "difference-set", version: "9" });

  const composed = mergeAuthoringExperimentSections(
    mergeAuthoringExperimentSections(overview, protocol),
    hunks
  );
  const hunk = composed.differences.items[0];
  assert.deepEqual(composed.differences.differenceRunRef, { id: "difference-run-a", version: "5" });
  assert.deepEqual(hunk.differenceRef, { id: "hunk-a", version: "2" });
  assert.equal(hunk.decision, "accept");
  assert.equal(hunk.rationale, "Mudança prevista pelo fator.");
  assert.match(hunk.description, /Antes: Exemplo textual/u);
  assert.match(hunk.description, /Depois: Exemplo visual/u);
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
        mandate: {
          id: "repair-a",
          kind: "repair_findings",
          findingIds: ["finding-a", "finding-b"],
          decidedAtRevision: 9
        },
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
  assert.deepEqual(
    normalizeAuthoringWorkspaceOverview(overview).mandate.findingIds,
    ["finding-a", "finding-b"]
  );
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

test("auditoria preserva evidência pública, refs e ausência explícita sem fabricar conformidade", () => {
  const projected = projectAuthoringAuditSlice({
    workspaceId: WORKSPACE_ID,
    response: {
      workspaceId: WORKSPACE_ID,
      revision: 12,
      result: {
        audit: {
          latestAuditRun: {
            ref: { id: "audit-run-a", version: "1.0.0" },
            kind: "deterministic",
            status: "complete",
            current: true,
            scope: { kind: "microsequence", ref: "micro-a" },
            startedRevision: 11,
            completedRevision: 12
          },
          summary: {
            dimensions: {
              structure: { status: "conformant", findingCount: 0 },
              design: { status: "finding", findingCount: 1 },
              practice: { status: "not_checked", findingCount: 0 }
            }
          },
          components: {
            items: [{
              ordinal: 1,
              microsequenceRef: "micro-a",
              microsequencePath: PATH,
              childAuditRunRef: { id: "audit-child-a", version: "1.0.0" },
              auditedRevision: 10,
              contentHash: "sha256:current",
              status: "complete",
              targetAvailable: true
            }],
            count: 2,
            nextCursor: "1",
            truncated: true
          },
          findings: [{
            findingId: "finding-a",
            code: "semantic_excessive_compression",
            origin: "semantic_audit",
            summary: "Explicação comprimida",
            publicEvidence: "O passo apresenta quatro relações sem desenvolvimento.",
            ruleRef: { kind: "parameter", id: "new_units_per_theory_step_ceiling", version: "1.0.0" },
            currentEntityPath: [...PATH, "card-current"],
            target: { entityType: "card", entityPath: [...PATH, "card-before-move"] },
            severity: "high",
            status: "open",
            proposedRepair: null,
            auditRunRef: { id: "audit-run-a", version: "1.0.0" },
            auditRevision: 11,
            artifactRefs: {
              analysisRef: { id: "analysis-a", version: "1.0.0" },
              resourceSetRefs: {
                items: [
                  { id: "resource-set-a", version: "1.0.0" },
                  { id: "resource-set-b", version: "1.0.0" }
                ],
                count: 23,
                truncated: true
              },
              microsequenceRefs: {
                items: ["micro-a", "micro-b"],
                count: 2,
                truncated: false
              }
            }
          }, {
            findingId: "finding-removed",
            code: "actual_cards_match_artifact_refs",
            origin: "deterministic",
            publicEvidence: "O card original foi removido.",
            ruleRef: { kind: "requirement", id: "materialized_card_contracts", version: "1.0.0" },
            target: { entityType: "card", entityPath: [...PATH, "card-removed"] },
            targetAvailable: false,
            severity: "medium",
            status: "open",
            auditRunRef: { id: "audit-run-a", version: "1.0.0" },
            auditRevision: 11
          }],
          total: 2,
          truncated: false
        }
      }
    }
  });
  const audit = normalizeAuthoringAuditSlice(projected);

  assert.equal(audit.summary.dimensions.find(({ key }) => key === "structure").status, "conformant");
  assert.equal(audit.summary.dimensions.find(({ key }) => key === "design").status, "finding");
  assert.equal(audit.summary.dimensions.find(({ key }) => key === "practice").status, "not_checked");
  assert.equal(audit.summary.dimensions.find(({ key }) => key === "resources").status, "not_checked");
  assert.equal(audit.latestAuditRun.current, true);
  assert.equal(audit.components.count, 2);
  assert.equal(audit.components.truncated, true);
  assert.equal(audit.components.nextCursor, "1");
  assert.deepEqual(audit.components.items[0].childAuditRunRef, {
    id: "audit-child-a", version: "1.0.0"
  });
  assert.deepEqual(audit.components.items[0].microsequencePath, PATH);
  assert.equal(audit.findings[0].origin, "semantic_audit");
  assert.equal(audit.findings[0].publicEvidence, "O passo apresenta quatro relações sem desenvolvimento.");
  assert.deepEqual(audit.findings[0].ruleRef, {
    kind: "parameter", id: "new_units_per_theory_step_ceiling", version: "1.0.0"
  });
  assert.equal(audit.findings[0].proposedRepair, null);
  assert.deepEqual(audit.findings[0].artifactRefs.analysisRef, { id: "analysis-a", version: "1.0.0" });
  assert.deepEqual(audit.findings[0].artifactRefs.resourceSetRefs, {
    items: [
      { id: "resource-set-a", version: "1.0.0" },
      { id: "resource-set-b", version: "1.0.0" }
    ],
    count: 23,
    truncated: true
  });
  assert.deepEqual(audit.findings[0].artifactRefs.microsequenceRefs, {
    items: ["micro-a", "micro-b"],
    count: 2,
    truncated: false
  });
  assert.equal(audit.findings[0].legacyCompatible, false);
  assert.deepEqual(audit.findings[0].readerTarget.entityPath, [...PATH, "card-current"]);
  assert.equal(audit.findings[1].targetAvailable, false);
  assert.equal(audit.findings[1].readerTarget, null);
});
