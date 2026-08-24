[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [ValidatePattern('^https://[^/]+$')]
  [string]$ProjectUrl,

  [ValidateSet('Verify', 'Apply')]
  [string]$Mode = 'Verify',

  [switch]$DeployAuthoringFunctions,

  [ValidatePattern('^https://')]
  [string]$PublicAppUrl = 'https://fabio-ara.github.io/AraLearn/',

  [string[]]$AllowedOrigin = @()
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $PSCommandPath
$repositoryRoot = Split-Path -Parent $scriptRoot
$RequiredApplicationOrigins = @(
  'http://127.0.0.1:4182',
  'http://localhost:4182',
  'https://fabio-ara.github.io',
  'https://appassets.androidplatform.net'
)
$RequiredActionOrigins = @(
  'https://chatgpt.com',
  'https://chat.openai.com'
)

function Invoke-AraLearnSupabase {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & npx.cmd --yes supabase@2.115.0 @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "A Supabase CLI falhou: supabase $($Arguments -join ' ')."
  }
}

function Invoke-AraLearnDatabaseLintGate {
  $lintJsonPath = [System.IO.Path]::GetTempFileName()
  try {
    & npx.cmd --yes supabase@2.115.0 db lint --linked --level warning `
      --output-format json > $lintJsonPath
    $lintExitCode = $LASTEXITCODE
    if ($lintExitCode -ne 0) {
      return [int]$lintExitCode
    }

    $gateOutput = & node .\scripts\auditLegacyDbLint.mjs $lintJsonPath
    $gateExitCode = $LASTEXITCODE
    if ($gateOutput) {
      Write-Host ($gateOutput -join [Environment]::NewLine)
    }
    if ($gateExitCode -ne 0) {
      throw 'O lint do banco divergiu da baseline exata da limpeza legada.'
    }
    return [int]0
  }
  finally {
    Remove-Item -LiteralPath $lintJsonPath -Force -ErrorAction SilentlyContinue
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
  $lintExitCode = Invoke-AraLearnDatabaseLintGate
  if ($lintExitCode -ne 0) {
    Write-Error "A Supabase CLI falhou durante o lint do banco (código $lintExitCode)." `
      -ErrorAction Continue
    exit $lintExitCode
  }

  if ($DeployAuthoringFunctions) {
    $applicationOrigins = Resolve-AllowedOrigins (
      @($RequiredApplicationOrigins) + @($AllowedOrigin)
    )
    $origins = $applicationOrigins -join ','
    $actionOrigins = @(
      $applicationOrigins + $RequiredActionOrigins | Select-Object -Unique
    ) -join ','
    Invoke-AraLearnSupabase secrets set "ARALEARN_AUTHORING_MCP_ALLOWED_ORIGINS=$origins" --project-ref $resolvedProjectRef
    Invoke-AraLearnSupabase secrets set "ARALEARN_COURSE_API_ALLOWED_ORIGINS=$origins" --project-ref $resolvedProjectRef
    Invoke-AraLearnSupabase secrets set "ARALEARN_AUTHORING_ACTION_ALLOWED_ORIGINS=$actionOrigins" --project-ref $resolvedProjectRef
    Invoke-AraLearnSupabase secrets set "ARALEARN_PUBLIC_APP_URL=$PublicAppUrl" --project-ref $resolvedProjectRef

    Write-Host 'Implantando MCP, API de Cursos e Actions...'
    Invoke-AraLearnSupabase functions deploy aralearn-authoring-mcp --project-ref $resolvedProjectRef --no-verify-jwt
    Invoke-AraLearnSupabase functions deploy aralearn-course-api --project-ref $resolvedProjectRef --no-verify-jwt
    Invoke-AraLearnSupabase functions deploy aralearn-authoring-action --project-ref $resolvedProjectRef --no-verify-jwt

    Write-Host 'Validando a configuração CORS da API de Cursos...'
    $resolvedProjectUrl = "https://$resolvedProjectRef.supabase.co"
    $courseApiPreflight = Invoke-WebRequest `
      -Uri "$resolvedProjectUrl/functions/v1/aralearn-course-api/app/listarCursos" `
      -Method Options `
      -Headers @{
        Origin = 'https://fabio-ara.github.io'
        'Access-Control-Request-Method' = 'POST'
      } `
      -UseBasicParsing
    if ($courseApiPreflight.StatusCode -lt 200 -or
        $courseApiPreflight.StatusCode -ge 300 -or
        $courseApiPreflight.Headers['Access-Control-Allow-Origin'] -ne
          'https://fabio-ara.github.io') {
      throw 'O preflight hospedado da API de Cursos falhou; as funções antigas foram preservadas.'
    }

    Write-Host 'Validando a configuração CORS de Actions...'
    $actionPreflight = Invoke-WebRequest `
      -Uri "$resolvedProjectUrl/functions/v1/aralearn-authoring-action/listarCursos" `
      -Method Options `
      -Headers @{
        Origin = 'https://chatgpt.com'
        'Access-Control-Request-Method' = 'POST'
      } `
      -UseBasicParsing
    if ($actionPreflight.StatusCode -lt 200 -or
        $actionPreflight.StatusCode -ge 300 -or
        $actionPreflight.Headers['Access-Control-Allow-Origin'] -ne
          'https://chatgpt.com') {
      throw 'O preflight hospedado de Actions falhou; a publicação deve ser interrompida.'
    }

    Write-Host 'Validando o MCP OAuth hospedado...'
    & node .\scripts\runHostedMcpOAuthSmoke.mjs
    if ($LASTEXITCODE -ne 0) {
      throw 'O smoke hospedado do runtime de Cursos falhou; as funções antigas foram preservadas.'
    }

    Write-Host 'Validando o upload autenticado e o download de PDF hospedados...'
    & node .\scripts\runHostedCourseSourcePdfSmoke.mjs
    if ($LASTEXITCODE -ne 0) {
      throw 'O smoke hospedado de PDF falhou; a implantação requer correção.'
    }

    Write-Host 'As funções da versão publicada foram preservadas até a verificação do novo site.'
  }

  Write-Host 'Implantação concluída.'
}
finally {
  Pop-Location
}
