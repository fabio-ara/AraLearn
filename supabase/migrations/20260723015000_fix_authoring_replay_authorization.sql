-- Autoriza o destino do replay antes de comparar o hash. Isso preserva a
-- idempotência depois da compactação sem revelar se outro corpo reutilizou um
-- requestId pertencente a uma família de autoria não autorizada.
create or replace function public.replay_authoring_command_dispatch(
  p_actor_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_api_request_hash text,
  p_required_scope text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_hash text;
  v_result jsonb;
  v_target text;
  v_scope text;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_api_request_hash !~ '^[a-f0-9]{64}$'
     or p_required_scope not in (
       'authoring:write', 'authoring:audit', 'catalog:publish'
     ) then
    raise exception 'Consulta idempotente inválida.' using errcode = '22023';
  end if;

  select
    event.api_request_hash,
    event.result,
    run.publication_target
  into v_hash, v_result, v_target
  from private.authoring_command_events event
  left join private.authoring_runs run on run.id = event.run_id
  where event.actor_user_id = p_actor_id
    and event.request_id = p_request_id;

  if not found or v_target is null then
    select
      receipt.api_request_hash,
      receipt.result,
      receipt.publication_target
    into v_hash, v_result, v_target
    from private.authoring_command_receipts receipt
    where receipt.actor_user_id = p_actor_id
      and receipt.request_id = p_request_id;
  end if;

  if not found then return null; end if;

  if v_target = 'catalog' then
    return public.replay_authoring_command(
      p_actor_id,
      p_client_id,
      p_request_id,
      p_api_request_hash,
      p_required_scope
    );
  end if;
  if v_target <> 'private' then
    raise exception 'Destino do replay de autoria inválido.' using errcode = '22023';
  end if;

  v_scope := case p_required_scope
    when 'authoring:write' then 'authoring:private:write'
    when 'authoring:audit' then 'authoring:private:audit'
    else null
  end;
  if v_scope is null
     or not private.user_can_use_authoring_scope(p_actor_id, v_scope)
     or not private.authoring_client_has_scope(
       p_client_id,
       p_actor_id,
       v_scope
     ) then
    raise exception 'Autorização atual insuficiente para recuperar a resposta.'
      using errcode = '42501';
  end if;

  if v_hash is null then return null; end if;
  if v_hash <> p_api_request_hash then
    raise exception 'requestId reutilizado com conteúdo diferente.'
      using errcode = '22023';
  end if;
  return v_result || jsonb_build_object('idempotent', true);
end;
$$;

revoke all on function public.replay_authoring_command_dispatch(
  uuid, uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.replay_authoring_command_dispatch(
  uuid, uuid, text, text, text
) to service_role;
