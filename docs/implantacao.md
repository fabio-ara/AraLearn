# Implantação

Uma instalação do AraLearn reúne o serviço remoto, o site e, quando necessário, o
aplicativo Android. O [Supabase](supabase.md) fornece o banco de dados, a autenticação e
o armazenamento de arquivos; esse conjunto é o backend. O site e o Android executam a
interface e guardam no dispositivo o conteúdo de estudo já carregado.

Os três precisam usar versões compatíveis. Por exemplo, publicar uma interface que
depende de uma nova operação do servidor antes de instalar essa operação pode impedir a
gravação de um curso. A implantação valida a combinação de versões e publica os mesmos
arquivos que passaram pela verificação.

O repositório oferece diagnóstico, planejamento, aplicação e verificação como etapas
separadas. O diagnóstico confere ferramentas e configuração da máquina; o plano lista as
operações necessárias; a aplicação altera o destino autorizado; a verificação compara os
arquivos e contratos publicados com os esperados.

Os comandos abaixo usam PowerShell. Execute-os na raiz de uma cópia atualizada do
repositório. O fluxo completo pressupõe acesso administrativo à hospedagem; essas
credenciais são usadas apenas na operação do servidor, nunca incorporadas ao site ou ao
Android.

## Escolher o perfil

`scripts/planDeployment.ps1` reconhece três destinos:

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

O perfil de hospedagem estática exige HTTPS. HTTP é aceito somente em `localhost` no
perfil local.

## Diagnosticar a máquina

Para executar os scripts, são necessários [PowerShell
7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell),
[Node.js 22](https://nodejs.org/en/download), npm e npx, ferramentas de instalação e
execução de pacotes fornecidas pelo Node.js, e [Git](https://git-scm.com/downloads). Os
testes de autoria remota acrescentam
[Deno](https://docs.deno.com/runtime/getting_started/installation/), ambiente que
executa as funções do servidor. Os serviços locais são executados em contêineres,
ambientes isolados que reúnem cada serviço e suas dependências. Eles exigem [Supabase CLI
2.115.0](https://supabase.com/docs/guides/local-development/cli/getting-started) e
[Docker](https://docs.docker.com/desktop/); no Windows, o relatório também informa a
disponibilidade do subsistema Linux (WSL), virtualização, espaço livre e ocupação das
portas 54321 a 54324. Gerar o Android acrescenta [Java
17](https://developer.android.com/build/jdks) e o [Android
SDK](https://developer.android.com/studio/intro/update#sdk-manager).

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
Segredo administrativo não pertence ao site, ao APK, ao Git nem a log público.

## Preparar o projeto Supabase hospedado

As [migrações](schema-change-log.md) são arquivos SQL versionados que atualizam o
esquema e, quando necessário, os dados do banco. Antes de aplicá-las, configure no
painel do Supabase:

1. Site URL do endereço público e somente os redirecionamentos realmente
   utilizados pelo site e pelo Android;
2. entrega de e-mail e SMTP adequados ao ambiente, pois cadastro, confirmação e
   recuperação dependem deles;
3. [OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server) com
   cadastro dinâmico de clientes e caminho de autorização `/` para a
   tela de consentimento do MCP no aplicativo;
4. chave assimétrica para assinar as credenciais JWT, cujos campos o servidor pode
   verificar; a chave de assinatura fica separada da chave pública de verificação.
   O Custom Access Token Hook `public.aralearn_mcp_access_token_hook` é a função
   chamada na emissão para restringir os dados e o alcance da credencial;
5. anúncio de PKCE S256 na descoberta OAuth, para que a troca do código de
   autorização exija o verificador do cliente que iniciou o login.

OAuth permite autorizar um cliente sem lhe entregar a senha da conta. Os itens 3 a 5
configuram esse fluxo para o MCP; [Supabase](supabase.md) e [autoria por
MCP](autoria-mcp.md) explicam a separação das credenciais. O OAuth de Actions é
implementado pela função `aralearn-authoring-action`, com clientes confidenciais
registrados pela conta AraLearn; ele não reutiliza o cadastro dinâmico nem o token do
MCP.

Em [GitHub Actions](https://docs.github.com/en/actions), cadastre a URL do projeto e a
chave publicável como variáveis, não como credenciais administrativas. Os segredos
necessários ao servidor ficam na configuração do projeto Supabase. A [separação entre
chaves publicáveis e secretas](supabase.md#chaves-publicáveis-e-segredos) é parte da
fronteira de segurança.

## Validar antes da publicação

A integração contínua (CI) executa verificações quando uma solicitação de integração
recebe mudanças. O fluxo está em [`validacao.yml`](../.github/workflows/validacao.yml).
Uma candidata é a versão separada para avaliação; seu manifesto registra os arquivos e
resultados que podem ser usados posteriormente na publicação. Um recibo local guarda o
resultado de uma operação, mas não substitui esse manifesto.

Durante o desenvolvimento, execute primeiro os testes do comportamento alterado. O
executor de testes aceita nomes de arquivos explícitos; ele rejeita caminhos
desconhecidos e seleção vazia:

```powershell
npm.cmd run test:focal -- tests/runtime/ci-path-classification.test.js
npm.cmd run test:authoring:contract
```

Quando um formato ou operação compartilhada muda, teste também os componentes que o
produzem e consomem. Segurança, migrações, sincronização e banco exigem também a
integração pertinente; um teste isolado não substitui a validação necessária à
publicação. Documentação reconhecida recebe auditorias documentais. Contratos de
autoria, documentos gerados para clientes, caminhos desconhecidos, dependências e CI
ampliam o alcance.

| Momento | Gatilho e prova | Artefato | Publicação |
| --- | --- | --- | --- |
| Desenvolvimento | impacto e `validate:candidate`; solicitação em rascunho executa preparação inicial | recibos locais ignorados pelo Git | nenhuma |
| Documentação pura | PR e auditorias documentais | sem manifesto publicável | nenhuma |
| Candidata estável | `candidate:ready` libera a solicitação após provas locais; validação integral em Windows e Supabase; acionamento manual somente na `main` para recuperação | site testado, APK de depuração e manifesto de aprovação | nenhuma |
| Promoção | fases de `pages.yml` na `main`, com execução e tentativa exatas | Pages aprovado e APK assinado verificado | preparação imutável; corte e Pages; finalização após provas reais |

O GitHub reúne os resultados na verificação obrigatória **Testar e validar**. Para uma
candidata com mudanças funcionais, seu sucesso depende das provas **Testar web e
Android**, **Testar Supabase local** e **Preparar candidata**. Falha, cancelamento ou
omissão de prova aplicável impede seu sucesso. Somente a validação integral produz o
manifesto publicável. A regra da branch exige esse resultado para permitir integração.

Uma solicitação de integração (*pull request*, PR) em rascunho com mudança não
documental executa apenas a preparação inicial; a verificação obrigatória não aprova uma
validação integral omitida. O evento `ready_for_review`, emitido ao retirar a
solicitação do rascunho, libera os trabalhos completos. `synchronize` preserva a
integral para PRs já prontos; retorne a rascunho antes de enviar correções ainda em
desenvolvimento. O controle de concorrência cancela a execução superada da mesma
referência. O acionamento manual de uma execução não deve duplicar esse caminho na
branch da solicitação.

A preparação comum executa auditorias e verificadores antes dos dois trabalhos mais
demorados: web/Android e Supabase local. O trabalho web testa o código de execução sem
repetir essa preparação. Os caches de npm, Chromium e Gradle reaproveitam downloads
compatíveis com a plataforma e o arquivo de dependências fixadas (`package-lock.json`).
Eles economizam transferência; os testes continuam necessários. A integração habilita
cenários adicionais no mesmo conjunto de serviços locais e no processo de funções já
preparado. Recibos locais e provas parciais não são aceitos pela promoção como manifesto
de aprovação integral.

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
integral é necessária; não precisam ser repetidos após o CI integral válido para a mesma
candidata. Os verificadores de artefato examinam configuração pública, política de
conteúdo, segredos, manifesto, recursos e ausência de catálogo de cursos embutido.
Testes demonstram os cenários exercitados; mudanças visuais ainda exigem inspeção no
produto real.

Para o ambiente local descartável:

```powershell
npx.cmd --yes supabase@2.115.0 start
npx.cmd --yes supabase@2.115.0 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

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
seed ou reset, repete a lista, roda o analisador do banco, configura origens e publica:

- `aralearn-authoring-mcp`;
- `aralearn-course-api`;
- `aralearn-authoring-action`.

As origens mínimas da aplicação são o servidor local, GitHub Pages e
`https://appassets.androidplatform.net`. Uma instalação alternativa acrescenta somente
suas origens HTTPS exatas. Actions admite também apenas `https://chatgpt.com` e
`https://chat.openai.com`. O script verifica o preflight da API e de cada origem oficial
de Actions, além do OAuth, da inicialização e da descoberta de ferramentas do MCP
hospedado. A jornada autenticada de PDF pertence à prova de integração do corte; esse
script não a executa.

O callback de Actions precisa usar HTTPS, um desses dois hosts e o formato
`/aip/g-.../oauth/callback`. O redirect efetivamente apresentado pelo cliente é
registrado e precisa coincidir nas etapas seguintes do OAuth; o caminho não é
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

O OpenAPI precisa ser reimportado no cliente de Actions quando o próprio documento
muda; uma correção interna do vínculo OAuth não exige essa reimportação.

```powershell
npm.cmd run deployment:verify-hosted
```

Essa prova confronta o contrato remoto. Ela deve passar antes de publicar um cliente que
dependa da nova revisão.

## Publicar o site

`npm run pages:build` gera `.pages` a partir das mesmas fontes validadas. O artefato
contém HTML, CSS, módulos JavaScript, manifesto de recursos, configuração pública e o
documento OpenAPI de Actions. Não contém cursos, chave secreta nem credencial de
provedor.

A automação (*workflow*) [`pages.yml`](../.github/workflows/pages.yml) coordena a
publicação em três fases. Nesse fluxo, promoção é a passagem de uma versão validada para
o ambiente público. O envio de commits ao repositório não inicia a publicação. Após
integrar a candidata, prepare os artefatos enquanto o serviço remoto e o site publicados
continuam compatíveis. Informe a execução integral e sua tentativa, ambas identificadas
no GitHub. Uma execução recente com sucesso não substitui a identificação da candidata
validada. Os comandos usam a [GitHub CLI](https://cli.github.com/manual/), autenticada
para o repositório:

```powershell
gh workflow run pages.yml --ref main `
  -f phase=preparar `
  -f candidate_run_id=<run-integral> -f candidate_run_attempt=<tentativa>
```

`releaseCandidate.mjs` confere origem, conclusão dos trabalhos e das etapas
obrigatórias, vínculo com o PR integrado, conteúdo da revisão Git, arquivo de
dependências fixadas, configuração e manifesto do serviço e resumos criptográficos.
Artefatos expirados, forks, revisões superadas e divergências são recusados. O download
precisa corresponder ao resumo SHA-256 registrado pelo GitHub e cada arquivo precisa
corresponder ao manifesto.

Um hash é uma impressão digital usada para conferir se os bytes mudaram. O
publicador compara o código e a configuração com a revisão validada, e os
artefatos com os arquivos registrados no manifesto. A comparação considera as
quebras de linha próprias de Windows e Linux nos arquivos de código; os bytes
do APK e dos demais artefatos precisam ser idênticos. As regras são verificadas
pelo [publicador da candidata](../scripts/releaseCandidate.mjs).

Cada commit Git tem um identificador SHA. O manifesto registra separadamente o commit
testado e o commit resultante da integração. Um merge com SHA diferente só reutiliza a
prova quando o conteúdo dos arquivos e a configuração são iguais; a relação com o PR
também é conferida. Se essa equivalência não puder ser comprovada, execute a validação
integral na revisão integrada antes de tentar promovê-la. O publicador reutiliza os
bytes Pages testados, sem gerar novamente os arquivos.

Concluída a preparação e os cuidados de backup/restauração, aplique o backend e publique
prontamente o site a partir daquele registro exato de execução:

```powershell
gh workflow run pages.yml --ref main `
  -f phase=publicar_site `
  -f promotion_run_id=<run-preparar> -f promotion_run_attempt=<tentativa>
```

Essa fase recupera artefatos e prova nativa pela origem, sem recompilar ou abrir o
emulador. Verifica o backend já aplicado, publica Pages e conserva a Release em
rascunho. A prova de backend fica separada do manifesto e do recibo imutáveis que
identificaram o APK testado; preparar os bytes não declara backend pronto.

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
examinou; coerência apenas entre os arquivos remotos não basta. Acionar o workflow não
comprova a execução dos percursos de uso: seus resultados precisam ser conferidos e
registrados antes dele. Falha material mantém a entrega incompleta.

O verificador hospedado confirma versão, tamanho e SHA-256 de todos os arquivos do site,
inclusive binários, além do tipo informado para cada arquivo (MIME), da política de
segurança de conteúdo (CSP), da configuração e do retorno de autenticação:

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
retorno PKCE. Complete a prova percorrendo autenticação, estudo, autoria, retorno da
conexão e funcionamento sem rede com uma conta autorizada.

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
certificado histórico. A suíte e o lint já aprovados não são repetidos no publicador. O
APK assinado, sua identidade e sua configuração continuam sendo provas próprias.

O APK, seu arquivo `.sha256` e o manifesto de procedência ficam primeiro nos
artefatos imutáveis da preparação. Antes do corte, o job `android-native` instala esses bytes
exatos em dois cenários isolados de um emulador descartável na máquina de execução Ubuntu
24.04. Ele confere
pacote, certificado, versão, SHA-256 e o identificador do usuário Android
atribuído à instalação (UID): instalação limpa da candidata e
upgrade do APK público 0.0.67 (código 213). A versão candidata vem do manifesto
aprovado e deve avançar em relação à base.

O ensaio confere a conservação do tema escolhido depois de fechar, reabrir e atualizar
o aplicativo. O [procedimento Android](../android/README.md#verificação-automatizada-de-instalação-e-atualização)
descreve a preparação do emulador e as ações verificadas. Dispositivo físico,
retenção de curso e sessão autenticada exigem jornadas próprias.

O JSON de prova v2 liga o APK ao manifesto, revisão, execução e tentativa da promoção;
capturas e hierarquias XML de cada etapa têm seus hashes conferidos. Pages e Release
baixam essa prova por ID, verificam seu resumo criptográfico e reconferem o APK. A
retomada consulta no GitHub a execução e a tentativa originais: repositório, workflow,
main, SHA, conclusão e execução da etapa nativa precisam corresponder. Ela não troca os
identificadores do ambiente atual nem transforma uma prova de outra candidata em
corrente. Os artefatos são mantidos por sete dias, incluindo diagnósticos técnicos de
falha sem tokens. Ausência, expiração ou divergência impedem reutilização; com a origem
íntegra, não há nova execução do emulador.

O coordenador só torna a Release pública na fase final, depois de conferir backend,
teste nativo de instalação e atualização, Pages e jornadas reais requeridas. As notas
são geradas a partir das mudanças da versão. As jornadas conectadas continuam separadas:
em dispositivo descartável ou autorizado, confira login, retomada, área segura, teclado,
rolagem, PDFs, exportação e a assistência por IA com respostas simuladas e
determinísticas dos provedores para os cenários de interface. Essas simulações não
demonstram disponibilidade dos serviços reais. O guia [Aplicativo
Android](../android/README.md) explica assinatura, retorno móvel, rede e recuperação da
geração do APK.

## Ordem segura de promoção

Para GitHub Pages com Supabase hospedado, a sequência é:

1. diagnosticar a máquina e gerar o plano do destino;
2. configurar Auth, SMTP, redirecionamentos, OAuth, hook e variáveis públicas;
3. simular as migrações;
4. validar repositório e artefatos sem publicar;
5. integrar a revisão aprovada e confirmar os checks do SHA exato;
6. executar `preparar`: assinar o APK e provar instalação/upgrade nativos sem mudar o backend publicado;
7. concluir backup/restauração pertinente, aplicar migrações e publicar as Edge Functions;
8. executar `publicar_site`: verificar backend e prova já produzida, publicar os bytes Pages e guardar o APK em rascunho;
9. executar as jornadas críticas e provas reais de cliente da candidata;
10. executar `finalizar_release`: revalidar os artefatos e publicar a Release/APK correspondente.

O corte precisa definir o comportamento dos clientes instalados enquanto o backend e o
site são atualizados. Essa ordem não garante compatibilidade do cliente anterior nem
atualização simultânea entre fornecedores: interrupções exigem saber qual parte foi
confirmada antes de retomar. Preparar os arquivos antes da atualização retira a
compilação e o emulador dessa janela, mas os serviços ainda podem terminar em momentos
diferentes. Clientes instalados também precisam receber a nova versão.

A introdução das explicações e de sua revisão humana é um exemplo de alteração que exige
coordenação: clientes anteriores à mudança recusam os novos metadados, catálogo e
exportação, enquanto a operação de materialização no banco passa a exigir as
explicações. Consulte os contratos da candidata e o [histórico de
migrações](schema-change-log.md) para decidir como atender clientes ainda instalados. A
verificação do manifesto pelo publicador não adapta os formatos recebidos por uma sessão
antiga do aplicativo.

O backend é aplicado pelo procedimento autorizado de `deploySupabase.ps1`, sem
introduzir credencial administrativa nos trabalhos de geração dos artefatos. A promoção
registra e reconfere o esquema, conjunto de recursos, contratos de MCP/Actions e
fronteira OAuth do verificador hospedado. Essa prova não calcula o hash de todos os
bytes das Edge Functions nem substitui a prova da API de cursos e dos clientes reais.
Essas verificações e a preservação/recuperação de dados fazem parte do corte hospedado,
antes de anunciar entrega integral.

## Falhas e recuperação

Uma nova tentativa da fase apropriada usa a origem exata enquanto seus artefatos
estiverem disponíveis. A retomada de site/finalização conserva a preparação aprovada,
reconhece o site já correspondente e reutiliza o APK. Ela completa somente os arquivos
de publicação ausentes, verifica os existentes e não substitui tag ou arquivo
divergente. Uma tag correta sem Release permite criar o rascunho faltante. O rascunho
permanece visível apenas para quem tem acesso enquanto alguma parte ainda falha; não
constitui conclusão da publicação. Essa retomada é do workflow de promoção. As provas da
validação integral precisam pertencer à mesma tentativa: repetir somente um trabalho de
validação não reúne automaticamente provas de tentativas diferentes. Uma nova candidata
deve produzir o conjunto exigido e seus artefatos vinculados antes de ser promovida.

Uma falha antes de `db push` não altera o esquema. Depois de uma resposta ambígua, liste
migrações e confronte o manifesto antes de repetir. Migrações versionadas não devem ser
desfeitas por edição retroativa; corrija o estado com uma nova migração ou restaure um
backup quando a perda exigir retorno do banco.

Backup do PostgreSQL não inclui automaticamente objetos do Storage. A política
operacional precisa conservar e verificar os dois conjuntos. Código, site e APK são
recuperados pelo Git e por uma release anterior; dados são recuperados por cópia de
segurança do ambiente. Trocar a chave de assinatura Android impede atualização direta e,
portanto, não é um mecanismo comum de reversão.

Antes do upgrade de um backup restaurado, confira os proprietários do banco, esquemas e
objetos, as permissões e associações de papéis, a codificação e o provedor, localidade e
versão da ordenação textual (collation). Execute as migrações com o mesmo papel da
implantação, sem permissões extras herdadas do conjunto de serviços usado no ensaio.

Uma restrição `CHECK` verifica se cada linha satisfaz uma regra do banco. Se essa
verificação houver consulta a um catálogo salvo, restaure o catálogo antes das linhas
dependentes, conservando todas as entradas da cópia de segurança e a própria restrição.

Se o site foi publicado antes do backend compatível, interrompa a promoção e republique
o cliente anterior pelo Git. Se o backend novo já foi aplicado, investigue
compatibilidade e dados antes de qualquer restauração. Não mantenha dois caminhos ativos
apenas como plano de retorno.
