begin;

-- CAS de estrutura é conflito de negócio, preservando a distinção da falha
-- nativa de serialização usada pelo PostgreSQL e pelos envelopes existentes.
do $structure_conflicts$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.mutate_course_structure_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text)'::regprocedure,
    'public.reorder_course_study_units_for_actor_v1(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into definition;
    if regexp_count(definition,'errcode=''40001''')<>1 then
      raise exception 'Guarda de conflito estrutural não encontrada: %',signature;
    end if;
    execute replace(definition,'errcode=''40001''','errcode=''PT409''');
  end loop;
end $structure_conflicts$;

-- A correção autoral usa a composição comum. O NULL tipado seleciona essa
-- assinatura sem confundi-la com a edição manual da Explicação, cujo argumento
-- adicional é uma versão bigint. Direitos, CAS e recibo continuam no escritor.
do $correction_composition$
declare definition text; old_fragment text; new_fragment text;
begin
  select pg_get_functiondef('public.commit_course_observation_corrections_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text,text,jsonb)'::regprocedure) into definition;
  old_fragment:='p_source_attribution_applications,p_channel,p_application_origin,p_request_id,null);';
  new_fragment:='p_source_attribution_applications,p_channel,p_application_origin,p_request_id,null::jsonb);';
  if position(old_fragment in definition)=0 then raise exception 'Composição da correção corrente não encontrada.'; end if;
  execute replace(definition,old_fragment,new_fragment);
end $correction_composition$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260909072036');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
