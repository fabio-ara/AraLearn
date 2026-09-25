import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const runner = await readFile(new URL("../../supabase/tests/course-focal-client-local-smoke.mjs", import.meta.url), "utf8");
const channelClient = await readFile(new URL("../../supabase/tests/course-authoring-channels-local-smoke.mjs", import.meta.url), "utf8");
const experiment = JSON.parse(await readFile(new URL("../../docs/experimentos/revisao-v7/corrected-B-2/final.json", import.meta.url), "utf8"));

test("a prova focal usa o B-2 real, foco por microssequência e ciclo de inspeção", () => {
  assert.match(runner, /corrected-B-2[\\/]final\.json/u);
  assert.match(runner, /authorizeLocalMcpSession/u);
  assert.match(runner, /authorizeLocalActionSession/u);
  assert.match(runner, /registrar_inspecao/u);
  assert.match(runner, /aplicar_correcoes/u);
  assert.match(runner, /needs_attention/u);
  assert.match(runner, /basisHash/u);
  assert.match(runner, /syntheticNegativeControl/u);
  assert.match(runner, /pristine/u);
  assert.match(runner, /restoredBasisHash/u);
  assert.doesNotMatch(runner, /Aplicando aos três pares/u);
  assert.match(channelClient, /MCP-Protocol-Version/u);
  assert.match(runner, /functions\/v1\/aralearn-authoring-action/u);
  assert.match(runner, /44221/u);
  assert.doesNotMatch(runner, /supabase_db_aralearn\b/u);
  assert.doesNotMatch(runner, /5432[12]/u);
  assert.doesNotMatch(runner, /preparar_materializacao/u);
  assert.match(runner, /microssequencia: batch\.microssequencia/u);
  assert.equal(experiment.length, 1);
  assert.equal(experiment[0].unidades.length, 3);
  assert.ok(experiment[0].unidades.every(unit => unit.conteudo.role === "practice" && unit.conteudo.response && unit.conteudo.feedback?.length));
});
