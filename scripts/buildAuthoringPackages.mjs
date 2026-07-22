import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..");
const AUTHORING_ROOT = path.join(REPOSITORY_ROOT, "authoring");
const OUTPUT_ROOT = path.join(REPOSITORY_ROOT, "docs", "downloads", "authoring");
const OPENAPI_PATH = path.join(REPOSITORY_ROOT, "docs", "openapi", "aralearn-authoring-api.yaml");
const CHATGPT_OPENAPI_PATHS = ["private", "editorial"].map((profile) => ({
  profile,
  fileName: `aralearn-authoring-api-chatgpt-${profile}.yaml`,
  absolutePath: path.join(
    REPOSITORY_ROOT,
    "docs",
    "openapi",
    `aralearn-authoring-api-chatgpt-${profile}.yaml`
  )
}));
const COPILOT_OPENAPI_PATH = path.join(
  REPOSITORY_ROOT,
  "docs",
  "openapi",
  "aralearn-authoring-api-copilot-v2.json"
);
const NORMATIVE_DOCS = ["aralearn-contract.md", "recursos-de-card.md"];
const DISTRIBUTED_DOCS = [...NORMATIVE_DOCS, "autoria-mcp.md"];
const CHATGPT_KNOWLEDGE_SOURCES = [
  "core/workflow.md",
  "core/states.md",
  "core/quality.md",
  "core/sources.md",
  "core/safety.md",
  "knowledge/contract-v3.md",
  "knowledge/cards-and-resources.md",
  "knowledge/domain-patterns.md",
  "knowledge/term-ledger.md",
  "knowledge/continuity.md",
  "knowledge/publication.md"
];
const ARCHIVE_ROOT = "aralearn-authoring";
const PLATFORMS = ["chatgpt", "gemini", "microsoft-365", "claude", "generic"];
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 33;
const UTF8_FLAG = 0x0800;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function posixPath(value) {
  return value.split(path.sep).join("/");
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(root) {
  const result = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        result.push(absolutePath);
      }
    }
  }

  await visit(root);
  return result;
}

async function buildChatGptKnowledge() {
  const sections = [
    "# Conhecimento de autoria do AraLearn",
    "",
    "Este arquivo reúne o fluxo, as regras, o contrato e os esquemas necessários ao GPT de autoria. Use-o como o único arquivo de conhecimento do GPT. A especificação OpenAPI é importada separadamente como Action."
  ];

  for (const relative of CHATGPT_KNOWLEDGE_SOURCES) {
    const content = (await readFile(path.join(AUTHORING_ROOT, relative), "utf8")).trim();
    sections.push("", "---", "", `## ${relative}`, "", content);
  }

  const schemaFiles = await listFiles(path.join(AUTHORING_ROOT, "schemas"));
  for (const absolutePath of schemaFiles) {
    const relative = posixPath(path.relative(AUTHORING_ROOT, absolutePath));
    const content = (await readFile(absolutePath, "utf8")).trim();
    sections.push("", "---", "", `## ${relative}`, "", "```json", content, "```");
  }

  for (const fileName of NORMATIVE_DOCS) {
    const relative = `docs/${fileName}`;
    const content = (await readFile(path.join(REPOSITORY_ROOT, relative), "utf8")).trim();
    sections.push("", "---", "", `## ${relative}`, "", content);
  }

  return Buffer.from(`${sections.join("\n")}\n`, "utf8");
}

function createStoredZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = entry.content;
    const checksum = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(FIXED_DOS_TIME, 10);
    localHeader.writeUInt16LE(FIXED_DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(FIXED_DOS_TIME, 12);
    centralHeader.writeUInt16LE(FIXED_DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralChunks.push(centralHeader, name);

    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirectory, end]);
}

async function buildSourceEntries(platform = null) {
  const sourceFiles = await listFiles(AUTHORING_ROOT);
  const entries = [];

  for (const absolutePath of sourceFiles) {
    const relative = posixPath(path.relative(AUTHORING_ROOT, absolutePath));
    if (relative.startsWith("platforms/")) {
      const isSharedSource = relative === "platforms/SOURCES.md";
      const isSelectedPlatform = platform && relative.startsWith(`platforms/${platform}/`);
      if (!isSharedSource && !isSelectedPlatform) continue;
    }
    entries.push({
      name: `${ARCHIVE_ROOT}/${relative}`,
      content: await readFile(absolutePath)
    });
  }

  entries.push({
    name: `${ARCHIVE_ROOT}/LICENSE.md`,
    content: await readFile(path.join(REPOSITORY_ROOT, "LICENSE.md"))
  });

  for (const fileName of DISTRIBUTED_DOCS) {
    entries.push({
      name: `${ARCHIVE_ROOT}/docs/${fileName}`,
      content: await readFile(path.join(REPOSITORY_ROOT, "docs", fileName))
    });
  }

  if (platform === "chatgpt") {
    entries.push({
      name: `${ARCHIVE_ROOT}/platforms/chatgpt/KNOWLEDGE.md`,
      content: await buildChatGptKnowledge()
    });
    entries.push({
      name: `${ARCHIVE_ROOT}/platforms/chatgpt/prepareChatGptAction.ps1`,
      content: await readFile(path.join(REPOSITORY_ROOT, "scripts", "prepareChatGptAction.ps1"))
    });
  }

  if (platform === "chatgpt") {
    for (const openApi of CHATGPT_OPENAPI_PATHS) {
      if (!await pathExists(openApi.absolutePath)) continue;
      entries.push({
        name: `${ARCHIVE_ROOT}/docs/openapi/${openApi.fileName}`,
        content: await readFile(openApi.absolutePath)
      });
    }
  } else if (platform === "microsoft-365" && await pathExists(COPILOT_OPENAPI_PATH)) {
    entries.push({
      name: `${ARCHIVE_ROOT}/docs/openapi/aralearn-authoring-api-copilot-v2.json`,
      content: await readFile(COPILOT_OPENAPI_PATH)
    });
  } else if (await pathExists(OPENAPI_PATH)) {
    const openApi = await readFile(OPENAPI_PATH);
    entries.push({
      name: `${ARCHIVE_ROOT}/docs/openapi/aralearn-authoring-api.yaml`,
      content: openApi
    });
  }

  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  return entries;
}

async function buildArchive(name, platform = null) {
  const entries = await buildSourceEntries(platform);
  const archive = createStoredZip(entries);
  const fileName = `aralearn-authoring-${name}.zip`;
  await writeFile(path.join(OUTPUT_ROOT, fileName), archive);
  return {
    file: fileName,
    platform,
    bytes: archive.length,
    sha256: sha256(archive),
    files: entries.map((entry) => ({
      path: entry.name,
      bytes: entry.content.length,
      sha256: sha256(entry.content)
    }))
  };
}

await mkdir(OUTPUT_ROOT, { recursive: true });
for (const fileName of [
  "aralearn-authoring-core.zip",
  ...PLATFORMS.map((platform) => `aralearn-authoring-${platform}.zip`),
  "manifest.json",
  "SHA256SUMS.txt"
]) {
  await rm(path.join(OUTPUT_ROOT, fileName), { force: true });
}

const archives = [await buildArchive("core")];
for (const platform of PLATFORMS) {
  archives.push(await buildArchive(platform, platform));
}

const manifest = {
  artifact: "aralearn.authoring-packages",
  version: 1,
  deterministicTimestamp: "1980-01-01T00:00:00.000Z",
  openapiIncluded: await pathExists(OPENAPI_PATH),
  copilotOpenapiIncluded: await pathExists(COPILOT_OPENAPI_PATH),
  archives
};

await writeFile(
  path.join(OUTPUT_ROOT, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

const sums = archives
  .map((archive) => `${archive.sha256}  ${archive.file}`)
  .join("\n");
await writeFile(path.join(OUTPUT_ROOT, "SHA256SUMS.txt"), `${sums}\n`, "utf8");

console.log(`Pacotes de autoria gerados em ${path.relative(REPOSITORY_ROOT, OUTPUT_ROOT)}.`);
if (!manifest.openapiIncluded) {
  console.warn("A especificação OpenAPI ainda não existe e não foi incluída nos pacotes.");
}
