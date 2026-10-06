# Incidente de integração MCP do AraLearn (outubro de 2026)

## Situação corrente: corte 0.0.102 e correções posteriores

O [PR 430](https://github.com/fabio-ara/AraLearn/pull/430) foi integrado à principal em [5c28077f](https://github.com/fabio-ara/AraLearn/commit/5c28077f1b69a984029022ff88a2ea6400adba38). A [CI 37455678161](https://github.com/fabio-ara/AraLearn/actions/runs/37455678161) aprovou preparação, web, Supabase real e Android: 585 testes web, dez casos locais cobertos pela integração Supabase, 906 asserções pgTAP em 22 arquivos e clientes reais OAuth/MCP/PostgREST/RLS, com limpeza concluída. O site [0.0.102 foi publicado](https://github.com/fabio-ara/AraLearn/actions/runs/37461687120), com 204 recursos conferidos. O backend efetivo é MCP 526, Actions 395 e API 373, revisão 20261005120000, 56 capacidades. Identidades e onze configurações foram preservadas. O APK 0.0.102/248 permanece em rascunho; última release pública 0.0.100/246.

A leitura extensa nativa não passou: 354 fragmentos preservados completaram cinco páginas; a sexta ficou parcial. Um 503 recuperou pelo mesmo cursor, mas a sequência seguinte terminou em MCP -32603 sem conteúdo estruturado. O checkpoint não avançou nessa falha. Na janela observada, o MCP 526 registrou sete `service_timeout` na execução e sete `oauth_verification_unavailable` na autenticação; o endpoint de chaves JWKS teve seis respostas 504. Essa é uma fronteira de dependência observada, sem atribuir todos os erros históricos ao mesmo componente ou ao banco. O conector também devolveu `INVALID_ARGUMENT` para um erro interno transitório 503. A entrega permanece não concluída.

Na fixture própria, duas repetições de `manter_fonte` com argumentos idênticos criaram duas fontes por execução. A comparação de equivalência usava JSON.stringify sobre objetos aninhados: a ordem das chaves devolvida pelo JSONB era diferente da construída no cliente. A leitura validava os valores, mas descartava o objeto canônico retornado pelo validador; não reordenava a entrada. O cenário foi reproduzido com o handler e o normalizador reais, em fixture mutável. A candidata 0.0.103 compara metadados e seletores de âncora com o serializador canônico já existente, preservando a ordem de arrays, autores, editores e edições distintas. Se mais de uma ficha equivalente já existe, mantém a recusa 409 sem escolher nem mesclar identidades.

Também foi confirmada a consulta repetida da mesma fonte prevista e vinculada dentro de uma requisição. A candidata compartilha somente esse escopo de leitura em `preparar_revisao`: duas fontes custam duas consultas, antes quatro. Cada continuação faz consultas novas; alteração do literal recusa o cursor antigo. Não há cache entre requisições, mudança em fluxos de escrita, aumento de prazo, dependência, tabela ou migração nova. Esses ganhos não comprovam a eliminação dos 503 ou da indisponibilidade JWKS.

A candidata 0.0.103/249 ainda exige preparação integral, CI, integração, implantação e nova prova nativa. As correções locais não aprovam a aceitação externa. A materialização continua recusada antes do handler por `explicacoes[].ideia`, obrigatório no contrato servido. Atualizar ferramentas e testar com um executor novo não resolveram a divergência. Não se removeu o campo obrigatório para contornar o validador.

O coletor anterior preservou o literal completo em um campo separado e substituiu apenas sua cópia no envelope por um marcador; não é captura integral do envelope original. Metadados anteriores à chamada 226 não guardaram o cursor de entrada. O contador antigo reiniciava por execução e somou sete tentativas; foi substituído por um registro persistente por cursor e janela, com captura por tentativa. Os arquivos antigos permanecem imutáveis e suas limitações não são preenchidas retrospectivamente. As capturas novas guardam o retorno completo. Nenhuma dessas operações registrou inspeção, revisão humana ou alteração no curso real.

As seções seguintes registram o percurso anterior e as provas de cada corte. Declarações de preparação ou implantação pendente nelas descrevem aquele momento; a matriz abaixo traz os resultados atuais do incidente.

## Resumo

Uma sessão de autoria pelo conector MCP sofreu indisponibilidades recorrentes de leitura do curso e um fluxo de auditoria interrompido. A investigação separa o que está comprovado do que segue aberto. Estão corrigidos no código o envelope JSON-RPC de erro, o schema público de saída, a criação atômica de fonte e o replay equivalente de source-flow; a aceitação implantada dessas correções continua pendente. Permanecem abertos o campo de erro acrescentado pela camada do conector e a correlação das falhas do provedor de chaves, que cobre quatro das vinte e duas falhas e não as explica por inteiro.

## Ambiente, versão e recibos

O [PR 429](https://github.com/fabio-ara/AraLearn/pull/429) foi integrado à principal no commit [d3ae991d](https://github.com/fabio-ara/AraLearn/commit/d3ae991df89156481018b8ea14326c74b8fba44d), preservando o trabalho paralelo do PR 428. Esses bytes correspondem à versão `0.0.101`. A candidata seguinte, `0.0.102` (Android 248), acrescenta a correção da paginação de seleções explícitas e tem 111 testes pertinentes aprovados; sua preparação integral, CI e implantação ainda estão pendentes.

Na preparação local do commit 135e2820, integrado pelo PR 429, passaram as seis etapas: preflight, lint, contrato, runtime, frontend e Android. O runtime teve 2727 aprovações, nenhuma falha e 15 casos dispensados pelos respectivos guardas; o frontend teve 16 aprovações. Esses recibos certificam os bytes daquela candidata, sem substituir os gates da alteração seguinte.

A [CI 37438602671](https://github.com/fabio-ara/AraLearn/actions/runs/37438602671), vinculada à candidata integrada pelo PR 429, aprovou as cinco etapas: web com 585 aprovações e dez casos locais dispensados nessa etapa e cobertos pela integração Supabase; Supabase com 24 etapas sem dispensas, 906 asserções pgTAP em 22 arquivos e paridade de 738 objetos. Passaram também os clientes reais de autoria, canais e OAuth, com limpeza das fixtures. A [preparação 37443512163](https://github.com/fabio-ara/AraLearn/actions/runs/37443512163) produziu o APK 0.0.101/247 e a prova de instalação limpa e atualização desde 0.0.67/213: identidade da aplicação e tema preservados. Esse ensaio não comprova conservação de dados de conta ou de curso.

O backend efetivo tem `schemaRevision=20261005120000`, `contractVersion=1` e 56 capacidades: MCP 525, API 373 e Actions 394, com identidades e a configuração `verify_jwt=false` preservadas; a autorização continua no handler. A comparação das onze configurações não encontrou alteração. O catálogo permanece `aralearn.human-authoring-tasks`, versão `11.1.0`, impressão digital `sha256:8718881bbddd3b2bff35dbf2a438e77a95fb4805db86d0d38e2732a0b9e7b962`. O [site 0.0.101 foi publicado](https://github.com/fabio-ara/AraLearn/actions/runs/37449819879), com 204 recursos conferidos contra os artefatos aprovados. O APK 0.0.101/247 permanece em rascunho enquanto a aceitação nativa está pendente; a release pública continua 0.0.100/246.

## Integração contínua protegida

A CI da versão integrada 0.0.101 passou. Os registros abaixo são históricos e tiveram suas falhas resolvidas antes da execução 37438602671; não certificam a candidata posterior 0.0.102.

A [execução 37427004833](https://github.com/fabio-ara/AraLearn/actions/runs/37427004833), tentativa 1 no commit 4083e430, aprovou web, Android e as 906 asserções pgTAP. A etapa seguinte detectou quatro divergências no inventário de paridade: a restrição de recibos v18 e as duas funções do pacote atômico não estavam registradas, enquanto a restrição v17 substituída ainda constava no inventário. Os registros exatos foram atualizados nos casos existentes, sem isenções ou alteração de permissões; os 12 testes focais da paridade passaram. A integração real de API, RLS e MCP ficou sem execução nessa CI por causa da falha de paridade. O agregado reprovou e não produziu certificado; uma nova execução completa é necessária.

A [execução 37424182280](https://github.com/fabio-ara/AraLearn/actions/runs/37424182280), tentativa 1 no commit 37b8705e, foi cancelada após a falha comprovada no pgTAP 009, teste 26: "features do manifesto estão em ordem canônica". Das 906 asserções pgTAP, uma falhou. As listas contêm as mesmas 56 capacidades; a migração acrescentava a nova capacidade ao fim, em vez de sua posição na ordem canônica. A correção ordena a lista usando o padrão existente de SQL e conserva a asserção 009. Uma regressão focal executa o bloco SQL real e verifica ordem, conjunto completo, reaplicação e preservação de identidade, permissões, comentário e dados. Os quatro testes focais passaram. Android passou nessa CI, web foi cancelado e o agregado falhou; não há certificado promovível. O PR 429 voltou a rascunho e exige uma nova execução completa antes de integração e implantação.

A prova adicional de autoria atual passou integralmente com adapter e PostgREST reais em uma stack descartável, criada com as migrações correntes: 56 capacidades e paridade dos 738 objetos. Ela encontrou e corrigiu falhas na própria fixture de volume: o cache incluía uma unidade já excluída, e a unidade substituta precisava de posição positiva e proveniência explícita com o vínculo completo. As guardas de produto foram preservadas. O cenário aceitou o pacote agregado acima de 196608 bytes, releu 28 vínculos e recusou, pelo código exato `course_source_links_too_large`, vínculos acima de 131072 bytes no normalizador, usando a versão corrente do alvo. A asserção anterior de qualquer rejeição poderia aceitar um conflito de versão e foi substituída. A limpeza foi concluída, sem cursos, usuários ou fontes residuais da fixture.

Essa prova isolada não substitui o caminho do ChatGPT. OAuth e canais MCP na porta adicional ficaram limitados pela metadata local que fixa a porta 54321; a execução real na porta padrão passou posteriormente na CI 37438602671. A aceitação nativa extensa continua pendente.

### Histórico: execução anterior

A [execução 37411192536](https://github.com/fabio-ara/AraLearn/actions/runs/37411192536), no commit 416d8d68 e na tentativa 1, terminou com falha, e o [PR 429](https://github.com/fabio-ara/AraLearn/pull/429) foi convertido em rascunho. As falhas foram de web e de banco, sem atribuição ao MCP. Na web, a escala do zoom era exibida imediatamente, mas sua memória só era gravada no quadro seguinte, e um novo render podia remover o canvas antes dessa gravação; o modo expandido anunciava prontidão antes de restaurar a posição. A correção grava a escala e a posição projetada de forma síncrona, respeita os gestos mais recentes e só anuncia prontidão depois de restaurar a posição, com 16 testes focais aprovados em duas especificações e três reproduções que falhavam antes e passam depois. No banco, a verificação 009 esperava uma revisão de schema anterior e a contagem de 55 capacidades revelou uma capacidade nova no campo errado. A nova guarda da verificação 024 usava `40001` onde a correção passou a usar `PT409`, com captura de conflito de negócio ou falha nativa de serialização, mantendo o envelope HTTP 409; a expectativa de envelopes passou de oito para nove.

A prova local não é validade hospedada. As correções de SQL e de web passaram posteriormente na CI completa 37438602671. A matriz distingue essa aprovação das verificações nativas ainda sem conclusão.

## Restauração e atualização (prova real)

A restauração e atualização de fixtures em contêineres isolados passou no commit 37b, sob o contrato `aralearn.backup-restore-upgrade-proof.v3`: seis migrações do corte histórico e 74 posteriores até `20261005120000`, com instalação limpa de 247 migrações convergente com a atualização. Foram preservados 13 grupos — planejamento, partes, curso, âncoras, fontes, entidades, orientação, itens de plano, parâmetros, anexos, vínculos, observações e decisões aplicadas — além de duas bases de autoria, seis alvos e um arquivo como metadado. Nenhuma migração ficou pendente após repetição; os contêineres descartáveis foram removidos. Esta prova preserva evidência de restauração dos dados e permissões em 37b. O delta posterior altera somente a ordem da lista do manifesto, verificada pela regressão SQL focal; a prova antiga não é apresentada como certificado da árvore nova. Objetos do Storage exigem cópia própria; este ensaio conserva seus metadados e não prova recuperação dos bytes desses objetos.

## Causas e correções comprovadas

Na indisponibilidade de autenticação, o envelope JSON-RPC passou de -32600 para -32000. Antes, o identificador JSON-RPC era devolvido como nulo nessas falhas; agora é preservado. O serviço também gera um identificador de requisição para correlação e informa a fase da falha. Parse usa -32700, requisição inválida usa -32600 e recusa de autenticação usa -32001.

O schema público de saída foi corrigido no código: a saída passou a ter raiz do tipo objeto com `oneOf` de sucesso e erro. O contrato original exigia `result`, `deepLink` e `nextDecision` também na saída de erro; não havia raiz divergente. Falta apenas a aceitação implantada.

A criação de fonte passou a usar um bundle atômico no domínio, no adaptador e na migração `20261005120000_atomic_course_source_bundle.sql`. A prova por RPC real local cobre apenas esse bundle: 74 gravações de fonte, 74 fatos e 206061 bytes.

O replay equivalente de source-flow foi comprovado em 19 de 19 casos, em prova local de handler e stub. Essa prova é separada da anterior; não é prova de MCP nem de autenticação. A borda local falhou por DNS, portanto não há prova de borda nesta frente.

A candidata 0.0.102 pagina a seleção explícita antes das consultas de revisão, inspeção e anotações, aplicando o limite existente de 12 unidades e o orçamento de 64 KiB de conteúdo bruto. O primeiro alvo entra mesmo se exceder esse orçamento e permanece recuperável por fragmentos literais. Sete regressões verificam cobertura, ordem, identidades, continuação, revisão obsoleta e UTF-8; duas falhavam antes da correção. O conjunto pertinente teve 111 aprovações locais. Essa prova não garante que os 503 hospedados tenham sido resolvidos.

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
| T02 taxonomia de erro e retry | FALHOU | local e CI aprovados; native 526 | o conector classificou um 503 transitório como INVALID_ARGUMENT e perdeu o diagnóstico no -32603; fronteira externa ainda aberta |
| T03 retomada após falhas e reinício | APROVADO | candidate, 8 testes do incidente | prova local |
| T04 integridade da remontagem | APROVADO | candidate, 8 testes do incidente | prova local |
| T05 páginas lógicas e temMais | APROVADO | candidate, 8 testes do incidente | prova local |
| T06 bloqueio de parecer com escopo incompleto | BLOQUEADO | native | exige espião de orquestração com zero registrar_inspecao antes da completude, manifesto e rastro do fluxo; não é guarda global do servidor |
| T07 recortes explícitos e união | APROVADO | candidate, 8 testes do incidente | prova local |
| T08 conflito ao alterar conteúdo durante a auditoria | APROVADO | candidate, suíte executada | rejeição da referência antiga sem escrita em [decisões de autoria](../tests/runtime/course-human-authoring-decisions.test.js); releitura da base atual e registro novo válido em [inspeção pglite](../tests/runtime/course-ai-inspection-pglite.test.js) |
| T09 dependências bibliográficas da base | APROVADO | candidate, suíte executada | [fontes, citações e estilo invalidam somente consumidores pertinentes](../tests/runtime/course-ai-inspection-pglite.test.js): fonte vinculada invalida, fonte não vinculada e alvo não pertinente permanecem atuais, sem fila duplicada |
| T10 evidência literal e seis dimensões | APROVADO | candidate, 8 testes do incidente | prova local |
| T11 idempotência do parecer | APROVADO | candidate, suíte executada | prova local |
| T12 fonte criada após falha | FALHOU | atomicidade aprovada local/RPC/PostgREST real; native 526 falhou | argumentos idênticos criaram fontes duplicadas na fixture; comparação sensível à ordem JSONB reproduzida e corrigida localmente, ainda sem nova aceitação implantada |
| T13 limite de 32 vínculos | APROVADO | candidate, suíte executada | prova local; aceita 32 e recusa 33 antes de gravar, preservando fonte, âncora, papéis e identidades |
| T14 retomada preserva identidades | APROVADO | candidate, suíte executada | prova local |
| T15 ida e volta de aplicação e configuração | FALHOU | local aprovado; native recusado | campo obrigatório explicacoes[].ideia rejeitado antes do handler, após atualizar ferramentas e testar com executor novo |
| T16 reconciliação da Explicação | APROVADO | candidate, suíte executada | prova local |
| T17 inspeção de IA não aprova humano | APROVADO | candidate, 8 testes do incidente | prova local |
| T18 ausência de mutação em leitura e exclusividade do fluxo | BLOQUEADO | native | exige no máximo uma chamada em voo, snapshot antes e depois das leituras puras e transferência com checkpoint; exclui a negociação de mandato de retomar_curso das leituras puras |
| T19 leitura formal grande com base própria | FALHOU | local e CI aprovados; native 525/526 falhou | local em 585: 3112669 unidades UTF-16, 3468023 bytes, quatro páginas e 289 fragmentos; native 526 parou com 354 fragmentos na sexta página, após recuperação de 503 e posterior -32603. A fixture extensa depende também de T15 |
| T20 aceitação ponta a ponta após interrupção | BLOQUEADO | native | três passagens passaram no handler MCP local; interface real pendente |

## Mapa de consumidores e provas

| Módulo | Consumidores | Provas |
| --- | --- | --- |
| `courseHumanReadContext.js` | executor humano de leitura e continuação | [leitura de contexto](../tests/runtime/course-human-read-context.test.js) |
| `courseHumanTasks.js` | gateway MCP e servidor de Actions | [canal MCP](../tests/runtime/course-human-mcp.test.js) |
| `courseContentReviewReference.js` | registro de inspeção | [decisões de autoria](../tests/runtime/course-human-authoring-decisions.test.js) |
| `coursePedagogicalAudit.js` | registro de inspeção | [auditoria pedagógica](../tests/runtime/course-pedagogical-audit.test.js) |
| `mcpServer.js` | gateway MCP hospedado | [canal MCP](../tests/runtime/course-human-mcp.test.js) e [incidente](../tests/runtime/course-human-integration-incident.test.js) |

As provas adicionadas nesta frente são os [oito cenários do incidente](../tests/runtime/course-human-integration-incident.test.js) e as [sete regressões de paginação selecionada](../tests/runtime/course-review-read-fanout-incident.test.js). Os demais links identificam consumidores e suítes existentes.

## Provas locais executadas

O teste adicionado em [oito cenários do incidente](../tests/runtime/course-human-integration-incident.test.js) constrói em memória um curso com 47 unidades, uma Explicação extensa e 32 fontes, sem copiar conteúdo real. Ele verifica a leitura formal completa, a união de identificadores por recortes explícitos, a retomada pelo mesmo cursor após falhas antes e depois da montagem, o reinício do cliente, fragmentos com caracteres fora do plano básico, lacuna, duplicata, `temMais`, a exigência das seis dimensões com evidência literal, a separação entre inspeção de IA e revisão humana, a recusa de referência obsoleta e a ausência do campo `error_code` na saída local. A prova de capacidade usou um teste já existente de recuperação de transporte.

Na execução local atual (135), o cenário de escala levou 33877,2481 ms, com latência de 101,3642 a 208,2383 ms por chamada, volume de 3112669 caracteres em 3468023 bytes, 4 páginas e 289 fragmentos, maior chamada de 13536 bytes, pico de RSS de 582479872 bytes e de heap de 440308504 bytes, confrontando por alvo o percurso completo com os recortes 1–7, 8–27 e 28–47 na mesma fixture. Esse é o orçamento empírico, sem limite de latência imposto. O relatório, os caminhos e as limitações desta frente ficam no piso privado de trabalho, sem identificadores reais de curso.

## Pendências hospedadas

As credenciais hospedadas estão disponíveis e o backend foi verificado por clientes reais de OAuth e pelos endpoints implantados. A leitura nativa de uma Explicação sintética passou integralmente, com 140 caracteres, referências de revisão e inspeção, `temMais=false` e resposta persistida. Essa prova curta não é aceitação de uma auditoria extensa.

A materialização da fixture extensa está bloqueada antes de chegar ao servidor: o validador nativo rejeita `unidades[].aplicacaoPedagogica.explicacoes[].ideia`. O schema do repositório e o `tools/list` autenticado do MCP 525 permitem e exigem `ideia` e `formas`; os dois contratos concordam. A conexão precisa aceitar o contrato vigente. As ferramentas disponíveis não oferecem atualização desse schema, e a ação na administração da conexão foi solicitada. Não foi removida a referência obrigatória para contornar a rejeição.

Na leitura do curso real, quatro respostas chegaram antes de um 503; os bytes e o cursor não foram preservados pelo coletor anterior, portanto não há prova de remontagem ou retomada. Os logs correlacionaram duas falhas à execução do MCP 525, com código interno `service_timeout`, classe transitória e status 503, em 32436 e 34221 ms. O prazo específico que expirou não foi identificado: cada requisição usa oito segundos e até três tentativas, enquanto a chamada tem orçamento global de quarenta segundos. O defeito de coleta integral de seleções foi reproduzido e corrigido localmente; sua contribuição para essas falhas exige a verificação hospedada da correção. Foram feitas somente consultas no curso real; revisão 555 e acesso permaneceram iguais nas consultas antes e depois, sem alegar um snapshot completo de fontes, configuração e pareceres.

## Limitações e cuidados

As correções do PR 429 foram integradas e implantadas; a correção posterior da paginação selecionada ainda está local. A entrega do incidente não está concluída. O servidor não comprova consumo intelectual; a garantia de leitura completa antes do parecer pertence ao cliente de autoria. As contagens de disponibilidade descrevem a janela observada e não são uma taxa geral. Resultados hospedados permanecem separados dos locais, e a inspeção de IA não é aprovação humana.
