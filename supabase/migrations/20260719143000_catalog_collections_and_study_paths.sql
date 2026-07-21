begin;

create table public.catalog_collections (
  id uuid primary key default gen_random_uuid(),
  contract_key text not null unique,
  title text not null,
  description text not null default '',
  position integer not null default 0,
  is_published boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint catalog_collections_key_not_blank check (btrim(contract_key) <> ''),
  constraint catalog_collections_title_not_blank check (btrim(title) <> ''),
  constraint catalog_collections_position_nonnegative check (position >= 0),
  constraint catalog_collections_revision_positive check (revision > 0)
);

create index catalog_collections_listing_idx
  on public.catalog_collections (is_published, deleted_at, position, title);

create table public.catalog_collection_courses (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.catalog_collections(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  position integer not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint catalog_collection_courses_position_nonnegative check (position >= 0),
  constraint catalog_collection_courses_revision_positive check (revision > 0)
);

create unique index catalog_collection_courses_active_uidx
  on public.catalog_collection_courses (collection_id, course_id)
  where deleted_at is null;
create index catalog_collection_courses_listing_idx
  on public.catalog_collection_courses (collection_id, deleted_at, position);
create index catalog_collection_courses_course_idx
  on public.catalog_collection_courses (course_id, deleted_at);

create table public.study_paths (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  position integer not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint study_paths_title_not_blank check (btrim(title) <> ''),
  constraint study_paths_title_length check (char_length(title) <= 120),
  constraint study_paths_description_length check (char_length(description) <= 1000),
  constraint study_paths_position_nonnegative check (position >= 0),
  constraint study_paths_revision_positive check (revision > 0)
);

create index study_paths_owner_listing_idx
  on public.study_paths (owner_id, deleted_at, position, title);

create table public.study_path_courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  path_id uuid not null references public.study_paths(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  position integer not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint study_path_courses_position_nonnegative check (position >= 0),
  constraint study_path_courses_revision_positive check (revision > 0)
);

create unique index study_path_courses_active_uidx
  on public.study_path_courses (path_id, course_id)
  where deleted_at is null;
create index study_path_courses_path_listing_idx
  on public.study_path_courses (path_id, deleted_at, position);
create index study_path_courses_owner_idx
  on public.study_path_courses (owner_id, deleted_at, updated_at desc);
create index study_path_courses_course_idx
  on public.study_path_courses (course_id, deleted_at);

create trigger catalog_collections_touch_revision
before update on public.catalog_collections
for each row execute function private.touch_revision();
create trigger catalog_collection_courses_touch_revision
before update on public.catalog_collection_courses
for each row execute function private.touch_revision();
create trigger study_paths_touch_revision
before update on public.study_paths
for each row execute function private.touch_revision();
create trigger study_path_courses_touch_revision
before update on public.study_path_courses
for each row execute function private.touch_revision();

alter table public.catalog_collections enable row level security;
alter table public.catalog_collections force row level security;
alter table public.catalog_collection_courses enable row level security;
alter table public.catalog_collection_courses force row level security;
alter table public.study_paths enable row level security;
alter table public.study_paths force row level security;
alter table public.study_path_courses enable row level security;
alter table public.study_path_courses force row level security;

create policy catalog_collections_read on public.catalog_collections
for select to authenticated using (is_published and deleted_at is null);
create policy catalog_collection_courses_read on public.catalog_collection_courses
for select to authenticated using (
  deleted_at is null
  and exists (
    select 1 from public.catalog_collections collection
    where collection.id = collection_id
      and collection.is_published and collection.deleted_at is null
  )
  and exists (
    select 1 from public.courses course
    where course.id = course_id and course.kind = 'official'
      and course.status = 'published' and course.deleted_at is null
  )
);
create policy study_paths_owner_read on public.study_paths
for select to authenticated using (owner_id = auth.uid());
create policy study_path_courses_owner_read on public.study_path_courses
for select to authenticated using (owner_id = auth.uid());

revoke all on public.catalog_collections from public, anon, authenticated;
revoke all on public.catalog_collection_courses from public, anon, authenticated;
revoke all on public.study_paths from public, anon, authenticated;
revoke all on public.study_path_courses from public, anon, authenticated;

insert into public.catalog_collections (id, contract_key, title, description, position)
values
  ('71000000-0000-4000-8000-000000000001', 'concursos-publicos', 'Concursos públicos', '', 0),
  ('71000000-0000-4000-8000-000000000002', 'ia-e-dados', 'IA e dados', '', 1),
  ('71000000-0000-4000-8000-000000000003', 'certificacoes', 'Certificações', '', 2),
  ('71000000-0000-4000-8000-000000000004', 'outros', 'Outros', '', 999)
on conflict (contract_key) do nothing;

insert into public.catalog_collection_courses (collection_id, course_id, position)
select '71000000-0000-4000-8000-000000000001', course.id, 0
from public.courses course
where course.contract_key = 'course-dataprev-2026-analista-processamento-seguranca-informacao'
  and course.kind = 'official' and course.deleted_at is null
on conflict do nothing;

insert into public.catalog_collection_courses (collection_id, course_id, position)
select '71000000-0000-4000-8000-000000000002', course.id, 0
from public.courses course
where course.contract_key = 'course-fundamentos-ia-analise-dados'
  and course.kind = 'official' and course.deleted_at is null
on conflict do nothing;

insert into public.catalog_collection_courses (collection_id, course_id, position)
select '71000000-0000-4000-8000-000000000003', course.id, 0
from public.courses course
where course.contract_key = 'course-microsoft-azure-ai-fundamentals-ai900'
  and course.kind = 'official' and course.deleted_at is null
on conflict do nothing;

create or replace function private.ensure_official_course_collection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.kind = 'official' and new.status = 'published' and new.deleted_at is null
     and not exists (
       select 1 from public.catalog_collection_courses item
       where item.course_id = new.id and item.deleted_at is null
     ) then
    insert into public.catalog_collection_courses (collection_id, course_id, position)
    values ('71000000-0000-4000-8000-000000000004', new.id, 0)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger courses_ensure_official_collection
after insert or update of status, deleted_at on public.courses
for each row execute function private.ensure_official_course_collection();

create or replace function private.detach_deleted_personal_course_from_paths()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.kind = 'personal' and old.deleted_at is null and new.deleted_at is not null then
    update public.study_path_courses
    set deleted_at = new.deleted_at
    where course_id = new.id and deleted_at is null;
  end if;
  return new;
end;
$$;

create trigger courses_detach_deleted_personal_from_paths
after update of deleted_at on public.courses
for each row execute function private.detach_deleted_personal_course_from_paths();

create or replace function private.detach_revoked_membership_from_paths()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.study_path_courses
    set deleted_at = new.deleted_at
    where course_id = new.course_id and owner_id = new.user_id and deleted_at is null;
  end if;
  return new;
end;
$$;

create trigger course_memberships_detach_revoked_from_paths
after update of deleted_at on public.course_memberships
for each row execute function private.detach_revoked_membership_from_paths();

create or replace function public.list_catalog_collections(p_query text default '')
returns table (
  collection_id uuid,
  collection_key text,
  collection_title text,
  collection_description text,
  collection_position integer,
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  is_installed boolean,
  installed_course_id uuid,
  update_available boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select collection.id, collection.contract_key, collection.title, collection.description,
    collection.position, course.id, course.contract_key, course.title, course.goal,
    course.publication_seq, coalesce(course.content_hash, private.course_content_hash(course.id)),
    (select count(*) from public.modules module where module.course_id = course.id and module.deleted_at is null),
    (select count(*) from public.lessons lesson where lesson.course_id = course.id and lesson.deleted_at is null),
    installed.id is not null, installed.id,
    installed.id is not null and installed.source_publication_seq < course.publication_seq
  from public.catalog_collections collection
  join public.catalog_collection_courses item
    on item.collection_id = collection.id and item.deleted_at is null
  join public.courses course
    on course.id = item.course_id and course.kind = 'official'
    and course.status = 'published' and course.deleted_at is null
  left join lateral (
    select personal.id, personal.source_publication_seq
    from public.courses personal
    where personal.kind = 'personal' and personal.source_course_id = course.id
      and personal.deleted_at is null
      and exists (
        select 1 from public.course_memberships membership
        where membership.course_id = personal.id and membership.user_id = auth.uid()
          and membership.deleted_at is null
      )
    order by personal.created_at desc limit 1
  ) installed on true
  where collection.is_published and collection.deleted_at is null
    and (
      v_query = ''
      or collection.title ilike '%' || v_query || '%'
      or collection.description ilike '%' || v_query || '%'
      or course.title ilike '%' || v_query || '%'
      or course.goal ilike '%' || v_query || '%'
    )
  order by collection.position, collection.title, item.position, course.title, course.id;
end;
$$;

create or replace function private.capture_personal_library_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_operation text;
begin
  if current_setting('aralearn.suppress_sync_changes', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  v_operation := case
    when tg_op = 'DELETE' or (v_row ->> 'deleted_at') is not null then 'delete'
    when tg_op = 'INSERT' then 'insert'
    else 'update'
  end;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));
  insert into public.sync_changes (
    audience_user_id, course_id, entity_type, entity_id, operation, entity_revision, row_data
  ) values (
    (v_row ->> 'owner_id')::uuid, null, tg_table_name, (v_row ->> 'id')::uuid,
    v_operation, coalesce((v_row ->> 'revision')::bigint, 1), v_row
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger study_paths_capture_sync_change
after insert or update or delete on public.study_paths
for each row execute function private.capture_personal_library_change();
create trigger study_path_courses_capture_sync_change
after insert or update or delete on public.study_path_courses
for each row execute function private.capture_personal_library_change();

create or replace function private.store_name(p_table_name text, p_row jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_table_name
    when 'courses' then 'courses'
    when 'course_memberships' then 'memberships'
    when 'modules' then 'modules'
    when 'lessons' then 'lessons'
    when 'course_guides' then 'guides'
    when 'guide_items' then 'guideItems'
    when 'lesson_topics' then 'topics'
    when 'topic_statements' then 'topicStatements'
    when 'microsequences' then 'microsequences'
    when 'microsequence_dependencies' then 'dependencies'
    when 'microsequence_statements' then 'microsequenceStatements'
    when 'cards' then 'cards'
    when 'card_blocks' then 'blocks'
    when 'block_options' then 'options'
    when 'block_nodes' then 'nodes'
    when 'flow_nodes' then 'flowNodes'
    when 'flow_cases' then 'flowCases'
    when 'flow_practices' then 'flowPractices'
    when 'node_practices' then 'flowPracticeEntries'
    when 'node_practice_items' then case p_row ->> 'item_kind'
      when 'option' then 'flowPracticeOptions'
      when 'variant' then 'flowPracticeVariants'
      when 'shape_option' then 'flowShapeOptions'
    end
    when 'block_edges' then 'edges'
    when 'block_matrix_items' then 'matrixItems'
    when 'block_cells' then 'cells'
    when 'block_points' then 'points'
    when 'block_lines' then 'lines'
    when 'block_highlights' then 'highlights'
    when 'card_refs' then case p_row ->> 'ref_kind'
      when 'source' then 'cardSources'
      when 'topic' then 'cardTopics'
    end
    when 'lesson_progress' then 'lessonProgress'
    when 'card_progress' then 'cardProgress'
    when 'card_comments' then 'comments'
    when 'study_paths' then 'studyPaths'
    when 'study_path_courses' then 'studyPathCourses'
  end;
$$;

create or replace function public.apply_study_path_mutation(p_device_id uuid, p_mutation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_mutation_id uuid := private.try_uuid(p_mutation ->> 'mutationId');
  v_entity_id uuid := private.try_uuid(p_mutation ->> 'entityId');
  v_entity_type text := p_mutation ->> 'entityType';
  v_operation text := p_mutation ->> 'operation';
  v_base_revision bigint := private.try_bigint(p_mutation ->> 'baseRevision', 0);
  v_payload jsonb := coalesce(p_mutation -> 'payload', '{}'::jsonb);
  v_changed_fields jsonb := coalesce(p_mutation -> 'changedFields', '[]'::jsonb);
  v_current jsonb;
  v_returned jsonb;
  v_result jsonb;
  v_existing_request jsonb;
  v_existing_result jsonb;
  v_path_id uuid;
  v_course_id uuid;
  v_title text;
  v_description text;
  v_position integer;
  v_code text;
  v_message text;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_device_id is null or v_mutation_id is null or v_entity_id is null
     or v_entity_type not in ('studyPaths', 'studyPathCourses')
     or v_operation not in ('insert', 'update', 'delete')
     or jsonb_typeof(v_payload) <> 'object'
     or jsonb_typeof(v_changed_fields) <> 'array' then
    return jsonb_build_object(
      'status','rejected','mutationId',v_mutation_id,'code','22023',
      'reason','invalid_payload','message','Mutação de trilha inválida.'
    );
  end if;

  insert into public.sync_devices (id, user_id, last_seen_at)
  values (p_device_id, v_user_id, now())
  on conflict (id) do update set last_seen_at = now()
  where sync_devices.user_id = excluded.user_id
    and sync_devices.deleted_at is null and sync_devices.inactive_at is null;
  if not exists (
    select 1 from public.sync_devices
    where id = p_device_id and user_id = v_user_id
      and deleted_at is null and inactive_at is null
  ) then
    raise exception 'Dispositivo inativo ou pertencente a outro usuário; bootstrap obrigatório.'
      using errcode = '55000';
  end if;

  select request, result into v_existing_request, v_existing_result
  from public.sync_mutations
  where user_id = v_user_id and mutation_id = v_mutation_id;
  if found then
    if v_existing_request is distinct from p_mutation then
      return jsonb_build_object(
        'status','rejected','mutationId',v_mutation_id,'code','23505',
        'reason','mutation_id_reuse','message','mutationId já foi usado com outro payload.',
        'idempotent',true
      );
    end if;
    return v_existing_result || jsonb_build_object('idempotent', true);
  end if;

  begin
    perform pg_advisory_xact_lock(hashtextextended(
      'study-path:' || v_entity_type || ':' || v_entity_id::text, 0
    ));
    if v_entity_type = 'studyPaths' then
      select to_jsonb(path) into v_current from public.study_paths path where path.id = v_entity_id for update;
      if v_operation = 'insert' then
        if v_current is not null then
          v_result := jsonb_build_object(
            'status','conflict','code','23505','reason','entity_exists',
            'remoteRevision',(v_current ->> 'revision')::bigint,
            'remoteRow',private.local_row('studyPaths',v_current)
          );
        else
          v_title := btrim(coalesce(v_payload ->> 'title', ''));
          v_description := coalesce(v_payload ->> 'description', '');
          v_position := greatest(private.try_bigint(v_payload ->> 'position', 0), 0)::integer;
          if v_title = '' then raise exception 'Título da trilha é obrigatório.' using errcode = '23514'; end if;
          insert into public.study_paths (id, owner_id, title, description, position)
          values (v_entity_id, v_user_id, v_title, v_description, v_position)
          returning to_jsonb(study_paths) into v_returned;
        end if;
      elsif v_current is null or v_current ->> 'deleted_at' is not null then
        v_result := jsonb_build_object('status','rejected','code','22023','reason','entity_missing');
      elsif private.try_uuid(v_current ->> 'owner_id') is distinct from v_user_id then
        v_result := jsonb_build_object('status','rejected','code','42501','reason','authorization_denied');
      elsif (v_current ->> 'revision')::bigint <> v_base_revision then
        v_result := jsonb_build_object(
          'status','conflict','code','40001','reason','revision_mismatch',
          'remoteRevision',(v_current ->> 'revision')::bigint,
          'remoteRow',private.local_row('studyPaths',v_current)
        );
      elsif v_operation = 'delete' then
        update public.study_path_courses set deleted_at = now()
        where path_id = v_entity_id and owner_id = v_user_id and deleted_at is null;
        update public.study_paths set deleted_at = now()
        where id = v_entity_id returning to_jsonb(study_paths) into v_returned;
      else
        if exists (
          select 1 from jsonb_array_elements_text(v_changed_fields) field
          where field not in ('title','description','position')
        ) then raise exception 'Campo de trilha não pode ser alterado.' using errcode = '22023'; end if;
        if v_changed_fields ? 'title' and not (v_payload ? 'title') then
          raise exception 'Campo title ausente.' using errcode = '22023';
        end if;
        update public.study_paths set
          title = case when v_changed_fields ? 'title' then btrim(v_payload ->> 'title') else title end,
          description = case when v_changed_fields ? 'description' then coalesce(v_payload ->> 'description','') else description end,
          position = case when v_changed_fields ? 'position' then greatest(private.try_bigint(v_payload ->> 'position', position),0)::integer else position end
        where id = v_entity_id returning to_jsonb(study_paths) into v_returned;
      end if;
    else
      select to_jsonb(item) into v_current from public.study_path_courses item where item.id = v_entity_id for update;
      if v_operation = 'insert' then
        if v_current is not null then
          v_result := jsonb_build_object(
            'status','conflict','code','23505','reason','entity_exists',
            'remoteRevision',(v_current ->> 'revision')::bigint,
            'remoteRow',private.local_row('studyPathCourses',v_current)
          );
        else
          v_path_id := private.try_uuid(v_payload ->> 'pathId');
          v_course_id := private.try_uuid(v_payload ->> 'courseId');
          v_position := greatest(private.try_bigint(v_payload ->> 'position', 0), 0)::integer;
          if not exists (
            select 1 from public.study_paths path
            where path.id = v_path_id and path.owner_id = v_user_id and path.deleted_at is null
          ) then raise exception 'Trilha não encontrada.' using errcode = '23503'; end if;
          if not exists (
            select 1 from public.courses course
            where course.id = v_course_id and course.kind = 'personal' and course.deleted_at is null
              and exists (
                select 1 from public.course_memberships membership
                where membership.course_id = course.id and membership.user_id = v_user_id
                  and membership.deleted_at is null
              )
          ) then raise exception 'Curso pessoal não autorizado.' using errcode = '42501'; end if;
          insert into public.study_path_courses (id, owner_id, path_id, course_id, position)
          values (v_entity_id, v_user_id, v_path_id, v_course_id, v_position)
          returning to_jsonb(study_path_courses) into v_returned;
        end if;
      elsif v_current is null or v_current ->> 'deleted_at' is not null then
        v_result := jsonb_build_object('status','rejected','code','22023','reason','entity_missing');
      elsif private.try_uuid(v_current ->> 'owner_id') is distinct from v_user_id then
        v_result := jsonb_build_object('status','rejected','code','42501','reason','authorization_denied');
      elsif (v_current ->> 'revision')::bigint <> v_base_revision then
        v_result := jsonb_build_object(
          'status','conflict','code','40001','reason','revision_mismatch',
          'remoteRevision',(v_current ->> 'revision')::bigint,
          'remoteRow',private.local_row('studyPathCourses',v_current)
        );
      elsif v_operation = 'delete' then
        update public.study_path_courses set deleted_at = now()
        where id = v_entity_id returning to_jsonb(study_path_courses) into v_returned;
      else
        if jsonb_array_length(v_changed_fields) <> 1 or not (v_changed_fields ? 'position')
           or not (v_payload ? 'position') then
          raise exception 'Somente a posição do curso pode ser alterada.' using errcode = '22023';
        end if;
        update public.study_path_courses
        set position = greatest(private.try_bigint(v_payload ->> 'position', position), 0)::integer
        where id = v_entity_id returning to_jsonb(study_path_courses) into v_returned;
      end if;
    end if;

    if v_result is null then
      v_result := jsonb_build_object(
        'status','applied','entityType',v_entity_type,'entityId',v_entity_id,
        'operation',v_operation,'revision',(v_returned ->> 'revision')::bigint,
        'row',private.local_row(v_entity_type,v_returned)
      );
    end if;
  exception when others then
    get stacked diagnostics v_message = message_text, v_code = returned_sqlstate;
    v_result := jsonb_build_object(
      'status','rejected','entityType',v_entity_type,'entityId',v_entity_id,
      'code',v_code,'reason',private.sync_rejection_reason(v_code,v_message),'message',v_message
    );
  end;

  v_result := v_result || jsonb_build_object('mutationId',v_mutation_id,'idempotent',false);
  insert into public.sync_mutations (
    mutation_id,user_id,device_id,entity_type,entity_id,operation,
    base_revision,status,request,result
  ) values (
    v_mutation_id,v_user_id,p_device_id,v_entity_type,v_entity_id,v_operation,
    greatest(v_base_revision,0),(v_result ->> 'status')::public.sync_mutation_status,p_mutation,v_result
  );
  return v_result;
end;
$$;

create or replace function public.bootstrap_replica(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_course_id uuid;
  v_graph jsonb;
  v_snapshot jsonb := jsonb_build_object('schemaVersion', 2);
  v_store_name text;
  v_store_names constant text[] := array[
    'courses','memberships','modules','lessons','guides','guideItems','topics',
    'topicStatements','microsequences','dependencies','microsequenceStatements',
    'cards','blocks','options','nodes','flowNodes','flowCases','flowPractices',
    'flowPracticeEntries','flowPracticeOptions','flowPracticeVariants','flowShapeOptions',
    'edges','matrixItems','cells','points','lines','highlights','cardSources','cardTopics',
    'lessonProgress','cardProgress','comments','studyPaths','studyPathCourses'
  ];
  v_high_water bigint;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));
  foreach v_store_name in array v_store_names loop
    v_snapshot := jsonb_set(v_snapshot, array[v_store_name], '[]'::jsonb, true);
  end loop;
  for v_course_id in
    select course.id from public.courses course
    where course.kind = 'personal' and course.deleted_at is null
      and (course.owner_id = v_user_id or exists (
        select 1 from public.course_memberships membership
        where membership.course_id = course.id and membership.user_id = v_user_id
          and membership.deleted_at is null
      ))
    order by course.id
  loop
    v_graph := public.get_personal_course_graph(v_course_id);
    foreach v_store_name in array v_store_names loop
      v_snapshot := jsonb_set(
        v_snapshot,array[v_store_name],coalesce(v_snapshot -> v_store_name,'[]'::jsonb)
          || coalesce(v_graph -> v_store_name,'[]'::jsonb),true
      );
    end loop;
  end loop;
  v_snapshot := jsonb_set(v_snapshot, array['studyPaths'], coalesce((
    select jsonb_agg(private.local_row('studyPaths',to_jsonb(path)) order by path.position,path.id)
    from public.study_paths path where path.owner_id = v_user_id and path.deleted_at is null
  ),'[]'::jsonb), true);
  v_snapshot := jsonb_set(v_snapshot, array['studyPathCourses'], coalesce((
    select jsonb_agg(private.local_row('studyPathCourses',to_jsonb(item)) order by item.path_id,item.position,item.id)
    from public.study_path_courses item where item.owner_id = v_user_id and item.deleted_at is null
  ),'[]'::jsonb), true);
  select coalesce(max(sequence),0) into v_high_water from public.sync_changes;
  insert into public.sync_devices (id,user_id,last_pulled_sequence,last_seen_at,inactive_at,deleted_at)
  values (p_device_id,v_user_id,v_high_water,now(),null,null)
  on conflict (id) do update set last_pulled_sequence=excluded.last_pulled_sequence,
    last_seen_at=excluded.last_seen_at,inactive_at=null,deleted_at=null
  where sync_devices.user_id=excluded.user_id;
  if not exists (
    select 1 from public.sync_devices where id=p_device_id and user_id=v_user_id
      and deleted_at is null and inactive_at is null
  ) then raise exception 'Dispositivo pertence a outro usuário.' using errcode='42501'; end if;
  return jsonb_build_object(
    'status','applied','deviceId',p_device_id,'snapshot',v_snapshot,
    'highWaterSequence',v_high_water
  );
end;
$$;

revoke all on function public.list_catalog_collections(text) from public, anon, authenticated;
grant execute on function public.list_catalog_collections(text) to authenticated;
revoke all on function public.apply_study_path_mutation(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.apply_study_path_mutation(uuid,jsonb) to authenticated;
revoke all on function public.bootstrap_replica(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_replica(uuid) to authenticated;

commit;
