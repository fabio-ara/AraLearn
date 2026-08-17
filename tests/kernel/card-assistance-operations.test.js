import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyCardAssistanceChangeSet,
  buildCardAssistanceScopeSnapshot
} from "../../src/assist/cardAssistanceScope.js";
import { queryCardAssistanceCatalog } from "../../src/assist/cardAssistanceCatalog.js";
import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";
import {
  appendCardAssistanceLedgerTurn,
  createCardAssistanceLedger
} from "../../src/assist/cardAssistanceLedger.js";
import { generateCardAssistanceChangeSet } from "../../src/generation/runtime/cardAssistanceRuntime.js";

async function fixture() {
  const document = JSON.parse(await readFile(
    new URL("../fixtures/package/project-minimal.json", import.meta.url),
    "utf8"
  ));
  const course = document.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const card = microsequence.cards[0];
  return {
    document,
    card,
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: card.id
    }
  };
}

test("operações são explícitas e resource selecionado aceita somente edit_text", async () => {
  const { document, card, selection } = await fixture();
  await assert.rejects(
    buildCardAssistanceScopeSnapshot(document, selection, {
      operation: "repair",
      scope: "card"
    }),
    { code: "INVALID_CARD_ASSISTANCE_SCOPE" }
  );
  await assert.rejects(
    buildCardAssistanceScopeSnapshot(document, selection, {
      operation: "edit_text"
    }),
    { code: "INVALID_CARD_ASSISTANCE_SCOPE" }
  );
  await assert.rejects(
    buildCardAssistanceScopeSnapshot(document, selection, {
      operation: "recompose_card",
      scope: "resources",
      resourceTargetIds: [`content:${card.content[0].id}`]
    }),
    { code: "INVALID_CARD_ASSISTANCE_SCOPE" }
  );
});

test("adaptador compõe theory e practice a partir de packages individuais compatíveis", async () => {
  const catalog = {
    search(intent) {
      assert.equal(intent.slot, "content");
      assert.equal(intent.query, "transforme em uma prática");
      return {
        coverage: {
          chatDisclosure: "Usei Parágrafo como aproximação por falta de representação exata."
        },
        candidates: [{
          packageId: "aralearn.resource.paragraph",
          version: "1.0.0",
          label: "Parágrafo",
          fit: "substitute",
          reason: "Aproximação textual.",
          responseCompatibility: ["aralearn.response.gap"]
        }]
      };
    }
  };
  const candidates = await queryCardAssistanceCatalog(catalog, {
    intent: "transforme em uma prática",
    currentCard: { feedback: [] }
  });
  assert.deepEqual(candidates.map(({ composition }) => composition.role), [
    "theory",
    "practice"
  ]);
  assert.equal(candidates[1].composition.response.package, "aralearn.response.gap");
  assert.match(candidates[1].catalogDisclosure, /Parágrafo como aproximação/u);
});

test("composição mista admite resposta compatível com o conteúdo que ela exercita", async () => {
  const catalog = {
    search() {
      return {
        coverage: { desiredResource: "plano acompanhado de explicação" },
        candidates: [
          {
            packageId: "aralearn.resource.plane",
            version: "1.0.0",
            label: "Plano cartesiano",
            fit: "canonical",
            matched: ["structure:structure.coordinate_space"],
            responseCompatibility: ["aralearn.response.choice"]
          },
          {
            packageId: "aralearn.resource.paragraph",
            version: "1.0.0",
            label: "Parágrafo",
            fit: "versatile",
            matched: ["taskOperation:task_operation.explain"],
            responseCompatibility: ["aralearn.response.gap"]
          }
        ]
      };
    }
  };
  const candidates = await queryCardAssistanceCatalog(catalog, {
    intent: "Combine plano cartesiano e parágrafo em uma prática.",
    currentCard: { role: "practice", content: [], response: null, feedback: [] }
  });
  const mixedGap = candidates.find(({ composition }) => (
    composition.content.length === 2 &&
    composition.response?.package === "aralearn.response.gap"
  ));
  assert.ok(mixedGap, "a resposta pode exercitar o parágrafo sem ser suportada pelo plano");
});

test("catálogo padrão propõe composição de conteúdo quando a intenção exige coordenação", async () => {
  const candidates = await queryCardAssistanceCatalog(RESOURCE_CATALOG, {
    intent: "Combine um gráfico estatístico e uma fórmula para explicar o modelo.",
    currentCard: {
      title: "Modelo quantitativo",
      role: "theory",
      content: [{ package: "aralearn.resource.paragraph", version: "1.0.0" }],
      response: null,
      feedback: []
    },
    didacticContext: {
      course: { title: "Estatística aplicada" },
      microsequence: { title: "Modelo e evidência" }
    },
    priorConversation: []
  });
  const combined = candidates.find(({ composition }) => composition.content.length > 1);
  assert.ok(combined, "a shortlist deve conter uma composição com mais de um conteúdo");
  assert.deepEqual(
    combined.composition.content.map(({ package: packageId }) => packageId),
    ["aralearn.resource.chart", "aralearn.resource.formula"]
  );
});

test("pedido iterativo vago mantém o contexto residente na busca do catálogo", async () => {
  let searchIntent;
  const catalog = {
    getProfile(packageId) {
      return RESOURCE_CATALOG.getProfile(packageId);
    },
    search(intent) {
      searchIntent = intent;
      return {
        coverage: { desiredResource: intent.query, chatDisclosure: null },
        candidates: [{
          packageId: "aralearn.resource.chart",
          version: "1.0.0",
          label: "Gráfico estatístico",
          fit: "versatile",
          reason: "Preserva a série quantitativa.",
          responseCompatibility: ["aralearn.response.choice"]
        }]
      };
    }
  };
  await queryCardAssistanceCatalog(catalog, {
    intent: "Mude a representação.",
    currentCard: {
      title: "Latência e vazão",
      role: "practice",
      content: [{ package: "aralearn.resource.chart", version: "1.0.0" }],
      response: { package: "aralearn.response.choice", version: "1.0.0" },
      feedback: []
    },
    didacticContext: {
      course: { title: "Redes de Computadores" },
      microsequence: { title: "Métricas de desempenho" }
    },
    priorConversation: [{
      userRequest: "Compare os intervalos de confiança.",
      assistantResponse: "Adicionei a comparação solicitada."
    }]
  });
  assert.match(searchIntent.query, /Latência e vazão/u);
  assert.match(searchIntent.query, /Redes de Computadores/u);
  assert.match(searchIntent.query, /intervalos de confiança/u);
  assert.equal(searchIntent.cardRole, "practice");
  assert.ok(searchIntent.structureIds.includes("structure.quantitative_series"));
  assert.ok(searchIntent.disciplineIds.includes("discipline.statistics"));
  assert.ok(searchIntent.practiceModeIds.includes("practice.selection"));
});

test("recompose_card troca packages via catálogo e preserva id e position", async () => {
  const { document, card, selection } = await fixture();
  let querySeen;
  const requestsSeen = [];
  const resourceCatalog = {
    searchRepresentations(query) {
      querySeen = query;
      return [
        {
          id: "paragraph-theory",
          label: "Parágrafo",
          description: "Mantém a representação textual.",
          composition: {
            role: "theory",
            content: [{ package: "aralearn.resource.paragraph", version: "1.0.0" }],
            response: null,
            feedback: []
          }
        },
        {
          id: "code-theory",
          label: "Código expositivo",
          description: "Expõe a regra com operadores lógicos.",
          catalogDisclosure: "Usei Código como aproximação porque não há uma representação exata.",
          composition: {
            role: "theory",
            content: [{ package: "aralearn.resource.code", version: "1.0.0" }],
            response: null,
            feedback: []
          }
        }
      ];
    }
  };
  const provider = {
    async generateStructured(request) {
      requestsSeen.push(request);
      if (request.phase === "card_assistance_representation") {
        return { value: { candidateId: "code-theory" } };
      }
      return {
        value: {
          message: "Troquei a prosa por um exemplo curto de código.",
          card: {
            id: card.id,
            position: card.position,
            title: "Conjunção em código",
            role: "theory",
            content: [{
              id: `${card.id}-content-1`,
              package: "aralearn.resource.code",
              version: "1.0.0",
              data: {
                prompt: "Observe quando a conjunção é verdadeira.",
                language: "javascript",
                code: "const resultado = P && Q;"
              }
            }],
            response: null,
            feedback: [],
            topics: [],
            sources: []
          }
        }
      };
    }
  };
  const generated = await generateCardAssistanceChangeSet({
    projectDocument: document,
    selection,
    request: {
      operation: "recompose_card",
      scope: "card",
      promptText: "Represente a regra com um exemplo em código."
    },
    provider,
    modelId: "modelo-leve",
    resourceCatalog
  });
  assert.equal(querySeen.intent, "Represente a regra com um exemplo em código.");
  assert.deepEqual(requestsSeen.map(({ phase }) => phase), [
    "card_assistance_representation",
    "card_assistance_build"
  ]);
  const buildRequest = requestsSeen[1];
  assert.equal(buildRequest.schema.properties.card.properties.id.const, card.id);
  assert.equal(buildRequest.schema.properties.card.properties.position.const, card.position);
  const selectionEnvelope = JSON.parse(requestsSeen[0].prompt);
  assert.equal(selectionEnvelope.candidates.length, 2);
  assert.equal(selectionEnvelope.candidates[0].resources, undefined);
  const buildEnvelope = JSON.parse(buildRequest.prompt);
  assert.deepEqual(
    buildEnvelope.selectedComposition.resources.map(({ package: packageId }) => packageId),
    ["aralearn.resource.code"]
  );
  assert.equal(generated.changeSet.operation, "recompose_card");
  assert.equal(generated.changeSet.card.content[0].package, "aralearn.resource.code");
  assert.equal(generated.changeSet.card.id, card.id);
  assert.equal(generated.changeSet.card.position, card.position);
  assert.match(generated.assistantMessage, /Código como aproximação/u);
});

test("restore_version é determinístico, dispensa provider e valida o envelope", async () => {
  const { document, card, selection } = await fixture();
  const prior = structuredClone(card);
  prior.content[0].data.text = "Versão anterior exata.";
  let assistanceLedger = createCardAssistanceLedger({ selection, card: prior });
  assistanceLedger = appendCardAssistanceLedgerTurn(assistanceLedger, {
    beforeCard: prior,
    afterCard: card,
    operation: "edit_text",
    request: "Atualize o texto.",
    assistantResponse: "Atualizei o texto.",
    scope: "card"
  }).ledger;
  const generated = await generateCardAssistanceChangeSet({
    projectDocument: document,
    selection,
    request: {
      operation: "restore_version",
      scope: "card",
      versionId: "v0"
    },
    assistanceLedger
  });
  assert.equal(generated.changeSet.operation, "restore_version");
  assert.equal(generated.changeSet.versionId, "v0");
  assert.equal(generated.changeSet.card.content[0].data.text, "Versão anterior exata.");
  assert.equal(generated.assistanceLedger.cursorVersionId, "v0");

  const invalid = structuredClone(generated.changeSet);
  invalid.card.id = "outro-card";
  await assert.rejects(applyCardAssistanceChangeSet({
    projectDocument: document,
    selection,
    snapshot: generated.snapshot,
    changeSet: invalid
  }), { code: "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE" });
});

test("runtime usa ancestralidade ativa e preserva explicação no-op sem nova versão", async () => {
  const { document, card, selection } = await fixture();
  const assistanceLedger = createCardAssistanceLedger({ selection, card });
  let promptSeen;
  const provider = {
    async generateStructured(request) {
      promptSeen = JSON.parse(request.prompt);
      return {
        value: {
          message: "O texto já satisfaz a solicitação.",
          edits: [{ path: "title", value: card.title }]
        }
      };
    }
  };
  const generated = await generateCardAssistanceChangeSet({
    projectDocument: document,
    selection,
    request: {
      operation: "edit_text",
      scope: "card",
      promptText: "Mantenha exatamente este título."
    },
    provider,
    modelId: "modelo-leve",
    assistanceLedger
  });
  assert.deepEqual(promptSeen.priorConversation, []);
  assert.equal(generated.outcome, "no-op");
  assert.equal(generated.assistantMessage, "O texto já satisfaz a solicitação.");
  assert.equal(generated.assistanceLedger.turns.length, 1);
  assert.equal(generated.assistanceLedger.turns[0].outcome, "no-op");
  assert.equal(generated.assistanceLedger.versions.length, 1);
  assert.equal(generated.assistanceLedger.cursorVersionId, "v0");
  assert.equal(generated.ledgerTransition.changed, false);
  assert.equal(generated.ledgerTransition.versionId, "v0");

  let secondPromptSeen;
  const followUp = await generateCardAssistanceChangeSet({
    projectDocument: document,
    selection,
    request: {
      operation: "edit_text",
      scope: "card",
      promptText: "Então esclareça a razão sem alterar o card."
    },
    provider: {
      async generateStructured(request) {
        secondPromptSeen = JSON.parse(request.prompt);
        return {
          value: {
            message: "A formulação atual já apresenta a razão de modo suficiente.",
            edits: []
          }
        };
      }
    },
    modelId: "modelo-leve",
    assistanceLedger: generated.assistanceLedger
  });
  assert.equal(secondPromptSeen.priorConversation.length, 1);
  assert.equal(
    secondPromptSeen.priorConversation[0].assistantResponse,
    "O texto já satisfaz a solicitação."
  );
  assert.equal(followUp.assistanceLedger.turns.length, 2);
  assert.equal(followUp.assistanceLedger.versions.length, 1);
});
