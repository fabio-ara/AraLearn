import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "docs", "downloads", "authoring");
const forbiddenStaticAuthoring =
  /aralearn-authoring-api|X-AraLearn-API-Key|\barl_(?:\.{3}|[A-Za-z0-9_-]{4,})|ARALEARN_AUTHORING_(?:INTEGRATION|RECEIPT)_SECRET|authoring_api_(?:clients|keys)/iu;

function build() {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "buildAuthoringPackages.mjs")], {
    cwd: ROOT,
    stdio: "pipe"
  });
}

function readStoredZipEntries(archive) {
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    assert.ok(offset + 30 <= archive.length, "Cabeçalho ZIP local truncado.");
    const compressionMethod = archive.readUInt16LE(offset + 8);
    const compressedBytes = archive.readUInt32LE(offset + 18);
    const uncompressedBytes = archive.readUInt32LE(offset + 22);
    const nameBytes = archive.readUInt16LE(offset + 26);
    const extraBytes = archive.readUInt16LE(offset + 28);
    assert.equal(compressionMethod, 0, "O pacote determinístico precisa usar entradas ZIP armazenadas.");
    assert.equal(compressedBytes, uncompressedBytes);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameBytes + extraBytes;
    const contentEnd = contentStart + compressedBytes;
    assert.ok(contentEnd <= archive.length, "Entrada ZIP truncada.");
    const name = archive.subarray(nameStart, nameStart + nameBytes).toString("utf8");
    assert.equal(entries.has(name), false, `Entrada ZIP duplicada: ${name}.`);
    entries.set(name, archive.subarray(contentStart, contentEnd));
    offset = contentEnd;
  }
  assert.equal(archive.readUInt32LE(offset), 0x02014b50, "Diretório central ZIP ausente.");
  return entries;
}

build();
const firstManifest = await readFile(path.join(OUTPUT, "manifest.json"), "utf8");
build();
const secondManifest = await readFile(path.join(OUTPUT, "manifest.json"), "utf8");
assert.equal(secondManifest, firstManifest, "Pacotes de autoria devem ser determinísticos.");

const manifest = JSON.parse(secondManifest);
assert.equal(manifest.version, 4);
assert.equal(manifest.transport, "mcp");
assert.equal(manifest.archives.length, 6);
assert.ok(manifest.archives.every((archive) => /^[a-f0-9]{64}$/u.test(archive.sha256)));
assert.deepEqual(
  manifest.files.map(({ file }) => file),
  [
    "aralearn-chatgpt-system-prompt.md",
    "aralearn-chatgpt-knowledge-core.md",
    "aralearn-chatgpt-knowledge-resources.md"
  ]
);
for (const artifact of manifest.files) {
  const content = await readFile(path.join(OUTPUT, artifact.file));
  assert.equal(content.length, artifact.bytes);
  assert.equal(createHash("sha256").update(content).digest("hex"), artifact.sha256);
}
for (const archive of manifest.archives) {
  const content = await readFile(path.join(OUTPUT, archive.file));
  assert.equal(content.length, archive.bytes);
  assert.equal(createHash("sha256").update(content).digest("hex"), archive.sha256);
  const extracted = readStoredZipEntries(content);
  assert.equal(extracted.size, archive.files.length);
  for (const expectedFile of archive.files) {
    const extractedContent = extracted.get(expectedFile.path);
    assert.ok(extractedContent, `${archive.file} não contém ${expectedFile.path}.`);
    assert.equal(extractedContent.length, expectedFile.bytes);
    assert.equal(
      createHash("sha256").update(extractedContent).digest("hex"),
      expectedFile.sha256
    );
    assert.doesNotMatch(
      extractedContent.toString("utf8"),
      forbiddenStaticAuthoring,
      `${archive.file}!${expectedFile.path} conserva a API estática de autoria.`
    );
  }
  if (archive.file === "aralearn-authoring-chatgpt.zip") {
    const setup = extracted.get("aralearn-authoring/platforms/chatgpt/SETUP.md")?.toString("utf8");
    assert.match(setup || "", /OAuth 2\.1/u);
    assert.match(setup || "", /aralearn-authoring-mcp/u);
  }
  const paths = new Set(archive.files.map(({ path: filePath }) => filePath));
  for (const requiredPath of [
    "aralearn-authoring/docs/persistencia-relacional.md",
    "aralearn-authoring/docs/fundamentacao-pedagogica-dos-resources.md"
  ]) {
    assert.ok(paths.has(requiredPath), `${archive.file} não contém ${requiredPath}.`);
  }
  assert.ok(
    [...paths].every((filePath) => !filePath.includes("/docs/screenshots/")),
    `${archive.file} duplicou capturas públicas dentro do pacote.`
  );
}

const prompt = await readFile(
  path.join(OUTPUT, "aralearn-chatgpt-system-prompt.md"),
  "utf8"
);
const coreKnowledge = await readFile(
  path.join(OUTPUT, "aralearn-chatgpt-knowledge-core.md"),
  "utf8"
);
const resourceKnowledge = await readFile(
  path.join(OUTPUT, "aralearn-chatgpt-knowledge-resources.md"),
  "utf8"
);
const knowledge = `${coreKnowledge}\n${resourceKnowledge}`;
const localMarkdownLink = /\]\((?!https?:\/\/|mailto:|#)[^)]+\)/u;
assert.doesNotMatch(coreKnowledge, localMarkdownLink);
assert.doesNotMatch(resourceKnowledge, localMarkdownLink);
assert.match(coreKnowledge, /OAuth 2\.1/u);
assert.match(coreKnowledge, /gateway MCP/u);
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
assert.match(coreKnowledge, /workspace-mutation\.schema\.json/u);
assert.match(resourceKnowledge, /consultarRecursoDeCard/u);
assert.doesNotMatch(coreKnowledge, /schemas\/card\.schema\.json/u);
assert.doesNotMatch(resourceKnowledge, /schemas\/card\.schema\.json/u);
assert.ok(
  Buffer.byteLength(coreKnowledge) < 180_000,
  "Conhecimento essencial cresceu além do limite de contexto planejado."
);
assert.ok(
  Buffer.byteLength(resourceKnowledge) < 180_000,
  "Conhecimento de resources cresceu além do limite de contexto planejado."
);

const expectedSums = [...manifest.archives, ...manifest.files]
  .map((artifact) => `${artifact.sha256}  ${artifact.file}`)
  .join("\n") + "\n";
assert.equal(
  await readFile(path.join(OUTPUT, "SHA256SUMS.txt"), "utf8"),
  expectedSums,
  "SHA256SUMS.txt precisa cobrir exatamente todos os artefatos do manifesto."
);

for (const artifact of [...manifest.archives, ...manifest.files]) {
  const content = await readFile(path.join(OUTPUT, artifact.file));
  assert.doesNotMatch(
    content.toString("utf8"),
    forbiddenStaticAuthoring,
    `${artifact.file} conserva a API estática de autoria.`
  );
}

const schemaNames = (await readdir(path.join(ROOT, "authoring", "schemas"))).sort();
assert.deepEqual(schemaNames, [
  "workspace-envelope.schema.json",
  "workspace-mutation.schema.json",
  "workspace-publication.schema.json"
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
