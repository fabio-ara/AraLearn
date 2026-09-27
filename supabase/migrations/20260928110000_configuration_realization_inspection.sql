-- CLI-created migration; identifier follows the already published migration order.
-- Historical reports remain valid reads; only exact receipts can replay old writes.
-- No content/backfill, receipt size increase, or new stored basis.
begin;

create or replace function private.valid_course_ai_inspection_report_v1(p_report jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $function$
declare item jsonb; check_item jsonb; quote jsonb; dimensions text[] := '{}';
begin
  if jsonb_typeof(p_report) is distinct from 'object' or
    not p_report ?& array['summary','outcome','findings'] or
    p_report-array['summary','outcome','findings','checks']<>'{}'::jsonb or
    jsonb_typeof(p_report->'summary') is distinct from 'string' or
    char_length(btrim(p_report->>'summary')) not between 1 and 2000 or
    p_report->>'summary' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or
    jsonb_typeof(p_report->'outcome') is distinct from 'string' or
    p_report->>'outcome' not in('consistent','needs_attention','human_preference_retained') or
    jsonb_typeof(p_report->'findings') is distinct from 'array' or
    (p_report ? 'checks' and jsonb_typeof(p_report->'checks') is distinct from 'array') then return false; end if;
  if jsonb_array_length(p_report->'findings')>20 or (p_report ? 'checks' and jsonb_array_length(p_report->'checks') not in(5,6)) or
    p_report->>'outcome'='needs_attention' and jsonb_array_length(p_report->'findings')=0 or
    p_report->>'outcome'='consistent' and jsonb_array_length(p_report->'findings')<>0 then return false; end if;
  for item in select value from jsonb_array_elements(p_report->'findings') loop
    if jsonb_typeof(item)<>'string' or char_length(btrim(item#>>'{}')) not between 1 and 1000 or
      item#>>'{}' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then return false; end if;
  end loop;
  if not (p_report ? 'checks') then return true; end if;
  for check_item in select value from jsonb_array_elements(p_report->'checks') loop
    if jsonb_typeof(check_item)<>'object' or not check_item ?& array['dimension','result','reason','evidence'] or
      check_item-array['dimension','result','reason','evidence']<>'{}'::jsonb or
      jsonb_typeof(check_item->'dimension') is distinct from 'string' or
      check_item->>'dimension' not in('alignment','evidence','representation','feedback','sufficiency','configuration') or
      check_item->>'dimension'=any(dimensions) or
      jsonb_typeof(check_item->'result') is distinct from 'string' or
      check_item->>'result' not in('sufficient','insufficient','not_applicable') or
      jsonb_typeof(check_item->'reason')<>'string' or char_length(btrim(check_item->>'reason')) not between 1 and 1000 or
      check_item->>'reason' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or
      jsonb_typeof(check_item->'evidence') is distinct from 'array' then return false; end if;
    if check_item->>'result'='insufficient' and p_report->>'outcome'<>'needs_attention' or
      jsonb_array_length(check_item->'evidence') not between 1 and 6 then return false; end if;
    for quote in select value from jsonb_array_elements(check_item->'evidence') loop
      if jsonb_typeof(quote)<>'string' or char_length(btrim(quote#>>'{}')) not between 1 and 500 or
        quote#>>'{}' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then return false; end if;
    end loop;
    dimensions:=array_append(dimensions,check_item->>'dimension');
  end loop;
  return cardinality(dimensions)=6 or not ('configuration'=any(dimensions));
end $function$;

create or replace function private.complete_course_ai_inspection_report_v1(p_report jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $function$
  select case when private.valid_course_ai_inspection_report_v1(p_report)
    then coalesce(jsonb_array_length(p_report->'checks')=6,false) else false end
$function$;

create or replace function private.course_ai_inspection_pending_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns boolean language sql stable security definer set search_path=pg_catalog as $function$
  select coalesce(s->>'state'<>'current' or s#>>'{report,outcome}'<>'consistent'
    or not private.complete_course_ai_inspection_report_v1(s->'report'),true)
  from (select private.course_ai_inspection_state_v1(p_course_id,p_target_kind,p_target_id) s) state
$function$;
revoke all on function private.complete_course_ai_inspection_report_v1(jsonb),
  private.valid_course_ai_inspection_report_v1(jsonb),private.course_ai_inspection_pending_v1(uuid,text,text)
  from public,anon,authenticated,service_role;


create or replace function public.get_course_ai_inspection_receipt_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_target_kind text,
  p_target_id text,p_expected_basis_hash text,p_report jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare hash text; receipt private.course_change_receipts%rowtype;
begin
  perform private.require_service_role();
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
  return null;
end
$function$;
revoke all on function public.get_course_ai_inspection_receipt_for_actor_v1(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.get_course_ai_inspection_receipt_for_actor_v1(uuid,uuid,text,text,text,jsonb,text) to service_role;


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
  if not private.complete_course_ai_inspection_report_v1(p_report) then
    raise exception 'Novos pareceres exigem as seis dimensões, incluindo configuration.' using errcode='22023'; end if;
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

do $manifest$ declare manifest jsonb; begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260928110000',
    'features',(select jsonb_agg(value order by value collate "C") from jsonb_array_elements_text(
      (public.get_aralearn_runtime_manifest()->'features')||'["configuration-realization-inspection-v1"]'::jsonb)));
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;

commit;
