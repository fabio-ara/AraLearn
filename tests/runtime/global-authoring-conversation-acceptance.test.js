import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  COURSE_HUMAN_TASKS
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  projectHumanAuthoringTasksForActions
} from "../../scripts/projectHumanAuthoringActions.mjs";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/global-authoring-conversation.v1.json",
  import.meta.url
), "utf8"));
const openApi = JSON.parse(await fs.readFile(new URL(
  "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
  import.meta.url
), "utf8"));
const actionTools = projectHumanAuthoringTasksForActions(COURSE_HUMAN_TASKS);

function taskFrom(tools, name) {
  return tools.find((candidate) => candidate.name === name) || null;
}

function validate(tools, name, value) {
  const selected = taskFrom(tools, name);
  assert.ok(selected, `A tarefa humana ${name} precisa existir.`);
  const validator = new Ajv2020({ allErrors: true, strict: false })
    .compile(selected.inputSchema);
  assert.equal(validator(value), true, `${name}: ${JSON.stringify(validator.errors)}`);
}

function flattenMicrosequences(map) {
  return map.modules.flatMap((module, moduleIndex) =>
    module.lessons.flatMap((lesson, lessonIndex) =>
      lesson.microsequences.map((microsequence, microsequenceIndex) => ({
        ...microsequence,
        moduleTitle: module.title,
        lessonTitle: lesson.title,
        order: [moduleIndex, lessonIndex, microsequenceIndex]
      }))
    )
  );
}

function compareOrder(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

function collectKeys(value, result = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, result));
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    result.push(key);
    collectKeys(child, result);
  }
  return result;
}

function assertCompleteCurricularMap(map) {
  assert.equal(map.kind, "mapa_curricular");
  assert.ok(map.modules.length >= 4);
  const microsequences = flattenMicrosequences(map);
  assert.ok(microsequences.length >= fixture.scopeItems.length);

  const positions = new Map();
  for (const item of microsequences) {
    assert.ok(item.moduleTitle.length > 0);
    assert.ok(item.lessonTitle.length > 0);
    assert.ok(item.title.length > 0);
    assert.ok(item.objective.length > 0);
    assert.ok(Array.isArray(item.dependsOn));
    assert.ok(Array.isArray(item.covers) && item.covers.length > 0);
    assert.equal(positions.has(item.title), false, `Microssequência duplicada: ${item.title}`);
    positions.set(item.title, item.order);
  }

  for (const item of microsequences) {
    for (const dependency of item.dependsOn) {
      assert.ok(positions.has(dependency), `Dependência ausente: ${dependency}`);
      assert.ok(
        compareOrder(positions.get(dependency), item.order) < 0,
        `${dependency} precisa anteceder ${item.title}`
      );
    }
    for (const scopeItem of item.covers) {
      assert.ok(fixture.scopeItems.includes(scopeItem), `Item de escopo desconhecido: ${scopeItem}`);
    }
  }
  return microsequences;
}

function mapArguments(artifactId, approved) {
  const artifact = fixture.artifacts[artifactId];
  return {
    curso: fixture.course.title,
    aprovado: approved,
    publico: fixture.course.audience,
    preRequisitos: fixture.course.prerequisites,
    itensDeEscopo: fixture.scopeItems,
    modulos: artifact.modules.map((module) => ({
      titulo: module.title,
      objetivo: module.objective,
      licoes: module.lessons.map((lesson) => ({
        titulo: lesson.title,
        objetivo: lesson.objective,
        microssequencias: lesson.microsequences.map((microsequence) => ({
          titulo: microsequence.title,
          objetivo: microsequence.objective,
          dependencias: microsequence.dependsOn,
          cobertura: microsequence.covers
        }))
      }))
    }))
  };
}

function partArguments(artifactId) {
  const artifact = fixture.artifacts[artifactId];
  return {
    curso: fixture.course.title,
    titulo: artifact.title,
    intencao: artifact.intent,
    microssequencias: artifact.microsequences,
    progressao: artifact.progression
  };
}

test("o mapa global aprovado é curricular, completo e cobre a ementa", () => {
  assert.equal(fixture.format, "aralearn.global-authoring-conversation-eval.v1");
  const initial = fixture.artifacts["mapa-global-v1"];
  const approved = fixture.artifacts["mapa-global-v2"];
  const initialMicrosequences = assertCompleteCurricularMap(initial);
  const approvedMicrosequences = assertCompleteCurricularMap(approved);

  const initialCoverage = new Set(initialMicrosequences.flatMap(({ covers }) => covers));
  const approvedCoverage = new Set(approvedMicrosequences.flatMap(({ covers }) => covers));
  assert.equal(initialCoverage.has("diagnóstico básico do percurso de uma requisição"), false);
  assert.deepEqual([...approvedCoverage].sort(), [...fixture.scopeItems].sort());

  const initialOrder = new Map(initialMicrosequences.map(({ title, order }) => [title, order]));
  const approvedOrder = new Map(approvedMicrosequences.map(({ title, order }) => [title, order]));
  assert.ok(compareOrder(
    initialOrder.get("LAN, WAN e WLAN"),
    initialOrder.get("Quadro Ethernet, endereço MAC e porta do switch")
  ) > 0);
  assert.ok(compareOrder(
    approvedOrder.get("LAN, WAN e WLAN"),
    approvedOrder.get("Quadro Ethernet, endereço MAC e porta do switch")
  ) < 0);

  const curricularKeys = collectKeys(approved);
  assert.equal(curricularKeys.includes("parte"), false);
  assert.equal(curricularKeys.includes("partes"), false);
  assert.equal(curricularKeys.includes("authoringParts"), false);
});

test("a jornada progride de proposta inspecionável a aprovação e só então cria lotes", () => {
  assert.deepEqual(
    fixture.journeySteps.map(({ step }) => step),
    Array.from({ length: 15 }, (_, index) => index + 1)
  );

  for (const { evidence } of fixture.journeySteps) {
    const [kind, reference, occurrence] = evidence.split(":");
    if (kind === "turn") {
      assert.ok(fixture.conversation.some(({ turn }) => turn === Number(reference)));
    } else if (kind === "inspection") {
      assert.ok(fixture.contentInspections[reference]);
    } else if (kind === "repertoire") {
      assert.ok(fixture.repertoires[reference]);
    } else if (kind === "tool") {
      assert.ok(fixture.toolTrace.some(({ task, part }) =>
        task === reference && part === Number(occurrence)));
    } else {
      assert.fail(`Evidência desconhecida: ${evidence}`);
    }
  }

  const proposedMap = fixture.toolTrace.find(({ resultingState }) =>
    resultingState === "mapa_global_ajustado");
  const approvedMap = fixture.toolTrace.find(({ resultingState }) =>
    resultingState === "mapa_global_aprovado");
  assert.equal(proposedMap.artifact, "mapa-global-v2");
  assert.equal(approvedMap.artifact, proposedMap.artifact);
  assert.equal(proposedMap.approved, false);
  assert.equal(approvedMap.approved, true);

  const mapApprovalIndex = fixture.toolTrace.indexOf(approvedMap);
  const firstPartIndex = fixture.toolTrace.findIndex(({ task }) => task === "salvar_parte");
  const firstMaterializationIndex = fixture.toolTrace.findIndex(({ task }) =>
    task === "materializar_parte");
  assert.ok(firstPartIndex > mapApprovalIndex);
  assert.ok(firstMaterializationIndex > firstPartIndex);

  const materializedStateIndex = fixture.persistedStates.findIndex(({ id }) =>
    id === "parte_1_materializada");
  assert.ok(materializedStateIndex > 0);
  for (const state of fixture.persistedStates.slice(0, materializedStateIndex)) {
    assert.equal(state.studyUnitCount, 0, `${state.id} não pode conter unidade de estudo.`);
  }
  for (const state of fixture.persistedStates.filter(({ mapApproval }) =>
    mapApproval !== "aprovado")) {
    assert.equal(state.partCount, 0, `${state.id} não pode conter lote de produção.`);
  }
});

test("o estado inicial leva a calibração contextual embutida e silenciosa em cada materialização", () => {
  for (const part of [1, 2]) {
    const artifact = fixture.artifacts[`parte-${part}-v2`];
    const preparationIndex = fixture.toolTrace.findIndex(({ task, arguments: input }) =>
      task === "preparar_materializacao" && input?.parte === part);
    const materializationIndex = fixture.toolTrace.findIndex(({ task, part: position }) =>
      task === "materializar_parte" && position === part);
    const calibrations = fixture.toolTrace.slice(preparationIndex + 1, materializationIndex)
      .filter(({ task }) => task === "ajustar_configuracao");
    assert.deepEqual(calibrations, [], "a calibração rotineira não deve virar etapa persistente");
    const materialization = fixture.toolTrace[materializationIndex];
    assert.equal(materialization.calibracaoContextual, "embutida_nas_unidades");
    assert.deepEqual(materialization.microssequenciasCalibradas, artifact.microsequences);
  }
  assert.doesNotMatch(
    fixture.conversation.map(({ text }) => text).join("\n"),
    /calibr(?:ar|ação)|parâmetro|default/iu
  );
});

test("toda aprovação corresponde ao mesmo artefato que a pessoa pôde inspecionar", () => {
  const inspectedBefore = (artifactId, turn) => fixture.conversation.some((message) =>
    message.speaker === "assistente" &&
    message.turn < turn &&
    message.inspectableArtifact === artifactId &&
    message.text.includes("[Abrir "));

  for (const approval of fixture.conversation.filter(({ approvesArtifact }) => approvesArtifact)) {
    assert.equal(inspectedBefore(approval.approvesArtifact, approval.turn), true);
    const write = fixture.toolTrace.find(({ artifact, approvedByTurn }) =>
      artifact === approval.approvesArtifact && approvedByTurn === approval.turn);
    assert.ok(write, `A aprovação do turno ${approval.turn} precisa persistir o artefato mostrado.`);
  }

  assert.deepEqual(
    mapArguments(approvedArtifactId(), true).modulos,
    mapArguments("mapa-global-v2", true).modulos
  );
  assert.deepEqual(
    partArguments("parte-1-v2"),
    partArguments(fixture.conversation.find(({ turn }) => turn === 9).approvesArtifact)
  );
  assert.deepEqual(
    partArguments("parte-2-v2"),
    partArguments(fixture.conversation.find(({ turn }) => turn === 17).approvesArtifact)
  );
  assert.doesNotMatch(
    JSON.stringify(fixture.toolTrace),
    /analysisUnits|evidenceRequirements|unidadesDeAnalise|requisitosDeEvidencia/u
  );
});

function approvedArtifactId() {
  return fixture.conversation.find(({ turn }) => turn === 5).approvesArtifact;
}

test("parte é somente lote operacional e pode mudar de limite sem mudar o currículo", () => {
  const curricularTitles = new Set(
    flattenMicrosequences(fixture.artifacts["mapa-global-v2"]).map(({ title }) => title)
  );
  const partArtifacts = Object.values(fixture.artifacts)
    .filter(({ kind }) => kind === "planejamento_de_parte");
  for (const part of partArtifacts) {
    assert.equal(Object.hasOwn(part, "modules"), false);
    assert.equal(Object.hasOwn(part, "lessons"), false);
    for (const title of part.microsequences) assert.ok(curricularTitles.has(title));
  }

  const firstBefore = fixture.artifacts["parte-1-v1"].microsequences;
  const firstApproved = fixture.artifacts["parte-1-v2"].microsequences;
  assert.deepEqual(firstApproved.slice(0, firstBefore.length), firstBefore);
  assert.deepEqual(
    firstApproved.slice(firstBefore.length),
    ["Quadro Ethernet, endereço MAC e porta do switch"]
  );
  assert.equal(
    fixture.artifacts["parte-2-v1"].microsequences.includes("Modelos em camadas e encapsulamento"),
    true
  );
  assert.equal(
    fixture.artifacts["parte-2-v2"].microsequences.includes("Modelos em camadas e encapsulamento"),
    false
  );
  assert.equal(approvedArtifactId(), "mapa-global-v2");
});

test("o chat é curto, leigo e trata o autor como autor", () => {
  const assistantMessages = fixture.conversation.filter(({ speaker }) => speaker === "assistente");
  const publicText = assistantMessages.map(({ text }) => text).join("\n");
  for (const message of assistantMessages) {
    assert.ok(message.text.length <= 750, `Turno ${message.turn} está longo demais.`);
    assert.ok((message.text.match(/\?/gu) || []).length <= 1, `Turno ${message.turn} pede decisões demais.`);
  }

  assert.match(publicText, /curso é destinado a iniciantes/u);
  assert.doesNotMatch(publicText, /como você (?:está|estaria) começando|você começa do zero/iu);
  assert.doesNotMatch(
    publicText,
    /StudyUnit|AnalysisUnit|analysisUnits|evidenceRequirements|requestId|expectedPlanVersion|\bCAS\b|\bIDs?\b|schema|comandos?/iu
  );
  assert.doesNotMatch(publicText, /\b(?:Curso|Parte|Fonte|Microssequência|Unidade de estudo)\b/u);
  assert.doesNotMatch(publicText, /arquitetura|backend|metamodelo|mecânica do AraLearn/iu);
  assert.doesNotMatch(publicText, /quantas? (?:unidades|microssequências)|quantidade de (?:unidades|microssequências)/iu);
  assert.doesNotMatch(
    publicText,
    /\b(?:\d+|um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|vinte e quatro)\s+(?:módulos|lições|microssequências)\b/iu
  );
  assert.match(fixture.conversation.find(({ turn }) => turn === 2).text, /mapa global/u);
  assert.match(fixture.conversation.find(({ turn }) => turn === 4).text, /cobertos no mapa completo/u);
  assert.match(fixture.conversation.find(({ turn }) => turn === 10).text, /^Primeira parte produzida\./u);
  assert.match(fixture.conversation.find(({ turn }) => turn === 18).text, /^Segunda parte produzida\./u);
});

test("MCP e Actions expõem o mapa curricular inteiro e lotes por referência humana", () => {
  const proposedMap = mapArguments("mapa-global-v1", false);
  const revisedMap = mapArguments("mapa-global-v2", false);
  const approvedMap = mapArguments("mapa-global-v2", true);
  const firstPart = partArguments("parte-1-v2");
  const secondPart = partArguments("parte-2-v2");
  const sourceCall = fixture.toolTrace.find(({ task }) => task === "manter_fonte").arguments;

  for (const tools of [COURSE_HUMAN_TASKS, actionTools]) {
    validate(tools, "salvar_mapa_curricular", proposedMap);
    validate(tools, "salvar_mapa_curricular", revisedMap);
    validate(tools, "salvar_mapa_curricular", approvedMap);
    validate(tools, "salvar_parte", firstPart);
    validate(tools, "salvar_parte", secondPart);
    validate(tools, "manter_fonte", sourceCall);
    for (const trace of fixture.toolTrace.filter(({ arguments: input, task }) =>
      input && !["manter_fonte"].includes(task))) {
      validate(tools, trace.task, trace.arguments);
    }

    const mapSchema = JSON.stringify(taskFrom(tools, "salvar_mapa_curricular").inputSchema);
    assert.match(mapSchema, /publico/u);
    assert.match(mapSchema, /preRequisitos/u);
    assert.match(mapSchema, /modulos/u);
    assert.match(mapSchema, /licoes/u);
    assert.match(mapSchema, /microssequencias/u);
    assert.match(mapSchema, /dependencias/u);
    assert.match(mapSchema, /cobertura/u);
    assert.doesNotMatch(mapSchema, /partes/u);

    const partSchema = JSON.stringify(taskFrom(tools, "salvar_parte").inputSchema);
    assert.doesNotMatch(
      partSchema,
      /objetivoDoModulo|objetivoDaLicao|unidadesDeAnalise|requisitosDeEvidencia/u
    );
  }

  assert.ok(openApi.paths["/salvar_mapa_curricular"]);
  assert.ok(openApi.paths["/consultar_planejamento"]);
  assert.ok(openApi.paths["/salvar_parte"]);
  assert.ok(openApi.paths["/preparar_materializacao"]);
  assert.ok(openApi.paths["/materializar_parte"]);
  assert.ok(openApi.paths["/manter_fonte"]);
});

test("a fonte técnica e o repertório acumulado chegam à segunda parte no papel correto", () => {
  const sourceTurn = fixture.conversation.find(({ turn }) => turn === 16).text;
  assert.match(sourceTurn, /fonte técnica e conceitual/u);
  assert.match(sourceTurn, /não redefine o escopo curricular/u);
  assert.match(sourceTurn, /não será tratada como evidência de cobrança/u);

  const sourceCall = fixture.toolTrace.find(({ task }) => task === "manter_fonte");
  assert.equal(sourceCall.arguments.metadados.papel, "tecnica_conceitual");
  assert.equal(sourceCall.arguments.metadados.verificacao, "nao_verificada");
  assert.equal(Object.hasOwn(sourceCall.arguments, "papelNoCurso"), false);
  assert.equal(fixture.artifacts["parte-2-v2"].sourceUse.role, "tecnica_conceitual");
  assert.equal(fixture.artifacts["parte-2-v2"].sourceUse.relation, "needs_verification");
  const preparation = fixture.toolTrace.find(({ repertoire }) => repertoire === "before-part-2");
  const materialization = fixture.toolTrace.find(({ task, part }) =>
    task === "materializar_parte" && part === 2);
  assert.ok(fixture.toolTrace.indexOf(preparation) < fixture.toolTrace.indexOf(materialization));

  const repertoire = fixture.repertoires["before-part-2"];
  assert.deepEqual(
    repertoire.established.map(({ idea }) => idea),
    ["quadro Ethernet", "endereço MAC", "porta do switch"]
  );
  assert.deepEqual(
    repertoire.established.map(({ use }) => use),
    ["utilizada", "retomada", "utilizada"]
  );
  const established = new Set(repertoire.established.map(({ idea }) => idea));
  assert.equal(repertoire.newForPart.some((idea) => established.has(idea)), false);
  const finalAnswer = fixture.conversation.find(({ turn }) => turn === 20).text;
  for (const idea of established) assert.match(finalAnswer, new RegExp(idea, "u"));
});

test("as duas inspeções contêm conteúdo estudável, não apenas estrutura ou contagens", () => {
  const first = fixture.contentInspections["parte-1"];
  const second = fixture.contentInspections["parte-2"];
  for (const inspection of [first, second]) {
    assert.ok(inspection.units.length >= 6);
    assert.ok(inspection.units.some(({ kind }) => kind === "explicacao"));
    assert.ok(inspection.units.some(({ kind }) =>
      ["pratica", "pratica_com_apoio", "integracao"].includes(kind)));
    for (const unit of inspection.units) {
      assert.ok(unit.title.length >= 8);
      assert.ok(unit.visibleText.length >= 60, `${unit.title} precisa conter texto inspecionável.`);
    }
  }

  const switchContent = second.units.map(({ title, visibleText }) =>
    `${title} ${visibleText}`).join(" ");
  for (const milestone of [
    /tabela (?:está )?vazia/iu,
    /origem/iu,
    /destino/iu,
    /porta/iu,
    /flooding/iu,
    /tabela muda|atualize a tabela/iu,
    /parcialmente resolvido/iu,
    /prática integrada|Integre aprendizagem/iu
  ]) assert.match(switchContent, milestone);
});

test("as instruções primárias não restauram o fluxo parte por parte nem o metamodelo", () => {
  assert.ok(COURSE_AUTHORING_SERVER_INSTRUCTIONS.length <= 1000);
  assert.doesNotMatch(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /Planeje uma Parte por vez|proponha somente a próxima Parte|grave exatamente uma Parte/iu
  );
  assert.doesNotMatch(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /StudyUnit|AnalysisUnit|analysisUnits|evidenceRequirements/iu
  );
  assert.match(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /estado default.*calibração varia por microssequência ou unidade.*assunto e mapa/iu
  );
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /condições fixadas pelo pesquisador prevalecem/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /substantivos comuns em minúsculas/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /não estatísticas da estrutura/iu);
  assert.match(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /Falhas.*impacto.*retomada.*linguagem humana/iu
  );
  assert.doesNotMatch(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /aprovada?,?\s+materialize|produza (?:agora|o conteúdo aprovado)|no chat, só/iu
  );
  assert.doesNotMatch(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /concurso|banca|macete de prova/iu);
});
