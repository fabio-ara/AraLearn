import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DOCUMENTATION_SEARCH_LOG = "docs/evidence/registro-buscas-bibliograficas.csv";
const ROOT_DOCUMENTS = new Set(["README.md", "LICENSE.md", "CHANGELOG.md", "CONTRIBUTING.md"]);
// Esses capítulos definem o uso dos contratos pelos clientes reais. Uma edição
// neles precisa ser confrontada com o runtime, mesmo quando só muda Markdown.
const CONTRACT_DOCUMENTS = new Set([
  "docs/aralearn-contract.md",
  "docs/autoria-actions.md",
  "docs/autoria-mcp.md"
]);

function normalizeRepositoryPath(value) {
  const candidate = String(value || "");
  if (
    !candidate ||
    candidate !== candidate.trim() ||
    candidate.includes("\\") ||
    candidate.startsWith("/") ||
    candidate.includes("\0")
  ) {
    return "";
  }
  const segments = candidate.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return "";
  }
  return candidate;
}

export function isDocumentationPath(value) {
  const repositoryPath = normalizeRepositoryPath(value);
  if (!repositoryPath) return false;
  if (/^(?:.*\/)?(?:AGENTS(?:\.override)?|SKILL)\.md$/u.test(repositoryPath)) return false;
  if (CONTRACT_DOCUMENTS.has(repositoryPath)) return false;
  if (ROOT_DOCUMENTS.has(repositoryPath)) return true;
  if (repositoryPath === DOCUMENTATION_SEARCH_LOG) return true;
  // Downloads, instruções e pastas novas não recebem dispensa por extensão.
  // O OpenAPI publicado é um artefato de runtime, não documentação inofensiva.
  if (/^docs\/[^/]+\.(?:md|bib)$/u.test(repositoryPath)) return true;
  return /^ux-atlas\/.+\.md$/u.test(repositoryPath);
}

export function classifyChangedPaths(paths) {
  const candidates = Array.from(paths || []);
  if (candidates.length === 0) return false;
  const changedPaths = candidates.map(normalizeRepositoryPath);
  return changedPaths.every((repositoryPath) =>
    repositoryPath && isDocumentationPath(repositoryPath));
}

export function classifyGitDiff(output) {
  if (typeof output !== "string" || !output.endsWith("\0")) return false;
  const entries = output.slice(0, -1).split("\0");
  if (entries.length % 2 !== 0) return false;
  const paths = [];
  for (let index = 0; index < entries.length; index += 2) {
    // --no-renames apresenta origem removida e destino novo separadamente.
    // Mudança de tipo, conflito ou estado desconhecido exige o gate integral.
    if (!["A", "M", "D"].includes(entries[index])) return false;
    paths.push(entries[index + 1]);
  }
  return classifyChangedPaths(paths);
}

function writeResult(docsOnly, outputPath = "") {
  const line = `docs_only=${docsOnly ? "true" : "false"}`;
  process.stdout.write(`${line}\n`);
  if (outputPath) fs.appendFileSync(outputPath, `${line}\n`, "utf8");
}

function classifyStandardInput() {
  const paths = fs.readFileSync(0, "utf8").split(/\r?\n/u).filter(Boolean);
  writeResult(classifyChangedPaths(paths));
}

function classifyGitHubPullRequest() {
  let docsOnly;
  try {
    if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
      writeResult(false, process.env.GITHUB_OUTPUT);
      return;
    }
    const eventPath = String(process.env.GITHUB_EVENT_PATH || "").trim();
    const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    const baseSha = String(event?.pull_request?.base?.sha || "").trim();
    const headSha = String(event?.pull_request?.head?.sha || "").trim();
    if (!SHA_PATTERN.test(baseSha) || !SHA_PATTERN.test(headSha)) {
      throw new Error("SHAs da pull request ausentes ou inválidos.");
    }
    const comparison = spawnSync(
      "git",
      ["diff", "-z", "--name-status", "--no-renames", `${baseSha}...${headSha}`, "--"],
      { encoding: "utf8" }
    );
    if (comparison.status !== 0 || comparison.error) {
      throw comparison.error || new Error(comparison.stderr || "Falha ao comparar a pull request.");
    }
    docsOnly = classifyGitDiff(comparison.stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Classificação inconclusiva; usando pipeline integral: ${message}\n`);
    docsOnly = false;
  }
  writeResult(docsOnly, process.env.GITHUB_OUTPUT);
}

const modulePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (modulePath.toLowerCase() === invokedPath.toLowerCase()) {
  if (process.argv.includes("--stdin")) {
    classifyStandardInput();
  } else {
    classifyGitHubPullRequest();
  }
}
