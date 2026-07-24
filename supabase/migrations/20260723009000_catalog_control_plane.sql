begin;

-- A administração do catálogo passa por comandos estreitos. O gateway usa a
-- service role somente no servidor e identifica o usuário responsável em
-- todas as chamadas. Recibos pequenos tornam cada alteração idempotente.
create table private.catalog_admin_receipts (
  actor_user_id uuid not null,
  request_id text not null,
  operation text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id),
  constraint catalog_admin_receipts_request_id check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint catalog_admin_receipts_operation check (
    operation in (
      'create_collection',
      'rename_collection',
      'retire_collection',
      'reorder_collections',
      'update_course_metadata',
      'move_course',
      'reorder_courses'
    )
  ),
  constraint catalog_admin_receipts_hash check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint catalog_admin_receipts_result check (
    jsonb_typeof(result) = 'object'
    and pg_column_size(result) <= 65536
  )
);

create index catalog_admin_receipts_created_idx
  on private.catalog_admin_receipts (created_at, actor_user_id, request_id);

-- O corte enxuto removeu revisões da árvore didática. As duas tabelas deste
-- plano de controle são pequenas e editáveis; nelas a revisão evita que uma
-- ordem administrativa antiga substitua silenciosamente uma ordem nova.
alter table public.catalog_collections
  add column revision bigint not null default 1;
alter table public.catalog_collection_courses
  add column revision bigint not null default 1;
alter table public.courses
  add column catalog_revision bigint not null default 1;
alter table public.catalog_collections
  add constraint catalog_collections_revision_positive check (revision > 0);
alter table public.catalog_collection_courses
  add constraint catalog_collection_courses_revision_positive check (revision > 0);
alter table public.courses
  add constraint courses_catalog_revision_positive check (catalog_revision > 0);

create trigger catalog_collections_touch_revision
before update on public.catalog_collections
for each row execute function private.touch_revision();
create trigger catalog_collection_courses_touch_revision
before update on public.catalog_collection_courses
for each row execute function private.touch_revision();

create or replace function private.touch_course_catalog_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.title is distinct from new.title
     or old.goal is distinct from new.goal then
    new.catalog_revision := old.catalog_revision + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger courses_touch_catalog_revision
before update of title, goal on public.courses
for each row execute function private.touch_course_catalog_revision();

create or replace function private.require_catalog_admin_actor(
  p_actor_user_id uuid,
  p_owner_only boolean default false
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
     or not exists (
       select 1 from auth.users account where account.id = p_actor_user_id
     ) then
    raise exception 'Responsável pelo catálogo inválido.'
      using errcode = '42501';
  end if;

  if p_owner_only then
    if not private.has_active_app_role(p_actor_user_id, 'owner') then
      raise exception 'A administração de coleções exige o papel owner.'
        using errcode = '42501';
    end if;
  elsif not (
    private.has_active_app_role(p_actor_user_id, 'owner')
    or private.has_active_app_role(p_actor_user_id, 'catalog_publisher')
  ) then
    raise exception 'Administração do catálogo não autorizada.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.begin_catalog_admin_command(
  p_actor_user_id uuid,
  p_request_id text,
  p_operation text,
  p_payload jsonb,
  p_owner_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
declare
  v_receipt private.catalog_admin_receipts%rowtype;
  v_request_hash text;
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, p_owner_only);

  if p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation not in (
       'create_collection',
       'rename_collection',
       'retire_collection',
       'reorder_collections',
       'update_course_metadata',
       'move_course',
       'reorder_courses'
     )
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Comando administrativo inválido.'
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

  -- A administração é pouco frequente. Uma trava global elimina interleavings
  -- entre movimentação, aposentadoria e reordenação e fixa a ordem das travas.
  perform pg_advisory_xact_lock(
    hashtextextended('aralearn-catalog-control-plane', 0)
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_actor_user_id::text || ':' || p_request_id,
    0
  ));

  select * into v_receipt
  from private.catalog_admin_receipts receipt
  where receipt.actor_user_id = p_actor_user_id
    and receipt.request_id = p_request_id
  for share;

  if found then
    if v_receipt.operation <> p_operation
       or v_receipt.request_hash <> v_request_hash then
      raise exception 'requestId já foi usado com outro comando do catálogo.'
        using errcode = 'AC409';
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

create or replace function private.complete_catalog_admin_command(
  p_actor_user_id uuid,
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
    raise exception 'Resultado administrativo inválido.'
      using errcode = '22023';
  end if;

  insert into private.catalog_admin_receipts(
    actor_user_id, request_id, operation, request_hash, result
  ) values (
    p_actor_user_id, p_request_id, p_operation, p_request_hash, p_result
  );
end;
$$;

create or replace function private.catalog_order_entry_is_valid(
  p_entry jsonb,
  p_id_field text
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_id text;
  v_revision text;
begin
  if p_id_field not in ('collectionId', 'courseId')
     or jsonb_typeof(p_entry) <> 'object' then
    return false;
  end if;
  if not (p_entry ? p_id_field)
     or not (p_entry ? 'baseRevision')
     or (p_entry - p_id_field - 'baseRevision') <> '{}'::jsonb then
    return false;
  end if;

  v_id := p_entry->>p_id_field;
  v_revision := p_entry->>'baseRevision';
  if v_id is null
     or v_id !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or v_revision is null
     or v_revision !~ '^[1-9][0-9]{0,18}$' then
    return false;
  end if;
  return v_revision::numeric <= 9223372036854775807;
exception when others then
  return false;
end;
$$;

-- Corrige dados anteriores antes de fixar a cardinalidade. Uma associação com
-- coleção ativa prevalece; as demais ficam como histórico tombstonado.
insert into public.catalog_collections(
  id, contract_key, title, description, position, is_published, deleted_at
) values (
  '71000000-0000-4000-8000-000000000004',
  'outros',
  'Outros',
  '',
  999,
  true,
  null
)
on conflict (contract_key) do update
set is_published = true,
    deleted_at = null;

with unavailable as (
  select item.id
  from public.catalog_collection_courses item
  join public.catalog_collections collection on collection.id = item.collection_id
  where item.deleted_at is null
    and (not collection.is_published or collection.deleted_at is not null)
)
update public.catalog_collection_courses item
set deleted_at = now()
where item.id in (select unavailable.id from unavailable);

with ranked as (
  select item.id,
    row_number() over (
      partition by item.course_id
      order by collection.position, item.position, collection.id, item.id
    ) as ordinal
  from public.catalog_collection_courses item
  join public.catalog_collections collection
    on collection.id = item.collection_id
   and collection.is_published
   and collection.deleted_at is null
  where item.deleted_at is null
)
update public.catalog_collection_courses item
set deleted_at = now()
where item.id in (
  select ranked.id from ranked where ranked.ordinal > 1
);

insert into public.catalog_collection_courses(
  collection_id, course_id, position
)
select
  fallback.id,
  course.id,
  coalesce((
    select max(item.position) + 1
    from public.catalog_collection_courses item
    where item.collection_id = fallback.id
      and item.deleted_at is null
  ), 0) + row_number() over (order by course.title, course.id) - 1
from public.courses course
cross join lateral (
  select collection.id
  from public.catalog_collections collection
  where collection.contract_key = 'outros'
    and collection.is_published
    and collection.deleted_at is null
  order by collection.id
  limit 1
) fallback
where course.owner_id is null
  and course.status = 'published'
  and course.deleted_at is null
  and not exists (
    select 1
    from public.catalog_collection_courses item
    where item.course_id = course.id
      and item.deleted_at is null
  );

with ordered as (
  select item.id,
    row_number() over (
      partition by item.collection_id
      order by item.position, course.title, item.course_id, item.id
    ) - 1 as normalized_position
  from public.catalog_collection_courses item
  join public.courses course on course.id = item.course_id
  where item.deleted_at is null
)
update public.catalog_collection_courses item
set position = ordered.normalized_position
from ordered
where item.id = ordered.id
  and item.position is distinct from ordered.normalized_position;

with ordered as (
  select collection.id,
    row_number() over (
      order by
        (collection.contract_key = 'outros'),
        collection.position,
        collection.title,
        collection.id
    ) - 1 as normalized_position
  from public.catalog_collections collection
  where collection.is_published
    and collection.deleted_at is null
)
update public.catalog_collections collection
set position = ordered.normalized_position
from ordered
where collection.id = ordered.id
  and collection.position is distinct from ordered.normalized_position;

create or replace function private.assert_official_catalog_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_course_ids uuid[];
  v_course_id uuid;
  v_active_links bigint;
  v_available_links bigint;
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'courses'
       and old.owner_id is not distinct from new.owner_id
       and old.status is not distinct from new.status
       and old.deleted_at is not distinct from new.deleted_at then
      return null;
    elsif tg_table_name = 'catalog_collection_courses'
       and old.course_id is not distinct from new.course_id
       and old.collection_id is not distinct from new.collection_id
       and old.deleted_at is not distinct from new.deleted_at then
      return null;
    elsif tg_table_name = 'catalog_collections'
       and old.is_published is not distinct from new.is_published
       and old.deleted_at is not distinct from new.deleted_at then
      return null;
    end if;
  end if;

  if tg_table_name = 'courses' then
    select coalesce(array_agg(distinct candidate), array[]::uuid[])
    into v_course_ids
    from unnest(array_remove(array[
      case when tg_op <> 'INSERT' then old.id else null end,
      case when tg_op <> 'DELETE' then new.id else null end
    ], null)) candidate;
  elsif tg_table_name = 'catalog_collection_courses' then
    select coalesce(array_agg(distinct candidate), array[]::uuid[])
    into v_course_ids
    from unnest(array_remove(array[
      case when tg_op <> 'INSERT' then old.course_id else null end,
      case when tg_op <> 'DELETE' then new.course_id else null end
    ], null)) candidate;
  else
    select coalesce(array_agg(distinct item.course_id), array[]::uuid[])
    into v_course_ids
    from public.catalog_collection_courses item
    where item.collection_id = any(array_remove(array[
      case when tg_op <> 'INSERT' then old.id else null end,
      case when tg_op <> 'DELETE' then new.id else null end
    ], null))
      and item.deleted_at is null;
  end if;

  foreach v_course_id in array coalesce(v_course_ids, array[]::uuid[])
  loop
    if exists (
      select 1
      from public.courses course
      where course.id = v_course_id
        and course.owner_id is null
        and course.status = 'published'
        and course.deleted_at is null
    ) then
      select
        count(*),
        count(*) filter (
          where collection.is_published and collection.deleted_at is null
        )
      into v_active_links, v_available_links
      from public.catalog_collection_courses item
      join public.catalog_collections collection
        on collection.id = item.collection_id
      where item.course_id = v_course_id
        and item.deleted_at is null;

      if v_active_links <> 1 or v_available_links <> 1 then
        raise exception
          'Curso oficial publicado deve pertencer a uma única coleção ativa.'
          using errcode = '23514';
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create constraint trigger catalog_membership_course_invariant
after insert or update or delete on public.catalog_collection_courses
deferrable initially deferred
for each row execute function private.assert_official_catalog_membership();

create constraint trigger catalog_membership_publication_invariant
after insert or update or delete on public.courses
deferrable initially deferred
for each row execute function private.assert_official_catalog_membership();

create constraint trigger catalog_membership_collection_invariant
after insert or update or delete on public.catalog_collections
deferrable initially deferred
for each row execute function private.assert_official_catalog_membership();

create or replace function public.list_catalog_collections_admin(
  p_actor_user_id uuid,
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_id uuid default null,
  p_query text default '',
  p_include_retired boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_result jsonb;
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, false);

  if p_limit is null or p_limit < 1 or p_limit > 100
     or (p_after_position is null) <> (p_after_id is null)
     or (p_after_position is not null and p_after_position < 0)
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
      collection.position,
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
          where item.collection_id = collection.id
            and item.deleted_at is null
            and (
              course.title ilike '%' || v_query || '%'
              or course.goal ilike '%' || v_query || '%'
              or course.contract_key ilike '%' || v_query || '%'
            )
        )
      )
      and (
        p_after_position is null
        or (collection.position, collection.id) > (p_after_position, p_after_id)
      )
    order by collection.position, collection.id
    limit p_limit + 1
  ),
  page as (
    select * from candidates
    order by position, id
    limit p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'collectionId', page.id,
        'contractKey', page.contract_key,
        'title', page.title,
        'description', page.description,
        'position', page.position,
        'status', case
          when page.is_published and page.deleted_at is null then 'active'
          else 'retired'
        end,
        'revision', page.revision,
        'courseCount', page.course_count,
        'createdAt', page.created_at,
        'updatedAt', page.updated_at
      ) order by page.position, page.id)
      from page
    ), '[]'::jsonb),
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'afterPosition', page.position,
        'afterId', page.id
      )
      from page
      order by page.position desc, page.id desc
      limit 1
    ) else null end
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.list_catalog_courses_admin(
  p_actor_user_id uuid,
  p_collection_id uuid,
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_id uuid default null,
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
  v_result jsonb;
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, false);

  if p_collection_id is null
     or p_limit is null or p_limit < 1 or p_limit > 100
     or (p_after_position is null) <> (p_after_id is null)
     or (p_after_position is not null and p_after_position < 0)
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
      item.position,
      item.revision as placement_revision,
      course.id,
      course.contract_key,
      course.title,
      course.goal,
      course.publication_seq,
      course.content_hash,
      course.catalog_revision,
      course.updated_at,
      (
        select count(*) from public.modules module
        where module.course_id = course.id
      ) as module_count,
      (
        select count(*) from public.lessons lesson
        where lesson.course_id = course.id
      ) as lesson_count
    from public.catalog_collection_courses item
    join public.courses course
      on course.id = item.course_id
     and course.owner_id is null
     and course.status = 'published'
     and course.deleted_at is null
    where item.collection_id = p_collection_id
      and item.deleted_at is null
      and (
        v_query = ''
        or course.title ilike '%' || v_query || '%'
        or course.goal ilike '%' || v_query || '%'
        or course.contract_key ilike '%' || v_query || '%'
      )
      and (
        p_after_position is null
        or (item.position, course.id) > (p_after_position, p_after_id)
      )
    order by item.position, course.id
    limit p_limit + 1
  ),
  page as (
    select * from candidates
    order by position, id
    limit p_limit
  )
  select jsonb_build_object(
    'collectionId', p_collection_id,
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId', page.placement_id,
        'placementRevision', page.placement_revision,
        'position', page.position,
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
      ) order by page.position, page.id)
      from page
    ), '[]'::jsonb),
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'afterPosition', page.position,
        'afterId', page.id
      )
      from page
      order by page.position desc, page.id desc
      limit 1
    ) else null end
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.get_catalog_course_admin(
  p_actor_user_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result jsonb;
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, false);

  if p_course_id is null then
    raise exception 'Curso oficial inválido.'
      using errcode = '22023';
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
      'position', item.position,
      'placementRevision', item.revision
    ),
    'counts', jsonb_build_object(
      'modules', (
        select count(*) from public.modules module
        where module.course_id = course.id
      ),
      'lessons', (
        select count(*) from public.lessons lesson
        where lesson.course_id = course.id
      ),
      'microsequences', (
        select count(*) from public.microsequences microsequence
        where microsequence.course_id = course.id
      ),
      'cards', (
        select count(*) from public.cards card
        where card.course_id = course.id
      )
    )
  )
  into v_result
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
$$;

create or replace function public.update_catalog_course_metadata_admin(
  p_actor_user_id uuid,
  p_request_id text,
  p_course_id uuid,
  p_base_revision bigint,
  p_title text default null,
  p_goal text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_command jsonb;
  v_course public.courses%rowtype;
  v_changed boolean;
  v_result jsonb;
begin
  v_command := private.begin_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'update_course_metadata',
    jsonb_strip_nulls(jsonb_build_object(
      'courseId', p_course_id,
      'baseRevision', p_base_revision,
      'title', p_title,
      'goal', p_goal
    )),
    false
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') || jsonb_build_object('idempotent', true);
  end if;

  if p_course_id is null
     or p_base_revision is null or p_base_revision < 1
     or (p_title is null and p_goal is null)
     or (p_title is not null and (
       nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 300
     ))
     or (p_goal is not null and (
       nullif(btrim(p_goal), '') is null or char_length(btrim(p_goal)) > 4000
     )) then
    raise exception 'Metadados do curso oficial inválidos.'
      using errcode = '22023';
  end if;

  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null
  for update;
  if not found then
    raise exception 'Curso oficial inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;
  if v_course.catalog_revision <> p_base_revision then
    raise exception 'Os metadados do curso mudaram desde a leitura.'
      using errcode = '40001';
  end if;

  v_changed := (
    p_title is not null and v_course.title is distinct from btrim(p_title)
  ) or (
    p_goal is not null and v_course.goal is distinct from btrim(p_goal)
  );
  if v_changed then
    update public.courses course
    set title = coalesce(btrim(p_title), course.title),
        goal = coalesce(btrim(p_goal), course.goal),
        publication_seq = course.publication_seq + 1
    where course.id = p_course_id
    returning * into v_course;
  end if;

  v_result := jsonb_build_object(
    'status', case when v_changed then 'updated' else 'unchanged' end,
    'courseId', v_course.id,
    'contractKey', v_course.contract_key,
    'title', v_course.title,
    'goal', v_course.goal,
    'publicationSeq', v_course.publication_seq,
    'contentHash', v_course.content_hash,
    'revision', v_course.catalog_revision,
    'idempotent', false
  );
  perform private.complete_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'update_course_metadata',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.create_catalog_collection_admin(
  p_actor_user_id uuid,
  p_request_id text,
  p_contract_key text,
  p_title text,
  p_description text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_command jsonb;
  v_collection public.catalog_collections%rowtype;
  v_result jsonb;
begin
  v_command := private.begin_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'create_collection',
    jsonb_build_object(
      'contractKey', p_contract_key,
      'title', p_title,
      'description', p_description
    ),
    true
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') || jsonb_build_object('idempotent', true);
  end if;

  if p_contract_key is null
     or btrim(p_contract_key) !~ '^[a-z0-9][a-z0-9-]{0,119}$'
     or p_title is null
     or nullif(btrim(p_title), '') is null
     or char_length(btrim(p_title)) > 160
     or p_description is null
     or char_length(p_description) > 1000 then
    raise exception 'Dados da coleção inválidos.'
      using errcode = '22023';
  end if;

  lock table public.catalog_collections in share row exclusive mode;

  insert into public.catalog_collections(
    contract_key, title, description, position, is_published
  ) values (
    btrim(p_contract_key),
    btrim(p_title),
    p_description,
    coalesce((
      select collection.position
      from public.catalog_collections collection
      where collection.contract_key = 'outros'
        and collection.is_published
        and collection.deleted_at is null
      limit 1
    ), (
      select coalesce(max(collection.position) + 1, 0)
      from public.catalog_collections collection
      where collection.is_published
        and collection.deleted_at is null
    )),
    true
  )
  returning * into v_collection;

  update public.catalog_collections collection
  set position = v_collection.position + 1
  where collection.contract_key = 'outros'
    and collection.id <> v_collection.id
    and collection.is_published
    and collection.deleted_at is null;

  v_result := jsonb_build_object(
    'status', 'created',
    'collectionId', v_collection.id,
    'contractKey', v_collection.contract_key,
    'title', v_collection.title,
    'description', v_collection.description,
    'position', v_collection.position,
    'revision', v_collection.revision,
    'courseCount', 0,
    'idempotent', false
  );
  perform private.complete_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'create_collection',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.rename_catalog_collection_admin(
  p_actor_user_id uuid,
  p_request_id text,
  p_collection_id uuid,
  p_base_revision bigint,
  p_title text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_command jsonb;
  v_collection public.catalog_collections%rowtype;
  v_result jsonb;
  v_changed boolean;
begin
  v_command := private.begin_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'rename_collection',
    jsonb_strip_nulls(jsonb_build_object(
      'collectionId', p_collection_id,
      'baseRevision', p_base_revision,
      'title', p_title,
      'description', p_description
    )),
    true
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') || jsonb_build_object('idempotent', true);
  end if;

  if p_collection_id is null
     or p_base_revision is null or p_base_revision < 1
     or p_title is null
     or nullif(btrim(p_title), '') is null
     or char_length(btrim(p_title)) > 160
     or (p_description is not null and char_length(p_description) > 1000) then
    raise exception 'Dados da coleção inválidos.'
      using errcode = '22023';
  end if;

  select * into v_collection
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for update;
  if not found then
    raise exception 'Coleção de catálogo inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;
  if v_collection.revision <> p_base_revision then
    raise exception 'A coleção mudou desde a leitura.'
      using errcode = '40001';
  end if;

  v_changed := v_collection.title is distinct from btrim(p_title)
    or (
      p_description is not null
      and v_collection.description is distinct from p_description
    );
  if v_changed then
    update public.catalog_collections collection
    set title = btrim(p_title),
        description = coalesce(p_description, collection.description)
    where collection.id = p_collection_id
    returning * into v_collection;
  end if;

  v_result := jsonb_build_object(
    'status', case when v_changed then 'renamed' else 'unchanged' end,
    'collectionId', v_collection.id,
    'contractKey', v_collection.contract_key,
    'title', v_collection.title,
    'description', v_collection.description,
    'position', v_collection.position,
    'revision', v_collection.revision,
    'idempotent', false
  );
  perform private.complete_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'rename_collection',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.retire_catalog_collection_admin(
  p_actor_user_id uuid,
  p_request_id text,
  p_collection_id uuid,
  p_replacement_collection_id uuid,
  p_base_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_command jsonb;
  v_source public.catalog_collections%rowtype;
  v_target public.catalog_collections%rowtype;
  v_target_start bigint;
  v_moved bigint;
  v_result jsonb;
begin
  v_command := private.begin_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'retire_collection',
    jsonb_build_object(
      'collectionId', p_collection_id,
      'replacementCollectionId', p_replacement_collection_id,
      'baseRevision', p_base_revision
    ),
    true
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') || jsonb_build_object('idempotent', true);
  end if;

  if p_collection_id is null
     or p_replacement_collection_id is null
     or p_collection_id = p_replacement_collection_id
     or p_base_revision is null
     or p_base_revision < 1 then
    raise exception 'Aposentadoria de coleção inválida.'
      using errcode = '22023';
  end if;

  lock table public.catalog_collections in share row exclusive mode;
  lock table public.catalog_collection_courses in share row exclusive mode;

  perform 1
  from public.catalog_collections collection
  where collection.id in (p_collection_id, p_replacement_collection_id)
  order by collection.id
  for update;

  select * into v_source
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null;
  if not found then
    raise exception 'Coleção de catálogo inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;
  if v_source.contract_key = 'outros' then
    raise exception 'A coleção Outros é a classificação editorial de reserva.'
      using errcode = '23514';
  end if;
  if v_source.revision <> p_base_revision then
    raise exception 'A coleção mudou desde a leitura.'
      using errcode = '40001';
  end if;

  select * into v_target
  from public.catalog_collections collection
  where collection.id = p_replacement_collection_id
    and collection.is_published
    and collection.deleted_at is null;
  if not found then
    raise exception 'Coleção substituta inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;

  select coalesce(max(item.position) + 1, 0)
  into v_target_start
  from public.catalog_collection_courses item
  where item.collection_id = v_target.id
    and item.deleted_at is null;

  with moving as (
    select item.id,
      row_number() over (
        order by item.position, item.course_id, item.id
      ) - 1 as offset
    from public.catalog_collection_courses item
    where item.collection_id = v_source.id
      and item.deleted_at is null
  ),
  changed as (
    update public.catalog_collection_courses item
    set collection_id = v_target.id,
        position = v_target_start + moving.offset
    from moving
    where item.id = moving.id
    returning item.id
  )
  select count(*) into v_moved from changed;

  update public.catalog_collections collection
  set is_published = false,
      deleted_at = now()
  where collection.id = v_source.id
  returning * into v_source;

  v_result := jsonb_build_object(
    'status', 'retired',
    'collectionId', v_source.id,
    'replacementCollectionId', v_target.id,
    'movedCourseCount', v_moved,
    'revision', v_source.revision,
    'idempotent', false
  );
  perform private.complete_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'retire_collection',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.reorder_catalog_collections_admin(
  p_actor_user_id uuid,
  p_request_id text,
  p_order jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_command jsonb;
  v_expected_count bigint;
  v_result jsonb;
begin
  v_command := private.begin_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'reorder_collections',
    jsonb_build_object('order', p_order),
    true
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') || jsonb_build_object('idempotent', true);
  end if;

  if p_order is null or jsonb_typeof(p_order) <> 'array' then
    raise exception 'Ordem de coleções inválida.'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_order) < 1
     or jsonb_array_length(p_order) > 1000 then
    raise exception 'Ordem de coleções inválida.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_order) entry
    where not private.catalog_order_entry_is_valid(entry, 'collectionId')
  ) then
    raise exception 'Ordem de coleções inválida.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct (entry->>'collectionId')::uuid)
    from jsonb_array_elements(p_order) entry
  ) <> jsonb_array_length(p_order) then
    raise exception 'A ordem repete uma coleção.'
      using errcode = '22023';
  end if;

  lock table public.catalog_collections in share row exclusive mode;
  lock table public.catalog_collection_courses in share row exclusive mode;

  perform 1
  from public.catalog_collections collection
  where collection.is_published and collection.deleted_at is null
  order by collection.id
  for update;

  select count(*) into v_expected_count
  from public.catalog_collections collection
  where collection.is_published and collection.deleted_at is null;

  if v_expected_count <> jsonb_array_length(p_order)
     or exists (
       select 1
       from jsonb_array_elements(p_order) with ordinality listed(entry, ordinal)
       left join public.catalog_collections collection
         on collection.id = (listed.entry->>'collectionId')::uuid
        and collection.is_published
        and collection.deleted_at is null
       where collection.id is null
          or collection.revision <>
            (listed.entry->>'baseRevision')::bigint
     ) then
    raise exception 'A lista de coleções está desatualizada.'
      using errcode = '40001';
  end if;

  with desired as (
    select
      (listed.entry->>'collectionId')::uuid as collection_id,
      listed.ordinal::integer - 1 as position
    from jsonb_array_elements(p_order) with ordinality listed(entry, ordinal)
  )
  update public.catalog_collections collection
  set position = desired.position
  from desired
  where collection.id = desired.collection_id
    and collection.position is distinct from desired.position;

  select jsonb_build_object(
    'status', 'reordered',
    'orderedCollectionCount', count(*),
    'idempotent', false
  )
  into v_result
  from public.catalog_collections collection
  where collection.is_published and collection.deleted_at is null;

  perform private.complete_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'reorder_collections',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.move_catalog_course_admin(
  p_actor_user_id uuid,
  p_request_id text,
  p_course_id uuid,
  p_target_collection_id uuid,
  p_base_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_command jsonb;
  v_course public.courses%rowtype;
  v_placement public.catalog_collection_courses%rowtype;
  v_original_collection_id uuid;
  v_result jsonb;
  v_changed boolean;
begin
  v_command := private.begin_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'move_course',
    jsonb_build_object(
      'courseId', p_course_id,
      'targetCollectionId', p_target_collection_id,
      'baseRevision', p_base_revision
    ),
    false
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') || jsonb_build_object('idempotent', true);
  end if;

  if p_course_id is null
     or p_target_collection_id is null
     or p_base_revision is null
     or p_base_revision < 1 then
    raise exception 'Movimentação de curso inválida.'
      using errcode = '22023';
  end if;

  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null
  for share;
  if not found then
    raise exception 'Curso oficial inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;

  lock table public.catalog_collection_courses in share row exclusive mode;

  perform 1
  from public.catalog_collections collection
  where collection.id = p_target_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for share;
  if not found then
    raise exception 'Coleção de destino inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;

  select * into v_placement
  from public.catalog_collection_courses item
  where item.course_id = p_course_id
    and item.deleted_at is null
  for update;
  if not found then
    raise exception 'Curso oficial sem classificação válida.'
      using errcode = '23514';
  end if;
  if v_placement.revision <> p_base_revision then
    raise exception 'A classificação do curso mudou desde a leitura.'
      using errcode = '40001';
  end if;

  v_original_collection_id := v_placement.collection_id;
  v_changed := v_placement.collection_id <> p_target_collection_id;
  if v_changed then
    update public.catalog_collection_courses item
    set collection_id = p_target_collection_id,
        position = coalesce((
          select max(peer.position) + 1
          from public.catalog_collection_courses peer
          where peer.collection_id = p_target_collection_id
            and peer.deleted_at is null
        ), 0)
    where item.id = v_placement.id
    returning * into v_placement;
  end if;

  v_result := jsonb_build_object(
    'status', case when v_changed then 'moved' else 'unchanged' end,
    'courseId', v_course.id,
    'fromCollectionId', v_original_collection_id,
    'collectionId', v_placement.collection_id,
    'position', v_placement.position,
    'placementRevision', v_placement.revision,
    'idempotent', false
  );
  perform private.complete_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'move_course',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.reorder_catalog_courses_admin(
  p_actor_user_id uuid,
  p_request_id text,
  p_collection_id uuid,
  p_order jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_command jsonb;
  v_expected_count bigint;
  v_result jsonb;
begin
  v_command := private.begin_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'reorder_courses',
    jsonb_build_object(
      'collectionId', p_collection_id,
      'order', p_order
    ),
    false
  );
  if (v_command->>'replayed')::boolean then
    return (v_command->'result') || jsonb_build_object('idempotent', true);
  end if;

  if p_collection_id is null
     or p_order is null
     or jsonb_typeof(p_order) <> 'array' then
    raise exception 'Ordem de cursos inválida.'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_order) > 1000 then
    raise exception 'Ordem de cursos inválida.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_order) entry
    where not private.catalog_order_entry_is_valid(entry, 'courseId')
  ) then
    raise exception 'Ordem de cursos inválida.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct (entry->>'courseId')::uuid)
    from jsonb_array_elements(p_order) entry
  ) <> jsonb_array_length(p_order) then
    raise exception 'A ordem repete um curso.'
      using errcode = '22023';
  end if;

  lock table public.catalog_collection_courses in share row exclusive mode;

  perform 1
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for share;
  if not found then
    raise exception 'Coleção de catálogo inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.catalog_collection_courses item
  where item.collection_id = p_collection_id
    and item.deleted_at is null
  order by item.id
  for update;

  select count(*) into v_expected_count
  from public.catalog_collection_courses item
  where item.collection_id = p_collection_id
    and item.deleted_at is null;

  if v_expected_count <> jsonb_array_length(p_order)
     or exists (
       select 1
       from jsonb_array_elements(p_order) with ordinality listed(entry, ordinal)
       left join public.catalog_collection_courses item
         on item.course_id = (listed.entry->>'courseId')::uuid
        and item.collection_id = p_collection_id
        and item.deleted_at is null
       where item.id is null
          or item.revision <> (listed.entry->>'baseRevision')::bigint
     ) then
    raise exception 'A lista de cursos está desatualizada.'
      using errcode = '40001';
  end if;

  with desired as (
    select
      (listed.entry->>'courseId')::uuid as course_id,
      listed.ordinal::integer - 1 as position
    from jsonb_array_elements(p_order) with ordinality listed(entry, ordinal)
  )
  update public.catalog_collection_courses item
  set position = desired.position
  from desired
  where item.collection_id = p_collection_id
    and item.course_id = desired.course_id
    and item.deleted_at is null
    and item.position is distinct from desired.position;

  select jsonb_build_object(
    'status', 'reordered',
    'collectionId', p_collection_id,
    'orderedCourseCount', count(*),
    'idempotent', false
  )
  into v_result
  from public.catalog_collection_courses item
  where item.collection_id = p_collection_id
    and item.deleted_at is null;

  perform private.complete_catalog_admin_command(
    p_actor_user_id,
    p_request_id,
    'reorder_courses',
    v_command->>'requestHash',
    v_result
  );
  return v_result;
end;
$$;

revoke all on table private.catalog_admin_receipts
  from public, anon, authenticated, service_role;
revoke all on function private.require_catalog_admin_actor(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.begin_catalog_admin_command(
  uuid, text, text, jsonb, boolean
) from public, anon, authenticated, service_role;
revoke all on function private.complete_catalog_admin_command(
  uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.catalog_order_entry_is_valid(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function private.assert_official_catalog_membership()
  from public, anon, authenticated, service_role;
revoke all on function private.touch_course_catalog_revision()
  from public, anon, authenticated, service_role;

revoke all on function public.list_catalog_collections_admin(
  uuid, integer, integer, uuid, text, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.list_catalog_courses_admin(
  uuid, uuid, integer, integer, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_catalog_course_admin(
  uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.update_catalog_course_metadata_admin(
  uuid, text, uuid, bigint, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_catalog_collection_admin(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.rename_catalog_collection_admin(
  uuid, text, uuid, bigint, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.retire_catalog_collection_admin(
  uuid, text, uuid, uuid, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.reorder_catalog_collections_admin(
  uuid, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.move_catalog_course_admin(
  uuid, text, uuid, uuid, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.reorder_catalog_courses_admin(
  uuid, text, uuid, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.list_catalog_collections_admin(
  uuid, integer, integer, uuid, text, boolean
) to service_role;
grant execute on function public.list_catalog_courses_admin(
  uuid, uuid, integer, integer, uuid, text
) to service_role;
grant execute on function public.get_catalog_course_admin(
  uuid, uuid
) to service_role;
grant execute on function public.update_catalog_course_metadata_admin(
  uuid, text, uuid, bigint, text, text
) to service_role;
grant execute on function public.create_catalog_collection_admin(
  uuid, text, text, text, text
) to service_role;
grant execute on function public.rename_catalog_collection_admin(
  uuid, text, uuid, bigint, text, text
) to service_role;
grant execute on function public.retire_catalog_collection_admin(
  uuid, text, uuid, uuid, bigint
) to service_role;
grant execute on function public.reorder_catalog_collections_admin(
  uuid, text, jsonb
) to service_role;
grant execute on function public.move_catalog_course_admin(
  uuid, text, uuid, uuid, bigint
) to service_role;
grant execute on function public.reorder_catalog_courses_admin(
  uuid, text, uuid, jsonb
) to service_role;

commit;
