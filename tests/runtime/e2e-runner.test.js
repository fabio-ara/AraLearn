import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runE2eTests } from "../../scripts/runE2eTests.mjs";

test("E2E encaminha filtros e opções, preserva falha e restaura a origem fictícia em subprocessos reais", async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-e2e-runner-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.mkdir(path.join(cwd, "scripts"));
  await fs.mkdir(path.join(cwd, "node_modules/@playwright/test"), { recursive: true });
  await fs.writeFile(path.join(cwd, "scripts/stageWebRuntime.mjs"), `import fs from "node:fs";
    fs.appendFileSync("events.jsonl",JSON.stringify({kind:"build",url:process.env.ARALEARN_SUPABASE_URL||null})+"\\n");`);
  await fs.writeFile(path.join(cwd, "node_modules/@playwright/test/cli.js"), `require("node:fs").appendFileSync("events.jsonl",
    JSON.stringify({kind:"test",args:process.argv.slice(2)})+"\\n"); process.exitCode=7;`);
  const environment = { ...process.env };
  delete environment.ARALEARN_SUPABASE_URL;
  delete environment.ARALEARN_SUPABASE_PUBLISHABLE_KEY;
  const argv = ["tests/e2e/one.spec.js", "--workers=1", "--retries=0"];
  assert.equal(runE2eTests({ cwd, argv, environment }), 7);
  const events = (await fs.readFile(path.join(cwd, "events.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(events, [
    { kind: "build", url: "https://project.supabase.test" },
    { kind: "test", args: ["test", ...argv] },
    { kind: "build", url: null }
  ]);
});

test("E2E restaura mesmo quando a criação do processo falha", () => {
  const calls = [], errors = [];
  const status = runE2eTests({ environment: {}, argv: [], reportError: message => errors.push(message),
    execute(_command, args) {
      calls.push(args);
      if (calls.length === 1) throw new Error("spawn sintético recusado");
      return { status: 0 };
    } });
  assert.equal(status, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(args => args[0].endsWith("stageWebRuntime.mjs")));
  assert.deepEqual(errors, ["spawn sintético recusado"]);
});

test("E2E local mantém credenciais somente no filho de testes e não repete o build", () => {
  const environment = { ARALEARN_SUPABASE_URL: "http://127.0.0.1:54321",
    ARALEARN_SUPABASE_PUBLISHABLE_KEY: "publica-sintetica", SUPABASE_SERVICE_ROLE_KEY: "administrativa-sintetica" };
  const before = structuredClone(environment), calls = [];
  assert.equal(runE2eTests({ environment, argv: ["--forbid-only"], execute(_command, args, env) {
    calls.push({ args, env }); return { status: 0 };
  } }), 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(calls[1].env.SUPABASE_SERVICE_ROLE_KEY, "administrativa-sintetica");
  assert.ok(calls[1].args.includes("--forbid-only"));
  assert.deepEqual(environment, before);
});

test("E2E não converte processo interrompido nem restauração falha em sucesso", () => {
  for (const statuses of [[0, null, 0], [0, 0, 2]]) {
    let index = 0;
    assert.equal(runE2eTests({ environment: {}, argv: [], execute() { return { status: statuses[index++] }; } }), 1);
    assert.equal(index, 3);
  }
});
