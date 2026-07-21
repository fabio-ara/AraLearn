import { spawnSync } from "node:child_process";

const originalEnvironment = { ...process.env };
const hadRuntimeConfiguration = Boolean(
  process.env.ARALEARN_SUPABASE_URL && process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY
);
const testEnvironment = {
  ...process.env,
  ARALEARN_SUPABASE_URL:
    process.env.ARALEARN_SUPABASE_URL || "https://project.supabase.test",
  ARALEARN_SUPABASE_PUBLISHABLE_KEY:
    process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_e2e"
};

function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit"
  });
  if (result.error) console.error(result.error.message);
  return result;
}

let status = 1;
const buildArguments = [
  "./scripts/stageWebRuntime.mjs",
  "--target",
  "pages",
  "--output",
  ".pages"
];
const build = run(process.execPath, buildArguments, testEnvironment);
if (build.status === 0) {
  const tests = run(
    process.execPath,
    ["./node_modules/@playwright/test/cli.js", "test"],
    testEnvironment
  );
  status = typeof tests.status === "number" ? tests.status : 1;
}

// O workflow de Pages reutiliza .pages. Quando o runner precisou de uma origem
// fictícia local, restaura ao final o artefato sem essa configuração de teste.
if (!hadRuntimeConfiguration) {
  const restored = run(process.execPath, buildArguments, originalEnvironment);
  if (restored.status !== 0) status = 1;
}

process.exitCode = status;
