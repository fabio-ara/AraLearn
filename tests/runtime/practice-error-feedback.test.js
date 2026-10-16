
import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { responseAuthoredFeedback, responseFeedbackMessages, responseFeedbackStates } from "../../src/resources/sdk/responseFeedback.js";
import { inspectPedagogicalEvidence, pedagogicalAuditScopes } from "../../src/domain/coursePedagogicalAudit.js";
import { validateStudyUnitEnvelope } from "../../src/resources/kernel/studyUnitEnvelope.js";
import { practiceErrorFeedbackFixtures } from "../support/studyExplanationFixture.js";

const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const gapInstance = (blanks) => ({ id: "r", package: "aralearn.response.gap", version: "1.0.0", data: { blanks } });
const orderInstance = (targets) => ({ id: "r", package: "aralearn.response.ordering", version: "3.0.0", data: { targets } });
const choiceInstance = (data) => ({ id: "r", package: "aralearn.response.choice", version: "1.0.0", data });
const render = (instance, options) => RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, "response", options);
const tinyCount = (html) => (html.match(/<p class="tiny">/gu) || []).length;
const countOf = (html, pattern) => (html.match(pattern) || []).length;

const COMMUNICATION_TEXT = "O socket é a interface local do processo. A conexão relaciona as duas pontas e só existe após connect(). " +
  "Antes disso o processo apenas prepara os dados. Depois, cada extremidade usa uma porta para identificar o serviço.";
const communicationBlanks = () => [
  { id: "iface", targetInstanceId: "p", targetPath: "text:socket", responseMode: "text", answer: "socket",
    acceptedAnswers: ["Socket"], feedback: "O socket é a interface local; ele não representa a conexão entre as pontas." },
  { id: "call", targetInstanceId: "p", targetPath: "text:connect", responseMode: "text", answer: "connect()",
    feedback: "A interface local existe antes da chamada connect()." },
  { id: "port", targetInstanceId: "p", targetPath: "text:porta", responseMode: "text", answer: "porta",
    feedback: "A porta identifica o serviço em uso naquela extremidade." }
];
const communicationUnit = (blanks) => ({ id: "u", position: 1, title: "Papéis na comunicação", role: "practice", topics: [],
  content: [paragraph("p", COMMUNICATION_TEXT)], response: gapInstance(blanks), feedback: [] });

test("lacuna: só a lacuna efetivamente errada recebe retorno, com equivalentes aceitos", () => {
  const studyUnit = communicationUnit(communicationBlanks());
  assert.deepEqual(validateStudyUnitEnvelope(studyUnit, RESOURCE_PACKAGE_REGISTRY).errors, []);
  const state = RESOURCE_PACKAGE_REGISTRY.createResponseState(studyUnit.response);
  state.values = ["Socket", "connect()", "portas"];
  assert.equal(RESOURCE_PACKAGE_REGISTRY.submitResponseState(studyUnit.response, state, { studyUnit }), false);
  assert.equal(state.feedback, "wrong");
  const wrong = render(studyUnit.response, { blockKey: "blk", responseState: state });
  assert.match(wrong, /A porta identifica o serviço em uso naquela extremidade\./u);
  assert.equal(wrong.includes("O socket é a interface local;"), false);
  assert.equal(wrong.includes("A interface local existe antes da chamada connect()."), false);
});

test("lacuna: sem avaliação da tentativa nenhum retorno autoral é presumido", () => {
  const instance = gapInstance(communicationBlanks());
  const wrong = render(instance, { blockKey: "blk", responseState: { values: [], feedback: "wrong" } });
  assert.equal(tinyCount(wrong), 1);
  assert.match(wrong, /<p class="tiny">Incorreto\. Tente novamente\.<\/p>/u);
  const parcial = render(instance, { blockKey: "blk",
    responseState: { values: [], feedback: "wrong", results: [{ id: "iface", correct: true }, { id: "call", correct: true }, { id: "port", correct: false }] } });
  assert.equal(tinyCount(parcial), 1);
  assert.equal(countOf(parcial, /runtime-markdown-paragraph/gu), 1);
  assert.match(parcial, /A porta identifica o serviço/u);
});

test("lacuna: o acerto mostra só o rótulo e limpa o retorno do erro", () => {
  const instance = gapInstance(communicationBlanks());
  const correct = render(instance, { blockKey: "blk",
    responseState: { values: [], feedback: "correct", results: [{ id: "port", correct: false }] } });
  assert.match(correct, /<p class="tiny">Correto\.<\/p>/u);
  assert.equal(correct.includes("A porta identifica o serviço"), false);
  const incomplete = render(instance, { blockKey: "blk",
    responseState: { values: [], feedback: "incomplete", results: [{ id: "port", correct: false }] } });
  assert.match(incomplete, /<p class="tiny">Complete todas as lacunas\.<\/p>/u);
  assert.equal(incomplete.includes("A porta identifica o serviço"), false);
});

test("ordenação: só os itens fora da posição recebem retorno", () => {
  const instance = orderInstance([
    { id: "a", targetInstanceId: "p1", targetPath: "text", answer: "A", feedback: "A abre o ciclo." },
    { id: "b", targetInstanceId: "p2", targetPath: "text", answer: "B", feedback: "B replica depois de A." },
    { id: "c", targetInstanceId: "p3", targetPath: "text", answer: "C", feedback: "C consome o quadro replicado." },
    { id: "d", targetInstanceId: "p4", targetPath: "text", answer: "D", feedback: "D encerra o ciclo." }
  ]);
  const wrong = render(instance, { blockKey: "blk", responseState: { order: ["a", "c", "b", "d"], feedback: "wrong" } });
  assert.match(wrong, /A ordem ainda não está correta\./u);
  assert.match(wrong, /B replica depois de A\./u);
  assert.match(wrong, /C consome o quadro replicado\./u);
  assert.equal(wrong.includes("A abre o ciclo."), false);
  assert.equal(wrong.includes("D encerra o ciclo."), false);
  const semOrdem = render(instance, { blockKey: "blk", responseState: { feedback: "wrong" } });
  assert.equal(tinyCount(semOrdem), 1);
  const correct = render(instance, { blockKey: "blk", responseState: { order: ["a", "b", "c", "d"], feedback: "correct" } });
  assert.equal(correct.includes("B replica depois de A."), false);
});

test("escolha: o retorno segue a alternativa marcada e a observação declara a condição", () => {
  const data = { question: "Qual recupera perdas?", selectionMode: "single", selectionCriterion: "correct",
    options: [{ id: "tcp", text: "TCP", feedback: "Confirmações e retransmissões recuperam perdas." },
      { id: "udp", text: "UDP", feedback: "O UDP não recupera perdas por retransmissão." }], answerIds: ["tcp"] };
  const instance = choiceInstance(data);
  const wrong = render(instance, { blockKey: "blk", responseState: { selected: ["udp"], feedback: "wrong" } });
  assert.equal(tinyCount(wrong), 1);
  assert.match(wrong, /O UDP não recupera perdas por retransmissão\./u);
  assert.equal(wrong.includes("Confirmações e retransmissões recuperam perdas."), false);
  const states = responseFeedbackStates("aralearn.response.choice", data);
  assert.deepEqual(states.wrong.map(({ origin }) => origin), ["default", "author", "author"]);
  assert.ok(states.wrong.filter(({ origin }) => origin === "author").every(({ condition }) => condition === "marked"));
  assert.deepEqual(responseAuthoredFeedback("aralearn.response.choice", data).map(({ scope, condition }) => [scope, condition]),
    [["options[0]", "marked"], ["options[1]", "marked"]]);
});

test("a observação declara condição em vez de afirmar o que o estudante viu", () => {
  const cases = [
    ["aralearn.response.choice", { options: [{ id: "a", text: "A", feedback: "Texto A." }], answerIds: ["a"] }],
    ["aralearn.response.gap", { blanks: [{ id: "b", responseMode: "text", answer: "A", feedback: "Texto B." }] }],
    ["aralearn.response.ordering", { targets: [{ id: "t", answer: "A", feedback: "Texto C." }] }]
  ];
  for (const [packageId, data] of cases) {
    const states = responseFeedbackStates(packageId, data);
    for (const state of Object.keys(states)) {
      for (const entry of states[state]) {
        if (entry.origin === "author") assert.ok(["marked", "wrong"].includes(entry.condition), packageId + " " + state);
        else assert.equal(entry.condition, undefined, packageId + " " + state);
      }
    }
    assert.equal(states.incomplete.some(({ origin }) => origin === "author"), false, packageId);
  }
});

test("auditoria distingue estado, origem e escopo por componente", () => {
  const content = communicationUnit(communicationBlanks());
  const audit = inspectPedagogicalEvidence({ content });
  assert.deepEqual(audit.observation.feedbackStates.wrong.map(({ origin }) => origin), ["default", "author", "author", "author"]);
  assert.deepEqual(audit.observation.feedbackStates.correct.map(({ origin }) => origin), ["default"]);
  assert.deepEqual(audit.observation.feedbackStates.incomplete.map(({ origin }) => origin), ["default"]);
  assert.equal(audit.observation.feedbackStates.wrong[1].condition, "wrong");
  assert.deepEqual(audit.observation.feedbackStates.wrong.slice(1).map(({ scope }) => scope),
    ["blanks[0]", "blanks[1]", "blanks[2]"]);
  const theory = { id: "t", position: 1, title: "Teoria", role: "theory", topics: [],
    content: [paragraph("p", "Texto sem prática.")], response: null, feedback: [] };
  assert.equal(Object.hasOwn(inspectPedagogicalEvidence({ content: theory }).observation, "feedbackStates"), false);
});

test("o retorno autoral entra no material de ancoragem e o rótulo padrão não", () => {
  const content = communicationUnit(communicationBlanks());
  const scopes = pedagogicalAuditScopes({ targetKind: "study_unit", targetId: "u",
    microsequence: { title: "t", explanation: null }, studyUnits: [{ id: "u", content }], planItems: [], dependencies: [] });
  assert.ok(scopes.material.some((passage) => passage.includes("a porta identifica o serviço")));
  assert.equal(scopes.material.some((passage) => passage.includes("incorreto. tente novamente")), false);
});

test("retornos longos e múltiplos não são truncados e mantêm os controles no mesmo bloco", () => {
  const longText = "A interface local do processo não representa a conexão inteira entre as pontas; ";
  const blanks = ["socket", "connect()", "prepara", "porta"].map((answer, index) => ({
    id: "b" + index, targetInstanceId: "p", targetPath: "text:" + answer, responseMode: "text", answer,
    feedback: "Retorno " + (index + 1) + ": " + longText.repeat(3)
  }));
  const instance = gapInstance(blanks);
  const wrong = render(instance, { blockKey: "blk",
    responseState: { values: [], feedback: "wrong", results: blanks.map(({ id }) => ({ id, correct: false })) } });
  assert.ok(wrong.includes(blanks[3].feedback.trim()), "o retorno longo permanece inteiro");
  assert.equal(tinyCount(wrong), 1);
  assert.equal(countOf(wrong, /runtime-markdown-paragraph/gu), blanks.length);
  assert.equal(countOf(wrong, /data-action="complete-view-answer"/gu), 1);
  assert.equal(countOf(wrong, /data-action="complete-try-again"/gu), 1);
  assert.equal(countOf(wrong, /inline-feedback err has-actions/gu), 1);
});

test("as práticas locais da prova de UI são válidas e exibem o retorno autoral no erro", () => {
  for (const [kind, fixture] of Object.entries(practiceErrorFeedbackFixtures)) {
    const studyUnit = { id: "ui-" + kind, position: 2, title: "Justifique os papéis no caso", role: "practice", topics: [],
      content: structuredClone(fixture.content), response: structuredClone(fixture.response), feedback: [] };
    assert.deepEqual(validateStudyUnitEnvelope(studyUnit, RESOURCE_PACKAGE_REGISTRY).errors, [], kind);
    const data = studyUnit.response.data;
    const outcomeState = kind.startsWith("ordering")
      ? { order: data.targets.map(({ id }) => id).slice(1).concat(data.targets[0].id), feedback: "wrong" }
      : { values: [], feedback: "wrong", results: (data.blanks || []).map(({ id }) => ({ id, correct: false })) };
    const wrong = render(studyUnit.response, { blockKey: "ui", responseState: outcomeState });
    for (const message of responseAuthoredFeedback(studyUnit.response.package, data)) {
      assert.ok(wrong.includes(message.text), "retorno autoral exibido em " + kind);
    }
    const correct = render(studyUnit.response, { blockKey: "ui", responseState: { ...outcomeState, feedback: "correct" } });
    for (const message of responseAuthoredFeedback(studyUnit.response.package, data)) {
      assert.equal(correct.includes(message.text), false, "acerto sem retorno de erro em " + kind);
    }
  }
});

test("estado desconhecido cai no retorno do erro, como antes", () => {
  const instance = gapInstance(communicationBlanks());
  const unknown = render(instance, { blockKey: "blk",
    responseState: { values: [], feedback: "estado-inesperado", results: [{ id: "port", correct: false }] } });
  assert.match(unknown, /Incorreto\. Tente novamente\./u);
  assert.match(unknown, /A porta identifica o serviço/u);
  assert.deepEqual(responseFeedbackMessages("aralearn.response.gap", instance.data, "wrong",
    { wrongIds: ["port"] }).map(({ origin }) => origin), ["default", "author"]);
});

test("a variante com retorno autoral usa grupo em largura e controles em linha própria", () => {
  const gapWrong = render(gapInstance(communicationBlanks()), { blockKey: "blk",
    responseState: { values: [], feedback: "wrong", results: communicationBlanks().map(({ id }) => ({ id, correct: false })) } });
  const orderWrong = render(orderInstance([
    { id: "a", targetInstanceId: "p1", targetPath: "text", answer: "A", feedback: "A abre o ciclo." },
    { id: "b", targetInstanceId: "p2", targetPath: "text", answer: "B", feedback: "B replica depois de A." }
  ]), { blockKey: "blk", responseState: { order: ["b", "a"], feedback: "wrong" } });
  for (const [label, html, returns] of [["lacuna", gapWrong, 3], ["ordenação", orderWrong, 2]]) {
    assert.match(html, /class="inline-feedback err has-actions has-authorial-returns"/u, label + ": variante com retornos");
    const groupAt = html.indexOf('<div class="runtime-feedback-group">');
    const iconsAt = html.indexOf('<div class="feedback-icons">');
    assert.ok(groupAt >= 0 && iconsAt > groupAt, label + ": grupo antes dos controles");
    assert.equal(countOf(html.slice(groupAt, iconsAt), /<\/div>/gu), 1, label + ": um único grupo antes dos controles");
    assert.equal(countOf(html, /runtime-markdown-paragraph/gu), returns, label + ": retornos em prosa");
    assert.equal(countOf(html, /<p class="tiny">/gu), 1, label + ": só o rótulo em linha densa");
    assert.equal(countOf(html, /inline-feedback err has-actions/gu), 1, label + ": um único bloco de erro");
  }
});

test("sem retorno autoral o markup do bloco continua o anterior", () => {
  const instance = gapInstance(communicationBlanks());
  const semRetorno = render(instance, { blockKey: "blk", responseState: { values: [], feedback: "wrong" } });
  assert.match(semRetorno,
    /^<div class="inline-feedback err has-actions" data-complete-feedback-block-key="blk"><p class="tiny">Incorreto\. Tente novamente\.<\/p><div class="feedback-icons">/u);
  assert.equal(semRetorno.includes("runtime-feedback-group"), false);
  assert.equal(semRetorno.includes("has-authorial-returns"), false);
  assert.equal(tinyCount(semRetorno), 1);
  const correto = render(instance, { blockKey: "blk", responseState: { values: [], feedback: "correct" } });
  assert.match(correto, /^<div class="inline-feedback ok" data-complete-feedback-block-key="blk"><p class="tiny">Correto\.<\/p><\/div>$/u);
  const incompleto = render(instance, { blockKey: "blk", responseState: { values: [], feedback: "incomplete" } });
  assert.match(incompleto, /^<div class="inline-feedback warn" role="alert" aria-live="assertive" data-complete-feedback-block-key="blk"><p class="tiny">Complete todas as lacunas\.<\/p><\/div>$/u);
});
