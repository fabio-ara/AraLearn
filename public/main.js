import {
  createBrowserIndexedDbStore,
  deleteBrowserIndexedDbDatabase
} from "../src/storage/createBrowserIndexedDbStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createEditorSession } from "../src/editor/contractEditor.js";
import { createLessonEditorApp } from "../src/ui/lessonEditorApp.js";
import { loadEmbeddedSeedProjectDocument } from "../src/ui/embeddedSeedProjectDocument.js";

let localStore = null;

async function clearAraLearnLocalState(storage = localStore) {
  if (storage) {
    try {
      await storage.clear();
      await storage.flush();
    } catch {
      // O banco inteiro será removido abaixo; não há estado a preservar nesta ação.
    } finally {
      try {
        await storage.close();
      } catch {
        // A conexão é fechada pelo próprio store mesmo quando o flush falha.
      }
      localStore = null;
    }
  }
  await deleteBrowserIndexedDbDatabase(globalThis.indexedDB);
}

function renderStartupFailure(root, error) {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <section style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f4efe7;color:#1f2937;font-family:Georgia,serif;">
      <div style="max-width:720px;width:100%;background:#fffdf8;border:1px solid #d6c9b4;border-radius:18px;padding:28px;box-shadow:0 18px 40px rgba(66,44,12,0.12);">
        <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a6a3f;">Falha de inicialização</p>
        <h1 style="margin:0 0 12px 0;font-size:28px;line-height:1.2;">O app não conseguiu abrir o estado local.</h1>
        <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">Os cursos do usuário, o progresso ou os comentários salvos no navegador não puderam ser lidos. Você pode limpar apenas os dados locais do AraLearn e recarregar a página.</p>
        <pre data-startup-error-details style="margin:0 0 20px 0;white-space:pre-wrap;word-break:break-word;background:#f7f1e7;border-radius:12px;padding:14px;font-size:13px;line-height:1.5;color:#6b4f2a;"></pre>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button type="button" data-action="reset-aralearn-local-state" style="border:0;border-radius:999px;padding:12px 18px;background:#1f2937;color:#fffdf8;font-size:14px;cursor:pointer;">Limpar estado local do AraLearn</button>
          <button type="button" data-action="reload-page" style="border:1px solid #c8b79c;border-radius:999px;padding:12px 18px;background:#fffdf8;color:#1f2937;font-size:14px;cursor:pointer;">Tentar novamente</button>
        </div>
      </div>
    </section>
  `;
  root.querySelector("[data-startup-error-details]").textContent = message;
  root.querySelector('[data-action="reload-page"]')?.addEventListener("click", () => {
    globalThis.location.reload();
  });
  root.querySelector('[data-action="reset-aralearn-local-state"]')?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await clearAraLearnLocalState();
      globalThis.location.reload();
    } catch (clearError) {
      renderStartupFailure(root, clearError);
    }
  });
}

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("Elemento raiz não encontrado.");
}

try {
  const kvStore = await createBrowserIndexedDbStore(globalThis.indexedDB, {
    onError(error) {
      console.error("Falha de persistência no IndexedDB.", error);
    }
  });
  localStore = kvStore;
  const embeddedProject = await loadEmbeddedSeedProjectDocument();
  const storage = createProjectStorage(kvStore, undefined, embeddedProject);
  const editor = createEditorSession(storage);
  const project = storage.loadProject();

  createLessonEditorApp({
    root,
    storage,
    localStore: kvStore,
    editor,
    initialProject: project
  });
} catch (error) {
  console.error("Falha fatal ao iniciar a UI do AraLearn.", error);
  renderStartupFailure(root, error);
}
