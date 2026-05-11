import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSourceGuideEditorFields,
  buildSourceGuideText,
  resolveSourceGuidePayload,
  SOURCE_GUIDE_LEVELS
} from "../src/sourceGuides/sourceGuideStructured.js";

test("monta campos fixos de edição a partir da fonte-guia estruturada", () => {
  const fields = buildSourceGuideEditorFields(
    "",
    {
      moduleScope: "Comandos básicos.",
      lessonProgression: "Começar por navegação e depois arquivos."
    },
    { level: SOURCE_GUIDE_LEVELS.MODULE }
  );

  assert.equal(fields.length, 5);
  assert.equal(fields[0].name, "moduleScope");
  assert.equal(fields[0].iconName, "intent");
  assert.equal(fields[0].value, "Comandos básicos.");
  assert.equal(fields.find((field) => field.name === "lessonProgression")?.value, "Começar por navegação e depois arquivos.");
});

test("resolve payload estruturado e recompila texto legível", () => {
  const payload = resolveSourceGuidePayload(
    {
      lessonGoal: "Ler e executar um comando simples.",
      notationRules: "Destacar `ls` e `cd` inline.",
      masteryGoal: "Executar sozinho um caso básico."
    },
    "",
    { level: SOURCE_GUIDE_LEVELS.LESSON }
  );

  assert.deepEqual(payload.sourceGuideStructured, {
    lessonGoal: "Ler e executar um comando simples.",
    notationRules: "Destacar `ls` e `cd` inline.",
    masteryGoal: "Executar sozinho um caso básico."
  });
  assert.equal(
    payload.sourceGuide,
    buildSourceGuideText(payload.sourceGuideStructured, "", { level: SOURCE_GUIDE_LEVELS.LESSON })
  );
  assert.match(payload.sourceGuide, /Meta da lição: Ler e executar um comando simples\./);
  assert.match(payload.sourceGuide, /Sinais e notação: Destacar `ls` e `cd` inline\./);
  assert.match(payload.sourceGuide, /Ao final: Executar sozinho um caso básico\./);
});
