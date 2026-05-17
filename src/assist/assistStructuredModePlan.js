import { getContractCardKind } from "../contract/contractCard.js";
import {
  buildEditPrompt,
  buildLadderPrompt,
  buildRepositionPrompt,
  buildStructurePrompt,
  normalizeEditResult,
  normalizeLadderResult,
  normalizeRepositionResult,
  normalizeStructureResult
} from "./assistPromptBuilders.js";
import { getEditSchema, getLadderSchema, getRepositionSchema, getStructureSchema } from "./assistPromptSchemas.js";

const GENERIC_SYSTEM_INSTRUCTION =
  "Você escreve conteúdo em JSON para o contrato do AraLearn. " +
  "Use apenas campos semânticos simples e respostas previsíveis; nunca use type, text, runtime, intent ou data. " +
  "Não explique o que está fazendo. Responda apenas no JSON pedido.";
const LADDER_SYSTEM_INSTRUCTION =
  "Você planeja escadas de microssequências para o AraLearn. " +
  "Responda apenas no JSON pedido, sem cards, sem tags e sem explicação.";
const STRUCTURE_SYSTEM_INSTRUCTION =
  "Você gera estruturas de curso para o AraLearn. " +
  "Responda apenas no JSON pedido com governança estruturada de curso, módulo e lição.";

export function buildStructuredAssistModePlan({
  model,
  mode,
  microsequence,
  card,
  dependencyTitles = [],
  destinationSlots = [],
  promptText,
  buildRequestBody,
  getModelCapabilities
}) {
  const modelCapabilities = getModelCapabilities(model);

  if (mode === "edit-card") {
    return {
      body: buildRequestBody({
        systemInstruction: GENERIC_SYSTEM_INSTRUCTION,
        prompt: buildEditPrompt({ microsequence, card, dependencyTitles, promptText }),
        schema: getEditSchema(getContractCardKind(card) || "say"),
        temperature: 0.2,
        maxOutputTokens: 1536,
        modelCapabilities
      }),
      normalize: normalizeEditResult,
      phase: "assist_edit_card"
    };
  }

  if (mode === "reposition-microsequence") {
    return {
      body: buildRequestBody({
        systemInstruction: GENERIC_SYSTEM_INSTRUCTION,
        prompt: buildRepositionPrompt({ microsequence, dependencyTitles, promptText, destinationSlots }),
        schema: getRepositionSchema(),
        temperature: 0.2,
        maxOutputTokens: 1024,
        modelCapabilities
      }),
      normalize: normalizeRepositionResult,
      phase: "assist_reposition_microsequence"
    };
  }

  if (mode === "plan-microsequence-ladder") {
    return {
      body: buildRequestBody({
        systemInstruction: LADDER_SYSTEM_INSTRUCTION,
        prompt: buildLadderPrompt({ context: microsequence, promptText }),
        schema: getLadderSchema(),
        temperature: 0.15,
        maxOutputTokens: 1024,
        modelCapabilities
      }),
      normalize: normalizeLadderResult,
      phase: "assist_plan_microsequence_ladder"
    };
  }

  if (mode === "generate-top-down-structure") {
    return {
      body: buildRequestBody({
        systemInstruction: STRUCTURE_SYSTEM_INSTRUCTION,
        prompt: buildStructurePrompt({ context: microsequence, promptText }),
        schema: getStructureSchema(),
        temperature: 0.2,
        maxOutputTokens: 4096,
        modelCapabilities
      }),
      normalize: normalizeStructureResult,
      phase: "assist_generate_top_down_structure"
    };
  }

  return null;
}
