import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const experimentalKnowledge = await readFile(new URL(
  "../../authoring/knowledge/experimental-variants.md",
  import.meta.url
), "utf8");
const runtimeKnowledge = await readFile(new URL(
  "../../supabase/functions/_shared/aralearn-authoring/authoringKnowledge.js",
  import.meta.url
), "utf8");

test("guidance experimental descobre parent→child sem pedir ids técnicos", () => {
  assert.match(experimentalKnowledge, /workspace pai[\s\S]*experiment_context`? sem referências/iu);
  assert.match(experimentalKnowledge, /workspace filho[\s\S]*paths autorizados/iu);
  assert.match(experimentalKnowledge, /Nunca peça à pessoa UUID, id técnico ou JSON/iu);
  assert.match(experimentalKnowledge, /frozen[^\n]*invalidated[^\n]*somente leitura/iu);
  assert.match(
    experimentalKnowledge,
    /Targets de fatores[^.]*locks[^.]*ResourceSets[^.]*coleções progressivas pinadas[\s\S]*truncated:true[\s\S]*setRef[^.]*cursor/iu
  );
  assert.match(runtimeKnowledge, /experiment_context sem refs[\s\S]*targetWorkspaceId/iu);
});

test("guidance mantém mandate até evidence, diff e classificação", () => {
  assert.match(
    experimentalKnowledge,
    /conclua a auditoria[^.]*register_experiment_variant_evidence[^.]*differenceRunRef[^.]*classifique[^.]*limpe o mandato/iu
  );
  assert.match(
    runtimeKnowledge,
    /audit complete[^"]*register_experiment_variant_evidence[^"]*differenceRunRefs[^"]*classificação[^"]*clear_mandate/iu
  );
  assert.match(
    runtimeKnowledge,
    /mantenha o mandato[^"]*evidência\/diff[^"]*classificar[^"]*clear_mandate/iu
  );
});

test("guidance mantém atribuição seeded no servidor e sem expor a seed", () => {
  assert.match(
    experimentalKnowledge,
    /seeded_random[\s\S]*server-authoritative[\s\S]*commitment[\s\S]*64 bits[\s\S]*não recebe a seed/iu
  );
  assert.match(
    runtimeKnowledge,
    /atribuição seeded[^.]*somente do servidor[^.]*conditions em ordem canônica[^.]*nunca receba a seed[^.]*RNG no cliente/iu
  );
});
