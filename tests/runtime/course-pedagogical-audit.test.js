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

test("feedback de operação relacional ou procedural explica o raciocínio; reconhecimento simples continua válido", () => {
  const content = unit();
  content.feedback = [paragraph("f", "Correto.")];
  const practice = [{ evidenceRequirementId: "r1", invariantTaskOperation: "Comparar os mecanismos de recuperação" }];
  let audit = inspectPedagogicalEvidence({ content, practices: practice });
  assert.ok(audit.issues.some(issue => issue.code === "pedagogical_feedback_non_explanatory"));
  assert.equal(audit.observation.feedbackAssessment.requiresExplanatoryFeedback, true);

  content.feedback = [paragraph("f", "O TCP confirma o recebimento e retransmite o segmento perdido; o UDP não oferece essa recuperação.")];
  audit = inspectPedagogicalEvidence({ content, practices: practice, requirements: [{ id: "r1" }] });
  assert.deepEqual(audit.issues, []);

  content.feedback = [paragraph("f", "Correto.")];
  audit = inspectPedagogicalEvidence({ content, practices: [{
    evidenceRequirementId: "r1", invariantTaskOperation: "Reconhecer o protocolo apresentado"
  }], requirements: [{ id: "r1" }] });
  assert.deepEqual(audit.issues, []);
  assert.equal(audit.observation.feedbackAssessment.requiresExplanatoryFeedback, false);
});

test("feedback geral explicativo cobre rótulo curto de alternativa", () => {
  const content = unit();
  content.feedback = [paragraph("f", "A alternativa está correta porque o TCP confirma o recebimento e retransmite o segmento perdido; o UDP não oferece essa recuperação.")];
  content.response.data.options[0].feedback = "Correto.";
  const audit = inspectPedagogicalEvidence({ content,
    practices: [{ evidenceRequirementId: "r1", invariantTaskOperation: "Comparar os mecanismos de recuperação" }],
    requirements: [{ id: "r1" }] });
  assert.equal(audit.issues.some(issue => issue.code === "pedagogical_feedback_non_explanatory"), false);
  assert.equal(audit.observation.feedbackAssessment.genericOptionFeedback, true);
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
  assert.equal(normalizePedagogicalAudit(checks(), unit()).length, 6);
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

test("consistência exige aplicação instrucional presente na base focal", () => {
  const content = { id: "u", position: 1, title: "Relações", role: "theory", topics: [],
    content: [paragraph("p", "A explicação apresenta a relação entre nomes e endereços.")], response: null, feedback: [] };
  const basis = { targetKind: "study_unit", targetId: "u", microsequence: { goal: "Explicar relações" },
    planItems: [], studyUnits: [{ id: "u", content, application: null }], dependencies: [] };
  const report = { summary: "Base lida.", outcome: "consistent", findings: [], checks: checks() };
  assert.throws(() => requirePedagogicalAuditConsistency(report, basis), { code: "pedagogical_audit_unapplied_design" });
  basis.studyUnits[0].application = { contract: "aralearn.study-unit-design-application.v1", mode: "expository", practiceApplications: [] };
  assert.doesNotThrow(() => requirePedagogicalAuditConsistency(report, basis));
});

test("configuration pede juízo contextual sem impor alternância, prática extra ou alteração da condição fixa", () => {
  const studyUnits = Array.from({ length: 5 }, (_, index) => {
    const content = { ...unit(), id: `u${index}`, position: index + 1 };
    content.feedback = [paragraph("f", "Confirmações indicam recebimento; retransmissões recuperam perdas.")];
    if (index < 2) { content.role = "theory"; content.response = null; content.feedback = []; }
    return { id: content.id, content, application: { practiceApplications: [] }, design: { parameters: [
      { parameterId: "practice_distribution", value: "interleaved", origin: "automatic", reason: "Preferência contextual." },
      { parameterId: "practice_placement", value: "before_and_after", origin: "research_condition", reason: "Condição B." }
    ] } };
  });
  const basis = { targetKind: "microsequence_explanation", targetId: "ms", microsequence: { title: "TCP" }, studyUnits, planItems: [], dependencies: [] };
  const before = structuredClone(basis);
  const report = { summary: "Percurso lido.", outcome: "consistent", findings: [], checks: checks() };
  report.checks.at(-1).reason = "O julgamento confronta a preferência contextual com o percurso completo e explicita os limites do alvo; o esquema não decide sua realização pela ordem EEPPP.";
  assert.doesNotThrow(() => normalizePedagogicalAudit(report.checks, basis));
  assert.doesNotThrow(() => requirePedagogicalAuditConsistency(report, basis));
  assert.deepEqual(basis, before, "o juízo não muda conteúdo ou configuração");
  assert.throws(() => requirePedagogicalAuditConsistency({ ...report, checks: report.checks.slice(0, 5) }, basis),
    { code: "pedagogical_audit_configuration_required" });
  report.checks.at(-1).result = "insufficient";
  assert.throws(() => normalizeCourseContentInspectionReport(report));
  report.outcome = "needs_attention"; report.findings = ["A realização exige confronto adicional com o percurso pertinente."];
  assert.doesNotThrow(() => requirePedagogicalAuditConsistency(normalizeCourseContentInspectionReport(report), basis));
  const instruction = projectPedagogicalAudit(basis).instruction;
  assert.match(instruction, /Em configuration/u);
  assert.match(instruction, /Fixações e condições de pesquisa devem ser preservadas/u);
  assert.match(instruction, /sem forçar alternância, formatos ou prática extra/u);
});

test("banco conserva a segunda barreira para relatório incompleto e needs_attention", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
      create table private.test_inspection(value jsonb);
      create function private.course_ai_inspection_state_v1(uuid,text,text) returns jsonb language sql stable as $$
        select value from private.test_inspection limit 1 $$;`);
    await db.exec(await fs.readFile(new URL("../../supabase/migrations/20260924164623_revisao_v7_pedagogical_inspection.sql", import.meta.url), "utf8"));
    const migration = await fs.readFile(new URL("../../supabase/migrations/20260928110000_configuration_realization_inspection.sql", import.meta.url), "utf8");
    for (const name of ["valid_course_ai_inspection_report_v1", "complete_course_ai_inspection_report_v1", "course_ai_inspection_pending_v1"]) {
      const start = migration.indexOf(`create or replace function private.${name}(`);
      const end = migration.indexOf("$function$;", start);
      await db.exec(migration.slice(start, end + "$function$;".length));
    }
    const report = { summary: "Revisão", outcome: "consistent", findings: [], checks: checks() };
    assert.equal((await db.query("select private.valid_course_ai_inspection_report_v1($1::jsonb) valid", [JSON.stringify(report)])).rows[0].valid, true);
    for (const state of ["unregistered", "pending"]) {
      await db.query("insert into private.test_inspection values ($1::jsonb)", [JSON.stringify({ state })]);
      assert.equal((await db.query("select private.course_ai_inspection_pending_v1(null,null,null) pending")).rows[0].pending, true);
      await db.exec("delete from private.test_inspection");
    }
    report.checks[1].result = "insufficient";
    assert.equal((await db.query("select private.valid_course_ai_inspection_report_v1($1::jsonb) valid", [JSON.stringify(report)])).rows[0].valid, false);
    report.outcome = "needs_attention"; report.findings = ["Evidência insuficiente"];
    await db.query("insert into private.test_inspection values ($1::jsonb)", [JSON.stringify({ state: "current", report })]);
    assert.equal((await db.query("select private.course_ai_inspection_pending_v1(null,null,null) pending")).rows[0].pending, true);
  } finally { await db.close(); }
});

test("suficiência não se declara por metadados nem pela Explicação compartilhada" , () => {
  // A prosa do alvo não repete o título da Unidade nem o envelope do recurso: as
  // citações existem na base salva, mas em nada que o aluno lê neste alvo.
  const own = "A unidade apresenta objetivos, apoio e evidência observável no próprio alvo.";
  const shared = "A situação educativa articula objetivos, atividades, apoio e evidência num percurso desenvolvido para consulta.";
  const requirement = "Relacionar objetivos, atividades e evidência";
  const unitTitle = "Título que a prosa não repete";
  const content = { id: "u1", position: 1, title: unitTitle, role: "theory", topics: [],
    content: [paragraph("p1", own)], response: null, feedback: [] };
  const basis = { targetKind: "study_unit", targetId: "u1", audience: null,
    microsequence: { id: "ms", title: "Situação educativa", goal: "Relacionar objetivos e evidência",
      explanation: { title: "Situação educativa", content: [paragraph("e1", shared)] } },
    planItems: [{ id: "a1", kind: "instructional_analysis_unit", statement: requirement, description: "" }],
    studyUnits: [{ id: "u1", content, application: { mode: "expository", practiceApplications: [] } }],
    dependencies: [] };
  const judged = evidence => PEDAGOGICAL_AUDIT_DIMENSIONS.map(dimension => ({ dimension,
    result: "sufficient", reason: "Base examinada.", evidence }));
  // O título da própria Unidade, o nome do pacote, o título da microssequência, o
  // plano e a Explicação compartilhada existem na base, mas não são o texto
  // apresentado neste alvo: identificam ou declaram, não demonstram suficiência.
  for (const quote of ["Situação educativa", requirement, shared, unitTitle, "aralearn.resource.paragraph"]) {
    assert.throws(() => normalizePedagogicalAudit(judged([quote]), basis), error => {
      assert.equal(error.code, "invalid_pedagogical_audit");
      assert.match(error.message, /material apresentado ao aluno neste alvo/u);
      return true;
    });
  }
  assert.deepEqual(normalizePedagogicalAudit(judged([own]), basis), judged([own]));
  assert.throws(() => normalizePedagogicalAudit(judged(["Passagem que não existe"]), basis),
    { code: "invalid_pedagogical_audit" });
  // O packet não duplica a Explicação por alvo: a instrução aponta para a base
  // compartilhada, que já viaja em basis.microsequence.explanation.
  const packet = projectPedagogicalAudit(basis);
  assert.equal(Object.hasOwn(packet, "explicacaoCompartilhada"), false);
  assert.match(packet.instruction, /basis\.microsequence\.explanation/u);
});

test("auditoria expõe o percurso real e os apoios presentes para confrontar continuidade e cálculo", () => {
  const calculator = { id: "calc", package: "aralearn.resource.calculator", version: "1.0.0",
    data: { title: "Confira o cálculo", angleUnit: "radians" } };
  const studyUnits = [
    { id: "u1", content: { id: "u1", position: 1, title: "Estimar", role: "theory", topics: [],
      content: [paragraph("p1", "Estime o tempo antes de calcular a transmissão.")], response: null, feedback: [] },
      application: { mode: "expository", practiceApplications: [] } },
    { id: "u2", content: { id: "u2", position: 2, title: "Calcular a rota", role: "practice", topics: [],
      content: [calculator],
      response: { id: "r", package: "aralearn.response.gap", version: "1.0.0",
        data: { blanks: [{ id: "b", targetInstanceId: "calc", targetPath: "title", responseMode: "text", answer: "Confira o cálculo" }] } },
      feedback: [paragraph("f", "Some os segmentos e divida pela taxa para obter o tempo.")] },
      application: { mode: "practice", practiceApplications: [{ evidenceRequirementId: "r1",
        invariantTaskOperation: "Calcular o tempo de transmissão" }] } }
  ];
  const basis = { targetKind: "microsequence_explanation", targetId: "ms", audience: null,
    microsequence: { id: "ms", title: "Redes", goal: "Dimensionar o enlace", explanation: { title: "Redes", content: [] } },
    planItems: [{ id: "r1", kind: "evidence_requirement", statement: "Calcular o tempo", description: "" }],
    studyUnits, dependencies: [] };
  const audit = projectPedagogicalAudit(basis);
  assert.deepEqual(audit.percurso, [{ unitId: "u1", position: 1, title: "Estimar", mode: "expository" },
    { unitId: "u2", position: 2, title: "Calcular a rota", mode: "practice" }]);
  const practice = audit.units.find(unit => unit.unitId === "u2").observation;
  assert.deepEqual(practice.apoios, ["Calculadora"]);
  assert.deepEqual(practice.apoiosDoHost, []);
  assert.equal(practice.operacaoExigeCalculo, true);
  const estimation = audit.units.find(unit => unit.unitId === "u1").observation;
  assert.deepEqual(estimation.apoios, []);
  assert.deepEqual(estimation.apoiosDoHost, ["Calculadora"],
    "o host oferece a calculadora mesmo quando a autoria não a declarou");
  assert.equal(estimation.inicio, "Estime o tempo antes de calcular a transmissão.",
    "a abertura efetiva fica visível para confronto de continuidade");
  assert.match(audit.instruction, /apoios/u);
  assert.match(audit.instruction, /apoiosDoHost/u);
  assert.match(audit.instruction, /basis\.microsequence\.explanation/u);
  assert.match(audit.instruction, /inicio/u);
  assert.match(audit.instruction, /material apresentado neste alvo/u);
});

test("material cobre o retorno por alternativa, oculta folhas de avaliação e não confunde computador com cálculo", () => {
  const judged = quote => PEDAGOGICAL_AUDIT_DIMENSIONS.map(dimension => ({ dimension,
    result: "sufficient", reason: "Base examinada.", evidence: [quote] }));
  const basisFor = (response, text = "Os protocolos diferem na recuperação de perdas.") => ({ targetKind: "study_unit", targetId: "u1",
    microsequence: { title: "Transporte" }, planItems: [], dependencies: [],
    studyUnits: [{ id: "u1", application: { mode: "practice", practiceApplications: [] },
      content: { id: "u1", position: 1, title: "Título fora da prosa", role: "practice", topics: [],
        content: [paragraph("p", text)], response, feedback: [] } }] });
  const accepted = (basis, quote) => assert.doesNotThrow(() => normalizePedagogicalAudit(judged(quote), basis));
  const refused = (basis, quote) => assert.throws(() => normalizePedagogicalAudit(judged(quote), basis),
    { code: "invalid_pedagogical_audit" });
  const optionFeedback = "O TCP confirma o recebimento e retransmite o segmento perdido.";
  const choice = basisFor({ id: "r", package: "aralearn.response.choice", version: "1.0.0", data: {
    question: "Qual protocolo recupera as perdas?", selectionMode: "single", selectionCriterion: "correct",
    options: [{ id: "alt-tcp", kind: "text", text: "TCP", feedback: optionFeedback },
      { id: "alt-udp", kind: "text", text: "UDP", feedback: "O UDP não recupera as perdas." }], answerIds: ["alt-tcp"] } });
  // O retorno por alternativa é apresentado, embora a projeção acessível o omita;
  // enums de controle e identidades internas não são material apresentado.
  accepted(choice, optionFeedback);
  accepted(choice, "Qual protocolo recupera as perdas?");
  for (const control of ["single", "correct", "text", "selectionMode", "selectionCriterion", "alt-tcp", "alt-udp"]) {
    refused(choice, control);
  }
  const gap = basisFor({ id: "r", package: "aralearn.response.gap", version: "1.0.0", data: { prompt: "Complete o protocolo.",
    blanks: [{ id: "blank-interno", label: "protocolo", targetInstanceId: "p", targetPath: "text:recuperação", responseMode: "text",
      answer: "Fast Retransmit", acceptedAnswers: ["Retransmissão rápida"], distractors: ["Token Ring"] }] } });
  for (const hidden of ["text", "responseMode", "blank-interno", "Fast Retransmit", "Retransmissão rápida", "Token Ring"]) {
    refused(gap, hidden);
  }
  accepted(gap, "Complete o protocolo.");
  accepted(gap, "protocolo");
  accepted(gap, "Os protocolos diferem na recuperação de perdas.");
  const ordering = basisFor({ id: "r", package: "aralearn.response.ordering", version: "3.0.0", data: { targets: [
    { id: "t1", targetInstanceId: "p", targetPath: "text:primeiro" },
    { id: "t2", targetInstanceId: "p", targetPath: "text:segundo" }] } });
  for (const hidden of ["t1", "t2", "text:"]) refused(ordering, hidden);
  accepted(ordering, "Os protocolos diferem na recuperação de perdas.");
  // Valor de lacuna ainda oculto não conta como texto apresentado.
  const masked = basisFor({ id: "r", package: "aralearn.response.gap", version: "1.0.0", data: { prompt: "Informe o fim.",
    blanks: [{ id: "end", targetInstanceId: "p", targetPath: "text:0x100F", responseMode: "text", answer: "0x100F" }] } },
  "O intervalo de 0x1000 até 0x100F contém 16 bytes.");
  refused(masked, "0x100F");
  accepted(masked, "contém 16 bytes");
  const program = { id: "u", position: 1, title: "Programa", role: "theory", topics: [],
    content: [paragraph("p", "O computador carrega o programa na memória.")], response: null, feedback: [] };
  assert.equal(inspectPedagogicalEvidence({ content: program, practices: [{ evidenceRequirementId: "r1",
    invariantTaskOperation: "Explicar como o computador carrega o programa na memória" }] }).observation.operacaoExigeCalculo, false,
  "computador não é indício aritmético");
  assert.equal(inspectPedagogicalEvidence({ content: program, practices: [{ evidenceRequirementId: "r1",
    invariantTaskOperation: "Calcular o tempo de transmissão" }] }).observation.operacaoExigeCalculo, true);
});

test("texto visível de ordenação fundamenta o parecer sem aceitar alvos ocultos ou decorativos", () => {
  const labels = [
    "Os dados orientam o circuito que controla a emissão óptica.",
    "O emissor varia a luz segundo a modulação que representa esses dados.",
    "A luz modulada percorre o caminho até o receptor.",
    "O fotodiodo converte as variações de luz recebidas em um sinal elétrico.",
    "O processamento do receptor interpreta o sinal e recupera a informação, quando as condições do enlace permitem."
  ];
  const content = { id: "uo", position: 1, title: "Reconstruir a cadeia", role: "practice", topics: [],
    content: [paragraph("steps", labels.join(" "))],
    response: { id: "ro", package: "aralearn.response.ordering", version: "3.0.0", data: { targets: labels.map((answer, index) => ({
      id: `step-${index + 1}`, targetInstanceId: "steps", targetPath: `text:${index + 1}`, answer })) } },
    feedback: [paragraph("fo", "A sequência correta reconstrói a cadeia óptica até a recuperação dos dados.")] };
  const basisFor = value => ({ targetKind: "study_unit", targetId: "uo", microsequence: { title: "Comunicação por luz" },
    planItems: [], dependencies: [], studyUnits: [{ id: "uo", content: value,
      application: { mode: "practice", practiceApplications: [] } }] });
  const checksFor = evidence => PEDAGOGICAL_AUDIT_DIMENSIONS.map(dimension => ({ dimension, result: "sufficient",
    reason: "A cadeia aparece no material apresentado.", evidence: [evidence] }));
  const accepted = (value, quote) => assert.doesNotThrow(() => normalizePedagogicalAudit(checksFor(quote), basisFor(value)));
  const refused = (value, quote) => assert.throws(() => normalizePedagogicalAudit(checksFor(quote), basisFor(value)),
    { code: "invalid_pedagogical_audit" });
  assert.equal(validateStudyUnitEnvelope(content, RESOURCE_PACKAGE_REGISTRY).valid, true);
  assert.deepEqual(RESOURCE_PACKAGE_REGISTRY.validateStudyUnitRelations(content), []);
  const observation = inspectPedagogicalEvidence({ content }).observation;
  for (const label of labels) {
    assert.ok(observation.studentContent.some(item => item.text.includes(label)));
    accepted(content, label);
  }
  for (const hidden of ["step-1", "text:1", "aralearn.response.ordering@3.0.0"]) refused(content, hidden);
  const unlinked = structuredClone(content);
  unlinked.response.data.targets[0].answer = "Resposta sem ocorrência visível";
  assert.notDeepEqual(RESOURCE_PACKAGE_REGISTRY.validateStudyUnitRelations(unlinked), []);
  refused(unlinked, "Resposta sem ocorrência visível");
  const decorated = structuredClone(content);
  decorated.content[0].data.text = decorated.content[0].data.text.replace(labels[0], `**${labels[0]}**`);
  assert.notDeepEqual(RESOURCE_PACKAGE_REGISTRY.validateStudyUnitRelations(decorated), []);
  refused(decorated, labels[0]);
});
