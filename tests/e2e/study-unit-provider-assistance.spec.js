import { expect, test } from "@playwright/test";

async function installHarness(page) {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async () => {
    const {
      createStudyUnitProviderAssistance,
      createStudyUnitProviderSession,
      renderStudyUnitAssistanceTrigger
    } = await import("/src/ui/StudyUnitProviderAssistance.js");
    const studyUnit = {
      id: "study-unit-browser-assistance",
      position: 1,
      title: "Relações",
      role: "theory",
      content: [{
        id: "paragraph",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Texto atual." }
      }],
      response: null,
      feedback: [],
      topics: ["Relações"]
    };
    document.body.innerHTML = '<main class="course-authoring-surface">' +
      '<p id="assistance-preview" tabindex="-1" data-assistance-preview-focus>Texto atual.</p>' +
      renderStudyUnitAssistanceTrigger({ context: "study" }) + '</main>';
    const probe = {
      studyUnit,
      draft: { text: "Texto atual." },
      origin: "manual",
      previews: [],
      fetchCalls: 0,
      secretInUrl: false,
      secretInBody: false,
      authorizationWasHeader: false,
      holdFetch: false,
      fetchAborted: false,
      fetchSettled: false,
      cleanupOrder: [],
      nextText: "Texto mais direto.",
      nextMessage: "Simplifiquei o trecho."
    };
    const session = createStudyUnitProviderSession();
    const controller = createStudyUnitProviderAssistance({
      documentValue: document,
      windowValue: window,
      session,
      runtimeConfig: {
        developmentRuntime: true,
        assistAllowedOrigins: [
          "https://api.openai.com",
          "https://generativelanguage.googleapis.com",
          "https://api.deepseek.com",
          "http://127.0.0.1:4183"
        ]
      },
      fetchImpl: async (url, init) => {
        probe.fetchCalls += 1;
        probe.secretInUrl ||= String(url).includes("segredo-e2e");
        probe.secretInBody ||= String(init.body).includes("segredo-e2e");
        probe.authorizationWasHeader ||=
          init.headers.authorization === "Bearer segredo-e2e";
        if (probe.holdFetch) {
          return new Promise((resolve, reject) => {
            const abort = () => {
              probe.fetchAborted = true;
              probe.fetchSettled = true;
              reject(new DOMException("Abortado pelo logout.", "AbortError"));
            };
            if (init.signal?.aborted) abort();
            else init.signal?.addEventListener("abort", abort, { once: true });
            probe.releaseFetch = () => {
              probe.fetchSettled = true;
              resolve({
                ok: true,
                status: 200,
                async json() {
                  return {
                    output: [{ content: [{
                      type: "output_text",
                      text: JSON.stringify({
                        message: probe.nextMessage,
                        changes: [{ path: "text", value: probe.nextText }]
                      })
                    }] }]
                  };
                }
              });
            };
          });
        }
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              output: [{ content: [{
                type: "output_text",
                text: JSON.stringify({
                  message: probe.nextMessage,
                  changes: [{ path: "text", value: probe.nextText }]
                })
              }] }]
            };
          }
        };
      }
    });
    const trigger = document.querySelector("[data-action='study-provider-assistance']");
    trigger.addEventListener("click", () => controller.open({
      trigger,
      studyUnit,
      targetId: "content:paragraph",
      pathValues: probe.draft,
      baselineOrigin: probe.origin,
      onPreview({ pathValues, origin }) {
        probe.draft = { ...pathValues };
        probe.origin = origin;
        probe.previews.push({ pathValues: { ...pathValues }, origin });
        document.querySelector("#assistance-preview").textContent = pathValues.text;
      }
    }));
    globalThis.__studyUnitAssistanceProbe = probe;
    globalThis.__studyUnitAssistanceController = controller;
    globalThis.__studyUnitAssistanceSession = session;
  });
}

async function configureOpenAi(page) {
  await page.getByLabel("Serviço").selectOption("openai");
  await page.getByLabel("Modelo").fill("gpt-5-mini");
  await page.getByLabel("Chave da OpenAI").fill("segredo-e2e");
  await page.getByLabel("Pedido").fill("Deixe o texto mais direto.");
}

test("prévia do provider usa o renderer corrente, aplica ao rascunho e elimina estado volátil ao fechar", async ({ page }) => {
  const consoleMessages = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.setViewportSize({ width: 390, height: 780 });
  await installHarness(page);
  const trigger = page.getByRole("button", { name: "Assistência por API" });
  await expect(trigger).toHaveAttribute("title", "Assistência por API");
  await trigger.click();
  await expect(page.getByText(/Serão enviados ao serviço escolhido: seu pedido/u)).toBeVisible();
  await configureOpenAi(page);
  await page.getByRole("button", { name: "Gerar prévia" }).click();

  await expect(page.getByText("Simplifiquei o trecho.")).toBeVisible();
  await expect(page.locator("#assistance-preview")).toHaveText("Texto mais direto.");
  expect(await page.evaluate(() => ({
    fetchCalls: globalThis.__studyUnitAssistanceProbe.fetchCalls,
    secretInUrl: globalThis.__studyUnitAssistanceProbe.secretInUrl,
    secretInBody: globalThis.__studyUnitAssistanceProbe.secretInBody,
    authorizationWasHeader: globalThis.__studyUnitAssistanceProbe.authorizationWasHeader,
    origin: globalThis.__studyUnitAssistanceProbe.origin
  }))).toEqual({
    fetchCalls: 1,
    secretInUrl: false,
    secretInBody: false,
    authorizationWasHeader: true,
    origin: "provider_assistance"
  });

  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole("button", { name: "Ver no conteúdo" }).click();
  await expect(page.getByRole("dialog", { name: "Assistência por API" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Prévia no conteúdo" })).toBeVisible();
  await expect(page.locator("#assistance-preview")).toBeFocused();
  await expect(page.locator("#assistance-preview")).toHaveText("Texto mais direto.");
  expect(await page.evaluate(() => {
    const content = document.querySelector("#assistance-preview").getBoundingClientRect();
    const bar = document.querySelector(".study-unit-assistance-peek").getBoundingClientRect();
    return {
      barWidth: bar.width,
      overlap: content.bottom > bar.top && content.top < bar.bottom,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth
    };
  })).toEqual({ barWidth: 360, overlap: false, horizontalOverflow: false });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.getByRole("button", { name: "Voltar à sugestão" }).click();
  await expect(page.getByRole("dialog", { name: "Assistência por API" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver no conteúdo" })).toBeFocused();

  await page.getByRole("button", { name: "Descartar sugestão" }).click();
  await expect(page.locator("#assistance-preview")).toHaveText("Texto atual.");
  await expect(page.getByText("Histórico desta sessão")).toBeVisible();
  await expect(page.getByText("Descartado")).toBeHidden();
  await page.getByText("Histórico desta sessão").click();
  await expect(page.getByText("Descartado")).toBeVisible();

  await page.getByRole("button", { name: "Gerar prévia" }).click();
  await page.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  await expect(page.locator("[data-study-unit-assistance]")).toHaveCount(0);
  await expect(page.locator("#assistance-preview")).toHaveText("Texto mais direto.");
  expect(await page.evaluate(() => globalThis.__studyUnitAssistanceProbe.previews.at(-1))).toEqual({
    pathValues: { text: "Texto mais direto." },
    origin: "provider_assistance"
  });

  const leaked = await page.evaluate(async () => {
    const databases = typeof indexedDB.databases === "function"
      ? await indexedDB.databases()
      : [];
    const localValues = Object.entries(localStorage);
    const sessionValues = Object.entries(sessionStorage);
    return {
      html: document.documentElement.innerHTML.includes("segredo-e2e"),
      local: JSON.stringify(localValues).includes("segredo-e2e"),
      session: JSON.stringify(sessionValues).includes("segredo-e2e"),
      databaseNames: databases.map(({ name }) => name).filter((name) =>
        /assist|provider|conversation/iu.test(String(name || ""))
      ),
      snapshot: globalThis.__studyUnitAssistanceController.sessionSnapshot()
    };
  });
  expect(leaked).toEqual({
    html: false,
    local: false,
    session: false,
    databaseNames: [],
    snapshot: {
      providerId: "openai",
      model: "gpt-5-mini",
      endpoint: "https://api.openai.com/v1/responses",
      hasCredential: true,
      historyCount: 0,
      opened: false,
      pending: false,
      peeking: false,
      destroyed: false
    }
  });

  await trigger.click();
  await expect(page.getByLabel("Serviço")).toHaveValue("openai");
  await expect(page.getByLabel("Modelo")).toHaveValue("gpt-5-mini");
  await expect(page.getByLabel("Chave da OpenAI")).toHaveValue("segredo-e2e");
  await expect(page.getByText("Histórico desta sessão")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-study-unit-assistance]")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.locator(".study-unit-assistance-backdrop").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("[data-study-unit-assistance]")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(page.getByLabel("Chave da OpenAI")).toHaveValue("segredo-e2e");
  expect(await page.evaluate(() => {
    globalThis.__studyUnitAssistanceController.destroy();
    const retained = globalThis.__studyUnitAssistanceSession.snapshot();
    globalThis.__studyUnitAssistanceSession.destroy();
    return {
      retained,
      destroyed: globalThis.__studyUnitAssistanceSession.snapshot()
    };
  })).toEqual({
    retained: {
      providerId: "openai",
      model: "gpt-5-mini",
      endpoint: "https://api.openai.com/v1/responses",
      hasCredential: true,
      destroyed: false
    },
    destroyed: {
      providerId: "",
      model: "",
      endpoint: "",
      hasCredential: false,
      destroyed: true
    }
  });
  await expect(page.locator("[data-study-unit-assistance]")).toHaveCount(0);
  expect(await page.evaluate(() =>
    document.documentElement.innerHTML.includes("segredo-e2e")
  )).toBe(false);

  await page.reload();
  expect(await page.evaluate(async () => ({
    html: document.documentElement.innerHTML.includes("segredo-e2e"),
    local: JSON.stringify(Object.entries(localStorage)).includes("segredo-e2e"),
    session: JSON.stringify(Object.entries(sessionStorage)).includes("segredo-e2e"),
    providerDatabases: typeof indexedDB.databases === "function"
      ? (await indexedDB.databases()).filter(({ name }) =>
          /assist|provider|conversation/iu.test(String(name || ""))).length
      : 0
  }))).toEqual({ html: false, local: false, session: false, providerDatabases: 0 });
  expect(consoleMessages.join("\n")).not.toContain("segredo-e2e");
});

test("overlay mantém 430 px, alvos de 44 px, foco contido e rascunho offline nas quatro larguras", async ({ page, context }) => {
  await installHarness(page);
  const trigger = page.getByRole("button", { name: "Assistência por API" });
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 780 });
    await trigger.click();
    const geometry = await page.locator(".study-unit-assistance-sheet").evaluate((sheet) => {
      const box = sheet.getBoundingClientRect();
      const buttons = [...sheet.querySelectorAll("button")].map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      return {
        width: box.width,
        center: box.left + box.width / 2,
        viewportCenter: innerWidth / 2,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        undersizedButtons: buttons.filter(({ width: buttonWidth, height }) =>
          buttonWidth < 44 || height < 44
        ).length
      };
    });
    expect(geometry.width).toBeLessThanOrEqual(430);
    expect(Math.abs(geometry.center - geometry.viewportCenter)).toBeLessThanOrEqual(1);
    expect(geometry.horizontalOverflow).toBe(false);
    expect(geometry.undersizedButtons).toBe(0);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }

  await page.setViewportSize({ width: 390, height: 780 });
  await trigger.click();
  await expect(page.getByLabel("Serviço")).toBeFocused();
  await page.getByRole("button", { name: "Fechar" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Gerar prévia" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Fechar" })).toBeFocused();
  await page.getByText("Conexão", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Gerar prévia" })).toBeFocused();

  await configureOpenAi(page);
  await page.getByText("Conexão", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Endpoint")).toBeFocused();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Gerar prévia" }).click();
  await expect(page.getByRole("alert")).toContainText("disponível quando a conexão voltar");
  await expect(page.locator("#assistance-preview")).toHaveText("Texto atual.");
  expect(await page.evaluate(() => globalThis.__studyUnitAssistanceProbe.fetchCalls)).toBe(0);
  await context.setOffline(false);
  await expect(page.getByRole("status")).toContainText("Conexão restabelecida");
  await expect(page.getByLabel("Pedido")).toHaveValue("Deixe o texto mais direto.");
  await page.keyboard.press("Escape");
});

test("SIGNED_OUT cancela a consulta antes de destruir a sessão e não aplica retorno tardio", async ({ page }) => {
  const pageErrors = [];
  const consoleMessages = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => consoleMessages.push(message.text()));
  await installHarness(page);
  await page.evaluate(() => {
    globalThis.__studyUnitAssistanceProbe.holdFetch = true;
  });
  await page.getByRole("button", { name: "Assistência por API" }).click();
  await configureOpenAi(page);
  await page.getByRole("button", { name: "Gerar prévia" }).click();
  await expect(page.getByRole("status")).toContainText("Consultando o serviço");
  await expect.poll(() => page.evaluate(() =>
    globalThis.__studyUnitAssistanceProbe.fetchCalls
  )).toBe(1);

  await page.evaluate(() => {
    const emitAuthState = (event) => {
      if (event !== "SIGNED_OUT") return;
      globalThis.__studyUnitAssistanceProbe.cleanupOrder.push("application");
      globalThis.__studyUnitAssistanceController.destroy();
      globalThis.__studyUnitAssistanceProbe.cleanupOrder.push("session");
      globalThis.__studyUnitAssistanceSession.destroy();
    };
    emitAuthState("SIGNED_OUT");
  });

  await expect(page.locator("[data-study-unit-assistance]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    globalThis.__studyUnitAssistanceProbe.fetchSettled
  )).toBe(true);
  expect(await page.evaluate(() => ({
    fetchAborted: globalThis.__studyUnitAssistanceProbe.fetchAborted,
    previews: globalThis.__studyUnitAssistanceProbe.previews,
    cleanupOrder: globalThis.__studyUnitAssistanceProbe.cleanupOrder,
    session: globalThis.__studyUnitAssistanceSession.snapshot(),
    secretInDom: document.documentElement.innerHTML.includes("segredo-e2e")
  }))).toEqual({
    fetchAborted: true,
    previews: [],
    cleanupOrder: ["application", "session"],
    session: {
      providerId: "",
      model: "",
      endpoint: "",
      hasCredential: false,
      destroyed: true
    },
    secretInDom: false
  });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  expect(pageErrors).toEqual([]);
  expect(consoleMessages.join("\n")).not.toMatch(/segredo-e2e|Abortado pelo logout/u);
});
