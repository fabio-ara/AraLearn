import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  COURSE_COMPONENT_CATALOG_VERSION,
  COURSE_DESIGN_CONTEXT_CONTRACT,
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  auditDesignApplication,
  normalizeCourseDesignCommand,
  resolveCourseDesignParameters
} from "../../src/domain/courseDesignParameters.js";
import {
  COURSE_HUMAN_TASKS
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  courseAuthoringGuidanceForCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  projectHumanAuthoringTasksForActions
} from "../../scripts/projectHumanAuthoringActions.mjs";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/authoring-parameter-calibration.v1.json",
  import.meta.url
), "utf8"));
const openApiText = await fs.readFile(new URL(
  "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
  import.meta.url
), "utf8");
const openApi = JSON.parse(openApiText);

const COURSE_ID = "70000000-0000-4000-8000-000000000001";
const PART_ID = "70000000-0000-4000-8000-000000000002";
const MICROSEQUENCE_ID = "request-routing";
const EVIDENCE_ID = "72000000-0000-4000-8000-000000000001";
const CONTEXT_HASH = "7".repeat(64);
const PARAMETER_IDS = COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id }) => id);

function parameterMap(overrides = {}) {
  return Object.fromEntries(COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => [
    definition.id,
    Object.hasOwn(overrides, definition.id)
      ? structuredClone(overrides[definition.id])
      : structuredClone(definition.defaultValue)
  ]));
}

function designContext({
  analysisUnitIds,
  parameters,
  withEvidence = false
}) {
  return {
    contract: COURSE_DESIGN_CONTEXT_CONTRACT,
    courseId: COURSE_ID,
    courseRevision: 1,
    authoringPartId: PART_ID,
    componentCatalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
    instructionalAnalysisUnits: analysisUnitIds.map((id, position) => ({
      id,
      position,
      statement: `Novidade semanticamente inventariada ${position + 1}.`,
      version: 1
    })),
    evidenceRequirements: withEvidence ? [{
      id: EVIDENCE_ID,
      position: 0,
      statement: "Aplicar a mesma operação em situações distintas.",
      version: 1
    }] : [],
    guidanceRevisions: [],
    targets: [{
      didacticMicrosequenceId: MICROSEQUENCE_ID,
      instructionalAnalysisUnitIds: [...analysisUnitIds],
      evidenceRequirementIds: withEvidence ? [EVIDENCE_ID] : [],
      parameters: PARAMETER_IDS.map((parameterId) => ({
        parameterId,
        value: structuredClone(parameters[parameterId]),
        origin: "research_condition",
        reason: "Condição focal da prova de parametrização.",
        sourceScope: { kind: "didactic_microsequence", ref: MICROSEQUENCE_ID }
      })),
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

function explanation(instructionalAnalysisUnitId, developedForms) {
  return {
    instructionalAnalysisUnitId,
    developedForms,
    notApplicable: []
  };
}

function expositoryApplication(condition) {
  const forms = condition.parameters.required_explanation_forms;
  return {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE_ID,
    studyUnits: condition.introducedByStudyUnit.map((ids, index) => ({
      studyUnitId: `${condition.id}-expository-${index + 1}`,
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: [...ids],
      explanationApplications: ids.map((id) => explanation(id, forms)),
      practiceApplications: [],
      componentRefs: []
    }))
  };
}

function practiceApplication(opportunityCount, variedDimensions = ["case_or_data"]) {
  const analysisUnitId = fixture.explicitComparison.invariantAnalysisUnitIds[0];
  return {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE_ID,
    studyUnits: [{
      studyUnitId: "practice-setup",
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: [analysisUnitId],
      explanationApplications: [explanation(analysisUnitId, ["plain_definition"])],
      practiceApplications: [],
      componentRefs: []
    }, ...Array.from({ length: opportunityCount }, (_, index) => ({
      studyUnitId: `practice-${index + 1}`,
      mode: "practice",
      introducedInstructionalAnalysisUnitIds: [],
      explanationApplications: [],
      practiceApplications: [{
        evidenceRequirementId: EVIDENCE_ID,
        opportunityId: `case-${index + 1}`,
        invariantTaskOperation: "escolher o destino da requisição pela condição apresentada",
        variedDimensions: index === opportunityCount - 1
          ? [...variedDimensions]
          : ["case_or_data"]
      }],
      componentRefs: []
    }))]
  };
}

function validator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

test("#268 mantém quatro parâmetros pedagógicos e calibra automaticamente com contexto mínimo", () => {
  assert.equal(fixture.format, "aralearn.authoring-parameter-calibration-eval.v1");
  assert.equal(
    fixture.epistemicStatus,
    "synthetic_producer_resolutions_for_contract_and_human_review_not_learning_claims"
  );
  assert.deepEqual(fixture.pedagogicalParameterIds, PARAMETER_IDS);
  assert.deepEqual(fixture.calibrationInputs, [
    "audience",
    "explicitPrerequisites",
    "objective",
    "sources",
    "studyConstraints",
    "authorIntent"
  ]);
  assert.equal(fixture.automaticScenarios.length, 2);

  for (const scenario of fixture.automaticScenarios) {
    assert.deepEqual(Object.keys(scenario.context), fixture.calibrationInputs);
    assert.equal(scenario.interactionPolicy, (
      "ask_one_material_question_only_if_context_cannot_support_a_choice"
    ));
    assert.deepEqual(
      scenario.resolvedParameters.map(({ parameterId }) => parameterId),
      PARAMETER_IDS
    );
    for (const resolution of scenario.resolvedParameters) {
      const command = {
        type: "set_parameter",
        scope: { kind: "didactic_microsequence", ref: MICROSEQUENCE_ID },
        parameterId: resolution.parameterId,
        value: resolution.value,
        origin: "automatic",
        reason: resolution.reason
      };
      assert.deepEqual(normalizeCourseDesignCommand(command), command);
    }
  }
  const [novice, experienced] = fixture.automaticScenarios.map(({ resolvedParameters }) => (
    Object.fromEntries(resolvedParameters.map(({ parameterId, value }) => [parameterId, value]))
  ));
  assert.notDeepEqual(novice, experienced);
  assert.equal(JSON.stringify(fixture.automaticScenarios).includes("questionnaire"), false);
});

test("#268 guidance separa calibração, geração focal, inspeção e demais fases", () => {
  const planning = courseAuthoringGuidanceForCall("consultar_configuracao");
  const materialization = courseAuthoringGuidanceForCall("preparar_materializacao");
  const inspection = courseAuthoringGuidanceForCall("consultar_observacoes");
  const sources = courseAuthoringGuidanceForCall("consultar_fontes");
  const planningText = planning.instructions.join(" ");
  const generationText = materialization.instructions.join(" ");
  const inspectionText = inspection.instructions.join(" ");
  const sourcesText = sources.instructions.join(" ");

  assert.match(planningText, /público.*pré-requisitos.*objetivo.*Fontes.*restrições.*intenção/iu);
  assert.match(planningText, /Calibre automaticamente/iu);
  assert.match(planningText, /não recite o catálogo.*questionário/iu);
  assert.match(planningText, /uma pergunta por vez/iu);
  assert.match(planningText, /quatro parâmetros pedagógicos/iu);
  assert.match(planningText, /footprint.*tamanho de parágrafo.*títulos.*estilo/iu);
  assert.match(planningText, /orientação de Autoria já existente.*menor escopo útil/iu);
  assert.match(planningText, /materialização sela a revisão aplicável/iu);
  assert.match(planningText, /calibração automática não substitui condição explícita/iu);
  assert.match(planningText, /progressão ou representação.*diferença educacional concreta/iu);
  assert.match(planningText, /nunca para completar um catálogo preventivo/iu);

  assert.match(generationText, /somente a configuração efetiva pertinente/iu);
  assert.match(generationText, /teto governa suas introduções/iu);
  assert.match(generationText, /mínimo e dimensões de variação.*apenas a prática/iu);
  assert.match(generationText, /teto menor distribui o mesmo inventário por mais StudyUnits/iu);
  assert.match(generationText, /mínimo de prática muda a quantidade real/iu);
  assert.match(generationText, /dimensões requeridas mudam a variação.*operação-alvo/iu);
  assert.match(generationText, /Editorial organiza a apresentação, nunca elimina/iu);
  assert.match(generationText, /quando faltar espaço, crie mais StudyUnits/iu);
  assert.match(inspectionText, /escopo de sua Microssequência/iu);
  assert.match(inspectionText, /valor efetivo.*aplicação registrada/iu);
  assert.doesNotMatch(inspectionText, /\brun\b|\bpayload\b/iu);
  assert.doesNotMatch(
    sourcesText,
    /quatro parâmetros pedagógicos|Calibre automaticamente|mínimo de prática|catálogo preventivo/iu
  );
  assert.equal(courseAuthoringGuidanceForCall("tarefa_inexistente"), null);
});

test("#268 condições explícitas preservam origem, inventário e diferenças comparáveis", () => {
  const { invariantAnalysisUnitIds, conditions } = fixture.explicitComparison;
  assert.deepEqual(conditions.map(({ id }) => id), ["ceiling_one", "ceiling_two"]);
  for (const condition of conditions) {
    assert.equal(condition.origin, "research_condition");
    assert.deepEqual(condition.introducedByStudyUnit.flat(), invariantAnalysisUnitIds);
    assert.equal(new Set(condition.introducedByStudyUnit.flat()).size, 4);
    assert.deepEqual(Object.keys(condition.parameters), PARAMETER_IDS);
    for (const [parameterId, value] of Object.entries(condition.parameters)) {
      const command = normalizeCourseDesignCommand({
        type: "set_parameter",
        scope: { kind: "didactic_microsequence", ref: MICROSEQUENCE_ID },
        parameterId,
        value,
        origin: condition.origin,
        reason: `Condição ${condition.id} fixada antes da produção.`
      });
      assert.equal(command.origin, "research_condition");
      assert.deepEqual(command.value, value);
    }
  }

  const [ceilingOne, ceilingTwo] = conditions;
  assert.deepEqual(
    Object.fromEntries(Object.entries(ceilingOne.parameters).filter(([id]) => (
      id !== "new_analysis_unit_ceiling_per_expository_study_unit"
    ))),
    Object.fromEntries(Object.entries(ceilingTwo.parameters).filter(([id]) => (
      id !== "new_analysis_unit_ceiling_per_expository_study_unit"
    )))
  );
  assert.equal(ceilingOne.parameters.new_analysis_unit_ceiling_per_expository_study_unit, 1);
  assert.equal(ceilingTwo.parameters.new_analysis_unit_ceiling_per_expository_study_unit, 2);

  const changes = conditions.flatMap((condition, conditionIndex) => (
    Object.entries(condition.parameters).map(([parameterId, value], parameterIndex) => ({
      changeId: String(conditionIndex * PARAMETER_IDS.length + parameterIndex + 1),
      action: "set",
      parameterId,
      scope: { kind: "didactic_microsequence", ref: condition.id },
      value,
      origin: condition.origin,
      reason: `Condição ${condition.id}.`
    }))
  ));
  for (const condition of conditions) {
    const resolved = resolveCourseDesignParameters(changes, [
      { kind: "course", ref: COURSE_ID },
      { kind: "didactic_microsequence", ref: condition.id }
    ]);
    assert.equal(resolved.every(({ effectiveAssignment }) => (
      effectiveAssignment.origin === "research_condition"
    )), true);
  }
});

test("#268 editorial usa guidance escopada e nunca vira quinto parâmetro", () => {
  assert.equal(
    fixture.editorialDimensions.some((id) => PARAMETER_IDS.includes(id)),
    false
  );
  const { editorialComparison } = fixture;
  assert.deepEqual(
    editorialComparison.invariantAnalysisUnitIds,
    fixture.explicitComparison.invariantAnalysisUnitIds
  );
  assert.equal(
    editorialComparison.invariantRule,
    "editorial_changes_presentation_never_semantic_inventory_or_required_coverage"
  );
  assert.ok(
    editorialComparison.variants[0].expectedStudyUnitCount >
      editorialComparison.variants[1].expectedStudyUnitCount
  );
  for (const variant of editorialComparison.variants) {
    assert.deepEqual(Object.keys(variant.guidance), fixture.editorialDimensions);
    const command = normalizeCourseDesignCommand({
      type: "set_guidance",
      scope: { kind: "didactic_microsequence", ref: MICROSEQUENCE_ID },
      guidance: Object.entries(variant.guidance)
        .map(([dimension, value]) => `${dimension}: ${value}`)
        .join("; "),
      origin: "author",
      reason: `Condição editorial ${variant.id}.`
    });
    assert.equal(command.type, "set_guidance");
    assert.equal(command.origin, "author");
  }
  assert.throws(() => normalizeCourseDesignCommand({
    type: "set_parameter",
    scope: { kind: "didactic_microsequence", ref: MICROSEQUENCE_ID },
    parameterId: fixture.editorialDimensions[0],
    value: 2,
    origin: "author",
    reason: "Não deve entrar no catálogo pedagógico."
  }), /não pertence ao catálogo/iu);
});

test("#268 teto e formas mudam distribuição e desenvolvimento sem mudar inventário", () => {
  const { invariantAnalysisUnitIds, conditions } = fixture.explicitComparison;
  for (const condition of conditions) {
    const context = designContext({
      analysisUnitIds: invariantAnalysisUnitIds,
      parameters: parameterMap(condition.parameters)
    });
    const audit = auditDesignApplication(context, expositoryApplication(condition), {
      contextHash: CONTEXT_HASH
    });
    assert.deepEqual(audit.issues, []);
    assert.deepEqual(audit.summary.introducedInstructionalAnalysisUnitIds, (
      invariantAnalysisUnitIds
    ));
  }
  assert.equal(conditions[0].introducedByStudyUnit.length, 4);
  assert.equal(conditions[1].introducedByStudyUnit.length, 2);

  const analysisUnitId = invariantAnalysisUnitIds[0];
  const formsContext = designContext({
    analysisUnitIds: [analysisUnitId],
    parameters: parameterMap({
      new_analysis_unit_ceiling_per_expository_study_unit: 1,
      required_explanation_forms: ["plain_definition", "mechanism"]
    })
  });
  const missingMechanism = {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE_ID,
    studyUnits: [{
      studyUnitId: "definition-only",
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: [analysisUnitId],
      explanationApplications: [explanation(analysisUnitId, ["plain_definition"])],
      practiceApplications: [],
      componentRefs: []
    }]
  };
  assert.ok(auditDesignApplication(formsContext, missingMechanism, {
    contextHash: CONTEXT_HASH
  }).issues.includes(`required_explanation_form_missing:${analysisUnitId}:mechanism`));
  missingMechanism.studyUnits.push({
    studyUnitId: "mechanism-continuation",
    mode: "expository",
    introducedInstructionalAnalysisUnitIds: [],
    explanationApplications: [explanation(analysisUnitId, ["mechanism"])],
    practiceApplications: [],
    componentRefs: []
  });
  assert.deepEqual(auditDesignApplication(formsContext, missingMechanism, {
    contextHash: CONTEXT_HASH
  }).issues, []);
});

test("#268 mínimo e dimensões mudam prática efetiva preservando a operação-alvo", () => {
  const analysisUnitId = fixture.explicitComparison.invariantAnalysisUnitIds[0];
  const parametersFor = (minimum, dimensions) => parameterMap({
    new_analysis_unit_ceiling_per_expository_study_unit: 1,
    required_explanation_forms: ["plain_definition"],
    minimum_distinct_practice_opportunities_per_evidence_requirement: minimum,
    required_practice_variation_dimensions: dimensions
  });
  const contextTwo = designContext({
    analysisUnitIds: [analysisUnitId],
    parameters: parametersFor(2, ["case_or_data"]),
    withEvidence: true
  });
  const twoOpportunities = practiceApplication(2);
  assert.deepEqual(auditDesignApplication(contextTwo, twoOpportunities, {
    contextHash: CONTEXT_HASH
  }).issues, []);

  const contextThree = designContext({
    analysisUnitIds: [analysisUnitId],
    parameters: parametersFor(3, ["case_or_data"]),
    withEvidence: true
  });
  assert.ok(auditDesignApplication(contextThree, twoOpportunities, {
    contextHash: CONTEXT_HASH
  }).issues.includes(`minimum_practice_opportunities_not_met:${EVIDENCE_ID}`));
  const threeOpportunities = practiceApplication(3);
  assert.deepEqual(auditDesignApplication(contextThree, threeOpportunities, {
    contextHash: CONTEXT_HASH
  }).issues, []);

  const variedContext = designContext({
    analysisUnitIds: [analysisUnitId],
    parameters: parametersFor(3, ["case_or_data", "support_level"]),
    withEvidence: true
  });
  assert.ok(auditDesignApplication(variedContext, threeOpportunities, {
    contextHash: CONTEXT_HASH
  }).issues.includes(`required_practice_variation_missing:${EVIDENCE_ID}:support_level`));
  const variedOpportunities = practiceApplication(3, ["case_or_data", "support_level"]);
  const variedAudit = auditDesignApplication(variedContext, variedOpportunities, {
    contextHash: CONTEXT_HASH
  });
  assert.deepEqual(variedAudit.issues, []);
  assert.equal(new Set(variedOpportunities.studyUnits.slice(1).map((unit) => (
    unit.practiceApplications[0].invariantTaskOperation
  ))).size, 1);
});

test("#268 MCP, Actions e OpenAPI preservam a configuração pedagógica unificada", () => {
  const mcpSchema = COURSE_HUMAN_TASKS.find(({ name }) => name === "ajustar_configuracao")
    .inputSchema;
  const actionTools = projectHumanAuthoringTasksForActions(COURSE_HUMAN_TASKS);
  const actionSchema = actionTools.find(({ name }) => name === "ajustar_configuracao").inputSchema;
  const validateMcp = validator(mcpSchema);
  const validateAction = validator(actionSchema);
  const resolved = Object.fromEntries(
    fixture.automaticScenarios[0].resolvedParameters.map(({ parameterId, value }) => [
      parameterId,
      value
    ])
  );
  const sample = {
    curso: "Redes para iniciantes",
    microssequencia: MICROSEQUENCE_ID,
    parametrosPedagogicos: {
      tetoNovasUnidadesDeAnalise:
        resolved.new_analysis_unit_ceiling_per_expository_study_unit,
      formasDeExplicacao: resolved.required_explanation_forms,
      minimoDePraticasPorRequisito:
        resolved.minimum_distinct_practice_opportunities_per_evidence_requirement,
      dimensoesDeVariacaoDaPratica: resolved.required_practice_variation_dimensions
    },
    direcaoEditorial: "Parágrafos diretos; criar mais Units quando necessário."
  };
  assert.equal(validateMcp(sample), true, JSON.stringify(validateMcp.errors));
  assert.equal(validateAction(sample), true, JSON.stringify(validateAction.errors));
  assert.ok(openApi.paths["/consultar_configuracao"]);
  assert.ok(openApi.paths["/ajustar_configuracao"]);
  assert.doesNotMatch(
    JSON.stringify(actionSchema),
    /"(?:mode|origin|parameterId|requestId)"/u
  );
  for (const editorialDimension of fixture.editorialDimensions) {
    assert.equal(openApiText.includes(JSON.stringify(editorialDimension)), false);
  }
});
