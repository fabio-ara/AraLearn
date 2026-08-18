do $advance_course_variant_listing_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260818042341'
     or (v_manifest->>'contractVersion')::integer <> 1 then
    raise exception 'Manifesto concorrente à listagem de variantes.' using errcode = '55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal) into v_features
  from (
    select existing.value,existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value,ordinal)
    union all select 'course-variant-comparison-list-v1',1000015::bigint
  ) feature;
  v_manifest := jsonb_build_object(
    'schemaRevision','20260818052044','contractVersion',1,'features',v_features
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() returns jsonb '
      || 'language sql stable security definer set search_path = pg_catalog as %L',v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_course_variant_listing_manifest$;

do $verify_course_variant_listing_manifest$
declare v_manifest jsonb := public.get_aralearn_runtime_manifest();
begin
  if v_manifest->>'schemaRevision' <> '20260818052044'
     or not (v_manifest->'features' ? 'course-variant-comparison-list-v1') then
    raise exception 'Manifesto final perdeu a listagem de variantes.' using errcode = '55000';
  end if;
end;
$verify_course_variant_listing_manifest$;
