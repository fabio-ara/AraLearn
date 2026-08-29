import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DEFAULT_ASSIST_ALLOWED_ORIGINS } from "../../src/assist/providerRuntimeSecurity.js";

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
  androidActivity: path.join(
    repositoryRoot,
    "android", "app", "src", "main", "java", "com", "aralearn", "app", "MainActivity.java"
  ),
  androidManifest: path.join(
    repositoryRoot,
    "android", "app", "src", "main", "AndroidManifest.xml"
  ),
  androidStrings: path.join(
    repositoryRoot,
    "android", "app", "src", "main", "res", "values", "strings.xml"
  ),
  androidWorkflow: path.join(repositoryRoot, ".github", "workflows", "android-release.yml"),
  authoringMcpHostedSmoke: path.join(
    repositoryRoot,
    "supabase",
    "tests",
    "authoring-mcp-hosted-smoke.mjs"
  ),
  authoringMcpLocalSmoke: path.join(
    repositoryRoot,
    "supabase",
    "tests",
    "authoring-mcp-local-smoke.mjs"
  ),
  hostedConversationalSourceSmoke: path.join(
    repositoryRoot,
    "scripts",
    "runHostedConversationalSourceSmoke.mjs"
  ),
  diagnose: path.join(repositoryRoot, "scripts", "diagnoseDeployment.ps1"),
  plan: path.join(repositoryRoot, "scripts", "planDeployment.ps1"),
  courseRuntimeSmoke: path.join(
    repositoryRoot,
    "supabase",
    "tests",
    "course-runtime-local-smoke.mjs"
  ),
  courseRuntimeValidator: path.join(repositoryRoot, "scripts", "validateCourseRuntime.mjs"),
  coursePostgresConcurrency: path.join(
    repositoryRoot,
    "tests", "runtime", "course-postgres-concurrency.test.js"
  ),
  pagesWorkflow: path.join(repositoryRoot, ".github", "workflows", "pages.yml"),
  verify: path.join(repositoryRoot, "scripts", "verifyDeploymentArtifacts.ps1"),
  validate: path.join(repositoryRoot, "scripts", "validateDeployment.ps1"),
  validateLocalSupabase: path.join(repositoryRoot, "scripts", "validateLocalSupabase.ps1"),
  validationWorkflow: path.join(repositoryRoot, ".github", "workflows", "validacao.yml")
};
const publishableKey = `sb_publishable_${"A".repeat(24)}`;
const requiredRuntimeModules = [
  "src/persistence/AuthSessionStore.js",
  "src/persistence/CourseLocalStore.js",
  "src/resources/kernel/packageRegistry.js",
  "src/resources/packages/index.js",
  "src/study/CourseStudyApplication.js",
  "src/study/CourseStudyBridge.js",
  "src/study/CourseStudyRepository.js",
  "src/study/CourseStudyScreen.js",
  "src/supabase/CourseApiClient.js",
  "src/supabase/CourseController.js",
  "src/ui/CourseAuthoringSurface.js",
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
      ...environment
    }
  });
}

function parseJsonOutput(result) {
  assert.doesNotThrow(() => JSON.parse(result.stdout), result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function writeSafeArtifact(root, { nativeAssistBridge = false } = {}) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "runtime-config.js"),
    `globalThis.__ARALEARN_ENV__ = ${JSON.stringify({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      supabasePublishableKey: publishableKey,
      assistAllowedOrigins: DEFAULT_ASSIST_ALLOWED_ORIGINS,
      ...(nativeAssistBridge ? { nativeAssistBridge: true } : {})
    })};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "index.html"),
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="connect-src 'self' https://abcdefghijklmnopqrst.supabase.co ${DEFAULT_ASSIST_ALLOWED_ORIGINS.join(" ")};">\n`,
    "utf8"
  );
}

function writeSafeAndroidArtifact(root) {
  writeSafeArtifact(root);
}

function packApk(
  temporaryRoot,
  preparePublicRuntime,
  {
    fileName = "application.apk",
    legacySurfaceText = ""
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
  if (legacySurfaceText) {
    fs.writeFileSync(path.join(publicRoot, "legacy-surface.js"), legacySurfaceText, "utf8");
  }
  const zipPath = path.join(temporaryRoot, "application.zip");
  const apkPath = path.join(temporaryRoot, fileName);
  const compressed = process.platform === "win32"
    ? spawnSync("tar", ["-a", "-c", "-f", zipPath, "assets"], {
      cwd: path.join(temporaryRoot, "payload"),
      encoding: "utf8"
    })
    : spawnSync("pwsh", [
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

test("a suíte de concorrência recusa banco hospedado antes de executar SQL", () => {
  const source = fs.readFileSync(scripts.coursePostgresConcurrency, "utf8");
  assert.match(source, /const postgresGate =[^;]*!localDatabase/su);
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    "--test",
    "--test-reporter=tap",
    scripts.coursePostgresConcurrency
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...childEnvironment,
      ARALEARN_TEST_DATABASE_URL:
        "postgresql://postgres:segredo@db.abcdefghijklmnopqrst.supabase.co:5432/postgres"
    }
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /# SKIP[^\r\n]*PostgreSQL local/iu);
  const testCount = Number(output.match(/^# tests (\d+)$/mu)?.[1]);
  const skippedCount = Number(output.match(/^# skipped (\d+)$/mu)?.[1]);
  assert.ok(testCount > 0, output);
  assert.equal(skippedCount, testCount, output);
  assert.doesNotMatch(output, /^not ok\b/imu);
});

test("planos de implantação cobrem somente os três perfis suportados", {
  skip: !powerShellAvailable
}, () => {
  const expectedSteps = {
    GitHubPagesManagedSupabase: [
      "github-variables", "verify-artifact", "integrate-main", "verify-hosted",
      "publish", "verify-published"
    ],
    StaticHostManagedSupabase: ["build", "verify-artifact", "upload", "verify-published"],
    LocalDevelopment: ["start-supabase", "reset-local", "stop"]
  };
  const plansByProfile = new Map();

  for (const [profile, stepIds] of Object.entries(expectedSteps)) {
    const result = runScript(scripts.plan, ["-Profile", profile, "-AsJson"]);
    assert.equal(result.status, 0, result.stderr);
    const plan = parseJsonOutput(result);
    plansByProfile.set(profile, plan);
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
  for (const parsedPlan of [
    plansByProfile.get("GitHubPagesManagedSupabase"),
    plansByProfile.get("StaticHostManagedSupabase"),
  ]) {
    const diagnose = parsedPlan.steps.find(({ id }) => id === "diagnose");
    const apply = parsedPlan.steps.find(({ id }) => id === "database-apply");
    assert.match(diagnose.command, /-Authoring/u);
    assert.match(apply.command, /-Mode Apply/u);
    assert.match(apply.command, /-DeployAuthoringFunctions/u);
    assert.match(apply.command, /-PublicAppUrl https:\/\//u);
  }

  const githubPlan = plansByProfile.get("GitHubPagesManagedSupabase");
  const githubStepIds = githubPlan.steps.map(({ id }) => id);
  const position = (id) => githubStepIds.indexOf(id);
  assert.ok(position("validate") < position("integrate-main"));
  assert.ok(position("integrate-main") < position("database-apply"));
  assert.ok(position("database-apply") < position("verify-hosted"));
  assert.ok(position("verify-hosted") < position("publish"));
  assert.ok(position("publish") < position("verify-published"));

  const githubAndroidPlan = parseJsonOutput(runScript(scripts.plan, [
    "-Profile", "GitHubPagesManagedSupabase", "-IncludeAndroid", "-AsJson"
  ]));
  const githubAndroidStepIds = githubAndroidPlan.steps.map(({ id }) => id);
  assert.ok(
    githubAndroidStepIds.indexOf("android-verify") <
      githubAndroidStepIds.indexOf("integrate-main")
  );
});

test("executor de implantação verifica cada comando nativo antes de avançar", () => {
  const source = fs.readFileSync(scripts.validate, "utf8");
  assert.match(source, /if \(\$LASTEXITCODE -ne 0\)/u);
  assert.match(source, /As etapas seguintes não foram executadas/u);
  assert.match(source, /Resolve-AraLearnDenoCommand/u);
  assert.match(source, /aralearn-authoring-mcp\.test\.ts/u);
  assert.match(source, /aralearn-authoring-action\/index\.ts/u);
  assert.match(source, /deno\.json/u);
  assert.doesNotMatch(source, /\b(?:npm\.cmd|gradlew\.bat)[^\r\n]*;[^\r\n]*/u);
});

test("implantação publica MCP OAuth, API de Curso e Actions sob os gates do contrato", () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "scripts", "deploySupabase.ps1"), "utf8");
  assert.match(source, /DeployAuthoringFunctions/u);
  assert.match(source, /functions deploy aralearn-authoring-mcp/u);
  assert.match(source, /functions deploy aralearn-course-api/u);
  assert.match(source, /functions deploy aralearn-authoring-action/u);
  assert.match(source, /verifyAuthoringProtocolSnapshotHistory\.mjs/u);
  assert.match(source, /buildChatGptActionOpenApi\.mjs --check/u);
  assert.match(source, /authoring-protocol-compatibility\.test\.js/u);
  assert.match(source, /chatgpt-action-schema-projection\.test\.js/u);
  assert.match(source, /course-authoring-contract-runtime\.test\.js/u);
  assert.doesNotMatch(source, /functions deploy aralearn-course-revisions/u);
  assert.doesNotMatch(source, /functions delete|Remove-AraLearnSupabaseFunctionIfPresent/u);
  assert.match(source, /funções da versão publicada foram preservadas/u);
  assert.match(source, /function Resolve-AllowedOrigins/u);
  assert.match(source, /\$lintOutput = @\(& npx\.cmd[^\r\n]+db lint[^\r\n]+2>&1\)/u);
  assert.match(source, /\$lintExitCode = \[int\]\$LASTEXITCODE/u);
  assert.match(source, /\$value -split ','/u);
  assert.match(source, /Select-Object -Unique/u);
  assert.match(source, /\$RequiredApplicationOrigins\s*=\s*@\([\s\S]+https:\/\/appassets\.androidplatform\.net[\s\S]+\)/u);
  assert.match(
    source,
    /@\(\$RequiredApplicationOrigins\)\s*\+\s*@\(\$AllowedOrigin\)/u
  );
  assert.match(source, /ARALEARN_COURSE_API_ALLOWED_ORIGINS=\$origins/u);
  assert.match(source, /ARALEARN_AUTHORING_ACTION_ALLOWED_ORIGINS=\$actionOrigins/u);
  assert.match(source, /runHostedMcpOAuthSmoke\.mjs/u);
  assert.match(source, /Invoke-WebRequest[\s\S]+aralearn-course-api\/app\/listarCursos/u);
  assert.match(source, /Invoke-WebRequest[\s\S]+aralearn-authoring-action\/listarCursos/u);
  assert.match(source, /X-AraLearn-Authoring-Contract/u);
  assert.match(source, /Access-Control-Allow-Origin/u);
  assert.doesNotMatch(source, /ARALEARN_AUTHORING_ALLOWED_ORIGINS=/u);
  assert.doesNotMatch(source, /secrets unset/u);
  assert.match(source, /runHostedCourseSourcePdfSmoke\.mjs/u);
  assert.match(source, /runHostedConversationalSourceSmoke\.mjs/u);
  assert.ok(
    source.indexOf("buildChatGptActionOpenApi.mjs --check") <
      source.indexOf("chatgpt-action-schema-projection.test.js") &&
    source.indexOf("chatgpt-action-schema-projection.test.js") <
      source.indexOf("functions deploy aralearn-authoring-mcp") &&
    source.indexOf("ARALEARN_AUTHORING_MCP_ALLOWED_ORIGINS=$origins") <
      source.indexOf("functions deploy aralearn-authoring-mcp") &&
    source.indexOf("functions deploy aralearn-authoring-mcp") <
      source.indexOf("functions deploy aralearn-course-api") &&
    source.indexOf("functions deploy aralearn-course-api") <
      source.indexOf("functions deploy aralearn-authoring-action") &&
    source.indexOf("functions deploy aralearn-authoring-action") <
      source.indexOf("X-AraLearn-Authoring-Contract") &&
    source.indexOf("X-AraLearn-Authoring-Contract") <
      source.indexOf("runHostedMcpOAuthSmoke.mjs") &&
    source.indexOf("runHostedMcpOAuthSmoke.mjs") <
      source.indexOf("runHostedCourseSourcePdfSmoke.mjs") &&
    source.indexOf("runHostedCourseSourcePdfSmoke.mjs") <
      source.indexOf("runHostedConversationalSourceSmoke.mjs")
  );
  assert.doesNotMatch(source, /if \(\$AllowedOrigin\.Count -gt 0\)/u);
  assert.doesNotMatch(source, /--env-file|Set-Content|Out-File/u);
});

test("smoke hospedado focal retoma somente o Curso sintético e limpa seus resíduos", () => {
  const source = fs.readFileSync(scripts.hostedConversationalSourceSmoke, "utf8");
  assert.match(source, /provisionHostedMcpOAuthToken/u);
  assert.match(source, /refreshLocalMcpOAuthToken/u);
  assert.match(source, /"listarCursos"/u);
  assert.match(source, /ingerirPdfDaFonte/u);
  assert.match(source, /type:\s*"save_anchor"/u);
  assert.match(source, /view:\s*"course_sources"/u);
  assert.match(source, /view:\s*"course_source_attachment"/u);
  assert.match(source, /assertHostedHumanProjection/u);
  assert.match(source, /cleanupHostedCourseSourcePdfFixture/u);
  assert.match(source, /cleanupLocalMcpOAuthProvision/u);
  assert.doesNotMatch(source, /Dataprev/iu);
});

test("scripts focais de MCP e Actions incluem o contrato público comum", () => {
  const contract = packageManifest.scripts["test:authoring:contract"];
  assert.match(packageManifest.scripts["authoring:contract:history"], /verifyAuthoringProtocolSnapshotHistory\.mjs/u);
  assert.match(contract, /^npm run authoring:contract:history &&/u);
  assert.match(contract, /authoring-protocol-snapshot-history\.test\.js/u);
  assert.match(contract, /authoring-protocol-compatibility\.test\.js/u);
  assert.match(contract, /chatgpt-action-schema-projection\.test\.js/u);
  assert.match(contract, /course-authoring-contract-runtime\.test\.js/u);
  assert.match(packageManifest.scripts["test:authoring:mcp"], /^npm run test:authoring:contract &&/u);
  assert.match(packageManifest.scripts["test:authoring:actions"], /^npm run test:authoring:contract &&/u);
});

test("validação integrada do Supabase só aceita o stack local e restaura o ambiente", () => {
  const source = fs.readFileSync(scripts.validateLocalSupabase, "utf8");
  assert.match(source, /Assert-LocalProjectUrl/u);
  assert.match(source, /--local/u);
  assert.match(source, /auth-email-smoke\.mjs/u);
  assert.match(source, /test:authoring:mcp:local/u);
  assert.match(source, /aralearn-course-api/u);
  assert.match(source, /test:supabase:smoke/u);
  assert.match(source, /Resolve-AraLearnDenoCommand/u);
  assert.match(source, /aralearn-authoring-mcp\.test\.ts/u);
  assert.match(source, /supabase@2\.115\.0', 'test', 'db'/u);
  assert.match(source, /finally[\s\S]+SetEnvironmentVariable/u);
  assert.match(source, /if \(\$LASTEXITCODE -ne 0\)/u);
  assert.doesNotMatch(
    source,
    /--linked|db\s+reset|SUPABASE_DB_PASSWORD|publishCatalogFixtures/u
  );
});

test("CI só considera a API de Cursos pronta depois de alcançar seu handler", () => {
  const source = fs.readFileSync(scripts.validationWorkflow, "utf8");
  const readiness = source.slice(
    source.indexOf("COURSE_API_URL="),
    source.indexOf("npm run test:supabase:smoke")
  );
  assert.match(
    readiness,
    /COURSE_API_RUNTIME_READY=false[\s\S]+Serving functions on http:\/\/127\.0\.0\.1:54321\/functions\/v1\/<function-name>[\s\S]+COURSE_API_RUNTIME_READY=true/u
  );
  assert.match(
    readiness,
    /if \[ "\$COURSE_API_RUNTIME_READY" = true \]; then[\s\S]+--request GET/u
  );
  assert.match(
    readiness,
    /if \[ "\$COURSE_API_RUNTIME_READY" != true \]; then[\s\S]+exit 1/u
  );
  assert.match(readiness, /--request GET/u);
  assert.match(readiness, /\[ "\$status_code" = 405 \]/u);
  assert.match(readiness, /"code":"method_not_allowed"/u);
  assert.match(readiness, /content-type: application\/json; charset=utf-8/u);
  assert.doesNotMatch(readiness, /--request OPTIONS|Access-Control-Request-Method/u);
});

test("smoke real de Curso cobre proveniência redigida sem enviar a chave como Bearer", () => {
  const source = fs.readFileSync(scripts.courseRuntimeSmoke, "utf8");
  assert.match(source, /resolveSupabaseAdministrativeEnvironment/u);
  assert.match(source, /supabaseServerHeaders/u);
  assert.match(source, /\.\.\.process\.env/u);
  assert.match(source, /aralearn-course-api/u);
  assert.match(source, /aralearn\.course\.v1/u);
  assert.match(source, /studyUnits/u);
  assert.match(source, /entityType\s*\}\)\s*=>\s*entityType === "study_unit"/u);
  assert.match(source, /view:\s*"study_units"/u);
  assert.match(source, /aralearn\.course-study-unit-inspection-page\.v2/u);
  assert.match(source, /view:\s*"course_design"/u);
  assert.match(source, /operation:\s*"update_course_design"/u);
  assert.match(source, /aralearn\.course-design\.v1/u);
  assert.match(source, /type:\s*"set_target_plan_items"/u);
  assert.match(source, /kind:\s*"didactic_microsequence_materialization"/u);
  assert.match(source, /designApplication/u);
  assert.match(source, /sourceAttributionApplication/u);
  assert.match(source, /sourceAttributionApplications/u);
  assert.match(source, /aralearn\.course-design-context\.v2/u);
  assert.match(source, /aralearn\.course-source-attribution-application\.v1/u);
  assert.match(source, /view:\s*"course_sources"/u);
  assert.match(source, /operation:\s*"update_course_sources"/u);
  assert.match(source, /type:\s*"save_source"/u);
  assert.match(source, /type:\s*"save_anchor"/u);
  assert.match(source, /type:\s*"set_target_sources"/u);
  assert.match(source, /verificationExcerpt/u);
  assert.match(source, /get_course_study_citations_v1/u);
  assert.match(
    source,
    /get_course_study_citations_v1"[\s\S]{0,180}p_expected_revision:\s*17/u
  );
  assert.match(source, /aralearn\.course-study-citations\.v1/u);
  assert.match(source, /staleRemovedStudyUnitCitations[\s\S]+code,\s*"40001"/u);
  assert.match(source, /revokedCitations[\s\S]+status,[\s\S]+404[\s\S]+"PT404"/u);
  assert.match(source, /rejectedSourceAttribution/u);
  assert.match(source, /afterRejectedSourceAttribution\.data\.courseRevision/u);
  assert.match(source, /verificationExcerpt\|studyVisibility\|actorId\|channel\|history\|excerpt/u);
  assert.match(source, /unassignedAnalysisUnitId/u);
  assert.match(source, /steps\[0\]\.status,\s*"pending"/u);
  assert.match(source, /list_courses_v1/u);
  assert.match(source, /list_owned_courses_v1/u);
  assert.match(source, /mutate_course_personal_state_v2/u);
  assert.match(source, /aralearn\.course-personal-state\.v2/u);
  assert.doesNotMatch(source, /(?:load|mutate)_course_personal_state_v1/u);
  assert.match(source, /execute_my_course_anchored_annotation_command_v1/u);
  assert.match(source, /view:\s*"anchored_annotations"/u);
  assert.match(source, /provenance\.channel,\s*"authoring_interface"/u);
  assert.match(source, /contributor\.kind,\s*"protected_person"/u);
  assert.match(source, /foreignAnnotationProbes/u);
  assert.match(source, /course_anchored_annotation_not_found/u);
  assert.match(source, /view:\s*"audit_cycle"/u);
  assert.match(source, /operation:\s*"update_audit_cycle"/u);
  assert.match(source, /mode:\s*"runs"/u);
  assert.match(source, /cleanAuditSummary\.findingsCreated,\s*0/u);
  assert.match(source, /runDetail\.target\.path/u);
  assert.match(source, /aralearn\.course-audit-cycle-page\.v1/u);
  assert.match(source, /aralearn\.course-audit-context\.v1/u);
  for (const command of [
    "record_audit",
    "propose_authoring_correction",
    "reject_authoring_correction",
    "apply_authoring_correction",
    "verify_finding",
    "rollback_authoring_correction"
  ]) {
    assert.match(source, new RegExp(`type:\\s*"${command}"`, "u"));
  }
  assert.match(source, /suggestedAnnotationActions/u);
  assert.match(source, /type:\s*"resolve_anchored_annotation"/u);
  assert.match(source, /type:\s*"reopen_anchored_annotation"/u);
  assert.match(source, /sourceLinks:\s*\[sourceLink\]/u);
  assert.match(source, /checkpoint\.before\.content\.topics/u);
  assert.match(source, /replayedEditorialApplication\.idempotent,\s*true/u);
  assert.match(source, /replayedFactualRollback\.idempotent,\s*true/u);
  assert.match(source, /staleEditorialApplication[\s\S]+stale_course_state/u);
  assert.match(source, /staleFactualRollback[\s\S]+stale_course_state/u);
  assert.doesNotMatch(source, /aralearn\.library\.v1/u);
  assert.doesNotMatch(source, /\bcards\s*:/u);
  assert.doesNotMatch(source, /\bsources\s*:/u);
  assert.doesNotMatch(source, /Authorization:\s*`Bearer \$\{serverApiKey\}`/u);
});

test("validator canônico cerca RPCs e observações pessoais removidos", () => {
  const source = fs.readFileSync(scripts.courseRuntimeValidator, "utf8");
  for (const removed of [
    "load_course_personal_state_v1",
    "mutate_course_personal_state_v1",
    "saveCommentForPath",
    "deleteCommentForPath",
    "loadCommentForPath"
  ]) {
    assert.match(source, new RegExp(removed, "u"));
  }
  assert.match(source, /LEGACY_PERSONAL_OBSERVATIONS_ACCESS/u);
  assert.match(source, /legacyPersonalObservationsStayInHandoffConverter/u);
  assert.match(source, /accesses\.length === 2/u);
  assert.match(source, /src\/ui\/CourseObservationsPanel\.js/u);
  assert.match(source, /src\/ui\/renderStudyUnitObservationSheet\.js/u);
  const manifest = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, "supabase", "runtime-manifest.json"),
    "utf8"
  ));
  assert.equal(manifest.schemaRevision, "20260829043629");
  assert.equal(manifest.requiredFeatures.includes("continuous-authoring-inspection-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("contextual-study-unit-edit-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("personal-course-copy-edit-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("current-data-lifecycle-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("isolated-mcp-oauth-principal-v1"), true);
  assert.equal(
    manifest.requiredFeatures.includes("authenticated-course-source-pdf-upload-v1"),
    true
  );
  assert.equal(manifest.requiredFeatures.includes("course-source-pdf-ingestion-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("course-personal-state-v1"), false);
  assert.equal(manifest.requiredFeatures.includes("course-personal-state-v2"), true);
  assert.equal(manifest.requiredFeatures.includes("course-audit-cycle-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("course-authoring-corrections-v1"), true);
  assert.equal(
    manifest.requiredFeatures.includes("course-authoring-part-materialization-history-v1"),
    true
  );
  assert.equal(manifest.requiredFeatures.includes("course-audit-annotation-links-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("course-variant-comparisons-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("course-variant-comparison-list-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("course-source-pdf-attachments-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("course-source-human-locators-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("course-authoring-analytics-v1"), true);
  assert.equal(manifest.requiredFeatures.includes("course-variant-factual-comparison-v1"), true);
});

test("smokes MCP exercitam proveniência, Observações e auditoria pelo contrato de seis tools", () => {
  for (const smokePath of [scripts.authoringMcpLocalSmoke, scripts.authoringMcpHostedSmoke]) {
    const source = fs.readFileSync(smokePath, "utf8");
    for (const toolName of [
      "listarCursos",
      "lerCurso",
      "criarCurso",
      "alterarCurso",
      "incorporarPdfComoFonte",
      "consultarComponentesDidaticos"
    ]) {
      assert.match(source, new RegExp(`"${toolName}"`, "u"));
    }
    assert.doesNotMatch(source, /auditarCurso|corrigirCurso|verificarCurso/u);
    assert.match(source, /aralearn\.course\.v1/u);
    assert.match(source, /studyUnits/u);
    assert.match(source, /entityType\s*\}\)\s*=>\s*entityType === "study_unit"/u);
    assert.match(source, /view:\s*"study_units"/u);
    assert.match(source, /aralearn\.course-study-unit-inspection-page\.v2/u);
    assert.match(source, /view:\s*"course_design"/u);
    assert.match(source, /operation:\s*"update_course_design"/u);
    assert.match(source, /aralearn\.course-design\.v1/u);
    assert.match(source, /type:\s*"set_target_plan_items"/u);
    assert.match(source, /targetPlanItems/u);
    assert.match(source, /view:\s*"course_sources"/u);
    assert.match(source, /operation:\s*"update_course_sources"/u);
    assert.match(source, /type:\s*"save_source"/u);
    assert.match(source, /type:\s*"save_anchor"/u);
    assert.match(source, /type:\s*"set_target_sources"/u);
    assert.match(source, /sourceAttributionApplications/u);
    assert.match(source, /rejectedTool/u);
    assert.match(source, /rejectedAttribution/u);
    assert.match(source, /afterRejectedAttribution\.courseRevision/u);
    assert.match(source, /targetVersion,\s*2/u);
    assert.match(source, /view:\s*"anchored_annotations"/u);
    assert.match(source, /operation:\s*"update_anchored_annotations"/u);
    assert.match(source, /type:\s*"create_anchored_annotation"/u);
    assert.match(source, /anchored_annotation_confirmation_required/u);
    assert.match(source, /provenance\.channel,\s*"authoring_chat"/u);
    assert.match(source, /aralearn\.mcp-anchored-annotation-page\.v1/u);
    assert.match(source, /includeObservationText:\s*true/u);
    assert.match(source, /contributor,\s*"label"/u);
    assert.match(source, /replayedAnnotation\.idempotent,\s*true/u);
    assert.match(source, /view:\s*"audit_cycle"/u);
    assert.match(source, /operation:\s*"update_audit_cycle"/u);
    assert.match(source, /mode:\s*"runs"/u);
    assert.match(source, /runDetail\.target\.path/u);
    assert.match(source, /aralearn\.course-audit-cycle-page\.v1/u);
    assert.match(source, /aralearn\.course-audit-context\.v1/u);
    assert.match(source, /type:\s*"record_audit"/u);
    assert.match(source, /type:\s*"propose_authoring_correction"/u);
    assert.match(source, /type:\s*"apply_authoring_correction"/u);
    assert.match(source, /type:\s*"rollback_authoring_correction"/u);
    assert.match(source, /confirmed:\s*false/u);
    assert.match(source, /confirmed:\s*true/u);
    assert.match(source, /authoring_correction_confirmation_required/u);
    assert.match(source, /checkpoint\.before\.content\.topics/u);
    assert.match(source, /checkpoint\.before\.sourceLinks/u);
    assert.doesNotMatch(source, /aralearn\.library\.v1/u);
    assert.doesNotMatch(source, /\bcards\s*:/u);
    assert.doesNotMatch(source, /\bsources\s*:/u);
    assert.doesNotMatch(
      source,
      /criarWorkspaceDeAutoria|salvarCardsNaMicrossequencia|listarCardsDaMicrossequencia/u
    );
  }
});

test("diagnóstico valida configuração pública sem revelar seu valor", {
  skip: !powerShellAvailable
}, () => {
  const diagnoseSource = fs.readFileSync(scripts.diagnose, "utf8");
  assert.match(diagnoseSource, /npx\.cmd --yes supabase@2\.115\.0 --version/u);
  assert.match(diagnoseSource, /-match '2\\\.115\\\.0'/u);

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

test("montagem publicável usa providers oficiais sem relay nem ponte nativa", () => {
  const stageSource = fs.readFileSync(path.join(repositoryRoot, "scripts/stageWebRuntime.mjs"), "utf8");
  const publicRuntime = fs.readFileSync(path.join(repositoryRoot, "public/runtime-config.js"), "utf8");
  assert.doesNotMatch(`${stageSource}\n${publicRuntime}`, /nativeAssistBridge|127\.0\.0\.1:4183|10\.0\.2\.2:4183/u);
  assert.match(`${stageSource}\n${publicRuntime}`, /api\.openai\.com/u);
  assert.match(`${stageSource}\n${publicRuntime}`, /generativelanguage\.googleapis\.com/u);
  assert.match(`${stageSource}\n${publicRuntime}`, /api\.deepseek\.com/u);
});

test("verificação bloqueia segredo, catálogo embarcado e CSP ampla sem imprimir a chave", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-artifact-unsafe-"));
  try {
    writeSafeArtifact(temporaryRoot);
    const servicePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    const serviceToken = `eyJhbGciOiJIUzI1NiJ9.${servicePayload}.signature-not-a-secret`;
    const providerToken = `sk-proj-${"A".repeat(40)}`;
    fs.writeFileSync(path.join(temporaryRoot, "application.js"), `const credential = "${serviceToken}";`, "utf8");
    fs.writeFileSync(path.join(temporaryRoot, "provider.js"), `const credential = "${providerToken}";`, "utf8");
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
    assert.ok(codes.has("secret.language-provider"));
    assert.ok(codes.has("artifact.catalog"));
    assert.ok(codes.has("csp.wildcard"));
    assert.doesNotMatch(result.stdout, new RegExp(serviceToken.replaceAll(".", "\\.")));
    assert.doesNotMatch(result.stdout, new RegExp(providerToken));
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
  skip: !powerShellAvailable,
  todo: "oráculo pós-auditoria preparado antes da implementação"
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
  skip: !powerShellAvailable,
  todo: "oráculo pós-auditoria preparado antes da implementação"
}, () => {
  for (const [label, signatureLine] of [
    ["atual", "V2 Signer: certificate SHA-256 digest: "],
    ["anterior", "Signer #1 certificate SHA-256 digest: "]
  ]) {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), `aralearn-apk-${label}-`));
    try {
      const apkPath = packApk(
        temporaryRoot,
        writeSafeAndroidArtifact,
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

test("release Android parte do push de versão em main e usa exatamente seu SHA", () => {
  const source = fs.readFileSync(scripts.androidWorkflow, "utf8");
  const triggers = source.slice(source.indexOf("on:"), source.indexOf("permissions:"));
  const jobEnvironment = source.slice(
    source.indexOf("    env:"),
    source.indexOf("    steps:")
  );
  assert.match(triggers, /push:\s*\n\s*branches:\s*\n\s*- main/u);
  assert.match(triggers, /paths:\s*\n\s*- package\.json\s*\n\s*- android\/app\/build\.gradle\.kts/u);
  assert.doesNotMatch(source, /workflow_run:|Validar repositório/u);
  assert.match(source, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(source, /permissions:\s*\n\s*contents: write/u);
  assert.match(source, /ref: \$\{\{ env\.ARALEARN_RELEASE_SHA \}\}/u);
  assert.match(source, /ARALEARN_RELEASE_SHA: \$\{\{ github\.sha \}\}/u);
  assert.match(source, /persist-credentials: false/u);
  assert.doesNotMatch(jobEnvironment, /GH_TOKEN|ARALEARN_ANDROID_KEYSTORE_/u);
  assert.equal(
    source.match(/git fetch origin \+refs\/heads\/main:refs\/remotes\/origin\/main --no-tags/gu)?.length,
    2
  );
  assert.match(source, /refs\/remotes\/origin\/main/u);
  assert.match(source, /steps\.freshness\.outputs\.current == 'true'/u);
  assert.doesNotMatch(source, /actions\/workflows\/validacao\.yml|Confirmar validação da revisão/u);
  assert.match(source, /--target \$env:ARALEARN_RELEASE_SHA/u);
  assert.match(source, /verifyDeploymentArtifacts\.ps1/u);
  assert.match(source, /git ls-remote --tags origin \$tagRef/u);
  assert.match(source, /releases\/tags[\s\S]+Invoke-RestMethod/u);
  assert.match(source, /\$statusCode -ne 404/u);
  assert.match(source, /\$tagExists -xor \$releaseExists/u);
  assert.match(source, /\$remoteTagSha -cne \$env:ARALEARN_RELEASE_SHA/u);
  assert.match(source, /\[bool\]\$release\.draft/u);
  assert.match(source, /\[bool\]\$release\.prerelease/u);
  assert.match(source, /AraLearn-\$version\.apk/u);
  assert.match(source, /\[int64\]\$asset\[0\]\.size -le 0/u);
  assert.match(source, /\[string\]\$asset\[0\]\.state -cne 'uploaded'/u);
  assert.match(source, /gh release download[\s\S]+--pattern \$asset/u);
  assert.ok(
    source.lastIndexOf("gh release download") <
      source.lastIndexOf("verifyDeploymentArtifacts.ps1")
  );
  assert.match(source, /npm run deployment:verify-hosted/u);
  assert.match(
    source,
    /- name: Compilar APK de release[\s\S]+?env:[\s\S]+?ARALEARN_ANDROID_KEYSTORE_PASSWORD:[\s\S]+?ARALEARN_ANDROID_KEY_ALIAS:[\s\S]+?ARALEARN_ANDROID_KEY_PASSWORD:[\s\S]+?run: npm run android:release/u
  );
  assert.ok(
    source.indexOf("npm run deployment:verify-hosted") < source.indexOf("npm test") &&
      source.indexOf("npm test") < source.indexOf("npm run lint") &&
      source.indexOf("npm run deployment:verify-hosted") < source.indexOf("npm run android:release")
  );
  assert.match(source, /- name: Executar testes antes da release[\s\S]+run: npm test/u);
  assert.match(source, /- name: Analisar código antes da release[\s\S]+run: npm run lint/u);
  assert.doesNotMatch(source, /run:\s*\|\s*\r?\n\s*npm test\s*\r?\n\s*npm run lint/u);
  assert.match(source, /android-release-\$\{\{[\s\S]+\|\| github\.run_id \}\}/u);
  assert.doesNotMatch(source, /certificate SHA-256 digest/u);
  assert.doesNotMatch(source, /compatibilidade para materialização/u);
});

test("Android expõe callback móvel e salvamento textual local restrito", () => {
  const activity = fs.readFileSync(scripts.androidActivity, "utf8");
  const manifest = fs.readFileSync(scripts.androidManifest, "utf8");
  const strings = fs.readFileSync(scripts.androidStrings, "utf8");
  assert.match(manifest, /android\.intent\.action\.VIEW/u);
  assert.match(manifest, /android:scheme="aralearn"/u);
  assert.match(manifest, /android:host="auth"/u);
  assert.match(manifest, /android:path="\/callback"/u);
  assert.match(activity, /public void finishApp\(\)/u);
  assert.match(activity, /public boolean saveTextFile\(String content, String fileName, String mimeTypeValue\)/u);
  assert.match(activity, /Intent\.ACTION_CREATE_DOCUMENT/u);
  assert.match(activity, /MAX_TEXT_EXPORT_BYTES\s*=\s*8 \* 1024 \* 1024/u);
  assert.match(activity, /MAX_TEXT_EXPORT_FILE_NAME_LENGTH\s*=\s*160/u);
  assert.match(activity, /Pattern\.compile\("\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\*"\)/u);
  assert.match(activity, /value\.contains\("\.\."\)/u);
  assert.match(activity, /"application\/json"/u);
  assert.match(activity, /"text\/csv"/u);
  assert.match(activity, /StandardCharsets\.UTF_8/u);
  assert.match(manifest, /android:configChanges="[^"]*orientation[^"]*screenSize[^"]*uiMode/u);
  assert.match(activity, /File\.createTempFile\(TEXT_EXPORT_CACHE_PREFIX, "\.tmp", getCacheDir\(\)\)/u);
  assert.match(activity, /outState\.putString\(STATE_TEXT_EXPORT_PATH/u);
  assert.match(activity, /restorePendingTextExport\(savedInstanceState\)/u);
  assert.match(activity, /new FileInputStream\(pending\.source\)/u);
  assert.match(activity, /finally \{\s*deletePendingTextExport\(pending\)/u);
  assert.match(strings, /text_export_too_large[^>]*>[^<]*8 MiB/u);
  assert.doesNotMatch(manifest, /android\.intent\.action\.SEND/u);
  assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/u);
  assert.doesNotMatch(activity, /saveExportFile|receiveSharedJson|runtimeReady/u);
});

test("validação limpa e repete somente a inicialização local do Supabase", () => {
  const source = fs.readFileSync(scripts.validationWorkflow, "utf8");
  assert.match(source, /cancel-in-progress: true/u);
  assert.match(source, /supabase@2\.115\.0 stop --no-backup/u);
  assert.doesNotMatch(source, /supabase@2\.115\.0 stop --all/u);
  assert.match(source, /for attempt in 1 2 3/u);
  assert.match(source, /if npx --yes supabase@2\.115\.0 start/u);
  assert.match(source, /ss -ltnp '\( sport = :54322 \)'/u);
  assert.match(source, /sleep \$\(\(attempt \* 3\)\)/u);
  assert.match(source, /npx --yes supabase@2\.115\.0 test db/u);
  assert.ok(
    source.indexOf("supabase@2.115.0 db reset") <
      source.indexOf("supabase@2.115.0 test db")
  );
});

test("validação local atravessa navegador, MCP OAuth, API, IndexedDB e Supabase real", () => {
  const source = fs.readFileSync(scripts.validationWorkflow, "utf8");
  assert.match(source, /Instalar dependências da integração local[\s\S]+?run: npm ci/u);
  assert.match(
    source,
    /Instalar Chromium da integração local[\s\S]+?playwright install --with-deps chromium/u
  );
  assert.match(source, /functions serve --no-verify-jwt/u);
  assert.doesNotMatch(source, /functions serve aralearn-authoring-mcp --no-verify-jwt/u);
  assert.match(source, /--request GET[\s\S]+?"\$COURSE_API_URL"/u);
  assert.match(source, /course_api_status" = 405/u);
  assert.match(source, /"code":"method_not_allowed"/u);
  assert.doesNotMatch(
    source.slice(source.indexOf("Servir e testar o gateway MCP e a Autoria real")),
    /--request OPTIONS/u
  );
  assert.match(source, /npm run test:authoring:mcp:local:oauth/u);
  assert.match(source, /export ARALEARN_E2E_REAL_SUPABASE=1/u);
  assert.match(source, /export ARALEARN_SUPABASE_URL="\$API_URL"/u);
  assert.match(source, /export ARALEARN_SUPABASE_PUBLISHABLE_KEY="\$ANON_KEY"/u);
  assert.match(source, /export SUPABASE_SERVICE_ROLE_KEY="\$SERVICE_ROLE_KEY"/u);
  assert.match(source, /npm run test:authoring:supabase:e2e/u);
  assert.ok(
    source.indexOf("supabase@2.115.0 db reset") <
      source.indexOf("npm run test:authoring:supabase:e2e")
  );
});

test("Pages publica diretamente o push não documental protegido em main", () => {
  const source = fs.readFileSync(scripts.pagesWorkflow, "utf8");
  const triggers = source.slice(source.indexOf("on:"), source.indexOf("permissions:"));
  assert.match(triggers, /push:\s*\n\s*branches:\s*\n\s*- main/u);
  assert.match(triggers, /paths-ignore:[\s\S]+docs\/\*\*\/\*\.md/u);
  assert.doesNotMatch(source, /workflow_run:|Validar repositório/u);
  assert.match(
    source,
    /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/u
  );
  assert.match(source, /permissions:\s*\n\s*contents: read/u);
  assert.equal(
    source.match(/ref: \$\{\{ env\.ARALEARN_PAGES_SHA \}\}/gu)?.length,
    2
  );
  assert.match(source, /ARALEARN_PAGES_SHA: \$\{\{ github\.sha \}\}/u);
  assert.doesNotMatch(source, /actions\/workflows\/validacao\.yml|Confirmar validação da revisão/u);
  assert.match(
    source,
    /group: pages-\$\{\{[\s\S]+\|\| github\.run_id \}\}/u
  );
  assert.match(source, /npm run deployment:verify-hosted/u);
  assert.match(source, /npm run pages:build/u);
  assert.ok(
    source.indexOf("npm run deployment:verify-hosted") <
      source.indexOf("npm run pages:build") &&
    source.indexOf("npm run pages:build") <
      source.indexOf("verifyDeploymentArtifacts.ps1")
  );
  assert.doesNotMatch(
    source,
    /npm test|npm run lint|npm run validate:course-runtime|npm run test:e2e|playwright install/u
  );
  assert.match(source, /node \.\/scripts\/verifyPublishedSite\.mjs --url/u);
  assert.doesNotMatch(source, /Start-Sleep|\$attempts/u);
});

test("validação do repositório usa permissão mínima", () => {
  const source = fs.readFileSync(scripts.validationWorkflow, "utf8");
  assert.match(source, /permissions:\s*\n\s*contents: read/u);
  assert.doesNotMatch(source, /contents: write|actions: write|pages: write|id-token: write/u);
  assert.match(source, /ARALEARN_AUTHORING_PROTOCOL_BASE_REF: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u);
  assert.match(source, /npm run authoring:contract:history/u);
});

test("validação obrigatória distingue documentação sem omitir os jobs existentes", () => {
  const source = fs.readFileSync(scripts.validationWorkflow, "utf8");
  const triggers = source.slice(source.indexOf("on:"), source.indexOf("permissions:"));
  assert.match(triggers, /pull_request:\s*\n\s*branches:\s*\n\s*- main\s*\n\s*- release\/\*\*/u);
  assert.match(triggers, /workflow_dispatch:/u);
  assert.doesNotMatch(triggers, /push:|paths-ignore:/u);
  assert.match(source, /name: Testar e validar/u);
  assert.match(source, /name: Testar Supabase local/u);
  assert.equal(source.match(/node \.\/scripts\/classifyCiPaths\.mjs/gu)?.length, 2);
  for (const validator of [
    "npm run audit:docs",
    "npm run audit:terminology",
    "npm run docs:references:check"
  ]) {
    assert.match(source, new RegExp(validator.replaceAll(".", "\\."), "u"));
  }
  assert.match(source, /git diff --check/u);
  assert.match(source, /Registrar backend não afetado[\s\S]+docs_only == 'true'/u);
  for (const expensiveStep of [
    "Preparar Java",
    "Instalar Chromium para testes de interface",
    "Gerar e testar o artefato web no navegador",
    "Compilar aplicativo Android",
    "Instalar Chromium da integração local",
    "Preparar Deno",
    "Iniciar stack Supabase"
  ]) {
    assert.match(
      source,
      new RegExp(`- name: ${expensiveStep}[\\s\\S]{0,120}if: steps\\.paths\\.outputs\\.docs_only != 'true'`, "u")
    );
  }
  assert.match(
    source,
    /deno check --config supabase\/functions\/deno\.json supabase\/functions\/aralearn-authoring-action\/index\.ts/u
  );
  assert.match(source, /always\(\) && steps\.paths\.outputs\.docs_only != 'true'/u);
});

test("PR conserva a prévia web e o APK debug sem promover uma release", () => {
  const source = fs.readFileSync(scripts.validationWorkflow, "utf8");
  assert.ok(Array.from(source.matchAll(/steps\.paths\.outputs\.docs_only != 'true'/gu)).length >= 20);
  assert.equal(Array.from(source.matchAll(/ARALEARN_SUPABASE_URL: \$\{\{ vars\.ARALEARN_SUPABASE_URL \}\}/gu)).length, 2);
  assert.equal(Array.from(source.matchAll(/ARALEARN_SUPABASE_PUBLISHABLE_KEY: \$\{\{ vars\.ARALEARN_SUPABASE_PUBLISHABLE_KEY \}\}/gu)).length, 2);
  assert.equal(Array.from(source.matchAll(/-RequireRuntimeConfig/gu)).length, 2);
  assert.match(
    source,
    /uses: actions\/upload-artifact@v4[\s\S]+name: aralearn-pages-candidate\s*\n\s*path: \.pages\s*\n\s*include-hidden-files: true/u
  );
  assert.equal(Array.from(source.matchAll(/include-hidden-files: true/gu)).length, 1);
  assert.match(source, /uses: actions\/upload-artifact@v4[\s\S]+name: aralearn-android-debug-candidate[\s\S]+path: android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/u);
  assert.equal(Array.from(source.matchAll(/retention-days: 7/gu)).length, 2);
  assert.doesNotMatch(source, /actions\/deploy-pages|gh release create|app-release\.apk/u);
});

test("workflows usam Actions mantidas sobre o runtime atual do GitHub", () => {
  const androidSource = fs.readFileSync(scripts.androidWorkflow, "utf8");
  const pagesSource = fs.readFileSync(scripts.pagesWorkflow, "utf8");
  const validationSource = fs.readFileSync(scripts.validationWorkflow, "utf8");
  for (const source of [androidSource, pagesSource, validationSource]) {
    assert.match(source, /actions\/checkout@v7/u);
    assert.match(source, /actions\/setup-node@v7/u);
    assert.doesNotMatch(source, /actions\/(?:checkout|setup-node|setup-java)@v4/u);
  }
  assert.match(androidSource, /actions\/setup-java@v5/u);
  assert.match(validationSource, /actions\/setup-java@v5/u);
});

test("verificação reprova identidade ou certificado incompatíveis com atualização in-place", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-release-wrong-"));
  try {
    const apkPath = packApk(
      temporaryRoot,
      writeSafeAndroidArtifact,
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

test("verificação inspeciona o runtime aninhado e bloqueia a API estática", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-static-api-"));
  try {
    const apkPath = packApk(
      temporaryRoot,
      writeSafeAndroidArtifact,
      {
        legacySurfaceText:
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

test("verificação preserva o callback OAuth canônico de Actions", {
  skip: !powerShellAvailable
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-apk-actions-oauth-"));
  try {
    const apkPath = packApk(
      temporaryRoot,
      writeSafeAndroidArtifact,
      {
        legacySurfaceText:
          "/functions/v1/aralearn-authoring-action/oauth/authorizations/current"
      }
    );
    const result = runScript(
      scripts.verify,
      ["-ArtifactPath", apkPath, "-AsJson"],
      writeAndroidToolMocks(temporaryRoot)
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
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
          assistAllowedOrigins: [
            ...DEFAULT_ASSIST_ALLOWED_ORIGINS,
            "https://modelos.example.edu"
          ]
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
    assert.ok(codes.has("config.assist-origins"));
    assert.ok(codes.has("csp.origin"));
    assert.ok(codes.has("csp.assist-origin"));
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
