import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import {
  buildCardAssistanceScopeSnapshot,
  listCardAssistanceTextPaths,
  listCardResourceTargets,
  projectCardAssistanceTextChange
} from "../../src/assist/cardAssistanceScope.js";
import { generateCardAssistanceChangeSet } from "../../src/generation/runtime/cardAssistanceRuntime.js";
import {
  buildCardAssistanceAuthoringCardSchema,
  compileAndValidateAuthoringCard,
  listCardRepresentationCandidates
} from "../../src/generation/engine/cardAuthoringSchema.js";

async function context() {
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

test("assistência identifica instâncias de package e somente suas folhas textuais", async () => {
  const { card } = await context();
  assert.deepEqual(listCardResourceTargets(card).map(({ targetId }) => targetId), [
    `content:${card.content[0].id}`,
    `feedback:${card.feedback[0].id}`
  ]);
  assert.deepEqual(listCardAssistanceTextPaths(card), [
    "content[0].data.text",
    "feedback[0].data.text",
    "title"
  ]);
});

test("projeção textual preserva identidade, package, versão e resposta", async () => {
  const { card } = await context();
  const proposed = structuredClone(card);
  proposed.content[0].data.text = "Explicação reparada sem alterar o contrato.";
  const projected = projectCardAssistanceTextChange(card, proposed);
  assert.equal(projected.content[0].data.text, proposed.content[0].data.text);
  assert.equal(projected.content[0].package, card.content[0].package);
  assert.equal(projected.content[0].version, card.content[0].version);

  proposed.content[0].package = "aralearn.resource.code";
  assert.throws(() => projectCardAssistanceTextChange(card, proposed), {
    code: "INVALID_CARD_ASSISTANCE_RESULT"
  });
});

test("edit_text envia patch compacto e aplica somente folhas autorizadas", async () => {
  const { document, card, selection } = await context();
  let requestSeen;
  const provider = {
    async generateStructured(request) {
      requestSeen = request;
      return {
        value: {
          message: "Reorganizei a explicação para situar o conceito antes da regra.",
          edits: [{
            path: "content[0].data.text",
            value: "Texto progressivo e situado."
          }]
        }
      };
    }
  };
  const result = await generateCardAssistanceChangeSet({
    projectDocument: document,
    selection,
    request: {
      operation: "edit_text",
      scope: "card",
      promptText: "Torne a explicação mais clara.",
      conversationTurns: [{
        turn: 1,
        userRequest: "Situe primeiro o problema.",
        assistantResponse: "Situei o problema antes da explicação.",
        appliedTo: ["card"],
      }]
    },
    provider,
    modelId: "test-model"
  });
  assert.equal(requestSeen.schemaName, "aralearn_card_assistance_text_patch_v2");
  assert.deepEqual(requestSeen.schema.required, ["message", "edits"]);
  const requestEnvelope = JSON.parse(requestSeen.prompt);
  assert.equal(requestEnvelope.priorConversation[0].userRequest, "Situe primeiro o problema.");
  assert.equal(requestEnvelope.userRequest, "Torne a explicação mais clara.");
  assert.equal(requestEnvelope.currentCard, undefined);
  assert.equal(requestEnvelope.writableText[0].path, "content[0].data.text");
  assert.equal(requestEnvelope.readOnlyContext.cards.current.content[0].data, undefined);
  assert.equal(result.changeSet.card.content[0].data.text, "Texto progressivo e situado.");
  assert.deepEqual(result.changeSet.textPatch, [{
    path: "content[0].data.text",
    value: "Texto progressivo e situado."
  }]);
  assert.equal(result.changeSet.operation, "edit_text");
  assert.equal(
    result.assistantMessage,
    "Reorganizei a explicação para situar o conceito antes da regra."
  );
  const snapshot = await buildCardAssistanceScopeSnapshot(document, selection, {
    operation: "edit_text",
    scope: "resources",
    resourceTargetIds: [`content:${card.content[0].id}`]
  });
  assert.equal(snapshot.target.resources[0].resourceType, "aralearn.resource.paragraph");
});

test("autoria oferece ordering v3 entre dois parágrafos e entre parágrafo e tabela", () => {
  const ordering = listCardRepresentationCandidates().filter(({ response }) => (
    response?.package === "aralearn.response.ordering"
  ));
  const packageLists = ordering.map(({ content }) => (
    content.map(({ package: packageId }) => packageId)
  ));
  assert.ok(packageLists.some((packages) => (
    packages.length === 2
    && packages.every((packageId) => packageId === "aralearn.resource.paragraph")
  )));
  assert.ok(packageLists.some((packages) => (
    packages.length === 2
    && packages[0] === "aralearn.resource.paragraph"
    && packages[1] === "aralearn.resource.table"
  )));
  assert.ok(packageLists.some((packages) => (
    packages.length === 2
    && packages[0] === "aralearn.resource.table"
    && packages[1] === "aralearn.resource.paragraph"
  )));
  ordering.forEach(({ response }) => assert.equal(response.version, "3.0.0"));
});

test("schema de autoria materializa ordering v3 em instâncias textuais distintas", () => {
  const representation = listCardRepresentationCandidates().find(({ content, response }) => (
    response?.package === "aralearn.response.ordering"
    && content.length === 2
    && content[0].package === "aralearn.resource.paragraph"
    && content[1].package === "aralearn.resource.table"
  ));
  assert.ok(representation);
  const cardId = "ordering-cross-instance";
  const plan = { ...representation, id: cardId, position: 1 };
  const schema = buildCardAssistanceAuthoringCardSchema(plan);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const card = {
    id: cardId,
    position: 1,
    title: "Ordene autenticação e autorização",
    role: "practice",
    content: [
      {
        id: `${cardId}-content-1`,
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Primeiro, autenticar a identidade." }
      },
      {
        id: `${cardId}-content-2`,
        package: "aralearn.resource.table",
        version: "1.0.0",
        data: { columns: ["Etapa"], rows: [["Depois, autorizar o acesso."]] }
      }
    ],
    response: {
      id: `${cardId}-response-1`,
      package: "aralearn.response.ordering",
      version: "3.0.0",
      data: {
        targets: [
          {
            id: "authenticate",
            targetInstanceId: `${cardId}-content-1`,
            targetPath: "text",
            answer: "autenticar"
          },
          {
            id: "authorize",
            targetInstanceId: `${cardId}-content-2`,
            targetPath: "rows[0][0]",
            answer: "autorizar"
          }
        ]
      }
    },
    feedback: [{
      id: `${cardId}-feedback-1`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "A identidade vem antes da decisão de acesso." }
    }],
    topics: [],
    sources: []
  };
  assert.equal(validate(card), true, JSON.stringify(validate.errors));
  assert.doesNotThrow(() => compileAndValidateAuthoringCard(card));

  const reversed = structuredClone(card);
  reversed.content.reverse();
  assert.equal(validate(reversed), false);
});
