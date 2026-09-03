import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COURSE_HUMAN_TASK_CATALOG_METADATA,
  COURSE_HUMAN_TASKS
} from "../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS
} from "../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  projectHumanAuthoringTasksForActions
} from "./projectHumanAuthoringActions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const target = path.join(root, "docs", "downloads", "aralearn-chatgpt-action-openapi.yaml");
const baseUrl =
  "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-action";
const actionTools = projectHumanAuthoringTasksForActions(COURSE_HUMAN_TASKS);
const resultSchema = structuredClone(actionTools[0]?.outputSchema);
const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error", "nextDecision"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "retryable"],
      properties: {
        code: { type: "string", minLength: 1, maxLength: 120 },
        message: { type: "string", minLength: 1, maxLength: 1000 },
        retryable: { type: "boolean" }
      }
    },
    nextDecision: { type: ["string", "null"], maxLength: 1000 }
  }
};
const CHATGPT_ACTION_EDITOR_CHARACTER_BUDGET = 96_000;
const STUDY_UNIT_CONTENT_REF = "#/components/schemas/HumanStudyUnitContent";

if (!resultSchema || actionTools.some(({ outputSchema }) => (
  JSON.stringify(outputSchema) !== JSON.stringify(resultSchema)
))) {
  throw new TypeError("As tarefas humanas precisam compartilhar o contrato curto de resultado.");
}

const studyUnitContentSchema = structuredClone(actionTools
  .find(({ name }) => name === "materializar_parte")
  ?.inputSchema?.properties?.unidades?.items?.properties?.conteudo);
if (!studyUnitContentSchema) {
  throw new TypeError("A materialização perdeu o contrato de conteúdo da unidade de estudo.");
}

function inputSchemaWithSharedContent(tool) {
  const schema = structuredClone(tool.inputSchema);
  if (tool.name === "materializar_parte") {
    schema.properties.unidades.items.properties.conteudo = {
      $ref: STUDY_UNIT_CONTENT_REF
    };
  }
  if (tool.name === "aplicar_correcoes") {
    schema.properties.correcoes.items.properties.conteudo = {
      $ref: STUDY_UNIT_CONTENT_REF
    };
  }
  return schema;
}

const paths = Object.fromEntries(actionTools.map((tool) => [
  `/${tool.name}`,
  {
    post: {
      operationId: tool.name,
      summary: tool.title,
      description: tool.description,
      "x-openai-isConsequential": tool.annotations?.readOnlyHint !== true,
      requestBody: {
        required: true,
        content: { "application/json": { schema: inputSchemaWithSharedContent(tool) } }
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
    "x-aralearn-task-catalog": COURSE_HUMAN_TASK_CATALOG_METADATA.id,
    "x-aralearn-task-catalog-version": COURSE_HUMAN_TASK_CATALOG_METADATA.version,
    "x-aralearn-task-catalog-fingerprint": COURSE_HUMAN_TASK_CATALOG_METADATA.hash,
    description: [
      "Opera cursos privados por tarefas humanas, sem exigir controles internos do banco.",
      COURSE_AUTHORING_SERVER_INSTRUCTIONS
    ].join("\n\n")
  },
  servers: [{ url: baseUrl }],
  security: [{ AraLearnOAuth: ["openid", "email"] }],
  paths,
  components: {
    schemas: {
      HumanTaskResult: resultSchema,
      HumanTaskError: errorSchema,
      HumanStudyUnitContent: studyUnitContentSchema
    },
    responses: {
      Success: {
        description: "Resultado humano, link pertinente e uma próxima decisão.",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/HumanTaskResult" } }
        }
      },
      Error: {
        description: "Falha pública com retomada segura quando aplicável.",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/HumanTaskError" } }
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
