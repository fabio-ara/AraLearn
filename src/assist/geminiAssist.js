import { getContractCardKind, sanitizeContractCard } from "../contract/contractCard.js";
import { callModelWithRetry } from "../generation/providers/callModelWithRetry.js";
import { getModelCapabilities } from "../generation/providers/modelCapabilities.js";
import { ProviderHttpError } from "../generation/providers/providerErrors.js";
import {
  buildSourceGuideTextForModel,
  getSourceGuideSchemaPropertiesForModel,
  getSourceGuideSchemaRequired,
  sanitizeSourceGuideStructuredForModel,
  SOURCE_GUIDE_LEVELS
} from "../sourceGuides/sourceGuideStructured.js";
import {
  getLessonGuidanceSchemaProperties,
  getLessonGuidanceSchemaRequired,
  listLessonContentTypeIds,
  listLessonLearningActionIds,
  listLessonResourceTagIds,
  listLessonSupportLevelIds,
  normalizeLessonGuidance
} from "../generation/guidance/lessonGuidance.js";
import { buildLessonDomainCoverageReport, listCoverageRoles } from "../generation/domain/lessonDomainModel.js";
import {
  buildMicrosequencePlanningRepairPrompt as buildMicrosequencePlanningRepairPromptFlow,
  composeMicrosequenceWithTwoStepGeneration as composeMicrosequenceWithTwoStepGenerationFlow,
  mapPreferredContainerToResource as mapPreferredContainerToResourceFlow,
  normalizeComposeResult as normalizeComposeResultFlow,
  resumeGenerationFromValidatedPlan as resumeGenerationFromValidatedPlanFlow,
  validateOrRepairMicrosequencePlan as validateOrRepairMicrosequencePlanFlow
} from "./microsequenceComposeFlow.js";

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function makeRequestBody({
  systemInstruction,
  prompt,
  schema,
  temperature = 0.2,
  maxOutputTokens = 2048,
  fileParts = [],
  modelCapabilities = {}
}) {
  const generationConfig = {
    temperature,
    maxOutputTokens,
    responseMimeType: modelCapabilities?.responseMimeType || "application/json"
  };
  if (schema && modelCapabilities?.supportsResponseJsonSchema !== false) {
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

function getStructureSchema() {
  return {
    type: "object",
    properties: {
      course: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          modules: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                lessons: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      sourceGuide: { type: "string" },
                      sourceGuideStructured: {
                        type: "object",
                        properties: getSourceGuideSchemaPropertiesForModel(SOURCE_GUIDE_LEVELS.LESSON),
                        required: getSourceGuideSchemaRequired(SOURCE_GUIDE_LEVELS.LESSON),
                        additionalProperties: false
                      },
                      ...getLessonGuidanceSchemaProperties()
                    },
                    required: ["title", "description", "sourceGuide", "sourceGuideStructured", ...getLessonGuidanceSchemaRequired()],
                    additionalProperties: false
                  }
                }
              },
              required: ["title", "description", "lessons"],
              additionalProperties: false
            }
          }
        },
        required: ["title", "description", "modules"],
        additionalProperties: false
      }
    },
    required: ["course"],
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

function buildOptionalGuideLine(label, value) {
  const normalized = normalizeText(value);
  return normalized ? `${label}: ${normalized}` : "";
}

function buildOptionalDescriptionLine(label, value) {
  const normalized = normalizeText(value);
  return normalized ? `${label}: ${normalized}` : "";
}

function buildOptionalStructuredGuideLine(label, value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [normalizeText(key), normalizeText(entryValue)])
    .filter(([, entryValue]) => entryValue);
  if (!entries.length) {
    return "";
  }

  return `${label}: ${entries.map(([key, entryValue]) => `${key}=${entryValue}`).join("; ")}`;
}

function buildOptionalDomainCoverageLine(context) {
  if (!context?.lessonDomainMap || typeof context.lessonDomainMap !== "object") {
    return "";
  }

  const coverage = buildLessonDomainCoverageReport({
    sourceGuideStructured: context.lessonSourceGuideStructured || {},
    domainMap: context.lessonDomainMap,
    microsequences: context.existingMicrosequences || []
  });

  const parts = [
    coverage.uncoveredItems.length ? `sem microssequência: ${coverage.uncoveredItems.join("; ")}` : "",
    coverage.weakItems.length ? `fracos: ${coverage.weakItems.join("; ")}` : "",
    coverage.explainedWithoutPractice.length
      ? `explicados sem prática: ${coverage.explainedWithoutPractice.join("; ")}`
      : "",
    coverage.practiceWithoutVariation.length
      ? `prática sem variação: ${coverage.practiceWithoutVariation.join("; ")}`
      : "",
    coverage.examMissing.length ? `sem formato de prova: ${coverage.examMissing.join("; ")}` : ""
  ].filter(Boolean);

  return parts.length ? `Mapa de domínio da lição: ${parts.join(" | ")}` : "";
}

function buildExistingMicrosequenceLines(items = [], { includeKeys = false } = {}) {
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          key: normalizeText(item?.key),
          position: Number.isInteger(item?.position) ? item.position : null,
          title: normalizeText(item?.title),
          description: normalizeText(item?.description),
          tags: Array.isArray(item?.tags) ? item.tags.map((entry) => normalizeText(entry)).filter(Boolean) : [],
          domainRefs: Array.isArray(item?.domainRefs) ? item.domainRefs.map((entry) => normalizeText(entry)).filter(Boolean) : [],
          practiceVariantRefs: Array.isArray(item?.practiceVariantRefs)
            ? item.practiceVariantRefs.map((entry) => normalizeText(entry)).filter(Boolean)
            : [],
          didacticPurpose: normalizeText(item?.didacticPurpose),
          coverageRole: normalizeText(item?.coverageRole),
          status: normalizeText(item?.status),
          included: item?.included === true
        }))
        .filter((item) => item.title)
    : [];

  if (!normalizedItems.length) {
    return ["Microssequências atuais: nenhuma."];
  }

  return [
    "Microssequências atuais:",
    ...normalizedItems.map((item, index) => {
      const key = includeKeys && item.key ? `; key: ${item.key}` : "";
      const position = includeKeys && Number.isInteger(item.position) ? `; posição: ${item.position + 1}` : "";
      const tags = item.tags.length ? `; tags: ${item.tags.join(", ")}` : "";
      const domainRefs = item.domainRefs.length ? `; domainRefs: ${item.domainRefs.join(", ")}` : "";
      const variantRefs = item.practiceVariantRefs.length ? `; practiceVariants: ${item.practiceVariantRefs.join(", ")}` : "";
      const didacticPurpose = item.didacticPurpose ? `; finalidade: ${item.didacticPurpose}` : "";
      const coverageRole = item.coverageRole ? `; papel: ${item.coverageRole}` : "";
      const description = item.description ? `; descrição: ${item.description}` : "";
      return `${index + 1}. ${item.title}${key}${position}; status: ${item.status || "draft"}; included: ${item.included ? "sim" : "não"}${description}${coverageRole}${didacticPurpose}${domainRefs}${variantRefs}${tags}`;
    })
  ];
}

function buildHierarchySummaryLines(label, items = [], childLabel = "") {
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          title: normalizeText(item?.title),
          description: normalizeText(item?.description),
          sourceGuide: normalizeText(item?.sourceGuide),
          children: Array.isArray(item?.lessons)
            ? item.lessons
                .map((child) => ({
                  title: normalizeText(child?.title),
                  description: normalizeText(child?.description),
                  sourceGuide: normalizeText(child?.sourceGuide)
                }))
                .filter((child) => child.title || child.description || child.sourceGuide)
            : []
        }))
        .filter((item) => item.title || item.description || item.sourceGuide || item.children.length)
    : [];

  if (!normalizedItems.length) {
    return [`${label}: nenhum.`];
  }

  return [
    `${label}:`,
    ...normalizedItems.map((item, index) => {
      const description = item.description ? `; descrição: ${item.description}` : "";
      const sourceGuide = item.sourceGuide ? `; fonte-guia: ${item.sourceGuide}` : "";
      const children = item.children.length
        ? `; ${childLabel}: ${item.children
            .map((child) => {
              const childDescription = child.description ? ` (${child.description})` : "";
              const childGuide = child.sourceGuide ? ` [${child.sourceGuide}]` : "";
              return `${child.title || "sem título"}${childDescription}${childGuide}`;
            })
            .join(" | ")}`
        : "";
      return `${index + 1}. ${item.title || "sem título"}${description}${sourceGuide}${children}`;
    })
  ];
}

function buildStructurePrompt({ context, promptText }) {
  const courseTitle = normalizeText(context?.courseTitle) || "novo curso";
  const moduleTitle = normalizeText(context?.moduleTitle) || "novo módulo";
  const lessonTitle = normalizeText(context?.lessonTitle) || "nova lição";

  return [
    "Você gera estrutura top-down para o AraLearn.",
    "",
    `Ação prevista: ${normalizeText(context?.actionLabel) || "criar curso completo"}.`,
    `Curso fixado: ${context?.courseFixed ? "sim" : "não"}.`,
    `Módulo fixado: ${context?.moduleFixed ? "sim" : "não"}.`,
    `Lição fixada: ${context?.lessonFixed ? "sim" : "não"}.`,
    "",
    "Contexto atual:",
    `Curso: ${courseTitle}`,
    `Descrição breve do curso: ${normalizeText(context?.courseDescription) || "ausente"}`,
    `Módulo: ${moduleTitle}`,
    `Descrição breve do módulo: ${normalizeText(context?.moduleDescription) || "ausente"}`,
    `Lição: ${lessonTitle}`,
    `Descrição breve da lição: ${normalizeText(context?.lessonDescription) || "ausente"}`,
    buildOptionalGuideLine("Fonte-guia da lição", context?.lessonSourceGuide),
    buildOptionalStructuredGuideLine("Fonte-guia estruturada da lição", context?.lessonSourceGuideStructured),
    buildOptionalGuideLine(
      "Recursos atuais da lição",
      Array.isArray(context?.lessonResourceTags) ? context.lessonResourceTags.join(", ") : ""
    ),
    buildOptionalGuideLine(
      "Tipos atuais de conteúdo",
      Array.isArray(context?.lessonContentTypeTags) ? context.lessonContentTypeTags.join(", ") : ""
    ),
    buildOptionalGuideLine(
      "Ações atuais de estudo",
      Array.isArray(context?.lessonLearningActionTags) ? context.lessonLearningActionTags.join(", ") : ""
    ),
    buildOptionalGuideLine("Nível atual de apoio", context?.lessonSupportLevel),
    "",
    ...buildHierarchySummaryLines("Módulos atuais do curso", context?.courseModules, "lições"),
    ...buildHierarchySummaryLines("Lições atuais do módulo", context?.moduleLessons),
    ...buildExistingMicrosequenceLines(context?.lessonMicrosequences),
    "",
    "Entrada do usuário:",
    promptText,
    "",
    "Regras:",
    "- Retorne apenas curso, módulos e lições.",
    "- Não gere microssequências.",
    "- Não gere cards.",
    "- description deve ser breve, própria para UI.",
    "- Curso e módulo não têm fonte-guia própria neste contrato.",
    "- Em lição, use apenas: lessonGoal, notationRules, commonErrors.",
    `- Em lição, resourceTags deve usar apenas: ${listLessonResourceTagIds().join(", ")}.`,
    `- Em lição, contentTypeTags deve usar apenas: ${listLessonContentTypeIds().join(", ")}.`,
    `- Em lição, learningActionTags deve usar apenas: ${listLessonLearningActionIds().join(", ")}.`,
    `- Em lição, supportLevel deve usar apenas: ${listLessonSupportLevelIds().join(", ")}.`,
    "- sourceGuide deve ser apenas um resumo curto e legível de sourceGuideStructured.",
    "- Quando o assunto usar símbolos, conectivos, comandos, fórmulas ou nomes curtos, registre isso em notationRules.",
    "- Não use description como substituto de sourceGuide.",
    "- Ao atualizar estrutura existente, use os textos atuais dos níveis afetados como base e devolva textos compatíveis com a mudança solicitada.",
    "- Se um nível estiver fixado, preserve exatamente o título informado pelo usuário.",
    "- Se o escopo estiver dentro de um curso existente, devolva somente os módulos e lições relevantes para esse curso.",
    "- Se o escopo estiver dentro de um módulo fixado, devolva exatamente um módulo com suas lições.",
    "- Se o escopo estiver dentro de uma lição fixada, devolva exatamente um curso, um módulo e uma lição.",
    "- Não inclua HTML, Markdown estrutural nem explicações fora do JSON.",
    "",
    "Formato obrigatório do JSON:",
    "{",
    '  "course": {',
    '    "title": "string",',
    '    "description": "string",',
    '    "modules": [',
    '      {',
    '        "title": "string",',
    '        "description": "string",',
    '        "lessons": [',
    '          {',
    '            "title": "string",',
    '            "description": "string",',
    '            "sourceGuide": "string",',
    '            "sourceGuideStructured": {',
    '              "lessonGoal": "string",',
    '              "notationRules": "string",',
    '              "commonErrors": "string"',
    "            }",
    "          }",
    "        ]",
    "      }",
    "    ]",
    "  }",
    "}"
  ].join("\n");
}

export function buildEditPrompt({ microsequence, card, dependencyTitles, promptText }) {
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
    buildOptionalGuideLine("Fonte-guia do curso", microsequence?.courseSourceGuide),
    `Módulo: ${moduleTitle}`,
    `Objetivo do módulo: ${moduleDescription}`,
    buildOptionalGuideLine("Fonte-guia do módulo", microsequence?.moduleSourceGuide),
    `Lição: ${lessonTitle}`,
    `Objetivo da lição: ${lessonDescription}`,
    buildOptionalGuideLine("Fonte-guia da lição", microsequence?.lessonSourceGuide),
    `Microssequência: ${microsequenceTitle}`,
    buildOptionalGuideLine("Finalidade didática da microssequência", microsequence?.didacticPurpose),
    `Card atual: ${cardTitle}`,
    `Intenção atual: ${cardKind}`,
    `Tags explícitas: ${tags}`,
    "Tarefa: revisar apenas este card mantendo a mesma intenção principal.",
    "Não faça resumo genérico. Decomponha o ponto didático solicitado.",
    "Princípio didático: mostre antes de nomear, concretize antes de generalizar e não esconda a ponte do raciocínio.",
    "Restrições:",
    "- não use campo type, text, columns, rows, src, runtime, intent nem data;",
    "- use apenas o formato semântico raso do contrato;",
    "- não invente novas tags nem sinônimos de tags;",
    "- se o card for prática, mantenha no próprio card os dados, regras, fórmulas e notações necessários para resolver;",
    "- não introduza prática de regra ainda não ensinada na microssequência; nesse caso, transforme o card em microteoria ou exemplo simples;",
    "- se a explicação estiver abstrata demais para iniciante, concretize com caso pequeno, tabela curta ou exemplo guiado mantendo a mesma intenção do card;",
    "- se o card definir um conceito, acrescente exemplo mínimo, contraste ou quadro curto;",
    "- se houver notação pouco familiar para iniciante, traduza para linguagem comum antes de cobrar uso ou interpretação;",
    "- se o card usar recurso visual como `plane`, `table`, `matrix` ou `tree`, coloque no próprio card os valores, passos e conclusão que o aluno deve ler;",
    "- em recurso visual, destaque só o que o texto nomear explicitamente;",
    "- se usar `table`, prefira poucas linhas e poucas colunas; quando houver linha ou coluna decisiva, use `table.focus` com `label` curto para guiar a leitura;",
    "- não use linguagem de bastidor nem referência externa ou volátil como caderno, aula, prova, material, trecho acima ou equivalente;",
    "- não mantenha exercício cuja resposta já esteja explicitamente dada no mesmo card por texto, legenda, nota ou fórmula pronta; nesse caso, separe a explicação e a prática;",
    "- não use feedback que já interprete o resultado final se o aluno ainda não foi ensinado a montar ou ler a conta; confirme primeiro a etapa operacional;",
    "- em prática de iniciante, reduza o salto de raciocínio ao mínimo e cobre primeiro reconhecimento de padrão antes de combinação de ideias novas;",
    "- se a explicação ficar pesada demais, divida em mais cards em vez de comprimir tudo num quadro largo ou denso;",
    "- se a figura existir para justificar um resultado, escreva esse resultado explicitamente no próprio card em vez de deixá-lo implícito na imagem;",
    "- não use prática que apenas peça para repetir uma resposta já visível por destaque ou posição óbvia;",
    "- destaque símbolos, conectivos, comandos, fórmulas e nomes curtos com acentos graves;",
    "- não repita o título do card no corpo nem como título interno;",
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
    throw new ProviderHttpError({ statusCode: response.status, message, payload: data });
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

function normalizeRetryOptions(options = {}) {
  return {
    maxAttempts: options.maxAttempts,
    baseDelayMs: options.baseDelayMs,
    maxDelayMs: options.maxDelayMs,
    jitterRatio: options.jitterRatio,
    delay: options.delay,
    random: options.random
  };
}

function normalizeFallbackOptions(options = {}) {
  return {
    fallbackEnabled: options.fallbackEnabled === true,
    fallbackModelId: normalizeText(options.fallbackModelId),
    allowFallbackOn: Array.isArray(options.allowFallbackOn) ? options.allowFallbackOn : undefined
  };
}

async function callGeminiWithOperationalRetry({
  apiKey,
  model,
  body,
  phase,
  retryOptions = {},
  fallbackOptions = {}
}) {
  return callModelWithRetry({
    request: body,
    phase,
    modelId: model,
    ...normalizeRetryOptions(retryOptions),
    ...normalizeFallbackOptions(fallbackOptions),
    callModel: ({ request, modelId }) => callGemini({ apiKey, model: modelId, body: request })
  });
}

const GEMINI_COMPOSE_FLOW_DEPS = Object.freeze({
  callProviderWithRetry: callGeminiWithOperationalRetry,
  buildRequestBody: makeRequestBody
});

export function mapPreferredContainerToResource(preferredContainer) {
  return mapPreferredContainerToResourceFlow(preferredContainer);
}

export function buildMicrosequencePlanningRepairPrompt(payload) {
  return buildMicrosequencePlanningRepairPromptFlow(payload);
}

export async function validateOrRepairMicrosequencePlan(args) {
  return validateOrRepairMicrosequencePlanFlow({
    ...args,
    deps: GEMINI_COMPOSE_FLOW_DEPS
  });
}

export async function resumeGenerationFromValidatedPlan(args) {
  return resumeGenerationFromValidatedPlanFlow({
    ...args,
    deps: GEMINI_COMPOSE_FLOW_DEPS
  });
}

async function composeMicrosequenceWithGemini(input) {
  return composeMicrosequenceWithTwoStepGenerationFlow({
    ...input,
    deps: GEMINI_COMPOSE_FLOW_DEPS
  });
}

export function normalizeComposeResult(value) {
  return normalizeComposeResultFlow(value);
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

function normalizeStructureResult(value) {
  const course = value?.course && typeof value.course === "object" ? value.course : null;
  const courseTitle = normalizeText(course?.title);
  const courseDescription = normalizeText(course?.description);

  const modules = Array.isArray(course?.modules)
    ? course.modules
        .map((moduleValue) => {
          const moduleTitle = normalizeText(moduleValue?.title);
          const moduleDescription = normalizeText(moduleValue?.description);
          const lessons = Array.isArray(moduleValue?.lessons)
            ? moduleValue.lessons
                .map((lesson) => {
                  const lessonSourceGuideStructured = sanitizeSourceGuideStructuredForModel(lesson?.sourceGuideStructured, {
                    level: SOURCE_GUIDE_LEVELS.LESSON
                  });
                  const lessonSourceGuide = buildSourceGuideTextForModel(
                    lessonSourceGuideStructured,
                    { level: SOURCE_GUIDE_LEVELS.LESSON }
                  );
                  const lessonGuidance = normalizeLessonGuidance(lesson);
                  return {
                    title: normalizeText(lesson?.title),
                    description: normalizeText(lesson?.description),
                    sourceGuide: lessonSourceGuide,
                    sourceGuideStructured: lessonSourceGuideStructured,
                    ...lessonGuidance
                  };
                })
                .filter((lesson) => lesson.title && lesson.description && lesson.sourceGuide && Object.keys(lesson.sourceGuideStructured).length)
            : [];

          if (!moduleTitle || !moduleDescription || !lessons.length) {
            return null;
          }

          const seenLessons = new Set();
          return {
            title: moduleTitle,
            description: moduleDescription,
            lessons: lessons.filter((lesson) => {
              const key = lesson.title.toLowerCase();
              if (seenLessons.has(key)) {
                return false;
              }
              seenLessons.add(key);
              return true;
            })
          };
        })
        .filter(Boolean)
    : [];

  if (!courseTitle || !courseDescription || !modules.length) {
    fail("O serviço de IA devolveu uma estrutura de curso incompleta.");
  }

  const seenModules = new Set();
  return {
    course: {
      title: courseTitle,
      description: courseDescription,
      modules: modules.filter((moduleValue) => {
        const key = moduleValue.title.toLowerCase();
        if (seenModules.has(key)) {
          return false;
        }
        seenModules.add(key);
        return true;
      })
    }
  };
}

export async function runGeminiAssist({
  apiKey,
  model,
  mode,
  microsequence,
  card,
  dependencyTitles = [],
  selectedLessonTopicRefs = [],
  destinationSlots = [],
  promptText,
  userFixedTypeId = "",
  preferredContainer = "",
  attachments = [],
  retryOptions = {},
  fallbackModelId = "",
  fallbackEnabled = false,
  allowFallbackOn = ["rate_limited", "service_unavailable", "timeout"],
  saveGeneratedCards = null
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
        selectedLessonTopicRefs,
        promptText: trimmedPrompt,
        userFixedTypeId,
        preferredContainer,
        fileParts,
        retryOptions,
        fallbackOptions: {
          fallbackEnabled,
          fallbackModelId,
          allowFallbackOn
        },
        saveGeneratedCards
      });
    } else if (mode === "edit-card") {
      body = makeRequestBody({
        systemInstruction,
        prompt: buildEditPrompt({ microsequence, card, dependencyTitles, promptText: trimmedPrompt }),
        fileParts,
        schema: getEditSchema(getContractCardKind(card) || "say"),
        temperature: 0.2,
        maxOutputTokens: 1536,
        modelCapabilities: getModelCapabilities(trimmedModel)
      });
    } else if (mode === "reposition-microsequence") {
      body = makeRequestBody({
        systemInstruction,
        prompt: buildRepositionPrompt({ microsequence, dependencyTitles, promptText: trimmedPrompt, destinationSlots }),
        fileParts,
        schema: getRepositionSchema(),
        temperature: 0.2,
        maxOutputTokens: 1024,
        modelCapabilities: getModelCapabilities(trimmedModel)
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
        maxOutputTokens: 1024,
        modelCapabilities: getModelCapabilities(trimmedModel)
      });
    } else if (mode === "generate-top-down-structure") {
      body = makeRequestBody({
        systemInstruction:
          "Você gera estruturas de curso para o AraLearn. " +
          "Responda apenas no JSON pedido com governança estruturada de curso, módulo e lição.",
        prompt: buildStructurePrompt({ context: microsequence, promptText: trimmedPrompt }),
        fileParts,
        schema: getStructureSchema(),
        temperature: 0.2,
        maxOutputTokens: 4096,
        modelCapabilities: getModelCapabilities(trimmedModel)
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
    if (mode === "generate-top-down-structure") {
      return normalizeStructureResult(parsed);
    }
    return normalizeRepositionResult(parsed);
  } finally {
    await deleteGeminiAttachments({ apiKey: trimmedKey, attachments: uploadedAttachments });
  }
}
