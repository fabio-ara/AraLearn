-- Título/objetivo participam do mesmo CAS e recibo da composição corrente.
begin;
do $migration$
declare v_definition text; v_original text;
begin
  select replace(pg_get_functiondef('private.commit_course_composition_core_v1(uuid,uuid,bigint,jsonb,jsonb,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'p_request_id text)','p_request_id text, p_course_metadata jsonb DEFAULT NULL)');
  v_definition:=replace(v_definition,'  v_changed boolean;','  v_changed boolean; v_metadata_changed boolean:=false;');
  v_definition:=replace(v_definition,'  if p_expected_revision is null or p_expected_revision < 1',
    '  if p_course_metadata is not null and (
      jsonb_typeof(p_course_metadata) is distinct from ''object''
      or p_course_metadata-array[''title'',''objective'']<>''{}''::jsonb
      or not (p_course_metadata ?& array[''title'',''objective''])
      or jsonb_typeof(p_course_metadata->''title'') is distinct from ''string''
      or jsonb_typeof(p_course_metadata->''objective'') is distinct from ''string''
      or char_length(p_course_metadata->>''title'') not between 1 and 300
      or char_length(p_course_metadata->>''objective'') not between 1 and 2000
      or p_course_metadata->>''title''<>btrim(p_course_metadata->>''title'')
      or p_course_metadata->>''objective''<>btrim(p_course_metadata->>''objective'')
      or translate(p_course_metadata->>''title'',E''\n\r\t'','''')~''[[:cntrl:]]''
      or translate(p_course_metadata->>''objective'',E''\n\r\t'','''')~''[[:cntrl:]]''
      or (p_course_metadata->>''title'')!~''[^[:space:]]''
      or (p_course_metadata->>''objective'')!~''[^[:space:]]''
    ) then raise exception ''Metadados do curso inválidos.'' using errcode=''22023''; end if;
  if p_expected_revision is null or p_expected_revision < 1');
  v_definition:=replace(v_definition,'or jsonb_array_length(v_upserts) + jsonb_array_length(v_deletes) < 1',
    'or (p_course_metadata is null and jsonb_array_length(v_upserts) + jsonb_array_length(v_deletes) < 1)');
  v_definition:=replace(v_definition,'v_hash := encode(extensions.digest(convert_to(jsonb_build_object(',
    'v_hash := encode(extensions.digest(convert_to((jsonb_build_object(');
  v_definition:=replace(v_definition,E'    ''deletes'', v_deletes\n  )::text, ''UTF8''),',
    E'    ''deletes'', v_deletes\n  ) || case when p_course_metadata is null then ''{}''::jsonb else jsonb_build_object(''courseMetadata'',p_course_metadata) end)::text, ''UTF8''),');
  v_definition:=replace(v_definition,'  v_changed := v_created_count + v_updated_count + v_deleted_count > 0;',
    '  v_metadata_changed:=p_course_metadata is not null and row(v_course.title,v_course.goal)
      is distinct from row(p_course_metadata->>''title'',p_course_metadata->>''objective'');
  v_changed := v_metadata_changed or v_created_count + v_updated_count + v_deleted_count > 0;');
  v_definition:=replace(v_definition,'set revision = course.revision + 1, updated_at = now()',
    'set revision = course.revision + 1, updated_at = now(),
      title=case when p_course_metadata is null then course.title else p_course_metadata->>''title'' end,
      goal=case when p_course_metadata is null then course.goal else p_course_metadata->>''objective'' end');
  if position('jsonb_build_object(''courseMetadata'',p_course_metadata)' in v_definition)=0 then raise exception 'Hash de metadados ausente no core.'; end if;
  execute v_definition;

  select replace(pg_get_functiondef('public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'p_request_id text)','p_request_id text, p_course_metadata jsonb DEFAULT NULL)');
  v_definition:=replace(v_definition,E'    ''sourceAttributionApplications'',p_source_attribution_applications\n  ));',
    E'    ''sourceAttributionApplications'',p_source_attribution_applications\n  ) || case when p_course_metadata is null then ''{}''::jsonb else jsonb_build_object(''courseMetadata'',p_course_metadata) end);');
  v_definition:=replace(v_definition,'p_actor_id,p_course_id,p_expected_revision,p_upserts,p_deletes,p_request_id',
    'p_actor_id,p_course_id,p_expected_revision,p_upserts,p_deletes,p_request_id,p_course_metadata');
  -- Se metadados já avançaram a revisão no core, atribuição não a avança de novo.
  v_original:=v_definition;
  v_definition:=regexp_replace(v_definition,'if coalesce\(\(v_result->>''createdCount''\)::integer,0\).*?= 0 then',
    'if (v_result->>''revision'')::bigint=p_expected_revision then','s');
  if v_definition=v_original or position('jsonb_build_object(''courseMetadata'',p_course_metadata)' in v_definition)=0 then
    raise exception 'Composição não integrou metadados e proveniência.'; end if;
  execute v_definition;

  select replace(pg_get_functiondef('public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'p_request_id text)','p_request_id text, p_course_metadata jsonb DEFAULT NULL)');
  v_definition:=replace(v_definition,'  if p_channel not in (''mcp'',''application'')',
    '  if p_course_metadata is not null and (p_expected_study_unit_version is not null or p_application_origin is not null) then
    raise exception ''Metadados não pertencem à edição focal de unidade.'' using errcode=''22023''; end if;
  if p_channel not in (''mcp'',''application'')');
  v_definition:=replace(v_definition,E'    p_source_attribution_applications,p_request_id\n  );',
    E'    p_source_attribution_applications,p_request_id,p_course_metadata\n  );');
  execute v_definition;

  -- Verificação de fonte permanece privada; Estudo recebe localização legível.
  select pg_get_functiondef('private.course_study_citations_payload_v1(uuid,text,bigint)'::regprocedure) into v_definition;
  v_original:=v_definition;
  v_definition:=regexp_replace(v_definition,',\s*''verificationExcerpt'',anchor_value.verification_excerpt','','g');
  if v_definition=v_original then raise exception 'Projeção de citação não encontrada.'; end if;
  execute v_definition;
end $migration$;

drop function public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text);
drop function public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text);
drop function private.commit_course_composition_core_v1(uuid,uuid,bigint,jsonb,jsonb,text);
revoke all on function private.commit_course_composition_core_v1(uuid,uuid,bigint,jsonb,jsonb,text,jsonb)
 from public,anon,authenticated,service_role;
revoke all on function public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text,jsonb),
 public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text,jsonb),
 public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text,jsonb) to service_role;

do $migration$
declare v_manifest jsonb;
begin
  v_manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905070507');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(v_manifest::text)||'::jsonb');
end $migration$;
commit;
