[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [ValidatePattern('^https://[^/]+$')]
  [string]$ProjectUrl,

  [ValidateSet('Verify', 'Apply')]
  [string]$Mode = 'Verify',

  [switch]$DeployAuthoringApi,

  [switch]$InitializeAuthoringSecrets,

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

function Resolve-AllowedOrigins {
  param([string[]]$Origins)

  $resolved = [System.Collections.Generic.List[string]]::new()
  foreach ($value in $Origins) {
    foreach ($part in ($value -split ',')) {
      $origin = $part.Trim()
      if (($origin.StartsWith('"') -and $origin.EndsWith('"')) -or
          ($origin.StartsWith("'") -and $origin.EndsWith("'"))) {
        $origin = $origin.Substring(1, $origin.Length - 2)
      }
      if ([string]::IsNullOrWhiteSpace($origin)) {
        throw 'A lista de origens contém um valor vazio.'
      }
      $resolved.Add((Assert-AllowedOrigin $origin))
    }
  }
  return @($resolved | Select-Object -Unique)
}

function Initialize-AraLearnAuthoringSecrets {
  param([Parameter(Mandatory)][string]$ResolvedProjectRef)

  $integrationSecret = [Convert]::ToBase64String(
    [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
  )
  $receiptSecret = [Convert]::ToBase64String(
    [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
  )
  try {
    & npx.cmd --yes supabase@2.109.1 secrets set `
      "ARALEARN_AUTHORING_INTEGRATION_SECRET=$integrationSecret" `
      "ARALEARN_AUTHORING_RECEIPT_SECRET=$receiptSecret" `
      --project-ref $ResolvedProjectRef
    if ($LASTEXITCODE -ne 0) {
      throw 'A Supabase CLI não conseguiu configurar os segredos próprios da autoria.'
    }
  }
  finally {
    $integrationSecret = $null
    $receiptSecret = $null
  }
}

function Resolve-ProjectRef {
  if ($ProjectRef) {
    if ($ProjectUrl) {
      $urlRef = Resolve-ProjectRefFromUrl $ProjectUrl
      if ($ProjectRef -ne $urlRef) {
        throw 'ProjectRef e ProjectUrl apontam para projetos diferentes.'
      }
    }
    return $ProjectRef
  }
  if (-not $ProjectUrl) {
    throw 'Informe -ProjectUrl (mais simples) ou -ProjectRef. Veja docs/implantacao.md.'
  }
  return Resolve-ProjectRefFromUrl $ProjectUrl
}

function Resolve-ProjectRefFromUrl {
  param([string]$Url)

  $uri = [Uri]$Url
  if ($uri.Scheme -ne 'https' -or $uri.PathAndQuery -ne '/' -or $uri.Fragment -or $uri.Host -notmatch '^([a-z0-9]{20})\.supabase\.co$') {
    throw 'ProjectUrl deve ter o formato https://<project-ref>.supabase.co.'
  }
  return $Matches[1]
}

if ($InitializeAuthoringSecrets -and -not $DeployAuthoringApi) {
  throw '-InitializeAuthoringSecrets exige -DeployAuthoringApi.'
}

Push-Location $repositoryRoot
try {
  $resolvedProjectRef = Resolve-ProjectRef
  Write-Host "Vinculando este repositório ao projeto $resolvedProjectRef..."
  Invoke-AraLearnSupabase link --project-ref $resolvedProjectRef

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
    if ($InitializeAuthoringSecrets) {
      Write-Host 'Criando os segredos próprios da autoria sem gravá-los localmente...'
      Initialize-AraLearnAuthoringSecrets -ResolvedProjectRef $resolvedProjectRef
    }

    Write-Host 'Implantando a API REST, o gateway MCP e a entrega de revisões...'
    Invoke-AraLearnSupabase functions deploy aralearn-authoring-api --project-ref $resolvedProjectRef --no-verify-jwt
    Invoke-AraLearnSupabase functions deploy aralearn-authoring-mcp --project-ref $resolvedProjectRef --no-verify-jwt
    Invoke-AraLearnSupabase functions deploy aralearn-course-revisions --project-ref $resolvedProjectRef --no-verify-jwt

    if ($AllowedOrigin.Count -gt 0) {
      $origins = (Resolve-AllowedOrigins $AllowedOrigin) -join ','
      Invoke-AraLearnSupabase secrets set "ARALEARN_AUTHORING_ALLOWED_ORIGINS=$origins" --project-ref $resolvedProjectRef
      Invoke-AraLearnSupabase secrets set "ARALEARN_AUTHORING_MCP_ALLOWED_ORIGINS=$origins" --project-ref $resolvedProjectRef
    }
  }

  Write-Host 'Implantação concluída.'
}
finally {
  Pop-Location
}
