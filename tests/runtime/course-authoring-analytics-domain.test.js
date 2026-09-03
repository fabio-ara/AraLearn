import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import * as analyticsDomain from "../../src/domain/courseAuthoringAnalytics.js";

const {
  COURSE_AUTHORING_ANALYTICS_CONTRACT,
  COURSE_AUTHORING_ANALYTICS_PARAMETER_IDS,
  COURSE_AUTHORING_ANALYTICS_SCOPE_KINDS,
  assembleCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery
} = analyticsDomain;

const COURSE_ID = "10000000-0000-4000-8000-000000000001";

const PARAMETER_ROWS = Object.freeze([{
  parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
  label: "Teto de novas AnalysisUnits",
  valueKind: "integer",
  effectiveValues: [{
    value: 2,
    origin: "author",
    sourceScopeKind: "course",
    studyUnitCount: 2
  }]
}, {
  parameterId: "required_explanation_forms",
  label: "Formas de explicação",
  valueKind: "string_list",
  effectiveValues: [{
    value: ["plain_definition", "mechanism"],
    origin: "automatic",
    sourceScopeKind: "didactic_microsequence",
    studyUnitCount: 2
  }]
}, {
  parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement",
  label: "Mínimo de práticas",
  valueKind: "integer",
  effectiveValues: [{
    value: 2,
    origin: "author",
    sourceScopeKind: "course",
    studyUnitCount: 2
  }]
}, {
  parameterId: "required_practice_variation_dimensions",
  label: "Dimensões de variação",
  valueKind: "string_list",
  effectiveValues: [{
    value: ["case_or_data", "context"],
    origin: "author",
    sourceScopeKind: "course",
    studyUnitCount: 2
  }]
}, {
  parameterId: "authoring_chat_response_word_target",
  label: "Alvo de palavras por resposta de autoria",
  valueKind: "integer",
  effectiveValues: [{
    value: 90,
    origin: "automatic",
    sourceScopeKind: "didactic_microsequence",
    studyUnitCount: 2
  }]
}, {
  parameterId: "study_unit_content_word_target",
  label: "Alvo de palavras por unidade de estudo",
  valueKind: "integer",
  effectiveValues: [{
    value: 140,
    origin: "research_condition",
    sourceScopeKind: "course",
    studyUnitCount: 2
  }]
}]);

function snapshot({
  scope = { kind: "course", ref: null, label: "Curso de Redes" },
  studyUnits = [{
    studyUnitRef: "unit-definition",
    position: 1,
    title: "Definição e mecanismo",
    introducedCount: 2
  }, {
    studyUnitRef: "unit-condition",
    position: 2,
    title: "Condição de aplicação",
    introducedCount: 1
  }],
  ceiling = 2,
  deepLink = null
} = {}) {
  const parameters = structuredClone(PARAMETER_ROWS);
  parameters[0].effectiveValues[0].value = ceiling;
  parameters[0].effectiveValues[0].studyUnitCount = studyUnits.length;
  for (const parameter of parameters.slice(1)) {
    parameter.effectiveValues[0].studyUnitCount = studyUnits.length;
  }
  return {
    contract: COURSE_AUTHORING_ANALYTICS_CONTRACT,
    course: { id: COURSE_ID, revision: 9, title: "Curso de Redes" },
    scope: {
      selected: scope,
      options: [{ kind: "course", ref: null, label: "Curso de Redes" }, {
        kind: "authoring_part",
        ref: "20000000-0000-4000-8000-000000000002",
        label: "Parte 1 · Fundamentos"
      }, {
        kind: "didactic_microsequence",
        ref: "micro-dns",
        label: "DNS"
      }, {
        kind: "study_unit",
        ref: "unit-dns-definition",
        label: "Definição e mecanismo"
      }]
    },
    design: {
      studyUnitCount: studyUnits.length,
      parameters,
      editorialDirections: [{
        direction: "Parágrafos curtos e títulos informativos.",
        origin: "author",
        sourceScopeKind: "course",
        studyUnitCount: studyUnits.length
      }],
      analysisUnits: [{
        position: 1,
        statement: "DNS associa nomes a endereços.",
        introductionCount: 1,
        useCount: 2,
        revisitCount: 1
      }, {
        position: 2,
        statement: "A resolução consulta registros em sequência.",
        introductionCount: 1,
        useCount: 1,
        revisitCount: 0
      }, {
        position: 3,
        statement: "O cache condiciona uma nova consulta.",
        introductionCount: 1,
        useCount: 0,
        revisitCount: 0
      }],
      introductionsByStudyUnit: studyUnits,
      explanationForms: [{
        form: "plain_definition",
        studyUnitCount: Math.min(2, studyUnits.length),
        applicationCount: 3
      }, {
        form: "mechanism",
        studyUnitCount: 1,
        applicationCount: 1
      }],
      components: [{
        componentRef: "aralearn.resource.paragraph@1.0.0",
        studyUnitCount: studyUnits.length,
        instanceCount: studyUnits.length
      }, {
        componentRef: "aralearn.resource.sequence@1.0.0",
        studyUnitCount: 1,
        instanceCount: 1
      }],
      practiceByRequirement: [{
        position: 1,
        statement: "Resolver um nome e justificar a sequência.",
        opportunityCount: 2
      }],
      practiceVariationDimensions: [{
        dimension: "case_or_data",
        opportunityCount: 2
      }, {
        dimension: "context",
        opportunityCount: 1
      }],
      sourcesByRole: [{
        role: "technical_conceptual",
        sourceCount: 2,
        anchorCount: 3,
        studyUnitCount: studyUnits.length
      }],
      wordCountsByStudyUnit: studyUnits.map((_, index) => ({
        wordCount: 80 + index * 20,
        studyUnitCount: 1
      }))
    },
    authorship: {
      observations: { createdCount: 4, openCount: 1, resolvedCount: 2 },
      explicitParameterOverrideCount: 3,
      manuallyRevisedStudyUnitCount: 1,
      studyUnitsByOrigin: [{
        origin: "authoring_chat",
        createdCount: studyUnits.length,
        lastRevisedCount: 1
      }, {
        origin: "manual",
        createdCount: 0,
        lastRevisedCount: 1
      }]
    },
    missingData: ["Uma Observação retirada não é classificada como resolvida."],
    deepLink
  };
}

test("#273 query usa somente escopo corrente e remove datasets/cursor", () => {
  assert.deepEqual(normalizeCourseAuthoringAnalyticsQuery(), {
    scope: { kind: "course", ref: null }
  });
  assert.deepEqual(normalizeCourseAuthoringAnalyticsQuery({
    scope: { kind: "didactic_microsequence", ref: "micro-dns" }
  }), {
    scope: { kind: "didactic_microsequence", ref: "micro-dns" }
  });
  assert.deepEqual(COURSE_AUTHORING_ANALYTICS_SCOPE_KINDS, [
    "course", "authoring_part", "didactic_microsequence", "study_unit"
  ]);
  for (const legacy of [{ datasets: ["design"] }, { cursor: "opaque" }, {
    scope: { kind: "course", ref: COURSE_ID }
  }]) {
    assert.throws(() => normalizeCourseAuthoringAnalyticsQuery(legacy));
  }
});

test("#273 snapshot responde desenho e autoria somente com contagens observáveis", () => {
  const normalized = normalizeCourseAuthoringAnalyticsPage(snapshot(), {
    expectedCourseId: COURSE_ID,
    expectedQuery: { scope: { kind: "course", ref: null } }
  });
  assert.equal(normalized.design.studyUnitCount, 2);
  assert.deepEqual(normalized.design.parameters.map(({ parameterId }) => parameterId),
    COURSE_AUTHORING_ANALYTICS_PARAMETER_IDS);
  assert.equal(normalized.design.analysisUnits.length, 3);
  assert.deepEqual(
    normalized.design.analysisUnits.map(({ introductionCount, useCount, revisitCount }) => ({
      introductionCount,
      useCount,
      revisitCount
    })),
    [{ introductionCount: 1, useCount: 2, revisitCount: 1 },
      { introductionCount: 1, useCount: 1, revisitCount: 0 },
      { introductionCount: 1, useCount: 0, revisitCount: 0 }]
  );
  assert.deepEqual(normalized.design.introductionsByStudyUnit.map(({ introducedCount }) =>
    introducedCount), [2, 1]);
  assert.equal(normalized.design.explanationForms[0].applicationCount, 3);
  assert.equal(normalized.design.components[1].componentRef,
    "aralearn.resource.sequence@1.0.0");
  assert.equal(normalized.design.practiceByRequirement[0].opportunityCount, 2);
  assert.equal(normalized.design.practiceVariationDimensions[0].opportunityCount, 2);
  assert.equal(normalized.design.sourcesByRole[0].role, "technical_conceptual");
  const provenanceAsRole = snapshot();
  provenanceAsRole.design.sourcesByRole[0].role = "supported_by";
  assert.throws(
    () => normalizeCourseAuthoringAnalyticsPage(provenanceAsRole),
    /papel da Fonte não pertence ao catálogo/u
  );
  const legacyWithoutRole = snapshot();
  legacyWithoutRole.design.sourcesByRole[0].role = null;
  assert.equal(
    normalizeCourseAuthoringAnalyticsPage(legacyWithoutRole).design.sourcesByRole[0].role,
    null
  );
  assert.deepEqual(normalized.design.wordCountsByStudyUnit, [{
    wordCount: 80,
    studyUnitCount: 1
  }, {
    wordCount: 100,
    studyUnitCount: 1
  }]);
  assert.deepEqual(normalized.authorship.observations, {
    createdCount: 4,
    openCount: 1,
    resolvedCount: 2
  });
  assert.equal(normalized.authorship.explicitParameterOverrideCount, 3);
  assert.equal(normalized.authorship.manuallyRevisedStudyUnitCount, 1);
  assert.equal(normalized.authorship.studyUnitsByOrigin[0].lastRevisedCount, 1);
});

test("#273 teto 1 e 2 preservam o inventário e mudam somente a distribuição", () => {
  const ceilingTwo = normalizeCourseAuthoringAnalyticsPage(snapshot());
  const ceilingOne = normalizeCourseAuthoringAnalyticsPage(snapshot({
    ceiling: 1,
    studyUnits: [{
      studyUnitRef: "unit-definition",
      position: 1,
      title: "Definição",
      introducedCount: 1
    }, {
      studyUnitRef: "unit-mechanism",
      position: 1,
      title: "Mecanismo",
      introducedCount: 1
    }, {
      studyUnitRef: "unit-condition",
      position: 1,
      title: "Condição",
      introducedCount: 1
    }]
  }));
  assert.deepEqual(
    ceilingOne.design.analysisUnits.map(({ statement }) => statement),
    ceilingTwo.design.analysisUnits.map(({ statement }) => statement)
  );
  assert.deepEqual(ceilingTwo.design.introductionsByStudyUnit.map(({ introducedCount }) =>
    introducedCount), [2, 1]);
  assert.deepEqual(ceilingOne.design.introductionsByStudyUnit.map(({ introducedCount }) =>
    introducedCount), [1, 1, 1]);
  assert.equal(ceilingOne.design.studyUnitCount, 3);
  assert.equal(ceilingTwo.design.studyUnitCount, 2);
});

test("#273 overrides efetivos fecham por Unit e dados ausentes continuam explícitos", () => {
  const value = snapshot();
  value.design.parameters[0].effectiveValues = [{
    value: 1,
    origin: "author",
    sourceScopeKind: "study_unit",
    studyUnitCount: 1
  }, {
    value: 2,
    origin: "automatic",
    sourceScopeKind: "didactic_microsequence",
    studyUnitCount: 1
  }];
  const normalized = normalizeCourseAuthoringAnalyticsPage(value);
  assert.deepEqual(normalized.design.parameters[0].effectiveValues.map(({ value: entry }) => entry),
    [1, 2]);
  assert.deepEqual(
    normalized.design.parameters[0].effectiveValues.map(({ sourceScopeKind }) => sourceScopeKind),
    ["study_unit", "didactic_microsequence"]
  );
  assert.deepEqual(normalized.missingData,
    ["Uma Observação retirada não é classificada como resolvida."]);

  const overflow = snapshot();
  overflow.design.parameters[0].effectiveValues[0].studyUnitCount = 3;
  assert.throws(() => normalizeCourseAuthoringAnalyticsPage(overflow), /mais Units/u);

  const ceilingOnlyWhereApplicable = snapshot();
  ceilingOnlyWhereApplicable.design.parameters[0].effectiveValues[0].studyUnitCount = 1;
  ceilingOnlyWhereApplicable.missingData = [];
  assert.equal(
    normalizeCourseAuthoringAnalyticsPage(ceilingOnlyWhereApplicable)
      .design.parameters[0].effectiveValues[0].studyUnitCount,
    1
  );

  const silentlyMissing = snapshot();
  silentlyMissing.design.parameters[1].effectiveValues[0].studyUnitCount = 1;
  silentlyMissing.missingData = [];
  assert.throws(() => normalizeCourseAuthoringAnalyticsPage(silentlyMissing), /missingData/u);

  const incompleteWordDistribution = snapshot();
  incompleteWordDistribution.design.wordCountsByStudyUnit[0].studyUnitCount = 2;
  assert.throws(
    () => normalizeCourseAuthoringAnalyticsPage(incompleteWordDistribution),
    /distribuição de palavras não fecha/u
  );
});

test("valores iguais em escopos de origem distintos permanecem comparáveis", () => {
  const value = snapshot();
  value.design.parameters[0].effectiveValues = [{
    value: 2,
    origin: "automatic",
    sourceScopeKind: "course",
    studyUnitCount: 1
  }, {
    value: 2,
    origin: "automatic",
    sourceScopeKind: "didactic_microsequence",
    studyUnitCount: 1
  }];
  value.design.editorialDirections = [{
    direction: "Use títulos informativos.",
    origin: "automatic",
    sourceScopeKind: "course",
    studyUnitCount: 2
  }, {
    direction: "Use títulos informativos.",
    origin: "automatic",
    sourceScopeKind: "study_unit",
    studyUnitCount: 2
  }];

  const normalized = normalizeCourseAuthoringAnalyticsPage(value);
  assert.deepEqual(
    normalized.design.parameters[0].effectiveValues.map(({ sourceScopeKind }) => sourceScopeKind),
    ["course", "didactic_microsequence"]
  );
  assert.deepEqual(
    normalized.design.editorialDirections.map(({ sourceScopeKind }) => sourceScopeKind),
    ["course", "study_unit"]
  );
});

test("#273 rejeita maquinaria, score e parâmetro inventado em qualquer projeção", () => {
  for (const mutate of [
    (value) => { value.runs = []; },
    (value) => { value.design.steps = 3; },
    (value) => { value.authorship.duration = 10; },
    (value) => { value.authorship.collaborationScore = 0.8; },
    (value) => { value.design.parameters.push({
      parameterId: "invented_parameter",
      label: "Parâmetro inventado",
      valueKind: "integer",
      effectiveValues: []
    }); }
  ]) {
    const value = snapshot();
    mutate(value);
    assert.throws(() => normalizeCourseAuthoringAnalyticsPage(value));
  }
  const serialized = JSON.stringify(normalizeCourseAuthoringAnalyticsPage(snapshot()));
  assert.doesNotMatch(
    serialized,
    /run|step|retry|duration|hash|payload|score|transcript|prompt|clickstream/iu
  );
});

test("#273 assembler anexa somente deep link e confere Curso/escopo", () => {
  const assembled = assembleCourseAuthoringAnalyticsPage(snapshot(), {
    publicAppUrl: "https://app.example/",
    expectedCourseId: COURSE_ID,
    expectedQuery: { scope: { kind: "course", ref: null } }
  });
  assert.match(assembled.deepLink,
    new RegExp(`/#/authoring/courses/${COURSE_ID}\\?section=research&analyticsScopeKind=course$`, "u"));

  assert.throws(() => assembleCourseAuthoringAnalyticsPage(snapshot(), {
    publicAppUrl: "https://app.example",
    expectedQuery: { scope: { kind: "study_unit", ref: "unit-a" } }
  }), /outro escopo/u);
});

test("#273 remove exportação e dicionário de fatos legados", () => {
  for (const name of [
    "COURSE_AUTHORING_ANALYTICS_DATASETS",
    "COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION",
    "assembleCourseAuthoringAnalyticsExport",
    "serializeCourseAuthoringAnalyticsCsv"
  ]) {
    assert.equal(Object.hasOwn(analyticsDomain, name), false, name);
  }
});

test("#273 domínio web e mirror Edge permanecem uma única autoridade", async () => {
  const [web, edge] = await Promise.all([
    fs.readFile(new URL("../../src/domain/courseAuthoringAnalytics.js", import.meta.url), "utf8"),
    fs.readFile(new URL(
      "../../supabase/functions/_shared/aralearn/runtime/domain/courseAuthoringAnalytics.js",
      import.meta.url
    ), "utf8")
  ]);
  assert.equal(edge, web);
});
