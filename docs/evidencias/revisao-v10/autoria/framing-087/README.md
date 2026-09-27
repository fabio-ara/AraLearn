# Espaçamento compartilhado de leitura — candidata 0.0.87

A inspeção viva da primeira explicação na 0.0.86 mostrou sete parágrafos consecutivos sem separação. O fim do primeiro recurso, em y = 514,546875 px, coincidia com o início do segundo. A [captura hospedada anterior](../ms1-actions-086-rev74-explicacao.png) preserva esse estado. Esta prova da correção é local, em fixtures sintéticas; ainda não confirma a publicação.

## Mecanismo

O renderer comum passou a organizar os recursos com o espaçamento de leitura já usado pela Unidade: 8 px. A Explicação no Estudo e a inspeção autoral recebem a mesma organização. Foram retiradas a margem específica da Explicação e a regra que zerava o espaçamento na inspeção. O contêiner vazio não é emitido quando só existem ferramentas transferidas à barra de ações.

A revisão mede três intervalos de 8 px entre prosa, prosa, notação rica e tabela. Uma sonda instrumentada que zerou o espaçamento no mesmo fixture voltou a produzir três intervalos de zero. Essa sonda isola o efeito da regra; não é execução do checkout antigo. A evidência anterior independente é a observação da versão hospedada.

## Provas

| Conjunto | Resultado | O que verifica |
| --- | --- | --- |
| Inspeção da explicação | 4/4 | 320, 390, 430 e 1280 px; separação, notação, tabela, edição sem mudança de geometria, foco e ações de 44 px |
| Explicação no Estudo | 4/4 | Mesmas larguras; recursos consecutivos, início, overflow, Escape e retorno de foco |
| Unidade e Explicação com os mesmos recursos | 4/4 | Igualdade dos intervalos, ausência de overflow do host, abertura/fechamento e foco |
| Regressão de inspeção e Explicação | 60/60 | Specs completas pertinentes |
| Regressão de edição manual e superfície v7 | 74/74 | Edição e leitura dos consumidores compartilhados |
| Caso de renderer com ferramentas | 1/1 | Conteúdo preservado e ausência de contêiner vazio quando as ferramentas vão à barra |

As contagens se sobrepõem: os testes focais também integram as specs completas. ESLint e auditoria de estilos passaram. A raiz removeu uma asserção estática que repetia o texto do CSS; a geometria efetiva continua coberta no navegador.

Os comandos reproduzíveis são:

```text
npm run test:e2e -- tests/e2e/course-microsequence-review.spec.js -g "base explicativa separa recursos consecutivos"
npm run test:e2e -- tests/e2e/study-explanation.spec.js -g "recursos consecutivos da Explicação"
npm run test:e2e -- tests/e2e/course-catalog-study.spec.js -g "mesmo ritmo entre recursos"
npm run test:e2e -- tests/e2e/course-microsequence-review.spec.js tests/e2e/study-explanation.spec.js
npm run test:e2e -- tests/e2e/manual-study-unit-edit.spec.js tests/e2e/revisao-v7-study-surface.spec.js
node --test tests/runtime/reading-resource-framing.test.js
```

## Capturas

As larguras são CSS; o bitmap usa a densidade do dispositivo emulado. Cada captura da Unidade foi feita com a ausência de modal conferida. Uma rodada anterior nomeava imagens da Explicação como se fossem da Unidade; foi preservada como tentativa privada e substituída pelas imagens abaixo.

| Largura | Unidade | Explicação no Estudo | Inspeção autoral |
| --- | --- | --- | --- |
| 320 px | [Abrir](unidade-320.png) | [Abrir](explicacao-320.png) | [Abrir](revisao-320.png) |
| 390 px | [Abrir](unidade-390.png) | [Abrir](explicacao-390.png) | [Abrir](revisao-390.png) |
| 430 px | [Abrir](unidade-430.png) | [Abrir](explicacao-430.png) | [Abrir](revisao-430.png) |
| 1280 px | [Abrir](unidade-1280.png) | [Abrir](explicacao-1280.png) | [Abrir](revisao-1280.png) |

As 12 combinações foram inspecionadas visualmente pelo agente executor, com amostra de quatro capturas revista pela raiz. A separação e o início do conteúdo ficaram consistentes; os controles permaneceram visíveis. Isso constitui evidência visual autônoma, sem aprovação humana.

Os testes usam Chromium headless e tema claro. Tabelas continuam com rolagem horizontal própria; partes fora da captura não são declaradas inacessíveis. Screenshots não substituem as asserções de interação nem comprovam persistência no serviço. A conferência hospedada do novo curso permanece necessária.

Nenhum resultado desta intervenção constitui validação humana pós-correção.
