import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
const MARKDOWN_LINK = /(?<!!)\[[^\]]+\]\(([^)]+)\)/gu;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/gmu;
const TEXT_EXTENSIONS = new Set([".html", ".js", ".json", ".md", ".mjs", ".ts", ".txt", ".yaml", ".yml"]);
const CONTEXTUAL_IDENTIFIERS = Object.freeze([
  { pattern: /\bDataprev\b/iu, label: "instituição particular Dataprev" },
  { pattern: /\bFGV\b/u, label: "banca particular FGV" },
  { pattern: /\bSENAI\b/u, label: "instituição particular SENAI" },
  { pattern: /Analista de Processamento/iu, label: "cargo particular" }
]);
const CONTEXTUAL_CONTENT_EXCEPTIONS = new Set([
  "supabase/fixtures/catalog/catalog-fixtures.json",
  "supabase/fixtures/catalog/dataprev-analista-processamento-seed-course.json"
]);

function walkFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(target, predicate));
    else if (entry.isFile() && predicate(target)) result.push(target);
  }
  return result;
}

function markdownFiles(root) {
  const files = [];
  const readme = path.join(root, "README.md");
  if (fs.existsSync(readme)) files.push(readme);
  for (const directory of ["docs", "authoring"]) {
    files.push(...walkFiles(path.join(root, directory), (file) => file.endsWith(".md")));
  }
  return [...new Set(files)].sort();
}

function neutralityFiles(root, markdown) {
  const files = new Set(markdown);
  for (const directory of ["docs", "authoring", "public", "src/ui", "supabase/fixtures/catalog", "tests/fixtures/course-catalog"]) {
    for (const file of walkFiles(path.join(root, directory), (target) => TEXT_EXTENSIONS.has(path.extname(target)))) {
      files.add(file);
    }
  }
  return [...files].sort();
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll("\\", "/");
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

function headingList(source) {
  return [...source.matchAll(HEADING)].map((match) => ({
    depth: match[1].length,
    title: match[2],
    index: match.index
  }));
}

function anchors(source) {
  const result = new Set();
  const occurrences = new Map();
  for (const heading of headingList(source)) {
    const base = slugText(heading.title);
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

function isGeneratedKnowledgeBundle(root, file) {
  return relativePath(root, file).startsWith("docs/downloads/authoring/aralearn-chatgpt-knowledge-");
}

function auditHeadingStructure({ root, file, source, errors }) {
  if (isGeneratedKnowledgeBundle(root, file)) return;
  const headings = headingList(source);
  const firstLevel = headings.filter((heading) => heading.depth === 1);
  if (firstLevel.length !== 1) {
    errors.push(`${relativePath(root, file)}: esperado exatamente um título H1; encontrados ${firstLevel.length}`);
  }
  let previousDepth = 0;
  for (const heading of headings) {
    if (previousDepth && heading.depth > previousDepth + 1) {
      errors.push(
        `${relativePath(root, file)}:${lineNumber(source, heading.index)}: nível de heading salta de H${previousDepth} para H${heading.depth}`
      );
    }
    previousDepth = heading.depth;
  }
}

export function auditDocumentation({ root = defaultRoot } = {}) {
  const markdown = markdownFiles(root);
  const sources = new Map(markdown.map((file) => [file, fs.readFileSync(file, "utf8")]));
  const anchorsByFile = new Map(markdown.map((file) => [file, anchors(sources.get(file))]));
  const errors = [];
  const publicTitles = new Map();

  for (const file of markdown) {
    const source = sources.get(file);
    auditHeadingStructure({ root, file, source, errors });
    if (relativePath(root, file).startsWith("docs/") && !isGeneratedKnowledgeBundle(root, file)) {
      const title = headingList(source).find((heading) => heading.depth === 1)?.title;
      if (title) {
        const key = slugText(title);
        const previous = publicTitles.get(key);
        if (previous) errors.push(`${relativePath(root, file)}: título público duplicado com ${relativePath(root, previous)}`);
        else publicTitles.set(key, file);
      }
    }
    for (const match of source.matchAll(MARKDOWN_LINK)) {
      const rawTarget = match[1].trim();
      if (/^(?:https?:|mailto:|tel:)/iu.test(rawTarget)) continue;
      const { pathPart, anchor } = normalizedTarget(rawTarget);
      const targetFile = path.resolve(path.dirname(file), pathPart || path.basename(file));
      if (!fs.existsSync(targetFile)) {
        errors.push(`${relativePath(root, file)}:${lineNumber(source, match.index)}: link inexistente ${rawTarget}`);
        continue;
      }
      if (anchor && targetFile.endsWith(".md")) {
        const targetSource = sources.get(targetFile) || fs.readFileSync(targetFile, "utf8");
        const targetAnchors = anchorsByFile.get(targetFile) || anchors(targetSource);
        if (!targetAnchors.has(anchor.toLocaleLowerCase("pt-BR"))) {
          errors.push(`${relativePath(root, file)}:${lineNumber(source, match.index)}: âncora inexistente ${rawTarget}`);
        }
      }
    }
  }

  for (const file of neutralityFiles(root, markdown)) {
    const relative = relativePath(root, file);
    if (CONTEXTUAL_CONTENT_EXCEPTIONS.has(relative)) continue;
    const source = sources.get(file) || fs.readFileSync(file, "utf8");
    for (const identifier of CONTEXTUAL_IDENTIFIERS) {
      const match = identifier.pattern.exec(source);
      if (match) errors.push(`${relative}:${lineNumber(source, match.index)}: ${identifier.label}`);
    }
  }

  const rootReadme = sources.get(path.join(root, "README.md")) || "";
  const docsReadme = sources.get(path.join(root, "docs", "README.md")) || "";
  const indexes = `${rootReadme}\n${docsReadme}`;
  for (const file of markdown.filter((current) => path.dirname(current) === path.join(root, "docs"))) {
    if (path.basename(file) === "README.md") continue;
    const relative = path.basename(file);
    if (!indexes.includes(relative) && !indexes.includes(`docs/${relative}`)) {
      errors.push(`${relativePath(root, file)}: documento sem entrada nos índices`);
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
    console.log("Documentação pública, materiais de autoria e textos de interface auditados.");
  }
}
