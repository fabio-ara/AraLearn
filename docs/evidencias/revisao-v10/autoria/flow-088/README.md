# Fluxogramas — candidata 0.0.88

Prova local com dados controlados, produzida em 27/09/2026 sobre o commit-base `f874637367042b5a14c30dc8cca5cb9b85f2a92c` e o delta da candidata. Não é prova de publicação nem validação humana.

O compilador deixa de criar uma junção quando todos os ramos terminam. O renderer mede a fonte efetiva dos rótulos de aresta, sem alterar a autoria ou as caixas dos nós. O baseline preservado privadamente mostrava “Autorizado” quebrado em “Autorizad” e “o”: a caixa Graphviz tinha 77,58 px e a largura CSS necessária era 81,02 px. A correção mantém uma linha nesse caso e permite várias linhas em arestas longas.

Reprodução:

```sh
node ./scripts/runE2eTests.mjs tests/e2e/flow-viewport.spec.js --workers=1 --retries=0
node ./scripts/runE2eTests.mjs tests/e2e/course-catalog-study.spec.js --grep "Flow com dois ramos" --workers=1 --retries=0
```

Passaram seis testes de viewport e um integrado de catálogo. O primeiro conjunto inclui fonte maior, aresta longa com CJK/árabe e métrica local no zoom de 1,25×. O integrado exerce Unidade e Explicação em 320, 390, 430 e 1280 px, abertura de tela inteira, zoom, Escape e retorno de foco; as capturas são gravadas pelo `testInfo.outputPath` do Playwright.

O [manifesto](manifesto.json) identifica as 16 capturas e seus hashes. A raiz inspecionou visualmente as oito capturas normais e quatro ampliadas: Unidade 320/430, Explicação 390/1280. As demais foram preservadas, sem atribuir a elas inspeção visual individual da raiz. A largura conceitual no host web permanece móvel. As laterais que excedem a janela não demonstram perda de conteúdo; pan e zoom continuam previstos. Os screenshots sozinhos não comprovam essas interações, cuja sequência está no teste.

Exemplos: [Unidade em 320 px](unidade-320-normal.png), [Explicação em 390 px](explicacao-390-normal.png), [Explicação em tela inteira no host web](explicacao-1280-fullscreen-zoom.png).

Limites: Chromium local, dados de fixture, sem prova hospedada deste delta e sem certificação de todas as fontes/browsers. Nenhum resultado desta intervenção constitui validação humana pós-correção.
