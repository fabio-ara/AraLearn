import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
  AUTHORING_CONVERSATION_SCHEMA,
  AUTHORING_PROTOCOL_V1_TOOLS
} from "../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
} from "../supabase/functions/_shared/aralearn-authoring/authoringActionProjectionV1.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS
} from "../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  AUTHORING_CONVERSATIONAL_PROJECTION_HASH,
  AUTHORING_CONVERSATIONAL_PROJECTION_ID,
  AUTHORING_CONVERSATIONAL_PROJECTION_VERSION
} from "../supabase/functions/_shared/aralearn-authoring/conversationalPdfSourceProjection.js";
import {
  actionLiteralSchema,
  forChatGptActionImporter,
  forChatGptActionDocumentation,
  projectChatGptActionTransportTools,
  projectAuthoringProtocolToolsForActions
} from "./projectChatGptActionSchemas.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8")
);
const target = path.join(
  root,
  "docs",
  "downloads",
  "aralearn-chatgpt-action-openapi.yaml"
);
const baseUrl =
  "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-action";
const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "requestId", "data", "conversation"],
  properties: {
    ok: actionLiteralSchema(true),
    requestId: { type: ["string", "null"] },
    data: {},
    conversation: { $ref: "#/components/schemas/ConversationProjection" }
  }
};
const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "requestId", "error", "conversation"],
  properties: {
    ok: actionLiteralSchema(false),
    requestId: { type: ["string", "null"] },
    error: { type: "object" },
    conversation: { $ref: "#/components/schemas/ConversationProjection" }
  }
};
const CHATGPT_ACTION_INPUT_DESCRIPTIONS = {
  lerCurso:
    "Escolha uma variante de view e envie somente os campos declarados nela. Use paginação apenas quando a resposta anterior devolver cursor. Preserve metadados técnicos internamente e converse em linguagem de domínio.",
  alterarCurso:
    "Escolha uma variante de operation, use silenciosamente os controles lidos e envie somente o comando compatível que o schema expõe. Confirme efeitos pedagógicos, não o payload.",
  incorporarPdfComoFonte:
    "Use o único PDF anexado pela pessoa como Fonte persistente do Curso quando a intenção estiver clara. O ChatGPT fornece a referência temporária em openaiFileIdRefs; converse sobre o efeito no Curso, não sobre IDs nem URLs."
};
const CHATGPT_ACTION_EDITOR_CHARACTER_BUDGET = 190_000;
const ACTION_INPUT_COMPONENT_PROPERTIES = Object.freeze({
  lerCurso: Object.freeze(["cursor", "scope"]),
  alterarCurso: Object.freeze([
    "planCommand",
    "designCommand",
    "sourceCommand",
    "annotationCommand",
    "auditCommand",
    "variantCommand",
    "materializationCommand"
  ]),
  incorporarPdfComoFonte: Object.freeze(["sourceIntent"]),
  add_plan_item: Object.freeze(["planCommand"]),
  update_plan_item: Object.freeze(["planCommand"]),
  add_part: Object.freeze(["planCommand"])
});
const actionTools = projectChatGptActionTransportTools(
  projectAuthoringProtocolToolsForActions(AUTHORING_PROTOCOL_V1_TOOLS),
  AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
);
const actionPathByOperationId = new Map(
  AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS.map(({ operationId, path }) => [
    operationId,
    path
  ])
);
const actionComponentSchemas = {};
const actionInputSchemas = new Map();

function upperInitial(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function decodeJsonPointerToken(value) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function visitObject(value, visitor) {
  if (!value || typeof value !== "object") return;
  visitor(value);
  if (Array.isArray(value)) value.forEach((entry) => visitObject(entry, visitor));
  else Object.values(value).forEach((entry) => visitObject(entry, visitor));
}

function removeRedundantAlternativeDescriptions(value) {
  visitObject(value, (entry) => {
    if (Array.isArray(entry) || typeof entry.description !== "string") return;
    for (const keyword of ["anyOf", "oneOf"]) {
      for (const alternative of entry[keyword] || []) {
        if (alternative?.description === entry.description) delete alternative.description;
      }
    }
  });
}

function operationById(document, operationId) {
  const matches = Object.values(document.paths).map(({ post }) => post)
    .filter((operation) => operation?.operationId === operationId);
  if (matches.length !== 1) {
    throw new TypeError(`A operação OpenAPI ${operationId} precisa ser única.`);
  }
  return matches[0];
}

function hoistActionInputComponents(document) {
  for (const [operationId, propertyNames] of Object.entries(
    ACTION_INPUT_COMPONENT_PROPERTIES
  )) {
    const operation = operationById(document, operationId);
    const input = operation.requestBody?.content?.["application/json"]?.schema;
    if (input?.type !== "object" || !input.properties) {
      throw new TypeError(
        `A raiz de ${operationId} precisa continuar inline para o importador de Actions.`
      );
    }
    for (const propertyName of propertyNames) {
      const propertySchema = input.properties[propertyName];
      if (!propertySchema) {
        throw new TypeError(`A operação ${operationId} perdeu ${propertyName}.`);
      }
      const componentName = `${upperInitial(operationId)}${upperInitial(propertyName)}`;
      if (Object.hasOwn(document.components.schemas, componentName)) {
        throw new TypeError(`O componente OpenAPI ${componentName} está duplicado.`);
      }
      document.components.schemas[componentName] = propertySchema;
      input.properties[propertyName] = {
        $ref: `#/components/schemas/${componentName}`
      };
    }
  }
}

function deduplicateActionComponentSchemas(document) {
  const canonicalBySchema = new Map();
  const aliases = new Map();
  for (const [name, schema] of Object.entries(document.components.schemas)) {
    const identity = JSON.stringify(schema);
    const canonical = canonicalBySchema.get(identity);
    if (canonical) aliases.set(name, canonical);
    else canonicalBySchema.set(identity, name);
  }
  if (!aliases.size) return;
  visitObject(document, (entry) => {
    if (Array.isArray(entry) || typeof entry.$ref !== "string") return;
    for (const [alias, canonical] of aliases) {
      const prefix = `#/components/schemas/${alias}`;
      if (entry.$ref === prefix || entry.$ref.startsWith(`${prefix}/`)) {
        entry.$ref = `#/components/schemas/${canonical}${entry.$ref.slice(prefix.length)}`;
      }
    }
  });
  for (const alias of aliases.keys()) delete document.components.schemas[alias];
}

function compactChatGptActionDocument(document) {
  // O importador exige type/properties na raiz do requestBody. Somente filhos
  // volumosos são movidos para components.schemas.
  hoistActionInputComponents(document);
  removeRedundantAlternativeDescriptions(document);
  deduplicateActionComponentSchemas(document);
}

function hoistActionSchemaDefinitions(tool) {
  const documented = forChatGptActionDocumentation(
    forChatGptActionImporter(tool.inputSchema)
  );
  const definitions = documented.$defs || {};
  const componentNames = Object.fromEntries(Object.keys(definitions).map((definitionName) => [
    definitionName,
    `${upperInitial(tool.name)}${upperInitial(definitionName)}`
  ]));
  const rewrite = (value, path) => {
    if (Array.isArray(value)) {
      return value.map((entry, index) => rewrite(entry, `${path}.${index}`));
    }
    if (!value || typeof value !== "object") return value;
    if (Object.hasOwn(value, "$defs")) {
      throw new TypeError(`A projeção OpenAPI contém $defs aninhado em ${path}.`);
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      if (key !== "$ref" || typeof entry !== "string" ||
          !entry.startsWith("#/$defs/")) {
        return [key, rewrite(entry, `${path}.${key}`)];
      }
      const tokens = entry.slice("#/$defs/".length).split("/");
      const definitionName = decodeJsonPointerToken(tokens.shift());
      const componentName = componentNames[definitionName];
      if (!componentName) {
        throw new TypeError(`A referência ${entry} em ${path} não possui definição local.`);
      }
      const suffix = tokens.length ? `/${tokens.join("/")}` : "";
      return [key, `#/components/schemas/${componentName}${suffix}`];
    }));
  };
  const schemaWithoutDefinitions = { ...documented };
  delete schemaWithoutDefinitions.$defs;
  return {
    inputSchema: rewrite(schemaWithoutDefinitions, tool.name),
    components: Object.fromEntries(Object.entries(definitions).map(([name, schema]) => [
      componentNames[name],
      rewrite(schema, `${tool.name}.$defs.${name}`)
    ]))
  };
}

for (const tool of actionTools) {
  const projected = hoistActionSchemaDefinitions(tool);
  actionInputSchemas.set(tool.name, projected.inputSchema);
  for (const [name, schema] of Object.entries(projected.components)) {
    if (Object.hasOwn(actionComponentSchemas, name) ||
        ["SuccessResponse", "ErrorResponse"].includes(name)) {
      throw new TypeError(`O componente OpenAPI ${name} está duplicado.`);
    }
    actionComponentSchemas[name] = schema;
  }
}
const paths = Object.fromEntries(actionTools.map((tool) => [
  actionPathByOperationId.get(tool.name) || `/${tool.name}`,
  {
    post: {
      operationId: tool.name,
      summary: tool.title,
      description: forChatGptActionDocumentation(tool.description),
      "x-openai-isConsequential": tool.annotations?.destructiveHint === true,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              ...actionInputSchemas.get(tool.name),
              ...(CHATGPT_ACTION_INPUT_DESCRIPTIONS[tool.name]
                ? { description: CHATGPT_ACTION_INPUT_DESCRIPTIONS[tool.name] }
                : {})
            }
          }
        }
      },
      responses: {
        "200": { $ref: "#/components/responses/Success" },
        default: { $ref: "#/components/responses/Error" }
      }
    }
  }
]));
const document = {
  openapi: "3.1.0",
  info: {
    title: "AraLearn — Autoria de Cursos",
    version: packageMetadata.version,
    "x-aralearn-protocol": AUTHORING_PROTOCOL_ID,
    "x-aralearn-protocol-schema-version": AUTHORING_PROTOCOL_SCHEMA_VERSION,
    "x-aralearn-contract-fingerprint": AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
    "x-aralearn-conversational-projection": AUTHORING_CONVERSATIONAL_PROJECTION_ID,
    "x-aralearn-conversational-projection-version":
      AUTHORING_CONVERSATIONAL_PROJECTION_VERSION,
    "x-aralearn-conversational-projection-fingerprint":
      AUTHORING_CONVERSATIONAL_PROJECTION_HASH,
    description: [
      "Permite que um GPT personalizado opere os Cursos próprios da pessoa conectada pelos contratos correntes do AraLearn.",
      COURSE_AUTHORING_SERVER_INSTRUCTIONS
    ].join("\n\n")
  },
  servers: [{ url: baseUrl }],
  security: [{ AraLearnOAuth: ["openid", "email"] }],
  paths,
  components: {
    schemas: {
      ...actionComponentSchemas,
      ConversationProjection: AUTHORING_CONVERSATION_SCHEMA,
      SuccessResponse: responseSchema,
      ErrorResponse: errorSchema
    },
    responses: {
      Success: {
        description: "Operação concluída.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SuccessResponse" }
          }
        }
      },
      Error: {
        description: "A operação não pôde ser concluída.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" }
          }
        }
      }
    },
    securitySchemes: {
      AraLearnOAuth: {
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: `${baseUrl}/oauth/authorize`,
            tokenUrl: `${baseUrl}/oauth/token`,
            scopes: {
              openid: "Identidade AraLearn.",
              email: "Conta AraLearn."
            }
          }
        }
      }
    }
  }
};
compactChatGptActionDocument(document);
// JSON é OpenAPI 3.1 válido e também YAML 1.2 válido. A projeção Action-safe
// compila as condicionais públicas em variantes sem alterar o protocolo v1.
const editorProjectionLength = JSON.stringify(document, null, 2).length;
if (editorProjectionLength >= CHATGPT_ACTION_EDITOR_CHARACTER_BUDGET) {
  throw new Error(
    `O OpenAPI de Actions ocupa ${editorProjectionLength} caracteres no editor; ` +
    `o orçamento é menor que ${CHATGPT_ACTION_EDITOR_CHARACTER_BUDGET}.`
  );
}
const output = `${JSON.stringify(document)}\n`;
if (process.argv.includes("--check")) {
  const current = await fs.readFile(target, "utf8").catch(() => "");
  if (current.replaceAll("\r\n", "\n") !== output) {
    throw new Error("O OpenAPI de Actions precisa ser regenerado.");
  }
} else {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, output, "utf8");
}
