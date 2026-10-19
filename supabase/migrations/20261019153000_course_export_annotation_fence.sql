begin;

-- Preserve the review policy from the previous implementation while adding the
-- independent annotation version used to fence export-cache reuse. Both fields
-- share the existing owner ACL and read snapshot; no cleanup path is invoked.
create or replace function public.get_owned_course_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_include_outline boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  v_result := private.get_course_for_actor_v1(
    p_actor_id, p_course_id, p_include_outline
  );
  return v_result || jsonb_build_object(
    'reviewPolicy', (
      select course.content_review_policy
      from public.courses course
      where course.id = p_course_id
    ),
    'annotationSetVersion', (
      select course.annotation_set_version
      from public.courses course
      where course.id = p_course_id
    )
  );
end;
$function$;

do $manifest$
declare
  manifest jsonb := public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261019153000' or
      not (manifest->'features' ? 'course-export-annotation-version-fence-v1') then
    manifest := manifest || jsonb_build_object(
      'schemaRevision', '20261019153000',
      'features', (
        select jsonb_agg(value order by value collate "C")
        from (
          select distinct value
          from jsonb_array_elements_text(
            coalesce(manifest->'features', '[]'::jsonb) ||
            '["course-export-annotation-version-fence-v1"]'::jsonb
          ) as feature(value)
        ) unique_features
      )
    );
    execute format(
      'create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select ' || quote_literal(manifest::text) || '::jsonb'
    );
  end if;
end;
$manifest$;

notify pgrst, 'reload schema';
commit;
