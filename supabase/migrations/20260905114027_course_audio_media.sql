-- Áudio lógico por curso. O transporte reutiliza CAS, recibos, locks e cota dos arquivos.
begin;
do $preflight$ begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision'<>'20260905101903'
     or to_regclass('private.course_media') is not null then
    raise exception 'Estado anterior ao áudio inesperado.' using errcode='55000';
  end if;
end $preflight$;
set local lock_timeout='5s';
set local statement_timeout='5min';
lock table private.course_change_receipts in share row exclusive mode;
do $receipt_operation$ declare v_check text; begin
  select pg_get_expr(conbin,conrelid) into strict v_check from pg_constraint
    where conrelid='private.course_change_receipts'::regclass and conname='course_change_receipts_operation_v13';
  alter table private.course_change_receipts drop constraint course_change_receipts_operation_v13;
  execute format('alter table private.course_change_receipts add constraint course_change_receipts_operation_v14 check((%s) or operation=''course_media'')',v_check);
end $receipt_operation$;

create function private.valid_course_audio_config_v1(p_value jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $f$
begin
  return jsonb_typeof(p_value)='object'
    and p_value ?& array['nativeVoiceURI','rate','locale','allowRemoteNativeVoice','service']
    and p_value-array['nativeVoiceURI','rate','locale','allowRemoteNativeVoice','service']='{}'::jsonb
    and (p_value->'nativeVoiceURI'='null'::jsonb or jsonb_typeof(p_value->'nativeVoiceURI')='string'
      and char_length(p_value->>'nativeVoiceURI') between 1 and 512
      and p_value->>'nativeVoiceURI'=btrim(p_value->>'nativeVoiceURI') and p_value->>'nativeVoiceURI'!~'[[:cntrl:]]')
    and jsonb_typeof(p_value->'rate')='number' and (p_value->>'rate')::numeric between 0.25 and 2
    and jsonb_typeof(p_value->'locale')='string' and char_length(p_value->>'locale')<=100
    and p_value->>'locale'~'^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'
    and jsonb_typeof(p_value->'allowRemoteNativeVoice')='boolean'
    and (p_value->'service'='null'::jsonb or jsonb_typeof(p_value->'service')='object'
      and p_value->'service' ?& array['providerId','model','voice']
      and (p_value->'service')-array['providerId','model','voice']='{}'::jsonb
      and p_value#>>'{service,providerId}'='gemini'
      and p_value#>>'{service,model}'='gemini-2.5-flash-preview-tts'
      and p_value#>>'{service,voice}'~'^[A-Za-z][A-Za-z0-9_-]{0,63}$');
exception when others then return false; end $f$;
revoke all on function private.valid_course_audio_config_v1(jsonb) from public,anon,authenticated;

alter table public.courses add column audio_config jsonb not null default
'{"nativeVoiceURI":null,"rate":1,"locale":"pt-BR","allowRemoteNativeVoice":false,"service":null}'::jsonb;
alter table public.courses add constraint course_audio_config_v1 check(private.valid_course_audio_config_v1(audio_config) is true);

create table private.course_media(
  course_id uuid not null references public.courses(id) on delete cascade,
  content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
  byte_size bigint not null check(byte_size between 1 and 20971520),
  media_type text not null check(media_type in('audio/wav','audio/mpeg')),
  file_name text not null check(char_length(file_name) between 1 and 180 and file_name=btrim(file_name)
    and file_name!~'[[:cntrl:]/\\]' and file_name not in('.','..')),
  status text not null default 'active' check(status in('active','removed')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(course_id,content_hash)
);
create table private.course_media_upload_intents(
  actor_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  request_id text not null check(request_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),
  content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
  byte_size bigint not null check(byte_size between 1 and 20971520),
  media_type text not null check(media_type in('audio/wav','audio/mpeg')),
  file_name text not null,
  course_revision bigint not null check(course_revision>0),
  expires_at timestamptz not null,
  primary key(actor_id,request_id),
  unique(course_id,content_hash)
);
create table private.course_media_delete_intents(
  course_id uuid not null references public.courses(id) on delete cascade,
  content_hash text not null,
  media_type text not null check(media_type in('audio/wav','audio/mpeg')),
  created_at timestamptz not null default statement_timestamp(),
  primary key(course_id,content_hash)
);
alter table private.course_media enable row level security;
alter table private.course_media force row level security;
alter table private.course_media_upload_intents enable row level security;
alter table private.course_media_upload_intents force row level security;
alter table private.course_media_delete_intents enable row level security;
alter table private.course_media_delete_intents force row level security;
revoke all on private.course_media,private.course_media_upload_intents,private.course_media_delete_intents from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('course-media','course-media',false,20971520,array['audio/wav','audio/mpeg']);

create function private.course_audio_object_path_v1(p_course_id uuid,p_hash text,p_type text)
returns text language sql immutable set search_path=pg_catalog as $f$
 select p_course_id::text||'/'||p_hash||case p_type when 'audio/wav' then '.wav' when 'audio/mpeg' then '.mp3' end
$f$;
revoke all on function private.course_audio_object_path_v1(uuid,text,text) from public,anon,authenticated;

create function private.course_media_reference_v1(p_media private.course_media)
returns jsonb language sql immutable set search_path=pg_catalog as $f$
 select jsonb_build_object('contentHash',p_media.content_hash,'byteSize',p_media.byte_size,'mediaType',p_media.media_type)
$f$;
revoke all on function private.course_media_reference_v1(private.course_media) from public,anon,authenticated;

create function private.guard_course_audio_object_write_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,private,public as $f$
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
      and private.course_audio_object_path_v1(i.course_id,i.content_hash,i.media_type)=new.name
      and i.expires_at>statement_timestamp();
  if not found or not exists(select 1 from public.courses c join auth.users u on u.id=c.owner_id where c.id=v_course and c.owner_id=v_owner) then
    raise exception 'O envio de áudio exige uma preparação vigente.' using errcode='42501';
  end if;
  if new.metadata ? 'size' and new.metadata->>'size' is distinct from v_intent.byte_size::text
    or new.metadata ? 'mimetype' and new.metadata->>'mimetype' is distinct from v_intent.media_type then
    raise exception 'Os metadados do áudio divergem da preparação.' using errcode='23514';
  end if;
  return new;
end $f$;
revoke all on function private.guard_course_audio_object_write_v1() from public,anon,authenticated;
create trigger guard_course_audio_object_write_v1 before insert or update on storage.objects
for each row execute function private.guard_course_audio_object_write_v1();

create function public.get_course_media_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
 p_mode text,p_cursor text default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,private,public as $f$
declare v_course public.courses%rowtype; v_items jsonb; v_cursor text;
begin
  perform private.require_service_role();
  perform private.require_course_read_access_v1(p_course_id,p_actor_id);
  if p_expected_revision is null or p_expected_revision<1 or p_mode not in('catalog','configuration') or p_mode is null
    or p_limit is null or p_limit not between 1 and 50 or p_cursor is not null and p_cursor!~'^[a-f0-9]{64}$' then
    raise exception 'Consulta de áudio inválida.' using errcode='22023';
  end if;
  select * into strict v_course from public.courses where id=p_course_id;
  if v_course.revision<>p_expected_revision then raise exception 'O Curso mudou; atualize a leitura.' using errcode='40001'; end if;
  if p_mode='configuration' then
    if p_cursor is not null then raise exception 'Configuração não aceita cursor.' using errcode='22023'; end if;
    return jsonb_build_object('contract','aralearn.course-media.v1','courseId',p_course_id,'courseRevision',v_course.revision,
      'mode',p_mode,'audioConfig',v_course.audio_config,'storage',null,'items','[]'::jsonb,'nextCursor',null);
  end if;
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select coalesce(jsonb_agg(private.course_media_reference_v1(m::private.course_media)||jsonb_build_object('fileName',m.file_name) order by m.content_hash),'[]'::jsonb)
    into v_items from (select m.* from private.course_media m where m.course_id=p_course_id and m.status='active'
      and (p_cursor is null or m.content_hash>p_cursor) order by m.content_hash limit p_limit) m;
  if jsonb_array_length(v_items)=p_limit and exists(select 1 from private.course_media m where m.course_id=p_course_id
     and m.status='active' and m.content_hash>(v_items->(p_limit-1)->>'contentHash')) then
    v_cursor:=v_items->(p_limit-1)->>'contentHash';
  end if;
  return jsonb_build_object('contract','aralearn.course-media.v1','courseId',p_course_id,'courseRevision',v_course.revision,
    'mode',p_mode,'audioConfig',v_course.audio_config,'storage',jsonb_build_object('uniqueBytes',private.course_source_pdf_reserved_bytes_v1(p_course_id),
      'maxUniqueBytes',67108864),'items',v_items,'nextCursor',v_cursor);
end $f$;

create function public.get_course_media_download_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
 p_study_unit_id text,p_content_hash text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,private,public as $f$
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
    'storagePath',private.course_audio_object_path_v1(p_course_id,p_content_hash,v_media.media_type));
end $f$;

create function public.prepare_course_audio_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
 p_content_hash text,p_byte_size bigint,p_media_type text,p_file_name text,p_request_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,public,storage as $f$
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
    return jsonb_build_object('receipt',v_receipt.result||jsonb_build_object('idempotent',true));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select revision into strict v_revision from public.courses where id=p_course_id for update;
  if v_revision<>p_expected_revision then raise exception 'O Curso mudou; atualize antes do envio.' using errcode='40001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('course-source-pdf-quota:'||p_course_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('course-audio-object:'||p_course_id::text||'/'||p_content_hash,0));
  if exists(select 1 from private.course_media_delete_intents where course_id=p_course_id and content_hash=p_content_hash) then
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
  v_path:=private.course_audio_object_path_v1(p_course_id,p_content_hash,p_media_type);
  select exists(select 1 from storage.objects where bucket_id='course-media' and name=v_path) into v_exists;
  if v_exists and not exists(select 1 from storage.objects where bucket_id='course-media' and name=v_path
      and metadata->>'size'=p_byte_size::text and metadata->>'mimetype'=p_media_type) then
    raise exception 'Objeto de áudio diverge do arquivo enviado.' using errcode='23514'; end if;
  v_reserved:=private.course_source_pdf_reserved_bytes_v1(p_course_id);
  if not v_exists and not exists(select 1 from private.course_media m where m.course_id=p_course_id and m.content_hash=p_content_hash and m.status='active')
     and not exists(select 1 from private.course_media_upload_intents where course_id=p_course_id and content_hash=p_content_hash)
     and v_reserved+p_byte_size>67108864 then
    raise exception 'A cota conjunta de 64 MiB de PDFs e áudio seria excedida.' using errcode='23514'; end if;
  insert into private.course_media_upload_intents values(p_actor_id,p_course_id,p_request_id,v_request_hash,p_content_hash,p_byte_size,p_media_type,p_file_name,
    v_revision,statement_timestamp()+interval '10 minutes')
    on conflict(actor_id,request_id) do update set expires_at=excluded.expires_at;
  return jsonb_build_object('receipt',null,'courseId',p_course_id,'courseRevision',v_revision,'requestId',p_request_id,
    'media',jsonb_build_object('contentHash',p_content_hash,'byteSize',p_byte_size,'mediaType',p_media_type),
    'storagePath',v_path,'uploadRequired',not v_exists);
end $f$;

create function public.execute_course_media_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
 p_command jsonb,p_request_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,public,storage as $f$
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
    perform pg_advisory_xact_lock(hashtextextended('course-audio-object:'||p_course_id::text||'/'||coalesce(p_command->>'contentHash',p_command#>>'{media,contentHash}'),0));
    select * into v_media from private.course_media where course_id=p_course_id
      and content_hash=coalesce(p_command->>'contentHash',p_command#>>'{media,contentHash}');
    if v_type='remove_media' then
      if not found then raise exception 'Áudio inexistente.' using errcode='PT404'; end if;
      if v_media.status='active' then
        update private.course_media set status='removed',updated_at=statement_timestamp() where course_id=p_course_id and content_hash=v_media.content_hash returning * into v_media;
        insert into private.course_media_delete_intents(course_id,content_hash,media_type) values(p_course_id,v_media.content_hash,v_media.media_type) on conflict do nothing;
        v_changed:=true;
      end if;
    else
      select * into v_intent from private.course_media_upload_intents where actor_id=p_actor_id and request_id=p_request_id
        and course_id=p_course_id and request_hash=v_request_hash and expires_at>statement_timestamp();
      if not found then raise exception 'Preparação de áudio ausente ou expirada.' using errcode='23514'; end if;
      if exists(select 1 from private.course_media_delete_intents where course_id=p_course_id and content_hash=v_intent.content_hash) then
        raise exception 'Remoção de áudio ainda pendente.' using errcode='40001'; end if;
      v_path:=private.course_audio_object_path_v1(p_course_id,v_intent.content_hash,v_intent.media_type);
      if not exists(select 1 from storage.objects where bucket_id='course-media' and name=v_path
         and metadata->>'size'=v_intent.byte_size::text and metadata->>'mimetype'=v_intent.media_type) then
        raise exception 'Objeto de áudio não confirmado.' using errcode='23514'; end if;
      v_changed:=v_media.content_hash is null or v_media.status<>'active';
      if v_changed then
      insert into private.course_media(course_id,content_hash,byte_size,media_type,file_name)
        values(p_course_id,v_intent.content_hash,v_intent.byte_size,v_intent.media_type,v_intent.file_name)
        on conflict(course_id,content_hash) do update set status='active',updated_at=statement_timestamp()
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
end $f$;

create function public.claim_course_media_delete_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_content_hash text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $f$
declare v_intent private.course_media_delete_intents%rowtype;
begin
  perform private.require_service_role();
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_actor_id::text,0));
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  -- Expiração conserva a identidade até a limpeza real. Um envio em voo precisa
  -- da preparação vigente e do mesmo lock antes de criar metadata no Storage.
  insert into private.course_media_delete_intents(course_id,content_hash,media_type)
    select i.course_id,i.content_hash,i.media_type from private.course_media_upload_intents i
    where i.course_id=p_course_id and i.expires_at<=statement_timestamp()
      and not exists(select 1 from private.course_media m where m.course_id=i.course_id and m.content_hash=i.content_hash and m.status='active')
    on conflict do nothing;
  delete from private.course_media_upload_intents where course_id=p_course_id and expires_at<=statement_timestamp();
  select * into v_intent from private.course_media_delete_intents where course_id=p_course_id
    and (p_content_hash is null or content_hash=p_content_hash) order by content_hash limit 1 for update;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('course-audio-object:'||p_course_id::text||'/'||v_intent.content_hash,0));
  if exists(select 1 from private.course_media where course_id=p_course_id and content_hash=v_intent.content_hash and status='active') then
    raise exception 'O áudio voltou a estar ativo; a remoção foi recusada.' using errcode='23514'; end if;
  return jsonb_build_object('contentHash',v_intent.content_hash,'storagePath',private.course_audio_object_path_v1(p_course_id,v_intent.content_hash,v_intent.media_type));
end $f$;
create function public.complete_course_media_delete_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_content_hash text)
returns void language plpgsql security definer set search_path=pg_catalog,private,public,storage as $f$
declare v_claim jsonb;
begin
  v_claim:=public.claim_course_media_delete_for_actor_v1(p_actor_id,p_course_id,p_content_hash);
  if v_claim is null then return; end if;
  if exists(select 1 from storage.objects where bucket_id='course-media' and name=v_claim->>'storagePath') then
    raise exception 'A remoção física do áudio ainda não foi confirmada.' using errcode='40001'; end if;
  delete from private.course_media_delete_intents where course_id=p_course_id and content_hash=p_content_hash;
end $f$;

do $grants$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in('get_course_media_for_actor_v1','get_course_media_download_for_actor_v1',
     'prepare_course_audio_for_actor_v1','execute_course_media_for_actor_v1','claim_course_media_delete_for_actor_v1','complete_course_media_delete_for_actor_v1') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $grants$;

-- Shared lifecycle updates follow; generated from the preceding canonical definitions.
CREATE OR REPLACE FUNCTION private.course_source_pdf_reserved_bytes_v1(p_course_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'private', 'storage'
AS $function$
  with reservation as(
    select attachment.content_hash,attachment.byte_size
    from private.course_source_attachments attachment
    where attachment.course_id=p_course_id and attachment.status='active'
    union all
    select split_part(split_part(object_value.name,'/',2),'.',1),
      (object_value.metadata->>'size')::bigint
    from storage.objects object_value
    where object_value.bucket_id='course-source-pdfs'
      and object_value.name~(
        '^'||p_course_id::text||'/[a-f0-9]{64}[.]pdf$'
      )
      and jsonb_typeof(object_value.metadata)='object'
      and coalesce(object_value.metadata->>'size','')~'^[1-9][0-9]{0,8}$'
    union all
    select intent.content_hash,intent.byte_size
    from private.course_source_pdf_upload_intents intent
    where intent.course_id=p_course_id
      and intent.expires_at>statement_timestamp()
    union all
    select media.content_hash,media.byte_size from private.course_media media
      where media.course_id=p_course_id and media.status='active'
    union all
    select split_part(split_part(o.name,'/',2),'.',1),(o.metadata->>'size')::bigint
      from storage.objects o where o.bucket_id='course-media'
      and o.name~('^'||p_course_id::text||'/[a-f0-9]{64}[.](wav|mp3)$')
      and coalesce(o.metadata->>'size','')~'^[1-9][0-9]{0,8}$'
    union all
    select i.content_hash,i.byte_size from private.course_media_upload_intents i
      where i.course_id=p_course_id and i.expires_at>statement_timestamp()
  ), unique_reservation as(
    select reservation.content_hash,max(reservation.byte_size) byte_size
    from reservation
    group by reservation.content_hash
  )
  select coalesce(sum(unique_reservation.byte_size),0)::bigint
  from unique_reservation
$function$
;

CREATE OR REPLACE FUNCTION private.course_source_pdf_unique_bytes_v1(p_course_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  select coalesce(sum(value.byte_size),0)::bigint from(
    select attachment.content_hash,max(attachment.byte_size) byte_size
    from private.course_source_attachments attachment
    where attachment.course_id=p_course_id and attachment.status='active'
    group by attachment.content_hash
    union all
    select m.content_hash,m.byte_size from private.course_media m where m.course_id=p_course_id and m.status='active'
  ) value
$function$
;

CREATE OR REPLACE FUNCTION private.prepare_course_source_pdf_ingestion_core_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_source_intent jsonb, p_content_hash text, p_byte_size bigint, p_media_type text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_course_revision bigint;
  v_source private.course_sources%rowtype;
  v_attachment private.course_source_attachments%rowtype;
  v_conflicting_intent private.course_source_pdf_upload_intents%rowtype;
  v_source_id text;
  v_source_revision bigint;
  v_expected_source_revision bigint;
  v_request_fingerprint text;
  v_storage_path text;
  v_object_exists boolean;
  v_hash_already_counted boolean;
  v_upload_required boolean;
  v_already_linked boolean;
  v_attachment_found boolean;
  v_path_intent_found boolean;
  v_reserved_bytes bigint;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or not private.valid_course_source_pdf_ingestion_intent_v2(p_source_intent)
     or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
     or p_byte_size is null or p_byte_size not between 1 and 20971520
     or p_media_type is distinct from 'application/pdf'
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Preparo de ingestão PDF inválido.' using errcode = '22023';
  end if;
  v_source_id := p_source_intent->>'sourceId';
  v_request_fingerprint := private.course_source_json_hash_v1(
    jsonb_build_object(
      'courseId',p_course_id,
      'expectedRevision',p_expected_revision,
      'sourceIntent',p_source_intent,
      'contentHash',p_content_hash,
      'byteSize',p_byte_size,
      'mediaType',p_media_type
    )
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text,0
  ));
  select course.revision into strict v_course_revision
  from public.courses course
  where course.id = p_course_id
  for update;
  if v_course_revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de preparar o PDF.'
      using errcode = '40001';
  end if;

  select * into v_source
  from private.course_sources source
  where source.course_id = p_course_id and source.source_id = v_source_id;
  if p_source_intent->>'mode' = 'existing' then
    v_source_revision := (p_source_intent->>'sourceRevision')::bigint;
    if not found then
      raise exception 'Fonte inexistente.' using errcode = 'PT404';
    end if;
    if v_source.status <> 'active' or v_source.revision <> v_source_revision then
      raise exception 'O PDF exige a revisão corrente e ativa da Fonte.'
        using errcode = '23514';
    end if;
  else
    v_expected_source_revision :=
      (p_source_intent->>'expectedSourceRevision')::bigint;
    if coalesce(v_source.revision,0) <> v_expected_source_revision then
      raise exception 'A Fonte mudou; releia antes de preparar o PDF.'
        using errcode = '40001';
    end if;
    if found and v_source.status = 'active' and row(
      v_source.kind,v_source.default_roles,v_source.title,v_source.authors,v_source.publication_date,
      v_source.identifier,v_source.language,v_source.citation_mode,v_source.bibliographic,v_source.citation_text,v_source.url,
      v_source.edition_or_version,v_source.origin,v_source.availability,
      v_source.verification_status,v_source.study_visibility
    ) is not distinct from row(
      p_source_intent#>>'{source,kind}',p_source_intent#>'{source,defaultRoles}',p_source_intent#>>'{source,title}',
      p_source_intent#>'{source,authors}',
      p_source_intent#>>'{source,publicationDate}',
      p_source_intent#>>'{source,identifier}',
      p_source_intent#>>'{source,language}',
      p_source_intent#>>'{source,citationMode}',p_source_intent#>'{source,bibliographic}',p_source_intent#>>'{source,citationText}',p_source_intent#>>'{source,url}',
      p_source_intent#>>'{source,editionOrVersion}',
      p_source_intent#>>'{source,origin}',
      p_source_intent#>>'{source,availability}',
      p_source_intent#>>'{source,verificationStatus}',
      p_source_intent#>>'{source,studyVisibility}'
    ) then
      raise exception 'A Fonte já é corrente; use o modo existing para anexá-la.'
        using errcode = '23514';
    end if;
    v_source_revision := v_expected_source_revision + 1;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-source-pdf-quota:' || p_course_id::text,0
  ));
  delete from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.request_id = p_request_id
    and intent.expires_at <= statement_timestamp();
  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id = p_course_id
    and attachment.source_id = v_source_id
    and attachment.source_revision = v_source_revision
    and attachment.content_hash = p_content_hash;
  v_attachment_found := found;
  v_already_linked := v_attachment_found and v_attachment.status='active';
  v_storage_path := case when v_attachment_found
    then v_attachment.storage_path
    else p_course_id::text || '/' || p_content_hash || '.pdf'
  end;
  if v_storage_path
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
     or split_part(v_storage_path,'/',2) <> p_content_hash || '.pdf' then
    raise exception 'O path deduplicado do PDF é incompatível.'
      using errcode = '23514';
  end if;
  if v_already_linked and(
    v_attachment.byte_size <> p_byte_size
    or v_attachment.media_type <> p_media_type
  ) or exists(
    select 1 from private.course_source_attachments existing
    where existing.course_id = p_course_id
      and existing.content_hash = p_content_hash
      and (existing.byte_size <> p_byte_size
        or existing.media_type <> p_media_type)
  ) or exists(
    select 1 from private.course_source_pdf_upload_intents intent
    where intent.course_id = p_course_id
      and intent.content_hash = p_content_hash
      and intent.expires_at > statement_timestamp()
      and (intent.byte_size <> p_byte_size
        or intent.media_type <> p_media_type)
  ) then
    raise exception 'O hash já possui metadados binários incompatíveis.'
      using errcode = '23514';
  end if;
  select exists(
    select 1 from private.course_source_attachments existing
    where existing.course_id = p_course_id
      and existing.content_hash = p_content_hash
  ) or exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id = 'course-source-pdfs'
      and object_value.name = v_storage_path
  ) or exists(
    select 1 from private.course_source_pdf_upload_intents intent
    where intent.course_id = p_course_id
      and intent.content_hash = p_content_hash
      and intent.expires_at > statement_timestamp()
  ) into v_hash_already_counted;
  v_reserved_bytes := private.course_source_pdf_reserved_bytes_v1(p_course_id);
  if not v_hash_already_counted
     and v_reserved_bytes + p_byte_size > 67108864 then
    raise exception 'A cota conjunta de 64 MiB de PDFs e áudio seria excedida.'
      using errcode = '23514';
  end if;
  select exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id = 'course-source-pdfs'
      and object_value.name = v_storage_path
  ) into v_object_exists;
  if v_object_exists and not private.valid_course_source_pdf_object_v1(
    v_storage_path,p_byte_size,p_media_type
  ) then
    raise exception 'O objeto deduplicado possui tamanho ou tipo incompatível.'
      using errcode = '23514';
  end if;
  if v_attachment_found and v_attachment.status='removed' and exists(
    select 1 from private.course_source_pdf_delete_intents intent
    where intent.storage_path=v_storage_path
  ) then
    raise exception 'A remoção física deste PDF ainda está em andamento.'
      using errcode='40001';
  end if;
  if v_already_linked and not v_object_exists then
    raise exception 'O objeto vinculado está ausente.' using errcode = '55000';
  end if;
  v_upload_required := not v_object_exists;

  select * into v_conflicting_intent
  from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.course_id = p_course_id
    and intent.storage_path = v_storage_path
    and intent.expires_at > statement_timestamp();
  v_path_intent_found := found;
  if v_path_intent_found
     and v_conflicting_intent.request_id is distinct from p_request_id then
    raise exception 'Outro envio deste PDF está em andamento; tente novamente.'
      using errcode = '40001';
  end if;
  if v_path_intent_found
     and v_conflicting_intent.request_fingerprint
       is distinct from v_request_fingerprint then
    raise exception 'requestId reutilizado com preparo de PDF incompatível.'
      using errcode = '23514';
  end if;
  if exists(
    select 1 from private.course_source_pdf_upload_intents intent
    where intent.actor_id = p_actor_id
      and intent.request_id = p_request_id
      and intent.expires_at > statement_timestamp()
      and (intent.course_id <> p_course_id
        or intent.storage_path <> v_storage_path)
  ) then
    raise exception 'requestId reutilizado para outro envio de PDF.'
      using errcode = '23514';
  end if;
  insert into private.course_source_pdf_upload_intents(
    actor_id,course_id,storage_path,content_hash,byte_size,media_type,
    source_id,source_revision,course_revision,created_at,expires_at,request_id,
    request_fingerprint
  ) values(
    p_actor_id,p_course_id,v_storage_path,p_content_hash,p_byte_size,
    p_media_type,v_source_id,v_source_revision,v_course_revision,
    statement_timestamp(),statement_timestamp()+interval '10 minutes',
    p_request_id,v_request_fingerprint
  )
  on conflict(actor_id,course_id,storage_path) do update set
    content_hash = excluded.content_hash,
    byte_size = excluded.byte_size,
    media_type = excluded.media_type,
    source_id = excluded.source_id,
    source_revision = excluded.source_revision,
    course_revision = excluded.course_revision,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at,
    request_id = excluded.request_id,
    request_fingerprint = excluded.request_fingerprint;

  return jsonb_build_object(
    'contract','aralearn.course-source-pdf-ingestion-preparation.v1',
    'courseId',p_course_id,
    'courseRevision',v_course_revision,
    'requestId',p_request_id,
    'sourceId',v_source_id,
    'sourceRevision',v_source_revision,
    'attachment',jsonb_build_object(
      'contentHash',p_content_hash,
      'byteSize',p_byte_size,
      'mediaType',p_media_type,
      'storagePath',v_storage_path
    ),
    'uploadRequired',v_upload_required,
    'alreadyLinked',v_already_linked
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_my_account_v1(p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth', 'storage'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticacao obrigatoria.' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(auth.jwt()->>'client_id','')),'') is not null then
    raise exception 'A exclusao de conta exige a sessao da aplicacao.'
      using errcode='42501';
  end if;
  if p_confirmation is distinct from 'EXCLUIR MINHA CONTA' then
    raise exception 'Confirmacao invalida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'account-delete:'||v_user_id::text,0
  ));
  if not exists(select 1 from auth.users auth_user where auth_user.id=v_user_id) then
    return jsonb_build_object(
      'contract','aralearn.account-deletion.v1','status','deleted'
    );
  end if;
  if not private.current_auth_session_is_active_v1() then
    raise exception 'A exclusao de conta exige uma sessao ativa da aplicacao.'
      using errcode='42501';
  end if;
  if exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id='person-avatars'
      and split_part(object_value.name,'/',1)=v_user_id::text
  ) then
    raise exception 'Remova os objetos privados de avatar antes de excluir a conta.'
      using errcode='AR001';
  end if;
  if exists(
    select 1 from storage.objects object_value
    join public.courses course
      on course.id::text=split_part(object_value.name,'/',1)
    where object_value.bucket_id in('course-source-pdfs','course-media')
      and course.owner_id=v_user_id
  ) then
    raise exception 'Remova os arquivos privados dos Cursos antes de excluir a conta.'
      using errcode='AR001';
  end if;
  delete from public.course_access access_value
  where access_value.granted_by=v_user_id;
  null;
  update private.course_change_receipts receipt
  set result=jsonb_set(
    receipt.result,'{person}',jsonb_build_object('accountDeleted',true),false
  )
  where receipt.result#>>'{person,userId}'=v_user_id::text;
  delete from private.course_authoring_part_didactic_microsequences membership
  using public.courses course
  where course.owner_id=v_user_id and membership.course_id=course.id;
  delete from auth.sessions session_value where session_value.user_id=v_user_id;
  delete from auth.users auth_user where auth_user.id=v_user_id;
  if not found then
    raise exception 'Conta inexistente.' using errcode='PT404';
  end if;
  return jsonb_build_object(
    'contract','aralearn.account-deletion.v1','status','deleted'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.maintain_course_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_operation text, p_confirmed boolean, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_course public.courses%rowtype;
  v_changed boolean := false;
begin
  perform private.require_service_role();
  if p_actor_id is null or p_course_id is null
     or p_operation not in ('delete_owned_course', 'leave_shared_course')
     or p_confirmed is distinct from true
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Operação de ciclo de vida de Curso inválida.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_actor_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-lifecycle:' || p_course_id::text, 0
  ));
  select * into v_course from public.courses course where course.id = p_course_id;

  if p_operation = 'delete_owned_course' then
    if found and v_course.owner_id <> p_actor_id then
      raise exception 'Somente o proprietário pode excluir este Curso.'
        using errcode = '42501';
    end if;
    if found then
      if exists(select 1 from storage.objects o where o.bucket_id='course-media'
        and split_part(o.name,'/',1)=p_course_id::text) then
        raise exception 'Remova os arquivos privados antes de excluir o Curso.' using errcode='AR002';
      end if;
      delete from public.courses course
      where course.id = p_course_id and course.owner_id = p_actor_id;
      v_changed := found;
    end if;
  else
    if found and v_course.owner_id = p_actor_id then
      raise exception 'O proprietário não pode sair do próprio Curso.'
        using errcode = '42501';
    end if;
    delete from public.course_access access_value
    where access_value.course_id = p_course_id
      and access_value.user_id = p_actor_id;
    v_changed := found;
  end if;

  return jsonb_build_object(
    'contract', 'aralearn.course-lifecycle.v1',
    'courseId', p_course_id,
    'operation', p_operation,
    'status', case when v_changed then 'completed' else 'already_absent' end,
    'changed', v_changed,
    'requestId', p_request_id
  );
end;
$function$
;

lock table private.course_component_policy_assignments in access exclusive mode;
create temporary table previous_media_package_catalog on commit drop as select private.course_component_catalog_v1() value;
alter table private.course_component_policy_assignments drop constraint course_component_policy_assignments_policy_v1;
-- RESOURCE_PACKAGE_CATALOG_BEGIN
-- Gerado por scripts/syncResourcePackageCatalog.mjs; fonte: registro de packages.
create or replace function private.course_component_catalog_v1()
returns jsonb language sql immutable security definer set search_path=pg_catalog
as $catalog$ select '{"version":"1-5f0fd13d","schemaFingerprint":"sha256:be520856aeb1c583daef1c0a39e5252633af92eede420eb03be47c1e79d060cc","options":[{"ref":"aralearn.resource.paragraph@1.0.0","label":"Texto explicado","purpose":"Desenvolver uma explicação progressiva em prosa, listas, literais, escrita anotada e matemática integrada."},{"ref":"aralearn.resource.code@1.0.0","label":"Código","purpose":"Apresentar código cuja sintaxe, indentação e execução mental são relevantes."},{"ref":"aralearn.resource.table@1.0.0","label":"Tabela","purpose":"Comparar atributos repetidos ou consultar valores organizados por linhas e colunas."},{"ref":"aralearn.resource.annotated_text@1.0.0","label":"Texto anotado","purpose":"Relacionar trechos precisos de um texto a observações, funções ou explicações."},{"ref":"aralearn.resource.bpmn_process@1.0.0","label":"Processo BPMN","purpose":"Representar participantes, raias, eventos, atividades, gateways e fluxos segundo o subconjunto didático de BPMN 2.0."},{"ref":"aralearn.resource.interlinear_gloss@1.0.0","label":"Glosa interlinear","purpose":"Alinhar formas linguísticas segmentadas, glosas morfema a morfema, tradução livre e legenda de abreviações."},{"ref":"aralearn.response.choice@1.0.0","label":"Escolha","purpose":"Pedir que o estudante discrimine uma ou mais alternativas plausíveis."},{"ref":"aralearn.response.gap@1.0.0","label":"Lacuna","purpose":"Pedir recuperação ou discriminação exatamente no campo semântico declarado pelo conteúdo."},{"ref":"aralearn.response.ordering@3.0.0","label":"Ordenação","purpose":"Pedir que o estudante reconstrua a ordem de expressões nos próprios campos textuais em que elas são lidas."},{"ref":"aralearn.resource.tree@1.0.0","label":"Árvore enraizada","purpose":"Representar hierarquia com relação pai-filho, raiz explícita e no máximo um pai por nó."},{"ref":"aralearn.resource.matrix@1.0.0","label":"Matriz","purpose":"Representar um arranjo retangular de escalares ou expressões e operações da álgebra linear."},{"ref":"aralearn.resource.reaction@1.0.0","label":"Reação","purpose":"Representar reagentes, produtos, proporções, estados e condições de uma reação."},{"ref":"aralearn.resource.flow@1.0.0","label":"Fluxograma","purpose":"Representar sequência, decisão, ramificação e repetição com a convenção visual de fluxogramas."},{"ref":"aralearn.resource.formula@1.0.0","label":"Fórmula","purpose":"Representar expressão matemática ou química estruturada com leitura acessível explícita."},{"ref":"aralearn.resource.plane@1.0.0","label":"Plano cartesiano","purpose":"Situar pontos, vetores, trajetórias e regiões em duas dimensões com escala acadêmica explícita."},{"ref":"aralearn.resource.chart@1.0.0","label":"Gráfico estatístico","purpose":"Tornar tendência, comparação quantitativa, escala e incerteza visualmente observáveis."},{"ref":"aralearn.resource.software_system_context@1.0.0","label":"Contexto de sistema de software","purpose":"Situar um sistema de software entre pessoas e sistemas externos segundo o diagrama de contexto do modelo C4."},{"ref":"aralearn.resource.software_container@1.0.0","label":"Contêineres de software","purpose":"Representar aplicações e armazenamentos executáveis ou implantáveis dentro de um sistema segundo o nível de contêiner do C4."},{"ref":"aralearn.resource.system_internal_block@1.0.0","label":"Diagrama interno de bloco","purpose":"Representar partes, portas, itens e conectores internos de um bloco segundo a gramática de diagrama interno do SysML."},{"ref":"aralearn.resource.graph@1.0.0","label":"Grafo matemático","purpose":"Representar grafos e dígrafos abstratos segundo a notação de teoria dos grafos."},{"ref":"aralearn.resource.relation_map@1.0.0","label":"Diagrama de relação","purpose":"Tornar visíveis domínio, contradomínio, imagens, preimagens e cardinalidade de uma relação binária."},{"ref":"aralearn.resource.database_schema@1.0.0","label":"Esquema relacional","purpose":"Representar relações, atributos, chaves e dependências referenciais no modelo lógico relacional."},{"ref":"aralearn.resource.memory_layout@1.0.0","label":"Mapa de memória","purpose":"Representar intervalos de endereços, segmentos e ocupação de memória na ordem convencional."},{"ref":"aralearn.resource.network_topology@1.0.0","label":"Topologia de rede","purpose":"Representar equipamentos, segmentos e enlaces de uma rede sem confundi-los com vértices abstratos."},{"ref":"aralearn.resource.packet_layout@1.0.0","label":"Layout de pacote","purpose":"Representar cabeçalhos e registros binários em palavras de largura fixa, com posição e extensão de cada campo."},{"ref":"aralearn.resource.set_diagram@1.0.0","label":"Diagrama de conjuntos","purpose":"Representar inclusão, exclusão e interseção entre dois ou três conjuntos, preservando as regiões de Venn ou a topologia de Euler."},{"ref":"aralearn.resource.state_machine@1.0.0","label":"Diagrama de estados","purpose":"Representar comportamento dependente de estado com a notação gráfica de autômatos ou máquinas de estados."},{"ref":"aralearn.resource.truth_table@1.0.0","label":"Tabela-verdade","purpose":"Representar valorações e o resultado de uma fórmula proposicional segundo a convenção lógica."},{"ref":"aralearn.resource.entity_relationship@1.0.0","label":"Modelo entidade-relacionamento","purpose":"Representar entidades, atributos e cardinalidades no nível conceitual da modelagem de dados."},{"ref":"aralearn.resource.state_transition_table@1.0.0","label":"Tabela de transição","purpose":"Comparar de forma exaustiva a função de transição por estado e evento ou símbolo."},{"ref":"aralearn.resource.call_stack@1.0.0","label":"Pilha de chamadas","purpose":"Representar quadros de ativação, parâmetros, variáveis locais e continuações durante chamadas de função."},{"ref":"aralearn.resource.audio@1.0.0","label":"Áudio","purpose":"Escutar e comparar falas ou gravações quando o som participa da aprendizagem."},{"ref":"aralearn.resource.calculator@1.0.0","label":"Calculadora","purpose":"Disponibilizar cálculo numérico real para verificar resultados, explorar valores e comparar uma previsão com um cálculo explícito."},{"ref":"aralearn.resource.dictionary@1.0.0","label":"Dicionário","purpose":"Abrir um ou mais dicionários configurados pela autoria para consultar sentidos, pronúncia e exemplos adequados ao contexto."},{"ref":"aralearn.resource.grammar@1.0.0","label":"Gramática","purpose":"Abrir explicações gramaticais escolhidas para apoiar a análise de formas, construções e usos no contexto da tarefa."},{"ref":"aralearn.resource.reading@1.0.0","label":"Leitura complementar","purpose":"Oferecer leituras selecionadas com orientação para ampliar, contrastar ou aplicar o conteúdo da tarefa e depois retomar o estudo."},{"ref":"aralearn.resource.terminal_session@1.0.0","label":"Sessão de terminal","purpose":"Representar uma interação textual temporal entre pessoa e sistema, preservando entradas, saídas, erros e mudanças observáveis de estado."},{"ref":"aralearn.response.open@1.0.0","label":"Resposta aberta","purpose":"Pedir que o estudante explique, justifique ou preveja com palavras próprias, sem oferecer alternativas."}]}'::jsonb $catalog$;
-- RESOURCE_PACKAGE_CATALOG_END
do $catalog_preservation$ begin
  if exists(select 1 from previous_media_package_catalog p,jsonb_array_elements(p.value->'options') o
    where not exists(select 1 from jsonb_array_elements(private.course_component_catalog_v1()->'options') n where n->>'ref'=o->>'ref')) then
    raise exception 'O áudio não pode remover referências de pacotes existentes.' using errcode='55000';
  end if;
end $catalog_preservation$;
update private.course_component_policy_assignments set policy=jsonb_set(policy,'{catalogVersion}',private.course_component_catalog_v1()->'version',false);
alter table private.course_component_policy_assignments add constraint course_component_policy_assignments_policy_v1
 check(private.valid_course_component_policy_v1(policy) and octet_length(policy::text)<=4096);
-- Snapshots e aplicações históricos permanecem literalmente inalterados.

do $manifest$ declare v jsonb; begin
 v:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905114027');
 execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(v::text)||'::jsonb');
end $manifest$;
notify pgrst,'reload schema';
commit;
