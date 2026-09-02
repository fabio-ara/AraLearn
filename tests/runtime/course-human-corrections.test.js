import assert from "node:assert/strict";
import test from "node:test";

import { applyHumanCourseCorrections } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanCorrections.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";

function sourceLink(suffix) {
  return {
    sourceId: `source-${suffix}`,
    relation: "supported_by",
    anchors: [{ anchorId: `anchor-${suffix}` }]
  };
}

function adapterFixture() {
  const commits = [];
  const units = [1, 2].map((position) => ({
    ordinal: position,
    version: position + 1,
    studyUnit: {
      id: `unit-${position}`,
      position,
      title: `Unidade ${position}`,
      role: "theory"
    },
    curriculumPath: {
      didacticMicrosequence: { id: "micro-a", title: "Microssequência A" }
    }
  }));
  return {
    commits,
    publicAppUrl: "https://app.example/",
    async listCourses() {
      return {
        items: [{ courseId: COURSE_ID, title: "Curso de Redes" }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourse() {
      return { courseId: COURSE_ID, title: "Curso de Redes", revision: 7 };
    },
    async listCourseStudyUnits() {
      return { items: units, hasMore: false, nextCursor: null };
    },
    async getCourseSources({ mode, targetId }) {
      if (mode === "target") {
        return {
          items: [{
            effective: true,
            sourceLinks: [sourceLink(targetId)]
          }]
        };
      }
      if (mode === "catalog") {
        return {
          items: [{
            sourceId: "source-rfc",
            revision: 2,
            title: "Domain names — implementation and specification",
            citationText: "RFC 1035"
          }],
          nextCursor: null
        };
      }
      return {
        items: [{
          sourceId: "source-rfc",
          revision: 2,
          anchors: [{
            anchorId: "anchor-rfc-section-2",
            revision: 3,
            status: "active",
            humanLocator: "Seção 2",
            verificationExcerpt: "Hosts usam nomes e endereços."
          }]
        }]
      };
    },
    async commitCourseComposition(request) {
      commits.push(structuredClone(request));
      return {
        revision: request.expectedRevision + 1,
        deepLink: `#/authoring/courses/${COURSE_ID}?section=content`
      };
    }
  };
}

function correctedContent(title) {
  return {
    title,
    role: "theory",
    content: [{
      id: `${title.toLocaleLowerCase("pt-BR").replace(/\s+/gu, "-")}-paragraph`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo corrigido sem comprimir o percurso necessário." }
    }],
    response: null,
    feedback: [],
    topics: ["DNS"]
  };
}

test("#272 correções MCP multi-Unit preservam Fontes e usam composição genérica atômica", async () => {
  const adapter = adapterFixture();
  const receipt = await applyHumanCourseCorrections({
    adapter,
    principal: {
      actorId: "20000000-0000-4000-8000-000000000001",
      authenticationKind: "oauth",
      scopes: ["authoring:read", "authoring:write"]
    },
    course: "Curso de Redes",
    corrections: [{
      unidade: 1,
      conteudo: correctedContent("Unidade 1 corrigida")
    }, {
      unidade: "Unidade 2",
      conteudo: correctedContent("Unidade 2 corrigida")
    }]
  });

  assert.equal(adapter.commits.length, 1);
  const commit = adapter.commits[0];
  assert.equal(commit.expectedRevision, 7);
  assert.equal(Object.hasOwn(commit, "expectedStudyUnitVersion"), false);
  assert.equal(Object.hasOwn(commit, "applicationOrigin"), false);
  assert.deepEqual(commit.upserts.map(({ entityId, parentId, position }) => ({
    entityId, parentId, position
  })), [{ entityId: "unit-1", parentId: "micro-a", position: 1 }, {
    entityId: "unit-2", parentId: "micro-a", position: 2
  }]);
  assert.deepEqual(commit.sourceAttributionApplications, [{
    studyUnitId: "unit-1",
    sourceLinks: [sourceLink("unit-1")]
  }, {
    studyUnitId: "unit-2",
    sourceLinks: [sourceLink("unit-2")]
  }]);
  assert.match(commit.requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u);
  assert.equal(receipt.context.correctionCount, 2);
  assert.equal(receipt.context.sourceMode, "preserved");
  assert.match(receipt.nextDecision, /rematerializar a Parte/u);
  assert.equal(
    receipt.deepLink,
    `https://app.example/#/authoring/courses/${COURSE_ID}` +
      "?section=content&studyUnitId=unit-1"
  );
  assert.equal(JSON.stringify({ ...receipt, deepLink: null }).includes("unit-"), false);
});

test("#272 correção application focal resolve Fonte/Âncora e marca provider_assistance", async () => {
  const adapter = adapterFixture();
  const receipt = await applyHumanCourseCorrections({
    adapter,
    principal: {
      actorId: "20000000-0000-4000-8000-000000000001",
      authenticationKind: "application",
      scopes: ["authoring:read", "authoring:write"]
    },
    course: "Curso de Redes",
    corrections: [{
      unidade: "Unidade 1",
      conteudo: correctedContent("Unidade 1 com Fonte revista"),
      fontes: [{
        fonte: "RFC 1035",
        relacao: "supported_by",
        ancoras: ["Seção 2"]
      }]
    }]
  });

  const commit = adapter.commits[0];
  assert.equal(commit.expectedStudyUnitVersion, 2);
  assert.equal(commit.applicationOrigin, "provider_assistance");
  assert.deepEqual(commit.sourceAttributionApplications[0].sourceLinks, [{
    sourceId: "source-rfc",
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-rfc-section-2" }]
  }]);
  assert.equal(receipt.context.sourceMode, "explicit");
});

test("#274 correção preserva a atribuição corrente quando Fontes não foram alteradas", async () => {
  const adapter = adapterFixture();
  adapter.getCourseSources = async ({ mode }) => {
    assert.equal(mode, "target");
    return {
      items: [{
        sourceLinks: [sourceLink("retired")]
      }]
    };
  };
  await applyHumanCourseCorrections({
    adapter,
    principal: {
      actorId: "20000000-0000-4000-8000-000000000001",
      authenticationKind: "oauth",
      scopes: ["authoring:read", "authoring:write"]
    },
    course: "Curso de Redes",
    corrections: [{
      unidade: 1,
      conteudo: correctedContent("Unidade sem vínculo aposentado")
    }]
  });
  assert.deepEqual(adapter.commits[0].sourceAttributionApplications, [{
    studyUnitId: "unit-1",
    sourceLinks: [sourceLink("retired")]
  }]);
});

test("#275 correção focal exige rematerialização para mudar teoria em prática", async () => {
  const adapter = adapterFixture();
  await assert.rejects(() => applyHumanCourseCorrections({
    adapter,
    principal: {
      actorId: "20000000-0000-4000-8000-000000000001",
      authenticationKind: "oauth",
      scopes: ["authoring:read", "authoring:write"]
    },
    course: "Curso de Redes",
    corrections: [{
      unidade: 1,
      conteudo: {
        ...correctedContent("Unidade transformada em prática"),
        role: "practice",
        response: {
          id: "choice-a",
          package: "aralearn.response.choice",
          version: "1.0.0",
          data: {
            question: "Qual alternativa aplica o conceito?",
            selectionMode: "single",
            selectionCriterion: "correct",
            options: [
              { id: "a", text: "Alternativa adequada", feedback: "Aplica o conceito." },
              { id: "b", text: "Alternativa inadequada", feedback: "Não aplica o conceito." }
            ],
            answerIds: ["a"]
          }
        },
        feedback: [{
          id: "feedback-a",
          package: "aralearn.resource.paragraph",
          version: "1.0.0",
          data: { text: "Compare a alternativa com o conceito explicado." }
        }]
      }
    }]
  }), (error) => error.code === "invalid_human_study_unit" &&
    /rematerialize a Parte/iu.test(error.message));
  assert.equal(adapter.commits.length, 0);
});
