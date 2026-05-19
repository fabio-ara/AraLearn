import { buildContextPacket } from "./buildContextPacket.js";
import { appendVersion, findSelection, replaceMicrosequence } from "./_shared.js";
import { microsequenceCardsSchema } from "../schemas/bottomUpSchema.js";
import { validateMicrosequenceCards } from "./validateMicrosequenceCards.js";
import { buildBottomUpSystemPrompt } from "../prompts/bottomUpPrompt.js";
import { buildPracticePrompt } from "../prompts/practicePrompt.js";

export async function addPracticeToMicrosequence({
  project,
  selection,
  provider,
  modelId,
  density = "deep",
  userRequest = "",
  providerOptions = {},
  source = "llm"
} = {}) {
  const info = findSelection(project, selection);
  if (!info?.microsequence?.activeVersionKey) {
    throw new Error("A microssequência ainda não tem versão ativa para receber mais prática.");
  }
  const packet = buildContextPacket(project, selection, { density, userRequest });
  const payload = await provider.generateStructured({
    ...providerOptions,
    modelId,
    mode: "add-practice",
    system: buildBottomUpSystemPrompt(),
    prompt: buildPracticePrompt(packet, userRequest),
    schema: microsequenceCardsSchema,
    temperature: 0.3
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
    mode: "more_practice",
    userRequest,
    status: "needs_review"
  });
  return {
    project: replaceMicrosequence(project, info, nextMicrosequence),
    selection
  };
}

