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
  normalizeCourseSourceCommand,
  normalizeCourseSourcePdfSourceIntent
} from "../aralearn/runtime/domain/courseSources.js";
import {
  COURSE_ANCHORED_ANNOTATION_CATEGORIES,
  normalizeCourseAnchoredAnnotationCommand
} from "../aralearn/runtime/domain/courseAnchoredAnnotations.js";
import { RESOURCE_CATALOG, RESOURCE_PACKAGE_REGISTRY } from
  "../aralearn/runtime/resources/catalog/resourceCatalog.js";
import { resolveOpenAiTemporaryPdf } from "./openAiTemporaryPdf.js";
import { materializeHumanCoursePart } from "./courseHumanMaterialization.js";
import { applyHumanCourseCorrections } from "./courseHumanCorrections.js";
import { courseAuthoringGuidanceForCall } from "./courseKnowledge.js";

const encoder = new TextEncoder();
const READ_SCOPE = "authoring:read";
const WRITE_SCOPE = "authoring:write";
const MAX_RESULT_BYTES = 512 * 1024;
const MAX_CONTEXT_PAGES = 100;
const MCP_OAUTH_SECURITY_SCHEMES = Object.freeze([
  Object.freeze({ type: "oauth2", scopes: Object.freeze(["offline_access"]) })
]);

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
  description: "Título exato ou referência humana inequívoca do Curso."
});
const HUMAN_REFERENCE_LIST_SCHEMA = Object.freeze({
  type: "array",
  minItems: 1,
  maxItems: 64,
  uniqueItems: true,
  items: HUMAN_REFERENCE_SCHEMA
});

const PEDAGOGICAL_PARAMETERS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: Object.freeze({
    tetoNovasUnidadesDeAnalise: Object.freeze({
      type: ["integer", "null"], minimum: 1, maximum: 64
    }),
    formasDeExplicacao: Object.freeze({
      type: ["array", "null"],
      minItems: 1,
      maxItems: EXPLANATION_FORMS.length,
      uniqueItems: true,
      items: Object.freeze({ type: "string", enum: EXPLANATION_FORMS })
    }),
    minimoDePraticasPorRequisito: Object.freeze({
      type: ["integer", "null"], minimum: 1, maximum: 64
    }),
    dimensoesDeVariacaoDaPratica: Object.freeze({
      type: ["array", "null"],
      minItems: 1,
      maxItems: PRACTICE_VARIATION_DIMENSIONS.length,
      uniqueItems: true,
      items: Object.freeze({ type: "string", enum: PRACTICE_VARIATION_DIMENSIONS })
    })
  })
});

const AUTHORING_PART_MICROSEQUENCE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze([
    "modulo", "objetivoDoModulo", "licao", "objetivoDaLicao",
    "titulo", "objetivo", "funcao",
    "unidadesDeAnalise", "requisitosDeEvidencia"
  ]),
  properties: Object.freeze({
    modulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
    objetivoDoModulo: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
    licao: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
    objetivoDaLicao: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
    titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
    objetivo: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
    funcao: Object.freeze({
      type: "string", enum: Object.freeze(["explicar", "praticar", "revisar", "apoiar"])
    }),
    unidadesDeAnalise: Object.freeze({
      type: "array", maxItems: 64, uniqueItems: true,
      items: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 })
    }),
    requisitosDeEvidencia: Object.freeze({
      type: "array", maxItems: 64, uniqueItems: true,
      items: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 })
    })
  }),
  allOf: Object.freeze([Object.freeze({
    if: Object.freeze({
      properties: Object.freeze({
        funcao: Object.freeze({ const: "explicar" })
      }),
      required: Object.freeze(["funcao"])
    }),
    then: Object.freeze({
      properties: Object.freeze({
        unidadesDeAnalise: Object.freeze({ minItems: 1 })
      })
    })
  })])
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

const SOURCE_METADATA_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze(["titulo"]),
  properties: Object.freeze({
    tipo: Object.freeze({ type: "string", enum: COURSE_SOURCE_KINDS }),
    titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
    autoria: Object.freeze({ type: ["string", "null"], maxLength: 500 }),
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
      type: "string", enum: Object.freeze(["nao_verificada", "adotada_pelo_autor"])
    }),
    visibilidadeNoEstudo: Object.freeze({
      type: "string", enum: Object.freeze(["oculta", "citacao", "citacao_e_link"])
    })
  })
});

const MATERIALIZATION_UNIT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze([
    "microssequencia", "posicao", "conteudo", "aplicacaoPedagogica"
  ]),
  properties: Object.freeze({
    microssequencia: HUMAN_REFERENCE_SCHEMA,
    posicao: Object.freeze({ type: "integer", minimum: 1, maximum: 1000000 }),
    conteudo: Object.freeze({
      type: "object",
      description: "Unidade de estudo completa conforme o componente escolhido; não inclua id nem position."
    }),
    aplicacaoPedagogica: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: Object.freeze([
        "modo", "novidadesIntroduzidas", "explicacoes", "praticas"
      ]),
      properties: Object.freeze({
        modo: Object.freeze({ type: "string", enum: Object.freeze(["expositiva", "pratica", "mista"]) }),
        novidadesIntroduzidas: Object.freeze({
          type: "array", maxItems: 64, uniqueItems: true,
          items: HUMAN_REFERENCE_SCHEMA
        }),
        explicacoes: Object.freeze({
          type: "array", maxItems: 256,
          items: Object.freeze({
            type: "object", additionalProperties: false,
            required: Object.freeze(["novidade", "formas"]),
            properties: Object.freeze({
              novidade: HUMAN_REFERENCE_SCHEMA,
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
              requisito: HUMAN_REFERENCE_SCHEMA,
              oportunidade: Object.freeze({ type: "string", minLength: 1, maxLength: 240 }),
              dimensoesVariadas: Object.freeze({
                type: "array", maxItems: PRACTICE_VARIATION_DIMENSIONS.length,
                uniqueItems: true,
                items: Object.freeze({ type: "string", enum: PRACTICE_VARIATION_DIMENSIONS })
              })
            })
          })
        })
      })
    }),
    fontes: Object.freeze({
      type: "array", maxItems: 32,
      items: Object.freeze({
        type: "object", additionalProperties: false,
        required: Object.freeze(["fonte", "relacao"]),
        properties: Object.freeze({
          fonte: HUMAN_REFERENCE_SCHEMA,
          relacao: Object.freeze({ type: "string", enum: COURSE_SOURCE_RELATIONS }),
          ancoras: Object.freeze({
            type: "array", maxItems: 8, uniqueItems: true,
            items: HUMAN_REFERENCE_SCHEMA
          })
        })
      })
    })
  })
});

const HUMAN_TASK_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze(["result", "deepLink", "nextDecision"]),
  properties: Object.freeze({
    result: Object.freeze({ type: "string", minLength: 1, maxLength: 4000 }),
    deepLink: Object.freeze({ type: ["string", "null"], maxLength: 4096 }),
    nextDecision: Object.freeze({ type: ["string", "null"], maxLength: 1000 }),
    context: Object.freeze({ type: "object" })
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
  titulo: "Título humano do objeto; por exemplo, “Fundamentos de redes”.",
  objetivo: "Objetivo autoral confirmado para o novo Curso.",
  curso: "Título exato ou referência humana inequívoca do Curso.",
  parte: "Posição a partir de 1 ou título humano da Parte.",
  microssequencia: "Posição a partir de 1 ou título humano da Microssequência.",
  unidade: "Posição a partir de 1 ou título humano da Unidade de estudo.",
  unidades: "Seleção limitada de Unidades por posição ou título humano.",
  fonte: "Posição a partir de 1, título ou citação humana inequívoca da Fonte.",
  busca: "Palavras que descrevem a Fonte ou o componente procurado.",
  funcao: "Função instrucional que a representação precisa cumprir.",
  componente: "Nome humano ou referência exata do componente a inspecionar.",
  somenteAbertas: "Quando verdadeiro, devolve apenas Observações ainda abertas.",
  intencao: "Intenção pedagógica ou editorial confirmada para a ação.",
  parametrosPedagogicos: "Somente os parâmetros pedagógicos a definir; null restaura herança.",
  direcaoEditorial: "Orientação de extensão, parágrafos, títulos e estilo; null restaura herança.",
  texto: "Texto integral da Observação humana.",
  categoria: "Categoria factual da Observação, quando a pessoa a tiver indicado.",
  correcoes: "Conjunto coerente de Unidades afetadas e seus conteúdos completos corrigidos.",
  metadados: "Metadados humanos da Fonte a criar ou revisar.",
  ancoras: "Âncoras verificáveis da Fonte a criar ou revisar.",
  vinculos: "Relações de proveniência entre a Fonte e Unidades de estudo.",
  pdf: "Descritor temporário do PDF fornecido pelo cliente OpenAI.",
  aplicacaoPedagogica: "Fatos pedagógicos aplicados à Unidade materializada."
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

function annotations(readOnly) {
  return Object.freeze({
    readOnlyHint: readOnly,
    destructiveHint: false,
    openWorldHint: false
  });
}

function task(name, title, description, schema, { readOnly, file = false } = {}) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema: Object.freeze(describeTopLevelArguments(schema)),
    outputSchema: HUMAN_TASK_OUTPUT_SCHEMA,
    annotations: annotations(readOnly),
    ...(file ? { _meta: Object.freeze({ "openai/fileParams": Object.freeze(["pdf"]) }) } : {})
  });
}

export const COURSE_HUMAN_TASKS = Object.freeze([
  task(
    "retomar_curso",
    "Retomar um Curso",
    "Use quando a pessoa quiser localizar ou continuar um Curso pelo título. Não use para alterar conteúdo ou planejamento.",
    inputSchema({
      titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 })
    }),
    { readOnly: true }
  ),
  task(
    "consultar_planejamento",
    "Consultar o planejamento",
    "Use quando for preciso ler a Parte corrente, a próxima Parte ou reabrir uma Parte anterior. Não use para salvar uma proposta.",
    inputSchema({ curso: COURSE_SCHEMA, parte: HUMAN_REFERENCE_SCHEMA }, ["curso"]),
    { readOnly: true }
  ),
  task(
    "preparar_materializacao",
    "Preparar a materialização",
    "Use antes de escrever Unidades de estudo de uma Parte aprovada. Traz somente inventário semântico, conhecimentos estabelecidos e configuração do recorte; consulte Fontes separadamente quando forem pertinentes. Não grava conteúdo.",
    inputSchema({ curso: COURSE_SCHEMA, parte: HUMAN_REFERENCE_SCHEMA }, ["curso", "parte"]),
    { readOnly: true }
  ),
  task(
    "consultar_configuracao",
    "Consultar a configuração autoral",
    "Use para ler valores pedagógicos efetivos, herança, aplicação factual e direção editorial no Curso, Microssequência ou StudyUnit. Não use para mudar valores.",
    inputSchema({
      curso: COURSE_SCHEMA,
      microssequencia: HUMAN_REFERENCE_SCHEMA,
      unidade: HUMAN_REFERENCE_SCHEMA
    }, ["curso"]),
    { readOnly: true }
  ),
  task(
    "consultar_observacoes",
    "Consultar Observações",
    "Use para ler Observações de autoria, normalmente as abertas, em um escopo humano. Não use para produzir a revisão pedagógica nem para registrar texto novo.",
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
    "Use quando o GPT precisar revisar Observações e reler progressão, pré-requisitos, exemplos, prática e transições potencialmente afetados. Não aplica correções.",
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
    "Consultar Fontes e Âncoras",
    "Use para encontrar uma Fonte, ler suas Âncoras ou ver a proveniência de uma Unidade. Não baixa PDF nem altera metadados.",
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
    "Use somente quando a função instrucional pedir uma representação e o componente adequado ainda não estiver claro. Não use como catálogo preventivo nem para gravar uma Unidade.",
    Object.freeze({
      ...inputSchema({
      busca: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
      funcao: Object.freeze({ type: "string", minLength: 1, maxLength: 500 }),
      componente: Object.freeze({ type: "string", minLength: 1, maxLength: 240 })
      }),
      minProperties: 1
    }),
    { readOnly: true }
  ),
  task(
    "criar_curso",
    "Criar um Curso",
    "Use quando a pessoa tiver confirmado o título e o objetivo de um novo Curso privado. Não use para copiar ou alterar Curso existente.",
    inputSchema({
      titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
      objetivo: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 })
    }, ["titulo", "objetivo"]),
    { readOnly: false }
  ),
  task(
    "salvar_parte",
    "Salvar uma Parte do planejamento",
    "Use depois que a pessoa aprovar a próxima Parte ou pedir a revisão de uma Parte anterior. Sem parte, adiciona somente a próxima; com parte, revisa aquela Parte. Não materializa conteúdo.",
    inputSchema({
      curso: COURSE_SCHEMA,
      parte: HUMAN_REFERENCE_SCHEMA,
      titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
      intencao: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
      microssequencias: Object.freeze({
        type: "array", minItems: 1, maxItems: 32,
        items: AUTHORING_PART_MICROSEQUENCE_SCHEMA
      })
    }, ["curso", "titulo", "intencao", "microssequencias"]),
    { readOnly: false }
  ),
  task(
    "materializar_parte",
    "Materializar uma Parte",
    "Use para gravar as Unidades de estudo de uma Parte aprovada depois de preparar o recorte focal. O inventário semântico deve permanecer estável e completo; não use para esconder novidades nem para reparar uma Unidade existente.",
    inputSchema({
      curso: COURSE_SCHEMA,
      parte: HUMAN_REFERENCE_SCHEMA,
      unidades: Object.freeze({
        type: "array", minItems: 1, maxItems: 64, items: MATERIALIZATION_UNIT_SCHEMA
      })
    }, ["curso", "parte", "unidades"]),
    { readOnly: false }
  ),
  task(
    "ajustar_configuracao",
    "Ajustar a configuração autoral",
    "Use para calibrar ou fixar os quatro parâmetros pedagógicos e/ou a direção editorial no Curso, Microssequência ou StudyUnit. A condição é automática por padrão; valor null restaura herança. Não use direção editorial para comprimir ou eliminar conteúdo necessário.",
    Object.freeze({
      ...inputSchema({
      curso: COURSE_SCHEMA,
      microssequencia: HUMAN_REFERENCE_SCHEMA,
      unidade: HUMAN_REFERENCE_SCHEMA,
      condicao: Object.freeze({
        type: "string",
        enum: Object.freeze(["automatica", "fixada_pelo_autor", "pesquisa"]),
        default: "automatica"
      }),
      parametrosPedagogicos: PEDAGOGICAL_PARAMETERS_SCHEMA,
        direcaoEditorial: Object.freeze({ type: ["string", "null"], maxLength: 4000 })
      }, ["curso"]),
      anyOf: Object.freeze([
        Object.freeze({ required: Object.freeze(["parametrosPedagogicos"]) }),
        Object.freeze({ required: Object.freeze(["direcaoEditorial"]) })
      ])
    }),
    { readOnly: false }
  ),
  task(
    "registrar_observacao",
    "Registrar Observação",
    "Use para registrar o mesmo apontamento em uma ou várias Unidades selecionadas. Cada Observação é gravada separadamente; não cria lote permanente e não aplica correção.",
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
    "Use somente depois de preparar a revisão e definir o conjunto coerente de Unidades afetadas. Não use para comprovar aplicação de configuração alterada: rematerialize a Parte quando novidade, explicação, prática, representação ou distribuição precisarem mudar.",
    inputSchema({
      curso: COURSE_SCHEMA,
      correcoes: Object.freeze({
        type: "array", minItems: 1, maxItems: 64,
        items: Object.freeze({
          type: "object", additionalProperties: false,
          required: Object.freeze(["unidade", "conteudo"]),
          properties: Object.freeze({
            unidade: HUMAN_REFERENCE_SCHEMA,
            conteudo: Object.freeze({ type: "object" }),
            fontes: Object.freeze({
              type: "array", maxItems: 32,
              items: Object.freeze({
                type: "object", additionalProperties: false,
                required: Object.freeze(["fonte", "relacao"]),
                properties: Object.freeze({
                  fonte: HUMAN_REFERENCE_SCHEMA,
                  relacao: Object.freeze({ type: "string", enum: COURSE_SOURCE_RELATIONS }),
                  ancoras: Object.freeze({
                    type: "array", maxItems: 8, uniqueItems: true,
                    items: HUMAN_REFERENCE_SCHEMA
                  })
                })
              })
            })
          })
        })
      })
    }, ["curso", "correcoes"]),
    { readOnly: false }
  ),
  task(
    "manter_fonte",
    "Manter Fonte e Âncoras",
    "Use para salvar metadados de uma Fonte, adotar ou contestar sua verificação, manter Âncoras e/ou vincular proveniência a Unidades. Não use para receber o arquivo PDF.",
    Object.freeze({
      ...inputSchema({
        curso: COURSE_SCHEMA,
        fonte: HUMAN_REFERENCE_SCHEMA,
        metadados: SOURCE_METADATA_SCHEMA,
        ancoras: Object.freeze({
        type: "array", minItems: 1, maxItems: 8,
        items: Object.freeze({
          type: "object", additionalProperties: false,
          required: Object.freeze(["seletor"]),
          properties: Object.freeze({
            ancora: HUMAN_REFERENCE_SCHEMA,
            seletor: SOURCE_SELECTOR_SCHEMA,
            localizadorHumano: Object.freeze({ type: ["string", "null"], maxLength: 500 }),
            trechoDeVerificacao: Object.freeze({ type: ["string", "null"], maxLength: 2000 })
          })
        })
        }),
        vinculos: Object.freeze({
        type: "array", minItems: 1, maxItems: 64,
        items: Object.freeze({
          type: "object", additionalProperties: false,
          required: Object.freeze(["unidade", "relacao"]),
          properties: Object.freeze({
            unidade: HUMAN_REFERENCE_SCHEMA,
            relacao: Object.freeze({ type: "string", enum: COURSE_SOURCE_RELATIONS }),
            ancoras: Object.freeze({
              type: "array", minItems: 1, maxItems: 8, uniqueItems: true,
              items: HUMAN_REFERENCE_SCHEMA
            })
          })
        })
        })
      }, ["curso"]),
      anyOf: Object.freeze([
        Object.freeze({ required: Object.freeze(["metadados"]) }),
        Object.freeze({ required: Object.freeze(["ancoras"]) }),
        Object.freeze({ required: Object.freeze(["vinculos"]) })
      ])
    }),
    { readOnly: false }
  ),
  task(
    "incorporar_pdf_como_fonte",
    "Incorporar PDF como Fonte",
    "Use quando o PDF anexado deve permanecer como Fonte do Curso ou ser anexado a uma Fonte existente. Não use para leitura descartável nem sem intenção inequívoca de armazenamento.",
    inputSchema({
      curso: COURSE_SCHEMA,
      fonte: HUMAN_REFERENCE_SCHEMA,
      titulo: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
      intencao: Object.freeze({ type: "string", minLength: 1, maxLength: 1000 }),
      pdf: Object.freeze({
        type: "object",
        additionalProperties: false,
        required: Object.freeze(["file_id"]),
        properties: Object.freeze({
          file_id: Object.freeze({ type: "string", minLength: 1, maxLength: 512 }),
          file_name: Object.freeze({ type: "string", minLength: 1, maxLength: 512 }),
          mime_type: Object.freeze({ type: "string", const: "application/pdf" })
        })
      })
    }, ["curso", "intencao", "pdf"]),
    { readOnly: false, file: true }
  )
]);

export const COURSE_HUMAN_TASK_CATALOG_ID = "aralearn.human-authoring-tasks";
export const COURSE_HUMAN_TASK_CATALOG_VERSION = "2.0.0";
export const COURSE_HUMAN_TASK_CATALOG_HASH =
  "sha256:e876aa75459717f10a63ceab3eba83655a54f9d5bfb6c9a23f8cfa5b5f2cd925";
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
      "O recorte solicitado excede o limite; escolha uma Parte, Microssequência ou Unidade.",
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
  let argumentsForValidation = rawArguments;
  let managedPdfDownloadUrl = null;
  if (name === "incorporar_pdf_como_fonte" && rawArguments?.pdf &&
      typeof rawArguments.pdf === "object" && !Array.isArray(rawArguments.pdf) &&
      Object.hasOwn(rawArguments.pdf, "download_url")) {
    managedPdfDownloadUrl = text(
      rawArguments.pdf.download_url,
      "pdf.download_url",
      8192
    );
    argumentsForValidation = {
      ...rawArguments,
      pdf: Object.fromEntries(Object.entries(rawArguments.pdf)
        .filter(([field]) => field !== "download_url"))
    };
  }
  const args = assertTaskArguments(name, argumentsForValidation);
  if (managedPdfDownloadUrl !== null) {
    Object.defineProperty(args.pdf, "download_url", {
      value: managedPdfDownloadUrl,
      enumerable: false,
      configurable: false,
      writable: false
    });
  }
  try {
    const output = await HUMAN_TASK_HANDLERS[name]({
      adapter,
      principal,
      args,
      deadlineAt,
      projectionRecipient
    });
    const guidance = courseAuthoringGuidanceForCall(name);
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
      ...(output.context === undefined && !guidance
        ? {}
        : {
            context: {
              ...(output.context || {}),
              ...(guidance ? { guidance } : {})
            }
          })
    });
  } catch (error) {
    return normalizeTaskError(error);
  }
}

const HUMAN_TASK_HANDLERS = Object.create(null);

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

const MICROSEQUENCE_ROLE_BY_HUMAN_FUNCTION = Object.freeze({
  explicar: "explain",
  praticar: "practice",
  revisar: "review",
  apoiar: "support"
});
const HUMAN_FUNCTION_BY_MICROSEQUENCE_ROLE = Object.freeze(Object.fromEntries(
  Object.entries(MICROSEQUENCE_ROLE_BY_HUMAN_FUNCTION).map(([human, role]) => [role, human])
));

function matchingText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/gu, " ")
    .trim();
}

function statementList(value, field) {
  if (!Array.isArray(value) || value.length > 64) {
    fail("invalid_human_task_argument", `${field} precisa conter até 64 itens.`, { field });
  }
  const items = value.map((item, index) => text(item, `${field}[${index}]`, 2000));
  if (new Set(items.map(matchingText)).size !== items.length) {
    fail("duplicate_human_reference", `${field} não pode repetir a mesma novidade.`, { field });
  }
  return items;
}

function normalizeApprovedPartMicrosequences(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    fail(
      "invalid_human_task_argument",
      "microssequencias precisa conter de 1 a 32 recortes aprovados.",
      { field: "microssequencias" }
    );
  }
  return value.map((raw, index) => {
    const field = `microssequencias[${index}]`;
    const item = plainObject(raw, field);
    exactFields(item, new Set([
      "modulo", "objetivoDoModulo", "licao", "objetivoDaLicao",
      "titulo", "objetivo", "funcao", "unidadesDeAnalise",
      "requisitosDeEvidencia"
    ]));
    const humanFunction = text(item.funcao, `${field}.funcao`, 20);
    const role = MICROSEQUENCE_ROLE_BY_HUMAN_FUNCTION[humanFunction];
    if (!role) {
      fail("invalid_human_task_argument", `${field}.funcao é inválida.`, {
        field: `${field}.funcao`
      });
    }
    const analysisUnitStatements = statementList(
      item.unidadesDeAnalise,
      `${field}.unidadesDeAnalise`
    );
    if (role === "explain" && analysisUnitStatements.length === 0) {
      fail(
        "missing_instructional_analysis_unit",
        `${field}.unidadesDeAnalise exige ao menos uma novidade para explicar.`,
        { field: `${field}.unidadesDeAnalise` }
      );
    }
    return {
      moduleTitle: text(item.modulo, `${field}.modulo`, 300),
      moduleGoal: text(item.objetivoDoModulo, `${field}.objetivoDoModulo`, 2000),
      lessonTitle: text(item.licao, `${field}.licao`, 300),
      lessonGoal: text(item.objetivoDaLicao, `${field}.objetivoDaLicao`, 2000),
      title: text(item.titulo, `${field}.titulo`, 300),
      goal: text(item.objetivo, `${field}.objetivo`, 2000),
      role,
      analysisUnitStatements,
      evidenceRequirementStatements: statementList(
        item.requisitosDeEvidencia,
        `${field}.requisitosDeEvidencia`
      )
    };
  });
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
        "A estrutura corrente do Curso é inválida."
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
    "A estrutura do Curso excede o limite; reduza o recorte antes de salvar a Parte."
  );
}

function existingEntityByTitle(rows, entityType, parentId, title) {
  const wanted = matchingText(title);
  const matches = rows.filter((row) => row?.entityType === entityType &&
    (row.parentId ?? null) === parentId && matchingText(row.content?.title) === wanted);
  if (matches.length > 1) {
    fail(
      "ambiguous_human_reference",
      `Há mais de um ${entityType} chamado “${title}” no mesmo contexto.`,
      { entityType, title },
      409
    );
  }
  return matches[0] ?? null;
}

function consistentHierarchyGoal(goals, identity, goal, label) {
  const previous = goals.get(identity);
  if (previous !== undefined && previous !== goal) {
    fail(
      "inconsistent_authoring_part_hierarchy",
      `${label} recebeu objetivos diferentes na mesma Parte.`,
      { label },
      409
    );
  }
  goals.set(identity, goal);
}

function currentPartMicrosequenceIds(part) {
  if (!part) return [];
  if (Array.isArray(part.microsequences)) {
    return part.microsequences.map((item) => item?.id).filter(Boolean);
  }
  return Array.isArray(part.microsequenceIds) ? [...part.microsequenceIds] : [];
}

async function buildApprovedPart({ state, definitions, title, intent, newId }) {
  const rows = [...state.entities];
  const partId = state.part?.id ?? await newId("part");
  const partPosition = state.part?.position ?? state.plan.plan.parts.length;
  const currentMicrosequenceIds = currentPartMicrosequenceIds(state.part);
  const assignedElsewhere = new Set((state.plan.plan.parts || [])
    .filter((part) => part.id !== partId)
    .flatMap(currentPartMicrosequenceIds));
  const moduleGoals = new Map();
  const lessonGoals = new Map();
  const selectedMicrosequenceIds = new Set();
  const analysisTargetById = new Map();
  const planItemRows = {
    instructional_analysis_unit: Array.isArray(state.plan.plan.instructionalAnalysisUnits)
      ? [...state.plan.plan.instructionalAnalysisUnits]
      : [],
    evidence_requirement: Array.isArray(state.plan.plan.evidenceRequirements)
      ? [...state.plan.plan.evidenceRequirements]
      : []
  };

  const resolvePlanItem = async (kind, statement) => {
    const collection = planItemRows[kind];
    const matches = collection.filter((item) => matchingText(item.statement) === matchingText(statement));
    if (matches.length > 1) {
      fail(
        "ambiguous_semantic_inventory_item",
        `O inventário contém mais de um item equivalente a “${statement}”.`,
        { kind, statement },
        409
      );
    }
    if (matches[0]) {
      return {
        id: matches[0].id,
        position: matches[0].position,
        statement: matches[0].statement
      };
    }
    const created = {
      id: await newId(`${kind}:${collection.length}`),
      position: collection.reduce((maximum, item) => Math.max(maximum, item.position), -1) + 1,
      statement
    };
    collection.push(created);
    return created;
  };

  const microsequences = [];
  for (const [index, definition] of definitions.entries()) {
    let moduleRow = existingEntityByTitle(rows, "module", null, definition.moduleTitle);
    if (!moduleRow) {
      moduleRow = {
        entityType: "module",
        entityId: await newId(`module:${matchingText(definition.moduleTitle)}`),
        parentId: null,
        content: { title: definition.moduleTitle }
      };
      rows.push(moduleRow);
    }
    consistentHierarchyGoal(
      moduleGoals,
      moduleRow.entityId,
      definition.moduleGoal,
      `O Módulo “${definition.moduleTitle}”`
    );

    let lessonRow = existingEntityByTitle(
      rows,
      "lesson",
      moduleRow.entityId,
      definition.lessonTitle
    );
    if (!lessonRow) {
      lessonRow = {
        entityType: "lesson",
        entityId: await newId(`lesson:${moduleRow.entityId}:${matchingText(definition.lessonTitle)}`),
        parentId: moduleRow.entityId,
        content: { title: definition.lessonTitle }
      };
      rows.push(lessonRow);
    }
    consistentHierarchyGoal(
      lessonGoals,
      lessonRow.entityId,
      definition.lessonGoal,
      `A Lição “${definition.lessonTitle}”`
    );

    let microsequenceRow = existingEntityByTitle(
      rows,
      "microsequence",
      lessonRow.entityId,
      definition.title
    );
    if (microsequenceRow && assignedElsewhere.has(microsequenceRow.entityId)) {
      fail(
        "authoring_microsequence_already_assigned",
        `A Microssequência “${definition.title}” já pertence a outra Parte; use outro título ou revise a Parte existente.`,
        { title: definition.title },
        409
      );
    }
    if (!microsequenceRow) {
      const indexedCurrentId = currentMicrosequenceIds[index] ?? null;
      const indexedCurrent = rows.find((row) => row?.entityType === "microsequence" &&
        row.entityId === indexedCurrentId && row.parentId === lessonRow.entityId);
      microsequenceRow = indexedCurrent || {
        entityType: "microsequence",
        entityId: await newId(`microsequence:${index}`),
        parentId: lessonRow.entityId,
        content: { title: definition.title }
      };
      if (!indexedCurrent) rows.push(microsequenceRow);
    }
    if (selectedMicrosequenceIds.has(microsequenceRow.entityId)) {
      fail(
        "duplicate_authoring_part_microsequence",
        `A Parte repete a Microssequência “${definition.title}”.`,
        { title: definition.title },
        409
      );
    }
    selectedMicrosequenceIds.add(microsequenceRow.entityId);

    const analysisUnits = await Promise.all(
      definition.analysisUnitStatements.map((statement) =>
        resolvePlanItem("instructional_analysis_unit", statement))
    );
    for (const analysisUnit of analysisUnits) {
      const previousMicrosequenceId = analysisTargetById.get(analysisUnit.id);
      if (previousMicrosequenceId && previousMicrosequenceId !== microsequenceRow.entityId) {
        fail(
          "analysis_unit_assigned_to_multiple_microsequences",
          `A novidade “${analysisUnit.statement}” aparece em duas Microssequências; mantenha-a somente onde será introduzida.`,
          { statement: analysisUnit.statement },
          409
        );
      }
      analysisTargetById.set(analysisUnit.id, microsequenceRow.entityId);
    }
    microsequences.push({
      moduleId: moduleRow.entityId,
      moduleTitle: definition.moduleTitle,
      moduleGoal: definition.moduleGoal,
      lessonId: lessonRow.entityId,
      lessonTitle: definition.lessonTitle,
      lessonGoal: definition.lessonGoal,
      microsequenceId: microsequenceRow.entityId,
      title: definition.title,
      goal: definition.goal,
      role: definition.role,
      position: index,
      analysisUnits,
      evidenceRequirements: await Promise.all(
        definition.evidenceRequirementStatements.map((statement) =>
          resolvePlanItem("evidence_requirement", statement))
      )
    });
  }

  return {
    courseId: state.course.id,
    expectedCourseRevision: state.course.revision,
    expectedPlanVersion: planVersion(state.plan),
    part: {
      partId,
      position: partPosition,
      title,
      intent,
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

function projectedPlanContext(plan, part) {
  const source = plan?.plan || {};
  return {
    title: source.title ?? null,
    objective: source.objective ?? null,
    partCount: Array.isArray(source.parts) ? source.parts.length : 0,
    part: part ? {
      position: Number(part.position) + 1,
      title: part.title,
      intent: part.intent,
      progress: part.progress ?? null,
      microsequences: Array.isArray(part.microsequences)
        ? part.microsequences.map((item, index) => ({
            position: Number(item.productionPosition ?? item.position ?? index) + 1,
            title: item.title ?? null
          }))
        : []
    } : null,
    instructionalAnalysisUnits: Array.isArray(source.instructionalAnalysisUnits)
      ? source.instructionalAnalysisUnits.map(({ position, statement }) => ({
          position: Number(position) + 1,
          statement
        }))
      : [],
    evidenceRequirements: Array.isArray(source.evidenceRequirements)
      ? source.evidenceRequirements.map(({ position, statement }) => ({
          position: Number(position) + 1,
          statement
        }))
      : []
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
        "A paginação de Unidades repetiu o mesmo ponto."
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
        "A lista de Unidades é inválida."
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
        "A lista de Unidades perdeu o ponto de retomada."
      );
    }
    cursorStudyUnitId = next;
  }
  throw new AuthoringApiError(
    503,
    "course_service_unavailable",
    "A leitura de Unidades excedeu o limite seguro de paginação."
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
          "A paginação de Observações perdeu o ponto de retomada."
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

function projectConfiguration(read) {
  const definitionById = new Map((read?.definitions ?? []).map((definition) => [
    definition.id,
    definition
  ]));
  const effectivePolicy = read?.componentPolicy?.effectiveAssignment ?? null;
  return {
    scope: read?.scopeContext?.current?.label ?? null,
    parameters: Array.isArray(read?.parameters)
      ? read.parameters.map((parameter) => ({
          name: definitionById.get(parameter.parameterId)?.label ?? parameter.parameterId,
          localValue: parameter.localAssignment?.value ?? null,
          effectiveValue: parameter.effectiveAssignment?.value ?? null,
          inherited: parameter.effectiveAssignment?.inherited ?? false,
          origin: parameter.effectiveAssignment?.origin ?? null,
          reason: parameter.effectiveAssignment?.reason ?? null,
          sourceScope: parameter.effectiveAssignment?.sourceScope?.kind ?? null
        }))
      : [],
    editorialDirection: {
      local: read?.guidance?.localAssignment?.guidance ?? null,
      effective: Array.isArray(read?.guidance?.effectiveAssignments)
        ? read.guidance.effectiveAssignments.map((assignment) => ({
            guidance: assignment.guidance,
            origin: assignment.origin,
            reason: assignment.reason,
            sourceScope: assignment.sourceScope?.kind ?? null
          }))
        : []
    },
    componentPolicy: effectivePolicy == null ? null : {
      policy: withoutTechnicalState(effectivePolicy.policy),
      inherited: effectivePolicy.inherited ?? false,
      origin: effectivePolicy.origin ?? null,
      reason: effectivePolicy.reason ?? null,
      sourceScope: effectivePolicy.sourceScope?.kind ?? null
    },
    targets: read?.targetPlanItems == null ? null : withoutTechnicalState(read.targetPlanItems)
  };
}

function projectFocalPlanItems(items, targetIds, label) {
  if (!Array.isArray(items) || !Array.isArray(targetIds)) {
    fail("course_service_unavailable", `O inventário focal de ${label} está incompleto.`, null, 503);
  }
  const itemById = new Map(items.map((item) => [item?.id, item]));
  return targetIds.map((targetId) => {
    const item = itemById.get(targetId);
    const position = Number(item?.position);
    if (!item || !Number.isSafeInteger(position) || position < 0 ||
        typeof item.statement !== "string" || !item.statement.trim()) {
      fail("course_service_unavailable", `O inventário focal de ${label} divergiu do plano.`, null, 503);
    }
    return { position: position + 1, statement: item.statement };
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

function projectMaterializationPart(planRead, part, designReads, unitDesignReads = []) {
  const plan = planRead?.plan ?? {};
  const microsequences = Array.isArray(part?.microsequences) ? part.microsequences : [];
  const partPosition = Number(part?.position);
  if (!microsequences.length || !Array.isArray(designReads) ||
      designReads.length !== microsequences.length ||
      !Number.isSafeInteger(partPosition) || partPosition < 0) {
    fail("course_service_unavailable", "O recorte focal da Parte está incompleto.", null, 503);
  }
  return {
    position: partPosition + 1,
    title: part.title,
    intent: part.intent,
    establishedAnalysisUnits: (Array.isArray(plan.instructionalAnalysisUnits)
      ? plan.instructionalAnalysisUnits
      : []).filter((item) => item?.introduced === true &&
        item.introducedPartPosition !== null &&
        Number.isSafeInteger(item.introducedPartPosition) &&
        item.introducedPartPosition < partPosition)
      .map((item) => ({ position: Number(item.position) + 1, statement: item.statement })),
    microsequences: microsequences.map((microsequence, index) => {
      const design = designReads[index];
      const targets = design?.targetPlanItems;
      const configuration = projectConfiguration(design);
      const humanFunction = HUMAN_FUNCTION_BY_MICROSEQUENCE_ROLE[microsequence.role];
      if (typeof microsequence.goal !== "string" || !microsequence.goal.trim() ||
          !humanFunction) {
        fail(
          "course_service_unavailable",
          "A finalidade de uma Microssequência divergiu do planejamento.",
          null,
          503
        );
      }
      delete configuration.targets;
      const existingStudyUnitOverrides = unitDesignReads
        .filter((entry) => entry.microsequenceId === microsequence.id &&
          hasEffectiveStudyUnitOverride(entry.design))
        .map((entry) => {
          const unitConfiguration = projectConfiguration(entry.design);
          delete unitConfiguration.targets;
          return {
            position: Number(entry.unit.studyUnit.position),
            title: entry.unit.studyUnit.title,
            configuration: unitConfiguration
          };
        })
        .sort((left, right) => left.position - right.position);
      return {
        position: Number(microsequence.productionPosition ?? microsequence.position ?? index) + 1,
        title: microsequence.title,
        objective: microsequence.goal,
        function: humanFunction,
        curriculum: {
          module: microsequence.curriculumPath?.moduleTitle ?? null,
          lesson: microsequence.curriculumPath?.lessonTitle ?? null
        },
        instructionalAnalysisUnits: projectFocalPlanItems(
          plan.instructionalAnalysisUnits,
          targets?.instructionalAnalysisUnitIds,
          "unidades de análise"
        ),
        evidenceRequirements: projectFocalPlanItems(
          plan.evidenceRequirements,
          targets?.evidenceRequirementIds,
          "requisitos de evidência"
        ),
        configuration,
        existingStudyUnitOverrides
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
        ? "Encontrei um Curso para retomar."
        : `Encontrei ${page?.items?.length ?? 0} Cursos para retomar.`,
      {
        nextDecision: page?.items?.length === 1
          ? "Quer continuar do ponto atual?"
          : "Qual Curso você quer retomar?",
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
  return result(`Retomei o Curso “${resolved.course.title}”.`, {
    deepLink: courseDeepLink(adapter, resolved.course, "planning",
      part?.id ? [["authoringPartId", part.id]] : []),
    nextDecision: part
      ? `Quer revisar a Parte ${Number(part.position) + 1} ou propor a próxima?`
      : "Quer propor a primeira Parte?",
    context: projectedPlanContext(plan, part)
  });
};

HUMAN_TASK_HANDLERS.consultar_planejamento = async ({
  adapter, principal, args, deadlineAt
}) => {
  const resolved = await resolveTaskContext({ adapter, principal, args, deadlineAt });
  const plan = resolved.plan || await loadPlan(adapter, principal, resolved.course, deadlineAt);
  const part = focusedPart(plan, resolved.part);
  return result(part
    ? `O planejamento está na Parte ${Number(part.position) + 1}: ${part.title}.`
    : "O Curso ainda não tem Partes planejadas.", {
    deepLink: courseDeepLink(adapter, resolved.course, "planning",
      part?.id ? [["authoringPartId", part.id]] : []),
    nextDecision: args.parte === undefined
      ? "Quer revisar esta Parte ou propor somente a próxima?"
      : "Quer alterar esta Parte?",
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
      "A Parte excede 64 Unidades e não cabe numa materialização atômica.",
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
  return result(`Preparei o recorte focal da Parte ${Number(part.position) + 1}: ${part.title}.`, {
    deepLink: courseDeepLink(adapter, resolved.course, "planning", [["authoringPartId", part.id]]),
    nextDecision: "Gere as Unidades necessárias sem mudar o inventário semântico.",
    context: {
      part: projectMaterializationPart(resolved.plan, part, design, unitDesign)
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
      configuration: projectConfiguration(configuration),
      appliedToUnit: unit?.authorship?.design?.application ?? null
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
  return result(`${count} ${count === 1 ? "Observação encontrada" : "Observações encontradas"}.`, {
    deepLink: courseDeepLink(adapter, resolved.course, "review"),
    nextDecision: count ? "Quer preparar uma revisão coerente dessas Observações?" : null,
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
  return result("Li as Fontes e Âncoras do recorte solicitado.", {
    deepLink: courseDeepLink(adapter, resolved.course, "content",
      unit ? [["studyUnitId", unit.id]] : []),
    nextDecision: "Quer adotar, contestar ou vincular alguma Fonte?",
    context: { sources: context }
  });
};

HUMAN_TASK_HANDLERS.consultar_componentes = async ({ args }) => {
  if (!Object.keys(args).length) {
    fail("missing_human_task_argument", "Informe busca, funcao ou componente.");
  }
  const query = [args.busca, args.funcao, args.componente]
    .filter((value) => value !== undefined)
    .map((value, index) => text(value, `consulta[${index}]`, 500))
    .join(" ");
  const catalog = RESOURCE_CATALOG.search({ query, limit: 8 });
  return result("Encontrei representações candidatas para a função instrucional.", {
    nextDecision: "Qual representação cumpre melhor a função desta Unidade?",
    context: { components: catalog }
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
  return result(`Criei o Curso privado “${course.title}”.`, {
    deepLink: courseDeepLink(adapter, course, "planning"),
    nextDecision: "Quer propor somente a Parte 1?",
    context: { course: { title: course.title } }
  });
};

HUMAN_TASK_HANDLERS.salvar_parte = async ({ adapter, principal, args, deadlineAt }) => {
  const course = humanCourseTitle(args);
  const partReference = optionalReference(args.parte, "parte");
  const title = text(args.titulo, "titulo", 300);
  const intent = text(args.intencao, "intencao", 2000);
  const definitions = normalizeApprovedPartMicrosequences(args.microssequencias);
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
      const built = await buildApprovedPart({ state, definitions, title, intent, newId });
      savedPartId = built.part.partId;
      return built;
    },
    commit: async ({ requestId, ...value }) => await adapter.saveCourseAuthoringPart({
      principal, ...value, requestId, deadlineAt
    })
  });
  return result(partReference === undefined
    ? `Adicionei somente a próxima Parte: ${title}.`
    : `Revisei a Parte: ${title}.`, {
    deepLink: courseDeepLink(adapter, savedCourse, "planning", [["authoringPartId", savedPartId]]),
    nextDecision: "Quer revisar esta Parte ou propor somente a próxima?",
    context: {
      part: { title, intent, microsequenceCount: definitions.length },
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

const PARAMETER_FIELD_TO_ID = Object.freeze({
  tetoNovasUnidadesDeAnalise:
    "new_analysis_unit_ceiling_per_expository_study_unit",
  formasDeExplicacao: "required_explanation_forms",
  minimoDePraticasPorRequisito:
    "minimum_distinct_practice_opportunities_per_evidence_requirement",
  dimensoesDeVariacaoDaPratica: "required_practice_variation_dimensions"
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
  }[args.condicao ?? "automatica"];
  if (!origin) {
    fail("invalid_human_task_argument", "condicao é inválida.", { field: "condicao" });
  }
  if (microsequence !== undefined && studyUnit !== undefined) {
    fail(
      "ambiguous_human_scope",
      "Informe Microssequência ou StudyUnit, não os dois escopos ao mesmo tempo.",
      null,
      409
    );
  }
  const parameters = args.parametrosPedagogicos === undefined
    ? null
    : plainObject(args.parametrosPedagogicos, "parametrosPedagogicos");
  if (!parameters && args.direcaoEditorial === undefined) {
    fail(
      "missing_human_task_argument",
      "Informe parametrosPedagogicos e/ou direcaoEditorial."
    );
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
  for (const normalizedCommand of commands) {
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
  return result("Atualizei a configuração autoral e reli os valores efetivos.", {
    deepLink: courseDeepLink(adapter, resolved.course, "parameters",
      resolved.studyUnits?.[0]
        ? [["studyUnitId", resolved.studyUnits[0].studyUnit.id]]
        : resolved.microsequence
          ? [["didacticMicrosequenceId", resolved.microsequence.id]]
          : []),
    nextDecision: "Quer comparar esta condição com outra configuração?",
    context: { configuration: projectConfiguration(configuration) }
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
    fail("invalid_human_task_argument", "categoria não pertence às Observações.", {
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
      ? "Registrei a Observação na Unidade selecionada."
      : `Registrei a Observação separadamente em ${units.length} Unidades.`,
    {
      deepLink: courseDeepLink(adapter, savedCourse, "review"),
      nextDecision: "Quer registrar outra Observação ou preparar a revisão das abertas?",
      context: { observationCount: units.length }
    }
  );
};

function sourceDocument(publicValue, previous = null) {
  const value = plainObject(publicValue, "metadados");
  const availability = Object.freeze({
    aberta: "open_access",
    restrita: "restricted",
    privada: "private",
    desconhecida: "unknown"
  });
  const verification = Object.freeze({
    nao_verificada: "unverified",
    adotada_pelo_autor: "author_verified"
  });
  const visibility = Object.freeze({
    oculta: "hidden",
    citacao: "citation",
    citacao_e_link: "citation_and_link"
  });
  return {
    kind: value.tipo ?? previous?.kind ?? "document",
    title: text(value.titulo, "metadados.titulo", 300),
    authorship: value.autoria === undefined ? previous?.authorship ?? null : value.autoria,
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
    origin: "author_provided",
    availability: availability[value.disponibilidade] ?? previous?.availability ?? "unknown",
    verificationStatus: verification[value.verificacao] ??
      previous?.verificationStatus ?? "unverified",
    studyVisibility: visibility[value.visibilidadeNoEstudo] ??
      previous?.studyVisibility ?? "hidden"
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
    fail("invalid_human_task_argument", "O tipo de Âncora é inválido.");
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
    throw new AuthoringApiError(409, "ambiguous_human_reference", "A Âncora é ambígua.");
  }
  return matches[0] ?? null;
}

HUMAN_TASK_HANDLERS.manter_fonte = async ({ adapter, principal, args, deadlineAt }) => {
  const course = humanCourseTitle(args);
  let sourceReference = optionalReference(args.fonte, "fonte");
  let internalSourceId = null;
  let savedSourceId = null;
  if (args.metadados === undefined && args.ancoras === undefined && args.vinculos === undefined) {
    fail("missing_human_task_argument", "Informe metadados, ancoras e/ou vinculos.");
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
  for (let index = 0; index < anchors.length; index += 1) {
    if (sourceReference === undefined && internalSourceId === null) {
      fail("missing_human_task_argument", "Informe fonte para manter Âncoras.");
    }
    const anchor = plainObject(anchors[index], `ancoras[${index}]`);
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
        return {
          type: "save_anchor",
          anchorId: existing?.anchorId ?? await newId(`anchor:${index}`),
          sourceId: state.source.sourceId,
          sourceRevision: Number(state.sourceDetail?.revision ?? state.source.revision),
          expectedAnchorRevision: Number(existing?.revision ?? 0),
          selector: sourceSelector(anchor.seletor),
          humanLocator: anchor.localizadorHumano ?? null,
          verificationExcerpt: anchor.trechoDeVerificacao ?? null
        };
      }
    });
  }
  const bindings = args.vinculos === undefined ? [] : safeClone(args.vinculos, "vinculos", 128 * 1024);
  for (let index = 0; index < bindings.length; index += 1) {
    if (sourceReference === undefined && internalSourceId === null) {
      fail("missing_human_task_argument", "Informe fonte para vincular proveniência.");
    }
    const binding = plainObject(bindings[index], `vinculos[${index}]`);
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
      build: async (state) => {
        const unit = state.studyUnits[0];
        const selectedAnchors = (binding.ancoras ?? []).map((reference) => {
          const matched = matchAnchor(state.sourceDetail?.anchors ?? [], reference);
          if (!matched) {
            throw new AuthoringApiError(404, "human_reference_not_found", "A Âncora não foi localizada.");
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
        const requestedLink = {
          sourceId: state.source.sourceId,
          relation: text(binding.relacao, "vinculos.relacao", 80),
          anchors: selectedAnchors
        };
        return {
          courseId: state.course.id,
          expectedCourseRevision: state.course.revision,
          command: normalizeCourseSourceCommand({
            type: "set_target_sources",
            targetKind: "study_unit",
            targetId: unit.studyUnit.id,
            expectedTargetVersion: Number(unit.version ?? unit.studyUnit.version ?? 1),
            sourceLinks: [
              ...(Array.isArray(currentLinks)
                ? currentLinks.filter((link) => link.sourceId !== state.source.sourceId)
                : []),
              requestedLink
            ]
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
  return result("Atualizei a Fonte, suas Âncoras e vínculos solicitados.", {
    deepLink: courseDeepLink(adapter, resolved.course, "sources"),
    nextDecision: "Quer revisar esta Fonte no contexto de uma Unidade?",
    context: { source: resolved.source ?? { title: sourceReference } }
  });
};

HUMAN_TASK_HANDLERS.incorporar_pdf_como_fonte = async ({
  adapter, principal, args, deadlineAt, projectionRecipient
}) => {
  const course = humanCourseTitle(args);
  const sourceReference = optionalReference(args.fonte, "fonte");
  text(args.intencao, "intencao", 1000);
  const pdf = plainObject(args.pdf, "pdf");
  exactFields(pdf, new Set(["file_id", "file_name", "mime_type", "download_url"]));
  const descriptor = {
    file_id: text(pdf.file_id, "pdf.file_id", 512),
    ...(pdf.file_name === undefined ? {} : { file_name: text(pdf.file_name, "pdf.file_name", 512) }),
    ...(pdf.mime_type === undefined ? {} : { mime_type: text(pdf.mime_type, "pdf.mime_type", 80) })
  };
  if (typeof pdf.download_url === "string") {
    Object.defineProperty(descriptor, "download_url", {
      value: pdf.download_url,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  const receipt = await executeTrustedCourseWrite({
    load: async () => await resolveHumanCourseContext({
      adapter, principal, course, source: sourceReference ?? null, deadlineAt
    }),
    build: async (state, { newId }) => {
      const sourceIntent = sourceReference === undefined
        ? {
            mode: "save",
            sourceId: await newId("pdf-source"),
            expectedSourceRevision: 0,
            source: sourceDocument({
              titulo: text(args.titulo, "titulo", 300),
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
    source: sourceReference ?? args.titulo,
    deadlineAt
  });
  return result("Mantive o PDF entre as Fontes do Curso.", {
    deepLink: courseDeepLink(adapter, resolved.course, "sources"),
    nextDecision: "Quer criar ou revisar Âncoras verificáveis deste PDF?",
    context: {
      source: resolved.source,
      stored: receipt?.stored !== false,
      recipient: projectionRecipient === "connected_mcp_client" ? "connected_client" : "action"
    }
  });
};
