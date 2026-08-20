import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  auditLegacyDbLint,
  stableLintIssueId
} from "../../scripts/auditLegacyDbLint.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const baseline = JSON.parse(await readFile(path.join(
  repositoryRoot,
  "scripts/courseCutover/legacyDbLintBaseline.v1.json"
), "utf8"));
const legacyTargets = JSON.parse(await readFile(path.join(
  repositoryRoot,
  "scripts/courseCutover/legacyCleanupTargets.v1.json"
), "utf8"));

function messageFor(issueId) {
  if (issueId.startsWith("missing-relation:")) {
    return `relation "${issueId.slice("missing-relation:".length)}" does not exist`;
  }
  if (issueId.startsWith("missing-column:")) {
    return `column ${issueId.slice("missing-column:".length)} does not exist`;
  }
  if (issueId.startsWith("missing-record-field:")) {
    const identity = issueId.slice("missing-record-field:".length);
    const separator = identity.lastIndexOf(".");
    return `record "${identity.slice(0, separator)}" has no field "${identity.slice(separator + 1)}"`;
  }
  return issueId.slice("message:".length);
}

function lintReport() {
  return {
    results: baseline.findings.map((finding) => ({
      function: finding.function,
      issues: [{
        level: "error",
        message: messageFor(finding.issueId),
        sqlState: finding.sqlState
      }]
    })),
    message: "db lint"
  };
}

test("a baseline aceita somente os 88 achados legados inventariados", () => {
  assert.equal(baseline.findings.length, 88);
  assert.deepEqual(auditLegacyDbLint({
    lintReport: lintReport(),
    baseline,
    legacyTargets
  }), []);
});

test("cada função da baseline pertence aos alvos exatos da limpeza", () => {
  const changedTargets = structuredClone(legacyTargets);
  changedTargets.objects = changedTargets.objects.filter((object) =>
    !object.startsWith(`function:${baseline.findings[0].function}(`)
  );
  const findings = auditLegacyDbLint({
    lintReport: lintReport(),
    baseline,
    legacyTargets: changedTargets
  });
  assert.ok(findings.some((finding) => finding.includes(
    `${baseline.findings[0].function} não pertence aos alvos da limpeza legada`
  )));
});

test("achado novo, ausente ou com mensagem diferente reprova o gate", () => {
  const newFinding = lintReport();
  newFinding.results[0].issues.push({
    level: "error",
    message: "relation \"private.outra_relacao\" does not exist",
    sqlState: "99999"
  });
  assert.ok(auditLegacyDbLint({
    lintReport: newFinding,
    baseline,
    legacyTargets
  }).some((finding) => finding.startsWith("Achado novo no lint:")));

  const missingFinding = lintReport();
  missingFinding.results.pop();
  assert.ok(auditLegacyDbLint({
    lintReport: missingFinding,
    baseline,
    legacyTargets
  }).some((finding) => finding.startsWith("Achado legado esperado ausente:")));

  const changedMessage = lintReport();
  changedMessage.results[0].issues[0].message =
    "relation \"private.outra_relacao\" does not exist";
  const changedFindings = auditLegacyDbLint({
    lintReport: changedMessage,
    baseline,
    legacyTargets
  });
  assert.ok(changedFindings.some((finding) => finding.startsWith("Achado novo no lint:")));
  assert.ok(changedFindings.some((finding) =>
    finding.startsWith("Achado legado esperado ausente:")));
});

test("par duplicado e warning corrente reprovam mesmo quando a função é legada", () => {
  const duplicated = lintReport();
  duplicated.results.push(structuredClone(duplicated.results[0]));
  assert.ok(auditLegacyDbLint({
    lintReport: duplicated,
    baseline,
    legacyTargets
  }).some((finding) => finding.includes("par função/sqlState duplicado")));

  const warning = lintReport();
  warning.results[0].issues[0].level = "warning";
  assert.ok(auditLegacyDbLint({
    lintReport: warning,
    baseline,
    legacyTargets
  }).some((finding) => finding.includes("warning corrente")));
});

test("formato inválido e baseline fora de ordem reprovam", () => {
  assert.ok(auditLegacyDbLint({
    lintReport: { results: [] },
    baseline,
    legacyTargets
  }).includes("Resposta JSON do Supabase db lint inválida."));

  const unordered = structuredClone(baseline);
  [unordered.findings[0], unordered.findings[1]] = [
    unordered.findings[1], unordered.findings[0]
  ];
  assert.ok(auditLegacyDbLint({
    lintReport: lintReport(),
    baseline: unordered,
    legacyTargets
  }).includes("Baseline do lint legado fora da ordem canônica."));
});

test("o identificador estável distingue relação, coluna e campo de record", () => {
  assert.equal(
    stableLintIssueId('relation "private.authoring_workspaces" does not exist'),
    "missing-relation:private.authoring_workspaces"
  );
  assert.equal(
    stableLintIssueId("column course.status does not exist"),
    "missing-column:course.status"
  );
  assert.equal(
    stableLintIssueId('record "v_course" has no field "experiment_variant"'),
    "missing-record-field:v_course.experiment_variant"
  );
});

test("a interface de linha de comando lê o JSON pela entrada padrão", () => {
  const result = spawnSync("node", ["scripts/auditLegacyDbLint.mjs", "-"], {
    cwd: repositoryRoot,
    input: JSON.stringify(lintReport()),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /88 achados da limpeza legada/u);
});

test("workflow e implantação preservam a falha da CLI antes de chamar o gate", async () => {
  const [workflow, deployment, guide] = await Promise.all([
    readFile(path.join(repositoryRoot, ".github/workflows/validacao.yml"), "utf8"),
    readFile(path.join(repositoryRoot, "scripts/deploySupabase.ps1"), "utf8"),
    readFile(path.join(repositoryRoot, "docs/guia-desenvolvedor.md"), "utf8")
  ]);
  for (const source of [workflow, deployment, guide]) {
    assert.match(source, /db lint[^\r\n]+--level warning/u);
    assert.match(source, /--output-format json/u);
    assert.match(source, /auditLegacyDbLint\.mjs/u);
    assert.doesNotMatch(source, /--fail-on warning/u);
  }
  assert.match(workflow, /lint_status=\$\?[\s\S]+exit "\$lint_status"[\s\S]+auditLegacyDbLint\.mjs/u);
  assert.match(deployment, /\$lintExitCode = \$LASTEXITCODE[\s\S]+return \[int\]\$lintExitCode/u);
  assert.match(deployment, /Invoke-AraLearnDatabaseLintGate[\s\S]+exit \$lintExitCode/u);
});
