# Viewport de diagramas e cartão da Home — revisão v10

Esta evidência fecha a UI local do recorte 091. O runtime foi gerado pelo runner E2E em perfil Playwright isolado; não é uma captura do site publicado.

## Tela inteira na Explicação

O caso focal exercita, nos fixtures reais de Explicação e nos pacotes `container` e `guarded-machine`, pan inline, abertura da tela inteira, pan+zoom dentro do diálogo, fechamento, reabertura e segundo fechamento. A posição inline, escala e centro do conteúdo permanecem; o foco volta ao acionador após cada fechamento.

Prova: `npm run test:e2e -- tests/e2e/revisao-v10-diagram-viewport-position.spec.js` → **6 passed**: quatro casos da Unidade e dois casos explícitos da Explicação, um por diagrama. A implementação compartilhada está em `src/resources/sdk/diagramViewport.js` e no espelho de runtime. A seleção adjacente `revisao-v10-diagrams.spec.js` passou em 15 casos; `tests/runtime/diagram-viewport.test.js`, em quatro. A mudança preserva essas provas anteriores.

## Cartão de curso na Home — perda de conteúdo não demonstrada

O cartão em 390 px mantém uma região própria rolável (`.home-course-preview-copy`) por contrato de leitura. Uma prova diagnóstica local com conteúdo sintético e CSS original focou a região, pressionou `End`, confirmou rolagem positiva e a presença do fim da descrição e da linha de progresso no DOM. Também confirmou nome acessível e foco do controle Abrir: **1 caso passou**. O teste não mediu a posição visível desses textos e não comprova sozinho que a rolagem alcançou o fim. A estrutura rolável torna insuficiente a inferência inicial de perda de conteúdo; nenhuma alteração de Home é entregue.

Não há correção Home nesta folha; as três linhas próprias de CSS foram revertidas e o teste que exigia tudo visível sem rolagem foi descartado. O fundo proporcional azul permanece intencional.

Imagens originais representativas:

- [diagrama inline restaurado](viewport-091-diagram-container-inline-restaurado.png)
- [diagrama em tela inteira](viewport-091-diagram-container-tela-inteira.png)

Os hashes e bytes estão no [manifesto](viewport-e-cartao-091-manifest.json); o hash do conjunto é `c87d4502337c5179e1032e04368ac26ee106ad98b0e238425944c4a5952a3483`.

## Limites

As provas são locais, sem validação humana, publicação, CI, banco ou curso real. A largura estreita do diagrama continua exigindo zoom/rolagem conforme o desenho; a medição anterior mostrou que 0,8 já acomoda o maior nó em 320 px e 0,64 mostra os cinco nós inteiros. Nenhum `fit` forçado foi introduzido.
