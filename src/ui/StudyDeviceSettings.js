import { publicErrorMessage } from "./publicErrorMessage.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function quantity(value, singular, plural) {
  const count = Number(value) || 0;
  return `${count} ${count === 1 ? singular : plural}`;
}

export function mountStudyDeviceSettings(root, {
  preference,
  getIdentity,
  previewVisitorState,
  adoptVisitorState,
  onAdopted = () => {}
}) {
  let destroyed = false;
  let preview = null;
  let destination = null;
  let busy = false;
  root.innerHTML = `<section class="study-device-settings" aria-labelledby="study-sync-title">
    <h2 id="study-sync-title">Sincronização</h2>
    <label for="study-sync-mode">Estudo neste dispositivo</label>
    <select id="study-sync-mode" data-study-sync-mode>
      <option value="automatic">Automática</option><option value="manual">Manual</option>
    </select>
    <details class="study-sync-explanation"><summary>Como sincroniza</summary>
      <p>No modo manual, toque na nuvem para enviar o progresso e atualizar os cursos. Edições salvas em Autoria são enviadas em ambos os modos.</p>
    </details>
    <p data-study-sync-message role="status"></p>
    <details class="study-state-adoption"><summary>Progresso sem conta</summary>
      <p>Acrescente à conta o progresso e as marcas Rever deste dispositivo. O estado sem conta será mantido.</p>
      <button class="account-settings-subview-entry" type="button" data-study-adoption-preview>Examinar progresso sem conta</button>
      <div data-study-adoption-content></div>
      <p data-study-adoption-message role="status"></p>
    </details>
  </section>`;
  const modeControl = root.querySelector("[data-study-sync-mode]");
  const modeMessage = root.querySelector("[data-study-sync-message]");
  const content = root.querySelector("[data-study-adoption-content]");
  const message = root.querySelector("[data-study-adoption-message]");
  const previewButton = root.querySelector("[data-study-adoption-preview]");
  modeControl.value = preference.get();
  const unsubscribe = preference.subscribe((mode) => { modeControl.value = mode; });
  modeControl.addEventListener("change", () => {
    try {
      preference.set(modeControl.value);
      modeMessage.textContent = "";
    } catch {
      modeControl.value = preference.get();
      modeMessage.textContent = "Não foi possível salvar a preferência neste dispositivo.";
    }
  });
  const setBusy = (value) => {
    busy = value;
    previewButton.disabled = value;
    content.querySelectorAll("button, input").forEach((control) => { control.disabled = value; });
  };
  previewButton.addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    message.textContent = "";
    try {
      const identity = await getIdentity();
      const result = await previewVisitorState();
      if (destroyed) return;
      if (!identity?.userId || !identity?.handle) throw new Error("Perfil indisponível.");
      preview = result;
      destination = identity;
      if (!result.courses.length) {
        content.replaceChildren();
        message.textContent = "Não há progresso sem conta disponível para acrescentar aos seus cursos.";
        return;
      }
      content.innerHTML = `<form data-study-adoption-form>
        <p>Acrescentar à conta <strong>@${escapeHtml(identity.handle)}</strong>:</p>
        ${result.courses.map((course) => `<label><input type="checkbox" name="visitorCourse" value="${escapeHtml(course.courseId)}"> <span>${escapeHtml(course.title)}<small>${quantity(course.completedCount, "unidade concluída", "unidades concluídas")} · ${quantity(course.reviewCount, "marca Rever", "marcas Rever")}</small></span></label>`).join("")}
        <p>O progresso já existente na conta será mantido. Sua posição de leitura não será substituída.</p>
        <button class="account-settings-subview-entry" type="submit">Acrescentar os cursos selecionados à minha conta</button>
      </form>`;
    } catch (error) {
      if (!destroyed) message.textContent = publicErrorMessage(error, "Não foi possível examinar o progresso sem conta.");
    } finally {
      if (!destroyed) {
        setBusy(false);
        (content.querySelector("input") || previewButton).focus({ preventScroll: true });
      }
    }
  });
  content.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !preview || !destination) return;
    const courseIds = [...content.querySelectorAll('input[name="visitorCourse"]:checked')].map((control) => control.value);
    if (!courseIds.length) { message.textContent = "Selecione os cursos que deseja acrescentar."; return; }
    setBusy(true);
    message.textContent = "";
    try {
      const currentIdentity = await getIdentity();
      if (destroyed) return;
      if (currentIdentity?.userId !== destination.userId) throw new Error("A conta mudou. Examine o progresso novamente.");
      await adoptVisitorState({ courseIds, expectedSnapshotId: preview.snapshotId });
      if (destroyed) return;
      preview = null;
      content.replaceChildren();
      message.textContent = "Progresso acrescentado à conta neste dispositivo. A nuvem indica a sincronização pendente.";
      try { await onAdopted(); }
      catch {
        if (!destroyed) message.textContent = "Progresso acrescentado à conta neste dispositivo. Reabra o curso para consultar os dados; a sincronização continua pendente.";
      }
    } catch (error) {
      if (!destroyed) message.textContent = publicErrorMessage(error, "Não foi possível acrescentar o progresso. Examine os dados novamente antes de tentar.");
    } finally {
      if (!destroyed) {
        setBusy(false);
        if (!preview) previewButton.focus({ preventScroll: true });
      }
    }
  });
  return Object.freeze({ destroy() { destroyed = true; unsubscribe(); } });
}
