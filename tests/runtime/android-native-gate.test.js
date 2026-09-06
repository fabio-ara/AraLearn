import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("prova Android recusa identidade, bytes, licença e estado UI divergentes (sintético)", () => {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["tests/helpers/androidNativeGateTests.py"], {
    cwd: root, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  assert.match(result.stderr, /Ran 23 tests/u);
});

test("Pages e Release exigem prova do APK exato, sem reconstrução ou permissões de assinatura no emulador", () => {
  const source = fs.readFileSync(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf8");
  const gate = fs.readFileSync(new URL("../../scripts/androidNativeGate.py", import.meta.url), "utf8");
  const native = source.slice(source.indexOf("  android-native:"), source.indexOf("  pages:"));
  const pages = source.slice(source.indexOf("  pages:"), source.indexOf("  release:"));
  const release = source.slice(source.indexOf("  release:"));
  assert.match(native, /needs: \[candidate, android\]/u);
  assert.match(native, /runs-on: ubuntu-24\.04/u);
  assert.match(native, /timeout-minutes: 25/u);
  assert.match(native, /contents: read/u);
  assert.match(native, /actions: read/u);
  assert.doesNotMatch(native, /secrets\.|contents: write|continue-on-error|buildAndroid|gradlew|--licenses|yes \|/u);
  assert.match(native, /artifact-ids: \$\{\{ needs\.android\.outputs\.artifact_id \}\}[\s\S]+merge-multiple: true[\s\S]+path: \.candidate\/android-release/u);
  assert.match(native, /--candidate-folder \.candidate\/android-release/u);
  assert.match(native, /test -c \/dev\/kvm/u);
  assert.match(native, /apt-get install --yes --no-install-recommends libpulse0/u);
  assert.match(native, /ldconfig -p \| grep -F 'libpulse\.so\.0'/u);
  assert.ok(native.indexOf("libpulse0") < native.indexOf("androidNativeGate.py run"));
  assert.match(native, /androidNativeGate\.py run/u);
  assert.match(native, /proof_sha256: \$\{\{ steps\.native\.outputs\.proof_sha256 \}\}/u);
  assert.match(gate, /device\.launch\(\)\s+if case == "clean":\s+device\.wait_label\("Conta e aparência"\)\s+device\.isolate_network\(\)\s+device\.dark\(\)/u);
  assert.match(gate, /device\.call\("install", "-r", str\(candidate\)[\s\S]+device\.launch\(\)\s+device\.wait_label\("Conta e aparência"\)\s+device\.isolate_network\(\)/u);
  assert.match(gate, /"networkPolicy": "public-bootstrap-then-offline", "offlineAfterHydration": True/u);
  for (const [section, publication] of [[pages, "actions/configure-pages"], [release, "finalize-release"]]) {
    assert.match(section, /needs: \[candidate, android, android-native(?:, pages)?\]/u);
    assert.match(section, /artifact-ids: \$\{\{ needs\.android-native\.outputs\.proof_artifact_id \}\}/u);
    assert.match(section, /artifact-ids: \$\{\{ needs\.android\.outputs\.artifact_id \}\}[\s\S]+merge-multiple: true[\s\S]+path: \.candidate\/android-release/u);
    assert.match(section, /--candidate-folder \.candidate\/android-release/u);
    assert.match(section, /--proof-sha256 "\$\{\{ needs\.android-native\.outputs\.proof_sha256 \}\}"/u);
    assert.ok(section.indexOf("androidNativeGate.py verify") < section.indexOf(publication));
  }
});
