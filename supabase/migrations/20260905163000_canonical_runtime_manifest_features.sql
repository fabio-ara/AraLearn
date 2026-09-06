-- Mantém o mesmo conjunto de capacidades em ordem independente da collation.
begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

do $manifest$
declare v jsonb; v_features jsonb;
begin
  v:=public.get_aralearn_runtime_manifest();
  if v->>'schemaRevision' is distinct from '20260905162000'
    or v->>'contractVersion' is distinct from '1'
    or jsonb_typeof(v->'features') is distinct from 'array'
    or jsonb_array_length(v->'features')<>47
    or exists(select 1 from jsonb_array_elements(v->'features') feature
      where jsonb_typeof(feature)<>'string')
    or (select count(*)<>count(distinct feature)
      from jsonb_array_elements_text(v->'features') feature) then
    raise exception 'O manifesto anterior divergiu; nenhuma capacidade foi alterada.' using errcode='55000';
  end if;
  select jsonb_agg(to_jsonb(feature) order by feature collate "C")
    into v_features from jsonb_array_elements_text(v->'features') feature;
  v:=jsonb_set(v,'{features}',v_features)
    ||jsonb_build_object('schemaRevision','20260905163000');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(v::text)||'::jsonb');
end $manifest$;
commit;
