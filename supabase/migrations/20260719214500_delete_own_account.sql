begin;

create or replace function public.delete_own_account(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_course_ids uuid[];
  v_course_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_confirmation is distinct from 'EXCLUIR' then
    raise exception 'Confirmação de exclusão inválida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select coalesce(array_agg(course.id), array[]::uuid[])
    into v_course_ids
  from public.courses course
  where course.owner_id = v_user_id
    and course.kind = 'personal';
  v_course_count := cardinality(v_course_ids);

  perform set_config('aralearn.suppress_sync_changes', 'on', true);

  delete from public.study_path_courses item
  where item.owner_id = v_user_id
     or item.course_id = any(v_course_ids);

  delete from public.catalog_collection_courses item
  where item.course_id = any(v_course_ids);

  delete from private.rpc_idempotency ledger
  where ledger.user_id = v_user_id
     or ledger.request_course_id = any(v_course_ids)
     or ledger.result_course_id = any(v_course_ids);

  delete from public.courses course
  where course.id = any(v_course_ids)
    and course.owner_id = v_user_id
    and course.kind = 'personal';

  delete from auth.users account
  where account.id = v_user_id;

  if not found then
    raise exception 'Conta autenticada não encontrada.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'status', 'deleted',
    'userId', v_user_id,
    'deletedCourseCount', v_course_count
  );
end;
$$;

comment on function public.delete_own_account(text) is
  'Exclui definitivamente a conta autenticada e seus dados pessoais; exige confirmação explícita e nunca é exposta a anon.';

revoke all on function public.delete_own_account(text) from public, anon, authenticated;
grant execute on function public.delete_own_account(text) to authenticated;

commit;
