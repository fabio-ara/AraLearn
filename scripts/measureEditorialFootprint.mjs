import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { RESOURCE_CATALOG } from "../src/resources/catalog/resourceCatalog.js";
import {
  EDITORIAL_FOOTPRINT_THEMES,
  EDITORIAL_FOOTPRINT_VIEWPORTS,
  measureEditorialFootprintCandidate
} from "./editorialFootprintMetrics.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const fixturePath = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "editorial-footprint.v1.json"
);
const defaultOutputPath = path.join(
  repositoryRoot,
  "test-results",
  "editorial-footprint",
  "measurement.json"
);
const outputArgument = process.argv.indexOf("--output");
const outputPath = outputArgument >= 0
  ? path.resolve(repositoryRoot, String(process.argv[outputArgument + 1] || ""))
  : defaultOutputPath;
if (outputArgument >= 0 && !process.argv[outputArgument + 1]) {
  throw new Error("Informe o arquivo depois de --output.");
}

const MIME_BY_EXTENSION = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2"
});

function repositoryFilePath(requestUrl, origin) {
  const parsed = new URL(requestUrl || "/", origin);
  const relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  const filePath = path.resolve(repositoryRoot, relativePath || "index.html");
  const relativeToRepository = path.relative(repositoryRoot, filePath);
  if (
    relativeToRepository === ".." ||
    relativeToRepository.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRepository)
  ) return null;
  return filePath;
}

function startServer() {
  let origin = "http://127.0.0.1";
  const server = http.createServer(async (request, response) => {
    try {
      const filePath = repositoryFilePath(request.url, origin);
      if (!filePath) {
        response.writeHead(403).end("Acesso negado.");
        return;
      }
      const body = await fs.readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": body.byteLength,
        "Content-Type": MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()]
          || "application/octet-stream"
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      const status = error?.code === "ENOENT" ? 404 : 500;
      response.writeHead(status).end(status === 404 ? "Não encontrado." : "Erro interno.");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      origin = `http://127.0.0.1:${address.port}`;
      resolve({ origin, server });
    });
  });
}

function rank(values) {
  const ordered = values
    .map((value, index) => ({ index, value }))
    .sort((left, right) => left.value - right.value);
  const ranks = Array(values.length);
  for (let index = 0; index < ordered.length;) {
    let end = index + 1;
    while (end < ordered.length && ordered[end].value === ordered[index].value) end += 1;
    const averageRank = (index + end - 1) / 2 + 1;
    for (let cursor = index; cursor < end; cursor += 1) {
      ranks[ordered[cursor].index] = averageRank;
    }
    index = end;
  }
  return ranks;
}

function pearson(left, right) {
  const leftMean = left.reduce((total, value) => total + value, 0) / left.length;
  const rightMean = right.reduce((total, value) => total + value, 0) / right.length;
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  left.forEach((value, index) => {
    const leftDelta = value - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquare += leftDelta ** 2;
    rightSquare += rightDelta ** 2;
  });
  const denominator = Math.sqrt(leftSquare * rightSquare);
  return denominator ? numerator / denominator : 0;
}

function spearman(measurements, readCandidate) {
  const candidateRanks = rank(measurements.map(readCandidate));
  const actualRanks = rank(measurements.map((item) => item.real.occupiedPixels));
  return Number(pearson(candidateRanks, actualRanks).toFixed(3));
}

function summarize(measurements) {
  const correlations = {
    words: spearman(measurements, (item) => item.candidate.lexical.words),
    characters: spearman(measurements, (item) => item.candidate.lexical.characters),
    exploratoryWeightedWords: spearman(
      measurements,
      (item) => item.candidate.exploratoryWeightedWords
    ),
    abstractRows: spearman(measurements, (item) => item.candidate.abstractRows),
    estimatedPixels: spearman(measurements, (item) => item.candidate.estimatedPixels)
  };
  const byEnvironment = new Map(measurements.map((item) => [
    `${item.caseId}:${item.viewport.width}:${item.theme}`,
    item
  ]));
  const themePixelDeltas = measurements
    .filter((item) => item.theme === "light")
    .map((item) => {
      const dark = byEnvironment.get(`${item.caseId}:${item.viewport.width}:dark`);
      return dark ? Math.abs(item.real.occupiedPixels - dark.real.occupiedPixels) : 0;
    });
  const distinctCases = [...new Set(measurements.map(({ caseId }) => caseId))];
  const caseAverages = distinctCases.map((caseId) => {
    const selected = measurements.filter((item) => item.caseId === caseId);
    return {
      caseId,
      meanRealViewportRatio: Number((selected.reduce(
        (total, item) => total + item.real.viewportRatio,
        0
      ) / selected.length).toFixed(3)),
      meanOccupiedPixels: Math.round(selected.reduce(
        (total, item) => total + item.real.occupiedPixels,
        0
      ) / selected.length)
    };
  }).sort((left, right) => right.meanOccupiedPixels - left.meanOccupiedPixels);
  return {
    observationCount: measurements.length,
    correlationsWithRealOccupiedPixels: correlations,
    maximumLightDarkPixelDelta: Math.max(0, ...themePixelDeltas),
    largestRealFootprints: caseAverages.slice(0, 4),
    smallestRealFootprints: caseAverages.slice(-4).reverse()
  };
}

const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));
if (fixture.contract !== "aralearn.editorial-footprint-benchmark.v1") {
  throw new Error("O corpus editorial usa um contrato desconhecido.");
}
fixture.cases.forEach((benchmarkCase) => {
  const validation = RESOURCE_CATALOG.validateStudyUnit(benchmarkCase.studyUnit);
  if (!validation.valid) {
    throw new Error(`${benchmarkCase.id}: ${validation.errors.join(" ")}`);
  }
});

const { origin, server } = await startServer();
let browser;
try {
  browser = await chromium.launch();
  const measurements = [];
  for (const theme of EDITORIAL_FOOTPRINT_THEMES) {
    for (const viewport of EDITORIAL_FOOTPRINT_VIEWPORTS) {
      const context = await browser.newContext({ colorScheme: theme, viewport });
      await context.addInitScript((selectedTheme) => {
        localStorage.setItem("aralearn.ui.theme", selectedTheme);
      }, theme);
      for (const benchmarkCase of fixture.cases) {
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const url = `${origin}/tests/gallery/editorial-footprint.html?case=${encodeURIComponent(benchmarkCase.id)}`;
        await page.goto(url, { waitUntil: "networkidle" });
        await page.waitForFunction(() => globalThis.__EDITORIAL_FOOTPRINT_BENCHMARK__?.ready === true);
        const browserMeasurement = await page.evaluate(() => {
          const content = document.querySelector("[data-benchmark-content]");
          const card = document.querySelector(".runtime-card-sheet");
          const dock = document.querySelector(".card-answer-dock");
          const benchmark = globalThis.__EDITORIAL_FOOTPRINT_BENCHMARK__;
          const dockHeight = dock ? Math.ceil(dock.getBoundingClientRect().height) : 0;
          const contentRect = content.getBoundingClientRect();
          const contentChildren = [...content.children];
          const contentUsedHeight = contentChildren.length
            ? Math.ceil(Math.max(...contentChildren.map((element) => (
                element.getBoundingClientRect().bottom - contentRect.top + content.scrollTop
              ))))
            : 0;
          const contentScrollHeight = Math.ceil(content.scrollHeight);
          const contentClientHeight = Math.ceil(content.clientHeight);
          const cardClientHeight = Math.ceil(card.clientHeight);
          return {
            accessibleText: benchmark.accessibleText,
            caseId: benchmark.caseId,
            cardClientHeight,
            contentClientHeight,
            contentScrollHeight,
            contentUsedHeight,
            dockHeight,
            documentOverflow: Math.max(
              0,
              document.documentElement.scrollWidth - document.documentElement.clientWidth
            ),
            localHorizontalOverflow: Math.max(0, content.scrollWidth - content.clientWidth),
            theme: document.documentElement.dataset.colorMode
          };
        });
        if (pageErrors.length) {
          throw new Error(`${benchmarkCase.id} (${theme}, ${viewport.width}px): ${pageErrors.join(" | ")}`);
        }
        if (browserMeasurement.theme !== theme) {
          throw new Error(`O tema ${theme} não foi aplicado a ${benchmarkCase.id}.`);
        }
        if (browserMeasurement.documentOverflow > 1) {
          throw new Error(`Overflow do documento em ${benchmarkCase.id}, ${viewport.width}px.`);
        }
        const availablePixels = browserMeasurement.contentClientHeight + browserMeasurement.dockHeight;
        const occupiedPixels = browserMeasurement.contentUsedHeight + browserMeasurement.dockHeight;
        const candidate = measureEditorialFootprintCandidate({
          accessibleText: browserMeasurement.accessibleText,
          contentClientHeight: availablePixels,
          studyUnit: benchmarkCase.studyUnit,
          viewportWidth: viewport.width
        });
        measurements.push({
          caseId: benchmarkCase.id,
          families: benchmarkCase.families,
          scale: benchmarkCase.scale,
          theme,
          viewport,
          candidate,
          real: {
            availablePixels,
            cardClientHeight: browserMeasurement.cardClientHeight,
            contentClientHeight: browserMeasurement.contentClientHeight,
            contentScrollHeight: browserMeasurement.contentScrollHeight,
            contentUsedHeight: browserMeasurement.contentUsedHeight,
            dockHeight: browserMeasurement.dockHeight,
            occupiedPixels,
            viewportRatio: Number((occupiedPixels / availablePixels).toFixed(3)),
            localHorizontalOverflow: browserMeasurement.localHorizontalOverflow
          }
        });
        await page.close();
      }
      await context.close();
    }
  }
  const artifact = {
    contract: "aralearn.editorial-footprint-measurement.v1",
    fixture: "tests/fixtures/editorial-footprint.v1.json",
    environments: {
      themes: EDITORIAL_FOOTPRINT_THEMES,
      viewports: EDITORIAL_FOOTPRINT_VIEWPORTS
    },
    summary: summarize(measurements),
    measurements
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  const relativeOutput = path.relative(repositoryRoot, outputPath).replaceAll(path.sep, "/");
  console.log(JSON.stringify(artifact.summary, null, 2));
  console.log(`Medição completa em ${relativeOutput}.`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
