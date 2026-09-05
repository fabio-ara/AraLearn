import { inspectCourseAudioBytes, normalizeCourseAudioConfig, normalizeCourseMediaReference } from "../../../domain/courseMedia.js";

const message = {
  "not-allowed": "O navegador bloqueou a reprodução. Toque em Reproduzir novamente e confira a permissão de áudio.",
  "voice-unavailable": "A voz escolhida não está disponível neste dispositivo. Confira a configuração de áudio.",
  "language-unavailable": "Não há voz disponível para o idioma desta faixa. Confira a configuração de áudio.",
  "network": "A voz remota não respondeu. Confira a conexão e tente novamente.",
  "synthesis-unavailable": "A síntese de voz não está disponível neste dispositivo.",
  "audio-busy": "O dispositivo de áudio está ocupado. Tente novamente."
};
function compatibleLanguage(voice, locale) {
  try { return new Intl.Locale(voice.lang).language === new Intl.Locale(locale).language; }
  catch { return false; }
}
export function selectNativeAudioVoice(voices, locale, config) {
  const candidates = voices.filter(voice => compatibleLanguage(voice, locale));
  const chosen = config.nativeVoiceURI !== null
    ? candidates.find(voice => voice.voiceURI === config.nativeVoiceURI)
    : candidates.find(voice => voice.localService === true && voice.lang.toLowerCase() === locale.toLowerCase()) ||
      candidates.find(voice => voice.localService === true) ||
      (config.allowRemoteNativeVoice ? candidates.find(voice => voice.lang.toLowerCase() === locale.toLowerCase()) || candidates[0] : null);
  if (!chosen) throw new Error(config.nativeVoiceURI !== null ? message["voice-unavailable"] : message["language-unavailable"]);
  if (chosen.localService !== true && !config.allowRemoteNativeVoice) {
    throw new Error("A voz escolhida usa serviço remoto. Autorize esse uso nos ajustes ou escolha uma voz local.");
  }
  return chosen;
}

export function bindAudioTool(root, data, host = {}) {
  const win = root.ownerDocument.defaultView;
  const synthesis = win.speechSynthesis;
  const tracks = new Map(data.tracks.map(track => [track.id, track]));
  const rows = [...root.querySelectorAll("[data-audio-track]")];
  const configurationStatus = root.querySelector("[data-audio-configuration-status]");
  const retry = root.querySelector('[data-audio-action="retry-configuration"]');
  let disposed = false;
  let config = null;
  let configRequest = 0;
  let playbackRequest = 0;
  let active = null;
  let cancelVoiceWait = null;
  const status = (row, value) => { row.querySelector("[data-audio-track-status]").textContent = value; };
  const enable = () => rows.forEach(row => { row.querySelector('[data-audio-action="play"]').disabled = !config; });
  function stop() {
    playbackRequest += 1;
    cancelVoiceWait?.();
    if (!active) return;
    const { row, utterance, audio, objectUrl, controller } = active;
    active = null;
    controller?.abort();
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
      synthesis.cancel();
    }
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.hidden = true;
    }
    if (objectUrl) win.URL.revokeObjectURL(objectUrl);
    row.querySelector('[data-audio-action="stop"]').disabled = true;
    status(row, "Reprodução encerrada.");
  }
  function waitForVoices() {
    const current = synthesis.getVoices();
    if (current.length) return Promise.resolve(current);
    return new Promise(resolve => {
      const finish = () => {
        win.clearTimeout(timer);
        synthesis.removeEventListener("voiceschanged", changed);
        cancelVoiceWait = null;
        resolve(synthesis.getVoices());
      };
      const changed = () => { if (synthesis.getVoices().length) finish(); };
      const timer = win.setTimeout(finish, 1500);
      cancelVoiceWait = finish;
      synthesis.addEventListener("voiceschanged", changed);
    });
  }
  async function configure() {
    const request = ++configRequest;
    stop();
    config = null;
    enable();
    configurationStatus.textContent = "Consultando configuração de áudio…";
    retry.hidden = true;
    try {
      const received = typeof host.loadAudioConfiguration === "function" ? await host.loadAudioConfiguration() : host.audioConfig;
      const next = normalizeCourseAudioConfig(received);
      if (disposed || request !== configRequest) return;
      config = next;
      configurationStatus.textContent = `Velocidade ${config.rate}×. ${config.allowRemoteNativeVoice ? "Vozes remotas autorizadas nos ajustes." : "Voz nativa somente local."}`;
      enable();
    } catch {
      if (disposed || request !== configRequest) return;
      configurationStatus.textContent = "Não foi possível consultar a configuração de áudio. Tente novamente.";
      retry.hidden = false;
    }
  }
  async function play(row, track) {
    if (!config || disposed) return;
    stop();
    const request = playbackRequest;
    active = { row };
    row.querySelector('[data-audio-action="stop"]').disabled = false;
    status(row, track.kind === "native" ? "Preparando a voz…" : "Obtendo o arquivo autorizado…");
    const isCurrent = () => !disposed && request === playbackRequest;
    try {
      if (track.kind === "native") {
        if (!synthesis || typeof win.SpeechSynthesisUtterance !== "function") throw new Error(message["synthesis-unavailable"]);
        const voices = await waitForVoices();
        if (!isCurrent()) return;
        const voice = selectNativeAudioVoice(voices, track.locale, config);
        if (voice.localService !== true) {
          const consent = row.querySelector("[data-audio-remote-consent]");
          const label = consent.closest("label");
          if (consent.dataset.voiceUri !== voice.voiceURI) consent.checked = false;
          consent.dataset.voiceUri = voice.voiceURI;
          label.hidden = false;
          label.querySelector("span").textContent = `Autorizo enviar o texto desta faixa ao serviço da voz ${voice.name || voice.voiceURI} para escutá-lo.`;
          if (!consent.checked) {
            stop();
            status(row, "Esta voz usa um serviço remoto. Leia a autorização e escolha Reproduzir novamente se concordar.");
            consent.focus();
            return;
          }
        }
        const utterance = new win.SpeechSynthesisUtterance(track.text);
        utterance.voice = voice;
        utterance.lang = track.locale;
        utterance.rate = config.rate;
        active.utterance = utterance;
        utterance.onend = () => { if (isCurrent()) stop(); };
        utterance.onerror = event => {
          if (!isCurrent()) return;
          stop();
          status(row, message[event.error] || "Não foi possível reproduzir a fala. Confira a voz e tente novamente.");
        };
        status(row, voice.localService === true ? "Reproduzindo com voz local." : "Reproduzindo com voz remota autorizada.");
        synthesis.speak(utterance);
      } else {
        if (typeof host.downloadMedia !== "function") throw new Error("O arquivo não está disponível nesta leitura.");
        const media = normalizeCourseMediaReference(track.media);
        const controller = new AbortController();
        active.controller = controller;
        const { blob } = await host.downloadMedia(media, { signal: controller.signal });
        if (!isCurrent()) return;
        if (!(blob instanceof win.Blob) || blob.size !== media.byteSize) throw new Error("O arquivo recebido não corresponde à faixa.");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        inspectCourseAudioBytes(bytes, { declaredMediaType: media.mediaType });
        const digest = await win.crypto.subtle.digest("SHA-256", bytes);
        const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
        if (!isCurrent()) return;
        if (hash !== media.contentHash) throw new Error("A identidade do arquivo recebido não corresponde à faixa.");
        const audio = row.querySelector("audio");
        const objectUrl = win.URL.createObjectURL(blob);
        Object.assign(active, { audio, objectUrl });
        audio.src = objectUrl;
        audio.playbackRate = config.rate;
        audio.hidden = false;
        audio.onended = () => { if (isCurrent()) { status(row, "Reprodução concluída. Use os controles para escutar novamente."); } };
        audio.onerror = () => { if (isCurrent()) { stop(); status(row, "O navegador não conseguiu decodificar este áudio. Tente novamente ou consulte a alternativa textual."); } };
        await audio.play();
        if (isCurrent()) status(row, "Áudio disponível. Use os controles para pausar ou percorrer a faixa.");
      }
    } catch (error) {
      if (!isCurrent()) return;
      stop();
      status(row, error?.name === "NotAllowedError" ? message["not-allowed"] :
        error?.code === "invalid_course_media" ? "O arquivo de áudio está incompleto ou tem formato não aceito." :
          track.kind === "native" ? error.message : "Não foi possível obter ou reproduzir o arquivo de áudio. Confira o acesso e tente novamente.");
    }
  }
  function onClick(event) {
    const button = event.target.closest("[data-audio-action]");
    if (!button || !root.contains(button)) return;
    const action = button.dataset.audioAction;
    if (action === "retry-configuration") { void configure(); return; }
    const row = button.closest("[data-audio-track]");
    const track = tracks.get(row?.dataset.audioTrack);
    if (!track) return;
    if (action === "play") void play(row, track);
    if (action === "stop") stop();
    if (action === "show-alternative" && (track.alternative.visibility === "on_request" || host.canRevealAnswers === true)) {
      row.querySelector("[data-audio-alternative]").textContent = track.alternative.text;
      button.hidden = true;
    }
  }
  for (const row of rows) {
    const track = tracks.get(row.dataset.audioTrack);
    if (track?.alternative.visibility === "after_response" && host.canRevealAnswers === true) {
      const target = row.querySelector("[data-audio-alternative]");
      if (target) target.textContent = track.alternative.text;
    }
  }
  root.addEventListener("click", onClick);
  void configure();
  return () => {
    disposed = true;
    configRequest += 1;
    stop();
    root.removeEventListener("click", onClick);
  };
}
