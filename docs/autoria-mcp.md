# Gateway MCP de autoria

O gateway MCP é a superfície de autoria extensa do AraLearn. Ele permite ler,
criar, complementar, reorganizar e publicar cursos sem entregar acesso direto
ao banco ou ao Storage. O antigo fluxo de execução, plano imutável, partes e
cursor foi removido.

## Transporte e autenticação

O endpoint remoto é:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

O servidor usa Streamable HTTP stateless e o protocolo `2025-11-25`. Ele
anuncia somente ferramentas, não emite `MCP-Session-Id` e devolve
`structuredContent` conforme o `outputSchema` comum.

Cada chamada apresenta uma única chave pessoal ou editorial `arl_...`:

```http
Authorization: Bearer arl_...
```

ou:

```http
X-AraLearn-API-Key: arl_...
```

O banco guarda apenas o SHA-256 da chave. Origem, validade, revogação, escopos
e limite por minuto são verificados antes da ferramenta. Chaves pessoais ficam
restritas ao proprietário; publicação no catálogo exige `catalog:publish`.

## Modelo de workspace

Um workspace contém zero ou mais cursos v4 e pode reunir conteúdo de cursos
existentes. Cada gravação:

1. informa a revisão lida em `expectedRevision`;
2. expressa uma única intenção com um `requestId` estável;
3. produz um snapshot JSON canônico e imutável no Storage;
4. confirma por compare-and-swap uma nova revisão no PostgreSQL.

Se a resposta se perder, repetir exatamente a chamada recupera o resultado já
confirmado. Reutilizar o mesmo `requestId` com outros dados é conflito. Se
outra edição avançou o workspace, o servidor recusa a base desatualizada e o
agente deve reler antes de preparar uma nova intenção.

O histórico nunca é reescrito. Restaurar uma revisão antiga cria uma revisão
nova com o mesmo conteúdo.

## Ferramentas

As ferramentas são pequenas e previsíveis:

- listar recursos e consultar o contrato formal de um `resource`;
- listar cursos pessoais, coleções e cursos do catálogo;
- ler árvore, entidade, documento ou microteorias de um curso;
- listar, criar, ler e consultar o histórico de workspaces;
- importar um curso existente para reaproveitar conteúdo;
- inserir, substituir, renomear, mover ou excluir uma entidade;
- juntar ou separar microssequências;
- transformar módulo em curso ou curso em módulo;
- restaurar revisão, publicar um curso ou excluir o workspace.

`course`, `module`, `lesson`, `microsequence` e `card` são entidades
endereçáveis. Módulos, lições, microssequências e cards podem atravessar cursos
dentro do workspace. A cópia preserva a origem; o movimento remove a origem na
mesma revisão atômica.

## Revisão no chat

Por padrão, o GPT usa `revisarMicroteoriasDoWorkspace`. A projeção devolve os
cards `theory` e apenas a contagem das práticas associadas. Isso permite à
pessoa avaliar seleção, recorte e explicação conceitual sem receber no chat a
enumeração de práticas abundantes. Cards de prática continuam integralmente no
documento e podem ser lidos quando a pessoa pedir.

## Publicação incompleta

Um curso em construção pode ser publicado e testado como `partial`, mas
somente na biblioteca privada do proprietário. A revisão parcial é um curso
real e sincronizável; microssequências prontas continuam estudáveis.

`complete` exige todas as microssequências com estado `ready`. O catálogo
aceita apenas `complete` e continua exigindo confirmação e permissão editorial.
Atualizações também usam o hash da revisão vigente do curso como compare-and-
swap.

## Contrato e robustez

Schemas recusam campos desconhecidos. Ferramentas de leitura têm
`readOnlyHint`; exclusões declaram `destructiveHint`; as chamadas não acessam
domínios externos e anunciam `openWorldHint: false`. O servidor não pede que o
modelo memorize estado: revisão, IDs e resultados permanecem persistidos.

O desenho segue a recomendação de ferramentas MCP focadas, schemas precisos e
saída estruturada:

- [OpenAI — Model Context Protocol](https://developers.openai.com/api/docs/mcp)
- [OpenAI — Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)

## Validação local

```powershell
npm test
npm run test:authoring:mcp
npm run test:authoring:mcp:local
```

O smoke local cria contas e chaves temporárias, verifica isolamento,
idempotência e autorização e remove os dados de ensaio ao final.
