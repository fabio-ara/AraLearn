import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");
const [main, device, styles] = await Promise.all([
  read("../../public/main.js"),
  read("../../src/ui/StudyDeviceSettings.js"),
  read("../../public/styles.css")
]);
const deviceStyles = styles.slice(
  styles.indexOf(".study-device-settings,"),
  styles.indexOf(".course-source-file-access > summary", styles.indexOf(".study-device-settings,"))
);
const deviceStatusStyles = styles.slice(styles.indexOf(".study-device-settings :is([data-study-sync-message]"));

test("D001/P005/O002: Configurações autenticada distingue autoria e assistente", () => {
  assert.match(main, /\["authoring", "edit", "Preferências de autoria"\]/u);
  assert.match(main, /\["assistant", "sparkles", "Conectar assistente"\]/u);
  assert.doesNotMatch(main, /\["authoring", "intent"/u);
  assert.doesNotMatch(main, /\["assistant", "intent"/u);
});

test("D001/O035/O036: ações de conta e dispositivo são nomeadas, icon-only e sinalizam perda", () => {
  const actions = [
    ["data-settings-signout", "Sair desta conta"],
    ["data-settings-signout-clear", "Sair e remover dados deste dispositivo"],
    ["data-settings-delete-account", "Excluir conta"],
    ["data-settings-clear-device", "Remover dados deste dispositivo"],
    ["data-maintenance-retention", "Executar retenção corrente"],
    ["data-profile-avatar-choose", "Escolher foto"],
    ["data-profile-avatar-remove", "Remover foto"]
  ];
  for (const [selector, label] of actions) {
    const tag = main.match(new RegExp(`<button[^>]*${selector}[^>]*>[^<]*\\$\\{renderUiIcon[\\s\\S]*?<\\/button>`, "u"))?.[0] || "";
    assert.match(tag, new RegExp(`title="${label}"`, "u"), `${selector} perdeu title.`);
    assert.match(tag, new RegExp(`aria-label="${label}"`, "u"), `${selector} perdeu aria-label.`);
    assert.doesNotMatch(tag, /<span[ >]/u, `${selector} voltou a expor texto visível.`);
  }
  for (const selector of ["data-settings-signout-clear", "data-settings-delete-account", "data-settings-clear-device"]) {
    assert.match(main, new RegExp(`<button[^>]*class="[^"]*is-danger[^"]*"[^>]*${selector}`, "u"),
      `${selector} precisa indicar risco de perda.`);
  }
});

test("D001/O035: ações do dispositivo sem conta mantêm rótulos e usam ícones do sistema", () => {
  for (const [selector, label, icon] of [
    ["data-study-adoption-preview", "Examinar progresso sem conta", "preview"],
    ["data-study-adoption-form", "Acrescentar os cursos selecionados à minha conta", "account-add"]
  ]) {
    const expression = selector === "data-study-adoption-form"
      ? new RegExp(`data-study-adoption-form[\\s\\S]*?title="${label}"[\\s\\S]*?renderUiIcon\\("${icon}"`, "u")
      : new RegExp(`${selector}[\\s\\S]*?title="${label}"[\\s\\S]*?renderUiIcon\\("${icon}"`, "u");
    assert.match(device, expression, `${selector} precisa manter nome e ícone.`);
  }
  assert.match(device, /<h2 id="study-sync-title">Sincronização<\/h2>/u);
  assert.match(device, /<label for="study-sync-mode">Estudo neste dispositivo<\/label>/u);
  assert.match(device, /<summary>Como sincroniza<\/summary>/u);
  assert.match(device, /<summary>Progresso sem conta<\/summary>/u);
});

test("O038: a correção de espaçamento usa conteúdo transitório real e não altura fictícia", () => {
  assert.doesNotMatch(deviceStyles, /height:\s*64px/u,
    "StudyDeviceSettings não deve reservar um estado vazio fixo de 64px.");
  assert.match(deviceStatusStyles, /margin-block: var\(--space-copy\)/u);
  assert.match(deviceStatusStyles, /\[data-study-adoption-message\]\):empty\s*\{\s*margin:\s*0;\s*\}/u);
});

test("H007: StudyDeviceSettings só expõe status quando a operação realmente produz mensagem", () => {
  assert.match(device, /modeMessage\.textContent = ""/u);
  assert.match(device, /message\.textContent = ""/u);
  assert.match(device, /Não foi possível salvar a preferência neste dispositivo\./u);
  assert.match(device, /Não foi possível examinar o progresso sem conta\./u);
});
