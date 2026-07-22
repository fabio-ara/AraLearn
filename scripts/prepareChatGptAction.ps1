[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidatePattern('^https://[^/]+$')]
  [string]$ProjectUrl,

  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $PSCommandPath
$repositoryRoot = Split-Path -Parent $scriptRoot
$uri = [Uri]$ProjectUrl

if ($uri.Scheme -ne 'https' -or $uri.PathAndQuery -ne '/' -or $uri.Fragment -or $uri.Host -notmatch '^([a-z0-9]{20})\.supabase\.co$') {
  throw 'ProjectUrl deve ter o formato https://<project-ref>.supabase.co.'
}

$projectRef = $Matches[1]
if (-not $OutputPath) {
  $downloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
  $OutputPath = Join-Path $downloads "aralearn-authoring-action-$projectRef.yaml"
}

$packageRoot = Split-Path (Split-Path $scriptRoot -Parent) -Parent
$sourcePath = @(
  (Join-Path $repositoryRoot 'docs/openapi/aralearn-authoring-api-chatgpt.yaml'),
  (Join-Path $packageRoot 'docs/openapi/aralearn-authoring-api-chatgpt.yaml')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $sourcePath) {
  throw 'Não foi possível localizar aralearn-authoring-api-chatgpt.yaml.'
}
$openApi = Get-Content -LiteralPath $sourcePath -Raw -Encoding utf8
$openApi = $openApi.Replace('https://seu-projeto.supabase.co', $ProjectUrl)
if ($openApi -match 'seu-projeto|\{projectRef\}|/v1/imports|\$ref:') {
  throw 'A especificação preparada contém marcador ou recurso incompatível com Actions.'
}

$directory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $directory)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
Set-Content -LiteralPath $OutputPath -Value $openApi -Encoding utf8NoBOM

Write-Host 'Arquivo da Action preparado:'
Write-Host $OutputPath
Write-Host 'Ele não contém chave editorial. Importe-o em Actions e configure a chave arl_ somente no campo de autenticação.'
