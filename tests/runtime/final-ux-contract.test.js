import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("o contrato histórico registra as decisões finais da rodada sem alternativa pendente", async () => {
  const contract = await read("ux-atlas/FINAL-UX-CONTRACT.md");
  assert.match(contract, /contrato histórico da rodada final de experiência/iu);
  assert.match(contract, /não é a fonte do\s+comportamento corrente/iu);
  for (const fragment of [
    "A pesquisa respondeu às seis perguntas",
    "Assistência por IA",
    "## Modos de Estudo por nível",
    "## Mapa humano de tarefas de Autoria",
    "## Arquitetura de informação única de Autoria",
    "Visão geral",
    "**Conteúdo**",
    "## Jornada de materialização",
    "## Invariantes executáveis"
  ]) assert.ok(contract.includes(fragment), `ausente no contrato: ${fragment}`);

  assert.match(contract, /Curso → Visão geral → Planejamento → Parte → Materializações/u);
  assert.match(contract, /descrição técnica própria do AraLearn/iu);
  assert.match(contract, /ordem normal de Tab/iu);
  assert.match(contract, /quantidade de três modos, sozinha, não o exige/iu);
  assert.doesNotMatch(contract, /Com três controles, o grupo é\s+uma toolbar horizontal/iu);
  assert.doesNotMatch(contract, /alternativas? (?:em aberto|pendentes?)/iu);
});

test("o Atlas histórico está explicitamente subordinado às autoridades correntes", async () => {
  const index = await read("ux-atlas/README.md");
  assert.match(index, /registra a rodada de desenho que antecedeu a experiência\s+corrente/iu);
  assert.match(index, /não é documentação normativa do produto atual/iu);
  assert.match(index, /produto corrente[\s\S]*prevalecem/iu);
  assert.match(index, /conserva o contrato final\s+daquela rodada/iu);
  assert.doesNotMatch(index, /matriz de cobertura e o baseline de Estudo são normativos/iu);
});
