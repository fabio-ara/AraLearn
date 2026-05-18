import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAttachmentPromptSection,
  buildCodexArgs,
  buildCodexFilePromptWrapper,
  buildCodexSpawnInput,
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

test("buildTopDownPrompt reforça estrutura com microssequências planejadas sem cards", () => {
  const prompt = buildTopDownPrompt({
    context: {
      courseTitle: "Curso"
    },
    promptText: "Monte a estrutura."
  });

  assert.match(prompt, /Não gere cards\./);
  assert.match(prompt, /Gere curso, módulos, lições e microssequências planejadas\./);
  assert.match(prompt, /"microsequences"/);
  assert.doesNotMatch(prompt, /Não gere microssequências\./);
});

test("buildCodexArgs mantém compatibilidade com template explícito em argv", () => {
  assert.deepEqual(buildCodexArgs({ argsTemplate: "exec {prompt}", prompt: "teste" }), ["exec", "teste"]);
});

test("buildCodexSpawnInput usa stdin por padrão para evitar estouro de argv", () => {
  assert.deepEqual(buildCodexSpawnInput({ argsTemplate: "", prompt: "teste" }), {
    args: ["exec", "-"],
    stdinText: "teste"
  });
});

test("buildCodexFilePromptWrapper reduz o prompt a uma instrução curta apontando para arquivo", () => {
  const wrapper = buildCodexFilePromptWrapper("C:\\temp\\prompt.md");
  assert.match(wrapper, /Leia integralmente o arquivo/);
  assert.match(wrapper, /prompt\.md/);
  assert.match(wrapper, /Responda somente com o JSON final/);
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
