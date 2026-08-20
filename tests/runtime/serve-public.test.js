import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitUntilReady(child) {
  child.stdout.setEncoding("utf8");
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Servidor local não iniciou no prazo.")), 5000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdout.on("data", (chunk) => {
      if (!chunk.includes("Servidor local")) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function collectProcessOutput(child) {
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const [code] = await new Promise((resolve) => child.once("close", (...args) => resolve(args)));
  return { code, output };
}

test("servidor local entrega o index para callback PKCE com query string", async () => {
  const port = await freePort();
  const scriptPath = fileURLToPath(new URL("../../scripts/servePublic.js", import.meta.url));
  const child = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      PORT: String(port),
      ARALEARN_SUPABASE_URL: "https://example.supabase.co",
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_teste_publico"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitUntilReady(child);
    const response = await fetch(
      `http://127.0.0.1:${port}/?auth_state=estado-pkce&code=codigo-curto`
    );
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<!doctype html>/iu);
    const runtimeConfig = await fetch(`http://127.0.0.1:${port}/runtime-config.js`);
    assert.equal(runtimeConfig.status, 200);
    assert.match(await runtimeConfig.text(), /"developmentRuntime": true/u);
  } finally {
    child.kill();
  }
});

test("servidor local carrega a configuração publicada quando o ambiente não a informa completa", () => {
  const scriptPath = fileURLToPath(new URL("../../scripts/servePublic.js", import.meta.url));
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /hasCompleteExplicitRuntimeConfig/u);
  assert.match(source, /\|\| !hasCompleteExplicitRuntimeConfig/u);
  assert.match(source, /PUBLISHED_RUNTIME_CONFIG_URL/u);
});

test("servidor do artefato conserva em memória arquivos já lidos", async () => {
  const port = await freePort();
  const scriptPath = fileURLToPath(new URL("../../scripts/servePublic.js", import.meta.url));
  const artifactRoot = path.join(REPOSITORY_ROOT, ".pages");
  const fileName = `serve-public-cache-${randomUUID()}.js`;
  const filePath = path.join(artifactRoot, fileName);
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.writeFileSync(filePath, "export const revision = 1;\n", "utf8");
  const child = spawn(process.execPath, [scriptPath, "--root", ".pages"], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      ARALEARN_SUPABASE_URL: "https://example.supabase.co",
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_teste_publico"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitUntilReady(child);
    const first = await fetch(`http://127.0.0.1:${port}/${fileName}`);
    assert.equal(first.status, 200);
    assert.equal(await first.text(), "export const revision = 1;\n");

    fs.writeFileSync(filePath, "export const revision = 2;\n", "utf8");
    const second = await fetch(`http://127.0.0.1:${port}/${fileName}`);
    assert.equal(second.status, 200);
    assert.equal(await second.text(), "export const revision = 1;\n");
  } finally {
    child.kill();
    fs.rmSync(filePath, { force: true });
  }
});

test("prévia com configuração publicada recusa porta sem CORS da autoria", async () => {
  const port = await freePort();
  const scriptPath = fileURLToPath(new URL("../../scripts/servePublic.js", import.meta.url));
  const child = spawn(process.execPath, [scriptPath, "--published-runtime-config"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const result = await collectProcessOutput(child);
  assert.equal(result.code, 1);
  assert.match(result.output, /deve usar a porta 4182/u);
});
