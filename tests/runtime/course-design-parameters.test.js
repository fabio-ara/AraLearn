import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_COMPONENT_CATALOG_VERSION,
  COURSE_DESIGN_PARAMETER_CATALOG_VERSION,
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  CourseDesignParametersError,
  normalizeCourseComponentPolicy,
  normalizeCourseDesignChange,
  normalizeCourseDesignCommand,
} from "../../src/domain/courseDesignParameters.js";
import { normalizeCourseDesignCommand as normalizeEdgeCommand } from
  "../../supabase/functions/_shared/aralearn/runtime/domain/courseDesignParameters.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const LESSON = "lesson-a";
const MICROSEQUENCE = "micro-a";
const ANALYSIS_IDS = Array.from(
  { length: 7 },
  (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);
const EVIDENCE = "30000000-0000-4000-8000-000000000001";


test("catálogo v1.1 mantém quatro hipóteses pedagógicas e dois alvos editoriais flexíveis", () => {
  assert.equal(COURSE_DESIGN_PARAMETER_CATALOG_VERSION, "1.1.0");
  assert.deepEqual(
    COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id, defaultStatus }) => [id, defaultStatus]),
    [
      ["new_analysis_unit_ceiling_per_expository_study_unit", "product_hypothesis"],
      ["required_explanation_forms", "product_hypothesis"],
      ["minimum_distinct_practice_opportunities_per_evidence_requirement", "product_hypothesis"],
      ["required_practice_variation_dimensions", "product_hypothesis"],
      ["authoring_chat_response_word_target", "product_hypothesis"],
      ["study_unit_content_word_target", "product_hypothesis"]
    ]
  );
  const catalogText = JSON.stringify(COURSE_DESIGN_PARAMETER_DEFINITIONS);
  assert.ok(COURSE_DESIGN_PARAMETER_DEFINITIONS.every(({ valueSchema }) => (
    ["integer", "set"].includes(valueSchema.type)
  )));
  const editorial = COURSE_DESIGN_PARAMETER_DEFINITIONS.slice(-2);
  assert.deepEqual(editorial.map(({ defaultValue }) => defaultValue), [120, 180]);
  assert.ok(editorial.every(({ valueSchema }) => valueSchema.type === "integer"));
  assert.match(catalogText, /não é limite rígido|não é máximo/iu);
});

test("orientação qualitativa permanece separada dos seis parâmetros quantitativos", () => {
  const scope = { kind: "didactic_microsequence", ref: MICROSEQUENCE };
  const editorial = normalizeCourseDesignCommand({
    type: "set_guidance",
    scope,
    guidance: [
      "Footprint: prefira uma rolagem focal sem comprimir conteúdo necessário.",
      "Parágrafos: distribua blocos longos entre Unidades quando necessário.",
      "Títulos: use títulos informativos e curtos.",
      "Estilo: direto, sóbrio e adequado ao público."
    ].join("\n"),
    origin: "author",
    reason: "Direção editorial explícita para esta Microssequência."
  });
  assert.equal(Object.hasOwn(editorial, "parameterId"), false);
  assert.equal(Object.hasOwn(editorial, "value"), false);
  assert.match(editorial.guidance, /Footprint.*Parágrafos.*Títulos.*Estilo/isu);

  assert.deepEqual(normalizeCourseDesignCommand({
    type: "set_parameter",
    scope,
    parameterId: "study_unit_content_word_target",
    value: 220,
    origin: "author",
    reason: "Condição editorial comparável."
  }).value, 220);
  assert.throws(() => normalizeCourseDesignCommand({
    type: "set_parameter",
    scope,
    parameterId: "study_unit_content_word_target",
    value: 20,
    origin: "author",
    reason: "Abaixo da faixa declarada."
  }), (error) => error instanceof CourseDesignParametersError &&
    error.code === "invalid_course_design_parameter_value");
});

test("comandos são fechados e preservam paridade exata com o mirror Edge", () => {
  const commands = [
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
      type: "set_target_plan_items",
      scope: { kind: "didactic_microsequence", ref: MICROSEQUENCE },
      instructionalAnalysisUnitIds: ANALYSIS_IDS.slice(0, 3),
      evidenceRequirementIds: [EVIDENCE]
    }),
    (error) => error instanceof CourseDesignParametersError &&
      error.code === "invalid_course_design_command"
  );
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



test("change DTO conserva somente o fato corrente sem identidade de histórico", () => {
  const valid = {
    contract: "aralearn.course-design-change.v2",
    courseId: COURSE,
    courseRevision: 9,
    requestId: "design-change-001",
    idempotent: false,
    changed: true,
    change: {
      type: "set_parameter",
      scope: { kind: "course", ref: COURSE },
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit"
    }
  };
  assert.deepEqual(normalizeCourseDesignChange(valid), valid);
  assert.throws(() => normalizeCourseDesignChange({
    ...valid,
    change: { ...valid.change, changeId: "1" }
  }), /campo desconhecido/iu);
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
        scope: { kind: "lesson", ref: LESSON },
        parameterId: null
      }
    }),
    /tipo da mudança é inválido/iu
  );
});
