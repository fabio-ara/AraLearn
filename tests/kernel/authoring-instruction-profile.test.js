import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTHORING_CALIBRATION_VERSION,
  AUTHORING_PREFERENCE_DEFINITIONS,
  PROTECTED_AUTHORING_CORE_MODULES,
  authoringProfileDiff,
  composeAuthoringPreferences,
  createDefaultAuthoringProfile,
  normalizeAuthoringProfile,
  serializeAuthoringProfile,
  validateAuthoringProfile
} from "../../src/authoring/instructionProfile.js";
import * as edgeProfile from "../../supabase/functions/_shared/aralearn/runtime/authoring/instructionProfile.js";

test("preset oferece quatro preferências sem tornar o núcleo editável", () => {
  const profile = createDefaultAuthoringProfile();
  assert.equal(profile.version, AUTHORING_CALIBRATION_VERSION);
  assert.equal(AUTHORING_PREFERENCE_DEFINITIONS.length, 4);
  assert.equal(PROTECTED_AUTHORING_CORE_MODULES.every((module) => module.protected), true);
  assert.deepEqual(Object.keys(profile.preferences), AUTHORING_PREFERENCE_DEFINITIONS.map(({ id }) => id));
  assert.deepEqual(authoringProfileDiff(profile), []);
  assert.equal(validateAuthoringProfile(profile).valid, true);
});

test("perfil personaliza detalhes e explicita a precedência protegida", () => {
  const profile = createDefaultAuthoringProfile();
  profile.preferences["examples-and-context"] = "Use exemplos de uma rede doméstica antes do cenário corporativo.";
  assert.deepEqual(authoringProfileDiff(profile), ["examples-and-context"]);
  const composed = composeAuthoringPreferences(profile);
  assert.match(composed, /núcleo pedagógico protegido > conhecimento protegido > preferências pessoais/iu);
  assert.match(composed, /rede doméstica/iu);
  const serialized = serializeAuthoringProfile(profile);
  assert.deepEqual(normalizeAuthoringProfile(JSON.parse(serialized)), profile);
});

test("perfil inválido não apaga o preset e não aceita módulos arbitrários", () => {
  const profile = createDefaultAuthoringProfile();
  profile.preferences["tone-and-approach"] = "";
  assert.equal(validateAuthoringProfile(profile).valid, false);
  const normalized = normalizeAuthoringProfile({
    version: AUTHORING_CALIBRATION_VERSION,
    preferences: { arbitrary: "não deve entrar" }
  });
  assert.equal(Object.hasOwn(normalized.preferences, "arbitrary"), false);
  assert.equal(validateAuthoringProfile(normalized).valid, true);
});

test("browser e Edge compartilham versão, preset e composição", () => {
  const profile = createDefaultAuthoringProfile();
  assert.equal(edgeProfile.AUTHORING_CALIBRATION_VERSION, AUTHORING_CALIBRATION_VERSION);
  assert.deepEqual(edgeProfile.createDefaultAuthoringProfile(), profile);
  assert.equal(edgeProfile.composeAuthoringPreferences(profile), composeAuthoringPreferences(profile));
});
