# Implantação

O AraLearn é entregue por três partes coordenadas: backend Supabase, site
estático e aplicativo Android. Elas precisam nascer da mesma revisão validada.
Se o banco muda e o cliente antigo continua publicado, ou se o site exige um
contrato ainda ausente no backend, uma interface aparentemente íntegra pode
falhar somente ao alcançar a operação remota.

O repositório oferece diagnóstico, planejamento, aplicação e verificação como
etapas separadas. O diagnóstico observa a máquina; o plano mostra operações
automáticas e manuais; a aplicação altera o destino autorizado; a verificação
confronta o resultado efetivamente hospedado.

## Escolher o perfil

`scripts/planDeployment.ps1` reconhece três destinos:

| Perfil | Site | Backend | Uso |
| --- | --- | --- | --- |
| `GitHubPagesManagedSupabase` | [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) | projeto Supabase hospedado | publicação canônica do repositório |
| `StaticHostManagedSupabase` | host estático HTTPS | projeto Supabase hospedado | instalação em outro endereço controlado |
| `LocalDevelopment` | servidor local | stack Supabase local em Docker | desenvolvimento e ensaio descartável |

Para gerar o roteiro sem alterar ambiente remoto:

```powershell
pwsh -NoProfile -File .\scripts\planDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -ApplicationUrl https://fabio-ara.github.io/AraLearn/ `
  -ProjectUrl https://<project-ref>.supabase.co `
  -IncludeAndroid
```

O perfil de host estático exige HTTPS. HTTP é aceito somente em `localhost` no
perfil local.

## Diagnosticar a máquina

O diagnóstico exige
[PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell),
[Node.js 22](https://nodejs.org/en/download), npm e npx fornecidos pelo Node.js,
e [Git](https://git-scm.com/downloads). Autoria remota acrescenta
[Deno](https://docs.deno.com/runtime/getting_started/installation/). O stack
local exige
[Supabase CLI 2.115.0](https://supabase.com/docs/guides/local-development/cli/getting-started)
e [Docker](https://docs.docker.com/desktop/); no Windows, o relatório também
informa WSL, virtualização, espaço livre e ocupação das portas 54321 a 54324.
Android acrescenta [Java 17](https://developer.android.com/build/jdks) e o
[Android SDK](https://developer.android.com/studio/intro/update#sdk-manager).

Exemplo para a publicação web e Android:

```powershell
pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -Authoring -Android -RequireRuntimeConfig
```

`-RequireRuntimeConfig` exige somente a configuração que pode entrar no
cliente:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

Se `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou
`SUPABASE_DB_PASSWORD` estiver presente no processo de build, o diagnóstico
bloqueia a continuação. Segredo administrativo não pertence ao site, ao APK,
ao Git nem a log público.

## Preparar o projeto Supabase hospedado

Antes de aplicar migrations, configure no painel:

1. Site URL do endereço público e somente os redirecionamentos realmente
   utilizados pelo site e pelo Android;
2. entrega de e-mail e SMTP adequados ao ambiente, pois cadastro, confirmação e
   recuperação dependem deles;
3. [OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server) com
   cadastro dinâmico de clientes e caminho de autorização `/` para o
   consentimento do MCP no shell;
4. chave JWT assimétrica e Custom Access Token Hook
   `public.aralearn_mcp_access_token_hook`;
5. confirmação de PKCE S256 na descoberta OAuth.

Esses itens pertencem ao MCP. O OAuth de Actions é implementado pela função
`aralearn-authoring-action`, com clientes confidenciais registrados pela conta
AraLearn; ele não reutiliza o cadastro dinâmico nem o token do MCP.

Em [GitHub Actions](https://docs.github.com/en/actions), cadastre a URL do
projeto e a chave publicável como variáveis, não como credenciais
administrativas. Os segredos necessários ao servidor ficam na configuração do
projeto Supabase. A [separação entre chaves publicáveis e secretas](supabase.md#chaves-publicáveis-e-segredos)
é parte da fronteira de segurança.

## Validar antes da publicação

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

`Core` exerce contratos e runtime sem publicar. `Web` acrescenta o artefato do
site. `Full` acrescenta Android. Os verificadores de artefato examinam
configuração pública, política de conteúdo, segredos, manifesto, recursos e
ausência de catálogo de Cursos embutido. Testes demonstram os cenários
exercitados; mudanças visuais ainda exigem inspeção no produto real.

Para o ambiente local descartável:

```powershell
npx.cmd --yes supabase@2.115.0 start
npx.cmd --yes supabase@2.115.0 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

O reset local aplica seed. O projeto hospedado nunca recebe seed nem reset pelo
procedimento de promoção.

## Simular e aplicar o backend

O modo padrão de `deploySupabase.ps1` é somente leitura em relação ao esquema:
ele liga o repositório ao projeto escolhido, lista migrations e executa
`db push --dry-run`.

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co
```

Revise o destino e a simulação. Para aplicar migrations e publicar as três Edge
Functions:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co `
  -Mode Apply -DeployAuthoringFunctions `
  -PublicAppUrl https://<endereco-da-aplicacao>/
```

O script só prossegue depois da confirmação literal `APLICAR`. Ele executa `db
push` sem seed ou reset, repete a lista, roda o analisador do banco, configura
origens e publica:

- `aralearn-authoring-mcp`;
- `aralearn-course-api`;
- `aralearn-authoring-action`.

As origens mínimas da aplicação são o servidor local, GitHub Pages e
`https://appassets.androidplatform.net`. Uma instalação alternativa acrescenta
somente suas origens HTTPS exatas. Actions admite também
`https://chatgpt.com` e `https://chat.openai.com`. O script verifica preflight
da API e de Actions, OAuth do MCP hospedado e o fluxo autenticado de PDF antes
de encerrar.

O manifesto corrente termina em
`20260831005116_filter_removed_source_pdf_attachment_access.sql`. Depois da aplicação:

```powershell
npm.cmd run deployment:verify-hosted
```

Essa prova confronta o contrato remoto. Ela deve passar antes de publicar um
cliente que dependa da nova revisão.

## Publicar o site

`npm run pages:build` gera `.pages` a partir das mesmas fontes validadas. O
artefato contém HTML, CSS, módulos JavaScript, manifesto de recursos,
configuração pública e o documento OpenAPI de Actions. Não contém Cursos,
chave secreta nem credencial de provedor.

O workflow `pages.yml` publica o mesmo SHA já aprovado. Em outro host estático,
envie o conteúdo de `.pages`, preserve caminhos e tipos MIME e sirva tudo por
HTTPS. Depois:

```powershell
npm.cmd run deployment:verify-site -- --url https://<endereco-da-aplicacao>/
```

O verificador consulta recursos, MIME, política de conteúdo, configuração
pública e retorno PKCE. Complete a prova percorrendo autenticação, Estudo,
Autoria, retorno da conexão e funcionamento sem rede com uma conta autorizada.

## Gerar e verificar o Android

O APK empacota a mesma aplicação web numa
[WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview).
O build de publicação exige HTTPS e assinatura. A
[assinatura do aplicativo](https://developer.android.com/studio/publish/app-signing)
precisa conservar a mesma identidade para que instalações anteriores aceitem a
atualização.

```powershell
npm.cmd run android:release
pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Android -RequireRuntimeConfig
```

O workflow `android-release.yml` deve receber o mesmo SHA do backend e do site.
Instale primeiro em dispositivo descartável ou autorizado e confira login,
retomada, área segura, teclado, rolagem, PDFs, exportação e a Assistência por IA
com stubs determinísticos dos providers. O guia [Aplicativo Android](../android/README.md) explica
assinatura, retorno móvel, rede e recuperação do build.

## Ordem segura de promoção

Para GitHub Pages com Supabase hospedado, a sequência é:

1. diagnosticar a máquina e gerar o plano do destino;
2. configurar Auth, SMTP, redirecionamentos, OAuth, hook e variáveis públicas;
3. simular as migrations;
4. validar repositório e artefatos sem publicar;
5. integrar a revisão aprovada e confirmar os checks do SHA exato;
6. aplicar migrations e publicar as Edge Functions;
7. verificar o backend hospedado;
8. publicar site e, quando previsto, Android a partir do mesmo SHA;
9. verificar o endereço publicado e percorrer as jornadas críticas.

Essa ordem mantém os clientes antigos em uso até o novo backend estar provado.
Ela não oferece atomicidade entre fornecedores: interrupções ainda exigem saber
qual parte foi confirmada antes de retomar.

## Falhas e recuperação

Uma falha antes de `db push` não altera o esquema. Depois de uma resposta
ambígua, liste migrations e confronte o manifesto antes de repetir. Migrations
versionadas não devem ser desfeitas por edição retroativa; corrija o estado com
uma nova migration ou restaure um backup quando a perda exigir retorno do banco.

Backup do PostgreSQL não inclui automaticamente objetos do Storage. A política
operacional precisa conservar e verificar os dois conjuntos. Código, site e APK
são recuperados pelo Git e por uma release anterior; dados são recuperados por
backup do ambiente. Trocar a chave de assinatura Android impede atualização
direta e, portanto, não é um mecanismo comum de reversão.

Se o site foi publicado antes do backend compatível, interrompa a promoção e
republique o cliente anterior pelo Git. Se o backend novo já foi aplicado,
investigue compatibilidade e dados antes de qualquer restauração. Não mantenha
dois caminhos ativos apenas como plano de retorno.
