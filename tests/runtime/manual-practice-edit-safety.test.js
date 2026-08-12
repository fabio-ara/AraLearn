import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildResourceGapModel } from "../../src/core/resourceGaps.js";
import { renderCardRuntimeBlocks } from "../../src/render/renderCardRuntime.js";
import {
  applyManualCardEdit,
  listManualCardEditablePaths,
  serializeEditableNode
} from "../../src/ui/manualCardEdit.js";

const fixtureUrl = new URL("../fixtures/package/project-resources-gallery.json", import.meta.url);

function galleryCards() {
  const project = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
  return project.courses[0].modules[0].lessons[0].microsequences[0].cards;
}

function decodeAttribute(value) {
  return String(value || "")
    .replace(/&#10;/gu, "\n")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

function manualAttributes(html) {
  return [...String(html || "").matchAll(
    /data-manual-edit-path="([^"]+)" data-manual-edit-original="([^"]*)"/gu
  )].map((match) => ({
    path: decodeAttribute(match[1]),
    original: decodeAttribute(match[2])
  }));
}

function targetIdsByRuntimeIndex(card, targetId) {
  const result = [];
  if (card.resource === "composite") {
    card.blocks.forEach((block, index) => {
      if (`body:${block.id}` === targetId) result[index + 1] = targetId;
    });
  } else if (targetId === "main") {
    result[1] = "main";
  } else if (targetId === "response") {
    result[2] = "response";
  }
  return result;
}

function renderManualTarget(card, targetId) {
  return renderCardRuntimeBlocks(card, {
    omitRepeatedHeading: true,
    resourceSelectionEnabled: true,
    resourceSelectionTargetIds: targetIdsByRuntimeIndex(card, targetId),
    manualEditingTargetId: targetId
  });
}

test("os 18 resources serializam o valor autoral, não a projeção resolvida", () => {
  const cards = galleryCards();
  assert.equal(cards.length, 18);
  for (const card of cards) {
    const targetIds = card.resource === "composite"
      ? card.blocks.map((block) => `body:${block.id}`)
      : ["main"];
    for (const targetId of targetIds) {
      const model = new Map(
        listManualCardEditablePaths(card, targetId)
          .map((field) => [field.path, String(field.value ?? "")])
      );
      const rendered = manualAttributes(renderManualTarget(card, targetId));
      for (const field of rendered) {
        assert.equal(model.has(field.path), true, `${card.resource}:${targetId}:${field.path}`);
        assert.equal(
          field.original,
          model.get(field.path),
          `${card.resource}:${targetId}:${field.path}`
        );
      }
    }
  }
});

test("gaps de recursos estruturados mantêm o token bruto no original manual", () => {
  for (const card of galleryCards().filter((entry) => entry.resource !== "composite")) {
    const gapPaths = buildResourceGapModel(card).fields
      .filter((field) => field.count > 0)
      .map((field) => field.path);
    if (!gapPaths.length) continue;
    const originals = new Map(
      manualAttributes(renderManualTarget(card, "main"))
        .map((field) => [field.path, field.original])
    );
    const model = new Map(
      listManualCardEditablePaths(card, "main")
        .map((field) => [field.path, String(field.value ?? "")])
    );
    for (const path of gapPaths) {
      assert.equal(originals.get(path), model.get(path), `${card.resource}:${path}`);
      assert.match(originals.get(path), /\[\[/u, `${card.resource}:${path}`);
    }
  }
});

test("colchetes literais de card teórico não são marcados como lacuna protegida", () => {
  const card = {
    id: "card-code-indexing",
    position: 1,
    resource: "code",
    kind: "theory",
    exercise: "none",
    title: "Indexação",
    prompt: "Selecione duas colunas.",
    language: "python",
    code: 'recorte = df[["nome", "idade"]]',
    after: ""
  };
  const html = renderManualTarget(card, "main");
  assert.match(html, /data-manual-edit-original="recorte = df\[\[&quot;nome&quot;, &quot;idade&quot;\]\]"/u);
  assert.doesNotMatch(html, /data-manual-edit-preserve-gaps="true"/u);
  const edited = applyManualCardEdit(card, "main", {
    pathValues: { code: 'campos = df[["nome", "idade"]]' }
  });
  assert.equal(edited.code, 'campos = df[["nome", "idade"]]');
});

test("grafo preserva separadamente rótulo, peso e lacunas ao salvar sem tocar", () => {
  const source = galleryCards().find((card) => card.resource === "graph");
  const card = structuredClone(source);
  card.vertices[0].label = "[[A::A|X]]";
  card.edges[0].label = "[[rota::rota|atalho]]";
  card.edges[0].weight = "[[7;;]]";
  const values = Object.fromEntries(
    manualAttributes(renderManualTarget(card, "main"))
      .map((field) => [field.path, field.original])
  );

  assert.equal(values["vertices[0].label"], card.vertices[0].label);
  assert.equal(values["edges[0].label"], card.edges[0].label);
  assert.equal(values["edges[0].weight"], card.edges[0].weight);
  const edited = applyManualCardEdit(card, "main", { pathValues: values });
  assert.deepEqual(edited.vertices, card.vertices);
  assert.deepEqual(edited.edges, card.edges);
});

test("choice edita feedback em contêiner não interativo e sinaliza a resposta imutável", () => {
  const card = galleryCards().find((entry) => entry.resource === "choice");
  card.options[0].feedback = "O operador de atribuição usa um sinal.";
  const html = renderManualTarget(card, "main");

  assert.match(html, /class="multiple-choice-option runtime-manual-choice-option/u);
  assert.doesNotMatch(html, /<button class="multiple-choice-option[^>]*>/u);
  assert.match(html, /data-manual-edit-path="options\[0\]\.feedback"/u);
  assert.match(html, /data-manual-edit-optional="true"/u);
  assert.match(html, /runtime-manual-choice-answer-badge">Resposta esperada/u);
  assert.doesNotMatch(html, /data-manual-edit-path="answerIds|data-manual-edit-path="options\[\d+\]\.id/u);
});

test("explicação vazia e afterBlocks existentes ficam editáveis sem mudar sua estrutura", () => {
  const card = {
    id: "card-support",
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Apoio",
    text: "Conteúdo principal.",
    after: "",
    afterBlocks: [{
      id: "support-1",
      kind: "paragraph",
      value: "Explicação existente."
    }]
  };
  const afterHtml = renderManualTarget(card, "after:text");
  assert.match(afterHtml, /runtime-authoring-support-resources/u);
  assert.match(afterHtml, /data-manual-target-id="after:text"/u);
  assert.match(afterHtml, /data-manual-edit-path="after" data-manual-edit-original=""/u);
  assert.match(afterHtml, /data-manual-edit-placeholder="Adicionar explicação posterior"/u);

  const blockHtml = renderManualTarget(card, "after:support-1");
  assert.match(blockHtml, /data-manual-target-id="after:support-1"/u);
  assert.match(blockHtml, /data-manual-edit-path="value"/u);
  const editedAfter = applyManualCardEdit(card, "after:text", {
    pathValues: { after: "Nova explicação." }
  });
  const editedBlock = applyManualCardEdit(editedAfter, "after:support-1", {
    pathValues: { value: "Explicação revisada." }
  });
  assert.equal(editedBlock.after, "Nova explicação.");
  assert.equal(editedBlock.afterBlocks.length, 1);
  assert.equal(editedBlock.afterBlocks[0].id, "support-1");
  assert.equal(editedBlock.afterBlocks[0].value, "Explicação revisada.");
});

test("proxy vetorial mantém a caixa estrutural e permite rolagem interna de rótulos longos", () => {
  const styles = fs.readFileSync(
    new URL("../../public/styles.css", import.meta.url),
    "utf8"
  );
  const rule = styles.match(/\.runtime-manual-svg-field\s*\{(?<body>[\s\S]*?)\}/u)?.groups?.body || "";
  assert.match(rule, /position:\s*absolute/u);
  assert.match(rule, /overflow:\s*auto/u);
  assert.match(rule, /overscroll-behavior:\s*contain/u);
  assert.match(rule, /-webkit-overflow-scrolling:\s*touch/u);
  assert.match(rule, /box-sizing:\s*border-box/u);
  assert.doesNotMatch(rule, /overflow:\s*hidden/u);

  const longLabel = "Conjunto de origem com um rótulo deliberadamente longo para tela estreita";
  const card = {
    id: "card-vector-long-label",
    position: 1,
    resource: "relation_map",
    kind: "theory",
    exercise: "none",
    title: "Relação",
    prompt: "Observe.",
    leftSet: { label: longLabel, items: [{ id: "a", label: "A" }] },
    rightSet: { label: "Destino", items: [{ id: "b", label: "B" }] },
    relations: [{ from: "a", to: "b" }],
    after: ""
  };
  const rendered = manualAttributes(renderManualTarget(card, "main"));
  assert.ok(rendered.some((field) => (
    field.path === "leftSet.label" && field.original === longLabel
  )));
});

test("serialização manual preserva link Markdown seguro ao alterar texto adjacente", () => {
  const textNode = (data) => ({ nodeType: 3, data });
  const elementNode = (tagName, childNodes = [], attributes = {}) => ({
    nodeType: 1,
    tagName,
    childNodes,
    children: childNodes.filter((child) => child.nodeType === 1),
    dataset: {},
    getAttribute(name) {
      return attributes[name] ?? null;
    }
  });
  const edited = elementNode("SPAN", [
    textNode("Consulte agora o "),
    elementNode("A", [textNode("guia oficial")], {
      href: "https://example.org/manual?lang=pt"
    }),
    textNode(" antes de continuar.")
  ]);
  assert.equal(
    serializeEditableNode(edited),
    "Consulte agora o [guia oficial](https://example.org/manual?lang=pt) antes de continuar."
  );

  const unsafe = elementNode("SPAN", [
    textNode("Abra "),
    elementNode("A", [textNode("este endereço")], { href: "javascript:alert(1)" }),
    textNode(" somente se for seguro.")
  ]);
  assert.equal(
    serializeEditableNode(unsafe),
    "Abra este endereço somente se for seguro."
  );
});

test("flow mantém practice imutável e limita branchLabels ao alvo estrutural do próprio flow", () => {
  const card = {
    id: "card-flow-scope",
    position: 1,
    resource: "flow",
    kind: "exercise",
    exercise: "choice",
    title: "Decisão",
    structure: {
      id: "root",
      kind: "sequence",
      items: [{
        id: "decision",
        kind: "if_then",
        condition: "há acesso?",
        branchLabels: { yes: "Autorizado", no: "Negado" },
        practice: {
          text: {
            blank: true,
            mode: "choice",
            options: [
              { id: "practice-answer", value: "há acesso?", enabled: true },
              { id: "practice-distractor", value: "não há acesso?", enabled: true }
            ]
          }
        },
        thenBranch: []
      }]
    },
    question: "Qual ramo será seguido?",
    options: [
      { id: "yes", text: "Autorizado" },
      { id: "no", text: "Negado" }
    ],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: ["yes"],
    after: "A condição define o ramo."
  };
  const practiceBefore = structuredClone(card.structure.items[0].practice);
  const branchBefore = structuredClone(card.structure.items[0].branchLabels);
  const mainPaths = listManualCardEditablePaths(card, "main").map(({ path }) => path);

  assert.ok(mainPaths.includes("structure.items[0].branchLabels.yes"));
  assert.ok(mainPaths.includes("structure.items[0].branchLabels.no"));
  assert.equal(mainPaths.some((path) => path.includes(".practice")), false);
  assert.deepEqual(
    listManualCardEditablePaths(card, "card").map(({ path }) => path),
    ["title"]
  );
  assert.equal(
    listManualCardEditablePaths(card, "response")
      .some(({ path }) => path.includes("branchLabels")),
    false
  );
  assert.deepEqual(
    listManualCardEditablePaths(card, "after:text").map(({ path }) => path),
    ["after"]
  );

  const mainHtml = renderManualTarget(card, "main");
  assert.match(mainHtml, /data-manual-edit-path="structure\.items\[0\]\.branchLabels\.yes"/u);
  assert.doesNotMatch(mainHtml, /data-manual-edit-path="[^"]*\.practice/u);
  assert.doesNotMatch(
    renderManualTarget(card, "response"),
    /data-manual-edit-path="[^"]*branchLabels/u
  );
  assert.doesNotMatch(
    renderManualTarget(card, "after:text"),
    /data-manual-edit-path="[^"]*branchLabels/u
  );

  const editedMain = applyManualCardEdit(card, "main", {
    pathValues: {
      "structure.items[0].condition": "perfil ativo?",
      "structure.items[0].practice.text.options[0].value": "perfil ativo?"
    }
  });
  assert.equal(editedMain.structure.items[0].condition, "perfil ativo?");
  assert.deepEqual(editedMain.structure.items[0].practice, practiceBefore);

  const editedResponse = applyManualCardEdit(card, "response", {
    pathValues: {
      question: "Qual saída será usada?",
      "structure.items[0].branchLabels.yes": "Liberado"
    }
  });
  assert.equal(editedResponse.question, "Qual saída será usada?");
  assert.deepEqual(editedResponse.structure.items[0].branchLabels, branchBefore);

  const editedAfter = applyManualCardEdit(card, "after:text", {
    pathValues: {
      after: "A condição escolhe uma única saída.",
      "structure.items[0].branchLabels.no": "Bloqueado"
    }
  });
  assert.equal(editedAfter.after, "A condição escolhe uma única saída.");
  assert.deepEqual(editedAfter.structure.items[0].branchLabels, branchBefore);
});

test("formula edita expressão e descrição acessível sem liberar estrutura nem tokens de gap", () => {
  const card = structuredClone(
    galleryCards().find((entry) => entry.resource === "formula")
  );
  const token = "[[+::+|−]]";
  const paths = listManualCardEditablePaths(card, "main").map(({ path }) => path);
  const html = renderManualTarget(card, "main");

  assert.ok(paths.includes("accessibleText"));
  assert.ok(paths.includes("expression.children[0].value"));
  assert.match(
    html,
    /data-manual-edit-path="accessibleText"[^>]*data-manual-edit-preserve-gaps="true"/u
  );
  assert.match(html, /runtime-formula-accessible-gap/u);

  const edited = applyManualCardEdit(card, "main", {
    pathValues: {
      accessibleText: `variável a ${token} variável y`,
      "expression.children[0].value": "a",
      "expression.type": "fraction",
      notation: "chemistry"
    }
  });
  assert.equal(edited.accessibleText, `variável a ${token} variável y`);
  assert.equal(edited.expression.children[0].value, "a");
  assert.equal(edited.expression.type, "row");
  assert.equal(edited.notation, "mathematics");

  assert.throws(
    () => applyManualCardEdit(card, "main", {
      pathValues: { accessibleText: "x [[−::−|+]] y" }
    }),
    /não pode alterar a estrutura das lacunas/u
  );
});
