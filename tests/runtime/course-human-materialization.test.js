import assert from "node:assert/strict";
import test from "node:test";

import { materializeHumanCoursePart } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000001";
const ANALYSIS_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_ANALYSIS_ID = "30000000-0000-4000-8000-000000000002";
const EVIDENCE_ID = "30000000-0000-4000-8000-000000000003";
const PRINCIPAL = {
  actorId: "40000000-0000-4000-8000-000000000001",
  scopes: ["authoring:read", "authoring:write"]
};

function adapterFixture() {
  const calls = [];
  let revision = 8;
  return {
    calls,
    async listCourses() {
      return {
        items: [{ courseId: COURSE_ID, title: "Curso de Redes" }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourse() {
      return { courseId: COURSE_ID, title: "Curso de Redes", revision };
    },
    async getCourseInstructionalPlan() {
      return {
        contract: "aralearn.course-instructional-plan.v3",
        courseRevision: revision,
        plan: {
          version: 3,
          title: "Curso de Redes",
          instructionalAnalysisUnits: [{
            id: ANALYSIS_ID,
            position: 8,
            statement: "DNS associa nomes a endereços.",
            description: "Relação entre um nome consultado e o endereço devolvido pelo DNS.",
            introducedAt: null,
            usedBy: [],
            revisitedBy: [],
            version: 1
          }],
          evidenceRequirements: [],
          parts: [{
            id: PART_ID,
            position: 0,
            title: "Fundamentos",
            version: 2,
            microsequences: [{
              id: "micro-dns",
              productionPosition: 0,
              title: "DNS"
            }]
          }]
        }
      };
    },
    async getCourseSources({ mode }) {
      if (mode === "catalog") {
        return {
          items: [{
            sourceId: "source-rfc-1035",
            revision: 1,
            title: "Domain names — implementation and specification",
            citationText: "RFC 1035"
          }],
          nextCursor: null
        };
      }
      return {
        items: [{
          sourceId: "source-rfc-1035",
          revision: 1,
          anchors: [{
            anchorId: "anchor-rfc-1035-section-2",
            revision: 1,
            status: "active",
            humanLocator: "Seção 2 — Introdução",
            verificationExcerpt: "Hosts usam nomes e endereços."
          }]
        }]
      };
    },
    async getCourseDesign() {
      return {
        targetPlanItems: {
          instructionalAnalysisUnitIds: [ANALYSIS_ID],
          evidenceRequirementIds: []
        },
        parameters: [
          ["new_analysis_unit_ceiling_per_expository_study_unit", 1],
          ["required_explanation_forms", ["plain_definition"]],
          ["minimum_distinct_practice_opportunities_per_evidence_requirement", 1],
          ["required_practice_variation_dimensions", ["case_or_data"]]
        ].map(([parameterId, value]) => ({
          parameterId,
          effectiveAssignment: {
            value,
            origin: "author",
            sourceScope: { kind: "didactic_microsequence", ref: "micro-dns" }
          }
        })),
        guidance: {
          effectiveAssignments: [{
            guidance: "Parágrafos curtos, sem eliminar explicações necessárias.",
            origin: "author",
            sourceScope: { kind: "didactic_microsequence", ref: "micro-dns" }
          }]
        },
        componentPolicy: {
          effectiveAssignment: {
            policy: { mode: "allow_all", includedRefs: [], excludedRefs: [] },
            origin: "system_default",
            sourceScope: null
          }
        }
      };
    },
    async listCourseStudyUnits() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async materializeCourseAuthoringPart(request) {
      calls.push(structuredClone(request));
      assert.match(request.requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u);
      revision += 1;
      return {
        contract: "aralearn.course-part-materialization.v1",
        courseId: COURSE_ID,
        courseRevision: revision,
        authoringPartId: PART_ID,
        changed: true,
        studyUnitCount: request.units.length,
        idempotent: false,
        deepLink: `#/authoring/courses/${COURSE_ID}?section=content`
      };
    }
  };
}

function unit(fontes = []) {
  return {
    microssequencia: "dns",
    posicao: 1,
    conteudo: {
      title: "Como o DNS associa nomes a endereços",
      role: "theory",
      content: [{
        id: "dns-paragraph",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Um resolvedor consulta registros para obter o endereço associado." }
      }],
      response: null,
      feedback: [],
      topics: ["DNS"]
    },
    aplicacaoPedagogica: {
      modo: "expositiva",
      ideiasIntroduzidas: [1],
      ideiasUtilizadas: [],
      explicacoes: [{
        ideia: "DNS associa nomes a endereços.",
        formas: ["plain_definition", "concrete_example", "mechanism"],
        formasNaoAplicaveis: [{
          forma: "contrast",
          motivo: "Esta primeira Unit estabelece a relação antes de contrastá-la."
        }]
      }],
      praticas: []
    },
    fontes
  };
}

function pedagogicalAdapter({ ceiling = 1, analysisCount = 2, withEvidence = false } = {}) {
  const value = adapterFixture();
  const analysis = [ANALYSIS_ID, SECOND_ANALYSIS_ID].slice(0, analysisCount)
    .map((id, position) => ({
      id,
      position,
      statement: `Novidade ${position + 1}.`,
      description: `Descrição suficiente para distinguir a ideia ${position + 1}.`,
      introducedAt: null,
      usedBy: [],
      revisitedBy: [],
      version: 1
    }));
  value.getCourseInstructionalPlan = async () => ({
    contract: "aralearn.course-instructional-plan.v3",
    courseRevision: 8,
    plan: {
      version: 3,
      title: "Curso de Redes",
      instructionalAnalysisUnits: analysis,
      evidenceRequirements: withEvidence ? [{
        id: EVIDENCE_ID,
        position: 0,
        statement: "Classificar casos de rede.",
        version: 1
      }] : [],
      parts: [{
        id: PART_ID,
        position: 0,
        title: "Fundamentos",
        version: 2,
        microsequences: [{ id: "micro-dns", productionPosition: 0, title: "DNS" }]
      }]
    }
  });
  value.getCourseDesign = async () => ({
    targetPlanItems: {
      instructionalAnalysisUnitIds: analysis.map(({ id }) => id),
      evidenceRequirementIds: withEvidence ? [EVIDENCE_ID] : []
    },
    parameters: [
      ["new_analysis_unit_ceiling_per_expository_study_unit", ceiling],
      ["required_explanation_forms", ["plain_definition", "mechanism"]],
      ["minimum_distinct_practice_opportunities_per_evidence_requirement", 2],
      ["required_practice_variation_dimensions", ["case_or_data", "context"]]
    ].map(([parameterId, parameterValue]) => ({
      parameterId,
      effectiveAssignment: {
        value: parameterValue,
        origin: "automatic",
        sourceScope: { kind: "didactic_microsequence", ref: "micro-dns" }
      }
    })),
    guidance: { effectiveAssignments: [] },
    componentPolicy: {
      effectiveAssignment: {
        policy: {
          catalogVersion: "fixture",
          availability: "all",
          allowedRefs: [],
          excludedRefs: [],
          preferredRefs: []
        },
        origin: "system_default",
        sourceScope: null
      }
    }
  });
  return value;
}

function pedagogicalUnit(position, {
  mode = "expositiva",
  novelty = [],
  used = [],
  explanations = [],
  practices = []
} = {}) {
  const value = unit();
  value.posicao = position;
  value.conteudo.title = `Unidade ${position}`;
  value.conteudo.content[0].id = `paragraph-${position}`;
  if (mode !== "expositiva") {
    value.conteudo.role = "practice";
    value.conteudo.response = {
      id: `choice-${position}`,
      package: "aralearn.response.choice",
      version: "1.0.0",
      data: {
        question: `Qual afirmação corresponde à Unidade ${position}?`,
        selectionMode: "single",
        selectionCriterion: "correct",
        options: [
          { id: "correct", text: "A afirmação coerente." },
          { id: "distractor", text: "Uma interpretação incompatível." }
        ],
        answerIds: ["correct"]
      }
    };
  }
  value.aplicacaoPedagogica = {
    modo: mode,
    ideiasIntroduzidas: novelty,
    ideiasUtilizadas: used,
    explicacoes: explanations,
    praticas: practices
  };
  return value;
}

test("papel da StudyUnit corresponde ao modo pedagógico declarado", async () => {
  const practiceAsTheory = pedagogicalUnit(1, { mode: "pratica", practices: [] });
  practiceAsTheory.conteudo.role = "theory";
  practiceAsTheory.conteudo.response = null;
  await assert.rejects(() => materializeHumanCoursePart({
    adapter: pedagogicalAdapter({ analysisCount: 0 }),
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [practiceAsTheory]
  }), (error) => error.code === "human_materialization_mode_mismatch");

  const theoryAsPractice = pedagogicalUnit(1, {
    novelty: [1],
    explanations: [{ ideia: 1, formas: ["plain_definition", "mechanism"] }]
  });
  theoryAsPractice.conteudo.role = "practice";
  theoryAsPractice.conteudo.response = {
    id: "choice-1",
    package: "aralearn.response.choice",
    version: "1.0.0",
    data: {
      question: "Qual relação foi explicada?",
      selectionMode: "single",
      selectionCriterion: "correct",
      options: [
        { id: "correct", text: "A relação explicada." },
        { id: "distractor", text: "Outra relação." }
      ],
      answerIds: ["correct"]
    }
  };
  await assert.rejects(() => materializeHumanCoursePart({
    adapter: pedagogicalAdapter({ analysisCount: 1 }),
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [theoryAsPractice]
  }), (error) => error.code === "human_materialization_mode_mismatch");
});

test("#272 materializa Parte com Fonte/Âncora sem IDs, fences, steps ou requestIds públicos", async () => {
  const adapter = adapterFixture();
  const receipt = await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit([{
      fonte: "RFC 1035",
      relacao: "supported_by",
      ancoras: ["Seção 2 — Introdução"]
    }])]
  });

  assert.equal(adapter.calls.length, 1);
  const [write] = adapter.calls;
  assert.equal(write.courseId, COURSE_ID);
  assert.equal(write.authoringPartId, PART_ID);
  assert.equal(write.expectedCourseRevision, 8);
  assert.equal(write.expectedAuthoringPartVersion, 2);
  const stored = write.units[0];
  assert.equal(stored.didacticMicrosequenceId, "micro-dns");
  assert.equal(stored.position, 1);
  assert.equal(Object.hasOwn(stored.content, "id"), false);
  assert.equal(Object.hasOwn(stored.content, "position"), false);
  assert.match(stored.studyUnitId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const applied = stored.designApplication;
  assert.deepEqual(applied.introducedInstructionalAnalysisUnitIds, [ANALYSIS_ID]);
  assert.deepEqual(applied.usedInstructionalAnalysisUnitIds, []);
  assert.equal(applied.explanationApplications[0].instructionalAnalysisUnitId, ANALYSIS_ID);
  assert.deepEqual(applied.explanationApplications[0].notApplicable, [{
    form: "contrast",
    reason: "Esta primeira Unit estabelece a relação antes de contrastá-la."
  }]);
  assert.deepEqual(applied.componentRefs, ["aralearn.resource.paragraph@1.0.0"]);
  assert.equal(Object.hasOwn(stored.designSnapshot, "appliedAt"), false);
  assert.equal(stored.designSnapshot.parameters[0].sourceScopeKind,
    "didactic_microsequence");
  assert.equal(stored.designSnapshot.componentPolicy.sourceScopeKind, null);
  assert.deepEqual(stored.sourceLinks, [{
    sourceId: "source-rfc-1035",
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-rfc-1035-section-2" }]
  }]);
  assert.equal(receipt.result, "1 Unidade foi produzida na Parte 1.");
  assert.equal(receipt.deepLink, `#/authoring/courses/${COURSE_ID}?section=content`);
  assert.deepEqual(receipt.context, {
    part: "1",
    studyUnitCount: 1
  });
  assert.equal(JSON.stringify({ ...receipt, deepLink: null }).includes(COURSE_ID), false);
});

test("#272 materialização falha cedo quando a Âncora humana não existe", async () => {
  const adapter = adapterFixture();
  await assert.rejects(() => materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: "Fundamentos",
    units: [unit([{
      fonte: "RFC 1035",
      relacao: "supported_by",
      ancoras: ["Seção inexistente"]
    }])]
  }), (error) => error.status === 404 && error.code === "human_reference_not_found");
  assert.deepEqual(adapter.calls, []);
});

test("#272 IDs de Fonte e Âncora não voltam a ser referências humanas", async () => {
  for (const fontes of [[{
    fonte: "source-rfc-1035",
    relacao: "supported_by",
    ancoras: ["Seção 2 — Introdução"]
  }], [{
    fonte: "RFC 1035",
    relacao: "supported_by",
    ancoras: ["anchor-rfc-1035-section-2"]
  }]]) {
    const adapter = adapterFixture();
    await assert.rejects(() => materializeHumanCoursePart({
      adapter,
      principal: PRINCIPAL,
      course: "Curso de Redes",
      part: 1,
      units: [unit(fontes)]
    }), (error) => error.status === 404 && error.code === "human_reference_not_found");
    assert.deepEqual(adapter.calls, []);
  }
});

test("#272 valida todas as Units antes de iniciar uma materialização", async () => {
  const adapter = adapterFixture();
  const invalid = unit();
  invalid.posicao = 2;
  invalid.conteudo = { title: "Unidade incompleta" };
  await assert.rejects(() => materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit(), invalid]
  }), (error) => error.code === "invalid_human_study_unit");
  assert.deepEqual(adapter.calls, []);
});

test("materialização atômica exige ao menos uma Unit de cada Microssequência da Parte", async () => {
  const adapter = adapterFixture();
  const currentPlan = await adapter.getCourseInstructionalPlan();
  adapter.getCourseInstructionalPlan = async () => ({
    ...currentPlan,
    plan: {
      ...currentPlan.plan,
      parts: currentPlan.plan.parts.map((part) => ({
        ...part,
        microsequences: [...part.microsequences, {
          id: "micro-pratica",
          productionPosition: 1,
          title: "Prática"
        }]
      }))
    }
  });

  await assert.rejects(() => materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit()]
  }), (error) => error.code === "human_materialization_incomplete_part");
  assert.deepEqual(adapter.calls, []);
});

test("revisão atômica reutiliza o slot existente e não remove Unit omitida", async () => {
  const existingUnit = (id, position) => ({
    studyUnit: { id, position, title: `Unidade ${position}` },
    curriculumPath: {
      didacticMicrosequence: { id: "micro-dns", position: 0, title: "DNS" }
    }
  });
  const reusedId = "70000000-0000-4000-8000-000000000001";
  const adapter = adapterFixture();
  const reads = [];
  adapter.listCourseStudyUnits = async (options) => {
    reads.push(structuredClone(options));
    return {
      items: [existingUnit(reusedId, 1)],
      hasMore: false,
      nextCursor: null
    };
  };
  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit()]
  });
  assert.equal(adapter.calls[0].units[0].studyUnitId, reusedId);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].scopeKind, "authoring_part");
  assert.equal(reads[0].scopeId, PART_ID);

  const omission = adapterFixture();
  omission.listCourseStudyUnits = async () => ({
    items: [
      existingUnit(reusedId, 1),
      existingUnit("70000000-0000-4000-8000-000000000002", 2)
    ],
    hasMore: false,
    nextCursor: null
  });
  await assert.rejects(() => materializeHumanCoursePart({
    adapter: omission,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit()]
  }), (error) => error.code === "human_materialization_existing_unit_omitted");
  assert.deepEqual(omission.calls, []);
});

function unitScopedPedagogicalAdapter({ blockedComponent = false } = {}) {
  const value = pedagogicalAdapter({ ceiling: 2, analysisCount: 2, withEvidence: true });
  const inheritedDesign = value.getCourseDesign;
  const studyUnitId = "70000000-0000-4000-8000-000000000001";
  value.listCourseStudyUnits = async () => ({
    items: [{
      studyUnit: { id: studyUnitId, position: 1, title: "Unidade 1" },
      curriculumPath: {
        didacticMicrosequence: { id: "micro-dns", position: 0, title: "DNS" }
      }
    }],
    hasMore: false,
    nextCursor: null
  });
  value.getCourseDesign = async (options) => {
    const design = await inheritedDesign(options);
    if (options.scopeKind !== "study_unit") return design;
    assert.equal(options.scopeRef, studyUnitId);
    const values = new Map([
      ["new_analysis_unit_ceiling_per_expository_study_unit", 1],
      ["required_explanation_forms", ["contrast"]],
      ["minimum_distinct_practice_opportunities_per_evidence_requirement", 3],
      ["required_practice_variation_dimensions", ["support_level"]]
    ]);
    design.parameters = design.parameters.map((parameter) => ({
      ...parameter,
      effectiveAssignment: {
        value: values.get(parameter.parameterId),
        origin: "research_condition",
        sourceScope: { kind: "study_unit", ref: studyUnitId }
      }
    }));
    design.componentPolicy.effectiveAssignment = {
      policy: {
        catalogVersion: "fixture",
        availability: "all",
        allowedRefs: [],
        excludedRefs: blockedComponent
          ? ["aralearn.resource.paragraph@1.0.0"]
          : [],
        preferredRefs: []
      },
      origin: "research_condition",
      sourceScope: { kind: "study_unit", ref: studyUnitId }
    };
    return design;
  };
  return value;
}

function unitScopedMaterialization({
  existingForms = ["contrast"],
  existingPractices = [
    ["caso-a", ["support_level"]],
    ["caso-b", ["context"]],
    ["caso-c", ["case_or_data"]]
  ]
} = {}) {
  const explanation = (ideia, formas) => ({ ideia, formas });
  const practice = ([oportunidade, dimensoesVariadas]) => ({
    requisito: 1, oportunidade, dimensoesVariadas
  });
  return [
    pedagogicalUnit(1, {
      mode: "mista",
      novelty: [1],
      explanations: [explanation(1, existingForms)],
      practices: existingPractices.map(practice)
    }),
    pedagogicalUnit(2, {
      novelty: [2],
      explanations: [explanation(2, ["plain_definition", "mechanism"])]
    })
  ];
}

test("Unit existente sela os quatro overrides e a Unit nova herda a Microssequência", async () => {
  const adapter = unitScopedPedagogicalAdapter();
  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: unitScopedMaterialization()
  });
  const [existing, created] = adapter.calls[0].units;
  assert.equal(existing.studyUnitId, "70000000-0000-4000-8000-000000000001");
  assert.equal(existing.designSnapshot.parameters.every(({ sourceScopeKind }) =>
    sourceScopeKind === "study_unit"), true);
  assert.equal(existing.designSnapshot.componentPolicy.sourceScopeKind, "study_unit");
  assert.equal(created.designSnapshot.parameters.every(({ sourceScopeKind }) =>
    sourceScopeKind === "didactic_microsequence"), true);
});

test("override da Unit rege teto, formas, prática, variação e componentes na rematerialização", async () => {
  const cases = [{
    mutate(units) {
      units[0].aplicacaoPedagogica.ideiasIntroduzidas = [1, 2];
      units[0].aplicacaoPedagogica.explicacoes.push({
        ideia: 2, formas: ["contrast"]
      });
      units.pop();
    },
    code: "human_materialization_analysis_unit_ceiling_exceeded"
  }, {
    mutate(units) {
      units[0].aplicacaoPedagogica.explicacoes[0].formas = ["plain_definition"];
    },
    code: "human_materialization_missing_explanation_form"
  }, {
    mutate(units) {
      units[0].aplicacaoPedagogica.praticas.pop();
    },
    code: "human_materialization_insufficient_practice"
  }, {
    mutate(units) {
      for (const practice of units[0].aplicacaoPedagogica.praticas) {
        practice.dimensoesVariadas = ["case_or_data"];
      }
    },
    code: "human_materialization_insufficient_practice"
  }];
  for (const scenario of cases) {
    const units = unitScopedMaterialization();
    scenario.mutate(units);
    await assert.rejects(() => materializeHumanCoursePart({
      adapter: unitScopedPedagogicalAdapter(),
      principal: PRINCIPAL,
      course: "Curso de Redes",
      part: 1,
      units
    }), (error) => error.code === scenario.code, scenario.code);
  }
  await assert.rejects(() => materializeHumanCoursePart({
    adapter: unitScopedPedagogicalAdapter({ blockedComponent: true }),
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: unitScopedMaterialization()
  }), (error) => error.code === "human_materialization_component_policy_violation");
});

test("teto 1 e 2 preservam o inventário e mudam somente sua distribuição", async () => {
  const explanation = (ideia) => ({
    ideia,
    formas: ["plain_definition", "mechanism"]
  });
  const ceilingOne = pedagogicalAdapter({ ceiling: 1 });
  await materializeHumanCoursePart({
    adapter: ceilingOne,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [
      pedagogicalUnit(1, { novelty: [1], explanations: [explanation(1)] }),
      pedagogicalUnit(2, { novelty: [2], explanations: [explanation(2)] })
    ]
  });
  assert.equal(ceilingOne.calls[0].units.length, 2);

  const ceilingTwo = pedagogicalAdapter({ ceiling: 2 });
  await materializeHumanCoursePart({
    adapter: ceilingTwo,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [pedagogicalUnit(1, {
      novelty: [1, 2],
      explanations: [explanation(1), explanation(2)]
    })]
  });
  assert.deepEqual(
    ceilingTwo.calls[0].units[0].designApplication.introducedInstructionalAnalysisUnitIds,
    [ANALYSIS_ID, SECOND_ANALYSIS_ID]
  );

  await assert.rejects(() => materializeHumanCoursePart({
    adapter: pedagogicalAdapter({ ceiling: 1 }),
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [pedagogicalUnit(1, {
      novelty: [1, 2],
      explanations: [explanation(1), explanation(2)]
    })]
  }), (error) => error.code === "human_materialization_analysis_unit_ceiling_exceeded");
});

test("prática aplica mínimo, operação invariável e dimensões efetivas", async () => {
  const adapter = pedagogicalAdapter({ analysisCount: 0, withEvidence: true });
  const practice = (oportunidade, dimensoesVariadas) => ({
    requisito: 1,
    oportunidade,
    dimensoesVariadas
  });
  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [pedagogicalUnit(1, {
      mode: "pratica",
      practices: [
        practice("caso-a", ["case_or_data"]),
        practice("caso-b", ["context"])
      ]
    })]
  });
  assert.equal(adapter.calls[0].units[0].designApplication.practiceApplications.length, 2);

  await assert.rejects(() => materializeHumanCoursePart({
    adapter: pedagogicalAdapter({ analysisCount: 0, withEvidence: true }),
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [pedagogicalUnit(1, {
      mode: "pratica",
      practices: [practice("caso-a", ["case_or_data"])]
    })]
  }), (error) => error.code === "human_materialization_insufficient_practice");
});

test("consolidação formativa não fabrica requisito de evidência", async () => {
  const adapter = pedagogicalAdapter({ analysisCount: 0, withEvidence: false });
  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [pedagogicalUnit(1, { mode: "pratica", practices: [] })]
  });
  assert.deepEqual(
    adapter.calls[0].units[0].designApplication.practiceApplications,
    []
  );
});

test("formas podem continuar depois da introdução, mas nunca antes dela", async () => {
  const adapter = pedagogicalAdapter({ ceiling: 1, analysisCount: 1 });
  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [
      pedagogicalUnit(1, {
        novelty: [1],
        explanations: [{ ideia: 1, formas: ["plain_definition"] }]
      }),
      pedagogicalUnit(2, {
        explanations: [{ ideia: 1, formas: ["mechanism"] }]
      })
    ]
  });
  assert.equal(adapter.calls[0].units.length, 2);

  await assert.rejects(() => materializeHumanCoursePart({
    adapter: pedagogicalAdapter({ ceiling: 1, analysisCount: 1 }),
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [
      pedagogicalUnit(1, {
        explanations: [{ ideia: 1, formas: ["plain_definition"] }]
      }),
      pedagogicalUnit(2, {
        novelty: [1],
        explanations: [{ ideia: 1, formas: ["mechanism"] }]
      })
    ]
  }), (error) => error.code === "human_materialization_explanation_before_introduction");
});

test("item focal percorre a microssequência e chega às unidades como introdução, uso ou retomada", async () => {
  const adapter = pedagogicalAdapter({ ceiling: 2, analysisCount: 2 });
  const designReads = [];
  const materializationReads = [];
  const establishedAt = {
    studyUnitId: "70000000-0000-4000-8000-000000000010",
    didacticMicrosequenceId: "micro-prerequisite",
    title: "Ideia já estabelecida"
  };
  adapter.getCourseInstructionalPlan = async () => ({
    contract: "aralearn.course-instructional-plan.v3",
    courseRevision: 8,
    plan: {
      version: 4,
      title: "Curso de Redes",
      curriculum: {
        modules: [{
          id: "module-network",
          position: 0,
          title: "Rede local",
          lessons: [{
            id: "lesson-switch",
            position: 0,
            title: "Decisões do switch",
            microsequences: [{
              id: "micro-foundations",
              position: 0,
              title: "Aprender a associação"
            }, {
              id: "micro-application",
              position: 1,
              title: "Usar e retomar a associação"
            }]
          }]
        }]
      },
      curriculumScopeItems: [{
        id: "50000000-0000-4000-8000-000000000001",
        position: 0,
        statement: "Aprender e aplicar uma associação de rede.",
        state: "planned",
        curriculumTargets: [{
          moduleId: "module-network",
          lessonId: "lesson-switch",
          didacticMicrosequenceIds: ["micro-foundations", "micro-application"]
        }],
        developedIn: []
      }],
      instructionalAnalysisUnits: [{
        id: ANALYSIS_ID,
        position: 0,
        statement: "Ideia já estabelecida.",
        description: "Conhecimento anterior necessário para interpretar a associação.",
        version: 1,
        introducedAt: establishedAt,
        usedBy: [],
        revisitedBy: []
      }, {
        id: SECOND_ANALYSIS_ID,
        position: 1,
        statement: "Associação focal.",
        description: "Relação nova que será introduzida, usada e depois retomada.",
        version: 1,
        introducedAt: null,
        usedBy: [],
        revisitedBy: []
      }],
      evidenceRequirements: [],
      parts: [{
        id: PART_ID,
        position: 0,
        title: "Fundamentos",
        version: 2,
        microsequences: [{
          id: "micro-foundations",
          productionPosition: 0,
          title: "Aprender a associação"
        }, {
          id: "micro-application",
          productionPosition: 1,
          title: "Usar e retomar a associação"
        }]
      }]
    }
  });
  adapter.getCourseDesign = async ({ scopeKind, scopeRef }) => {
    designReads.push({ scopeKind, scopeRef });
    const ids = scopeRef === "micro-foundations"
      ? [SECOND_ANALYSIS_ID]
      : [ANALYSIS_ID, SECOND_ANALYSIS_ID];
    return {
      targetPlanItems: {
        instructionalAnalysisUnitIds: ids,
        evidenceRequirementIds: []
      },
      parameters: [
        ["new_analysis_unit_ceiling_per_expository_study_unit", 2],
        ["required_explanation_forms", ["plain_definition"]],
        ["minimum_distinct_practice_opportunities_per_evidence_requirement", 1],
        ["required_practice_variation_dimensions", []]
      ].map(([parameterId, value]) => ({
        parameterId,
        effectiveAssignment: {
          value,
          origin: "automatic",
          sourceScope: { kind: "didactic_microsequence", ref: scopeRef }
        }
      })),
      guidance: { effectiveAssignments: [] },
      componentPolicy: {
        effectiveAssignment: {
          policy: {
            catalogVersion: "fixture",
            availability: "all",
            allowedRefs: [],
            excludedRefs: [],
            preferredRefs: []
          },
          origin: "system_default",
          sourceScope: null
        }
      }
    };
  };
  const commit = adapter.materializeCourseAuthoringPart;
  adapter.materializeCourseAuthoringPart = async (request) => {
    materializationReads.push(structuredClone(request));
    return commit(request);
  };

  const introduction = pedagogicalUnit(1, {
    novelty: [2],
    explanations: [{ ideia: 2, formas: ["plain_definition"] }]
  });
  introduction.microssequencia = "Aprender a associação";
  introduction.conteudo.title = "A associação focal";
  const application = pedagogicalUnit(1, {
    mode: "pratica",
    used: [1, 2]
  });
  application.microssequencia = "Usar e retomar a associação";
  application.conteudo.title = "Aplicar a associação";
  const revisit = pedagogicalUnit(2, {
    used: [1],
    explanations: [{ ideia: 2, formas: ["contrast"] }]
  });
  revisit.microssequencia = "Usar e retomar a associação";
  revisit.conteudo.title = "Retomar a associação por contraste";

  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [introduction, application, revisit]
  });

  assert.deepEqual(designReads, [{
    scopeKind: "didactic_microsequence",
    scopeRef: "micro-foundations"
  }, {
    scopeKind: "didactic_microsequence",
    scopeRef: "micro-application"
  }]);
  assert.equal(materializationReads.length, 1);
  const [introduced, used, revisited] = materializationReads[0].units;
  assert.equal(introduced.didacticMicrosequenceId, "micro-foundations");
  assert.deepEqual(introduced.designSnapshot.instructionalAnalysisUnitIds,
    [SECOND_ANALYSIS_ID]);
  assert.deepEqual(introduced.designApplication, {
    mode: "expository",
    introducedInstructionalAnalysisUnitIds: [SECOND_ANALYSIS_ID],
    usedInstructionalAnalysisUnitIds: [],
    explanationApplications: [{
      instructionalAnalysisUnitId: SECOND_ANALYSIS_ID,
      developedForms: ["plain_definition"],
      notApplicable: []
    }],
    practiceApplications: [],
    componentRefs: ["aralearn.resource.paragraph@1.0.0"]
  });
  assert.equal(used.didacticMicrosequenceId, "micro-application");
  assert.deepEqual(used.designSnapshot.instructionalAnalysisUnitIds,
    [ANALYSIS_ID, SECOND_ANALYSIS_ID]);
  assert.deepEqual(used.designApplication.usedInstructionalAnalysisUnitIds,
    [ANALYSIS_ID, SECOND_ANALYSIS_ID]);
  assert.deepEqual(used.designApplication.introducedInstructionalAnalysisUnitIds, []);
  assert.equal(revisited.didacticMicrosequenceId, "micro-application");
  assert.deepEqual(revisited.designApplication.introducedInstructionalAnalysisUnitIds, []);
  assert.deepEqual(revisited.designApplication.usedInstructionalAnalysisUnitIds,
    [ANALYSIS_ID]);
  assert.deepEqual(revisited.designApplication.explanationApplications, [{
    instructionalAnalysisUnitId: SECOND_ANALYSIS_ID,
    developedForms: ["contrast"],
    notApplicable: []
  }]);
});
