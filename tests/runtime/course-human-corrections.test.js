import assert from "node:assert/strict";
import test from "node:test";

import { applyHumanCourseCorrections } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanCorrections.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";

function sourceLink(suffix) {
  return {
    linkId: `link-${suffix}`,
    sourceId: `source-${suffix}`,
    relation: "supported_by",
    roles: ["technical_conceptual"],
    occurrences: [],
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
    async getCourseInstructionalPlan() {
      return { courseRevision: 7, plan: { title: "Curso de Redes", parts: [{ id: "part-a", position: 0,
        title: "Parte A", microsequences: [{ id: "micro-a", title: "Microssequência A", position: 0 }] }] } };
    },
    async listCourseEntities() {
      return { items: [{ entityType: "microsequence", entityId: "micro-a", parentType: "lesson", parentId: "lesson-a",
        position: 0, version: 2, contentReview: { state: "current" }, content: { title: "Microssequência A",
          goal: "Distinguir nomes e endereços", role: "explain", dependsOn: [], covers: [], checks: [], errors: [] } }],
      hasMore: false, nextCursor: null };
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

for (const authenticationKind of ["oauth", "action"]) {
  test(`correção ${authenticationKind} reutiliza vínculos explícitos e ocorrência sem duplicar âncoras`, async () => {
    const adapter = adapterFixture();
    const { title, content } = correctedContent("Apoio com fontes");
    const occurrence = { occurrenceId: "occ-existing", slot: "content", resourceId: content[0].id,
      path: "text", quote: "Conteúdo corrigido", prefix: null, suffix: null };
    const current = [
      { ...sourceLink("rfc"), occurrences: [occurrence] },
      { ...sourceLink("second"), relation: "quoted_from", roles: ["recommended_reading"] }
    ];
    adapter.getCourseSources = async ({ mode, sourceId }) => {
      if (mode === "target") return { items: [{ sourceLinks: structuredClone(current) }] };
      if (mode === "catalog") return { items: current.map((link, i) => ({ sourceId: link.sourceId,
        revision: 1, title: `Fonte ${i + 1}` })), nextCursor: null };
      return { items: [{ sourceId, revision: 1, anchors: current.find(link => link.sourceId === sourceId)
        .anchors.map(anchor => ({ ...anchor, status: "active", humanLocator: "p. 1" })) }] };
    };
    const fontes = current.map((link, i) => ({ fonte: `Fonte ${i + 1}`, relacao: link.relation,
      papeis: i === 0 ? ["tecnica_conceitual"] : ["leitura_complementar"], ancoras: [1],
      ...(i === 0 ? { ocorrencias: [{ lugar: "conteudo", recurso: 1, folha: "text", trecho: occurrence.quote }] } : {}) }));
    const input = { adapter, principal: { actorId: COURSE_ID, authenticationKind }, course: "Curso de Redes",
      explanations: [{ microssequencia: "Microssequência A", conteudo: { title, content }, fontes }] };
    const result = await applyHumanCourseCorrections(input);
    assert.deepEqual(adapter.commits[0].sourceAttributionApplications[0].sourceLinks, current);
    assert.equal(result.context.sourceMode, "explicit");
    assert.deepEqual(adapter.commits[0].upserts[0].content.explanation, { title, content });

    fontes[0].papeis = ["leitura_complementar"];
    fontes[0].ocorrencias[0].trecho = "percurso necessário";
    await applyHumanCourseCorrections(input);
    const changed = adapter.commits[1].sourceAttributionApplications[0].sourceLinks;
    assert.equal(changed[0].linkId, current[0].linkId);
    assert.deepEqual(changed[0].roles, ["recommended_reading"]);
    assert.equal(changed[0].occurrences[0].quote, "percurso necessário");
    assert.notEqual(changed[0].occurrences[0].occurrenceId, occurrence.occurrenceId);
    assert.deepEqual(changed[1], current[1]);

    delete fontes[0].ocorrencias;
    await applyHumanCourseCorrections(input);
    assert.deepEqual(adapter.commits[2].sourceAttributionApplications[0].sourceLinks[0].occurrences,
      current[0].occurrences, "Ocorrências omitidas no vínculo correspondente permanecem intactas.");
    fontes[0].ocorrencias = [];
    await applyHumanCourseCorrections(input);
    assert.deepEqual(adapter.commits[3].sourceAttributionApplications[0].sourceLinks[0].occurrences, []);
  });
}

test("correção só do apoio preserva percurso e fontes, sem transportar aprovação", async () => {
  const adapter = adapterFixture();
  const { title, content } = correctedContent("Apoio revisto");
  const receipt = await applyHumanCourseCorrections({ adapter, principal: { actorId: COURSE_ID, authenticationKind: "oauth" },
    course: "Curso de Redes", explanations: [{ microssequencia: "Microssequência A", conteudo: { title, content } }] });
  assert.equal(adapter.commits.length, 1);
  const write = adapter.commits[0];
  assert.equal(write.upserts.length, 1);
  assert.equal(write.upserts[0].entityType, "microsequence");
  assert.deepEqual(write.upserts[0].content.explanation, { title, content });
  assert.equal(write.upserts[0].content.goal, "Distinguir nomes e endereços");
  assert.equal(Object.hasOwn(write.upserts[0].content, "contentReview"), false);
  assert.deepEqual(write.sourceAttributionApplications, [{ targetKind: "microsequence_explanation", targetId: "micro-a",
    sourceLinks: [sourceLink("micro-a")] }]);
  assert.equal(receipt.context.explanationCorrectionCount, 1);
});

test("correção conjunta escreve unidade e apoio atomicamente e recusa resposta no apoio", async () => {
  const adapter = adapterFixture();
  const { title, content } = correctedContent("Apoio conjunto");
  const input = { adapter, principal: { actorId: COURSE_ID, authenticationKind: "oauth" }, course: "Curso de Redes",
    corrections: [{ unidade: 1, conteudo: correctedContent("Unidade revista") }],
    explanations: [{ microssequencia: "Microssequência A", conteudo: { title, content }, fontes: [] }] };
  await applyHumanCourseCorrections(input);
  assert.equal(adapter.commits.length, 1);
  assert.deepEqual(adapter.commits[0].upserts.map(row => row.entityType), ["study_unit", "microsequence"]);
  input.explanations[0].conteudo.response = {};
  await assert.rejects(() => applyHumanCourseCorrections(input), { code: "invalid_human_explanation" });
  assert.equal(adapter.commits.length, 1);
});

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
  assert.match(receipt.nextDecision, /rematerializar a parte/u);
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
        papeis: ["tecnica_conceitual"],
        ancoras: ["Seção 2"]
      }]
    }]
  });

  const commit = adapter.commits[0];
  assert.equal(commit.expectedStudyUnitVersion, 2);
  assert.equal(commit.applicationOrigin, "provider_assistance");
  const [link] = commit.sourceAttributionApplications[0].sourceLinks;
  assert.equal(typeof link.linkId, "string");
  assert.deepEqual(commit.sourceAttributionApplications[0].sourceLinks, [{
    linkId: link.linkId,
    sourceId: "source-rfc",
    relation: "supported_by",
    roles: ["technical_conceptual"],
    occurrences: [],
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
