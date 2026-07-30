begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-remove-static-authoring-api-v4',
  0
));

-- O único principal remoto de autoria passa a ser uma sessão OAuth emitida
-- para o recurso MCP. A taxa é vinculada à conta, nunca a uma chave paralela.
create function public.resolve_authoring_oauth_principal(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_window timestamptz := date_trunc('minute', statement_timestamp());
  v_count integer;
  v_limit constant integer := 120;
  v_scopes text[];
begin
  perform private.require_service_role();
  if p_user_id is null or not exists (
    select 1 from auth.users account where account.id = p_user_id
  ) then
    raise exception 'Identidade OAuth inválida.' using errcode = '28000';
  end if;

  insert into private.authoring_user_rate_windows(
    user_id, window_started_at, request_count
  ) values (p_user_id, v_window, 1)
  on conflict(user_id) do update
  set request_count = case
        when private.authoring_user_rate_windows.window_started_at =
          excluded.window_started_at
          then private.authoring_user_rate_windows.request_count + 1
        else 1
      end,
      window_started_at = excluded.window_started_at
  returning request_count into v_count;

  if v_count > v_limit then
    return jsonb_build_object(
      'active', true,
      'status', 'rate_limited',
      'actorId', p_user_id,
      'scopes', '[]'::jsonb,
      'rateLimit', v_limit,
      'rateRemaining', 0
    );
  end if;

  select coalesce(array_agg(scope order by scope), array[]::text[])
  into v_scopes
  from unnest(array[
    'authoring:read', 'authoring:write', 'authoring:audit',
    'catalog:publish', 'roles:manage'
  ]::text[]) scope
  where private.user_can_use_authoring_scope(p_user_id, scope);

  return jsonb_build_object(
    'active', true,
    'actorId', p_user_id,
    'scopes', to_jsonb(v_scopes),
    'rateLimit', v_limit,
    'rateRemaining', greatest(v_limit - v_count, 0)
  );
end;
$$;

revoke all on function public.resolve_authoring_oauth_principal(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_authoring_oauth_principal(uuid)
  to service_role;

-- As capacidades do shell não anunciam mais importação estrutural local.
create or replace function public.current_user_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner boolean;
  v_catalog_publisher boolean;
  v_author boolean;
  v_reviewer boolean;
  v_roles jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  v_owner := private.has_active_app_role(v_user_id, 'owner');
  v_catalog_publisher := private.has_active_app_role(
    v_user_id, 'catalog_publisher'
  );
  v_author := private.has_active_app_role(v_user_id, 'author');
  v_reviewer := private.has_active_app_role(v_user_id, 'reviewer');

  select coalesce(jsonb_agg(role order by role), '[]'::jsonb)
  into v_roles
  from (
    select assignment.role
    from private.app_role_assignments assignment
    where assignment.user_id = v_user_id and assignment.active
  ) active_roles;

  return jsonb_build_object(
    'authenticated', true,
    'userId', v_user_id,
    'roles', v_roles,
    'catalogPublish', v_owner or v_catalog_publisher,
    'manageRoles', v_owner,
    'authoring', jsonb_build_object(
      'private', true,
      'catalogDraft', v_owner or v_catalog_publisher or v_author,
      'catalogReview', v_owner or v_catalog_publisher or v_reviewer,
      'catalogPublish', v_owner or v_catalog_publisher
    )
  );
end;
$$;

-- A autorização dos RPCs vigentes recebe somente a conta resolvida do token
-- OAuth. Não existe segundo principal, segredo paralelo ou identidade opcional.
create function private.require_workspace_actor_v4(
  p_owner_id uuid,
  p_scope text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
begin
  perform private.require_service_role();
  if p_owner_id is null or not exists (
    select 1 from auth.users account where account.id = p_owner_id
  ) then
    raise exception 'Responsável pelo workspace inválido.'
      using errcode = '42501';
  end if;
  if p_scope not in (
    'authoring:read',
    'authoring:write',
    'authoring:private:read',
    'authoring:private:write',
    'catalog:publish'
  ) then
    raise exception 'Escopo de autoria inválido.' using errcode = '42501';
  end if;
end;
$$;

create function private.lock_workspace_catalog_publication_authority_v4(
  p_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
  perform 1
  from private.app_role_assignments assignment
  where assignment.user_id = p_owner_id
    and assignment.role in ('owner', 'catalog_publisher')
    and assignment.active
    and assignment.revoked_at is null
  for share;
  if not found then
    raise exception 'Publicação editorial não autorizada.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_workspace_actor_v4(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_workspace_catalog_publication_authority_v4(uuid)
  from public, anon, authenticated, service_role;

-- Recria as RPCs MCP com assinaturas OAuth nativas a partir das definições
-- vigentes, já endurecidas nas migrations anteriores. Cada transformação é
-- verificada antes de substituir a superfície pública.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
begin
  foreach v_signature in array array[
    'public.replay_authoring_workspace_request_v4(uuid,uuid,text,text,text)'::regprocedure,
    'public.create_authoring_workspace_v4(uuid,uuid,uuid,text,text,text,text,jsonb,uuid,text)'::regprocedure,
    'public.commit_authoring_workspace_revision_v4(uuid,uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure,
    'public.get_authoring_workspace_v4(uuid,uuid,uuid,bigint)'::regprocedure,
    'public.list_authoring_workspaces_v4(uuid,uuid,integer,timestamptz,uuid)'::regprocedure,
    'public.list_authoring_workspace_history_v4(uuid,uuid,uuid,integer,bigint)'::regprocedure,
    'public.get_course_document_artifact_v4(uuid,uuid,uuid)'::regprocedure,
    'public.delete_authoring_workspace_v4(uuid,uuid,uuid,text,text)'::regprocedure,
    'public.list_authoring_catalog_collections_v4(uuid,uuid,integer,integer,uuid,text)'::regprocedure,
    'public.list_authoring_catalog_courses_v4(uuid,uuid,uuid,integer,integer,uuid,text)'::regprocedure,
    'public.publish_authoring_workspace_course_v4_impl(uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb)'::regprocedure,
    'public.publish_authoring_workspace_course_v4(uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_signature);
    v_rewritten := replace(v_definition, 'p_client_id uuid,', '');
    v_rewritten := replace(v_rewritten, 'p_owner_id, p_client_id', 'p_owner_id');
    v_rewritten := replace(v_rewritten, 'p_client_id,', '');
    v_rewritten := replace(v_rewritten, 'api_client_id,', '');
    if v_rewritten = v_definition
       or v_rewritten like '%p_client_id%'
       or v_rewritten like '%api_client_id%' then
      raise exception 'Não foi possível cortar a identidade paralela de %.',
        v_signature using errcode = '55000';
    end if;
    execute v_rewritten;
  end loop;
end;
$$;

-- A biblioteca pessoal usa o mesmo nome de ator dos demais RPCs e recebe
-- apenas owner, paginação e filtro.
do $$
declare
  v_signature regprocedure :=
    'public.list_personal_library_courses(uuid,uuid,integer,integer,uuid,text)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_rewritten text;
begin
  v_rewritten := replace(v_definition, 'p_actor_user_id', 'p_owner_id');
  v_rewritten := replace(v_rewritten, 'p_client_id uuid,', '');
  v_rewritten := replace(v_rewritten, 'p_client_id,', '');
  v_rewritten := replace(
    v_rewritten,
    'private.require_personal_library_client',
    'private.require_workspace_actor_v4'
  );
  if v_rewritten = v_definition
     or v_rewritten like '%p_actor_user_id%'
     or v_rewritten like '%p_client_id%'
     or v_rewritten like '%require_personal_library_client%' then
    raise exception 'Não foi possível recriar a biblioteca pessoal OAuth.'
      using errcode = '55000';
  end if;
  execute v_rewritten;
end;
$$;

revoke all on function public.replay_authoring_workspace_request_v4(
  uuid,text,text,text
) from public, anon, authenticated;
revoke all on function public.create_authoring_workspace_v4(
  uuid,uuid,text,text,text,text,jsonb,uuid,text
) from public, anon, authenticated;
revoke all on function public.commit_authoring_workspace_revision_v4(
  uuid,uuid,text,text,bigint,text,jsonb
) from public, anon, authenticated;
revoke all on function public.get_authoring_workspace_v4(
  uuid,uuid,bigint
) from public, anon, authenticated;
revoke all on function public.list_authoring_workspaces_v4(
  uuid,integer,timestamptz,uuid
) from public, anon, authenticated;
revoke all on function public.list_authoring_workspace_history_v4(
  uuid,uuid,integer,bigint
) from public, anon, authenticated;
revoke all on function public.get_course_document_artifact_v4(
  uuid,uuid
) from public, anon, authenticated;
revoke all on function public.delete_authoring_workspace_v4(
  uuid,uuid,text,text
) from public, anon, authenticated;
revoke all on function public.list_authoring_catalog_collections_v4(
  uuid,integer,integer,uuid,text
) from public, anon, authenticated;
revoke all on function public.list_authoring_catalog_courses_v4(
  uuid,uuid,integer,integer,uuid,text
) from public, anon, authenticated;
revoke all on function public.list_personal_library_courses(
  uuid,integer,integer,uuid,text
) from public, anon, authenticated;
revoke all on function public.publish_authoring_workspace_course_v4(
  uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) from public, anon, authenticated;
revoke all on function public.publish_authoring_workspace_course_v4_impl(
  uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.replay_authoring_workspace_request_v4(
  uuid,text,text,text
) to service_role;
grant execute on function public.create_authoring_workspace_v4(
  uuid,uuid,text,text,text,text,jsonb,uuid,text
) to service_role;
grant execute on function public.commit_authoring_workspace_revision_v4(
  uuid,uuid,text,text,bigint,text,jsonb
) to service_role;
grant execute on function public.get_authoring_workspace_v4(
  uuid,uuid,bigint
) to service_role;
grant execute on function public.list_authoring_workspaces_v4(
  uuid,integer,timestamptz,uuid
) to service_role;
grant execute on function public.list_authoring_workspace_history_v4(
  uuid,uuid,integer,bigint
) to service_role;
grant execute on function public.get_course_document_artifact_v4(
  uuid,uuid
) to service_role;
grant execute on function public.delete_authoring_workspace_v4(
  uuid,uuid,text,text
) to service_role;
grant execute on function public.list_authoring_catalog_collections_v4(
  uuid,integer,integer,uuid,text
) to service_role;
grant execute on function public.list_authoring_catalog_courses_v4(
  uuid,uuid,integer,integer,uuid,text
) to service_role;
grant execute on function public.list_personal_library_courses(
  uuid,integer,integer,uuid,text
) to service_role;
grant execute on function public.publish_authoring_workspace_course_v4(
  uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) to service_role;

-- O workspace e os demais registros remanescentes deixam de carregar colunas
-- de clientes da superfície removida.
alter table private.authoring_workspaces
  drop column api_client_id cascade;

do $$
declare
  v_column record;
begin
  for v_column in
    select
      namespace_value.nspname as schema_name,
      class_value.relname as table_name,
      attribute_value.attname as column_name
    from pg_attribute attribute_value
    join pg_class class_value
      on class_value.oid = attribute_value.attrelid
    join pg_namespace namespace_value
      on namespace_value.oid = class_value.relnamespace
    where namespace_value.nspname in ('public', 'private')
      and class_value.relkind in ('r', 'p')
      and attribute_value.attnum > 0
      and not attribute_value.attisdropped
      and attribute_value.attname in (
        'api_client_id',
        'publication_client_id',
        'rotated_from_client_id'
      )
  loop
    execute format(
      'alter table %I.%I drop column %I cascade',
      v_column.schema_name,
      v_column.table_name,
      v_column.column_name
    );
  end loop;
end;
$$;

-- Remove RPCs, auxiliares e tabelas que existiam somente para emitir, usar ou
-- administrar credenciais paralelas e comandos estruturais fora do MCP.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in (
        'create_authoring_api_client',
        'rotate_authoring_api_client',
        'revoke_authoring_api_client',
        'resolve_authoring_api_client',
        'private_authoring_integration_json',
        'create_private_authoring_integration',
        'list_private_authoring_integrations',
        'rotate_private_authoring_integration',
        'revoke_private_authoring_integration',
        'authoring_assert_private_identity',
        'begin_personal_library_command',
        'complete_personal_library_command',
        'require_personal_library_client',
        'get_personal_library_course_structure',
        'list_personal_study_paths',
        'rename_personal_library_course',
        'create_personal_study_path',
        'rename_personal_study_path',
        'delete_personal_study_path',
        'move_personal_course_selection',
        'begin_catalog_submission_authoring_command',
        'complete_catalog_submission_authoring_command',
        'require_catalog_submission_authoring_client',
        'list_catalog_submission_candidates_authoring',
        'list_catalog_submission_queue_authoring',
        'list_my_catalog_submissions_authoring',
        'submit_personal_course_to_catalog_authoring',
        'withdraw_catalog_submission_authoring',
        'start_catalog_submission_review_authoring',
        'decide_catalog_submission_authoring',
        'course_revision_access_allowed',
        'open_course_content_revision',
        'save_course_content_revision_patch',
        'get_course_content_revision',
        'get_course_content_revision_document_rows',
        'get_course_content_revision_fragment',
        'apply_course_content_revision',
        'resolve_private_course_revision_target',
        'apply_authoring_command',
        'dispatch_authoring_command',
        'dispatch_authoring_command_v2',
        'replay_authoring_command',
        'replay_authoring_command_dispatch',
        'begin_authoring_request_v3',
        'claim_authoring_publication',
        'claim_authoring_private_materialization',
        'begin_authoring_private_course_import',
        'apply_authoring_private_course_import_chunk',
        'finalize_authoring_private_course_import',
        'get_catalog_course_admin',
        'list_catalog_courses_admin',
        'create_catalog_collection_admin',
        'rename_catalog_collection_admin',
        'retire_catalog_collection_admin',
        'reorder_catalog_collections_admin',
        'move_catalog_course_admin',
        'reorder_catalog_courses_admin'
      )
  loop
    execute format('drop function if exists %s cascade', v_function.signature);
  end loop;
end;
$$;

-- As assinaturas antigas são removidas nominalmente depois de suas versões
-- OAuth terem sido criadas. Sobrecargas novas não são atingidas.
drop function if exists public.publish_authoring_workspace_course_v4(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) cascade;
drop function if exists public.publish_authoring_workspace_course_v4_impl(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) cascade;
drop function if exists public.replay_authoring_workspace_request_v4(
  uuid,uuid,text,text,text
) cascade;
drop function if exists public.create_authoring_workspace_v4(
  uuid,uuid,uuid,text,text,text,text,jsonb,uuid,text
) cascade;
drop function if exists public.commit_authoring_workspace_revision_v4(
  uuid,uuid,uuid,text,text,bigint,text,jsonb
) cascade;
drop function if exists public.get_authoring_workspace_v4(
  uuid,uuid,uuid,bigint
) cascade;
drop function if exists public.list_authoring_workspaces_v4(
  uuid,uuid,integer,timestamptz,uuid
) cascade;
drop function if exists public.list_authoring_workspace_history_v4(
  uuid,uuid,uuid,integer,bigint
) cascade;
drop function if exists public.get_course_document_artifact_v4(
  uuid,uuid,uuid
) cascade;
drop function if exists public.delete_authoring_workspace_v4(
  uuid,uuid,uuid,text,text
) cascade;
drop function if exists public.list_authoring_catalog_collections_v4(
  uuid,uuid,integer,integer,uuid,text
) cascade;
drop function if exists public.list_authoring_catalog_courses_v4(
  uuid,uuid,uuid,integer,integer,uuid,text
) cascade;
drop function if exists public.list_personal_library_courses(
  uuid,uuid,integer,integer,uuid,text
) cascade;
drop function if exists private.lock_workspace_catalog_publication_authority_v4(
  uuid,uuid
) cascade;
drop function if exists private.require_workspace_actor_v4(
  uuid,uuid,text
) cascade;

drop table if exists private.personal_library_command_receipts cascade;
drop table if exists private.authoring_api_rate_windows cascade;
drop table if exists private.authoring_api_client_events cascade;
drop table if exists private.authoring_api_clients cascade;
drop function if exists private.authoring_client_has_scope(uuid,uuid,text);

-- Falha fechada: o schema final não pode expor assinatura, corpo ou coluna da
-- identidade paralela eliminada.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and (
        coalesce(p.proargnames, array[]::text[]) && array[
          'p_client_id',
          'p_api_client_id'
        ]::text[]
        or p.prosrc ~ '(p_client_id|p_api_client_id|api_client_id|publication_client_id|authoring_api_client)'
      )
  ) then
    raise exception 'O schema ainda contém identidade paralela de autoria.'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from pg_attribute attribute_value
    join pg_class class_value
      on class_value.oid = attribute_value.attrelid
    join pg_namespace namespace_value
      on namespace_value.oid = class_value.relnamespace
    where namespace_value.nspname in ('public', 'private')
      and attribute_value.attnum > 0
      and not attribute_value.attisdropped
      and attribute_value.attname in (
        'api_client_id',
        'publication_client_id',
        'rotated_from_client_id'
      )
  ) then
    raise exception 'O schema ainda contém coluna de identidade paralela.'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from unnest(array[
      'public.resolve_authoring_oauth_principal(uuid)',
      'private.require_workspace_actor_v4(uuid,text)',
      'private.lock_workspace_catalog_publication_authority_v4(uuid)',
      'private.require_catalog_admin_actor(uuid,boolean)',
      'private.register_artifact_v4(jsonb)',
      'public.replay_authoring_workspace_request_v4(uuid,text,text,text)',
      'public.create_authoring_workspace_v4(uuid,uuid,text,text,text,text,jsonb,uuid,text)',
      'public.commit_authoring_workspace_revision_v4(uuid,uuid,text,text,bigint,text,jsonb)',
      'public.get_authoring_workspace_v4(uuid,uuid,bigint)',
      'public.list_authoring_workspaces_v4(uuid,integer,timestamptz,uuid)',
      'public.list_authoring_workspace_history_v4(uuid,uuid,integer,bigint)',
      'public.get_course_document_artifact_v4(uuid,uuid)',
      'public.delete_authoring_workspace_v4(uuid,uuid,text,text)',
      'public.list_authoring_catalog_collections_v4(uuid,integer,integer,uuid,text)',
      'public.list_authoring_catalog_courses_v4(uuid,uuid,integer,integer,uuid,text)',
      'public.list_personal_library_courses(uuid,integer,integer,uuid,text)',
      'public.publish_authoring_workspace_course_v4(uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb)',
      'public.publish_authoring_workspace_course_v4_impl(uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb)',
      'public.list_catalog_collections_admin(uuid,integer,integer,uuid,text,boolean)',
      'public.resolve_catalog_artifact_publisher_v4(text,uuid)',
      'public.get_course_revision_artifact_v4(uuid,uuid,text)',
      'public.claim_unreferenced_artifacts_v4(uuid,interval,integer)',
      'public.complete_artifact_gc_v4(uuid,text,boolean)'
    ]::text[]) required(signature)
    where to_regprocedure(required.signature) is null
  ) then
    raise exception 'Os RPCs OAuth nativos não foram instalados.'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from unnest(array[
      'private.require_workspace_actor_v4(uuid,uuid,text)',
      'private.lock_workspace_catalog_publication_authority_v4(uuid,uuid)',
      'public.replay_authoring_workspace_request_v4(uuid,uuid,text,text,text)',
      'public.create_authoring_workspace_v4(uuid,uuid,uuid,text,text,text,text,jsonb,uuid,text)',
      'public.commit_authoring_workspace_revision_v4(uuid,uuid,uuid,text,text,bigint,text,jsonb)',
      'public.get_authoring_workspace_v4(uuid,uuid,uuid,bigint)',
      'public.list_authoring_workspaces_v4(uuid,uuid,integer,timestamptz,uuid)',
      'public.list_authoring_workspace_history_v4(uuid,uuid,uuid,integer,bigint)',
      'public.get_course_document_artifact_v4(uuid,uuid,uuid)',
      'public.delete_authoring_workspace_v4(uuid,uuid,uuid,text,text)',
      'public.list_authoring_catalog_collections_v4(uuid,uuid,integer,integer,uuid,text)',
      'public.list_authoring_catalog_courses_v4(uuid,uuid,uuid,integer,integer,uuid,text)',
      'public.list_personal_library_courses(uuid,uuid,integer,integer,uuid,text)',
      'public.publish_authoring_workspace_course_v4(uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb)',
      'public.publish_authoring_workspace_course_v4_impl(uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb)'
    ]::text[]) retired(signature)
    where to_regprocedure(retired.signature) is not null
  ) then
    raise exception 'Uma assinatura anterior de autoria ainda está ativa.'
      using errcode = '55000';
  end if;
end;
$$;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260729080000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'artifact-offline-replica',
      'granular-sync',
      'private-authoring',
      'text-language-metadata',
      'storage-artifact-control-plane',
      'immutable-course-revisions',
      'storage-only-course-content',
      'canonical-resource-registry',
      'atomic-resource-authoring',
      'atomic-card-assistance',
      'versioned-authoring-workspaces',
      'partial-private-publication',
      'microtheory-review-projection',
      'workspace-cursor-pagination',
      'oauth-only-authoring-mcp'
    )
  );
$function$;

commit;
