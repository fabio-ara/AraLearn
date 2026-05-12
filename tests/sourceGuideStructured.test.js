import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSourceGuideEditorFields,
  buildSourceGuideText,
  buildSourceGuideTextForModel,
  getSourceGuideSchemaPropertiesForModel,
  normalizeSourceGuideStructured,
  resolveSourceGuidePayload,
  sanitizeSourceGuideStructuredForModel,
  SOURCE_GUIDE_LEVELS
} from "../src/sourceGuides/sourceGuideStructured.js";

test("monta campos fixos de edição a partir da fonte-guia estruturada", () => {
  const fields = buildSourceGuideEditorFields(
    {
      lessonGoal: "Comandos básicos.",
      notationRules: "Destacar `cd` e `ls` inline.",
      commonErrors: "Confundir listar com entrar na pasta."
    },
    { level: SOURCE_GUIDE_LEVELS.LESSON }
  );

  assert.equal(fields.length, 3);
  assert.equal(fields[0].name, "lessonGoal");
  assert.equal(fields[0].iconName, "intent");
  assert.equal(fields[0].value, "Comandos básicos.");
  assert.equal(fields[0].type, "textarea");
  assert.equal(fields.find((field) => field.name === "notationRules")?.value, "Destacar `cd` e `ls` inline.");
  assert.equal(fields.find((field) => field.name === "commonErrors")?.value, "Confundir listar com entrar na pasta.");
});

test("resolve payload estruturado e recompila texto legível", () => {
  const payload = resolveSourceGuidePayload(
    {
      lessonGoal: "Ler e executar um comando simples.",
      notationRules: "Destacar `ls` e `cd` inline.",
      commonErrors: "Confundir `ls` com mudança de pasta."
    },
    "",
    { level: SOURCE_GUIDE_LEVELS.LESSON }
  );

  assert.deepEqual(payload.sourceGuideStructured, {
    lessonGoal: "Ler e executar um comando simples.",
    notationRules: "Destacar `ls` e `cd` inline.",
    commonErrors: "Confundir `ls` com mudança de pasta."
  });
  assert.equal(
    payload.sourceGuide,
    buildSourceGuideText(payload.sourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON })
  );
  assert.match(payload.sourceGuide, /Meta da lição: Ler e executar um comando simples\./);
  assert.match(payload.sourceGuide, /Sinais e notação: Destacar `ls` e `cd` inline\./);
  assert.match(payload.sourceGuide, /Confusões prováveis: Confundir `ls` com mudança de pasta\./);
});

test("compacta fonte-guia para contexto de modelo sem freeNotes", () => {
  const structured = sanitizeSourceGuideStructuredForModel(
    {
      lessonGoal: "Ler e executar um comando simples.",
      commonErrors: "Confundir `ls` com mudança de pasta."
    },
    { level: SOURCE_GUIDE_LEVELS.LESSON }
  );

  assert.deepEqual(structured, {
    lessonGoal: "Ler e executar um comando simples.",
    commonErrors: "Confundir `ls` com mudança de pasta."
  });
  assert.equal(
    buildSourceGuideTextForModel(structured, { level: SOURCE_GUIDE_LEVELS.LESSON }),
    "Meta da lição: Ler e executar um comando simples.\nConfusões prováveis: Confundir `ls` com mudança de pasta."
  );
  assert.equal(getSourceGuideSchemaPropertiesForModel(SOURCE_GUIDE_LEVELS.LESSON).freeNotes, undefined);
});

test("não reidrata fonte-guia textual legada sem objeto estruturado", () => {
  const structured = normalizeSourceGuideStructured(undefined, { level: SOURCE_GUIDE_LEVELS.LESSON });

  assert.deepEqual(structured, {});
});
