-- Descoberta somente-leitura do recibo de materialização de Parte.
-- O erro course_write_uncertain devolve {courseId,requestId,operation}. Quando a
-- resposta se perde antes do corpo JSON-RPC, o requestId interno (aleatório por
-- tentativa) fica irrecuperável pelo caminho oficial e nenhum endpoint enumera
-- recibos. Este leitor estreito localiza as tentativas do PRÓPRIO ator no curso
-- informado, com a mesma operação do writer e do leitor por identidade
-- (materialize_course_authoring_part_v2), e devolve a referência exata que a
-- recuperação existente já consome. Nada é materializado, apagado, reaplicado ou
-- reescrito: nenhum recibo é alterado, nenhum CAS é relaxado e a leitura não
-- confirma efeito que não observou. A guarda de acesso é a mesma do writer (dono
-- do Curso), o recorte é a chave primária (actor_id,request_id) e o filtro por
-- Parte é o fato gravado no próprio resultado. Não há listagem global nem
-- exposição de tentativas de outro ator, de outro curso ou de outra operação.
begin;

create function public.discover_course_part_materialization_receipts_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_authoring_part_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_candidates jsonb;
  v_expired jsonb;
  v_illegible integer:=0;
  v_status text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null then
    raise exception 'A descoberta do recibo de materialização é inválida.'
      using errcode='22023';
  end if;
  -- Somente fatos do recibo: identidade da tentativa, forma do resultado e
  -- retenção. Uma linha cuja forma não confere não vira candidato nem é
  -- silenciada: ela entra em illegais, porque o leitor por identidade a
  -- recusaria e a ausência não pode ser lida como ausência de efeito.
  with scoped as (
    select receipt.request_id,
      receipt.created_at,
      receipt.expires_at,
      receipt.result->>'authoringPartId' authoring_part_id,
      receipt.result->'courseRevision' course_revision,
      receipt.result->'changed' changed,
      receipt.result->'studyUnitCount' study_unit_count,
      coalesce(
        receipt.result->>'contract'='aralearn.course-part-materialization.v1'
        and receipt.result->>'authoringPartId' ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and jsonb_typeof(receipt.result->'courseRevision')='number'
        and jsonb_typeof(receipt.result->'changed')='boolean'
        and jsonb_typeof(receipt.result->'studyUnitCount')='number',false) usable
    from private.course_change_receipts receipt
    where receipt.actor_id=p_actor_id
      and receipt.course_id=p_course_id
      and receipt.operation='materialize_course_authoring_part_v2'
  ),
  part_scoped as (
    select scope.* from scoped scope
    where p_authoring_part_id is null
      or scope.authoring_part_id=p_authoring_part_id::text
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
      'requestId',candidate.request_id,
      'authoringPartId',candidate.authoring_part_id,
      'courseRevision',candidate.course_revision,
      'changed',candidate.changed,
      'studyUnitCount',candidate.study_unit_count,
      'createdAt',candidate.created_at,
      'expiresAt',candidate.expires_at
    ) order by candidate.created_at desc,candidate.request_id collate "C"),'[]'::jsonb)
      from part_scoped candidate
      where candidate.usable and candidate.expires_at>statement_timestamp()),
    (select coalesce(jsonb_agg(jsonb_build_object(
      'requestId',candidate.request_id,
      'authoringPartId',candidate.authoring_part_id,
      'createdAt',candidate.created_at,
      'expiresAt',candidate.expires_at
    ) order by candidate.created_at desc,candidate.request_id collate "C"),'[]'::jsonb)
      from part_scoped candidate
      where candidate.usable and candidate.expires_at<=statement_timestamp()),
    -- Sob o filtro de Parte, a linha sem forma de recibo conta quando pertence à
    -- Parte pedida ou quando não pôde ser atribuída a nenhuma Parte.
    (select count(*) from scoped candidate
      where not candidate.usable
        and (p_authoring_part_id is null or candidate.authoring_part_id is null
          or candidate.authoring_part_id=p_authoring_part_id::text))
  into v_candidates,v_expired,v_illegible;
  -- Mais de uma tentativa vigente é ambiguidade real: a leitura devolve todas,
  -- sem eleger a mais recente e sem aprovar a escrita em nome da pessoa.
  v_status:=case when jsonb_array_length(v_candidates)=1 then 'candidate'
    when jsonb_array_length(v_candidates)>1 then 'ambiguous' else 'none' end;
  return jsonb_build_object(
    'contract','aralearn.course-part-materialization-discovery.v1',
    'courseId',p_course_id,
    'authoringPartId',p_authoring_part_id,
    'status',v_status,
    'candidates',v_candidates,
    'expired',v_expired,
    'illegible',coalesce(v_illegible,0));
end
$function$;
revoke all on function
  public.discover_course_part_materialization_receipts_for_actor_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function
  public.discover_course_part_materialization_receipts_for_actor_v1(uuid,uuid,uuid)
  to service_role;

-- A descoberta do recibo avança o runtime e declara a nova capacidade,
-- preservando todas as capacidades já exigidas pelo manifesto.
do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261017124500' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261017124500',
      'features',(select jsonb_agg(value order by value collate "C") from jsonb_array_elements_text(
        (manifest->'features')||'["course-authoring-part-materialization-receipt-discovery-v1"]'::jsonb)));
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

notify pgrst,'reload schema';
commit;

