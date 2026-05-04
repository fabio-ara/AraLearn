import { sanitizeContractCard } from "../contract/contractCard.js";

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function makeRequestBody({ systemInstruction, prompt, schema, temperature = 0.2, maxOutputTokens = 2048 }) {
  return {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: schema
    }
  };
}

function getCardSchemaVariants() {
  return [
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["text"] },
        title: { type: "string" },
        text: { type: "string" }
      },
      required: ["type", "text"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["choice"] },
        title: { type: "string" },
        ask: { type: "string" },
        answer: { type: "array", items: { type: "string" }, minItems: 1 },
        wrong: { type: "array", items: { type: "string" }, minItems: 2 }
      },
      required: ["type", "ask", "answer", "wrong"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["complete"] },
        title: { type: "string" },
        text: { type: "string" },
        answer: { type: "array", items: { type: "string" }, minItems: 1 },
        wrong: { type: "array", items: { type: "string" }, minItems: 2 }
      },
      required: ["type", "text", "answer", "wrong"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["editor"] },
        title: { type: "string" },
        language: { type: "string" },
        code: { type: "string" }
      },
      required: ["type", "code"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["table"] },
        title: { type: "string" },
        columns: { type: "array", items: { type: "string" }, minItems: 1 },
        rows: {
          type: "array",
          minItems: 1,
          items: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          }
        }
      },
      required: ["type", "columns", "rows"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["flow"] },
        title: { type: "string" },
        flow: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              start: { type: "string" },
              process: { type: "string" },
              decision: { type: "string" },
              end: { type: "string" }
            },
            additionalProperties: false
          }
        }
      },
      required: ["type", "flow"],
      additionalProperties: false
    }
  ];
}

function getComposeSchema() {
  return {
    type: "object",
    properties: {
      microsequenceTitle: { type: "string" },
      tags: {
        type: "array",
        items: { type: "string" }
      },
      cards: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          anyOf: getCardSchemaVariants()
        }
      }
    },
    required: ["microsequenceTitle", "cards"],
    additionalProperties: false
  };
}

function getEditSchema(cardType) {
  const variants = getCardSchemaVariants();
  const variant = variants.find((item) => item.properties.type.enum[0] === cardType);
  if (!variant) {
    fail(`Tipo de card ainda não suportado para revisão assistida: "${cardType}".`);
  }
  return variant;
}

function getRepositionSchema() {
  return {
    type: "object",
    properties: {
      slotId: { type: "string" },
      renames: {
        type: "array",
        items: {
          type: "object",
          properties: {
            microsequenceKey: { type: "string" },
            title: { type: "string" }
          },
          required: ["microsequenceKey", "title"],
          additionalProperties: false
        }
      }
    },
    required: ["slotId", "renames"],
    additionalProperties: false
  };
}

function buildComposePrompt({ microsequence, dependencyTitles, promptText }) {
  const title = normalizeText(microsequence?.title) || "Microssequência atual";
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";

  return [
    `Microssequência atual: ${title}`,
    `Tags explícitas: ${tags}`,
    "Tarefa: gerar uma microssequência no contrato do AraLearn.",
    "Restrições:",
    "- gere entre 3 e 5 cards;",
    "- cada card deve usar um tipo explícito suportado;",
    "- prefira campos rasos por tipo, sem wrapper genérico;",
    "- não invente novas tags fora do contexto dado;",
    "- não mencione curso, módulo ou lição dentro dos cards;",
    `Pedido do usuário: ${promptText}`
  ].join("\n");
}

function buildEditPrompt({ microsequence, card, dependencyTitles, promptText }) {
  const microsequenceTitle = normalizeText(microsequence?.title) || "Microssequência atual";
  const cardTitle = normalizeText(card?.title) || "Card atual";
  const cardType = normalizeText(card?.type) || "text";
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";

  return [
    `Microssequência: ${microsequenceTitle}`,
    `Card atual: ${cardTitle}`,
    `Tipo atual: ${cardType}`,
    `Tags explícitas: ${tags}`,
    "Tarefa: revisar apenas este card mantendo o mesmo tipo.",
    "Restrições:",
    "- não mude o tipo do card;",
    "- use o formato raso do contrato;",
    "- não invente novas tags nem sinônimos de tags;",
    `Pedido do usuário: ${promptText}`
  ].join("\n");
}

function buildRepositionPrompt({ microsequence, dependencyTitles, promptText, destinationSlots }) {
  const microsequenceTitle = normalizeText(microsequence?.title) || "Microssequência atual";
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";
  const destinations = (destinationSlots || [])
    .map((item) => {
      const placement =
        item.insertBeforeMicrosequenceKey
          ? `antes de ${item.insertBeforeTitle}`
          : `após ${item.insertAfterTitle}`;
      return [
        `- slotId: ${item.slotId}`,
        `  curso: ${item.courseTitle}`,
        `  módulo: ${item.moduleTitle}`,
        `  lição: ${item.lessonTitle}`,
        `  posição: ${placement}`,
        `  sequência da tag até o fim: ${item.sequenceTitles.join(" -> ")}`
      ].join("\n");
    })
    .join("\n");

  return [
    `Microssequência: ${microsequenceTitle}`,
    `Tags explícitas: ${tags}`,
    "Tarefa: escolher o slot mais apropriado para reposicionar esta microssequência.",
    "Restrições:",
    "- escolha apenas um slot listado;",
    "- devolva exatamente o slotId escolhido;",
    "- se precisar acomodar a nomenclatura, renomeie apenas microssequências da lição de destino;",
    "- cada renomeação deve apontar para microsequenceKey existente na lição de destino;",
    `Pedido do usuário: ${promptText}`,
    "Slots disponíveis:",
    destinations || "- nenhuma lição disponível"
  ].join("\n");
}

async function parseGeminiResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Falha HTTP ${response.status}.`;
    fail(message);
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => (typeof part?.text === "string" ? part.text : "")).join("").trim();
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "sem conteúdo";
    fail(`A API não devolveu conteúdo utilizável (${reason}).`);
  }

  try {
    return JSON.parse(text);
  } catch {
    fail("A API devolveu JSON inválido.");
  }
}

export function normalizeComposeResult(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.cards) || !value.cards.length) {
    fail("Resposta inválida da API para geração da microssequência.");
  }

  return {
    microsequenceTitle: normalizeText(value.microsequenceTitle) || "Microssequência",
    tags: Array.isArray(value.tags) ? value.tags.map((item) => normalizeText(item)).filter(Boolean) : [],
    cards: value.cards.slice(0, 5).map((card) => sanitizeContractCard(card))
  };
}

export function normalizeEditResult(value, cardType) {
  return sanitizeContractCard(value, cardType);
}

function normalizeRepositionResult(value) {
  const slotId = normalizeText(value?.slotId);
  const renames = Array.isArray(value?.renames)
    ? value.renames.map((item) => ({
        microsequenceKey: normalizeText(item?.microsequenceKey),
        title: normalizeText(item?.title)
      }))
    : null;

  if (!slotId || !renames || renames.some((item) => !item.microsequenceKey || !item.title)) {
    fail("A API devolveu um slot inválido para o reposicionamento da microssequência.");
  }

  return { slotId, renames };
}

export async function runGeminiAssist({
  apiKey,
  model,
  mode,
  microsequence,
  card,
  dependencyTitles = [],
  destinationSlots = [],
  promptText
}) {
  const trimmedKey = normalizeText(apiKey);
  const trimmedModel = normalizeText(model) || "gemini-2.5-flash-lite";
  const trimmedPrompt = normalizeText(promptText);

  if (!trimmedKey) {
    fail("Informe a chave da API antes de enviar o pedido.");
  }
  if (!trimmedPrompt) {
    fail("Escreva o pedido antes de enviar.");
  }
  if (typeof globalThis.fetch !== "function") {
    fail("Este ambiente não oferece suporte a fetch.");
  }

  const systemInstruction =
    "Você escreve conteúdo curto em JSON para o contrato do AraLearn. " +
    "Use apenas tipos suportados, campos rasos por tipo e respostas previsíveis. " +
    "Não explique o que está fazendo. Responda apenas no JSON pedido.";

  let body = null;
  if (mode === "compose-microsequence") {
    body = makeRequestBody({
      systemInstruction,
      prompt: buildComposePrompt({ microsequence, dependencyTitles, promptText: trimmedPrompt }),
      schema: getComposeSchema(),
      temperature: 0.3,
      maxOutputTokens: 2048
    });
  } else if (mode === "edit-card") {
    body = makeRequestBody({
      systemInstruction,
      prompt: buildEditPrompt({ microsequence, card, dependencyTitles, promptText: trimmedPrompt }),
      schema: getEditSchema(normalizeText(card?.type) || "text"),
      temperature: 0.2,
      maxOutputTokens: 1536
    });
  } else if (mode === "reposition-microsequence") {
    body = makeRequestBody({
      systemInstruction,
      prompt: buildRepositionPrompt({ microsequence, dependencyTitles, promptText: trimmedPrompt, destinationSlots }),
      schema: getRepositionSchema(),
      temperature: 0.2,
      maxOutputTokens: 1024
    });
  } else {
    fail("Modo de assistência inválido.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(trimmedModel)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": trimmedKey
      },
      body: JSON.stringify(body)
    }
  );

  const parsed = await parseGeminiResponse(response);
  if (mode === "compose-microsequence") {
    return normalizeComposeResult(parsed);
  }
  if (mode === "edit-card") {
    return normalizeEditResult(parsed, normalizeText(card?.type) || "text");
  }
  return normalizeRepositionResult(parsed);
}
