function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isCodexBridgeTokenSecure(value) {
  const token = normalizeText(value);
  const size = new TextEncoder().encode(token).byteLength;
  return size >= 32 && size <= 512;
}

export function isCodexCardAssistancePhase(value) {
  return [
    "card_assistance_representation",
    "card_assistance_build",
    "card_assistance_resource_repair",
    "bottom_up_operation",
    "bottom_up_targets",
    "bottom_up_move",
    "bottom_up_update_microsequences",
    "bottom_up_build_card",
    "bottom_up_plan_cards",
    "bottom_up_create_microsequence"
  ].includes(normalizeText(value));
}

export function extractJsonFromText(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) {
    throw new Error("Saída vazia do Codex.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("O Codex não devolveu um documento JSON único e válido.");
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonValuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => jsonValuesEqual(item, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) =>
      key === rightKeys[index] && jsonValuesEqual(left[key], right[key])
    );
}

function jsonSchemaTypeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  return false;
}

function resolveLocalSchemaReference(rootSchema, reference) {
  if (reference === "#") return rootSchema;
  if (typeof reference !== "string" || !reference.startsWith("#/")) return null;
  return reference.slice(2).split("/").reduce((current, token) => {
    if (!current || typeof current !== "object") return null;
    const decoded = token.replaceAll("~1", "/").replaceAll("~0", "~");
    return Object.hasOwn(current, decoded) ? current[decoded] : null;
  }, rootSchema);
}

function schemaValidationFailure(path, message) {
  return `${path}: ${message}`;
}

function validateJsonSchemaNode(value, schema, rootSchema, path, depth) {
  if (depth > 256) {
    return schemaValidationFailure(path, "schema excede a profundidade segura.");
  }
  if (schema === true) return "";
  if (schema === false) return schemaValidationFailure(path, "valor proibido pelo schema.");
  if (!isPlainObject(schema)) {
    return schemaValidationFailure(path, "schema JSON inválido.");
  }
  if (typeof schema.$ref === "string") {
    const referenced = resolveLocalSchemaReference(rootSchema, schema.$ref);
    return referenced
      ? validateJsonSchemaNode(value, referenced, rootSchema, path, depth + 1)
      : schemaValidationFailure(path, `referência de schema não resolvida: ${schema.$ref}.`);
  }

  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) {
      const failure = validateJsonSchemaNode(value, branch, rootSchema, path, depth + 1);
      if (failure) return failure;
    }
  }
  if (Array.isArray(schema.anyOf)) {
    const accepted = schema.anyOf.some(
      (branch) => !validateJsonSchemaNode(value, branch, rootSchema, path, depth + 1)
    );
    if (!accepted) return schemaValidationFailure(path, "nenhum ramo de anyOf foi satisfeito.");
  }
  if (Array.isArray(schema.oneOf)) {
    const accepted = schema.oneOf.filter(
      (branch) => !validateJsonSchemaNode(value, branch, rootSchema, path, depth + 1)
    ).length;
    if (accepted !== 1) {
      return schemaValidationFailure(path, "oneOf exige exatamente um ramo válido.");
    }
  }
  if (schema.not !== undefined
      && !validateJsonSchemaNode(value, schema.not, rootSchema, path, depth + 1)) {
    return schemaValidationFailure(path, "valor proibido por not.");
  }
  if (schema.if !== undefined) {
    const conditionMatches = !validateJsonSchemaNode(
      value, schema.if, rootSchema, path, depth + 1
    );
    const selected = conditionMatches ? schema.then : schema.else;
    if (selected !== undefined) {
      const failure = validateJsonSchemaNode(value, selected, rootSchema, path, depth + 1);
      if (failure) return failure;
    }
  }

  if (Object.hasOwn(schema, "const") && !jsonValuesEqual(value, schema.const)) {
    return schemaValidationFailure(path, "valor diferente de const.");
  }
  if (Array.isArray(schema.enum)
      && !schema.enum.some((candidate) => jsonValuesEqual(value, candidate))) {
    return schemaValidationFailure(path, "valor fora de enum.");
  }

  const declaredTypes = Array.isArray(schema.type)
    ? schema.type
    : typeof schema.type === "string"
      ? [schema.type]
      : [];
  if (declaredTypes.length
      && !declaredTypes.some((type) => jsonSchemaTypeMatches(value, type))) {
    return schemaValidationFailure(path, `tipo incompatível; esperado ${declaredTypes.join("|")}.`);
  }

  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      return schemaValidationFailure(path, `texto menor que minLength ${schema.minLength}.`);
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      return schemaValidationFailure(path, `texto maior que maxLength ${schema.maxLength}.`);
    }
    if (typeof schema.pattern === "string") {
      let expression;
      try {
        expression = new RegExp(schema.pattern, "u");
      } catch {
        return schemaValidationFailure(path, "pattern inválido no schema.");
      }
      if (!expression.test(value)) {
        return schemaValidationFailure(path, "texto não satisfaz pattern.");
      }
    }
    if (schema.format === "uuid"
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
      return schemaValidationFailure(path, "UUID inválido.");
    }
    if (schema.format === "date-time"
        && (!/^\d{4}-\d{2}-\d{2}T/u.test(value) || Number.isNaN(Date.parse(value)))) {
      return schemaValidationFailure(path, "date-time inválido.");
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) {
      return schemaValidationFailure(path, `número menor que minimum ${schema.minimum}.`);
    }
    if (Number.isFinite(schema.maximum) && value > schema.maximum) {
      return schemaValidationFailure(path, `número maior que maximum ${schema.maximum}.`);
    }
    if (Number.isFinite(schema.exclusiveMinimum) && value <= schema.exclusiveMinimum) {
      return schemaValidationFailure(
        path,
        `número não supera exclusiveMinimum ${schema.exclusiveMinimum}.`
      );
    }
    if (Number.isFinite(schema.exclusiveMaximum) && value >= schema.exclusiveMaximum) {
      return schemaValidationFailure(
        path,
        `número não fica abaixo de exclusiveMaximum ${schema.exclusiveMaximum}.`
      );
    }
    if (Number.isFinite(schema.multipleOf) && schema.multipleOf > 0) {
      const quotient = value / schema.multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * 16) {
        return schemaValidationFailure(path, `número não é múltiplo de ${schema.multipleOf}.`);
      }
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      return schemaValidationFailure(path, `lista menor que minItems ${schema.minItems}.`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      return schemaValidationFailure(path, `lista maior que maxItems ${schema.maxItems}.`);
    }
    if (schema.uniqueItems === true) {
      for (let left = 0; left < value.length; left += 1) {
        for (let right = left + 1; right < value.length; right += 1) {
          if (jsonValuesEqual(value[left], value[right])) {
            return schemaValidationFailure(path, "lista viola uniqueItems.");
          }
        }
      }
    }
    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    for (let index = 0; index < prefixItems.length && index < value.length; index += 1) {
      const failure = validateJsonSchemaNode(
        value[index],
        prefixItems[index],
        rootSchema,
        `${path}[${index}]`,
        depth + 1
      );
      if (failure) return failure;
    }
    if (schema.items === false && value.length > prefixItems.length) {
      return schemaValidationFailure(path, "lista contém itens adicionais proibidos.");
    }
    if (isPlainObject(schema.items) || schema.items === true) {
      for (let index = prefixItems.length; index < value.length; index += 1) {
        const failure = validateJsonSchemaNode(
          value[index],
          schema.items,
          rootSchema,
          `${path}[${index}]`,
          depth + 1
        );
        if (failure) return failure;
      }
    }
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (Number.isInteger(schema.minProperties) && keys.length < schema.minProperties) {
      return schemaValidationFailure(
        path,
        `objeto menor que minProperties ${schema.minProperties}.`
      );
    }
    if (Number.isInteger(schema.maxProperties) && keys.length > schema.maxProperties) {
      return schemaValidationFailure(
        path,
        `objeto maior que maxProperties ${schema.maxProperties}.`
      );
    }
    const required = Array.isArray(schema.required) ? schema.required : [];
    const missing = required.find((field) => !Object.hasOwn(value, field));
    if (missing) return schemaValidationFailure(`${path}.${missing}`, "campo obrigatório ausente.");

    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [field, fieldSchema] of Object.entries(properties)) {
      if (!Object.hasOwn(value, field)) continue;
      const failure = validateJsonSchemaNode(
        value[field],
        fieldSchema,
        rootSchema,
        `${path}.${field}`,
        depth + 1
      );
      if (failure) return failure;
    }
    const extras = keys.filter((field) => !Object.hasOwn(properties, field));
    if (schema.additionalProperties === false && extras.length) {
      return schemaValidationFailure(`${path}.${extras[0]}`, "campo adicional proibido.");
    }
    if (isPlainObject(schema.additionalProperties) || schema.additionalProperties === true) {
      for (const field of extras) {
        const failure = validateJsonSchemaNode(
          value[field],
          schema.additionalProperties,
          rootSchema,
          `${path}.${field}`,
          depth + 1
        );
        if (failure) return failure;
      }
    }
  }
  return "";
}

export function validateJsonSchemaValue(value, schema) {
  const failure = validateJsonSchemaNode(value, schema, schema, "$", 0);
  return failure
    ? { valid: false, error: failure }
    : { valid: true, error: "" };
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
  const sharedRuntimeSource = [
    extractJsonFromText,
    isCodexBridgeTokenSecure,
    isCodexCardAssistancePhase,
    isPlainObject,
    jsonValuesEqual,
    jsonSchemaTypeMatches,
    resolveLocalSchemaReference,
    schemaValidationFailure,
    validateJsonSchemaNode,
    validateJsonSchemaValue
  ].map((implementation) => implementation.toString()).join("\n\n");
  return `import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import process from "node:process";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

${sharedRuntimeSource}

function appendExactSchemaToPrompt(prompt, schema, label = "Schema JSON exato da resposta") {
  if (!isPlainObject(schema)) return prompt;
  const serialized = JSON.stringify(schema);
  if (prompt.includes(serialized)) return prompt;
  return [
    prompt,
    \`\${label} (satisfaça-o integralmente):\`,
    serialized
  ].filter(Boolean).join("\\n\\n");
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

class BridgeHttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "BridgeHttpError";
    this.statusCode = statusCode;
  }
}

function normalizeByteLimit(value, fallback, minimum = 1024, maximum = 16 * 1024 * 1024) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) return fallback;
  return Math.min(parsed, maximum);
}

function parseAllowedOrigins(value) {
  const origins = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!origins.length || origins.includes("*")) {
    throw new Error("ARALEARN_CODEX_ALLOWED_ORIGINS deve listar origens exatas e nunca '*'.");
  }
  return new Set(origins.map((origin) => {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("Origem CORS inválida no bridge local.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)
        || parsed.username
        || parsed.password
        || parsed.origin !== origin.replace(/\\/+$/u, "")) {
      throw new Error("Origem CORS deve conter apenas scheme, host e porta.");
    }
    return parsed.origin;
  }));
}

function requestOrigin(request) {
  return normalizeText(request.headers.origin);
}

function originIsAllowed(request, allowedOrigins) {
  const origin = requestOrigin(request);
  return !origin || allowedOrigins.has(origin);
}

function corsHeaders(request, allowedOrigins) {
  const origin = requestOrigin(request);
  return origin && allowedOrigins.has(origin)
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, x-aralearn-token",
        "access-control-max-age": "600",
        vary: "Origin"
      }
    : { vary: "Origin" };
}

function respondJson(request, response, statusCode, payload, allowedOrigins, maxResponseBytes) {
  let body = JSON.stringify(payload);
  if (Buffer.byteLength(body, "utf8") > maxResponseBytes) {
    statusCode = 502;
    body = JSON.stringify({
      ok: false,
      error: "Resposta do bridge acima do limite configurado."
    });
  }
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...corsHeaders(request, allowedOrigins)
  });
  response.end(body);
}

function isAuthorized(request, token) {
  const expected = normalizeText(token);
  const supplied = normalizeText(request.headers["x-aralearn-token"]);
  if (!isCodexBridgeTokenSecure(expected) || !supplied) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

function readJsonBody(request, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const declaredSize = Number.parseInt(String(request.headers["content-length"] || ""), 10);
    if (Number.isFinite(declaredSize) && declaredSize > maxBodyBytes) {
      request.resume();
      reject(new BridgeHttpError(413, "Payload acima do limite permitido."));
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBodyBytes) {
        settled = true;
        request.resume();
        reject(new BridgeHttpError(413, "Payload acima do limite permitido."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new BridgeHttpError(400, "JSON inválido no corpo do pedido."));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
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

function safeCodexExitDiagnostic(stderr) {
  const lines = String(stderr || "").split(/\\r?\\n/u).map((line) => line.trim());
  const markerIndex = lines.findIndex((line) => /^(?:error|fatal):/iu.test(line));
  if (markerIndex < 0) return "";
  const messageLine = lines.slice(markerIndex, markerIndex + 16)
    .find((line) => line.includes('"message"'));
  const match = messageLine?.match(/"message"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")/u);
  let providerMessage = "";
  try {
    providerMessage = match ? JSON.parse(match[1]) : "";
  } catch {}
  const candidate = normalizeText(
    typeof providerMessage === "string" && providerMessage
      ? providerMessage
      : lines[markerIndex].replace(/^(?:error|fatal):\\s*/iu, "")
  );
  if (/schema/iu.test(candidate)) {
    return "ERROR: O Codex local rejeitou o schema estruturado.";
  }
  if (/unsupported (?:parameter|feature|option)/iu.test(candidate)) {
    return "ERROR: O Codex local não oferece o parâmetro ou recurso solicitado.";
  }
  if (/(?:invalid|inválid[oa]) (?:parameter|parâmetro)/iu.test(candidate)) {
    return "ERROR: O Codex local rejeitou um parâmetro inválido.";
  }
  if (/(?:invalid|inválid[oa]) model|model .*(?:not found|unsupported)/iu.test(candidate)) {
    return "ERROR: O modelo configurado no Codex local é inválido ou indisponível.";
  }
  if (/(?:context|input) (?:length|limit)/iu.test(candidate)) {
    return "ERROR: A entrada excedeu o limite aceito pelo Codex local.";
  }
  return "";
}

function codexChildEnvironment(source = process.env) {
  const allowedNames = [
    "ALL_PROXY",
    "APPDATA",
    "CODEX_HOME",
    "COMSPEC",
    "ComSpec",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "LANG",
    "LC_ALL",
    "LOCALAPPDATA",
    "LOGNAME",
    "NODE_EXTRA_CA_CERTS",
    "NO_PROXY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_ORGANIZATION",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT_ID",
    "PATH",
    "Path",
    "PATHEXT",
    "SHELL",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "SystemRoot",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USER",
    "USERPROFILE",
    "WINDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "all_proxy",
    "http_proxy",
    "https_proxy",
    "no_proxy"
  ];
  return Object.fromEntries(
    allowedNames
      .filter((name) => typeof source?.[name] === "string" && source[name])
      .map((name) => [name, source[name]])
  );
}

function createResultFileTransport({ cwd = process.cwd(), schema = null } = {}) {
  const outputDir = path.join(cwd, ".tmp", "codex-bridge");
  fs.mkdirSync(outputDir, { recursive: true });
  const nonce = \`\${Date.now()}-\${Math.random().toString(36).slice(2, 10)}\`;
  const outputFilePath = path.join(outputDir, \`aralearn-codex-output-\${nonce}.json\`);
  const schemaFilePath = isPlainObject(schema)
    ? path.join(outputDir, \`aralearn-codex-schema-\${nonce}.json\`)
    : "";
  if (schemaFilePath) {
    try {
      fs.writeFileSync(schemaFilePath, JSON.stringify(schema), "utf8");
    } catch (error) {
      try {
        fs.unlinkSync(schemaFilePath);
      } catch {}
      throw error;
    }
  }
  return {
    outputFilePath,
    schemaFilePath
  };
}

function buildCodexExecArgs({ outputFilePath = "", schemaFilePath = "" } = {}) {
  const nextArgs = ["exec", "-"];
  const addOption = (name, ...values) => {
    nextArgs.splice(1, 0, name, ...values);
  };
  addOption("--strict-config");
  addOption("--ignore-user-config");
  addOption("--ignore-rules");
  addOption("--ephemeral");
  addOption("--sandbox", "read-only");
  addOption("--disable", "shell_tool");
  addOption("--disable", "apps");
  addOption("--disable", "browser_use");
  addOption("--disable", "computer_use");
  addOption("--disable", "image_generation");
  addOption("--disable", "multi_agent");
  addOption("--disable", "hooks");
  addOption("--disable", "memories");
  addOption("--disable", "skill_mcp_dependency_install");
  addOption("--disable", "plugins");
  addOption("--color", "never");
  if (outputFilePath) addOption("--output-last-message", outputFilePath);
  if (schemaFilePath) addOption("--output-schema", schemaFilePath);
  return nextArgs;
}

function readLimitedUtf8File(filePath, maxBytes) {
  const size = fs.statSync(filePath).size;
  if (size > maxBytes) {
    throw new BridgeHttpError(502, "Saída estruturada do Codex acima do limite configurado.");
  }
  return fs.readFileSync(filePath, "utf8");
}

function removeTemporaryFiles(cleanupPaths = []) {
  cleanupPaths.forEach((cleanupPath) => {
    if (!cleanupPath) return;
    try {
      fs.unlinkSync(cleanupPath);
    } catch {}
  });
}

function runCodex({
  command,
  args,
  stdinText,
  cwd,
  timeoutMs,
  maxStdoutBytes,
  maxStderrBytes,
  cleanupPaths = []
}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let child;
    try {
      child = spawn(command, args, {
        shell: false,
        cwd,
        env: codexChildEnvironment(process.env),
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (error) {
      removeTemporaryFiles(cleanupPaths);
      reject(normalizeCodexExecutionError(error));
      return;
    }
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timer = null;
    const cleanup = () => removeTemporaryFiles(cleanupPaths);
    const fail = (error, { terminate = true } = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (terminate) child.kill("SIGTERM");
      cleanup();
      reject(error);
    };
    child.stdin.end(typeof stdinText === "string" ? stdinText : "");
    timer = setTimeout(() => {
      fail(new BridgeHttpError(
        504,
        \`Tempo esgotado ao executar o Codex após \${timeoutMs} ms.\`
      ));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) {
        fail(new BridgeHttpError(502, "stdout do Codex acima do limite configurado."));
        return;
      }
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (settled) return;
      stderrBytes += chunk.length;
      if (stderrBytes > maxStderrBytes) {
        fail(new BridgeHttpError(502, "stderr do Codex acima do limite configurado."));
        return;
      }
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      fail(normalizeCodexExecutionError(error), { terminate: false });
    });
    child.on("close", (code) => {
      if (settled) {
        cleanup();
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const safeDiagnostic = safeCodexExitDiagnostic(stderr);
        cleanup();
        reject(new BridgeHttpError(
          502,
          [
            \`O Codex local encerrou com código \${code}; a entrada e a saída livres foram ocultadas.\`,
            safeDiagnostic
          ].filter(Boolean).join(" ")
        ));
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
const allowedOrigins = parseAllowedOrigins(process.env.ARALEARN_CODEX_ALLOWED_ORIGINS);
const defaultCommand = "codex";
const command = normalizeText(process.env.ARALEARN_CODEX_COMMAND) || defaultCommand;
const timeoutMs = normalizeTimeout(process.env.ARALEARN_CODEX_TIMEOUT_MS);
const maxBodyBytes = normalizeByteLimit(
  process.env.ARALEARN_CODEX_MAX_BODY_BYTES,
  1_000_000
);
const maxStdoutBytes = normalizeByteLimit(
  process.env.ARALEARN_CODEX_MAX_STDOUT_BYTES,
  2_000_000
);
const maxStderrBytes = normalizeByteLimit(
  process.env.ARALEARN_CODEX_MAX_STDERR_BYTES,
  262_144
);
const maxResponseBytes = normalizeByteLimit(
  process.env.ARALEARN_CODEX_MAX_RESPONSE_BYTES,
  2_000_000
);
const cwd = normalizeText(process.env.ARALEARN_CODEX_WORKDIR) || process.cwd();

if (!new Set(["127.0.0.1", "::1", "localhost"]).has(host.toLowerCase())) {
  throw new Error("ARALEARN_CODEX_HOST deve permanecer no loopback local.");
}
if (!isCodexBridgeTokenSecure(token)) {
  throw new Error("ARALEARN_CODEX_TOKEN é obrigatório e deve ter pelo menos 32 bytes.");
}

const server = http.createServer(async (request, response) => {
  const send = (statusCode, payload) => respondJson(
    request,
    response,
    statusCode,
    payload,
    allowedOrigins,
    maxResponseBytes
  );

  if (!originIsAllowed(request, allowedOrigins)) {
    send(403, { ok: false, error: "Origem não autorizada pelo bridge local." });
    return;
  }
  if (!request.url) {
    send(404, { ok: false, error: "Rota inválida." });
    return;
  }
  if (request.method === "OPTIONS") {
    if (!requestOrigin(request)) {
      send(400, { ok: false, error: "Preflight CORS sem origem." });
      return;
    }
    response.writeHead(204, corsHeaders(request, allowedOrigins));
    response.end();
    return;
  }
  if (request.url === "/health" && request.method === "GET") {
    if (!isAuthorized(request, token)) {
      send(401, { ok: false, error: "Token local inválido." });
      return;
    }
    send(200, {
      ok: true,
      provider: "codex-cli-local",
      service: "aralearn-codex-bridge",
      version: 1
    });
    return;
  }
  if (request.url !== "/assist" || request.method !== "POST") {
    send(404, { ok: false, error: "Rota não encontrada." });
    return;
  }
  if (!isAuthorized(request, token)) {
    send(401, { ok: false, error: "Token local inválido." });
    return;
  }

  const cleanupPaths = [];
  try {
    const payload = await readJsonBody(request, maxBodyBytes);
    const mode = normalizeText(payload?.mode);
    if (!isCodexCardAssistancePhase(mode)) {
      send(400, {
        ok: false,
        error: "O bridge local aceita somente fases de assistência autorizadas pelo AraLearn."
      });
      return;
    }
    const requestPayload = payload?.request && typeof payload.request === "object" ? payload.request : {};
    const outputSchema = isPlainObject(requestPayload.schema) ? requestPayload.schema : null;
    const guidanceSchema = isPlainObject(requestPayload.guidanceSchema)
      ? requestPayload.guidanceSchema
      : outputSchema;
    let prompt = normalizeText(requestPayload.prebuiltPrompt);
    if (!prompt) {
      send(400, {
        ok: false,
        error: \`Fase \${mode} sem prompt pré-construído.\`
      });
      return;
    }

    prompt = appendExactSchemaToPrompt(
      prompt,
      guidanceSchema,
      guidanceSchema === outputSchema
        ? "Schema JSON exato da resposta"
        : "Contrato JSON canônico da resposta"
    );

    if (!prompt) {
      send(400, {
        ok: false,
        error: "Não foi possível montar um prompt para o Codex local."
      });
      return;
    }

    const resultFileTransport = createResultFileTransport({
      cwd,
      schema: outputSchema
    });
    cleanupPaths.push(resultFileTransport.outputFilePath);
    if (resultFileTransport.schemaFilePath) {
      cleanupPaths.push(resultFileTransport.schemaFilePath);
    }
    const codexResult = await runCodex({
      command,
      args: buildCodexExecArgs(resultFileTransport),
      stdinText: prompt,
      cwd,
      timeoutMs,
      maxStdoutBytes,
      maxStderrBytes,
      cleanupPaths
    });
    const outputText = fs.existsSync(resultFileTransport.outputFilePath)
      ? readLimitedUtf8File(resultFileTransport.outputFilePath, maxStdoutBytes)
      : codexResult.stdout;
    let result;
    try {
      result = extractJsonFromText(outputText);
    } catch (error) {
      throw new BridgeHttpError(
        502,
        normalizeText(error?.message) || "Saída estruturada inválida do Codex."
      );
    }
    if (outputSchema) {
      const validation = validateJsonSchemaValue(result, outputSchema);
      if (!validation.valid) {
        throw new BridgeHttpError(
          502,
          \`Saída do Codex não satisfaz o schema solicitado: \${validation.error}\`
        );
      }
    }
    removeTemporaryFiles(cleanupPaths);
    send(200, {
      ok: true,
      result,
      meta: {
        provider: "codex-cli-local",
        mode,
        elapsedMs: codexResult.elapsedMs
      }
    });
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode)
      && error.statusCode >= 400
      && error.statusCode <= 599
      ? error.statusCode
      : 500;
    removeTemporaryFiles(cleanupPaths);
    send(statusCode, {
      ok: false,
      error: normalizeText(error?.message) || "Falha inesperada no bridge local."
    });
  } finally {
    removeTemporaryFiles(cleanupPaths);
  }
});

server.listen(port, host, () => {
  console.log(\`AraLearn Codex bridge em http://\${host}:\${port}\`);
});
`;
}
