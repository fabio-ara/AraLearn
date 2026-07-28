begin;

do $migration$
declare
  v_signature regprocedure :=
    'public.commit_authoring_transition_v3(uuid,text,text,uuid,text,uuid,jsonb,jsonb)'::regprocedure;
  v_definition text;
  v_rewritten text;
begin
  v_definition := pg_get_functiondef(v_signature);
  if position(
    'and current_revision_hash is not distinct from v_run.base_revision_hash'
    in v_definition
  ) > 0 then
    return;
  end if;
  v_rewritten := replace(
    v_definition,
    'and current_revision_hash = v_run.base_revision_hash',
    'and current_revision_hash is not distinct from v_run.base_revision_hash'
  );
  if v_rewritten = v_definition then
    raise exception 'A transição de publicação não contém a comparação CAS esperada.'
      using errcode = '55000';
  end if;
  execute v_rewritten;
end;
$migration$;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260728030000',
    'contractVersion', 3,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'artifact-offline-replica',
      'granular-sync',
      'private-authoring',
      'text-language-metadata',
      'storage-artifact-control-plane',
      'immutable-course-revisions',
      'storage-only-course-content'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
