# Evidência — revisão v10

Pasta **versionável** com evidência sintética do catálogo de recursos (390 px, tema claro), recortes de inspeção e evidência **nativa real** de voz em DOM local. Nada de dados reais, snapshots privados, backups, logs, cookies ou JSON de curso: só PNGs copiados sem manipulação de pixels mais `manifest.json`, `links.md` e este README.

| série | arquivos | bytes | sha256 do conjunto |
| --- | --- | --- | --- |
| Catálogo em `capturas/` — recursos inline, prática e cenários de apoio, conforme cobertura abaixo | 72 PNG | 14680154 | `561b850ca53f8e38f68a6ae0c55e531533fedb9aa382706fcde165f6e885f6ae` |
| `recortes/` — ampliação do rótulo com halo (DPR6) | 1 PNG | 36336 | (sha por arquivo no manifesto) |
| `native-real/` — voz nativa real (pausa e fim) + resumo | 2 PNG + summary.json | 23886 | `b059c5ca591dbc285787bd514fe5c9ad92bd7fc9080a40844145539273e39c1f` |
| `ferramentas/` — painéis reais de Áudio e Calculadora a partir dos dois hosts | 4 PNG | 462704 | (sha por arquivo no manifesto) |
| Sequência de pressionamento e preenchimento em `capturas/` | 2 PNG | 235889 | (sha por arquivo no manifesto) |

| `bpmn/` — painel e recorte H009 após correção | 2 PNG | 214294 | (sha por arquivo no manifesto) |

Total: 83 PNG, 15.653.263 bytes. O hash de conjunto concatena, sem terminador final, os hashes SHA-256 em hexadecimal minúsculo separados por LF; calcula SHA-256 desses bytes ASCII. A ordem é `Sort-Object Name` do PowerShell. O conjunto do catálogo usa somente os 72 arquivos listados em `manifest.capturas`, sem incluir a série de lacunas no mesmo diretório.

## Cobertura

O catálogo tem **29 recursos inline**, **duas ferramentas** e **três formatos de resposta**. As 29 representações inline estão nos dois hosts — Unidade e Explicação — a 390 px no tema claro. Escolha, Lacuna e Ordenação aparecem na prática. Os cenários expositivos de ferramentas e as explicações dos formatos de resposta mostram parágrafos de apoio: essas imagens não comprovam a execução do renderer da ferramenta ou da resposta. Os painéis reais de Áudio e Calculadora têm a série própria descrita abaixo.

Cards que rolam entram pelo primeiro segmento, salvo BPMN, cuja representação foi enquadrada após rolagem do corpo; `memory_layout` traz também o segmento final (3/3); `table`, `code` e `truth_table` trazem a sequência de rolagem horizontal (início do probe + fim da execução reconciliada A1/A2/A3).

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

## Alternativa de lacuna durante o clique

`capturas/gap-opcoes-pressionamento.png` e `capturas/gap-opcoes-preenchimento.png` registram, nessa ordem, o pressionamento mantido e o preenchimento ao soltar o botão. O viewport estreito é calculado a partir da largura real das opções, com altura de 900 px CSS. A segunda captura ainda contém uma alternativa incorreta em outra lacuna; não representa aprovação da resposta.

O caso `study-final-ux.spec.js`, “clique mantido preserva a geometria”, passou após a atualização de uma comparação antiga que exigia a mesma decoração no rótulo da alternativa e no espaço preenchido. Continuam verificados tipografia, alvos de pelo menos 44 px, geometria durante o pressionamento, preenchimento das três lacunas e avanço. A raiz inspecionou as duas imagens. Trata-se de fixture local e inspeção autônoma, sem prova de persistência hospedada ou validação humana.

## BPMN após a falha H009 na CI

A CI revelou sobreposição real de 36,7% da caixa de “dados recebidos” por um gateway. O espaçamento BPMN passou a `nodesep=1.2` e `ranksep=1.3`; a área do desenho aumentou cerca de 26% nesse caso. O halo já usado em estados passou a proteger também os textos de fluxos e objetos BPMN, incluindo o evento que cruzava a borda de participante/raia. Não há parâmetro de posição para autoria.

As duas imagens BPMN do catálogo foram substituídas por capturas finais da mesma unidade pública, em Unidade e Explicação. O corpo foi rolado para mostrar a representação. O teste focal passou e ambas foram inspecionadas. A série `bpmn/` usa outro exemplo público, reproduzindo f7 em Explicação; centralização programática e recorte servem apenas à inspeção dos pixels. A sonda final mediu zero sobreposição com nós em 390/1280 px. Os quatro casos H009 e os treze casos de diagramas v10 passaram juntos após todos os estilos finais: vínculo geométrico com a própria aresta, ausência de vínculo estrangeiro cruzando o rótulo, zoom, pan, tela inteira e lacuna explorável. Capturas não substituem esses testes de interação.
