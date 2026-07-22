[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [ValidateSet('Verify', 'Apply')]
  [string]$Mode = 'Verify',

  [switch]$DeployAuthoringApi,

  [string[]]$AllowedOrigin = @()
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $PSCommandPath
$repositoryRoot = Split-Path -Parent $scriptRoot

function Invoke-AraLearnSupabase {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & npx.cmd --yes supabase@2.109.1 @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "A Supabase CLI falhou: supabase $($Arguments -join ' ')."
  }
}

function Assert-AllowedOrigin {
  param([string]$Origin)

  $uri = [Uri]$Origin
  if (-not $uri.IsAbsoluteUri -or $uri.PathAndQuery -ne '/' -or $uri.Fragment) {
    throw "Origem inválida: $Origin"
  }
  $isLocal = $uri.Scheme -eq 'http' -and $uri.Host -in @('localhost', '127.0.0.1')
  if ($uri.Scheme -ne 'https' -and -not $isLocal) {
    throw "A origem deve usar HTTPS fora de localhost: $Origin"
  }
  return $uri.GetLeftPart([UriPartial]::Authority)
}

Push-Location $repositoryRoot
try {
  Write-Host "Vinculando este repositório ao projeto $ProjectRef..."
  Invoke-AraLearnSupabase link --project-ref $ProjectRef

  Write-Host 'Conferindo o histórico de migrations...'
  Invoke-AraLearnSupabase migration list --linked

  Write-Host 'Simulando a implantação; nenhuma migration será aplicada nesta etapa...'
  Invoke-AraLearnSupabase db push --linked --dry-run

  if ($Mode -eq 'Verify') {
    Write-Host 'Verificação concluída. Para aplicar, execute novamente com -Mode Apply.'
    return
  }

  $confirmation = Read-Host 'Digite APLICAR para confirmar a implantação no projeto hospedado'
  if ($confirmation -cne 'APLICAR') {
    throw 'Implantação cancelada.'
  }

  Write-Host 'Aplicando migrations versionadas, sem seed e sem reset...'
  Invoke-AraLearnSupabase db push --linked
  Invoke-AraLearnSupabase migration list --linked
  Invoke-AraLearnSupabase db lint --linked --level warning --fail-on warning

  if ($DeployAuthoringApi) {
    Write-Host 'Implantando a API de autoria...'
    Invoke-AraLearnSupabase functions deploy aralearn-authoring-api --project-ref $ProjectRef --no-verify-jwt

    if ($AllowedOrigin.Count -gt 0) {
      $origins = @($AllowedOrigin | ForEach-Object { Assert-AllowedOrigin $_ }) -join ','
      Invoke-AraLearnSupabase secrets set "ARALEARN_AUTHORING_ALLOWED_ORIGINS=$origins" --project-ref $ProjectRef
    }
  }

  Write-Host 'Implantação concluída.'
}
finally {
  Pop-Location
}
