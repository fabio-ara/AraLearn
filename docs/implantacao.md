# Implantação

O AraLearn usa a mesma aplicação JavaScript na web e no APK Android. Em produção, precisa de hospedagem para os arquivos estáticos e de um projeto Supabase para contas, catálogo, progresso, comentários, trilhas, importação e sincronização. O IndexedDB mantém a réplica offline de cada dispositivo, mas não substitui o servidor.

Este é o roteiro operacional da implantação. Siga as seções na ordem adequada ao perfil escolhido. O documento [Supabase: desenvolvimento e implantação](supabase.md) explica o funcionamento do banco e ajuda a diagnosticar problemas, mas não substitui as verificações e as proteções deste roteiro.

## Formas de implantação

| Perfil | Situação atual | O que foi verificado |
| --- | --- | --- |
| GitHub Pages com Supabase gerenciado | Suportado | Uma atualização de `main` só inicia a publicação automática depois da validação do repositório. O fluxo de Pages repete os testes do aplicativo, confere a revisão do banco hospedado, gera o site e examina o artefato. |
| Outro servidor estático HTTPS com Supabase gerenciado | Caminho disponível; destino a validar | O repositório gera e examina `.pages/`. O servidor escolhido ainda precisa ser verificado quanto a tipos MIME, cache, retorno de autenticação e Service Worker. |
| Intranet estática HTTPS com Supabase gerenciado | Caminho disponível sob requisitos de rede | Usa o mesmo artefato estático. Exige saída HTTPS para o Supabase, DNS e certificados válidos e os redirecionamentos da intranet cadastrados no Auth. |
| Desenvolvimento local descartável | Suportado para desenvolvimento e testes | A CI recria o Supabase local, executa pgTAP, RLS, PostgREST, Auth, e-mail, API REST e MCP. O ambiente não é uma implantação de produção. |
| SharePoint ou pacote SPFx | Não implementado | Não existe pacote SPFx, adaptador de autenticação nem teste no SharePoint. O aplicativo também impede incorporação em `iframe`. |
| Supabase auto-hospedado em produção | Não automatizado nem validado | O repositório não instala nem opera o conjunto de serviços exigido em produção. |
| Backend diferente do Supabase | Não implementado | Não há adaptadores nem suíte de conformidade para outro BaaS ou para PostgreSQL isolado. |

Uma instalação própria de Supabase exige PostgreSQL, Auth, PostgREST, gateway, Edge Functions, entrega de e-mail, TLS, backup, monitoramento e atualização coordenada. O ambiente Docker deste repositório serve para desenvolvimento descartável e não comprova que uma instalação auto-hospedada esteja pronta para uso institucional.

Outro BaaS ou um banco que exponha apenas PostgreSQL não substitui o Supabase atual. Uma futura portabilidade precisa implementar autenticação, API, funções transacionais, autorização, autoria e uma suíte de conformidade antes de receber a classificação de suporte.

## Ferramentas

Todos os perfis usam Git, PowerShell 7, Node.js 22 ou posterior, npm e npx. A versão da Supabase CLI é fixada nos comandos do projeto e pode ser executada pelo npx. O APK acrescenta Java 17 e Android SDK. O Supabase local acrescenta Docker em execução.

Rode os comandos na raiz do repositório. No Windows, use `npm.cmd` e `npx.cmd`; isso evita o bloqueio de `npm.ps1` ou `npx.ps1` pela política de execução do PowerShell.

## Nomes usados no Supabase

| Nome | Significado | Pode aparecer no site e no APK? |
| --- | --- | --- |
| Project URL | Endereço público da API, como `https://abc123abc123abc123ab.supabase.co` | Sim |
| Project Ref | Trecho entre `https://` e `.supabase.co` na Project URL | Sim |
| Publishable key | Chave pública usada pela aplicação | Sim |
| Secret key | Chave administrativa usada somente por processos protegidos do servidor | Não |

A Project URL e a publishable key ficam em **Project Settings → API**. O Project Ref também aparece na coluna **REFERENCE ID** do comando:

```powershell
npx.cmd --yes supabase@2.109.1 projects list
```

Senha do banco, secret key, token pessoal, refresh token e chave de assinatura Android devem permanecer fora do repositório, do host estático e dos artefatos.

## 1. Escolher e conferir o perfil

Abra o PowerShell 7 na raiz do repositório. O comando abaixo mostra as etapas sem executar implantação ou acessar o projeto remoto:

```powershell
pwsh -NoProfile -File .\scripts\planDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase
```

Os valores aceitos em `-Profile` correspondem apenas aos caminhos automatizados hoje:

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
  -Profile GitHubPagesManagedSupabase `
  -Authoring
```

O diagnóstico verifica PowerShell, Node.js, npm, npx, Git, arquivos essenciais e dependências instaladas. No perfil local, também confere a Supabase CLI fixada, Docker, portas e espaço em disco. A validação do produto inclui as funções de autoria, por isso os planos usam `-Authoring` e exigem Deno. Com `-Android`, exige Java 17 e Android SDK. Com `-RequireRuntimeConfig`, exige a configuração pública e rejeita uma chave administrativa sem mostrar seu valor.

`planDeployment.ps1` e `diagnoseDeployment.ps1` aceitam `-AsJson` para inventário automatizado. Um bloqueio faz o diagnóstico terminar com código diferente de zero.

Para o perfil local, Docker instalado e em execução é obrigatório:

```powershell
pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile LocalDevelopment
```

## 2. Preparar o projeto Supabase hospedado

Aplique e valide o banco antes de publicar uma nova versão do site ou do APK. Uma aplicação nova pode chamar funções que ainda não existem no projeto hospedado. No GitHub Pages, o fluxo de publicação confere o manifesto público da revisão do banco e interrompe a publicação quando a API está atrasada.

1. Crie um projeto na região mais próxima dos estudantes.
2. Instale a Supabase CLI e faça login.
3. Guarde a senha do banco em um gerenciador de senhas.
4. Mantenha a secret key fora de arquivos, histórico do terminal compartilhado e variáveis do build.
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

Esses dois valores são públicos. Não crie variável de chave administrativa ou senha do banco. Uma atualização de `main` executa `.github/workflows/validacao.yml`; o sucesso desse fluxo inicia automaticamente `.github/workflows/pages.yml`. O fluxo de Pages repete os testes do aplicativo, consulta o manifesto público do banco e só publica quando migrations e recursos exigidos pelo site estão disponíveis. A execução manual de Pages não depende do fluxo anterior, por isso deve ser usada somente depois de conferir a validação do mesmo commit.

DeepSeek, Gemini e serviços compatíveis com a API da OpenAI já usam origens HTTPS exatas na política do site. Se a instalação utilizar outro endereço de assistência, acrescente uma variável pública opcional:

```text
ARALEARN_ASSIST_ALLOWED_ORIGINS
```

Informe somente origens separadas por vírgula, sem caminhos ou chaves, como `https://assistencia.exemplo.org`. O build recusa HTTP remoto, credenciais na URL e permissões genéricas. Uma chave de provedor nunca pertence às variáveis do build; a pessoa a informa no aplicativo e ela permanece somente na memória da página.

Para conferir o build localmente antes da integração:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://abc123abc123abc123ab.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
$env:ARALEARN_ASSIST_ALLOWED_ORIGINS = "https://assistencia.exemplo.org" # opcional

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
$env:ARALEARN_ASSIST_ALLOWED_ORIGINS = "https://assistencia.exemplo.org" # opcional

pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile StaticHostManagedSupabase `
  -RequireRuntimeConfig

npm.cmd ci
npm.cmd run pages:build

pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Pages `
  -RequireRuntimeConfig
```

Publique o conteúdo de `.pages/`, não a própria pasta, em um endereço HTTPS. O servidor deve:

- conservar nomes e caminhos relativos;
- devolver JavaScript, CSS, JSON, imagens e fontes com o tipo MIME correto;
- servir `service-worker.js` na raiz do caminho publicado, sem redirecioná-lo para HTML;
- permitir que `index.html` e os recursos necessários sejam obtidos no mesmo caminho público;
- não manter `index.html`, `runtime-config.js`, `asset-manifest.json` ou `service-worker.js` presos em cache depois de uma implantação;
- preservar `code` e `auth_state` quando o callback de autenticação abre a página;
- permitir conexões somente para as origens declaradas pela CSP do build.

O CORS das APIs continua sob controle do Supabase e das Edge Functions. A CSP do site não substitui CORS, e liberar CORS não amplia a CSP. Cadastre a origem exata da aplicação tanto no Auth quanto nas funções que recebem chamadas do navegador.

Depois do envio, examine o endereço publicado sem usar credenciais:

```powershell
npm.cmd run deployment:verify-site -- `
  --url https://intranet.exemplo.org/aralearn/
```

Essa verificação percorre os recursos declarados, confere MIME, configuração pública, CSP, ausência de segredos e catálogo embarcado e preservação dos parâmetros do callback. Cabeçalhos de cache e o funcionamento offline ainda precisam do teste funcional no navegador.

Cadastre o endereço final no Auth antes do teste. Em seguida, confira cadastro, confirmação, login, recuperação de senha, seleção de curso, estudo offline, reconexão e sincronização em dois navegadores.

## 6. Desenvolvimento local completo

O stack local é descartável e não usa o projeto hospedado. Instale Docker e Deno, confirme que o Docker está em execução e rode:

```powershell
npm.cmd ci
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

O script confere o código das duas Edge Functions com Deno, executa o lint do banco, pgTAP, RLS, PostgREST, cadastro, confirmação e recuperação de senha, publicação de uma fixture temporária, API REST e MCP. Ele obtém as chaves efêmeras do stack local, limita os ensaios ao endereço local e restaura as variáveis do processo ao terminar.

Não exclua o serviço de e-mail ao iniciar o stack. O Mailpit local fica em `http://127.0.0.1:54324` e recebe as mensagens usadas nos ensaios de Auth. A CI executa a mesma família de verificações na etapa **Testar Supabase local** e encerra o ambiente ao final.

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

Uma release também precisa de keystore, alias e senhas somente no processo local:

- `ARALEARN_ANDROID_KEYSTORE_PATH`;
- `ARALEARN_ANDROID_KEYSTORE_PASSWORD`;
- `ARALEARN_ANDROID_KEY_ALIAS`;
- `ARALEARN_ANDROID_KEY_PASSWORD`.

Depois de definir essas variáveis no terminal protegido, execute `npm.cmd run android:release`. A keystore e as senhas não podem ficar no repositório, nos arquivos do projeto nem no histórico compartilhado. O [roteiro Android](../android/README.md#build-de-release) informa o artefato esperado e as verificações da assinatura. Antes de distribuir, confira atualização sobre a versão anterior, callback de autenticação, login, recuperação, sincronização e uso offline em aparelho ou emulador.

## 8. Ativar a autoria assistida

A autoria externa deve ser implantada somente depois que banco, Auth e aplicativo estiverem funcionando. O mesmo roteiro instala a API REST e o gateway MCP:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply `
  -DeployAuthoringApi `
  -InitializeAuthoringSecrets `
  -AllowedOrigin "https://intranet.exemplo.org","http://localhost:4182","http://127.0.0.1:4182"
```

Ao executar um script por `pwsh -File`, informe as origens na mesma linha,
separadas por vírgulas. A notação `@(...)` pode deslocar uma origem para outro
parâmetro do script. O roteiro também aceita a lista que o PowerShell mantiver
em uma única string, inclusive com aspas em torno de cada origem.

Use `-InitializeAuthoringSecrets` somente na primeira implantação da autoria ou quando houver uma rotação deliberada. O script cria dois segredos independentes, envia-os diretamente ao cofre das Edge Functions e não os grava no computador. Em atualizações comuns, omita essa opção para conservar os segredos existentes.

Actions e conectores REST usam `aralearn-authoring-api`. Clientes MCP com suporte a chave estática usam `aralearn-authoring-mcp`. A configuração e os testes do segundo endereço estão em [Gateway MCP de autoria](autoria-mcp.md).

Antes de criar o primeiro proprietário, cadastre essa conta no AraLearn e conclua a confirmação do endereço eletrônico. Use exatamente o mesmo endereço no comando abaixo. O script interrompe a operação se a conta ainda não existir.

O primeiro proprietário e a chave editorial restrita são criados localmente:

```powershell
pwsh -NoProfile -File .\scripts\bootstrapAuthoringAccess.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -OwnerEmail responsavel@exemplo.org
```

O terminal pede a chave administrativa de modo protegido e mostra a chave `arl_...` uma única vez. Guarde-a em cofre. Um assistente configurado com essa chave deve permanecer privado ou restrito ao espaço de trabalho. Consulte o [material de autoria](../authoring/README.md) para configurar a plataforma escolhida.

Se a função foi implantada sem `-InitializeAuthoringSecrets`, configure os dois segredos antes da primeira chamada. O bloco abaixo cria valores independentes sem pedir que sejam colados no terminal e remove as variáveis assim que a CLI termina:

```powershell
$env:ARALEARN_AUTHORING_INTEGRATION_SECRET = `
  [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$env:ARALEARN_AUTHORING_RECEIPT_SECRET = `
  [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
try {
  npx.cmd --yes supabase@2.109.1 secrets set `
    "ARALEARN_AUTHORING_INTEGRATION_SECRET=$env:ARALEARN_AUTHORING_INTEGRATION_SECRET" `
    "ARALEARN_AUTHORING_RECEIPT_SECRET=$env:ARALEARN_AUTHORING_RECEIPT_SECRET" `
    --project-ref abc123abc123abc123ab
}
finally {
  Remove-Item Env:ARALEARN_AUTHORING_INTEGRATION_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:ARALEARN_AUTHORING_RECEIPT_SECRET -ErrorAction SilentlyContinue
}
```

Esses segredos não são as chaves entregues aos assistentes. O primeiro permite que o servidor emita chaves pessoais `arl_...` sem armazená-las; o segundo assina comprovantes efêmeros de leitura usados pela auditoria. Cada conta administra apenas as próprias integrações por uma sessão autenticada; a chave completa aparece uma vez, possui escopos privados fixos e nunca autoriza publicação no catálogo.

No aplicativo, abra a biblioteca e use o botão **Gerenciar integrações pessoais** no rodapé. Dê um nome à integração, escolha a validade, crie a chave e copie-a no momento em que for exibida. A mesma tela permite renovar e revogar chaves. Use essa chave no perfil pessoal descrito em [Configuração no ChatGPT](../authoring/platforms/chatgpt/SETUP.md) ou em outro cliente compatível. Ela não serve para publicação editorial.

## 9. Smoke no projeto hospedado

Execute o smoke hospedado somente depois de aplicar as migrations, configurar o Auth e publicar pelo menos um curso oficial. O ensaio cria duas contas temporárias, comprova o isolamento entre elas, chama as RPCs autorizadas e tenta remover os dados criados. Faça isso em uma janela de manutenção e confira os usuários de teste ao final.

No PowerShell 7, abra primeiro a raiz do repositório. Informe a chave administrativa no prompt protegido; não a escreva no comando nem em arquivo:

```powershell
Set-Location -LiteralPath "C:\caminho\para\AraLearn"
$env:SUPABASE_URL = "https://abc123abc123abc123ab.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
$segredo = Read-Host "Cole a chave administrativa do projeto" -AsSecureString
$ponte = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segredo)
try {
  $env:SUPABASE_SECRET_KEY = `
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponte)
  npm.cmd run test:supabase:smoke
  if ($LASTEXITCODE -ne 0) { throw "O smoke hospedado falhou." }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponte)
  Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
  Remove-Variable segredo, ponte -ErrorAction SilentlyContinue
}
```

O teste deve terminar com a confirmação de que Auth, PostgREST, RLS, RPCs e feed estão isolados. Se a limpeza administrativa falhar, procure usuários com prefixos `smoke-a-` e `smoke-b-`, desative-os no painel e registre qualquer curso pessoal tombstonado. Não altere constraints nem execute reset remoto para facilitar a limpeza.

## 10. Verificação antes da abertura

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

## 11. Teste funcional e operação

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
