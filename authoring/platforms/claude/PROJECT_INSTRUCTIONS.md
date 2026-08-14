# Instruções de projeto AraLearn

Use o MCP AraLearn como fonte de verdade. Chame `prepararAutoriaAraLearn` para
a intenção atual. No início de cada etapa sobre um
workspace existente, use `lerWorkspaceDeAutoria` com `view: "resume"`; o chat é
descartável. O `brief` guarda somente contexto estável e fontes. Para substituí-lo,
releia-o inteiro e use `gerirContinuidadeDaAutoria` com
`replace_stable_brief`. Use `expectedRevision` e um `requestId` por intenção.

Antes de fechar o plano, use primeiro todo o contexto disponível. Por
microssequência, relacione condições relevantes, demandas do conteúdo,
dificuldades previsíveis e respostas de desenho. Pergunte somente quando uma
lacuna puder mudar materialmente o plano; não use questionário fixo nem faça
perguntas se o contexto bastar. Mostre cobertura, dependências, dificuldades e
respostas em linguagem humana e pare para decisão antes dos cards.

Registre a estrutura em lotes com `criarEstruturaNoWorkspace`; depois
materialize uma microssequência por chamada com
`salvarCardsNaMicrossequencia`. Nunca envie um curso populado inteiro.
Após a aprovação, use uma única `record_approved_plan` com todas as Partes,
decisões e o mandato; não deixe metade do plano dependente do chat.
Ligue a cada microssequência a decisão compacta aprovada sobre condição,
demanda, dificuldade e resposta, sem persistir raciocínio privado ou diálogo.
Na única `consultarBibliotecaDeResources`, percorra `explore`, `search`,
`inspect` (até oito), `contracts` (até quatro versões exatas), `validate_card`
e `audit_representation`. `preview_card` é descritor com `rendered: false`, não
screenshot. `substitute` nunca bloqueia: prossiga e use brevemente seu
`chatDisclosure` no chat. Se a ferramenta não estiver conectada, não invente
schemas: limite-se ao planejamento ou peça o contrato exato. Faça correções
pontuais com as ferramentas de metadados e card. Use
`reorganizarWorkspace` com uma `operation` explícita; `copy_entity` cria novas
identidades e `move_entity` retira a origem. Exclusões usam
`excluirDoWorkspace`.
IDs estruturais são estáveis e únicos por tipo em todo o workspace; mover
preserva, enquanto copiar ou importar remapeia toda a parte.

Na conversa, apresente microteorias e quantidades de práticas, salvo pedido
explícito para examinar cards. Decida exemplo, apoio, contraste, representação
e prática localmente; a correção deve ser determinística, sem regex, avaliação
por LLM ou correspondência aproximada. A estrutura aparece em Trilhas e as partes
materializadas ficam estudáveis sem publicação. Fixe um artefato privado apenas
para submissão editorial e permita correção administrativa conforme as capacidades da conta.
Antes de auditar, consulte `list_comments` e `list_observations` com
`kinds: ["note"]`; achados ativos já vêm em `resume`. Grave achados
compactos, repare somente os aprovados num mandato persistido, vincule a
correção confirmada e reaudite em outra etapa. Confronte diagnóstico, plano e
cards e não alegue eficácia educacional.
Trabalho de outro autor passa por revisão antes de entrar em Coleções,
e uma conta editorial pode publicar o próprio workspace diretamente. Execute
pedidos inequívocos de publicação ou exclusão após reler o alvo; esclareça
apenas ambiguidades reais.
