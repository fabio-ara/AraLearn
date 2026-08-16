-- Projeção compacta e canônica do andamento da Autoria para Landing e Mapa.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-authoring-product-state-projection-v1', 0
));

do $require_authoring_product_state_dependencies$
begin
  if to_regclass('private.authoring_workspaces') is null
     or to_regclass('private.authoring_workspace_entities') is null
     or to_regclass('private.authoring_workspace_observations') is null
     or to_regclass('private.authoring_instructional_analyses') is null
     or to_regprocedure(
       'private.require_workspace_actor_v5(uuid,text)'
     ) is null
     or to_regprocedure(
       'private.educational_workspace_can_v1(uuid,uuid,text)'
     ) is null then
    raise exception 'Dependências da projeção de estado da Autoria ausentes.'
      using errcode = '55000';
  end if;
end;
$require_authoring_product_state_dependencies$;

create function public.get_authoring_workspace_product_states_v1(
  p_actor_id uuid,
  p_workspace_ids uuid[],
  p_include_microsequences boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_requested_count integer;
  v_visible_count integer;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'authoring:read');
  if p_actor_id is null
     or p_workspace_ids is null
     or cardinality(p_workspace_ids) not between 1 and 100
     or p_include_microsequences is null
     or exists (
       select 1 from unnest(p_workspace_ids) workspace_id
       where workspace_id is null
     ) then
    raise exception 'Escopo da projeção de estado da Autoria inválido.'
      using errcode = '22023';
  end if;
  select count(*), count(distinct workspace_id)
  into v_requested_count, v_visible_count
  from unnest(p_workspace_ids) workspace_id;
  if v_requested_count <> v_visible_count then
    raise exception 'A projeção não aceita workspaces duplicados.'
      using errcode = '22023';
  end if;
  select count(*) into v_visible_count
  from private.authoring_workspaces workspace
  where workspace.id = any(p_workspace_ids)
    and workspace.deleted_at is null
    and private.educational_workspace_can_v1(
      workspace.id, p_actor_id, 'read'
    );
  if v_visible_count <> v_requested_count then
    raise exception 'Workspace inexistente ou sem acesso.' using errcode = 'P0002';
  end if;

  return (
    with requested_workspaces as materialized (
      select workspace.id, workspace.revision
      from private.authoring_workspaces workspace
      where workspace.id = any(p_workspace_ids)
        and workspace.deleted_at is null
    ), active_findings as materialized (
      select observation.workspace_id, observation.entity_path
      from private.authoring_workspace_observations observation
      join requested_workspaces workspace
        on workspace.id = observation.workspace_id
      where observation.kind = 'audit_finding'
        and observation.status in ('open', 'approved', 'repaired')
    ), active_finding_by_microsequence as materialized (
      select
        finding.workspace_id,
        finding.entity_path[4] as microsequence_id,
        count(*)::integer as finding_count
      from active_findings finding
      where cardinality(finding.entity_path) >= 4
      group by finding.workspace_id, finding.entity_path[4]
    ), microsequences as materialized (
      select
        workspace.id as workspace_id,
        microsequence.entity_id,
        microsequence.version,
        microsequence.content->>'status' as status,
        exists (
          select 1
          from private.authoring_workspace_entities card
          where card.workspace_id = workspace.id
            and card.entity_type = 'card'
            and card.parent_type = 'microsequence'
            and card.parent_id = microsequence.entity_id
        ) as has_card,
        exists (
          select 1
          from private.authoring_instructional_analyses analysis
          where analysis.workspace_id = workspace.id
            and analysis.scope_kind = 'microsequence'
            and analysis.scope_ref = microsequence.entity_id
            and analysis.scope_entity_version = microsequence.version
        ) as has_current_analysis,
        coalesce(findings.finding_count, 0) as active_finding_count
      from requested_workspaces workspace
      join private.authoring_workspace_entities microsequence
        on microsequence.workspace_id = workspace.id
       and microsequence.entity_type = 'microsequence'
      left join active_finding_by_microsequence findings
        on findings.workspace_id = workspace.id
       and findings.microsequence_id = microsequence.entity_id
    ), microsequence_summary as materialized (
      select
        microsequence.workspace_id,
        count(*)::integer as microsequence_count,
        count(*) filter(
          where microsequence.has_current_analysis
        )::integer as analyzed_count,
        count(*) filter(
          where microsequence.has_card
        )::integer as materialized_count,
        count(*) filter(
          where microsequence.has_card and microsequence.status = 'ready'
        )::integer as ready_count,
        jsonb_object_agg(
          microsequence.entity_id,
          case
            when microsequence.active_finding_count > 0 then 'f'
            when microsequence.has_card and microsequence.status = 'ready' then 'r'
            when microsequence.has_card then 'm'
            when microsequence.has_current_analysis then 'a'
            else 'p'
          end
          order by microsequence.entity_id
        ) as microsequence_state_map
      from microsequences microsequence
      group by microsequence.workspace_id
    ), finding_summary as materialized (
      select
        workspace.id as workspace_id,
        count(finding.workspace_id)::integer as active_finding_count
      from requested_workspaces workspace
      left join active_findings finding
        on finding.workspace_id = workspace.id
      group by workspace.id
    ), projected as (
      select
        workspace.id,
        workspace.revision,
        coalesce(summary.microsequence_count, 0) as microsequence_count,
        coalesce(summary.analyzed_count, 0) as analyzed_count,
        coalesce(summary.materialized_count, 0) as materialized_count,
        coalesce(summary.ready_count, 0) as ready_count,
        coalesce(findings.active_finding_count, 0) as active_finding_count,
        coalesce(summary.microsequence_state_map, '{}'::jsonb)
          as microsequence_state_map
      from requested_workspaces workspace
      left join microsequence_summary summary
        on summary.workspace_id = workspace.id
      left join finding_summary findings
        on findings.workspace_id = workspace.id
    )
    select jsonb_build_object(
      'items', coalesce(jsonb_agg(
        jsonb_build_object(
          'workspaceId', projected.id,
          'revision', projected.revision,
          'authoringState', case
            when projected.active_finding_count > 0 then 'audit_pending'
            when projected.microsequence_count > 0
              and projected.ready_count = projected.microsequence_count then 'ready'
            when projected.materialized_count > 0
              or projected.analyzed_count > 0 then 'building'
            else 'planning'
          end,
          'microsequenceCount', projected.microsequence_count,
          'analyzedCount', projected.analyzed_count,
          'materializedCount', projected.materialized_count,
          'readyCount', projected.ready_count,
          'activeFindingCount', projected.active_finding_count
        ) || case when p_include_microsequences then jsonb_build_object(
          'microsequenceStateMap', projected.microsequence_state_map
        ) else '{}'::jsonb end
        order by projected.id
      ), '[]'::jsonb)
    )
    from projected
  );
end;
$function$;

revoke all on function public.get_authoring_workspace_product_states_v1(
  uuid, uuid[], boolean
) from public, anon, authenticated, service_role;
grant execute on function public.get_authoring_workspace_product_states_v1(
  uuid, uuid[], boolean
) to service_role;

do $advance_authoring_product_state_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  if to_regprocedure('public.get_aralearn_runtime_manifest()') is null then
    raise exception 'Manifesto de runtime ausente.' using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest ->> 'schemaRevision' <> '20260815230000'
     or not (
       v_manifest -> 'features' ? 'authoring-blueprint-artifact-receipt-v1'
     ) then
    raise exception 'Manifesto anterior à projeção de produto inesperado.'
      using errcode = '55000';
  end if;
  v_manifest := jsonb_set(
    jsonb_set(
      v_manifest,
      array['schemaRevision']::text[],
      '"20260815233000"'::jsonb
    ),
    array['features']::text[],
    ((v_manifest -> 'features') - 'authoring-product-state-projection-v1')
      || '["authoring-product-state-projection-v1"]'::jsonb
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public, anon, authenticated, service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to service_role;
end;
$advance_authoring_product_state_runtime_manifest$;

commit;
