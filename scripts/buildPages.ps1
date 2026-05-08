Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$siteDir = Join-Path $repoRoot ".pages"
$resolvedRoot = [System.IO.Path]::GetFullPath($repoRoot)
$resolvedSite = [System.IO.Path]::GetFullPath($siteDir)

if (-not $resolvedSite.StartsWith($resolvedRoot + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "Diretório de publicação inválido."
}

if (Test-Path $siteDir) {
  Remove-Item -LiteralPath $siteDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $siteDir | Out-Null

Copy-Item -Path (Join-Path $repoRoot "public\*") -Destination $siteDir -Recurse
Copy-Item -Path (Join-Path $repoRoot "src") -Destination (Join-Path $siteDir "src") -Recurse

$mainPath = Join-Path $siteDir "main.js"
$mainContent = Get-Content -Raw -LiteralPath $mainPath
$mainContent = $mainContent.Replace('"../src/', '"./src/')
Set-Content -LiteralPath $mainPath -Value $mainContent -Encoding utf8NoBOM

Write-Host "Site gerado em $siteDir"
