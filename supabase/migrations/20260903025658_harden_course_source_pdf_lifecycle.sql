-- Fecha três lacunas do ciclo corrente de PDFs de Fonte:
-- - a finalização em Fonte existente conserva o CAS do Curso até o commit;
-- - criação/reativação de vínculo participa do lock global do objeto;
-- - uma remoção física interrompida pode ser retomada pela própria Fonte.
begin;

do $course_source_pdf_lifecycle_hardening_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision'
       <> '20260902234800'
     or to_regclass('private.course_source_pdf_delete_intents') is null
     or to_regclass('private.course_source_attachments') is null
     or to_regprocedure(
       'private.ingest_course_source_pdf_core_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.ingest_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.claim_course_source_pdf_delete_for_actor_v1(uuid,uuid,text)'
     ) is null
     or to_regprocedure(
       'private.guard_course_source_attachment_lifecycle_v1()'
     ) is null then
    raise exception 'Dependências do endurecimento do ciclo de PDF ausentes.'
      using errcode = '55000';
  end if;
end;
$course_source_pdf_lifecycle_hardening_preflight$;

-- O recibo continua sendo consultado antes do lock/CAS: uma repetição exata
-- recupera o resultado confirmado mesmo depois que a revisão já avançou.
create or replace function public.ingest_course_source_pdf_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_source_intent jsonb,
  p_attachment jsonb,
  p_file_identity jsonb,
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
  v_request_hash text;
  v_context_hash text;
  v_result jsonb;
  v_stored_result jsonb;
  v_course_revision bigint;
  v_receipt private.course_change_receipts%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if not private.valid_course_source_pdf_file_identity_v1(p_file_identity) then
    raise exception 'Identidade pública do arquivo PDF inválida.'
      using errcode = '22023';
  end if;
  v_request_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,
    'expectedRevision',p_expected_revision,
    'sourceIntent',p_source_intent,
    'attachment',jsonb_build_object(
      'contentHash',p_attachment->'contentHash',
      'byteSize',p_attachment->'byteSize',
      'mediaType',p_attachment->'mediaType'
    ),
    'fileIdentity',p_file_identity,
    'channel',p_channel
  ));
  v_context_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,
    'expectedRevision',p_expected_revision,
    'sourceIntent',p_source_intent,
    'fileIdentity',p_file_identity,
    'channel',p_channel
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
    if v_receipt.operation <> 'ingest_course_source_pdf'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_request_hash
       or v_receipt.result->>'_ingestionContextHash'
         is distinct from v_context_hash then
      raise exception 'requestId reutilizado com ingestão de PDF incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - '_ingestionContextHash' - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  if p_source_intent->>'mode' = 'existing' then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-row:' || p_course_id::text,0
    ));
    select course.revision into v_course_revision
    from public.courses course
    where course.id = p_course_id
    for update;
    if not found then
      raise exception 'Curso inexistente ou inacessível.' using errcode = 'PT404';
    end if;
    if v_course_revision <> p_expected_revision then
      raise exception 'O Curso mudou; releia antes de incorporar o PDF.'
        using errcode = '40001';
    end if;
  end if;

  v_result := private.ingest_course_source_pdf_core_v1(
    p_actor_id,p_course_id,p_expected_revision,p_source_intent,p_attachment,
    p_channel,p_request_id
  );
  v_stored_result := v_result || jsonb_build_object(
    '_ingestionContextHash',v_context_hash
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'ingest_course_source_pdf',p_course_id,
    v_request_hash,v_stored_result
  );
  return v_result;
end;
$function$;

comment on function public.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text
) is 'Ingere PDF com recibo idempotente e CAS mantido até o commit da finalização.';

revoke all on function public.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text
) to service_role;

create or replace function private.guard_course_source_attachment_lifecycle_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
begin
  if tg_op = 'DELETE' then
    if not exists(select 1 from public.courses course where course.id=old.course_id) then
      return old;
    end if;
    raise exception 'O vínculo corrente do PDF não pode ser apagado diretamente.'
      using errcode='55000';
  end if;
  if tg_op = 'INSERT' then
    new.updated_at:=coalesce(new.updated_at,new.created_at,now());
    if new.status='active' then
      perform pg_advisory_xact_lock(hashtextextended(
        'course-source-pdf-object:'||new.storage_path,0
      ));
      if exists(
        select 1 from private.course_source_pdf_delete_intents intent
        where intent.storage_path=new.storage_path
      ) then
        raise exception 'A remoção física deste PDF ainda está em andamento.'
          using errcode='40001';
      end if;
    end if;
    return new;
  end if;
  if new.source_revision<>old.source_revision
     and (to_jsonb(new)-'source_revision')=(to_jsonb(old)-'source_revision')
     and exists(
       select 1 from private.course_sources source
       where source.course_id=new.course_id and source.source_id=new.source_id
         and source.revision=new.source_revision
     ) then
    return new;
  end if;
  if row(new.course_id,new.source_id,new.source_revision,new.content_hash,
      new.byte_size,new.media_type,new.storage_path,new.created_at)
     is distinct from row(old.course_id,old.source_id,old.source_revision,
      old.content_hash,old.byte_size,old.media_type,old.storage_path,old.created_at)
     or new.status=old.status or new.version<>old.version+1
     or new.updated_at<=old.updated_at then
    raise exception 'A transição do vínculo PDF é inválida.' using errcode='55000';
  end if;
  if new.status='removed' and(
       new.removed_at is null or new.removed_course_revision is null
     ) then
    raise exception 'O tombstone do PDF está incompleto.' using errcode='55000';
  end if;
  if new.status='active' then
    if new.removed_at is not null or new.removed_course_revision is not null then
      raise exception 'A reativação precisa limpar o tombstone do PDF.'
        using errcode='55000';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'course-source-pdf-object:'||new.storage_path,0
    ));
    if exists(
      select 1 from private.course_source_pdf_delete_intents intent
      where intent.storage_path=new.storage_path
    ) then
      raise exception 'A remoção física deste PDF ainda está em andamento.'
        using errcode='40001';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_course_source_attachment_lifecycle_v1()
from public,anon,authenticated,service_role;

-- Reaproveita o claim exato já existente. Se um vínculo ativo reapareceu,
-- esse claim cancela o intent e a função continua até encontrar outro ou
-- provar que não resta remoção retomável para a Fonte.
create function public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_source_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_request_id text;
  v_claim jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_source_id is null
     or p_source_id <> btrim(p_source_id)
     or char_length(p_source_id) not between 1 and 240
     or p_source_id ~ '[[:cntrl:]]' then
    raise exception 'Fonte da retomada de remoção de PDF inválida.'
      using errcode = '22023';
  end if;
  loop
    select intent.request_id into v_request_id
    from private.course_source_pdf_delete_intents intent
    where intent.actor_id = p_actor_id
      and intent.course_id = p_course_id
      and intent.source_id = p_source_id
    order by intent.storage_path,intent.created_at,intent.request_id
    limit 1;
    if not found then
      return null;
    end if;
    v_claim := public.claim_course_source_pdf_delete_for_actor_v1(
      p_actor_id,p_course_id,v_request_id
    );
    if v_claim is not null then
      return jsonb_build_object(
        'requestId',v_request_id,
        'storagePath',v_claim->>'storagePath'
      );
    end if;
  end loop;
  return null;
end;
$function$;

comment on function
  public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(
    uuid,uuid,text
  ) is 'Retoma owner-only um intent de remoção física de PDF pela Fonte.';

revoke all on function
  public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(
    uuid,uuid,text
  ) from public,anon,authenticated,service_role;
grant execute on function
  public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(
    uuid,uuid,text
  ) to service_role;

do $advance_course_source_pdf_lifecycle_hardening_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260903025658'::text),
    true
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
$advance_course_source_pdf_lifecycle_hardening_manifest$;

do $course_source_pdf_lifecycle_hardening_postflight$
declare
  v_ingestion_definition text;
  v_guard_definition text;
  v_claim_definition text;
begin
  v_ingestion_definition := pg_get_functiondef(
    'public.ingest_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text)'::regprocedure
  );
  v_guard_definition := pg_get_functiondef(
    'private.guard_course_source_attachment_lifecycle_v1()'::regprocedure
  );
  v_claim_definition := pg_get_functiondef(
    'public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(uuid,uuid,text)'::regprocedure
  );
  if public.get_aralearn_runtime_manifest()->>'schemaRevision'
       <> '20260903025658'
     or strpos(v_ingestion_definition,'course-change-request:') = 0
     or strpos(v_ingestion_definition,'course-row:') = 0
     or strpos(v_ingestion_definition,'for update') = 0
     or strpos(v_ingestion_definition,'v_receipt.result')
       > strpos(v_ingestion_definition,'course-row:')
     or length(v_guard_definition)
       - length(replace(v_guard_definition,'course-source-pdf-object:',''))
       <> 2 * length('course-source-pdf-object:')
     or strpos(v_claim_definition,'claim_course_source_pdf_delete_for_actor_v1') = 0
     or strpos(v_claim_definition,'loop') = 0
     or not has_function_privilege(
       'service_role',
       'public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(uuid,uuid,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(uuid,uuid,text)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(uuid,uuid,text)',
       'execute'
     ) then
    raise exception 'O endurecimento do ciclo de PDF ficou incompleto.'
      using errcode = '55000';
  end if;
end;
$course_source_pdf_lifecycle_hardening_postflight$;

commit;
