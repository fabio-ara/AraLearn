[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $PSScriptRoot 'deploymentSupport.ps1')
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "aralearn-supabase-$PID"
$edgeProcesses = [Collections.Generic.List[Diagnostics.Process]]::new()
$environmentNames = @(
  'ARALEARN_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
)
$previousEnvironment = @{}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$Arguments = @()
  )

  Write-Host "`n== $Label =="
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label falhou com código $LASTEXITCODE."
  }
}

function Get-LocalSupabaseStatus {
  $source = @(& npx.cmd --yes supabase@2.109.1 status -o json 2>&1) -join "`n"
  if ($LASTEXITCODE -ne 0) {
    throw 'O Supabase local não respondeu. Execute npx.cmd --yes supabase@2.109.1 start.'
  }
  $objectStart = $source.IndexOf('{')
  if ($objectStart -lt 0) {
    throw 'A Supabase CLI não retornou o estado local em JSON.'
  }
  return $source.Substring($objectStart) | ConvertFrom-Json
}

function Assert-LocalProjectUrl {
  param([Parameter(Mandatory)][string]$Value)

  $uri = [Uri]$Value
  if ($uri.Scheme -ne 'http' -or $uri.Host -notin @('127.0.0.1', 'localhost', '::1', '[::1]')) {
    throw 'Esta validação aceita somente o stack Supabase local descartável.'
  }
}

function Start-LocalEdgeFunction {
  param([Parameter(Mandatory)][string]$Name)

  $stdout = Join-Path $temporaryRoot "$Name.stdout.log"
  $stderr = Join-Path $temporaryRoot "$Name.stderr.log"
  $arguments = @(
    '--yes',
    'supabase@2.109.1',
    'functions',
    'serve',
    $Name,
    '--no-verify-jwt'
  )
  $parameters = @{
    FilePath = 'npx.cmd'
    ArgumentList = $arguments
    WorkingDirectory = $repositoryRoot
    PassThru = $true
    RedirectStandardOutput = $stdout
    RedirectStandardError = $stderr
  }
  if ($IsWindows) {
    $parameters.WindowStyle = 'Hidden'
  }
  $process = Start-Process @parameters
  $edgeProcesses.Add($process)
  return [pscustomobject]@{ Process = $process; Stdout = $stdout; Stderr = $stderr }
}

function Wait-LocalEdgeFunction {
  param(
    [Parameter(Mandatory)][string]$Url,
    [Parameter(Mandatory)][Diagnostics.Process]$Process
  )

  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    if ($Process.HasExited) {
      throw "A função local terminou antes de responder: $Url"
    }
    try {
      $response = Invoke-WebRequest -Uri $Url -Method Options -Headers @{ Origin = 'http://127.0.0.1:4182' } `
        -SkipHttpErrorCheck -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    }
    catch {
      # O worker pode recusar a conexão durante a inicialização.
    }
    Start-Sleep -Milliseconds 500
  }
  throw "A função local não respondeu dentro do prazo: $Url"
}

function Stop-LocalEdgeFunction {
  param([Diagnostics.Process]$Process)

  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    $Process.WaitForExit(5000)
  }
}

function Show-EdgeFailureLog {
  param([Parameter(Mandatory)]$Handle)

  foreach ($path in @($Handle.Stdout, $Handle.Stderr)) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    Get-Content -LiteralPath $path -Tail 200 |
      ForEach-Object {
        $_ `
          -replace '(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)[A-Za-z0-9_-]+', '[credencial JWT omitida]'
      } |
      Write-Host
  }
}

Push-Location $repositoryRoot
try {
  foreach ($name in $environmentNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  }
  New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null

  $status = Get-LocalSupabaseStatus
  $apiUrl = [string]$status.API_URL
  $publishableKey = [string]$status.ANON_KEY
  $serviceRoleKey = [string]$status.SERVICE_ROLE_KEY
  Assert-LocalProjectUrl -Value $apiUrl
  if ([string]::IsNullOrWhiteSpace($publishableKey) -or [string]::IsNullOrWhiteSpace($serviceRoleKey)) {
    throw 'O estado local não contém as chaves efêmeras necessárias aos testes.'
  }

  $env:ARALEARN_SUPABASE_URL = $apiUrl
  $env:SUPABASE_URL = $apiUrl
  $env:SUPABASE_PUBLISHABLE_KEY = $publishableKey
  $env:SUPABASE_SERVICE_ROLE_KEY = $serviceRoleKey

  $deno = Resolve-AraLearnDenoCommand
  Invoke-CheckedCommand 'Testes Deno do gateway MCP' $deno @(
    'test', '--config', 'supabase/functions/deno.json',
    'supabase/functions/tests/aralearn-authoring-mcp.test.ts'
  )
  Invoke-CheckedCommand 'Testes Deno da entrega de revisões' $deno @(
    'test', '--config', 'supabase/functions/deno.json',
    'supabase/functions/tests/aralearn-course-revisions.test.ts'
  )
  Invoke-CheckedCommand 'Verificação Deno do gateway MCP' $deno @(
    'check', '--config', 'supabase/functions/deno.json',
    'supabase/functions/aralearn-authoring-mcp/index.ts'
  )
  Invoke-CheckedCommand 'Verificação Deno da Action de autoria' $deno @(
    'check', '--config', 'supabase/functions/deno.json',
    'supabase/functions/aralearn-authoring-action/index.ts'
  )
  Invoke-CheckedCommand 'Verificação Deno da entrega de revisões' $deno @(
    'check', '--config', 'supabase/functions/deno.json',
    'supabase/functions/aralearn-course-revisions/index.ts'
  )

  Invoke-CheckedCommand 'Lint do banco local' 'npx.cmd' @(
    '--yes', 'supabase@2.109.1', 'db', 'lint', '--local', '--level', 'warning', '--fail-on', 'warning'
  )
  Invoke-CheckedCommand 'Testes pgTAP' 'npx.cmd' @('--yes', 'supabase@2.109.1', 'test', 'db', '--local')
  Invoke-CheckedCommand 'Publicação da fixture temporária' 'node' @(
    '.\scripts\publishCatalogFixtures.mjs',
    '--publish',
    '--course',
    'fundamentos-ia-analise-dados-seed-course.json'
  )
  Invoke-CheckedCommand 'Smoke de Auth, PostgREST e RLS' 'npm.cmd' @('run', 'test:supabase:smoke')
  Invoke-CheckedCommand 'Smoke dos e-mails de Auth' 'node' @('.\supabase\tests\auth-email-smoke.mjs')

  $mcpHandle = Start-LocalEdgeFunction -Name 'aralearn-authoring-mcp'
  try {
    Wait-LocalEdgeFunction -Url "$apiUrl/functions/v1/aralearn-authoring-mcp" -Process $mcpHandle.Process
    Invoke-CheckedCommand 'Smoke do gateway MCP de autoria' 'npm.cmd' @('run', 'test:authoring:mcp:local')
  }
  catch {
    Show-EdgeFailureLog -Handle $mcpHandle
    throw
  }
  finally {
    Stop-LocalEdgeFunction -Process $mcpHandle.Process
  }

  $revisionHandle = Start-LocalEdgeFunction -Name 'aralearn-course-revisions'
  try {
    Wait-LocalEdgeFunction `
      -Url "$apiUrl/functions/v1/aralearn-course-revisions/00000000-0000-4000-8000-000000000000/$('0' * 64)" `
      -Process $revisionHandle.Process
  }
  catch {
    Show-EdgeFailureLog -Handle $revisionHandle
    throw
  }
  finally {
    Stop-LocalEdgeFunction -Process $revisionHandle.Process
  }

  Write-Host "`nSupabase local validado sem falhas."
}
finally {
  foreach ($process in $edgeProcesses) {
    Stop-LocalEdgeFunction -Process $process
  }
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
  }
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
  Pop-Location
}
