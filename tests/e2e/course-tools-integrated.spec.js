import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const project = JSON.parse(readFileSync(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));

test("ferramentas integradas preservam card, foco e calculadora em oito combinações", async ({ page }, testInfo) => {
  await page.route("**/main.js", route => route.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async initial => {
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const { RESOURCE_PACKAGE_REGISTRY: registry } = await import("/src/resources/packages/index.js");
    const canonical = structuredClone(initial);
    const course = canonical.courses[0];
    const module = course.modules[0]; const lesson = module.lessons[0]; const micro = lesson.microsequences[0];
    const tool = (name) => ({ id: `tool-${name}`, package: `aralearn.resource.${name}`, version: "1.0.0",
      data: structuredClone(registry.get(`aralearn.resource.${name}`, "1.0.0").authoringContract.example) });
    const grammar = tool("grammar");
    grammar.data.items = [{ id: "one", label: "Primeira leitura", target: { kind: "url", url: "https://example.test/gramatica-1" } },
      { id: "two", label: "Segunda leitura", target: { kind: "url", url: "https://example.test/gramatica-2" } }];
    micro.studyUnits = [{ id: "tools-unit", position: 1, title: "Notação, escuta e consulta", role: "theory",
      content: [{ id: "lead", package: "aralearn.resource.paragraph", version: "1.0.0", data: {
        text: "Use a calculadora para comparar os resultados; escute o áudio e consulte a gramática quando necessário. ".repeat(24)
      } }, tool("calculator"), tool("audio"), grammar], response: null, feedback: [], topics: [] }];
    const path = [course.id, module.id, lesson.id, micro.id, "tools-unit"];
    document.body.innerHTML = '<main id="tools-root"></main>';
    const probe = { release: null };
    const repo = {
      loadProject: () => structuredClone(canonical), loadCourse: async () => structuredClone(course),
      loadProgress: () => ({ version: 1, lessons: {} }), loadAnnotationsForPath: () => [], loadReviewItems: () => [],
      loadRuntimeStatus: () => ({}), isStudyUnitMarkedForReview: () => false,
      loadCourseSummaries: () => [{ courseId: course.id, title: course.title, ownership: "public", canEdit: false, revision: 1 }],
      loadStudyUnitCitations: async () => { await new Promise(resolve => { probe.release = resolve; });
        return { contract: "aralearn.course-study-citations.v2", bibliographyStyle: "abnt-2025", courseId: course.id,
          courseRevision: 1, studyUnitId: "tools-unit", citations: [] }; },
      flush: async () => true
    };
    const app = createCourseStudyApplication({ root: document.querySelector("#tools-root"), initialProject: canonical,
      repository: repo, visitor: true });
    globalThis.__toolsProbe = probe;
    await app.openEntityPath(path);
    await document.fonts.ready;
  }, project);
  await expect(page.locator(".card-sheet-content .package-calculator")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Ferramentas da unidade" }).getByRole("button")).toHaveCount(3);
  const calculator = page.getByRole("button", { name: "Calculadora", exact: true });
  for (const width of [360, 390, 430, 1280]) for (const mode of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(theme => { document.documentElement.dataset.colorMode = theme; }, mode);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(mode);
    await page.locator(".card-sheet-content").evaluate(node => { node.scrollTop = 100; });
    const before = await page.locator(".card-sheet-content").evaluate(node => node.scrollTop);
    await calculator.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Calculadora", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Expressão", exact: true }).fill("2^3^2");
    await page.getByRole("button", { name: "Calcular", exact: true }).click();
    await expect(page.locator("[data-calculator-output]")).toHaveText("Resultado aproximado: 512");
    if (width === 360 && mode === "light") {
      await page.evaluate(() => globalThis.__toolsProbe.release());
      await expect(page.locator("[data-calculator-output]")).toHaveText("Resultado aproximado: 512");
    }
    expect(await page.locator(".app-shell > .screen").evaluate(node => node.inert)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const dimensions = await page.locator(".study-tool-body button, .study-tool-body input, .study-tool-body select")
      .evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    expect(dimensions.every(({ height }) => height >= 44)).toBe(true);
    if (width === 390 && mode === "dark") await page.screenshot({ path: testInfo.outputPath("calculator-390-dark.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(calculator).toBeFocused();
    expect(Math.abs(await page.locator(".card-sheet-content").evaluate(node => node.scrollTop) - before)).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Mais ferramentas", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Gramática/u }).click();
  await expect(page.getByRole("button", { name: /Primeira leitura/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Segunda leitura/u })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("grammar-1280-dark.png"), fullPage: true });
  await page.getByRole("button", { name: "Fechar ferramenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mais ferramentas", exact: true })).toBeFocused();
});

test("biblioteca conserva configuração e confirma upload perdido sem repetir geração", async ({ page }) => {
  await page.route("**/main.js", route => route.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async () => {
    const { createCourseAudioPanel } = await import("/src/ui/CourseAudioPanel.js");
    const { createDefaultCourseAudioConfig } = await import("/src/domain/courseMedia.js");
    const { wrapGeminiPcmAsWav } = await import("/src/generation/providers/geminiSpeechProvider.js");
    const id = "30300000-0000-4000-8000-000000000001";
    const probe = { writes: [], generations: 0, attempts: 0, revision: 1, config: createDefaultCourseAudioConfig(), items: [], release: null };
    const initialRead = new Promise(resolve => { probe.release = resolve; });
    document.body.innerHTML = '<main id="audio-panel-root"></main>';
    const controller = {
      loadCourseMedia: async () => { await initialRead; return { contract: "aralearn.course-media.v1", courseId: id, courseRevision: probe.revision,
        mode: "catalog", audioConfig: structuredClone(probe.config), storage: { uniqueBytes: 0, maxUniqueBytes: 67108864 },
        items: structuredClone(probe.items), nextCursor: null }; },
      mutateCourseMedia: async request => {
        probe.writes.push(structuredClone(request)); probe.config = structuredClone(request.command.config); ++probe.revision;
        return { contract: "aralearn.course-media-change.v1", courseId: id, courseRevision: probe.revision, requestId: request.requestId,
          idempotent: false, changed: true, operation: "set_audio_config", media: null, fileName: null };
      },
      uploadCourseAudio: async request => {
        probe.writes.push({ ...request, file: { name: request.file.name, size: request.file.size } }); ++probe.attempts;
        const media = { contentHash: "a".repeat(64), byteSize: request.file.size, mediaType: "audio/wav" };
        if (probe.attempts === 1) {
          ++probe.revision; probe.items.push({ ...media, fileName: request.file.name });
          throw Object.assign(new Error("Resposta perdida"), { status: 0, code: "network_error" });
        }
        return { contract: "aralearn.course-media-ingestion.v1", courseId: id, courseRevision: probe.revision,
          requestId: request.requestId, changed: true, idempotent: true, operation: "ingest_audio", media, fileName: request.file.name };
      }
    };
    const panel = createCourseAudioPanel({ root: document.querySelector("#audio-panel-root"), controller,
      courseId: id, courseRevision: 1, loadSpeechProvider: async () => ({ GEMINI_SPEECH_VOICES: ["Kore"],
        generateGeminiSpeech: async () => { ++probe.generations;
          return { blob: new Blob([wrapGeminiPcmAsWav(new Uint8Array(4800))], { type: "audio/wav" }) }; } }) });
    globalThis.__audioPanel = panel; globalThis.__audioPanelProbe = probe;
    void panel.open();
  });
  await expect(page.getByLabel("Idioma padrão")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Arquivos", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Salvar configuração de áudio", exact: true })).toBeDisabled();
  await page.evaluate(() => globalThis.__audioPanelProbe.release());
  await expect(page.getByLabel("Idioma padrão")).toBeEnabled();
  const controls = await page.locator(".course-audio-panel button").evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height };
  }));
  expect(controls.every(rect => rect.width >= 44 && rect.height >= 44)).toBe(true);
  await page.getByLabel("Idioma padrão").fill("zh-CN");
  await page.locator("[data-audio-service] summary").click();
  await page.getByRole("combobox", { name: "Serviço", exact: true }).selectOption("gemini");
  await page.getByRole("button", { name: "Salvar configuração de áudio", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Áudio atualizado.");
  await expect(page.getByLabel("Idioma padrão")).toHaveValue("zh-CN");
  await page.getByRole("button", { name: "Gerar voz", exact: true }).click();
  await page.getByRole("textbox", { name: "Nome do arquivo", exact: true }).fill("Saudação");
  await page.getByRole("textbox", { name: "Texto a falar", exact: true }).fill("Bom dia.");
  await page.getByLabel("Chave do serviço", { exact: true }).fill("credencial-sintetica-nao-real");
  await page.getByRole("checkbox", { name: "Autorizo enviar este texto e usar a cota ou cobrança da minha conta.", exact: true }).check();
  await page.getByRole("button", { name: "Gerar áudio", exact: true }).click();
  await expect(page.getByText(/gerado, ainda não guardado/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvir arquivo selecionado", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Guardar áudio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirmar operação pendente", exact: true })).toBeVisible();
  await page.evaluate(async () => { await globalThis.__audioPanel.refresh(globalThis.__audioPanelProbe.revision); });
  await page.getByRole("button", { name: "Confirmar operação pendente", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Áudio atualizado.");
  const result = await page.evaluate(() => globalThis.__audioPanelProbe);
  expect(result.generations).toBe(1);
  expect(result.writes[2]).toEqual(result.writes[1]);
  expect(result.items).toHaveLength(1);
  await expect(page.locator("body")).not.toContainText("credencial-sintetica-nao-real");
});
