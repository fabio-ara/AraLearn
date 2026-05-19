import { buildContextPacket } from "./buildContextPacket.js";
import { appendVersion, findSelection, replaceMicrosequence } from "./_shared.js";
import { microsequenceCardsSchema } from "../schemas/bottomUpSchema.js";
import { validateMicrosequenceCards } from "./validateMicrosequenceCards.js";
import { buildBottomUpSystemPrompt } from "../prompts/bottomUpPrompt.js";
import { buildImprovePrompt } from "../prompts/improvePrompt.js";

export async function improveMicrosequenceVersion({
  project,
  selection,
  provider,
  modelId,
  density = "standard",
  reason,
  providerOptions = {},
  source = "llm"
} = {}) {
  if (!reason) {
    throw new Error("Informe o motivo da melhoria.");
  }
  const info = findSelection(project, selection);
  if (!info?.microsequence?.activeVersionKey) {
    throw new Error("A microssequência ainda não tem versão ativa para melhorar.");
  }
  const packet = buildContextPacket(project, selection, { density, userRequest: reason });
  const payload = await provider.generateStructured({
    ...providerOptions,
    modelId,
    mode: "improve-microsequence",
    system: buildBottomUpSystemPrompt(),
    prompt: buildImprovePrompt(packet, reason),
    schema: microsequenceCardsSchema,
    temperature: 0.2
  });
  const validation = validateMicrosequenceCards(payload, density);
  if (!validation.ok) {
    throw new Error(validation.errors.map((error) => error.message).join("; "));
  }
  const nextMicrosequence = appendVersion(info.microsequence, {
    ...validation.value,
    validationReport: validation.report
  }, {
    source,
    mode: "improve",
    userRequest: reason,
    status: "needs_review"
  });
  return {
    project: replaceMicrosequence(project, info, nextMicrosequence),
    selection
  };
}

