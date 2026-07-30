[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://[^/]+$')]
  [string]$ProjectUrl,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://[^/]+$')]
  [string]$Origin
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$secureToken = Read-Host 'Cole um access token OAuth emitido pelo Supabase para o MCP' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

Push-Location $repositoryRoot
try {
  $accessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($accessToken -notmatch '^[^.]+\.[^.]+\.[^.]+$') {
    throw 'Informe um access token OAuth JWT válido.'
  }
  $env:SUPABASE_URL = $ProjectUrl
  $env:ARALEARN_AUTHORING_MCP_ORIGIN = $Origin
  $env:ARALEARN_AUTHORING_MCP_OAUTH_TOKEN = $accessToken
  npm.cmd run test:authoring:mcp:hosted
  if ($LASTEXITCODE -ne 0) {
    throw 'O smoke hospedado do gateway MCP falhou.'
  }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ARALEARN_AUTHORING_MCP_ORIGIN -ErrorAction SilentlyContinue
  Remove-Item Env:ARALEARN_AUTHORING_MCP_OAUTH_TOKEN -ErrorAction SilentlyContinue
  Remove-Variable accessToken, secureToken, pointer -ErrorAction SilentlyContinue
  Pop-Location
}
