-- Aggregate set-valued parameters in catalog order before counting distinct units.
-- Preserve the reader's scope, metadata, permissions and all stored applications.
begin;

do $canonical_parameter_groups$
declare definition text; old_fragment text; new_fragment text;
begin
  definition:=replace(pg_get_functiondef(
    'public.get_owned_course_authoring_analytics_for_actor_v4(uuid,uuid,bigint,jsonb)'::regprocedure),
    E'\r\n',E'\n');
  old_fragment:=$old$  parameter_value_rows as materialized (
    select parameter.value->>'parameterId' as parameter_id,
      parameter.value->'value' as value,parameter.value->>'origin' as origin,parameter.value->>'reason' as reason,
      parameter.value->>'sourceScopeKind' as source_scope_kind,
      count(distinct design.study_unit_id)::integer as study_unit_count
    from current_design design
    cross join lateral jsonb_array_elements(design.snapshot->'parameters') parameter(value)
    where parameter.value->>'parameterId'
        <> 'new_analysis_unit_ceiling_per_expository_study_unit'
      or design.application->>'mode' in('expository','mixed')
    group by parameter.value->>'parameterId',parameter.value->'value',
      parameter.value->>'origin',parameter.value->>'reason',parameter.value->>'sourceScopeKind'
  ),$old$;
  new_fragment:=$new$  parameter_value_rows as materialized (
    select parameter.value->>'parameterId' as parameter_id,
      canonical.value,parameter.value->>'origin' as origin,parameter.value->>'reason' as reason,
      parameter.value->>'sourceScopeKind' as source_scope_kind,
      count(distinct design.study_unit_id)::integer as study_unit_count
    from current_design design
    cross join lateral jsonb_array_elements(design.snapshot->'parameters') parameter(value)
    left join private.course_design_parameter_definitions definition
      on definition.parameter_id=parameter.value->>'parameterId'
    cross join lateral (
      select case when definition.value_kind='set'
        and private.valid_course_design_parameter_value_v1(definition.parameter_id,parameter.value->'value')
        then coalesce(private.canonical_course_design_parameter_value_v1(
          definition.parameter_id,parameter.value->'value'),parameter.value->'value')
        else parameter.value->'value' end as value
    ) canonical
    where parameter.value->>'parameterId'
        <> 'new_analysis_unit_ceiling_per_expository_study_unit'
      or design.application->>'mode' in('expository','mixed')
    group by parameter.value->>'parameterId',canonical.value,
      parameter.value->>'origin',parameter.value->>'reason',parameter.value->>'sourceScopeKind'
  ),$new$;
  if length(definition)-length(replace(definition,old_fragment,''))<>length(old_fragment) then
    raise exception 'A agregação precursora de parâmetros de analytics divergiu.';
  end if;
  execute replace(definition,old_fragment,new_fragment);
end $canonical_parameter_groups$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object(
    'schemaRevision','20260929082030');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
