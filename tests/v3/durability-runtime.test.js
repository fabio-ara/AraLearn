import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { libraryErrorMessage } from "../../src/ui/RemoteLibraryOverlay.js";

function read(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Trecho inicial ausente: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Trecho final ausente: ${end}`);
  return source.slice(startIndex, endIndex);
}

const main = read("public/main.js");
const overlay = read("src/ui/RemoteLibraryOverlay.js");
const homeScreen = read("src/ui/renderHomeScreen.js");
const lessonScreen = read("src/ui/renderLessonScreen.js");
const activity = read("android/app/src/main/java/com/aralearn/app/MainActivity.java");
const index = read("public/index.html");
const staging = read("scripts/stageWebRuntime.mjs");
const server = read("scripts/servePublic.js");
const styles = read("public/styles.css");
const serviceWorker = read("public/service-worker.js");
const relationalStore = read("src/persistence/IndexedDbRelationalStore.js");
const repository = read("src/persistence/RelationalProjectRepository.js");
const mutationService = read("src/persistence/DomainMutationService.js");
const syncEngine = read("src/sync/RelationalSyncEngine.js");
const remoteCatalog = read("src/supabase/RemoteCourseCatalog.js");
const leanMigration = read("supabase/migrations/20260720010000_shared_catalog_lean_cutover.sql");
const artifactMigration = read(
  "supabase/migrations/20260728010000_storage_artifact_control_plane.sql"
);

test("runtime torna a durabilidade local visível e faz flush nos caminhos de saída", () => {
  assert.match(main, /repository\.onDurabilityChange/u);
  assert.match(main, /data-local-durability-retry/u);
  assert.match(main, /data-local-durability-dismiss/u);
  assert.match(main, /state\.status === "pending"[\s\S]*Salvando neste dispositivo[\s\S]*900/u);
  assert.match(main, /state\.status === "error"[\s\S]*Não foi possível salvar\./u);
  assert.match(main, /durabilityDismiss\.addEventListener\("click"[\s\S]*durabilityRoot\.hidden = true/u);
  assert.match(styles, /\.local-durability\[hidden\][\s\S]*display: none !important/u);
  assert.match(styles, /\.local-durability[\s\S]*max-width: min\(300px[\s\S]*pointer-events: none/u);
  assert.match(styles, /\.local-durability\[data-state="pending"\][\s\S]*width: 38px/u);
  assert.match(main, /await repository\.flush\(\)/u);
  assert.match(main, /visibilitychange/u);
  assert.match(main, /pagehide/u);
  assert.match(main, /handleBackPress\(\)[\s\S]*repository\.flush\(\)/u);
  assert.match(main, /await repository\?\.retryDurability\(\)/u);
  assert.match(activity, /RUNTIME_FLUSH_SCRIPT/u);
  assert.match(activity, /protected void onPause\(\)[\s\S]*evaluateJavascript\(RUNTIME_FLUSH_SCRIPT/u);
});

test("inicialização ocupa a tela, explicita etapas e mantém recuperação local", () => {
  assert.match(main, /function renderStartupLoading\(root\)/u);
  assert.match(main, /data-startup-loading-progress/u);
  assert.match(main, /startup-loading-steps/u);
  assert.match(main, /aria-label="Dispositivo"[\s\S]*aria-label="Conta"[\s\S]*aria-label="Cursos"/u);
  assert.match(main, /function updateStartupLoading\(root, \{ percent, message = "" \} = \{\}\)/u);
  assert.match(main, /step\.dataset\.state = state/u);
  assert.match(main, /renderStartupLoading\(root\);[\s\S]*IndexedDbRelationalStore\.open/u);
  assert.match(main, /onProgress\(progress\)[\s\S]*updateStartupLoading\(root, progress\)/u);
  assert.match(styles, /\.startup-loading-track/u);
  assert.match(styles, /\.startup-loading-percent/u);
  assert.match(styles, /\.startup-loading-card[\s\S]*min-height: 100dvh/u);
  assert.match(styles, /\.auth-card[\s\S]*min-height: 100dvh/u);
  assert.doesNotMatch(main, /Preparando seus cursos|Conferindo a réplica deste dispositivo/u);
  assert.match(main, /return "Não foi possível abrir seus cursos neste dispositivo\."/u);
  assert.match(main, /class="icon-pill" type="button" data-action="reload-page"[\s\S]*title="Tentar novamente" aria-label="Tentar novamente"/u);
  assert.match(main, /data-action="reset-aralearn-local-state"[\s\S]*title="Limpar dados deste dispositivo" aria-label="Limpar dados deste dispositivo"/u);
});

test("sincronização é automática e oportunista sem atividade remota em segundo plano", () => {
  assert.match(main, /const AUTOMATIC_SYNC_INTERVAL_MS = 60_000/u);
  assert.match(main, /const AUTOMATIC_SYNC_AFTER_CHANGE_MS = 800/u);
  assert.match(main, /onLocalCommit: scheduleAutomaticSync/u);
  assert.match(main, /document\.visibilityState !== "hidden"[\s\S]*navigator\?\.onLine !== false/u);
  assert.match(main, /visibilitychange[\s\S]*document\.visibilityState === "hidden"[\s\S]*clearTimeout\(automaticSyncTimer\)[\s\S]*bestEffortFlush/u);
  assert.match(main, /signal\.addEventListener\("abort"[\s\S]*clearTimeout\(automaticSyncTimer\)/u);
  assert.match(main, /addEventListener\("online"[\s\S]*scheduleAutomaticSync\(100\)/u);
  assert.match(main, /addEventListener\("offline"[\s\S]*clearTimeout\(automaticSyncTimer\)/u);
  assert.match(main, /A inicialização continuará com a réplica offline/u);
  assert.match(main, /Modo offline: alterações pendentes serão sincronizadas quando a conexão voltar/u);
  assert.doesNotMatch(serviceWorker, /addEventListener\(["'](?:sync|periodicsync)["']/u);
  assert.match(
    main,
    /result = await syncEngine\.synchronize[\s\S]*synchronizationError = error[\s\S]*repository\.refreshFromReplica\(\)[\s\S]*if \(synchronizationError\) throw synchronizationError/u
  );
  assert.match(
    main,
    /function synchronizationFailureIsRetryable\(error\)[\s\S]*classifySyncFailure\(error\)\.kind === SYNC_FAILURE_KIND\.RETRYABLE/u
  );
  assert.doesNotMatch(main, /const retryable\s*=\s*[\r\n ]*error instanceof TypeError/u);
  assert.doesNotMatch(main, /const recoverable\s*=\s*[\r\n ]*error instanceof TypeError/u);
});

test("logout preserva o banco físico isolado pelo UUID da conta", () => {
  assert.match(relationalStore, /RELATIONAL_DATABASE_NAME = "aralearn-relational-v2"/u);
  assert.match(relationalStore, /`\$\{RELATIONAL_DATABASE_NAME\}:user:\$\{normalizedUserId\}`/u);
  assert.match(main, /authStore = await IndexedDbRelationalStore\.open\(globalThis\.indexedDB\)/u);
  assert.match(
    main,
    /relationalStore = await IndexedDbRelationalStore\.open\(globalThis\.indexedDB, \{[\s\S]*userId: activeUserId/u
  );
  assert.match(main, /await shutDownAuthenticatedRuntime\(root\)/u);
  assert.doesNotMatch(main, /shutDownAuthenticatedRuntime\(root, \{ deleteReplica:/u);
  assert.match(overlay, /permanecerão associados a esta conta/u);
  assert.match(main, /sem apagar nenhuma réplica/u);
  assert.match(main, /root\.classList\.add\("is-signing-out"\)/u);
});

test("conta pode ser excluída sem expor operação administrativa no cliente", () => {
  assert.match(overlay, /data-library-signout[\s\S]*data-library-delete-account/u);
  assert.match(overlay, /class="icon-ghost is-danger" type="button" data-library-delete-account title="Excluir conta" aria-label="Excluir conta"/u);
  assert.match(overlay, /data-account-confirm-action title="Excluir conta definitivamente" aria-label="Excluir conta definitivamente"/u);
  assert.match(overlay, /await catalog\.deleteOwnAccount\(\)/u);
  assert.match(main, /await clearAraLearnLocalState\(\)/u);
  const deletionSql = between(
    leanMigration,
    "create or replace function public.delete_own_account(p_confirmation text)",
    "comment on function public.select_catalog_course"
  );
  assert.match(deletionSql, /security definer[\s\S]*set search_path=pg_catalog,public,private,auth/u);
  assert.match(deletionSql, /delete from auth\.users/u);
  assert.doesNotMatch(overlay, /service.role|service_role|sb_secret_/iu);
  assert.doesNotMatch(remoteCatalog, /service.role|service_role|sb_secret_/iu);
});

test("overlay usa ícones acessíveis e opera seleção leve sobre o catálogo compartilhado", () => {
  assert.match(overlay, /import \{ renderUiIcon \}/u);
  assert.match(overlay, /button\.title = label/u);
  assert.match(overlay, /button\.setAttribute\("aria-label", label\)/u);
  assert.match(overlay, /button\.innerHTML = iconMarkup/u);
  assert.match(overlay, /role="tablist"[\s\S]*data-library-view="collections"[\s\S]*data-library-view="paths"/u);
  assert.match(overlay, /class="icon-ghost remote-library-close"[\s\S]*title="Fechar biblioteca" aria-label="Fechar biblioteca"/u);
  assert.match(overlay, /data-library-catalog-search[\s\S]*data-library-content/u);
  assert.match(overlay, /await catalog\.selectCourse\(button\.dataset\.courseId\)/u);
  assert.match(overlay, /await catalog\.unselectCourse\(button\.dataset\.courseId\)/u);
  assert.match(overlay, /O catálogo não será alterado/u);
  assert.match(overlay, /course_origin[\s\S]*classList\.add\(`is-\$\{origin\}`\)/u);
  assert.match(styles, /\.remote-study-path-course-row\.is-catalog[\s\S]*#cfe8c7/u);
  assert.match(styles, /\.remote-study-path-course-row\.is-private[\s\S]*#ffb3b3/u);
  assert.match(remoteCatalog, /select_catalog_course/u);
  assert.match(remoteCatalog, /unselect_catalog_course/u);
  assert.match(remoteCatalog, /aralearn-course-revisions/u);
  assert.doesNotMatch(remoteCatalog, /get_selected_course_graph|downloadSelectedCourseGraph/u);
  assert.doesNotMatch(remoteCatalog, /clone_catalog_course|refresh_personal_course_from_source/u);
  assert.doesNotMatch(overlay, /Clonar|Criando cópia pessoal|Sincronizar cópia com o Supabase|membership|conflito de revisão/iu);
  assert.match(overlay, /expectedCourseIds: \[selectedCourseId\],[\s\S]*onProgress: setProgress/u);
  assert.match(overlay, /data-library-content[\s\S]*data-library-progress[\s\S]*remote-library-footer/u);
  assert.match(overlay, /data-library-progress-log/u);
  assert.match(overlay, /data-library-sync[\s\S]*data-library-import="catalog"[\s\S]*data-library-import="private"/u);
  assert.match(overlay, /catalogImport[\s\S]*current_user_capabilities|catalogImport[\s\S]*getCurrentUserCapabilities/u);
  assert.match(overlay, /title="Importar curso para o catálogo" aria-label="Importar curso para o catálogo"/u);
  assert.match(overlay, /title="Importar curso privado" aria-label="Importar curso privado"/u);
  assert.match(overlay, /aria-label="Progresso da operação na biblioteca"/u);
  assert.match(overlay, /capabilities = Object\.freeze\(\{[\s\S]*privateImport: true,[\s\S]*catalogImport: false,[\s\S]*catalogPromotion: false[\s\S]*\}\);[\s\S]*getCurrentUserCapabilities/u);
  assert.doesNotMatch(overlay, /getCurrentUserCapabilities\(\)\.catch\(\(\) => capabilities\)/u);
  assert.match(overlay, /remoteReadStatus\(remoteError\)/u);
  assert.match(main, /repository\.importPrivateCourse\(nextProject,[\s\S]*getPrivateCourseImportState\(staged\.importId\)/u);
  assert.match(styles, /\.remote-library-primary-actions[\s\S]*display: flex[\s\S]*align-items: center/u);
  assert.match(styles, /\.remote-library-content[\s\S]*scrollbar-gutter: stable/u);
  assert.match(styles, /--library-control-size: 30px/u);
  assert.match(styles, /\.remote-library-tab-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 34px/u);
  assert.match(styles, /button\.icon-ghost,[\s\S]*button\.icon-pill,[\s\S]*\)\[title\]\[aria-label\][\s\S]*display: inline-grid;[\s\S]*place-items: center/u);
  assert.match(homeScreen, /Abrir biblioteca e sincronização/u);
});

test("biblioteca traduz falhas técnicas para mensagens curtas", () => {
  assert.equal(
    libraryErrorMessage(new Error("Seleção não autorizada.")),
    "O curso não está mais nos seus cursos."
  );
  assert.equal(
    libraryErrorMessage(new Error("canceling statement due to statement timeout")),
    "A operação demorou mais que o esperado. Tente novamente."
  );
});

test("estados vazios usam uma tipografia compacta única nas superfícies do app", () => {
  assert.match(styles, /\.empty-state-copy,[\s\S]*\.remote-library-status \{[\s\S]*font-family: var\(--font-ui\)[\s\S]*font-size: 0\.78rem[\s\S]*font-weight: 400/u);
  assert.match(overlay, /remote-library-empty empty-state-copy/u);
  assert.match(homeScreen, /empty-state-copy home-study-path-empty/u);
  assert.match(homeScreen, /<p class="empty-state-copy">Nenhum curso\.<\/p>/u);
  assert.match(lessonScreen, /<p class="empty-state-copy">Sem módulos\.<\/p>/u);
  assert.match(lessonScreen, /<p class="empty-state-copy">Sem lições\.<\/p>/u);
  assert.match(lessonScreen, /<p class="empty-state-copy">Sem microssequências\.<\/p>/u);
});

test("corte por revisão preserva somente seleção e remove o download da árvore remota", () => {
  assert.match(leanMigration, /drop function if exists public\.clone_catalog_course/u);
  assert.match(leanMigration, /drop table if exists public\.course_memberships cascade/u);
  assert.match(leanMigration, /create table public\.user_course_selections/u);

  const selectionSql = between(
    leanMigration,
    "create or replace function public.select_catalog_course(",
    "create or replace function public.unselect_catalog_course("
  );
  assert.match(selectionSql, /insert into public\.user_course_selections/u);
  assert.doesNotMatch(selectionSql, /insert into public\.courses|insert into public\.modules|insert into public\.cards/u);

  assert.match(
    artifactMigration,
    /drop function if exists public\.get_selected_course_graph\(uuid\) cascade/iu
  );
});

test("bootstrap é leve e o feed sincroniza apenas estado pessoal por last-write-wins", () => {
  const bootstrapSql = between(
    leanMigration,
    "create or replace function public.bootstrap_replica(p_device_id uuid)",
    "create or replace function public.pull_sync_changes("
  );
  assert.match(bootstrapSql, /'courseSelections'/u);
  assert.match(bootstrapSql, /'lessonProgress'/u);
  assert.match(bootstrapSql, /'cardProgress'/u);
  assert.match(bootstrapSql, /'comments'/u);
  assert.match(bootstrapSql, /'studyPaths'/u);
  assert.match(bootstrapSql, /'studyPathCourses'/u);
  assert.match(bootstrapSql, /'selectedCourses'/u);
  assert.match(bootstrapSql, /'highWaterSequence'/u);
  assert.doesNotMatch(bootstrapSql, /get_selected_course_graph|private\.camel_active_rows/u);

  const applySql = between(
    leanMigration,
    "create or replace function public.apply_sync_batch(p_device_id uuid, p_mutations jsonb)",
    "create or replace function private.official_import_store_names()"
  );
  assert.match(applySql, /lessonProgress','cardProgress','comments','studyPaths','studyPathCourses/u);
  assert.doesNotMatch(applySql, /baseRevision|base_revision|optimistic revision|status','conflict/iu);
  assert.doesNotMatch(mutationService, /baseRevision|base_revision|conflict|revision/u);
  assert.doesNotMatch(syncEngine, /baseRevision|base_revision|SYNC_FAILURE_KIND\.CONFLICT/u);
  assert.doesNotMatch(relationalStore, /memberships|syncConflicts|conflicts|baseRevision/u);
  assert.doesNotMatch(repository, /membership|baseRevision|conflict/iu);
});

test("cache local baixa a revisão ausente por hash e a projeta no IndexedDB", () => {
  assert.match(relationalStore, /"courseSelections"/u);
  assert.match(relationalStore, /publicationSeq/u);
  assert.match(relationalStore, /contentHash/u);
  assert.match(syncEngine, /reconcileSelectedCourseReplicas/u);
  assert.match(syncEngine, /downloadCourseRevision/u);
  assert.match(syncEngine, /canonicalRevisionHash/u);
  assert.match(syncEngine, /validateProjectDocument/u);
  assert.match(syncEngine, /hasRemoteHash[\s\S]*sameHash[\s\S]*!hasRemoteHash && samePublication/u);
  assert.match(syncEngine, /expectedCourseIds/u);
  assert.match(syncEngine, /async pull\(\)[\s\S]*applyRemotePage/u);
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
