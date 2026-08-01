import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
const MARKDOWN_LINK = /(?<!!)\[[^\]]+\]\(([^)]+)\)/gu;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/gmu;
const CONTEXTUAL_IDENTIFIERS = Object.freeze([
  { pattern: /\bDataprev\b/iu, label: "instituição particular Dataprev" },
  { pattern: /\bFGV\b/u, label: "banca particular FGV" },
  { pattern: /\bSENAI\b/u, label: "instituição particular SENAI" },
  { pattern: /Analista de Processamento/iu, label: "cargo particular" }
]);

function markdownFiles(root) {
  const files = [path.join(root, "README.md")];
  const docs = path.join(root, "docs");
  for (const entry of fs.readdirSync(docs, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.join(docs, entry.name));
  }
  return files;
}

function slugText(value) {
  return value
    .replace(/<[^>]*>/gu, "")
    .replace(/[`*~]/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-");
}

function anchors(source) {
  const result = new Set();
  const occurrences = new Map();
  for (const match of source.matchAll(HEADING)) {
    const base = slugText(match[2]);
    const occurrence = occurrences.get(base) || 0;
    occurrences.set(base, occurrence + 1);
    result.add(occurrence ? `${base}-${occurrence}` : base);
  }
  return result;
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length;
}

function normalizedTarget(rawTarget) {
  const value = String(rawTarget).trim().replace(/^<|>$/gu, "");
  const hashAt = value.indexOf("#");
  return {
    pathPart: decodeURIComponent(hashAt >= 0 ? value.slice(0, hashAt) : value),
    anchor: decodeURIComponent(hashAt >= 0 ? value.slice(hashAt + 1) : "")
  };
}

export function auditDocumentation({ root = defaultRoot } = {}) {
  const files = markdownFiles(root);
  const sources = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
  const anchorsByFile = new Map(files.map((file) => [file, anchors(sources.get(file))]));
  const errors = [];

  for (const file of files) {
    const source = sources.get(file);
    for (const match of source.matchAll(MARKDOWN_LINK)) {
      const rawTarget = match[1].trim();
      if (/^(?:https?:|mailto:)/iu.test(rawTarget)) continue;
      const { pathPart, anchor } = normalizedTarget(rawTarget);
      const targetFile = path.resolve(path.dirname(file), pathPart || path.basename(file));
      if (!fs.existsSync(targetFile)) {
        errors.push(`${path.relative(root, file)}:${lineNumber(source, match.index)}: link inexistente ${rawTarget}`);
        continue;
      }
      if (anchor && targetFile.endsWith(".md")) {
        const targetSource = sources.get(targetFile) || fs.readFileSync(targetFile, "utf8");
        const targetAnchors = anchorsByFile.get(targetFile) || anchors(targetSource);
        if (!targetAnchors.has(anchor.toLocaleLowerCase("pt-BR"))) {
          errors.push(`${path.relative(root, file)}:${lineNumber(source, match.index)}: âncora inexistente ${rawTarget}`);
        }
      }
    }
    for (const identifier of CONTEXTUAL_IDENTIFIERS) {
      const match = identifier.pattern.exec(source);
      if (match) {
        errors.push(`${path.relative(root, file)}:${lineNumber(source, match.index)}: ${identifier.label}`);
      }
    }
  }

  const indexes = `${sources.get(path.join(root, "README.md"))}\n${sources.get(path.join(root, "docs", "README.md"))}`;
  for (const file of files.filter((current) => current.startsWith(path.join(root, "docs")))) {
    if (path.basename(file) === "README.md") continue;
    const relative = path.relative(path.join(root, "docs"), file).replaceAll("\\", "/");
    if (!indexes.includes(relative) && !indexes.includes(`docs/${relative}`)) {
      errors.push(`${path.relative(root, file)}: documento sem entrada nos índices`);
    }
  }
  return errors;
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  const errors = auditDocumentation();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Documentação pública auditada.");
  }
}
