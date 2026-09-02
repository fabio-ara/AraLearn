import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  COURSE_HUMAN_TASKS
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  courseAuthoringGuidanceForCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  projectHumanAuthoringTasksForActions
} from "../../scripts/projectHumanAuthoringActions.mjs";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/contextual-review-repair.v1.json",
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

test("#271 fixture expande alvos anotados para o percurso pedagogicamente afetado", () => {
  assert.equal(fixture.format, "aralearn.contextual-review-repair-eval.v1");
  assert.equal(fixture.openObservations.length, 2);
  assert.equal(fixture.persistentBatchEntity, null);
  assert.deepEqual(fixture.affectedContext.map(({ relation }) => relation), [
    "prerequisite", "observed_target", "transition", "example", "practice"
  ]);
  const annotated = new Set(fixture.openObservations.map(({ targetStudyUnitId }) => (
    targetStudyUnitId
  )));
  assert.ok(fixture.affectedContext.filter(({ studyUnitId }) => !annotated.has(studyUnitId))
    .length >= 2);
  assert.equal(fixture.representationAudit.structuralValid, true);
  assert.equal(fixture.representationAudit.overallFit, "substitute");
  assert.equal(fixture.representationAudit.diversityQuota, null);
});

test("#271 guidance conduz Observações abertas até reparo contextual e reinspeção", () => {
  const inspectionText = courseAuthoringGuidanceForCall("consultar_observacoes")
    .instructions.join(" ");
  const reviewText = courseAuthoringGuidanceForCall("preparar_revisao")
    .instructions.join(" ");
  const sourceText = courseAuthoringGuidanceForCall("consultar_fontes")
    .instructions.join(" ");
  const componentText = courseAuthoringGuidanceForCall("consultar_componentes")
    .instructions.join(" ");
  assert.match(inspectionText, /Observações abertas.*inbox/iu);
  assert.match(inspectionText, /não crie entidade persistente de lote/iu);
  assert.match(inspectionText, /progressão, pré-requisitos, transições, exemplos ou prática/iu);
  assert.match(reviewText, /inspecionar, observar, pedir revisão.*propor reparo.*reinspecionar/iu);
  assert.match(reviewText, /não apenas os alvos anotados/iu);
  assert.match(sourceText, /referência humana, o papel efetivo.*Âncora ou trecho/iu);
  assert.match(sourceText, /Fonte e Âncora continuam contestáveis/iu);
  assert.match(componentText, /condensação evitável.*proposta concreta.*revisão/iu);
  assert.match(componentText, /não uma quota de diversidade/iu);
});

test("#271 MCP e Actions preservam consulta, revisão, Observação e correção humanas", () => {
  const values = {
    consultar_observacoes: {
      curso: "Redes para iniciantes",
      microssequencia: fixture.scope.id,
      unidades: [4, 7],
      somenteAbertas: true
    },
    preparar_revisao: {
      curso: "Redes para iniciantes",
      microssequencia: fixture.scope.id,
      unidades: fixture.affectedContext.map(({ studyUnitId }) => studyUnitId)
    },
    registrar_observacao: {
      curso: "Redes para iniciantes",
      unidades: fixture.openObservations.map(({ targetStudyUnitId }) => targetStudyUnitId),
      texto: "A condição de roteamento continua ambígua.",
      categoria: "confusing"
    },
    aplicar_correcoes: {
      curso: "Redes para iniciantes",
      correcoes: fixture.affectedContext.filter(({ requiresRepair }) => requiresRepair)
        .map(({ studyUnitId }) => ({
          unidade: studyUnitId,
          conteudo: { title: `Reparo de ${studyUnitId}`, role: "theory", content: [] },
          fontes: []
        }))
    }
  };
  for (const [name, value] of Object.entries(values)) {
    validate(COURSE_HUMAN_TASKS, name, value);
    validate(actionTools, name, value);
  }
  assert.equal(Object.hasOwn(values.registrar_observacao, "batchId"), false);
  assert.equal(values.aplicar_correcoes.correcoes.length, 4);
});

test("#271 Fontes, componentes e parâmetro seguinte permanecem casos focais", () => {
  const values = {
    consultar_fontes: {
      curso: "Redes para iniciantes",
      fonte: fixture.sources[1].citationText,
      unidade: fixture.initialInspection.targetStudyUnitId
    },
    consultar_componentes: {
      busca: "fluxo",
      funcao: "Preservar a sequência condição, escolha e encaminhamento.",
      componente: fixture.representationAudit.componentRef
    },
    ajustar_configuracao: {
      curso: "Redes para iniciantes",
      microssequencia: fixture.parameterChange.scope.ref,
      parametrosPedagogicos: {
        minimoDePraticasPorRequisito: fixture.parameterChange.effectiveValue
      }
    }
  };
  for (const [name, value] of Object.entries(values)) {
    validate(COURSE_HUMAN_TASKS, name, value);
    validate(actionTools, name, value);
  }
  assert.equal(fixture.sources[0].factualSupport, false);
  assert.equal(fixture.sources.every(({ contestable }) => contestable), true);
  assert.equal(fixture.parameterChange.appliesTo, "next_generation_or_revision");
});

test("#271 OpenAPI usa somente as tarefas humanas e o resultado curto", () => {
  for (const name of [
    "consultar_observacoes", "preparar_revisao", "registrar_observacao",
    "aplicar_correcoes", "consultar_fontes", "consultar_componentes",
    "ajustar_configuracao"
  ]) assert.ok(openApi.paths[`/${name}`], name);
  assert.deepEqual(openApi.components.schemas.HumanTaskResult.required, [
    "result", "deepLink", "nextDecision"
  ]);
  assert.ok(fixture.coordination.proposal.length < 120);
  assert.equal((fixture.coordination.nextDecision.match(/\?/gu) || []).length, 1);
});
