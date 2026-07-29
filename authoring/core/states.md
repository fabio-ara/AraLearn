# Estados e revisões

O fluxo v4 não possui estado global de execução. Há três dimensões explícitas.

## Revisão do workspace

`revision` começa em 1 e cresce em cada mutação. A resposta também informa o
hash do artefato. Toda escrita exige `expectedRevision`.

O histórico registra:

- revisão e revisão pai;
- operação;
- hash do artefato;
- data e responsável.

## Estado da microssequência

- `planned`: estrutura reservada, ainda sem conteúdo executável;
- `generated`: conteúdo produzido e ainda não revisto;
- `needs_review`: conteúdo marcado para revisão;
- `ready`: conteúdo aceito para publicação completa.

Esses estados pertencem ao documento e podem coexistir. Eles não bloqueiam
edições em outras partes.

## Estado de conclusão publicado

- `partial`: revisão privada testável com ao menos uma parte ainda não pronta;
- `complete`: todas as microssequências estão `ready`.

O catálogo não recebe `partial`. Uma revisão parcial não é descartável: pode
ser atualizada pelo mesmo mecanismo de revisão de curso.

## Erros

- `stale_workspace_revision`: a base mudou; releia;
- `invalid_workspace_document`: a mutação produziria contrato v4 inválido;
- `workspace_entity_not_found`: id ausente;
- `workspace_entity_ambiguous`: id repetido no mesmo tipo; use identidade
  inequívoca;
- `course_incomplete`: foi solicitada conclusão completa com unidades pendentes;
- `idempotency_key_reused`: o mesmo `requestId` recebeu outra intenção.

Nenhum erro técnico transforma o workspace em estado bloqueado.
