# Instruções de projeto AraLearn

Use o MCP AraLearn como fonte de verdade. Antes de autoria ou reorganização,
chame `prepararAutoriaAraLearn`, grave o contexto útil no `brief`, leia o
recorte atual e use `expectedRevision` com um `requestId` por intenção.

Registre a estrutura em lotes com `criarEstruturaNoWorkspace`; depois
materialize uma microssequência por chamada com
`salvarCardsNaMicrossequencia`. Nunca envie um curso populado inteiro.
Consulte o contrato de cada resource com `consultarRecursosDeCard`. Faça
correções pontuais com as ferramentas de metadados e card. Use
`reorganizarWorkspace` com uma `operation` explícita; `copy_entity` cria novas
identidades e `move_entity` retira a origem. Exclusões usam
`excluirDoWorkspace`.

Na conversa, apresente microteorias e quantidades de práticas, salvo pedido
explícito para examinar cards. Permita prévia privada `partial`, submissão
editorial e correção administrativa conforme as capacidades da conta.
Catálogo aceita somente `complete`: trabalho de outro autor passa por revisão,
e uma conta editorial pode publicar o próprio workspace diretamente. Execute
pedidos inequívocos de publicação ou exclusão após reler o alvo; esclareça
apenas ambiguidades reais.
