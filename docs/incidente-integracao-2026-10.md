# Incidente de integração MCP do AraLearn (outubro de 2026)

## Situação corrente: corte 0.0.103 integrado e implantado

Estado efetivo em 2026-10-08, depois do [PR 438](https://github.com/fabio-ara/AraLearn/pull/438): MCP 536, API 379 e Actions 403 ativos, `verify_jwt=false` e schema `20261007234650`, com 248 migrações aplicadas e nenhuma pendente; T02 permanece FALHOU e T20 BLOQUEADO. A cronologia abaixo registra as promoções até este ponto.

O corte 0.0.103 está integrado e implantado. Commit fonte [8bb99856](https://github.com/fabio-ara/AraLearn/commit/8bb99856290b318a1da04d977f393bb546afac56); merge/principal [b1621e95](https://github.com/fabio-ara/AraLearn/commit/b1621e9534afa22cbeec7b4fc50dc71fc3ce0c82), árvore idêntica à certificada; na verificação do corte, checkout limpo e principal local e remota coincidentes. A revisão independente aprovou 49 testes; o source-flow teve 19 aprovações; o conjunto focal teve 126. São conjuntos sobrepostos, não somados. A preparação passou nos cinco gates aplicáveis, com runtime local de 2709 aprovações, zero falhas e as 15 dispensas existentes.

A [CI integral 37485403915](https://github.com/fabio-ara/AraLearn/actions/runs/37485403915) aprovou cinco jobs: web 585 aprovações e dez dispensas locais cobertas pelo Supabase real; 906 asserções pgTAP em 22 arquivos; paridade de 738 objetos; clientes reais OAuth/MCP/PostgREST/RLS; canais, Storage e Android; limpeza concluída. Certificado, origem, árvore, configuração e hashes foram conferidos. A [preparação 37491227270](https://github.com/fabio-ara/AraLearn/actions/runs/37491227270) produziu o APK 0.0.103/249 e a prova Android v2 — instalação limpa, atualização desde 0.0.67/213 e reinstalação, com identidade e tema preservados; dezesseis arquivos de evidência tiveram os hashes conferidos e duas telas foram inspecionadas. A prova Android não certifica restauração de dados de conta ou de curso.

O backend foi reconfirmado em 2026-10-06T17:42:57Z (então MCP 527, Actions 396 e API 373), com identidades e autorização preservadas e onze configurações inalteradas. A verificação de implantação somou 234 aprovações, zero falhas e nenhuma dispensa, com schema `20261005120000` e sem migrações, seeds ou papéis pendentes. Passaram contrato hospedado, OAuth inicial e renovado, isolamento e autoria por clientes reais; biblioteca v1, 56 capacidades e catálogo `aralearn.human-authoring-tasks` `11.1.0` permanecem. O [publicador 37493868502](https://github.com/fabio-ara/AraLearn/actions/runs/37493868502) conferiu backend, prova Android e bytes e publicou o [site 0.0.103](https://fabio-ara.github.io/AraLearn/) com 204 recursos verificados. O APK 0.0.103/249 (`9eb917c0…befce`) permanece em rascunho enquanto a aceitação nativa estiver aberta; rascunhos anteriores e a última release pública Android 0.0.100/246 foram preservados.

A leitura nativa do curso real da MS8 terminou: oito páginas contíguas, 528 fragmentos, 47 unidades nas posições exatas 1–47 e uma Explicação, com `temMais=false`. A conferência cobriu bytes e hashes, ausência de lacunas, ordem, os alvos das 94 referências de unidade, o curso e os tipos das referências, a repetição íntegra da Explicação e o escopo. O checkpoint final 530 ficou sem cursor; os snapshots finais de planejamento e acesso mantêm a revisão 555 e o estado public/available/saved. Foram feitas somente consultas: nenhuma inspeção, parecer ou alteração foi registrada no curso real.

Este corte fecha duas causas demonstradas: a comparação canônica de fichas de fonte contra JSONB real — o replay que criava duplicatas por ordem de chaves — e o compartilhamento da leitura de fonte prevista e vinculada em `preparar_revisao` (duas consultas em vez de quatro por requisição, sem cache entre requisições e sem DDL, prazo ou fluxo de escrita novo). A recusa de `explicacoes[].ideia` vista numa conversa antiga ficou como observação inconclusiva, aceita em conversa nova (T15 aprovado); a correlação das falhas de chave segue aberta, e a entrega do incidente continua não concluída.

O [PR 433](https://github.com/fabio-ara/AraLearn/pull/433) foi integrado em 2026-10-07T01:58:48Z: merge `21182dec75543a695e26ad8c16213bd40c6a83f8`, árvore `a108068c916cde1d87b5656fcb13e164afd491d5` (igual à candidata). A [CI 37556738345](https://github.com/fabio-ara/AraLearn/actions/runs/37556738345) aprovou preparação, web e Supabase, com Android não aplicável; a [preparação de Pages 37559756460](https://github.com/fabio-ara/AraLearn/actions/runs/37559756460) e a [publicação 37559971323](https://github.com/fabio-ara/AraLearn/actions/runs/37559971323) concluíram a promoção, com 204 recursos conferidos. O backend efetivo passou a MCP 529 e Actions 397 (API 373 inalterada), `verify_jwt=false`, schema `20261005120000` sem DDL novo; o site já correspondia aos bytes certificados.

O [PR 434](https://github.com/fabio-ara/AraLearn/pull/434) foi integrado em 2026-10-07T06:51:43Z: merge `5595ba221731dcc23e087156992d9babad3023e5`, árvore `d6b2be4559d7ade03bbb6a0bc4512166d55393f5` (igual à candidata). A [CI 37580407405](https://github.com/fabio-ara/AraLearn/actions/runs/37580407405) aprovou preparação, web e Supabase, com Android não aplicável; a [preparação de Pages 37584037033](https://github.com/fabio-ara/AraLearn/actions/runs/37584037033) e a [publicação 37585491362](https://github.com/fabio-ara/AraLearn/actions/runs/37585491362) concluíram a promoção, com 204 recursos conferidos. O backend efetivo passou a MCP 530 (`ezbr_sha256 c2ead2a4f780bd81ae48d18743aa7398b730ba6a05b9e5f7e3ffce236e6e60a1`), com API 373 e Actions 397 inalteradas, `verify_jwt=false` e schema `20261005120000` sem DDL novo; o site já correspondia aos bytes certificados.

O [PR 435](https://github.com/fabio-ara/AraLearn/pull/435) foi integrado em 2026-10-07T09:36:07Z: merge `786f1d2f5bfd83ad819b1bd8a50fe94d0c49e81b`, árvore `2aae7a76df2917f1ad5e5fb1984fdaedb9cfbfca` (igual ao certificado). A [CI 37593218862](https://github.com/fabio-ara/AraLearn/actions/runs/37593218862) teve a tentativa 1 reprovada em 1 de 585 testes web (584 aprovações, 1 falha e 10 dispensas) — `ERR_NO_BUFFER_SPACE` no primeiro carregamento, sem cancelamento e sem causa estabelecida — e a tentativa 2 aprovada sobre os mesmos bytes em preparação, web e Supabase, com Android não aplicável; a [preparação de Pages 37601914330](https://github.com/fabio-ara/AraLearn/actions/runs/37601914330) e a [publicação 37602033378](https://github.com/fabio-ara/AraLearn/actions/runs/37602033378) concluíram a promoção, com 204 recursos conferidos. O backend efetivo passou a MCP 531 (`ezbr_sha256 93f722c575798234b84b89b53a1d6623b64d35c426c3b9ae929de6d99dbe4a8e`), API 374 (`16fbd9ffcae92ea1172b9e8ae5c45e1ee2db157241469cdcb95d67c3af50a801`) e Actions 398 (`955116b34b2751272d43618671f328b82bebe74b3824d71b6e59c8beae31e909`), `verify_jwt=false` e schema `20261005120000` sem DDL novo; o site já correspondia aos bytes certificados.

## Resumo

A investigação separa o comprovado do aberto. Estão corrigidos e implantados, no corte 0.0.103, o envelope JSON-RPC de erro e o identificador de correlação, o contrato de saída de sucesso e erro, o bundle atômico de fonte, a paginação de seleção, a comparação canônica do replay, a classificação tipada da reconciliação inválida e a classificação da falha transitória do principal em `tools/call` válido. Permanecem abertos o campo `error_code`/`INVALID_ARGUMENT` observado nas respostas reais dos cortes 529, 530 e 531 — sem regra interna acessível, atribuí-lo a uma transformação externa é inferência, não fato demonstrado —, a recusa de `explicacoes[].ideia` vista numa conversa antiga — aceita em conversa nova, sem falha global e com causa interna inconclusiva —, e a correlação das falhas do provedor de chaves. O estado final tem T02 como FALHOU e T20 como BLOQUEADO; os demais dezoito cenários estão aprovados no gate pertinente. O corte final ainda não está concluído: as etapas descritas do terceiro fluxo terminaram, e T20 segue BLOQUEADO enquanto T02 persistir. A falha transitória do principal em `tools/call` válido foi corrigida no PR 434 (MCP 530) e a leitura do principal ganhou retentativa no PR 435 (MCP 531). A classificação de T02 persiste depois da atualização de definições no corte 531.

## Texto de erro MCP integrado e implantado

O bloco textual dos erros do canal MCP passa a espelhar a mesma projeção pública já enviada em `structuredContent`, como JSON analisável com código, mensagem, repetibilidade, correlação e a decisão de retomada. O limite é medido sobre o envelope JSON-RPC inteiro, com o identificador real do cliente. Quando o espelho excederia o limite de 2 MiB da resposta, o texto reduz a um resumo JSON com esses campos públicos e um aviso explícito do limite, mantendo os detalhes completos — bloqueios e recuperação — na resposta estruturada, sem truncá-los nem expor dados brutos. Se nem o resumo couber, porque a própria projeção estruturada já excede o limite total, aplica-se a falha de limite já existente (413), sem prometer uma resposta íntegra. A motivação segue a recomendação de compatibilidade reversa da [especificação MCP 2025-11-25 para conteúdo estruturado](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#structured-content): clientes que leem apenas o texto deixavam de receber a classificação e a retomada. Sucesso, Actions, schemas de entrada e `outputSchema` não mudam. A correção está **integrada e implantada** no corte 0.0.103 ([PR 432](https://github.com/fabio-ara/AraLearn/pull/432), principal `c2cb6acf`, então MCP 528); o site já correspondia aos bytes certificados (204 recursos) e o Android não se aplica, sem APK alterado. A aceitação nativa pelo caminho do conector segue pendente, sem conclusão sobre importação ou cache.

Uma prova do corte 528 conferiu um conflito de base (409): os campos `error` e `nextDecision` do texto público (JSON) do canal MCP são iguais aos do `structuredContent`, e o `structuredContent` traz ainda o `error_code` acrescentado pela camada do conector — é conflito de base, distinto da indisponibilidade transitória observada no corte 529.

## Classificação da reconciliação inválida integrada e implantada

Uma declaração de reconciliação com papel que exige ideia (`introduced`, `established` ou `revisited`) e nenhuma ideia informada — ou com referência repetida, ou motivo em branco — fazia a normalização lançar um `TypeError` cru, apresentado como 500 `internal_error`. **Integrada e implantada** no corte 0.0.103 ([PR 433](https://github.com/fabio-ara/AraLearn/pull/433)), essa recusa passa a ser erro de entrada tipado `invalid_explanation_reconciliation` (422, `retryable: false`), com bloqueador que indica a passagem e o papel — ou, quando a recusa é do conjunto, um bloqueador de limite honesto (número de passagens ou tamanho serializado) —, exposto também no canal MCP; a validação não foi afrouxada e nenhuma gravação ocorre. É uma correção de tipagem da taxonomia (T02), distinta do fallback textual de erro.

## Falha transitória do principal em `tools/call` válido — integrada e implantada

Quando a resolução do principal falha de forma transitória (503 ou 408) numa chamada `tools/call` já bem formada no protocolo — envelope com `id`, método `tools/call`, ferramenta do catálogo, `arguments` em objeto e `MCP-Protocol-Version` vigente —, nada foi executado, mas o cliente recebia o erro de transporte. A correção devolve esse caso como falha da própria ferramenta, no mesmo envelope JSON-RPC com `result.isError: true` e HTTP 200 carregando apenas erro público sanitizado — nunca sucesso de domínio —, preservando o status original no diagnóstico e levando `code`, `retryable` e `diagnostico` ao cliente. O escopo é exatamente esse caminho: autenticação (401/403), limite de taxa, entrada inválida, `id` ausente, protocolo divergente, método ou ferramenta desconhecida e falha interna seguem o contrato atual, e a validação de forma de `arguments` e do cabeçalho de protocolo foi unificada com a do despacho normal, sem lista paralela divergente. Não é contorno de autenticação nem elimina o `error_code: INVALID_ARGUMENT` acrescentado pela camada do conector; indisponibilidade emitida fora do handler, na plataforma ou no verificador de implantação, permanece fora do seu alcance. Provas locais: 73 testes do canal MCP, 90 do adapter — incluindo os focais da retentativa — e 2 testes Deno do canal, aprovados. As duas partes estão **integradas e implantadas** no corte 0.0.103: o guard do PR 434 (MCP 530, `ezbr_sha256 c2ead2a4…60a1`) e a retentativa da leitura do principal do PR 435 (MCP 531, `ezbr_sha256 93f722c5…4a8e`), que reusa a repetição existente só nessa RPC. A verificação hospedada aprovou backend compatível (revisão `20261005120000`, biblioteca v1) e o smoke OAuth inicial e renovado; o verificador do site conferiu 204 recursos.

## Histórico essencial

Os cortes anteriores corrigiram, com prova local própria, o envelope JSON-RPC de autenticação (identificador preservado e código próprio de indisponibilidade) e o schema público de saída: o [PR 429](https://github.com/fabio-ara/AraLearn/pull/429) e o [PR 430](https://github.com/fabio-ara/AraLearn/pull/430). A criação de fonte passou a usar um bundle atômico; o replay equivalente de source-flow foi verificado em 19 de 19 casos locais; a paginação de seleção explícita passou a anteceder as consultas de revisão e inspeção. A restauração e a atualização de fixtures em contêineres isolados passaram sob o contrato `aralearn.backup-restore-upgrade-proof.v3`, preservando treze grupos de dados e permissões; objetos do Storage conservam apenas os metadados. Cada correção tem sua própria prova, e a aceitação nativa de uma não certifica a seguinte.

## Causa correlacionada do provedor de chaves

Quatro pares de falha 504 do endpoint de chaves antecedem quatro das vinte e duas falhas do gateway MCP. A correlação cobre quatro falhas e não explica as vinte e duas; nenhum limite rígido de volume é inferido dessa janela. As chamadas HTTP malsucedidas duraram entre 5 e 14 segundos, e o valor registrado entre 58 e 72 ms é tempo de CPU utilizado, não a duração da função.

## Taxonomia de erro e schema público

A taxonomia corrente distingue indisponibilidade transitória, conflito de estado e entrada inválida: falhas transitórias respondem `temporarily_unavailable` com `retryable: true`, e referências ausentes respondem `human_reference_not_found` com `retryable: false`. O campo `error_code: INVALID_ARGUMENT` não existe no código do AraLearn nem aparece na saída nativa local do canal MCP; a origem está fora do handler e a regra exata dessa transformação não é acessível — atribuí-la à camada do conector é inferência, não fato demonstrado. Na resposta real do corte 529, uma indisponibilidade transitória chegou como 503 `temporarily_unavailable` com `retryable: true`, e o `structuredContent` trazia `error_code: INVALID_ARGUMENT` — combinação que a saída nativa do AraLearn não produz; o texto JSON preservou `error` e `nextDecision`, a nova tentativa com os mesmos argumentos e cursor devolveu `-32603` sem `structuredContent`, e a terceira teve sucesso, com cerca de 45,6 s e 9,9 s medidas entre os envios. A inspeção de tela e a leitura autenticada da conversa salva no ChatGPT Web confirmaram que uma consulta separada com continuação obsoleta, relatada como 409, era a própria resposta final do assistente: no JSON da conversa o invólucro está em `role: assistant`, e a chamada `functions.exec` em `role: tool` está vazia, sem expor o retorno; a atividade da interface registra o evento de ferramenta, mas o texto exato do erro só é afirmado pelo modelo. O caminho do navegador comprova que a captura funciona e que não faltou permissão, sem servir como prova independente do invólucro bruto do MCP; os retornos 503 e 409 lidos nos arquivos brutos nativos seguem como evidência forte, e a causa administrativa, de cache ou de permissão permanece sem prova. Os logs do handler do corte 529 confirmam `service_timeout` na fase de execução, com cerca de 41,2 s, e um segundo evento na fase de resolução principal, com cerca de 9,5 s; o primeiro 503 traz `request 497d6253-2bd6-412c-b3ec-c3fa44cd1a42` e liga diretamente o evento do handler ao retorno bruto, enquanto o segundo só se correlaciona ao `-32603` por ordem e duração, porque o retorno não traz identificador; um 503 anterior à execução pode explicar o descarte do diagnóstico do `-32603`, e sete SQL `57014` na mesma janela permanecem como correlação, sem causa demonstrada. A origem externa do `-32603` e a definição efetivamente usada pelo conector permanecem não fechadas. A mensagem do conector que menciona o administrador do espaço de trabalho não implica, por si, exigir uma permissão nova: a investigação deve conferir a definição efetivamente usada pelo conector e alinhá-la ao contrato servido, sem supor um responsável exclusivo; qual regra, importação ou cache produz a divergência segue sem conclusão. Um 422 `invalid_pedagogical_audit` novo decorreu de citação de representação ausente na base canônica: o cliente procurou a citação no envelope inteiro em vez de em `pedagogicalBasis` e usou um rótulo público projetado (`leitura_complementar`) em vez do enum canônico (`recommended_reading`); a validação do servidor está correta e não há correção de produto. Retirada apenas essa citação, o registro nativo passou no corte 529, com corpo, seis dimensões, estado corrente e referências próprias conferidos pelo recibo original (`sha256:FFB012F7…1497`), sem aprovação humana fabricada.

### Detalhe das falhas transitórias dos cortes 529, 530 e 531

São respostas brutas do coletor nativo e originais de handler/borda, não o relato do assistente; a resposta real do corte 529 está descrita na seção acima.

**530, série s27.** Uma falha transitória chegou como `temporarily_unavailable` com `retryable: true` e `error_code: INVALID_ARGUMENT` no `structuredContent`, na fase de execução, com retorno bruto de 838 bytes preservado (`sha256:ea9cd27f4e08cae09dc30d66fc01e8031e6ac4a432cae92aa1a201dbb9aa35fe`) e cerca de 45,7 s. O log do handler confirma `service_timeout` de cerca de 41,9 s para a mesma requisição (`11a955ed-17dc-4283-acc2-1cb53efb058c`) e a consulta original à borda, para o mesmo `edge_request` (`01a11537-0c71-78e0-addd-f8597791cfb3`), respondeu HTTP 200 com `execution_time` de cerca de 42,0 s e sem `sb_error_code`: ali o `temporarily_unavailable` foi rótulo de diagnóstico do conector, não o status HTTP, e não houve `-32603`. O checkpoint não avançou e a repetição recuperou o mesmo cursor (277112 → 287672) em 38.476 ms.

**530, série s67, mais adiante na mesma passagem.** O fluxo parou com três chamadas no mesmo alvo: a1 e a3 com 503 na fase de execução (48.199 ms e 46.268 ms; requisições `8c119eee-8520-4724-bbc5-4d297e766550` e `0f640b95-b1f1-4407-9778-71cae45c0ab5`) e, entre elas, a2, que devolveu `-32603` sem `structuredContent` em 9.814 ms. Os originais mostram a intermediária na fase de resolução do principal, com `service_timeout` de 9.374 ms (requisição `9e0c72c4-a6d8-4b11-ab9b-b6d3bdbfaacf`, `edge_request` `01a1153e-32dc-7100-8146-230c9671a5b3`, HTTP 503 em 9.539 ms); a primeira e a terceira responderam HTTP 200, com o handler medindo 40.372 ms e 40.518 ms e a borda 40.527 ms e 40.673 ms. Só a1 e a3 têm identificador direto; a associação da a2 é por ordem e duração, com diferença de relógio de cerca de 20 s.

**531, série s125, depois da atualização de definições.** Após a atualização das 56 definições do conector, uma nova leitura no corte 531 reproduziu a mesma contradição: código `temporarily_unavailable` com `retryable: true` e `error_code: INVALID_ARGUMENT` no `structuredContent`, diagnóstico na fase de execução com status 503, retorno bruto de 838 bytes preservado (`sha256:802c5ca92ef7766e315bf6cdbf436c3c15efaf5af9ad2be6f82c8bd26b049be0`), requisição `a2e1f968-90ec-407b-a9ae-92f8822677ea` e duração de chamada de cerca de 45,6 s, sem o cursor avançar. O próprio handler registra o mesmo `request_id`, o deployment 531 e `service_timeout` na fase de execução, com cerca de 40,8 s, às 09:51:22.759 do servidor; o HTTP da borda não foi medido nesta ocorrência, então a borda entra apenas como medida temporal, sem atribuição de status. A repetição com os mesmos argumentos e cursor concluiu com sucesso (cursor 169982 → 180692, cerca de 40,0 s). A contradição de T02, portanto, persiste no corte 531, e a atualização de definições não a corrigiu; a causa interna continua não determinada.

**Prova, relato e inferência.** Os retornos brutos de a1/a3 e os originais de handler e borda são arquivos preservados; a leitura no navegador seguiu apenas o relato do assistente, sem invólucro nativo. Que a falha de s67 tenha atingido o primeiro POST do handshake, antes de `tools/call`, é inferência a partir dos tamanhos na borda — três POSTs por chamada saudável, de 308, 54 e 1475 bytes —, não prova literal do método, porque a plataforma não registra o cabeçalho MCP nem o corpo JSON-RPC. A causa específica do `service_timeout` não foi localizada: não se atribui ao banco nem ao guard da resolução do principal. Na janela de 07:21:20 a 07:24 do relógio do servidor, 23 registros do PostgreSQL trazem SQLSTATE `57014` (statement timeout) e 21 do PostgREST trazem o mesmo código; sem `request_id` nas linhas do banco, isso permanece correlação, não vínculo. Os sete `57014` do segundo fluxo pertencem a outra janela e não se somam a estes. Uma calibração independente de cache quente mediu cerca de 482,5 ms no PostgreSQL para a leitura U1 — outro caminho, e sem a produção completa — e não explica os abortos de 8 a 40 segundos.

**Fronteira e correção.** O guard do PR 434 converte para falha de ferramenta apenas chamada `tools/call` válida cuja falha transitória ocorra na resolução do principal; ele não converteu o caso de s67. O PR 435 passou a reusar a retentativa já existente somente na leitura do principal (`resolve_mcp_oauth_principal_v1`), que é `stable` e revalida sessão, escopos e consentimento a cada tentativa; falha de serviço da chave administrativa (401 do PostgREST) segue tratada como indisponibilidade repetível, enquanto recusas de domínio (403/404 de revogação ou ausência) continuam sem repetição. A correção está integrada e implantada (PR 435, MCP 531, `ezbr_sha256 93f722c5…4a8e`); a causalidade do `-32603` permanece inferência, sem declarar o incidente curado.

**Par de leitura sob concorrência.** Uma execução pareada do mesmo subpipeline (Explicação e nove unidades) mediu 20 RPCs e 20 requisições HTTP em cada lado, sem falhas e sem diferença de payload entre concorrência 9 e 4, com 4.958 ms contra 2.667 ms no total. Como o recorte é o caminho direto local→PostgREST — não o Edge/MCP completo — e ordem e cache não são controlados, o resultado não confirma a hipótese de que a concorrência explique a recorrência, nem a exclui no fluxo completo.

## Atomicidade da fonte e replay

A gravação parcial de fonte relatada historicamente não teve retorno original suficiente para afirmar sua causa; isso não bloqueia a prova atual. A atomicidade está verificada no bundle atômico e no RPC real local, e o replay equivalente de source-flow foi verificado em 19 casos locais. Na fixture, a repetição de `manter_fonte` após pausa e nova execução, com argumentos congelados, devolveu resultado byte-idêntico e catálogo sem duplicação; a consulta interna autorizada confirmou os mesmos identificadores de fonte e âncora, revisão 17 constante e quatro fichas anteriores intactas. O seletor de páginas 3→1 foi recusado com 422 antes de escrever. Isso comprova o replay após pausa do cliente; não é indução de perda física de rede nem prova de rollback após commit. O resumo histórico alegadamente incompleto não foi preservado; a orientação de retomada agora declara seu alcance e não permite inferir ausência de conteúdo a partir do resumo.

## Matriz T01–T20 — 18 APROVADO, 1 FALHOU, 1 BLOQUEADO

Os estados se referem às provas e aos limites indicados, sem promover prova local a aceitação nativa. Todos os cenários se aplicam.

| Cenário | Resultado | Evidência e limite |
| --- | --- | --- |
| T01 caminhos mínimos do curso | APROVADO | Consultas nativas e leitura extensa concluídas; planejamento e acesso finais preservam revisão 555 e estado anterior. |
| T02 taxonomia de erro e retry | FALHOU | Serviço/local/CI aprovados; a fronteira externa permanece aberta. Nos cortes 529, 530 e 531 o conector devolveu indisponibilidade transitória com `error_code: INVALID_ARGUMENT` no `structuredContent`, e o `-32603` veio sem `structuredContent`; as séries dos cortes 530 e 531 estão em "Detalhe das falhas transitórias dos cortes 529, 530 e 531". A recusa de declaração inválida em `salvar_explicacoes` foi tipada e implantada (PR 433, MCP 529). Na fixture descartável, um bloqueio de source bundle devolveu 409 `course_write_uncertain` — resultado incerto de escrita, não conflito de base —, sem duplicar no replay. O guard do PR 434 cobre apenas `tools/call` e não fechou a fronteira; a retentativa focal da leitura do principal está integrada e implantada (PR 435, MCP 531). A etiqueta `INVALID_ARGUMENT` da camada do conector continua aberta. Na leitura pós-implantação, seis respostas repetiram a contradição — indisponibilidade transitória com `retryable: true` junto do `error_code` da camada do conector —; em três delas a borda foi medida em HTTP 200 e nas outras três esse status não foi medido. O patch de diagnóstico do PR 438 (MCP 536) está implantado; a prova nativa no 536 somou 50 sucessos em 51 chamadas (33 iniciais e 17 de recuperação controlada) e ele não fecha T02. A [documentação oficial consultada](https://developers.openai.com/plugins/reference#error-tool-result) e o [guia de conectores MCP](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) descrevem resultados de erro e metadata OAuth, mas não expõem regra para `INVALID_ARGUMENT` nem controle para reclassificá-la — isso registra que não encontramos regra exposta, não prova que ela não exista. |
| T03 retomada após falhas e reinício | APROVADO | Oito testes locais de interrupção; retomada nativa do checkpoint preservado até o fim, com recuperações reportadas no mesmo cursor — incluindo as repetições de s125 e s210 no corte 531 — e limite persistido de tentativas. Na leitura pós-implantação, a interrupção planejada caiu entre os fragmentos 110 e 111 e a retomada em nova célula concluiu o restante sem erro. |
| T04 integridade da remontagem | APROVADO | Testes locais e conferência nativa de oito páginas contíguas, bytes/hashes, literal, identidade dos alvos e referências. |
| T05 páginas lógicas e temMais | APROVADO | Testes locais e fim nativo `temMais=false`; transições entre páginas sem lacuna, checkpoint final sem cursor. |
| T06 bloqueio de parecer com escopo incompleto | APROVADO | O ensaio anterior, com cliente incompleto, tentou registrar 1 parecer após apenas a leitura da página 1 com `auditoria:false` e foi recusado — histórico preservado, não removido. No fluxo corrigido, os 48 registros nativos só ocorreram após a leitura formal completa (seis páginas, 289 respostas aceitas), com manifesto, guarda canônica do cliente em STUB, validação literal canônica e juízos próprios. A guarda é da orquestração, não uma proibição global da API por alvo. |
| T07 recortes explícitos e união | APROVADO | Regressões locais de recortes e união; a leitura nativa atual cobre 47 unidades e uma Explicação. |
| T08 conflito ao alterar conteúdo durante a auditoria | APROVADO | Fixture recusa base antiga sem escrita, relê a base atual e aceita inspeção válida. Nenhuma alteração induzida no curso real. |
| T09 dependências bibliográficas da base | APROVADO | Fonte vinculada invalida somente consumidores pertinentes; fonte e alvo não vinculados permanecem atuais, sem fila duplicada. |
| T10 evidência literal e seis dimensões | APROVADO | Testes do incidente preservam as exigências, e a prova real dos 48 registros confirma 288 verificações com evidência literal; o transporte nativo completo não substitui avaliação pedagógica. |
| T11 idempotência do parecer | APROVADO | Suíte de inspeção aprovada em fixture, e a exata repetição de um dos 48 pareceres (U1) devolveu resultado idêntico, sem duplicar; nenhuma aprovação humana no curso real. |
| T12 fonte criada após falha | APROVADO | Bundle/RPC/PostgREST real e replay nativo 527 após pausa; catálogo, IDs de fonte e âncora e quatro fichas anteriores preservados. O negativo 422 é recusa prévia à escrita. |
| T13 limite de 32 vínculos | APROVADO | Aceita 32 e recusa 33 antes de escrever; conserva fonte, âncora, papéis e identidades. |
| T14 retomada preserva identidades | APROVADO | Suíte local, comparação nativa das identidades de fonte e âncora e a comparação SQL independente posterior aos 48 registros, sem mudança fora da allowlist; curso real somente leitura. |
| T15 ida e volta de aplicação e configuração | APROVADO | Materialização nativa de teoria e prática com `ideia` obrigatória aceita em conversa nova; leitura de 4 fragmentos (41.277 caracteres, 12 parâmetros e 2 identificadores com a Explicação) e 45 práticas nativas acrescentadas, com readback de 52 fragmentos em 5 páginas e 47 identificadores. A recusa anterior ocorreu em conversa antiga, sem conclusão sobre a causa interna. |
| T16 reconciliação da Explicação | APROVADO | Suíte existente aprovada; referências e reconciliação obrigatórias preservadas. |
| T17 inspeção de IA não aprova humano | APROVADO | Testes aprovados, e a prova real dos 48 registros mantém a revisão humana ausente (`content_review={}`), sem aprovação fabricada. |
| T18 ausência de mutação em leitura e exclusividade do fluxo | APROVADO | Snapshots preservam revisão e acesso; registro original e código efetivamente executado comprovam dez lotes sequenciais de retomada no corte 103, chamadas de leitura aguardadas e término antes do lote seguinte. Telemetria histórica permanece parcial; não se infere exclusividade só de horários de fim. |
| T19 leitura formal grande com base própria | APROVADO | Prova local de 3.468.023 bytes e nativa real completa: oito páginas, 528 fragmentos, posições 1–47, uma Explicação e referências próprias conferidas. A fixture extensa de produção e inspeção permanece no gate T20. |
| T20 aceitação ponta a ponta após interrupção | BLOQUEADO | Três fluxos: o primeiro e o segundo medidos; o terceiro concluiu leitura, 48 registros e SQL final (305 sucessos em 312 chamadas, sete erros, revisão 166). O achado é o U15: 47 respostas informam recuperação de parecer e uma (U15) informa registro; o estado final dos 48 pareceres permaneceu igual. O primeiro cobriu seis páginas (289 de 291 invocações) e 49 chamadas de registro, com a comparação SQL em 118 → 166 e +48 recibos (158 → 206). O segundo teve 305 respostas válidas e 309 chamadas, com 48 brutos e uma captura de U1 perdida. Comparativo em "Três fluxos da aceitação". Na leitura pós-implantação, a interrupção planejada caiu entre os fragmentos 110 e 111 e a retomada em nova célula concluiu o restante: 311 chamadas, 305 concluídas e seis repetições absorvidas pelo retry limitado, seis hashes de página iguais aos do terceiro fluxo, revisão 166, 48 alvos e 288 verificações. A leitura pós-implantação correu no MCP 531 e permanece como prova anterior válida; o bloqueio decorre de T02, não de essa leitura não ter gravado: os três fluxos anteriores permanecem válidos. |

### Três fluxos da aceitação

| Fluxo | Leitura | Chamadas | Registro | SQL | Proveniência | Falhas de captura |
| --- | --- | --- | --- | --- | --- | --- |
| 1º, formal | 6 páginas; 289 aceitas em 291 invocações | 49 (registro) | 48 registros mais replay de U1 | 118 → 166; +48 recibos (158 → 206); 288 verificações | brutos preservados | A053 recuperado byte-exato por hash e proveniência, não perdido |
| 2º | 305 respostas válidas | 309 (leitura) | 49 chamadas de registro; 48 brutos; uma U1 irrecuperável | Cap intermediário: revisão 166. Comparação final conjunta após os fluxos 2 e 3; sem snapshot integral exclusivo após o 2 | brutos preservados | U1 irrecuperável: 49 chamadas de registro para 48 brutos |
| 3º (P3) | 6 páginas; 305 sucessos em 312 chamadas (7 erros: 4 antes do 531 e 3 `temporarily_unavailable` depois) | 312 | 48 chamadas, 48 originais, zero erro, 288 verificações; 47 informam recuperação e uma (U15) informa registro | Comparação final: 7 consultas, 8 execuções; revisão 166 e estado selecionado preservados; +48 recibos desde o primeiro fluxo | 312 originais conferidos; páginas iguais ao 2º fluxo e diferentes do 1º só nos campos esperados | Leitura e registros sem perda; primeira captura da consulta SQL Q2 perdida, repetição preservada |

A revisão humana permanece ausente (`content_review={}`) nos 48 pareceres. Na comparação SQL final, os recortes equivalentes aos payloads originais mudaram apenas `course_change_receipts` e `receipts_by_operation`: os 206 recibos anteriores seguem iguais, sem remoção, e o acréscimo de 48 abrange os fluxos 2 e 3, sem atribuir os 48 ao terceiro; a revisão 166, os 48 pareceres correntes com 288 verificações e os campos selecionados (identidades, configuração, fontes, âncoras, plano, parâmetros e orientações) permanecem iguais. A comparação final é contra o pós-primeiro-fluxo: sete originais finais estão íntegros e a primeira captura de Q2 perdeu-se antes do arquivo, sem afirmar oito retornos preservados; é limitação de captura desta rodada, não se chama a coleta de limpa nem se afirma ausência histórica de escrita além do snapshot preservado. Os retornos da consulta SQL não trazem status HTTP medido.

### Leitura pós-implantação

Depois da migração `20261007234650`, uma leitura completa de revisão foi reexecutada no MCP 531 na
mesma fixture sintética e comparada à linha de base anterior: seis páginas reconstruídas
com hashes idênticos, 47 unidades de estudo mais a Explicação (48 alvos distintos, seis
dimensões cada, 288 verificações), todas em estado corrente. A execução somou 3.601.479 ms
de parede, incluindo a pausa planejada de retomada, com 311 chamadas — 305 concluídas e
seis repetições absorvidas pelo retry limitado; o segundo segmento teve 195 conclusões e
nenhuma falha. A comparação cobre o conteúdo transportado dessa leitura, não o banco nem a
autorização inteiros, e não infere parecer novo.

## Mapa de consumidores e provas

| Módulo | Consumidores | Provas |
| --- | --- | --- |
| `courseHumanReadContext.js` | executor humano de leitura e continuação | [leitura de contexto](../tests/runtime/course-human-read-context.test.js) |
| `courseHumanTasks.js` | gateway MCP e servidor de Actions | [canal MCP](../tests/runtime/course-human-mcp.test.js) |
| `courseContentReviewReference.js` | registro de inspeção | [decisões de autoria](../tests/runtime/course-human-authoring-decisions.test.js) |
| `coursePedagogicalAudit.js` | registro de inspeção | [auditoria pedagógica](../tests/runtime/course-pedagogical-audit.test.js) |
| `mcpServer.js` | gateway MCP hospedado | [canal MCP](../tests/runtime/course-human-mcp.test.js) e [incidente](../tests/runtime/course-human-integration-incident.test.js) |

As provas desta frente são os [oito cenários do incidente](../tests/runtime/course-human-integration-incident.test.js) e as [sete regressões de paginação selecionada](../tests/runtime/course-review-read-fanout-incident.test.js). Os demais links identificam consumidores e suítes existentes.

## Provas locais executadas

O teste em [oito cenários do incidente](../tests/runtime/course-human-integration-incident.test.js) constrói em memória um curso com 47 unidades, uma Explicação extensa e 32 fontes, sem copiar conteúdo real. Ele verifica a leitura formal completa, a união de identificadores por recortes explícitos, a retomada pelo mesmo cursor após falhas antes e depois da montagem, o reinício do cliente, fragmentos com caracteres fora do plano básico, lacuna, duplicata, `temMais`, a exigência das seis dimensões com evidência literal, a separação entre inspeção de IA e revisão humana, a recusa de referência obsoleta e a ausência do campo `error_code` na saída local.

Na execução local registrada do cenário de escala, o percurso levou 33877,2481 ms, com latência de 101,3642 a 208,2383 ms por chamada, volume de 3112669 caracteres em 3468023 bytes, quatro páginas e 289 fragmentos, maior chamada de 13536 bytes, pico de RSS de 582479872 bytes e de heap de 440308504 bytes, confrontando por alvo o percurso completo com os recortes 1–7, 8–27 e 28–47 na mesma fixture. Esse é o orçamento empírico, sem limite de latência imposto.

## Pendências hospedadas

As credenciais hospedadas estão disponíveis e o backend foi verificado por clientes reais de OAuth e pelos endpoints implantados. A leitura nativa de uma Explicação sintética passou integralmente, com 140 caracteres, referências de revisão e inspeção, `temMais=false` e resposta persistida; essa prova curta não é aceitação de uma auditoria extensa.

Sob a interface do conector, **Atualizar ferramentas** respondeu HTTP 200 em 2026-10-07T09:36:15Z, com as 56 ações canônicas idênticas antes, durante e depois — inclusive os quatro caminhos de `explicacoes[].ideia` —, mudando apenas o carimbo `updated_at` e sem alterar permissões, conta, OAuth ou curso: nesse corte não houve desvio corrigido pela atualização, e o payload expõe somente a forma pública do erro (`code`, `message`, `retryable`), sem mapeamento de `error_code`, `INVALID_ARGUMENT` ou HTTP. Em seguida, um pedido único pediu apenas a leitura de acesso de uma fixture sintética: a interface concluiu e a atividade registrou a consulta, mas o JSON visível é conteúdo do assistente, não o recibo bruto da ferramenta; a captura da resposta do conector indicou HTTP 200 com corpo já indisponível e aborto de transporte, com apenas o invólucro preservado. Não se alega SSE bruto recuperado, e o cancelamento de transporte — com a interface concluída normalmente — não é atribuído ao AraLearn. Nenhuma escrita real foi feita.

Uma conversa antiga observou a recusa de `unidades[].aplicacaoPedagogica.explicacoes[].ideia` antes do handler. O schema do repositório e o `tools/list` autenticado do MCP permitem e exigem `ideia` e `formas`; os dois contratos concordam, e a materialização nativa de teoria e prática com `ideia` obrigatória já foi aceita em conversa nova. A causa interna daquela recusa (regra, importação ou cache) segue inconclusiva e não se afirma recusa global do conector. Não se removeu a referência obrigatória para contornar a rejeição, nem se enfraqueceu nenhum controle.

Na leitura do curso real, quatro respostas chegaram antes de um 503 em uma janela anterior; os bytes e o cursor não foram preservados pelo coletor antigo, portanto não há prova de remontagem ou retomada daquelas quatro. Os logs correlacionaram duas falhas à execução do MCP com código interno `service_timeout`, classe transitória e status 503. O prazo específico que expirou não foi identificado: cada requisição usa oito segundos e até três tentativas, enquanto a chamada tem orçamento global de quarenta segundos. Na leitura atual (corte 103) não houve falha não recuperada; retornos integrais de falhas anteriores não foram preservados. Foram feitas somente consultas no curso real; revisão 555 e acesso permaneceram iguais, sem alegar snapshot completo de fontes, configuração e pareceres.

## Reuso da base de inspeção: integrado e implantado (PR 437)

O [PR 437](https://github.com/fabio-ara/AraLearn/pull/437) foi integrado e implantado:
merge `ebf7c9a0295c403ec51599c4dfdb657c35f39ee1` e árvore
`aed472af6e51cf32c79d0e8d2788d606eb85d575`. A
[CI 37712202013](https://github.com/fabio-ara/AraLearn/actions/runs/37712202013) aprovou os
cinco gates aplicáveis — 916 asserções pgTAP, paridade de 740 objetos e 585 passagens
Playwright —, com certificado, origem `b533` e hashes conferidos. A verificação de
implantação de 2026-10-08 (UTC) confirmou o schema `20261007234650` aplicado, 248
migrações e nenhuma pendente, com a verificação hospedada aprovada e as funções MCP 531,
API 374 e Actions 398 inalteradas.

A migração `20261007234650_reuse_inspection_basis_within_read.sql` e o
`runtime-manifest.json` na revisão `20261007234650` mantêm o critério de parada:
reduzir o trabalho repetido dentro de uma mesma requisição de leitura de inspeção sem
mudar o contrato observável — `basisHash`, `pedagogicalBasis`, `inspection` e o payload
permanecem idênticos, e `stable`, `security definer`, `search_path` e ACL são
preservados.

Reprodução: dois bancos PGlite com as migrações reais (47 unidades, uma Explicação
e 32 fontes) comparados sem instrumentação — nenhum wrapper, nenhuma função
trocada. Os sha256 dos payloads de unidade e de Explicação e da montagem são
idênticos antes e depois, com os mesmos bytes, e o tempo local cai no A/B,
inclusive na ordem invertida. A contagem exata de avaliações de base em execução
ficou inconclusiva: o coletor de funções do PGlite não sustenta o delta por
chamada.

Testes focais: `course-read-basis-reuse-pglite.test.js` cobre estados
current/pending/unregistered, objeto ausente, base nula e Explicação sem corpo,
upgrade que não altera dados nem o carimbo da gravação, ACL com controles, seis
dimensões com evidência literal, separação IA/humana, recusa de base obsoleta,
negação por papel/ator e replay idempotente. O bloco pgTAP correspondente foi
acrescentado à família de explicação/revisão; as expressões foram validadas em PGlite
neste host, e o gate de integração da CI aprovou a suíte pgTAP, com 916 asserções.

Diagnóstico local corrente: uma montagem completa LOCAL→PostgREST da página do
recorte registrou 68 RPCs, 7.719 ms de parede e 3.195.573 bytes, devolvendo o
mesmo fragmento antes conhecido (offsets idênticos e mesmo sha256 do texto); uma
chamada do conector nativo à mesma página levou 9.344 ms e devolveu o mesmo
fragmento. São duas observações pontuais, obtidas antes desta migração, sem
estabilidade medida; não explicam os ~40 s históricos e não constituem correção
externa.

Estado: **integrada e implantada em 2026-10-08**, e **T02 permanece aberto**. A
migração não afirma causa hospedada: a validação de SCs125 confere o `outputSchema`
das ferramentas, e a camada de Actions não explica T02; nenhuma das duas é prova
de causa do incidente.

## Limitações e cuidados

As correções do PR 429, do PR 430 e do corte 0.0.103 estão integradas e implantadas; o fallback textual de erro do canal MCP está implantado (PR 432, MCP 528); e a correção de tipagem da reconciliação inválida está implantada (PR 433, MCP 529 e Actions 397). A falha transitória do principal em `tools/call` válido está corrigida e implantada (PR 434, MCP 530), restrita a esse caminho, sem contorno de autenticação e sem eliminar o `error_code` da camada do conector. Esse guard cobre apenas `tools/call`; a retentativa focal da leitura do principal (`resolve_mcp_oauth_principal_v1`) está integrada e implantada (PR 435, MCP 531). O registro de dependência e orçamento de falhas RPC está integrado e implantado pelo [PR 438](https://github.com/fabio-ara/AraLearn/pull/438) — MCP 536 (`d8d91147…4983`), API 379 (`0ba0b076…be5d`) e Actions 403 (`07d40148…c532`). Esse patch altera três módulos do servidor de autoria e preserva contrato público, autorização e prazos; a recuperação da publicação com o padrão oficial `--use-api` preservou os bytes aprovados e não mudou o ambiente. A prova nativa no MCP 536 somou 50 sucessos em 51 chamadas — 33 iniciais e 17 de recuperação controlada, com `issues: []` —, sem leitura completa no 536, e manteve uma falha s109 a1; na recuperação de 17 chamadas não houve nova ocorrência do HTTP 500 nem indisponibilidade transitória. T02 continua FALHOU e T20 BLOQUEADO. No cruzamento dessa janela, os 116 POST observados na borda foram 200 ×56, 202 ×30 e 400 ×30, sem nenhum 5xx, sem `aralearn.authoring.error`/`dependency` e com 20 boots apontando o deployment 536; sem `requestId` do cliente, a correlação é apenas temporal, e a ausência de 500 na janela não prova que a chamada não chegou. Os 400 não são explicados por método, rota, protocolo, `Accept` ou `user-agent`, que coincidem com os 200; `MCP-Protocol-Version` e `Content-Type` da requisição não estão disponíveis nos logs, e o tamanho do corpo não permite atribuir causa. Uma prova curta de acesso no MCP 531 (03:57 UTC, 1,9 s) passou e cobre acesso, não a aceitação. A classificação de T02 persiste depois da atualização de definições no corte 531. A entrega do incidente não está concluída. O servidor não comprova consumo intelectual: a garantia de leitura completa antes do parecer pertence ao cliente de autoria. As contagens de disponibilidade descrevem a janela observada e não são uma taxa geral. Resultados hospedados permanecem separados dos locais, e a inspeção de IA não é aprovação humana. Os registros históricos preservam suas limitações de captura. No primeiro fluxo, o coletor sobrescreveu um registro bruto e os bytes exatos foram recuperados pelo hash, com proveniência registrada; no segundo, uma captura de U1 não foi recuperada. Na comparação SQL final, feita contra o pós-primeiro-fluxo, sete originais finais estão íntegros e a primeira captura de Q2 se perdeu antes do arquivo. Os arquivos permanecem fora do Git e não se afirma que nenhum original foi reescrito.

## Diagnóstico interno de dependência: integrado e implantado (PR 438)

> Patch **somente de diagnóstico** (altera três módulos do servidor), integrado e implantado pelo
> [PR 438](https://github.com/fabio-ara/AraLearn/pull/438) — merge
> `43d0c640bd9f33524ed0dc4ef16f55513deaa83c`, fonte
> `a35596390fbde44c368dc56b3bbfe821c719139c`, árvore
> `b42dd8644817329dddd8209c254bb2b0329eae27` igual à aprovada. Não afirma causa do incidente: o código prova que existe
> um orçamento de 40 s na execução e que `service_timeout` nasce no adapter, mas **não**
> prova qual RPC consome o orçamento. A prova nativa no MCP 536 reúne 51 chamadas com 50 sucessos
> — 33 na prova inicial e 17 na recuperação controlada de 109–115 e 296–305, executada em
> 05:29:24.693→05:31:14.603Z (109.910 ms), 17 de 17 sem erro e `issues: []` no gate de recebimento —
> e uma falha s109 a1 (05:00:06.159→05:00:17.321Z, 11.162 ms, raw de 523 B, sha256 `50319317…`)
> que chegou como erro de transporte HTTP 500, sem `structuredContent`, sem `requestId` e sem
> `-32603`. Na recuperação, o cursor de entrada de s109 é idêntico ao da tentativa que falhou e as cinco
> comparações com o P4 (texto, offset, entrada e saída, na cadeia) são verdadeiras nas 17; o
> terminal ficou em 305 com `temMais=false`, cursor nulo e revisão 166. Na recuperação de 17
> chamadas, não houve nova ocorrência do HTTP 500 nem indisponibilidade transitória: a causa não
> fica resolvida, e T02/T20 continuam como estão.
>
> Integração: [CI 37724155866](https://github.com/fabio-ara/AraLearn/actions/runs/37724155866)
> cuja única tentativa foi aprovada nos quatro grupos aplicáveis (Android não aplicável): Node
> 2.780 PASS, 0 FAIL e 15 SKIP em 2.795; Playwright 585 PASS; 916 asserções pgTAP em 22
> arquivos e paridade de 740 objetos. Local: 2.739 PASS, 0 FAIL e 15 SKIP nos quatro gates; os
> conjuntos focais (14) e adjacentes (180) são execuções sobrepostas, não somadas.

O evento único `aralearn.authoring.error` ganha um campo opcional `dependency`, emitido
somente quando a falha vem de uma chamada RPC do adapter (`rpc()`) e sem alterar a forma
pública do erro MCP (o erro público continua com `code`, `message`, `retryable` e
`diagnostico`). Campos:

- `rpc`: nome da função PostgREST validado por um **enum fechado** — lista explícita
  mantida no código com os nomes de RPC do adapter — usado pelo mesmo validador no
  handler MCP. Nome fora da lista vira `null`, mesmo com forma válida; nunca URL,
  query, payload, header, token, ator, curso, cursor ou mensagem.
- `reason`: `deadline_exhausted` (orçamento já esgotado antes do fetch), `budget_abort`
  (a tentativa foi abortada porque o orçamento global acabou), `attempt_abort` (a
  tentativa individual estourou o próprio tempo) e `attempt_error` (transporte/HTTP
  encerrou as tentativas). O motivo do abort é decidido pelo limite que o timer agendou.
- `attemptsStarted`: quantos fetches foram realmente iniciados (0 = a dependência não
  iniciou); `attemptsAllowed`: o limite configurado de tentativas. É essa contagem — não
  o tempo — que diz se a dependência chegou a rodar.
- `elapsedMs`: tempo total nesta chamada, **não** o tempo de cada tentativa;
  `remainingMs`: orçamento restante na falha. Ambos inteiros de 0 a 600000 ms.

Leitura e projeção são best-effort: getter hostil ou erro congelado não derruba a
resposta. O diagnóstico viaja na própria exceção (não em estado do adapter), não é
enumerável e não aparece no JSON do erro nem no `structuredContent`; requisições
concorrentes não o compartilham. Registros anteriores, sem o campo, permanecem com a
mesma forma.
