# Roteiro de aceitação humana da Autoria

Este roteiro é para uma pessoa que nunca usou o AraLearn. Ele não é um teste de
desenvolvimento e não pode ser marcado como aprovado por Playwright, scripts ou
agentes. A prioridade é celular; as tarefas marcadas com **desktop** devem ser
repetidas em uma tela larga.

## Preparação

- usar uma conta de teste sem conhecimento prévio dos termos internos;
- entregar um celular com conexão e outro momento sem conexão, com um curso já
  aberto anteriormente;
- preparar um workspace com uma microssequência pronta, uma planejada, um
  finding e uma coleção grande de Resources com famílias e facetas;
- não explicar MCP, schema, snapshot, package, revision, CAS ou `ResourceSet`;
- pedir que a pessoa fale em voz alta o que acha que cada tela significa.

## Tarefas e registro

| Tarefa | Resultado esperado sem ajuda técnica | Registrar |
| --- | --- | --- |
| 1. Diferenciar Estudo e Autoria | a pessoa explica qual entrada usa para aprender e qual usa para construir um curso | escolha inicial, hesitação e vocabulário usado |
| 2. Localizar um workspace | abre o workspace pelo nome e retorna a ele depois de navegar | tentativas, tempo e qualquer explicação necessária |
| 3. Ler o estado de produção | distingue visualmente o que está pronto, planejado, em produção e pendente | interpretações erradas de ícones, rótulos ou cores |
| 4. Abrir conteúdo real | sai de Autoria para o leitor, experimenta um card e volta sem perder o contexto | se encontrou o retorno e se entendeu o estado offline |
| 5. Consultar e restaurar Auto | abre Desenho, entende a origem de um valor e volta o parâmetro para Auto sem escrever texto técnico | controles não encontrados, receio de alterar ou termos incompreendidos |
| 6. Restringir ou consultar Resources | usa famílias/facetas e entende que a escolha vale para um conjunto, não card a card | se precisou conhecer IDs, JSON ou o nome interno do conjunto |
| 7. Abrir um finding | abre Auditoria, localiza o alvo e entende a ação disponível | se o finding parece uma nota, erro, bloqueio ou tarefa obscura |
| 8. Ver Resultados | encontra Resultados e diferencia dado disponível de conclusão pedagógica | leituras como score, ranking ou causalidade inexistente |
| 9. Voltar ao Estudo | retorna ao leitor com o mesmo curso/contexto | perda de contexto, atalhos ocultos ou navegação redundante |
| 10. Catálogo grande | procura uma família e filtra facetas numa coleção simulada grande | paginação invisível, resultado inesperado ou perda da seleção |

## Critério de decisão

O fluxo falha se uma tarefa comum exigir explicação externa de arquitetura,
identificador, contrato ou operação de banco. Também falha se a pessoa não
conseguir descobrir uma ação essencial por meio de rótulo, hierarquia visual ou
feedback de estado.

Registre cada dificuldade como observação com: tarefa, dispositivo, condição de
conexão, ação tentada, texto ou controle que causou a dúvida, ajuda solicitada e
resultado. Corrija a interface antes de alegar simplicidade; não treine a pessoa
para contornar a interface.

## Fechamento da sessão

Pergunte, sem sugerir a resposta:

1. “Quando você usaria Estudo e quando usaria Autoria?”
2. “O que significavam os estados que você viu?”
3. “O que você acha que aconteceria ao voltar um valor para Auto?”
4. “Onde você procuraria um problema no curso?”
5. “Que palavras, botões ou telas pareceram técnicas demais?”

Anexe as observações ao fechamento da #109 e compare celular e desktop. Um
resultado humano positivo é necessário para encerrar o critério de simplicidade;
a ausência de teste humano deve continuar visível como pendência.
