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

test("edição manual exclui descrição acessível e responses sem texto visível", () => {
  const card = structuredClone(sourceCard);
  card.content = [{
    id: "formula-1",
    package: "aralearn.resource.formula",
    version: "1.0.0",
    data: {
      prompt: "Observe a expressão.",
      notation: "mathematics",
      accessibleText: "x ao quadrado",
      expression: {
        type: "superscript",
        base: { type: "identifier", value: "x" },
        exponent: { type: "number", value: "2" }
      }
    }
  }];
  card.response = {
    id: "gap-1",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: {
      blanks: [{
        id: "formula-name",
        targetInstanceId: "formula-1",
        targetPath: "prompt",
        responseMode: "text",
        answer: "expressão"
      }]
    }
  };
  assert.deepEqual(
    listManualCardEditablePaths(card, "content:formula-1").map(({ path }) => path),
    ["prompt"]
  );
  assert.deepEqual(listManualCardEditablePaths(card, "response:gap-1"), []);
});

function practiceCard(content, response) {
  return {
    id: "manual-practice",
    position: 1,
    title: "Prática",
    role: "practice",
    content,
    response,
    feedback: [],
    topics: [],
    sources: []
  };
}

test("edição manual reconcilia resposta de lacuna por âncoras literais", () => {
  const card = practiceCard([{
    id: "body",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "Use DNS aqui." }
  }], {
    id: "answer",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: {
      blanks: [{
        id: "protocol",
        targetInstanceId: "body",
        targetPath: "text:protocol",
        responseMode: "choice",
        answer: "DNS",
        acceptedAnswers: ["Domain Name System"],
        distractors: ["TCP"]
      }]
    }
  });
  const edited = applyManualCardEdit(card, "content:body", {
    pathValues: { text: "Use TCP aqui." }
  });
  assert.equal(edited.content[0].data.text, "Use TCP aqui.");
  assert.equal(edited.response.data.blanks[0].answer, "TCP");
  assert.equal(edited.response.data.blanks[0].acceptedAnswers, undefined);
  assert.deepEqual(edited.response.data.blanks[0].distractors, ["DNS"]);
  assert.equal(card.response.data.blanks[0].answer, "DNS");
});

test("troca de resposta textual remove equivalentes invisíveis do conceito anterior", () => {
  const card = practiceCard([{
    id: "body",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "DNS" }
  }], {
    id: "answer",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: {
      blanks: [{
        id: "protocol",
        targetInstanceId: "body",
        targetPath: "text:protocol",
        responseMode: "text",
        answer: "DNS",
        acceptedAnswers: ["Domain Name System"]
      }]
    }
  });
  const edited = applyManualCardEdit(card, "content:body", {
    pathValues: { text: "TCP" }
  });
  assert.equal(edited.response.data.blanks[0].answer, "TCP");
  assert.equal(edited.response.data.blanks[0].acceptedAnswers, undefined);
});

test("edição de contexto preserva resposta que continua única no texto", () => {
  const card = practiceCard([{
    id: "body",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "Use DNS aqui." }
  }], {
    id: "answer",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: {
      blanks: [{
        id: "protocol",
        targetInstanceId: "body",
        targetPath: "text:protocol",
        responseMode: "text",
        answer: "DNS"
      }]
    }
  });
  const edited = applyManualCardEdit(card, "content:body", {
    pathValues: { text: "Use DNS neste ponto." }
  });
  assert.equal(edited.content[0].data.text, "Use DNS neste ponto.");
  assert.equal(edited.response.data.blanks[0].answer, "DNS");
});

test("edição manual reconcilia resposta ordering quando o campo inteiro muda", () => {
  const card = practiceCard([{
    id: "prepare",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "Preparar" }
  }, {
    id: "execute",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "Executar" }
  }], {
    id: "order",
    package: "aralearn.response.ordering",
    version: "3.0.0",
    data: {
      targets: [
        { id: "prepare", targetInstanceId: "prepare", targetPath: "text", answer: "Preparar" },
        { id: "execute", targetInstanceId: "execute", targetPath: "text", answer: "Executar" }
      ]
    }
  });
  const edited = applyManualCardEdit(card, "content:prepare", {
    pathValues: { text: "Planejar" }
  });
  assert.equal(edited.content[0].data.text, "Planejar");
  assert.equal(edited.response.data.targets[0].answer, "Planejar");
  assert.equal(edited.response.data.targets[1].answer, "Executar");
});

test("edição manual reconcilia um de vários alvos ordering no mesmo campo", () => {
  const card = practiceCard([{
    id: "steps",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "Preparar, executar." }
  }], {
    id: "order",
    package: "aralearn.response.ordering",
    version: "3.0.0",
    data: {
      targets: [
        { id: "prepare", targetInstanceId: "steps", targetPath: "text:prepare", answer: "Preparar" },
        { id: "execute", targetInstanceId: "steps", targetPath: "text:execute", answer: "executar" }
      ]
    }
  });
  const edited = applyManualCardEdit(card, "content:steps", {
    pathValues: { text: "Planejar, executar." }
  });
  assert.equal(edited.response.data.targets[0].answer, "Planejar");
  assert.equal(edited.response.data.targets[1].answer, "executar");

  const contextEdited = applyManualCardEdit(card, "content:steps", {
    pathValues: { text: "Preparar; executar." }
  });
  assert.equal(contextEdited.response.data.targets[0].answer, "Preparar");
  assert.equal(contextEdited.response.data.targets[1].answer, "executar");
});

test("edição manual falha fechada quando a ocorrência praticada é ambígua", () => {
  const card = practiceCard([{
    id: "body",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "DNS e DNS" }
  }], {
    id: "answer",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: {
      blanks: [{
        id: "protocol",
        targetInstanceId: "body",
        targetPath: "text:protocol",
        responseMode: "text",
        answer: "DNS"
      }]
    }
  });
  assert.throws(() => applyManualCardEdit(card, "content:body", {
    pathValues: { text: "TCP e UDP" }
  }), /contexto do trecho praticado/u);
});
