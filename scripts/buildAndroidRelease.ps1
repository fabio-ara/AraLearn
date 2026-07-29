Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $repoRoot "android"
$publishedRuntimeConfigUrl = "https://fabio-ara.github.io/AraLearn/runtime-config.js"
$historicalDebugKeystorePath = Join-Path $env:USERPROFILE ".android\debug.keystore"

function Set-PublicRuntimeConfigIfMissing {
  $currentUrl = [string]$env:ARALEARN_SUPABASE_URL
  $currentKey = [string]$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY
  if (-not [string]::IsNullOrWhiteSpace($currentUrl) -and -not [string]::IsNullOrWhiteSpace($currentKey)) {
    return $false
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $publishedRuntimeConfigUrl -TimeoutSec 20
    if ($response.StatusCode -ne 200) {
      throw "Resposta HTTP $($response.StatusCode)."
    }
    $match = [regex]::Match($response.Content, 'Object\.freeze\((\{[\s\S]*\})\);?\s*$')
    if (-not $match.Success) {
      throw "Formato público inválido."
    }
    $config = $match.Groups[1].Value | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace([string]$config.supabaseUrl) -or [string]::IsNullOrWhiteSpace([string]$config.supabasePublishableKey)) {
      throw "Campos públicos ausentes."
    }
    if ([string]::IsNullOrWhiteSpace($currentUrl)) {
      $env:ARALEARN_SUPABASE_URL = [string]$config.supabaseUrl
    }
    if ([string]::IsNullOrWhiteSpace($currentKey)) {
      $env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = [string]$config.supabasePublishableKey
    }
    return $true
  } catch {
    throw "Não foi possível obter a configuração pública publicada para o APK. $($_.Exception.Message)"
  }
}

function Select-AndroidSigningCapability {
  $signingNames = @(
    "ARALEARN_ANDROID_KEYSTORE_PATH",
    "ARALEARN_ANDROID_KEYSTORE_PASSWORD",
    "ARALEARN_ANDROID_KEY_ALIAS",
    "ARALEARN_ANDROID_KEY_PASSWORD"
  )
  $values = @{}
  foreach ($name in $signingNames) {
    $values[$name] = [string][Environment]::GetEnvironmentVariable($name)
  }
  $hasAnyValue = @($values.Values | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $hasCompleteValues = ($hasAnyValue.Count -eq $signingNames.Count)
  $configuredKeystoreExists = $hasCompleteValues -and (Test-Path -LiteralPath $values["ARALEARN_ANDROID_KEYSTORE_PATH"] -PathType Leaf)
  if ($configuredKeystoreExists) {
    return
  }

  if (Test-Path -LiteralPath $historicalDebugKeystorePath -PathType Leaf) {
    foreach ($name in $signingNames) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    return
  }

  if ($hasAnyValue.Count -gt 0) {
    throw "A assinatura configurada não está utilizável e a keystore histórica não foi encontrada em $historicalDebugKeystorePath."
  }
}

if (-not (Test-Path (Join-Path $androidRoot "gradlew.bat"))) {
  throw "Wrapper Gradle Android não encontrado."
}

Push-Location $androidRoot
$runtimeConfigInjected = $false
try {
  $runtimeConfigInjected = Set-PublicRuntimeConfigIfMissing
  Select-AndroidSigningCapability
  .\gradlew.bat :app:assembleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao compilar a APK Android de release."
  }
} finally {
  Pop-Location
  if ($runtimeConfigInjected) {
    Remove-Item Env:ARALEARN_SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:ARALEARN_SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
  }
}
