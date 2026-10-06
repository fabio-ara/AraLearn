# Implantação

Uma instalação do AraLearn reúne o serviço remoto e a interface que chega às pessoas
pelo site ou pelo aplicativo Android. O [Supabase](supabase.md) fornece banco de dados,
autenticação e armazenamento de arquivos; esse conjunto executado no servidor é o
*backend*. Site e Android apresentam a interface e guardam no dispositivo o conteúdo
de estudo já carregado.

Os três precisam usar versões compatíveis. Por exemplo, publicar uma interface que
depende de uma nova operação do servidor antes de instalar essa operação pode impedir a
gravação de um curso. A implantação valida a combinação de versões e publica os mesmos
arquivos que passaram pela verificação. Esses arquivos de distribuição, como o site
gerado e o instalador Android, são os **artefatos** da implantação. A
[arquitetura](arquitetura.md) relaciona o que cada parte executa e armazena.

O procedimento separa preparação e mudança do ambiente público. Primeiro, o diagnóstico
confere a máquina e o plano mostra o que será executado. Só a etapa de aplicação altera
o destino autorizado; depois, a verificação compara o que foi publicado com a
**candidata** aprovada — a versão submetida às verificações para publicação.

Os comandos abaixo usam [PowerShell](https://learn.microsoft.com/powershell/scripting/install/install-powershell)
no Windows. Execute-os na raiz de uma cópia atualizada
do repositório. Alguns scripts, como `deploySupabase.ps1` e os de geração Android,
chamam executáveis `*.cmd` ou `*.bat`; a presença de PowerShell em outro sistema
operacional, sozinha, não os torna portáveis. O fluxo completo pressupõe acesso
administrativo à hospedagem. Essas credenciais ficam no ambiente de administração do
servidor, separado da geração dos artefatos públicos.

## Escolher o perfil

O perfil liga o tipo de hospedagem às etapas que o procedimento precisa executar.
`scripts/planDeployment.ps1` reconhece três destinos. A hospedagem estática entrega
os arquivos do site já gerados; as operações de conta e curso continuam no backend.
No perfil local, o [Docker](https://docs.docker.com/desktop/) executa os serviços em
contêineres, ambientes isolados que
reúnem cada serviço e suas dependências:

| Perfil | Site | Backend | Uso |
| --- | --- | --- | --- |
| `GitHubPagesManagedSupabase` | [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) | projeto Supabase hospedado | publicação canônica do repositório |
| `StaticHostManagedSupabase` | hospedagem de arquivos estáticos por HTTPS | projeto Supabase hospedado | instalação em outro endereço controlado |
| `LocalDevelopment` | servidor local | serviços Supabase locais em Docker | desenvolvimento e ensaio descartável |

Para gerar o roteiro sem alterar ambiente remoto:

```powershell
pwsh -NoProfile -File .\scripts\planDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -ApplicationUrl https://fabio-ara.github.io/AraLearn/ `
  -ProjectUrl https://<project-ref>.supabase.co `
  -IncludeAndroid
```

Use HTTPS nos endereços publicados. O planejador aceita HTTP para endereços locais da
aplicação; para o projeto Supabase, essa exceção pertence ao perfil `LocalDevelopment`.
O perfil seleciona o roteiro, enquanto os endereços identificam os serviços usados.

## Diagnosticar a máquina

O diagnóstico confere as ferramentas exigidas para o destino escolhido:

| Ferramenta | Função |
| --- | --- |
| [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/install-powershell) | executa os scripts de preparação, diagnóstico e implantação |
| [Node.js 22](https://nodejs.org/en/download), npm e npx | executam as ferramentas JavaScript e instalam os pacotes de que elas dependem |
| [Git](https://git-scm.com/downloads) | identifica a versão do código e suas alterações |
| [Deno](https://docs.deno.com/runtime/getting_started/installation/) | executa os testes das funções do servidor |
| [Supabase CLI 2.115.0](https://supabase.com/docs/guides/local-development/cli/getting-started) e [Docker](https://docs.docker.com/desktop/) | preparam e executam os serviços locais descartáveis |
| [Java 17](https://developer.android.com/build/jdks) e [Android SDK](https://developer.android.com/studio/intro/update#sdk-manager) | fornecem as ferramentas necessárias para gerar o aplicativo Android |

No Windows, o relatório também informa a disponibilidade do subsistema Linux (WSL),
virtualização, espaço livre e ocupação das portas 54321 a 54324, usadas pelos serviços
locais.

Exemplo para a publicação web e Android:

```powershell
pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -Authoring -Android -RequireRuntimeConfig
```

`-RequireRuntimeConfig` exige somente a configuração que pode entrar no cliente:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

Se `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_DB_PASSWORD` estiver
presente no processo de geração dos artefatos, o diagnóstico bloqueia a continuação.
Mantenha esses segredos somente no ambiente que administra o servidor, separado da
geração dos artefatos públicos.

## Preparar o projeto Supabase hospedado

As [migrações](persistencia-relacional.md) são arquivos versionados que usam SQL,
a linguagem de manipulação do banco, para atualizar sua estrutura e, quando necessário,
seus dados. Essa estrutura, com tabelas, relações e funções, é chamada de esquema.

Para uma aplicação externa de inteligência artificial (IA) executar tarefas de autoria,
o AraLearn precisa identificar a pessoa e o acesso que ela autorizou. OAuth permite conceder esse acesso
sem entregar a senha da pessoa à aplicação. A [autoria por MCP](autoria-mcp.md) usa o
servidor OAuth do Supabase. O [canal Actions](autoria-actions.md) recebe pedidos
descritos em OpenAPI, formato que especifica as operações aceitas por uma interface
de programação (API), e possui seu próprio fluxo de autorização.

Antes de aplicar as migrações, configure no painel do Supabase:

1. Site URL do endereço público e somente os redirecionamentos realmente
   utilizados pelo site e pelo Android;
2. serviço de envio de e-mail pelo protocolo SMTP, usado na confirmação de cadastro
   e na recuperação da conta;
3. [OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server) com
   cadastro dinâmico de clientes e caminho de autorização `/` para a
   tela de consentimento do MCP no aplicativo;
4. chave assimétrica para assinar os tokens JWT, credenciais com campos que o servidor
   pode verificar; a chave privada assina, e a chave pública permite conferir a assinatura.
   O Custom Access Token Hook `public.aralearn_mcp_access_token_hook` é a função
   chamada na emissão para restringir os dados e o alcance da credencial;
5. anúncio de PKCE S256 na descoberta OAuth. Esse mecanismo vincula a troca do código
   de autorização ao verificador guardado pelo cliente que iniciou o login.

Os itens 3 a 5 configuram a autorização para o MCP. A função
`aralearn-authoring-action` implementa o OAuth de Actions com clientes registrados
pela conta AraLearn e identificados também por um segredo, chamados clientes
confidenciais. Esse fluxo não reutiliza o cadastro dinâmico nem o token do MCP.
A [referência do Supabase](supabase.md) detalha a separação das credenciais.

No [GitHub Actions](https://docs.github.com/en/actions), serviço que executa as
automações do repositório, cadastre a URL do projeto e a chave publicável como
variáveis, não como credenciais administrativas. Os segredos
necessários ao servidor ficam na configuração do projeto Supabase. A [separação entre
chaves publicáveis e secretas](supabase.md#chaves-publicáveis-e-segredos) é parte da
fronteira de segurança.

## Validar antes da publicação

A integração contínua (CI) executa verificações automatizadas quando uma solicitação
de integração (*pull request*, PR) recebe mudanças. O fluxo está em
[`validacao.yml`](../.github/workflows/validacao.yml). Cada trabalho da automação é um
*job*; uma verificação exigida para prosseguir é um *gate*. O manifesto da candidata
identifica os arquivos e resultados que poderão seguir para publicação. Recibos
produzidos por testes locais registram aquelas execuções, com alcance distinto do
certificado que reúne as provas exigidas para a candidata inteira.

Cada versão salva no Git, chamada de commit, tem um identificador SHA. A certificação
registra os commits de origem e de destino da comparação para que uma prova continue
ligada ao código que foi examinado. As alterações são desenvolvidas em linhas de
trabalho separadas, chamadas branches; `main` é a linha das versões integradas.

Durante o desenvolvimento, execute primeiro os testes do comportamento alterado. O
executor de testes aceita nomes de arquivos explícitos; ele rejeita caminhos
desconhecidos e seleção vazia:

```powershell
npm.cmd run test:focal -- tests/runtime/ci-path-classification.test.js
npm.cmd run test:authoring:contract
```

Quando um formato ou operação compartilhada muda, teste também os componentes que o
produzem e consomem. Segurança, migrações, sincronização e banco exigem também a
integração pertinente. A publicação exige o conjunto de verificações selecionado
para a candidata. Documentação reconhecida recebe auditorias documentais. Contratos de
autoria, documentos gerados para clientes, caminhos desconhecidos, dependências e CI
ampliam o alcance. O [guia de desenvolvimento](guia-desenvolvedor.md#testes-e-integração)
explica como selecionar testes, preparar a candidata e reaproveitar resultados válidos.

Os artefatos publicáveis são os arquivos do site e o APK, arquivo instalável do
Android. O certificado indica quais deles fazem parte da alteração:

| Momento | Gatilho e prova | Artefato | Publicação |
| --- | --- | --- | --- |
| Desenvolvimento | testes focais afetados; solicitação em rascunho executa preparação inicial | recibos locais ignorados pelo Git | nenhuma |
| Documentação pura | PR e auditorias documentais | certificado sem arquivos de site ou aplicativo para publicar | nenhuma |
| Candidata estável | `candidate:ready` marca o PR como pronto após provas locais; CI executa os gates aplicáveis; acionamento manual somente na `main` para recuperação | certificado e artefatos aplicáveis | nenhuma |
| Promoção | fases de `pages.yml` na `main`, com execução e tentativa exatas | site e/ou APK somente quando declarados pelo certificado | preserva os artefatos preparados, publica os arquivos aplicáveis e finaliza após as provas reais |

Na candidata estabilizada, `validate:candidate` prepara as verificações locais conforme
o impacto. Banco e integração com Supabase ficam no job próprio da CI, em ambiente
descartável. Para web, a preparação executa os arquivos alterados de testes comuns
de navegador; os testes focais afetados indiretamente são escolhidos durante o
desenvolvimento. A CI usa a
mesma classificação para decidir quais trabalhos de web, Android e Supabase executar.

O classificador compara semanticamente alterações que tratam apenas da versão em npm,
OpenAPI e Android. Alterações de dependências, configuração ou orquestração conservam
um alcance amplo, assim como caminhos desconhecidos e classificações inconclusivas.
“Documentação pura” designa os caminhos reconhecidos por esse classificador:
documentos de contratos, arquivos em `.github/` e o README Android, por exemplo,
recebem o tratamento da área à qual pertencem. Consulte o plano antes de estimar a
validação de uma mudança textual.

`candidate:ready` usa a preparação aprovada. Ele confere que arquivos, configuração,
dependências e base da comparação permanecem iguais aos verificados. O commit local
corrente (HEAD) deve coincidir com o remoto, todos os arquivos precisam estar salvos
no Git e o PR ainda deve estar em rascunho, com `main` como destino. Um relatório
ausente ou desatualizado exige nova preparação.
Os recibos locais permitem reutilizar provas com entradas idênticas; banco e
integração recebem uma execução nova no ambiente descartável da CI.

O GitHub reúne os resultados na única verificação obrigatória **Testar e validar**. O
classificador registra quais trabalhos são obrigatórios num quadro chamado matriz de
aplicabilidade, vinculado aos SHAs de base e de origem do PR. Cada gate aplicável
precisa terminar com sucesso. Um job só recebe `not_applicable` quando a mesma matriz
o dispensou e o GitHub o registrou como pulado. Falha, cancelamento, ausência ou
resultado ambíguo nunca viram dispensa. O certificado registra
a matriz, os resultados, os artefatos e as ferramentas aplicáveis. A regra da branch
continua exigindo o check agregado para permitir integração.

Um PR em rascunho que exige testes integrais executa apenas a preparação inicial.
A verificação obrigatória permanece sem aprovação enquanto essas provas estão
omitidas. O evento `ready_for_review`, emitido ao retirar a solicitação do rascunho,
libera os trabalhos aplicáveis. `synchronize` preserva essa seleção para PRs já prontos;
retorne a rascunho antes de enviar correções ainda em desenvolvimento. O controle de
concorrência cancela a execução superada da mesma referência. O acionamento manual de
uma execução não deve duplicar esse caminho na branch da solicitação.

A preparação comum reúne auditorias e verificadores. Web, Android e Supabase são jobs
separados e só executam quando a matriz os exige. Cópias reutilizáveis das dependências
de npm, Chromium e Gradle, chamadas de *caches*, evitam baixar os mesmos arquivos
novamente. Os testes continuam sendo executados conforme a candidata. A promoção só
aceita o certificado e os bytes exatos da candidata, sem reconstruir Pages nem repetir
suítes por estar publicando.

Instale exatamente as dependências fixadas:

```powershell
npm.cmd ci
```

O validador escolhe o alcance pelo artefato:

```powershell
pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Core
pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Web -RequireRuntimeConfig
pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Full -RequireRuntimeConfig
```

`Core` verifica contratos e código de execução sem publicar. `Web` acrescenta a geração
e o teste do mesmo artefato do site. `Full` acrescenta Android; a integração Supabase
local permanece uma prova própria. Esses comandos são úteis quando a prova local
integral é necessária; não precisam ser repetidos após a CI integral válida para a mesma
candidata. Os verificadores de artefato examinam a configuração pública, as restrições
de carregamento de recursos da página, o manifesto e os arquivos. Também procuram
segredos e catálogos de cursos que não devem ser incluídos na distribuição.
Testes demonstram os cenários exercitados; mudanças visuais ainda exigem inspeção no
produto real.

Para o ambiente local descartável:

```powershell
npx.cmd --yes supabase@2.115.0 start
npx.cmd --yes supabase@2.115.0 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

Na validação funcional, o ambiente local de execução das funções usa
`edge_runtime.policy = "per_worker"`, recomendado pela
[Supabase para testes de carga](https://supabase.com/docs/guides/local-development/cli/config#edge_runtime.policy).
Assim, cada processo de execução, chamado *worker*, pode atender a vários pedidos
sem ser recriado a cada chamada. O teste usa uma cópia isolada e imutável das funções.
Durante o desenvolvimento manual, reinicie `functions serve` após alterar o código
para conferir a nova versão. Os testes de integração aguardam até 30 segundos pela
gravação e pela releitura que confirmam o resultado; a espera não altera o resultado
que cada caso exige.

O reset local recria o banco e aplica os dados de teste (*seed*). O projeto hospedado
nunca recebe seed nem reset pelo procedimento de promoção.

## Simular e aplicar o backend

O modo padrão de `deploySupabase.ps1` é somente leitura em relação ao esquema: ele liga
o repositório ao projeto escolhido, lista migrações e executa `db push --dry-run`, que
mostra as migrações pendentes sem aplicá-las.

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co
```

Revise o destino e a simulação. Para aplicar migrações e publicar as três funções
remotas, chamadas Edge Functions:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co `
  -Mode Apply -DeployAuthoringFunctions `
  -PublicAppUrl https://<endereco-da-aplicacao>/
```

O script só prossegue depois da confirmação literal `APLICAR`. Ele executa `db push` sem
seed ou reset, repete a lista, executa o analisador do banco, configura origens e publica:

- `aralearn-authoring-mcp`;
- `aralearn-course-api`;
- `aralearn-authoring-action`.

Uma origem reúne protocolo, domínio e porta de um endereço. As origens mínimas da
aplicação são o servidor local, GitHub Pages e
`https://appassets.androidplatform.net`. Uma instalação alternativa acrescenta somente
suas origens HTTPS exatas pelo parâmetro `-AllowedOrigin`, por exemplo:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co `
  -Mode Apply -DeployAuthoringFunctions `
  -PublicAppUrl https://app.exemplo.org/ `
  -AllowedOrigin https://app.exemplo.org
```

`PublicAppUrl` define o endereço de retorno e navegação; `AllowedOrigin` acrescenta
a origem à política CORS, que permite ao navegador ler as respostas de outro serviço.
Actions admite também as origens `https://chatgpt.com` e `https://chat.openai.com`.
O script testa os pedidos preliminares usados pelo navegador para consultar essa
permissão, chamados de *preflight*, na API de cursos e em cada origem oficial de
Actions. Também confere OAuth, inicialização e descoberta de ferramentas do MCP
hospedado. O acesso autenticado a documentos anexados é exercitado pela prova de
integração da implantação, separada desse script.

O endereço de retorno de Actions após a autorização (*callback*) precisa usar HTTPS,
um desses dois domínios e o formato `/aip/g-.../oauth/callback`. O redirecionamento
efetivamente apresentado pelo cliente é registrado e precisa coincidir nas etapas
seguintes do OAuth; o caminho não é
reconstruído a partir de outro identificador do GPT.

O [manifesto do serviço](../supabase/runtime-manifest.json) identifica a revisão e as
capacidades exigidas pela interface. Compare-o com o histórico de migrações do banco
e com o manifesto remoto. A revisão do manifesto e a última migração precisam
coincidir também no ensaio de restauração.

A [história do esquema](schema-change-log.md) registra o que cada mudança transforma
e quais cuidados exige. Por exemplo, um reparo de referências curriculares em cópias
existentes altera dados úteis: requer backup atual, restauração e ensaio de
preservação antes da aplicação hospedada. Referências ambíguas precisam impedir o
reparo, preservando conteúdo, fontes, arquivos, observações e permissões.

O documento OpenAPI precisa ser reimportado no cliente de Actions quando seu conteúdo
muda; uma correção interna do vínculo OAuth não exige essa reimportação.

```powershell
npm.cmd run deployment:verify-hosted
```

Essa prova confronta o contrato remoto. Ela deve passar antes de publicar um cliente que
dependa da nova revisão.

## Publicar o site

`npm run pages:build` gera o diretório `.pages` a partir das mesmas fontes validadas.
Ele contém HTML, CSS, módulos JavaScript, o manifesto de recursos, a configuração
pública e o documento OpenAPI de Actions. Dados de cursos e credenciais secretas
permanecem fora do artefato.

A automação (*workflow*) [`pages.yml`](../.github/workflows/pages.yml) coordena a
publicação em três fases. Nesse fluxo, promoção é a passagem de uma versão validada para
o ambiente público; enviar commits ao repositório não inicia essa passagem. Depois da
integração, a fase de preparação recebe os identificadores da execução protegida e de
sua tentativa no GitHub. Assim, um sucesso antigo ou de outra candidata não pode ser
usado por engano. Os artefatos são preparados enquanto o serviço remoto e o site
publicado ainda permanecem compatíveis. Os comandos usam a
[GitHub CLI](https://cli.github.com/manual/), autenticada para o repositório:

```powershell
gh workflow run pages.yml --ref main `
  -f phase=preparar `
  -f candidate_run_id=<run-protegido> -f candidate_run_attempt=<tentativa>
```

O [publicador da candidata](../scripts/releaseCandidate.mjs), `releaseCandidate.mjs`,
confere se as etapas obrigatórias passaram e se a execução pertence ao PR integrado.
Também compara o código, as dependências e a configuração com a revisão validada,
incluindo o manifesto do serviço.

Para conferir os arquivos, calcula impressões digitais dos bytes, chamadas de hashes.
O arquivo baixado precisa corresponder ao hash SHA-256 registrado pelo GitHub, e cada
arquivo extraído precisa corresponder ao manifesto. Uma origem em outro repositório
(*fork*), uma revisão superada ou um artefato expirado impede a promoção. O publicador
reúne a conferência da origem e a comparação dos arquivos. A comparação considera as
quebras de linha próprias de Windows e Linux nos arquivos de código; os bytes
do APK e dos demais artefatos precisam ser idênticos.

O manifesto registra separadamente o commit testado e o commit resultante da integração
(*merge*). Uma integração com SHA diferente só reutiliza a
prova quando o conteúdo dos arquivos e a configuração são iguais; a relação com o PR
também é conferida. Se essa equivalência não puder ser comprovada, execute a validação
protegida na revisão integrada antes de tentar promovê-la. O publicador recupera somente
Pages e Android declarados aplicáveis e reutiliza seus bytes testados; uma dispensa
explícita é distinta de artefato aplicável ausente, que continua sendo erro.

Concluídos a preparação, o backup e os ensaios de restauração pertinentes, aplique o
backend e publique prontamente o site a partir daquele registro exato de execução:

```powershell
gh workflow run pages.yml --ref main `
  -f phase=publicar_site `
  -f promotion_run_id=<run-preparar> -f promotion_run_attempt=<tentativa>
```

Essa fase recupera os artefatos e a prova de instalação e atualização do Android,
sem recompilar nem executar novamente o emulador. Depois de conferir o backend,
publica o site e conserva o instalador Android numa **Release** em rascunho, a página
de distribuição de uma versão no GitHub, conforme os artefatos aplicáveis.
A conferência do backend registra sua condição após a atualização. O manifesto e o
recibo originais continuam identificando os arquivos que foram preparados e testados.

Depois das jornadas e provas reais requeridas da mesma candidata, finalize usando a
execução que publicou o site:

```powershell
gh workflow run pages.yml --ref main `
  -f phase=finalizar_release `
  -f promotion_run_id=<run-publicar-site> -f promotion_run_attempt=<tentativa>
```

A finalização revalida origem, bytes, backend, Pages e prova nativa existente antes de
tornar a Release pública. O APK, seu arquivo de soma de verificação e o recibo na
Release precisam ser idênticos aos três arquivos do conjunto que a prova nativa
examinou. Antes de acionar a finalização, confira e registre também os resultados
dos percursos de uso exigidos. Uma falha material precisa ser resolvida antes da
conclusão da entrega.

O verificador hospedado confirma versão, tamanho e SHA-256 de todos os arquivos do site,
inclusive binários. Também confere o tipo informado para cada arquivo (MIME), que
orienta sua interpretação pelo navegador, e a política de segurança de conteúdo (CSP),
que restringe de onde a página pode carregar ou executar recursos. Configuração e
retorno de autenticação integram a mesma verificação:

```powershell
node scripts/verifyPublishedSite.mjs `
  --url https://fabio-ara.github.io/AraLearn/ `
  --candidate-manifest .candidate/candidate.json
```

Em outra hospedagem estática, envie o conteúdo de `.pages`, preserve caminhos e tipos
MIME e sirva tudo por HTTPS. A verificação básica continua disponível:

```powershell
npm.cmd run deployment:verify-site -- --url https://<endereco-da-aplicacao>/
```

O verificador consulta recursos, MIME, política de conteúdo, configuração pública e
o retorno de autenticação protegido por PKCE. Complete a prova percorrendo autenticação,
estudo, autoria, retorno da conexão e funcionamento sem rede com uma conta autorizada.

## Gerar e verificar o Android

O APK empacota a mesma aplicação web numa
[WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview),
componente Android que exibe e executa a interface web dentro do aplicativo. O processo
de geração para publicação exige HTTPS e assinatura. A [assinatura do
aplicativo](https://developer.android.com/studio/publish/app-signing) precisa conservar
a mesma identidade para que instalações anteriores aceitem a atualização.

```powershell
npm.cmd run android:release
pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Android -RequireRuntimeConfig
```

O workflow [`android-release.yml`](../.github/workflows/android-release.yml) só pode ser
chamado pelo coordenador. Ele recebe o manifesto aprovado, exige configuração e
assinatura explícitas, confere os arquivos da aplicação dentro do APK e preserva o
certificado de assinatura usado nas versões anteriores. A suíte e a análise estática
do código (*lint*) já aprovadas não são repetidas no publicador. O
APK assinado, sua identidade e sua configuração continuam sendo provas próprias.

O APK, seu arquivo `.sha256` e o manifesto de procedência ficam primeiro nos
artefatos imutáveis da preparação. Antes de atualizar o ambiente público, o job
`android-native` instala esses mesmos arquivos em dois cenários isolados de um
emulador descartável, executado no Ubuntu 24.04: instalação limpa da candidata e
atualização (*upgrade*) do APK público 0.0.67 (código 213).

O ensaio confere pacote, certificado, versão e SHA-256. Também acompanha o identificador
de usuário Android atribuído à instalação (UID), necessário para verificar se a
atualização preservou a identidade do aplicativo. A versão candidata vem do manifesto
aprovado e deve avançar em relação à base.

Também é conferida a conservação do tema escolhido depois de fechar, reabrir e atualizar
o aplicativo. O [procedimento Android](../android/README.md#verificação-automatizada-de-instalação-e-atualização)
descreve a preparação do emulador e as ações verificadas. Dispositivo físico,
retenção de curso e sessão autenticada exigem jornadas próprias.

O registro da prova usa JSON, formato de dados estruturados, na versão v2 do contrato.
Ele liga o APK ao manifesto e à execução exata da promoção. Capturas de tela e descrições
da hierarquia da interface em XML também têm seus hashes conferidos.

As fases de publicação do site e da Release recuperam essa prova pelo identificador,
verificam o hash e reconferem o APK. Na retomada, consultam a execução e a tentativa
originais no GitHub. Precisam corresponder ao mesmo repositório, workflow, branch
`main` e SHA, com conclusão das etapas obrigatórias, inclusive a prova nativa.

Os artefatos são mantidos por sete dias, incluindo diagnósticos técnicos de falha sem
tokens. Ausência, expiração ou divergência impedem a reutilização. Quando a origem e
os arquivos continuam válidos, a prova é reaproveitada sem nova execução do emulador.

O coordenador só torna a Release pública na fase final, depois de conferir backend,
teste nativo de instalação e atualização, Pages e jornadas reais requeridas. As notas
são geradas a partir das mudanças da versão. As jornadas conectadas continuam separadas:
em dispositivo descartável ou autorizado, confira login, retomada, área segura, teclado,
rolagem, documentos anexados, exportação e assistência por IA. Nos cenários de
interface, respostas simuladas e determinísticas dos provedores tornam o resultado
reproduzível; a disponibilidade dos serviços reais exige conferência própria. O guia
[Aplicativo Android](../android/README.md) explica assinatura, retorno móvel, rede e recuperação da
geração do APK.

## Ordem segura de promoção

Para GitHub Pages com Supabase hospedado, a sequência é:

1. diagnosticar a máquina e gerar o plano do destino;
2. configurar autenticação, envio de e-mail, redirecionamentos, OAuth, hook e variáveis públicas;
3. simular as migrações;
4. validar repositório e artefatos sem publicar;
5. integrar a revisão aprovada e confirmar os checks do SHA exato;
6. executar `preparar`: assinar o APK e provar instalação/upgrade nativos sem mudar o backend publicado;
7. concluir backup/restauração pertinente, aplicar migrações e publicar as Edge Functions;
8. executar `publicar_site`: verificar backend e prova já produzida, publicar os bytes
   Pages e guardar o APK em rascunho;
9. executar as jornadas críticas e provas reais de cliente da candidata;
10. executar `finalizar_release`: revalidar os artefatos e publicar a Release/APK correspondente.

O plano de transição entre versões precisa definir como os clientes instalados
funcionarão enquanto o backend e o site são atualizados, incluindo o tratamento
daqueles que ficarem incompatíveis. Cada serviço confirma sua própria atualização; uma interrupção exige conferir essas confirmações
antes de retomar. Preparar os arquivos antes da atualização retira a
compilação e o emulador dessa janela, mas os serviços ainda podem terminar em momentos
diferentes. Clientes instalados também precisam receber a nova versão.

Mudanças de contrato exigem atenção às sessões e instalações existentes. A
introdução de explicações e de revisão por objeto, por exemplo, alterou os metadados
aceitos por leitores e exportações anteriores. Consulte os contratos da candidata e o
[histórico de migrações](schema-change-log.md) para definir quais clientes precisam
ser atualizados. A conferência do manifesto identifica a compatibilidade exigida; a
atualização do cliente leva essa capacidade à sessão da pessoa.

O backend é aplicado pelo procedimento autorizado de `deploySupabase.ps1`, sem
introduzir credencial administrativa nos trabalhos de geração dos artefatos. A promoção
registra e reconfere o esquema, conjunto de recursos, contratos de MCP/Actions e
fronteira OAuth do verificador hospedado. Essa prova não calcula o hash de todos os
bytes das Edge Functions nem substitui a prova da API de cursos e dos clientes reais.
Essas verificações, a preservação dos dados e sua possibilidade de recuperação fazem
parte da implantação hospedada e precisam estar concluídas antes de anunciar a entrega.

## Falhas e recuperação

Uma nova tentativa da fase apropriada usa a origem exata enquanto seus artefatos
estiverem disponíveis. A retomada de site/finalização conserva a preparação aprovada,
reconhece o site já correspondente e reutiliza o APK. Ela completa somente os arquivos
de publicação ausentes e verifica os existentes. Uma tag é o nome que marca a versão
no Git. Se ela já corresponde à candidata, mas falta a Release, a retomada cria o
rascunho. Uma tag ou um arquivo divergente interrompe a operação, em vez de ser
substituído. O rascunho permanece visível apenas para quem tem acesso enquanto alguma parte ainda falha; não
constitui conclusão da publicação. Essa retomada é do workflow de promoção. As provas
aplicáveis e as dispensas certificadas precisam pertencer à mesma tentativa: repetir
somente um trabalho de validação não reúne automaticamente provas de tentativas
diferentes. Uma nova candidata deve produzir o conjunto exigido e seus artefatos
vinculados antes de ser promovida.

Uma falha antes de `db push` não altera o esquema. Depois de uma resposta ambígua, liste
migrações e confronte o manifesto antes de repetir. Migrações versionadas não devem ser
desfeitas por edição retroativa; corrija o estado com uma nova migração ou restaure um
backup quando a perda exigir retorno do banco.

Backup do PostgreSQL não inclui automaticamente objetos do Storage. A política
operacional precisa conservar e verificar os dois conjuntos. Código, site e APK são
recuperados pelo Git e por uma release anterior; dados são recuperados por cópia de
segurança do ambiente. A recuperação do aplicativo Android conserva a chave de
assinatura para permitir a atualização das instalações existentes.

Antes de atualizar um banco restaurado, confira os proprietários do banco, dos
esquemas e dos objetos, as permissões e as associações entre papéis. Um papel define os direitos com
que uma operação é executada no PostgreSQL. As migrações devem usar o mesmo papel da
implantação, sem permissões extras herdadas do ambiente de ensaio.

Confira também a codificação e as regras de comparação e ordenação de texto
(*collation*), incluindo provedor, localidade e versão. Essas condições podem afetar
como o banco interpreta e compara os dados restaurados.

Uma restrição `CHECK` verifica se cada linha satisfaz uma regra do banco. Se a regra
consultar um catálogo salvo, restaure o catálogo antes das linhas dependentes,
conservando todas as entradas da cópia de segurança e a própria restrição.
A ferramenta [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)
restaura arquivos de cópia do PostgreSQL, chamados *dumps*, e aceita um índice que
controla a ordem dos itens. No AraLearn, mova apenas a entrada
`TABLE DATA private course_design_parameter_definitions`
do índice obtido por `pg_restore --list backup.dump` para antes das entradas de dados de
`authoring_profiles`, `authoring_process_preferences` e `course_design_parameter_assignments`.
Passe o índice completo reordenado com `pg_restore --use-list=restauracao.list backup.dump`, conservando
os demais argumentos de autenticação, propriedade e destino adequados ao ambiente.
O dump no formato *custom* do PostgreSQL precisa estar disponível como arquivo local:
a ordem alterada exige buscar blocos anteriores da cópia. Transfira o arquivo completo
antes de executar `pg_restore`. Recebê-lo sequencialmente pela saída de outro comando,
por um *pipe*, impede essa busca. A função `orderCourseBackupRestoreList` de
[`verifyBackupRestoreUpgrade.mjs`](../scripts/verifyBackupRestoreUpgrade.mjs) realiza essa
mesma ordenação no ensaio automatizado. Ela preserva todos os itens e restrições; após
restaurar, confira dados, permissões, manifesto e arquivos do Storage antes da atualização.

Se o site foi publicado antes do backend compatível, interrompa a promoção e recupere
o artefato anterior compatível pelo fluxo de publicação. Se o backend novo já foi
aplicado, investigue os contratos e os dados antes de escolher entre uma correção
progressiva e a restauração. O plano de recuperação precisa identificar o par de
versões que voltará a operar em conjunto.
