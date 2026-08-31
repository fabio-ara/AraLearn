import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { COURSE_AUTHORING_SERVER_INSTRUCTIONS } from
  "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import { projectConversationalAuthoringToolSuccess } from
  "../../supabase/functions/_shared/aralearn-authoring/conversationalAuthoringProjection.js";
import { normalizeCourseSourceCommand } from
  "../../src/domain/courseSources.js";

const fixtureUrl = new URL(
  "../fixtures/conversational-authoring-resumption.v1.json",
  import.meta.url
);
const editalPdfFixtureUrl = new URL(
  "../fixtures/pdf/edital-dataprev-2026-perfil-13-pagina-44.pdf",
  import.meta.url
);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const NOMINAL_TECHNICAL_PATTERN = /\b(?:courseId|sourceId|sourceRevision|anchorId|anchorRevision|expectedRevision|expectedPlanVersion|requestId|storagePath|contentHash|CAS)\b/iu;

async function fixturePdfBytes(key) {
  if (key === "edital") return readFile(editalPdfFixtureUrl);
  return Buffer.from(
    "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n" +
    "trailer\n<< /Size 2 /Root 1 0 R >>\n" +
    `% AraLearn fixture sintética: ${key}\n` +
    "startxref\n45\n%%EOF\n",
    "utf8"
  );
}

async function runFileIntentHarness(intentCase, policy, ingest) {
  if (["clear_source", "late_source"].includes(intentCase.kind)) {
    const envelope = await ingest(intentCase);
    return projectConversationalAuthoringToolSuccess({
      toolName: policy.operation,
      envelope,
      summary: {
        outcome: "O PDF foi mantido entre as Fontes do Curso",
        change: "O documento passa a sustentar a tarefa indicada"
      }
    });
  }
  if (intentCase.kind === "ambiguous") {
    return { message: policy.ambiguityQuestion, success: false };
  }
  if (intentCase.kind === "discardable") {
    return {
      message: "Vou usar o documento somente nesta análise temporária, sem incorporá-lo ao Curso.",
      success: true
    };
  }
  throw new TypeError(`Caso de intenção fora do harness focal: ${intentCase.kind}`);
}

test("fixture conversacional Dataprev é sintética, segura e cobre a retomada planejada", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

  assert.equal(fixture.contract, "aralearn.conversational-authoring-regression.v1");
  assert.deepEqual(fixture.safety, {
    synthetic: true,
    mutableTargetAllowed: false,
    liveCourseLookupAllowed: false,
    pdfBytes: "generated-valid-synthetic-pdf-only"
  });
  assert.equal(fixture.course.title, "Dataprev: Gestão de Servidores");
  assert.equal(fixture.course.plan.complete, false);
  assert.equal(fixture.course.plan.partCount, 12);
  assert.equal(fixture.course.plan.parts.length, 12);
  assert.equal(fixture.course.materializationCount, 0);
  assert.equal(fixture.machineState.ownerAuthorized, true);
  assert.match(fixture.machineState.courseId, UUID_PATTERN);
  assert.match(fixture.machineState.planId, UUID_PATTERN);
  assert.equal(fixture.machineState.courseRevision, 19);
  assert.equal(fixture.machineState.planVersion, 3);
  assert.equal(fixture.machineState.partIds.length, 12);
  assert.equal(new Set(fixture.machineState.partIds).size, 12);
  assert.ok(fixture.machineState.partIds.every((partId) => UUID_PATTERN.test(partId)));
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
  assert.ok(fixture.sources.every(({ source, attachment, revision }) =>
    /fixture sintética/u.test(source.title) &&
    attachment.fileName.startsWith("fixture-") &&
    attachment.fileName.endsWith(".pdf") &&
    attachment.mediaType === "application/pdf" &&
    attachment.sourceRevision === revision &&
    attachment.stored === true));
  for (const { key, attachment } of fixture.sources) {
    const pdfBytes = await fixturePdfBytes(key);
    assert.equal(attachment.byteSize, pdfBytes.byteLength);
    assert.equal(
      attachment.contentHash,
      createHash("sha256").update(pdfBytes).digest("hex")
    );
    if (key === "edital") {
      const pdfStructure = pdfBytes.toString("latin1");
      assert.match(pdfStructure, /^%PDF-1\.[4-9]/u);
      assert.match(pdfStructure, /\/Type\s*\/Pages/u);
      assert.match(pdfStructure, /\/Count\s+44\b/u);
      assert.match(pdfStructure, /%%EOF\s*$/u);
    }
  }
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

test("#223 — fixture integrada separa estado técnico completo da retomada humana", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const technicalState = JSON.stringify({
    ...fixture.machineState,
    sources: fixture.sources,
    liveAttributions: fixture.liveAttributions
  });
  const response = fixture.resumption.semanticResponse;

  assert.match(
    technicalState,
    new RegExp(UUID_PATTERN.source.replace(/^\^|\$$/gu, ""), "u")
  );
  assert.match(technicalState, /contentHash/u);
  assert.match(technicalState, /sourceRevision/u);
  assert.match(technicalState, /anchorId/u);
  assert.match(response, /12 Partes/u);
  assert.match(response, /ainda não possui aulas/u);
  assert.match(response, /resultados de aprendizagem/u);
  assert.match(response, /conteúdos fundamentais/u);
  assert.match(response, /formas de verificar a aprendizagem/u);
  assert.match(response, /edital da Dataprev/u);
  assert.match(response, /prova e no gabarito da FGV/u);
  assert.match(response, /PPC do IFSP/u);
  assert.match(response, /requisitos de evidência/u);
  assert.doesNotMatch(response, NOMINAL_TECHNICAL_PATTERN);
  assert.doesNotMatch(response, /[0-9a-f]{64}/iu);
  assert.doesNotMatch(response, /[0-9a-f]{8}-[0-9a-f-]{27,}/iu);
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
  const attributionContracts = fixture.attributionExamples;
  const contentAttributionExample = attributionContracts.find(
    ({ targetKind }) => targetKind === "study_unit"
  );
  assert.deepEqual(fixture.liveAttributions, []);
  assert.ok(attributionContracts.slice(0, 3).every(
    ({ state, targetKind }) =>
      state === "example_after_plan_completion" && targetKind === "plan_item"
  ));
  assert.equal(
    contentAttributionExample.state,
    "example_after_future_materialization"
  );
  assert.deepEqual(attributionContracts.map(({ semanticTarget }) => semanticTarget), [
    "intended_learning_outcome",
    "instructional_analysis_unit",
    "evidence_requirement",
    "materialized_content"
  ]);
  assert.deepEqual(attributionContracts.map(({ targetKind }) => targetKind), [
    "plan_item", "plan_item", "plan_item", "study_unit"
  ]);
  for (const attribution of attributionContracts) {
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
    fixture.attributionExamples[0].sourceLinks
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
  assert.equal(
    byCase.A.utterance,
    "Este edital é a referência do que deve cair nesta Parte."
  );
  assert.equal(byCase.B.expected, "ingest_each_without_extra_confirmation");
  assert.equal(byCase.C.expected, "ingest_without_extra_confirmation");
  assert.match(byCase.C.utterance, /Curso já foi produzido/u);
  assert.match(byCase.C.utterance, /documentação do Kubernetes/u);
  assert.equal(byCase.D.expected, "ask_exact_ambiguity_question");
  assert.equal(byCase.E.expected, "do_not_persist");
  assert.equal(byCase.F.expected, "reuse_without_duplicate");
  assert.equal(byCase.G.expected, "report_not_confirmed_without_success");
  assert.equal(byCase.H.expected, "explain_human_limit_without_technical_invention");
  assert.equal(byCase.I.expected, "ingest_then_disclose_available_technical_details");
});

test("#223 — harness chama ingestão só para Fonte clara ou posterior", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const byKind = Object.fromEntries(
    fixture.fileIntentCases.map((intentCase) => [intentCase.kind, intentCase])
  );
  const calls = [];
  const ingest = async (intentCase) => {
    calls.push({ phase: intentCase.phase, utterance: intentCase.utterance });
    return {
      ok: true,
      requestId: "fixture-request-223-source",
      data: {
        stored: true,
        changed: true,
        contentHash: "f".repeat(64),
        storagePath: "private/fixture-source.pdf"
      }
    };
  };

  const clear = await runFileIntentHarness(
    byKind.clear_source,
    fixture.fileIntentPolicy,
    ingest
  );
  const late = await runFileIntentHarness(
    byKind.late_source,
    fixture.fileIntentPolicy,
    ingest
  );
  const ambiguous = await runFileIntentHarness(
    byKind.ambiguous,
    fixture.fileIntentPolicy,
    ingest
  );
  const discardable = await runFileIntentHarness(
    byKind.discardable,
    fixture.fileIntentPolicy,
    ingest
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ phase }) => phase), ["planning", "part_revision"]);
  assert.match(calls[0].utterance, /referência do que deve cair nesta Parte/u);
  assert.match(calls[1].utterance, /documentação do Kubernetes/u);
  for (const projected of [clear, late]) {
    assert.equal(projected.success, true);
    assert.match(projected.message, /mantido entre as Fontes do Curso/u);
    assert.doesNotMatch(projected.message, NOMINAL_TECHNICAL_PATTERN);
    assert.doesNotMatch(projected.message, /[0-9a-f]{64}|private\/fixture/iu);
  }
  assert.equal(ambiguous.success, false);
  assert.equal(ambiguous.message, fixture.fileIntentPolicy.ambiguityQuestion);
  assert.match(discardable.message, /somente nesta análise temporária/u);
  assert.match(discardable.message, /sem incorporá-lo ao Curso/u);
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
    /uma única aprovação da intenção ou fase.*não confirme cada chamada/isu
  );
});
