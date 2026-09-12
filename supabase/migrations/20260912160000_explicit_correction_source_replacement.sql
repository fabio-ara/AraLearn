begin;
set local search_path=pg_catalog,public,private,extensions;
select pg_advisory_xact_lock(hashtextextended('aralearn:explicit-correction-source-replacement:20260912160000',0));

-- Each application can explicitly replace its complete source list. Applications
-- without this intent retain the existing preservation of omitted links.
do $migration$
declare definition text; previous text;
begin
  definition:=pg_get_functiondef('private.valid_course_composition_source_applications_v1(jsonb,jsonb)'::regprocedure);
  previous:=definition;
  definition:=replace(definition,
    'not private.valid_course_source_links_shape_v2(a->''sourceLinks'')',
    'not private.valid_course_source_links_shape_v2(a->''sourceLinks'')
      or (a ? ''replaceExisting'' and jsonb_typeof(a->''replaceExisting'') is distinct from ''boolean'')');
  definition:=replace(definition,'a-array[''studyUnitId'',''sourceLinks'']',
    'a-array[''studyUnitId'',''sourceLinks'',''replaceExisting'']');
  definition:=replace(definition,'a-array[''targetKind'',''targetId'',''sourceLinks'']',
    'a-array[''targetKind'',''targetId'',''sourceLinks'',''replaceExisting'']');
  if definition=previous then raise exception 'Source application validator changed.'; end if;
  execute definition;

  definition:=replace(pg_get_functiondef('public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text,jsonb)'::regprocedure),E'\r\n',E'\n');
  previous:=definition;
  -- The composition and attribution are in the same locked transaction. The
  -- target version remains checked by apply_course_source_attribution_v2;
  -- omitting its optional hash selects its existing exact-replacement mode.
  definition:=replace(definition,
    E'v_application.value#>''{application,sourceLinks}'',\n      v_state->>''hash''',
    E'v_application.value#>''{application,sourceLinks}'',\n      case when coalesce((v_application.value#>>''{application,replaceExisting}'')::boolean,false) then null else v_state->>''hash'' end');
  if definition=previous then raise exception 'Source composition call changed.'; end if;
  execute definition;
end $migration$;
do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260912160000');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
