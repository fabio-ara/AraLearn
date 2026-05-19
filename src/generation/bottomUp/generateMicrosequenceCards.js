import { buildContextPacket } from "./buildContextPacket.js";
import { appendVersion, findSelection, replaceMicrosequence } from "./_shared.js";
import { microsequenceCardsSchema } from "../schemas/bottomUpSchema.js";
import { validateMicrosequenceCards } from "./validateMicrosequenceCards.js";
import { buildBottomUpSystemPrompt, buildBottomUpUserPrompt } from "../prompts/bottomUpPrompt.js";

export async function generateMicrosequenceCards({
  project,
  selection,
  provider,
  modelId,
  density = "standard",
  userRequest = "",
  providerOptions = {},
  source = "llm"
} = {}) {
  const info = findSelection(project, selection);
  if (!info) {
    throw new Error("Microssequência não encontrada.");
  }
  const packet = buildContextPacket(project, selection, { density, userRequest });
  const payload = await provider.generateStructured({
    ...providerOptions,
    modelId,
    mode: "generate-microsequence",
    system: buildBottomUpSystemPrompt(),
    prompt: buildBottomUpUserPrompt(packet),
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
    mode: "generate",
    userRequest,
    status: "generated"
  });
  return {
    project: replaceMicrosequence(project, info, nextMicrosequence),
    selection,
    packet,
    version: nextMicrosequence.versions[nextMicrosequence.versions.length - 1]
  };
}

