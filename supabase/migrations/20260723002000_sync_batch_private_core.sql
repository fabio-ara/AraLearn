-- A classificação de falhas transitórias pertence à fronteira pública da
-- sincronização. O núcleo que aplica o lote permanece privado e não representa
-- uma rota de compatibilidade.

alter function public.apply_sync_batch_legacy(uuid, jsonb)
  set schema private;

alter function private.apply_sync_batch_legacy(uuid, jsonb)
  rename to apply_sync_batch_core;

create or replace function public.apply_sync_batch(
  p_device_id uuid,
  p_mutations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_result jsonb;
  v_item jsonb;
  v_code text;
begin
  v_result := private.apply_sync_batch_core(p_device_id, p_mutations);

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_result -> 'results', '[]'::jsonb))
  loop
    v_code := nullif(v_item ->> 'code', '');
    if v_item ->> 'status' = 'rejected'
       and v_code in ('53100', '58000') then
      raise exception '%', coalesce(
        v_item ->> 'message',
        'Falha transitória de infraestrutura.'
      ) using errcode = v_code;
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function private.apply_sync_batch_core(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_sync_batch(uuid, jsonb)
  from public, anon;
grant execute on function public.apply_sync_batch(uuid, jsonb)
  to authenticated;

comment on function private.apply_sync_batch_core(uuid, jsonb) is
  'Núcleo privado que aplica um lote de mutações; a RPC pública classifica falhas transitórias.';
comment on function public.apply_sync_batch(uuid, jsonb) is
  'Aplica mutações idempotentes e mantém falhas transitórias na outbox para nova tentativa.';
