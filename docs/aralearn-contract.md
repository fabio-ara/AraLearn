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
2. consultar o catálogo compacto de packages;
3. escolher packages adequados;
4. consultar somente os contratos e versões escolhidos;
5. materializar envelopes completos;
6. validar pedagogia, estrutura e referências antes da gravação.

Microssequências com cards ficam imediatamente estudáveis. Microssequências
sem cards permanecem visíveis como planejamento. Não existe campo de
publicado, rascunho, pronto ou concluído no documento.

Veja [recursos de card](recursos-de-card.md) e
[autoria por MCP](autoria-mcp.md).
