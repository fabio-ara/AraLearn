import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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
import { courseActionOperationDefinitions, courseActionOperationName } from "../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js";

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
        retryable: { type: "boolean" },
        recovery: {
          type: "object", additionalProperties: false, required: ["requestId", "operation"],
          properties: {
            requestId: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$" },
            operation: { type: "string", minLength: 1, maxLength: 96, pattern: "^[A-Za-z][A-Za-z0-9_.:-]{0,95}$" },
            courseId: { type: "string", format: "uuid" },
            retomada: { type: "string", minLength: 1, maxLength: 480000, pattern: "^[A-Za-z0-9_-]+$",
              description: "Referência estrutural original. Reutilize na mesma tarefa com o mesmo pedido para reconciliar a tentativa." }
          }
        }
      }
    },
    nextDecision: { type: ["string", "null"], maxLength: 1000 }
  }
};
// Local artifact budgets for the complete contextual catalog (#357), measured
// after shared-schema projection. They are not OpenAPI import limits: the
// documented 100,000-character limit concerns each Actions call's payload.
// Acceptance in the actual editor remains a separate hosted release gate.
const CHATGPT_ACTION_EDITOR_CHARACTER_BUDGET = 180_000;
const CHATGPT_ACTION_ARTIFACT_CHARACTER_BUDGET = 90_000;
const STUDY_UNIT_CONTENT_REF = "#/components/schemas/HumanStudyUnitContent";

if (!resultSchema || actionTools.some(({ outputSchema }) => (
  JSON.stringify(outputSchema) !== JSON.stringify(resultSchema)
))) {
  throw new TypeError("As tarefas humanas precisam compartilhar o contrato curto de resultado.");
}
resultSchema.properties.context = {
  type: "object",
  description: "Memória para continuar as chamadas; não reproduzir no chat salvo pedido."
};

const studyUnitContentSchema = structuredClone(actionTools
  .find(({ name }) => name === "materializar_parte")
  ?.inputSchema?.properties?.unidades?.items?.properties?.conteudo);
if (!studyUnitContentSchema) {
  throw new TypeError("A materialização perdeu o contrato de conteúdo da unidade de estudo.");
}

const designParametersSchema = structuredClone(actionTools
  .find(({ name }) => name === "materializar_parte")
  .inputSchema.properties.unidades.items.properties.configuracao.properties.parametros);
const DESIGN_PARAMETERS_REF = "#/components/schemas/HumanDesignParameters";

const humanReferenceSchema = structuredClone(actionTools
  .find(({ name }) => name === "preparar_materializacao").inputSchema.properties.parte);
delete humanReferenceSchema.description;
const sourceTaskSchema = actionTools.find(({ name }) => name === "manter_fonte").inputSchema;
const sourceMetadataSchema = sourceTaskSchema.properties.metadados;
const sourceLinksSchema = actionTools.find(({ name }) => name === "materializar_parte")
  .inputSchema.properties.unidades.items.properties.fontes;
const sharedInputSchemas = {
  HumanCurricularModules: actionTools.find(({ name }) => name === "salvar_mapa_curricular").inputSchema.properties.modulos,
  HumanCurricularLessons: actionTools.find(({ name }) => name === "salvar_mapa_curricular")
    .inputSchema.properties.modulos.items.properties.licoes,
  HumanCurricularMicrosequences: actionTools.find(({ name }) => name === "salvar_mapa_curricular")
    .inputSchema.properties.modulos.items.properties.licoes.items.properties.microssequencias,
  HumanExplanations: actionTools.find(({ name }) => name === "materializar_parte").inputSchema.properties.explicacoes,
  HumanPedagogicalApplication: actionTools.find(({ name }) => name === "materializar_parte")
    .inputSchema.properties.unidades.items.properties.aplicacaoPedagogica,
  HumanCourseSelection: actionTools.find(({ name }) => name === "comparar_cursos").inputSchema.properties.esquerda,
  HumanReferences: actionTools.find(({ name }) => name === "consultar_observacoes").inputSchema.properties.unidades,
  HumanReadContinuation: actionTools.find(({ name }) => name === "preparar_revisao").inputSchema.properties.continuacao,
  HumanCourseTitle: sourceTaskSchema.properties.curso,
  HumanSourceLinks: sourceLinksSchema,
  HumanSourceOccurrences: sourceLinksSchema.items.properties.ocorrencias,
  HumanSourceNames: sourceMetadataSchema.properties.autores,
  HumanSourceRoles: sourceMetadataSchema.properties.papeisSugeridos,
  HumanBibliographicText: sourceMetadataSchema.properties.bibliografia.properties.doi,
  HumanResourceInstance: studyUnitContentSchema.properties.content.items,
  HumanParameterName: actionTools.find(({ name }) => name === "salvar_perfil")
    .inputSchema.properties.automaticos.items
};
for (const [name, value] of Object.entries(sharedInputSchemas)) {
  const schema = structuredClone(value);
  delete schema.description;
  sharedInputSchemas[name] = schema;
}
function schemaKey(value) {
  if (Array.isArray(value)) return `[${value.map(schemaKey).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${schemaKey(value[key])}`).join(",")}}`;
}
function shareHumanReferences(value) {
  if (Array.isArray(value)) return value.map(shareHumanReferences);
  if (!value || typeof value !== "object") return value;
  const { description, ...shape } = value;
  if (shape.minItems === 1) {
    const { minItems, ...optionalRoles } = shape;
    if (schemaKey(optionalRoles) === schemaKey(sharedInputSchemas.HumanSourceRoles)) {
      return { $ref: "#/components/schemas/HumanSourceRoles", minItems,
        ...(description ? { description } : {}) };
    }
  }
  if (schemaKey(shape) === schemaKey(humanReferenceSchema)) {
    return { $ref: "#/components/schemas/HumanReference", ...(description ? { description } : {}) };
  }
  for (const [name, schema] of Object.entries(sharedInputSchemas)) {
    if (schemaKey(shape) === schemaKey(schema)) {
      return { $ref: `#/components/schemas/${name}`, ...(description ? { description } : {}) };
    }
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shareHumanReferences(entry)]));
}

function inputSchemaWithSharedContent(tool) {
  const schema = structuredClone(tool.inputSchema);
  if (tool.name === "manter_fonte") {
    for (const field of ["relacao", "papeis", "ancoras", "ocorrencias"]) {
      schema.properties.vinculos.items.properties[field] = {
        $ref: `#/components/schemas/HumanSourceLinks/items/properties/${field}`
      };
    }
  }
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
  if (tool.name === "materializar_parte") {
    schema.properties.unidades.items.properties.configuracao.properties.parametros = {
      $ref: DESIGN_PARAMETERS_REF
    };
  }
  if (tool.name === "salvar_perfil") {
    schema.properties.parametros = { $ref: DESIGN_PARAMETERS_REF,
      description: schema.properties.parametros.description };
  }
  if (tool.name === "ajustar_configuracao") {
    schema.properties.parametros.properties = Object.fromEntries(
      Object.entries(schema.properties.parametros.properties).map(([field, definition]) => [
        field, { anyOf: [{ $ref: `${DESIGN_PARAMETERS_REF}/properties/${field}` }, { type: "null" }],
          description: definition.description }
      ])
    );
  }
  return shareHumanReferences(schema);
}

const groupedInputSchemas = {};
const actionOperations = courseActionOperationDefinitions(actionTools.map(tool => {
  const schema = inputSchemaWithSharedContent(tool);
  if (courseActionOperationName(tool.name) === tool.name) return { ...tool, inputSchema: schema };
  const name = `ActionArguments_${tool.name}`;
  groupedInputSchemas[name] = schema;
  return { ...tool, inputSchema: { $ref: `#/components/schemas/${name}` } };
}));
// Observed in the actual editor; a successful import remains a hosted gate.
if (actionOperations.length > 30) throw new Error("O editor de Actions aceita no máximo 30 operações.");
const paths = Object.fromEntries(actionOperations.map((tool) => [
  `/${tool.name}`,
  {
    post: {
      operationId: tool.name,
      summary: tool.title,
      description: tool.description,
      "x-openai-isConsequential": tool.annotations?.readOnlyHint !== true,
      requestBody: {
        required: true,
        content: { "application/json": { schema: tool.inputSchema } }
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
      HumanStudyUnitContent: shareHumanReferences(studyUnitContentSchema),
      HumanDesignParameters: designParametersSchema,
      HumanReference: humanReferenceSchema,
      ...groupedInputSchemas,
      ...Object.fromEntries(Object.entries(sharedInputSchemas).map(([name, schema]) => [name,
        Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, shareHumanReferences(value)]))
      ]))
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

// Intern identical schema fragments added by the contextual tasks. Constraints
// and local descriptions survive; this changes transport repetition only.
const repeated = new Map();
function collectSchemas(value) {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value) && (typeof value.type === "string" || Array.isArray(value.type) || value.anyOf || value.oneOf)) {
    const shape = { ...value }; delete shape.description;
    const key = schemaKey(shape);
    if (key.length > 90) {
      const found = repeated.get(key) ?? { count: 0, shape, name: `Shared${createHash("sha256").update(key).digest("hex").slice(0, 10)}` };
      found.count++; repeated.set(key, found);
    }
  }
  Object.values(value).forEach(collectSchemas);
}
collectSchemas(document.paths);
collectSchemas(document.components.schemas);
for (const [key, value] of repeated) if (value.count < 2) repeated.delete(key);
function internSchemas(value, root = false) {
  if (Array.isArray(value)) return value.map(item => internSchemas(item));
  if (!value || typeof value !== "object") return value;
  const { description, ...shape } = value;
  const entry = root ? null : repeated.get(schemaKey(shape));
  if (entry) return { $ref: `#/components/schemas/${entry.name}`, ...(description ? { description } : {}) };
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, internSchemas(item)]));
}
for (const path of Object.values(document.paths)) {
  const input = path.post.requestBody.content["application/json"];
  input.schema = internSchemas(input.schema, true);
}
for (const [name, schema] of Object.entries(document.components.schemas)) document.components.schemas[name] = internSchemas(schema, true);
for (const entry of repeated.values()) document.components.schemas[entry.name] = internSchemas(entry.shape, true);
// A shared parent can make a child definition redundant; omit only generated
// definitions with no references after interning, never a capability or field.
let removed;
do {
  removed = false;
  const all = JSON.stringify(document);
  for (const entry of repeated.values()) if (Object.hasOwn(document.components.schemas, entry.name) &&
      !all.includes(`"$ref":"#/components/schemas/${entry.name}"`)) {
    delete document.components.schemas[entry.name]; removed = true;
  }
} while (removed);
const editorProjectionLength = JSON.stringify(document, null, 2).length;
if (process.argv.includes("--measure")) {
  console.log(JSON.stringify({ taskCount: actionTools.length, operationCount: actionOperations.length,
    minified: JSON.stringify(document).length, editor: editorProjectionLength,
    paths: Object.entries(document.paths).map(([name, value]) => ({ name, size: JSON.stringify(value, null, 2).length }))
      .sort((a, b) => b.size - a.size).slice(0, 10),
    schemas: Object.entries(document.components.schemas).map(([name, value]) => ({ name, size: JSON.stringify(value, null, 2).length }))
      .sort((a, b) => b.size - a.size).slice(0, 10) }, null, 2));
}
if (editorProjectionLength >= CHATGPT_ACTION_EDITOR_CHARACTER_BUDGET) {
  throw new Error(
    `O OpenAPI de Actions ocupa ${editorProjectionLength} caracteres no editor; ` +
    `o orçamento é menor que ${CHATGPT_ACTION_EDITOR_CHARACTER_BUDGET}.`
  );
}
const output = `${JSON.stringify(document)}\n`;
if (output.length >= CHATGPT_ACTION_ARTIFACT_CHARACTER_BUDGET) {
  throw new Error(`O catálogo minificado ocupa ${output.length} caracteres; orçamento local ${CHATGPT_ACTION_ARTIFACT_CHARACTER_BUDGET}.`);
}
if (process.argv.includes("--check")) {
  const current = await fs.readFile(target, "utf8").catch(() => "");
  if (current.replaceAll("\r\n", "\n") !== output) {
    throw new Error("O OpenAPI de Actions precisa ser regenerado.");
  }
} else {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, output, "utf8");
}
