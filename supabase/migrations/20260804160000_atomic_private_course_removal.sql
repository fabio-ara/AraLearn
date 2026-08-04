-- A exclusão de workspace passa a usar CAS, e a retirada de um curso privado
-- encerra sua composição vinculada na mesma transação que arquiva o curso.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-atomic-private-course-removal-v1',
  0
));

-- Vínculos antigos em workspaces já encerrados não representam composições
-- correntes. Em eventuais duplicatas históricas, a composição mais recente
-- conserva a continuidade; as demais continuam como projetos independentes.
delete from private.authoring_workspace_publications publication
using private.authoring_workspaces workspace
where workspace.id = publication.workspace_id
  and workspace.deleted_at is not null;

with ranked as materialized (
  select
    publication.workspace_id,
    publication.workspace_course_id,
    publication.target,
    publication.course_id,
    row_number() over (
      partition by publication.course_id, publication.target
      order by
        (publication.content_hash = course.current_revision_hash) desc nulls last,
        publication.updated_at desc, workspace.updated_at desc,
        publication.workspace_id, publication.workspace_course_id
    ) as ordinal
  from private.authoring_workspace_publications publication
  join private.authoring_workspaces workspace
    on workspace.id = publication.workspace_id
  join public.courses course on course.id = publication.course_id
  where workspace.deleted_at is null
), removed as (
  delete from private.authoring_workspace_publications publication
  using ranked duplicate
  where duplicate.ordinal > 1
    and publication.workspace_id = duplicate.workspace_id
    and publication.workspace_course_id = duplicate.workspace_course_id
    and publication.target = duplicate.target
  returning publication.workspace_id, publication.course_id
)
update private.authoring_workspaces workspace
set source_course_id = null,
    source_revision_hash = null
where workspace.deleted_at is null
  and workspace.source_submission_id is null
  and exists (
    select 1
    from removed duplicate
    where duplicate.workspace_id = workspace.id
      and duplicate.course_id = workspace.source_course_id
  );

create unique index authoring_workspace_publications_current_course_v1_idx
  on private.authoring_workspace_publications(course_id, target);

-- Excluir uma raiz publicada também libera sua identidade de origem. Sem
-- isso, um workspace composto podia conservar source_course_id depois que a
-- raiz correspondente saía e impedir a reabertura legítima do curso.
create or replace function private.cleanup_workspace_course_publication_v5()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if old.entity_type = 'course' then
    update private.authoring_workspaces workspace
    set source_course_id = null,
        source_revision_hash = null,
        updated_at = now()
    where workspace.id = old.workspace_id
      and exists (
        select 1
        from private.authoring_workspace_publications publication
        where publication.workspace_id = old.workspace_id
          and publication.workspace_course_id = old.entity_id
          and publication.course_id = workspace.source_course_id
      );

    delete from private.authoring_workspace_publications publication
    where publication.workspace_id = old.workspace_id
      and publication.workspace_course_id = old.entity_id;
  end if;
  return old;
end;
$function$;

-- A capacidade editorial global vale dinamicamente na composição oficial.
-- Não se grava um membership administrativo residual: ao revogar o papel de
-- publicador, o acesso adicional desaparece em todas as RPCs na mesma hora.
create or replace function private.educational_workspace_can_v1(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select coalesce((
    select case p_capability
      when 'read' then member.role in (
        'owner', 'admin', 'author', 'reviewer', 'learner', 'reader'
      )
      when 'author' then member.role in ('owner', 'admin', 'author')
      when 'review' then member.role in ('owner', 'admin', 'author', 'reviewer')
      when 'comment' then member.role in (
        'owner', 'admin', 'author', 'reviewer', 'learner'
      )
      when 'publish' then member.role in ('owner', 'admin', 'author')
      when 'manage' then member.role in ('owner', 'admin')
      when 'transfer' then member.role = 'owner'
        and workspace.owner_id = p_actor_id
      else false
    end
    from private.educational_workspace_members member
    join private.authoring_workspaces workspace
      on workspace.id = member.workspace_id
    where member.workspace_id = p_workspace_id
      and member.user_id = p_actor_id
      and workspace.deleted_at is null
  ), false) or (
    p_capability in ('read', 'author', 'review', 'comment', 'publish', 'manage')
    and private.can_publish_catalog_v5(p_actor_id)
    and exists (
      select 1 from private.authoring_workspaces workspace
      where workspace.id = p_workspace_id
        and workspace.deleted_at is null
        and (
          exists (
            select 1
            from private.authoring_workspace_publications publication
            where publication.workspace_id = workspace.id
              and publication.target = 'catalog'
          )
          or exists (
            select 1
            from public.courses source_course
            where source_course.id = workspace.source_course_id
              and source_course.owner_id is null
              and source_course.status = 'published'
              and source_course.deleted_at is null
              and source_course.document_storage_enabled
          )
        )
    )
  )
$function$;

create function private.guard_authoring_workspace_publication_identity_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-course-workspace-v1:' || new.course_id::text || ':' || new.target,
    0
  ));
  if exists (
    select 1
    from private.authoring_workspace_publications publication
    where publication.course_id = new.course_id
      and publication.target = new.target
      and (
        publication.workspace_id,
        publication.workspace_course_id,
        publication.target
      ) is distinct from (
        new.workspace_id,
        new.workspace_course_id,
        new.target
      )
  ) or exists (
    select 1
    from private.authoring_workspaces workspace
    where workspace.source_course_id = new.course_id
      and workspace.source_submission_id is null
      and workspace.deleted_at is null
      and workspace.id <> new.workspace_id
  ) then
    raise exception 'A composição corrente está em outro workspace; abra a composição existente.'
      using errcode = '40001';
  end if;
  return new;
end;
$function$;

create trigger guard_authoring_workspace_publication_identity_v1
before insert or update of workspace_id, workspace_course_id, target, course_id
on private.authoring_workspace_publications
for each row execute function
  private.guard_authoring_workspace_publication_identity_v1();

-- Toda seleção trava e revalida a publicação antes de entrar. Assim, uma
-- seleção concorrente com a retirada oficial espera o arquivamento e falha,
-- em vez de nascer depois que o gatilho de tombstones já terminou.
create function private.guard_active_course_selection_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform 1
  from public.courses course
  where course.id = new.course_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  for share;
  if not found then
    raise exception 'O curso deixou de estar disponível; releia Trilhas ou Coleções.'
      using errcode = '40001';
  end if;
  return new;
end;
$function$;

create trigger guard_active_course_selection_v1
before insert or update of course_id on public.user_course_selections
for each row execute function private.guard_active_course_selection_v1();

create table private.authoring_course_workspace_reservations (
  course_id uuid not null references public.courses(id) on delete cascade,
  target text not null,
  workspace_id uuid not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  primary key(course_id, target),
  constraint authoring_course_workspace_reservations_target check (
    target in ('private', 'catalog')
  ),
  constraint authoring_course_workspace_reservations_request check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint authoring_course_workspace_reservations_hash check (
    payload_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint authoring_course_workspace_reservations_expiry check (
    expires_at > created_at
  )
);

create index authoring_course_workspace_reservations_expiry_idx
  on private.authoring_course_workspace_reservations(expires_at, course_id);

create function public.resume_or_reserve_authoring_workspace_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_target text;
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_reservation private.authoring_course_workspace_reservations%rowtype;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'authoring:write');
  if p_course_id is null
     or p_workspace_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash is null
     or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Reserva de workspace inválida.' using errcode = '22023';
  end if;

  select case when course.owner_id is null then 'catalog' else 'private' end
  into v_target
  from public.courses course
  where course.id = p_course_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
    and (
      course.owner_id = p_actor_id
      or (
        course.owner_id is null
        and private.can_publish_catalog_v5(p_actor_id)
      )
      or exists (
        select 1
        from private.authoring_workspace_publications publication
        join private.authoring_workspaces workspace
          on workspace.id = publication.workspace_id
        where publication.course_id = course.id
          and workspace.deleted_at is null
          and private.educational_workspace_can_v1(
            workspace.id, p_actor_id, 'author'
          )
      )
    )
  for share;
  if not found then
    raise exception 'Curso de origem não pode ser editado nesta conta.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-course-workspace-v1:' || p_course_id::text || ':' || v_target,
    0
  ));
  delete from private.authoring_course_workspace_reservations reservation
  where reservation.ctid in (
    select expired.ctid
    from private.authoring_course_workspace_reservations expired
    where expired.expires_at <= statement_timestamp()
    order by expired.expires_at, expired.course_id
    limit 256
    for update skip locked
  );

  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_actor_id and request.request_id = p_request_id;
  if found then
    if v_request.operation <> 'create'
       or v_request.payload_hash <> p_payload_hash then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select workspace.* into v_workspace
  from private.authoring_workspace_publications publication
  join private.authoring_workspaces workspace
    on workspace.id = publication.workspace_id
  where publication.course_id = p_course_id
    and publication.target = v_target
    and workspace.deleted_at is null
    and private.educational_workspace_can_v1(
      workspace.id, p_actor_id, 'author'
    )
  order by workspace.updated_at desc, workspace.id
  limit 1;
  if found then
    v_result := private.workspace_result_v5(
      v_workspace,
      true,
      jsonb_build_object(
        'operation', 'reuse_active_course_workspace',
        'created', 0,
        'updated', 0,
        'deleted', 0
      )
    );
    insert into private.authoring_workspace_requests(
      owner_id, request_id, operation, payload_hash, workspace_id, result
    ) values (
      p_actor_id, p_request_id, 'create', p_payload_hash,
      v_workspace.id, v_result
    );
    return v_result;
  end if;

  if exists (
    select 1
    from private.authoring_workspace_publications publication
    join private.authoring_workspaces workspace
      on workspace.id = publication.workspace_id
    where publication.course_id = p_course_id
      and publication.target = v_target
      and workspace.deleted_at is null
  ) then
    raise exception 'A composição corrente pertence a outro workspace.'
      using errcode = '42501';
  end if;

  select * into v_reservation
  from private.authoring_course_workspace_reservations reservation
  where reservation.course_id = p_course_id
    and reservation.target = v_target
  for update;
  if found then
    if v_reservation.owner_id <> p_actor_id
       or v_reservation.request_id <> p_request_id
       or v_reservation.payload_hash <> p_payload_hash then
      raise exception 'A composição já possui outra abertura em andamento; releia e tente novamente.'
        using errcode = '40001';
    end if;
    return jsonb_build_object(
      'reservationState', 'reserved',
      'workspaceId', v_reservation.workspace_id,
      'target', v_target
    );
  end if;

  insert into private.authoring_course_workspace_reservations(
    course_id, target, workspace_id, owner_id, request_id, payload_hash
  ) values (
    p_course_id, v_target, p_workspace_id, p_actor_id,
    p_request_id, p_payload_hash
  );
  return jsonb_build_object(
    'reservationState', 'reserved',
    'workspaceId', p_workspace_id,
    'target', v_target
  );
end;
$function$;

create function public.finalize_reserved_authoring_workspace_v1(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_title text,
  p_source_course_id uuid,
  p_source_revision_hash text,
  p_source_submission_id uuid,
  p_brief text,
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_target text;
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:write');
  if p_source_course_id is null or p_source_submission_id is not null then
    raise exception 'Finalização reservada inválida.' using errcode = '22023';
  end if;
  select case when course.owner_id is null then 'catalog' else 'private' end
  into v_target
  from public.courses course
  where course.id = p_source_course_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
    and course.current_revision_hash = p_source_revision_hash
    and (
      course.owner_id = p_owner_id
      or (
        course.owner_id is null
        and private.can_publish_catalog_v5(p_owner_id)
      )
    )
  for share;
  if not found then
    raise exception 'Curso de origem não pode ser editado nesta conta.'
      using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-course-workspace-v1:' || p_source_course_id::text || ':' || v_target,
    0
  ));

  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id and request.request_id = p_request_id;
  if found then
    if v_request.operation <> 'create'
       or v_request.payload_hash <> p_payload_hash then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select workspace.* into v_workspace
  from private.authoring_workspace_publications publication
  join private.authoring_workspaces workspace
    on workspace.id = publication.workspace_id
  where publication.course_id = p_source_course_id
    and publication.target = v_target
    and workspace.deleted_at is null
    and private.educational_workspace_can_v1(
      workspace.id, p_owner_id, 'author'
    )
  limit 1;
  if found then
    v_result := private.workspace_result_v5(
      v_workspace,
      true,
      jsonb_build_object(
        'operation', 'reuse_active_course_workspace',
        'created', 0,
        'updated', 0,
        'deleted', 0
      )
    );
    insert into private.authoring_workspace_requests(
      owner_id, request_id, operation, payload_hash, workspace_id, result
    ) values (
      p_owner_id, p_request_id, 'create', p_payload_hash,
      v_workspace.id, v_result
    );
    delete from private.authoring_course_workspace_reservations reservation
    where reservation.course_id = p_source_course_id
      and reservation.target = v_target;
    return v_result;
  end if;

  perform 1
  from private.authoring_course_workspace_reservations reservation
  where reservation.course_id = p_source_course_id
    and reservation.target = v_target
    and reservation.workspace_id = p_workspace_id
    and reservation.owner_id = p_owner_id
    and reservation.request_id = p_request_id
    and reservation.payload_hash = p_payload_hash
    and reservation.expires_at > statement_timestamp()
  for update;
  if not found then
    raise exception 'A reserva da composição expirou; releia e tente novamente.'
      using errcode = '40001';
  end if;

  v_result := public.create_authoring_workspace_v5(
    p_owner_id,
    p_workspace_id,
    p_request_id,
    p_payload_hash,
    p_title,
    p_source_course_id,
    p_source_revision_hash,
    null,
    p_brief,
    p_rows
  );
  delete from private.authoring_course_workspace_reservations reservation
  where reservation.course_id = p_source_course_id
    and reservation.target = v_target;
  return v_result;
end;
$function$;

create function private.discard_authoring_workspace_v1(
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  update private.catalog_review_submissions submission
  set review_workspace_id = null, updated_at = now()
  where submission.review_workspace_id = p_workspace_id;

  update public.card_comments comment_row
  set workspace_id = null
  where comment_row.workspace_id = p_workspace_id;

  delete from private.authoring_workspace_observations observation
  where observation.workspace_id = p_workspace_id;
  delete from private.authoring_workspace_observation_receipts receipt
  where receipt.result->>'workspaceId' = p_workspace_id::text;
  delete from private.educational_workspace_receipts receipt
  where receipt.result->>'workspaceId' = p_workspace_id::text;

  -- A exclusão das raízes aciona a retirada dos vínculos de publicação antes
  -- de os participantes serem removidos, preservando os tombstones de acesso.
  delete from private.authoring_workspace_entities entity
  where entity.workspace_id = p_workspace_id;
  -- Protege também dados anteriores cujo vínculo não apontava para uma raiz
  -- existente; o gatilho de acesso ainda precisa rodar antes dos memberships.
  delete from private.authoring_workspace_publications publication
  where publication.workspace_id = p_workspace_id;

  delete from private.authoring_workspace_events event
  where event.workspace_id = p_workspace_id;
  delete from private.educational_workspace_invitations invitation
  where invitation.workspace_id = p_workspace_id;
  delete from private.educational_workspace_members member
  where member.workspace_id = p_workspace_id;
  delete from private.authoring_workspace_requests request
  where request.workspace_id = p_workspace_id;
  delete from private.authoring_course_workspace_reservations reservation
  where reservation.workspace_id = p_workspace_id;

  update private.authoring_workspaces workspace
  set brief = '',
      purpose = '',
      source_course_id = null,
      source_revision_hash = null,
      source_submission_id = null,
      deleted_at = coalesce(workspace.deleted_at, now()),
      updated_at = now()
  where workspace.id = p_workspace_id;
end;
$function$;

create function private.detach_course_compositions_v1(
  p_course_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_link record;
  v_course_count integer;
  v_next_revision bigint;
begin
  -- Uma retirada invalida imediatamente qualquer abertura ainda não
  -- materializada. A finalização tardia terá de reler o curso.
  delete from private.authoring_course_workspace_reservations reservation
  where reservation.course_id = p_course_id;

  for v_link in
    select publication.workspace_id, publication.workspace_course_id,
      publication.target
    from private.authoring_workspace_publications publication
    join private.authoring_workspaces workspace
      on workspace.id = publication.workspace_id
    where publication.course_id = p_course_id
      and workspace.deleted_at is null
    order by publication.workspace_id, publication.workspace_course_id
  loop
    perform 1
    from private.authoring_workspaces workspace
    where workspace.id = v_link.workspace_id
      and workspace.deleted_at is null
    for update;
    if not found then
      continue;
    end if;
    perform 1
    from private.authoring_workspace_publications publication
    where publication.workspace_id = v_link.workspace_id
      and publication.workspace_course_id = v_link.workspace_course_id
      and publication.target = v_link.target
      and publication.course_id = p_course_id
    for update;
    if not found then
      continue;
    end if;

    select count(*) into v_course_count
    from private.authoring_workspace_entities entity
    where entity.workspace_id = v_link.workspace_id
      and entity.entity_type = 'course';

    if v_course_count <= 1 then
      perform private.discard_authoring_workspace_v1(v_link.workspace_id);
      continue;
    end if;

    delete from private.authoring_workspace_observations observation
    where observation.workspace_id = v_link.workspace_id
      and observation.entity_type <> 'workspace'
      and observation.entity_path[1] = v_link.workspace_course_id;

    with recursive subtree as (
      select entity.workspace_id, entity.entity_type, entity.entity_id
      from private.authoring_workspace_entities entity
      where entity.workspace_id = v_link.workspace_id
        and entity.entity_type = 'course'
        and entity.entity_id = v_link.workspace_course_id
      union all
      select child.workspace_id, child.entity_type, child.entity_id
      from private.authoring_workspace_entities child
      join subtree parent
        on child.workspace_id = parent.workspace_id
       and child.parent_type = parent.entity_type
       and child.parent_id = parent.entity_id
    )
    delete from private.authoring_workspace_entities entity
    using subtree target
    where entity.workspace_id = target.workspace_id
      and entity.entity_type = target.entity_type
      and entity.entity_id = target.entity_id;

    with ordered as materialized (
      select entity.workspace_id, entity.entity_id,
        row_number() over (
          order by entity.position, entity.entity_id
        )::integer - 1 as next_position
      from private.authoring_workspace_entities entity
      where entity.workspace_id = v_link.workspace_id
        and entity.entity_type = 'course'
    )
    update private.authoring_workspace_entities entity
    set position = ordered.next_position,
        version = entity.version + 1,
        updated_at = now()
    from ordered
    where entity.workspace_id = ordered.workspace_id
      and entity.entity_type = 'course'
      and entity.entity_id = ordered.entity_id
      and entity.position <> ordered.next_position;

    update private.authoring_workspaces workspace
    set revision = workspace.revision + 1,
        source_course_id = case
          when workspace.source_course_id = p_course_id then null
          else workspace.source_course_id
        end,
        source_revision_hash = case
          when workspace.source_course_id = p_course_id then null
          else workspace.source_revision_hash
        end,
        updated_at = now()
    where workspace.id = v_link.workspace_id
      and workspace.deleted_at is null
    returning workspace.revision into v_next_revision;

    insert into private.authoring_workspace_events(
      workspace_id, revision, operation, summary, actor_id
    ) values (
      v_link.workspace_id,
      v_next_revision,
      'delete_entity',
      jsonb_build_object(
        'operation', 'delete_entity',
        'created', 0,
        'updated', 0,
        'deleted', 1,
        'entityType', 'course',
        'entityPath', jsonb_build_array(v_link.workspace_course_id)
      ),
      p_actor_id
    );

    delete from private.authoring_workspace_events event
    where event.id in (
      select stale.id
      from private.authoring_workspace_events stale
      where stale.workspace_id = v_link.workspace_id
      order by stale.revision desc
      offset 200
    );
  end loop;
end;
$function$;

-- Converge workspaces históricos abertos a partir do mesmo curso. O vínculo
-- explícito vigente vence; sem vínculo, somente uma origem cuja revisão ainda
-- seja a corrente pode ser vinculada. As demais tentativas são preservadas
-- como projetos independentes, sem fingir que representam o artefato atual.
do $reconcile_preexisting_course_compositions$
declare
  v_course record;
  v_workspace record;
  v_canonical_workspace_id uuid;
  v_workspace_course_id text;
  v_course_count integer;
  v_target text;
begin
  for v_course in
    select course.id, course.owner_id, course.contract_key,
      course.current_revision_hash
    from public.courses course
    where course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
      and (
        exists (
          select 1
          from private.authoring_workspace_publications publication
          where publication.course_id = course.id
        )
        or exists (
          select 1
          from private.authoring_workspaces workspace
          where workspace.source_course_id = course.id
            and workspace.source_submission_id is null
            and workspace.deleted_at is null
        )
      )
    order by course.id
  loop
    v_target := case when v_course.owner_id is null
      then 'catalog' else 'private' end;
    select workspace.id into v_canonical_workspace_id
    from private.authoring_workspaces workspace
    where workspace.deleted_at is null
      and (
        (
          workspace.source_course_id = v_course.id
          and workspace.source_submission_id is null
          and workspace.source_revision_hash = v_course.current_revision_hash
        )
        or exists (
          select 1
          from private.authoring_workspace_publications publication
          where publication.workspace_id = workspace.id
            and publication.course_id = v_course.id
            and publication.target = v_target
        )
      )
    order by
      exists (
        select 1
        from private.authoring_workspace_publications publication
        where publication.workspace_id = workspace.id
          and publication.course_id = v_course.id
          and publication.target = v_target
          and publication.content_hash = v_course.current_revision_hash
      ) desc,
      exists (
        select 1
        from private.authoring_workspace_publications publication
        where publication.workspace_id = workspace.id
          and publication.course_id = v_course.id
          and publication.target = v_target
      ) desc,
      (workspace.source_revision_hash = v_course.current_revision_hash) desc,
      workspace.updated_at desc,
      workspace.id
    limit 1;

    for v_workspace in
      select workspace.id
      from private.authoring_workspaces workspace
      where workspace.source_course_id = v_course.id
        and workspace.source_submission_id is null
        and workspace.deleted_at is null
        and workspace.id is distinct from v_canonical_workspace_id
      order by workspace.id
      for update
    loop
      update private.authoring_workspaces workspace
      set source_course_id = null,
          source_revision_hash = null,
          updated_at = now()
      where workspace.id = v_workspace.id;
    end loop;

    if v_canonical_workspace_id is not null and not exists (
      select 1
      from private.authoring_workspace_publications publication
      where publication.workspace_id = v_canonical_workspace_id
        and publication.course_id = v_course.id
        and publication.target = v_target
    ) then
      select min(entity.entity_id), count(*)
      into v_workspace_course_id, v_course_count
      from private.authoring_workspace_entities entity
      where entity.workspace_id = v_canonical_workspace_id
        and entity.entity_type = 'course'
        and (
          entity.entity_id = v_course.contract_key
          or not exists (
            select 1
            from private.authoring_workspace_entities exact_entity
            where exact_entity.workspace_id = v_canonical_workspace_id
              and exact_entity.entity_type = 'course'
              and exact_entity.entity_id = v_course.contract_key
          )
        );
      if v_course_count = 1 then
        insert into private.authoring_workspace_publications(
          workspace_id, workspace_course_id, target, course_id, content_hash
        ) values (
          v_canonical_workspace_id, v_workspace_course_id, v_target,
          v_course.id, v_course.current_revision_hash
        );
      else
        update private.authoring_workspaces workspace
        set source_course_id = null,
            source_revision_hash = null,
            updated_at = now()
        where workspace.id = v_canonical_workspace_id;
      end if;
    end if;
  end loop;
end;
$reconcile_preexisting_course_compositions$;

-- Corrige também resíduos cuja fonte já foi arquivada antes deste corte. Um
-- vínculo explícito identifica com segurança a raiz a retirar; uma mera
-- referência de origem não, portanto o projeto é preservado e desvinculado.
do $close_preexisting_archived_compositions$
declare
  v_course record;
  v_workspace record;
begin
  for v_course in
    select course.id, course.owner_id
    from public.courses course
    where (
        course.status <> 'published'
        or course.deleted_at is not null
        or not course.document_storage_enabled
      )
      and exists (
        select 1
        from private.authoring_workspace_publications publication
        where publication.course_id = course.id
      )
    order by course.id
  loop
    perform private.detach_course_compositions_v1(
      v_course.id, v_course.owner_id
    );
  end loop;

  for v_workspace in
    select workspace.id
    from private.authoring_workspaces workspace
    left join public.courses source_course
      on source_course.id = workspace.source_course_id
    where workspace.deleted_at is null
      and workspace.source_submission_id is null
      and workspace.source_revision_hash is not null
      and (
        workspace.source_course_id is null
        or source_course.id is null
        or source_course.status <> 'published'
        or source_course.deleted_at is not null
        or not source_course.document_storage_enabled
      )
    order by workspace.id
    for update of workspace
  loop
    update private.authoring_workspaces workspace
    set source_course_id = null,
        source_revision_hash = null,
        updated_at = now()
    where workspace.id = v_workspace.id;
  end loop;
end;
$close_preexisting_archived_compositions$;

create unique index authoring_workspaces_current_source_course_v1_idx
  on private.authoring_workspaces(source_course_id)
  where deleted_at is null
    and source_submission_id is null
    and source_course_id is not null;

create function private.close_archived_course_compositions_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if old.status = 'published'
     and old.deleted_at is null
     and old.document_storage_enabled
     and tg_op = 'DELETE' then
    perform private.detach_course_compositions_v1(
      old.id, old.owner_id
    );
    return old;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if old.status = 'published'
     and old.deleted_at is null
     and old.document_storage_enabled
     and (
       new.status <> 'published'
       or new.deleted_at is not null
       or not new.document_storage_enabled
     ) then
    perform private.detach_course_compositions_v1(
      old.id, old.owner_id
    );
  end if;
  return new;
end;
$function$;

create trigger close_archived_course_compositions_v1
before update of status, deleted_at, document_storage_enabled or delete
on public.courses
for each row execute function
  private.close_archived_course_compositions_v1();

-- A retirada de uma publicação oficial elimina, na mesma transação, todas as
-- seleções diretas. As cascatas vigentes limpam progresso/comentários e seus
-- gatilhos emitem os tombstones individuais; o RPC administrativo conserva o
-- tombstone global da revisão oficial.
create or replace function private.capture_catalog_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if old.owner_id is not null or new.owner_id is not null then
    return new;
  end if;
  if old.status = 'published'
     and old.deleted_at is null
     and old.document_storage_enabled
     and (
       new.status <> 'published'
       or new.deleted_at is not null
       or not new.document_storage_enabled
     ) then
    delete from public.user_course_selections selection
    where selection.course_id = new.id;
  elsif new.status = 'published' and new.deleted_at is null
     and (old.content_hash is distinct from new.content_hash
          or old.publication_seq is distinct from new.publication_seq
          or old.status is distinct from new.status
          or old.deleted_at is distinct from new.deleted_at) then
    perform pg_advisory_xact_lock(hashtextextended(
      'aralearn-sync-feed-commit-order', 0
    ));
    insert into private.sync_changes(
      audience_user_id, course_id, entity_type, entity_id, operation
    ) values (null, new.id, 'coursePublication', new.id, 'publish');
  end if;
  return new;
end;
$function$;

drop function public.delete_authoring_workspace_v5(uuid, uuid, text, text);

create function public.delete_authoring_workspace_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:write');
  if p_workspace_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1 then
    raise exception 'Exclusão de workspace inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_owner_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(
    p_owner_id,
    p_request_id
  );
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id and request.request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> 'delete_workspace'
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.deleted_at is null
    and private.educational_workspace_can_v1(
      workspace.id, p_owner_id, 'manage'
    )
  for update;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.revision <> p_expected_revision then
    raise exception 'Revisão base desatualizada.' using errcode = '40001';
  end if;

  perform private.discard_authoring_workspace_v1(p_workspace_id);
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'deleted', true,
    'idempotent', false
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values (
    p_owner_id, p_request_id, 'delete_workspace', p_payload_hash,
    p_workspace_id, v_result
  );
  return v_result;
end;
$function$;

revoke all on table private.authoring_course_workspace_reservations
  from public, anon, authenticated, service_role;
revoke all on function public.resume_or_reserve_authoring_workspace_v1(
  uuid, uuid, uuid, text, text
)
  from public, anon, authenticated;
grant execute on function public.resume_or_reserve_authoring_workspace_v1(
  uuid, uuid, uuid, text, text
)
  to service_role;
revoke all on function public.finalize_reserved_authoring_workspace_v1(
  uuid, uuid, text, text, text, uuid, text, uuid, text, jsonb
)
  from public, anon, authenticated;
grant execute on function public.finalize_reserved_authoring_workspace_v1(
  uuid, uuid, text, text, text, uuid, text, uuid, text, jsonb
)
  to service_role;
revoke all on function public.delete_authoring_workspace_v5(uuid, uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.delete_authoring_workspace_v5(uuid, uuid, text, text, bigint)
  to service_role;
revoke all on function private.discard_authoring_workspace_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.detach_course_compositions_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.close_archived_course_compositions_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.educational_workspace_can_v1(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.guard_authoring_workspace_publication_identity_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_active_course_selection_v1()
  from public, anon, authenticated, service_role;

create or replace function public.list_trail_items_v1(
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or ((p_after_position is null) <> (p_after_id is null))
     or coalesce(p_after_position, 0) < 0 then
    raise exception 'Consulta de Trilhas inválida.' using errcode = '22023';
  end if;

  with accessible_workspaces as materialized (
    select workspace.*
    from private.authoring_workspaces workspace
    where workspace.deleted_at is null
      and private.educational_workspace_can_v1(
        workspace.id, v_user_id, 'read'
      )
  ), workspace_courses as materialized (
    select
      'workspace:' || workspace.id::text || ':' || course.entity_id as item_id,
      workspace.id as workspace_id,
      course.entity_id as course_key,
      publication.course_id,
      selection.id as selection_id,
      case when counts.card_count = 0 then 'plan' else 'course' end as item_kind,
      'workspace'::text as source_kind,
      case
        when publication.target = 'catalog' then 'catalog'
        when publication.target = 'private' then 'private'
        else 'workspace'
      end as course_origin,
      coalesce(nullif(btrim(course.content->>'title'), ''), workspace.title) as title,
      coalesce(course.content->>'goal', workspace.purpose, '') as description,
      counts.module_count,
      counts.lesson_count,
      counts.microsequence_count,
      counts.card_count,
      publication.content_hash,
      private.educational_workspace_can_v1(
        workspace.id, v_user_id, 'author'
      ) as can_edit,
      case
        when publication.target = 'catalog'
          then private.can_publish_catalog_v5(v_user_id)
        else private.educational_workspace_can_v1(workspace.id, v_user_id, 'manage')
      end as can_delete,
      selection.id is not null and (
        publication.target = 'catalog'
        or publication.course_owner_id = v_user_id
      ) as can_remove,
      coalesce(selection.position, 1000000 + row_number() over (
        order by workspace.updated_at desc, workspace.id, course.position, course.entity_id
      )::integer) as position,
      greatest(workspace.updated_at, course.updated_at) as updated_at
    from accessible_workspaces workspace
    join private.authoring_workspace_entities course
      on course.workspace_id = workspace.id
     and course.entity_type = 'course'
    left join lateral (
      select
        count(distinct module_value.entity_id)::integer as module_count,
        count(distinct lesson.entity_id)::integer as lesson_count,
        count(distinct microsequence.entity_id)::integer as microsequence_count,
        count(distinct card.entity_id)::integer as card_count
      from private.authoring_workspace_entities module_value
      left join private.authoring_workspace_entities lesson
        on lesson.workspace_id = module_value.workspace_id
       and lesson.entity_type = 'lesson'
       and lesson.parent_type = 'module'
       and lesson.parent_id = module_value.entity_id
      left join private.authoring_workspace_entities microsequence
        on microsequence.workspace_id = lesson.workspace_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.parent_type = 'lesson'
       and microsequence.parent_id = lesson.entity_id
      left join private.authoring_workspace_entities card
        on card.workspace_id = microsequence.workspace_id
       and card.entity_type = 'card'
       and card.parent_type = 'microsequence'
       and card.parent_id = microsequence.entity_id
      where module_value.workspace_id = workspace.id
        and module_value.entity_type = 'module'
        and module_value.parent_type = 'course'
        and module_value.parent_id = course.entity_id
    ) counts on true
    left join lateral (
      select link.course_id, link.target, link.content_hash,
        linked_course.owner_id as course_owner_id
      from private.authoring_workspace_publications link
      join public.courses linked_course on linked_course.id = link.course_id
      where link.workspace_id = workspace.id
        and link.workspace_course_id = course.entity_id
      order by case
          when link.target = 'catalog'
            and private.can_publish_catalog_v5(v_user_id) then 0
          when link.target = 'private' then 1
          else 2
        end,
        link.updated_at desc
      limit 1
    ) publication on true
    left join public.user_course_selections selection
      on selection.user_id = v_user_id
     and selection.course_id = publication.course_id
  ), empty_workspace_plans as materialized (
    select
      'workspace:' || workspace.id::text || ':plan' as item_id,
      workspace.id as workspace_id,
      null::text as course_key,
      null::uuid as course_id,
      null::uuid as selection_id,
      'plan'::text as item_kind,
      'workspace'::text as source_kind,
      'workspace'::text as course_origin,
      workspace.title,
      coalesce(workspace.purpose, workspace.brief, '') as description,
      0::integer as module_count,
      0::integer as lesson_count,
      0::integer as microsequence_count,
      0::integer as card_count,
      null::text as content_hash,
      private.educational_workspace_can_v1(workspace.id, v_user_id, 'author') as can_edit,
      private.educational_workspace_can_v1(workspace.id, v_user_id, 'manage') as can_delete,
      false as can_remove,
      1000000 + row_number() over (
        order by workspace.updated_at desc, workspace.id
      )::integer as position,
      workspace.updated_at
    from accessible_workspaces workspace
    where not exists (
      select 1 from private.authoring_workspace_entities entity
      where entity.workspace_id = workspace.id and entity.entity_type = 'course'
    )
  ), selected_courses as materialized (
    select
      'course:' || course.id::text as item_id,
      null::uuid as workspace_id,
      null::text as course_key,
      course.id as course_id,
      selection.id as selection_id,
      'course'::text as item_kind,
      'selection'::text as source_kind,
      case when course.owner_id is null then 'catalog' else 'private' end as course_origin,
      course.title,
      coalesce(course.goal, '') as description,
      course.module_count::integer,
      course.lesson_count::integer,
      course.microsequence_count::integer,
      course.card_count::integer,
      course.current_revision_hash as content_hash,
      case
        when course.owner_id is null
          then private.can_publish_catalog_v5(v_user_id)
        else course.owner_id = v_user_id
      end as can_edit,
      case
        when course.owner_id is null
          then private.can_publish_catalog_v5(v_user_id)
        else course.owner_id = v_user_id
      end as can_delete,
      (course.owner_id is null or course.owner_id = v_user_id) as can_remove,
      selection.position,
      greatest(selection.updated_at, course.updated_at) as updated_at
    from public.user_course_selections selection
    join public.courses course on course.id = selection.course_id
    where selection.user_id = v_user_id
      and course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
      and not exists (
        select 1
        from private.authoring_workspace_publications publication
        join accessible_workspaces workspace on workspace.id = publication.workspace_id
        where publication.course_id = course.id
      )
  ), all_items as materialized (
    select * from workspace_courses
    union all
    select * from empty_workspace_plans
    union all
    select * from selected_courses
  ), candidates as materialized (
    select * from all_items
    where p_after_position is null or (position, item_id) > (p_after_position, p_after_id)
    order by position, item_id
    limit p_limit + 1
  ), page as materialized (
    select * from candidates order by position, item_id limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'itemId', page.item_id,
      'workspaceId', page.workspace_id,
      'courseKey', page.course_key,
      'courseId', page.course_id,
      'selectionId', page.selection_id,
      'kind', page.item_kind,
      'source', page.source_kind,
      'origin', page.course_origin,
      'title', page.title,
      'description', page.description,
      'moduleCount', page.module_count,
      'lessonCount', page.lesson_count,
      'microsequenceCount', page.microsequence_count,
      'cardCount', page.card_count,
      'contentHash', page.content_hash,
      'canEdit', page.can_edit,
      'canDelete', page.can_delete,
      'canRemove', page.can_remove,
      'position', page.position,
      'updatedAt', page.updated_at
    ) order by page.position, page.item_id), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'afterPosition', page.position,
        'afterId', page.item_id
      )
      from page order by page.position desc, page.item_id desc limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;

  return jsonb_build_object(
    'space', 'trails',
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor,
    'capabilities', jsonb_build_object(
      'catalogManage', private.can_publish_catalog_v5(v_user_id),
      'catalogReview', private.can_review_catalog_v5(v_user_id)
    )
  );
end;
$function$;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260804160000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog','artifact-offline-replica','granular-sync',
      'private-authoring','text-language-metadata','storage-artifact-control-plane',
      'pre-registered-publication-artifacts','single-current-course-revision',
      'storage-only-course-content','canonical-resource-registry','atomic-resource-authoring',
      'atomic-card-assistance','composed-authoring-workspaces','workspace-publication-bindings',
      'unchanged-publication-short-circuit','bounded-authoring-events','partial-private-publication',
      'microtheory-review-projection','workspace-cursor-pagination','workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination','global-catalog-course-search',
      'catalog-review-submissions','catalog-management','personal-library-course-removal',
      'course-revision-sync-compaction','automatic-sync-history-maintenance','compact-authoring-brief',
      'account-derived-authoring-capabilities','oauth-only-authoring-mcp','default-catalog-collection',
      'confidential-gpt-action-oauth','gpt-action-oauth-linking','gpt-action-oauth-relinking',
      'gpt-action-oauth-stable-callback','workspace-card-metadata','structured-authoring-errors',
      'situated-personal-comments-v1','educational-workspace-membership-v1',
      'educational-workspace-invitations-v1','workspace-capability-enforcement-v1',
      'workspace-member-course-access-v1','workspace-contextual-current-state-v1',
      'workspace-pedagogical-comments-v1','workspace-course-state-projection-v1',
      'non-punitive-study-state-v1','non-punitive-study-projections-v1',
      'workspace-comment-aggregates-v1','integrated-trails-v1',
      'plans-derived-from-current-content-v1','workspace-entity-observations-v1',
      'workspace-delete-cas-v1','atomic-private-course-removal-v1',
      'atomic-catalog-course-removal-v1',
      'single-active-course-composition-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
