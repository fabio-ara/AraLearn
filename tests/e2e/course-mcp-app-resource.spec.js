import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import {
  COURSE_MCP_APP_RESOURCE_URI,
  readCourseMcpAppResource
} from "../../supabase/functions/_shared/aralearn-authoring/courseMcpAppResource.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publishedBaseUrl = "https://fabio-ara.github.io/AraLearn/";

async function mountResource(page, html, {
  initialize = true,
  hostCapabilities = { openLinks: {} }
} = {}) {
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; min-height: 100%; }
    #mcp-app { border: 0; display: block; width: 100%; }
  </style></head><body>
    <iframe id="mcp-app" title="Recurso MCP" sandbox="allow-scripts allow-same-origin"></iframe>
    <script>
      window.__mcpMessages = [];
      window.addEventListener("message", (event) => {
        const frame = document.getElementById("mcp-app");
        const message = event.data;
        if (event.source !== frame.contentWindow || !message || message.jsonrpc !== "2.0") return;
        window.__mcpMessages.push(message);
        if (message.method === "ui/notifications/size-changed") {
          const height = Number(message.params?.height);
          if (Number.isFinite(height) && height > 0) frame.style.height = Math.min(1200, height) + "px";
        }
        if (window.__initializeMcpApp && message.method === "ui/initialize" && message.id !== undefined) {
          event.source.postMessage({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2026-01-26",
              hostCapabilities: window.__mcpHostCapabilities,
              hostInfo: { name: "AraLearn test host", version: "1" },
              hostContext: {
                theme: "light",
                containerDimensions: { maxWidth: 430, maxHeight: 1200 },
                safeAreaInsets: { top: 5, right: 6, bottom: 7, left: 8 }
              }
            }
          }, "*");
        } else if (message.method === "ui/open-link" && message.id !== undefined) {
          event.source.postMessage({ jsonrpc: "2.0", id: message.id, result: {} }, "*");
        }
      });
    </script>
  </body></html>`, { waitUntil: "domcontentloaded" });
  await page.evaluate((value) => { window.__mcpHostCapabilities = value; }, hostCapabilities);
  await page.evaluate((value) => { window.__initializeMcpApp = value; }, initialize);
  await page.locator("#mcp-app").evaluate((frame, source) => { frame.srcdoc = source; }, html);
  await expect.poll(() => page.frames().length).toBe(2);
  return page.frames().find((frame) => frame !== page.mainFrame());
}

async function postToResource(page, message) {
  await page.locator("#mcp-app").evaluate((frame, value) => {
    frame.contentWindow.postMessage(value, "*");
  }, message);
}

function localPublishedPath(url) {
  const relativePath = decodeURIComponent(url.pathname.slice("/AraLearn/".length));
  if (!relativePath || relativePath.split("/").includes("..")) return null;
  if (relativePath.startsWith("src/")) return path.join(repositoryRoot, relativePath);
  if (relativePath.startsWith("vendor/")) {
    return path.join(repositoryRoot, "public", relativePath);
  }
  return path.join(repositoryRoot, "public", relativePath);
}

function contentType(filePath) {
  return path.extname(filePath).toLowerCase() === ".css"
    ? "text/css; charset=utf-8"
    : "text/javascript; charset=utf-8";
}

const setDiagramStudyUnit = Object.freeze({
  id: "study-unit-mcp-set-diagram",
  position: 1,
  title: "Conjuntos em interseção",
  role: "theory",
  content: [Object.freeze({
    id: "set-diagram-mcp",
    package: "aralearn.resource.set_diagram",
    version: "1.0.0",
    data: Object.freeze({
      prompt: "Compare os conjuntos.",
      kind: "venn",
      sets: [
        { id: "a", symbol: "A", label: "Grupo A" },
        { id: "b", symbol: "B", label: "Grupo B" }
      ],
      regions: [
        { id: "a-only", setIds: ["a"], items: ["x"] },
        { id: "both", setIds: ["a", "b"], items: ["y"] }
      ]
    })
  })],
  response: null,
  feedback: [],
  topics: []
});

function focusedInspectionPayload() {
  const design = {
    parameters: [{
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
      value: 2,
      origin: "author",
      sourceScopeKind: "didactic_microsequence"
    }],
    guidance: [{
      guidance: "Contrastar a condição de ordenação antes de generalizar o algoritmo.",
      origin: "researcher",
      sourceScopeKind: "didactic_microsequence"
    }],
    componentPolicy: {
      availability: "allow_only",
      allowedCount: 5,
      excludedCount: 1,
      preferredCount: 2,
      origin: "author",
      sourceScopeKind: "course"
    }
  };
  const path = {
    module: { id: "module-a", position: 1, title: "Algoritmos" },
    lesson: { id: "lesson-a", position: 2, title: "Busca eficiente" },
    didacticMicrosequence: { id: "micro-a", position: 3, title: "Busca binária" }
  };
  const item = (studyUnit, state = "current") => ({
    studyUnit,
    version: 2,
    updatedAt: "2026-08-28T00:00:00Z",
    ordinal: studyUnit.position,
    curriculumPath: path,
    authoringPart: null,
    authorship: {
      pendingObservationCount: 0,
      production: null,
      design: {
        used: design,
        current: state === "current" ? design : {
          ...design,
          parameters: [{ ...design.parameters[0], value: 3 }]
        },
        state
      }
    }
  });
  return {
    contract: "aralearn.course-study-unit-inspection-page.v2",
    courseId: "10000000-0000-4000-8000-000000000001",
    courseRevision: 8,
    scope: { kind: "course", id: null },
    totalCount: 2,
    scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 2 },
    items: [item({
      id: "unit-gap",
      position: 1,
      title: "Redução do intervalo",
      role: "practice",
      content: [{
        id: "unit-gap-text",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "A cada comparação, a busca binária reduz pela metade o intervalo restante." }
      }],
      response: {
        id: "unit-gap-response",
        package: "aralearn.response.gap",
        version: "1.0.0",
        data: {
          prompt: "Complete a propriedade.",
          blanks: [{
            id: "gap-a",
            targetInstanceId: "unit-gap-text",
            targetPath: "text",
            responseMode: "choice",
            answer: "pela metade",
            distractors: ["em uma posição", "aleatoriamente"]
          }]
        }
      },
      feedback: [{
        id: "unit-gap-feedback",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "A comparação elimina uma das duas metades do intervalo." }
      }],
      topics: []
    }), item({
      id: "unit-choice",
      position: 2,
      title: "Condição de segurança",
      role: "practice",
      content: [],
      response: {
        id: "unit-choice-response",
        package: "aralearn.response.choice",
        version: "1.0.0",
        data: {
          question: "Quando a busca binária pode eliminar metade dos candidatos?",
          selectionMode: "single",
          selectionCriterion: "correct",
          options: [{
            id: "ordered",
            kind: "text",
            text: "Quando os valores estão ordenados pelo critério comparado.",
            feedback: "A ordenação torna segura a eliminação de uma metade."
          }, {
            id: "short",
            kind: "text",
            text: "Quando a lista tem menos de dez valores.",
            feedback: "O tamanho não substitui a condição de ordenação."
          }],
          answerIds: ["ordered"]
        }
      },
      feedback: [{
        id: "unit-choice-feedback",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "A ordem é a invariante que sustenta o descarte." }
      }],
      topics: []
    }, "changed")],
    hasPrevious: false,
    hasMore: false,
    previousCursor: null,
    nextCursor: null,
    pageBytes: 4096,
    inspectionFocus: {
      id: "20000000-0000-4000-8000-000000000002",
      title: "Busca binária · condição e redução",
      deepLink: "https://fabio-ara.github.io/AraLearn/#/authoring/courses/10000000-0000-4000-8000-000000000001?section=content&inspectionFocusId=20000000-0000-4000-8000-000000000002",
      requestedCount: 2,
      availableCount: 2,
      missingStudyUnitIds: []
    }
  };
}

test("o recurso MCP hidrata set_diagram a partir da folha versionada do Pages", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const requestedUrls = [];
  await page.route(`${publishedBaseUrl}**`, async (route) => {
    const url = new URL(route.request().url());
    requestedUrls.push(url.href);
    const filePath = localPublishedPath(url);
    if (!filePath) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: contentType(filePath),
      headers: { "Access-Control-Allow-Origin": "*" },
      body: await fs.readFile(filePath)
    });
  });

  const resource = readCourseMcpAppResource(COURSE_MCP_APP_RESOURCE_URI);
  const appFrame = await mountResource(page, resource.text);
  await expect.poll(() => page.evaluate(() => window.__mcpMessages.some(
    ({ method }) => method === "ui/initialize"
  ))).toBe(true);
  const initializeRequest = await page.evaluate(() => window.__mcpMessages.find(
    ({ method }) => method === "ui/initialize"
  ));
  expect(initializeRequest.params).toEqual({
    protocolVersion: "2026-01-26",
    appInfo: { name: "AraLearn Course Inspector", version: "0.0.24" },
    appCapabilities: { availableDisplayModes: ["inline"] }
  });
  await expect.poll(() => page.evaluate(() => window.__mcpMessages.some(
    ({ method }) => method === "ui/notifications/initialized"
  ))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__mcpMessages.find(
    ({ method }) => method === "ui/notifications/size-changed"
  )?.params)).toEqual(expect.objectContaining({
    width: expect.any(Number),
    height: expect.any(Number)
  }));
  const initialSize = await page.evaluate(() => window.__mcpMessages.find(
    ({ method }) => method === "ui/notifications/size-changed"
  ).params);
  expect(initialSize.width).toBeGreaterThan(0);
  expect(initialSize.width).toBeLessThanOrEqual(430);
  expect(initialSize.height).toBeGreaterThan(0);
  expect(initialSize.height).toBeLessThanOrEqual(1200);
  await expect(appFrame.locator("html")).toHaveAttribute("data-color-mode", "light");
  await expect.poll(() => appFrame.evaluate(() =>
    getComputedStyle(document.documentElement).backgroundColor
  )).toBe("rgb(247, 248, 250)");
  await postToResource(page, {
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        structuredContent: {
          ok: true,
          data: {
            contract: "aralearn.instructional-component-library.v1",
            operation: "preview_study_unit",
            result: {
              catalogVersion: "1",
              structural: { valid: true },
              studyUnit: setDiagramStudyUnit,
              accessibleText: "Diagrama de Venn dos grupos A e B.",
              deepLink: "https://fabio-ara.github.io/AraLearn/#/authoring/courses/course-a?section=inspection"
            }
          }
        }
      }
  });

  await expect(appFrame.locator('[data-set-diagram-state="ready"]')).toHaveCount(1);
  await expect(appFrame.locator(".package-set-shape")).toHaveCount(2);
  expect(requestedUrls).toContain(`${publishedBaseUrl}vendor/venn.esm.js`);
  expect(requestedUrls.some((url) => url.startsWith("ui://"))).toBe(false);
  await appFrame.getByRole("link", { name: "Abrir no AraLearn" }).click();
  await expect.poll(() => page.evaluate(() => window.__mcpMessages.find(
    ({ method }) => method === "ui/open-link"
  )?.params)).toEqual({
    url: "https://fabio-ara.github.io/AraLearn/#/authoring/courses/course-a?section=inspection"
  });

  await postToResource(page, {
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { theme: "dark" }
  });
  await expect(appFrame.locator("html")).toHaveAttribute("data-color-mode", "dark");
  await expect.poll(() => appFrame.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--surface-canvas").trim()
  )).toBe("#111418");
  const darkContrast = await appFrame.evaluate(() => {
    const components = (value) => (value.match(/[\d.]+/gu) || []).slice(0, 3).map(Number);
    const luminance = (value) => {
      const [red, green, blue] = components(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const ratio = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const background = getComputedStyle(document.documentElement).backgroundColor;
    return {
      context: ratio(getComputedStyle(document.querySelector(".mcp-app-context")).color, background),
      link: ratio(getComputedStyle(document.querySelector(".mcp-app-link")).color, background)
    };
  });
  expect(darkContrast.context).toBeGreaterThanOrEqual(4.5);
  expect(darkContrast.link).toBeGreaterThanOrEqual(4.5);

  await postToResource(page, {
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: {
        containerDimensions: { maxWidth: 390, maxHeight: 900 },
        safeAreaInsets: { top: 5, right: 6, bottom: 12, left: 8 }
      }
  });
  await expect(appFrame.locator("html")).toHaveCSS("max-height", "900px");
  expect(await appFrame.evaluate(() => ({
    maxWidth: document.documentElement.style.maxWidth,
    safeLeft: document.documentElement.style.getPropertyValue("--mcp-host-safe-left"),
    safeBottom: document.documentElement.style.getPropertyValue("--mcp-host-safe-bottom")
  }))).toEqual({ maxWidth: "390px", safeLeft: "8px", safeBottom: "12px" });

  await postToResource(page, {
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        structuredContent: {
          ok: true,
          data: {
            contract: "aralearn.instructional-component-library.v1",
            operation: "search",
            result: {
              catalogVersion: "1",
              candidates: [{
                packageId: "aralearn.resource.set_diagram",
                label: "Diagrama de conjuntos",
                fit: "canonical",
                reason: "Representa relações entre conjuntos."
              }]
            }
          }
        }
      }
  });
  await expect(appFrame.getByRole("heading", { name: "Biblioteca de componentes didáticos" })).toBeVisible();
  await expect(appFrame.getByRole("cell", { name: "Diagrama de conjuntos" })).toBeVisible();
  await expect(appFrame.getByRole("cell", { name: "Canônico" })).toBeVisible();

  await postToResource(page, {
    jsonrpc: "2.0",
    method: "ui/notifications/tool-result",
    params: {
      structuredContent: {
        ok: true,
        data: {
          contract: "aralearn.course-authoring-analytics.v1",
          courseRevision: 7,
          overview: {
            title: "Fatos por estado",
            question: "Quais estados aparecem?",
            series: [{
              key: "open",
              label: "Em aberto",
              value: 2,
              unit: "count",
              denominator: 3,
              missing: false
            }]
          },
          limitations: [],
          deepLink: "https://fabio-ara.github.io/AraLearn/#/authoring/courses/course-a?section=research"
        }
      }
    }
  });
  await expect(appFrame.getByRole("cell", { name: "Contagem" })).toBeVisible();

  await postToResource(page, {
    jsonrpc: "2.0",
    method: "ui/notifications/tool-result",
    params: {
      structuredContent: {
        ok: true,
        data: {
          contract: "aralearn.course-variant-comparison.v1",
          planning: { courseRevision: 7, planVersion: 2 },
          members: [{
            courseId: "10000000-0000-4000-8000-000000000001",
            label: "Z",
            currentCourseRevision: 3,
            materialization: { plannedPartCount: 2, studyUnitCount: 4 },
            references: { sourceCount: 1, anchorCount: 1, pdfCount: 0 }
          }, {
            courseId: "20000000-0000-4000-8000-000000000002",
            label: "A",
            currentCourseRevision: 4,
            materialization: { plannedPartCount: 2, studyUnitCount: 5 },
            references: { sourceCount: 1, anchorCount: 1, pdfCount: 0 }
          }],
          differences: {
            referenceCourseId: "10000000-0000-4000-8000-000000000001",
            declared: [], observedExpected: [], accidentalDeviations: [], factual: [], missingData: []
          }
        }
      }
    }
  });
  await expect(appFrame.getByRole("row", { name: /^Z Referência /u })).toBeVisible();
  await expect(appFrame.getByRole("row", { name: /^A Comparada /u })).toBeVisible();

  const beforeTeardown = await appFrame.locator("#app").innerHTML();
  await postToResource(page, {
      jsonrpc: "2.0",
      id: "teardown-1",
      method: "ui/resource-teardown",
      params: { reason: "Teste concluído" }
  });
  await expect.poll(() => page.evaluate(() => window.__mcpMessages.find(
    ({ id, result }) => id === "teardown-1" && result
  ))).toEqual({ jsonrpc: "2.0", id: "teardown-1", result: {} });
  expect(await page.evaluate(() => window.__mcpMessages.some(
    ({ method }) => method === "ui/notifications/teardown-complete"
  ))).toBe(false);

  await postToResource(page, {
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        structuredContent: {
          ok: true,
          data: {
            contract: "aralearn.instructional-component-library.v1",
            operation: "explore",
            result: { catalogVersion: "2", packageCount: 99 }
          }
        }
      }
  });
  await page.waitForTimeout(50);
  expect(await appFrame.locator("#app").innerHTML()).toBe(beforeTeardown);

  const sizeCount = await page.evaluate(() => window.__mcpMessages.filter(
    ({ method }) => method === "ui/notifications/size-changed"
  ).length);
  await appFrame.evaluate(() => { document.getElementById("app").style.paddingBottom = "400px"; });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__mcpMessages.filter(
    ({ method }) => method === "ui/notifications/size-changed"
  ).length)).toBe(sizeCount);
});

test("o foco incorporado expõe a microssequência, práticas resolvidas e desenho no celular", async ({ page }, testInfo) => {
  await page.route(`${publishedBaseUrl}**`, async (route) => {
    const url = new URL(route.request().url());
    const filePath = localPublishedPath(url);
    if (!filePath) return route.abort();
    await route.fulfill({
      status: 200,
      contentType: contentType(filePath),
      headers: { "Access-Control-Allow-Origin": "*" },
      body: await fs.readFile(filePath)
    });
  });
  const resource = readCourseMcpAppResource(COURSE_MCP_APP_RESOURCE_URI);
  const appFrame = await mountResource(page, resource.text);
  await expect.poll(() => page.evaluate(() => window.__mcpMessages.some(
    ({ method }) => method === "ui/notifications/initialized"
  ))).toBe(true);
  await postToResource(page, {
    jsonrpc: "2.0",
    method: "ui/notifications/tool-result",
    params: { structuredContent: { ok: true, data: focusedInspectionPayload() } }
  });

  await expect(appFrame.getByRole("heading", {
    name: "Busca binária · condição e redução"
  })).toBeVisible();
  await expect(appFrame.getByRole("heading", { name: "Busca binária", level: 2 })).toHaveCount(1);
  await expect(appFrame.getByText("M1.L2.µ3.U1", { exact: true })).toBeVisible();
  await expect(appFrame.getByText("M1.L2.µ3.U2", { exact: true })).toBeVisible();
  await expect(appFrame.getByText("Redução do intervalo", { exact: true })).toHaveCount(1);
  await expect(appFrame.getByText("Condição de segurança", { exact: true })).toHaveCount(1);
  await expect(appFrame.locator(".runtime-text-gap-blank.is-resolved")).toHaveText("pela metade");
  await expect(appFrame.locator(".multiple-choice-option.selected-correct"))
    .toContainText("Quando os valores estão ordenados");
  await expect(appFrame.getByText("A ordenação torna segura a eliminação de uma metade."))
    .toBeVisible();
  await expect(appFrame.locator(".mcp-app-study-unit button")).toHaveCount(0);
  await appFrame.locator(".mcp-app-design > summary").last().click();
  await expect(appFrame.getByText("Usado na materialização")).toBeVisible();
  await expect(appFrame.getByRole("link", { name: "Abrir este conjunto na Autoria" })).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await postToResource(page, {
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { containerDimensions: { maxWidth: width, maxHeight: 1200 } }
    });
    expect(await appFrame.evaluate(() => document.documentElement.scrollWidth <=
      document.documentElement.clientWidth)).toBe(true);
    await appFrame.locator("html").screenshot({
      path: testInfo.outputPath(`mcp-focus-${width}.png`),
      animations: "disabled"
    });
  }
  await postToResource(page, {
    jsonrpc: "2.0",
    method: "ui/notifications/host-context-changed",
    params: {
      theme: "dark",
      containerDimensions: { maxWidth: 390, maxHeight: 1200 }
    }
  });
  await expect(appFrame.locator("html")).toHaveAttribute("data-color-mode", "dark");
  expect(await appFrame.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)).toBe(true);
  await appFrame.locator("html").screenshot({
    path: testInfo.outputPath("mcp-focus-390-dark.png"),
    animations: "disabled"
  });
});

test("teardown responde ao id do host mesmo quando coincide com pedido da aplicação", async ({ page }) => {
  const resource = readCourseMcpAppResource(COURSE_MCP_APP_RESOURCE_URI);
  await mountResource(page, resource.text, { initialize: false });
  await expect.poll(() => page.evaluate(() => window.__mcpMessages.some(
    ({ method, id }) => method === "ui/initialize" && id === 1
  ))).toBe(true);

  await postToResource(page, {
    jsonrpc: "2.0",
    id: 1,
    method: "ui/resource-teardown",
    params: { reason: "Host encerrou a representação" }
  });

  await expect.poll(() => page.evaluate(() => window.__mcpMessages.filter(
    ({ id, result }) => id === 1 && result && !Object.hasOwn(result, "protocolVersion")
  ).at(-1))).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  expect(await page.evaluate(() => window.__mcpMessages.some(
    ({ method }) => method === "ui/notifications/initialized"
  ))).toBe(false);
});

test("o recurso omite o endereço quando o host não oferece abertura de links", async ({ page }) => {
  const resource = readCourseMcpAppResource(COURSE_MCP_APP_RESOURCE_URI);
  const appFrame = await mountResource(page, resource.text, { hostCapabilities: {} });
  await expect.poll(() => page.evaluate(() => window.__mcpMessages.some(
    ({ method }) => method === "ui/notifications/initialized"
  ))).toBe(true);

  await postToResource(page, {
    jsonrpc: "2.0",
    method: "ui/notifications/tool-result",
    params: {
      structuredContent: {
        ok: true,
        data: {
          contract: "aralearn.instructional-component-library.v1",
          operation: "preview_study_unit",
          result: {
            catalogVersion: "1",
            structural: { valid: true },
            studyUnit: setDiagramStudyUnit,
            accessibleText: "Diagrama de conjuntos.",
            deepLink: "https://fabio-ara.github.io/AraLearn/#/authoring/courses/course-a?section=inspection"
          }
        }
      }
    }
  });

  await expect(appFrame.getByRole("link", { name: "Abrir no AraLearn" })).toHaveCount(0);
  expect(await page.evaluate(() => window.__mcpMessages.some(
    ({ method }) => method === "ui/open-link"
  ))).toBe(false);
});

test("a política estável usa descrição textual para componente dependente de WebAssembly", async ({ page }) => {
  const requestedUrls = [];
  await page.route(`${publishedBaseUrl}**`, async (route) => {
    const url = new URL(route.request().url());
    requestedUrls.push(url.href);
    const filePath = localPublishedPath(url);
    if (!filePath) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: contentType(filePath),
      headers: { "Access-Control-Allow-Origin": "*" },
      body: await fs.readFile(filePath)
    });
  });
  const resource = readCourseMcpAppResource(COURSE_MCP_APP_RESOURCE_URI);
  const constrainedHtml = resource.text.replace(
    "<head>",
    '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' https://fabio-ara.github.io; style-src \'unsafe-inline\' https://fabio-ara.github.io; img-src data:; connect-src \'none\'">'
  );
  const appFrame = await mountResource(page, constrainedHtml);
  await expect.poll(() => page.evaluate(() => window.__mcpMessages.some(
    ({ method }) => method === "ui/notifications/initialized"
  ))).toBe(true);

  await postToResource(page, {
    jsonrpc: "2.0",
    method: "ui/notifications/tool-result",
    params: {
      structuredContent: {
        ok: true,
        data: {
          contract: "aralearn.instructional-component-library.v1",
          operation: "preview_study_unit",
          result: {
            catalogVersion: "1",
            structural: { valid: true },
            studyUnit: {
              id: "study-unit-flow",
              content: [{ package: "aralearn.resource.paragraph", version: "1.0.0" }],
              feedback: [{ package: "aralearn.resource.flow", version: "1.0.0" }],
              response: null
            },
            accessibleText: "Fluxo textual: início, decisão e término.",
            deepLink: "https://fabio-ara.github.io/AraLearn/#/authoring/courses/course-a?section=inspection"
          }
        }
      }
    }
  });

  await expect(appFrame.getByText(/política do cliente não permite/u)).toBeVisible();
  await expect(appFrame.getByText("Fluxo textual: início, decisão e término.")).toBeVisible();
  expect(requestedUrls.some((url) => url.includes("renderPackageStudyUnit.js"))).toBe(false);
  expect(requestedUrls.some((url) => url.includes("viz-global.js"))).toBe(false);
});
