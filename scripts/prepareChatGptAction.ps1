[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidatePattern('^https://[^/]+$')]
  [string]$ProjectUrl,

  [ValidateSet('private', 'editorial')]
  [string]$Profile = 'private',

  [ValidateSet('json', 'yaml')]
  [string]$Format = 'json',

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
  $OutputPath = Join-Path $downloads "aralearn-authoring-action-$Profile-$projectRef.$Format"
}

$packageRoot = Split-Path (Split-Path $scriptRoot -Parent) -Parent
$sourceFileName = if ($Profile -eq 'private') {
  "aralearn-authoring-api-chatgpt-private-action.$Format"
} else {
  'aralearn-authoring-api-chatgpt-editorial.yaml'
}
$sourcePath = @(
  (Join-Path $repositoryRoot "docs/openapi/$sourceFileName"),
  (Join-Path $packageRoot "docs/openapi/$sourceFileName")
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $sourcePath) {
  throw "Não foi possível localizar $sourceFileName."
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
if ($Profile -eq 'private' -and $Format -eq 'json') {
  Write-Host 'Formato JSON: use este arquivo no editor do ChatGPT; ele evita ambiguidades de leitura do YAML.'
}
if ($Profile -eq 'private') {
  Write-Host 'Perfil pessoal: cria cursos somente na conta do autor e não publica no catálogo.'
} else {
  Write-Host 'Perfil editorial: permite publicar cursos validados no catálogo.'
}
Write-Host 'O arquivo não contém credencial. Importe-o em Actions e configure a chave arl_ somente no campo de autenticação.'
