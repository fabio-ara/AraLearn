import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageManifest = JSON.parse(fs.readFileSync(
  path.join(repositoryRoot, "package.json"),
  "utf8"
));
const androidBuildScript = fs.readFileSync(
  path.join(repositoryRoot, "android", "app", "build.gradle.kts"),
  "utf8"
);
const currentAndroidVersionCode = androidBuildScript.match(/versionCode\s*=\s*(\d+)/u)?.[1];
const currentAndroidVersionName = androidBuildScript.match(/versionName\s*=\s*"([^"]+)"/u)?.[1];
const scripts = {
  androidWorkflow: path.join(repositoryRoot, ".github", "workflows", "android-release.yml"),
  diagnose: path.join(repositoryRoot, "scripts", "diagnoseDeployment.ps1"),
  plan: path.join(repositoryRoot, "scripts", "planDeployment.ps1"),
  postgrestSmoke: path.join(repositoryRoot, "supabase", "tests", "postgrest-smoke.mjs"),
  pagesWorkflow: path.join(repositoryRoot, ".github", "workflows", "pages.yml"),
  verify: path.join(repositoryRoot, "scripts", "verifyDeploymentArtifacts.ps1"),
  validate: path.join(repositoryRoot, "scripts", "validateDeployment.ps1"),
  validateLocalSupabase: path.join(repositoryRoot, "scripts", "validateLocalSupabase.ps1"),
  validationWorkflow: path.join(repositoryRoot, ".github", "workflows", "validacao.yml")
};
const publishableKey = `sb_publishable_${"A".repeat(24)}`;
const assistOrigins = [
  "https://api.deepseek.com",
  "https://api.openai.com",
  "https://generativelanguage.googleapis.com"
];
const requiredRuntimeModules = [
  "src/assist/cardAssistanceScope.js",
  "src/generation/engine/cardAuthoringSchema.js",
  "src/generation/providers/providerRegistry.js",
  "src/generation/providers/providerTransport.js",
  "src/generation/runtime/cardAssistanceConfig.js",
  "src/generation/runtime/cardAssistanceLaunchConfig.js",
  "src/generation/runtime/cardAssistanceRuntime.js",
  "src/generation/validation/cardAssistanceSemantics.js",
  "src/resources/kernel/packageRegistry.js",
  "src/resources/packages/index.js",
  "src/ui/AuthoringAssistantPanel.js",
  "src/ui/cardAssistanceUiState.js",
  "src/ui/OAuthAuthorizationConsent.js"
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
      ARALEARN_SUPABASE_URL: "",
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: "",
      ARALEARN_ASSIST_ALLOWED_ORIGINS: "",
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

function packApk(
  temporaryRoot,
  preparePublicRuntime,
  {
    fileName = "application.apk",
    authoringPackageText = "OAuth 2.1 com aralearn-authoring-mcp.\n"
  } = {}
) {
  const runtimeRoot = path.join(temporaryRoot, "payload", "assets", "www");
  const publicRoot = path.join(runtimeRoot, "public");
  fs.mkdirSync(publicRoot, { recursive: true });
  preparePublicRuntime(publicRoot);
  for (const relativePath of requiredRuntimeModules) {
    const destination = path.join(runtimeRoot, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, "export {};\n", "utf8");
  }
  const authoringRoot = path.join(publicRoot, "docs", "downloads", "authoring");
  fs.mkdirSync(authoringRoot, { recursive: true });
  for (const fileName of [
    "aralearn-chatgpt-system-prompt.md",
    "aralearn-chatgpt-knowledge-core.md",
    "aralearn-chatgpt-knowledge-resources.md",
    "aralearn-chatgpt-action-openapi.yaml"
  ]) {
    fs.writeFileSync(path.join(authoringRoot, fileName), "OAuth 2.1 com aralearn-authoring-mcp.\n", "utf8");
  }
  const packageSource = path.join(temporaryRoot, "authoring-package-source");
  fs.mkdirSync(packageSource, { recursive: true });
  fs.writeFileSync(path.join(packageSource, "SETUP.md"), authoringPackageText, "utf8");
  const packageZip = path.join(authoringRoot, "aralearn-authoring-chatgpt.zip");
  const packedAuthoring = spawnSync("pwsh", [
    "-NoProfile",
    "-Command",
    "& { param([string]$source, [string]$destination) Compress-Archive -Path (Join-Path $source '*') -DestinationPath $destination }",
    packageSource,
    packageZip
  ], { encoding: "utf8" });
  assert.equal(packedAuthoring.status, 0, packedAuthoring.stderr);
  const zipPath = path.join(temporaryRoot, "application.zip");
  const apkPath = path.join(temporaryRoot, fileName);
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

function writeAndroidToolMocks(temporaryRoot, {
  applicationId = "com.aralearn.app",
  versionCode = currentAndroidVersionCode,
  versionName = currentAndroidVersionName,
  certificate = "c3d2ad6c97e44492c09d785d2d5e9f461eb6399914b196119e2cba0e5d271296",
  signatureLine = `V2 Signer: certificate SHA-256 digest: ${certificate}`
} = {}) {
  const aaptPath = path.join(temporaryRoot, "aapt.cmd");
  const apksignerPath = path.join(temporaryRoot, "apksigner.cmd");
  fs.writeFileSync(
    aaptPath,
    `@echo off\r\necho package: name='${applicationId}' versionCode='${versionCode}' versionName='${versionName}'\r\n`,
    "utf8"
  );
  fs.writeFileSync(
    apksignerPath,
    `@echo off\r\necho ${signatureLine}\r\n`,
    "utf8"
  );
  return {
    ARALEARN_AAPT_PATH: aaptPath,
    ARALEARN_APKSIGNER_PATH: apksignerPath
  };
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
  assert.match(source, /aralearn-authoring-mcp\.test\.ts/u);
  assert.match(source, /deno\.json/u);
  assert.doesNotMatch(source, /\b(?:npm\.cmd|gradlew\.bat)[^\r\n]*;[^\r\n]*/u);
});

test("implantação publica somente MCP OAuth e entrega de revisões", () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "scripts", "deploySupabase.ps1"), "utf8");
  assert.match(source, /DeployAuthoringFunctions/u);
  assert.match(source, /functions deploy aralearn-authoring-mcp/u);
  assert.match(source, /functions deploy aralearn-course-revisions/u);
  assert.match(
    source,
    /functions list[\s\S]+--output json[\s\S]+functions delete \$FunctionName[\s\S]+--yes/u
  );
  assert.match(source, /-FunctionName 'aralearn-authoring-api'/u);
  assert.match(
    source,
    /secrets list[\s\S]+--output json[\s\S]+secrets unset \$SecretName[\s\S]+--yes/u
  );
  assert.match(source, /-SecretName 'ARALEARN_AUTHORING_INTEGRATION_SECRET'/u);
  assert.match(source, /function Resolve-AllowedOrigins/u);
  assert.match(source, /\$value -split ','/u);
  assert.match(source, /Select-Object -Unique/u);
  assert.match(source, /\$RequiredApplicationOrigins\s*=\s*@\([\s\S]+https:\/\/appassets\.androidplatform\.net[\s\S]+\)/u);
  assert.match(
    source,
    /@\(\$RequiredApplicationOrigins\)\s*\+\s*@\(\$AllowedOrigin\)/u
  );
  assert.match(source, /ARALEARN_COURSE_REVISIONS_ALLOWED_ORIGINS=\$origins/u);
  assert.doesNotMatch(source, /if \(\$AllowedOrigin\.Count -gt 0\)/u);
  assert.doesNotMatch(source, /--env-file|Set-Content|Out-File/u);
});

test("validação integrada do Supabase só aceita o stack local e restaura o ambiente", () => {
  const source = fs.readFileSync(scripts.validateLocalSupabase, "utf8");
  assert.match(source, /Assert-LocalProjectUrl/u);
  assert.match(source, /--local/u);
  assert.match(source, /auth-email-smoke\.mjs/u);
  assert.match(source, /test:authoring:mcp:local/u);
  assert.match(source, /Resolve-AraLearnDenoCommand/u);
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
      fs.writeFileSync(path.join(publicRoot, "application.js"), "const runtime = 'oauth-mcp';\n", "utf8");
    });

    const result = runScript(
      scripts.verify,
      ["-ArtifactPath", apkPath, "-RequireRuntimeConfig", "-AsJson"],
      writeAndroidToolMocks(temporaryRoot)
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(parseJsonOutput(result).valid, true);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("verificador exige APK e runtime atual nos destinos finais", () => {
  const source = fs.readFileSync(scripts.verify, "utf8");
  assert.match(source, /artifact\.apk-missing/u);
  assert.match(source, /artifact\.required-runtime/u);
  assert.match(source, /artifact\.required-authoring-asset/u);
  assert.match(source, /artifact\.static-authoring-api/u);
  assert.match(source, /app-release\.apk/u);
  assert.match(source, /package\.json/u);
  assert.match(source, /android\/app\/build\.gradle\.kts/u);
  assert.match(source, /packageManifest\.version/u);
  assert.doesNotMatch(source, /expectedAndroidVersionCode = '\d+'/u);
  assert.doesNotMatch(source, /expectedAndroidVersionName = '\d+\.\d+\.\d+'/u);
  assert.match(source, /expectedAndroidApplicationId = 'com\.aralearn\.app'/u);
  assert.match(source, /expectedAndroidCertificateSha256/u);
});

test("verificação aprova a identidade atual e as duas saídas conhecidas do apksigner", {
  skip: !powerShellAvailable
}, () => {
  for (const [label, signatureLine] of [
    ["atual", "V2 Signer: certificate SHA-256 digest: "],
    ["anterior", "Signer #1 certificate SHA-256 digest: "]
  ]) {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), `aralearn-apk-${label}-`));
    try {
      const apkPath = packApk(
        temporaryRoot,
        writeSafeArtifact,
        { fileName: "app-release.apk" }
      );
      const certificate = "c3d2ad6c97e44492c09d785d2d5e9f461eb6399914b196119e2cba0e5d271296";
      const result = runScript(
        scripts.verify,
        ["-ArtifactPath", apkPath, "-RequireRuntimeConfig", "-AsJson"],
        writeAndroidToolMocks(temporaryRoot, {
          certificate,
          signatureLine: `${signatureLine}${certificate}`
        })
      );
      assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
      assert.equal(parseJsonOutput(result).valid, true);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test("versões publicáveis permanecem alinhadas entre npm e Android", () => {
  const packageLock = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, "package-lock.json"),
    "utf8"
  ));
  assert.equal(currentAndroidVersionName, packageManifest.version);
  assert.equal(packageLock.version, packageManifest.version);
  assert.equal(packageLock.packages[""].version, packageManifest.version);
  assert.match(currentAndroidVersionCode, /^\d+$/u);
});

test("release Android aguarda a validação da main e usa exatamente o SHA aprovado", () => {
  const source = fs.readFileSync(scripts.androidWorkflow, "utf8");
  assert.match(source, /workflow_run:/u);
  assert.match(source, /workflows:\s*\n\s*- Validar repositório/u);
  assert.match(source, /workflow_run\.conclusion == 'success'/u);
  assert.match(source, /workflow_run\.event == 'push'/u);
  assert.match(source, /workflow_run\.head_sha/u);
  assert.match(source, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(source, /ref: \$\{\{ env\.ARALEARN_RELEASE_SHA \}\}/u);
  assert.equal(
    source.match(/git fetch origin \+refs\/heads\/main:refs\/remotes\/origin\/main --no-tags/gu)?.length,
    2
  );
  assert.match(source, /refs\/remotes\/origin\/main/u);
  assert.match(source, /steps\.freshness\.outputs\.current == 'true'/u);
  assert.match(source, /--target \$env:ARALEARN_RELEASE_SHA/u);
  assert.match(source, /verifyDeploymentArtifacts\.ps1/u);
  assert.doesNotMatch(source, /certificate SHA-256 digest/u);
  assert.doesNotMatch(source, /compatibilidade para materialização/u);
});

test("validação limpa e repete somente a inicialização local do Supabase", () => {
  const source = fs.readFileSync(scripts.validationWorkflow, "utf8");
  assert.match(source, /cancel-in-progress: true/u);
  assert.match(source, /supabase@2\.109\.1 stop --no-backup/u);
  assert.doesNotMatch(source, /supabase@2\.109\.1 stop --all/u);
  assert.match(source, /for attempt in 1 2 3/u);
  assert.match(source, /if npx --yes supabase@2\.109\.1 start/u);
  assert.match(source, /ss -ltnp '\( sport = :54322 \)'/u);
  assert.match(source, /sleep \$\(\(attempt \* 3\)\)/u);
});

test("Pages delega o retry transitório ao verificador testado", () => {
  const source = fs.readFileSync(scripts.pagesWorkflow, "utf8");
  assert.match(source, /node \.\/scripts\/verifyPublishedSite\.mjs --url/u);
  assert.doesNotMatch(source, /Start-Sleep|\$attempts/u);
});

test("verificação reprova identidade ou certificado incompatíveis com atualização in-place", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-release-wrong-"));
  try {
    const apkPath = packApk(
      temporaryRoot,
      writeSafeArtifact,
      { fileName: "app-release.apk" }
    );
    const result = runScript(
      scripts.verify,
      ["-ArtifactPath", apkPath, "-RequireRuntimeConfig", "-AsJson"],
      writeAndroidToolMocks(temporaryRoot, {
        applicationId: "com.example.other",
        versionCode: "145",
        versionName: "0.0.99",
        certificate: "0".repeat(64)
      })
    );
    assert.notEqual(result.status, 0);
    const codes = new Set(parseJsonOutput(result).issues.map((issue) => issue.code));
    assert.ok(codes.has("artifact.apk-application-id"));
    assert.ok(codes.has("artifact.apk-version-code"));
    assert.ok(codes.has("artifact.apk-version-name"));
    assert.ok(codes.has("artifact.apk-certificate"));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("verificação inspeciona pacote de autoria aninhado e bloqueia a API estática", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-static-api-"));
  try {
    const apkPath = packApk(
      temporaryRoot,
      writeSafeArtifact,
      {
        authoringPackageText:
          [
            "Use https://example.supabase.co/functions/v1/aralearn-authoring-api com X-AraLearn-API-Key.",
            "ARALEARN_AUTHORING_INTEGRATION_SECRET e authoring_api_clients são resíduos."
          ].join("\n")
      }
    );
    const result = runScript(
      scripts.verify,
      ["-ArtifactPath", apkPath, "-AsJson"],
      writeAndroidToolMocks(temporaryRoot)
    );
    assert.notEqual(result.status, 0);
    assert.ok(
      parseJsonOutput(result).issues.some((issue) => issue.code === "artifact.static-authoring-api")
    );
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

    const result = runScript(
      scripts.verify,
      ["-ArtifactPath", apkPath, "-RequireRuntimeConfig", "-AsJson"],
      writeAndroidToolMocks(temporaryRoot)
    );
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

    const result = runScript(
      scripts.verify,
      ["-ArtifactPath", apkPath, "-RequireRuntimeConfig", "-AsJson"],
      writeAndroidToolMocks(temporaryRoot)
    );
    assert.notEqual(result.status, 0);
    const codes = new Set(parseJsonOutput(result).issues.map((issue) => issue.code));
    assert.ok(codes.has("config.publishable-key"));
    assert.ok(codes.has("csp.origin"));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("verificação bloqueia segredos administrativos dentro do APK", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-secrets-"));
  try {
    const servicePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    const serviceToken = `eyJhbGciOiJIUzI1NiJ9.${servicePayload}.packaged-service-token`;
    const apkPath = packApk(temporaryRoot, (publicRoot) => {
      writeSafeArtifact(publicRoot);
      fs.writeFileSync(
        path.join(publicRoot, "application.js"),
        `const serverKey = "${serviceToken}";`,
        "utf8"
      );
    });

    const result = runScript(
      scripts.verify,
      ["-ArtifactPath", apkPath, "-RequireRuntimeConfig", "-AsJson"],
      writeAndroidToolMocks(temporaryRoot)
    );
    assert.notEqual(result.status, 0);
    const report = parseJsonOutput(result);
    const codes = new Set(report.issues.map((issue) => issue.code));
    assert.ok(codes.has("secret.service-role-jwt"));
    assert.doesNotMatch(result.stdout, new RegExp(serviceToken.replaceAll(".", "\\.")));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
