import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const manifest = fs.readFileSync(
  new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url),
  "utf8"
);
const activity = fs.readFileSync(
  new URL("../../android/app/src/main/java/com/aralearn/app/MainActivity.java", import.meta.url),
  "utf8"
);
const gradle = fs.readFileSync(
  new URL("../../android/app/build.gradle.kts", import.meta.url),
  "utf8"
);
const releaseBuild = fs.readFileSync(
  new URL("../../scripts/buildAndroidRelease.ps1", import.meta.url),
  "utf8"
);
const debugBuild = fs.readFileSync(
  new URL("../../scripts/buildAndroidDebug.ps1", import.meta.url),
  "utf8"
);
const networkSecurity = fs.readFileSync(
  new URL("../../android/app/src/main/res/xml/network_security_config.xml", import.meta.url),
  "utf8"
);
const dataExtractionRules = fs.readFileSync(
  new URL("../../android/app/src/main/res/xml/data_extraction_rules.xml", import.meta.url),
  "utf8"
);
const staging = fs.readFileSync(new URL("../../scripts/stageWebRuntime.mjs", import.meta.url), "utf8");
const editorApp = fs.readFileSync(new URL("../../src/ui/lessonEditorApp.js", import.meta.url), "utf8");

test("o APK declara somente internet, não exporta backup e recebe o callback de autenticação", () => {
  const permissions = [...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"\s*\/>/gu)]
    .map((match) => match[1]);

  assert.deepEqual(permissions, ["android.permission.INTERNET"]);
  assert.match(manifest, /android:allowBackup="false"/u);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/u);
  assert.match(manifest, /android:fullBackupContent="false"/u);
  assert.match(manifest, /android:usesCleartextTraffic="false"/u);
  assert.match(manifest, /android:launchMode="singleTask"/u);
  assert.match(
    manifest,
    /android:host="auth"[\s\S]*android:path="\/callback"[\s\S]*android:scheme="aralearn"/u
  );
  assert.match(dataExtractionRules, /<cloud-backup>[\s\S]*<exclude domain="database" path="\."\s*\/>/u);
  assert.match(dataExtractionRules, /<device-transfer>[\s\S]*<exclude domain="database" path="\."\s*\/>/u);
});

test("o WebView usa origem HTTPS estável, IndexedDB e isolamento de arquivos", () => {
  assert.match(activity, /https:\/\/appassets\.androidplatform\.net\/assets\/www\/public\/index\.html/u);
  assert.match(activity, /settings\.setDomStorageEnabled\(true\)/u);
  assert.match(activity, /settings\.setDatabaseEnabled\(true\)/u);
  assert.match(activity, /settings\.setAllowFileAccess\(false\)/u);
  assert.match(activity, /settings\.setAllowFileAccessFromFileURLs\(false\)/u);
  assert.match(activity, /settings\.setAllowUniversalAccessFromFileURLs\(false\)/u);
  assert.match(activity, /WebSettings\.MIXED_CONTENT_NEVER_ALLOW/u);
  assert.doesNotMatch(activity, /WebSettings\.MIXED_CONTENT_ALWAYS_ALLOW/u);
  assert.match(activity, /resolveAuthCallbackUrl/u);
  assert.match(activity, /if \(authUrl == null\) \{\s*captureSharedImportIntent/u);
  assert.match(activity, /request\.isForMainFrame\(\)/u);
  assert.match(activity, /public void runtimeReady\(\)/u);
  assert.match(activity, /MainActivity\.this::flushPendingSharedImportToWebView/u);
  assert.match(editorApp, /AndroidHost\?\.runtimeReady\?\.\(\)/u);
});

test("a rede remota exige HTTPS e o cleartext fica restrito ao desenvolvimento local", () => {
  assert.match(networkSecurity, /<base-config cleartextTrafficPermitted="false"\s*\/>/u);
  for (const localHost of ["10.0.2.2", "127.0.0.1", "localhost"]) {
    assert.match(networkSecurity, new RegExp(`>${localHost.replaceAll(".", "\\.")}<`, "u"));
  }
  assert.match(staging, /parsed\.protocol !== "https:"/u);
  assert.match(staging, /new Set\(\["localhost", "127\.0\.0\.1", "10\.0\.2\.2"\]\)/u);
});

test("o build Android recebe apenas configuração pública e não adiciona SDK Supabase nativo", () => {
  assert.match(gradle, /versionCode = 160/u);
  assert.match(gradle, /versionName = "0\.0\.18"/u);
  assert.match(gradle, /System\.getenv\("ARALEARN_SUPABASE_URL"\)/u);
  assert.match(gradle, /System\.getenv\("ARALEARN_SUPABASE_PUBLISHABLE_KEY"\)/u);
  assert.match(gradle, /System\.getenv\("ARALEARN_ASSIST_ALLOWED_ORIGINS"\)/u);
  assert.match(gradle, /inputs\.property\("ARALEARN_ASSIST_ALLOWED_ORIGINS"/u);
  assert.match(gradle, /inputs\.dir\(File\(webProjectDir, "docs\/downloads\/authoring"\)\)/u);
  assert.match(gradle, /requireReleaseRuntimeConfig/u);
  assert.match(gradle, /ARALEARN_SUPABASE_URL deve usar HTTPS na release Android/u);
  assert.doesNotMatch(gradle, /implementation\([^\n)]*supabase/iu);
  assert.doesNotMatch(gradle, /service[_-]?role/iu);
  assert.match(staging, /payload\?\.role === "service_role"/u);
  assert.match(staging, /"embedded-courses"/u);
  assert.match(staging, /Curso ou catálogo operacional presente no artefato/u);
  assert.doesNotMatch(staging, /pdfjs-dist|mammoth/u);
  assert.doesNotMatch(staging, /forbiddenStudentRuntimePrefixes|Dependência autoral presente/u);
});

test("a release reutiliza a capacidade local compatível sem gravar credenciais", () => {
  assert.match(gradle, /historicalDebugKeystoreFile/u);
  assert.match(gradle, /historicalSigningIsReady/u);
  assert.match(gradle, /signingConfigs\.getByName\("debug"\)/u);
  assert.match(gradle, /releaseCredentialsWereProvided/u);
  assert.match(releaseBuild, /publishedRuntimeConfigUrl/u);
  assert.match(releaseBuild, /Set-PublicRuntimeConfigIfMissing/u);
  assert.match(releaseBuild, /Select-AndroidSigningCapability/u);
  assert.match(releaseBuild, /historicalDebugKeystorePath/u);
  assert.match(releaseBuild, /A assinatura configurada não está utilizável/u);
  assert.match(releaseBuild, /runtimeConfigInjected/u);
  assert.match(releaseBuild, /if \(\$LASTEXITCODE -ne 0\)/u);
  assert.match(debugBuild, /if \(\$LASTEXITCODE -ne 0\)/u);
  assert.doesNotMatch(releaseBuild, /ARALEARN_ANDROID_KEYSTORE_PASSWORD\s*=/u);
  assert.doesNotMatch(releaseBuild, /androiddebugkey|storePassword/iu);
});

test("o shell web limita a limpeza de cache e não persiste callbacks de autenticação", () => {
  const serviceWorker = read("public/service-worker.js");
  const tokens = read("public/styles-tokens.css");
  const shellBaseline = read("public/styles-shell-baseline.css");
  const index = read("public/index.html");
  const frameGuard = read("public/frame-guard.js");

  assert.match(serviceWorker, /__ARALEARN_CACHE_REVISION__/u);
  assert.doesNotMatch(serviceWorker, /0\.0\.11-r1/u);
  assert.match(serviceWorker, /const CACHE_PREFIX = "aralearn-shell-v2-"/u);
  assert.match(serviceWorker, /OBSOLETE_CACHE_PREFIXES\.some\(\(prefix\) => key\.startsWith\(prefix\)\)/u);
  assert.match(serviceWorker, /response\.ok && !new URL\(request\.url\)\.search/u);
  assert.match(serviceWorker, /\.\/frame-guard\.js/u);
  assert.match(serviceWorker, /\.\/theme-bootstrap\.js/u);
  assert.match(serviceWorker, /\.\/styles-tokens\.css/u);
  assert.match(serviceWorker, /event\.respondWith\(networkFirst\(event\.request\)\)/u);
  assert.doesNotMatch(serviceWorker, /cacheFirst/u);
  assert.doesNotMatch(serviceWorker, /caches\.match\(/u);
  assert.match(shellBaseline, /#app-root\s*\{[^}]*width:\s*100%/u);
  assert.match(shellBaseline, /\.app-shell\s*\{[^}]*margin-inline:\s*auto/u);
  assert.match(tokens, /data-color-mode="dark"/u);
  assert.doesNotMatch(index, /frame-ancestors/u);
  assert.match(index, /<script src="frame-guard\.js"><\/script>/u);
  assert.match(frameGuard, /globalThis\.top !== globalThis\.self/u);
  assert.match(frameGuard, /document\.documentElement\.hidden = true/u);
});
