import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "espree";

const execute = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mainPath = path.join(repositoryRoot, "public", "main.js");
const stylesPath = path.join(repositoryRoot, "public", "styles.css");
const courseAuthoringStylesPath = path.join(repositoryRoot, "public", "course-authoring.css");
const oauthConsentPath = path.join(repositoryRoot, "src", "ui", "OAuthAuthorizationConsent.js");
const sourceRoot = path.join(repositoryRoot, "src");
const pagesRoot = path.join(repositoryRoot, ".pages");

function moduleSpecifiers(source) {
  const tree = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const result = [];
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) &&
      typeof node.source?.value === "string"
    ) {
      result.push(node.source.value);
    } else if (node.type === "ImportExpression" && typeof node.source?.value === "string") {
      result.push(node.source.value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === "object") pending.push(value);
    }
  }
  return [...new Set(result)];
}

async function importGraph(entryPath) {
  const pending = [entryPath];
  const graph = new Map();
  while (pending.length) {
    const filePath = path.resolve(pending.pop());
    if (graph.has(filePath)) continue;
    const source = await readFile(filePath, "utf8");
    graph.set(filePath, source);
    for (const specifier of moduleSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const dependency = path.resolve(path.dirname(filePath), specifier);
      assert.equal(
        dependency === mainPath || dependency.startsWith(`${sourceRoot}${path.sep}`),
        true,
        `Import fora do runtime permitido: ${specifier}`
      );
      pending.push(dependency);
    }
  }
  return graph;
}

function normalizedRelative(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

const forbiddenModule = /(?:lessonEditorApp|HomeTrailsController|homeTrailProjection|contextualAuthoringSync|integratedCourseSync|relationalSchema|RelationalProjectRepository|TrailPersonalStateRepository)/u;
const forbiddenRuntimeSymbol = /\b(?:courseKey|workspaceId|trailItemId|homeTrails|accessLevel|LearningSpaces|moduleKey|lessonKey|microsequenceKey|cardKey|completedCardKeys|completedCardIds|cursorCardId|editorProgress)\b/u;
const forbiddenPublishedSurface = /(?:remote-(?:library|workspace)|learning-spaces|authoring-workspace|workspace-authoring|home-trails|aralearn:open-library|\b(?:Workspace|Trilhas?|Coleções?)\b)/iu;
const forbiddenStudyUnitSemanticPath = /(?:cardEnvelope|renderPackageCard|renderCardCommentOverlay)\.js$/u;
const forbiddenStudyUnitSemanticSource = new RegExp([
  "aralearn\\.library\\.v1",
  "(?:\\.|\\?\\.)cards\\b",
  "\\bcards\\s*:",
  "\\bentityType\\s*[:=]\\s*[\"']card[\"']",
  "\\b(?:cardId|cardIds|cardIndex|cardCount|cardJson|cardResponse)\\b",
  "\\b(?:validateCard(?:Envelope|Relations|EntityContent)?|normalizeCardEnvelope|renderCardEnvelope|cloneCardEnvelope|prepareCardForSemantics)\\b",
  "\\b(?:renderPackageCard\\w*|getPackageCard\\w*|readPackageCardText|packageCardOptions|resetCardInteraction|stepCard|renderCardCommentOverlay)\\b",
  "(?:renderUiIcon\\(|detailIcon\\s*:)\\s*[\"']card[\"']",
  "data-(?:card-(?:id|index|authoring-focus|answer-dock)|field=[\"']card-comment)",
  "toggle-card-assistance-resource"
].join("|"), "u");

function studyUnitSemanticResidue(source) {
  return source.match(forbiddenStudyUnitSemanticSource)?.[0] || "";
}

test("o scanner semântico distingue contrato de Unidade de estudo de classes visuais genéricas", () => {
  for (const source of [
    "microsequence.cards",
    "const value = { cards: [] };",
    'const row = { entityType: "card" };',
    "const cardId = input.cardId;",
    "validateCardEntityContent(entityType, entity);",
    'renderUiIcon("card");',
    'button.dataset.action = "toggle-card-assistance-resource";',
    'const contract = "aralearn.library.v1";'
  ]) {
    assert.notEqual(studyUnitSemanticResidue(source), "", source);
  }
  for (const source of [
    '<article class="clean-card card-title runtime-card-sheet resource-test-card"></article>',
    'const selector = ".card-sheet-content";',
    'const cardinality = reference.cardinality;'
  ]) {
    assert.equal(studyUnitSemanticResidue(source), "", source);
  }
});

test("o grafo e o artefato web contêm somente o runtime canônico de Cursos", async () => {
  const graph = await importGraph(mainPath);
  const mainSource = graph.get(mainPath);
  assert.match(mainSource, /class="account-settings-overlay"/u);
  assert.match(
    mainSource,
    /id="aralearn-authoring-root" class="course-authoring-root" hidden/u,
    "O host estável da Autoria deve controlar a rolagem da superfície."
  );
  assert.doesNotMatch(mainSource, forbiddenPublishedSurface);
  for (const visibleAccountContract of [
    "data-profile-form",
    "data-profile-avatar-file",
    "controller.uploadAvatar",
    "controller.updatePersonProfile",
    "data-settings-clear-device",
    "data-settings-signout-clear",
    "data-settings-delete-account",
    "controller.deleteMyAccount"
  ]) {
    assert.match(
      mainSource,
      new RegExp(visibleAccountContract.replace(".", "\\."), "u"),
      `A operação de conta ${visibleAccountContract} não possui consumo humano visível.`
    );
  }
  assert.match(
    mainSource,
    /data-settings-open-view="account"[\s\S]*?>Dados e conta<[\s\S]*?data-settings-view="account" hidden/u,
    "Dados e conta deve abrir uma subvisão sem expandir a folha principal."
  );
  assert.match(
    mainSource,
    /data-settings-signout\][\s\S]*?Sair desta conta\?[\s\S]*?Alterações ainda abertas e não salvas serão perdidas[\s\S]*?quiesceAraLearnAuthenticatedInteractions\(\)[\s\S]*?repository\?\.flush\(\)[\s\S]*?authClient\.signOut\(\)/u,
    "A saída comum precisa confirmar a perda do estado que existe somente em memória."
  );
  assert.match(
    mainSource,
    /data-settings-clear-device[\s\S]*?Remover dados deste dispositivo[\s\S]*?data-settings-signout-clear[\s\S]*?Sair e remover dados deste dispositivo/u,
    "A conta deve oferecer limpeza local independente e limpeza junto da saída."
  );
  assert.match(
    mainSource,
    /data-settings-open-view="account"[\s\S]*?data-settings-view="account" hidden/u,
    "Os controles de dados locais precisam de um nome de seção acessível."
  );
  assert.match(
    mainSource,
    /button class="account-profile-avatar-target"[^>]+data-settings-open-view="photo"[\s\S]*?data-settings-view="photo" hidden[\s\S]*?data-profile-avatar-choose[\s\S]*?data-profile-avatar-remove hidden/u,
    "A foto deve abrir subvisão própria e esconder Remover quando não há imagem."
  );
  assert.match(
    mainSource,
    /data-profile-avatar-remove[\s\S]*?if \(selectedFile\)[\s\S]*?selectedFile = null[\s\S]*?profileFile\.value = ""[\s\S]*?loadProfile\(\{ force: true \}\)[\s\S]*?Foto não salva retirada/u,
    "Remover uma substituição ainda não salva deve restaurar a foto corrente e limpar o arquivo escolhido."
  );
  assert.match(
    mainSource,
    /data-settings-delete-account[\s\S]*?promptValue\([\s\S]*?Esta ação é irreversível/u,
    "A ação destrutiva precisa explicar o alcance no momento da decisão."
  );
  assert.match(
    mainSource,
    /data-settings-clear-device[\s\S]*?rascunhos ou edições pendentes serão perdidos[\s\S]*?clearAraLearnLocalState\(\{ removeSession: false \}\)/u,
    "A limpeza independente precisa confirmar a perda local e preservar a sessão."
  );
  assert.match(
    mainSource,
    /async function clearAraLearnLocalState[\s\S]*?repository\.close\(\{ flush: false \}\)[\s\S]*?CourseLocalStore\.deleteDatabase[\s\S]*?if \(removeSession\) await AuthSessionStore\.deleteDatabase/u,
    "A limpeza local precisa desconectar sem envio remoto, apagar somente a conta ativa e preservar opcionalmente a sessão."
  );
  assert.match(
    mainSource,
    /data-settings-signout-clear[\s\S]*?rascunhos ou edições pendentes serão perdidos[\s\S]*?removeLocalDataOnShutdown = true[\s\S]*?quiesceAraLearnAuthenticatedInteractions\(\)[\s\S]*?authClient\.signOut\(\)/u,
    "A saída com limpeza deve escolher o mesmo encerramento antes de emitir SIGNED_OUT."
  );
  assert.match(
    mainSource,
    /if \(removeLocalDataOnShutdown\) await clearAraLearnLocalState\(\);[\s\S]*?else await closeAraLearnLocalConnections\(\);/u,
    "SIGNED_OUT deve possuir uma única cadeia de encerramento para preservar ou remover dados locais."
  );
  const accountDeletionHandler = mainSource.match(
    /\[data-settings-delete-account\][\s\S]*?\[data-settings-close\]/u
  )?.[0] || "";
  assert.match(
    accountDeletionHandler,
    /irreversível: exclui sua conta, Cursos próprios, cópias pessoais e PDFs enviados[\s\S]*?quiesceAraLearnAuthenticatedInteractions\(\)[\s\S]*?controller\.deleteMyAccount\(\{ confirmation \}\)[\s\S]*?clearAraLearnLocalState\(\)/u,
    "A exclusão da conta deve limpar o dispositivo somente depois da confirmação remota."
  );
  assert.match(
    mainSource,
    /function renderDeletedAccountCleanupFailure[\s\S]*?Sua conta foi excluída\.[\s\S]*?data-account-cleanup-retry[\s\S]*?clearAraLearnLocalState\(\)/u,
    "Falha local posterior não pode reclassificar como falha uma conta já excluída no servidor."
  );
  assert.match(
    accountDeletionHandler,
    /controller\.deleteMyAccount\(\{ confirmation \}\)[\s\S]*?catch \(error\)[\s\S]*?return;[\s\S]*?Conta excluída\. Removendo dados deste dispositivo[\s\S]*?onDeletedAccountCleanupFailure/u,
    "O commit remoto e a limpeza local precisam possuir estados de falha separados."
  );
  assert.match(
    accountDeletionHandler,
    /error\?\.code === "account_deletion_in_progress"[\s\S]*?onQuiescedFailure\(\{[\s\S]*?Alguns arquivos podem ter sido removidos[\s\S]*?pode já ter sido excluída ou ainda aguardar a etapa final[\s\S]*?actionLabel: "Confirmar ou concluir a exclusão"[\s\S]*?controller\.deleteMyAccount\(\{ confirmation \}\)[\s\S]*?clearAraLearnLocalState\(\)/u,
    "Uma falha posterior à limpeza de Storage precisa entrar em recuperação sem fingir que nada foi removido."
  );
  assert.match(
    mainSource,
    /function renderQuiescedOperationRecovery[\s\S]*?data-quiesced-recovery-reload[\s\S]*?globalThis\.location\.reload\(\)/u,
    "Uma operação que já destruiu a superfície precisa oferecer recarga terminal."
  );
  for (const quiescedFailureContract of [
    /data-settings-clear-device[\s\S]*?clearAraLearnLocalState\(\{ removeSession: false \}\)[\s\S]*?catch \(error\)[\s\S]*?onQuiescedFailure/u,
    /data-settings-signout-clear[\s\S]*?authClient\.signOut\(\)[\s\S]*?catch \(error\)[\s\S]*?onQuiescedFailure/u,
    /data-settings-signout\][\s\S]*?repository\?\.flush\(\)[\s\S]*?authClient\.signOut\(\)[\s\S]*?catch \(error\)[\s\S]*?onQuiescedFailure/u
  ]) {
    assert.match(
      mainSource,
      quiescedFailureContract,
      "Falha posterior à quiescência não pode devolver uma aplicação destruída como se estivesse ativa."
    );
  }
  assert.doesNotMatch(
    accountDeletionHandler,
    /repository\?\.flush/u,
    "A exclusão da conta não deve enviar pendências locais imediatamente antes de apagá-las."
  );
  assert.match(
    mainSource,
    /account-settings-sheet[\s\S]*?role="dialog"[\s\S]*?tabindex="-1"[\s\S]*?const restoreSettingsFocus[\s\S]*?currentOpener\?\.focus[\s\S]*?overlay\.addEventListener\("keydown"[\s\S]*?event\.key === "Escape"[\s\S]*?event\.key !== "Tab"/u,
    "Configurações precisa conter o foco, fechar por Esc e devolver o foco ao acionador."
  );
  assert.match(
    mainSource,
    /authClient\.getSession\?\.\(\)\?\.user\?\.app_metadata\?\.aralearn_role === "administrator"[\s\S]*?loadMaintenance\(\)/u,
    "Abrir Configurações só deve consultar a manutenção para uma sessão administradora."
  );
  assert.match(
    mainSource,
    /let pendingAvatarCleanupObjectKey = null[\s\S]*?const retryPendingAvatarCleanup[\s\S]*?controller\.deleteOwnAvatar\(objectKey\)[\s\S]*?if \(!await retryPendingAvatarCleanup\(\)\)[\s\S]*?antes de outro envio/u,
    "Um avatar sem vínculo precisa bloquear outro envio até uma tentativa explícita de limpeza."
  );
  assert.match(
    mainSource,
    /const confirmedProfile = await loadProfile\(\{ force: true \}\)[\s\S]*?confirmedProfile\?\.avatarObjectKey === uploadedObjectKey[\s\S]*?Perfil salvo; a confirmação anterior foi recuperada[\s\S]*?if \(!confirmedProfile\)[\s\S]*?pendingAvatarResolution = \{[\s\S]*?O objeto foi preservado[\s\S]*?controller\.deleteOwnAvatar\(uploadedObjectKey\)/u,
    "Uma resposta perdida precisa reler o perfil e só apagar o upload quando a ausência do vínculo foi confirmada."
  );
  assert.match(
    mainSource,
    /const resolvePendingAvatarUpload[\s\S]*?loadProfile\(\{ force: true \}\)[\s\S]*?confirmedProfile\.avatarObjectKey === pending\.objectKey[\s\S]*?pendingAvatarCleanupObjectKey = pending\.objectKey[\s\S]*?if \(!await resolvePendingAvatarUpload\(\)\) return/u,
    "Um upload ambíguo precisa ser reconciliado antes de qualquer novo envio."
  );
  for (const continuityContract of [
    "await editorApp?.replaceProject(nextProject)",
    "authoringSurface?.opened",
    "authoringSurface.refresh()"
  ]) {
    assert.match(
      mainSource,
      new RegExp(continuityContract.replace(/[?.()]/gu, "\\$&"), "u"),
      `A continuidade entre chat, Autoria e Estudo perdeu ${continuityContract}.`
    );
  }
  assert.equal(
    (mainSource.match(/refreshVisibleApplication\(\)/gu) || []).length >= 2,
    true,
    "Retorno ao aplicativo e reconexão devem atualizar a superfície que está visível."
  );
  assert.match(
    mainSource,
    /visibilitychange[\s\S]*?document\.visibilityState === "hidden"[\s\S]*?else scheduleVisibleApplicationRefresh\(\)/u,
    "Retornar ao aplicativo deve buscar alterações pessoais remotas."
  );
  assert.match(
    mainSource,
    /function quiesceAraLearnAuthenticatedInteractions\(\)[\s\S]*?cleanupApplication\?\.\(\);[\s\S]*?lifecycleAbortController\?\.abort\(\);[\s\S]*?courseProviderSession\?\.destroy\?\.\(\);[\s\S]*?async function closeAraLearnLocalConnections\(\)[\s\S]*?quiesceAraLearnAuthenticatedInteractions\(\);[\s\S]*?if \(pendingCompositionCleanup\) await pendingCompositionCleanup\(\);[\s\S]*?courseLocalStore\?\.close\(\)/u,
    "Logout deve purgar snapshots autorais confirmados antes de fechar o IndexedDB."
  );
  assert.match(
    mainSource,
    /const cleanupApplication = \(\) => \{[\s\S]*?authoringSurface\?\.destroy\?\.\(\);[\s\S]*?editorApp\?\.destroy\?\.\(\);[\s\S]*?authenticatedApplicationCleanup = cleanupApplication/u,
    "Logout deve destruir Autoria e Estudo antes da sessão efêmera e dos stores."
  );
  assert.match(
    mainSource,
    /\["SIGNED_OUT_REMOTE", "SESSION_INVALID", "SIGNED_OUT"\][\s\S]*?shutDownAuthenticatedRuntime\(root\)/u,
    "Logout local ou remoto deve usar o mesmo encerramento autenticado."
  );
  assert.match(
    mainSource,
    /pendingCompositionCleanup = \(\) =>[\s\S]*?authoringController\.clearPendingCourseCompositions\(\)/u,
    "O lifecycle autenticado deve usar a limpeza explícita do Controller."
  );
  assert.match(
    mainSource,
    /addEventListener\("focus", scheduleVisibleApplicationRefresh/u,
    "Voltar à janela lado a lado deve buscar alterações pessoais remotas."
  );
  assert.match(
    mainSource,
    /const scheduleVisibleApplicationRefresh[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?refreshVisibleApplication\(\)/u,
    "A atualização de retorno deve ser agrupada sem perder a releitura da área visível."
  );
  assert.match(
    mainSource,
    /addEventListener\("online"[\s\S]*?void refreshVisibleApplication\(\)/u,
    "A reconexão deve buscar alterações pessoais remotas."
  );
  assert.match(
    mainSource,
    /value\.createsPersonalCopy === true[\s\S]*?repository\.commitPersonalCourseCopyEdit/u,
    "A primeira edição do estudante deve usar a operação atômica de cópia pessoal."
  );
  assert.match(
    mainSource,
    /refreshStudy[\s\S]*?resumePendingManualEdit[\s\S]*?refreshCourses/u,
    "A reconexão deve confirmar a cópia pessoal pendente antes da atualização comum."
  );
  assert.match(
    mainSource,
    /data-study-source-return[\s\S]*?getAttribute\("href"\)[\s\S]*?refreshStudy\(\)[\s\S]*?finally\([\s\S]*?restoreOriginFocus/u,
    "Voltar da Fonte deve reencontrar e focar a origem mesmo depois de atualizar o Estudo."
  );
  assert.match(
    mainSource,
    /createCourseStudyApplication[\s\S]*?await editorApp\.resumePendingManualEdit/u,
    "A inicialização deve recuperar uma edição pessoal persistida antes de seguir."
  );
  assert.match(
    mainSource,
    /addEventListener\("offline"[\s\S]*?editorApp\?\.setOfflineStatus\?\.\(true\)/u,
    "A perda de conexão deve atualizar o aviso do Estudo sem iniciar uma leitura remota."
  );
  const offlineListener = mainSource.match(
    /addEventListener\("offline"[\s\S]*?\}, \{ signal: lifecycleAbortController\.signal \}\);/u
  )?.[0] || "";
  assert.doesNotMatch(offlineListener, /refreshVisibleApplication|refreshStudy/u);
  const relativeModules = [...graph.keys()].map(normalizedRelative);
  for (const required of [
    "src/persistence/AuthSessionStore.js",
    "src/persistence/CourseLocalStore.js",
    "src/study/CourseStudyApplication.js",
    "src/study/CourseStudyRepository.js",
    "src/supabase/CourseApiClient.js",
    "src/supabase/CourseController.js"
  ]) {
    assert.equal(relativeModules.includes(required), true, `${required} ausente do grafo.`);
  }
  for (const relativePath of relativeModules) {
    assert.doesNotMatch(relativePath, forbiddenModule, `${relativePath} pertence ao runtime substituído.`);
    assert.doesNotMatch(
      relativePath,
      forbiddenStudyUnitSemanticPath,
      `${relativePath} conserva arquivo semântico substituído de Unidade de estudo.`
    );
  }
  for (const [filePath, source] of graph) {
    assert.doesNotMatch(
      source,
      forbiddenRuntimeSymbol,
      `${normalizedRelative(filePath)} conserva identidade ou recipiente substituído.`
    );
    assert.equal(
      studyUnitSemanticResidue(source),
      "",
      `${normalizedRelative(filePath)} conserva símbolo semântico substituído de Unidade de estudo.`
    );
  }
  for (const filePath of [stylesPath, courseAuthoringStylesPath, oauthConsentPath]) {
    const source = await readFile(filePath, "utf8");
    assert.doesNotMatch(
      source,
      forbiddenPublishedSurface,
      `${normalizedRelative(filePath)} conserva uma superfície ou cópia do produto substituído.`
    );
    if (filePath === stylesPath) {
      assert.match(
        source,
        /\.account-device-data-actions button \{[\s\S]*?min-height: var\(--tap\);/u,
        "As ações de dados locais precisam preservar o alvo tátil mínimo."
      );
      assert.match(
        source,
        /button\.account-settings-back\[hidden\] \{[\s\S]*?display: none;/u,
        "Voltar não pode aparecer na vista principal da Conta."
      );
      assert.match(
        source,
        /\.account-profile-photo-actions button\[hidden\] \{[\s\S]*?display: none;/u,
        "Remover foto não pode aparecer quando não existe foto corrente ou escolhida."
      );
    }
  }

  await execute(process.execPath, [
    path.join(repositoryRoot, "scripts", "stageWebRuntime.mjs"),
    "--target", "pages",
    "--output", pagesRoot
  ], { cwd: repositoryRoot });
  const manifest = JSON.parse(await readFile(path.join(pagesRoot, "asset-manifest.json"), "utf8"));
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  assert.equal(assets.some((asset) => forbiddenModule.test(asset)), false);
  assert.equal(
    assets.some((asset) => asset.startsWith("./docs/downloads/authoring/")),
    false,
    "Pacotes de Action/Workspace retirados não podem ser publicados como runtime."
  );

  const expectedSourceAssets = relativeModules
    .filter((relativePath) => relativePath.startsWith("src/"))
    .map((relativePath) => `./${relativePath}`)
    .sort();
  const stagedSourceAssets = assets.filter((asset) => asset.startsWith("./src/")).sort();
  assert.deepEqual(stagedSourceAssets, expectedSourceAssets);
  for (const asset of stagedSourceAssets) {
    const source = await readFile(path.join(pagesRoot, asset.slice(2)), "utf8");
    assert.doesNotMatch(source, forbiddenRuntimeSymbol, `${asset} conserva símbolo substituído.`);
    assert.equal(
      studyUnitSemanticResidue(source),
      "",
      `${asset} conserva símbolo semântico substituído de Unidade de estudo.`
    );
  }
  for (const asset of ["./styles.css", "./course-authoring.css", "./src/ui/OAuthAuthorizationConsent.js"]) {
    assert.equal(assets.includes(asset), true, `${asset} ausente do artefato web.`);
    const source = await readFile(path.join(pagesRoot, asset.slice(2)), "utf8");
    assert.doesNotMatch(
      source,
      forbiddenPublishedSurface,
      `${asset} conserva uma superfície ou cópia do produto substituído.`
    );
  }
});
