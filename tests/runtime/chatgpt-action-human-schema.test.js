import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  COURSE_HUMAN_TASK_CATALOG_METADATA,
  COURSE_HUMAN_TASKS
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  HUMAN_ACTION_FILE_FIELD,
  projectHumanAuthoringTasksForActions
} from "../../scripts/projectHumanAuthoringActions.mjs";

const openApiText = await fs.readFile(new URL(
  "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
  import.meta.url
), "utf8");
const openApi = JSON.parse(openApiText);
const actionTools = projectHumanAuthoringTasksForActions(COURSE_HUMAN_TASKS);
const golden = JSON.parse(await fs.readFile(new URL(
  "../fixtures/human-authoring-golden-prompts.v2.json",
  import.meta.url
), "utf8"));

const SAMPLE_THEORY_CONTENT = Object.freeze({
  title: "O papel do socket",
  role: "theory",
  content: Object.freeze([Object.freeze({
    id: "body",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: Object.freeze({ text: "Um socket liga o processo ao transporte." })
  })]),
  response: null,
  feedback: Object.freeze([]),
  topics: Object.freeze(["socket"])
});

const samples = {
  retomar_curso: { titulo: "Redes para iniciantes" },
  consultar_planejamento: { curso: "Redes para iniciantes", parte: 2 },
  preparar_materializacao: { curso: "Redes para iniciantes", parte: "Sockets" },
  consultar_configuracao: {
    curso: "Redes para iniciantes",
    microssequencia: "Sockets"
  },
  consultar_observacoes: {
    curso: "Redes para iniciantes",
    unidades: [4, 7],
    somenteAbertas: true
  },
  preparar_revisao: {
    curso: "Redes para iniciantes",
    microssequencia: "Roteamento"
  },
  consultar_fontes: { curso: "Redes para iniciantes", fonte: "Manual do proxy" },
  consultar_componentes: {
    funcao: "Representar uma sequência de decisões sem perder a ordem.",
    estrutura: "processo",
    operacao: "acompanhar",
    papel: "teoria",
    lugar: "conteudo"
  },
  criar_curso: {
    titulo: "Redes para iniciantes",
    objetivo: "Explicar como requisições chegam a serviços."
  },
  salvar_mapa_curricular: {
    curso: "Redes para iniciantes",
    aprovado: false,
    publico: "Pessoas iniciantes em redes",
    preRequisitos: [],
    itensDeEscopo: ["comunicação entre processos"],
    modulos: [{
      titulo: "Comunicação",
      objetivo: "Explicar a comunicação entre processos.",
      licoes: [{
        titulo: "Sockets",
        objetivo: "Relacionar processo e transporte.",
        microssequencias: [{
          titulo: "Socket e processo",
          objetivo: "Explicar a função do socket.",
          dependencias: [],
          cobertura: ["comunicação entre processos"]
        }]
      }]
    }]
  },
  salvar_parte: {
    curso: "Redes para iniciantes",
    titulo: "Sockets",
    intencao: "Relacionar processos e comunicação em rede.",
    microssequencias: ["Socket e processo"],
    progressao: [
      "Partir de uma conversa entre processos.",
      "Relacionar o processo ao transporte por meio do socket."
    ]
  },
  materializar_parte: {
    curso: "Redes para iniciantes",
    parte: "Sockets",
    unidades: [{
      microssequencia: "Sockets",
      posicao: 1,
      conteudo: SAMPLE_THEORY_CONTENT,
      configuracao: {
        parametrosPedagogicos: {
          tetoNovasUnidadesDeAnalise: 1,
          formasDeExplicacao: ["plain_definition"],
          minimoDePraticasPorRequisito: 1,
          dimensoesDeVariacaoDaPratica: ["case_or_data"]
        },
        parametrosEditoriais: {
          alvoDePalavrasPorResposta: 90,
          alvoDePalavrasPorUnidade: 180
        },
        direcaoEditorial: "Explique o mecanismo antes de nomear exceções."
      },
      aplicacaoPedagogica: {
        ideiasIntroduzidas: ["Socket como interface"],
        ideiasUtilizadas: [],
        explicacoes: [{
          ideia: "Socket como interface",
          formas: ["plain_definition"]
        }],
        praticas: [],
        cobertura: ["comunicação entre processos"]
      },
      fontes: []
    }]
  },
  ajustar_configuracao: {
    curso: "Redes para iniciantes",
    microssequencia: "Sockets",
    condicao: "fixada_pelo_autor",
    parametrosPedagogicos: { tetoNovasUnidadesDeAnalise: 1 }
  },
  registrar_observacao: {
    curso: "Redes para iniciantes",
    unidades: [4, 7],
    texto: "A condição de roteamento continua ambígua.",
    categoria: "confusing"
  },
  aplicar_correcoes: {
    curso: "Redes para iniciantes",
    correcoes: [{
      unidade: 4,
      conteudo: { ...SAMPLE_THEORY_CONTENT, title: "Regra revista" },
      fontes: []
    }]
  },
  manter_fonte: {
    curso: "Redes para iniciantes",
    metadados: {
      tipo: "document",
      papel: "tecnica_conceitual",
      titulo: "Manual do proxy"
    }
  },
  incorporar_pdf_como_fonte: {
    curso: "Redes para iniciantes",
    titulo: "Manual do proxy",
    papel: "tecnica_conceitual",
    intencao: "Manter o PDF como referência técnica do Curso.",
    [HUMAN_ACTION_FILE_FIELD]: ["file-reference"]
  }
};

function operation(name) {
  return openApi.paths[`/${name}`]?.post;
}

function visit(value, callback, path = "$") {
  if (!value || typeof value !== "object") return;
  callback(value, path);
  if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, callback, `${path}[${index}]`));
  else Object.entries(value).forEach(([key, entry]) => visit(entry, callback, `${path}.${key}`));
}

test("#272 OpenAPI publica exatamente as dezessete tarefas humanas", () => {
  assert.deepEqual(Object.keys(openApi.paths), COURSE_HUMAN_TASKS.map(({ name }) => `/${name}`));
  assert.equal(openApi.info["x-aralearn-task-catalog"], COURSE_HUMAN_TASK_CATALOG_METADATA.id);
  assert.equal(
    openApi.info["x-aralearn-task-catalog-version"],
    COURSE_HUMAN_TASK_CATALOG_METADATA.version
  );
  assert.equal(COURSE_HUMAN_TASK_CATALOG_METADATA.version, "2.3.5");
  assert.equal(
    openApi.info["x-aralearn-task-catalog-fingerprint"],
    COURSE_HUMAN_TASK_CATALOG_METADATA.hash
  );
  assert.doesNotMatch(COURSE_HUMAN_TASK_CATALOG_METADATA.hash, /pending/iu);
});

test("#272 metadata segue quando usar, desambiguação e hints pelo efeito real", () => {
  for (const task of COURSE_HUMAN_TASKS) {
    assert.match(task.description, /^Use\b/u, task.name);
    assert.match(task.description, /\bNão\b/iu, task.name);
    assert.equal(task.annotations.openWorldHint, false, task.name);
    assert.equal(
      task.annotations.destructiveHint,
      task.name === "manter_fonte",
      task.name
    );
    assert.equal(typeof task.annotations.readOnlyHint, "boolean", task.name);
    const action = operation(task.name);
    assert.equal(action.description, task.description);
    assert.equal(action["x-openai-isConsequential"], task.annotations.readOnlyHint !== true);
  }
});

test("#272 argumentos humanos são documentados e não recebem controles internos", () => {
  const forbidden = /^(?:id|ids|courseId|revision|version|hash|path|requestId|expectedRevision|expectedPlanVersion|cursor)$/iu;
  for (const task of actionTools) {
    const schema = task.inputSchema;
    for (const [name, property] of Object.entries(schema.properties || {})) {
      if (task.name === "incorporar_pdf_como_fonte" && name === HUMAN_ACTION_FILE_FIELD) continue;
      assert.doesNotMatch(name, forbidden, `${task.name}.${name}`);
      assert.equal(typeof property.description, "string", `${task.name}.${name} sem descrição`);
      assert.ok(property.description.trim().length >= 12, `${task.name}.${name} descrição curta`);
    }
    visit(schema, (entry, path) => {
      for (const name of Object.keys(entry.properties || {})) {
        if (name === "file_id") continue;
        const localComponentIdentity = ["id", "version"].includes(name) &&
          /\.properties\.conteudo\.properties\.(?:content\.items|response\.anyOf\[1\]|feedback\.items)$/u
            .test(path);
        if (localComponentIdentity) continue;
        assert.doesNotMatch(name, forbidden, `${task.name}:${path}.${name}`);
      }
    });
  }
  assert.doesNotMatch(
    openApi.info.description,
    /\bCAS\b|requestId|expectedRevision|expectedPlanVersion|\bhashes\b|\bpaths\b|\bpayloads\b/iu
  );
  assert.equal(
    openApi.info.description,
    "Opera cursos privados por tarefas humanas, sem exigir controles internos do banco.\n\n" +
      COURSE_AUTHORING_SERVER_INSTRUCTIONS
  );
  assert.match(openApi.info.description, /mapa completo de módulos, lições e microssequências/iu);
  assert.match(openApi.info.description, /decisão da pessoa autora cobre o mapa apresentado/iu);
  assert.match(openApi.info.description, /Partes são lotes operacionais.*sem alterar o currículo/iu);
  assert.match(
    openApi.info.description,
    /aprovar o mapa.*pedir o lote.*mesma mensagem.*registre primeiro o mapa/iu
  );
  assert.match(
    openApi.info.description,
    /falhas, diga só impacto e retomada.*omita causas, validações e mecanismos internos/iu
  );
  assert.match(openApi.info.description, /autor.*estudante.*minúsculas/iu);
  assert.match(openApi.info.description, /não estatísticas da estrutura/iu);
  assert.match(
    openApi.info.description,
    /devolver um link.*endereço exato.*link Markdown no chat/iu
  );
  assert.doesNotMatch(
    openApi.info.description,
    /aprovada?,?\s+materialize|produza (?:agora|o conteúdo aprovado)|no chat, só/iu
  );
  assert.match(
    operation("salvar_mapa_curricular").description,
    /propor\/aprovar o mapa antes do lote/iu
  );
  assert.match(
    operation("salvar_parte").description,
    /após confirmar a progressão/iu
  );
  assert.match(operation("salvar_parte").description, /não para propô-la/iu);
  assert.doesNotMatch(operation("salvar_parte").description, /(?:parte|lote) aprovad/iu);
  assert.doesNotMatch(operation("materializar_parte").description, /aprovad/iu);
  assert.ok(COURSE_AUTHORING_SERVER_INSTRUCTIONS.length <= 1000);
  assert.ok(Object.hasOwn(
    operation("consultar_componentes").requestBody.content["application/json"]
      .schema.properties,
    "estrutura"
  ));
  assert.ok(Object.hasOwn(
    operation("consultar_componentes").requestBody.content["application/json"]
      .schema.properties,
    "operacao"
  ));
});

test("contrato global mantém a calibração automática fora do chat", () => {
  assert.match(
    openApi.info.description,
    /estado default[\s\S]*calibr[\s\S]*(?:em silêncio|silenciosamente)/iu
  );
  assert.match(
    openApi.info.description,
    /parâmetros[\s\S]*contagens[\s\S]*formas[\s\S]*alvos[\s\S]*(?:pedido|solicita)/iu
  );
  assert.match(
    openApi.info.description,
    /após produzir[\s\S]*resultado[\s\S]*link[\s\S]*próxima etapa/iu
  );
  assert.match(
    operation("materializar_parte").description,
    /calibração contextual[\s\S]*(?:cada|por) unidade[\s\S]*sem etapa separada/iu
  );
  assert.match(
    operation("ajustar_configuracao").description,
    /fixar[\s\S]*autoria[\s\S]*pesquisa[\s\S]*não.*calibração automática rotineira/iu
  );
});

test("Actions documenta context como memória de continuação e não como fala", () => {
  const actionContext = openApi.components.schemas.HumanTaskResult.properties.context;
  assert.ok(actionContext, "Actions precisa documentar context na resposta");
  assert.match(
    actionContext.description,
    /continua(?:r|ção)[\s\S]*(?:não|sem)[\s\S]*chat/iu
  );
});

test("#272 os dezessete inputs importáveis aceitam exemplos humanos e recusam mecânica", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const task of actionTools) {
    const validate = ajv.compile(task.inputSchema);
    assert.equal(validate(samples[task.name]), true, (
      `${task.name}: ${JSON.stringify(validate.errors)}`
    ));
    assert.equal(validate({ ...samples[task.name], requestId: "technical-request" }), false);
  }
  const adjust = validatorFor("ajustar_configuracao");
  const source = validatorFor("manter_fonte");
  const materialization = validatorFor("materializar_parte");
  assert.equal(adjust({ curso: "Redes para iniciantes" }), false);
  assert.equal(adjust({
    ...samples.ajustar_configuracao,
    condicao: undefined
  }), false, "ajustes persistentes precisam declarar sua origem");
  assert.equal(source({ curso: "Redes para iniciantes" }), false);
  assert.equal(materialization({
    ...samples.materializar_parte,
    unidades: [{
      ...samples.materializar_parte.unidades[0],
      conteudo: { ...SAMPLE_THEORY_CONTENT, content: [] }
    }]
  }), false);
  assert.equal(materialization({
    ...samples.materializar_parte,
    unidades: [{
      ...samples.materializar_parte.unidades[0],
      conteudo: { ...SAMPLE_THEORY_CONTENT, role: "practice", response: null }
    }]
  }), false);
});

test("Actions publica a calibração completa das unidades novas sem campo aberto", () => {
  const schemas = [
    actionTools.find(({ name }) => name === "materializar_parte").inputSchema,
    operation("materializar_parte").requestBody.content["application/json"].schema
  ].map((schema) => schema.properties.unidades.items.properties.configuracao);
  for (const schema of schemas) {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(Object.keys(schema.properties.parametrosPedagogicos.properties).sort(), [
      "dimensoesDeVariacaoDaPratica", "formasDeExplicacao",
      "minimoDePraticasPorRequisito", "tetoNovasUnidadesDeAnalise"
    ]);
    assert.deepEqual(Object.keys(schema.properties.parametrosEditoriais.properties).sort(), [
      "alvoDePalavrasPorResposta", "alvoDePalavrasPorUnidade"
    ]);
    assert.deepEqual(
      schema.properties.parametrosPedagogicos.properties.formasDeExplicacao.items.enum,
      [
        "plain_definition", "concrete_example", "mechanism", "contrast",
        "application_condition", "limit_or_exception", "worked_example",
        "representation_link"
      ]
    );
    assert.deepEqual(
      schema.properties.parametrosPedagogicos.properties
        .dimensoesDeVariacaoDaPratica.items.enum,
      ["case_or_data", "context", "task_feature", "external_representation", "support_level"]
    );
    assert.deepEqual(schema.properties.direcaoEditorial, {
      type: "string", minLength: 1, maxLength: 4000
    });
  }
});

test("MCP e Actions exigem em uma chamada a configuração efetiva completa da unidade", () => {
  const schemas = [
    COURSE_HUMAN_TASKS.find(({ name }) => name === "materializar_parte").inputSchema,
    actionTools.find(({ name }) => name === "materializar_parte").inputSchema,
    operation("materializar_parte").requestBody.content["application/json"].schema
  ];
  const expectedPedagogical = [
    "dimensoesDeVariacaoDaPratica",
    "formasDeExplicacao",
    "minimoDePraticasPorRequisito",
    "tetoNovasUnidadesDeAnalise"
  ];
  const expectedEditorial = [
    "alvoDePalavrasPorResposta",
    "alvoDePalavrasPorUnidade"
  ];

  for (const schema of schemas) {
    const unit = schema.properties.unidades.items;
    const configuration = unit.properties.configuracao;
    const pedagogical = configuration.properties.parametrosPedagogicos;
    const editorial = configuration.properties.parametrosEditoriais;

    assert.ok(unit.required.includes("configuracao"));
    assert.deepEqual(
      [...(configuration.required ?? [])].sort(),
      ["parametrosEditoriais", "parametrosPedagogicos"]
    );
    assert.deepEqual([...(pedagogical.required ?? [])].sort(), expectedPedagogical);
    assert.deepEqual([...(editorial.required ?? [])].sort(), expectedEditorial);
    for (const property of [
      ...Object.values(pedagogical.properties),
      ...Object.values(editorial.properties)
    ]) {
      assert.equal(
        Array.isArray(property.type) && property.type.includes("null"),
        false,
        "A calibração de materialização não pode aceitar null como decisão contextual."
      );
    }

    const validationSchema = structuredClone(schema);
    const content = validationSchema.properties.unidades.items.properties.conteudo;
    if (content?.$ref === "#/components/schemas/HumanStudyUnitContent") {
      validationSchema.properties.unidades.items.properties.conteudo =
        structuredClone(openApi.components.schemas.HumanStudyUnitContent);
    }
    const validate = new Ajv2020({ allErrors: true, strict: false })
      .compile(validationSchema);
    assert.equal(validate(samples.materializar_parte), true, JSON.stringify(validate.errors));
    for (const group of ["parametrosPedagogicos", "parametrosEditoriais"]) {
      const fields = Object.keys(configuration.properties[group].properties);
      for (const field of fields) {
        const missing = structuredClone(samples.materializar_parte);
        delete missing.unidades[0].configuracao[group][field];
        assert.equal(validate(missing), false, `${group}.${field} ausente`);

        const nullValue = structuredClone(samples.materializar_parte);
        nullValue.unidades[0].configuracao[group][field] = null;
        assert.equal(validate(nullValue), false, `${group}.${field} nulo`);
      }
    }
  }
});

test("MCP e Actions não expõem modo como decisão duplicada", () => {
  const schemas = [
    COURSE_HUMAN_TASKS.find(({ name }) => name === "materializar_parte").inputSchema,
    actionTools.find(({ name }) => name === "materializar_parte").inputSchema,
    operation("materializar_parte").requestBody.content["application/json"].schema
  ];
  for (const schema of schemas) {
    const application = schema.properties.unidades.items.properties.aplicacaoPedagogica;
    assert.equal(Object.hasOwn(application.properties, "modo"), false);
    assert.equal(application.required.includes("modo"), false);
  }
});

test("MCP e Actions orientam a mobilização do repertório e a criação de prática", () => {
  const schemas = [
    COURSE_HUMAN_TASKS.find(({ name }) => name === "materializar_parte").inputSchema,
    actionTools.find(({ name }) => name === "materializar_parte").inputSchema,
    operation("materializar_parte").requestBody.content["application/json"].schema
  ];
  for (const schema of schemas) {
    const application = schema.properties.unidades.items.properties.aplicacaoPedagogica;
    assert.match(
      String(application.properties.ideiasUtilizadas.description ?? ""),
      /ideias? estabelecidas?.*mobilizadas?/iu
    );
    assert.match(
      String(application.properties.praticas.items.properties.requisito.description ?? ""),
      /texto.*(?:cria|novo).*requisito/iu
    );
  }
});

test("Actions orienta proveniência, componentes locais e formas calibradas no ponto de uso", () => {
  const source = actionTools.find(({ name }) => name === "manter_fonte").inputSchema;
  const verification = source.properties.metadados.properties.verificacao;
  assert.deepEqual(verification.enum, [
    "nao_verificada",
    "confirmada_explicitamente_pela_autoria"
  ]);
  const sourceTask = actionTools.find(({ name }) => name === "manter_fonte");
  assert.match(
    sourceTask.description,
    /conferida.*declaração explícita da autoria/iu
  );
  assert.match(sourceTask.description, /localize.*fornecido ou lido/iu);

  const materialization = actionTools.find(({ name }) =>
    name === "materializar_parte").inputSchema;
  const unit = materialization.properties.unidades.items;
  const instance = unit.properties.conteudo.properties.content.items;
  assert.deepEqual(instance.required, ["id", "package", "version", "data"]);
  const materializationTask = actionTools.find(({ name }) => name === "materializar_parte");
  assert.match(materializationTask.description, /recorte preparado/iu);
  assert.match(materializationTask.description, /marque formas/iu);
  assert.match(
    materializationTask.description,
    /não duplique (?:a )?identificação local.*componentes/iu
  );
  const componentsTask = actionTools.find(({ name }) => name === "consultar_componentes");
  assert.match(componentsTask.description, /inspecionar.*antes do uso/iu);
});

test("Actions não confunde bibliografia fornecida com conferência da fonte", () => {
  const validate = validatorFor("manter_fonte");
  assert.equal(validate({
    curso: "Redes para iniciantes",
    metadados: {
      papel: "tecnica_conceitual",
      titulo: "Computer Networking: A Top-Down Approach",
      autoria: "James Kurose e Keith Ross",
      edicaoOuVersao: "8ª edição"
    }
  }), true);
  assert.equal(validate({
    curso: "Redes para iniciantes",
    metadados: {
      papel: "tecnica_conceitual",
      titulo: "Computer Networking: A Top-Down Approach",
      verificacao: "adotada_pelo_autor"
    }
  }), false);
});

function validatorFor(name) {
  return new Ajv2020({ allErrors: true, strict: false }).compile(
    actionTools.find((task) => task.name === name).inputSchema
  );
}

test("#272 resultado comum é curto e não usa envelope de compatibilidade", () => {
  assert.deepEqual(openApi.components.schemas.HumanTaskResult.required, [
    "result", "deepLink", "nextDecision"
  ]);
  assert.equal(openApi.components.schemas.HumanTaskResult.additionalProperties, undefined);
  assert.equal(Object.hasOwn(openApi.components.schemas, "ConversationProjection"), false);
  assert.equal(Object.hasOwn(openApi.components.schemas, "SuccessResponse"), false);
  const serialized = JSON.stringify(openApi.components.schemas.HumanTaskResult);
  assert.doesNotMatch(serialized, /requestId|courseId|revision|hash|path|resultFacts/iu);
});

test("#272 OAuth, respostas e orçamento permanecem importáveis", () => {
  assert.deepEqual(openApi.security, [{ AraLearnOAuth: ["openid", "email"] }]);
  const flow = openApi.components.securitySchemes.AraLearnOAuth.flows.authorizationCode;
  assert.match(flow.authorizationUrl, /\/oauth\/authorize$/u);
  assert.match(flow.tokenUrl, /\/oauth\/token$/u);
  for (const task of COURSE_HUMAN_TASKS) {
    assert.deepEqual(operation(task.name).responses, {
      "200": { $ref: "#/components/responses/Success" },
      default: { $ref: "#/components/responses/Error" }
    });
  }
  assert.ok(openApiText.length < 40_000, `OpenAPI ocupa ${openApiText.length} caracteres minificados.`);
  assert.ok(JSON.stringify(openApi, null, 2).length < 96_000);
  assert.doesNotMatch(openApiText, /"const"/u);
});

test("#272 golden set cobre prompts diretos, indiretos e negativos", () => {
  assert.equal(golden.format, "aralearn.human-authoring-golden-prompts.v2");
  assert.deepEqual(golden.metadataPolicy.classes, ["direct", "indirect", "negative"]);
  assert.equal(new Set(golden.cases.map(({ id }) => id)).size, golden.cases.length);
  const positive = golden.cases.filter(({ expectedTool }) => expectedTool !== null);
  const negative = golden.cases.filter(({ expectedTool }) => expectedTool === null);
  assert.equal(negative.length, 8);
  for (const task of COURSE_HUMAN_TASKS) {
    assert.equal(positive.filter(({ expectedTool, class: className }) => (
      expectedTool === task.name && className === "direct"
    )).length, 1, `${task.name}: direct`);
    assert.equal(positive.filter(({ expectedTool, class: className }) => (
      expectedTool === task.name && className === "indirect"
    )).length, 1, `${task.name}: indirect`);
  }
  assert.equal(negative.every(({ class: className }) => className === "negative"), true);
});
