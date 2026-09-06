import { createDefaultCourseAudioConfig, normalizeCourseAudioConfig, normalizeCourseMediaRead,
  normalizeCourseMediaChange, inspectCourseAudioBytes, COURSE_MEDIA_MAX_BYTES } from "../domain/courseMedia.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { publicErrorMessage } from "./publicErrorMessage.js";
import { readCourseMediaBlob } from "../supabase/readCourseMediaBlob.js";
import { trapAuthoringConfirmationTab } from "./courseAuthoringConfirmation.js";

const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const sizeLabel = (value) => `${(value / 1024 / 1024).toFixed(1)} MiB`;
const requestId = () => globalThis.crypto.randomUUID();
const ambiguous = (error) => !error?.status && !error?.code ||
  [0, 408, 429].includes(Number(error?.status)) || Number(error?.status) >= 500 ||
  /network|fetch_failed|timeout|write_uncertain/iu.test(String(error?.code || ""));

export function createCourseAudioPanel({ root, controller, courseId, courseRevision,
  onCourseRevisionChange = () => {}, windowValue = globalThis.window,
  loadSpeechProvider = () => import("../generation/providers/geminiSpeechProvider.js") }) {
  const state = { opened: false, revision: courseRevision, items: [], nextCursor: null,
    config: createDefaultCourseAudioConfig(), baseline: null, storage: null, loading: false,
    busy: false, pending: null, file: null, generated: false, error: "", message: "",
    confirmingHash: null, section: "files", generationText: "", generationName: "",
    serviceVoices: [], generationController: null };
  let epoch = 0;
  let previewUrl = null;
  let activePreview = null;
  let previewController = null;
  let returnSection = "configuration";

  function closeSection() {
    if (state.busy) return;
    state.section = "files"; state.confirmingHash = null;
    render();
    root.querySelector(`[data-section='${returnSection}']`)?.focus({ preventScroll: true });
  }

  function clearPreview() {
    previewController?.abort(); previewController = null;
    activePreview?.pause(); activePreview = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  function voiceOptions() {
    const voices = windowValue?.speechSynthesis?.getVoices?.() || [];
    const selected = state.config.nativeVoiceURI;
    return '<option value="">Automática · voz local</option>' +
      (selected && !voices.some((voice) => voice.voiceURI === selected)
        ? `<option value="${escape(selected)}" selected>Voz escolhida · indisponível neste dispositivo</option>` : "") +
      voices.map((voice) => `<option value="${escape(voice.voiceURI)}"${selected === voice.voiceURI ? " selected" : ""}>` +
        `${escape(voice.name)} · ${escape(voice.lang)} · ${voice.localService ? "local" : "remota"}</option>`).join("");
  }

  function configHtml() {
    const config = state.config;
    return '<form id="course-audio-config-form" data-audio-config class="course-audio-form">' +
      `<label>Idioma padrão<input name="locale" value="${escape(config.locale)}" maxlength="100" required autocomplete="off"></label>` +
      `<label>Velocidade de reprodução<select name="rate">${[...new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, config.rate])].sort((a, b) => a - b).map((rate) =>
        `<option value="${rate}"${config.rate === rate ? " selected" : ""}>${String(rate).replace(".", ",")}×</option>`).join("")}</select></label>` +
      `<label>Voz no navegador<select name="nativeVoiceURI">${voiceOptions()}</select></label>` +
      '<p>Vozes dependem do dispositivo. Voz remota envia o texto ao serviço, com confirmação antes de ouvir.</p>' +
      `<label class="course-audio-check"><input type="checkbox" name="allowRemoteNativeVoice"${config.allowRemoteNativeVoice ? " checked" : ""}>Permitir oferecer vozes remotas</label>` +
      '<details data-audio-service><summary>Geração de arquivo por serviço</summary>' +
      `<label>Serviço<select name="service"><option value=""${!config.service ? " selected" : ""}>Não configurado</option>` +
      `<option value="gemini"${config.service ? " selected" : ""}>Gemini · síntese de voz</option></select></label>` +
      `<label>Voz do serviço<select name="serviceVoice">${(state.serviceVoices.length ? state.serviceVoices : [config.service?.voice || "Kore"])
        .map((voice) => `<option value="${escape(voice)}"${(config.service?.voice || "Kore") === voice ? " selected" : ""}>${escape(voice)}</option>`).join("")}</select></label>` +
      '<p>Requer internet e chave própria. Gera um arquivo para guardar.</p>' +
      '</details></form>';
  }

  function uploadHtml() {
    return '<section><p>WAV ou MP3, até 20 MiB por arquivo.</p>' +
      '<form id="course-audio-upload-form" data-audio-upload class="course-audio-form"><div class="course-audio-file-choice">' +
      '<input type="file" name="audioFile" aria-label="Arquivo de áudio" accept="audio/wav,audio/mpeg,.wav,.mp3" hidden>' +
      '<button type="button" data-audio-action="choose-file" aria-label="Escolher arquivo de áudio" title="Escolher arquivo de áudio">' +
      renderUiIcon("folder", "course-authoring-button-icon") + '</button>' +
      `<p class="course-audio-file-name" data-audio-focus="file-name" tabindex="${state.file ? "0" : "-1"}" aria-label="Arquivo selecionado" aria-live="polite">` +
      (state.file ? `${escape(state.file.name)} · ${sizeLabel(state.file.size)}${state.generated ? " · gerado, ainda não guardado" : ""}` : "") + '</p></div>' +
      '</form>' +
      (state.storage ? `<p>PDFs e áudios: ${sizeLabel(state.storage.uniqueBytes)} de ${sizeLabel(state.storage.maxUniqueBytes)}.</p>` : "") +
      '<div data-audio-preview></div></section>';
  }

  function filesHtml() {
    return '<ul class="course-audio-files">' + state.items.map((item, index) => `<li><div tabindex="0"><strong>${escape(item.fileName || `Áudio ${index + 1}`)}</strong>` +
        `<span>${item.mediaType === "audio/wav" ? "WAV" : "MP3"} · ${sizeLabel(item.byteSize)}</span></div>` +
        `<button type="button" data-audio-action="preview" data-media-hash="${item.contentHash}" aria-label="Ouvir ${escape(item.fileName || `áudio ${index + 1}`)}" title="Ouvir">` +
        renderUiIcon("play", "course-authoring-button-icon") + '</button>' +
        `<button type="button" data-audio-action="remove" data-media-hash="${item.contentHash}" aria-label="Remover ${escape(item.fileName || `áudio ${index + 1}`)}" title="Remover">` +
        renderUiIcon("trash", "course-authoring-button-icon") + '</button></li>').join("") + '</ul>' +
      (!state.items.length ? '<div class="course-audio-empty" role="img" aria-label="Nenhum áudio guardado">' + renderUiIcon("audio", "course-authoring-button-icon") + '</div>' : "") +
      (state.nextCursor ? '<button type="button" data-audio-action="more" aria-label="Carregar mais áudios" title="Carregar mais áudios">' + renderUiIcon("arrow-down", "course-authoring-button-icon") + '</button>' : "") +
      (state.section === "files" && !state.confirmingHash ? '<div data-audio-preview></div>' : "");
  }

  function generationHtml() {
    const configured = state.baseline?.service;
    return '<section>' + (!configured
      ? '<p>Escolha o serviço e a voz na configuração e salve antes de gerar.</p>'
      : '<p>O texto será enviado ao Gemini com a voz ' + escape(configured.voice) +
        '. No plano gratuito, entradas e saídas podem ser usadas para melhorar produtos; evite material confidencial. ' +
        'A cobrança e a cota dependem da sua conta. <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer">Consultar oferta e preços</a>.</p>' +
        '<form id="course-audio-generation-form" data-audio-generation class="course-audio-form">' +
        `<label>Nome do arquivo<input name="generationName" maxlength="120" value="${escape(state.generationName)}" placeholder="Exemplo: saudações.wav" required></label>` +
        `<label>Texto a falar<textarea name="generationText" rows="6" maxlength="16000" required>${escape(state.generationText)}</textarea></label>` +
        '<label>Chave do serviço<input type="password" name="apiKey" autocomplete="off" spellcheck="false" required></label>' +
        '<p>A chave é descartada após a tentativa.</p>' +
        '<label class="course-audio-check"><input type="checkbox" name="consent" required>Autorizo enviar este texto e usar a cota ou cobrança da minha conta.</label>' +
        '</form>') +
      '</section>';
  }

  function sheetActions(disabled) {
    const button = (action, label, icon, { form = null, unavailable = false } = {}) =>
      `<button type="${form ? "submit" : "button"}"${form ? ` form="${form}"` : ` data-audio-action="${action}"`}` +
      ` aria-label="${label}" title="${label}"${disabled || unavailable ? " disabled" : ""}>${renderUiIcon(icon, "course-authoring-button-icon")}</button>`;
    if (state.confirmingHash) return button("confirm-remove", "Remover arquivo", "trash");
    if (state.section === "configuration") return button("reset-config", "Descartar configuração", "remove-state") +
      button(null, "Salvar configuração de áudio", "save", { form: "course-audio-config-form" });
    if (state.section === "upload") return button("preview-file", "Ouvir arquivo selecionado", "play", { unavailable: !state.file }) +
      button("discard-file", "Descartar arquivo selecionado", "remove-state", { unavailable: !state.file }) +
      button(null, "Guardar áudio", "save", { form: "course-audio-upload-form", unavailable: !state.file });
    return state.generationController ? '<button type="button" data-audio-action="cancel-generation" aria-label="Cancelar geração" title="Cancelar geração">' +
      renderUiIcon("remove-state", "course-authoring-button-icon") + '</button>' :
      button(null, "Gerar áudio", "audio", { form: "course-audio-generation-form", unavailable: !state.baseline?.service });
  }

  function render() {
    if (!state.opened) return;
    const previousDialog = root.querySelector("dialog");
    const active = root.ownerDocument.activeElement;
    const restoreName = previousDialog?.contains(active) ? active.name : null;
    const restoreAction = previousDialog?.contains(active) ? active.dataset.audioAction : null;
    const restoreFileName = previousDialog?.contains(active) && active.dataset.audioFocus === "file-name";
    const fileNameScrollTop = previousDialog?.querySelector(".course-audio-file-name")?.scrollTop || 0;
    const scrollTop = previousDialog?.querySelector(".course-audio-sheet-body")?.scrollTop || 0;
    const ephemeralKey = root.querySelector("input[name='apiKey']")?.value || "";
    const consent = root.querySelector("input[name='consent']")?.checked === true;
    clearPreview();
    const sheet = state.section !== "files" || state.confirmingHash;
    const disabled = state.busy || state.pending || state.loading || !state.baseline;
    const feedback = '<div class="course-audio-feedback" aria-live="polite">' +
      (state.message ? `<p role="status">${escape(state.message)}</p>` : "") +
      (state.error ? `<p role="alert">${escape(state.error)}</p>` : "") +
      (state.loading ? '<p role="status">Carregando áudios…</p>' : "") +
      (state.busy ? '<p role="status">Processando áudio…</p>' : "") + '</div>';
    root.innerHTML = '<section class="course-audio-panel" aria-label="Áudio"><header>' +
      '<nav class="course-audio-tabs" aria-label="Tarefas de áudio">' +
      [["configuration", "Configuração", "tags"], ["upload", "Enviar áudio", "upload"], ["generation", "Gerar voz", "audio"]]
        .map(([id, label, icon]) => `<button type="button" data-audio-action="section" data-section="${id}"` +
          ` aria-label="${label}" title="${label}" aria-pressed="${state.section === id}">` +
          renderUiIcon(icon, "course-authoring-button-icon") + '</button>').join("") + '</nav>' +
      `<button type="button" data-audio-action="${state.pending ? "retry" : "refresh"}" aria-label="${state.pending ? "Confirmar operação pendente" : "Atualizar biblioteca"}" title="${state.pending ? "Confirmar operação pendente" : "Atualizar biblioteca"}"` +
      (state.loading || state.busy ? " disabled" : "") + '>' +
      renderUiIcon("rotate", "course-authoring-button-icon") + '</button></header>' +
      (!sheet ? feedback : '<div class="course-audio-feedback"></div>') +
      '<fieldset class="course-audio-content"' + (disabled ? " disabled" : "") + '>' + filesHtml() + '</fieldset>' +
      (sheet ? '<dialog class="course-audio-sheet" aria-labelledby="course-audio-sheet-title"><header>' +
        `<h2 id="course-audio-sheet-title">${state.confirmingHash ? "Remover áudio" : ({ configuration: "Configuração", upload: "Enviar áudio", generation: "Gerar voz" })[state.section]}</h2>` +
        '<button type="button" data-audio-action="close-section" aria-label="Fechar ajustes de áudio" title="Fechar"' +
        (state.busy ? " disabled" : "") + '>' + renderUiIcon("remove-state", "course-authoring-button-icon") + '</button></header>' +
        feedback + '<div class="course-audio-sheet-body">' +
        (state.pending ? '<button type="button" data-audio-action="retry">Confirmar operação pendente</button>' : "") +
        '<fieldset class="course-audio-content"' + (disabled ? " disabled" : "") + '>' +
        (state.confirmingHash ? '<p>Remover o arquivo? As faixas que o usam precisarão de outro áudio. Outras cópias do curso são preservadas.</p>' :
          state.section === "configuration" ? configHtml() : state.section === "upload" ? uploadHtml() : generationHtml()) + '</fieldset>' +
        '</div><footer class="course-audio-actions">' + sheetActions(disabled) + '</footer></dialog>' : '') + '</section>';
    const dialog = root.querySelector("dialog");
    if (dialog) {
      dialog.addEventListener("cancel", event => { event.preventDefault(); event.stopPropagation(); closeSection(); });
      dialog.addEventListener("keydown", event => {
        event.stopPropagation();
        trapAuthoringConfirmationTab({ event, root, confirmationSelector: ".course-audio-sheet" });
      });
      dialog.showModal();
      const focus = restoreFileName ? dialog.querySelector(".course-audio-file-name") :
        restoreName === "audioFile" ? dialog.querySelector("[data-audio-action='choose-file']") :
        restoreName ? dialog.querySelector(`[name='${restoreName}']`) :
        restoreAction ? dialog.querySelector(`[data-audio-action='${restoreAction}']`) : null;
      focus?.focus({ preventScroll: true });
      const fileName = dialog.querySelector(".course-audio-file-name");
      if (fileName) fileName.scrollTop = fileNameScrollTop;
      dialog.querySelector(".course-audio-sheet-body").scrollTop = scrollTop;
    }
    const keyInput = root.querySelector("input[name='apiKey']");
    if (keyInput && !state.busy) {
      keyInput.value = ephemeralKey;
      root.querySelector("input[name='consent']").checked = consent;
    }
    if (state.busy || state.loading || state.pending || !state.baseline) {
      root.querySelectorAll("[data-audio-action='section']").forEach((button) => { button.disabled = true; });
    }
  }

  async function read({ append = false } = {}) {
    const ownEpoch = epoch;
    state.loading = true;
    render();
    try {
      const value = normalizeCourseMediaRead(await controller.loadCourseMedia(courseId, {
        expectedRevision: state.revision, mode: "catalog", cursor: append ? state.nextCursor : null, limit: 20
      }));
      if (!state.opened || epoch !== ownEpoch) return false;
      if (value.courseId !== courseId || value.courseRevision !== state.revision || value.mode !== "catalog") {
        throw new TypeError("A biblioteca de áudio não corresponde ao curso aberto.");
      }
      state.items = append ? [...new Map([...state.items, ...value.items].map((item) => [item.contentHash, item])).values()] : value.items;
      state.nextCursor = value.nextCursor;
      state.storage = value.storage;
      if (!state.baseline || JSON.stringify(state.config) === JSON.stringify(state.baseline)) state.config = value.audioConfig;
      state.baseline = value.audioConfig;
      return true;
    } catch (error) { if (epoch === ownEpoch) state.error = publicErrorMessage(error, "Não foi possível carregar os áudios."); return false; }
    finally { if (epoch === ownEpoch) { state.loading = false; render(); } }
  }

  async function submitPending() {
    if (!state.pending || state.busy) return;
    const pending = state.pending;
    state.busy = true; state.error = ""; state.message = ""; render();
    try {
      const value = normalizeCourseMediaChange(await (pending.file
        ? controller.uploadCourseAudio(pending) : controller.mutateCourseMedia(pending)));
      if (!state.opened) return;
      if (value.courseId !== courseId || value.requestId !== pending.requestId || value.courseRevision < pending.expectedCourseRevision) {
        throw new TypeError("A confirmação não corresponde à alteração de áudio.");
      }
      state.revision = Math.max(state.revision, value.courseRevision);
      onCourseRevisionChange(state.revision);
      if (pending.command?.type === "set_audio_config") state.baseline = structuredClone(pending.command.config);
      if (pending.file) {
        if (state.generated) { state.generationText = ""; state.generationName = ""; }
        state.file = null; state.generated = false;
      }
      state.pending = null; state.confirmingHash = null;
      state.message = "Áudio atualizado.";
      await read();
    } catch (error) {
      if (!state.opened) return;
      if (!ambiguous(error)) state.pending = null;
      state.error = publicErrorMessage(error, "Não foi possível concluir esta alteração de áudio.", {
        conflict: "O curso mudou. Atualize a biblioteca e confira sua escolha antes de salvar novamente."
      }) + (state.pending ? " Confirme a operação pendente para verificar o mesmo pedido." : "");
    } finally { state.busy = false; render(); }
  }

  function mutate(command) {
    state.pending = { courseId, expectedCourseRevision: state.revision, requestId: requestId(), command };
    return submitPending();
  }

  function readConfig(form) {
    const values = new FormData(form);
    state.config = { nativeVoiceURI: String(values.get("nativeVoiceURI") || "") || null,
      locale: String(values.get("locale") || "").trim(), rate: Number(values.get("rate")),
      allowRemoteNativeVoice: values.has("allowRemoteNativeVoice"), service: values.get("service") ? {
        providerId: "gemini", model: "gemini-2.5-flash-preview-tts", voice: String(values.get("serviceVoice"))
      } : null };
    return normalizeCourseAudioConfig(state.config);
  }

  async function upload() {
    if (!state.file) return;
    if (state.file.size > COURSE_MEDIA_MAX_BYTES) throw new TypeError("O áudio excede 20 MiB.");
    inspectCourseAudioBytes(new Uint8Array(await state.file.arrayBuffer()), { declaredMediaType: state.file.type });
    state.pending = { courseId, expectedCourseRevision: state.revision, requestId: requestId(), file: state.file };
    await submitPending();
  }

  async function generate(form) {
    const values = new FormData(form);
    const apiKey = String(values.get("apiKey") || "").trim();
    form.elements.apiKey.value = "";
    state.generationText = String(values.get("generationText") || "");
    state.generationName = String(values.get("generationName") || "").trim();
    if (!values.has("consent") || !state.baseline?.service || !apiKey) throw new TypeError("Confirme o envio, configure o serviço e informe a chave.");
    if (!state.generationName || /[/\\]/u.test(state.generationName) ||
        [...state.generationName].some((character) => character.codePointAt(0) < 32)) {
      throw new TypeError("Use somente o nome do arquivo, sem caminho.");
    }
    state.busy = true; state.error = ""; state.message = "";
    state.generationController = new AbortController(); render();
    try {
      const provider = await loadSpeechProvider();
      const result = await provider.generateGeminiSpeech({ text: state.generationText, locale: state.baseline.locale,
        voice: state.baseline.service.voice, rate: 1, apiKey, signal: state.generationController.signal });
      if (!state.opened) return;
      const fileName = /\.wav$/iu.test(state.generationName) ? state.generationName : `${state.generationName}.wav`;
      state.file = new File([result.blob], fileName, { type: "audio/wav" });
      state.generated = true; state.section = "upload";
      state.message = "Áudio gerado. Confira a gravação e guarde o arquivo para usá-lo no curso.";
    } finally { state.generationController = null; state.busy = false; render(); }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!form.matches?.("[data-audio-config], [data-audio-upload], [data-audio-generation]")) return;
    event.preventDefault();
    if (state.busy || state.pending || state.loading || !state.baseline) return;
    try {
      if (form.matches("[data-audio-config]")) await mutate({ type: "set_audio_config", config: readConfig(form) });
      else if (form.matches("[data-audio-upload]")) await upload();
      else await generate(form);
    } catch (error) { state.error = publicErrorMessage(error, "Não foi possível preparar o áudio."); render(); }
  }

  function handleInput(event) {
    if (event.target.name === "generationText") state.generationText = event.target.value;
    if (event.target.name === "generationName") state.generationName = event.target.value;
    if (event.target.closest?.("[data-audio-config]")) {
      try { readConfig(event.target.form); } catch { /* A pessoa ainda está preenchendo o idioma. */ }
    }
    if (event.target.name === "audioFile") {
      state.file = event.target.files?.[0] || null; state.generated = false; state.message = "";
      const fileName = root.querySelector(".course-audio-file-name");
      if (fileName) fileName.scrollTop = 0;
      render();
    }
  }

  async function handleClick(event) {
    const button = event.target.closest?.("[data-audio-action]");
    if (!button || !state.opened) return;
    const action = button.dataset.audioAction;
    if (action === "cancel-generation") { state.generationController?.abort(); return; }
    if (action === "close-section") { closeSection(); return; }
    if (state.busy || state.loading) return;
    if (action === "retry") { await submitPending(); return; }
    if (action === "refresh") {
      try {
        const detail = await controller.getCourse(courseId);
        if (!Number.isSafeInteger(detail.revision) || detail.revision < state.revision) throw new TypeError("Revisão de curso inválida.");
        state.revision = detail.revision; onCourseRevisionChange(state.revision);
        state.error = ""; await read();
      } catch (error) { state.error = publicErrorMessage(error, "Não foi possível atualizar os áudios."); render(); }
      return;
    }
    if (state.pending) return;
    try {
      if (action === "choose-file") { root.querySelector("input[name='audioFile']")?.click(); return; }
      if (action === "section") { state.section = button.dataset.section; returnSection = state.section; }
      if (action === "reset-config") state.config = structuredClone(state.baseline || createDefaultCourseAudioConfig());
      if (action === "discard-file") { state.file = null; state.generated = false; }
      if (action === "remove") { state.confirmingHash = button.dataset.mediaHash; returnSection = "upload"; }
      if (action === "cancel-remove") state.confirmingHash = null;
      if (action === "confirm-remove") { await mutate({ type: "remove_media", contentHash: state.confirmingHash }); return; }
      if (action === "more") { await read({ append: true }); return; }
      if (action === "preview" || action === "preview-file") {
        clearPreview();
        const selectedSection = state.section;
        previewController = new AbortController();
        const signal = previewController.signal;
        const value = action === "preview-file" ? null : await controller.getCourseMediaDownload({
          courseId, expectedRevision: state.revision, studyUnitId: null, contentHash: button.dataset.mediaHash });
        if (!state.opened || signal.aborted || state.section !== selectedSection) return;
        if (action === "preview-file") {
          if (!state.file) return;
          previewUrl = URL.createObjectURL(state.file);
        } else {
          const media = state.items.find((item) => item.contentHash === button.dataset.mediaHash);
          if (!media || value.courseId !== courseId || value.courseRevision !== state.revision || value.studyUnitId !== null) {
            throw new TypeError("O áudio não corresponde ao arquivo solicitado.");
          }
          const { blob } = await readCourseMediaBlob(value, {
            contentHash: media.contentHash, byteSize: media.byteSize, mediaType: media.mediaType
          }, { signal });
          if (!state.opened || signal.aborted || state.section !== selectedSection) return;
          previewUrl = URL.createObjectURL(blob);
        }
        const player = root.ownerDocument.createElement("audio");
        player.controls = true; player.preload = "none"; player.src = previewUrl;
        player.setAttribute("aria-label", "Prévia do áudio");
        player.addEventListener("error", () => { state.error = "Áudio indisponível. Tente abrir a prévia novamente."; render(); });
        activePreview = player; root.querySelector("[data-audio-preview]").replaceChildren(player);
        player.focus(); return;
      }
      render();
    } catch (error) { state.error = publicErrorMessage(error, "Não foi possível abrir o áudio."); render(); }
  }

  function updateVoices() {
    const select = root.querySelector("select[name='nativeVoiceURI']");
    if (select) select.innerHTML = voiceOptions();
  }
  root.addEventListener("submit", handleSubmit);
  root.addEventListener("input", handleInput);
  root.addEventListener("change", handleInput);
  root.addEventListener("click", handleClick);
  windowValue?.speechSynthesis?.addEventListener?.("voiceschanged", updateVoices);
  return Object.freeze({
    async open() {
      state.opened = true; ++epoch; render();
      void loadSpeechProvider().then((provider) => {
        state.serviceVoices = [...provider.GEMINI_SPEECH_VOICES];
        const select = root.querySelector("select[name='serviceVoice']");
        if (select) select.innerHTML = state.serviceVoices.map((voice) => `<option value="${escape(voice)}"${(state.config.service?.voice || "Kore") === voice ? " selected" : ""}>${escape(voice)}</option>`).join("");
      }).catch(() => {});
      return read();
    },
    refresh(revision) { state.revision = revision; return read(); },
    hasPendingDraft() { return Boolean(state.pending || state.busy || state.file || state.generationText ||
      state.baseline && JSON.stringify(state.config) !== JSON.stringify(state.baseline)); },
    destroy() {
      state.opened = false; ++epoch; state.generationController?.abort(); clearPreview();
      root.removeEventListener("submit", handleSubmit); root.removeEventListener("input", handleInput);
      root.removeEventListener("change", handleInput); root.removeEventListener("click", handleClick);
      windowValue?.speechSynthesis?.removeEventListener?.("voiceschanged", updateVoices);
      root.innerHTML = "";
    }
  });
}
