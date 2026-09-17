begin;

-- O leitor canônico projeta null para microssequências anteriores ao plano de
-- explicação. Esse estado continua legível/editável sem inventar intenção nem
-- revisão; somente a escrita contextual decide se a ausência pode permanecer.
do $legacy_plan_shape$
declare
  v_definition text;
  v_before text:=$before$or not private.valid_course_explanation_plan_v1(microsequence.value->'explanationPlan')$before$;
begin
  v_definition:=replace(pg_get_functiondef(
    'private.valid_course_curricular_map_shape_v1(jsonb)'::regprocedure),E'\r\n',E'\n');
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 then
    raise exception 'Forma precursora do plano de explicação divergiu.' using errcode='55000';
  end if;
  v_definition:=replace(v_definition,v_before,$after$or (nullif(microsequence.value->'explanationPlan','null'::jsonb) is not null
          and not private.valid_course_explanation_plan_v1(microsequence.value->'explanationPlan'))$after$);
  execute v_definition;
end $legacy_plan_shape$;

do $legacy_plan_writer$
declare
  v_definition text;
  v_change record;
begin
  v_definition:=replace(pg_get_functiondef(
    'public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)'::regprocedure),E'\r\n',E'\n');
  for v_change in select * from (values
    ($before$  v_before:=private.current_course_curricular_map_v1(p_course_id);$before$,
     $after$  -- Após autorização, recibo, locks e CAS: a ausência só pode preservar
  -- uma micro já existente neste curso e que nunca recebeu esse campo.
  if exists(
    select 1 from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
    cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
    cross join lateral jsonb_array_elements(lesson.value->'microsequences') microsequence(value)
    where nullif(microsequence.value->'explanationPlan','null'::jsonb) is null
      and (p_approved or not exists(
        select 1 from private.course_entities existing
        where existing.course_id=p_course_id and existing.entity_type='microsequence'
          and existing.entity_id=microsequence.value->>'microsequenceId'
          and not(existing.content ? 'explanationPlan')
      ))
  ) then
    raise exception 'curricular_explanation_plan_required: Defina o plano de explicação para novas microssequências e antes de aprovar o mapa; um plano existente não pode ser removido.'
      using errcode='23514';
  end if;
  v_before:=private.current_course_curricular_map_v1(p_course_id);$after$),
    ($before$'scopeItemIds',microsequence.value->'scopeItemIds','explanationPlan',microsequence.value->'explanationPlan',$before$,
     $after$'scopeItemIds',microsequence.value->'scopeItemIds',$after$),
    ($before$),'checks','[]'::jsonb,'errors','[]'::jsonb
      )
    from jsonb_array_elements(p_curricular_map->'modules') module_value(value)$before$,
     $after$),'checks','[]'::jsonb,'errors','[]'::jsonb
      )||case when nullif(microsequence.value->'explanationPlan','null'::jsonb) is null
        then '{}'::jsonb else jsonb_build_object('explanationPlan',microsequence.value->'explanationPlan') end
    from jsonb_array_elements(p_curricular_map->'modules') module_value(value)$after$),
    ($before$'scopeItemIds',excluded.content->'scopeItemIds','explanationPlan',excluded.content->'explanationPlan',$before$,
     $after$'scopeItemIds',excluded.content->'scopeItemIds',$after$),
    ($before$'covers',excluded.content->'covers'
      ),version=course_entities.version+1,updated_at=now()$before$,
     $after$'covers',excluded.content->'covers'
      )||case when excluded.content ? 'explanationPlan'
        then jsonb_build_object('explanationPlan',excluded.content->'explanationPlan') else '{}'::jsonb end,
      version=course_entities.version+1,updated_at=now()$after$)
  ) as changes(before_text,after_text) loop
    if (length(v_definition)-length(replace(v_definition,v_change.before_text,'')))
        /length(v_change.before_text)<>1 then
      raise exception 'Writer precursor do plano de explicação divergiu: %',v_change.before_text using errcode='55000';
    end if;
    v_definition:=replace(v_definition,v_change.before_text,v_change.after_text);
  end loop;
  execute v_definition;
end $legacy_plan_writer$;

-- Nenhum dado, versão, vínculo, unidade ou estado de revisão é migrado. Grants,
-- recibos e proteções de remoção/reparenting continuam nos mesmos corpos SQL.
do $manifest$ declare manifest jsonb; begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260917105911');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
notify pgrst,'reload schema';
commit;
