# Bottom-Up Invariants

## Linha principal

- A trilha top-down continua sendo a `main`.
- Branch de suporte nunca vira nova trilha principal.
- O app não pode pressupor conteúdo fora das dependências declaradas e do que já foi estudado.
- O contexto volátil precisa aparecer no próprio card.
- A prática precisa ser abundante.
- Não resumir de forma pobre nem condensar artificialmente por limite técnico.
- O contrato público do app precisa continuar válido.

## Rotas canônicas

### `repair_current`

- Fica na microssequência atual.
- Corrige cards ruins, errados ou incompletos.
- Não cria assunto novo.
- Não cria microssequência nova.
- Não avança a trilha.

### `extend_current`

- Fica no mesmo assunto da microssequência atual.
- Adiciona explicação, exemplos ou prática.
- Coloca contexto suficiente no próprio card.
- Não dispersa para assunto lateral.

### `create_support_branch`

- Cria branch pedagógica controlada.
- Persiste `type: "support"`.
- Persiste `parentMicrosequenceKey`.
- Persiste `returnToMicrosequenceKey`.
- Persiste `supportReason`.
- Persiste `branchPolicy: "must_return_to_planned_track"`.
- Depende só do que já foi estudado ou declarado.
- Fecha com retorno para a trilha top-down.

### `generate_planned_next`

- Usa a próxima microssequência já planejada pelo top-down.
- Não inventa próximo assunto.
- Respeita título, objetivo, dependências e fonte-guia.
- Só avança quando a etapa anterior está pronta.
