# Publicação e prévia

O workspace e o curso publicado são objetos diferentes. O workspace conserva
somente o estado composto corrente e eventos resumidos recentes; a publicação
materializa ou atualiza o JSON canônico do curso.

## Prévia privada

`completion: partial` publica um curso privado estruturalmente válido mesmo que
algumas microssequências ainda estejam planejadas ou em revisão. O autor pode
abrir, estudar, testar navegação, recursos e progressão já existentes. A
prévia aparece apenas na biblioteca do proprietário.

## Curso completo

`completion: complete` verifica que todas as microssequências estão `ready`.
Pode ser privado ou editorial. O catálogo aceita somente esta forma.

## Criação e atualização

O usuário não escolhe entre criar e atualizar. O AraLearn mantém, para cada
`workspace + curso + destino`, o vínculo com a publicação corrente:

- na primeira publicação para aquele destino, cria uma identidade;
- nas seguintes, atualiza automaticamente a mesma identidade;
- `lerWorkspaceDeAutoria` devolve esses vínculos em `publications`, inclusive
  quando a conversa foi retomada depois;
- `listarWorkspacesDeAutoria` informa `publicationCount`.

Abrir um workspace a partir de um curso já publicado semeia o vínculo com o
destino real da origem (`private` ou `catalog`). Importar um curso apenas para
reaproveitamento cria uma cópia independente e não vincula a publicação
consultada.

`existingCourseId` e `expectedContentHash` são um par opcional para anexar
explicitamente uma publicação existente quando ainda não há vínculo. Nunca se
envia apenas um deles. Se já houver vínculo, o par precisa coincidir exatamente
com ele; normalmente o assistente deve omitir ambos.

A troca do ponteiro corrente é atômica. Se o hash publicado mudou, a
atualização falha e o autor decide como reconciliar. O banco conserva uma única
linha de revisão corrente por curso publicado e um vínculo compacto por
curso/destino do workspace, não uma cópia por tentativa.

## Integridade

O documento canônico é validado e armazenado por conteúdo antes do commit. O
banco registra hash, contagens, estado de conclusão e revisão. O aplicativo
sincroniza o ponteiro e baixa o artefato privado verificando tamanho e SHA-256.
