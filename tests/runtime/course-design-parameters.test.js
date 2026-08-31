import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_COMPONENT_CATALOG_VERSION,
  COURSE_DESIGN_CONTEXT_CONTRACT,
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  CourseDesignParametersError,
  auditDesignApplication,
  normalizeCourseAuthoringGuidanceInterpretation,
  normalizeCourseComponentPolicy,
  normalizeCourseDesignApplication,
  normalizeCourseDesignChange,
  normalizeCourseDesignCommand,
  resolveCourseDesignParameters
} from "../../src/domain/courseDesignParameters.js";
import {
  auditDesignApplication as auditEdgeApplication,
  normalizeCourseDesignCommand as normalizeEdgeCommand
} from "../../supabase/functions/_shared/aralearn/runtime/domain/courseDesignParameters.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const LESSON = "lesson-a";
const MICROSEQUENCE = "micro-a";
const ANALYSIS_IDS = Array.from(
  { length: 7 },
  (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);
const EVIDENCE = "30000000-0000-4000-8000-000000000001";
const SECOND_ANALYSIS = "20000000-0000-4000-8000-000000000008";
const SECOND_EVIDENCE = "30000000-0000-4000-8000-000000000002";
const CONTEXT_HASH = "a".repeat(64);
const REQUIRED_FORMS = [
  "plain_definition",
  "concrete_example",
  "mechanism",
  "contrast"
];

function policy() {
  return {
    catalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
    availability: "all",
    allowedRefs: [],
    excludedRefs: [],
    preferredRefs: []
  };
}

function context({ statement = "Relação factual.", secondTarget = false } = {}) {
  const analysisIds = secondTarget ? [...ANALYSIS_IDS, SECOND_ANALYSIS] : ANALYSIS_IDS;
  const evidenceIds = secondTarget ? [EVIDENCE, SECOND_EVIDENCE] : [EVIDENCE];
  return {
    contract: COURSE_DESIGN_CONTEXT_CONTRACT,
    courseId: COURSE,
    courseRevision: 8,
    authoringPartId: "40000000-0000-4000-8000-000000000001",
    componentCatalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
    instructionalAnalysisUnits: analysisIds.map((id, position) => ({
      id,
      position,
      statement: `${statement} ${position}`,
      version: 1
    })),
    evidenceRequirements: evidenceIds.map((id, position) => ({
      id,
      position,
      statement: `${statement} evidência ${position}`,
      version: 1
    })),
    guidanceRevisions: [],
    targets: [{
      didacticMicrosequenceId: MICROSEQUENCE,
      instructionalAnalysisUnitIds: [...ANALYSIS_IDS],
      evidenceRequirementIds: [EVIDENCE],
      parameters: COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
        parameterId: definition.id,
        value: structuredClone(definition.defaultValue),
        origin: "system_default",
        reason: "Hipótese padrão de produto.",
        sourceScope: null
      })),
      componentPolicy: {
        changeId: null,
        policy: policy(),
        origin: "system_default",
        reason: "Todos os componentes correntes permanecem disponíveis.",
        sourceScope: null
      }
    }, ...(secondTarget ? [{
      didacticMicrosequenceId: "micro-b",
      instructionalAnalysisUnitIds: [SECOND_ANALYSIS],
      evidenceRequirementIds: [SECOND_EVIDENCE],
      parameters: COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
        parameterId: definition.id,
        value: structuredClone(definition.defaultValue),
        origin: "system_default",
        reason: "Hipótese padrão de produto.",
        sourceScope: null
      })),
      componentPolicy: {
        changeId: null,
        policy: policy(),
        origin: "system_default",
        reason: "Todos os componentes correntes permanecem disponíveis.",
        sourceScope: null
      }
    }] : [])]
  };
}

function explanation(instructionalAnalysisUnitId, developedForms = REQUIRED_FORMS) {
  return {
    instructionalAnalysisUnitId,
    developedForms,
    notApplicable: []
  };
}

function practice(opportunityId) {
  return {
    evidenceRequirementId: EVIDENCE,
    opportunityId,
    invariantTaskOperation: "explicar a relação entre configuração DNS e concessão DHCP",
    variedDimensions: ["case_or_data"]
  };
}

function repairedApplication() {
  const expository = [
    ANALYSIS_IDS.slice(0, 2),
    ANALYSIS_IDS.slice(2, 4),
    ANALYSIS_IDS.slice(4, 6),
    ANALYSIS_IDS.slice(6)
  ].map((ids, index) => ({
    studyUnitId: `unit-expository-${index + 1}`,
    mode: "expository",
    introducedInstructionalAnalysisUnitIds: ids,
    explanationApplications: ids.map((id) => explanation(id)),
    practiceApplications: [],
    componentRefs: []
  }));
  return {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE,
    studyUnits: [
      ...expository,
      {
        studyUnitId: "unit-practice-1",
        mode: "practice",
        introducedInstructionalAnalysisUnitIds: [],
        explanationApplications: [],
        practiceApplications: [practice("dns-case-a")],
        componentRefs: []
      },
      {
        studyUnitId: "unit-practice-2",
        mode: "practice",
        introducedInstructionalAnalysisUnitIds: [],
        explanationApplications: [],
        practiceApplications: [practice("dns-case-b")],
        componentRefs: []
      }
    ]
  };
}

function analysisOnlyContext(ids, { ceiling = 2 } = {}) {
  const value = context();
  value.instructionalAnalysisUnits = value.instructionalAnalysisUnits.filter(({ id }) => (
    ids.includes(id)
  ));
  value.evidenceRequirements = [];
  value.targets[0].instructionalAnalysisUnitIds = [...ids];
  value.targets[0].evidenceRequirementIds = [];
  value.targets[0].parameters = value.targets[0].parameters.map((parameter) => (
    parameter.parameterId === "new_analysis_unit_ceiling_per_expository_study_unit"
      ? { ...parameter, value: ceiling }
      : parameter
  ));
  return value;
}

function decomposedExplanationApplication({ unitCount, analysisId = ANALYSIS_IDS[0] }) {
  const formsByUnit = unitCount === 2
    ? [REQUIRED_FORMS.slice(0, 2), REQUIRED_FORMS.slice(2)]
    : [[REQUIRED_FORMS[0]], REQUIRED_FORMS.slice(1, 3), REQUIRED_FORMS.slice(3)];
  return {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE,
    studyUnits: formsByUnit.map((developedForms, index) => ({
      studyUnitId: `unit-analysis-split-${unitCount}-${index + 1}`,
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: index === 0 ? [analysisId] : [],
      explanationApplications: [explanation(analysisId, developedForms)],
      practiceApplications: [],
      componentRefs: []
    }))
  };
}

test("catálogo v1 contém somente quatro hipóteses operacionais sem proxy de caracteres", () => {
  assert.deepEqual(
    COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id, defaultStatus }) => [id, defaultStatus]),
    [
      ["new_analysis_unit_ceiling_per_expository_study_unit", "product_hypothesis"],
      ["required_explanation_forms", "product_hypothesis"],
      ["minimum_distinct_practice_opportunities_per_evidence_requirement", "product_hypothesis"],
      ["required_practice_variation_dimensions", "product_hypothesis"]
    ]
  );
  const catalogText = JSON.stringify(COURSE_DESIGN_PARAMETER_DEFINITIONS);
  assert.ok(COURSE_DESIGN_PARAMETER_DEFINITIONS.every(({ valueSchema }) => (
    ["integer", "set"].includes(valueSchema.type)
  )));
  assert.match(catalogText, /não mede|não demonstra|não prova/iu);
});

test("comandos são fechados e preservam paridade exata com o mirror Edge", () => {
  const commands = [
    {
      type: "set_target_plan_items",
      scope: { kind: "didactic_microsequence", ref: MICROSEQUENCE },
      instructionalAnalysisUnitIds: ANALYSIS_IDS.slice(0, 3),
      evidenceRequirementIds: [EVIDENCE]
    },
    {
      type: "set_parameter",
      scope: { kind: "lesson", ref: LESSON },
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
      value: 3,
      origin: "research_condition",
      reason: "Condição registrada antes da materialização."
    },
    {
      type: "set_component_policy",
      scope: { kind: "didactic_microsequence", ref: MICROSEQUENCE },
      policy: {
        catalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
        availability: "allow_only",
        allowedRefs: ["aralearn.resource.paragraph@1.0.0"],
        excludedRefs: [],
        preferredRefs: ["aralearn.resource.paragraph@1.0.0"]
      },
      origin: "author",
      reason: "Esta microssequência usa explicação textual."
    },
    {
      type: "interpret_guidance",
      guidanceRevisionId: "50000000-0000-4000-8000-000000000001",
      interpretation: {
        summary: "Desenvolver relações antes de pedir recuperação.",
        directives: [{ kind: "require", statement: "Explicitar a relação DNS–DHCP." }],
        divergences: [],
        questions: ["Qual conhecimento prévio pode ser assumido?"]
      }
    }
  ];
  for (const command of commands) {
    assert.deepEqual(normalizeEdgeCommand(command), normalizeCourseDesignCommand(command));
  }
  assert.throws(
    () => normalizeCourseDesignCommand({ ...commands[0], locked: true }),
    (error) => error instanceof CourseDesignParametersError &&
      error.code === "invalid_course_design_command"
  );
  assert.throws(
    () => normalizeCourseDesignCommand({
      ...commands[0],
      scope: { kind: "lesson", ref: LESSON }
    }),
    (error) => error instanceof CourseDesignParametersError &&
      error.code === "invalid_course_design_scope"
  );
});

test("resolução dá prioridade à atribuição explícita mais próxima e clear restaura herança", () => {
  const path = [
    { kind: "course", ref: COURSE },
    { kind: "module", ref: "module-a" },
    { kind: "lesson", ref: LESSON },
    { kind: "didactic_microsequence", ref: MICROSEQUENCE }
  ];
  const parameterId = "new_analysis_unit_ceiling_per_expository_study_unit";
  const changes = [
    { changeId: "1", action: "set", parameterId, scope: path[0], value: 4, origin: "author", reason: "Curso." },
    { changeId: "2", action: "set", parameterId, scope: path[2], value: 3, origin: "research_condition", reason: "Lição." },
    { changeId: "3", action: "set", parameterId, scope: path[3], value: 6, origin: "automatic", reason: "Sugestão automática." }
  ];
  let resolved = resolveCourseDesignParameters(changes, path)[0];
  assert.equal(resolved.effectiveAssignment.value, 3);
  assert.deepEqual(resolved.effectiveAssignment.sourceScope, path[2]);
  assert.equal(resolved.localAssignment.value, 6);

  changes.push({ changeId: "4", action: "clear", parameterId, scope: path[2] });
  resolved = resolveCourseDesignParameters(changes, path)[0];
  assert.equal(resolved.effectiveAssignment.value, 4);
  assert.deepEqual(resolved.effectiveAssignment.sourceScope, path[0]);
});

test("política completa conserva preferência, disjunção e catálogo corrente", () => {
  assert.deepEqual(normalizeCourseComponentPolicy({
    catalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
    availability: "allow_only",
    allowedRefs: ["aralearn.resource.paragraph@1.0.0"],
    excludedRefs: [],
    preferredRefs: ["aralearn.resource.paragraph@1.0.0"]
  }), {
    catalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
    availability: "allow_only",
    allowedRefs: ["aralearn.resource.paragraph@1.0.0"],
    excludedRefs: [],
    preferredRefs: ["aralearn.resource.paragraph@1.0.0"]
  });
  assert.throws(() => normalizeCourseComponentPolicy({
    catalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
    availability: "allow_only",
    allowedRefs: ["aralearn.resource.paragraph@1.0.0"],
    excludedRefs: ["aralearn.resource.paragraph@1.0.0"],
    preferredRefs: []
  }), /incoerentes/iu);
});

test("interpretação da guidance é estruturada, limitada e não contém raciocínio privado", () => {
  const interpretation = normalizeCourseAuthoringGuidanceInterpretation({
    summary: "Aplicar a orientação sem apagar divergências.",
    directives: [
      { kind: "require", statement: "Desenvolver o mecanismo." },
      { kind: "avoid", statement: "Tratar comprimento como densidade." }
    ],
    divergences: ["O contraste pode exigir outra Unidade."],
    questions: ["Qual exemplo concreto é pertinente?"]
  });
  assert.equal(interpretation.directives.length, 2);
  assert.throws(() => normalizeCourseAuthoringGuidanceInterpretation({
    ...interpretation,
    chainOfThought: "não permitido"
  }), /campo desconhecido/iu);
});

test("#89 detecta densidade estruturada, cobertura e formas sem usar comprimento textual", () => {
  const dense = {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE,
    studyUnits: [{
      studyUnitId: "unit-dense",
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: ANALYSIS_IDS,
      explanationApplications: ANALYSIS_IDS.map((id) => explanation(id, ["plain_definition"])),
      practiceApplications: [],
      componentRefs: []
    }]
  };
  const auditOptions = { contextHash: CONTEXT_HASH };
  const shortContext = context({ statement: "Curto." });
  const longContext = context({ statement: "Descrição semântica ".repeat(80) });
  const denseAudit = auditDesignApplication(shortContext, dense, auditOptions);
  assert.equal(denseAudit.valid, false);
  assert.ok(denseAudit.issues.some((issue) => issue.startsWith("new_analysis_unit_ceiling_exceeded")));
  assert.ok(denseAudit.issues.some((issue) => issue.startsWith("required_explanation_form_missing")));

  const repaired = repairedApplication();
  assert.deepEqual(
    auditDesignApplication(longContext, dense, auditOptions),
    denseAudit
  );
  assert.equal(auditDesignApplication(shortContext, repaired, auditOptions).valid, true);
  assert.deepEqual(
    auditDesignApplication(longContext, repaired, auditOptions),
    auditDesignApplication(shortContext, repaired, auditOptions)
  );
  assert.deepEqual(
    auditEdgeApplication(context(), repaired, auditOptions),
    auditDesignApplication(context(), repaired, auditOptions)
  );
  assert.deepEqual(
    Object.keys(context().instructionalAnalysisUnits[0]),
    ["id", "position", "statement", "version"]
  );
  assert.equal(auditDesignApplication(context(), dense, auditOptions).valid, false);

  assert.ok(
    auditDesignApplication(context(), repaired, { contextHash: "b".repeat(64) }).issues.includes(
      "context_hash_mismatch"
    )
  );
  assert.throws(
    () => auditDesignApplication(context(), repaired),
    /contexto de desenho para auditoria é inválido/iu
  );

  const splitWithoutForms = repairedApplication();
  splitWithoutForms.studyUnits[0].explanationApplications[0].developedForms = ["plain_definition"];
  assert.equal(auditDesignApplication(context(), splitWithoutForms, auditOptions).valid, false);

  const missingCoverage = repairedApplication();
  missingCoverage.studyUnits[3].introducedInstructionalAnalysisUnitIds = [];
  missingCoverage.studyUnits[3].explanationApplications = [];
  assert.ok(
    auditDesignApplication(context(), missingCoverage, auditOptions).issues.includes(
      `instructional_analysis_unit_not_covered:${ANALYSIS_IDS[6]}`
    )
  );
});

test("#235 distribui uma AnalysisUnit por duas ou três StudyUnits sem contar continuação como novidade", () => {
  const designContext = analysisOnlyContext([ANALYSIS_IDS[0]], { ceiling: 1 });
  const twoUnits = auditDesignApplication(
    designContext,
    decomposedExplanationApplication({ unitCount: 2 }),
    { contextHash: CONTEXT_HASH }
  );
  const threeUnits = auditDesignApplication(
    designContext,
    decomposedExplanationApplication({ unitCount: 3 }),
    { contextHash: CONTEXT_HASH }
  );

  assert.deepEqual(twoUnits.issues, []);
  assert.deepEqual(threeUnits.issues, []);
  assert.equal(twoUnits.summary.introducedInstructionalAnalysisUnitIds.length, 1);
  assert.equal(threeUnits.summary.introducedInstructionalAnalysisUnitIds.length, 1);
});

test("#235 aceita duas AnalysisUnits em uma StudyUnit dentro do teto e acusa o teto real", () => {
  const ids = ANALYSIS_IDS.slice(0, 2);
  const application = {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: MICROSEQUENCE,
    studyUnits: [{
      studyUnitId: "unit-two-analysis",
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: ids,
      explanationApplications: ids.map((id) => explanation(id)),
      practiceApplications: [],
      componentRefs: []
    }]
  };

  assert.equal(auditDesignApplication(
    analysisOnlyContext(ids, { ceiling: 2 }),
    application,
    { contextHash: CONTEXT_HASH }
  ).valid, true);
  assert.ok(auditDesignApplication(
    analysisOnlyContext(ids, { ceiling: 1 }),
    application,
    { contextHash: CONTEXT_HASH }
  ).issues.includes("new_analysis_unit_ceiling_exceeded:unit-two-analysis"));
});

test("#235 mantém introdução única e torna continuação antes da introdução acionável", () => {
  const application = decomposedExplanationApplication({ unitCount: 2 });
  application.studyUnits[0].introducedInstructionalAnalysisUnitIds = [];
  application.studyUnits[1].introducedInstructionalAnalysisUnitIds = [ANALYSIS_IDS[0]];

  assert.ok(auditDesignApplication(
    analysisOnlyContext([ANALYSIS_IDS[0]]),
    application,
    { contextHash: CONTEXT_HASH }
  ).issues.includes(`explanation_before_introduction:${ANALYSIS_IDS[0]}:unit-analysis-split-2-1`));
});

test("#235 rejeita continuação que não identifica contribuição local", () => {
  const application = decomposedExplanationApplication({ unitCount: 2 });
  application.studyUnits[1].explanationApplications[0].developedForms = [];

  assert.ok(auditDesignApplication(
    analysisOnlyContext([ANALYSIS_IDS[0]]),
    application,
    { contextHash: CONTEXT_HASH }
  ).issues.includes(
    `explanation_without_local_contribution:${ANALYSIS_IDS[0]}:unit-analysis-split-2-2`
  ));
});

test("auditoria separa dois alvos e exige somente o subconjunto atribuído a cada um", () => {
  const sharedContext = context({ secondTarget: true });
  assert.equal(
    auditDesignApplication(sharedContext, repairedApplication(), { contextHash: CONTEXT_HASH }).valid,
    true
  );
  const secondApplication = {
    contextHash: CONTEXT_HASH,
    didacticMicrosequenceId: "micro-b",
    studyUnits: [{
      studyUnitId: "unit-b-expository",
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: [SECOND_ANALYSIS],
      explanationApplications: [explanation(SECOND_ANALYSIS)],
      practiceApplications: [],
      componentRefs: []
    }, {
      studyUnitId: "unit-b-practice-1",
      mode: "practice",
      introducedInstructionalAnalysisUnitIds: [],
      explanationApplications: [],
      practiceApplications: [{ ...practice("b-case-1"), evidenceRequirementId: SECOND_EVIDENCE }],
      componentRefs: []
    }, {
      studyUnitId: "unit-b-practice-2",
      mode: "practice",
      introducedInstructionalAnalysisUnitIds: [],
      explanationApplications: [],
      practiceApplications: [{ ...practice("b-case-2"), evidenceRequirementId: SECOND_EVIDENCE }],
      componentRefs: []
    }]
  };
  assert.equal(
    auditDesignApplication(sharedContext, secondApplication, { contextHash: CONTEXT_HASH }).valid,
    true
  );
  secondApplication.studyUnits[0].introducedInstructionalAnalysisUnitIds = [];
  secondApplication.studyUnits[0].explanationApplications = [];
  assert.ok(
    auditDesignApplication(sharedContext, secondApplication, { contextHash: CONTEXT_HASH })
      .issues.includes(`instructional_analysis_unit_not_covered:${SECOND_ANALYSIS}`)
  );
});

test("auditoria exige operação-alvo invariável em oportunidades distintas", () => {
  const application = repairedApplication();
  application.studyUnits.at(-1).practiceApplications[0].invariantTaskOperation =
    "escolher uma máscara de sub-rede";
  assert.ok(
    auditDesignApplication(context(), application, { contextHash: CONTEXT_HASH }).issues.includes(
      `invariant_task_operation_changed:${EVIDENCE}`
    )
  );
});

test("designApplication é fechado, limitado e não aceita autorização declarativa extra", () => {
  const normalized = normalizeCourseDesignApplication(repairedApplication());
  assert.equal(normalized.studyUnits.length, 6);
  assert.throws(
    () => normalizeCourseDesignApplication({ ...repairedApplication(), policySatisfied: true }),
    /campo desconhecido/iu
  );
});

test("change DTO conserva identities bigint positivas como texto", () => {
  const valid = {
    contract: "aralearn.course-design-change.v1",
    courseId: COURSE,
    courseRevision: 9,
    requestId: "design-change-001",
    idempotent: false,
    changed: true,
    change: {
      changeId: "9223372036854775807",
      type: "set_parameter",
      scope: { kind: "course", ref: COURSE }
    }
  };
  assert.deepEqual(normalizeCourseDesignChange(valid), valid);
  for (const changeId of ["0", "01", "-1", "9223372036854775808"]) {
    assert.throws(
      () => normalizeCourseDesignChange({
        ...valid,
        change: { ...valid.change, changeId }
      }),
      /identidade decimal/iu
    );
  }
  assert.throws(
    () => normalizeCourseDesignChange({ ...valid, requestId: "short" }),
    /requisição é inválida/iu
  );
  assert.throws(
    () => normalizeCourseDesignChange({
      ...valid,
      change: {
        ...valid.change,
        type: "set_target_plan_items",
        scope: { kind: "lesson", ref: LESSON }
      }
    }),
    /não aponta para uma microssequência/iu
  );
});
