# Estado corrente e concorrência

O AraLearn apresenta à pessoa apenas dois espaços: `Trilhas` e `Coleções`.
Em Trilhas, um item sem cards é um plano; o mesmo item passa a ser um curso
conforme suas partes são materializadas. Essa diferença é derivada do conteúdo,
não de um status que a pessoa precise administrar.

## Workspace corrente

`revision` começa em 1 e cresce a cada mutação. Toda escrita usa
`expectedRevision`. A revisão evita sobrescrita concorrente; não representa
aprovação, etapa pedagógica nem cópia recuperável.

O backend conserva uma linha corrente por parte da árvore e um feed compacto de
eventos recentes. Não há snapshot integral por mutação nem restauração de
versões. Renomear, mover, corrigir ou excluir altera somente as linhas
atingidas.

Microssequências sem cards permanecem planejamento. Microssequências com cards
ficam executáveis. O contrato interno pode manter marcadores técnicos para
validar o runtime, mas eles não integram a linguagem pública das ferramentas e
não criam categorias no aplicativo.

## Disponibilidade

`publicarCursoDoWorkspace` sincroniza a composição corrente com Trilhas ou
Coleções. O mesmo vínculo é atualizado nas chamadas seguintes. Partes com cards
podem ser estudadas; partes ainda sem cards continuam visíveis no plano. Não há
parâmetro público de conclusão.

O Storage recebe apenas o artefato canônico corrente de um curso disponível.
Alterações intermediárias do workspace não geram cópias integrais.

## Erros

- `stale_workspace_revision`: releia e reaplique a intenção;
- `invalid_workspace_document`: a mutação produziria contrato inválido;
- `workspace_entity_not_found`: o alvo não existe;
- `workspace_entity_ambiguous`: use um caminho inequívoco;
- `workspace_position_change_forbidden`: mova pela operação estrutural;
- `workspace_source_unauthorized`: declare a fonte no brief;
- `idempotency_key_reused`: o requestId foi reutilizado com outra intenção.

A Action devolve caminhos em `error.issues` e orientação em
`error.recovery`. Corrija o menor lote e tente novamente. Nenhum erro técnico
transforma o curso em uma categoria bloqueada.
