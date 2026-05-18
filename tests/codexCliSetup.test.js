import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexCliHealthCommand,
  buildCodexCliSetupScript,
  detectCodexCliSetupPlatform,
  getCodexCliSetupPresentation
} from "../src/ui/codexCliSetup.js";

test("detectCodexCliSetupPlatform reconhece Android pelo user agent", () => {
  assert.equal(
    detectCodexCliSetupPlatform({
      userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36",
      platform: "Linux armv8l"
    }),
    "android"
  );
});

test("detectCodexCliSetupPlatform reconhece Windows e Linux", () => {
  assert.equal(
    detectCodexCliSetupPlatform({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      platform: "Win32"
    }),
    "windows"
  );

  assert.equal(
    detectCodexCliSetupPlatform({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      platform: "Linux x86_64"
    }),
    "linux"
  );
});

test("setup do Android inclui Termux, Node, bridge, porta e Codex", () => {
  const script = buildCodexCliSetupScript({
    platform: "android",
    endpoint: "http://127.0.0.1:4183/assist",
    token: "segredo"
  });

  assert.match(script, /pkg install nodejs -y/);
  assert.match(script, /Termux/);
  assert.match(script, /aralearnCodexBridge\.mjs/);
  assert.match(script, /4183/);
  assert.match(script, /command -v codex/);
  assert.match(script, /ARALEARN_CODEX_ARGS='exec -'/);
});

test("setup do Windows usa PowerShell e usa o executável Codex encontrado", () => {
  const script = buildCodexCliSetupScript({
    platform: "windows",
    endpoint: "http://127.0.0.1:4183/assist",
    token: "segredo"
  });

  assert.match(script, /\$ErrorActionPreference = "Stop"/);
  assert.match(script, /Get-Command codex\.cmd/);
  assert.match(script, /\$env:ARALEARN_CODEX_COMMAND = \$codexCommand\.Source/);
  assert.match(script, /\$env:ARALEARN_CODEX_ARGS = "exec -"/);
  assert.match(script, /Set-Content/);
});

test("setup do Linux usa shell local sem instalar pacotes automaticamente", () => {
  const script = buildCodexCliSetupScript({
    platform: "linux",
    endpoint: "http://127.0.0.1:4183/assist"
  });

  assert.match(script, /Linux/);
  assert.match(script, /command -v node/);
  assert.match(script, /command -v codex/);
  assert.doesNotMatch(script, /pkg install/);
  assert.match(script, /export ARALEARN_CODEX_COMMAND=codex/);
  assert.match(script, /export ARALEARN_CODEX_ARGS='exec -'/);
});

test("comando health no Windows usa Invoke-RestMethod e no Linux usa curl", () => {
  assert.equal(
    buildCodexCliHealthCommand({
      platform: "windows",
      endpoint: "http://127.0.0.1:4183/assist"
    }),
    "Invoke-RestMethod -Uri 'http://127.0.0.1:4183/health'"
  );

  assert.equal(
    buildCodexCliHealthCommand({
      platform: "linux",
      endpoint: "http://127.0.0.1:4183/assist",
      token: "abc"
    }),
    'curl -H "x-aralearn-token: abc" http://127.0.0.1:4183/health'
  );
});

test("presentation do setup usa textos específicos por plataforma", () => {
  assert.equal(getCodexCliSetupPresentation("android").shellLabel, "Termux");
  assert.equal(getCodexCliSetupPresentation("windows").shellLabel, "PowerShell");
  assert.equal(getCodexCliSetupPresentation("linux").shellLabel, "Shell");
});
