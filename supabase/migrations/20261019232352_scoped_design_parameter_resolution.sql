-- Bound parameter reads to the requested curriculum path. Results, ACLs and
-- precedence stay unchanged; no content or authored assignments are rewritten.
begin;
set local lock_timeout='5s';

create index course_design_parameter_assignments_scope_v1_idx
  on private.course_design_parameter_assignments(course_id,scope_kind,scope_ref);

CREATE OR REPLACE FUNCTION private.course_current_design_parameters_v1(p_course_id uuid, p_scope_path jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  with scopes as materialized (
    select value->>'kind' kind,value->>'ref' ref,ordinality depth
    from jsonb_array_elements(p_scope_path) with ordinality
  ),
  applicable as materialized (
    select a.*,s.depth
    from private.course_design_parameter_assignments a
    join scopes s on s.kind=a.scope_kind and s.ref=a.scope_ref
    where a.course_id=p_course_id
      -- The SRF estimates 100 scopes even for a five-level path. These
      -- equivalent filters make its actual keys available to the index,
      -- avoiding a full-course assignment scan for every study unit.
      and a.scope_kind=any(array(select kind from scopes))
      and a.scope_ref=any(array(select ref from scopes))
  ),
  target as(select * from scopes order by depth desc limit 1),
  applied as materialized(select parameter.value from target
    join private.course_entities unit on unit.course_id=p_course_id
      and target.kind='study_unit' and unit.entity_type='study_unit' and unit.entity_id=target.ref
    cross join lateral jsonb_array_elements(coalesce(unit.design_snapshot->'parameters','[]'::jsonb)) parameter(value))
  select coalesce(jsonb_agg(jsonb_build_object('parameterId',d.parameter_id,
    'localAssignment',case when l.parameter_id is null then null else jsonb_build_object('mode',l.mode,'value',l.value,'origin',l.origin,'reason',l.reason) end,
    'effectiveAssignment',case when e.parameter_id is null then jsonb_build_object('mode','automatic','value',null,'origin','system_default','reason','Escolha delegada ao contexto; ainda não aplicada.','sourceScope',null,'inherited',false)
      else jsonb_build_object('mode',e.mode,'value',e.value,'origin',e.origin,'reason',e.reason,'sourceScope',jsonb_build_object('kind',e.scope_kind,'ref',e.scope_ref),'inherited',e.scope_kind<>target.kind or e.scope_ref<>target.ref) end,
    'conflicts',coalesce((select jsonb_agg(jsonb_build_object('fixedScope',jsonb_build_object('kind',r.scope_kind,'ref',r.scope_ref),'fixedValue',r.value,'exceptionScope',jsonb_build_object('kind',x.scope_kind,'ref',x.scope_ref),'exceptionValue',x.value) order by r.depth,x.depth)
      from applicable r join applicable x on x.parameter_id=r.parameter_id and x.depth>r.depth
      where r.parameter_id=d.parameter_id and r.origin='research_condition' and x.origin in('author','research_condition','migration') and (x.mode<>'fixed' or x.value<>r.value)),'[]'::jsonb)
  ) order by d.ordinal),'[]'::jsonb)
  from private.course_design_parameter_definitions d cross join target
  left join lateral(select choice.* from (
      select a.parameter_id,a.mode,a.value,a.origin,a.reason,a.scope_kind,a.scope_ref,a.depth
      from applicable a where a.parameter_id=d.parameter_id
      union all
      select d.parameter_id,'automatic',p.value->'value',p.value->>'origin',p.value->>'reason',
        p.value->>'sourceScopeKind',p_course_id::text,(-1)::bigint
      from applied p where p.value->>'parameterId'=d.parameter_id
        and not('study_unit'=any(d.supported_scopes))
        and p.value->>'origin'='automatic' and p.value->>'sourceScopeKind'='course'
        and private.valid_course_design_parameter_value_v1(d.parameter_id,p.value->'value')
        and not exists(select 1 from applicable a where a.parameter_id=d.parameter_id)
    ) choice order by (choice.origin='research_condition') desc,(choice.mode='fixed') desc,choice.depth desc limit 1) e on true
  left join lateral(select * from applicable a where a.parameter_id=d.parameter_id and a.scope_kind=target.kind and a.scope_ref=target.ref) l on true
$function$;

-- CREATE OR REPLACE preserves the existing function owner and grants.
do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  manifest:=manifest||jsonb_build_object('schemaRevision','20261019232352');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;

commit;
