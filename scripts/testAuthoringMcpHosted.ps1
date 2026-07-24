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
$secureKey = Read-Host 'Cole a chave arl_ restrita' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

Push-Location $repositoryRoot
try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($apiKey -notmatch '^arl_[A-Za-z0-9_-]{24,192}$') {
    throw 'A chave deve começar por arl_ e usar o formato emitido pelo AraLearn.'
  }
  $env:SUPABASE_URL = $ProjectUrl
  $env:ARALEARN_AUTHORING_MCP_ORIGIN = $Origin
  $env:ARALEARN_AUTHORING_MCP_API_KEY = $apiKey
  npm.cmd run test:authoring:mcp:hosted
  if ($LASTEXITCODE -ne 0) {
    throw 'O smoke hospedado do gateway MCP falhou.'
  }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ARALEARN_AUTHORING_MCP_ORIGIN -ErrorAction SilentlyContinue
  Remove-Item Env:ARALEARN_AUTHORING_MCP_API_KEY -ErrorAction SilentlyContinue
  Remove-Variable apiKey, secureKey, pointer -ErrorAction SilentlyContinue
  Pop-Location
}
