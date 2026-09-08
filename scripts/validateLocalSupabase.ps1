[CmdletBinding()]
param([switch]$DatabaseOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $PSScriptRoot 'deploymentSupport.ps1')
$npxCommand = if ($IsWindows) { 'npx.cmd' } else { 'npx' }
$environmentNames = @('ARALEARN_TEST_DATABASE_URL', 'ARALEARN_TEST_DATABASE_CONTAINER')
$previousEnvironment = @{}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$Arguments = @()
  )
  Write-Host $Label
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Label falhou com código $LASTEXITCODE." }
}

function Get-LocalDatabaseUrl {
  # Capturar o JSON somente em memória; a CLI inclui credenciais que não são logs.
  $source = @(& $npxCommand --yes supabase@2.115.0 status --output json 2>&1) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw 'Prepare a stack Supabase local antes deste gate.' }
  $start = $source.IndexOf('{')
  $end = $source.LastIndexOf('}')
  if ($start -lt 0 -or $end -lt $start) { throw 'Estado local inválido.' }
  try {
    $connection = [string](($source.Substring($start, $end - $start + 1) | ConvertFrom-Json).DB_URL)
    $uri = [Uri]$connection
    if ($uri.Scheme -notin @('postgres', 'postgresql') -or
        $uri.Host -notin @('localhost', '127.0.0.1') -or $uri.UserInfo -notmatch '^[^:]+:.+$') {
      throw 'invalid'
    }
  }
  catch { throw 'Este gate exige uma conexão PostgreSQL local completa.' }
  return $connection
}

function Get-LocalDatabaseInventory {
  param([Parameter(Mandatory)][string]$Container, [Parameter(Mandatory)][Uri]$DatabaseUrl)
  # As mesmas oito famílias do CI: relações, funções, índices, restrições,
  # triggers, policies, estado RLS e buckets. Somente metadados de banco local.
  $query = @'
select case when c.relkind in ('r', 'p') then 'table'
            when c.relkind = 'v' then 'view' else 'materialized_view' end,
       n.nspname || '.' || c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm')
union all
select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
union all
select 'index', n.nspname || '.' || t.relname || '/' || i.relname
from pg_index x join pg_class t on t.oid = x.indrelid join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = t.relnamespace where n.nspname in ('public', 'private')
union all
select 'constraint', n.nspname || '.' || c.relname || '/' || k.conname || '[' ||
       case k.contype when 'c' then 'check' when 'f' then 'foreign_key' when 'p' then 'primary_key'
       when 'u' then 'unique' when 'x' then 'exclusion' when 'n' then 'not_null' else k.contype::text end || ']'
from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private')
union all
select 'trigger', n.nspname || '.' || c.relname || '/' || t.tgname
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private') and not t.tgisinternal
union all
select 'policy', n.nspname || '.' || c.relname || '/' || p.polname
from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private')
union all
select 'rls', n.nspname || '.' || c.relname || '=' ||
       case when c.relforcerowsecurity then 'forced' when c.relrowsecurity then 'enabled' else 'disabled' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
union all select 'bucket', 'storage.' || id from storage.buckets
order by 1, 2;
'@
  $databaseUser = [Uri]::UnescapeDataString($DatabaseUrl.UserInfo.Split(':')[0])
  $databaseName = [Uri]::UnescapeDataString($DatabaseUrl.AbsolutePath.TrimStart('/'))
  $inventory = @(& docker exec $Container psql -U $databaseUser -d $databaseName -X -v ON_ERROR_STOP=1 -At -F '|' -c $query 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível ler o inventário do banco local.' }
  return $inventory -join "`n"
}

Push-Location $repositoryRoot
try {
  foreach ($name in $environmentNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  }
  $databaseUrl = Get-LocalDatabaseUrl
  $configuration = Get-Content -LiteralPath (Join-Path $repositoryRoot 'supabase/config.toml') -Raw
  $project = [regex]::Match($configuration, '(?m)^project_id\s*=\s*"([a-z0-9_-]+)"').Groups[1].Value
  if (-not $project) { throw 'Identidade do projeto Supabase local ausente.' }
  $container = "supabase_db_$project"
  $env:ARALEARN_TEST_DATABASE_URL = $databaseUrl
  $env:ARALEARN_TEST_DATABASE_CONTAINER = $container

  $deno = Resolve-AraLearnDenoCommand
  Invoke-CheckedCommand 'Testes Deno do gateway MCP' $deno @(
    'test', '--config', 'supabase/functions/deno.json', 'supabase/functions/tests/aralearn-authoring-mcp.test.ts'
  )
  foreach ($entry in @('aralearn-authoring-mcp', 'aralearn-course-api', 'aralearn-authoring-action')) {
    Invoke-CheckedCommand "Verificação Deno: $entry" $deno @(
      'check', '--config', 'supabase/functions/deno.json', "supabase/functions/$entry/index.ts"
    )
  }
  Invoke-CheckedCommand 'Testes pgTAP do banco local' $npxCommand @('--yes', 'supabase@2.115.0', 'test', 'db')

  Get-LocalDatabaseInventory -Container $container -DatabaseUrl ([Uri]$databaseUrl) |
    & node ./scripts/auditVerticalParity.mjs --database-inventory -
  if ($LASTEXITCODE -ne 0) { throw 'O inventário local diverge da paridade versionada.' }

  Invoke-CheckedCommand 'Lint dos schemas public e private' $npxCommand @(
    '--yes', 'supabase@2.115.0', 'db', 'lint', '--local', '--schema', 'public,private',
    '--level', 'warning', '--fail-on', 'warning'
  )

  $concurrency = @(& node --test --test-reporter=tap ./tests/runtime/course-postgres-concurrency.test.js 2>&1)
  $concurrencyExit = $LASTEXITCODE
  $summary = $concurrency | Where-Object { $_ -match '^(not ok |# (tests|pass|fail|cancelled|skipped|todo|duration_ms) )' }
  $summary | ForEach-Object { Write-Host $_ }
  $testCount = [regex]::Match(($concurrency -join "`n"), '(?m)^# tests ([1-9][0-9]*)\r?$').Groups[1].Value
  $passCount = [regex]::Match(($concurrency -join "`n"), '(?m)^# pass ([0-9]+)\r?$').Groups[1].Value
  $skipCount = [regex]::Match(($concurrency -join "`n"), '(?m)^# skipped ([0-9]+)\r?$').Groups[1].Value
  if ($concurrencyExit -ne 0 -or -not $testCount -or $testCount -ne $passCount -or $skipCount -ne '0') {
    throw 'A concorrência PostgreSQL exige todos os casos aprovados, sem skips.'
  }
  if (-not $DatabaseOnly) {
    Invoke-CheckedCommand 'Integração HTTP, canais e navegador locais' 'node' @('./scripts/runLocalIntegration.mjs')
  }
  Write-Host 'Gate de banco Supabase local aprovado.'
}
finally {
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
  }
  Pop-Location
}
