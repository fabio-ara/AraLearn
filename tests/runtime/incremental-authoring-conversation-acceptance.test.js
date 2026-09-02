import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  COURSE_HUMAN_TASKS
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS,
  courseAuthoringGuidanceForCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  projectHumanAuthoringTasksForActions
} from "../../scripts/projectHumanAuthoringActions.mjs";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/incremental-authoring-conversation.v1.json",
  import.meta.url
), "utf8"));
const openApi = JSON.parse(await fs.readFile(new URL(
  "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
  import.meta.url
), "utf8"));
const actionTools = projectHumanAuthoringTasksForActions(COURSE_HUMAN_TASKS);

function validate(tools, name, value) {
  const schema = tools.find((tool) => tool.name === name).inputSchema;
  const validator = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validator(value), true, `${name}: ${JSON.stringify(validator.errors)}`);
}

test("#269 a fixture mantém uma única proposta corrente e 7–12 apenas como heurística", () => {
  assert.equal(fixture.format, "aralearn.incremental-authoring-conversation-eval.v1");
  assert.deepEqual(fixture.planningHeuristic.usualPartRange, [7, 12]);
  assert.equal(fixture.planningHeuristic.isGate, false);
  assert.equal(fixture.proposals.length, 2);
  for (const [index, proposal] of fixture.proposals.entries()) {
    assert.equal(proposal.persistedPartCountBeforeProposal, index);
    assert.equal((proposal.visibleCoordination.nextDecision.match(/\?/gu) || []).length, 1);
    assert.ok(JSON.stringify(proposal.visibleCoordination).length < 320);
  }
  assert.deepEqual(fixture.persistedStates.map(({ partKeys }) => partKeys.length), [0, 1, 1, 2, 2]);
  assert.equal(fixture.forbiddenPersistentMechanisms.includes("next_part_draft_table"), true);
});

test("#269 guidance exige propor, persistir, reler e decidir Parte por Parte", () => {
  const planningText = courseAuthoringGuidanceForCall("consultar_planejamento")
    .instructions.join(" ");
  const sourceText = courseAuthoringGuidanceForCall("consultar_fontes")
    .instructions.join(" ");
  assert.match(planningText, /proponha somente a próxima Parte/iu);
  assert.match(planningText, /grave exatamente uma Parte/iu);
  assert.match(planningText, /releia (?:instructional_plan|o planejamento)/iu);
  assert.match(planningText, /retome exclusivamente pelo plano persistido/iu);
  assert.match(planningText, /Sete a doze Partes.*heurística/iu);
  assert.match(planningText, /nunca meta, mínimo, máximo ou gate/iu);
  assert.match(sourceText, /Fontes podem ser.*em qualquer fase/iu);
  assert.match(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /Antes de escrever, apresente a mudança concreta.*uma única decisão/iu
  );
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /resultado, link pertinente.*uma próxima decisão/iu);
});

test("#269 MCP e Actions usam consultar_planejamento e salvar_parte sem mecânica", () => {
  const proposal = fixture.proposals[0].part;
  const read = { curso: "Redes para iniciantes", parte: 1 };
  const save = {
    curso: "Redes para iniciantes",
    titulo: proposal.title,
    intencao: proposal.intent,
    microssequencias: [{
      modulo: "Fundamentos",
      objetivoDoModulo: proposal.intent,
      licao: proposal.title,
      objetivoDaLicao: proposal.intent,
      titulo: proposal.title,
      objetivo: proposal.intent,
      funcao: "explicar",
      unidadesDeAnalise: proposal.focus.analysisUnits,
      requisitosDeEvidencia: proposal.focus.evidenceRequirements
    }]
  };
  for (const tools of [COURSE_HUMAN_TASKS, actionTools]) {
    validate(tools, "consultar_planejamento", read);
    validate(tools, "salvar_parte", save);
    const saveSchema = tools.find(({ name }) => name === "salvar_parte").inputSchema;
    assert.equal(Object.hasOwn(saveSchema.properties, "id"), false);
    assert.equal(Object.hasOwn(saveSchema.properties, "requestId"), false);
    assert.equal(Object.hasOwn(saveSchema.properties, "expectedPlanVersion"), false);
  }
});

test("#269 Parte anterior e Fonte no meio do fluxo usam tarefas existentes", () => {
  const revise = {
    curso: "Redes para iniciantes",
    parte: 1,
    titulo: "Do pedido ao endereço de rede — revisto",
    intencao: "Incorporar a nova Fonte sem alterar a Parte seguinte.",
    microssequencias: [{
      modulo: "Fundamentos",
      objetivoDoModulo: "Explicar como pedidos encontram destinos.",
      licao: "Endereçamento",
      objetivoDaLicao: "Relacionar nome, endereço e destino.",
      titulo: "Do pedido ao endereço de rede",
      objetivo: "Explicar o percurso inicial da requisição.",
      funcao: "explicar",
      unidadesDeAnalise: ["Relação entre nome, endereço e destino."],
      requisitosDeEvidencia: ["Reconhecer o destino em dois pedidos distintos."]
    }]
  };
  const source = {
    curso: "Redes para iniciantes",
    fonte: "Referência introdutória verificada"
  };
  for (const tools of [COURSE_HUMAN_TASKS, actionTools]) {
    validate(tools, "salvar_parte", revise);
    validate(tools, "consultar_fontes", source);
  }
});

test("#269 resultado comum conserva conteúdo estruturado sem despejo na coordenação", () => {
  const schema = openApi.components.schemas.HumanTaskResult;
  assert.deepEqual(schema.required, ["result", "deepLink", "nextDecision"]);
  assert.equal(schema.properties.result.maxLength, 4000);
  assert.equal(schema.properties.nextDecision.maxLength, 1000);
  assert.equal(schema.additionalProperties, false);
  assert.equal(Object.hasOwn(schema.properties, "parts"), false);
  assert.equal(Object.hasOwn(schema.properties, "analysisUnits"), false);
});

test("#269 OpenAPI projeta o fluxo atual sem heurística como gate", () => {
  assert.ok(openApi.paths["/retomar_curso"]);
  assert.ok(openApi.paths["/consultar_planejamento"]);
  assert.ok(openApi.paths["/salvar_parte"]);
  assert.ok(openApi.paths["/consultar_fontes"]);
  assert.doesNotMatch(JSON.stringify(openApi.paths), /minimumPartCount|planningSessionId/iu);
});
