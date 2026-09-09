# Guia do desenvolvedor

O AraLearn é uma aplicação web em módulos JavaScript, distribuída também num
WebView Android. Os serviços remotos usam Supabase. Estudo, Autoria, MCP e
Actions operam o mesmo curso; uma mudança pública precisa preservar essa
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

As migrations usam LF também nos checkouts Windows, conforme `.gitattributes`.
Isso preserva as comparações literais entre definições SQL e os trechos que
as migrations transformam, independentemente da configuração `core.autocrlf`.

Ao abrir um curso, o navegador busca a composição em páginas, valida o conjunto
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
| `src/domain/` | regras puras de curso, configuração, fontes e Analytics |
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

A composição usa curso, módulo, lição, microssequência e unidade de estudo. O
mapa curricular completo existe antes da produção. Parte é apenas o lote
operacional que referencia microssequências já previstas, não um nível dessa
árvore.

Uma `instructional_analysis_unit` representa uma ideia, relação, condição,
procedimento ou operação que vale acompanhar no repertório do percurso. A
aplicação distingue introdução, uso de conhecimento estabelecido e retomada. O
backend pode conferir identidade, ordem, referência e limites, mas não alegar
que duas formulações são equivalentes semanticamente. Fixtures pedagógicas
devem tornar esse julgamento inspecionável sem fingir um validador automático.

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

`COURSE_HUMAN_TASKS` é a lista canônica das 54 tarefas humanas. O MCP publica
cada tarefa com metadados próprios. Actions usa o binding tipado de
`courseActionBindings.js` para oferecê-las em 30 operações HTTP: seis grupos
recebem `tarefa` e `argumentos`, e 24 operações diretas recebem os argumentos na
raiz. O binding encaminha cada tarefa à mesma validação e ao mesmo caso de uso
do MCP. As referências de arquivo geridas pelo ChatGPT permanecem na raiz das
operações diretas de ingestão, conforme o
[contrato de Actions](autoria-actions.md#operações).

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

No PostgreSQL, conflitos deliberados de revisão ou estado usam `PT409`, que
PostgREST devolve como HTTP 409. Reserve `40001` para falhas de serialização do
motor: versões do transporte podem repetir esse SQLSTATE sem reler os argumentos
da aplicação. A API traduz ambos para `stale_course_state`. Os handlers que já
produzem um envelope `PGRST` preservam seu código JSON e capturam as duas classes;
o código dentro do JSON não é o SQLSTATE lançado pela função.

Uma composição nova permanece candidata no IndexedDB até a validação integral.
Nunca apague a última revisão válida para aceitar uma candidata incompleta.
Estado pessoal e Anotações possuem filas específicas. Planejamento, produção,
fontes, configuração, revisão e Analytics exigem o estado remoto corrente.

### Recuperação da exclusão de cursos

Ao confirmar a exclusão ou a saída de um curso, o repositório de Estudo salva
uma tentativa no compartimento IndexedDB da conta antes de enviar a ação. Ela
contém ator, curso, operação, identidade da requisição, data e título para
apresentação. O título não identifica o alvo. Uma resposta perdida, sessão
expirada ou limpeza interrompida conserva essa tentativa; a Home oferece sua
retomada mesmo quando o curso já não aparece na listagem.

`CourseStudyRepository.resumeCourseLifecycle(courseId)` retoma somente uma
tentativa guardada, na conta que a iniciou. A sessão pode ser renovada pelos
mecanismos normais; a identidade da operação permanece igual. O endpoint de
ciclo de vida reconcilia a exclusão e as intenções de remoção de arquivos,
preservando referências de cópias independentes. O cliente encerra a tentativa
apenas com contrato final correspondente e `fileCleanupPending:false`, seguido
da limpeza da réplica local. Ausência na listagem e erro de transporte não
confirmam conclusão. A interface não pede novamente a confirmação de uma
tentativa já autorizada.

`refreshPendingCourseLifecycles()` relê as tentativas persistidas e
`loadPendingCourseLifecycles()` fornece seu snapshot para apresentação e
instrumentação autorizada. Nenhum deles despacha exclusão. O teste focal
`tests/runtime/course-lifecycle-recovery.test.js` usa IndexedDB local sintético
e respostas simuladas; a prova de sessão, confirmação e limpeza no cliente
hospedado permanece uma verificação separada.

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

O ensaio de backup e restauração usa bancos PostgreSQL descartáveis e sem rede,
restaura um dump sintético anterior e percorre a cadeia de migrações até o
manifesto corrente. Confere estrutura, planejamento, desenho, configuração,
fontes, metadados de PDFs e Observações. Também instala a cadeia do zero em outro
banco e compara o schema executável, incluindo grants e políticas, e as definições
e os padrões dos catálogos de parâmetros e componentes com o banco atualizado. O acervo anterior conserva o estado de revisão não registrado e a
leitura permitida, sem receber aprovação ou Explicação geradas pelo upgrade.
Cada migração é registrada no histórico antes da próxima verificação. Quatro
restrições CHECK antigas têm a mesma expressão com agrupamento diferente de AND
após o dump/restore; nessas definições a comparação usa o deparser do próprio
PostgreSQL. Os predicados permanecem comparados, e uma mudança de limite reprova
o teste. O restante do SQL é comparado literalmente.
Essa prova não equivale à restauração de um backup hospedado atual. Os bytes do
Storage formam uma fronteira separada do backup lógico do banco.

Funções `security definer` fixam `search_path`, revogam execução ampla e validam
a pessoa no corpo da operação. Tabelas expostas exigem privilégio e política de
segurança em nível de linha.

## Testes e integração

Use um PR em rascunho durante o desenvolvimento. Consulte o impacto e execute a
preparação local antes de liberar a candidata para a integral:

```powershell
npm.cmd run validate:candidate -- --base origin/main --plan
npm.cmd run validate:candidate -- --base origin/main
```

O classificador distingue documentação, web, contratos, backend, banco,
Android e orquestração. Caminhos desconhecidos ampliam o conjunto. CSS puro
seleciona provas de interface sem iniciar banco; comportamento web e contratos
incluem integração real local. Android possui testes de contrato e build/lint
locais quando aplicáveis, além do gate obrigatório na integral final. A seleção é conservadora, não uma
análise completa de dependências: acrescente o teste focal do comportamento
alterado quando ele ainda não estiver representado.

A preparação executa verificadores, lint, runtime selecionado, E2E e integração
aplicáveis, nessa ordem. A primeira falha interrompe o percurso. O resumo em
`.validation/candidate.json` contém árvore, configuração, gates, resultado,
falhas e referências de logs. O diretório é ignorado pelo Git. Leia primeiro
esse resumo; abra somente o log necessário para diagnosticar uma falha.

Recibos verdes são reutilizados apenas com os mesmos arquivos, seleção,
dependências instaladas, Node, plataforma e configuração relevante. Mudanças
durante uma prova a invalidam. `--force` repete provas mesmo com recibos válidos.
A impressão de arquivos é conservadora. O E2E ordinário desconsidera texto
documental sem relação com a interface, Android, migrations, workflows e runners
exclusivos de integração. Seus hashes por arquivo permitem preservar a prova
quando esses consumidores não mudaram; comando, seleção e configuração também
precisam ser idênticos. Conserva contratos, build, runner de navegador, fixtures,
configuração e caminhos desconhecidos. Os demais recibos
consideram o conjunto de arquivos do repositório. Integração com banco mutável é sempre
executada quando aplicável; um hash de código não atesta o estado do banco.
Os recibos locais certificam preparação, nunca substituem o manifesto integral.

Depois de resolver falhas, revisar, fazer commit, enviar a branch e abrir o PR
em rascunho, libere a candidata pelo mesmo caminho:

```powershell
npm.cmd run candidate:ready -- --base origin/main
```

Esse comando só marca o PR como pronto após os gates verdes, com árvore limpa,
HEAD remoto idêntico e destino `main`. A seleção cobre o delta completo contra
a base real do PR; `--base` não pode recortar somente o último commit.
`ready_for_review` dispara a integral.
Para corrigir uma candidata que falhou, retorne o PR a rascunho antes de enviar
novas mudanças. Não inicie outra integral enquanto houver gate local pendente.
O comando não faz commit, push, merge ou publicação.

Durante um ajuste, também é possível escolher explicitamente os arquivos que
exercitam a mudança. O runner comum aceita arquivos de `tests/kernel` e
`tests/runtime`, recusa seleção vazia ou inválida e preserva o código de saída:

```powershell
npm.cmd run test:focal -- tests/runtime/course-design-parameters.test.js
npm.cmd run test:focal -- tests/runtime/ci-path-classification.test.js tests/runtime/test-runner.test.js
```

O modo focal não executa as auditorias e integrações completas de `npm test` nem
produz aprovação da candidata. Sem argumentos, `scripts/runTests.mjs` continua
executando todos os arquivos das duas suítes; `npm test` conserva também seus
verificadores anteriores. PGlite verifica transformações SQL e contratos próximos
de PostgreSQL; Auth, RLS, Storage e concorrência real precisam do Supabase local.
As jornadas opt-in de acesso em `course-access-local.spec.js` criam contas e
cursos próprios na stack local. Quando exercitam leitores ou visitantes, suas
fixtures incluem Explicação e uma aprovação explicitamente simulada pelo RPC
protegido; essa preparação não constitui revisão humana de um curso real.
As revisões usadas após a aprovação são relidas, sem fixar o número anterior à
mudança. Falhas HTTP inesperadas continuam reprovando a jornada.
O inventário local de fixtures conserva cada tentativa e seu recibo de limpeza.
Se o sistema de arquivos bloquear temporariamente a substituição do recibo, o
helper reconcilia os bytes e retenta apenas a mesma renomeação, por prazo limitado.
Uma falha persistente conserva o arquivo anterior e o temporário para recuperação;
a operação remota não é repetida para reparar a gravação local do inventário.
Fixtures de IndexedDB devem aguardar `transaction.oncomplete` antes de fechar
a conexão de inspeção e abrir outra versão; o sucesso de uma requisição de
leitura ainda não confirma o encerramento da transação.
Para o navegador, use:

```powershell
npm.cmd run test:e2e
npm.cmd run test:e2e -- tests/e2e/study-explanation.spec.js --retries=0
```

O runner encaminha a seleção ao Playwright e restaura a configuração temporária
de staging. E2E obrigatório com zero testes, skip ou falha não aprova a
preparação; `--forbid-only` impede que um `test.only` reduza a prova da candidata.
Testes contra adaptadores sintéticos continuam separados das
jornadas com Auth, HTTP, PostgreSQL e Storage reais locais.

O gate de banco executa Deno, pgTAP, inventário de paridade, lint e concorrência
antes das jornadas. Local e CI registram avisos do lint e bloqueiam erros
explicitamente. Uma migration candidata precisa estar aplicada na stack;
alterar silenciosamente uma migration já aplicada é recusado. Fresh, upgrade e
restore continuam obrigatórios conforme o impacto da mudança e o corte.

`npm run test:integration:local` reaproveita uma stack local já preparada e
executa Autoria corrente, dois lotes por canal HTTP, as dez jornadas reais no
Chromium e cópia PDF/WAV. O runner não inicia, reseta nem encerra o banco. Ele
serve funções próprias, valida readiness e encerra somente o processo que
iniciou; a CI pode compartilhar seu processo já supervisionado. Um runtime
persistente local pode ser usado com `--functions-existing` apenas após
conferir mount somente leitura, origem, readiness e ausência de alteração de
funções/configuração/migrations contra a base. Isso conserva o processo existente
quando seu código não foi alterado. Para o orquestrador, a opção correspondente é
`ARALEARN_LOCAL_FUNCTIONS_EXISTING=1`. Falha de
limpeza bloqueia a prova. Contas e arquivos são sintéticos; esses testes não
aprovam cursos reais nem substituem ChatGPT, MCP ou Actions hospedados.

Quando uma jornada falha, o resumo da integração informa o teste, a localização
e a primeira tentativa malsucedida, com até duas mensagens de erro. O runner
remove credenciais antes de limitar o texto e mantém o relatório completo local.
Esse diagnóstico conserva o resultado do gate e distingue falha funcional de
limpeza já confirmada; etapas dependentes permanecem sem execução.

O overlay de Explicação tem um percurso focal em
`tests/e2e/study-explanation.spec.js`. Com a candidata web preparada para o
runner, execute `npx playwright test tests/e2e/study-explanation.spec.js`.
O teste usa UI e renderizadores reais com repositório sintético: teoria e
prática compartilham um apoio longo, tabela, código, topologia de rede, ferramentas
condicionais e referências com PDF simulado. O download é capturado pelo harness;
não comprova autorização remota nem leitura de um arquivo hospedado.

Para inspeção local, `tests/gallery/study-explanation.html` monta a mesma fixture
no servidor de desenvolvimento. Os parâmetros `unit=practice`, `theme=dark` e
`state=missing|draft|offline|error` selecionam casos sintéticos. Não há conta ou
conteúdo real nessa página. Os testes fornecem somente os arquivos da fixture
ao navegador quando executados contra `.pages`; não é necessário publicar a
galeria no produto. Capturas e traces ficam na saída ignorada do Playwright.

O percurso verifica larguras de 360, 390, 430 e 1280 pixels, altura reduzida,
texto ampliado, resposta pendente, fontes na mesma folha e retorno de foco e
rolagem. O diagrama expandido usa o diálogo nativo: uma interrupção precisa
conservar modalidade, zoom e deslocamento, e Escape deve retornar primeiro ao
apoio e depois à unidade. A inspeção visual complementa essas assertivas de
comportamento; nenhuma delas equivale a um teste de aprendizagem com pessoas.

As jornadas em `course-tools-integrated.spec.js` e `study-final-ux.spec.js`
também seguem esse contrato: seis ações fixas de 44 × 44 px, incluindo
Explicação, e uma entrada compacta quando há várias ferramentas. O primeiro
teste abre o painel, confere calculadora, áudio e gramática e exercita cálculo,
retorno de foco e rolagem nas quatro larguras e nos dois temas. O segundo
confere a identidade das seis ações e suas dimensões. A contagem do painel
de ferramentas não deve ser confundida com a quantidade de botões da fileira;
agrupar não reduz os alvos nem retira uma ferramenta.
As guardas de rolagem examinam elementos efetivamente renderizados: o texto
de debate em um `details` fechado não é um scroller de leitura; as fixtures
de navegação devem usar rotas canônicas com a revisão do curso.

Quando uma integral local for necessária, os comandos continuam disponíveis:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run validate:course-runtime
npm.cmd run test:e2e
npm.cmd run validate:example
```

Uma entrega web passa ainda por `validateDeployment.ps1 -Scope Web`; Android
usa `-Scope Full`. Mudança de banco exige fresh, upgrade, restore e verificação
hospedada antes da publicação. A integral protegida da candidata final pode
fornecer a prova autoritativa; não repita o mesmo conjunto local e remotamente
sem uma alteração que invalide a evidência. `test:preflight` contém os
verificadores e auditorias; `test:runtime` contém o conjunto Node. `npm test`
continua executando ambos.

Na execução autônoma, delegue por arquivos e fronteiras independentes, com uma
única coordenação. O agente responsável entrega resultado, arquivos, prova e
limites; sinaliza antes somente bloqueio ou achado material. Use subagentes
nativos ou CLI para revisão de código. Reserve o navegador para provas em que
a interface ou o cliente real faça parte do requisito. Mantenha um checkpoint
corrente, sem reproduzir logs ou reabrir fases concluídas após uma retomada.
Para aguardar CI, use `gh run watch <id> --exit-status` com saída em arquivo e
consulte o resultado ao terminar. Em falha, leia `gh run view <id> --log-failed`
por job, em vez de baixar toda a execução repetidamente. Isso reduz contexto
do agente; caches e seleção de gates reduzem computação, uma economia distinta.

## Documentação

A revisão humana em Conteúdo é coordenada por `CourseMicrosequenceReview`.
`loadMicrosequenceReviewSnapshot` cerca `exportCourseAuthoring` remoto com duas
leituras de `getMicrosequenceReview`; exige a mesma impressão protegida e uma
exportação/proveniência na revisão solicitada. Nunca associa um hash recém-lido
a um corpo vindo da cópia de Estudo. O diálogo reaproveita o renderer de pacotes,
o formatador bibliográfico, os detalhes de análise autoral e o painel de fontes.
Respostas são exibidas para inspeção e ficam inertes. Hidratação com falha bloqueia
uma nova aprovação. Atualizações do diálogo restauram controle focado e rolagem.

`CourseMicrosequenceReviewSession` persiste a aprovação pendente em
`course.v1.pending-content-review:<curso>:<microssequência>` antes do RPC direto
autenticado. O recibo pode corresponder à aprovação original já superada; a
releitura posterior determina o estado atual e sua falha não vira sucesso atual.
A edição usa `saveMicrosequenceExplanation` e o registro canônico de composição
pendente do Controller, preservando conteúdo e identidade para reconciliação.
Os registros de pendência são eliminados junto aos caches privados na perda de
acesso. Esses identificadores não são parâmetros do pedido humano ou de tarefas
MCP/Actions.

Os focais `tests/runtime/course-microsequence-review.test.js` e
`tests/e2e/course-microsequence-review.spec.js` verificam bases/revisões incompatíveis,
aprovação explícita, replay, edição/cancelamento, fontes, foco e larguras
360/390/430/1280. A galeria `tests/gallery/course-microsequence-review.html` usa
somente conteúdo sintético e Controller simulado; não é publicada pelo build e
não comprova autenticação ou PDF remoto. Transporte, SQL e cliente hospedado são
camadas de prova separadas.

Documentação corrente explica o produto instalado. Reescreva a descrição
anterior em vez de manter um diário ou contrato antigo como fallback.

```powershell
npm.cmd run audit:docs
npm.cmd run audit:terminology
npm.cmd run docs:references:check
```

Antes de integrar, confira o diretório de trabalho e o diff, preserve mudanças
alheias e consulte o roteiro de [Implantação](implantacao.md).
