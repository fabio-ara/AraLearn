# Roteiro de aceitação humana da Autoria

Este roteiro é para uma pessoa que nunca usou o AraLearn. Ele não é um teste de
desenvolvimento e não pode ser marcado como aprovado por Playwright, scripts ou
agentes. A prioridade é celular; as tarefas marcadas com **desktop** devem ser
repetidas em uma tela larga.

## Preparação

- usar uma conta de teste sem conhecimento prévio dos termos internos;
- entregar celular em 360, 390 e 430 px e repetir o núcleo da sessão em desktop
  de 1280 px;
- preparar um Curso próprio com plano, Microssequência materializada e mais de
  55 Fontes; incluir Fonte ativa, aposentada, oculta, somente citação, citação e
  link e referência legada não resolvida;
- preparar também uma conta com acesso somente a Estudo;
- não explicar MCP, schema, revisão, CAS, UUID ou nomes internos de relação;
- pedir que a pessoa fale em voz alta o que acha que cada tela significa.

## Tarefas e registro

| Tarefa | Resultado esperado sem ajuda técnica | Registrar |
| --- | --- | --- |
| 1. Diferenciar Estudo e Autoria | a pessoa explica qual entrada usa para aprender e qual usa para construir um curso | escolha inicial, hesitação e vocabulário usado |
| 2. Localizar um Curso | abre o Curso pelo título e retorna a ele depois de navegar | tentativas, tempo e qualquer explicação necessária |
| 3. Reconhecer as seis áreas | diferencia Planejamento, Parâmetros, Fontes, Estrutura, Inspeção e Pessoas pelo propósito | interpretações erradas de ícones, rótulos ou ordem |
| 4. Ler o estado de produção | distingue o que está planejado, parcialmente materializado, materializado ou exige atenção | interpretações erradas de ícones, rótulos ou cores |
| 5. Consultar e restaurar herança | abre Parâmetros, entende origem e valor efetivo e remove uma decisão local sem escrever texto técnico | controles não encontrados, receio de alterar ou termos incompreendidos |
| 6. Percorrer catálogo grande | encontra uma Fonte depois de avançar e voltar páginas sem perder seleção ou contexto | paginação invisível, resultado inesperado ou perda da seleção |
| 7. Criar e revisar uma Fonte | preenche formulário natural, entende que revisar preserva histórico e consegue aposentar sem confundir com apagar | necessidade de JSON/IDs, ambiguidade de revisão ou medo de perda histórica |
| 8. Criar uma Âncora | escolhe página, tempo, fragmento ou trecho e entende que a localização pertence à revisão exata | termos técnicos, limites obscuros ou tentativa de salvar localização inexata |
| 9. Definir Fontes no Planejamento | substitui conscientemente o conjunto completo de um item e escolhe relação e Âncora para cada Fonte | vínculo sem Âncora, perda de ordem ou impressão de adição parcial |
| 10. Definir Fontes na Inspeção | abre a Unidade correta, reconhece o alvo e salva o conjunto completo sem ativar respostas | perda de contexto curricular, edição da Unidade por engano ou resultado inerte pouco claro |
| 11. Compreender legado não resolvido | reconhece que faltam metadados, não espera link inventado e resolve mantendo a mesma referência | tentativa de criar duplicata, “corrigir” a identidade ou presumir Fonte completa |
| 12. Conferir a projeção de Estudo | a conta de Estudo vê citação sem link, citação com link e localização; não vê Fonte oculta/não resolvida, histórico, trecho privado nem edição | qualquer dado privado exposto, pedido antes de abrir Fontes ou expectativa de editar |
| 13. Voltar entre Estudo e Autoria | retorna ao mesmo Curso/contexto sem confundir autoridade de leitura e edição | perda de contexto, atalhos ocultos ou navegação redundante |

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
2. “Para que serve cada uma das seis áreas?”
3. “O que você acha que acontece quando revisa ou aposenta uma Fonte?”
4. “O que uma Âncora prova e o que ela não prova?”
5. “Por que algumas Fontes aparecem sem link ou não aparecem no Estudo?”
6. “Que palavras, botões ou telas pareceram técnicas demais?”

Registre as observações como evidência datada e compare celular e desktop. Um
resultado humano positivo é necessário para declarar o critério de simplicidade
atendido; a ausência de teste humano deve continuar visível no
[estado corrente](estado-atual-e-roadmap.md). A sessão de pesquisa também exige
revisão especializada sobre validade das medidas e proteção dos participantes;
aprovação de UX não substitui revisão ética ou científica.

Não ensaie como existentes a triagem e Anotação ancorada da #124 nem os
achados, correções e verificações da #125. Quando esses marcos entrarem no
runtime, este roteiro precisa ganhar tarefas próprias em vez de reinterpretar
Fontes como ciclo de auditoria.
