import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("o contrato histórico conserva as decisões da rodada e aponta para a experiência atual", async () => {
  const contract = await read("ux-atlas/FINAL-UX-CONTRACT.md");
  assert.match(contract, /Registro histórico da rodada de UX/iu);
  assert.match(contract, /experiência atual[\s\S]*docs\/sistema-visual\.md/iu);
  assert.match(contract, /contratos executáveis correntes/iu);
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

test("o Atlas delimita seus registros históricos e encaminha a documentação vigente", async () => {
  const index = await read("ux-atlas/README.md");
  assert.match(index, /^# Registros históricos de UX/iu);
  assert.match(index, /O comportamento atual do aplicativo é\s+descrito pelas fontes/iu);
  for (const target of [
    "docs/sistema-visual.md",
    "docs/guia-estudante.md",
    "docs/guia-professor-autor.md",
    "docs/README.md"
  ]) {
    assert.ok(index.includes(`../${target}`), `destino corrente ausente: ${target}`);
    assert.ok((await read(target)).trim(), `destino corrente vazio: ${target}`);
  }
  for (const target of ["FINAL-UX-CONTRACT.md", "MATRIZ-COBERTURA.md", "STUDY-VISUAL-BASELINE.md"]) {
    assert.ok(index.includes(`](${target})`), `registro histórico não indexado: ${target}`);
    assert.match(await read(`ux-atlas/${target}`), /Registro histórico da rodada de UX/iu);
  }
});
