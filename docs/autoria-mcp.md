# Gateway MCP de autoria

O gateway MCP é a superfície de autoria extensa do AraLearn. Ele permite ler,
criar, complementar, reorganizar e publicar cursos sem entregar acesso direto
ao banco ou ao Storage. O documento v4 do workspace e sua revisão formam o
estado completo da autoria.

## Transporte e autenticação

O endpoint remoto é:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

O servidor usa Streamable HTTP stateless e o protocolo `2025-11-25`. Ele
anuncia instruções de servidor, ferramentas e resources de conhecimento, não
emite `MCP-Session-Id` e devolve
`structuredContent` em um envelope comum de sucesso ou erro. No ramo de
sucesso, cada ferramenta fecha `data` com o contrato próprio de sua rota:
itens e cursores de listas, metadados de leitura, controle de revisão,
histórico, recibo de publicação ou recibo de exclusão. Não existe
`data: {}` genérico.

Objetos abertos aparecem somente dentro de um campo semanticamente nomeado
cuja forma integral necessariamente varia: `content` ao ler uma entidade ou o
documento canônico e `definition` ao consultar o contrato canônico de um
`resource`. `outline` e `microtheories` têm árvores fechadas. Em todos os
casos, os campos de controle que circundam esse conteúdo permanecem fechados.
O ramo de erro é comum a todas as ferramentas.

O MCP aceita somente access token OAuth 2.1 emitido pelo Supabase Auth para a
URL exata do recurso. Não existe credencial estática. O Chatbot personalizado
usa uma Action OpenAPI que traduz suas operações para o mesmo registro de
ferramentas e o mesmo executor interno; ela não constitui outro motor de
autoria nem possui contrato independente. A identidade e as permissões de
ambas as superfícies convergem para a mesma conta, mas os protocolos de
concessão são separados. O servidor MCP publica os metadados do
recurso em:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp/.well-known/oauth-protected-resource
```

O cliente descobre o servidor de autorização, solicita `openid`, executa
Authorization Code com PKCE `S256` e envia o token em `Authorization: Bearer`.
O backend valida o token no Auth, além de `iss`, `aud`, `client_id`, `sub`,
`exp` e `nbf`. O Supabase não emite as permissões de aplicação como claims do
access token; por isso o backend não inventa nem exige `scope` no JWT. Papéis e
permissões efetivas são resolvidos no banco para o usuário autenticado.

O consentimento usa a sessão normal do AraLearn. Com a Site URL pública
`https://fabio-ara.github.io/AraLearn/`, a configuração hospedada usa `/` como
Authorization Path. O shell preserva `authorization_id` durante confirmação de
e-mail ou login, consulta os dados do cliente e o pedido de identidade no
Supabase Auth, permite autorizar ou negar e só então segue o `redirect_url`
validado. A tela distingue o consentimento de identidade da autoridade efetiva:
ler cursos acessíveis, editar ou excluir rascunhos de workspace e publicar na
biblioteca privada são permissões calculadas no banco. Publicação no catálogo
continua condicionada ao papel editorial ali atribuído.

Uma falha de autenticação devolve `WWW-Authenticate` com
`resource_metadata`; uma falha durante `tools/call` também devolve o desafio
em `_meta["mcp/www_authenticate"]`.

A Action do Chatbot usa Authorization Code confidencial nos endpoints da
própria Edge Function. O contrato atual de autenticação de GPT Actions
documenta `client_id`, `client_secret`, URL de autorização e Token URL, mas não
expõe os parâmetros PKCE obrigatórios do OAuth Server do Supabase. A fachada
evita depender dessa incompatibilidade: exige `state` e callback exato, consome
o código uma única vez, rotaciona refresh tokens e guarda no banco somente
hashes de segredo, código e tokens. Ela não aceita API key nem cria outra
política de acesso.

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

- preparar a autoria recuperando um brief pertinente ao pedido;
- listar recursos e consultar o contrato formal de um `resource`;
- listar cursos pessoais, coleções e cursos publicados do catálogo; essa leitura
  serve ao reaproveitamento por qualquer autor autenticado e não concede
  publicação editorial;
- ler árvore, entidade, documento ou microteorias de um curso;
- listar, criar, ler e consultar o histórico de workspaces;
- importar um curso existente para reaproveitar conteúdo;
- inserir, substituir, renomear, mover ou excluir uma entidade;
- juntar ou separar microssequências;
- transformar módulo em curso ou curso em módulo;
- restaurar revisão, publicar um curso ou excluir o workspace.

## Conhecimento sob demanda

O campo `instructions` da inicialização concentra a ordem operacional
indispensável nos primeiros caracteres: preparar pedidos autorais, consultar
estado atual, usar revisões e mostrar microteorias. As descrições e os schemas
continuam específicos a cada ferramenta.

Antes de criar, ampliar, revisar pedagogicamente, reorganizar ou publicar, o
modelo chama `prepararAutoriaAraLearn` com:

- intenção fechada;
- nível estrutural alvo;
- resumo do contexto útil da conversa;
- resources já previstos, quando houver.

O servidor faz recuperação lexical determinística sobre unidades pequenas e
versionadas de fluxo, pedagogia, resources e segurança. O resultado contém no
máximo seis trechos, uma sequência operacional e ferramentas recomendadas. Não
há embedding remoto, banco vetorial, geração intermediária ou armazenamento do
texto da conversa. Isso reduz latência, custo, exposição de dados e variação
em um domínio pequeno, ao mesmo tempo que mantém o contrato dos resources
consultável individualmente.

Os mesmos quatro grupos são publicados como resources MCP
`aralearn://knowledge/...`. Resources são úteis para clientes que controlam a
injeção de contexto; `prepararAutoriaAraLearn` permanece model-controlled e,
portanto, funciona no Plugin do ChatGPT sem depender de o host anexar
documentos previamente.

## Chatbot personalizado

O GPT personalizado usa:

- instruções próprias;
- dois arquivos de conhecimento;
- `ACTION_OPENAPI.yaml`;
- OAuth individual da conta AraLearn.

O OpenAPI é gerado do registro canônico das ferramentas MCP. Cada
`operationId`, descrição, input schema e indicação de consequência deriva da
mesma definição executada pelo Plugin. A Action limita corpo e resposta a
96 KiB, abaixo do teto atual do ChatGPT, e devolve orientação para ler
`outline` ou uma entidade menor quando o recorte excede esse limite.

O painel autenticado cria primeiro o cliente OAuth confidencial da Action, sem
exigir o ID ainda inexistente do GPT. Depois que o construtor salva o GPT e
atribui `g-...`, o painel vincula esse cliente e grava os dois callbacks exatos
com `client_secret_post`, compatível com o método POST do construtor. O segredo
é mostrado somente na sessão de configuração; somente seu hash entra no banco,
e o valor bruto não entra no repositório, site ou APK.

`course`, `module`, `lesson`, `microsequence` e `card` são entidades
endereçáveis. A referência é sempre um `entityPath` estrutural, por exemplo
`[courseId, moduleId, lessonId]`; não existe busca global por id. Isso torna
cópias seguras mesmo quando preservam ids internos. Ao importar um curso, o
agente também informa um `workspaceCourseId` novo para a raiz. Módulos, lições,
microssequências e cards podem atravessar cursos dentro do workspace. A cópia
preserva a origem; o movimento remove a origem na mesma revisão atômica.

## Revisão no chat

Por padrão, o GPT usa `revisarMicroteoriasDoWorkspace`. A projeção devolve os
conteúdos teóricos consolidados por microteoria e apenas a contagem das práticas
associadas. Isso permite à pessoa avaliar seleção, recorte e explicação
conceitual sem receber no chat uma enumeração de cards teóricos ou de práticas
abundantes. Todos os cards continuam integralmente no documento e podem ser
lidos quando a pessoa pedir.

Os parâmetros da ferramenta são:

- `workspaceId` obrigatório, no formato UUID;
- `revision` opcional, inteiro positivo; quando omitido, lê a revisão vigente;
- `entityPath` opcional, com um a quatro IDs, para limitar a projeção a curso,
  módulo, lição ou microssequência. A omissão projeta o workspace inteiro.

No sucesso, `structuredContent` contém `ok: true`, `requestId: null` e `data`.
O campo `data` combina o controle imutável lido — `workspaceId`, `title`,
`revision`, `currentRevision`, `sourceCourseId`, `sourceRevisionHash`,
`createdAt`, `updatedAt`, `idempotent` e `artifact` (`hash`, `bucket`,
`objectKey`, `artifactType`, `mediaType`, `sizeBytes`) — com
`view: "microtheories"` e esta árvore:

```text
content
└── courses[]
    ├── id, entityPath[1], title
    └── modules[]
        ├── id, entityPath[2], title
        └── lessons[]
            ├── id, entityPath[3], title
            └── microtheories[]
                ├── id, entityPath[4], title, goal, status
                ├── content: string conceitual consolidada
                └── practiceCount: inteiro não negativo
```

O schema fecha todos esses objetos e recusa conteúdo card a card, campos
extras, caminhos com profundidade incorreta e estados fora de `planned`,
`generated`, `needs_review` ou `ready`. Falhas preservam o envelope comum
`{ ok: false, requestId, error: { code, message, details? } }`.

As outras famílias de sucesso também são explícitas:

- listas fecham o formato de cada item e do cursor seguinte;
- leituras de curso fecham `courseId`, título, hash, completude e `view`;
- leituras de workspace fecham revisão lida, revisão vigente, origem,
  timestamps, idempotência e descritor do artefato;
- toda mutação devolve esse mesmo controle de revisão completo;
- publicação fecha curso, hash, destino, completude e idempotência;
- exclusão fecha workspace, confirmação e idempotência.

O arquivo distribuído
`authoring/schemas/workspace-envelope.schema.json` valida somente o envelope do
documento v4 (`contract`, `version`, `kind`, `scope` e `courses`). Ele não é o
`outputSchema` das ferramentas MCP nem substitui os contratos canônicos da
árvore pedagógica e dos dezoito `resources`.

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

O desenho segue recomendações de OAuth, ferramentas focadas, schemas precisos,
recuperação seletiva e avaliação representativa:

- [OpenAI — Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI — Authentication for MCP servers](https://developers.openai.com/plugins/build/auth)
- [OpenAI — Getting started with GPT Actions](https://developers.openai.com/api/docs/actions/getting-started)
- [OpenAI — GPT Action authentication](https://developers.openai.com/api/docs/actions/authentication)
- [OpenAI — Production notes on GPT Actions](https://developers.openai.com/api/docs/actions/production)
- [Model Context Protocol — server primitives](https://modelcontextprotocol.io/specification/2025-11-25/server)
- [Supabase Auth as an OAuth 2.1 server](https://supabase.com/docs/guides/auth/oauth-server)
- [Lewis et al. — Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401)
- [Asai et al. — Self-RAG](https://arxiv.org/abs/2310.11511)

## Validação local

```powershell
npm test
npm run test:authoring:mcp
npm run test:authoring:mcp:local
```

Sem um token OAuth local, o smoke verifica a descoberta e o desafio de
autenticação para uma requisição sem Bearer válido. Com
`ARALEARN_AUTHORING_MCP_OAUTH_TOKEN`, também cria, lê e remove um workspace.
