import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scripts = {
  diagnose: path.join(repositoryRoot, "scripts", "diagnoseDeployment.ps1"),
  plan: path.join(repositoryRoot, "scripts", "planDeployment.ps1"),
  verify: path.join(repositoryRoot, "scripts", "verifyDeploymentArtifacts.ps1"),
  validate: path.join(repositoryRoot, "scripts", "validateDeployment.ps1")
};
const publishableKey = `sb_publishable_${"A".repeat(24)}`;
const assistOrigins = [
  "https://api.deepseek.com",
  "https://api.openai.com",
  "https://generativelanguage.googleapis.com"
];

function hasPowerShell() {
  return spawnSync("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], {
    encoding: "utf8"
  }).status === 0;
}

const powerShellAvailable = hasPowerShell();

function runScript(scriptPath, args = [], environment = {}) {
  return spawnSync("pwsh", ["-NoProfile", "-File", scriptPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_DB_PASSWORD: "",
      ...environment
    }
  });
}

function parseJsonOutput(result) {
  assert.doesNotThrow(() => JSON.parse(result.stdout), result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function writeSafeArtifact(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "runtime-config.js"),
    `globalThis.__ARALEARN_ENV__ = ${JSON.stringify({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      supabasePublishableKey: publishableKey,
      assistAllowedOrigins: assistOrigins
    })};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "index.html"),
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="connect-src 'self' https://abcdefghijklmnopqrst.supabase.co ${assistOrigins.join(" ")};">\n`,
    "utf8"
  );
}

test("planos de implantação cobrem somente os três perfis suportados", {
  skip: !powerShellAvailable
}, () => {
  const expectedSteps = {
    GitHubPagesManagedSupabase: ["github-variables", "verify-artifact", "publish"],
    StaticHostManagedSupabase: ["build", "verify-artifact", "upload"],
    LocalDevelopment: ["start-supabase", "reset-local", "stop"]
  };

  for (const [profile, stepIds] of Object.entries(expectedSteps)) {
    const result = runScript(scripts.plan, ["-Profile", profile, "-AsJson"]);
    assert.equal(result.status, 0, result.stderr);
    const plan = parseJsonOutput(result);
    assert.equal(plan.profile, profile);
    assert.equal(plan.support, "supported");
    const actualIds = plan.steps.map((step) => step.id);
    for (const stepId of stepIds) assert.ok(actualIds.includes(stepId), `${profile}: ${stepId}`);
  }

  const unsupported = runScript(scripts.plan, ["-Profile", "CustomDatabase", "-AsJson"]);
  assert.notEqual(unsupported.status, 0);

  const invalidAddress = runScript(scripts.plan, [
    "-Profile", "StaticHostManagedSupabase",
    "-ApplicationUrl", "intranet/aralearn",
    "-AsJson"
  ]);
  assert.notEqual(invalidAddress.status, 0);

  const source = fs.readFileSync(scripts.plan, "utf8");
  assert.doesNotMatch(source, /npm\.cmd[^\r\n]*;[^\r\n]*npm\.cmd/u);
  assert.match(source, /validateDeployment\.ps1/u);
});

test("executor de implantação verifica cada comando nativo antes de avançar", () => {
  const source = fs.readFileSync(scripts.validate, "utf8");
  assert.match(source, /if \(\$LASTEXITCODE -ne 0\)/u);
  assert.match(source, /As etapas seguintes não foram executadas/u);
  assert.doesNotMatch(source, /\b(?:npm\.cmd|gradlew\.bat)[^\r\n]*;[^\r\n]*/u);
});

test("diagnóstico valida configuração pública sem revelar seu valor", {
  skip: !powerShellAvailable
}, () => {
  const safe = runScript(
    scripts.diagnose,
    ["-Profile", "GitHubPagesManagedSupabase", "-RequireRuntimeConfig", "-AsJson"],
    {
      ARALEARN_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: publishableKey
    }
  );
  assert.equal(safe.status, 0, safe.stderr || safe.stdout);
  const report = parseJsonOutput(safe);
  assert.equal(report.ready, true);
  assert.ok(report.checks.some((entry) => entry.id === "config.publishable-key" && entry.status === "ok"));
  assert.doesNotMatch(safe.stdout, new RegExp(publishableKey));

  const servicePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  const serviceToken = `eyJhbGciOiJIUzI1NiJ9.${servicePayload}.signature-not-a-secret`;
  const unsafe = runScript(
    scripts.diagnose,
    ["-Profile", "GitHubPagesManagedSupabase", "-RequireRuntimeConfig", "-AsJson"],
    {
      ARALEARN_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: serviceToken
    }
  );
  assert.notEqual(unsafe.status, 0);
  assert.equal(parseJsonOutput(unsafe).ready, false);
  assert.doesNotMatch(unsafe.stdout, new RegExp(serviceToken.replaceAll(".", "\\.")));

  const userPayload = Buffer.from(JSON.stringify({ role: "authenticated" })).toString("base64url");
  const userToken = `eyJhbGciOiJIUzI1NiJ9.${userPayload}.temporary-user-token`;
  const userSession = runScript(
    scripts.diagnose,
    ["-Profile", "GitHubPagesManagedSupabase", "-RequireRuntimeConfig", "-AsJson"],
    {
      ARALEARN_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: userToken
    }
  );
  assert.notEqual(userSession.status, 0);
  assert.doesNotMatch(userSession.stdout, new RegExp(userToken.replaceAll(".", "\\.")));

  const invalidAssistOrigin = runScript(
    scripts.diagnose,
    ["-Profile", "GitHubPagesManagedSupabase", "-RequireRuntimeConfig", "-AsJson"],
    {
      ARALEARN_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      ARALEARN_ASSIST_ALLOWED_ORIGINS: "https://example.org/v1"
    }
  );
  assert.notEqual(invalidAssistOrigin.status, 0);
  assert.ok(parseJsonOutput(invalidAssistOrigin).checks.some(
    (entry) => entry.id === "config.assist-origins" && entry.status === "blocked"
  ));
});

test("verificação aprova artefato público exato", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-artifact-safe-"));
  try {
    writeSafeArtifact(temporaryRoot);
    const result = runScript(scripts.verify, [
      "-ArtifactPath", temporaryRoot,
      "-RequireRuntimeConfig",
      "-AsJson"
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = parseJsonOutput(result);
    assert.equal(report.valid, true);
    assert.equal(report.artifacts[0].fileCount, 2);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("verificação bloqueia segredo, catálogo embarcado e CSP ampla sem imprimir a chave", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-artifact-unsafe-"));
  try {
    writeSafeArtifact(temporaryRoot);
    const servicePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    const serviceToken = `eyJhbGciOiJIUzI1NiJ9.${servicePayload}.signature-not-a-secret`;
    fs.writeFileSync(path.join(temporaryRoot, "application.js"), `const credential = "${serviceToken}";`, "utf8");
    fs.writeFileSync(path.join(temporaryRoot, "catalog-courses.json"), "{}", "utf8");
    fs.writeFileSync(
      path.join(temporaryRoot, "index.html"),
      "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"connect-src 'self' https:;\">\n",
      "utf8"
    );

    const result = runScript(scripts.verify, ["-ArtifactPath", temporaryRoot, "-AsJson"]);
    assert.notEqual(result.status, 0);
    const report = parseJsonOutput(result);
    const codes = new Set(report.issues.map((issue) => issue.code));
    assert.ok(codes.has("secret.service-role-jwt"));
    assert.ok(codes.has("artifact.catalog"));
    assert.ok(codes.has("csp.wildcard"));
    assert.doesNotMatch(result.stdout, new RegExp(serviceToken.replaceAll(".", "\\.")));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("verificação detecta artefato gerado para outro projeto", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-artifact-mismatch-"));
  try {
    writeSafeArtifact(temporaryRoot);
    const result = runScript(
      scripts.verify,
      ["-ArtifactPath", temporaryRoot, "-RequireRuntimeConfig", "-AsJson"],
      {
        ARALEARN_SUPABASE_URL: "https://zyxwvutsrqponmlkjihg.supabase.co",
        ARALEARN_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${"B".repeat(24)}`
      }
    );
    assert.notEqual(result.status, 0);
    const codes = new Set(parseJsonOutput(result).issues.map((issue) => issue.code));
    assert.ok(codes.has("config.project-url-mismatch"));
    assert.ok(codes.has("config.publishable-key-mismatch"));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("verificação examina os recursos empacotados no APK", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-"));
  try {
    const assetsRoot = path.join(temporaryRoot, "payload", "assets", "www", "public");
    fs.mkdirSync(assetsRoot, { recursive: true });
    const servicePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    const serviceToken = `eyJhbGciOiJIUzI1NiJ9.${servicePayload}.packaged-service-token`;
    fs.writeFileSync(path.join(assetsRoot, "application.js"), `const key = "${serviceToken}";`, "utf8");
    const zipPath = path.join(temporaryRoot, "application.zip");
    const apkPath = path.join(temporaryRoot, "application.apk");
    const compressed = spawnSync("pwsh", [
      "-NoProfile",
      "-Command",
      "& { param([string]$source, [string]$destination) Compress-Archive -LiteralPath $source -DestinationPath $destination }",
      path.join(temporaryRoot, "payload", "assets"),
      zipPath
    ], { encoding: "utf8" });
    assert.equal(compressed.status, 0, compressed.stderr);
    fs.renameSync(zipPath, apkPath);

    const result = runScript(scripts.verify, ["-ArtifactPath", apkPath, "-AsJson"]);
    assert.notEqual(result.status, 0);
    const report = parseJsonOutput(result);
    assert.ok(report.issues.some((issue) => issue.code === "secret.service-role-jwt"));
    assert.doesNotMatch(result.stdout, new RegExp(serviceToken.replaceAll(".", "\\.")));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
