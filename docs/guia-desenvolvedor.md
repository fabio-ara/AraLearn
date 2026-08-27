# Guia do desenvolvedor

O AraLearn é uma aplicação web em módulos JavaScript, empacotada também em um
WebView Android. Os serviços remotos usam Supabase. Estudo e Autoria
compartilham o mesmo Curso, por isso uma mudança relevante costuma atravessar
domínio, persistência, operação remota, interface e teste.

Comece pela [Arquitetura](arquitetura.md), siga para
[Persistência relacional e sincronização](persistencia-relacional.md) e consulte
[Supabase](supabase.md) antes de alterar esquema, autenticação, Storage ou Edge
Functions.

## Preparação

Instale [Node.js 22](https://nodejs.org/en/download) e restaure as dependências
fixadas:

```powershell
npm.cmd ci
npm.cmd run dev
```

O servidor abre o aplicativo em `http://127.0.0.1:4182`. Para conectá-lo a um
projeto, defina no processo:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

Somente a URL e a chave pública chegam ao navegador. Para trabalhar com o banco
local, [Docker](https://docs.docker.com/desktop/) e
[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
são necessários:

```powershell
npx.cmd --yes supabase@2.115.0 start
npx.cmd --yes supabase@2.115.0 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

## Percurso de uma leitura

Ao abrir um Curso, `CourseController` pede uma lista leve ao
`CourseStudyRepository`, busca a composição em páginas e envia a candidata aos
validadores do domínio. `CourseLocalStore` só a promove depois da recomposição
integral. `CourseStudyApplication` e `CourseStudyScreen` apresentam a revisão
promovida.

Estado pessoal e Anotações percorrem repositórios próprios. Eles podem guardar
comandos locais e retomar a sincronização. Uma alteração autoral passa por
`CourseApiClient`, pela Edge Function `aralearn-course-api`, pelo roteador comum
e por uma função SQL com revisão esperada.

Uma ferramenta MCP entra por `aralearn-authoring-mcp`; uma operação de Actions,
por `aralearn-authoring-action`. As duas convergem no mesmo `courseRouter`,
`courseToolExecutor` e `courseSupabaseAdapter`, mas partem do protocolo público
v1 e usam projeções de transporte distintas. Corrigir apenas um dos
transportes costuma deixar o contrato divergente.

## Mapa do repositório

| Caminho | Responsabilidade corrente |
|---|---|
| `public/` | estrutura web, estilos, manifesto e trabalhador de serviço (`service worker`) |
| módulos `course*.js` em `src/domain/` | regras de Curso, plano, desenho, fontes, auditoria, variantes e Pesquisa |
| `src/persistence/Course*.js` | réplica local, estado pessoal e Anotações |
| `src/study/` | repositório, navegação e tela de Estudo |
| `src/supabase/` | cliente da API e coordenação de Curso no navegador |
| `src/ui/` | superfície e painéis de Autoria |
| `src/resources/` | catálogo, contratos e pacotes didáticos |
| `src/render/` | renderização dos pacotes |
| `supabase/migrations/` | esquema, funções, privilégios e políticas versionados |
| `supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js` | autoridade do protocolo público v1 e de seu catálogo |
| `supabase/functions/_shared/aralearn-authoring/courseMcpTools.js` | adaptação explícita do protocolo para rotas, comandos internos e MCP |
| `scripts/projectChatGptActionSchemas.mjs` | projeção do protocolo para esquemas aceitos pelo importador de Actions |
| `supabase/functions/aralearn-course-api/` | entrada HTTP da Autoria no navegador |
| `supabase/functions/aralearn-authoring-mcp/` | servidor MCP e recurso visual |
| `supabase/functions/aralearn-authoring-action/` | Actions/OpenAPI e OAuth do GPT personalizado |
| `tests/runtime/` | domínio e integração sem navegador completo |
| `tests/e2e/` | fluxos reais de Estudo e Autoria no Chromium |
| `scripts/` | geração, auditoria, validação e implantação |

Arquivos em `supabase/functions/_shared/aralearn/runtime/` são cópias geradas do
código comum. Atualize a fonte em `src/` e execute:

```powershell
npm.cmd run resources:sync-edge
```

O teste global reprova uma cópia remota divergente.

## Hierarquia e vocabulário

A árvore começa em Curso, Módulo e Lição. Tópico e Microssequência são irmãos
sob a Lição; a Unidade de estudo pertence à Microssequência.

Use os nomes do domínio na interface, no SQL e nos testes. Nomes técnicos de
tipo persistido são `module`, `lesson`, `topic`, `microsequence` e
`study_unit`. Não aceite um pai diferente para contornar um erro de montagem;
corrija a origem e mantenha as restrições relacionais.

Um pacote didático é identificado por `package@version`. O catálogo corrente
possui 32 pacotes, sendo 29 de conteúdo e três de resposta. Uma instância escolhe um
único pacote e precisa passar pelo respectivo esquema antes de ser persistida
ou renderizada.

## Como alterar uma capacidade de Curso

Localize primeiro a autoridade do dado e percorra o caminho completo:

1. defina ou ajuste a regra pura em `src/domain/`;
2. quando a capacidade for pública, altere intencionalmente o protocolo e seu
   adaptador, sem derivá-lo dos tipos internos;
3. altere a migração quando o contrato relacional mudar;
4. exponha a operação pelo roteador comum da API, do MCP e de Actions;
5. adapte o controlador e a projeção da interface;
6. acrescente o menor teste que reproduz o risco em cada fronteira afetada;
7. sincronize a cópia usada pela Edge Function;
8. valide o fluxo no navegador e no Supabase local quando houver persistência.

Uma nova área visual não justifica uma nova ferramenta MCP, Action, tabela ou serviço.
Primeiro verifique se a capacidade cabe como visão ou operação das autoridades
existentes.

## Protocolo público e projeções

`authoringProtocolV1.js` é a autoridade independente para o idioma consumido
por MCP e Actions. O domínio pode possuir estruturas mais ricas ou nomes
internos diferentes; `courseMcpTools.js` adapta os argumentos públicos para as
rotas e os normalizadores correspondentes. Não duplique listas de
discriminadores no transporte e não amplie o backend com aliases para acomodar
um esquema importado antigo.

O catálogo possui três identificadores complementares:

- `AUTHORING_PROTOCOL_ID` identifica o major público v1;
- `AUTHORING_PROTOCOL_SCHEMA_VERSION` ordena snapshots por versão semântica;
- `AUTHORING_PROTOCOL_V1_SCHEMA_HASH` é o SHA-256 do ID, da versão e do catálogo
  serializados de forma canônica.

O snapshot aprovado é imutável. Dentro do mesmo major, o gate admite ampliações
compatíveis e bloqueia remoção de ferramenta, propriedade ou discriminador,
estreitamento de tipo, enum, padrão ou limite, novo campo obrigatório e nova
proibição. Uma ruptura exige novo major; a linha v1 permanece disponível para
os consumidores existentes durante a migração.

O MCP recebe o catálogo canônico e acrescenta apenas segurança e `_meta` de
transporte. Actions usa `projectChatGptActionSchemas.mjs`. O projetor percorre
todas as condicionais `allOf`: condições necessárias para construir a chamada
viram variantes explícitas, e a geração falha se alguma ficar sem compilação.
Ele também converte cada `const` em `enum` de um único valor, pois essa é a forma
que o importador corrente do ChatGPT preserva como discriminador. Não restaure
`allOf` indiscriminadamente nem volte a removê-lo por uma passagem genérica.

Ao alterar o catálogo, gere um novo snapshot em vez de sobrescrever o anterior,
regenere o OpenAPI e execute:

```powershell
node --test tests/runtime/authoring-protocol-compatibility.test.js
npm.cmd run test:authoring:mcp
npm.cmd run actions:openapi:check
npm.cmd run test:authoring:actions
```

MCP e Action anunciam o mesmo ID, versão e hash no cabeçalho
`X-AraLearn-Authoring-Contract`; o MCP também usa
`_meta.authoringContract`. O smoke hospedado compara o esquema inteiro de
`tools/list` com a autoridade local, removendo somente metadados de transporte,
e o preflight da Action bloqueia uma implantação com fingerprint divergente.

## Concorrência e repetição

Escritas autorais enviam `expectedRevision` e um identificador idempotente. O
cliente deve distinguir:

- conflito de revisão, que exige reler o Curso;
- repetição do mesmo pedido, que deve devolver o recibo anterior;
- ausência de mudança, que mantém a revisão;
- falha de validação, que precisa chegar à interface com campo e causa úteis.

Não crie repetição automática cega diante de conflito. O estado remoto pode ter
mudado materialmente. Uma nova chamada automática só serve para falha
transitória do mesmo pedido idempotente.

## IndexedDB e trabalho sem conexão

`CourseLocalStore` é compartilhado por repositórios, mas cada família possui
chaves e limites próprios. Uma composição nova permanece candidata até passar
pela validação integral. Nunca apague a última revisão válida como forma de
tratar uma candidata inválida.

Estado pessoal e Anotações admitem filas locais específicas. Auditoria,
correções, variantes e Pesquisa exigem conexão. Antes de acrescentar
persistência local, demonstre qual ação precisa sobreviver sem rede e como será
conciliada com a revisão corrente.

Teste retomada após reinício, duas abas, limite da fila, resposta fora de ordem
e troca de conta quando a alteração tocar a réplica.

## Interface

Componentes de Curso recebem dados já validados e emitem intenções ao
controlador. O painel não deve montar SQL, conhecer credencial administrativa
ou reimplementar a regra do domínio.

Ao alterar Estudo ou Autoria, examine o aplicativo em 360, 390 e 430 px e em
computador com área de 1280 × 720 ou maior. Confirme rolagem, área segura, texto
extenso, foco, teclado, clique externo, tecla Esc e sobreposições. Gráficos de
Pesquisa precisam conservar a tabela equivalente e a definição da medida.

Use classes e variáveis existentes em `public/styles.css`. Uma correção repetida
em vários seletores costuma indicar problema de contêiner, fluxo ou tamanho
intrínseco. Resolva a causa antes de acrescentar exceções de largura.

## Fontes e arquivos

Metadados de fonte passam por `courseSources.js`; PDFs passam pela API em duas
fases. O navegador calcula SHA-256, mas o servidor continua responsável por
propriedade, revisão, cota e vínculo. Envio ao Storage sem confirmação
relacional não torna o arquivo parte do Curso.

Não transforme URL assinada em identificador persistente. Guarde a identidade
do anexo e solicite uma URL nova quando a pessoa autorizada quiser abrir o PDF.

## Migrações

Crie uma migração apenas para mudança relacional ou de contrato remoto. Ela
deve ser determinística, falhar diante de pré-condição incompatível e instalar
restrições, índices, privilégios e segurança por linha junto com a capacidade.

Recrie o banco do zero após a alteração:

```powershell
npx.cmd --yes supabase@2.115.0 db reset
npx.cmd --yes supabase@2.115.0 db lint --local --level warning
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

Uma função com `security definer` fixa `search_path`, revoga execução ampla e
comprova a pessoa no corpo da operação. Tabelas expostas exigem tanto privilégio
quanto política de segurança por linha.

Avance `supabase/runtime-manifest.json` somente depois que o esquema completo e
os testes correspondentes existirem. O manifesto corrente aponta para
`20260826143846` e precisa coincidir com a revisão exposta pelo backend
hospedado.

## Testes focais

Use `node --test` para executar o arquivo que cobre a alteração. Exemplos:

```powershell
node --test .\tests\runtime\course-local-store.test.js
node --test .\tests\runtime\course-sources.test.js `
  .\tests\runtime\course-source-attachments-pglite.test.js
node --test .\tests\runtime\course-variants.test.js `
  .\tests\runtime\course-variants-pglite.test.js
node --test .\tests\runtime\course-authoring-analytics-domain.test.js `
  .\tests\runtime\course-authoring-analytics-pglite.test.js
node --test .\tests\runtime\course-router.test.js `
  .\tests\runtime\course-tool-executor.test.js
```

PGlite verifica SQL e contratos próximos do PostgreSQL sem substituir os testes
que dependem de privilégios, políticas, Auth, Storage ou concorrência real.
Esses riscos exigem o ambiente local completo.

Para o navegador:

```powershell
npm.cmd run test:e2e
```

Os cenários correntes cobrem o corte de Estudo, o percurso de Autoria e o painel
de auditoria. Uma regressão em fonte, variante ou Pesquisa também precisa de
teste do painel correspondente e inspeção manual do fluxo real.

## Catálogo didático

Ao alterar pacote, vocabulário ou política, execute:

```powershell
npm.cmd run resources:catalog-course:check
npm.cmd run validate:resource-corpus
npm.cmd run resources:test-course:e2e
```

O primeiro confirma o catálogo derivado, o segundo percorre o corpus e o
terceiro renderiza o Curso de teste no navegador. Verifique exemplo simples,
conteúdo extenso, temas claro e escuro, equivalente acessível e o maior caso
aceito pelo contrato.

## Documentação

Documentação corrente explica o produto e o contrato instalado. Ao mudar
comportamento, reescreva a descrição anterior em vez de acumular um diário de
implementação. Nomes de arquivos, comandos e versões precisam existir na mesma
revisão.

Execute:

```powershell
npm.cmd run audit:docs
npm.cmd run audit:terminology
```

O primeiro verifica estrutura, links, índices, citações e independência
editorial. O segundo procura vocabulário abolido no código em execução e na
documentação.

## Validação para integração

Depois dos testes focais, execute o conjunto proporcional ao destino:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run validate:course-runtime
npm.cmd run test:e2e
npm.cmd run validate:example
```

Uma entrega web usa ainda:

```powershell
pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Web -RequireRuntimeConfig
```

Uma entrega com Android usa `-Scope Full`. Mudança de banco acrescenta
`validateLocalSupabase.ps1` e verificação hospedada antes da publicação.

Commits devem agrupar mudanças coerentes e seus testes. Antes de enviar, confira
o destino, o estado do diretório de trabalho e a diferença final. A publicação
segue o roteiro de [Implantação](implantacao.md).
