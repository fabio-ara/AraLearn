import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCardAssistanceLedgerTurn,
  assertCardAssistanceLedgerCurrent,
  cardAssistanceLedgerContext,
  createCardAssistanceLedger,
  listCardAssistanceLedgerVersions,
  redoCardAssistanceLedger,
  restoreCardAssistanceLedgerVersion,
  undoCardAssistanceLedger
} from "../../src/assist/cardAssistanceLedger.js";

const selection = Object.freeze({
  courseKey: "curso",
  moduleKey: "modulo",
  lessonKey: "licao",
  microsequenceKey: "micro",
  cardKey: "card"
});

function card(text, position = 1) {
  return {
    id: "card",
    position,
    title: text,
    role: "theory",
    content: [],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
}

function append(ledger, before, after, request = after.title) {
  return appendCardAssistanceLedgerTurn(ledger, {
    beforeCard: before,
    afterCard: after,
    operation: "edit_text",
    request,
    assistantResponse: `Apliquei ${after.title}.`,
    scope: "card",
    textPatch: [{ path: "title", value: after.title }]
  });
}

test("ledger preserva versões exatas e percorre undo, redo e restauração", () => {
  const base = card("Base");
  const first = card("Primeira");
  const second = card("Segunda");
  let ledger = createCardAssistanceLedger({ selection, card: base });
  ledger = append(ledger, base, first).ledger;
  ledger = append(ledger, first, second).ledger;
  assert.deepEqual(ledger.turns[0].patch, {
    kind: "text",
    edits: [{ path: "title", value: "Primeira" }]
  });

  const undone = undoCardAssistanceLedger(ledger);
  assert.equal(undone.changed, true);
  assert.deepEqual(undone.card, first);
  const redone = redoCardAssistanceLedger(undone.ledger);
  assert.deepEqual(redone.card, second);
  const restored = restoreCardAssistanceLedgerVersion(redone.ledger, "v0");
  assert.deepEqual(restored.card, base);
  assert.equal(cardAssistanceLedgerContext(restored.ledger).length, 0);
});

test("nova edição após undo abre ramo ativo e elimina redo dessa conversa", () => {
  const base = card("Base");
  const first = card("Primeira");
  const abandoned = card("Ramo abandonado");
  const replacement = card("Novo ramo");
  let ledger = createCardAssistanceLedger({ selection, card: base });
  ledger = append(ledger, base, first).ledger;
  ledger = append(ledger, first, abandoned).ledger;
  ledger = undoCardAssistanceLedger(ledger).ledger;
  const branched = append(ledger, first, replacement, "Mude de direção");
  assert.deepEqual(branched.supersededVersionIds, ["v2"]);
  assert.equal(redoCardAssistanceLedger(branched.ledger).changed, false);
  assert.deepEqual(
    cardAssistanceLedgerContext(branched.ledger).map(({ userRequest }) => userRequest),
    ["Primeira", "Mude de direção"]
  );
  const versions = listCardAssistanceLedgerVersions(branched.ledger);
  assert.equal(versions.find(({ id }) => id === "v2").active, false);
});

test("no-op permanece na conversa sem criar versão, e falha não vira turno", () => {
  const base = card("Base");
  const ledger = createCardAssistanceLedger({ selection, card: base });
  const noop = appendCardAssistanceLedgerTurn(ledger, {
    beforeCard: base,
    afterCard: structuredClone(base),
    operation: "edit_text",
    outcome: "no-op",
    request: "Explique por que o texto deve permanecer.",
    assistantResponse: "O texto já explicita o conceito sem pressupostos ocultos.",
    scope: "card"
  });
  assert.equal(noop.applied, false);
  assert.equal(noop.recorded, true);
  assert.equal(noop.reason, "no-op");
  assert.equal(noop.ledger.turns.length, 1);
  assert.equal(noop.ledger.versions.length, 1);
  assert.equal(noop.ledger.cursorVersionId, "v0");
  assert.deepEqual(cardAssistanceLedgerContext(noop.ledger), [{
    turn: 1,
    operation: "edit_text",
    userRequest: "Explique por que o texto deve permanecer.",
    assistantResponse: "O texto já explicita o conceito sem pressupostos ocultos.",
    appliedTo: ["card"],
    versionId: "v0",
    outcome: "no-op"
  }]);

  const failure = appendCardAssistanceLedgerTurn(ledger, {
    beforeCard: base,
    afterCard: structuredClone(base),
    outcome: "error"
  });
  assert.equal(failure.applied, false);
  assert.equal(failure.ledger.turns.length, 0);
  assert.throws(() => assertCardAssistanceLedgerCurrent(ledger, card("Alteração externa")), {
    code: "STALE_CARD_ASSISTANCE_LEDGER"
  });
});

test("ledger volátil mantém no máximo oito transições e nove versões", () => {
  let current = card("v0");
  let ledger = createCardAssistanceLedger({ selection, card: current });
  for (let index = 1; index <= 12; index += 1) {
    const next = card(`v${index}`);
    ledger = append(ledger, current, next).ledger;
    current = next;
  }
  assert.equal(ledger.turns.length, 8);
  assert.equal(ledger.versions.length, 9);
  assert.equal(ledger.activePath.length, 9);
  assert.deepEqual(assertCardAssistanceLedgerCurrent(ledger, current), ledger);
});

test("ledger limita a oito turnos mesmo quando explicações não criam versões", () => {
  const base = card("Base");
  let ledger = createCardAssistanceLedger({ selection, card: base });
  for (let index = 1; index <= 12; index += 1) {
    ledger = appendCardAssistanceLedgerTurn(ledger, {
      beforeCard: base,
      afterCard: structuredClone(base),
      operation: "edit_text",
      outcome: "no-op",
      request: `Pergunta ${index}`,
      assistantResponse: `Explicação ${index}`,
      scope: "card"
    }).ledger;
  }
  assert.equal(ledger.turns.length, 8);
  assert.equal(ledger.versions.length, 1);
  assert.equal(ledger.activePath.length, 1);
  assert.deepEqual(
    cardAssistanceLedgerContext(ledger).map(({ userRequest }) => userRequest),
    Array.from({ length: 8 }, (_item, index) => `Pergunta ${index + 5}`)
  );
});
