begin;

-- O plano de controle pessoal atende integrações externas sem lhes conceder
-- acesso direto às tabelas. A identidade do usuário e a do cliente são
-- resolvidas pelo servidor e revalidadas novamente no PostgreSQL.
create table private.personal_library_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references private.authoring_api_clients(id)
    on delete cascade,
  request_id text not null,
  operation text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id),
  constraint personal_library_receipts_request_id check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint personal_library_receipts_operation check (
    operation in (
      'rename_course',
      'create_path',
      'rename_path',
      'delete_path',
      'move_selection'
    )
  ),
  constraint personal_library_receipts_hash check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint personal_library_receipts_result check (
    jsonb_typeof(result) = 'object'
    and pg_column_size(result) <= 65536
  )
);

create index personal_library_receipts_created_idx
  on private.personal_library_command_receipts(
    created_at, actor_user_id, request_id
  );

create or replace function private.require_personal_library_client(
  p_actor_user_id uuid,
  p_client_id uuid,
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

  if p_actor_user_id is null
     or p_client_id is null
     or p_scope not in (
       'authoring:private:read',
       'authoring:private:write'
     )
     or not private.user_can_use_authoring_scope(
       p_actor_user_id, p_scope
     )
     or not private.authoring_client_has_scope(
       p_client_id, p_actor_user_id, p_scope
     ) then
    raise exception 'Integração pessoal não autorizada.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.begin_personal_library_command(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
declare
  v_receipt private.personal_library_command_receipts%rowtype;
  v_request_hash text;
begin
  perform private.require_personal_library_client(
    p_actor_user_id,
    p_client_id,
    'authoring:private:write'
  );

  if p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation is null
     or p_operation not in (
       'rename_course',
       'create_path',
       'rename_path',
       'delete_path',
       'move_selection'
     )
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Comando da biblioteca pessoal inválido.'
      using errcode = '22023';
  end if;

  v_request_hash := encode(extensions.digest(
    convert_to(
      jsonb_build_object(
        'operation', p_operation,
        'payload', p_payload
      )::text,
      'UTF8'
    ),
    'sha256'
  ), 'hex');

  -- Os comandos pessoais são pouco frequentes. Uma trava por conta fixa a
  -- ordem de posição e elimina corridas entre mover e excluir uma trilha.
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-personal-library:' || p_actor_user_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_actor_user_id::text || ':' || p_request_id,
    0
  ));

  select * into v_receipt
  from private.personal_library_command_receipts receipt
  where receipt.actor_user_id = p_actor_user_id
    and receipt.request_id = p_request_id
  for share;

  if found then
    if v_receipt.operation <> p_operation
       or v_receipt.request_hash <> v_request_hash then
      raise exception
        'requestId já foi usado com outro comando da biblioteca pessoal.'
        using errcode = 'PL409';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'requestHash', v_request_hash,
      'result', v_receipt.result
    );
  end if;

  return jsonb_build_object(
    'replayed', false,
    'requestHash', v_request_hash
  );
end;
$$;

create or replace function private.complete_personal_library_command(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_operation text,
  p_request_hash text,
  p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'Resultado da biblioteca pessoal inválido.'
      using errcode = '22023';
  end if;

  insert into private.personal_library_command_receipts(
    actor_user_id,
    client_id,
    request_id,
    operation,
    request_hash,
    result
  ) values (
    p_actor_user_id,
    p_client_id,
    p_request_id,
    p_operation,
    p_request_hash,
    p_result
  );
end;
$$;

create or replace function public.list_personal_library_courses(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_selection_id uuid default null,
  p_query text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_items jsonb := '[]'::jsonb;
  v_item record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_last_position integer;
  v_last_selection_id uuid;
begin
  perform private.require_personal_library_client(
    p_actor_user_id,
    p_client_id,
    'authoring:private:read'
  );

  if p_limit is null
     or p_limit not between 1 and 100
     or char_length(v_query) > 160
     or (
       (p_after_position is null) <>
       (p_after_selection_id is null)
     )
     or (
       p_after_position is not null
       and p_after_position < 0
     ) then
    raise exception 'Paginação da biblioteca pessoal inválida.'
      using errcode = '22023';
  end if;

  for v_item in
    select
      selection.position,
      selection.id as selection_id,
      jsonb_build_object(
        'selectionId', selection.id,
        'courseId', course.id,
        'catalogCourseId', coalesce(
          course.source_course_id, course.id
        ),
        'sourceCourseId', course.source_course_id,
        'kind', case
          when course.owner_id is null then 'official'
          else 'personal'
        end,
        'editable', course.owner_id is not null,
        'contractKey', course.contract_key,
        'title', course.title,
        'goal', course.goal,
        'position', selection.position,
        'publicationSeq', course.publication_seq,
        'catalogRevision', course.catalog_revision,
        'contentHash', course.content_hash,
        'moduleCount', (
          select count(*)
          from public.modules module
          where module.course_id = course.id
        ),
        'lessonCount', (
          select count(*)
          from public.lessons lesson
          where lesson.course_id = course.id
        ),
        'pathId', path.id,
        'pathTitle', path.title,
        'lastActivityAt', greatest(
          (
            select max(progress.last_activity_at)
            from public.lesson_progress progress
            where progress.selection_id = selection.id
          ),
          (
            select max(progress.last_activity_at)
            from public.card_progress progress
            where progress.selection_id = selection.id
          )
        )
      ) as item
    from public.user_course_selections selection
    join public.courses course
      on course.id = selection.course_id
    left join public.study_path_courses path_course
      on path_course.owner_id = p_actor_user_id
      and path_course.selection_id = selection.id
    left join public.study_paths path
      on path.id = path_course.path_id
      and path.owner_id = p_actor_user_id
    where selection.user_id = p_actor_user_id
      and course.status = 'published'
      and course.deleted_at is null
      and (
        course.owner_id is null
        or course.owner_id = p_actor_user_id
      )
      and (
        v_query = ''
        or position(lower(v_query) in lower(
          course.title || ' ' || course.goal || ' ' ||
          course.contract_key
        )) > 0
      )
      and (
        p_after_position is null
        or (selection.position, selection.id) >
          (p_after_position, p_after_selection_id)
      )
    order by selection.position, selection.id
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;
    v_items := v_items || jsonb_build_array(v_item.item);
    v_last_position := v_item.position;
    v_last_selection_id := v_item.selection_id;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'afterPosition', v_last_position,
      'afterSelectionId', v_last_selection_id
    ) else null end
  );
end;
$$;

create or replace function public.get_personal_library_course_structure(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_course_id uuid,
  p_section text default 'modules',
  p_parent_id uuid default null,
  p_limit integer default 100,
  p_after_position integer default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_summary jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_last_position integer;
  v_last_id uuid;
begin
  perform private.require_personal_library_client(
    p_actor_user_id,
    p_client_id,
    'authoring:private:read'
  );

  if p_course_id is null
     or p_section is null
     or p_section not in (
       'modules', 'lessons', 'microsequences', 'cards'
     )
     or p_limit is null
     or p_limit not between 1 and 200
     or (
       (p_after_position is null) <>
       (p_after_id is null)
     )
     or (
       p_after_position is not null
       and p_after_position < 0
     ) then
    raise exception 'Consulta de estrutura inválida.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.courses course
    join public.user_course_selections selection
      on selection.course_id = course.id
      and selection.user_id = p_actor_user_id
    where course.id = p_course_id
      and course.status = 'published'
      and course.deleted_at is null
      and (
        course.owner_id is null
        or course.owner_id = p_actor_user_id
      )
  ) then
    raise exception 'Curso selecionado não encontrado.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'selectionId', selection.id,
    'courseId', course.id,
    'catalogCourseId', coalesce(
      course.source_course_id, course.id
    ),
    'kind', case
      when course.owner_id is null then 'official'
      else 'personal'
    end,
    'editable', course.owner_id is not null,
    'contractKey', course.contract_key,
    'title', course.title,
    'goal', course.goal,
    'position', selection.position,
    'publicationSeq', course.publication_seq,
    'catalogRevision', course.catalog_revision,
    'contentHash', course.content_hash,
    'moduleCount', (
      select count(*) from public.modules module
      where module.course_id = course.id
    ),
    'lessonCount', (
      select count(*) from public.lessons lesson
      where lesson.course_id = course.id
    ),
    'microsequenceCount', (
      select count(*) from public.microsequences microsequence
      where microsequence.course_id = course.id
    ),
    'cardCount', (
      select count(*) from public.cards card
      where card.course_id = course.id
    )
  )
  into v_summary
  from public.courses course
  join public.user_course_selections selection
    on selection.course_id = course.id
    and selection.user_id = p_actor_user_id
  where course.id = p_course_id;

  if p_section = 'modules' then
    if p_parent_id is not null then
      raise exception 'Módulos não recebem parentId.'
        using errcode = '22023';
    end if;
    for v_item in
      select
        module.position,
        module.id,
        jsonb_build_object(
          'id', module.id,
          'contractKey', module.contract_key,
          'title', module.title,
          'position', module.position,
          'lessonCount', (
            select count(*) from public.lessons lesson
            where lesson.module_id = module.id
          )
        ) as item
      from public.modules module
      where module.course_id = p_course_id
        and (
          p_after_position is null
          or (module.position, module.id) >
            (p_after_position, p_after_id)
        )
      order by module.position, module.id
      limit p_limit + 1
    loop
      v_count := v_count + 1;
      if v_count > p_limit then
        v_has_more := true;
        exit;
      end if;
      v_items := v_items || jsonb_build_array(v_item.item);
      v_last_position := v_item.position;
      v_last_id := v_item.id;
    end loop;
  elsif p_section = 'lessons' then
    if p_parent_id is null or not exists (
      select 1 from public.modules module
      where module.id = p_parent_id
        and module.course_id = p_course_id
    ) then
      raise exception 'Estrutura selecionada não encontrada.'
        using errcode = '42501';
    end if;
    for v_item in
      select
        lesson.position,
        lesson.id,
        jsonb_build_object(
          'id', lesson.id,
          'moduleId', lesson.module_id,
          'contractKey', lesson.contract_key,
          'title', lesson.title,
          'position', lesson.position,
          'microsequenceCount', (
            select count(*)
            from public.microsequences microsequence
            where microsequence.lesson_id = lesson.id
          )
        ) as item
      from public.lessons lesson
      where lesson.course_id = p_course_id
        and lesson.module_id = p_parent_id
        and (
          p_after_position is null
          or (lesson.position, lesson.id) >
            (p_after_position, p_after_id)
        )
      order by lesson.position, lesson.id
      limit p_limit + 1
    loop
      v_count := v_count + 1;
      if v_count > p_limit then
        v_has_more := true;
        exit;
      end if;
      v_items := v_items || jsonb_build_array(v_item.item);
      v_last_position := v_item.position;
      v_last_id := v_item.id;
    end loop;
  elsif p_section = 'microsequences' then
    if p_parent_id is null or not exists (
      select 1 from public.lessons lesson
      where lesson.id = p_parent_id
        and lesson.course_id = p_course_id
    ) then
      raise exception 'Estrutura selecionada não encontrada.'
        using errcode = '42501';
    end if;
    for v_item in
      select
        microsequence.position,
        microsequence.id,
        jsonb_build_object(
          'id', microsequence.id,
          'lessonId', microsequence.lesson_id,
          'contractKey', microsequence.contract_key,
          'title', microsequence.title,
          'goal', microsequence.goal,
          'role', microsequence.role,
          'status', microsequence.status,
          'position', microsequence.position,
          'dependsOnIds', coalesce((
            select jsonb_agg(
              dependency.depends_on_microsequence_id
              order by dependency.position
            )
            from public.microsequence_dependencies dependency
            where dependency.microsequence_id = microsequence.id
          ), '[]'::jsonb),
          'cardCount', (
            select count(*) from public.cards card
            where card.microsequence_id = microsequence.id
          )
        ) as item
      from public.microsequences microsequence
      where microsequence.course_id = p_course_id
        and microsequence.lesson_id = p_parent_id
        and (
          p_after_position is null
          or (microsequence.position, microsequence.id) >
            (p_after_position, p_after_id)
        )
      order by microsequence.position, microsequence.id
      limit p_limit + 1
    loop
      v_count := v_count + 1;
      if v_count > p_limit then
        v_has_more := true;
        exit;
      end if;
      v_items := v_items || jsonb_build_array(v_item.item);
      v_last_position := v_item.position;
      v_last_id := v_item.id;
    end loop;
  else
    if p_parent_id is null or not exists (
      select 1 from public.microsequences microsequence
      where microsequence.id = p_parent_id
        and microsequence.course_id = p_course_id
    ) then
      raise exception 'Estrutura selecionada não encontrada.'
        using errcode = '42501';
    end if;
    for v_item in
      select
        card.position,
        card.id,
        jsonb_build_object(
          'id', card.id,
          'microsequenceId', card.microsequence_id,
          'contractKey', card.contract_key,
          'title', card.title,
          'kind', card.kind,
          'exercise', card.exercise,
          'resource', card.resource,
          'position', card.position
        ) as item
      from public.cards card
      where card.course_id = p_course_id
        and card.microsequence_id = p_parent_id
        and (
          p_after_position is null
          or (card.position, card.id) >
            (p_after_position, p_after_id)
        )
      order by card.position, card.id
      limit p_limit + 1
    loop
      v_count := v_count + 1;
      if v_count > p_limit then
        v_has_more := true;
        exit;
      end if;
      v_items := v_items || jsonb_build_array(v_item.item);
      v_last_position := v_item.position;
      v_last_id := v_item.id;
    end loop;
  end if;

  return jsonb_build_object(
    'course', v_summary,
    'section', p_section,
    'parentId', p_parent_id,
    'items', v_items,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'afterPosition', v_last_position,
      'afterId', v_last_id
    ) else null end
  );
end;
$$;

create or replace function public.list_personal_study_paths(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_path_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_item record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_last_position integer;
  v_last_path_id uuid;
  v_unassigned_count bigint;
begin
  perform private.require_personal_library_client(
    p_actor_user_id,
    p_client_id,
    'authoring:private:read'
  );

  if p_limit is null
     or p_limit not between 1 and 100
     or (
       (p_after_position is null) <>
       (p_after_path_id is null)
     )
     or (
       p_after_position is not null
       and p_after_position < 0
     ) then
    raise exception 'Paginação de trilhas inválida.'
      using errcode = '22023';
  end if;

  select count(*) into v_unassigned_count
  from public.user_course_selections selection
  where selection.user_id = p_actor_user_id
    and not exists (
      select 1
      from public.study_path_courses path_course
      where path_course.owner_id = p_actor_user_id
        and path_course.selection_id = selection.id
    );

  for v_item in
    select
      path.position,
      path.id,
      jsonb_build_object(
        'pathId', path.id,
        'title', path.title,
        'position', path.position,
        'courseCount', (
          select count(*)
          from public.study_path_courses path_course
          where path_course.path_id = path.id
            and path_course.owner_id = p_actor_user_id
        )
      ) as item
    from public.study_paths path
    where path.owner_id = p_actor_user_id
      and (
        p_after_position is null
        or (path.position, path.id) >
          (p_after_position, p_after_path_id)
      )
    order by path.position, path.id
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;
    v_items := v_items || jsonb_build_array(v_item.item);
    v_last_position := v_item.position;
    v_last_path_id := v_item.id;
  end loop;

  return jsonb_build_object(
    'unassignedCount', v_unassigned_count,
    'items', v_items,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'afterPosition', v_last_position,
      'afterPathId', v_last_path_id
    ) else null end
  );
end;
$$;

create or replace function public.rename_personal_library_course(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_course_id uuid,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_command jsonb;
  v_course public.courses%rowtype;
  v_result jsonb;
  v_content_hash text;
begin
  if p_course_id is null
     or v_title = ''
     or char_length(v_title) > 200 then
    raise exception 'Título do curso pessoal inválido.'
      using errcode = '22023';
  end if;

  v_command := private.begin_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'rename_course',
    jsonb_build_object(
      'courseId', p_course_id,
      'title', v_title
    )
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') ||
      jsonb_build_object('idempotent', true);
  end if;

  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.owner_id = p_actor_user_id
    and course.status = 'published'
    and course.deleted_at is null
  for update;

  if not found then
    raise exception 'Curso pessoal não encontrado.'
      using errcode = '42501';
  end if;

  if v_course.title = v_title then
    v_result := jsonb_build_object(
      'status', 'unchanged',
      'courseId', v_course.id,
      'title', v_course.title,
      'catalogRevision', v_course.catalog_revision,
      'contentHash', v_course.content_hash,
      'idempotent', false
    );
  else
    v_content_hash := encode(extensions.digest(
      convert_to(jsonb_build_object(
        'courseId', v_course.id,
        'previousContentHash', coalesce(v_course.content_hash, ''),
        'title', v_title,
        'requestHash', v_command->>'requestHash'
      )::text, 'UTF8'),
      'sha256'
    ), 'hex');

    update public.courses course
    set title = v_title,
        content_hash = v_content_hash
    where course.id = v_course.id
    returning * into v_course;

    perform pg_advisory_xact_lock(hashtextextended(
      'aralearn-sync-feed-commit-order',
      0
    ));
    insert into private.sync_changes(
      audience_user_id,
      course_id,
      entity_type,
      entity_id,
      operation
    ) values (
      p_actor_user_id,
      v_course.id,
      -- O protocolo enxuto projeta uma publicação para a seleção do usuário.
      -- Assim o dispositivo recebe título, hash e sequência sem tentar
      -- materializar uma entidade pessoal que o feed não expõe diretamente.
      'coursePublication',
      v_course.id,
      'upsert'
    );

    v_result := jsonb_build_object(
      'status', 'renamed',
      'courseId', v_course.id,
      'title', v_course.title,
      'catalogRevision', v_course.catalog_revision,
      'contentHash', v_course.content_hash,
      'idempotent', false
    );
  end if;

  perform private.complete_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'rename_course',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.create_personal_study_path(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_command jsonb;
  v_path public.study_paths%rowtype;
  v_position integer;
  v_result jsonb;
begin
  if v_title = '' or char_length(v_title) > 120 then
    raise exception 'Título da trilha inválido.'
      using errcode = '22023';
  end if;

  v_command := private.begin_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'create_path',
    jsonb_build_object('title', v_title)
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') ||
      jsonb_build_object('idempotent', true);
  end if;

  select coalesce(max(path.position) + 1, 0)
  into v_position
  from public.study_paths path
  where path.owner_id = p_actor_user_id;

  insert into public.study_paths(owner_id, title, position)
  values (p_actor_user_id, v_title, v_position)
  returning * into v_path;

  v_result := jsonb_build_object(
    'status', 'created',
    'pathId', v_path.id,
    'title', v_path.title,
    'position', v_path.position,
    'courseCount', 0,
    'idempotent', false
  );
  perform private.complete_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'create_path',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.rename_personal_study_path(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_path_id uuid,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_command jsonb;
  v_path public.study_paths%rowtype;
  v_result jsonb;
begin
  if p_path_id is null
     or v_title = ''
     or char_length(v_title) > 120 then
    raise exception 'Renomeação de trilha inválida.'
      using errcode = '22023';
  end if;

  v_command := private.begin_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'rename_path',
    jsonb_build_object(
      'pathId', p_path_id,
      'title', v_title
    )
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') ||
      jsonb_build_object('idempotent', true);
  end if;

  select * into v_path
  from public.study_paths path
  where path.id = p_path_id
    and path.owner_id = p_actor_user_id
  for update;
  if not found then
    raise exception 'Trilha pessoal não encontrada.'
      using errcode = '42501';
  end if;

  if v_path.title = v_title then
    v_result := jsonb_build_object(
      'status', 'unchanged',
      'pathId', v_path.id,
      'title', v_path.title,
      'position', v_path.position,
      'idempotent', false
    );
  else
    update public.study_paths path
    set title = v_title
    where path.id = v_path.id
    returning * into v_path;
    v_result := jsonb_build_object(
      'status', 'renamed',
      'pathId', v_path.id,
      'title', v_path.title,
      'position', v_path.position,
      'idempotent', false
    );
  end if;

  perform private.complete_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'rename_path',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.delete_personal_study_path(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_path_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_command jsonb;
  v_path public.study_paths%rowtype;
  v_detached_count bigint;
  v_result jsonb;
begin
  if p_path_id is null then
    raise exception 'Exclusão de trilha inválida.'
      using errcode = '22023';
  end if;

  v_command := private.begin_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'delete_path',
    jsonb_build_object('pathId', p_path_id)
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') ||
      jsonb_build_object('idempotent', true);
  end if;

  select * into v_path
  from public.study_paths path
  where path.id = p_path_id
    and path.owner_id = p_actor_user_id
  for update;
  if not found then
    raise exception 'Trilha pessoal não encontrada.'
      using errcode = '42501';
  end if;

  select count(*) into v_detached_count
  from public.study_path_courses path_course
  where path_course.path_id = v_path.id
    and path_course.owner_id = p_actor_user_id;

  -- A cascata remove somente os vínculos da trilha. Seleção, progresso,
  -- comentários e a árvore do curso permanecem intactos.
  delete from public.study_paths path
  where path.id = v_path.id
    and path.owner_id = p_actor_user_id;

  v_result := jsonb_build_object(
    'status', 'deleted',
    'pathId', v_path.id,
    'title', v_path.title,
    'detachedCourseCount', v_detached_count,
    'idempotent', false
  );
  perform private.complete_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'delete_path',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.move_personal_course_selection(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_selection_id uuid,
  p_target_path_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_command jsonb;
  v_selection public.user_course_selections%rowtype;
  v_path public.study_paths%rowtype;
  v_path_course public.study_path_courses%rowtype;
  v_has_path_course boolean := false;
  v_position integer;
  v_status text;
  v_result jsonb;
begin
  if p_selection_id is null then
    raise exception 'Movimentação de curso inválida.'
      using errcode = '22023';
  end if;

  v_command := private.begin_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'move_selection',
    jsonb_build_object(
      'selectionId', p_selection_id,
      'targetPathId', p_target_path_id
    )
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') ||
      jsonb_build_object('idempotent', true);
  end if;

  select * into v_selection
  from public.user_course_selections selection
  where selection.id = p_selection_id
    and selection.user_id = p_actor_user_id
  for update;
  if not found then
    raise exception 'Curso selecionado não encontrado.'
      using errcode = '42501';
  end if;

  if p_target_path_id is not null then
    select * into v_path
    from public.study_paths path
    where path.id = p_target_path_id
      and path.owner_id = p_actor_user_id
    for update;
    if not found then
      raise exception 'Trilha pessoal não encontrada.'
        using errcode = '42501';
    end if;
  end if;

  select * into v_path_course
  from public.study_path_courses path_course
  where path_course.owner_id = p_actor_user_id
    and path_course.selection_id = p_selection_id
  for update;
  v_has_path_course := found;

  if p_target_path_id is null then
    if v_has_path_course then
      delete from public.study_path_courses path_course
      where path_course.id = v_path_course.id;
      v_status := 'moved';
    else
      v_status := 'unchanged';
    end if;
    v_position := null;
  elsif v_has_path_course
        and v_path_course.path_id = p_target_path_id then
    v_status := 'unchanged';
    v_position := v_path_course.position;
  else
    select coalesce(max(path_course.position) + 1, 0)
    into v_position
    from public.study_path_courses path_course
    where path_course.path_id = p_target_path_id
      and path_course.owner_id = p_actor_user_id;

    if v_has_path_course then
      update public.study_path_courses path_course
      set path_id = p_target_path_id,
          position = v_position
      where path_course.id = v_path_course.id
      returning * into v_path_course;
    else
      insert into public.study_path_courses(
        path_id,
        owner_id,
        selection_id,
        position
      ) values (
        p_target_path_id,
        p_actor_user_id,
        p_selection_id,
        v_position
      )
      returning * into v_path_course;
    end if;
    v_status := 'moved';
  end if;

  v_result := jsonb_build_object(
    'status', v_status,
    'selectionId', v_selection.id,
    'courseId', v_selection.course_id,
    'pathId', p_target_path_id,
    'pathTitle', case
      when p_target_path_id is null then null
      else v_path.title
    end,
    'position', v_position,
    'idempotent', false
  );
  perform private.complete_personal_library_command(
    p_actor_user_id,
    p_client_id,
    p_request_id,
    'move_selection',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

revoke all on table private.personal_library_command_receipts
  from public, anon, authenticated, service_role;
revoke all on function private.require_personal_library_client(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function private.begin_personal_library_command(
  uuid, uuid, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.complete_personal_library_command(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;

revoke all on function public.list_personal_library_courses(
  uuid, uuid, integer, integer, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_personal_library_course_structure(
  uuid, uuid, uuid, text, uuid, integer, integer, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.list_personal_study_paths(
  uuid, uuid, integer, integer, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.rename_personal_library_course(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_personal_study_path(
  uuid, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.rename_personal_study_path(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.delete_personal_study_path(
  uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.move_personal_course_selection(
  uuid, uuid, text, uuid, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.list_personal_library_courses(
  uuid, uuid, integer, integer, uuid, text
) to service_role;
grant execute on function public.get_personal_library_course_structure(
  uuid, uuid, uuid, text, uuid, integer, integer, uuid
) to service_role;
grant execute on function public.list_personal_study_paths(
  uuid, uuid, integer, integer, uuid
) to service_role;
grant execute on function public.rename_personal_library_course(
  uuid, uuid, text, uuid, text
) to service_role;
grant execute on function public.create_personal_study_path(
  uuid, uuid, text, text
) to service_role;
grant execute on function public.rename_personal_study_path(
  uuid, uuid, text, uuid, text
) to service_role;
grant execute on function public.delete_personal_study_path(
  uuid, uuid, text, uuid
) to service_role;
grant execute on function public.move_personal_course_selection(
  uuid, uuid, text, uuid, uuid
) to service_role;

comment on function public.list_personal_library_courses(
  uuid, uuid, integer, integer, uuid, text
) is
  'Lista paginada dos cursos selecionados pelo proprietário da integração.';
comment on function public.get_personal_library_course_structure(
  uuid, uuid, uuid, text, uuid, integer, integer, uuid
) is
  'Consulta paginada da estrutura de um curso selecionado, um nível por vez.';
comment on function public.rename_personal_library_course(
  uuid, uuid, text, uuid, text
) is
  'Renomeia somente uma raiz pessoal e publica a alteração no feed do proprietário.';
comment on function public.delete_personal_study_path(
  uuid, uuid, text, uuid
) is
  'Exclui a trilha e seus vínculos sem excluir seleção, progresso ou comentários.';

commit;
