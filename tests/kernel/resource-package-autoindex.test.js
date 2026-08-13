import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { RESOURCE_PACKAGE_DEFINITIONS } from "../../src/resources/packages/generated.js";

const packagesRoot = path.resolve("src/resources/packages");

test("autoíndice inclui exatamente as pastas que expõem package", async () => {
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  const packageDirectories = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const hasIndex = await access(path.join(packagesRoot, entry.name, "index.js"))
      .then(() => true, () => false);
    if (hasIndex) packageDirectories.push(entry);
  }
  assert.equal(RESOURCE_PACKAGE_DEFINITIONS.length, packageDirectories.length);
  assert.equal(new Set(RESOURCE_PACKAGE_DEFINITIONS.map(({ manifest }) => (
    `${manifest.id}@${manifest.version}`
  ))).size, packageDirectories.length);
});

test("autoíndice gerado está atual e preserva o prefixo estável publicado", () => {
  execFileSync(process.execPath, ["scripts/generateResourcePackageIndex.mjs", "--check"], {
    cwd: process.cwd(),
    stdio: "pipe"
  });
  assert.deepEqual(RESOURCE_PACKAGE_DEFINITIONS.slice(0, 6).map(({ manifest }) => manifest.id), [
    "aralearn.resource.paragraph",
    "aralearn.resource.code",
    "aralearn.resource.table",
    "aralearn.resource.annotated_text",
    "aralearn.resource.bpmn_process",
    "aralearn.resource.interlinear_gloss"
  ]);
});
