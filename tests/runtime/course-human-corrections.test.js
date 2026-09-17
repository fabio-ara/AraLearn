import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { canonicalAuthoringValue } from "../../src/domain/courseAuthoringBasis.js";

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
    async getCourseAnchoredAnnotations() {
      return { items: [], annotationSetVersion: 0, hasMore: false, nextCursor: null };
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
      { ...sourceLink("second"), relation: "quoted_from", roles: ["recommended_reading"],
        occurrences: [{ ...occurrence, occurrenceId: "occ-second" }] }
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
    await assert.rejects(() => applyHumanCourseCorrections(input), error =>
      error.code === "incomplete_course_source_evidence" && error.details.issues.includes("missing_occurrence"));
    assert.equal(adapter.commits.length, 3, "Remover a ocorrência não pode conservar uma alegação de sustentação.");
    delete fontes[0].ocorrencias;
    fontes.splice(1);
    await applyHumanCourseCorrections(input);
    const replacement = adapter.commits[3].sourceAttributionApplications[0];
    assert.equal(replacement.replaceExisting, true);
    assert.equal(replacement.sourceLinks.length, 1);
    assert.equal(replacement.sourceLinks[0].linkId, current[0].linkId);
    fontes.splice(0);
    await applyHumanCourseCorrections(input);
    assert.deepEqual(adapter.commits[4].sourceAttributionApplications[0].sourceLinks, []);
    assert.equal(adapter.commits[4].sourceAttributionApplications[0].replaceExisting, true);
    delete input.explanations[0].fontes;
    await applyHumanCourseCorrections(input);
    assert.deepEqual(adapter.commits[5].sourceAttributionApplications[0].sourceLinks, current);
    assert.equal(adapter.commits[5].sourceAttributionApplications[0].replaceExisting, undefined);
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

for (const authenticationKind of ["oauth", "action"]) {
  test(`Explicações ${authenticationKind} devolvem todos os destinos de conteúdo sem herdar revisão do recibo`, async () => {
    const adapter = adapterFixture();
    const originalListEntities = adapter.listCourseEntities;
    const originalCommit = adapter.commitCourseComposition;
    adapter.listCourseStudyUnits = async () => ({ items: [], hasMore: false, nextCursor: null });
    adapter.getCourseInstructionalPlan = async () => ({ courseRevision: 7, plan: {
      title: "Curso de Redes", parts: [{ id: "part-a", position: 0, title: "Parte A",
        microsequences: ["A", "B"].map((suffix, position) => ({
          id: `micro-${suffix.toLowerCase()}`, title: `Microssequência ${suffix}`, position
        })) }]
    } });
    adapter.listCourseEntities = async () => {
      const page = await originalListEntities();
      return { ...page, items: [page.items[0], { ...structuredClone(page.items[0]),
        entityId: "micro-b", position: 1,
        content: { ...structuredClone(page.items[0].content), title: "Microssequência B" } }] };
    };
    adapter.commitCourseComposition = async request => ({ ...await originalCommit(request),
      deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}?section=review` });
    const explanations = ["A", "B"].map(suffix => {
      const { title, content } = correctedContent(`Base ${suffix}`);
      return { microssequencia: `Microssequência ${suffix}`, conteudo: { title, content } };
    });
    const receipt = await applyHumanCourseCorrections({ adapter,
      principal: { actorId: COURSE_ID, authenticationKind }, course: "Curso de Redes", explanations });
    const expected = ["A", "B"].map(suffix => ({ titulo: `Base ${suffix}`,
      deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}` +
        `?section=content&explanationId=micro-${suffix.toLowerCase()}` }));
    assert.equal(receipt.deepLink, expected[0].deepLink);
    assert.deepEqual(receipt.context.explicacoes, expected);
    assert.deepEqual(receipt.links.map(link => ({ relation: link.relation, target: link.target, url: link.url })),
      expected.map((entry, index) => ({ relation: "content", target: { kind: "microsequence_explanation", id: `micro-${index ? "b" : "a"}` }, url: entry.deepLink })));
    assert.equal(adapter.commits.length, 1);
    assert.deepEqual(adapter.commits[0].upserts.map(({ entityId }) => entityId), ["micro-a", "micro-b"]);
    assert.deepEqual(adapter.commits[0].upserts.map(({ content }) => content.explanation),
      explanations.map(({ conteudo }) => conteudo));
    assert.doesNotMatch(JSON.stringify(receipt), /section=review/u);
  });
}

test("correção conjunta escreve unidade e apoio atomicamente e recusa resposta no apoio", async () => {
  const adapter = adapterFixture();
  const { title, content } = correctedContent("Apoio conjunto");
  const input = { adapter, principal: { actorId: COURSE_ID, authenticationKind: "oauth" }, course: "Curso de Redes",
    corrections: [{ unidade: 1, conteudo: correctedContent("Unidade revista") }],
    explanations: [{ microssequencia: "Microssequência A", conteudo: { title, content }, fontes: [] }] };
  const receipt = await applyHumanCourseCorrections(input);
  assert.equal(adapter.commits.length, 1);
  assert.deepEqual(adapter.commits[0].upserts.map(row => row.entityType), ["study_unit", "microsequence"]);
  assert.equal(receipt.deepLink, `https://app.example/#/authoring/courses/${COURSE_ID}?section=content&studyUnitId=unit-1`);
  assert.deepEqual(receipt.context.explicacoes, [{ titulo: title,
    deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}?section=content&explanationId=micro-a` }]);
  assert.deepEqual(receipt.links.map(link => link.target), [
    { kind: "study_unit", id: "unit-1" }, { kind: "microsequence_explanation", id: "micro-a" }
  ]);
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
  assert.match(receipt.nextDecision, /conteúdo corrigido.*observações pendentes/u);
  assert.equal(
    receipt.deepLink,
    `https://app.example/#/authoring/courses/${COURSE_ID}` +
      "?section=content&studyUnitId=unit-1"
  );
  assert.deepEqual(receipt.links.map(link => link.target), [
    { kind: "study_unit", id: "unit-1" }, { kind: "study_unit", id: "unit-2" }
  ]);
  assert.equal(JSON.stringify({ ...receipt, deepLink: null, links: [] }).includes("unit-"), false);
});

test("correção da explicação persiste reconciliação humana ligada à base exata", async () => {
  const adapter = adapterFixture();
  const readPlan = adapter.getCourseInstructionalPlan;
  adapter.getCourseInstructionalPlan = async () => {
    const result = await readPlan();
    result.plan.instructionalAnalysisUnits = [{ id: "idea-dns", statement: "DNS resolve nomes" }];
    result.plan.evidenceRequirements = [{ id: "evidence-dns", statement: "Distinguir nome de endereço" }];
    return result;
  };
  const { title, content } = correctedContent("Explicação reconciliada");
  await applyHumanCourseCorrections({ adapter, principal: { actorId: COURSE_ID, authenticationKind: "oauth" },
    course: "Curso de Redes", explanations: [{ microssequencia: "Microssequência A", conteudo: { title, content },
      reconciliacao: [{ recurso: 1, folha: "text", trecho: content[0].data.text, papel: "introduced",
        ideias: ["DNS resolve nomes"], requisitos: ["Distinguir nome de endereço"], motivo: "Este trecho ensina a relação central." }] }] });
  const saved = adapter.commits[0].upserts[0].content.explanation;
  assert.deepEqual(saved.reconciliation, { contract: "aralearn.explanation-reconciliation.v1",
    contentBasis: createHash("sha256").update(canonicalAuthoringValue({ title, content })).digest("hex"), entries: [{
      resourceId: content[0].id, path: "text", quote: content[0].data.text, prefix: null, suffix: null,
      role: "introduced", analysisUnitIds: ["idea-dns"], evidenceRequirementIds: ["evidence-dns"],
      destinationMicrosequenceId: null, reason: "Este trecho ensina a relação central." }] });
});

test("correção preserva response.open legado e exige prática avaliável com feedback ao substituir", async () => {
  const adapter = adapterFixture();
  const legacy = { ...correctedContent("Prática anterior"), role: "practice", response: {
    id: "legacy-response", package: "aralearn.response.open", version: "1.0.0", data: { prompt: "Explique o DNS." }
  } };
  adapter.listCourseStudyUnits = async () => ({ items: [{ ordinal: 1, version: 2,
    studyUnit: { ...legacy, id: "unit-1", position: 1 }, curriculumPath: { didacticMicrosequence: { id: "micro-a" } }
  }], hasMore: false });
  const input = { adapter, principal: { actorId: COURSE_ID, authenticationKind: "oauth" }, course: "Curso de Redes",
    corrections: [{ unidade: 1, conteudo: { ...legacy, title: "Prática anterior com título corrigido" } }] };
  await applyHumanCourseCorrections(input);
  assert.deepEqual(adapter.commits[0].upserts[0].content.response, legacy.response);
  input.corrections[0].conteudo.response = { ...legacy.response, data: { prompt: "Nova pergunta aberta." } };
  await assert.rejects(applyHumanCourseCorrections(input), { code: "practice_response_legacy_only" });
  input.corrections[0].conteudo.response = { id: "response", package: "aralearn.response.choice", version: "1.0.0",
    data: { question: "Qual elemento é um nome?", selectionMode: "single", selectionCriterion: "correct",
      options: [{ id: "name", text: "example.org" }, { id: "address", text: "192.0.2.1" }], answerIds: ["name"] } };
  await assert.rejects(applyHumanCourseCorrections(input), { code: "practice_offline_feedback_required" });
  input.corrections[0].conteudo.feedback = [{ id: "feedback", package: "aralearn.resource.paragraph", version: "1.0.0",
    data: { text: "example.org é o nome; 192.0.2.1 é o endereço IP." } }];
  await applyHumanCourseCorrections(input);
  assert.equal(adapter.commits.length, 2);
  assert.equal(adapter.commits[1].upserts[0].content.response.package, "aralearn.response.choice");
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
        ancoras: ["Seção 2"],
        ocorrencias: [{ lugar: "conteudo", recurso: 1, folha: "text", trecho: "Conteúdo corrigido" }]
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
    occurrences: [{ occurrenceId: link.occurrences[0].occurrenceId, slot: "content",
      resourceId: correctedContent("Unidade 1 com Fonte revista").content[0].id, path: "text",
      quote: "Conteúdo corrigido", prefix: null, suffix: null }],
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
