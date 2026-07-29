# Integração genérica de autoria

Use o MCP remoto do AraLearn como única superfície de ferramentas. O servidor
autentica cada chamada por chave privada, filtra ferramentas pelos escopos e
devolve `structuredContent`.

## Ciclo mínimo

1. liste cursos ou workspaces;
2. leia `outline`;
3. leia a entidade necessária;
4. envie um comando com `expectedRevision`;
5. conserve a nova revisão;
6. use a projeção `microtheories` para revisão humana;
7. publique uma prévia privada ou um curso completo.

O cliente não mantém cursor causal nem precisa reconstruir estado de
execução. O servidor valida a revisão e grava snapshots imutáveis.

## Idempotência

Gere um `requestId` estável antes da chamada. Repita-o somente com argumentos
idênticos. Não confunda esse identificador com `expectedRevision`: o primeiro
recupera uma chamada; o segundo protege contra escrita concorrente.

## Escopos

- `authoring:read` / `authoring:private:read`;
- `authoring:write` / `authoring:private:write`;
- `catalog:publish`.

Publicação parcial é sempre privada.
