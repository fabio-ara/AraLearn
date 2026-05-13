import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAttachmentPromptSection,
  buildCodexArgs,
  buildLessonMicrosequencesPrompt,
  buildTopDownPrompt,
  extractJsonFromText
} from "../scripts/aralearnCodexBridge.lib.mjs";

test("extractJsonFromText aceita JSON puro", () => {
  assert.deepEqual(extractJsonFromText('{"ok":true}'), { ok: true });
});

test("extractJsonFromText aceita bloco markdown json", () => {
  assert.deepEqual(extractJsonFromText("```json\n{\"ok\":true}\n```"), { ok: true });
});

test("extractJsonFromText aceita JSON embutido em texto", () => {
  assert.deepEqual(extractJsonFromText("Resposta:\n{\"ok\":true}\nFim"), { ok: true });
});

test("buildTopDownPrompt reforça que não deve gerar cards nem microssequências", () => {
  const prompt = buildTopDownPrompt({
    context: {
      courseTitle: "Curso"
    },
    promptText: "Monte a estrutura."
  });

  assert.match(prompt, /Não gere cards\./);
  assert.match(prompt, /Não gere microssequências\./);
});

test("buildLessonMicrosequencesPrompt reforça que não deve gerar cards", () => {
  const prompt = buildLessonMicrosequencesPrompt({
    context: {
      lessonTitle: "Lição"
    },
    promptText: "Gere microssequências."
  });

  assert.match(prompt, /Não gere cards\./);
});

test("buildCodexArgs monta o template default exec {prompt}", () => {
  assert.deepEqual(buildCodexArgs({ argsTemplate: "exec {prompt}", prompt: "teste" }), ["exec", "teste"]);
});

test("buildAttachmentPromptSection inclui conteúdo textual e aviso de truncamento", () => {
  const section = buildAttachmentPromptSection([
    {
      name: "referencia.md",
      type: "text/markdown",
      size: 42,
      textContent: "Conteúdo útil",
      truncated: true
    }
  ]);

  assert.match(section, /referencia\.md/);
  assert.match(section, /Conteúdo útil/);
  assert.match(section, /conteúdo truncado/i);
});
