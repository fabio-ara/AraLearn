import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DOCUMENTATION_SEARCH_LOG = "docs/evidence/registro-buscas-bibliograficas.csv";

function normalizeRepositoryPath(value) {
  const candidate = String(value || "").trim();
  if (
    !candidate ||
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
  if (!repositoryPath.includes("/") && repositoryPath.endsWith(".md")) return true;
  if (repositoryPath === DOCUMENTATION_SEARCH_LOG) return true;
  if (/^docs\/.+\.(?:md|bib)$/u.test(repositoryPath)) return true;
  return /^ux-atlas\/.+\.md$/u.test(repositoryPath);
}

export function classifyChangedPaths(paths) {
  const candidates = Array.from(paths || []);
  if (candidates.length === 0) return false;
  const changedPaths = candidates.map(normalizeRepositoryPath);
  return changedPaths.every((repositoryPath) =>
    repositoryPath && isDocumentationPath(repositoryPath));
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
      ["diff", "-z", "--name-only", "--diff-filter=ACMRD", `${baseSha}...${headSha}`, "--"],
      { encoding: "utf8" }
    );
    if (comparison.status !== 0 || comparison.error) {
      throw comparison.error || new Error(comparison.stderr || "Falha ao comparar a pull request.");
    }
    const changedPaths = comparison.stdout.split("\0").filter(Boolean);
    docsOnly = classifyChangedPaths(changedPaths);
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
