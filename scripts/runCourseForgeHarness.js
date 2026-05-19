import { runDefaultCourseForgeHarness } from "../src/generation/testing/courseForgeHarness.js";

function formatIssues(issues = []) {
  return (Array.isArray(issues) ? issues : []).map((issue) => `  - ${issue}`).join("\n");
}

const summary = await runDefaultCourseForgeHarness();

summary.results.forEach((result) => {
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.id} (${result.trace.maxPromptLength} chars máx)`);
  console.log(`  ${result.description}`);
  if (!result.ok && result.issues.length) {
    console.log(formatIssues(result.issues));
  }
});

if (summary.failed.length) {
  process.exitCode = 1;
  console.error(`Harness falhou em ${summary.failed.length} cenário(s).`);
} else {
  console.log(`Harness concluído com sucesso em ${summary.scenarioCount} cenários.`);
}
