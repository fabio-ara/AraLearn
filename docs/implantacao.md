# Implantação

O AraLearn usa a mesma aplicação JavaScript na web e no APK Android. Em produção, precisa de hospedagem para os arquivos estáticos e de um projeto Supabase para contas, catálogo, progresso, comentários, trilhas, importação e sincronização. O IndexedDB mantém a réplica offline de cada dispositivo, mas não substitui o servidor.

## Formas de implantação

| Perfil | Aplicação | Banco e serviços | Situação |
| --- | --- | --- | --- |
| GitHub Pages com Supabase gerenciado | GitHub Pages | Projeto hospedado no Supabase | Suportado e automatizado pela CI |
| Servidor estático institucional com Supabase gerenciado | Qualquer servidor HTTPS capaz de servir os arquivos de `.pages/` | Projeto hospedado no Supabase | Suportado |
| Desenvolvimento local | Servidor Node.js local | Supabase CLI em Docker | Suportado para desenvolvimento e testes |

Uma instalação própria de Supabase exige PostgreSQL, Auth, PostgREST, gateway, Edge Functions, e-mail, TLS, backup, monitoramento e atualização dos serviços. Ela pode ser estudada por uma equipe de infraestrutura, mas não possui instalador nem validação completa neste repositório.

Outro BaaS ou um banco que exponha apenas PostgreSQL não é intercambiável com o Supabase. Seriam necessários adaptadores para autenticação, API, funções e autorização. SharePoint pode hospedar arquivos estáticos quando a configuração do tenant permitir; um pacote SPFx específico constitui uma integração diferente.

## Ferramentas

Todos os perfis usam Git, PowerShell 7, Node.js 22 ou posterior, npm e npx. A versão da Supabase CLI é fixada nos comandos do projeto e pode ser executada pelo npx. O APK acrescenta Java 17 e Android SDK. O Supabase local acrescenta Docker em execução.

Rode os comandos na raiz do repositório. No Windows, use `npm.cmd` e `npx.cmd`; isso evita o bloqueio de `npm.ps1` ou `npx.ps1` pela política de execução do PowerShell.

## Nomes usados no Supabase

| Nome | Significado | Pode aparecer no site e no APK? |
| --- | --- | --- |
| Project URL | Endereço público da API, como `https://abc123abc123abc123ab.supabase.co` | Sim |
| Project Ref | Trecho entre `https://` e `.supabase.co` na Project URL | Sim |
| Publishable key | Chave pública usada pela aplicação | Sim |
| Service role | Chave administrativa do servidor | Não |

A Project URL e a publishable key ficam em **Project Settings → API**. O Project Ref também aparece na coluna **REFERENCE ID** do comando:

```powershell
npx.cmd --yes supabase@2.109.1 projects list
```

Senha do banco, service role, token pessoal, refresh token e chave de assinatura Android devem permanecer fora do repositório, do host estático e dos artefatos.

## 1. Escolher e conferir o perfil

Abra o PowerShell 7 na raiz do repositório. O comando abaixo mostra as etapas sem executar implantação ou acessar o projeto remoto:

```powershell
pwsh -NoProfile -File .\scripts\planDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase
```

Os valores aceitos em `-Profile` são:

```text
GitHubPagesManagedSupabase
StaticHostManagedSupabase
LocalDevelopment
```

Para incluir o APK no plano, acrescente `-IncludeAndroid`. Um plano para servidor institucional pode receber os endereços públicos e produzir comandos já preenchidos:

```powershell
pwsh -NoProfile -File .\scripts\planDeployment.ps1 `
  -Profile StaticHostManagedSupabase `
  -ApplicationUrl https://intranet.exemplo.org/aralearn `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -IncludeAndroid
```

Confira a máquina antes de continuar:

```powershell
pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase
```

O diagnóstico verifica PowerShell, Node.js, npm, npx, Git, arquivos essenciais e dependências instaladas. Com `-Android`, verifica também Java e Android SDK. Com `-RequireRuntimeConfig`, exige a configuração pública e rejeita uma chave administrativa sem mostrar seu valor.

`planDeployment.ps1` e `diagnoseDeployment.ps1` aceitam `-AsJson` para inventário automatizado. Um bloqueio faz o diagnóstico terminar com código diferente de zero.

Para o perfil local, Docker instalado e em execução é obrigatório:

```powershell
pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile LocalDevelopment
```

## 2. Preparar o projeto Supabase hospedado

1. Crie um projeto na região mais próxima dos estudantes.
2. Instale a Supabase CLI e faça login.
3. Guarde a senha do banco em um gerenciador de senhas.
4. Mantenha a service role fora de arquivos, histórico do terminal compartilhado e variáveis do build.
5. Não crie tabelas ou funções manualmente pelo SQL Editor. As migrations versionadas são a referência do banco.

Faça primeiro uma simulação:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co
```

O script vincula o projeto, compara o histórico e executa `db push --dry-run`. Pare se aparecer migration desconhecida, histórico divergente ou objeto que não pertence ao AraLearn. Ele não executa reset, seed, `db pull` nem `migration repair`.

Depois de conferir a simulação, aplique as migrations:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply
```

O terminal exige a confirmação literal `APLICAR`. Se a CLI pedir a senha do banco, digite-a no próprio prompt. O script não grava o valor.

Confirme o resultado:

```powershell
npx.cmd --yes supabase@2.109.1 migration list --linked
npx.cmd --yes supabase@2.109.1 db lint --linked --level warning --fail-on warning
```

As fixtures em `supabase/fixtures/catalog/` não entram na implantação e não são empacotadas no aplicativo. A publicação administrativa inicial está descrita em [Supabase](supabase.md#publicação-inicial-das-fixtures-oficiais).

## 3. Configurar contas e e-mail

No painel do Supabase, abra **Authentication**.

1. Habilite cadastro com e-mail e senha.
2. Exija confirmação de e-mail.
3. Mantenha login anônimo desabilitado.
4. Mantenha a rotação de refresh token e a alteração segura de senha.
5. Configure SMTP institucional antes de abrir cadastros ao público.
6. Preserve `{{ .ConfirmationURL }}` nos modelos de confirmação e recuperação.

Em **URL Configuration**, informe o endereço público exato como Site URL. Cadastre somente os redirecionamentos usados pela instalação. Exemplo:

```text
https://intranet.exemplo.org/aralearn/
https://intranet.exemplo.org/aralearn/**
http://localhost:4182/
http://localhost:4182/**
http://127.0.0.1:4182/
http://127.0.0.1:4182/**
aralearn://auth/callback
```

Não use um coringa global. O callback com esquema `aralearn://` atende ao APK atual; uma distribuição institucional ampla deve planejar Android App Links verificados.

## 4. GitHub Pages

No repositório GitHub, abra **Settings → Secrets and variables → Actions → Variables** e crie apenas:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

Esses dois valores são públicos. Não crie variável de service role ou senha do banco. A integração de uma branch revisada na `main` aciona `.github/workflows/pages.yml`, que testa, gera e publica o site.

Para conferir o build localmente antes da integração:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://abc123abc123abc123ab.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"

pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -RequireRuntimeConfig

npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run pages:build

pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Pages `
  -RequireRuntimeConfig
```

## 5. Servidor estático institucional

Defina as duas configurações públicas somente no processo que gera os arquivos:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://abc123abc123abc123ab.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"

pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile StaticHostManagedSupabase `
  -RequireRuntimeConfig

npm.cmd ci
npm.cmd run pages:build

pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Pages `
  -RequireRuntimeConfig
```

Publique o conteúdo de `.pages/`, não a própria pasta, em um endereço HTTPS. O servidor deve conservar os nomes dos arquivos, os caminhos relativos e os cabeçalhos adequados para JavaScript, CSS, JSON, fontes e service worker.

Cadastre o endereço final no Auth antes do teste. Em seguida, confira cadastro, confirmação, login, recuperação de senha, seleção de curso, estudo offline, reconexão e sincronização em dois navegadores.

## 6. Desenvolvimento local completo

O stack local é descartável e não usa o projeto hospedado:

```powershell
npm.cmd ci
npx.cmd --yes supabase@2.109.1 start --exclude inbucket
npx.cmd --yes supabase@2.109.1 db reset
npx.cmd --yes supabase@2.109.1 db lint --local --level warning --fail-on warning
npx.cmd --yes supabase@2.109.1 test db
npm.cmd test
npm.cmd run lint
```

Os smokes de PostgREST e autoria também precisam da fixture oficial temporária, das chaves locais mostradas por `supabase status -o json` e da Edge Function iniciada por `supabase functions serve aralearn-authoring-api --no-verify-jwt`. A CI executa essa sequência completa no job **Testar Supabase local**, cria usuários e cursos temporários e encerra o stack ao final. O smoke editorial recusa qualquer endereço que não seja `localhost` ou `127.0.0.1`.

Para encerrar e descartar os contêineres locais:

```powershell
npx.cmd --yes supabase@2.109.1 stop --no-backup
```

Para iniciar a aplicação, use os valores públicos mostrados por `supabase status` e execute:

```powershell
npm.cmd run dev
```

## 7. APK Android

O APK usa a mesma Project URL e a mesma publishable key da web. Para o build de desenvolvimento:

```powershell
pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -Android `
  -RequireRuntimeConfig

npm.cmd run android:debug
.\android\gradlew.bat -p .\android :app:lintDebug --no-daemon

pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Android `
  -RequireRuntimeConfig
```

Uma release também precisa de keystore, alias e senhas no processo local. A keystore não pode ficar no repositório. Antes de distribuir, confira assinatura, atualização sobre a versão anterior, callback de autenticação, login, recuperação, sincronização e uso offline em aparelho ou emulador.

## 8. Ativar a autoria assistida

A API editorial deve ser implantada somente depois que banco, Auth e aplicativo estiverem funcionando. Para incluí-la na aplicação das migrations:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply `
  -DeployAuthoringApi `
  -AllowedOrigin https://intranet.exemplo.org,http://localhost:4182,http://127.0.0.1:4182
```

O primeiro proprietário e a chave editorial restrita são criados localmente:

```powershell
pwsh -NoProfile -File .\scripts\bootstrapAuthoringAccess.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -OwnerEmail responsavel@exemplo.org
```

O terminal pede a service role de modo protegido e mostra a chave `arl_...` uma única vez. Guarde-a em cofre. Um assistente configurado com essa chave deve permanecer privado ou restrito ao espaço de trabalho. Consulte o [material de autoria](../authoring/README.md) para configurar a plataforma escolhida.

## 9. Verificação antes da abertura

Execute as validações do aplicativo:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run validate:example
npm.cmd run validate:cutover
npm.cmd run catalog:validate
npm.cmd run pages:build
npm.cmd run test:e2e
npm.cmd run android:debug
.\android\gradlew.bat -p .\android :app:lintDebug --no-daemon
```

Examine os dois runtimes gerados:

```powershell
pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target All `
  -RequireRuntimeConfig
```

A verificação reprova:

- service role, senha, connection string ou chave privada;
- `.env`, keystore e arquivos equivalentes;
- fixture, curso ou catálogo operacional empacotado;
- publishable key ausente ou administrativa;
- Project URL inválida;
- política de segurança que permita conexão com qualquer domínio HTTPS;
- marcador de configuração não substituído.

No destino Android, ela também abre os APKs existentes em `android/app/build/outputs/apk/` e examina os recursos empacotados. Ela não confirma migrations, RLS, SMTP, redirecionamentos nem disponibilidade do projeto hospedado. Esses itens precisam dos comandos do banco e do teste funcional.

Para integração com outro processo de entrega, `verifyDeploymentArtifacts.ps1` aceita `-AsJson` e termina com código diferente de zero quando encontra um bloqueio.

## 10. Teste funcional e operação

Antes de abrir a instalação aos estudantes, teste:

1. cadastro e confirmação por link;
2. login, restauração da sessão e saída;
3. recuperação de senha;
4. catálogo e seleção de curso;
5. progresso e comentário;
6. fechamento e reabertura sem rede;
7. reconexão e envio da fila local;
8. continuidade em outro dispositivo;
9. importação privada e, para quem possui permissão, publicação editorial;
10. atualização do aplicativo e do APK sem perda de dados locais.

Defina responsáveis por backup, restauração, SMTP, domínio, certificados, atualização do Supabase, revisão de logs e resposta a incidentes. Faça um ensaio de restauração antes de depender do sistema em atividade institucional.
