-- #151: fecha o ciclo de vida de Curso e torna a manutenção corrente
-- operável por uma identidade administrativa, sem expor infraestrutura genérica.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';
set local search_path = pg_catalog, public, private, auth, storage;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn:product-operations-and-maintenance:20260824120000', 0
));

do $product_operations_preflight$
begin
  if to_regclass('public.courses') is null
     or to_regclass('public.course_access') is null
     or to_regclass('public.person_profiles') is null
     or to_regclass('auth.users') is null
     or to_regclass('storage.objects') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('private.run_current_data_retention_v1(integer)') is null
     or to_regprocedure('private.inventory_current_data_orphans_v1(integer)') is null then
    raise exception 'Os contratos correntes de Curso e manutenção são obrigatórios.'
      using errcode = '55000';
  end if;
end;
$product_operations_preflight$;

create function private.require_aralearn_administrator_v1(p_actor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth, public
as $function$
begin
  perform private.require_service_role();
  if p_actor_id is null or not exists(
    select 1
    from auth.users user_value
    join public.person_profiles profile on profile.user_id = user_value.id
    where user_value.id = p_actor_id
      and user_value.deleted_at is null
      and not coalesce(user_value.is_anonymous, false)
      and (user_value.banned_until is null
        or user_value.banned_until <= statement_timestamp())
      and user_value.raw_app_meta_data->>'aralearn_role' = 'administrator'
  ) then
    raise exception 'Manutenção disponível somente para administrador autorizado.'
      using errcode = '42501';
  end if;
end;
$function$;

create function public.maintain_course_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_operation text,
  p_confirmed boolean,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_changed boolean := false;
begin
  perform private.require_service_role();
  if p_actor_id is null or p_course_id is null
     or p_operation not in ('delete_owned_course', 'leave_shared_course')
     or p_confirmed is distinct from true
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Operação de ciclo de vida de Curso inválida.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-lifecycle:' || p_course_id::text, 0
  ));
  select * into v_course from public.courses course where course.id = p_course_id;

  if p_operation = 'delete_owned_course' then
    if found and v_course.owner_id <> p_actor_id then
      raise exception 'Somente o proprietário pode excluir este Curso.'
        using errcode = '42501';
    end if;
    if found then
      delete from public.courses course
      where course.id = p_course_id and course.owner_id = p_actor_id;
      v_changed := found;
    end if;
  else
    if found and v_course.owner_id = p_actor_id then
      raise exception 'O proprietário não pode sair do próprio Curso.'
        using errcode = '42501';
    end if;
    delete from public.course_access access_value
    where access_value.course_id = p_course_id
      and access_value.user_id = p_actor_id;
    v_changed := found;
  end if;

  return jsonb_build_object(
    'contract', 'aralearn.course-lifecycle.v1',
    'courseId', p_course_id,
    'operation', p_operation,
    'status', case when v_changed then 'completed' else 'already_absent' end,
    'changed', v_changed,
    'requestId', p_request_id
  );
end;
$function$;

create function public.get_current_maintenance_for_actor_v1(
  p_actor_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_inventory jsonb;
  v_job jsonb;
begin
  perform private.require_aralearn_administrator_v1(p_actor_id);
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Limite de manutenção inválido.' using errcode = '22023';
  end if;
  v_inventory := private.inventory_current_data_orphans_v1(p_limit);
  select jsonb_build_object(
    'scheduled', exists(
      select 1 from cron.job job
      where job.jobname = 'aralearn-current-data-retention-v1'
        and job.command = 'select private.run_current_data_retention_v1(512);'
    ),
    'schedule', coalesce((
      select job.schedule from cron.job job
      where job.jobname = 'aralearn-current-data-retention-v1'
        and job.command = 'select private.run_current_data_retention_v1(512);'
      order by job.jobid limit 1
    ), '')
  ) into v_job;
  return jsonb_build_object(
    'contract', 'aralearn.current-maintenance.v1',
    'role', 'administrator',
    'retention', v_job,
    'inventory', v_inventory
  );
end;
$function$;

create function public.run_current_retention_for_actor_v1(
  p_actor_id uuid,
  p_limit integer,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.require_aralearn_administrator_v1(p_actor_id);
  if p_confirmed is distinct from true then
    raise exception 'Confirme a execução da retenção corrente.' using errcode = '22023';
  end if;
  return private.run_current_data_retention_v1(p_limit);
end;
$function$;

create function public.authorize_current_orphan_removal_for_actor_v1(
  p_actor_id uuid,
  p_classification text,
  p_object_path text,
  p_confirmed boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, storage
as $function$
declare
  v_bucket_id text;
  v_classification text;
begin
  perform private.require_aralearn_administrator_v1(p_actor_id);
  if p_confirmed is distinct from true
     or p_classification not in (
       'avatar_owner_missing', 'avatar_profile_unlinked',
       'pdf_course_missing', 'pdf_unlinked'
     )
     or p_object_path is null or p_object_path <> btrim(p_object_path)
     or char_length(p_object_path) not between 3 and 500
     or p_object_path ~ '[[:cntrl:]]' then
    raise exception 'Remoção de resíduo inválida.' using errcode = '22023';
  end if;

  select object_value.bucket_id,
    case
      when object_value.bucket_id = 'person-avatars' and (
        split_part(object_value.name, '/', 1)
          !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or not exists(
          select 1 from auth.users user_value
          where user_value.id::text = split_part(object_value.name, '/', 1)
        )
      ) then 'avatar_owner_missing'
      when object_value.bucket_id = 'person-avatars' and not exists(
        select 1 from public.person_profiles profile
        where profile.user_id::text = split_part(object_value.name, '/', 1)
          and profile.avatar_object_key = object_value.name
      ) then 'avatar_profile_unlinked'
      when object_value.bucket_id = 'course-source-pdfs' and not exists(
        select 1 from public.courses course
        where course.id::text = split_part(object_value.name, '/', 1)
      ) then 'pdf_course_missing'
      when object_value.bucket_id = 'course-source-pdfs' and not exists(
        select 1 from private.course_source_attachments attachment
        where attachment.storage_path = object_value.name
      ) then 'pdf_unlinked'
      else null
    end
  into v_bucket_id, v_classification
  from storage.objects object_value
  where object_value.name = p_object_path
    and object_value.bucket_id in ('person-avatars', 'course-source-pdfs')
  order by object_value.bucket_id
  limit 1;

  if v_bucket_id is null or v_classification is distinct from p_classification then
    raise exception 'O objeto não pertence mais à classe de resíduo informada.'
      using errcode = '40001';
  end if;
  return jsonb_build_object(
    'contract', 'aralearn.current-maintenance-removal.v1',
    'classification', v_classification,
    'bucketId', v_bucket_id,
    'objectPath', p_object_path,
    'authorized', true
  );
end;
$function$;

revoke all on function private.require_aralearn_administrator_v1(uuid)
from public, anon, authenticated, service_role;
grant execute on function private.require_aralearn_administrator_v1(uuid)
to service_role;

revoke all on function public.maintain_course_for_actor_v1(
  uuid, uuid, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.maintain_course_for_actor_v1(
  uuid, uuid, text, boolean, text
) to service_role;

revoke all on function public.get_current_maintenance_for_actor_v1(uuid, integer)
from public, anon, authenticated;
grant execute on function public.get_current_maintenance_for_actor_v1(uuid, integer)
to service_role;

revoke all on function public.run_current_retention_for_actor_v1(
  uuid, integer, boolean
) from public, anon, authenticated;
grant execute on function public.run_current_retention_for_actor_v1(
  uuid, integer, boolean
) to service_role;

revoke all on function public.authorize_current_orphan_removal_for_actor_v1(
  uuid, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.authorize_current_orphan_removal_for_actor_v1(
  uuid, text, text, boolean
) to service_role;

do $product_operations_postflight$
begin
  if has_function_privilege(
       'authenticated',
       'public.maintain_course_for_actor_v1(uuid,uuid,text,boolean,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.get_current_maintenance_for_actor_v1(uuid,integer)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.get_current_maintenance_for_actor_v1(uuid,integer)',
       'EXECUTE'
     ) then
    raise exception 'As fronteiras server-side de operação não foram aplicadas.'
      using errcode = '55000';
  end if;
end;
$product_operations_postflight$;

commit;
