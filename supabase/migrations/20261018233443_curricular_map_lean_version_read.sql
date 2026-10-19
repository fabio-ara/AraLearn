begin;

create or replace function public.get_owned_course_curricular_map_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_map jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into strict v_course from public.courses course
  where course.id=p_course_id;
  select * into strict v_plan from private.course_instructional_plans plan
  where plan.course_id=p_course_id;
  v_map:=private.current_course_curricular_map_v1(p_course_id);
  return jsonb_build_object('contract','aralearn.course-curricular-map.v1','courseId',p_course_id,
    'courseRevision',v_course.revision,'planVersion',v_plan.version,
    'map',v_map,'approvalBasis',jsonb_build_object(
      'courseRevision',v_course.revision,'planVersion',v_plan.version,
      'basisHash',encode(extensions.digest(convert_to(v_map::text,'UTF8'),'sha256'),'hex')));
end
$function$;

revoke all on function public.get_owned_course_curricular_map_for_actor_v1(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.get_owned_course_curricular_map_for_actor_v1(uuid,uuid)
to service_role;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  manifest:=manifest||jsonb_build_object('schemaRevision','20261018233443');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end
$manifest$;

commit;
