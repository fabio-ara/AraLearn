import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  applyManualCardEdit,
  buildManualCardEditModel,
  listManualCardEditablePaths
} from "../../src/ui/manualCardEdit.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));
const sourceCard = fixture.courses[0].modules[0].lessons[0]
  .microsequences[0].cards[0];

test("edição manual usa a identidade da instância de conteúdo", () => {
  const targetId = "content:card-fixture-minimal-regra-content";
  const paths = listManualCardEditablePaths(sourceCard, targetId);
  assert.deepEqual(paths.map(({ path }) => path), ["text"]);
  assert.equal(buildManualCardEditModel(sourceCard, targetId).targetKind,
    "aralearn.resource.paragraph");

  const edited = applyManualCardEdit(sourceCard, targetId, {
    pathValues: { text: "A conjunção exige duas proposições verdadeiras." }
  });

  assert.equal(edited.content[0].data.text,
    "A conjunção exige duas proposições verdadeiras.");
  assert.equal(edited.content[0].id, sourceCard.content[0].id);
  assert.equal(edited.content[0].package, "aralearn.resource.paragraph");
  assert.equal(sourceCard.content[0].data.text,
    "A conjunção só é verdadeira quando as duas proposições são verdadeiras.");
});

test("edição manual de feedback permanece no envelope por packages", () => {
  const targetId = "feedback:card-fixture-minimal-regra-feedback-text";
  const edited = applyManualCardEdit(sourceCard, targetId, {
    pathValues: { text: "Se uma for falsa, o resultado será falso." }
  });

  assert.equal(edited.feedback[0].data.text,
    "Se uma for falsa, o resultado será falso.");
  assert.equal(edited.feedback[0].id, sourceCard.feedback[0].id);
  assert.equal(edited.feedback[0].version, "1.0.0");
});

test("edição manual não expõe campos estruturais do package", () => {
  const targetId = "content:card-fixture-minimal-regra-content";
  const edited = applyManualCardEdit(sourceCard, targetId, {
    pathValues: {
      text: "Texto permitido.",
      package: "aralearn.resource.graph",
      id: "identidade-trocada"
    }
  });

  assert.equal(edited.content[0].data.text, "Texto permitido.");
  assert.equal(edited.content[0].package, sourceCard.content[0].package);
  assert.equal(edited.content[0].id, sourceCard.content[0].id);
});

test("edição manual expõe somente folhas textuais, não números estruturados", () => {
  const card = structuredClone(sourceCard);
  card.content = [{
    id: "matrix-1",
    package: "aralearn.resource.matrix",
    version: "1.0.0",
    data: {
      prompt: "Observe a matriz.",
      name: "A",
      values: [[1, 2], [3, 4]]
    }
  }];
  const paths = listManualCardEditablePaths(card, "content:matrix-1");
  assert.deepEqual(paths.map(({ path }) => path), ["prompt", "name"]);
  const edited = applyManualCardEdit(card, "content:matrix-1", {
    pathValues: {
      prompt: "Compare as linhas.",
      "values[0][0]": "9"
    }
  });
  assert.equal(edited.content[0].data.prompt, "Compare as linhas.");
  assert.equal(edited.content[0].data.values[0][0], 1);
});
