import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { inspectPedagogicalEvidence, normalizePedagogicalAudit, projectPedagogicalAudit, requirePedagogicalAuditConsistency,
  PEDAGOGICAL_AUDIT_DIMENSIONS } from "../../src/domain/coursePedagogicalAudit.js";
import { normalizeCourseContentInspectionReport, isCourseContentInspectionSatisfied } from "../../src/domain/courseContentInspection.js";
import { validateStudyUnitEnvelope } from "../../src/resources/kernel/studyUnitEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const unit = () => ({ id: "u", position: 1, title: "Discriminar protocolos", role: "practice", topics: [],
  content: [paragraph("p", "TCP verifica a sequência e recupera perdas; UDP não garante essas operações.")],
  response: { id: "r", package: "aralearn.response.choice", version: "1.0.0", data: { question: "Qual protocolo recupera perdas?",
    selectionMode: "single", selectionCriterion: "correct", options: [{ id: "tcp", text: "TCP" }, { id: "udp", text: "UDP" }], answerIds: ["tcp"] } },
  feedback: [paragraph("f", "Critério de revisão para protocolos.")] });
const checks = () => PEDAGOGICAL_AUDIT_DIMENSIONS.map(dimension => ({ dimension, result: "sufficient",
  reason: "A relação entre perda e recuperação aparece no enunciado e no retorno.", evidence: ["TCP"] }));

test("JSON válido com feedback editorial não é suficiente para materialização", () => {
  const content = unit();
  assert.equal(validateStudyUnitEnvelope(content, RESOURCE_PACKAGE_REGISTRY).valid, true);
  const audit = inspectPedagogicalEvidence({ content });
  assert.deepEqual(audit.issues.map(issue => issue.code), ["pedagogical_editorial_feedback"]);
  assert.equal(audit.observation.question, content.response.data.question);
  assert.equal(audit.observation.correctAlternativeCount, 1);
});

test("feedback específico completo é considerado sem exigir um comentário geral redundante", () => {
  const content = unit();
  content.feedback = [];
  content.response.data.options[0].feedback = "O TCP usa confirmações e retransmissões para recuperar perdas.";
  content.response.data.options[1].feedback = "O UDP não fornece recuperação por retransmissão; essa operação cabe à aplicação.";
  assert.deepEqual(inspectPedagogicalEvidence({ content }).issues, []);
  delete content.response.data.options[1].feedback;
  assert.ok(inspectPedagogicalEvidence({ content }).issues.some(issue => issue.code === "pedagogical_feedback_missing"));
});

test("feedback específico não encobre bastidor no mesmo trecho, em outro bloco ou numa alternativa", () => {
  const specific = "O TCP confirma recebimentos e retransmite os segmentos perdidos.";
  for (const placement of ["same-paragraph", "other-block", "option"]) {
    const content = unit();
    content.feedback = [paragraph("f", specific)];
    if (placement === "same-paragraph") content.feedback[0].data.text += " Critério de revisão para protocolos: confira a finalidade declarada.";
    if (placement === "other-block") content.feedback.push(paragraph("editorial", "A operação-alvo da tarefa é identificar e localizar."));
    if (placement === "option") content.response.data.options[0].feedback = "Conteúdo salvo sem revisão autoral.";
    assert.equal(validateStudyUnitEnvelope(content, RESOURCE_PACKAGE_REGISTRY).valid, true);
    assert.ok(inspectPedagogicalEvidence({ content }).issues.some(issue => issue.code === "pedagogical_editorial_feedback"), placement);
  }
});

test("uma lacuna e single são legítimos; alternativas duplicadas e equivalentes incorretos não", () => {
  const content = unit();
  content.feedback = [paragraph("f", "TCP confirma os dados e retransmite os segmentos perdidos; UDP não faz essa recuperação.")];
  assert.deepEqual(inspectPedagogicalEvidence({ content }).issues, []);
  content.response.data.options[1].text = " tcp ";
  assert.equal(inspectPedagogicalEvidence({ content }).issues[0].code, "pedagogical_duplicate_alternatives");
  content.response = { id: "r", package: "aralearn.response.gap", version: "1.0.0", data: { blanks: [
    { id: "b", targetInstanceId: "p", targetPath: "text:TCP", responseMode: "choice", answer: "TCP", acceptedAnswers: ["Transmission Control Protocol"], distractors: ["Transmission Control Protocol"] }
  ] } };
  assert.equal(inspectPedagogicalEvidence({ content }).issues[0].code, "pedagogical_ambiguous_gap");
});

test("inspeção semântica exige evidência real e insuficiência não pode ser declarada consistente", () => {
  assert.equal(normalizePedagogicalAudit(checks(), unit()).length, 5);
  const fabricated = checks(); fabricated[0].evidence = ["Passagem que não existe"];
  assert.throws(() => normalizePedagogicalAudit(fabricated, unit()), { code: "invalid_pedagogical_audit" });
  const insufficient = checks(); insufficient[1].result = "insufficient";
  assert.throws(() => normalizeCourseContentInspectionReport({ summary: "Revisão", outcome: "consistent", findings: [], checks: insufficient }));
  const report = normalizeCourseContentInspectionReport({ summary: "A prática não recolhe a relação pedida.",
    outcome: "needs_attention", findings: ["A escolha identifica somente o nome."], checks: insufficient });
  assert.equal(isCourseContentInspectionSatisfied({ state: "current", report }), false);
  assert.equal(isCourseContentInspectionSatisfied({ state: "current", report: { summary: "Antigo", outcome: "consistent", findings: [] } }), false);
});

test("auditoria reconstrói o texto com lacunas e sinaliza respostas expostas fora delas sem confundir indício com defeito", () => {
  const content = unit();
  content.content = [paragraph("p", "O intervalo de 0x1000 até 0x100F contém 16 bytes. Portanto, de 0x1000 até 0x100F são 16 bytes.")];
  content.feedback = [paragraph("f", "Como os extremos são inclusivos, some um à diferença: 15 + 1 = 16.")];
  content.response = { id: "r", package: "aralearn.response.gap", version: "1.0.0", data: { blanks: [
    { id: "end", targetInstanceId: "p", targetPath: "text:end", responseMode: "text", answer: "0x100F" },
    { id: "size", targetInstanceId: "p", targetPath: "text:size", responseMode: "text", answer: "16 bytes" }
  ] } };
  assert.equal(validateStudyUnitEnvelope(content, RESOURCE_PACKAGE_REGISTRY).valid, true);
  let audit = inspectPedagogicalEvidence({ content });
  assert.match(audit.observation.studentContent[0].text, /até \[…\] contém \[…\]/u);
  assert.deepEqual(audit.observation.targets.map(target => target.answerAppearsInStudentText), [true, true]);
  assert.deepEqual(audit.issues, []);
  content.content[0].data.text = "O intervalo começa em 0x1000 e tem 16 bytes. O último endereço é 0x100F.";
  content.response.data.blanks = [content.response.data.blanks[0]];
  audit = inspectPedagogicalEvidence({ content });
  assert.equal(audit.observation.targets[0].answerAppearsInStudentText, false);
});

test("auditoria expõe o requisito e o que a resposta realmente recolhe, inclusive feedback específico", () => {
  const content = unit();
  content.response.data.options[0].feedback = "O TCP confirma e retransmite segmentos.";
  const basis = { targetKind: "study_unit", targetId: "u", microsequence: { goal: "Justificar como recuperar uma perda" },
    planItems: [{ id: "r1", kind: "evidence_requirement", statement: "Relacionar confirmação e retransmissão", description: "Explicar o caso de perda" }],
    studyUnits: [{ id: "u", content, application: { practiceApplications: [{ evidenceRequirementId: "r1", invariantTaskOperation: "Justificar o mecanismo" }] } }] };
  const packet = projectPedagogicalAudit(basis);
  assert.equal(packet.units[0].observation.objective, basis.microsequence.goal);
  assert.equal(packet.units[0].observation.requirements[0].statement, basis.planItems[0].statement);
  assert.equal(packet.units[0].observation.alternatives[0].feedback, content.response.data.options[0].feedback);
  assert.equal(packet.units[0].observation.alternatives[0].expected, true);
  const report = { summary: "Revisão", outcome: "consistent", findings: [], checks: checks() };
  assert.throws(() => requirePedagogicalAuditConsistency(report, basis), { code: "pedagogical_audit_contradiction" });
  content.feedback = [paragraph("f", "Confirmações indicam o recebimento; retransmissões recuperam perdas.")];
  report.checks[1].result = "not_applicable";
  assert.throws(() => requirePedagogicalAuditConsistency(report, basis), { code: "pedagogical_audit_not_applicable" });
  report.checks[1].result = "insufficient";
  report.outcome = "needs_attention";
  report.findings = ["Identificar TCP não recolhe a relação entre confirmação e retransmissão."];
  assert.doesNotThrow(() => requirePedagogicalAuditConsistency(report, basis));
});

test("banco conserva a segunda barreira para relatório incompleto e needs_attention", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
      create table private.test_inspection(value jsonb);
      create function private.course_ai_inspection_state_v1(uuid,text,text) returns jsonb language sql stable as $$
        select value from private.test_inspection limit 1 $$;`);
    await db.exec(await fs.readFile(new URL("../../supabase/migrations/20260924164623_revisao_v7_pedagogical_inspection.sql", import.meta.url), "utf8"));
    const report = { summary: "Revisão", outcome: "consistent", findings: [], checks: checks() };
    assert.equal((await db.query("select private.valid_course_ai_inspection_report_v1($1::jsonb) valid", [JSON.stringify(report)])).rows[0].valid, true);
    report.checks[1].result = "insufficient";
    assert.equal((await db.query("select private.valid_course_ai_inspection_report_v1($1::jsonb) valid", [JSON.stringify(report)])).rows[0].valid, false);
    report.outcome = "needs_attention"; report.findings = ["Evidência insuficiente"];
    await db.query("insert into private.test_inspection values ($1::jsonb)", [JSON.stringify({ state: "current", report })]);
    assert.equal((await db.query("select private.course_ai_inspection_pending_v1(null,null,null) pending")).rows[0].pending, true);
  } finally { await db.close(); }
});
