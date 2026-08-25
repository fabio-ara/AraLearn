import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const manifest = read("android/app/src/main/AndroidManifest.xml");
const activity = read("android/app/src/main/java/com/aralearn/app/MainActivity.java");
const gradle = read("android/app/build.gradle.kts");
const networkSecurity = read("android/app/src/main/res/xml/network_security_config.xml");
const dataExtractionRules = read("android/app/src/main/res/xml/data_extraction_rules.xml");
const staging = read("scripts/stageWebRuntime.mjs");
const releaseBuild = read("scripts/buildAndroidRelease.ps1");
const debugBuild = read("scripts/buildAndroidDebug.ps1");
const packageVersion = JSON.parse(read("package.json")).version;

test("o APK declara somente internet e exclui dados de backup e transferência", () => {
  const permissions = [...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"\s*\/>/gu)]
    .map((match) => match[1]);

  assert.deepEqual(permissions, ["android.permission.INTERNET"]);
  assert.match(manifest, /android:allowBackup="false"/u);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/u);
  assert.match(manifest, /android:fullBackupContent="false"/u);

  for (const section of ["cloud-backup", "device-transfer"]) {
    const contents = dataExtractionRules.match(
      new RegExp(`<${section}>([\\s\\S]*?)<\\/${section}>`, "u")
    )?.[1] ?? "";
    for (const domain of [
      "root",
      "file",
      "database",
      "sharedpref",
      "external",
      "device_root",
      "device_file",
      "device_database",
      "device_sharedpref"
    ]) {
      assert.match(contents, new RegExp(`<exclude domain="${domain}" path="\\."\\s*\\/>`, "u"));
    }
  }
});

test("o WebView isola arquivos e proíbe conteúdo misto na release", () => {
  assert.match(activity, /https:\/\/appassets\.androidplatform\.net\/assets\/www\/public\/index\.html/u);
  assert.match(activity, /WebView\.setWebContentsDebuggingEnabled\(isDebuggableApp\(\)\)/u);
  assert.match(activity, /settings\.setAllowFileAccess\(false\)/u);
  assert.match(activity, /settings\.setAllowFileAccessFromFileURLs\(false\)/u);
  assert.match(activity, /settings\.setAllowUniversalAccessFromFileURLs\(false\)/u);
  assert.match(
    activity,
    /isDebuggableApp\(\)[\s\S]+WebSettings\.MIXED_CONTENT_COMPATIBILITY_MODE[\s\S]+WebSettings\.MIXED_CONTENT_NEVER_ALLOW/u
  );
  assert.doesNotMatch(activity, /WebSettings\.MIXED_CONTENT_ALWAYS_ALLOW/u);
});

test("a assistência Android usa os providers remotos sem ponte de relay", () => {
  assert.doesNotMatch(activity, /AraLearnNativeAssist|WebMessageListener|127\.0\.0\.1:4183/u);
  assert.doesNotMatch(staging, /nativeAssistBridge/u);
  assert.match(staging, /assistAllowedOrigins:\s*buildAssistAllowedOrigins/u);
  assert.doesNotMatch(activity, /setMixedContentMode\(WebSettings\.MIXED_CONTENT_ALWAYS_ALLOW\)/u);
});

test("seletores sobrevivem à rotação e a exportação usa somente cache privado restaurável", () => {
  assert.match(
    manifest,
    /android:configChanges="[^"]*orientation[^"]*screenSize[^"]*smallestScreenSize[^"]*uiMode/u
  );
  assert.match(activity, /File\.createTempFile\(TEXT_EXPORT_CACHE_PREFIX, "\.tmp", getCacheDir\(\)\)/u);
  assert.match(activity, /outState\.putString\(STATE_TEXT_EXPORT_PATH/u);
  assert.match(activity, /restorePendingTextExport\(savedInstanceState\)/u);
  assert.match(activity, /getCacheDir\(\)\.getCanonicalPath\(\) \+ File\.separator/u);
  assert.match(activity, /new FileInputStream\(pending\.source\)/u);
  assert.match(activity, /deletePendingTextExport\(pending\)/u);
  assert.doesNotMatch(activity, /outState\.putByteArray/u);
});

test("a rede remota exige HTTPS e limita texto claro ao desenvolvimento local", () => {
  assert.match(manifest, /android:usesCleartextTraffic="false"/u);
  assert.match(networkSecurity, /<base-config cleartextTrafficPermitted="false"\s*\/>/u);
  for (const localHost of ["10.0.2.2", "127.0.0.1", "localhost"]) {
    assert.match(networkSecurity, new RegExp(`>${localHost.replaceAll(".", "\\.")}<`, "u"));
  }
  assert.match(staging, /parsed\.protocol !== "https:"/u);
  assert.match(staging, /new Set\(\["localhost", "127\.0\.0\.1", "10\.0\.2\.2"\]\)/u);
});

test("o artefato recebe somente configuração pública do Supabase", () => {
  assert.match(gradle, /versionCode = [1-9]\d*/u);
  assert.match(
    gradle,
    new RegExp(`versionName = "${packageVersion.replaceAll(".", "\\.")}"`, "u")
  );
  assert.match(gradle, /System\.getenv\("ARALEARN_SUPABASE_URL"\)/u);
  assert.match(gradle, /System\.getenv\("ARALEARN_SUPABASE_PUBLISHABLE_KEY"\)/u);
  assert.doesNotMatch(gradle, /implementation\([^\n)]*supabase/iu);
  assert.doesNotMatch(gradle, /service[_-]?role/iu);
  assert.match(staging, /payload\?\.role === "service_role"/u);
  assert.match(staging, /\^sb_secret_/u);
});

test("a release exige assinatura utilizável sem gravar credenciais", () => {
  assert.match(gradle, /historicalDebugKeystoreFile/u);
  assert.match(gradle, /historicalSigningIsReady/u);
  assert.match(gradle, /signingConfigs\.getByName\("debug"\)/u);
  assert.match(gradle, /releaseCredentialsWereProvided/u);
  assert.match(releaseBuild, /Select-AndroidSigningCapability/u);
  assert.match(releaseBuild, /historicalDebugKeystorePath/u);
  assert.match(releaseBuild, /A assinatura configurada não está utilizável/u);
  assert.match(releaseBuild, /if \(\$LASTEXITCODE -ne 0\)/u);
  assert.match(debugBuild, /if \(\$LASTEXITCODE -ne 0\)/u);
  assert.doesNotMatch(releaseBuild, /ARALEARN_ANDROID_KEYSTORE_PASSWORD\s*=/u);
  assert.doesNotMatch(releaseBuild, /androiddebugkey|storePassword/iu);
});
