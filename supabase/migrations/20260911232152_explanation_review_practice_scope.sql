begin;
set local lock_timeout='5s';
set local statement_timeout='5min';

-- Vínculos de análise instrucional e requisitos para a prática não alteram a
-- explicação já salva; o escopo curricular permanece no alcance da base.
-- Estabilizar os dados usados no hash enquanto as marcas atuais são
-- transportadas para o alcance corrigido; consultas comuns continuam livres.
lock table public.courses in exclusive mode;
lock table private.course_entities,private.course_design_target_plan_items,
  private.course_instructional_plan_items,private.course_source_attributions,
  private.course_source_attribution_sources,private.course_source_attribution_anchors,
  private.course_sources,private.course_source_anchors,private.course_media,
  private.course_source_attachments in share row exclusive mode;

create temporary table explanation_review_scope_current on commit drop as
  select e.course_id,e.entity_id,e.content_review->>'basisHash' as previous_hash
  from private.course_entities e
  where e.entity_type='microsequence' and e.content_review ? 'basisHash'
    and e.content_review->>'basisHash'=
      private.course_content_basis_hash_v1(e.course_id,'microsequence_explanation',e.entity_id);

do $explanation_review_scope$
declare definition text; previous text;
  review_setting text:=coalesce(current_setting('aralearn.content_review_write',true),'');
begin
  previous:='and a.didactic_microsequence_id in(select id from scope)';
  select pg_get_functiondef('private.course_content_basis_hash_v1(uuid,text,text)'::regprocedure) into definition;
  if array_length(string_to_array(definition,previous),1)<>2 then
    raise exception 'O alcance precursor da revisão da explicação divergiu.';
  end if;
  execute replace(definition,previous,previous||
    ' and (p_target_kind<>''microsequence_explanation'' or a.plan_item_kind not in(''evidence_requirement'',''instructional_analysis_unit''))');

  -- Traduzir somente marcas que coincidiam com a base antes da correção.
  -- Data, pessoa, versão inspecionada e registros históricos ficam intactos.
  perform set_config('aralearn.content_review_write','object-review-command',true);
  update private.course_entities e
    set content_review=jsonb_set(e.content_review,'{basisHash}',to_jsonb(
      private.course_content_basis_hash_v1(e.course_id,'microsequence_explanation',e.entity_id)))
    from pg_temp.explanation_review_scope_current reviewed
    where e.course_id=reviewed.course_id and e.entity_type='microsequence'
      and e.entity_id=reviewed.entity_id and e.content_review->>'basisHash'=reviewed.previous_hash
      and reviewed.previous_hash is distinct from
        private.course_content_basis_hash_v1(e.course_id,'microsequence_explanation',e.entity_id);
  perform set_config('aralearn.content_review_write',review_setting,true);
exception when others then
  perform set_config('aralearn.content_review_write',review_setting,true);
  raise;
end
$explanation_review_scope$;

-- Marcas desatualizadas não são reescritas. Quando a única diferença era um
-- vínculo de análise ou requisito de prática, o hash pode coincidir com a revisão
-- original. Mudanças materiais restantes continuam desatualizadas.
do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260911232152');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
