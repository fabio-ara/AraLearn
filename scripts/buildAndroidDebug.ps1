Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $repoRoot "android"

if (-not (Test-Path (Join-Path $androidRoot "gradlew.bat"))) {
  throw "Wrapper Gradle Android não encontrado."
}

Push-Location $androidRoot
try {
  .\gradlew.bat :app:assembleDebug --no-daemon
} finally {
  Pop-Location
}
