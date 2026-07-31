# Estados e concorrência

O fluxo v4 não possui estado global de execução. Há três dimensões explícitas.

## Estado atual do workspace

`revision` começa em 1 e cresce em cada mutação. A resposta também informa o
estado corrente necessário para continuar. Toda escrita exige
`expectedRevision`.

O backend conserva uma linha atual por parte da árvore e um feed compacto,
limitado e não restaurável. Cada evento recente registra:

- revisão;
- operação;
- contagens e alvo resumido;
- data e responsável.

Não há snapshot do documento a cada mutação, árvore histórica nem comando de
restauração. `revision` é um contador de concorrência, não uma cópia do curso.

## Estado da microssequência

- `planned`: estrutura reservada, ainda sem conteúdo executável;
- `generated`: conteúdo produzido e ainda não revisto;
- `needs_review`: conteúdo marcado para revisão;
- `ready`: conteúdo aceito para publicação completa.

Esses estados pertencem ao documento e podem coexistir. Eles não bloqueiam
edições em outras partes.

Uma alteração semântica em conteúdo já `ready` devolve somente as
microssequências afetadas a `needs_review`. Isso inclui corrigir, mover ou
excluir card; copiar ou mover uma subárvore; juntar ou separar
microssequências; e mudar objetivo, guia, tópicos ou relações didáticas. Em uma
movimentação de card, origem e destino são afetados. Uma cópia preserva a
origem e invalida a cópia. Renomear sem mudar conteúdo preserva `ready`.

Depois da conferência, `ready` é marcado em outra chamada que altera apenas o
estado. Não é válido corrigir conteúdo e declará-lo pronto na mesma atualização
de metadados. `salvarCardsNaMicrossequencia` continua podendo definir o estado
do conjunto integral que acabou de validar e salvar.

## Estado de conclusão publicado

- `partial`: revisão privada testável com ao menos uma parte ainda não pronta;
- `complete`: todas as microssequências estão `ready`.

O catálogo não recebe `partial`. Uma publicação parcial pode ser atualizada a
partir do workspace corrente. A publicação materializa um JSON canônico; ela
não transforma as mutações anteriores em versões recuperáveis.

## Erros

- `stale_workspace_revision`: a base mudou; releia;
- `invalid_workspace_document`: a mutação produziria contrato v4 inválido;
- `workspace_entity_not_found`: id ausente;
- `workspace_entity_ambiguous`: id repetido no mesmo tipo; use identidade
  inequívoca;
- `course_incomplete`: foi solicitada conclusão completa com unidades pendentes;
- `workspace_ready_requires_separate_review`: uma correção tentou marcar
  `ready` na mesma atualização; revise e marque o estado em chamada posterior;
- `idempotency_key_reused`: o mesmo `requestId` recebeu outra intenção.

Nenhum erro técnico transforma o workspace em estado bloqueado.
