-- #298: identidade escolhida, leitura pública e corte da cópia automática.
-- A origem comprovada migra para o curso próprio antes de retirar o escritor.
begin;

-- Arquivo de migração privado: valores úteis anteriores, sem leitor de runtime.
create table private.person_profile_identity_migration_backup(
 user_id uuid primary key references auth.users(id) on delete cascade,
 previous_display_name text not null,
 migrated_at timestamptz not null default now()
);
alter table private.person_profile_identity_migration_backup enable row level security;
alter table private.person_profile_identity_migration_backup force row level security;
revoke all on private.person_profile_identity_migration_backup from public,anon,authenticated,service_role;
insert into private.person_profile_identity_migration_backup(user_id,previous_display_name)
 select user_id,display_name from public.person_profiles where display_name is not null;

alter table public.person_profiles add column handle text;
alter table public.person_profiles add constraint person_profiles_handle_format
  check (handle is null or (handle collate "C" ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'));
create unique index person_profiles_handle_unique on public.person_profiles(handle);
create index person_profiles_handle_prefix on public.person_profiles(handle text_pattern_ops)
  where handle is not null;

alter table public.courses
  add column visibility text not null default 'private' check (visibility in ('private','public')),
  add column public_file_access text not null default 'restricted' check (public_file_access in ('restricted','available')),
  add column copy_origin jsonb check (copy_origin is null or jsonb_typeof(copy_origin)='object');
create index courses_public_page on public.courses(updated_at desc,id desc) where visibility='public';
alter table private.course_sources add column public_file_access text not null default 'inherit'
  check (public_file_access in ('inherit','restricted','available'));
alter table private.course_access_grant_rate_limits add column search_attempt_count bigint not null default 0
  check (search_attempt_count>=0);

-- Inconsistências não são inferidas nem apagadas: o upgrade inteiro falha fechado.
do $migration$
begin
  if exists(select 1 from private.course_personal_copies origin
    left join public.courses target on target.id=origin.target_course_id
    where target.id is null or target.owner_id<>origin.actor_id
      or origin.target_course_id=origin.source_course_ref) then
    raise exception 'Origem de cópia incompatível; reconciliação necessária antes do corte.' using errcode='23514';
  end if;
  update public.courses target set copy_origin=jsonb_build_object(
    'contract','aralearn.course-copy-origin.v1',
    'sourceCourseId',origin.source_course_ref,'sourceCourseRevision',origin.source_course_revision,
    'studyUnitId',origin.study_unit_id,'creationHash',origin.creation_hash,
    'initialCourseRevision',origin.initial_course_revision,
    'initialStudyUnitVersion',origin.initial_study_unit_version,
    'applicationOrigin',origin.application_origin,'confirmedAt',origin.initial_updated_at,
    'createdAt',origin.created_at)
  from private.course_personal_copies origin where target.id=origin.target_course_id;
  if exists(select 1 from private.course_personal_copies origin
    join public.courses target on target.id=origin.target_course_id
    where target.copy_origin->>'creationHash' is distinct from origin.creation_hash
       or (target.copy_origin->>'sourceCourseId')::uuid is distinct from origin.source_course_ref) then
    raise exception 'Origem de cópia não preservada.' using errcode='23514';
  end if;
end
$migration$;
create index courses_copy_recovery on public.courses(owner_id,((copy_origin->>'sourceCourseId')))
  where copy_origin is not null;

create function private.normalize_person_handle_v1(p_value text,p_min_length integer default 3)
returns text language plpgsql immutable set search_path=pg_catalog as $function$
declare v_value text:=lower(regexp_replace(btrim(p_value),'^@','') collate "C");
begin
  if p_min_length not in (2,3) or v_value is null or char_length(v_value) not between p_min_length and 30
    or v_value collate "C" !~ '^[a-z0-9][a-z0-9._-]*$'
    or (p_min_length=3 and v_value collate "C" !~ '[a-z0-9]$') then
    raise exception 'Identificador inválido.' using errcode='22023';
  end if;
  return v_value;
end $function$;

-- Projeção de Estudo: campos permitidos, nunca o documento completo da tabela.
create function private.course_list_projection_v2(p_course_id uuid,p_actor_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,private as $function$
  select jsonb_build_object('courseId',c.id,'title',c.title,'goal',c.goal,'revision',c.revision,
    'ownership',coalesce(private.course_ownership_v1(c.id,p_actor_id),'public'),
    'canEdit',c.owner_id=p_actor_id and p_actor_id is not null,
    'canObserve',p_actor_id is not null and exists(select 1 from public.person_profiles p where p.user_id=p_actor_id),
    'visibility',c.visibility,'publicFileAccess',c.public_file_access,
    'moduleCount',(select count(*) from private.course_entities e where e.course_id=c.id and e.entity_type='module'),
    'lessonCount',(select count(*) from private.course_entities e where e.course_id=c.id and e.entity_type='lesson'),
    'topicCount',(select count(*) from private.course_entities e where e.course_id=c.id and e.entity_type='topic'),
    'microsequenceCount',(select count(*) from private.course_entities e where e.course_id=c.id and e.entity_type='microsequence'),
    'studyUnitCount',(select count(*) from private.course_entities e where e.course_id=c.id and e.entity_type='study_unit'),
    'completedStudyUnitCount',(select count(distinct e.entity_id)
      from public.course_personal_states s
      cross join lateral jsonb_each(coalesce(s.state#>'{progress,lessons}','{}'::jsonb)) l(path,value)
      cross join lateral jsonb_array_elements_text(l.value->'completedStudyUnitIds') completed(id)
      join private.course_entities e on e.course_id=c.id and e.entity_type='study_unit' and e.entity_id=completed.id
      where s.course_id=c.id and s.user_id=p_actor_id),'updatedAt',c.updated_at)
    || case when c.owner_id=p_actor_id and c.copy_origin is not null
      then jsonb_build_object('copyOrigin',c.copy_origin-'creationHash') else '{}'::jsonb end
  from public.courses c where c.id=p_course_id;
$function$;

create function private.list_visible_courses_v2(p_actor_id uuid,p_owned_only boolean,p_query text,p_limit integer,
 p_before_updated_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private as $function$
declare v_items jsonb; v_more boolean; v_cursor jsonb;
begin
  if p_owned_only and p_actor_id is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 50 or ((p_before_updated_at is null)<>(p_before_id is null))
    or (p_query is not null and char_length(btrim(p_query))>120) then
    raise exception 'Consulta de cursos inválida.' using errcode='22023'; end if;
  with candidates as materialized (
    select c.id,c.updated_at from public.courses c join private.course_instructional_plans p on p.course_id=c.id
    where (case when p_owned_only then c.owner_id=p_actor_id
      else c.visibility='public' or private.course_ownership_v1(c.id,p_actor_id) is not null end)
      and (nullif(btrim(p_query),'') is null or lower(c.title||' '||c.goal) like '%'||lower(btrim(p_query))||'%')
      and (p_before_updated_at is null or (c.updated_at,c.id)<(p_before_updated_at,p_before_id))
    order by c.updated_at desc,c.id desc limit p_limit+1
  ), page as materialized (select * from candidates order by updated_at desc,id desc limit p_limit)
  select coalesce(jsonb_agg(private.course_list_projection_v2(id,p_actor_id) order by updated_at desc,id desc),'[]'::jsonb),
    (select count(*)>p_limit from candidates),case when (select count(*)>p_limit from candidates) then
      (select jsonb_build_object('beforeUpdatedAt',updated_at,'beforeId',id) from page order by updated_at,id limit 1) end
  into v_items,v_more,v_cursor from page;
  return jsonb_build_object('contract','aralearn.course-list.v2','items',v_items,'hasMore',v_more,'nextCursor',v_cursor);
end $function$;

create or replace function private.list_courses_for_actor_v1(p_actor_id uuid,p_query text default null,p_limit integer default 24,
 p_before_updated_at timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  select private.list_visible_courses_v2(p_actor_id,false,p_query,p_limit,p_before_updated_at,p_before_id);
$function$;
create or replace function public.list_owned_courses_for_actor_v1(p_actor_id uuid,p_query text default null,p_limit integer default 24,
 p_before_updated_at timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  select private.list_visible_courses_v2(p_actor_id,true,p_query,p_limit,p_before_updated_at,p_before_id);
$function$;

-- Preserva a árvore/paginação já comprovadas e troca somente guardas e metadados.
do $migration$
declare v_definition text; v_old text;
begin
  select replace(pg_get_functiondef('private.get_course_for_actor_v1(uuid,uuid,boolean)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'private.require_course_access_v1('||E'\n    p_course_id,p_actor_id,false'||E'\n  )',
    'private.require_course_read_access_v1(p_course_id,p_actor_id)');
  v_definition:=regexp_replace(v_definition,E'  v_personal_copy_course_id uuid;\n  v_source_course_id uuid;\n  v_source_course_revision bigint;\n','');
  v_definition:=regexp_replace(v_definition,'  select copy_value.target_course_id into v_personal_copy_course_id.*?and copy_value.target_course_id=p_course_id;', '', 's');
  v_definition:=regexp_replace(v_definition,'''canDerive'',v_ownership=''shared''.*?''sourceCourseRevision'',v_source_course_revision,',
    '''canObserve'',p_actor_id is not null,''visibility'',v_course.visibility,''publicFileAccess'',v_course.public_file_access,','s');
  v_definition:=replace(v_definition,'  return v_result;',
    '  if v_ownership=''owned'' and v_course.copy_origin is not null then v_result:=v_result||jsonb_build_object(''copyOrigin'',v_course.copy_origin-''creationHash''); end if;'||E'\n  return v_result;');
  if position('course_personal_copies' in v_definition)>0 or position('canDerive' in v_definition)>0 then
    raise exception 'Projeção de curso não foi substituída.'; end if;
  execute v_definition;
  select replace(pg_get_functiondef('private.list_course_entities_for_actor_v1(uuid,uuid,bigint,integer,text,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_old:=v_definition;
  v_definition:=regexp_replace(v_definition,'private.require_course_access_v1\(\s*p_course_id\s*,\s*p_actor_id\s*,\s*false\s*\)',
    'private.require_course_read_access_v1(p_course_id,p_actor_id)','g');
  if v_definition=v_old then raise exception 'Guarda de entidades não encontrada.'; end if;
  execute v_definition;
  select replace(pg_get_functiondef('private.get_course_study_citations_core_v1(uuid,bigint,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=regexp_replace(v_definition,'  if v_actor_id is null then.*?  end if;', '', 's');
  v_definition:=replace(v_definition,'  perform pg_advisory_xact_lock(hashtextextended(',
    '  if v_actor_id is not null then perform pg_advisory_xact_lock(hashtextextended(');
  v_definition:=replace(v_definition,'''course-access:'' || p_course_id::text || '':'' || v_actor_id::text,0'||E'\n  ));',
    '''course-access:'' || p_course_id::text || '':'' || v_actor_id::text,0'||E'\n  )); end if;');
  v_definition:=replace(v_definition,'private.require_course_access_v1(p_course_id,v_actor_id,false)',
    'private.require_course_read_access_v1(p_course_id,v_actor_id)');
  execute v_definition;
end $migration$;

create or replace function private.course_ownership_v1(p_course_id uuid,p_actor_id uuid)
returns text language sql stable security definer set search_path=pg_catalog,public,private as $function$
  select case when course.owner_id=p_actor_id then 'owned'
    when exists(select 1 from public.course_access a where a.course_id=course.id and a.user_id=p_actor_id) then 'shared'
    else 'public' end
  from public.courses course where course.id=p_course_id and p_actor_id is not null
    and exists(select 1 from public.person_profiles p where p.user_id=p_actor_id)
    and (course.owner_id=p_actor_id or course.visibility='public'
      or exists(select 1 from public.course_access a where a.course_id=course.id and a.user_id=p_actor_id));
$function$;

-- A guarda de escrita continua recusando ator nulo. Visitantes entram somente aqui.
create function private.require_course_read_access_v1(p_course_id uuid,p_actor_id uuid)
returns text language plpgsql stable security definer set search_path=pg_catalog,public,private as $function$
declare v_ownership text;
begin
  v_ownership:=private.course_ownership_v1(p_course_id,p_actor_id);
  if v_ownership is null and exists(select 1 from public.courses c where c.id=p_course_id and c.visibility='public') then
    v_ownership:='public';
  end if;
  if v_ownership is null then raise exception 'Curso inexistente.' using errcode='PT404'; end if;
  return v_ownership;
end $function$;

-- As versões novas reutilizam integralmente a validação de propriedade do avatar.
do $migration$
declare v_definition text;
begin
  select replace(pg_get_functiondef('public.get_person_profile_for_actor_v1(uuid)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(replace(replace(replace(v_definition,'get_person_profile_for_actor_v1','get_person_profile_for_actor_v2'),
    'person-profile.v1','person-profile.v2'),'''displayName''','''handle'''),'v_profile.display_name','v_profile.handle');
  execute v_definition;
  select replace(pg_get_functiondef('public.update_person_profile_for_actor_v1(uuid,jsonb)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(replace(replace(replace(v_definition,'update_person_profile_for_actor_v1','update_person_profile_for_actor_v2'),
    'person-profile.v1','person-profile.v2'),'displayName','handle'),'display_name','handle');
  v_definition:=replace(v_definition,'v_handle := btrim(p_patch->>''handle'');','v_handle := private.normalize_person_handle_v1(p_patch->>''handle'');');
  v_definition:=replace(v_definition,'char_length(v_handle) not between 1 and 120','char_length(v_handle) not between 3 and 30');
  v_definition:=replace(v_definition,E'end;\n$function$',E'exception when unique_violation then\n  if p_patch ? ''handle'' and exists(select 1 from public.person_profiles where handle=v_handle and user_id<>p_actor_id) then\n    raise exception ''Identificador indisponível.'' using errcode=''PH409'';\n  end if;\n  raise;\nend;\n$function$');
  execute v_definition;
  select replace(pg_get_functiondef('public.list_course_access_for_actor_v1(uuid,uuid)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(replace(replace(replace(v_definition,'list_course_access_for_actor_v1','list_course_access_for_actor_v2'),
    'course-people.v1','course-people.v2'),'displayName','handle'),'display_name','handle');
  execute v_definition;
end $migration$;

-- Duas cotas no mesmo orçamento temporal já existente; buscas não gastam grants.
create function private.consume_course_people_rate_v1(p_actor_id uuid,p_search boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog,private as $function$
declare v_rate private.course_access_grant_rate_limits%rowtype; v_now timestamptz:=statement_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('course-access-grant-rate:'||p_actor_id::text,0));
  insert into private.course_access_grant_rate_limits(actor_id,window_started_at,last_attempt_at)
    values(p_actor_id,v_now,v_now) on conflict(actor_id) do nothing;
  update private.course_access_grant_rate_limits set window_started_at=v_now,
    attempt_count=0,search_attempt_count=0,granted_count=0,no_match_count=0,unchanged_count=0,rate_limited_count=0
    where actor_id=p_actor_id and window_started_at<=v_now-interval '10 minutes';
  update private.course_access_grant_rate_limits set
    attempt_count=attempt_count+case when p_search then 0 else 1 end,
    search_attempt_count=search_attempt_count+case when p_search then 1 else 0 end,last_attempt_at=v_now
    where actor_id=p_actor_id returning * into v_rate;
  return case when p_search then v_rate.search_attempt_count<=60 else v_rate.attempt_count<=10 end;
end $function$;

create function public.search_course_access_people_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_query text,p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare v_query text; v_items jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_query:=private.normalize_person_handle_v1(p_query,2);
  if p_limit is null or p_limit not between 1 and 10 then raise exception 'Limite inválido.' using errcode='22023'; end if;
  if not private.consume_course_people_rate_v1(p_actor_id,true) then
    return jsonb_build_object('contract','aralearn.course-people-search.v1','courseId',p_course_id,'items','[]'::jsonb,'rateLimited',true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'handle',p.handle,'avatarObjectKey',p.avatar_object_key)
    order by p.handle),'[]'::jsonb) into v_items from (
      select user_id,handle,avatar_object_key from public.person_profiles
      where handle like replace(replace(v_query,'_','\_'),'%','\%')||'%' escape '\'
      order by handle limit p_limit
    ) p;
  return jsonb_build_object('contract','aralearn.course-people-search.v1','courseId',p_course_id,'items',v_items);
end $function$;

create function public.manage_course_access_for_actor_v2(p_actor_id uuid,p_course_id uuid,p_operation text,
 p_target_handle text,p_target_user_id uuid,p_confirmed boolean,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare v_handle text; v_hash text; v_receipt private.course_change_receipts%rowtype;
 v_profile public.person_profiles%rowtype; v_changed boolean:=false; v_result jsonb; v_owner uuid;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_operation is null or p_operation not in ('grant_access','revoke_access') or p_target_user_id is null
    or p_confirmed is distinct from true or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Alteração de acesso inválida.' using errcode='22023'; end if;
  if p_operation='grant_access' then v_handle:=private.normalize_person_handle_v1(p_target_handle);
  elsif p_target_handle is not null then v_handle:=private.normalize_person_handle_v1(p_target_handle); end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('contract','course-access.v2','courseId',p_course_id,
    'operation',p_operation,'targetUserId',p_target_user_id,'targetHandle',v_handle));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>p_operation or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'requestId reutilizado com comando incompatível.' using errcode='23514'; end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  if p_operation='grant_access' and not private.consume_course_people_rate_v1(p_actor_id,false) then
    return jsonb_build_object('contract','aralearn.course-access-change.v2','courseId',p_course_id,
      'operation',p_operation,'changed',false,'person',null,'idempotent',false,'rateLimited',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_target_user_id::text,0));
  select * into v_profile from public.person_profiles where user_id=p_target_user_id for share;
  if not found or (p_operation='grant_access' and v_profile.handle is distinct from v_handle) then
    raise exception 'Pessoa selecionada mudou; refaça a busca.' using errcode='40001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('course-access:'||p_course_id::text||':'||p_target_user_id::text,0));
  select owner_id into strict v_owner from public.courses where id=p_course_id for share;
  if p_target_user_id=v_owner then
    if p_operation='revoke_access' then raise exception 'O proprietário mantém acesso.' using errcode='23514'; end if;
  elsif p_operation='grant_access' then
    insert into public.course_access(course_id,user_id,granted_by) values(p_course_id,p_target_user_id,p_actor_id)
      on conflict(course_id,user_id) do nothing; v_changed:=found;
  else
    delete from public.course_access where course_id=p_course_id and user_id=p_target_user_id; v_changed:=found;
  end if;
  v_result:=jsonb_build_object('contract','aralearn.course-access-change.v2','courseId',p_course_id,'operation',p_operation,
    'changed',v_changed,'person',jsonb_build_object('userId',v_profile.user_id,'handle',v_profile.handle,
      'avatarObjectKey',v_profile.avatar_object_key),'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,p_operation,p_course_id,v_hash,v_result);
  return v_result;
end $function$;

alter table private.course_source_attachments add column public_file_access text not null default 'inherit'
  check (public_file_access in ('inherit','restricted','available'));
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('private.guard_course_source_attachment_lifecycle_v1()'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'  if row(new.course_id,new.source_id,new.source_revision,new.content_hash,',
    '  if new.public_file_access<>old.public_file_access and new.version=old.version+1 and new.updated_at>old.updated_at
      and (to_jsonb(new)-array[''public_file_access'',''version'',''updated_at''])=(to_jsonb(old)-array[''public_file_access'',''version'',''updated_at'']) then
      return new;
    end if;
  if row(new.course_id,new.source_id,new.source_revision,new.content_hash,');
  execute v_definition;
end $migration$;

-- Os recibos históricos perdem o nome do comando removido, sem perder sua prova.
alter table private.course_change_receipts drop constraint course_change_receipts_operation_v12;
update private.course_change_receipts set operation='recover_owned_course_copy'
  where operation='commit_personal_course_copy_edit';
alter table private.course_change_receipts add constraint course_change_receipts_operation_v13 check(operation in(
 'create_course','commit_course_composition','apply_course_design_command_v2','execute_course_source_command',
 'execute_course_anchored_annotation','create_course_anchored_annotations','grant_access','revoke_access',
 'recover_owned_course_copy','ingest_course_source_pdf','save_course_authoring_part_v1','save_course_curricular_map_v1',
 'materialize_course_authoring_part_v1','materialize_course_authoring_part_v2','set_course_visibility','set_course_source_file_access'));

create function public.set_course_visibility_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
 p_visibility text,p_public_file_access text,p_confirmed boolean,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare v_course public.courses%rowtype; v_hash text; v_receipt private.course_change_receipts%rowtype;
 v_changed boolean; v_result jsonb;
begin
  perform private.require_service_role(); perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_visibility is null or p_visibility not in ('private','public') or p_public_file_access is null
    or p_public_file_access not in ('restricted','available') or p_confirmed is distinct from true
    or p_expected_revision is null or p_expected_revision<1 or p_request_id is null
    or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Publicação exige confirmação e política explícitas.' using errcode='22023'; end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('operation','set_course_visibility','courseId',p_course_id,
    'expectedRevision',p_expected_revision,'visibility',p_visibility,'publicFileAccess',p_public_file_access));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'set_course_visibility' or v_receipt.request_hash<>v_hash then
      raise exception 'requestId reutilizado com comando incompatível.' using errcode='23514'; end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  select * into strict v_course from public.courses where id=p_course_id for update;
  if v_course.revision<>p_expected_revision then raise exception 'O curso mudou.' using errcode='40001'; end if;
  v_changed:=v_course.visibility<>p_visibility or v_course.public_file_access<>p_public_file_access;
  if v_changed then
    update public.courses set visibility=p_visibility,public_file_access=p_public_file_access,
      revision=revision+1,updated_at=clock_timestamp() where id=p_course_id returning * into v_course;
  end if;
  v_result:=jsonb_build_object('contract','aralearn.course-visibility-change.v1','courseId',p_course_id,
    'courseRevision',v_course.revision,'visibility',v_course.visibility,'publicFileAccess',v_course.public_file_access,
    'changed',v_changed,'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,'set_course_visibility',p_course_id,v_hash,v_result);
  return v_result;
end $function$;

create function public.set_course_source_file_access_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
 p_source_id text,p_source_revision bigint,p_public_file_access text,p_request_id text,p_content_hash text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare v_course public.courses%rowtype; v_source private.course_sources%rowtype; v_policy text;
 v_hash text; v_receipt private.course_change_receipts%rowtype; v_changed boolean; v_result jsonb;
begin
  perform private.require_service_role(); perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_public_file_access is null or p_public_file_access not in ('inherit','restricted','available')
    or p_expected_revision is null or p_expected_revision<1 or p_source_revision is null or p_source_revision<1
    or p_source_id is null or char_length(p_source_id) not between 1 and 240 or p_source_id<>btrim(p_source_id)
    or p_source_id~'[[:cntrl:]]' or (p_content_hash is not null and p_content_hash!~'^[a-f0-9]{64}$')
    or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Política de arquivo inválida.' using errcode='22023'; end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('operation','set_course_source_file_access','courseId',p_course_id,
    'expectedRevision',p_expected_revision,'sourceId',p_source_id,'sourceRevision',p_source_revision,
    'contentHash',p_content_hash,'publicFileAccess',p_public_file_access));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'set_course_source_file_access' or v_receipt.request_hash<>v_hash then
      raise exception 'requestId reutilizado com comando incompatível.' using errcode='23514'; end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  select * into strict v_course from public.courses where id=p_course_id for update;
  if v_course.revision<>p_expected_revision then raise exception 'O curso mudou.' using errcode='40001'; end if;
  select * into v_source from private.course_sources where course_id=p_course_id and source_id=p_source_id for update;
  if not found or v_source.status<>'active' then raise exception 'Fonte inexistente.' using errcode='PT404'; end if;
  if v_source.revision<>p_source_revision then raise exception 'A fonte mudou.' using errcode='40001'; end if;
  v_policy:=v_source.public_file_access;
  if p_content_hash is not null then
    select public_file_access into v_policy from private.course_source_attachments
      where course_id=p_course_id and source_id=p_source_id and content_hash=p_content_hash and status='active' for update;
    if not found then raise exception 'Arquivo inexistente.' using errcode='PT404'; end if;
  end if;
  v_changed:=v_policy<>p_public_file_access;
  if v_changed then
    if p_content_hash is not null then
      update private.course_source_attachments set public_file_access=p_public_file_access,
        version=version+1,updated_at=clock_timestamp()
        where course_id=p_course_id and source_id=p_source_id and content_hash=p_content_hash;
    end if;
    update private.course_sources set public_file_access=case when p_content_hash is null then p_public_file_access else public_file_access end,
      revision=revision+1 where course_id=p_course_id and source_id=p_source_id returning * into v_source;
    update public.courses set revision=revision+1,updated_at=clock_timestamp() where id=p_course_id returning * into v_course;
  end if;
  v_result:=jsonb_build_object('contract','aralearn.course-source-file-access-change.v1','courseId',p_course_id,
    'courseRevision',v_course.revision,'sourceId',p_source_id,'sourceRevision',v_source.revision,
    'contentHash',p_content_hash,'publicFileAccess',p_public_file_access,'changed',v_changed,'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,'set_course_source_file_access',p_course_id,v_hash,v_result);
  return v_result;
end $function$;

create function private.can_read_course_file_v1(p_course_id uuid,p_actor_id uuid,p_source_id text,p_content_hash text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $function$
  select coalesce((select c.owner_id=p_actor_id or (
    s.study_visibility='citation_and_link' and (
      (private.course_ownership_v1(c.id,p_actor_id)='shared' and c.visibility='private')
      or (c.visibility='public' and coalesce(nullif(a.public_file_access,'inherit'),
        nullif(s.public_file_access,'inherit'),c.public_file_access)='available')
    )) from public.courses c join private.course_sources s on s.course_id=c.id
    join private.course_source_attachments a on a.course_id=s.course_id and a.source_id=s.source_id and a.source_revision=s.revision
    where c.id=p_course_id and s.source_id=p_source_id and a.content_hash=p_content_hash
      and s.status='active' and a.status='active'),false);
$function$;

do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'''studyVisibility'',page.study_visibility,',
    '''studyVisibility'',page.study_visibility,''publicFileAccess'',page.public_file_access,');
  v_definition:=replace(v_definition,'''studyVisibility'',source.study_visibility,',
    '''studyVisibility'',source.study_visibility,''publicFileAccess'',source.public_file_access,');
  v_definition:=replace(v_definition,'''contentHash'',attachment.content_hash,',
    '''contentHash'',attachment.content_hash,''publicFileAccess'',attachment.public_file_access,');
  execute v_definition;
  select pg_get_functiondef('public.get_course_source_pdf_download_for_actor_v1(uuid,uuid,bigint,text,bigint,text)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'private.require_course_access_v1(p_course_id,p_actor_id,true)',
    'private.require_course_read_access_v1(p_course_id,p_actor_id)');
  v_definition:=replace(v_definition,'  return jsonb_build_object(',
    '  if not private.can_read_course_file_v1(p_course_id,p_actor_id,p_source_id,p_content_hash) then
      raise exception ''Arquivo não disponível para este acesso.'' using errcode=''42501'';
    end if;
  return jsonb_build_object(');
  execute v_definition;
  select pg_get_functiondef('private.course_study_citations_payload_v1(uuid,text,bigint)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'''sourceId'',source_link.source_id,',
    '''sourceId'',source_link.source_id,''sourceRevision'',source.revision,
      ''attachments'',coalesce((select jsonb_agg(jsonb_build_object(''contentHash'',a.content_hash,
        ''byteSize'',a.byte_size,''mediaType'',a.media_type) order by a.content_hash)
        from private.course_source_attachments a where a.course_id=source.course_id and a.source_id=source.source_id
          and private.can_read_course_file_v1(source.course_id,auth.uid(),source.source_id,a.content_hash)),''[]''::jsonb),');
  execute v_definition;
end $migration$;

create function public.recover_owned_course_copy_for_actor_v1(p_actor_id uuid,p_source_course_id uuid,
 p_expected_source_revision bigint,p_expected_study_unit_version bigint,p_upsert jsonb,p_application_origin text,p_request_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private as $function$
declare v_hash text; v_course public.courses%rowtype; v_origin jsonb; v_receipt private.course_change_receipts%rowtype;
 v_status text:='unresolved'; v_unit_version bigint; v_unit_id text:=p_upsert->>'entityId';
begin
  perform private.require_service_role();
  if p_actor_id is null or not exists(select 1 from public.person_profiles where user_id=p_actor_id) then
    raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  if p_source_course_id is null or p_expected_source_revision is null or p_expected_source_revision<1
    or p_expected_study_unit_version is null or p_expected_study_unit_version<1
    or p_application_origin is null or p_application_origin not in ('manual','provider_assistance')
    or p_upsert is null or jsonb_typeof(p_upsert)<>'object' or octet_length(p_upsert::text)>1048576
    or v_unit_id is null or char_length(v_unit_id) not between 1 and 240
    or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Pedido de recuperação inválido.' using errcode='22023'; end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('operation','commit_personal_course_copy_edit',
    'actorId',p_actor_id,'sourceCourseId',p_source_course_id,'expectedSourceRevision',p_expected_source_revision,
    'expectedStudyUnitVersion',p_expected_study_unit_version,'upsert',p_upsert,'applicationOrigin',p_application_origin));
  select * into v_course from public.courses c where c.owner_id=p_actor_id
    and c.copy_origin->>'sourceCourseId'=p_source_course_id::text and c.copy_origin->>'creationHash'=v_hash
    and c.copy_origin->>'studyUnitId'=v_unit_id;
  if found then
    v_status:='confirmed'; v_origin:=v_course.copy_origin;
    select version into v_unit_version from private.course_entities where course_id=v_course.id
      and entity_type='study_unit' and entity_id=v_unit_id;
  else
    select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id
      and course_id=p_source_course_id and operation='recover_owned_course_copy' and request_hash=v_hash;
    if found and v_receipt.result->>'changed'='false' then v_status:='unchanged'; end if;
  end if;
  return jsonb_build_object('contract','aralearn.owned-course-copy-recovery.v1','status',v_status,
    'sourceCourseId',p_source_course_id,'targetCourseId',case when v_status='confirmed' then v_course.id end,
    'currentCourseRevision',case when v_status='confirmed' then v_course.revision end,
    'studyUnitId',v_unit_id,'currentStudyUnitVersion',v_unit_version,
    'initialCourseRevision',case when v_status='confirmed' then (v_origin->>'initialCourseRevision')::bigint end,
    'initialStudyUnitVersion',case when v_status='confirmed' then (v_origin->>'initialStudyUnitVersion')::bigint end,
    'applicationOrigin',p_application_origin,'confirmedAt',case when v_status='confirmed' then v_origin->>'confirmedAt' end);
end $function$;

drop function public.commit_personal_course_copy_edit_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text);
drop table private.course_personal_copies;
drop function public.get_person_profile_for_actor_v1(uuid);
drop function public.update_person_profile_for_actor_v1(uuid,jsonb);
drop function public.list_course_access_for_actor_v1(uuid,uuid);
drop function public.manage_course_access_for_actor_v1(uuid,uuid,text,text,uuid,boolean,text);
alter table public.person_profiles drop column display_name;

-- A API anônima recebe quatro funções de projeção, nunca SELECT nas tabelas.
revoke all on public.courses,public.course_access,public.person_profiles,public.course_personal_states from anon;
revoke select on public.person_profiles from authenticated;
do $migration$
declare v_function regprocedure;
begin
  for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname in ('normalize_person_handle_v1','require_course_read_access_v1',
      'course_list_projection_v2','list_visible_courses_v2','consume_course_people_rate_v1','can_read_course_file_v1'))
    or (n.nspname='public' and p.proname in ('get_person_profile_for_actor_v2','update_person_profile_for_actor_v2',
      'list_course_access_for_actor_v2','manage_course_access_for_actor_v2','search_course_access_people_for_actor_v1',
      'set_course_visibility_for_actor_v1','set_course_source_file_access_for_actor_v1','recover_owned_course_copy_for_actor_v1'))
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function);
    if (select n.nspname='public' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid=v_function::oid) then
      execute format('grant execute on function %s to service_role',v_function);
    end if;
  end loop;
end $migration$;
grant execute on function public.list_courses_v1(text,integer,timestamptz,uuid),public.get_course_v1(uuid),
 public.list_course_entities_v1(uuid,bigint,integer,text,text),public.get_course_study_citations_v1(uuid,bigint,text) to anon;

do $migration$
declare v_manifest jsonb; v_features jsonb;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  select jsonb_agg(feature order by feature) into v_features from (
    select value as feature from jsonb_array_elements_text(v_manifest->'features')
      where value not in ('person-profile-v1','personal-course-copy-edit-v1')
    union select unnest(array['person-profile-v2','public-course-study-v1','course-file-access-policy-v1','owned-course-copy-recovery-v1'])
  ) features;
  v_manifest:=v_manifest||jsonb_build_object('schemaRevision','20260905062817','features',v_features);
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(v_manifest::text)||'::jsonb');
end $migration$;

commit;
