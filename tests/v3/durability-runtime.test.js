import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const main = read("public/main.js");
const overlay = read("src/ui/RemoteLibraryOverlay.js");
const lessonEditor = read("src/ui/lessonEditorApp.js");
const activity = read("android/app/src/main/java/com/aralearn/app/MainActivity.java");
const index = read("public/index.html");
const staging = read("scripts/stageWebRuntime.mjs");
const server = read("scripts/servePublic.js");
const styles = read("public/styles.css");
const treeOperationsMigration = read("supabase/migrations/20260719044500_bound_personal_course_tree_operations.sql");

test("runtime torna durabilidade visível e faz flush nos caminhos de saída", () => {
  assert.match(main, /repository\.onDurabilityChange/u);
  assert.match(main, /data-local-durability-retry/u);
  assert.match(main, /data-state="saved"[\s\S]*hidden/u);
  assert.match(main, /durabilityRoot\.hidden = state\.status === "saved"/u);
  assert.match(styles, /\.local-durability\[hidden\][\s\S]*display: none !important/u);
  assert.match(styles, /\.local-durability[\s\S]*left: 50%[\s\S]*max-width: min\(410px/u);
  assert.match(main, /await repository\.flush\(\)/u);
  assert.match(main, /visibilitychange/u);
  assert.match(main, /pagehide/u);
  assert.match(main, /handleBackPress\(\)[\s\S]*repository\.flush\(\)/u);
  assert.match(main, /await repository\?\.retryDurability\(\)/u);
  assert.match(activity, /RUNTIME_FLUSH_SCRIPT/u);
  assert.match(activity, /protected void onPause\(\)[\s\S]*evaluateJavascript\(RUNTIME_FLUSH_SCRIPT/u);
});

test("inicialização informa o progresso da materialização local", () => {
  assert.match(main, /function renderStartupLoading\(root\)/u);
  assert.match(main, /data-startup-loading-progress/u);
  assert.match(main, /function updateStartupLoading\(root, \{ percent \} = \{\}\)/u);
  assert.match(main, /renderStartupLoading\(root\);[\s\S]*IndexedDbRelationalStore\.open/u);
  assert.match(main, /onProgress\(progress\)[\s\S]*updateStartupLoading\(root, progress\)/u);
  assert.match(styles, /\.startup-loading-track/u);
  assert.match(styles, /\.startup-loading-percent/u);
  assert.doesNotMatch(main, /Preparando seus cursos/u);
  assert.doesNotMatch(main, /Conferindo a réplica deste dispositivo/u);
  assert.match(main, /function startupFailureMessage\(error\)/u);
  assert.match(main, /Esta cópia não está disponível nesta conta/u);
  assert.match(main, /class="icon-pill" type="button" data-action="reload-page"/u);
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
  assert.doesNotMatch(overlay, /Sincronizar cópia com o Supabase/u);
  assert.doesNotMatch(overlay, /Biblioteca e sincronização/u);
  assert.doesNotMatch(overlay, /data-library-account/u);
  assert.doesNotMatch(overlay, /data-library-close title="Fechar biblioteca"/u);
  assert.doesNotMatch(overlay, /appendStatus\(/u);
  assert.match(overlay, /Remover minha cópia deste curso/u);
  assert.match(overlay, /catalog\.deleteCourse\(button\.dataset\.courseId, baseRevision\)/u);
  assert.match(overlay, /getCourseRevision\?\.\(button\.dataset\.courseId\)/u);
  assert.match(overlay, /O curso oficial continuará publicado no catálogo/u);
  assert.doesNotMatch(overlay, /remote-library-tools|data-library-open/u);
  assert.match(overlay, /const openLibrary = async/u);
  assert.match(overlay, /aralearn:open-library[\s\S]*void openLibrary\(\)/u);
  assert.match(styles, /\.remote-library-panel[\s\S]*width: min\(100%, 430px\)/u);
  assert.match(overlay, /role="tablist"[\s\S]*data-library-view="collections"[\s\S]*data-library-view="paths"/u);
  assert.match(overlay, /data-library-catalog-search[\s\S]*data-library-content/u);
  assert.match(overlay, /const applyActiveView = \(\) =>/u);
  assert.match(styles, /\.remote-library-content[\s\S]*scrollbar-gutter: stable/u);
  assert.match(styles, /\.remote-library-panel \.remote-course-card \.card-title[\s\S]*white-space: nowrap/u);
  assert.match(styles, /\.remote-library-view > \.centered-section-heading-row[\s\S]*display: none/u);
  assert.match(lessonEditor, /O curso oficial continuará publicado no catálogo/u);
  assert.doesNotMatch(lessonEditor, /deste dispositivo e do Supabase/u);
  assert.match(main, /getCourseRevision\(courseId\)[\s\S]*relationalStore\.get\("courses", courseId\)/u);
  assert.match(overlay, /const synchronizeAndReload = async \(options = undefined\) => \{[\s\S]*await beforeRemoteRead\(options\)/u);
  assert.match(overlay, /data-library-progress/u);
  assert.match(overlay, /data-library-progress-log/u);
  assert.match(overlay, /data-library-content[\s\S]*data-library-progress/u);
  assert.match(overlay, /const beginProgress = \(progress\) =>/u);
  assert.match(overlay, /const setProgress = \(\{ percent = 0, message = "" \} = \{\}\)/u);
  assert.match(overlay, /const safePercent = Math\.max\(displayedProgress, requestedPercent\)/u);
  assert.match(overlay, /percent: 5, message: "Criando cópia pessoal…"/u);
  assert.match(overlay, /Há alterações deste dispositivo aguardando sincronização/u);
  assert.match(overlay, /listPendingMutations/u);
  assert.match(overlay, /expectedCourseIds: \[clonedCourseId\],[\s\S]*onProgress: setProgress/u);
  assert.match(styles, /\.remote-library-progress-track/u);
  assert.match(main, /synchronizeReplica = async \(\{ reloadWhenDomainChanges = true, expectedCourseIds = \[\], onProgress = null \} = \{\}\)/u);
  assert.match(main, /syncEngine\.synchronize\(\{ expectedCourseIds, onProgress \}\)/u);
});

test("operações completas de curso não produzem feed redundante por descendente", () => {
  assert.match(treeOperationsMigration, /create or replace function public\.delete_personal_course\([\s\S]*set_config\('aralearn\.suppress_sync_changes', 'on', true\)/u);
  assert.match(treeOperationsMigration, /create or replace function public\.delete_personal_course\([\s\S]*set statement_timeout = '60s'/u);
  assert.match(treeOperationsMigration, /get_personal_course_graph\(uuid\)[\s\S]*statement_timeout = '60s'/u);
  assert.match(treeOperationsMigration, /bootstrap_replica\(uuid\)[\s\S]*statement_timeout = '60s'/u);
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
