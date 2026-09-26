# Evidência — revisão v10

Pasta **versionável** com evidência sintética do catálogo de recursos (390 px, tema claro), recortes de inspeção e evidência **nativa real** de voz em DOM local. Nada de dados reais, snapshots privados, backups, logs, cookies ou JSON de curso: só PNGs copiados sem manipulação de pixels mais `manifest.json`, `links.md` e este README.

| série | arquivos | bytes | sha256 do conjunto |
| --- | --- | --- | --- |
| `capturas/` — 34 componentes (31 expositivos + 3 respostas), cada um em Unidade e Explicação | 72 PNG | 14732874 (14.05 MB) | `f941acc010bd037c176b24e336c216aacd697f5b1d6f1fdcda5bbc58e46f5d16` |
| `recortes/` — ampliação do rótulo com halo (DPR6) | 1 PNG | 36336 | (sha por arquivo no manifesto) |
| `native-real/` — voz nativa real (pausa e fim) + resumo | 2 PNG + summary.json | 23886 | `b059c5ca591dbc285787bd514fe5c9ad92bd7fc9080a40844145539273e39c1f` |

Total: 79 PNG, 14,55 MB, incluindo os quatro painéis abaixo.

## Cobertura

Os **31 componentes expositivos** e os **3 de resposta** (`choice`, `gap`, `ordering`) aparecem nos **dois hosts** — Unidade e Explicação — a 390 px no tema claro. Cards que rolam entram pelo primeiro segmento; `memory_layout` traz também o segmento final (3/3); `table`, `code` e `truth_table` trazem a sequência de rolagem horizontal (início do probe + fim da execução reconciliada A1/A2/A3).

## Gráfico estatístico — evidência pós-correção

O gráfico do probe antigo foi **substituído** pelas capturas atuais de `.tmp/agent/revisao-v10/test-results-chart/` (matriz 320/390/430/1280 nos dois hosts, mais tema escuro em 320/390 — quatro execuções E2E e quatro sondas, todas verdes). Publicadas aqui em 390 px light, Unidade e Explicação, com o rótulo "Limite operacional" já com halo e o mecanismo intacto: 2 séries × 12 pontos, nada cortado. O input difere do restante da pasta (fixture `studyExplanationFixture` com o exemplo do package `chart`, em vez do curso de catálogo), mas a semântica do gráfico é a mesma — por isso essas duas entradas declaram o `input` próprio no manifesto. Os **outros 33 componentes do catálogo seguem representados** pelas capturas válidas do probe.

`recortes/chart-label-dpr6.png` é um recorte ampliado do rótulo para leitura do halo: serve à inspeção de detalhe em alta densidade e **não** é um render 1:1 do app.

## Voz nativa real

`native-real/` traz o estado de pausa e o estado final de uma leitura com **síntese nativa original** (não simulada) em DOM local: Chrome 153 em Windows (x64 no UA), ouvintes **passivos** de eventos e texto sintético ético, sem serviço remoto. O DOM exercita o **renderer/binding real** do componente; nenhum curso persistido é aberto ou alterado.

A voz foi verificada **diretamente** em `native-real-voice-stop.json`: `Microsoft Daniel - Portuguese (Brazil)`, `lang` `pt-BR`, `localService=true`. O mesmo arquivo registra o Stop: em `at=370852,2ms` `playing=true`/`speaking=true` com `elapsed` 0:00 e, em `at=370852,9ms`, `playing=false`/`speaking=false` com `stopDisabled=true` — cancelamento imediato (+0:00).

`native-real/summary.json` é o resumo sanitizado de `native-real-after.json` (o original permanece privado em `.tmp/agent/revisao-v10/`): 41 snapshots e 33 eventos, com `start` em 809,6 ms, `pause` em 2454,8 ms, `resume` em 9973,1 ms e `end` em 21221,7 ms (relógio do evento), 27 `boundary` (índices 0–136) e um `error: interrupted` na segunda execução. Na UI, a pausa congelou em 0:01, a leitura seguiu até 0:04 e terminou em 0:12/0:12; um novo Play apagou a duração e o Stop cancelou em +0:00. O `interrupted` é **esperado** pelo término voluntário. A varredura do JSON original encontrou 0 UUIDs, 0 cookies, 0 tokens, 0 sessões e nenhuma credencial.

Limites desta série: vale para **Chrome 153 em Windows** e não deve ser atribuída a outros navegadores; a captura é estática e não prova áudio.

## O que as imagens provam — e o que não provam

Provam composição, hierarquia, cortes aparentes e enquadramento por componente e host nessas larguras. **Não** provam interação: foco, abrir/fechar, rolagem horizontal, zoom/pan e áudio exigem execução. As provas executadas (servidor estático próprio em modo repo na porta 4193, navegador headless do Playwright; nenhuma sessão de Chrome da raiz) ficaram assim:

```
npx playwright test tests/e2e/revisao-v7-study-surface.spec.js --grep "D030: rolagem"                                    → 6 passed
npx playwright test tests/e2e/revisao-v7-study-surface.spec.js --grep "table: conteúdo integral|code: gramática"        → 5 passed
```

Medições do primeiro comando (scrollWidth × clientWidth → cauda alcançada): `table` 716 × 252/322 → `Coluna 8`; `truth_table` 590 × 252/322 → `¬P ∨ Q` e `(P → Q) ↔ (¬P ∨ Q)`; `code` 355 × 250/320 → `inicio, fim = 0, len(valores) - 1` completo. D030 mantido: rolagem horizontal é solução legítima, sem indicador adicional obrigatório.

## Proveniência

Capturas de catálogo geradas de fixture sintética do repositório público (`scripts/buildResourceCatalogCourse.mjs`, `src/resources/packages/*`); capturas do gráfico, de `test-results-chart`; evidência nativa, de execução local em Chrome 153 no Windows. Curso novo/legado real não está incluído.

## Painéis de ferramentas abertos

A coleção ferramentas/ mostra Áudio e Calculadora abertos a partir de Unidade e Explicação. O spec study-explanation.spec.js passou 27/27; os seis casos focais passaram novamente após reforçar o hit-test do controle de fechar. Foram exercitadas 16 combinações de ferramenta/host/largura (320/390/430/1280): abertura, cálculo 2 + 3 = 5, estado explícito do player, fechamento e retorno de foco. Nesses casos o áudio não é reproduzido nem depende de hardware. A síntese real tem prova separada. As capturas publicadas aqui são de 390 px.
