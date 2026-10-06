# Incidente de integração MCP do AraLearn (outubro de 2026)

## Resumo

Uma sessão de autoria pelo conector MCP sofreu indisponibilidades recorrentes de leitura do curso e um fluxo de auditoria interrompido. A investigação separa o que está comprovado do que segue aberto. Estão corrigidos no código o envelope JSON-RPC de erro, o schema público de saída, a criação atômica de fonte e o replay equivalente de source-flow; a aceitação implantada dessas correções continua pendente. Permanecem abertos o campo de erro acrescentado pela camada do conector e a correlação das falhas do provedor de chaves, que cobre quatro das vinte e duas falhas e não as explica por inteiro.

## Ambiente, versão e recibos

A branch candidata incorporou a revisão documental da principal no commit [37b8705e](https://github.com/fabio-ara/AraLearn/commit/37b8705e8d25b1cd2c47e68e6941c0f3306cce01), preservando o trabalho do PR 428. A candidata `0.0.101` é o alvo da entrega. O ambiente hospedado observado continua na versão `0.0.100`, com `schemaRevision` `20260930010000`, `contractVersion` `1` e 55 capacidades. A candidata declara a revisão `20261005120000` e 56 capacidades; sua implantação permanece pendente.

O recibo da preparação local no commit 37b registrou aprovação nas seis etapas: preflight 11277 ms, lint 29268 ms, contrato 3294 ms, runtime 668569 ms, frontend 65260 ms e Android 57100 ms. O runtime somou 2741 testes, 2726 aprovados, nenhuma falha e 15 ignorados; o frontend teve 16 testes esperados, sem ignorados, inesperados ou instáveis, em 47816,237 ms. Numa preparação anterior, três casos falharam — orçamento do catálogo MCP e dos recursos Edge, linguagem de interface e documentação pública, e uma guarda estática de borda — e foram corrigidos.

## Integração contínua protegida

A [execução 37427004833](https://github.com/fabio-ara/AraLearn/actions/runs/37427004833), tentativa 1 no commit 4083e430, aprovou web, Android e as 906 asserções pgTAP. A etapa seguinte detectou quatro divergências no inventário de paridade: a restrição de recibos v18 e as duas funções do pacote atômico não estavam registradas, enquanto a restrição v17 substituída ainda constava no inventário. Os registros exatos foram atualizados nos casos existentes, sem isenções ou alteração de permissões; os 12 testes focais da paridade passaram. A integração real de API, RLS e MCP ficou sem execução nessa CI por causa da falha de paridade. O agregado reprovou e não produziu certificado; uma nova execução completa é necessária.

A [execução 37424182280](https://github.com/fabio-ara/AraLearn/actions/runs/37424182280), tentativa 1 no commit 37b8705e, foi cancelada após a falha comprovada no pgTAP 009, teste 26: "features do manifesto estão em ordem canônica". Das 906 asserções pgTAP, uma falhou. As listas contêm as mesmas 56 capacidades; a migração acrescentava a nova capacidade ao fim, em vez de sua posição na ordem canônica. A correção ordena a lista usando o padrão existente de SQL e conserva a asserção 009. Uma regressão focal executa o bloco SQL real e verifica ordem, conjunto completo, reaplicação e preservação de identidade, permissões, comentário e dados. Os quatro testes focais passaram. Android passou nessa CI, web foi cancelado e o agregado falhou; não há certificado promovível. O PR 429 voltou a rascunho e exige uma nova execução completa antes de integração e implantação.

A prova adicional de autoria atual passou integralmente com adapter e PostgREST reais em uma stack descartável, criada com as migrações correntes: 56 capacidades e paridade dos 738 objetos. Ela encontrou e corrigiu falhas na própria fixture de volume: o cache incluía uma unidade já excluída, e a unidade substituta precisava de posição positiva e proveniência explícita com o vínculo completo. As guardas de produto foram preservadas. O cenário aceitou o pacote agregado acima de 196608 bytes, releu 28 vínculos e recusou, pelo código exato `course_source_links_too_large`, vínculos acima de 131072 bytes no normalizador, usando a versão corrente do alvo. A asserção anterior de qualquer rejeição poderia aceitar um conflito de versão e foi substituída. A limpeza foi concluída, sem cursos, usuários ou fontes residuais da fixture.

Essa prova isolada não substitui a CI nem o caminho do ChatGPT. OAuth e canais MCP nessa porta adicional ficaram limitados pela metadata local que fixa a porta 54321; a execução padrão nessa porta segue obrigatória. O certificado da candidata, a nova CI completa e a aceitação hospedada continuam pendentes.

### Histórico: execução anterior

A [execução 37411192536](https://github.com/fabio-ara/AraLearn/actions/runs/37411192536), no commit 416d8d68 e na tentativa 1, terminou com falha, e o [PR 429](https://github.com/fabio-ara/AraLearn/pull/429) foi convertido em rascunho. As falhas foram de web e de banco, sem atribuição ao MCP. Na web, a escala do zoom era exibida imediatamente, mas sua memória só era gravada no quadro seguinte, e um novo render podia remover o canvas antes dessa gravação; o modo expandido anunciava prontidão antes de restaurar a posição. A correção grava a escala e a posição projetada de forma síncrona, respeita os gestos mais recentes e só anuncia prontidão depois de restaurar a posição, com 16 testes focais aprovados em duas especificações e três reproduções que falhavam antes e passam depois. No banco, a verificação 009 esperava uma revisão de schema anterior e a contagem de 55 capacidades revelou uma capacidade nova no campo errado. A nova guarda da verificação 024 usava `40001` onde a correção passou a usar `PT409`, com captura de conflito de negócio ou falha nativa de serialização, mantendo o envelope HTTP 409; a expectativa de envelopes passou de oito para nove.

A prova local não é validade hospedada. As correções de SQL e de web estão fechadas no código e a CI segue pendente de nova execução. A matriz final dos vinte cenários será atualizada após nova execução de CI e das provas nativas, preservando como bloqueado o que ainda não tem caminho real.

## Restauração e atualização (prova real)

A restauração e atualização de fixtures em contêineres isolados passou no commit 37b, sob o contrato `aralearn.backup-restore-upgrade-proof.v3`: seis migrações do corte histórico e 74 posteriores até `20261005120000`, com instalação limpa de 247 migrações convergente com a atualização. Foram preservados 13 grupos — planejamento, partes, curso, âncoras, fontes, entidades, orientação, itens de plano, parâmetros, anexos, vínculos, observações e decisões aplicadas — além de duas bases de autoria, seis alvos e um arquivo como metadado. Nenhuma migração ficou pendente após repetição; os contêineres descartáveis foram removidos. Esta prova preserva evidência de restauração dos dados e permissões em 37b. O delta posterior altera somente a ordem da lista do manifesto, verificada pela regressão SQL focal; a prova antiga não é apresentada como certificado da árvore nova. Objetos do Storage exigem cópia própria; este ensaio conserva seus metadados e não prova recuperação dos bytes desses objetos.

## Causas e correções comprovadas

Na indisponibilidade de autenticação, o envelope JSON-RPC passou de -32600 para -32000. Antes, o identificador JSON-RPC era devolvido como nulo nessas falhas; agora é preservado. O serviço também gera um identificador de requisição para correlação e informa a fase da falha. Parse usa -32700, requisição inválida usa -32600 e recusa de autenticação usa -32001.

O schema público de saída foi corrigido no código: a saída passou a ter raiz do tipo objeto com `oneOf` de sucesso e erro. O contrato original exigia `result`, `deepLink` e `nextDecision` também na saída de erro; não havia raiz divergente. Falta apenas a aceitação implantada.

A criação de fonte passou a usar um bundle atômico no domínio, no adaptador e na migração `20261005120000_atomic_course_source_bundle.sql`. A prova por RPC real local cobre apenas esse bundle: 74 gravações de fonte, 74 fatos e 206061 bytes.

O replay equivalente de source-flow foi comprovado em 19 de 19 casos, em prova local de handler e stub. Essa prova é separada da anterior; não é prova de MCP nem de autenticação. A borda local falhou por DNS, portanto não há prova de borda nesta frente.

## Causa correlacionada do provedor de chaves

Quatro pares de falha 504 do endpoint de chaves antecedem quatro das vinte e duas falhas do gateway MCP. A correlação cobre quatro falhas e não explica as vinte e duas; nenhum limite rígido de volume é inferido dessa janela. As chamadas HTTP malsucedidas duraram entre 5 e 14 segundos, e o valor de 58 a 72 ms registrado é tempo de CPU utilizado, não a duração da função.

## Taxonomia de erro, transitórios e schema público

A taxonomia corrente do serviço distingue indisponibilidade transitória, conflito de estado e entrada inválida. Uma prova nativa consultou um curso sintético inexistente e recebeu `human_reference_not_found` com `retryable: false`, confirmando a classificação própria; em falhas transitórias o serviço responde `temporarily_unavailable` com `retryable: true`.

O campo `error_code: INVALID_ARGUMENT` não existe no código do AraLearn e não aparece na saída nativa local do canal MCP; ele é acrescentado pela camada do conector. A causa externa e a origem do `-32603` observado permanecem não fechadas, pendentes de prova nativa.

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
| `courseHumanReadContext.js` | executor humano de leitura e continuação | [leitura de contexto](../tests/runtime/course-human-read-context.test.js) |
| `courseHumanTasks.js` | gateway MCP e servidor de Actions | [canal MCP](../tests/runtime/course-human-mcp.test.js) |
| `courseContentReviewReference.js` | registro de inspeção | [decisões de autoria](../tests/runtime/course-human-authoring-decisions.test.js) |
| `coursePedagogicalAudit.js` | registro de inspeção | [auditoria pedagógica](../tests/runtime/course-pedagogical-audit.test.js) |
| `mcpServer.js` | gateway MCP hospedado | [canal MCP](../tests/runtime/course-human-mcp.test.js) e [incidente](../tests/runtime/course-human-integration-incident.test.js) |

A prova individual desta frente é [oito cenários do incidente](../tests/runtime/course-human-integration-incident.test.js); os demais links apontam para suítes existentes, não para arquivos alterados por este trabalho.

## Provas locais executadas

O teste adicionado em [oito cenários do incidente](../tests/runtime/course-human-integration-incident.test.js) constrói em memória um curso com 47 unidades, uma Explicação extensa e 32 fontes, sem copiar conteúdo real. Ele verifica a leitura formal completa, a união de identificadores por recortes explícitos, a retomada pelo mesmo cursor após falhas antes e depois da montagem, o reinício do cliente, fragmentos com caracteres fora do plano básico, lacuna, duplicata, `temMais`, a exigência das seis dimensões com evidência literal, a separação entre inspeção de IA e revisão humana, a recusa de referência obsoleta e a ausência do campo `error_code` na saída local. A prova de capacidade usou um teste já existente de recuperação de transporte.

Na preparação local (commit 416d8d68), o cenário de escala mediu 3112669 caracteres de volume em 3468023 bytes, 4 páginas e 289 fragmentos, com latência de 117,6 a 370,2 ms por chamada e 50,9 s no total, pico de RSS de 579 MB e de heap de 415,7 MB, e cada chamada dentro de 13,5 KiB, confrontando por alvo o percurso completo com os recortes 1–7, 8–27 e 28–47 na mesma fixture. A prova levou 100,8 s. Esse é o orçamento empírico, sem limite de latência imposto. O relatório, os caminhos e as limitações desta frente ficam no piso privado de trabalho, sem identificadores reais de curso.

## Pendências hospedadas

A execução de ponta a ponta pela interface de integração real, a demonstração de leitura íntegra do curso em produção e a confirmação do comportamento do campo `error_code` após a implantação dependem de ambiente hospedado e credenciais autorizadas. Nenhuma dessas etapas foi executada ou presumida aqui.

## Limitações e cuidados

As correções estão fechadas no código e nos testes, mas não implantadas; nenhuma aceitação hospedada é declarada. O servidor não comprova consumo intelectual; a garantia de leitura completa antes do parecer pertence ao cliente de autoria. As contagens de disponibilidade descrevem a janela observada e não são uma taxa geral. Resultados hospedados permanecem separados dos locais.
