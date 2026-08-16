begin;

select pg_advisory_xact_lock(
  hashtextextended('aralearn-preserve-authoring-fragment', 0)
);

-- O contrato v3 compilado continua sendo a representação auditada e
-- materializada. A fonte formal permanece privada, na mesma linha e tentativa,
-- para que reparos futuros não precisem reconstruir marcadores ou identificadores.
alter table private.authoring_parts
  add column authoring_fragment jsonb,
  add column authoring_fragment_hash text;

create or replace function private.authoring_fragments_have_stable_identity(
  p_authoring_fragment jsonb,
  p_compiled_fragment jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_authoring_microsequence jsonb;
  v_compiled_microsequence jsonb;
  v_authoring_cards jsonb;
  v_compiled_cards jsonb;
begin
  if jsonb_typeof(p_authoring_fragment) is distinct from 'object'
     or jsonb_typeof(p_compiled_fragment) is distinct from 'object' then
    return false;
  end if;
  if jsonb_typeof(p_authoring_fragment->'courseId') is distinct from 'string'
     or jsonb_typeof(p_authoring_fragment->'moduleId') is distinct from 'string'
     or jsonb_typeof(p_authoring_fragment->'lessonId') is distinct from 'string'
     or jsonb_typeof(p_compiled_fragment->'courseId') is distinct from 'string'
     or jsonb_typeof(p_compiled_fragment->'moduleId') is distinct from 'string'
     or jsonb_typeof(p_compiled_fragment->'lessonId') is distinct from 'string' then
    return false;
  end if;
  if p_authoring_fragment->>'courseId'
        is distinct from p_compiled_fragment->>'courseId'
     or p_authoring_fragment->>'moduleId'
        is distinct from p_compiled_fragment->>'moduleId'
     or p_authoring_fragment->>'lessonId'
        is distinct from p_compiled_fragment->>'lessonId'
     or p_authoring_fragment->>'courseId'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
     or p_authoring_fragment->>'moduleId'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
     or p_authoring_fragment->>'lessonId'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then
    return false;
  end if;
  if jsonb_typeof(p_authoring_fragment->'microsequences') is distinct from 'array'
     or jsonb_typeof(p_compiled_fragment->'microsequences') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(p_authoring_fragment->'microsequences') = 0
     or jsonb_array_length(p_authoring_fragment->'microsequences')
        <> jsonb_array_length(p_compiled_fragment->'microsequences') then
    return false;
  end if;

  for v_microsequence_index in
    0..jsonb_array_length(p_authoring_fragment->'microsequences') - 1
  loop
    v_authoring_microsequence :=
      p_authoring_fragment->'microsequences'->v_microsequence_index;
    v_compiled_microsequence :=
      p_compiled_fragment->'microsequences'->v_microsequence_index;
    if jsonb_typeof(v_authoring_microsequence) is distinct from 'object'
       or jsonb_typeof(v_compiled_microsequence) is distinct from 'object' then
      return false;
    end if;
    if jsonb_typeof(v_authoring_microsequence->'id') is distinct from 'string'
       or jsonb_typeof(v_compiled_microsequence->'id') is distinct from 'string'
       or v_authoring_microsequence->>'id'
          is distinct from v_compiled_microsequence->>'id'
       or v_authoring_microsequence->>'id'
          !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then
      return false;
    end if;
    if jsonb_typeof(v_authoring_microsequence->'cards') is distinct from 'array'
       or jsonb_typeof(v_compiled_microsequence->'cards') is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(v_authoring_microsequence->'cards') = 0
       or jsonb_array_length(v_authoring_microsequence->'cards')
          <> jsonb_array_length(v_compiled_microsequence->'cards') then
      return false;
    end if;

    v_authoring_cards := v_authoring_microsequence->'cards';
    v_compiled_cards := v_compiled_microsequence->'cards';
    for v_card_index in 0..jsonb_array_length(v_authoring_cards) - 1
    loop
      if jsonb_typeof(v_authoring_cards->v_card_index) is distinct from 'object'
         or jsonb_typeof(v_compiled_cards->v_card_index) is distinct from 'object'
         or jsonb_typeof(v_authoring_cards->v_card_index->'id') is distinct from 'string'
         or jsonb_typeof(v_compiled_cards->v_card_index->'id') is distinct from 'string'
         or v_authoring_cards->v_card_index->>'id'
            is distinct from v_compiled_cards->v_card_index->>'id'
         or v_authoring_cards->v_card_index->>'id'
            !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

alter table private.authoring_parts
  add constraint authoring_parts_authoring_fragment_shape check (
    (authoring_fragment is null and authoring_fragment_hash is null)
    or (
      authoring_fragment is not null
      and authoring_fragment_hash is not null
      and jsonb_typeof(authoring_fragment) = 'object'
      and authoring_fragment <> '{}'::jsonb
      and octet_length(authoring_fragment::text) < 92160
      and authoring_fragment_hash ~ '^[0-9a-f]{64}$'
      and fragment is not null
      and fragment_hash is not null
      and private.authoring_fragments_have_stable_identity(
        authoring_fragment,
        fragment
      )
      and fragment_hash = encode(extensions.digest(
        convert_to(fragment::text, 'UTF8'), 'sha256'
      ), 'hex')
      and authoring_fragment_hash = encode(extensions.digest(
        convert_to(authoring_fragment::text, 'UTF8'), 'sha256'
      ), 'hex')
    )
  );

create or replace function private.clear_authoring_fragment_after_compiled_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.fragment is null
     or new.fragment is distinct from old.fragment
     or new.fragment_hash is distinct from old.fragment_hash
     or new.attempt is distinct from old.attempt then
    new.authoring_fragment := null;
    new.authoring_fragment_hash := null;
  end if;
  return new;
end;
$$;

create trigger authoring_parts_clear_formal_fragment
before update of fragment, fragment_hash, attempt
on private.authoring_parts
for each row
execute function private.clear_authoring_fragment_after_compiled_change();

create or replace function public.dispatch_authoring_command_v2(
  p_actor_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_run_id uuid,
  p_command text,
  p_part_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
set statement_timeout = '30s'
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_authoring_fragment jsonb;
  v_authoring_fragment_hash text;
  v_compiled_fragment jsonb;
  v_compiled_fragment_hash text;
  v_result jsonb;
  v_part private.authoring_parts%rowtype;
  v_event private.authoring_command_events%rowtype;
  v_event_result jsonb;
  v_incoming_charge bigint := 0;
  v_replaced_charge bigint := 0;
begin
  perform private.require_service_role();

  if jsonb_typeof(v_payload) is distinct from 'object' then
    raise exception 'Comando de autoria inválido.' using errcode = '22023';
  end if;

  if p_command = 'submit_part' then
    v_authoring_fragment := v_payload->'authoringFragment';
    v_compiled_fragment := v_payload->'fragment';
    if jsonb_typeof(v_authoring_fragment) is distinct from 'object'
       or v_authoring_fragment = '{}'::jsonb then
      raise exception 'Fragmento formal de autoria ausente.'
        using errcode = '22023';
    end if;
    if octet_length(v_authoring_fragment::text) >= 92160 then
      raise exception 'O fragmento formal de autoria deve ocupar menos de 90 KiB.'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_compiled_fragment) is distinct from 'object'
       or v_compiled_fragment = '{}'::jsonb then
      raise exception 'Fragmento compilado da parte ausente.'
        using errcode = '22023';
    end if;
    if not private.authoring_fragments_have_stable_identity(
      v_authoring_fragment,
      v_compiled_fragment
    ) then
      raise exception 'A fonte formal não preserva os identificadores do compilado.'
        using errcode = '22023';
    end if;

    v_authoring_fragment_hash := encode(extensions.digest(
      convert_to(v_authoring_fragment::text, 'UTF8'), 'sha256'
    ), 'hex');
    v_compiled_fragment_hash := encode(extensions.digest(
      convert_to(v_compiled_fragment::text, 'UTF8'), 'sha256'
    ), 'hex');
  end if;

  v_result := public.dispatch_authoring_command(
    p_actor_id,
    p_client_id,
    p_request_id,
    p_run_id,
    p_command,
    p_part_key,
    p_payload
  );

  if p_command = 'submit_part' then
    if v_result->>'fragmentHash' is distinct from v_compiled_fragment_hash then
      raise exception 'O fragmento formal não corresponde ao fragmento compilado persistido.'
        using errcode = '40001';
    end if;

    select part.* into v_part
    from private.authoring_parts part
    where part.run_id = p_run_id
      and part.part_key = p_part_key
    for update;

    if not found and coalesce((v_result->>'idempotent')::boolean, false) then
      return v_result || jsonb_build_object(
        'authoringFragmentHash',
        coalesce(v_result->>'authoringFragmentHash', v_authoring_fragment_hash)
      );
    end if;
    if not found then
      raise exception 'Parte inexistente.' using errcode = 'P0002';
    end if;

    -- Uma repetição antiga pode chegar depois de rebuild ou de uma tentativa
    -- posterior. Nesse caso a resposta continua idempotente, mas nunca altera a
    -- fonte formal ligada à versão atual.
    if v_part.fragment_hash is distinct from v_compiled_fragment_hash
       or v_part.attempt is distinct from (v_result->>'attempt')::integer then
      if coalesce((v_result->>'idempotent')::boolean, false) then
        return v_result || jsonb_build_object(
          'authoringFragmentHash',
          coalesce(v_result->>'authoringFragmentHash', v_authoring_fragment_hash)
        );
      end if;
      raise exception 'A tentativa persistida não corresponde ao fragmento formal.'
        using errcode = '40001';
    end if;

    if coalesce((v_result->>'idempotent')::boolean, false)
       and v_part.authoring_fragment_hash is not null then
      return v_result || jsonb_build_object(
        'authoringFragmentHash', v_part.authoring_fragment_hash
      );
    end if;

    select event.* into v_event
    from private.authoring_command_events event
    where event.actor_user_id = p_actor_id
      and event.request_id = p_request_id
    for update;

    v_incoming_charge := private.authoring_row_storage_charge(
      to_jsonb(v_part) || jsonb_build_object(
        'authoring_fragment', v_authoring_fragment,
        'authoring_fragment_hash', v_authoring_fragment_hash
      )
    );
    v_replaced_charge := private.authoring_row_storage_charge(to_jsonb(v_part));

    if v_event.id is not null then
      v_event_result := coalesce(v_event.result, '{}'::jsonb)
        || jsonb_build_object('authoringFragmentHash', v_authoring_fragment_hash);
      v_incoming_charge := v_incoming_charge
        + private.authoring_row_storage_charge(
          to_jsonb(v_event) || jsonb_build_object('result', v_event_result)
        );
      v_replaced_charge := v_replaced_charge
        + private.authoring_row_storage_charge(to_jsonb(v_event));
    end if;

    perform private.authoring_assert_staging_quota(
      p_actor_id,
      p_run_id,
      v_incoming_charge,
      v_replaced_charge
    );

    update private.authoring_parts part
    set authoring_fragment = v_authoring_fragment,
        authoring_fragment_hash = v_authoring_fragment_hash
    where part.id = v_part.id;

    if v_event.id is not null then
      update private.authoring_command_events event
      set result = v_event_result
      where event.id = v_event.id;
    end if;

    v_result := v_result || jsonb_build_object(
      'authoringFragmentHash', v_authoring_fragment_hash
    );
  elsif p_command in ('audit_part', 'reopen_part')
        and v_payload->>'decision' = 'rebuild' then
    -- O gatilho já realiza a limpeza no mesmo UPDATE que remove o compilado.
    -- A guarda torna explícita a pós-condição sem atingir uma tentativa nova
    -- caso uma resposta antiga seja repetida depois do rebuild.
    update private.authoring_parts part
    set authoring_fragment = null,
        authoring_fragment_hash = null
    where part.run_id = p_run_id
      and part.part_key = p_part_key
      and part.fragment is null
      and part.fragment_hash is null;
  end if;

  return v_result;
end;
$$;

create or replace function public.get_authoring_part_submission_v2(
  p_run_id uuid,
  p_part_key text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_submission jsonb;
  v_part private.authoring_parts%rowtype;
begin
  v_submission := public.get_authoring_part_submission(
    p_run_id,
    p_part_key,
    p_actor_id
  );

  select part.* into v_part
  from private.authoring_parts part
  where part.run_id = p_run_id
    and part.part_key = p_part_key;

  return v_submission || jsonb_build_object(
    'compiledFragmentHash', v_part.fragment_hash,
    'authoringFragment', v_part.authoring_fragment,
    'authoringFragmentHash', v_part.authoring_fragment_hash
  );
end;
$$;

comment on column private.authoring_parts.authoring_fragment is
  'Fonte formal privada da tentativa, anterior à compilação para aralearn.contract v3.';
comment on column private.authoring_parts.authoring_fragment_hash is
  'SHA-256 canônico do JSONB formal persistido na mesma tentativa do compilado.';
comment on function public.dispatch_authoring_command_v2(uuid,uuid,text,uuid,text,text,jsonb) is
  'Executa o dispatcher vigente e preserva atomicamente a fonte formal ligada ao fragmento compilado.';
comment on function public.get_authoring_part_submission_v2(uuid,text,uuid) is
  'Retorna a submissão compilada e sua fonte formal privada com hashes independentes.';

revoke all on function private.clear_authoring_fragment_after_compiled_change()
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_fragments_have_stable_identity(jsonb,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.dispatch_authoring_command_v2(uuid,uuid,text,uuid,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.get_authoring_part_submission_v2(uuid,text,uuid)
  from public, anon, authenticated;

grant execute on function public.dispatch_authoring_command_v2(uuid,uuid,text,uuid,text,text,jsonb)
  to service_role;
grant execute on function public.get_authoring_part_submission_v2(uuid,text,uuid)
  to service_role;

commit;
