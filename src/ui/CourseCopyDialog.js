import { createCourseCopyRequestIdentity, normalizeCourseCopyRequest } from "../domain/courseCopy.js";
import { publicErrorMessage } from "./publicErrorMessage.js";

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function createCourseCopyDialog({ root, controller, onCopied }) {
  const documentValue = root?.ownerDocument;
  if (!documentValue || typeof controller?.copyCourse !== "function" || typeof onCopied !== "function") {
    throw new TypeError("Diálogo de cópia inválido.");
  }
  const dialog = documentValue.createElement("dialog");
  dialog.className = "course-authoring-confirm-dialog course-copy-dialog";
  dialog.setAttribute("aria-labelledby", "course-copy-title");
  dialog.setAttribute("aria-describedby", "course-copy-description");
  root.append(dialog);
  let epoch = 0;
  let opener = null;
  let state = {};
  const render = () => {
    const ready = state.source || state.pending;
    dialog.innerHTML = '<h2 id="course-copy-title">Copiar curso</h2>' +
      '<form data-course-copy-form><div class="course-copy-body">' +
      '<p id="course-copy-description">Cópia privada e independente do conteúdo, mapa, parâmetros e arquivos. ' +
      'Sem acessos, progresso ou observações.</p>' +
      '<div class="course-copy-field">' +
        '<label for="course-copy-name">Título da cópia</label>' +
        `<input id="course-copy-name" name="title" maxlength="300" required autocomplete="off"` +
        ` value="${escapeHtml(state.title)}"${!ready || state.pending || state.busy ? " disabled" : ""}></div>` +
        '<div class="course-copy-feedback" aria-live="polite">' +
        (state.loading ? '<p role="status">Conferindo o curso…</p>' : "") +
        (state.failure ? `<p role="alert">${escapeHtml(state.failure)}</p>` : "") +
        (state.pending ? '<p>Repetir confirma a mesma cópia.</p>' : "") +
        '</div></div>' +
        '<div class="course-authoring-confirm-actions">' +
        `<button type="button" data-copy-close${state.busy ? " disabled" : ""}>Cancelar</button>` +
        (ready ? `<button type="submit" class="is-primary"${state.busy ? " disabled" : ""}>` +
        `${state.busy ? "Confirmando…" : state.pending ? "Repetir pedido" : "Criar cópia"}</button></div></form>` :
        `<button type="button" data-copy-reload${state.loading ? " disabled" : ""}>Conferir novamente</button></div></form>`);
  };
  const close = () => {
    if (state.busy) return;
    epoch += 1;
    dialog.close();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  const open = async sourceCourseId => {
    if (state.busy) return;
    const current = ++epoch;
    if (!dialog.open) opener = documentValue.activeElement;
    state = { sourceCourseId, loading: true, busy: false, failure: "", source: null, pending: null, title: "" };
    render();
    if (!dialog.open) dialog.showModal();
    try {
      const pending = await controller.loadPendingCourseCopy(sourceCourseId);
      if (epoch !== current) return;
      if (pending) {
        state.pending = pending;
        state.title = pending.title;
      } else {
        const source = await controller.loadCourseCopySource(sourceCourseId);
        if (epoch !== current) return;
        if (source?.courseId !== sourceCourseId || source.canCopy !== true ||
            source.offline === true || source.stale === true || !Number.isSafeInteger(source.revision)) {
          throw new TypeError("Este curso não está autorizado para cópia. Acesso de leitura não concede essa permissão.");
        }
        state.source = source;
        state.title = [...`${source.title} — cópia`].slice(0, 300).join("");
      }
    } catch (error) {
      if (epoch === current) state.failure = publicErrorMessage(error, "Não foi possível conferir a permissão para copiar.");
    } finally {
      if (epoch === current) {
        state.loading = false; render();
        (dialog.querySelector("input:not(:disabled)") || dialog.querySelector("button"))?.focus();
      }
    }
  };
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("click", event => {
    if (event.target.closest("[data-copy-close]")) close();
    if (event.target.closest("[data-copy-reload]")) void open(state.sourceCourseId);
  });
  dialog.addEventListener("input", event => {
    if (event.target.name === "title") state.title = event.target.value;
  });
  dialog.addEventListener("submit", event => {
    event.preventDefault();
    if (state.busy || state.loading || !state.source && !state.pending) return;
    let request;
    try {
      request = state.pending || normalizeCourseCopyRequest({
        sourceCourseId: state.sourceCourseId, expectedSourceRevision: state.source.revision,
        title: state.title, confirmed: true, ...createCourseCopyRequestIdentity()
      });
    } catch (error) { state.failure = publicErrorMessage(error, "Revise o título da cópia."); render(); return; }
    state.busy = true; state.failure = ""; render();
    void controller.copyCourse(request).then(result => {
      state.busy = false;
      close();
      onCopied(result.course);
    }, async error => {
      state.failure = publicErrorMessage(error, "Não foi possível confirmar a cópia. Repita o mesmo pedido.");
      // The controller clears only a definitive rejection. An uncertain response
      // retains its original identity across this dialog and application reloads.
      try { state.pending = await controller.loadPendingCourseCopy(request.sourceCourseId); }
      catch { state.pending = request; }
      if (!state.pending) state.source = null;
      state.busy = false; render();
      dialog.querySelector("button[type=submit]")?.focus();
    });
  });
  return { open, close, destroy() { epoch += 1; dialog.remove(); } };
}
