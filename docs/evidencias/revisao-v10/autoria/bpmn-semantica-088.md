# BPMN: semântica de autoria e compatibilidade de leitura

O recurso aceitava fluxos incompatíveis com o tipo dos eventos e desenhava o final como intermediário. A correção distingue o desenho dos eventos e inspeciona a semântica na autoria sem impedir a leitura dos diagramas já salvos.

## Subconjunto e fundamento

São representados participantes, raias, tarefas, gateways exclusivo/paralelo e eventos em fluxo normal. Não há eventos de borda, subprocessos, temporizadores, sinais ou execução BPMN.

Neste subconjunto, cada participante representa um nível de processo. Início explícito exige ao menos um final no mesmo participante (OMG §10.5.3, p. 246, PDF índice 275); final explícito exige ao menos um início (§10.5.2, p. 238, PDF índice 267). Eventos em outra raia do mesmo participante satisfazem a presença; eventos de outro participante não. Se nenhum dos dois é declarado, a regra não os exige. Não se verifica alcançabilidade ou final para cada caminho. Um diagnóstico por participante aponta seu primeiro início ou final e nomeia a responsabilidade; o exemplo autoral também encerra explicitamente o processo do solicitante.

| Evento/elemento | Sequência | Mensagem |
| --- | --- | --- |
| Inicial | Sem entrada; ao menos uma saída | Recebe; não envia |
| Final | Ao menos uma entrada; sem saída | Envia; não recebe |
| Intermediário normal | Ao menos uma entrada e uma saída | Uma entrada ou uma saída, nunca ambas |
| Gateway | Permitida | Não participa |

Permanecem as restrições de participantes do contrato estrutural. Círculos inicial, intermediário e final são respectivamente simples fino, duplo fino e simples grosso. Referência: [OMG BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF), §§7.6.2 e 10.5.2–10.5.5; páginas impressas 42, 237, 239–240, 244–245, 248–249, 258–259.

O contrato define uma projeção sem campos adicionais: mensagens incidentes determinam o marcador de recepção/emissão; múltiplas mensagens no inicial/final determinam o marcador múltiplo. Eventos inconsistentes preservam o tipo declarado e recebem diagnóstico de autoria, sem conversão automática. Não há análise de alcançabilidade, simulação de tokens ou regras curriculares adicionais.

## Implementação

- `bpmn-process/semantics.js` concentra a inspeção pura e a comparação estrutural para autoria. Os diagnósticos nomeiam o evento, o fluxo e os rótulos de origem/destino, com indicação do que revisar.
- O `validate` do package continua estrutural. Normalização, renderização, texto acessível e alvos de edição/prática permanecem disponíveis para todo conteúdo estruturalmente válido.
- Autoria nova ou estrutura alterada inválida é recusada. Um recurso salvo no mesmo escopo pode conservar sua estrutura durante edição textual. A comparação ignora somente texto e ordem de declaração; não ignora tipos, conexões, identidades, participantes ou raias. No servidor, o anterior vem da leitura autorizada na revisão esperada.
- Materialização, correções, composição e edição textual usam a mesma inspeção. A aplicação local não substitui a verificação no servidor.
- Pendências preservadas aparecem ao produtor em `bpmnReview`, com estado `needs_review`; `ready` do preflight permite a escrita compatível, sem certificar a validade semântica do legado. Nenhum diagnóstico é apagado por uma edição textual.
- Nos recibos de composição, `bpmnReview` é opcional e tem validação específica: estado, códigos, alvos e mensagens conhecidos, somente pendências não bloqueantes. Unidade, feedback, Explicação e composição estrutural preservam esse diagnóstico até o cliente. Os recibos anteriores continuam válidos; campos desconhecidos, identidades e contagens incompatíveis continuam recusados. Os validadores genéricos não foram relaxados.
- Repetir uma composição confirmada conserva a idempotência do writer SQL. Se a pré-leitura falha especificamente por revisão divergente, uma leitura autorizada do resumo precisa confirmar revisão atual estritamente maior que a original. Só então o pedido intacto alcança o writer: o CAS antigo impede nova escrita, enquanto acesso, identidade e hash continuam conferidos antes da devolução do recibo. Sem recibo, o pedido falha. A resposta precisa confirmar `idempotent: true`; seu diagnóstico deriva do conteúdo original confirmado, mesmo se o alvo já mudou. Revisão futura, erro de serviço, acesso negado e autoria inválida na revisão atual não recebem essa passagem. Não há cache, RPC novo ou troca da revisão esperada.
- Recuperação de cópia consulta confirmação já persistida; não é autoria nova. `recover_owned_course_copy_for_actor_v1` é uma função `stable`: procura a cópia própria pelo hash do pedido original ou um recibo de ausência de mudança. Não consulta acesso ou revisão atual da origem. A rota conserva o recibo original, sem `bpmnReview` nem pré-leitura da origem, que pode ter avançado ou se tornado inacessível. Autenticação e validação estrutural do pedido permanecem; a inspeção semântica continua nas escritas reais.
- O SVG usa final com um círculo de 3px e intermediário com dois anéis de 1,15px. O anel externo intermediário é transparente para não cobrir o interno. Marcadores vetoriais e cores dos eventos têm CSS exclusivo do BPMN. A legenda compacta e os labels autorais permanecem preservados.

O espelho Edge acompanha o fonte pelo sincronizador existente. Não há migração de dados, alteração de versão de instância ou nova opção de layout.

## Verificação focal

Testes cobrem a matriz de endpoints, marcadores, leitura do legado, edição textual, rejeição de nova estrutura e paridade Edge. Os caminhos de Unidade, Explicação e feedback foram exercitados nas entradas de autoria.

A regressão dos recibos percorre `CourseApiClient → handler → router`, com autenticação e persistência simuladas e recibos completos. Reproduziu o erro posterior à escrita nas três entradas, além do bloqueio indevido da recuperação. Agora verifica confirmação com diagnóstico, recibos antigos, ausência de mudança/idempotência, rejeições estritas e recuperação `confirmed`/`unchanged`/`unresolved` sem reler a origem. Não é execução SQL hospedada.

A prova de replay inclui também o `CourseSupabaseAdapter` de produção, com transporte RPC que mantém estado, avança revisão e recusa leituras antigas. Nas três entradas, confirma rev4→5, replay sem gravação, substituição do alvo na rev6 e replay com recibo e diagnóstico originais. Verifica hash diferente, pedido sem recibo, nova autoria inválida, revisão futura que avança concorrentemente, falhas de leitura e acesso revogado antes ou depois do resumo. O contrato SQL existente foi lido para conferir acesso e recibo/hash antes do CAS; o transporte do teste simula esse contrato, sem executar banco. A regressão focal final passou em 20 testes, sem repetir UI.

A prova local usa o renderer real e uma fixture sintética com eventos simples, intermediários e mensagens, inclusive múltiplas. Cobertura: 320, 390, 430 e 1280px; Unidade/Explicação; claro/escuro. Os 16 casos verificam anéis, espessuras, preenchimentos, pan por teclado e ausência de erros de página. Há capturas de conjunto a 80% por um passo normal do controle de zoom, e detalhes a 100%; sem forcefit ou ocultação de conteúdo. Contraste mínimo dos eventos contra o fundo: 5,45:1 no claro e 7,88:1 no escuro.

As [34 capturas e o manifesto](bpmn-semantica-088/README.md) preservam a matriz visual, os detalhes dos eventos e a compatibilidade com conteúdo salvo. Esta evidência é local; não representa publicação ou alteração de um curso. Os exports integrais permanecem privados.

## Títulos de tarefas na substituição por HTML

O SVG quebrava títulos longos, mas a substituição por HTML para edição/seleção recebia `nowrap` específico do BPMN. O texto excedia e era cortado pelo `foreignObject`, inclusive com a tarefa inteira no viewport. A medição anterior não recebia esse seletor, dependente do ancestral SVG.

O conteúdo de tarefa agora tem classe própria, compartilhada pela sonda de medição e pelo HTML final. O título pode quebrar dentro da largura disponível; o subtipo continua em uma linha. A correção altera somente o HTML/CSS BPMN, preservando texto, controles e zoom/pan; não altera o renderer compartilhado nem outros gráficos. A regressão focal usa título sintético longo nos hosts Unidade e Explicação, inclusive edição e exploração. A [comparação visual adicional](bpmn-label-088/README.md) usa dados salvos integrais, zoom 0,64 e ambos os temas: quatro casos em 390px, todos sem recorte dos dez títulos de tarefas, com o nó observado inteiramente no viewport. Sua caixa mantém a mesma largura anterior.

## Catálogo e implantação

O catálogo gerado contém 34 recursos, na versão `1-fca7730b`, com fingerprint `sha256:e97467a8e1a1fb436f743a1d9fae39e686b1537211e68d66ab61f6c339223475`. A migração nova `20260928100000_revisao_v10_bpmn_inspection_runtime.sql` sincroniza a projeção SQL e o manifesto, preservando as 52 funcionalidades exigidas. Sua execução isolada em PGlite confirmou igualdade com o catálogo canônico e preservação das funcionalidades; não alterou conteúdo de curso. A aplicação hospedada permanece pendente nesta etapa.
