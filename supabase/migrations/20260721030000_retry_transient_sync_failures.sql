-- Falhas transitórias de infraestrutura não são decisões de domínio. A função
-- original trata rejeições estruturadas; este invólucro repropaga 53100/58000
-- para que a transação inteira seja revertida e a outbox possa tentar depois.
-- A migration é incremental: as migrations anteriores já foram implantadas.

alter function public.apply_sync_batch(uuid, jsonb)
  rename to apply_sync_batch_legacy;

create function public.apply_sync_batch(p_device_id uuid, p_mutations jsonb)
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
  v_result := public.apply_sync_batch_legacy(p_device_id, p_mutations);

  for v_item in
    select value from jsonb_array_elements(coalesce(v_result -> 'results', '[]'::jsonb))
  loop
    v_code := nullif(v_item ->> 'code', '');
    if v_item ->> 'status' = 'rejected' and v_code in ('53100', '58000') then
      raise exception '%', coalesce(v_item ->> 'message', 'Falha transitória de infraestrutura.')
        using errcode = v_code;
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.apply_sync_batch_legacy(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.apply_sync_batch(uuid, jsonb)
  from public, anon;
grant execute on function public.apply_sync_batch(uuid, jsonb) to authenticated;
