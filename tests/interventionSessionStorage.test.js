import test from "node:test";
import assert from "node:assert/strict";

import {
  readInterventionSessionStorage,
  writeInterventionSessionStorage
} from "../src/ui/lessonEditorStorage.js";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    }
  };
}

test("interventionSessionStorage grava e lê sessões por microssequência", () => {
  const storage = createMemoryStorage();
  writeInterventionSessionStorage(
    {
      "course::module::lesson::micro": {
        courseKey: "course",
        moduleKey: "module",
        lessonKey: "lesson",
        microsequenceKey: "micro",
        baseVersionId: "v3",
        status: "needs_continue_here",
        title: "Continuação recomendada",
        message: "Abra nova iteração local.",
        feedbackText: "Continue a microssequência atual com mais prática.",
        nextPromptDraft: "Continue a microssequência atual com mais prática.",
        recommendedActionIntent: "continue_current",
        recommendedInterventionTargetMode: "current",
        recommendedOperationMode: "reinforce",
        modelId: "gemini-2.5-flash"
      }
    },
    storage
  );

  const sessions = readInterventionSessionStorage(storage);
  assert.deepEqual(sessions["course::module::lesson::micro"], {
    courseKey: "course",
    moduleKey: "module",
    lessonKey: "lesson",
    microsequenceKey: "micro",
    baseVersionId: "v3",
    status: "needs_continue_here",
    title: "Continuação recomendada",
    message: "Abra nova iteração local.",
    feedbackText: "Continue a microssequência atual com mais prática.",
    nextPromptDraft: "Continue a microssequência atual com mais prática.",
    rawFeedbackText: "",
    recommendedActionIntent: "continue_current",
    recommendedInterventionTargetMode: "current",
    recommendedOperationMode: "reinforce",
    recommendedInterventionType: "",
    modelId: "gemini-2.5-flash",
    promptText: "",
    attachmentNames: [],
    continuationNeeded: false,
    continuationMode: "",
    stale: false,
    staleMessage: "",
    createdAt: "",
    updatedAt: ""
  });
});

test("interventionSessionStorage ignora entradas sem microssequência válida", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "aralearn.intervention-sessions.v1",
    JSON.stringify({
      invalida: {
        courseKey: "course",
        moduleKey: "module",
        lessonKey: "lesson",
        microsequenceKey: ""
      }
    })
  );

  assert.deepEqual(readInterventionSessionStorage(storage), {});
});
