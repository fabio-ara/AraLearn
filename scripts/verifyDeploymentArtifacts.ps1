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
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repositoryRoot = Resolve-AraLearnRepositoryRoot -ScriptRoot $PSScriptRoot
$issues = [Collections.Generic.List[object]]::new()
$reports = [Collections.Generic.List[object]]::new()
$expectedAndroidApplicationId = 'com.aralearn.app'
$expectedAndroidVersionCode = '152'
$expectedAndroidVersionName = '0.0.14'
$expectedAndroidCertificateSha256 = 'c3d2ad6c97e44492c09d785d2d5e9f461eb6399914b196119e2cba0e5d271296'
$requiredRuntimeModules = @(
  'src/assist/cardassistancescope.js',
  'src/generation/engine/cardauthoringschema.js',
  'src/generation/providers/providerregistry.js',
  'src/generation/providers/providertransport.js',
  'src/generation/runtime/cardassistanceconfig.js',
  'src/generation/runtime/cardassistancelaunchconfig.js',
  'src/generation/runtime/cardassistanceruntime.js',
  'src/generation/validation/cardassistancesemantics.js',
  'src/resources/registry/authoring.js',
  'src/resources/registry/index.js',
  'src/ui/authoringassistantpanel.js',
  'src/ui/cardassistanceuistate.js',
  'src/ui/oauthauthorizationconsent.js'
)
$requiredAuthoringAssets = @(
  'docs/downloads/authoring/aralearn-authoring-chatgpt.zip',
  'docs/downloads/authoring/aralearn-chatgpt-system-prompt.md',
  'docs/downloads/authoring/aralearn-chatgpt-knowledge-core.md',
  'docs/downloads/authoring/aralearn-chatgpt-knowledge-resources.md',
  'docs/downloads/authoring/aralearn-chatgpt-action-openapi.yaml'
)

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

function Test-ArtifactPathForLegacy {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Location
  )

  $normalized = $Path.Replace('\', '/').ToLowerInvariant()
  if (
    $normalized -match '(^|/)(?:authoringapiclient|personalintegrationclient|personalintegrationspanel|interventionscopeguard)\.js$' -or
    $normalized -match '(^|/)src/generation/(?:bottomup|topdown)(/|$)' -or
    $normalized -match '(^|/)aralearn-chatgpt-knowledge\.md$'
  ) {
    Add-Issue 'artifact.legacy-module' $Location 'Módulo ou material legado de autoria encontrado.'
  }
}

function Test-TextForLegacySurface {
  param(
    [Parameter(Mandatory)][string]$Text,
    [Parameter(Mandatory)][string]$Location
  )

  if (
    $Text -match '(?i)\baralearn-authoring-api\b' -or
    $Text -match '(?i)\bX-AraLearn-API-Key\b' -or
    $Text -match '(?i)\barl_(?:\.{3}|[A-Za-z0-9_-]{4,})' -or
    $Text -match '(?i)\bARALEARN_AUTHORING_(?:INTEGRATION|RECEIPT)_SECRET\b' -or
    $Text -match '(?i)\bauthoring_api_(?:clients|keys)\b'
  ) {
    Add-Issue 'artifact.static-authoring-api' $Location 'Superfície estática de autoria encontrada.'
  }
  if ($Text -match '\b(?:consultarProximaParte|entregarFaseDeAutoria|submissionReadReceipt|planHash)\b') {
    Add-Issue 'artifact.legacy-authoring-protocol' $Location 'Protocolo legado de autoria encontrado.'
  }
}

function Test-ZipArchiveContent {
  param(
    [Parameter(Mandatory)]$Archive,
    [Parameter(Mandatory)][string]$Location
  )

  if ($Archive.Entries.Count -gt 5000) {
    Add-Issue 'artifact.archive-entry-count' $Location 'Arquivo compactado excede o limite de entradas.'
    return
  }

  $totalTextBytes = 0L
  foreach ($entry in $Archive.Entries) {
    $entryPath = [string]$entry.FullName
    $entryLocation = "$Location!$entryPath"
    Test-ArtifactPathForLegacy -Path $entryPath -Location $entryLocation
    if (
      $entryPath.Contains([char]0) -or
      $entryPath.Replace('\', '/').Split('/') -contains '..'
    ) {
      Add-Issue 'artifact.archive-path' $entryLocation 'Entrada compactada contém caminho inseguro.'
      continue
    }
    if (-not $entry.Name) {
      continue
    }
    if ([IO.Path]::GetExtension($entry.Name).ToLowerInvariant() -notin @(
      '.css', '.html', '.js', '.json', '.md', '.mjs', '.txt', '.xml'
    )) {
      continue
    }
    if ($entry.Length -gt 8MB) {
      Add-Issue 'artifact.archive-entry-large' $entryLocation 'Entrada textual compactada excede o limite de inspeção.'
      continue
    }
    $totalTextBytes += $entry.Length
    if ($totalTextBytes -gt 64MB) {
      Add-Issue 'artifact.archive-text-total' $Location 'Conteúdo textual compactado excede o limite de inspeção.'
      return
    }

    $stream = $entry.Open()
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true)
    try {
      $text = $reader.ReadToEnd()
      Test-TextForSecrets -Text $text -Location $entryLocation
      Test-TextForLegacySurface -Text $text -Location $entryLocation
    }
    finally {
      $reader.Dispose()
      $stream.Dispose()
    }
  }
}

function Test-RequiredRuntimePaths {
  param(
    [Parameter(Mandatory)]$AvailablePaths,
    [Parameter(Mandatory)][string]$LocationPrefix,
    [string]$RuntimePrefix = '',
    [string]$PublicPrefix = ''
  )

  foreach ($relativePath in $requiredRuntimeModules) {
    $expectedPath = "$RuntimePrefix$relativePath".ToLowerInvariant()
    if (-not $AvailablePaths.Contains($expectedPath)) {
      Add-Issue 'artifact.required-runtime' "$LocationPrefix/$expectedPath" 'Módulo obrigatório da assistência atômica ou do OAuth ausente.'
    }
  }
  foreach ($relativePath in $requiredAuthoringAssets) {
    $expectedPath = "$PublicPrefix$relativePath".ToLowerInvariant()
    if (-not $AvailablePaths.Contains($expectedPath)) {
      Add-Issue 'artifact.required-authoring-asset' "$LocationPrefix/$expectedPath" 'Material obrigatório do GPT com MCP OAuth ausente.'
    }
  }
}

function Resolve-AndroidBuildTool {
  param(
    [Parameter(Mandatory)][string]$ToolName,
    [Parameter(Mandatory)][string]$OverrideVariable
  )

  $override = [string][Environment]::GetEnvironmentVariable($OverrideVariable)
  if ($override -and (Test-Path -LiteralPath $override -PathType Leaf)) {
    return [IO.Path]::GetFullPath($override)
  }

  $sdkRoots = @(
    [string]$env:ANDROID_HOME,
    [string]$env:ANDROID_SDK_ROOT,
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Android/Sdk' } else { '' })
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -Unique
  $fileNames = if ($IsWindows -or $env:OS -eq 'Windows_NT') {
    @("$ToolName.exe", "$ToolName.bat", "$ToolName.cmd")
  }
  else {
    @($ToolName)
  }

  foreach ($sdkRoot in $sdkRoots) {
    $buildToolsRoot = Join-Path $sdkRoot 'build-tools'
    if (-not (Test-Path -LiteralPath $buildToolsRoot -PathType Container)) {
      continue
    }
    $versions = @(Get-ChildItem -LiteralPath $buildToolsRoot -Directory | Sort-Object {
      try { [version]$_.Name } catch { [version]'0.0' }
    } -Descending)
    foreach ($version in $versions) {
      foreach ($fileName in $fileNames) {
        $candidate = Join-Path $version.FullName $fileName
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
          return $candidate
        }
      }
    }
  }
  return $null
}

function Test-ReleaseApkIdentity {
  param([Parameter(Mandatory)][string]$ApkPath)

  $aapt = Resolve-AndroidBuildTool -ToolName 'aapt' -OverrideVariable 'ARALEARN_AAPT_PATH'
  $apksigner = Resolve-AndroidBuildTool -ToolName 'apksigner' -OverrideVariable 'ARALEARN_APKSIGNER_PATH'
  if (-not $aapt) {
    Add-Issue 'artifact.android-tool' $ApkPath 'aapt não foi encontrado para conferir a identidade do APK de release.'
  }
  if (-not $apksigner) {
    Add-Issue 'artifact.android-tool' $ApkPath 'apksigner não foi encontrado para conferir a assinatura do APK de release.'
  }
  if (-not $aapt -or -not $apksigner) {
    return
  }

  $badgingLines = @(& $aapt dump badging $ApkPath 2>&1)
  if ($LASTEXITCODE -ne 0) {
    Add-Issue 'artifact.apk-manifest' $ApkPath 'aapt não conseguiu ler o manifesto do APK de release.'
  }
  else {
    $badging = $badgingLines -join "`n"
    $package = [regex]::Match(
      $badging,
      "package:\s+name='([^']+)'[^\r\n]*versionCode='([^']+)'[^\r\n]*versionName='([^']+)'"
    )
    if (-not $package.Success) {
      Add-Issue 'artifact.apk-manifest' $ApkPath 'Identidade do APK de release não pôde ser determinada.'
    }
    else {
      if ($package.Groups[1].Value -cne $expectedAndroidApplicationId) {
        Add-Issue 'artifact.apk-application-id' $ApkPath "applicationId do APK difere de $expectedAndroidApplicationId."
      }
      if ($package.Groups[2].Value -cne $expectedAndroidVersionCode) {
        Add-Issue 'artifact.apk-version-code' $ApkPath "versionCode do APK difere de $expectedAndroidVersionCode."
      }
      if ($package.Groups[3].Value -cne $expectedAndroidVersionName) {
        Add-Issue 'artifact.apk-version-name' $ApkPath "versionName do APK difere de $expectedAndroidVersionName."
      }
    }
  }

  $signatureLines = @(& $apksigner verify --verbose --print-certs $ApkPath 2>&1)
  if ($LASTEXITCODE -ne 0) {
    Add-Issue 'artifact.apk-signature' $ApkPath 'A assinatura do APK de release é inválida.'
    return
  }
  $signature = $signatureLines -join "`n"
  $certificate = [regex]::Match(
    $signature,
    '(?im)^Signer #1 certificate SHA-256 digest:\s*([a-f0-9:]+)\s*$'
  )
  $actualCertificate = $certificate.Groups[1].Value.Replace(':', '').ToLowerInvariant()
  if (-not $certificate.Success -or $actualCertificate -cne $expectedAndroidCertificateSha256) {
    Add-Issue 'artifact.apk-certificate' $ApkPath 'O APK não usa o certificado histórico necessário para atualização in-place.'
  }
}

function Test-RuntimeConfigurationContent {
  param(
    [Parameter(Mandatory)][string]$Name,
    [AllowEmptyString()][string]$RuntimeConfigText,
    [AllowEmptyString()][string]$IndexText,
    [bool]$RuntimeConfigPresent,
    [bool]$IndexPresent,
    [Parameter(Mandatory)][string]$RuntimeConfigLocation,
    [Parameter(Mandatory)][string]$IndexLocation,
    [ValidateSet('web', 'android')][string]$Platform = 'web'
  )

  $configuredOrigin = ''
  $assistOrigins = @()
  if ($RuntimeConfigPresent) {
    $urlMatch = [regex]::Match($RuntimeConfigText, '"supabaseUrl"\s*:\s*"([^"]*)"')
    $keyMatch = [regex]::Match($RuntimeConfigText, '"supabasePublishableKey"\s*:\s*"([^"]*)"')
    $assistMatch = [regex]::Match($RuntimeConfigText, '"assistAllowedOrigins"\s*:\s*(\[[\s\S]*?\])')
    $url = if ($urlMatch.Success) { $urlMatch.Groups[1].Value } else { '' }
    $key = if ($keyMatch.Success) { $keyMatch.Groups[1].Value } else { '' }
    $urlIsValid = Test-AraLearnProjectUrl -Url $url -AllowLocal

    if ($RequireRuntimeConfig -and -not $urlIsValid) {
      Add-Issue 'config.project-url' $RuntimeConfigLocation 'Project URL pública ausente ou inválida.'
    }
    elseif ($url -and -not $urlIsValid) {
      Add-Issue 'config.project-url' $RuntimeConfigLocation 'Project URL pública inválida.'
    }
    if ($RequireRuntimeConfig -and -not (Test-AraLearnPublishableKey -Key $key)) {
      Add-Issue 'config.publishable-key' $RuntimeConfigLocation 'Publishable key pública ausente ou inválida.'
    }
    elseif ($key -and -not (Test-AraLearnPublishableKey -Key $key)) {
      Add-Issue 'config.publishable-key' $RuntimeConfigLocation 'Chave pública inválida ou administrativa.'
    }
    if ($urlIsValid) {
      $configuredOrigin = ([Uri]$url).GetLeftPart([UriPartial]::Authority)
    }
    if ($assistMatch.Success) {
      try {
        $assistOrigins = @($assistMatch.Groups[1].Value | ConvertFrom-Json)
        foreach ($origin in $assistOrigins) {
          $uri = [Uri]$origin
          $localAndroidOrigin = $Platform -eq 'android' -and
            $uri.Scheme -eq 'http' -and
            @('127.0.0.1', 'localhost') -contains $uri.Host
          if (
            -not $uri.IsAbsoluteUri -or
            ($uri.Scheme -ne 'https' -and -not $localAndroidOrigin) -or
            $uri.AbsolutePath -ne '/'
          ) {
            Add-Issue 'config.assist-origin' $RuntimeConfigLocation 'Origem pública de assistência inválida.'
          }
        }
      }
      catch {
        Add-Issue 'config.assist-origin' $RuntimeConfigLocation 'Lista de origens de assistência inválida.'
        $assistOrigins = @()
      }
    }

    $expectedUrl = [string]($env:ARALEARN_SUPABASE_URL ?? '')
    $expectedKey = [string]($env:ARALEARN_SUPABASE_PUBLISHABLE_KEY ?? '')
    if ($expectedUrl -and $url.TrimEnd('/') -ne $expectedUrl.TrimEnd('/')) {
      Add-Issue 'config.project-url-mismatch' $RuntimeConfigLocation 'Project URL do artefato difere da configuração deste processo.'
    }
    if ($expectedKey -and $key -cne $expectedKey) {
      Add-Issue 'config.publishable-key-mismatch' $RuntimeConfigLocation 'Publishable key do artefato difere da configuração deste processo.'
    }
  }
  elseif ($RequireRuntimeConfig) {
    Add-Issue 'config.missing' $RuntimeConfigLocation 'Arquivo de configuração pública ausente.'
  }

  if ($IndexPresent) {
    if ($IndexText -match 'connect-src[^;]*\bhttps:(?:\s|;)') {
      Add-Issue 'csp.wildcard' $IndexLocation 'CSP libera conexão com qualquer domínio HTTPS.'
    }
    if ($IndexText.Contains('__ARALEARN_CONNECT_SRC__')) {
      Add-Issue 'csp.placeholder' $IndexLocation 'CSP ainda contém o marcador de build.'
    }
    if ($configuredOrigin -and -not $IndexText.Contains($configuredOrigin)) {
      Add-Issue 'csp.origin' $IndexLocation 'CSP não contém a origem configurada do Supabase.'
    }
    foreach ($origin in $assistOrigins) {
      if (-not $IndexText.Contains([string]$origin)) {
        Add-Issue 'csp.assist-origin' $IndexLocation 'CSP não contém uma origem de assistência declarada no runtime.'
      }
    }
  }
  else {
    Add-Issue 'artifact.index' $IndexLocation 'index.html ausente.'
  }
}

function Test-RuntimeDirectory {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$PublicRoot,
    [switch]$RequireCurrentRuntime
  )

  if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    Add-Issue 'artifact.missing' $Root "Artefato $Name não encontrado."
    return
  }

  $files = @(Get-ChildItem -LiteralPath $Root -Recurse -File)
  $availablePaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($file in $files) {
    $relativePath = ConvertTo-AraLearnRelativePath -Root $Root -Path $file.FullName
    $lowerPath = $relativePath.ToLowerInvariant()
    $null = $availablePaths.Add($lowerPath)
    Test-ArtifactPathForLegacy -Path $relativePath -Location "$Name/$relativePath"
    if (
      $lowerPath -match '(^|/)(?:\.env(?:\..*)?|(?:key|keystore|local)\.properties)$' -or
      $lowerPath -match '\.(?:jks|keystore|p12|pfx|pem|key)$'
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

    if ([IO.Path]::GetExtension($file.Name).ToLowerInvariant() -eq '.zip') {
      $archive = $null
      try {
        $archive = [IO.Compression.ZipFile]::OpenRead($file.FullName)
        Test-ZipArchiveContent -Archive $archive -Location "$Name/$relativePath"
      }
      catch {
        Add-Issue 'artifact.archive-unreadable' "$Name/$relativePath" 'Arquivo compactado não pôde ser examinado.'
      }
      finally {
        if ($archive) {
          $archive.Dispose()
        }
      }
    }
    elseif ($file.Length -le 8MB) {
      try {
        $bytes = [IO.File]::ReadAllBytes($file.FullName)
        $text = [Text.Encoding]::UTF8.GetString($bytes)
        Test-TextForSecrets -Text $text -Location "$Name/$relativePath"
        Test-TextForLegacySurface -Text $text -Location "$Name/$relativePath"
      }
      catch {
        Add-Issue 'artifact.unreadable' "$Name/$relativePath" 'Arquivo não pôde ser examinado.'
      }
    }
  }

  if ($RequireCurrentRuntime) {
    $publicRelative = ConvertTo-AraLearnRelativePath -Root $Root -Path $PublicRoot
    $publicPrefix = if ($publicRelative -eq '.') { '' } else { "$($publicRelative.TrimEnd('/'))/" }
    Test-RequiredRuntimePaths `
      -AvailablePaths $availablePaths `
      -LocationPrefix $Name `
      -PublicPrefix $publicPrefix
  }

  $runtimeConfigPath = Join-Path $PublicRoot 'runtime-config.js'
  $indexPath = Join-Path $PublicRoot 'index.html'
  $runtimeConfigPresent = Test-Path -LiteralPath $runtimeConfigPath -PathType Leaf
  $indexPresent = Test-Path -LiteralPath $indexPath -PathType Leaf
  $runtimeConfig = if ($runtimeConfigPresent) {
    Get-Content -Raw -Encoding UTF8 $runtimeConfigPath
  }
  else {
    $null
  }
  $index = if ($indexPresent) {
    Get-Content -Raw -Encoding UTF8 $indexPath
  }
  else {
    $null
  }
  Test-RuntimeConfigurationContent `
    -Name $Name `
    -RuntimeConfigText $runtimeConfig `
    -IndexText $index `
    -RuntimeConfigPresent $runtimeConfigPresent `
    -IndexPresent $indexPresent `
    -RuntimeConfigLocation "$Name/runtime-config.js" `
    -IndexLocation "$Name/index.html" `
    -Platform $(if ($Name -eq 'android') { 'android' } else { 'web' })

  $reports.Add([pscustomobject]@{ name = $Name; root = $Root; fileCount = $files.Count })
}

function Test-ApkArchive {
  param(
    [Parameter(Mandatory)][string]$ApkPath,
    [switch]$RequireCurrentRuntime,
    [switch]$RequireReleaseIdentity
  )

  $archive = $null
  $runtimeConfigText = $null
  $indexText = $null
  $runtimeConfigPresent = $false
  $indexPresent = $false
  $runtimeConfigEntryPath = 'assets/www/public/runtime-config.js'
  $indexEntryPath = 'assets/www/public/index.html'
  $availablePaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  try {
    $archive = [IO.Compression.ZipFile]::OpenRead($ApkPath)
    foreach ($entry in $archive.Entries) {
      $lowerPath = $entry.FullName.ToLowerInvariant()
      $null = $availablePaths.Add($lowerPath)
      Test-ArtifactPathForLegacy -Path $entry.FullName -Location "apk/$($entry.FullName)"
      if (
        $lowerPath -match '(^|/)(?:\.env(?:\..*)?|(?:key|keystore|local)\.properties)$' -or
        $lowerPath -match '\.(?:jks|keystore|p12|pfx|pem|key)$'
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

      if ($entry.Length -gt 0 -and $entry.Length -le 8MB -and $lowerPath.EndsWith('.zip')) {
        $stream = $entry.Open()
        $memory = [IO.MemoryStream]::new()
        $nestedArchive = $null
        try {
          $stream.CopyTo($memory)
          $memory.Position = 0
          $nestedArchive = [IO.Compression.ZipArchive]::new(
            $memory,
            [IO.Compression.ZipArchiveMode]::Read,
            $true
          )
          Test-ZipArchiveContent -Archive $nestedArchive -Location "apk/$($entry.FullName)"
        }
        catch {
          Add-Issue 'artifact.archive-unreadable' "apk/$($entry.FullName)" 'Arquivo compactado interno não pôde ser examinado.'
        }
        finally {
          if ($nestedArchive) {
            $nestedArchive.Dispose()
          }
          $memory.Dispose()
          $stream.Dispose()
        }
      }
      elseif ($entry.Length -gt 0 -and $entry.Length -le 8MB -and $lowerPath -match '\.(?:css|html|js|json|md|mjs|txt|xml)$') {
        $stream = $entry.Open()
        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true)
        try {
          $text = $reader.ReadToEnd()
          Test-TextForSecrets -Text $text -Location "apk/$($entry.FullName)"
          Test-TextForLegacySurface -Text $text -Location "apk/$($entry.FullName)"
          if ($lowerPath -eq $runtimeConfigEntryPath) {
            $runtimeConfigText = $text
            $runtimeConfigPresent = $true
          }
          elseif ($lowerPath -eq $indexEntryPath) {
            $indexText = $text
            $indexPresent = $true
          }
        }
        finally {
          $reader.Dispose()
          $stream.Dispose()
        }
      }
    }
    if ($RequireCurrentRuntime) {
      Test-RequiredRuntimePaths `
        -AvailablePaths $availablePaths `
        -LocationPrefix 'apk' `
        -RuntimePrefix 'assets/www/' `
        -PublicPrefix 'assets/www/public/'
    }
    Test-RuntimeConfigurationContent `
      -Name 'apk' `
      -RuntimeConfigText $runtimeConfigText `
      -IndexText $indexText `
      -RuntimeConfigPresent $runtimeConfigPresent `
      -IndexPresent $indexPresent `
      -RuntimeConfigLocation "apk/$runtimeConfigEntryPath" `
      -IndexLocation "apk/$indexEntryPath" `
      -Platform android
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

  if ($RequireReleaseIdentity) {
    Test-ReleaseApkIdentity -ApkPath $ApkPath
  }
}

if ($ArtifactPath) {
  $resolvedPath = [IO.Path]::GetFullPath($ArtifactPath)
  if (Test-Path -LiteralPath $resolvedPath -PathType Leaf) {
    if ([IO.Path]::GetExtension($resolvedPath) -ne '.apk') {
      Add-Issue 'artifact.unsupported-file' $resolvedPath 'Somente um diretório de runtime ou um arquivo .apk pode ser examinado.'
    }
    else {
      Test-ApkArchive `
        -ApkPath $resolvedPath `
        -RequireCurrentRuntime `
        -RequireReleaseIdentity
    }
  }
  else {
    Test-RuntimeDirectory -Name 'custom' -Root $resolvedPath -PublicRoot $resolvedPath
  }
}
else {
  if ($Target -in @('Pages', 'All')) {
    $pagesRoot = Join-Path $repositoryRoot '.pages'
    Test-RuntimeDirectory -Name 'pages' -Root $pagesRoot -PublicRoot $pagesRoot -RequireCurrentRuntime
  }
  if ($Target -in @('Android', 'All')) {
    $androidRoot = Join-Path $repositoryRoot 'android/app/build/generated/web-assets/main/www'
    Test-RuntimeDirectory `
      -Name 'android' `
      -Root $androidRoot `
      -PublicRoot (Join-Path $androidRoot 'public') `
      -RequireCurrentRuntime
    $apkRoot = Join-Path $repositoryRoot 'android/app/build/outputs/apk'
    $androidApks = @()
    if (Test-Path -LiteralPath $apkRoot -PathType Container) {
      $androidApks = @(Get-ChildItem -LiteralPath $apkRoot -Recurse -File -Filter '*.apk')
      foreach ($apk in $androidApks) {
        $normalizedApkPath = $apk.FullName.Replace('\', '/').ToLowerInvariant()
        $isReleaseArtifact = (
          $apk.Name -ieq 'app-release.apk' -or
          $normalizedApkPath -match '/outputs/apk/release/'
        )
        Test-ApkArchive `
          -ApkPath $apk.FullName `
          -RequireCurrentRuntime `
          -RequireReleaseIdentity:$isReleaseArtifact
      }
    }
    if ($androidApks.Count -eq 0) {
      Add-Issue 'artifact.apk-missing' $apkRoot 'Nenhum APK Android foi gerado.'
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
