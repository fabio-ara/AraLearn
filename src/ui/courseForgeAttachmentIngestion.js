function text(value) {
  return typeof value === "string" ? value.trim() : "";
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

function stripHtmlToText(rawHtml = "") {
  const html = normalizeLineEndings(rawHtml);
  if (typeof DOMParser === "function") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
    doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    doc.querySelectorAll("p, div, section, article, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr").forEach((node) => {
      node.append("\n");
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
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|pre|blockquote|tr)>/gi, "\n")
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

export async function ingestCourseForgeAttachments(files = []) {
  const ingested = [];
  const warnings = [];

  for (const [index, file] of (Array.isArray(files) ? files : []).entries()) {
    const name = text(file?.name) || `Anexo ${index + 1}`;
    const mimeType = text(file?.type) || "application/octet-stream";
    const extension = inferExtension(name);
    const canReadAsStructuredText =
      typeof file?.text === "function" && (isLikelyTextMime(mimeType) || isStructuredTextExtension(extension));

    if (!canReadAsStructuredText) {
      ingested.push({
        id: `attachment_${index + 1}`,
        name,
        kind: "attachment",
        mimeType,
        fileRef: buildAttachmentReference(file),
        textContent: ""
      });
      warnings.push(`${name}: ingestão textual ainda não suportada para este formato.`);
      continue;
    }

    const rawText = await file.text();
    const textContent = normalizeStructuredText(rawText, extension);
    ingested.push({
      id: `attachment_${index + 1}`,
      name,
      kind: "attachment",
      mimeType,
      fileRef: buildAttachmentReference(file),
      textContent
    });
    if (!textContent) {
      warnings.push(`${name}: arquivo lido, mas sem texto utilizável após ingestão.`);
    }
  }

  return {
    attachments: ingested,
    warnings,
    extractedCount: ingested.filter((item) => text(item?.textContent)).length
  };
}
