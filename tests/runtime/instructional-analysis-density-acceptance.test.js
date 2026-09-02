import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  COURSE_COMPONENT_CATALOG_VERSION,
  COURSE_DESIGN_CONTEXT_CONTRACT,
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  auditDesignApplication,
  normalizeCourseDesignApplication
} from "../../src/domain/courseDesignParameters.js";
import {
  auditDesignApplication as auditEdgeDesignApplication
} from "../../supabase/functions/_shared/aralearn/runtime/domain/courseDesignParameters.js";
import {
  courseAuthoringGuidanceForCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  COURSE_HUMAN_TASKS
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/instructional-analysis-density-acceptance.v1.json",
  import.meta.url
), "utf8"));

const COURSE_ID = "60000000-0000-4000-8000-000000000001";
const PART_ID = "60000000-0000-4000-8000-000000000002";
const MICROSEQUENCE_ID = "network-request-path";
const CONTEXT_HASH = "6".repeat(64);
const REQUIRED_FORMS = [
  "plain_definition",
  "concrete_example",
  "mechanism",
  "contrast"
];

const inventoryById = new Map(
  fixture.analysisInventory.map((item) => [item.id, item])
);

function resolvedParameters(ceiling) {
  return COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
    parameterId: definition.id,
    value: definition.id === "new_analysis_unit_ceiling_per_expository_study_unit"
      ? ceiling
      : structuredClone(definition.defaultValue),
    origin: "research_condition",
    reason: "Condição focal da fixture de aceitação.",
    sourceScope: {
      kind: "didactic_microsequence",
      ref: MICROSEQUENCE_ID
    }
  }));
}

function designContext(analysisUnitIds, {
  ceiling = 2,
  evidenceRequirement = null
} = {}) {
  return {
    contract: COURSE_DESIGN_CONTEXT_CONTRACT,
    courseId: COURSE_ID,
    courseRevision: 1,
    authoringPartId: PART_ID,
    componentCatalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
    instructionalAnalysisUnits: analysisUnitIds.map((id, position) => ({
      id,
      position,
      statement: inventoryById.get(id).statement,
      version: 1
    })),
    evidenceRequirements: evidenceRequirement ? [{
      id: evidenceRequirement.id,
      position: 0,
      statement: evidenceRequirement.statement,
      version: 1
    }] : [],
    guidanceRevisions: [],
    targets: [{
      didacticMicrosequenceId: MICROSEQUENCE_ID,
      instructionalAnalysisUnitIds: [...analysisUnitIds],
      evidenceRequirementIds: evidenceRequirement ? [evidenceRequirement.id] : [],
      parameters: resolvedParameters(ceiling),
      componentPolicy: {
        changeId: null,
        policy: {
          catalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
          availability: "all",
          allowedRefs: [],
          excludedRefs: [],
          preferredRefs: []
        },
        origin: "system_default",
        reason: "Catálogo corrente disponível.",
        sourceScope: null
      }
    }]
  };
}

function explanation(instructionalAnalysisUnitId, developedForms = REQUIRED_FORMS, notApplicable = []) {
  return { instructionalAnalysisUnitId, developedForms, notApplicable };
}

function applicationForDistribution(variant) {
  return {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE_ID,
    studyUnits: variant.introducedByStudyUnit.map((ids, index) => ({
      studyUnitId: `ceiling-${variant.ceiling}-unit-${index + 1}`,
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: [...ids],
      explanationApplications: ids.map((id) => explanation(id)),
      practiceApplications: [],
      componentRefs: []
    }))
  };
}

function flattenedIntroductions(variant) {
  return variant.introducedByStudyUnit.flat();
}

test("#267 fixa os julgamentos semânticos como declarações revisáveis, não como vereditos do backend", () => {
  assert.equal(fixture.format, "aralearn.instructional-analysis-density-acceptance.v1");
  assert.equal(
    fixture.epistemicStatus,
    "synthetic_semantic_declarations_for_model_and_human_review_not_backend_verdicts"
  );
  assert.equal(inventoryById.size, fixture.analysisInventory.length);
  assert.equal(JSON.stringify(fixture).includes("semanticScore"), false);
  assert.equal(JSON.stringify(fixture).includes("clusterId"), false);
  assert.equal(JSON.stringify(fixture).includes("hierarchy"), false);

  const cases = new Map(fixture.semanticCases.map((item) => [item.id, item]));
  assert.deepEqual([...cases.keys()], [
    "aggregated_networks_and_servers",
    "many_established_items_one_new_relation",
    "hidden_auxiliary_concept",
    "incidental_term"
  ]);
  for (const item of cases.values()) {
    assert.equal(new Set(item.assumedPriorKnowledge).size, item.assumedPriorKnowledge.length);
    assert.ok(item.expectedNewAnalysisUnitIds.length > 0);
    assert.equal(
      item.expectedNewAnalysisUnitIds.every((id) => inventoryById.has(id)),
      true
    );
  }

  const aggregated = cases.get("aggregated_networks_and_servers");
  assert.equal(aggregated.producerDeclaration, "decompose_before_materialization");
  assert.ok(aggregated.expectedNewAnalysisUnitIds.length > 1);

  const oneRelation = cases.get("many_established_items_one_new_relation");
  assert.ok(oneRelation.assumedPriorKnowledge.length >= 5);
  assert.equal(oneRelation.expectedNewAnalysisUnitIds.length, 1);
  assert.equal(oneRelation.producerDeclaration, "accept_one_new_relation");

  const auxiliary = cases.get("hidden_auxiliary_concept");
  const auxiliaryStatements = auxiliary.expectedNewAnalysisUnitIds
    .map((id) => inventoryById.get(id).statement)
    .join(" ");
  assert.equal(auxiliary.assumedPriorKnowledge.includes(auxiliary.hiddenAuxiliaryTerm), false);
  assert.match(auxiliaryStatements, /proxy reverso/iu);
  assert.equal(auxiliary.producerDeclaration, "inventory_auxiliary_before_first_use");

  const incidental = cases.get("incidental_term");
  const materialStatements = incidental.expectedNewAnalysisUnitIds
    .map((id) => inventoryById.get(id).statement)
    .join(" ");
  for (const term of incidental.incidentalTerms) {
    assert.equal(materialStatements.toLocaleLowerCase("pt-BR").includes(
      term.toLocaleLowerCase("pt-BR")
    ), false);
  }
  assert.equal(incidental.producerDeclaration, "do_not_atomize_incidental_term");
});

test("#267 projeta ao produtor inventário prévio, estabilidade do teto e a fronteira determinística", () => {
  const planning = courseAuthoringGuidanceForCall("consultar_planejamento");
  const materialization = courseAuthoringGuidanceForCall("preparar_materializacao");
  const review = courseAuthoringGuidanceForCall("preparar_revisao");
  assert.equal(planning.contract, "aralearn.authoring-guidance.v1");
  assert.equal(materialization.contract, "aralearn.authoring-guidance.v1");
  assert.equal(review.contract, "aralearn.authoring-guidance.v1");

  const planningText = planning.instructions.join(" ");
  const materializationText = materialization.instructions.join(" ");
  const reviewText = review.instructions.join(" ");
  assert.match(planningText, /inventari/iu);
  assert.match(planningText, /conceitos? auxiliares?/iu);
  assert.match(planningText, /incidental/iu);
  assert.match(planningText, /(?:mesmo|preserv).{0,80}inventário|inventário.{0,80}(?:não muda|permanece)/iu);
  assert.match(planningText, /servidor confere somente/iu);
  assert.match(
    materializationText,
    /(?:plano|item).{0,30}agregado.{0,100}(?:corrija|decomponha).{0,80}antes/iu
  );
  assert.match(
    materializationText,
    /(?:desenvolvimento em outras|produz mais|desenvolv.{0,30}várias) Unidades/iu
  );
  assert.match(materializationText, /consolidação formativa.{0,120}não invente evidence_requirement/iu);
  assert.match(reviewText, /novidades independentes escondidas/iu);
  assert.match(reviewText, /conhecimentos não estabelecidos/iu);
});

test("#267 teto 1 e 2 preservam o mesmo inventário e mudam somente sua distribuição", () => {
  const { invariantInventoryIds, variants, allowedDifference } = fixture.ceilingComparison;
  assert.equal(allowedDifference, "distribution_only");
  assert.deepEqual(variants.map(({ ceiling }) => ceiling), [1, 2]);
  for (const variant of variants) {
    const flattened = flattenedIntroductions(variant);
    assert.deepEqual(flattened, invariantInventoryIds);
    assert.equal(new Set(flattened).size, invariantInventoryIds.length);
    assert.equal(
      variant.introducedByStudyUnit.every((ids) => ids.length <= variant.ceiling),
      true
    );

    const context = designContext(invariantInventoryIds, { ceiling: variant.ceiling });
    const application = applicationForDistribution(variant);
    const domainAudit = auditDesignApplication(context, application, {
      contextHash: CONTEXT_HASH
    });
    assert.deepEqual(domainAudit.issues, []);
    assert.deepEqual(
      auditEdgeDesignApplication(context, application, { contextHash: CONTEXT_HASH }),
      domainAudit
    );
    assert.deepEqual(
      domainAudit.summary.introducedInstructionalAnalysisUnitIds,
      invariantInventoryIds
    );
  }

  const ceilingOneContext = designContext(invariantInventoryIds, { ceiling: 1 });
  const ceilingTwoDistribution = applicationForDistribution(variants[1]);
  const rejected = auditDesignApplication(ceilingOneContext, ceilingTwoDistribution, {
    contextHash: CONTEXT_HASH
  });
  assert.equal(rejected.valid, false);
  assert.equal(
    rejected.issues.filter((issue) => issue.startsWith("new_analysis_unit_ceiling_exceeded:"))
      .length,
    2
  );
});

test("#267 explicita o limite epistêmico: tópico agregado pode passar na forma e falhar semanticamente", () => {
  const aggregated = fixture.semanticCases.find(({ id }) => (
    id === "aggregated_networks_and_servers"
  ));
  const mechanicallyBroadId = "63000000-0000-4000-8000-000000000001";
  const context = designContext(
    [fixture.ceilingComparison.invariantInventoryIds[0]],
    { ceiling: 1 }
  );
  context.instructionalAnalysisUnits = [{
    id: mechanicallyBroadId,
    position: 0,
    statement: aggregated.candidateStatement,
    version: 1
  }];
  context.targets[0].instructionalAnalysisUnitIds = [mechanicallyBroadId];
  const application = {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE_ID,
    studyUnits: [{
      studyUnitId: "mechanically-valid-broad-topic",
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: [mechanicallyBroadId],
      explanationApplications: [explanation(mechanicallyBroadId)],
      practiceApplications: [],
      componentRefs: []
    }]
  };

  assert.equal(aggregated.producerDeclaration, "decompose_before_materialization");
  assert.deepEqual(
    auditDesignApplication(context, application, { contextHash: CONTEXT_HASH }).issues,
    []
  );
});

test("#267 preserva desenvolvimento 1→N e notApplicable factual sem contar continuação como novidade", () => {
  const scenario = fixture.oneToManyDevelopment;
  const context = designContext([scenario.analysisUnitId], { ceiling: 1 });
  const application = {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE_ID,
    studyUnits: scenario.studyUnitContributions.map((contribution, index) => ({
      studyUnitId: `one-to-many-${index + 1}`,
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: contribution.introduces
        ? [scenario.analysisUnitId]
        : [],
      explanationApplications: [explanation(
        scenario.analysisUnitId,
        contribution.developedForms,
        contribution.notApplicable || []
      )],
      practiceApplications: [],
      componentRefs: []
    }))
  };
  const audit = auditDesignApplication(context, application, { contextHash: CONTEXT_HASH });
  assert.deepEqual(audit.issues, []);
  assert.equal(audit.summary.studyUnitCount, 3);
  assert.deepEqual(audit.summary.introducedInstructionalAnalysisUnitIds, [
    scenario.analysisUnitId
  ]);
  assert.equal(application.studyUnits[2].explanationApplications[0].notApplicable.length, 1);

  const introducedTooLate = structuredClone(application);
  introducedTooLate.studyUnits[0].introducedInstructionalAnalysisUnitIds = [];
  introducedTooLate.studyUnits[2].introducedInstructionalAnalysisUnitIds = [
    scenario.analysisUnitId
  ];
  assert.equal(
    auditDesignApplication(context, introducedTooLate, { contextHash: CONTEXT_HASH }).issues
      .some((issue) => issue.startsWith("explanation_before_introduction:")),
    true
  );
});

test("#267 consolidação vazia não fabrica evidência e prática real conserva operação e variação", () => {
  const scenario = fixture.consolidationAndPractice;
  const analysisUnitId = fixture.oneToManyDevelopment.analysisUnitId;
  const context = designContext([analysisUnitId], {
    ceiling: 1,
    evidenceRequirement: scenario.evidenceRequirement
  });
  const application = {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE_ID,
    studyUnits: [{
      studyUnitId: "explanation-before-consolidation",
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: [analysisUnitId],
      explanationApplications: [explanation(analysisUnitId)],
      practiceApplications: [],
      componentRefs: []
    }, {
      studyUnitId: "formative-consolidation",
      componentRefs: [],
      ...structuredClone(scenario.consolidation)
    }, ...scenario.evidenceOpportunities.map((opportunity, index) => ({
      studyUnitId: `evidence-practice-${index + 1}`,
      mode: "practice",
      introducedInstructionalAnalysisUnitIds: [],
      explanationApplications: [],
      practiceApplications: [{
        evidenceRequirementId: scenario.evidenceRequirement.id,
        ...opportunity
      }],
      componentRefs: []
    }))]
  };
  const audit = auditDesignApplication(context, application, { contextHash: CONTEXT_HASH });
  assert.deepEqual(audit.issues, []);
  assert.equal(audit.summary.modeCounts.practice, 3);
  assert.equal(audit.summary.practiceOpportunityCount, 2);
  assert.deepEqual(application.studyUnits[1].practiceApplications, []);
  assert.deepEqual(context.targets[0].evidenceRequirementIds, [
    scenario.evidenceRequirement.id
  ]);

  const changedOperation = structuredClone(application);
  changedOperation.studyUnits.at(-1).practiceApplications[0].invariantTaskOperation =
    "nomear os componentes visuais do diagrama";
  assert.ok(
    auditDesignApplication(context, changedOperation, { contextHash: CONTEXT_HASH }).issues
      .includes(`invariant_task_operation_changed:${scenario.evidenceRequirement.id}`)
  );
});

test("#267 o contrato interno transporta a aplicação granular sem score, grafo ou nova hierarquia", () => {
  const application = applicationForDistribution(fixture.ceilingComparison.variants[0]);
  assert.deepEqual(normalizeCourseDesignApplication(application), application);

  const designApplicationSchema = COURSE_HUMAN_TASKS.find(
    ({ name }) => name === "materializar_parte"
  ).inputSchema;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    designApplicationSchema
  );
  const statements = new Map(fixture.analysisInventory.map(({ id, statement }) => [id, statement]));
  const humanApplication = {
    curso: "Redes para iniciantes",
    parte: "Percurso de uma requisição",
    unidades: fixture.ceilingComparison.variants[0].introducedByStudyUnit.map((ids, index) => ({
      microssequencia: "Sockets e portas",
      posicao: index + 1,
      conteudo: { title: `Unidade ${index + 1}`, role: "theory", content: [] },
      aplicacaoPedagogica: {
        modo: "expositiva",
        novidadesIntroduzidas: ids.map((id) => statements.get(id)),
        explicacoes: ids.map((id) => ({
          novidade: statements.get(id),
          formas: ["plain_definition"]
        })),
        praticas: []
      },
      fontes: []
    }))
  };
  assert.equal(validate(humanApplication), true, JSON.stringify(validate.errors));
  const transportedFields = Object.keys(
    designApplicationSchema.properties.unidades.items.properties
  );
  assert.deepEqual(transportedFields.sort(), [
    "aplicacaoPedagogica",
    "conteudo",
    "fontes",
    "microssequencia",
    "posicao"
  ]);
  assert.doesNotMatch(
    JSON.stringify(designApplicationSchema),
    /semanticScore|clusterId|hierarchy|cognitiveLoad|requestId|expectedRevision/iu
  );
});
