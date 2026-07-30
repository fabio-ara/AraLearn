[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidatePattern('^https://[^/]+$')]
  [string]$ProjectUrl,

  [Parameter(Mandatory)]
  [ValidatePattern('^[^\s@]+@[^\s@]+\.[^\s@]+$')]
  [string]$OwnerEmail
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $PSCommandPath
$repositoryRoot = Split-Path -Parent $scriptRoot
$secureKey = Read-Host 'Cole a chave secreta sb_secret_ somente neste terminal' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
  $env:ARALEARN_SUPABASE_URL = $ProjectUrl
  $env:SUPABASE_SECRET_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)

  Push-Location $repositoryRoot
  try {
    node.exe ./scripts/manageAuthoringAccess.mjs bootstrap-owner --email $OwnerEmail
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível atribuir o papel de proprietário.' }
  }
  finally {
    Pop-Location
  }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:ARALEARN_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Variable secureKey, keyPointer -ErrorAction SilentlyContinue
}

Write-Host 'Papel de proprietário configurado. A autoria remota usa OAuth pelo MCP.'
