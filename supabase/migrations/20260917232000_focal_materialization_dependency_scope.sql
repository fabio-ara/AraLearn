begin;

-- Em produção parcial, a parte continua sendo o contêiner operacional da
-- escrita, mas não se torna automaticamente o alcance pedagógico da validação.
-- Unidades preservadas só entram no conjunto focal quando pertencem a uma
-- microssequência efetivamente tocada pelo lote. A conclusão explícita conserva
-- a validação acumulada da parte inteira.
do $focal_validation_scope$
declare
  definition text;
  before_fragment text:=$before$  perform private.assert_course_application_pedagogy_v1(p_course_id,all_units,p_complete);$before$;
  after_fragment text:=$after$  perform private.assert_course_application_pedagogy_v1(
    p_course_id,
    case when p_complete then all_units else coalesce((
      select jsonb_agg(candidate.value order by
        candidate.value->>'didacticMicrosequenceId',
        (candidate.value->>'position')::integer)
      from jsonb_array_elements(all_units) candidate(value)
      where exists(
        select 1
        from jsonb_array_elements(p_units) incoming(value)
        where incoming.value->>'didacticMicrosequenceId'
          =candidate.value->>'didacticMicrosequenceId'
      )
    ),'[]'::jsonb) end,
    p_complete
  );$after$;
begin
  definition:=replace(pg_get_functiondef(
    'private.prepare_incremental_course_part_v1(uuid,uuid,jsonb,jsonb,boolean,jsonb)'::regprocedure
  ),E'\r\n',E'\n');
  if (length(definition)-length(replace(definition,before_fragment,'')))
      /length(before_fragment)<>1 then
    raise exception 'Validação incremental precursora divergiu.' using errcode='55000';
  end if;
  execute replace(definition,before_fragment,after_fragment);
end $focal_validation_scope$;

do $manifest$ declare manifest jsonb; begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260917232000');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
notify pgrst,'reload schema';
commit;
