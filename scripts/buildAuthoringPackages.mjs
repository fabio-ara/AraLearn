import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document as YamlDocument } from "yaml";
import { AUTHORING_WORKSPACE_MCP_TOOLS } from "../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..");
const AUTHORING_ROOT = path.join(REPOSITORY_ROOT, "authoring");
const OUTPUT_ROOT = path.join(REPOSITORY_ROOT, "docs", "downloads", "authoring");
const PUBLIC_SUPABASE_URL = "https://jrfkphuhcseqmratijjr.supabase.co";
const NORMATIVE_DOCS = ["aralearn-contract.md", "recursos-de-card.md"];
const DISTRIBUTED_DOCS = [
  ...NORMATIVE_DOCS,
  "autoria-mcp.md",
  "persistencia-relacional.md",
  "fundamentacao-pedagogica-dos-resources.md"
];
const CHATGPT_CORE_KNOWLEDGE_SOURCES = [
  "core/workflow.md",
  "core/editorial-cycle.md",
  "core/states.md",
  "core/quality.md",
  "core/sources.md",
  "core/safety.md",
  "knowledge/packages.md",
  "knowledge/semantic-audit.md",
  "knowledge/term-ledger.md",
  "knowledge/continuity.md",
  "knowledge/publication.md"
];
const CHATGPT_RESOURCE_KNOWLEDGE_SOURCES = [
  "knowledge/cards-and-resources.md",
  "knowledge/domain-patterns.md"
];
const CHATGPT_CORE_SCHEMAS = [
  "catalog-review.schema.json",
  "workspace-mutation.schema.json",
  "workspace-publication.schema.json",
  "workspace-envelope.schema.json",
  "workspace-events.schema.json"
];
const CHATGPT_KNOWLEDGE_VARIANTS = Object.freeze({
  core: Object.freeze({
    title: "Conhecimento essencial de autoria do AraLearn",
    introduction: "Fluxo, qualidade, segurança e contratos estruturais do GPT de autoria. O schema completo dos cards permanece no MCP e deve ser consultado sob demanda.",
    sources: CHATGPT_CORE_KNOWLEDGE_SOURCES,
    schemas: CHATGPT_CORE_SCHEMAS,
    docs: ["aralearn-contract.md"]
  }),
  resources: Object.freeze({
    title: "Conhecimento didático dos resources do AraLearn",
    introduction: "Critérios pedagógicos para escolher e combinar resources. Use consultarRecursosDeCard antes do primeiro uso de cada resource para obter o contrato exato e um exemplo válido.",
    sources: CHATGPT_RESOURCE_KNOWLEDGE_SOURCES,
    schemas: [],
    docs: ["recursos-de-card.md"]
  })
});
const ARCHIVE_ROOT = "aralearn-authoring";
const REPOSITORY_BLOB_ROOT = "https://github.com/fabio-ara/AraLearn/blob/main";
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

function withAbsoluteRepositoryLinks(content, sourceRelativePath) {
  return content.replace(
    /\]\((?!https?:\/\/|mailto:|#)([^)\s]+)(\s+"[^"]*")?\)/gu,
    (match, target, title = "") => {
      const [targetPath, anchor = ""] = target.split("#", 2);
      const resolved = path.posix.normalize(path.posix.join(
        path.posix.dirname(sourceRelativePath),
        targetPath
      ));
      if (resolved.startsWith("../")) return match;
      const suffix = anchor ? `#${anchor}` : "";
      return `](${encodeURI(`${REPOSITORY_BLOB_ROOT}/${resolved}${suffix}`)}${title})`;
    }
  );
}

function unwrapKnowledgeMarkdown(content) {
  const lines = String(content || "").split(/\r?\n/gu);
  const output = [];
  let paragraph = [];
  let inFence = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(paragraph.join(" ").replace(/[\t ]+/gu, " ").trim());
    paragraph = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/u.test(trimmed)) {
      flushParagraph();
      output.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      output.push("");
      continue;
    }
    const isListItem = /^(?:[-*+] |\d+\. )/u.test(trimmed);
    const isStructural = /^(?:#{1,6} |>|\|)|^(?:---|\*\*\*|___)$/u.test(trimmed);
    if (isStructural || isListItem) {
      flushParagraph();
      if (isListItem) {
        paragraph.push(trimmed);
      } else {
        output.push(line);
      }
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  return output.join("\n").replace(/\n{3,}/gu, "\n\n");
}

async function buildChatGptKnowledge(variantName) {
  const variant = CHATGPT_KNOWLEDGE_VARIANTS[variantName];
  if (!variant) throw new Error(`Variante de conhecimento desconhecida: ${variantName}.`);
  const sections = [
    `# ${variant.title}`,
    "",
    variant.introduction
  ];

  for (const relative of variant.sources) {
    const sourceRelativePath = `authoring/${relative}`;
    const content = unwrapKnowledgeMarkdown(withAbsoluteRepositoryLinks(
      (await readFile(path.join(AUTHORING_ROOT, relative), "utf8")).trim(),
      sourceRelativePath
    ));
    sections.push("", "---", "", `## ${relative}`, "", content);
  }

  for (const fileName of variant.schemas) {
    const relative = `schemas/${fileName}`;
    const absolutePath = path.join(AUTHORING_ROOT, relative);
    const content = (await readFile(absolutePath, "utf8"))
      .replace(/\r\n?/gu, "\n")
      .trim();
    sections.push("", "---", "", `## ${relative}`, "", "```json", content, "```");
  }

  for (const fileName of variant.docs) {
    const relative = `docs/${fileName}`;
    const content = unwrapKnowledgeMarkdown(withAbsoluteRepositoryLinks(
      (await readFile(path.join(REPOSITORY_ROOT, relative), "utf8")).trim(),
      relative
    ));
    sections.push("", "---", "", `## ${relative}`, "", content);
  }

  return Buffer.from(`${sections.join("\n")}\n`, "utf8");
}

function buildChatGptActionOpenApi() {
  const inputComponentName = (operationId) =>
    `Input${operationId.slice(0, 1).toUpperCase()}${operationId.slice(1)}`;
  const responseSchema = {
    type: "object",
    additionalProperties: false,
    required: ["ok", "requestId", "data"],
    properties: {
      ok: { const: true },
      requestId: { type: ["string", "null"] },
      data: {
        type: "object",
        additionalProperties: true,
        description: "Resultado confirmado. Reutilize os identificadores, a revisão e os hashes devolvidos nas chamadas seguintes.",
        properties: {
          workspaceId: { type: "string", format: "uuid" },
          revision: { type: "integer", minimum: 1 },
          currentRevision: { type: "integer", minimum: 1 },
          courseId: { type: "string", format: "uuid" },
          contentHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          sourceRevisionHash: {
            type: ["string", "null"],
            pattern: "^[a-f0-9]{64}$"
          },
          target: { type: "string", enum: ["private", "catalog"] },
          submissionId: { type: ["string", "null"], format: "uuid" },
          publicationSeq: { type: "integer", minimum: 0 },
          unchanged: { type: "boolean" },
          collectionId: { type: ["string", "null"], format: "uuid" },
          selectionId: { type: "string", format: "uuid" },
          status: { type: "string" },
          title: { type: "string" },
          brief: { type: "string" },
          reviewerNote: { type: ["string", "null"] },
          view: { type: "string" },
          idempotent: { type: "boolean" },
          hasMore: { type: "boolean" },
          nextCursor: { type: ["object", "null"], additionalProperties: true },
          items: {
            type: "array",
            items: { type: "object", additionalProperties: true }
          },
          publications: {
            type: "array",
            items: { type: "object", additionalProperties: true }
          },
          content: { type: "object", additionalProperties: true },
          access: { type: "object", additionalProperties: true },
          contract: { type: "string" },
          definition: { type: "object", additionalProperties: true },
          resources: {
            type: "array",
            items: { type: "object", additionalProperties: true }
          }
        }
      }
    }
  };
  const errorSchema = {
    type: "object",
    additionalProperties: false,
    required: ["ok", "requestId", "error"],
    properties: {
      ok: { const: false },
      requestId: { type: ["string", "null"] },
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message", "issues", "recovery"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          details: {
            type: "object",
            additionalProperties: true,
            properties: {
              path: { type: "string" },
              field: { type: "string" },
              errors: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    path: { type: "string" },
                    message: { type: "string" },
                    code: { type: "string" }
                  }
                }
              },
              errorCount: { type: "integer", minimum: 0 },
              truncated: { type: "boolean" }
            }
          },
          issues: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["path", "message"],
              properties: {
                path: { type: "string" },
                message: { type: "string" },
                reason: { type: "string" },
                rule: { type: "string" },
                resource: { type: "string" }
              }
            }
          },
          recovery: {
            type: "object",
            additionalProperties: false,
            required: ["strategy", "retryable", "requestIdMode", "steps"],
            properties: {
              strategy: {
                type: "string",
                enum: [
                  "correct_and_retry",
                  "reread_and_retry",
                  "split_and_retry",
                  "repeat_identical",
                  "reconnect",
                  "stop"
                ]
              },
              retryable: { type: "boolean" },
              requestIdMode: {
                type: "string",
                enum: ["new", "same", "none"]
              },
              steps: {
                type: "array",
                minItems: 1,
                maxItems: 5,
                items: { type: "string" }
              }
            }
          }
        }
      }
    }
  };
  const errorResponse = (description) => ({
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/AraLearnActionError" }
      }
    }
  });
  const errorResponses = {
    BadRequest: errorResponse("Parâmetros inválidos."),
    AuthenticationRequired: errorResponse("Conecte a conta AraLearn."),
    Forbidden: errorResponse("Operação não autorizada para a conta."),
    Conflict: errorResponse("A revisão mudou; releia antes de repetir a intenção."),
    PayloadTooLarge: errorResponse("Use um recorte estrutural menor."),
    UnprocessableEntity: errorResponse("A solicitação não satisfaz o contrato da operação."),
    RateLimited: errorResponse("Limite temporário; repita depois com o mesmo requestId."),
    UnexpectedError: errorResponse("Falha estruturada da operação.")
  };
  const responseRef = (name) => ({ $ref: `#/components/responses/${name}` });
  const structuralContentWrites = new Set([
    "criarEstruturaNoWorkspace",
    "salvarCardsNaMicrossequencia",
    "atualizarMetadadosDaEntidade",
    "salvarCardNoWorkspace"
  ]);
  const successDescription = (definition) => {
    const fields = definition.outputSchema?.oneOf?.[0]
      ?.properties?.data?.required || [];
    const outcome = structuralContentWrites.has(definition.name)
      ? "Conteúdo validado; não implica aprovação pedagógica."
      : definition.annotations?.readOnlyHint
        ? "Leitura concluída."
        : "Operação concluída.";
    return fields.length
      ? `${outcome} Campos: ${fields.join(", ")}.`
      : `${outcome} Resultado em data.`;
  };
  const inputSchemas = Object.fromEntries(
    AUTHORING_WORKSPACE_MCP_TOOLS.map((definition) => [
      inputComponentName(definition.name),
      structuredClone(definition.inputSchema)
    ])
  );
  const paths = Object.fromEntries(
    AUTHORING_WORKSPACE_MCP_TOOLS.map((definition) => [
      `/${definition.name}`,
      {
        post: {
          operationId: definition.name,
          summary: definition.title,
          description: definition.description,
          "x-openai-isConsequential": Boolean(
            definition._meta?.["aralearn/actionConsequentialHint"]
          ),
          security: [{ AraLearnOAuth: ["openid", "email"] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${inputComponentName(definition.name)}`
                }
              }
            }
          },
          responses: {
            "200": {
              description: successDescription(definition),
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AraLearnActionSuccess" }
                }
              }
            },
            "400": responseRef("BadRequest"),
            "401": responseRef("AuthenticationRequired"),
            "403": responseRef("Forbidden"),
            "409": responseRef("Conflict"),
            "413": responseRef("PayloadTooLarge"),
            "422": responseRef("UnprocessableEntity"),
            "429": responseRef("RateLimited"),
            default: responseRef("UnexpectedError")
          }
        }
      }
    ])
  );
  const document = {
    openapi: "3.1.0",
    info: {
      title: "AraLearn — autoria de cursos",
      version: "4.0.0",
      description: "Opera cursos AraLearn atomicamente."
    },
    servers: [{
      url: `${PUBLIC_SUPABASE_URL}/functions/v1/aralearn-authoring-action`
    }],
    paths,
    components: {
      schemas: {
        AraLearnActionSuccess: responseSchema,
        AraLearnActionError: errorSchema,
        ...inputSchemas
      },
      responses: errorResponses,
      securitySchemes: {
        AraLearnOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${PUBLIC_SUPABASE_URL}/functions/v1/aralearn-authoring-action/oauth/authorize`,
              tokenUrl: `${PUBLIC_SUPABASE_URL}/functions/v1/aralearn-authoring-action/oauth/token`,
              scopes: {
                openid: "Identidade.",
                email: "Conta."
              }
            }
          }
        }
      }
    }
  };
  // Os contratos continuam completos em components.schemas. Somente a
  // apresentação usa coleções flow, uma por operação/schema, para deixar
  // margem no importador da Action sem trocar o documento por JSON ilegível.
  const yamlDocument = new YamlDocument(document);
  for (const pathName of Object.keys(paths)) {
    yamlDocument.getIn(["paths", pathName, "post"], true).flow = true;
  }
  for (const schemaName of Object.keys(document.components.schemas)) {
    yamlDocument.getIn(["components", "schemas", schemaName], true).flow = true;
  }
  return Buffer.from(yamlDocument.toString({
    lineWidth: 0,
    indent: 1,
    flowCollectionPadding: false
  }), "utf8");
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
    const source = await readFile(absolutePath, "utf8");
    const content = platform === "chatgpt" && relative.endsWith(".md")
      ? Buffer.from(`${unwrapKnowledgeMarkdown(source.trim())}\n`, "utf8")
      : Buffer.from(source, "utf8");
    entries.push({
      name: `${ARCHIVE_ROOT}/${relative}`,
      content
    });
  }

  entries.push({
    name: `${ARCHIVE_ROOT}/LICENSE.md`,
    content: await readFile(path.join(REPOSITORY_ROOT, "LICENSE.md"))
  });

  for (const fileName of DISTRIBUTED_DOCS) {
    const relative = `docs/${fileName}`;
    const content = withAbsoluteRepositoryLinks(
      await readFile(path.join(REPOSITORY_ROOT, relative), "utf8"),
      relative
    );
    entries.push({
      name: `${ARCHIVE_ROOT}/${relative}`,
      content: Buffer.from(
        platform === "chatgpt"
          ? `${unwrapKnowledgeMarkdown(content.trim())}\n`
          : content,
        "utf8"
      )
    });
  }

  if (platform === "chatgpt") {
    entries.push({
      name: `${ARCHIVE_ROOT}/platforms/chatgpt/KNOWLEDGE_CORE.md`,
      content: await buildChatGptKnowledge("core")
    });
    entries.push({
      name: `${ARCHIVE_ROOT}/platforms/chatgpt/KNOWLEDGE_RESOURCES.md`,
      content: await buildChatGptKnowledge("resources")
    });
    entries.push({
      name: `${ARCHIVE_ROOT}/platforms/chatgpt/ACTION_OPENAPI.yaml`,
      content: buildChatGptActionOpenApi()
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
  "aralearn-chatgpt-system-prompt.md",
  "aralearn-chatgpt-knowledge.md",
  "aralearn-chatgpt-knowledge-core.md",
  "aralearn-chatgpt-knowledge-resources.md",
  "aralearn-chatgpt-action-openapi.yaml",
  "manifest.json",
  "SHA256SUMS.txt"
]) {
  await rm(path.join(OUTPUT_ROOT, fileName), { force: true });
}

const standaloneFiles = [
  {
    file: "aralearn-chatgpt-system-prompt.md",
    content: Buffer.from(`${unwrapKnowledgeMarkdown((await readFile(path.join(
      AUTHORING_ROOT,
      "platforms",
      "chatgpt",
      "INSTRUCTIONS.md"
    ), "utf8")).trim())}\n`, "utf8")
  },
  {
    file: "aralearn-chatgpt-knowledge-core.md",
    content: await buildChatGptKnowledge("core")
  },
  {
    file: "aralearn-chatgpt-knowledge-resources.md",
    content: await buildChatGptKnowledge("resources")
  },
  {
    file: "aralearn-chatgpt-action-openapi.yaml",
    content: buildChatGptActionOpenApi()
  }
];
for (const standalone of standaloneFiles) {
  await writeFile(path.join(OUTPUT_ROOT, standalone.file), standalone.content);
}

const archives = [await buildArchive("core")];
for (const platform of PLATFORMS) {
  archives.push(await buildArchive(platform, platform));
}

const manifest = {
  artifact: "aralearn.authoring-packages",
  version: 1,
  deterministicTimestamp: "1980-01-01T00:00:00.000Z",
  transport: "mcp+openapi-action",
  archives,
  files: standaloneFiles.map((standalone) => ({
    file: standalone.file,
    bytes: Buffer.byteLength(standalone.content),
    sha256: sha256(standalone.content)
  }))
};

await writeFile(
  path.join(OUTPUT_ROOT, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

const sums = [...archives, ...manifest.files]
  .map((artifact) => `${artifact.sha256}  ${artifact.file}`)
  .join("\n");
await writeFile(path.join(OUTPUT_ROOT, "SHA256SUMS.txt"), `${sums}\n`, "utf8");

console.log(`Pacotes de autoria gerados em ${path.relative(REPOSITORY_ROOT, OUTPUT_ROOT)}.`);
