# Trilhas e Coleções

O workspace é a composição mutável corrente. Disponibilizar um curso cria ou
atualiza um artefato canônico único para estudo; não cria uma versão integral a
cada alteração.

## Trilhas

`target: "private"` disponibiliza a composição corrente em Trilhas. O vínculo
entre workspace, curso e destino é persistido, portanto chamadas posteriores
atualizam a mesma identidade. O usuário não escolhe entre criar e atualizar.

Partes com cards ficam estudáveis imediatamente. Partes sem cards continuam
visíveis como planejamento dentro do mesmo item. Não existe parâmetro público
`completion` nem exigência de que toda a árvore esteja materializada.

## Coleções

`target: "catalog"` leva a composição corrente à Coleção indicada quando a
conta possui capacidade editorial. O mesmo assistente pode organizar Coleções,
inspecionar envios de outros autores e devolver ajustes.

Um autor privado pode enviar o curso corrente para avaliação. O envio aponta
para o hash exato do artefato e não duplica o workspace nem expõe outros
cursos. A revisão editorial é uma tarefa de curadoria em Coleções, não um
estado do curso em Trilhas.

## Identidade e integridade

`lerWorkspaceDeAutoria` devolve os vínculos correntes em `publications`.
`existingCourseId` e `expectedContentHash` servem apenas para anexar
explicitamente um curso preexistente quando o vínculo ainda não existe.

A troca do artefato corrente é atômica. O banco conserva hash, contagens e o
ponteiro corrente; o aplicativo verifica tamanho e SHA-256 ao baixar. Cursos
retirados liberam o artefato sem manter cópias de tentativas anteriores.
