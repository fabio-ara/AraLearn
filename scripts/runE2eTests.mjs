import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function run(command, args, environment, cwd) {
  return spawnSync(command, args, { cwd, env: environment, stdio: "inherit" });
}

function buildEnvironment(environment) {
  const result = { ...environment };
  for (const name of Object.keys(result)) {
    if (/^(?:SUPABASE_(?:SECRET|SERVICE_ROLE|DB_PASSWORD|ACCESS_TOKEN)|ARALEARN_.*(?:TOKEN|SECRET))/iu.test(name)) {
      delete result[name];
    }
  }
  return result;
}

export function runE2eTests({
  argv = process.argv.slice(2), environment = process.env, cwd = process.cwd(),
  execute = run, reportError = message => console.error(message)
} = {}) {
  const originalEnvironment = { ...environment };
  const hadRuntimeConfiguration = Boolean(
    environment.ARALEARN_SUPABASE_URL && environment.ARALEARN_SUPABASE_PUBLISHABLE_KEY
  );
  const testEnvironment = {
    ...environment,
    ARALEARN_SUPABASE_URL: environment.ARALEARN_SUPABASE_URL || "https://project.supabase.test",
    ARALEARN_SUPABASE_PUBLISHABLE_KEY: environment.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_e2e"
  };
  const buildArguments = ["./scripts/stageWebRuntime.mjs", "--target", "pages", "--output", ".pages"];
  const invoke = (args, env) => {
    const result = execute(process.execPath, args, env, cwd);
    if (result.error) throw result.error;
    return typeof result.status === "number" ? result.status : 1;
  };
  let status;
  try {
    const buildStatus = invoke(buildArguments, buildEnvironment(testEnvironment));
    status = buildStatus === 0
      ? invoke(["./node_modules/@playwright/test/cli.js", "test", ...argv], testEnvironment)
      : buildStatus;
  } catch (error) {
    reportError(error instanceof Error ? error.message : String(error));
    status = 1;
  } finally {
    // Pages pode reutilizar .pages. Mesmo uma falha de spawn não deve deixar
    // no artefato uma configuração fictícia introduzida pelo runner.
    if (!hadRuntimeConfiguration) {
      try {
        if (invoke(buildArguments, buildEnvironment(originalEnvironment)) !== 0) status = 1;
      } catch (error) {
        reportError(error instanceof Error ? error.message : String(error));
        status = 1;
      }
    }
  }
  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runE2eTests();
}
