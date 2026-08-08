begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-alphabetic-catalog-v1',
  0
));

-- A ordem de Coleções é uma propriedade de apresentação. O banco conserva
-- somente identidades estáveis para paginação; o cliente ordena o conjunto
-- completo conforme pt-BR depois de consumir todas as páginas.

-- A publicação corrente precisa deixar de atribuir posição antes da remoção
-- física das colunas. A transformação é estreita e falha fechada se o corpo
-- vigente não corresponder ao contrato conhecido.
do $rewrite_current_publication$
declare
  v_signature regprocedure := to_regprocedure(
    'public.publish_authoring_workspace_course_v5(uuid,uuid,text,text,bigint,text,text,uuid,text,uuid,uuid,jsonb,jsonb)'
  );
  v_definition text;
  v_previous text := $previous$
    update public.catalog_collection_courses item
    set collection_id = p_collection_id,
        position = coalesce((
          select max(other.position) + 1
          from public.catalog_collection_courses other
          where other.collection_id = p_collection_id
            and other.course_id <> v_course_id
            and other.deleted_at is null
        ), 0),
        deleted_at = null,
        updated_at = now()
    where item.course_id = v_course_id and item.deleted_at is null;
    if not found then
      insert into public.catalog_collection_courses(
        collection_id, course_id, position
      ) values (
        p_collection_id, v_course_id,
        coalesce((
          select max(item.position) + 1
          from public.catalog_collection_courses item
          where item.collection_id = p_collection_id
            and item.deleted_at is null
        ), 0)
      );
    end if;
$previous$;
  v_current text := $current$
    update public.catalog_collection_courses item
    set collection_id = p_collection_id,
        deleted_at = null,
        updated_at = now()
    where item.course_id = v_course_id and item.deleted_at is null;
    if not found then
      insert into public.catalog_collection_courses(
        collection_id, course_id
      ) values (p_collection_id, v_course_id);
    end if;
$current$;
begin
  if v_signature is null then return; end if;
  -- Migrations históricas podem conservar CRLF no corpo de funções criado a
  -- partir do Windows. pg_get_functiondef preserva esses caracteres em
  -- prosrc; normalize somente a definição transitória antes da substituição.
  v_definition := replace(
    pg_get_functiondef(v_signature),
    E'\r\n',
    E'\n'
  );
  if strpos(v_definition, v_previous) = 0 then
    raise exception 'A publicação corrente não corresponde ao corte alfabético.'
      using errcode = '55000';
  end if;
  execute replace(v_definition, v_previous, v_current);
end;
$rewrite_current_publication$;

create or replace function private.ensure_official_course_collection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_collection_id uuid := case new.contract_key
    when 'course-dataprev-2026-analista-processamento-seguranca-informacao'
      then '71000000-0000-4000-8000-000000000001'::uuid
    when 'course-fundamentos-ia-analise-dados'
      then '71000000-0000-4000-8000-000000000002'::uuid
    when 'course-microsoft-azure-ai-fundamentals-ai900'
      then '71000000-0000-4000-8000-000000000003'::uuid
    else '71000000-0000-4000-8000-000000000004'::uuid
  end;
begin
  if new.owner_id is null
     and new.status = 'published'
     and new.deleted_at is null then
    if not exists (
      select 1
      from public.catalog_collection_courses item
      where item.course_id = new.id
        and item.deleted_at is null
    ) then
      insert into public.catalog_collection_courses(collection_id, course_id)
      values (v_collection_id, new.id);
    end if;
  else
    delete from public.catalog_collection_courses item
    where item.course_id = new.id;
  end if;
  return new;
end;
$function$;

-- Superfícies de ordenação e rotinas editoriais substituídas deixam de
-- existir. Não há alias, fallback nem adaptação do payload antigo.
drop function if exists public.move_catalog_collection_v5(
  uuid, uuid, text, bigint, integer
);
drop function if exists public.move_catalog_course_v5(
  uuid, uuid, text, bigint, uuid, integer
);
drop function if exists private.normalize_catalog_collection_positions_v5();
drop function if exists private.normalize_catalog_course_positions_v5(uuid);
drop function if exists public.reorder_catalog_collections_admin(
  uuid, text, jsonb
);
drop function if exists public.reorder_catalog_courses_admin(
  uuid, text, uuid, jsonb
);
drop function if exists public.move_catalog_course_admin(
  uuid, text, uuid, uuid, bigint
);

drop function if exists public.list_catalog_collections(text);
drop function if exists public.list_catalog_collections_admin(
  uuid, integer, integer, uuid, text, boolean
);
drop function if exists public.list_catalog_courses_admin(
  uuid, uuid, integer, integer, uuid, text
);
drop function if exists public.list_authoring_catalog_collections_v4(
  uuid, integer, integer, uuid, text
);
drop function if exists public.list_authoring_catalog_courses_v4(
  uuid, uuid, integer, integer, uuid, text
);

drop index if exists public.catalog_collections_listing_idx;
drop index if exists public.catalog_collection_courses_listing_idx;
alter table public.catalog_collections
  drop constraint if exists catalog_collections_position_nonnegative,
  drop column position;
alter table public.catalog_collection_courses
  drop constraint if exists catalog_collection_courses_position_nonnegative,
  drop column position;
create index catalog_collections_identity_listing_idx
  on public.catalog_collections(is_published, deleted_at, id);
create index catalog_collection_courses_identity_listing_idx
  on public.catalog_collection_courses(collection_id, deleted_at, course_id);

-- Recibos antigos de uma operação agora inexistente não participam do novo
-- contrato e são descartados antes de estreitar a restrição.
delete from private.catalog_management_receipts_v5 receipt
where receipt.operation = 'move_collection';
alter table private.catalog_management_receipts_v5
  drop constraint catalog_management_receipts_operation_v5;
alter table private.catalog_management_receipts_v5
  add constraint catalog_management_receipts_operation_v5 check (
    operation in (
      'create_collection',
      'update_collection',
      'retire_collection',
      'move_course',
      'remove_course'
    )
  );

create or replace function private.begin_catalog_management_v5(
  p_actor_id uuid,
  p_request_id text,
  p_operation text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_receipt private.catalog_management_receipts_v5%rowtype;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:manage');
  if not private.can_publish_catalog_v5(p_actor_id) then
    raise exception 'Administração do catálogo não autorizada.'
      using errcode = '42501';
  end if;
  if p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation not in (
       'create_collection',
       'update_collection',
       'retire_collection',
       'move_course',
       'remove_course'
     )
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Comando administrativo inválido.'
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-management-v5:'
      || p_actor_id::text || ':' || p_request_id,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-management-v5:global',
    0
  ));
  delete from private.catalog_management_receipts_v5 receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired_receipts as materialized (
    select receipt.ctid
    from private.catalog_management_receipts_v5 receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.actor_id, receipt.request_id
    limit 256
    for update skip locked
  )
  delete from private.catalog_management_receipts_v5 receipt
  using expired_receipts expired
  where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.catalog_management_receipts_v5 receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id;
  if not found then return null; end if;
  if v_receipt.operation <> p_operation
     or v_receipt.payload_hash <> p_payload_hash then
    raise exception 'requestId reutilizado com dados diferentes.'
      using errcode = '23505';
  end if;
  return v_receipt.result || jsonb_build_object('idempotent', true);
end;
$function$;

create function public.list_catalog_collections(p_query text default '')
returns table(
  collection_id uuid,
  collection_key text,
  collection_title text,
  collection_description text,
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  is_selected boolean,
  selection_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_query text := btrim(coalesce(p_query, ''));
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select
    collection.id,
    collection.contract_key,
    collection.title,
    collection.description,
    course.id,
    course.contract_key,
    course.title,
    course.goal,
    course.publication_seq,
    course.content_hash,
    course.module_count,
    course.lesson_count,
    selection.id is not null,
    selection.id
  from public.catalog_collections collection
  join public.catalog_collection_courses item
    on item.collection_id = collection.id
   and item.deleted_at is null
  join public.courses course
    on course.id = item.course_id
   and course.owner_id is null
   and course.status = 'published'
   and course.deleted_at is null
   and course.document_storage_enabled
  left join public.user_course_selections selection
    on selection.course_id = course.id
   and selection.user_id = v_user_id
  where collection.is_published
    and collection.deleted_at is null
    and (
      v_query = ''
      or collection.title ilike '%' || v_query || '%'
      or collection.description ilike '%' || v_query || '%'
      or course.title ilike '%' || v_query || '%'
      or course.goal ilike '%' || v_query || '%'
    )
  order by collection.id, course.id;
end;
$function$;

create function public.list_authoring_catalog_collections_v4(
  p_owner_id uuid,
  p_limit integer default 50,
  p_after_id uuid default null,
  p_query text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_result jsonb;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, 'authoring:read'
  );
  if p_limit is null or p_limit < 1 or p_limit > 100
     or char_length(v_query) > 200 then
    raise exception 'Paginação do catálogo inválida.'
      using errcode = '22023';
  end if;
  with candidates as materialized (
    select
      collection.id,
      collection.contract_key,
      collection.title,
      collection.description,
      collection.revision,
      collection.created_at,
      collection.updated_at,
      (
        select count(*)
        from public.catalog_collection_courses item
        join public.courses course
          on course.id = item.course_id
         and course.owner_id is null
         and course.status = 'published'
         and course.deleted_at is null
         and course.document_storage_enabled
        where item.collection_id = collection.id
          and item.deleted_at is null
      ) as course_count
    from public.catalog_collections collection
    where collection.is_published
      and collection.deleted_at is null
      and (p_after_id is null or collection.id > p_after_id)
      and (
        v_query = ''
        or collection.title ilike '%' || v_query || '%'
        or collection.description ilike '%' || v_query || '%'
        or collection.contract_key ilike '%' || v_query || '%'
        or exists (
          select 1
          from public.catalog_collection_courses item
          join public.courses course
            on course.id = item.course_id
           and course.owner_id is null
           and course.status = 'published'
           and course.deleted_at is null
           and course.document_storage_enabled
          where item.collection_id = collection.id
            and item.deleted_at is null
            and (
              course.title ilike '%' || v_query || '%'
              or course.goal ilike '%' || v_query || '%'
              or course.contract_key ilike '%' || v_query || '%'
            )
        )
      )
    order by collection.id
    limit p_limit + 1
  ), page as (
    select * from candidates order by id limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'collectionId', page.id,
        'contractKey', page.contract_key,
        'title', page.title,
        'description', page.description,
        'status', 'active',
        'revision', page.revision,
        'courseCount', page.course_count,
        'createdAt', page.created_at,
        'updatedAt', page.updated_at
      ) order by page.id)
      from page
    ), '[]'::jsonb),
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object('afterId', page.id)
      from page order by page.id desc limit 1
    ) else null end
  ) into v_result;
  return v_result;
end;
$function$;

create function public.list_authoring_catalog_courses_v4(
  p_owner_id uuid,
  p_collection_id uuid,
  p_limit integer default 50,
  p_after_id uuid default null,
  p_query text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_result jsonb;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, 'authoring:read'
  );
  if p_collection_id is null
     or p_limit is null or p_limit < 1 or p_limit > 100
     or char_length(v_query) > 200 then
    raise exception 'Paginação de cursos inválida.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.catalog_collections collection
    where collection.id = p_collection_id
      and collection.is_published
      and collection.deleted_at is null
  ) then
    raise exception 'Coleção de catálogo inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;
  with candidates as materialized (
    select
      item.id as placement_id,
      item.revision as placement_revision,
      course.id,
      course.contract_key,
      course.title,
      course.goal,
      course.publication_seq,
      course.content_hash,
      course.catalog_revision,
      course.updated_at,
      course.module_count,
      course.lesson_count
    from public.catalog_collection_courses item
    join public.courses course
      on course.id = item.course_id
     and course.owner_id is null
     and course.status = 'published'
     and course.deleted_at is null
     and course.document_storage_enabled
    where item.collection_id = p_collection_id
      and item.deleted_at is null
      and (p_after_id is null or course.id > p_after_id)
      and (
        v_query = ''
        or course.title ilike '%' || v_query || '%'
        or course.goal ilike '%' || v_query || '%'
        or course.contract_key ilike '%' || v_query || '%'
      )
    order by course.id
    limit p_limit + 1
  ), page as (
    select * from candidates order by id limit p_limit
  )
  select jsonb_build_object(
    'collectionId', p_collection_id,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId', page.placement_id,
        'placementRevision', page.placement_revision,
        'courseId', page.id,
        'contractKey', page.contract_key,
        'title', page.title,
        'goal', page.goal,
        'publicationSeq', page.publication_seq,
        'contentHash', page.content_hash,
        'revision', page.catalog_revision,
        'moduleCount', page.module_count,
        'lessonCount', page.lesson_count,
        'updatedAt', page.updated_at
      ) order by page.id)
      from page
    ), '[]'::jsonb),
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object('afterId', page.id)
      from page order by page.id desc limit 1
    ) else null end
  ) into v_result;
  return v_result;
end;
$function$;

create function public.list_catalog_collections_admin(
  p_actor_user_id uuid,
  p_limit integer default 50,
  p_after_id uuid default null,
  p_query text default '',
  p_include_retired boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_result jsonb;
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, false);
  if p_limit is null or p_limit < 1 or p_limit > 100
     or char_length(v_query) > 200
     or p_include_retired is null then
    raise exception 'Paginação do catálogo inválida.'
      using errcode = '22023';
  end if;
  if p_include_retired
     and not private.has_active_app_role(p_actor_user_id, 'owner') then
    raise exception 'Somente owner consulta coleções aposentadas.'
      using errcode = '42501';
  end if;
  with candidates as materialized (
    select
      collection.id,
      collection.contract_key,
      collection.title,
      collection.description,
      collection.is_published,
      collection.revision,
      collection.created_at,
      collection.updated_at,
      collection.deleted_at,
      (
        select count(*)
        from public.catalog_collection_courses item
        join public.courses course
          on course.id = item.course_id
         and course.owner_id is null
         and course.status = 'published'
         and course.deleted_at is null
        where item.collection_id = collection.id
          and item.deleted_at is null
      ) as course_count
    from public.catalog_collections collection
    where (
      p_include_retired
      or (collection.is_published and collection.deleted_at is null)
    )
      and (p_after_id is null or collection.id > p_after_id)
      and (
        v_query = ''
        or collection.title ilike '%' || v_query || '%'
        or collection.description ilike '%' || v_query || '%'
        or collection.contract_key ilike '%' || v_query || '%'
      )
    order by collection.id
    limit p_limit + 1
  ), page as (
    select * from candidates order by id limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'collectionId', page.id,
        'contractKey', page.contract_key,
        'title', page.title,
        'description', page.description,
        'status', case
          when page.is_published and page.deleted_at is null then 'active'
          else 'retired'
        end,
        'revision', page.revision,
        'courseCount', page.course_count,
        'createdAt', page.created_at,
        'updatedAt', page.updated_at
      ) order by page.id)
      from page
    ), '[]'::jsonb),
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object('afterId', page.id)
      from page order by page.id desc limit 1
    ) else null end
  ) into v_result;
  return v_result;
end;
$function$;

create function public.list_catalog_courses_admin(
  p_actor_user_id uuid,
  p_collection_id uuid,
  p_limit integer default 50,
  p_after_id uuid default null,
  p_query text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, false);
  return public.list_authoring_catalog_courses_v4(
    p_actor_user_id, p_collection_id, p_limit, p_after_id, p_query
  );
end;
$function$;

create or replace function public.get_catalog_course_admin(
  p_actor_user_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, false);
  if p_course_id is null then
    raise exception 'Curso oficial inválido.' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'courseId', course.id,
    'contractKey', course.contract_key,
    'title', course.title,
    'goal', course.goal,
    'publicationSeq', course.publication_seq,
    'contentHash', course.content_hash,
    'revision', course.catalog_revision,
    'updatedAt', course.updated_at,
    'collection', jsonb_build_object(
      'collectionId', collection.id,
      'contractKey', collection.contract_key,
      'title', collection.title,
      'placementRevision', item.revision
    ),
    'counts', jsonb_build_object(
      'modules', course.module_count,
      'lessons', course.lesson_count,
      'microsequences', course.microsequence_count,
      'cards', course.card_count
    )
  ) into v_result
  from public.courses course
  join public.catalog_collection_courses item
    on item.course_id = course.id
   and item.deleted_at is null
  join public.catalog_collections collection
    on collection.id = item.collection_id
   and collection.is_published
   and collection.deleted_at is null
  where course.id = p_course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null;
  if v_result is null then
    raise exception 'Curso oficial inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;
  return v_result;
end;
$function$;

create or replace function public.create_catalog_collection_v5(
  p_actor_id uuid,
  p_collection_id uuid,
  p_request_id text,
  p_contract_key text,
  p_title text,
  p_description text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_contract_key text := btrim(p_contract_key);
  v_title text := btrim(p_title);
  v_description text := btrim(coalesce(p_description, ''));
  v_payload_hash text;
  v_replay jsonb;
  v_collection public.catalog_collections%rowtype;
  v_result jsonb;
begin
  if p_collection_id is null
     or nullif(v_contract_key, '') is null
     or v_contract_key !~ '^[a-z0-9][a-z0-9-]{0,119}$'
     or nullif(v_title, '') is null
     or char_length(v_title) > 160
     or char_length(v_description) > 1000 then
    raise exception 'Nova coleção inválida.' using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'create_collection',
    jsonb_build_object(
      'collectionId', p_collection_id,
      'contractKey', v_contract_key,
      'title', v_title,
      'description', v_description
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'create_collection', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  perform 1
  from public.catalog_collections collection
  order by collection.id
  for update;
  if exists (
    select 1
    from public.catalog_collections collection
    where collection.id = p_collection_id
       or collection.contract_key = v_contract_key
  ) then
    raise exception 'A coleção ou sua chave já existe.'
      using errcode = '23505';
  end if;
  insert into public.catalog_collections(
    id, contract_key, title, description, is_published, deleted_at
  ) values (
    p_collection_id, v_contract_key, v_title, v_description, true, null
  ) returning * into v_collection;
  v_result := jsonb_build_object(
    'status', 'created',
    'collectionId', v_collection.id,
    'contractKey', v_collection.contract_key,
    'title', v_collection.title,
    'description', v_collection.description,
    'revision', v_collection.revision,
    'courseCount', 0
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'create_collection',
    v_payload_hash, v_result
  );
end;
$function$;

create or replace function public.update_catalog_collection_v5(
  p_actor_id uuid,
  p_collection_id uuid,
  p_request_id text,
  p_expected_revision bigint,
  p_title text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_title text := btrim(p_title);
  v_payload_hash text;
  v_replay jsonb;
  v_collection public.catalog_collections%rowtype;
  v_description text;
  v_course_count bigint;
  v_status text;
  v_result jsonb;
begin
  if p_collection_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or nullif(v_title, '') is null
     or char_length(v_title) > 160
     or (
       p_description is not null
       and char_length(btrim(p_description)) > 1000
     ) then
    raise exception 'Atualização de coleção inválida.'
      using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'update_collection',
    jsonb_build_object(
      'collectionId', p_collection_id,
      'expectedRevision', p_expected_revision,
      'title', v_title,
      'description', p_description
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'update_collection', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  select * into v_collection
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for update;
  if not found then
    raise exception 'Coleção ativa inexistente.' using errcode = 'P0002';
  end if;
  if v_collection.revision <> p_expected_revision then
    raise exception 'Revisão da coleção desatualizada.'
      using errcode = '40001';
  end if;
  v_description := case
    when p_description is null then v_collection.description
    else btrim(p_description)
  end;
  if v_collection.title = v_title
     and v_collection.description = v_description then
    v_status := 'unchanged';
  else
    update public.catalog_collections collection
    set title = v_title,
        description = v_description
    where collection.id = p_collection_id
    returning * into v_collection;
    v_status := 'updated';
  end if;
  select count(*) into v_course_count
  from public.catalog_collection_courses placement
  where placement.collection_id = p_collection_id
    and placement.deleted_at is null;
  v_result := jsonb_build_object(
    'status', v_status,
    'collectionId', v_collection.id,
    'contractKey', v_collection.contract_key,
    'title', v_collection.title,
    'description', v_collection.description,
    'revision', v_collection.revision,
    'courseCount', v_course_count
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'update_collection',
    v_payload_hash, v_result
  );
end;
$function$;

create or replace function public.retire_catalog_collection_v5(
  p_actor_id uuid,
  p_collection_id uuid,
  p_request_id text,
  p_expected_revision bigint,
  p_replacement_collection_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_payload_hash text;
  v_replay jsonb;
  v_collection public.catalog_collections%rowtype;
  v_moved_count integer;
  v_result jsonb;
begin
  if p_collection_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or p_replacement_collection_id = p_collection_id then
    raise exception 'Retirada de coleção inválida.'
      using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'retire_collection',
    jsonb_build_object(
      'collectionId', p_collection_id,
      'expectedRevision', p_expected_revision,
      'replacementCollectionId', p_replacement_collection_id
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'retire_collection', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  select * into v_collection
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for update;
  if not found then
    raise exception 'Coleção ativa inexistente.' using errcode = 'P0002';
  end if;
  if v_collection.revision <> p_expected_revision then
    raise exception 'Revisão da coleção desatualizada.'
      using errcode = '40001';
  end if;
  if v_collection.contract_key = 'outros' then
    raise exception 'A coleção Outros é o destino estrutural do catálogo.'
      using errcode = '23514';
  end if;
  if p_replacement_collection_id is not null then
    perform 1
    from public.catalog_collections collection
    where collection.id = p_replacement_collection_id
      and collection.is_published
      and collection.deleted_at is null
    for update;
    if not found then
      raise exception 'Coleção de destino inexistente.'
        using errcode = 'P0002';
    end if;
  end if;
  perform 1
  from public.catalog_collection_courses placement
  where placement.collection_id in (
    p_collection_id, p_replacement_collection_id
  )
    and placement.deleted_at is null
  order by placement.id
  for update;
  select count(*) into v_moved_count
  from public.catalog_collection_courses placement
  where placement.collection_id = p_collection_id
    and placement.deleted_at is null;
  if v_moved_count > 0 and p_replacement_collection_id is null then
    raise exception 'Informe uma coleção ativa para receber os cursos.'
      using errcode = '23514';
  end if;
  if v_moved_count > 0 then
    update public.catalog_collection_courses placement
    set collection_id = p_replacement_collection_id
    where placement.collection_id = p_collection_id
      and placement.deleted_at is null;
  end if;
  update public.catalog_collections collection
  set is_published = false,
      deleted_at = now()
  where collection.id = p_collection_id
  returning * into v_collection;
  v_result := jsonb_build_object(
    'status', 'retired',
    'collectionId', p_collection_id,
    'replacementCollectionId', p_replacement_collection_id,
    'movedCourseCount', v_moved_count,
    'revision', v_collection.revision
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'retire_collection',
    v_payload_hash, v_result
  );
end;
$function$;

create function public.move_catalog_course_v5(
  p_actor_id uuid,
  p_course_id uuid,
  p_request_id text,
  p_expected_placement_revision bigint,
  p_target_collection_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_payload_hash text;
  v_replay jsonb;
  v_placement public.catalog_collection_courses%rowtype;
  v_from_collection_id uuid;
  v_status text;
  v_result jsonb;
begin
  if p_course_id is null
     or p_expected_placement_revision is null
     or p_expected_placement_revision < 1
     or p_target_collection_id is null then
    raise exception 'Transferência de curso inválida.'
      using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'move_course',
    jsonb_build_object(
      'courseId', p_course_id,
      'expectedPlacementRevision', p_expected_placement_revision,
      'targetCollectionId', p_target_collection_id
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'move_course', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  perform 1
  from public.courses course
  where course.id = p_course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  for update;
  if not found then
    raise exception 'Curso oficial inexistente.' using errcode = 'P0002';
  end if;
  select * into v_placement
  from public.catalog_collection_courses placement
  where placement.course_id = p_course_id
    and placement.deleted_at is null
  for update;
  if not found then
    raise exception 'Classificação do curso inexistente.'
      using errcode = 'P0002';
  end if;
  if v_placement.revision <> p_expected_placement_revision then
    raise exception 'Revisão da classificação desatualizada.'
      using errcode = '40001';
  end if;
  perform 1
  from public.catalog_collections collection
  where collection.id = p_target_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for update;
  if not found then
    raise exception 'Coleção de destino inexistente.'
      using errcode = 'P0002';
  end if;
  v_from_collection_id := v_placement.collection_id;
  if v_from_collection_id = p_target_collection_id then
    v_status := 'unchanged';
  else
    update public.catalog_collection_courses placement
    set collection_id = p_target_collection_id
    where placement.id = v_placement.id
    returning * into v_placement;
    v_status := 'moved';
  end if;
  v_result := jsonb_build_object(
    'status', v_status,
    'courseId', p_course_id,
    'fromCollectionId', v_from_collection_id,
    'collectionId', v_placement.collection_id,
    'placementRevision', v_placement.revision
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'move_course',
    v_payload_hash, v_result
  );
end;
$function$;

create or replace function public.remove_catalog_course_v5(
  p_actor_id uuid,
  p_course_id uuid,
  p_request_id text,
  p_expected_placement_revision bigint,
  p_expected_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_payload_hash text;
  v_replay jsonb;
  v_course public.courses%rowtype;
  v_placement public.catalog_collection_courses%rowtype;
  v_result jsonb;
begin
  if p_course_id is null
     or p_expected_placement_revision is null
     or p_expected_placement_revision < 1
     or p_expected_content_hash is null
     or p_expected_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Retirada de curso inválida.' using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'remove_course',
    jsonb_build_object(
      'courseId', p_course_id,
      'expectedPlacementRevision', p_expected_placement_revision,
      'expectedContentHash', p_expected_content_hash
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'remove_course', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  for update;
  if not found then
    raise exception 'Curso oficial inexistente.' using errcode = 'P0002';
  end if;
  if v_course.current_revision_hash is distinct from p_expected_content_hash then
    raise exception 'Revisão do curso desatualizada.' using errcode = '40001';
  end if;
  select * into v_placement
  from public.catalog_collection_courses placement
  where placement.course_id = p_course_id
    and placement.deleted_at is null
  for update;
  if not found then
    raise exception 'Classificação do curso inexistente.'
      using errcode = 'P0002';
  end if;
  if v_placement.revision <> p_expected_placement_revision then
    raise exception 'Revisão da classificação desatualizada.'
      using errcode = '40001';
  end if;
  delete from public.catalog_collection_courses placement
  where placement.id = v_placement.id;
  delete from private.course_revisions revision
  where revision.course_id = p_course_id;
  update public.courses course
  set status = 'archived',
      deleted_at = now(),
      content_hash = null,
      current_revision_hash = null,
      revision_artifact_hash = null,
      module_count = 0,
      lesson_count = 0,
      microsequence_count = 0,
      card_count = 0,
      document_storage_enabled = false,
      updated_at = now()
  where course.id = p_course_id;
  insert into private.course_revision_sync_changes(
    user_id, scope, entity_id, operation, revision_hash
  ) values (null, 'catalog', p_course_id, 'delete', null);
  v_result := jsonb_build_object(
    'status', 'removed',
    'courseId', p_course_id,
    'collectionId', v_placement.collection_id
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'remove_course',
    v_payload_hash, v_result
  );
end;
$function$;

revoke all on function public.list_catalog_collections(text)
  from public, anon;
grant execute on function public.list_catalog_collections(text)
  to authenticated;
revoke all on function public.list_authoring_catalog_collections_v4(
  uuid, integer, uuid, text
) from public, anon, authenticated;
revoke all on function public.list_authoring_catalog_courses_v4(
  uuid, uuid, integer, uuid, text
) from public, anon, authenticated;
revoke all on function public.list_catalog_collections_admin(
  uuid, integer, uuid, text, boolean
) from public, anon, authenticated;
revoke all on function public.list_catalog_courses_admin(
  uuid, uuid, integer, uuid, text
) from public, anon, authenticated;
grant execute on function public.list_authoring_catalog_collections_v4(
  uuid, integer, uuid, text
) to service_role;
grant execute on function public.list_authoring_catalog_courses_v4(
  uuid, uuid, integer, uuid, text
) to service_role;
grant execute on function public.list_catalog_collections_admin(
  uuid, integer, uuid, text, boolean
) to service_role;
grant execute on function public.list_catalog_courses_admin(
  uuid, uuid, integer, uuid, text
) to service_role;

revoke all on function public.create_catalog_collection_v5(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.update_catalog_collection_v5(
  uuid, uuid, text, bigint, text, text
) from public, anon, authenticated;
revoke all on function public.retire_catalog_collection_v5(
  uuid, uuid, text, bigint, uuid
) from public, anon, authenticated;
revoke all on function public.move_catalog_course_v5(
  uuid, uuid, text, bigint, uuid
) from public, anon, authenticated;
revoke all on function public.remove_catalog_course_v5(
  uuid, uuid, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.create_catalog_collection_v5(
  uuid, uuid, text, text, text, text
) to service_role;
grant execute on function public.update_catalog_collection_v5(
  uuid, uuid, text, bigint, text, text
) to service_role;
grant execute on function public.retire_catalog_collection_v5(
  uuid, uuid, text, bigint, uuid
) to service_role;
grant execute on function public.move_catalog_course_v5(
  uuid, uuid, text, bigint, uuid
) to service_role;
grant execute on function public.remove_catalog_course_v5(
  uuid, uuid, text, bigint, text
) to service_role;

-- Não pode restar uma função de ordenação manual nem uma coluna de posição
-- nas duas relações editoriais.
do $assert_alphabetic_catalog$
begin
  if exists (
    select 1
    from information_schema.columns column_value
    where column_value.table_schema = 'public'
      and column_value.table_name in (
        'catalog_collections', 'catalog_collection_courses'
      )
      and column_value.column_name = 'position'
  ) then
    raise exception 'O catálogo ainda persiste posição manual.'
      using errcode = '55000';
  end if;
  if to_regprocedure(
    'public.move_catalog_collection_v5(uuid,uuid,text,bigint,integer)'
  ) is not null
     or to_regprocedure(
       'public.move_catalog_course_v5(uuid,uuid,text,bigint,uuid,integer)'
     ) is not null then
    raise exception 'O catálogo ainda expõe contrato manual de ordenação.'
      using errcode = '55000';
  end if;
end;
$assert_alphabetic_catalog$;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_without_alphabetic_catalog_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with base as (
    select
      public.get_aralearn_runtime_manifest_without_alphabetic_catalog_v1()
        as value
  )
  select jsonb_set(
    jsonb_set(base.value, '{schemaRevision}', '"20260808021000"'::jsonb),
    '{features}',
    (
      (base.value->'features') - 'catalog-collection-ordering-v1'
    ) || jsonb_build_array('alphabetic-catalog-v1')
  )
  from base
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_without_alphabetic_catalog_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
