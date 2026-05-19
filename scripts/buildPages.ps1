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

function Copy-PublishedDependencyFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRelativePath,
    [Parameter(Mandatory = $true)]
    [string]$DestinationRelativePath
  )

  $sourcePath = Join-Path $repoRoot $SourceRelativePath
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Dependência pública ausente: $SourceRelativePath"
  }

  $destinationPath = Join-Path $siteDir $DestinationRelativePath
  $destinationDirectory = Split-Path -Parent $destinationPath
  New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
}

Copy-PublishedDependencyFile `
  -SourceRelativePath "node_modules\pdfjs-dist\legacy\build\pdf.mjs" `
  -DestinationRelativePath "node_modules\pdfjs-dist\legacy\build\pdf.mjs"
Copy-PublishedDependencyFile `
  -SourceRelativePath "node_modules\pdfjs-dist\legacy\build\pdf.worker.mjs" `
  -DestinationRelativePath "node_modules\pdfjs-dist\legacy\build\pdf.worker.mjs"
Copy-PublishedDependencyFile `
  -SourceRelativePath "node_modules\mammoth\mammoth.browser.js" `
  -DestinationRelativePath "node_modules\mammoth\mammoth.browser.js"

$mainPath = Join-Path $siteDir "main.js"
$mainContent = Get-Content -Raw -LiteralPath $mainPath
$mainContent = $mainContent.Replace('"../src/', '"./src/')
Set-Content -LiteralPath $mainPath -Value $mainContent -Encoding utf8NoBOM

Write-Host "Site gerado em $siteDir"
