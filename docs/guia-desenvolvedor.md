# Guia do desenvolvedor

O AraLearn possui uma única aplicação web, organizada em módulos JavaScript. No
Android, uma WebView — o componente que executa páginas web dentro de um aplicativo —
apresenta esse mesmo código. Os serviços remotos usam [Supabase](supabase.md).

A interface e os canais externos de autoria, [MCP](autoria-mcp.md) e
[Actions/OpenAPI](autoria-actions.md), chegam aos mesmos cursos. Por isso, uma mudança
de código precisa preservar o significado do conteúdo, as permissões e as decisões
humanas independentemente do caminho usado.

Comece pela [Arquitetura](arquitetura.md), siga para [Persistência relacional e
sincronização](persistencia-relacional.md) e consulte [Supabase](supabase.md) antes de
alterar banco, autenticação, Storage ou Edge Functions.

## Preparação

Os comandos abaixo são executados na raiz de uma cópia local do repositório e usam
PowerShell no Windows. `npm.cmd` e `npx.cmd` correspondem a `npm` e `npx` em outros
sistemas. Instale [Node.js 22](https://nodejs.org/en/download), que executa as
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

`npm.cmd run dev` abre `http://127.0.0.1:4182`. Se o par de variáveis estiver
incompleto, `scripts/servePublic.js` tenta obter a configuração publicada do AraLearn
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
desenvolvimento. A implantação hospedada adota as chaves publicáveis atuais. A
preparação automática da candidata seleciona a prova necessária; o job de integração
contínua reproduz o Supabase em ambiente descartável. Iniciar os serviços localmente
é uma escolha adicional para investigar banco, autenticação ou arquivos.

## Percurso de dados

O navegador guarda uma cópia do curso para leitura e retomada; o servidor conserva o
conteúdo compartilhado e decide o acesso. A API é a interface que recebe pedidos pela
rede. Um roteador escolhe a operação, e o adaptador a traduz para funções do banco.
Essa divisão permite testar as regras sem depender da aparência da tela.

As migrações são arquivos SQL que alteram a estrutura e as funções do banco. Usam a
quebra de linha LF também nas cópias de trabalho Windows, conforme `.gitattributes`.
Isso preserva as comparações literais entre definições SQL e os trechos que as
migrações transformam, independentemente da configuração `core.autocrlf`.

Ao abrir um curso, o navegador busca a composição em páginas, valida o conjunto e só
então promove a nova revisão local. Estado pessoal e observações possuem repositórios
próprios e podem retomar envios depois de uma falha.

Uma edição de conteúdo sai pelo `CourseApiClient`. A função remota
`aralearn-course-api` recebe o pedido; o `courseRouter` escolhe a operação e o
`courseSupabaseAdapter` a encaminha à função SQL responsável pela gravação. O
MCP entra por `aralearn-authoring-mcp`; Actions entra por `aralearn-authoring-action`.
Os dois projetam o catálogo humano de `courseHumanTasks.js` e executam os mesmos casos
de uso confiáveis.

A camada confiável resolve identidades e versões e prepara pedidos que podem ser
reconciliados sem duplicação. Os argumentos comuns usam referências humanas; campos
técnicos presentes em respostas de recuperação devem ser preservados literalmente, sem
pedir ao modelo que invente seus valores.

## Mapa do repositório

Use o mapa para localizar a parte que decide o comportamento antes de editar:

| Caminho | Responsabilidade |
| --- | --- |
| `public/` | documento web, estilos, manifesto e service worker |
| `src/domain/` | regras puras de curso, configuração, fontes e Analytics |
| `src/persistence/` | réplica local, estado pessoal e observações |
| `src/study/` | navegação, repositório e tela de Estudo |
| `src/supabase/` | cliente e coordenação remota no navegador |
| `src/ui/` | superfície estreita de Autoria e leitores focais |
| `src/resources/` e `src/render/` | catálogo, contratos e renderização didática |
| `supabase/migrations/` | esquema, funções, privilégios e segurança em nível de linha (RLS) versionados |
| `supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js` | catálogo humano e execução compartilhada por MCP e Actions |
| `supabase/functions/_shared/aralearn-authoring/courseKnowledge.js` | orientação focal por fase autoral e núcleo de entrega reutilizado |
| `scripts/projectHumanAuthoringActions.mjs` | projeção do catálogo para Actions |
| `scripts/buildChatGptActionOpenApi.mjs` | geração do OpenAPI importável |
| `tests/runtime/` | domínio, contratos e integração sem navegador completo |
| `tests/e2e/` | jornadas reais no Chromium |

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

A composição organiza o percurso em vários níveis, do curso às unidades de estudo. O
mapa curricular completo existe antes da produção. Uma parte agrupa microssequências
desse mapa em lotes de trabalho e conserva a hierarquia curricular. Por padrão, a
produção exige mapa aprovado; uma autorização expressa de autonomia permite produzir
com o mapa em rascunho. Essa autorização preserva as condições do curso e a distinção
entre produção e revisão humana.

Uma unidade de análise identifica algo que precisa ser acompanhado ao longo do
percurso, como uma ideia ou um procedimento. No código, ela se chama
`instructional_analysis_unit`; o [modelo didático](modelo-didatico.md) explica como
essa análise orienta a produção. A aplicação distingue quando esse conhecimento é
introduzido, usado como já estabelecido ou retomado.

O backend consegue conferir identidade, ordem e referências, mas a equivalência de
significado entre duas formulações exige julgamento autoral. Os dados sintéticos usados
nos testes, chamados *fixtures*, precisam deixar esse julgamento inspecionável em vez
de apresentá-lo como validação semântica automática.

Uma instância didática escolhe um pacote por `package@version` e passa pelo esquema
desse pacote, que define os campos e valores aceitos, antes de ser persistida ou
renderizada.

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
tarefa com metadados próprios. Actions usa o mapeamento de tarefas para operações, chamado binding, em
`courseActionBindings.js` para oferecê-las em 30 operações HTTP: seis grupos recebem
`tarefa` e `argumentos`, e 24 operações diretas recebem os argumentos na raiz. O
binding encaminha cada tarefa à mesma validação e ao mesmo caso de uso do MCP. As
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

O navegador e a camada confiável distinguem conflito de revisão, repetição da mesma
intenção, ausência de mudança e erro de validação. Só uma falha transitória da mesma
operação admite repetição automática; conflito material exige releitura.

PostgREST converte chamadas HTTP em operações do banco e devolve seus resultados.
O banco identifica classes de erro por códigos SQLSTATE; o transporte precisa
traduzir esses códigos sem confundir concorrência com falha transitória.

No PostgreSQL, conflitos deliberados de revisão ou estado usam `PT409`, que PostgREST
devolve como HTTP 409. Reserve `40001` para falhas de serialização do motor: versões
do transporte podem repetir esse SQLSTATE sem reler os argumentos da aplicação. A API
traduz ambos para `stale_course_state`. Os handlers que já produzem um envelope
`PGRST` preservam seu código JSON e capturam as duas classes; o código dentro do JSON
não é o SQLSTATE lançado pela função.

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
incluindo temas, teclado, foco, `Esc`, clique externo, voltar/avançar e deep links.
Ações representadas somente por ícones precisam de nome acessível e estado
compreensível.

Em **Dados de autoria**, a pessoa escolhe uma dimensão e o recorte do curso. O painel
também permite comparar cursos e localizar as unidades de uma distribuição. A ação
**Exportar curso e análise** inclui o documento integral do curso e a análise do
recorte selecionado, com fontes, bases explicativas, parâmetros e marcas de revisão.
Os números precisam corresponder aos dados exibidos na mesma revisão; o formato está
descrito em [análise de autoria](analytics-instrucionais.md).

## Fontes, PDFs e Storage

[Fontes](fontes-e-citacoes.md) identificam materiais; âncoras localizam passagens;
atribuições registram seu uso no conteúdo. Os três guardam o estado corrente. O serviço
calcula e valida a
identidade binária do PDF, controla cota e usa a API do Storage para gravar ou remover
objetos. O esquema `storage` é lido para inventário e autorização, nunca alterado
diretamente pela aplicação ou por migração de negócio.

O download é preparado no servidor e devolve uma URL assinada de curta duração. Essa
URL não é identidade persistente do anexo. A remoção conserva uma marca relacional de
retirada, chamada *tombstone*, e uma
intenção temporária de limpeza até o objeto ser eliminado pela API.

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
restaura um *dump* sintético de uma versão anterior, percorre as migrações até o
manifesto corrente e confere a estrutura e os dados úteis. Em outro banco, instala a
mesma cadeia desde o início e compara o esquema executável, inclusive privilégios,
políticas e catálogos compartilhados. Cada migração fica registrada no histórico antes
de o verificador avançar para a seguinte.

O ensaio confere estrutura, planejamento, desenho, configuração, fontes, metadados de
PDF e observações. Os dados anteriores mantêm seu significado durante o percurso: um
objeto sem registro de revisão, por exemplo, não recebe uma aprovação criada pela
atualização. As
comparações e os ajustes da restauração estão no
[verificador de atualização](../scripts/verifyBackupRestoreUpgrade.mjs). O ensaio usa
dados sintéticos; a restauração hospedada precisa de seu backup corrente, e os bytes do
Storage precisam de uma cópia separada do *dump* do banco.

Funções `security definer` executam com os direitos de seu proprietário.
Elas fixam onde procurar tabelas e funções (`search_path`), limitam quem pode
chamá-las e validam a pessoa no corpo da operação. Tabelas expostas exigem privilégio e política de
segurança em nível de linha.

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

O terceiro comando entrega a seleção ao Playwright, que controla o navegador. O
runner prepara o artefato web e restaura sua configuração temporária ao terminar.
Inspecione também o cliente real quando o problema depender da hospedagem, da conta ou
do dispositivo.

| Camada | O que a prova consegue observar | Quando ampliar |
| --- | --- | --- |
| Domínio e componentes | Validade de dados, cálculos, contratos e estados de erro. | Quando o efeito depende de gravação, rede ou interação. |
| PGlite | Funções e transformações SQL num PostgreSQL incorporado ao teste. | Para conferir Auth, RLS, Storage e concorrência nos serviços reais. |
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
e avança para os testes selecionados. Para web, entram as specs comuns de navegador
alteradas; os E2E afetados indiretamente continuam sendo escolhidos durante o
desenvolvimento. Os verificadores de publicação conhecidos — `verifyPublishedSite`,
`verifyDeploymentArtifacts` e `androidNativeGate` — têm consumidores focais definidos.
Scripts sem papel conhecido conservam a seleção ampla.

O resumo `.validation/candidate.json` identifica a árvore de arquivos, a configuração,
os gates e seus resultados, com links para os logs locais. A primeira falha interrompe
a preparação. Corrija-a, confirme o recorte afetado e retome o comando. Resultados cujos
arquivos, dependências e configurações relevantes continuam iguais podem ser
reutilizados; `--force` pede sua execução novamente.

Os recibos de runtime focal e E2E acompanham as fontes e os testes realmente alcançados,
incluindo imports, leituras de arquivos e registros de evidência consumidos. Um
carregamento dinâmico ou uma origem indisponível torna essa identificação inconclusiva
e conserva o conjunto amplo de entradas. A implementação desses critérios está em
[`validateCandidate.mjs`](../scripts/validateCandidate.mjs).

A preparação local seleciona a necessidade de integração com Supabase, mas sua
certificação pertence ao job da CI, executado em ambiente descartável. Para investigar
essa fronteira localmente, use o procedimento da seção seguinte.

Depois de revisar, fazer commit e enviar a branch, libere o PR em rascunho:

```powershell
npm.cmd run candidate:ready -- --base origin/main
```

Esse comando consome a preparação aprovada, sem executar novamente os gates. Confere
árvore limpa e idêntica, dependências e configuração, HEAD local igual ao remoto e PR
contra `main`. A comparação cobre todo o delta da solicitação, a partir da base e do
ancestral comum registrados. Relatório ausente ou desatualizado exige nova preparação.
Commit, push e integração são ações anteriores ou posteriores a esse comando.

A passagem para pronto emite `ready_for_review` e inicia os jobs aplicáveis da CI. O
check protegido **Testar e validar** reúne seus resultados. Web executa a suíte de
runtime e as jornadas comuns; Android compila e inspeciona o aplicativo; Supabase
recria os serviços e exerce sua integração. O certificado vincula resultados e
artefatos à mesma candidata. Se for necessário corrigir uma falha, volte o PR a
rascunho antes de enviar as mudanças. O [procedimento de
implantação](implantacao.md#validar-antes-da-publicação) descreve a certificação e a
promoção dos artefatos.

### Exercitar banco, autenticação e arquivos

`validateLocalSupabase.ps1` usa um conjunto local já preparado. Ele executa testes
Deno das funções, testes SQL pgTAP, inventário de paridade, análise do banco e
concorrência real. Os avisos do analisador permanecem visíveis; erros bloqueiam a
prova. Por padrão, o script prossegue para a integração HTTP e o navegador. Com
`-DatabaseOnly`, conclui após as verificações de banco.

`npm run test:integration:local` também pode ser chamado diretamente sobre os serviços
já preparados. Ele verifica a autoria corrente, produz dois lotes por canal HTTP,
percorre as jornadas reais selecionadas em `tests/e2e/` e exercita a cópia de PDF e WAV.
O script mantém o banco existente e inicia apenas o processo de funções de que precisa.
Uma cópia privada dos arquivos e da configuração estabiliza esse processo durante a
prova; hashes anteriores e posteriores detectam mudanças na origem ou na cópia.

Um processo persistente pode ser reutilizado com `--functions-existing` quando o
script confirma origem, montagem somente para leitura, serviços prontos e ausência de
alterações pertinentes em funções, configuração e migrações. Na CI, o processo já
supervisionado é fornecido por `--functions-external --ci`. Cada forma preserva a
responsabilidade por encerrar somente os processos iniciados pela própria execução.

As jornadas criam contas, cursos e arquivos sintéticos e registram sua limpeza. Quando
um caso exige `reviewed_only`, a fixture inclui explicação e declaração de revisão de
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
a inspeção usa a [base pedagógica focal](persistencia-relacional.md#pareceres-de-inspeção-e-suas-bases),
construída no banco com o mesmo hash usado para validar a gravação do parecer.
`coursePedagogicalAudit.js` projeta essa base para leitura e verifica contradições
observáveis; `courseContentInspection.js` valida estados, resultados e completude.

Ao alterar essa capacidade, confira a unidade, a explicação e o efeito sobre os demais
alvos da microssequência. Os testes `course-ai-inspection-pglite.test.js` exercitam
persistência, ordem, mudança de base e repetição do pedido. Os testes
`course-pedagogical-audit.test.js` e `course-content-inspection.test.js` exercitam os
seis critérios e a coerência dos resultados.

Na leitura conversacional, `courseHumanAuditContext.js` reúne bases idênticas da mesma
página para evitar repeti-las em cada alvo. As referências individuais e os dados
específicos continuam associados ao objeto correto. Preserve essa relação ao alterar
a projeção; `course-human-audit-context.test.js` verifica a correspondência entre
contexto compartilhado, parâmetros e alvo. A escrita relê a base canônica antes de
aceitar evidências, mesmo quando a resposta ao cliente a apresentou de forma agrupada.

## Revisão humana do conteúdo

A pessoa precisa inspecionar o mesmo conteúdo e as mesmas fontes aos quais sua
declaração será vinculada. Por isso, a interface lê a base de revisão antes e
depois de carregar o conteúdo: se ela mudou, a inspeção precisa ser atualizada.
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
as versões anteriores. As [preferências editoriais](principios-editoriais.md)
explicam a organização e a linguagem adotadas para contribuições humanas.

```powershell
npm.cmd run audit:docs
npm.cmd run audit:terminology
npm.cmd run docs:references:check
```

Antes de integrar, confira o diretório de trabalho e o diff, preserve mudanças alheias
e consulte o roteiro de [Implantação](implantacao.md).
