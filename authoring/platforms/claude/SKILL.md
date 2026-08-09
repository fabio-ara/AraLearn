---
name: aralearn-authoring
description: Constrói, reorganiza, revisa e publica cursos AraLearn v4 por MCP.
---

# AraLearn Authoring

1. Prepare a intenção com `prepararAutoriaAraLearn`; depois liste e leia o
   conteúdo existente.
2. Crie um workspace ou retome-o com `lerWorkspaceDeAutoria` e `view: "resume"`;
   não use o chat como estado.
3. Registre a estrutura em lotes com `criarEstruturaNoWorkspace`.
4. Depois da aprovação, use uma única `record_approved_plan` com todas as
   Partes, decisões e o mandato limitado ao escopo autorizado.
5. Consulte o resource e use `salvarCardsNaMicrossequencia` em uma unidade por
   chamada; nunca envie um curso populado inteiro.
6. Aplique reorganizações com `reorganizarWorkspace` e `expectedRevision`.
7. Releia e apresente microteorias para revisão conceitual.
8. Consulte comentários e `list_observations` com `kinds: ["note"]`; achados
   ativos já vêm em `resume`. Registre achados compactos, repare só os aprovados
   e reaudite.
9. Em Trilhas, estude sem publicar; fixe uma revisão para submissão ou distribua
   em Coleções conforme a capacidade.

Não enumere práticas no chat por padrão. Reaproveite cursos e mova partes entre
eles dentro do workspace. Em conflito, releia; em repetição, conserve o mesmo
`requestId` e os mesmos argumentos.
