import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildStandaloneBridgeSource,
  extractJsonFromText,
  isCodexBridgeTokenSecure,
  validateJsonSchemaValue
} from "../../src/assist/codexBridgeShared.js";
import { createCodexCliProvider } from "../../src/generation/providers/codexCliProvider.js";
import {
  buildCodexCliHealthCommand,
  buildCodexCliSetupScript,
  resolveCodexCliAppOrigin
} from "../../src/ui/codexCliSetup.js";
import { renderProviderConfigOverlay } from "../../src/ui/renderProviderConfigOverlay.js";
import {
  CUSTOM_PROVIDER_MODEL_ID,
  PROVIDER_PROTOCOL
} from "../../src/generation/providers/providerRegistry.js";

const BRIDGE_TOKEN = "aralearn-codex-bridge-token-tests-2026";
const ALLOWED_ORIGIN = "https://appassets.androidplatform.net";

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => {
    if (error) reject(error);
    else resolve();
  }));
  return port;
}

async function writeBridgeFixture(root) {
  const bridgePath = path.join(root, "bridge.mjs");
  const fakeCodexExecPath = path.join(root, "exec");
  await writeFile(bridgePath, buildStandaloneBridgeSource(), "utf8");
  const fakeCodexSource = `import fs from "node:fs";

const args = process.argv.slice(2);
const stdin = await new Promise((resolve, reject) => {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  process.stdin.on("error", reject);
});
const readOption = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || "") : "";
};
const outputPath = readOption("--output-last-message");
const schemaPath = readOption("--output-schema");
const prompt = stdin;
const emit = (value) => {
  if (outputPath) {
    fs.writeFileSync(outputPath, value, "utf8");
    process.stdout.write("resultado estruturado gravado");
  } else {
    process.stdout.write(value);
  }
};

if (prompt.includes("[stdout-overflow]")) {
  process.stdout.write("x".repeat(20000));
} else if (prompt.includes("[stderr-overflow]")) {
  process.stderr.write("x".repeat(20000));
} else if (prompt.includes("[process-failure]")) {
  process.stderr.write(\`falha que repetiria o contexto: \${prompt}\`);
  process.exitCode = 7;
} else if (prompt.includes("[timeout]")) {
  setTimeout(() => emit('{"ok":true}'), 5000);
} else if (prompt.includes("[response-overflow]")) {
  emit(JSON.stringify({ blob: "x".repeat(4000) }));
} else if (prompt.includes("[schema-mismatch]")) {
  emit('{"ok":"não"}');
} else if (prompt.includes("[markdown-output]")) {
  emit('\`\`\`json\\n{"ok":true}\\n\`\`\`');
} else if (prompt.includes("[prefixed-output]")) {
  emit('prefixo {"ok":true}');
} else if (prompt.includes("[suffixed-output]")) {
  emit('{"ok":true} sufixo');
} else if (prompt.includes("[schema-visible]")) {
  const expected = String(process.env.ARALEARN_TEST_EXPECTED_SCHEMA || "");
  const expectedGuidance = String(process.env.ARALEARN_TEST_EXPECTED_GUIDANCE || "");
  const schemaFile = schemaPath ? fs.readFileSync(schemaPath, "utf8") : "";
  emit(JSON.stringify({
    ok: Boolean(expected)
      && prompt.includes(expectedGuidance || expected)
      && schemaFile === expected
  }));
} else {
  emit('{"ok":true}');
}
`;
  await writeFile(fakeCodexExecPath, fakeCodexSource, "utf8");
  return { bridgePath };
}

async function waitUntilListening(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`Bridge não iniciou. stdout=${stdout} stderr=${stderr}`));
    }, 5000);
    const finish = (callback) => {
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
      callback();
    };
    const onStdout = (chunk) => {
      stdout += String(chunk);
      if (stdout.includes("AraLearn Codex bridge em")) {
        finish(resolve);
      }
    };
    const onStderr = (chunk) => {
      stderr += String(chunk);
    };
    const onExit = (code) => {
      finish(() => reject(new Error(
        `Bridge encerrou antes de iniciar (${code}). stderr=${stderr}`
      )));
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
  });
}

async function startBridge({
  root,
  command,
  allowedOrigin = ALLOWED_ORIGIN,
  token = BRIDGE_TOKEN,
  maxBodyBytes = 20_000,
  maxStdoutBytes = 8_192,
  maxStderrBytes = 1_024,
  maxResponseBytes = 1_024,
  timeoutMs = 1_000,
  expectedSchema = "",
  expectedGuidance = "",
  versionedBridge = false
} = {}) {
  const { bridgePath } = await writeBridgeFixture(root);
  const executableBridgePath = versionedBridge
    ? path.resolve("scripts/aralearnCodexBridge.mjs")
    : bridgePath;
  const port = await reserveLoopbackPort();
  const child = spawn(process.execPath, [executableBridgePath], {
    cwd: root,
    env: {
      ...process.env,
      ARALEARN_CODEX_HOST: "127.0.0.1",
      ARALEARN_CODEX_PORT: String(port),
      ARALEARN_CODEX_TOKEN: token,
      ARALEARN_CODEX_ALLOWED_ORIGINS: allowedOrigin,
      ARALEARN_CODEX_COMMAND: command || process.execPath,
      ARALEARN_CODEX_TIMEOUT_MS: String(timeoutMs),
      ARALEARN_CODEX_MAX_BODY_BYTES: String(maxBodyBytes),
      ARALEARN_CODEX_MAX_STDOUT_BYTES: String(maxStdoutBytes),
      ARALEARN_CODEX_MAX_STDERR_BYTES: String(maxStderrBytes),
      ARALEARN_CODEX_MAX_RESPONSE_BYTES: String(maxResponseBytes),
      ARALEARN_CODEX_WORKDIR: root,
      ARALEARN_TEST_EXPECTED_SCHEMA: expectedSchema,
      ARALEARN_TEST_EXPECTED_GUIDANCE: expectedGuidance
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  await waitUntilListening(child);
  return {
    child,
    baseUrl: `http://127.0.0.1:${port}`
  };
}

async function stopBridge(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const firstExit = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([
    firstExit,
    new Promise((resolve) => setTimeout(resolve, 2000))
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    const forcedExit = once(child, "exit");
    child.kill("SIGKILL");
    await Promise.race([
      forcedExit,
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

function authorizedHeaders(origin = ALLOWED_ORIGIN) {
  return {
    "content-type": "application/json",
    "x-aralearn-token": BRIDGE_TOKEN,
    ...(origin ? { origin } : {})
  };
}

async function sendAssist(baseUrl, request, {
  origin = ALLOWED_ORIGIN,
  mode = "card_assistance_build"
} = {}) {
  return fetch(`${baseUrl}/assist`, {
    method: "POST",
    headers: authorizedHeaders(origin),
    body: JSON.stringify({
      mode,
      request
    })
  });
}

async function listBridgeTemporaryFiles(root) {
  try {
    return await readdir(path.join(root, ".tmp", "codex-bridge"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

test("validador compartilhado aplica o schema exato, inclusive refs e propriedades extras", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        minItems: 1,
        items: { $ref: "#/$defs/item" }
      }
    },
    $defs: {
      item: {
        type: "object",
        additionalProperties: false,
        required: ["id", "enabled"],
        properties: {
          id: { type: "string", minLength: 2 },
          enabled: { type: "boolean" }
        }
      }
    }
  };

  assert.deepEqual(
    validateJsonSchemaValue({ items: [{ id: "a1", enabled: true }] }, schema),
    { valid: true, error: "" }
  );
  const invalid = validateJsonSchemaValue({
    items: [{ id: "a1", enabled: "sim", legacy: true }]
  }, schema);
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /\$\.items\[0\]\.enabled/u);
});

test("parser do bridge aceita somente o documento JSON inteiro", () => {
  assert.deepEqual(extractJsonFromText('  {"ok":true}  '), { ok: true });
  [
    'prefixo {"ok":true}',
    '{"ok":true} sufixo',
    '```json\n{"ok":true}\n```'
  ].forEach((value) => {
    assert.throws(
      () => extractJsonFromText(value),
      /documento JSON único e válido/u
    );
  });
  const standaloneSource = buildStandaloneBridgeSource();
  assert.doesNotMatch(standaloneSource, /markdownMatch|firstBrace|lastBrace/u);
  assert.doesNotMatch(
    standaloneSource,
    /top_down_structure|top_down_structure_audit|generate-top-down-structure/u
  );
  assert.match(standaloneSource, /documento JSON único e válido/u);
});

test("setup exige token forte e fixa a origem exata de Android, Pages e desenvolvimento", () => {
  const cases = [
    {
      platform: "android",
      origin: "https://appassets.androidplatform.net"
    },
    {
      platform: "windows",
      origin: "https://fabio-ara.github.io"
    },
    {
      platform: "linux",
      origin: "http://localhost:8080"
    }
  ];

  cases.forEach(({ platform, origin }) => {
    const script = buildCodexCliSetupScript({
      platform,
      token: BRIDGE_TOKEN,
      appOrigin: origin
    });
    assert.match(script, /ARALEARN_CODEX_ALLOWED_ORIGINS/u);
    assert.equal(script.includes(origin), true);
    assert.equal(script.includes("ARALEARN_CODEX_MAX_STDOUT_BYTES"), true);
    assert.equal(script.includes("ARALEARN_CODEX_MAX_RESPONSE_BYTES"), true);
    assert.equal(script.includes('addOption("--ephemeral")'), true);
    assert.equal(script.includes('addOption("--sandbox", "read-only")'), true);
    assert.equal(script.includes('addOption("--disable", "shell_tool")'), true);
    assert.equal(script.includes("ARALEARN_CODEX_ARGS"), false);
    assert.equal(script.includes('ARALEARN_CODEX_ALLOWED_ORIGINS="*"'), false);
    assert.equal(script.includes("ARALEARN_CODEX_ALLOWED_ORIGINS='*'"), false);
  });

  assert.equal(
    resolveCodexCliAppOrigin({ platform: "android" }),
    "https://appassets.androidplatform.net"
  );
  assert.throws(
    () => buildCodexCliSetupScript({
      platform: "linux",
      token: "",
      appOrigin: "http://localhost:8080"
    }),
    /token local/u
  );
  assert.throws(
    () => buildCodexCliSetupScript({
      platform: "linux",
      token: BRIDGE_TOKEN,
      appOrigin: "https://hostil.example/caminho"
    }),
    /somente protocolo, host e porta/u
  );
  assert.throws(
    () => resolveCodexCliAppOrigin({ appOrigin: "*" }),
    /origem exata/u
  );
  assert.throws(
    () => buildCodexCliHealthCommand({ platform: "linux", token: "" }),
    /token local/u
  );
  assert.match(
    buildCodexCliHealthCommand({ platform: "windows", token: BRIDGE_TOKEN }),
    new RegExp(BRIDGE_TOKEN, "u")
  );
});

test("configuração visual marca o token de bridges locais como obrigatório", () => {
  const codexHtml = renderProviderConfigOverlay({
    selectedModel: "codex-cli-local"
  });
  assert.match(
    codexHtml,
    /data-field="provider-config-codex-token"[^>]* required minlength="32" maxlength="512"/u
  );
  assert.match(codexHtml, /Token obrigatório \(32–512 bytes\)/u);
  assert.doesNotMatch(codexHtml, /Token opcional/u);

  const customLocalHtml = renderProviderConfigOverlay({
    selectedModel: CUSTOM_PROVIDER_MODEL_ID,
    providerProtocol: PROVIDER_PROTOCOL.LOCAL_BRIDGE
  });
  assert.match(
    customLocalHtml,
    /data-field="provider-config-secret"[^>]* required minlength="32" maxlength="512"/u
  );
  assert.doesNotMatch(customLocalHtml, /Token opcional/u);
});

test("provider Codex recusa segredo ausente e saída fora do schema antes de aceitá-la", async () => {
  assert.equal(isCodexBridgeTokenSecure(""), false);
  assert.equal(isCodexBridgeTokenSecure("curto"), false);
  assert.equal(isCodexBridgeTokenSecure(BRIDGE_TOKEN), true);

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      ok: true,
      result: { ok: "sim" }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    const providerWithoutToken = createCodexCliProvider();
    await assert.rejects(
      () => providerWithoutToken.generateText({ prompt: "Teste." }),
      (error) => error?.statusCode === 401
    );
    assert.equal(calls, 0);

    const provider = createCodexCliProvider({ token: BRIDGE_TOKEN });
    await assert.rejects(
      () => provider.generateStructured({
        phase: "top_down_structure",
        schema: {
          type: "object",
          properties: {}
        },
        prompt: "Planeje."
      }),
      (error) => error?.statusCode === 400
    );
    assert.equal(calls, 0);

    await assert.rejects(
      () => provider.generateStructured({
        phase: "card_assistance_build",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean" } }
        },
        prompt: "Teste."
      }),
      (error) =>
        error?.category === "invalid_structured_output"
        && /\$\.ok/u.test(error.message)
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider Codex projeta o schema do CLI e revalida a saída no contrato canônico", async () => {
  const canonicalSchema = {
    type: "object",
    additionalProperties: false,
    required: ["mode"],
    properties: {
      mode: { const: "ok" },
      alternative: { type: "string", minLength: 1, maxLength: 3 },
      score: { type: "number", minimum: 0, maximum: 1 }
    },
    allOf: [{
      not: { required: ["mode", "alternative"] }
    }]
  };
  const requests = [];
  const responses = [
    { mode: "ok", alternative: null },
    { mode: "ok", alternative: "fora-do-contrato" }
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({
      ok: true,
      result: responses.shift()
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    const provider = createCodexCliProvider({ token: BRIDGE_TOKEN });
    const accepted = await provider.generateStructured({
      phase: "card_assistance_build",
      schema: canonicalSchema,
      prompt: "Teste."
    });
    assert.deepEqual(accepted.value, { mode: "ok" });
    assert.equal(JSON.stringify(requests[0].request.schema).includes('"allOf"'), false);
    assert.equal(JSON.stringify(requests[0].request.schema).includes('"maxLength"'), false);
    assert.deepEqual(requests[0].request.guidanceSchema, canonicalSchema);
    assert.equal(
      requests[0].request.prebuiltPrompt.includes("contrato canônico"),
      true
    );

    await assert.rejects(
      () => provider.generateStructured({
        phase: "card_assistance_build",
        schema: canonicalSchema,
        prompt: "Teste."
      }),
      (error) => error?.category === "invalid_structured_output"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bridge aplica autenticação e CORS exato, mantendo cliente sem Origin autenticado", {
  timeout: 10_000
}, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "aralearn-codex-cors-"));
  const bridge = await startBridge({ root, versionedBridge: true });
  t.after(async () => {
    await stopBridge(bridge.child);
    await rm(root, { recursive: true, force: true });
  });

  const allowed = await fetch(`${bridge.baseUrl}/health`, {
    headers: authorizedHeaders(ALLOWED_ORIGIN)
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);

  const hostile = await fetch(`${bridge.baseUrl}/health`, {
    headers: authorizedHeaders("https://hostil.example")
  });
  assert.equal(hostile.status, 403);
  assert.equal(hostile.headers.get("access-control-allow-origin"), null);

  const commandLineClient = await fetch(`${bridge.baseUrl}/health`, {
    headers: authorizedHeaders("")
  });
  assert.equal(commandLineClient.status, 200);
  assert.equal(commandLineClient.headers.get("access-control-allow-origin"), null);

  const emptyAuthorization = await fetch(`${bridge.baseUrl}/health`, {
    headers: { origin: ALLOWED_ORIGIN }
  });
  assert.equal(emptyAuthorization.status, 401);

  const removedTopDownMode = await sendAssist(
    bridge.baseUrl,
    { prebuiltPrompt: "Planeje um curso." },
    { mode: "top_down_structure" }
  );
  assert.equal(removedTopDownMode.status, 400);
  assert.match((await removedTopDownMode.json()).error, /somente às três fases/u);
});

test("bridge falha fechado em body, stdout, stderr, resposta e schema inválido", {
  timeout: 15_000
}, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "aralearn-codex-limits-"));
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: { const: true },
      label: { type: "string" },
      score: { type: "number" }
    }
  };
  const canonicalGuidance = {
    ...schema,
    properties: {
      ok: { const: true },
      label: { type: "string", minLength: 1, maxLength: 12 },
      score: { type: "number", minimum: 0, maximum: 1 }
    }
  };
  const bridge = await startBridge({
    root,
    maxBodyBytes: 1_024,
    maxStdoutBytes: 8_192,
    maxStderrBytes: 1_024,
    maxResponseBytes: 1_024,
    timeoutMs: 5_000,
    expectedSchema: JSON.stringify(schema),
    expectedGuidance: JSON.stringify(canonicalGuidance)
  });
  t.after(async () => {
    await stopBridge(bridge.child);
    await rm(root, { recursive: true, force: true });
  });

  const oversizedBody = await sendAssist(bridge.baseUrl, {
    prebuiltPrompt: "x".repeat(2_000)
  });
  assert.equal(oversizedBody.status, 413);

  const oversizedStdout = await sendAssist(bridge.baseUrl, {
    prebuiltPrompt: "[stdout-overflow]"
  });
  assert.equal(oversizedStdout.status, 502);
  assert.match((await oversizedStdout.json()).error, /stdout/u);

  const oversizedStderr = await sendAssist(bridge.baseUrl, {
    prebuiltPrompt: "[stderr-overflow]"
  });
  assert.equal(oversizedStderr.status, 502);
  assert.match((await oversizedStderr.json()).error, /stderr/u);

  const privateContext = "conteudo-privado-do-card-nao-pode-vazar";
  const processFailure = await sendAssist(bridge.baseUrl, {
    prebuiltPrompt: `[process-failure] ${privateContext}`
  });
  assert.equal(processFailure.status, 502);
  const processFailureBody = await processFailure.json();
  assert.match(processFailureBody.error, /código 7/u);
  assert.match(processFailureBody.error, /ocultada/u);
  assert.doesNotMatch(processFailureBody.error, new RegExp(privateContext, "u"));
  assert.doesNotMatch(processFailureBody.error, /falha que repetiria/u);

  const oversizedResponse = await sendAssist(bridge.baseUrl, {
    prebuiltPrompt: "[response-overflow]"
  });
  assert.equal(oversizedResponse.status, 502);
  assert.match((await oversizedResponse.json()).error, /Resposta do bridge/u);

  const schemaMismatch = await sendAssist(bridge.baseUrl, {
    prebuiltPrompt: "[schema-mismatch]",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ok"],
      properties: { ok: { type: "boolean" } }
    }
  });
  assert.equal(schemaMismatch.status, 502);
  assert.match((await schemaMismatch.json()).error, /não satisfaz o schema/u);

  const schemaVisible = await sendAssist(bridge.baseUrl, {
    prebuiltPrompt: "[schema-visible]",
    schema,
    guidanceSchema: canonicalGuidance
  });
  assert.equal(schemaVisible.status, 200);
  assert.equal((await schemaVisible.json()).result.ok, true);

  for (const marker of [
    "[markdown-output]",
    "[prefixed-output]",
    "[suffixed-output]"
  ]) {
    const mixedOutput = await sendAssist(bridge.baseUrl, {
      prebuiltPrompt: marker
    });
    assert.equal(mixedOutput.status, 502);
    assert.match((await mixedOutput.json()).error, /documento JSON único e válido/u);
  }
});

test("bridge remove schema e resposta temporários em sucesso, excesso, timeout e erro de spawn", {
  timeout: 15_000
}, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "aralearn-codex-cleanup-"));
  const bridge = await startBridge({
    root,
    maxBodyBytes: 32_000,
    maxStdoutBytes: 1_024,
    timeoutMs: 1_000
  });
  let spawnRoot = "";
  let spawnBridge = null;
  t.after(async () => {
    await stopBridge(spawnBridge?.child);
    await stopBridge(bridge.child);
    if (spawnRoot) {
      await rm(spawnRoot, { recursive: true, force: true });
    }
    await rm(root, { recursive: true, force: true });
  });

  const longPrefix = "contexto ".repeat(1_600);
  const scenarios = [
    {
      marker: "[success]",
      status: 200,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: { ok: { type: "boolean" } }
      }
    },
    { marker: "[stdout-overflow]", status: 502 },
    { marker: "[timeout]", status: 504 }
  ];
  for (const scenario of scenarios) {
    const response = await sendAssist(bridge.baseUrl, {
      prebuiltPrompt: `${scenario.marker}\n${longPrefix}`,
      ...(scenario.schema ? { schema: scenario.schema } : {})
    });
    assert.equal(response.status, scenario.status);
    assert.deepEqual(await listBridgeTemporaryFiles(root), []);
  }

  spawnRoot = await mkdtemp(path.join(tmpdir(), "aralearn-codex-spawn-"));
  spawnBridge = await startBridge({
    root: spawnRoot,
    command: path.join(spawnRoot, "comando-inexistente"),
    maxBodyBytes: 32_000
  });
  const spawnFailure = await sendAssist(spawnBridge.baseUrl, {
    prebuiltPrompt: `[spawn-error]\n${longPrefix}`
  });
  assert.equal(spawnFailure.status, 500);
  assert.deepEqual(await listBridgeTemporaryFiles(spawnRoot), []);
});

test("bridge não inicia com token vazio nem com origem curinga", {
  timeout: 10_000
}, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "aralearn-codex-startup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bridgePath = path.join(root, "bridge.mjs");
  await writeFile(bridgePath, buildStandaloneBridgeSource(), "utf8");

  async function runInvalidEnvironment(overrides) {
    const child = spawn(process.execPath, [bridgePath], {
      cwd: root,
      env: {
        ...process.env,
        ARALEARN_CODEX_HOST: "127.0.0.1",
        ARALEARN_CODEX_PORT: String(await reserveLoopbackPort()),
        ARALEARN_CODEX_TOKEN: BRIDGE_TOKEN,
        ARALEARN_CODEX_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
        ...overrides
      },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const [code] = await once(child, "exit");
    return { code, stderr };
  }

  const emptyToken = await runInvalidEnvironment({ ARALEARN_CODEX_TOKEN: "" });
  assert.notEqual(emptyToken.code, 0);
  assert.match(emptyToken.stderr, /TOKEN é obrigatório/u);

  const wildcard = await runInvalidEnvironment({
    ARALEARN_CODEX_ALLOWED_ORIGINS: "*"
  });
  assert.notEqual(wildcard.code, 0);
  assert.match(wildcard.stderr, /nunca '\*'/u);

  const versionedBridge = await readFile(
    path.resolve("scripts/aralearnCodexBridge.mjs"),
    "utf8"
  );
  assert.match(versionedBridge, /buildStandaloneBridgeSource/u);
  assert.doesNotMatch(versionedBridge, /access-control-allow-origin/u);
});
