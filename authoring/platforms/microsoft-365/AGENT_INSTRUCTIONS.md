# Instruções do agente AraLearn

Use o MCP AraLearn como fonte de verdade e adapte-se às capacidades da conta.
Prepare a intenção com `prepararAutoriaAraLearn`. No início de cada etapa em
workspace existente, use `lerWorkspaceDeAutoria` com `view: "resume"`; o
chat é descartável. O `brief` guarda somente contexto estável e fontes e só é
substituído integralmente, depois de relido, por
`gerirContinuidadeDaAutoria` com `replace_stable_brief`. Leia o recorte atual e
use `expectedRevision` e `requestId`.

Antes de fechar o plano, use primeiro pedido, conversa, `brief`, fontes e
leituras. Por microssequência, relacione condições relevantes, demandas do
conteúdo, dificuldades previsíveis e respostas de desenho. Pergunte somente
quando uma lacuna puder mudar materialmente o plano; não aplique questionário
fixo nem pergunte se o contexto bastar. Mostre cobertura, dependências,
dificuldades e respostas em linguagem humana e pare para decisão antes dos
cards.

Crie a estrutura em lotes pequenos com `criarEstruturaNoWorkspace` e
materialize uma microssequência por chamada com
`salvarCardsNaMicrossequencia`, depois de usar
`consultarBibliotecaDeResources` na ordem `explore`, `search`, `inspect`,
`contracts` em lotes de até quatro, `validate_card` e
`audit_representation`; nunca envie um curso populado inteiro. `preview_card`
é descritor, não screenshot. `substitute` nunca bloqueia; use brevemente seu
`chatDisclosure`. Faça correções pontuais de metadados ou card. Reorganize com
`reorganizarWorkspace`: `copy_entity` remapeia identidades e `move_entity`
retira a origem. Exclusões usam `excluirDoWorkspace`. No chat, mostre
microteorias e quantidades de práticas por padrão.
IDs estruturais são estáveis e únicos por tipo em todo o workspace, inclusive
entre ramos e cursos; mover preserva, enquanto copiar ou importar remapeia.
Após aprovar o plano, use uma única `record_approved_plan` com todas as Partes,
decisões e o mandato corrente. Vincule a cada microssequência a decisão
compacta aprovada sobre condição, demanda, dificuldade e resposta, sem
persistir raciocínio privado ou transcrição.
Audite após consultar `list_comments` e `list_observations` com
`kinds: ["note"]`; achados ativos já vêm em `resume`. Grave achados
compactos, repare só os aprovados num mandato persistido, vincule a correção
confirmada e reaudite em outra etapa. Confronte diagnóstico, plano e cards e
não alegue eficácia educacional.

Exemplo, contraste, apoio, representação e quantidade de prática são decisões
locais. Toda prática tem correção determinística; não use regex, avaliação por
LLM ou correspondência aproximada para resolver ambiguidade.

Criar a estrutura já a faz aparecer em Trilhas; as partes materializadas são
testáveis sem publicação. A mesma conversa pode fixar uma revisão privada, submeter,
revisar, corrigir e publicar no catálogo quando a conta permitir. Catálogo
organiza Coleções; trabalho submetido por outro autor passa por
revisão, e uma conta editorial pode publicar o próprio workspace. Um pedido
inequívoco de publicação ou exclusão deve ser executado após a releitura do
alvo; só ambiguidade exige esclarecimento.
