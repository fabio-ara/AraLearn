import test from "node:test";
import assert from "node:assert/strict";

import { parseAuditText, parseCardSlotText, parsePipeList, parseTopDownAuditText } from "../../src/generation/engine/slotParser.js";

test("parser classifica accepted, missing, invalid, duplicate e extra", () => {
  const parsed = parseCardSlotText(`
CARD 1
1: 101
2: 101
3: 1101
3: 1102
6: razão
99: sobra
`, {
    cards: [
      {
        position: 1,
        slots: [
          { index: 1, label: "resourceCode", type: "code", family: "resource" },
          { index: 2, label: "operationCode", type: "code", family: "operation" },
          { index: 3, label: "didacticMoveCode", type: "code", family: "didacticMove" },
          { index: 4, label: "probableMistakeCode", type: "code", family: "probableMistake" },
          { index: 6, label: "reason", type: "text" }
        ]
      }
    ]
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.cards[0].accepted["1"].value, 101);
  assert.equal(parsed.cards[0].missing[0].index, 4);
  assert.equal(parsed.cards[0].invalid[0].index, 2);
  assert.equal(parsed.cards[0].duplicate[0].index, 3);
  assert.equal(parsed.cards[0].extra[0].index, 99);
});

test("parser de auditoria registra patch não numérico como inválido", () => {
  const parsed = parseAuditText(`
AUDIT
status: 1202
CARD 1
action: 1202
values: [
8: novo distrator
`);
  assert.equal(parsed.status, 1202);
  assert.equal(parsed.cards[0].action, 1202);
  assert.equal(parsed.cards[0].patches["8"], "novo distrator");
  assert.equal(parsed.cards[0].invalidPatches[0].key, "values");
  assert.deepEqual(parsePipeList("A | B | C"), ["A", "B", "C"]);
});

test("parser top-down rejeita patch inline e aceita patch multiline", () => {
  const statusOnly = parseTopDownAuditText("STATUS OK");
  assert.equal(statusOnly.status, 1201);
  assert.equal(statusOnly.invalidPatches.length, 0);

  const invalid = parseTopDownAuditText(`PATCH MICROSEQUENCE "Matriz transposta" dependsOn "Posição a_ij"`);
  assert.equal(invalid.patches.length, 0);
  assert.equal(invalid.invalidPatches.length, 1);

  const valid = parseTopDownAuditText(`
PATCH MICROSEQUENCE
target: Matriz transposta
dependsOn: Posição a_ij
goal: Ler a transposta sem abrir novo tópico
`);
  assert.equal(valid.invalidPatches.length, 0);
  assert.equal(valid.patches[0].target, "Matriz transposta");
  assert.equal(valid.patches[0].fields.dependsOn, "Posição a_ij");

  const normalized = parseTopDownAuditText(`
PATCH MICROSEQUENCE
target: Matriz transposta
dependsOn: [Posição a_ij]
target: Identificando linhas
moveAfter: [Posição a_ij]
`);
  assert.equal(normalized.invalidPatches.length, 0);
  assert.equal(normalized.patches.length, 2);
  assert.equal(normalized.patches[0].fields.dependsOn, "Posição a_ij");
  assert.equal(normalized.patches[1].fields.moveAfter, "Posição a_ij");

  const bullets = parseTopDownAuditText(`
PATCH MICROSEQUENCE
- target: Identificando linhas
- moveAfter:
- checks: o aluno reconhece linhas
`);
  assert.equal(bullets.invalidPatches.length, 0);
  assert.equal(bullets.patches[0].target, "Identificando linhas");
  assert.equal("moveAfter" in bullets.patches[0].fields, false);

  const contradictory = parseTopDownAuditText(`
PATCH MICROSEQUENCE
target: Matriz transposta
dependsOn: Posição a_ij
STATUS OK
`);
  assert.equal(contradictory.patches.length, 1);
  assert.equal(contradictory.status, 1201);
  assert.equal(contradictory.invalidGlobalLines.length, 1);
  assert.match(contradictory.invalidGlobalLines[0].reason, /não pode misturar/i);
});

test("enum answerId aceita normalização estrutural de 1 2 3 para a b c", () => {
  const parsed = parseCardSlotText(`
CARD 1
10: 2
`, {
    cards: [
      {
        position: 1,
        slots: [
          { index: 10, label: "answerId", type: "enum", allowedValues: ["a", "b", "c"] }
        ]
      }
    ]
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.cards[0].accepted["10"].value, "b");
});
