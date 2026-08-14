import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import {
  environmentText,
  runCardAssistanceSmoke
} from "./cardAssistanceSmoke.lib.js";
import { runBottomUpAssistanceSmoke } from "./bottomUpAssistanceSmoke.lib.js";
import { createCodexCliProvider } from "../src/generation/providers/codexCliProvider.js";

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
  if (!port) throw new Error("Não foi possível reservar uma porta local para o smoke.");
  return port;
}

async function waitForBridge(endpoint, token, child) {
  const deadline = Date.now() + 10_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`O serviço local terminou antes da verificação de saúde (código ${child.exitCode}).`);
    }
    try {
      const response = await fetch(endpoint, {
        headers: { "x-aralearn-token": token },
        signal: AbortSignal.timeout(1_000)
      });
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `O serviço local não respondeu à verificação de saúde: ${lastError?.message || "tempo esgotado"}.`
  );
}

async function stopBridge(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const token = randomBytes(32).toString("base64url");
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const endpoint = `${baseUrl}/assist`;
  const modelId = environmentText("ARALEARN_CODEX_MODEL") || "codex-cli-local";
  const child = spawn(process.execPath, ["scripts/aralearnCodexBridge.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ARALEARN_CODEX_TOKEN: token,
      ARALEARN_CODEX_ALLOWED_ORIGINS: "http://localhost:8080",
      ARALEARN_CODEX_HOST: "127.0.0.1",
      ARALEARN_CODEX_PORT: String(port),
      ARALEARN_CODEX_TIMEOUT_MS: environmentText("ARALEARN_CODEX_TIMEOUT_MS") || "180000"
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (stdout.length < 32_768) stdout += chunk;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 32_768) stderr += chunk;
  });
  try {
    await waitForBridge(`${baseUrl}/health`, token, child);
    const provider = createCodexCliProvider({ endpoint, token });
    const tracedProvider = environmentText("ARALEARN_SMOKE_TRACE") === "1"
      ? {
          ...provider,
          async generateStructured(request) {
            const result = await provider.generateStructured(request);
            console.error(JSON.stringify({
              phase: request.phase,
              value: result.value
            }));
            return result;
          }
        }
      : provider;
    await runCardAssistanceSmoke({
      provider: tracedProvider,
      providerId: "codex-cli",
      modelId,
      reportFileName: "codex-card-assistance.json"
    });
    await runBottomUpAssistanceSmoke({
      provider: tracedProvider,
      providerId: "codex-cli",
      modelId,
      reportFileName: "codex-bottom-up-assistance.json"
    });
  } catch (error) {
    const diagnostic = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
    if (diagnostic) {
      throw new Error(
        `${error.message}\nServiço local: ${diagnostic.slice(0, 4_000)}`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    await stopBridge(child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
