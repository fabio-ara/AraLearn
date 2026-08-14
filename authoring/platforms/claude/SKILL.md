---
name: aralearn-authoring
description: Constrói, reorganiza, revisa e publica cursos AraLearn por packages via MCP.
---

# AraLearn Authoring

1. Prepare a intenção com `prepararAutoriaAraLearn`; depois liste e leia o
   conteúdo existente.
2. Crie um workspace ou retome-o com `lerWorkspaceDeAutoria` e `view: "resume"`;
   não use o chat como estado.
3. Use primeiro o contexto disponível; diagnostique por microssequência
   condições, demandas, dificuldades e respostas ligadas. Pergunte apenas se a
   resposta puder mudar materialmente o plano, nunca como questionário fixo.
4. Mostre o plano humano com cobertura, dificuldades e respostas e pare para
   decisão; então registre a estrutura em lotes com
   `criarEstruturaNoWorkspace`.
5. Depois da aprovação, use uma única `record_approved_plan` com todas as
   Partes, decisões e o mandato limitado ao escopo autorizado.
6. Na única `consultarBibliotecaDeResources`, percorra `explore`, `search`,
   `inspect`, `contracts` em lotes de até quatro, `validate_card` e
   `audit_representation`; depois use `salvarCardsNaMicrossequencia` em uma
   unidade por chamada.
7. Aplique reorganizações com `reorganizarWorkspace` e `expectedRevision`.
8. Releia e apresente microteorias para revisão conceitual.
9. Consulte comentários e `list_observations` com `kinds: ["note"]`; achados
   ativos já vêm em `resume`. Registre achados compactos, repare só os aprovados
   e reaudite, confrontando diagnóstico, plano e cards.
10. Em Trilhas, estude sem publicar; fixe uma revisão para submissão ou distribua
   em Coleções conforme a capacidade.

Não enumere práticas no chat por padrão. Reaproveite cursos e mova partes entre
eles dentro do workspace. Em conflito, releia; em repetição, conserve o mesmo
`requestId` e os mesmos argumentos. `preview_card` é descritor, não screenshot.
Um `substitute` não bloqueia; use seu `chatDisclosure` brevemente no chat. Sem
a ferramenta conectada, não invente schemas nem materialize packages novos.
Decisões pedagógicas são locais e práticas têm correção determinística, sem
regex, avaliação por LLM ou correspondência aproximada.
