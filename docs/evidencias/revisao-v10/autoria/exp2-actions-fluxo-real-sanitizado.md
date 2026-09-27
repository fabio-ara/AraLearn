# Exp2 — fluxo real de ChatGPT Actions (prova sanitizada)

Prova pública sanitizada do fluxo real de Actions da segunda explicação do curso *Do sinal à decisão: como representamos situações para prever o que acontece depois*. A fonte visual é a explicação na superfície de autoria; este recorte **não** contém Unidade de estudo, Estudo, prática nem validação humana.

Consentimento pontual, operado por Codex sob mandato do proprietário: autorização de trabalho autônomo apenas nesse curso ("Permitir uma vez"), incluindo corrigir o que foi produzido, sem alterar preferências gerais e sem registrar aprovação humana. Não houve pessoa revisando a produção neste momento, e esta prova **não** afirma consentimento total único nem aprovação humana.

## Sequência real

Registro de servidor (logs de borda), 35 chamadas `ChatGPT-User/1.0`, todas `200`, entre 2026-09-26T23:50:08.227Z e 2026-09-27T00:05:11Z. Identificadores de conta, links privados, headers, IP e cookies foram omitidos.

| UTC | operação |
| --- | --- |
| 23:50:08 | `retomar_curso` |
| 23:50:13–23:50:48 | `consultar_planejamento` e `exportar_autoria` ×5 |
| 23:50:52–23:53:20 | `consultar_componentes` ×10, com `desenho_instrucional` em 23:52:57 |
| **23:54:15.388** | **`salvar_explicacoes`** — criação da segunda explicação |
| 23:54:21–23:54:45 | `preparar_revisao` ×4 |
| **23:55:35.773** | **`aplicar_correcoes`** — primeira correção |
| 23:55:42 | `preparar_revisao` |
| 00:00:43.951 | `retomar_curso` — releitura |
| 00:00:49–00:01:15 | `preparar_revisao` ×5 e `consultar_componentes` |
| **00:04:39.749** | **`aplicar_correcoes`** — segunda correção |
| 00:04:47–00:05:11 | `preparar_revisao` ×4 |

A conversa real tem 2 pedidos — criação e salvamento da explicação e correção a partir de captura real — e os links da conversa foram omitidos. Os dois pedidos literais ficam preservados, sem raciocínio intermediário, em `conversa.promptsLiterais` de [exp2-actions-fluxo-real-sanitizado.json](exp2-actions-fluxo-real-sanitizado.json).

## Exportação após a correção

Contagens do export completo, sem copiar o conteúdo: contrato `aralearn.course-authoring-export.v2`, revisão **19**, 8 módulos, 24 microssequências, **0 unidades de estudo** e 2 explicações — *Qual plano realmente compensa?* (5 blocos) e *Quando a comparação muda?* (20 blocos, ~11.143 caracteres).

Três métricas distintas, sem tratá-las como divergência: os **fragmentos originais somam 61.838 caracteres** (métrica registrada pela raiz Codex); a minha reserialização compacta do export completo mede 61.818 caracteres; o arquivo pretty em disco tem 119.426 bytes.

A exportação integral não é copiada aqui: continha referências operacionais e histórico privado; só contagens, títulos e tempos entram nesta prova.

## Calculadora

O JSON bruto registra o texto visível do diálogo, incluindo o rótulo `Expressão` e o resultado `192`, em 2026-09-27T00:12:40.292Z, viewport 390×844, foco em `Calcular`. Essa primeira leitura de texto não inclui o valor do input e não demonstra que o aplicativo o substituiu. A raiz Codex digitou `24+(32-4)*6` durante o ensaio. O foco voltou ao acionador em 00:17:43.754Z (44×44 em x17, y206,7).

A primeira captura da calculadora falhou, mas a limitação foi resolvida: `exp2-actions-390-calculadora-recuperada.jpg` mostra a expressão `24+(32-4)*6` e o resultado `192`. O JSON da repetição traz `result: null` porque o seletor de resultado pode vir nulo; o diálogo literal registra `192` e a imagem confirma o valor visível.

## Interações verificadas

Tabela *Como as regras mudam por faixa*: conteúdo de 603 px numa área visível de 356 px; rolada até `scrollLeft 247` = máximo 247 (`atRight`), com `documentOverflow: false` e a **última coluna integral** dentro do viewport — as seis células ficam em x 7,83 e right 367,39 num viewport 390×844 (2026-09-27T00:28:46.492Z).

Fechar a explicação: nenhum diálogo nativo restante e foco devolvido ao botão *Explicação de Quando a comparação muda?* (44×44 em x322, y375,83), confirmado pelo controle por acessibilidade no mesmo turno (2026-09-27T00:29:31.918Z).

Captura visual: a primeira tentativa pela ferramenta de DevTools falhou e a falha histórica permanece registrada; a limitação atual foi resolvida pela recuperação no Chrome normal, na mesma aba 103, com bytes salvos pela API de screenshot e gravados em disco. As repetições de 00:37:31.445Z (calculadora) e 00:39:47.738Z (tabela, `left 247 = max 247`, `docOverflow: false`) confirmam os dois estados, e as imagens recuperadas foram inspecionadas pixel a pixel antes de entrarem nesta prova. Nenhum PNG foi inventado.

## Capturas

| arquivo | medidas | bytes | sha256 |
| --- | --- | --- | --- |
| `exp2-actions-1920-grafico-antes.png` | 1920×855 | 161.240 | `240ab5f5a3cd9a9704c6a6d55f30ce685837eee5244e8648002c13a5bb9c7eca` |
| `exp2-actions-390-grafico-1-apos.png` | 390×844 | 89.441 | `8d796cde69bd9feba95bcf9363e893a793fbbea0ed01c8cdd19e9ff4aff4b94d` |
| `exp2-actions-390-grafico-2-apos.png` | 390×844 | 71.339 | `299db451e6a65ecd9b7a250ac27a39c7fdb62d0f83ba9d27c77f395ef87aac2e` |
| `exp2-actions-390-grafico-3-apos.png` | 390×844 | 79.124 | `e1e9a927ce143d8b77bf873d9d0c0f59675ad9f43f8e3acb805cec60a220828f` |
| `exp2-actions-390-calculadora-recuperada.jpg` | 390×844 | 31.932 | `7762f9ca4cc5c9e7ef4fb0eefa04398bfd383959c25b5c15f68c0fe85447e1db` |
| `exp2-actions-390-tabela-esquerda-recuperada.jpg` | 390×844 | 57.674 | `a20d65b8187dc24244cddfcdc2db89dbbe9af787673298ad212edd6566141f26` |
| `exp2-actions-390-tabela-direita-recuperada.jpg` | 390×844 | 59.073 | `821a8f3c6be1cc51fe7e755c2d86f8f3ad7d0a4785634d7e71e75016163a0fe0` |
| `exp2-actions-390-lista-retorno.jpg` | 390×844 | 20.120 | `e176f076d25938dd5378ed02a74b183113ddb1552c421a1eee840c676de0ab7c` |
| `exp2-actions-320-cruzamento-inicial.jpg` | 320×844 | 40.265 | `a432284edd7599528bc31522ec43d1b8a25da6e2da7e4c26854cd24e55bddd9c` |
| `exp2-actions-430-cruzamento-final.jpg` | 430×844 | 53.404 | `c2bf6ef17ab309a2f5c9b8942b8324af0af237f0b3e94594ba69cc7c82cc965a` |
| `exp2-actions-1280-visao-geral-real.jpg` | 1280×900 | 74.092 | `f6b63b28341f168e4e4de98079aa05bd37d333a3e7a33a62c9f95ce0df94aee0` |

As capturas mostram a Explicação autoral — gráfico, calculadora e tabela — e a lista de microssequências; nenhuma delas expõe nome, conta, token ou dado de terceiros. A captura nomeada `1280` mede na verdade 1920×855 e por isso não foi copiada nem rotulada como 1280.

As quatro capturas recuperadas foram entregues com extensão `.png` na origem, mas os bytes são JPEG JFIF (`ff d8 ff e0`); por isso a cópia pública usa `.jpg` e mede 390×844. A captura da lista confirma "Nenhuma unidade de estudo materializada", coerente com as 0 unidades do export.

As três capturas de viewport seguem o mesmo padrão de bytes (JPEG JFIF com nome `.png` na origem; cópia pública `.jpg`) e vêm de emulação real no Chrome normal: **320×844** no cruzamento inicial (medição de DOM feita pela raiz Codex: sem overflow, plot de 286 px), **430×844** no cruzamento final (`actions-exp2-430-geometria.json`: sem overflow, plots de 396 px) e **1280×900** na visão geral (`actions-exp2-1280-geometria.json`: sem overflow, diálogo de 430 px, plots de 386 px).

Limites deste lote: a cobertura é a dos conjuntos realmente capturados — inicial em 320, final em 430, visão geral em 1280 e os três gráficos de 390 já registrados. Não afirmar que todos os gráficos foram vistos em todas as larguras. A runtime 0.0.85 publicada ainda carrega a chave geométrica antiga; a correção do pacote `plane` é local e aguarda publicação.
As interações e a recuperação das capturas estão registradas em `interacoes` e `recuperacaoDeCaptura` no JSON desta prova, com os hashes das fontes.

## Limites

- Logs de borda são diagnóstico de engenharia: comprovam chamada e status, não autoria nem qualidade pedagógica.
- Zero unidades de estudo: **a prática ainda está ausente**; não há evidência de aprendizagem.
- O que existe é a explicação salva e corrigida na superfície de autoria, não uma jornada de Estudo.
- Nenhuma aprovação humana foi registrada; produzir não aprova.

Fonte bruta sanitizada: `.tmp/agent/revisao-v10/actions-exp2-*` (hashes em `exp2-actions-fluxo-real-sanitizado.json`).
