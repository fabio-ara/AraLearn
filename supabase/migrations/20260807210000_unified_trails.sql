-- Trilhas passa a indexar diretamente a composição corrente. A identidade do
-- item não depende de publicação nem de seleção e, por isso, permanece a mesma
-- do primeiro plano até a eventual distribuição do curso.

begin;

-- Arquivar uma publicação não elimina mais a composição que lhe deu origem.
-- O gatilho anterior desmontava até workspaces de raiz única antes de a nova
-- autoridade de Trilhas poder encerrar somente seleção/alias/estado pessoal.
drop trigger if exists close_archived_course_compositions_v1 on public.courses;
drop function if exists private.close_archived_course_compositions_v1();

create table private.trail_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  workspace_course_id text,
  course_id uuid references public.courses(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trail_items_workspace_pair_v1 check (
    (workspace_id is null) = (workspace_course_id is null)
  ),
  constraint trail_items_target_v1 check (
    workspace_id is not null or course_id is not null
  ),
  constraint trail_items_workspace_course_id_v1 check (
    workspace_course_id is null or (
      btrim(workspace_course_id) <> ''
      and workspace_course_id = btrim(workspace_course_id)
      and char_length(workspace_course_id) <= 240
    )
  ),
  unique(workspace_id, workspace_course_id),
  unique(course_id)
);

create index trail_items_workspace_v1_idx
  on private.trail_items(workspace_id, workspace_course_id)
  where workspace_id is not null;

-- Uma raiz pode ter sido publicada primeiro como privada e depois no catálogo.
-- Os UUIDs de publicação continuam resolvíveis, mas pertencem a uma única
-- identidade de Trilhas. trail_items.course_id indica somente a publicação
-- preferida corrente; esta tabela contém todos os aliases válidos.
create table private.trail_item_courses (
  course_id uuid primary key references public.courses(id) on delete cascade,
  trail_item_id uuid not null
    references private.trail_items(id) on update cascade on delete cascade,
  linked_at timestamptz not null default now(),
  unique(trail_item_id, course_id)
);

create index trail_item_courses_item_v1_idx
  on private.trail_item_courses(trail_item_id, course_id);

-- Cursos que ainda não têm composição usam inicialmente o próprio UUID. Ao
-- ganhar um workspace, a associação é atualizada sem tocar no JSON didático.
insert into private.trail_items(id, course_id, updated_at)
select course.id, course.id, course.updated_at
from public.courses course
where course.status = 'published'
  and course.deleted_at is null
  and course.document_storage_enabled
on conflict(course_id) do nothing;

insert into private.trail_item_courses(course_id, trail_item_id, linked_at)
select course.id, item.id, course.updated_at
from public.courses course
join private.trail_items item on item.course_id = course.id
where course.status = 'published'
  and course.deleted_at is null
  and course.document_storage_enabled
on conflict(course_id) do nothing;

do $block$
begin
  if exists(
    select 1
    from private.authoring_workspace_publications publication
    group by publication.course_id
    having count(distinct (publication.workspace_id, publication.workspace_course_id)) > 1
  ) then
    raise exception 'Uma publicação histórica aponta o mesmo curso para raízes distintas.'
      using errcode = '23505';
  end if;
end;
$block$;

-- Elevar a mesma publicação ao catálogo substitui o binding privado idêntico.
-- UUIDs privados distintos continuam como aliases explícitos da mesma raiz.
delete from private.authoring_workspace_publications private_link
using private.authoring_workspace_publications catalog_link
where private_link.workspace_id = catalog_link.workspace_id
  and private_link.workspace_course_id = catalog_link.workspace_course_id
  and private_link.course_id = catalog_link.course_id
  and private_link.target = 'private'
  and catalog_link.target = 'catalog';

create unique index authoring_workspace_publications_trail_course_v1_idx
  on private.authoring_workspace_publications(course_id);

create temporary table trail_root_canonical_v1 on commit drop as
select distinct on (publication.workspace_id, publication.workspace_course_id)
  publication.workspace_id,
  publication.workspace_course_id,
  publication.course_id as preferred_course_id,
  alias.trail_item_id,
  publication.updated_at
from private.authoring_workspace_publications publication
join private.authoring_workspaces workspace
  on workspace.id = publication.workspace_id
 and workspace.deleted_at is null
join private.authoring_workspace_entities entity
  on entity.workspace_id = publication.workspace_id
 and entity.entity_type = 'course'
 and entity.entity_id = publication.workspace_course_id
join private.trail_item_courses alias on alias.course_id = publication.course_id
order by publication.workspace_id, publication.workspace_course_id,
  (publication.target = 'catalog') desc,
  (workspace.source_course_id = publication.course_id) desc,
  publication.updated_at desc,
  publication.course_id;

update private.trail_item_courses alias
set trail_item_id = canonical.trail_item_id
from private.authoring_workspace_publications publication
join trail_root_canonical_v1 canonical
  on canonical.workspace_id = publication.workspace_id
 and canonical.workspace_course_id = publication.workspace_course_id
where alias.course_id = publication.course_id
  and alias.trail_item_id <> canonical.trail_item_id;

delete from private.trail_items item
where not exists(
  select 1 from private.trail_item_courses alias
  where alias.trail_item_id = item.id
);

update private.trail_items item
set workspace_id = canonical.workspace_id,
    workspace_course_id = canonical.workspace_course_id,
    course_id = canonical.preferred_course_id,
    updated_at = greatest(item.updated_at, canonical.updated_at)
from trail_root_canonical_v1 canonical
where item.id = canonical.trail_item_id;

create function private.guard_unique_trail_course_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if tg_op = 'INSERT' and new.target = 'catalog' then
    delete from private.authoring_workspace_publications publication
    where publication.workspace_id = new.workspace_id
      and publication.workspace_course_id = new.workspace_course_id
      and publication.course_id = new.course_id
      and publication.target = 'private';
  end if;
  if exists(
    select 1 from private.authoring_workspace_publications publication
    where publication.course_id = new.course_id
      and (
        publication.workspace_id,
        publication.workspace_course_id,
        publication.target
      ) is distinct from (
        new.workspace_id,
        new.workspace_course_id,
        new.target
      )
  ) then
    raise exception 'Este curso já pertence a outra raiz publicada.'
      using errcode = '23505';
  end if;
  return new;
end;
$function$;

create trigger authoring_workspace_publication_unique_trail_course_v1
before insert or update of workspace_id, workspace_course_id, target, course_id
on private.authoring_workspace_publications
for each row execute function private.guard_unique_trail_course_publication_v1();

with canonical_publication as (
  select distinct on (publication.workspace_id, publication.workspace_course_id)
    publication.workspace_id,
    publication.workspace_course_id,
    publication.course_id,
    publication.updated_at
  from private.authoring_workspace_publications publication
  join private.authoring_workspaces workspace
    on workspace.id = publication.workspace_id
   and workspace.deleted_at is null
  join private.authoring_workspace_entities entity
    on entity.workspace_id = publication.workspace_id
   and entity.entity_type = 'course'
   and entity.entity_id = publication.workspace_course_id
  order by publication.workspace_id, publication.workspace_course_id,
    (publication.target = 'catalog') desc,
    publication.updated_at desc,
    publication.course_id
)
update private.trail_items item
set workspace_id = publication.workspace_id,
    workspace_course_id = publication.workspace_course_id,
    course_id = publication.course_id,
    updated_at = greatest(item.updated_at, publication.updated_at)
from canonical_publication publication
where item.id = (
  select alias.trail_item_id from private.trail_item_courses alias
  where alias.course_id = publication.course_id
);

-- Abrir um curso existente para edição não cria uma segunda identidade. O
-- contractKey preservado no documento identifica somente a raiz importada;
-- outras raízes do mesmo workspace continuam sendo cursos independentes.
with source_root as (
  select workspace.id as workspace_id,
    entity.entity_id as workspace_course_id,
    course.id as course_id,
    greatest(workspace.updated_at, entity.updated_at) as updated_at
  from private.authoring_workspaces workspace
  join public.courses course on course.id = workspace.source_course_id
  join private.authoring_workspace_entities entity
    on entity.workspace_id = workspace.id
   and entity.entity_type = 'course'
   and entity.entity_id = course.contract_key
  where workspace.deleted_at is null
)
update private.trail_items item
set workspace_id = source.workspace_id,
    workspace_course_id = source.workspace_course_id,
    updated_at = greatest(item.updated_at, source.updated_at)
from source_root source
join private.trail_item_courses alias on alias.course_id = source.course_id
where item.id = alias.trail_item_id and item.workspace_id is null;

insert into private.trail_items(
  workspace_id, workspace_course_id, created_at, updated_at
)
select entity.workspace_id, entity.entity_id, entity.updated_at, entity.updated_at
from private.authoring_workspace_entities entity
join private.authoring_workspaces workspace
  on workspace.id = entity.workspace_id
 and workspace.deleted_at is null
where entity.entity_type = 'course'
on conflict(workspace_id, workspace_course_id) do nothing;

-- O vínculo antigo era restrito a uma seleção publicada. A mesma tabela é
-- cortada para o novo objeto a fim de migrar IDs e posições sem dupla escrita.
alter table public.study_path_courses rename to study_path_items;

drop trigger if exists study_path_courses_sync on public.study_path_items;
drop trigger if exists study_path_courses_touch on public.study_path_items;
drop policy if exists study_path_courses_owner on public.study_path_items;

alter table public.study_path_items add column trail_item_id uuid;

update public.study_path_items item
set trail_item_id = trail_item.id
from public.user_course_selections selection
join private.trail_item_courses alias on alias.course_id = selection.course_id
join private.trail_items trail_item on trail_item.id = alias.trail_item_id
where selection.id = item.selection_id;

-- Resíduos de cursos já arquivados não têm autoridade nem identidade em
-- Trilhas. O corte os elimina antes do NOT NULL, sem emitir tombstones de uma
-- representação que nunca fará parte do feed novo.
delete from public.study_path_items item
where item.trail_item_id is null;
select set_config('aralearn.suppress_sync_changes', 'on', true);
delete from public.user_course_selections selection
using public.courses course
where course.id = selection.course_id
  and (
    course.status <> 'published'
    or course.deleted_at is not null
    or not course.document_storage_enabled
  );
select set_config('aralearn.suppress_sync_changes', 'off', true);

do $block$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_name
    from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'study_path_items'
      and column_name = 'selection_id'
  loop
    execute format(
      'alter table public.study_path_items drop constraint if exists %I',
      v_constraint.constraint_name
    );
  end loop;
end;
$block$;

do $block$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'study_path_items'
      and constraint_type = 'FOREIGN KEY'
  loop
    execute format(
      'alter table public.study_path_items drop constraint if exists %I',
      v_constraint.constraint_name
    );
  end loop;
end;
$block$;

-- UNIQUE/CHECK antigos descreviam selection_id e não podem sobreviver como
-- invariantes duplicadas depois do rename. A PK física é a única preservada.
do $block$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'study_path_items'
      and constraint_type in ('UNIQUE', 'CHECK')
  loop
    execute format(
      'alter table public.study_path_items drop constraint if exists %I',
      v_constraint.constraint_name
    );
  end loop;
end;
$block$;

drop index if exists public.study_path_courses_path_position_idx;
drop index if exists public.study_path_courses_owner_idx;

alter table public.study_path_items
  alter column trail_item_id set not null,
  drop column selection_id,
  add constraint study_path_items_path_fk foreign key(path_id, owner_id)
    references public.study_paths(id, owner_id) on delete cascade,
  add constraint study_path_items_trail_item_fk foreign key(trail_item_id)
    references private.trail_items(id) on update cascade on delete cascade,
  add constraint study_path_items_position_nonnegative check(position >= 0),
  add constraint study_path_items_owner_item_unique unique(owner_id, trail_item_id),
  add constraint study_path_items_path_item_unique unique(path_id, trail_item_id),
  add constraint study_path_items_id_owner_unique unique(id, owner_id);

create index study_path_items_path_position_idx
  on public.study_path_items(path_id, position, id);
create index study_path_items_owner_idx
  on public.study_path_items(owner_id, trail_item_id);

create trigger study_path_items_touch
before update on public.study_path_items
for each row execute function private.touch_lean_row();

alter table public.study_path_items enable row level security;
alter table public.study_path_items force row level security;
create policy study_path_items_owner on public.study_path_items
  for all to authenticated
  using(owner_id = auth.uid())
  with check(owner_id = auth.uid());

revoke all on table private.trail_items from public, anon, authenticated, service_role;
revoke all on table private.trail_item_courses from public, anon, authenticated, service_role;
revoke all on table public.study_path_items from public, anon, authenticated;

create table private.trail_mutation_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null,
  operation text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  primary key(owner_id, request_id),
  constraint trail_mutation_receipts_hash_v1 check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint trail_mutation_receipts_operation_v1 check (
    operation in (
      'create_group', 'rename_group', 'move_group', 'delete_group',
      'place_item', 'move_item', 'remove_item_from_group'
    )
  ),
  constraint trail_mutation_receipts_expiry_v1 check (
    expires_at > created_at and expires_at <= created_at + interval '30 days'
  )
);

create index trail_mutation_receipts_expiry_v1_idx
  on private.trail_mutation_receipts(expires_at);
revoke all on table private.trail_mutation_receipts
  from public, anon, authenticated, service_role;

create function private.normalize_trail_groups_v1(p_owner_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
  with ordered as (
    select path.id,
      row_number() over(order by path.position, path.id)::integer - 1 as position
    from public.study_paths path
    where path.owner_id = p_owner_id
  )
  update public.study_paths path
  set position = ordered.position
  from ordered
  where path.id = ordered.id and path.position is distinct from ordered.position
$function$;

create function private.normalize_trail_group_items_v1(
  p_owner_id uuid,
  p_path_id uuid
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
  with ordered as (
    select item.id,
      row_number() over(order by item.position, item.id)::integer - 1 as position
    from public.study_path_items item
    where item.owner_id = p_owner_id and item.path_id = p_path_id
  )
  update public.study_path_items item
  set position = ordered.position
  from ordered
  where item.id = ordered.id and item.position is distinct from ordered.position
$function$;

create function private.move_trail_group_v1(
  p_owner_id uuid,
  p_path_id uuid,
  p_target_position integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_count integer;
begin
  perform 1 from public.study_paths
  where owner_id = p_owner_id
  order by position, id
  for update;
  select count(*)::integer into v_count
  from public.study_paths where owner_id = p_owner_id;
  if not exists(
    select 1 from public.study_paths
    where id = p_path_id and owner_id = p_owner_id
  ) then
    raise exception 'Grupo inexistente ou inacessível.' using errcode = 'P0002';
  end if;
  if p_target_position is null or p_target_position < 0
     or p_target_position >= v_count then
    raise exception 'Posição do grupo inválida.' using errcode = '22023';
  end if;
  with siblings as (
    select path.id,
      row_number() over(order by path.position, path.id)::integer - 1 as slot
    from public.study_paths path
    where path.owner_id = p_owner_id and path.id <> p_path_id
  ), desired as (
    select sibling.id,
      case when sibling.slot >= p_target_position
        then sibling.slot + 1 else sibling.slot end as position
    from siblings sibling
    union all select p_path_id, p_target_position
  )
  update public.study_paths path
  set position = desired.position
  from desired
  where path.id = desired.id and path.position is distinct from desired.position;
  perform private.normalize_trail_groups_v1(p_owner_id);
end;
$function$;

create function private.move_trail_item_v1(
  p_owner_id uuid,
  p_trail_item_id uuid,
  p_path_id uuid,
  p_target_position integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_placement_id uuid;
  v_old_path_id uuid;
  v_count integer;
begin
  if not exists(
    select 1 from public.study_paths
    where id = p_path_id and owner_id = p_owner_id
  ) then
    raise exception 'Grupo inexistente ou inacessível.' using errcode = 'P0002';
  end if;
  select item.id, item.path_id into v_placement_id, v_old_path_id
  from public.study_path_items item
  where item.owner_id = p_owner_id and item.trail_item_id = p_trail_item_id
  for update;
  if v_placement_id is null then
    v_placement_id := gen_random_uuid();
    insert into public.study_path_items(
      id, path_id, owner_id, trail_item_id, position
    ) values(
      v_placement_id, p_path_id, p_owner_id, p_trail_item_id, 2147483646
    );
  else
    update public.study_path_items
    set path_id = p_path_id, position = 2147483646
    where id = v_placement_id;
  end if;
  select count(*)::integer into v_count
  from public.study_path_items
  where owner_id = p_owner_id and path_id = p_path_id;
  if p_target_position is null then
    p_target_position := v_count - 1;
  end if;
  if p_target_position < 0 or p_target_position >= v_count then
    raise exception 'Posição do item inválida.' using errcode = '22023';
  end if;
  with siblings as (
    select item.id,
      row_number() over(order by item.position, item.id)::integer - 1 as slot
    from public.study_path_items item
    where item.owner_id = p_owner_id
      and item.path_id = p_path_id
      and item.id <> v_placement_id
  ), desired as (
    select sibling.id,
      case when sibling.slot >= p_target_position
        then sibling.slot + 1 else sibling.slot end as position
    from siblings sibling
    union all select v_placement_id, p_target_position
  )
  update public.study_path_items item
  set position = desired.position
  from desired
  where item.id = desired.id and item.position is distinct from desired.position;
  perform private.normalize_trail_group_items_v1(p_owner_id, p_path_id);
  if v_old_path_id is not null and v_old_path_id <> p_path_id then
    perform private.normalize_trail_group_items_v1(p_owner_id, v_old_path_id);
  end if;
  return v_placement_id;
end;
$function$;

create function private.trail_item_accessible_v1(
  p_trail_item_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select exists(
    select 1
    from private.trail_items item
    where item.id = p_trail_item_id
      and (
        (item.workspace_id is not null and private.educational_workspace_can_v1(
          item.workspace_id, p_user_id, 'read'
        ))
        or exists(
          select 1
          from public.user_course_selections selection
          join public.courses course on course.id = selection.course_id
          join private.trail_item_courses alias
            on alias.course_id = selection.course_id
          where selection.user_id = p_user_id
            and alias.trail_item_id = item.id
            and course.status = 'published'
            and course.deleted_at is null
            and course.document_storage_enabled
        )
      )
  )
$function$;

create function public.mutate_trails_v1(
  p_request_id uuid,
  p_operation text,
  p_arguments jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_receipt private.trail_mutation_receipts%rowtype;
  v_group_id uuid;
  v_trail_item_id uuid;
  v_target_position integer;
  v_placement_id uuid;
  v_old_path_id uuid;
  v_changed boolean := true;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_request_id is null
     or p_operation not in (
       'create_group', 'rename_group', 'move_group', 'delete_group',
       'place_item', 'move_item', 'remove_item_from_group'
     )
     or jsonb_typeof(coalesce(p_arguments, 'null'::jsonb)) <> 'object'
     or pg_column_size(p_arguments) > 4096 then
    raise exception 'Mutação de Trilhas inválida.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', p_operation, 'arguments', p_arguments
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-mutation:' || v_user_id::text || ':' || p_request_id::text, 0
  ));
  delete from private.trail_mutation_receipts receipt
  where receipt.owner_id = v_user_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired as materialized (
    select receipt.ctid
    from private.trail_mutation_receipts receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.owner_id, receipt.request_id
    limit 128
    for update skip locked
  )
  delete from private.trail_mutation_receipts receipt
  using expired
  where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.trail_mutation_receipts receipt
  where receipt.owner_id = v_user_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.request_hash <> v_hash or v_receipt.operation <> p_operation then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'trail-owner:' || v_user_id::text, 0
  ));
  v_group_id := private.try_uuid(p_arguments->>'groupId');
  v_trail_item_id := private.try_uuid(p_arguments->>'trailItemId');
  v_target_position := case
    when p_arguments ? 'targetPosition'
      and coalesce(p_arguments->>'targetPosition', '') ~ '^[0-9]+$'
      then (p_arguments->>'targetPosition')::integer
    when p_arguments ? 'targetPosition' then -1
    else null
  end;
  -- A organização e a eventual fusão publicação↔workspace usam o mesmo lock.
  -- O lock por owner já foi obtido acima; manter owner -> item evita deadlock
  -- quando a publicação precisa bloquear todos os placements afetados.
  if v_trail_item_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'trail-item:' || v_trail_item_id::text, 0
    ));
  end if;

  if p_operation = 'create_group' then
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field
      where field not in ('title', 'targetPosition')
    ) or nullif(btrim(p_arguments->>'title'), '') is null
       or char_length(p_arguments->>'title') > 160
       or v_target_position = -1 then
      raise exception 'Novo grupo inválido.' using errcode = '22023';
    end if;
    v_group_id := gen_random_uuid();
    insert into public.study_paths(id, owner_id, title, position)
    values(v_group_id, v_user_id, btrim(p_arguments->>'title'), 2147483646);
    if v_target_position is null then
      select count(*)::integer - 1 into v_target_position
      from public.study_paths where owner_id = v_user_id;
    end if;
    perform private.move_trail_group_v1(v_user_id, v_group_id, v_target_position);
  elsif p_operation = 'rename_group' then
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field
      where field not in ('groupId', 'title')
    ) or v_group_id is null
       or nullif(btrim(p_arguments->>'title'), '') is null
       or char_length(p_arguments->>'title') > 160 then
      raise exception 'Renomeação de grupo inválida.' using errcode = '22023';
    end if;
    update public.study_paths
    set title = btrim(p_arguments->>'title')
    where id = v_group_id and owner_id = v_user_id;
    if not found then
      raise exception 'Grupo inexistente ou inacessível.' using errcode = 'P0002';
    end if;
  elsif p_operation = 'move_group' then
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field
      where field not in ('groupId', 'targetPosition')
    ) or v_group_id is null or v_target_position is null
       or v_target_position < 0 then
      raise exception 'Movimentação de grupo inválida.' using errcode = '22023';
    end if;
    perform private.move_trail_group_v1(v_user_id, v_group_id, v_target_position);
  elsif p_operation = 'delete_group' then
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field where field <> 'groupId'
    ) or v_group_id is null then
      raise exception 'Exclusão de grupo inválida.' using errcode = '22023';
    end if;
    delete from public.study_paths
    where id = v_group_id and owner_id = v_user_id;
    v_changed := found;
    perform private.normalize_trail_groups_v1(v_user_id);
  elsif p_operation in ('place_item', 'move_item') then
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field
      where field not in ('trailItemId', 'groupId', 'targetPosition')
    ) or v_group_id is null or v_trail_item_id is null
       or v_target_position = -1 then
      raise exception 'Posicionamento de item inválido.' using errcode = '22023';
    end if;
    if not private.trail_item_accessible_v1(v_trail_item_id, v_user_id) then
      raise exception 'Item inexistente ou inacessível.' using errcode = '42501';
    end if;
    if p_operation = 'move_item' and not exists(
      select 1 from public.study_path_items item
      where item.owner_id = v_user_id and item.trail_item_id = v_trail_item_id
    ) then
      raise exception 'Item ainda não pertence a um grupo.' using errcode = 'P0002';
    end if;
    v_placement_id := private.move_trail_item_v1(
      v_user_id, v_trail_item_id, v_group_id, v_target_position
    );
  else
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field where field <> 'trailItemId'
    ) or v_trail_item_id is null then
      raise exception 'Retirada de item inválida.' using errcode = '22023';
    end if;
    delete from public.study_path_items item
    where item.owner_id = v_user_id and item.trail_item_id = v_trail_item_id
    returning item.path_id into v_old_path_id;
    v_changed := found;
    if v_old_path_id is not null then
      perform private.normalize_trail_group_items_v1(v_user_id, v_old_path_id);
    end if;
  end if;

  v_result := jsonb_strip_nulls(jsonb_build_object(
    'status', 'applied',
    'operation', p_operation,
    'requestId', p_request_id,
    'groupId', v_group_id,
    'trailItemId', v_trail_item_id,
    'placementId', v_placement_id,
    'changed', v_changed,
    'idempotent', false
  ));
  insert into private.trail_mutation_receipts(
    owner_id, request_id, request_hash, operation, result
  ) values(v_user_id, p_request_id, v_hash, p_operation, v_result);
  return v_result;
end;
$function$;

-- A associação entre uma composição e uma publicação conserva a identidade
-- que já estava visível. Cursos oficiais abertos para edição conservam o UUID
-- do curso; uma composição nascida privada conserva o UUID criado no plano.
create function private.ensure_course_trail_item_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if new.status <> 'published'
     or new.deleted_at is not null
     or not new.document_storage_enabled then
    return new;
  end if;
  insert into private.trail_items(id, course_id)
  values(new.id, new.id)
  on conflict(course_id) do nothing;
  insert into private.trail_item_courses(course_id, trail_item_id)
  select new.id, item.id from private.trail_items item
  where item.course_id = new.id
  on conflict(course_id) do nothing;
  return new;
end;
$function$;

create trigger courses_ensure_trail_item_v1
after insert on public.courses
for each row execute function private.ensure_course_trail_item_v1();

create function private.ensure_workspace_course_trail_item_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_source_course_id uuid;
begin
  if new.entity_type <> 'course' then return new; end if;
  select workspace.source_course_id into v_source_course_id
  from private.authoring_workspaces workspace
  join public.courses course
    on course.id = workspace.source_course_id
   and course.contract_key = new.entity_id
  where workspace.id = new.workspace_id and workspace.deleted_at is null;
  if v_source_course_id is not null then
    update private.trail_items item
    set workspace_id = new.workspace_id,
        workspace_course_id = new.entity_id,
        updated_at = now()
    from private.trail_item_courses alias
    where alias.course_id = v_source_course_id
      and item.id = alias.trail_item_id
      and item.workspace_id is null;
    if found then return new; end if;
  end if;
  -- Qualquer raiz que não corresponda ao contractKey da origem recebe sua
  -- própria identidade, inclusive em workspaces com mais de um curso.
  insert into private.trail_items(workspace_id, workspace_course_id)
  values(new.workspace_id, new.entity_id)
  on conflict(workspace_id, workspace_course_id) do nothing;
  return new;
end;
$function$;

create trigger authoring_workspace_course_ensure_trail_item_v1
after insert on private.authoring_workspace_entities
for each row execute function private.ensure_workspace_course_trail_item_v1();

-- A retirada de uma publicação não pode apagar a identidade de uma composição
-- que continua em construção. Já um item que só apontava para a publicação é
-- removido junto com seu estado pessoal e seus vínculos de grupo.
create function private.detach_deleted_course_from_trail_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_trail_item_id uuid;
  v_next_course_id uuid;
begin
  -- A seleção precisa encerrar seu estado enquanto o alias ainda resolve a
  -- identidade de Trilhas; só depois a publicação é desvinculada.
  delete from public.user_course_selections selection
  where selection.course_id = old.id;
  select alias.trail_item_id into v_trail_item_id
  from private.trail_item_courses alias where alias.course_id = old.id;
  if v_trail_item_id is null then return old; end if;
  delete from private.trail_item_courses where course_id = old.id;
  select alias.course_id into v_next_course_id
  from private.trail_item_courses alias
  where alias.trail_item_id = v_trail_item_id
  order by alias.course_id limit 1;
  if v_next_course_id is null and exists(
    select 1 from private.trail_items item
    where item.id = v_trail_item_id and item.workspace_id is null
  ) then
    delete from private.trail_items where id = v_trail_item_id;
  else
    update private.trail_items
    set course_id = v_next_course_id, updated_at = now()
    where id = v_trail_item_id;
  end if;
  return old;
end;
$function$;

create trigger courses_detach_trail_item_v1
before delete on public.courses
for each row execute function private.detach_deleted_course_from_trail_v1();

create function private.link_workspace_publication_trail_item_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_workspace_item private.trail_items%rowtype;
  v_course_item private.trail_items%rowtype;
  v_source_course_id uuid;
  v_keep_id uuid;
  v_drop_id uuid;
  v_locked_workspace_item_id uuid;
  v_locked_course_item_id uuid;
  v_lock_trail_item_id uuid;
  v_owner_id uuid;
  v_affected_paths jsonb;
  v_affected_path jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-root:' || new.workspace_id::text || ':' || new.workspace_course_id,
    0
  ));
  select * into v_workspace_item from private.trail_items item
  where item.workspace_id = new.workspace_id
    and item.workspace_course_id = new.workspace_course_id;
  select item.* into v_course_item
  from private.trail_item_courses alias
  join private.trail_items item on item.id = alias.trail_item_id
  where alias.course_id = new.course_id;
  v_locked_workspace_item_id := v_workspace_item.id;
  v_locked_course_item_id := v_course_item.id;
  perform 1
  from public.courses course
  where course.id = new.course_id
     or course.id in (
       select publication.course_id
       from private.authoring_workspace_publications publication
       where publication.workspace_id = new.workspace_id
         and publication.workspace_course_id = new.workspace_course_id
     )
  order by course.id
  for update;
  for v_owner_id in
    select distinct placement.owner_id
    from public.study_path_items placement
    where placement.trail_item_id in (v_workspace_item.id, v_course_item.id)
    order by placement.owner_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'trail-owner:' || v_owner_id::text, 0
    ));
  end loop;
  for v_lock_trail_item_id in
    select lock_id
    from (values (v_workspace_item.id), (v_course_item.id)) lock_row(lock_id)
    where lock_id is not null
    group by lock_id
    order by lock_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'trail-item:' || v_lock_trail_item_id::text, 0
    ));
  end loop;
  select * into v_workspace_item from private.trail_items item
  where item.workspace_id = new.workspace_id
    and item.workspace_course_id = new.workspace_course_id
  for update;
  select item.* into v_course_item
  from private.trail_item_courses alias
  join private.trail_items item on item.id = alias.trail_item_id
  where alias.course_id = new.course_id
  for update;
  if v_workspace_item.id is distinct from v_locked_workspace_item_id
     or v_course_item.id is distinct from v_locked_course_item_id then
    raise exception 'A identidade de Trilhas mudou durante a publicação.'
      using errcode = '40001';
  end if;
  if v_workspace_item.id is null then
    insert into private.trail_items(workspace_id, workspace_course_id)
    values(new.workspace_id, new.workspace_course_id)
    returning * into v_workspace_item;
  end if;
  if v_course_item.id is null then
    insert into private.trail_item_courses(course_id, trail_item_id)
    values(new.course_id, v_workspace_item.id)
    on conflict(course_id) do update
      set trail_item_id = excluded.trail_item_id;
    update private.trail_items
    set course_id = case when new.target = 'catalog' or course_id is null
          then new.course_id else course_id end,
        updated_at = now()
    where id = v_workspace_item.id;
    return new;
  end if;
  if v_workspace_item.id = v_course_item.id then
    update private.trail_items
    set course_id = case when new.target = 'catalog' or course_id is null
          then new.course_id else course_id end,
        updated_at = now()
    where id = v_workspace_item.id;
    return new;
  end if;
  select workspace.source_course_id into v_source_course_id
  from private.authoring_workspaces workspace where workspace.id = new.workspace_id;
  if v_source_course_id = new.course_id then
    v_keep_id := v_course_item.id;
    v_drop_id := v_workspace_item.id;
  else
    v_keep_id := v_workspace_item.id;
    v_drop_id := v_course_item.id;
  end if;
  perform 1
  from public.study_path_items placement
  where placement.trail_item_id in (v_keep_id, v_drop_id)
  order by placement.owner_id, placement.path_id, placement.id
  for update;
  select coalesce(jsonb_agg(jsonb_build_object(
    'ownerId', affected.owner_id, 'pathId', affected.path_id
  )), '[]'::jsonb) into v_affected_paths
  from (
    select distinct placement.owner_id, placement.path_id
    from public.study_path_items placement
    where placement.trail_item_id in (v_keep_id, v_drop_id)
  ) affected;
  delete from public.study_path_items losing
  where losing.trail_item_id = v_drop_id
    and exists(
      select 1 from public.study_path_items kept
      where kept.owner_id = losing.owner_id and kept.trail_item_id = v_keep_id
    );
  update public.study_path_items set trail_item_id = v_keep_id
  where trail_item_id = v_drop_id;
  update private.trail_item_courses
  set trail_item_id = v_keep_id
  where trail_item_id = v_drop_id;
  for v_affected_path in
    select value from jsonb_array_elements(v_affected_paths)
  loop
    perform private.normalize_trail_group_items_v1(
      (v_affected_path->>'ownerId')::uuid,
      (v_affected_path->>'pathId')::uuid
    );
  end loop;
  delete from private.trail_items where id = v_drop_id;
  update private.trail_items
  set workspace_id = new.workspace_id,
      workspace_course_id = new.workspace_course_id,
      course_id = case when new.target = 'catalog' or course_id is null
        then new.course_id else course_id end,
      updated_at = now()
  where id = v_keep_id;
  return new;
end;
$function$;

create trigger authoring_workspace_publication_link_trail_item_v1
after insert or update of workspace_id, workspace_course_id, course_id
on private.authoring_workspace_publications
for each row execute function private.link_workspace_publication_trail_item_v1();

create function private.cleanup_workspace_course_trail_item_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if old.entity_type <> 'course' then return old; end if;
  delete from private.trail_items item
  where item.workspace_id = old.workspace_id
    and item.workspace_course_id = old.entity_id
    and not exists(
      select 1 from private.trail_item_courses alias
      where alias.trail_item_id = item.id
    );
  update private.trail_items item
  set workspace_id = null, workspace_course_id = null, updated_at = now()
  where item.workspace_id = old.workspace_id
    and item.workspace_course_id = old.entity_id
    and exists(
      select 1 from private.trail_item_courses alias
      where alias.trail_item_id = item.id
    );
  return old;
end;
$function$;

create trigger authoring_workspace_course_cleanup_trail_item_v1
after delete on private.authoring_workspace_entities
for each row execute function private.cleanup_workspace_course_trail_item_v1();

-- A implementação passa a ler o estado corrente na migração seguinte. O stub
-- mantém a projeção instalável sem acoplar a identidade ao estado pessoal.
create function private.trail_completed_card_count_v1(
  p_actor_id uuid,
  p_trail_item_id uuid
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select 0
$function$;

drop function if exists public.list_trail_items_v1(integer, integer, text);

create function private.list_trail_items_for_actor_v1(
  p_actor_id uuid,
  p_limit integer default 50,
  p_after_path_position integer default null,
  p_after_item_position integer default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := p_actor_id;
  v_groups jsonb;
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or ((p_after_path_position is null) <> (p_after_item_position is null))
     or ((p_after_path_position is null) <> (p_after_id is null))
     or coalesce(p_after_path_position, 0) < 0
     or coalesce(p_after_item_position, 0) < 0 then
    raise exception 'Consulta de Trilhas inválida.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', path.id, 'title', path.title, 'position', path.position
  ) order by path.position, path.id), '[]'::jsonb)
  into v_groups
  from public.study_paths path where path.owner_id = v_user_id;

  with accessible_workspaces as materialized (
    select workspace.*
    from private.authoring_workspaces workspace
    where workspace.deleted_at is null
      and private.educational_workspace_can_v1(workspace.id, v_user_id, 'read')
  ), workspace_items as materialized (
    select
      item.id as trail_item_id,
      workspace.id as workspace_id,
      course.entity_id as course_key,
      coalesce(publication.course_id, item.course_id) as course_id,
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
      counts.module_count, counts.lesson_count,
      counts.microsequence_count, counts.card_count,
      publication.content_hash,
      workspace.revision,
      private.educational_workspace_can_v1(workspace.id, v_user_id, 'author') as can_edit,
      case when publication.target = 'catalog'
        then private.can_publish_catalog_v5(v_user_id)
        else private.educational_workspace_can_v1(workspace.id, v_user_id, 'manage')
      end as can_delete,
      selection.id is not null as can_remove,
      greatest(workspace.updated_at, course.updated_at) as updated_at,
      0::integer as natural_position
    from accessible_workspaces workspace
    join private.authoring_workspace_entities course
      on course.workspace_id = workspace.id and course.entity_type = 'course'
    join private.trail_items item
      on item.workspace_id = workspace.id
     and item.workspace_course_id = course.entity_id
    left join lateral (
      with recursive descendants as (
        select entity.entity_type, entity.entity_id
        from private.authoring_workspace_entities entity
        where entity.workspace_id = workspace.id
          and entity.parent_type = 'course'
          and entity.parent_id = course.entity_id
        union all
        select child.entity_type, child.entity_id
        from descendants parent
        join private.authoring_workspace_entities child
          on child.workspace_id = workspace.id
         and child.parent_type = parent.entity_type
         and child.parent_id = parent.entity_id
      )
      select count(*) filter(where entity_type = 'module')::integer as module_count,
        count(*) filter(where entity_type = 'lesson')::integer as lesson_count,
        count(*) filter(where entity_type = 'microsequence')::integer as microsequence_count,
        count(*) filter(where entity_type = 'card')::integer as card_count
      from descendants
    ) counts on true
    left join lateral (
      select link.target, link.course_id, link.content_hash
      from private.authoring_workspace_publications link
      where link.workspace_id = workspace.id
        and link.workspace_course_id = course.entity_id
      order by (link.target = 'catalog') desc, link.updated_at desc
      limit 1
    ) publication on true
    left join lateral (
      select candidate.*
      from private.trail_item_courses alias
      join public.user_course_selections candidate
        on candidate.course_id = alias.course_id
       and candidate.user_id = v_user_id
      where alias.trail_item_id = item.id
      order by (candidate.course_id = publication.course_id) desc,
        candidate.updated_at desc, candidate.id
      limit 1
    ) selection on true
  ), selected_items as materialized (
    select distinct on (item.id) item.id as trail_item_id,
      null::uuid as workspace_id, null::text as course_key,
      course.id as course_id, selection.id as selection_id,
      'course'::text as item_kind, 'selection'::text as source_kind,
      case when course.owner_id is null then 'catalog' else 'private' end as course_origin,
      course.title, coalesce(course.goal, '') as description,
      course.module_count::integer, course.lesson_count::integer,
      course.microsequence_count::integer, course.card_count::integer,
      course.current_revision_hash as content_hash,
      null::bigint as revision,
      case when course.owner_id is null then private.can_publish_catalog_v5(v_user_id)
        else course.owner_id = v_user_id end as can_edit,
      case when course.owner_id is null then private.can_publish_catalog_v5(v_user_id)
        else course.owner_id = v_user_id end as can_delete,
      true as can_remove,
      greatest(selection.updated_at, course.updated_at) as updated_at,
      0::integer as natural_position
    from public.user_course_selections selection
    join public.courses course on course.id = selection.course_id
    join private.trail_item_courses alias on alias.course_id = course.id
    join private.trail_items item on item.id = alias.trail_item_id
    where selection.user_id = v_user_id
      and course.status = 'published' and course.deleted_at is null
      and course.document_storage_enabled
      and not exists(
        select 1 from workspace_items workspace_item
        where workspace_item.trail_item_id = item.id
      )
    order by item.id, (course.id = item.course_id) desc,
      selection.updated_at desc, selection.id
  ), all_items as materialized (
    select * from workspace_items union all select * from selected_items
  ), located as materialized (
    select content.*, placement.path_id,
      path.title as path_title, path.position as visible_path_position,
      placement.position as visible_item_position,
      -- A organização é metadado visível, não identidade de paginação. Um
      -- rename/move/update entre páginas não pode deslocar itens pelo cursor.
      0::integer as sort_path_position,
      0::integer as sort_item_position
    from all_items content
    left join public.study_path_items placement
      on placement.owner_id = v_user_id
     and placement.trail_item_id = content.trail_item_id
    left join public.study_paths path
      on path.id = placement.path_id and path.owner_id = v_user_id
  ), candidates as materialized (
    select * from located
    where p_after_path_position is null
      or (sort_path_position, sort_item_position, trail_item_id)
         > (p_after_path_position, p_after_item_position, p_after_id)
    order by sort_path_position, sort_item_position, trail_item_id
    limit p_limit + 1
  ), page as materialized (
    select * from candidates
    order by sort_path_position, sort_item_position, trail_item_id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'trailItemId', page.trail_item_id,
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
      'completedCardCount', private.trail_completed_card_count_v1(
        v_user_id, page.trail_item_id
      ),
      'contentHash', page.content_hash,
      'revision', page.revision,
      'canEdit', page.can_edit,
      'canDelete', page.can_delete,
      'canRemove', page.can_remove,
      'pathId', page.path_id,
      'pathTitle', page.path_title,
      'pathPosition', page.visible_path_position,
      'itemPosition', page.visible_item_position,
      'updatedAt', page.updated_at
    ) order by page.sort_path_position, page.sort_item_position, page.trail_item_id),
    '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'afterPathPosition', page.sort_path_position,
        'afterItemPosition', page.sort_item_position,
        'afterId', page.trail_item_id
      ) from page
      order by page.sort_path_position desc, page.sort_item_position desc,
        page.trail_item_id desc limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;
  return jsonb_build_object(
    'space', 'trails', 'groups', v_groups, 'items', v_items,
    'hasMore', v_has_more, 'nextCursor', v_next_cursor,
    'capabilities', jsonb_build_object(
      'catalogManage', private.can_publish_catalog_v5(v_user_id),
      'catalogReview', private.can_review_catalog_v5(v_user_id)
    )
  );
end;
$function$;

create function public.list_trail_items_v1(
  p_limit integer default 50,
  p_after_path_position integer default null,
  p_after_item_position integer default null,
  p_after_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
  select private.list_trail_items_for_actor_v1(
    auth.uid(), p_limit, p_after_path_position, p_after_item_position, p_after_id
  )
$function$;

-- O endpoint de autoria usa service_role e, portanto, não possui auth.uid().
-- A superfície pública do PostgREST apenas encaminha o ator explicitamente;
-- usuários autenticados comuns não recebem EXECUTE nesta função.
create function public.list_trail_items_for_actor_v1(
  p_actor_id uuid,
  p_limit integer default 50,
  p_after_path_position integer default null,
  p_after_item_position integer default null,
  p_after_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.list_trail_items_for_actor_v1(
    p_actor_id, p_limit, p_after_path_position, p_after_item_position, p_after_id
  )
$function$;

create function public.get_trail_workspace_course_v1(
  p_trail_item_id uuid,
  p_limit integer default 100,
  p_after_cursor text default null,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item private.trail_items%rowtype;
  v_revision bigint;
  v_parts jsonb;
  v_has_more boolean;
  v_next_cursor text;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_trail_item_id is null or p_limit is null or p_limit not between 1 and 100
     or char_length(coalesce(p_after_cursor, '')) > 4096 then
    raise exception 'Consulta da composição inválida.' using errcode = '22023';
  end if;
  select * into v_item from private.trail_items item
  where item.id = p_trail_item_id;
  if not found or v_item.workspace_id is null
     or not private.educational_workspace_can_v1(
       v_item.workspace_id, v_user_id, 'read'
     ) then
    raise exception 'Composição inexistente ou inacessível.' using errcode = '42501';
  end if;
  select workspace.revision into v_revision
  from private.authoring_workspaces workspace
  where workspace.id = v_item.workspace_id and workspace.deleted_at is null;
  if v_revision is null then
    raise exception 'Composição inexistente ou inacessível.' using errcode = 'P0002';
  end if;
  if p_expected_revision is not null and p_expected_revision <> v_revision then
    raise exception 'A composição mudou durante a leitura.' using errcode = '40001';
  end if;
  with recursive tree as (
    select entity.*, 0 as depth,
      lpad(entity.position::text, 10, '0') || ':course:' || entity.entity_id as sort_key
    from private.authoring_workspace_entities entity
    where entity.workspace_id = v_item.workspace_id
      and entity.entity_type = 'course'
      and entity.entity_id = v_item.workspace_course_id
    union all
    select child.*, tree.depth + 1,
      tree.sort_key || chr(31) || lpad(child.position::text, 10, '0')
        || ':' || child.entity_type || ':' || child.entity_id
    from tree
    join private.authoring_workspace_entities child
      on child.workspace_id = tree.workspace_id
     and child.parent_type = tree.entity_type
     and child.parent_id = tree.entity_id
    where tree.depth < 6
  ), candidates as materialized (
    select * from tree
    where p_after_cursor is null or sort_key > p_after_cursor
    order by sort_key limit p_limit + 1
  ), page as materialized (
    select * from candidates order by sort_key limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'entityType', page.entity_type,
      'id', page.entity_id,
      'parentType', page.parent_type,
      'parentId', page.parent_id,
      'position', page.position,
      'content', page.content,
      'updatedAt', page.updated_at
    ) order by page.sort_key), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select page.sort_key from page order by page.sort_key desc limit 1
    ) end
  into v_parts, v_has_more, v_next_cursor
  from page;
  return jsonb_build_object(
    'trailItemId', v_item.id,
    'workspaceId', v_item.workspace_id,
    'courseKey', v_item.workspace_course_id,
    'revision', v_revision,
    'parts', v_parts,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

-- Grupos deixam o feed de sync genérico. A projeção e a RPC acima são a única
-- autoridade remota, o que evita conflito entre normalização local e servidor.
drop function if exists public.apply_sync_batch(uuid, jsonb);
drop function if exists private.apply_study_path_batch_v1(uuid, uuid, jsonb);
delete from private.sync_changes
where entity_type in ('studyPaths', 'studyPathCourses');

revoke all on function private.normalize_trail_groups_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.normalize_trail_group_items_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.move_trail_group_v1(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.move_trail_item_v1(uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.trail_item_accessible_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.ensure_course_trail_item_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_unique_trail_course_publication_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.ensure_workspace_course_trail_item_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.detach_deleted_course_from_trail_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.link_workspace_publication_trail_item_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_workspace_course_trail_item_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.trail_completed_card_count_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.list_trail_items_for_actor_v1(
  uuid, integer, integer, integer, uuid
) from public, anon, authenticated;
grant execute on function private.list_trail_items_for_actor_v1(
  uuid, integer, integer, integer, uuid
) to service_role;

revoke all on function public.mutate_trails_v1(uuid, text, jsonb)
  from public, anon;
grant execute on function public.mutate_trails_v1(uuid, text, jsonb)
  to authenticated;
revoke all on function public.list_trail_items_v1(integer, integer, integer, uuid)
  from public, anon;
grant execute on function public.list_trail_items_v1(integer, integer, integer, uuid)
  to authenticated;
revoke all on function public.list_trail_items_for_actor_v1(
  uuid, integer, integer, integer, uuid
) from public, anon, authenticated;
grant execute on function public.list_trail_items_for_actor_v1(
  uuid, integer, integer, integer, uuid
) to service_role;
revoke all on function public.get_trail_workspace_course_v1(uuid, integer, text, bigint)
  from public, anon;
grant execute on function public.get_trail_workspace_course_v1(uuid, integer, text, bigint)
  to authenticated;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260807210000',
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
      'atomic-catalog-course-removal-v1','single-active-course-composition-v1',
      'stable-trail-item-identity-v1','workspace-course-paged-composition-v1',
      'atomic-trail-groups-v1'
    )
  )
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
