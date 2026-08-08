-- O estado pessoal passa a acompanhar a identidade lógica de Trilhas. Uma
-- única linha corrente substitui dependências de selection_id e permite estudar
-- a composição do workspace antes de qualquer publicação.

begin;

create table public.trail_personal_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  trail_item_id uuid not null references private.trail_items(id) on update cascade on delete cascade,
  revision bigint not null default 1,
  completed_card_count integer not null default 0,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, trail_item_id),
  constraint trail_personal_states_revision_v1 check(revision > 0),
  constraint trail_personal_states_completed_cards_v1 check(completed_card_count >= 0),
  -- O cliente mantém o orçamento operacional de 256 KiB. O limite físico tem
  -- folga para a representação binária do jsonb nunca rejeitar o mesmo estado.
  constraint trail_personal_states_size_v1 check(pg_column_size(state) <= 524288)
);

create index trail_personal_states_user_updated_v1_idx
  on public.trail_personal_states(user_id, updated_at desc, trail_item_id);

alter table public.trail_personal_states enable row level security;
alter table public.trail_personal_states force row level security;
create policy trail_personal_states_owner_v1 on public.trail_personal_states
  for all to authenticated
  using(user_id = auth.uid())
  with check(user_id = auth.uid());
revoke all on table public.trail_personal_states from public, anon, authenticated;

create or replace function private.trail_completed_card_count_v1(
  p_actor_id uuid,
  p_trail_item_id uuid
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select coalesce(max(state_row.completed_card_count), 0)::integer
  from public.trail_personal_states state_row
  where state_row.user_id = p_actor_id
    and state_row.trail_item_id = p_trail_item_id
$function$;

revoke all on function private.trail_completed_card_count_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create table private.trail_personal_state_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  trail_item_id uuid not null references private.trail_items(id)
    on update cascade on delete cascade,
  request_hash text not null,
  result_revision bigint not null,
  result_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key(user_id, mutation_id),
  constraint trail_personal_state_receipts_hash_v1 check(
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint trail_personal_state_receipts_revision_v1 check(
    result_revision > 0
  ),
  constraint trail_personal_state_receipts_expiry_v1 check(
    expires_at > created_at and expires_at <= created_at + interval '7 days'
  )
);
create index trail_personal_state_receipts_expiry_v1_idx
  on private.trail_personal_state_receipts(expires_at);
revoke all on table private.trail_personal_state_receipts
  from public, anon, authenticated, service_role;

-- Limpa somente o estado que perdeu a última autoridade. Seleções aliases e
-- membership fora do workspace que está sendo retirado preservam a identidade.
create function private.cleanup_trail_personal_access_v1(
  p_user_id uuid,
  p_trail_item_id uuid,
  p_ignored_workspace_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_workspace_id uuid;
  v_path_ids uuid[];
  v_path_id uuid;
begin
  if p_user_id is null or p_trail_item_id is null then return; end if;
  -- Serializa revogação/cleanup com escrita de progresso e com fusão de aliases.
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-item:' || p_trail_item_id::text, 0
  ));
  select item.workspace_id into v_workspace_id
  from private.trail_items item where item.id = p_trail_item_id;
  if not found then return; end if;
  if exists(
    select 1
    from public.user_course_selections selection
    join private.trail_item_courses alias on alias.course_id = selection.course_id
    join public.courses course on course.id = selection.course_id
    where selection.user_id = p_user_id
      and alias.trail_item_id = p_trail_item_id
      and course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
  ) or (
    v_workspace_id is not null
    and v_workspace_id is distinct from p_ignored_workspace_id
    and private.educational_workspace_can_v1(
      v_workspace_id, p_user_id, 'read'
    )
  ) then return; end if;

  select coalesce(array_agg(distinct placement.path_id), '{}'::uuid[])
  into v_path_ids
  from public.study_path_items placement
  where placement.owner_id = p_user_id
    and placement.trail_item_id = p_trail_item_id;
  delete from public.study_path_items placement
  where placement.owner_id = p_user_id
    and placement.trail_item_id = p_trail_item_id;
  foreach v_path_id in array v_path_ids loop
    perform private.normalize_trail_group_items_v1(p_user_id, v_path_id);
  end loop;
  delete from private.trail_personal_state_receipts receipt
  where receipt.user_id = p_user_id
    and receipt.trail_item_id = p_trail_item_id;
  delete from public.trail_personal_states state_row
  where state_row.user_id = p_user_id
    and state_row.trail_item_id = p_trail_item_id;
end;
$function$;

create function private.cleanup_unselected_trail_state_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_trail_item_id uuid;
begin
  select alias.trail_item_id into v_trail_item_id
  from private.trail_item_courses alias where alias.course_id = old.course_id;
  if v_trail_item_id is not null then
    perform private.cleanup_trail_personal_access_v1(
      old.user_id, v_trail_item_id, null
    );
  end if;
  return old;
end;
$function$;

create trigger course_selections_cleanup_trail_state_v1
after delete on public.user_course_selections
for each row execute function private.cleanup_unselected_trail_state_v1();

create function private.cleanup_removed_workspace_member_trails_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_trail_item_id uuid;
begin
  for v_trail_item_id in
    select item.id from private.trail_items item
    where item.workspace_id = old.workspace_id
    order by item.id
  loop
    perform private.cleanup_trail_personal_access_v1(
      old.user_id, v_trail_item_id, old.workspace_id
    );
  end loop;
  return old;
end;
$function$;

create trigger educational_workspace_member_cleanup_trails_v1
after delete on private.educational_workspace_members
for each row execute function private.cleanup_removed_workspace_member_trails_v1();

-- O binding de autoria é a âncora estável para uma republicação futura; não é
-- ele que concede acesso em Trilhas. A transição inativa retira seleção/alias,
-- mas conserva esse CAS leve para religar a mesma raiz sem criar identidade.
create or replace function private.cleanup_archived_course_publication_v5()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  return new;
end;
$function$;

create function private.cleanup_inactive_course_selections_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_trail_item_id uuid;
  v_next_course_id uuid;
  v_workspace_id uuid;
begin
  if old.status = 'published' and old.deleted_at is null
     and old.document_storage_enabled
     and not (
       new.status = 'published' and new.deleted_at is null
       and new.document_storage_enabled
     ) then
    delete from public.user_course_selections selection
    where selection.course_id = new.id;
    select alias.trail_item_id, item.workspace_id
    into v_trail_item_id, v_workspace_id
    from private.trail_item_courses alias
    join private.trail_items item on item.id = alias.trail_item_id
    where alias.course_id = new.id;
    if v_trail_item_id is not null then
      delete from private.trail_item_courses alias
      where alias.course_id = new.id;
      select alias.course_id into v_next_course_id
      from private.trail_item_courses alias
      join public.courses course on course.id = alias.course_id
      where alias.trail_item_id = v_trail_item_id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
      order by (course.owner_id is null) desc, course.updated_at desc,
        alias.course_id
      limit 1;
      if v_next_course_id is not null then
        update private.trail_items item
        set course_id = v_next_course_id, updated_at = now()
        where item.id = v_trail_item_id;
      elsif v_workspace_id is not null then
        update private.trail_items item
        set course_id = null, updated_at = now()
        where item.id = v_trail_item_id;
      else
        delete from private.trail_items item
        where item.id = v_trail_item_id;
      end if;
    end if;
  elsif not (
      old.status = 'published' and old.deleted_at is null
      and old.document_storage_enabled
    ) and new.status = 'published' and new.deleted_at is null
      and new.document_storage_enabled then
    select item.id, item.workspace_id
    into v_trail_item_id, v_workspace_id
    from private.authoring_workspace_publications publication
    join private.trail_items item
      on item.workspace_id = publication.workspace_id
     and item.workspace_course_id = publication.workspace_course_id
    where publication.course_id = new.id
    order by (publication.target = 'catalog') desc
    limit 1;
    if v_trail_item_id is null then
      insert into private.trail_items(id, course_id, updated_at)
      values(new.id, new.id, now())
      on conflict(course_id) do update set updated_at = now()
      returning id, workspace_id into v_trail_item_id, v_workspace_id;
    end if;
    insert into private.trail_item_courses(course_id, trail_item_id)
    values(new.id, v_trail_item_id)
    on conflict(course_id) do update
      set trail_item_id = excluded.trail_item_id;
    update private.trail_items item
    set course_id = new.id, updated_at = now()
    where item.id = v_trail_item_id;
  end if;
  return new;
end;
$function$;

create trigger courses_cleanup_inactive_trail_access_v1
after update of status, deleted_at, document_storage_enabled
on public.courses
for each row execute function private.cleanup_inactive_course_selections_v1();

create or replace function private.cleanup_workspace_course_trail_item_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_trail_item_id uuid;
  v_user_id uuid;
begin
  if old.entity_type <> 'course' then return old; end if;
  select item.id into v_trail_item_id
  from private.trail_items item
  where item.workspace_id = old.workspace_id
    and item.workspace_course_id = old.entity_id;
  if v_trail_item_id is null then return old; end if;
  for v_user_id in
    select member.user_id
    from private.educational_workspace_members member
    where member.workspace_id = old.workspace_id
    union
    select workspace.owner_id
    from private.authoring_workspaces workspace
    where workspace.id = old.workspace_id
  loop
    perform private.cleanup_trail_personal_access_v1(
      v_user_id, v_trail_item_id, old.workspace_id
    );
  end loop;
  if exists(
    select 1 from private.trail_item_courses alias
    where alias.trail_item_id = v_trail_item_id
  ) then
    update private.trail_items item
    set workspace_id = null, workspace_course_id = null, updated_at = now()
    where item.id = v_trail_item_id;
  else
    delete from private.trail_items item where item.id = v_trail_item_id;
  end if;
  return old;
end;
$function$;

revoke all on function private.cleanup_unselected_trail_state_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_removed_workspace_member_trails_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_inactive_course_selections_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_archived_course_publication_v5()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_workspace_course_trail_item_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_trail_personal_access_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.valid_trail_personal_state_v1(p_state jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_progress jsonb;
  v_lessons jsonb;
  v_reviews jsonb;
  v_observations jsonb;
begin
  if jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 524288
     or p_state->>'version' <> '1'
     or exists(
       select 1 from jsonb_object_keys(p_state) field
       where field not in ('version', 'progress', 'reviewMarks', 'observations')
     ) then return false; end if;
  v_progress := p_state->'progress';
  v_lessons := v_progress->'lessons';
  v_reviews := p_state->'reviewMarks';
  v_observations := p_state->'observations';
  if jsonb_typeof(v_progress) <> 'object' or v_progress->>'version' <> '3'
     or exists(
       select 1 from jsonb_object_keys(v_progress) field
       where field not in ('version', 'lessons')
     )
     or jsonb_typeof(v_lessons) <> 'object'
     or jsonb_typeof(v_reviews) <> 'object'
     or jsonb_typeof(v_observations) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(v_lessons)) > 10000
     or coalesce((
       select sum(jsonb_array_length(value->'completedCardIds'))
       from jsonb_each(v_lessons)
       where jsonb_typeof(value->'completedCardIds') = 'array'
     ), 0) > 100000
     or (select count(*) from jsonb_object_keys(v_reviews)) > 100000
     or (select count(*) from jsonb_object_keys(v_observations)) > 10000 then
    return false;
  end if;
  if exists(
    select 1 from jsonb_each(v_lessons) entry(key, value)
    where nullif(btrim(key), '') is null or char_length(key) > 240
      or key ~ '[[:cntrl:]]'
      or jsonb_typeof(value) <> 'object'
      or exists(
        select 1 from jsonb_object_keys(value) field
        where field not in ('cursorCardId', 'completedCardIds')
      )
      or not (value ? 'completedCardIds')
      or jsonb_typeof(value->'completedCardIds') <> 'array'
      or jsonb_array_length(value->'completedCardIds') > 10000
      or (value ? 'cursorCardId' and (
        jsonb_typeof(value->'cursorCardId') <> 'string'
        or nullif(btrim(value->>'cursorCardId'), '') is null
        or char_length(value->>'cursorCardId') > 240
        or value->>'cursorCardId' ~ '[[:cntrl:]]'
        or not (value->'completedCardIds' ? (value->>'cursorCardId'))
      ))
      or exists(
        select 1 from jsonb_array_elements(value->'completedCardIds') card_id
        where jsonb_typeof(card_id) <> 'string'
          or nullif(btrim(card_id #>> '{}'), '') is null
          or char_length(card_id #>> '{}') > 240
          or card_id #>> '{}' ~ '[[:cntrl:]]'
      )
      or (
        select count(*) <> count(distinct card_id #>> '{}')
        from jsonb_array_elements(value->'completedCardIds') card_id
      )
  ) then return false; end if;
  if exists(
    select 1
    from jsonb_each(v_lessons) lesson(path, value)
    cross join lateral jsonb_array_elements_text(
      lesson.value->'completedCardIds'
    ) card(card_id)
    group by card.card_id
    having count(*) > 1
  ) then return false; end if;
  if exists(
    select 1 from jsonb_each(v_reviews) entry(key, value)
    where nullif(btrim(key), '') is null or char_length(key) > 240
      or key ~ '[[:cntrl:]]'
      or jsonb_typeof(value) <> 'string'
      or value #>> '{}' !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$'
  ) then return false; end if;
  if exists(
    select 1 from jsonb_each(v_observations) entry(key, value)
    where nullif(btrim(key), '') is null or char_length(key) > 240
      or key ~ '[[:cntrl:]]'
      or jsonb_typeof(value) <> 'object'
      or exists(
        select 1 from jsonb_object_keys(value) field
        where field not in ('category', 'body', 'updatedAt')
      )
      or not (value ?& array['category', 'body', 'updatedAt'])
      or jsonb_typeof(value->'category') <> 'string'
      or jsonb_typeof(value->'body') <> 'string'
      or jsonb_typeof(value->'updatedAt') <> 'string'
      or value->>'category' not in (
        'question', 'possible_error', 'confusing', 'suggestion', 'observation'
      )
      or nullif(btrim(value->>'body'), '') is null
      or char_length(value->>'body') > 1000
      or value->>'updatedAt' !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$'
  ) then return false; end if;
  return true;
end;
$function$;

-- As primeiras RPCs aceitavam as chaves do contrato v4 no payload, mas algumas
-- instalações ainda não tinham colunas para conservá-las. As colunas abaixo
-- tornam o corte repetível para os dois formatos e desaparecem com as tabelas
-- antigas na migração final.
alter table public.lesson_progress
  add column if not exists course_key text,
  add column if not exists module_key text,
  add column if not exists lesson_key text,
  add column if not exists path_key text;
alter table public.card_progress
  add column if not exists course_key text,
  add column if not exists module_key text,
  add column if not exists lesson_key text,
  add column if not exists microsequence_key text,
  add column if not exists card_key text,
  add column if not exists path_key text;

-- Somente IDs recuperáveis deterministicamente da composição v4 são migrados.
-- UUIDs da projeção são apenas o último recurso para linhas antigas cuja árvore
-- relacional ainda coincide.
create temporary table trail_state_backfill_paths (
  trail_item_id uuid not null,
  course_id uuid,
  entity_type text not null,
  entity_id text not null,
  path_key text not null,
  primary key(trail_item_id, entity_type, entity_id)
) on commit drop;

insert into trail_state_backfill_paths(
  trail_item_id, course_id, entity_type, entity_id, path_key
)
with recursive tree as (
  select item.id as trail_item_id, item.course_id,
    entity.workspace_id, entity.entity_type, entity.entity_id,
    entity.entity_id as path_key
  from private.trail_items item
  join private.authoring_workspace_entities entity
    on entity.workspace_id = item.workspace_id
   and entity.entity_type = 'course'
   and entity.entity_id = item.workspace_course_id
  union all
  select tree.trail_item_id, tree.course_id,
    child.workspace_id, child.entity_type, child.entity_id,
    child.entity_id as path_key
  from tree
  join private.authoring_workspace_entities child
    on child.workspace_id = tree.workspace_id
   and child.parent_type = tree.entity_type
   and child.parent_id = tree.entity_id
)
select trail_item_id, course_id, entity_type, entity_id, path_key from tree;

create temporary table trail_state_backfill_lessons (
  progress_id uuid primary key,
  user_id uuid not null,
  trail_item_id uuid not null,
  path_key text not null,
  cursor_card_id text
) on commit drop;

insert into trail_state_backfill_lessons(
  progress_id, user_id, trail_item_id, path_key, cursor_card_id
)
select progress.id, progress.user_id, item.id,
  coalesce(
    nullif(progress.lesson_key, ''),
    case when cardinality(string_to_array(progress.path_key, '::')) = 3 then
      (string_to_array(progress.path_key, '::'))[3]
    end,
    entity_path.entity_id
  ), cursor_card.entity_id
from public.lesson_progress progress
join private.trail_item_courses alias on alias.course_id = progress.course_id
join private.trail_items item on item.id = alias.trail_item_id
left join trail_state_backfill_paths entity_path
  on entity_path.trail_item_id = item.id
 and entity_path.entity_type = 'lesson'
 and entity_path.entity_id = progress.lesson_id::text
left join lateral (
  select card.entity_id
  from private.authoring_workspace_entities lesson
  join private.authoring_workspace_entities microsequence
    on microsequence.workspace_id = lesson.workspace_id
   and microsequence.parent_type = 'lesson'
   and microsequence.parent_id = lesson.entity_id
   and microsequence.entity_type = 'microsequence'
  join private.authoring_workspace_entities card
    on card.workspace_id = microsequence.workspace_id
   and card.parent_type = 'microsequence'
   and card.parent_id = microsequence.entity_id
   and card.entity_type = 'card'
  where lesson.workspace_id = item.workspace_id
    and lesson.entity_type = 'lesson'
    and lesson.entity_id = coalesce(
      nullif(progress.lesson_key, ''),
      case when cardinality(string_to_array(progress.path_key, '::')) = 3
        then (string_to_array(progress.path_key, '::'))[3] end,
      entity_path.entity_id
    )
    and progress.cursor is not null and progress.cursor >= 0
  order by microsequence.position, microsequence.entity_id,
    card.position, card.entity_id
  offset greatest(progress.cursor, 0) limit 1
) cursor_card on true
where coalesce(
  nullif(progress.course_key, '') is not null
    and nullif(progress.module_key, '') is not null
    and nullif(progress.lesson_key, '') is not null,
  false
) or cardinality(string_to_array(progress.path_key, '::')) = 3
  or entity_path.path_key is not null;

create temporary table trail_state_backfill_cards (
  progress_id uuid primary key,
  user_id uuid not null,
  trail_item_id uuid not null,
  path_key text not null,
  lesson_path_key text not null,
  card_key text not null
) on commit drop;

insert into trail_state_backfill_cards(
  progress_id, user_id, trail_item_id, path_key, lesson_path_key, card_key
)
select progress.id, progress.user_id, item.id,
  coalesce(
    nullif(progress.card_key, ''),
    case when cardinality(string_to_array(progress.path_key, '::')) = 5 then
      (string_to_array(progress.path_key, '::'))[5]
    end,
    entity_path.entity_id
  ),
  coalesce(
    (
      select lesson.entity_id
      from private.authoring_workspace_entities card
      join private.authoring_workspace_entities microsequence
        on microsequence.workspace_id = card.workspace_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = card.parent_id
      join private.authoring_workspace_entities lesson
        on lesson.workspace_id = microsequence.workspace_id
       and lesson.entity_type = 'lesson'
       and lesson.entity_id = microsequence.parent_id
      where card.workspace_id = item.workspace_id
        and card.entity_type = 'card'
        and card.entity_id = coalesce(
          nullif(progress.card_key, ''),
          case when cardinality(string_to_array(progress.path_key, '::')) = 5
            then (string_to_array(progress.path_key, '::'))[5] end,
          entity_path.entity_id
        )
      limit 1
    ),
    nullif(progress.lesson_key, ''),
    case when cardinality(string_to_array(progress.path_key, '::')) in (3, 5) then
      (string_to_array(progress.path_key, '::'))[3]
    end
  ),
  coalesce(
    nullif(progress.card_key, ''),
    case when cardinality(string_to_array(progress.path_key, '::')) = 5
      then (string_to_array(progress.path_key, '::'))[5] end,
    entity_path.entity_id
  )
from public.card_progress progress
join private.trail_item_courses alias on alias.course_id = progress.course_id
join private.trail_items item on item.id = alias.trail_item_id
left join trail_state_backfill_paths entity_path
  on entity_path.trail_item_id = item.id
 and entity_path.entity_type = 'card'
 and entity_path.entity_id = progress.card_id::text
where (
    nullif(progress.course_key, '') is not null
    and nullif(progress.module_key, '') is not null
    and nullif(progress.lesson_key, '') is not null
    and nullif(progress.microsequence_key, '') is not null
    and nullif(progress.card_key, '') is not null
  ) or cardinality(string_to_array(progress.path_key, '::')) = 5
  or (
    cardinality(string_to_array(progress.path_key, '::')) = 3
    and nullif(progress.microsequence_key, '') is not null
    and nullif(progress.card_key, '') is not null
  ) or entity_path.path_key is not null;

insert into public.trail_personal_states(user_id, trail_item_id, state)
select source.user_id, source.trail_item_id, jsonb_build_object(
  'version', 1,
  'progress', jsonb_build_object(
    'version', 3, 'lessons', '{}'::jsonb
  ),
  'reviewMarks', '{}'::jsonb,
  'observations', '{}'::jsonb
)
from (
  -- Uma seleção sem progresso também precisa ganhar identidade pessoal para
  -- não depender de nova abertura do curso depois do corte.
  select selection.user_id, item.id as trail_item_id
  from public.user_course_selections selection
  join private.trail_item_courses alias on alias.course_id = selection.course_id
  join private.trail_items item on item.id = alias.trail_item_id
  union
  select progress.user_id, progress.trail_item_id
  from trail_state_backfill_lessons progress
  union
  select progress.user_id, progress.trail_item_id
  from trail_state_backfill_cards progress
  union
  select comment.user_id, item.id
  from public.card_comments comment
  join private.trail_item_courses alias on alias.course_id = comment.course_id
  join private.trail_items item on item.id = alias.trail_item_id
  where nullif(comment.course_key, '') is not null
    and nullif(comment.module_key, '') is not null
    and nullif(comment.lesson_key, '') is not null
    and nullif(comment.microsequence_key, '') is not null
    and nullif(comment.card_key, '') is not null
) source
on conflict(user_id, trail_item_id) do nothing;

do $block$
declare
  v_row record;
begin
  for v_row in
    select progress.*, path.trail_item_id,
      path.path_key as canonical_path_key, path.cursor_card_id
    from public.lesson_progress progress
    join trail_state_backfill_lessons path on path.progress_id = progress.id
    order by progress.user_id, path.trail_item_id, path.path_key,
      progress.updated_at, progress.id
  loop
    update public.trail_personal_states state_row
    set state = jsonb_set(
      state_row.state, array['progress', 'lessons', v_row.canonical_path_key],
      jsonb_strip_nulls(jsonb_build_object(
        'cursorCardId', v_row.cursor_card_id,
        'completedCardIds', '[]'::jsonb
      )), true
    )
    where state_row.user_id = v_row.user_id
      and state_row.trail_item_id = v_row.trail_item_id;
  end loop;
  for v_row in
    select progress.user_id, path.trail_item_id,
      path.path_key as canonical_path_key,
      path.lesson_path_key, path.card_key,
      max(progress.completed_at) as completed_at,
      max(progress.review_marked_at) as review_marked_at
    from public.card_progress progress
    join trail_state_backfill_cards path on path.progress_id = progress.id
    group by progress.user_id, path.trail_item_id, path.path_key,
      path.lesson_path_key, path.card_key
    order by progress.user_id, path.trail_item_id, path.card_key,
      path.lesson_path_key
  loop
    update public.trail_personal_states state_row
    set state = case when v_row.completed_at is null then
      case when v_row.review_marked_at is null then state_row.state else jsonb_set(
        state_row.state, array['reviewMarks', v_row.canonical_path_key],
        to_jsonb(v_row.review_marked_at), true
      ) end
    else jsonb_set(
      case when v_row.review_marked_at is null then state_row.state else jsonb_set(
        state_row.state, array['reviewMarks', v_row.canonical_path_key],
        to_jsonb(v_row.review_marked_at), true
      ) end,
      array['progress', 'lessons', v_row.lesson_path_key],
      jsonb_set(
        coalesce(
          state_row.state#>array['progress', 'lessons', v_row.lesson_path_key],
          jsonb_build_object('completedCardIds', '[]'::jsonb)
        ),
        '{completedCardIds}',
        (
          select jsonb_agg(to_jsonb(card_id) order by card_id)
          from (
            select distinct card_id
            from jsonb_array_elements_text(coalesce(
              state_row.state#>array[
                'progress', 'lessons', v_row.lesson_path_key, 'completedCardIds'
              ],
              '[]'::jsonb
            )) existing(card_id)
            union
            select v_row.card_key
          ) completed
        ), true
      ), true
    ) end
    where state_row.user_id = v_row.user_id
      and state_row.trail_item_id = v_row.trail_item_id;
  end loop;
  for v_row in
    select distinct on (comment.user_id, item.id, comment.card_key)
      comment.*, item.id as trail_item_id, comment.card_key as path_key
    from public.card_comments comment
    join private.trail_item_courses alias on alias.course_id = comment.course_id
    join private.trail_items item on item.id = alias.trail_item_id
    where nullif(comment.course_key, '') is not null
      and nullif(comment.module_key, '') is not null
      and nullif(comment.lesson_key, '') is not null
      and nullif(comment.microsequence_key, '') is not null
      and nullif(comment.card_key, '') is not null
    order by comment.user_id, item.id, comment.card_key,
      comment.updated_at desc, comment.id desc
  loop
    update public.trail_personal_states state_row
    set state = jsonb_set(
      state_row.state, array['observations', v_row.path_key],
      jsonb_build_object(
        'category', v_row.category,
        'body', v_row.body,
        'updatedAt', v_row.updated_at
      ), true
    )
    where state_row.user_id = v_row.user_id
      and state_row.trail_item_id = v_row.trail_item_id;
  end loop;
end;
$block$;

-- O sync anterior aplicava cada linha do lote em um sub-bloco independente.
-- Assim, uma lesson_progress podia ter chegado antes de seus card_progress (ou
-- estes terem sido rejeitados). O cursor legado só é preservado quando o card
-- correspondente também consta entre os concluídos; caso contrário ele não
-- representa progresso confirmado e violaria o contrato compacto v3.
update public.trail_personal_states state_row
set state = jsonb_set(
  state_row.state,
  '{progress,lessons}',
  (
    select coalesce(jsonb_object_agg(
      lesson.key,
      case
        when lesson.value ? 'cursorCardId'
          and not (
            lesson.value->'completedCardIds' ? (lesson.value->>'cursorCardId')
          )
          then lesson.value - 'cursorCardId'
        else lesson.value
      end
    ), '{}'::jsonb)
    from jsonb_each(
      coalesce(state_row.state#>'{progress,lessons}', '{}'::jsonb)
    ) lesson(key, value)
  ),
  true
)
where exists(
  select 1
  from jsonb_each(
    coalesce(state_row.state#>'{progress,lessons}', '{}'::jsonb)
  ) lesson(key, value)
  where lesson.value ? 'cursorCardId'
    and not (
      lesson.value->'completedCardIds' ? (lesson.value->>'cursorCardId')
    )
);

update public.trail_personal_states state_row
set completed_card_count = (
  select coalesce(sum(jsonb_array_length(value->'completedCardIds')), 0)::integer
  from jsonb_each(coalesce(state_row.state#>'{progress,lessons}', '{}'::jsonb))
);

alter table public.trail_personal_states
  add constraint trail_personal_states_shape_v1
  check(private.valid_trail_personal_state_v1(state));

create function private.merge_trail_personal_state_v1(
  p_older jsonb,
  p_current jsonb
)
returns jsonb
language plpgsql
immutable
strict
set search_path = pg_catalog
as $function$
declare
  v_path text;
  v_older_lesson jsonb;
  v_current_lesson jsonb;
  v_completed_ids jsonb;
  v_cursor_card_id text;
  v_card_id text;
  v_card_owner jsonb := '{}'::jsonb;
  v_lessons jsonb := coalesce(p_older#>'{progress,lessons}', '{}'::jsonb);
begin
  for v_path, v_current_lesson in
    select key, value
    from jsonb_each(coalesce(p_current#>'{progress,lessons}', '{}'::jsonb))
  loop
    v_older_lesson := coalesce(
      v_lessons->v_path,
      jsonb_build_object('completedCardIds', '[]'::jsonb)
    );
    select coalesce(jsonb_agg(to_jsonb(card_id) order by card_id), '[]'::jsonb)
    into v_completed_ids
    from (
      select distinct card_id
      from jsonb_array_elements_text(
        coalesce(v_older_lesson->'completedCardIds', '[]'::jsonb) ||
        coalesce(v_current_lesson->'completedCardIds', '[]'::jsonb)
      ) completed(card_id)
    ) unique_cards;

    v_cursor_card_id := null;
    if nullif(v_current_lesson->>'cursorCardId', '') is not null
      and v_completed_ids ? (v_current_lesson->>'cursorCardId') then
      v_cursor_card_id := v_current_lesson->>'cursorCardId';
    elsif nullif(v_older_lesson->>'cursorCardId', '') is not null
      and v_completed_ids ? (v_older_lesson->>'cursorCardId') then
      v_cursor_card_id := v_older_lesson->>'cursorCardId';
    else
      select value into v_cursor_card_id
      from jsonb_array_elements_text(v_completed_ids)
      order by value
      limit 1;
    end if;
    v_lessons := jsonb_set(v_lessons, array[v_path], jsonb_strip_nulls(
      jsonb_build_object(
        'cursorCardId', v_cursor_card_id,
        'completedCardIds', v_completed_ids
      )
    ), true);
  end loop;

  -- Um card pertence a uma única lição. A composição corrente vence; em cada
  -- documento, a ordenação por lessonId torna conflitos históricos estáveis.
  for v_path, v_current_lesson in
    select key, value
    from jsonb_each(coalesce(p_current#>'{progress,lessons}', '{}'::jsonb))
    order by key
  loop
    for v_card_id in
      select value from jsonb_array_elements_text(
        v_current_lesson->'completedCardIds'
      ) order by value
    loop
      if not (v_card_owner ? v_card_id) then
        v_card_owner := jsonb_set(v_card_owner, array[v_card_id], to_jsonb(v_path));
      end if;
    end loop;
  end loop;
  for v_path, v_older_lesson in
    select key, value
    from jsonb_each(coalesce(p_older#>'{progress,lessons}', '{}'::jsonb))
    order by key
  loop
    for v_card_id in
      select value from jsonb_array_elements_text(
        v_older_lesson->'completedCardIds'
      ) order by value
    loop
      if not (v_card_owner ? v_card_id) then
        v_card_owner := jsonb_set(v_card_owner, array[v_card_id], to_jsonb(v_path));
      end if;
    end loop;
  end loop;
  for v_path, v_current_lesson in
    select key, value from jsonb_each(v_lessons) order by key
  loop
    select coalesce(jsonb_agg(to_jsonb(card_id) order by card_id), '[]'::jsonb)
    into v_completed_ids
    from jsonb_array_elements_text(
      v_current_lesson->'completedCardIds'
    ) completed(card_id)
    where v_card_owner->>card_id = v_path;
    v_cursor_card_id := case
      when v_completed_ids ? coalesce(v_current_lesson->>'cursorCardId', '')
        then v_current_lesson->>'cursorCardId'
      else v_completed_ids->>0
    end;
    v_lessons := jsonb_set(v_lessons, array[v_path], jsonb_strip_nulls(
      jsonb_build_object(
        'cursorCardId', v_cursor_card_id,
        'completedCardIds', v_completed_ids
      )
    ), true);
  end loop;
  return jsonb_build_object(
    'version', 1,
    'progress', jsonb_build_object(
      'version', 3,
      'lessons', v_lessons
    ),
    'reviewMarks', coalesce(p_older->'reviewMarks', '{}'::jsonb)
      || coalesce(p_current->'reviewMarks', '{}'::jsonb),
    'observations', coalesce(p_older->'observations', '{}'::jsonb)
      || coalesce(p_current->'observations', '{}'::jsonb)
  );
end;
$function$;

create or replace function private.link_workspace_publication_trail_item_v1()
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
  from public.trail_personal_states state_row
  where state_row.trail_item_id in (v_keep_id, v_drop_id)
  order by state_row.user_id, state_row.trail_item_id
  for update;
  perform 1
  from public.study_path_items placement
  where placement.trail_item_id in (v_keep_id, v_drop_id)
  order by placement.owner_id, placement.path_id, placement.id
  for update;

  insert into public.trail_personal_states(
    user_id, trail_item_id, revision, completed_card_count,
    state, created_at, updated_at
  )
  select state_row.user_id, v_keep_id, state_row.revision,
    state_row.completed_card_count, state_row.state,
    state_row.created_at, state_row.updated_at
  from public.trail_personal_states state_row
  where state_row.trail_item_id = v_drop_id
  on conflict(user_id, trail_item_id) do update set
    revision = greatest(
      public.trail_personal_states.revision, excluded.revision
    ) + 1,
    state = private.merge_trail_personal_state_v1(
      excluded.state, public.trail_personal_states.state
    ),
    updated_at = greatest(
      public.trail_personal_states.updated_at, excluded.updated_at
    );
  update public.trail_personal_states state_row
  set completed_card_count = (
    select coalesce(sum(jsonb_array_length(value->'completedCardIds')), 0)::integer
    from jsonb_each(coalesce(state_row.state#>'{progress,lessons}', '{}'::jsonb))
  )
  where state_row.trail_item_id = v_keep_id;
  delete from public.trail_personal_states where trail_item_id = v_drop_id;
  delete from private.trail_personal_state_receipts
  where trail_item_id = v_drop_id;

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

create function public.load_trail_personal_state_v1(p_trail_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_row public.trail_personal_states%rowtype;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_trail_item_id is null
     or not private.trail_item_accessible_v1(p_trail_item_id, v_user_id) then
    raise exception 'Item inexistente ou inacessível.' using errcode = '42501';
  end if;
  select * into v_row from public.trail_personal_states state_row
  where state_row.user_id = v_user_id
    and state_row.trail_item_id = p_trail_item_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'trailItemId', v_row.trail_item_id,
    'revision', v_row.revision,
    'state', v_row.state,
    'updatedAt', v_row.updated_at
  );
end;
$function$;

create function public.mutate_trail_personal_state_v1(
  p_trail_item_id uuid,
  p_expected_revision bigint,
  p_operations jsonb,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_receipt private.trail_personal_state_receipts%rowtype;
  v_row public.trail_personal_states%rowtype;
  v_state jsonb;
  v_operation jsonb;
  v_kind text;
  v_collection text;
  v_path text;
  v_json_path text[];
  v_completed_card_count integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_trail_item_id is null or p_mutation_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_operations) <> 'array'
     or jsonb_array_length(p_operations) not between 1 and 512
     or pg_column_size(p_operations) > 65536 then
    raise exception 'Mutação do estado pessoal inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-item:' || p_trail_item_id::text, 0
  ));
  if not private.trail_item_accessible_v1(p_trail_item_id, v_user_id) then
    raise exception 'Item inexistente ou inacessível.' using errcode = '42501';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'trailItemId', p_trail_item_id,
    'expectedRevision', p_expected_revision,
    'operations', p_operations
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-state:' || v_user_id::text || ':' || p_mutation_id::text, 0
  ));
  delete from private.trail_personal_state_receipts receipt
  where receipt.user_id = v_user_id
    and receipt.mutation_id = p_mutation_id
    and receipt.expires_at <= statement_timestamp();
  with expired as materialized (
    select receipt.ctid
    from private.trail_personal_state_receipts receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.user_id, receipt.mutation_id
    limit 256
    for update skip locked
  )
  delete from private.trail_personal_state_receipts receipt
  using expired
  where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.trail_personal_state_receipts receipt
  where receipt.user_id = v_user_id and receipt.mutation_id = p_mutation_id;
  if found then
    if v_receipt.request_hash <> v_hash
       or v_receipt.trail_item_id <> p_trail_item_id then
      raise exception 'mutationId reutilizado com estado incompatível.'
        using errcode = '23514';
    end if;
    select * into v_row
    from public.trail_personal_states state_row
    where state_row.user_id = v_user_id
      and state_row.trail_item_id = p_trail_item_id;
    if not found then
      raise exception 'Recibo sem estado pessoal corrente.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'trailItemId', v_row.trail_item_id,
      'revision', v_row.revision,
      'updatedAt', v_row.updated_at,
      'idempotent', true
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-state-row:' || v_user_id::text || ':' || p_trail_item_id::text, 0
  ));
  select * into v_row
  from public.trail_personal_states state_row
  where state_row.user_id = v_user_id
    and state_row.trail_item_id = p_trail_item_id
  for update;
  if not found then
    if p_expected_revision <> 0 then
      raise exception 'O estado pessoal mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
    v_state := jsonb_build_object(
      'version', 1,
      'progress', jsonb_build_object(
        'version', 3, 'lessons', '{}'::jsonb
      ),
      'reviewMarks', '{}'::jsonb,
      'observations', '{}'::jsonb
    );
  else
    if v_row.revision <> p_expected_revision then
      raise exception 'O estado pessoal mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
    v_state := v_row.state;
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if jsonb_typeof(v_operation) <> 'object' then
      raise exception 'Operação do estado pessoal inválida.' using errcode = '22023';
    end if;
    if exists(
      select 1 from jsonb_object_keys(v_operation) field
      where field not in ('kind', 'collection', 'path', 'value')
    ) then
      raise exception 'Operação do estado pessoal contém campo desconhecido.'
        using errcode = '22023';
    end if;
    v_kind := v_operation->>'kind';
    v_collection := v_operation->>'collection';
    v_path := v_operation->>'path';
    if v_kind is null or v_collection is null
       or v_kind not in ('set', 'delete')
       or v_collection not in (
         'progress.lessons', 'reviewMarks', 'observations'
       )
       or nullif(btrim(v_path), '') is null
       or v_path <> btrim(v_path)
       or char_length(v_path) > 1024
       or v_path ~ '[[:cntrl:]]'
       or (v_kind = 'set' and not (v_operation ? 'value'))
       or (v_kind = 'delete' and v_operation ? 'value') then
      raise exception 'Operação do estado pessoal inválida.' using errcode = '22023';
    end if;
    v_json_path := case v_collection
      when 'progress.lessons' then array['progress', 'lessons', v_path]
      when 'reviewMarks' then array['reviewMarks', v_path]
      else array['observations', v_path]
    end;
    if v_kind = 'delete' then
      v_state := v_state #- v_json_path;
    else
      v_state := jsonb_set(v_state, v_json_path, v_operation->'value', true);
    end if;
  end loop;
  if not private.valid_trail_personal_state_v1(v_state) then
    raise exception 'A mutação produziria estado pessoal inválido.'
      using errcode = '22023';
  end if;
  select coalesce(sum(jsonb_array_length(value->'completedCardIds')), 0)::integer
  into v_completed_card_count
  from jsonb_each(coalesce(v_state#>'{progress,lessons}', '{}'::jsonb));

  if v_row.user_id is null then
    insert into public.trail_personal_states(
      user_id, trail_item_id, revision, completed_card_count, state
    ) values(
      v_user_id, p_trail_item_id, 1, v_completed_card_count, v_state
    )
    returning * into v_row;
  else
    update public.trail_personal_states state_row
    set revision = state_row.revision + 1,
        completed_card_count = v_completed_card_count,
        state = v_state,
        updated_at = now()
    where state_row.user_id = v_user_id
      and state_row.trail_item_id = p_trail_item_id
    returning * into v_row;
  end if;
  v_result := jsonb_build_object(
    'trailItemId', v_row.trail_item_id,
    'revision', v_row.revision,
    'updatedAt', v_row.updated_at,
    'idempotent', false
  );
  insert into private.trail_personal_state_receipts(
    user_id, mutation_id, trail_item_id, request_hash,
    result_revision, result_updated_at
  ) values(
    v_user_id, p_mutation_id, p_trail_item_id, v_hash,
    v_row.revision, v_row.updated_at
  );
  return v_result;
end;
$function$;

revoke all on function private.valid_trail_personal_state_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.merge_trail_personal_state_v1(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.load_trail_personal_state_v1(uuid)
  from public, anon;
grant execute on function public.load_trail_personal_state_v1(uuid)
  to authenticated;
revoke all on function public.mutate_trail_personal_state_v1(uuid, bigint, jsonb, uuid)
  from public, anon;
grant execute on function public.mutate_trail_personal_state_v1(uuid, bigint, jsonb, uuid)
  to authenticated;

drop trigger if exists study_paths_sync on public.study_paths;
drop trigger if exists lesson_progress_sync on public.lesson_progress;
drop trigger if exists card_progress_sync on public.card_progress;
drop trigger if exists card_comments_sync on public.card_comments;

drop function if exists public.apply_non_punitive_study_state_batch_v1(uuid, jsonb);
drop function if exists public.apply_situated_comment_batch_v1(uuid, jsonb);
drop function if exists public.apply_sync_batch_without_situated_comments_v1(uuid, jsonb);

delete from private.sync_changes
where entity_type in (
  'studyPaths', 'studyPathCourses', 'lessonProgress', 'cardProgress', 'comments'
);

create or replace function private.current_personal_row(
  p_entity_type text,
  p_entity_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_row jsonb;
begin
  if p_entity_type = 'courseSelections' then
    select private.selection_row(selection.id) into v_row
    from public.user_course_selections selection
    where selection.id = p_entity_id and selection.user_id = p_user_id;
  end if;
  return v_row;
end;
$function$;

create or replace function public.bootstrap_replica(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_high_water bigint;
  v_snapshot jsonb;
  v_selected jsonb;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-sync-feed-commit-order', 0
  ));
  select greatest(
    (select compacted_through_sequence
      from private.sync_retention_policy where singleton),
    coalesce(max(sequence), 0)
  ) into v_high_water from private.sync_changes;
  insert into private.sync_devices(
    id, user_id, last_pulled_sequence, last_seen_at, inactive_at
  ) values(p_device_id, v_user_id, v_high_water, now(), null)
  on conflict(user_id, id) do update set
    last_pulled_sequence = excluded.last_pulled_sequence,
    last_seen_at = now(), inactive_at = null;
  select jsonb_build_object(
    'courseSelections', coalesce((
      select jsonb_agg(private.selection_row(selection.id)
        order by selection.position, selection.id)
      from public.user_course_selections selection
      join public.courses course on course.id = selection.course_id
      where selection.user_id = v_user_id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
    ), '[]'::jsonb)
  ) into v_snapshot;
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', course.id,
    'publicationSeq', course.publication_seq,
    'contentHash', course.content_hash
  ) order by selection.position, selection.id), '[]'::jsonb)
  into v_selected
  from public.user_course_selections selection
  join public.courses course on course.id = selection.course_id
  where selection.user_id = v_user_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled;
  return jsonb_build_object(
    'snapshot', v_snapshot,
    'selectedCourses', v_selected,
    'highWaterSequence', v_high_water
  );
end;
$function$;

-- O transporte relacional ainda usa este nome para o vínculo leve do catálogo.
-- Todo estado de estudo e toda organização foram removidos deste canal.
create function public.apply_sync_batch(
  p_device_id uuid,
  p_mutations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb := case when jsonb_typeof(p_mutations) = 'array'
    then p_mutations else p_mutations->'mutations' end;
  v_mutation jsonb;
  v_mutation_id uuid;
  v_entity_id uuid;
  v_course_id uuid;
  v_operation text;
  v_client_sequence bigint;
  v_device_processed bigint;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_code text;
  v_message text;
begin
  if v_user_id is null or p_device_id is null
     or jsonb_typeof(v_items) <> 'array'
     or jsonb_array_length(v_items) > 500 then
    raise exception 'Lote de seleções inválido.' using errcode = '22023';
  end if;
  insert into private.sync_devices(id, user_id, last_seen_at, inactive_at)
  values(p_device_id, v_user_id, now(), null)
  on conflict(user_id, id) do update set last_seen_at = now(), inactive_at = null;
  select device.last_processed_mutation_sequence into v_device_processed
  from private.sync_devices device
  where device.user_id = v_user_id and device.id = p_device_id
  for update;
  for v_mutation in select value from jsonb_array_elements(v_items)
  loop
    begin
      v_mutation_id := null;
      v_entity_id := null;
      v_course_id := null;
      v_operation := null;
      v_client_sequence := null;
      v_mutation_id := private.try_uuid(v_mutation->>'mutationId');
      v_entity_id := private.try_uuid(v_mutation->>'entityId');
      v_course_id := coalesce(
        private.try_uuid(v_mutation->>'courseId'),
        private.try_uuid(v_mutation#>>'{payload,courseId}')
      );
      v_operation := lower(coalesce(v_mutation->>'operation', ''));
      v_client_sequence := case
        when coalesce(v_mutation->>'sequence', '') ~ '^[0-9]+$'
          then (v_mutation->>'sequence')::bigint
        else null
      end;
      if v_mutation_id is null or v_entity_id is null or v_course_id is null
         or coalesce(v_client_sequence, 0) <= 0
         or jsonb_typeof(v_mutation) <> 'object'
         or pg_column_size(v_mutation) > 16384
         or exists(
           select 1 from jsonb_object_keys(v_mutation) field
           where field not in (
             'mutationId', 'sequence', 'courseId', 'entityType', 'entityId',
             'operation', 'changedFields', 'payload'
           )
         )
         or v_mutation->>'entityType' <> 'courseSelections'
         or v_operation not in ('insert', 'upsert', 'update', 'delete')
         or jsonb_typeof(coalesce(v_mutation->'payload', '{}'::jsonb)) <> 'object'
         or exists(
           select 1 from jsonb_object_keys(
             coalesce(v_mutation->'payload', '{}'::jsonb)
           ) field
           where field not in (
             'id', 'userId', 'courseId', 'position', 'createdAt', 'updatedAt',
             'deletedAt'
           )
         ) then
        raise exception 'Mutação de seleção inválida.' using errcode = '22023';
      end if;
      if v_client_sequence <= v_device_processed then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'status', 'applied',
          'mutationId', v_mutation_id,
          'entityType', 'courseSelections',
          'entityId', v_entity_id,
          'operation', case when v_operation = 'delete' then 'delete' else 'upsert' end,
          'idempotent', true,
          'deduplicatedByDeviceSequence', true,
          'row', private.current_personal_row(
            'courseSelections', v_entity_id, v_user_id
          )
        ));
        continue;
      end if;
      if v_operation = 'delete' then
        v_result := public.unselect_catalog_course(v_course_id, v_mutation_id);
      else
        v_result := public.select_catalog_course(v_course_id, v_mutation_id);
      end if;
      v_device_processed := greatest(v_device_processed, v_client_sequence);
      update private.sync_devices
      set last_processed_mutation_sequence = v_device_processed
      where user_id = v_user_id and id = p_device_id;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'applied',
        'mutationId', v_mutation_id,
        'entityType', 'courseSelections',
        'entityId', coalesce(v_result->>'selectionId', v_entity_id::text),
        'operation', case when v_operation = 'delete' then 'delete' else 'upsert' end,
        'idempotent', coalesce((v_result->>'idempotent')::boolean, false),
        'row', v_result->'row'
      ));
    exception when others then
      get stacked diagnostics v_code = returned_sqlstate, v_message = message_text;
      if left(v_code, 2) not in ('22', '23') and v_code <> '42501' then raise; end if;
      if coalesce(v_client_sequence, 0) > 0 then
        v_device_processed := greatest(v_device_processed, v_client_sequence);
        update private.sync_devices
        set last_processed_mutation_sequence = v_device_processed
        where user_id = v_user_id and id = p_device_id;
      end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'rejected',
        'mutationId', v_mutation->>'mutationId',
        'entityType', v_mutation->>'entityType',
        'entityId', v_mutation->>'entityId',
        'code', v_code,
        'reason', 'invalid_mutation',
        'message', v_message
      ));
    end;
  end loop;
  return jsonb_build_object('status', 'applied', 'results', v_results);
end;
$function$;

revoke all on function public.apply_sync_batch(uuid, jsonb) from public, anon;
grant execute on function public.apply_sync_batch(uuid, jsonb) to authenticated;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_without_trail_state_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  with base as (
    select public.get_aralearn_runtime_manifest_without_trail_state_v1() as value
  )
  select jsonb_set(
    jsonb_set(base.value, '{schemaRevision}', '"20260807220000"'::jsonb),
    '{features}',
    (
      (base.value->'features')
        - 'partial-private-publication'
        - 'current-state-central-v1'
        - 'situated-personal-comments-v1'
        - 'workspace-pedagogical-comments-v1'
        - 'non-punitive-study-state-v1'
        - 'non-punitive-study-projections-v1'
        - 'workspace-comment-aggregates-v1'
        - 'integrated-trails-v1'
    ) || jsonb_build_array(
      'trail-personal-state-v1', 'atomic-trail-personal-state-v1',
      'stable-entity-personal-state-v1'
    )
  ) from base
$function$;

revoke all on function public.get_aralearn_runtime_manifest_without_trail_state_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
