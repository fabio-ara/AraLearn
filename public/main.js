import { createBrowserLocalStorageStore } from "../src/storage/createBrowserLocalStorageStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createEditorSession } from "../src/editor/contractEditor.js";
import { createLessonEditorApp } from "../src/ui/lessonEditorApp.js";
import { createEmbeddedSeedProjectDocument } from "../src/ui/embeddedSeedProjectDocument.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clearAraLearnLocalState(storage = globalThis.localStorage) {
  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") {
    return;
  }
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (text(key).startsWith("aralearn.")) {
      keys.push(key);
    }
  }
  keys.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
      // Mantém a tela de recuperação mesmo se uma chave específica não puder ser removida.
    }
  });
}

function renderStartupFailure(root, error) {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <section style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f4efe7;color:#1f2937;font-family:Georgia,serif;">
      <div style="max-width:720px;width:100%;background:#fffdf8;border:1px solid #d6c9b4;border-radius:18px;padding:28px;box-shadow:0 18px 40px rgba(66,44,12,0.12);">
        <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a6a3f;">Falha de inicialização</p>
        <h1 style="margin:0 0 12px 0;font-size:28px;line-height:1.2;">O app não conseguiu abrir o estado local.</h1>
        <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">O projeto salvo no navegador ou alguma configuração local pode ter ficado incompatível. Você pode limpar apenas os dados locais do AraLearn e recarregar a página.</p>
        <pre style="margin:0 0 20px 0;white-space:pre-wrap;word-break:break-word;background:#f7f1e7;border-radius:12px;padding:14px;font-size:13px;line-height:1.5;color:#6b4f2a;">${message}</pre>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button type="button" data-action="reset-aralearn-local-state" style="border:0;border-radius:999px;padding:12px 18px;background:#1f2937;color:#fffdf8;font-size:14px;cursor:pointer;">Limpar estado local do AraLearn</button>
          <button type="button" data-action="reload-page" style="border:1px solid #c8b79c;border-radius:999px;padding:12px 18px;background:#fffdf8;color:#1f2937;font-size:14px;cursor:pointer;">Tentar novamente</button>
        </div>
      </div>
    </section>
  `;
  root.querySelector('[data-action="reload-page"]')?.addEventListener("click", () => {
    globalThis.location.reload();
  });
  root.querySelector('[data-action="reset-aralearn-local-state"]')?.addEventListener("click", () => {
    clearAraLearnLocalState(globalThis.localStorage);
    globalThis.location.reload();
  });
}

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("Elemento raiz não encontrado.");
}

try {
  const kvStore = createBrowserLocalStorageStore(globalThis.localStorage);
  const storage = createProjectStorage(kvStore);
  const editor = createEditorSession(storage);
  let project = null;
  try {
    project = storage.loadProject();
  } catch (error) {
    console.warn("Falha ao carregar projeto persistido. Reiniciando vazio.", error);
  }

  if (!project || !Array.isArray(project.courses) || project.courses.length === 0) {
    project = createEmbeddedSeedProjectDocument();
    storage.saveProject(project);
  }

  if (!project) {
    project = createEmbeddedSeedProjectDocument();
    storage.saveProject(project);
  }

  createLessonEditorApp({
    root,
    storage,
    editor
  });
} catch (error) {
  console.error("Falha fatal ao iniciar a UI do AraLearn.", error);
  renderStartupFailure(root, error);
}
