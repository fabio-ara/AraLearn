begin;
-- Reuse the owned-course read for all clients. The same ownership check and
-- snapshot protect its optional review policy independently of publication.
create or replace function public.get_owned_course_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_include_outline boolean default true
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $function$
begin
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  return private.get_course_for_actor_v1(p_actor_id,p_course_id,p_include_outline)
    ||jsonb_build_object('reviewPolicy',(select content_review_policy from public.courses where id=p_course_id));
end;
$function$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260909063859');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
