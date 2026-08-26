-- A identidade autenticada é constante durante a instrução. Materializá-la uma
-- vez evita que as políticas de Curso a recalcularem para cada linha.
begin;

do $course_rls_actor_lookup_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260826094500'
     or to_regclass('public.courses') is null
     or to_regclass('private.course_entities') is null
     or to_regclass('public.course_access') is null
     or to_regclass('public.course_personal_states') is null then
    raise exception 'As políticas relacionais de Curso não estão instaladas na revisão esperada.'
      using errcode = '55000';
  end if;
end;
$course_rls_actor_lookup_preflight$;

alter policy courses_access_v1 on public.courses
  using (private.course_ownership_v1(id,(select auth.uid())) is not null);

alter policy course_entities_access_v1 on private.course_entities
  using (private.course_ownership_v1(course_id,(select auth.uid())) is not null);

alter policy course_access_self_v1 on public.course_access
  using (user_id = (select auth.uid()));

alter policy course_personal_states_owner_v1 on public.course_personal_states
  using (
    user_id = (select auth.uid())
    and private.course_ownership_v1(course_id,(select auth.uid())) is not null
  )
  with check (
    user_id = (select auth.uid())
    and private.course_ownership_v1(course_id,(select auth.uid())) is not null
  );

do $advance_course_rls_actor_lookup_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := jsonb_set(
    public.get_aralearn_runtime_manifest(),
    '{schemaRevision}',
    to_jsonb('20260826143846'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_course_rls_actor_lookup_manifest$;

do $course_rls_actor_lookup_postflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260826143846'
     or not exists (
       select 1
       from pg_policy policy_value
       where policy_value.polname = 'courses_access_v1'
         and policy_value.polrelid = 'public.courses'::regclass
     )
     or not exists (
       select 1
       from pg_policy policy_value
       where policy_value.polname = 'course_entities_access_v1'
         and policy_value.polrelid = 'private.course_entities'::regclass
     ) then
    raise exception 'A otimização das políticas relacionais de Curso não foi concluída.'
      using errcode = '55000';
  end if;
end;
$course_rls_actor_lookup_postflight$;

commit;
