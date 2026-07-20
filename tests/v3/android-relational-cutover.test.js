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
const networkSecurity = fs.readFileSync(
  new URL("../../android/app/src/main/res/xml/network_security_config.xml", import.meta.url),
  "utf8"
);
const dataExtractionRules = fs.readFileSync(
  new URL("../../android/app/src/main/res/xml/data_extraction_rules.xml", import.meta.url),
  "utf8"
);
const staging = fs.readFileSync(new URL("../../scripts/stageWebRuntime.mjs", import.meta.url), "utf8");
const learnerApp = fs.readFileSync(new URL("../../src/ui/LearnerApp.js", import.meta.url), "utf8");

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
  assert.match(learnerApp, /AndroidHost\?\.runtimeReady\?\.\(\)/u);
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
  assert.match(gradle, /versionCode = 136/u);
  assert.match(gradle, /versionName = "0\.1\.0"/u);
  assert.match(gradle, /System\.getenv\("ARALEARN_SUPABASE_URL"\)/u);
  assert.match(gradle, /System\.getenv\("ARALEARN_SUPABASE_PUBLISHABLE_KEY"\)/u);
  assert.match(gradle, /requireReleaseRuntimeConfig/u);
  assert.match(gradle, /ARALEARN_SUPABASE_URL deve usar HTTPS na release Android/u);
  assert.doesNotMatch(gradle, /implementation\([^\n)]*supabase/iu);
  assert.doesNotMatch(gradle, /service[_-]?role/iu);
  assert.match(staging, /payload\?\.role === "service_role"/u);
  assert.match(staging, /"embedded-courses"/u);
  assert.match(staging, /Curso ou catálogo operacional presente no artefato/u);
  assert.match(staging, /"src\/generation\/"/u);
  assert.match(staging, /"src\/assist\/"/u);
  assert.match(staging, /"src\/editor\/"/u);
  assert.match(staging, /const runtimeDependencies = \[\]/u);
});

test("o shell web limita a limpeza de cache e não persiste callbacks de autenticação", () => {
  const serviceWorker = read("public/service-worker.js");
  const shellBaseline = read("public/styles-shell-baseline.css");
  const index = read("public/index.html");
  const frameGuard = read("public/frame-guard.js");

  assert.match(serviceWorker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/u);
  assert.match(serviceWorker, /response\.ok && !new URL\(request\.url\)\.search/u);
  assert.match(serviceWorker, /\.\/frame-guard\.js/u);
  assert.match(serviceWorker, /event\.respondWith\(networkFirst\(event\.request\)\)/u);
  assert.doesNotMatch(serviceWorker, /cacheFirst/u);
  assert.doesNotMatch(serviceWorker, /caches\.match\(/u);
  assert.match(shellBaseline, /#app-root\s*\{[^}]*width:\s*100%/u);
  assert.match(shellBaseline, /\.app-shell\s*\{[^}]*margin-inline:\s*auto/u);
  assert.doesNotMatch(index, /frame-ancestors/u);
  assert.match(index, /<script src="frame-guard\.js"><\/script>/u);
  assert.match(frameGuard, /globalThis\.top !== globalThis\.self/u);
  assert.match(frameGuard, /document\.documentElement\.hidden = true/u);
});
