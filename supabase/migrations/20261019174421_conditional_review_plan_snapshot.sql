begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

-- A impressão digital cobre todos os valores dos quais a projeção de revisão
-- depende, inclusive partes materializadas e aplicações em unidades. Ela é
-- calculada nas linhas de origem, sem montar currículo nem repetir as junções
-- extensas do plano quando a representação permanece igual.
create function private.course_review_plan_source_fingerprint_v1(p_course_id uuid)
returns text
language sql
stable
security definer
set search_path=pg_catalog,public,private,extensions
as $function$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'course',(select to_jsonb(course) from public.courses course
      where course.id=p_course_id),
    'instructionalPlan',(select to_jsonb(plan)
      from private.course_instructional_plans plan
      where plan.course_id=p_course_id),
    'planItems',coalesce((
      select jsonb_agg(to_jsonb(item) order by item.id)
      from private.course_instructional_plan_items item
      where item.course_id=p_course_id
    ),'[]'::jsonb),
    'entities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'entityType',entity.entity_type,
        'entityId',entity.entity_id,
        'parentType',entity.parent_type,
        'parentId',entity.parent_id,
        'position',entity.position,
        'content',case when entity.entity_type='study_unit'
          then jsonb_build_object('title',entity.content->'title')
          else entity.content end,
        'designApplication',entity.design_application
      ) order by entity.entity_type,entity.entity_id)
      from private.course_entities entity
      where entity.course_id=p_course_id
        and entity.entity_type in ('module','lesson','microsequence','study_unit')
    ),'[]'::jsonb),
    'designTargetPlanItems',coalesce((
      select jsonb_agg(to_jsonb(target) order by target.plan_item_kind,
        target.plan_item_id,target.didactic_microsequence_id)
      from private.course_design_target_plan_items target
      where target.course_id=p_course_id
    ),'[]'::jsonb),
    'authoringParts',coalesce((
      select jsonb_agg(to_jsonb(part) order by part.position,part.id)
      from private.course_authoring_parts part
      where part.course_id=p_course_id
        and part.instructional_plan_id=(
          select plan.id from private.course_instructional_plans plan
          where plan.course_id=p_course_id
        )
    ),'[]'::jsonb),
    'partMemberships',coalesce((
      select jsonb_agg(to_jsonb(membership) order by membership.authoring_part_id,
        membership.production_position,membership.didactic_microsequence_id)
      from private.course_authoring_part_didactic_microsequences membership
      where membership.course_id=p_course_id
    ),'[]'::jsonb)
  )::text,'UTF8'),'sha256'),'hex')
$function$;

revoke all on function private.course_review_plan_source_fingerprint_v1(uuid)
from public,anon,authenticated,service_role;

create function public.get_owned_course_review_plan_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_if_none_match text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare
  v_course_revision bigint;
  v_plan_version bigint;
  v_fingerprint text;
  v_representation jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_if_none_match is not null and p_if_none_match !~ '^[0-9a-f]{64}$' then
    raise exception 'A impressão digital do plano é inválida.' using errcode='22023';
  end if;

  select course.revision into strict v_course_revision
  from public.courses course where course.id=p_course_id;
  select plan.version into strict v_plan_version
  from private.course_instructional_plans plan where plan.course_id=p_course_id;
  v_fingerprint:=private.course_review_plan_source_fingerprint_v1(p_course_id);

  if p_if_none_match is not null and p_if_none_match=v_fingerprint then
    return jsonb_build_object(
      'contract','aralearn.course-review-plan.snapshot.v1',
      'courseId',p_course_id,
      'courseRevision',v_course_revision,
      'planVersion',v_plan_version,
      'fingerprint',v_fingerprint,
      'notModified',true
    );
  end if;

  -- A leitura existente permanece a fonte canônica da forma literal e do cold
  -- path. A projeção pesada só é executada depois de a comparação das fontes.
  v_representation:=public.get_owned_course_review_plan_for_actor_v1(
    p_actor_id,p_course_id);
  return jsonb_build_object(
    'contract','aralearn.course-review-plan.snapshot.v1',
    'courseId',p_course_id,
    'courseRevision',v_course_revision,
    'planVersion',v_plan_version,
    'fingerprint',v_fingerprint,
    'notModified',false,
    'representation',v_representation
  );
end
$function$;

comment on function public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,text)
is 'Lê o plano de revisão com ACL atual e resposta condicional baseada nas dependências estruturais completas.';

revoke all on function public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,text)
from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,text)
to service_role;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261019174421' or
      not (manifest->'features' ? 'course-review-plan-conditional-snapshot-v1') then
    manifest:=manifest||jsonb_build_object(
      'schemaRevision','20261019174421',
      'features',(select jsonb_agg(value order by value collate "C")
        from jsonb_array_elements_text(
          (manifest->'features')||'["course-review-plan-conditional-snapshot-v1"]'::jsonb
        ))
    );
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

commit;
