# Base de auditoria compartilhada no contexto humano — 0.0.88

A revisão de uma unidade e de sua Explicação repetia a base integral da microssequência em cada alvo. A completude dessa base é necessária para inspecionar relações, prática, configuração e dependências; repetir seus mesmos valores dentro da mesma resposta lógica não acrescenta evidência.

`preparar_revisao` e `retomar_curso` focal passam a distribuir essa base uma vez por foco, na montagem comum a MCP e Actions, antes da projeção de metadados e da paginação. O helper `courseHumanAuditContext.js` usa a identidade interna do curso e da microssequência, a revisão da leitura e a igualdade literal dos campos compartilhados. Títulos iguais não agrupam microssequências diferentes. Bases ou instruções diferentes permanecem em focos separados, mesmo quando a identidade é a mesma.

## Contrato de leitura

O contexto contém `auditoriasPedagogicas`, uma lista local de focos. Cada entrada tem `foco`, `basis` e a `instruction` recebida. São compartilhados somente os campos existentes `audience`, `planItems`, `studyUnits`, `dependencies` e `microsequence`. A coleção `basis.studyUnits` continua inteira, com conteúdo, aplicação e configuração; a transformação não muda ordem, parâmetros, declarações ou texto.

Cada alvo conserva `auditoriaPedagogica`, com:

- `foco`: chave derivada para a base desta página lógica;
- `basis`: `targetKind`, suas próprias `citations` e quaisquer outros campos não compartilhados;
- `units`: observações derivadas específicas daquele alvo;
- demais campos recebidos, sem substituição por uma lista fechada.

Conteúdo externo, estados e referências opacas de revisão/inspeção continuam no alvo. `leituraDaAuditoria` orienta a leitura conjunta da base focal e dos dados do alvo. As citações continuam no caminho `auditoriaPedagogica.basis.citations`, com seus vínculos, âncoras e ocorrências; não são unidas às de outro alvo.

`foco` não é um input de autoria nem representa ordem curricular. O produtor lê o contexto e usa a `referenciaInspecao` já fornecida para registrar o parecer. Não calcula hashes nem reenvia a base. Cada página lógica entrega os próprios focos completos; a chave não serve para resolver uma referência em outra página, chamada ou revisão. Sem identidade interna disponível, o helper conserva a auditoria recebida e não tenta agrupá-la por título.

## Limites da alteração

A base canônica por alvo, RPCs, hashes, `registrar_inspecao`, validadores e UI permanecem intactos. As referências são geradas a partir da leitura canônica antes do compartilhamento. O registro continua relendo essa base, verificando o hash e aplicando os checks existentes.

A [integração posterior da auditoria](auditoria-representacoes-088.md) acrescentou diagnósticos formais BPMN e corrigiu a fronteira do filtro humano: envelopes aceitos pelo registry conservam integralmente seus dados disciplinares, enquanto metadados operacionais externos continuam filtrados. A igualdade integral após os canais é dos envelopes validados; a reconstrução da base pelo helper é anterior a esse filtro. A medição histórica abaixo isola o compartilhamento e não mede o tamanho da nova leitura hospedada.

O contexto é aberto nos contratos de saída existentes. Não foram acrescentados inputs, schemas, descrições de ferramentas, regras pedagógicas ou quotas de formatos. A orientação de fontes existente permanece aplicável porque as citações continuam associadas ao alvo. O catálogo e o OpenAPI não precisaram ser regenerados.

O compartilhamento é local à montagem da resposta. Não há cache entre chamadas, redução de consultas ao backend, resumo de conteúdo ou mudança nos limites do paginador. Um foco com somente um alvo pode ganhar alguns caracteres de estrutura; a forma de leitura permanece uniforme. A economia ocorre quando há repetição da base dentro da página lógica.

## Provas focais

Os testes de contexto demonstram reconstrução estrutural exata das bases por alvo, preservação de campos adicionais e de `null`, distinção entre campo ausente e presente, manutenção de parâmetros e ordem, separação de microssequências com o mesmo título e isolamento de bases/instruções diferentes.

Fixtures com fontes não vazias verificam URLs, âncoras selecionadas, passagens, ocorrências e citações distintas por alvo. Testes dos handlers locais comprovam que as referências opacas continuam derivadas da leitura canônica integral e que MCP/Actions devolvem o mesmo resultado em `preparar_revisao` e `retomar_curso` focal. Não são chamadas a um serviço hospedado.

A paginação real preservou texto literal, limites de 12.000 caracteres/16 KiB e rejeição por digest/curso/revisão alterados. Uma segunda página lógica trouxe suas bases completas e chaves locais, sem depender da primeira. As provas existentes de consulta alterada e paginação de fontes também passaram.

Comandos executados no recorte:

```text
npm.cmd run test:focal -- tests/runtime/course-human-audit-context.test.js tests/runtime/course-human-read-context.test.js
node --test --test-name-pattern="segunda página lógica|revisão e retomada focal" tests/runtime/course-human-read-context.test.js
node --test --test-name-pattern="catálogo MCP publica|resultado comum é curto|OAuth, respostas e orçamento" tests/runtime/course-human-mcp.test.js tests/runtime/chatgpt-action-human-schema.test.js
```

A execução inicial passou 27 casos; após acrescentar a prova da segunda página e ajustar a fixture, os dois casos afetados passaram, totalizando 28 casos distintos de contexto. Os três casos de contrato/orçamento também passaram. A expectativa de base compartilhada falhou antes da implementação e passou depois. O novo teste da segunda página foi ajustado à seleção preexistente de Explicações da consulta sem filtro, sem mudar essa seleção no produto.

## Medição do corpus focal

O corpus completo de uma unidade e uma Explicação tem SHA-256 `d858952a81363d07d69a9d13026e3c1cb6d09b4d94f92d44fa614206910cd43e`. A medição usou o helper implementado e o paginador real, localmente. Como a captura já havia removido identidades internas, foi fornecida uma identidade sintética para o único foco conhecido, removida antes da paginação. Não se extraiu identidade ou proveniência de referência de unidade. Curso/revisão de paginação também foram sintéticos e iguais nos dois lados; não se afirma uma nova leitura hospedada.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Contexto lógico, caracteres UTF-16 | 216.623 | 142.727 |
| Contexto lógico, bytes UTF-8 | 220.487 | 145.367 |
| Fragmentos do paginador real | 21 | 14 |
| Maior contexto de fragmento, caracteres | 12.000 | 12.000 |
| Maior contexto de fragmento, bytes | 12.337 | 12.305 |
| Soma dos contextos de fragmentos, caracteres | 241.853 | 158.873 |

Economia líquida de **73.896 caracteres (34,11%)**, incluindo a nova estrutura e a orientação de leitura. A reconstrução passou em igualdade estrutural integral e conservou as dez unidades da base. Os limites de envelope não aumentaram; os handlers locais também permaneceram abaixo do limite Actions de 100.000 caracteres.

O resultado demonstra redução de transporte, não melhora de latência ou de julgamento. Não explica por si falhas anteriores de autoria nem certifica a qualidade pedagógica do curso. Testes pesados, integração hospedada e estabilização da candidata pertencem às fases seguintes.
