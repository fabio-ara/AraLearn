begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

-- A leitura de revisão é interna a preparar_revisao. Ela conserva o currículo,
-- explicações, dependências, referências de escopo e partes usados pelo handler,
-- sem calcular aprovação, progresso ou proveniência por alvo que esse caminho não
-- apresenta. O plano v5 e seus demais consumidores permanecem inalterados.
create or replace function public.get_owned_course_review_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_prerequisites jsonb;
  v_curriculum jsonb;
  v_scope_items jsonb;
  v_parts jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into strict v_course
  from public.courses course where course.id=p_course_id;
  select * into strict v_plan
  from private.course_instructional_plans plan
  where plan.course_id=p_course_id;

  select coalesce(jsonb_agg(to_jsonb(item.statement)
    order by item.position,item.id),'[]'::jsonb)
  into v_prerequisites
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind='declared_prerequisite';

  select jsonb_build_object('modules',coalesce(jsonb_agg(jsonb_build_object(
    'id',module_value.entity_id,'position',module_value.position,
    'title',module_value.content->>'title',
    'objective',coalesce(module_value.content#>>'{guide,goal}',''),
    'lessons',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',lesson.entity_id,'position',lesson.position,
        'title',lesson.content->>'title',
        'objective',coalesce(lesson.content#>>'{guide,goal}',''),
        'microsequences',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',microsequence.entity_id,
            'position',microsequence.position,
            'title',microsequence.content->>'title',
            'objective',coalesce(microsequence.content->>'goal',''),
            'explanationPlan',microsequence.content->'explanationPlan',
            'explanation',microsequence.content->'explanation',
            'dependencyMicrosequenceIds',
              coalesce(microsequence.content->'dependsOn','[]'::jsonb)
          ) order by microsequence.position,microsequence.entity_id)
          from private.course_entities microsequence
          where microsequence.course_id=lesson.course_id
            and microsequence.entity_type='microsequence'
            and microsequence.parent_id=lesson.entity_id
        ),'[]'::jsonb)
      ) order by lesson.position,lesson.entity_id)
      from private.course_entities lesson
      where lesson.course_id=module_value.course_id
        and lesson.entity_type='lesson'
        and lesson.parent_id=module_value.entity_id
    ),'[]'::jsonb)
  ) order by module_value.position,module_value.entity_id),'[]'::jsonb))
  into v_curriculum
  from private.course_entities module_value
  where module_value.course_id=p_course_id
    and module_value.entity_type='module';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',scope_item.id,'position',scope_item.position,
    'statement',scope_item.statement,
    'curriculumTargets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'moduleId',target.module_id,'lessonId',target.lesson_id,
        'didacticMicrosequenceIds',target.microsequence_ids
      ) order by target.module_position,target.lesson_position,target.lesson_id)
      from (
        select module_value.entity_id as module_id,
          module_value.position as module_position,
          lesson.entity_id as lesson_id,
          lesson.position as lesson_position,
          jsonb_agg(to_jsonb(microsequence.entity_id)
            order by microsequence.position,microsequence.entity_id)
            as microsequence_ids
        from private.course_design_target_plan_items assignment
        join private.course_entities microsequence
          on microsequence.course_id=assignment.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.entity_id=assignment.didactic_microsequence_id
        join private.course_entities lesson
          on lesson.course_id=microsequence.course_id
         and lesson.entity_type='lesson'
         and lesson.entity_id=microsequence.parent_id
        join private.course_entities module_value
          on module_value.course_id=lesson.course_id
         and module_value.entity_type='module'
         and module_value.entity_id=lesson.parent_id
        where assignment.course_id=p_course_id
          and assignment.plan_item_kind='curriculum_scope_item'
          and assignment.plan_item_id=scope_item.id
        group by module_value.entity_id,module_value.position,
          lesson.entity_id,lesson.position
      ) target
    ),'[]'::jsonb)
  ) order by scope_item.position,scope_item.id),'[]'::jsonb)
  into v_scope_items
  from private.course_instructional_plan_items scope_item
  where scope_item.instructional_plan_id=v_plan.id
    and scope_item.item_kind='curriculum_scope_item';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',part.id,'position',part.position,'title',part.title,
    'intent',part.intent,'progression',part.progression,'version',part.version,
    'microsequences',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',microsequence.entity_id,
        'productionPosition',membership.production_position,
        'curriculumPath',jsonb_build_object(
          'moduleId',module_value.entity_id,
          'moduleTitle',module_value.content->>'title',
          'lessonId',lesson.entity_id,
          'lessonTitle',lesson.content->>'title'
        )
      ) order by membership.production_position,microsequence.entity_id)
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities microsequence
        on microsequence.course_id=membership.course_id
       and microsequence.entity_type='microsequence'
       and microsequence.entity_id=membership.didactic_microsequence_id
      join private.course_entities lesson
        on lesson.course_id=microsequence.course_id
       and lesson.entity_type='lesson'
       and lesson.entity_id=microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id=lesson.course_id
       and module_value.entity_type='module'
       and module_value.entity_id=lesson.parent_id
      where membership.course_id=p_course_id
        and membership.authoring_part_id=part.id
    ),'[]'::jsonb)
  ) order by part.position,part.id),'[]'::jsonb)
  into v_parts
  from private.course_authoring_parts part
  where part.instructional_plan_id=v_plan.id;

  v_result:=jsonb_build_object(
    'contract','aralearn.course-review-plan.v1',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'payloadEncoding','curriculum-backed-review-lean-v1',
    'plan',jsonb_build_object(
      'id',v_plan.id,'version',v_plan.version,
      'title',v_course.title,'objective',v_course.goal,
      'audience',v_plan.audience,
      'curriculumMapStatus',v_plan.curriculum_map_status,
      'declaredPrerequisites',v_prerequisites,
      'curriculum',v_curriculum,
      'curriculumScopeItems',v_scope_items,
      'parts',v_parts,
      'updatedAt',v_plan.updated_at
    )
  );
  if octet_length(v_result::text)>1835008 then
    raise exception 'O planejamento curricular excede o limite de leitura.'
      using errcode='54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.get_owned_course_review_plan_for_actor_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_review_plan_for_actor_v1(uuid,uuid)
  to service_role;

comment on function public.get_owned_course_review_plan_for_actor_v1(uuid,uuid)
  is 'Leitura interna focal de preparar_revisao: currículo, Explicações, escopo e partes consumidos pelo handler; sem revisão global, progresso ou referência de aprovação.';

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261017181734' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261017181734');
    execute format(
      'create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb'
    );
  end if;
end $manifest$;

notify pgrst,'reload schema';
commit;
