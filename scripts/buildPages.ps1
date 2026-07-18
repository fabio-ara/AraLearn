Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$siteDir = Join-Path $repoRoot ".pages"
$resolvedRoot = [System.IO.Path]::GetFullPath($repoRoot)
$resolvedSite = [System.IO.Path]::GetFullPath($siteDir)

if (-not $resolvedSite.StartsWith($resolvedRoot + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "Diretório de publicação inválido."
}

$stagingScript = Join-Path $PSScriptRoot "stageWebRuntime.mjs"
& node $stagingScript --target pages --output $siteDir
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao gerar o runtime do GitHub Pages."
}

Write-Host "Site gerado em $siteDir"
