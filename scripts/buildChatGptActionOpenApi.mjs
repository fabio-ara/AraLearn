import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
  AUTHORING_PROTOCOL_V1_TOOLS
} from "../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
} from "../supabase/functions/_shared/aralearn-authoring/authoringActionProjectionV1.js";
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
  required: ["ok", "requestId", "data"],
  properties: {
    ok: actionLiteralSchema(true),
    requestId: { type: ["string", "null"] },
    data: {}
  }
};
const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "requestId", "error"],
  properties: {
    ok: actionLiteralSchema(false),
    requestId: { type: ["string", "null"] },
    error: { type: "object" }
  }
};
const CHATGPT_ACTION_INPUT_DESCRIPTIONS = {
  lerCurso:
    "Escolha uma variante de view e envie somente os campos declarados nela. Use paginação apenas quando a resposta anterior devolver cursor.",
  alterarCurso:
    "Escolha uma variante de operation, preserve os controles otimistas lidos e envie somente o comando compatível que o schema expõe."
};
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
      security: [{ AraLearnOAuth: ["openid", "email"] }],
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
      responses: Object.fromEntries([
        ["200", {
          description: "Operação concluída.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SuccessResponse" }
            }
          }
        }],
        ...[400, 401, 403, 404, 409, 413, 415, 422, 429].map((status) => [
          String(status),
          {
            description: "A operação não pôde ser concluída.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        ])
      ])
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
    description:
      "Permite que um GPT personalizado opere os Cursos próprios da pessoa conectada pelos contratos correntes do AraLearn."
  },
  servers: [{ url: baseUrl }],
  paths,
  components: {
    schemas: {
      ...actionComponentSchemas,
      SuccessResponse: responseSchema,
      ErrorResponse: errorSchema
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
// JSON é OpenAPI 3.1 válido e também YAML 1.2 válido. A projeção Action-safe
// compila as condicionais públicas em variantes sem alterar o protocolo v1.
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
