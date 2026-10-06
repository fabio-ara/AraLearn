# Incidente de integração MCP do AraLearn (outubro de 2026)

## Resumo

Uma sessão de autoria pelo conector MCP sofreu indisponibilidades recorrentes de leitura do curso e um fluxo de auditoria interrompido. A investigação separa o que está comprovado do que segue aberto. Estão corrigidos no código o envelope JSON-RPC de erro, o schema público de saída, a criação atômica de fonte e o replay equivalente de source-flow; a aceitação implantada dessas correções continua pendente. Permanecem abertos o campo de erro acrescentado pela camada do conector e a correlação das falhas do provedor de chaves, que cobre quatro das vinte e duas falhas e não as explica por inteiro.

## Ambiente, versão e recibos

A base observada é o commit `97923a6390e082e0fa8292c93c78f680cc665cee`, na versão `0.0.100`; a candidata `0.0.101` é o alvo do gate final. O manifesto de runtime lido em modo somente leitura informa `schemaRevision` `20260930010000`, `contractVersion` `1` e 55 recursos, compatível com o esperado.

O recibo da preparação local (commit [416d8d68](https://github.com/fabio-ara/AraLearn/commit/416d8d68e83d55cfcc884c35e9a19af3f0cc0f8b)) registrou aprovação nas cinco etapas: preflight 25090 ms, lint 40516 ms, contrato 4587 ms, runtime 832528 ms e Android 40189 ms. O runtime somou 2741 testes, 2726 aprovados, nenhuma falha e 15 ignorados, e os oito testes do incidente passaram. Numa preparação anterior, três casos falharam — orçamento do catálogo MCP e dos recursos Edge, linguagem de interface e documentação pública, e uma guarda estática de borda — e foram corrigidos. A proteção dos logs foi verificada por 64 testes focais de privacidade e MCP, incluindo casos com valores maliciosos.

## Integração contínua protegida

A [execução protegida 37411192536](https://github.com/fabio-ara/AraLearn/actions/runs/37411192536), no commit 416d8d68 e na tentativa 1, terminou com falha; o [PR 429](https://github.com/fabio-ara/AraLearn/pull/429) segue em rascunho, sem implantação nem merge. As falhas são de web e de banco, e não são atribuídas ao MCP.

- Web: a escala do zoom era exibida imediatamente, mas sua memória só era gravada no quadro seguinte; um novo render podia remover o canvas antes dessa gravação. O modo expandido também anunciava prontidão antes de restaurar a posição. A correção grava a escala e a posição projetada de forma síncrona, respeita os gestos mais recentes e só anuncia prontidão depois de restaurar a posição. São 16 testes focais aprovados em duas especificações, com três reproduções que falhavam antes e passam depois; a CI segue pendente de nova execução.
- Banco, verificação 009: a CI esperava uma revisão de schema anterior; a contagem de 55 recursos passou e revelou um recurso novo no campo errado. A correção de SQL congelada migra requiredFeatures para features, chegando a 56 recursos (55 mais 1).
- Banco, verificação 024: a nova guarda de versão usava `40001`; o teste detectou uma ocorrência quando esperava zero. A correção usa `PT409` e captura tanto conflito de negócio quanto falha nativa de serialização, mantendo o envelope HTTP 409. A expectativa de envelopes passou de oito para nove com o novo pacote. Os testes acrescentados verificam conflito de versão, falha nativa e ausência de revisão ou recibos parciais.
- Banco local: 52 features e uma guarda de mídia anterior impedem executar o agregado 009/024 por inteiro; as provas focais do bundle passaram e a sonda de manifesto TX passou. Uma execução de CI fresca é exigida.
- Não executados: downstream Supabase, current-local-smoke e certificados permanecem bloqueados por ausência de execução.

A prova local não é validade hospedada. As correções de SQL e de web estão congeladas e a CI segue pendente de nova execução. A matriz final dos vinte cenários será atualizada após nova execução de CI e das provas nativas, preservando como bloqueado o que ainda não tem caminho real.

## Causas e correções comprovadas

Na indisponibilidade de autenticação, o envelope JSON-RPC passou de -32600 para -32000. Antes, o identificador JSON-RPC era devolvido como nulo nessas falhas; agora é preservado. O serviço também gera um identificador de requisição para correlação e informa a fase da falha. Parse usa -32700, requisição inválida usa -32600 e recusa de autenticação usa -32001.

O schema público de saída foi corrigido no código: a saída passou a ter raiz do tipo objeto com `oneOf` de sucesso e erro. O contrato original exigia `result`, `deepLink` e `nextDecision` também na saída de erro; não havia raiz divergente. Falta apenas a aceitação implantada.

A criação de fonte passou a usar um bundle atômico no domínio, no adaptador e na migração `20261005120000_atomic_course_source_bundle.sql`. A prova por RPC real local cobre apenas esse bundle: 74 gravações de fonte, 74 fatos e 206061 bytes.

O replay equivalente de source-flow foi comprovado em 19 de 19 casos, em prova local de handler e stub. Essa prova é separada da anterior; não é prova de MCP nem de autenticação. A borda local falhou por DNS, portanto não há prova de borda nesta frente.

## Causa correlacionada do provedor de chaves

Quatro pares de falha 504 do endpoint de chaves antecedem quatro das vinte e duas falhas do gateway MCP. A correlação cobre quatro falhas e não explica as vinte e duas; nenhum limite rígido de volume é inferido dessa janela. As chamadas HTTP malsucedidas duraram entre 5 e 14 segundos, e o valor de 58 a 72 ms registrado é tempo de CPU utilizado, não a duração da função.

## Taxonomia de erro, transitórios e schema público

A taxonomia corrente do serviço distingue indisponibilidade transitória, conflito de estado e entrada inválida. Uma prova nativa consultou um curso sintético inexistente e recebeu `human_reference_not_found` com `retryable: false`, confirmando a classificação própria; em falhas transitórias o serviço responde `temporarily_unavailable` com `retryable: true`.

O campo `error_code: INVALID_ARGUMENT` não existe no código do AraLearn e não aparece na saída nativa local do canal MCP; ele é acrescentado pela camada do conector, e a causa externa permanece não fechada.

## Atomicidade da fonte e replay externo

A gravação parcial de fonte relatada historicamente não teve causalidade comprovada, o que não bloqueia a prova atual: a atomicidade está verificada no bundle e no RPC real local, e o replay equivalente foi verificado em 19 casos locais. O replay externo de um resultado incerto, na repetição pelo cliente sem duplicar a operação, permanece pendente de prova hospedada.

## Matriz de verificação dos vinte cenários

A coluna Resultado usa exatamente quatro estados: APROVADO (prova executada no gate pertinente), FALHOU (prova executada com falha), NÃO APLICÁVEL (com justificativa) e BLOQUEADO (com motivo). A coluna Evidência indica o gate que sustenta o estado: local, freshCI (candidate) ou native.

| Cenário | Resultado | Evidência | Motivo ou limite |
| --- | --- | --- | --- |
| T01 caminhos mínimos do curso | BLOQUEADO | local aprovado no candidato; native pendente | coerência antes e durante o transporte depende de prova hospedada |
| T02 taxonomia de erro e retry | BLOQUEADO | local | campo externo ainda aberto |
| T03 retomada após falhas e reinício | APROVADO | candidate, 8 testes do incidente | prova local |
| T04 integridade da remontagem | APROVADO | candidate, 8 testes do incidente | prova local |
| T05 páginas lógicas e temMais | APROVADO | candidate, 8 testes do incidente | prova local |
| T06 bloqueio de parecer com escopo incompleto | BLOQUEADO | native | exige espião de orquestração com zero registrar_inspecao antes da completude, manifesto e rastro do fluxo; não é guarda global do servidor |
| T07 recortes explícitos e união | APROVADO | candidate, 8 testes do incidente | prova local |
| T08 conflito ao alterar conteúdo durante a auditoria | APROVADO | candidate, suíte executada | rejeição da referência antiga sem escrita em [decisões de autoria](../tests/runtime/course-human-authoring-decisions.test.js); releitura da base atual e registro novo válido em [inspeção pglite](../tests/runtime/course-ai-inspection-pglite.test.js) |
| T09 dependências bibliográficas da base | APROVADO | candidate, suíte executada | [fontes, citações e estilo invalidam somente consumidores pertinentes](../tests/runtime/course-ai-inspection-pglite.test.js): fonte vinculada invalida, fonte não vinculada e alvo não pertinente permanecem atuais, sem fila duplicada |
| T10 evidência literal e seis dimensões | APROVADO | candidate, 8 testes do incidente | prova local |
| T11 idempotência do parecer | APROVADO | candidate, suíte executada | prova local |
| T12 fonte criada após falha | APROVADO | local e RPC real local | atomicidade do bundle e replay equivalente em 19 casos locais; a causalidade histórica não reproduzida não bloqueia esta prova, e a aceitação hospedada segue pendente |
| T13 limite de 32 vínculos | APROVADO | candidate, suíte executada | prova local; aceita 32 e recusa 33 antes de gravar, preservando fonte, âncora, papéis e identidades |
| T14 retomada preserva identidades | APROVADO | candidate, suíte executada | prova local |
| T15 ida e volta de aplicação e configuração | APROVADO | candidate, suíte executada | prova local |
| T16 reconciliação da Explicação | APROVADO | candidate, suíte executada | prova local |
| T17 inspeção de IA não aprova humano | APROVADO | candidate, 8 testes do incidente | prova local |
| T18 ausência de mutação em leitura e exclusividade do fluxo | BLOQUEADO | native | exige no máximo uma chamada em voo, snapshot antes e depois das leituras puras e transferência com checkpoint; exclui a negociação de mandato de retomar_curso das leituras puras |
| T19 leitura formal grande com base própria | APROVADO | local, candidate (preparação local, commit 416d8d68) | runtime-focal.log: volume de 3112669 caracteres (3468023 bytes), 4 páginas, 289 fragmentos, latência de 117,6 a 370,2 ms por chamada e 50,9 s no total, pico de RSS 579 MB e de heap 415,7 MB, cada chamada até 13,5 KiB; interface hospedada pendente |
| T20 aceitação ponta a ponta após interrupção | BLOQUEADO | native | três passagens passaram no handler MCP local; interface real pendente |

## Mapa de consumidores e provas

| Módulo | Consumidores | Provas |
| --- | --- | --- |
| `courseHumanReadContext.js` | executor humano de leitura e continuação | [leitura de contexto](../tests/runtime/course-human-read-context.test.js), teste adicionado |
| `courseHumanTasks.js` | gateway MCP e servidor de Actions | [canal MCP](../tests/runtime/course-human-mcp.test.js), teste adicionado |
| `courseContentReviewReference.js` | registro de inspeção | [decisões de autoria](../tests/runtime/course-human-authoring-decisions.test.js), teste adicionado |
| `coursePedagogicalAudit.js` | registro de inspeção | [auditoria pedagógica](../tests/runtime/course-pedagogical-audit.test.js), teste adicionado |
| `mcpServer.js` | gateway MCP hospedado | teste adicionado na fronteira do `error_code` |

## Provas locais executadas

O teste adicionado em [oito cenários do incidente](../tests/runtime/course-human-integration-incident.test.js) constrói em memória um curso com 47 unidades, uma Explicação extensa e 32 fontes, sem copiar conteúdo real. Ele verifica a leitura formal completa, a união de identificadores por recortes explícitos, a retomada pelo mesmo cursor após falhas antes e depois da montagem, o reinício do cliente, fragmentos com caracteres fora do plano básico, lacuna, duplicata, `temMais`, a exigência das seis dimensões com evidência literal, a separação entre inspeção de IA e revisão humana, a recusa de referência obsoleta e a ausência do campo `error_code` na saída local. A prova de capacidade usou um teste já existente de recuperação de transporte.

Na preparação local (commit 416d8d68), o cenário de escala mediu 3112669 caracteres de volume em 3468023 bytes, 4 páginas e 289 fragmentos, com latência de 117,6 a 370,2 ms por chamada e 50,9 s no total, pico de RSS de 579 MB e de heap de 415,7 MB, e cada chamada dentro de 13,5 KiB, confrontando por alvo o percurso completo com os recortes 1–7, 8–27 e 28–47 na mesma fixture. A prova levou 100,8 s. Esse é o orçamento empírico, sem limite de latência imposto. O relatório, os caminhos e as limitações desta frente ficam no piso privado de trabalho, sem identificadores reais de curso.

## Pendências hospedadas

A execução de ponta a ponta pela interface de integração real, a demonstração de leitura íntegra do curso em produção e a confirmação do comportamento do campo `error_code` após a implantação dependem de ambiente hospedado e credenciais autorizadas. Nenhuma dessas etapas foi executada ou presumida aqui.

## Limitações e cuidados

As correções estão fechadas no código e nos testes, mas não implantadas; nenhuma aceitação hospedada é declarada. O servidor não comprova consumo intelectual; a garantia de leitura completa antes do parecer pertence ao cliente de autoria. As contagens de disponibilidade descrevem a janela observada e não são uma taxa geral. Resultados hospedados permanecem separados dos locais.
