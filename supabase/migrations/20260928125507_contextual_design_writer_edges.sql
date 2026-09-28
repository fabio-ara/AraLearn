-- O escritor preserva conjunto vazio como decisão explícita e distingue
-- calibração pendente de conflito de pesquisa sem expor texto arbitrário.
begin;
do $contextual_design_writer_edges$
declare definition text; old_fragment text; new_fragment text;
begin
  select replace(pg_get_functiondef(
    'public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)'::regprocedure),
    E'\r\n',E'\n') into definition;

  old_fragment:=$old$then (select jsonb_agg(v order by v#>>'{}') from jsonb_array_elements(choice->'value') v) else choice->'value' end$old$;
  new_fragment:=$new$then coalesce((select jsonb_agg(v order by v#>>'{}') from jsonb_array_elements(choice->'value') v),'[]'::jsonb) else choice->'value' end$new$;
  if position(old_fragment in definition)=0 then
    raise exception 'O escritor instrucional corrente divergiu na preservação de conjunto vazio.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);

  old_fragment:=$old$raise exception 'Uma escolha automática ainda precisa de calibração contextual.' using errcode='PD409';$old$;
  new_fragment:=$new$raise exception 'Uma escolha automática ainda precisa de calibração contextual.' using errcode='PD410';$new$;
  if position(old_fragment in definition)=0 then
    raise exception 'O escritor instrucional corrente divergiu no erro de calibração pendente.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);
  execute definition;
end $contextual_design_writer_edges$;
do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object(
    'schemaRevision','20260928125507',
    'features',(select jsonb_agg(value order by value collate "C")
      from jsonb_array_elements_text(
        (public.get_aralearn_runtime_manifest()->'features')||
        '["contextual-design-writer-edges-v1"]'::jsonb) feature(value));
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
