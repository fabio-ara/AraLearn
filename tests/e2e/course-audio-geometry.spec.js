import { test, expect } from "@playwright/test";

async function mount(page, theme) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async theme => {
    document.documentElement.dataset.colorMode = theme;
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"><main class="course-authoring-root"><div id="audio-probe"></div></main></div></div>';
    const { createCourseAudioPanel } = await import("/src/ui/CourseAudioPanel.js");
    const { createDefaultCourseAudioConfig, COURSE_MEDIA_COURSE_MAX_BYTES } = await import("/src/domain/courseMedia.js");
    const courseId = "e3060000-0000-4000-8000-000000000010";
    let revision = 1, config = createDefaultCourseAudioConfig();
    config.service = { providerId: "gemini", model: "gemini-2.5-flash-preview-tts", voice: "Kore" };
    window.audioProbe = { long: false, fail: false, writes: [] };
    const controller = {
      async loadCourseMedia() {
        return { contract: "aralearn.course-media.v1", courseId, courseRevision: revision, mode: "catalog",
          audioConfig: config, storage: { uniqueBytes: 50, maxUniqueBytes: COURSE_MEDIA_COURSE_MAX_BYTES },
          items: [{ contentHash: "a".repeat(64), byteSize: 50, mediaType: "audio/wav",
            fileName: window.audioProbe.long ? "Gravação de exemplo com título completo. ".repeat(4).trim() : "Voz.wav" }], nextCursor: null };
      },
      async mutateCourseMedia(request) {
        window.audioProbe.writes.push(request);
        if (window.audioProbe.fail) throw Object.assign(new Error("network"), { status: 503 });
        config = request.command.config;
        return { contract: "aralearn.course-media-change.v1", courseId, courseRevision: ++revision,
          requestId: request.requestId, idempotent: false, changed: true, operation: "set_audio_config", media: null, fileName: null };
      }
    };
    window.audioPanelProbe = createCourseAudioPanel({ root: document.querySelector("#audio-probe"), controller, courseId,
      courseRevision: revision, loadSpeechProvider: async () => ({ GEMINI_SPEECH_VOICES: ["Kore"] }) });
    await window.audioPanelProbe.open();
    await document.fonts.ready;
  }, theme);
}

test("Áudio mantém biblioteca, ajustes e rodapé estáveis nas oito combinações", async ({ page }, info) => {
  for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 844 });
    await mount(page, theme);
    const frame = page.locator(".course-audio-panel");
    const initial = await frame.boundingBox();
    const row = await page.locator(".course-audio-files li").boundingBox();
    await page.evaluate(async () => { window.audioProbe.long = true; await window.audioPanelProbe.refresh(1); });
    expect(await frame.boundingBox()).toEqual(initial);
    expect(await page.locator(".course-audio-files li").boundingBox()).toEqual(row);
    let sheetFrame, closeFrame, footerFrame;
    for (const label of ["Configuração", "Enviar áudio", "Gerar voz"]) {
      const trigger = frame.getByRole("button", { name: label, exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const close = dialog.getByRole("button", { name: "Fechar ajustes de áudio" });
      const currentSheet = await dialog.boundingBox(), currentClose = await close.boundingBox();
      const currentFooter = await dialog.locator("footer").boundingBox();
      if (sheetFrame) {
        expect(currentSheet).toEqual(sheetFrame);
        expect(currentClose).toEqual(closeFrame);
        expect(currentFooter).toEqual(footerFrame);
      }
      sheetFrame = currentSheet; closeFrame = currentClose; footerFrame = currentFooter;
      for (const box of await dialog.locator("button[aria-label]").evaluateAll(nodes => nodes.map(node => {
        const { width, height } = node.getBoundingClientRect(); return { width, height };
      }))) expect(box).toEqual({ width: 44, height: 44 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await close.focus();
      await page.keyboard.press("Shift+Tab");
      expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
      await page.screenshot({ path: info.outputPath(`audio-${label}-${width}-${theme}.png`) });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await frame.boundingBox()).toEqual(initial);
    }
  }
});

test("Áudio conserva rascunho, pedido incerto e posição de salvar após mensagem", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, "dark");
  const trigger = page.getByRole("button", { name: "Configuração", exact: true });
  await trigger.click();
  await page.getByLabel("Idioma padrão").fill("en-US");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.audioPanelProbe.hasPendingDraft())).toBe(true);
  await trigger.click();
  await expect(page.getByLabel("Idioma padrão")).toHaveValue("en-US");
  const save = page.getByRole("button", { name: "Salvar configuração de áudio" });
  const before = await save.boundingBox();
  await page.evaluate(() => { window.audioProbe.fail = true; });
  await save.click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await save.boundingBox()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const retry = page.getByRole("button", { name: "Confirmar operação pendente" });
  await expect(retry).toBeVisible();
  await page.evaluate(() => { window.audioProbe.fail = false; });
  await retry.click();
  await expect(page.getByRole("status")).toHaveText("Áudio atualizado.");
  await trigger.click();
  expect(await save.boundingBox()).toEqual(before);
  const writes = await page.evaluate(() => window.audioProbe.writes);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  expect(await page.evaluate(() => window.audioPanelProbe.hasPendingDraft())).toBe(false);
});
