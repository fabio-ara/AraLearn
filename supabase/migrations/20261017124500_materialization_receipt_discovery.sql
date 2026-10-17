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
-- A leitura é paginada por chave estável com continuação: as tentativas vigentes
-- vêm antes das expiradas, então acervo vencido numeroso nunca esconde a
-- tentativa recuperável; os totais do recorte são globais, e não do tamanho da
-- página, para que a ambiguidade nunca seja lida como unicidade.
begin;

create function public.discover_course_part_materialization_receipts_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_authoring_part_id uuid,p_limit integer,p_cursor text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_items jsonb;
  v_candidate_count integer:=0;
  v_expired_count integer:=0;
  v_illegible integer:=0;
  v_has_more boolean:=false;
  v_next text;
  v_status text;
  v_tier integer;
  v_created bigint;
  v_request text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null
    or p_limit is null or p_limit<1 or p_limit>64 then
    raise exception 'A descoberta do recibo de materialização é inválida.'
      using errcode='22023';
  end if;
  if p_cursor is not null then
    if p_cursor!~'^[01]\|[0-9]{1,19}\|[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
      raise exception 'A continuação da descoberta é inválida.' using errcode='22023';
    end if;
    v_tier:=split_part(p_cursor,'|',1)::integer;
    v_created:=split_part(p_cursor,'|',2)::bigint;
    v_request:=split_part(p_cursor,'|',3);
  end if;
  -- Somente fatos do recibo: identidade da tentativa, forma do resultado e
  -- retenção. Uma linha cuja forma não confere não vira candidato nem é
  -- silenciada: ela entra na contagem de ilegíveis, porque o leitor por
  -- identidade a recusaria e a ausência não pode ser lida como ausência de efeito.
  with scoped as (
    select receipt.request_id,
      receipt.created_at,
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
        and jsonb_typeof(receipt.result->'studyUnitCount')='number',false) usable,
      case when receipt.expires_at>statement_timestamp() then 1 else 0 end tier,
      (extract(epoch from receipt.created_at)*1000000)::bigint created_micros
    from private.course_change_receipts receipt
    where receipt.actor_id=p_actor_id
      and receipt.course_id=p_course_id
      and receipt.operation='materialize_course_authoring_part_v2'
  ),
  filtered as (
    select scope.* from scoped scope
    where p_authoring_part_id is null
      or scope.authoring_part_id=p_authoring_part_id::text
  ),
  ordered as (
    select candidate.* from filtered candidate
    where candidate.usable
      -- O filtro usa exatamente a chave da ordenação: tier DESC, instante DESC e
      -- request_id ASC. Empate de instante não duplica nem omite linha.
      and (p_cursor is null or candidate.tier<v_tier
        or candidate.tier=v_tier and (candidate.created_micros<v_created
          or candidate.created_micros=v_created
            and candidate.request_id collate "C">v_request collate "C"))
  ),
  page as (
    select scope.*,
      row_number() over (order by scope.tier desc,scope.created_micros desc,
        scope.request_id collate "C") rn
    from ordered scope
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
      'requestId',shown.request_id,
      'authoringPartId',shown.authoring_part_id,
      'courseRevision',shown.course_revision,
      'changed',shown.changed,
      'studyUnitCount',shown.study_unit_count,
      'createdAt',shown.created_at,
      'expired',shown.tier=0
    ) order by shown.rn),'[]'::jsonb)
      from page shown where shown.rn<=p_limit),
    (select count(*) from filtered candidate where candidate.usable and candidate.tier=1),
    (select count(*) from filtered candidate where candidate.usable and candidate.tier=0),
    -- Sob o filtro de Parte, a linha sem forma de recibo conta quando pertence à
    -- Parte pedida ou quando não pôde ser atribuída a nenhuma Parte.
    (select count(*) from scoped candidate
      where not candidate.usable
        and (p_authoring_part_id is null or candidate.authoring_part_id is null
          or candidate.authoring_part_id=p_authoring_part_id::text)),
    (select count(*) from page)>p_limit,
    (select shown.tier::text||'|'||shown.created_micros||'|'||shown.request_id
      from page shown where shown.rn=p_limit)
  into v_items,v_candidate_count,v_expired_count,v_illegible,v_has_more,v_next;
  if not v_has_more then v_next:=null; end if;
  -- O status vem dos totais do recorte, nunca do tamanho da página: mais de uma
  -- tentativa vigente é ambiguidade real mesmo que só uma caiba nesta página.
  v_status:=case when v_candidate_count=1 then 'candidate'
    when v_candidate_count>1 then 'ambiguous' else 'none' end;
  return jsonb_build_object(
    'contract','aralearn.course-part-materialization-discovery.v1',
    'courseId',p_course_id,
    'authoringPartId',p_authoring_part_id,
    'status',v_status,
    'candidateCount',v_candidate_count,
    'expiredCount',v_expired_count,
    'illegible',coalesce(v_illegible,0),
    'items',v_items,
    'hasMore',v_has_more,
    'nextCursor',v_next);
end
$function$;
revoke all on function
  public.discover_course_part_materialization_receipts_for_actor_v1(uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function
  public.discover_course_part_materialization_receipts_for_actor_v1(uuid,uuid,uuid,integer,text)
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

