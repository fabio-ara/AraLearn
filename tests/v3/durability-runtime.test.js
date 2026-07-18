import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const main = read("public/main.js");
const overlay = read("src/ui/RemoteLibraryOverlay.js");
const activity = read("android/app/src/main/java/com/aralearn/app/MainActivity.java");
const index = read("public/index.html");
const staging = read("scripts/stageWebRuntime.mjs");
const server = read("scripts/servePublic.js");

test("runtime torna durabilidade visível e faz flush nos caminhos de saída", () => {
  assert.match(main, /repository\.onDurabilityChange/u);
  assert.match(main, /data-local-durability-retry/u);
  assert.match(main, /await repository\.flush\(\)/u);
  assert.match(main, /visibilitychange/u);
  assert.match(main, /pagehide/u);
  assert.match(main, /handleBackPress\(\)[\s\S]*repository\.flush\(\)/u);
  assert.match(main, /await repository\?\.retryDurability\(\)/u);
  assert.match(activity, /RUNTIME_FLUSH_SCRIPT/u);
  assert.match(activity, /protected void onPause\(\)[\s\S]*evaluateJavascript\(RUNTIME_FLUSH_SCRIPT/u);
});

test("logout fecha sem apagar a réplica física do usuário", () => {
  assert.match(main, /authStore = await IndexedDbRelationalStore\.open\(globalThis\.indexedDB\)/u);
  assert.match(
    main,
    /relationalStore = await IndexedDbRelationalStore\.open\(globalThis\.indexedDB, \{[\s\S]*userId: activeUserId/u
  );
  assert.match(main, /await shutDownAuthenticatedRuntime\(root\)/u);
  assert.doesNotMatch(main, /shutDownAuthenticatedRuntime\(root, \{ deleteReplica:/u);
  assert.match(overlay, /Eles permanecerão associados a esta conta/u);
});

test("overlay usa o conjunto de ícones do AraLearn e mantém ações acessíveis", () => {
  assert.match(overlay, /import \{ renderUiIcon \}/u);
  assert.match(overlay, /button\.title = label/u);
  assert.match(overlay, /button\.setAttribute\("aria-label", label\)/u);
  assert.match(overlay, /button\.innerHTML = iconMarkup/u);
  assert.doesNotMatch(overlay, /<span aria-hidden="true">↻<\/span>\s*Sincronizar/u);
  assert.doesNotMatch(overlay, /<span aria-hidden="true">⇥<\/span>\s*Sair/u);
  assert.match(overlay, /Ela não será reenviada; corrija ou descarte explicitamente/u);
  assert.match(overlay, /Descartar alteração rejeitada/u);
  assert.match(overlay, /discardRejectedMutation\([\s\S]*\{ rollbackLocal: true \}/u);
});

test("CSP de build permite apenas a origem Supabase configurada", () => {
  assert.match(index, /connect-src 'self' __ARALEARN_CONNECT_SRC__/u);
  assert.doesNotMatch(index, /connect-src[^;]*https:\s/u);
  assert.doesNotMatch(index, /http:\/\/localhost:\*/u);
  assert.match(staging, /new URL\(config\.supabaseUrl\)\.origin/u);
  assert.match(staging, /replaceAll\(CSP_CONNECT_SOURCE_PLACEHOLDER, connectSource\)/u);
  assert.match(server, /new URL\(config\.projectUrl\)\.origin/u);
  assert.match(server, /applyDevelopmentContentSecurityPolicy/u);
});
