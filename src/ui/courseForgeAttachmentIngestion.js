function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

const PDF_MODULE_URL = new URL("../../node_modules/pdfjs-dist/legacy/build/pdf.mjs", import.meta.url);
const PDF_WORKER_URL = new URL("../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url);
const MAMMOTH_BROWSER_URL = new URL("../../node_modules/mammoth/mammoth.browser.js", import.meta.url);

let pdfjsLoaderPromise = null;
let mammothLoaderPromise = null;

function normalizeLineEndings(value = "") {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function inferExtension(fileName = "") {
  const normalized = text(fileName).toLowerCase();
  const match = normalized.match(/\.([a-z0-9]+)$/i);
  return match ? match[1] : "";
}

function isLikelyTextMime(mimeType = "") {
  const normalized = text(mimeType).toLowerCase();
  return normalized.startsWith("text/")
    || [
      "application/json",
      "application/xml",
      "application/javascript",
      "image/svg+xml"
    ].includes(normalized);
}

function isStructuredTextExtension(extension = "") {
  return [
    "txt",
    "md",
    "markdown",
    "json",
    "csv",
    "tsv",
    "html",
    "htm",
    "xml",
    "svg",
    "js",
    "ts",
    "jsx",
    "tsx",
    "py",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "sql",
    "sh",
    "ps1",
    "yml",
    "yaml",
    "ini",
    "toml",
    "log",
    "rtf"
  ].includes(extension);
}

function isPdfLike({ extension = "", mimeType = "" } = {}) {
  return extension === "pdf" || text(mimeType).toLowerCase() === "application/pdf";
}

function isDocxLike({ extension = "", mimeType = "" } = {}) {
  const normalizedMimeType = text(mimeType).toLowerCase();
  return extension === "docx"
    || normalizedMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function stripHtmlToText(rawHtml = "") {
  const html = normalizeLineEndings(rawHtml);
  if (typeof DOMParser === "function") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
    doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    doc.querySelectorAll("p, div, section, article, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr").forEach((node) => {
      node.append("\n\n");
    });
    doc.querySelectorAll("td, th").forEach((node) => {
      node.append(" | ");
    });
    return normalizeLineEndings(doc.body?.textContent || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|pre|blockquote|tr)>/gi, "\n\n")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeStructuredText(rawText = "", extension = "") {
  const normalized = normalizeLineEndings(rawText).trim();
  if (!normalized) {
    return "";
  }
  if (["html", "htm", "xml", "svg"].includes(extension)) {
    return stripHtmlToText(normalized);
  }
  if (extension === "json") {
    try {
      return JSON.stringify(JSON.parse(normalized), null, 2);
    } catch {
      return normalized;
    }
  }
  return normalized;
}

function buildAttachmentReference(file) {
  const name = text(file?.name) || "anexo";
  return `upload:${name}`;
}

function normalizeExtractedText(rawText = "") {
  return normalizeLineEndings(rawText)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHeadingLikeLine(value = "") {
  const normalized = text(value);
  if (!normalized || normalized.length > 120) {
    return false;
  }
  if (/^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9\s:/.-]{4,}$/u.test(normalized)) {
    return true;
  }
  return /^([0-9]+(\.[0-9]+)*)\s+.+/.test(normalized);
}

function isListLikeLine(value = "") {
  return /^([•\-*]|[0-9]+[.)])\s+/.test(text(value));
}

function inferBlockType(value = "") {
  if (isHeadingLikeLine(value)) {
    return "heading";
  }
  if (isListLikeLine(value)) {
    return "list_item";
  }
  return "paragraph";
}

function splitStructuredBlocks(rawText = "") {
  const normalized = normalizeExtractedText(rawText);
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/u)
    .map((entry) => text(entry))
    .filter(Boolean);
  const blocks = [];

  paragraphs.forEach((paragraph) => {
    const lines = paragraph
      .split(/\n/u)
      .map((entry) => text(entry))
      .filter(Boolean);
    if (!lines.length) {
      return;
    }

    if (lines.length === 1) {
      blocks.push({
        blockType: inferBlockType(lines[0]),
        text: lines[0]
      });
      return;
    }

    if (lines.every((line) => isListLikeLine(line))) {
      lines.forEach((line) => {
        blocks.push({
          blockType: "list_item",
          text: line
        });
      });
      return;
    }

    if (isHeadingLikeLine(lines[0])) {
      blocks.push({
        blockType: "heading",
        text: lines[0]
      });
      const remainder = lines.slice(1).join(" ");
      if (text(remainder)) {
        blocks.push({
          blockType: "paragraph",
          text: remainder
        });
      }
      return;
    }

    blocks.push({
      blockType: "paragraph",
      text: lines.join(" ")
    });
  });

  return blocks;
}

function normalizePdfLine(rawLine = "") {
  return text(rawLine)
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyPageNumberLine(value = "") {
  const normalized = normalizePdfLine(value);
  return /^\d{1,4}$/.test(normalized) || /^p[aá]gina\s+\d{1,4}$/i.test(normalized);
}

function shouldJoinPdfLines(currentLine = "", nextLine = "") {
  const current = normalizePdfLine(currentLine);
  const next = normalizePdfLine(nextLine);
  if (!current || !next) {
    return false;
  }
  if (/[.!?:;]\)?$/.test(current)) {
    return false;
  }
  if (/^[•\-*]/.test(next) || /^\d+[.)]\s/.test(next)) {
    return false;
  }
  if (/^[A-Z0-9][A-Z0-9\s]{4,}$/.test(next)) {
    return false;
  }
  return /^[a-zà-ÿ(]/u.test(next);
}

function cleanupPdfPageLines(pageLines = []) {
  const filtered = pageLines
    .map((line) => normalizePdfLine(line))
    .filter(Boolean)
    .filter((line) => !isLikelyPageNumberLine(line));

  const merged = [];
  for (let index = 0; index < filtered.length; index += 1) {
    let current = filtered[index];
    while (index + 1 < filtered.length && shouldJoinPdfLines(current, filtered[index + 1])) {
      const next = filtered[index + 1];
      if (/-$/u.test(current) && /^[a-zà-ÿ]/u.test(next)) {
        current = `${current.slice(0, -1)}${next}`;
      } else {
        current = `${current} ${next}`;
      }
      index += 1;
    }
    merged.push(current);
  }

  return merged;
}

function collectRepeatedMarginLines(pages = []) {
  const counts = new Map();
  pages.forEach((page) => {
    const lines = page.lines || [];
    const marginLines = [
      ...lines.slice(0, 2),
      ...lines.slice(Math.max(2, lines.length - 2))
    ]
      .map((line) => normalizePdfLine(line))
      .filter((line) => line.length >= 4)
      .filter((line) => line.length <= 120)
      .filter((line) => !isLikelyPageNumberLine(line));
    new Set(marginLines).forEach((line) => {
      counts.set(line, Number(counts.get(line) || 0) + 1);
    });
  });
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([line]) => line)
  );
}

function buildCleanPdfTextFromPages(pages = []) {
  const repeatedMarginLines = collectRepeatedMarginLines(pages);
  const cleanedPages = pages.map((page) => {
    const visibleLines = (page.lines || [])
      .map((line) => normalizePdfLine(line))
      .filter(Boolean)
      .filter((line) => !repeatedMarginLines.has(line));
    return cleanupPdfPageLines(visibleLines);
  });

  for (let pageIndex = 0; pageIndex < cleanedPages.length - 1; pageIndex += 1) {
    const currentPageLines = cleanedPages[pageIndex];
    const nextPageLines = cleanedPages[pageIndex + 1];
    if (!currentPageLines.length || !nextPageLines.length) {
      continue;
    }
    const lastIndex = currentPageLines.length - 1;
    const currentLastLine = currentPageLines[lastIndex];
    const nextFirstLine = nextPageLines[0];
    if (!shouldJoinPdfLines(currentLastLine, nextFirstLine)) {
      continue;
    }
    currentPageLines[lastIndex] = /-$/u.test(currentLastLine) && /^[a-zà-ÿ]/u.test(nextFirstLine)
      ? `${currentLastLine.slice(0, -1)}${nextFirstLine}`
      : `${currentLastLine} ${nextFirstLine}`;
    nextPageLines.shift();
  }

  return normalizeExtractedText(
    cleanedPages
      .map((lines) => lines.join("\n"))
      .filter(Boolean)
      .join("\n\n")
  );
}

async function loadPdfjs() {
  if (!pdfjsLoaderPromise) {
    pdfjsLoaderPromise = import(PDF_MODULE_URL.href);
  }
  return pdfjsLoaderPromise;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Ambiente sem DOM para carregar script externo."));
      return;
    }
    const existing = document.querySelector(`script[data-aralearn-src="${src}"]`);
    if (existing && existing.getAttribute("data-loaded") === "true") {
      resolve();
      return;
    }
    const script = existing || document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute("data-aralearn-src", src);
    script.addEventListener("load", () => {
      script.setAttribute("data-loaded", "true");
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Falha ao carregar script: ${src}`)), { once: true });
    if (!existing) {
      document.head.append(script);
    }
  });
}

async function loadMammoth() {
  if (globalThis.mammoth) {
    return globalThis.mammoth;
  }
  if (!mammothLoaderPromise) {
    mammothLoaderPromise = loadScript(MAMMOTH_BROWSER_URL.href).then(() => {
      if (!globalThis.mammoth) {
        throw new Error("Biblioteca Mammoth indisponível após carregamento.");
      }
      return globalThis.mammoth;
    });
  }
  return mammothLoaderPromise;
}

async function extractPdfTextFromArrayBuffer(arrayBuffer, { loadPdfjsModule = loadPdfjs } = {}) {
  const pdfjs = await loadPdfjsModule();
  if (pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL.href;
  }
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer)
  });
  const documentHandle = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= documentHandle.numPages; pageNumber += 1) {
    const page = await documentHandle.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = [];
    let currentLine = [];
    for (const item of Array.isArray(textContent?.items) ? textContent.items : []) {
      const chunk = text(item?.str);
      if (chunk) {
        currentLine.push(chunk);
      }
      if (item?.hasEOL) {
        lines.push(currentLine.join(" "));
        currentLine = [];
      }
    }
    if (currentLine.length) {
      lines.push(currentLine.join(" "));
    }
    pages.push({
      pageNumber,
      lines
    });
  }

  return buildCleanPdfTextFromPages(pages);
}

async function extractDocxTextFromArrayBuffer(arrayBuffer, { loadMammothLib = loadMammoth } = {}) {
  const mammoth = await loadMammothLib();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return {
    textContent: normalizeExtractedText(result?.value || ""),
    warnings: Array.isArray(result?.messages)
      ? result.messages.map((entry) => text(entry?.message || entry?.value || entry)).filter(Boolean)
      : []
  };
}

function createAttachmentRecord(index, file, overrides = {}) {
  const name = text(file?.name) || `Anexo ${index + 1}`;
  const mimeType = text(file?.type) || "application/octet-stream";
  return {
    id: `attachment_${index + 1}`,
    name,
    kind: "attachment",
    mimeType,
    fileRef: buildAttachmentReference(file),
    textContent: "",
    sourceBlocks: [],
    ingestionStatus: "unsupported",
    ingestionWarnings: [],
    ...overrides
  };
}

export async function ingestCourseForgeAttachments(files = [], options = {}) {
  const ingested = [];
  const warnings = [];
  const { loadPdfjsModule = loadPdfjs, loadMammothLib = loadMammoth } = options;

  for (const [index, file] of (Array.isArray(files) ? files : []).entries()) {
    const name = text(file?.name) || `Anexo ${index + 1}`;
    const mimeType = text(file?.type) || "application/octet-stream";
    const extension = inferExtension(name);
    const canReadAsStructuredText =
      typeof file?.text === "function" && (isLikelyTextMime(mimeType) || isStructuredTextExtension(extension));
    const canReadAsBinary = typeof file?.arrayBuffer === "function";

    if (isPdfLike({ extension, mimeType }) && canReadAsBinary) {
      try {
        const textContent = await extractPdfTextFromArrayBuffer(await file.arrayBuffer(), { loadPdfjsModule });
        const record = createAttachmentRecord(index, file, {
          textContent,
          sourceBlocks: splitStructuredBlocks(textContent),
          ingestionStatus: textContent ? "supported" : "partial"
        });
        if (!textContent) {
          record.ingestionWarnings = ["PDF lido, mas sem texto utilizável extraído."];
          warnings.push(`${name}: PDF lido, mas sem texto utilizável extraído.`);
        }
        ingested.push(record);
      } catch (error) {
        const message = text(error?.message) || "Falha ao extrair texto do PDF.";
        ingested.push(createAttachmentRecord(index, file, {
          ingestionStatus: "failed",
          ingestionWarnings: [message]
        }));
        warnings.push(`${name}: ${message}`);
      }
      continue;
    }

    if (isDocxLike({ extension, mimeType }) && canReadAsBinary) {
      try {
        const result = await extractDocxTextFromArrayBuffer(await file.arrayBuffer(), { loadMammothLib });
        const record = createAttachmentRecord(index, file, {
          textContent: result.textContent,
          sourceBlocks: splitStructuredBlocks(result.textContent),
          ingestionStatus: result.textContent ? "supported" : "partial",
          ingestionWarnings: result.warnings
        });
        if (!result.textContent) {
          record.ingestionWarnings = [...record.ingestionWarnings, "DOCX lido, mas sem texto utilizável extraído."];
        }
        record.ingestionWarnings.forEach((warning) => {
          warnings.push(`${name}: ${warning}`);
        });
        ingested.push(record);
      } catch (error) {
        const message = text(error?.message) || "Falha ao extrair texto do DOCX.";
        ingested.push(createAttachmentRecord(index, file, {
          ingestionStatus: "failed",
          ingestionWarnings: [message]
        }));
        warnings.push(`${name}: ${message}`);
      }
      continue;
    }

    if (!canReadAsStructuredText) {
      ingested.push(createAttachmentRecord(index, file, {
        ingestionWarnings: ["ingestão textual ainda não suportada para este formato."]
      }));
      warnings.push(`${name}: ingestão textual ainda não suportada para este formato.`);
      continue;
    }

    const rawText = await file.text();
    const textContent = normalizeStructuredText(rawText, extension);
    const record = createAttachmentRecord(index, file, {
      textContent,
      sourceBlocks: splitStructuredBlocks(textContent),
      ingestionStatus: textContent ? "supported" : "partial"
    });
    ingested.push(record);
    if (!textContent) {
      record.ingestionWarnings = ["arquivo lido, mas sem texto utilizável após ingestão."];
      warnings.push(`${name}: arquivo lido, mas sem texto utilizável após ingestão.`);
    }
  }

  return {
    attachments: ingested,
    warnings,
    extractedCount: ingested.filter((item) => text(item?.textContent)).length
  };
}
