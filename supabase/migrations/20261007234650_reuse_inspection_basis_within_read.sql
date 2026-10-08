-- Reuso intrarrequisição da base de inspeção. Pelas fontes (leitura do SQL), a
-- expressão do hash de inspeção e o payload reavaliavam as bases de conteúdo e
-- pedagógica do mesmo alvo dentro da requisição, e o estado recalculava a base
-- só para derivar o hash. A contagem exata de avaliações em execução não foi
-- medida: o que existe é o A/B local (PGlite, payload idêntico), não uma contagem
-- de runtime nem qualquer latência hospedada.
--
-- Esta migração concentra a regra em dois helpers e faz hash, estado e payload
-- consumirem a MESMA base já calculada dentro da requisição. Nada de contrato
-- muda: `basisHash`, `pedagogicalBasis`, `inspection` e o payload permanecem
-- idênticos. Não há cache entre requisições, mudança de limites de leitura, DDL
-- de dados, revisão de curso nem parecer; e as funções correntes continuam
-- existindo, agora consumindo os helpers, para não deixar regra duplicada.

begin;

-- Hash da inspeção a partir de bases já calculadas (mesma entrada de antes).
create or replace function private.course_ai_inspection_hash_of_bases_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text,
  p_content_basis text,
  p_pedagogical jsonb
)
 returns text
 language sql
 stable
 security definer
 set search_path=pg_catalog
as $function$
  select case when p_content_basis is not null then private.course_source_json_hash_v1(
    jsonb_build_object(
      'contentBasis',p_content_basis,
      'pedagogicalBasis',p_pedagogical,
      'bibliographyStyle',case when exists(
          select 1 from private.course_source_attributions a
          join private.course_source_attribution_sources l
            on l.course_id=a.course_id and l.attribution_id=a.id
          where a.course_id=p_course_id and a.target_kind=p_target_kind and a.target_id=p_target_id)
        then (select bibliography_style from public.courses where id=p_course_id) end))
  end
$function$;

revoke all on function private.course_ai_inspection_hash_of_bases_v1(uuid,text,text,text,jsonb)
  from public,anon,authenticated,service_role;

-- Estado da inspeção a partir do hash já calculado (mesmo corpo corrente).
create or replace function private.course_ai_inspection_state_of_hash_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text,
  p_hash text
)
 returns jsonb
 language sql
 stable
 security definer
 set search_path=pg_catalog
as $function$
  select jsonb_build_object('state',case
      when e.ai_inspection->>'basisHash'=p_hash then 'current'
      when e.ai_inspection->>'legacyBasisHash'=p_hash then 'unregistered'
      else 'pending' end,'basisHash',p_hash)
    ||case when e.ai_inspection->>'basisHash'=p_hash then jsonb_build_object(
      'inspectedAt',e.ai_inspection->'inspectedAt','report',e.ai_inspection->'report')
      else '{}'::jsonb end
  from private.course_entities e
  where e.course_id=p_course_id and e.entity_id=p_target_id
    and e.entity_type=case p_target_kind when 'study_unit' then 'study_unit'
      when 'microsequence_explanation' then 'microsequence' end
$function$;

revoke all on function private.course_ai_inspection_state_of_hash_v1(uuid,text,text,text)
  from public,anon,authenticated,service_role;

-- As funções correntes permanecem e passam a consumir os helpers: cada base é
-- calculada uma única vez por requisição, sem alterar volatilidade, autoridade
-- ou `search_path`.
create or replace function private.course_ai_inspection_basis_hash_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text
)
 returns text
 language sql
 stable
 security definer
 set search_path=pg_catalog
as $function$
  select private.course_ai_inspection_hash_of_bases_v1(
    p_course_id,p_target_kind,p_target_id,
    private.course_content_basis_hash_v1(p_course_id,p_target_kind,p_target_id),
    private.course_pedagogical_basis_v1(p_course_id,p_target_kind,p_target_id))
$function$;

create or replace function private.course_ai_inspection_state_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text
)
 returns jsonb
 language sql
 stable
 security definer
 set search_path=pg_catalog
as $function$
  select private.course_ai_inspection_state_of_hash_v1(
    p_course_id,p_target_kind,p_target_id,
    private.course_ai_inspection_basis_hash_v1(p_course_id,p_target_kind,p_target_id))
$function$;

create or replace function private.course_ai_inspection_payload_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text
)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path=pg_catalog
as $function$
declare state jsonb; revision bigint; content_basis text; pedagogical jsonb; hash text;
begin
  content_basis:=private.course_content_basis_hash_v1(p_course_id,p_target_kind,p_target_id);
  pedagogical:=private.course_pedagogical_basis_v1(p_course_id,p_target_kind,p_target_id);
  hash:=private.course_ai_inspection_hash_of_bases_v1(
    p_course_id,p_target_kind,p_target_id,content_basis,pedagogical);
  state:=private.course_ai_inspection_state_of_hash_v1(p_course_id,p_target_kind,p_target_id,hash);
  if state is null then raise exception 'Objeto de inspeção não encontrado.' using errcode='22023'; end if;
  select c.revision into revision from public.courses c where c.id=p_course_id;
  return jsonb_build_object('contract','aralearn.course-ai-inspection.v1','courseId',p_course_id,
    'courseRevision',revision,'targetKind',p_target_kind,'targetId',p_target_id,
    'basisHash',state->'basisHash','inspection',state,'pedagogicalBasis',pedagogical);
end $function$;

-- create or replace preserva proprietário e ACL; repetir o revoke mantém a
-- propriedade explícita caso a ordem de instalação mude.
revoke all on function private.course_ai_inspection_basis_hash_v1(uuid,text,text),
  private.course_ai_inspection_state_v1(uuid,text,text),
  private.course_ai_inspection_payload_v1(uuid,text,text)
  from public,anon,authenticated,service_role;

-- A leitura passa a reaproveitar a própria base. O manifesto avança a revisão de
-- esquema preservando exatamente as capacidades correntes: o contrato observável
-- de inspeção não muda, então nenhuma capacidade nova é declarada.
do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261007234650' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261007234650');
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

commit;
