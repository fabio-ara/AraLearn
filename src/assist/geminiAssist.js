import { getContractCardKind, sanitizeContractCard } from "../contract/contractCard.js";
import {
  buildDeterministicAssistPlan,
  buildAssistDraftPrompt,
  getAssistDraftSchema,
  normalizeAssistDraftResult
} from "./assistMicrosequenceEngine.js";

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function makeRequestBody({ systemInstruction, prompt, schema, temperature = 0.2, maxOutputTokens = 2048, fileParts = [] }) {
  const generationConfig = {
    temperature,
    maxOutputTokens,
    responseMimeType: "application/json"
  };
  if (schema) {
    generationConfig.responseJsonSchema = schema;
  }

  return {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        role: "user",
        parts: [...fileParts, { text: prompt }]
      }
    ],
    generationConfig
  };
}

function inferMimeType(fileName = "") {
  const normalized = normalizeText(fileName).toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".md")) return "text/markdown";
  if (normalized.endsWith(".txt")) return "text/plain";
  if (normalized.endsWith(".json")) return "application/json";
  if (normalized.endsWith(".csv")) return "text/csv";
  if (normalized.endsWith(".html")) return "text/html";
  if (normalized.endsWith(".xml")) return "application/xml";
  if (normalized.endsWith(".js")) return "text/javascript";
  if (normalized.endsWith(".ts")) return "text/plain";
  if (normalized.endsWith(".py")) return "text/x-python";
  if (normalized.endsWith(".java")) return "text/x-java-source";
  if (normalized.endsWith(".c")) return "text/x-c";
  if (normalized.endsWith(".cpp")) return "text/x-c++src";
  if (normalized.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (normalized.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

function normalizeAttachmentParts(attachments = []) {
  return attachments
    .filter((item) => item && typeof item === "object" && normalizeText(item.uri))
    .map((item) => ({
      file_data: {
        mime_type: normalizeText(item.mimeType) || "application/octet-stream",
        file_uri: normalizeText(item.uri)
      }
    }));
}

function encodeGeminiResourceName(name) {
  return String(name || "")
    .split("/")
    .map((item) => encodeURIComponent(item))
    .join("/");
}

async function parseGeminiUploadResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Falha HTTP ${response.status}.`;
    fail(message);
  }

  const file = data?.file || data;
  const uri = normalizeText(file?.uri);
  const mimeType = normalizeText(file?.mimeType);
  const name = normalizeText(file?.name);

  if (!uri || !name) {
    fail("O serviço de IA não devolveu um arquivo utilizável.");
  }

  return {
    uri,
    mimeType: mimeType || "application/octet-stream",
    name
  };
}

async function uploadGeminiAttachment({ apiKey, attachment }) {
  const name = normalizeText(attachment?.name) || "documento";
  const mimeType = normalizeText(attachment?.type) || inferMimeType(name);
  const bytes = await attachment.arrayBuffer();
  const startResponse = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType
    },
    body: JSON.stringify({
      file: {
        display_name: name
      }
    })
  });
  if (!startResponse.ok) {
    return parseGeminiUploadResponse(startResponse);
  }

  const uploadUrl =
    startResponse.headers?.get("x-goog-upload-url") ||
    startResponse.headers?.get("X-Goog-Upload-URL") ||
    startResponse.headers?.get("X-Goog-Upload-Url");
  if (!uploadUrl) {
    fail("O serviço de IA não devolveu a URL de upload do anexo.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: bytes
  });

  return parseGeminiUploadResponse(uploadResponse);
}

async function uploadGeminiAttachments({ apiKey, attachments }) {
  const uploaded = [];

  for (const attachment of attachments || []) {
    uploaded.push(await uploadGeminiAttachment({ apiKey, attachment }));
  }

  return uploaded;
}

async function deleteGeminiAttachment({ apiKey, name }) {
  const resourceName = normalizeText(name);
  if (!resourceName) {
    return;
  }

  await fetch(`https://generativelanguage.googleapis.com/v1beta/${encodeGeminiResourceName(resourceName)}`, {
    method: "DELETE",
    headers: {
      "x-goog-api-key": apiKey
    }
  }).catch(() => null);
}

async function deleteGeminiAttachments({ apiKey, attachments }) {
  for (const attachment of attachments || []) {
    await deleteGeminiAttachment({ apiKey, name: attachment?.name });
  }
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

function getLadderSchema() {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      steps: {
        type: "array",
        minItems: 2,
        maxItems: 7,
        items: {
          type: "object",
          properties: {
            title: { type: "string" }
          },
          required: ["title"],
          additionalProperties: false
        }
      }
    },
    required: ["title", "steps"],
    additionalProperties: false
  };
}

function buildLadderPrompt({ context, promptText }) {
  return [
    "Você é o planejador simples do AraLearn.",
    "",
    "O usuário escolheu um contexto hierárquico e escreveu uma dúvida.",
    "Crie uma escada breve de microssequências para estudar essa dúvida.",
    "",
    "Contexto:",
    `Curso: ${normalizeText(context?.courseTitle)}`,
    `Módulo: ${normalizeText(context?.moduleTitle)}`,
    `Lição: ${normalizeText(context?.lessonTitle)}`,
    "",
    "Dúvida do usuário:",
    promptText,
    "",
    "Regras:",
    "- Cada item deve ser o título claro de uma microssequência pequena.",
    "- As etapas devem ir das dependências mínimas até a dúvida principal.",
    "- Não use nível iniciante/intermediário/avançado.",
    "- Não use tags.",
    "- Não gere cards.",
    "- Não gere explicação.",
    "- Não gere HTML.",
    "- Retorne apenas JSON válido no formato:",
    "",
    "{",
    '  "title": "string",',
    '  "steps": [',
    '    { "title": "string" }',
    "  ]",
    "}",
    "",
    "- A lista steps deve ter de 2 a 7 itens."
  ].join("\n");
}

function buildEditPrompt({ microsequence, card, dependencyTitles, promptText }) {
  const courseTitle = normalizeText(microsequence?.courseTitle) || "Curso atual";
  const courseDescription = normalizeText(microsequence?.courseDescription) || "não informado";
  const moduleTitle = normalizeText(microsequence?.moduleTitle) || "Módulo atual";
  const moduleDescription = normalizeText(microsequence?.moduleDescription) || "não informado";
  const lessonTitle = normalizeText(microsequence?.lessonTitle) || "Lição atual";
  const lessonDescription = normalizeText(microsequence?.lessonDescription) || "não informado";
  const microsequenceTitle = normalizeText(microsequence?.title) || "Microssequência atual";
  const cardTitle = normalizeText(card?.title) || "Card atual";
  const cardKind = getContractCardKind(card) || "say";
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";

  return [
    `Curso: ${courseTitle}`,
    `Objetivo do curso: ${courseDescription}`,
    `Módulo: ${moduleTitle}`,
    `Objetivo do módulo: ${moduleDescription}`,
    `Lição: ${lessonTitle}`,
    `Objetivo da lição: ${lessonDescription}`,
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

  return parseJsonFromModelText(text);
}

function parseJsonFromModelText(text) {
  const candidates = [
    text,
    text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
    extractJsonObjectText(text)
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Tenta a próxima forma comum de resposta do modelo.
    }
  }

  fail("O serviço de IA devolveu JSON inválido.");
}

function extractJsonObjectText(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return "";
  }
  return text.slice(start, end + 1).trim();
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

function isRetryableAssistError(error) {
  const message = error instanceof Error ? error.message : "";
  return [
    "O serviço de IA devolveu JSON inválido.",
    "O serviço de IA devolveu uma microssequência inválida.",
    "O serviço de IA devolveu poucos cards."
  ].includes(message) || isSchemaTooComplexError(error);
}

function isSchemaTooComplexError(error) {
  const message = error instanceof Error ? error.message : "";
  return /schema|constraint|too many states/i.test(message);
}

function buildAssistRetryPrompt({ promptText, plan, microsequence, reason }) {
  return [
    "A tentativa anterior não passou pela validação local do AraLearn.",
    `Motivo: ${reason}`,
    "Gere novamente somente um objeto JSON válido, sem Markdown e sem comentários.",
    "Mantenha exatamente o plano, a ordem dos cards e os campos permitidos pelo formato pedido.",
    buildAssistDraftPrompt({ promptText, plan, microsequence })
  ].join("\n");
}

async function composeMicrosequenceWithGemini({
  apiKey,
  model,
  microsequence,
  dependencyTitles,
  promptText,
  preferredContainer = "",
  fileParts = []
}) {
  const systemInstruction =
    "Você transforma pedidos de estudo em microssequências didáticas para o AraLearn. " +
    "Siga o formato pedido, use linguagem direta e responda apenas com um objeto JSON.";
  const plan = buildDeterministicAssistPlan({
    promptText,
    microsequence,
    dependencyTitles,
    preferredContainer
  });
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt =
      attempt === 0
        ? buildAssistDraftPrompt({ promptText, plan, microsequence })
        : buildAssistRetryPrompt({
            promptText,
            plan,
            microsequence,
            reason: lastError instanceof Error ? lastError.message : "resposta inválida"
          });

    try {
      const parsed = await callGemini({
        apiKey,
        model,
        body: makeRequestBody({
          systemInstruction,
          prompt,
          fileParts,
          schema: isSchemaTooComplexError(lastError) ? null : getAssistDraftSchema(),
          temperature: attempt === 0 ? 0.15 : 0.05,
          maxOutputTokens: 3072
        })
      });
      const draft = normalizeAssistDraftResult(parsed, { plan, promptText });
      return {
        ...draft,
        microsequenceTitle: draft.microsequenceTitle || plan.title,
        tags: draft.tags.length ? draft.tags : plan.tags
      };
    } catch (error) {
      if (!isRetryableAssistError(error) || attempt === 1) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError || new Error("Falha ao gerar microssequência.");
}

export function normalizeComposeResult(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.cards) || !value.cards.length) {
    fail("Resposta inválida do serviço de IA para geração da microssequência.");
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

function normalizeLadderResult(value) {
  const title = normalizeText(value?.title) || "Escada de microssequências";
  const seen = new Set();
  const steps = Array.isArray(value?.steps)
    ? value.steps
        .map((item) => ({ title: normalizeText(item?.title) }))
        .filter((item) => {
          if (!item.title) {
            return false;
          }
          const key = item.title.toLowerCase();
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        })
        .slice(0, 7)
    : [];

  if (steps.length < 2) {
    fail("O serviço de IA devolveu poucos títulos de microssequências.");
  }

  return { title, steps };
}

export async function runGeminiAssist({
  apiKey,
  model,
  mode,
  microsequence,
  card,
  dependencyTitles = [],
  destinationSlots = [],
  promptText,
  preferredContainer = "",
  attachments = []
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

  const normalizedAttachments = (attachments || []).filter(
    (item) => item && typeof item === "object" && typeof item.arrayBuffer === "function"
  );
  const uploadedAttachments = normalizedAttachments.length
    ? await uploadGeminiAttachments({ apiKey: trimmedKey, attachments: normalizedAttachments })
    : [];
  const fileParts = normalizeAttachmentParts(uploadedAttachments);

  try {
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
        promptText: trimmedPrompt,
        preferredContainer,
        fileParts
      });
    } else if (mode === "edit-card") {
      body = makeRequestBody({
        systemInstruction,
        prompt: buildEditPrompt({ microsequence, card, dependencyTitles, promptText: trimmedPrompt }),
        fileParts,
        schema: getEditSchema(getContractCardKind(card) || "say"),
        temperature: 0.2,
        maxOutputTokens: 1536
      });
    } else if (mode === "reposition-microsequence") {
      body = makeRequestBody({
        systemInstruction,
        prompt: buildRepositionPrompt({ microsequence, dependencyTitles, promptText: trimmedPrompt, destinationSlots }),
        fileParts,
        schema: getRepositionSchema(),
        temperature: 0.2,
        maxOutputTokens: 1024
      });
    } else if (mode === "plan-microsequence-ladder") {
      body = makeRequestBody({
        systemInstruction:
          "Você planeja escadas de microssequências para o AraLearn. " +
          "Responda apenas no JSON pedido, sem cards, sem tags e sem explicação.",
        prompt: buildLadderPrompt({ context: microsequence, promptText: trimmedPrompt }),
        fileParts,
        schema: getLadderSchema(),
        temperature: 0.15,
        maxOutputTokens: 1024
      });
    } else {
      fail("Modo de assistência inválido.");
    }

    const parsed = await callGemini({ apiKey: trimmedKey, model: trimmedModel, body });
    if (mode === "edit-card") {
      return normalizeEditResult(parsed);
    }
    if (mode === "plan-microsequence-ladder") {
      return normalizeLadderResult(parsed);
    }
    return normalizeRepositionResult(parsed);
  } finally {
    await deleteGeminiAttachments({ apiKey: trimmedKey, attachments: uploadedAttachments });
  }
}
