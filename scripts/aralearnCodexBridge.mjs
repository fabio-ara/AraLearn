import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

import {
  buildCodexSpawnInput,
  extractJsonFromText,
  normalizePort,
  normalizeTimeout,
  buildCodexFilePromptWrapper
} from "./aralearnCodexBridge.lib.mjs";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-aralearn-token"
  });
  response.end(JSON.stringify(payload));
}

function isAuthorized(request, token) {
  if (!token) {
    return true;
  }
  return normalizeText(request.headers["x-aralearn-token"]) === token;
}

function readJsonBody(request, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("Payload acima do limite permitido."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("JSON inválido no corpo do pedido."));
      }
    });
    request.on("error", reject);
  });
}

function normalizeCodexExecutionError(error) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message);
  if (code === "ENAMETOOLONG" || code === "E2BIG" || /ENAMETOOLONG|E2BIG/i.test(message)) {
    return new Error("A entrada enviada ao Codex local ficou grande demais para a linha de comando. Configure o bridge para usar stdin.");
  }
  return error instanceof Error ? error : new Error(message || "Falha inesperada ao executar o Codex.");
}

function createPromptFileTransport({ prompt = "", cwd = process.cwd() }) {
  const normalizedPrompt = typeof prompt === "string" ? prompt : "";
  const promptDir = path.join(cwd, ".tmp", "codex-bridge");
  fs.mkdirSync(promptDir, { recursive: true });
  const promptFilePath = path.join(
    promptDir,
    `courseforge-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.md`
  );
  fs.writeFileSync(promptFilePath, normalizedPrompt, "utf8");
  return {
    promptFilePath,
    wrapperPrompt: buildCodexFilePromptWrapper(promptFilePath)
  };
}

function createResultFileTransport({ cwd = process.cwd(), schema = null } = {}) {
  const promptDir = path.join(cwd, ".tmp", "codex-bridge");
  fs.mkdirSync(promptDir, { recursive: true });
  const outputFilePath = path.join(
    promptDir,
    `courseforge-output-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`
  );
  const schemaFilePath =
    schema && typeof schema === "object"
      ? path.join(promptDir, `courseforge-schema-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`)
      : "";
  if (schemaFilePath) {
    fs.writeFileSync(schemaFilePath, JSON.stringify(schema, null, 2), "utf8");
  }
  return {
    outputFilePath,
    schemaFilePath
  };
}

function injectCodexExecFiles(args = [], { outputFilePath = "", schemaFilePath = "" } = {}) {
  if (!Array.isArray(args) || !args.length) {
    return args;
  }
  if (args[0] !== "exec") {
    return args;
  }
  const nextArgs = [...args];
  if (!nextArgs.includes("--ignore-user-config")) {
    nextArgs.splice(1, 0, "--ignore-user-config");
  }
  if (!nextArgs.includes("--disable")) {
    nextArgs.splice(1, 0, "--disable", "plugins");
  }
  if (!nextArgs.includes("--color")) {
    nextArgs.splice(1, 0, "--color", "never");
  }
  if (outputFilePath && !nextArgs.includes("--output-last-message")) {
    nextArgs.splice(1, 0, "--output-last-message", outputFilePath);
  }
  if (schemaFilePath && !nextArgs.includes("--output-schema")) {
    nextArgs.splice(1, 0, "--output-schema", schemaFilePath);
  }
  return nextArgs;
}

function runCodex({ command, args, stdinText, cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      shell: false,
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdin.end(typeof stdinText === "string" ? stdinText : "");
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Tempo esgotado ao executar o Codex após ${timeoutMs} ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(normalizeCodexExecutionError(error));
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code: Number.isInteger(code) ? code : -1,
        stdout,
        stderr,
        elapsedMs: Date.now() - startedAt
      });
    });
  });
}

const host = normalizeText(process.env.ARALEARN_CODEX_HOST) || "127.0.0.1";
const port = normalizePort(process.env.ARALEARN_CODEX_PORT);
const token = normalizeText(process.env.ARALEARN_CODEX_TOKEN);
const defaultCommand = "codex";
const command = normalizeText(process.env.ARALEARN_CODEX_COMMAND) || defaultCommand;
const argsTemplate =
  normalizeText(process.env.ARALEARN_CODEX_ARGS)
  || "exec --ignore-user-config --disable plugins --color never -";
const timeoutMs = normalizeTimeout(process.env.ARALEARN_CODEX_TIMEOUT_MS);
const maxBodyBytes = Number.parseInt(String(process.env.ARALEARN_CODEX_MAX_BODY_BYTES || "1000000"), 10) || 1000000;
const cwd = normalizeText(process.env.ARALEARN_CODEX_WORKDIR) || process.cwd();

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    respondJson(response, 404, { ok: false, error: "Rota inválida." });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-aralearn-token"
    });
    response.end();
    return;
  }

  if (request.url === "/health" && request.method === "GET") {
    if (!isAuthorized(request, token)) {
      respondJson(response, 401, { ok: false, error: "Token local inválido." });
      return;
    }

    respondJson(response, 200, {
      ok: true,
      provider: "codex-cli-local",
      service: "aralearn-codex-bridge",
      version: 1
    });
    return;
  }

  if (request.url !== "/assist" || request.method !== "POST") {
    respondJson(response, 404, { ok: false, error: "Rota não encontrada." });
    return;
  }

  if (!isAuthorized(request, token)) {
    respondJson(response, 401, { ok: false, error: "Token local inválido." });
    return;
  }

  try {
    const payload = await readJsonBody(request, maxBodyBytes);
    const mode = normalizeText(payload?.mode);
    const requestPayload = payload?.request && typeof payload.request === "object" ? payload.request : {};
    const system = normalizeText(requestPayload.system);
    let prompt = normalizeText(requestPayload.prebuiltPrompt) || normalizeText(requestPayload.prompt);

    if (!mode) {
      respondJson(response, 400, {
        ok: false,
        error: "Modo ausente no pedido."
      });
      return;
    }

    if (!prompt) {
      respondJson(response, 400, {
        ok: false,
        error: `Modo ${mode} sem prompt.`
      });
      return;
    }

    if (!prompt) {
      respondJson(response, 400, {
        ok: false,
        error: "Não foi possível montar um prompt para o Codex local."
      });
      return;
    }

    if (!normalizeText(requestPayload.prebuiltPrompt)) {
      prompt = [system, prompt, "Responda somente JSON válido."].filter(Boolean).join("\n\n");
    }

    let effectivePrompt = prompt;
    const cleanupPaths = [];
    let codexSpawnInput = buildCodexSpawnInput({ argsTemplate, prompt: effectivePrompt });
    const usesStdinPrompt = Array.isArray(codexSpawnInput.args) && codexSpawnInput.args.includes("-");
    if (effectivePrompt.length > 12000 && !usesStdinPrompt) {
      const promptFileTransport = createPromptFileTransport({ prompt: effectivePrompt, cwd });
      effectivePrompt = promptFileTransport.wrapperPrompt;
      cleanupPaths.push(promptFileTransport.promptFilePath);
      codexSpawnInput = buildCodexSpawnInput({ argsTemplate, prompt: effectivePrompt });
    }
    const resultFileTransport = createResultFileTransport({
      cwd,
      schema: requestPayload.schema && typeof requestPayload.schema === "object" ? requestPayload.schema : null
    });
    cleanupPaths.push(resultFileTransport.outputFilePath);
    if (resultFileTransport.schemaFilePath) {
      cleanupPaths.push(resultFileTransport.schemaFilePath);
    }
    const codexResult = await runCodex({
      command,
      args: injectCodexExecFiles(codexSpawnInput.args, resultFileTransport),
      stdinText: codexSpawnInput.stdinText,
      cwd,
      timeoutMs
    });
    const outputText = resultFileTransport.outputFilePath && fs.existsSync(resultFileTransport.outputFilePath)
      ? fs.readFileSync(resultFileTransport.outputFilePath, "utf8")
      : codexResult.stdout;
    const expectsStructuredJson = requestPayload.schema && typeof requestPayload.schema === "object";
    let result = null;
    let parseError = null;
    if (expectsStructuredJson) {
      try {
        result = extractJsonFromText(outputText);
      } catch (error) {
        parseError = error;
      }
    } else {
      result = {
        text: outputText,
        usage: {}
      };
    }
    cleanupPaths.forEach((cleanupPath) => {
      if (!cleanupPath) {
        return;
      }
      try {
        fs.unlinkSync(cleanupPath);
      } catch {
        // O processo pode já ter removido o arquivo temporário.
      }
    });
    if (!result) {
      const stderrMessage = normalizeText(codexResult.stderr);
      const parseMessage = normalizeText(parseError?.message);
      throw new Error(
        [
          codexResult.code !== 0 ? `Codex finalizou com código ${codexResult.code}.` : "",
          parseMessage,
          stderrMessage
        ]
          .filter(Boolean)
          .join(" ")
      );
    }

    respondJson(response, 200, {
      ok: true,
      result,
      meta: {
        provider: "codex-cli-local",
        mode,
        elapsedMs: codexResult.elapsedMs,
        exitCode: codexResult.code,
        recoveredFromNonZeroExit: codexResult.code !== 0
      }
    });
  } catch (error) {
    respondJson(response, 500, {
      ok: false,
      error: normalizeText(error?.message) || "Falha inesperada no bridge local."
    });
  }
});

server.listen(port, host, () => {
  console.log(`AraLearn Codex bridge em http://${host}:${port}`);
});
