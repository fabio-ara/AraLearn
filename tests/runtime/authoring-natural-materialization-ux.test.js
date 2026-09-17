import assert from "node:assert/strict";
import test from "node:test";

import {
  materializationConversationProjection,
  normalizeNaturalAuthoringArguments
} from "../../supabase/functions/_shared/aralearn-authoring/authoringConversationPolicy.js";

test("materialização focal é o padrão dos canais quando o pedido não declara conclusão global", () => {
  const plan = [{ microssequencia: "Dicionário", posicao: 3 }];
  assert.deepEqual(
    normalizeNaturalAuthoringArguments("preparar_materializacao", { curso: "Catálogo", parte: 2, plano: plan }),
    { curso: "Catálogo", parte: 2, plano: plan, concluir: false }
  );
  assert.deepEqual(
    normalizeNaturalAuthoringArguments("materializar_parte", { curso: "Catálogo", parte: 2, unidades: [{}] }),
    { curso: "Catálogo", parte: 2, unidades: [{}], concluir: false }
  );
  assert.equal(
    normalizeNaturalAuthoringArguments("consultar_planejamento", { curso: "Catálogo" }).concluir,
    undefined
  );
});

test("conclusão global continua disponível quando foi escolhida explicitamente", () => {
  const input = { curso: "Catálogo", parte: 2, concluir: true };
  assert.deepEqual(normalizeNaturalAuthoringArguments("preparar_materializacao", input), input);
  assert.deepEqual(normalizeNaturalAuthoringArguments("materializar_parte", input), input);
});

test("blocker técnico vira orientação pedagógica sem vazar a máquina de execução", () => {
  const projection = materializationConversationProjection(
    { code: "human_materialization_preflight_blocked" },
    { state: "blocked", referencia: null, blockers: [
      { code: "human_materialization_existing_application_missing" },
      { code: "explanation_reconciliation_missing" }
    ] }
  );
  const visible = `${projection.message} ${projection.nextDecision}`;
  assert.match(visible, /decisão pedagógica|aprendizagem/iu);
  assert.doesNotMatch(visible,
    /human_materialization|explanation_reconciliation|referenciaPreparo|\bprocesso\b|state\s*=|preparar_materializacao|materializar_parte/iu);
  assert.doesNotMatch(visible, /blocker|preflight|token|referência opaca/iu);
});

test("calibração derivável não é apresentada como decisão humana", () => {
  const projection = materializationConversationProjection({
    code: "human_materialization_contextual_calibration_required"
  });
  assert.match(projection.nextDecision, /Resolva autonomamente/iu);
  assert.match(projection.nextDecision, /Só peça ajuda se faltar uma decisão pedagógica ou autoral genuína/iu);
});
