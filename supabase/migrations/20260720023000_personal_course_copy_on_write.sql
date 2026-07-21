begin;

select pg_advisory_xact_lock(hashtextextended('aralearn-personal-course-copy-on-write', 0));

-- Official trees remain shared.  Ownership exists only on a root created by an
-- explicit authoring action; child rows keep the compact lean shape.
alter table public.courses
  add column owner_id uuid references auth.users(id) on delete cascade,
  add column source_course_id uuid references public.courses(id) on delete restrict;

drop index if exists public.courses_contract_key_lean_uidx;
create unique index courses_official_contract_key_uidx
  on public.courses(contract_key)
  where owner_id is null and deleted_at is null;
create unique index courses_personal_owner_contract_key_uidx
  on public.courses(owner_id, contract_key)
  where owner_id is not null and deleted_at is null;
create unique index courses_personal_source_uidx
  on public.courses(owner_id, source_course_id)
  where owner_id is not null and source_course_id is not null and deleted_at is null;
create index courses_owner_lean_idx
  on public.courses(owner_id, deleted_at, position, id)
  where owner_id is not null;

alter table public.courses
  add constraint courses_copy_on_write_shape check (
    (owner_id is null and source_course_id is null)
    or (owner_id is not null and source_course_id is distinct from id)
  );

-- A tombstone legitimately refers to a course that has just been removed.
-- Keeping that UUID in the private feed lets another replica remove its local
-- graph; a live-row FK would erase the very signal needed for convergence.
alter table private.sync_changes drop constraint sync_changes_course_id_fkey;

-- The selection UUID is the stable causal anchor across the official→personal
-- transition.  Its composite dependants are deferred only for the duration of
-- the transactional remap performed by the fork RPC.
alter table public.lesson_progress
  drop constraint lesson_progress_selection_fk,
  add constraint lesson_progress_selection_fk foreign key(selection_id,user_id,course_id)
    references public.user_course_selections(id,user_id,course_id)
    on delete cascade deferrable initially immediate;
alter table public.card_progress
  drop constraint card_progress_selection_fk,
  add constraint card_progress_selection_fk foreign key(selection_id,user_id,course_id)
    references public.user_course_selections(id,user_id,course_id)
    on delete cascade deferrable initially immediate;
alter table public.card_comments
  drop constraint card_comments_selection_fk,
  add constraint card_comments_selection_fk foreign key(selection_id,user_id,course_id)
    references public.user_course_selections(id,user_id,course_id)
    on delete cascade deferrable initially immediate;

alter table private.sync_idempotency
  drop constraint sync_idempotency_operation,
  add constraint sync_idempotency_operation
    check(operation in ('upsert','delete','select','unselect','fork','create'));

create or replace function public.user_can_read_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null and exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.deleted_at is null
      and c.status = 'published'
      and (c.owner_id is null or c.owner_id = auth.uid())
  );
$$;

create or replace function public.user_can_edit_personal_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null and exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.owner_id = auth.uid()
      and c.status = 'published' and c.deleted_at is null
  );
$$;

-- A personal root is physically disposable; a canonical root is still
-- retired, never hard-deleted.
create or replace function private.prevent_canonical_course_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.owner_id is null then
    raise exception 'Curso canônico não pode ser excluído fisicamente; arquive-o ou use deleted_at.'
      using errcode = '23514';
  end if;
  return old;
end;
$$;

-- Personal copies never enter the official catalog, and publishing/editing a
-- personal root never emits a global catalog-publication signal.
create or replace function private.ensure_official_course_collection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
  if new.owner_id is null and new.status = 'published' and new.deleted_at is null then
    if not exists (
      select 1 from public.catalog_collection_courses item
      where item.course_id = new.id and item.deleted_at is null
    ) then
      insert into public.catalog_collection_courses(collection_id, course_id, position)
      values(v_collection_id, new.id, 0);
    end if;
  else
    delete from public.catalog_collection_courses where course_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists courses_ensure_official_collection on public.courses;
create trigger courses_ensure_official_collection
after insert or update of status, deleted_at, contract_key, owner_id on public.courses
for each row execute function private.ensure_official_course_collection();

create or replace function private.capture_catalog_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.owner_id is not null or new.owner_id is not null then
    return new;
  end if;
  if old.status = 'published' and old.deleted_at is null
     and (new.status <> 'published' or new.deleted_at is not null) then
    delete from public.user_course_selections selection
      where selection.course_id = new.id;
  elsif new.status = 'published' and new.deleted_at is null
     and (old.content_hash is distinct from new.content_hash
          or old.publication_seq is distinct from new.publication_seq
          or old.status is distinct from new.status
          or old.deleted_at is distinct from new.deleted_at) then
    perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));
    insert into private.sync_changes(
      audience_user_id, course_id, entity_type, entity_id, operation
    ) values (null, new.id, 'coursePublication', new.id, 'publish');
  end if;
  return new;
end;
$$;

-- The map is private, transient per transaction and empty after a successful
-- fork.  It avoids permanent per-row lineage columns.
create unlogged table private.personal_course_clone_map (
  clone_id uuid not null,
  table_name text not null,
  source_id uuid not null,
  target_id uuid not null,
  primary key(clone_id, table_name, source_id),
  unique(clone_id, table_name, target_id)
);

create or replace function private.personal_course_store_names()
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select array[
    'courses','modules','lessons','guides','guideItems','topics','topicStatements',
    'microsequences','dependencies','microsequenceStatements','cards','blocks','options',
    'nodes','flowNodes','flowCases','flowPractices','flowPracticeEntries',
    'flowPracticeOptions','flowPracticeVariants','flowShapeOptions','edges','matrixItems',
    'cells','points','lines','highlights','cardSources','cardTopics'
  ]::text[];
$$;

create or replace function private.clone_personal_course_tree(
  p_clone_id uuid,
  p_source_course_id uuid,
  p_target_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_table_name text;
  v_table regclass;
  v_columns text;
  v_expressions text;
  v_tables constant text[] := array[
    'modules','lessons','course_guides','guide_items','lesson_topics','topic_statements',
    'microsequences','microsequence_dependencies','microsequence_statements','cards',
    'card_blocks','block_options','block_nodes','flow_nodes','flow_cases','flow_practices',
    'node_practices','node_practice_items','block_edges','block_matrix_items','block_cells',
    'block_points','block_lines','block_highlights','card_refs'
  ];
begin
  if p_clone_id is null or p_source_course_id is null or p_target_course_id is null
     or p_source_course_id = p_target_course_id then
    raise exception 'Identidade inválida para cópia pessoal.' using errcode = '22023';
  end if;
  set constraints all deferred;

  foreach v_table_name in array v_tables loop
    v_table := ('public.' || v_table_name)::regclass;
    execute format(
      'insert into private.personal_course_clone_map(clone_id,table_name,source_id,target_id) '
      'select $1,%L,id,gen_random_uuid() from %s where course_id=$2',
      v_table_name, v_table
    ) using p_clone_id, p_source_course_id;
  end loop;

  foreach v_table_name in array v_tables loop
    v_table := ('public.' || v_table_name)::regclass;
    select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
      into v_columns
    from pg_attribute attribute
    where attribute.attrelid = v_table and attribute.attnum > 0
      and not attribute.attisdropped and attribute.attgenerated = '';

    select string_agg(
      case
        when attribute.attname = 'id' then format(
          '(select map.target_id from private.personal_course_clone_map map '
          'where map.clone_id=$1 and map.table_name=%L and map.source_id=source.id)',
          v_table_name
        )
        when attribute.attname = 'course_id' then '$2'
        when v_table_name = 'course_guides' and attribute.attname = 'owner_id' then
          '(case source.owner_type '
          'when ''module'' then (select map.target_id from private.personal_course_clone_map map '
          'where map.clone_id=$1 and map.table_name=''modules'' and map.source_id=source.owner_id) '
          'when ''lesson'' then (select map.target_id from private.personal_course_clone_map map '
          'where map.clone_id=$1 and map.table_name=''lessons'' and map.source_id=source.owner_id) '
          'else null end)'
        when v_table_name in ('microsequence_dependencies','cards')
             and attribute.attname = 'lesson_id' then
          '(select map.target_id from private.personal_course_clone_map map '
          'where map.clone_id=$1 and map.table_name=''lessons'' and map.source_id=source.lesson_id)'
        when foreign_key.referenced_table is not null then format(
          '(select map.target_id from private.personal_course_clone_map map '
          'where map.clone_id=$1 and map.table_name=%L and map.source_id=source.%I)',
          foreign_key.referenced_table, attribute.attname
        )
        else format('source.%I', attribute.attname)
      end,
      ', ' order by attribute.attnum
    ) into v_expressions
    from pg_attribute attribute
    left join lateral (
      select referenced.relname as referenced_table
      from pg_constraint constraint_row
      join lateral unnest(constraint_row.conkey) with ordinality source_key(attnum, n) on true
      join lateral unnest(constraint_row.confkey) with ordinality target_key(attnum, n)
        on target_key.n = source_key.n
      join pg_class referenced on referenced.oid = constraint_row.confrelid
      join pg_namespace referenced_schema on referenced_schema.oid = referenced.relnamespace
      join pg_attribute referenced_attribute
        on referenced_attribute.attrelid = constraint_row.confrelid
       and referenced_attribute.attnum = target_key.attnum
      where constraint_row.contype = 'f' and constraint_row.conrelid = v_table
        and source_key.attnum = attribute.attnum
        and referenced_schema.nspname = 'public'
        and referenced_attribute.attname = 'id'
        and referenced.relname = any(v_tables)
      limit 1
    ) foreign_key on true
    where attribute.attrelid = v_table and attribute.attnum > 0
      and not attribute.attisdropped and attribute.attgenerated = '';

    execute format(
      'insert into %s(%s) select %s from %s source where source.course_id=$3',
      v_table, v_columns, v_expressions, v_table
    ) using p_clone_id, p_target_course_id, p_source_course_id;
  end loop;

end;
$$;

create or replace function public.create_personal_course(
  p_contract_key text,
  p_title text,
  p_goal text,
  p_contract_scope text,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_existing private.sync_idempotency%rowtype;
  v_course_id uuid := gen_random_uuid();
  v_selection_id uuid := gen_random_uuid();
  v_contract_key text := nullif(btrim(p_contract_key), '');
  v_sequence bigint;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  if v_contract_key is null or nullif(btrim(p_title),'') is null
     or nullif(btrim(p_goal),'') is null or p_mutation_id is null then
    raise exception 'Dados obrigatórios do curso pessoal ausentes.' using errcode='22023';
  end if;
  if p_contract_scope is not null and nullif(btrim(p_contract_scope),'') is null then
    raise exception 'Escopo contratual vazio.' using errcode='22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','create','contractKey',v_contract_key,'title',p_title,
    'goal',p_goal,'contractScope',p_contract_scope
  )::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'personal-course-create:' || v_user_id::text || ':' || p_mutation_id::text, 0
  ));
  select * into v_existing from private.sync_idempotency
    where user_id=v_user_id and mutation_id=p_mutation_id;
  if found then
    if v_existing.operation <> 'create' or v_existing.request_hash <> v_hash then
      raise exception 'mutationId reutilizado com operação incompatível.' using errcode='23514';
    end if;
    select s.id into v_selection_id from public.user_course_selections s
      join public.courses c on c.id=s.course_id
      where s.user_id=v_user_id and c.id=v_existing.entity_id and c.owner_id=v_user_id;
    return jsonb_build_object(
      'status','applied','mutationId',p_mutation_id,'idempotent',true,
      'courseId',v_existing.entity_id,'selectionId',v_selection_id
    );
  end if;
  if exists(select 1 from public.courses c
    where c.contract_key=v_contract_key and c.owner_id is null and c.deleted_at is null) then
    raise exception 'contractKey já pertence a um curso oficial.' using errcode='23514';
  end if;

  insert into public.courses(
    id,owner_id,source_course_id,status,contract_key,title,goal,
    contract_scope,publication_seq,content_hash,project_id,position
  ) values(
    v_course_id,v_user_id,null,'published',v_contract_key,p_title,p_goal,
    p_contract_scope,0,v_hash,gen_random_uuid(),
    coalesce((select max(c.position)+1 from public.courses c where c.owner_id=v_user_id),0)
  );
  insert into public.user_course_selections(id,user_id,course_id,position)
  values(
    v_selection_id,v_user_id,v_course_id,
    coalesce((select max(s.position)+1 from public.user_course_selections s where s.user_id=v_user_id),0)
  );
  select max(sequence) into v_sequence from private.sync_changes
    where audience_user_id=v_user_id and entity_type='courseSelections' and entity_id=v_selection_id;
  insert into private.sync_idempotency(
    user_id,mutation_id,request_hash,entity_type,entity_id,operation,applied_sequence
  ) values(v_user_id,p_mutation_id,v_hash,'courses',v_course_id,'create',v_sequence);
  return jsonb_build_object(
    'status','applied','mutationId',p_mutation_id,'idempotent',false,
    'courseId',v_course_id,'selectionId',v_selection_id,'contractKey',v_contract_key
  );
end;
$$;

create or replace function public.fork_catalog_course_for_editing(
  p_source_course_id uuid,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
set statement_timeout = '60s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_existing private.sync_idempotency%rowtype;
  v_source public.courses%rowtype;
  v_source_selection public.user_course_selections%rowtype;
  v_target public.courses%rowtype;
  v_target_selection_id uuid;
  v_target_course_id uuid := gen_random_uuid();
  v_clone_id uuid := gen_random_uuid();
  v_sequence bigint;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  if p_source_course_id is null or p_mutation_id is null then
    raise exception 'sourceCourseId e mutationId são obrigatórios.' using errcode='22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(
    'fork:' || p_source_course_id::text, 'UTF8'
  ),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'personal-course-fork:' || v_user_id::text || ':' || p_source_course_id::text, 0
  ));
  select * into v_existing from private.sync_idempotency
    where user_id=v_user_id and mutation_id=p_mutation_id;
  if found then
    if v_existing.operation <> 'fork' or v_existing.request_hash <> v_hash then
      raise exception 'mutationId reutilizado com operação incompatível.' using errcode='23514';
    end if;
    select s.id into v_target_selection_id from public.user_course_selections s
      join public.courses c on c.id=s.course_id
      where s.user_id=v_user_id and c.id=v_existing.entity_id and c.owner_id=v_user_id;
    return jsonb_build_object(
      'status','applied','mutationId',p_mutation_id,'idempotent',true,
      'sourceCourseId',p_source_course_id,'courseId',v_existing.entity_id,
      'selectionId',v_target_selection_id,'graphAvailable',v_target_selection_id is not null
    );
  end if;

  select * into v_target from public.courses c
    where c.owner_id=v_user_id and c.source_course_id=p_source_course_id
      and c.deleted_at is null for update;
  if found then
    select id into v_target_selection_id from public.user_course_selections
      where user_id=v_user_id and course_id=v_target.id;
    insert into private.sync_idempotency(
      user_id,mutation_id,request_hash,entity_type,entity_id,operation
    ) values(v_user_id,p_mutation_id,v_hash,'courses',v_target.id,'fork');
    return jsonb_build_object(
      'status','applied','mutationId',p_mutation_id,'idempotent',true,
      'sourceCourseId',p_source_course_id,'courseId',v_target.id,
      'selectionId',v_target_selection_id,'graphAvailable',v_target_selection_id is not null
    );
  end if;

  select * into v_source from public.courses c
  where c.id=p_source_course_id and c.owner_id is null
    and c.status='published' and c.deleted_at is null
  for update;
  if not found then
    raise exception 'Curso oficial selecionado não encontrado.' using errcode='42501';
  end if;
  if exists(select 1 from public.courses c
    where c.owner_id=v_user_id and c.contract_key=v_source.contract_key
      and c.deleted_at is null and c.source_course_id is distinct from p_source_course_id) then
    raise exception 'contractKey já pertence a outro curso pessoal.' using errcode='23514';
  end if;
  select * into v_source_selection from public.user_course_selections s
  where s.course_id=p_source_course_id and s.user_id=v_user_id
  for update;
  if not found then
    raise exception 'Curso oficial selecionado não encontrado.' using errcode='42501';
  end if;

  insert into public.courses(
    id,owner_id,source_course_id,status,contract_key,title,goal,contract_scope,
    publication_seq,content_hash,project_id,position
  ) values(
    v_target_course_id,v_user_id,p_source_course_id,'published',
    v_source.contract_key,
    v_source.title,v_source.goal,v_source.contract_scope,0,v_source.content_hash,
    gen_random_uuid(),v_source.position
  ) returning * into v_target;

  perform set_config('aralearn.suppress_sync_changes','on',true);
  perform private.clone_personal_course_tree(
    v_clone_id,p_source_course_id,v_target_course_id
  );
  perform set_config('aralearn.suppress_sync_changes','off',true);

  -- Keep the selection UUID stable.  Besides preserving trails, this lets an
  -- offline device deliver progress created immediately before the fork.
  v_target_selection_id:=v_source_selection.id;
  update public.user_course_selections
    set course_id=v_target_course_id,updated_at=now()
    where id=v_target_selection_id and user_id=v_user_id;

  update public.lesson_progress progress set
    selection_id=v_target_selection_id,
    course_id=v_target_course_id,
    lesson_id=map.target_id
  from private.personal_course_clone_map map
  where progress.selection_id=v_source_selection.id
    and map.clone_id=v_clone_id and map.table_name='lessons'
    and map.source_id=progress.lesson_id;

  update public.card_progress progress set
    selection_id=v_target_selection_id,
    course_id=v_target_course_id,
    card_id=map.target_id
  from private.personal_course_clone_map map
  where progress.selection_id=v_source_selection.id
    and map.clone_id=v_clone_id and map.table_name='cards'
    and map.source_id=progress.card_id;

  update public.card_comments comment_row set
    selection_id=v_target_selection_id,
    course_id=v_target_course_id,
    card_id=map.target_id
  from private.personal_course_clone_map map
  where comment_row.selection_id=v_source_selection.id
    and map.clone_id=v_clone_id and map.table_name='cards'
    and map.source_id=comment_row.card_id;

  delete from private.personal_course_clone_map where clone_id=v_clone_id;

  select max(sequence) into v_sequence from private.sync_changes
    where audience_user_id=v_user_id and entity_type='courseSelections'
      and entity_id=v_target_selection_id;
  insert into private.sync_idempotency(
    user_id,mutation_id,request_hash,entity_type,entity_id,operation,applied_sequence
  ) values(v_user_id,p_mutation_id,v_hash,'courses',v_target_course_id,'fork',v_sequence);
  return jsonb_build_object(
    'status','applied','mutationId',p_mutation_id,'idempotent',false,
    'sourceCourseId',p_source_course_id,'courseId',v_target_course_id,
    'selectionId',v_target_selection_id,'graphAvailable',true
  );
end;
$$;

-- Selection metadata carries both the selected root and its stable catalog
-- identity.  The app can therefore distinguish a shared official tree from a
-- private copy-on-write tree without per-child lineage columns.
create or replace function private.selection_row(p_selection_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.jsonb_to_camel(to_jsonb(s)) || jsonb_build_object(
    'publicationSeq', c.publication_seq,
    'contentHash', c.content_hash,
    'title', c.title,
    'goal', c.goal,
    'contractKey', c.contract_key,
    'kind', case when c.owner_id is null then 'official' else 'personal' end,
    'ownerId', c.owner_id,
    'sourceCourseId', c.source_course_id,
    'catalogCourseId', coalesce(c.source_course_id,c.id)
  )
  from public.user_course_selections s
  join public.courses c on c.id=s.course_id
  where s.id=p_selection_id;
$$;

create or replace function public.list_catalog_collections(p_query text default '')
returns table(
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
  is_selected boolean,
  selection_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user_id uuid:=auth.uid(); v_query text:=btrim(coalesce(p_query,''));
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode='42501';
  end if;
  return query
  select collection.id,collection.contract_key,collection.title,collection.description,
    collection.position,course.id,course.contract_key,course.title,course.goal,
    course.publication_seq,course.content_hash,
    (select count(*) from public.modules m where m.course_id=course.id),
    (select count(*) from public.lessons l where l.course_id=course.id),
    selection.id is not null,selection.id
  from public.catalog_collections collection
  join public.catalog_collection_courses item
    on item.collection_id=collection.id and item.deleted_at is null
  join public.courses course
    on course.id=item.course_id and course.owner_id is null
    and course.status='published' and course.deleted_at is null
  left join lateral (
    select selected.id
    from public.user_course_selections selected
    join public.courses selected_course on selected_course.id=selected.course_id
    where selected.user_id=v_user_id
      and selected_course.deleted_at is null
      and (selected_course.id=course.id or selected_course.source_course_id=course.id)
    order by (selected_course.source_course_id=course.id) desc,selected.created_at,selected.id
    limit 1
  ) selection on true
  where collection.is_published and collection.deleted_at is null
    and (
      v_query='' or collection.title ilike '%'||v_query||'%'
      or collection.description ilike '%'||v_query||'%'
      or course.title ilike '%'||v_query||'%'
      or course.goal ilike '%'||v_query||'%'
    )
  order by collection.position,collection.title,item.position,course.title,course.id;
end;
$$;

drop function public.list_user_course_summaries();
create function public.list_user_course_summaries()
returns table(
  selection_id uuid,
  course_id uuid,
  catalog_course_id uuid,
  source_course_id uuid,
  kind text,
  contract_key text,
  title text,
  goal text,
  "position" integer,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode='42501';
  end if;
  return query
  select s.id,c.id,coalesce(c.source_course_id,c.id),c.source_course_id,
    case when c.owner_id is null then 'official' else 'personal' end,
    c.contract_key,c.title,c.goal,s.position,
    c.publication_seq,c.content_hash,
    (select count(*) from public.modules m where m.course_id=c.id),
    (select count(*) from public.lessons l where l.course_id=c.id),
    greatest(
      (select max(lp.last_activity_at) from public.lesson_progress lp where lp.selection_id=s.id),
      (select max(cp.last_activity_at) from public.card_progress cp where cp.selection_id=s.id)
    )
  from public.user_course_selections s
  join public.courses c on c.id=s.course_id
  where s.user_id=v_user_id and c.status='published' and c.deleted_at is null
  order by s.position,s.created_at,s.id;
end;
$$;

create or replace function public.get_selected_course_graph(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '55s'
as $$
declare
  v_user_id uuid:=auth.uid();
  v_course public.courses%rowtype;
  v_root jsonb;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  select c.* into v_course from public.courses c
  join public.user_course_selections s on s.course_id=c.id and s.user_id=v_user_id
  where c.id=p_course_id and c.status='published' and c.deleted_at is null;
  if not found then
    raise exception 'Curso não está selecionado nesta conta.' using errcode='42501';
  end if;
  v_root:=private.local_row('courses',to_jsonb(v_course))-array['createdAt','updatedAt','deletedAt'];
  if v_course.owner_id is null then
    v_root:=v_root-array['ownerId','sourceCourseId'];
  end if;
  v_root:=v_root||jsonb_build_object(
    'kind',case when v_course.owner_id is null then 'official' else 'personal' end,
    'catalogCourseId',coalesce(v_course.source_course_id,v_course.id)
  );
  return jsonb_build_object(
    'courseId',v_course.id,'publicationSeq',v_course.publication_seq,
    'contentHash',v_course.content_hash,
    'graph',jsonb_build_object(
      'schemaVersion',1,
      'courses',jsonb_build_array(v_root),
      'modules',private.camel_active_rows('public.modules',p_course_id),
      'lessons',private.camel_active_rows('public.lessons',p_course_id),
      'guides',private.camel_active_rows('public.course_guides',p_course_id),
      'guideItems',private.camel_active_rows('public.guide_items',p_course_id),
      'topics',private.camel_active_rows('public.lesson_topics',p_course_id),
      'topicStatements',private.camel_active_rows('public.topic_statements',p_course_id),
      'microsequences',private.camel_active_rows('public.microsequences',p_course_id),
      'dependencies',private.camel_active_rows('public.microsequence_dependencies',p_course_id),
      'microsequenceStatements',private.camel_active_rows('public.microsequence_statements',p_course_id),
      'cards',private.camel_active_rows('public.cards',p_course_id),
      'blocks',private.camel_active_rows('public.card_blocks',p_course_id),
      'options',private.camel_active_rows('public.block_options',p_course_id),
      'nodes',private.camel_active_rows('public.block_nodes',p_course_id),
      'flowNodes',private.camel_active_rows('public.flow_nodes',p_course_id),
      'flowCases',private.camel_active_rows('public.flow_cases',p_course_id),
      'flowPractices',private.camel_active_rows('public.flow_practices',p_course_id),
      'flowPracticeEntries',private.camel_active_rows('public.node_practices',p_course_id),
      'flowPracticeOptions',private.camel_active_rows('public.node_practice_items',p_course_id,'flowPracticeOptions'),
      'flowPracticeVariants',private.camel_active_rows('public.node_practice_items',p_course_id,'flowPracticeVariants'),
      'flowShapeOptions',private.camel_active_rows('public.node_practice_items',p_course_id,'flowShapeOptions'),
      'edges',private.camel_active_rows('public.block_edges',p_course_id),
      'matrixItems',private.camel_active_rows('public.block_matrix_items',p_course_id),
      'cells',private.camel_active_rows('public.block_cells',p_course_id),
      'points',private.camel_active_rows('public.block_points',p_course_id),
      'lines',private.camel_active_rows('public.block_lines',p_course_id),
      'highlights',private.camel_active_rows('public.block_highlights',p_course_id),
      'cardSources',private.camel_active_rows('public.card_refs',p_course_id,'cardSources'),
      'cardTopics',private.camel_active_rows('public.card_refs',p_course_id,'cardTopics')
    )
  );
end;
$$;

create or replace function public.bootstrap_replica(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid:=auth.uid(); v_high_water bigint; v_snapshot jsonb; v_selected jsonb;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order',0));
  select greatest(
    (select compacted_through_sequence from private.sync_retention_policy where singleton),
    coalesce(max(sequence),0)
  ) into v_high_water from private.sync_changes;
  insert into private.sync_devices(id,user_id,last_pulled_sequence,last_seen_at,inactive_at)
  values(p_device_id,v_user_id,v_high_water,now(),null)
  on conflict(user_id,id) do update set
    last_pulled_sequence=excluded.last_pulled_sequence,last_seen_at=now(),inactive_at=null;
  select jsonb_build_object(
    'courseSelections',coalesce((select jsonb_agg(private.selection_row(s.id) order by s.position,s.id)
      from public.user_course_selections s join public.courses c on c.id=s.course_id
      where s.user_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb),
    'lessonProgress',coalesce((select jsonb_agg(private.local_row('lessonProgress',to_jsonb(t)) order by t.id)
      from public.lesson_progress t
      join public.user_course_selections s on s.id=t.selection_id and s.user_id=t.user_id
      join public.courses c on c.id=s.course_id
      where t.user_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb),
    'cardProgress',coalesce((select jsonb_agg(private.local_row('cardProgress',to_jsonb(t)) order by t.id)
      from public.card_progress t
      join public.user_course_selections s on s.id=t.selection_id and s.user_id=t.user_id
      join public.courses c on c.id=s.course_id
      where t.user_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb),
    'comments',coalesce((select jsonb_agg(private.local_row('comments',to_jsonb(t)) order by t.id)
      from public.card_comments t
      join public.user_course_selections s on s.id=t.selection_id and s.user_id=t.user_id
      join public.courses c on c.id=s.course_id
      where t.user_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb),
    'studyPaths',coalesce((select jsonb_agg(private.jsonb_to_camel(to_jsonb(t)) order by t.position,t.id)
      from public.study_paths t where t.owner_id=v_user_id),'[]'::jsonb),
    'studyPathCourses',coalesce((select jsonb_agg(
        private.jsonb_to_camel(to_jsonb(t))||jsonb_build_object('courseId',s.course_id)
        order by t.position,t.id)
      from public.study_path_courses t join public.user_course_selections s on s.id=t.selection_id
      join public.courses c on c.id=s.course_id
      where t.owner_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb)
  ) into v_snapshot;
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId',c.id,
    'catalogCourseId',coalesce(c.source_course_id,c.id),
    'sourceCourseId',c.source_course_id,
    'kind',case when c.owner_id is null then 'official' else 'personal' end,
    'publicationSeq',c.publication_seq,
    'contentHash',c.content_hash
  ) order by s.position,s.id),'[]'::jsonb) into v_selected
  from public.user_course_selections s join public.courses c on c.id=s.course_id
  where s.user_id=v_user_id and c.status='published' and c.deleted_at is null;
  return jsonb_build_object(
    'snapshot',v_snapshot,'selectedCourses',v_selected,'highWaterSequence',v_high_water
  );
end;
$$;

-- Keep the lean state synchronizer intact and wrap it with personal-tree LWW.
alter function public.apply_sync_batch(uuid,jsonb) rename to apply_personal_state_sync_batch;
alter function public.apply_personal_state_sync_batch(uuid,jsonb) set schema private;

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
as $$
declare
  v_row jsonb;
  v_table regclass;
  v_table_name text;
begin
  if p_entity_type = 'courseSelections' then
    select private.selection_row(id) into v_row from public.user_course_selections
      where id=p_entity_id and user_id=p_user_id;
  elsif p_entity_type = 'lessonProgress' then
    select private.local_row('lessonProgress',to_jsonb(t)) into v_row
      from public.lesson_progress t where t.id=p_entity_id and t.user_id=p_user_id;
  elsif p_entity_type = 'cardProgress' then
    select private.local_row('cardProgress',to_jsonb(t)) into v_row
      from public.card_progress t where t.id=p_entity_id and t.user_id=p_user_id;
  elsif p_entity_type = 'comments' then
    select private.local_row('comments',to_jsonb(t)) into v_row
      from public.card_comments t where t.id=p_entity_id and t.user_id=p_user_id;
  elsif p_entity_type = 'studyPaths' then
    select private.jsonb_to_camel(to_jsonb(t)) into v_row
      from public.study_paths t where t.id=p_entity_id and t.owner_id=p_user_id;
  elsif p_entity_type = 'studyPathCourses' then
    select private.jsonb_to_camel(to_jsonb(t)) || jsonb_build_object('courseId',s.course_id)
      into v_row
    from public.study_path_courses t
    join public.user_course_selections s on s.id=t.selection_id
    where t.id=p_entity_id and t.owner_id=p_user_id;
  elsif p_entity_type = 'courses' then
    select private.local_row('courses',to_jsonb(c)) into v_row
      from public.courses c where c.id=p_entity_id and c.owner_id=p_user_id
        and c.deleted_at is null;
  elsif p_entity_type = any(private.personal_course_store_names()) then
    v_table := private.table_for_store(p_entity_type);
    if v_table is not null then
      select c.relname into v_table_name from pg_class c where c.oid=v_table;
      execute format(
        'select private.local_row($1,to_jsonb(row_value)) from %s row_value '
        'join public.courses course on course.id=row_value.course_id '
        'where row_value.id=$2 and course.owner_id=$3 '
        'and private.store_name(%L,to_jsonb(row_value))=$1',
        v_table, v_table_name
      ) into v_row using p_entity_type,p_entity_id,p_user_id;
    end if;
  end if;
  return v_row;
end;
$$;

create or replace function private.personal_tree_payload_key_allowed(
  p_store_name text,
  p_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare v_table regclass := private.table_for_store(p_store_name);
begin
  return v_table is not null and (
    exists(select 1 from pg_attribute a where a.attrelid=v_table and a.attnum>0
      and not a.attisdropped and a.attname=p_key)
    or p_key=any(array[
      'revision','cards_revision','identity_key','source_entity_id',
      'created_at','updated_at','deleted_at','project_id'
    ])
    or (p_store_name='guides' and p_key in ('owner_type','owner_id'))
    or (p_store_name='guideItems' and p_key='item_type')
    or (p_store_name='topics' and p_key='topic_kind')
    or (p_store_name in ('topicStatements','microsequenceStatements') and p_key='statement_type')
    or (p_store_name='cards' and p_key in ('card_kind','after'))
    or (p_store_name='blocks' and p_key in ('region','value','scale_k'))
    or (p_store_name='options' and p_key='text')
    or (p_store_name='flowPractices' and p_key in ('owner_type','owner_id'))
    or (p_store_name='flowShapeOptions' and p_key='practice_id')
    or (p_store_name='edges' and p_key='edge_scope')
    or (p_store_name='matrixItems' and p_key='is_sequence')
    or (p_store_name='points' and p_key='point_role')
    or (p_store_name='lines' and p_key='line_role')
    or (p_store_name='highlights' and p_key in ('selection_type','value'))
    or (p_store_name='cardTopics' and p_key='topic_contract_key')
  );
end;
$$;

create or replace function private.apply_personal_tree_sync_mutation(
  p_user_id uuid,
  p_device_id uuid,
  p_mutation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_mutation_id uuid := private.try_uuid(p_mutation->>'mutationId');
  v_entity_type text := p_mutation->>'entityType';
  v_entity_id uuid := private.try_uuid(p_mutation->>'entityId');
  v_course_id uuid := private.try_uuid(p_mutation->>'courseId');
  v_client_sequence bigint := private.try_bigint(p_mutation->>'sequence',0);
  v_requested_operation text := lower(coalesce(p_mutation->>'operation',''));
  v_operation text;
  v_payload jsonb := coalesce(p_mutation->'payload','{}'::jsonb);
  v_changed jsonb := coalesce(p_mutation->'changedFields','[]'::jsonb);
  v_hash text := encode(extensions.digest(convert_to(p_mutation::text,'UTF8'),'sha256'),'hex');
  v_existing private.sync_idempotency%rowtype;
  v_table regclass := private.table_for_store(v_entity_type);
  v_current_course_id uuid;
  v_exists boolean := false;
  v_selected_payload jsonb;
  v_snake_payload jsonb;
  v_columns text;
  v_expressions text;
  v_assignments text;
  v_returned jsonb;
  v_sequence bigint;
  v_device_processed bigint;
begin
  if p_user_id is null or p_device_id is null or v_mutation_id is null
     or v_entity_id is null or v_client_sequence<=0
     or not(v_entity_type=any(private.personal_course_store_names()))
     or v_table is null or v_requested_operation not in ('insert','update','upsert','delete')
     or jsonb_typeof(v_payload)<>'object' or jsonb_typeof(v_changed)<>'array'
     or exists(select 1 from jsonb_array_elements(v_changed) f where jsonb_typeof(f)<>'string') then
    raise exception 'Envelope de mutação de curso pessoal inválido.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'sync-mutation:'||p_user_id::text||':'||v_mutation_id::text,0
  ));
  select * into v_existing from private.sync_idempotency
    where user_id=p_user_id and mutation_id=v_mutation_id;
  if found then
    if v_existing.request_hash<>v_hash then
      raise exception 'mutationId reutilizado com payload incompatível.' using errcode='23514';
    end if;
    return jsonb_build_object(
      'status',v_existing.outcome,'mutationId',v_mutation_id,
      'entityType',v_entity_type,'entityId',v_entity_id,
      'operation',v_existing.operation,'idempotent',true,
      'row',private.current_personal_row(v_entity_type,v_entity_id,p_user_id),
      'code',v_existing.error_code,'message',v_existing.error_message
    );
  end if;

  select last_processed_mutation_sequence into v_device_processed
    from private.sync_devices where user_id=p_user_id and id=p_device_id for update;
  if v_client_sequence<=coalesce(v_device_processed,0) then
    return jsonb_build_object(
      'status','applied','mutationId',v_mutation_id,'entityType',v_entity_type,
      'entityId',v_entity_id,'operation',case when v_requested_operation='delete' then 'delete' else 'upsert' end,
      'idempotent',true,'deduplicatedByDeviceSequence',true,
      'row',private.current_personal_row(v_entity_type,v_entity_id,p_user_id)
    );
  end if;

  if exists(select 1 from jsonb_object_keys(v_payload) key_name
    where not private.personal_tree_payload_key_allowed(
      v_entity_type,private.snake_key(key_name)
    )) then
    raise exception 'Payload contém campo desconhecido para %.',v_entity_type using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements_text(v_changed) field_name
    where not(v_payload?field_name) and v_requested_operation in ('update','upsert')) then
    raise exception 'Payload patch diverge de changedFields.' using errcode='22023';
  end if;

  if v_entity_type='courses' then
    select true,id into v_exists,v_current_course_id from public.courses
      where id=v_entity_id and owner_id=p_user_id and deleted_at is null;
    v_course_id:=v_entity_id;
  else
    execute format('select true,course_id from %s where id=$1',v_table)
      into v_exists,v_current_course_id using v_entity_id;
    if v_exists and not exists(select 1 from public.courses c
      where c.id=v_current_course_id and c.owner_id=p_user_id and c.deleted_at is null) then
      raise exception 'Entidade de curso pessoal não autorizada.' using errcode='42501';
    end if;
    if v_exists then v_course_id:=v_current_course_id; end if;
  end if;
  if v_course_id is null or not exists(select 1 from public.courses c
    where c.id=v_course_id and c.owner_id=p_user_id and c.deleted_at is null) then
    raise exception 'Curso pessoal não autorizado.' using errcode='42501';
  end if;
  if v_entity_type='courses' and (v_requested_operation='delete' or not v_exists) then
    raise exception 'A raiz pessoal é criada/removida pelas RPCs de biblioteca.' using errcode='23514';
  end if;
  if v_exists and v_requested_operation in ('update','upsert') and exists(
    select 1 from jsonb_object_keys(v_payload) field_name
    where not exists(
      select 1 from jsonb_array_elements_text(v_changed) changed
      where changed=field_name
    )
  ) then
    raise exception 'Payload patch contém campo ausente de changedFields.' using errcode='22023';
  end if;

  if v_requested_operation='delete' then
    execute format('delete from %s where id=$1 and course_id=$2',v_table)
      using v_entity_id,v_course_id;
    v_operation:='delete';
  else
    v_operation:='upsert';
    if v_exists then
      if jsonb_array_length(v_changed)=0 then
        raise exception 'Update exige changedFields.' using errcode='22023';
      end if;
      select coalesce(jsonb_object_agg(entry.key,entry.value),'{}'::jsonb)
        into v_selected_payload
      from jsonb_each(v_payload) entry
      where exists(select 1 from jsonb_array_elements_text(v_changed) changed
        where changed=entry.key);
    else
      v_selected_payload:=v_payload;
    end if;
    v_snake_payload:=private.shape_store_payload(
      v_entity_type,private.jsonb_to_snake(v_selected_payload),
      case when v_exists then 'update' else 'insert' end
    );
    v_snake_payload:=v_snake_payload-array[
      'revision','cards_revision','identity_key','source_entity_id',
      'created_at','updated_at','deleted_at','project_id'
    ];
    if v_entity_type='courses' then
      v_snake_payload:=v_snake_payload-array[
        'id','course_id','owner_id','source_course_id','status',
        'publication_seq','content_hash'
      ];
      if exists(select 1 from jsonb_object_keys(v_snake_payload) key_name
        where key_name not in ('contract_key','title','goal','contract_scope','position')) then
        raise exception 'Campo imutável na raiz do curso pessoal.' using errcode='22023';
      end if;
    else
      v_snake_payload:=v_snake_payload-array['id','course_id'];
    end if;

    select string_agg(format('%I',a.attname),',' order by a.attnum),
      string_agg(format('populated.%I',a.attname),',' order by a.attnum),
      string_agg(format('%I=populated.%I',a.attname,a.attname),',' order by a.attnum)
      into v_columns,v_expressions,v_assignments
    from pg_attribute a
    where a.attrelid=v_table and a.attnum>0 and not a.attisdropped
      and a.attgenerated='' and v_snake_payload?a.attname;
    if v_columns is null then
      raise exception 'Mutação não contém campos persistíveis.' using errcode='22023';
    end if;
    if v_exists then
      execute format(
        'update %s target set %s from jsonb_populate_record(null::%s,$1) populated '
        'where target.id=$2 returning to_jsonb(target)',
        v_table,v_assignments,v_table
      ) into v_returned using v_snake_payload,v_entity_id;
    else
      v_snake_payload:=v_snake_payload||jsonb_build_object(
        'id',v_entity_id,'course_id',v_course_id
      );
      select string_agg(format('%I',a.attname),',' order by a.attnum),
        string_agg(format('populated.%I',a.attname),',' order by a.attnum)
        into v_columns,v_expressions
      from pg_attribute a
      where a.attrelid=v_table and a.attnum>0 and not a.attisdropped
        and a.attgenerated='' and v_snake_payload?a.attname;
      execute format(
        'insert into %s as inserted(%s) select %s from jsonb_populate_record(null::%s,$1) populated '
        'returning to_jsonb(inserted)',
        v_table,v_columns,v_expressions,v_table
      ) into v_returned using v_snake_payload;
    end if;
  end if;

  -- This is an opaque replica cache marker, not author-facing versioning.  It
  -- changes exactly when an accepted personal-tree mutation changes the graph,
  -- so a post-compaction bootstrap cannot retain a stale local snapshot.
  update public.courses set content_hash=v_hash where id=v_course_id;

  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order',0));
  insert into private.sync_changes(audience_user_id,course_id,entity_type,entity_id,operation)
  values(p_user_id,v_course_id,v_entity_type,v_entity_id,v_operation)
  returning sequence into v_sequence;
  insert into private.sync_idempotency(
    user_id,mutation_id,request_hash,entity_type,entity_id,operation,
    device_id,client_sequence,applied_sequence
  ) values(
    p_user_id,v_mutation_id,v_hash,v_entity_type,v_entity_id,v_operation,
    p_device_id,v_client_sequence,v_sequence
  );
  update private.sync_devices set
    last_processed_mutation_sequence=greatest(last_processed_mutation_sequence,v_client_sequence),
    last_seen_at=now(),inactive_at=null
  where user_id=p_user_id and id=p_device_id;
  return jsonb_build_object(
    'status','applied','mutationId',v_mutation_id,'entityType',v_entity_type,
    'entityId',v_entity_id,'operation',v_operation,'idempotent',false,
    'row',private.current_personal_row(v_entity_type,v_entity_id,p_user_id)
  );
end;
$$;

create or replace function private.remap_stale_personal_state_mutation(
  p_user_id uuid,
  p_mutation jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entity_type text:=p_mutation->>'entityType';
  v_source_course_id uuid:=private.try_uuid(p_mutation->>'courseId');
  v_target_course_id uuid;
  v_selection_id uuid;
  v_payload jsonb:=coalesce(p_mutation->'payload','{}'::jsonb);
  v_source_entity_id uuid;
  v_target_entity_id uuid;
  v_result jsonb:=p_mutation;
begin
  if p_user_id is null or v_source_course_id is null
     or v_entity_type not in ('lessonProgress','cardProgress','comments') then
    return p_mutation;
  end if;
  select c.id,s.id into v_target_course_id,v_selection_id
  from public.user_course_selections s
  join public.courses c on c.id=s.course_id
  where s.user_id=p_user_id and c.owner_id=p_user_id
    and c.source_course_id=v_source_course_id and c.deleted_at is null
  order by s.created_at,s.id limit 1;
  if v_target_course_id is null then return p_mutation; end if;

  v_result:=jsonb_set(v_result,'{courseId}',to_jsonb(v_target_course_id::text),true);
  if v_payload?'courseId' then
    v_payload:=jsonb_set(v_payload,'{courseId}',to_jsonb(v_target_course_id::text),true);
  end if;
  if v_payload?'selectionId' then
    v_payload:=jsonb_set(v_payload,'{selectionId}',to_jsonb(v_selection_id::text),true);
  end if;

  if v_entity_type='lessonProgress' and v_payload?'lessonId' then
    v_source_entity_id:=private.try_uuid(v_payload->>'lessonId');
    select target_lesson.id into v_target_entity_id
    from public.lessons source_lesson
    join public.modules source_module on source_module.id=source_lesson.module_id
    join public.modules target_module
      on target_module.course_id=v_target_course_id
     and target_module.contract_key=source_module.contract_key
    join public.lessons target_lesson
      on target_lesson.course_id=v_target_course_id
     and target_lesson.module_id=target_module.id
     and target_lesson.contract_key=source_lesson.contract_key
    where source_lesson.id=v_source_entity_id
      and source_lesson.course_id=v_source_course_id;
    if v_target_entity_id is null then
      raise exception 'Lição anterior ao fork não pôde ser remapeada.' using errcode='23503';
    end if;
    v_payload:=jsonb_set(v_payload,'{lessonId}',to_jsonb(v_target_entity_id::text),true);
  elsif v_entity_type in ('cardProgress','comments') and v_payload?'cardId' then
    v_source_entity_id:=private.try_uuid(v_payload->>'cardId');
    select target_card.id into v_target_entity_id
    from public.cards source_card
    join public.lessons source_lesson on source_lesson.id=source_card.lesson_id
    join public.modules source_module on source_module.id=source_lesson.module_id
    join public.modules target_module
      on target_module.course_id=v_target_course_id
     and target_module.contract_key=source_module.contract_key
    join public.lessons target_lesson
      on target_lesson.course_id=v_target_course_id
     and target_lesson.module_id=target_module.id
     and target_lesson.contract_key=source_lesson.contract_key
    join public.cards target_card
      on target_card.course_id=v_target_course_id
     and target_card.lesson_id=target_lesson.id
     and target_card.contract_key=source_card.contract_key
    where source_card.id=v_source_entity_id
      and source_card.course_id=v_source_course_id;
    if v_target_entity_id is null then
      raise exception 'Card anterior ao fork não pôde ser remapeado.' using errcode='23503';
    end if;
    v_payload:=jsonb_set(v_payload,'{cardId}',to_jsonb(v_target_entity_id::text),true);
  end if;
  return jsonb_set(v_result,'{payload}',v_payload,true);
end;
$$;

create or replace function public.apply_sync_batch(p_device_id uuid,p_mutations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid:=auth.uid();
  v_items jsonb:=case when jsonb_typeof(p_mutations)='array' then p_mutations else p_mutations->'mutations' end;
  v_mutation jsonb;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_code text;
  v_message text;
  v_mutation_id uuid;
  v_entity_id uuid;
  v_sequence bigint;
  v_hash text;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode='42501';
  end if;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)>500 then
    raise exception 'Lote de mutações inválido.' using errcode='22023';
  end if;
  insert into private.sync_devices(id,user_id,last_seen_at,inactive_at)
  values(p_device_id,v_user_id,now(),null)
  on conflict(user_id,id) do update set last_seen_at=now(),inactive_at=null;
  set constraints all deferred;
  for v_mutation in select value from jsonb_array_elements(v_items) loop
    if (v_mutation->>'entityType')=any(private.personal_course_store_names()) then
      begin
        v_result:=private.apply_personal_tree_sync_mutation(v_user_id,p_device_id,v_mutation);
        v_results:=v_results||jsonb_build_array(v_result);
      exception when others then
        get stacked diagnostics v_code=returned_sqlstate,v_message=message_text;
        if left(v_code,2) not in ('22','23') and v_code not in ('42501','P0002') then
          raise;
        end if;
        v_mutation_id:=private.try_uuid(v_mutation->>'mutationId');
        v_entity_id:=private.try_uuid(v_mutation->>'entityId');
        v_sequence:=private.try_bigint(v_mutation->>'sequence',0);
        v_hash:=encode(extensions.digest(convert_to(v_mutation::text,'UTF8'),'sha256'),'hex');
        if v_mutation_id is not null and v_sequence>0 then
          insert into private.sync_idempotency(
            user_id,mutation_id,request_hash,entity_type,entity_id,operation,
            device_id,client_sequence,outcome,error_code,error_message
          ) values(
            v_user_id,v_mutation_id,v_hash,coalesce(v_mutation->>'entityType','invalid'),v_entity_id,
            case when lower(v_mutation->>'operation')='delete' then 'delete' else 'upsert' end,
            p_device_id,v_sequence,'rejected',v_code,coalesce(v_message,'Mutação rejeitada.')
          ) on conflict do nothing;
          update private.sync_devices set
            last_processed_mutation_sequence=greatest(last_processed_mutation_sequence,v_sequence)
          where user_id=v_user_id and id=p_device_id;
        end if;
        v_results:=v_results||jsonb_build_array(jsonb_build_object(
          'status','rejected','mutationId',v_mutation->>'mutationId',
          'entityType',v_mutation->>'entityType','entityId',v_mutation->>'entityId',
          'code',v_code,'reason',private.sync_rejection_reason(v_code,v_message),
          'message',v_message
        ));
      end;
    else
      -- Preserve the exact envelope on a retry that was already committed
      -- before the official→personal fork.  Remapping first would change the
      -- request hash and turn a lost-response retry into an incompatible
      -- mutationId rejection.  New, still-unseen mutations are the only ones
      -- that need contractual remapping to the personal tree.
      if not exists(
        select 1 from private.sync_idempotency ledger
        where ledger.user_id=v_user_id
          and ledger.mutation_id=private.try_uuid(v_mutation->>'mutationId')
      ) then
        v_mutation:=private.remap_stale_personal_state_mutation(v_user_id,v_mutation);
      end if;
      v_result:=private.apply_personal_state_sync_batch(
        p_device_id,jsonb_build_array(v_mutation)
      );
      v_results:=v_results||coalesce(v_result->'results','[]'::jsonb);
    end if;
  end loop;
  return jsonb_build_object('status','applied','results',v_results);
end;
$$;

-- Selecting from the catalog is restricted to canonical roots.  Personal
-- roots are created only by the two explicit authoring RPCs above.
alter function public.select_catalog_course(uuid,uuid) rename to select_catalog_course_lean;
alter function public.select_catalog_course_lean(uuid,uuid) set schema private;

create or replace function public.select_catalog_course(p_course_id uuid,p_mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid:=auth.uid();
  v_hash text;
  v_ledger private.sync_idempotency%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_sequence bigint;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  if p_course_id is null or p_mutation_id is null then
    raise exception 'courseId e mutationId são obrigatórios.' using errcode='22023';
  end if;
  if not exists(select 1 from public.courses c where c.id=p_course_id
    and c.owner_id is null and c.status='published' and c.deleted_at is null) then
    raise exception 'Curso oficial publicado não encontrado.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'selection:'||v_user_id::text||':'||p_course_id::text,0
  ));
  select s.* into v_selection
  from public.user_course_selections s
  join public.courses c on c.id=s.course_id
  where s.user_id=v_user_id and c.source_course_id=p_course_id
    and c.owner_id=v_user_id and c.deleted_at is null
  order by s.created_at,s.id limit 1;
  if found then
    v_hash:=encode(extensions.digest(convert_to('select:'||p_course_id::text,'UTF8'),'sha256'),'hex');
    select * into v_ledger from private.sync_idempotency
      where user_id=v_user_id and mutation_id=p_mutation_id;
    if found then
      if v_ledger.request_hash<>v_hash or v_ledger.operation<>'select' then
        raise exception 'mutationId reutilizado com operação incompatível.' using errcode='23514';
      end if;
      return jsonb_build_object(
        'status','applied','mutationId',p_mutation_id,'idempotent',true,
        'selectionId',v_selection.id,'courseId',v_selection.course_id,
        'catalogCourseId',p_course_id,'row',private.selection_row(v_selection.id),
        'desiredSelected',true,'currentSelected',true,'superseded',false
      );
    end if;
    select max(sequence) into v_sequence from private.sync_changes
      where audience_user_id=v_user_id and entity_type='courseSelections'
        and entity_id=v_selection.id;
    insert into private.sync_idempotency(
      user_id,mutation_id,request_hash,entity_type,entity_id,operation,applied_sequence
    ) values(v_user_id,p_mutation_id,v_hash,'courseSelections',v_selection.id,'select',v_sequence);
    return jsonb_build_object(
      'status','applied','mutationId',p_mutation_id,'idempotent',false,
      'selectionId',v_selection.id,'courseId',v_selection.course_id,
      'catalogCourseId',p_course_id,'row',private.selection_row(v_selection.id),
      'desiredSelected',true,'currentSelected',true,'superseded',false
    );
  end if;
  return private.select_catalog_course_lean(p_course_id,p_mutation_id);
end;
$$;

create or replace function public.unselect_catalog_course(
  p_course_id uuid,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid:=auth.uid();
  v_hash text;
  v_ledger private.sync_idempotency%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_removed_course_id uuid;
  v_sequence bigint;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  if p_course_id is null or p_mutation_id is null then
    raise exception 'courseId e mutationId são obrigatórios.' using errcode='22023';
  end if;
  v_hash:=encode(extensions.digest(convert_to('unselect:'||p_course_id::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'selection:'||v_user_id::text||':'||p_course_id::text,0
  ));
  select s.* into v_selection
  from public.user_course_selections s
  join public.courses c on c.id=s.course_id
  where s.user_id=v_user_id
    and (c.id=p_course_id or c.source_course_id=p_course_id)
    and c.deleted_at is null
  order by (c.source_course_id=p_course_id) desc,s.created_at,s.id
  limit 1 for update of s;

  select * into v_ledger from private.sync_idempotency
    where user_id=v_user_id and mutation_id=p_mutation_id;
  if found then
    if v_ledger.request_hash<>v_hash or v_ledger.operation<>'unselect' then
      raise exception 'mutationId reutilizado com operação incompatível.' using errcode='23514';
    end if;
    return jsonb_build_object(
      'status','applied','mutationId',p_mutation_id,'idempotent',true,
      'courseId',p_course_id,'selectionId',v_ledger.entity_id,
      'desiredSelected',false,'currentSelected',v_selection.id is not null,
      'superseded',v_selection.id is not null,
      'row',private.selection_row(v_selection.id)
    );
  end if;
  if v_selection.id is null then
    insert into private.sync_idempotency(
      user_id,mutation_id,request_hash,entity_type,entity_id,operation,applied_sequence
    ) values(v_user_id,p_mutation_id,v_hash,'courseSelections',null,'unselect',null);
    return jsonb_build_object(
      'status','applied','mutationId',p_mutation_id,'idempotent',true,
      'courseId',p_course_id,'selectionId',null,
      'desiredSelected',false,'currentSelected',false,'superseded',false
    );
  end if;

  v_removed_course_id:=v_selection.course_id;
  perform set_config('aralearn.suppress_sync_changes','on',true);
  delete from public.user_course_selections where id=v_selection.id;
  perform set_config('aralearn.suppress_sync_changes','off',true);
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order',0));
  insert into private.sync_changes(audience_user_id,course_id,entity_type,entity_id,operation)
  values(v_user_id,v_removed_course_id,'courseSelections',v_selection.id,'delete')
  returning sequence into v_sequence;
  insert into private.sync_idempotency(
    user_id,mutation_id,request_hash,entity_type,entity_id,operation,applied_sequence
  ) values(v_user_id,p_mutation_id,v_hash,'courseSelections',v_selection.id,'unselect',v_sequence);
  return jsonb_build_object(
    'status','applied','mutationId',p_mutation_id,'idempotent',false,
    'courseId',p_course_id,'removedCourseId',v_removed_course_id,
    'selectionId',v_selection.id,'desiredSelected',false,
    'currentSelected',false,'superseded',false
  );
end;
$$;

create or replace function private.delete_unselected_personal_course()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if pg_trigger_depth()=1 then
    delete from public.courses c
    where c.id=old.course_id and c.owner_id=old.user_id
      and not exists(select 1 from public.user_course_selections s where s.course_id=c.id);
  end if;
  return old;
end;
$$;

drop trigger if exists user_course_selections_delete_personal_root on public.user_course_selections;
create trigger user_course_selections_delete_personal_root
after delete on public.user_course_selections
for each row execute function private.delete_unselected_personal_course();

-- The official importer resolves only canonical roots.  A user's private root
-- intentionally keeps the same public contract key and must never make that
-- administrative lookup ambiguous.
create or replace function public.begin_official_course_import(
  p_import_id uuid,
  p_course jsonb,
  p_source_hash text,
  p_expected_counts jsonb,
  p_publish boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
set statement_timeout='30s'
as $$
declare
  v_course_id uuid:=private.try_uuid(p_course->>'id');
  v_contract_key text:=nullif(btrim(p_course->>'contractKey'),'');
  v_existing private.official_catalog_imports%rowtype;
  v_live public.courses%rowtype;
begin
  if not public.is_app_admin() then
    raise exception 'Importação oficial exige administrador.' using errcode='42501';
  end if;
  if p_import_id is null or jsonb_typeof(p_course)<>'object' or v_course_id is null
     or v_contract_key is null or coalesce(p_source_hash,'')!~'^[0-9a-f]{64}$' then
    raise exception 'Identidade ou curso inválido para importação oficial.' using errcode='22023';
  end if;
  perform private.assert_official_import_manifest(p_expected_counts);
  perform pg_advisory_xact_lock(hashtextextended('aralearn-official-import-staging',0));
  perform pg_advisory_xact_lock(hashtextextended('official-import:'||v_contract_key,0));

  select * into v_existing from private.official_catalog_imports
    where import_id=p_import_id for update;
  if found then
    if v_existing.course_id<>v_course_id or v_existing.contract_key<>v_contract_key
       or v_existing.source_hash<>p_source_hash or v_existing.expected_counts<>p_expected_counts
       or v_existing.publish_requested<>p_publish then
      raise exception 'importId reutilizado com manifesto incompatível.' using errcode='23514';
    end if;
    return jsonb_build_object('status',v_existing.status,'importId',p_import_id,
      'courseId',v_course_id,'idempotent',true,'contentHash',v_existing.source_hash);
  end if;

  select * into v_existing from private.official_catalog_imports
    where contract_key=v_contract_key for update;
  if found and v_existing.status='published' and v_existing.source_hash=p_source_hash then
    return jsonb_build_object('status','published','importId',v_existing.import_id,
      'courseId',v_existing.course_id,'idempotent',true,'contentHash',v_existing.source_hash);
  end if;
  if found then
    delete from private.official_catalog_imports where import_id=v_existing.import_id;
  end if;

  select * into v_live from public.courses
  where contract_key=v_contract_key and owner_id is null and deleted_at is null
  for update;
  if found and v_live.id<>v_course_id then
    raise exception 'O UUID canônico do curso publicado não pode mudar.' using errcode='23514';
  end if;
  if found and v_live.status='published' and not coalesce(p_publish,false) then
    raise exception 'Draft não pode substituir uma publicação ativa.' using errcode='23514';
  end if;
  insert into private.official_catalog_imports(
    import_id,course_id,contract_key,course_payload,source_hash,expected_counts,publish_requested
  ) values(p_import_id,v_course_id,v_contract_key,p_course,p_source_hash,p_expected_counts,p_publish);
  return jsonb_build_object('status','staging','importId',p_import_id,
    'courseId',v_course_id,'idempotent',false);
end;
$$;

-- RLS remains defense in depth; direct table grants remain revoked.
do $$
declare v_table text;
begin
  drop policy if exists courses_select on public.courses;
  drop policy if exists courses_insert on public.courses;
  drop policy if exists courses_update on public.courses;
  drop policy if exists courses_delete on public.courses;
  create policy courses_select on public.courses for select to authenticated
    using(public.user_can_read_course(id) or public.is_app_admin());
  create policy courses_insert on public.courses for insert to authenticated
    with check(owner_id=auth.uid() or public.is_app_admin());
  create policy courses_update on public.courses for update to authenticated
    using(owner_id=auth.uid() or public.is_app_admin())
    with check(owner_id=auth.uid() or public.is_app_admin());
  create policy courses_delete on public.courses for delete to authenticated
    using(owner_id=auth.uid() or public.is_app_admin());

  foreach v_table in array array[
    'modules','lessons','course_guides','guide_items','lesson_topics','topic_statements',
    'microsequences','microsequence_dependencies','microsequence_statements','cards',
    'card_blocks','block_options','block_nodes','flow_nodes','flow_cases','flow_practices',
    'node_practices','node_practice_items','block_edges','block_matrix_items','block_cells',
    'block_points','block_lines','block_highlights','card_refs'
  ] loop
    execute format('drop policy if exists %I_select on public.%I',v_table,v_table);
    execute format('drop policy if exists %I_insert on public.%I',v_table,v_table);
    execute format('drop policy if exists %I_update on public.%I',v_table,v_table);
    execute format('drop policy if exists %I_delete on public.%I',v_table,v_table);
    execute format(
      'create policy %I_select on public.%I for select to authenticated '
      'using(public.user_can_read_course(course_id) or public.is_app_admin())',v_table,v_table
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated '
      'with check(public.user_can_edit_personal_course(course_id) or public.is_app_admin())',v_table,v_table
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated '
      'using(public.user_can_edit_personal_course(course_id) or public.is_app_admin()) '
      'with check(public.user_can_edit_personal_course(course_id) or public.is_app_admin())',v_table,v_table
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated '
      'using(public.user_can_edit_personal_course(course_id) or public.is_app_admin())',v_table,v_table
    );
  end loop;
end;
$$;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from public,anon,authenticated,service_role;
revoke all privileges on all functions in schema private from public,anon,authenticated,service_role;

grant execute on function public.list_catalog_collections(text) to authenticated;
grant execute on function public.list_user_course_summaries() to authenticated;
grant execute on function public.user_can_read_course(uuid) to authenticated;
grant execute on function public.user_can_edit_personal_course(uuid) to authenticated;
grant execute on function public.select_catalog_course(uuid,uuid) to authenticated;
grant execute on function public.unselect_catalog_course(uuid,uuid) to authenticated;
grant execute on function public.create_personal_course(text,text,text,text,uuid) to authenticated;
grant execute on function public.fork_catalog_course_for_editing(uuid,uuid) to authenticated;
grant execute on function public.get_selected_course_graph(uuid) to authenticated;
grant execute on function public.bootstrap_replica(uuid) to authenticated;
grant execute on function public.apply_sync_batch(uuid,jsonb) to authenticated;
grant execute on function public.pull_sync_changes(bigint,integer,uuid) to authenticated;
grant execute on function public.delete_own_account(text) to authenticated;

grant execute on function public.begin_official_course_import(uuid,jsonb,text,jsonb,boolean) to service_role;
grant execute on function public.apply_official_course_import_chunk(uuid,text,integer,jsonb) to service_role;
grant execute on function public.begin_official_course_import_flow(uuid) to service_role;
grant execute on function public.apply_official_course_import_flow_chunk(uuid,integer,jsonb,jsonb) to service_role;
grant execute on function public.finalize_official_course_import(uuid) to service_role;
grant execute on function public.sync_storage_diagnostics() to service_role;
grant execute on function public.compact_sync_history(boolean,timestamptz) to service_role;
grant execute on function public.cleanup_abandoned_official_imports(boolean,interval,timestamptz)
  to service_role;

comment on function public.fork_catalog_course_for_editing(uuid,uuid) is
  'Copy-on-write explícito: cria uma árvore pessoal independente com UUIDs novos e preserva seleção, trilha, progresso e comentários.';
comment on function public.create_personal_course(text,text,text,text,uuid) is
  'Cria raiz pessoal vazia e selecionada; linhas didáticas chegam depois por apply_sync_batch.';
comment on function public.apply_sync_batch(uuid,jsonb) is
  'Aplica estado pessoal e patches granulares da árvore pessoal por last-write-wins, sem revisão ou conflito autoral.';

commit;
