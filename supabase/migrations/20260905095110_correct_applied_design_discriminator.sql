-- O operador -> é agrupado antes da concatenação, preservando o discriminador
-- tanto no valor salvo quanto na comparação que evita uma aplicação repetida.
begin;
set local lock_timeout='5s';
set local statement_timeout='5min';
do $correct$
declare definition text; old_fragment text:=$before$) || unit.value->'designApplication',$before$;
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' is distinct from '20260905094109' then
    raise exception 'A revisão anterior do runtime divergiu.' using errcode='55000';
  end if;
  definition:=pg_get_functiondef('private.materialize_course_authoring_part_core_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure);
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>2 then
    raise exception 'As duas concatenações esperadas não foram encontradas.' using errcode='55000';
  end if;
  definition:=replace(definition,old_fragment,$after$) || (unit.value->'designApplication'),$after$);
  execute definition;
end $correct$;
do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905095110');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
