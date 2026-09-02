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
  'https://chatgpt.com'
)

function Invoke-AraLearnSupabase {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & npx.cmd --yes supabase@2.115.0 @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "A Supabase CLI falhou: supabase $($Arguments -join ' ')."
  }
}

function Invoke-AraLearnDatabaseLintGate {
  $lintOutput = @(& npx.cmd --yes supabase@2.115.0 db lint --linked --level warning 2>&1)
  $lintExitCode = [int]$LASTEXITCODE
  foreach ($line in $lintOutput) {
    Write-Host $line
  }
  return $lintExitCode
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
  Write-Host 'Validando as tarefas humanas de Autoria antes da implantação...'
  & node .\scripts\buildChatGptActionOpenApi.mjs --check
  if ($LASTEXITCODE -ne 0) {
    throw 'O OpenAPI de Actions não corresponde ao protocolo público corrente.'
  }
  & node --test `
    .\tests\runtime\chatgpt-action-human-schema.test.js `
    .\tests\runtime\course-authoring-contract-runtime.test.js `
    .\tests\runtime\course-action-server.test.js `
    .\tests\runtime\course-human-task-executor.test.js `
    .\tests\runtime\course-human-materialization.test.js `
    .\tests\runtime\course-human-corrections.test.js `
    .\tests\runtime\course-human-mcp.test.js
  if ($LASTEXITCODE -ne 0) {
    throw 'Os gates do protocolo público de Autoria falharam; a implantação foi bloqueada.'
  }

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
    $contractIdentitySource = @'
import {
  COURSE_HUMAN_TASK_CATALOG_HEADER
} from "./supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
process.stdout.write(COURSE_HUMAN_TASK_CATALOG_HEADER);
'@
    $expectedAuthoringContractHeader = [string](
      & node --input-type=module --eval $contractIdentitySource
    )
    if ($LASTEXITCODE -ne 0 -or
        [string]::IsNullOrWhiteSpace($expectedAuthoringContractHeader)) {
      throw 'Não foi possível obter a identidade canônica local da Autoria.'
    }
    $expectedAuthoringContractHeader = $expectedAuthoringContractHeader.Trim()
    $courseApiPreflight = Invoke-WebRequest `
      -Uri "$resolvedProjectUrl/functions/v1/aralearn-course-api/v1/courses" `
      -Method Options `
      -Headers @{
        Origin = 'https://fabio-ara.github.io'
        'Access-Control-Request-Method' = 'GET'
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
      -Uri "$resolvedProjectUrl/functions/v1/aralearn-authoring-action/retomar_curso" `
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
    if ([string]$actionPreflight.Headers['X-AraLearn-Authoring-Contract'] -ne
        $expectedAuthoringContractHeader) {
      throw 'A Action hospedada não corresponde ao contrato canônico local da Autoria.'
    }

    Write-Host 'Validando o MCP OAuth hospedado...'
    & node .\scripts\runHostedMcpOAuthSmoke.mjs
    if ($LASTEXITCODE -ne 0) {
      throw 'O smoke hospedado do runtime de Cursos falhou; as funções antigas foram preservadas.'
    }

    Write-Host 'As funções da versão publicada foram preservadas até a verificação do novo site.'
  }

  Write-Host 'Implantação concluída.'
}
finally {
  Pop-Location
}
