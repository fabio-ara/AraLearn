import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
async function mount(page, prepare = null) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  for (const [url, path, contentType] of [
    ["**/tests/gallery/course-microsequence-review.html", "../gallery/course-microsequence-review.html", "text/html"],
    ["**/tests/support/courseMicrosequenceReviewFixture.js", "../support/courseMicrosequenceReviewFixture.js", "text/javascript"],
    ["**/tests/helpers/courseMicrosequenceReviewFixture.js", "../helpers/courseMicrosequenceReviewFixture.js", "text/javascript"],
    ["**/tests/helpers/courseAuthoringAnalyticsFixture.js", "../helpers/courseAuthoringAnalyticsFixture.js", "text/javascript"]
  ]) await page.route(url, route => route.fulfill({ status: 200, contentType, body: readFileSync(new URL(path, import.meta.url), "utf8") }));
  await page.goto("/tests/gallery/course-microsequence-review.html");
  await expect.poll(() => page.evaluate(() => globalThis.__REVIEW_FIXTURE_READY__)).toBe(true);
  if (prepare) await prepare(page);
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  await expect(page.locator("[data-review-explanation-content]")).toBeVisible();
  return errors;
}
const dialog = page => page.getByRole("dialog", { name: "Explicação e revisão do conteúdo" });

async function mountTools(page, options = {}) {
  return mount(page, () => page.evaluate(async options => {
    const { probe, controller } = globalThis.__reviewFixture;
    const { REVIEW_COURSE_ID: courseId, REVIEW_MS_ID: microsequenceId } = await import("/tests/helpers/courseMicrosequenceReviewFixture.js");
    const { createDefaultCourseAudioConfig } = await import("/src/domain/courseMedia.js");
    const audio = probe.audio = { courseId, microsequenceId, spoke: [], cancellations: 0, voiceReads: 0,
      configurationReads: [], downloads: [], configFailures: options.configFailures || 0,
      deferConfiguration: Boolean(options.deferConfiguration), finishConfiguration: null, configurationRevision: null };
    const voices = ["pt-BR", "ja-JP", "zh-TW"].map(lang => ({ voiceURI: `synthetic-${lang}`, name: `Voz sintética ${lang}`, lang, localService: true }));
    const synthesis = new EventTarget();
    synthesis.voices = options.lateVoices ? [] : voices;
    synthesis.getVoices = () => { audio.voiceReads++; return synthesis.voices; };
    synthesis.speak = utterance => audio.spoke.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate, voice: utterance.voice.voiceURI });
    synthesis.cancel = () => { audio.cancellations++; };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class { constructor(text) { this.text = text; } } });
    audio.publishVoices = () => { synthesis.voices = voices; synthesis.dispatchEvent(new Event("voiceschanged")); };
    const tracks = [
      { id: "pt", label: "Saudação em português", locale: "pt-BR", text: "Bom dia." },
      { id: "ja", label: "Saudação em japonês", locale: "ja-JP", text: "おはようございます。" },
      { id: "zh", label: "Saudação em chinês", locale: "zh-TW", text: "早安。" }
    ].map(track => ({ ...track, kind: "native", alternative: { text: track.text, visibility: "on_request" } }));
    if (options.file) {
      const { wrapGeminiPcmAsWav } = await import("/src/generation/providers/geminiSpeechProvider.js");
      const pcm = new Uint8Array(24000);
      const view = new DataView(pcm.buffer);
      for (let index = 0; index < 12000; index++) view.setInt16(index * 2, Math.round(Math.sin(index * Math.PI * 2 * 440 / 24000) * 1200), true);
      const wav = wrapGeminiPcmAsWav(pcm);
      const contentHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", wav))].map(value => value.toString(16).padStart(2, "0")).join("");
      audio.fileBytes = [...wav];
      audio.fileMedia = { contentHash, byteSize: wav.length, mediaType: "audio/wav" };
      tracks.push({ id: "file", label: "Tom gravado", locale: "pt-BR", kind: "file", media: audio.fileMedia,
        alternative: { text: "Tom sintético de 440 Hz.", visibility: "always" } });
    }
    probe.explanationTools = [
      { id: "support-audio", package: "aralearn.resource.audio", version: "1.0.0", data: { tracks } },
      { id: "support-calculator", package: "aralearn.resource.calculator", version: "1.0.0", data: {
        title: "Calcular uma comparação", prompt: "Confira o resultado.", initialExpression: "2 + 3", angleUnit: "radians" } }
    ];
    if (options.calculator === false) probe.explanationTools.pop();
    controller.loadCourseMedia = async (requestedCourseId, request) => {
      audio.configurationReads.push({ courseId: requestedCourseId, ...structuredClone(request) });
      if (audio.deferConfiguration) await new Promise(resolve => { audio.finishConfiguration = resolve; });
      if (audio.configFailures > 0) { audio.configFailures--; throw new Error("Configuração sintética indisponível."); }
      return { contract: "aralearn.course-media.v1", courseId, courseRevision: audio.configurationRevision ?? request.expectedRevision,
        mode: "configuration", audioConfig: { ...createDefaultCourseAudioConfig(), rate: 1.25 }, storage: null, items: [], nextCursor: null };
    };
    controller.getCourseMediaDownload = async request => {
      audio.downloads.push(structuredClone(request));
      return { contract: "aralearn.course-media-download.v1", courseId, courseRevision: request.expectedRevision,
        targetKind: "microsequence_explanation", targetId: microsequenceId, media: audio.fileMedia,
        signedUrl: `${location.origin}/storage/v1/object/sign/course-media/${courseId}/${audio.fileMedia.contentHash}.wav?token=synthetic`,
        expiresAt: "2030-01-01T00:00:00Z" };
    };
  }, options));
}
const audioDialog = page => page.getByRole("dialog", { name: "Áudio", exact: true });
const toolsLauncher = page => dialog(page).locator("[data-study-tool-id]");
async function openTool(page, id = "support-audio") {
  await toolsLauncher(page).click();
  if (await toolsLauncher(page).getAttribute("data-study-tool-id") === "") {
    await page.getByRole("dialog", { name: "Ferramentas", exact: true }).locator(`[data-open-study-tool="${id}"]`).click();
  }
}

test("ferramentas da explicação abrem áudio nos três idiomas, cancelam e devolvem o foco", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mountTools(page);
  const content = dialog(page).locator("[data-review-explanation-content]");
  await expect(content).not.toContainText("Preparando áudio");
  await expect(content.locator(".package-audio-tool, .package-calculator")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.configurationReads)).toEqual([]);
  await openTool(page);
  const audio = audioDialog(page);
  await expect(audio.locator("[data-audio-configuration-status]")).toBeEmpty();
  await expect(audio.locator('[data-audio-action="play"]')).toHaveCount(3);
  for (const play of await audio.locator('[data-audio-action="play"]').all()) await expect(play).toBeEnabled();
  for (const consent of await audio.locator(".package-audio-remote-consent").all()) await expect(consent).toBeHidden();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.voiceReads)).toBe(0);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    const box = await audio.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: info.outputPath(`explanation-audio-tools-${width}.png`), fullPage: true });
  }
  for (const id of ["pt", "ja", "zh"]) {
    const row = audio.locator(`[data-audio-track="${id}"]`);
    await row.locator('[data-audio-action="play"]').click();
    await expect(row.locator('[data-audio-action="play"]')).toHaveAttribute("aria-label", /^Pausar /u);
    await expect(row.locator("[data-audio-track-status]")).toBeEmpty();
  }
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.spoke)).toEqual([
    { text: "Bom dia.", lang: "pt-BR", rate: 1.25, voice: "synthetic-pt-BR" },
    { text: "おはようございます。", lang: "ja-JP", rate: 1.25, voice: "synthetic-ja-JP" },
    { text: "早安。", lang: "zh-TW", rate: 1.25, voice: "synthetic-zh-TW" }
  ]);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.configurationReads)).toEqual([
    { courseId: await page.evaluate(() => globalThis.__reviewFixture.probe.audio.courseId), expectedRevision: 7, mode: "configuration" }
  ]);
  await page.keyboard.press("Escape");
  await expect(audio).toHaveCount(0); await expect(dialog(page)).toBeVisible(); await expect(toolsLauncher(page)).toBeFocused();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.cancellations)).toBe(3);
  await openTool(page, "support-calculator");
  const calculator = page.getByRole("dialog", { name: "Calculadora", exact: true });
  await calculator.getByRole("textbox", { name: "Expressão", exact: true }).fill("sqrt(9) + 2");
  await calculator.getByRole("button", { name: "Calcular", exact: true }).click();
  await expect(calculator.locator("output")).toHaveText("5");
  await calculator.getByRole("button", { name: "Fechar ferramenta", exact: true }).click();
  await expect(toolsLauncher(page)).toBeFocused();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("áudio da explicação recupera configuração indisponível e rejeita revisão divergente", async ({ page }) => {
  const errors = await mountTools(page, { configFailures: 1, calculator: false });
  await expect(toolsLauncher(page)).toHaveAccessibleName("Áudio");
  await openTool(page);
  const audio = audioDialog(page);
  const play = audio.locator('[data-audio-track="pt"] [data-audio-action="play"]');
  await expect(audio.locator("[data-audio-configuration-status]")).toContainText("Não foi possível consultar");
  await expect(play).toBeDisabled();
  await audio.getByRole("button", { name: "Consultar configuração novamente", exact: true }).click();
  await expect(play).toBeEnabled(); await play.click();
  await expect.poll(() => page.evaluate(() => globalThis.__reviewFixture.probe.audio.spoke.length)).toBe(1);
  await audio.getByRole("button", { name: "Fechar ferramenta", exact: true }).click();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.audio.configurationRevision = 8; });
  await openTool(page);
  await expect(audio.locator("[data-audio-configuration-status]")).toContainText("Não foi possível consultar");
  await expect(play).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.configurationReads.map(read => read.expectedRevision))).toEqual([7, 7, 7]);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.spoke.length)).toBe(1);
  expect(errors).toEqual([]);
});

test("áudio da explicação descarta catálogo tardio e fecha reprodução com a inspeção", async ({ page }) => {
  const errors = await mountTools(page, { lateVoices: true });
  await openTool(page);
  const audio = audioDialog(page);
  await audio.locator('[data-audio-track="pt"] [data-audio-action="play"]').click();
  await expect(audio.locator('[data-audio-track="pt"] [data-audio-track-status]')).toHaveText("Carregando…");
  await page.keyboard.press("Escape"); await expect(toolsLauncher(page)).toBeFocused();
  await page.evaluate(() => globalThis.__reviewFixture.probe.audio.publishVoices());
  await openTool(page);
  await audio.locator('[data-audio-track="ja"] [data-audio-action="play"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.__reviewFixture.probe.audio.spoke.map(value => value.lang))).toEqual(["ja-JP"]);
  await page.evaluate(() => globalThis.__reviewFixture.ui.close());
  await expect(audio).toHaveCount(0); await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inspecionar Explicação", exact: true })).toBeFocused();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.cancellations)).toBe(1);
  expect(errors).toEqual([]);
});

test("áudio da explicação ignora configuração encerrada e usa o novo snapshot ao reabrir", async ({ page }) => {
  const errors = await mountTools(page, { deferConfiguration: true });
  await openTool(page);
  await expect(audioDialog(page).locator("[data-audio-configuration-status]")).toHaveText("Consultando configuração de áudio…");
  await expect.poll(() => page.evaluate(() => typeof globalThis.__reviewFixture.probe.audio.finishConfiguration)).toBe("function");
  await page.evaluate(() => {
    const { probe, ui } = globalThis.__reviewFixture;
    ui.close(); probe.revision = 8; probe.audio.deferConfiguration = false; probe.audio.finishConfiguration();
  });
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  await expect(dialog(page).locator("[data-review-explanation-content]")).toBeVisible();
  await openTool(page);
  await audioDialog(page).locator('[data-audio-track="zh"] [data-audio-action="play"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.__reviewFixture.probe.audio.spoke.map(value => value.lang))).toEqual(["zh-TW"]);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.configurationReads.map(read => read.expectedRevision))).toEqual([7, 8]);
  expect(errors).toEqual([]);
});

test("edição da explicação preserva os campos de áudio e desativa o launcher até salvar", async ({ page }) => {
  const errors = await mountTools(page);
  await dialog(page).getByRole("button", { name: "Editar explicação", exact: true }).click();
  await expect(toolsLauncher(page)).toBeDisabled();
  const content = dialog(page).locator("[data-review-explanation-content]");
  const text = content.locator('[data-review-edit-target="content:support-audio"] [data-manual-edit-path="tracks[0].text"]');
  await expect(text).toBeEditable(); await text.fill("Boa tarde.");
  await expect(content.locator('[data-review-edit-target="content:support-calculator"] [data-manual-edit-path="title"]')).toBeEditable();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.configurationReads)).toEqual([]);
  await dialog(page).getByRole("button", { name: "Salvar explicação", exact: true }).click();
  await expect(dialog(page).locator("[data-review-status]")).toContainText("Explicação salva");
  await expect(toolsLauncher(page)).toBeEnabled();
  await expect(content.locator(".package-audio-tool, .package-calculator")).toHaveCount(0);
  await openTool(page);
  await audioDialog(page).locator('[data-audio-track="pt"] [data-audio-action="play"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.__reviewFixture.probe.audio.spoke.map(value => value.text))).toEqual(["Boa tarde."]);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.audio.configurationReads.map(read => read.expectedRevision))).toEqual([8]);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(call => call.kind))).toEqual(["save"]);
  expect(errors).toEqual([]);
});

test("arquivo de áudio da explicação usa alvo e revisão inspecionados e libera o player ao fechar", async ({ page }) => {
  const errors = await mountTools(page, { file: true });
  const fetched = [];
  await page.route("**/storage/v1/object/sign/course-media/**", async route => {
    fetched.push(route.request().url());
    const bytes = await page.evaluate(() => globalThis.__reviewFixture.probe.audio.fileBytes);
    await route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from(bytes) });
  });
  await page.evaluate(() => { globalThis.__reviewFixture.probe.revision = 8; });
  await openTool(page);
  const row = audioDialog(page).locator('[data-audio-track="file"]');
  await row.locator('[data-audio-action="play"]').click();
  await expect(row.locator("[data-audio-progress]")).toBeVisible();
  await expect.poll(() => row.locator("audio").evaluate(node => node.readyState)).toBeGreaterThanOrEqual(2);
  expect(await row.locator("audio").evaluate(node => ({ duration: node.duration, playbackRate: node.playbackRate, error: node.error })))
    .toEqual({ duration: 0.5, playbackRate: 1.25, error: null });
  const audio = await page.evaluate(() => {
    const { audio } = globalThis.__reviewFixture.probe;
    return { courseId: audio.courseId, microsequenceId: audio.microsequenceId, media: audio.fileMedia, downloads: audio.downloads };
  });
  expect(audio.downloads).toEqual([{ courseId: audio.courseId, expectedRevision: 7,
    targetKind: "microsequence_explanation", targetId: audio.microsequenceId, contentHash: audio.media.contentHash }]);
  expect(fetched).toHaveLength(1);
  const player = await row.locator("audio").elementHandle();
  await audioDialog(page).getByRole("button", { name: "Fechar ferramenta", exact: true }).click();
  expect(await player.evaluate(node => ({ paused: node.paused, src: node.getAttribute("src"), hidden: node.hidden })))
    .toEqual({ paused: true, src: null, hidden: true });
  await expect(toolsLauncher(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("citação acompanha a última palavra na quebra de linha e não altera o texto editável", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page);
  for (const marked of [false, true]) {
    const original = `Um socket é a interface local usada pelo ${marked ? "**processo.**" : "processo."}`;
    if (marked) {
      await page.getByRole("button", { name: "Fechar inspeção da explicação", exact: true }).click();
      await page.evaluate(text => { globalThis.__reviewFixture.probe.explanationText = text; }, original);
      await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
    }
    await page.evaluate(() => document.fonts.ready);
    const wrapping = await page.locator('[data-review-explanation-content] .runtime-paragraph-block p').first().evaluate(paragraph => {
      const group = paragraph.querySelector('.source-marker-group');
      const marker = group.querySelector('button');
      const prefixNode = group.firstChild?.nodeType === Node.TEXT_NODE ? group.firstChild : null;
      const prefix = prefixNode?.data || '';
      if (prefixNode) prefixNode.data = '';
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let lastText;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement.closest('.source-marker-group') && node.data.endsWith('processo.')) lastText = node;
      }
      const range = document.createRange();
      range.setStart(lastText, lastText.data.length - 'processo.'.length);
      range.setEnd(lastText, lastText.data.length);
      const measure = () => {
        const word = range.getBoundingClientRect(); const number = marker.getBoundingClientRect();
        return { wordTop: word.top, wordBottom: word.bottom, markerTop: number.top, markerBottom: number.bottom };
      };
      let legacy = null;
      let width;
      const maxWidth = Math.floor(paragraph.getBoundingClientRect().width);
      for (width = 130; width <= maxWidth; width += 1) {
        paragraph.style.width = `${width}px`;
        const bounds = measure();
        if (bounds.markerTop >= bounds.wordBottom) { legacy = bounds; break; }
      }
      if (prefixNode) prefixNode.data = prefix;
      return { width, legacy, actual: measure() };
    });
    expect(wrapping.legacy, "A largura de prova deve reproduzir o expoente órfão anterior.").not.toBeNull();
    expect(wrapping.actual.markerTop).toBeLessThan(wrapping.actual.wordBottom);
    expect(wrapping.actual.markerBottom).toBeGreaterThan(wrapping.actual.wordTop);
    await page.screenshot({ path: info.outputPath(`citation-word-wrap-${marked ? 'strong' : 'plain'}-390.png`) });
    await page.getByRole("button", { name: "Editar explicação", exact: true }).click();
    const field = page.locator('[data-review-explanation-content] [data-manual-edit-path="text"]').first();
    await expect(field).toBeEditable();
    expect(await field.evaluate(async node => {
      const { serializeManualEditableNode } = await import('/src/ui/manualInlineFields.js');
      return serializeManualEditableNode(node).replace(/\n+$/u, '');
    })).toBe(original);
    await page.getByRole("button", { name: "Cancelar edição", exact: true }).click();
  }
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});
const confirm = page => page.getByRole("checkbox", { name: "Revisei esta versão e suas fontes." });
async function openReview(page) {
  const access = page.locator("summary[data-review-context=review]");
  if (await access.locator("..").getAttribute("open") === null) await access.click();
}
async function contextRow(page) {
  return page.locator(".course-review-authoring-panels").evaluate(container => {
    const origin = container.getBoundingClientRect();
    return [...container.querySelectorAll(":scope > details > summary")].map(summary => {
      const box = summary.getBoundingClientRect();
      return { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height };
    });
  });
}
async function expectContextRow(page, initial) {
  const current = await contextRow(page);
  expect(current).toHaveLength(2);
  for (const [index, box] of current.entries()) {
    expect(Math.abs(box.y - current[0].y)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - initial[index].y)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.x - initial[index].x)).toBeLessThanOrEqual(1);
  }
  const bounds = await page.locator(".course-review-authoring-panels").boundingBox();
  for (const panel of await page.locator(".course-review-authoring-panels > details[open] > :not(summary)").all()) {
    const box = await panel.boundingBox();
    expect(box).not.toBeNull(); expect(Math.abs(box.width - bounds.width)).toBeLessThanOrEqual(1);
    expect(box.y).toBeGreaterThanOrEqual(bounds.y + current[0].height);
  }
}
async function expectObservationIcon(button, peer) {
  const box = await button.boundingBox();
  const icon = await button.locator(":scope > svg").boundingBox();
  const other = await peer.locator(":scope > svg").boundingBox();
  expect(box.width).toBe(44); expect(box.height).toBe(44);
  expect(Math.abs(icon.x + icon.width / 2 - box.x - box.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(icon.y + icon.height / 2 - other.y - other.height / 2)).toBeLessThanOrEqual(1);
}

for (const width of [360, 1280]) test(`contexto autoral e ações ficam separados da base longa em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 });
  const errors = await mount(page);
  await page.getByRole("button", { name: "Fechar inspeção da explicação", exact: true }).click();
  await page.evaluate(() => {
    globalThis.__reviewFixture.probe.explanationText = "Um socket é a interface local usada pelo processo.\n\n".repeat(30);
  });
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  const context = dialog(page).getByRole("region", { name: "Contexto autoral", exact: true });
  const base = dialog(page).getByRole("region", { name: "Base explicativa", exact: true });
  const tools = base.locator(".course-explanation-tools");
  const content = base.locator("[data-review-explanation-content]");
  await expect(context).toContainText("Interfaces");
  await expect(context).not.toContainText("Versão do curso");
  await expect(context).not.toContainText("Revisão autoral");
  await expect(dialog(page).locator('[data-review-context="review"]')).toHaveAccessibleName("Revisão autoral do conteúdo");
  await expect(dialog(page).locator('[data-review-context="review"]')).toHaveAttribute("title", "Revisão autoral pendente");
  await expect(context.locator("[contenteditable], [data-review-edit-target]")).toHaveCount(0);
  await expect(tools.getByRole("button", { name: "Fontes da explicação", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: "Editar explicação", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: /^Observações autorais do curso/u })).toBeVisible();
  await expect(dialog(page).locator(":scope > .editor-head button")).toHaveCount(1);
  await expect(dialog(page).getByText("Debater com GPT", { exact: true })).toHaveCount(0);
  await expect(dialog(page).locator("[data-review-context=units], [data-review-unit-context]")).toHaveCount(0);
  await expect(dialog(page)).not.toContainText("O processo usa uma interface; a conexão relaciona participantes.");
  await expect(dialog(page).locator("[data-review-context=review]")).toHaveText("");
  await expect(dialog(page).locator("details.course-inspection-evidence > summary")).toHaveText("");
  const contextBox = await context.boundingBox();
  const toolbarBox = await tools.boundingBox();
  const contentBox = await content.boundingBox();
  const scrollBox = await dialog(page).locator(":scope > .editor-body").boundingBox();
  expect(contextBox.height).toBeLessThanOrEqual(80);
  await expect(context.getByText("Versão do curso", { exact: true })).not.toBeVisible();
  expect(contextBox.y + contextBox.height).toBeLessThanOrEqual(toolbarBox.y);
  expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(contentBox.y);
  expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(scrollBox.y + scrollBox.height);
  expect(contentBox.height).toBeGreaterThan(scrollBox.height);
  const standardWidth = await page.evaluate(() => {
    const shell = document.createElement("div"); shell.className = "app-shell";
    document.body.append(shell); const width = shell.getBoundingClientRect().width; shell.remove(); return width;
  });
  expect((await dialog(page).boundingBox()).width).toBe(standardWidth);
  for (const button of await tools.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(base.getByRole("heading", { name: "Referências da explicação", exact: true })).toBeAttached();
  await page.screenshot({ path: info.outputPath(`explanation-authoring-context-${width}.png`), fullPage: true });
  await tools.getByRole("button", { name: "Editar explicação", exact: true }).click();
  await expect(tools.getByRole("button", { name: "Salvar explicação", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: "Cancelar edição", exact: true })).toBeVisible();
  expect(Math.abs((await content.boundingBox()).y - contentBox.y)).toBeLessThanOrEqual(1);
  await tools.getByRole("button", { name: "Cancelar edição", exact: true }).click();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("Autoria navega da ocorrência à bibliografia e resolve PDF por clique no snapshot inspecionado", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 }); const errors = await mount(page);
  await page.getByRole("button", { name: "Fechar inspeção da explicação", exact: true }).click();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.withPdf = true; });
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  const base = dialog(page).locator(".course-explanation-context");
  const marker = base.getByRole("button", { name: "Referência 1", exact: true });
  await expect(marker).toBeVisible();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.pdfReads)).toEqual([]);
  await marker.tap();
  const reference = base.locator('[data-citation-reference-id="link-support-text"]');
  await expect(reference).toBeFocused();
  await expect(reference.getByRole("link", { name: "Endereço de Obra sintética sobre interfaces", exact: true })).toHaveAttribute("href", "https://example.test/reference");
  const pdf = reference.locator("button[data-action=download-citation-attachment]").first();
  expect(await pdf.evaluate(node => {
    const style = getComputedStyle(node); const prose = getComputedStyle(node.closest(".study-citation-reference"));
    return { padding: style.padding, margin: style.margin, border: style.borderWidth,
      fontSize: style.fontSize === prose.fontSize, lineHeight: style.lineHeight === prose.lineHeight };
  })).toEqual({ padding: "0px", margin: "0px", border: "0px", fontSize: true, lineHeight: true });
  await pdf.tap();
  await expect.poll(() => page.evaluate(() => globalThis.__reviewFixture.probe.openedSources.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.openedSources[0])).toBe("https://example.test/author-source.pdf?token=synthetic-1#page=12");
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.pdfReads[0])).toMatchObject({
    expectedCourseRevision: 7, sourceId: "source-review", sourceRevision: 1, contentHash: "a".repeat(64) });
  await reference.getByRole("button", { name: "Voltar ao trecho 1 da referência 1 na explicação", exact: true }).tap();
  await expect(marker).toBeFocused();
  await page.screenshot({ path: info.outputPath("authoring-citations-390.png") });
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});
for (const width of [360, 390, 430, 1280]) test(`inspeção completa e decisão explícita em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 }); const errors = await mount(page);
  const initialRow = await contextRow(page);
  await openReview(page);
  await expectContextRow(page, initialRow);
  const approve = page.getByRole("button", { name: "Marcar como revisado", exact: true });
  await expect(approve).toBeDisabled();
  await expect(dialog(page).locator('[aria-label="Revisão humana do conteúdo"]')).toContainText(
    "Base explicativa · Interfaces");
  await expect(dialog(page)).toContainText("Um socket é a interface local");
  await expect(dialog(page).locator("[data-review-unit-context]")).toHaveCount(0);
  await expect(dialog(page).getByRole("img", { name: "Revisão autoral pendente", exact: true })).toBeVisible();
  await page.locator("summary[data-review-context=metadata]").click();
  await expect(dialog(page)).toContainText("Distinguir interface e conexão.");
  await expect(dialog(page)).not.toContainText("Proposta da explicação não registrada.");
  await page.screenshot({ path: info.outputPath(`explanation-context-${width}.png`) });
  await page.locator("summary[aria-label='Configuração solicitada e aplicada']").click();
  await expect(dialog(page).locator(".course-analytics-inspection-panel").getByText("Aplicado", { exact: true })).toBeVisible();
  await expectContextRow(page, initialRow);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  const box = await dialog(page).boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  await openReview(page); await confirm(page).check(); await expect(approve).toBeEnabled();
  await expectContextRow(page, initialRow);
  await expect(dialog(page).locator("details.course-inspection-evidence")).toHaveAttribute("open", "");
  await page.screenshot({ path: info.outputPath(`review-${width}.png`), fullPage: true });
  await approve.click(); await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada para este objeto");
  await expect(dialog(page).getByRole("img", { name: "Revisão autoral atual", exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.length)).toBe(1);
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inspecionar Explicação", exact: true })).toBeFocused(); expect(errors).toEqual([]);
});
test("edição no renderer real preserva geometria sem mudança; salvar registra intervenção separada", async ({ page }, info) => {
  const errors = await mount(page);
  const content = page.locator("[data-review-explanation-content]");
  const before = await content.boundingBox();
  await page.getByRole("button", { name: "Editar explicação", exact: true }).click();
  const field = content.locator('[data-manual-edit-path="text"]').first();
  await expect(field).toHaveAttribute("contenteditable", "plaintext-only"); await expect(field).toBeFocused();
  const editingBox = await content.boundingBox();
  expect(Math.abs(editingBox.height - before.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(editingBox.y - before.y)).toBeLessThanOrEqual(1);
  await expect(page.locator("textarea[data-review-field]")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancelar edição", exact: true }).click();
  const unchanged = await content.boundingBox();
  expect(Math.abs(unchanged.height - before.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(unchanged.y - before.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Editar explicação", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Editar explicação", exact: true }).click();
  await field.fill("A interface local não é a conexão inteira.");
  await page.keyboard.press("Escape"); await expect(dialog(page)).toBeVisible();
  await expect(field).toHaveText("A interface local não é a conexão inteira."); await expect(field).toBeFocused();
  await page.screenshot({ path: info.outputPath("explanation-inline-edit.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  await expect(dialog(page)).toContainText("Um socket é a interface local");
  await page.getByRole("button", { name: "Editar explicação", exact: true }).click();
  await field.fill("A interface local não é a conexão inteira.");
  await page.getByRole("button", { name: "Salvar explicação", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("O salvamento não declara revisão autoral");
  await expect(dialog(page)).toContainText("A interface local não é a conexão inteira.");
  await openReview(page);
  await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => value.kind))).toEqual(["save"]); expect(errors).toEqual([]);
});
test("revisão incerta conserva identidade e bloqueia nova escrita", async ({ page }) => {
  const errors = await mount(page); await page.evaluate(() => { globalThis.__reviewFixture.probe.uncertain = true; });
  await openReview(page); await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Não foi possível confirmar a revisão");
  await page.keyboard.press("Escape"); await expect(dialog(page)).toBeVisible();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.uncertain = false; });
  await page.getByRole("button", { name: "Confirmar resultado da mesma decisão" }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada para este objeto");
  const calls = await page.evaluate(() => globalThis.__reviewFixture.probe.calls); expect(calls).toHaveLength(2);
  expect(calls[1].request).toEqual(calls[0].request); expect(errors).toEqual([]);
});
test("fontes recebem o alvo da Explicação e encerram a inspeção sem modal empilhado", async ({ page }) => {
  const errors = await mount(page); await page.getByRole("button", { name: "Fontes da explicação", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  const target = await page.evaluate(() => globalThis.__reviewFixture.probe.sources);
  expect(target.targetKind).toBe("microsequence_explanation"); expect(target.targetId).toBe("micro-review");
  expect(target.targetVersion).toBe(2); expect(target.targetExplanation.content).toHaveLength(1); expect(errors).toEqual([]);
});

test("marca e retirada da base preservam revisão compacta e reversível da unidade", async ({ page }, info) => {
  const errors = await mount(page);
  await openReview(page); await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada");
  await page.getByRole("button", { name: "Retirar marca de revisão", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Marca de revisão retirada deste objeto");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Revisar unidade", exact: true }).click();
  const unitDialog = page.getByRole("dialog", { name: "Revisão da unidade de estudo" });
  await expect(unitDialog.getByRole("heading", { name: "Revisão da unidade", exact: true })).toBeVisible();
  await expect(unitDialog.locator('[aria-label="Revisão humana do conteúdo"]')).toContainText("Unidade · Interface local");
  await expect(unitDialog.locator(".package-instance, [data-review-explanation-content], [data-review-observation-queue], [data-review-unit-sources]")).toHaveCount(0);
  await expect(unitDialog).not.toContainText("O processo usa uma interface; a conexão relaciona participantes.");
  await expect(unitDialog).not.toContainText("Um socket é a interface local usada pelo processo.");
  expect((await unitDialog.boundingBox()).height).toBeLessThan(page.viewportSize().height * 0.65);
  await expect(page.getByRole("button", { name: "Retirar marca de revisão", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeDisabled();
  await confirm(page).check();
  await page.screenshot({ path: info.outputPath("unit-review-compact.png") });
  await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada");
  await page.getByRole("button", { name: "Retirar marca de revisão", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Marca de revisão retirada deste objeto");
  const calls = await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => value.request));
  expect(calls.map(value => [value.targetKind, value.targetId, value.reviewed])).toEqual([
    ["microsequence_explanation", "micro-review", true], ["microsequence_explanation", "micro-review", false],
    ["study_unit", "unit-theory", true], ["study_unit", "unit-theory", false]
  ]);
  expect(new Set(calls.map(value => value.requestId)).size).toBe(4);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Revisar unidade", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
test("revisão desatualizada identifica a versão sem aplicar uma nova marca", async ({ page }) => {
  const errors = await mount(page);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    globalThis.__reviewFixture.probe.reviews["microsequence_explanation:micro-review"] = {
      state: "stale", reviewedAt: "2026-09-09T12:00:00Z"
    };
  });
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  await openReview(page);
  await expect(dialog(page).getByRole("img", { name: "Revisão autoral desatualizada", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retirar marca de revisão", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("fontes da explicação abrem o alvo salvo e conservam retorno contextual e foco", async ({ page }) => {
  const errors = await mount(page);
  await expect(page.getByRole("button", { name: "Fechar inspeção da explicação" })).toBeFocused();
  await expect(dialog(page).getByRole("heading", { name: "Referências da explicação", exact: true })).toBeAttached();
  await expect(dialog(page).locator("[data-review-unit-context]")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  await openReview(page); await confirm(page).check(); await expect(confirm(page)).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Fontes da explicação", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  const target = await page.evaluate(() => globalThis.__reviewFixture.probe.sources);
  expect(target.targetKind).toBe("microsequence_explanation"); expect(target.targetId).toBe("micro-review"); expect(target.targetVersion).toBe(2);
  expect(target.targetExplanation.content[0].data.text).toContain("Um socket é a interface local");
  await expect(page.getByRole("button", { name: "Inspecionar Explicação", exact: true })).toBeFocused(); expect(errors).toEqual([]);
});

test("fila da Explicação acumula, reabre, edita versão e reflete consumo sem declarar revisão", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 }); const errors = await mount(page);
  const trigger = page.getByRole("button", { name: /^Observações autorais do curso/u });
  await expect(trigger).toHaveAccessibleName("Observações autorais do curso, 0 pendentes");
  await expect(trigger.locator(".course-authoring-observation-count")).toHaveCount(0);
  await expectObservationIcon(trigger, page.getByRole("button", { name: "Editar explicação", exact: true }));
  await trigger.click();
  const textbox = page.locator("[data-field='study-unit-observation']");
  const add = page.getByRole("button", { name: "Enviar observação", exact: true });
  await textbox.fill("Explicitar o pressuposto do exemplo."); await add.click();
  await expect(page.locator(".study-observation-item")).toHaveCount(1);
  await textbox.fill("Relacionar o argumento à fonte."); await add.click();
  await expect(page.locator(".study-observation-item")).toHaveCount(2);
  await expect(trigger).toHaveAccessibleName("Observações autorais do curso, 2 pendentes");
  await expect(trigger.locator(".course-authoring-observation-count")).toHaveText("2");
  await expectObservationIcon(trigger, page.getByRole("button", { name: "Editar explicação", exact: true }));
  await page.getByRole("button", { name: "Editar observação", exact: true }).first().click();
  await textbox.fill("Explicitar o pressuposto e seu limite.");
  await page.getByRole("button", { name: "Salvar edição", exact: true }).click();
  await expect(page.locator('[data-observation-version="2"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("explanation-observation-queue-390.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(1);
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click(); await trigger.click();
  await expect(page.locator(".study-observation-item")).toHaveCount(2);
  await expect(page.getByText("Explicitar o pressuposto e seu limite.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  await page.evaluate(() => { globalThis.__reviewFixture.probe.observations[0].state = "resolved"; });
  await page.getByRole("button", { name: "Atualizar central", exact: true }).click();
  await expect(page.locator(".study-observation-item")).toHaveCount(1);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.observationWrites.map(value => value.command.type)))
    .toEqual(["create_anchored_annotation", "create_anchored_annotation", "revise_anchored_annotation"]);
  expect(errors).toEqual([]);
});

test("badge da unidade preserva ícone centralizado com zero e com observações pendentes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page);
  await page.getByRole("button", { name: "Fechar inspeção da explicação", exact: true }).click();
  await page.evaluate(async () => {
    const { createCourseInspectionSequence } = await import("/src/ui/CourseInspectionSequence.js");
    const { controller, probe } = globalThis.__reviewFixture;
    const document = (await controller.exportCourseAuthoring()).artifact.document;
    const course = document.courses[0], module = course.modules[0], lesson = module.lessons[0], micro = lesson.microsequences[0];
    const state = { count: 0 };
    controller.loadAuthoringStudyUnits = async (_courseId, options) => ({
      contract: "aralearn.course-study-unit-inspection-page.v2", courseId: course.id, courseRevision: probe.revision,
      scope: options.scope, totalCount: 1, scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 1 },
      items: [{ studyUnit: micro.studyUnits[0], version: 1, updatedAt: "2026-09-11T12:00:00Z", ordinal: 1,
        curriculumPath: { module: { id: module.id, position: 0, title: module.title },
          lesson: { id: lesson.id, position: 0, title: lesson.title },
          didacticMicrosequence: { id: micro.id, position: 0, title: micro.title } },
        authoringPart: null, authorship: { createdOrigin: "ai", lastRevisionOrigin: "ai", design: { application: null } },
        pendingAuthoringObservationCount: state.count,
        deepLink: `#/authoring/courses/${course.id}?section=content&studyUnitId=${micro.studyUnits[0].id}` }],
      hasPrevious: false, hasMore: false, previousCursor: null, nextCursor: null, pageBytes: 2048,
      offline: false, stale: false, offlineKnown: false, readFailure: null
    });
    window.document.querySelector("#app-root").style.display = "block";
    const inspectionRoot = window.document.querySelector("#inspection-root");
    inspectionRoot.className = "app-shell course-authoring-root";
    const sequence = createCourseInspectionSequence({ root: inspectionRoot, controller,
      course: { courseId: course.id, revision: probe.revision, ownership: "owned", canEdit: true },
      onOpenParameters() {}, onEditContent() {}, onSaveManualEdit() {} });
    globalThis.__unitBadgeFixture = { state, sequence, revision: probe.revision };
    await sequence.open();
  });
  const trigger = page.locator("[data-inspection-observations]");
  const peer = page.locator("[data-inspection-open-parameters]").first();
  await expect(trigger).toHaveAccessibleName("Observações autorais do curso, 0 pendentes");
  await expect(trigger.locator(".course-inspection-observation-count")).toHaveCount(0);
  await expectObservationIcon(trigger, peer);
  await page.evaluate(async () => {
    const fixture = globalThis.__unitBadgeFixture; fixture.state.count = 2; await fixture.sequence.refresh(fixture.revision);
  });
  await expect(trigger).toHaveAccessibleName("Observações autorais do curso, 2 pendentes");
  await expect(trigger.locator(".course-inspection-observation-count")).toHaveText("2");
  await expectObservationIcon(trigger, peer);
  await trigger.focus(); await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("title", "Observações autorais pendentes");
  expect(errors).toEqual([]);
});

test("fila preserva rascunho em resposta tardia e reconcilia envio perdido sem repetir", async ({ page }) => {
  const errors = await mount(page);
  const trigger = page.getByRole("button", { name: /^Observações autorais do curso/u });
  await trigger.click();
  const textbox = page.locator("[data-field='study-unit-observation']");
  await page.evaluate(() => { globalThis.__reviewFixture.probe.delayObservationRead = true; });
  await page.getByRole("button", { name: "Atualizar central", exact: true }).click();
  await textbox.fill("Rascunho durante atualização.");
  await page.evaluate(() => {
    const probe = globalThis.__reviewFixture.probe; probe.delayObservationRead = false; probe.finishObservationRead();
  });
  await expect(textbox).toHaveValue("Rascunho durante atualização."); await expect(textbox).toBeFocused();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.observationLostResponse = true; });
  await page.getByRole("button", { name: "Enviar observação", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível confirmar o envio");
  await expect(textbox).toHaveValue("Rascunho durante atualização.");
  await page.getByRole("button", { name: "Retomar envio pendente", exact: true }).click();
  await expect(page.locator(".study-observation-item")).toHaveCount(1);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.observationWrites.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("central mantém identidade multialvo, seleção na atualização e decisão parcial explícita", async ({ page }, info) => {
  await page.setViewportSize({width: 390, height: 850}); const errors = await mount(page);
  await page.getByRole('button', {name: /^Observações autorais do curso/u}).click();
  const central = page.getByRole('dialog', {name: 'Observações do curso', exact: true});
  await central.getByLabel('Alvos da nova observação', {exact: true}).selectOption(['microsequence_explanation:micro-review', 'study_unit:unit-theory']);
  await central.getByRole('textbox', {name: 'Observação', exact: true}).fill('Aproximar a explicação do exemplo.');
  await central.getByRole('button', {name: 'Enviar observação', exact: true}).click();
  const item = central.locator('.study-observation-item'); await expect(item).toHaveCount(1);
  await expect(item.locator('[data-observation-target-select]')).toHaveCount(2);
  await item.getByRole('checkbox', {name: 'Selecionar observação', exact: true}).check();
  await item.locator('input[data-observation-target-key="study_unit:unit-theory"]').uncheck();
  await central.getByRole('button', {name: 'Atualizar central', exact: true}).click();
  await expect(item.locator('input[data-observation-target-key="study_unit:unit-theory"]')).not.toBeChecked();
  await expect(item.getByRole('checkbox', {name: 'Selecionar observação', exact: true})).toBeChecked();
  await item.getByText('Comparar antes e vigente', {exact: true}).first().click();
  await item.getByRole('button', {name: 'Carregar comparação deste alvo', exact: true}).first().click();
  await expect(item.getByRole('heading', {name: 'Antes', exact: true}).first()).toBeVisible();
  await page.screenshot({path: info.outputPath('observation-before-current-390.png')});
  await central.getByRole('button', {name: 'Aprovar selecionadas', exact: true}).click();
  await expect(item).toContainText('Aprovado');
  await expect(item.locator('[data-observation-target-select]:not([disabled])')).toHaveCount(1);
  await expect(central.locator('[data-observation-filter-count]')).toHaveText('1 apresentadas · 1 pendentes no curso');
  await item.locator('input[data-observation-target-key="study_unit:unit-theory"]').check();
  await central.locator('[data-observation-cancel-reason]').selectOption('keep_current');
  await item.getByRole('button', {name: 'Encerrar sem alteração', exact: true}).click();
  await expect(item).toHaveCount(0);
  const result = await page.evaluate(() => ({entries: globalThis.__reviewFixture.probe.observations, writes: globalThis.__reviewFixture.probe.observationWrites, contentWrites: globalThis.__reviewFixture.probe.calls}));
  expect(result.entries).toHaveLength(1); expect(result.entries[0].state).toBe('resolved');
  expect(result.entries[0].targets.map(target => target.state)).toEqual(['approved', 'cancelled']);
  expect(result.writes.map(write => write.command.type)).toEqual(['create_anchored_annotation', 'decide_anchored_annotation', 'decide_anchored_annotation']);
  expect(result.contentWrites).toEqual([]); expect(errors).toEqual([]);
});

test("Conteúdo abre Explicação salva sem unidades e retorna ao objeto vazio", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 }); const errors = await mount(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Conteúdo sem unidades", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nenhuma unidade de estudo materializada" })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Explicação de Interfaces", exact: true });
  // A rota da microssequência vazia abre sua explicação salva diretamente.
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(1);
  await expect(trigger).toBeAttached();
  await expect(dialog(page)).toContainText("Um socket é a interface local");
  await expect(dialog(page).locator("[data-review-context=units], [data-review-unit-context]")).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: "Editar explicação", exact: true })).toBeVisible();
  await openReview(page); await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada para este objeto");
  await page.screenshot({ path: info.outputPath("explanation-before-units.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click(); await expect(dialog(page)).toBeVisible();
  await page.getByRole("button", { name: "Fechar inspeção da explicação", exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => [value.kind, value.request.targetKind])))
    .toEqual([["review", "microsequence_explanation"]]);
  expect(errors).toEqual([]);
});
