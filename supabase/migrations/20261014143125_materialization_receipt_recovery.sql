-- Recuperação somente-leitura da materialização de Parte.
-- O erro course_write_uncertain devolve { courseId, requestId, operation } sem
-- consumidor. Este leitor focal consulta o recibo da tentativa original por
-- ator+curso+requestId, sem exigir hash e sem relaxar o leitor genérico
-- (get_course_change_receipt_for_actor_v1, que continua obrigando o hash usado
-- por mapa/desenho). Nada é materializado, apagado ou reaplicado: o modo apenas
-- distingue recibo confirmado, escrita em voo, ausência de recibo e recibo
-- expirado. A tentativa legada continua consultável sem token novo.
begin;

create function public.get_course_part_materialization_receipt_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_request_id text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare v_receipt private.course_change_receipts%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_course_id is null
    or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'A tentativa de materialização é inválida.' using errcode='22023';
  end if;
  -- Mesma chave do writer: enquanto a escrita original segura o lock, o recibo
  -- não pode ser lido como ausente. A falha do try só declara escrita em voo.
  if not pg_try_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0)) then
    return jsonb_build_object('contract','aralearn.course-part-materialization-receipt.v1',
      'status','in_flight','courseId',p_course_id,'requestId',p_request_id);
  end if;
  select * into v_receipt from private.course_change_receipts receipt
    where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
  if not found then
    -- Sem recibo visível sob o mesmo lock. A ausência imediata não prova que a
    -- escrita terminou sem efeito (retenção, remoção e processamento anterior).
    return jsonb_build_object('contract','aralearn.course-part-materialization-receipt.v1',
      'status','not_recorded','courseId',p_course_id,'requestId',p_request_id);
  end if;
  -- Mesmo requestId de outra operação ou de outro curso nunca é recibo desta
  -- materialização; a recusa é genérica para não vazar a origem da tentativa.
  if v_receipt.course_id is distinct from p_course_id
    or v_receipt.operation<>'materialize_course_authoring_part_v2' then
    raise exception 'A tentativa pertence a outra alteração.' using errcode='23514';
  end if;
  if v_receipt.expires_at<=statement_timestamp() then
    return jsonb_build_object('contract','aralearn.course-part-materialization-receipt.v1',
      'status','expired','courseId',p_course_id,'requestId',p_request_id);
  end if;
  return jsonb_build_object('contract','aralearn.course-part-materialization-receipt.v1',
    'status','confirmed','courseId',p_course_id,'requestId',p_request_id,
    'result',v_receipt.result||jsonb_build_object('idempotent',true));
end
$function$;
revoke all on function
  public.get_course_part_materialization_receipt_for_actor_v1(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function
  public.get_course_part_materialization_receipt_for_actor_v1(uuid,uuid,text)
  to service_role;

-- A consulta do recibo de materialização avança o runtime e declara a nova
-- capacidade, preservando todas as capacidades já exigidas pelo manifesto.
do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261014143125' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261014143125',
      'features',(select jsonb_agg(value order by value collate "C") from jsonb_array_elements_text(
        (manifest->'features')||'["course-authoring-part-materialization-receipt-v1"]'::jsonb)));
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

notify pgrst,'reload schema';
commit;
