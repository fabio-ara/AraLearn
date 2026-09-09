-- The map is read once. Approval binds to that persisted basis and reuses the
-- existing transactional writer, including its completeness checks and receipt.
create function public.get_owned_course_curricular_map_for_actor_v1(p_actor_id uuid, p_course_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare v_read jsonb; v_map jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_read:=public.get_owned_course_instructional_plan_for_actor_v3(p_actor_id,p_course_id);
  v_map:=private.current_course_curricular_map_v1(p_course_id);
  return jsonb_build_object('contract','aralearn.course-curricular-map.v1','courseId',p_course_id,
    'courseRevision',v_read->'courseRevision','planVersion',v_read#>'{plan,version}',
    'map',v_map,'approvalBasis',jsonb_build_object(
      'courseRevision',(v_read->>'courseRevision')::bigint,'planVersion',(v_read#>>'{plan,version}')::bigint,
      'basisHash',encode(extensions.digest(convert_to(v_map::text,'UTF8'),'sha256'),'hex')));
end
$function$;
revoke all on function public.get_owned_course_curricular_map_for_actor_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_owned_course_curricular_map_for_actor_v1(uuid,uuid) to service_role;

-- A receipt read joins the same request lock as the writer. Absence therefore
-- follows resolution of any transaction already holding this attempt's lock.
create function public.get_course_change_receipt_for_actor_v1(p_actor_id uuid,p_course_id uuid,
  p_operation text,p_request_id text,p_request_hash text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare v_receipt private.course_change_receipts%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_operation is null or nullif(btrim(p_operation),'') is null
    or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or p_request_hash is null or p_request_hash!~'^[a-f0-9]{64}$' then
    raise exception 'A tentativa de escrita é inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id
    and request_id=p_request_id and expires_at>statement_timestamp();
  if not found then return jsonb_build_object('status','absent'); end if;
  if v_receipt.course_id is distinct from p_course_id or v_receipt.operation is distinct from p_operation
    or v_receipt.request_hash is distinct from p_request_hash then
    raise exception 'A tentativa pertence a outra alteração.' using errcode='23514';
  end if;
  return jsonb_build_object('status','confirmed','result',v_receipt.result||jsonb_build_object('idempotent',true));
end
$function$;
revoke all on function public.get_course_change_receipt_for_actor_v1(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.get_course_change_receipt_for_actor_v1(uuid,uuid,text,text,text) to service_role;

create function public.get_owned_course_instructional_plan_for_actor_v4(
  p_actor_id uuid, p_course_id uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare v_read jsonb; v_map jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_read:=public.get_owned_course_instructional_plan_for_actor_v3(p_actor_id,p_course_id);
  v_map:=private.current_course_curricular_map_v1(p_course_id);
  return v_read||jsonb_build_object('approvalBasis',jsonb_build_object(
    'courseRevision',(v_read->>'courseRevision')::bigint,
    'planVersion',(v_read#>>'{plan,version}')::bigint,
    'basisHash',encode(extensions.digest(convert_to(v_map::text,'UTF8'),'sha256'),'hex')));
end
$function$;
revoke all on function public.get_owned_course_instructional_plan_for_actor_v4(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_owned_course_instructional_plan_for_actor_v4(uuid,uuid) to service_role;

create function public.approve_course_curricular_map_for_actor_v1(
  p_actor_id uuid, p_course_id uuid, p_expected_course_revision bigint,
  p_expected_plan_version bigint, p_expected_basis_hash text,
  p_request_id text, p_request_hash text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare v_map jsonb; v_receipt private.course_change_receipts%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_basis_hash is null or p_expected_basis_hash!~'^[a-f0-9]{64}$'
    or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or p_request_hash is null or p_request_hash!~'^[a-f0-9]{64}$' then
    raise exception 'A referência do mapa inspecionado é inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts
    where actor_id=p_actor_id and request_id=p_request_id and expires_at>statement_timestamp();
  if found then
    if v_receipt.operation<>'save_course_curricular_map_v1' or v_receipt.course_id<>p_course_id
      or v_receipt.request_hash<>p_request_hash then
      raise exception 'A tentativa pertence a outra alteração.' using errcode='23514';
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform 1 from public.courses where id=p_course_id for update;
  v_map:=private.current_course_curricular_map_v1(p_course_id);
  if encode(extensions.digest(convert_to(v_map::text,'UTF8'),'sha256'),'hex') is distinct from p_expected_basis_hash then
    raise exception 'O mapa mudou desde a inspeção. Leia as alterações antes de aprovar.' using errcode='40001';
  end if;
  return public.save_course_curricular_map_for_actor_v1(p_actor_id,p_course_id,
    p_expected_course_revision,p_expected_plan_version,true,v_map,p_request_id,p_request_hash);
end
$function$;
revoke all on function public.approve_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.approve_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,text,text,text) to service_role;
