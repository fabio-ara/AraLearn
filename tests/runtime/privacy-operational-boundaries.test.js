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

test("Edge não registra corpo, cabeçalhos ou exceções de requisição no console", () => {
  const sources = filesBelow("supabase/functions", new Set([".js", ".ts"]))
    .filter((file) => !file.includes(`${path.sep}tests${path.sep}`));
  assert.ok(sources.length > 0);
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /console\.(?:log|info|warn|error|debug|trace)\s*\(/u,
      path.relative(repositoryRoot, file)
    );
  }
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
