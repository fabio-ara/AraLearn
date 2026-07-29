import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "docs", "downloads", "authoring");

function build() {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "buildAuthoringPackages.mjs")], {
    cwd: ROOT,
    stdio: "pipe"
  });
}

build();
const firstManifest = await readFile(path.join(OUTPUT, "manifest.json"), "utf8");
build();
const secondManifest = await readFile(path.join(OUTPUT, "manifest.json"), "utf8");
assert.equal(secondManifest, firstManifest, "Pacotes de autoria devem ser determinísticos.");

const manifest = JSON.parse(secondManifest);
assert.equal(manifest.transport, "mcp");
assert.equal(manifest.archives.length, 6);
assert.ok(manifest.archives.every((archive) => /^[a-f0-9]{64}$/u.test(archive.sha256)));

const prompt = await readFile(
  path.join(OUTPUT, "aralearn-chatgpt-system-prompt.md"),
  "utf8"
);
const knowledge = await readFile(
  path.join(OUTPUT, "aralearn-chatgpt-knowledge.md"),
  "utf8"
);
for (const required of [
  "expectedRevision",
  "microteoria",
  "partial",
  "mover",
  "juntar"
]) {
  assert.ok(prompt.includes(required), `Prompt sem ${required}.`);
}
for (const obsolete of [
  "consultarProximaParte",
  "entregarFaseDeAutoria",
  "submissionReadReceipt",
  "planHash"
]) {
  assert.equal(prompt.includes(obsolete), false, `Prompt conserva ${obsolete}.`);
  assert.equal(knowledge.includes(obsolete), false, `Conhecimento conserva ${obsolete}.`);
}

const schemaNames = (await readdir(path.join(ROOT, "authoring", "schemas"))).sort();
assert.deepEqual(schemaNames, [
  "card.schema.json",
  "workspace-mutation.schema.json",
  "workspace-publication.schema.json",
  "workspace.schema.json"
]);
for (const schemaName of schemaNames) {
  JSON.parse(await readFile(path.join(ROOT, "authoring", "schemas", schemaName), "utf8"));
}

const exampleNames = (await readdir(path.join(ROOT, "authoring", "examples"), {
  withFileTypes: true
}))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(exampleNames, [
  "01-workspace-create.json",
  "02-rename-entity.json",
  "03-private-preview.json",
  "README.md"
]);

console.log("Pacotes MCP de autoria validados.");
