import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("Estudo não converte ausência de histórico em subida hierárquica", async () => {
  const source = await readFile(new URL(
    "../../src/study/CourseStudyApplication.js",
    import.meta.url
  ), "utf8");
  const goBackStart = source.indexOf("  function goBack()");
  assert.ok(goBackStart >= 0);
  const goBack = source.slice(goBackStart).match(
    /^[ ]{2}function goBack\(\) \{[\s\S]*?^[ ]{2}\}\r?$/mu
  )?.[0] || "";
  assert.ok(goBack);
  assert.match(goBack, /const previous = state\.navigationHistory\.pop\(\)/u);
  assert.match(goBack, /if \(previous\) return restoreNavigationSnapshot\(previous\);\s*return false;/u);
  assert.doesNotMatch(goBack, /goUp\(/u);
});

test("entrada nova pela Home abre o Curso sem salto implícito para uma Unidade", async () => {
  const source = await readFile(new URL(
    "../../src/study/CourseStudyApplication.js",
    import.meta.url
  ), "utf8");
  const start = source.indexOf("  async function openCourse(");
  const end = source.indexOf("  async function selectHomeCourse(", start);
  assert.ok(start >= 0 && end > start);
  const openCourse = source.slice(start, end);
  assert.match(openCourse, /const selection = selectionForCourse\(state\.project, courseId\);/u);
  assert.match(openCourse, /state\.view = "course";/u);
  assert.doesNotMatch(openCourse, /saved|firstIncomplete/u);
});
