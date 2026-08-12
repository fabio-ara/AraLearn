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

test("Postgres v5 serializa duas transações com o mesmo owner/requestId", {
  skip: !databaseUrl || !psqlAvailable
    ? "defina ARALEARN_TEST_DATABASE_URL e disponibilize psql para o teste concorrente real"
    : false
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000000091";
  const requestId = "concurrency:workspace:v5:0001";
  const payloadHash = "a".repeat(64);
  const setup = psql(`
    insert into auth.users(
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '${ownerId}',
      'authenticated',
      'authenticated',
      'workspace-concurrency-v5@aralearn.invalid',
      '',
      now(),
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
    on conflict (id) do nothing;
  `);
  await completed(setup);

  const first = psql([
    `begin;
      select set_config('request.jwt.claim.role', 'service_role', true);
      select pg_advisory_xact_lock(hashtextextended(
        'aralearn-workspace-request-v5:${ownerId}:${requestId}',
        0
      ));`,
    "select 'first-locked';",
    "select pg_sleep(1.2); commit;"
  ]);
  await marker(first, "first-locked");

  const startedAt = Date.now();
  const second = psql(`
    begin;
    select set_config('request.jwt.claim.role', 'service_role', true);
    select public.replay_authoring_workspace_request_v5(
      '${ownerId}',
      '${requestId}',
      '${payloadHash}',
      'create'
    );
    commit;
  `);
  await Promise.all([completed(first), completed(second)]);
  assert.ok(
    Date.now() - startedAt >= 800,
    "a segunda transação deveria aguardar a liberação do advisory lock"
  );

  const cleanup = psql(`
    delete from auth.users
    where id = '${ownerId}'
      and email = 'workspace-concurrency-v5@aralearn.invalid';
  `);
  await completed(cleanup);
});
