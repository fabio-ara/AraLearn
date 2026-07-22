[CmdletBinding()]
param(
  [ValidateSet('Pages', 'Android', 'All')]
  [string]$Target = 'All',

  [string]$ArtifactPath = '',

  [switch]$RequireRuntimeConfig,

  [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploymentSupport.ps1')

$repositoryRoot = Resolve-AraLearnRepositoryRoot -ScriptRoot $PSScriptRoot
$issues = [Collections.Generic.List[object]]::new()
$reports = [Collections.Generic.List[object]]::new()

function Add-Issue {
  param(
    [Parameter(Mandatory)][string]$Code,
    [Parameter(Mandatory)][string]$Location,
    [Parameter(Mandatory)][string]$Message
  )

  $issues.Add([pscustomobject]@{ code = $Code; location = $Location; message = $Message })
}

function Test-TextForSecrets {
  param(
    [Parameter(Mandatory)][string]$Text,
    [Parameter(Mandatory)][string]$Location
  )

  if ($Text -match '(?i)sb_secret_[A-Za-z0-9_-]{8,}') {
    Add-Issue 'secret.supabase' $Location 'Chave administrativa Supabase encontrada.'
  }
  if ($Text -match '(?i)postgres(?:ql)?://[^\s"''<>]+') {
    Add-Issue 'secret.connection-string' $Location 'Connection string PostgreSQL encontrada.'
  }
  if ($Text -match '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----') {
    Add-Issue 'secret.private-key' $Location 'Chave privada encontrada.'
  }
  if ($Text -match '(?i)SUPABASE_(?:SERVICE_ROLE_KEY|DB_PASSWORD)\s*[=:]\s*["'']?([A-Za-z0-9._-]{12,})') {
    Add-Issue 'secret.environment-value' $Location 'Valor administrativo Supabase encontrado.'
  }

  foreach ($candidate in [regex]::Matches($Text, 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')) {
    if ((Get-AraLearnJwtRole -Token $candidate.Value) -eq 'service_role') {
      Add-Issue 'secret.service-role-jwt' $Location 'JWT de service role encontrado.'
      break
    }
  }
}

function Test-RuntimeDirectory {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$PublicRoot
  )

  if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    Add-Issue 'artifact.missing' $Root "Artefato $Name não encontrado."
    return
  }

  $files = @(Get-ChildItem -LiteralPath $Root -Recurse -File)
  foreach ($file in $files) {
    $relativePath = ConvertTo-AraLearnRelativePath -Root $Root -Path $file.FullName
    $lowerPath = $relativePath.ToLowerInvariant()
    if (
      $lowerPath -match '(^|/)(?:\.env(?:\..*)?|keystore\.properties)$' -or
      $lowerPath -match '\.(?:jks|keystore|p12|pfx|pem)$'
    ) {
      Add-Issue 'artifact.secret-file' "$Name/$relativePath" 'Arquivo reservado a segredo encontrado.'
    }
    if (
      $lowerPath -match '(^|/)(?:fixtures?|embedded-courses?|seed-course)(/|$)' -or
      $lowerPath -match '(?:seed-)?course(?:s)?(?:[.-][^/]*)?\.json$' -or
      $lowerPath -match 'catalog.*\.json$'
    ) {
      Add-Issue 'artifact.catalog' "$Name/$relativePath" 'Curso, fixture ou catálogo operacional encontrado.'
    }

    if ($file.Length -le 8MB) {
      try {
        $bytes = [IO.File]::ReadAllBytes($file.FullName)
        $text = [Text.Encoding]::UTF8.GetString($bytes)
        Test-TextForSecrets -Text $text -Location "$Name/$relativePath"
      }
      catch {
        Add-Issue 'artifact.unreadable' "$Name/$relativePath" 'Arquivo não pôde ser examinado.'
      }
    }
  }

  $runtimeConfigPath = Join-Path $PublicRoot 'runtime-config.js'
  $indexPath = Join-Path $PublicRoot 'index.html'
  $configuredOrigin = ''
  $assistOrigins = @()
  if (Test-Path -LiteralPath $runtimeConfigPath -PathType Leaf) {
    $runtimeConfig = Get-Content -Raw -Encoding UTF8 $runtimeConfigPath
    $urlMatch = [regex]::Match($runtimeConfig, '"supabaseUrl"\s*:\s*"([^"]*)"')
    $keyMatch = [regex]::Match($runtimeConfig, '"supabasePublishableKey"\s*:\s*"([^"]*)"')
    $assistMatch = [regex]::Match($runtimeConfig, '"assistAllowedOrigins"\s*:\s*(\[[\s\S]*?\])')
    $url = if ($urlMatch.Success) { $urlMatch.Groups[1].Value } else { '' }
    $key = if ($keyMatch.Success) { $keyMatch.Groups[1].Value } else { '' }
    $urlIsValid = Test-AraLearnProjectUrl -Url $url -AllowLocal

    if ($RequireRuntimeConfig -and -not $urlIsValid) {
      Add-Issue 'config.project-url' "$Name/runtime-config.js" 'Project URL pública ausente ou inválida.'
    }
    elseif ($url -and -not $urlIsValid) {
      Add-Issue 'config.project-url' "$Name/runtime-config.js" 'Project URL pública inválida.'
    }
    if ($RequireRuntimeConfig -and -not (Test-AraLearnPublishableKey -Key $key)) {
      Add-Issue 'config.publishable-key' "$Name/runtime-config.js" 'Publishable key pública ausente ou inválida.'
    }
    elseif ($key -and -not (Test-AraLearnPublishableKey -Key $key)) {
      Add-Issue 'config.publishable-key' "$Name/runtime-config.js" 'Chave pública inválida ou administrativa.'
    }
    if ($urlIsValid) {
      $configuredOrigin = ([Uri]$url).GetLeftPart([UriPartial]::Authority)
    }
    if ($assistMatch.Success) {
      try {
        $assistOrigins = @($assistMatch.Groups[1].Value | ConvertFrom-Json)
        foreach ($origin in $assistOrigins) {
          $uri = [Uri]$origin
          $localAndroidOrigin = $Name -eq 'android' -and
            $uri.Scheme -eq 'http' -and
            @('127.0.0.1', 'localhost') -contains $uri.Host
          if (
            -not $uri.IsAbsoluteUri -or
            ($uri.Scheme -ne 'https' -and -not $localAndroidOrigin) -or
            $uri.AbsolutePath -ne '/'
          ) {
            Add-Issue 'config.assist-origin' "$Name/runtime-config.js" 'Origem pública de assistência inválida.'
          }
        }
      }
      catch {
        Add-Issue 'config.assist-origin' "$Name/runtime-config.js" 'Lista de origens de assistência inválida.'
        $assistOrigins = @()
      }
    }

    $expectedUrl = [string]($env:ARALEARN_SUPABASE_URL ?? '')
    $expectedKey = [string]($env:ARALEARN_SUPABASE_PUBLISHABLE_KEY ?? '')
    if ($expectedUrl -and $url.TrimEnd('/') -ne $expectedUrl.TrimEnd('/')) {
      Add-Issue 'config.project-url-mismatch' "$Name/runtime-config.js" 'Project URL do artefato difere da configuração deste processo.'
    }
    if ($expectedKey -and $key -cne $expectedKey) {
      Add-Issue 'config.publishable-key-mismatch' "$Name/runtime-config.js" 'Publishable key do artefato difere da configuração deste processo.'
    }
  }
  elseif ($RequireRuntimeConfig) {
    Add-Issue 'config.missing' "$Name/runtime-config.js" 'Arquivo de configuração pública ausente.'
  }

  if (Test-Path -LiteralPath $indexPath -PathType Leaf) {
    $index = Get-Content -Raw -Encoding UTF8 $indexPath
    if ($index -match 'connect-src[^;]*\bhttps:(?:\s|;)') {
      Add-Issue 'csp.wildcard' "$Name/index.html" 'CSP libera conexão com qualquer domínio HTTPS.'
    }
    if ($index.Contains('__ARALEARN_CONNECT_SRC__')) {
      Add-Issue 'csp.placeholder' "$Name/index.html" 'CSP ainda contém o marcador de build.'
    }
    if ($configuredOrigin -and -not $index.Contains($configuredOrigin)) {
      Add-Issue 'csp.origin' "$Name/index.html" 'CSP não contém a origem configurada do Supabase.'
    }
    foreach ($origin in $assistOrigins) {
      if (-not $index.Contains([string]$origin)) {
        Add-Issue 'csp.assist-origin' "$Name/index.html" 'CSP não contém uma origem de assistência declarada no runtime.'
      }
    }
  }
  else {
    Add-Issue 'artifact.index' "$Name/index.html" 'index.html ausente.'
  }

  $reports.Add([pscustomobject]@{ name = $Name; root = $Root; fileCount = $files.Count })
}

function Test-ApkArchive {
  param([Parameter(Mandatory)][string]$ApkPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = $null
  try {
    $archive = [IO.Compression.ZipFile]::OpenRead($ApkPath)
    foreach ($entry in $archive.Entries) {
      $lowerPath = $entry.FullName.ToLowerInvariant()
      if (
        $lowerPath -match '(^|/)(?:\.env(?:\..*)?|keystore\.properties)$' -or
        $lowerPath -match '\.(?:jks|keystore|p12|pfx|pem)$'
      ) {
        Add-Issue 'artifact.secret-file' "apk/$($entry.FullName)" 'Arquivo reservado a segredo encontrado no APK.'
      }
      if (
        $lowerPath -match '(^|/)(?:fixtures?|embedded-courses?|seed-course)(/|$)' -or
        $lowerPath -match '(?:seed-)?course(?:s)?(?:[.-][^/]*)?\.json$' -or
        $lowerPath -match 'catalog.*\.json$'
      ) {
        Add-Issue 'artifact.catalog' "apk/$($entry.FullName)" 'Curso, fixture ou catálogo operacional encontrado no APK.'
      }

      if ($entry.Length -gt 0 -and $entry.Length -le 8MB -and $lowerPath -match '\.(?:css|html|js|json|mjs|txt|xml)$') {
        $stream = $entry.Open()
        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true)
        try {
          Test-TextForSecrets -Text $reader.ReadToEnd() -Location "apk/$($entry.FullName)"
        }
        finally {
          $reader.Dispose()
          $stream.Dispose()
        }
      }
    }
    $reports.Add([pscustomobject]@{
      name = "apk:$([IO.Path]::GetFileName($ApkPath))"
      root = $ApkPath
      fileCount = $archive.Entries.Count
    })
  }
  catch {
    Add-Issue 'artifact.apk-unreadable' $ApkPath 'APK não pôde ser examinado como arquivo ZIP.'
  }
  finally {
    if ($archive) {
      $archive.Dispose()
    }
  }
}

if ($ArtifactPath) {
  $resolvedPath = [IO.Path]::GetFullPath($ArtifactPath)
  if (Test-Path -LiteralPath $resolvedPath -PathType Leaf) {
    if ([IO.Path]::GetExtension($resolvedPath) -ne '.apk') {
      Add-Issue 'artifact.unsupported-file' $resolvedPath 'Somente um diretório de runtime ou um arquivo .apk pode ser examinado.'
    }
    else {
      Test-ApkArchive -ApkPath $resolvedPath
    }
  }
  else {
    Test-RuntimeDirectory -Name 'custom' -Root $resolvedPath -PublicRoot $resolvedPath
  }
}
else {
  if ($Target -in @('Pages', 'All')) {
    $pagesRoot = Join-Path $repositoryRoot '.pages'
    Test-RuntimeDirectory -Name 'pages' -Root $pagesRoot -PublicRoot $pagesRoot
  }
  if ($Target -in @('Android', 'All')) {
    $androidRoot = Join-Path $repositoryRoot 'android/app/build/generated/web-assets/main/www'
    Test-RuntimeDirectory -Name 'android' -Root $androidRoot -PublicRoot (Join-Path $androidRoot 'public')
    $apkRoot = Join-Path $repositoryRoot 'android/app/build/outputs/apk'
    if (Test-Path -LiteralPath $apkRoot -PathType Container) {
      foreach ($apk in Get-ChildItem -LiteralPath $apkRoot -Recurse -File -Filter '*.apk') {
        Test-ApkArchive -ApkPath $apk.FullName
      }
    }
  }
}

$result = [pscustomobject]@{
  target = if ($ArtifactPath) { 'Custom' } else { $Target }
  valid = $issues.Count -eq 0
  artifacts = @($reports)
  issues = @($issues)
}

if ($AsJson) {
  $result | ConvertTo-Json -Depth 6
}
else {
  foreach ($report in $reports) {
    Write-Host "[OK] $($report.name): $($report.fileCount) arquivos examinados."
  }
  foreach ($issue in $issues) {
    Write-Host "[BLOQUEIO] $($issue.location): $($issue.message)"
  }
  Write-Host $(if ($result.valid) { 'Artefatos aprovados.' } else { 'Artefatos reprovados; não publique.' })
}

if (-not $result.valid) {
  exit 1
}
