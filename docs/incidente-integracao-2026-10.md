# Incidente de integração MCP do AraLearn — fechamento 0.0.104

Esta é a declaração de fechamento do incidente. O escopo do AraLearn está entregue: os testes pertinentes foram aprovados e a versão 0.0.104 foi publicada. A classificação adicional do rótulo do conector permanece não resolvida e fora do escopo desta entrega. Cada prova mantém o alcance declarado; nada aqui promete ausência universal de falhas.

## Situação corrente: 0.0.104/250 e backend atualizado

AraLearn 0.0.104, Android 250. Código integrado pelo [PR 442](https://github.com/fabio-ara/AraLearn/pull/442), commit [1e674c3d](https://github.com/fabio-ara/AraLearn/commit/1e674c3d2b99b9175ea3c88eb817b2580c3e3198), árvore `bb780154ad260041e9dbffb9cae82c5e7b651286`, idêntica à candidata aprovada. Commits de implementação: [99b50ee1](https://github.com/fabio-ara/AraLearn/commit/99b50ee17bab01b4bfc8ea6f4aee94df7037a5dc) e [eb96f7ac](https://github.com/fabio-ara/AraLearn/commit/eb96f7ac27b95e4108dd0a21289d467f1cc7a175). O registro documental posterior não muda os bytes dessa versão.

Em produção: MCP 538, Actions 404 e API 379. A verificação hospedada passou; nove fontes implantadas coincidem byte a byte com as fontes aprovadas. Schema `20261007234650`, biblioteca v1 e catálogo `11.1.0`; onze digests de segredos inalterados. Não houve migração, mudança de permissão ou enfraquecimento da autorização neste corte.

Bundles: MCP `c713fc119715bf60c8832b3cac348cb6df2cbae8c788f467b2a8f04362006d70`; Actions `6a2b54378e87380a54d1f77a7d5ee2dc57879d2ff2138eefc8eebee8efb675fe`; API `0ba0b0765463fd1ace889460d3ce17b6b8c8396cd1af0110b85196ac0e30be5d` (inalterada). Catálogo: `4b698ec5e1309c73886df618dddcd7d3af4023cbbfcad421ebbe6698fdda7de6`.

## Verificações da entrega

- Preparação local: cinco gates aprovados, 2.765 testes de runtime aprovados, zero falhas e quinze dispensas existentes; 6.360 hashes de inputs conferidos.
- [CI 37809742867](https://github.com/fabio-ara/AraLearn/actions/runs/37809742867), tentativa 1, aprovada: cinco jobs; 585 testes web aprovados e dez dispensas; 916 asserções pgTAP em 22 arquivos; dois testes Deno; paridade de 740 objetos. Contagens pertencem a conjuntos diferentes e não devem ser somadas.
- [Preparação 37814936651](https://github.com/fabio-ara/AraLearn/actions/runs/37814936651): APK assinado e prova Android v2 aprovados. Instalação limpa, atualização desde 0.0.67/213 e reinstalação, com UID e preferência de tema preservados; dezesseis arquivos de evidência tiveram os hashes conferidos e duas telas foram inspecionadas. Essa prova não certifica restauração de dados de conta ou de curso.
- [Publicação do site 37818213742](https://github.com/fabio-ara/AraLearn/actions/runs/37818213742): backend, instalação Android e 204 recursos efetivamente publicados conferidos.
- [Finalizador 37823276159](https://github.com/fabio-ara/AraLearn/actions/runs/37823276159), tentativa 1, aprovado: [release 0.0.104](https://github.com/fabio-ara/AraLearn/releases/tag/v0.0.104) pública em 08/10/2026 às 18:19:38Z, identidade e digests dos três assets conferidos. APK: `88ef1cbfa09852d572888fa2af547872d203f3df9eb56cd19cb359aac68afb40`, 3.863.809 bytes; certificado `c3d2ad6c97e44492c09d785d2d5e9f461eb6399914b196119e2cba0e5d271296`.

## Diagnóstico e correções comprovadas

O AraLearn tinha defeitos próprios: divergência entre o contrato de saída e o envelope de erro, tipagem genérica de reconciliação inválida, cobertura incompleta da falha transitória ao resolver a credencial, paginação aplicada tarde às seleções explícitas e replay de fonte sensível à ordem das chaves JSON. Os patches anteriores a 0.0.104, preservados no histórico, corrigiram esses caminhos. A gravação de fonte usa um pacote atômico; a causa exata da gravação parcial relatada no anexo antigo não foi reproduzida e não é atribuída retroativamente a uma única falha.

O novo relatório confirmou repetição excessiva de citações no contexto de auditoria e ambiguidade ao consolidar vínculos de uma mesma fonte. A projeção agora guarda as citações por foco e página e fornece referências posicionais por alvo, conservando o conteúdo literal. O seletor opcional `vinculo` em `aplicar_correcoes` permite escolher o vínculo corrente a preservar. A atualização usa o conjunto final em uma única escrita; sem seletor, a ambiguidade continua sendo recusada. Uma seleção que deixou de existir exige nova leitura; conflito durante a correção com seletor não dispara repetição automática com uma seleção antiga.

Na fixture sintética de volumetria, a projeção passou de 1.052.489 para 362.887 bytes, redução de 65,52%, e de 84 para 30 fragmentos. Isso mede a projeção em uma fixture de oito unidades e uma Explicação, não o tempo HTTP nem a causa dos erros 503. A medição nativa extensa fica separada abaixo.

O resumo histórico alegadamente incompleto não foi preservado com detalhe suficiente para reproduzir aquela ocorrência. O teste H2 de `course-human-source-flow.test.js` verifica que a retomada declara o alcance do resumo e não sugere ausência de conteúdo; o H3 verifica que uma página de busca vazia com continuação não encerra a busca, inclusive quando o resultado só aparece na página seguinte. Ambos integram a cobertura aprovada.

Os timeouts de RPC e as falhas de obtenção de chaves têm fronteira observada nos logs. Há correlação temporal com cancelamentos do banco, sem vínculo por identificador que demonstre o SQL responsável. Não se declara tamanho, banco ou timeout como causa única de todas as ocorrências.

## Contrato e clientes reais

Foram consultadas as fontes primárias de [resultados de ferramentas da OpenAI](https://developers.openai.com/plugins/reference#tool-results), [diagnóstico de servidor](https://developers.openai.com/plugins/deploy/troubleshooting#server-side-issues), [conectores MCP](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) e a [especificação MCP](https://modelcontextprotocol.io/specification/2025-11-25/server/tools). A validação AJV usou o `outputSchema` extraído do handler real: duas capturas de erro e uma de sucesso passaram, com e sem o campo adicional `error_code`; três controles negativos foram recusados.

Houve uma recusa concreta de `vinculo` como propriedade adicional antes da atualização das definições da conexão ChatGPT. A atualização respondeu HTTP 200, preservou as 56 ações e trouxe o campo; depois disso, a mesma chamada nativa de um cliente real foi aceita. A mesma correção também foi repetida por cliente real pelo conector com sucesso. O schema atualizado contém `explicacoes[].ideia` e aceita a forma da entrada correspondente; não se confunde essa validação de forma com materialização nativa concluída depois da atualização.

Na conexão ChatGPT, a revisão dos originais corrigiu um erro de coleta nosso: as respostas estavam em `content.text`, não em `content.parts`. São 58 chamadas bem-sucedidas no recorte observado, com terminal de leitura; esse recorte cobre uma unidade, não as 47 unidades da auditoria extensa. Assim, não há evidência de incapacidade geral dos clientes reais usados para o contrato. Cada prova mantém seu próprio alcance.

O rótulo adicional `error_code: INVALID_ARGUMENT`, observado junto de `temporarily_unavailable` e `retryable: true`, ainda não tem produtor demonstrado. Os testes do contrato emitido pelo AraLearn passaram; a classificação adicional ponta a ponta permanece não resolvida e fora do critério de entrega conforme o mandato vigente. Não foi atribuído esse comportamento à OpenAI como fato e não se depende de contato com suporte.

## Prova nativa após a implantação

A leitura nativa do MCP 538, pela conexão AraLearn, preservou **262 respostas completas**, remontadas em seis páginas, com **47 unidades e uma Explicação**, **48 alvos** e **288 verificações nas seis dimensões**. Os 262 hashes e tamanhos dos retornos, a cadeia dos cursores, os offsets em UTF-16, a identidade do curso e a revisão 166 foram conferidos. O terminal é `temMais=false`, com continuação nula. Os textos dos fragmentos somam 2.755.373 unidades UTF-16 e 2.817.201 bytes UTF-8; os arquivos dos retornos brutos somam 3.579.117 bytes. São medidas diferentes e não devem ser confundidas.

A coleta registrada foi de 17:17:47.169Z a 18:12:13.128Z, incluindo pausas e interrupções do executor. As chamadas preservadas somam 1.731.650 ms de duração; isso não é o tempo total de parede nem uma previsão de disponibilidade. Os lotes produziram 3, 8 e 251 respostas completas. O último lote retomou o checkpoint 11 e chegou ao fragmento 262 sem erro do AraLearn e sem retentativa. Uma resposta adicional foi observada no executor interrompido antes da persistência do bruto; a leitura foi repetida no mesmo cursor. Portanto, 262 conta respostas completas preservadas, não todas as invocações observadas.

A comparação integral contra as seis páginas da linha de base P4 passou sem divergências inesperadas, após reidratar as referências de citações e excluir somente a orientação de transporte `leituraDaAuditoria`. O comparador tem controles negativos para conteúdo, citação, referência, cursor, diretório vazio/ausente e erro disfarçado de sucesso. A leitura anterior exigiu 305 fragmentos completos; a nova exigiu 262 na mesma fixture. Os 288 checks são inspeções anteriores preservadas, não novos juízos produzidos nesta rodada.

A retomada ocorreu depois de interrupções reais do executor, em novas execuções, com o cursor salvo. O negativo isolado posterior enviou uma continuação da projeção antiga: recebeu `human_read_context_changed`, diagnóstico 409, `retryable: false`, sem fragmento e sem avanço do checkpoint. Esse conflito de contexto não deve ser tratado como indisponibilidade temporária.

A prova nativa de fonte consolidou dois vínculos da mesma fonte em um vínculo com três ocorrências. A repetição devolveu a mesma leitura; uma seleção inexistente foi recusada com 422 sem alteração. Uma nova repetição por cliente real, entre duas consultas SQL somente de leitura, preservou o objeto inteiro, o identificador do vínculo e os três identificadores de ocorrências. Não há snapshot SQL anterior à primeira consolidação: a preservação desse identificador original é prova local, enquanto a preservação dos identificadores no replay é também prova hospedada. O caminho de unidade tem cobertura automatizada local; esta nova prova nativa do seletor cobre a Explicação.

## Matriz corrente T01–T20

Esta é a matriz do fechamento 0.0.104: cada linha declara a prova e o limite do que ela cobre. Estados registrados em datas anteriores permanecem no registro histórico deste documento e não substituem esta leitura. T02 recebe aprovação somente do contrato emitido pelo AraLearn, com a classificação adicional não resolvida explicitada.

| Cenário | Resultado | Evidência e limite |
| --- | --- | --- |
| T01 caminhos mínimos do curso | APROVADO | Consultas nativas e leitura completa da MS8 real; snapshots preservados; H2 verifica o alcance declarado do resumo. |
| T02 taxonomia de erro e repetição | APROVADO no contrato do AraLearn | Testes de erros de entrada, conflito, indisponibilidade e autenticação; AJV sobre capturas reais; recusa nativa 422. O rótulo adicional do conector permanece não resolvido, fora do critério da entrega. |
| T03 retomada após falhas e reinício | APROVADO | Provas locais de falha antes/depois da montagem, retomada nativa histórica e retomada nova do checkpoint. |
| T04 integridade da remontagem | APROVADO | Unicode e posições locais; oito páginas e 528 fragmentos reais; comparação integral nova contra a linha de base. |
| T05 páginas lógicas e terminal | APROVADO | Transições contíguas e terminal `temMais=false`, continuação nula; H3 verifica a continuação da busca após página vazia. |
| T06 leitura completa antes do parecer | APROVADO | Guarda do cliente, tentativa incompleta recusada e 48 registros nativos após leitura formal completa. O servidor não comprova consumo intelectual. |
| T07 recortes explícitos e união | APROVADO | Regressões de recortes e união de 47 unidades; alvo omitido não é renovado pela revisão de outro alvo. |
| T08 rejeição de base desatualizada | APROVADO | Fixture recusa a base antiga sem escrita e aceita inspeção após nova leitura. Nenhuma falha induzida em curso real. |
| T09 dependências bibliográficas da base | APROVADO | Mudança em fonte vinculada invalida os consumidores pertinentes; alvos não relacionados permanecem atuais. |
| T10 evidência literal e seis dimensões | APROVADO | Negativos locais e 288 verificações nos 48 pareceres nativos; nova projeção comparada integralmente. |
| T11 idempotência do parecer | APROVADO | Repetição nativa exata de U1 sem duplicação, além das regressões locais. |
| T12 fonte criada após falha | APROVADO | Bundle atômico e RPC real local; replay nativo após pausa preserva fonte, âncora e catálogo. Não é simulação de perda física de rede em produção. |
| T13 limite de vínculos | APROVADO | Aceita 32 e recusa 33 antes de escrever, preservando identidades e papéis. |
| T14 preservação de identidades | APROVADO | Testes locais, snapshots nativos anteriores e replay novo com SQL somente leitura antes/depois: vínculo e três ocorrências idênticos. |
| T15 aplicação e configuração na ida e volta | APROVADO | Materialização nativa anterior de teoria e prática com `ideia`, 47 identificadores e readback completo; schema atualizado conferido. Não se alega nova materialização após o refresh. |
| T16 reconciliação da Explicação | APROVADO | Regressões da reconciliação e recusa tipada 422 sem gravação; invariantes mantidas. |
| T17 inspeção de IA separada de revisão humana | APROVADO | 48 inspeções nativas preservam `content_review={}`; não foi fabricada aprovação humana. |
| T18 leitura sem mutação e fluxo exclusivo | APROVADO | Curso real somente leitura; fixture sem gravações na leitura nova; curso, revisão e conteúdo conferidos; um operador por sequência. |
| T19 leitura formal grande com base própria | APROVADO | Prova local de 3.468.023 bytes e MS8 real completa: oito páginas, 528 fragmentos, 47 unidades e uma Explicação com referências próprias. |
| T20 aceitação nativa após interrupção | APROVADO | Produção/releitura/48 inspeções/consulta já percorridas em fixture; leitura integral pós-projeção concluída e comparada após retomada em nova execução. |

## Continuidade segura

No curso real da MS8 já existem 47 unidades e uma Explicação. A investigação fez somente consultas e não concluiu a autoria. A próxima sessão deve obter estado e referências frescos antes de escrever, preservar as identidades e evitar recriação. Leitura íntegra de transporte não substitui juízo pedagógico: manter evidência literal, seis dimensões e separação entre inspeção de IA e revisão humana. O curso real produzido em paralelo foi preservado.

<details>
<summary>Registro histórico anterior ao fechamento 0.0.104</summary>

Este bloco descreve o estado anterior ao fechamento 0.0.104. Expressões como “pendente”, “não concluído” ou “bloqueado” descrevem a data daquele registro, e inferências ali anotadas não se convertem em causa demonstrada.

## Estado histórico antes de 0.0.104

Estado efetivo em 2026-10-08, depois do [PR 440](https://github.com/fabio-ara/AraLearn/pull/440): MCP 537 ativo (implantado 14:20:15Z; bundle `825895ec9e97448f6eae188cd47de24da7d5d91b56240dae62673cf9f242e20e`), API 379 e Actions 403 inalteradas, `verify_jwt=false`, schema `20261007234650` com 248 migrações aplicadas e nenhuma pendente, e verificação hospedada aprovada; o texto hospedado do `mcpServer` coincide exatamente com a fonte aprovada (`133CD83F8709AC0BFE12166AD712BBFFBAD4A97D59ECB729EB657D39FEFB0597`) e os 11 digests de segredos seguem iguais. A main está em `db79f9d62cbf0aa5063b8a40d6e2e92c3d5de752`. A implementação 0.0.104/250 está em preparação local (versionamento e notas) e **não implantada nem publicada**; o APK 0.0.103/249 segue em rascunho. Pelo critério corrente — que mede o AraLearn e deixa a camada externa fora do gate por decisão do titular — T02 está **APROVADO** no contrato do AraLearn (provas locais e de CI existentes mais a validação AJV das capturas), com a classificação ponta a ponta **não resolvida**; T20 está **APROVADO** na leitura extensa anterior do P4, com retomada, e a prova pós-nova-projeção é **PENDENTE** até execução. A cronologia abaixo registra as promoções até este ponto e permanece histórica.

O corte 0.0.103 está integrado e implantado. Commit fonte [8bb99856](https://github.com/fabio-ara/AraLearn/commit/8bb99856290b318a1da04d977f393bb546afac56); merge/principal [b1621e95](https://github.com/fabio-ara/AraLearn/commit/b1621e9534afa22cbeec7b4fc50dc71fc3ce0c82), árvore idêntica à certificada; na verificação do corte, checkout limpo e principal local e remota coincidentes. A revisão independente aprovou 49 testes; o source-flow teve 19 aprovações; o conjunto focal teve 126. São conjuntos sobrepostos, não somados. A preparação passou nos cinco gates aplicáveis, com runtime local de 2709 aprovações, zero falhas e as 15 dispensas existentes.

A [CI integral 37485403915](https://github.com/fabio-ara/AraLearn/actions/runs/37485403915) aprovou cinco jobs: web 585 aprovações e dez dispensas locais cobertas pelo Supabase real; 906 asserções pgTAP em 22 arquivos; paridade de 738 objetos; clientes reais OAuth/MCP/PostgREST/RLS; canais, Storage e Android; limpeza concluída. Certificado, origem, árvore, configuração e hashes foram conferidos. A [preparação 37491227270](https://github.com/fabio-ara/AraLearn/actions/runs/37491227270) produziu o APK 0.0.103/249 e a prova Android v2 — instalação limpa, atualização desde 0.0.67/213 e reinstalação, com identidade e tema preservados; dezesseis arquivos de evidência tiveram os hashes conferidos e duas telas foram inspecionadas. A prova Android não certifica restauração de dados de conta ou de curso.

O backend foi reconfirmado em 2026-10-06T17:42:57Z (então MCP 527, Actions 396 e API 373), com identidades e autorização preservadas e onze configurações inalteradas. A verificação de implantação somou 234 aprovações, zero falhas e nenhuma dispensa, com schema `20261005120000` e sem migrações, seeds ou papéis pendentes. Passaram contrato hospedado, OAuth inicial e renovado, isolamento e autoria por clientes reais; biblioteca v1, 56 capacidades e catálogo `aralearn.human-authoring-tasks` `11.1.0` permanecem. O [publicador 37493868502](https://github.com/fabio-ara/AraLearn/actions/runs/37493868502) conferiu backend, prova Android e bytes e publicou o [site 0.0.103](https://fabio-ara.github.io/AraLearn/) com 204 recursos verificados. O APK 0.0.103/249 (`9eb917c0…befce`) permanece em rascunho enquanto a aceitação nativa estiver aberta; rascunhos anteriores e a última release pública Android 0.0.100/246 foram preservados.

A leitura nativa do curso real da MS8 terminou: oito páginas contíguas, 528 fragmentos, 47 unidades nas posições exatas 1–47 e uma Explicação, com `temMais=false`. A conferência cobriu bytes e hashes, ausência de lacunas, ordem, os alvos das 94 referências de unidade, o curso e os tipos das referências, a repetição íntegra da Explicação e o escopo. O checkpoint final 530 ficou sem cursor; os snapshots finais de planejamento e acesso mantêm a revisão 555 e o estado public/available/saved. Foram feitas somente consultas: nenhuma inspeção, parecer ou alteração foi registrada no curso real.

Este corte fecha duas causas demonstradas: a comparação canônica de fichas de fonte contra JSONB real — o replay que criava duplicatas por ordem de chaves — e o compartilhamento da leitura de fonte prevista e vinculada em `preparar_revisao` (duas consultas em vez de quatro por requisição, sem cache entre requisições e sem DDL, prazo ou fluxo de escrita novo). A recusa de `explicacoes[].ideia` vista numa conversa antiga ficou como observação inconclusiva, aceita em conversa nova (T15 aprovado); a correlação das falhas de chave segue aberta, e a entrega do incidente continua não concluída.

O [PR 433](https://github.com/fabio-ara/AraLearn/pull/433) foi integrado em 2026-10-07T01:58:48Z: merge `21182dec75543a695e26ad8c16213bd40c6a83f8`, árvore `a108068c916cde1d87b5656fcb13e164afd491d5` (igual à candidata). A [CI 37556738345](https://github.com/fabio-ara/AraLearn/actions/runs/37556738345) aprovou preparação, web e Supabase, com Android não aplicável; a [preparação de Pages 37559756460](https://github.com/fabio-ara/AraLearn/actions/runs/37559756460) e a [publicação 37559971323](https://github.com/fabio-ara/AraLearn/actions/runs/37559971323) concluíram a promoção, com 204 recursos conferidos. O backend efetivo passou a MCP 529 e Actions 397 (API 373 inalterada), `verify_jwt=false`, schema `20261005120000` sem DDL novo; o site já correspondia aos bytes certificados.

O [PR 434](https://github.com/fabio-ara/AraLearn/pull/434) foi integrado em 2026-10-07T06:51:43Z: merge `5595ba221731dcc23e087156992d9babad3023e5`, árvore `d6b2be4559d7ade03bbb6a0bc4512166d55393f5` (igual à candidata). A [CI 37580407405](https://github.com/fabio-ara/AraLearn/actions/runs/37580407405) aprovou preparação, web e Supabase, com Android não aplicável; a [preparação de Pages 37584037033](https://github.com/fabio-ara/AraLearn/actions/runs/37584037033) e a [publicação 37585491362](https://github.com/fabio-ara/AraLearn/actions/runs/37585491362) concluíram a promoção, com 204 recursos conferidos. O backend efetivo passou a MCP 530 (`ezbr_sha256 c2ead2a4f780bd81ae48d18743aa7398b730ba6a05b9e5f7e3ffce236e6e60a1`), com API 373 e Actions 397 inalteradas, `verify_jwt=false` e schema `20261005120000` sem DDL novo; o site já correspondia aos bytes certificados.

O [PR 435](https://github.com/fabio-ara/AraLearn/pull/435) foi integrado em 2026-10-07T09:36:07Z: merge `786f1d2f5bfd83ad819b1bd8a50fe94d0c49e81b`, árvore `2aae7a76df2917f1ad5e5fb1984fdaedb9cfbfca` (igual ao certificado). A [CI 37593218862](https://github.com/fabio-ara/AraLearn/actions/runs/37593218862) teve a tentativa 1 reprovada em 1 de 585 testes web (584 aprovações, 1 falha e 10 dispensas) — `ERR_NO_BUFFER_SPACE` no primeiro carregamento, sem cancelamento e sem causa estabelecida — e a tentativa 2 aprovada sobre os mesmos bytes em preparação, web e Supabase, com Android não aplicável; a [preparação de Pages 37601914330](https://github.com/fabio-ara/AraLearn/actions/runs/37601914330) e a [publicação 37602033378](https://github.com/fabio-ara/AraLearn/actions/runs/37602033378) concluíram a promoção, com 204 recursos conferidos. O backend efetivo passou a MCP 531 (`ezbr_sha256 93f722c575798234b84b89b53a1d6623b64d35c426c3b9ae929de6d99dbe4a8e`), API 374 (`16fbd9ffcae92ea1172b9e8ae5c45e1ee2db157241469cdcb95d67c3af50a801`) e Actions 398 (`955116b34b2751272d43618671f328b82bebe74b3824d71b6e59c8beae31e909`), `verify_jwt=false` e schema `20261005120000` sem DDL novo; o site já correspondia aos bytes certificados.

## Resumo

A investigação separa o comprovado do aberto. Estão corrigidos e implantados, no corte 0.0.103, o envelope JSON-RPC de erro e o identificador de correlação, o contrato de saída de sucesso e erro, o bundle atômico de fonte, a paginação de seleção, a comparação canônica do replay, a classificação tipada da reconciliação inválida e a classificação da falha transitória do principal em `tools/call` válido. Permanecem abertos o campo `error_code`/`INVALID_ARGUMENT` observado nas respostas reais dos cortes 529, 530 e 531 — sem regra interna acessível, atribuí-lo a uma transformação externa é inferência, não fato demonstrado —, a recusa de `explicacoes[].ideia` vista numa conversa antiga — aceita em conversa nova, sem falha global e com causa interna inconclusiva —, e a correlação das falhas do provedor de chaves. No critério corrente, T02 está **APROVADO** no contrato do AraLearn (provas locais e de CI existentes e validação AJV das capturas) e T20 está **APROVADO** na leitura extensa anterior do P4, com retomada; a classificação ponta a ponta do `error_code` segue não resolvida e fora do gate, e a prova pós-nova-projeção é **PENDENTE**. No **histórico** do corte 0.0.103, T02 ficou FALHOU e T20 BLOQUEADO, e os demais dezoito cenários estavam aprovados no gate pertinente. A falha transitória do principal em `tools/call` válido foi corrigida no PR 434 (MCP 530) e a leitura do principal ganhou retentativa no PR 435 (MCP 531); a classificação de T02, naquele momento, persistiu após a atualização de definições no corte 531.

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

O [PR 440](https://github.com/fabio-ara/AraLearn/pull/440) integrou e implantou a correção (merge
`0d6fe50c53a564f2448ce75c96b4f4213935e91c`, fonte `7cf18031e5e536cd4cd12d010c771d3ff44ec7c4`,
árvore `0319b8da1a603daf110aa2a5a95c8ea4ce74cd7f`): quando o verificador do token não consegue
buscar o JWKS durante a resolução do principal, uma chamada `tools/call` bem formada passa a receber
o envelope de falha da ferramenta — HTTP 200 com `result.isError`, `structuredContent` e o texto
público —, sem executar a ferramenta e mantendo o rótulo de diagnóstico na fase `autenticacao`.
Recusas de credencial (401/403), limite de taxa (429) e falha interna preservam o contrato de
transporte. No teste local com o verificador real, JWKS e assinatura válidos na chamada seguinte
recuperam e executam a tarefa uma única vez, sem reutilizar a chave da tentativa que falhou; não há
indução de JWKS em produção.

O fechamento focal da investigação cobre a janela 06:12–06:22Z, com quatro timeouts de RPC e duas
falhas de JWKS; o defeito de fase do guard foi confirmado localmente; o vínculo entre o 504 do JWKS e
o 503 do handler é temporal e não um traço 1:1; e os métodos das duas respostas 503 de autenticação
não são conhecidos, sem afirmar que ambas foram `tools/call`. Estatísticas cumulativas de
`pg_stat_statements` não incluem cancelamentos e não provam SQL rápido nos `57014`. Nenhum patch
adicional de SQL, retry ou prazo foi feito.

Após a implantação, a prova nativa no MCP 537 fechou 10 chamadas reais em três execuções — 109–110,
111–112 com o cursor persistido retomado e 300–305 até o terminal —, com 10 sucessos, zero erros e
`autoRetry=false`; os 10 registros coincidem com o P4 em cursor de entrada e saída, offsets e texto,
na revisão 166. A revisão independente dos originais foi concluída em 14:31:40.362Z com `issues: []`: bytes dos brutos iguais ao P4, hashes e tamanhos dos 10 retornos brutos conferidos contra seus
metadados, curso e revisão 166 preservados, cadeias contíguas 109–112 e 300–305 e
terminal `null`/`false`; a execução correu de 14:23:54.028 a 14:25:37.785Z, sem retry e sem falha,
limitada a três janelas. Nenhuma nova leitura integral de 305 no 537 foi executada: o P4 integral
(305/311 com seis recuperações) permanece válido.

Validação do PR 440: a [CI 37786992834](https://github.com/fabio-ara/AraLearn/actions/runs/37786992834)
passou com 2.783 aprovadas no runtime Node (0 falhas e 15 dispensas), 585 no Playwright (10
dispensas), 916 asserções pgTAP em 22 arquivos e paridade de 740 objetos; os focais locais somaram 88
(12 do verificador e 76 do canal MCP), o incidente 8 e o Deno 2, e a preparação local ampla ficou em
2.742 aprovadas, 0 falhas e 15 dispensas — conjuntos sobrepostos, não somados. A primeira preparação
teve uma falha do WASM do PGlite (`initdb`) antes das asserções desse arquivo; o arquivo isolado passou 21/21 e
a única repetição, com os mesmos bytes, passou; a causa não foi determinada e o log integral não foi
preservado.

**Correção material (08/10/2026).** A alegação anterior de “67 corpos de ferramenta vazios” no GET foi **erro nosso de coleta**: o corpo das mensagens de ferramenta vive em `content.text` quando `content.content_type == "code"`, e o extrator anterior lia apenas `content.parts`. Fonte bruta: `conversation-turn-20261008.auth.network-response` (1.243.341 B, sha256 `078320314cc81c4f0db570572ba131d1d8474c650f24dcb24f1607f8151400f1`), que traz `.messages`. Contagem exata da janela alvo (recorte de 146 mensagens, deslocamento 37): **68 mensagens de ferramenta** — 58 `api_tool.call_tool` (com `content.text` presente nas 58), 9 `functions.exec` (texto vazio; **não são pendência de entrega** — sem extração adicional nesta frente) e 1 `api_tool.read_resource` (em `parts`); no arquivo inteiro são 77 (63 api, 13 exec, 1 read_resource). A contagem antiga de “67” era 58 mais 9 e **omitia o `read_resource`**: por isso não se fala em “67 tools”. A raiz validou a SHA e as contagens diretamente no JSON; o parsing, a terminação e os offsets vêm do coletor v2, e não se afirma que todas as provas foram feitas sem extrator. Nas **58 chamadas** `api_tool.call_tool` (todas `preparar_revisao`), os argumentos persistidos são `{auditoria, curso, microssequencia, unidades}` mais `continuacao`; nos **58 retornos**, as chaves são `{result, deepLink, links, nextDecision, context}`, com `links` = 2 em todos, zero erro exposto e nenhum parse falho. O terminal é `temMais=false` com `continuacao=null` na 58ª chamada. A seleção foi a unidade 1 (`fragmento.total=396.792`), não as 47 unidades, e não há traço HTTP no registro. Cadeia de cursor: 55 de 57 continuações encadeiam exatamente; a 12ª e a 32ª reancoram no token do 10º retorno e releem dali — 37 fragmentos distintos em 58 chamadas, e a releitura coincide com as pausas de limite do executor, não com erro de servidor. Nada disso reclassifica automaticamente eventos antigos de outros arquivos; o antigo 409 da outra conversa vale apenas pelo bruto até a data própria. A camada externa do `error_code` permanece fora do gate, sem exigir suporte, e nenhuma solicitação foi enviada.

## Taxonomia de erro e schema público

A taxonomia corrente distingue indisponibilidade transitória, conflito de estado e entrada inválida: falhas transitórias respondem `temporarily_unavailable` com `retryable: true`, e referências ausentes respondem `human_reference_not_found` com `retryable: false`. O campo `error_code: INVALID_ARGUMENT` não é produzido pelo código analisado do AraLearn nem aparece na saída nativa local do canal MCP; uma transformação posterior é compatível com as capturas, mas o produtor e o runtime dessa transformação não foram demonstrados — atribuí-la a uma camada específica é inferência, não fato. Na resposta real do corte 529, uma indisponibilidade transitória chegou como 503 `temporarily_unavailable` com `retryable: true`, e o `structuredContent` trazia `error_code: INVALID_ARGUMENT` — combinação que a saída nativa do AraLearn não produz; o texto JSON preservou `error` e `nextDecision`, a nova tentativa com os mesmos argumentos e cursor devolveu `-32603` sem `structuredContent`, e a terceira teve sucesso, com cerca de 45,6 s e 9,9 s medidas entre os envios. A inspeção de tela e a leitura autenticada da conversa salva no ChatGPT Web confirmaram que uma consulta separada com continuação obsoleta, relatada como 409, era a própria resposta final do assistente: no JSON da conversa o invólucro está em `role: assistant`, e a chamada `functions.exec` em `role: tool` está vazia, sem expor o retorno; a atividade da interface registra o evento de ferramenta, mas o texto exato do erro só é afirmado pelo modelo. O caminho do navegador comprova que a captura funciona e que não faltou permissão, sem servir como prova independente do invólucro bruto do MCP; os retornos 503 e 409 lidos nos arquivos brutos nativos seguem como evidência forte, e a causa administrativa, de cache ou de permissão permanece sem prova. Os logs do handler do corte 529 confirmam `service_timeout` na fase de execução, com cerca de 41,2 s, e um segundo evento na fase de resolução principal, com cerca de 9,5 s; o primeiro 503 traz `request 497d6253-2bd6-412c-b3ec-c3fa44cd1a42` e liga diretamente o evento do handler ao retorno bruto, enquanto o segundo só se correlaciona ao `-32603` por ordem e duração, porque o retorno não traz identificador; um 503 anterior à execução pode explicar o descarte do diagnóstico do `-32603`, e sete SQL `57014` na mesma janela permanecem como correlação, sem causa demonstrada. A origem externa do `-32603` e a definição efetivamente usada pelo conector permanecem não fechadas. A mensagem do conector que menciona o administrador do espaço de trabalho não implica, por si, exigir uma permissão nova: a investigação deve conferir a definição efetivamente usada pelo conector e alinhá-la ao contrato servido, sem supor um responsável exclusivo; qual regra, importação ou cache produz a divergência segue sem conclusão. Um 422 `invalid_pedagogical_audit` novo decorreu de citação de representação ausente na base canônica: o cliente procurou a citação no envelope inteiro em vez de em `pedagogicalBasis` e usou um rótulo público projetado (`leitura_complementar`) em vez do enum canônico (`recommended_reading`); a validação do servidor está correta e não há correção de produto. Retirada apenas essa citação, o registro nativo passou no corte 529, com corpo, seis dimensões, estado corrente e referências próprias conferidos pelo recibo original (`sha256:FFB012F7…1497`), sem aprovação humana fabricada.

**Contrato de saída verificado (08/10/2026).** Uma revisão independente testou **três capturas** (duas de erro e uma de sucesso) contra o `outputSchema` anunciado pelo `tools/list` real (o mesmo do catálogo humano), com AJV 2020-12: todas são conformes com e sem o campo `error_code`, e os controles negativos (erro sem `nextDecision`, sucesso e erro juntos, sucesso sem `deepLink`) foram corretamente recusados; o schema não declara `additionalProperties: false` na raiz nem em `error`. O escopo é esse conjunto testado, não uma prova universal. A hipótese de que o `error_code` viola o schema anunciado **não se reproduz**. As fontes primárias — [resultados de ferramenta](https://developers.openai.com/plugins/reference#tool-results) e a [especificação MCP 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — sustentam `structuredContent`/`isError`, mas não atribuem `INVALID_ARGUMENT`. O campo segue como camada externa não observável daqui, fora do gate e sem exigir suporte.

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

## Matriz T01–T20 — histórico (18 APROVADO, 1 FALHOU, 1 BLOQUEADO) e leitura corrente

Os estados se referem às provas e aos limites indicados, sem promover prova local a aceitação nativa. Todos os cenários se aplicam.

### Critério corrente (08/10/2026)
- **T02 — APROVADO** no contrato do AraLearn: provas locais e de CI existentes e validação AJV das capturas pelo `outputSchema` anunciado. A classificação ponta a ponta do `error_code` permanece **não resolvida** e **fora do gate**, por decisão do titular, sem exigir suporte.
- **T20 — APROVADO** na leitura extensa anterior (P4, com retomada). A prova pós-nova-projeção é **PENDENTE** até execução; não se promete 20/20.
- **Demais cenários — APROVADO** conforme o histórico. Nenhum cenário é **NÃO APLICÁVEL** neste momento, e **BLOQUEADO** deixa de ser o estado corrente de T20.

A tabela abaixo é o **registro histórico** e permanece como prova do percurso.

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

### Provas novas pendentes (não prometidas como concluídas)
- Leitura pós-nova-projeção do P4 (T20): executar e comparar com a linha de base anterior; hoje **PENDENTE**.
- Classificação ponta a ponta do `error_code`: **fora do gate** por decisão do titular, sem caminho de acesso demonstrado daqui.
- Volumetria da leitura compartilhada de citações: **aceita**. Contexto **sintético** volumoso (8 unidades mais a Explicação; 2 páginas, 5+3), delta contra a projeção anterior (db79f9d6) verificado em `native-plan/baseline-fidelity.json`: 1.052.489 → 362.887 B (65,52%), 72 ocorrências → 24 objetos guardados e 84 → 30 fragmentos. É fixture sintética, não curso real; não é medição HTTP e não explica o 503; não se afirmam ganhos de tempo. O arquivo focal passou 14/14, e os pacotes de consumidores (43, 8, 5 e 21) são sobrepostos e não se somam.
- Vínculo opcional das correções: implementado e testado LOCAL (item 4 do pacote); deploy e prova nativa seguem pendentes, sem abrir P441.
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

## Pacote de entrega (ZIP) — itens correntes

1. **Logs e fronteira de RPC.** Seis identificadores de erro de autoria dos cortes 531/536, anteriores ao 537, e a fronteira de RPC correspondente ficam registrados sem atribuir causa ao SQL; os `57014` permanecem correlação temporal, sem `request_id` no banco.
2. **Contrato do AraLearn.** Validação AJV das capturas contra o `outputSchema` anunciado (três capturas: duas de erro e uma de sucesso, conformes com e sem o campo; controles negativos recusados) e fontes primárias de resultados de ferramenta e da especificação MCP que sustentam `structuredContent`/`isError`, sem atribuir `INVALID_ARGUMENT`.
3. **Citações compartilhadas na leitura.** A leitura de auditorias extensas compartilha citações repetidas dentro de cada página, preservando o texto completo e as referências de cada alvo; a métrica sintética do consumidor está aceita (ver “Provas novas pendentes”).
4. **Vínculo opcional na correção atômica (unidade e Explicação).** **Implementado e testado LOCAL** (não implantado, sem prova nativa). O seletor `vinculo` (1..32) vale só em `aplicar_correcoes` — `correcoes[].fontes` e `explicacoes[].fontes` — e exige posição corrente, fonte coerente e uso único; sem o campo, o guard de ambiguidade permanece. Limites: depois de consolidar, a posição escolhida pode deixar de existir, e o replay é **recusado sem escrita**, exigindo reler os vínculos; com seletor não há releitura automática de CAS (`stale_course_state` 409), então **não se certifica** a seleção antes do carregamento. Provas focais: correções 29/29; consumidores 122/122 e 43/43 (conjuntos sobrepostos, não somar). Deploy em produção e prova nativa seguem **PENDENTES**; pelo precedente do registro histórico (PR 437), este lote **não abre P441**.
## Limitações e cuidados

As correções do PR 429, do PR 430 e do corte 0.0.103 estão integradas e implantadas; o fallback textual de erro do canal MCP está implantado (PR 432, MCP 528); e a correção de tipagem da reconciliação inválida está implantada (PR 433, MCP 529 e Actions 397). A falha transitória do principal em `tools/call` válido está corrigida e implantada (PR 434, MCP 530), restrita a esse caminho, sem contorno de autenticação e sem eliminar o `error_code` da camada do conector. Esse guard cobre apenas `tools/call`; a retentativa focal da leitura do principal (`resolve_mcp_oauth_principal_v1`) está integrada e implantada (PR 435, MCP 531). O registro de dependência e orçamento de falhas RPC está integrado e implantado pelo [PR 438](https://github.com/fabio-ara/AraLearn/pull/438) — MCP 536 (`d8d91147…4983`), API 379 (`0ba0b076…be5d`) e Actions 403 (`07d40148…c532`). Esse patch altera três módulos do servidor de autoria e preserva contrato público, autorização e prazos; a recuperação da publicação com o padrão oficial `--use-api` preservou os bytes aprovados e não mudou o ambiente. A prova nativa no MCP 536 somou 50 sucessos em 51 chamadas — 33 iniciais e 17 de recuperação controlada, com `issues: []` —, sem leitura completa no 536, e manteve uma falha s109 a1; na recuperação de 17 chamadas não houve nova ocorrência do HTTP 500 nem indisponibilidade transitória. No histórico do corte 0.0.103, T02 estava FALHOU e T20 BLOQUEADO; no critério corrente, T02 está **APROVADO** no contrato do AraLearn e T20 está **APROVADO** na leitura extensa anterior (P4), com a prova pós-nova-projeção **PENDENTE**. No cruzamento dessa janela, os 116 POST observados na borda foram 200 ×56, 202 ×30 e 400 ×30, sem nenhum 5xx, sem `aralearn.authoring.error`/`dependency` e com 20 boots apontando o deployment 536; sem `requestId` do cliente, a correlação é apenas temporal, e a ausência de 500 na janela não prova que a chamada não chegou. Os 400 não são explicados por método, rota, protocolo, `Accept` ou `user-agent`, que coincidem com os 200; `MCP-Protocol-Version` e `Content-Type` da requisição não estão disponíveis nos logs, e o tamanho do corpo não permite atribuir causa. Uma prova curta de acesso no MCP 531 (03:57 UTC, 1,9 s) passou e cobre acesso, não a aceitação. A classificação de T02, no corte 531, persistiu depois da atualização de definições. A entrega do incidente não está concluída: a classificação ponta a ponta do `error_code` segue não resolvida e fora do gate, e a prova pós-nova-projeção está pendente. O servidor não comprova consumo intelectual: a garantia de leitura completa antes do parecer pertence ao cliente de autoria. As contagens de disponibilidade descrevem a janela observada e não são uma taxa geral. Resultados hospedados permanecem separados dos locais, e a inspeção de IA não é aprovação humana. Os registros históricos preservam suas limitações de captura. No primeiro fluxo, o coletor sobrescreveu um registro bruto e os bytes exatos foram recuperados pelo hash, com proveniência registrada; no segundo, uma captura de U1 não foi recuperada. Na comparação SQL final, feita contra o pós-primeiro-fluxo, sete originais finais estão íntegros e a primeira captura de Q2 se perdeu antes do arquivo. Os arquivos permanecem fora do Git e não se afirma que nenhum original foi reescrito.

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

</details>
