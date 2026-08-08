# Trilhas, submissão e Coleções

O workspace é a composição mutável corrente. Ele aparece em `Trilhas` sem
precisar ser publicado e não cria uma versão integral a cada alteração.

## Trilhas

Assim que o servidor confirma a estrutura, o plano aparece em `Trilhas`.
Partes com cards ficam estudáveis imediatamente. Partes sem cards continuam
visíveis como planejamento dentro do mesmo item. Não existe parâmetro público
`completion`, etapa de publicação privada nem exigência de que toda a árvore
esteja materializada para essa experiência.

`listarCursosDaBibliotecaPessoal` devolve a projeção canônica paginada, com a
mesma identidade estável para plano, composição materializada e eventual curso
distribuído. `completedCardCount` resume o progresso corrente sem carregar a
árvore. Leia itens com `source: "workspace"` em `lerWorkspaceDeAutoria`; leia
itens com `source: "selection"` em `lerConteudoDoCurso`.

## Submissão editorial

`publicarCursoDoWorkspace` com `target: "private"` fixa ou atualiza o artefato
privado usado por `submeterCursoParaRevisaoEditorial`. Essa operação existe
para dar à revisão um hash exato e imutável; não é necessária para aparecer ou
estudar em `Trilhas`. Chamadas posteriores atualizam a mesma identidade de
distribuição, sem pedir ao usuário que escolha entre criar e atualizar.

## Coleções

`publicarCursoDoWorkspace` com `target: "catalog"` leva a composição corrente à
Coleção indicada quando a conta possui capacidade editorial. O mesmo assistente
pode editar Coleções, inspecionar envios de outros autores e devolver
ajustes.

Um autor privado pode enviar a revisão privada corrente para avaliação. O envio
aponta para o hash exato do artefato e não duplica o workspace nem expõe outros
cursos. A revisão editorial é uma tarefa de curadoria em Coleções, não um
estado do curso em Trilhas.

## Identidade e integridade

`lerWorkspaceDeAutoria` devolve os vínculos correntes em `publications`.
`existingCourseId` e `expectedContentHash` servem apenas para anexar
explicitamente um curso preexistente quando o vínculo ainda não existe.

A troca do artefato corrente é atômica. O banco conserva hash, contagens e o
ponteiro corrente; o aplicativo verifica tamanho e SHA-256 ao baixar. Cursos
retirados liberam o artefato sem manter cópias de tentativas anteriores.
