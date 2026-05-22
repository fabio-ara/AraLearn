import test from "node:test";
import assert from "node:assert/strict";

import { readAssistConfigStorage, writeAssistConfigStorage } from "../src/ui/assistConfigStorage.js";
import { DEFAULT_ENGINE_PROFILE_ID } from "../src/generation/config/engineProfileRegistry.js";
import { createProfileTuning } from "../src/generation/runtime/profileTuning.js";

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

test("assistConfigStorage lê config mínima e injeta defaults do Codex local", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "aralearn.assist-config",
    JSON.stringify({
      model: "gemini-2.5-flash",
      apiKey: "abc"
    })
  );

  assert.deepEqual(readAssistConfigStorage(storage), {
    model: "gemini-2.5-flash",
    apiKey: "abc",
    baseUrl: "",
    apiBaseUrl: "",
    selectedProfileId: DEFAULT_ENGINE_PROFILE_ID,
    didacticProfileId: DEFAULT_ENGINE_PROFILE_ID,
    profileTuning: createProfileTuning(DEFAULT_ENGINE_PROFILE_ID),
    customProfiles: [],
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: ""
  });
});

test("assistConfigStorage grava e lê endpoint/token do Codex local", () => {
  const storage = createMemoryStorage();

  writeAssistConfigStorage(
    {
      model: "codex-cli-local",
      apiKey: "",
      baseUrl: "https://api.deepseek.com",
      apiBaseUrl: "https://api.deepseek.com",
      selectedProfileId: "aralearn.engine.ads.systems.v1",
      didacticProfileId: "aralearn.engine.ads.systems.v1",
      profileTuning: createProfileTuning("aralearn.engine.ads.systems.v1", {
        targetStudentProfile: "estudante operacional"
      }),
      customProfiles: [],
      codexEndpoint: "http://127.0.0.1:4183/assist",
      codexToken: "segredo"
    },
    storage
  );

  assert.deepEqual(readAssistConfigStorage(storage), {
    model: "codex-cli-local",
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    apiBaseUrl: "https://api.deepseek.com",
    selectedProfileId: "aralearn.engine.ads.systems.v1",
    didacticProfileId: "aralearn.engine.ads.systems.v1",
    profileTuning: createProfileTuning("aralearn.engine.ads.systems.v1", {
      targetStudentProfile: "estudante operacional"
    }),
    customProfiles: [],
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: "segredo"
  });
});

test("assistConfigStorage tolera storage ausente, JSON inválido e valores ausentes", () => {
  assert.deepEqual(readAssistConfigStorage(null), {
    model: "gemini-2.5-flash",
    apiKey: "",
    baseUrl: "",
    apiBaseUrl: "",
    selectedProfileId: DEFAULT_ENGINE_PROFILE_ID,
    didacticProfileId: DEFAULT_ENGINE_PROFILE_ID,
    profileTuning: createProfileTuning(DEFAULT_ENGINE_PROFILE_ID),
    customProfiles: [],
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: ""
  });
  assert.deepEqual(readAssistConfigStorage({ getItem: () => "{" }), {
    model: "gemini-2.5-flash",
    apiKey: "",
    baseUrl: "",
    apiBaseUrl: "",
    selectedProfileId: DEFAULT_ENGINE_PROFILE_ID,
    didacticProfileId: DEFAULT_ENGINE_PROFILE_ID,
    profileTuning: createProfileTuning(DEFAULT_ENGINE_PROFILE_ID),
    customProfiles: [],
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: ""
  });
});

test("assistConfigStorage reidrata defaults semânticos do perfil quando o courseModel anterior estava vazio", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "aralearn.assist-config",
    JSON.stringify({
      model: "gemini-2.5-flash",
      didacticProfileId: "aralearn.engine.ads.math.v1",
      profileTuning: {
        courseModel: {
          description: "",
          learningTrail: "",
          microsequenceProgression: ""
        }
      }
    })
  );

  const config = readAssistConfigStorage(storage);
  assert.equal(config.profileTuning.courseModel.learningTrail, "formalization");
  assert.equal(config.profileTuning.courseModel.microsequenceProgression, "concrete_visual_formal");
  assert.equal(config.profileTuning.courseModel.primaryRepresentation, "formula");
  assert.equal(config.profileTuning.courseModel.secondaryRepresentation, "matrix");
  assert.equal(config.profileTuning.courseModel.primaryDifficulty, "notation");
  assert.equal(config.profileTuning.courseModelEdited, false);
});

test("assistConfigStorage reidrata perfil derivado do usuário sem mutar o seed base", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "aralearn.assist-config",
    JSON.stringify({
      selectedProfileId: "assist.custom.demo",
      didacticProfileId: "aralearn.engine.ads.programming.v1",
      profileTuning: {
        targetStudentProfile: "rascunho temporário"
      },
      customProfiles: [
        {
          id: "assist.custom.demo",
          label: "Meu perfil procedural",
          baseProfileId: "aralearn.engine.ads.programming.v1",
          profileTuning: {
            targetStudentProfile: "estudante que precisa de passos curtos",
            minMicrosequences: 4
          }
        }
      ]
    })
  );

  const config = readAssistConfigStorage(storage);
  assert.equal(config.selectedProfileId, "assist.custom.demo");
  assert.equal(config.didacticProfileId, "aralearn.engine.ads.programming.v1");
  assert.equal(config.profileTuning.targetStudentProfile, "rascunho temporário");
  assert.equal(config.customProfiles[0].label, "Meu perfil procedural");
  assert.equal(config.customProfiles[0].profileTuning.minMicrosequences, 4);
});
