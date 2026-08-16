import assert from "node:assert/strict";
import test from "node:test";

import { dispatchApplicationBack } from "../../src/ui/applicationBackNavigation.js";

test("Back respeita overlay, retorno do leitor, Autoria e Estudo antes de sair", () => {
  const order = [];
  const callbacks = {
    closeOverlay() {
      order.push("overlay");
      return false;
    },
    returnToAuthoring() {
      order.push("reader");
      return false;
    },
    handleAuthoringBack() {
      order.push("authoring");
      return false;
    },
    handleStudyBack() {
      order.push("study");
      return true;
    }
  };

  assert.equal(dispatchApplicationBack(callbacks), "study");
  assert.deepEqual(order, ["overlay", "reader", "authoring", "study"]);
});

test("Back interrompe a cadeia no primeiro destino que trata a ação", () => {
  for (const [handledAt, expected] of [
    [0, "overlay"],
    [1, "authoring-reader"],
    [2, "authoring"],
    [3, "study"]
  ]) {
    const calls = [];
    const handlers = Array.from({ length: 4 }, (_, index) => () => {
      calls.push(index);
      return index === handledAt;
    });
    assert.equal(dispatchApplicationBack({
      closeOverlay: handlers[0],
      returnToAuthoring: handlers[1],
      handleAuthoringBack: handlers[2],
      handleStudyBack: handlers[3]
    }), expected);
    assert.deepEqual(calls, Array.from({ length: handledAt + 1 }, (_, index) => index));
  }
});

test("Back só autoriza saída quando nenhuma superfície trata a ação", () => {
  assert.equal(dispatchApplicationBack(), "exit");
});
