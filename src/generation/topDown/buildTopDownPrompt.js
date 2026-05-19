import { buildTopDownSystemPrompt, buildTopDownUserPrompt } from "../prompts/topDownPrompt.js";

export function buildTopDownPrompt(scopeContract) {
  return {
    system: buildTopDownSystemPrompt(),
    prompt: buildTopDownUserPrompt(scopeContract)
  };
}

