import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { RESOURCE_PACKAGE_REGISTRY } from "../src/resources/packages/index.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "docs/screenshots/resources-packages");
const port = Number.parseInt(
  process.env.ARALEARN_RESOURCE_GALLERY_PORT || "4182",
  10
);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("ARALEARN_RESOURCE_GALLERY_PORT deve ser uma porta TCP válida.");
}
const origin = `http://127.0.0.1:${port}`;
const expectedResources = RESOURCE_PACKAGE_REGISTRY.listCatalog().map(({ id }) => id);
const widths = [360, 390, 412, 1280];
const themes = ["light", "dark"];

const MIME_BY_EXTENSION = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".woff2": "font/woff2"
});

function repositoryFilePath(requestUrl) {
  const parsed = new URL(requestUrl || "/", origin);
  const pathname = decodeURIComponent(parsed.pathname);
  const relativePath = pathname === "/"
    ? "index.html"
    : pathname.replace(/^\/+/u, "");
  const filePath = path.resolve(repositoryRoot, relativePath);
  const relativeToRepository = path.relative(repositoryRoot, filePath);
  if (
    relativeToRepository === ".." ||
    relativeToRepository.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRepository)
  ) {
    return null;
  }
  return filePath;
}

function startGalleryServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const filePath = repositoryFilePath(request.url);
      if (!filePath) {
        response.writeHead(403).end("Acesso negado.");
        return;
      }
      const body = await fs.promises.readFile(filePath);
      response.writeHead(200, {
        "Content-Type":
          MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ||
          "application/octet-stream",
        "Content-Length": body.byteLength,
        "Cache-Control": "no-store"
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      const status = error?.code === "ENOENT" ? 404 : 500;
      response.writeHead(status).end(status === 404 ? "Não encontrado." : "Erro interno.");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

fs.mkdirSync(outputDirectory, { recursive: true });
const server = await startGalleryServer();

let browser;
try {
  browser = await chromium.launch();
  for (const theme of themes) {
    for (const width of widths) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        colorScheme: theme
      });
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("aralearn.ui.theme", selectedTheme);
      }, theme);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${origin}/tests/gallery/resources-packages.html`, {
        waitUntil: "networkidle"
      });
      await page.waitForFunction(() => globalThis.__RESOURCE_GALLERY_READY__ === true);
      const audit = await page.evaluate(() => ({
        resources: [...document.querySelectorAll("[data-resource]")]
          .map((element) => element.dataset.resource),
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        overflowingCards: [...document.querySelectorAll(".resource-gallery-card")]
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.closest("[data-resource]")?.dataset.resource),
        theme: document.documentElement.dataset.colorMode
      }));
      if (audit.theme !== theme) {
        throw new Error(`Tema ${theme} não foi aplicado em ${width}px.`);
      }
      if (JSON.stringify(audit.resources) !== JSON.stringify(expectedResources)) {
        throw new Error(`Galeria incompleta em ${width}px: ${audit.resources.join(", ")}.`);
      }
      if (audit.documentOverflow > 1 || audit.overflowingCards.length) {
        throw new Error(
          `Overflow horizontal em ${width}px: documento=${audit.documentOverflow}; ` +
          `cards=${audit.overflowingCards.join(", ") || "nenhum"}.`
        );
      }
      if (pageErrors.length) {
        throw new Error(`Erros no browser em ${width}px: ${pageErrors.join(" | ")}`);
      }
      await page.screenshot({
        path: path.join(outputDirectory, `gallery-${theme}-${width}.png`),
        fullPage: true
      });
      await page.close();
    }
  }
  console.log(
    `Galeria validada nos temas ${themes.join("/")} em ${widths.join(", ")}px; ` +
    `capturas em ${outputDirectory}.`
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
