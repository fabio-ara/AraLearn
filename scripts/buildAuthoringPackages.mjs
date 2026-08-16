import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CST as YamlCst,
  Document as YamlDocument,
  Parser as YamlParser
} from "yaml";
import { AUTHORING_WORKSPACE_MCP_TOOLS } from "../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..");
const AUTHORING_ROOT = path.join(REPOSITORY_ROOT, "authoring");
const OUTPUT_ROOT = path.join(REPOSITORY_ROOT, "docs", "downloads", "authoring");
const DESIGN_SCHEMA_SYNC_SCRIPT = path.join(
  SCRIPT_DIR,
  "syncInstructionalDesignSchemas.mjs"
);
const PUBLIC_SUPABASE_URL = "https://jrfkphuhcseqmratijjr.supabase.co";
const NORMATIVE_DOCS = ["aralearn-contract.md", "recursos-de-card.md"];
const DISTRIBUTED_DOCS = [
  ...NORMATIVE_DOCS,
  "autoria-mcp.md",
  "criar-cursos-pelo-chat.md",
  "desenho-instrucional-parametrizado.md",
  "fluxos-prompts-e-contratos.md",
  "persistencia-relacional.md",
  "fundamentacao-pedagogica-dos-resources.md",
  "workspaces-educacionais.md"
];
const CHATGPT_CORE_KNOWLEDGE_SOURCES = [
  "core/workflow.md",
  "core/editorial-cycle.md",
  "core/states.md",
  "core/quality.md",
  "core/sources.md",
  "core/safety.md",
  "knowledge/instructional-analysis.md",
  "knowledge/semantic-granularity.md",
  "knowledge/explanatory-elaboration.md",
  "knowledge/evidence-and-practice.md",
  "knowledge/complex-professional-task.md",
  "knowledge/parameter-resolution.md",
  "knowledge/design-conformance-audit.md",
  "knowledge/packages.md",
  "knowledge/semantic-audit.md",
  "knowledge/term-ledger.md",
  "knowledge/continuity.md",
  "knowledge/publication.md"
];
const CHATGPT_RESOURCE_KNOWLEDGE_SOURCES = [
  "knowledge/resource-set-discovery.md",
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
    introduction: "Fluxo, análise, resolução, qualidade, segurança e contratos estruturais da autoria. Recupere somente os chunks pertinentes ao passo corrente; schemas completos permanecem no MCP e são consultados sob demanda.",
    sources: CHATGPT_CORE_KNOWLEDGE_SOURCES,
    schemas: CHATGPT_CORE_SCHEMAS,
    docs: ["aralearn-contract.md"]
  }),
  resources: Object.freeze({
    title: "Conhecimento didático dos resources do AraLearn",
    introduction: "Critérios para resolver ResourceSet, descobrir e combinar resources. Na única consultarBibliotecaDeResources, use o snapshot confiável, percorra explore, search, inspect e contracts e valide cada composição antes de salvá-la.",
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
const REPRESENTATION_SELECTION_COMPONENT_NAME = "RepresentationSelection";
const REPRESENTATION_SELECTION_COMPONENT_REFERENCE =
  `#/components/schemas/${REPRESENTATION_SELECTION_COMPONENT_NAME}`;
const PEDAGOGICAL_DIAGNOSIS_COMPONENT_NAME = "PedagogicalDiagnosis";
const PEDAGOGICAL_DIAGNOSIS_COMPONENT_REFERENCE =
  `#/components/schemas/${PEDAGOGICAL_DIAGNOSIS_COMPONENT_NAME}`;
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

function replaceSharedSchemaWithReference(value, sharedSchema, reference) {
  let replacements = 0;

  const visit = (current) => {
    if (Array.isArray(current)) {
      current.forEach((child, index) => {
        if (child === sharedSchema) {
          current[index] = { $ref: reference };
          replacements += 1;
        } else {
          visit(child);
        }
      });
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (child === sharedSchema) {
        current[key] = { $ref: reference };
        replacements += 1;
      } else {
        visit(child);
      }
    }
  };

  visit(value);
  return replacements;
}

function extractContinuityComponent({
  inputSchemas,
  propertyName,
  reference,
  label
}) {
  const continuityInput = inputSchemas.InputGerirContinuidadeDaAutoria;
  const componentSchema = continuityInput?.properties?.[propertyName];
  if (!componentSchema || typeof componentSchema !== "object") {
    throw new Error(`O input de continuidade não expõe ${label}.`);
  }
  const replacements = replaceSharedSchemaWithReference(
    inputSchemas,
    componentSchema,
    reference
  );
  if (replacements < 2) {
    throw new Error(
      `${label} deixou de compartilhar o contrato canônico esperado.`
    );
  }
  return componentSchema;
}

function compactYamlFlowCollectionSpacing(source) {
  const documents = [...new YamlParser().parse(source)];
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index > 0; index -= 1) {
        if (value[index]?.type === "space" && value[index - 1]?.type === "comma") {
          value.splice(index, 1);
        }
      }
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    Object.values(value).forEach(visit);
  };
  documents.forEach(visit);
  return documents.map((document) => YamlCst.stringify(document)).join("");
}

function compactActionDescription(value, maximum = 28) {
  const description = String(value || "").trim();
  const firstClause = description.split(/(?<=[.!?;])\s|,\s/u, 1)[0].trim();
  if (firstClause.length <= maximum) return firstClause;
  const prefix = firstClause.slice(0, maximum - 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > maximum / 2 ? boundary : -1).trimEnd()}.`;
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
        description: "Resultado confirmado; reutilize ids, revisão e hashes.",
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
    return structuralContentWrites.has(definition.name)
      ? "Conteúdo validado; não implica aprovação pedagógica."
      : definition.annotations?.readOnlyHint
        ? "Leitura concluída."
        : "Operação concluída.";
  };
  const inputSchemas = Object.fromEntries(
    AUTHORING_WORKSPACE_MCP_TOOLS.map((definition) => [
      inputComponentName(definition.name),
      structuredClone(definition.inputSchema)
    ])
  );
  const representationSelectionSchema = extractContinuityComponent({
    inputSchemas,
    propertyName: "representationSelection",
    reference: REPRESENTATION_SELECTION_COMPONENT_REFERENCE,
    label: "representationSelection"
  });
  const pedagogicalDiagnosisSchema = extractContinuityComponent({
    inputSchemas,
    propertyName: "pedagogicalDiagnosis",
    reference: PEDAGOGICAL_DIAGNOSIS_COMPONENT_REFERENCE,
    label: "pedagogicalDiagnosis"
  });
  const paths = Object.fromEntries(
    AUTHORING_WORKSPACE_MCP_TOOLS.map((definition) => [
      `/${definition.name}`,
      {
        post: {
          operationId: definition.name,
          summary: definition.title,
          description: compactActionDescription(definition.description),
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
      version: "5.0.0",
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
        [REPRESENTATION_SELECTION_COMPONENT_NAME]: representationSelectionSchema,
        [PEDAGOGICAL_DIAGNOSIS_COMPONENT_NAME]: pedagogicalDiagnosisSchema,
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
  const serialized = yamlDocument.toString({
    lineWidth: 0,
    indent: 1,
    flowCollectionPadding: false
  });
  return Buffer.from(compactYamlFlowCollectionSpacing(serialized), "utf8");
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

execFileSync(process.execPath, [DESIGN_SCHEMA_SYNC_SCRIPT, "--check"], {
  cwd: REPOSITORY_ROOT,
  stdio: "inherit"
});

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
