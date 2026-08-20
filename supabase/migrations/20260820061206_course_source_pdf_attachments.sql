-- #123: anexos PDF privados e imutáveis nas revisões exatas de Fonte.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-source-pdf-attachments-v1',0
));

do $course_source_pdf_preflight$
declare
  v_manifest jsonb;
begin
  if to_regclass('private.course_source_revisions') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regclass('private.course_events') is null
     or to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('private.require_course_access_v1(uuid,uuid,boolean)') is null
     or to_regprocedure('private.course_source_json_hash_v1(jsonb)') is null
     or to_regprocedure('private.reject_course_source_fact_change_v1()') is null
     or to_regprocedure(
       'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'
     ) is null then
    raise exception 'Dependências dos anexos PDF de Fonte ausentes.'
      using errcode = '55000';
  end if;
  if to_regclass('private.course_source_attachments') is not null
     or to_regprocedure(
       'public.get_course_source_attachment_access_for_actor_v1(uuid,uuid,bigint,text,text,bigint,text,bigint,text)'
     ) is not null
     or to_regprocedure(
       'public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'
     ) is not null then
    raise exception 'A autoridade de anexos PDF já existe parcialmente.'
      using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260818052044'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'course-sources-v1',
       'course-source-provenance-v1',
       'course-variant-comparison-list-v1'
     ]) then
    raise exception 'Manifesto anterior aos anexos de Fonte é incompatível.'
      using errcode = '55000';
  end if;
end;
$course_source_pdf_preflight$;

create table private.course_source_attachments (
  course_id uuid not null references public.courses(id) on delete cascade,
  source_id text not null,
  source_revision bigint not null,
  content_hash text not null,
  byte_size bigint not null,
  media_type text not null,
  storage_path text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(course_id,source_id,source_revision,content_hash),
  constraint course_source_attachments_source_fk_v1 foreign key(
    course_id,source_id,source_revision
  ) references private.course_source_revisions(course_id,source_id,revision)
    on delete cascade,
  constraint course_source_attachments_value_v1 check(
    char_length(source_id) between 1 and 2048
    and source_id !~ '[[:cntrl:]]'
    and source_revision > 0
    and content_hash ~ '^[a-f0-9]{64}$'
    and byte_size between 1 and 20971520
    and media_type = 'application/pdf'
    and storage_path = course_id::text || '/' || content_hash || '.pdf'
  )
);

create index course_source_attachments_object_v1_idx on
  private.course_source_attachments(course_id,content_hash);

create index course_source_attachments_revision_v1_idx on
  private.course_source_attachments(
    course_id,source_id,source_revision,created_at,content_hash
  );

create index course_source_attachments_storage_path_v1_idx on
  private.course_source_attachments(storage_path,course_id);

create function private.course_source_pdf_unique_bytes_v1(p_course_id uuid)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  select coalesce(sum(unique_object.byte_size),0)::bigint
  from (
    select attachment.content_hash,max(attachment.byte_size) as byte_size
    from private.course_source_attachments attachment
    where attachment.course_id = p_course_id
    group by attachment.content_hash
  ) unique_object
$function$;

create trigger course_source_attachments_append_only_v1
before update or delete on private.course_source_attachments
for each row execute function private.reject_course_source_fact_change_v1();

revoke all on table private.course_source_attachments
from public,anon,authenticated,service_role;

alter table private.course_source_attachments enable row level security;
alter table private.course_source_attachments force row level security;

create policy course_source_attachments_owner_select_v1
on private.course_source_attachments
for select to authenticated
using(exists(
  select 1
  from public.courses course
  where course.id = course_source_attachments.course_id
    and course.owner_id = (select auth.uid())
));

insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
)
values(
  'course-source-pdfs',
  'course-source-pdfs',
  false,
  20971520,
  array['application/pdf']::text[]
)
on conflict(id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.can_read_course_source_pdf_v1(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog,public,private,auth
as $function$
  select coalesce((select auth.uid()) is not null and exists(
    select 1
    from private.course_source_attachments attachment
    join public.courses course on course.id = attachment.course_id
    where attachment.storage_path = p_storage_path
      and course.owner_id = (select auth.uid())
  ) or exists(
    select 1
    from public.courses course
    where course.id::text = split_part(p_storage_path,'/',1)
      and course.owner_id = (select auth.uid())
  ),false)
$function$;

create policy course_source_pdfs_owner_select_v1
on storage.objects
for select to authenticated
using(
  bucket_id = 'course-source-pdfs'
  and private.can_read_course_source_pdf_v1(name)
);

create or replace function public.delete_my_account_v1(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, storage
set statement_timeout = '60s'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_confirmation is distinct from 'EXCLUIR MINHA CONTA' then
    raise exception 'Confirmação inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'account-delete:' || v_user_id::text, 0
  ));
  if not exists(
    select 1 from auth.users auth_user where auth_user.id = v_user_id
  ) then
    return jsonb_build_object(
      'contract', 'aralearn.account-deletion.v1',
      'status', 'deleted'
    );
  end if;
  if exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id = 'person-avatars'
      and split_part(object_value.name, '/', 1) = v_user_id::text
  ) then
    raise exception 'Remova os objetos privados de avatar antes de excluir a conta.'
      using errcode = 'AR001';
  end if;
  if exists(
    select 1
    from storage.objects object_value
    join public.courses course
      on course.id::text = split_part(object_value.name,'/',1)
    where object_value.bucket_id = 'course-source-pdfs'
      and course.owner_id = v_user_id
  ) then
    raise exception 'Remova os PDFs privados dos Cursos antes de excluir a conta.'
      using errcode = 'AR001';
  end if;
  delete from public.course_access access_value
  where access_value.granted_by = v_user_id;
  update private.course_events event_value
  set summary = (event_value.summary - 'targetUserId') ||
    jsonb_build_object('targetAccountDeleted', true)
  where event_value.summary->>'targetUserId' = v_user_id::text;
  update private.course_change_receipts receipt
  set result = jsonb_set(
    receipt.result,
    '{person}',
    jsonb_build_object('accountDeleted', true),
    false
  )
  where receipt.result#>>'{person,userId}' = v_user_id::text;

  delete from private.course_authoring_part_didactic_microsequences membership
  using public.courses course
  where course.owner_id = v_user_id
    and membership.course_id = course.id;
  delete from private.course_authoring_part_materializations materialization
  using public.courses course
  where course.owner_id = v_user_id
    and materialization.course_id = course.id;

  delete from auth.users auth_user where auth_user.id = v_user_id;
  if not found then
    raise exception 'Conta inexistente.' using errcode = 'PT404';
  end if;
  return jsonb_build_object(
    'contract', 'aralearn.account-deletion.v1',
    'status', 'deleted'
  );
end;
$function$;

create function private.valid_course_source_pdf_object_v1(
  p_storage_path text,
  p_byte_size bigint,
  p_media_type text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog,storage
as $function$
  select exists(
    select 1
    from storage.objects object_value
    where object_value.bucket_id = 'course-source-pdfs'
      and object_value.name = p_storage_path
      and jsonb_typeof(object_value.metadata) = 'object'
      and object_value.metadata->>'size' ~ '^[1-9][0-9]{0,8}$'
      and (object_value.metadata->>'size')::bigint = p_byte_size
      and lower(coalesce(object_value.metadata->>'mimetype','')) = p_media_type
  )
$function$;

create function public.get_course_source_attachment_access_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_operation text,
  p_source_id text,
  p_source_revision bigint,
  p_content_hash text,
  p_byte_size bigint default null,
  p_media_type text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private,storage
as $function$
declare
  v_course_revision bigint;
  v_source private.course_source_revisions%rowtype;
  v_attachment private.course_source_attachments%rowtype;
  v_storage_path text;
  v_object_exists boolean;
  v_hash_already_counted boolean;
  v_unique_bytes bigint;
  v_upload_required boolean := false;
  v_already_linked boolean := false;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_operation not in ('prepare_upload','download')
     or p_source_id is null
     or char_length(p_source_id) not between 1 and 2048
     or p_source_id ~ '[[:cntrl:]]'
     or p_source_revision is null or p_source_revision < 1
     or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
     or p_operation = 'prepare_upload' and (
       p_byte_size is null or p_byte_size not between 1 and 20971520
       or p_media_type is distinct from 'application/pdf'
     )
     or p_operation = 'download' and (
       p_byte_size is not null or p_media_type is not null
     ) then
    raise exception 'Acesso ao anexo de Fonte inválido.' using errcode = '22023';
  end if;
  select course.revision into strict v_course_revision
  from public.courses course
  where course.id = p_course_id
  for share;
  if v_course_revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de acessar o anexo.'
      using errcode = '40001';
  end if;
  select * into v_source
  from private.course_source_revisions source
  where source.course_id = p_course_id
    and source.source_id = p_source_id
    and source.revision = p_source_revision;
  if not found then
    raise exception 'Revisão da Fonte inexistente.' using errcode = 'PT404';
  end if;
  v_storage_path := p_course_id::text || '/' || p_content_hash || '.pdf';
  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id = p_course_id
    and attachment.source_id = p_source_id
    and attachment.source_revision = p_source_revision
    and attachment.content_hash = p_content_hash;
  v_already_linked := found;

  if p_operation = 'prepare_upload' then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-source-pdf-quota:' || p_course_id::text,0
    ));
    if v_source.status <> 'active' or exists(
      select 1
      from private.course_source_revisions current_source
      where current_source.course_id = p_course_id
        and current_source.source_id = p_source_id
        and current_source.revision > p_source_revision
    ) then
      raise exception 'O anexo exige a revisão corrente e ativa da Fonte.'
        using errcode = '23514';
    end if;
    if v_already_linked and (
      v_attachment.byte_size <> p_byte_size
      or v_attachment.media_type <> p_media_type
      or v_attachment.storage_path <> v_storage_path
    ) then
      raise exception 'O hash já está vinculado com metadados incompatíveis.'
        using errcode = '23514';
    end if;
    select exists(
      select 1
      from private.course_source_attachments existing
      where existing.course_id = p_course_id
        and existing.content_hash = p_content_hash
    ) into v_hash_already_counted;
    v_unique_bytes := private.course_source_pdf_unique_bytes_v1(p_course_id);
    if not v_hash_already_counted
       and v_unique_bytes + p_byte_size > 67108864 then
      raise exception 'A cota de 64 MiB de PDFs únicos do Curso seria excedida.'
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
    if v_already_linked and not v_object_exists then
      raise exception 'O objeto vinculado está ausente.' using errcode = '55000';
    end if;
    v_upload_required := not v_object_exists;
  else
    if not v_already_linked then
      raise exception 'Anexo não vinculado à revisão solicitada.' using errcode = 'PT404';
    end if;
    if not private.valid_course_source_pdf_object_v1(
      v_attachment.storage_path,v_attachment.byte_size,v_attachment.media_type
    ) then
      raise exception 'O objeto vinculado está ausente ou divergiu dos metadados.'
        using errcode = '55000';
    end if;
    p_byte_size := v_attachment.byte_size;
    p_media_type := v_attachment.media_type;
    v_storage_path := v_attachment.storage_path;
  end if;

  return jsonb_build_object(
    'contract','aralearn.course-source-attachment-access.v1',
    'courseId',p_course_id,
    'courseRevision',v_course_revision,
    'operation',p_operation,
    'sourceId',p_source_id,
    'sourceRevision',p_source_revision,
    'storageOriginCourseId',p_course_id,
    'attachment',jsonb_build_object(
      'contentHash',p_content_hash,
      'byteSize',p_byte_size,
      'mediaType',p_media_type,
      'storagePath',v_storage_path
    ),
    'uploadRequired',v_upload_required,
    'alreadyLinked',v_already_linked,
    'signedUrl',null,
    'expiresAt',null
  );
end;
$function$;

create function public.attach_course_source_pdf_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_command jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,storage
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_source private.course_source_revisions%rowtype;
  v_attachment private.course_source_attachments%rowtype;
  v_source_id text;
  v_source_revision bigint;
  v_content_hash text;
  v_byte_size bigint;
  v_media_type text;
  v_storage_path text;
  v_hash_already_counted boolean;
  v_unique_bytes bigint;
  v_changed boolean := false;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_channel not in ('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or p_command - 'type' - 'sourceId' - 'sourceRevision' - 'attachment'
       <> '{}'::jsonb
     or not (p_command ?& array[
       'type','sourceId','sourceRevision','attachment'
     ])
     or p_command->>'type' <> 'attach_pdf'
     or jsonb_typeof(p_command->'sourceId') <> 'string'
     or char_length(p_command->>'sourceId') not between 1 and 2048
     or p_command->>'sourceId' ~ '[[:cntrl:]]'
     or jsonb_typeof(p_command->'sourceRevision') <> 'number'
     or p_command->>'sourceRevision' !~ '^[1-9][0-9]*$'
     or jsonb_typeof(p_command->'attachment') <> 'object'
     or (p_command->'attachment')
       - 'contentHash' - 'byteSize' - 'mediaType' - 'storagePath'
       <> '{}'::jsonb
     or not (p_command->'attachment' ?& array[
       'contentHash','byteSize','mediaType','storagePath'
     ]) then
    raise exception 'Comando attach_pdf inválido.' using errcode = '22023';
  end if;
  v_source_id := p_command->>'sourceId';
  v_source_revision := (p_command->>'sourceRevision')::bigint;
  v_content_hash := p_command#>>'{attachment,contentHash}';
  if v_content_hash is null or v_content_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_command#>'{attachment,byteSize}') <> 'number'
     or p_command#>>'{attachment,byteSize}' !~ '^[1-9][0-9]*$'
     or (p_command#>>'{attachment,byteSize}')::bigint not between 1 and 20971520
     or p_command#>>'{attachment,mediaType}' <> 'application/pdf' then
    raise exception 'Metadados do anexo PDF inválidos.' using errcode = '22023';
  end if;
  v_byte_size := (p_command#>>'{attachment,byteSize}')::bigint;
  v_media_type := p_command#>>'{attachment,mediaType}';
  v_storage_path := p_command#>>'{attachment,storagePath}';
  if v_storage_path is distinct from
       p_course_id::text || '/' || v_content_hash || '.pdf' then
    raise exception 'O caminho do anexo não corresponde ao Curso e ao hash.'
      using errcode = '23514';
  end if;

  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'channel',p_channel,'command',p_command
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'execute_course_source_command'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando de Fonte incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text,0
  ));
  select * into strict v_course
  from public.courses course
  where course.id = p_course_id
  for update;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de vincular o anexo.'
      using errcode = '40001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-source-pdf-quota:' || p_course_id::text,0
  ));
  select * into v_source
  from private.course_source_revisions source
  where source.course_id = p_course_id
    and source.source_id = v_source_id
  order by source.revision desc
  limit 1
  for share;
  if not found or v_source.status <> 'active'
     or v_source.revision <> v_source_revision then
    raise exception 'O anexo exige a revisão corrente e ativa da Fonte.'
      using errcode = '23514';
  end if;
  select exists(
    select 1
    from private.course_source_attachments existing
    where existing.course_id = p_course_id
      and existing.content_hash = v_content_hash
  ) into v_hash_already_counted;
  v_unique_bytes := private.course_source_pdf_unique_bytes_v1(p_course_id);
  if not v_hash_already_counted
     and v_unique_bytes + v_byte_size > 67108864 then
    raise exception 'A cota de 64 MiB de PDFs únicos do Curso seria excedida.'
      using errcode = '23514';
  end if;

  perform object_value.id
  from storage.objects object_value
  where object_value.bucket_id = 'course-source-pdfs'
    and object_value.name = v_storage_path
  for share;
  if not found or not private.valid_course_source_pdf_object_v1(
    v_storage_path,v_byte_size,v_media_type
  ) then
    raise exception 'O objeto PDF está ausente ou divergiu de path, tamanho ou tipo.'
      using errcode = '23514';
  end if;

  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id = p_course_id
    and attachment.source_id = v_source_id
    and attachment.source_revision = v_source_revision
    and attachment.content_hash = v_content_hash;
  if found then
    if v_attachment.byte_size <> v_byte_size
       or v_attachment.media_type <> v_media_type
       or v_attachment.storage_path <> v_storage_path then
      raise exception 'O anexo já vinculado possui metadados incompatíveis.'
        using errcode = '23514';
    end if;
  else
    if (
      select count(*)
      from private.course_source_attachments existing
      where existing.course_id = p_course_id
        and existing.source_id = v_source_id
        and existing.source_revision = v_source_revision
    ) >= 8 then
      raise exception 'Uma revisão de Fonte aceita no máximo oito anexos PDF.'
        using errcode = '23514';
    end if;
    insert into private.course_source_attachments(
      course_id,source_id,source_revision,content_hash,byte_size,
      media_type,storage_path,actor_id
    ) values(
      p_course_id,v_source_id,v_source_revision,v_content_hash,v_byte_size,
      v_media_type,v_storage_path,p_actor_id
    ) returning * into v_attachment;
    v_changed := true;
  end if;

  if v_changed then
    update public.courses course
    set revision = course.revision + 1,updated_at = now()
    where course.id = p_course_id
    returning * into v_course;
    insert into private.course_events(
      course_id,revision,operation,summary,actor_id
    ) values(
      p_course_id,v_course.revision,'update_course_sources',
      jsonb_build_object(
        'activityKind','course_source_changed','channel',p_channel,
        'commandType','attach_pdf','subjectIdHash',
          private.course_source_json_hash_v1(to_jsonb(v_source_id)),
        'subjectRevision',v_source_revision,
        'attachmentHash',v_content_hash
      ),p_actor_id
    );
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-source-change.v1',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'requestId',p_request_id,
    'idempotent',false,
    'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type','attach_pdf','subjectId',v_source_id,'revision',v_source_revision
    ) else null end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'execute_course_source_command',
    p_course_id,v_hash,v_result
  );
  return v_result;
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail = jsonb_build_object(
      'status',409,'headers',jsonb_build_object()
    )::text;
end;
$function$;

alter function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) set schema private;

alter function private.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) rename to get_owned_course_sources_core_v1;

create function public.get_owned_course_sources_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_mode text,
  p_source_id text default null,
  p_target_kind text default null,
  p_target_id text default null,
  p_cursor text default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_result jsonb;
  v_items jsonb;
begin
  perform private.require_service_role();
  v_result := private.get_owned_course_sources_core_v1(
    p_actor_id,p_course_id,p_expected_revision,p_mode,p_source_id,
    p_target_kind,p_target_id,p_cursor,p_limit
  );
  if p_mode = 'source' then
    select coalesce(jsonb_agg(
      item.value || jsonb_build_object(
        'attachments',coalesce((
          select jsonb_agg(jsonb_build_object(
            'contentHash',attachment.content_hash,
            'byteSize',attachment.byte_size,
            'mediaType',attachment.media_type,
            'storagePath',attachment.storage_path,
            'actorId',attachment.actor_id,
            'createdAt',attachment.created_at
          ) order by attachment.created_at,attachment.content_hash)
          from private.course_source_attachments attachment
          where attachment.course_id = p_course_id
            and attachment.source_id = item.value->>'sourceId'
            and attachment.source_revision = (item.value->>'revision')::bigint
        ),'[]'::jsonb)
      ) order by item.ordinal
    ),'[]'::jsonb) into v_items
    from jsonb_array_elements(v_result->'items')
      with ordinality item(value,ordinal);
    v_result := jsonb_set(v_result,'{items}',v_items,false);
  end if;
  v_result := jsonb_set(v_result,'{pdfStorage}',jsonb_build_object(
    'uniqueBytes',private.course_source_pdf_unique_bytes_v1(p_course_id),
    'maxUniqueBytes',67108864
  ),true);
  if octet_length(v_result::text) > 262144 then
    raise exception 'Leitura de Fontes excede 256 KiB.' using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

comment on table private.course_source_attachments is
  'Metadados imutáveis de PDFs vinculados a uma revisão exata de Fonte; os objetos não são apagados automaticamente.';

comment on function private.course_source_pdf_unique_bytes_v1(uuid) is
  'Total de bytes por hash PDF único vinculado ao Curso, usado pela cota transacional de 64 MiB.';

comment on function public.get_course_source_attachment_access_for_actor_v1(
  uuid,uuid,bigint,text,text,bigint,text,bigint,text
) is 'Prepara upload deduplicado ou confirma leitura owner-only de um PDF já vinculado.';

comment on function public.attach_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) is 'Confirma objeto, metadados e CAS antes de vincular imutavelmente um PDF à revisão de Fonte.';

comment on function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) is 'Leitura owner-only de Fontes; revisões exatas incluem anexos PDF imutáveis.';

revoke all on function private.course_source_pdf_unique_bytes_v1(uuid),
  private.can_read_course_source_pdf_v1(text),
  private.valid_course_source_pdf_object_v1(text,bigint,text),
  private.get_owned_course_sources_core_v1(
    uuid,uuid,bigint,text,text,text,text,text,integer
  ) from public,anon,authenticated,service_role;

revoke all on function public.get_course_source_attachment_access_for_actor_v1(
  uuid,uuid,bigint,text,text,bigint,text,bigint,text
), public.attach_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
), public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) from public,anon,authenticated,service_role;

grant execute on function private.can_read_course_source_pdf_v1(text)
to authenticated;

grant execute on function public.get_course_source_attachment_access_for_actor_v1(
  uuid,uuid,bigint,text,text,bigint,text,bigint,text
), public.attach_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
), public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) to service_role;

do $course_source_pdf_postflight$
declare
  v_definition text;
begin
  if not exists(
    select 1
    from storage.buckets bucket
    where bucket.id = 'course-source-pdfs'
      and bucket.name = 'course-source-pdfs'
      and bucket.public = false
      and bucket.file_size_limit = 20971520
      and bucket.allowed_mime_types = array['application/pdf']::text[]
  ) or not exists(
    select 1
    from pg_class relation
    where relation.oid = 'private.course_source_attachments'::regclass
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) or not exists(
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'course_source_pdfs_owner_select_v1'
      and policy.cmd = 'SELECT'
      and policy.roles = array['authenticated']::name[]
      and strpos(policy.qual,'can_read_course_source_pdf_v1') > 0
      and strpos(policy.qual,'courses') = 0
  ) or exists(
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'course_source_pdfs_owner_delete_v1'
  ) or not exists(
    select 1
    from pg_proc function_value
    where function_value.oid =
      'private.can_read_course_source_pdf_v1(text)'::regprocedure
      and function_value.prosecdef
  ) then
    raise exception 'Bucket privado, RLS ou policy de leitura dos anexos divergiu.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.get_course_source_attachment_access_for_actor_v1(uuid,uuid,bigint,text,text,bigint,text,bigint,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'course-source-pdf-quota:') = 0
     or strpos(v_definition,'course_source_pdf_unique_bytes_v1') = 0
     or strpos(v_definition,'67108864') = 0
     or strpos(v_definition,'O objeto vinculado está ausente.') = 0
     or strpos(v_definition,'''storageOriginCourseId''') = 0 then
    raise exception 'O preparo de upload não aplica a cota transacional do Curso.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(lower(v_definition),'for share') = 0
     or strpos(lower(v_definition),'for update') = 0
     or strpos(v_definition,'course-source-pdf-quota:') = 0
     or strpos(v_definition,'course_source_pdf_unique_bytes_v1') = 0
     or strpos(v_definition,'67108864') = 0
     or strpos(v_definition,'valid_course_source_pdf_object_v1') = 0
     or strpos(v_definition,'course_change_receipts') = 0
     or strpos(v_definition,'storage_path') = 0 then
    raise exception 'CAS e confirmação atômica do anexo não foram instalados.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'''attachments''') = 0
     or strpos(v_definition,'source_revision') = 0
     or strpos(v_definition,'pdfStorage') = 0
     or strpos(v_definition,'course_source_pdf_unique_bytes_v1') = 0 then
    raise exception 'A leitura de revisão exata não inclui anexos.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from unnest(array['anon','authenticated','service_role']::text[]) role_name(value)
    cross join unnest(array[
      'select','insert','update','delete'
    ]::text[]) privilege(value)
    where has_table_privilege(
      role_name.value,'private.course_source_attachments',privilege.value
    )
  ) then
    raise exception 'Metadados privados de anexo expõem privilégio direto.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.delete_my_account_v1(text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'''course-source-pdfs''') = 0
     or strpos(v_definition,'Remova os PDFs privados dos Cursos') = 0
     or strpos(v_definition,'''AR001''') = 0 then
    raise exception 'A exclusão de conta não protege os PDFs privados.'
      using errcode = '55000';
  end if;
end;
$course_source_pdf_postflight$;

do $advance_course_source_pdf_runtime_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260818052044'
     or (v_manifest->>'contractVersion')::integer <> 1 then
    raise exception 'Manifesto concorrente aos anexos PDF de Fonte.'
      using errcode = '55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal)
  into v_features
  from (
    select existing.value,existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value,ordinal)
    union all
    select 'course-source-pdf-attachments-v1',1000010::bigint
  ) feature;
  v_manifest := jsonb_build_object(
    'schemaRevision','20260820061206',
    'contractVersion',1,
    'features',v_features
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_course_source_pdf_runtime_manifest$;

commit;
