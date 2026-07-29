import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "docs/screenshots/resources-v4");
const port = 4182;
const origin = `http://127.0.0.1:${port}`;
const expectedResources = [
  "paragraph", "choice", "composite", "code", "table", "flow", "tree", "graph",
  "relation_map", "matrix", "plane", "formula", "chart", "sequence",
  "annotated_text", "linguistic_example"
];
const widths = [360, 390, 412, 1280];

function waitForServer(url, attempts = 60) {
  return new Promise((resolve, reject) => {
    let remaining = attempts;
    const attempt = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // O servidor ainda está inicializando.
      }
      remaining -= 1;
      if (remaining <= 0) {
        reject(new Error(`O servidor da galeria não respondeu em ${url}.`));
        return;
      }
      setTimeout(attempt, 250);
    };
    attempt();
  });
}

fs.mkdirSync(outputDirectory, { recursive: true });
const server = spawn(
  process.execPath,
  ["./scripts/servePublic.js", "--root", "."],
  {
    cwd: repositoryRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    windowsHide: true
  }
);

let browser;
try {
  await waitForServer(`${origin}/tests/gallery/resources-v4.html`);
  browser = await chromium.launch();
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${origin}/tests/gallery/resources-v4.html`, {
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
        .map((element) => element.closest("[data-resource]")?.dataset.resource)
    }));
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
      path: path.join(outputDirectory, `gallery-${width}.png`),
      fullPage: true
    });
    await page.close();
  }
  console.log(`Galeria validada em ${widths.join(", ")}px; capturas em ${outputDirectory}.`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
