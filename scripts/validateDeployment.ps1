[CmdletBinding()]
param(
  [ValidateSet('Core', 'Web', 'Full')]
  [string]$Scope = 'Web',

  [switch]$RequireRuntimeConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploymentSupport.ps1')

$repositoryRoot = Resolve-AraLearnRepositoryRoot -ScriptRoot $PSScriptRoot

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$Arguments = @()
  )

  Write-Host "`n== $Label =="
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label falhou com código $LASTEXITCODE. As etapas seguintes não foram executadas."
  }
}

Push-Location $repositoryRoot
try {
  Invoke-CheckedCommand 'Testes JavaScript' 'npm.cmd' @('test')
  Invoke-CheckedCommand 'Análise estática' 'npm.cmd' @('run', 'lint')
  Invoke-CheckedCommand 'Exemplo público' 'npm.cmd' @('run', 'validate:example')
  Invoke-CheckedCommand 'Runtime de Curso' 'npm.cmd' @('run', 'validate:course-runtime')

  $deno = Resolve-AraLearnDenoCommand
  Invoke-CheckedCommand 'Testes Deno do gateway MCP' $deno @(
    'test', '--config', 'supabase/functions/deno.json',
    'supabase/functions/tests/aralearn-authoring-mcp.test.ts'
  )
  Invoke-CheckedCommand 'Verificação Deno do gateway MCP' $deno @(
    'check', '--config', 'supabase/functions/deno.json',
    'supabase/functions/aralearn-authoring-mcp/index.ts'
  )
  Invoke-CheckedCommand 'Verificação Deno da API de Cursos' $deno @(
    'check', '--config', 'supabase/functions/deno.json',
    'supabase/functions/aralearn-course-api/index.ts'
  )

  if ($Scope -in @('Web', 'Full')) {
    Invoke-CheckedCommand 'Build web' 'npm.cmd' @('run', 'pages:build')
    $artifactArguments = @(
      '-NoProfile',
      '-File',
      (Join-Path $PSScriptRoot 'verifyDeploymentArtifacts.ps1'),
      '-Target',
      'Pages'
    )
    if ($RequireRuntimeConfig) {
      $artifactArguments += '-RequireRuntimeConfig'
    }
    Invoke-CheckedCommand 'Inspeção do artefato web' 'pwsh' $artifactArguments
    Invoke-CheckedCommand 'Testes no navegador' 'npm.cmd' @('run', 'test:e2e')
  }

  if ($Scope -eq 'Full') {
    Invoke-CheckedCommand 'Build Android' 'npm.cmd' @('run', 'android:debug')
    Invoke-CheckedCommand 'Lint Android' (Join-Path $repositoryRoot 'android\gradlew.bat') @(
      '-p',
      (Join-Path $repositoryRoot 'android'),
      ':app:lintDebug',
      '--no-daemon'
    )
    $androidArtifactArguments = @(
      '-NoProfile',
      '-File',
      (Join-Path $PSScriptRoot 'verifyDeploymentArtifacts.ps1'),
      '-Target',
      'Android'
    )
    if ($RequireRuntimeConfig) {
      $androidArtifactArguments += '-RequireRuntimeConfig'
    }
    Invoke-CheckedCommand 'Inspeção do artefato Android' 'pwsh' $androidArtifactArguments
  }

  Write-Host "`nValidação concluída sem falhas."
}
finally {
  Pop-Location
}
