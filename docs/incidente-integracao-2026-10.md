# Incidente de integração MCP do AraLearn (outubro de 2026)

## Situação corrente: corte 0.0.103 integrado e implantado

O corte 0.0.103 está integrado e implantado. Commit fonte [8bb99856](https://github.com/fabio-ara/AraLearn/commit/8bb99856290b318a1da04d977f393bb546afac56); merge/principal [b1621e95](https://github.com/fabio-ara/AraLearn/commit/b1621e9534afa22cbeec7b4fc50dc71fc3ce0c82), árvore idêntica à certificada; na verificação do corte, checkout limpo e principal local e remota coincidentes. A revisão independente aprovou 49 testes; o source-flow teve 19 aprovações; o conjunto focal teve 126. São conjuntos sobrepostos, não somados. A preparação passou nos cinco gates aplicáveis, com runtime local de 2709 aprovações, zero falhas e as 15 dispensas existentes.

A [CI integral 37485403915](https://github.com/fabio-ara/AraLearn/actions/runs/37485403915) aprovou cinco jobs: web 585 aprovações e dez dispensas locais cobertas pelo Supabase real; 906 asserções pgTAP em 22 arquivos; paridade de 738 objetos; clientes reais OAuth/MCP/PostgREST/RLS; canais, Storage e Android; limpeza concluída. Certificado, origem, árvore, configuração e hashes foram conferidos. A [preparação 37491227270](https://github.com/fabio-ara/AraLearn/actions/runs/37491227270) produziu o APK 0.0.103/249 e a prova Android v2 — instalação limpa, atualização desde 0.0.67/213 e reinstalação, com identidade e tema preservados; dezesseis arquivos de evidência tiveram os hashes conferidos e duas telas foram inspecionadas. A prova Android não certifica restauração de dados de conta ou de curso.

O backend foi reconfirmado em 2026-10-06T17:42:57Z: MCP 527, Actions 396 e API 373, com identidades e autorização preservadas e onze configurações inalteradas. A verificação de implantação somou 234 aprovações, zero falhas e nenhuma dispensa, com schema `20261005120000` e sem migrações, seeds ou papéis pendentes. Passaram contrato hospedado, OAuth inicial e renovado, isolamento e autoria por clientes reais; biblioteca v1, 56 capacidades e catálogo `aralearn.human-authoring-tasks` `11.1.0` permanecem. O [publicador 37493868502](https://github.com/fabio-ara/AraLearn/actions/runs/37493868502) conferiu backend, prova Android e bytes e publicou o [site 0.0.103](https://fabio-ara.github.io/AraLearn/) com 204 recursos verificados. O APK 0.0.103/249 (`9eb917c0…befce`) permanece em rascunho enquanto a aceitação nativa estiver aberta; rascunhos anteriores e a última release pública Android 0.0.100/246 foram preservados.

A leitura nativa do curso real da MS8 terminou: oito páginas contíguas, 528 fragmentos, 47 unidades nas posições exatas 1–47 e uma Explicação, com `temMais=false`. A conferência cobriu bytes e hashes, ausência de lacunas, ordem, os alvos das 94 referências de unidade, o curso e os tipos das referências, a repetição íntegra da Explicação e o escopo. O checkpoint final 530 ficou sem cursor; os snapshots finais de planejamento e acesso mantêm a revisão 555 e o estado public/available/saved. Foram feitas somente consultas: nenhuma inspeção, parecer ou alteração foi registrada no curso real.

Este corte fecha duas causas demonstradas: a comparação canônica de fichas de fonte contra JSONB real — o replay que criava duplicatas por ordem de chaves — e o compartilhamento da leitura de fonte prevista e vinculada em `preparar_revisao` (duas consultas em vez de quatro por requisição, sem cache entre requisições e sem DDL, prazo ou fluxo de escrita novo). Não fecha a recusa externa de `explicacoes[].ideia` nem a correlação das falhas de chave; a entrega do incidente continua não concluída.

## Resumo

A investigação separa o comprovado do aberto. Estão corrigidos e implantados, no corte 0.0.103, o envelope JSON-RPC de erro e o identificador de correlação, o contrato de saída de sucesso e erro, o bundle atômico de fonte, a paginação de seleção e a comparação canônica do replay. Permanecem abertos o campo `error_code`/`INVALID_ARGUMENT` acrescentado pela camada do conector, a recusa de `explicacoes[].ideia` observada em uma conversa antiga, com causa interna inconclusiva, e a correlação das falhas do provedor de chaves. O estado final tem T02 e T06 como FALHOU e T20 como BLOQUEADO; os demais dezessete cenários estão aprovados no gate pertinente.

## Texto de erro MCP integrado e implantado

O bloco textual dos erros do canal MCP passa a espelhar a mesma projeção pública já enviada em `structuredContent`, como JSON analisável com código, mensagem, repetibilidade, correlação e a decisão de retomada. O limite é medido sobre o envelope JSON-RPC inteiro, com o identificador real do cliente. Quando o espelho excederia o limite de 2 MiB da resposta, o texto reduz a um resumo JSON com esses campos públicos e um aviso explícito do limite, mantendo os detalhes completos — bloqueios e recuperação — na resposta estruturada, sem truncá-los nem expor dados brutos. Se nem o resumo couber, porque a própria projeção estruturada já excede o limite total, aplica-se a falha de limite já existente (413), sem prometer uma resposta íntegra. A motivação segue a recomendação de compatibilidade reversa da [especificação MCP 2025-11-25 para conteúdo estruturado](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#structured-content): clientes que leem apenas o texto deixavam de receber a classificação e a retomada. Sucesso, Actions, schemas de entrada e `outputSchema` não mudam. A correção está **integrada e implantada** no corte 0.0.103 ([PR 432](https://github.com/fabio-ara/AraLearn/pull/432), principal `c2cb6acf`, MCP 528); o site já correspondia aos bytes certificados (204 recursos) e o Android não se aplica, sem APK alterado. A aceitação nativa pelo caminho do conector segue pendente, sem conclusão sobre importação ou cache.

## Delta em preparação: classificação da reconciliação inválida

Uma declaração de reconciliação com papel que exige ideia (`introduced`, `established` ou `revisited`) e nenhuma ideia informada — ou com referência repetida, ou motivo em branco — fazia a normalização lançar um `TypeError` cru, apresentado como 500 `internal_error`. **Em preparação**, essa recusa passa a ser erro de entrada tipado `invalid_explanation_reconciliation` (422, `retryable: false`), com bloqueador que indica a passagem e o papel — ou, quando a recusa é do conjunto, um bloqueador de limite honesto (número de passagens ou tamanho serializado) —, exposto também no canal MCP; a validação não foi afrouxada e nenhuma gravação ocorre. Ainda não implantado; é uma correção de tipagem da taxonomia (T02), distinta do fallback textual de erro.

## Histórico essencial

Os cortes anteriores corrigiram, com prova local própria, o envelope JSON-RPC de autenticação (identificador preservado e código próprio de indisponibilidade) e o schema público de saída: o [PR 429](https://github.com/fabio-ara/AraLearn/pull/429) e o [PR 430](https://github.com/fabio-ara/AraLearn/pull/430). A criação de fonte passou a usar um bundle atômico; o replay equivalente de source-flow foi verificado em 19 de 19 casos locais; a paginação de seleção explícita passou a anteceder as consultas de revisão e inspeção. A restauração e a atualização de fixtures em contêineres isolados passaram sob o contrato `aralearn.backup-restore-upgrade-proof.v3`, preservando treze grupos de dados e permissões; objetos do Storage conservam apenas os metadados. Cada correção tem sua própria prova, e a aceitação nativa de uma não certifica a seguinte.

## Causa correlacionada do provedor de chaves

Quatro pares de falha 504 do endpoint de chaves antecedem quatro das vinte e duas falhas do gateway MCP. A correlação cobre quatro falhas e não explica as vinte e duas; nenhum limite rígido de volume é inferido dessa janela. As chamadas HTTP malsucedidas duraram entre 5 e 14 segundos, e o valor registrado entre 58 e 72 ms é tempo de CPU utilizado, não a duração da função.

## Taxonomia de erro e schema público

A taxonomia corrente distingue indisponibilidade transitória, conflito de estado e entrada inválida: falhas transitórias respondem `temporarily_unavailable` com `retryable: true`, e referências ausentes respondem `human_reference_not_found` com `retryable: false`. O campo `error_code: INVALID_ARGUMENT` não existe no código do AraLearn nem aparece na saída nativa local do canal MCP; ele é acrescentado pela camada do conector. A origem externa do `-32603` e a definição efetivamente usada pelo conector permanecem não fechadas. A mensagem do conector que menciona o administrador do espaço de trabalho não implica, por si, exigir uma permissão nova: a investigação deve conferir a definição efetivamente usada pelo conector e alinhá-la ao contrato servido, sem supor um responsável exclusivo; qual regra, importação ou cache produz a divergência segue sem conclusão.

## Atomicidade da fonte e replay

A gravação parcial de fonte relatada historicamente não teve retorno original suficiente para afirmar sua causa; isso não bloqueia a prova atual. A atomicidade está verificada no bundle atômico e no RPC real local, e o replay equivalente de source-flow foi verificado em 19 casos locais. Na fixture, a repetição de `manter_fonte` após pausa e nova execução, com argumentos congelados, devolveu resultado byte-idêntico e catálogo sem duplicação; a consulta interna autorizada confirmou os mesmos identificadores de fonte e âncora, revisão 17 constante e quatro fichas anteriores intactas. O seletor de páginas 3→1 foi recusado com 422 antes de escrever. Isso comprova o replay após pausa do cliente; não é indução de perda física de rede nem prova de rollback após commit. O resumo histórico alegadamente incompleto não foi preservado; a orientação de retomada agora declara seu alcance e não permite inferir ausência de conteúdo a partir do resumo.

## Matriz T01–T20 — 17 APROVADO, 2 FALHOU, 1 BLOQUEADO

Os estados se referem às provas e aos limites indicados, sem promover prova local a aceitação nativa. Todos os cenários se aplicam.

| Cenário | Resultado | Evidência e limite |
| --- | --- | --- |
| T01 caminhos mínimos do curso | APROVADO | Consultas nativas e leitura extensa concluídas; planejamento e acesso finais preservam revisão 555 e estado anterior. |
| T02 taxonomia de erro e retry | FALHOU | Serviço/local/CI aprovados; o conector classificou 503 como INVALID_ARGUMENT e o -32603 perdeu o diagnóstico. Fronteira externa permanece aberta; duas falhas novas só têm registro resumido. Um 500 novo em `salvar_explicacoes` (declaração inválida apresentada como falha interna) tem correção de tipagem em preparação, ainda não implantada. |
| T03 retomada após falhas e reinício | APROVADO | Oito testes locais de interrupção; retomada nativa do checkpoint preservado até o fim, com duas recuperações reportadas no mesmo cursor e limite persistido de tentativas. |
| T04 integridade da remontagem | APROVADO | Testes locais e conferência nativa de oito páginas contíguas, bytes/hashes, literal, identidade dos alvos e referências. |
| T05 páginas lógicas e temMais | APROVADO | Testes locais e fim nativo `temMais=false`; transições entre páginas sem lacuna, checkpoint final sem cursor. |
| T06 bloqueio de parecer com escopo incompleto | FALHOU | Ensaio nativo tentou registrar 1 parecer após apenas a leitura da página 1 com `auditoria:false`, sem a leitura formal completa das 47 unidades; o retorno foi recusado e a raiz interrompeu para o estado somente leitura. É falha do cliente de teste, não do servidor; a reconciliação do salvo permanece pendente e não se afirma zero escrita sem recibo. A revalidação exige execução corrigida com guard mecânico. A guarda de completude pertence à orquestração, não a uma proibição global do servidor por alvo. |
| T07 recortes explícitos e união | APROVADO | Regressões locais de recortes e união; a leitura nativa atual cobre 47 unidades e uma Explicação. |
| T08 conflito ao alterar conteúdo durante a auditoria | APROVADO | Fixture recusa base antiga sem escrita, relê a base atual e aceita inspeção válida. Nenhuma alteração induzida no curso real. |
| T09 dependências bibliográficas da base | APROVADO | Fonte vinculada invalida somente consumidores pertinentes; fonte e alvo não vinculados permanecem atuais, sem fila duplicada. |
| T10 evidência literal e seis dimensões | APROVADO | Testes do incidente preservam as exigências; o transporte nativo completo não substitui avaliação pedagógica. |
| T11 idempotência do parecer | APROVADO | Suíte de inspeção aprovada em fixture; sem novos pareceres no curso real. |
| T12 fonte criada após falha | APROVADO | Bundle/RPC/PostgREST real e replay nativo 527 após pausa; catálogo, IDs de fonte e âncora e quatro fichas anteriores preservados. O negativo 422 é recusa prévia à escrita. |
| T13 limite de 32 vínculos | APROVADO | Aceita 32 e recusa 33 antes de escrever; conserva fonte, âncora, papéis e identidades. |
| T14 retomada preserva identidades | APROVADO | Suíte local e comparação nativa das identidades de fonte e âncora; curso real somente leitura. |
| T15 ida e volta de aplicação e configuração | APROVADO | Materialização nativa de teoria e prática com `ideia` obrigatória aceita em conversa nova; leitura de 4 fragmentos (41.277 caracteres, 12 parâmetros e 2 identificadores com a Explicação) e 45 práticas nativas acrescentadas, com readback de 52 fragmentos em 5 páginas e 47 identificadores. A recusa anterior ocorreu em conversa antiga, sem conclusão sobre a causa interna. |
| T16 reconciliação da Explicação | APROVADO | Suíte existente aprovada; referências e reconciliação obrigatórias preservadas. |
| T17 inspeção de IA não aprova humano | APROVADO | Testes aprovados; nenhuma aprovação humana fabricada. |
| T18 ausência de mutação em leitura e exclusividade do fluxo | APROVADO | Snapshots preservam revisão e acesso; registro original e código efetivamente executado comprovam dez lotes sequenciais de retomada no corte 103, chamadas de leitura aguardadas e término antes do lote seguinte. Telemetria histórica permanece parcial; não se infere exclusividade só de horários de fim. |
| T19 leitura formal grande com base própria | APROVADO | Prova local de 3.468.023 bytes e nativa real completa: oito páginas, 528 fragmentos, posições 1–47, uma Explicação e referências próprias conferidas. A fixture extensa de produção e inspeção permanece no gate T20. |
| T20 aceitação ponta a ponta após interrupção | BLOQUEADO | Três passagens do handler local passaram; a aceitação pela integração real, com fixture extensa e inspeção, aguarda prova de execução terminada — não depende de uma falha global de T15. |

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

Uma conversa antiga observou a recusa de `unidades[].aplicacaoPedagogica.explicacoes[].ideia` antes do handler. O schema do repositório e o `tools/list` autenticado do MCP permitem e exigem `ideia` e `formas`; os dois contratos concordam, e a materialização nativa de teoria e prática com `ideia` obrigatória já foi aceita em conversa nova. A causa interna daquela recusa (regra, importação ou cache) segue inconclusiva e não se afirma recusa global do conector. Não se removeu a referência obrigatória para contornar a rejeição, nem se enfraqueceu nenhum controle.

Na leitura do curso real, quatro respostas chegaram antes de um 503 em uma janela anterior; os bytes e o cursor não foram preservados pelo coletor antigo, portanto não há prova de remontagem ou retomada daquelas quatro. Os logs correlacionaram duas falhas à execução do MCP com código interno `service_timeout`, classe transitória e status 503. O prazo específico que expirou não foi identificado: cada requisição usa oito segundos e até três tentativas, enquanto a chamada tem orçamento global de quarenta segundos. Na leitura atual (corte 103) não houve falha não recuperada; retornos integrais de falhas anteriores não foram preservados. Foram feitas somente consultas no curso real; revisão 555 e acesso permaneceram iguais, sem alegar snapshot completo de fontes, configuração e pareceres.

## Limitações e cuidados

As correções do PR 429, do PR 430 e do corte 0.0.103 estão integradas e implantadas; o fallback textual de erro do canal MCP está implantado (PR 432, MCP 528); apenas a correção de tipagem da reconciliação inválida está em preparação. A entrega do incidente não está concluída. O servidor não comprova consumo intelectual: a garantia de leitura completa antes do parecer pertence ao cliente de autoria. As contagens de disponibilidade descrevem a janela observada e não são uma taxa geral. Resultados hospedados permanecem separados dos locais, e a inspeção de IA não é aprovação humana. Os registros históricos preservam suas limitações de captura e nenhum original foi reescrito.
