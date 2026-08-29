import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { COURSE_AUTHORING_SERVER_INSTRUCTIONS } from
  "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import { normalizeCourseSourceCommand } from
  "../../src/domain/courseSources.js";

const fixtureUrl = new URL(
  "../fixtures/conversational-authoring-resumption.v1.json",
  import.meta.url
);

test("fixture conversacional Dataprev é sintética, segura e cobre a retomada planejada", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

  assert.equal(fixture.contract, "aralearn.conversational-authoring-regression.v1");
  assert.deepEqual(fixture.safety, {
    synthetic: true,
    mutableTargetAllowed: false,
    liveCourseLookupAllowed: false,
    pdfBytes: "generated-minimal-pdf-only"
  });
  assert.equal(fixture.course.title, "Dataprev: Gestão de Servidores");
  assert.equal(fixture.course.plan.complete, false);
  assert.equal(fixture.course.plan.partCount, 12);
  assert.equal(fixture.course.plan.parts.length, 12);
  assert.equal(fixture.course.materializationCount, 0);
  assert.deepEqual(fixture.sources.map(({ key }) => key), [
    "edital", "prova", "gabarito", "ppc"
  ]);
  assert.deepEqual(
    fixture.sources.flatMap(({ anchors }) => anchors.map(({ humanLocator }) => humanLocator)),
    [
      "Perfil 13 — Analista de Processamento → Gestão de Servidores, p. 44 do arquivo",
      "questões 45–51",
      "questões 45–51",
      "Sistemas Operacionais, pp. 112–114",
      "Redes de Computadores, pp. 123–124"
    ]
  );
  assert.ok(fixture.sources.every(({ source, pdfFileName }) =>
    /fixture sintética/u.test(source.title) && pdfFileName.startsWith("fixture-") &&
    pdfFileName.endsWith(".pdf")));
  assert.deepEqual(
    fixture.sources.map(({ source }) => ({
      authorship: source.authorship,
      publicationDate: source.publicationDate,
      identifier: source.identifier,
      url: source.url,
      editionOrVersion: source.editionOrVersion
    })),
    [
      {
        authorship: null,
        publicationDate: "2026",
        identifier: null,
        url: null,
        editionOrVersion: "edição sintética inicial"
      },
      {
        authorship: "FGV — identificação sintética de teste",
        publicationDate: "2024",
        identifier: null,
        url: null,
        editionOrVersion: null
      },
      {
        authorship: null,
        publicationDate: null,
        identifier: null,
        url: null,
        editionOrVersion: null
      },
      {
        authorship: null,
        publicationDate: null,
        identifier: null,
        url: null,
        editionOrVersion: null
      }
    ]
  );
  for (const sourceFixture of fixture.sources) {
    assert.deepEqual(normalizeCourseSourceCommand({
      type: "save_source",
      sourceId: sourceFixture.sourceId,
      expectedSourceRevision: 0,
      source: sourceFixture.source
    }).source, sourceFixture.source);
    for (const anchor of sourceFixture.anchors) {
      const normalized = normalizeCourseSourceCommand({
        type: "save_anchor",
        anchorId: anchor.anchorId,
        sourceId: sourceFixture.sourceId,
        sourceRevision: anchor.sourceRevision,
        expectedAnchorRevision: 0,
        selector: anchor.selector,
        humanLocator: anchor.humanLocator,
        verificationExcerpt: anchor.verificationExcerpt
      });
      assert.equal(normalized.sourceRevision, sourceFixture.revision);
      assert.equal(anchor.status, "active");
    }
  }
  assert.equal(fixture.resumption.expected.doesNotExpose.includes("requestId"), true);
  assert.deepEqual(fixture.fileIntentCases.map(({ case: caseLabel }) => caseLabel), [
    "A", "B", "C", "D", "E", "F", "G", "H", "I"
  ]);
});

test("#222 — retomada recupera Fontes sem reupload e preserva proveniência histórica", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

  assert.equal(fixture.resumption.requiresPdfReupload, false);
  assert.equal(fixture.resumption.loadsPdfBytesByDefault, false);
  assert.deepEqual(
    fixture.resumption.recoveryPlan.map(({ tool, view = null, mode = null }) => ({
      tool, view, mode
    })),
    [
      { tool: "listarCursos", view: null, mode: null },
      { tool: "lerCurso", view: "summary", mode: null },
      { tool: "lerCurso", view: "instructional_plan", mode: null },
      { tool: "lerCurso", view: "course_sources", mode: "catalog" },
      { tool: "lerCurso", view: "course_sources", mode: "source" },
      { tool: "lerCurso", view: "course_source_attachment", mode: null }
    ]
  );
  assert.deepEqual(fixture.resumption.prohibitedOperations, [
    "incorporarPdfComoFonte", "uploadCourseSourcePdf"
  ]);
  assert.equal(
    fixture.resumption.sourceSummary,
    "O planejamento continua baseado no edital da Dataprev, na prova e no gabarito de 2024 e no PPC do IFSP. Esses documentos permanecem disponíveis no Curso."
  );
  assert.deepEqual(fixture.attributions.map(({ semanticTarget }) => semanticTarget), [
    "intended_learning_outcome",
    "instructional_analysis_unit",
    "evidence_requirement",
    "materialized_content"
  ]);
  assert.deepEqual(fixture.attributions.map(({ targetKind }) => targetKind), [
    "plan_item", "plan_item", "plan_item", "study_unit"
  ]);
  for (const attribution of fixture.attributions) {
    const normalized = normalizeCourseSourceCommand({
      type: "set_target_sources",
      targetKind: attribution.targetKind,
      targetId: attribution.targetId,
      expectedTargetVersion: attribution.expectedTargetVersion,
      sourceLinks: attribution.sourceLinks
    });
    assert.deepEqual(normalized.sourceLinks, attribution.sourceLinks);
  }

  const lifecycle = fixture.sourceLifecycle;
  const initialAnchor = fixture.sources.find(({ key }) => key === "edital").anchors[0];
  const newEdition = normalizeCourseSourceCommand({
    type: "save_source",
    sourceId: lifecycle.sourceId,
    expectedSourceRevision: lifecycle.newEdition.expectedSourceRevision,
    source: lifecycle.newEdition.source
  });
  assert.equal(lifecycle.initialRevision, 1);
  assert.equal(lifecycle.newEdition.revision, 2);
  assert.equal(newEdition.expectedSourceRevision, 1);
  assert.equal(lifecycle.newEdition.status, "active");
  assert.notEqual(lifecycle.newEdition.anchor.anchorId, initialAnchor.anchorId);
  assert.equal(lifecycle.newEdition.anchor.sourceRevision, 2);
  normalizeCourseSourceCommand({
    type: "save_anchor",
    anchorId: lifecycle.newEdition.anchor.anchorId,
    sourceId: lifecycle.sourceId,
    sourceRevision: lifecycle.newEdition.anchor.sourceRevision,
    expectedAnchorRevision: 0,
    selector: lifecycle.newEdition.anchor.selector,
    humanLocator: lifecycle.newEdition.anchor.humanLocator,
    verificationExcerpt: lifecycle.newEdition.anchor.verificationExcerpt
  });
  const retirement = normalizeCourseSourceCommand({
    type: "retire_source",
    sourceId: lifecycle.sourceId,
    expectedSourceRevision: lifecycle.retirement.expectedSourceRevision
  });
  assert.equal(retirement.expectedSourceRevision, 2);
  assert.deepEqual([
    lifecycle.initialRevision,
    lifecycle.newEdition.revision,
    lifecycle.retirement.revision
  ], [1, 2, 3]);
  assert.equal(lifecycle.retirement.status, "retired");
  assert.equal(lifecycle.retirement.preventsNewAttributions, true);
  assert.equal(lifecycle.retirement.preservesHistoricalAttributions, true);
  assert.deepEqual(
    lifecycle.historicalAttribution.sourceLinks,
    fixture.attributions[0].sourceLinks
  );
  assert.equal(
    lifecycle.historicalAttribution.sourceLinks[0].sourceRevision,
    lifecycle.initialRevision
  );
  assert.equal(
    lifecycle.historicalAttribution.sourceLinks[0].anchors[0].anchorId,
    initialAnchor.anchorId
  );
  assert.ok([
    "sourceId", "sourceRevision", "anchorId", "anchorRevision",
    "contentHash", "storagePath"
  ].every((field) => fixture.resumption.expected.doesNotExpose.includes(field)));
});

test("A–I — fixture normativa distingue análise temporária de PDF mantido no Curso", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const policy = fixture.fileIntentPolicy;
  const byCase = Object.fromEntries(
    fixture.fileIntentCases.map((intentCase) => [intentCase.case, intentCase])
  );

  assert.equal(policy.operation, "incorporarPdfComoFonte");
  assert.equal(
    policy.ambiguityQuestion,
    "Você quer usar este documento só nesta análise ou mantê-lo entre as Fontes do Curso?"
  );
  assert.deepEqual(policy.appliesInPhases, [
    "planning",
    "materialization",
    "part_revision",
    "audit",
    "correction",
    "legal_or_document_update",
    "bibliography",
    "student_observations",
    "research"
  ]);
  assert.equal(policy.successPredicate, "stored === true");
  assert.deepEqual(policy.normalResponseOmits, [
    "contentHash", "byteSize", "storagePath"
  ]);

  assert.equal(byCase.A.expected, "ingest_without_extra_confirmation");
  assert.equal(byCase.B.expected, "ingest_each_without_extra_confirmation");
  assert.equal(byCase.C.expected, "ingest_without_extra_confirmation");
  assert.equal(byCase.D.expected, "ask_exact_ambiguity_question");
  assert.equal(byCase.E.expected, "do_not_persist");
  assert.equal(byCase.F.expected, "reuse_without_duplicate");
  assert.equal(byCase.G.expected, "report_not_confirmed_without_success");
  assert.equal(byCase.H.expected, "explain_human_limit_without_technical_invention");
  assert.equal(byCase.I.expected, "ingest_then_disclose_available_technical_details");
});

test("orientação de intenção de PDF não exige frase mágica nem trata anexo como consentimento", () => {
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /qualquer fase da autoria/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /sem pergunta cerimonial/iu);
  assert.match(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /Você quer usar este documento só nesta análise ou mantê-lo entre as Fontes do Curso\?/u
  );
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /presença do anexo.*não autoriza persistência/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /stored igual a true/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /Falha de transferência.*nunca é sucesso/iu);
  assert.match(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /Antes de escrever, descreva e confirme/iu
  );
});
