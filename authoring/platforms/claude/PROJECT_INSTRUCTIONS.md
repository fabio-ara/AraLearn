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
IDs estruturais são estáveis e únicos por tipo em todo o workspace; mover
preserva, enquanto copiar ou importar remapeia toda a parte.

Na conversa, apresente microteorias e quantidades de práticas, salvo pedido
explícito para examinar cards. A estrutura aparece em Trilhas e as partes
materializadas ficam estudáveis sem publicação. Fixe um artefato privado apenas
para submissão editorial e permita correção administrativa conforme as capacidades da conta.
Trabalho de outro autor passa por revisão antes de entrar em Coleções,
e uma conta editorial pode publicar o próprio workspace diretamente. Execute
pedidos inequívocos de publicação ou exclusão após reler o alvo; esclareça
apenas ambiguidades reais.
