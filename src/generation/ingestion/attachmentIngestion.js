function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

const PDF_MODULE_URL = new URL("../../../node_modules/pdfjs-dist/build/pdf.mjs", import.meta.url);
const PDF_WORKER_URL = new URL("../../../node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url);
const MAMMOTH_BROWSER_URL = new URL("../../../node_modules/mammoth/mammoth.browser.js", import.meta.url);
const MEBIBYTE = 1024 * 1024;

export const ATTACHMENT_INGESTION_LIMITS = Object.freeze({
  maxFiles: 8,
  maxTotalBytes: 24 * MEBIBYTE,
  maxPdfBytes: 12 * MEBIBYTE,
  maxDocxBytes: 8 * MEBIBYTE,
  maxTextBytes: 2 * MEBIBYTE,
  maxTextPrefixBytes: 256 * 1024,
  maxPdfPages: 80,
  maxDocxEntries: 1024,
  maxDocxUncompressedBytes: 32 * MEBIBYTE,
  maxDocxEntryUncompressedBytes: 16 * MEBIBYTE,
  maxDocxCompressionRatio: 200,
  maxExtractedCharacters: 64_000,
  perFileTimeoutMs: 20_000,
  totalTimeoutMs: 45_000
});

let pdfjsLoaderPromise = null;
let mammothLoaderPromise = null;

class AttachmentIngestionError extends Error {
  constructor(message, code = "ATTACHMENT_INGESTION_FAILED") {
    super(message);
    this.name = "AttachmentIngestionError";
    this.code = code;
  }
}

function positiveIntegerAtMost(value, ceiling) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return ceiling;
  }
  return Math.min(Math.floor(numeric), ceiling);
}

function resolveIngestionLimits(overrides = {}) {
  return Object.fromEntries(
    Object.entries(ATTACHMENT_INGESTION_LIMITS).map(([key, ceiling]) => [
      key,
      positiveIntegerAtMost(overrides?.[key], ceiling)
    ])
  );
}

function formatByteLimit(bytes) {
  if (bytes >= MEBIBYTE && bytes % MEBIBYTE === 0) {
    return `${bytes / MEBIBYTE} MB`;
  }
  if (bytes >= 1024 && bytes % 1024 === 0) {
    return `${bytes / 1024} KB`;
  }
  return `${bytes} bytes`;
}

function declaredFileSize(file) {
  const size = Number(file?.size);
  return Number.isFinite(size) && size >= 0 ? Math.floor(size) : null;
}

function hasBinaryReader(file) {
  return typeof file?.stream === "function"
    || typeof file?.slice === "function"
    || typeof file?.arrayBuffer === "function";
}

function createDeadlineContext({
  signal = null,
  deadlineAt = Number.POSITIVE_INFINITY,
  fileName = "anexo"
} = {}) {
  return {
    signal,
    deadlineAt,
    fileName
  };
}

function deadlineError(context) {
  if (context?.signal?.aborted) {
    return new AttachmentIngestionError(
      `A leitura de ${context.fileName} foi cancelada.`,
      "ATTACHMENT_INGESTION_ABORTED"
    );
  }
  return new AttachmentIngestionError(
    `A leitura de ${context?.fileName || "anexo"} excedeu o limite de tempo e foi interrompida.`,
    "ATTACHMENT_INGESTION_TIMEOUT"
  );
}

function assertWithinDeadline(context) {
  if (context?.signal?.aborted || Date.now() >= Number(context?.deadlineAt)) {
    throw deadlineError(context);
  }
}

function runCleanup(cleanup) {
  if (typeof cleanup !== "function") {
    return;
  }
  try {
    Promise.resolve(cleanup()).catch(() => {});
  } catch {
    // A falha original de cancelamento/timeout continua sendo autoritativa.
  }
}

async function awaitWithinDeadline(promise, context, { cleanup } = {}) {
  assertWithinDeadline(context);
  const remainingMs = Math.max(1, Number(context.deadlineAt) - Date.now());
  let timeoutId = null;
  let abortListener = null;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (abortListener && context.signal) {
        context.signal.removeEventListener("abort", abortListener);
      }
      callback(value);
    };
    const interrupt = () => {
      runCleanup(cleanup);
      settle(reject, deadlineError(context));
    };

    timeoutId = setTimeout(interrupt, remainingMs);
    if (context.signal) {
      abortListener = interrupt;
      context.signal.addEventListener("abort", abortListener, { once: true });
    }
    Promise.resolve(promise).then(
      (value) => settle(resolve, value),
      (error) => settle(reject, error)
    );
  });
}

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
  return [
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/html",
    "text/xml",
    "text/yaml",
    "application/json",
    "application/xml",
    "application/yaml"
  ].includes(normalized);
}

function isStructuredTextExtension(extension = "") {
  return [
    "txt",
    "md",
    "markdown",
    "json",
    "csv",
    "html",
    "htm",
    "xml",
    "yml",
    "yaml"
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
  if (["html", "htm", "xml"].includes(extension)) {
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

function boundedExtractedText(rawText = "", maxCharacters) {
  const normalized = normalizeExtractedText(rawText);
  if (normalized.length <= maxCharacters) {
    return {
      textContent: normalized,
      truncated: false
    };
  }
  return {
    textContent: normalized.slice(0, maxCharacters).trimEnd(),
    truncated: true
  };
}

function concatenateByteChunks(chunks, totalBytes) {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}

function toByteView(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  throw new AttachmentIngestionError(
    "O leitor do anexo devolveu dados binários inválidos.",
    "ATTACHMENT_INVALID_BINARY_DATA"
  );
}

function toStandaloneArrayBuffer(value) {
  const bytes = toByteView(value);
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  return bytes.slice().buffer;
}

function assertDeclaredReadLength(actualBytes, expectedBytes) {
  if (actualBytes !== expectedBytes) {
    throw new AttachmentIngestionError(
      "O tamanho entregue pelo leitor não corresponde ao tamanho declarado do arquivo.",
      "ATTACHMENT_SIZE_MISMATCH"
    );
  }
}

async function readFileBytes(file, {
  maxBytes,
  allowPrefix = false,
  context
} = {}) {
  assertWithinDeadline(context);
  const declaredSize = declaredFileSize(file);
  if (declaredSize === null) {
    throw new AttachmentIngestionError(
      "O arquivo não informa seu tamanho e não oferece leitura limitada; ele não foi lido.",
      "ATTACHMENT_UNBOUNDED_READER"
    );
  }
  if (!allowPrefix && declaredSize > maxBytes) {
    throw new AttachmentIngestionError(
      `O arquivo excede o limite de ${formatByteLimit(maxBytes)} e não foi lido.`,
      "ATTACHMENT_FILE_TOO_LARGE"
    );
  }

  if (typeof file?.stream === "function") {
    const stream = file.stream();
    const reader = stream?.getReader?.();
    if (!reader) {
      throw new AttachmentIngestionError(
        "O navegador não ofereceu um leitor seguro para o anexo.",
        "ATTACHMENT_READER_UNAVAILABLE"
      );
    }
    const chunks = [];
    let totalBytes = 0;
    let truncated = false;
    const cancelReader = () => reader.cancel().catch(() => {});

    try {
      while (true) {
        const result = await awaitWithinDeadline(
          reader.read(),
          context,
          { cleanup: cancelReader }
        );
        if (result?.done) {
          break;
        }
        const chunk = toByteView(result?.value);
        const remaining = maxBytes - totalBytes;
        if (chunk.byteLength > remaining) {
          if (!allowPrefix) {
            await cancelReader();
            throw new AttachmentIngestionError(
              `O arquivo excede o limite de ${formatByteLimit(maxBytes)} e não foi lido.`,
              "ATTACHMENT_FILE_TOO_LARGE"
            );
          }
          if (remaining > 0) {
            chunks.push(chunk.subarray(0, remaining));
            totalBytes += remaining;
          }
          truncated = true;
          await cancelReader();
          break;
        }
        chunks.push(chunk);
        totalBytes += chunk.byteLength;
        if (allowPrefix && totalBytes === maxBytes) {
          truncated = declaredSize === null || declaredSize > totalBytes;
          await cancelReader();
          break;
        }
      }
    } finally {
      reader.releaseLock?.();
    }
    assertDeclaredReadLength(
      totalBytes,
      Math.min(declaredSize, maxBytes)
    );

    return {
      bytes: concatenateByteChunks(chunks, totalBytes),
      truncated: truncated || (declaredSize !== null && declaredSize > totalBytes)
    };
  }

  if (typeof file?.slice === "function") {
    const sliceEnd = Math.min(
      Number.MAX_SAFE_INTEGER,
      maxBytes + 1
    );
    const slice = file.slice(0, sliceEnd);
    if (typeof slice?.arrayBuffer !== "function") {
      throw new AttachmentIngestionError(
        "O navegador não ofereceu um leitor seguro para o anexo.",
        "ATTACHMENT_READER_UNAVAILABLE"
      );
    }
    const bytes = toByteView(await awaitWithinDeadline(slice.arrayBuffer(), context));
    assertDeclaredReadLength(
      bytes.byteLength,
      Math.min(declaredSize, sliceEnd)
    );
    const overflow = bytes.byteLength > maxBytes;
    if (overflow && !allowPrefix) {
      throw new AttachmentIngestionError(
        `O arquivo excede o limite de ${formatByteLimit(maxBytes)} e não foi lido.`,
        "ATTACHMENT_FILE_TOO_LARGE"
      );
    }
    return {
      bytes: overflow ? bytes.subarray(0, maxBytes) : bytes,
      truncated: overflow || (declaredSize !== null && declaredSize > bytes.byteLength)
    };
  }

  if (typeof file?.arrayBuffer === "function") {
    const bytes = toByteView(await awaitWithinDeadline(file.arrayBuffer(), context));
    assertDeclaredReadLength(bytes.byteLength, declaredSize);
    const overflow = bytes.byteLength > maxBytes;
    if (overflow && !allowPrefix) {
      throw new AttachmentIngestionError(
        `O arquivo excede o limite de ${formatByteLimit(maxBytes)} e não foi lido.`,
        "ATTACHMENT_FILE_TOO_LARGE"
      );
    }
    return {
      bytes: overflow ? bytes.subarray(0, maxBytes) : bytes,
      truncated: overflow || declaredSize > bytes.byteLength
    };
  }

  throw new AttachmentIngestionError(
    "O navegador não ofereceu um leitor binário para o anexo.",
    "ATTACHMENT_READER_UNAVAILABLE"
  );
}

async function readStructuredText(file, {
  extension,
  limits,
  context
} = {}) {
  let rawText;
  let inputTruncated;

  if (!hasBinaryReader(file)) {
    throw new AttachmentIngestionError(
      "O navegador não ofereceu leitura limitada para o arquivo de texto.",
      "ATTACHMENT_READER_UNAVAILABLE"
    );
  }
  const result = await readFileBytes(file, {
    maxBytes: limits.maxTextPrefixBytes,
    allowPrefix: true,
    context
  });
  rawText = new TextDecoder("utf-8").decode(result.bytes);
  inputTruncated = result.truncated;

  const bounded = boundedExtractedText(
    normalizeStructuredText(rawText, extension),
    limits.maxExtractedCharacters
  );
  return {
    textContent: bounded.textContent,
    truncated: inputTruncated || bounded.truncated
  };
}

function normalizeForMatch(value = "") {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isHeadingLikeLine(value = "") {
  const normalized = text(value);
  if (!normalized || normalized.length > 120) {
    return false;
  }
  if (/^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9\s:/.-]{4,}$/u.test(normalized)) {
    return true;
  }
  if (
    /^[A-ZÀ-Ý][\p{L}\p{N}\s:/-]{2,80}$/u.test(normalized)
    && !/[.!?;]$/u.test(normalized)
    && normalized.split(/\s+/u).length <= 6
  ) {
    return true;
  }
  return /^([0-9]+(\.[0-9]+)*)\s+.+/.test(normalized);
}

function isListLikeLine(value = "") {
  return /^([•\-*]|[0-9]+[.)])\s+/.test(text(value));
}

function stripHeadingPrefix(value = "") {
  return text(value)
    .replace(/^([0-9]+(\.[0-9]+)*)\s+/u, "")
    .replace(/^([•\-*]|[0-9]+[.)])\s+/u, "")
    .replace(/[:\-–]\s*$/u, "")
    .trim();
}

function inferInstructionalRole(value = "", { blockType = "" } = {}) {
  const normalized = normalizeForMatch(stripHeadingPrefix(value));
  if (!normalized) {
    return "";
  }
  if (/\b(objetivo|objetivos|meta|metas|competencia|competencias|habilidade|habilidades)\b/u.test(normalized)) {
    return "objective";
  }
  if (/\b(exercicio|exercicios|atividade|atividades|questao|questoes|desafio|desafios|pratica)\b/u.test(normalized)) {
    return "exercise";
  }
  if (/\b(definicao|conceito|define-se|significa)\b/u.test(normalized)) {
    return "definition";
  }
  if (/\b(exemplo|exemplos|por exemplo|ilustracao|caso pratico)\b/u.test(normalized)) {
    return "example";
  }
  if (/\b(observacao|observacoes|atencao|lembrete|importante|nota)\b/u.test(normalized)) {
    return "note";
  }
  if (/\b(erro comum|erros comuns|pegadinha|pegadinhas|confusao|confusoes|cuidado)\b/u.test(normalized)) {
    return "misconception";
  }
  if (blockType === "list_item" && /\b(compare|classifique|resolva|explique|identifique|aplique|complete|justifique)\b/u.test(normalized)) {
    return "exercise";
  }
  return "";
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
  let activeRole = "";

  paragraphs.forEach((paragraph) => {
    const lines = paragraph
      .split(/\n/u)
      .map((entry) => text(entry))
      .filter(Boolean);
    if (!lines.length) {
      return;
    }

    if (lines.length === 1) {
      const blockType = inferBlockType(lines[0]);
      const instructionalRole = inferInstructionalRole(lines[0], { blockType }) || (blockType !== "heading" ? activeRole : "");
      blocks.push({
        blockType,
        instructionalRole,
        text: lines[0]
      });
      activeRole = blockType === "heading" ? instructionalRole : activeRole;
      return;
    }

    if (lines.every((line) => isListLikeLine(line))) {
      const roleFromList = inferInstructionalRole(lines.join(" "), { blockType: "list_item" }) || activeRole;
      lines.forEach((line) => {
        blocks.push({
          blockType: "list_item",
          instructionalRole: roleFromList,
          text: line
        });
      });
      return;
    }

    if (isHeadingLikeLine(lines[0])) {
      const headingRole = inferInstructionalRole(lines[0], { blockType: "heading" });
      blocks.push({
        blockType: "heading",
        instructionalRole: headingRole,
        text: lines[0]
      });
      const remainder = lines.slice(1).join(" ");
      if (text(remainder)) {
        blocks.push({
          blockType: "paragraph",
          instructionalRole: inferInstructionalRole(remainder, { blockType: "paragraph" }) || headingRole,
          text: remainder
        });
      }
      activeRole = headingRole;
      return;
    }

    blocks.push({
      blockType: "paragraph",
      instructionalRole: inferInstructionalRole(lines.join(" "), { blockType: "paragraph" }) || activeRole,
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

function findZipEndOfCentralDirectory(bytes, view) {
  const minimumOffset = Math.max(0, bytes.byteLength - (65_535 + 22));
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) {
      continue;
    }
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === bytes.byteLength) {
      return offset;
    }
  }
  return -1;
}

function decodeZipEntryName(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function assertSafeZipEntryName(name) {
  const normalized = String(name || "").replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (
    !normalized
    || normalized.startsWith("/")
    || /^[a-z]:\//iu.test(normalized)
    || segments.includes("..")
    || normalized.includes("\0")
  ) {
    throw new AttachmentIngestionError(
      "O DOCX contém um caminho interno inseguro e foi rejeitado.",
      "ATTACHMENT_DOCX_UNSAFE_PATH"
    );
  }
  return normalized;
}

function validateDocxArchive(arrayBuffer, {
  limits,
  context
} = {}) {
  const bytes = toByteView(arrayBuffer);
  if (bytes.byteLength < 22) {
    throw new AttachmentIngestionError(
      "O DOCX não contém uma estrutura ZIP válida.",
      "ATTACHMENT_DOCX_INVALID_ARCHIVE"
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findZipEndOfCentralDirectory(bytes, view);
  if (eocdOffset < 0) {
    throw new AttachmentIngestionError(
      "O DOCX não contém um diretório ZIP válido.",
      "ATTACHMENT_DOCX_INVALID_ARCHIVE"
    );
  }

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entriesOnDisk !== entryCount
    || entryCount === 0
    || entryCount === 0xffff
    || centralDirectoryOffset === 0xffffffff
    || centralDirectorySize === 0xffffffff
    || centralDirectoryEnd > eocdOffset
  ) {
    throw new AttachmentIngestionError(
      "O DOCX usa uma estrutura ZIP inválida ou não suportada.",
      "ATTACHMENT_DOCX_INVALID_ARCHIVE"
    );
  }
  if (entryCount > limits.maxDocxEntries) {
    throw new AttachmentIngestionError(
      `O DOCX contém ${entryCount} itens internos; o limite de segurança é ${limits.maxDocxEntries}.`,
      "ATTACHMENT_DOCX_TOO_MANY_ENTRIES"
    );
  }

  const names = new Set();
  let cursor = centralDirectoryOffset;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (index % 64 === 0) {
      assertWithinDeadline(context);
    }
    if (
      cursor + 46 > centralDirectoryEnd
      || view.getUint32(cursor, true) !== 0x02014b50
    ) {
      throw new AttachmentIngestionError(
        "O diretório interno do DOCX está corrompido.",
        "ATTACHMENT_DOCX_INVALID_ARCHIVE"
      );
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedBytes = view.getUint32(cursor + 20, true);
    const uncompressedBytes = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const startingDisk = view.getUint16(cursor + 34, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const nextCursor = cursor + 46 + nameLength + extraLength + commentLength;

    if (
      nextCursor > centralDirectoryEnd
      || startingDisk !== 0
      || compressedBytes === 0xffffffff
      || uncompressedBytes === 0xffffffff
      || localHeaderOffset === 0xffffffff
    ) {
      throw new AttachmentIngestionError(
        "O DOCX usa metadados ZIP inválidos ou ZIP64 não suportado.",
        "ATTACHMENT_DOCX_INVALID_ARCHIVE"
      );
    }
    if ((flags & 0x0001) !== 0) {
      throw new AttachmentIngestionError(
        "DOCX protegido por senha não pode ser usado como anexo.",
        "ATTACHMENT_DOCX_ENCRYPTED"
      );
    }
    if (![0, 8].includes(compressionMethod)) {
      throw new AttachmentIngestionError(
        "O DOCX usa um método de compactação não suportado.",
        "ATTACHMENT_DOCX_UNSUPPORTED_COMPRESSION"
      );
    }

    const entryName = assertSafeZipEntryName(
      decodeZipEntryName(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    );
    if (names.has(entryName)) {
      throw new AttachmentIngestionError(
        "O DOCX contém itens internos duplicados e foi rejeitado.",
        "ATTACHMENT_DOCX_DUPLICATE_ENTRY"
      );
    }
    names.add(entryName);

    if (
      localHeaderOffset + 30 > centralDirectoryOffset
      || view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      throw new AttachmentIngestionError(
        "O DOCX contém uma entrada interna inválida.",
        "ATTACHMENT_DOCX_INVALID_ARCHIVE"
      );
    }
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localCompressionMethod = view.getUint16(localHeaderOffset + 8, true);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const contentOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const localEntryName = assertSafeZipEntryName(
      decodeZipEntryName(bytes.subarray(
        localHeaderOffset + 30,
        localHeaderOffset + 30 + localNameLength
      ))
    );
    if (
      localFlags !== flags
      || localCompressionMethod !== compressionMethod
      || localEntryName !== entryName
      || contentOffset > centralDirectoryOffset
      || contentOffset + compressedBytes > centralDirectoryOffset
    ) {
      throw new AttachmentIngestionError(
        "O DOCX contém uma entrada interna fora dos limites do arquivo.",
        "ATTACHMENT_DOCX_INVALID_ARCHIVE"
      );
    }

    if (uncompressedBytes > limits.maxDocxEntryUncompressedBytes) {
      throw new AttachmentIngestionError(
        `O DOCX contém um item descompactado acima de ${formatByteLimit(limits.maxDocxEntryUncompressedBytes)} e foi rejeitado.`,
        "ATTACHMENT_DOCX_ENTRY_TOO_LARGE"
      );
    }
    if (
      (compressionMethod === 0 && compressedBytes !== uncompressedBytes)
      || (
        uncompressedBytes > 0
        && (
          compressedBytes === 0
          || uncompressedBytes / compressedBytes > limits.maxDocxCompressionRatio
        )
      )
    ) {
      throw new AttachmentIngestionError(
        `O DOCX contém um item com taxa de descompactação acima do limite seguro de ${limits.maxDocxCompressionRatio}:1.`,
        "ATTACHMENT_DOCX_SUSPICIOUS_COMPRESSION"
      );
    }
    totalCompressedBytes += compressedBytes;
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > limits.maxDocxUncompressedBytes) {
      throw new AttachmentIngestionError(
        `O DOCX ultrapassa ${formatByteLimit(limits.maxDocxUncompressedBytes)} após descompactação e foi rejeitado.`,
        "ATTACHMENT_DOCX_UNCOMPRESSED_TOO_LARGE"
      );
    }
    cursor = nextCursor;
  }

  if (
    cursor !== centralDirectoryEnd
    || !names.has("[Content_Types].xml")
    || !names.has("word/document.xml")
  ) {
    throw new AttachmentIngestionError(
      "O arquivo não contém a estrutura mínima de um DOCX válido.",
      "ATTACHMENT_DOCX_INVALID_STRUCTURE"
    );
  }
  if (
    totalUncompressedBytes > 0
    && (
      totalCompressedBytes === 0
      || totalUncompressedBytes / totalCompressedBytes > limits.maxDocxCompressionRatio
    )
  ) {
    throw new AttachmentIngestionError(
      `O DOCX apresenta taxa de descompactação acima do limite seguro de ${limits.maxDocxCompressionRatio}:1.`,
      "ATTACHMENT_DOCX_SUSPICIOUS_COMPRESSION"
    );
  }
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

async function extractPdfTextFromArrayBuffer(arrayBuffer, {
  loadPdfjsModule = loadPdfjs,
  limits,
  context
} = {}) {
  assertWithinDeadline(context);
  const pdfjs = await awaitWithinDeadline(loadPdfjsModule(), context);
  if (pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL.href;
  }
  const loadingTask = pdfjs.getDocument({
    data: toByteView(arrayBuffer)
  });
  let documentHandle = null;
  const pages = [];
  let collectedCharacters = 0;
  let truncated = false;
  const rawCharacterLimit = limits.maxExtractedCharacters * 2;

  try {
    documentHandle = await awaitWithinDeadline(
      loadingTask.promise,
      context,
      { cleanup: () => loadingTask.destroy?.() }
    );
    const pageCount = Number(documentHandle?.numPages);
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
      throw new AttachmentIngestionError(
        "O PDF não informa uma quantidade válida de páginas.",
        "ATTACHMENT_PDF_INVALID_PAGE_COUNT"
      );
    }
    if (pageCount > limits.maxPdfPages) {
      throw new AttachmentIngestionError(
        `O PDF tem ${pageCount} páginas; o limite para assistência é ${limits.maxPdfPages}.`,
        "ATTACHMENT_PDF_TOO_MANY_PAGES"
      );
    }

    pageLoop:
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      assertWithinDeadline(context);
      const page = await awaitWithinDeadline(
        documentHandle.getPage(pageNumber),
        context,
        { cleanup: () => documentHandle.destroy?.() }
      );
      try {
        const textContent = await awaitWithinDeadline(
          page.getTextContent(),
          context,
          { cleanup: () => documentHandle.destroy?.() }
        );
        const lines = [];
        let currentLine = [];
        const items = Array.isArray(textContent?.items) ? textContent.items : [];

        for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
          if (itemIndex % 128 === 0) {
            assertWithinDeadline(context);
          }
          const item = items[itemIndex];
          const chunk = text(item?.str);
          if (chunk) {
            const separatorCharacters = currentLine.length ? 1 : 0;
            const remainingCharacters = rawCharacterLimit
              - collectedCharacters
              - separatorCharacters;
            if (remainingCharacters <= 0) {
              truncated = true;
              if (currentLine.length) {
                lines.push(currentLine.join(" "));
              }
              pages.push({ pageNumber, lines });
              break pageLoop;
            }
            const acceptedChunk = chunk.slice(0, remainingCharacters);
            currentLine.push(acceptedChunk);
            collectedCharacters += acceptedChunk.length + separatorCharacters;
            if (acceptedChunk.length < chunk.length) {
              truncated = true;
            }
          }
          if (item?.hasEOL) {
            lines.push(currentLine.join(" "));
            currentLine = [];
            collectedCharacters += 1;
          }
          if (truncated || collectedCharacters >= rawCharacterLimit) {
            if (currentLine.length) {
              lines.push(currentLine.join(" "));
            }
            pages.push({ pageNumber, lines });
            truncated = true;
            break pageLoop;
          }
        }
        if (currentLine.length) {
          lines.push(currentLine.join(" "));
        }
        pages.push({
          pageNumber,
          lines
        });
      } finally {
        page.cleanup?.();
      }
    }

    const bounded = boundedExtractedText(
      buildCleanPdfTextFromPages(pages),
      limits.maxExtractedCharacters
    );
    return {
      textContent: bounded.textContent,
      truncated: truncated || bounded.truncated,
      pageCount
    };
  } finally {
    if (documentHandle && typeof documentHandle.destroy === "function") {
      await Promise.resolve(documentHandle.destroy()).catch(() => {});
    } else if (typeof loadingTask?.destroy === "function") {
      await Promise.resolve(loadingTask.destroy()).catch(() => {});
    }
  }
}

async function extractDocxTextFromArrayBuffer(arrayBuffer, {
  loadMammothLib = loadMammoth,
  limits,
  context
} = {}) {
  validateDocxArchive(arrayBuffer, { limits, context });
  assertWithinDeadline(context);
  const mammoth = await awaitWithinDeadline(loadMammothLib(), context);
  assertWithinDeadline(context);
  const result = await awaitWithinDeadline(
    mammoth.extractRawText({ arrayBuffer: toStandaloneArrayBuffer(arrayBuffer) }),
    context
  );
  const bounded = boundedExtractedText(
    result?.value || "",
    limits.maxExtractedCharacters
  );
  return {
    textContent: bounded.textContent,
    truncated: bounded.truncated,
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

export async function ingestAttachments(files = [], options = {}) {
  const ingested = [];
  const warnings = [];
  const {
    loadPdfjsModule = loadPdfjs,
    loadMammothLib = loadMammoth,
    signal = null
  } = options;
  const limits = resolveIngestionLimits(options?.limits);
  const candidates = Array.isArray(files) ? files.slice(0, limits.maxFiles) : [];
  const omittedCount = Math.max(0, (Array.isArray(files) ? files.length : 0) - candidates.length);
  const totalDeadlineAt = Date.now() + limits.totalTimeoutMs;
  let budgetedBytes = 0;

  if (omittedCount > 0) {
    warnings.push(
      `Foram enviados mais de ${limits.maxFiles} anexos; ${omittedCount} arquivo(s) excedente(s) não foram lidos.`
    );
  }

  for (const [index, file] of candidates.entries()) {
    const name = text(file?.name) || `Anexo ${index + 1}`;
    const mimeType = text(file?.type) || "application/octet-stream";
    const extension = inferExtension(name);
    const binaryReaderAvailable = hasBinaryReader(file);
    const isStructuredText = extension
      ? isStructuredTextExtension(extension)
      : isLikelyTextMime(mimeType);
    const isPdf = isPdfLike({ extension, mimeType });
    const isDocx = isDocxLike({ extension, mimeType });
    const format = isPdf ? "PDF" : isDocx ? "DOCX" : isStructuredText ? "texto" : "";
    const maxFileBytes = isPdf
      ? limits.maxPdfBytes
      : isDocx
        ? limits.maxDocxBytes
        : limits.maxTextBytes;
    const fileSize = declaredFileSize(file);
    const context = createDeadlineContext({
      signal,
      deadlineAt: Math.min(
        totalDeadlineAt,
        Date.now() + limits.perFileTimeoutMs
      ),
      fileName: name
    });

    if (!format) {
      ingested.push(createAttachmentRecord(index, file, {
        ingestionWarnings: ["ingestão textual ainda não suportada para este formato."]
      }));
      warnings.push(`${name}: ingestão textual ainda não suportada para este formato.`);
      continue;
    }
    if (!binaryReaderAvailable) {
      const message = "o navegador não ofereceu leitura limitada para este arquivo.";
      ingested.push(createAttachmentRecord(index, file, {
        ingestionStatus: "failed",
        ingestionWarnings: [message]
      }));
      warnings.push(`${name}: ${message}`);
      continue;
    }

    if (fileSize === null) {
      const message = "o arquivo não informa seu tamanho e foi rejeitado antes da leitura.";
      ingested.push(createAttachmentRecord(index, file, {
        ingestionStatus: "failed",
        ingestionWarnings: [message]
      }));
      warnings.push(`${name}: ${message}`);
      continue;
    }
    if (fileSize > maxFileBytes) {
      const message = `o ${format} excede o limite de ${formatByteLimit(maxFileBytes)} e não foi lido.`;
      ingested.push(createAttachmentRecord(index, file, {
        ingestionStatus: "failed",
        ingestionWarnings: [message]
      }));
      warnings.push(`${name}: ${message}`);
      continue;
    }
    if (budgetedBytes + fileSize > limits.maxTotalBytes) {
      const message = `o conjunto de anexos excede o limite total de ${formatByteLimit(limits.maxTotalBytes)}; este arquivo não foi lido.`;
      ingested.push(createAttachmentRecord(index, file, {
        ingestionStatus: "failed",
        ingestionWarnings: [message]
      }));
      warnings.push(`${name}: ${message}`);
      continue;
    }
    budgetedBytes += fileSize;

    if (isPdf) {
      try {
        const binary = await readFileBytes(file, {
          maxBytes: limits.maxPdfBytes,
          context
        });
        const result = await extractPdfTextFromArrayBuffer(binary.bytes, {
          loadPdfjsModule,
          limits,
          context
        });
        const record = createAttachmentRecord(index, file, {
          textContent: result.textContent,
          sourceBlocks: splitStructuredBlocks(result.textContent),
          ingestionStatus: result.textContent && !result.truncated ? "supported" : "partial"
        });
        if (result.truncated) {
          record.ingestionWarnings.push(
            `texto limitado a ${limits.maxExtractedCharacters} caracteres durante a ingestão.`
          );
        }
        if (!result.textContent) {
          record.ingestionWarnings = ["PDF lido, mas sem texto utilizável extraído."];
        }
        record.ingestionWarnings.forEach((warning) => warnings.push(`${name}: ${warning}`));
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

    if (isDocx) {
      try {
        const binary = await readFileBytes(file, {
          maxBytes: limits.maxDocxBytes,
          context
        });
        const result = await extractDocxTextFromArrayBuffer(binary.bytes, {
          loadMammothLib,
          limits,
          context
        });
        const record = createAttachmentRecord(index, file, {
          textContent: result.textContent,
          sourceBlocks: splitStructuredBlocks(result.textContent),
          ingestionStatus: result.textContent && !result.truncated ? "supported" : "partial",
          ingestionWarnings: result.warnings
        });
        if (result.truncated) {
          record.ingestionWarnings = [
            ...record.ingestionWarnings,
            `texto limitado a ${limits.maxExtractedCharacters} caracteres durante a ingestão.`
          ];
        }
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

    try {
      const result = await readStructuredText(file, {
        extension,
        limits,
        context
      });
      const record = createAttachmentRecord(index, file, {
        textContent: result.textContent,
        sourceBlocks: splitStructuredBlocks(result.textContent),
        ingestionStatus: result.textContent && !result.truncated ? "supported" : "partial"
      });
      if (result.truncated) {
        record.ingestionWarnings.push(
          `somente o início do arquivo foi usado, limitado a ${limits.maxExtractedCharacters} caracteres.`
        );
      }
      if (!result.textContent) {
        record.ingestionWarnings.push("arquivo lido, mas sem texto utilizável após ingestão.");
      }
      record.ingestionWarnings.forEach((warning) => warnings.push(`${name}: ${warning}`));
      ingested.push(record);
    } catch (error) {
      const message = text(error?.message) || "Falha ao ler o arquivo de texto.";
      ingested.push(createAttachmentRecord(index, file, {
        ingestionStatus: "failed",
        ingestionWarnings: [message]
      }));
      warnings.push(`${name}: ${message}`);
    }
  }

  return {
    attachments: ingested,
    warnings,
    extractedCount: ingested.filter((item) => text(item?.textContent)).length
  };
}
