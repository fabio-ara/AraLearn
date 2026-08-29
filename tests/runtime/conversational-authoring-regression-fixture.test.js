import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { COURSE_AUTHORING_SERVER_INSTRUCTIONS } from
  "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";

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
    ["p. 44", "questões 45–51", "questões 45–51", "pp. 112–114", "pp. 123–124"]
  );
  assert.ok(fixture.sources.every(({ title, pdfFileName }) =>
    /fixture sintética/u.test(title) && pdfFileName.startsWith("fixture-") &&
    pdfFileName.endsWith(".pdf")));
  assert.equal(fixture.resumption.expected.doesNotExpose.includes("requestId"), true);
  assert.deepEqual(fixture.fileIntentCases.map(({ case: caseLabel }) => caseLabel), [
    "A", "B", "C", "D", "E", "F", "G", "H", "I"
  ]);
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
