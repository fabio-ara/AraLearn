import { AuthoringApiError } from "./errors.js";
import {
  executeTrustedCourseWrite,
  resolveHumanCourseContext
} from "./courseHumanTaskExecutor.js";
import {
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  EXPLANATION_FORMS,
  PRACTICE_VARIATION_DIMENSIONS,
  normalizeCourseDesignCommand
} from "../aralearn/runtime/domain/courseDesignParameters.js";
import {
  COURSE_SOURCE_KINDS,
  COURSE_SOURCE_RELATIONS,
  COURSE_SOURCE_ROLES,
  COURSE_BIBLIOGRAPHY_STYLES,
  createEmptyCourseSourceBibliographicMetadata,
  normalizeCourseSourceAttachment,
  normalizeCourseSourceCommand,
  normalizeCourseSourcePdfSourceIntent
} from "../aralearn/runtime/domain/courseSources.js";
import {
  COURSE_ANCHORED_ANNOTATION_CATEGORIES,
  normalizeCourseAnchoredAnnotationCommand
} from "../aralearn/runtime/domain/courseAnchoredAnnotations.js";
import { RESOURCE_CATALOG, RESOURCE_PACKAGE_REGISTRY } from
  "../aralearn/runtime/resources/catalog/resourceCatalog.js";
import {
  normalizeFacetText,
  RESOURCE_VOCABULARIES
} from "../aralearn/runtime/resources/catalog/vocabularies.js";
import { resolveOpenAiTemporaryPdf } from "./openAiTemporaryPdf.js";
import { resolveOpenAiTemporaryAudio } from "./openAiTemporaryAudio.js";
import { normalizeCourseMediaChange, normalizeCourseMediaCatalogItem, normalizeCourseMediaRead } from
  "../aralearn/runtime/domain/courseMedia.js";
import { materializeHumanCoursePart, HUMAN_SOURCE_ROLES, resolveHumanSourceRoles,
  resolveHumanSourceOccurrences } from "./courseHumanMaterialization.js";
import { applyHumanCourseCorrections } from "./courseHumanCorrections.js";
import { sha256Hex } from "./security.js";
import { normalizeAuthoringProfilePreferences } from "../aralearn/runtime/domain/authoringProfiles.js";

const encoder = new TextEncoder();
const READ_SCOPE = "authoring:read";
const WRITE_SCOPE = "authoring:write";
const MAX_RESULT_BYTES = 500 * 1024;
const MAX_CONTEXT_PAGES = 100;
const MCP_OAUTH_SECURITY_SCHEMES = Object.freeze([
  Object.freeze({ type: "oauth2", scopes: Object.freeze(["offline_access"]) })
]);
const SOURCE_ROLES_BY_HUMAN_NAME = HUMAN_SOURCE_ROLES;
const SOURCE_ROLE_HUMAN_NAMES = new Map(Object.entries(SOURCE_ROLES_BY_HUMAN_NAME)
  .map(([humanName, internalName]) => [internalName, humanName]));

const HUMAN_REFERENCE_SCHEMA = Object.freeze({
  oneOf: Object.freeze([
    Object.freeze({ type: "integer", minimum: 1, maximum: 1000000 }),
    Object.freeze({ type: "string", minLength: 1, maxLength: 300 })
  ])
});
const COURSE_SCHEMA = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 300,
  description: "Nome"
});
const HUMAN_REFERENCE_LIST_SCHEMA = Object.freeze({
  type: "array",
  minItems: 1,
  maxItems: 64,
  uniqueItems: true,
  items: HUMAN_REFERENCE_SCHEMA
});

function parameterValueSchema(definition, { nullable = false } = {}) {
  const value = definition.valueSchema;
  const schema = value.type === "set" ? {
    type: "array", minItems: value.minimumItems, maxItems: value.maximumItems,
    uniqueItems: true, items: { type: "string", enum: [...value.allowedValues] }
  } : value.type === "enum" ? { type: "string", enum: [...value.allowedValues] }
    : { type: value.type, minimum: value.minimum, maximum: value.maximum };
  return nullable ? { anyOf: [schema, { type: "null" }] } : schema;
}
function parametersSchema({ nullable = false } = {}) {
  return { type: "object", additionalProperties: false, minProperties: 1,
    properties: Object.fromEntries(COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => [
      definition.humanField, { ...parameterValueSchema(definition, { nullable }),
        description: `${definition.label}. ${definition.unitLabel}.` }
    ])) };
}
const PARAMETERS_SCHEMA = Object.freeze(parametersSchema({ nullable: true }));
const PARAMETER_FIELDS = Object.freeze(COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ humanField }) => humanField));
const PARAMETER_FIELD_TO_ID = Object.freeze(Object.fromEntries(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ humanField, id }) => [humanField, id])
));

const CURRICULAR_MAP_MICROSEQUENCE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze(["titulo", "objetivo", "dependencias", "cobertura"]),
  properties: Object.freeze({
    titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
    objetivo: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
    dependencias: Object.freeze({
      type: "array", maxItems: 64, uniqueItems: true,
      items: Object.freeze({ type: "string", minLength: 1, maxLength: 300 })
    }),
    cobertura: Object.freeze({
      type: "array", maxItems: 64, uniqueItems: true,
      items: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 })
    })
  })
});

const MATERIALIZATION_CONFIGURATION_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: Object.freeze(["parametros", "motivo"]),
  properties: Object.freeze({
    parametros: parametersSchema(),
    motivo: { type: "string", minLength: 1, maxLength: 1000 },
    direcaoEditorial: { type: "string", minLength: 1, maxLength: 4000 }
  })
});

const CURRICULAR_MAP_LESSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze(["titulo", "objetivo", "microssequencias"]),
  properties: Object.freeze({
    titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
    objetivo: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
    microssequencias: Object.freeze({
      type: "array", minItems: 1, maxItems: 64,
      items: CURRICULAR_MAP_MICROSEQUENCE_SCHEMA
    })
  })
});

const CURRICULAR_MAP_MODULE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze(["titulo", "objetivo", "licoes"]),
  properties: Object.freeze({
    titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
    objetivo: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
    licoes: Object.freeze({
      type: "array", minItems: 1, maxItems: 64,
      items: CURRICULAR_MAP_LESSON_SCHEMA
    })
  })
});

const SOURCE_SELECTOR_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze(["tipo"]),
  properties: Object.freeze({
    tipo: Object.freeze({
      type: "string",
      enum: Object.freeze(["paginas", "tempo", "fragmento", "trecho"])
    }),
    paginaInicial: Object.freeze({ type: "integer", minimum: 1 }),
    paginaFinal: Object.freeze({ type: "integer", minimum: 1 }),
    inicioEmMilissegundos: Object.freeze({ type: "integer", minimum: 0 }),
    fimEmMilissegundos: Object.freeze({ type: "integer", minimum: 1 }),
    fragmento: Object.freeze({ type: "string", minLength: 1, maxLength: 2048 }),
    trechoExato: Object.freeze({ type: "string", minLength: 1, maxLength: 4000 }),
    prefixo: Object.freeze({ type: ["string", "null"], maxLength: 500 }),
    sufixo: Object.freeze({ type: ["string", "null"], maxLength: 500 })
  })
});

const SOURCE_ROLES_SCHEMA = Object.freeze({
  type: "array", maxItems: COURSE_SOURCE_ROLES.length, uniqueItems: true,
  items: Object.freeze({ type: "string", enum: Object.freeze(Object.keys(HUMAN_SOURCE_ROLES)) })
});
const SOURCE_NAMES_SCHEMA = Object.freeze({
  type: "array", maxItems: 32,
  items: Object.freeze({ oneOf: Object.freeze([
    Object.freeze({ type: "object", additionalProperties: false, required: Object.freeze(["literal"]),
      properties: Object.freeze({ literal: Object.freeze({ type: "string", minLength: 1, maxLength: 500 }) }) }),
    Object.freeze({ type: "object", additionalProperties: false, required: Object.freeze(["sobrenome"]),
      properties: Object.freeze({ sobrenome: Object.freeze({ type: "string", minLength: 1, maxLength: 240 }),
        nomes: Object.freeze({ type: ["string", "null"], maxLength: 240 }) }) })
  ]) })
});
const HUMAN_BIBLIOGRAPHIC_FIELDS = Object.freeze({
  tituloDoVeiculo: "containerTitle", editora: "publisher", localDaEditora: "publisherPlace",
  volume: "volume", fasciculo: "issue", paginas: "pages", localizacaoEletronica: "articleNumber",
  doi: "doi", isbn: "isbn", issn: "issn", dataDeAcesso: "accessedDate", genero: "genre", numero: "number"
});
const SOURCE_BIBLIOGRAPHIC_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  properties: Object.freeze({
    editores: SOURCE_NAMES_SCHEMA,
    ...Object.fromEntries(Object.entries(HUMAN_BIBLIOGRAPHIC_FIELDS).map(([name, field]) => [name, Object.freeze({
      type: ["string", "null"], maxLength: ["containerTitle", "publisher"].includes(field) ? 500 : field === "accessedDate" ? 10 : 240
    })]))
  })
});
const SOURCE_OCCURRENCES_SCHEMA = Object.freeze({
  type: "array", maxItems: 16,
  items: Object.freeze({ type: "object", additionalProperties: false,
    required: Object.freeze(["lugar", "recurso", "folha", "trecho"]), properties: Object.freeze({
      lugar: Object.freeze({ type: "string", enum: Object.freeze(["conteudo", "resposta", "feedback"]) }),
      recurso: Object.freeze({ type: "integer", minimum: 1, maximum: 64 }),
      folha: Object.freeze({ type: "string", minLength: 1, maxLength: 240 }),
      trecho: Object.freeze({ type: "string", minLength: 1, maxLength: 4000 }),
      prefixo: Object.freeze({ type: ["string", "null"], maxLength: 500 }),
      sufixo: Object.freeze({ type: ["string", "null"], maxLength: 500 })
    }) })
});
const SOURCE_LINK_PROPERTIES = Object.freeze({
  relacao: Object.freeze({ type: "string", enum: COURSE_SOURCE_RELATIONS }),
  papeis: Object.freeze({ ...SOURCE_ROLES_SCHEMA, minItems: 1 }),
  ancoras: Object.freeze({ type: "array", maxItems: 8, uniqueItems: true, items: HUMAN_REFERENCE_SCHEMA }),
  ocorrencias: SOURCE_OCCURRENCES_SCHEMA
});
const SOURCE_LINKS_SCHEMA = Object.freeze({
  type: "array", maxItems: 32,
  items: Object.freeze({ type: "object", additionalProperties: false,
    required: Object.freeze(["fonte", "relacao", "papeis"]),
    properties: Object.freeze({ fonte: HUMAN_REFERENCE_SCHEMA, ...SOURCE_LINK_PROPERTIES }) })
});
const SOURCE_METADATA_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: Object.freeze({
    tipo: Object.freeze({ type: "string", enum: COURSE_SOURCE_KINDS }),
    papeisSugeridos: Object.freeze({ ...SOURCE_ROLES_SCHEMA, description: "Sugestões; os papéis de cada vínculo são explícitos." }),
    titulo: Object.freeze({ type: ["string", "null"], minLength: 1, maxLength: 300 }),
    autores: SOURCE_NAMES_SCHEMA,
    bibliografia: SOURCE_BIBLIOGRAPHIC_SCHEMA,
    modoCitacao: Object.freeze({ type: "string", enum: Object.freeze(["manual", "gerada"]) }),
    dataDePublicacao: Object.freeze({ type: ["string", "null"], maxLength: 10 }),
    identificador: Object.freeze({ type: ["string", "null"], maxLength: 240 }),
    idioma: Object.freeze({ type: ["string", "null"], maxLength: 48 }),
    citacao: Object.freeze({ type: ["string", "null"], maxLength: 2048 }),
    url: Object.freeze({ type: ["string", "null"], maxLength: 2048 }),
    edicaoOuVersao: Object.freeze({ type: ["string", "null"], maxLength: 120 }),
    disponibilidade: Object.freeze({
      type: "string", enum: Object.freeze(["aberta", "restrita", "privada", "desconhecida"])
    }),
    verificacao: Object.freeze({
      type: "string",
      enum: Object.freeze([
        "nao_verificada", "confirmada_explicitamente_pela_autoria"
      ])
    }),
    visibilidadeNoEstudo: Object.freeze({
      type: "string", enum: Object.freeze(["oculta", "citacao", "citacao_e_link"])
    })
  })
});

const COMPONENT_INSTANCE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze(["id", "package", "version", "data"]),
  properties: Object.freeze({
    id: Object.freeze({ type: "string", minLength: 1 }),
    package: Object.freeze({ type: "string", minLength: 1 }),
    version: Object.freeze({ type: "string", minLength: 1 }),
    data: Object.freeze({ type: "object" })
  })
});

const STUDY_UNIT_CONTENT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze(["title", "role", "content", "response", "feedback", "topics"]),
  properties: Object.freeze({
    title: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
    role: Object.freeze({ type: "string", enum: Object.freeze(["theory", "practice"]) }),
    content: Object.freeze({ type: "array", maxItems: 64, items: COMPONENT_INSTANCE_SCHEMA }),
    response: Object.freeze({ anyOf: Object.freeze([
      Object.freeze({ type: "null" }), COMPONENT_INSTANCE_SCHEMA
    ]) }),
    feedback: Object.freeze({ type: "array", maxItems: 64, items: COMPONENT_INSTANCE_SCHEMA }),
    topics: Object.freeze({
      type: "array", maxItems: 64, uniqueItems: true,
      items: Object.freeze({ type: "string", minLength: 1, maxLength: 300 })
    })
  }),
  allOf: Object.freeze([Object.freeze({
    if: Object.freeze({
      properties: Object.freeze({ role: Object.freeze({ const: "theory" }) })
    }),
    then: Object.freeze({
      properties: Object.freeze({
        content: Object.freeze({ minItems: 1 }),
        response: Object.freeze({ type: "null" })
      })
    }),
    else: Object.freeze({
      properties: Object.freeze({ response: Object.freeze({ not: Object.freeze({ type: "null" }) }) })
    })
  })]),
  description: "Conteúdo sem controles internos."
});

const MATERIALIZATION_UNIT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze([
    "microssequencia", "posicao", "conteudo", "configuracao", "aplicacaoPedagogica"
  ]),
  properties: Object.freeze({
    microssequencia: HUMAN_REFERENCE_SCHEMA,
    posicao: Object.freeze({ type: "integer", minimum: 1, maximum: 1000000 }),
    conteudo: STUDY_UNIT_CONTENT_SCHEMA,
    configuracao: MATERIALIZATION_CONFIGURATION_SCHEMA,
    aplicacaoPedagogica: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: Object.freeze([
        "ideiasIntroduzidas", "ideiasUtilizadas", "explicacoes", "praticas",
        "cobertura"
      ]),
      properties: Object.freeze({
        ideiasIntroduzidas: Object.freeze({
          type: "array", maxItems: 64,
          items: Object.freeze({
            oneOf: Object.freeze([
              HUMAN_REFERENCE_SCHEMA,
              Object.freeze({
                type: "object",
                additionalProperties: false,
                required: Object.freeze(["nome", "descricao"]),
                properties: Object.freeze({
                  nome: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
                  descricao: Object.freeze({ type: "string", minLength: 1, maxLength: 4000 })
                })
              })
            ])
          })
        }),
        ideiasUtilizadas: Object.freeze({
          type: "array", maxItems: 64, uniqueItems: true,
          items: HUMAN_REFERENCE_SCHEMA,
          description: "Toda ideia estabelecida mobilizada sem reexplicação nesta unidade."
        }),
        explicacoes: Object.freeze({
          type: "array", maxItems: 256,
          items: Object.freeze({
            type: "object", additionalProperties: false,
            required: Object.freeze(["ideia", "formas"]),
            properties: Object.freeze({
              ideia: HUMAN_REFERENCE_SCHEMA,
              formas: Object.freeze({
                type: "array", maxItems: EXPLANATION_FORMS.length,
                uniqueItems: true,
                items: Object.freeze({ type: "string", enum: EXPLANATION_FORMS })
              }),
              formasNaoAplicaveis: Object.freeze({
                type: "array",
                maxItems: EXPLANATION_FORMS.length,
                items: Object.freeze({
                  type: "object",
                  additionalProperties: false,
                  required: Object.freeze(["forma", "motivo"]),
                  properties: Object.freeze({
                    forma: Object.freeze({ type: "string", enum: EXPLANATION_FORMS }),
                    motivo: Object.freeze({ type: "string", minLength: 1, maxLength: 240 })
                  })
                })
              })
            }),
            anyOf: Object.freeze([
              Object.freeze({
                properties: Object.freeze({
                  formas: Object.freeze({ minItems: 1 })
                })
              }),
              Object.freeze({
                required: Object.freeze(["formasNaoAplicaveis"]),
                properties: Object.freeze({
                  formasNaoAplicaveis: Object.freeze({ minItems: 1 })
                })
              })
            ])
          })
        }),
        praticas: Object.freeze({
          type: "array", maxItems: 256,
          items: Object.freeze({
            type: "object", additionalProperties: false,
            required: Object.freeze(["requisito", "oportunidade", "dimensoesVariadas"]),
            properties: Object.freeze({
              requisito: Object.freeze({
                ...HUMAN_REFERENCE_SCHEMA,
                description: "Posição/título listado; um texto novo cria um requisito formal no repertório."
              }),
              oportunidade: Object.freeze({ type: "string", minLength: 1, maxLength: 240 }),
              dimensoesVariadas: Object.freeze({
                type: "array", maxItems: PRACTICE_VARIATION_DIMENSIONS.length,
                uniqueItems: true,
                items: Object.freeze({ type: "string", enum: PRACTICE_VARIATION_DIMENSIONS })
              })
            })
          })
        }),
        cobertura: Object.freeze({
          type: "array", maxItems: 64, uniqueItems: true,
          items: HUMAN_REFERENCE_SCHEMA,
          description: "Itens obrigatórios do recorte efetivamente desenvolvidos nesta unidade."
        })
      })
    }),
    fontes: SOURCE_LINKS_SCHEMA
  })
});

const HUMAN_TASK_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  required: Object.freeze(["result", "deepLink", "nextDecision"]),
  properties: Object.freeze({
    result: Object.freeze({ type: "string" }),
    deepLink: Object.freeze({ type: ["string", "null"] }),
    nextDecision: Object.freeze({ type: ["string", "null"] })
  })
});

function inputSchema(properties, required = []) {
  return Object.freeze({
    type: "object",
    additionalProperties: false,
    properties: Object.freeze(properties),
    required: Object.freeze(required)
  });
}

const TOP_LEVEL_ARGUMENT_DESCRIPTIONS = Object.freeze({
  titulo: "Novo título.",
  objetivo: "Objetivo do curso.",
  curso: "Nome do curso.",
  aprovado: "Aprova o mapa exibido.",
  publico: "Público do curso.",
  preRequisitos: "Pré-requisitos do curso.",
  itensDeEscopo: "Escopo obrigatório.",
  modulos: "Mapa curricular completo.",
  parte: "Parte: posição ou título.",
  progressao: "Progressão do lote.",
  microssequencias: "Microssequências do lote.",
  microssequencia: "Microssequência por posição/título.",
  unidade: "Unidade: posição ou título.",
  unidades: "Unidades: posições ou títulos.",
  fonte: "Fonte: posição ou título.",
  busca: "Termos da busca.",
  funcao: "Função necessária.",
  componente: "Componente a inspecionar.",
  somenteAbertas: "Filtrar só abertas.",
  intencao: "Intenção confirmada.",
  parametros: "Valores pelo catálogo de ajustes.",
  automaticos: "Escolhas delegadas sem valor fixo.",
  direcaoEditorial: "Direção editorial.",
  condicao: "Origem da definição.",
  texto: "Texto da observação.",
  categoria: "Categoria da observação.",
  correcoes: "Conteúdos corrigidos.",
  metadados: "Dados da fonte.",
  papel: "Papel didático.",
  papeisSugeridos: "Sugestões para futuros vínculos; não atribuem um uso.",
  estilo: "Estilo das referências do curso.",
  ancoras: "Trechos da fonte.",
  vinculos: "Vínculos com unidades.",
  retirar: "Retirada solicitada.",
  pdf: "PDF temporário.",
  aplicacaoPedagogica: "Aplicação pedagógica."
});

function describeTopLevelArguments(schema) {
  const projected = structuredClone(schema);
  projected.properties = Object.fromEntries(Object.entries(projected.properties || {})
    .map(([name, definition]) => [name, {
      ...definition,
      description: definition.description || TOP_LEVEL_ARGUMENT_DESCRIPTIONS[name] ||
        `Valor humano necessário para ${name}.`
    }]));
  return projected;
}

function annotations(readOnly, destructive = false) {
  return Object.freeze({
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    openWorldHint: false
  });
}

function task(name, title, description, schema, {
  readOnly,
  destructive = false,
  file = null
} = {}) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema: Object.freeze(describeTopLevelArguments(schema)),
    outputSchema: HUMAN_TASK_OUTPUT_SCHEMA,
    annotations: annotations(readOnly, destructive),
    ...(file ? { _meta: Object.freeze({ "openai/fileParams": Object.freeze([file]) }) } : {})
  });
}

export const COURSE_HUMAN_TASKS = Object.freeze([
  task("consultar_perfis", "Consultar perfis de autoria", "Use para listar preferências desta conta. Não altera cursos.",
    inputSchema({}), { readOnly: true }),
  task("salvar_perfil", "Salvar um perfil de autoria", "Use para criar ou editar preferências por cópia. Não altera cursos existentes.",
    inputSchema({ nome: { type: "string", minLength: 1, maxLength: 120 },
      perfil: { type: "string", minLength: 1, maxLength: 120 }, parametros: parametersSchema(),
      automaticos: { type: "array", maxItems: PARAMETER_FIELDS.length, uniqueItems: true,
        items: { type: "string", enum: PARAMETER_FIELDS } }
    }, ["nome"]), { readOnly: false }),
  task("excluir_perfil", "Excluir um perfil de autoria", "Use para excluir o perfil. Não altera as preferências já copiadas aos cursos.",
    inputSchema({ perfil: { type: "string", minLength: 1, maxLength: 120 } }, ["perfil"]),
    { readOnly: false, destructive: true }),
  task("prever_aplicacao_perfil", "Examinar a aplicação de um perfil", "Use para examinar alcance e exceções antes da cópia. Não altera o curso.",
    inputSchema({ curso: COURSE_SCHEMA, perfil: { type: "string", minLength: 1, maxLength: 120 } },
      ["curso", "perfil"]), { readOnly: true }),
  task("aplicar_perfil", "Aplicar um perfil ao curso", "Use para aplicar a prévia examinada. Preserva exceções salvo seleção explícita; não reescreve conteúdo.",
    inputSchema({ curso: COURSE_SCHEMA, perfil: { type: "string", minLength: 1, maxLength: 120 },
      previa: { type: "string", pattern: "^[a-f0-9]{64}$", description: "Confirmação devolvida pela prévia examinada." },
      excecoesRemover: { type: "array", maxItems: 128, uniqueItems: true,
        items: { type: "integer", minimum: 1, maximum: 128 } }
    }, ["curso", "perfil", "previa"]), { readOnly: false }),
  task(
    "retomar_curso",
    "Retomar um curso",
    "Use para retomar curso. Não altera.",
    inputSchema({
      titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 })
    }),
    { readOnly: true }
  ),
  task(
    "consultar_planejamento",
    "Consultar o planejamento",
    "Use para ler mapa/lote. Não altera.",
    inputSchema({ curso: COURSE_SCHEMA, parte: HUMAN_REFERENCE_SCHEMA }, ["curso"]),
    { readOnly: true }
  ),
  task(
    "preparar_materializacao",
    "Preparar a materialização",
    "Use para ler o lote antes da produção. Não grava.",
    inputSchema({ curso: COURSE_SCHEMA, parte: HUMAN_REFERENCE_SCHEMA }, ["curso", "parte"]),
    { readOnly: true }
  ),
  task(
    "consultar_configuracao",
    "Consultar a configuração autoral",
    "Use para ler configuração. Não altera.",
    inputSchema({
      curso: COURSE_SCHEMA,
      microssequencia: HUMAN_REFERENCE_SCHEMA,
      unidade: HUMAN_REFERENCE_SCHEMA
    }, ["curso"]),
    { readOnly: true }
  ),
  task(
    "consultar_observacoes",
    "Consultar observações",
    "Use para ler observações. Não registra.",
    inputSchema({
      curso: COURSE_SCHEMA,
      parte: HUMAN_REFERENCE_SCHEMA,
      microssequencia: HUMAN_REFERENCE_SCHEMA,
      unidades: HUMAN_REFERENCE_LIST_SCHEMA,
      somenteAbertas: Object.freeze({ type: "boolean", default: true })
    }, ["curso"]),
    { readOnly: true }
  ),
  task(
    "preparar_revisao",
    "Preparar uma revisão coerente",
    "Use para preparar revisão. Não corrige.",
    inputSchema({
      curso: COURSE_SCHEMA,
      parte: HUMAN_REFERENCE_SCHEMA,
      microssequencia: HUMAN_REFERENCE_SCHEMA,
      unidades: HUMAN_REFERENCE_LIST_SCHEMA
    }, ["curso"]),
    { readOnly: true }
  ),
  task(
    "consultar_fontes",
    "Consultar fontes e âncoras",
    "Use para ler fontes/âncoras. Não altera.",
    inputSchema({
      curso: COURSE_SCHEMA,
      fonte: HUMAN_REFERENCE_SCHEMA,
      busca: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
      unidade: HUMAN_REFERENCE_SCHEMA
    }, ["curso"]),
    { readOnly: true }
  ),
  task(
    "consultar_componentes",
    "Consultar componentes didáticos",
    "Use para inspecionar componente antes do uso. Não grava.",
    Object.freeze({
      ...inputSchema({
        busca: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
        funcao: Object.freeze({ type: "string", minLength: 1, maxLength: 500 }),
        estrutura: Object.freeze({
          type: "string", minLength: 1, maxLength: 120,
          description: "Estrutura: texto, tabela ou processo."
        }),
        operacao: Object.freeze({
          type: "string", minLength: 1, maxLength: 120,
          description: "Operação: comparar, recordar ou ordenar."
        }),
        componente: Object.freeze({
          type: "string", minLength: 1, maxLength: 240,
          description: "Componente a inspecionar."
        }),
        papel: Object.freeze({
          type: "string", enum: Object.freeze(["teoria", "pratica"]),
          description: "Papel didático."
        }),
        lugar: Object.freeze({
          type: "string", enum: Object.freeze(["conteudo", "resposta", "feedback"]),
          description: "Lugar na unidade de estudo."
        })
      }),
      minProperties: 1
    }),
    { readOnly: true }
  ),
  task(
    "criar_curso",
    "Criar um curso",
    "Use para criar curso confirmado. Não copia.",
    inputSchema({
      titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
      objetivo: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 })
    }, ["titulo", "objetivo"]),
    { readOnly: false }
  ),
  task(
    "salvar_mapa_curricular",
    "Salvar o mapa curricular",
    "Use para propor/aprovar o mapa antes do lote; não produz.",
    inputSchema({
      curso: COURSE_SCHEMA,
      aprovado: Object.freeze({ type: "boolean" }),
      publico: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
      preRequisitos: Object.freeze({
        type: "array", maxItems: 64, uniqueItems: true,
        items: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 })
      }),
      itensDeEscopo: Object.freeze({
        type: "array", minItems: 1, maxItems: 256, uniqueItems: true,
        items: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 })
      }),
      modulos: Object.freeze({
        type: "array", minItems: 1, maxItems: 64,
        items: CURRICULAR_MAP_MODULE_SCHEMA
      })
    }, ["curso", "aprovado", "publico", "preRequisitos", "itensDeEscopo", "modulos"]),
    { readOnly: false }
  ),
  task(
    "salvar_parte",
    "Salvar uma parte do planejamento",
    "Após confirmar, divida, reúna ou reordene lotes, preservando intenções e progressão. Só muda a ordem de produção.",
    inputSchema({
      curso: COURSE_SCHEMA,
      parte: HUMAN_REFERENCE_SCHEMA,
      posicao: Object.freeze({ type: "integer", minimum: 1, maximum: 64 }),
      titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
      intencao: Object.freeze({ type: "string", minLength: 1, maxLength: 4000 }),
      microssequencias: Object.freeze({
        type: "array", minItems: 1, maxItems: 64,
        uniqueItems: true,
        items: Object.freeze({ type: "string", minLength: 1, maxLength: 300 })
      }),
      progressao: Object.freeze({
        type: "array", minItems: 1, maxItems: 64,
        items: Object.freeze({ type: "string", minLength: 1, maxLength: 1000 })
      })
    }, ["curso", "titulo", "intencao", "microssequencias", "progressao"]),
    { readOnly: false }
  ),
  task(
    "materializar_parte",
    "Materializar uma parte",
    "Use o recorte preparado com calibração contextual por unidade na materialização. Marque formas, cobertura, novidade, uso e retomada; identidades locais únicas. Não narre a chamada: resultado, link e próxima etapa.",
    inputSchema({
      curso: COURSE_SCHEMA,
      parte: HUMAN_REFERENCE_SCHEMA,
      unidades: Object.freeze({
        type: "array", minItems: 1, maxItems: 64, items: MATERIALIZATION_UNIT_SCHEMA,
        description: "Unidades completas do lote."
      })
    }, ["curso", "parte", "unidades"]),
    { readOnly: false }
  ),
  task(
    "ajustar_configuracao",
    "Ajustar a configuração autoral",
    "Use para fixar autoria/pesquisa; não para calibração automática rotineira.",
    Object.freeze({
      ...inputSchema({
      curso: COURSE_SCHEMA,
      microssequencia: HUMAN_REFERENCE_SCHEMA,
      unidade: HUMAN_REFERENCE_SCHEMA,
      condicao: Object.freeze({
        type: "string",
        enum: Object.freeze(["automatica", "fixada_pelo_autor", "pesquisa"])
      }),
      parametros: PARAMETERS_SCHEMA,
      automaticos: { type: "array", minItems: 1, maxItems: PARAMETER_FIELDS.length, uniqueItems: true,
        items: { type: "string", enum: PARAMETER_FIELDS } },
        direcaoEditorial: Object.freeze({ type: ["string", "null"], maxLength: 4000 })
      }, ["curso", "condicao"]),
      anyOf: Object.freeze([
        Object.freeze({ required: Object.freeze(["parametros"]) }),
        Object.freeze({ required: Object.freeze(["automaticos"]) }),
        Object.freeze({ required: Object.freeze(["direcaoEditorial"]) })
      ])
    }),
    { readOnly: false }
  ),
  task(
    "registrar_observacao",
    "Registrar observação",
    "Use para anotar unidades. Não corrige.",
    inputSchema({
      curso: COURSE_SCHEMA,
      unidades: HUMAN_REFERENCE_LIST_SCHEMA,
      texto: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
      categoria: Object.freeze({
        type: ["string", "null"], enum: Object.freeze([
          ...COURSE_ANCHORED_ANNOTATION_CATEGORIES,
          null
        ])
      })
    }, ["curso", "unidades", "texto"]),
    { readOnly: false }
  ),
  task(
    "aplicar_correcoes",
    "Aplicar correções pedagógicas",
    "Use para aplicar correções aprovadas. Não configura.",
    inputSchema({
      curso: COURSE_SCHEMA,
      correcoes: Object.freeze({
        type: "array", minItems: 1, maxItems: 64,
        items: Object.freeze({
          type: "object", additionalProperties: false,
          required: Object.freeze(["unidade", "conteudo"]),
          properties: Object.freeze({
            unidade: HUMAN_REFERENCE_SCHEMA,
            conteudo: STUDY_UNIT_CONTENT_SCHEMA,
            fontes: SOURCE_LINKS_SCHEMA
          })
        })
      })
    }, ["curso", "correcoes"]),
    { readOnly: false }
  ),
  task(
    "manter_fonte",
    "Manter fonte e âncoras",
    "Use para fontes; só marque conferida após declaração explícita da autoria; localize apenas o fornecido ou lido. Não recebe PDF.",
    Object.freeze({
      ...inputSchema({
        curso: COURSE_SCHEMA,
        fonte: HUMAN_REFERENCE_SCHEMA,
        estilo: Object.freeze({ type: "string", enum: COURSE_BIBLIOGRAPHY_STYLES }),
        metadados: SOURCE_METADATA_SCHEMA,
        ancoras: Object.freeze({
        type: "array", minItems: 1, maxItems: 8,
        items: Object.freeze({
          type: "object", additionalProperties: false,
          required: Object.freeze(["seletor"]),
          properties: Object.freeze({
            ancora: HUMAN_REFERENCE_SCHEMA,
            seletor: SOURCE_SELECTOR_SCHEMA,
            hashDoPdf: Object.freeze({ type: ["string", "null"], pattern: "^[a-f0-9]{64}$" }),
            localizadorHumano: Object.freeze({ type: ["string", "null"], maxLength: 500 }),
            trechoDeVerificacao: Object.freeze({ type: ["string", "null"], maxLength: 2000 })
          })
        })
        }),
        vinculos: Object.freeze({
        type: "array", minItems: 1, maxItems: 64,
        items: Object.freeze({
          type: "object", additionalProperties: false,
          required: Object.freeze(["unidade", "relacao", "papeis"]),
          properties: Object.freeze({
            unidade: HUMAN_REFERENCE_SCHEMA,
            vinculo: Object.freeze({ type: "integer", minimum: 1, maximum: 32 }),
            ...SOURCE_LINK_PROPERTIES
          })
        })
        }),
        retirar: Object.freeze({
          type: "string",
          enum: Object.freeze(["pdfs", "fonte"]),
          description: "Retire os PDFs ou a fonte inteira."
        })
      }, ["curso"]),
      anyOf: Object.freeze([
        Object.freeze({ required: Object.freeze(["metadados"]) }),
        Object.freeze({ required: Object.freeze(["ancoras"]) }),
        Object.freeze({ required: Object.freeze(["vinculos"]) }),
        Object.freeze({ required: Object.freeze(["retirar"]) }),
        Object.freeze({ required: Object.freeze(["estilo"]) })
      ]),
      allOf: Object.freeze([Object.freeze({
        if: Object.freeze({ required: Object.freeze(["retirar"]) }),
        then: Object.freeze({
          required: Object.freeze(["fonte"]),
          not: Object.freeze({ anyOf: Object.freeze([
            Object.freeze({ required: Object.freeze(["metadados"]) }),
            Object.freeze({ required: Object.freeze(["ancoras"]) }),
            Object.freeze({ required: Object.freeze(["vinculos"]) }),
            Object.freeze({ required: Object.freeze(["estilo"]) })
          ]) })
        })
      })
      ])
    }),
    { readOnly: false, destructive: true }
  ),
  task(
    "incorporar_pdf_como_fonte",
    "Incorporar PDF como fonte",
    "Use para guardar PDF. Não lê.",
    Object.freeze({
      ...inputSchema({
        curso: COURSE_SCHEMA,
        fonte: Object.freeze({
          ...HUMAN_REFERENCE_SCHEMA,
          description: "Referência: fonte existente."
        }),
        titulo: Object.freeze({
          type: ["string", "null"],
          minLength: 1,
          maxLength: 300,
          description: "Nova fonte a criar."
        }),
        papeisSugeridos: SOURCE_ROLES_SCHEMA,
        intencao: Object.freeze({
          type: "string",
          minLength: 1,
          maxLength: 1000,
          description: "Motivo para manter."
        }),
        pdf: Object.freeze({
          type: "object",
          additionalProperties: false,
          description: "PDF temporário.",
          required: Object.freeze(["download_url", "file_id"]),
          properties: Object.freeze({
            download_url: Object.freeze({ type: "string", minLength: 1, maxLength: 8192 }),
            file_id: Object.freeze({ type: "string", minLength: 1, maxLength: 512 }),
            file_name: Object.freeze({ type: "string", minLength: 1, maxLength: 512 }),
            mime_type: Object.freeze({ type: "string", const: "application/pdf" })
          })
        })
      }, ["curso", "intencao", "pdf"]),
      oneOf: Object.freeze([
        Object.freeze({ required: Object.freeze(["fonte"]) }),
        Object.freeze({ required: Object.freeze(["titulo", "papeisSugeridos"]) })
      ])
    }),
    { readOnly: false, file: "pdf" }
  ),
  task(
    "guardar_audio", "Guardar áudio no curso",
    "Use para guardar WAV PCM/MP3 e reutilizar no curso. Não sintetiza nem transcreve.",
    inputSchema({ curso: COURSE_SCHEMA,
      audio: { type: "object", additionalProperties: false,
        description: "Áudio WAV PCM ou MP3, até 20 MiB.", required: ["download_url", "file_id"],
        properties: {
          download_url: { type: "string", minLength: 1, maxLength: 8192 },
          file_id: { type: "string", minLength: 1, maxLength: 240 },
          file_name: { type: "string", minLength: 1, maxLength: 180 },
          mime_type: { type: "string", enum: ["audio/wav", "audio/mpeg"] }
        }
      }
    }, ["curso", "audio"]), { readOnly: false, file: "audio" }
  ),
  task(
    "consultar_audios", "Consultar áudios do curso",
    "Use para consultar áudios guardados. Não lê nem transcreve.",
    inputSchema({ curso: COURSE_SCHEMA,
      pagina: { type: "integer", minimum: 1, maximum: 100, description: "Página da biblioteca, a partir de 1." }
    }, ["curso"]), { readOnly: true }
  )
]);

export const COURSE_HUMAN_TASK_CATALOG_ID = "aralearn.human-authoring-tasks";
export const COURSE_HUMAN_TASK_CATALOG_VERSION = "2.7.0";
export const COURSE_HUMAN_TASK_CATALOG_HASH =
  "sha256:e0e63006bc9351ee489063d526b6f63cfc2579da28e995bf891a64614121dccf";
export const COURSE_HUMAN_TASK_CATALOG_METADATA = Object.freeze({
  id: COURSE_HUMAN_TASK_CATALOG_ID,
  version: COURSE_HUMAN_TASK_CATALOG_VERSION,
  hash: COURSE_HUMAN_TASK_CATALOG_HASH
});
export const COURSE_HUMAN_TASK_CATALOG_HEADER = [
  COURSE_HUMAN_TASK_CATALOG_ID,
  `version=${COURSE_HUMAN_TASK_CATALOG_VERSION}`,
  `hash=${COURSE_HUMAN_TASK_CATALOG_HASH}`
].join("; ");

const BY_NAME = new Map(COURSE_HUMAN_TASKS.map((definition) => [definition.name, definition]));
const WRITE_NAMES = new Set(COURSE_HUMAN_TASKS
  .filter(({ annotations: value }) => value.readOnlyHint !== true)
  .map(({ name }) => name));

export function courseHumanTaskDefinition(name) {
  return BY_NAME.get(String(name || "")) || null;
}

export function courseHumanTaskIsAllowed(name, principal) {
  if (!principal?.actorId || !BY_NAME.has(name)) return false;
  const scopes = new Set(Array.isArray(principal.scopes) ? principal.scopes : []);
  return WRITE_NAMES.has(name) ? scopes.has(WRITE_SCOPE) : scopes.has(READ_SCOPE);
}

export function courseHumanTasksForPrincipal(principal) {
  return COURSE_HUMAN_TASKS.filter(({ name }) => courseHumanTaskIsAllowed(name, principal))
    .map((definition) => {
      const tool = structuredClone(definition);
      const securitySchemes = structuredClone(MCP_OAUTH_SECURITY_SCHEMES);
      return {
        ...tool,
        securitySchemes,
        _meta: {
          ...(tool._meta || {}),
          securitySchemes: structuredClone(securitySchemes)
        }
      };
    });
}

function fail(code, message, details = null, status = 422) {
  throw new AuthoringApiError(status, code, message, details);
}

function plainObject(value, label = "arguments") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_human_task_arguments", `${label} precisa ser um objeto.`);
  }
  return value;
}

function exactFields(value, allowed) {
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) {
    fail(
      "unknown_human_task_argument",
      `O argumento ${unknown} não pertence a esta tarefa.`,
      { field: unknown }
    );
  }
}

function text(value, field, maximum, { optional = false, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (optional && value === undefined) return undefined;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || [...normalized].length > maximum) {
    fail("invalid_human_task_argument", `${field} é inválido.`, { field });
  }
  return normalized;
}

function humanReference(value, field, { optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (Number.isSafeInteger(value) && value >= 1 && value <= 1000000) return value;
  return text(value, field, 300);
}

function humanReferenceList(value, field, { optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    fail("invalid_human_task_argument", `${field} precisa conter de 1 a 64 referências.`, { field });
  }
  const normalized = value.map((item, index) => humanReference(item, `${field}[${index}]`));
  if (new Set(normalized.map((item) => `${typeof item}:${item}`)).size !== normalized.length) {
    fail("duplicate_human_reference", `${field} não pode repetir a mesma referência.`, { field });
  }
  return normalized;
}

function safeClone(value, field, maximumBytes = 256 * 1024) {
  let result;
  try {
    result = structuredClone(value);
  } catch {
    fail("invalid_human_task_argument", `${field} precisa conter somente dados JSON.`, { field });
  }
  if (encoder.encode(JSON.stringify(result)).byteLength > maximumBytes) {
    fail("human_task_payload_too_large", `${field} excede o limite.`, { field }, 413);
  }
  return result;
}

function assertTaskArguments(name, rawArguments) {
  const definition = courseHumanTaskDefinition(name);
  if (!definition) throw new AuthoringApiError(404, "unknown_human_task", "Tarefa de autoria inexistente.");
  const raw = plainObject(rawArguments ?? {});
  exactFields(raw, new Set(Object.keys(definition.inputSchema.properties || {})));
  for (const required of definition.inputSchema.required || []) {
    if (!Object.hasOwn(raw, required)) {
      fail("missing_human_task_argument", `Informe ${required}.`, { field: required });
    }
  }
  return safeClone(raw, "arguments", 512 * 1024);
}

function withoutTechnicalState(value) {
  if (Array.isArray(value)) return value.map(withoutTechnicalState);
  if (!value || typeof value !== "object") return value;
  const projected = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
    if (normalizedKey === "default_roles" || normalizedKey === "roles" && Array.isArray(entry) &&
        entry.every((role) => COURSE_SOURCE_ROLES.includes(role))) {
      projected[normalizedKey === "default_roles" ? "papeisSugeridos" : "papeis"] =
        Array.isArray(entry) ? entry.map((role) => SOURCE_ROLE_HUMAN_NAMES.get(role)) : [];
      continue;
    }
    if (normalizedKey === "component_authoring_contract") {
      projected[key] = structuredClone(entry);
      continue;
    }
    if (normalizedKey === "stored_audio") {
      projected[key] = normalizeCourseMediaCatalogItem(entry);
      continue;
    }
    if (normalizedKey === "source_attachment_target") {
      exactFields(entry, new Set(["kind", "sourceId", "sourceRevision", "contentHash"]));
      if (entry.kind !== "source_attachment" || typeof entry.sourceId !== "string" ||
          !entry.sourceId.trim() || entry.sourceId !== entry.sourceId.trim() || entry.sourceId.length > 240 ||
          [...entry.sourceId].some(character => { const code = character.codePointAt(0); return code <= 31 || code >= 127 && code <= 159; }) ||
          !Number.isSafeInteger(entry.sourceRevision) || entry.sourceRevision < 1 ||
          !/^[a-f0-9]{64}$/u.test(entry.contentHash)) {
        throw new AuthoringApiError(503, "invalid_course_source_attachment", "A referência do PDF não pôde ser confirmada.");
      }
      projected[key] = structuredClone(entry);
      continue;
    }
    const segments = normalizedKey.split("_");
    const technical = new Set(["id", "ids", "revision", "version", "hash", "path"]);
    if (technical.has(segments.at(-1)) ||
        new Set([
          "request_id", "result_facts", "cursor", "cas", "payload", "payloads",
          "run", "runs", "step", "steps", "retry", "retries", "duration",
          "materialization", "materializations"
        ]).has(normalizedKey)) {
      continue;
    }
    projected[key] = withoutTechnicalState(entry);
  }
  return projected;
}

function result(message, {
  deepLink = null,
  nextDecision = null,
  context = undefined
} = {}) {
  const projected = {
    result: text(message, "result", 4000),
    deepLink: deepLink == null ? null : text(deepLink, "deepLink", 4096),
    nextDecision: nextDecision == null ? null : text(nextDecision, "nextDecision", 1000),
    ...(context === undefined ? {} : { context: withoutTechnicalState(context) })
  };
  if (encoder.encode(JSON.stringify(projected)).byteLength > MAX_RESULT_BYTES) {
    fail(
      "human_task_result_too_large",
      "O recorte solicitado excede o limite; escolha uma parte, microssequência ou unidade.",
      null,
      413
    );
  }
  return projected;
}

function normalizeTaskError(error) {
  if (error instanceof AuthoringApiError) throw error;
  if (error?.name?.endsWith("Error") && typeof error?.code === "string") {
    throw new AuthoringApiError(422, error.code, error.message, error.details ?? null);
  }
  throw error;
}

// Handlers são definidos abaixo; este export já é a autoridade comum para MCP e Actions.
export async function executeHumanCourseTask({
  adapter,
  principal,
  name,
  rawArguments,
  deadlineAt = Date.now() + 40_000,
  projectionRecipient = "connected_mcp_client"
}) {
  if (!courseHumanTaskIsAllowed(name, principal)) {
    throw new AuthoringApiError(403, "insufficient_scope", "A sessão não permite usar esta tarefa.");
  }
  const args = assertTaskArguments(name, rawArguments);
  try {
    const output = await HUMAN_TASK_HANDLERS[name]({
      adapter,
      principal,
      args,
      deadlineAt,
      projectionRecipient
    });
    if (!output || typeof output !== "object" || Array.isArray(output) ||
        typeof output.result !== "string" ||
        !(output.deepLink === null || typeof output.deepLink === "string") ||
        !(output.nextDecision === null || typeof output.nextDecision === "string")) {
      throw new AuthoringApiError(
        502,
        "invalid_human_task_result",
        "A tarefa devolveu um resultado inválido."
      );
    }
    return result(output.result, {
      deepLink: output.deepLink,
      nextDecision: output.nextDecision,
      ...(output.context === undefined ? {} : { context: output.context })
    });
  } catch (error) {
    return normalizeTaskError(error);
  }
}

const HUMAN_TASK_HANDLERS = Object.create(null);

async function readHumanProfiles(adapter, principal, deadlineAt) {
  const result = await adapter.listAuthoringProfiles({ principal, deadlineAt });
  if (!Array.isArray(result?.profiles)) fail("course_service_unavailable", "Os perfis não puderam ser lidos.", null, 503);
  return result.profiles;
}

function namedProfile(profiles, name) {
  const normalized = text(name, "perfil", 120).normalize("NFC").toLocaleLowerCase("pt-BR");
  const matches = profiles.filter((profile) => profile.name.normalize("NFC").toLocaleLowerCase("pt-BR") === normalized);
  if (matches.length !== 1) fail(matches.length ? "ambiguous_human_reference" : "human_reference_not_found",
    matches.length ? "Mais de um perfil possui esse nome." : "O perfil não foi encontrado.", null, matches.length ? 409 : 404);
  return matches[0];
}

function profileContext(profile) {
  return { nome: profile.name, preferencias: profile.preferences.map((preference) => {
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === preference.parameterId);
    return { campo: definition.humanField, nome: definition.label, grupo: definition.groupLabel,
      unidade: definition.unitLabel, modo: preference.mode, valor: preference.value };
  }) };
}

HUMAN_TASK_HANDLERS.consultar_perfis = async ({ adapter, principal, deadlineAt }) => {
  const profiles = await readHumanProfiles(adapter, principal, deadlineAt);
  return result("Li os perfis de autoria desta conta.", { context: { perfis: profiles.map(profileContext) } });
};

HUMAN_TASK_HANDLERS.salvar_perfil = async ({ adapter, principal, args, deadlineAt }) => {
  const saved = await executeTrustedCourseWrite({
    maxCasRetries: 0,
    load: async () => args.perfil === undefined ? null :
      namedProfile(await readHumanProfiles(adapter, principal, deadlineAt), args.perfil),
    build: async (current, { newId }) => {
      let preferences = current?.preferences ?? [];
      if (args.parametros !== undefined || args.automaticos !== undefined) {
        const parameters = args.parametros === undefined ? {} : plainObject(args.parametros, "parametros");
        exactFields(parameters, new Set(PARAMETER_FIELDS));
        const automatic = args.automaticos ?? [];
        if (!Array.isArray(automatic) || automatic.some((field) => !PARAMETER_FIELDS.includes(field))) {
          fail("invalid_human_task_argument", "A delegação do perfil é inválida.");
        }
        preferences = normalizeAuthoringProfilePreferences([
          ...Object.entries(parameters).map(([field, value]) => ({
            parameterId: PARAMETER_FIELD_TO_ID[field], mode: "fixed", value
          })),
          ...automatic.map((field) => ({ parameterId: PARAMETER_FIELD_TO_ID[field], mode: "automatic", value: null }))
        ]);
      }
      return { principal, profileId: current?.profileId ?? await newId("authoring-profile"),
        expectedRevision: current?.revision ?? 0, name: text(args.nome, "nome", 120),
        preferences, deadlineAt };
    },
    commit: (request) => adapter.saveAuthoringProfile(request)
  });
  return result("Perfil salvo. Cursos existentes conservaram suas preferências.", {
    context: { perfil: profileContext(saved.profile) }
  });
};

HUMAN_TASK_HANDLERS.excluir_perfil = async ({ adapter, principal, args, deadlineAt }) => {
  await executeTrustedCourseWrite({ maxCasRetries: 0,
    load: async () => namedProfile(await readHumanProfiles(adapter, principal, deadlineAt), args.perfil),
    build: (profile) => ({ principal, profileId: profile.profileId, expectedRevision: profile.revision, deadlineAt }),
    commit: (request) => adapter.deleteAuthoringProfile(request)
  });
  return result("Perfil excluído. Cursos existentes conservaram suas preferências.");
};

async function readProfilePreview({ adapter, principal, args, deadlineAt }) {
  const resolved = await resolveHumanCourseContext({ adapter, principal, course: humanCourseTitle(args), deadlineAt });
  const profile = namedProfile(await readHumanProfiles(adapter, principal, deadlineAt), args.perfil);
  return adapter.previewCourseAuthoringProfile({ principal, courseId: resolved.course.id,
    expectedCourseRevision: resolved.course.revision, profileId: profile.profileId,
    profileRevision: profile.revision, deadlineAt });
}

const profilePreviewConfirmation = (preview) => sha256Hex(JSON.stringify(preview));

HUMAN_TASK_HANDLERS.prever_aplicacao_perfil = async (values) => {
  const preview = await readProfilePreview(values);
  return result("Examine as preferências e as exceções antes de aplicar ao curso.", { context: {
    previa: await profilePreviewConfirmation(preview), perfil: profileContext(preview.profile),
    excecoes: preview.exceptions.map((exception, index) => ({ numero: index + 1,
      parametro: COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === exception.parameterId).label,
      escopo: humanDesignScope(exception.scope.kind), alvo: exception.scopeLabel,
      modo: exception.assignment.mode, valor: exception.assignment.value,
      condicaoDePesquisa: exception.assignment.origin === "research_condition" })),
    conflitos: preview.conflicts,
    alcance: "Preferências correntes do curso; o conteúdo existente não será reescrito."
  } });
};

HUMAN_TASK_HANDLERS.aplicar_perfil = async (values) => {
  const { adapter, principal, args, deadlineAt } = values;
  const receipt = await executeTrustedCourseWrite({ maxCasRetries: 0,
    load: () => readProfilePreview(values),
    build: async (preview) => {
      if (await profilePreviewConfirmation(preview) !== args.previa) {
        fail("authoring_profile_preview_changed", "O curso ou perfil mudou. Examine a nova prévia antes de aplicar.", null, 409);
      }
      const indexes = args.excecoesRemover ?? [];
      if (!Array.isArray(indexes) || new Set(indexes).size !== indexes.length ||
          indexes.some((index) => !Number.isSafeInteger(index) || index < 1 || index > preview.exceptions.length)) {
        fail("invalid_human_task_argument", "A seleção de exceções não pertence à prévia.");
      }
      const exceptions = indexes.map((index) => preview.exceptions[index - 1]);
      if (exceptions.some((entry) => entry.assignment.origin === "research_condition")) {
        fail("course_design_research_condition_protected", "Uma condição de pesquisa não pode ser removida pela aplicação de perfil.", null, 409);
      }
      return { principal, courseId: preview.courseId, expectedCourseRevision: preview.courseRevision,
        profileId: preview.profile.profileId, profileRevision: preview.profile.revision,
        exceptionPolicy: { mode: indexes.length ? "remove_selected" : "preserve",
          exceptions: exceptions.map(({ parameterId, scope }) => ({ parameterId, scope })) }, deadlineAt };
    },
    commit: (request) => adapter.applyCourseAuthoringProfile(request)
  });
  return result(receipt.changed ? "Preferências copiadas para o curso. O conteúdo foi preservado." :
    "O curso já usa essas preferências; nenhuma alteração foi necessária.");
};

function humanCourseTitle(args) {
  return text(args.curso, "curso", 300);
}

function optionalReference(value, field) {
  return value === undefined ? undefined : humanReference(value, field);
}

function courseDeepLink(adapter, course, section, entries = []) {
  const base = String(adapter?.publicAppUrl || "").replace(/\/+$/u, "");
  if (!base || !course?.id) return course?.deepLink ?? null;
  const query = new URLSearchParams([["section", section], ...entries.filter(([, value]) => value)]);
  return `${base}/#/authoring/courses/${encodeURIComponent(course.id)}?${query}`;
}

async function loadPlan(adapter, principal, course, deadlineAt) {
  return await adapter.getCourseInstructionalPlan({
    principal,
    courseId: course.id,
    recentLimit: 20,
    deadlineAt
  });
}

function planVersion(read) {
  const value = Number(read?.planVersion ?? read?.plan?.version);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AuthoringApiError(503, "course_service_unavailable", "O planejamento não informou versão corrente.");
  }
  return value;
}

function matchingText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/gu, " ")
    .trim();
}

function textList(value, field, {
  minimum = 0,
  maximum = 64,
  itemMaximum = 2000
} = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(
      "invalid_human_task_argument",
      `${field} precisa conter de ${minimum} a ${maximum} itens.`,
      { field }
    );
  }
  const items = value.map((item, index) => text(item, `${field}[${index}]`, itemMaximum));
  if (new Set(items.map(matchingText)).size !== items.length) {
    fail("duplicate_human_reference", `${field} não pode repetir o mesmo item.`, { field });
  }
  return items;
}

function uniqueTitles(items, field) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const title = matchingText(item.title);
    if (seen.has(title)) {
      fail(
        "duplicate_human_reference",
        `${field}[${index}].titulo repete um título no mesmo contexto.`,
        { field: `${field}[${index}].titulo` }
      );
    }
    seen.add(title);
  }
}

function normalizeCurricularMapArguments(args) {
  if (typeof args.aprovado !== "boolean") {
    fail("invalid_human_task_argument", "aprovado precisa ser verdadeiro ou falso.", {
      field: "aprovado"
    });
  }
  const audience = text(args.publico, "publico", 2000);
  const prerequisites = textList(args.preRequisitos, "preRequisitos", { maximum: 64 });
  const scopeItems = textList(args.itensDeEscopo, "itensDeEscopo", {
    minimum: 1,
    maximum: 256
  });
  if (!Array.isArray(args.modulos) || args.modulos.length < 1 || args.modulos.length > 64) {
    fail("invalid_human_task_argument", "modulos precisa conter de 1 a 64 módulos.", {
      field: "modulos"
    });
  }
  const scopeByText = new Map(scopeItems.map((statement) => [matchingText(statement), statement]));
  const microsequenceTitles = new Map();
  let microsequenceOrder = 0;
  const modules = args.modulos.map((rawModule, moduleIndex) => {
    const moduleField = `modulos[${moduleIndex}]`;
    const moduleValue = plainObject(rawModule, moduleField);
    exactFields(moduleValue, new Set(["titulo", "objetivo", "licoes"]));
    if (!Array.isArray(moduleValue.licoes) || moduleValue.licoes.length < 1 ||
        moduleValue.licoes.length > 64) {
      fail("invalid_human_task_argument", `${moduleField}.licoes precisa conter de 1 a 64 lições.`, {
        field: `${moduleField}.licoes`
      });
    }
    const lessons = moduleValue.licoes.map((rawLesson, lessonIndex) => {
      const lessonField = `${moduleField}.licoes[${lessonIndex}]`;
      const lessonValue = plainObject(rawLesson, lessonField);
      exactFields(lessonValue, new Set(["titulo", "objetivo", "microssequencias"]));
      if (!Array.isArray(lessonValue.microssequencias) ||
          lessonValue.microssequencias.length < 1 ||
          lessonValue.microssequencias.length > 64) {
        fail(
          "invalid_human_task_argument",
          `${lessonField}.microssequencias precisa conter de 1 a 64 itens.`,
          { field: `${lessonField}.microssequencias` }
        );
      }
      const microsequences = lessonValue.microssequencias.map((rawMicrosequence, index) => {
        const field = `${lessonField}.microssequencias[${index}]`;
        const item = plainObject(rawMicrosequence, field);
        exactFields(item, new Set(["titulo", "objetivo", "dependencias", "cobertura"]));
        const title = text(item.titulo, `${field}.titulo`, 300);
        const key = matchingText(title);
        if (microsequenceTitles.has(key)) {
          fail(
            "duplicate_human_reference",
            `O título da microssequência “${title}” se repete no mapa curricular.`,
            { field: `${field}.titulo` }
          );
        }
        const dependencies = textList(item.dependencias, `${field}.dependencias`, {
          maximum: 64,
          itemMaximum: 300
        });
        const coverage = textList(item.cobertura, `${field}.cobertura`, { maximum: 64 })
          .map((statement) => {
            const canonical = scopeByText.get(matchingText(statement));
            if (!canonical) {
              fail(
                "curricular_scope_item_not_found",
                `A cobertura “${statement}” não pertence ao escopo declarado.`,
                { field: `${field}.cobertura` }
              );
            }
            return canonical;
          });
        const normalized = {
          title,
          objective: text(item.objetivo, `${field}.objetivo`, 2000),
          dependencies,
          coverage,
          order: microsequenceOrder
        };
        microsequenceTitles.set(key, normalized);
        microsequenceOrder += 1;
        return normalized;
      });
      uniqueTitles(microsequences, `${lessonField}.microssequencias`);
      return {
        title: text(lessonValue.titulo, `${lessonField}.titulo`, 300),
        objective: text(lessonValue.objetivo, `${lessonField}.objetivo`, 2000),
        microsequences
      };
    });
    uniqueTitles(lessons, `${moduleField}.licoes`);
    return {
      title: text(moduleValue.titulo, `${moduleField}.titulo`, 300),
      objective: text(moduleValue.objetivo, `${moduleField}.objetivo`, 2000),
      lessons
    };
  });
  uniqueTitles(modules, "modulos");

  for (const moduleValue of modules) {
    for (const lesson of moduleValue.lessons) {
      for (const microsequence of lesson.microsequences) {
        microsequence.dependencies = microsequence.dependencies.map((reference) => {
          const dependency = microsequenceTitles.get(matchingText(reference));
          if (!dependency) {
            fail(
              "curricular_dependency_not_found",
              `A dependência “${reference}” não pertence ao mapa curricular.`,
              { microsequence: microsequence.title }
            );
          }
          if (dependency.order >= microsequence.order) {
            fail(
              "curricular_dependency_out_of_order",
              `A dependência “${dependency.title}” precisa aparecer antes de “${microsequence.title}”.`,
              { microsequence: microsequence.title, dependency: dependency.title }
            );
          }
          return dependency.title;
        });
        delete microsequence.order;
      }
    }
  }
  return { approved: args.aprovado, audience, prerequisites, scopeItems, modules };
}

async function loadAllCourseEntities(adapter, principal, course, deadlineAt) {
  const items = [];
  let afterEntityType = null;
  let afterEntityId = null;
  for (let pageNumber = 0; pageNumber < MAX_CONTEXT_PAGES; pageNumber += 1) {
    const page = await adapter.listCourseEntities({
      principal,
      courseId: course.id,
      expectedRevision: course.revision,
      limit: 1000,
      afterEntityType,
      afterEntityId,
      deadlineAt
    });
    if (!Array.isArray(page?.items)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A estrutura corrente do curso é inválida."
      );
    }
    items.push(...page.items);
    if (!page.hasMore) return items;
    afterEntityType = page.nextCursor?.entityType ?? null;
    afterEntityId = page.nextCursor?.entityId ?? null;
    if (!afterEntityType || !afterEntityId) break;
  }
  throw new AuthoringApiError(
    413,
    "course_structure_too_large",
    "A estrutura do curso excede o limite; reduza o recorte antes de salvar a parte."
  );
}

function curricularMapFromPlan(planRead) {
  const plan = planRead?.plan || {};
  if (!plan.curriculum || !Array.isArray(plan.curriculum.modules) ||
      !Array.isArray(plan.declaredPrerequisites) ||
      !Array.isArray(plan.curriculumScopeItems) ||
      !new Set(["absent", "draft", "approved"]).has(plan.curriculumMapStatus)) return null;
  return {
    approval: plan.curriculumMapStatus,
    audience: plan.audience ?? "",
    prerequisites: plan.declaredPrerequisites,
    scopeItems: plan.curriculumScopeItems,
    modules: plan.curriculum.modules
  };
}

function internalIdentity(value, kind) {
  if (!value || typeof value !== "object") return null;
  return value[`${kind}Id`] ?? value.id ?? null;
}

function itemStatement(value) {
  if (typeof value === "string") return value;
  return value?.statement ?? value?.title ?? value?.name ?? "";
}

function internalMapCollections(map) {
  const modules = Array.isArray(map?.modules) ? map.modules : [];
  const scopeItems = Array.isArray(map?.scopeItems) ? map.scopeItems : [];
  const microsequences = modules.flatMap((moduleValue) =>
    (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).flatMap((lesson) =>
      (Array.isArray(lesson?.microsequences) ? lesson.microsequences : []).map((microsequence) => ({
        ...microsequence,
        module: moduleValue,
        lesson
      }))));
  return { modules, scopeItems, microsequences };
}

function semanticCurricularMap(map) {
  if (!map) return null;
  const { modules, scopeItems, microsequences } = internalMapCollections(map);
  const titleByMicrosequenceId = new Map(microsequences
    .map((item) => [internalIdentity(item, "microsequence"), item.title])
    .filter(([id, title]) => id && title));
  const titleByText = new Map(microsequences
    .map((item) => [matchingText(item.title), item.title]));
  const scopeById = new Map(scopeItems
    .map((item) => [internalIdentity(item, "scopeItem"), itemStatement(item)])
    .filter(([id, statement]) => id && statement));
  const scopeByText = new Map(scopeItems
    .map((item) => [matchingText(itemStatement(item)), itemStatement(item)]));
  const scopeStatementsByMicrosequenceId = new Map();
  for (const scopeItem of scopeItems) {
    for (const target of Array.isArray(scopeItem?.curriculumTargets)
      ? scopeItem.curriculumTargets
      : []) {
      for (const microsequenceId of Array.isArray(target?.didacticMicrosequenceIds)
        ? target.didacticMicrosequenceIds
        : []) {
        const statements = scopeStatementsByMicrosequenceId.get(microsequenceId) ?? [];
        statements.push(itemStatement(scopeItem));
        scopeStatementsByMicrosequenceId.set(microsequenceId, statements);
      }
    }
  }
  const referencedTitle = (reference) => {
    const value = typeof reference === "object" && reference !== null
      ? internalIdentity(reference, "microsequence") ?? reference.title
      : reference;
    return titleByMicrosequenceId.get(value) ?? titleByText.get(matchingText(value)) ?? String(value || "");
  };
  const referencedScope = (reference) => {
    const value = typeof reference === "object" && reference !== null
      ? internalIdentity(reference, "scopeItem") ?? itemStatement(reference)
      : reference;
    return scopeById.get(value) ?? scopeByText.get(matchingText(value)) ?? String(value || "");
  };
  return {
    audience: String(map.audience || ""),
    prerequisites: (Array.isArray(map.prerequisites) ? map.prerequisites : [])
      .map(itemStatement),
    scopeItems: scopeItems.map(itemStatement),
    modules: modules.map((moduleValue) => ({
      title: String(moduleValue?.title || ""),
      objective: String(moduleValue?.objective ?? moduleValue?.goal ?? ""),
      lessons: (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).map((lesson) => ({
        title: String(lesson?.title || ""),
        objective: String(lesson?.objective ?? lesson?.goal ?? ""),
        microsequences: (Array.isArray(lesson?.microsequences) ? lesson.microsequences : [])
          .map((microsequence) => ({
            title: String(microsequence?.title || ""),
            objective: String(microsequence?.objective ?? microsequence?.goal ?? ""),
            dependencies: (Array.isArray(microsequence?.dependencyMicrosequenceIds)
              ? microsequence.dependencyMicrosequenceIds
              : Array.isArray(microsequence?.dependencies)
                ? microsequence.dependencies
                : Array.isArray(microsequence?.dependsOn) ? microsequence.dependsOn : [])
              .map(referencedTitle),
            coverage: (Array.isArray(microsequence?.scopeItemIds)
              ? microsequence.scopeItemIds
              : Array.isArray(microsequence?.coverage)
                ? microsequence.coverage
                : Array.isArray(microsequence?.covers)
                  ? microsequence.covers
                  : scopeStatementsByMicrosequenceId.get(
                    internalIdentity(microsequence, "microsequence")
                  ) ?? [])
              .map(referencedScope)
          }))
      }))
    }))
  };
}

function semanticMapFromInput(input) {
  return {
    audience: input.audience,
    prerequisites: input.prerequisites,
    scopeItems: input.scopeItems,
    modules: input.modules.map(({ title, objective, lessons }) => ({
      title,
      objective,
      lessons: lessons.map(({ title: lessonTitle, objective: lessonObjective, microsequences }) => ({
        title: lessonTitle,
        objective: lessonObjective,
        microsequences: microsequences.map(({ title: microTitle, objective: microObjective,
          dependencies, coverage }) => ({
          title: microTitle,
          objective: microObjective,
          dependencies,
          coverage
        }))
      }))
    }))
  };
}

function sameCurricularMap(currentMap, input) {
  return JSON.stringify(semanticCurricularMap(currentMap)) ===
    JSON.stringify(semanticMapFromInput(input));
}

function matchingInternalChild(items, title) {
  const matches = items.filter((item) => matchingText(item?.title) === matchingText(title));
  return matches.length === 1 ? matches[0] : null;
}

async function buildCurricularMapWrite({ state, input, newId }) {
  const currentMap = curricularMapFromPlan(state.plan);
  if (input.approved && (!currentMap || currentMap.approval === "absent" ||
      !sameCurricularMap(currentMap, input))) {
    fail(
      "curricular_map_draft_mismatch",
      "A aprovação precisa corresponder exatamente ao mapa curricular que estava disponível para inspeção.",
      null,
      409
    );
  }
  if (input.approved) {
    const covered = new Set(input.modules.flatMap(({ lessons }) =>
      lessons.flatMap(({ microsequences }) =>
        microsequences.flatMap(({ coverage }) => coverage.map(matchingText)))));
    const missing = input.scopeItems.filter((statement) => !covered.has(matchingText(statement)));
    if (missing.length) {
      fail(
        "curricular_scope_incomplete",
        "O mapa curricular não pode ser aprovado enquanto houver item obrigatório sem cobertura.",
        { missing }
      );
    }
  }
  const current = internalMapCollections(currentMap);
  const currentScopeByText = new Map(current.scopeItems
    .map((item) => [matchingText(itemStatement(item)), item]));
  const scopeItems = [];
  for (const [position, statement] of input.scopeItems.entries()) {
    const existing = currentScopeByText.get(matchingText(statement));
    scopeItems.push({
      id: internalIdentity(existing, "scopeItem") ?? await newId(`curricular-scope:${position}`),
      position,
      statement
    });
  }
  const scopeIdByText = new Map(scopeItems.map(({ id, statement }) => [matchingText(statement), id]));
  const modules = [];
  const microsequenceIdByText = new Map();
  for (const [modulePosition, definition] of input.modules.entries()) {
    const currentModule = matchingInternalChild(current.modules, definition.title);
    const moduleId = internalIdentity(currentModule, "module") ??
      await newId(`curricular-module:${modulePosition}`);
    const currentLessons = Array.isArray(currentModule?.lessons) ? currentModule.lessons : [];
    const lessons = [];
    for (const [lessonPosition, lessonDefinition] of definition.lessons.entries()) {
      const currentLesson = matchingInternalChild(currentLessons, lessonDefinition.title);
      const lessonId = internalIdentity(currentLesson, "lesson") ??
        await newId(`curricular-lesson:${modulePosition}:${lessonPosition}`);
      const currentMicrosequences = Array.isArray(currentLesson?.microsequences)
        ? currentLesson.microsequences
        : [];
      const microsequences = [];
      for (const [microsequencePosition, microsequenceDefinition] of
        lessonDefinition.microsequences.entries()) {
        const currentMicrosequence = matchingInternalChild(
          currentMicrosequences,
          microsequenceDefinition.title
        );
        const microsequenceId = internalIdentity(currentMicrosequence, "microsequence") ??
          await newId(
            `curricular-micro:${modulePosition}:${lessonPosition}:${microsequencePosition}`
          );
        microsequenceIdByText.set(matchingText(microsequenceDefinition.title), microsequenceId);
        microsequences.push({
          microsequenceId,
          position: microsequencePosition,
          title: microsequenceDefinition.title,
          objective: microsequenceDefinition.objective,
          dependencyTitles: microsequenceDefinition.dependencies,
          scopeItemIds: microsequenceDefinition.coverage.map((statement) =>
            scopeIdByText.get(matchingText(statement)))
        });
      }
      lessons.push({ lessonId, position: lessonPosition, title: lessonDefinition.title,
        objective: lessonDefinition.objective, microsequences });
    }
    modules.push({ moduleId, position: modulePosition, title: definition.title,
      objective: definition.objective, lessons });
  }
  for (const moduleValue of modules) {
    for (const lesson of moduleValue.lessons) {
      for (const microsequence of lesson.microsequences) {
        microsequence.dependencyMicrosequenceIds = microsequence.dependencyTitles.map((title) =>
          microsequenceIdByText.get(matchingText(title)));
        delete microsequence.dependencyTitles;
      }
    }
  }
  return {
    courseId: state.course.id,
    expectedCourseRevision: state.course.revision,
    expectedPlanVersion: planVersion(state.plan),
    approved: input.approved,
    curricularMap: {
      audience: input.audience,
      prerequisites: input.prerequisites,
      scopeItems,
      modules
    }
  };
}

function normalizePartMicrosequenceTitles(value) {
  return textList(value, "microssequencias", {
    minimum: 1,
    maximum: 64,
    itemMaximum: 300
  });
}

async function buildProductionPart({ state, titles, progression, title, intent, position, newId }) {
  const map = curricularMapFromPlan(state.plan);
  if (!map || map.approval !== "approved") {
    fail(
      "curricular_map_not_approved",
      "A primeira parte só pode ser preparada depois da aprovação do mapa curricular completo.",
      null,
      409
    );
  }
  const partId = state.part?.id ?? await newId("part");
  const parts = Array.isArray(state.plan?.plan?.parts) ? state.plan.plan.parts : [];
  const mapMicrosequences = internalMapCollections(map).microsequences;
  const entityIds = new Set((state.entities || [])
    .filter((row) => row?.entityType === "microsequence")
    .map((row) => row.entityId));
  const selectedIds = new Set();
  const microsequences = titles.map((microsequenceTitle, position) => {
    const matches = mapMicrosequences.filter((item) =>
      matchingText(item.title) === matchingText(microsequenceTitle));
    if (matches.length !== 1) {
      fail(
        matches.length ? "ambiguous_human_reference" : "human_reference_not_found",
        `A microssequência “${microsequenceTitle}” não corresponde a um ponto único do mapa curricular.`,
        { title: microsequenceTitle },
        matches.length ? 409 : 404
      );
    }
    const microsequenceId = internalIdentity(matches[0], "microsequence");
    if (!microsequenceId || !entityIds.has(microsequenceId)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "O mapa curricular e sua estrutura persistida estão divergentes."
      );
    }
    if (selectedIds.has(microsequenceId)) {
      fail(
        "duplicate_authoring_part_microsequence",
        `A parte repete a microssequência “${microsequenceTitle}”.`,
        { title: microsequenceTitle },
        409
      );
    }
    selectedIds.add(microsequenceId);
    return { microsequenceId, position };
  });
  return {
    courseId: state.course.id,
    expectedCourseRevision: state.course.revision,
    expectedPlanVersion: planVersion(state.plan),
    part: {
      partId,
      position: position ?? state.part?.position ?? parts.length,
      title,
      intent,
      progression,
      microsequences
    }
  };
}

async function resolveTaskContext({ adapter, principal, args, deadlineAt, units = [] }) {
  return await resolveHumanCourseContext({
    adapter,
    principal,
    course: humanCourseTitle(args),
    part: optionalReference(args.parte, "parte") ?? null,
    microsequence: optionalReference(args.microssequencia, "microssequencia") ?? null,
    studyUnits: units,
    source: optionalReference(args.fonte, "fonte") ?? null,
    deadlineAt
  });
}

function focusedPart(plan, resolvedPart = null) {
  if (resolvedPart) return resolvedPart;
  const parts = Array.isArray(plan?.plan?.parts) ? plan.plan.parts : [];
  return parts.at(-1) ?? null;
}

function humanCurricularMap(map, status) {
  if (!map) return { situacao: status };
  return {
    situacao: status,
    publico: map.audience,
    preRequisitos: map.prerequisites,
    modulos: map.modules.map((moduleValue, moduleIndex) => ({
      posicao: moduleIndex + 1,
      titulo: moduleValue.title,
      objetivo: moduleValue.objective,
      licoes: moduleValue.lessons.map((lesson, lessonIndex) => ({
        posicao: lessonIndex + 1,
        titulo: lesson.title,
        objetivo: lesson.objective,
        microssequencias: lesson.microsequences.map((microsequence, index) => ({
          posicao: index + 1,
          titulo: microsequence.title,
          objetivo: microsequence.objective,
          dependencias: microsequence.dependencies,
          cobertura: microsequence.coverage
        }))
      }))
    }))
  };
}

function projectedPlanContext(plan, part) {
  const source = plan?.plan || {};
  const storedMap = curricularMapFromPlan(plan);
  const map = semanticCurricularMap(storedMap);
  const mapStatus = storedMap?.approval === "approved"
    ? "aprovado"
    : storedMap ? "rascunho" : "ainda não proposto";
  const coverageLocations = new Map((map?.scopeItems || []).map((statement) => [
    matchingText(statement),
    []
  ]));
  for (const moduleValue of map?.modules || []) {
    for (const lesson of moduleValue.lessons) {
      for (const microsequence of lesson.microsequences) {
        for (const statement of microsequence.coverage) {
          const locations = coverageLocations.get(matchingText(statement));
          if (locations) locations.push({
            modulo: moduleValue.title,
            licao: lesson.title,
            microssequencia: microsequence.title
          });
        }
      }
    }
  }
  const projectPart = (value) => ({
    posicao: Number(value.position) + 1,
    titulo: value.title,
    intencao: value.intent,
    progressao: value.progression ?? value.progress ?? [],
    microssequencias: Array.isArray(value.microsequences)
      ? value.microsequences.map((item, index) => ({
          posicao: Number(item.productionPosition ?? item.position ?? index) + 1,
          titulo: item.title ?? null
        }))
      : []
  });
  return {
    titulo: source.title ?? null,
    objetivo: source.objective ?? null,
    mapaCurricular: humanCurricularMap(map, mapStatus),
    cobertura: [...coverageLocations.entries()].map(([normalizedStatement, previstaEm]) => ({
      item: map.scopeItems.find((statement) => matchingText(statement) === normalizedStatement),
      situacao: previstaEm.length ? "prevista" : "sem cobertura",
      previstaEm
    })),
    partesDeProducao: Array.isArray(source.parts) ? source.parts.map(projectPart) : [],
    parteEmFoco: part ? projectPart(part) : null
  };
}

async function listUnitsForContext({ adapter, principal, resolved, deadlineAt, limit = 24 }) {
  const scopeKind = resolved.microsequence
    ? "didactic_microsequence"
    : resolved.part
      ? "authoring_part"
      : "course";
  const items = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursorStudyUnitId = null;
  for (let pageIndex = 0; pageIndex < MAX_CONTEXT_PAGES; pageIndex += 1) {
    const cursorKey = cursorStudyUnitId ?? "null";
    if (seenCursors.has(cursorKey)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A paginação de unidades repetiu o mesmo ponto."
      );
    }
    seenCursors.add(cursorKey);
    const page = await adapter.listCourseStudyUnits({
      principal,
      courseId: resolved.course.id,
      expectedRevision: resolved.course.revision,
      scopeKind,
      scopeId: resolved.microsequence?.id ?? resolved.part?.id ?? null,
      cursorStudyUnitId,
      direction: "forward",
      limit,
      maxBytes: 512 * 1024,
      inspectionVersion: 2,
      deadlineAt
    });
    if (!page || typeof page !== "object" || !Array.isArray(page.items)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A lista de unidades é inválida."
      );
    }
    for (const item of page.items) {
      const id = item?.studyUnit?.id;
      if (typeof id !== "string" || !id || seenIds.has(id)) continue;
      seenIds.add(id);
      items.push(item);
    }
    if (page.hasMore !== true) return { items, hasMore: false, nextCursor: null };
    const next = page.nextCursor?.studyUnitId;
    if (typeof next !== "string" || !next) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A lista de unidades perdeu o ponto de retomada."
      );
    }
    cursorStudyUnitId = next;
  }
  throw new AuthoringApiError(
    503,
    "course_service_unavailable",
    "A leitura de unidades excedeu o limite seguro de paginação."
  );
}

function observationBelongsToStudyUnits(item, studyUnitIds) {
  if (item?.target?.kind === "study_unit" && studyUnitIds.has(item.target.id)) return true;
  const paths = [item?.target?.currentPath, item?.target?.observedPath];
  return paths.some((path) => Array.isArray(path) && path.some((entry) =>
    entry?.kind === "study_unit" && studyUnitIds.has(entry.id)));
}

async function readObservations({
  adapter,
  principal,
  resolved,
  args,
  deadlineAt,
  scopeUnits = null
}) {
  const selected = resolved.studyUnits;
  const partStudyUnitIds = !selected.length && !resolved.microsequence && resolved.part
    ? new Set((scopeUnits ?? (await listUnitsForContext({
        adapter, principal, resolved, deadlineAt
      })).items).map((item) => item?.studyUnit?.id).filter(Boolean))
    : null;
  if (partStudyUnitIds?.size === 0) return { items: [] };
  const hierarchies = selected.length
    ? selected.map(({ studyUnit }) => ({
        target: { kind: "study_unit", id: studyUnit.id },
        includeDescendants: false
      }))
    : [resolved.microsequence
        ? {
            target: { kind: "didactic_microsequence", id: resolved.microsequence.id },
            includeDescendants: true
          }
        : { target: { kind: "course", id: resolved.course.id }, includeDescendants: true }];
  const items = [];
  for (const hierarchy of hierarchies) {
    let cursor = null;
    const seen = new Set();
    while (true) {
      const page = await adapter.getCourseAnchoredAnnotations({
        principal,
        courseId: resolved.course.id,
        expectedCourseRevision: resolved.course.revision,
        annotationSetVersion: null,
        query: {
          mode: "inbox",
          origins: [],
          channels: [],
          states: args.somenteAbertas === false ? [] : ["open"],
          categories: [],
          includeUncategorized: true,
          subjectIds: [],
          hierarchy,
          annotationId: null
        },
        cursor,
        limit: 24,
        deadlineAt
      });
      items.push(...(Array.isArray(page?.items) ? page.items : []));
      if (page?.nextCursor == null) break;
      if (typeof page.nextCursor !== "string" || !page.nextCursor || seen.has(page.nextCursor)) {
        throw new AuthoringApiError(
          503,
          "course_service_unavailable",
          "A paginação de observações perdeu o ponto de retomada."
        );
      }
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  }
  const uniqueItems = [...new Map(items.map((item, index) => [
    item.annotationId ?? item.id ?? `${index}:${JSON.stringify(item)}`,
    item
  ])).values()];
  return {
    items: partStudyUnitIds === null
      ? uniqueItems
      : uniqueItems.filter((item) => observationBelongsToStudyUnits(item, partStudyUnitIds))
  };
}

function humanDesignOrigin(value) {
  return {
    automatic: "calibração contextual",
    author: "definida pela pessoa autora",
    research_condition: "condição de pesquisa",
    system_default: "escolha contextual pendente"
  }[value] ?? "origem não informada";
}

function humanDesignScope(value) {
  return {
    course: "curso",
    module: "módulo",
    lesson: "lição",
    didactic_microsequence: "microssequência",
    study_unit: "unidade de estudo"
  }[value] ?? null;
}

function humanParameterLabel(parameterId, definitionById) {
  const definition = definitionById.get(parameterId) ??
    COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameterId);
  if (!definition?.label) return "Parâmetro pedagógico";
  return definition.label.replace(/\bUnidades?\b/gu, (term) => term.toLocaleLowerCase("pt-BR"));
}

function projectConfiguration(read) {
  const definitionById = new Map((read?.definitions ?? []).map((definition) => [
    definition.id,
    definition
  ]));
  const effectivePolicy = read?.componentPolicy?.effectiveAssignment ?? null;
  const parameters = Array.isArray(read?.parameters)
    ? read.parameters.map((parameter) => ({
        nome: humanParameterLabel(parameter.parameterId, definitionById),
        campo: definitionById.get(parameter.parameterId)?.humanField,
        unidade: definitionById.get(parameter.parameterId)?.unitLabel,
        modo: parameter.effectiveAssignment?.mode,
        valorLocal: parameter.localAssignment?.value ?? null,
        valorEfetivo: parameter.effectiveAssignment?.value ?? null,
        herdado: parameter.effectiveAssignment?.inherited ?? false,
        origem: humanDesignOrigin(parameter.effectiveAssignment?.origin),
        motivo: parameter.effectiveAssignment?.reason ?? null,
        escopoDeOrigem: humanDesignScope(parameter.effectiveAssignment?.sourceScope?.kind),
        conflitos: structuredClone(parameter.conflicts ?? [])
      }))
    : [];
  return {
    escopo: read?.scopeContext?.current?.label ?? null,
    parametros: parameters,
    precisaDeCalibracaoContextual: Array.isArray(read?.parameters) &&
      read.parameters.some((parameter) =>
        parameter?.effectiveAssignment?.value === null),
    direcaoEditorial: {
      local: read?.guidance?.localAssignment?.guidance ?? null,
      efetiva: Array.isArray(read?.guidance?.effectiveAssignments)
        ? read.guidance.effectiveAssignments.map((assignment) => ({
            orientacao: assignment.guidance,
            origem: humanDesignOrigin(assignment.origin),
            motivo: assignment.reason,
            escopoDeOrigem: humanDesignScope(assignment.sourceScope?.kind)
          }))
        : []
    },
    politicaDeComponentes: effectivePolicy == null ? null : {
      politica: withoutTechnicalState(effectivePolicy.policy),
      herdada: effectivePolicy.inherited ?? false,
      origem: humanDesignOrigin(effectivePolicy.origin),
      motivo: effectivePolicy.reason ?? null,
      escopoDeOrigem: humanDesignScope(effectivePolicy.sourceScope?.kind)
    }
  };
}

function projectFocalPlanItems(items, targetIds, label) {
  if (!Array.isArray(items) || !Array.isArray(targetIds)) {
    fail("course_service_unavailable", `O inventário focal de ${label} está incompleto.`, null, 503);
  }
  const itemById = new Map(items.map((item, index) => [item?.id, {
    item,
    position: index + 1
  }]));
  return targetIds.map((targetId) => {
    const indexed = itemById.get(targetId);
    const item = indexed?.item;
    if (!item ||
        typeof item.statement !== "string" || !item.statement.trim()) {
      fail("course_service_unavailable", `O inventário focal de ${label} divergiu do plano.`, null, 503);
    }
    return {
      posicao: indexed.position,
      ideia: item.statement,
      ...(typeof item.description === "string" && item.description.trim()
        ? { descricao: item.description }
        : {})
    };
  });
}

function projectRequiredCurriculumCoverage(plan, microsequenceId) {
  const items = Array.isArray(plan?.curriculumScopeItems)
    ? plan.curriculumScopeItems
    : [];
  return items.flatMap((item, index) => {
    const belongsToMicrosequence = Array.isArray(item?.curriculumTargets) &&
      item.curriculumTargets.some((target) =>
        Array.isArray(target?.didacticMicrosequenceIds) &&
        target.didacticMicrosequenceIds.includes(microsequenceId));
    if (!belongsToMicrosequence) return [];
    if (typeof item.statement !== "string" || !item.statement.trim()) {
      fail(
        "course_service_unavailable",
        "A cobertura curricular focal está incompleta.",
        null,
        503
      );
    }
    return [{ posicao: index + 1, item: item.statement }];
  });
}

function hasEffectiveStudyUnitOverride(read) {
  return (Array.isArray(read?.parameters) && read.parameters.some((parameter) =>
    parameter?.effectiveAssignment?.sourceScope?.kind === "study_unit")) ||
    (Array.isArray(read?.guidance?.effectiveAssignments) &&
      read.guidance.effectiveAssignments.some((assignment) =>
        assignment?.sourceScope?.kind === "study_unit")) ||
    read?.componentPolicy?.effectiveAssignment?.sourceScope?.kind === "study_unit";
}

function curriculumMicrosequenceOrder(plan) {
  const order = new Map();
  for (const moduleValue of plan?.curriculum?.modules ?? []) {
    for (const lesson of moduleValue?.lessons ?? []) {
      for (const microsequence of lesson?.microsequences ?? []) {
        if (typeof microsequence?.id !== "string" || !microsequence.id ||
            order.has(microsequence.id)) {
          fail(
            "course_service_unavailable",
            "A ordem das microssequências no mapa curricular é inválida.",
            null,
            503
          );
        }
        order.set(microsequence.id, order.size);
      }
    }
  }
  return order;
}

function establishedAnalysisUnitsInRange(plan, order, afterOrAt, before) {
  return (Array.isArray(plan?.instructionalAnalysisUnits)
    ? plan.instructionalAnalysisUnits
    : []).map((item, index) => ({ ...item, currentPosition: index + 1 }))
    .filter((item) => {
      if (!item?.introducedAt ||
          typeof item.introducedAt !== "object" ||
          Array.isArray(item.introducedAt)) return false;
      const introducedOrder = order.get(item.introducedAt.didacticMicrosequenceId);
      if (!Number.isSafeInteger(introducedOrder)) {
        fail(
          "course_service_unavailable",
          "A introdução de uma ideia não pertence ao mapa curricular.",
          null,
          503
        );
      }
      return introducedOrder >= afterOrAt && introducedOrder < before;
    });
}

function humanAnalysisUnits(items) {
  return items.map((item) => ({
    posicao: item.currentPosition,
    ideia: item.statement,
    ...(typeof item.description === "string" && item.description.trim()
      ? { descricao: item.description }
      : {})
  }));
}

function materializationRepertoire(plan, part) {
  const order = curriculumMicrosequenceOrder(plan);
  const currentOrders = (part?.microsequences ?? []).map(({ id }) => order.get(id));
  if (!currentOrders.length || currentOrders.some((value) => !Number.isSafeInteger(value))) {
    fail(
      "course_service_unavailable",
      "A parte não corresponde ao mapa curricular corrente.",
      null,
      503
    );
  }
  const firstOrder = Math.min(...currentOrders);
  return {
    order,
    firstOrder,
    establishedBeforePart: establishedAnalysisUnitsInRange(
      plan,
      order,
      Number.NEGATIVE_INFINITY,
      firstOrder
    )
  };
}

function projectMaterializationPart(planRead, part, designReads, unitDesignReads = []) {
  const plan = planRead?.plan ?? {};
  const microsequences = Array.isArray(part?.microsequences) ? part.microsequences : [];
  const partPosition = Number(part?.position);
  if (!microsequences.length || !Array.isArray(designReads) ||
      designReads.length !== microsequences.length ||
      !Number.isSafeInteger(partPosition) || partPosition < 0) {
    fail("course_service_unavailable", "O recorte focal da parte está incompleto.", null, 503);
  }
  const repertoire = materializationRepertoire(plan, part);
  return {
    posicao: partPosition + 1,
    titulo: part.title,
    intencao: part.intent,
    ideiasEstabelecidas: humanAnalysisUnits(repertoire.establishedBeforePart),
    microssequencias: microsequences.map((microsequence, index) => {
      const design = designReads[index];
      const targets = design?.targetPlanItems;
      const configuration = projectConfiguration(design);
      if (typeof microsequence.goal !== "string" || !microsequence.goal.trim()) {
        fail(
          "course_service_unavailable",
          "A finalidade de uma microssequência divergiu do planejamento.",
          null,
          503
        );
      }
      const existingUnitOverrides = unitDesignReads
        .filter((entry) => entry.microsequenceId === microsequence.id &&
          hasEffectiveStudyUnitOverride(entry.design))
        .map((entry) => {
          const unitConfiguration = projectConfiguration(entry.design);
          return {
            posicao: Number(entry.unit.studyUnit.position),
            titulo: entry.unit.studyUnit.title,
            configuracao: unitConfiguration
          };
        })
        .sort((left, right) => left.position - right.position);
      return {
        posicao: Number(microsequence.productionPosition ?? microsequence.position ?? index) + 1,
        titulo: microsequence.title,
        objetivo: microsequence.goal,
        curriculo: {
          modulo: microsequence.curriculumPath?.moduleTitle ?? null,
          licao: microsequence.curriculumPath?.lessonTitle ?? null
        },
        coberturaObrigatoria: projectRequiredCurriculumCoverage(
          plan,
          microsequence.id
        ),
        ideiasPlanejadas: projectFocalPlanItems(
          plan.instructionalAnalysisUnits,
          targets?.instructionalAnalysisUnitIds,
          "unidades de análise"
        ),
        ideiasEstabelecidasDesdeOInicioDaParte: humanAnalysisUnits(
          establishedAnalysisUnitsInRange(
            plan,
            repertoire.order,
            repertoire.firstOrder,
            repertoire.order.get(microsequence.id)
          )
        ),
        requisitosDeEvidencia: projectFocalPlanItems(
          plan.evidenceRequirements,
          targets?.evidenceRequirementIds,
          "requisitos de evidência"
        ),
        configuracao: configuration,
        ajustesExistentesDasUnidades: existingUnitOverrides
      };
    })
  };
}

HUMAN_TASK_HANDLERS.retomar_curso = async ({ adapter, principal, args, deadlineAt }) => {
  if (args.titulo === undefined) {
    exactFields(args, new Set(["titulo"]));
    const page = await adapter.listCourses({
      principal,
      query: "",
      limit: 12,
      beforeUpdatedAt: null,
      beforeId: null,
      deadlineAt
    });
    return result(
      page?.items?.length === 1
        ? "Encontrei um curso para retomar."
        : `Encontrei ${page?.items?.length ?? 0} cursos para retomar.`,
      {
        nextDecision: page?.items?.length === 1
          ? "Quer continuar do ponto atual?"
          : "Qual curso você quer retomar?",
        context: { courses: page?.items ?? [] }
      }
    );
  }
  const titulo = text(args.titulo, "titulo", 300);
  const resolved = await resolveHumanCourseContext({
    adapter, principal, course: titulo, deadlineAt
  });
  const plan = await loadPlan(adapter, principal, resolved.course, deadlineAt);
  const part = focusedPart(plan);
  const map = curricularMapFromPlan(plan);
  return result(`Retomei o curso “${resolved.course.title}”.`, {
    deepLink: courseDeepLink(adapter, resolved.course, "planning",
      part?.id ? [["authoringPartId", part.id]] : []),
    nextDecision: map?.approval !== "approved"
      ? map
        ? "Quer revisar ou aprovar o mapa curricular?"
        : "Quer propor o mapa curricular global?"
      : part
        ? `Quer revisar a parte ${Number(part.position) + 1} ou preparar a próxima?`
        : "A etapa seguinte é a progressão focal da primeira parte de produção.",
    context: projectedPlanContext(plan, part)
  });
};

HUMAN_TASK_HANDLERS.consultar_planejamento = async ({
  adapter, principal, args, deadlineAt
}) => {
  const resolved = await resolveTaskContext({ adapter, principal, args, deadlineAt });
  const plan = resolved.plan || await loadPlan(adapter, principal, resolved.course, deadlineAt);
  const part = focusedPart(plan, resolved.part);
  const map = curricularMapFromPlan(plan);
  const mapStatus = map?.approval === "approved" ? "aprovado" : map ? "em rascunho" : "ausente";
  return result(`Li o mapa curricular global; ele está ${mapStatus}.`, {
    deepLink: courseDeepLink(adapter, resolved.course, "planning",
      part?.id ? [["authoringPartId", part.id]] : []),
    nextDecision: map?.approval !== "approved"
      ? map
        ? "Quer aprovar o mapa ou mudar cobertura, ordem ou ênfase?"
        : "Quer propor o mapa curricular completo?"
      : args.parte === undefined
        ? part
          ? "Quer revisar esta parte ou preparar a próxima?"
          : "A etapa seguinte é a progressão focal da primeira parte de produção."
        : "Quer alterar a progressão desta parte?",
    context: projectedPlanContext(plan, part)
  });
};

HUMAN_TASK_HANDLERS.preparar_materializacao = async ({
  adapter, principal, args, deadlineAt
}) => {
  const resolved = await resolveTaskContext({ adapter, principal, args, deadlineAt });
  const part = resolved.part;
  const microsequences = Array.isArray(part?.microsequences) ? part.microsequences : [];
  const [design, existingPage] = await Promise.all([
    Promise.all(microsequences.map((microsequence) => adapter.getCourseDesign({
      principal,
      courseId: resolved.course.id,
      scopeKind: "didactic_microsequence",
      scopeRef: microsequence.id,
      childLimit: 32,
      childCursor: null,
      deadlineAt
    }))),
    listUnitsForContext({ adapter, principal, resolved, deadlineAt })
  ]);
  if (existingPage.items.length > 64) {
    fail(
      "human_materialization_part_too_large",
      "A parte excede 64 unidades e não cabe numa materialização atômica.",
      null,
      413
    );
  }
  const unitDesign = await Promise.all(existingPage.items.map(async (unit) => ({
    unit,
    microsequenceId: unit?.curriculumPath?.didacticMicrosequence?.id,
    design: await adapter.getCourseDesign({
      principal,
      courseId: resolved.course.id,
      scopeKind: "study_unit",
      scopeRef: unit.studyUnit.id,
      childLimit: 1,
      childCursor: null,
      deadlineAt
    })
  })));
  const projectedPart = projectMaterializationPart(
    resolved.plan,
    part,
    design,
    unitDesign
  );
  return result(`Preparei o recorte focal da parte ${Number(part.position) + 1}: ${part.title}.`, {
    deepLink: null,
    nextDecision: null,
    context: {
      parte: projectedPart
    }
  });
};

HUMAN_TASK_HANDLERS.consultar_configuracao = async ({
  adapter, principal, args, deadlineAt
}) => {
  const unitRefs = args.unidade === undefined
    ? []
    : [humanReference(args.unidade, "unidade")];
  const resolved = await resolveTaskContext({
    adapter, principal, args, deadlineAt, units: unitRefs
  });
  const unit = resolved.studyUnits[0] ?? null;
  const scopeRef = unit?.studyUnit?.id ?? resolved.microsequence?.id ?? resolved.course.id;
  const scopeKind = unit ? "study_unit" : resolved.microsequence
    ? "didactic_microsequence"
    : "course";
  const configuration = await adapter.getCourseDesign({
    principal,
    courseId: resolved.course.id,
    scopeKind,
    scopeRef,
    childLimit: 32,
    childCursor: null,
    deadlineAt
  });
  return result("Li a configuração pedagógica e a direção editorial vigentes.", {
    deepLink: courseDeepLink(adapter, resolved.course, "parameters",
      scopeKind === "study_unit"
        ? [["studyUnitId", scopeRef]]
        : scopeKind === "didactic_microsequence"
          ? [["didacticMicrosequenceId", scopeRef]]
          : []),
    nextDecision: "Quer manter a herança ou fixar alguma condição?",
    context: {
      configuracao: projectConfiguration(configuration),
      aplicacaoNaUnidade: unit?.authorship?.design?.application ?? null
    }
  });
};

HUMAN_TASK_HANDLERS.consultar_observacoes = async ({
  adapter, principal, args, deadlineAt
}) => {
  const units = humanReferenceList(args.unidades, "unidades", { optional: true }) ?? [];
  const resolved = await resolveTaskContext({ adapter, principal, args, deadlineAt, units });
  const observations = await readObservations({ adapter, principal, resolved, args, deadlineAt });
  const count = Array.isArray(observations?.items) ? observations.items.length : 0;
  return result(`${count} ${count === 1 ? "observação encontrada" : "observações encontradas"}.`, {
    deepLink: courseDeepLink(adapter, resolved.course, "review"),
    nextDecision: count ? "Quer preparar uma revisão coerente dessas observações?" : null,
    context: { observations }
  });
};

HUMAN_TASK_HANDLERS.preparar_revisao = async ({
  adapter, principal, args, deadlineAt
}) => {
  const units = humanReferenceList(args.unidades, "unidades", { optional: true }) ?? [];
  const resolved = await resolveTaskContext({ adapter, principal, args, deadlineAt, units });
  const unitPage = units.length
    ? { items: resolved.studyUnits }
    : await listUnitsForContext({ adapter, principal, resolved, deadlineAt });
  const observations = await readObservations({
    adapter,
    principal,
    resolved,
    args: { ...args, somenteAbertas: true },
    deadlineAt,
    scopeUnits: unitPage.items
  });
  return result("Preparei o contexto pedagógico da revisão sem aplicar mudanças.", {
    deepLink: courseDeepLink(adapter, resolved.course, "review"),
    nextDecision: "Quais correções coerentes você quer aplicar?",
    context: {
      observations,
      studyUnits: unitPage?.items ?? [],
      plan: resolved.plan ? projectedPlanContext(resolved.plan, resolved.part) : null
    }
  });
};

HUMAN_TASK_HANDLERS.consultar_fontes = async ({
  adapter, principal, args, deadlineAt
}) => {
  const units = args.unidade === undefined
    ? []
    : [humanReference(args.unidade, "unidade")];
  const resolved = await resolveTaskContext({ adapter, principal, args, deadlineAt, units });
  const unit = resolved.studyUnits[0]?.studyUnit ?? null;
  const mode = resolved.source ? "source" : unit ? "target" : "catalog";
  const sources = await adapter.getCourseSources({
    principal,
    courseId: resolved.course.id,
    expectedRevision: resolved.course.revision,
    mode,
    sourceId: resolved.source?.sourceId ?? null,
    targetKind: unit ? "study_unit" : null,
    targetId: unit?.id ?? null,
    cursor: null,
    limit: mode === "catalog" ? 24 : 1,
    deadlineAt
  });
  const context = args.busca === undefined || !Array.isArray(sources?.items)
    ? sources
    : {
        ...sources,
        items: sources.items.filter((item) => JSON.stringify(item)
          .toLocaleLowerCase("pt-BR")
          .includes(text(args.busca, "busca", 300).toLocaleLowerCase("pt-BR")))
      };
  return result("Li as fontes e âncoras do recorte solicitado.", {
    deepLink: courseDeepLink(adapter, resolved.course, "content",
      unit ? [["studyUnitId", unit.id]] : []),
    nextDecision: "Quer adotar, contestar ou vincular alguma fonte?",
    context: { sources: context,
      ...(mode === "source" ? { arquivosParaConteudo: (context.items ?? []).flatMap(source =>
        (source.attachments ?? []).map((value, index) => {
          const attachment = normalizeCourseSourceAttachment(value, { persisted: true });
          return { rotulo: `PDF ${index + 1}`, sourceAttachmentTarget: { kind: "source_attachment",
            sourceId: source.sourceId, sourceRevision: source.revision, contentHash: attachment.contentHash } };
        })) } : {})
    }
  });
};

function componentLookupText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR");
}

function componentSearchProjection(catalog) {
  return {
    coverage: catalog.coverage,
    candidates: catalog.candidates.map(({ packageId, version, ...candidate }) => ({
      referencia: `${packageId}@${version}`,
      ...candidate
    }))
  };
}

function selectedComponentCandidate(reference, candidates) {
  const normalized = componentLookupText(reference);
  const direct = String(reference).trim().match(/^(.+)@(\d+\.\d+\.\d+)$/u);
  if (direct) return { packageId: direct[1], version: direct[2] };
  return candidates.find((candidate) => [candidate.packageId, candidate.label]
    .some((value) => componentLookupText(value) === normalized)) ?? null;
}

const COMPONENT_STUDY_UNIT_ROLE = Object.freeze({
  teoria: "theory",
  pratica: "practice"
});
const COMPONENT_SLOT = Object.freeze({
  conteudo: "content",
  resposta: "response",
  feedback: "feedback"
});

function componentFilter(value, field, mapping) {
  if (value === undefined) return "";
  const humanValue = text(value, field, 20);
  const normalized = mapping[humanValue];
  if (!normalized) {
    fail("invalid_human_task_argument", `${field} é inválido.`, { field });
  }
  return normalized;
}

function componentVocabularyFilter(value, field, records) {
  if (value === undefined) return [];
  const requested = normalizeFacetText(text(value, field, 120));
  const matches = records.filter((record) => [record.label, ...(record.aliases || [])]
    .some((candidate) => normalizeFacetText(candidate) === requested));
  if (matches.length !== 1) {
    fail(
      "invalid_human_task_argument",
      `${field} não corresponde a um termo humano inequívoco do catálogo.`,
      { field }
    );
  }
  return [matches[0].id];
}

HUMAN_TASK_HANDLERS.consultar_componentes = async ({ args }) => {
  if (!Object.keys(args).length) {
    fail("missing_human_task_argument", "Informe função, busca, componente ou filtro focal.");
  }
  const query = [args.busca, args.funcao, args.componente]
    .filter((value) => value !== undefined)
    .map((value, index) => text(value, `consulta[${index}]`, 500))
    .join(" ");
  const catalog = RESOURCE_CATALOG.search({
    query,
    limit: 8,
    studyUnitRole: componentFilter(
      args.papel,
      "papel",
      COMPONENT_STUDY_UNIT_ROLE
    ),
    slot: componentFilter(args.lugar, "lugar", COMPONENT_SLOT),
    structureIds: componentVocabularyFilter(
      args.estrutura,
      "estrutura",
      RESOURCE_VOCABULARIES.structures
    ),
    taskOperationIds: componentVocabularyFilter(
      args.operacao,
      "operacao",
      RESOURCE_VOCABULARIES.taskOperations
    )
  });
  if (args.componente !== undefined) {
    const selected = selectedComponentCandidate(args.componente, catalog.candidates);
    const inspected = selected
      ? RESOURCE_CATALOG.contracts([selected]).items[0]
      : null;
    if (inspected?.status === "ok") {
      const definition = inspected.definition;
      return result("Li os detalhes de uso do componente escolhido.", {
        nextDecision: "Use estes detalhes ao compor o conteúdo ou consulte outra representação se ela não cumprir a função.",
        context: {
          componentAuthoringContract: {
            referencia: `${definition.package}@${definition.version}`,
            rotulo: definition.manifest.label,
            finalidade: definition.manifest.purpose,
            slots: definition.manifest.slots,
            ...(definition.manifest.tool ? { ferramenta: structuredClone(definition.manifest.tool) } : {}),
            compatibilidadeDeResposta: definition.manifest.responseCompatibility,
            limitacoes: definition.manifest.limitations,
            contrato: definition.contract,
            schema: definition.schema,
            ...(Object.hasOwn(definition, "practiceTargets")
              ? { practiceTargets: definition.practiceTargets }
              : {}),
            modeloDeInstancia: {
              id: "identificador-local-unico",
              package: definition.package,
              version: definition.version,
              data: definition.contract.example
            }
          }
        }
      });
    }
  }
  return result("Encontrei representações candidatas para a função instrucional.", {
    nextDecision: "Qual representação cumpre melhor a função desta unidade?",
    context: { components: componentSearchProjection(catalog) }
  });
};

HUMAN_TASK_HANDLERS.criar_curso = async ({ adapter, principal, args, deadlineAt }) => {
  const title = text(args.titulo, "titulo", 300);
  const objective = text(args.objetivo, "objetivo", 2000);
  const receipt = await executeTrustedCourseWrite({
    load: async () => ({ title, objective }),
    build: async (state) => state,
    commit: async ({ requestId, ...value }) => await adapter.createCourse({
      principal,
      ...value,
      requestId,
      deadlineAt
    })
  });
  const course = {
    id: receipt.courseId ?? receipt.course?.courseId,
    title: receipt.title ?? receipt.course?.title ?? title,
    deepLink: receipt.deepLink ?? null
  };
  return result(`Criei o curso privado “${course.title}”.`, {
    deepLink: courseDeepLink(adapter, course, "planning"),
    nextDecision: "Quer propor o mapa curricular global?",
    context: { curso: { titulo: course.title } }
  });
};

HUMAN_TASK_HANDLERS.salvar_mapa_curricular = async ({
  adapter, principal, args, deadlineAt
}) => {
  const course = humanCourseTitle(args);
  const input = normalizeCurricularMapArguments(args);
  let savedCourse = null;
  await executeTrustedCourseWrite({
    load: async () => {
      const resolved = await resolveHumanCourseContext({
        adapter, principal, course, deadlineAt
      });
      const plan = resolved.plan || await loadPlan(
        adapter,
        principal,
        resolved.course,
        deadlineAt
      );
      savedCourse = {
        ...resolved.course,
        revision: Number(plan.courseRevision)
      };
      return { ...resolved, course: savedCourse, plan };
    },
    build: async (state, { newId }) => await buildCurricularMapWrite({ state, input, newId }),
    commit: async ({ requestId, ...value }) => await adapter.saveCourseCurricularMap({
      principal, ...value, requestId, deadlineAt
    })
  });
  const publicMap = semanticMapFromInput(input);
  return result(input.approved
    ? "Mapa curricular aprovado."
    : "Salvei o mapa curricular como rascunho para inspeção.", {
    deepLink: courseDeepLink(adapter, savedCourse, "planning"),
    nextDecision: input.approved
      ? "A etapa seguinte é a progressão focal da primeira parte de produção."
      : "Aprova este mapa curricular ou quer mudar cobertura, ordem ou ênfase?",
    context: {
      mapaCurricular: {
        ...humanCurricularMap(publicMap, input.approved ? "aprovado" : "rascunho"),
        itensDeEscopo: publicMap.scopeItems
      }
    }
  });
};

HUMAN_TASK_HANDLERS.salvar_parte = async ({ adapter, principal, args, deadlineAt }) => {
  const course = humanCourseTitle(args);
  const partReference = optionalReference(args.parte, "parte");
  const title = text(args.titulo, "titulo", 300);
  const intent = text(args.intencao, "intencao", 4000);
  if (args.posicao != null && (!Number.isSafeInteger(args.posicao) || args.posicao < 1 || args.posicao > 64)) {
    fail("invalid_authoring_part_position", "A posição do lote deve estar entre 1 e 64.");
  }
  const titles = normalizePartMicrosequenceTitles(args.microssequencias);
  const progression = textList(args.progressao, "progressao", {
    minimum: 1,
    maximum: 64,
    itemMaximum: 1000
  });
  let savedPartId = null;
  let savedCourse = null;
  const receipt = await executeTrustedCourseWrite({
    load: async () => {
      const resolved = await resolveHumanCourseContext({
        adapter, principal, course, part: partReference ?? null, deadlineAt
      });
      savedCourse = resolved.course;
      const plan = resolved.plan || await loadPlan(
        adapter,
        principal,
        resolved.course,
        deadlineAt
      );
      const currentCourse = {
        ...resolved.course,
        revision: Number(plan.courseRevision)
      };
      return {
        ...resolved,
        course: currentCourse,
        plan,
        entities: await loadAllCourseEntities(
          adapter,
          principal,
          currentCourse,
          deadlineAt
        )
      };
    },
    build: async (state, { newId }) => {
      const built = await buildProductionPart({
        state, titles, progression, title, intent, position: args.posicao == null ? null : args.posicao - 1, newId
      });
      savedPartId = built.part.partId;
      return built;
    },
    commit: async ({ requestId, ...value }) => await adapter.saveCourseAuthoringPart({
      principal, ...value, requestId, deadlineAt
    })
  });
  return result(partReference === undefined
    ? `Preparei a parte de produção: ${title}.`
    : `Atualizei a parte de produção: ${title}.`, {
    deepLink: courseDeepLink(adapter, savedCourse, "planning", [["authoringPartId", savedPartId]]),
    nextDecision: "A parte está pronta para leitura focal e produção.",
    context: {
      parte: { titulo: title, intencao: intent, microssequencias: titles, progressao: progression },
      changed: receipt.changed !== false
    }
  });
};

HUMAN_TASK_HANDLERS.materializar_parte = async ({
  adapter, principal, args, deadlineAt
}) => await materializeHumanCoursePart({
  adapter,
  principal,
  course: humanCourseTitle(args),
  part: humanReference(args.parte, "parte"),
  units: safeClone(args.unidades, "unidades", 480 * 1024),
  deadlineAt
});

HUMAN_TASK_HANDLERS.aplicar_correcoes = async ({
  adapter, principal, args, deadlineAt
}) => await applyHumanCourseCorrections({
  adapter,
  principal,
  course: humanCourseTitle(args),
  corrections: safeClone(args.correcoes, "correcoes", 480 * 1024),
  deadlineAt
});

function designScope(resolved) {
  const unitId = resolved.studyUnits?.[0]?.studyUnit?.id ?? null;
  return unitId
    ? { kind: "study_unit", ref: unitId }
    : resolved.microsequence
    ? { kind: "didactic_microsequence", ref: resolved.microsequence.id }
    : { kind: "course", ref: resolved.course.id };
}

async function applyDesignCommand({
  adapter, principal, course, microsequence, studyUnit, command, deadlineAt
}) {
  return await executeTrustedCourseWrite({
    load: async () => await resolveHumanCourseContext({
      adapter,
      principal,
      course,
      microsequence: microsequence ?? null,
      studyUnits: studyUnit == null ? [] : [studyUnit],
      deadlineAt
    }),
    build: async (resolved) => ({
      courseId: resolved.course.id,
      expectedCourseRevision: resolved.course.revision,
      command: normalizeCourseDesignCommand(command(resolved), {
        knownComponentRefs: RESOURCE_PACKAGE_REGISTRY.listCatalog()
          .map(({ id, version }) => `${id}@${version}`)
      })
    }),
    commit: async ({ requestId, courseId, ...value }) => await adapter.applyCourseDesignCommand({
      principal, courseId, ...value, requestId, deadlineAt
    })
  });
}

HUMAN_TASK_HANDLERS.ajustar_configuracao = async ({
  adapter, principal, args, deadlineAt
}) => {
  const course = humanCourseTitle(args);
  const microsequence = optionalReference(args.microssequencia, "microssequencia");
  const studyUnit = optionalReference(args.unidade, "unidade");
  const origin = {
    automatica: "automatic",
    fixada_pelo_autor: "author",
    pesquisa: "research_condition"
  }[args.condicao];
  if (!origin) {
    fail("invalid_human_task_argument", "condicao é inválida.", { field: "condicao" });
  }
  if (microsequence !== undefined && studyUnit !== undefined) {
    fail(
      "ambiguous_human_scope",
      "Informe microssequência ou unidade de estudo, não os dois escopos ao mesmo tempo.",
      null,
      409
    );
  }
  const parameters = args.parametros === undefined ? null : plainObject(args.parametros, "parametros");
  const automaticFields = args.automaticos === undefined ? [] : args.automaticos;
  if (!Array.isArray(automaticFields) || automaticFields.some((field) => !PARAMETER_FIELDS.includes(field)) ||
      new Set(automaticFields).size !== automaticFields.length) {
    fail("invalid_human_task_argument", "A seleção de parâmetros automáticos é inválida.");
  }
  if (!parameters && !automaticFields.length && args.direcaoEditorial === undefined) {
    fail("missing_human_task_argument", "Informe parâmetros, delegação automática e/ou direção editorial.");
  }
  if (origin === "automatic" && parameters && Object.values(parameters).some((value) => value !== null)) {
    fail("invalid_human_task_argument", "Para delegar sem valor, use automaticos. Escolhas automáticas são registradas durante a materialização.");
  }
  const guidance = args.direcaoEditorial === undefined
    ? undefined
    : args.direcaoEditorial === null
      ? null
      : text(args.direcaoEditorial, "direcaoEditorial", 4000);
  const preflightState = await resolveHumanCourseContext({
    adapter,
    principal,
    course,
    microsequence: microsequence ?? null,
    studyUnits: studyUnit == null ? [] : [studyUnit],
    deadlineAt
  });
  const knownComponentRefs = RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .map(({ id, version }) => `${id}@${version}`);
  const commands = [];
  if (parameters) {
    exactFields(parameters, new Set(Object.keys(PARAMETER_FIELD_TO_ID)));
    if (!Object.keys(parameters).length) {
      fail("missing_human_task_argument", "Informe ao menos um parâmetro pedagógico.");
    }
    for (const [field, value] of Object.entries(parameters)) {
      const parameterId = PARAMETER_FIELD_TO_ID[field];
      if (!COURSE_DESIGN_PARAMETER_DEFINITIONS.some(({ id }) => id === parameterId)) {
        fail("invalid_human_task_argument", `${field} não pertence ao catálogo pedagógico.`);
      }
      commands.push(normalizeCourseDesignCommand(value === null
          ? { type: "clear_parameter", scope: designScope(preflightState), parameterId }
          : {
              type: "set_parameter",
              scope: designScope(preflightState),
              parameterId,
              value: safeClone(value, field, 16 * 1024),
              origin,
              reason: origin === "automatic"
                ? "Valor calibrado automaticamente para o contexto corrente."
                : origin === "research_condition"
                  ? "Condição de pesquisa fixada explicitamente."
                  : "Condição fixada explicitamente pela pessoa autora."
            }, { knownComponentRefs }));
    }
  }
  for (const field of automaticFields) {
    if (parameters && Object.hasOwn(parameters, field)) {
      fail("invalid_human_task_argument", "Um parâmetro não pode ser fixado e delegado no mesmo pedido.");
    }
    commands.push(normalizeCourseDesignCommand({ type: "delegate_parameter",
      scope: designScope(preflightState), parameterId: PARAMETER_FIELD_TO_ID[field],
      reason: "A pessoa autora delegou a escolha ao contexto de produção." }));
  }
  if (guidance !== undefined) {
    commands.push(normalizeCourseDesignCommand(guidance === null
      ? { type: "clear_guidance", scope: designScope(preflightState) }
      : {
          type: "set_guidance",
          scope: designScope(preflightState),
          guidance,
          origin,
          reason: origin === "automatic"
            ? "Direção editorial calibrada automaticamente para o contexto corrente."
            : origin === "research_condition"
              ? "Direção editorial fixada como condição de pesquisa."
            : "Direção editorial fixada explicitamente pela pessoa autora."
        }, { knownComponentRefs }));
  }
  const preservedOrigins = new Set();
  let applicableCommands = commands;
  if (origin === "automatic") {
    const currentScope = designScope(preflightState);
    const currentDesign = await adapter.getCourseDesign({
      principal,
      courseId: preflightState.course.id,
      scopeKind: currentScope.kind,
      scopeRef: currentScope.ref,
      childLimit: 1,
      childCursor: null,
      deadlineAt
    });
    const fixedOrigins = new Set(["author", "research_condition"]);
    const protectedParameterOrigins = new Map((currentDesign?.parameters ?? [])
      .filter((parameter) => parameter?.effectiveAssignment?.mode === "fixed" &&
        fixedOrigins.has(parameter?.effectiveAssignment?.origin))
      .map((parameter) => [
        parameter.parameterId,
        parameter.effectiveAssignment.origin
      ]));
    const protectedGuidanceOrigin = (currentDesign?.guidance?.effectiveAssignments ?? [])
      .map((assignment) => assignment?.origin)
      .find((currentOrigin) => fixedOrigins.has(currentOrigin)) ?? null;
    applicableCommands = commands.filter((command) => {
      if (["set_parameter", "clear_parameter"].includes(command.type) &&
          protectedParameterOrigins.has(command.parameterId)) {
        preservedOrigins.add(protectedParameterOrigins.get(command.parameterId));
        return false;
      }
      if (["set_guidance", "clear_guidance"].includes(command.type) &&
          protectedGuidanceOrigin) {
        preservedOrigins.add(protectedGuidanceOrigin);
        return false;
      }
      return true;
    });
  }
  for (const normalizedCommand of applicableCommands) {
    await applyDesignCommand({
      adapter,
      principal,
      course,
      microsequence,
      studyUnit,
      deadlineAt,
      command: (resolved) => ({
        ...normalizedCommand,
        scope: designScope(resolved)
      })
    });
  }
  const resolved = await resolveHumanCourseContext({
    adapter,
    principal,
    course,
    microsequence: microsequence ?? null,
    studyUnits: studyUnit == null ? [] : [studyUnit],
    deadlineAt
  });
  const configuration = await adapter.getCourseDesign({
    principal,
    courseId: resolved.course.id,
    scopeKind: designScope(resolved).kind,
    scopeRef: designScope(resolved).ref,
    childLimit: 32,
    childCursor: null,
    deadlineAt
  });
  const preservedCondition = preservedOrigins.has("research_condition")
    ? "a condição de pesquisa"
    : preservedOrigins.has("author")
      ? "a condição fixada pela pessoa autora"
      : null;
  const automatic = origin === "automatic";
  return result(preservedCondition
    ? applicableCommands.length
      ? `Mantive ${preservedCondition} e atualizei os demais ajustes.`
      : `Mantive ${preservedCondition}; a calibração automática não a substituiu.`
    : "Atualizei a configuração autoral e reli os valores efetivos.", {
    deepLink: automatic
      ? null
      : courseDeepLink(adapter, resolved.course, "parameters",
        resolved.studyUnits?.[0]
          ? [["studyUnitId", resolved.studyUnits[0].studyUnit.id]]
          : resolved.microsequence
            ? [["didacticMicrosequenceId", resolved.microsequence.id]]
            : []),
    nextDecision: automatic ? null : "Quer comparar esta condição com outra configuração?",
    context: { configuracao: projectConfiguration(configuration) }
  });
};

HUMAN_TASK_HANDLERS.registrar_observacao = async ({
  adapter, principal, args, deadlineAt
}) => {
  const course = humanCourseTitle(args);
  const units = humanReferenceList(args.unidades, "unidades");
  const rawText = text(args.texto, "texto", 2000);
  const capturedAt = new Date().toISOString();
  const category = args.categoria === undefined || args.categoria === null
    ? null
    : text(args.categoria, "categoria", 120);
  if (category !== null && !COURSE_ANCHORED_ANNOTATION_CATEGORIES.includes(category)) {
    fail("invalid_human_task_argument", "categoria não pertence às observações.", {
      field: "categoria"
    });
  }
  let savedCourse = null;
  await executeTrustedCourseWrite({
    load: async () => {
      const resolved = await resolveHumanCourseContext({
        adapter, principal, course, studyUnits: units, deadlineAt
      });
      savedCourse = resolved.course;
      return resolved;
    },
    build: async (resolved, { newId }) => ({
      courseId: resolved.course.id,
      expectedCourseRevision: resolved.course.revision,
      commands: await Promise.all(resolved.studyUnits.map(async (unit, index) =>
        normalizeCourseAnchoredAnnotationCommand({
          type: "create_anchored_annotation",
          annotationId: await newId(`observation:${index}`),
          target: { kind: "study_unit", id: unit.studyUnit.id },
          rawText,
          category,
          capturedAt,
          briefSummary: null
        })
      ))
    }),
    commit: async ({ requestId, courseId, ...value }) =>
      await adapter.createCourseAnchoredAnnotations({
        principal, courseId, ...value, requestId, deadlineAt
      })
  });
  return result(
    units.length === 1
      ? "Registrei a observação na unidade selecionada."
      : `Registrei a observação separadamente em ${units.length} unidades.`,
    {
      deepLink: courseDeepLink(adapter, savedCourse, "review"),
      nextDecision: "Quer registrar outra observação ou preparar a revisão das abertas?",
      context: { observationCount: units.length }
    }
  );
};

function sourceDocument(publicValue, previous = null) {
  const value = plainObject(publicValue, "metadados");
  exactFields(value, new Set(Object.keys(SOURCE_METADATA_SCHEMA.properties)));
  const availability = Object.freeze({
    aberta: "open_access",
    restrita: "restricted",
    privada: "private",
    desconhecida: "unknown"
  });
  const verification = Object.freeze({
    nao_verificada: "unverified",
    confirmada_explicitamente_pela_autoria: "author_verified"
  });
  const visibility = Object.freeze({
    oculta: "hidden",
    citacao: "citation",
    citacao_e_link: "citation_and_link"
  });
  const names = (items) => {
    if (!Array.isArray(items)) fail("invalid_human_task_argument", "Informe os nomes em uma lista.");
    return items.map((item) => {
      plainObject(item, "nome");
      exactFields(item, new Set(["literal", "sobrenome", "nomes"]));
      if (Object.hasOwn(item, "literal")) {
        if (Object.hasOwn(item, "sobrenome") || Object.hasOwn(item, "nomes")) {
          fail("invalid_human_task_argument", "Use nome literal ou componentes fornecidos, sem combiná-los.");
        }
        return { literal: item.literal };
      }
      return { family: item.sobrenome, given: item.nomes ?? null };
    });
  };
  const bibliographic = { ...createEmptyCourseSourceBibliographicMetadata(), ...previous?.bibliographic };
  if (value.bibliografia !== undefined) {
    const fields = plainObject(value.bibliografia, "bibliografia");
    exactFields(fields, new Set(Object.keys(SOURCE_BIBLIOGRAPHIC_SCHEMA.properties)));
    for (const [human, canonical] of Object.entries(HUMAN_BIBLIOGRAPHIC_FIELDS)) {
      if (Object.hasOwn(fields, human)) bibliographic[canonical] = fields[human];
    }
    if (Object.hasOwn(fields, "editores")) bibliographic.editors = names(fields.editores);
  }
  const mapped = (mapping, field, fallback) => {
    if (value[field] === undefined) return fallback;
    if (!Object.hasOwn(mapping, value[field])) fail("invalid_human_task_argument", `metadados.${field} é inválido.`);
    return mapping[value[field]];
  };
  return {
    kind: value.tipo ?? previous?.kind ?? "document",
    defaultRoles: value.papeisSugeridos === undefined ? previous?.defaultRoles ?? []
      : resolveHumanSourceRoles(value.papeisSugeridos, { allowEmpty: true }),
    title: value.titulo === undefined ? previous?.title ?? null : value.titulo,
    authors: value.autores === undefined ? previous?.authors ?? [] : names(value.autores),
    bibliographic,
    citationMode: mapped({ manual: "manual", gerada: "generated" }, "modoCitacao", previous?.citationMode ?? "manual"),
    publicationDate: value.dataDePublicacao === undefined
      ? previous?.publicationDate ?? null
      : value.dataDePublicacao,
    identifier: value.identificador === undefined ? previous?.identifier ?? null : value.identificador,
    language: value.idioma === undefined ? previous?.language ?? null : value.idioma,
    citationText: value.citacao === undefined ? previous?.citationText ?? null : value.citacao,
    url: value.url === undefined ? previous?.url ?? null : value.url,
    editionOrVersion: value.edicaoOuVersao === undefined
      ? previous?.editionOrVersion ?? null
      : value.edicaoOuVersao,
    origin: previous?.origin ?? "author_provided",
    availability: mapped(availability, "disponibilidade", previous?.availability ?? "unknown"),
    verificationStatus: mapped(verification, "verificacao", previous?.verificationStatus ?? "unverified"),
    studyVisibility: mapped(visibility, "visibilidadeNoEstudo", previous?.studyVisibility ?? "hidden")
  };
}

function sourceSelector(publicValue) {
  const value = plainObject(publicValue, "seletor");
  exactFields(value, new Set([
    "tipo", "paginaInicial", "paginaFinal", "inicioEmMilissegundos",
    "fimEmMilissegundos", "fragmento", "trechoExato", "prefixo", "sufixo"
  ]));
  const type = text(value.tipo, "seletor.tipo", 40);
  if (type === "paginas") {
    return {
      kind: "page_range",
      startPage: Number(value.paginaInicial),
      endPage: Number(value.paginaFinal)
    };
  }
  if (type === "tempo") {
    return {
      kind: "time_range",
      startMilliseconds: Number(value.inicioEmMilissegundos),
      endMilliseconds: Number(value.fimEmMilissegundos)
    };
  }
  if (type === "fragmento") {
    return { kind: "uri_fragment", fragment: text(value.fragmento, "fragmento", 2048) };
  }
  if (type !== "trecho") {
    fail("invalid_human_task_argument", "O tipo de âncora é inválido.");
  }
  return {
    kind: "text_quote",
    exact: text(value.trechoExato, "trechoExato", 4000),
    prefix: value.prefixo ?? null,
    suffix: value.sufixo ?? null
  };
}

async function detailedSource(adapter, principal, resolved, deadlineAt) {
  if (!resolved.source) return null;
  const read = await adapter.getCourseSources({
    principal,
    courseId: resolved.course.id,
    expectedRevision: resolved.course.revision,
    mode: "source",
    sourceId: resolved.source.sourceId,
    targetKind: null,
    targetId: null,
    cursor: null,
    limit: 1,
    deadlineAt
  });
  return read.items?.[0] ?? resolved.source;
}

async function executeSourceWrite({
  adapter,
  principal,
  course,
  source = null,
  internalSourceId = null,
  deadlineAt,
  build
}) {
  return await executeTrustedCourseWrite({
    load: async () => {
      const resolved = await resolveHumanCourseContext({
        adapter,
        principal,
        course,
        source: internalSourceId === null ? source : null,
        internalSourceId,
        deadlineAt
      });
      return { ...resolved, sourceDetail: await detailedSource(
        adapter, principal, resolved, deadlineAt
      ) };
    },
    build: async (state, identities) => ({
      courseId: state.course.id,
      expectedCourseRevision: state.course.revision,
      command: normalizeCourseSourceCommand(await build(state, identities))
    }),
    commit: async ({ requestId, courseId, ...value }) => await adapter.executeCourseSourceCommand({
      principal, courseId, ...value, requestId, deadlineAt
    })
  });
}

function matchAnchor(anchors, reference) {
  if (Number.isSafeInteger(reference)) return anchors[reference - 1] ?? null;
  const wanted = String(reference || "").trim().toLocaleLowerCase("pt-BR");
  const matches = anchors.filter((anchor) => [
    anchor.humanLocator, anchor.verificationExcerpt
  ].some((value) => String(value || "").toLocaleLowerCase("pt-BR") === wanted));
  if (matches.length > 1) {
    throw new AuthoringApiError(409, "ambiguous_human_reference", "A âncora é ambígua.");
  }
  return matches[0] ?? null;
}

HUMAN_TASK_HANDLERS.manter_fonte = async ({ adapter, principal, args, deadlineAt }) => {
  const course = humanCourseTitle(args);
  let sourceReference = optionalReference(args.fonte, "fonte");
  let internalSourceId = null;
  let savedSourceId = null;
  const withdrawal = args.retirar === undefined ? null : text(args.retirar, "retirar", 16);
  if (withdrawal !== null && !new Set(["pdfs", "fonte"]).has(withdrawal)) {
    fail("invalid_human_task_argument", "retirar precisa ser pdfs ou fonte.", { field: "retirar" });
  }
  if (withdrawal !== null) {
    if (sourceReference === undefined) {
      fail("missing_human_task_argument", "Informe fonte para realizar a retirada.", { field: "fonte" });
    }
    if (args.metadados !== undefined || args.ancoras !== undefined || args.vinculos !== undefined || args.estilo !== undefined) {
      fail(
        "invalid_human_task_arguments",
        "A retirada não pode ser combinada com outras mudanças da fonte.",
        { field: "retirar" }
      );
    }
    const initial = await resolveHumanCourseContext({
      adapter, principal, course, source: sourceReference, deadlineAt
    });
    const initialDetail = await detailedSource(adapter, principal, initial, deadlineAt);
    const attachments = Array.isArray(initialDetail?.attachments)
      ? initialDetail.attachments
      : [];
    for (const attachment of attachments) {
      await executeSourceWrite({
        adapter,
        principal,
        course,
        internalSourceId: initial.source.sourceId,
        deadlineAt,
        build: async (state) => ({
          type: "remove_pdf",
          sourceId: state.source.sourceId,
          expectedSourceRevision: Number(state.sourceDetail?.revision ?? state.source.revision),
          contentHash: attachment.contentHash
        })
      });
    }
    if (typeof adapter.resumeCourseSourcePdfDeletes !== "function") {
      throw new AuthoringApiError(
        503,
        "course_storage_unavailable",
        "O Storage não permitiu concluir a retirada dos PDFs."
      );
    }
    const resumed = await adapter.resumeCourseSourcePdfDeletes({
      principal,
      courseId: initial.course.id,
      sourceId: initial.source.sourceId,
      deadlineAt
    });
    if (withdrawal === "fonte") {
      await executeSourceWrite({
        adapter,
        principal,
        course,
        internalSourceId: initial.source.sourceId,
        deadlineAt,
        build: async (state) => ({
          type: "retire_source",
          sourceId: state.source.sourceId,
          expectedSourceRevision: Number(state.sourceDetail?.revision ?? state.source.revision)
        })
      });
    }
    const title = initial.source.title;
    const message = withdrawal === "fonte"
      ? `Retirei a fonte “${title}” e seus PDFs ativos.`
      : attachments.length || Number(resumed?.deleted ?? 0) > 0
        ? `Retirei os PDFs ativos da fonte “${title}”.`
        : `A fonte “${title}” não tinha PDFs ativos.`;
    return result(message, {
      deepLink: courseDeepLink(adapter, initial.course, "sources"),
      nextDecision: "Quer consultar as fontes restantes?",
      context: { source: { title, status: withdrawal === "fonte" ? "retired" : initial.source.status } }
    });
  }
  if (args.metadados === undefined && args.ancoras === undefined && args.vinculos === undefined && args.estilo === undefined) {
    fail("missing_human_task_argument", "Informe metadados, ancoras, vinculos, estilo ou retirar.");
  }
  if (args.estilo !== undefined) {
    await executeSourceWrite({ adapter, principal, course, deadlineAt,
      build: () => ({ type: "set_bibliography_style", style: args.estilo }) });
  }
  if (args.metadados !== undefined) {
    const metadata = safeClone(args.metadados, "metadados", 32 * 1024);
    await executeSourceWrite({
      adapter,
      principal,
      course,
      source: sourceReference ?? null,
      deadlineAt,
      build: async (state, { newId }) => {
        savedSourceId = state.source?.sourceId ?? await newId("source");
        return {
          type: "save_source",
          sourceId: savedSourceId,
          expectedSourceRevision: Number(state.sourceDetail?.revision ?? state.source?.revision ?? 0),
          source: sourceDocument(metadata, state.sourceDetail)
        };
      }
    });
    internalSourceId = savedSourceId;
    sourceReference = undefined;
  }
  const anchors = args.ancoras === undefined ? [] : safeClone(args.ancoras, "ancoras", 64 * 1024);
  if (!Array.isArray(anchors) || anchors.length > 8 || args.ancoras !== undefined && anchors.length === 0) {
    fail("invalid_human_task_argument", "Informe de uma a oito âncoras.");
  }
  for (let index = 0; index < anchors.length; index += 1) {
    if (sourceReference === undefined && internalSourceId === null) {
      fail("missing_human_task_argument", "Informe fonte para manter âncoras.");
    }
    const anchor = plainObject(anchors[index], `ancoras[${index}]`);
    exactFields(anchor, new Set(["ancora", "seletor", "localizadorHumano", "trechoDeVerificacao", "hashDoPdf"]));
    await executeSourceWrite({
      adapter,
      principal,
      course,
      source: sourceReference ?? null,
      internalSourceId,
      deadlineAt,
      build: async (state, { newId }) => {
        const existing = anchor.ancora === undefined
          ? null
          : matchAnchor(state.sourceDetail?.anchors ?? [], humanReference(
              anchor.ancora, `ancoras[${index}].ancora`
            ));
        if (anchor.ancora !== undefined && !existing) {
          throw new AuthoringApiError(404, "human_reference_not_found", "A âncora não foi localizada.");
        }
        return {
          type: "save_anchor",
          anchorId: existing?.anchorId ?? await newId(`anchor:${index}`),
          sourceId: state.source.sourceId,
          sourceRevision: Number(state.sourceDetail?.revision ?? state.source.revision),
          expectedAnchorRevision: Number(existing?.revision ?? 0),
          selector: sourceSelector(anchor.seletor),
          contentHash: anchor.hashDoPdf === undefined ? existing?.contentHash ?? null : anchor.hashDoPdf,
          humanLocator: anchor.localizadorHumano ?? null,
          verificationExcerpt: anchor.trechoDeVerificacao ?? null
        };
      }
    });
  }
  const bindings = args.vinculos === undefined ? [] : safeClone(args.vinculos, "vinculos", 128 * 1024);
  if (!Array.isArray(bindings) || bindings.length > 64 || args.vinculos !== undefined && bindings.length === 0) {
    fail("invalid_human_task_argument", "Informe de um a 64 vínculos por chamada.");
  }
  for (let index = 0; index < bindings.length; index += 1) {
    if (sourceReference === undefined && internalSourceId === null) {
      fail("missing_human_task_argument", "Informe fonte para vincular proveniência.");
    }
    const binding = plainObject(bindings[index], `vinculos[${index}]`);
    exactFields(binding, new Set(["unidade", "vinculo", "relacao", "papeis", "ancoras", "ocorrencias"]));
    const unitReference = humanReference(binding.unidade, `vinculos[${index}].unidade`);
    await executeTrustedCourseWrite({
      load: async () => {
        const resolved = await resolveHumanCourseContext({
          adapter,
          principal,
          course,
          source: internalSourceId === null ? sourceReference : null,
          internalSourceId,
          studyUnits: [unitReference],
          deadlineAt
        });
        return { ...resolved, sourceDetail: await detailedSource(
          adapter, principal, resolved, deadlineAt
        ) };
      },
      build: async (state, { newId }) => {
        const unit = state.studyUnits[0];
        if (binding.ancoras !== undefined && (!Array.isArray(binding.ancoras) || binding.ancoras.length > 8)) {
          fail("invalid_human_task_argument", "Informe até oito âncoras do vínculo.");
        }
        const selectedAnchors = (binding.ancoras ?? []).map((reference) => {
          const matched = matchAnchor(state.sourceDetail?.anchors ?? [], reference);
          if (!matched) {
            throw new AuthoringApiError(404, "human_reference_not_found", "A âncora não foi localizada.");
          }
          return { anchorId: matched.anchorId };
        });
        const targetRead = await adapter.getCourseSources({
          principal,
          courseId: state.course.id,
          expectedRevision: state.course.revision,
          mode: "target",
          sourceId: null,
          targetKind: "study_unit",
          targetId: unit.studyUnit.id,
          cursor: null,
          limit: 1,
          deadlineAt
        });
        const currentAttribution = Array.isArray(targetRead?.items) &&
          targetRead.items.length === 1 ? targetRead.items[0] : null;
        const currentLinks = currentAttribution?.sourceLinks ?? [];
        let existing = null;
        if (binding.vinculo !== undefined) {
          if (!Number.isSafeInteger(binding.vinculo) || binding.vinculo < 1) {
            fail("invalid_human_reference", "Informe a posição do vínculo a partir de 1.");
          }
          existing = currentLinks[binding.vinculo - 1];
          if (!existing || existing.sourceId !== state.source.sourceId) {
            throw new AuthoringApiError(404, "human_reference_not_found", "O vínculo desta fonte não foi localizado.");
          }
        }
        const requestedLink = {
          linkId: existing?.linkId ?? await newId(`source-link:${index}`),
          sourceId: state.source.sourceId,
          relation: text(binding.relacao, "vinculos.relacao", 80),
          roles: resolveHumanSourceRoles(binding.papeis),
          anchors: binding.ancoras === undefined ? existing?.anchors ?? [] : selectedAnchors,
          occurrences: binding.ocorrencias === undefined ? existing?.occurrences ?? [] :
            await resolveHumanSourceOccurrences({ requested: binding.ocorrencias, content: unit.studyUnit,
              newId, identityPrefix: `source-link:${index}` })
        };
        return {
          courseId: state.course.id,
          expectedCourseRevision: state.course.revision,
          command: normalizeCourseSourceCommand({
            type: "set_target_sources",
            targetKind: "study_unit",
            targetId: unit.studyUnit.id,
            expectedTargetVersion: Number(unit.version ?? unit.studyUnit.version ?? 1),
            sourceLinks: existing
              ? currentLinks.map((link) => link.linkId === existing.linkId ? requestedLink : link)
              : [...currentLinks, requestedLink]
          })
        };
      },
      commit: async ({ requestId, courseId, ...value }) => await adapter.executeCourseSourceCommand({
        principal, courseId, ...value, requestId, deadlineAt
      })
    });
  }
  const resolved = await resolveHumanCourseContext({
    adapter,
    principal,
    course,
    source: internalSourceId === null ? sourceReference ?? null : null,
    internalSourceId,
    deadlineAt
  });
  const styleOnly = args.metadados === undefined && args.ancoras === undefined && args.vinculos === undefined;
  return result(styleOnly ? "Atualizei o estilo das referências do curso." : "Atualizei a fonte, suas âncoras e vínculos solicitados.", {
    deepLink: courseDeepLink(adapter, resolved.course, "sources"),
    nextDecision: "Quer revisar esta fonte no contexto de uma unidade?",
    context: styleOnly ? { bibliographyStyle: args.estilo } : { source: resolved.source ?? { title: sourceReference } }
  });
};

HUMAN_TASK_HANDLERS.incorporar_pdf_como_fonte = async ({
  adapter, principal, args, deadlineAt, projectionRecipient
}) => {
  const hasSourceReference = args.fonte !== undefined;
  const hasNewSourceTitle = args.titulo !== undefined;
  if (hasSourceReference === hasNewSourceTitle ||
      hasSourceReference && args.papeisSugeridos !== undefined) {
    fail(
      "invalid_human_task_arguments",
      "Informe exatamente um destino para o PDF: fonte existente ou título da nova fonte.",
      { fields: ["fonte", "titulo"] }
    );
  }
  const course = humanCourseTitle(args);
  const sourceReference = optionalReference(args.fonte, "fonte");
  const newSourceTitle = sourceReference === undefined
    ? args.titulo === null ? null : text(args.titulo, "titulo", 300)
    : undefined;
  text(args.intencao, "intencao", 1000);
  const pdf = plainObject(args.pdf, "pdf");
  exactFields(pdf, new Set(["file_id", "file_name", "mime_type", "download_url"]));
  const descriptor = {
    file_id: text(pdf.file_id, "pdf.file_id", 512),
    ...(pdf.file_name === undefined ? {} : { file_name: text(pdf.file_name, "pdf.file_name", 512) }),
    ...(pdf.mime_type === undefined ? {} : { mime_type: text(pdf.mime_type, "pdf.mime_type", 80) })
  };
  Object.defineProperty(descriptor, "download_url", {
    value: text(pdf.download_url, "pdf.download_url", 8192),
    enumerable: true,
    configurable: false,
    writable: false
  });
  let ingestedSourceId = null;
  const receipt = await executeTrustedCourseWrite({
    load: async () => await resolveHumanCourseContext({
      adapter, principal, course, source: sourceReference ?? null, deadlineAt
    }),
    build: async (state, { newId }) => {
      ingestedSourceId = sourceReference === undefined
        ? await newId("pdf-source")
        : state.source.sourceId;
      const sourceIntent = sourceReference === undefined
        ? {
            mode: "save",
            sourceId: ingestedSourceId,
            expectedSourceRevision: 0,
            source: sourceDocument({
              titulo: newSourceTitle,
              papeisSugeridos: args.papeisSugeridos,
              tipo: "document",
              disponibilidade: "desconhecida",
              verificacao: "nao_verificada",
              visibilidadeNoEstudo: "oculta"
            })
          }
        : {
            mode: "existing",
            sourceId: state.source.sourceId,
            sourceRevision: Number(state.source.revision)
          };
      return {
        courseId: state.course.id,
        expectedCourseRevision: state.course.revision,
        sourceIntent: normalizeCourseSourcePdfSourceIntent(sourceIntent),
        pdf: descriptor
      };
    },
    commit: async (value) => {
      if (typeof adapter?.ingestCourseSourcePdf !== "function") {
        throw new AuthoringApiError(
          503,
          "course_source_pdf_ingestion_unavailable",
          "O AraLearn não conseguiu receber este documento agora."
        );
      }
      const ingestion = {
        principal,
        courseId: value.courseId,
        expectedCourseRevision: value.expectedCourseRevision,
        requestId: value.requestId,
        sourceIntent: value.sourceIntent,
        fileIdentity: {
          fileId: descriptor.file_id,
          fileName: descriptor.file_name ?? null,
          mediaType: descriptor.mime_type ?? null
        },
        deadlineAt
      };
      let saved = typeof adapter?.getCourseSourcePdfIngestionReceipt === "function"
        ? await adapter.getCourseSourcePdfIngestionReceipt(ingestion)
        : null;
      if (saved === null) {
        const bytes = await resolveOpenAiTemporaryPdf({
          descriptor,
          fetchImpl: adapter.fetchImpl ?? globalThis.fetch,
          deadlineAt
        });
        saved = await adapter.ingestCourseSourcePdf({
          ...ingestion,
          bytes,
          mediaType: "application/pdf"
        });
      }
      return saved;
    }
  });
  const resolved = await resolveHumanCourseContext({
    adapter,
    principal,
    course,
    internalSourceId: receipt?.source?.sourceId ?? ingestedSourceId,
    deadlineAt
  });
  return result("Mantive o PDF entre as fontes do curso.", {
    deepLink: courseDeepLink(adapter, resolved.course, "sources"),
    nextDecision: "Quer criar ou revisar âncoras verificáveis deste PDF?",
    context: {
      source: resolved.source,
      stored: receipt?.stored !== false,
      recipient: projectionRecipient === "connected_mcp_client" ? "connected_client" : "action"
    }
  });
};

HUMAN_TASK_HANDLERS.guardar_audio = async ({ adapter, principal, args, deadlineAt }) => {
  const course = humanCourseTitle(args);
  const descriptor = plainObject(args.audio, "audio");
  exactFields(descriptor, new Set(["file_id", "file_name", "mime_type", "download_url"]));
  let received = null;
  let resolvedCourse;
  const receipt = await executeTrustedCourseWrite({
    load: async () => {
      const state = await resolveHumanCourseContext({ adapter, principal, course, deadlineAt });
      resolvedCourse = state.course;
      return state;
    },
    build: async (state) => ({ courseId: state.course.id, expectedCourseRevision: state.course.revision }),
    commit: async (value) => {
      if (typeof adapter?.ingestCourseAudio !== "function") {
        throw new AuthoringApiError(503, "course_media_unavailable", "Não foi possível guardar o áudio agora.");
      }
      // Retry da escrita mantém os mesmos bytes mesmo que o acesso temporário expire.
      received ??= await resolveOpenAiTemporaryAudio({ descriptor, fetchImpl: adapter.fetchImpl, deadlineAt });
      const raw = await adapter.ingestCourseAudio({ ...value, ...received, principal, deadlineAt });
      let saved;
      try { saved = normalizeCourseMediaChange(raw); } catch {
        throw new AuthoringApiError(409, "course_media_write_uncertain", "Não foi possível confirmar o áudio guardado. Consulte a biblioteca antes de repetir.");
      }
      if (saved.operation !== "ingest_audio" || saved.courseId !== value.courseId ||
          saved.courseRevision !== value.expectedCourseRevision + Number(saved.changed) ||
          saved.requestId !== value.requestId || saved.media.byteSize !== received.bytes.length ||
          saved.media.mediaType !== received.mediaType ||
          saved.media.contentHash !== await sha256Hex(received.bytes)) {
        throw new AuthoringApiError(409, "course_media_write_uncertain", "Não foi possível confirmar o áudio guardado. Consulte a biblioteca antes de repetir.");
      }
      return saved;
    }
  });
  return result("Guardei o áudio na biblioteca do curso.", {
    deepLink: courseDeepLink(adapter, resolvedCourse, "content"),
    nextDecision: "Use o arquivo no pacote de áudio com uma alternativa textual apropriada.",
    context: { storedAudio: { ...receipt.media, fileName: receipt.fileName } }
  });
};

HUMAN_TASK_HANDLERS.consultar_audios = async ({ adapter, principal, args, deadlineAt }) => {
  const pageNumber = args.pagina ?? 1;
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 100) {
    fail("invalid_human_task_argument", "A página precisa estar entre 1 e 100.");
  }
  const { course } = await resolveHumanCourseContext({ adapter, principal, course: humanCourseTitle(args), deadlineAt });
  if (typeof adapter?.getCourseMedia !== "function") {
    throw new AuthoringApiError(503, "course_media_unavailable", "Não foi possível consultar a biblioteca de áudio.");
  }
  let cursor = null;
  let page;
  const seen = new Set();
  for (let index = 1; index <= pageNumber; index++) {
    const raw = await adapter.getCourseMedia({ principal, courseId: course.id,
      expectedRevision: course.revision, mode: "catalog", cursor, limit: 20, deadlineAt });
    try { page = normalizeCourseMediaRead(raw); } catch {
      throw new AuthoringApiError(503, "course_media_unavailable", "Não foi possível ler a biblioteca de áudio.");
    }
    if (page.courseId !== course.id || page.courseRevision !== course.revision || page.mode !== "catalog" ||
        page.nextCursor !== null && seen.has(page.nextCursor)) {
      throw new AuthoringApiError(409, "stale_course_state", "A biblioteca mudou. Consulte a página novamente.");
    }
    if (index < pageNumber && page.nextCursor === null) fail("human_reference_not_found", "Esta página não existe na biblioteca.", null, 404);
    cursor = page.nextCursor;
    seen.add(cursor);
  }
  return result(page.items.length ? "Consultei os arquivos de áudio do curso." : "Este curso ainda não tem arquivos de áudio.", {
    deepLink: courseDeepLink(adapter, course, "content"),
    nextDecision: page.nextCursor ? `Consulte a página ${pageNumber + 1} ou use um destes áudios.` : "Use um arquivo no pacote de áudio ou guarde uma nova gravação.",
    context: { pagina: pageNumber, temMais: page.nextCursor !== null,
      audios: page.items.map(item => ({ storedAudio: item })) }
  });
};
