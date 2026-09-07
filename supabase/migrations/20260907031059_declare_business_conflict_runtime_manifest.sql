-- Announce the applied business-conflict contract without changing its writers.
begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

do $manifest$
declare
  v jsonb;
  v_features jsonb;
  v_oid oid := 'public.get_aralearn_runtime_manifest()'::regprocedure;
  v_metadata jsonb;
  v_after_metadata jsonb;
begin
  v:=public.get_aralearn_runtime_manifest();
  if v->>'schemaRevision' is distinct from '20260905163000'
    or v->>'contractVersion' is distinct from '1'
    or jsonb_typeof(v->'features') is distinct from 'array'
    or jsonb_array_length(v->'features')<>47
    or v->'features' ? 'course-business-conflicts-http-409-v1'
    or exists(select 1 from jsonb_array_elements(v->'features') feature
      where jsonb_typeof(feature)<>'string')
    or (select count(*)<>count(distinct feature)
      from jsonb_array_elements_text(v->'features') feature) then
    raise exception 'O manifesto anterior divergiu; nenhuma capacidade foi alterada.' using errcode='55000';
  end if;
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20260907013604')
    or not exists(select 1 from pg_proc
      where oid=to_regprocedure('public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)')
        and prosrc~$rx$\merrcode[[:space:]]*=[[:space:]]*'PT409'$rx$
        and prosrc!~$rx$\merrcode[[:space:]]*=[[:space:]]*'40001'$rx$) then
    raise exception 'O contrato PT409 precisa estar aplicado antes de anunciar a capacidade.' using errcode='55000';
  end if;
  select to_jsonb(p)-'prosrc' into v_metadata from pg_proc p where p.oid=v_oid;
  select jsonb_agg(to_jsonb(feature) order by feature collate "C") into v_features
    from jsonb_array_elements_text(v->'features'||'["course-business-conflicts-http-409-v1"]'::jsonb) feature;
  v:=jsonb_set(v,'{features}',v_features)||jsonb_build_object('schemaRevision','20260907031059');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(v::text)||'::jsonb');
  select to_jsonb(p)-'prosrc' into v_after_metadata from pg_proc p where p.oid=v_oid;
  if v_after_metadata is distinct from v_metadata then
    raise exception 'A declaração do manifesto alterou identidade ou metadados da função.' using errcode='55000';
  end if;
end $manifest$;
commit;
