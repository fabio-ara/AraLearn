begin;

select pg_advisory_xact_lock(hashtextextended('aralearn-authoring-workspace-hardening-v4', 0));

-- O registro de artefatos é infraestrutura do fluxo v4. O nome v3 restante
-- era um detalhe privado ainda chamado por três funções vigentes.
alter function private.register_artifact_v3(jsonb)
  rename to register_artifact_v4;

alter table private.artifact_refs
  drop constraint artifact_refs_size;
alter table private.artifact_refs
  add constraint artifact_refs_size_v4
    check (size_bytes between 1 and 33554432);

create function private.lock_authoring_workspace_request_v4(
  p_owner_id uuid,
  p_request_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
  if p_owner_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Identidade da requisição de workspace inválida.'
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v4:' || p_owner_id::text || ':' || p_request_id,
    0
  ));
end;
$$;

create function private.lock_workspace_catalog_publication_authority_v4(
  p_owner_id uuid,
  p_client_id uuid
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

  if p_client_id is not null then
    perform 1
    from private.authoring_api_clients client
    where client.id = p_client_id
      and client.owner_user_id = p_owner_id
      and client.revoked_at is null
      and (client.expires_at is null or client.expires_at > now())
      and 'catalog:publish' = any(client.scopes)
    for share;
    if not found then
      raise exception 'Credencial editorial inválida ou revogada.'
        using errcode = '42501';
    end if;
  end if;
end;
$$;

revoke all on function private.lock_authoring_workspace_request_v4(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_workspace_catalog_publication_authority_v4(uuid,uuid)
  from public, anon, authenticated, service_role;

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_before text := $patch$
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:write'
  );$patch$;
  v_after text := $patch$
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:write'
  );
  perform private.lock_authoring_workspace_request_v4(
    p_owner_id, p_request_id
  );$patch$;
begin
  foreach v_signature in array array[
    'public.create_authoring_workspace_v4(uuid,uuid,uuid,text,text,text,text,jsonb,uuid,text)'::regprocedure,
    'public.commit_authoring_workspace_revision_v4(uuid,uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure,
    'public.delete_authoring_workspace_v4(uuid,uuid,uuid,text,text)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_signature);
    if position(v_after in v_definition) > 0 then
      null;
    elsif position(v_before in v_definition) = 0 then
      raise exception 'Prólogo de mutação de workspace inesperado: %', v_signature
        using errcode = '55000';
    else
      execute replace(v_definition, v_before, v_after);
    end if;
  end loop;
end;
$$;

create or replace function public.publish_authoring_workspace_course_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_target text,
  p_completion_state text,
  p_publication_mode text,
  p_existing_course_id uuid,
  p_expected_content_hash text,
  p_collection_id uuid,
  p_metadata jsonb,
  p_artifact jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.require_workspace_actor_v4(
    p_owner_id,
    p_client_id,
    case when p_target = 'catalog'
      then 'catalog:publish'
      else 'authoring:write'
    end
  );
  perform private.lock_authoring_workspace_request_v4(
    p_owner_id, p_request_id
  );

  if p_target = 'catalog' then
    perform private.lock_workspace_catalog_publication_authority_v4(
      p_owner_id, p_client_id
    );
    if p_collection_id is null then
      raise exception 'A publicação oficial exige uma coleção.'
        using errcode = '22023';
    end if;
    perform 1
    from public.catalog_collections collection
    where collection.id = p_collection_id
      and collection.is_published
      and collection.deleted_at is null
    for share;
    if not found then
      raise exception 'Coleção de catálogo inexistente ou indisponível.'
        using errcode = 'AR422';
    end if;
  elsif p_collection_id is not null then
    raise exception 'A publicação privada não recebe coleção.'
      using errcode = '22023';
  end if;

  return public.publish_authoring_workspace_course_v4_impl(
    p_owner_id,
    p_client_id,
    p_workspace_id,
    p_request_id,
    p_payload_hash,
    p_expected_revision,
    p_target,
    p_completion_state,
    p_publication_mode,
    p_existing_course_id,
    p_expected_content_hash,
    p_collection_id,
    p_metadata,
    p_artifact
  );
end;
$$;

revoke all on function public.publish_authoring_workspace_course_v4(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.publish_authoring_workspace_course_v4(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) to service_role;
revoke all on function public.publish_authoring_workspace_course_v4_impl(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) from public, anon, authenticated, service_role;

do $$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'private.register_artifact_v4(jsonb)'::regprocedure,
    'public.claim_unreferenced_artifacts_v4(uuid,interval,integer)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_signature);
    if position('aralearn-artifact-gc-v4' in v_definition) > 0 then
      null;
    elsif position('aralearn-artifact-gc-v3' in v_definition) = 0 then
      raise exception 'Chave de coleta de artefato inesperada: %', v_signature
        using errcode = '55000';
    else
      execute replace(
        v_definition,
        'aralearn-artifact-gc-v3',
        'aralearn-artifact-gc-v4'
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.create_authoring_workspace_v4(uuid,uuid,uuid,text,text,text,text,jsonb,uuid,text)'::regprocedure,
    'public.commit_authoring_workspace_revision_v4(uuid,uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure,
    'public.publish_authoring_workspace_course_v4_impl(uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_signature);
    if position('private.register_artifact_v3' in v_definition) > 0 then
      execute replace(
        v_definition,
        'private.register_artifact_v3',
        'private.register_artifact_v4'
      );
    elsif position('private.register_artifact_v4' in v_definition) = 0 then
      raise exception 'Consumidor de artefato v4 inesperado: %', v_signature
        using errcode = '55000';
    end if;
  end loop;
end;
$$;

-- Importar um curso para um workspace existente cria uma revisão normal. A
-- RPC original aceitava a operação nas tabelas de revisão/recibo, mas a
-- rejeitava antes do compare-and-swap por omissão na lista de mutações.
do $$
declare
  v_signature regprocedure :=
    'public.commit_authoring_workspace_revision_v4(uuid,uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_before text := $patch$
     or p_operation not in (
       'insert_entity', 'replace_entity', 'rename_entity', 'move_entity',
       'delete_entity', 'merge_microsequences', 'split_microsequence',
       'promote_module', 'demote_course', 'restore_revision'
     ) then$patch$;
  v_after text := $patch$
     or p_operation not in (
       'import_course', 'insert_entity', 'replace_entity', 'rename_entity',
       'move_entity', 'delete_entity', 'merge_microsequences',
       'split_microsequence', 'promote_module', 'demote_course',
       'restore_revision'
     ) then$patch$;
begin
  if position(v_after in v_definition) > 0 then
    null;
  elsif position(v_before in v_definition) = 0 then
    raise exception 'Lista de mutações do workspace inesperada.'
      using errcode = '55000';
  else
    execute replace(v_definition, v_before, v_after);
  end if;
end;
$$;

-- O papel service_role da Edge ignora RLS; portanto a RPC precisa reproduzir
-- explicitamente a fronteira de leitura. Um usuário comum não pode obter por
-- UUID um rascunho ou curso arquivado do catálogo, nem ampliar esse acesso por
-- uma seleção pessoal. O proprietário continua lendo o próprio curso privado
-- e os papéis editoriais canônicos podem inspecionar o catálogo não publicado.
do $$
declare
  v_signature regprocedure :=
    'public.get_course_document_artifact_v4(uuid,uuid,uuid)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_before text := $patch$
    and (
      course.owner_id is null
      or course.owner_id = p_owner_id
      or exists (
        select 1 from public.user_course_selections selection
        where selection.user_id = p_owner_id and selection.course_id = course.id
      )
    );$patch$;
  v_after text := $patch$
    and (
      course.owner_id = p_owner_id
      or (
        course.owner_id is null
        and (
          course.status = 'published'
          or private.has_active_app_role(p_owner_id, 'owner')
          or private.has_active_app_role(p_owner_id, 'catalog_publisher')
        )
      )
    );$patch$;
begin
  if position(v_after in v_definition) > 0 then
    null;
  elsif position(v_before in v_definition) = 0 then
    raise exception 'Guarda de leitura de curso inesperada.'
      using errcode = '55000';
  else
    execute replace(v_definition, v_before, v_after);
  end if;
end;
$$;

-- O endpoint de revisões atende o estudo/offline, não a inspeção editorial.
-- Ele entrega somente cursos privados ao proprietário e cursos de catálogo
-- efetivamente publicados; registros excluídos deixam de ser resolvíveis.
do $$
declare
  v_signature regprocedure :=
    'public.get_course_revision_artifact_v4(uuid,uuid,text)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_before text := $patch$
  select * into v_course from public.courses
  where id = p_course_id;
  if not found then return null; end if;
  if not (
    v_course.owner_id is null or v_course.owner_id = p_actor_id
  ) then$patch$;
  v_after text := $patch$
  select * into v_course from public.courses
  where id = p_course_id
    and deleted_at is null
    and document_storage_enabled;
  if not found then return null; end if;
  if not (
    v_course.owner_id = p_actor_id
    or (v_course.owner_id is null and v_course.status = 'published')
  ) then$patch$;
begin
  if position(v_after in v_definition) > 0 then
    null;
  elsif position(v_before in v_definition) = 0 then
    raise exception 'Guarda de revisão de curso inesperada.'
      using errcode = '55000';
  else
    execute replace(v_definition, v_before, v_after);
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname in ('public', 'private')
      and (
        procedure_value.proname = 'register_artifact_v3'
        or procedure_value.prosrc like '%register_artifact_v3%'
        or procedure_value.prosrc like '%aralearn-artifact-gc-v3%'
      )
  ) then
    raise exception 'O plano de controle ainda contém o registro de artefatos v3.'
      using errcode = '55000';
  end if;
end;
$$;

alter table private.authoring_workspace_requests
  add column result jsonb;

-- Recibos guardam a resposta original, e não uma reconstrução baseada no
-- curso ou workspace depois de novas revisões.
update private.authoring_workspace_requests request
set result = private.workspace_revision_result_v4(
  workspace,
  request.result_revision,
  false
)
from private.authoring_workspaces workspace
where request.result is null
  and request.operation in (
    'create', 'import_course', 'insert_entity', 'replace_entity',
    'rename_entity', 'move_entity', 'delete_entity',
    'merge_microsequences', 'split_microsequence',
    'promote_module', 'demote_course', 'restore_revision'
  )
  and request.workspace_id = workspace.id
  and request.result_revision is not null;

update private.authoring_workspace_requests request
set result = jsonb_build_object(
  'workspaceId', request.workspace_id,
  'revision', request.result_revision,
  'courseId', course.id,
  'contentHash', coalesce((
    select revision.revision_hash
    from private.course_revisions revision
    where revision.course_id = course.id
      and revision.published_at <= request.created_at
    order by revision.published_at desc, revision.created_at desc
    limit 1
  ), course.current_revision_hash),
  'completionState', case
    when request.operation = 'publish_private_preview' then 'partial'
    else 'complete'
  end,
  'target', case
    when request.operation = 'publish_catalog_complete' then 'catalog'
    else 'private'
  end,
  'idempotent', false
)
from public.courses course
where request.result is null
  and request.result_course_id = course.id;

update private.authoring_workspace_requests request
set result = jsonb_build_object(
  'workspaceId', request.workspace_id,
  'deleted', true,
  'idempotent', false
)
where request.result is null
  and request.operation = 'delete_workspace';

do $$
begin
  if exists (
    select 1
    from private.authoring_workspace_requests request
    where request.result is null
       or jsonb_typeof(request.result) <> 'object'
  ) then
    raise exception 'Não foi possível materializar todos os recibos de workspace.'
      using errcode = '55000';
  end if;
end;
$$;

alter table private.authoring_workspace_requests
  alter column result set not null,
  add constraint authoring_workspace_requests_result_v4
    check (jsonb_typeof(result) = 'object');

create function private.populate_authoring_workspace_request_result_v4()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace private.authoring_workspaces%rowtype;
  v_course public.courses%rowtype;
begin
  if new.result is not null then
    raise exception 'O recibo é calculado pelo plano de controle.'
      using errcode = '22023';
  end if;

  if new.result_course_id is not null then
    select *
    into v_course
    from public.courses course
    where course.id = new.result_course_id;
    if not found then
      raise exception 'Curso de resultado inexistente.' using errcode = '55000';
    end if;
    new.result := jsonb_build_object(
      'workspaceId', new.workspace_id,
      'revision', new.result_revision,
      'courseId', v_course.id,
      'contentHash', v_course.current_revision_hash,
      'completionState', v_course.completion_state,
      'target', case when v_course.owner_id is null then 'catalog' else 'private' end,
      'idempotent', false
    );
  elsif new.operation = 'delete_workspace' then
    new.result := jsonb_build_object(
      'workspaceId', new.workspace_id,
      'deleted', true,
      'idempotent', false
    );
  else
    select *
    into v_workspace
    from private.authoring_workspaces workspace
    where workspace.id = new.workspace_id
      and workspace.owner_id = new.owner_id;
    if not found or new.result_revision is null then
      raise exception 'Revisão de resultado inexistente.' using errcode = '55000';
    end if;
    new.result := private.workspace_revision_result_v4(
      v_workspace,
      new.result_revision,
      false
    );
  end if;

  return new;
end;
$$;

revoke all on function private.populate_authoring_workspace_request_result_v4()
  from public, anon, authenticated, service_role;

create trigger populate_authoring_workspace_request_result_v4
before insert on private.authoring_workspace_requests
for each row
execute function private.populate_authoring_workspace_request_result_v4();

create or replace function public.replay_authoring_workspace_request_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_operation text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request private.authoring_workspace_requests%rowtype;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id,
    p_client_id,
    case when p_operation = 'publish_catalog_complete'
      then 'catalog:publish'
      else 'authoring:write'
    end
  );
  select *
  into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id
    and request.request_id = p_request_id;
  if not found then return null; end if;
  if v_request.payload_hash <> p_payload_hash
     or v_request.operation <> p_operation then
    raise exception 'requestId reutilizado com dados diferentes.'
      using errcode = '23505';
  end if;
  return v_request.result || jsonb_build_object('idempotent', true);
end;
$$;

revoke all on function public.replay_authoring_workspace_request_v4(
  uuid,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.replay_authoring_workspace_request_v4(
  uuid,uuid,text,text,text
) to service_role;

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_before text;
  v_create_before text := $patch$
    select * into v_workspace from private.authoring_workspaces
    where id = v_request.workspace_id and owner_id = p_owner_id;
    return private.workspace_revision_result_v4(
      v_workspace, v_request.result_revision, true
    );$patch$;
  v_commit_before text := $patch$
    select * into v_workspace from private.authoring_workspaces
    where id = p_workspace_id and owner_id = p_owner_id;
    return private.workspace_revision_result_v4(
      v_workspace, v_request.result_revision, true
    );$patch$;
  v_after text := $patch$
    return v_request.result || jsonb_build_object('idempotent', true);$patch$;
begin
  foreach v_signature in array array[
    'public.create_authoring_workspace_v4(uuid,uuid,uuid,text,text,text,text,jsonb,uuid,text)'::regprocedure,
    'public.commit_authoring_workspace_revision_v4(uuid,uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_signature);
    v_before := case
      when v_signature =
        'public.create_authoring_workspace_v4(uuid,uuid,uuid,text,text,text,text,jsonb,uuid,text)'::regprocedure
        then v_create_before
      else v_commit_before
    end;
    if position(v_before in v_definition) = 0 then
      raise exception 'Ramo idempotente de mutação inesperado: %', v_signature
        using errcode = '55000';
    end if;
    execute replace(v_definition, v_before, v_after);
  end loop;
end;
$$;

do $$
declare
  v_signature regprocedure :=
    'public.publish_authoring_workspace_course_v4_impl(uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_before text := $patch$
    return jsonb_build_object(
      'workspaceId', p_workspace_id,
      'revision', v_request.result_revision,
      'courseId', v_request.result_course_id,
      'completionState', p_completion_state,
      'idempotent', true
    );$patch$;
  v_after text := $patch$
    return v_request.result || jsonb_build_object('idempotent', true);$patch$;
begin
  if position(v_before in v_definition) = 0 then
    raise exception 'Ramo idempotente de publicação inesperado.'
      using errcode = '55000';
  end if;
  execute replace(v_definition, v_before, v_after);
end;
$$;

create or replace function public.list_authoring_workspaces_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_result jsonb;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:read'
  );
  if p_limit is null or p_limit < 1 or p_limit > 100
     or ((p_before_updated_at is null) <> (p_before_id is null)) then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;

  with candidates as materialized (
    select workspace.*
    from private.authoring_workspaces workspace
    where workspace.owner_id = p_owner_id
      and workspace.deleted_at is null
      and (
        p_before_updated_at is null
        or (workspace.updated_at, workspace.id) < (p_before_updated_at, p_before_id)
      )
    order by workspace.updated_at desc, workspace.id desc
    limit p_limit + 1
  ),
  page as (
    select *
    from candidates
    order by updated_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'workspaceId', page.id,
        'title', page.title,
        'revision', page.revision,
        'sourceCourseId', page.source_course_id,
        'sourceRevisionHash', page.source_revision_hash,
        'updatedAt', page.updated_at,
        'createdAt', page.created_at
      ) order by page.updated_at desc, page.id desc)
      from page
    ), '[]'::jsonb),
    'hasMore', (select count(*) from candidates) > p_limit,
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt', page.updated_at,
        'beforeId', page.id
      )
      from page
      order by page.updated_at, page.id
      limit 1
    ) else null end
  )
  into v_result;

  return v_result;
end;
$$;

drop function public.list_authoring_workspace_history_v4(
  uuid,uuid,uuid,integer
);

create function public.list_authoring_workspace_history_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_workspace_id uuid,
  p_limit integer default 50,
  p_before_revision bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_result jsonb;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:read'
  );
  if p_limit is null or p_limit < 1 or p_limit > 100
     or (p_before_revision is not null and p_before_revision < 1) then
    raise exception 'Paginação de histórico inválida.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from private.authoring_workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_id = p_owner_id
      and workspace.deleted_at is null
  ) then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;

  with candidates as materialized (
    select revision.*
    from private.authoring_workspace_revisions revision
    where revision.workspace_id = p_workspace_id
      and (
        p_before_revision is null
        or revision.revision < p_before_revision
      )
    order by revision.revision desc
    limit p_limit + 1
  ),
  page as (
    select *
    from candidates
    order by revision desc
    limit p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', page.revision,
        'parentRevision', page.parent_revision,
        'operation', page.operation,
        'requestId', page.request_id,
        'actorId', page.actor_id,
        'artifactHash', page.artifact_hash,
        'createdAt', page.created_at
      ) order by page.revision desc)
      from page
    ), '[]'::jsonb),
    'hasMore', (select count(*) from candidates) > p_limit,
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object('beforeRevision', page.revision)
      from page
      order by page.revision
      limit 1
    ) else null end
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.list_authoring_workspace_history_v4(
  uuid,uuid,uuid,integer,bigint
) from public, anon, authenticated;
grant execute on function public.list_authoring_workspace_history_v4(
  uuid,uuid,uuid,integer,bigint
) to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260729070000',
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
      'workspace-cursor-pagination'
    )
  );
$function$;

commit;
