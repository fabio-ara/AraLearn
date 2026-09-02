import assert from "node:assert/strict";
import test from "node:test";

import { materializeHumanCoursePart } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000001";
const ANALYSIS_ID = "30000000-0000-4000-8000-000000000001";
const PRINCIPAL = {
  actorId: "40000000-0000-4000-8000-000000000001",
  scopes: ["authoring:read", "authoring:write"]
};

function adapterFixture() {
  const calls = [];
  let revision = 8;
  let materialization = null;
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
        courseRevision: revision,
        plan: {
          version: 3,
          title: "Curso de Redes",
          instructionalAnalysisUnits: [{
            id: ANALYSIS_ID,
            position: 0,
            statement: "DNS associa nomes a endereços.",
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
    async getCourseAuthoringPartMaterialization() {
      return {
        courseId: COURSE_ID,
        courseRevision: revision,
        authoringPartId: PART_ID,
        materialization: structuredClone(materialization)
      };
    },
    async advanceCourseAuthoringPartMaterialization(request) {
      calls.push(structuredClone(request));
      assert.match(request.requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u);
      if (request.operation === "start") {
        revision += 1;
        materialization = {
          id: request.materializationId,
          status: "running",
          version: 1,
          authoringPartVersion: request.payload.authoringPartVersion,
          contextHash: "a".repeat(64),
          designContext: { targets: [] },
          steps: request.payload.steps.map((step) => ({
            ...step,
            status: "pending",
            version: 1
          })),
          nextPendingStep: null
        };
      } else if (request.operation === "record_step") {
        revision += 1;
        const step = materialization.steps.find(({ id }) => id === request.payload.stepId);
        step.status = "completed";
        step.version += 1;
        materialization.version += 1;
      } else if (request.operation === "finish") {
        revision += 1;
        materialization.status = "completed";
        materialization.version += 1;
      }
      return {
        courseId: COURSE_ID,
        courseRevision: revision,
        authoringPartId: PART_ID,
        materialization: structuredClone(materialization),
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
      novidadesIntroduzidas: [1],
      explicacoes: [{
        novidade: "DNS associa nomes a endereços.",
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

  assert.deepEqual(adapter.calls.map(({ operation }) => operation), [
    "start", "record_step", "finish"
  ]);
  const [start, record, finish] = adapter.calls;
  assert.equal(start.courseId, COURSE_ID);
  assert.equal(start.authoringPartId, PART_ID);
  assert.equal(start.expectedCourseRevision, 8);
  assert.equal(start.expectedMaterializationVersion, 0);
  assert.match(start.materializationId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.match(start.payload.steps[0].id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const upsert = record.payload.entityChanges.upserts[0];
  assert.equal(upsert.parentId, "micro-dns");
  assert.equal(upsert.position, 1);
  assert.equal(Object.hasOwn(upsert.content, "id"), false);
  assert.equal(Object.hasOwn(upsert.content, "position"), false);
  assert.match(upsert.entityId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const applied = record.payload.designApplication.studyUnits[0];
  assert.deepEqual(applied.introducedInstructionalAnalysisUnitIds, [ANALYSIS_ID]);
  assert.equal(applied.explanationApplications[0].instructionalAnalysisUnitId, ANALYSIS_ID);
  assert.deepEqual(applied.explanationApplications[0].notApplicable, [{
    form: "contrast",
    reason: "Esta primeira Unit estabelece a relação antes de contrastá-la."
  }]);
  assert.deepEqual(applied.componentRefs, ["aralearn.resource.paragraph@1.0.0"]);
  assert.deepEqual(record.payload.sourceAttributionApplication.studyUnits, [{
    studyUnitId: upsert.entityId,
    sourceLinks: [{
      sourceId: "source-rfc-1035",
      sourceRevision: 1,
      relation: "supported_by",
      anchors: [{ anchorId: "anchor-rfc-1035-section-2", anchorRevision: 1 }]
    }]
  }]);
  assert.equal(finish.expectedCourseRevision, 10);
  assert.equal(receipt.result, "1 Unidade foi produzida na Parte 1.");
  assert.equal(receipt.deepLink, `#/authoring/courses/${COURSE_ID}?section=content`);
  assert.deepEqual(receipt.context, {
    part: "1",
    studyUnitCount: 1,
    microsequenceCount: 1
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
