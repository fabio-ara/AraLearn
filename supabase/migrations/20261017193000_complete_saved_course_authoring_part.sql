begin;
set local lock_timeout='5s';
set local statement_timeout='5min';

-- A conclusão reutiliza o conjunto que já está persistido na Parte. O wrapper
-- público aceita lista vazia somente quando p_complete=true; o núcleo aceita o
-- mesmo conjunto porque os chamadores parciais continuam obrigados à faixa
-- não vazia. O helper incremental ainda monta e valida o acumulado sob lock.
do $complete_saved_part$
declare
  definition text;
  before_fragment text;
  after_fragment text;
  fragment_count integer;
begin
  select replace(
    pg_get_functiondef('private.materialize_course_authoring_part_core_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure),
    E'\r\n',E'\n'
  ) into definition;
  before_fragment:='jsonb_array_length(p_units) not between 1 and 64';
  after_fragment:='jsonb_array_length(p_units)>64';
  fragment_count:=(length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment);
  if fragment_count<>1 then
    raise exception 'Limite do conjunto materializado divergiu: % ocorrência(s).',fragment_count;
  end if;
  definition:=replace(definition,before_fragment,after_fragment);
  execute definition;

  select replace(
    pg_get_functiondef('public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb,boolean)'::regprocedure),
    E'\r\n',E'\n'
  ) into definition;
  before_fragment:='jsonb_array_length(p_units) not between 1 and 64';
  after_fragment:='(not p_complete and jsonb_array_length(p_units)<1) or jsonb_array_length(p_units)>64';
  fragment_count:=(length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment);
  if fragment_count<>1 then
    raise exception 'Limite do lote materializado divergiu: % ocorrência(s).',fragment_count;
  end if;
  definition:=replace(definition,before_fragment,after_fragment);
  execute definition;
end $complete_saved_part$;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261017193000' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261017193000');
    execute format(
      'create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb'
    );
  end if;
end $manifest$;

notify pgrst,'reload schema';
commit;
