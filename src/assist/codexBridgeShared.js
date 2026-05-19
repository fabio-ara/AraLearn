function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildHierarchyLine(label, value) {
  const normalized = normalizeText(value);
  return normalized ? `${label}: ${normalized}` : "";
}

function buildStructuredLine(label, value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [normalizeText(key), normalizeText(entryValue)])
    .filter(([, entryValue]) => entryValue);
  if (!entries.length) {
    return "";
  }

  return `${label}: ${entries.map(([key, entryValue]) => `${key}=${entryValue}`).join("; ")}`;
}

function buildExistingMicrosequenceLines(items = []) {
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          title: normalizeText(item?.title),
          description: normalizeText(item?.description),
          tags: Array.isArray(item?.tags) ? item.tags.map((entry) => normalizeText(entry)).filter(Boolean) : [],
          status: normalizeText(item?.status),
          included: item?.included === true
        }))
        .filter((item) => item.title)
    : [];

  if (!normalizedItems.length) {
    return ["Microssequências atuais: nenhuma."];
  }

  return [
    "Microssequências atuais:",
    ...normalizedItems.map((item, index) => {
      const description = item.description ? `; descrição: ${item.description}` : "";
      const tags = item.tags.length ? `; tags: ${item.tags.join(", ")}` : "";
      return `${index + 1}. ${item.title}; status: ${item.status || "draft"}; included: ${item.included ? "sim" : "não"}${description}${tags}`;
    })
  ];
}

export function buildAttachmentPromptSection(attachments = []) {
  const items = Array.isArray(attachments)
    ? attachments
        .map((attachment) => ({
          name: normalizeText(attachment?.name) || "anexo",
          type: normalizeText(attachment?.type) || "application/octet-stream",
          size: Number(attachment?.size || 0),
          textContent: typeof attachment?.textContent === "string" ? attachment.textContent.trim() : "",
          unsupportedReason: normalizeText(attachment?.unsupportedReason),
          truncated: attachment?.truncated === true
        }))
        .filter((attachment) => attachment.name)
    : [];

  if (!items.length) {
    return "";
  }

  return [
    "Anexos do usuário:",
    ...items.map((attachment, index) => {
      const content = attachment.textContent
        ? `Conteúdo inline:\n${attachment.textContent}${attachment.truncated ? "\n[conteúdo truncado]" : ""}`
        : `Observação: ${attachment.unsupportedReason || "Sem conteúdo inline disponível."}`;
      return `${index + 1}. ${attachment.name} (${attachment.type}, ${attachment.size} bytes)\n${content}`;
    })
  ].join("\n\n");
}

export function extractJsonFromText(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) {
    throw new Error("Saída vazia do Codex.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    // Continua para as estratégias de extração.
  }

  const markdownMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (markdownMatch?.[1]) {
    try {
      return JSON.parse(markdownMatch[1].trim());
    } catch {
      // Continua para o fallback por substring.
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate);
  }

  throw new Error("O Codex não devolveu JSON válido.");
}

export function buildTopDownPrompt(payload = {}) {
  const context = payload?.context && typeof payload.context === "object" ? payload.context : payload || {};
  const fixedTitles = [
    context.courseFixed && normalizeText(context.courseTitle) ? `Curso fixado: ${normalizeText(context.courseTitle)}` : "",
    context.moduleFixed && normalizeText(context.moduleTitle) ? `Módulo fixado: ${normalizeText(context.moduleTitle)}` : "",
    context.lessonFixed && normalizeText(context.lessonTitle) ? `Lição fixada: ${normalizeText(context.lessonTitle)}` : ""
  ].filter(Boolean);

  return [
    "Você gera estrutura top-down para o AraLearn.",
    "Responda somente JSON válido.",
    "Não use Markdown.",
    "Não explique.",
    "Gere curso, módulos, lições e microssequências planejadas.",
    "Não gere cards.",
    "Microssequências devem ficar vazias de cards, com status draft e included false.",
    "Use descrições breves.",
    "Preencha sourceGuide e sourceGuideStructured em curso, módulo e lição.",
    "Em cada lição, escreva lessonGoal, selecione notationRules de forma compatível com os tópicos sugeridos no pedido e redija commonErrors como alerta curto em texto corrido.",
    "Se o contexto fixar curso, módulo ou lição, preserve os títulos fixados.",
    "",
    buildHierarchyLine("Ação", context.actionLabel),
    buildHierarchyLine("Curso", context.courseTitle),
    buildHierarchyLine("Descrição breve do curso", context.courseDescription),
    buildStructuredLine("Fonte-guia estruturada do curso", context.courseSourceGuideStructured),
    buildHierarchyLine("Módulo", context.moduleTitle),
    buildHierarchyLine("Descrição breve do módulo", context.moduleDescription),
    buildStructuredLine("Fonte-guia estruturada do módulo", context.moduleSourceGuideStructured),
    buildHierarchyLine("Lição", context.lessonTitle),
    buildHierarchyLine("Descrição breve da lição", context.lessonDescription),
    buildStructuredLine("Fonte-guia estruturada da lição", context.lessonSourceGuideStructured),
    fixedTitles.length ? `Títulos fixados: ${fixedTitles.join(" | ")}` : "",
    "",
    "Formato obrigatório:",
    "{",
    '  "course": {',
    '    "title": "string",',
    '    "description": "string",',
    '    "sourceGuide": "string",',
    '    "sourceGuideStructured": {',
    '      "audience": "string",',
    '      "globalScope": "string",',
    '      "globalOutOfScope": "string",',
    '      "sharedNotation": "string"',
    "    },",
    '    "modules": [',
    "      {",
    '        "title": "string",',
    '        "description": "string",',
    '        "sourceGuide": "string",',
    '        "sourceGuideStructured": {',
    '          "moduleScope": "string",',
    '          "modulePrerequisites": "string",',
    '          "moduleOutOfScope": "string",',
    '          "lessonProgression": "string"',
    "        },",
    '        "lessons": [',
    "          {",
    '            "title": "string",',
    '            "description": "string",',
    '            "sourceGuide": "string",',
    '            "sourceGuideStructured": {',
    '              "lessonGoal": "string",',
    '              "notationRules": "string",',
    '              "commonErrors": "string"',
    "            },",
    '            "microsequences": [',
    "              {",
    '                "title": "string",',
    '                "description": "string",',
    '                "objective": "string",',
    '                "coverageRole": "core",',
    '                "didacticPurpose": "string",',
    '                "tags": ["string"],',
    '                "status": "draft",',
    '                "included": false,',
    '                "cards": []',
    "              }",
    "            ]",
    "          }",
    "        ]",
    "      }",
    "    ]",
    "  }",
    "}",
    "",
    "Pedido do usuário:",
    normalizeText(payload?.promptText)
  ]
    .filter(Boolean)
    .join("\n");
}

function tokenizeArgsTemplate(template) {
  const input = normalizeText(template);
  if (!input) {
    return [];
  }

  const tokens = [];
  let current = "";
  let quote = "";

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) {
        quote = "";
        continue;
      }
      current += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function buildCodexSpawnInput({ argsTemplate, prompt }) {
  const safePrompt = typeof prompt === "string" ? prompt : "";
  const template = normalizeText(argsTemplate) || "exec -";
  const tokens = tokenizeArgsTemplate(template);
  if (!tokens.length) {
    return {
      args: safePrompt ? [safePrompt] : [],
      stdinText: ""
    };
  }
  const hasPromptPlaceholder = tokens.some((token) => token.includes("{prompt}"));
  if (!hasPromptPlaceholder) {
    return {
      args: tokens.includes("-") ? tokens : [...tokens, safePrompt],
      stdinText: tokens.includes("-") ? safePrompt : ""
    };
  }

  const result = [];
  tokens.forEach((token) => {
    if (token === "{prompt}") {
      result.push(safePrompt);
      return;
    }
    result.push(token.replaceAll("{prompt}", safePrompt));
  });
  return {
    args: result,
    stdinText: ""
  };
}

export function buildCodexArgs({ argsTemplate, prompt }) {
  return buildCodexSpawnInput({ argsTemplate, prompt }).args;
}

export function buildCodexFilePromptWrapper(promptFilePath = "") {
  const normalizedPath = typeof promptFilePath === "string" ? promptFilePath.trim() : "";
  if (!normalizedPath) {
    return "";
  }

  return [
    `Leia integralmente o arquivo "${normalizedPath}".`,
    "Siga as instruções contidas nele.",
    "Responda somente com o JSON final pedido no arquivo, sem comentário adicional."
  ].join("\n");
}

export function normalizePort(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return 4183;
  }
  return parsed;
}

export function normalizeTimeout(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1000) {
    return 180000;
  }
  return parsed;
}

export function buildStandaloneBridgeSource() {
  return `import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function extractJsonFromText(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) {
    throw new Error("Saída vazia do Codex.");
  }
  try {
    return JSON.parse(raw);
  } catch {}

  const markdownMatch = raw.match(/\\\`\\\`\\\`(?:json)?\\s*([\\s\\S]*?)\\\`\\\`\\\`/i);
  if (markdownMatch?.[1]) {
    try {
      return JSON.parse(markdownMatch[1].trim());
    } catch {}
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("O Codex não devolveu JSON válido.");
}

function buildHierarchyLine(label, value) {
  const normalized = normalizeText(value);
  return normalized ? \`\${label}: \${normalized}\` : "";
}

function buildStructuredLine(label, value) {
  if (!value || typeof value !== "object") {
    return "";
  }
  const entries = Object.entries(value)
    .map(([key, entryValue]) => [normalizeText(key), normalizeText(entryValue)])
    .filter(([, entryValue]) => entryValue);
  if (!entries.length) {
    return "";
  }
  return \`\${label}: \${entries.map(([key, entryValue]) => \`\${key}=\${entryValue}\`).join("; ")}\`;
}

function buildExistingMicrosequenceLines(items = []) {
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          title: normalizeText(item?.title),
          description: normalizeText(item?.description),
          tags: Array.isArray(item?.tags) ? item.tags.map((entry) => normalizeText(entry)).filter(Boolean) : [],
          status: normalizeText(item?.status),
          included: item?.included === true
        }))
        .filter((item) => item.title)
    : [];

  if (!normalizedItems.length) {
    return ["Microssequências atuais: nenhuma."];
  }

  return [
    "Microssequências atuais:",
    ...normalizedItems.map((item, index) => {
      const description = item.description ? \`; descrição: \${item.description}\` : "";
      const tags = item.tags.length ? \`; tags: \${item.tags.join(", ")}\` : "";
      return \`\${index + 1}. \${item.title}; status: \${item.status || "draft"}; included: \${item.included ? "sim" : "não"}\${description}\${tags}\`;
    })
  ];
}

function buildAttachmentPromptSection(attachments = []) {
  const items = Array.isArray(attachments)
    ? attachments
        .map((attachment) => ({
          name: normalizeText(attachment?.name) || "anexo",
          type: normalizeText(attachment?.type) || "application/octet-stream",
          size: Number(attachment?.size || 0),
          textContent: typeof attachment?.textContent === "string" ? attachment.textContent.trim() : "",
          unsupportedReason: normalizeText(attachment?.unsupportedReason),
          truncated: attachment?.truncated === true
        }))
        .filter((attachment) => attachment.name)
    : [];

  if (!items.length) {
    return "";
  }

  return [
    "Anexos do usuário:",
    ...items.map((attachment, index) => {
      const content = attachment.textContent
        ? \`Conteúdo inline:\\n\${attachment.textContent}\${attachment.truncated ? "\\n[conteúdo truncado]" : ""}\`
        : \`Observação: \${attachment.unsupportedReason || "Sem conteúdo inline disponível."}\`;
      return \`\${index + 1}. \${attachment.name} (\${attachment.type}, \${attachment.size} bytes)\\n\${content}\`;
    })
  ].join("\\n\\n");
}

function buildTopDownPrompt(payload = {}) {
  const context = payload?.context && typeof payload.context === "object" ? payload.context : payload || {};
  const fixedTitles = [
    context.courseFixed && normalizeText(context.courseTitle) ? \`Curso fixado: \${normalizeText(context.courseTitle)}\` : "",
    context.moduleFixed && normalizeText(context.moduleTitle) ? \`Módulo fixado: \${normalizeText(context.moduleTitle)}\` : "",
    context.lessonFixed && normalizeText(context.lessonTitle) ? \`Lição fixada: \${normalizeText(context.lessonTitle)}\` : ""
  ].filter(Boolean);

  return [
    "Você gera estrutura top-down para o AraLearn.",
    "Responda somente JSON válido.",
    "Não use Markdown.",
    "Não explique.",
    "Gere curso, módulos, lições e microssequências planejadas.",
    "Não gere cards.",
    "Microssequências devem ficar vazias de cards, com status draft e included false.",
    "Use descrições breves.",
    "Preencha sourceGuide e sourceGuideStructured em curso, módulo e lição.",
    "Em cada lição, escreva lessonGoal, selecione notationRules de forma compatível com os tópicos sugeridos no pedido e redija commonErrors como alerta curto em texto corrido.",
    "Se o contexto fixar curso, módulo ou lição, preserve os títulos fixados.",
    "",
    buildHierarchyLine("Ação", context.actionLabel),
    buildHierarchyLine("Curso", context.courseTitle),
    buildHierarchyLine("Descrição breve do curso", context.courseDescription),
    buildStructuredLine("Fonte-guia estruturada do curso", context.courseSourceGuideStructured),
    buildHierarchyLine("Módulo", context.moduleTitle),
    buildHierarchyLine("Descrição breve do módulo", context.moduleDescription),
    buildStructuredLine("Fonte-guia estruturada do módulo", context.moduleSourceGuideStructured),
    buildHierarchyLine("Lição", context.lessonTitle),
    buildHierarchyLine("Descrição breve da lição", context.lessonDescription),
    buildStructuredLine("Fonte-guia estruturada da lição", context.lessonSourceGuideStructured),
    fixedTitles.length ? \`Títulos fixados: \${fixedTitles.join(" | ")}\` : "",
    "",
    "Formato obrigatório:",
    "{",
    '  "course": {',
    '    "title": "string",',
    '    "description": "string",',
    '    "sourceGuide": "string",',
    '    "sourceGuideStructured": {',
    '      "audience": "string",',
    '      "globalScope": "string",',
    '      "globalOutOfScope": "string",',
    '      "sharedNotation": "string"',
    "    },",
    '    "modules": [',
    "      {",
    '        "title": "string",',
    '        "description": "string",',
    '        "sourceGuide": "string",',
    '        "sourceGuideStructured": {',
    '          "moduleScope": "string",',
    '          "modulePrerequisites": "string",',
    '          "moduleOutOfScope": "string",',
    '          "lessonProgression": "string"',
    "        },",
    '        "lessons": [',
    "          {",
    '            "title": "string",',
    '            "description": "string",',
    '            "sourceGuide": "string",',
    '            "sourceGuideStructured": {',
    '              "lessonGoal": "string",',
    '              "notationRules": "string",',
    '              "commonErrors": "string"',
    "            },",
    '            "microsequences": [',
    "              {",
    '                "title": "string",',
    '                "description": "string",',
    '                "objective": "string",',
    '                "coverageRole": "core",',
    '                "didacticPurpose": "string",',
    '                "tags": ["string"],',
    '                "status": "draft",',
    '                "included": false,',
    '                "cards": []',
    "              }",
    "            ]",
    "          }",
    "        ]",
    "      }",
    "    ]",
    "  }",
    "}",
    "",
    "Pedido do usuário:",
    normalizeText(payload?.promptText)
  ].filter(Boolean).join("\\n");
}

function tokenizeArgsTemplate(template) {
  const input = normalizeText(template);
  if (!input) {
    return [];
  }
  const tokens = [];
  let current = "";
  let quote = "";
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) {
        quote = "";
        continue;
      }
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function buildCodexSpawnInput({ argsTemplate, prompt }) {
  const safePrompt = typeof prompt === "string" ? prompt : "";
  const template = normalizeText(argsTemplate) || "exec -";
  const tokens = tokenizeArgsTemplate(template);
  if (!tokens.length) {
    return {
      args: safePrompt ? [safePrompt] : [],
      stdinText: ""
    };
  }
  const hasPromptPlaceholder = tokens.some((token) => token.includes("{prompt}"));
  if (!hasPromptPlaceholder) {
    return {
      args: tokens.includes("-") ? tokens : [...tokens, safePrompt],
      stdinText: tokens.includes("-") ? safePrompt : ""
    };
  }
  const result = [];
  tokens.forEach((token) => {
    if (token === "{prompt}") {
      result.push(safePrompt);
      return;
    }
    result.push(token.replaceAll("{prompt}", safePrompt));
  });
  return {
    args: result,
    stdinText: ""
  };
}

function normalizePort(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return 4183;
  }
  return parsed;
}

function normalizeTimeout(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1000) {
    return 180000;
  }
  return parsed;
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
      } catch (error) {
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

function buildCodexFilePromptWrapper(promptFilePath = "") {
  const normalizedPath = typeof promptFilePath === "string" ? promptFilePath.trim() : "";
  if (!normalizedPath) {
    return "";
  }
  return [
    \`Leia integralmente o arquivo "\${normalizedPath}".\`,
    "Siga as instruções contidas nele.",
    "Responda somente com o JSON final pedido no arquivo, sem comentário adicional."
  ].join("\\n");
}

function createPromptFileTransport({ prompt = "", cwd = process.cwd() }) {
  const normalizedPrompt = typeof prompt === "string" ? prompt : "";
  const promptDir = path.join(cwd, ".tmp", "codex-bridge");
  fs.mkdirSync(promptDir, { recursive: true });
  const promptFilePath = path.join(
    promptDir,
    \`courseforge-prompt-\${Date.now()}-\${Math.random().toString(36).slice(2, 10)}.md\`
  );
  fs.writeFileSync(promptFilePath, normalizedPrompt, "utf8");
  return {
    promptFilePath,
    wrapperPrompt: buildCodexFilePromptWrapper(promptFilePath)
  };
}

function runCodex({ command, args, stdinText, cwd, timeoutMs, cleanupPaths = [] }) {
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
      reject(new Error(\`Tempo esgotado ao executar o Codex após \${timeoutMs} ms.\`));
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
      cleanupPaths.forEach((cleanupPath) => {
        if (!cleanupPath) {
          return;
        }
        try {
          fs.unlinkSync(cleanupPath);
        } catch {}
      });
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(normalizeText(stderr) || \`Codex finalizou com código \${code}.\`));
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
const defaultCommand = "codex";
const command = normalizeText(process.env.ARALEARN_CODEX_COMMAND) || defaultCommand;
const argsTemplate = normalizeText(process.env.ARALEARN_CODEX_ARGS) || "exec -";
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
      } else {
        respondJson(response, 400, {
          ok: false,
          error: mode
            ? \`Modo ainda não suportado pelo Codex local: \${mode}. Use Gemini ou outro provedor para esta operação.\`
            : "Modo ausente no pedido."
        });
        return;
      }
    }

    if (attachmentSection) {
      prompt = \`\${prompt}\\n\\n\${attachmentSection}\`;
    }

    if (!prompt) {
      respondJson(response, 400, {
        ok: false,
        error: "Não foi possível montar um prompt para o Codex local."
      });
      return;
    }

    let effectivePrompt = prompt;
    const cleanupPaths = [];
    if (effectivePrompt.length > 12000) {
      const promptFileTransport = createPromptFileTransport({ prompt: effectivePrompt, cwd });
      effectivePrompt = promptFileTransport.wrapperPrompt;
      cleanupPaths.push(promptFileTransport.promptFilePath);
    }
    const codexSpawnInput = buildCodexSpawnInput({ argsTemplate, prompt: effectivePrompt });
    const codexResult = await runCodex({
      command,
      args: codexSpawnInput.args,
      stdinText: codexSpawnInput.stdinText,
      cwd,
      timeoutMs,
      cleanupPaths
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
  console.log(\`AraLearn Codex bridge em http://\${host}:\${port}\`);
});
`;
}
