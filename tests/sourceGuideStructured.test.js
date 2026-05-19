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
      notationRules: "Destacar `cd` e `ls` inline.; Mostrar prompt",
      outOfScopeRules: "ssh; docker",
      commonErrors: "Confundir listar com entrar na pasta. Misturar arquivo com diretório."
    },
    { level: SOURCE_GUIDE_LEVELS.LESSON }
  );

  assert.equal(fields.length, 4);
  assert.equal(fields[0].name, "lessonGoal");
  assert.equal(fields[0].iconName, "intent");
  assert.equal(fields[0].value, "Comandos básicos.");
  assert.equal(fields[0].type, "textarea");
  assert.equal(fields.find((field) => field.name === "notationRules")?.label, "Incluir");
  assert.equal(fields.find((field) => field.name === "notationRules")?.type, "tokenlist");
  assert.deepEqual(fields.find((field) => field.name === "notationRules")?.value, [
    "Destacar `cd` e `ls` inline.",
    "Mostrar prompt"
  ]);
  assert.equal(fields.find((field) => field.name === "outOfScopeRules")?.label, "Não incluir");
  assert.equal(fields.find((field) => field.name === "outOfScopeRules")?.type, "tokenlist");
  assert.deepEqual(fields.find((field) => field.name === "outOfScopeRules")?.value, ["ssh", "docker"]);
  assert.equal(fields.find((field) => field.name === "commonErrors")?.label, "Não confundir com");
  assert.equal(fields.find((field) => field.name === "commonErrors")?.type, "textarea");
  assert.equal(
    fields.find((field) => field.name === "commonErrors")?.value,
    "Confundir listar com entrar na pasta. Misturar arquivo com diretório."
  );
});

test("resolve payload estruturado e recompila texto legível", () => {
  const payload = resolveSourceGuidePayload(
    {
      lessonGoal: "Ler e executar um comando simples.",
      notationRules: ["Destacar `ls` e `cd` inline.", "Mostrar efeito no diretório atual"],
      outOfScopeRules: ["ssh", "docker"],
      commonErrors: "Confundir `ls` com mudança de pasta. Achar que `cd` lista arquivos."
    },
    "",
    { level: SOURCE_GUIDE_LEVELS.LESSON }
  );

  assert.deepEqual(payload.sourceGuideStructured, {
    lessonGoal: "Ler e executar um comando simples.",
    notationRules: "Destacar `ls` e `cd` inline., Mostrar efeito no diretório atual",
    outOfScopeRules: "ssh, docker",
    commonErrors: "Confundir `ls` com mudança de pasta. Achar que `cd` lista arquivos."
  });
  assert.equal(
    payload.sourceGuide,
    buildSourceGuideText(payload.sourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON })
  );
  assert.match(payload.sourceGuide, /Meta da lição: Ler e executar um comando simples\./);
  assert.match(payload.sourceGuide, /Incluir: Destacar `ls` e `cd` inline\., Mostrar efeito no diretório atual/);
  assert.match(payload.sourceGuide, /Não incluir: ssh, docker/);
  assert.match(payload.sourceGuide, /Não confundir com: Confundir `ls` com mudança de pasta\. Achar que `cd` lista arquivos\./);
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
    "Meta da lição: Ler e executar um comando simples.\nNão confundir com: Confundir `ls` com mudança de pasta."
  );
  assert.equal(getSourceGuideSchemaPropertiesForModel(SOURCE_GUIDE_LEVELS.LESSON).freeNotes, undefined);
});

test("não reidrata fonte-guia textual anterior sem objeto estruturado", () => {
  const structured = normalizeSourceGuideStructured(undefined, { level: SOURCE_GUIDE_LEVELS.LESSON });

  assert.deepEqual(structured, {});
});
