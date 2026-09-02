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
  effectiveValues: [{ value: 2, origin: "author", studyUnitCount: 2 }]
}, {
  parameterId: "required_explanation_forms",
  label: "Formas de explicação",
  valueKind: "string_list",
  effectiveValues: [{
    value: ["plain_definition", "mechanism"],
    origin: "automatic",
    studyUnitCount: 2
  }]
}, {
  parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement",
  label: "Mínimo de práticas",
  valueKind: "integer",
  effectiveValues: [{ value: 2, origin: "author", studyUnitCount: 2 }]
}, {
  parameterId: "required_practice_variation_dimensions",
  label: "Dimensões de variação",
  valueKind: "string_list",
  effectiveValues: [{
    value: ["case_or_data", "context"],
    origin: "author",
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
        studyUnitCount: studyUnits.length
      }],
      analysisUnits: [{
        position: 1,
        statement: "DNS associa nomes a endereços.",
        introductionCount: 1
      }, {
        position: 2,
        statement: "A resolução consulta registros em sequência.",
        introductionCount: 1
      }, {
        position: 3,
        statement: "O cache condiciona uma nova consulta.",
        introductionCount: 1
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
        role: "supported_by",
        sourceCount: 2,
        anchorCount: 3,
        studyUnitCount: studyUnits.length
      }]
    },
    authorship: {
      observations: { createdCount: 4, openCount: 1, resolvedCount: 2 },
      explicitParameterChangeCount: 3,
      manualEditCount: 1,
      repairs: { acceptedCount: 2, rejectedCount: 1 },
      studyUnitChangesByOrigin: [{
        origin: "authoring_chat",
        createdCount: studyUnits.length,
        revisedCount: 1
      }, {
        origin: "manual",
        createdCount: 0,
        revisedCount: 1
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
  assert.deepEqual(normalized.design.introductionsByStudyUnit.map(({ introducedCount }) =>
    introducedCount), [2, 1]);
  assert.equal(normalized.design.explanationForms[0].applicationCount, 3);
  assert.equal(normalized.design.components[1].componentRef,
    "aralearn.resource.sequence@1.0.0");
  assert.equal(normalized.design.practiceByRequirement[0].opportunityCount, 2);
  assert.equal(normalized.design.practiceVariationDimensions[0].opportunityCount, 2);
  assert.deepEqual(normalized.authorship.observations, {
    createdCount: 4,
    openCount: 1,
    resolvedCount: 2
  });
  assert.equal(normalized.authorship.explicitParameterChangeCount, 3);
  assert.equal(normalized.authorship.manualEditCount, 1);
  assert.deepEqual(normalized.authorship.repairs, { acceptedCount: 2, rejectedCount: 1 });
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
    studyUnitCount: 1
  }, {
    value: 2,
    origin: "automatic",
    studyUnitCount: 1
  }];
  const normalized = normalizeCourseAuthoringAnalyticsPage(value);
  assert.deepEqual(normalized.design.parameters[0].effectiveValues.map(({ value: entry }) => entry),
    [1, 2]);
  assert.deepEqual(normalized.missingData,
    ["Uma Observação retirada não é classificada como resolvida."]);

  const localScope = snapshot({
    scope: { kind: "didactic_microsequence", ref: "micro-dns", label: "DNS" }
  });
  localScope.authorship.manualEditCount = null;
  assert.equal(normalizeCourseAuthoringAnalyticsPage(localScope, {
    expectedQuery: { scope: { kind: "didactic_microsequence", ref: "micro-dns" } }
  }).authorship.manualEditCount, null);
  localScope.missingData = [];
  assert.throws(() => normalizeCourseAuthoringAnalyticsPage(localScope), /missingData/u);

  const overflow = snapshot();
  overflow.design.parameters[0].effectiveValues[0].studyUnitCount = 3;
  assert.throws(() => normalizeCourseAuthoringAnalyticsPage(overflow), /mais Units/u);

  const silentlyMissing = snapshot();
  silentlyMissing.design.parameters[0].effectiveValues[0].studyUnitCount = 1;
  silentlyMissing.missingData = [];
  assert.throws(() => normalizeCourseAuthoringAnalyticsPage(silentlyMissing), /missingData/u);
});

test("#273 rejeita maquinaria, score e quinto parâmetro em qualquer projeção", () => {
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
  assert.doesNotMatch(serialized, /run|step|retry|duration|hash|payload|score/iu);
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
