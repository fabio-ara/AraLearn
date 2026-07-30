# Integração genérica de autoria

Use o MCP remoto do AraLearn como única superfície de ferramentas. O servidor
autentica cada chamada por OAuth 2.1, resolve no banco as permissões efetivas
da conta e devolve `structuredContent`.

## Ciclo mínimo

1. liste cursos ou workspaces;
2. leia `outline`;
3. leia a entidade necessária e conserve seu `entityPath` completo;
4. envie um comando com `expectedRevision`;
5. conserve a nova revisão;
6. use a projeção `microtheories` para revisão humana;
7. publique uma prévia privada ou um curso completo.

O cliente usa o documento e a revisão devolvidos pelo servidor como estado
completo. O servidor valida cada revisão e grava snapshots imutáveis.

## Idempotência

Gere um `requestId` estável antes da chamada. Repita-o somente com argumentos
idênticos. Não confunda esse identificador com `expectedRevision`: o primeiro
recupera uma chamada; o segundo protege contra escrita concorrente.

## Permissões efetivas

- `authoring:read` / `authoring:private:read`;
- `authoring:write` / `authoring:private:write`;
- `catalog:publish`.

Esses identificadores pertencem ao modelo de autorização do banco. Eles não
são escopos OAuth solicitados ao provedor nem claims do access token. Publicação
parcial é sempre privada.
