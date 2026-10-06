import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function filesBelow(relativeRoot, extensions) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  return readdirSync(absoluteRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.has(path.extname(entry.name)))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const SANITIZED_LOG_FILE = path.join("supabase", "functions", "_shared", "aralearn-authoring", "mcpServer.js");
const SANITIZED_LOG_SINK = /console\.error\(JSON\.stringify\(record\)\);/u;
const CONSOLE_CALL = /console\.(?:log|info|warn|error|debug|trace)\s*\(/gu;
const RAW_LOG_ALTERNATIVE = /console\s*\[|process\.(?:stdout|stderr)|Deno\.(?:stdout|stderr)/u;

test("Edge não registra corpo, cabeçalhos ou exceções de requisição no console", () => {
  const sources = filesBelow("supabase/functions", new Set([".js", ".ts"]))
    .filter((file) => !file.includes(`${path.sep}tests${path.sep}`));
  assert.ok(sources.length > 0);
  let sanitizedSinks = 0;
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    const label = path.relative(repositoryRoot, file);
    assert.doesNotMatch(source, RAW_LOG_ALTERNATIVE, label);
    const calls = [...source.matchAll(CONSOLE_CALL)];
    if (label === SANITIZED_LOG_FILE) {
      // Exceção estrita: exatamente um sink, com a forma literal do evento
      // sanitizado. Não isenta o arquivo nem aceita alias para o console.
      assert.equal(calls.length, 1, `${label}: só o sink sanitizado é aceito`);
      assert.equal(calls[0][0], "console.error(", label);
      assert.match(source, SANITIZED_LOG_SINK, label);
      sanitizedSinks += 1;
      continue;
    }
    assert.equal(calls.length, 0, label);
  }
  assert.equal(sanitizedSinks, 1, "há exatamente um sink de diagnóstico autorizado");
});

test("workflows não habilitam rastreamento nem imprimem credenciais ou exceções brutas", () => {
  const workflows = filesBelow(".github/workflows", new Set([".yml", ".yaml"]));
  assert.ok(workflows.length > 0);
  const outputCommand = String.raw`(?:Write-(?:Host|Output|Error|Warning)|echo\b)`;
  const protectedEnvironment = String.raw`\$env:(?:GH_TOKEN|[^\s]*PASSWORD|[^\s]*KEYSTORE|[^\s]*PRIVATE_KEY|[^\s]*ACCESS_TOKEN)`;
  for (const file of workflows) {
    const source = readFileSync(file, "utf8");
    const label = path.relative(repositoryRoot, file);
    assert.doesNotMatch(source, /\bset\s+-x\b|Set-PSDebug\s+-Trace|\bGH_DEBUG\b/iu, label);
    assert.doesNotMatch(
      source,
      new RegExp(`${outputCommand}[^\\r\\n]*${protectedEnvironment}`, "iu"),
      label
    );
    assert.doesNotMatch(
      source,
      /(?:Write-(?:Host|Output|Error|Warning)|throw)\s+(?:\$_|\$_\.Exception)(?:\s|$)/ium,
      label
    );
  }
});
