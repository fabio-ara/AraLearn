import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const baselinePath = path.join(
  repositoryRoot,
  "scripts",
  "courseCutover",
  "legacyDbLintBaseline.v1.json"
);
const legacyTargetsPath = path.join(
  repositoryRoot,
  "scripts",
  "courseCutover",
  "legacyCleanupTargets.v1.json"
);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function findingKey({ function: functionName, sqlState, issueId }) {
  return `${functionName}\u0000${sqlState}\u0000${issueId}`;
}

function pairKey({ function: functionName, sqlState }) {
  return `${functionName}\u0000${sqlState}`;
}

export function stableLintIssueId(message) {
  const text = String(message || "");
  let match = /^relation "([^"]+)" does not exist$/u.exec(text);
  if (match) return `missing-relation:${match[1]}`;
  match = /^column ([^ ]+) does not exist$/u.exec(text);
  if (match) return `missing-column:${match[1]}`;
  match = /^record "([^"]+)" has no field "([^"]+)"$/u.exec(text);
  if (match) return `missing-record-field:${match[1]}.${match[2]}`;
  return `message:${text}`;
}

function validateTargets(legacyTargets, findings) {
  if (!isRecord(legacyTargets)
      || legacyTargets.contract !== "aralearn.course-legacy-cleanup-targets.v1"
      || !Array.isArray(legacyTargets.objects)) {
    findings.push("Inventário de alvos legados inválido.");
    return new Set();
  }
  const functions = new Set();
  for (const object of legacyTargets.objects) {
    if (typeof object !== "string" || !object.startsWith("function:")) continue;
    const match = /^function:([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\(.*\)$/u.exec(object);
    if (!match) {
      findings.push(`Alvo legado de função inválido: ${String(object)}.`);
      continue;
    }
    functions.add(match[1]);
  }
  if (functions.size === 0) findings.push("Inventário legado sem funções.");
  return functions;
}

function validateBaseline(baseline, targetFunctions, findings) {
  if (!isRecord(baseline)
      || baseline.contract !== "aralearn.legacy-db-lint-baseline.v1"
      || !Array.isArray(baseline.findings)) {
    findings.push("Baseline do lint legado inválida.");
    return [];
  }
  const normalized = [];
  const seenPairs = new Set();
  for (const [index, entry] of baseline.findings.entries()) {
    const label = `Baseline.findings[${index}]`;
    if (!isRecord(entry)
        || !/^(?:private|public)\.[a-z_][a-z0-9_]*$/u.test(entry.function || "")
        || !/^[0-9A-Z]{5}$/u.test(entry.sqlState || "")
        || typeof entry.issueId !== "string"
        || entry.issueId.length === 0) {
      findings.push(`${label}: achado inválido.`);
      continue;
    }
    const normalizedEntry = {
      function: entry.function,
      sqlState: entry.sqlState,
      issueId: entry.issueId
    };
    const pair = pairKey(normalizedEntry);
    if (seenPairs.has(pair)) {
      findings.push(`${label}: par função/sqlState duplicado (${entry.function}/${entry.sqlState}).`);
    }
    seenPairs.add(pair);
    if (!targetFunctions.has(entry.function)) {
      findings.push(`${label}: ${entry.function} não pertence aos alvos da limpeza legada.`);
    }
    normalized.push(normalizedEntry);
  }
  const keys = normalized.map(findingKey);
  if (JSON.stringify(keys) !== JSON.stringify([...keys].sort(compareText))) {
    findings.push("Baseline do lint legado fora da ordem canônica.");
  }
  return normalized;
}

function normalizeLintReport(lintReport, targetFunctions, findings) {
  if (!isRecord(lintReport)
      || lintReport.message !== "db lint"
      || !Array.isArray(lintReport.results)) {
    findings.push("Resposta JSON do Supabase db lint inválida.");
    return [];
  }
  const normalized = [];
  const seenPairs = new Set();
  for (const [resultIndex, result] of lintReport.results.entries()) {
    const label = `Lint.results[${resultIndex}]`;
    if (!isRecord(result)
        || !/^(?:private|public)\.[a-z_][a-z0-9_]*$/u.test(result.function || "")
        || !Array.isArray(result.issues)
        || result.issues.length === 0) {
      findings.push(`${label}: resultado inválido.`);
      continue;
    }
    if (!targetFunctions.has(result.function)) {
      findings.push(`${label}: ${result.function} não pertence aos alvos da limpeza legada.`);
    }
    for (const [issueIndex, issue] of result.issues.entries()) {
      const issueLabel = `${label}.issues[${issueIndex}]`;
      if (!isRecord(issue)
          || !["error", "warning"].includes(issue.level)
          || typeof issue.message !== "string"
          || issue.message.length === 0
          || !/^[0-9A-Z]{5}$/u.test(issue.sqlState || "")) {
        findings.push(`${issueLabel}: achado inválido.`);
        continue;
      }
      const normalizedEntry = {
        function: result.function,
        sqlState: issue.sqlState,
        issueId: stableLintIssueId(issue.message)
      };
      const pair = pairKey(normalizedEntry);
      if (seenPairs.has(pair)) {
        findings.push(
          `${issueLabel}: par função/sqlState duplicado (${result.function}/${issue.sqlState}).`
        );
      }
      seenPairs.add(pair);
      if (issue.level !== "error") {
        findings.push(`${issueLabel}: warning corrente não pode entrar na exceção legada.`);
      }
      normalized.push(normalizedEntry);
    }
  }
  return normalized;
}

export function auditLegacyDbLint({ lintReport, baseline, legacyTargets }) {
  const findings = [];
  const targetFunctions = validateTargets(legacyTargets, findings);
  const expected = validateBaseline(baseline, targetFunctions, findings);
  const actual = normalizeLintReport(lintReport, targetFunctions, findings);
  const expectedKeys = new Set(expected.map(findingKey));
  const actualKeys = new Set(actual.map(findingKey));
  for (const entry of actual) {
    if (!expectedKeys.has(findingKey(entry))) {
      findings.push(
        `Achado novo no lint: ${entry.function}/${entry.sqlState}/${entry.issueId}.`
      );
    }
  }
  for (const entry of expected) {
    if (!actualKeys.has(findingKey(entry))) {
      findings.push(
        `Achado legado esperado ausente: ${entry.function}/${entry.sqlState}/${entry.issueId}.`
      );
    }
  }
  return findings;
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length > 1) {
    throw new TypeError("Uso: node scripts/auditLegacyDbLint.mjs [arquivo-json|-]");
  }
  const source = argumentsList[0] || "-";
  const raw = source === "-"
    ? await readStandardInput()
    : await readFile(path.resolve(source), "utf8");
  let lintReport;
  try {
    lintReport = JSON.parse(raw);
  } catch {
    process.stderr.write("Resposta do Supabase db lint não contém JSON válido.\n");
    process.exitCode = 1;
    return;
  }
  const [baseline, legacyTargets] = await Promise.all([
    readFile(baselinePath, "utf8").then(JSON.parse),
    readFile(legacyTargetsPath, "utf8").then(JSON.parse)
  ]);
  const findings = auditLegacyDbLint({ lintReport, baseline, legacyTargets });
  if (findings.length > 0) {
    process.stderr.write(`${findings.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Lint limitado aos ${baseline.findings.length} achados da limpeza legada pendente.\n`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
