# Workspaces compostos e artefatos

A autoria usa duas formas de persistência, cada uma no momento em que faz
sentido:

- o PostgreSQL mantém o workspace mutável por partes pequenas;
- o Supabase Storage recebe o documento JSON integral somente quando uma
  revisão é publicada; uma submissão editorial aponta para esse artefato exato.

Essa separação evita gravar novamente um curso inteiro para corrigir um título,
um resource ou um card.

## Estado atual do workspace

`private.authoring_workspaces` guarda proprietário, título, revisão corrente,
origem opcional, contexto curto e exclusão lógica.

`private.authoring_workspace_entities` guarda uma linha corrente para cada:

- projeto;
- curso;
- módulo;
- lição;
- tópico;
- microssequência;
- card.

Cada linha informa identidade, pai, posição, conteúdo próprio e versão. Os
filhos não são duplicados dentro do pai: o servidor os reúne pela relação
estrutural e recompõe o documento público v4 quando precisa validar, ler ou
publicar.

O workspace aceita até 10 mil partes e 32 MiB quando recomposto. Cada parte
tem limite próprio de 1 MiB. Esses tetos tornam o custo previsível sem impor
uma cota artificial de cards por pessoa.

## Concorrência e repetição segura

Uma alteração leva:

- `expectedRevision`, a revisão global que a ferramenta leu;
- versões esperadas das partes atingidas;
- `requestId`, que identifica aquela intenção;
- somente as inserções, atualizações e exclusões necessárias.

O servidor:

```text
confere o pedido já confirmado
→ bloqueia o workspace
→ compara a revisão global e as partes tocadas
→ aplica a menor mudança
→ recompõe e valida o documento v4
→ avança a revisão
→ grava o recibo e um resumo curto
```

Se a resposta se perder, repetir o mesmo `requestId` e o mesmo conteúdo devolve
o resultado anterior. Reutilizar o identificador com outro pedido é conflito.
Uma base desatualizada é recusada, sem combinação silenciosa.

Os recibos idempotentes duram 14 dias. Cada workspace conserva no máximo 200
eventos recentes, com operação e resumo. Eventos servem para orientação e
auditoria operacional; não guardam a árvore antiga e não oferecem restauração
de uma revisão.

Referências: [PostgreSQL `SELECT`](https://www.postgresql.org/docs/current/sql-select.html)
e [transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html).

## Cópia e movimento

Uma cópia profunda remapeia as identidades da raiz e dos descendentes, inclusive
referências internas, e preserva a origem. A parte copiada pode então evoluir
sem alterar o curso de onde veio.

Um movimento mantém a identidade da parte atual, troca seu pai e sua posição e
remove a localização anterior na mesma transação. Identidades são únicas por
tipo dentro do workspace, o que impede duas posições de compartilhar
acidentalmente a mesma entidade mutável.

## Materialização no Storage

Ao publicar, a Edge Function recompõe o curso, valida o contrato, ordena chaves,
serializa em UTF-8 e calcula o SHA-256. O caminho do objeto deriva desse hash:

```text
artifacts/sha256/ab/cd/abcdef...json
```

Objetos não são sobrescritos. Arquivos pequenos usam upload padrão; artefatos
acima de 6 MiB usam TUS retomável, e cada documento aceita no máximo 32 MiB.
Tamanho, UTF-8, JSON e SHA-256 são verificados no envio e na leitura.

Antes do primeiro `POST` ou bloco TUS, o plano de controle pré-registra o
descritor endereçado pelo hash. Assim, uma falha de rede, timeout ou conflito de
publicação deixa uma referência órfã conhecida, que o coletor pode remover
depois da janela de segurança. O commit da publicação volta a conferir e
registrar o mesmo descritor de forma idempotente.

Essa organização é content-addressed: o artefato permanece imutável, enquanto
o ponteiro do curso pode avançar para outro hash. Veja [Git internals —
objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects) e [Supabase
Storage uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads).

## Trilhas, publicação e submissão

- workspace corrente: plano e partes estudáveis em Trilhas, sem artefato;
- `private + partial|complete`: revisão exata fixada para submissão editorial;
- `catalog + complete`: publicação editorial;
- `catalog + partial`: rejeitada.

`private.authoring_workspace_publications` conserva um vínculo pequeno por
`workspace + raiz de curso + destino`, com `courseId` e o hash usado como base.
Na primeira publicação o servidor cria o curso; nas seguintes, encontra esse
vínculo e atualiza automaticamente a mesma identidade, mesmo que a conversa
tenha sido reiniciada. Abrir um workspace a partir de uma publicação semeia seu
destino real; importar um curso para reaproveitamento não cria vínculo.

Atualizar exige a revisão esperada do workspace e confere internamente o hash
vigente do curso contra o vínculo. O par explícito `existingCourseId` e
`expectedContentHash` só é necessário para anexar uma publicação existente
quando ainda não houver vínculo, e os dois campos são indivisíveis. Excluir a
raiz do curso ou arquivar a publicação remove o vínculo. Publicar não congela
o workspace.

Uma submissão editorial aponta para uma revisão privada e seu hash exato. Esse
artefato permanece retido enquanto a submissão estiver ativa. A pessoa revisora pode
abrir uma cópia independente num workspace editorial; correções ali não
alteram o curso privado do autor.

## Coleta

O coletor considera somente artefatos antigos e sem referência. Revisões de
curso e submissões editoriais continuam protegidas. A coleta usa tombstone
transacional e devolve a referência se a remoção do objeto falhar. Uma reserva
cujo upload não chegou a criar o objeto também é encerrada com segurança quando
o Storage confirma que o caminho não existe.

Como workspaces mutáveis não criam objetos no Storage, não há cópias integrais
de cada pequena alteração para coletar depois.
