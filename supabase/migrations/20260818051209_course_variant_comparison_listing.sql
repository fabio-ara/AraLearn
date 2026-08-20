-- A listagem é uma projeção owner-only; não cria uma segunda autoridade sobre
-- checkpoint, Curso derivado ou vínculo de comparação.
create function public.list_owned_course_variant_comparisons_for_actor_v1(
  p_actor_id uuid,
  p_source_course_id uuid,
  p_expected_course_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_course public.courses%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_source_course_id,p_actor_id,true);
  select * into v_course
  from public.courses course
  where course.id = p_source_course_id
  for share;
  if not found then
    raise exception 'Curso não encontrado.' using errcode = 'PT404';
  end if;
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_expected_course_revision <> v_course.revision then
    raise sqlstate 'PGRST'
      using message = json_build_object(
        'code','40001','message','O Curso mudou; releia antes de comparar variantes.',
        'details',null,'hint',null
      )::text,
      detail = json_build_object('status',409,'headers',json_build_object())::text;
  end if;
  return jsonb_build_object(
    'contract','aralearn.course-variant-comparison-list.v1',
    'sourceCourseId',v_course.id,
    'sourceCourseRevision',v_course.revision,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'comparisonSetId',comparison_set.id,
        'checkpointId',comparison_set.checkpoint_id,
        'checkpointHash',checkpoint.snapshot_hash,
        'checkpointCourseRevision',checkpoint.source_course_revision,
        'memberCount',counts.member_count,
        'attachedCount',counts.attached_count,
        'detachedCount',counts.detached_count,
        'createdAt',comparison_set.created_at,
        'updatedAt',comparison_set.updated_at
      ) order by comparison_set.updated_at desc,comparison_set.id desc)
      from private.course_variant_comparison_sets comparison_set
      join private.course_variant_plan_checkpoints checkpoint
        on checkpoint.id = comparison_set.checkpoint_id
      cross join lateral (
        select count(*)::integer as member_count,
          count(*) filter(where member.detached_at is null)::integer as attached_count,
          count(*) filter(where member.detached_at is not null)::integer as detached_count
        from private.course_variant_comparison_members member
        where member.comparison_set_id = comparison_set.id
      ) counts
      where comparison_set.source_course_id = v_course.id
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.list_owned_course_variant_comparisons_for_actor_v1(
  uuid,uuid,bigint
) from public, anon, authenticated;
grant execute on function public.list_owned_course_variant_comparisons_for_actor_v1(
  uuid,uuid,bigint
) to service_role;

do $postflight$
begin
  if to_regprocedure(
       'public.list_owned_course_variant_comparisons_for_actor_v1(uuid,uuid,bigint)'
     ) is null then
    raise exception 'Postflight de listagem de variantes incompleto.' using errcode = '55000';
  end if;
  if has_function_privilege(
       'authenticated',
       'public.list_owned_course_variant_comparisons_for_actor_v1(uuid,uuid,bigint)',
       'execute'
     ) then
    raise exception 'Listagem de variantes não pode ser chamada diretamente.' using errcode = '55000';
  end if;
end;
$postflight$;
