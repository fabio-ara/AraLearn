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
      'pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 -Profile GitHubPagesManagedSupabase'
    Add-Step 'supabase-project' 'Criar e proteger o projeto Supabase' manual 'Crie o projeto hospedado, configure Auth, SMTP e redirecionamentos. Não copie a service role para o repositório.'
    Add-Step 'database-preview' 'Simular as migrations' automatic 'Vincula o projeto e mostra o que seria aplicado. Revise antes de usar o modo Apply.' `
      "pwsh -NoProfile -File .\scripts\deploySupabase.ps1 -ProjectUrl $projectArgument"
    Add-Step 'database-apply' 'Aplicar as migrations aprovadas' automatic 'Executa somente migrations versionadas, sem reset nem seed.' `
      "pwsh -NoProfile -File .\scripts\deploySupabase.ps1 -ProjectUrl $projectArgument -Mode Apply"
    Add-Step 'github-variables' 'Cadastrar a configuração pública' manual 'Em Actions Variables, cadastre ARALEARN_SUPABASE_URL e ARALEARN_SUPABASE_PUBLISHABLE_KEY. ARALEARN_ASSIST_ALLOWED_ORIGINS é opcional para serviços adicionais. Não cadastre segredos administrativos.'
    Add-Step 'auth-urls' 'Cadastrar os endereços do aplicativo' manual "Use $applicationArgument/ como Site URL e permita somente os redirecionamentos realmente usados."
    Add-Step 'validate' 'Validar o repositório' automatic 'Executa cada verificação em ordem e interrompe a sequência na primeira falha.' `
      'pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Web -RequireRuntimeConfig'
    Add-Step 'verify-artifact' 'Examinar o site gerado' automatic 'Confere configuração pública, CSP, segredos e ausência de catálogo embarcado.' `
      'pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 -Target Pages -RequireRuntimeConfig'
    Add-Step 'publish' 'Publicar pelo GitHub' manual 'Integre uma branch revisada na main somente com a CI verde; o workflow publica o conteúdo de .pages.'
  }
  'StaticHostManagedSupabase' {
    Add-Step 'diagnose' 'Conferir a máquina' automatic 'Verifica ferramentas, arquivos e configuração pública usada no build.' `
      'pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 -Profile StaticHostManagedSupabase -RequireRuntimeConfig'
    Add-Step 'supabase-project' 'Criar e proteger o projeto Supabase' manual 'Crie o projeto hospedado, configure Auth, SMTP e redirecionamentos. Não copie a service role para o host estático.'
    Add-Step 'database-preview' 'Simular as migrations' automatic 'Vincula o projeto e mostra o que seria aplicado.' `
      "pwsh -NoProfile -File .\scripts\deploySupabase.ps1 -ProjectUrl $projectArgument"
    Add-Step 'database-apply' 'Aplicar as migrations aprovadas' automatic 'Executa somente migrations versionadas, sem reset nem seed.' `
      "pwsh -NoProfile -File .\scripts\deploySupabase.ps1 -ProjectUrl $projectArgument -Mode Apply"
    Add-Step 'auth-urls' 'Cadastrar os endereços do aplicativo' manual "Use $applicationArgument/ como Site URL e permita somente os redirecionamentos realmente usados."
    Add-Step 'dependencies' 'Instalar dependências' automatic 'Restaura as versões fixadas e interrompe a implantação se a instalação falhar.' 'npm.cmd ci'
    Add-Step 'build' 'Validar e gerar os arquivos estáticos' automatic 'Executa testes e validações antes de gerar e examinar .pages.' `
      'pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Web -RequireRuntimeConfig'
    Add-Step 'verify-artifact' 'Examinar os arquivos gerados' automatic 'Confere configuração pública, CSP, segredos e ausência de catálogo embarcado.' `
      'pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 -Target Pages -RequireRuntimeConfig'
    Add-Step 'upload' 'Enviar o conteúdo de .pages' manual 'Publique o conteúdo da pasta, não a própria pasta, em um servidor HTTPS que preserve arquivos e caminhos.'
    Add-Step 'functional-check' 'Conferir o endereço publicado' manual 'Teste cadastro, confirmação, login, recuperação, seleção, estudo offline, reconexão e sincronização em dois navegadores.'
  }
  'LocalDevelopment' {
    Add-Step 'diagnose' 'Conferir a máquina' automatic 'Verifica Node.js, Docker e os arquivos do repositório.' `
      'pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 -Profile LocalDevelopment'
    Add-Step 'dependencies' 'Instalar dependências do repositório' automatic 'Restaura as versões fixadas no package-lock.json.' 'npm.cmd ci'
    Add-Step 'start-supabase' 'Iniciar o Supabase local' automatic 'Inicia serviços locais em Docker; não acessa o projeto hospedado.' `
      'npx.cmd --yes supabase@2.109.1 start'
    Add-Step 'reset-local' 'Criar o banco local do zero' automatic 'Aplica migrations e seed apenas no stack local descartável.' `
      'npx.cmd --yes supabase@2.109.1 db reset'
    Add-Step 'database-tests' 'Testar o banco local' automatic 'Executa os testes SQL contra o stack local criado do zero.' `
      'npx.cmd --yes supabase@2.109.1 test db'
    Add-Step 'application-tests' 'Testar a aplicação' automatic 'Valida runtime, contrato e código sem usar credenciais hospedadas.' `
      'pwsh -NoProfile -File .\scripts\validateDeployment.ps1 -Scope Core'
    Add-Step 'run' 'Abrir o aplicativo local' automatic 'Use as configurações públicas informadas pelo Supabase local e inicie o servidor.' 'npm.cmd run dev'
    Add-Step 'stop' 'Encerrar o stack local' automatic 'Descarta os contêineres de teste sem criar backup local.' `
      'npx.cmd --yes supabase@2.109.1 stop --no-backup'
  }
}

if ($IncludeAndroid) {
  Add-Step 'android-diagnose' 'Conferir ferramentas Android' automatic 'Verifica Java e Android SDK, além da configuração pública.' `
    "pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 -Profile $Profile -Android -RequireRuntimeConfig"
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
