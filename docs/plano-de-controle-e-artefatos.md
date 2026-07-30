# Workspaces e artefatos imutáveis

A autoria separa ponteiros transacionais de conteúdo. PostgreSQL guarda
identidade, autorização, revisão atual, histórico, idempotência e metadados de
publicação. Supabase Storage guarda snapshots JSON completos, privados,
canônicos e imutáveis.

## Estruturas persistidas

`private.authoring_workspaces` mantém o ponteiro mutável:

- proprietário;
- título;
- revisão corrente e hash do artefato;
- curso e revisão usados como origem, quando existirem;
- timestamps e exclusão lógica.

`private.authoring_workspace_revisions` é o log append-only. Cada linha liga
uma revisão ao snapshot, à revisão-pai, à operação, ao `requestId` e ao autor.

`private.authoring_workspace_requests` garante idempotência por
`owner_id + request_id`. Ela conserva a operação, o hash canônico do pedido e
o resultado confirmado.

O documento continua usando o contrato público v4. Um único workspace pode
conter vários cursos para viabilizar recomposição entre árvores.

## Integridade e upload

Antes do upload, a Edge Function valida o modelo JSON, ordena chaves,
serializa de forma determinística, codifica em UTF-8 e calcula SHA-256. O
caminho é derivado do hash:

```text
artifacts/sha256/ab/cd/abcdef...json
```

Uploads não sobrescrevem objetos. Arquivos pequenos usam upload padrão;
artefatos acima de 6 MiB usam TUS retomável e cada snapshot aceita no máximo
32 MiB. O limite é conferido antes do upload e, na leitura, pelo metadado,
pelo `Content-Length` quando presente e pelos bytes efetivamente recebidos.
Toda leitura também confere UTF-8, JSON e SHA-256.

Essa organização se aproxima de um repositório content-addressed: snapshots
imutáveis ficam separados do nome mutável que aponta para a revisão corrente.
Veja [Git internals — objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
e [Supabase Storage uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads).

## Transação de uma mutação

```text
validar requestId e argumentos
→ consultar replay já confirmado
→ ler a revisão base
→ aplicar uma operação pura
→ validar o documento v4 completo
→ gravar o snapshot por hash
→ bloquear a linha do workspace
→ comparar expectedRevision
→ acrescentar histórico e avançar o ponteiro
→ registrar o resultado idempotente
```

O bloqueio e o compare-and-swap ocorrem em transação curta. Workspaces
independentes podem avançar em paralelo. Uma base desatualizada nunca recebe
merge implícito.

Referências: [PostgreSQL `SELECT`](https://www.postgresql.org/docs/current/sql-select.html)
e [transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html).

## Publicação

A publicação seleciona um curso do workspace, gera uma revisão imutável de
curso e atualiza o ponteiro público por hash.

- `private + partial`: prévia testável na biblioteca do proprietário;
- `private + complete`: curso pessoal integral;
- `catalog + complete`: publicação editorial;
- `catalog + partial`: rejeitada.

Atualizar um curso existente exige o hash corrente esperado. Publicar não
encerra nem congela o workspace: edições posteriores podem gerar novas
revisões.

## Coleta

Snapshots referenciados pelo histórico de workspaces ou por revisões de curso
não são candidatos à coleta. O coletor só considera objetos antigos e sem
referência, usa tombstone transacional e restaura o registro caso a remoção do
objeto falhe.

O banco não armazena o conteúdo pedagógico em JSONB operacional. Isso mantém
as transações pequenas sem sacrificar histórico, retomada ou auditoria.
