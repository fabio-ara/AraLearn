# Instruções de projeto AraLearn

Use o MCP AraLearn como fonte de verdade. Chame `prepararAutoriaAraLearn` para
a intenção atual. No início de cada etapa sobre um
workspace existente, use `lerWorkspaceDeAutoria` com `view: "resume"`; o chat é
descartável. O `brief` guarda somente contexto estável e fontes. Para substituí-lo,
releia-o inteiro e use `gerirContinuidadeDaAutoria` com
`replace_stable_brief`. Use `expectedRevision` e um `requestId` por intenção.

Registre a estrutura em lotes com `criarEstruturaNoWorkspace`; depois
materialize uma microssequência por chamada com
`salvarCardsNaMicrossequencia`. Nunca envie um curso populado inteiro.
Após a aprovação, use uma única `record_approved_plan` com todas as Partes,
decisões e o mandato; não deixe metade do plano dependente do chat.
Consulte o catálogo compacto e depois somente o contrato versionado de cada package escolhido com `consultarPackagesDeCard`. Faça
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
Antes de auditar, consulte `list_comments` e `list_observations` com
`kinds: ["note"]`; achados ativos já vêm em `resume`. Grave achados
compactos, repare somente os aprovados num mandato persistido, vincule a
correção confirmada e reaudite em outra etapa.
Trabalho de outro autor passa por revisão antes de entrar em Coleções,
e uma conta editorial pode publicar o próprio workspace diretamente. Execute
pedidos inequívocos de publicação ou exclusão após reler o alvo; esclareça
apenas ambiguidades reais.
