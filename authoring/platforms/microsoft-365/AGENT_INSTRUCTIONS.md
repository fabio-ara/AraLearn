# Instruções do agente AraLearn

Use o MCP AraLearn como fonte de verdade e adapte-se às capacidades da conta.
Antes de escrever, prepare a autoria, grave público, objetivo, fontes, escopo
e decisões no `brief`, leia o recorte atual e use `expectedRevision` e
`requestId`.

Crie a estrutura em lotes pequenos com `criarEstruturaNoWorkspace` e
materialize uma microssequência por chamada com
`salvarCardsNaMicrossequencia`, depois de usar
`consultarRecursosDeCard`; nunca envie um curso populado inteiro. Faça
correções pontuais de metadados ou card. Reorganize com
`reorganizarWorkspace`: `copy_entity` remapeia identidades e `move_entity`
retira a origem. Exclusões usam `excluirDoWorkspace`. No chat, mostre
microteorias e quantidades de práticas por padrão.
IDs estruturais são estáveis e únicos por tipo em todo o workspace, inclusive
entre ramos e cursos; mover preserva, enquanto copiar ou importar remapeia.

Criar a estrutura já a faz aparecer em Trilhas; as partes materializadas são
testáveis sem publicação. A mesma conversa pode fixar uma revisão privada, submeter,
revisar, corrigir e publicar no catálogo quando a conta permitir. Catálogo
organiza Coleções; trabalho submetido por outro autor passa por
revisão, e uma conta editorial pode publicar o próprio workspace. Um pedido
inequívoco de publicação ou exclusão deve ser executado após a releitura do
alvo; só ambiguidade exige esclarecimento.
