# Biblioteca e packages

O AraLearn usa `aralearn.library.v1`. A raiz contém `contract`, `courses` e,
em recortes exportados, `scope`. Curso, módulo, lição e microssequência mantêm
a organização pedagógica, os guides, tópicos e dependências já documentados.

Cards não pertencem a uma união monolítica de resources. Cada card é um
envelope com `id`, `position`, `title`, `role`, `content`, `response`,
`feedback`, `topics` e `sources`. Cada item de conteúdo, resposta ou feedback
é uma instância `{ id, package, version, data }`.

Cards de teoria exigem ao menos uma instância em `content`. Cards de prática
podem usar `content: []` quando a pergunta de um package de resposta constitui
todo o material visível. Em uma escolha, a pergunta pertence somente a
`aralearn.response.choice`; `paragraph` serve apenas para contexto adicional e
não pode duplicar o mesmo enunciado.

O kernel conhece apenas slots, identidade, versão, validação, renderização,
texto acessível e avaliação. Cada package entrega seu próprio manifest,
contrato autoral, schema, normalização, renderer e, quando ocupa `response`,
avaliador. Adicionar um package compatível não altera o kernel.

O fluxo de autoria é deliberadamente progressivo:

1. planejar a microssequência e suas operações cognitivas;
2. usar `consultarBibliotecaDeResources` com `explore` e `search`;
3. usar `inspect` para comparar a lista curta;
4. obter com `contracts` no máximo quatro contratos exatos por chamada;
5. materializar envelopes completos e executar `validate_card`;
6. executar `audit_representation` antes da gravação.

`preview_card` devolve apenas um descritor com `rendered: false`; a prévia
visual fiel existe no renderer do aplicativo. Se a busca classificar a
cobertura como `substitute`, a autoria prossegue e comunica brevemente o
`chatDisclosure` recebido.

A intenção, a escolha e uma eventual substituição de `resource` são
metadados da decisão autoral no workspace. Não são campos do envelope do card:
o documento distribuído conserva apenas as instâncias de packages que de fato
serão renderizadas.

Microssequências com cards ficam imediatamente estudáveis. Microssequências
sem cards permanecem visíveis como planejamento. Não existe campo de
publicado, rascunho, pronto ou concluído no documento.

Veja [recursos de card](recursos-de-card.md) e
[autoria por MCP](autoria-mcp.md).
