begin;

-- O gateway de autoria usa a service role; estas fachadas estreitas recolocam
-- a identidade do responsável somente depois de validar conta, cliente e escopo.
create table private.catalog_submission_authoring_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references private.authoring_api_clients(id) on delete cascade,
  request_id text not null,
  operation text not null check (operation in ('submit', 'withdraw', 'start_review', 'decide')),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 65536),
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id),
  constraint catalog_submission_authoring_receipts_request_id check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  )
);

create index catalog_submission_authoring_receipts_created_idx
  on private.catalog_submission_authoring_receipts(created_at, actor_user_id, request_id);

create or replace function private.require_catalog_submission_authoring_client(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_scope text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
begin
  perform private.require_service_role();
  if p_actor_user_id is null
     or p_client_id is null
     or p_scope not in ('authoring:private:read', 'authoring:private:write', 'catalog:publish')
     or not private.user_can_use_authoring_scope(p_actor_user_id, p_scope)
     or not private.authoring_client_has_scope(p_client_id, p_actor_user_id, p_scope) then
    raise exception 'Integração de ofertas ao catálogo não autorizada.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.begin_catalog_submission_authoring_command(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_operation text,
  p_payload jsonb,
  p_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
declare
  v_receipt private.catalog_submission_authoring_receipts%rowtype;
  v_request_hash text;
begin
  perform private.require_catalog_submission_authoring_client(p_actor_user_id, p_client_id, p_scope);
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation not in ('submit', 'withdraw', 'start_review', 'decide')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Comando de oferta ao catálogo inválido.' using errcode = '22023';
  end if;
  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', p_operation, 'payload', p_payload
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    p_actor_user_id::text || ':catalog-submission:' || p_request_id, 0
  ));
  select * into v_receipt from private.catalog_submission_authoring_receipts receipt
  where receipt.actor_user_id = p_actor_user_id and receipt.request_id = p_request_id
  for share;
  if found then
    if v_receipt.operation <> p_operation or v_receipt.request_hash <> v_request_hash then
      raise exception 'requestId já foi usado com outro comando de oferta ao catálogo.' using errcode = 'CS409';
    end if;
    return jsonb_build_object('replayed', true, 'requestHash', v_request_hash, 'result', v_receipt.result);
  end if;
  return jsonb_build_object('replayed', false, 'requestHash', v_request_hash);
end;
$$;

create or replace function private.complete_catalog_submission_authoring_command(
  p_actor_user_id uuid, p_client_id uuid, p_request_id text,
  p_operation text, p_request_hash text, p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'Resultado de oferta ao catálogo inválido.' using errcode = '22023';
  end if;
  insert into private.catalog_submission_authoring_receipts(
    actor_user_id, client_id, request_id, operation, request_hash, result
  ) values (p_actor_user_id, p_client_id, p_request_id, p_operation, p_request_hash, p_result);
end;
$$;

create or replace function public.list_catalog_submission_candidates_authoring(p_actor_user_id uuid, p_client_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private
as $$ begin
  perform private.require_catalog_submission_authoring_client(p_actor_user_id, p_client_id, 'authoring:private:read');
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  return public.list_my_catalog_submission_candidates();
end; $$;

create or replace function public.list_my_catalog_submissions_authoring(p_actor_user_id uuid, p_client_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private
as $$ begin
  perform private.require_catalog_submission_authoring_client(p_actor_user_id, p_client_id, 'authoring:private:read');
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  return public.list_my_catalog_submissions();
end; $$;

create or replace function public.list_catalog_submission_queue_authoring(p_actor_user_id uuid, p_client_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $$ begin
  perform private.require_catalog_submission_authoring_client(p_actor_user_id, p_client_id, 'catalog:publish');
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  return public.list_catalog_submission_queue();
end; $$;

create or replace function public.submit_personal_course_to_catalog_authoring(
  p_actor_user_id uuid, p_client_id uuid, p_request_id text, p_submission_id uuid,
  p_course_id uuid, p_consent boolean, p_license_code text, p_attribution_text text, p_provenance_text text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $$ declare v_begin jsonb; v_result jsonb; begin
  v_begin := private.begin_catalog_submission_authoring_command(p_actor_user_id,p_client_id,p_request_id,'submit',jsonb_build_object('submissionId',p_submission_id,'courseId',p_course_id,'consent',p_consent,'licenseCode',p_license_code,'attribution',p_attribution_text,'provenance',p_provenance_text),'authoring:private:write');
  if (v_begin->>'replayed')::boolean then return (v_begin->'result') || jsonb_build_object('idempotent',true); end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  v_result := public.submit_personal_course_to_catalog(p_submission_id,p_course_id,p_consent,p_license_code,p_attribution_text,p_provenance_text);
  perform private.complete_catalog_submission_authoring_command(p_actor_user_id,p_client_id,p_request_id,'submit',v_begin->>'requestHash',v_result);
  return v_result;
end; $$;

create or replace function public.withdraw_catalog_submission_authoring(
  p_actor_user_id uuid, p_client_id uuid, p_request_id text, p_submission_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $$ declare v_begin jsonb; v_result jsonb; begin
  v_begin := private.begin_catalog_submission_authoring_command(p_actor_user_id,p_client_id,p_request_id,'withdraw',jsonb_build_object('submissionId',p_submission_id),'authoring:private:write');
  if (v_begin->>'replayed')::boolean then return (v_begin->'result') || jsonb_build_object('idempotent',true); end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  v_result := public.withdraw_catalog_submission(p_submission_id);
  perform private.complete_catalog_submission_authoring_command(p_actor_user_id,p_client_id,p_request_id,'withdraw',v_begin->>'requestHash',v_result);
  return v_result;
end; $$;

create or replace function public.start_catalog_submission_review_authoring(
  p_actor_user_id uuid, p_client_id uuid, p_request_id text, p_submission_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $$ declare v_begin jsonb; v_result jsonb; begin
  v_begin := private.begin_catalog_submission_authoring_command(p_actor_user_id,p_client_id,p_request_id,'start_review',jsonb_build_object('submissionId',p_submission_id),'catalog:publish');
  if (v_begin->>'replayed')::boolean then return (v_begin->'result') || jsonb_build_object('idempotent',true); end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  v_result := public.start_catalog_submission_review(p_submission_id);
  perform private.complete_catalog_submission_authoring_command(p_actor_user_id,p_client_id,p_request_id,'start_review',v_begin->>'requestHash',v_result);
  return v_result;
end; $$;

create or replace function public.decide_catalog_submission_authoring(
  p_actor_user_id uuid, p_client_id uuid, p_request_id text, p_submission_id uuid,
  p_decision text, p_collection_id uuid default null, p_official_contract_key text default null, p_note text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $$ declare v_begin jsonb; v_result jsonb; begin
  v_begin := private.begin_catalog_submission_authoring_command(p_actor_user_id,p_client_id,p_request_id,'decide',jsonb_strip_nulls(jsonb_build_object('submissionId',p_submission_id,'decision',p_decision,'collectionId',p_collection_id,'contractKey',p_official_contract_key,'note',p_note)),'catalog:publish');
  if (v_begin->>'replayed')::boolean then return (v_begin->'result') || jsonb_build_object('idempotent',true); end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  v_result := public.decide_catalog_submission(p_submission_id,p_decision,p_collection_id,p_official_contract_key,p_note);
  perform private.complete_catalog_submission_authoring_command(p_actor_user_id,p_client_id,p_request_id,'decide',v_begin->>'requestHash',v_result);
  return v_result;
end; $$;

revoke all on table private.catalog_submission_authoring_receipts from public, anon, authenticated, service_role;
revoke all on function private.require_catalog_submission_authoring_client(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.begin_catalog_submission_authoring_command(uuid,uuid,text,text,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function private.complete_catalog_submission_authoring_command(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.list_catalog_submission_candidates_authoring(uuid,uuid) from public, anon, authenticated;
revoke all on function public.list_my_catalog_submissions_authoring(uuid,uuid) from public, anon, authenticated;
revoke all on function public.list_catalog_submission_queue_authoring(uuid,uuid) from public, anon, authenticated;
revoke all on function public.submit_personal_course_to_catalog_authoring(uuid,uuid,text,uuid,uuid,boolean,text,text,text) from public, anon, authenticated;
revoke all on function public.withdraw_catalog_submission_authoring(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.start_catalog_submission_review_authoring(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.decide_catalog_submission_authoring(uuid,uuid,text,uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.list_catalog_submission_candidates_authoring(uuid,uuid) to service_role;
grant execute on function public.list_my_catalog_submissions_authoring(uuid,uuid) to service_role;
grant execute on function public.list_catalog_submission_queue_authoring(uuid,uuid) to service_role;
grant execute on function public.submit_personal_course_to_catalog_authoring(uuid,uuid,text,uuid,uuid,boolean,text,text,text) to service_role;
grant execute on function public.withdraw_catalog_submission_authoring(uuid,uuid,text,uuid) to service_role;
grant execute on function public.start_catalog_submission_review_authoring(uuid,uuid,text,uuid) to service_role;
grant execute on function public.decide_catalog_submission_authoring(uuid,uuid,text,uuid,text,uuid,text,text) to service_role;

commit;
