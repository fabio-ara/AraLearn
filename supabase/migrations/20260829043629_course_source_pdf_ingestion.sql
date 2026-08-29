-- A ingestão recebe do transporte apenas bytes já medidos pelo servidor e a
-- intenção bibliográfica declarada. Fonte, revisão, hash, cota e path continuam
-- sendo autoridades do banco; o Storage permanece mutável somente pela API.
begin;

do $course_source_pdf_ingestion_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260828120000'
     or to_regclass('private.course_source_pdf_upload_intents') is null
     or to_regclass('private.course_source_attachments') is null
     or to_regclass('private.course_source_revisions') is null
     or to_regprocedure(
       'public.execute_course_source_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'
     ) is null
     or to_regprocedure('private.course_source_pdf_reserved_bytes_v1(uuid)') is null
     or to_regprocedure('private.course_source_json_hash_v1(jsonb)') is null
     or to_regprocedure(
       'private.valid_course_source_pdf_object_v1(text,bigint,text)'
     ) is null then
    raise exception 'A base de Fontes PDF necessária à ingestão não está instalada.'
      using errcode = '55000';
  end if;
end;
$course_source_pdf_ingestion_preflight$;

alter table private.course_source_pdf_upload_intents
  add column request_id text,
  add column request_fingerprint text,
  drop constraint course_source_pdf_upload_intents_values_v1,
  add constraint course_source_pdf_upload_intents_values_v2 check(
    storage_path
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
    and split_part(storage_path,'/',2) = content_hash || '.pdf'
    and content_hash ~ '^[a-f0-9]{64}$'
    and byte_size between 1 and 20971520
    and media_type = 'application/pdf'
    and char_length(source_id) between 1 and 2048
    and source_id !~ '[[:cntrl:]]'
    and source_revision > 0 and course_revision > 0
  ),
  add constraint course_source_pdf_upload_intents_request_v1 check(
    request_id is null
    or request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  add constraint course_source_pdf_upload_intents_fingerprint_v1 check(
    request_id is null and request_fingerprint is null
    or request_id is not null
      and request_fingerprint is not null
      and request_fingerprint ~ '^[a-f0-9]{64}$'
  );

create unique index course_source_pdf_upload_intents_request_v1_idx
on private.course_source_pdf_upload_intents(actor_id,request_id)
where request_id is not null;

-- A intent canônica é estado interno da API, nunca credencial para o upload
-- direto autenticado que a versão legada ainda usa até o corte da #221.
create or replace function private.can_upload_course_source_pdf_v1(
  p_storage_path text,
  p_metadata jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private,auth
as $function$
declare
  v_allowed boolean:=false;
begin
  if not private.lock_current_account_storage_write_v1() then
    return false;
  end if;
  select exists(
    select 1
    from private.course_source_pdf_upload_intents intent
    join public.courses course on course.id=intent.course_id
    where intent.actor_id=(select auth.uid())
      and intent.storage_path=p_storage_path
      and intent.expires_at>statement_timestamp()
      and intent.request_id is null
      and coalesce(p_metadata->>'contentLength','')~'^[0-9]{1,12}$'
      and (p_metadata->>'contentLength')::bigint=intent.byte_size
      and lower(coalesce(p_metadata->>'mimetype',''))=intent.media_type
      and course.owner_id=(select auth.uid())
      and course.revision=intent.course_revision
  ) into v_allowed;
  return coalesce(v_allowed,false);
end;
$function$;

-- O trigger legado continua consumindo a autorização do upload direto. A
-- intenção canônica sobrevive ao INSERT server-side para selar o payload até
-- a confirmação atômica (ou o cancelamento) da ingestão.
create or replace function private.consume_course_source_pdf_upload_intent_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,private
as $function$
begin
  if new.bucket_id = 'course-source-pdfs'
     and new.owner_id
       ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    delete from private.course_source_pdf_upload_intents intent
    where intent.actor_id = new.owner_id::uuid
      and intent.storage_path = new.name
      and intent.expires_at > statement_timestamp()
      and intent.request_id is null;
  end if;
  return new;
end;
$function$;

create function private.valid_course_source_pdf_ingestion_intent_v1(
  p_source_intent jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_source jsonb;
  v_mode text;
begin
  if jsonb_typeof(p_source_intent) is distinct from 'object'
     or octet_length(p_source_intent::text) > 196608
     or jsonb_typeof(p_source_intent->'mode') is distinct from 'string'
     or jsonb_typeof(p_source_intent->'sourceId') is distinct from 'string'
     or char_length(p_source_intent->>'sourceId') not between 1 and 2048
     or p_source_intent->>'sourceId' ~ '[[:cntrl:]]' then
    return false;
  end if;
  v_mode := p_source_intent->>'mode';
  if v_mode = 'existing' then
    return p_source_intent - 'mode' - 'sourceId' - 'sourceRevision' = '{}'::jsonb
      and p_source_intent ?& array['mode','sourceId','sourceRevision']
      and jsonb_typeof(p_source_intent->'sourceRevision') = 'number'
      and p_source_intent->>'sourceRevision' ~ '^[1-9][0-9]*$';
  end if;
  if v_mode <> 'save'
     or p_source_intent - 'mode' - 'sourceId' - 'expectedSourceRevision'
       - 'source' <> '{}'::jsonb
     or not (p_source_intent ?& array[
       'mode','sourceId','expectedSourceRevision','source'
     ])
     or jsonb_typeof(p_source_intent->'expectedSourceRevision') <> 'number'
     or p_source_intent->>'expectedSourceRevision' !~ '^[0-9]+$'
     or jsonb_typeof(p_source_intent->'source') <> 'object' then
    return false;
  end if;
  v_source := p_source_intent->'source';
  if v_source
       - 'kind' - 'title' - 'authorship' - 'publicationDate' - 'identifier'
       - 'language' - 'citationText' - 'url' - 'editionOrVersion' - 'origin'
       - 'availability' - 'verificationStatus' - 'studyVisibility'
       <> '{}'::jsonb
     or not (v_source ?& array[
       'kind','title','authorship','publicationDate','identifier','language',
       'citationText','url','editionOrVersion','origin','availability',
       'verificationStatus','studyVisibility'
     ])
     or jsonb_typeof(v_source->'kind') <> 'string'
     or v_source->>'kind' not in(
       'web_page','article','book','document','media','other'
     )
     or jsonb_typeof(v_source->'title') <> 'string'
     or nullif(btrim(v_source->>'title'),'') is null
     or v_source->>'title' <> btrim(v_source->>'title')
     or char_length(v_source->>'title') > 300
     or v_source->>'title' ~ '[[:cntrl:]]'
     or jsonb_typeof(v_source->'authorship') not in('string','null')
     or jsonb_typeof(v_source->'publicationDate') not in('string','null')
     or jsonb_typeof(v_source->'identifier') not in('string','null')
     or jsonb_typeof(v_source->'language') not in('string','null')
     or jsonb_typeof(v_source->'citationText') not in('string','null')
     or jsonb_typeof(v_source->'url') not in('string','null')
     or jsonb_typeof(v_source->'editionOrVersion') not in('string','null')
     or jsonb_typeof(v_source->'origin') <> 'string'
     or v_source->>'origin' not in('external','author_provided','imported_legacy')
     or jsonb_typeof(v_source->'availability') <> 'string'
     or v_source->>'availability' not in(
       'open_access','restricted','private','unknown'
     )
     or jsonb_typeof(v_source->'verificationStatus') <> 'string'
     or v_source->>'verificationStatus' not in('unverified','author_verified')
     or jsonb_typeof(v_source->'studyVisibility') <> 'string'
     or v_source->>'studyVisibility' not in(
       'hidden','citation','citation_and_link'
     ) then
    return false;
  end if;
  if v_source->>'authorship' is not null and(
       nullif(btrim(v_source->>'authorship'),'') is null
       or v_source->>'authorship' <> btrim(v_source->>'authorship')
       or char_length(v_source->>'authorship') > 500
       or v_source->>'authorship' ~ '[[:cntrl:]]'
     )
     or not private.valid_course_source_publication_date_v1(
       v_source->>'publicationDate'
     )
     or v_source->>'identifier' is not null and(
       nullif(btrim(v_source->>'identifier'),'') is null
       or v_source->>'identifier' <> btrim(v_source->>'identifier')
       or char_length(v_source->>'identifier') > 240
       or v_source->>'identifier' ~ '[[:cntrl:]]'
     )
     or v_source->>'language' is not null and(
       v_source->>'language' <> btrim(v_source->>'language')
       or char_length(v_source->>'language') > 35
       or v_source->>'language'
         !~ '^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$'
     )
     or v_source->>'citationText' is not null and(
       nullif(btrim(v_source->>'citationText'),'') is null
       or v_source->>'citationText' <> btrim(v_source->>'citationText')
       or char_length(v_source->>'citationText') > 2048
       or v_source->>'citationText' ~ '^[[:space:]]|[[:space:]]$'
       or translate(v_source->>'citationText',E'\n\r\t','') ~ '[[:cntrl:]]'
     )
     or v_source->>'url' is not null and(
       v_source->>'url' <> btrim(v_source->>'url')
       or char_length(v_source->>'url') > 2048
       or v_source->>'url' !~ '^https://[^[:space:]]+$'
     )
     or v_source->>'editionOrVersion' is not null and(
       nullif(btrim(v_source->>'editionOrVersion'),'') is null
       or v_source->>'editionOrVersion' <> btrim(v_source->>'editionOrVersion')
       or char_length(v_source->>'editionOrVersion') > 120
       or v_source->>'editionOrVersion' ~ '[[:cntrl:]]'
     )
     or v_source->>'studyVisibility' <> 'hidden'
       and v_source->>'citationText' is null then
    return false;
  end if;
  return true;
end;
$function$;

create function public.prepare_course_source_pdf_ingestion_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_source_intent jsonb,
  p_content_hash text,
  p_byte_size bigint,
  p_media_type text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_course_revision bigint;
  v_source private.course_source_revisions%rowtype;
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
  v_path_intent_found boolean;
  v_reserved_bytes bigint;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or not private.valid_course_source_pdf_ingestion_intent_v1(p_source_intent)
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
  from private.course_source_revisions source
  where source.course_id = p_course_id and source.source_id = v_source_id
  order by source.revision desc
  limit 1;
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
    if char_length(v_source_id) > 240
       or v_source_id <> btrim(v_source_id) then
      if not exists(
        select 1 from private.course_source_revisions legacy
        where legacy.course_id = p_course_id
          and legacy.source_id = v_source_id
          and legacy.status = 'unresolved_legacy'
      ) then
        raise exception 'A identidade da Fonte é incompatível com uma nova revisão.'
          using errcode = '23514';
      end if;
    end if;
    if found and v_source.status = 'active' and row(
      v_source.kind,v_source.title,v_source.authorship,v_source.publication_date,
      v_source.identifier,v_source.language,v_source.citation_text,v_source.url,
      v_source.edition_or_version,v_source.origin,v_source.availability,
      v_source.verification_status,v_source.study_visibility
    ) is not distinct from row(
      p_source_intent#>>'{source,kind}',p_source_intent#>>'{source,title}',
      p_source_intent#>>'{source,authorship}',
      p_source_intent#>>'{source,publicationDate}',
      p_source_intent#>>'{source,identifier}',
      p_source_intent#>>'{source,language}',
      p_source_intent#>>'{source,citationText}',p_source_intent#>>'{source,url}',
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
  v_already_linked := found;
  v_storage_path := case when v_already_linked
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
$function$;

create function public.ingest_course_source_pdf_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_source_intent jsonb,
  p_attachment jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_result jsonb;
  v_attachment_result jsonb;
  v_source_id text;
  v_source_revision bigint;
  v_content_hash text;
  v_byte_size bigint;
  v_media_type text;
  v_storage_path text;
  v_linked_storage_path text;
  v_course_revision bigint;
  v_internal_token text;
  v_request_fingerprint text;
  v_prepared_fingerprint text;
  v_preparation_found boolean;
  v_changed boolean;
  v_idempotent boolean;
  v_source_changed boolean := false;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or not private.valid_course_source_pdf_ingestion_intent_v1(p_source_intent)
     or p_channel not in('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_attachment) is distinct from 'object'
     or p_attachment
       - 'contentHash' - 'byteSize' - 'mediaType' - 'storagePath'
       <> '{}'::jsonb
     or not (p_attachment ?& array[
       'contentHash','byteSize','mediaType','storagePath'
     ])
     or jsonb_typeof(p_attachment->'contentHash') <> 'string'
     or p_attachment->>'contentHash' !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_attachment->'byteSize') <> 'number'
     or p_attachment->>'byteSize' !~ '^[1-9][0-9]*$'
     or (p_attachment->>'byteSize')::bigint not between 1 and 20971520
     or p_attachment->>'mediaType' <> 'application/pdf'
     or jsonb_typeof(p_attachment->'storagePath') <> 'string' then
    raise exception 'Finalização de ingestão PDF inválida.' using errcode = '22023';
  end if;
  v_source_id := p_source_intent->>'sourceId';
  v_source_revision := case when p_source_intent->>'mode' = 'existing'
    then (p_source_intent->>'sourceRevision')::bigint
    else (p_source_intent->>'expectedSourceRevision')::bigint + 1
  end;
  v_content_hash := p_attachment->>'contentHash';
  v_byte_size := (p_attachment->>'byteSize')::bigint;
  v_media_type := p_attachment->>'mediaType';
  v_storage_path := p_attachment->>'storagePath';
  v_request_fingerprint := private.course_source_json_hash_v1(
    jsonb_build_object(
      'courseId',p_course_id,
      'expectedRevision',p_expected_revision,
      'sourceIntent',p_source_intent,
      'contentHash',v_content_hash,
      'byteSize',v_byte_size,
      'mediaType',v_media_type
    )
  );
  v_internal_token := substr(private.course_source_json_hash_v1(
    jsonb_build_object(
      'actorId',p_actor_id,'requestId',p_request_id,
      'operation','course_source_pdf_ingestion'
    )
  ),1,48);
  select linked_attachment.storage_path into v_linked_storage_path
  from private.course_source_attachments linked_attachment
  where linked_attachment.course_id = p_course_id
    and linked_attachment.source_id = v_source_id
    and linked_attachment.source_revision = v_source_revision
    and linked_attachment.content_hash = v_content_hash
    and linked_attachment.byte_size = v_byte_size
    and linked_attachment.media_type = v_media_type;
  if found then
    v_storage_path := v_linked_storage_path;
  end if;
  if v_storage_path is null
     or v_storage_path
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
     or split_part(v_storage_path,'/',2) <> v_content_hash || '.pdf'
     or split_part(v_storage_path,'/',1) <> p_course_id::text and not exists(
       select 1 from private.course_source_attachments linked_attachment
       where linked_attachment.course_id = p_course_id
         and linked_attachment.source_id = v_source_id
         and linked_attachment.source_revision = v_source_revision
         and linked_attachment.content_hash = v_content_hash
         and linked_attachment.byte_size = v_byte_size
         and linked_attachment.media_type = v_media_type
         and linked_attachment.storage_path = v_storage_path
     ) then
    raise exception 'O path do PDF não corresponde ao Curso e ao hash.'
      using errcode = '23514';
  end if;
  select intent.request_fingerprint into v_prepared_fingerprint
  from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.course_id = p_course_id
    and intent.storage_path = v_storage_path
    and intent.request_id = p_request_id
    and intent.expires_at > statement_timestamp();
  v_preparation_found := found;
  if v_preparation_found
     and v_prepared_fingerprint is distinct from v_request_fingerprint then
    raise exception 'A finalização diverge do preparo do PDF.'
      using errcode = '23514';
  end if;
  if not v_preparation_found and not exists(
    select 1 from private.course_change_receipts receipt
    where receipt.actor_id = p_actor_id
      and receipt.course_id = p_course_id
      and receipt.request_id = 'pdfatt:' || v_internal_token
  ) then
    raise exception 'O preparo do PDF expirou; prepare novamente.'
      using errcode = '40001';
  end if;
  if p_source_intent->>'mode' = 'save' then
    v_source_result := public.execute_course_source_command_for_actor_v1(
      p_actor_id,p_course_id,p_expected_revision,
      jsonb_build_object(
        'type','save_source',
        'sourceId',v_source_id,
        'expectedSourceRevision',
          (p_source_intent->>'expectedSourceRevision')::bigint,
        'source',p_source_intent->'source'
      ),
      p_channel,'pdfsrc:' || v_internal_token
    );
    v_course_revision := (v_source_result->>'courseRevision')::bigint;
    v_source_changed := (v_source_result->>'changed')::boolean;
  else
    v_course_revision := p_expected_revision;
  end if;
  v_attachment_result := public.attach_course_source_pdf_for_actor_v1(
    p_actor_id,p_course_id,v_course_revision,
    jsonb_build_object(
      'type','attach_pdf','sourceId',v_source_id,
      'sourceRevision',v_source_revision,'attachment',jsonb_build_object(
        'contentHash',v_content_hash,'byteSize',v_byte_size,
        'mediaType',v_media_type,'storagePath',v_storage_path
      )
    ),
    p_channel,'pdfatt:' || v_internal_token
  );
  v_changed := v_source_changed
    or (v_attachment_result->>'changed')::boolean;
  v_idempotent := (v_attachment_result->>'idempotent')::boolean
    and (p_source_intent->>'mode' = 'existing'
      or (v_source_result->>'idempotent')::boolean);
  delete from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.course_id = p_course_id
    and intent.storage_path = v_storage_path
    and intent.request_id = p_request_id;

  return jsonb_build_object(
    'contract','aralearn.course-source-pdf-ingestion.v1',
    'courseId',p_course_id,
    'courseRevision',(v_attachment_result->>'courseRevision')::bigint,
    'requestId',p_request_id,
    'idempotent',v_idempotent,
    'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type','attach_pdf','subjectId',v_source_id,'revision',v_source_revision
    ) else null end,
    'source',jsonb_build_object(
      'sourceId',v_source_id,'sourceRevision',v_source_revision,
      'bibliographyChanged',v_source_changed
    ),
    'attachment',jsonb_build_object(
      'contentHash',v_content_hash,'byteSize',v_byte_size,
      'mediaType',v_media_type,'storagePath',v_storage_path
    ),
    'stored',true
  );
end;
$function$;

create function public.cancel_course_source_pdf_ingestion_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_storage_path text,
  p_request_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_deleted integer;
begin
  perform private.require_service_role();
  if p_storage_path is null
     or p_storage_path
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Cancelamento de ingestão PDF inválido.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.courses course where course.id = p_course_id) then
    return false;
  end if;
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  delete from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.course_id = p_course_id
    and intent.storage_path = p_storage_path
    and intent.request_id = p_request_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$function$;

comment on column private.course_source_pdf_upload_intents.request_id is
  'Identidade do preparo canônico; impede que envios concorrentes substituam a mesma intenção.';
comment on column private.course_source_pdf_upload_intents.request_fingerprint is
  'SHA-256 canônico de Curso, revisão, intenção da Fonte e identidade binária preparados.';
comment on function public.prepare_course_source_pdf_ingestion_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,bigint,text,text
) is 'Valida Fonte, CAS, hash, cota e deduplicação antes que a API grave um PDF privado.';
comment on function public.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
) is 'Salva ou revisa a Fonte e vincula o PDF atomicamente pelos comandos canônicos existentes.';

revoke all on function private.valid_course_source_pdf_ingestion_intent_v1(jsonb),
  public.prepare_course_source_pdf_ingestion_for_actor_v1(
    uuid,uuid,bigint,jsonb,text,bigint,text,text
  ),
  public.ingest_course_source_pdf_for_actor_v1(
    uuid,uuid,bigint,jsonb,jsonb,text,text
  ),
  public.cancel_course_source_pdf_ingestion_for_actor_v1(
    uuid,uuid,text,text
  ) from public,anon,authenticated,service_role;

grant execute on function public.prepare_course_source_pdf_ingestion_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,bigint,text,text
), public.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
), public.cancel_course_source_pdf_ingestion_for_actor_v1(
  uuid,uuid,text,text
) to service_role;

do $advance_course_source_pdf_ingestion_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if not (v_manifest->'features' ? 'course-source-pdf-ingestion-v1') then
    v_manifest := jsonb_set(
      v_manifest,'{features}',
      (v_manifest->'features') || to_jsonb('course-source-pdf-ingestion-v1'::text)
    );
  end if;
  v_manifest := jsonb_set(
    v_manifest,'{schemaRevision}',to_jsonb('20260829043629'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_course_source_pdf_ingestion_manifest$;

do $course_source_pdf_ingestion_postflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision'
       <> '20260829043629'
     or not (public.get_aralearn_runtime_manifest()->'features'
       @> '["course-source-pdf-ingestion-v1"]'::jsonb)
     or to_regprocedure(
       'public.prepare_course_source_pdf_ingestion_for_actor_v1(uuid,uuid,bigint,jsonb,text,bigint,text,text)'
     ) is null
     or to_regprocedure(
       'public.ingest_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.cancel_course_source_pdf_ingestion_for_actor_v1(uuid,uuid,text,text)'
     ) is null
     or not exists(
       select 1 from pg_attribute attribute_value
       where attribute_value.attrelid
         = 'private.course_source_pdf_upload_intents'::regclass
         and attribute_value.attname = 'request_fingerprint'
         and not attribute_value.attisdropped
     )
     or not exists(
       select 1 from pg_constraint constraint_value
       where constraint_value.conrelid
         = 'private.course_source_pdf_upload_intents'::regclass
         and constraint_value.conname
           = 'course_source_pdf_upload_intents_fingerprint_v1'
     )
     or not exists(
       select 1 from pg_constraint constraint_value
       where constraint_value.conrelid
         = 'private.course_source_pdf_upload_intents'::regclass
         and constraint_value.conname
           = 'course_source_pdf_upload_intents_values_v2'
     )
     or strpos(
       pg_get_functiondef(
         'private.can_upload_course_source_pdf_v1(text,jsonb)'::regprocedure
       ),
       'intent.request_id is null'
     ) = 0
     or not has_function_privilege(
       'service_role',
       'public.ingest_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.ingest_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)',
       'execute'
     ) then
    raise exception 'A ingestão canônica de PDFs de Fonte não foi instalada.'
      using errcode = '55000';
  end if;
end;
$course_source_pdf_ingestion_postflight$;

commit;
