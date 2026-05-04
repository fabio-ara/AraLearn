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

function buildComposePrompt({ microsequence, dependencyTitles, promptText }) {
  const title = normalizeText(microsequence?.title) || "Microssequência atual";
  const objective = normalizeText(microsequence?.objective);
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";

  return [
    `Microssequência atual: ${title}`,
    `Objetivo atual: ${objective || "sem objetivo definido"}`,
    `Tags explícitas: ${tags}`,
    "Tarefa: gerar uma versão simples desta única microssequência.",
    "Restrições:",
    "- trabalhe só nesta microssequência;",
    "- gere entre 3 e 5 cards;",
    "- cada card deve ter título curto e texto curto;",
    "- não invente novas tags nem sinônimos de tags;",
    "- não mencione curso, módulo ou lição dentro dos cards;",
    `Pedido do usuário: ${promptText}`
  ].join("\n");
}

function buildEditPrompt({ microsequence, card, dependencyTitles, promptText }) {
  const microsequenceTitle = normalizeText(microsequence?.title) || "Microssequência atual";
  const cardTitle = normalizeText(card?.title) || "Card atual";
  const cardText = normalizeText(card?.data?.text);
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";

  return [
    `Microssequência: ${microsequenceTitle}`,
    `Tags explícitas: ${tags}`,
    `Título atual do card: ${cardTitle}`,
    `Texto atual do card: ${cardText || "sem texto"}`,
    "Tarefa: revisar apenas este card.",
    "Restrições:",
    "- mantenha o escopo no card atual;",
    "- use texto curto e didático;",
    "- não invente novas tags nem sinônimos de tags;",
    `Pedido do usuário: ${promptText}`
  ].join("\n");
}

function buildRepositionPrompt({ microsequence, dependencyTitles, promptText, destinationSlots }) {
  const microsequenceTitle = normalizeText(microsequence?.title) || "Microssequência atual";
  const objective = normalizeText(microsequence?.objective) || "sem objetivo definido";
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
    `Objetivo atual: ${objective}`,
    `Tags explícitas: ${tags}`,
    "Tarefa: escolher o slot mais apropriado para reposicionar esta microssequência.",
    "Restrições:",
    "- escolha apenas um slot listado;",
    "- devolva exatamente o slotId escolhido;",
    "- se precisar acomodar a nomenclatura, renomeie apenas microssequências da lição de destino;",
    "- cada renomeação deve apontar para microsequenceKey existente na lição de destino;",
    "- baseie a decisão principalmente nas tags explícitas e no pedido do usuário;",
    `Pedido do usuário: ${promptText}`,
    "Slots disponíveis:",
    destinations || "- nenhuma lição disponível"
  ].join("\n");
}

function getComposeSchema() {
  return {
    type: "object",
    properties: {
      microsequenceTitle: { type: "string" },
      objective: { type: "string" },
      cards: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            text: { type: "string" }
          },
          required: ["title", "text"],
          additionalProperties: false
        }
      }
    },
    required: ["microsequenceTitle", "objective", "cards"],
    additionalProperties: false
  };
}

function getEditSchema() {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      text: { type: "string" }
    },
    required: ["title", "text"],
    additionalProperties: false
  };
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

function normalizeComposeResult(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.cards) || !value.cards.length) {
    fail("Resposta inválida da API para geração da microssequência.");
  }

  const cards = value.cards
    .map((card, index) => {
      const title = normalizeText(card?.title) || `Card ${index + 1}`;
      const text = normalizeText(card?.text);
      if (!text) {
        fail("A API devolveu um card vazio.");
      }

      return { title, text };
    })
    .slice(0, 5);

  return {
    microsequenceTitle: normalizeText(value.microsequenceTitle) || "Microssequência",
    objective: normalizeText(value.objective) || "Organizar esta microssequência em passos curtos.",
    cards
  };
}

function normalizeEditResult(value) {
  const title = normalizeText(value?.title);
  const text = normalizeText(value?.text);
  if (!title || !text) {
    fail("Resposta inválida da API para revisão do card.");
  }

  return { title, text };
}

function normalizeRepositionResult(value) {
  const slotId = normalizeText(value?.slotId);
  const renames = Array.isArray(value?.renames)
    ? value.renames.map((item) => {
        const microsequenceKey = normalizeText(item?.microsequenceKey);
        const title = normalizeText(item?.title);
        if (!microsequenceKey || !title) {
          fail("A API devolveu renomeações inválidas para o reposicionamento.");
        }
        return { microsequenceKey, title };
      })
    : null;

  if (!slotId || !renames) {
    fail("A API devolveu um slot inválido para o reposicionamento da microssequência.");
  }

  return { slotId, renames };
}

async function parseGeminiResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Falha HTTP ${response.status}.`;
    fail(message);
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

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
    "Você escreve conteúdo curto para o AraLearn. Seja literal, simples e previsível. " +
    "Não use sinônimos para mapear tags. Não explique o que está fazendo. Responda apenas no JSON pedido.";

  let body = null;
  if (mode === "compose-microsequence") {
    body = makeRequestBody({
      systemInstruction,
      prompt: buildComposePrompt({ microsequence, dependencyTitles, promptText: trimmedPrompt }),
      schema: getComposeSchema(),
      temperature: 0.3,
      maxOutputTokens: 2048
    });
  } else if (mode === "reposition-microsequence") {
    body = makeRequestBody({
      systemInstruction,
      prompt: buildRepositionPrompt({ microsequence, dependencyTitles, promptText: trimmedPrompt, destinationSlots }),
      schema: getRepositionSchema(),
      temperature: 0.2,
      maxOutputTokens: 1024
    });
  } else if (mode === "edit-card") {
    body = makeRequestBody({
      systemInstruction,
      prompt: buildEditPrompt({ microsequence, card, dependencyTitles, promptText: trimmedPrompt }),
      schema: getEditSchema(),
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
  if (mode === "reposition-microsequence") {
    return normalizeRepositionResult(parsed);
  }
  return normalizeEditResult(parsed);
}
