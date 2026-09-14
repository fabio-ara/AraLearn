import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCandidateApplicability } from "./candidateApplicability.mjs";
import { classifyValidationImpact, isDocumentationPath, normalizeRepositoryPath } from "./validationImpact.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
export { isDocumentationPath };

export function classifyChangedPaths(paths) {
  const candidates = Array.from(paths || []);
  if (candidates.length === 0) return false;
  const changedPaths = candidates.map(normalizeRepositoryPath);
  return changedPaths.every((repositoryPath) =>
    repositoryPath && isDocumentationPath(repositoryPath));
}

export function parseGitDiffPaths(output) {
  if (typeof output !== "string" || !output.endsWith("\0")) return null;
  const entries = output.slice(0, -1).split("\0");
  if (entries.length % 2 !== 0) return null;
  const paths = [];
  for (let index = 0; index < entries.length; index += 2) {
    // --no-renames apresenta origem removida e destino novo separadamente.
    // Mudança de tipo, conflito ou estado desconhecido exige o gate integral.
    if (!["A", "M", "D"].includes(entries[index]) || !normalizeRepositoryPath(entries[index + 1])) return null;
    paths.push(entries[index + 1]);
  }
  return paths;
}

export function classifyGitDiff(output) {
  return classifyChangedPaths(parseGitDiffPaths(output));
}

export function classifyCiImpact(paths, options = {}) {
  const impact = classifyValidationImpact(paths, options);
  return {
    ...impact,
    applicability: createCandidateApplicability(impact, {
      baseSha: options.baseSha ?? null,
      headSha: options.headSha,
      conclusive: options.conclusive ?? true
    })
  };
}

function writeResult(result, outputPath = "", json = false) {
  const line = `docs_only=${result.docsOnly ? "true" : "false"}`;
  process.stdout.write(json ? `${JSON.stringify(result)}\n` : `${line}\n`);
  if (outputPath) fs.appendFileSync(outputPath, [
    line,
    `requires_supabase=${result.requires.supabase}`,
    `requires_web=${result.requires.web}`,
    `requires_android=${result.requires.android}`,
    `applicability=${JSON.stringify(result.applicability)}`,
    `categories=${JSON.stringify(result.categories)}`
  ].join("\n") + "\n", "utf8");
}

function classifyStandardInput() {
  const paths = fs.readFileSync(0, "utf8").split(/\r?\n/u).filter(Boolean);
  const headSha = String(process.env.HEAD_SHA || process.env.GITHUB_SHA || "").trim() ||
    spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const baseSha = String(process.env.BASE_SHA || "").trim() || null;
  writeResult(classifyCiImpact(paths, { baseSha, headSha }), process.env.GITHUB_OUTPUT, process.argv.includes("--json"));
}

function classifyGitHubPullRequest() {
  let paths = null;
  let baseSha = null;
  let headSha = String(process.env.GITHUB_SHA || "").trim() ||
    spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  let conclusive = false;
  try {
    if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
      writeResult(classifyCiImpact(null, { baseSha, headSha, conclusive }), process.env.GITHUB_OUTPUT);
      return;
    }
    const eventPath = String(process.env.GITHUB_EVENT_PATH || "").trim();
    const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    const eventBaseSha = String(event?.pull_request?.base?.sha || "").trim();
    const eventHeadSha = String(event?.pull_request?.head?.sha || "").trim();
    if (!SHA_PATTERN.test(eventBaseSha) || !SHA_PATTERN.test(eventHeadSha)) {
      throw new Error("SHAs da pull request ausentes ou inválidos.");
    }
    baseSha = eventBaseSha;
    headSha = eventHeadSha;
    const comparison = spawnSync(
      "git",
      ["diff", "-z", "--name-status", "--no-renames", `${baseSha}...${headSha}`, "--"],
      { encoding: "utf8" }
    );
    if (comparison.status !== 0 || comparison.error) {
      throw comparison.error || new Error(comparison.stderr || "Falha ao comparar a pull request.");
    }
    paths = parseGitDiffPaths(comparison.stdout);
    if (!paths) throw new Error("O diff contém estado ou caminho não reconhecido.");
    conclusive = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Classificação inconclusiva; usando pipeline integral: ${message}\n`);
  }
  const readBase = baseSha && SHA_PATTERN.test(baseSha)
    ? file => spawnSync("git", ["show", `${baseSha}:${file}`], { encoding: "utf8" }).stdout
    : null;
  writeResult(classifyCiImpact(paths, { baseSha, headSha, conclusive, readBase }), process.env.GITHUB_OUTPUT);
}

const modulePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (modulePath.toLowerCase() === invokedPath.toLowerCase()) {
  if (process.argv.includes("--stdin") || process.argv.includes("--json")) {
    classifyStandardInput();
  } else {
    classifyGitHubPullRequest();
  }
}
