import {
  AUTHORING_PROCESS_PARAMETER_DEFINITIONS,
  AUTHORING_PROCESS_PREFERENCES_CONTRACT,
  defaultAuthoringProcessPreferences,
  normalizeAuthoringProcessPreferences,
  normalizeAuthoringProcessPreferencesRead,
  normalizeAuthoringProcessPreferencesChange
} from "../domain/authoringProcessPreferences.js";
import { createUuid } from "../domain/identifiers.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { publicErrorMessage } from "./publicErrorMessage.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const reviewLabels = { curricular_map: "Mapa curricular", explanation: "Explicação", study_unit: "Unidade de estudo" };

function parameterField(definition) {
  const id = `authoring-process-${definition.id}`;
  const schema = definition.valueSchema;
  const value = schema.type === "integer"
    ? `<input id="${id}-value" type="number" inputmode="numeric" min="${schema.minimum}" max="${schema.maximum}" step="1" value="${definition.defaultValue}" data-process-value="${definition.id}" required>`
    : `<select id="${id}-value" data-process-value="${definition.id}">${schema.allowedValues.map(option =>
      `<option value="${option}"${option === definition.defaultValue ? " selected" : ""}>${escapeHtml(definition.optionLabels[option] || option)}</option>`).join("")}</select>`;
  return `<fieldset class="authoring-process-parameter" data-process-parameter="${definition.id}">
    <legend>${escapeHtml(definition.label)}</legend>
    <label for="${id}-mode">Escolha pessoal</label>
    <select id="${id}-mode" data-process-mode="${definition.id}"><option value="automatic">Automática</option><option value="fixed">Definir valor</option></select>
    <div data-process-value-group="${definition.id}" hidden><label for="${id}-value">${escapeHtml(definition.unitLabel)}</label>${value}</div>
    <details class="authoring-process-help"><summary>Significado e alcance</summary>
      <p>${escapeHtml(definition.construct)}</p><p>${escapeHtml(definition.operationalization)}</p><p>${escapeHtml(definition.limitations)}</p>
    </details>
  </fieldset>`;
}

export function mountAuthoringProcessPreferencesSettings(root, { client, createRequestId = createUuid } = {}) {
  let destroyed = false;
  let read = null;
  let incoming = null;
  let pending = null;
  let saving = false;
  let loading = false;
  let editVersion = 0;
  let readGeneration = 0;
  root.innerHTML = `<form class="authoring-process-settings" data-process-form>
    <p class="authoring-process-origin" data-process-origin>Preferências da sua conta</p>
    <p class="authoring-process-scope">Padrão pessoal para iniciar trabalhos de autoria. Alterações ficam disponíveis na próxima leitura do assistente.</p>
    <details class="authoring-process-help"><summary>Alcance das preferências</summary>
      <p>Escolhas do curso e condições de pesquisa continuam ligadas aos seus objetos e prevalecem quando aplicáveis. Um trabalho já combinado conserva seu acordo até uma mudança expressa.</p>
      <p>Salvar aqui não altera cursos, bases, unidades, perfis salvos ou declarações de revisão.</p>
    </details>
    <fieldset class="authoring-process-fields" data-process-fields disabled>
      <legend class="visually-hidden">Processo pessoal de autoria</legend>
      <div class="authoring-process-field"><label for="authoring-process-focus">Foco</label>
        <select id="authoring-process-focus" data-process-focus><option value="content">Conteúdo</option><option value="full_cycle">Ciclo completo</option></select>
        <p>Conteúdo trabalha bases e fontes. Ciclo completo inclui também desenho e unidades no recorte combinado.</p></div>
      <div class="authoring-process-field"><label for="authoring-process-cadence">Cadência do trabalho</label>
        <select id="authoring-process-cadence" data-process-cadence><option value="microsequence">Microssequência</option><option value="part">Parte</option><option value="batch">Lote</option></select>
        <p>Organiza o fluxo. Tamanhos e frequência de pausa têm escolhas próprias abaixo.</p></div>
      <fieldset class="authoring-process-review"><legend>Pontos de revisão</legend>
        ${Object.entries(reviewLabels).map(([key, label]) => `<label><input type="checkbox" data-process-review="${key}"><span>${label}</span></label>`).join("")}
        <p>Indicam onde inspecionar; selecionar um ponto não declara revisão.</p>
      </fieldset>
      ${["conversation", "cadence"].map(group => `<section class="authoring-process-group" aria-label="${group === "conversation" ? "Diálogo com o assistente" : "Organização da produção"}">
        <h3>${group === "conversation" ? "Diálogo com o assistente" : "Organização da produção"}</h3>
        ${AUTHORING_PROCESS_PARAMETER_DEFINITIONS.filter(definition => definition.group === group).map(parameterField).join("")}</section>`).join("")}
    </fieldset>
    <section class="authoring-process-conflict" data-process-conflict hidden aria-label="Preferências salvas em outro acesso">
      <p>As preferências da conta mudaram em outro acesso. Seu rascunho está preservado.</p>
      <details><summary>Comparar com o que está salvo</summary><dl data-process-remote-values></dl></details>
      <button type="button" data-process-keep-draft>Continuar com meu rascunho</button>
      <button type="button" data-process-use-saved>Usar preferências salvas</button>
    </section>
    <div class="authoring-process-actions">
      <button class="icon-ghost is-primary" type="submit" data-process-save disabled title="Salvar preferências" aria-label="Salvar preferências">${renderUiIcon("save", "account-settings-action-icon")}</button>
      <button class="icon-ghost" type="button" data-process-reload title="Atualizar preferências salvas" aria-label="Atualizar preferências salvas">${renderUiIcon("rotate", "account-settings-action-icon")}</button>
      <p data-process-status role="status" aria-live="polite"></p>
    </div>
    <details class="authoring-process-help"><summary>Ajuda das ações</summary><p>Salvar confirma suas escolhas na conta. Atualizar consulta o que está salvo e conserva alterações ainda não enviadas.</p></details>
  </form>`;
  const form = root.querySelector("[data-process-form]");
  const fields = root.querySelector("[data-process-fields]");
  const saveButton = root.querySelector("[data-process-save]");
  const reloadButton = root.querySelector("[data-process-reload]");
  const status = root.querySelector("[data-process-status]");
  const conflict = root.querySelector("[data-process-conflict]");
  const origin = root.querySelector("[data-process-origin]");
  const control = selector => root.querySelector(selector);
  const readDraft = () => normalizeAuthoringProcessPreferences({
    focus: control("[data-process-focus]").value,
    cadence: control("[data-process-cadence]").value,
    reviewPoints: [...root.querySelectorAll("[data-process-review]:checked")].map(node => node.dataset.processReview),
    parameters: AUTHORING_PROCESS_PARAMETER_DEFINITIONS.map(({ id, valueSchema }) => {
      const mode = control(`[data-process-mode='${id}']`).value;
      const raw = control(`[data-process-value='${id}']`).value;
      return { parameterId: id, mode, value: mode === "automatic" ? null : valueSchema.type === "integer" ? (raw === "" ? NaN : Number(raw)) : raw };
    })
  });
  const dirty = () => { try { return Boolean(read && !equal(readDraft(), read.preferences)); } catch { return true; } };
  const syncModes = () => {
    for (const { id } of AUTHORING_PROCESS_PARAMETER_DEFINITIONS) {
      const automatic = control(`[data-process-mode='${id}']`).value === "automatic";
      control(`[data-process-value-group='${id}']`).hidden = automatic;
      control(`[data-process-value='${id}']`).disabled = automatic;
    }
  };
  const applyPreferences = preferences => {
    control("[data-process-focus]").value = preferences.focus;
    control("[data-process-cadence]").value = preferences.cadence;
    root.querySelectorAll("[data-process-review]").forEach(node => { node.checked = preferences.reviewPoints.includes(node.dataset.processReview); });
    for (const { parameterId, mode, value } of preferences.parameters) {
      control(`[data-process-mode='${parameterId}']`).value = mode;
      if (mode === "fixed") control(`[data-process-value='${parameterId}']`).value = String(value);
    }
    syncModes();
  };
  const updateState = () => {
    if (destroyed) return;
    fields.disabled = !read;
    let valid = true;
    try { readDraft(); } catch { valid = false; }
    saveButton.disabled = saving || loading || Boolean(incoming) || !read || (!pending && (!valid || !dirty()));
    reloadButton.disabled = saving || loading || Boolean(pending);
    saveButton.title = saveButton.ariaLabel = pending ? "Confirmar gravação pendente" : "Salvar preferências";
    form.setAttribute("aria-busy", String(saving || loading));
    origin.textContent = read ? read.revision === 0 ? "Origem: padrão inicial do aplicativo · alcance pessoal" : "Origem: preferências salvas na sua conta" : "Preferências da sua conta";
    conflict.hidden = !incoming;
  };
  const showIncoming = next => {
    incoming = next;
    const p = next.preferences;
    const entries = [["Foco", p.focus === "content" ? "Conteúdo" : "Ciclo completo"],
      ["Cadência", { microsequence: "Microssequência", part: "Parte", batch: "Lote" }[p.cadence]],
      ["Pontos de revisão", p.reviewPoints.map(key => reviewLabels[key]).join(", ") || "Nenhum"],
      ...p.parameters.map(parameter => {
        const definition = AUTHORING_PROCESS_PARAMETER_DEFINITIONS.find(item => item.id === parameter.parameterId);
        return [definition.label, parameter.mode === "automatic" ? "Automática" : definition.optionLabels[parameter.value] || String(parameter.value)];
      })];
    control("[data-process-remote-values]").innerHTML = entries.map(([label, item]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(item)}</dd>`).join("");
  };
  const load = async () => {
    if (destroyed || loading || saving || pending) return;
    loading = true;
    const generation = ++readGeneration;
    const version = editVersion;
    const wasDirty = dirty();
    status.textContent = "Consultando preferências salvas…";
    updateState();
    try {
      const next = normalizeAuthoringProcessPreferencesRead(await client.getAuthoringProcessPreferences());
      if (destroyed || generation !== readGeneration) return;
      if (read && (wasDirty || editVersion !== version)) {
        if (next.revision !== read.revision || !equal(next.preferences, read.preferences)) showIncoming(next);
        status.textContent = "Preferências consultadas. Seu rascunho foi preservado.";
      } else {
        read = next;
        incoming = null;
        applyPreferences(next.preferences);
        status.textContent = next.revision ? "Preferências salvas na conta." : "Padrão inicial disponível. Altere os campos para salvar sua preferência.";
      }
    } catch (error) {
      if (!destroyed && generation === readGeneration) status.textContent = publicErrorMessage(error, "Não foi possível consultar as preferências. Tente atualizar.");
    } finally { if (!destroyed && generation === readGeneration) { loading = false; updateState(); } }
  };
  const onEdit = () => {
    editVersion += 1;
    syncModes();
    status.textContent = pending ? "Há uma gravação pendente de confirmação. Suas alterações posteriores continuam neste rascunho." : "Alterações ainda não salvas.";
    updateState();
  };
  const reconcilePending = async command => {
    const next = normalizeAuthoringProcessPreferencesRead(await client.getAuthoringProcessPreferences());
    if (destroyed || pending !== command) return false;
    if (next.revision <= command.expectedRevision || !equal(next.preferences, command.preferences)) return false;
    read = next;
    pending = null;
    status.textContent = dirty()
      ? "Preferências enviadas confirmadas pela releitura. Há alterações posteriores no rascunho."
      : "Preferências enviadas confirmadas pela releitura.";
    return true;
  };
  fields.addEventListener("input", onEdit);
  fields.addEventListener("change", onEdit);
  reloadButton.addEventListener("click", () => void load());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (saving || loading || incoming || !read) return;
    const recovering = Boolean(pending);
    if (!pending) {
      if (!form.reportValidity() || !dirty()) return;
      try { pending = { expectedRevision: read.revision, preferences: readDraft(), requestId: createRequestId() }; }
      catch (error) { status.textContent = error.message; return; }
    }
    const command = pending;
    saving = true;
    status.textContent = "Confirmando preferências…";
    updateState();
    try {
      if (recovering && await reconcilePending(command)) return;
      if (destroyed || pending !== command) return;
      const result = normalizeAuthoringProcessPreferencesChange(await client.saveAuthoringProcessPreferences(command), command);
      if (destroyed || pending !== command) return;
      read = normalizeAuthoringProcessPreferencesRead({ contract: AUTHORING_PROCESS_PREFERENCES_CONTRACT,
        revision: result.revision, preferences: result.preferences, updatedAt: result.updatedAt });
      pending = null;
      status.textContent = dirty() ? "Preferências enviadas salvas. Há alterações posteriores no rascunho." : "Preferências salvas na conta.";
    } catch (error) {
      if (destroyed || pending !== command) return;
      const statusCode = Number(error?.status || 0);
      if (statusCode === 409 || error?.code === "course_revision_conflict" || error?.code === "PT409") {
        pending = null;
        try {
          const next = normalizeAuthoringProcessPreferencesRead(await client.getAuthoringProcessPreferences());
          if (!destroyed) showIncoming(next);
        }
        catch { /* O rascunho e a revisão anterior continuam disponíveis para nova leitura. */ }
        if (!destroyed) status.textContent = "As preferências salvas mudaram. Atualize ou compare antes de continuar.";
      } else if (statusCode >= 400 && statusCode < 500 && ![408, 429].includes(statusCode)) {
        pending = null;
        status.textContent = publicErrorMessage(error, "Não foi possível salvar as preferências.");
      } else {
        try { if (await reconcilePending(command)) return; }
        catch { /* A falha de leitura mantém a mesma tentativa e o rascunho. */ }
        if (destroyed || pending !== command) return;
        status.textContent = "A gravação ainda não foi confirmada. Use Confirmar gravação pendente para recuperar o mesmo pedido.";
      }
    } finally { if (!destroyed) { saving = false; updateState(); } }
  });
  for (const [selector, useSaved] of [["[data-process-keep-draft]", false], ["[data-process-use-saved]", true]]) {
    control(selector).addEventListener("click", () => {
      if (!incoming || saving || loading) return;
      read = incoming;
      incoming = null;
      if (useSaved) applyPreferences(read.preferences);
      editVersion += 1;
      status.textContent = useSaved ? "Preferências salvas carregadas." : "Rascunho preservado. Salvar substituirá as preferências da conta que você acabou de comparar.";
      updateState();
    });
  }
  applyPreferences(defaultAuthoringProcessPreferences());
  updateState();
  return Object.freeze({
    open() { if (!read && !loading) void load(); },
    refresh: load,
    destroy() { destroyed = true; readGeneration += 1; },
    hasPendingChanges: () => Boolean(pending || dirty())
  });
}
