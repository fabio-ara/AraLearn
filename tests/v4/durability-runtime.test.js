import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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
const panel = read("src/ui/LearningSpacesPanel.js");
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
const explicitCourseOriginMigration = read(
  "supabase/migrations/20260728040000_require_explicit_course_origin.sql"
);
const removeTestLaboratoryMigration = read(
  "supabase/migrations/20260728050000_remove_test_laboratory_course.sql"
);
const trailStateMigration = read(
  "supabase/migrations/20260807220000_trail_personal_state.sql"
);

test("runtime torna a durabilidade local visível e faz flush nos caminhos de saída", () => {
  assert.match(main, /repository\.onDurabilityChange/u);
  assert.match(main, /data-local-durability-retry/u);
  assert.match(main, /data-local-durability-dismiss/u);
  assert.match(main, /state\.status === "pending"[\s\S]*Salvando neste dispositivo[\s\S]*900/u);
  assert.match(main, /state\.status === "error"[\s\S]*Não foi possível salvar\./u);
  assert.match(main, /durabilityDismiss\.addEventListener\("click"[\s\S]*durabilityRoot\.hidden = true/u);
  assert.match(styles, /\.local-durability\[hidden\][\s\S]*display: none/u);
  assert.doesNotMatch(styles, /!important/u);
  assert.match(styles, /\.local-durability[\s\S]*left: 50%[\s\S]*transform: translateX\(-50%\)[\s\S]*width: min\(300px[\s\S]*pointer-events: none/u);
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
  assert.match(main, /Sincronização inicial adiada\./u);
  assert.doesNotMatch(main, /startup-sync-warning|Modo offline: alterações pendentes serão sincronizadas quando a conexão voltar\./u);
  assert.doesNotMatch(serviceWorker, /addEventListener\(["'](?:sync|periodicsync)["']/u);
  assert.match(
    main,
    /result = guaranteeFresh[\s\S]*syncEngine\.synchronizeFresh[\s\S]*syncEngine\.synchronize[\s\S]*synchronizationError = error[\s\S]*synchronizationRequiresFullReplicaRefresh\(result\)[\s\S]*repository\.refreshPersonalStateFromReplica\(\)[\s\S]*if \(synchronizationError\) throw synchronizationError/u
  );
  assert.match(
    main,
    /function synchronizationFailureIsRetryable\(error\)[\s\S]*classifySyncFailure\(error\)\.kind === SYNC_FAILURE_KIND\.RETRYABLE/u
  );
  assert.doesNotMatch(main, /const retryable\s*=\s*[\r\n ]*error instanceof TypeError/u);
  assert.doesNotMatch(main, /const recoverable\s*=\s*[\r\n ]*error instanceof TypeError/u);
});

test("logout preserva o banco físico isolado pelo UUID da conta", () => {
  assert.match(relationalStore, /RELATIONAL_DATABASE_NAME = "aralearn-relational-v4-r3"/u);
  assert.match(relationalStore, /`\$\{RELATIONAL_DATABASE_NAME\}:user:\$\{normalizedUserId\}`/u);
  assert.match(main, /authStore = await IndexedDbRelationalStore\.open\(globalThis\.indexedDB\)/u);
  assert.match(main, /watchLocalConnection\(authStore\)/u);
  assert.match(
    main,
    /relationalStore = await IndexedDbRelationalStore\.open\(globalThis\.indexedDB, \{[\s\S]*userId: activeUserId/u
  );
  assert.match(main, /watchLocalConnection\(relationalStore\)/u);
  assert.match(main, /function reloadAfterLocalConnectionReplacement\(\)[\s\S]*setTimeout\([\s\S]*location\.reload\(\), 250\)/u);
  assert.match(relationalStore, /onConnectionInvalidated\(listener\)/u);
  assert.match(main, /await shutDownAuthenticatedRuntime\(root\)/u);
  assert.doesNotMatch(main, /shutDownAuthenticatedRuntime\(root, \{ deleteReplica:/u);
  assert.match(panel, /beforeSignOut/u);
  assert.match(main, /sem apagar nenhuma réplica/u);
  assert.match(main, /root\.classList\.add\("is-signing-out"\)/u);
});

test("conta pode ser excluída sem expor operação administrativa no cliente", () => {
  assert.match(panel, /data-panel-action="signout"[\s\S]*data-panel-action="delete-account"/u);
  assert.match(panel, /data-panel-action="delete-account" title="Excluir conta" aria-label="Excluir conta"/u);
  assert.match(panel, /await catalog\.deleteOwnAccount\(\)/u);
  assert.match(main, /await clearAraLearnLocalState\(\)/u);
  const deletionSql = between(
    leanMigration,
    "create or replace function public.delete_own_account(p_confirmation text)",
    "comment on function public.select_catalog_course"
  );
  assert.match(deletionSql, /security definer[\s\S]*set search_path=pg_catalog,public,private,auth/u);
  assert.match(deletionSql, /delete from auth\.users/u);
  assert.doesNotMatch(panel, /service.role|service_role|sb_secret_/iu);
  assert.doesNotMatch(remoteCatalog, /service.role|service_role|sb_secret_/iu);
});

test("painel integra Coleções e Chatbot sem duplicar organização nem a tela de estudo", () => {
  assert.match(panel, /import \{ renderUiIcon \}/u);
  assert.match(panel, /node\.title = label/u);
  assert.match(panel, /node\.setAttribute\("aria-label", label\)/u);
  assert.match(panel, /role="tablist"[\s\S]*data-panel-view="collections"[\s\S]*data-panel-view="chatbot"/u);
  assert.doesNotMatch(panel, /data-panel-view="organize"/u);
  assert.match(panel, /title="Fechar painel" aria-label="Fechar painel"/u);
  assert.match(panel, /await spaces\.addCourseToTrails\(courseId\)/u);
  assert.match(panel, /action: "add-course-to-trails"/u);
  assert.doesNotMatch(panel, />\s*(?:Em construção|Em avaliação|Rever|Neste dispositivo|Importar|Exportar)\s*</iu);
  assert.doesNotMatch(main, /repository\.importPrivateCourse|getPrivateCourseImportState/u);
  assert.match(remoteCatalog, /list_trail_items_v1/u);
  assert.match(repository, /courseOrigin: selection\.courseOrigin/u);
  assert.match(explicitCourseOriginMigration, /course_origin text/u);
  assert.match(removeTestLaboratoryMigration, /delete from public\.catalog_collection_courses/u);
  assert.match(styles, /\.remote-library-content[\s\S]*scrollbar-gutter: stable/u);
  assert.match(homeScreen, /Abrir painel/u);
});

test("estados vazios usam uma tipografia compacta única nas superfícies do app", () => {
  assert.match(styles, /\.empty-state-copy,[\s\S]*\.remote-library-status \{[\s\S]*font-family: var\(--font-ui\)[\s\S]*font-size: 0\.78rem[\s\S]*font-weight: 400/u);
  assert.match(panel, /empty-state-copy/u);
  assert.match(homeScreen, /home-course-selector-empty/u);
  assert.match(homeScreen, /Sem cursos neste grupo\./u);
  assert.doesNotMatch(homeScreen, /Nenhum curso materializado em Trilhas\./u);
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

test("bootstrap e feed genérico sincronizam somente seleções leves", () => {
  const bootstrapSql = between(
    trailStateMigration,
    "create or replace function public.bootstrap_replica(p_device_id uuid)",
    "-- O transporte relacional ainda usa este nome"
  );
  assert.match(bootstrapSql, /'courseSelections'/u);
  assert.doesNotMatch(
    bootstrapSql,
    /'lessonProgress'|'cardProgress'|'comments'|'studyPaths'|'studyPathCourses'/u
  );
  assert.match(bootstrapSql, /'selectedCourses'/u);
  assert.match(bootstrapSql, /'highWaterSequence'/u);
  assert.doesNotMatch(bootstrapSql, /get_selected_course_graph|private\.camel_active_rows/u);

  const applySql = between(
    trailStateMigration,
    "create function public.apply_sync_batch(",
    "revoke all on function public.apply_sync_batch(uuid, jsonb)"
  );
  assert.match(applySql, /v_mutation->>'entityType' <> 'courseSelections'/u);
  assert.doesNotMatch(
    applySql,
    /'lessonProgress'|'cardProgress'|'comments'|'studyPaths'|'studyPathCourses'/u
  );
  assert.doesNotMatch(applySql, /baseRevision|base_revision|optimistic revision|status','conflict/iu);
  assert.doesNotMatch(
    mutationService,
    /baseRevision|base_revision|optimistic revision|syncConflict|status:\s*["']conflict/iu
  );
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
