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
function forActionDocumentation(value) {
  if (typeof value === "string") {
    return value
      .replaceAll("cliente MCP conectado", "GPT conectado por Actions")
      .replaceAll("superfície MCP", "superfície de Actions");
  }
  if (Array.isArray(value)) return value.map(forActionDocumentation);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, forActionDocumentation(entry)])
    );
  }
  return value;
}
function forActionInputSchema(value) {
  const documented = forActionDocumentation(value);
  if (Array.isArray(documented)) return documented.map(forActionInputSchema);
  if (documented && typeof documented === "object") {
    return Object.fromEntries(
      Object.entries(documented)
        .filter(([key]) => key !== "allOf" && key !== "description")
        .map(([key, entry]) => [key, forActionInputSchema(entry)])
    );
  }
  return documented;
}
const CHATGPT_ACTION_DESCRIPTIONS = {
  lerCurso:
    "Lê uma projeção do Curso: summary, outline, instructional_plan, course_design, course_sources, anchored_annotations, audit_cycle, research, variant_comparison ou variant_comparisons. Peça só os metadados necessários; texto integral ou download temporário apenas quando indispensável.",
  alterarCurso:
    "Altera o Curso próprio. Leia antes e preserve revisão/requestId. Em set_parameter, mode automatic delega a resolução e grava valor+justificativa; explicit fixa origin author|research_condition; clear_parameter herda. O servidor valida campos de cada operação e ações consequenciais."
};
const CHATGPT_ACTION_INPUT_DESCRIPTIONS = {
  lerCurso:
    "Campos por vista: summary/outline/instructional_plan usam só courseId+view; entities/study_units exigem expectedRevision; part_materialization exige authoringPartId+materializationId e proíbe expectedRevision; course_sources exige expectedRevision+mode catalog|source|target; anchored_annotations usa inbox|target|detail (detail: annotationId+includeObservationText=true). Use paginação só onde devolvida.",
  alterarCurso:
    "commit_course_composition sempre inclui sourceAttributionApplications, mesmo vazio; entityId, parentId e position ficam no envelope do upsert, nunca em content. Em advance_part_materialization, record_step sempre inclui stepId, expectedStepVersion, status, resultFacts, entityChanges, designApplication e sourceAttributionApplication; explicite null ou lotes vazios. finish inclui status+resultFacts. record_audit e verify_finding incluem ao menos um check factual_quality, um pedagogical_quality e um editorial_quality; a dimensão estrutural é calculada pelo servidor."
};
const paths = Object.fromEntries(COURSE_MCP_TOOLS.map((tool) => [
  `/${tool.name}`,
  {
    post: {
      operationId: tool.name,
      summary: tool.title,
      description: forActionDocumentation(
        CHATGPT_ACTION_DESCRIPTIONS[tool.name] || tool.description
      ),
      "x-openai-isConsequential": tool.annotations?.destructiveHint === true,
      security: [{ AraLearnOAuth: ["openid", "email"] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              ...forActionInputSchema(tool.inputSchema),
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
    description:
      "Permite que um GPT personalizado opere os Cursos próprios da pessoa conectada pelos contratos correntes do AraLearn."
  },
  servers: [{ url: baseUrl }],
  paths,
  components: {
    schemas: {
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
// JSON é OpenAPI 3.1 válido e também YAML 1.2 válido. Condicionais mecânicas e
// descrições profundas permanecem no validador server-side; removê-las daqui
// reduz a carga simultânea do GPT sem retirar campos ou operações de produto.
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
