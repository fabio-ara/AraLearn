import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  COURSE_HUMAN_TASK_CATALOG_METADATA,
  COURSE_HUMAN_TASKS
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  COURSE_ACTION_TASK_GROUPS,
  courseActionOperationName,
  encodeCourseActionTaskRequest
} from "../../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS,
  COURSE_AUTHORING_GUIDES
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
const expectedActionGroups = {
  acesso_do_curso: ["consultar_acesso", "definir_visibilidade", "alterar_acesso",
    "definir_acesso_arquivos", "definir_politica_revisao"],
  estrutura_curricular: ["alterar_curso", "excluir_curso", "salvar_ramo_curricular",
    "mover_ramo_curricular", "duplicar_ramo_curricular", "remover_ramo_curricular", "reordenar_unidades"],
  desenho_instrucional: ["consultar_repertorio_instrucional", "manter_unidade_analise",
    "manter_requisito_evidencia", "vincular_repertorio_instrucional", "registrar_aplicacoes_instrucionais",
    "aplicar_configuracao_instrucional", "ajustar_orientacao", "ajustar_componentes"],
  preferencias_de_autoria: ["consultar_preferencias_autoria", "salvar_preferencias_autoria"],
  perfis_de_autoria: ["consultar_perfis", "salvar_perfil", "excluir_perfil",
    "prever_aplicacao_perfil", "aplicar_perfil"],
  observacoes_autorais: ["consultar_observacoes", "registrar_observacao", "editar_observacao"]
};
const planningGuidance = COURSE_AUTHORING_GUIDES.planning_design.instructions.join("\n");
const materializationGuidance = COURSE_AUTHORING_GUIDES.materialization.instructions.join("\n");
const knowledgeGuidance = Object.values(COURSE_AUTHORING_GUIDES).flatMap(({ instructions }) => instructions).join("\n");
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
  consultar_preferencias_autoria: {},
  salvar_preferencias_autoria: { foco: "content", cadencia: "microsequence", pontosDeRevisao: ["explanation"] },
  consultar_acesso: { curso: "Redes para iniciantes" },
  definir_visibilidade: { curso: "Redes para iniciantes", visibilidade: "private", arquivos: "restricted", confirmado: true },
  alterar_acesso: { curso: "Redes para iniciantes", pessoa: "colega_fixture", operacao: "conceder", permitirCopia: false, confirmado: true },
  definir_acesso_arquivos: { curso: "Redes para iniciantes", fonte: "Manual do proxy", arquivos: "restricted", confirmado: true },
  definir_politica_revisao: { curso: "Redes para iniciantes", politica: "saved", confirmado: true },
  consultar_repertorio_instrucional: { curso: "Redes para iniciantes", microssequencia: "Sockets" },
  manter_unidade_analise: { curso: "Redes para iniciantes", operacao: "criar", enunciado: "Socket liga processo ao transporte." },
  manter_requisito_evidencia: { curso: "Redes para iniciantes", operacao: "criar", enunciado: "Identificar a porta do serviço no exemplo." },
  vincular_repertorio_instrucional: { curso: "Redes para iniciantes", microssequencia: "Sockets", analise: [1], evidencias: [1] },
  registrar_aplicacoes_instrucionais: { curso: "Redes para iniciantes", microssequencia: "Sockets", unidades: [{
    unidade: 1, modo: "expository", ideiasIntroduzidas: [1], ideiasUtilizadas: [], cobertura: [1],
    explicacoes: [{ ideia: 1, formas: ["plain_definition"] }], praticas: []
  }] },
  aplicar_configuracao_instrucional: { curso: "Redes para iniciantes", microssequencia: "Sockets", unidades: [{
    unidade: 1, calibracao: { parametros: { maximo_ideias_novas_por_unidade: 1 }, motivo: "A unidade introduz apenas a função do socket." }
  }] },
  ajustar_orientacao: { curso: "Redes para iniciantes", licao: "Sockets", orientacao: "Mantenha o mesmo exemplo de processo durante a lição." },
  ajustar_componentes: { curso: "Redes para iniciantes", microssequencia: "Sockets", disponibilidade: "todos", preferidos: ["aralearn.resource.paragraph@1.0.0"] },
  alterar_curso: { curso: "Redes para iniciantes", titulo: "Redes: processos e serviços" },
  excluir_curso: { curso: "Curso sintético para excluir" },
  salvar_ramo_curricular: { curso: "Redes para iniciantes", tipo: "licao", destino: { modulo: "Comunicação" }, titulo: "Portas", objetivo: "Relacionar portas e serviços." },
  mover_ramo_curricular: { curso: "Redes para iniciantes", alvo: { licao: "Portas" }, destino: { modulo: "Comunicação" }, posicao: 2 },
  duplicar_ramo_curricular: { curso: "Redes para iniciantes", alvo: { licao: "Portas" }, titulo: "Portas: retomada" },
  remover_ramo_curricular: { curso: "Redes para iniciantes", alvo: { licao: "Portas: retomada" } },
  reordenar_unidades: { curso: "Redes para iniciantes", alvo: { microssequencia: "Sockets" }, unidades: [2, 1] },
  aprovar_mapa_curricular: { referencia: "referencia-opaca-do-mapa-inspecionado" },
  editar_observacao: { curso: "Redes para iniciantes", observacao: {
    annotationId: "30000000-0000-4000-8000-000000000001", annotationVersion: 2,
    targetKind: "microsequence_explanation", targetId: "micro-sockets"
  }, texto: "Esclarecer a relação entre processo e socket." },
  salvar_explicacoes: { curso: "Redes para iniciantes", explicacoes: [{ microssequencia: "Sockets", conteudo: {
    title: "Processo, socket e transporte", content: SAMPLE_THEORY_CONTENT.content
  }, fontes: [] }] },
  retomar_correcao: { recuperacao: { courseId: "10000000-0000-4000-8000-000000000001",
    requestId: "original-attempt-1", operation: "course_observation_correction" } },
  declarar_revisao: { referencia: "referencia-opaca-da-base-inspecionada", declaracao: "revisado" },
  copiar_curso: { curso: "Redes para iniciantes", titulo: "Minha cópia" },
  comparar_cursos: { esquerda: { curso: "Redes para iniciantes" }, direita: { curso: "Minha cópia" } },
  exportar_autoria: { recorte: { curso: "Redes para iniciantes" } },
  guardar_audio: { curso: "Fonética", [HUMAN_ACTION_FILE_FIELD]: ["file-reference"] },
  consultar_audios: { curso: "Fonética", pagina: 1 },
  consultar_perfis: {},
  salvar_perfil: { nome: "Exposição e prática", automaticos: ["distribuicao_da_pratica"] },
  excluir_perfil: { perfil: "Exposição e prática" },
  prever_aplicacao_perfil: { curso: "Redes para iniciantes", perfil: "Exposição e prática" },
  aplicar_perfil: { curso: "Redes para iniciantes", perfil: "Exposição e prática", previa: "a".repeat(64) },
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
          explicacao: { proposito: "Relacionar processo, socket e transporte.",
            pressupostos: ["Processos executam programas."], relacoes: ["Socket liga processo e transporte."], fontesPrevistas: [] },
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
    explicacoes: [{ microssequencia: "Sockets", conteudo: {
      title: "Processo, socket e transporte", content: SAMPLE_THEORY_CONTENT.content
    }, fontes: [] }],
    unidades: [{
      microssequencia: "Sockets",
      posicao: 1,
      conteudo: SAMPLE_THEORY_CONTENT,
      configuracao: {
    motivo: "Escolha contextual sintética deste teste.",
        parametros: {
          maximo_ideias_novas_por_unidade: 1,
          formas_de_explicacao: ["plain_definition"],
          oportunidades_distintas_por_requisito: 1,
          dimensoes_de_variacao_da_pratica: ["case_or_data"],
          alvo_palavras_conversa: 90,
          alvo_palavras_unidade: 180
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
    parametros: { maximo_ideias_novas_por_unidade: 1 }
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
      papeisSugeridos: ["tecnica_conceitual"],
      titulo: "Manual do proxy"
    }
  },
  incorporar_pdf_como_fonte: {
    curso: "Redes para iniciantes",
    titulo: "Manual do proxy",
    papeisSugeridos: ["tecnica_conceitual"],
    intencao: "Manter o PDF como referência técnica do Curso.",
    [HUMAN_ACTION_FILE_FIELD]: ["file-reference"]
  }
};

function resolveReferences(value) {
  if (Array.isArray(value)) return value.map(resolveReferences);
  if (!value || typeof value !== "object") return value;
  if (value.$ref) {
    assert.ok(value.$ref.startsWith("#/components/"), value.$ref);
    const target = value.$ref.slice(2).split("/").reduce((object, key) => object[key], openApi);
    assert.ok(target, value.$ref);
    const rest = { ...value };
    delete rest.$ref;
    return { ...resolveReferences(target), ...resolveReferences(rest) };
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveReferences(entry)]));
}

function operation(name) {
  return resolveReferences(openApi.paths[`/${courseActionOperationName(name)}`]?.post);
}

function taskVariant(name) {
  return operation(name).requestBody.content["application/json"].schema.oneOf
    ?.find(({ properties }) => properties?.tarefa?.enum?.[0] === name);
}

function taskInputSchema(name) {
  return taskVariant(name)?.properties.argumentos ??
    operation(name).requestBody.content["application/json"].schema;
}

function constraints(value) {
  if (Array.isArray(value)) return value.map(constraints);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "description")
    .map(([key, entry]) => [key, constraints(entry)]));
}

function visit(value, callback, path = "$") {
  if (!value || typeof value !== "object") return;
  callback(value, path);
  if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, callback, `${path}[${index}]`));
  else Object.entries(value).forEach(([key, entry]) => visit(entry, callback, `${path}.${key}`));
}

test("#357 OpenAPI preserva 54 tarefas em seis grupos e 24 operações diretas", () => {
  assert.deepEqual(COURSE_ACTION_TASK_GROUPS, expectedActionGroups);
  const groupedNames = Object.values(expectedActionGroups).flat();
  const directNames = COURSE_HUMAN_TASKS.map(({ name }) => name)
    .filter(name => !groupedNames.includes(name));
  assert.equal(COURSE_HUMAN_TASKS.length, 54);
  assert.equal(Object.keys(expectedActionGroups).length, 6);
  assert.equal(groupedNames.length, 30);
  assert.equal(new Set(groupedNames).size, 30);
  assert.equal(directNames.length, 24);
  assert.equal(Object.keys(openApi.paths).length, 30);
  assert.deepEqual(Object.keys(openApi.paths).sort(),
    [...Object.keys(expectedActionGroups), ...directNames].map(name => `/${name}`).sort());
  for (const [name, tasks] of Object.entries(expectedActionGroups)) {
    const schema = resolveReferences(openApi.paths[`/${name}`].post)
      .requestBody.content["application/json"].schema;
    assert.equal(schema.type, "object", name);
    assert.equal(schema.additionalProperties, false, name);
    assert.deepEqual([...schema.required].sort(), ["argumentos", "tarefa"], name);
    assert.deepEqual(Object.keys(schema.properties).sort(), ["argumentos", "tarefa"], name);
    assert.deepEqual(schema.properties.tarefa.enum, tasks, name);
    assert.equal(schema.oneOf.length, tasks.length, name);
    assert.deepEqual(schema.oneOf.map(branch => branch.properties.tarefa.enum), tasks.map(task => [task]), name);
    for (const branch of schema.oneOf) {
      assert.equal(branch.type, "object", name);
      assert.deepEqual(Object.keys(branch.properties).sort(), ["argumentos", "tarefa"], name);
      assert.equal(branch.properties.tarefa.type, "string", name);
    }
    for (const task of tasks) assert.equal(courseActionOperationName(task), name, task);
  }
  for (const task of directNames) assert.equal(courseActionOperationName(task), task, task);
  for (const [path, { post }] of Object.entries(openApi.paths)) {
    assert.equal(post.operationId, path.slice(1));
  }
  assert.equal(openApi.info["x-aralearn-task-catalog"], COURSE_HUMAN_TASK_CATALOG_METADATA.id);
  assert.equal(
    openApi.info["x-aralearn-task-catalog-version"],
    COURSE_HUMAN_TASK_CATALOG_METADATA.version
  );
  assert.equal(COURSE_HUMAN_TASK_CATALOG_METADATA.version, "4.0.0");
  assert.equal(
    openApi.info["x-aralearn-task-catalog-fingerprint"],
    COURSE_HUMAN_TASK_CATALOG_METADATA.hash
  );
  assert.doesNotMatch(COURSE_HUMAN_TASK_CATALOG_METADATA.hash, /pending/iu);
});

test("#272 metadata segue quando usar, desambiguação e hints pelo efeito real", () => {
  for (const task of COURSE_HUMAN_TASKS) {
    assert.equal(typeof task.description, "string", task.name);
    assert.ok(task.description.trim().length > 0 && task.description.length <= 300, task.name);
    assert.equal(task.annotations.openWorldHint, false, task.name);
    assert.equal(
      task.annotations.destructiveHint,
      ["manter_fonte", "excluir_perfil", "excluir_curso", "remover_ramo_curricular"].includes(task.name),
      task.name
    );
    assert.equal(typeof task.annotations.readOnlyHint, "boolean", task.name);
    const action = operation(task.name);
    assert.equal(taskVariant(task.name)?.description ?? action.description, task.description);
    const group = expectedActionGroups[courseActionOperationName(task.name)] ?? [task.name];
    const consequential = COURSE_HUMAN_TASKS.some(candidate =>
      group.includes(candidate.name) && candidate.annotations.readOnlyHint !== true);
    assert.equal(action["x-openai-isConsequential"], consequential, task.name);
  }
});

test("#272 argumentos humanos são documentados e não recebem controles internos", () => {
  const forbidden = /^(?:id|ids|courseId|revision|version|hash|path|requestId|expectedRevision|expectedPlanVersion|cursor)$/iu;
  for (const task of actionTools) {
    const schema = task.inputSchema;
    for (const [name, property] of Object.entries(schema.properties || {})) {
      if (name === HUMAN_ACTION_FILE_FIELD) continue;
      assert.doesNotMatch(name, forbidden, `${task.name}.${name}`);
      assert.equal(typeof property.description, "string", `${task.name}.${name} sem descrição`);
      assert.ok(property.description.trim().length > 0, `${task.name}.${name} descrição vazia`);
      assert.ok(property.description.length <= 700, `${task.name}.${name} descrição extensa`);
    }
    visit(schema, (entry, path) => {
      for (const name of Object.keys(entry.properties || {})) {
        if (name === "file_id") continue;
        const localComponentIdentity = ["id", "version"].includes(name) &&
          /\.properties\.conteudo\.properties\.(?:content\.items|response\.anyOf\[1\]|feedback\.items)$/u
            .test(path);
        if (localComponentIdentity) continue;
        if (task.name === "retomar_correcao" && path === "$.properties.recuperacao" &&
            ["courseId", "requestId"].includes(name)) continue;
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
  assert.match(operation("salvar_mapa_curricular").requestBody.content["application/json"].schema.properties.modulos.description,
    /Árvore completa.*iniciar contexto e escopo.*salvar_ramo_curricular/iu);
  assert.match(openApi.info.description, /aprove só a referência do mapa salvo visto e aprovado pela pessoa/iu);
  assert.match(openApi.info.description, /Parte é lote operacional/iu);
  assert.match(planningGuidance, /Mandato delimita escopo, lotes e restrições autorizados/iu);
  assert.match(planningGuidance, /continuidade autorizada, avance até o limite ou uma decisão material/iu);
  assert.match(openApi.info.description, /respeite confirmações do cliente/iu);
  assert.match(
    knowledgeGuidance,
    /falhas mecânicas recuperáveis silenciosamente.*bloqueio persistente exige informar seu impacto.*condição de retomada.*próximo passo executável.*não o apresente como sucesso/iu
  );
  assert.match(knowledgeGuidance, /pessoa autora.*público/iu);
  assert.match(knowledgeGuidance, /curso, parte, explicação, fonte e unidade em minúsculas/iu);
  assert.match(knowledgeGuidance, /mapa mostra conteúdo.*em vez de contagens/iu);
  assert.match(
    openApi.info.description,
    /link exato em Markdown/iu
  );
  assert.doesNotMatch(
    openApi.info.description,
    /aprovada?,?\s+materialize|produza (?:agora|o conteúdo aprovado)|no chat, só/iu
  );
  assert.match(
    operation("salvar_mapa_curricular").description,
    /rascunho.*modulos: \[\].*salvar_ramo_curricular.*aprovação usa a referência persistida/iu
  );
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
    /em automático, escolha valor e motivo/iu
  );
  assert.match(planningGuidance, /em automático, escolha valores e motivos conforme assunto e planejamento/iu);
  assert.match(
    openApi.info.description,
    /Preserve fixações da autoria e pesquisa/iu
  );
  assert.match(
    openApi.info.description,
    /devolva resultado breve[\s\S]*link[\s\S]*próxima etapa/iu
  );
  assert.match(
    materializationGuidance,
    /calibre cada unidade nova no próprio pedido de materialização.*sem etapa persistente separada nem narração no chat/iu
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

test("todos os inputs importáveis aceitam exemplos humanos e recusam mecânica", () => {
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

test("Actions vincula cada tarefa agrupada a seus argumentos e conserva chamadas diretas", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  assert.deepEqual(Object.keys(samples).sort(), actionTools.map(({ name }) => name).sort());
  for (const task of actionTools) {
    const encoded = encodeCourseActionTaskRequest(task.name, samples[task.name]);
    const operationName = courseActionOperationName(task.name);
    const schema = operation(task.name).requestBody.content["application/json"].schema;
    const validate = ajv.compile(schema);
    assert.equal(encoded.operationName, operationName, task.name);
    assert.equal(validate(encoded.arguments), true, `${task.name}: ${JSON.stringify(validate.errors)}`);
    if (expectedActionGroups[operationName]) {
      assert.deepEqual(encoded.arguments, { tarefa: task.name, argumentos: samples[task.name] });
      for (const invalid of [
        { ...encoded.arguments, tarefa: "tarefa_inexistente" },
        { ...encoded.arguments, argumentos: { ...samples[task.name], requestId: "technical-request" } },
        { ...encoded.arguments, requestId: "technical-request" },
        { tarefa: task.name },
        { argumentos: samples[task.name] }
      ]) assert.equal(validate(invalid), false, `${task.name}: ${JSON.stringify(invalid)}`);
      const variantValidators = schema.oneOf.map(variant => ajv.compile(variant));
      assert.deepEqual(variantValidators.map(validator => validator(encoded.arguments)),
        expectedActionGroups[operationName].map(name => name === task.name), task.name);
    } else {
      assert.deepEqual(encoded.arguments, samples[task.name], task.name);
      assert.equal(validate({ tarefa: task.name, argumentos: samples[task.name] }), false, task.name);
    }
  }
  const access = ajv.compile(operation("definir_visibilidade").requestBody.content["application/json"].schema);
  assert.equal(access({ tarefa: "definir_visibilidade", argumentos: samples.alterar_acesso }), false,
    "O discriminador de visibilidade não admite o schema de concessão de acesso.");
  assert.equal(access({ tarefa: "alterar_acesso", argumentos: samples.definir_visibilidade }), false,
    "O discriminador de concessão não admite o schema de visibilidade.");
  const preferences = ajv.compile(operation("consultar_preferencias_autoria")
    .requestBody.content["application/json"].schema);
  assert.equal(preferences({ tarefa: "consultar_preferencias_autoria",
    argumentos: samples.salvar_preferencias_autoria }), false,
  "Uma consulta não aceita os argumentos da escrita disponível no mesmo grupo.");
  assert.equal(access({ tarefa: "definir_acesso_arquivos", argumentos: {
    ...samples.definir_acesso_arquivos, arquivos: "inherit" } }), true);
  assert.equal(access({ tarefa: "definir_visibilidade", argumentos: {
    ...samples.definir_visibilidade, arquivos: "inherit" } }), false,
  "A união visível de arquivos não amplia o enum da tarefa de visibilidade.");
  const design = ajv.compile(operation("consultar_repertorio_instrucional")
    .requestBody.content["application/json"].schema);
  assert.equal(design({ tarefa: "consultar_repertorio_instrucional", argumentos: {} }), false);
  for (const [task, other] of [["registrar_aplicacoes_instrucionais", "aplicar_configuracao_instrucional"],
    ["aplicar_configuracao_instrucional", "registrar_aplicacoes_instrucionais"]]) {
    assert.equal(design({ tarefa: task, argumentos: samples[other] }), false,
      "A união visível de unidades não troca aplicação por configuração.");
  }
});

test("Actions expõe argumentos tipados nas properties sem depender da descoberta de oneOf", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const [group, taskNames] of Object.entries(expectedActionGroups)) {
    const schema = openApi.paths[`/${group}`].post.requestBody.content["application/json"].schema;
    const visible = schema.properties.argumentos;
    assert.equal(visible.type, "object", group);
    assert.equal(visible.additionalProperties, false, group);
    assert.ok(visible.properties && Object.keys(visible.properties).length > 0, group);
    const fields = [...new Set(taskNames.flatMap(name => Object.keys(
      actionTools.find(task => task.name === name).inputSchema.properties)))].sort();
    assert.deepEqual(Object.keys(visible.properties).sort(), fields, group);
    const validate = ajv.compile(resolveReferences(visible));
    for (const taskName of taskNames) {
      assert.equal(validate(samples[taskName]), true, `${taskName}: ${JSON.stringify(validate.errors)}`);
      assert.equal(validate({ ...samples[taskName], sql: "SELECT 1" }), false, taskName);
    }
    if (fields.includes("curso")) assert.equal(validate({ curso: [] }), false, group);
  }
  const profiles = ajv.compile(operation("consultar_perfis").requestBody.content["application/json"].schema);
  assert.equal(profiles({ tarefa: "consultar_perfis", argumentos: {} }), true);
  for (const argumentos of [null, [], { curso: "Redes para iniciantes" }]) {
    assert.equal(profiles({ tarefa: "consultar_perfis", argumentos }), false);
  }
  assert.equal(profiles({ tarefa: "consultar_perfis" }), false);
});

test("Actions conserva as duas ingestões de arquivo como operações diretas", () => {
  const fileTasks = COURSE_HUMAN_TASKS.filter(task => task._meta?.["openai/fileParams"]);
  assert.deepEqual(fileTasks.map(({ name }) => name).sort(), ["guardar_audio", "incorporar_pdf_como_fonte"]);
  for (const task of fileTasks) {
    assert.equal(courseActionOperationName(task.name), task.name, task.name);
    const action = operation(task.name);
    const schema = action.requestBody.content["application/json"].schema;
    assert.equal(Object.hasOwn(schema.properties, "tarefa"), false, task.name);
    assert.equal(schema.additionalProperties, false, task.name);
    assert.ok(schema.required.includes(HUMAN_ACTION_FILE_FIELD), task.name);
    assert.equal(schema.properties[HUMAN_ACTION_FILE_FIELD].maxItems, 1, task.name);
    assert.equal(Object.hasOwn(schema.properties, "argumentos"), false, task.name);
    assert.equal(Object.hasOwn(schema.properties, task._meta["openai/fileParams"][0]), false, task.name);
    assert.equal(action["x-openai-isConsequential"], true, task.name);
  }
});

test("Actions publica a calibração completa das unidades novas sem campo aberto", () => {
  const schemas = [
    actionTools.find(({ name }) => name === "materializar_parte").inputSchema,
    operation("materializar_parte").requestBody.content["application/json"].schema
  ].map((schema) => schema.properties.unidades.items.properties.configuracao);
  for (const schema of schemas) {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(Object.keys(schema.properties.parametros.properties).sort(),
      COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ humanField }) => humanField).sort());
    assert.deepEqual(
      schema.properties.parametros.properties.formas_de_explicacao.items.enum,
      [
        "plain_definition", "concrete_example", "mechanism", "contrast",
        "application_condition", "limit_or_exception", "worked_example",
        "representation_link"
      ]
    );
    assert.deepEqual(
      schema.properties.parametros.properties
        .dimensoes_de_variacao_da_pratica.items.enum,
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
  const expectedFields = COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ humanField }) => humanField).sort();

  for (const schema of schemas) {
    const unit = schema.properties.unidades.items;
    const configuration = unit.properties.configuracao;
    const parameters = configuration.properties.parametros;

    assert.ok(unit.required.includes("configuracao"));
    assert.deepEqual(
      [...(configuration.required ?? [])].sort(),
      ["motivo", "parametros"]
    );
    assert.deepEqual(Object.keys(parameters.properties).sort(), expectedFields);
    assert.equal(parameters.minProperties, 1);
    for (const property of Object.values(parameters.properties)) {
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
    for (const group of ["parametros"]) {
      const fields = Object.keys(configuration.properties[group].properties);
      for (const field of fields) {
        const missing = structuredClone(samples.materializar_parte);
        delete missing.unidades[0].configuracao.motivo;
        assert.equal(validate(missing), false, "Toda escolha contextual requer motivo.");

        const nullValue = structuredClone(samples.materializar_parte);
        nullValue.unidades[0].configuracao[group][field] = null;
        assert.equal(validate(nullValue), false, `${group}.${field} nulo`);
      }
    }
  }
});

test("MCP e Actions conservam proposta e base completa, permitem reutilizar a base salva e não fabricam revisão", () => {
  for (const tools of [COURSE_HUMAN_TASKS, actionTools]) {
    const materialize = new Ajv2020({ allErrors: true, strict: false }).compile(
      tools.find(({ name }) => name === "materializar_parte").inputSchema);
    const map = new Ajv2020({ allErrors: true, strict: false }).compile(
      tools.find(({ name }) => name === "salvar_mapa_curricular").inputSchema);
    const input = structuredClone(samples.materializar_parte);
    const before = structuredClone(input.explicacoes);
    assert.equal(materialize(input), true, JSON.stringify(materialize.errors));
    assert.deepEqual(input.explicacoes, before);
    assert.equal(input.explicacoes.length, 1);
    assert.equal(Object.hasOwn(input.unidades[0], "explicacao"), false);
    delete input.explicacoes;
    assert.equal(materialize(input), true, "A materialização pode reutilizar a base já salva sem reenviá-la.");
    assert.equal(materialize({ ...input, explicacoes: [] }), false,
      "Uma alteração da base precisa conter ao menos uma Explicação completa.");
    const noContent = structuredClone(samples.materializar_parte);
    noContent.explicacoes[0].conteudo.content = [];
    assert.equal(materialize(noContent), false, "Apoio vazio não é produção completa.");
    const forged = structuredClone(samples.materializar_parte);
    forged.explicacoes[0].conteudo.contentReview = { state: "current" };
    assert.equal(materialize(forged), false, "Conteúdo não pode conceder revisão humana.");
    const planned = structuredClone(samples.salvar_mapa_curricular);
    assert.equal(map(planned), true, JSON.stringify(map.errors));
    const proposal = planned.modulos[0].licoes[0].microssequencias[0].explicacao;
    assert.deepEqual(proposal, samples.salvar_mapa_curricular.modulos[0].licoes[0].microssequencias[0].explicacao);
    delete planned.modulos[0].licoes[0].microssequencias[0].explicacao;
    assert.equal(map(planned), false, "A proposta deve existir já no mapa.");
  }
});

test("aprovação usa a referência inspecionada e recuperação conserva integralmente a tentativa recebida", () => {
  for (const tools of [COURSE_HUMAN_TASKS, actionTools]) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const approve = ajv.compile(tools.find(({ name }) => name === "aprovar_mapa_curricular").inputSchema);
    assert.equal(approve(samples.aprovar_mapa_curricular), true);
    assert.equal(approve(samples.salvar_mapa_curricular), false, "aprovar não recebe uma árvore regenerada");
    assert.equal(approve({ ...samples.aprovar_mapa_curricular, aprovado: true }), false);
    const saveMap = ajv.compile(tools.find(({ name }) => name === "salvar_mapa_curricular").inputSchema);
    assert.equal(saveMap({ ...samples.salvar_mapa_curricular, modulos: [] }), true,
      "o canal permite iniciar contexto e escopo antes da construção por ramos");
    assert.equal(saveMap({ ...samples.salvar_mapa_curricular, aprovado: true }), false,
      "salvar conteúdo do mapa não declara sua aprovação");
    const resume = ajv.compile(tools.find(({ name }) => name === "retomar_correcao").inputSchema);
    assert.equal(resume(samples.retomar_correcao), true);
    assert.equal(resume({ curso: "Redes para iniciantes", tentativa: "original-attempt-1" }), true);
    for (const invalid of [
      { ...samples.retomar_correcao, curso: "Outro curso" },
      { ...samples.retomar_correcao, tentativa: "new-attempt-2" },
      { recuperacao: { ...samples.retomar_correcao.recuperacao, operation: "course_write" } },
      { recuperacao: { ...samples.retomar_correcao.recuperacao, requestId: "short" } },
      { recuperacao: { ...samples.retomar_correcao.recuperacao, texto: "conteúdo para reaplicar" } },
      { requestId: samples.retomar_correcao.recuperacao.requestId },
      { curso: "Redes para iniciantes" }
    ]) assert.equal(resume(invalid), false, JSON.stringify(invalid));
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
  assert.match(materializationGuidance, /declare na aplicação da unidade as formas explicativas efetivamente realizadas/iu);
  assert.match(materializationGuidance, /justifique as não aplicáveis/iu);
  assert.match(
    knowledgeGuidance,
    /identidades locais únicas/iu
  );
  const componentsTask = actionTools.find(({ name }) => name === "consultar_componentes");
  assert.match(componentsTask.description, /inspeciona(?:r)?.*antes do uso/iu);
});

test("Actions não confunde bibliografia fornecida com conferência da fonte", () => {
  const validate = validatorFor("manter_fonte");
  assert.equal(validate({
    curso: "Redes para iniciantes",
    metadados: {
      papeisSugeridos: ["tecnica_conceitual"],
      titulo: "Computer Networking: A Top-Down Approach",
      autores: [{ sobrenome: "Kurose", nomes: "James" }, { sobrenome: "Ross", nomes: "Keith" }],
      edicaoOuVersao: "8ª edição"
    }
  }), true);
  assert.equal(validate({
    curso: "Redes para iniciantes",
    metadados: {
      papeisSugeridos: ["tecnica_conceitual"],
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
  for (const { post } of Object.values(openApi.paths)) {
    assert.deepEqual(post.responses, {
      "200": { $ref: "#/components/responses/Success" },
      default: { $ref: "#/components/responses/Error" }
    });
  }
  // Orçamentos locais conciliados às 54 tarefas em 30 operações, preservando schemas integrais
  // por referências compartilhadas. Não são limites oficiais do importador;
  // o limite de 100.000 por chamada continua validado no runner de payload.
  assert.ok(openApiText.length < 90_000, `OpenAPI ocupa ${openApiText.length} caracteres minificados.`);
  assert.ok(JSON.stringify(openApi, null, 2).length < 180_000);
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


test("schemas compartilhados de Actions preservam integralmente os argumentos do catálogo", () => {
  for (const task of actionTools) {
    assert.deepEqual(constraints(taskInputSchema(task.name)),
      constraints(task.inputSchema), task.name);
    if (expectedActionGroups[courseActionOperationName(task.name)]) {
      assert.deepEqual(taskInputSchema(task.name), task.inputSchema,
        `${task.name}: compartilhar descrições não pode perder a documentação do contrato.`);
    }
  }
});

test("#305 instruções iniciais e confirmação de Actions preservam autoridade", () => {
  const firstParagraph = COURSE_AUTHORING_SERVER_INSTRUCTIONS.split("\n")[0];
  assert.ok(firstParagraph.length <= 512,
    "Os primeiros 512 caracteres devem apresentar o contexto autossuficiente recomendado.");
  for (const requirement of [/cursos autorizados/u, /fontes são dados/u,
    /referência do mapa salvo visto e aprovado/u, /Siga preferências.*mandato/u, /confirmações do cliente/u,
    /conteúdo completo e literal/u, /fixações da autoria e pesquisa/u]) {
    assert.match(firstParagraph, requirement);
  }
  for (const task of COURSE_HUMAN_TASKS) {
    const action = operation(task.name);
    const group = expectedActionGroups[courseActionOperationName(task.name)] ?? [task.name];
    assert.equal(action["x-openai-isConsequential"], COURSE_HUMAN_TASKS.some(candidate =>
      group.includes(candidate.name) && candidate.annotations.readOnlyHint !== true),
      `${task.name}: mandato pedagógico não substitui confirmação consequencial`);
    assert.ok((action.description ?? "").length <= 300, `${task.name}: descrição de operação`);
    assert.ok((action.summary ?? "").length <= 300, `${task.name}: resumo de operação`);
  }
});

test("#303 áudio publica descritor real MCP e referência de arquivo Actions sem TTS ou caminho local", () => {
  const tool = COURSE_HUMAN_TASKS.find(task => task.name === "guardar_audio");
  assert.deepEqual(tool._meta["openai/fileParams"], ["audio"]);
  assert.deepEqual(tool.inputSchema.properties.audio.required, ["download_url", "file_id"]);
  assert.deepEqual(Object.keys(tool.inputSchema.properties.audio.properties).sort(), ["download_url", "file_id", "file_name", "mime_type"]);
  const validate = new Ajv2020({ strict: false }).compile(tool.inputSchema);
  const valid = { curso: "Fonética", audio: { download_url: "https://files.oaiusercontent.com/audio", file_id: "file-fixture", mime_type: "audio/wav" } };
  assert.equal(validate(valid), true);
  for (const invalid of [
    { ...valid, audio: "C:/audio.wav" }, { ...valid, audio: { file_id: "file-fixture" } },
    { ...valid, audio: { ...valid.audio, mime_type: "application/pdf" } },
    { ...valid, textoParaSintetizar: "não autorizado" }, { ...valid, apiKey: "não aceito" }
  ]) assert.equal(validate(invalid), false);
  const projected = operation("guardar_audio").requestBody.content["application/json"].schema;
  assert.equal(Object.hasOwn(projected.properties, "audio"), false);
  assert.deepEqual(projected.properties.openaiFileIdRefs.items, { type: "string" });
  assert.equal(projected.properties.openaiFileIdRefs.maxItems, 1);
  assert.match(projected.properties.openaiFileIdRefs.description, /WAV PCM.*MP3/u);
});

test('#302 Actions e MCP validam fontes estruturadas, papéis do vínculo e trecho sem status inventado',()=>{
  const sample={curso:'Redes para iniciantes',estilo:'abnt-2025',fonte:1,
    metadados:{titulo:null,tipo:'internal_document',modoCitacao:'gerada',autores:[{literal:'Instituição'}],
      papeisSugeridos:['leitura_complementar'],bibliografia:{doi:'10.1000/exemplo',dataDeAcesso:'2026-09-05'}},
    ancoras:[{seletor:{tipo:'paginas',paginaInicial:1,paginaFinal:2},hashDoPdf:'a'.repeat(64)}],
    vinculos:[{unidade:1,vinculo:2,relacao:'quoted_from',papeis:['tecnica_conceitual'],ancoras:[1],
      ocorrencias:[{lugar:'conteudo',recurso:1,folha:'text',trecho:'Trecho literal'}]}]};
  const schemas=[COURSE_HUMAN_TASKS.find(task=>task.name==='manter_fonte').inputSchema,
    operation('manter_fonte').requestBody.content['application/json'].schema];
  for(const schema of schemas){
    const validate=new Ajv2020({strict:false}).compile(schema);
    assert.equal(validate(sample),true,JSON.stringify(validate.errors));
    const noRoles=structuredClone(sample);delete noRoles.vinculos[0].papeis;
    assert.equal(validate(noRoles),false);
    const inferredStatus=structuredClone(sample);inferredStatus.vinculos[0].ocorrencias[0].status='resolved';
    assert.equal(validate(inferredStatus),false);
    const legacy=structuredClone(sample);legacy.metadados.autoria='Nome não decomposto';
    assert.equal(validate(legacy),false);
  }
});
