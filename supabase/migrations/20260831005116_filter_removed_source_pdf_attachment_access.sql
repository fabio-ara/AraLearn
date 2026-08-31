-- O tombstone conserva a identidade histórica do acesso PDF, mas não pode ser
-- projetado como vínculo ativo. O preparo reutiliza seu path sem supor bytes.
begin;

do $source_pdf_attachment_access_lifecycle_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260831000829'
     or to_regprocedure(
       'public.get_course_source_attachment_access_for_actor_v1(uuid,uuid,bigint,text,text,bigint,text,bigint,text)'
     ) is null
     or not exists(
       select 1 from pg_attribute attribute
       where attribute.attrelid='private.course_source_attachments'::regclass
         and attribute.attname='status' and not attribute.attisdropped
     ) then
    raise exception 'O lifecycle de acesso PDF não corresponde ao esperado.'
      using errcode='55000';
  end if;
end;
$source_pdf_attachment_access_lifecycle_preflight$;

create or replace function public.get_course_source_attachment_access_for_actor_v1(
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
  v_attachment_found boolean:=false;
  v_storage_path text;
  v_storage_origin_course_id uuid;
  v_object_exists boolean;
  v_hash_already_counted boolean;
  v_reserved_bytes bigint;
  v_upload_required boolean:=false;
  v_already_linked boolean:=false;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision<1
     or p_operation not in('prepare_upload','download')
     or p_source_id is null
     or char_length(p_source_id) not between 1 and 2048
     or p_source_id~'[[:cntrl:]]'
     or p_source_revision is null or p_source_revision<1
     or p_content_hash is null or p_content_hash!~'^[a-f0-9]{64}$'
     or p_operation='prepare_upload' and(
       p_byte_size is null or p_byte_size not between 1 and 20971520
       or p_media_type is distinct from 'application/pdf'
     )
     or p_operation='download' and(
       p_byte_size is not null or p_media_type is not null
     ) then
    raise exception 'Acesso ao anexo de Fonte invalido.' using errcode='22023';
  end if;
  select course.revision into strict v_course_revision
  from public.courses course where course.id=p_course_id for share;
  if v_course_revision<>p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de acessar o anexo.'
      using errcode='40001';
  end if;
  select * into v_source from private.course_source_revisions source
  where source.course_id=p_course_id and source.source_id=p_source_id
    and source.revision=p_source_revision;
  if not found then
    raise exception 'Revisao da Fonte inexistente.' using errcode='PT404';
  end if;
  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id=p_course_id and attachment.source_id=p_source_id
    and attachment.source_revision=p_source_revision
    and attachment.content_hash=p_content_hash
  order by (attachment.status='active') desc,attachment.updated_at desc
  limit 1;
  v_attachment_found:=found;
  v_already_linked:=v_attachment_found and v_attachment.status='active';
  v_storage_path:=case when v_attachment_found
    then v_attachment.storage_path
    else p_course_id::text||'/'||p_content_hash||'.pdf'
  end;
  if v_storage_path!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}\.pdf$'
     or split_part(v_storage_path,'/',2)<>p_content_hash||'.pdf' then
    raise exception 'O vinculo do anexo possui caminho incompativel.'
      using errcode='23514';
  end if;
  v_storage_origin_course_id:=split_part(v_storage_path,'/',1)::uuid;

  if p_operation='prepare_upload' then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-source-pdf-quota:'||p_course_id::text,0
    ));
    if v_source.status<>'active' or exists(
      select 1 from private.course_source_revisions current_source
      where current_source.course_id=p_course_id
        and current_source.source_id=p_source_id
        and current_source.revision>p_source_revision
    ) then
      raise exception 'O anexo exige a revisao corrente e ativa da Fonte.'
        using errcode='23514';
    end if;
    if v_already_linked and(
      v_attachment.byte_size<>p_byte_size
      or v_attachment.media_type<>p_media_type
    ) then
      raise exception 'O hash ja esta vinculado com metadados incompativeis.'
        using errcode='23514';
    end if;
    if exists(
      select 1 from private.course_source_attachments existing
      where existing.course_id=p_course_id
        and existing.content_hash=p_content_hash
        and (existing.byte_size<>p_byte_size
          or existing.media_type<>p_media_type)
    ) or exists(
      select 1 from private.course_source_pdf_upload_intents intent
      where intent.course_id=p_course_id
        and intent.content_hash=p_content_hash
        and intent.expires_at>statement_timestamp()
        and (intent.byte_size<>p_byte_size
          or intent.media_type<>p_media_type)
    ) then
      raise exception 'O hash ja reserva metadados incompativeis.'
        using errcode='23514';
    end if;
    select exists(
      select 1 from private.course_source_attachments existing
      where existing.course_id=p_course_id
        and existing.content_hash=p_content_hash
        and existing.status='active'
    ) or exists(
      select 1 from storage.objects object_value
      where object_value.bucket_id='course-source-pdfs'
        and object_value.name=v_storage_path
    ) or exists(
      select 1 from private.course_source_pdf_upload_intents intent
      where intent.course_id=p_course_id
        and intent.content_hash=p_content_hash
        and intent.expires_at>statement_timestamp()
    ) into v_hash_already_counted;
    v_reserved_bytes:=private.course_source_pdf_reserved_bytes_v1(p_course_id);
    if not v_hash_already_counted
       and v_reserved_bytes+p_byte_size>67108864 then
      raise exception 'A cota de 64 MiB de PDFs unicos do Curso seria excedida.'
        using errcode='23514';
    end if;
    select exists(
      select 1 from storage.objects object_value
      where object_value.bucket_id='course-source-pdfs'
        and object_value.name=v_storage_path
    ) into v_object_exists;
    if v_object_exists and not private.valid_course_source_pdf_object_v1(
      v_storage_path,p_byte_size,p_media_type
    ) then
      raise exception 'O objeto deduplicado possui tamanho ou tipo incompativel.'
        using errcode='23514';
    end if;
    if v_already_linked and not v_object_exists then
      raise exception 'O objeto vinculado esta ausente.' using errcode='55000';
    end if;
    v_upload_required:=not v_object_exists;
    if v_upload_required then
      insert into private.course_source_pdf_upload_intents(
        actor_id,course_id,storage_path,content_hash,byte_size,media_type,
        source_id,source_revision,course_revision,created_at,expires_at
      ) values(
        p_actor_id,p_course_id,v_storage_path,p_content_hash,p_byte_size,
        p_media_type,p_source_id,p_source_revision,v_course_revision,
        statement_timestamp(),statement_timestamp()+interval '10 minutes'
      )
      on conflict(actor_id,course_id,storage_path) do update set
        content_hash=excluded.content_hash,byte_size=excluded.byte_size,
        media_type=excluded.media_type,source_id=excluded.source_id,
        source_revision=excluded.source_revision,
        course_revision=excluded.course_revision,created_at=excluded.created_at,
        expires_at=excluded.expires_at;
    else
      delete from private.course_source_pdf_upload_intents intent
      where intent.actor_id=p_actor_id and intent.course_id=p_course_id
        and intent.storage_path=v_storage_path;
    end if;
  else
    if not v_already_linked then
      raise exception 'Anexo nao vinculado a revisao solicitada.' using errcode='PT404';
    end if;
    if not private.valid_course_source_pdf_object_v1(
      v_attachment.storage_path,v_attachment.byte_size,v_attachment.media_type
    ) then
      raise exception 'O objeto vinculado esta ausente ou divergiu dos metadados.'
        using errcode='55000';
    end if;
    p_byte_size:=v_attachment.byte_size;
    p_media_type:=v_attachment.media_type;
    v_storage_path:=v_attachment.storage_path;
  end if;

  return jsonb_build_object(
    'contract',case when p_operation='download'
      then 'aralearn.course-source-attachment-access.v1'
      else 'aralearn.course-source-attachment-access.v2'
    end,
    'courseId',p_course_id,'courseRevision',v_course_revision,
    'operation',p_operation,'sourceId',p_source_id,
    'sourceRevision',p_source_revision,
    'storageOriginCourseId',v_storage_origin_course_id,
    'attachment',jsonb_build_object(
      'contentHash',p_content_hash,'byteSize',p_byte_size,
      'mediaType',p_media_type,'storagePath',v_storage_path
    ),
    'uploadRequired',v_upload_required,'alreadyLinked',v_already_linked,
    'signedUrl',null,'expiresAt',null
  );
end;
$function$;

revoke all on function public.get_course_source_attachment_access_for_actor_v1(
  uuid,uuid,bigint,text,text,bigint,text,bigint,text
) from public,anon,authenticated,service_role;
grant execute on function public.get_course_source_attachment_access_for_actor_v1(
  uuid,uuid,bigint,text,text,bigint,text,bigint,text
) to service_role;

do $advance_source_pdf_attachment_access_manifest$
declare v_manifest jsonb; v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  v_manifest:=jsonb_set(v_manifest,'{schemaRevision}',
    to_jsonb('20260831005116'::text));
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format('create or replace function public.get_aralearn_runtime_manifest() '
    ||'returns jsonb language sql stable security definer '
    ||'set search_path = pg_catalog as %L',v_body);
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_source_pdf_attachment_access_manifest$;

commit;
