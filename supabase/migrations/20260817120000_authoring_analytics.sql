-- Analytics instrucionais não punitivos: datasets versionados, outcomes
-- explícitos, visualizações rastreáveis e exportação paginada.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-authoring-analytics-v1', 0
));

create table private.authoring_analytics_metric_definitions (
  metric_id text not null,
  metric_version text not null,
  dataset text not null,
  label text not null,
  question text not null,
  definition text not null,
  value_type text not null,
  unit text not null,
  derivation text not null,
  missing_treatment text not null,
  interpretation text not null,
  limitations text not null,
  denominator_definition text,
  primary key(metric_id,metric_version),
  constraint authoring_analytics_metric_definition_shape_v1 check (
    metric_id ~ '^[a-z][a-z0-9._-]{0,159}$'
    and metric_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'
    and dataset in (
      'authoring_design','authoring_process',
      'experiment_assignments','experiment_outcomes'
    )
    and value_type in ('count','ratio','numeric','category','boolean','json')
    and nullif(btrim(label),'') is not null
    and nullif(btrim(question),'') is not null
    and nullif(btrim(definition),'') is not null
    and nullif(btrim(unit),'') is not null
    and nullif(btrim(derivation),'') is not null
    and nullif(btrim(missing_treatment),'') is not null
    and nullif(btrim(interpretation),'') is not null
    and nullif(btrim(limitations),'') is not null
    and char_length(label) <= 160
    and char_length(question) <= 500
    and char_length(definition) <= 1000
    and char_length(derivation) <= 1000
    and char_length(missing_treatment) <= 1000
    and char_length(interpretation) <= 1000
    and char_length(limitations) <= 1000
  )
);

insert into private.authoring_analytics_metric_definitions(
  metric_id,metric_version,dataset,label,question,definition,value_type,unit,
  derivation,missing_treatment,interpretation,limitations,
  denominator_definition
) values
  ('design.assignment_origin','1.0.0','authoring_design',
   'Origem dos valores','Como os parâmetros efetivos foram resolvidos?',
   'Conta valores efetivos por default, Auto, override humano e lock de protocolo.',
   'count','valor efetivo','Snapshot efetivo corrente de cada microssequência.',
   'Microssequências sem snapshot não entram e aparecem na cobertura do processo.',
   'Mostra a composição das decisões de desenho, não qualidade ou esforço.',
   'Override não é acerto nem erro; Auto não é superior ao julgamento humano.',
   'Total de valores efetivos nas microssequências com snapshot corrente.'),
  ('design.resource_package','1.0.0','authoring_design',
   'Resources materializados','Quais packages foram realmente usados?',
   'Conta seleções da materialização corrente por package, papel e fit.',
   'count','seleção materializada','Manifesto corrente por microssequência.',
   'Microssequências sem manifesto ficam fora e são contadas separadamente.',
   'Descreve a composição dos resources usados.',
   'Maior variedade ou especialização não implica melhor aprendizagem.',
   'Total de seleções de resource dos manifestos correntes.'),
  ('design.resource_role','1.0.0','authoring_design',
   'Papel do resource','Que função os resources materializados cumprem?',
   'Conta seleções materializadas por papel instrucional explícito.',
   'count','seleção materializada','Manifesto corrente e papel declarado da seleção.',
   'Seleção sem manifesto corrente fica fora e não é inferida pelo tipo do card.',
   'Distingue apoio teórico, prática e resposta quando declarados.',
   'A quantidade em cada papel não indica adequação ou aprendizagem.',
   'Total de seleções de resource dos manifestos correntes.'),
  ('design.resource_fit','1.0.0','authoring_design',
   'Fit do resource','O uso foi canônico, versátil ou substituto?',
   'Conta o fit explicitamente registrado na materialização corrente.',
   'count','seleção materializada','Manifesto corrente e fit declarado.',
   'Fit ausente não é inferido; limitações permanecem nas linhas de proveniência.',
   'Torna substituições e limitações visíveis para revisão.',
   'Canônico não significa melhor; substitute não significa inadequado sem contexto.',
   'Total de seleções de resource dos manifestos correntes.'),
  ('design.resource_set_use','1.0.0','authoring_design',
   'ResourceSets usados','Quais conjuntos permitidos chegaram à materialização?',
   'Conta seleções correntes por ResourceSet exato e versionado.',
   'count','seleção materializada','ResourceSetRef congelada no manifesto.',
   'Conjunto disponível sem seleção permanece ausente e não vira uso implícito.',
   'Permite confrontar permitido e efetivamente usado pela proveniência.',
   'Mais conjuntos ou variedade não implicam desenho melhor.',
   'Total de seleções de resource dos manifestos correntes.'),
  ('process.materialization_coverage','1.0.0','authoring_process',
   'Cobertura de materialização','Quantas microssequências têm manifesto corrente?',
   'Compara microssequências estruturais com bindings que possuem manifesto corrente.',
   'ratio','proporção','Estado relacional corrente do workspace.',
   'Microssequência removida não integra o denominador corrente.',
   'Ajuda a localizar trabalho estrutural ainda não materializado.',
   'Não mede aprendizagem, qualidade ou esforço autoral.',
   'Microssequências correntes no workspace.'),
  ('process.finding_status','1.0.0','authoring_process',
   'Findings por estado','Como estão as observações formais da auditoria?',
   'Conta a ocorrência operacional mais recente de cada finding por status.',
   'count','finding','Observações estruturadas não superseded.',
   'Ausência de finding não prova conformidade de dimensão não verificada.',
   'Mostra pendências, decisões e reparos do ciclo de autoria.',
   'Não constitui nota de qualidade instrucional.',
   'Total de findings estruturados não superseded.'),
  ('process.part_microsequence_count','1.0.0','authoring_process',
   'Microssequências por Parte','Como o curso está distribuído entre Partes?',
   'Conta os ids declarados em cada Parte do estado corrente.',
   'count','microssequência','Composição corrente de Partes.',
   'Ids de alvos indisponíveis permanecem no total até reorganização explícita.',
   'Descreve granularidade estrutural, sem recomendar um tamanho ideal.',
   'Partes maiores não são automaticamente piores ou melhores.',
   'Microssequências declaradas na Parte.'),
  ('experiment.assignment_count','1.0.0','experiment_assignments',
   'N por condição','Como participantes atribuídos se distribuem por condição?',
   'Conta assignments válidos e append-only por condição.',
   'count','participante atribuído','Assignment exato à VariantRevision congelada.',
   'Enrollment ainda não atribuído não integra N; withdrawal permanece indicado.',
   'Descreve a distribuição realizada pelo algoritmo governado.',
   'N não mede adesão, aprendizagem ou qualidade do experimento.',
   'Assignments válidos do protocolo selecionado.'),
  ('experiment.outcome_numeric','1.0.0','experiment_outcomes',
   'Outcome numérico','Quais valores descritivos foram observados por condição?',
   'Resume N, ausentes, média, mínimo e máximo de um outcome numérico explícito.',
   'numeric','unidade do instrumento','Observações versionadas do instrumento.',
   'Ausentes são contados e nunca imputados automaticamente.',
   'Permite comparação descritiva, com instrumento e onda visíveis.',
   'Não executa teste inferencial nem sustenta causalidade automaticamente.',
   'Assignments com observação esperada para instrumento/outcome/onda.'),
  ('experiment.outcome_category','1.0.0','experiment_outcomes',
   'Distribuição categórica','Como categorias observadas se distribuem por condição?',
   'Conta valores categóricos explícitos por condição, instrumento e onda.',
   'count','observação','Observações versionadas do instrumento.',
   'Ausentes formam categoria separada e não entram em percentuais válidos.',
   'Mostra frequências descritivas da medida declarada.',
   'Categorias não são ordenadas nem avaliadas automaticamente.',
   'Observações não ausentes do recorte.'),
  ('learning.structural_progress','1.0.0','authoring_process',
   'Progresso estrutural','Qual parcela estrutural foi concluída explicitamente?',
   'Usa somente estado funcional explícito já persistido pelo fluxo de estudo.',
   'ratio','proporção','Agregado compacto canônico de learning analytics.',
   'Ausência de sincronização não é convertida em participação negativa.',
   'Apoia retomada e planejamento pedagógico.',
   'Não infere atenção, esforço, domínio ou aprendizagem.',
   'Unidades estruturais aplicáveis no recorte.');

create table private.authoring_experiment_outcome_observations (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  enrollment_id uuid not null,
  participant_ref text not null,
  protocol_revision integer not null,
  condition_id text not null,
  variant_revision_id uuid not null,
  instrument_id text not null,
  instrument_version text not null,
  outcome_id text not null,
  outcome_version text not null,
  wave text not null,
  value_kind text not null,
  numeric_value numeric,
  text_value text,
  boolean_value boolean,
  missing_reason text,
  observed_at timestamptz not null,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(enrollment_id,instrument_id,instrument_version,outcome_id,outcome_version,wave),
  foreign key(enrollment_id,experiment_id,protocol_revision,participant_ref)
    references private.authoring_experiment_enrollments(
      id,experiment_id,protocol_revision,participant_ref
    ) on delete restrict,
  foreign key(variant_revision_id,experiment_id,protocol_revision,condition_id)
    references private.authoring_experiment_variant_revisions(
      id,experiment_id,protocol_revision,condition_id
    ) on delete restrict,
  constraint authoring_experiment_outcomes_shape_v1 check (
    participant_ref ~ '^participant:[0-9a-f-]{36}$'
    and condition_id ~ '^[a-z][a-z0-9._:-]{0,119}$'
    and instrument_id ~ '^[a-z][a-z0-9._:-]{0,159}$'
    and instrument_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and outcome_id ~ '^[a-z][a-z0-9._:-]{0,159}$'
    and outcome_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and wave ~ '^[a-z][a-z0-9._:-]{0,79}$'
    and value_kind in ('numeric','category','boolean','text','missing')
    and ((value_kind='numeric' and numeric_value is not null
          and text_value is null and boolean_value is null and missing_reason is null)
      or (value_kind in ('category','text') and numeric_value is null
          and nullif(btrim(text_value),'') is not null
          and char_length(text_value)<=1000 and boolean_value is null
          and missing_reason is null)
      or (value_kind='boolean' and numeric_value is null and text_value is null
          and boolean_value is not null and missing_reason is null)
      or (value_kind='missing' and numeric_value is null and text_value is null
          and boolean_value is null and nullif(btrim(missing_reason),'') is not null
          and char_length(missing_reason)<=500))
  )
);

create table private.authoring_analytics_dataset_versions (
  workspace_id uuid not null references private.authoring_workspaces(id)
    on delete cascade,
  dataset text not null,
  scope_key text not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(workspace_id,dataset,scope_key),
  constraint authoring_analytics_dataset_versions_shape_v1 check (
    dataset in (
      'authoring_design','authoring_process',
      'experiment_assignments','experiment_outcomes'
    )
    and nullif(btrim(scope_key),'') is not null
    and char_length(scope_key)<=240
    and revision>=0
  )
);

create table private.authoring_analytics_outcome_receipts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,request_id),
  constraint authoring_analytics_outcome_receipts_shape_v1 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    and payload_hash ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(result)='object'
    and pg_column_size(result)<=32768
  )
);

create function private.reject_authoring_analytics_definition_mutation_v1()
returns trigger language plpgsql security definer
set search_path=pg_catalog as $function$
begin
  raise exception 'Definições de analytics são imutáveis.' using errcode='55000';
end;
$function$;

create function private.reject_authoring_analytics_outcome_mutation_v1()
returns trigger language plpgsql security definer
set search_path=pg_catalog as $function$
begin
  if tg_op='UPDATE' and private.authoring_experiment_only_actor_anonymization_v1(
    to_jsonb(old),to_jsonb(new)
  ) then
    return new;
  end if;
  raise exception 'Observações de analytics são imutáveis.'
    using errcode='55000';
end;
$function$;

create trigger authoring_analytics_metric_definitions_immutable_v1
before update or delete on private.authoring_analytics_metric_definitions
for each row execute function private.reject_authoring_analytics_definition_mutation_v1();
create trigger authoring_experiment_outcomes_immutable_v1
before update or delete on private.authoring_experiment_outcome_observations
for each row execute function private.reject_authoring_analytics_outcome_mutation_v1();

create view private.authoring_analytics_design_rows_v1 as
with current_manifest as (
  select distinct on(manifest.workspace_id,manifest.scope_ref)
    manifest.*
  from private.authoring_materialization_manifests manifest
  order by manifest.workspace_id,manifest.scope_ref,
    manifest.created_revision desc,manifest.manifest_id,manifest.manifest_version
), parameter_rows as (
  select binding.workspace_id,
    'parameter:'||binding.microsequence_ref||':'||value.parameter_id||'@'||
      value.parameter_version as row_key,
    jsonb_build_object(
      'rowKind','parameter',
      'entityPath',to_jsonb(snapshot.scope_path),
      'microsequenceRef',binding.microsequence_ref,
      'revision',binding.bound_at_revision,
      'parameterRef',jsonb_build_object(
        'id',value.parameter_id,'version',value.parameter_version
      ),
      'value',value.value,
      'unit',jsonb_build_object(
        'numerator',definition.unit_numerator,
        'denominator',definition.unit_denominator
      ),
      'origin',value.assignment_mode,
      'authority',case value.assignment_mode
        when 'manual_override' then 'author'
        when 'research_lock' then 'research_protocol'
        when 'auto' then 'gpt'
        else 'catalog_default' end,
      'effectiveSnapshotRef',jsonb_build_object(
        'id',snapshot.snapshot_id,'version',snapshot.snapshot_version
      ),
      'manifestRef',case when manifest.manifest_id is null then null else
        jsonb_build_object('id',manifest.manifest_id,'version',manifest.manifest_version)
        end,
      'materializedValue',null,
      'auditStatus',case when exists(
        select 1 from private.authoring_workspace_observations finding
        where finding.workspace_id=binding.workspace_id
          and finding.kind='audit_finding'
          and finding.status in ('open','approved','repaired')
          and finding.superseded_by_finding_id is null
          and finding.entity_path[1:4]=snapshot.scope_path
      ) then 'finding_open' else 'no_active_finding' end,
      'provenance',jsonb_build_object(
        'snapshotHash',snapshot.payload_hash,
        'analysisRef',jsonb_build_object(
          'id',snapshot.analysis_id,'version',snapshot.analysis_version
        )
      )
    ) row_value
  from private.authoring_microsequence_design_bindings binding
  join private.authoring_effective_design_snapshots snapshot
    on snapshot.workspace_id=binding.workspace_id
   and snapshot.snapshot_id=binding.snapshot_id
   and snapshot.snapshot_version=binding.snapshot_version
  join private.authoring_effective_design_snapshot_values value
    on value.workspace_id=snapshot.workspace_id
   and value.snapshot_id=snapshot.snapshot_id
   and value.snapshot_version=snapshot.snapshot_version
  join private.authoring_design_parameter_definitions definition
    on definition.parameter_id=value.parameter_id
   and definition.parameter_version=value.parameter_version
  left join current_manifest manifest
    on manifest.workspace_id=binding.workspace_id
   and manifest.scope_ref=binding.microsequence_ref
   and manifest.snapshot_id=binding.snapshot_id
   and manifest.snapshot_version=binding.snapshot_version
), resource_rows as (
  select manifest.workspace_id,
    'resource:'||manifest.scope_ref||':'||selection.selection_id as row_key,
    jsonb_build_object(
      'rowKind','resource',
      'entityPath',to_jsonb(manifest.scope_path),
      'microsequenceRef',manifest.scope_ref,
      'revision',manifest.materialized_workspace_revision,
      'packageRef',jsonb_build_object(
        'id',selection.package_id,'version',selection.package_version
      ),
      'family',split_part(selection.package_id,'.',3),
      'role',selection.role,
      'fit',selection.fit,
      'resourceSetRef',jsonb_build_object(
        'id',selection.resource_set_id,'version',selection.resource_set_version
      ),
      'limitations',to_jsonb(selection.limitations),
      'materializedCount',(select count(*)
        from private.authoring_manifest_materialized_resources materialized
        where materialized.workspace_id=selection.workspace_id
          and materialized.manifest_id=selection.manifest_id
          and materialized.manifest_version=selection.manifest_version
          and materialized.selection_id=selection.selection_id),
      'manifestRef',jsonb_build_object(
        'id',manifest.manifest_id,'version',manifest.manifest_version
      ),
      'provenance',jsonb_build_object('contentHash',manifest.content_hash)
    ) row_value
  from current_manifest manifest
  join private.authoring_manifest_resource_selections selection
    on selection.workspace_id=manifest.workspace_id
   and selection.manifest_id=manifest.manifest_id
   and selection.manifest_version=manifest.manifest_version
)
select * from parameter_rows union all select * from resource_rows;

create view private.authoring_analytics_process_rows_v1 as
with part_rows as (
  select workspace.id workspace_id,
    'part:'||(part.value->>'id') as row_key,
    jsonb_build_object(
      'rowKind','part','partId',part.value->>'id',
      'label',coalesce(nullif(part.value->>'title',''),part.value->>'id'),
      'microsequenceCount',jsonb_array_length(
        coalesce(part.value->'microsequenceIds','[]'::jsonb)
      ),
      'revision',workspace.revision
    ) row_value
  from private.authoring_workspaces workspace
  cross join lateral jsonb_array_elements(
    coalesce(workspace.authoring_state->'parts','[]'::jsonb)
  ) with ordinality part(value,ordinal)
), finding_rows as (
  select finding.workspace_id,'finding:'||finding.id::text row_key,
    jsonb_build_object(
      'rowKind','finding','findingId',finding.id,
      'entityPath',to_jsonb(finding.entity_path),
      'category',finding.category,'status',finding.status,
      'severity',finding.severity,'origin',finding.finding_origin,
      'auditRunRef',case when finding.audit_run_id is null then null else
        jsonb_build_object('id',finding.audit_run_id,'version',finding.audit_revision::text)
        end,
      'resultingRevision',finding.resulting_revision,
      'verification',finding.verification,
      'superseded',finding.superseded_by_finding_id is not null
    ) row_value
  from private.authoring_workspace_observations finding
  where finding.kind='audit_finding'
    and finding.superseded_by_finding_id is null
), manifest_rows as (
  select manifest.workspace_id,
    'manifest:'||manifest.manifest_id||'@'||manifest.manifest_version row_key,
    jsonb_build_object(
      'rowKind','materialization','entityPath',to_jsonb(manifest.scope_path),
      'manifestRef',jsonb_build_object(
        'id',manifest.manifest_id,'version',manifest.manifest_version
      ),
      'revision',manifest.materialized_workspace_revision,
      'contentHash',manifest.content_hash,
      'metrics',coalesce((select jsonb_agg(jsonb_build_object(
        'metricRef',jsonb_build_object('id',metric.metric_id,'version',metric.algorithm_version),
        'value',metric.value,'unit',metric.unit,
        'denominator',jsonb_build_object(
          'count',metric.denominator_count,'unit',metric.denominator_unit
        )
      ) order by metric.metric_id)
      from private.authoring_manifest_metrics metric
      where metric.workspace_id=manifest.workspace_id
        and metric.manifest_id=manifest.manifest_id
        and metric.manifest_version=manifest.manifest_version),'[]'::jsonb)
    ) row_value
  from private.authoring_materialization_manifests manifest
), learning_stats as (
  select workspace.id workspace_id,
    count(distinct state_row.user_id)::integer selections,
    0::integer expected,
    coalesce(sum(state_row.completed_card_count),0)::integer completed
  from private.authoring_workspaces workspace
  left join private.trail_items item
    on item.workspace_id=workspace.id
  left join public.trail_personal_states state_row
    on state_row.trail_item_id=item.id
  group by workspace.id
), learning_rows as (
  select stats.workspace_id,'learning:completed' row_key,
    jsonb_build_object(
      'rowKind','learning','state','completed','label','Conclusão explícita',
      'value',stats.completed,'unit','card × seleção','missing',false,
      'selectionCount',stats.selections,'denominator',stats.expected
    ) row_value
  from learning_stats stats
  union all
  select stats.workspace_id,'learning:unknown' row_key,
    jsonb_build_object(
      'rowKind','learning','state','unknown',
      'label','Sem conclusão explícita disponível',
      'value',null,
      'unit','card × seleção','missing',true,
      'selectionCount',stats.selections,'denominator',stats.expected
    ) row_value
  from learning_stats stats
)
select * from part_rows union all select * from finding_rows
union all select * from manifest_rows union all select * from learning_rows;

create view private.authoring_analytics_assignment_rows_v1 as
select experiment.workspace_id,assignment.experiment_id,
  'assignment:'||assignment.id::text row_key,
  jsonb_build_object(
    'rowKind','assignment','participantRef',assignment.participant_ref,
    'experimentRef',jsonb_build_object(
      'id',assignment.experiment_id,'version',assignment.experiment_revision::text
    ),
    'protocolRevision',assignment.protocol_revision,
    'conditionRef',jsonb_build_object(
      'id',assignment.condition_id,'version',assignment.protocol_revision::text
    ),
    'variantRevisionRef',jsonb_build_object(
      'id',assignment.variant_revision_id,
      'version',revision.variant_revision::text
    ),
    'assignmentMethod',assignment.assignment_kind,
    'algorithmVersion',assignment.algorithm_version,
    'assignedAt',assignment.assigned_at,
    'enrollmentStatus',enrollment.status,
    'publicationCourseId',assignment.publication_course_id,
    'snapshotRefs',jsonb_build_object(
      'items',coalesce((select jsonb_agg(item.ref order by item.ordinal)
        from (select micro.ordinal,micro.design_refs->'effectiveSnapshotRef' ref
          from private.authoring_experiment_variant_microsequences micro
          where micro.variant_revision_id=assignment.variant_revision_id
          order by micro.ordinal limit 20) item),'[]'::jsonb),
      'count',(select count(*)
        from private.authoring_experiment_variant_microsequences micro
        where micro.variant_revision_id=assignment.variant_revision_id),
      'truncated',(select count(*)>20
        from private.authoring_experiment_variant_microsequences micro
        where micro.variant_revision_id=assignment.variant_revision_id)
    )
  ) row_value
from private.authoring_experiment_assignments assignment
join private.authoring_experiments experiment on experiment.id=assignment.experiment_id
join private.authoring_experiment_enrollments enrollment
  on enrollment.id=assignment.enrollment_id
join private.authoring_experiment_variant_revisions revision
  on revision.id=assignment.variant_revision_id;

create view private.authoring_analytics_outcome_rows_v1 as
select experiment.workspace_id,outcome.experiment_id,
  'outcome:'||outcome.id::text row_key,
  jsonb_build_object(
    'rowKind','outcome','observationRef',outcome.id,
    'participantRef',outcome.participant_ref,
    'protocolRevision',outcome.protocol_revision,
    'conditionRef',jsonb_build_object(
      'id',outcome.condition_id,'version',outcome.protocol_revision::text
    ),
    'variantRevisionRef',jsonb_build_object(
      'id',outcome.variant_revision_id,'version',revision.variant_revision::text
    ),
    'instrumentRef',jsonb_build_object(
      'id',outcome.instrument_id,'version',outcome.instrument_version
    ),
    'outcomeRef',jsonb_build_object(
      'id',outcome.outcome_id,'version',outcome.outcome_version
    ),
    'wave',outcome.wave,'valueKind',outcome.value_kind,
    'value',case outcome.value_kind
      when 'numeric' then to_jsonb(outcome.numeric_value)
      when 'boolean' then to_jsonb(outcome.boolean_value)
      when 'missing' then null else to_jsonb(outcome.text_value) end,
    'missingReason',outcome.missing_reason,
    'observedAt',outcome.observed_at,
    'recordedAt',outcome.recorded_at
  ) row_value
from private.authoring_experiment_outcome_observations outcome
join private.authoring_experiments experiment on experiment.id=outcome.experiment_id
join private.authoring_experiment_variant_revisions revision
  on revision.id=outcome.variant_revision_id;

create function private.authoring_analytics_dataset_set_ref_v1(
  p_workspace_id uuid,p_dataset text,p_scope jsonb
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,private as $function$
declare
  v_workspace_revision bigint;
  v_experiment_id uuid;
  v_experiment_revision bigint:=0;
  v_dataset_revision bigint:=0;
  v_scope_key text:='workspace';
  v_material jsonb;
  v_live_revision jsonb:='{}'::jsonb;
begin
  select revision into v_workspace_revision from private.authoring_workspaces
  where id=p_workspace_id and deleted_at is null;
  if not found then raise exception 'Workspace inexistente.' using errcode='P0002'; end if;
  if p_scope->>'kind'='experiment' then
    v_experiment_id:=(p_scope->>'ref')::uuid;
    select revision into v_experiment_revision
    from private.authoring_experiments
    where id=v_experiment_id and workspace_id=p_workspace_id;
    if not found then raise exception 'Experimento inexistente.' using errcode='P0002'; end if;
    v_scope_key:='experiment:'||v_experiment_id::text;
  end if;
  select revision into v_dataset_revision
  from private.authoring_analytics_dataset_versions
  where workspace_id=p_workspace_id and dataset=p_dataset and scope_key=v_scope_key;
  v_dataset_revision:=coalesce(v_dataset_revision,0);
  if p_dataset='authoring_process' then
    select jsonb_build_object(
      'rows',count(state_row.user_id),
      'completed',coalesce(sum(state_row.completed_card_count),0),
      'updatedAt',max(state_row.updated_at)
    ) into v_live_revision
    from private.trail_items item
    left join public.trail_personal_states state_row
      on state_row.trail_item_id=item.id
    where item.workspace_id=p_workspace_id;
  end if;
  v_material:=jsonb_build_object(
    'schemaVersion','1.0.0','workspaceId',p_workspace_id,
    'workspaceRevision',v_workspace_revision,'dataset',p_dataset,
    'scope',p_scope,'experimentRevision',v_experiment_revision,
    'datasetRevision',v_dataset_revision,'liveRevision',v_live_revision
  );
  return jsonb_build_object(
    'id','analytics:'||p_workspace_id::text||':'||p_dataset||':'||v_scope_key,
    'version',private.authoring_experiment_hash_v1(v_material)
  );
end;
$function$;

create function private.authoring_analytics_scope_valid_v1(
  p_dataset text,p_scope jsonb
)
returns boolean language sql immutable set search_path=pg_catalog as $function$
  select jsonb_typeof(p_scope)='object'
    and not private.authoring_design_contains_forbidden_key_v1(p_scope)
    and p_scope ? 'kind'
    and (p_scope-'kind'-'ref'-'entityPath')='{}'::jsonb
    and (
      (p_dataset in ('experiment_assignments','experiment_outcomes')
        and p_scope->>'kind'='experiment'
        and coalesce(p_scope->>'ref','') ~ '^[0-9a-f-]{36}$')
      or (p_dataset in ('authoring_design','authoring_process')
        and p_scope->>'kind' in (
          'workspace','course','module','lesson','microsequence'
        )
        and (p_scope->>'kind'='workspace' or nullif(p_scope->>'ref','') is not null)
      )
    )
$function$;

create function public.list_authoring_analytics_dataset_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_dataset text,
  p_scope jsonb,
  p_dataset_set_ref jsonb default null,
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $function$
declare
  v_ref jsonb;
  v_offset integer:=0;
  v_count integer;
  v_items jsonb:='[]'::jsonb;
  v_dictionary jsonb;
  v_experiment_id uuid;
  v_scope_ref text:=nullif(p_scope->>'ref','');
begin
  perform private.require_service_role();
  if p_dataset not in (
       'authoring_design','authoring_process',
       'experiment_assignments','experiment_outcomes'
     ) or not private.authoring_analytics_scope_valid_v1(p_dataset,p_scope) then
    raise exception 'Dataset ou escopo de analytics inválido.' using errcode='22023';
  end if;
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception 'Página de analytics inválida.' using errcode='22023';
  end if;
  if p_dataset like 'experiment_%' then
    perform private.require_educational_workspace_capability_v1(
      p_workspace_id,p_actor_id,'research'
    );
    v_experiment_id:=(p_scope->>'ref')::uuid;
  else
    perform private.require_educational_workspace_capability_v1(
      p_workspace_id,p_actor_id,'read'
    );
  end if;
  if p_cursor is not null then
    if p_dataset_set_ref is null or p_cursor !~ '^[0-9]{1,9}$' then
      raise exception 'Cursor exige datasetSetRef e offset válidos.' using errcode='22023';
    end if;
    v_offset:=p_cursor::integer;
  end if;
  v_ref:=private.authoring_analytics_dataset_set_ref_v1(
    p_workspace_id,p_dataset,p_scope
  );
  if p_dataset_set_ref is not null and p_dataset_set_ref is distinct from v_ref then
    raise exception 'Dataset mudou durante a paginação.' using errcode='40001';
  end if;

  if p_dataset='authoring_design' then
    select count(*)::integer into v_count
    from private.authoring_analytics_design_rows_v1 row_value
    where row_value.workspace_id=p_workspace_id
      and (p_scope->>'kind'='workspace'
        or row_value.row_value->'entityPath' ? v_scope_ref);
    select coalesce(jsonb_agg(page.row_value order by page.row_key),'[]'::jsonb)
      into v_items
    from (select row_value.row_key,row_value.row_value
      from private.authoring_analytics_design_rows_v1 row_value
      where row_value.workspace_id=p_workspace_id
        and (p_scope->>'kind'='workspace'
          or row_value.row_value->'entityPath' ? v_scope_ref)
      order by row_value.row_key offset v_offset limit p_limit) page;
  elsif p_dataset='authoring_process' then
    select count(*)::integer into v_count
    from private.authoring_analytics_process_rows_v1 row_value
    where row_value.workspace_id=p_workspace_id
      and (p_scope->>'kind'='workspace'
        or coalesce(row_value.row_value->'entityPath','[]'::jsonb) ? v_scope_ref
        or row_value.row_value->>'partId'=v_scope_ref);
    select coalesce(jsonb_agg(page.row_value order by page.row_key),'[]'::jsonb)
      into v_items
    from (select row_value.row_key,row_value.row_value
      from private.authoring_analytics_process_rows_v1 row_value
      where row_value.workspace_id=p_workspace_id
        and (p_scope->>'kind'='workspace'
          or coalesce(row_value.row_value->'entityPath','[]'::jsonb) ? v_scope_ref
          or row_value.row_value->>'partId'=v_scope_ref)
      order by row_value.row_key offset v_offset limit p_limit) page;
  elsif p_dataset='experiment_assignments' then
    select count(*)::integer into v_count
    from private.authoring_analytics_assignment_rows_v1 row_value
    where row_value.workspace_id=p_workspace_id
      and row_value.experiment_id=v_experiment_id;
    select coalesce(jsonb_agg(page.row_value order by page.row_key),'[]'::jsonb)
      into v_items
    from (select row_value.row_key,row_value.row_value
      from private.authoring_analytics_assignment_rows_v1 row_value
      where row_value.workspace_id=p_workspace_id
        and row_value.experiment_id=v_experiment_id
      order by row_value.row_key offset v_offset limit p_limit) page;
  else
    select count(*)::integer into v_count
    from private.authoring_analytics_outcome_rows_v1 row_value
    where row_value.workspace_id=p_workspace_id
      and row_value.experiment_id=v_experiment_id;
    select coalesce(jsonb_agg(page.row_value order by page.row_key),'[]'::jsonb)
      into v_items
    from (select row_value.row_key,row_value.row_value
      from private.authoring_analytics_outcome_rows_v1 row_value
      where row_value.workspace_id=p_workspace_id
        and row_value.experiment_id=v_experiment_id
      order by row_value.row_key offset v_offset limit p_limit) page;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'metricRef',jsonb_build_object('id',metric.metric_id,'version',metric.metric_version),
    'label',metric.label,'question',metric.question,'definition',metric.definition,
    'valueType',metric.value_type,'unit',metric.unit,'derivation',metric.derivation,
    'missingTreatment',metric.missing_treatment,
    'interpretation',metric.interpretation,'limitations',metric.limitations,
    'denominatorDefinition',metric.denominator_definition
  ) order by metric.metric_id),'[]'::jsonb) into v_dictionary
  from private.authoring_analytics_metric_definitions metric
  where metric.dataset=p_dataset
    or (p_dataset='authoring_process' and metric.metric_id like 'learning.%');

  return jsonb_build_object(
    'contract','aralearn.authoring-analytics.v1','schemaVersion','1.0.0',
    'workspaceId',p_workspace_id,'dataset',p_dataset,'scope',p_scope,
    'datasetSetRef',v_ref,'dictionary',v_dictionary,
    'page',jsonb_build_object(
      'items',v_items,'count',v_count,
      'nextCursor',case when v_offset+p_limit<v_count then (v_offset+p_limit)::text else null end,
      'truncated',v_offset+p_limit<v_count
    )
  );
end;
$function$;

create function public.get_authoring_analytics_overview_v1(
  p_actor_id uuid,p_workspace_id uuid,p_scope jsonb
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $function$
declare
  v_workspace private.authoring_workspaces%rowtype;
  v_experiment_id uuid;
  v_can_research boolean;
  v_design_origins jsonb;
  v_resources jsonb;
  v_resource_roles jsonb;
  v_resource_fits jsonb;
  v_resource_sets jsonb;
  v_resource_count integer:=0;
  v_resource_set_count integer:=0;
  v_findings jsonb;
  v_parts jsonb;
  v_part_count integer:=0;
  v_learning jsonb:='[]'::jsonb;
  v_learning_selections integer:=0;
  v_assignments jsonb:='[]'::jsonb;
  v_outcomes jsonb:='[]'::jsonb;
  v_outcome_count integer:=0;
  v_outcome_group_count integer:=0;
  v_sections jsonb;
  v_overview_ref jsonb;
begin
  perform private.require_service_role();
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id,p_actor_id,'read'
  );
  select * into v_workspace from private.authoring_workspaces
  where id=p_workspace_id and deleted_at is null;
  if not found then raise exception 'Workspace inexistente.' using errcode='P0002'; end if;
  if jsonb_typeof(p_scope)<>'object' or not (p_scope ? 'kind')
     or (p_scope-'kind'-'ref'-'entityPath')<>'{}'::jsonb then
    raise exception 'Escopo de analytics inválido.' using errcode='22023';
  end if;
  if p_scope->>'kind' not in ('workspace','experiment') then
    raise exception 'Overview aceita apenas workspace ou experimento.' using errcode='22023';
  end if;
  v_can_research:=private.educational_workspace_can_v1(
    p_workspace_id,p_actor_id,'research'
  );
  if p_scope->>'kind'='experiment' then
    if not v_can_research then
      raise exception 'Analytics experimental não autorizado.' using errcode='42501';
    end if;
    v_experiment_id:=(p_scope->>'ref')::uuid;
    perform 1 from private.authoring_experiments
      where id=v_experiment_id and workspace_id=p_workspace_id;
    if not found then raise exception 'Experimento inexistente.' using errcode='P0002'; end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',origin,'label',case origin when 'default' then 'Catálogo'
      when 'auto' then 'Auto' when 'manual_override' then 'Override humano'
      else 'Protocolo' end,'value',amount,'missing',false
  ) order by origin),'[]'::jsonb) into v_design_origins
  from (select row_value->>'origin' origin,count(*)::integer amount
    from private.authoring_analytics_design_rows_v1
    where workspace_id=p_workspace_id and row_value->>'rowKind'='parameter'
    group by row_value->>'origin') distribution;

  select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object(
    'key',package_id,'label',package_id,'value',amount,'missing',false
  ) order by amount desc,package_id) filter(where ordinal<=12),'[]'::jsonb)
    into v_resource_count,v_resources
  from (select package_id,amount,row_number() over(order by amount desc,package_id) ordinal
    from (select row_value#>>'{packageRef,id}' package_id,count(*)::integer amount
      from private.authoring_analytics_design_rows_v1
      where workspace_id=p_workspace_id and row_value->>'rowKind'='resource'
      group by row_value#>>'{packageRef,id}') counts) ranked;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',role,'label',role,'value',amount,'missing',false
  ) order by role),'[]'::jsonb) into v_resource_roles
  from (select row_value->>'role' role,count(*)::integer amount
    from private.authoring_analytics_design_rows_v1
    where workspace_id=p_workspace_id and row_value->>'rowKind'='resource'
    group by row_value->>'role') distribution;
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',fit,'label',fit,'value',amount,'missing',false
  ) order by fit),'[]'::jsonb) into v_resource_fits
  from (select row_value->>'fit' fit,count(*)::integer amount
    from private.authoring_analytics_design_rows_v1
    where workspace_id=p_workspace_id and row_value->>'rowKind'='resource'
    group by row_value->>'fit') distribution;
  select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object(
    'key',set_id,'label',set_id,'value',amount,'missing',false
  ) order by amount desc,set_id) filter(where ordinal<=12),'[]'::jsonb)
    into v_resource_set_count,v_resource_sets
  from (select set_id,amount,row_number() over(order by amount desc,set_id) ordinal
    from (select row_value#>>'{resourceSetRef,id}' set_id,count(*)::integer amount
      from private.authoring_analytics_design_rows_v1
      where workspace_id=p_workspace_id and row_value->>'rowKind'='resource'
      group by row_value#>>'{resourceSetRef,id}') counts) ranked;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',status,'label',status,'value',amount,'missing',false
  ) order by status),'[]'::jsonb) into v_findings
  from (select status,count(*)::integer amount
    from private.authoring_workspace_observations
    where workspace_id=p_workspace_id and kind='audit_finding'
      and superseded_by_finding_id is null group by status) distribution;

  select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object(
    'key',part.value->>'id','label',coalesce(nullif(part.value->>'title',''),part.value->>'id'),
    'value',jsonb_array_length(coalesce(part.value->'microsequenceIds','[]'::jsonb)),
    'missing',false
  ) order by part.ordinal) filter(where part.ordinal<=12),'[]'::jsonb)
  into v_part_count,v_parts
  from jsonb_array_elements(coalesce(v_workspace.authoring_state->'parts','[]'::jsonb))
    with ordinality part(value,ordinal);

  select coalesce(max((row_value->>'selectionCount')::integer),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'key',row_value->>'state','label',row_value->>'label',
      'value',(row_value->>'value')::integer,'missing',(row_value->>'missing')::boolean
    ) order by row_key),'[]'::jsonb)
  into v_learning_selections,v_learning
  from private.authoring_analytics_process_rows_v1
  where workspace_id=p_workspace_id and row_value->>'rowKind'='learning';

  if v_experiment_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',condition_id,'label',condition_id,'value',amount,'missing',false
    ) order by condition_id),'[]'::jsonb) into v_assignments
    from (select assignment.condition_id,count(*)::integer amount
      from private.authoring_experiment_assignments assignment
      where assignment.experiment_id=v_experiment_id
      group by assignment.condition_id) distribution;

    select count(*)::integer into v_outcome_count
    from private.authoring_experiment_outcome_observations outcome
    where outcome.experiment_id=v_experiment_id;
    select coalesce(max(summary.group_count),0),
      coalesce(jsonb_agg(summary.row_value order by summary.outcome_id,
        summary.wave,summary.condition_id),'[]'::jsonb)
    into v_outcome_group_count,v_outcomes
    from (select outcome.outcome_id,outcome.wave,outcome.condition_id,
      count(*) over()::integer group_count,
      jsonb_build_object(
        'key',outcome.outcome_id||':'||outcome.wave||':'||outcome.condition_id,
        'label',outcome.condition_id,'outcomeRef',jsonb_build_object(
          'id',outcome.outcome_id,'version',min(outcome.outcome_version)
        ),'instrumentRef',jsonb_build_object(
          'id',min(outcome.instrument_id),'version',min(outcome.instrument_version)
        ),'wave',outcome.wave,'conditionId',outcome.condition_id,
        'valueKind',case when bool_and(outcome.value_kind in ('numeric','missing'))
          then 'numeric' else 'mixed' end,
        'n',count(*) filter(where outcome.value_kind<>'missing'),
        'missing',count(*) filter(where outcome.value_kind='missing'),
        'mean',avg(outcome.numeric_value) filter(where outcome.value_kind='numeric'),
        'minimum',min(outcome.numeric_value) filter(where outcome.value_kind='numeric'),
        'maximum',max(outcome.numeric_value) filter(where outcome.value_kind='numeric')
      ) row_value
      from private.authoring_experiment_outcome_observations outcome
      where outcome.experiment_id=v_experiment_id
      group by outcome.outcome_id,outcome.wave,outcome.condition_id
      order by outcome.outcome_id,outcome.wave,outcome.condition_id limit 64) summary;
  end if;

  v_sections:=jsonb_build_array(
    jsonb_build_object(
      'key','design','label','Desenho instrucional',
      'question','Como o desenho efetivo e os resources estão distribuídos?',
      'visualizations',jsonb_build_array(
        jsonb_build_object('key','assignment-origin','kind','bar',
          'metricRef',jsonb_build_object('id','design.assignment_origin','version','1.0.0'),
          'title','Origem dos valores efetivos','unit','valor efetivo',
          'items',v_design_origins),
        jsonb_build_object('key','resource-package','kind','bar',
          'metricRef',jsonb_build_object('id','design.resource_package','version','1.0.0'),
          'title','Packages materializados','unit','seleção materializada',
          'items',v_resources,'truncated',v_resource_count>12),
        jsonb_build_object('key','resource-role','kind','bar',
          'metricRef',jsonb_build_object('id','design.resource_role','version','1.0.0'),
          'title','Papel instrucional dos resources','unit','seleção materializada',
          'items',v_resource_roles),
        jsonb_build_object('key','resource-fit','kind','bar',
          'metricRef',jsonb_build_object('id','design.resource_fit','version','1.0.0'),
          'title','Fit declarado','unit','seleção materializada','items',v_resource_fits),
        jsonb_build_object('key','resource-set-use','kind','bar',
          'metricRef',jsonb_build_object('id','design.resource_set_use','version','1.0.0'),
          'title','ResourceSets efetivamente usados','unit','seleção materializada',
          'items',v_resource_sets,'truncated',v_resource_set_count>12)
      )
    ),
    jsonb_build_object(
      'key','process','label','Processo de autoria',
      'question','Onde estão a estrutura e as pendências explícitas do ciclo?',
      'visualizations',jsonb_build_array(
        jsonb_build_object('key','microsequences-by-part','kind','bar',
          'metricRef',jsonb_build_object('id','process.part_microsequence_count','version','1.0.0'),
          'title','Microssequências por Parte','unit','microssequência',
          'items',v_parts,'truncated',v_part_count>12),
        jsonb_build_object('key','findings-by-status','kind','bar',
          'metricRef',jsonb_build_object('id','process.finding_status','version','1.0.0'),
          'title','Findings por estado','unit','finding','items',v_findings)
      ),
      'notice','Estes estados não medem esforço cognitivo do autor.'
    ),
    jsonb_build_object(
      'key','learning','label','Aprendizagem',
      'question','Quais medidas educacionais explícitas estão disponíveis?',
      'indicators',jsonb_build_array(jsonb_build_object(
        'label','Seleções no recorte','value',v_learning_selections,'unit','seleção'
      )),
      'visualizations',jsonb_build_array(jsonb_build_object(
        'key','structural-progress','kind','bar',
        'metricRef',jsonb_build_object('id','learning.structural_progress','version','1.0.0'),
        'title','Estado estrutural explícito','unit','card × seleção','items',v_learning
      )),
      'empty',v_learning_selections=0,
      'notice','Ausência de conclusão pode refletir falta de sincronização. Abertura, clique, tempo, tentativa, velocidade e revelação não são tratados como aprendizagem.'
    )
  );
  if v_experiment_id is not null then
    v_sections:=v_sections||jsonb_build_array(jsonb_build_object(
      'key','experiment','label','Experimento',
      'question','Como atribuições e outcomes explícitos se distribuem entre condições?',
      'indicators',jsonb_build_array(
        jsonb_build_object('label','N atribuído','value',(
          select count(*) from private.authoring_experiment_assignments
          where experiment_id=v_experiment_id
        ),'unit','participante'),
        jsonb_build_object('label','Observações','value',v_outcome_count,'unit','outcome')
      ),
      'visualizations',jsonb_build_array(
        jsonb_build_object('key','assignments-by-condition','kind','bar',
          'metricRef',jsonb_build_object('id','experiment.assignment_count','version','1.0.0'),
          'title','N por condição','unit','participante atribuído','items',v_assignments),
        jsonb_build_object('key','outcomes-by-condition','kind','summary',
          'metricRef',jsonb_build_object('id','experiment.outcome_numeric','version','1.0.0'),
          'title','Outcomes descritivos por condição','unit','unidade do instrumento',
          'items',v_outcomes,'truncated',v_outcome_group_count>64)
      ),
      'notice','Comparações são descritivas: não há teste inferencial nem conclusão causal automática.'
    ));
  end if;
  v_overview_ref:=private.authoring_analytics_dataset_set_ref_v1(
    p_workspace_id,case when v_experiment_id is null then 'authoring_process'
      else 'experiment_outcomes' end,p_scope
  );
  return jsonb_build_object(
    'contract','aralearn.authoring-analytics.v1','schemaVersion','1.0.0',
    'workspaceId',p_workspace_id,'workspaceRevision',v_workspace.revision,
    'scope',p_scope,'overviewSetRef',v_overview_ref,
    'permissions',jsonb_build_object(
      'design',true,'process',true,'learning',true,
      'experiment',v_can_research,'export',true
    ),
    'sections',v_sections
  );
end;
$function$;

create function public.record_authoring_experiment_outcome_v1(
  p_actor_id uuid,p_workspace_id uuid,p_enrollment_ref uuid,
  p_request_id text,p_payload_hash text,p_payload jsonb
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,extensions as $function$
declare
  v_receipt private.authoring_analytics_outcome_receipts%rowtype;
  v_enrollment private.authoring_experiment_enrollments%rowtype;
  v_assignment private.authoring_experiment_assignments%rowtype;
  v_experiment private.authoring_experiments%rowtype;
  v_value_kind text;
  v_observation_id uuid:=extensions.gen_random_uuid();
  v_result jsonb;
  v_argument_hash text;
begin
  perform private.require_service_role();
  if p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Receipt de outcome inválido.' using errcode='22023';
  end if;
  select * into v_receipt from private.authoring_analytics_outcome_receipts
  where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.payload_hash is distinct from p_payload_hash then
      raise exception 'requestId já usado com outro payload.' using errcode='23505';
    end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  if jsonb_typeof(p_payload)<>'object'
     or (p_payload-'instrumentRef'-'outcomeRef'-'wave'-'valueKind'-'value'
       -'missingReason'-'observedAt')<>'{}'::jsonb
     or not (p_payload ?& array[
       'instrumentRef','outcomeRef','wave','valueKind','observedAt'
     ]) then
    raise exception 'Outcome experimental inválido.' using errcode='22023';
  end if;
  select * into v_enrollment from private.authoring_experiment_enrollments
  where id=p_enrollment_ref for share;
  if not found then raise exception 'Enrollment inexistente.' using errcode='P0002'; end if;
  select * into v_experiment from private.authoring_experiments
  where id=v_enrollment.experiment_id and workspace_id=p_workspace_id;
  if not found then raise exception 'Experimento não pertence ao workspace.' using errcode='42501'; end if;
  if v_experiment.state<>'collecting' then
    raise exception 'Outcomes só podem ser registrados durante a coleta.' using errcode='23514';
  end if;
  if not (
    coalesce(v_enrollment.user_id=p_actor_id,false)
    or private.educational_workspace_can_v1(p_workspace_id,p_actor_id,'research')
  ) then raise exception 'Outcome não autorizado.' using errcode='42501'; end if;
  select * into v_assignment from private.authoring_experiment_assignments
  where enrollment_id=v_enrollment.id and experiment_id=v_enrollment.experiment_id;
  if not found or v_enrollment.status<>'enrolled' then
    raise exception 'Enrollment não está atribuído e ativo.' using errcode='23514';
  end if;
  if not private.authoring_design_closed_object_v1(
       p_payload->'instrumentRef',array['id','version'],array['id','version']
     ) or not private.authoring_design_closed_object_v1(
       p_payload->'outcomeRef',array['id','version'],array['id','version']
     ) then raise exception 'Refs de instrumento/outcome inválidas.' using errcode='22023';
  end if;
  perform 1 from private.authoring_experiment_instruments instrument
  where instrument.experiment_id=v_enrollment.experiment_id
    and instrument.protocol_revision=v_enrollment.protocol_revision
    and instrument.instrument_id=p_payload#>>'{instrumentRef,id}'
    and instrument.instrument_version=p_payload#>>'{instrumentRef,version}'
    and instrument.reference_role='instrument';
  if not found then raise exception 'Instrumento não pertence ao protocolo.' using errcode='23514'; end if;
  perform 1 from private.authoring_experiment_instruments outcome
  where outcome.experiment_id=v_enrollment.experiment_id
    and outcome.protocol_revision=v_enrollment.protocol_revision
    and outcome.instrument_id=p_payload#>>'{outcomeRef,id}'
    and outcome.instrument_version=p_payload#>>'{outcomeRef,version}'
    and outcome.reference_role='outcome';
  if not found then raise exception 'Outcome não pertence ao protocolo.' using errcode='23514'; end if;
  v_value_kind:=p_payload->>'valueKind';
  if v_value_kind not in ('numeric','category','boolean','text','missing')
     or coalesce(p_payload->>'wave','') !~ '^[a-z][a-z0-9._:-]{0,79}$'
     or coalesce(p_payload->>'observedAt','') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' then
    raise exception 'Valor, onda ou instante do outcome inválido.' using errcode='22023';
  end if;
  v_argument_hash:=private.authoring_experiment_hash_v1(jsonb_build_object(
    'workspaceId',p_workspace_id,'enrollmentRef',p_enrollment_ref,
    'payload',p_payload
  ));
  if v_argument_hash is distinct from p_payload_hash then
    raise exception 'payloadHash não corresponde ao outcome.' using errcode='22023';
  end if;
  insert into private.authoring_experiment_outcome_observations(
    id,experiment_id,enrollment_id,participant_ref,protocol_revision,
    condition_id,variant_revision_id,instrument_id,instrument_version,
    outcome_id,outcome_version,wave,value_kind,numeric_value,text_value,
    boolean_value,missing_reason,observed_at,recorded_by
  ) values (
    v_observation_id,v_enrollment.experiment_id,v_enrollment.id,
    v_enrollment.participant_ref,v_enrollment.protocol_revision,
    v_assignment.condition_id,v_assignment.variant_revision_id,
    p_payload#>>'{instrumentRef,id}',p_payload#>>'{instrumentRef,version}',
    p_payload#>>'{outcomeRef,id}',p_payload#>>'{outcomeRef,version}',
    p_payload->>'wave',v_value_kind,
    case when v_value_kind='numeric' then (p_payload->>'value')::numeric end,
    case when v_value_kind in ('category','text') then p_payload->>'value' end,
    case when v_value_kind='boolean' then (p_payload->>'value')::boolean end,
    case when v_value_kind='missing' then p_payload->>'missingReason' end,
    (p_payload->>'observedAt')::timestamptz,p_actor_id
  );
  insert into private.authoring_analytics_dataset_versions(
    workspace_id,dataset,scope_key,revision
  ) values (
    p_workspace_id,'experiment_outcomes',
    'experiment:'||v_enrollment.experiment_id::text,1
  ) on conflict(workspace_id,dataset,scope_key) do update
    set revision=private.authoring_analytics_dataset_versions.revision+1,
      updated_at=clock_timestamp();
  v_result:=jsonb_build_object(
    'contract','aralearn.authoring-analytics-outcome.v1',
    'operation','record_outcome','observationRef',v_observation_id,
    'enrollmentRef',v_enrollment.id,'experimentId',v_enrollment.experiment_id,
    'datasetRevision',(select revision
      from private.authoring_analytics_dataset_versions
      where workspace_id=p_workspace_id and dataset='experiment_outcomes'
        and scope_key='experiment:'||v_enrollment.experiment_id::text),
    'idempotent',false
  );
  insert into private.authoring_analytics_outcome_receipts(
    actor_id,request_id,payload_hash,result
  ) values(p_actor_id,p_request_id,p_payload_hash,v_result);
  return v_result;
end;
$function$;

-- Não há grants diretos às tabelas; todas as leituras e escritas atravessam
-- RPCs service-role com capability e pseudonimização revalidadas.
revoke all on table private.authoring_analytics_metric_definitions,
  private.authoring_experiment_outcome_observations,
  private.authoring_analytics_dataset_versions,
  private.authoring_analytics_outcome_receipts
  from public,anon,authenticated;

do $analytics_rpc_privileges$
declare v_function regprocedure;
begin
  for v_function in select routine.oid::regprocedure
    from pg_proc routine join pg_namespace namespace
      on namespace.oid=routine.pronamespace
    where namespace.nspname='public' and routine.proname=any(array[
      'list_authoring_analytics_dataset_v1',
      'get_authoring_analytics_overview_v1',
      'record_authoring_experiment_outcome_v1'
    ])
  loop
    execute format('revoke all on function %s from public,anon,authenticated',v_function);
    execute format('grant execute on function %s to service_role',v_function);
  end loop;
end;
$analytics_rpc_privileges$;

commit;
