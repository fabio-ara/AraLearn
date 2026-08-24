import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COURSE_MCP_TOOLS
} from "../supabase/functions/_shared/aralearn-authoring/courseMcpTools.js";

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
    ok: { const: true },
    requestId: { type: ["string", "null"] },
    data: {}
  }
};
const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "requestId", "error"],
  properties: {
    ok: { const: false },
    requestId: { type: ["string", "null"] },
    error: { type: "object" }
  }
};
const paths = Object.fromEntries(COURSE_MCP_TOOLS.map((tool) => [
  `/${tool.name}`,
  {
    post: {
      operationId: tool.name,
      summary: tool.title,
      description: tool.description,
      "x-openai-isConsequential": tool.annotations?.destructiveHint === true,
      security: [{ AraLearnOAuth: ["openid", "email"] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: tool.inputSchema } }
      },
      responses: Object.fromEntries([
        ["200", {
          description: "Operação concluída.",
          content: { "application/json": { schema: responseSchema } }
        }],
        ...[400, 401, 403, 404, 409, 413, 415, 422, 429].map((status) => [
          String(status),
          {
            description: "A operação não pôde ser concluída.",
            content: { "application/json": { schema: errorSchema } }
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
    description:
      "Permite que um GPT personalizado opere os Cursos próprios da pessoa conectada pelos contratos correntes do AraLearn."
  },
  servers: [{ url: baseUrl }],
  paths,
  components: {
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
// JSON é OpenAPI 3.1 válido e também YAML 1.2 válido. A forma compacta mantém
// os cinco contratos completos dentro do orçamento de importação de Actions.
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
