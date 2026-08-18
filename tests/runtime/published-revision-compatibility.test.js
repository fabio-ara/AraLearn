import assert from "node:assert/strict";
import test from "node:test";

import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { validateCardEnvelope } from "../../src/resources/kernel/cardEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { SupabaseHttpClient } from "../../src/supabase/SupabaseHttpClient.js";
import { canonicalRevisionHash } from "../../src/storage/canonicalRevision.js";

function guide() {
  return {
    goal: "Guiar a aprendizagem.",
    include: [],
    exclude: [],
    notation: [],
    avoid: []
  };
}

function duplicatedChoiceCard() {
  const question = "Qual protocolo confirma a entrega?";
  return {
    id: "card-choice",
    position: 1,
    title: "Confirmação de entrega",
    role: "practice",
    content: [{
      id: "prompt-copy",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: `  ${question.toUpperCase()}  ` }
    }],
    response: {
      id: "response-choice",
      package: "aralearn.response.choice",
      version: "1.0.0",
      data: {
        question,
        selectionMode: "single",
        selectionCriterion: "correct",
        options: [
          { id: "tcp", text: "TCP" },
          { id: "udp", text: "UDP" }
        ],
        answerIds: ["tcp"]
      }
    },
    feedback: [],
    topics: [],
    sources: []
  };
}

function projectWithDuplicatedChoicePrompt() {
  return {
    contract: "aralearn.library.v1",
    scope: "course",
    courses: [{
      id: "course-published",
      title: "Curso publicado",
      goal: "Exercitar uma decisão de rede.",
      modules: [{
        id: "module-network",
        title: "Redes",
        guide: guide(),
        lessons: [{
          id: "lesson-transport",
          title: "Transporte",
          guide: guide(),
          topics: [],
          microsequences: [{
            id: "micro-choice",
            title: "Prática",
            goal: "Distinguir protocolos.",
            role: "practice",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            cards: [duplicatedChoiceCard()]
          }]
        }]
      }]
    }]
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

test("revisão publicada legada é materializada sem duplicar o enunciado e mantém o hash original", async () => {
  const original = projectWithDuplicatedChoicePrompt();
  const envelopeValidation = validateCardEnvelope(
    duplicatedChoiceCard(),
    RESOURCE_PACKAGE_REGISTRY
  );
  assert.equal(envelopeValidation.valid, false);
  assert.match(envelopeValidation.errors.join(" "), /não pode repetir a mesma pergunta/u);

  const originalHash = await canonicalRevisionHash(original);
  const client = new SupabaseHttpClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "publishable-test-key",
    fetchImpl: async () => jsonResponse(original)
  });
  const normalized = await client.request(
    "/functions/v1/aralearn-course-revisions/00000000-0000-8000-8000-000000000001/" + originalHash
  );

  const card = normalized.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  assert.deepEqual(card.content, []);
  assert.equal(card.response.data.question, "Qual protocolo confirma a entrega?");

  const validation = validateProjectDocument(normalized);
  assert.equal(validation.ok, true, validation.errors?.map(({ message }) => message).join(" "));
  assert.equal(await canonicalRevisionHash(normalized), originalHash);
});

test("respostas HTTP fora do endpoint de revisões não recebem compatibilidade", async () => {
  const original = projectWithDuplicatedChoicePrompt();
  const client = new SupabaseHttpClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "publishable-test-key",
    fetchImpl: async () => jsonResponse(original)
  });
  const response = await client.request("/rest/v1/example");
  const card = response.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  assert.equal(card.content.length, 1);
  assert.equal(validateProjectDocument(response).ok, false);
});
