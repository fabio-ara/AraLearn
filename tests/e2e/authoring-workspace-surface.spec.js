import { expect, test } from "@playwright/test";
import fs from "node:fs";

const WORKSPACE_ID = "20000000-0000-4000-8000-000000000105";
const FIRST_PATH = ["course-a", "module-a", "lesson-a", "micro-a"];
const SECOND_PATH = ["course-a", "module-a", "lesson-a", "micro-b"];
const CAPTURE_AUTHORING_SCREENSHOTS = process.env.ARALEARN_CAPTURE_AUTHORING === "1";

async function mountAuthoring(page, {
  extraDestination = false,
  conflict = false,
  deepFindingPages = 0,
  partDualPagination = false,
  unassignedRepaired = false,
  incompleteAuditResume = false,
  research = false
} = {}) {
  await page.goto("/");
  await page.evaluate(async ({
    workspaceId,
    firstPath,
    secondPath,
    withExtraDestination,
    withConflict,
    requestedDeepFindingPages,
    withPartDualPagination,
    withUnassignedRepaired,
    withIncompleteAuditResume,
    withResearch
  }) => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    let revision = 7;
    let value = 2;
    let source = "manual";
    let conflict = withConflict;
    let currentMandate = null;
    let auditRunStatus = "complete";
    let auditRunCurrent = true;
    let componentBAvailable = true;
    const unassignedPath = ["course-a", "module-a", "lesson-a", "micro-unassigned"];
    const findingStatuses = {
      "finding-course": "open",
      "finding-a": "open",
      "finding-b": "repaired",
      "finding-missing": "open",
      "finding-unassigned": "repaired"
    };
    const probe = {
      setCalls: [],
      restoreCalls: [],
      retryCalls: [],
      discardCalls: [],
      findingReads: [],
      auditReads: [],
      decisionCalls: [],
      repairMandates: [],
      reauditMandates: [],
      resourceReads: [],
      resourceSaves: [],
      openTargets: [],
      returnContexts: [],
      settingsOpens: 0
    };
    probe.experimentCalls = [];
    probe.completePreparedRepairs = () => {
      for (const findingId of currentMandate?.findingIds || []) findingStatuses[findingId] = "repaired";
    };
    probe.setAuditRunStatus = (status) => {
      auditRunStatus = status;
    };
    probe.setAuditRunCurrent = (current) => {
      auditRunCurrent = current === true;
    };
    probe.setComponentBAvailable = (available) => {
      componentBAvailable = available === true;
    };
    const overview = () => ({
      workspaceId,
      title: "Curso de sinais",
      revision,
      state: "building",
      stateLabel: "Em construção",
      pending: conflict,
      conflict,
      mandate: currentMandate == null ? null : structuredClone(currentMandate),
      parts: [{
        partId: "part-a",
        title: "Fundamentos",
        state: "materialized",
        stateLabel: "Com conteúdo",
        auditSummary: {
          dimensions: {
            structure: { status: "conformant", findingCount: 0 },
            design: { status: "finding", findingCount: 2 },
            practice: { status: "finding", findingCount: 1 },
            resources: { status: "conformant", findingCount: 0 },
            coverage: { status: "conformant", findingCount: 0 },
            coherence: { status: "not_checked", findingCount: 0 },
            dependencies: { status: "not_checked", findingCount: 0 },
            redundancy: { status: "not_checked", findingCount: 0 },
            integration: { status: "not_checked", findingCount: 0 }
          }
        },
        microsequences: [{
          key: "micro-a",
          title: "Sinais no cotidiano",
          entityPath: firstPath,
          state: conflict ? "audit_pending" : "materialized",
          stateLabel: conflict ? "Com conflito" : "Com conteúdo",
          pending: conflict,
          conflict,
          auditSummary: { dimensions: {
            structure: { status: "conformant", findingCount: 0 },
            design: { status: "finding", findingCount: 1 },
            practice: { status: "conformant", findingCount: 0 },
            resources: { status: "conformant", findingCount: 0 }
          } },
          readerTarget: { entityPath: firstPath }
        }, {
          key: "micro-b",
          title: "Sinais em sistemas",
          entityPath: secondPath,
          state: "planned",
          stateLabel: "Planejada",
          auditSummary: { dimensions: {
            structure: { status: "conformant", findingCount: 0 },
            design: { status: "not_checked", findingCount: 0 },
            practice: { status: "finding", findingCount: 1 },
            resources: { status: "not_checked", findingCount: 0 }
          } },
          readerTarget: { entityPath: secondPath }
        }]
      }, ...(withUnassignedRepaired ? [{
        partId: null,
        title: "Ainda sem Parte",
        state: "audit_pending",
        stateLabel: "Com achado pendente",
        auditSummary: { dimensions: {
          structure: { status: "not_checked", findingCount: 0 },
          design: { status: "finding", findingCount: 1 },
          practice: { status: "not_checked", findingCount: 0 },
          resources: { status: "not_checked", findingCount: 0 }
        } },
        microsequences: [{
          key: "micro-unassigned",
          title: "Unidade ainda não coordenada",
          entityPath: unassignedPath,
          state: "audit_pending",
          stateLabel: "Com achado pendente",
          auditSummary: { dimensions: {
            structure: { status: "not_checked", findingCount: 0 },
            design: { status: "finding", findingCount: 1 },
            practice: { status: "not_checked", findingCount: 0 },
            resources: { status: "not_checked", findingCount: 0 }
          } },
          readerTarget: { entityPath: unassignedPath }
        }]
      }] : [])],
      audit: { summary: { dimensions: {
        structure: { status: "conformant", findingCount: 0 },
        design: { status: "finding", findingCount: 2 },
        practice: { status: "finding", findingCount: 1 },
        resources: { status: "conformant", findingCount: 0 }
      } } },
      findings: [{
        findingId: "finding-course",
        summary: "Objetivo do curso precisa de desenvolvimento",
        code: "course_objective_underdeveloped",
        origin: "deterministic",
        publicEvidence: "O objetivo registrado não possui desenvolvimento correspondente no conteúdo.",
        ruleRef: { kind: "requirement", id: "objective_coverage", version: "1.0.0" },
        severity: "medium",
        status: findingStatuses["finding-course"],
        proposedRepair: "Desenvolver o objetivo na Parte correspondente.",
        auditRunRef: { id: "audit-part-a", version: "1.0.0" },
        auditRevision: 6,
        auditPartId: "part-a",
        targetAvailable: true,
        readerTarget: { entityPath: ["course-a"] }
      }, {
        findingId: "finding-a",
        summary: "Exemplo comprimido demais",
        code: "semantic_excessive_compression",
        origin: withIncompleteAuditResume ? null : "semantic_audit",
        publicEvidence: "O passo apresenta quatro elementos novos; o valor efetivo permite no máximo dois.",
        ruleRef: { kind: "parameter", id: "new_units_per_theory_step_ceiling", version: "1.0.0" },
        severity: "high",
        status: findingStatuses["finding-a"],
        proposedRepair: "Distribuir a explicação em passos progressivos.",
        auditRunRef: withIncompleteAuditResume ? null : { id: "audit-micro-a", version: "1.0.0" },
        auditRevision: 6,
        auditPartId: "part-a",
        artifactRefs: {
          analysisRef: { id: "analysis-a", version: "1.0.0" },
          manifestRef: { id: "manifest-a", version: "1.0.0" },
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
        },
        targetAvailable: true,
        readerTarget: { entityPath: [...firstPath, "card-current"], resourceTargetId: "content:diagram-a" }
      }, {
        findingId: "finding-b",
        summary: "Prática ainda não materializada",
        code: "practice_missing",
        origin: "deterministic",
        publicEvidence: "O manifesto promete prática, mas não existe card correspondente.",
        ruleRef: { kind: "requirement", id: "practice_coverage", version: "1.0.0" },
        severity: "low",
        status: findingStatuses["finding-b"],
        proposedRepair: null,
        auditRunRef: { id: "audit-micro-b", version: "1.0.0" },
        auditRevision: 5,
        auditPartId: "part-a",
        resultingRevision: 7,
        targetAvailable: true,
        readerTarget: { entityPath: secondPath }
      }, {
        findingId: "finding-missing",
        summary: "Conteúdo original retirado",
        code: "target_removed",
        origin: "deterministic",
        publicEvidence: "O alvo registrado não existe mais na revisão corrente.",
        ruleRef: { kind: "traceability", id: "target_available", version: "1.0.0" },
        severity: "medium",
        status: findingStatuses["finding-missing"],
        proposedRepair: null,
        auditRunRef: { id: "audit-part-a", version: "1.0.0" },
        auditRevision: 6,
        auditPartId: "part-a",
        targetAvailable: false,
        readerTarget: null
      }, ...(withUnassignedRepaired ? [{
        findingId: "finding-unassigned",
        summary: "Explicação sem coordenação de Parte",
        code: "semantic_explanation_only_mentioned",
        origin: "semantic_audit",
        publicEvidence: "A unidade ainda não foi associada a uma Parte operacional.",
        ruleRef: { kind: "coordination", id: "part_assignment", version: "1.0.0" },
        severity: "medium",
        status: findingStatuses["finding-unassigned"],
        proposedRepair: null,
        auditRunRef: { id: "audit-micro-unassigned", version: "1.0.0" },
        auditRevision: 6,
        resultingRevision: 7,
        targetAvailable: true,
        readerTarget: { entityPath: unassignedPath }
      }] : [])].filter((finding) => !["rejected", "resolved"].includes(finding.status)),
      findingsTotal: requestedDeepFindingPages > 0 ? 4 + requestedDeepFindingPages : 54,
      findingsTruncated: true,
      findingsNextCursor: requestedDeepFindingPages > 0 ? "deep-1" : "50",
      capabilities: {
        design: true,
        audit: true,
        editContent: true,
        decideFindings: true,
        prepareRepairs: true,
        requestAudit: true,
        research: withResearch
      }
    });
    const design = () => ({
      workspaceId,
      revision,
      scopeTitle: "Sinais no cotidiano",
      microsequencePath: firstPath,
      pending: conflict,
      conflict,
      parameters: [{
        key: "novelty_level",
        parameterKey: "novelty_level",
        definitionRef: { id: "novelty_level", version: "1.2.0" },
        assignmentRef: source === "manual" ? { id: "assignment-a", version: "2.0.0" } : null,
        label: "Novidade",
        value: { kind: "integer", value },
        valueLabel: String(value),
        source,
        sourceLabel: source === "manual" ? "Definido pelo autor" : "Automático",
        editable: !conflict,
        pending: conflict,
        pendingStatus: conflict ? "conflict" : "",
        pendingRequestId: conflict ? "request-conflict-a" : "",
        conflictMessage: conflict ? "Outra versão foi salva." : "",
        control: { kind: "integer", min: 1, max: 5, step: 1 }
      }, {
        key: "research_factor",
        definitionRef: { id: "research_factor", version: "1.0.0" },
        label: "Condição de pesquisa",
        value: { kind: "enum", value: "condition_a" },
        valueLabel: "Condição A",
        source: "research_locked",
        sourceLabel: "Bloqueado por pesquisa",
        locked: true,
        editable: false,
        control: { kind: "enum", options: [{ value: "condition_a", label: "Condição A" }] }
      }],
      resources: {
        summary: "2 conjuntos disponíveis",
        setCount: 2,
        editable: !conflict
      }
    });
    const extraTargets = Array.from({ length: 54 }, (_, index) => ({
      key: `target-large-${index + 1}`,
      label: `Curso de sinais › Lição ${Math.floor(index / 6) + 1} › Microssequência extensa ${index + 1}`,
      entityPath: ["course-a", `module-large-${Math.floor(index / 12) + 1}`,
        `lesson-large-${Math.floor(index / 6) + 1}`, `micro-large-${index + 1}`],
      selected: false
    }));
    const resourceFacets = {
      families: [{ id: "relations", label: "Relações", count: 3 }],
      disciplines: [{ id: "signals", label: "Sinais", count: 2 }],
      structures: [{ id: "process", label: "Processos", count: 2 }],
      operations: [{ id: "compare", label: "Comparar", count: 1 }],
      practiceModes: [{ id: "guided", label: "Guiada", count: 1 }]
    };
    const resourcePage = ({ resourceSetRef }) => {
      if (!resourceSetRef) {
        return {
          summary: "2 conjuntos disponíveis",
          items: [],
          selectedKeys: [],
          selectionComplete: false,
          setChoices: [{
            key: "set-diagrams",
            label: "Diagramas e relações",
            ref: { id: "set-diagrams", version: "1.0.0" },
            selected: false
          }, {
            key: "set-text",
            label: "Texto essencial",
            ref: { id: "set-text", version: "1.0.0" },
            selected: false
          }],
          requiresSetChoice: true,
          selectedSetKey: "",
          facets: resourceFacets,
          resourceScopes: [],
          editable: true,
          limitation: "Representações animadas não estão disponíveis nesta condição."
        };
      }
      if (resourceSetRef.id === "set-text") {
        return {
          summary: "Texto essencial",
          items: [{ key: "short-text", label: "Texto curto", familyLabel: "Texto", selected: true }],
          selectedKeys: ["short-text"],
          selectedCount: 1,
          selectionComplete: true,
          total: 1,
          nextCursor: null,
          facets: resourceFacets,
          setChoices: [{
            key: "set-diagrams",
            label: "Diagramas e relações",
            ref: { id: "set-diagrams", version: "1.0.0" },
            selected: false
          }, {
            key: "set-text",
            label: "Texto essencial",
            ref: { id: "set-text", version: "1.0.0" },
            selected: true
          }],
          requiresSetChoice: false,
          selectedSetKey: "set-text",
          resourceScopes: [{ key: "microsequence", label: "Esta microssequência", available: true }],
          editable: true,
          limitation: ""
        };
      }
      return {
        summary: "Diagramas e relações",
        items: [{ key: "diagram", label: "Diagrama", familyLabel: "Relações", selected: true }],
        selectedKeys: ["diagram", "resource-not-on-this-page"],
        selectedCount: 2,
        selectionComplete: true,
        total: 41,
        nextCursor: null,
        facets: resourceFacets,
        setChoices: [{
          key: "set-diagrams",
          label: "Diagramas e relações",
          ref: { id: "set-diagrams", version: "1.0.0" },
          selected: true
        }, {
          key: "set-text",
          label: "Texto essencial",
          ref: { id: "set-text", version: "1.0.0" },
          selected: false
        }],
        requiresSetChoice: false,
        selectedSetKey: "set-diagrams",
        resourceScopes: [{ key: "microsequence", label: "Esta microssequência", available: true }, {
          key: "lesson", label: "Esta lição", available: true }, {
          key: "course", label: "Este curso", available: true }, {
          key: "microsequence_set",
          label: "Microssequências escolhidas",
          available: true,
          targets: [{ key: "target-a", label: "Curso de sinais › Fundamentos › Sinais no cotidiano", entityPath: firstPath, selected: true }, {
            key: "target-b", label: "Curso de sinais › Fundamentos › Sinais em sistemas", entityPath: secondPath, selected: false },
          ...extraTargets]
        }],
        editable: true,
        limitation: "Representações animadas não estão disponíveis nesta condição."
      };
    };
    const experimentId = "30000000-0000-4000-8000-000000000107";
    const childWorkspaceId = "40000000-0000-4000-8000-000000000107";
    let experimentRevision = 0;
    let experimentStatus = "draft";
    let savedProtocol = null;
    let differenceDecision = "pending";
    let participantAssigned = false;
    const enrollmentRef = "50000000-0000-4000-8000-000000000107";
    const frozenVariants = new Set();
    probe.completeExperimentAudit = () => {
      if (experimentStatus === "generating") experimentStatus = "correction_required";
    };
    const factorDefinitions = [{
      ref: { id: "novelty_units", version: "1.0.0" },
      label: "Novidade por passo",
      kind: "parameter",
      valueType: "integer",
      constraints: { minimum: 1, maximum: 5, step: 1 },
      options: []
    }, {
      ref: { id: "explanation_mode", version: "1.0.0" },
      label: "Modo de explicação",
      kind: "parameter",
      valueType: "enum",
      options: [{
        key: "concise",
        label: "Concisa",
        value: { kind: "enum", value: "concise" }
      }, {
        key: "elaborated",
        label: "Elaborada",
        value: { kind: "enum", value: "elaborated" }
      }]
    }, {
      ref: { id: "practice_set", version: "1.0.0" },
      label: "Elaboração e prática",
      kind: "parameter",
      valueType: "set",
      options: [{
        key: "worked-guided",
        label: "Exemplo elaborado + prática guiada",
        value: { kind: "set", values: ["elaborated_example", "guided_practice"] }
      }, {
        key: "contrast-retrieval",
        label: "Contraste + recuperação",
        value: { kind: "set", values: ["contrast", "retrieval_practice"] }
      }]
    }, {
      ref: { id: "applicable_explanation_scaffolds", version: "1.0.0" },
      label: "Andaimes de elaboração",
      kind: "parameter",
      valueType: "set",
      constraints: { setItemPattern: "^[a-z_:-]+$", refNamespace: "pedagogy" },
      options: []
    }, {
      ref: { id: "distinct_practice_opportunities", version: "1.0.0" },
      label: "Oportunidades de prática",
      kind: "parameter",
      valueType: "range",
      constraints: { minimum: 1, maximum: 6 },
      options: []
    }, {
      ref: { id: "practice_variation_dimensions", version: "1.0.0" },
      label: "Dimensões de variação da prática",
      kind: "parameter",
      valueType: "vector",
      constraints: {
        vectorDimensions: ["surface", "context"],
        allowedUnits: ["level", "count"]
      },
      options: []
    }, {
      ref: { id: "evidence_alignment_relation", version: "1.0.0" },
      label: "Relação evidência-alvo",
      kind: "parameter",
      valueType: "relation",
      constraints: { relationKinds: ["supports", "contrasts"] },
      options: []
    }, {
      ref: { id: "available_resources", version: "1.0.0" },
      label: "Resources permitidos",
      kind: "resource_set",
      valueType: "resource_set",
      options: []
    }];
    const experimentOptions = {
      scopes: [{
        scope: { kind: "microsequence", ref: "micro-a" },
        label: "Sinais no cotidiano",
        entityPath: firstPath
      }],
      bases: [{
        ref: { id: "base-signals", version: "7.0.0" },
        label: "Base aprovada · revisão 7",
        approved: true
      }],
      factorDefinitions,
      resourceSets: [{
        ref: { id: "resource-set-text", version: "2.0.0" },
        label: "Texto e tabela",
        memberCount: 2
      }, {
        ref: { id: "resource-set-diagram", version: "2.0.0" },
        label: "Texto, tabela e diagrama",
        memberCount: 3
      }],
      consentPolicies: [{
        ref: { id: "consent-research", version: "1.0.0" },
        label: "Consentimento do estudo"
      }],
      instruments: [{ ref: { id: "instrument-retention", version: "1.0.0" }, label: "Teste de retenção" }],
      outcomes: [{ ref: { id: "outcome-transfer", version: "1.0.0" }, label: "Transferência" }]
    };
    const experimentDetail = ({ section = "overview", differenceRunRef = null } = {}) => {
      const definitionsByKey = new Map(factorDefinitions.map((definition) => [
        `${definition.ref.id}@${definition.ref.version}`,
        definition
      ]));
      const factors = (savedProtocol?.factors || []).map((factor) => ({
        ...structuredClone(definitionsByKey.get(
          `${factor.definitionRef.id}@${factor.definitionRef.version}`
        )),
        factorId: factor.factorId,
        targets: structuredClone(factor.targets || [])
      }));
      const variants = ["draft", "validated", "generating"].includes(experimentStatus) ? [] :
        (savedProtocol?.conditions || []).map((condition, index) => {
          const variantRevisionRef = { id: `variant-${index + 1}`, version: "1.0.0" };
          const key = `${variantRevisionRef.id}@${variantRevisionRef.version}`;
          return {
            variantRevisionRef,
            baseRef: { id: "base-signals", version: "7.0.0" },
            protocolRef: { id: "protocol-signals", version: String(Math.max(1, experimentRevision)) },
            conditionRef: { id: condition.conditionId, version: "1.0.0" },
            state: frozenVariants.has(key) ? "frozen" : "audited",
            frozenAt: frozenVariants.has(key) ? "2026-08-16T12:00:00.000Z" : null,
            workspaceRevision: 31 + index,
            provenanceHash: String(index + 1).repeat(64),
            provenancePinCount: 8,
            currentness: { base: true, protocol: true, condition: true, materialization: true, audit: true },
            limitationRefs: [],
            allowedResources: {
              items: [{ ref: { id: "paragraph", version: "1.0.0" }, label: "Texto curto" }],
              count: index + 2,
              truncated: index === 1
            },
            materializedResources: {
              items: [{ ref: { id: "paragraph", version: "1.0.0" }, label: "Texto curto" }],
              count: 1
            },
            readerTarget: {
              workspaceId: childWorkspaceId,
              workspaceRevision: 31 + index,
              entityPath: [`variant-course-${index + 1}`, "module-a", "lesson-a", "micro-a"],
              courseId: `variant-course-${index + 1}`,
              access: "private",
              contentHash: String(index + 1).repeat(64)
            }
          };
        });
      const allFrozen = variants.length > 0 && variants.every((variant) => Boolean(variant.frozenAt));
      const conditions = (savedProtocol?.conditions || []).map((condition) => ({
        ...structuredClone(condition),
        conditionRef: { id: condition.conditionId, version: "1.0.0" }
      }));
      const common = {
        experimentId,
        experimentRevision,
        section
      };
      const response = {
        workspaceId,
        workspaceRevision: revision,
        experiment: section === "overview" ? {
          ...common,
          title: savedProtocol?.title || "Experimento de sinais",
          hypothesis: savedProtocol?.hypothesis || "",
          state: experimentStatus,
          assignment: {
            rule: savedProtocol?.assignment?.rule || "manual",
            seedConfigured: savedProtocol?.assignment?.rule === "seeded_random"
          },
          conditionCount: conditions.length,
          variantCount: variants.length,
          differenceCount: variants.length ? 1 : 0,
          participantCount: experimentStatus === "collecting" ? 1 : 0,
          enrollment: experimentStatus === "collecting"
            ? { configured: true, expiresAt: "2026-09-01T12:00:00.000Z" }
            : { configured: false },
          actions: {
            saveProtocol: experimentStatus === "draft",
            validate: experimentStatus === "draft",
            generateVariants: experimentStatus === "validated",
            decideDifference: experimentStatus === "correction_required" && differenceDecision === "pending",
            requestCorrection: ["ready", "collecting", "paused"].includes(experimentStatus) && allFrozen,
            freeze: experimentStatus === "ready" && !allFrozen,
            startCollection: experimentStatus === "ready" && allFrozen,
            rotateEnrollmentCode: ["collecting", "paused"].includes(experimentStatus),
            assignParticipant: experimentStatus === "collecting",
            transitionCollection: experimentStatus === "collecting" ? ["pause"] : []
          }
        } : section === "protocol" ? {
          ...common,
          protocolRef: { id: "protocol-signals", version: String(Math.max(1, experimentRevision)) },
          protocolRevision: Math.max(1, experimentRevision),
          protocol: {
            title: savedProtocol?.title || "Experimento de sinais",
            hypothesis: savedProtocol?.hypothesis || "",
            baseRef: savedProtocol?.baseRef || { id: "base-signals", version: "7.0.0" },
            consentPolicyRef: savedProtocol?.consentPolicyRef || { id: "consent-research", version: "1.0.0" },
            scope: savedProtocol?.scope || { kind: "microsequence", ref: "micro-a" },
            factors,
            conditions,
            invariants: structuredClone(savedProtocol?.invariants || ["sources", "targets", "analysis", "structure"]),
            assignment: {
              rule: savedProtocol?.assignment?.rule || "manual",
              seedConfigured: savedProtocol?.assignment?.rule === "seeded_random"
            },
            instrumentRefs: structuredClone(savedProtocol?.instrumentRefs || []),
            outcomeRefs: structuredClone(savedProtocol?.outcomeRefs || [])
          }
        } : section === "variants" ? {
          ...common,
          variantSetRef: { id: experimentId, version: String(experimentRevision) },
          items: variants,
          count: variants.length,
          nextCursor: null,
          truncated: false
        } : section === "differences" && differenceRunRef ? {
          ...common,
          mode: "hunks",
          differenceRunRef: { id: "difference-run-a", version: "1.0.0" },
          items: variants.length ? [{
            differenceRef: { id: "difference-a", version: "1.0.0" },
            classification: "directly_required",
            path: "M01 / novidade",
            kind: "parameter",
            beforeSummary: "Novidade 1.",
            afterSummary: "Novidade 3.",
            publicRationale: "A variante materializou o valor declarado no protocolo.",
            humanDecision: differenceDecision === "pending" ? null : differenceDecision,
            allowedResources: { items: [], count: 2, truncated: true },
            materializedResources: { items: [], count: 1 }
          }] : [],
          count: variants.length ? 1 : 0,
          nextCursor: null,
          truncated: false
        } : section === "differences" ? {
          ...common,
          mode: "runs",
          differenceSetRef: { id: experimentId, version: String(experimentRevision) },
          differenceRunRef: null,
          items: variants.length ? [{
            differenceRef: { id: "difference-run-a", version: "1.0.0" },
            baselineRef: { kind: "base", ref: { id: "base-signals", version: "7.0.0" } },
            candidateVariantRevisionRef: variants[0].variantRevisionRef,
            state: "classified",
            hunkCount: 1,
            classifiedCount: differenceDecision === "pending" ? 0 : 1
          }] : [],
          count: variants.length ? 1 : 0,
          nextCursor: null,
          truncated: false
        } : {
          ...common,
          participantSetRef: { id: experimentId, version: String(experimentRevision) },
          items: [{
            enrollmentRef,
            pseudonymLabel: "Participante Ipê",
            status: participantAssigned ? "assigned" : "enrolled",
            assignedConditionRef: participantAssigned ? conditions[0]?.conditionRef || null : null
          }],
          count: 1,
          nextCursor: null,
          truncated: false
        }
      };
      return response;
    };
    const controller = {
      async listAuthoringWorkspaces() {
        return { items: [{ workspaceId, title: "Curso de sinais", state: "building", stateLabel: "Em construção" }] };
      },
      async loadAuthoringWorkspaceOverview() {
        return overview();
      },
      async listAuthoringExperiments(argumentsValue) {
        probe.experimentCalls.push({ operation: "list", args: structuredClone(argumentsValue) });
        return {
          workspaceId,
          workspaceRevision: revision,
          experimentSetRef: { id: "experiment-set", version: String(experimentRevision) },
          items: savedProtocol ? [{
            experimentId,
            title: savedProtocol.title,
            status: experimentStatus,
            scope: { ...savedProtocol.scope, label: "Sinais no cotidiano" },
            factorCount: savedProtocol.factors.length,
            conditionCount: savedProtocol.conditions.length,
            variantCount: ["draft", "validated"].includes(experimentStatus)
              ? 0
              : (savedProtocol?.conditions || []).length
          }] : [],
          count: savedProtocol ? 1 : 0,
          nextCursor: null,
          truncated: false
        };
      },
      async loadAuthoringExperiment(argumentsValue) {
        probe.experimentCalls.push({ operation: "read", args: structuredClone(argumentsValue) });
        return experimentDetail(argumentsValue);
      },
      async loadAuthoringExperimentOptionPage(argumentsValue) {
        probe.experimentCalls.push({ operation: "list_options", args: structuredClone(argumentsValue) });
        const properties = {
          scope: "scopes",
          base: "bases",
          factor_definition: "factorDefinitions",
          resource_set: "resourceSets",
          consent_policy: "consentPolicies",
          instrument: "instruments",
          outcome: "outcomes"
        };
        const items = structuredClone(experimentOptions[properties[argumentsValue.kind]] || []);
        return {
          workspaceId,
          workspaceRevision: revision,
          optionsSetRef: { id: "experiment-options", version: String(revision) },
          kind: argumentsValue.kind,
          items,
          count: items.length,
          nextCursor: null,
          truncated: false
        };
      },
      async saveAuthoringExperimentProtocol(argumentsValue) {
        probe.experimentCalls.push({ operation: "save_protocol", args: structuredClone(argumentsValue) });
        savedProtocol = structuredClone(argumentsValue.protocol);
        experimentRevision += 1;
        experimentStatus = "draft";
        return { workspaceId, workspaceRevision: revision, experimentId, experimentRevision };
      },
      async validateAuthoringExperiment(argumentsValue) {
        probe.experimentCalls.push({ operation: "validate", args: structuredClone(argumentsValue) });
        experimentRevision += 1;
        experimentStatus = "validated";
        return { workspaceId, workspaceRevision: revision, experimentId, experimentRevision };
      },
      async generateAuthoringExperimentVariants(argumentsValue) {
        probe.experimentCalls.push({ operation: "generate_variants", args: structuredClone(argumentsValue) });
        experimentRevision += 1;
        experimentStatus = "generating";
        return { workspaceId, workspaceRevision: revision, experimentId, experimentRevision };
      },
      async decideAuthoringExperimentDifference(argumentsValue) {
        probe.experimentCalls.push({ operation: "decide_difference", args: structuredClone(argumentsValue) });
        experimentRevision += 1;
        differenceDecision = argumentsValue.decision;
        experimentStatus = "ready";
        return { workspaceId, workspaceRevision: revision, experimentId, experimentRevision };
      },
      async requestAuthoringExperimentCorrection(argumentsValue) {
        probe.experimentCalls.push({ operation: "request_correction", args: structuredClone(argumentsValue) });
        experimentRevision += 1;
        experimentStatus = "correction_required";
        return { workspaceId, workspaceRevision: revision, experimentId, experimentRevision };
      },
      async freezeAuthoringExperiment(argumentsValue) {
        probe.experimentCalls.push({ operation: "freeze", args: structuredClone(argumentsValue) });
        experimentRevision += 1;
        frozenVariants.add(`${argumentsValue.variantRevisionRef.id}@${argumentsValue.variantRevisionRef.version}`);
        return { workspaceId, workspaceRevision: revision, experimentId, experimentRevision };
      },
      async startAuthoringExperimentCollection(argumentsValue) {
        probe.experimentCalls.push({ operation: "start_collection", args: structuredClone(argumentsValue) });
        experimentRevision += 1;
        experimentStatus = "collecting";
        return {
          workspaceId,
          workspaceRevision: revision,
          experimentId,
          experimentRevision,
          enrollmentCode: "SINAIS-2026-A",
          expiresAt: "2026-09-01T12:00:00.000Z"
        };
      },
      async rotateAuthoringExperimentEnrollmentCode(argumentsValue) {
        probe.experimentCalls.push({ operation: "rotate_enrollment_code", args: structuredClone(argumentsValue) });
        experimentRevision += 1;
        return {
          workspaceId,
          workspaceRevision: revision,
          experimentId,
          experimentRevision,
          enrollmentCode: "SINAIS-2026-B",
          expiresAt: "2026-09-08T12:00:00.000Z"
        };
      },
      async assignAuthoringExperimentParticipant(argumentsValue) {
        probe.experimentCalls.push({ operation: "assign_participant", args: structuredClone(argumentsValue) });
        participantAssigned = true;
        experimentRevision += 1;
        return { workspaceId, workspaceRevision: revision, experimentId, experimentRevision };
      },
      async transitionAuthoringExperimentCollection(argumentsValue) {
        probe.experimentCalls.push({ operation: "transition_collection", args: structuredClone(argumentsValue) });
        experimentRevision += 1;
        experimentStatus = argumentsValue.transition === "pause" ? "paused" : experimentStatus;
        return { workspaceId, workspaceRevision: revision, experimentId, experimentRevision };
      },
      async loadAuthoringAudit(argumentsValue) {
        probe.auditReads.push(structuredClone(argumentsValue));
        if (requestedDeepFindingPages > 0) {
          const pageNumber = argumentsValue.cursor
            ? Number(String(argumentsValue.cursor).replace("audit-deep-", ""))
            : 0;
          const nextPage = pageNumber < requestedDeepFindingPages ? pageNumber + 1 : null;
          const deepFinding = (findingId, summary) => ({
                findingId,
                summary,
                code: "semantic_explanation_only_mentioned",
                origin: "semantic_audit",
                publicEvidence: `Evidência pública da página ${pageNumber}.`,
                ruleRef: { kind: "requirement", id: "applicable_explanation_coverage", version: "1.0.0" },
                severity: "medium",
                status: "open",
                proposedRepair: null,
                auditRunRef: { id: "audit-micro-a", version: "1.0.0" },
                auditRevision: 6,
                targetAvailable: true,
                readerTarget: { entityPath: firstPath }
              });
          const items = pageNumber === 0
            ? [
                ...overview().findings.filter(({ findingId }) => findingId === "finding-a"),
                ...Array.from({ length: 49 }, (_, index) => deepFinding(
                  `finding-deep-initial-${index + 1}`,
                  `Achado inicial ${index + 1}`
                ))
              ]
            : pageNumber === requestedDeepFindingPages
              ? [deepFinding(`finding-deep-${pageNumber}`, `Achado profundo ${pageNumber}`)]
              : Array.from({ length: 50 }, (_, index) => deepFinding(
                  `finding-deep-${pageNumber}-${index + 1}`,
                  `Achado intermediário ${pageNumber}.${index + 1}`
                ));
          return {
            workspaceId,
            revision,
            latestAuditRun: {
              ref: { id: "audit-micro-a", version: "1.0.0" },
              kind: "semantic",
              status: auditRunStatus,
              current: auditRunCurrent,
              scope: { kind: "microsequence", ref: firstPath[3] },
              startedRevision: 6,
              completedRevision: 7
            },
            summary: overview().parts[0].microsequences[0].auditSummary,
            findings: items,
            total: 50 + (requestedDeepFindingPages - 1) * 50 + 1,
            nextCursor: nextPage == null ? null : `audit-deep-${nextPage}`,
            truncated: nextPage != null,
            coordination: { mandate: {} }
          };
        }
        const isPart = (argumentsValue.auditScope?.kind === "part" &&
          argumentsValue.auditScope.ref === "part-a") ||
          argumentsValue.auditRunRef?.id === "audit-part-a";
        const unpinnedPartPage = withPartDualPagination && isPart &&
          (argumentsValue.cursor || argumentsValue.componentCursor) && !argumentsValue.auditRunRef;
        const resolvedRunRef = argumentsValue.auditRunRef || (isPart
          ? { id: unpinnedPartPage ? "audit-part-new" : "audit-part-a", version: "1.0.0" }
          : { id: `audit-${argumentsValue.microsequencePath[3]}`, version: "1.0.0" });
        let items = overview().findings.filter((finding) => {
          if (isPart) return ["finding-course", "finding-missing"].includes(finding.findingId);
          const path = finding.readerTarget?.entityPath;
          return Array.isArray(path) && argumentsValue.microsequencePath.every(
            (entry, index) => path[index] === entry
          );
        }).map((finding) => {
          const projected = {
            ...finding,
            ...(isPart ? { auditRunRef: structuredClone(resolvedRunRef) } : {}),
            ...(withIncompleteAuditResume && finding.findingId === "finding-a"
              ? {
                  origin: "semantic_audit",
                  auditRunRef: isPart
                    ? { id: "audit-part-a", version: "1.0.0" }
                    : { id: "audit-micro-a", version: "1.0.0" }
                }
              : {})
          };
          if (finding.findingId === "finding-a") {
            return {
              ...projected,
              readerTarget: {
                entityPath: [...firstPath, "card-before-move"],
                resourceTargetId: "content:diagram-a"
              }
            };
          }
          if (finding.findingId === "finding-missing") {
            return {
              ...projected,
              targetAvailable: undefined,
              readerTarget: { entityPath: [...secondPath, "card-removed"] }
            };
          }
          return projected;
        });
        if (isPart && withPartDualPagination) {
          if (argumentsValue.cursor) {
            items = items.filter(({ findingId }) => findingId === "finding-missing");
          } else {
            items = [
              ...items.filter(({ findingId }) => findingId === "finding-course"),
              ...Array.from({ length: 49 }, (_, index) => ({
                findingId: `finding-part-page-${index + 2}`,
                summary: `Achado da Parte ${index + 2}`,
                code: "part_cross_microsequence_gap",
                origin: "semantic_audit",
                publicEvidence: `Evidência pública da Parte ${index + 2}.`,
                ruleRef: { kind: "requirement", id: "part_coherence", version: "1.0.0" },
                severity: "medium",
                status: "open",
                proposedRepair: null,
                auditRunRef: structuredClone(resolvedRunRef),
                auditRevision: 6,
                auditPartId: "part-a",
                targetAvailable: true,
                readerTarget: { entityPath: ["course-a"] }
              }))
            ];
          }
        }
        const micro = overview().parts.flatMap((part) => part.microsequences).find((item) => (
          item.entityPath.every((entry, index) => argumentsValue.microsequencePath[index] === entry)
        ));
        return {
          workspaceId,
          revision,
          latestAuditRun: {
            ref: resolvedRunRef,
            kind: isPart ? "part" : "semantic",
            status: auditRunStatus,
            current: auditRunCurrent,
            scope: isPart
              ? { kind: "part", ref: "part-a" }
              : { kind: "microsequence", ref: argumentsValue.microsequencePath[3] },
            startedRevision: 6,
            completedRevision: 7
          },
          summary: isPart ? overview().parts[0].auditSummary : micro.auditSummary,
          components: isPart ? {
            items: argumentsValue.componentCursor ? [{
              ordinal: 2,
              microsequenceRef: "micro-b",
              microsequencePath: secondPath,
              childAuditRunRef: { id: "audit-micro-b", version: "1.0.0" },
              auditedRevision: 6,
              contentHash: "sha256:micro-b",
              status: "complete",
              targetAvailable: componentBAvailable
            }] : [{
              ordinal: 1,
              microsequenceRef: "micro-a",
              microsequencePath: firstPath,
              childAuditRunRef: { id: "audit-micro-a", version: "1.0.0" },
              auditedRevision: 6,
              contentHash: "sha256:micro-a",
              status: "complete",
              targetAvailable: true
            }],
            count: 2,
            nextCursor: argumentsValue.componentCursor ? null : "1",
            truncated: !argumentsValue.componentCursor
          } : { items: [], count: 0, nextCursor: null, truncated: false },
          findings: items,
          total: isPart && withPartDualPagination ? 51 : items.length,
          nextCursor: isPart && withPartDualPagination && !argumentsValue.cursor
            ? "part-findings-50"
            : null,
          truncated: isPart && withPartDualPagination && !argumentsValue.cursor,
          coordination: { mandate: {} }
        };
      },
      async loadAuthoringDesign() {
        return design();
      },
      async loadAuthoringFindingsPage(argumentsValue) {
        probe.findingReads.push(structuredClone(argumentsValue));
        if (requestedDeepFindingPages > 0) {
          const pageNumber = Number(String(argumentsValue.cursor).replace("deep-", ""));
          const nextPage = pageNumber < requestedDeepFindingPages ? pageNumber + 1 : null;
          return {
            items: [{
              findingId: `finding-deep-${pageNumber}`,
              summary: `Achado profundo ${pageNumber}`,
              severity: "medium",
              targetAvailable: true,
              readerTarget: { entityPath: ["course-a"] }
            }],
            total: 4 + requestedDeepFindingPages,
            nextCursor: nextPage == null ? null : `deep-${nextPage}`,
            truncated: nextPage != null,
            stale: false,
            scopeTotalKnown: true
          };
        }
        if (argumentsValue.cursor === "50") {
          return {
            items: Array.from({ length: 4 }, (_, index) => ({
              findingId: `finding-page-${51 + index}`,
              summary: index === 3 ? "Achado final 54" : `Achado adicional ${51 + index}`,
              severity: "medium",
              targetAvailable: true,
              readerTarget: { entityPath: ["course-a"] }
            })),
            total: 54,
            nextCursor: null,
            truncated: false,
            stale: false,
            scopeTotalKnown: true
          };
        }
        return { items: overview().findings, total: 54, nextCursor: "50", truncated: true, stale: false };
      },
      async decideAuthoringFinding(argumentsValue) {
        probe.decisionCalls.push(structuredClone(argumentsValue));
        await new Promise((resolve) => setTimeout(resolve, 80));
        findingStatuses[argumentsValue.findingId] = argumentsValue.decision;
        revision += 1;
        return { workspaceId, revision, status: argumentsValue.decision };
      },
      async prepareAuthoringFindingRepairs(argumentsValue) {
        probe.repairMandates.push(structuredClone(argumentsValue));
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (argumentsValue.findingIds.some((id) => findingStatuses[id] !== "approved")) {
          throw new Error("Somente achados aprovados podem entrar no reparo.");
        }
        currentMandate = {
          id: "repair-mandate-a",
          kind: "repair_findings",
          findingIds: structuredClone(argumentsValue.findingIds),
          decidedAtRevision: revision
        };
        revision += 1;
        return { workspaceId, revision, status: "repair_findings" };
      },
      async requestAuthoringReaudit(argumentsValue) {
        probe.reauditMandates.push(structuredClone(argumentsValue));
        await new Promise((resolve) => setTimeout(resolve, 80));
        const pendingPrepared = (currentMandate?.findingIds || []).some((findingId) => (
          !["repaired", "resolved", "rejected"].includes(findingStatuses[findingId])
        ));
        if (currentMandate?.kind === "repair_findings" && pendingPrepared) {
          throw new Error("Ainda há reparos preparados em andamento.");
        }
        currentMandate = {
          id: "audit-mandate-a",
          kind: "audit",
          ...(argumentsValue.partId ? { targetPartId: argumentsValue.partId } : {}),
          decidedAtRevision: revision
        };
        revision += 1;
        return { workspaceId, revision, status: "audit" };
      },
      async setAuthoringParameter(argumentsValue) {
        probe.setCalls.push(structuredClone(argumentsValue));
        value = Number(argumentsValue.value);
        source = "manual";
        revision += 1;
        return { pending: navigator.onLine === false };
      },
      async restoreAuthoringParameterAuto(argumentsValue) {
        probe.restoreCalls.push(structuredClone(argumentsValue));
        source = "auto";
        value = 2;
        revision += 1;
        return { pending: navigator.onLine === false };
      },
      async retryAuthoringParameterChange(argumentsValue) {
        probe.retryCalls.push(structuredClone(argumentsValue));
        conflict = false;
        revision += 1;
        return design();
      },
      async discardAuthoringParameterChange(argumentsValue) {
        probe.discardCalls.push(structuredClone(argumentsValue));
        conflict = false;
        revision += 1;
        return design();
      },
      async loadAuthoringResourceSetPage(argumentsValue) {
        probe.resourceReads.push(structuredClone(argumentsValue));
        return resourcePage(argumentsValue);
      },
      async saveAuthoringResourceSetSelection(argumentsValue) {
        probe.resourceSaves.push(structuredClone(argumentsValue));
        return argumentsValue.requestId
          ? { succeeded: 2, conflicts: 0, failed: 0, partial: false }
          : {
              succeeded: 1,
              conflicts: 1,
              failed: 0,
              partial: true,
              recovery: {
                action: "retry_same_request",
                requestId: "resource-retry-a",
                message: "Tente concluir os destinos restantes."
              }
            };
      }
    };
    const { createAuthoringWorkspaceSurface } = await import("/src/ui/AuthoringWorkspaceSurface.js");
    const surface = createAuthoringWorkspaceSurface({
      root,
      controller,
      additionalDestinations: withExtraDestination
        ? [{ key: "results", label: "Resultados", icon: "review", available: true }]
        : [],
      onOpenSettings() {
        probe.settingsOpens += 1;
      },
      async onOpenContent(target, returnContext) {
        probe.openTargets.push(structuredClone(target));
        probe.returnContexts.push(structuredClone(returnContext));
        return true;
      }
    });
    window.authoringSurface = surface;
    window.authoringProbe = probe;
    await surface.open();
  }, {
    workspaceId: WORKSPACE_ID,
    firstPath: FIRST_PATH,
    secondPath: SECOND_PATH,
    withExtraDestination: extraDestination,
    withConflict: conflict,
    requestedDeepFindingPages: deepFindingPages,
    withPartDualPagination: partDualPagination,
    withUnassignedRepaired: unassignedRepaired,
    withIncompleteAuditResume: incompleteAuditResume,
    withResearch: research
  });
}

async function openFirstMicrosequence(page) {
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.getByRole("button", { name: /Sinais no cotidiano/u }).click();
}

test("autodidata encontra Estudo, Autoria, mapa, conteúdo e auditoria sem jargão", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountAuthoring(page);

  await expect(page.getByRole("button", { name: "Estudo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Autoria" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Coleções" })).toBeVisible();
  await page.getByRole("button", { name: "Conta e aparência" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.settingsOpens)).toBe(1);
  await expect(page.getByText(/Chatbot|InstructionalAnalysis|MCP|schema|packageId|JSON/u)).toHaveCount(0);
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await expect(page.getByRole("tab", { name: "Mapa" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Desenho" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Conteúdo" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Auditoria" })).toBeVisible();

  await page.getByRole("tab", { name: "Auditoria" }).click();
  await expect(page.getByText("Objetivo do curso precisa de desenvolvimento")).toBeVisible();
  await expect(page.getByText("Prática ainda não materializada")).toBeVisible();
  await expect(page.getByText("Conteúdo original retirado")).toBeVisible();
  await expect(page.getByText(/54\+ achados/u)).toBeVisible();
  await expect(page.getByText(/outros achados podem existir/u)).toBeVisible();
  await page.getByRole("button", { name: /Conteúdo original retirado/u }).click();
  const unavailableFinding = page.getByRole("dialog", { name: "Conteúdo original retirado" });
  await expect(unavailableFinding.getByText(/conteúdo original não está mais disponível/u)).toBeVisible();
  await expect(unavailableFinding.getByRole("button", { name: "Abrir conteúdo" })).toHaveCount(0);
  await unavailableFinding.getByRole("button", { name: "Abrir rodada da Parte" }).click();
  await expect(page.getByRole("dialog", { name: "Conteúdo original retirado" })
    .getByRole("button", { name: "Aprovar para reparo" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Conteúdo original retirado" })
    .getByText(/conteúdo original não está mais disponível/u)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Conteúdo original retirado" })
    .getByRole("button", { name: "Abrir conteúdo" })).toHaveCount(0);
  await page.getByRole("dialog", { name: "Conteúdo original retirado" })
    .getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Ver o workspace" }).click();
  await page.getByRole("button", { name: "Carregar mais achados" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.findingReads.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.findingReads[0].cursor)).toBe("50");
  await expect(page.getByText("Achado final 54")).toBeVisible();
  await expect(page.getByText(/^54 achados pendentes$/u)).toBeVisible();
  await expect(page.getByRole("button", { name: /Carregar.*achados/u })).toHaveCount(0);

  await page.getByRole("tab", { name: "Mapa" }).click();
  await page.getByRole("button", { name: /Sinais no cotidiano/u }).click();
  await page.getByRole("tab", { name: "Auditoria" }).click();
  await expect(page.getByText("Exemplo comprimido demais")).toBeVisible();
  await expect(page.getByText("Objetivo do curso precisa de desenvolvimento")).toHaveCount(0);
  await expect(page.getByText("Prática ainda não materializada")).toHaveCount(0);
  await expect(page.locator(".authoring-audit-heading").getByText("Auditoria pendente")).toBeVisible();
  await page.getByRole("button", { name: "Ver o workspace" }).click();
  await expect(page.getByText("Prática ainda não materializada")).toBeVisible();
});

test("instrutor ajusta valor efetivo, restaura Auto e aplica ResourceSet sem perder invisíveis", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await mountAuthoring(page);
  await openFirstMicrosequence(page);
  await page.getByRole("tab", { name: "Desenho" }).click();

  const parameter = page.getByRole("button", { name: /Novidade/u });
  await expect(parameter).toContainText("2");
  await parameter.click();
  const dialog = page.getByRole("dialog", { name: "Novidade" });
  await expect(dialog.locator("output")).toHaveText("2");
  await dialog.getByRole("button", { name: "Aumentar" }).click();
  await dialog.getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.setCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.setCalls[0])).toMatchObject({
    parameterKey: "novelty_level",
    value: 3,
    expectedRevision: 7
  });
  expect(await page.evaluate(() => window.authoringProbe.setCalls[0].definitionRef)).toBeUndefined();

  await page.getByRole("button", { name: /Novidade/u }).click();
  await page.getByRole("dialog", { name: "Novidade" }).getByRole("button", { name: /^Auto/u }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.restoreCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.restoreCalls[0].parameterKey)).toBe("novelty_level");
  await expect(page.getByRole("button", { name: /Condição de pesquisa/u })).toBeDisabled();

  await page.getByRole("button", { name: /Resources/u }).click();
  const resources = page.getByRole("dialog", { name: "Resources" });
  await expect(resources.getByText(/Nenhum conjunto foi combinado automaticamente/u)).toBeVisible();
  await resources.getByRole("radio", { name: "Texto essencial" }).click();
  const shortText = resources.getByRole("checkbox", { name: "Texto curto" });
  await shortText.uncheck();
  await expect(resources.getByText("Escolha ao menos um Resource.")).toBeVisible();
  await expect(resources.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
  await shortText.check();
  await resources.getByRole("radio", { name: "Diagramas e relações" }).click();
  await expect(resources.getByText("Representações animadas não estão disponíveis nesta condição.")).toBeVisible();
  await expect(resources.getByText("2 selecionados")).toBeVisible();
  await resources.getByRole("button", { name: /Famílias e facetas/u }).click();
  await resources.locator("summary").filter({ hasText: "Famílias" }).click();
  await resources.getByRole("checkbox", { name: "Relações (3)" }).check();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.resourceReads.at(-1)?.facets?.families?.[0])).toBe("relations");
  const diagram = resources.getByRole("checkbox", { name: "Diagrama" });
  await diagram.uncheck();
  await resources.getByRole("searchbox", { name: "Pesquisar Resources" }).fill("diagrama");
  await expect.poll(() => page.evaluate(() => window.authoringProbe.resourceReads.length)).toBeGreaterThan(2);
  await expect(diagram).not.toBeChecked();
  await diagram.check();
  await resources.getByRole("button", { name: /Aplicar em/u }).click();
  await resources.getByRole("radio", { name: "Microssequências escolhidas" }).click();
  await expect(resources.locator("[data-resource-target-index]")).toHaveCount(24);
  await resources.getByRole("searchbox", { name: "Localizar microssequência" }).fill("extensa 54");
  await expect(resources.getByRole("checkbox", { name: /Microssequência extensa 54/u })).toBeVisible();
  await resources.getByRole("searchbox", { name: "Localizar microssequência" }).fill("Sinais em sistemas");
  await resources.getByRole("checkbox", { name: /Sinais em sistemas/u }).check();
  const applyResources = resources.getByRole("button", { name: "Aplicar", exact: true });
  await applyResources.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.authoringProbe.resourceSaves.length)).toBe(1);
  const saved = await page.evaluate(() => window.authoringProbe.resourceSaves[0]);
  expect(saved.scope.kind).toBe("microsequence_set");
  expect(saved.scope.microsequencePaths).toEqual([FIRST_PATH, SECOND_PATH]);
  expect(saved.selectedKeys).toEqual(["diagram", "resource-not-on-this-page"]);
  expect(saved.selectionComplete).toBe(true);
  await expect(resources.getByText(/1 concluída.*1 com conflito/u)).toBeVisible();
  await expect(resources.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
  await expect(resources.getByRole("checkbox", { name: "Diagrama" })).toBeDisabled();
  const retryResources = resources.getByRole("button", { name: "Tentar concluir" });
  await retryResources.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.authoringProbe.resourceSaves.length)).toBe(2);
  const retried = await page.evaluate(() => window.authoringProbe.resourceSaves[1]);
  expect(retried.requestId).toBe("resource-retry-a");
  expect(retried.scope).toEqual(saved.scope);
  expect(retried.selectedKeys).toEqual(saved.selectedKeys);
  expect(retried.resourceSetRef).toEqual(saved.resourceSetRef);
  expect(retried.expectedRevision).toBeUndefined();
});

test("pesquisador conduz protocolo, audita variantes e inicia coleta sem RNG local", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountAuthoring(page, { research: true });
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.getByRole("tab", { name: "Desenho" }).click();

  await expect(page.getByRole("tab")).toHaveCount(4);
  await page.getByRole("button", { name: "Experimentos" }).click();
  await page.getByRole("button", { name: "Novo experimento" }).click();
  await page.getByLabel("Título curto").fill("Representações em sinais");
  await page.getByLabel("Hipótese opcional").fill("Representações combinadas favorecem transferência.");

  for (const factor of ["Modo de explicação", "Elaboração e prática", "Resources permitidos"]) {
    await page.getByText("Adicionar outro fator", { exact: true }).click();
    await page.getByRole("button", { name: new RegExp(factor, "u") }).click();
  }
  await page.getByRole("radio", { name: /Aleatória reproduzível/u }).check();
  await page.getByLabel("Seed registrável").fill("signals-study-2026");
  await page.getByRole("checkbox", { name: "Teste de retenção" }).check();
  await page.getByRole("checkbox", { name: "Transferência" }).check();
  await page.getByRole("button", { name: "Definir condições" }).click();

  await page.locator('[data-condition-id="condition-2"][data-factor-id="factor-1"]').fill("3");
  await page.locator('[data-condition-id="condition-2"][data-factor-id="factor-2"]').selectOption("elaborated");
  await page.locator('[data-condition-id="condition-2"][data-factor-id="factor-3"]').selectOption("contrast-retrieval");
  await page.locator('[data-condition-id="condition-2"][data-factor-id="factor-4"]').selectOption(
    "resource-set-diagram@2.0.0"
  );
  await page.getByRole("button", { name: "Salvar protocolo" }).click();

  await expect.poll(() => page.evaluate(() => (
    window.authoringProbe.experimentCalls.filter(({ operation }) => operation === "save_protocol").length
  ))).toBe(1);
  const saved = await page.evaluate(() => window.authoringProbe.experimentCalls.find(
    ({ operation }) => operation === "save_protocol"
  ).args);
  expect(saved.expectedExperimentRevision).toBe(0);
  expect(saved.protocol.invariants).toEqual(["sources", "targets", "analysis", "structure"]);
  expect(saved.protocol.factors.every(({ targets }) => (
    JSON.stringify(targets) === JSON.stringify([{ kind: "microsequence", ref: "micro-a" }])
  ))).toBe(true);
  expect(saved.protocol.consentPolicyRef).toEqual({ id: "consent-research", version: "1.0.0" });
  expect(saved.protocol.conditions[0].values.map(({ value, resourceSetRef }) => value || resourceSetRef)).toEqual([
    { kind: "integer", value: 1 },
    { kind: "enum", value: "concise" },
    { kind: "set", values: ["elaborated_example", "guided_practice"] },
    { id: "resource-set-text", version: "2.0.0" }
  ]);
  expect(saved.protocol.assignment).toEqual({ rule: "seeded_random", seed: "signals-study-2026" });
  expect(saved.protocol.instrumentRefs).toEqual([{ id: "instrument-retention", version: "1.0.0" }]);
  expect(saved.protocol.outcomeRefs).toEqual([{ id: "outcome-transfer", version: "1.0.0" }]);

  await page.getByRole("button", { name: "Validar protocolo" }).click();
  await page.getByRole("button", { name: "Gerar variantes" }).click();
  await expect(page.getByText(/Aguardando materialização e auditoria/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Congelar esta variante" })).toHaveCount(0);
  await page.evaluate(async () => {
    window.authoringProbe.completeExperimentAudit();
    await window.authoringSurface.refresh();
  });
  await expect(page.getByText("Permitidos na condição").first()).toBeVisible();
  await expect(page.getByText("Materializados na variante").first()).toBeVisible();
  await page.getByRole("button", { name: "Revisar diferenças" }).click();
  await expect(page.getByRole("button", { name: "Confirmar como requerida" })).toBeVisible();
  await page.getByLabel(/Justificativa.*obrigatória/u).fill("Manipulação prevista pelo protocolo aprovado.");
  await page.getByRole("button", { name: "Confirmar como requerida" }).click();

  while (await page.getByRole("button", { name: "Congelar esta variante" }).count()) {
    await page.getByRole("button", { name: "Congelar esta variante" }).first().click();
  }
  const start = page.getByRole("button", { name: "Iniciar coleta" });
  await start.evaluate((button) => {
    button.click();
    button.click();
  });
  const enrollmentDialog = page.getByRole("dialog", { name: "Código de ingresso" });
  await expect(enrollmentDialog.getByText("SINAIS-2026-A", { exact: true })).toBeVisible();
  await page.evaluate(() => window.authoringSurface.refresh());
  await expect(enrollmentDialog.getByText("SINAIS-2026-A", { exact: true })).toBeVisible();
  await enrollmentDialog.getByRole("button", { name: "Entendi" }).click();
  expect(await page.evaluate(() => window.authoringProbe.experimentCalls.filter(
    ({ operation }) => operation === "start_collection"
  ).length)).toBe(1);

  const rotateCode = page.getByRole("button", { name: "Gerar novo código" });
  await rotateCode.evaluate((button) => {
    button.click();
    button.click();
  });
  const rotatedDialog = page.getByRole("dialog", { name: "Código de ingresso" });
  await expect(rotatedDialog.getByText("SINAIS-2026-B", { exact: true })).toBeVisible();
  const rotation = await page.evaluate(() => window.authoringProbe.experimentCalls.filter(
    ({ operation }) => operation === "rotate_enrollment_code"
  ));
  expect(rotation).toHaveLength(1);
  expect(rotation[0].args.expectedWorkspaceRevision).toBeUndefined();
  await rotatedDialog.getByRole("button", { name: "Entendi" }).click();

  await expect(page.getByText("Participante Ipê", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Atribuir no servidor" }).click();
  const assignment = await page.evaluate(() => window.authoringProbe.experimentCalls.find(
    ({ operation }) => operation === "assign_participant"
  ).args);
  expect(assignment.enrollmentRef).toBe("50000000-0000-4000-8000-000000000107");
  expect(assignment.seed).toBeUndefined();
  expect(assignment.conditionRef).toBeUndefined();

  await page.getByRole("button", { name: "Abrir variante" }).first().click();
  const opened = await page.evaluate(() => ({
    target: window.authoringProbe.openTargets.at(-1),
    context: window.authoringProbe.returnContexts.at(-1)
  }));
  expect(opened.target.workspaceId).toBe("40000000-0000-4000-8000-000000000107");
  expect(opened.context).toMatchObject({
    destination: "design",
    experimentView: "detail",
    experimentId: "30000000-0000-4000-8000-000000000107"
  });
  await page.evaluate((context) => window.authoringSurface.resume(context), opened.context);
  await expect(page.getByRole("button", { name: "Pausar coleta" })).toBeVisible();
  await page.getByLabel("Motivo da correção").first().fill(
    "A referência usada na variante congelada precisa ser atualizada."
  );
  await page.getByText(/Manter participantes já atribuídos nesta revisão/u).first().click();
  await page.getByRole("button", { name: "Criar revisão corrigida" }).first().click();
  const correction = await page.evaluate(() => window.authoringProbe.experimentCalls.find(
    ({ operation }) => operation === "request_correction"
  ).args);
  expect(correction.participantContinuity).toBe("retain_existing");
  expect(correction.variantRevisionRef).toEqual({ id: "variant-1", version: "1.0.0" });
  expect(correction.expectedWorkspaceRevision).toBe(31);
});

test("rascunho experimental confirma descarte e volta ao contexto de Desenho", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mountAuthoring(page, { research: true });
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.getByRole("tab", { name: "Desenho" }).click();
  await page.getByRole("button", { name: "Experimentos" }).click();
  await page.getByRole("button", { name: "Novo experimento" }).click();
  await page.getByLabel("Título curto").fill("Rascunho local");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("dialog", { name: "Descartar alterações?" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Continuar editando" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Descartar alterações?" })
    .getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByRole("button", { name: "Novo experimento" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Experimentos" })).toBeVisible();
});

test("editar protocolo seeded exige nova seed sem tentar reler o segredo anterior", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await mountAuthoring(page, { research: true });
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.getByRole("tab", { name: "Desenho" }).click();
  await page.getByRole("button", { name: "Experimentos" }).click();
  await page.getByRole("button", { name: "Novo experimento" }).click();
  await page.getByLabel("Título curto").fill("Protocolo com seed protegida");
  await page.getByRole("radio", { name: /Aleatória reproduzível/u }).check();
  await page.getByLabel("Seed registrável").fill("seed-primeira-revisao");
  await page.getByRole("button", { name: "Definir condições" }).click();
  await page.getByRole("button", { name: "Salvar protocolo" }).click();
  await expect(page.getByRole("button", { name: "Editar protocolo" })).toBeVisible();

  await page.getByRole("button", { name: "Editar protocolo" }).click();
  const seed = page.getByLabel("Seed registrável");
  await expect(seed).toHaveValue("");
  await expect(page.getByText(/seed anterior não pode ser relida/u)).toBeVisible();
  await page.getByLabel("Título curto").fill("Protocolo editado sem vazar seed");
  await page.getByRole("button", { name: "Definir condições" }).click();
  await page.getByRole("button", { name: "Salvar protocolo" }).click();
  await expect(page.getByRole("alert")).toContainText("Informe uma nova seed");
  expect(await page.evaluate(() => window.authoringProbe.experimentCalls.filter(
    ({ operation }) => operation === "save_protocol"
  ).length)).toBe(1);
});

test("fatores ordinários usam controles estruturados sem JSON livre", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountAuthoring(page, { research: true });
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.getByRole("tab", { name: "Desenho" }).click();
  await page.getByRole("button", { name: "Experimentos" }).click();
  await page.getByRole("button", { name: "Novo experimento" }).click();
  await page.getByLabel("Título curto").fill("Elaboração e prática estruturadas");
  for (const factor of [
    "Andaimes de elaboração",
    "Oportunidades de prática",
    "Dimensões de variação da prática",
    "Relação evidência-alvo"
  ]) {
    await page.getByText("Adicionar outro fator", { exact: true }).click();
    await page.getByRole("button", { name: new RegExp(factor, "u") }).click();
  }
  await page.getByRole("button", { name: "Definir condições" }).click();

  for (const conditionId of ["condition-1", "condition-2"]) {
    const scoped = (part) => page.locator(
      `[data-condition-id="${conditionId}"][data-experiment-structured-part="${part}"]`
    );
    await scoped("set").fill("pedagogy:worked_example, pedagogy:guided_practice");
    await scoped("set").press("Tab");
    await scoped("minimum").fill(conditionId === "condition-1" ? "1" : "2");
    await scoped("minimum").press("Tab");
    await scoped("maximum").fill(conditionId === "condition-1" ? "3" : "5");
    await scoped("maximum").press("Tab");
    await scoped("vector").fill("surface | 2 | level\ncontext | 1 | count");
    await scoped("vector").press("Tab");
    await scoped("relation-nodes").fill("evidence:a, target:b");
    await scoped("relation-nodes").press("Tab");
    await scoped("relation-from").fill("evidence:a");
    await scoped("relation-from").press("Tab");
    await scoped("relation-to").fill("target:b");
    await scoped("relation-to").press("Tab");
    await scoped("relation-kind").selectOption("supports");
  }
  await page.getByRole("button", { name: "Salvar protocolo" }).click();
  const saved = await page.evaluate(() => window.authoringProbe.experimentCalls.find(
    ({ operation }) => operation === "save_protocol"
  ).args.protocol);
  const values = saved.conditions[1].values.map((entry) => entry.value).filter(Boolean);
  expect(values).toContainEqual({
    kind: "set",
    values: ["pedagogy:worked_example", "pedagogy:guided_practice"]
  });
  expect(values).toContainEqual({ kind: "range", minimum: 2, maximum: 5 });
  expect(values).toContainEqual({
    kind: "vector",
    components: [
      { dimension: "surface", value: 2, unit: "level" },
      { dimension: "context", value: 1, unit: "count" }
    ]
  });
  expect(values).toContainEqual({
    kind: "relation",
    nodes: ["evidence:a", "target:b"],
    edges: [{ from: "evidence:a", to: "target:b", kind: "supports" }]
  });
});

test("pesquisador vê lock e resolve conflito sem novo override silencioso", async ({ page }) => {
  await mountAuthoring(page, { conflict: true });
  await openFirstMicrosequence(page);
  await page.getByRole("tab", { name: "Desenho" }).click();

  await expect(page.getByRole("button", { name: /Novidade/u })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Condição de pesquisa/u })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Resources/u })).toBeDisabled();
  await expect(page.getByText(/conflito.*Resolva-a/u)).toBeVisible();
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.retryCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.retryCalls[0].requestId)).toBe("request-conflict-a");
  await expect(page.getByRole("button", { name: /Novidade/u })).toBeEnabled();
});

test("autor decide achados, prepara somente aprovados e solicita reauditoria da Parte", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountAuthoring(page);
  await openFirstMicrosequence(page);
  await page.evaluate(() => window.authoringProbe.setAuditRunStatus("semantic_pending"));
  await page.getByRole("tab", { name: "Auditoria" }).click();

  await page.getByRole("button", { name: /Exemplo comprimido demais/u }).click();
  const pendingDetail = page.getByRole("dialog", { name: "Exemplo comprimido demais" });
  await expect(pendingDetail.getByText(/revisão instrucional.*ainda não terminou/u)).toBeVisible();
  await expect(pendingDetail.getByRole("button", { name: "Aprovar para reparo" })).toHaveCount(0);
  await pendingDetail.getByRole("button", { name: "Fechar" }).click();
  await page.evaluate(async () => {
    window.authoringProbe.setAuditRunStatus("complete");
    await window.authoringSurface.refresh();
  });

  await expect(page.getByText("Conforme", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Com achado · 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Exemplo comprimido demais/u }).click();
  const detail = page.getByRole("dialog", { name: "Exemplo comprimido demais" });
  await expect(detail.getByText("Revisão instrucional", { exact: true })).toBeVisible();
  await expect(detail.getByText(/quatro elementos novos.*máximo dois/u)).toBeVisible();
  await expect(detail.getByText("Limite de novidades por passo de teoria", { exact: true })).toBeVisible();
  await detail.getByText("Proveniência", { exact: true }).click();
  await expect(detail.getByText("Análise instrucional", { exact: true })).toBeVisible();
  await expect(detail.getByText("2 de 23 registrados", { exact: true })).toBeVisible();
  await expect(detail.getByText("2 registrados", { exact: true })).toBeVisible();
  const approve = detail.getByRole("button", { name: "Aprovar para reparo" });
  await approve.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.authoringProbe.decisionCalls.length)).toBe(1);
  await expect(page.getByRole("dialog", { name: "Exemplo comprimido demais" })
    .locator(".authoring-finding-badges")
    .getByText("Aprovado para reparo", { exact: true })).toBeVisible();
  await page.getByRole("dialog", { name: "Exemplo comprimido demais" })
    .getByRole("button", { name: "Fechar" }).click();

  const prepare = page.getByRole("button", { name: "Preparar reparos (1)" });
  await prepare.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.authoringProbe.repairMandates.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.repairMandates[0].findingIds)).toEqual(["finding-a"]);

  await page.getByRole("button", { name: "Ver o workspace" }).click();
  await page.getByRole("button", { name: /Fundamentos.*achados/u }).click();
  expect(await page.evaluate(() => window.authoringProbe.auditReads.at(-1))).toMatchObject({
    auditScope: { kind: "part", ref: "part-a" },
    microsequencePath: FIRST_PATH
  });
  expect(await page.evaluate(() => window.authoringProbe.auditReads.at(-1).auditRunRef)).toBeUndefined();
  await expect(page.getByText("Coerência")).toBeVisible();
  await expect(page.getByText("Não verificada", { exact: true })).toHaveCount(4);
  await expect(page.getByText("1 de 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Carregar mais microssequências" }).click();
  expect(await page.evaluate(() => window.authoringProbe.auditReads.at(-1))).toMatchObject({
    auditRunRef: { id: "audit-part-a", version: "1.0.0" },
    componentCursor: "1"
  });
  await page.getByRole("button", { name: /Sinais em sistemas.*Auditoria disponível/u }).click();
  expect(await page.evaluate(() => window.authoringProbe.auditReads.at(-1))).toMatchObject({
    auditRunRef: { id: "audit-micro-b", version: "1.0.0" },
    microsequencePath: SECOND_PATH
  });
  await page.getByRole("button", { name: /Prática ainda não materializada/u }).click();
  let repaired = page.getByRole("dialog", { name: "Prática ainda não materializada" });
  await expect(repaired.getByText(/outros reparos preparados/u)).toBeVisible();
  await expect(repaired.getByRole("button", { name: "Solicitar reauditoria da Parte" })).toHaveCount(0);
  await repaired.getByRole("button", { name: "Fechar" }).click();
  await page.evaluate(async () => {
    window.authoringProbe.completePreparedRepairs();
    window.authoringProbe.setAuditRunCurrent(false);
    await window.authoringSurface.refresh();
  });
  await page.getByRole("button", { name: /Prática ainda não materializada/u }).click();
  repaired = page.getByRole("dialog", { name: "Prática ainda não materializada" });
  await expect(repaired.getByText("Reparado · falta reauditar", { exact: true })).toBeVisible();
  await expect(repaired.getByText(/estado anterior.*nova auditoria/u)).toBeVisible();
  const reaudit = repaired.getByRole("button", { name: "Solicitar reauditoria da Parte" });
  await reaudit.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.authoringProbe.reauditMandates.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.reauditMandates[0].partId)).toBe("part-a");
  await page.evaluate(() => window.authoringProbe.setAuditRunCurrent(true));

  await page.getByRole("button", { name: "Voltar à Parte" }).click();
  expect(await page.evaluate(() => window.authoringProbe.auditReads.at(-1))).toMatchObject({
    auditRunRef: { id: "audit-part-a", version: "1.0.0" },
    microsequencePath: FIRST_PATH
  });
  await page.getByRole("button", { name: /Objetivo do curso precisa de desenvolvimento/u }).click();
  const reject = page.getByRole("dialog", { name: "Objetivo do curso precisa de desenvolvimento" })
    .getByRole("button", { name: "Rejeitar" });
  await reject.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.authoringProbe.decisionCalls.length)).toBe(2);
  await expect(page.getByRole("button", { name: /Objetivo do curso precisa de desenvolvimento/u })).toHaveCount(0);

  await context.setOffline(true);
  await page.getByRole("button", { name: /Conteúdo original retirado/u }).click();
  const offlineDetail = page.getByRole("dialog", { name: "Conteúdo original retirado" });
  await expect(offlineDetail.getByRole("button", { name: "Aprovar para reparo" })).toHaveCount(0);
  await expect(offlineDetail.getByRole("button", { name: "Abrir conteúdo" })).toHaveCount(0);
  await expect(offlineDetail.getByText(/conteúdo original não está mais disponível/u)).toBeVisible();
  await context.setOffline(false);
});

test("paginação da Parte fixa a rodada e preserva achados e microssequências", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountAuthoring(page, { partDualPagination: true });
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.getByRole("tab", { name: "Auditoria" }).click();
  await page.getByRole("button", { name: /Fundamentos.*achados/u }).click();

  await expect(page.getByText("1 de 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Carregar mais microssequências" }).click();
  await expect(page.getByRole("button", { name: /Sinais em sistemas.*Auditoria disponível/u })).toBeVisible();
  expect(await page.evaluate(() => window.authoringProbe.auditReads.at(-1))).toMatchObject({
    auditRunRef: { id: "audit-part-a", version: "1.0.0" },
    componentCursor: "1"
  });

  await page.getByRole("button", { name: "Carregar mais achados" }).click();
  await expect(page.getByText("51 achados pendentes", { exact: true })).toBeVisible();
  await expect(page.getByText("Conteúdo original retirado", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sinais no cotidiano.*Auditoria disponível/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sinais em sistemas.*Auditoria disponível/u })).toBeVisible();
  await expect(page.getByRole("button", { name: "Carregar mais microssequências" })).toHaveCount(0);
  expect(await page.evaluate(() => window.authoringProbe.auditReads.at(-1))).toMatchObject({
    auditRunRef: { id: "audit-part-a", version: "1.0.0" },
    cursor: "part-findings-50"
  });
  expect(await page.evaluate(() => window.authoringProbe.auditReads.some(({ auditRunRef }) => (
    auditRunRef?.id === "audit-part-new"
  )))).toBe(false);
});

test("achado reparado fora de Parte solicita reauditoria do workspace", async ({ page }) => {
  await mountAuthoring(page, { unassignedRepaired: true });
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.getByRole("button", { name: /Ainda sem Parte/u }).click();
  await page.getByRole("button", { name: /Unidade ainda não coordenada/u }).click();
  await page.getByRole("tab", { name: "Auditoria" }).click();
  await page.getByRole("button", { name: /Explicação sem coordenação de Parte/u }).click();
  const dialog = page.getByRole("dialog", { name: "Explicação sem coordenação de Parte" });
  const request = dialog.getByRole("button", { name: "Solicitar reauditoria do workspace" });
  await request.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.authoringProbe.reauditMandates.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.reauditMandates[0].partId)).toBeUndefined();
});

test("resume incompleto nunca libera decisão antes de confirmar a rodada exata", async ({ page }) => {
  await mountAuthoring(page, { incompleteAuditResume: true });
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.getByRole("tab", { name: "Auditoria" }).click();
  await page.getByRole("button", { name: /Exemplo comprimido demais/u }).click();

  let detail = page.getByRole("dialog", { name: "Exemplo comprimido demais" });
  await expect(detail.getByRole("button", { name: "Aprovar para reparo" })).toHaveCount(0);
  await expect(detail.getByText(/rodada.*confirmar.*conclusão/u)).toBeVisible();
  await detail.getByRole("button", { name: "Abrir rodada da microssequência" }).click();

  detail = page.getByRole("dialog", { name: "Exemplo comprimido demais" });
  await expect(detail.getByRole("button", { name: "Aprovar para reparo" })).toBeVisible();
  expect(await page.evaluate(() => window.authoringProbe.auditReads.at(-1))).toMatchObject({
    microsequencePath: FIRST_PATH
  });
});

test("rodada completa mas não corrente permanece histórico somente para consulta", async ({ page }) => {
  await mountAuthoring(page);
  await openFirstMicrosequence(page);
  await page.evaluate(() => window.authoringProbe.setAuditRunCurrent(false));
  await page.getByRole("tab", { name: "Auditoria" }).click();

  await expect(page.locator(".authoring-audit-heading").getByText("Rodada histórica", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: /Exemplo comprimido demais/u }).click();
  const detail = page.getByRole("dialog", { name: "Exemplo comprimido demais" });
  await expect(detail.getByText(/estado anterior.*histórico/u)).toBeVisible();
  await expect(detail.getByRole("button", { name: "Aprovar para reparo" })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "Abrir conteúdo" })).toBeVisible();
});

test("componente removido da Parte fica indisponível sem abrir referência técnica", async ({ page }) => {
  await mountAuthoring(page);
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.evaluate(() => window.authoringProbe.setComponentBAvailable(false));
  await page.getByRole("tab", { name: "Auditoria" }).click();
  await page.getByRole("button", { name: /Fundamentos.*achados/u }).click();
  await page.getByRole("button", { name: "Carregar mais microssequências" }).click();

  const readsBefore = await page.evaluate(() => window.authoringProbe.auditReads.length);
  const component = page.getByRole("button", { name: /Sinais em sistemas.*Conteúdo indisponível/u });
  await expect(component).toBeDisabled();
  await expect(page.locator(".authoring-audit-components")).not.toContainText("audit-micro-b");
  expect(await page.evaluate(() => window.authoringProbe.auditReads.length)).toBe(readsBefore);
});

test("finding abre alvo exato e retorna à Auditoria e à mesma microssequência", async ({ page }) => {
  await mountAuthoring(page);
  await openFirstMicrosequence(page);
  await page.getByRole("tab", { name: "Auditoria" }).click();
  await page.getByRole("button", { name: /Exemplo comprimido demais/u }).click();
  const findingDialog = page.getByRole("dialog", { name: "Exemplo comprimido demais" });
  await expect(findingDialog.getByText(/quatro elementos novos/u)).toBeVisible();
  await findingDialog.getByRole("button", { name: "Abrir conteúdo" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.openTargets.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.openTargets[0])).toMatchObject({
    workspaceId: WORKSPACE_ID,
    entityPath: [...FIRST_PATH, "card-current"],
    resourceTargetId: "content:diagram-a"
  });
  expect(await page.evaluate(() => window.authoringProbe.returnContexts[0])).toMatchObject({
    workspaceId: WORKSPACE_ID,
    destination: "audit",
    microsequencePath: FIRST_PATH,
    findingId: "finding-a"
  });
  await page.evaluate(() => window.authoringSurface.resume(window.authoringProbe.returnContexts[0]));
  await expect(page.getByRole("tab", { name: "Auditoria" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog", { name: "Exemplo comprimido demais" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Exemplo comprimido demais" })
    .getByRole("button", { name: "Fechar" })).toBeFocused();
  await page.getByRole("dialog", { name: "Exemplo comprimido demais" })
    .getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByRole("button", { name: "Ver o workspace" })).toBeVisible();

  await page.getByRole("button", { name: "Ver o workspace" }).click();
  await page.getByRole("button", { name: "Carregar mais achados" }).click();
  await page.getByRole("button", { name: /Achado final 54/u }).click();
  await page.getByRole("dialog", { name: "Achado final 54" })
    .getByRole("button", { name: "Abrir conteúdo" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.openTargets.length)).toBe(2);
  expect(await page.evaluate(() => window.authoringProbe.returnContexts[1])).toMatchObject({
    destination: "audit",
    microsequencePath: null,
    findingId: "finding-page-54"
  });
  await page.evaluate(() => window.authoringSurface.resume(window.authoringProbe.returnContexts[1]));
  await expect(page.getByRole("dialog", { name: "Achado final 54" })
    .getByRole("button", { name: "Fechar" })).toBeFocused();
});

test("retorno encontra o achado por cursor mesmo depois de mais de oito páginas", async ({ page }) => {
  await mountAuthoring(page, { deepFindingPages: 9 });
  await openFirstMicrosequence(page);

  await page.evaluate(({ workspaceId, firstPath }) => window.authoringSurface.resume({
    workspaceId,
    destination: "audit",
    microsequencePath: firstPath,
    findingId: "finding-deep-9"
  }), { workspaceId: WORKSPACE_ID, firstPath: FIRST_PATH });

  await expect(page.getByRole("button", { name: "Achado profundo 9" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => (
    window.authoringProbe.auditReads.filter(({ cursor }) => cursor).length
  ))).toBe(9);
  expect(await page.evaluate(() => (
    window.authoringProbe.auditReads.filter(({ cursor }) => cursor)
      .every(({ auditRunRef }) => auditRunRef?.id === "audit-micro-a" && auditRunRef?.version === "1.0.0")
  ))).toBe(true);
  expect(await page.evaluate(() => window.authoringProbe.findingReads.length)).toBe(0);
});

test("rodada concluída com histórico terminal não permanece pendente", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async ({ workspaceId, firstPath }) => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    const { renderAuthoringWorkspaceSurface } = await import("/src/ui/renderAuthoringWorkspace.js");
    const dimensions = [
      { key: "structure", label: "Estrutura", status: "conformant", findingCount: 0 },
      { key: "design", label: "Desenho", status: "finding", findingCount: 1 },
      { key: "practice", label: "Prática", status: "not_checked", findingCount: 0 },
      { key: "resources", label: "Resources", status: "conformant", findingCount: 0 }
    ];
    const finding = {
      findingId: "finding-terminal",
      summary: "Achado já resolvido",
      origin: "semantic_audit",
      severity: "medium",
      status: "resolved",
      targetAvailable: true,
      readerTarget: { entityPath: firstPath },
      auditRunRef: { id: "audit-terminal", version: "1.0.0" }
    };
    const selectedMicrosequence = {
      key: "micro-a",
      title: "Sinais no cotidiano",
      entityPath: firstPath,
      auditSummary: { dimensions, explicit: true }
    };
    root.innerHTML = renderAuthoringWorkspaceSurface({
      workspaceId,
      workspaceTitle: "Curso de sinais",
      destination: "audit",
      loading: false,
      auditLoading: false,
      findingsAvailable: true,
      findingsLoading: false,
      findingsPageLoaded: true,
      findingsNextCursor: null,
      findingsOfflineLimited: false,
      auditActionsOnline: true,
      auditOperational: true,
      auditActionCapabilities: { decide: true, prepare: true, reaudit: true },
      selectedMicrosequence,
      auditPartId: "",
      auditSlice: {
        latestAuditRun: {
          ref: { id: "audit-terminal", version: "1.0.0" },
          status: "complete",
          current: true
        },
        summary: { dimensions, explicit: true },
        findings: [finding],
        total: 1,
        truncated: false,
        nextCursor: null
      },
      overview: {
        workspaceId,
        title: "Curso de sinais",
        state: { key: "ready", label: "Sem pendência corrente", icon: "ready-state" },
        parts: [],
        findings: [finding],
        findingsTotal: 1,
        findingsTruncated: false,
        audit: { summary: { dimensions, explicit: true } },
        capabilities: {}
      }
    }, [
      { key: "map", label: "Mapa", icon: "graph" },
      { key: "design", label: "Desenho", icon: "intent" },
      { key: "content", label: "Conteúdo", icon: "card" },
      { key: "audit", label: "Auditoria", icon: "review" }
    ]);
  }, { workspaceId: WORKSPACE_ID, firstPath: FIRST_PATH });

  await expect(page.locator(".authoring-audit-heading").getByText("Sem achado ativo neste recorte")).toBeVisible();
  await expect(page.locator(".authoring-audit-heading").getByText("Auditoria concluída")).toBeVisible();
  await expect(page.locator(".authoring-audit-heading").getByText("Auditoria pendente")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Achado já resolvido/u })).toBeVisible();
});

test("shell mantém uma superfície e navegação acessível em 360, 390, 412 e 1280", async ({ page }) => {
  for (const width of [360, 390, 412, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 780 });
    await mountAuthoring(page, { extraDestination: true });
    await page.getByRole("button", { name: /Curso de sinais/u }).click();
    const geometry = await page.evaluate(() => {
      const root = document.querySelector(".authoring-app-root");
      const tabs = [...document.querySelectorAll("[data-authoring-destination]")]
        .map((node) => node.getBoundingClientRect());
      return {
        rootWidth: root.clientWidth,
        rootScrollWidth: root.scrollWidth,
        tabs: tabs.map(({ left, right, top, bottom }) => ({ left, right, top, bottom })),
        viewport: document.documentElement.clientWidth
      };
    });
    expect(geometry.rootScrollWidth).toBeLessThanOrEqual(geometry.rootWidth);
    for (const tab of geometry.tabs) {
      expect(tab.left).toBeGreaterThanOrEqual(0);
      expect(tab.right).toBeLessThanOrEqual(geometry.viewport);
    }
    if (width < 800) {
      expect(new Set(geometry.tabs.map((tab) => Math.round(tab.top))).size).toBe(1);
    } else {
      expect(geometry.tabs[1].top).toBeGreaterThan(geometry.tabs[0].top);
    }
    const map = page.getByRole("tab", { name: "Mapa" });
    await map.focus();
    await map.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Desenho" })).toHaveAttribute("aria-selected", "true");
  }
});

test("tema claro/escuro, zoom de 200% e fila offline preservam operação", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountAuthoring(page);
  await page.evaluate(() => document.documentElement.setAttribute("data-color-mode", "dark"));
  await openFirstMicrosequence(page);
  await page.getByRole("tab", { name: "Desenho" }).click();
  await expect(page.locator(".authoring-screen")).toHaveCSS("color", /rgb/u);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-color-mode", "light");
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await context.setOffline(true);
  await page.getByRole("button", { name: /Novidade/u }).click();
  await page.getByRole("dialog", { name: "Novidade" }).getByRole("button", { name: "Aumentar" }).click();
  await page.getByRole("dialog", { name: "Novidade" }).getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText(/aguardando sincronização/u)).toBeVisible();
  await context.setOffline(false);
});

test("gera capturas canônicas de Mapa, Desenho e Auditoria", async ({ page }) => {
  test.skip(!CAPTURE_AUTHORING_SCREENSHOTS, "Captura opt-in para não alterar artefatos em cada regressão.");
  fs.mkdirSync("docs/screenshots/authoring", { recursive: true });
  for (const fixture of [
    { width: 390, height: 844, theme: "light" },
    { width: 1280, height: 800, theme: "dark" }
  ]) {
    await page.setViewportSize({ width: fixture.width, height: fixture.height });
    await mountAuthoring(page);
    await page.evaluate((theme) => document.documentElement.setAttribute("data-color-mode", theme), fixture.theme);
    await page.getByRole("button", { name: /Curso de sinais/u }).click();
    const suffix = `${fixture.width}-${fixture.theme}`;
    await page.screenshot({
      path: `docs/screenshots/authoring/authoring-map-${suffix}.png`,
      animations: "disabled"
    });
    await page.getByRole("button", { name: /Sinais no cotidiano/u }).click();
    await page.getByRole("tab", { name: "Desenho" }).click();
    await page.screenshot({
      path: `docs/screenshots/authoring/authoring-design-${suffix}.png`,
      animations: "disabled"
    });
    await page.getByRole("tab", { name: "Auditoria" }).click();
    await page.screenshot({
      path: `docs/screenshots/authoring/authoring-audit-${suffix}.png`,
      animations: "disabled"
    });
    await page.getByRole("button", { name: /Exemplo comprimido demais/u }).click();
    await page.getByText("Proveniência", { exact: true }).click();
    await page.screenshot({
      path: `docs/screenshots/authoring/authoring-audit-detail-${suffix}.png`,
      animations: "disabled"
    });
    await page.getByRole("dialog", { name: "Exemplo comprimido demais" })
      .getByRole("button", { name: "Fechar" }).click();
    await page.getByRole("button", { name: "Ver o workspace" }).click();
    await page.getByRole("button", { name: /Fundamentos.*achados/u }).click();
    await page.getByRole("heading", { name: "Microssequências da Parte" }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `docs/screenshots/authoring/authoring-audit-part-${suffix}.png`,
      animations: "disabled"
    });
  }
});
