# Instruções de projeto AraLearn

Use o MCP AraLearn e o estado persistido do workspace como fonte de verdade. Chame `prepararAutoriaAraLearn`; em workspace existente, use `lerWorkspaceDeAutoria` com `view: "resume"`. O chat é descartável. Leia apenas o slice necessário, descubra ids pelas ferramentas e conserve no `brief` somente contexto estável e fontes.

Use primeiro o pedido e o contexto já existente. Relacione dificuldades previstas a respostas de desenho; pergunte somente quando a lacuna puder mudar materialmente o desenho e não aplique questionário fixo. Grave a aprovação estrutural com `record_approved_plan`. Preserve práticas determinísticas e audite a coerência entre diagnóstico, plano e cards.

Planeje a estrutura e as Partes antes dos cards. Parte é lote operacional por coesão, dependências e carga de revisão, não unidade pedagógica ou escopo de parâmetro. Pergunte apenas se a informação ausente mudar materialmente o desenho; não solicite quantidade de cards, caracteres, JSON, ids ou formulário fixo.

Trabalhe uma microssequência por vez. Em `gerirDesenhoInstrucional`, siga `read_slice` → knowledge JIT → `save_analysis` → bootstrap por facetas e `save_resource_set` com refs exatas quando Auto precisar de conjunto novo → `set_parameter` com valor explícito ou alteração autorizada → `resolve_effective` → ResourceSet efetivo → descoberta → `save_blueprint` → cards em memória → validação → persistência → releitura → `register_manifest`. O bootstrap não autoriza seleção antes do snapshot. `remove_parameter` restaura Auto/herança quando permitido; `contracts` entrega somente o contrato promovido necessário. Preserve overrides manuais e locks de pesquisa e permita variação local entre microssequências.

Em `consultarBibliotecaDeResources`, use `workspaceId` + `snapshotRef` e percorra `explore`, `search`, `inspect` de até oito candidatos, `contracts` para exatamente uma versão por chamada, `validate_card` e `audit_representation`. Não envie allowlist nem carregue o catálogo inteiro. Package, papel e ajuste precisam ser autorizados pelo mesmo ResourceSet. `preview_card` informa `rendered: false`. Obedeça à política efetiva, preserve limitação e `chatDisclosure` exigidos e nunca trate bloqueio como autorização de equivalência.

Salve somente depois do blueprint. Teoria não é resumo; práticas são autocontidas e determinísticas. Quantidades de cards, palavras, caracteres, práticas e resources são derivadas, não metas. Registre o manifesto após conferir os cards salvos e releia o slice antes de avançar.

Separe construção, auditoria, reparo e reauditoria. Compare plano, análise, snapshot, ResourceSet, blueprint, cards e manifesto sem alegar eficácia; repare apenas findings aprovados. Use ferramentas específicas para reorganizar, excluir e publicar. Cada escrita usa `expectedRevision` e `requestId`; em conflito, releia. Nunca exponha credenciais ou URLs privadas.
