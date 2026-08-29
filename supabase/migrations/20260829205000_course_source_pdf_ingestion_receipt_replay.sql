-- Recupera uma ingestão já confirmada quando a URL temporária do arquivo expira.
-- O recibo composto reutiliza a infraestrutura idempotente existente e nunca
-- concede acesso ao objeto: a API ainda verifica ownership e o PDF privado.
begin;

do $course_source_pdf_receipt_replay_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260829043629'
     or to_regclass('private.course_change_receipts') is null
     or to_regprocedure(
       'public.ingest_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'private.valid_course_source_pdf_ingestion_intent_v1(jsonb)'
     ) is null
     or to_regprocedure('private.course_source_json_hash_v1(jsonb)') is null then
    raise exception 'Dependências do replay de ingestão de PDF ausentes.'
      using errcode = '55000';
  end if;
end;
$course_source_pdf_receipt_replay_preflight$;

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v9,
  add constraint course_change_receipts_operation_v10 check(operation in(
    'create_course','commit_course_composition','commit_instructional_plan',
    'advance_authoring_part_materialization','apply_course_design_command',
    'execute_course_source_command','grant_access','revoke_access',
    'update_audit_cycle','create_course_variants','detach_course_variant',
    'commit_personal_course_copy_edit','create_inspection_focus',
    'ingest_course_source_pdf'
  ));

alter function public.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
) set schema private;

alter function private.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
) rename to ingest_course_source_pdf_core_v1;

revoke all on function private.ingest_course_source_pdf_core_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
) from public,anon,authenticated,service_role;

create function private.valid_course_source_pdf_file_identity_v1(p_value jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_value - 'fileId' - 'fileName' - 'mediaType' = '{}'::jsonb
    and p_value ?& array['fileId','fileName','mediaType']
    and jsonb_typeof(p_value->'fileId') = 'string'
    and length(btrim(p_value->>'fileId')) between 1 and 240
    and p_value->>'fileId' !~ '[[:cntrl:]]'
    and (
      jsonb_typeof(p_value->'fileName') = 'null'
      or jsonb_typeof(p_value->'fileName') = 'string'
        and length(btrim(p_value->>'fileName')) between 1 and 500
        and p_value->>'fileName' !~ '[[:cntrl:]]'
    )
    and (
      jsonb_typeof(p_value->'mediaType') = 'null'
      or p_value->>'mediaType' = 'application/pdf'
    ),
    false
  );
$function$;

revoke all on function private.valid_course_source_pdf_file_identity_v1(jsonb)
  from public,anon,authenticated,service_role;

create function public.ingest_course_source_pdf_for_actor_v1(
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
       or v_receipt.result->>'_ingestionContextHash' is distinct from v_context_hash then
      raise exception 'requestId reutilizado com ingestão de PDF incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - '_ingestionContextHash' - 'idempotent')
      || jsonb_build_object('idempotent',true);
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

create function public.get_course_source_pdf_ingestion_receipt_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_source_intent jsonb,
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
  v_context_hash text;
  v_receipt private.course_change_receipts%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or not private.valid_course_source_pdf_ingestion_intent_v1(p_source_intent)
     or not private.valid_course_source_pdf_file_identity_v1(p_file_identity)
     or p_channel not in('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Consulta de recibo de ingestão PDF inválida.'
      using errcode = '22023';
  end if;
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
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id;
  if not found then
    return null;
  end if;
  if v_receipt.operation <> 'ingest_course_source_pdf'
     or v_receipt.course_id <> p_course_id
     or v_receipt.result->>'_ingestionContextHash' is distinct from v_context_hash then
    raise exception 'requestId reutilizado com ingestão de PDF incompatível.'
      using errcode = '23514';
  end if;
  return (v_receipt.result - '_ingestionContextHash' - 'idempotent')
    || jsonb_build_object('idempotent',true);
end;
$function$;

comment on function public.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text
) is 'Ingere PDF de Fonte e conserva um recibo composto para replay sem a URL temporária.';

comment on function public.get_course_source_pdf_ingestion_receipt_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
) is 'Recupera owner-only uma ingestão já confirmada após falha do transporte temporário.';

revoke all on function public.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text
), public.get_course_source_pdf_ingestion_receipt_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
) from public,anon,authenticated,service_role;

grant execute on function public.ingest_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text
), public.get_course_source_pdf_ingestion_receipt_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
) to service_role;

do $advance_course_source_pdf_receipt_replay_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if not (v_manifest->'features' ? 'course-source-pdf-ingestion-receipt-v1') then
    v_manifest := jsonb_set(
      v_manifest,'{features}',
      (v_manifest->'features')
        || to_jsonb('course-source-pdf-ingestion-receipt-v1'::text)
    );
  end if;
  v_manifest := jsonb_set(
    v_manifest,'{schemaRevision}',to_jsonb('20260829205000'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_course_source_pdf_receipt_replay_manifest$;

do $course_source_pdf_receipt_replay_postflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260829205000'
     or not (public.get_aralearn_runtime_manifest()->'features'
       @> '["course-source-pdf-ingestion-receipt-v1"]'::jsonb)
     or to_regprocedure(
       'private.ingest_course_source_pdf_core_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'private.valid_course_source_pdf_file_identity_v1(jsonb)'
     ) is null
     or to_regprocedure(
       'public.ingest_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.get_course_source_pdf_ingestion_receipt_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)'
     ) is null
     or not has_function_privilege(
       'service_role',
       'public.get_course_source_pdf_ingestion_receipt_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.get_course_source_pdf_ingestion_receipt_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)',
       'execute'
     ) then
    raise exception 'O replay seguro de ingestão de PDF não foi instalado.'
      using errcode = '55000';
  end if;
end;
$course_source_pdf_receipt_replay_postflight$;

commit;
