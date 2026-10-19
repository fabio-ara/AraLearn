begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

drop function public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,text);

create function public.get_owned_course_review_plan_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_explanation_ids text[],
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
  v_module_index integer;
  v_lesson_index integer;
  v_microsequence_index integer;
  v_microsequence_id text;
  v_microsequence jsonb;
  v_path text[];
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision<1 or p_explanation_ids is null or
      cardinality(p_explanation_ids)>500 or
      exists(select 1 from unnest(p_explanation_ids) id
        where id is null or btrim(id)='' or char_length(id)>240) or
      cardinality(p_explanation_ids)<>(select count(distinct id) from unnest(p_explanation_ids) id) then
    raise exception 'A seleção do plano de revisão é inválida.' using errcode='22023';
  end if;
  if p_if_none_match is not null and p_if_none_match !~ '^[0-9a-f]{64}$' then
    raise exception 'A impressão digital do plano é inválida.' using errcode='22023';
  end if;

  select course.revision into strict v_course_revision
  from public.courses course where course.id=p_course_id;
  if v_course_revision<>p_expected_revision then
    raise exception 'A revisão do curso mudou.' using errcode='PT409';
  end if;
  select plan.version into strict v_plan_version
  from private.course_instructional_plans plan where plan.course_id=p_course_id;
  if exists(select 1 from unnest(p_explanation_ids) selected(id)
      where not exists(select 1 from private.course_entities entity
        where entity.course_id=p_course_id and entity.entity_type='microsequence'
          and entity.entity_id=selected.id)) then
    raise exception 'A seleção contém uma explicação fora do curso.' using errcode='22023';
  end if;
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

  v_representation:=public.get_owned_course_review_plan_for_actor_v1(p_actor_id,p_course_id);
  if jsonb_array_length(v_representation#>'{plan,curriculum,modules}')>0 then
    for v_module_index in 0..jsonb_array_length(v_representation#>'{plan,curriculum,modules}')-1 loop
      if jsonb_array_length(v_representation#>array['plan','curriculum','modules',v_module_index::text,'lessons'])>0 then
        for v_lesson_index in 0..jsonb_array_length(v_representation#>array['plan','curriculum','modules',v_module_index::text,'lessons'])-1 loop
          if jsonb_array_length(v_representation#>array['plan','curriculum','modules',v_module_index::text,'lessons',v_lesson_index::text,'microsequences'])>0 then
            for v_microsequence_index in 0..jsonb_array_length(v_representation#>array['plan','curriculum','modules',v_module_index::text,'lessons',v_lesson_index::text,'microsequences'])-1 loop
              v_path:=array['plan','curriculum','modules',v_module_index::text,'lessons',
                v_lesson_index::text,'microsequences',v_microsequence_index::text];
              v_microsequence:=v_representation#>v_path;
              v_microsequence_id:=v_microsequence->>'id';
              if not (v_microsequence_id=any(p_explanation_ids)) then
                v_representation:=jsonb_set(v_representation,v_path||array['explanation'],'null'::jsonb,true);
              end if;
            end loop;
          end if;
        end loop;
      end if;
    end loop;
  end if;
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

comment on function public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,bigint,text[],text)
is 'Lê o plano de revisão com ACL e fingerprint de toda a estrutura, projetando corpos de explicação somente para os IDs consumidos pelo recorte.';

revoke all on function public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,bigint,text[],text)
from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_review_plan_for_actor_v2(uuid,uuid,bigint,text[],text)
to service_role;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261019180441' or
      not (manifest->'features' ? 'course-review-plan-focal-projection-v1') then
    manifest:=manifest||jsonb_build_object(
      'schemaRevision','20261019180441',
      'features',(select jsonb_agg(value order by value collate "C")
        from jsonb_array_elements_text(
          (manifest->'features')||'["course-review-plan-focal-projection-v1"]'::jsonb
        ))
    );
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

commit;
