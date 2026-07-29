# Publicação e prévia

O workspace e o curso publicado são objetos diferentes. O workspace conserva
o processo; a publicação cria ou atualiza uma revisão de curso.

## Prévia privada

`completion: partial` publica um curso privado estruturalmente válido mesmo que
algumas microssequências ainda estejam planejadas ou em revisão. O autor pode
abrir, estudar, testar navegação, recursos e progressão já existentes. A
prévia aparece apenas na biblioteca do proprietário.

## Curso completo

`completion: complete` verifica que todas as microssequências estão `ready`.
Pode ser privado ou editorial. O catálogo aceita somente esta forma.

## Criação e atualização

`publicationMode: create` cria nova identidade publicada.

`publicationMode: update` exige:

- `existingCourseId`;
- `expectedContentHash` lido antes da alteração.

A troca do ponteiro é atômica. Se o hash publicado mudou, a atualização falha
e o autor decide como reconciliar.

## Integridade

O documento canônico é validado e armazenado por conteúdo antes do commit. O
banco registra hash, contagens, estado de conclusão e revisão. O aplicativo
sincroniza o ponteiro e baixa o artefato privado verificando tamanho e SHA-256.
