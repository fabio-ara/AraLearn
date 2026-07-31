# Gateway MCP de autoria

O gateway MCP é a superfície de autoria extensa do AraLearn. Ele permite ler,
criar, complementar, reorganizar e publicar cursos sem entregar acesso direto
ao banco ou ao Storage. O estado atual é um workspace composto no PostgreSQL;
o documento v4 é recomposto para leitura, validação e publicação.

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
alterações recentes, recibo editorial, recibo de publicação ou recibo de
exclusão. Não existe
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

## Ciclo editorial

O backend continua flexível e sem máquina de aprovação conversacional. A
separação ocorre nas instruções e no conhecimento recuperado:

```text
planejamento -> decisão -> construção -> decisão -> auditoria -> decisão
-> reparo -> decisão -> reauditoria
```

`prepararAutoriaAraLearn` distingue `audit`, que recomenda somente leituras, de
`repair`, que recomenda mutações focadas. A intenção histórica `revise`
permanece disponível para revisão geral, mas não deve ser usada como atalho
ambíguo quando a etapa já é conhecida. Revisão editorial do catálogo é outro
processo, ligado a submissões e capacidades administrativas.

Cada rodada editorial apresenta o resultado, sugere exatamente uma próxima
etapa e espera. A pessoa pode dispensar auditoria ou reauditoria. Não existe
token de aprovação, estado obrigatório ou bloqueio de publicação associado à
conversa. `revision` controla concorrência; `ready` representa aceitação
explícita do conteúdo corrente; validação estrutural não comprova qualidade
pedagógica.

## Modelo de workspace

Um workspace contém zero ou mais cursos v4 e pode reunir conteúdo de cursos
existentes. PostgreSQL mantém uma linha corrente por projeto, curso, módulo,
lição, tópico, microssequência e card. Os campos de pai e posição formam a
árvore; o servidor recompõe o documento v4 quando necessário.

Cada gravação:

1. informa a revisão lida em `expectedRevision`;
2. expressa uma única intenção com um `requestId` estável;
3. envia somente as partes criadas, atualizadas ou excluídas;
4. confere também as versões das partes atingidas;
5. recompõe e valida o documento completo;
6. confirma por compare-and-swap a nova revisão.

Se a resposta se perder, repetir exatamente a chamada recupera o resultado já
confirmado. Reutilizar o mesmo `requestId` com outros dados é conflito. Se
outra edição avançou o workspace, o servidor recusa a base desatualizada e o
agente deve reler antes de preparar uma nova intenção.

Os recibos de repetição segura têm retenção de 14 dias. A lista de alterações
conserva até 200 eventos recentes com resumos pequenos; ela não guarda versões
integrais do curso e não serve para restaurar uma revisão antiga.

O Storage não recebe arquivos a cada mutação. A publicação fixa um artefato
canônico e imutável; uma submissão editorial aponta para o hash exato desse
artefato.

Cada curso do workspace mantém, por destino, um vínculo compacto com sua
publicação. A leitura devolve esses vínculos em `publications` e a listagem de
workspaces traz `publicationCount`. A primeira publicação cria; as seguintes
atualizam automaticamente a mesma identidade, inclusive em outra conversa.
Quando hash, destino e estado já coincidem, a confirmação retorna
`unchanged: true`, preserva `publicationSeq` e não produz upload, revisão ou
evento de sincronização.

Abrir um curso publicado semeia seu vínculo real; importar uma cópia para
reaproveitamento não o faz. O par opcional `existingCourseId` e
`expectedContentHash` só anexa uma publicação preexistente quando ainda não
houver vínculo e nunca é enviado pela metade.

## Ferramentas

As ferramentas são pequenas e previsíveis:

- preparar a autoria recuperando um brief pertinente ao pedido;
- listar recursos e consultar o contrato formal de um `resource`;
- listar e retirar cursos em Trilhas; somente uma conta com capacidade
  editorial recebe também a listagem de Coleções, de seus cursos e a busca
  global em `consultarCatalogo`;
- ler árvore, entidade, documento ou microteorias de um curso;
- listar, criar e ler workspaces, além de consultar resumos recentes;
- importar um curso existente para reaproveitar conteúdo;
- registrar uma estrutura planejada em lote pequeno;
- materializar uma microssequência, atualizar metadados ou corrigir um card;
- copiar, renomear, mover ou excluir uma entidade;
- juntar ou separar microssequências;
- transformar módulo em curso ou curso em módulo;
- publicar uma prévia privada ou um curso completo e excluir o workspace;
- enviar uma revisão privada, acompanhar a fila e, quando a conta permitir,
  revisar ou publicar no catálogo.

Não há operação genérica de inserir ou substituir uma subárvore arbitrária nem
operação de restaurar revisão. Lotes grandes são decompostos em estrutura,
microssequências, metadados e cards.

No `brief`, cada fonte aprovada recebe a declaração compacta `[source:id]`
seguida de sua identificação. Uma mutação só pode introduzir esse `id` em
`card.sources` depois da declaração; fontes já presentes em conteúdo importado
continuam válidas. Em `append`, a ordem recebida é anexada ao fim, as posições
são renumeradas e `change.positionsNormalized` torna essa normalização
explícita.

O registro canônico tem 29 ferramentas tanto no MCP quanto na Action. Seis
nomes concentram famílias relacionadas com contratos fechados. Cinco usam
`operation`; a consulta de resources alterna entre lista e detalhe pela
presença de `resource`:

| Ferramenta | Operações |
| --- | --- |
| `consultarRecursosDeCard` | sem `resource`, lista; com `resource`, consulta o contrato compacto; `detail: "full"` inclui `afterBlocks` |
| `consultarCatalogo` | `list_collections`, `list_collection_courses`, `search_courses` |
| `editarCatalogo` | `create_collection`, `update_collection`, `move_course` |
| `retirarDoCatalogo` | `retire_collection`, `remove_course` |
| `reorganizarWorkspace` | `copy_entity`, `rename_entity`, `move_entity`, `merge_microsequences`, `split_microsequence`, `promote_module`, `demote_course` |
| `excluirDoWorkspace` | `delete_entity`, `delete_workspace` |

Esse agrupamento não transforma o backend em uma mutação genérica. Cada valor
de `operation` seleciona uma entrada fechada; em resources, a presença do campo
seleciona a consulta detalhada. Retiradas e exclusões continuam separadas das
edições comuns. Nomes individuais antigos não fazem parte da superfície
pública.

O detalhe padrão evita repetir no contexto do modelo os mesmos blocos e níveis
recursivos. O contrato `full` permanece disponível para autoria de
`afterBlocks` e diagnóstico; a persistência valida sempre o schema canônico
integral, independentemente do nível transportado.

No MCP, `destructiveHint` conserva a semântica normativa do protocolo para
mutações não aditivas. Na Action, o metadado próprio de consequência marca
somente retiradas e exclusões; gravações normais não provocam uma confirmação
extra a cada lote. Em qualquer superfície, um pedido já inequívoco é executado
depois da releitura do alvo, e só uma ambiguidade real volta para a pessoa.

`consultarCatalogo` com `operation: "search_courses"` exige uma consulta de 2
a 200 caracteres e aplica semântica AND: cada token precisa aparecer, sem
distinção entre maiúsculas e minúsculas, no título, objetivo ou `contractKey`
do curso, ou no título ou descrição da coleção. A resposta, limitada a 50
itens, contém somente metadados, hash, revisão, contagens e a coleção. O cursor
pareado `afterTitle` + `afterCourseId` mantém a paginação determinística. A RPC
`search_authoring_catalog_courses_v5` não lê artefatos nem acessa o Storage.

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
máximo oito trechos, uma sequência operacional e ferramentas recomendadas. Em
criação ou ampliação, entram sempre o contrato operacional, o brief, a
disciplina de fontes, a materialização incremental, o dimensionamento da
cobertura, o desenho de microteoria e prática e a seleção de resources. Não há
embedding remoto, banco vetorial, geração intermediária ou armazenamento do
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
96 KiB para manter um orçamento previsível e devolve orientação para ler
`outline` ou uma entidade menor quando o recorte excede esse limite. O
`outline` lista a hierarquia e `cardCount`, mas não repete a lista de cards.

O painel autenticado cria primeiro o cliente OAuth confidencial da Action, sem
exigir o ID ainda inexistente do GPT. Depois que o construtor salva o GPT e
atribui `g-...`, o painel vincula esse cliente e grava os dois callbacks exatos
com `client_secret_post`, compatível com o método POST do construtor. O segredo
é mostrado somente na sessão de configuração; somente seu hash entra no banco,
e o valor bruto não entra no repositório, site ou APK.

`course`, `module`, `lesson`, `microsequence` e `card` são entidades
endereçáveis. A referência é sempre um `entityPath` estrutural, por exemplo
`[courseId, moduleId, lessonId]`; ele informa a localização completa que a
pessoa reconhece.

As identidades são únicas por tipo dentro do workspace. Uma cópia profunda
recebe uma nova raiz e remapeia também seus descendentes e referências internas,
preservando a origem. Um movimento mantém a entidade atual, troca pai e posição
e remove a localização anterior na mesma revisão. Módulos, lições,
microssequências e cards podem atravessar cursos sem compartilhar conteúdo
mutável.

Uma importação é uma cópia independente. Portanto, mover uma entidade do curso
importado retira-a somente dessa cópia no workspace, não da publicação que foi
lida. Para transferir uma parte entre dois cursos já publicados, o assistente
mantém um workspace baseado na revisão corrente de cada curso, publica primeiro
o destino com a parte copiada e só então publica a origem sem ela. Cada
publicação usa seu próprio hash de compare-and-swap e o chat explicita o estado
intermediário.

## Revisão no chat

Por padrão, o GPT usa `revisarMicroteoriasDoWorkspace`. A projeção devolve os
conteúdos teóricos consolidados, cobertura, checks, erros, resources, tópicos e
a contagem das práticas por microteoria. Isso permite à pessoa avaliar seleção,
recorte e explicação
conceitual sem receber no chat uma enumeração de cards teóricos ou de práticas
abundantes. Todos os cards continuam integralmente no documento e podem ser
lidos quando a pessoa pedir.

Os parâmetros da ferramenta são:

- `workspaceId` obrigatório, no formato UUID;
- `entityPath` obrigatório, com três ou quatro IDs, identificando uma lição ou
  microssequência. Para revisar um módulo ou curso, o assistente percorre as
  lições em chamadas sucessivas.

No sucesso, `structuredContent` contém `ok: true`, `requestId: null` e `data`.
O campo `data` combina o controle atual — `workspaceId`, `title`, `revision`,
`currentRevision`, `entityCount`, origens opcionais, timestamps,
`idempotent: false` e `brief` — com `view: "microtheories"` e esta árvore:

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
                ├── covers[], checks[], errors[], resources[], topics[] legíveis
                └── practiceCount: inteiro não negativo
```

O schema fecha todos esses objetos e recusa conteúdo card a card, campos
extras, caminhos com profundidade incorreta e estados fora de `planned`,
`generated`, `needs_review` ou `ready`. Falhas preservam o envelope comum
`{ ok: false, requestId, error: { code, message, details? } }`.

### Correção pontual de card

`listarCardsDaMicrossequencia` recebe `workspaceId`, o caminho estrutural de
quatro ids e paginação opcional. Consulta diretamente as rows correntes e
devolve `revision`, id, posição, `kind`, resources e título resumido, sem
recompor o documento nem devolver o conteúdo dos cards. `afterPosition` e
`afterId` formam um cursor inseparável. A ferramenta é exclusiva de workspace;
um curso publicado deve ser aberto ou importado antes da edição.

Depois de localizar o alvo, o assistente usa `lerWorkspaceDeAutoria` com
`view: "entity"` para ler somente o card e o substitui integralmente por
`salvarCardNoWorkspace`, preservando o id. A correção muda a microssequência
`ready` para `needs_review`. Movimento de card invalida origem e destino;
cópia invalida apenas o destino. Alterações semânticas de guias, tópicos,
relações e subárvores invalidam apenas os descendentes afetados; renomeação
nominal preserva o estado. `ready` declara aceitação explícita do conteúdo
corrente e pode acompanhar metadados quando essa for a ordem da pessoa;
`revision` continua sendo apenas o contador de concorrência.

As outras famílias de sucesso também são explícitas:

- listas fecham o formato de cada item e do cursor seguinte;
- a busca global do catálogo fecha consulta normalizada, coleção, hash, revisão,
  contagens e cursor por título e curso;
- leituras de curso fecham `courseId`, título, hash, completude e `view`;
- leituras de workspace fecham revisão lida, revisão vigente, quantidade de
  partes, origem, contexto curto, timestamps e visão;
- mutações devolvem controle de revisão e contagem de partes alteradas;
- a lista de cards fecha revisão, caminho, itens resumidos e cursor;
- eventos fecham revisão, operação, resumo e timestamp;
- publicação fecha curso, hash, destino, completude, submissão opcional e
  idempotência;
- submissões e decisões editoriais fecham identidade e estado;
- exclusão fecha workspace, confirmação e idempotência;
- retirada de Trilhas fecha seleção, curso, origem oficial ou privada,
  arquivamento e idempotência.

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
aceita apenas `complete` aprovado e exige permissão editorial. Se o pedido já
identifica inequivocamente publicação e alvo, o assistente relê o estado e
executa; só uma ambiguidade real exige esclarecimento adicional.
Atualizações também usam o hash da revisão vigente do curso como compare-and-
swap.

Uma revisão privada, inclusive `partial`, pode ser submetida para inspeção
editorial. A avaliação não a transforma automaticamente em catálogo: uma conta
com capacidade de revisão assume o envio e pode pedir ajustes ou rejeitar; uma
conta com capacidade de publicação só conclui o catálogo com um curso
`complete` e uma coleção válida.

O autor acompanha os próprios envios com a visão `mine`. A visão `queue` e o
conteúdo de envios de outras pessoas continuam exclusivos da conta editorial.
Cada item informa `sourceRevisionHash`, `authorNote`, `reviewerNote`,
`submittedAt`, `decidedAt` e o estado atual. Esses metadados pequenos continuam
consultáveis depois que uma submissão encerrada libera sua referência ao
artefato.

Existe no máximo uma submissão ativa por autor e curso. Repetir o mesmo hash
ativo devolve o envio existente. Uma revisão nova substitui atomicamente um
envio ainda `submitted`, marcando-o como `superseded`; se o envio já estiver
`in_review`, a operação falha com `catalog_review_in_progress`. O autor pode
então aguardar a decisão ou retirar explicitamente o envio. Depois de
`changes_requested`, ele publica novamente o mesmo curso privado e submete o
novo hash; a decisão anterior permanece visível sem duplicar o JSON.

`claim_catalog_review_v5` concede a revisão por 30 minutos. O mesmo revisor
renova a concessão e retoma idempotentemente o workspace já vinculado. Uma
concessão expirada pode ser transferida; antes disso, workspaces editoriais
abandonados ligados à submissão são fechados. Uma disputa ou uma fila já
alterada produz `catalog_review_unavailable`, e o cliente deve reler a fila.
`link_catalog_review_workspace_v5` também renova a concessão.

`retirarCursoDasTrilhas` opera sobre a seleção exata acabada de listar e exige
`selectionId`, `courseId` e `expectedContentHash`. Para curso oficial, remove
somente a seleção da conta, com a mesma semântica de progresso já usada pelo
aplicativo. Para publicação privada própria, também arquiva o curso, solta sua
revisão corrente e deixa o artefato sem outra referência elegível para coleta.
Submissões `submitted` ou `in_review` bloqueiam essa limpeza; submissões
encerradas não a bloqueiam. O `requestId` permite repetir com segurança uma
resposta perdida, e um hash desatualizado produz conflito explícito.
Uma publicação posterior ao arquivamento cria novos `courseId` e
`selectionId`; a identidade encerrada não é reativada.

Não existe uma integração administrativa separada. O mesmo Plugin ou Chatbot
recebe apenas as ferramentas autorizadas para a conta conectada.

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
- [OpenAI — MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [OpenAI — Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Model Context Protocol — server primitives](https://modelcontextprotocol.io/specification/2025-11-25/server)
- [Supabase Auth as an OAuth 2.1 server](https://supabase.com/docs/guides/auth/oauth-server)
- [Supabase — OAuth 2.1 Authorization Code com PKCE](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)
- [Supabase — autenticação de servidores MCP](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Lewis et al. — Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401)
- [Asai et al. — Self-RAG](https://arxiv.org/abs/2310.11511)

## Validação local

```powershell
npm test
npm run test:authoring:mcp
npm run test:authoring:mcp:local
npm run test:authoring:mcp:local:oauth
```

Sem um token OAuth local, o smoke verifica a descoberta e o desafio de
autenticação para uma requisição sem Bearer válido. Com
`ARALEARN_AUTHORING_MCP_OAUTH_TOKEN`, também cria, lê e remove um workspace.
O comando terminado em `:oauth`, usado pela CI, não admite esse atalho: cria
um usuário temporário, registra um cliente público pelo DCR, executa
Authorization Code com PKCE `S256` e consentimento, confere `iss`, `aud`,
`client_id` e `sub`, roda a mesma jornada de criação, leitura e exclusão e
remove cliente, concessão e usuário ao final. A chave administrativa local
serve apenas aos endpoints de preparação e limpeza do Auth; o bearer enviado
ao MCP é sempre o access token OAuth destinado à URL exata do recurso.
Na stack local, a descoberta usa o alias sob o próprio issuer
`/auth/v1/.well-known/oauth-authorization-server`, porque o Kong do CLI não
encaminha a forma equivalente iniciada na raiz que o gateway hospedado expõe.
A Edge Function valida `iss` contra essa identidade pública; a `SUPABASE_URL`
interna do container continua reservada às chamadas de Auth e PostgREST.
O emissor e o recurso MCP são derivados da mesma base canônica usada pelo hook
de access token; não há overrides independentes capazes de produzir uma
`audience` diferente da URL anunciada.
