begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

-- Reference resolution and repertoire projection do not consume global review
-- states, explanation bodies, or computed usage of every analysis item.
create function public.get_owned_course_instructional_repertoire_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_revision bigint
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $function$
declare
  v_revision bigint;
  v_plan private.course_instructional_plans%rowtype;
  v_structure jsonb;
  v_items jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select revision into strict v_revision from public.courses where id=p_course_id;
  if p_expected_revision is null or v_revision is distinct from p_expected_revision then
    raise exception 'A revisão do curso mudou.' using errcode='PT409';
  end if;
  select * into strict v_plan from private.course_instructional_plans where course_id=p_course_id;
  v_structure:=private.course_inspection_triage_outline_v1(p_course_id)-'studyUnits';
  select jsonb_build_object(
    'instructionalAnalysisUnits',coalesce(jsonb_agg(jsonb_build_object(
      'id',item.id,'position',item.position,'statement',item.statement,
      'description',item.description,'version',item.version
    ) order by item.position,item.id) filter(where item.item_kind='instructional_analysis_unit'),'[]'::jsonb),
    'evidenceRequirements',coalesce(jsonb_agg(jsonb_build_object(
      'id',item.id,'position',item.position,'statement',item.statement,'version',item.version
    ) order by item.position,item.id) filter(where item.item_kind='evidence_requirement'),'[]'::jsonb),
    'curriculumScopeItems',coalesce(jsonb_agg(jsonb_build_object(
      'id',item.id,'position',item.position,'statement',item.statement
    ) order by item.position,item.id) filter(where item.item_kind='curriculum_scope_item'),'[]'::jsonb)
  ) into v_items
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind in ('instructional_analysis_unit','evidence_requirement','curriculum_scope_item');
  v_result:=jsonb_build_object('contract','aralearn.course-instructional-repertoire.v1',
    'courseId',p_course_id,'courseRevision',v_revision,
    'plan',v_structure||v_items||jsonb_build_object('id',v_plan.id,'version',v_plan.version));
  if v_structure is null or octet_length(v_result::text)>1835008 then
    raise exception 'O repertório instrucional excede o limite de leitura.' using errcode='54000';
  end if;
  return v_result;
end
$function$;

revoke all on function public.get_owned_course_instructional_repertoire_for_actor_v1(uuid,uuid,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_instructional_repertoire_for_actor_v1(uuid,uuid,bigint)
  to service_role;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  manifest:=manifest||jsonb_build_object('schemaRevision','20261020121943');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
