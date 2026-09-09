[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('GitHubPagesManagedSupabase', 'StaticHostManagedSupabase', 'LocalDevelopment')]
  [string]$Profile,

  [string]$ApplicationUrl = '',

  [string]$ProjectUrl = '',

  [switch]$IncludeAndroid,

  [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploymentSupport.ps1')

if ($ApplicationUrl) {
  try {
    $applicationUri = [Uri]$ApplicationUrl
  }
  catch {
    throw 'ApplicationUrl deve ser uma URL válida.'
  }
  $local = $applicationUri.IsAbsoluteUri -and (Test-AraLearnLocalHost -Uri $applicationUri)
  if (
    -not $applicationUri.IsAbsoluteUri -or
    $applicationUri.Query -or
    $applicationUri.Fragment -or
    ($applicationUri.Scheme -ne 'https' -and -not ($local -and $applicationUri.Scheme -eq 'http'))
  ) {
    throw 'ApplicationUrl deve usar HTTPS; HTTP é aceito somente em localhost.'
  }
}

if ($ProjectUrl -and -not (Test-AraLearnProjectUrl -Url $ProjectUrl -AllowLocal:($Profile -eq 'LocalDevelopment'))) {
  throw 'ProjectUrl deve ser uma Project URL HTTPS; no desenvolvimento local, localhost por HTTP também é aceito.'
}

$projectArgument = if ($ProjectUrl) { $ProjectUrl } else { 'https://<project-ref>.supabase.co' }
$applicationArgument = if ($ApplicationUrl) { $ApplicationUrl.TrimEnd('/') } else { 'https://<endereco-da-aplicacao>' }
$steps = [Collections.Generic.List[object]]::new()

function Add-Step {
  param(
    [Parameter(Mandatory)][string]$Id,
    [Parameter(Mandatory)][string]$Title,
    [Parameter(Mandatory)][ValidateSet('automatic', 'manual')][string]$Kind,
    [Parameter(Mandatory)][string]$Instruction,
    [string]$Command = ''
  )

  $steps.Add([pscustomobject]@{
    id = $Id
    title = $Title
    kind = $Kind
    instruction = $Instruction
    command = $Command
  })
}

switch ($Profile) {
  'GitHubPagesManagedSupabase' {
    Add-Step 'diagnose' 'Conferir a máquina' automatic 'Verifica ferramentas, arquivos e configuração pública sem acessar o projeto remoto.' `
      'pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 -Profile GitHubPagesManagedSupabase -Authoring'
    Add-Step 'supabase-project' 'Criar e proteger o projeto Supabase' manual 'Crie o projeto hospedado, configure Auth, SMTP e redirecionamentos. Não copie a service role para o repositório.'
    Add-Step 'github-variables' 'Cadastrar a configuração pública' manual 'Em Actions Variables, cadastre ARALEARN_SUPABASE_URL e ARALEARN_SUPABASE_PUBLISHABLE_KEY. Não cadastre segredos administrativos.'
    Add-Step 'auth-urls' 'Cadastrar os endereços do aplicativo' manual "Use $applicationArgument/ como Site URL e permita somente os redirecionamentos realmente usados. No OAuth Server, habilite DCR e use / como Authorization Path, pois a tela de consentimento está no próprio shell."
    Add-Step 'auth-oauth-signing' 'Concluir a segurança OAuth do MCP' manual 'Ative uma chave JWT assimétrica, selecione public.aralearn_mcp_access_token_hook como Custom Access Token Hook e confirme PKCE S256 na descoberta.'
    Add-Step 'database-preview' 'Simular as migrations' automatic 'Vincula o projeto e mostra o que seria aplicado. Revise antes de usar o modo Apply.' `
      "pwsh -NoProfile -File .\scripts\deploySupabase.ps1 -ProjectUrl $projectArgument"
    Add-Step 'validate' 'Validar o repositório' automatic 'Executa cada verificação em ordem e interrompe a sequência na primeira falha.' `
      'pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Web -RequireRuntimeConfig'
    Add-Step 'verify-artifact' 'Examinar o site gerado' automatic 'Confere configuração pública, CSP, segredos e ausência de catálogo embarcado.' `
      'pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 -Target Pages -RequireRuntimeConfig'
    if ($IncludeAndroid) {
      Add-Step 'android-diagnose' 'Conferir ferramentas Android' automatic 'Verifica Java e Android SDK, além da configuração pública.' `
        'pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 -Profile GitHubPagesManagedSupabase -Authoring -Android -RequireRuntimeConfig'
      Add-Step 'android-build' 'Gerar e analisar o APK' automatic 'Executa a validação completa, compila o APK e interrompe a sequência na primeira falha. A release requer assinatura mantida fora do repositório.' `
        'pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Full -RequireRuntimeConfig'
      Add-Step 'android-verify' 'Examinar o runtime Android' automatic 'Confere configuração pública, segredos e ausência de catálogo embarcado.' `
        'pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 -Target Android -RequireRuntimeConfig'
    }
    Add-Step 'integrate-main' 'Integrar e validar a revisão' manual 'Conclua candidate:ready e a integral protegida Testar e validar, depois integre a candidata por merge normal. Preserve o run integral e sua tentativa exata; o publicador confere vínculo com o PR integrado, árvore e configuração. Pages é publicado somente pelas fases explícitas de pages.yml.'
    Add-Step 'prepare-product' 'Preparar os artefatos da promoção' manual 'Com site e backend anteriores ainda correspondentes, execute preparar no SHA integrado. Aguarde assinatura histórica, conferência dos artefatos e prova nativa de instalação e upgrade. Registre o run e a tentativa desta preparação; ela não publica o produto nem comprova o backend novo.' `
      'gh workflow run pages.yml --ref main -f phase=preparar -f candidate_run_id=<run-integral> -f candidate_run_attempt=<tentativa-integral>'
    Add-Step 'backup-restore' 'Concluir a recuperação anterior ao corte' manual 'Preserve um backup atual do banco e dos objetos Storage afetados, com hashes, direitos e restauração ensaiada. A prova sintética local não substitui o backup hospedado atual. Defina a atualização dos clientes instalados e prepare a publicação pronta do site e dos contratos de MCP e Actions.'
    Add-Step 'database-apply' 'Aplicar migrations e funções aprovadas' automatic 'Depois da preparação e da recuperação verificadas, aplica migrations versionadas, sem reset nem seed, e implanta API, MCP e Actions. Se uma resposta se perder, confira migrations e estado publicado antes de repetir.' `
      "pwsh -NoProfile -File .\scripts\deploySupabase.ps1 -ProjectUrl $projectArgument -Mode Apply -DeployAuthoringFunctions -PublicAppUrl $applicationArgument/"
    Add-Step 'verify-hosted' 'Conferir o contrato hospedado' automatic 'Comprova o manifesto remoto exigido pelos artefatos antes de publicar o site. A prova de manifesto não substitui as jornadas dos clientes reais.' `
      'npm.cmd run deployment:verify-hosted'
    Add-Step 'publish' 'Publicar o site da preparação aprovada' manual 'Execute publicar_site com o run e a tentativa de preparar. O workflow recupera os mesmos bytes Pages, APK e prova nativa, verifica o backend, publica o site e guarda o APK em Release rascunho. Atualize OpenAPI, instruções e Knowledge de Actions e a conexão MCP de forma coordenada com o backend.' `
      'gh workflow run pages.yml --ref main -f phase=publicar_site -f promotion_run_id=<run-preparar> -f promotion_run_attempt=<tentativa-preparar>'
    Add-Step 'verify-published' 'Conferir o endereço publicado' automatic 'Valida recursos, MIME, CSP, configuração pública e callback PKCE. O workflow também confere tamanho e SHA-256 de todos os arquivos contra o manifesto da candidata.' `
      "npm.cmd run deployment:verify-site -- --url $applicationArgument/"
    Add-Step 'client-proof' 'Conferir as jornadas hospedadas da candidata' manual 'Execute e registre as provas requeridas de autenticação, Estudo, Autoria, MCP e Actions em sessões novas e existentes. Releia as escritas, reconcilie resultados incertos e limpe somente fixtures registradas. Uma prova obrigatória pendente impede a finalização.'
    Add-Step 'finalize-release' 'Concluir a Release verificada' manual 'Após as provas reais, execute finalizar_release com o run e a tentativa de publicar_site. O workflow reconfere backend, site, prova nativa, APK, checksum e recibo antes de tornar a mesma Release pública.' `
      'gh workflow run pages.yml --ref main -f phase=finalizar_release -f promotion_run_id=<run-publicar-site> -f promotion_run_attempt=<tentativa-publicar-site>'
  }
  'StaticHostManagedSupabase' {
    Add-Step 'diagnose' 'Conferir a máquina' automatic 'Verifica ferramentas, arquivos e configuração pública usada no build.' `
      'pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 -Profile StaticHostManagedSupabase -Authoring -RequireRuntimeConfig'
    Add-Step 'supabase-project' 'Criar e proteger o projeto Supabase' manual 'Crie o projeto hospedado, configure Auth, SMTP e redirecionamentos. Não copie a service role para o host estático.'
    Add-Step 'database-preview' 'Simular as migrations' automatic 'Vincula o projeto e mostra o que seria aplicado.' `
      "pwsh -NoProfile -File .\scripts\deploySupabase.ps1 -ProjectUrl $projectArgument"
    Add-Step 'database-apply' 'Aplicar migrations e funções aprovadas' automatic 'Executa migrations versionadas, sem reset nem seed, e implanta a API e o MCP.' `
      "pwsh -NoProfile -File .\scripts\deploySupabase.ps1 -ProjectUrl $projectArgument -Mode Apply -DeployAuthoringFunctions -PublicAppUrl $applicationArgument/"
    Add-Step 'auth-urls' 'Cadastrar os endereços do aplicativo' manual "Use $applicationArgument/ como Site URL e permita somente os redirecionamentos realmente usados. No OAuth Server, habilite DCR e use / como Authorization Path, pois a tela de consentimento está no próprio shell."
    Add-Step 'auth-oauth-signing' 'Concluir a segurança OAuth do MCP' manual 'Ative uma chave JWT assimétrica, selecione public.aralearn_mcp_access_token_hook como Custom Access Token Hook e confirme PKCE S256 na descoberta.'
    Add-Step 'dependencies' 'Instalar dependências' automatic 'Restaura as versões fixadas e interrompe a implantação se a instalação falhar.' 'npm.cmd ci'
    Add-Step 'build' 'Validar e gerar os arquivos estáticos' automatic 'Executa testes e validações antes de gerar e examinar .pages.' `
      'pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Web -RequireRuntimeConfig'
    Add-Step 'verify-artifact' 'Examinar os arquivos gerados' automatic 'Confere configuração pública, CSP, segredos e ausência de catálogo embarcado.' `
      'pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 -Target Pages -RequireRuntimeConfig'
    Add-Step 'upload' 'Enviar o conteúdo de .pages' manual 'Publique o conteúdo da pasta, não a própria pasta, em um servidor HTTPS que preserve arquivos e caminhos.'
    Add-Step 'verify-published' 'Conferir o endereço publicado' automatic 'Valida recursos, MIME, CSP, configuração pública e callback PKCE no endereço entregue pelo servidor.' `
      "npm.cmd run deployment:verify-site -- --url $applicationArgument/"
    Add-Step 'functional-check' 'Conferir o endereço publicado' manual 'Teste cadastro, confirmação, login, recuperação, seleção, estudo offline, reconexão e sincronização em dois navegadores.'
  }
  'LocalDevelopment' {
    Add-Step 'diagnose' 'Conferir a máquina' automatic 'Verifica Node.js, Docker e os arquivos do repositório.' `
      'pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 -Profile LocalDevelopment -Authoring'
    Add-Step 'dependencies' 'Instalar dependências do repositório' automatic 'Restaura as versões fixadas no package-lock.json.' 'npm.cmd ci'
    Add-Step 'start-supabase' 'Iniciar o Supabase local' automatic 'Inicia serviços locais em Docker; não acessa o projeto hospedado.' `
      'npx.cmd --yes supabase@2.115.0 start'
    Add-Step 'reset-local' 'Criar o banco local do zero' automatic 'Aplica migrations e seed apenas no stack local descartável.' `
      'npx.cmd --yes supabase@2.115.0 db reset'
    Add-Step 'database-tests' 'Testar o stack local' automatic 'Executa lint, pgTAP, Auth por e-mail, PostgREST, RLS, gateway MCP e leitura de revisões contra o banco recriado.' `
      'pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1'
    Add-Step 'application-tests' 'Testar a aplicação' automatic 'Valida runtime, contrato e código sem usar credenciais hospedadas.' `
      'pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Core'
    Add-Step 'run' 'Abrir o aplicativo local' automatic 'Use as configurações públicas informadas pelo Supabase local e inicie o servidor.' 'npm.cmd run dev'
    Add-Step 'stop' 'Encerrar o stack local' automatic 'Descarta os contêineres de teste sem criar backup local.' `
      'npx.cmd --yes supabase@2.115.0 stop --no-backup'
  }
}

if ($IncludeAndroid -and $Profile -ne 'GitHubPagesManagedSupabase') {
  Add-Step 'android-diagnose' 'Conferir ferramentas Android' automatic 'Verifica Java e Android SDK, além da configuração pública.' `
    "pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 -Profile $Profile -Authoring -Android -RequireRuntimeConfig"
  Add-Step 'android-build' 'Gerar e analisar o APK' automatic 'Executa a validação completa, compila o APK e interrompe a sequência na primeira falha. A release requer assinatura mantida fora do repositório.' `
    'pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Full -RequireRuntimeConfig'
  Add-Step 'android-verify' 'Examinar o runtime Android' automatic 'Confere configuração pública, segredos e ausência de catálogo embarcado.' `
    'pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 -Target Android -RequireRuntimeConfig'
}

$plan = [pscustomobject]@{
  profile = $Profile
  support = 'supported'
  applicationUrl = $ApplicationUrl
  projectUrl = $ProjectUrl
  steps = @($steps)
}

if ($AsJson) {
  $plan | ConvertTo-Json -Depth 6
  return
}

Write-Host "Plano de implantação: $Profile"
$position = 0
foreach ($step in $steps) {
  $position += 1
  $kind = if ($step.kind -eq 'automatic') { 'comando' } else { 'painel ou operação' }
  Write-Host "`n$position. $($step.title) [$kind]"
  Write-Host $step.instruction
  if ($step.command) {
    Write-Host "   $($step.command)"
  }
}
