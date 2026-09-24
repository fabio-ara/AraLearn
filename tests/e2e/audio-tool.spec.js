import { expect, test } from "@playwright/test";

async function mount(page, { remote = false, late = false, configFailure = false, reveal = false, corrupt = false, duration = 0.5 } = {}) {
  await page.route("**/main.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async options => {
    const { audioPackage } = await import("/src/resources/packages/audio/index.js");
    const { wrapGeminiPcmAsWav } = await import("/src/generation/providers/geminiSpeechProvider.js");
    const { createDefaultCourseAudioConfig } = await import("/src/domain/courseMedia.js");
    document.body.innerHTML = '<main class="study-tool-body" style="padding:16px;max-width:640px;margin:auto"></main>';
    const root = document.querySelector("main");
    const probe = { spoke: [], cancellations: 0, downloads: [], urls: [], revoked: [], configReads: 0, closed: false, release: null, corrupt: options.corrupt };
    const local = { voiceURI: "synthetic-local", name: "Voz sintética local", lang: "pt-BR", localService: true };
    const remote = { voiceURI: "synthetic-remote", name: "Voz sintética remota", lang: "pt-BR", localService: false };
    const synthesis = new EventTarget();
    synthesis.voices = options.late ? [] : [options.remote ? remote : local];
    synthesis.getVoices = () => synthesis.voices;
    synthesis.speak = utterance => { probe.spoke.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate, voice: utterance.voice.voiceURI }); probe.currentUtterance = utterance; utterance.onstart?.(); };
    synthesis.pause = () => { probe.paused = true; }; synthesis.resume = () => { probe.paused = false; };
    synthesis.cancel = () => { probe.cancellations++; };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class { constructor(text) { this.text = text; } } });
    const pcm = new Uint8Array(48000 * options.duration);
    const view = new DataView(pcm.buffer);
    for (let index = 0; index < pcm.length / 2; index++) view.setInt16(index * 2, Math.round(Math.sin(index * Math.PI * 2 * 440 / 24000) * 1200), true);
    const wav = wrapGeminiPcmAsWav(pcm);
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", wav))].map(value => value.toString(16).padStart(2, "0")).join("");
    const data = { tracks: [
      { id: "first", label: "Pronúncia sintética para escuta e comparação cuidadosa", locale: "pt-BR", kind: "native", text: "Som reservado nativo.", alternative: { text: "Alternativa solicitada <script>hostil</script>.", visibility: "on_request" } },
      { id: "second", label: "Segunda faixa para responder", locale: "pt-BR", kind: "native", text: "Outra resposta reservada.", alternative: { text: "Alternativa somente após responder.", visibility: "after_response" } },
      { id: "file", label: "Gravação PCM sintética", locale: "pt-BR", kind: "file", media: { contentHash: hash, byteSize: wav.length, mediaType: "audio/wav" }, alternative: { text: "Tom periódico sintético de 440 Hz.", visibility: "always" } }
    ] };
    root.innerHTML = audioPackage.render(data);
    const config = { ...createDefaultCourseAudioConfig(), rate: 1.25, allowRemoteNativeVoice: options.remote, nativeVoiceURI: options.remote ? remote.voiceURI : null };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); probe.urls.push(url); return url; };
    URL.revokeObjectURL = url => { probe.revoked.push(url); revoke(url); };
    probe.cleanup = audioPackage.toolInteraction.bind(root, data, {
      canRevealAnswers: options.reveal,
      loadAudioConfiguration: async () => { probe.configReads++; if (options.configFailure && probe.configReads === 1) throw new Error("synthetic offline"); return config; },
      downloadMedia: async (media, { signal }) => {
        signal.addEventListener("abort", () => { probe.downloadAborted = true; });
        probe.downloads.push(structuredClone(media));
        if (probe.deferDownload) await new Promise(resolve => { probe.release = resolve; });
        const bytes = new Uint8Array(wav);
        if (probe.corrupt) bytes[100] ^= 1;
        return { blob: new Blob([bytes], { type: "audio/wav" }) };
      }
    });
    probe.publishVoices = () => { synthesis.voices = [local]; synthesis.dispatchEvent(new Event("voiceschanged")); };
    window.__audioProbe = probe;
    await document.fonts.ready;
  }, { remote, late, configFailure, reveal, corrupt, duration });
}

test("voz nativa recebe idioma/ritmo, alternativa explícita não executa markup e fechar cancela", async ({ page }, info) => {
  await mount(page);
  const first = page.locator('[data-audio-track="first"]');
  await expect(first.locator('[data-audio-action="play"]')).toBeEnabled();
  await expect(page.getByRole("button", { name: "Consultar configuração novamente", includeHidden: true })).toBeHidden();
  expect(await page.locator("main").textContent()).not.toMatch(/Som reservado|Outra resposta|Alternativa somente após/);
  await first.locator('[data-audio-action="play"]').focus(); await page.keyboard.press("Enter");
  await expect(first.getByRole("button", { name: /^Pausar/u })).toBeVisible();
  await expect(first.locator('[data-audio-track-status]')).toBeEmpty();
  expect(await page.evaluate(() => window.__audioProbe.spoke)).toEqual([{ text: "Som reservado nativo.", lang: "pt-BR", rate: 1.25, voice: "synthetic-local" }]);
  await first.getByRole("button", { name: "Mostrar alternativa textual" }).tap();
  await expect(first.locator("[data-audio-alternative]")).toHaveText("Alternativa solicitada <script>hostil</script>.");
  expect(await first.locator("script").count()).toBe(0);
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(width => { document.documentElement.dataset.colorMode = width === 390 ? "dark" : "light"; }, width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(await first.locator('[data-audio-action="play"]').evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath(`audio-${width}.png`), fullPage: true });
  }
  await page.evaluate(() => window.__audioProbe.cleanup());
  expect(await page.evaluate(() => window.__audioProbe.cancellations)).toBe(1);
});

test("voz remota exige consentimento de quem escuta, mesmo autorizada no curso", async ({ page }) => {
  await mount(page, { remote: true });
  const row = page.locator('[data-audio-track="first"]');
  await row.locator('[data-audio-action="play"]').tap();
  await expect(row.locator("[data-audio-remote-consent]")).toBeFocused();
  expect(await page.evaluate(() => window.__audioProbe.spoke.length)).toBe(0);
  await expect(row.getByText(/Autorizo enviar o texto desta faixa/)).toBeVisible();
  await row.locator("[data-audio-remote-consent]").check();
  expect(await page.evaluate(() => window.__audioProbe.spoke.length)).toBe(0);
  await row.locator('[data-audio-action="play"]').tap();
  await expect(row.getByRole("button", { name: /^Pausar/u })).toBeVisible();
  expect(await page.evaluate(() => window.__audioProbe.spoke.length)).toBe(1);
  await page.evaluate(() => window.__audioProbe.cleanup());
});

test("configuração pode falhar e tentar novamente; catálogo tardio não fala depois de fechar", async ({ page }) => {
  await mount(page, { configFailure: true, late: true });
  const play = page.locator('[data-audio-track="first"] [data-audio-action="play"]');
  await expect(play).toBeDisabled();
  await page.getByRole("button", { name: "Consultar configuração novamente" }).tap();
  await expect(play).toBeEnabled(); await play.tap();
  await page.evaluate(() => { window.__audioProbe.cleanup(); window.__audioProbe.publishVoices(); });
  expect(await page.evaluate(() => window.__audioProbe.spoke.length)).toBe(0);
  expect(await page.evaluate(() => window.__audioProbe.configReads)).toBe(2);
});

test("arquivo WAV é conferido, decodificado, volta ao início ao parar e é liberado ao fechar", async ({ page }) => {
  await mount(page, { reveal: true });
  const row = page.locator('[data-audio-track="file"]');
  await expect(page.locator('[data-audio-track="second"] [data-audio-alternative]')).toHaveText("Alternativa somente após responder.");
  await row.locator('[data-audio-action="play"]').tap();
  await expect(row.locator("audio")).toBeHidden();
  await expect.poll(() => row.locator("audio").evaluate(node => node.readyState)).toBeGreaterThanOrEqual(2);
  expect(await row.locator("audio").evaluate(node => ({ duration: node.duration, playbackRate: node.playbackRate, error: node.error }))).toEqual({ duration: 0.5, playbackRate: 1.25, error: null });
  await row.locator('[data-audio-action="stop"]').tap();
  await expect(row.locator("audio")).toBeHidden();
  expect(await row.locator("audio").evaluate(node => node.currentTime)).toBe(0);
  await expect(row.locator('[data-audio-action="stop"]')).toBeDisabled();
  await page.evaluate(() => window.__audioProbe.cleanup());
  expect(await page.evaluate(() => window.__audioProbe.revoked)).toEqual(await page.evaluate(() => window.__audioProbe.urls));
  expect(await page.evaluate(() => window.__audioProbe.downloads[0])).toMatchObject({ byteSize: 24044, mediaType: "audio/wav" });
});

test("player único pausa, busca pelo teclado e reinicia uma faixa longa sem baixar novamente", async ({ page }, info) => {
  await mount(page, { duration: 4 });
  const row = page.locator('[data-audio-track="file"]');
  const slider = row.getByRole("slider");
  const stop = row.locator('[data-audio-action="stop"]');
  await expect(stop).toBeDisabled();
  await row.getByRole("button", { name: /^Reproduzir/u }).tap();
  await expect(slider).toBeEnabled();
  await expect(stop).toBeEnabled();
  await row.getByRole("button", { name: /^Pausar/u }).tap();
  expect(await row.locator('audio').evaluate(node => node.paused)).toBe(true);
  await slider.focus(); await slider.press('End');
  await expect(row.locator('[data-audio-duration]')).toHaveText('0:04');
  await expect(row.locator('[data-audio-elapsed]')).toHaveText('0:04');
  await stop.tap();
  await expect(row.locator('[data-audio-elapsed]')).toHaveText('0:00');
  await expect(stop).toBeDisabled();
  await row.getByRole("button", { name: /^Reproduzir/u }).tap();
  expect(await page.evaluate(() => window.__audioProbe.downloads.length)).toBe(1);
  await row.getByRole("button", { name: /^Pausar/u }).tap();
  await page.screenshot({ path: info.outputPath('audio-player.png'), fullPage: true });
  await page.evaluate(() => window.__audioProbe.cleanup());
});

test("hash divergente e download concluído após fechar nunca chegam ao player", async ({ page }) => {
  await mount(page, { corrupt: true });
  const row = page.locator('[data-audio-track="file"]');
  await row.locator('[data-audio-action="play"]').tap();
  await expect(row.getByRole("status")).toContainText("Não foi possível obter");
  expect(await page.evaluate(() => window.__audioProbe.urls.length)).toBe(0);
  await page.evaluate(() => { window.__audioProbe.corrupt = false; window.__audioProbe.deferDownload = true; });
  await row.locator('[data-audio-action="play"]').tap();
  await expect.poll(() => page.evaluate(() => typeof window.__audioProbe.release)).toBe("function");
  await page.evaluate(() => { window.__audioProbe.cleanup(); window.__audioProbe.release(); });
  expect(await page.evaluate(() => window.__audioProbe.downloadAborted)).toBe(true);
  await expect(row.locator("audio")).toBeHidden();
  expect(await page.evaluate(() => window.__audioProbe.urls.length)).toBe(0);
});
