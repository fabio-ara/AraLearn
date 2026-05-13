import http from "node:http";
import { spawn } from "node:child_process";
import process from "node:process";

import {
  buildAttachmentPromptSection,
  buildCodexArgs,
  buildLessonMicrosequencesPrompt,
  buildTopDownPrompt,
  extractJsonFromText,
  normalizePort,
  normalizeTimeout
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

function runCodex({ command, args, cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      shell: false,
      cwd,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
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
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(normalizeText(stderr) || `Codex finalizou com código ${code}.`));
        return;
      }
      resolve({
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
const defaultCommand = process.platform === "win32" ? "codex.cmd" : "codex";
const command = normalizeText(process.env.ARALEARN_CODEX_COMMAND) || defaultCommand;
const argsTemplate = normalizeText(process.env.ARALEARN_CODEX_ARGS) || "exec {prompt}";
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
    const attachmentSection = buildAttachmentPromptSection(requestPayload.attachments || []);
    let prompt = normalizeText(requestPayload.prebuiltPrompt);

    if (!prompt) {
      if (mode === "generate-top-down-structure") {
        prompt = buildTopDownPrompt(payload);
      } else if (mode === "generate-lesson-microsequences") {
        prompt = buildLessonMicrosequencesPrompt(payload);
      } else {
        respondJson(response, 400, {
          ok: false,
          error: mode
            ? `Modo ainda não suportado pelo Codex local: ${mode}. Use Gemini ou outro provedor para esta operação.`
            : "Modo ausente no pedido."
        });
        return;
      }
    }

    if (attachmentSection) {
      prompt = `${prompt}\n\n${attachmentSection}`;
    }

    if (!prompt) {
      respondJson(response, 400, {
        ok: false,
        error: "Não foi possível montar um prompt para o Codex local."
      });
      return;
    }

    const codexResult = await runCodex({
      command,
      args: buildCodexArgs({ argsTemplate, prompt }),
      cwd,
      timeoutMs
    });
    const result = extractJsonFromText(codexResult.stdout);

    respondJson(response, 200, {
      ok: true,
      result,
      meta: {
        provider: "codex-cli-local",
        mode,
        elapsedMs: codexResult.elapsedMs
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
