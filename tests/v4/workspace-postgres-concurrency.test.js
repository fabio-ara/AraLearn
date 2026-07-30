import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const databaseUrl = String(process.env.ARALEARN_TEST_DATABASE_URL || "").trim();
const psqlAvailable = spawnSync("psql", ["--version"], {
  encoding: "utf8",
  windowsHide: true
}).status === 0;

function psql(sql) {
  const commands = Array.isArray(sql) ? sql : [sql];
  return spawn("psql", [
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-Atq",
    "--dbname", databaseUrl,
    ...commands.flatMap((command) => ["--command", command])
  ], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function completed(processValue) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    processValue.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    processValue.once("error", reject);
    processValue.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `psql terminou com código ${code}.`));
    });
  });
}

function marker(processValue, expected) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    processValue.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes(expected)) resolve();
    });
    processValue.once("error", reject);
    processValue.once("exit", (code) => {
      if (!stdout.includes(expected)) {
        reject(new Error(`psql terminou com código ${code} antes de emitir ${expected}.`));
      }
    });
  });
}

test("Postgres serializa duas transações com o mesmo owner/requestId", {
  skip: !databaseUrl || !psqlAvailable
    ? "defina ARALEARN_TEST_DATABASE_URL e disponibilize psql para o teste concorrente real"
    : false
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000000001";
  const requestId = "concurrency:workspace:0001";
  const first = psql([
    `begin;
      select set_config('request.jwt.claim.role', 'service_role', true);
      select private.lock_authoring_workspace_request_v4('${ownerId}', '${requestId}');`,
    "select 'first-locked';",
    "select pg_sleep(1.2); commit;"
  ]);
  await marker(first, "first-locked");

  const startedAt = Date.now();
  const second = psql(`
    begin;
    select set_config('request.jwt.claim.role', 'service_role', true);
    select private.lock_authoring_workspace_request_v4('${ownerId}', '${requestId}');
    commit;
  `);
  await Promise.all([completed(first), completed(second)]);
  assert.ok(
    Date.now() - startedAt >= 800,
    "a segunda transação deveria aguardar a liberação do advisory lock"
  );
});
