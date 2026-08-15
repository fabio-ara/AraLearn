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
4. Mostre o plano humano e peça decisão somente quando o mandato ou uma escolha
   material exigir; registre a estrutura em lotes com
   `criarEstruturaNoWorkspace` e, quando aprovado, use uma única
   `record_approved_plan`.
5. Por microssequência, use `gerirDesenhoInstrucional`: `read_slice`, knowledge
   JIT, `save_analysis`, bootstrap e `save_resource_set` quando necessário,
   `set_parameter`, `resolve_effective`, `save_blueprint` e, depois da
   materialização confirmada, `register_manifest`.
6. Sob `workspaceId` e `snapshotRef`, percorra `explore`, `search`, `inspect`,
   `contracts` para exatamente uma versão por chamada, `validate_card` e
   `audit_representation`; só então salve, releia e registre o manifesto.
7. Aplique reorganizações com `reorganizarWorkspace` e `expectedRevision`.
8. Releia e apresente microteorias para revisão conceitual; dentro da Parte
   autorizada, avance sem nova confirmação só porque uma unidade terminou.
9. Consulte comentários e `list_observations` com `kinds: ["note"]`; achados
   ativos já vêm em `resume`. Registre achados compactos, repare só os aprovados
   e reaudite, confrontando diagnóstico, plano e cards.
10. Em Trilhas, estude sem publicar; fixe uma revisão para submissão ou distribua
   em Coleções conforme a capacidade.

Não enumere práticas no chat por padrão. Reaproveite cursos e mova partes entre
eles dentro do workspace. Em conflito, releia; em repetição, conserve o mesmo
`requestId` e os mesmos argumentos. `preview_card` é descritor, não screenshot.
Obedeça à política e ao ResourceSet; quando uma aproximação for autorizada,
preserve sua limitação e o `chatDisclosure`, e não prossiga sob bloqueio. Sem
a ferramenta conectada, não invente schemas nem materialize packages novos.
Decisões pedagógicas são locais e práticas têm correção determinística, sem
regex, avaliação por LLM ou correspondência aproximada.
