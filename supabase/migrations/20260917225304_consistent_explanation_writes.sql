begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

-- A plain-text edit cannot attach an unchanged declaration to another document.
-- Unchanged explanations, including historical metadata, are not repaired here.
-- New declarations are checked against the literal candidate by the shared
-- domain writer; the existing storage guard applies the same invalidation to
-- manual edits and other composition writers without a second protocol.
create or replace function private.mark_course_content_review_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $function$
begin
  if new.content ?| array['contentReview','content_review','approvedBy','approvedAt','approvedBasisHash',
    'reviewedBy','reviewedAt','reviewedVersion','basisHash','legacyMicrosequenceReview'] then
    raise exception 'Revisão não pertence ao conteúdo editável.' using errcode='42501'; end if;
  if tg_op='UPDATE' and new.entity_type='microsequence'
    and row(new.content#>'{explanation,title}',new.content#>'{explanation,content}')
      is distinct from row(old.content#>'{explanation,title}',old.content#>'{explanation,content}')
    and new.content#>'{explanation,reconciliation}' is not distinct from old.content#>'{explanation,reconciliation}' then
    new.content:=new.content#-'{explanation,reconciliation}';
  end if;
  if new.entity_type='microsequence' and (
    new.content ? 'explanation' and not private.valid_course_explanation_v1(new.content->'explanation')
    or new.content ? 'explanationPlan' and not private.valid_course_explanation_plan_v1(new.content->'explanationPlan')
  ) then raise exception 'Explicação ou proposta inválida.' using errcode='22023'; end if;
  if tg_op='INSERT' then
    if new.content_review is not null then raise exception 'Revisão não pode ser importada.' using errcode='42501'; end if;
    if new.entity_type in('microsequence','study_unit') then new.content_review:='{}'::jsonb; end if;
  elsif new.content_review is distinct from old.content_review and
    current_setting('aralearn.content_review_write',true) is distinct from 'object-review-command' then
    raise exception 'Metadado de revisão protegido.' using errcode='42501';
  end if;
  return new;
end $function$;
commit;
