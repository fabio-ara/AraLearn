begin;

-- One protected report per existing content object. A report is semantic judgment
-- supplied by the connected producer; hashes only bind it to what was read.
alter table private.course_entities add column ai_inspection jsonb;

create function private.course_ai_inspection_basis_hash_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns text language sql stable security definer set search_path=pg_catalog as $function$
  select case when private.course_content_basis_hash_v1(p_course_id,p_target_kind,p_target_id) is not null
    then private.course_source_json_hash_v1(jsonb_build_object(
      'contentBasis',private.course_content_basis_hash_v1(p_course_id,p_target_kind,p_target_id),
      'bibliographyStyle',case when exists(select 1 from private.course_source_attributions a
        join private.course_source_attribution_sources l on l.course_id=a.course_id and l.attribution_id=a.id
        where a.course_id=p_course_id and a.target_kind=p_target_kind and a.target_id=p_target_id)
        then (select bibliography_style from public.courses where id=p_course_id) end)) end
$function$;

-- Preserve legacy readability without fabricating a prior inspection. A material
-- change after this baseline makes exactly this object pending at its next read.
update private.course_entities e set ai_inspection=jsonb_build_object('legacyBasisHash',
  private.course_ai_inspection_basis_hash_v1(e.course_id,case when e.entity_type='study_unit'
    then 'study_unit' else 'microsequence_explanation' end,e.entity_id))
where e.entity_type in('study_unit','microsequence');

create function private.guard_course_ai_inspection_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $function$
begin
  if new.content ?| array['aiInspection','ai_inspection','inspectionReport','inspectedBasisHash'] then
    raise exception 'Inspeção não pertence ao conteúdo editável.' using errcode='42501'; end if;
  if tg_op='INSERT' then
    if new.ai_inspection is not null then raise exception 'Inspeção não pode ser importada.' using errcode='42501'; end if;
    if new.entity_type in('microsequence','study_unit') then new.ai_inspection:='{}'::jsonb; end if;
  elsif new.ai_inspection is distinct from old.ai_inspection and
    current_setting('aralearn.ai_inspection_write',true) is distinct from 'semantic-inspection-command' then
    raise exception 'Parecer de inspeção protegido.' using errcode='42501';
  end if;
  return new;
end $function$;
create trigger course_ai_inspection_guard before insert or update on private.course_entities
  for each row execute function private.guard_course_ai_inspection_v1();

create function private.course_ai_inspection_state_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  select jsonb_build_object('state',case
    when e.ai_inspection->>'basisHash'=b.hash then 'current'
    when e.ai_inspection->>'legacyBasisHash'=b.hash then 'unregistered' else 'pending' end,'basisHash',b.hash)
    ||case when e.ai_inspection->>'basisHash'=b.hash then jsonb_build_object(
      'inspectedAt',e.ai_inspection->'inspectedAt','report',e.ai_inspection->'report') else '{}'::jsonb end
  from private.course_entities e cross join lateral (select
    private.course_ai_inspection_basis_hash_v1(p_course_id,p_target_kind,p_target_id) hash) b
  where e.course_id=p_course_id and e.entity_id=p_target_id and e.entity_type=case p_target_kind
    when 'study_unit' then 'study_unit' when 'microsequence_explanation' then 'microsequence' end
$function$;

create function private.course_ai_inspection_pending_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns boolean language sql stable security definer set search_path=pg_catalog as $function$
  select coalesce(private.course_ai_inspection_state_v1(p_course_id,p_target_kind,p_target_id)->>'state'='pending',false)
$function$;

create function private.course_ai_inspection_payload_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
declare state jsonb; revision bigint;
begin
  state:=private.course_ai_inspection_state_v1(p_course_id,p_target_kind,p_target_id);
  if state is null then raise exception 'Objeto de inspeção não encontrado.' using errcode='22023'; end if;
  select c.revision into revision from public.courses c where c.id=p_course_id;
  return jsonb_build_object('contract','aralearn.course-ai-inspection.v1','courseId',p_course_id,
    'courseRevision',revision,'targetKind',p_target_kind,'targetId',p_target_id,'basisHash',state->'basisHash','inspection',state);
end $function$;

create function private.valid_course_ai_inspection_report_v1(p_report jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $function$
  select case when jsonb_typeof(p_report)='object' and p_report ?& array['summary','outcome','findings']
    and p_report-array['summary','outcome','findings']='{}'::jsonb
    and jsonb_typeof(p_report->'summary')='string' and char_length(btrim(p_report->>'summary')) between 1 and 2000
    and p_report->>'summary' !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
    and p_report->>'outcome' in('consistent','needs_attention','human_preference_retained')
    and jsonb_typeof(p_report->'findings')='array' then
      jsonb_array_length(p_report->'findings')<=20 and
      (p_report->>'outcome'<>'needs_attention' or jsonb_array_length(p_report->'findings')>0) and
      (p_report->>'outcome'<>'consistent' or jsonb_array_length(p_report->'findings')=0) and
      not exists(select 1 from jsonb_array_elements(p_report->'findings') item where jsonb_typeof(item)<>'string'
        or char_length(btrim(item#>>'{}')) not between 1 and 1000 or item#>>'{}' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
    else false end
$function$;

create function private.record_course_ai_inspection_v1(p_actor_id uuid,p_course_id uuid,p_target_kind text,
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
    return receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform 1 from public.courses where id=p_course_id for update;
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  payload:=private.course_ai_inspection_payload_v1(p_course_id,p_target_kind,p_target_id);
  if payload->>'basisHash'<>p_expected_basis_hash then
    raise exception 'O conteúdo ou as fontes mudaram; reinspecione a versão vigente.' using errcode='PT409'; end if;
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
  payload:=private.course_ai_inspection_payload_v1(p_course_id,p_target_kind,p_target_id)||jsonb_build_object(
    'contract','aralearn.course-ai-inspection-change.v1','changed',changed,'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,'record_ai_inspection',p_course_id,hash,payload);
  return payload;
end $function$;

do $receipt_operation$
declare constraint_row record;
begin
  for constraint_row in select conname,pg_get_expr(conbin,conrelid) expression from pg_constraint
    where conrelid='private.course_change_receipts'::regclass and contype='c'
      and conname like 'course_change_receipts_operation_%' loop
    execute format('alter table private.course_change_receipts drop constraint %I',constraint_row.conname);
    execute format('alter table private.course_change_receipts add constraint %I check((%s) or operation=''record_ai_inspection'')',
      constraint_row.conname,constraint_row.expression);
  end loop;
end $receipt_operation$;

create function public.get_course_ai_inspection_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
begin
  perform private.require_service_role(); perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  return private.course_ai_inspection_payload_v1(p_course_id,p_target_kind,p_target_id);
end $function$;
create function public.record_course_ai_inspection_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_target_kind text,
  p_target_id text,p_expected_basis_hash text,p_report jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
begin
  perform private.require_service_role();
  return private.record_course_ai_inspection_v1(p_actor_id,p_course_id,p_target_kind,p_target_id,p_expected_basis_hash,p_report,p_request_id);
end $function$;
create function public.get_course_ai_inspection_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
begin
  perform private.require_course_review_session_v1(p_course_id);
  return private.course_ai_inspection_payload_v1(p_course_id,p_target_kind,p_target_id);
end $function$;

revoke all on function private.course_ai_inspection_basis_hash_v1(uuid,text,text),private.guard_course_ai_inspection_v1(),
  private.course_ai_inspection_state_v1(uuid,text,text),private.course_ai_inspection_pending_v1(uuid,text,text),
  private.course_ai_inspection_payload_v1(uuid,text,text),private.valid_course_ai_inspection_report_v1(jsonb),
  private.record_course_ai_inspection_v1(uuid,uuid,text,text,text,jsonb,text),
  public.get_course_ai_inspection_for_actor_v1(uuid,uuid,text,text),
  public.record_course_ai_inspection_for_actor_v1(uuid,uuid,text,text,text,jsonb,text),
  public.get_course_ai_inspection_v1(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_course_ai_inspection_for_actor_v1(uuid,uuid,text,text),
  public.record_course_ai_inspection_for_actor_v1(uuid,uuid,text,text,text,jsonb,text) to service_role;
grant execute on function public.get_course_ai_inspection_v1(uuid,text,text) to authenticated;

commit;
