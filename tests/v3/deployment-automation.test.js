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
  postgrestSmoke: path.join(repositoryRoot, "supabase", "tests", "postgrest-smoke.mjs"),
  verify: path.join(repositoryRoot, "scripts", "verifyDeploymentArtifacts.ps1"),
  validate: path.join(repositoryRoot, "scripts", "validateDeployment.ps1"),
  validateLocalSupabase: path.join(repositoryRoot, "scripts", "validateLocalSupabase.ps1")
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

function packApk(temporaryRoot, preparePublicRuntime) {
  const publicRoot = path.join(temporaryRoot, "payload", "assets", "www", "public");
  fs.mkdirSync(publicRoot, { recursive: true });
  preparePublicRuntime(publicRoot);
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
  return apkPath;
}

test("planos de implantação cobrem somente os três perfis suportados", {
  skip: !powerShellAvailable
}, () => {
  const expectedSteps = {
    GitHubPagesManagedSupabase: ["github-variables", "verify-artifact", "publish", "verify-published"],
    StaticHostManagedSupabase: ["build", "verify-artifact", "upload", "verify-published"],
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
  assert.match(source, /deployment:verify-site/u);
  for (const plan of [
    runScript(scripts.plan, ["-Profile", "GitHubPagesManagedSupabase", "-AsJson"]),
    runScript(scripts.plan, ["-Profile", "StaticHostManagedSupabase", "-AsJson"]),
  ]) {
    const diagnose = parseJsonOutput(plan).steps.find(({ id }) => id === "diagnose");
    assert.match(diagnose.command, /-Authoring/u);
  }
});

test("executor de implantação verifica cada comando nativo antes de avançar", () => {
  const source = fs.readFileSync(scripts.validate, "utf8");
  assert.match(source, /if \(\$LASTEXITCODE -ne 0\)/u);
  assert.match(source, /As etapas seguintes não foram executadas/u);
  assert.match(source, /Resolve-AraLearnDenoCommand/u);
  assert.match(source, /aralearn-authoring-api\.test\.ts/u);
  assert.match(source, /aralearn-authoring-mcp\.test\.ts/u);
  assert.match(source, /deno\.json/u);
  assert.doesNotMatch(source, /\b(?:npm\.cmd|gradlew\.bat)[^\r\n]*;[^\r\n]*/u);
});

test("primeira implantação da autoria cria segredos distintos sem arquivo local", () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "scripts", "deploySupabase.ps1"), "utf8");
  assert.match(source, /InitializeAuthoringSecrets/u);
  assert.match(source, /ARALEARN_AUTHORING_INTEGRATION_SECRET=/u);
  assert.match(source, /ARALEARN_AUTHORING_RECEIPT_SECRET=/u);
  assert.match(source, /RandomNumberGenerator.*GetBytes\(48\)/su);
  assert.match(source, /InitializeAuthoringSecrets -and -not \$DeployAuthoringApi/u);
  assert.match(source, /function Resolve-AllowedOrigins/u);
  assert.match(source, /\$value -split ','/u);
  assert.match(source, /Select-Object -Unique/u);
  assert.doesNotMatch(source, /--env-file|Set-Content|Out-File/u);
  assert.match(source, /finally\s*\{[\s\S]*\$integrationSecret = \$null[\s\S]*\$receiptSecret = \$null/u);
});

test("validação integrada do Supabase só aceita o stack local e restaura o ambiente", () => {
  const source = fs.readFileSync(scripts.validateLocalSupabase, "utf8");
  assert.match(source, /Assert-LocalProjectUrl/u);
  assert.match(source, /--local/u);
  assert.match(source, /auth-email-smoke\.mjs/u);
  assert.match(source, /test:authoring:mcp:local/u);
  assert.match(source, /Resolve-AraLearnDenoCommand/u);
  assert.match(source, /aralearn-authoring-api\.test\.ts/u);
  assert.match(source, /aralearn-authoring-mcp\.test\.ts/u);
  assert.match(source, /finally[\s\S]+SetEnvironmentVariable/u);
  assert.match(source, /if \(\$LASTEXITCODE -ne 0\)/u);
  assert.doesNotMatch(source, /--linked|db\s+reset|SUPABASE_DB_PASSWORD/u);
});

test("smoke hospedado usa o resolvedor administrativo sem enviar a chave como Bearer", () => {
  const source = fs.readFileSync(scripts.postgrestSmoke, "utf8");
  assert.match(source, /resolveSupabaseAdministrativeEnvironment/u);
  assert.match(source, /supabaseServerHeaders/u);
  assert.match(source, /\.\.\.process\.env/u);
  assert.doesNotMatch(source, /Authorization:\s*`Bearer \$\{serverApiKey\}`/u);
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

  assert.ok(report.checks.some(
    (entry) => entry.id === "repository.supabase-temp-ignore" && entry.status === "ok"
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

test("verificação aprova configuração e CSP válidas dentro do APK", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-safe-"));
  try {
    const apkPath = packApk(temporaryRoot, (publicRoot) => {
      writeSafeArtifact(publicRoot);
      fs.writeFileSync(
        path.join(publicRoot, "application.js"),
        "const documentedNames = ['ARALEARN_AUTHORING_INTEGRATION_SECRET', 'arl_...'];\n",
        "utf8"
      );
    });

    const result = runScript(scripts.verify, [
      "-ArtifactPath", apkPath,
      "-RequireRuntimeConfig",
      "-AsJson"
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(parseJsonOutput(result).valid, true);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("verificação reprova APK sem configuração pública", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-no-config-"));
  try {
    const apkPath = packApk(temporaryRoot, (publicRoot) => {
      writeSafeArtifact(publicRoot);
      fs.rmSync(path.join(publicRoot, "runtime-config.js"));
    });

    const result = runScript(scripts.verify, [
      "-ArtifactPath", apkPath,
      "-RequireRuntimeConfig",
      "-AsJson"
    ]);
    assert.notEqual(result.status, 0);
    assert.ok(parseJsonOutput(result).issues.some((issue) => issue.code === "config.missing"));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("verificação reprova configuração inválida e CSP divergente dentro do APK", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-bad-config-"));
  try {
    const apkPath = packApk(temporaryRoot, (publicRoot) => {
      writeSafeArtifact(publicRoot);
      fs.writeFileSync(
        path.join(publicRoot, "runtime-config.js"),
        `globalThis.__ARALEARN_ENV__ = ${JSON.stringify({
          supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
          supabasePublishableKey: "invalid-public-key",
          assistAllowedOrigins: []
        })};\n`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(publicRoot, "index.html"),
        "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"connect-src 'self' https://other-project.supabase.co;\">\n",
        "utf8"
      );
    });

    const result = runScript(scripts.verify, [
      "-ArtifactPath", apkPath,
      "-RequireRuntimeConfig",
      "-AsJson"
    ]);
    assert.notEqual(result.status, 0);
    const codes = new Set(parseJsonOutput(result).issues.map((issue) => issue.code));
    assert.ok(codes.has("config.publishable-key"));
    assert.ok(codes.has("csp.origin"));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("verificação bloqueia segredos de administração e autoria dentro do APK", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-secrets-"));
  try {
    const servicePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    const serviceToken = `eyJhbGciOiJIUzI1NiJ9.${servicePayload}.packaged-service-token`;
    const authoringKey = `arl_${"a".repeat(48)}`;
    const integrationSecret = `integration-${"b".repeat(48)}`;
    const receiptSecret = `receipt-${"c".repeat(48)}`;
    const apkPath = packApk(temporaryRoot, (publicRoot) => {
      writeSafeArtifact(publicRoot);
      fs.writeFileSync(
        path.join(publicRoot, "application.js"),
        [
          `const serverKey = "${serviceToken}";`,
          `const authoringKey = "${authoringKey}";`,
          `const environment = { "ARALEARN_AUTHORING_INTEGRATION_SECRET": "${integrationSecret}" };`,
          `ARALEARN_AUTHORING_RECEIPT_SECRET=${receiptSecret}`
        ].join("\n"),
        "utf8"
      );
    });

    const result = runScript(scripts.verify, [
      "-ArtifactPath", apkPath,
      "-RequireRuntimeConfig",
      "-AsJson"
    ]);
    assert.notEqual(result.status, 0);
    const report = parseJsonOutput(result);
    const codes = new Set(report.issues.map((issue) => issue.code));
    assert.ok(codes.has("secret.service-role-jwt"));
    assert.ok(codes.has("secret.authoring-api-key"));
    assert.ok(codes.has("secret.authoring-hmac"));
    assert.doesNotMatch(result.stdout, new RegExp(serviceToken.replaceAll(".", "\\.")));
    assert.doesNotMatch(result.stdout, new RegExp(authoringKey));
    assert.doesNotMatch(result.stdout, new RegExp(integrationSecret));
    assert.doesNotMatch(result.stdout, new RegExp(receiptSecret));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
