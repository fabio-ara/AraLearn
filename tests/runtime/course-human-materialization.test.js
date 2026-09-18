import { COURSE_DESIGN_PARAMETER_DEFINITIONS, COURSE_DESIGN_PARAMETER_CATALOG_VERSION } from "../../src/domain/courseDesignParameters.js";
import { fixtureAppliedParameters, courseDesignFixture } from "../helpers/courseDesignFixture.js";
import { reconciledExplanationFixture } from "../helpers/reconciledExplanationFixture.js";
import { defaultAuthoringProcessPreferences } from "../../src/domain/authoringProcessPreferences.js";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/catalog/resourceCatalog.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createAuthoringMcpHandler, ARALEARN_MCP_PROTOCOL_VERSION } from
  "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { resolveHumanCourseContext } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTaskExecutor.js";

import { materializeHumanCoursePart as materializeCompletePart, humanMaterializationUnitPlan,
  preflightHumanCourseMaterialization, reconcileHumanExplanation } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js";
import { toolErrorData } from "../../supabase/functions/_shared/aralearn-authoring/toolErrorEnvelope.js";
import { inspectExplanationReconciliation } from "../../src/domain/courseExplanationReconciliation.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
function explanationFixtures() {
  return [{ microssequencia: "DNS", conteudo: dnsExplanation(), fontes: [] }];
}
const materializeHumanCoursePart = materializeCompletePart;
const PART_ID = "20000000-0000-4000-8000-000000000001";
const ANALYSIS_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_ANALYSIS_ID = "30000000-0000-4000-8000-000000000002";
const EVIDENCE_ID = "30000000-0000-4000-8000-000000000003";
const CURRICULUM_SCOPE_ID = "50000000-0000-4000-8000-000000000001";
const PRINCIPAL = {
  actorId: "40000000-0000-4000-8000-000000000001",
  scopes: ["authoring:read", "authoring:write"]
};

function dnsExplanation() {
  return reconciledExplanationFixture([{ text: "O DNS associa nomes a endereços. Uma consulta usa o nome para obter a informação correspondente.",
    analysisUnitIds: [ANALYSIS_ID] }]);
}

function preflightBlocker(error, code) {
  assert.equal(error.code, "human_materialization_preflight_blocked");
  assert.equal(error.status, 422);
  assert.equal(error.details.preflight.state, "blocked");
  assert.equal(error.details.preflight.referencia, null);
  const blocker = error.details.preflight.blockers.find(item => item.code === code);
  assert.ok(blocker, `O preflight deve preservar a causa ${code}: ${JSON.stringify(error.details.preflight.blockers)}`);
  return blocker;
}

async function prepareMaterialization(adapter, units, options = {}) {
  const context = await resolveHumanCourseContext({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1 });
  return preflightHumanCourseMaterialization({ adapter, principal: PRINCIPAL, context,
    planUnits: units.map(humanMaterializationUnitPlan), ...options });
}

test("materialização pelo catálogo relê processo pessoal e mantém cadência, revisão e curso independentes", async () => {
  for (const focus of ["content", "full_cycle"]) {
    const adapter = adapterFixture(); const reads = [];
    adapter.getAuthoringProcessPreferences = async () => { reads.push("preferences"); return {
      contract: "aralearn.authoring-process-preferences.v1", revision: 2, updatedAt: "2026-09-09T00:00:00Z",
      preferences: { ...defaultAuthoringProcessPreferences(), focus, cadence: "batch", reviewPoints: [] }
    }; };
    const get = adapter.getCourseDesign;
    adapter.getCourseDesign = async request => request.scopeKind === "course"
      ? courseDesignFixture({ courseId: COURSE_ID }, { scope: "course", revision: 8 }) : get(request);
    const output = await executeHumanCourseTask({ adapter, principal: PRINCIPAL, name: "materializar_parte",
      rawArguments: { curso: "Curso de Redes", parte: 1, unidades: [unit()], explicacoes: explanationFixtures() } });
    assert.deepEqual(reads, ["preferences"]);
    assert.equal(output.context.processoCorrente.foco, focus);
    assert.equal(output.context.processoCorrente.cadencia, "batch");
    assert.deepEqual(output.context.processoCorrente.pontosDeRevisao, []);
    assert.match(output.nextDecision, focus === "content" ? /explicações e fontes/u : /ciclo autorizado/u);
    assert.equal(adapter.calls.length, 1);
    assert.equal(Object.hasOwn(adapter.calls[0], "preferences"), false);
    assert.equal(Object.hasOwn(adapter.calls[0], "reviewed"), false);
  }
});

test("Explicação incompleta bloqueia a gravação conjunta sem aprovar ou omitir apoio", async () => {
  for (const explanations of [undefined, [], [{ ...explanationFixtures()[0], fontes: {} }],
    [{ ...explanationFixtures()[0], conteudo: { title: "Apoio", content: [] } }]]) {
    const adapter = adapterFixture({ savedExplanation: false });
    await assert.rejects(() => materializeCompletePart({ adapter, principal: PRINCIPAL,
      course: "Curso de Redes", part: 1, units: [unit()], explanations }),
    error => Boolean(preflightBlocker(error, explanations?.length
      ? "invalid_human_explanation" : "human_materialization_missing_explanation")));
    assert.equal(adapter.calls.length, 0);
  }
});

test("Explicação conserva fonte e âncora na mesma operação das unidades", async () => {
  const adapter = adapterFixture();
  const support = explanationFixtures()[0];
  support.fontes = [{ fonte: "RFC 1035", relacao: "supported_by", papeis: ["tecnica_conceitual"],
    ancoras: ["Seção 2 — Introdução"], ocorrencias: [{ lugar: "conteudo", recurso: 1, folha: "text", trecho: "O DNS associa nomes a endereços." }] }];
  await materializeCompletePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
    units: [unit()], explanations: [support] });
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(adapter.calls[0].explanations[0].content, support.conteudo);
  assert.equal(adapter.calls[0].explanations[0].sourceLinks[0].sourceId, "source-rfc-1035");
  assert.deepEqual(adapter.calls[0].explanations[0].sourceLinks[0].anchors, [{ anchorId: "anchor-rfc-1035-section-2" }]);
});

test("explicação rejeita vínculo técnico genérico e reutiliza um PDF com âncoras distintas", async () => {
  const support = explanationFixtures()[0];
  const occurrence = { lugar: "conteudo", recurso: 1, folha: "text", trecho: "O DNS associa nomes a endereços." };
  for (const sourceLink of [
    { fonte: "RFC 1035", relacao: "informed_by", papeis: ["tecnica_conceitual"] },
    { fonte: "RFC 1035", relacao: "supported_by", papeis: ["tecnica_conceitual"], ocorrencias: [occurrence] },
    { fonte: "RFC 1035", relacao: "supported_by", papeis: ["escopo_curricular"], ocorrencias: [occurrence], ancoras: [1] }
  ]) {
    const adapter = adapterFixture();
    await assert.rejects(() => materializeCompletePart({ adapter, principal: PRINCIPAL,
      course: "Curso de Redes", part: 1, units: [unit()], explanations: [{ ...support, fontes: [sourceLink] }] }),
    error => Boolean(preflightBlocker(error, "incomplete_course_source_evidence")));
    assert.equal(adapter.calls.length, 0);
  }
  const adapter = adapterFixture();
  const readSources = adapter.getCourseSources;
  let detailReads = 0;
  const hash = "a".repeat(64);
  adapter.getCourseSources = async input => {
    const read = await readSources(input);
    if (input.mode === "source") {
      detailReads++;
      read.items[0].attachments = [{ contentHash: hash }];
      read.items[0].anchors = [
        { anchorId: "retired-anchor", status: "retired", humanLocator: "Antiga" },
        ...[2, 3].map(page => ({ anchorId: `pdf-page-${page}`, sourceRevision: 1, status: "active",
          contentHash: hash, humanLocator: `Página ${page}`, selector: { kind: "page_range", startPage: page, endPage: page } }))
      ];
    }
    return read;
  };
  await materializeCompletePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1, units: [unit()],
    explanations: [{ ...support, fontes: [2, 3].map((position, index) => ({ fonte: "RFC 1035", relacao: "supported_by",
      papeis: ["tecnica_conceitual"], ancoras: [position], ocorrencias: [{ ...occurrence,
        trecho: index ? "Uma consulta usa o nome para obter a informação correspondente." : occurrence.trecho }] })) }] });
  const links = adapter.calls[0].explanations[0].sourceLinks;
  assert.equal(detailReads, 2, "uma leitura para o preflight e outra para a escrita; nenhuma ingestão por citação");
  assert.equal(links[0].sourceId, links[1].sourceId);
  assert.deepEqual(links.map(link => link.anchors), [[{ anchorId: "pdf-page-2" }], [{ anchorId: "pdf-page-3" }]],
    "a posição consultada não muda quando há âncoras retiradas antes dela");
});

test("unidades reutilizam base salva antes da produção e vínculos exatos, sem pedir nova Explicação", async () => {
  const adapter = adapterFixture();
  const explanation = reconciledExplanationFixture([{ text: "Base salva anteriormente.  Relação: nome → endereço; P(A | B).",
    analysisUnitIds: [ANALYSIS_ID] }]);
  explanation.reconciliation.entries.push({ ...explanation.reconciliation.entries[0], path: "$",
    quote: "Base salva anteriormente. Relação: nome → endereço; P(A | B)." });
  const links = [{ linkId: "persisted-link", sourceId: "source-rfc-1035", relation: "supported_by", roles: ["technical_conceptual"],
    occurrences: [{ occurrenceId: "persisted-occurrence", slot: "content", resourceId: explanation.content[0].id,
      path: "text", quote: "nome → endereço", prefix: null, suffix: null }], anchors: [{ anchorId: "anchor-rfc-1035-section-2" }] }];
  const plan = adapter.getCourseInstructionalPlan.bind(adapter);
  adapter.getCourseInstructionalPlan = async (...args) => {
    const saved = await plan(...args);
    saved.plan.curriculum.modules[0].lessons[0].microsequences[0].explanation = structuredClone(explanation);
    return saved;
  };
  const sourceReads = [];
  const readSources = adapter.getCourseSources;
  adapter.getCourseSources = async request => {
    sourceReads.push(request);
    if (request.mode === "target") return { items: [{ sourceLinks: structuredClone(links) }] };
    return readSources(request);
  };
  await materializeCompletePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1, units: [unit()] });
  assert.equal(adapter.calls.length, 1);
  assert.equal(sourceReads.filter(read => read.mode === "target").length, 1);
  assert.equal(sourceReads[0].targetKind, "microsequence_explanation");
  assert.equal(sourceReads[0].targetId, "micro-dns");
  assert.equal(sourceReads[0].expectedRevision, 8);
  assert.deepEqual(adapter.calls[0].explanations, [], "base salva e seus vínculos são relidos sem reescrita");
  assert.deepEqual((await adapter.getCourseInstructionalPlan()).plan.curriculum.modules[0].lessons[0].microsequences[0].explanation, explanation);
  assert.equal(adapter.calls[0].units.length, 1);
});

test("base persistida não dispensa releitura completa de fontes antes de produzir unidades", async () => {
  const adapter = adapterFixture();
  const plan = adapter.getCourseInstructionalPlan.bind(adapter);
  adapter.getCourseInstructionalPlan = async (...args) => {
    const saved = await plan(...args);
    saved.plan.curriculum.modules[0].lessons[0].microsequences[0].explanation = explanationFixtures()[0].conteudo;
    return saved;
  };
  adapter.getCourseSources = async () => ({ items: [] });
  await assert.rejects(materializeCompletePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1, units: [unit()] }),
    error => Boolean(preflightBlocker(error, "course_service_unavailable")));
  assert.equal(adapter.calls.length, 0);
});

function adapterFixture({ savedExplanation = true } = {}) {
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
          curriculumMapStatus: "approved",
          curriculum: {
            modules: [{
              id: "module-network",
              position: 0,
              title: "Rede local",
              lessons: [{
                id: "lesson-network",
                position: 0,
                title: "Serviços de rede",
                microsequences: [{ id: "micro-dns", position: 0, title: "DNS",
                  ...(savedExplanation ? { explanation: dnsExplanation() } : {}) }]
              }]
            }]
          },
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
      if (mode === "target") return { items: [{ sourceLinks: [] }], nextCursor: null };
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
        parameters: fixtureAppliedParameters([
          ["new_analysis_unit_ceiling_per_expository_study_unit", 1],
          ["required_explanation_forms", ["plain_definition"]],
          ["minimum_distinct_practice_opportunities_per_evidence_requirement", 1],
          ["required_practice_variation_dimensions", ["case_or_data"]],
          ["authoring_chat_response_word_target", 90],
          ["study_unit_content_word_target", 180]
        ], { origin: "author" }),
        guidance: {
          effectiveAssignments: [{
            guidance: "Parágrafos curtos, sem eliminar explicações necessárias.",
            origin: "author",
            sourceScope: { kind: "didactic_microsequence", ref: "micro-dns" }
          }]
        },
        componentPolicy: {
          effectiveAssignment: {
            policy: { catalogVersion: "fixture", availability: "all", allowedRefs: [], excludedRefs: [], preferredRefs: [] },
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
      praticas: [],
      cobertura: []
    },
    fontes
  };
}

function persistedStudyUnit(id, position, { introduced = [ANALYSIS_ID], used = [], forms = ["plain_definition", "mechanism"],
  snapshotAnalysis = [ANALYSIS_ID], content = unit().conteudo } = {}) {
  const parameters = fixtureAppliedParameters([
    ["new_analysis_unit_ceiling_per_expository_study_unit", 1], ["required_explanation_forms", forms],
    ["minimum_distinct_practice_opportunities_per_evidence_requirement", 1],
    ["required_practice_variation_dimensions", ["case_or_data"]],
    ["authoring_chat_response_word_target", 90], ["study_unit_content_word_target", 180]
  ], { origin: "author" });
  return {
    studyUnit: { ...structuredClone(content), id, position },
    curriculumPath: { didacticMicrosequence: { id: "micro-dns", position: 0, title: "DNS" } },
    designApplication: { mode: "expository", introducedInstructionalAnalysisUnitIds: [...introduced],
      usedInstructionalAnalysisUnitIds: [...used], explanationApplications: introduced.map(instructionalAnalysisUnitId =>
        ({ instructionalAnalysisUnitId, developedForms: [...forms], notApplicable: [] })),
      curriculumScopeItemIds: [], practiceApplications: [], componentRefs: ["aralearn.resource.paragraph@1.0.0"] },
    designSnapshot: { contract: "aralearn.study-unit-design-snapshot.v2",
      parameterCatalogVersion: COURSE_DESIGN_PARAMETER_CATALOG_VERSION, didacticMicrosequenceId: "micro-dns",
      instructionalAnalysisUnitIds: [...snapshotAnalysis], evidenceRequirementIds: [],
      parameters: parameters.map(({ parameterId, effectiveAssignment: assignment }) => ({ parameterId,
        value: assignment.value, origin: assignment.origin, reason: assignment.reason, sourceScopeKind: assignment.sourceScope.kind })),
      editorialDirections: [], componentPolicy: { policy: { catalogVersion: "fixture", availability: "all",
        allowedRefs: [], excludedRefs: [], preferredRefs: [] }, origin: "system_default", sourceScopeKind: null } }
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
      curriculumMapStatus: "approved",
      curriculum: {
        modules: [{
          id: "module-network",
          position: 0,
          title: "Rede local",
          lessons: [{
            id: "lesson-network",
            position: 0,
            title: "Serviços de rede",
            microsequences: [{ id: "micro-dns", position: 0, title: "DNS",
              explanation: reconciledExplanationFixture([
                ...analysis.map(item => ({ text: `${item.statement} ${item.description}`, analysisUnitIds: [item.id] })),
                ...(withEvidence ? [{ text: "Classifique o caso de rede a partir dos dados disponíveis.",
                  role: "support", evidenceRequirementIds: [EVIDENCE_ID] }] : []),
                ...(!analysis.length && !withEvidence ? [{ text: "Use os dados apresentados para rever sua decisão.", role: "support" }] : [])
              ]) }]
          }]
        }]
      },
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
    parameters: fixtureAppliedParameters([
      ["new_analysis_unit_ceiling_per_expository_study_unit", ceiling],
      ["required_explanation_forms", ["plain_definition", "mechanism"]],
      ["minimum_distinct_practice_opportunities_per_evidence_requirement", 2],
      ["required_practice_variation_dimensions", ["case_or_data", "context"]],
      ["authoring_chat_response_word_target", 100],
      ["study_unit_content_word_target", 200]
    ], { origin: "automatic" }),
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
    value.conteudo.feedback = [{ id: `feedback-${position}`, package: "aralearn.resource.paragraph", version: "1.0.0",
      data: { text: "A alternativa correta preserva a relação explicada. A outra alternativa inverte essa relação." } }];
  }
  value.aplicacaoPedagogica = {
    ideiasIntroduzidas: novelty,
    ideiasUtilizadas: used,
    explicacoes: explanations,
    praticas: practices,
    cobertura: []
  };
  return value;
}

test("#272 materializa Parte com Fonte/Âncora sem IDs, fences, steps ou requestIds públicos", async () => {
  const adapter = adapterFixture();
  adapter.publicAppUrl = "https://aralearn.example/app";
  const receipt = await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    complete: true,
    units: [unit([{
      fonte: "RFC 1035",
      relacao: "supported_by",
      papeis: ["tecnica_conceitual"],
      ancoras: ["Seção 2 — Introdução"],
      ocorrencias: [{ lugar: "conteudo", recurso: 1, folha: "text", trecho: "Um resolvedor consulta registros para obter o endereço associado." }]
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
  assert.equal(typeof stored.sourceLinks[0].linkId, "string");
  assert.deepEqual(stored.sourceLinks, [{
    linkId: stored.sourceLinks[0].linkId,
    roles: ["technical_conceptual"],
    occurrences: [{ occurrenceId: stored.sourceLinks[0].occurrences[0].occurrenceId, slot: "content", resourceId: "dns-paragraph", path: "text",
      quote: "Um resolvedor consulta registros para obter o endereço associado.", prefix: null, suffix: null }],
    sourceId: "source-rfc-1035",
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-rfc-1035-section-2" }]
  }]);
  assert.equal(receipt.result, "Primeira parte produzida.");
  assert.equal(receipt.deepLink, `https://aralearn.example/app/#/authoring/courses/${COURSE_ID}?section=content&authoringPartId=${PART_ID}`);
  assert.match(receipt.nextDecision, /Leia o percurso salvo/u);
  assert.deepEqual(write.explanations, [], "a Explicação persistida não é reenviada na escrita de unidades");
  assert.equal(receipt.context.distribuicaoDaPratica[0].observacao.studyUnitCount, 1);
  assert.equal(JSON.stringify({ ...receipt, deepLink: null, links: [] }).includes(COURSE_ID), false);
});

for (const authenticationKind of ["oauth", "action"]) test(`materialização ${authenticationKind} devolve a parte em conteúdo sem herdar link de observações`, async () => {
  const adapter = adapterFixture();
  adapter.publicAppUrl = "https://aralearn.example/app/";
  const materialize = adapter.materializeCourseAuthoringPart;
  adapter.materializeCourseAuthoringPart = async (request) => ({
    ...await materialize(request), deepLink: `${adapter.publicAppUrl}#/authoring/courses/${COURSE_ID}?section=review`
  });
  const receipt = await materializeHumanCoursePart({ adapter, principal: { ...PRINCIPAL, authenticationKind },
    course: "Curso de Redes", part: 1, units: [unit()] });
  assert.equal(receipt.deepLink,
    `https://aralearn.example/app/#/authoring/courses/${COURSE_ID}?section=content&authoringPartId=${PART_ID}`);
});

test("nova materialização rejeita resposta aberta no preflight sem gravação", async () => {
  const adapter = adapterFixture();
  const practice = {
    microssequencia: "DNS",
    posicao: 2,
    conteudo: {
      title: "Explique a decisão do resolvedor",
      role: "practice",
      content: [{
        id: "contexto-consulta",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "O resolvedor recebeu um nome e precisa obter o endereço associado." }
      }],
      response: {
        id: "resposta-explicada",
        package: "aralearn.response.open",
        version: "1.0.0",
        data: {
          prompt: "Explique com suas palavras a relação entre o nome consultado e o endereço devolvido."
        }
      },
      feedback: [],
      topics: ["DNS"]
    },
    aplicacaoPedagogica: {
      ideiasIntroduzidas: [],
      ideiasUtilizadas: ["DNS associa nomes a endereços."],
      explicacoes: [],
      praticas: [],
      cobertura: []
    },
    fontes: []
  };

  await assert.rejects(() => materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit(), practice],
    explanations: explanationFixtures()
  }), error => Boolean(preflightBlocker(error, "practice_response_legacy_only")));
  assert.deepEqual(adapter.calls, []);
});

test("#303 materialização aceita os5 pacotes ferramenta pelo contrato comum sem writer por tipo", async () => {
  const adapter = adapterFixture();
  const value = unit();
  const additions = ["calculator", "grammar", "dictionary", "reading", "audio"].map(id => {
    const definition = RESOURCE_PACKAGE_REGISTRY.get(`aralearn.resource.${id}`, "1.0.0");
    return { id: `tool-${id}`, package: definition.manifest.id, version: definition.manifest.version,
      data: structuredClone(definition.authoringContract.example) };
  });
  value.conteudo.content.push(...additions);
  await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1, units: [value] });
  assert.equal(adapter.calls.length, 1);
  const stored = adapter.calls[0].units[0];
  assert.deepEqual(stored.content.content.slice(1), additions);
  for (const resource of additions) assert.ok(stored.designApplication.componentRefs.includes(`${resource.package}@${resource.version}`));
});

test("erro de elemento repetido orienta a retomada sem expor sua identificação interna", async () => {
  const repeated = pedagogicalUnit(2, { mode: "pratica" });
  repeated.conteudo.response.id = repeated.conteudo.content[0].id;

  await assert.rejects(() => materializeHumanCoursePart({
    adapter: adapterFixture(),
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit(), repeated]
  }), (error) => {
    const blocker = preflightBlocker(error, "invalid_human_study_unit");
    assert.match(blocker.message, /repete.*refaça/iu);
    assert.doesNotMatch(blocker.message, new RegExp(repeated.conteudo.response.id, "u"));
    assert.doesNotMatch(blocker.message, /identificador local|\$\.|\.id\b/iu);
    return true;
  });
});

test("parâmetro automático pendente exige escolha contextual justificada do agente", async (t) => {
  for (const definition of COURSE_DESIGN_PARAMETER_DEFINITIONS) await t.test(definition.id, async () => {
    const value = adapterFixture();
    const inheritedDesign = value.getCourseDesign;
    let contextualValue;
    value.getCourseDesign = async (...args) => {
      const design = await inheritedDesign(...args);
      const target = design.parameters.find(({ parameterId }) => parameterId === definition.id);
      contextualValue = structuredClone(target.effectiveAssignment.value);
      target.effectiveAssignment = {
        mode: "automatic", value: null, origin: "system_default",
        reason: "Escolha contextual ainda não realizada.", sourceScope: null
      };
      return design;
    };
    const candidate = unit();
    delete candidate.configuracao;

    const blocked = await prepareMaterialization(value, [candidate]);
    assert.equal(blocked.state, "blocked");
    assert.ok(blocked.blockers.some(({ code }) =>
      code === "human_materialization_contextual_calibration_required"));
    assert.deepEqual(value.calls, []);

    candidate.configuracao = {
      motivo: `Escolha contextual do agente para ${definition.label} nesta unidade.`,
      parametros: { [definition.humanField]: contextualValue }
    };
    const ready = await prepareMaterialization(value, [candidate]);
    assert.equal(ready.state, "ready", JSON.stringify(ready.blockers));
    await materializeHumanCoursePart({
      adapter: value,
      principal: PRINCIPAL,
      course: "Curso de Redes",
      part: 1,
      units: [candidate],
      preparationReference: ready.referencia
    });

    const applied = value.calls[0].units[0].designSnapshot.parameters
      .find(({ parameterId }) => parameterId === definition.id);
    assert.deepEqual(applied.value, contextualValue);
    assert.equal(applied.origin, "automatic");
    assert.equal(applied.reason, candidate.configuracao.motivo);
  });
});
test("MCP aceita escolha contextual explícita e distingue indisponibilidade de leitura", async () => {
  for (const unavailable of [false, true]) {
    const adapter = adapterFixture();
    adapter.resolvePrincipal = async () => ({ ...PRINCIPAL, authenticationKind: "oauth" });
    adapter.getAuthoringProcessPreferences = async () => ({
      contract: "aralearn.authoring-process-preferences.v1", revision: 2, updatedAt: "2026-09-09T00:00:00Z",
      preferences: defaultAuthoringProcessPreferences()
    });
    const readDesign = adapter.getCourseDesign;
    adapter.getCourseDesign = async request => {
      if (request.scopeKind === "course") return courseDesignFixture({ courseId: COURSE_ID }, { scope: "course", revision: 8 });
      if (unavailable) throw new AuthoringApiError(503, "course_service_unavailable", "Leitura indisponível.");
      const design = await readDesign(request);
      design.parameters.find(({ parameterId }) => parameterId ===
        "minimum_distinct_practice_opportunities_per_evidence_requirement").effectiveAssignment = {
        mode: "automatic", value: null, origin: "system_default",
        reason: "Escolha contextual ainda não realizada.", sourceScope: null
      };
      return design;
    };
    const candidate = unit();
    candidate.configuracao = {
      motivo: "Uma oportunidade basta nesta unidade expositiva, que não contém prática avaliativa.",
      parametros: { oportunidades_distintas_por_requisito: 1 }
    };
    const resourceUrl = "https://edge.example/functions/v1/aralearn-authoring-mcp";
    const handler = createAuthoringMcpHandler({ adapter, resourceUrl,
      allowedOrigins: new Set(["https://chatgpt.com"]), authorizationServer: "https://project.example/auth/v1" });
    const response = await handler(new Request(resourceUrl, { method: "POST", headers: {
      Origin: "https://chatgpt.com", Authorization: "Bearer synthetic-token",
      Accept: "application/json, text/event-stream", "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
      name: "materializar_parte", arguments: { curso: "Curso de Redes", parte: 1,
        unidades: [candidate], explicacoes: explanationFixtures() }
    } }) }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.result.isError, unavailable);
    if (unavailable) {
      assert.equal(payload.result.structuredContent.error.code, "temporarily_unavailable");
      assert.equal(payload.result.structuredContent.error.retryable, true);
      assert.deepEqual(adapter.calls, []);
    } else {
      assert.equal(adapter.calls.length, 1);
      const applied = adapter.calls[0].units[0].designSnapshot.parameters.find(({ parameterId }) =>
        parameterId === "minimum_distinct_practice_opportunities_per_evidence_requirement");
      assert.equal(applied.value, 1);
      assert.equal(applied.reason, candidate.configuracao.motivo);
      assert.equal(payload.result.structuredContent.context.completion, "partial");
    }
  }
});
test("o modo pedagógico é derivado do conteúdo e das aplicações sem decisão duplicada", async () => {
  const expositoryAdapter = adapterFixture();
  const expository = unit();
  delete expository.aplicacaoPedagogica.modo;
  await materializeHumanCoursePart({
    adapter: expositoryAdapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [expository]
  });
  assert.equal(
    expositoryAdapter.calls[0].units[0].designApplication.mode,
    "expository"
  );

  const practiceAdapter = pedagogicalAdapter({ analysisCount: 0 });
  const practice = pedagogicalUnit(1, { mode: "pratica" });
  delete practice.aplicacaoPedagogica.modo;
  await materializeHumanCoursePart({
    adapter: practiceAdapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [practice]
  });
  assert.equal(
    practiceAdapter.calls[0].units[0].designApplication.mode,
    "practice"
  );

  const mixedAdapter = pedagogicalAdapter({ analysisCount: 1, withEvidence: true });
  const mixed = pedagogicalUnit(1, {
    mode: "mista",
    novelty: [1],
    explanations: [{ ideia: 1, formas: ["plain_definition", "mechanism"] }],
    practices: [{
      requisito: 1,
      oportunidade: "prever-com-pista",
      dimensoesVariadas: ["case_or_data"]
    }, {
      requisito: 1,
      oportunidade: "prever-sem-pista",
      dimensoesVariadas: ["context"]
    }]
  });
  delete mixed.aplicacaoPedagogica.modo;
  await materializeHumanCoursePart({
    adapter: mixedAdapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [mixed]
  });
  assert.equal(
    mixedAdapter.calls[0].units[0].designApplication.mode,
    "mixed"
  );
});

test("preflight exige requisito persistido antes da prática sem criá-lo na materialização", async () => {
  const value = pedagogicalAdapter({ analysisCount: 0, withEvidence: false });
  const requirement =
    "Prever a porta de saída e justificar a decisão a partir da tabela MAC.";
  const practice = pedagogicalUnit(1, {
    mode: "pratica",
    practices: [{
      requisito: requirement,
      oportunidade: "tabela-vazia-com-pista",
      dimensoesVariadas: ["case_or_data"]
    }, {
      requisito: requirement,
      oportunidade: "tabela-alterada-sem-pista",
      dimensoesVariadas: ["context"]
    }]
  });
  delete practice.aplicacaoPedagogica.modo;
  practice.conteudo.title = "Decida a porta depois que a tabela mudou";
  practice.conteudo.content[0].data.text =
    "O switch recebeu um quadro pela porta 1 e sua tabela associa o destino à porta 3.";
  practice.conteudo.response.data.question =
    "Por qual porta o quadro deve sair? Justifique usando o estado da tabela.";
  practice.configuracao = {
    motivo: "Escolha contextual sintética deste teste.",
    parametros: {
      maximo_ideias_novas_por_unidade: 1,
      formas_de_explicacao: ["plain_definition", "mechanism"],
      oportunidades_distintas_por_requisito: 2,
      dimensoes_de_variacao_da_pratica: ["case_or_data", "context"],
      alvo_palavras_conversa: 100,
      alvo_palavras_unidade: 200
    }
  };

  await assert.rejects(() => materializeHumanCoursePart({
    adapter: value, principal: PRINCIPAL, course: "Curso de Redes", part: 1, units: [practice]
  }), error => Boolean(preflightBlocker(error, "human_reference_not_found")));
  assert.deepEqual(value.calls, []);

});

test("calibração contextual pode variar uma unidade nova sem substituir condição fixa", async () => {
  const adapter = pedagogicalAdapter({ ceiling: 1, analysisCount: 2 });
  const content = pedagogicalUnit(1, {
    novelty: [1, 2],
    explanations: [{
      ideia: 1,
      formas: ["plain_definition", "mechanism"]
    }, {
      ideia: 2,
      formas: ["plain_definition", "mechanism"]
    }]
  });
  content.configuracao = {
    motivo: "Escolha contextual sintética deste teste.",
    parametros: {
      maximo_ideias_novas_por_unidade: 2,
      formas_de_explicacao: ["plain_definition", "mechanism"],
      oportunidades_distintas_por_requisito: 2,
      dimensoes_de_variacao_da_pratica: ["case_or_data", "context"],
      alvo_palavras_conversa: 100,
      alvo_palavras_unidade: 260
    },
    direcaoEditorial: "Conserve as duas ideias relacionadas no mesmo exemplo em evolução."
  };

  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [content]
  });
  const snapshot = adapter.calls[0].units[0].designSnapshot;
  const effective = new Map(snapshot.parameters.map((parameter) => [
    parameter.parameterId,
    parameter
  ]));
  assert.deepEqual(effective.get(
    "new_analysis_unit_ceiling_per_expository_study_unit"
  ), {
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 2,
    origin: "automatic",
    reason: "Escolha contextual sintética deste teste.",
    sourceScopeKind: "study_unit"
  });
  assert.equal(effective.get("study_unit_content_word_target").value, 260);
  assert.deepEqual(snapshot.editorialDirections.at(-1), {
    direction: "Conserve as duas ideias relacionadas no mesmo exemplo em evolução.",
    origin: "automatic",
    sourceScopeKind: "study_unit"
  });

  const fixedAdapter = pedagogicalAdapter({ ceiling: 1, analysisCount: 2 });
  const readDesign = fixedAdapter.getCourseDesign;
  fixedAdapter.getCourseDesign = async (request) => {
    const design = await readDesign(request);
    const ceiling = design.parameters.find(({ parameterId }) =>
      parameterId === "new_analysis_unit_ceiling_per_expository_study_unit");
    ceiling.effectiveAssignment = {
      mode: "fixed", value: 1,
      origin: "research_condition",
      sourceScope: { kind: "didactic_microsequence", ref: "micro-dns" }
    };
    return design;
  };
  await assert.rejects(() => materializeHumanCoursePart({
    adapter: fixedAdapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [content]
  }), (error) => Boolean(preflightBlocker(error, "human_materialization_fixed_configuration_conflict")));
  assert.deepEqual(fixedAdapter.calls, []);
});

test("preflight exige repertório persistido e vinculado sem criação implícita na escrita", async () => {
  const value = adapterFixture();
  value.getCourseInstructionalPlan = async () => ({
    contract: "aralearn.course-instructional-plan.v3",
    courseRevision: 8,
    plan: {
      version: 3,
      title: "Curso de Redes",
      curriculumMapStatus: "approved",
      curriculum: {
        modules: [{
          id: "module-network",
          position: 0,
          title: "Rede local",
          lessons: [{
            id: "lesson-network",
            position: 0,
            title: "Serviços de rede",
            microsequences: [{ id: "micro-dns", position: 0, title: "DNS" }]
          }]
        }]
      },
      instructionalAnalysisUnits: [],
      evidenceRequirements: [],
      parts: [{
        id: PART_ID,
        position: 0,
        title: "Fundamentos",
        version: 2,
        microsequences: [{ id: "micro-dns", productionPosition: 0, title: "DNS" }]
      }]
    }
  });
  const inheritedDesign = value.getCourseDesign;
  value.getCourseDesign = async () => ({
    ...await inheritedDesign(),
    targetPlanItems: {
      instructionalAnalysisUnitIds: [],
      evidenceRequirementIds: []
    }
  });
  const firstUnit = unit();
  firstUnit.aplicacaoPedagogica.ideiasIntroduzidas = [{
    nome: "associação entre nome e endereço",
    descricao: "Relação pela qual uma consulta de nome devolve um endereço utilizável."
  }];
  firstUnit.aplicacaoPedagogica.explicacoes[0].ideia =
    "associação entre nome e endereço";

  await assert.rejects(() => materializeHumanCoursePart({
    adapter: value, principal: PRINCIPAL, course: "Curso de Redes", part: 1, units: [firstUnit]
  }), error => Boolean(preflightBlocker(error, "human_reference_not_found")));
  assert.deepEqual(value.calls, []);

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
      papeis: ["tecnica_conceitual"],
      ancoras: ["Seção inexistente"]
    }])]
  }), (error) => Boolean(preflightBlocker(error, "human_reference_not_found")));
  assert.deepEqual(adapter.calls, []);
});

test("#302 materialização conserva dois usos da mesma fonte, trecho literal e identidade própria", async () => {
  const adapter = adapterFixture();
  await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
    units: [unit([
      { fonte: "RFC 1035", relacao: "informed_by", papeis: ["leitura_complementar"] },
      { fonte: "RFC 1035", relacao: "quoted_from", papeis: ["tecnica_conceitual"], ancoras: [1],
        ocorrencias: [{ lugar: "conteudo", recurso: 1, folha: "text", trecho: "registros", prefixo: "consulta ", sufixo: " para obter" }] }
    ])] });
  const links = adapter.calls[0].units[0].sourceLinks;
  assert.equal(links.length, 2);
  assert.equal(links[0].sourceId, links[1].sourceId);
  assert.notEqual(links[0].linkId, links[1].linkId);
  assert.deepEqual(links[0].anchors, [], "não escolher a única âncora automaticamente");
  assert.deepEqual(links[0].roles, ["recommended_reading"]);
  assert.equal(links[1].occurrences[0].resourceId, "dns-paragraph");
  assert.equal(links[1].occurrences[0].quote, "registros");
  assert.equal(links[1].occurrences[0].path, "text");
  assert.equal(Object.hasOwn(links[1].occurrences[0], "status"), false);
});

test("fonte sem localização confirmada permanece não verificada e não exige âncora inventada", async () => {
  const withoutAnchors = () => {
    const value = adapterFixture();
    const readSources = value.getCourseSources;
    value.getCourseSources = async (request) => {
      const response = await readSources(request);
      if (request.mode !== "source") return response;
      return {
        ...response,
        items: response.items.map((source) => ({ ...source, anchors: [] }))
      };
    };
    return value;
  };

  const safe = withoutAnchors();
  await materializeHumanCoursePart({
    adapter: safe,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit([{
      fonte: "RFC 1035",
      relacao: "needs_verification",
      papeis: ["tecnica_conceitual"]
    }])]
  });
  assert.deepEqual(safe.calls[0].units[0].sourceLinks, [{
    linkId: safe.calls[0].units[0].sourceLinks[0].linkId,
    roles: ["technical_conceptual"],
    occurrences: [],
    sourceId: "source-rfc-1035",
    relation: "needs_verification",
    anchors: []
  }]);

  const unsafe = withoutAnchors();
  await assert.rejects(() => materializeHumanCoursePart({
    adapter: unsafe,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit([{
      fonte: "RFC 1035",
      relacao: "quoted_from",
      papeis: ["tecnica_conceitual"]
    }])]
  }), (error) => {
    const blocker = preflightBlocker(error, "invalid_human_source_anchor");
    assert.match(blocker.message, /citação direta exige/iu);
    return true;
  });
  assert.deepEqual(unsafe.calls, []);
});

test("#272 IDs de Fonte e Âncora não voltam a ser referências humanas", async () => {
  for (const fontes of [[{
    fonte: "source-rfc-1035",
    relacao: "supported_by",
      papeis: ["tecnica_conceitual"],
    ancoras: ["Seção 2 — Introdução"]
  }], [{
    fonte: "RFC 1035",
    relacao: "supported_by",
      papeis: ["tecnica_conceitual"],
    ancoras: ["anchor-rfc-1035-section-2"]
  }]]) {
    const adapter = adapterFixture();
    await assert.rejects(() => materializeHumanCoursePart({
      adapter,
      principal: PRINCIPAL,
      course: "Curso de Redes",
      part: 1,
      units: [unit(fontes)]
    }), (error) => Boolean(preflightBlocker(error, "human_reference_not_found")));
    assert.deepEqual(adapter.calls, []);
  }
});

test("#272 valida todas as Units antes de iniciar uma materialização", async () => {
  const adapter = adapterFixture();
  const invalid = unit();
  invalid.posicao = 2;
  invalid.conteudo = { title: "Unidade incompleta" };
  invalid.aplicacaoPedagogica.ideiasIntroduzidas = [];
  invalid.aplicacaoPedagogica.explicacoes = [];
  await assert.rejects(() => materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [unit(), invalid]
  }), (error) => Boolean(preflightBlocker(error, "invalid_human_study_unit")));
  assert.deepEqual(adapter.calls, []);
});

test("materialização atômica exige ao menos uma Unit de cada Microssequência da Parte", async () => {
  const adapter = adapterFixture();
  const currentPlan = await adapter.getCourseInstructionalPlan();
  currentPlan.plan.curriculum.modules[0].lessons[0].microsequences.push({ id: "micro-pratica", position: 1,
    title: "Prática", explanation: reconciledExplanationFixture([{ text: "Compare as decisões descritas na atividade.", role: "support" }]) });
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
    complete: true,
    units: [unit()]
  }), (error) => Boolean(preflightBlocker(error, "human_materialization_incomplete_part")));
  assert.deepEqual(adapter.calls, []);
});

test("revisão explícita reutiliza identidade e conserva conteúdo da unidade omitida", async () => {
  const reusedId = "70000000-0000-4000-8000-000000000001";
  const retainedId = "70000000-0000-4000-8000-000000000002";
  const adapter = adapterFixture();
  const persisted = [persistedStudyUnit(reusedId, 1),
    persistedStudyUnit(retainedId, 2, { introduced: [], used: [ANALYSIS_ID] })];
  const before = structuredClone(persisted);
  const reads = [];
  adapter.listCourseStudyUnits = async options => {
    reads.push(structuredClone(options));
    return { items: structuredClone(persisted), hasMore: false, nextCursor: null };
  };
  const replacement = { ...unit(), unidade: 1 };
  const ready = await prepareMaterialization(adapter, [replacement]);
  assert.equal(ready.state, "ready");
  await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
    units: [replacement], preparationReference: ready.referencia });
  const write = adapter.calls[0];
  assert.equal(write.units.length, 1);
  assert.equal(write.units[0].studyUnitId, reusedId);
  assert.deepEqual([...write.placements].sort((left, right) => left.position - right.position), [
    { studyUnitId: reusedId, didacticMicrosequenceId: "micro-dns", position: 1 },
    { studyUnitId: retainedId, didacticMicrosequenceId: "micro-dns", position: 2 }
  ]);
  assert.deepEqual(write.explanations, []);
  assert.deepEqual(persisted, before);
  assert.ok(reads.every(read => read.scopeKind === "authoring_part" && read.scopeId === PART_ID));
});

test("nova unidade ocupa posição final e desloca omitidas sem sobrescrever seus conteúdos", async () => {
  const adapter = adapterFixture();
  const savedId = "70000000-0000-4000-8000-000000000001";
  const saved = persistedStudyUnit(savedId, 1);
  adapter.listCourseStudyUnits = async () => ({ items: [structuredClone(saved)], hasMore: false, nextCursor: null });
  const inserted = pedagogicalUnit(1, { mode: "pratica" });
  await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
    units: [inserted], complete: false });
  const write = adapter.calls[0];
  assert.equal(write.complete, false);
  assert.equal(write.units.length, 1);
  assert.notEqual(write.units[0].studyUnitId, savedId, "sem unidade explícita não reutiliza o slot ocupado");
  assert.deepEqual([...write.placements].sort((left, right) => left.position - right.position), [
    { studyUnitId: write.units[0].studyUnitId, didacticMicrosequenceId: "micro-dns", position: 1 },
    { studyUnitId: savedId, didacticMicrosequenceId: "micro-dns", position: 2 }
  ]);
  assert.deepEqual(write.explanations, []);
  assert.equal(saved.studyUnit.position, 1, "leitura original permanece imutável");
});

test("preflight acumulado conserva exigências aplicadas às omitidas após mudança da intenção corrente", async () => {
  const adapter = adapterFixture();
  const saved = persistedStudyUnit("70000000-0000-4000-8000-000000000001", 1);
  saved.designApplication.explanationApplications[0].developedForms = ["plain_definition"];
  adapter.listCourseStudyUnits = async () => ({ items: [structuredClone(saved)], hasMore: false, nextCursor: null });
  const getDesign = adapter.getCourseDesign;
  adapter.getCourseDesign = async request => {
    assert.notEqual(request.scopeKind, "study_unit", "unidade omitida usa snapshot persistido, não intenção nova");
    const design = await getDesign(request);
    design.parameters.find(parameter => parameter.parameterId === "required_explanation_forms").effectiveAssignment.value = ["plain_definition"];
    return design;
  };
  const next = { ...unit(), posicao: 2, aplicacaoPedagogica: { ideiasIntroduzidas: [], ideiasUtilizadas: ["O DNS associa nomes a endereços."],
    explicacoes: [], praticas: [], cobertura: [] } };
  // Use the same observed reference as the rest of this fixture.
  next.aplicacaoPedagogica.ideiasUtilizadas = [unit().aplicacaoPedagogica.ideiasIntroduzidas[0]];
  const blocked = await prepareMaterialization(adapter, [next], { complete: true });
  assert.equal(blocked.state, "blocked");
  assert.ok(blocked.blockers.some(item => item.code === "human_materialization_missing_explanation_form"));
  saved.designApplication.explanationApplications[0].developedForms.push("mechanism");
  const ready = await prepareMaterialization(adapter, [next], { complete: true });
  assert.equal(ready.state, "ready", JSON.stringify(ready.blockers));
  await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
    units: [next], complete: true, preparationReference: ready.referencia });
  assert.equal(adapter.calls.length, 1);
});


function unitScopedPedagogicalAdapter({
  blockedComponent = false,
  existingOrigin = "research_condition"
} = {}) {
  const value = pedagogicalAdapter({ ceiling: 2, analysisCount: 2, withEvidence: true });
  const inheritedDesign = value.getCourseDesign;
  const studyUnitId = "70000000-0000-4000-8000-000000000001";
  value.listCourseStudyUnits = async () => ({
    items: [persistedStudyUnit(studyUnitId, 1, { forms: ["contrast"], snapshotAnalysis: [ANALYSIS_ID, SECOND_ANALYSIS_ID] })],
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
      ["required_practice_variation_dimensions", ["support_level"]],
      ["authoring_chat_response_word_target", 72],
      ["study_unit_content_word_target", 140]
    ]);
    design.parameters = design.parameters.map((parameter) => ({
      ...parameter,
      effectiveAssignment: {
        mode: existingOrigin === "automatic" ? "automatic" : "fixed",
        value: values.has(parameter.parameterId) ? values.get(parameter.parameterId) : parameter.effectiveAssignment.value,
        reason: "Condição sintética preservada.",
        origin: existingOrigin,
        sourceScope: COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameter.parameterId)
          .supportedScopes.includes("study_unit")
          ? { kind: "study_unit", ref: studyUnitId } : { kind: "course", ref: COURSE_ID }
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
      origin: existingOrigin,
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
    { ...pedagogicalUnit(1, {
      mode: "mista",
      novelty: [1],
      explanations: [explanation(1, existingForms)],
      practices: existingPractices.map(practice)
    }), unidade: 1 },
    pedagogicalUnit(2, {
      novelty: [2],
      explanations: [explanation(2, ["plain_definition", "mechanism"])]
    })
  ];
}

test("configuração completa preserva condição fixa e sela a calibração da unidade nova", async () => {
  const adapter = unitScopedPedagogicalAdapter();
  const units = unitScopedMaterialization();
  units[0].configuracao = {
    motivo: "Escolha contextual sintética deste teste.",
    parametros: {
      maximo_ideias_novas_por_unidade: 1,
      formas_de_explicacao: ["contrast"],
      oportunidades_distintas_por_requisito: 3,
      dimensoes_de_variacao_da_pratica: ["support_level"],
      alvo_palavras_conversa: 72,
      alvo_palavras_unidade: 140
    }
  };
  units[1].configuracao = {
    motivo: "Escolha contextual sintética deste teste.",
    parametros: {
      maximo_ideias_novas_por_unidade: 2,
      formas_de_explicacao: ["plain_definition", "mechanism"],
      oportunidades_distintas_por_requisito: 2,
      dimensoes_de_variacao_da_pratica: ["case_or_data", "context"],
      alvo_palavras_conversa: 100,
      alvo_palavras_unidade: 200
    }
  };
  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units
  });
  const [existing, created] = adapter.calls[0].units;
  assert.equal(existing.studyUnitId, "70000000-0000-4000-8000-000000000001");
  assert.equal(existing.designSnapshot.parameters.every(({ origin }) =>
    origin === "research_condition"), true);
  assert.equal(existing.designSnapshot.parameters.every(({ parameterId, sourceScopeKind }) =>
    sourceScopeKind === (COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameterId)
      .supportedScopes.includes("study_unit") ? "study_unit" : "course")), true);
  assert.equal(existing.designSnapshot.componentPolicy.sourceScopeKind, "study_unit");
  assert.equal(created.designSnapshot.parameters.every(({ origin }) =>
    origin === "automatic"), true);
  assert.equal(created.designSnapshot.parameters.every(({ sourceScopeKind }) =>
    ["study_unit", "didactic_microsequence", "course"].includes(sourceScopeKind)), true);
});

test("revisão de unidade existente reproduz a configuração vigente em vez de prometer recalibração", async () => {
  const adapter = unitScopedPedagogicalAdapter({ existingOrigin: "automatic" });
  const units = unitScopedMaterialization();
  units[0].configuracao = {
    motivo: "Escolha contextual sintética deste teste.",
    parametros: {
      maximo_ideias_novas_por_unidade: 2,
      formas_de_explicacao: ["contrast"],
      oportunidades_distintas_por_requisito: 3,
      dimensoes_de_variacao_da_pratica: ["support_level"],
      alvo_palavras_conversa: 72,
      alvo_palavras_unidade: 140
    }
  };
  await assert.rejects(() => materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units
  }), (error) => {
    const blocker = preflightBlocker(error, "human_materialization_existing_configuration_conflict");
    assert.doesNotMatch(blocker.message, /schema|SQL|backend|snapshot/iu);
    return true;
  });
  assert.deepEqual(adapter.calls, []);
});

function appliedAutomaticReplacement() {
  const adapter = adapterFixture();
  const saved = persistedStudyUnit("70000000-0000-4000-8000-000000000001", 1);
  saved.designSnapshot.parameters.forEach(parameter => {
    parameter.origin = "automatic";
    parameter.sourceScopeKind = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameter.parameterId)
      .supportedScopes.includes("study_unit") ? "study_unit" : "course";
    if (Array.isArray(parameter.value)) parameter.value.sort(); // PostgreSQL persists sets in lexical order.
  });
  const current = courseDesignFixture({ courseId: COURSE_ID, microsequenceId: "micro-dns",
    studyUnitId: saved.studyUnit.id }, { revision: 8 });
  current.targetPlanItems = { instructionalAnalysisUnitIds: [ANALYSIS_ID], evidenceRequirementIds: [] };
  const readDesign = adapter.getCourseDesign;
  adapter.getCourseDesign = async request => request.scopeKind === "study_unit"
    ? structuredClone(current) : readDesign(request);
  adapter.listCourseStudyUnits = async () => ({ items: [structuredClone(saved)], hasMore: false, nextCursor: null });
  const replacement = { ...unit(), unidade: saved.studyUnit.id, configuracao: {
    motivo: "Reutilizar a calibração contextual já aplicada.",
    parametros: Object.fromEntries(saved.designSnapshot.parameters.map(parameter => [
      COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameter.parameterId).humanField,
      structuredClone(parameter.value)
    ]))
  } };
  return { adapter, saved, current, replacement };
}

test("substituição reutiliza calibração automática aplicada com intenção ainda delegada", async () => {
  for (const explicitConfiguration of [true, false]) {
    const { adapter, saved, current, replacement } = appliedAutomaticReplacement();
    if (!explicitConfiguration) delete replacement.configuracao;
    const before = structuredClone({ saved, current });
    const ready = await prepareMaterialization(adapter, [replacement]);
    assert.equal(ready.state, "ready", JSON.stringify(ready.blockers));
    assert.equal(adapter.calls.length, 0);
    await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
      units: [replacement], preparationReference: ready.referencia });
    const applied = adapter.calls[0].units[0];
    assert.equal(applied.studyUnitId, saved.studyUnit.id);
    assert.deepEqual(applied.designSnapshot.parameters.map(parameter => ({ ...parameter,
      value: Array.isArray(parameter.value) ? [...parameter.value].sort() : parameter.value })),
    saved.designSnapshot.parameters);
    assert.deepEqual({ saved, current }, before, "a preparação e a escrita não alteram as leituras recebidas");
  }
});

test("calibração aplicada não substitui intenção corrente nem permite recalibrar pela materialização", async () => {
  for (const assignment of [
    { mode: "automatic", origin: "automatic", value: 100 },
    { mode: "automatic", origin: "author", value: null },
    { mode: "fixed", origin: "author", value: 100 },
    { mode: "fixed", origin: "research_condition", value: 100 }
  ]) {
    const { adapter, current, replacement } = appliedAutomaticReplacement();
    const parameter = current.parameters.find(entry => entry.parameterId === "authoring_chat_response_word_target");
    parameter.effectiveAssignment = { ...assignment, reason: "Intenção corrente editada.",
      sourceScope: { kind: "study_unit", ref: replacement.unidade }, inherited: false };
    const blocked = await prepareMaterialization(adapter, [replacement]);
    assert.ok(blocked.blockers.some(({ code }) => code === "human_materialization_existing_configuration_conflict"));
    if (assignment.value !== null) {
      replacement.configuracao.parametros.alvo_palavras_conversa = assignment.value;
      const ready = await prepareMaterialization(adapter, [replacement]);
      assert.equal(ready.state, "ready", JSON.stringify(ready.blockers));
      await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
        units: [replacement], preparationReference: ready.referencia });
      const applied = adapter.calls[0].units[0].designSnapshot.parameters.find(entry => entry.parameterId === parameter.parameterId);
      assert.equal(applied.value, assignment.value);
      assert.equal(applied.origin, assignment.origin);
      assert.equal(applied.reason, "Intenção corrente editada.");
    } else assert.deepEqual(adapter.calls, []);
  }
  const { adapter, replacement } = appliedAutomaticReplacement();
  replacement.configuracao.parametros.alvo_palavras_conversa = 100;
  await assert.rejects(() => materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
    units: [replacement] }), error => Boolean(preflightBlocker(error, "human_materialization_existing_configuration_conflict")));
  assert.deepEqual(adapter.calls, []);
});

test("snapshot inválido da unidade alvo não recebe preenchimento genérico", async () => {
  for (const mutate of [
    snapshot => { snapshot.contract = "aralearn.study-unit-design-snapshot.v1"; },
    snapshot => { snapshot.parameterCatalogVersion = "1.0.0"; },
    snapshot => { snapshot.didacticMicrosequenceId = "another-microsequence"; },
    snapshot => { snapshot.parameters.pop(); },
    snapshot => { snapshot.parameters[0] = structuredClone(snapshot.parameters[1]); },
    snapshot => { snapshot.parameters[0].origin = "author"; },
    snapshot => { snapshot.parameters[0].origin = "research_condition"; },
    snapshot => { snapshot.parameters[0].sourceScopeKind = "didactic_microsequence"; },
    snapshot => { snapshot.parameters[0].value = -1; },
    snapshot => { snapshot.parameters[0].reason = ""; }
  ]) {
    const { adapter, saved, replacement } = appliedAutomaticReplacement();
    mutate(saved.designSnapshot);
    delete replacement.configuracao;
    const blocked = await prepareMaterialization(adapter, [replacement]);
    assert.equal(blocked.state, "blocked");
    assert.ok(blocked.blockers.some(({ code }) =>
      code === "human_materialization_contextual_calibration_required"));
    assert.deepEqual(adapter.calls, []);
  }
  const { adapter, current, replacement } = appliedAutomaticReplacement();
  current.parameters[0].conflicts = [{ fixedValue: 1, exceptionValue: 2 }];
  const blocked = await prepareMaterialization(adapter, [replacement]);
  assert.ok(blocked.blockers.some(({ code }) => code === "human_materialization_configuration_conflict"));
  assert.deepEqual(adapter.calls, []);
});
test("conjuntos aplicados e correntes com ordem SQL conservam a mesma configuração", async () => {
  const { adapter, saved, current, replacement } = appliedAutomaticReplacement();
  const parameter = current.parameters.find(entry => entry.parameterId === "required_explanation_forms");
  parameter.effectiveAssignment = { mode: "automatic", origin: "automatic",
    value: saved.designSnapshot.parameters.find(entry => entry.parameterId === parameter.parameterId).value,
    reason: "Conjunto aplicado relido pela configuração corrente.",
    sourceScope: { kind: "study_unit", ref: saved.studyUnit.id }, inherited: false };
  replacement.configuracao.parametros.formas_de_explicacao.reverse();
  const ready = await prepareMaterialization(adapter, [replacement]);
  assert.equal(ready.state, "ready", JSON.stringify(ready.blockers));
  await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
    units: [replacement], preparationReference: ready.referencia });
  assert.deepEqual(adapter.calls[0].units[0].designSnapshot.parameters.find(entry => entry.parameterId === parameter.parameterId).value,
    parameter.effectiveAssignment.value);
});

test("referência ready sela calibração aplicada e intenção corrente da unidade substituída", async () => {
  for (const mutate of [
    ({ saved }) => { saved.designSnapshot.parameters[0].reason = "A aplicação mudou após o preflight."; },
    ({ current }) => { current.parameters[0].effectiveAssignment = { mode: "fixed", value: 1, origin: "author",
      reason: "A intenção mudou após o preflight.", sourceScope: { kind: "course", ref: COURSE_ID }, inherited: true }; }
  ]) {
    const fixture = appliedAutomaticReplacement();
    const { adapter, replacement } = fixture;
    const ready = await prepareMaterialization(adapter, [replacement]);
    assert.equal(ready.state, "ready", JSON.stringify(ready.blockers));
    mutate(fixture);
    await assert.rejects(() => materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
      units: [replacement], preparationReference: ready.referencia }),
    { status: 409, code: "human_materialization_preflight_stale" });
    assert.deepEqual(adapter.calls, []);
  }
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
    code: "human_materialization_missing_explanation_form",
    message: /Novidade 1.*Contraste/iu
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
      complete: true,
      units
    }), (error) => {
      const blocker = preflightBlocker(error, scenario.code);
      if (scenario.message) assert.match(blocker.message, scenario.message);
      return true;
    }, scenario.code);
  }
  await assert.rejects(() => materializeHumanCoursePart({
    adapter: unitScopedPedagogicalAdapter({ blockedComponent: true }),
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    complete: true,
    units: unitScopedMaterialization()
  }), (error) => Boolean(preflightBlocker(error, "human_materialization_component_policy_violation")));
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
  }), (error) => Boolean(preflightBlocker(error, "human_materialization_analysis_unit_ceiling_exceeded")));
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
    complete: true,
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
    complete: true,
    units: [pedagogicalUnit(1, {
      mode: "pratica",
      practices: [practice("caso-a", ["case_or_data"])]
    })]
  }), (error) => Boolean(preflightBlocker(error, "human_materialization_insufficient_practice")));
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
  }), (error) => Boolean(preflightBlocker(error, "human_materialization_explanation_before_introduction")));
});

test("materialização desenvolve de fato cada item de escopo atribuído à microssequência", async () => {
  const adapter = pedagogicalAdapter({ analysisCount: 0 });
  const readPlan = adapter.getCourseInstructionalPlan;
  adapter.getCourseInstructionalPlan = async () => {
    const current = await readPlan();
    current.plan.curriculumScopeItems = [{
      id: CURRICULUM_SCOPE_ID,
      position: 0,
      statement: "Resolução de nomes pelo DNS.",
      state: "planned",
      curriculumTargets: [{
        moduleId: "module-network",
        lessonId: "lesson-network",
        didacticMicrosequenceIds: ["micro-dns"]
      }],
      developedIn: []
    }];
    return current;
  };
  const content = pedagogicalUnit(1, { mode: "pratica" });

  await assert.rejects(() => materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    complete: true,
    units: [content]
  }), (error) => Boolean(preflightBlocker(error, "human_materialization_incomplete_scope_coverage")));
  assert.deepEqual(adapter.calls, []);

  content.aplicacaoPedagogica.cobertura = ["Resolução de nomes pelo DNS."];
  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    complete: true,
    units: [content]
  });
  assert.deepEqual(
    adapter.calls[0].units[0].designApplication.curriculumScopeItemIds,
    [CURRICULUM_SCOPE_ID]
  );
});

test("revisar conteúdo inicial não mobiliza ideia ensinada apenas depois no currículo", async () => {
  const adapter = pedagogicalAdapter({ ceiling: 1, analysisCount: 1 });
  const readPlan = adapter.getCourseInstructionalPlan;
  adapter.getCourseInstructionalPlan = async () => {
    const read = await readPlan();
    read.plan.curriculum = {
      modules: [{
        id: "module-network",
        position: 0,
        lessons: [{
          id: "lesson-network",
          position: 0,
          microsequences: [{ id: "micro-dns", position: 0, title: "DNS",
            explanation: read.plan.curriculum.modules[0].lessons[0].microsequences[0].explanation }, {
            id: "micro-future",
            position: 1
          }]
        }]
      }]
    };
    read.plan.instructionalAnalysisUnits[0].introducedAt = {
      studyUnitId: "70000000-0000-4000-8000-000000000099",
      didacticMicrosequenceId: "micro-future",
      title: "Explicação posterior"
    };
    return read;
  };

  await assert.rejects(() => materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [pedagogicalUnit(1, { used: [1] })]
  }), (error) => Boolean(preflightBlocker(error, "human_materialization_use_before_introduction")));
  assert.deepEqual(adapter.calls, []);

  await assert.rejects(() => materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: "Curso de Redes",
    part: 1,
    units: [pedagogicalUnit(1, {
      novelty: [1],
      explanations: [{ ideia: 1, formas: ["plain_definition", "mechanism"] }]
    })]
  }), (error) => Boolean(preflightBlocker(error, "human_materialization_duplicate_introduction")));
  assert.deepEqual(adapter.calls, []);
});

test("pendência pedagógica independente em outra microssequência não bloqueia produção focal", async () => {
  for (const field of ["usedBy", "revisitedBy"]) {
    const adapter = adapterFixture();
    const readPlan = adapter.getCourseInstructionalPlan;
    adapter.getCourseInstructionalPlan = async () => {
      const read = await readPlan();
      read.plan.curriculum.modules[0].lessons[0].microsequences[0].position = 1;
      read.plan.curriculum.modules[0].lessons[0].microsequences.unshift({
        id: "micro-earlier", position: 0, title: "Fundamentos anteriores"
      });
      read.plan.instructionalAnalysisUnits.push({ id: SECOND_ANALYSIS_ID, position: 9,
        statement: "Ideia independente incompleta.", description: "Pendência fora do alvo corrente.",
        introducedAt: null, usedBy: [], revisitedBy: [], version: 1,
        [field]: [{ studyUnitId: "preserved-practice", didacticMicrosequenceId: "micro-earlier",
          title: "Prática fora do alvo" }] });
      return read;
    };
    const result = await prepareMaterialization(adapter, [unit()], { complete: false });
    assert.equal(result.state, "ready", JSON.stringify(result.blockers));
    assert.deepEqual(result.blockers, []);
  }
});

test("unidade preservada com introdução realmente afetada bloqueia a produção focal", async () => {
  const adapter = adapterFixture();
  const preserved = persistedStudyUnit("70000000-0000-4000-8000-000000000010", 1, {
    introduced: [ANALYSIS_ID], forms: ["plain_definition"]
  });
  adapter.listCourseStudyUnits = async () => ({
    items: [structuredClone(preserved)], hasMore: false, nextCursor: null
  });
  const candidate = { ...unit(), posicao: 2 };
  const blocked = await prepareMaterialization(adapter, [candidate], { complete: false });
  assert.equal(blocked.state, "blocked");
  assert.ok(blocked.blockers.some(({ code }) => code === "human_materialization_duplicate_introduction"));
  assert.deepEqual(adapter.calls, []);
});

test("introdução enviada sustenta referências preservadas posteriores, mas não anteriores", async () => {
  for (const before of [false, true]) {
    const adapter = adapterFixture();
    const readPlan = adapter.getCourseInstructionalPlan;
    adapter.getCourseInstructionalPlan = async () => {
      const read = await readPlan();
      read.plan.curriculum.modules[0].lessons[0].microsequences[0].position = 1;
      const microsequences = read.plan.curriculum.modules[0].lessons[0].microsequences;
      const preserved = { id: "micro-preserved", position: before ? 0 : 2, title: "Prática preservada" };
      if (before) microsequences.unshift(preserved);
      else microsequences.push(preserved);
      read.plan.instructionalAnalysisUnits[0].usedBy = [{ studyUnitId: "preserved-practice",
        didacticMicrosequenceId: "micro-preserved", title: "Aplicação preservada" }];
      return read;
    };
    const result = await prepareMaterialization(adapter, [unit()], { complete: false });
    assert.equal(result.state, before ? "blocked" : "ready");
    assert.equal(result.blockers.some(item => item.code === "human_materialization_use_before_introduction"), before);
  }
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
      curriculumMapStatus: "approved",
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
              id: "micro-prerequisite",
              position: 0,
              title: "Conhecimento estabelecido"
            }, {
              id: "micro-foundations",
              position: 1,
              title: "Aprender a associação",
              explanation: reconciledExplanationFixture([{ text: "A associação focal relaciona o nome ao endereço da rede.",
                analysisUnitIds: [SECOND_ANALYSIS_ID] }])
            }, {
              id: "micro-application",
              position: 2,
              title: "Usar e retomar a associação",
              explanation: reconciledExplanationFixture([
                { text: "O conhecimento anterior permite interpretar os dados apresentados.", role: "established", analysisUnitIds: [ANALYSIS_ID] },
                { text: "Retome a associação focal e compare as duas situações de rede.", role: "revisited", analysisUnitIds: [SECOND_ANALYSIS_ID] }
              ])
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
      parameters: fixtureAppliedParameters([
        ["new_analysis_unit_ceiling_per_expository_study_unit", 2],
        ["required_explanation_forms", ["plain_definition"]],
        ["minimum_distinct_practice_opportunities_per_evidence_requirement", 1],
        ["required_practice_variation_dimensions", ["case_or_data"]],
        ["authoring_chat_response_word_target", 100],
        ["study_unit_content_word_target", 180]
      ]),
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
  introduction.aplicacaoPedagogica.cobertura = [
    "Aprender e aplicar uma associação de rede."
  ];
  const application = pedagogicalUnit(1, {
    mode: "pratica",
    used: [1, 2]
  });
  application.microssequencia = "Usar e retomar a associação";
  application.conteudo.title = "Aplicar a associação";
  application.aplicacaoPedagogica.cobertura = [
    "Aprender e aplicar uma associação de rede."
  ];
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

  const expectedDesignReads = [{ scopeKind: "didactic_microsequence", scopeRef: "micro-foundations" },
    { scopeKind: "didactic_microsequence", scopeRef: "micro-application" }];
  assert.deepEqual(designReads, [...expectedDesignReads, ...expectedDesignReads],
    "preflight e montagem da escrita leem a configuração dos mesmos recortes");
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
    curriculumScopeItemIds: [CURRICULUM_SCOPE_ID],
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


test("cadência delegada recebe escolha e motivo no snapshot sem escritor anterior", async () => {
  const adapter = pedagogicalAdapter({ ceiling: 1, analysisCount: 1 });
  const load = adapter.getCourseDesign;
  const ids = ["authoring_part_microsequence_target", "authoring_batch_part_target", "authoring_pause_frequency"];
  adapter.getCourseDesign = async (request) => {
    const design = await load(request);
    for (const parameter of design.parameters) {
      if (ids.includes(parameter.parameterId)) parameter.effectiveAssignment = {
        mode: "automatic", value: null, origin: "author", reason: "Escolha delegada pela autoria.",
        sourceScope: { kind: "course", ref: COURSE_ID }, inherited: true
      };
    }
    return design;
  };
  const content = pedagogicalUnit(1, { novelty: [1],
    explanations: [{ ideia: 1, formas: ["plain_definition", "mechanism"] }] });
  content.configuracao = { motivo: "Produção sintética em blocos pequenos.", parametros: {
    alvo_microssequencias_por_parte: 3, alvo_partes_por_lote: 2, frequencia_de_pausa: "each_part"
  } };
  await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1, units: [content] });
  assert.equal(adapter.calls.length, 1);
  const applied = adapter.calls[0].units[0].designSnapshot.parameters.filter(({ parameterId }) => ids.includes(parameterId));
  assert.deepEqual(applied.map(({ value }) => value), [3, 2, "each_part"]);
  assert.ok(applied.every(({ origin, sourceScopeKind, reason }) => origin === "automatic" &&
    sourceScopeKind === "course" && reason === content.configuracao.motivo));
});

test("conflito entre fixação e exceção bloqueia toda materialização", async () => {
  const adapter = adapterFixture();
  const load = adapter.getCourseDesign;
  adapter.getCourseDesign = async (request) => {
    const design = await load(request);
    design.parameters[0].conflicts = [{ fixedScope: { kind: "course", ref: COURSE_ID }, fixedValue: 1,
      exceptionScope: { kind: "didactic_microsequence", ref: "micro-dns" }, exceptionValue: 2 }];
    return design;
  };
  await assert.rejects(() => materializeHumanCoursePart({ adapter, principal: PRINCIPAL,
    course: "Curso de Redes", part: 1, units: [unit()] }),
  (error) => Boolean(preflightBlocker(error, "human_materialization_configuration_conflict")));
  assert.deepEqual(adapter.calls, []);
});

const SIX_TEACHINGS = [
  "Um nome DNS identifica um nó na árvore de nomes.",
  "Um registro A associa o nome a um endereço IPv4.",
  "Um registro AAAA associa o nome a um endereço IPv6.",
  "Um registro CNAME indica outro nome como destino da consulta.",
  "O TTL limita por quanto tempo o registro pode ser reutilizado do cache.",
  "Uma resposta NXDOMAIN informa que o nome consultado não existe."
].map((statement, position) => ({ id: `60000000-0000-4000-8000-00000000000${position + 1}`,
  position, statement, description: statement, introducedAt: null, usedBy: [], revisitedBy: [], version: 1 }));

function sixTeachingAdapter(ceiling = 2) {
  const adapter = pedagogicalAdapter({ ceiling, analysisCount: 0 });
  const readPlan = adapter.getCourseInstructionalPlan;
  adapter.getCourseInstructionalPlan = async () => {
    const read = await readPlan();
    read.plan.instructionalAnalysisUnits = structuredClone(SIX_TEACHINGS);
    read.plan.curriculum.modules[0].lessons[0].microsequences[0].explanation = reconciledExplanationFixture(
      SIX_TEACHINGS.map(item => ({ text: item.statement, analysisUnitIds: [item.id] })));
    return read;
  };
  const readDesign = adapter.getCourseDesign;
  adapter.getCourseDesign = async request => ({ ...await readDesign(request),
    targetPlanItems: { instructionalAnalysisUnitIds: SIX_TEACHINGS.map(item => item.id), evidenceRequirementIds: [] } });
  return adapter;
}

function sixTeachingUnits(ceiling) {
  const units = [];
  for (let offset = 0; offset < SIX_TEACHINGS.length; offset += ceiling) {
    const selected = SIX_TEACHINGS.slice(offset, offset + ceiling);
    units.push(pedagogicalUnit(units.length + 1, { novelty: selected.map(item => item.statement),
      explanations: selected.map(item => ({ ideia: item.statement, formas: ["plain_definition", "mechanism"] })) }));
  }
  return units;
}

test("preflight confronta seis ensinamentos da base com o percurso inteiro sob tetos 1 e 2", async () => {
  for (const ceiling of [1, 2]) {
    const adapter = sixTeachingAdapter(ceiling);
    const units = sixTeachingUnits(ceiling);
    const ready = await prepareMaterialization(adapter, units, { complete: true });
    assert.equal(ready.state, "ready");
    assert.match(ready.referencia, /^materialization-v1:[a-f0-9]{64}$/u);
    assert.deepEqual(ready.reconciliations[0].introduced, SIX_TEACHINGS.map(item => item.id));
    assert.deepEqual(adapter.calls, [], "preflight é somente leitura");

    const incomplete = await prepareMaterialization(adapter, units.slice(0, -1), { complete: true });
    assert.equal(incomplete.state, "blocked");
    assert.equal(incomplete.referencia, null);
    for (const item of SIX_TEACHINGS.slice(-ceiling)) assert.ok(incomplete.blockers.some(blocker =>
      blocker.code === "human_materialization_incomplete_analysis_inventory" && blocker.idea === item.statement));

    await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
      units, complete: true, preparationReference: ready.referencia });
    assert.equal(adapter.calls.length, 1, "ready seguido na mesma basis permite a escrita única");
    assert.equal(adapter.calls[0].units.length, 6 / ceiling);
    assert.deepEqual(adapter.calls[0].units.flatMap(item => item.designApplication.introducedInstructionalAnalysisUnitIds),
      SIX_TEACHINGS.map(item => item.id));
    assert.deepEqual(adapter.calls[0].planItemUpserts, [], "materialização não cria o inventário depois de pronta");
  }
});

test("preflight agrega vínculos, referências, formas, componentes e prática antes da escrita", async () => {
  const adapter = sixTeachingAdapter();
  const readPlan = adapter.getCourseInstructionalPlan;
  adapter.getCourseInstructionalPlan = async () => {
    const read = await readPlan();
    read.plan.curriculumMapStatus = "draft";
    return read;
  };
  const readDesign = adapter.getCourseDesign;
  adapter.getCourseDesign = async request => {
    const design = await readDesign(request);
    design.targetPlanItems.instructionalAnalysisUnitIds = design.targetPlanItems.instructionalAnalysisUnitIds.slice(1);
    design.componentPolicy.effectiveAssignment.policy.excludedRefs = ["aralearn.resource.paragraph@1.0.0"];
    return design;
  };
  const units = sixTeachingUnits(2);
  units[0].aplicacaoPedagogica.explicacoes[1].formas = ["plain_definition"];
  units[0].fontes = [{ fonte: "Fonte ainda não cadastrada", relacao: "needs_verification", papeis: ["tecnica_conceitual"] }];
  const practice = pedagogicalUnit(4, { mode: "pratica", practices: [{ requisito: "Requisito ainda não cadastrado",
    oportunidade: "registro-a", dimensoesVariadas: ["case_or_data"] }] });
  practice.conteudo.response = { id: "legacy-response", package: "aralearn.response.open", version: "1.0.0",
    data: { prompt: "Explique a resolução." } };
  practice.conteudo.feedback = [];
  units.push(practice);
  const preparation = await prepareMaterialization(adapter, units, { complete: true });
  assert.equal(preparation.state, "blocked");
  assert.equal(preparation.referencia, null);
  const codes = new Set(preparation.blockers.map(item => item.code));
  for (const code of ["human_materialization_map_approval_required", "human_materialization_analysis_not_linked", "human_reference_not_found",
    "human_materialization_missing_explanation_form", "human_materialization_component_policy_violation",
    "practice_response_legacy_only"]) assert.ok(codes.has(code), code);
  assert.ok(preparation.blockers.filter(item => item.code === "human_reference_not_found").length >= 2,
    "fonte e requisito ausentes aparecem na mesma preparação");
  assert.deepEqual(adapter.calls, []);
  await assert.rejects(() => materializeHumanCoursePart({ adapter, principal: PRINCIPAL,
    course: "Curso de Redes", part: 1, units, complete: true }), error => {
    preflightBlocker(error, "human_materialization_component_policy_violation");
    preflightBlocker(error, "human_materialization_missing_explanation_form");
    return true;
  });
  assert.deepEqual(adapter.calls, []);
});

test("preflight exige aprovação explícita do mapa para materialização parcial e completa", async () => {
  for (const complete of [false, true]) for (const status of ["draft", "absent", undefined, "unknown"]) {
    const adapter = adapterFixture();
    const readPlan = adapter.getCourseInstructionalPlan;
    adapter.getCourseInstructionalPlan = async () => {
      const read = await readPlan();
      if (status === undefined) delete read.plan.curriculumMapStatus;
      else read.plan.curriculumMapStatus = status;
      return read;
    };
    const units = [unit()];
    const blocked = await prepareMaterialization(adapter, units, { complete });
    const expectedCode = status === "draft" || status === "absent"
      ? "human_materialization_map_approval_required" : "course_service_unavailable";
    assert.equal(blocked.state, "blocked");
    assert.equal(blocked.referencia, null);
    assert.deepEqual(blocked.blockers.map(({ code }) => code), [expectedCode]);
    await assert.rejects(() => materializeHumanCoursePart({ adapter, principal: PRINCIPAL,
      course: "Curso de Redes", part: 1, units, complete }), error => Boolean(preflightBlocker(error, expectedCode)));
    assert.deepEqual(adapter.calls, [], "preparar e materializar não aprovam o mapa nem chegam à escrita");
    assert.equal((await adapter.getCourseInstructionalPlan()).plan.curriculumMapStatus, status);
  }
});

test("referência ready inclui aprovação do mapa e não autoriza a escrita após retorno ao rascunho", async () => {
  const adapter = adapterFixture();
  const units = [unit()];
  const ready = await prepareMaterialization(adapter, units, { complete: false });
  assert.equal(ready.state, "ready");
  const readPlan = adapter.getCourseInstructionalPlan;
  adapter.getCourseInstructionalPlan = async () => {
    const read = await readPlan();
    read.plan.curriculumMapStatus = "draft";
    return read;
  };
  const blocked = await prepareMaterialization(adapter, units, { complete: false });
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.referencia, null);
  assert.equal(blocked.blockers[0].code, "human_materialization_map_approval_required");
  await assert.rejects(() => materializeHumanCoursePart({ adapter, principal: PRINCIPAL,
    course: "Curso de Redes", part: 1, units, complete: false, preparationReference: ready.referencia }),
  { status: 409, code: "human_materialization_preflight_stale" });
  assert.deepEqual(adapter.calls, []);
});

test("referência ready perde validade quando muda a Explicação fornecida", async () => {
  const adapter = adapterFixture();
  const units = [unit()];
  const explanations = explanationFixtures();
  const ready = await prepareMaterialization(adapter, units, { explanations });
  assert.equal(ready.state, "ready");
  explanations[0].conteudo = reconciledExplanationFixture([{ text: "O nome consultado pode corresponder a um endereço de rede.",
    analysisUnitIds: [ANALYSIS_ID] }]);
  await assert.rejects(() => materializeHumanCoursePart({ adapter, principal: PRINCIPAL,
    course: "Curso de Redes", part: 1, units, explanations, preparationReference: ready.referencia }),
  { status: 409, code: "human_materialization_preflight_stale" });
  assert.deepEqual(adapter.calls, []);
});

test("referência ready protege configuração efetiva do slot existente", async () => {
  const adapter = unitScopedPedagogicalAdapter();
  const units = unitScopedMaterialization();
  const ready = await prepareMaterialization(adapter, units);
  assert.equal(ready.state, "ready");
  const readDesign = adapter.getCourseDesign;
  adapter.getCourseDesign = async request => {
    const design = await readDesign(request);
    if (request.scopeKind === "study_unit") design.componentPolicy.effectiveAssignment.policy.preferredRefs = ["aralearn.resource.paragraph@1.0.0"];
    return design;
  };
  await assert.rejects(() => materializeHumanCoursePart({ adapter, principal: PRINCIPAL,
    course: "Curso de Redes", part: 1, units, preparationReference: ready.referencia }),
  { status: 409, code: "human_materialization_preflight_stale" });
  assert.deepEqual(adapter.calls, []);
});

// Essência do caso real: a base e o repertório já existiam, faltavam unidades
// em microssequências com explicação salva. O cliente precisa concluir
// ler -> classificar -> preparar -> materializar -> reler sem recopiar a base,
// sem sondar localizadores e sem manter unidades independentes preservadas.
test("caso real: completar lacunas classifica sem recopiar a base e sem manter a unidade independente", async () => {
  const preservedId = "70000000-0000-4000-8000-000000000001";
  const adapter = adapterFixture();
  const leaves = ["O DNS associa nomes a endereços usados por aplicações comuns.",
    "Verificar o cache evita consultas repetidas.  Verificar o cache custa memória."];
  const plan = await adapter.getCourseInstructionalPlan();
  const microsequence = plan.plan.curriculum.modules[0].lessons[0].microsequences[0];
  microsequence.explanation = { title: "Explicação de DNS", content: leaves.map((text, index) => ({
    id: `support-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } })) };
  adapter.getCourseInstructionalPlan = async () => structuredClone(plan);
  const preserved = persistedStudyUnit(preservedId, 1);
  const preservedBefore = structuredClone(preserved);
  adapter.listCourseStudyUnits = async () => ({ items: [structuredClone(preserved)], hasMore: false, nextCursor: null });

  const idea = "DNS associa nomes a endereços.";
  const reason = "A passagem sustenta a relação central que o percurso desenvolve.";
  const operations = [];
  const declare = async declarations => {
    operations.push(JSON.stringify(declarations));
    try {
      microsequence.explanation = await reconcileHumanExplanation(microsequence.explanation, declarations, { plan });
      return { ok: true };
    } catch (error) {
      return { ok: false, blockers: toolErrorData(error).details?.blockers ?? [] };
    }
  };
  const wholeLeaf = { recurso: 1, folha: "text", papel: "introduced", motivo: reason, ideias: [idea], requisitos: [] };
  const first = await declare([wholeLeaf]);
  assert.equal(first.ok, false);
  assert.deepEqual(first.blockers.map(({ code }) => code), ["explanation_reconciliation_unmapped"]);
  assert.equal(first.blockers[0].path, "text");
  assert.deepEqual(first.blockers[0].passages, [leaves[1]],
    "o que falta classificar volta com o texto literal, sem exigir sondagem do cliente");

  const ambiguous = { recurso: 2, folha: "text", trecho: "Verificar o cache", papel: "example", motivo: reason,
    ideias: [idea], requisitos: [] };
  const second = await declare([wholeLeaf, ambiguous]);
  assert.equal(second.ok, false);
  assert.deepEqual(second.blockers.map(({ code }) => code),
    ["explanation_reconciliation_locator_stale", "explanation_reconciliation_unmapped"]);
  const candidates = second.blockers[0].candidates;
  assert.equal(candidates.length, 2);
  assert.notEqual(candidates[0], candidates[1], "os candidatos precisam ser distinguíveis pelo cliente");
  for (const candidate of candidates) {
    assert.equal(leaves[1].split(candidate).length - 1, 1, "cada candidato é um seletor literal e único");
  }
  assert.ok(candidates[0].includes("evita consultas repetidas") && candidates[1].includes("custa memória"),
    "o contexto devolvido permite escolher semanticamente, sem contar ocorrências");

  const third = await declare([wholeLeaf, { ...ambiguous, trecho: candidates[1] }]);
  assert.equal(third.ok, false);
  assert.deepEqual(third.blockers.map(({ code }) => code), ["explanation_reconciliation_unmapped"]);
  const remaining = third.blockers[0].passages[0];
  assert.equal(typeof remaining, "string");

  const fourth = await declare([wholeLeaf, { ...ambiguous, trecho: candidates[1] },
    { recurso: 2, folha: "text", trecho: remaining, papel: "support", motivo: reason, ideias: [idea], requisitos: [] }]);
  assert.equal(fourth.ok, true);
  assert.equal(operations.length, 4, "quatro operações, cada uma resolvendo uma decisão real");
  assert.equal(new Set(operations).size, operations.length, "nenhuma tentativa idêntica foi repetida");
  const savedReconciliation = microsequence.explanation.reconciliation;
  assert.equal(savedReconciliation.entries.length, 3);
  for (const entry of savedReconciliation.entries) {
    assert.ok(leaves.some(text => text.includes(entry.quote)),
      "o localizador persistido é literal, derivado pelo servidor, sem cópia de serialização do cliente");
  }
  assert.equal(inspectExplanationReconciliation(microsequence.explanation, {
    contentBasis: savedReconciliation.contentBasis, analysisUnitIds: [ANALYSIS_ID],
    evidenceRequirementIds: [], microsequenceIds: ["micro-dns"] }).ready, true);

  const firstUnit = unit();
  firstUnit.posicao = 2;
  firstUnit.aplicacaoPedagogica.ideiasIntroduzidas = [];
  firstUnit.aplicacaoPedagogica.ideiasUtilizadas = [1];
  firstUnit.aplicacaoPedagogica.explicacoes = [];
  const secondUnit = pedagogicalUnit(3, { used: [1] });
  const ready = await prepareMaterialization(adapter, [firstUnit, secondUnit]);
  assert.equal(ready.state, "ready", JSON.stringify(ready.blockers));
  await materializeHumanCoursePart({ adapter, principal: PRINCIPAL, course: "Curso de Redes", part: 1,
    units: [firstUnit, secondUnit], preparationReference: ready.referencia });
  const write = adapter.calls[0];
  assert.equal(write.units.length, 2);
  assert.ok(write.units.every(unitWrite => unitWrite.didacticMicrosequenceId === "micro-dns"));
  assert.ok(write.placements.some(({ studyUnitId }) => studyUnitId === preservedId),
    "a unidade independente permanece no percurso");
  assert.deepEqual(preserved, preservedBefore, "a unidade independente não é mantida nem reescrita");
  const reread = await prepareMaterialization(adapter, [firstUnit, secondUnit]);
  assert.equal(reread.state, "ready", JSON.stringify(reread.blockers));
});
