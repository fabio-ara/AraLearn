# Guia do desenvolvedor

O AraLearn é uma aplicação web em módulos JavaScript, distribuída também numa WebView,
o componente que apresenta a aplicação dentro do pacote Android. Os serviços remotos
usam [Supabase](supabase.md). A interface e os canais [MCP](autoria-mcp.md) e
[Actions/OpenAPI](autoria-actions.md) leem e alteram os mesmos cursos. Mudanças de
código precisam preservar conteúdo, permissões e decisões humanas em todos esses
caminhos.

Comece pela [Arquitetura](arquitetura.md), siga para [Persistência relacional e
sincronização](persistencia-relacional.md) e consulte [Supabase](supabase.md) antes de
alterar banco, autenticação, Storage ou Edge Functions.

## Preparação

Os comandos abaixo são executados na raiz de uma cópia local do repositório e usam
PowerShell no Windows. `npm.cmd` e `npx.cmd` correspondem a `npm` e `npx` em outros
sistemas. Instale [Node.js 22](https://nodejs.org/en/download), que executa as
ferramentas JavaScript do projeto. O npm instala os pacotes de que o projeto depende;
`npm ci` usa as versões registradas em `package-lock.json`. Depois da instalação,
`dev` inicia o servidor que apresenta a aplicação local:

```powershell
npm.cmd ci
npm.cmd run dev
```

O servidor local abre `http://127.0.0.1:4182`. A aplicação usa somente a URL e a chave
publicável do Supabase no navegador:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

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

| Caminho | Responsabilidade |
| --- | --- |
| `public/` | documento web, estilos, manifesto e service worker |
| `src/domain/` | regras puras de curso, configuração, fontes e Analytics |
| `src/persistence/` | réplica local, estado pessoal e observações |
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

Arquivos em `supabase/functions/_shared/aralearn/runtime/` espelham módulos comuns.
Altere a fonte em `src/` e sincronize:

```powershell
npm.cmd run resources:sync-edge
```

## Hierarquia e análise instrucional

A composição usa curso, módulo, lição, microssequência e unidade de estudo. O mapa
curricular completo existe antes da produção. Uma parte é o lote operacional que
referencia microssequências já previstas, não um nível dessa árvore.

Uma unidade de análise identifica uma ideia, relação, condição, procedimento ou
operação acompanhada no percurso. No código, ela se chama
`instructional_analysis_unit`; o [modelo didático](modelo-didatico.md) explica
como essa análise orienta a produção. A aplicação
distingue introdução, uso de conhecimento estabelecido e retomada. O backend pode
conferir identidade, ordem, referência e limites, mas não alegar que duas formulações
são equivalentes semanticamente. Os dados sintéticos de teste, chamados fixtures, devem tornar esse julgamento
inspecionável sem representar uma validação semântica automática.

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
2. altere a migração quando a persistência ou a autorização mudarem;
3. exponha o caso de uso pelo roteador comum;
4. se a tarefa for conversacional, ajuste o catálogo humano canônico;
5. regenere a projeção Actions e o OpenAPI;
6. adapte controlador e interface quando houver efeito visual;
7. acrescente o menor teste que reproduz o risco em cada fronteira;
8. valide com Supabase local ou navegador quando a propriedade depender deles.

Uma nova tela pode reutilizar consultas e operações já existentes. A necessidade de
outra tabela ou serviço depende do que precisa ser guardado ou executado.

## MCP e Actions

`COURSE_HUMAN_TASKS` é a lista canônica das 54 tarefas humanas. O MCP publica cada
tarefa com metadados próprios. Actions usa o mapeamento de tarefas para operações, chamado binding, em
`courseActionBindings.js` para oferecê-las em 30 operações HTTP: seis grupos recebem
`tarefa` e `argumentos`, e 24 operações diretas recebem os argumentos na raiz. O
binding encaminha cada tarefa à mesma validação e ao mesmo caso de uso do MCP. As
referências de arquivo geridas pelo ChatGPT permanecem na raiz das operações diretas
de ingestão, conforme o [contrato de Actions](autoria-actions.md#operações).

Ao alterar o catálogo:

```powershell
npm.cmd run test:authoring:contract
npm.cmd run test:authoring:mcp
npm.cmd run actions:openapi:check
npm.cmd run test:authoring:actions
```

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

Uma composição nova permanece candidata no
[IndexedDB](persistencia-relacional.md), o armazenamento estruturado do navegador, até a validação integral. Nunca
apague a última revisão válida para aceitar uma candidata incompleta. Estado pessoal e
observações possuem filas específicas. Planejamento, produção, fontes, configuração,
revisão e Analytics exigem o estado remoto corrente.

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
atribuições registram seu uso no conteúdo. Os três guardam o estado corrente. O serviço calcula e valida a
identidade binária do PDF, controla cota e usa a API do Storage para gravar ou remover
objetos. O esquema `storage` é lido para inventário e autorização, nunca alterado
diretamente pela aplicação ou por migração de negócio.

O download é preparado no servidor e devolve uma URL assinada de curta duração. Essa
URL não é identidade persistente do anexo. A remoção conserva uma marca relacional de retirada, chamada tombstone, e uma
intenção temporária de limpeza até o objeto ser eliminado pela API.

Valide o ciclo real com:

```powershell
npm.cmd run test:storage:lifecycle:local
```

## Migrações, instalação nova e atualização

Uma migração deve falhar diante de pré-condição incompatível e instalar junto a
estrutura, índices, privilégios e políticas. Verifique a instalação em banco novo (fresh) e a atualização de um banco com
dados úteis (upgrade).

```powershell
npx.cmd --yes supabase@2.115.0 db reset
npx.cmd --yes supabase@2.115.0 db lint --local --level warning
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
npm.cmd run test:backup-restore:local
```

O ensaio de backup e restauração usa bancos PostgreSQL descartáveis e sem rede,
restaura um dump sintético anterior e percorre a cadeia de migrações até o manifesto
corrente. Confere estrutura, planejamento, desenho, configuração, fontes, metadados de
PDFs e observações. Também instala a cadeia do zero em outro banco e compara o esquema
executável, incluindo concessões de privilégios (grants) e políticas, e as definições e os padrões dos catálogos
de parâmetros e componentes com o banco atualizado. O acervo anterior conserva o
estado de revisão não registrado e a leitura permitida, sem receber aprovação ou
explicação geradas pela atualização. Cada migração é registrada no histórico antes da
próxima verificação. As comparações de estrutura e os ajustes necessários à restauração estão no
[verificador de atualização](../scripts/verifyBackupRestoreUpgrade.mjs). Essa prova não
equivale à restauração de um backup hospedado atual. Os bytes do Storage formam uma
fronteira separada do backup lógico do banco.

Funções `security definer` executam com os direitos de seu proprietário.
Elas fixam onde procurar tabelas e funções (`search_path`), limitam quem pode
chamá-las e validam a pessoa no corpo da operação. Tabelas expostas exigem privilégio e política de
segurança em nível de linha.

## Testes e integração

Uma solicitação de integração de mudanças, ou pull request (PR), reúne o diff e as
verificações da candidata. Mantenha o PR em rascunho durante o desenvolvimento.
Consulte o impacto e execute a preparação local antes de liberar a candidata para a
validação integral, a execução completa dos testes e verificadores exigidos para a
integração:

```powershell
npm.cmd run validate:candidate -- --base origin/main --plan
npm.cmd run validate:candidate -- --base origin/main
```

A candidata é o conjunto de alterações que será integrado; cada verificação
obrigatória é chamada de gate. O classificador distingue documentação, web,
contratos, serviços remotos (backend), banco, Android e
orquestração. Caminhos desconhecidos ampliam o conjunto. CSS puro seleciona provas de
interface sem iniciar banco; comportamento web e contratos incluem integração real
local. Android possui testes de contrato e build/lint locais quando aplicáveis, além
do gate obrigatório na integral final. A seleção é conservadora, não uma análise
completa de dependências: acrescente o teste focal do comportamento alterado quando
ele ainda não estiver representado.

A preparação executa verificadores de
arquivos, análise estática de código (lint), testes de execução selecionados, jornadas
completas no navegador (E2E) e integração com os serviços, nessa ordem. A primeira
falha interrompe o percurso. O resumo em `.validation/candidate.json` contém árvore,
configuração, gates, resultado, falhas e referências de logs. O diretório é ignorado
pelo Git. Leia primeiro esse resumo; abra somente o log necessário para diagnosticar
uma falha.

Resultados locais podem ser reutilizados quando arquivos, dependências e
configuração relevantes permanecem iguais. `--force` repete as verificações.
A integração com banco é executada novamente quando necessária, pois a igualdade
do código não comprova o estado dos dados. Os critérios de seleção estão no
[orquestrador da candidata](../scripts/validateCandidate.mjs); o resultado local
prepara o PR, enquanto a validação integral autoriza sua promoção.

Depois de resolver falhas, revisar, fazer commit, enviar a branch e abrir o PR em
rascunho, libere a candidata pelo mesmo caminho:

```powershell
npm.cmd run candidate:ready -- --base origin/main
```

Esse comando só marca o PR como pronto após os gates verdes, com árvore limpa, HEAD
remoto idêntico e destino `main`. A seleção cobre o delta completo contra a base real
do PR; `--base` não pode recortar somente o último commit. `ready_for_review` dispara
a integral. Para corrigir uma candidata que falhou, retorne o PR a rascunho antes de
enviar novas mudanças. Não inicie outra integral enquanto houver gate local pendente.
O comando não faz commit, push, merge ou publicação.

Durante um ajuste, também é possível escolher explicitamente os arquivos que exercitam
a mudança. O programa que executa os testes, ou runner, aceita arquivos de `tests/kernel` e `tests/runtime`, recusa
seleção vazia ou inválida e preserva o código de saída:

```powershell
npm.cmd run test:focal -- tests/runtime/course-design-parameters.test.js
npm.cmd run test:focal -- tests/runtime/ci-path-classification.test.js tests/runtime/test-runner.test.js
```

O modo focal não executa as auditorias e integrações completas de `npm test` nem
produz aprovação da candidata. Sem argumentos, `scripts/runTests.mjs` continua
executando todos os arquivos das duas suítes; `npm test` conserva também seus
verificadores anteriores. PGlite, uma versão incorporada de PostgreSQL, verifica
transformações SQL e contratos do banco; Auth, RLS, Storage e concorrência real
precisam do Supabase local. As jornadas opt-in de acesso em
`course-access-local.spec.js` criam contas e cursos próprios na stack local. Quando
exercitam leitores ou visitantes, suas fixtures incluem explicação e uma declaração de
revisão de teste pelo RPC protegido quando o cenário usa a política `reviewed_only`;
essa preparação não constitui revisão humana de um curso real. As revisões usadas após
a aprovação são relidas, sem fixar o número anterior à mudança. Falhas HTTP
inesperadas continuam reprovando a jornada. Os testes conservam o registro das contas e dos arquivos criados para confirmar
sua limpeza. Uma falha de limpeza precisa ser resolvida antes de encerrar a
validação.

Para o navegador, use:

```powershell
npm.cmd run test:e2e
npm.cmd run test:e2e -- tests/e2e/study-explanation.spec.js --retries=0
```

O runner encaminha a seleção ao Playwright e restaura a configuração temporária de
staging. E2E obrigatório com zero testes, skip ou falha não aprova a preparação;
`--forbid-only` impede que um `test.only` reduza a prova da candidata. Testes contra
adaptadores sintéticos continuam separados das jornadas com Auth, HTTP, PostgreSQL e
Storage reais locais.

O gate de banco executa Deno, o ambiente das funções remotas; pgTAP, a suíte de
testes SQL; inventário de paridade; lint; e concorrência antes
das jornadas. Local e CI registram avisos do lint e bloqueiam erros explicitamente.
Uma migration candidata precisa estar aplicada na stack; alterar silenciosamente uma
migration já aplicada é recusado. Instalação nova, atualização e restauração continuam obrigatórios
conforme o impacto da mudança e o corte.

`npm run test:integration:local` reaproveita uma stack local já preparada e executa
Autoria corrente, dois lotes por canal HTTP, as dez jornadas reais no Chromium e cópia
PDF/WAV. O runner não inicia, reseta nem encerra o banco. Ele serve funções próprias,
confere se os serviços estão prontos (readiness) e encerra somente o processo que iniciou; a CI pode compartilhar seu
processo já supervisionado. Um runtime persistente local pode ser usado com
`--functions-existing` apenas após conferir que os arquivos estão montados somente para leitura, a origem, a
prontidão dos serviços e
ausência de alteração de funções/configuração/migrations contra a base. Isso conserva
o processo existente quando seu código não foi alterado. Para o orquestrador, a opção
correspondente é `ARALEARN_LOCAL_FUNCTIONS_EXISTING=1`. Falha de limpeza bloqueia a
prova. Contas e arquivos são sintéticos; esses testes não aprovam cursos reais nem
substituem ChatGPT, MCP ou Actions hospedados.

A integração confere a disponibilidade dos serviços antes de cada etapa e registra
falhas com o teste e o ponto em que ocorreram. O resumo separa falha funcional de
limpeza incompleta; os detalhes ficam nos logs locais, sem credenciais.

A explicação possui uma jornada própria em
[study-explanation.spec.js](../tests/e2e/study-explanation.spec.js) e uma
[galeria local](../tests/gallery/study-explanation.html). Elas permitem examinar
texto extenso, componentes, ferramentas, referências e retorno de foco em
larguras e temas diferentes. Os dados são sintéticos; a autorização e os arquivos
hospedados são verificados nas jornadas de integração.

Os testes de ferramentas e navegação complementam essa leitura, conferindo
controles, cálculo, áudio, foco e rolagem. A inspeção segue o
[sistema visual](sistema-visual.md) e o [roteiro de verificação da interface](auditoria-front-end.md).

Quando for necessário executar todos os testes e verificadores localmente, use:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run validate:course-runtime
npm.cmd run test:e2e
npm.cmd run validate:example
```

Uma entrega web passa ainda por `validateDeployment.ps1 -Scope Web`; Android usa
`-Scope Full`. Mudança de banco exige instalação nova, atualização, restauração e verificação
hospedada
antes da publicação. A validação completa exigida pelas regras de integração da
candidata final pode fornecer a prova de referência; não repita o mesmo conjunto local e remotamente sem uma alteração que
invalide a evidência. `test:preflight` contém os verificadores e auditorias;
`test:runtime` contém o conjunto Node. `npm test` continua executando ambos.

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
