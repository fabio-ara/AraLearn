[CmdletBinding()]
param(
  [ValidateSet('GitHubPagesManagedSupabase', 'StaticHostManagedSupabase', 'LocalDevelopment')]
  [string]$Profile = 'GitHubPagesManagedSupabase',

  [switch]$Android,

  [switch]$Authoring,

  [switch]$RequireRuntimeConfig,

  [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploymentSupport.ps1')

$repositoryRoot = Resolve-AraLearnRepositoryRoot -ScriptRoot $PSScriptRoot
$checks = [Collections.Generic.List[object]]::new()

function Add-Check {
  param(
    [Parameter(Mandatory)][string]$Id,
    [Parameter(Mandatory)][ValidateSet('ok', 'warning', 'blocked')][string]$Status,
    [Parameter(Mandatory)][string]$Message
  )

  $checks.Add([pscustomobject]@{ id = $Id; status = $Status; message = $Message })
}

function Test-CommandAvailable {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Label,
    [switch]$Required
  )

  if (Get-Command $Name -ErrorAction SilentlyContinue) {
    Add-Check -Id "tool.$Name" -Status ok -Message "$Label está disponível."
    return $true
  }

  Add-Check -Id "tool.$Name" -Status $(if ($Required) { 'blocked' } else { 'warning' }) `
    -Message "$Label não foi encontrado."
  return $false
}

Push-Location $repositoryRoot
try {
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    Add-Check -Id 'tool.pwsh' -Status ok -Message "PowerShell $($PSVersionTable.PSVersion) disponível."
  }
  else {
    Add-Check -Id 'tool.pwsh' -Status blocked -Message 'Use PowerShell 7 ou posterior.'
  }

  $nodeAvailable = Test-CommandAvailable -Name node -Label 'Node.js' -Required
  Test-CommandAvailable -Name npm.cmd -Label 'npm' -Required | Out-Null
  $npxAvailable = Test-CommandAvailable -Name npx.cmd -Label 'npx' -Required
  Test-CommandAvailable -Name git -Label 'Git' -Required | Out-Null

  if ($nodeAvailable) {
    $nodeVersionText = (& node --version 2>$null).Trim()
    $nodeMajor = if ($nodeVersionText -match '^v(\d+)') { [int]$Matches[1] } else { 0 }
    if ($nodeMajor -ge 22) {
      Add-Check -Id 'version.node' -Status ok -Message "Node.js $nodeVersionText atende ao ambiente validado."
    }
    else {
      Add-Check -Id 'version.node' -Status blocked -Message "Node.js 22 ou posterior é necessário; encontrado $nodeVersionText."
    }
  }

  foreach ($requiredPath in @('package.json', 'package-lock.json', 'supabase/config.toml', 'supabase/migrations', 'public/index.html')) {
    if (Test-Path -LiteralPath (Join-Path $repositoryRoot $requiredPath)) {
      Add-Check -Id "repository.$($requiredPath.Replace('/', '.'))" -Status ok -Message "$requiredPath encontrado."
    }
    else {
      Add-Check -Id "repository.$($requiredPath.Replace('/', '.'))" -Status blocked -Message "$requiredPath está ausente."
    }
  }

  if (Test-Path -LiteralPath (Join-Path $repositoryRoot 'node_modules')) {
    Add-Check -Id 'dependencies.node' -Status ok -Message 'Dependências Node.js instaladas.'
  }
  else {
    Add-Check -Id 'dependencies.node' -Status warning -Message 'Execute npm.cmd ci antes dos testes e builds.'
  }

  if ($Profile -eq 'LocalDevelopment') {
    if ($npxAvailable) {
      $supabaseVersion = @(& npx.cmd --yes supabase@2.115.0 --version 2>&1)
      if ($LASTEXITCODE -eq 0 -and ($supabaseVersion -join ' ') -match '2\.115\.0') {
        Add-Check -Id 'tool.supabase-cli' -Status ok -Message 'Supabase CLI 2.115.0 disponível pelo npx.'
      }
      else {
        Add-Check -Id 'tool.supabase-cli' -Status blocked -Message 'Não foi possível executar a Supabase CLI 2.115.0 pelo npx.'
      }
    }

    $dockerAvailable = Test-CommandAvailable -Name docker -Label 'Docker' -Required
    if ($dockerAvailable) {
      & docker info --format '{{.ServerVersion}}' *> $null
      if ($LASTEXITCODE -eq 0) {
        Add-Check -Id 'service.docker' -Status ok -Message 'Docker está em execução para o Supabase local.'
      }
      else {
        Add-Check -Id 'service.docker' -Status blocked -Message 'Docker está instalado, mas o serviço não respondeu.'
      }
    }

    try {
      $driveRoot = [IO.Path]::GetPathRoot($repositoryRoot)
      $drive = [IO.DriveInfo]::new($driveRoot)
      $freeGiB = [Math]::Round($drive.AvailableFreeSpace / 1GB, 1)
      Add-Check -Id 'capacity.disk' -Status $(if ($freeGiB -ge 10) { 'ok' } else { 'warning' }) `
        -Message "Espaço livre na unidade do repositório: $freeGiB GiB."
    }
    catch {
      Add-Check -Id 'capacity.disk' -Status warning -Message 'Não foi possível medir o espaço livre da unidade.'
    }

    try {
      $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
      $occupied = @($listeners | Where-Object Port -in @(54321, 54322, 54323, 54324) | Select-Object -ExpandProperty Port -Unique)
      if ($occupied.Count -eq 0) {
        Add-Check -Id 'network.supabase-ports' -Status ok -Message 'As portas locais 54321 a 54324 estão livres.'
      }
      else {
        Add-Check -Id 'network.supabase-ports' -Status warning `
          -Message "Portas já ocupadas: $($occupied -join ', '). Confirme se pertencem a um stack Supabase já iniciado."
      }
    }
    catch {
      Add-Check -Id 'network.supabase-ports' -Status warning -Message 'Não foi possível conferir as portas locais do Supabase.'
    }

    if ($IsWindows) {
      if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
        & wsl.exe --status *> $null
        Add-Check -Id 'platform.wsl' -Status $(if ($LASTEXITCODE -eq 0) { 'ok' } else { 'warning' }) `
          -Message $(if ($LASTEXITCODE -eq 0) { 'WSL respondeu corretamente.' } else { 'WSL existe, mas requer configuração ou reinicialização.' })
      }
      else {
        Add-Check -Id 'platform.wsl' -Status warning -Message 'WSL não foi encontrado; confirme o backend exigido pelo Docker Desktop.'
      }
      try {
        $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
        Add-Check -Id 'platform.hypervisor' -Status $(if ($computer.HypervisorPresent) { 'ok' } else { 'warning' }) `
          -Message $(if ($computer.HypervisorPresent) { 'Hipervisor detectado.' } else { 'Hipervisor não detectado; a virtualização pode precisar ser habilitada.' })
      }
      catch {
        Add-Check -Id 'platform.hypervisor' -Status warning -Message 'Não foi possível consultar a virtualização do Windows.'
      }
    }
  }

  if ($Authoring) {
    Test-CommandAvailable -Name deno -Label 'Deno' -Required | Out-Null
  }

  if ($Android) {
    $javaAvailable = Test-CommandAvailable -Name java -Label 'Java' -Required
    if ($javaAvailable) {
      $javaVersion = @(& java -version 2>&1) -join ' '
      $javaMajor = if ($javaVersion -match '(?:version\s+")?(\d+)(?:\.|\")') { [int]$Matches[1] } else { 0 }
      Add-Check -Id 'version.java' -Status $(if ($javaMajor -eq 17) { 'ok' } else { 'blocked' }) `
        -Message $(if ($javaMajor -eq 17) { 'Java 17 atende ao build Android.' } else { 'O build Android exige Java 17.' })
    }
    $sdkCandidates = @(
      $env:ANDROID_SDK_ROOT,
      $env:ANDROID_HOME,
      $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Android\Sdk' })
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    if ($sdkCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1) {
      Add-Check -Id 'tool.android-sdk' -Status ok -Message 'Android SDK encontrado.'
    }
    else {
      Add-Check -Id 'tool.android-sdk' -Status blocked -Message 'Android SDK não foi encontrado.'
    }
  }

  if ($RequireRuntimeConfig) {
    $url = [string]($env:ARALEARN_SUPABASE_URL ?? '')
    $key = [string]($env:ARALEARN_SUPABASE_PUBLISHABLE_KEY ?? '')
    $allowLocal = $Profile -eq 'LocalDevelopment'
    if (Test-AraLearnProjectUrl -Url $url -AllowLocal:$allowLocal) {
      Add-Check -Id 'config.project-url' -Status ok -Message 'Project URL pública válida.'
    }
    else {
      Add-Check -Id 'config.project-url' -Status blocked -Message 'ARALEARN_SUPABASE_URL está ausente ou inválida.'
    }
    if (Test-AraLearnPublishableKey -Key $key) {
      Add-Check -Id 'config.publishable-key' -Status ok -Message 'Publishable key pública válida.'
    }
    else {
      Add-Check -Id 'config.publishable-key' -Status blocked -Message 'ARALEARN_SUPABASE_PUBLISHABLE_KEY está ausente, inválida ou administrativa.'
    }
  }
  else {
    Add-Check -Id 'config.runtime' -Status warning -Message 'A configuração pública será obrigatória no build destinado a usuários.'
  }

  foreach ($secretName in @('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD')) {
    if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($secretName))) {
      Add-Check -Id "secret.$secretName" -Status blocked -Message "$secretName está presente no processo. Remova-a antes do build."
    }
  }

  & git check-ignore --quiet -- 'supabase/.temp/'
  if ($LASTEXITCODE -eq 0) {
    Add-Check -Id 'repository.supabase-temp-ignore' -Status ok -Message 'supabase/.temp permanece fora do versionamento.'
  }
  else {
    Add-Check -Id 'repository.supabase-temp-ignore' -Status blocked -Message 'Inclua supabase/.temp/ no .gitignore antes de vincular um projeto.'
  }

  $blocked = @($checks | Where-Object status -eq 'blocked').Count
  $result = [pscustomobject]@{
    profile = $Profile
    ready = $blocked -eq 0
    android = [bool]$Android
    checks = @($checks)
  }

  if ($AsJson) {
    $result | ConvertTo-Json -Depth 5
  }
  else {
    Write-Host "Diagnóstico: $Profile"
    foreach ($check in $checks) {
      $mark = switch ($check.status) { 'ok' { '[OK]' } 'warning' { '[AVISO]' } default { '[BLOQUEIO]' } }
      Write-Host "$mark $($check.message)"
    }
    Write-Host $(if ($result.ready) { 'Ambiente pronto para a etapa escolhida.' } else { 'Corrija os bloqueios antes de continuar.' })
  }

  if (-not $result.ready) {
    exit 1
  }
}
finally {
  Pop-Location
}
