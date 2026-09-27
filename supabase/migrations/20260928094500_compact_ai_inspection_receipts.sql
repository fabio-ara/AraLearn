-- Inspection reads retain the complete pedagogical basis. Command receipts keep
-- only the original result metadata: both that basis and a valid Unicode report
-- can exceed the shared 64 KiB receipt limit independently.
begin;

create or replace function private.record_course_ai_inspection_v1(p_actor_id uuid,p_course_id uuid,p_target_kind text,
  p_target_id text,p_expected_basis_hash text,p_report jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare hash text; receipt private.course_change_receipts%rowtype; payload jsonb; previous jsonb;
  setting text; changed boolean;
begin
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_basis_hash is null or p_expected_basis_hash !~ '^[a-f0-9]{64}$'
    or not coalesce(private.valid_course_ai_inspection_report_v1(p_report),false)
    or p_request_id is null or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Parecer de inspeção inválido.' using errcode='22023'; end if;
  hash:=private.course_source_json_hash_v1(jsonb_build_object('targetKind',p_target_kind,'targetId',p_target_id,
    'basisHash',p_expected_basis_hash,'report',p_report));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if receipt.operation<>'record_ai_inspection' or receipt.course_id<>p_course_id or receipt.request_hash<>hash then
      raise exception 'Identidade de inspeção incompatível.' using errcode='23514'; end if;
    -- The request hash binds this exact report. Rebuild the original
    -- response without consulting a newer report/base on the mutable target.
    -- This also preserves the fields of receipts created before this migration.
    return jsonb_set(receipt.result,'{inspection,report}',p_report)||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform 1 from public.courses where id=p_course_id for update;
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  payload:=private.course_ai_inspection_payload_v1(p_course_id,p_target_kind,p_target_id);
  if payload->>'basisHash'<>p_expected_basis_hash then
    raise exception 'O conteúdo ou as fontes mudaram; reinspecione a versão vigente.' using errcode='PT409'; end if;
  if not private.course_pedagogical_report_grounded_v1(p_report,payload->'pedagogicalBasis') then
    raise exception 'O parecer precisa citar trechos da base pedagógica lida.' using errcode='22023';
  end if;
  select ai_inspection into previous from private.course_entities where course_id=p_course_id and entity_id=p_target_id
    and entity_type=case when p_target_kind='study_unit' then 'study_unit' else 'microsequence' end for update;
  changed:=previous->>'basisHash' is distinct from p_expected_basis_hash or previous->'report' is distinct from p_report;
  if changed then
    setting:=coalesce(current_setting('aralearn.ai_inspection_write',true),'');
    perform set_config('aralearn.ai_inspection_write','semantic-inspection-command',true);
    update private.course_entities set ai_inspection=jsonb_build_object('basisHash',p_expected_basis_hash,
      'inspectedAt',statement_timestamp(),'inspectedBy',p_actor_id,'report',p_report)
      where course_id=p_course_id and entity_id=p_target_id
        and entity_type=case when p_target_kind='study_unit' then 'study_unit' else 'microsequence' end;
    perform set_config('aralearn.ai_inspection_write',setting,true);
    update public.courses set revision=revision+1,updated_at=clock_timestamp() where id=p_course_id;
  end if;
  payload:=(private.course_ai_inspection_payload_v1(p_course_id,p_target_kind,p_target_id)-'pedagogicalBasis')||jsonb_build_object(
    'contract','aralearn.course-ai-inspection-change.v1','changed',changed,'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,'record_ai_inspection',p_course_id,hash,payload#-'{inspection,report}');
  return payload;
end
$function$;

commit;
