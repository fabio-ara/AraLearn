-- SQLSTATE 40001 is reserved for serialization failures. PostgREST/Hasql may
-- retry it before returning a response, but this RPC also uses it as the
-- stable domain signal for stale course/plan CAS. Keep the existing writer
-- intact behind a private boundary and translate only at the public RPC edge.

begin;

do $migration_guard$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260826143846'
     or to_regprocedure(
    'public.commit_course_instructional_plan_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)'
  ) is null then
    raise exception 'Writer público do plano instrucional não está na revisão esperada.'
      using errcode = '55000';
  end if;
  if to_regprocedure(
    'private.commit_course_instructional_plan_sources_core_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)'
  ) is not null then
    raise exception 'Core privado delimitador de CAS já existe.'
      using errcode = '55000';
  end if;
end;
$migration_guard$;

alter function public.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
) set schema private;

alter function private.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
) rename to commit_course_instructional_plan_sources_core_v1;

create function public.commit_course_instructional_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_expected_plan_version bigint,
  p_command jsonb,
  p_plan jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,extensions
as $function$
begin
  return private.commit_course_instructional_plan_sources_core_v1(
    p_actor_id,
    p_course_id,
    p_expected_course_revision,
    p_expected_plan_version,
    p_command,
    p_plan,
    p_channel,
    p_request_id
  );
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code','40001',
      'message',sqlerrm,
      'details',null,
      'hint',null
    )::text,
    detail = jsonb_build_object(
      'status',409,
      'headers',jsonb_build_object()
    )::text;
end;
$function$;

comment on function public.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
) is 'Commit owner-only e idempotente do plano instrucional; CAS obsoleto é exposto como HTTP 409 sem retry transacional.';

revoke all on function private.commit_course_instructional_plan_sources_core_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
) from public,anon,authenticated,service_role;

revoke all on function public.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
) from public,anon,authenticated,service_role;

grant execute on function public.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
) to service_role;

do $advance_instructional_plan_cas_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := jsonb_set(
    public.get_aralearn_runtime_manifest(),
    '{schemaRevision}',
    to_jsonb('20260827185748'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_instructional_plan_cas_manifest$;

do $postflight$
declare
  v_public_signature constant text :=
    'public.commit_course_instructional_plan_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)';
  v_private_signature constant text :=
    'private.commit_course_instructional_plan_sources_core_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)';
  v_definition text;
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260827185748'
     or to_regprocedure(v_public_signature) is null
     or to_regprocedure(v_private_signature) is null then
    raise exception 'Fronteira final do commit do plano instrucional está incompleta.'
      using errcode = '55000';
  end if;

  select pg_get_functiondef(to_regprocedure(v_public_signature)::oid)
    into v_definition;
  if strpos(lower(v_definition),'when serialization_failure') = 0
     or strpos(v_definition,'PGRST') = 0
     or strpos(v_definition,'commit_course_instructional_plan_sources_core_v1') = 0 then
    raise exception 'Writer público não delimita o retry do CAS do plano.'
      using errcode = '55000';
  end if;

  if has_function_privilege('anon',v_public_signature,'EXECUTE')
     or has_function_privilege('authenticated',v_public_signature,'EXECUTE')
     or not has_function_privilege('service_role',v_public_signature,'EXECUTE')
     or has_function_privilege('anon',v_private_signature,'EXECUTE')
     or has_function_privilege('authenticated',v_private_signature,'EXECUTE')
     or has_function_privilege('service_role',v_private_signature,'EXECUTE') then
    raise exception 'Privilégios da fronteira do commit do plano estão incorretos.'
      using errcode = '55000';
  end if;
end;
$postflight$;

commit;
