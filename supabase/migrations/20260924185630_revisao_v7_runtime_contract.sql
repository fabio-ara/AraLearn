-- Focal authoring, independent pedagogical inspection, component cutover and audio readiness.
begin;
do $manifest$ declare manifest jsonb; begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260924185630');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
notify pgrst,'reload schema';
commit;
