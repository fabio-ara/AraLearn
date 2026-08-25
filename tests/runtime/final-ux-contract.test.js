import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("o contrato corrente registra as decisões pós-auditoria sem alternativa pendente", async () => {
  const contract = await read("ux-atlas/FINAL-UX-CONTRACT.md");
  assert.match(contract, /contrato corrente de experiência/iu);
  for (const fragment of [
    "A pesquisa respondeu às seis perguntas",
    "Assistência por IA",
    "## Navegação e modos de Estudo por nível",
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
  assert.match(contract, /Voltar \+ Home/iu);
  assert.match(contract, /restaura a origem real/iu);
  assert.match(contract, /icon-first, não icon-only/iu);
  assert.match(contract, /geometria externa estável/iu);
  assert.match(contract, /provider remoto escolhido/iu);
  assert.match(contract, /chave\s+efêmera/iu);
  assert.match(contract, /Relay local não é arquitetura de produção/iu);
  assert.match(contract, /títulos não recebem sufixos/iu);
  assert.doesNotMatch(contract, /subir um nível em cada tela/iu);
  assert.doesNotMatch(contract, /Cada botão mostra somente ícone/iu);
  assert.doesNotMatch(contract, /Com três controles, o grupo é\s+uma toolbar horizontal/iu);
  assert.doesNotMatch(contract, /alternativas? (?:em aberto|pendentes?)/iu);
});

test("o Atlas distingue o contrato corrente dos registros históricos", async () => {
  const index = await read("ux-atlas/README.md");
  assert.match(index, /contrato corrente e referências históricas/iu);
  assert.match(index, /registros históricos[\s\S]*não são documentação normativa/iu);
  assert.match(index, /referência normativa\s+compacta reconciliada/iu);
  assert.match(index, /não prevalecem sobre o contrato corrente/iu);
  assert.doesNotMatch(index, /matriz de cobertura e o baseline de Estudo são normativos/iu);
});
