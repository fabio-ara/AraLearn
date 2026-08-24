import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("o contrato final encerra pesquisa, arquitetura e modos sem alternativa pendente", async () => {
  const contract = await read("ux-atlas/FINAL-UX-CONTRACT.md");
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
  assert.doesNotMatch(contract, /alternativas? (?:em aberto|pendentes?)/iu);
});

test("o Atlas anterior está explicitamente subordinado ao contrato final", async () => {
  const index = await read("ux-atlas/README.md");
  assert.match(index, /contrato normativo[^\n]*refatoração corrente/iu);
  assert.match(index, /históric[oa]s?|explorações|exploratóri[oa]s?/iu);
  assert.match(index, /prevalece o\s+contrato final/iu);
  assert.doesNotMatch(index, /matriz de cobertura e o baseline de Estudo são normativos/iu);
});
