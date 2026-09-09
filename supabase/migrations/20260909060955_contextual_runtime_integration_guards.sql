begin;

-- Feedback usa os recursos registrados para esse slot, incluindo parágrafos.
create or replace function private.course_content_complete_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $function$
declare saved jsonb; instances jsonb;
begin
  select e.content into saved from private.course_entities e where e.course_id=p_course_id and e.entity_id=p_target_id
    and e.entity_type=case p_target_kind when 'microsequence_explanation' then 'microsequence' when 'study_unit' then 'study_unit' end;
  if not found then return false; end if;
  if p_target_kind='microsequence_explanation' then
    return coalesce(private.valid_course_explanation_v1(saved->'explanation'),false);
  end if;
  if saved-array['title','role','content','response','feedback','topics']<>'{}'::jsonb
    or not(saved ?& array['title','role','content','response','feedback','topics'])
    or jsonb_typeof(saved->'role') is distinct from 'string'
    or saved->>'role' not in('theory','practice')
    or jsonb_typeof(saved->'content') is distinct from 'array'
    or jsonb_typeof(saved->'feedback') is distinct from 'array'
    or jsonb_typeof(saved->'topics') is distinct from 'array' then return false; end if;
  if saved->>'role'='theory' and (jsonb_array_length(saved->'content')=0 or saved->'response'<>'null'::jsonb)
    or saved->>'role'='practice' and jsonb_typeof(saved->'response') is distinct from 'object'
    or exists(select 1 from jsonb_array_elements(saved->'topics') t
      where jsonb_typeof(t)<>'string' or nullif(btrim(t#>>'{}'),'') is null)
    or (select count(*)<>count(distinct t) from jsonb_array_elements(saved->'topics') t) then return false; end if;
  -- O escritor vigente valida slots e dados pelo registry de packages. O gate
  -- de leitura verifica completude estrutural e referências pelo catálogo SQL
  -- corrente, sem depender dos validadores da antiga auditoria removida.
  instances:=(saved->'content')||(saved->'feedback')||case when jsonb_typeof(saved->'response')='object'
    then jsonb_build_array(saved->'response') else '[]'::jsonb end;
  return coalesce(jsonb_typeof(saved->'title')='string' and char_length(btrim(saved->>'title')) between 1 and 300
    and private.valid_course_component_refs_in_content_v1(saved)
    and not exists(select 1 from jsonb_array_elements(instances) b
      where jsonb_typeof(b) is distinct from 'object' or not(b ?& array['id','package','version','data'])
        or b-array['id','package','version','data']<>'{}'::jsonb
        or jsonb_typeof(b->'data') is distinct from 'object'
        or jsonb_typeof(b->'id') is distinct from 'string' or nullif(btrim(b->>'id'),'') is null)
    and not exists(select 1 from jsonb_array_elements(saved->'content') b where b->>'package' not like 'aralearn.resource.%')
    and not exists(select 1 from jsonb_array_elements(saved->'feedback') b where b->>'package' not like 'aralearn.resource.%')
    and (saved->'response'='null'::jsonb or saved#>>'{response,package}' like 'aralearn.response.%')
    and (select count(*)=count(distinct b->>'id') from jsonb_array_elements(instances) b),false);
end
$function$;

-- Conflito de versão é conflito de negócio HTTP409. A captura da falha
-- nativa de serialização e seu envelope permanecem no gateway existente.
do $business_conflicts$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.approve_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,text,text,text)'::regprocedure,
    'public.save_authoring_process_preferences_for_actor_v1(uuid,bigint,jsonb,text)'::regprocedure,
    'public.commit_course_observation_corrections_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text,text,jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into definition;
    if regexp_count(definition,'errcode=''40001''')<>1 then
      raise exception 'Guarda de conflito de negócio não encontrada: %',signature;
    end if;
    execute replace(definition,'errcode=''40001''','errcode=''PT409''');
  end loop;
end $business_conflicts$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260909060955');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
