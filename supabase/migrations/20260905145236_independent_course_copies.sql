-- Cópias independentes autorizadas; arquivos imutáveis compartilhados somente
-- pelas referências copiadas, sem catálogo global ou descoberta por hash.
begin;
set local lock_timeout='5s';
set local statement_timeout='5min';
do $preflight$ begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision'<>'20260905125617'
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='course_access' and column_name='can_copy') then
    raise exception 'Estado anterior à cópia independente inesperado.' using errcode='55000';
  end if;
end $preflight$;

alter table public.course_access add column can_copy boolean not null default false;
alter table private.course_media add column storage_path text;
update private.course_media set storage_path=private.course_audio_object_path_v1(course_id,content_hash,media_type);
alter table private.course_media alter column storage_path set not null;
alter table private.course_media add constraint course_media_storage_path_v1 check(
  storage_path~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.](wav|mp3)$'
  and split_part(storage_path,'/',2)=content_hash||case media_type when 'audio/wav' then '.wav' else '.mp3' end);
create index course_media_active_storage_path_v1 on private.course_media(storage_path) where status='active';
alter table private.course_media_upload_intents add column storage_path text;
update private.course_media_upload_intents set storage_path=private.course_audio_object_path_v1(course_id,content_hash,media_type);
alter table private.course_media_upload_intents alter column storage_path set not null;
alter table private.course_media_delete_intents add column storage_path text;
update private.course_media_delete_intents set storage_path=private.course_audio_object_path_v1(course_id,content_hash,media_type);
alter table private.course_media_delete_intents alter column storage_path set not null;
create index course_media_delete_path_v1 on private.course_media_delete_intents(storage_path);
create index course_media_upload_path_v1 on private.course_media_upload_intents(storage_path);
alter table private.course_media_upload_intents add constraint course_media_upload_storage_path_v1 check(
  storage_path~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.](wav|mp3)$'
  and split_part(storage_path,'/',2)=content_hash||case media_type when 'audio/wav' then '.wav' else '.mp3' end);
alter table private.course_media_delete_intents add constraint course_media_delete_storage_path_v1 check(
  storage_path~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.](wav|mp3)$'
  and split_part(storage_path,'/',2)=content_hash||case media_type when 'audio/wav' then '.wav' else '.mp3' end);

create function private.can_copy_course_v1(p_course_id uuid,p_actor_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,private,public as $f$
 select p_actor_id is not null and exists(select 1 from public.person_profiles p where p.user_id=p_actor_id)
   and exists(select 1 from public.courses c where c.id=p_course_id and (c.owner_id=p_actor_id or exists(
     select 1 from public.course_access a where a.course_id=c.id and a.user_id=p_actor_id and a.can_copy)))
$f$;
revoke all on function private.can_copy_course_v1(uuid,uuid) from public,anon,authenticated,service_role;

do $read_projection$ declare v text; begin
  select pg_get_functiondef('private.course_list_projection_v2(uuid,uuid)'::regprocedure) into v;
  if position('''canEdit'',c.owner_id=p_actor_id and p_actor_id is not null,' in v)=0 then raise exception 'Projeção da lista não reconhecida.'; end if;
  v:=replace(v,'''canEdit'',c.owner_id=p_actor_id and p_actor_id is not null,',
    '''canEdit'',c.owner_id=p_actor_id and p_actor_id is not null,''canCopy'',private.can_copy_course_v1(c.id,p_actor_id),');
  execute v;
  select pg_get_functiondef('private.get_course_for_actor_v1(uuid,uuid,boolean)'::regprocedure) into v;
  if position('''canEdit'',v_ownership=''owned'',' in v)=0 then raise exception 'Projeção do curso não reconhecida.'; end if;
  execute replace(v,'''canEdit'',v_ownership=''owned'',',
    '''canEdit'',v_ownership=''owned'',''canCopy'',private.can_copy_course_v1(p_course_id,p_actor_id),');
end $read_projection$;

create function public.manage_course_access_for_actor_v3(p_actor_id uuid,p_course_id uuid,p_operation text,
 p_target_handle text,p_target_user_id uuid,p_confirmed boolean,p_request_id text,p_can_copy boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $f$
declare v_handle text; v_hash text; v_receipt private.course_change_receipts%rowtype;
 v_profile public.person_profiles%rowtype; v_changed boolean:=false; v_result jsonb; v_owner uuid; v_copy boolean; v_account uuid;
begin
  perform private.require_service_role();
  if p_operation is null or p_operation not in ('grant_access','revoke_access') or p_target_user_id is null
    or p_confirmed is distinct from true or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or p_operation='grant_access' and p_can_copy is null or p_operation='revoke_access' and p_can_copy is not null then
    raise exception 'Alteração de acesso inválida.' using errcode='22023'; end if;
  for v_account in select distinct x from unnest(array[p_actor_id,p_target_user_id]) x where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtextextended('account-delete:'||v_account::text,0));
  end loop;
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_operation='grant_access' then v_handle:=private.normalize_person_handle_v1(p_target_handle);
  elsif p_target_handle is not null then v_handle:=private.normalize_person_handle_v1(p_target_handle); end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('contract','course-access.v3','courseId',p_course_id,
    'operation',p_operation,'targetUserId',p_target_user_id,'targetHandle',v_handle,'canCopy',p_can_copy));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>p_operation or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'requestId reutilizado com comando incompatível.' using errcode='23514'; end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  if p_operation='grant_access' and not private.consume_course_people_rate_v1(p_actor_id,false) then
    return jsonb_build_object('contract','aralearn.course-access-change.v3','courseId',p_course_id,
      'operation',p_operation,'changed',false,'person',null,'idempotent',false,'rateLimited',true);
  end if;
  select * into v_profile from public.person_profiles where user_id=p_target_user_id for share;
  if not found or (p_operation='grant_access' and v_profile.handle is distinct from v_handle) then
    raise exception 'Pessoa selecionada mudou; refaça a busca.' using errcode='40001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('course-access:'||p_course_id::text||':'||p_target_user_id::text,0));
  select owner_id into strict v_owner from public.courses where id=p_course_id for share;
  if p_target_user_id=v_owner then
    if p_operation='revoke_access' then raise exception 'O proprietário mantém acesso.' using errcode='23514'; end if;
    v_copy:=true;
  elsif p_operation='grant_access' then
    insert into public.course_access(course_id,user_id,granted_by,can_copy) values(p_course_id,p_target_user_id,p_actor_id,p_can_copy)
      on conflict(course_id,user_id) do update set can_copy=excluded.can_copy
      where course_access.can_copy is distinct from excluded.can_copy;
    v_changed:=found; v_copy:=p_can_copy;
  else
    delete from public.course_access where course_id=p_course_id and user_id=p_target_user_id; v_changed:=found; v_copy:=false;
  end if;
  v_result:=jsonb_build_object('contract','aralearn.course-access-change.v3','courseId',p_course_id,'operation',p_operation,
    'changed',v_changed,'person',jsonb_build_object('userId',v_profile.user_id,'handle',v_profile.handle,
      'avatarObjectKey',v_profile.avatar_object_key,'canCopy',v_copy),'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,p_operation,p_course_id,v_hash,v_result);
  return v_result;
end $f$;
revoke all on function public.manage_course_access_for_actor_v3(uuid,uuid,text,text,uuid,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_course_access_for_actor_v3(uuid,uuid,text,text,uuid,boolean,text,boolean) to service_role;

do $list_access$ declare v text; begin
  select pg_get_functiondef('public.list_course_access_for_actor_v2(uuid,uuid)'::regprocedure) into v;
  v:=replace(v,'list_course_access_for_actor_v2','list_course_access_for_actor_v3');
  v:=replace(v,'aralearn.course-people.v2','aralearn.course-people.v3');
  v:=replace(v,'''avatarObjectKey'', profile.avatar_object_key'||E'\n  ) into v_owner',
    '''avatarObjectKey'', profile.avatar_object_key,''canCopy'',true'||E'\n  ) into v_owner');
  v:=replace(v,'''grantedAt'', access_value.granted_at','''grantedAt'', access_value.granted_at,''canCopy'',access_value.can_copy');
  if position('''canCopy'',true' in v)=0 then raise exception 'Projeção de Pessoas não reconhecida.'; end if;
  execute v;
end $list_access$;
revoke all on function public.list_course_access_for_actor_v3(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_course_access_for_actor_v3(uuid,uuid) to service_role;
drop function public.list_course_access_for_actor_v2(uuid,uuid);
drop function public.manage_course_access_for_actor_v2(uuid,uuid,text,text,uuid,boolean,text);

do $receipt_operation$ declare v_check text; begin
  select pg_get_expr(conbin,conrelid) into strict v_check from pg_constraint
    where conrelid='private.course_change_receipts'::regclass and conname='course_change_receipts_operation_v14';
  alter table private.course_change_receipts drop constraint course_change_receipts_operation_v14;
  execute format('alter table private.course_change_receipts add constraint course_change_receipts_operation_v15 check((%s) or operation=''copy_course'')',v_check);
end $receipt_operation$;
-- Only copy receipts cover the accepted five-minute future clock tolerance;
-- after their expiry the original request window is already closed.
alter table private.course_change_receipts drop constraint course_change_receipts_expiry_v1;
alter table private.course_change_receipts add constraint course_change_receipts_expiry_v2 check(
  expires_at>created_at and (expires_at<=created_at+interval '14 days'
    or operation='copy_course' and expires_at<=created_at+interval '14 days 5 minutes'));
create unique index courses_copy_request_identity_v1 on public.courses(owner_id,((copy_origin->>'requestId')))
  where copy_origin->>'contract'='aralearn.course-copy-origin.v1';

-- Typed identity translation only: no textual replacement inside authored text.
-- Unknown historical references remain historical; no new inventory is invented.
create function private.remap_copied_design_v1(p_value jsonb,p_items jsonb,p_application boolean) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $f$
declare v jsonb:=p_value; v_field text; v_values jsonb; v_item jsonb;
begin
  if v is null then return null; end if;
  foreach v_field in array (case when p_application then array['introducedInstructionalAnalysisUnitIds','usedInstructionalAnalysisUnitIds','curriculumScopeItemIds']
    else array['instructionalAnalysisUnitIds','evidenceRequirementIds'] end) loop
    if v ? v_field then
      select coalesce(jsonb_agg(coalesce(p_items->(e.value#>>'{}'),e.value) order by e.ordinal),'[]'::jsonb)
      into v_values from jsonb_array_elements(v->v_field) with ordinality e(value,ordinal);
      v:=jsonb_set(v,array[v_field],v_values);
    end if;
  end loop;
  if p_application then
    foreach v_field in array array['explanationApplications','practiceApplications'] loop
      if v ? v_field then
        v_values:='[]'::jsonb;
        for v_item in select value from jsonb_array_elements(v->v_field) loop
          if v_field='explanationApplications' and p_items ? (v_item->>'instructionalAnalysisUnitId') then
            v_item:=jsonb_set(v_item,'{instructionalAnalysisUnitId}',p_items->(v_item->>'instructionalAnalysisUnitId'));
          elsif v_field='practiceApplications' and p_items ? (v_item->>'evidenceRequirementId') then
            v_item:=jsonb_set(v_item,'{evidenceRequirementId}',p_items->(v_item->>'evidenceRequirementId'));
          end if;
          v_values:=v_values||jsonb_build_array(v_item);
        end loop;
        v:=jsonb_set(v,array[v_field],v_values);
      end if;
    end loop;
  end if;
  return v;
end $f$;
revoke all on function private.remap_copied_design_v1(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;

create function public.copy_course_for_actor_v1(p_actor_id uuid,p_source_course_id uuid,p_expected_source_revision bigint,
 p_title text,p_confirmed boolean,p_request_id text,p_requested_at timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,public,storage as $f$
declare v_source public.courses%rowtype; v_target public.courses%rowtype; v_receipt private.course_change_receipts%rowtype;
 v_hash text; v_result jsonb; v_owner uuid; v_account uuid; v_id uuid:=gen_random_uuid(); v_plan_id uuid:=gen_random_uuid();
 v_plan private.course_instructional_plans%rowtype; v_items jsonb; v_parts jsonb; v_attributions jsonb; v_object record;
 v_now timestamptz:=statement_timestamp(); v_epoch text;
begin
  perform private.require_service_role();
  if p_actor_id is null or p_source_course_id is null or p_expected_source_revision is null or p_expected_source_revision<1
    or p_confirmed is distinct from true or p_title is null or char_length(btrim(p_title)) not between 1 and 300 or p_title~'[[:cntrl:]]'
    or p_request_id is null or p_request_id!~'^copy:[0-9]{13}:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_requested_at is null then raise exception 'Pedido de cópia inválido.' using errcode='22023'; end if;
  v_epoch:=split_part(p_request_id,':',2);
  if extract(epoch from p_requested_at)*1000<>v_epoch::bigint or p_requested_at>v_now+interval '5 minutes' then
    raise exception 'O instante original da cópia é inválido; confira o relógio.' using errcode='22023'; end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('sourceCourseId',p_source_course_id,
    'expectedSourceRevision',p_expected_source_revision,'title',btrim(p_title),'requestedAt',v_epoch));
  select owner_id into v_owner from public.courses where id=p_source_course_id;
  for v_account in select distinct x from unnest(array[p_actor_id,v_owner]) x where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtextextended('account-delete:'||v_account::text,0));
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  if not exists(select 1 from public.person_profiles where user_id=p_actor_id) then
    raise exception 'Conta inexistente.' using errcode='PT404'; end if;
  select * into v_target from public.courses where owner_id=p_actor_id and copy_origin->>'contract'='aralearn.course-copy-origin.v1'
    and copy_origin->>'requestId'=p_request_id;
  if found then
    if v_target.copy_origin->>'creationHash'<>v_hash then raise exception 'O pedido de cópia foi reutilizado com outra intenção.' using errcode='23514'; end if;
    return jsonb_build_object('contract','aralearn.course-copy.v1','sourceCourseId',p_source_course_id,
      'sourceCourseRevision',p_expected_source_revision,'targetCourseId',v_target.id,'initialCourseRevision',1,
      'copiedAt',v_target.copy_origin->'copiedAt','requestId',p_request_id,'idempotent',true);
  end if;
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'copy_course' or v_receipt.request_hash<>v_hash then
      raise exception 'O pedido de cópia foi reutilizado com outra intenção.' using errcode='23514'; end if;
    raise exception 'A cópia confirmada foi excluída; uma nova cópia exige novo pedido.' using errcode='PT410';
  end if;
  if p_requested_at<=v_now-interval '14 days' then
    raise exception 'O pedido antigo não possui prova de conclusão; inicie uma nova cópia explicitamente.' using errcode='PT410'; end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_source_course_id::text,0));
  select * into v_source from public.courses where id=p_source_course_id for update;
  if not found or private.can_copy_course_v1(p_source_course_id,p_actor_id) is not true then
    raise exception 'Curso inexistente ou cópia não autorizada.' using errcode='PT404'; end if;
  if v_source.revision<>p_expected_source_revision then raise exception 'O curso mudou; releia antes de copiar.' using errcode='40001'; end if;
  select * into v_plan from private.course_instructional_plans where course_id=p_source_course_id;
  if not found then raise exception 'O mapa do curso não está disponível.' using errcode='23514'; end if;
  -- Deleting claims outlive their HTTP call and block new references until the
  -- Storage API finishes. Live uploads are excluded from the copied library.
  for v_object in select 'course-source-pdfs' bucket,storage_path,content_hash,byte_size,media_type
      from private.course_source_attachments where course_id=p_source_course_id and status='active'
    union select 'course-media',storage_path,content_hash,byte_size,media_type from private.course_media
      where course_id=p_source_course_id and status='active' order by bucket,storage_path loop
    perform pg_advisory_xact_lock(hashtextextended(case v_object.bucket when 'course-source-pdfs' then 'course-source-pdf-object:' else 'course-audio-object:' end||v_object.storage_path,0));
    if exists(select 1 from private.course_source_pdf_delete_intents where storage_path=v_object.storage_path)
      or exists(select 1 from private.course_media_delete_intents where storage_path=v_object.storage_path)
      or not exists(select 1 from storage.objects o where o.bucket_id=v_object.bucket and o.name=v_object.storage_path
        and o.metadata->>'size'=v_object.byte_size::text and o.metadata->>'mimetype'=v_object.media_type) then
      raise exception 'Um arquivo necessário não está disponível; conclua sua manutenção antes de copiar.' using errcode='40001';
    end if;
  end loop;
  select coalesce(jsonb_object_agg(id::text,to_jsonb(gen_random_uuid())),'{}'::jsonb) into v_items
    from private.course_instructional_plan_items where course_id=p_source_course_id;
  select coalesce(jsonb_object_agg(id::text,to_jsonb(gen_random_uuid())),'{}'::jsonb) into v_parts
    from private.course_authoring_parts where course_id=p_source_course_id;
  select coalesce(jsonb_object_agg(id::text,to_jsonb(gen_random_uuid())),'{}'::jsonb) into v_attributions
    from private.course_source_attributions where course_id=p_source_course_id;
  insert into public.courses(id,owner_id,title,goal,revision,visibility,public_file_access,bibliography_style,audio_config,copy_origin)
    values(v_id,p_actor_id,btrim(p_title),v_source.goal,1,'private','restricted',v_source.bibliography_style,v_source.audio_config,
      jsonb_build_object('contract','aralearn.course-copy-origin.v1','sourceCourseId',p_source_course_id,'sourceCourseRevision',p_expected_source_revision,
        'requestId',p_request_id,'requestedAt',p_requested_at,'creationHash',v_hash,'copiedAt',v_now));
  insert into private.course_instructional_plans(id,course_id,audience,instructional_scope,preferred_authoring_part_min,preferred_authoring_part_max,
      part_count_origin,version,created_at,updated_at,curriculum_map_status)
    values(v_plan_id,v_id,v_plan.audience,v_plan.instructional_scope,v_plan.preferred_authoring_part_min,v_plan.preferred_authoring_part_max,
      v_plan.part_count_origin,v_plan.version,v_plan.created_at,v_plan.updated_at,v_plan.curriculum_map_status);
  insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,version,created_at,updated_at,description)
    select (v_items->>id::text)::uuid,v_id,v_plan_id,item_kind,position,statement,version,created_at,updated_at,description
    from private.course_instructional_plan_items where course_id=p_source_course_id;
  insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,version,created_at,updated_at,
      design_snapshot,design_application,created_origin,last_revision_origin)
    select v_id,entity_type,entity_id,parent_type,parent_id,position,content,version,created_at,updated_at,
      private.remap_copied_design_v1(design_snapshot,v_items,false),private.remap_copied_design_v1(design_application,v_items,true),
      created_origin,last_revision_origin from private.course_entities where course_id=p_source_course_id;
  insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,version,created_at,updated_at,progression)
    select (v_parts->>id::text)::uuid,v_id,v_plan_id,position,title,intent,version,created_at,updated_at,progression
    from private.course_authoring_parts where course_id=p_source_course_id;
  insert into private.course_authoring_part_didactic_microsequences(course_id,authoring_part_id,didactic_microsequence_id,production_position,created_at)
    select v_id,(v_parts->>authoring_part_id::text)::uuid,didactic_microsequence_id,production_position,created_at
    from private.course_authoring_part_didactic_microsequences where course_id=p_source_course_id;
  insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind)
    select v_id,didactic_microsequence_id,(v_items->>plan_item_id::text)::uuid,plan_item_kind
    from private.course_design_target_plan_items where course_id=p_source_course_id;
  insert into private.course_design_parameter_assignments(course_id,parameter_id,scope_kind,scope_ref,value,origin,reason,updated_at,mode)
    select v_id,parameter_id,scope_kind,case when scope_kind='course' then v_id::text else scope_ref end,value,origin,reason,updated_at,mode
    from private.course_design_parameter_assignments where course_id=p_source_course_id;
  insert into private.course_authoring_guidance_assignments(course_id,scope_kind,scope_ref,guidance,origin,reason,updated_at)
    select v_id,scope_kind,case when scope_kind='course' then v_id::text else scope_ref end,guidance,origin,reason,updated_at
    from private.course_authoring_guidance_assignments where course_id=p_source_course_id;
  insert into private.course_component_policy_assignments(course_id,scope_kind,scope_ref,policy,origin,reason,updated_at)
    select v_id,scope_kind,case when scope_kind='course' then v_id::text else scope_ref end,policy,origin,reason,updated_at
    from private.course_component_policy_assignments where course_id=p_source_course_id;
  insert into private.course_sources(course_id,source_id,revision,status,kind,title,publication_date,identifier,language,citation_text,url,edition_or_version,
    origin,availability,verification_status,study_visibility,created_at,public_file_access,authors,default_roles,citation_mode,bibliographic)
    select v_id,source_id,revision,status,kind,title,publication_date,identifier,language,citation_text,url,edition_or_version,
    origin,availability,verification_status,study_visibility,created_at,'inherit',authors,default_roles,citation_mode,bibliographic
    from private.course_sources where course_id=p_source_course_id;
  insert into private.course_source_anchors(course_id,anchor_id,revision,source_id,source_revision,status,selector,verification_excerpt,created_at,human_locator,content_hash)
    select v_id,anchor_id,revision,source_id,source_revision,status,selector,verification_excerpt,created_at,human_locator,content_hash
    from private.course_source_anchors where course_id=p_source_course_id;
  insert into private.course_source_attachments(course_id,source_id,source_revision,content_hash,byte_size,media_type,storage_path,created_at,status,version,updated_at,
      removed_at,removed_course_revision,public_file_access)
    select v_id,source_id,source_revision,content_hash,byte_size,media_type,storage_path,created_at,status,version,updated_at,removed_at,removed_course_revision,'inherit'
    from private.course_source_attachments where course_id=p_source_course_id;
  insert into private.course_source_attributions(course_id,id,target_kind,target_id,target_version,target_hash,created_at)
    select v_id,(v_attributions->>id::text)::uuid,target_kind,case when target_kind='plan_item' then v_items->>target_id else target_id end,
      target_version,target_hash,created_at from private.course_source_attributions where course_id=p_source_course_id;
  insert into private.course_source_attribution_sources(course_id,attribution_id,source_ordinal,source_id,relation,link_id,roles,occurrences)
    select v_id,(v_attributions->>attribution_id::text)::uuid,source_ordinal,source_id,relation,link_id,roles,occurrences
    from private.course_source_attribution_sources where course_id=p_source_course_id;
  insert into private.course_source_attribution_anchors(course_id,attribution_id,source_ordinal,anchor_ordinal,source_id,anchor_id)
    select v_id,(v_attributions->>attribution_id::text)::uuid,source_ordinal,anchor_ordinal,source_id,anchor_id
    from private.course_source_attribution_anchors where course_id=p_source_course_id;
  insert into private.course_media(course_id,content_hash,byte_size,media_type,file_name,status,created_at,updated_at,storage_path)
    select v_id,content_hash,byte_size,media_type,file_name,status,created_at,updated_at,storage_path from private.course_media where course_id=p_source_course_id;
  v_result:=jsonb_build_object('contract','aralearn.course-copy.v1','sourceCourseId',p_source_course_id,'sourceCourseRevision',p_expected_source_revision,
    'targetCourseId',v_id,'initialCourseRevision',1,'copiedAt',v_now,'requestId',p_request_id,'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result,created_at,expires_at)
    values(p_actor_id,p_request_id,'copy_course',p_source_course_id,v_hash,v_result,v_now,greatest(v_now,p_requested_at)+interval '14 days');
  return v_result;
end $f$;
revoke all on function public.copy_course_for_actor_v1(uuid,uuid,bigint,text,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.copy_course_for_actor_v1(uuid,uuid,bigint,text,boolean,text,timestamptz) to service_role;

alter table private.course_media_delete_intents add column state text not null default 'pending' check(state in('pending','deleting'));

create function private.course_file_is_referenced_v1(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,private as $f$
 select case p_bucket when 'course-source-pdfs' then
   exists(select 1 from private.course_source_attachments where storage_path=p_path and status='active')
   or exists(select 1 from private.course_source_pdf_upload_intents where storage_path=p_path and expires_at>statement_timestamp())
 when 'course-media' then
   exists(select 1 from private.course_media where storage_path=p_path and status='active')
   or exists(select 1 from private.course_media_upload_intents where storage_path=p_path and expires_at>statement_timestamp())
 else false end
$f$;
revoke all on function private.course_file_is_referenced_v1(text,text) from public,anon,authenticated,service_role;

create function private.guard_shared_course_media_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,private as $f$
begin
  if tg_op='UPDATE' and row(new.course_id,new.content_hash,new.byte_size,new.media_type,new.created_at)
      is distinct from row(old.course_id,old.content_hash,old.byte_size,old.media_type,old.created_at) then
    raise exception 'A identidade lógica do áudio é imutável.' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.status='active' and new.storage_path<>old.storage_path then
    raise exception 'Retire o vínculo antes de substituir seu arquivo.' using errcode='23514'; end if;
  if new.status='active' then
    perform pg_advisory_xact_lock(hashtextextended('course-audio-object:'||new.storage_path,0));
    if exists(select 1 from private.course_media_delete_intents where storage_path=new.storage_path) then
      raise exception 'A remoção física deste áudio está em andamento.' using errcode='40001'; end if;
  end if;
  return new;
end $f$;
revoke all on function private.guard_shared_course_media_v1() from public,anon,authenticated,service_role;
create trigger guard_shared_course_media_v1 before insert or update on private.course_media
  for each row execute function private.guard_shared_course_media_v1();

create function private.guard_referenced_course_file_delete_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,private as $f$
begin
  if old.bucket_id not in('course-source-pdfs','course-media') then return old; end if;
  perform pg_advisory_xact_lock(hashtextextended(case old.bucket_id when 'course-source-pdfs'
    then 'course-source-pdf-object:' else 'course-audio-object:' end||old.name,0));
  if private.course_file_is_referenced_v1(old.bucket_id,old.name) then
    raise exception 'O arquivo ainda possui uma referência ou envio autorizado.' using errcode='23514'; end if;
  return old;
end $f$;
revoke all on function private.guard_referenced_course_file_delete_v1() from public,anon,authenticated,service_role;
create trigger guard_referenced_course_file_delete_v1 before delete on storage.objects
 for each row execute function private.guard_referenced_course_file_delete_v1();

create or replace function public.claim_course_media_delete_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_content_hash text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $f$
declare v_intent private.course_media_delete_intents%rowtype;
begin
  perform private.require_service_role();
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_actor_id::text,0));
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  insert into private.course_media_delete_intents(course_id,content_hash,media_type,storage_path)
    select i.course_id,i.content_hash,i.media_type,i.storage_path from private.course_media_upload_intents i
    where i.course_id=p_course_id and i.expires_at<=statement_timestamp()
      and not exists(select 1 from private.course_media m where m.course_id=i.course_id and m.content_hash=i.content_hash and m.status='active')
    on conflict do nothing;
  delete from private.course_media_upload_intents where course_id=p_course_id and expires_at<=statement_timestamp();
  loop
    select * into v_intent from private.course_media_delete_intents where course_id=p_course_id
      and (p_content_hash is null or content_hash=p_content_hash) order by content_hash limit 1 for update;
    if not found then return null; end if;
    perform pg_advisory_xact_lock(hashtextextended('course-audio-object:'||v_intent.storage_path,0));
    if private.course_file_is_referenced_v1('course-media',v_intent.storage_path) then
      delete from private.course_media_delete_intents where course_id=p_course_id and content_hash=v_intent.content_hash;
      continue;
    end if;
    update private.course_media_delete_intents set state='deleting' where course_id=p_course_id and content_hash=v_intent.content_hash;
    return jsonb_build_object('contentHash',v_intent.content_hash,'storagePath',v_intent.storage_path);
  end loop;
end $f$;

create function public.claim_pending_course_pdf_delete_for_actor_v1(p_actor_id uuid,p_course_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,public as $f$
declare v_request text; v_claim jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  loop
    select request_id into v_request from private.course_source_pdf_delete_intents
      where actor_id=p_actor_id and course_id=p_course_id order by created_at,request_id limit 1;
    if not found then return null; end if;
    v_claim:=public.claim_course_source_pdf_delete_for_actor_v1(p_actor_id,p_course_id,v_request);
    if v_claim is not null then return v_claim||jsonb_build_object('requestId',v_request); end if;
  end loop;
end $f$;
revoke all on function public.claim_pending_course_pdf_delete_for_actor_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_pending_course_pdf_delete_for_actor_v1(uuid,uuid) to service_role;

create or replace function public.maintain_course_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_operation text,p_confirmed boolean,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,storage as $f$
declare v_course public.courses%rowtype; v_changed boolean:=false; v_now timestamptz:=clock_timestamp(); v_files_changed boolean;
begin
  perform private.require_service_role();
  if p_actor_id is null or p_course_id is null or p_operation is null or p_operation not in('delete_owned_course','leave_shared_course')
    or p_confirmed is distinct from true or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Operação de ciclo de vida de Curso inválida.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_actor_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('course-lifecycle:'||p_course_id::text,0));
  select * into v_course from public.courses where id=p_course_id for update;
  if p_operation='delete_owned_course' then
    if found and v_course.owner_id<>p_actor_id then raise exception 'Somente o proprietário pode excluir este Curso.' using errcode='42501'; end if;
    if found then
      delete from private.course_source_pdf_upload_intents where course_id=p_course_id;
      delete from private.course_media_upload_intents where course_id=p_course_id;
      update private.course_source_attachments set status='removed',version=version+1,
        updated_at=greatest(v_now,updated_at+interval '1 microsecond'),removed_at=v_now,removed_course_revision=v_course.revision+1
        where course_id=p_course_id and status='active';
      v_files_changed:=found;
      update private.course_media set status='removed',updated_at=v_now where course_id=p_course_id and status='active';
      v_files_changed:=v_files_changed or found;
      if v_files_changed then update public.courses set revision=revision+1,updated_at=v_now where id=p_course_id; end if;
      insert into private.course_source_pdf_delete_intents(actor_id,request_id,course_id,source_id,content_hash,storage_path,state)
        select p_actor_id,'lifecycle:'||md5(o.name),p_course_id,'course-deletion',split_part(split_part(o.name,'/',2),'.',1),o.name,'pending'
        from storage.objects o where o.bucket_id='course-source-pdfs'
          and (split_part(o.name,'/',1)=p_course_id::text or exists(select 1 from private.course_source_attachments a where a.course_id=p_course_id and a.storage_path=o.name))
          and o.name~'^[0-9a-f-]{36}/[a-f0-9]{64}[.]pdf$'
          and not private.course_file_is_referenced_v1(o.bucket_id,o.name) on conflict do nothing;
      insert into private.course_media_delete_intents(course_id,content_hash,media_type,storage_path)
        select p_course_id,split_part(split_part(o.name,'/',2),'.',1),case when right(o.name,4)='.wav' then 'audio/wav' else 'audio/mpeg' end,o.name
        from storage.objects o where o.bucket_id='course-media'
          and (split_part(o.name,'/',1)=p_course_id::text or exists(select 1 from private.course_media m where m.course_id=p_course_id and m.storage_path=o.name))
          and o.name~'^[0-9a-f-]{36}/[a-f0-9]{64}[.](wav|mp3)$'
          and not private.course_file_is_referenced_v1(o.bucket_id,o.name) on conflict do nothing;
      if exists(select 1 from private.course_source_pdf_delete_intents where course_id=p_course_id)
        or exists(select 1 from private.course_media_delete_intents where course_id=p_course_id) then
        return jsonb_build_object('contract','aralearn.course-lifecycle-preparation.v1','courseId',p_course_id,
          'operation',p_operation,'requestId',p_request_id,'status','files_pending');
      end if;
      delete from public.courses where id=p_course_id and owner_id=p_actor_id; v_changed:=found;
    end if;
  else
    if found and v_course.owner_id=p_actor_id then raise exception 'O proprietário não pode sair do próprio Curso.' using errcode='42501'; end if;
    delete from public.course_access where course_id=p_course_id and user_id=p_actor_id; v_changed:=found;
  end if;
  return jsonb_build_object('contract','aralearn.course-lifecycle.v1','courseId',p_course_id,'operation',p_operation,
    'status',case when v_changed then 'completed' else 'already_absent' end,'changed',v_changed,'requestId',p_request_id);
end $f$;

do $account_deletion$ declare v text; begin
  select pg_get_functiondef('public.delete_my_account_v1(text)'::regprocedure) into v;
  v:=regexp_replace(v,'  if exists\(\s+select 1 from storage.objects object_value\s+join public.courses course.*?using errcode=''AR001'';\s+end if;',
    '  if exists(select 1 from public.courses where owner_id=v_user_id) then'||E'\n'||
    '    raise exception ''Conclua a exclusão dos cursos e arquivos antes de excluir a conta.'' using errcode=''AR001'';'||E'\n  end if;','s');
  if position('Conclua a exclusão dos cursos e arquivos' in v)=0 then raise exception 'Guarda de exclusão de conta não reconhecida.'; end if;
  execute v;
end $account_deletion$;

create function private.current_object_orphan_classification_v1(p_bucket text,p_path text) returns text
language sql stable security definer set search_path=pg_catalog,private,public,auth as $f$
 select case
  when p_bucket='person-avatars' and not exists(select 1 from auth.users where id::text=split_part(p_path,'/',1)) then 'avatar_owner_missing'
  when p_bucket='person-avatars' and not exists(select 1 from public.person_profiles
    where user_id::text=split_part(p_path,'/',1) and avatar_object_key=p_path) then 'avatar_profile_unlinked'
  when p_bucket in('course-source-pdfs','course-media') and private.course_file_is_referenced_v1(p_bucket,p_path) then null
  when p_bucket='course-source-pdfs' and not exists(select 1 from public.courses where id::text=split_part(p_path,'/',1)) then 'pdf_course_missing'
  when p_bucket='course-source-pdfs' then 'pdf_unlinked'
  when p_bucket='course-media' and not exists(select 1 from public.courses where id::text=split_part(p_path,'/',1)) then 'audio_course_missing'
  when p_bucket='course-media' then 'audio_unlinked'
  else null end
$f$;
revoke all on function private.current_object_orphan_classification_v1(text,text) from public,anon,authenticated,service_role;

create or replace function private.inventory_current_data_orphans_v1(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,private,public,storage as $f$
declare v_counts jsonb; v_items jsonb;
begin
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'Limite de inventário inválido.' using errcode='22023'; end if;
  with object_orphans as materialized(
    select bucket_id,name,private.current_object_orphan_classification_v1(bucket_id,name) classification
    from storage.objects where bucket_id in('person-avatars','course-source-pdfs','course-media')
  ), all_orphans as materialized(
    select * from object_orphans where classification is not null
    union select 'course-source-pdfs',a.storage_path,'pdf_object_missing' from private.course_source_attachments a
      where a.status='active' and not exists(select 1 from storage.objects where bucket_id='course-source-pdfs' and name=a.storage_path)
    union select 'course-media',m.storage_path,'audio_object_missing' from private.course_media m
      where m.status='active' and not exists(select 1 from storage.objects where bucket_id='course-media' and name=m.storage_path)
  ), counted as(select classification,count(*)::bigint item_count from all_orphans group by classification)
  select (select coalesce(jsonb_object_agg(classification,item_count),'{}'::jsonb) from counted),
    (select coalesce(jsonb_agg(jsonb_build_object('classification',classification,'bucketId',bucket_id,'objectPath',name)
      order by classification,bucket_id,name),'[]'::jsonb) from(
        select * from all_orphans order by classification,bucket_id,name limit p_limit) page)
  into v_counts,v_items;
  return jsonb_build_object('contract','aralearn.current-data-orphan-inventory.v1','generatedAt',statement_timestamp(),
    'counts',v_counts,'items',v_items,'legacyOAuth',jsonb_build_object(
      'expiredAuthorizations',(select count(*) from private.authoring_action_oauth_authorizations where expires_at<=statement_timestamp()),
      'expiredOrRevokedTokens',(select count(*) from private.authoring_action_oauth_tokens where expires_at<=statement_timestamp() or revoked_at is not null)));
end $f$;

create or replace function public.authorize_current_orphan_removal_for_actor_v1(p_actor_id uuid,p_classification text,p_object_path text,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public,storage as $f$
declare v_bucket text; v_classification text; v_course uuid; v_owner uuid; v_hash text;
begin
  perform private.require_aralearn_administrator_v1(p_actor_id);
  if p_confirmed is distinct from true or p_classification is null or p_classification not in(
    'avatar_owner_missing','avatar_profile_unlinked','pdf_course_missing','pdf_unlinked','audio_course_missing','audio_unlinked')
    or p_object_path is null or p_object_path<>btrim(p_object_path) or char_length(p_object_path) not between 3 and 500
    or p_object_path~'[[:cntrl:]]' then raise exception 'Remoção de resíduo inválida.' using errcode='22023'; end if;
  v_bucket:=case when p_classification like 'avatar_%' then 'person-avatars' when p_classification like 'pdf_%' then 'course-source-pdfs' else 'course-media' end;
  if v_bucket<>'person-avatars' then
    perform pg_advisory_xact_lock(hashtextextended(case v_bucket when 'course-source-pdfs' then 'course-source-pdf-object:' else 'course-audio-object:' end||p_object_path,0));
  end if;
  v_classification:=private.current_object_orphan_classification_v1(v_bucket,p_object_path);
  if v_classification is distinct from p_classification then raise exception 'O arquivo voltou a ter referência; atualize a manutenção.' using errcode='40001'; end if;
  if not exists(select 1 from storage.objects where bucket_id=v_bucket and name=p_object_path) then
    if not exists(select 1 from private.course_source_pdf_delete_intents where v_bucket='course-source-pdfs' and storage_path=p_object_path and state='deleting')
      and not exists(select 1 from private.course_media_delete_intents where v_bucket='course-media' and storage_path=p_object_path and state='deleting') then
      raise exception 'O objeto não está mais pendente de remoção.' using errcode='40001'; end if;
  elsif v_bucket<>'person-avatars' then
    select id,owner_id into v_course,v_owner from public.courses where id::text=split_part(p_object_path,'/',1);
    if v_course is not null and p_object_path~('^[0-9a-f-]{36}/[a-f0-9]{64}[.]'||case v_bucket when 'course-source-pdfs' then 'pdf' else '(wav|mp3)' end||'$') then
      v_hash:=split_part(split_part(p_object_path,'/',2),'.',1);
      if v_bucket='course-source-pdfs' then
        insert into private.course_source_pdf_delete_intents(actor_id,request_id,course_id,source_id,content_hash,storage_path,state)
          values(v_owner,'orphan:'||md5(p_object_path),v_course,'orphan-maintenance',v_hash,p_object_path,'deleting')
          on conflict(actor_id,request_id) do update set state='deleting',updated_at=statement_timestamp();
      else
        if exists(select 1 from private.course_media_delete_intents where course_id=v_course and content_hash=v_hash and storage_path<>p_object_path) then
          raise exception 'Conclua a outra remoção deste áudio antes de prosseguir.' using errcode='40001'; end if;
        insert into private.course_media_delete_intents(course_id,content_hash,media_type,storage_path,state)
          values(v_course,v_hash,case when right(p_object_path,4)='.wav' then 'audio/wav' else 'audio/mpeg' end,p_object_path,'deleting')
          on conflict(course_id,content_hash) do update set state='deleting';
      end if;
    end if;
  end if;
  return jsonb_build_object('contract','aralearn.current-maintenance-removal.v1','classification',v_classification,
    'bucketId',v_bucket,'objectPath',p_object_path,'authorized',true);
end $f$;

create function public.complete_current_orphan_removal_for_actor_v1(p_actor_id uuid,p_bucket_id text,p_object_path text) returns boolean
language plpgsql security definer set search_path=pg_catalog,private,storage as $f$
begin
  perform private.require_aralearn_administrator_v1(p_actor_id);
  if p_bucket_id is null or p_bucket_id not in('person-avatars','course-source-pdfs','course-media') or p_object_path is null then
    raise exception 'Conclusão de remoção inválida.' using errcode='22023'; end if;
  if exists(select 1 from storage.objects where bucket_id=p_bucket_id and name=p_object_path) then
    raise exception 'A remoção física ainda não foi confirmada.' using errcode='40001'; end if;
  if p_bucket_id='course-source-pdfs' then delete from private.course_source_pdf_delete_intents where storage_path=p_object_path and state='deleting';
  elsif p_bucket_id='course-media' then delete from private.course_media_delete_intents where storage_path=p_object_path and state='deleting'; end if;
  return true;
end $f$;
revoke all on function public.complete_current_orphan_removal_for_actor_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_current_orphan_removal_for_actor_v1(uuid,text,text) to service_role;

-- BEGIN AUDIO PATH FUNCTIONS
CREATE OR REPLACE FUNCTION public.prepare_course_audio_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_content_hash text, p_byte_size bigint, p_media_type text, p_file_name text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public', 'storage'
AS $function$
declare v_revision bigint; v_request_hash text; v_receipt private.course_change_receipts%rowtype;
 v_intent private.course_media_upload_intents%rowtype; v_path text; v_exists boolean; v_reserved bigint;
begin
  perform private.require_service_role();
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_actor_id::text,0));
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision<1 or p_content_hash is null or p_content_hash!~'^[a-f0-9]{64}$'
    or p_byte_size is null or p_byte_size not between 1 and 20971520 or p_media_type is null or p_media_type not in('audio/wav','audio/mpeg')
    or p_file_name is null or char_length(p_file_name) not between 1 and 180 or p_file_name<>btrim(p_file_name) or p_file_name~'[[:cntrl:]/\\]'
    or p_file_name in('.','..') or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Envio de áudio inválido.' using errcode='22023';
  end if;
  v_request_hash:=private.course_source_json_hash_v1(jsonb_build_object('courseId',p_course_id,'expectedRevision',p_expected_revision,
    'command',jsonb_build_object('type','ingest_audio','media',jsonb_build_object('contentHash',p_content_hash,'byteSize',p_byte_size,'mediaType',p_media_type),'fileName',p_file_name)));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id and expires_at>statement_timestamp();
  if found then
    if v_receipt.operation<>'course_media' or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_request_hash then
      raise exception 'requestId reutilizado para outra operação.' using errcode='23514'; end if;
    return jsonb_build_object('receipt',v_receipt.result||jsonb_build_object('idempotent',true),'storagePath',
      (select storage_path from private.course_media where course_id=p_course_id and content_hash=p_content_hash));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select revision into strict v_revision from public.courses where id=p_course_id for update;
  if v_revision<>p_expected_revision then raise exception 'O Curso mudou; atualize antes do envio.' using errcode='40001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('course-source-pdf-quota:'||p_course_id::text,0));
  v_path:=coalesce((select storage_path from private.course_media where course_id=p_course_id and content_hash=p_content_hash and status='active'),
    private.course_audio_object_path_v1(p_course_id,p_content_hash,p_media_type));
  perform pg_advisory_xact_lock(hashtextextended('course-audio-object:'||v_path,0));
  if exists(select 1 from private.course_media_delete_intents where storage_path=v_path or course_id=p_course_id and content_hash=p_content_hash) then
    raise exception 'A remoção deste áudio ainda está em andamento; tente novamente.' using errcode='40001'; end if;
  delete from private.course_media_upload_intents where expires_at<=statement_timestamp() and course_id=p_course_id;
  select * into v_intent from private.course_media_upload_intents where actor_id=p_actor_id and request_id=p_request_id;
  if found and (v_intent.request_hash<>v_request_hash or v_intent.course_id<>p_course_id) then
    raise exception 'requestId reutilizado para outro áudio.' using errcode='23514'; end if;
  if exists(select 1 from private.course_media_upload_intents where course_id=p_course_id and content_hash=p_content_hash
      and (actor_id<>p_actor_id or request_id<>p_request_id)) then
    raise exception 'Outro envio deste áudio está em andamento.' using errcode='40001'; end if;
  if exists(select 1 from private.course_media where course_id=p_course_id and content_hash=p_content_hash
      and (byte_size<>p_byte_size or media_type<>p_media_type)) then
    raise exception 'Identidade de áudio divergente.' using errcode='23514'; end if;
  select exists(select 1 from storage.objects where bucket_id='course-media' and name=v_path) into v_exists;
  if not v_exists and exists(select 1 from private.course_media where course_id=p_course_id and content_hash=p_content_hash and status='active') then
    raise exception 'O arquivo ativo está indisponível; retire o vínculo antes de enviar novamente.' using errcode='40001'; end if;
  if v_exists and not exists(select 1 from storage.objects where bucket_id='course-media' and name=v_path
      and metadata->>'size'=p_byte_size::text and metadata->>'mimetype'=p_media_type) then
    raise exception 'Objeto de áudio diverge do arquivo enviado.' using errcode='23514'; end if;
  v_reserved:=private.course_source_pdf_reserved_bytes_v1(p_course_id);
  if not v_exists and not exists(select 1 from private.course_media m where m.course_id=p_course_id and m.content_hash=p_content_hash and m.status='active')
     and not exists(select 1 from private.course_media_upload_intents where course_id=p_course_id and content_hash=p_content_hash)
     and v_reserved+p_byte_size>67108864 then
    raise exception 'A cota conjunta de 64 MiB de PDFs e áudio seria excedida.' using errcode='23514'; end if;
  insert into private.course_media_upload_intents(actor_id,course_id,request_id,request_hash,content_hash,byte_size,media_type,file_name,course_revision,expires_at,storage_path) values(p_actor_id,p_course_id,p_request_id,v_request_hash,p_content_hash,p_byte_size,p_media_type,p_file_name,
    v_revision,statement_timestamp()+interval '10 minutes',v_path)
    on conflict(actor_id,request_id) do update set expires_at=excluded.expires_at;
  return jsonb_build_object('receipt',null,'courseId',p_course_id,'courseRevision',v_revision,'requestId',p_request_id,
    'media',jsonb_build_object('contentHash',p_content_hash,'byteSize',p_byte_size,'mediaType',p_media_type),
    'storagePath',v_path,'uploadRequired',not v_exists);
end $function$;

CREATE OR REPLACE FUNCTION public.execute_course_media_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_command jsonb, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public', 'storage'
AS $function$
declare v_course public.courses%rowtype; v_media private.course_media%rowtype; v_intent private.course_media_upload_intents%rowtype;
 v_receipt private.course_change_receipts%rowtype; v_request_hash text; v_type text; v_changed boolean:=false; v_result jsonb; v_path text;
begin
  perform private.require_service_role();
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_actor_id::text,0));
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_type:=p_command->>'type';
  if p_expected_revision is null or p_expected_revision<1 or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or jsonb_typeof(p_command) is distinct from 'object' or v_type is null or v_type not in('ingest_audio','set_audio_config','remove_media') then
    raise exception 'Alteração de áudio inválida.' using errcode='22023'; end if;
  if v_type='set_audio_config' then
    if p_command-array['type','config']<>'{}'::jsonb or private.valid_course_audio_config_v1(p_command->'config') is not true then
      raise exception 'Configuração de áudio inválida.' using errcode='22023'; end if;
  elsif v_type='remove_media' then
    if p_command-array['type','contentHash']<>'{}'::jsonb or p_command->>'contentHash' is null or p_command->>'contentHash'!~'^[a-f0-9]{64}$' then
      raise exception 'Remoção de áudio inválida.' using errcode='22023'; end if;
  else
    if p_command-array['type','media','fileName']<>'{}'::jsonb or jsonb_typeof(p_command->'media') is distinct from 'object'
      or (p_command->'media')-array['contentHash','byteSize','mediaType']<>'{}'::jsonb
      or not(p_command->'media' ?& array['contentHash','byteSize','mediaType']) then
      raise exception 'Confirmação de ingestão inválida.' using errcode='22023'; end if;
  end if;
  v_request_hash:=private.course_source_json_hash_v1(jsonb_build_object('courseId',p_course_id,'expectedRevision',p_expected_revision,'command',p_command));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  delete from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id and expires_at<=statement_timestamp();
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'course_media' or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_request_hash then
      raise exception 'requestId reutilizado para outra operação.' using errcode='23514'; end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses where id=p_course_id for update;
  if v_course.revision<>p_expected_revision then raise exception 'O Curso mudou; atualize antes de alterar.' using errcode='40001'; end if;
  if v_type='set_audio_config' then
    v_changed:=v_course.audio_config is distinct from p_command->'config';
  else
    perform pg_advisory_xact_lock(hashtextextended('course-source-pdf-quota:'||p_course_id::text,0));
    v_path:=case when v_type='ingest_audio' then (select storage_path from private.course_media_upload_intents where actor_id=p_actor_id and request_id=p_request_id)
      else (select storage_path from private.course_media where course_id=p_course_id and content_hash=p_command->>'contentHash') end;
    if v_path is not null then perform pg_advisory_xact_lock(hashtextextended('course-audio-object:'||v_path,0)); end if;
    select * into v_media from private.course_media where course_id=p_course_id
      and content_hash=coalesce(p_command->>'contentHash',p_command#>>'{media,contentHash}');
    if v_type='remove_media' then
      if not found then raise exception 'Áudio inexistente.' using errcode='PT404'; end if;
      if v_media.status='active' then
        update private.course_media set status='removed',updated_at=statement_timestamp() where course_id=p_course_id and content_hash=v_media.content_hash returning * into v_media;
        insert into private.course_media_delete_intents(course_id,content_hash,media_type,storage_path) values(p_course_id,v_media.content_hash,v_media.media_type,v_media.storage_path) on conflict do nothing;
        v_changed:=true;
      end if;
    else
      select * into v_intent from private.course_media_upload_intents where actor_id=p_actor_id and request_id=p_request_id
        and course_id=p_course_id and request_hash=v_request_hash and expires_at>statement_timestamp();
      if not found then raise exception 'Preparação de áudio ausente ou expirada.' using errcode='23514'; end if;
      if exists(select 1 from private.course_media_delete_intents where storage_path=v_intent.storage_path or course_id=p_course_id and content_hash=v_intent.content_hash) then
        raise exception 'Remoção de áudio ainda pendente.' using errcode='40001'; end if;
      v_path:=v_intent.storage_path;
      if not exists(select 1 from storage.objects where bucket_id='course-media' and name=v_path
         and metadata->>'size'=v_intent.byte_size::text and metadata->>'mimetype'=v_intent.media_type) then
        raise exception 'Objeto de áudio não confirmado.' using errcode='23514'; end if;
      v_changed:=v_media.content_hash is null or v_media.status<>'active';
      if v_changed then
      insert into private.course_media(course_id,content_hash,byte_size,media_type,file_name,storage_path)
        values(p_course_id,v_intent.content_hash,v_intent.byte_size,v_intent.media_type,v_intent.file_name,v_path)
        on conflict(course_id,content_hash) do update set status='active',storage_path=excluded.storage_path,file_name=excluded.file_name,updated_at=statement_timestamp()
        returning * into v_media;
      end if;
      delete from private.course_media_upload_intents where actor_id=p_actor_id and request_id=p_request_id;
    end if;
  end if;
  if v_changed then
    update public.courses set revision=revision+1,updated_at=statement_timestamp(),
      audio_config=case when v_type='set_audio_config' then p_command->'config' else audio_config end
      where id=p_course_id returning * into v_course;
  end if;
  v_result:=jsonb_build_object('contract',case when v_type='ingest_audio' then 'aralearn.course-media-ingestion.v1' else 'aralearn.course-media-change.v1' end,
    'courseId',p_course_id,'courseRevision',v_course.revision,'requestId',p_request_id,'idempotent',false,'changed',v_changed,'operation',v_type,
    'media',case when v_type='set_audio_config' then null else private.course_media_reference_v1(v_media) end,
    'fileName',case when v_type='set_audio_config' then null else v_media.file_name end);
  insert into private.course_change_receipts(actor_id,request_id,course_id,operation,request_hash,result)
    values(p_actor_id,p_request_id,p_course_id,'course_media',v_request_hash,v_result);
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.get_course_media_download_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_study_unit_id text, p_content_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
AS $function$
declare v_course public.courses%rowtype; v_media private.course_media%rowtype; v_access text;
begin
  perform private.require_service_role();
  v_access:=private.require_course_read_access_v1(p_course_id,p_actor_id);
  if p_expected_revision is null or p_expected_revision<1 or p_content_hash is null or p_content_hash!~'^[a-f0-9]{64}$'
    or p_study_unit_id is not null and (char_length(p_study_unit_id) not between 1 and 240 or p_study_unit_id<>btrim(p_study_unit_id) or p_study_unit_id~'[[:cntrl:]]') then
    raise exception 'Pedido de áudio inválido.' using errcode='22023';
  end if;
  select * into strict v_course from public.courses where id=p_course_id;
  if v_course.revision<>p_expected_revision then raise exception 'O Curso mudou; atualize a leitura.' using errcode='40001'; end if;
  if v_access='public' and v_course.public_file_access<>'available' then
    raise exception 'A autoria não disponibilizou os arquivos deste Curso ao público.' using errcode='42501';
  end if;
  select * into v_media from private.course_media where course_id=p_course_id and content_hash=p_content_hash and status='active';
  if not found then raise exception 'Áudio indisponível; peça à autoria para anexá-lo novamente.' using errcode='PT404'; end if;
  if p_actor_id is distinct from v_course.owner_id and not exists(
    select 1 from private.course_entities e
    cross join lateral jsonb_array_elements(coalesce(e.content->'content','[]'::jsonb)) i
    cross join lateral jsonb_array_elements(case when i->>'package'='aralearn.resource.audio' then i#>'{data,tracks}' else '[]'::jsonb end) t
    where e.course_id=p_course_id and e.entity_type='study_unit' and e.entity_id=p_study_unit_id
      and i->>'package'='aralearn.resource.audio' and t->>'kind'='file'
      and t->'media'=private.course_media_reference_v1(v_media)
  ) then raise exception 'O áudio não está disponível nesta unidade.' using errcode='42501'; end if;
  return jsonb_build_object('contract','aralearn.course-media-download-internal.v1','courseId',p_course_id,'courseRevision',v_course.revision,
    'studyUnitId',p_study_unit_id,'media',private.course_media_reference_v1(v_media),
    'storagePath',v_media.storage_path);
end $function$;

CREATE OR REPLACE FUNCTION private.guard_course_audio_object_write_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
AS $function$
declare v_course uuid; v_owner uuid; v_intent private.course_media_upload_intents%rowtype;
begin
  if tg_op='UPDATE' and old.bucket_id='course-media' and new.bucket_id<>'course-media' then
    raise exception 'O objeto de áudio é imutável.' using errcode='23514';
  end if;
  if new.bucket_id<>'course-media' then return new; end if;
  if tg_op='UPDATE' then
    if row(new.bucket_id,new.name) is distinct from row(old.bucket_id,old.name) then
      raise exception 'O objeto de áudio é imutável.' using errcode='23514';
    end if;
    -- Leituras do Storage podem atualizar timestamps sem alterar o arquivo.
    if new.metadata is not distinct from old.metadata then return new; end if;
    if old.metadata ? 'size' or old.metadata ? 'mimetype' then
      raise exception 'O objeto de áudio é imutável.' using errcode='23514';
    end if;
  end if;
  if new.name!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.](wav|mp3)$' then
    raise exception 'Objeto de áudio inválido.' using errcode='22023';
  end if;
  v_course:=split_part(new.name,'/',1)::uuid;
  select owner_id into v_owner from public.courses where id=v_course;
  if v_owner is null then raise exception 'Curso inexistente.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||v_owner::text,0));
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||v_course::text,0));
  select * into v_intent from private.course_media_upload_intents i where i.course_id=v_course
      and i.storage_path=new.name
      and i.expires_at>statement_timestamp();
  if not found or not exists(select 1 from public.courses c join auth.users u on u.id=c.owner_id where c.id=v_course and c.owner_id=v_owner) then
    raise exception 'O envio de áudio exige uma preparação vigente.' using errcode='42501';
  end if;
  if new.metadata ? 'size' and new.metadata->>'size' is distinct from v_intent.byte_size::text
    or new.metadata ? 'mimetype' and new.metadata->>'mimetype' is distinct from v_intent.media_type then
    raise exception 'Os metadados do áudio divergem da preparação.' using errcode='23514';
  end if;
  return new;
end $function$;

do $manifest$ declare v jsonb; begin
 v:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905145236');
 v:=jsonb_set(v,'{features}',(v->'features')||'["course-independent-copy-v1"]'::jsonb);
 execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(v::text)||'::jsonb');
end $manifest$;
commit;
