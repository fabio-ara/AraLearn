begin;

-- O registro de unidades existentes descreve aplicações realizadas, inclusive
-- quando a prática planejada ainda está incompleta. A materialização continua
-- exigindo a cobertura completa. Ambos preservam as mesmas guardas de
-- identidade, forma, ordem, operação invariável e componentes.
do $recorded_practice_integrity$
declare definition text; old_fragment text; new_fragment text;
begin
  select replace(pg_get_functiondef('private.assert_course_materialization_pedagogy_v1(uuid,jsonb)'::regprocedure),E'\r\n',E'\n') into definition;
  old_fragment:='FUNCTION private.assert_course_materialization_pedagogy_v1(p_course_id uuid, p_units jsonb)';
  new_fragment:='FUNCTION private.assert_course_application_pedagogy_v1(p_course_id uuid, p_units jsonb, p_require_complete_practice boolean)';
  if position(old_fragment in definition)=0 then
    raise exception 'A assinatura corrente divergiu na validação das aplicações.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$begin
  if jsonb_typeof(p_units)$old$;
  new_fragment:=$new$begin
  if p_require_complete_practice is null then
    raise exception 'O alcance da validação de prática precisa ser explícito.' using errcode='22023';
  end if;
  if jsonb_typeof(p_units)$new$;
  if position(old_fragment in definition)=0 then
    raise exception 'A entrada corrente divergiu na validação das aplicações.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);

  old_fragment:=$old$  if exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id$old$;
  new_fragment:=$new$  if (p_require_complete_practice and exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id$new$;
  if position(old_fragment in definition)=0 then
    raise exception 'A validação corrente divergiu na cobertura dos requisitos de prática.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$or count(distinct practice.opportunity_id)<max(practice.minimum_count)
  ) or exists($old$;
  new_fragment:=$new$or count(distinct practice.opportunity_id)<max(practice.minimum_count)
  )) or exists($new$;
  if position(old_fragment in definition)=0 then
    raise exception 'A validação corrente divergiu na quantidade de oportunidades de prática.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);

  old_fragment:=$old$  ) or exists(
    with practices as materialized(
      select unit.value->>'didacticMicrosequenceId' as microsequence_id,$old$;
  new_fragment:=$new$  ) or (p_require_complete_practice and exists(
    with practices as materialized(
      select unit.value->>'didacticMicrosequenceId' as microsequence_id,$new$;
  if position(old_fragment in definition)=0 then
    raise exception 'A validação corrente divergiu na cobertura das dimensões de prática.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$and practice.dimensions ? requirement.dimension
    )
  ) then$old$;
  new_fragment:=$new$and practice.dimensions ? requirement.dimension
    )
  )) then$new$;
  if position(old_fragment in definition)=0 then
    raise exception 'A validação corrente divergiu no fechamento das dimensões de prática.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);
  execute definition;

  select replace(pg_get_functiondef('public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)'::regprocedure),E'\r\n',E'\n') into definition;
  old_fragment:='perform private.assert_course_materialization_pedagogy_v1(p_course_id,all_units);';
  new_fragment:='perform private.assert_course_application_pedagogy_v1(p_course_id,all_units,false);';
  if position(old_fragment in definition)=0 then
    raise exception 'O escritor corrente divergiu na validação das aplicações existentes.';
  end if;
  execute replace(definition,old_fragment,new_fragment);
end $recorded_practice_integrity$;

-- Os chamadores de materialização conservam a assinatura e a exigência de
-- completude. O modo de registro é interno, sem parâmetro novo nos canais.
create or replace function private.assert_course_materialization_pedagogy_v1(p_course_id uuid,p_units jsonb)
returns void language sql stable set search_path=pg_catalog,private
as $function$
  select private.assert_course_application_pedagogy_v1(p_course_id,p_units,true);
$function$;
revoke all on function private.assert_course_application_pedagogy_v1(uuid,jsonb,boolean)
  from public,anon,authenticated,service_role;
revoke all on function private.assert_course_materialization_pedagogy_v1(uuid,jsonb)
  from public,anon,authenticated,service_role;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260910054749');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
