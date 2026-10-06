# Guia do desenvolvedor

O AraLearn possui uma única aplicação web, organizada em módulos JavaScript. No
Android, uma WebView — o componente que executa páginas web dentro de um aplicativo —
apresenta esse mesmo código. O [Supabase](supabase.md) fornece os serviços de conta,
banco de dados PostgreSQL, armazenamento de arquivos (Storage) e execução de funções
no servidor (Edge Functions).

Aplicações externas podem consultar e alterar os mesmos cursos que a interface do
AraLearn. O [MCP](autoria-mcp.md) permite que descubram e chamem ferramentas; o canal
[Actions/OpenAPI](autoria-actions.md) descreve pedidos e respostas para que o cliente
execute essas tarefas pela rede. Uma mudança precisa preservar o significado do
conteúdo, as permissões e as decisões humanas em cada caminho.

A [arquitetura](arquitetura.md) relaciona essas responsabilidades. A
[persistência e sincronização](persistencia-relacional.md) explica como o trabalho é
guardado e atualizado, e a [referência do Supabase](supabase.md) detalha os serviços e
seus controles de acesso. O processo de contribuição está em
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Preparação

Os comandos abaixo são executados na raiz de uma cópia local do repositório e usam
[PowerShell](https://learn.microsoft.com/powershell/scripting/install/install-powershell)
no Windows. `npm.cmd` e `npx.cmd` correspondem a `npm` e `npx` em outros sistemas.
Instale [Node.js 22](https://nodejs.org/en/download), que executa as
ferramentas JavaScript do projeto. O npm instala os pacotes de que o projeto depende;
`npm ci` usa as versões registradas em `package-lock.json`:

```powershell
npm.cmd ci
```

Antes de abrir a aplicação, escolha qual serviço ela consultará. O navegador recebe
a URL e a chave pública por estas variáveis:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

`npm.cmd run dev` inicia o servidor local; abra `http://127.0.0.1:4182` no navegador.
Se o par de variáveis estiver incompleto, `scripts/servePublic.js` tenta obter a configuração publicada do AraLearn
e preencher os valores ausentes. Nesse caso, a página é local, mas os pedidos podem
alcançar o serviço hospedado. Para desenvolver contra outro projeto, informe sempre
as duas variáveis correspondentes.

Para testar banco, autenticação e arquivos sem usar o serviço hospedado, o
[Docker](https://docs.docker.com/desktop/) executa os serviços em ambientes isolados,
chamados contêineres. A [ferramenta de linha de comando do Supabase
(CLI)](https://supabase.com/docs/guides/local-development/cli/getting-started)
prepara esse conjunto. O comando `db reset` recria o banco local e seus dados de teste;
use-o no ambiente descartável, pois ele substitui os dados locais existentes:

```powershell
npx.cmd --yes supabase@2.115.0 start
npx.cmd --yes supabase@2.115.0 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

Para abrir o aplicativo contra esse ambiente, use a URL e a chave de cliente locais.
O comando abaixo lê a configuração em memória e seleciona somente esses dois campos:

```powershell
$aralearnLocal = npx.cmd --yes supabase@2.115.0 status --output json | ConvertFrom-Json
$env:ARALEARN_SUPABASE_URL = $aralearnLocal.API_URL
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = $aralearnLocal.ANON_KEY
npm.cmd run dev
```

O nome `ANON_KEY` pertence à configuração do conjunto local e é aceito pelo modo de
desenvolvimento. A implantação hospedada adota chaves publicáveis. A integração
contínua (CI), que executa verificações no GitHub a cada mudança pertinente, reproduz
o Supabase em ambiente descartável. O conjunto local permite investigar os mesmos
serviços durante o desenvolvimento; a [preparação da candidata](#preparar-a-candidata)
seleciona quais verificações serão exigidas para integrar a alteração.

## Percurso de dados

O navegador guarda uma cópia do curso para leitura e retomada; o servidor conserva o
conteúdo compartilhado e decide o acesso. A interface de programação de aplicações
(API) recebe os pedidos pela rede. Um roteador escolhe a operação, e um adaptador a
traduz para funções do banco. As regras podem, assim, ser testadas separadamente da tela.

As migrações são arquivos que alteram a estrutura e as funções do banco usando SQL,
a linguagem de consulta e manipulação desses dados. Usam LF como formato de quebra de
linha também nas cópias de trabalho Windows, conforme `.gitattributes`.
Isso preserva as comparações literais entre definições SQL e os trechos que as
migrações transformam, independentemente da configuração `core.autocrlf`.

Ao abrir um curso, o navegador busca sua composição em páginas de dados, valida o
conjunto e só então substitui a cópia local anterior. O
[estado pessoal de estudo](estado-de-estudo-nao-punitivo.md), que conserva os dados de
retomada, e as
[observações sobre o conteúdo](observacoes-pedagogicas.md) têm armazenamento e filas
de envio próprios. Esses envios podem ser retomados depois de uma falha.

Uma edição de conteúdo sai pelo `CourseApiClient`. A função remota
`aralearn-course-api` recebe o pedido; o `courseRouter` escolhe a operação e o
`courseSupabaseAdapter` a encaminha à função SQL responsável pela gravação. O
MCP entra por `aralearn-authoring-mcp`; Actions entra por `aralearn-authoring-action`.
Os dois apresentam as tarefas definidas em `courseHumanTasks.js` e executam as mesmas
operações da aplicação.

As funções de execução do AraLearn, chamadas de camada confiável, resolvem identidades
e versões a partir das indicações recebidas. Também identificam cada pedido para
reconciliar uma repetição sem duplicar seus efeitos. Os argumentos comuns permitem
localizar objetos por título, posição ou referência devolvida pelo serviço. Campos
técnicos presentes em respostas de recuperação devem ser preservados literalmente;
seus valores são produzidos pelo sistema, não inventados pelo modelo. O
[fluxo de autoria](fluxos-prompts-e-contratos.md) acompanha essa passagem do pedido
em linguagem natural à operação salva.

## Mapa do repositório

Os diretórios separam regras de conteúdo, armazenamento e apresentação. No navegador,
o manifesto descreve a aplicação instalável, e o service worker coordena recursos
usados sem conexão, conforme a [arquitetura](arquitetura.md).

| Caminho | Responsabilidade |
| --- | --- |
| `public/` | documento web, estilos, manifesto e service worker |
| `src/domain/` | regras de curso, configuração, fontes e dados de autoria, independentes de tela e rede |
| `src/persistence/` | réplica local, estado pessoal e observações |
| `src/study/` | navegação, repositório e tela de Estudo |
| `src/supabase/` | cliente e coordenação remota no navegador |
| `src/ui/` | interface de Autoria e painéis de leitura do conteúdo selecionado |
| `src/resources/` e `src/render/` | catálogo de componentes, dados aceitos e apresentação do conteúdo |
| `supabase/migrations/` | estrutura e funções do banco, privilégios e regras de segurança em nível de linha (RLS), que limitam quais registros cada pessoa pode consultar ou alterar |
| `supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js` | catálogo humano e execução compartilhada por MCP e Actions |
| `supabase/functions/_shared/aralearn-authoring/courseKnowledge.js` | orientação focal por fase autoral e núcleo de entrega reutilizado |
| `scripts/projectHumanAuthoringActions.mjs` | projeção do catálogo para Actions |
| `scripts/buildChatGptActionOpenApi.mjs` | geração do OpenAPI importável |
| `tests/runtime/` | domínio, contratos e integração sem navegador completo |
| `tests/e2e/` | testes de ponta a ponta (E2E), que percorrem jornadas no navegador Chromium |

`courseKnowledge.js` também reúne os critérios comuns de entrega em
`COURSE_AUTHORING_DELIVERY_CORE`. Eles acompanham a retomada com curso selecionado,
o planejamento e o preparo focal. A continuação conserva o contexto já apresentado,
enquanto os recursos de conhecimento oferecem os guias completos quando necessários.

Arquivos em `supabase/functions/_shared/aralearn/runtime/` espelham módulos comuns.
Altere a fonte em `src/` e sincronize:

```powershell
npm.cmd run resources:sync-edge
```

## Hierarquia e análise instrucional

O percurso vai do curso às unidades de estudo. Entre esses níveis, cada
microssequência reúne unidades voltadas a um objetivo delimitado, como explica o
[modelo didático](modelo-didatico.md). O mapa curricular antecipa o percurso completo.
Uma [parte de autoria](autoria-contextual.md) agrupa microssequências desse mapa para
produção e inspeção; partes sucessivas podem formar um lote. Esses agrupamentos
organizam o trabalho sem acrescentar níveis à hierarquia curricular.

Por padrão, a produção exige mapa aprovado; uma autorização expressa de autonomia
permite produzir com o mapa em rascunho. A autorização mantém as demais condições do
curso. Produzir conteúdo e declarar que uma pessoa o revisou continuam sendo
operações distintas.

Uma unidade de análise instrucional identifica algo que precisa ser acompanhado ao
longo do percurso, como uma ideia ou um procedimento. O identificador
`instructional_analysis_unit` representa esse recorte no contrato. O
[desenho instrucional](desenho-instrucional-parametrizado.md) explica como delimitá-lo
e relacioná-lo à produção. A aplicação distingue quando esse conhecimento é
introduzido, usado como já estabelecido ou retomado.

O servidor consegue conferir identidade, ordem e referências, mas a equivalência de
significado entre duas formulações exige julgamento autoral. Os dados sintéticos usados
nos testes, chamados *fixtures*, precisam deixar esse julgamento inspecionável em vez
de apresentá-lo como validação semântica automática.

Uma unidade apresenta o conteúdo por meio de [componentes didáticos](componentes-didaticos.md),
como uma tabela ou um diagrama. Cada uso de um componente é uma instância: associa
seus dados a um pacote identificado por `package@version`. O esquema do pacote define
os campos e valores aceitos e é conferido antes de salvar ou apresentar a instância.

## Como alterar uma capacidade

Uma mudança pode afetar a regra do conteúdo, sua gravação e o controle que a pessoa
usa para editá-lo. Comece pelo lugar que decide o dado alterado: as regras de domínio
verificam o conteúdo; o banco conserva os registros e as permissões; a interface
apresenta a operação. Por exemplo, acrescentar uma regra a uma atividade exige que
o navegador e o servidor aceitem e recusem os mesmos casos.

O percurso depende do que a mudança altera:

1. ajuste a regra de domínio, independente de tela ou rede, quando mudar a validade do conteúdo;
2. crie uma nova migração quando a persistência ou a autorização mudarem;
3. exponha o caso de uso pelo roteador comum;
4. se a tarefa for conversacional, ajuste o catálogo humano canônico;
5. regenere a projeção Actions e o OpenAPI;
6. adapte controlador e interface quando houver efeito visual;
7. acrescente o menor teste que reproduz o risco em cada fronteira;
8. valide com Supabase local ou navegador quando a propriedade depender deles.

Uma nova tela pode reutilizar consultas e operações já existentes. A necessidade de
outra tabela ou serviço depende do que precisa ser guardado ou executado.

## MCP e Actions

Os dois canais precisam oferecer as mesmas tarefas sem manter duas implementações.
`COURSE_HUMAN_TASKS` é a lista canônica das 56 tarefas humanas. O MCP publica cada
tarefa com metadados próprios. Actions usa o mapeamento de tarefas para operações,
chamado *binding*, em `courseActionBindings.js` para oferecê-las em 30 operações HTTP,
isto é, pedidos enviados pelo protocolo da Web. Seis grupos recebem `tarefa` e
`argumentos`, e 24 operações diretas recebem os argumentos na raiz. O binding encaminha cada tarefa à mesma validação e ao mesmo caso de uso do MCP. As
referências de arquivo geridas pelo ChatGPT permanecem na raiz das operações diretas
de ingestão, conforme o [contrato de Actions](autoria-actions.md#operações).

Ao alterar o catálogo:

```powershell
npm.cmd run actions:openapi:check
npm.cmd run test:focal -- `
  tests/runtime/chatgpt-action-human-schema.test.js `
  tests/runtime/course-authoring-contract-runtime.test.js `
  tests/runtime/course-human-task-executor.test.js `
  tests/runtime/course-human-materialization.test.js `
  tests/runtime/course-human-mcp.test.js `
  tests/runtime/course-human-corrections.test.js `
  tests/runtime/course-action-server.test.js
```

O verificador de gerados confere o OpenAPI, e a união focal executa uma vez o contrato
compartilhado, o MCP e o Actions. Os scripts `test:authoring:contract`,
`test:authoring:mcp` e `test:authoring:actions` continuam disponíveis para o recorte
de um canal; as duas últimas chamadas já incluem o contrato, então não as preceda com
`test:authoring:contract` no mesmo ciclo.

As respostas públicas apresentam resultado e link direto ao objeto, com uma próxima
decisão quando necessária. Contexto estruturado pode acompanhar a leitura sem virar
texto longo de coordenação.

## Concorrência e trabalho local

Duas gravações podem partir de versões diferentes do mesmo curso. Para evitar que uma
apague o trabalho da outra, o navegador e a camada confiável distinguem conflito de
revisão, repetição do pedido, ausência de mudança e erro de validação. Uma falha
transitória pode permitir repetir a mesma operação; uma mudança concorrente exige
reler o curso e conciliar a intenção com o conteúdo atual. O contrato dessas
[escritas concorrentes](persistencia-relacional.md#escritas-concorrentes) especifica
como identificar o pedido e recuperar seu resultado.

O [PostgREST](https://docs.postgrest.org/en/stable/references/errors.html) converte
pedidos HTTP em operações do banco e devolve seus resultados.
O banco identifica classes de erro por códigos SQLSTATE; o transporte precisa
traduzir esses códigos sem confundir concorrência com falha transitória.

No PostgreSQL, conflitos deliberados de revisão ou estado usam `PT409`, que PostgREST
devolve como HTTP 409. Reserve `40001` para falhas de serialização do motor: versões
do transporte podem repetir esse SQLSTATE sem reler os argumentos da aplicação. A API
traduz ambos para `stale_course_state`. Os tratadores de erro que já produzem uma
resposta estruturada `PGRST` preservam seu código JSON e capturam as duas classes.
O código dentro dessa resposta é um campo dos dados; o SQLSTATE é o código de erro
lançado pela função do banco.

Uma composição recém-obtida permanece candidata no
[IndexedDB](persistencia-relacional.md), o armazenamento estruturado do navegador, até
ser validada por inteiro. A última revisão válida só é substituída depois dessa
conferência. Estado pessoal e observações possuem filas próprias; trabalhos autorais
que dependem do curso compartilhado corrente, como produzir conteúdo ou tratar uma
fonte, exigem o servidor.

### Recuperação da exclusão de cursos

Ao confirmar a exclusão ou a saída de um curso, o repositório de Estudo salva uma
tentativa no compartimento IndexedDB da conta antes de enviar a ação. Ela contém ator,
curso, operação, identidade da requisição, data e título para apresentação. O título
não identifica o alvo. Uma resposta perdida, sessão expirada ou limpeza interrompida
conserva essa tentativa; a Home oferece sua retomada mesmo quando o curso já não
aparece na listagem.

`CourseStudyRepository.resumeCourseLifecycle(courseId)` retoma somente uma tentativa
guardada, na conta que a iniciou. A sessão pode ser renovada pelos mecanismos normais;
a identidade da operação permanece igual. O endpoint de ciclo de vida reconcilia a
exclusão e as intenções de remoção de arquivos, preservando referências de cópias
independentes. O cliente encerra a tentativa apenas com contrato final correspondente
e `fileCleanupPending:false`, seguido da limpeza da réplica local. Ausência na
listagem e erro de transporte não confirmam conclusão. A interface não pede novamente
a confirmação de uma tentativa já autorizada.

`refreshPendingCourseLifecycles()` relê as tentativas persistidas e
`loadPendingCourseLifecycles()` fornece um retrato dos registros pendentes para apresentação e
instrumentação autorizada. Nenhum deles despacha exclusão. O teste focal
`tests/runtime/course-lifecycle-recovery.test.js` usa IndexedDB local sintético e
respostas simuladas; a prova de sessão, confirmação e limpeza no cliente hospedado
permanece uma verificação separada.

## Interface

Estudo é a referência visual da Autoria: coluna estreita, uma rolagem principal e uma
unidade de estudo focal. Teste 360, 390 e 430 px e uma largura de computador,
incluindo temas, teclado, foco, `Esc`, clique externo e voltar/avançar. Confira também
os links diretos a pontos internos do curso, chamados *deep links*.
Ações representadas somente por ícones precisam de nome acessível e estado
compreensível.

Em **Dados de autoria**, a pessoa escolhe uma dimensão e o recorte do curso. O painel
também permite comparar cursos e localizar as unidades de uma distribuição. A ação
**Exportar curso e análise** inclui o documento integral do curso e a análise do
recorte selecionado, com fontes, bases explicativas, parâmetros e marcas de revisão.
Os números precisam corresponder aos dados exibidos na mesma revisão; o formato está
descrito em [análise de autoria](analytics-instrucionais.md).

<a id="fontes-pdfs-e-storage"></a>

## Fontes e arquivos anexados

[Fontes](fontes-e-citacoes.md) identificam materiais; âncoras localizam passagens;
atribuições registram seu uso no conteúdo. Os três guardam o estado corrente. Para os
documentos anexados em PDF, o serviço calcula e valida a identidade a partir dos bytes
do arquivo, controla a cota e usa a API do Storage para gravar ou remover objetos.
O esquema `storage` é lido para inventário e autorização, nunca alterado
diretamente pela aplicação ou por migração de negócio.

O servidor prepara o download e devolve uma URL assinada, que autoriza o acesso ao
arquivo por um período curto. A identidade persistente do anexo é independente
desse endereço temporário. A remoção conserva no banco uma marca de retirada,
chamada *tombstone*, e uma intenção de limpeza até o objeto ser eliminado pela API.

Valide o ciclo real com:

```powershell
npm.cmd run test:storage:lifecycle:local
```

## Migrações, instalação nova e atualização

Uma migração descreve uma passagem reproduzível de um estado do banco para o seguinte.
Ela deve recusar uma pré-condição incompatível e instalar junto tudo o que a mudança
exige, inclusive seus privilégios e políticas. Verifique tanto a instalação em banco
novo (*fresh*) quanto a atualização de um banco que já contém dados (*upgrade*).

```powershell
npx.cmd --yes supabase@2.115.0 db reset
npx.cmd --yes supabase@2.115.0 db lint --local --level warning
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
npm.cmd run test:backup-restore:local
```

O ensaio de backup e restauração usa bancos PostgreSQL descartáveis e sem rede. Ele
restaura um arquivo de cópia do banco (*dump*) com dados sintéticos de uma versão
anterior, percorre as migrações até o manifesto corrente e confere a estrutura e os
dados que devem ser preservados. Em outro banco, instala a mesma cadeia desde o início
e compara o esquema executável, inclusive privilégios,
políticas e catálogos compartilhados. Cada migração fica registrada no histórico antes
de o verificador avançar para a seguinte.

O ensaio confere estrutura, planejamento, desenho, configuração, fontes, metadados de
PDF e observações. Os dados anteriores mantêm seu significado durante o percurso: um
objeto sem registro de revisão, por exemplo, não recebe uma aprovação criada pela
atualização. As comparações e os ajustes da restauração estão no
[verificador de atualização](../scripts/verifyBackupRestoreUpgrade.mjs). O ensaio usa
dados sintéticos; a restauração hospedada precisa de seu backup corrente, e os bytes do
Storage precisam de uma cópia separada do *dump* do banco.

Funções `security definer` executam com os direitos de seu proprietário.
Elas fixam onde procurar tabelas e funções (`search_path`), limitam quem pode
chamá-las e validam a pessoa no corpo da operação. Tabelas expostas exigem privilégio e
política de segurança em nível de linha.

## Testes e integração

A validação começa pelo comportamento alterado. Reproduza a falha, execute o teste
que a observa e confira os consumidores da regra. Uma mudança de autorização, por
exemplo, precisa ser exercitada no servidor e com pessoas de permissões diferentes;
uma mudança de foco ou rolagem precisa chegar ao navegador.

### Selecionar a prova durante o desenvolvimento

O executor focal aceita arquivos de `tests/kernel` e `tests/runtime`. Seleção vazia
ou caminho desconhecido interrompe a chamada, e o código de saída conserva o resultado
dos testes:

```powershell
npm.cmd run test:focal -- tests/runtime/course-design-parameters.test.js
npm.cmd run test:focal -- tests/runtime/ci-path-classification.test.js tests/runtime/test-runner.test.js
npm.cmd run test:e2e -- tests/e2e/study-explanation.spec.js --retries=0
```

O terceiro comando entrega a seleção ao [Playwright](https://playwright.dev/docs/intro),
que controla o navegador durante os testes. O executor prepara o artefato web e
restaura sua configuração temporária ao terminar.
Inspecione também o cliente real quando o problema depender da hospedagem, da conta ou
do dispositivo.

| Camada | O que a prova consegue observar | Quando ampliar |
| --- | --- | --- |
| Domínio e componentes | Validade de dados, cálculos, contratos e estados de erro. | Quando o efeito depende de gravação, rede ou interação. |
| [PGlite](https://pglite.dev/docs/) | Funções e transformações SQL num PostgreSQL incorporado ao teste. | Para conferir autenticação, regras de acesso por linha, arquivos e concorrência nos serviços reais. |
| Navegador com dados sintéticos | Interação, disposição, foco e resposta em condições controladas. | Quando identidade, permissões ou bytes hospedados fazem parte do risco. |
| Supabase local e navegador | Pedidos HTTP, contas, banco e arquivos num ambiente descartável. | Para confirmar a configuração e a versão efetivamente hospedadas. |
| Cliente publicado | Resultado na instalação ou serviço que chegará às pessoas. | Para perguntas sobre aprendizagem ou experiência, aplicar o protocolo com participantes. |

### Preparar a candidata

A candidata é o conjunto de alterações que será integrado. Mantenha a solicitação
(*pull request*, PR) em rascunho enquanto desenvolve. Quando o conjunto estiver estável,
consulte e execute sua preparação:

```powershell
npm.cmd run validate:candidate -- --base origin/main --plan
npm.cmd run validate:candidate -- --base origin/main
```

O primeiro comando mostra as verificações selecionadas; o segundo as executa. Cada
verificação obrigatória é chamada de *gate*. O classificador em
[`validationImpact.mjs`](../scripts/validationImpact.mjs) examina os caminhos e
escolhe o alcance pertinente. CSS seleciona provas de interface; contratos e banco
selecionam também integração; caminhos desconhecidos e mudanças na própria
orquestração exigem o conjunto completo. Como a seleção por arquivo tem alcance
limitado, mantenha os testes focais do comportamento no trabalho de desenvolvimento.

A preparação começa pelos verificadores de arquivos e pela análise estática (*lint*)
e avança para os testes selecionados. Para web, entram os arquivos alterados de testes
comuns de navegador; os E2E afetados indiretamente continuam sendo escolhidos durante o
desenvolvimento. Os verificadores de publicação conhecidos — `verifyPublishedSite`,
`verifyDeploymentArtifacts` e `androidNativeGate` — têm consumidores focais definidos.
Scripts sem papel conhecido conservam a seleção ampla.

O resumo `.validation/candidate.json` identifica a árvore de arquivos, a configuração,
os gates e seus resultados, com links para os logs locais. A primeira falha interrompe
a preparação. Corrija-a, confirme o recorte afetado e retome o comando. Resultados cujos
arquivos, dependências e configurações relevantes continuam iguais podem ser
reutilizados; `--force` pede sua execução novamente.

Os recibos dos testes focais de runtime e E2E registram quais fontes e testes foram
alcançados, incluindo módulos importados, leituras de arquivos e evidências consumidas.
Um carregamento dinâmico ou uma origem indisponível torna essa identificação inconclusiva
e conserva o conjunto amplo de entradas. A implementação desses critérios está em
[`validateCandidate.mjs`](../scripts/validateCandidate.mjs).

A preparação local seleciona a necessidade de integração com Supabase, mas sua
certificação pertence à tarefa da CI, chamada *job*, executada em ambiente descartável.
Para investigar essa fronteira localmente, use o procedimento da seção seguinte.

Depois de revisar, registrar as alterações em um commit e enviar a branch ao GitHub,
marque o PR como pronto para revisão:

```powershell
npm.cmd run candidate:ready -- --base origin/main
```

Esse comando usa a preparação aprovada sem executar novamente os gates. Confere se os
arquivos estão salvos e idênticos aos validados, se dependências e configuração
permanecem iguais e se o commit local corrente (HEAD) corresponde ao remoto. O PR deve
ter `main` como destino. A comparação cobre todas as alterações da solicitação a
partir da base e do ancestral comum registrados. Relatório ausente ou desatualizado
exige nova preparação. O comando muda o estado do PR; registrar commits, enviar a
branch (*push*) e integrá-la são operações separadas.

A passagem para pronto emite `ready_for_review` e inicia os jobs aplicáveis da CI. O
check protegido **Testar e validar** reúne seus resultados. Web executa a suíte de
runtime e as jornadas comuns; Android compila e inspeciona o aplicativo; Supabase
recria os serviços e exerce sua integração. O certificado vincula resultados e
artefatos à mesma candidata. Se for necessário corrigir uma falha, volte o PR a
rascunho antes de enviar as mudanças. O [procedimento de
implantação](implantacao.md#validar-antes-da-publicação) descreve a certificação e a
promoção dos artefatos.

### Exercitar banco, autenticação e arquivos

`validateLocalSupabase.ps1` usa um conjunto local já preparado. O
[Deno](https://docs.deno.com/runtime/test/) executa os testes das
funções do servidor, e o [pgTAP](https://pgtap.org/documentation.html) confere o banco
por meio de testes escritos em SQL. O script também verifica a correspondência entre
as capacidades declaradas e implementadas, analisa o banco e exerce gravações
concorrentes. Os avisos do analisador permanecem visíveis; erros bloqueiam a prova.
Por padrão, o script prossegue para a integração HTTP e o navegador. Com
`-DatabaseOnly`, conclui após as verificações de banco.

`npm run test:integration:local` também pode ser chamado diretamente sobre os serviços
já preparados. Ele verifica a autoria corrente, produz dois lotes por canal HTTP,
percorre as jornadas reais selecionadas em `tests/e2e/` e exercita a cópia de PDF e WAV.
O script mantém o banco existente e inicia apenas o processo de funções de que precisa.
Uma cópia privada dos arquivos e da configuração estabiliza esse processo durante a
prova; impressões digitais dos arquivos (*hashes*) calculadas antes e depois detectam
mudanças na origem ou na cópia.

Um processo persistente pode ser reutilizado com `--functions-existing` quando o
script confirma origem, montagem somente para leitura, serviços prontos e ausência de
alterações pertinentes em funções, configuração e migrações. Na CI, o processo já
supervisionado é fornecido por `--functions-external --ci`. Cada forma preserva a
responsabilidade por encerrar somente os processos iniciados pela própria execução.

As jornadas criam contas, cursos e arquivos sintéticos e registram sua limpeza. Quando
um caso exige a política `reviewed_only`, que libera apenas conteúdo com revisão
humana atual, a fixture inclui explicação e declaração de revisão de
teste pela operação protegida apropriada. As revisões são relidas após cada mudança.
Esse preparo permite exercer a política de acesso; a revisão de cursos reais continua
sendo uma decisão do proprietário.

A disponibilidade dos serviços é conferida antes de cada etapa. Uma prova obrigatória
precisa executar seus casos, sem seleção vazia, testes pulados ou `test.only`;
`--forbid-only` protege a seleção. Falhas HTTP inesperadas e limpeza incompleta impedem
concluir a integração. O resumo distingue falha funcional de resíduos de teste, e os
logs omitem credenciais.

Alterações de banco exigem também instalação nova, atualização de dados existentes e
restauração, conforme a seção de [migrações](#migrações-instalação-nova-e-atualização).
A identidade de uma migração aplicada é preservada; uma correção posterior recebe novo
arquivo.

### Inspecionar a interface e executar o conjunto completo

A explicação possui uma [jornada de navegador](../tests/e2e/study-explanation.spec.js)
e uma [galeria local](../tests/gallery/study-explanation.html). Elas permitem examinar
texto extenso, componentes, ferramentas, referências e retorno de foco em larguras e
temas diferentes. Autorização e arquivos remotos são exercitados nas jornadas de
integração. Use o [sistema visual](sistema-visual.md) e o
[roteiro de verificação](auditoria-front-end.md) para interpretar o resultado.

Quando o impacto exigir todos os testes e verificadores locais, use:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run validate:course-runtime
npm.cmd run test:e2e
npm.cmd run validate:example
```

`npm test` combina `test:preflight`, que confere gerados e auditorias, com
`test:runtime`, que executa as suítes Node. O modo `test:focal` seleciona somente os
testes informados. Uma entrega web pode ser conferida por
`validateDeployment.ps1 -Scope Web`; Android acrescenta `-Scope Full`. A integração
Supabase e a conferência hospedada têm procedimentos próprios. Reutilize resultados
válidos para a mesma candidata e repita as provas cuja base tenha mudado.

## Inspeção pedagógica por IA

Uma mudança no percurso pode alterar o sentido de uma atividade preservada. Por isso,
a inspeção recebe o conteúdo junto do público, do planejamento, das unidades na ordem
salva, das escolhas usadas na produção e das fontes pertinentes. Esse conjunto é a
[base pedagógica focal](persistencia-relacional.md#pareceres-de-inspeção-e-suas-bases),
construída no banco e identificada pelo mesmo hash usado para validar a gravação do
parecer.
`coursePedagogicalAudit.js` projeta essa base para leitura e verifica contradições
observáveis; `courseContentInspection.js` valida estados, resultados e completude.

Ao alterar essa capacidade, confira a unidade, a explicação e o efeito sobre os demais
alvos da microssequência. Os testes `course-ai-inspection-pglite.test.js` exercitam
persistência, ordem, mudança de base e repetição do pedido. Os testes
`course-pedagogical-audit.test.js` e `course-content-inspection.test.js` exercitam os
[seis critérios de inspeção](auditoria-de-conformidade-instrucional.md#inspeção-por-ia-sobre-o-conteúdo-salvo)
e a coerência dos resultados.

Na leitura conversacional, `courseHumanAuditContext.js` reúne bases idênticas da mesma
página para evitar repeti-las em cada alvo. As referências individuais e os dados
específicos continuam associados ao objeto correto. Preserve essa relação ao alterar
a projeção; `course-human-audit-context.test.js` verifica a correspondência entre
contexto compartilhado, parâmetros e alvo. A escrita relê a base canônica antes de
aceitar evidências, mesmo quando a resposta ao cliente a apresentou de forma agrupada.

## Revisão humana do conteúdo

A [declaração de revisão humana](explicacao-e-revisao-humana.md) precisa identificar o
mesmo conteúdo e as mesmas fontes que a pessoa inspecionou. Por isso, a interface lê
a base de revisão antes e depois de carregar o conteúdo: se ela mudou, a inspeção precisa ser atualizada.
A declaração é individual por explicação ou unidade e pode ser retirada.

Uma resposta perdida conserva o pedido original para recuperação. O recibo
confirma aquela decisão; uma nova leitura verifica se ela ainda corresponde ao
conteúdo atual. Edição e declaração de revisão são operações distintas, ambas
sujeitas à propriedade e à autorização correntes.

A implementação está em
[CourseMicrosequenceReview.js](../src/ui/CourseMicrosequenceReview.js). Os testes
de [estado](../tests/runtime/course-microsequence-review.test.js) e de
[interface](../tests/e2e/course-microsequence-review.spec.js) exercitam mudanças
da base, decisões explícitas, recuperação, fontes, foco e larguras de tela.
A [galeria local](../tests/gallery/course-microsequence-review.html) permite
inspeção visual com dados sintéticos; a autenticação e os arquivos remotos são
verificados nas jornadas de integração.

## Documentação

Os guias de uso acompanham o comportamento atual; o histórico de mudanças conserva
as versões anteriores. Os [princípios editoriais](principios-editoriais.md)
orientam a organização, a linguagem e as fontes das contribuições.

```powershell
npm.cmd run audit:docs
npm.cmd run audit:terminology
npm.cmd run docs:references:check
```

Antes de integrar, confira o diretório de trabalho e o diff, preserve mudanças alheias
e consulte o roteiro de [Implantação](implantacao.md).
