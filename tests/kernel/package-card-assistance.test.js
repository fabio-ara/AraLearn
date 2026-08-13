import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCardAssistanceScopeSnapshot,
  listCardAssistanceTextPaths,
  listCardResourceTargets,
  projectCardAssistanceTextChange
} from "../../src/assist/cardAssistanceScope.js";
import { generateCardAssistanceChangeSet } from "../../src/generation/runtime/cardAssistanceRuntime.js";

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
