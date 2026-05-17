import { runGeminiAssist } from "./assistModeDispatcher.js";
import { isCodexLocalModel, runCodexLocalAssist } from "./codexLocalAssist.js";

export function runAssist({ model, apiKey, codexEndpoint, codexToken, ...payload }) {
  if (isCodexLocalModel(model)) {
    return runCodexLocalAssist({
      endpoint: codexEndpoint,
      token: codexToken,
      mode: payload.mode,
      context: payload.context ?? payload.microsequence ?? {},
      promptText: payload.promptText,
      ...payload
    });
  }

  return runGeminiAssist({
    model,
    apiKey,
    ...payload
  });
}

