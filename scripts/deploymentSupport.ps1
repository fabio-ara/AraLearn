Set-StrictMode -Version Latest

function Test-AraLearnLocalHost {
  param([Parameter(Mandatory)][Uri]$Uri)

  return $Uri.Host -in @('localhost', '127.0.0.1', '10.0.2.2')
}

function Get-AraLearnJwtRole {
  param([AllowEmptyString()][string]$Token)

  $parts = $Token.Split('.')
  if ($parts.Count -ne 3) {
    return ''
  }

  try {
    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    while ($payload.Length % 4) {
      $payload += '='
    }
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))
    $decoded = $json | ConvertFrom-Json
    return [string]($decoded.role ?? '')
  }
  catch {
    return ''
  }
}

function Test-AraLearnAdministrativeKey {
  param([AllowEmptyString()][string]$Key)

  return (
    $Key -match '(?i)^sb_secret_' -or
    $Key -match '(?i)service[_-]?role' -or
    (Get-AraLearnJwtRole -Token $Key) -eq 'service_role'
  )
}

function Test-AraLearnProjectUrl {
  param(
    [AllowEmptyString()][string]$Url,
    [switch]$AllowLocal
  )

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $false
  }

  try {
    $uri = [Uri]$Url
  }
  catch {
    return $false
  }

  if (-not $uri.IsAbsoluteUri -or $uri.PathAndQuery -ne '/' -or $uri.Fragment) {
    return $false
  }
  if ($uri.Scheme -eq 'https') {
    return $true
  }
  return $AllowLocal -and $uri.Scheme -eq 'http' -and (Test-AraLearnLocalHost -Uri $uri)
}

function Test-AraLearnPublishableKey {
  param([AllowEmptyString()][string]$Key)

  if ([string]::IsNullOrWhiteSpace($Key) -or (Test-AraLearnAdministrativeKey -Key $Key)) {
    return $false
  }

  if ($Key -match '^sb_publishable_[A-Za-z0-9_-]{12,}$') {
    return $true
  }

  $role = Get-AraLearnJwtRole -Token $Key
  return $role -eq 'anon'
}

function Resolve-AraLearnRepositoryRoot {
  param([string]$ScriptRoot)

  return [IO.Path]::GetFullPath((Split-Path -Parent $ScriptRoot))
}

function Resolve-AraLearnDenoCommand {
  $command = Get-Command deno -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = [Collections.Generic.List[string]]::new()
  if ($env:DENO_INSTALL) {
    $candidates.Add((Join-Path $env:DENO_INSTALL 'bin\deno.exe'))
  }
  if ($env:USERPROFILE) {
    $candidates.Add((Join-Path $env:USERPROFILE '.deno\bin\deno.exe'))
  }
  if ($env:LOCALAPPDATA) {
    $candidates.Add((Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\deno.exe'))
    $packageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    if (Test-Path -LiteralPath $packageRoot) {
      Get-ChildItem -LiteralPath $packageRoot -Directory -Filter 'DenoLand.Deno_*' -ErrorAction SilentlyContinue |
        ForEach-Object {
          Get-ChildItem -LiteralPath $_.FullName -File -Filter 'deno.exe' -Recurse -ErrorAction SilentlyContinue |
            ForEach-Object { $candidates.Add($_.FullName) }
        }
    }
  }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return [IO.Path]::GetFullPath($candidate)
    }
  }

  throw 'Deno não foi encontrado. Instale-o conforme docs/implantacao.md antes de validar a autoria.'
}

function ConvertTo-AraLearnRelativePath {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Path
  )

  return [IO.Path]::GetRelativePath($Root, $Path).Replace('\', '/')
}
