-- A cota visível acompanha vínculos ativos, mas a reserva interna também
-- precisa cercar objetos físicos ainda sem vínculo para impedir bytes órfãos.
begin;

do $preserve_unlinked_source_pdf_quota_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260831005116'
     or to_regprocedure('private.course_source_pdf_reserved_bytes_v1(uuid)') is null
     or to_regclass('storage.objects') is null then
    raise exception 'O runtime de acesso PDF não corresponde ao esperado.'
      using errcode = '55000';
  end if;
end;
$preserve_unlinked_source_pdf_quota_preflight$;

create or replace function private.course_source_pdf_reserved_bytes_v1(
  p_course_id uuid
)
returns bigint
language sql
stable
security invoker
set search_path = pg_catalog,private,storage
as $function$
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
  ), unique_reservation as(
    select reservation.content_hash,max(reservation.byte_size) byte_size
    from reservation
    group by reservation.content_hash
  )
  select coalesce(sum(unique_reservation.byte_size),0)::bigint
  from unique_reservation
$function$;

revoke all on function private.course_source_pdf_reserved_bytes_v1(uuid)
from public,anon,authenticated,service_role;

comment on function private.course_source_pdf_reserved_bytes_v1(uuid) is
  'Bytes reservados por hash: vínculos ativos, objetos físicos no prefixo do Curso e intents vivos.';

do $preserve_unlinked_source_pdf_quota_contract$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef(
    'private.course_source_pdf_reserved_bytes_v1(uuid)'::regprocedure
  );
  if strpos(v_definition,'attachment.status=''active''')=0
     or strpos(v_definition,'storage.objects')=0
     or strpos(v_definition,'course_source_pdf_upload_intents')=0 then
    raise exception 'A reserva interna de PDF não preservou todos os estados necessários.'
      using errcode = '55000';
  end if;
end;
$preserve_unlinked_source_pdf_quota_contract$;

do $advance_unlinked_source_pdf_quota_manifest$
declare v_manifest jsonb; v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  v_manifest:=jsonb_set(v_manifest,'{schemaRevision}',
    to_jsonb('20260831012600'::text));
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format('create or replace function public.get_aralearn_runtime_manifest() '
    ||'returns jsonb language sql stable security definer '
    ||'set search_path = pg_catalog as %L',v_body);
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_unlinked_source_pdf_quota_manifest$;

commit;
