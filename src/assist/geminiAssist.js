import { getContractCardKind, sanitizeContractCard } from "../contract/contractCard.js";
import {
  buildAssistDraftPrompt,
  buildAssistPlanPrompt,
  getAssistDraftSchema,
  getAssistPlanSchema,
  normalizeAssistDraftResult,
  normalizeAssistPlan
} from "./assistMicrosequenceEngine.js";

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
      responseJsonSchema: schema
    }
  };
}

function getCardSchemaVariants() {
  return [
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        after: { type: "string" },
        wrong: { type: "array", items: { type: "string" }, minItems: 1 }
      },
      required: ["say"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        ask: { type: "string" },
        answer: {
          anyOf: [
            { type: "string" },
            { type: "array", items: { type: "string" }, minItems: 1 }
          ]
        },
        wrong: { type: "array", items: { type: "string" }, minItems: 2 }
      },
      required: ["ask", "answer", "wrong"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        language: { type: "string" },
        code: { type: "string" },
        after: { type: "string" },
        wrong: { type: "array", items: { type: "string" }, minItems: 1 }
      },
      required: ["code"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        table: {
          type: "object",
          properties: {
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
          required: ["columns", "rows"],
          additionalProperties: false
        },
        after: { type: "string" }
      },
      required: ["table"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        tree: {
          type: "object",
          properties: {
            base: { type: "string" },
            current: { type: "string" },
            selected: { type: "string" },
            closed: { type: "array", items: { type: "string" } },
            items: { type: "object" }
          },
          required: ["items"],
          additionalProperties: false
        },
        after: { type: "string" }
      },
      required: ["tree"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        flow: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              start: { type: "string" },
              input: { type: "string" },
              output: { type: "string" },
              process: { type: "string" },
              end: { type: "string" },
              if: { type: "string" },
              then: {
                type: "array",
                items: { type: "object" }
              },
              else: {
                type: "array",
                items: { type: "object" }
              },
              blank: {
                anyOf: [
                  { type: "boolean" },
                  { type: "string" },
                  { type: "object" }
                ]
              }
            },
            additionalProperties: false
          }
        },
        after: { type: "string" }
      },
      required: ["flow"],
      additionalProperties: false
    }
  ];
}

function getCardSchemaByKind(cardKind) {
  const variants = getCardSchemaVariants();
  const indexByKind = {
    say: 0,
    ask: 1,
    code: 2,
    table: 3,
    tree: 4,
    flow: 5
  };
  return variants[indexByKind[cardKind] ?? 0];
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

function getEditSchema(cardKind) {
  return getCardSchemaByKind(cardKind || "say");
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

function summarizeMicrosequenceCards(microsequence) {
  return (microsequence?.cards || [])
    .map((card, index) => {
      const body =
        normalizeText(card?.say) ||
        normalizeText(card?.ask) ||
        normalizeText(card?.code) ||
        (card?.table ? "table" : "") ||
        (card?.tree ? "tree" : "") ||
        (Array.isArray(card?.flow) ? "flow" : "") ||
        normalizeText(card?.title) ||
        "card";
      return `${index + 1}. ${body}`;
    })
    .join(" | ");
}

function buildComposePrompt({ microsequence, dependencyTitles, promptText, priorMicrosequences = [] }) {
  const title = normalizeText(microsequence?.title) || "Microssequência atual";
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";
  const priorContext = priorMicrosequences.length
    ? [
        "Iterações anteriores disponíveis como contexto:",
        ...priorMicrosequences.map((entry, index) => {
          const entryTags = Array.isArray(entry?.tags) && entry.tags.length ? entry.tags.join(", ") : "sem tags";
          return `- Versão ${index + 1}: ${normalizeText(entry?.title) || normalizeText(entry?.label) || "Microssequência"} | tags: ${entryTags} | cards: ${summarizeMicrosequenceCards(entry)}`;
        })
      ].join("\n")
    : "Iterações anteriores disponíveis como contexto: nenhuma.";

  return [
    `Microssequência atual: ${title}`,
    `Tags explícitas: ${tags}`,
    priorContext,
    "Tarefa: gerar uma microssequência no contrato do AraLearn.",
    "Restrições:",
    "- gere entre 3 e 5 cards;",
    "- não use campo type, text, columns, rows, src, runtime, intent nem data;",
    "- cada card deve declarar intenção por campos simples: say, ask, answer, wrong, code, table, tree, flow ou after;",
    "- para lacunas textuais use [[resposta]] ou [[resposta::resposta|distrator]];",
    "- não invente novas tags fora do contexto dado;",
    "- não mencione curso, módulo ou lição dentro dos cards;",
    `Pedido do usuário: ${promptText}`
  ].join("\n");
}

function buildEditPrompt({ microsequence, card, dependencyTitles, promptText }) {
  const microsequenceTitle = normalizeText(microsequence?.title) || "Microssequência atual";
  const cardTitle = normalizeText(card?.title) || "Card atual";
  const cardKind = getContractCardKind(card) || "say";
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";

  return [
    `Microssequência: ${microsequenceTitle}`,
    `Card atual: ${cardTitle}`,
    `Intenção atual: ${cardKind}`,
    `Tags explícitas: ${tags}`,
    "Tarefa: revisar apenas este card mantendo a mesma intenção principal.",
    "Restrições:",
    "- não use campo type, text, columns, rows, src, runtime, intent nem data;",
    "- use apenas o formato semântico raso do contrato;",
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
    fail(`O serviço de IA não devolveu conteúdo utilizável (${reason}).`);
  }

  try {
    return JSON.parse(text);
  } catch {
    fail("O serviço de IA devolveu JSON inválido.");
  }
}

async function callGemini({ apiKey, model, body }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body)
    }
  );

  return parseGeminiResponse(response);
}

async function composeMicrosequenceWithGemini({
  apiKey,
  model,
  microsequence,
  dependencyTitles,
  priorMicrosequences,
  promptText
}) {
  const systemInstruction =
    "Você transforma pedidos de estudo em microssequências didáticas para o AraLearn. " +
    "Siga o schema recebido, use linguagem direta e responda apenas em JSON.";
  const plan = normalizeAssistPlan(
    await callGemini({
      apiKey,
      model,
      body: makeRequestBody({
        systemInstruction,
        prompt: buildAssistPlanPrompt({ microsequence, dependencyTitles, priorMicrosequences, promptText }),
        schema: getAssistPlanSchema(),
        temperature: 0.15,
        maxOutputTokens: 1024
      })
    })
  );
  const draft = normalizeAssistDraftResult(
    await callGemini({
      apiKey,
      model,
      body: makeRequestBody({
        systemInstruction,
        prompt: buildAssistDraftPrompt({ promptText, plan, microsequence }),
        schema: getAssistDraftSchema(),
        temperature: 0.2,
        maxOutputTokens: 2048
      })
    })
  );

  return {
    ...draft,
    microsequenceTitle: draft.microsequenceTitle || plan.title,
    tags: draft.tags.length ? draft.tags : plan.tags
  };
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

export function normalizeEditResult(value) {
  return sanitizeContractCard(value);
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
    fail("O serviço de IA devolveu um slot inválido para o reposicionamento da microssequência.");
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
  priorMicrosequences = [],
  destinationSlots = [],
  promptText
}) {
  const trimmedKey = normalizeText(apiKey);
  const trimmedModel = normalizeText(model) || "gemini-2.5-flash";
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
    "Você escreve conteúdo em JSON para o contrato do AraLearn. " +
    "Use apenas campos semânticos simples e respostas previsíveis; nunca use type, text, runtime, intent ou data. " +
    "Não explique o que está fazendo. Responda apenas no JSON pedido.";

  let body = null;
  if (mode === "compose-microsequence") {
    return composeMicrosequenceWithGemini({
      apiKey: trimmedKey,
      model: trimmedModel,
      microsequence,
      dependencyTitles,
      priorMicrosequences,
      promptText: trimmedPrompt
    });
  } else if (mode === "edit-card") {
    body = makeRequestBody({
      systemInstruction,
      prompt: buildEditPrompt({ microsequence, card, dependencyTitles, promptText: trimmedPrompt }),
      schema: getEditSchema(getContractCardKind(card) || "say"),
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

  const parsed = await callGemini({ apiKey: trimmedKey, model: trimmedModel, body });
  if (mode === "edit-card") {
    return normalizeEditResult(parsed);
  }
  return normalizeRepositionResult(parsed);
}
