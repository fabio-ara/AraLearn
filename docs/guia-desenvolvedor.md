# Guia do desenvolvedor

O AraLearn é uma aplicação web em módulos JavaScript, distribuída também num
WebView Android. Os serviços remotos usam Supabase. Estudo, Autoria, MCP e
Actions operam o mesmo Curso; uma mudança pública precisa preservar essa
convergência sem criar outro domínio por transporte.

Comece pela [Arquitetura](arquitetura.md), siga para [Persistência relacional e
sincronização](persistencia-relacional.md) e consulte [Supabase](supabase.md)
antes de alterar banco, autenticação, Storage ou Edge Functions.

## Preparação

Instale [Node.js 22](https://nodejs.org/en/download) e restaure as dependências:

```powershell
npm.cmd ci
npm.cmd run dev
```

O servidor local abre `http://127.0.0.1:4182`. A aplicação usa somente a URL e a
chave publicável do Supabase no navegador:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

Para o banco local, instale [Docker](https://docs.docker.com/desktop/) e o
[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```powershell
npx.cmd --yes supabase@2.115.0 start
npx.cmd --yes supabase@2.115.0 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

## Percurso de dados

Ao abrir um Curso, o navegador busca a composição em páginas, valida o conjunto
e só então promove a nova revisão local. Estado pessoal e Anotações possuem
repositórios próprios e podem retomar envios depois de uma falha.

Uma alteração visual percorre `CourseApiClient`, a Edge Function
`aralearn-course-api`, `courseRouter`, `courseSupabaseAdapter` e a função SQL
focal. O MCP entra por `aralearn-authoring-mcp`; Actions entra por
`aralearn-authoring-action`. Os dois projetam o catálogo humano de
`courseHumanTasks.js` e executam os mesmos casos de uso confiáveis.

IDs, revisões esperadas, repetição segura e caminhos de Storage são resolvidos
no servidor. Eles não pertencem ao schema apresentado ao modelo.

## Mapa do repositório

| Caminho | Responsabilidade |
| --- | --- |
| `public/` | documento web, estilos, manifesto e service worker |
| `src/domain/` | regras puras de Curso, configuração, Fontes e Analytics |
| `src/persistence/` | réplica local, estado pessoal e Anotações |
| `src/study/` | navegação, repositório e tela de Estudo |
| `src/supabase/` | cliente e coordenação remota no navegador |
| `src/ui/` | superfície estreita de Autoria e leitores focais |
| `src/resources/` e `src/render/` | catálogo, contratos e renderização didática |
| `supabase/migrations/` | esquema, funções, privilégios e RLS versionados |
| `supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js` | catálogo humano e execução compartilhada por MCP e Actions |
| `supabase/functions/_shared/aralearn-authoring/courseKnowledge.js` | orientação focal por fase autoral |
| `scripts/projectHumanAuthoringActions.mjs` | projeção do catálogo para Actions |
| `scripts/buildChatGptActionOpenApi.mjs` | geração do OpenAPI importável |
| `tests/runtime/` | domínio, contratos e integração sem navegador completo |
| `tests/e2e/` | jornadas reais no Chromium |

Arquivos em `supabase/functions/_shared/aralearn/runtime/` espelham módulos
comuns. Altere a fonte em `src/` e sincronize:

```powershell
npm.cmd run resources:sync-edge
```

## Hierarquia e análise instrucional

A composição usa Curso, Módulo, Lição, Microssequência e StudyUnit. Parte é o
lote operacional do planejamento, não um nível dessa árvore.

Uma `instructional_analysis_unit` representa novidade semanticamente
independente para o público e a tarefa. O backend pode conferir identidade,
ordem, referência e limites, mas não alegar que duas formulações são equivalentes
semanticamente. Fixtures pedagógicas devem tornar esse julgamento inspecionável
sem fingir um validador automático.

Uma instância didática escolhe um pacote por `package@version` e passa pelo
schema desse pacote antes de ser persistida ou renderizada.

## Como alterar uma capacidade

Localize primeiro a autoridade do estado e percorra somente as fronteiras
afetadas:

1. ajuste a regra pura quando houver uma propriedade de domínio;
2. altere a migração quando a persistência ou a autorização mudarem;
3. exponha o caso de uso pelo roteador comum;
4. se a tarefa for conversacional, ajuste o catálogo humano canônico;
5. regenere a projeção Actions e o OpenAPI;
6. adapte controlador e interface quando houver efeito visual;
7. acrescente o menor teste que reproduz o risco em cada fronteira;
8. valide com Supabase local ou navegador quando a propriedade depender deles.

Uma nova subvisão não justifica nova ferramenta, tabela ou serviço. Prefira
consulta focal e estado corrente quando a capacidade já cabe nas autoridades
existentes.

## MCP e Actions

`COURSE_HUMAN_TASKS` é a lista canônica das dezesseis tarefas humanas. O MCP
publica cada tarefa com metadados próprios; Actions cria um caminho HTTP para
cada uma. Os schemas podem receber adaptações de transporte, como a referência
de arquivo gerida pelo ChatGPT, mas os casos de uso e efeitos permanecem iguais.

Ao alterar o catálogo:

```powershell
npm.cmd run test:authoring:contract
npm.cmd run test:authoring:mcp
npm.cmd run actions:openapi:check
npm.cmd run test:authoring:actions
```

As respostas públicas têm três elementos: resultado, deep link e próxima
decisão. Contexto estruturado pode acompanhar a leitura sem virar texto longo de
coordenação.

## Concorrência e trabalho local

O navegador e a camada confiável distinguem conflito de revisão, repetição da
mesma intenção, ausência de mudança e erro de validação. Só uma falha transitória
da mesma operação admite repetição automática; conflito material exige releitura.

Uma composição nova permanece candidata no IndexedDB até a validação integral.
Nunca apague a última revisão válida para aceitar uma candidata incompleta.
Estado pessoal e Anotações possuem filas específicas. Planejamento, produção,
Fontes, configuração, revisão e Analytics exigem o estado remoto corrente.

## Interface

Estudo é a referência visual da Autoria: coluna estreita, uma rolagem principal
e uma StudyUnit focal. Teste 360, 390 e 430 px e uma largura de computador,
incluindo temas, teclado, foco, `Esc`, clique externo, voltar/avançar e deep
links. Ações icon-only precisam de nome acessível e estado compreensível.

Analytics possui somente Desenho e Autoria, com filtro de escopo. O JSON de
**Exportar Analytics** deve conter o mesmo snapshot normalizado exibido na tela.

## Fontes, PDFs e Storage

Fonte, Âncora e atribuição guardam o estado corrente. O serviço calcula e valida
a identidade binária do PDF, controla cota e usa a API do Storage para gravar ou
remover objetos. O schema `storage` é lido para inventário e autorização, nunca
alterado diretamente pela aplicação ou por migração de negócio.

O download é preparado no servidor e devolve uma URL assinada de curta duração.
Essa URL não é identidade persistente do anexo. Remoção cria um tombstone
relacional e uma intenção de limpeza até o objeto ser eliminado pela API.

Valide o ciclo real com:

```powershell
npm.cmd run test:storage:lifecycle:local
```

## Migrações, fresh e upgrade

Uma migração deve falhar diante de pré-condição incompatível e instalar junto a
estrutura, índices, privilégios e políticas. Verifique tanto banco novo quanto
upgrade de estado útil.

```powershell
npx.cmd --yes supabase@2.115.0 db reset
npx.cmd --yes supabase@2.115.0 db lint --local --level warning
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
npm.cmd run test:backup-restore:local
```

O ensaio de backup e restauração usa bancos PostgreSQL descartáveis, restaura um
dump anterior, aplica a migração corrente e confere estrutura, planejamento,
desenho, configuração, Fontes, PDFs e Observações. Os bytes do Storage formam
uma fronteira separada do backup lógico do banco.

Funções `security definer` fixam `search_path`, revogam execução ampla e validam
a pessoa no corpo da operação. Tabelas expostas exigem privilégio e política de
segurança em nível de linha.

## Testes e integração

Comece pelo arquivo focal com `node --test`. PGlite verifica transformações SQL
e contratos próximos de PostgreSQL; Auth, RLS, Storage e concorrência real
precisam do Supabase local. Para o navegador, use:

```powershell
npm.cmd run test:e2e
```

Depois dos testes focais, execute o conjunto proporcional ao destino:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run validate:course-runtime
npm.cmd run test:e2e
npm.cmd run validate:example
```

Uma entrega web passa ainda por `validateDeployment.ps1 -Scope Web`; Android
usa `-Scope Full`. Mudança de banco exige fresh, upgrade, restore e verificação
hospedada antes da publicação.

## Documentação

Documentação corrente explica o produto instalado. Reescreva a descrição
anterior em vez de manter um diário ou contrato antigo como fallback.

```powershell
npm.cmd run audit:docs
npm.cmd run audit:terminology
npm.cmd run docs:references:check
```

Antes de integrar, confira o diretório de trabalho e o diff, preserve mudanças
alheias e consulte o roteiro de [Implantação](implantacao.md).
