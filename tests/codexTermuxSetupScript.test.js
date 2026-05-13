import test from "node:test";
import assert from "node:assert/strict";

import { buildCodexTermuxHealthCommand, buildCodexTermuxSetupScript } from "../src/ui/codexTermuxSetupScript.js";

test("script de setup do Termux inclui instalação do Node, bridge, porta e verificação do Codex", () => {
  const script = buildCodexTermuxSetupScript({
    endpoint: "http://127.0.0.1:4183/assist",
    token: "segredo"
  });

  assert.match(script, /pkg install nodejs -y/);
  assert.match(script, /aralearnCodexBridge\.mjs/);
  assert.match(script, /4183/);
  assert.match(script, /command -v codex/);
});

test("comando health sem token usa curl simples", () => {
  assert.equal(
    buildCodexTermuxHealthCommand({
      endpoint: "http://127.0.0.1:4183/assist"
    }),
    "curl http://127.0.0.1:4183/health"
  );
});

test("comando health com token envia x-aralearn-token", () => {
  assert.equal(
    buildCodexTermuxHealthCommand({
      endpoint: "http://127.0.0.1:4183/assist",
      token: "abc"
    }),
    'curl -H "x-aralearn-token: abc" http://127.0.0.1:4183/health'
  );
});

