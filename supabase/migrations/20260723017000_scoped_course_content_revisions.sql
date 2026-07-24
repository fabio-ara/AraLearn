begin;

-- A árvore enxuta não mantém tombstones nas projeções didáticas. Cards são a
-- única exceção porque progresso e comentários precisam continuar ligados à
-- identidade estudada mesmo quando uma correção deixa de exibi-la.
alter table public.cards
  add column deleted_at timestamptz;

drop index public.cards_key_lean_uidx;
drop index public.cards_position_lean_uidx;

create unique index cards_key_lean_uidx
  on public.cards(lesson_id,contract_key)
  where deleted_at is null;
create unique index cards_position_lean_uidx
  on public.cards(microsequence_id,position)
  where deleted_at is null;
create index cards_active_microsequence_position_idx
  on public.cards(course_id,microsequence_id,position,id)
  where deleted_at is null;

-- Point authoring never writes into a live tree while the author is still
-- drafting.  The private revision keeps the formal source, its deterministic
-- compilation and the exact relational patch until one atomic application.
create table private.course_content_revisions (
  id uuid primary key,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  api_client_id uuid references private.authoring_api_clients(id) on delete restrict,
  target text not null,
  course_id uuid not null references public.courses(id) on delete cascade,
  microsequence_id uuid not null,
  focus_card_id uuid,
  base_content_hash text not null,
  base_publication_seq bigint not null,
  base_fragment_hash text not null,
  status text not null default 'open',
  authoring_fragment jsonb,
  authoring_fragment_hash text,
  compiled_fragment jsonb,
  compiled_fragment_hash text,
  relational_patch jsonb,
  scoped_diff jsonb,
  expected_content_hash text,
  validation_report jsonb,
  opened_at timestamptz not null default now(),
  patched_at timestamptz,
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint course_content_revisions_target check (target in ('catalog','private')),
  constraint course_content_revisions_status check (
    status in ('open','patched','applied','cancelled')
  ),
  constraint course_content_revisions_hashes check (
    base_content_hash ~ '^[0-9a-f]{64}$'
    and base_fragment_hash ~ '^[0-9a-f]{64}$'
    and (authoring_fragment_hash is null or authoring_fragment_hash ~ '^[0-9a-f]{64}$')
    and (compiled_fragment_hash is null or compiled_fragment_hash ~ '^[0-9a-f]{64}$')
    and (expected_content_hash is null or expected_content_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint course_content_revisions_publication_seq check (base_publication_seq >= 0),
  constraint course_content_revisions_patch_state check (
    (status = 'open' and authoring_fragment is null and compiled_fragment is null
      and relational_patch is null and scoped_diff is null
      and expected_content_hash is null)
    or
    (status in ('patched','applied') and jsonb_typeof(authoring_fragment) = 'object'
      and jsonb_typeof(compiled_fragment) = 'object'
      and jsonb_typeof(relational_patch) = 'object'
      and jsonb_typeof(scoped_diff) = 'object'
      and authoring_fragment_hash is not null
      and compiled_fragment_hash is not null
      and expected_content_hash is not null)
    or status = 'cancelled'
  ),
  constraint course_content_revisions_fragment_size check (
    authoring_fragment is null or pg_column_size(authoring_fragment) <= 524288
  ),
  constraint course_content_revisions_compiled_size check (
    compiled_fragment is null or pg_column_size(compiled_fragment) <= 524288
  ),
  constraint course_content_revisions_patch_size check (
    relational_patch is null or pg_column_size(relational_patch) <= 2097152
  ),
  constraint course_content_revisions_diff_size check (
    scoped_diff is null or pg_column_size(scoped_diff) <= 262144
  ),
  constraint course_content_revisions_validation_size check (
    validation_report is null or pg_column_size(validation_report) <= 262144
  ),
  constraint course_content_revisions_microsequence_fk foreign key(
    course_id,microsequence_id
  ) references public.microsequences(course_id,id) on delete cascade,
  constraint course_content_revisions_focus_card_fk foreign key(focus_card_id)
    references public.cards(id) on delete set null
);

create index course_content_revisions_actor_updated_idx
  on private.course_content_revisions(actor_user_id,updated_at desc,id);
create index course_content_revisions_course_status_idx
  on private.course_content_revisions(course_id,status,updated_at desc,id);
create index course_content_revisions_terminal_cleanup_idx
  on private.course_content_revisions(updated_at,id)
  where status in ('applied','cancelled');
create index course_content_revisions_abandoned_cleanup_idx
  on private.course_content_revisions(updated_at,id)
  where status in ('open','patched');

create table private.course_content_revision_receipts (
  revision_id uuid not null
    references private.course_content_revisions(id) on delete cascade,
  operation text not null,
  request_id text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(revision_id,operation,request_id),
  constraint course_content_revision_receipts_operation check (
    operation in ('patch','apply')
  ),
  constraint course_content_revision_receipts_request_id check (
    btrim(request_id) <> '' and char_length(request_id) <= 160
  ),
  constraint course_content_revision_receipts_hash check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint course_content_revision_receipts_result check (
    jsonb_typeof(result) = 'object' and pg_column_size(result) <= 262144
  )
);

create or replace function private.course_revision_descendant_store_names()
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select array[
    'cards','blocks','options','nodes','flowNodes','flowCases','flowPractices',
    'flowPracticeEntries','flowPracticeOptions','flowPracticeVariants',
    'flowShapeOptions','edges','matrixItems','cells','points','lines',
    'highlights','cardSources','cardTopics'
  ]::text[];
$$;

create or replace function private.course_revision_request_hash(p_value jsonb)
returns text
language sql
immutable
set search_path = pg_catalog,extensions
as $$
  select encode(extensions.digest(convert_to(coalesce(p_value,'null'::jsonb)::text,'UTF8'),'sha256'),'hex');
$$;

-- O corte enxuto retirou tombstones das linhas de conteúdo. A revisão pontual
-- reintroduz esse estado somente em cards; todas as remontagens que usam este
-- helper passam a ignorá-los sem expor deletedAt no contrato público.
create or replace function private.camel_active_rows(
  p_table regclass,
  p_course_id uuid,
  p_store_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,private
as $$
declare
  v_result jsonb;
  v_table_name text;
  v_order text;
  v_active_sql text;
  v_projection text;
begin
  select relation.relname into v_table_name
  from pg_class relation
  where relation.oid=p_table;
  v_order:=case when exists(
    select 1
    from pg_attribute attribute
    where attribute.attrelid=p_table
      and attribute.attname='position'
      and attribute.attnum>0
      and not attribute.attisdropped
  ) then 't.position,t.id' else 't.id' end;
  v_active_sql:=case when exists(
    select 1
    from pg_attribute attribute
    where attribute.attrelid=p_table
      and attribute.attname='deleted_at'
      and attribute.attnum>0
      and not attribute.attisdropped
  ) then 'and t.deleted_at is null' else '' end;
  v_projection:=
    'private.local_row(coalesce($2,private.store_name($3,to_jsonb(t))),to_jsonb(t))';
  if v_table_name='cards' then
    v_projection:='('||v_projection||' - ''deletedAt'')';
  end if;
  execute format(
    'select coalesce(jsonb_agg(%s order by %s),''[]''::jsonb) '
    'from %s t where t.course_id=$1 '
    'and ($2 is null or private.store_name($3,to_jsonb(t))=$2) %s',
    v_projection,v_order,p_table,v_active_sql
  ) into v_result using p_course_id,p_store_name,v_table_name;
  return v_result;
end;
$$;

create or replace function private.course_revision_entity_ids(
  p_table_name text,
  p_course_id uuid,
  p_microsequence_id uuid
)
returns setof uuid
language plpgsql
stable
security definer
set search_path = pg_catalog,public
as $$
begin
  if p_table_name = 'cards' then
    return query select card.id from public.cards card
      where card.course_id = p_course_id
        and card.microsequence_id = p_microsequence_id
        and card.deleted_at is null;
  elsif p_table_name in ('card_blocks','card_refs') then
    return query execute format(
      'select child.id from public.%I child join public.cards card '
      'on card.course_id=child.course_id and card.id=child.card_id '
      'where child.course_id=$1 '
      'and card.microsequence_id=$2 and card.deleted_at is null',
      p_table_name
    ) using p_course_id,p_microsequence_id;
  elsif p_table_name in (
    'block_options','block_nodes','flow_nodes','flow_cases','block_edges',
    'block_matrix_items','block_cells','block_points','block_lines',
    'block_highlights'
  ) then
    if p_table_name = 'block_cells' then
      return query
        select cell.id
        from public.block_cells cell
        join public.card_blocks block
          on block.course_id=cell.course_id and block.id=cell.block_id
        join public.cards card
          on card.course_id=block.course_id and card.id=block.card_id
        where cell.course_id=p_course_id
          and card.microsequence_id=p_microsequence_id
          and card.deleted_at is null;
    else
      return query execute format(
        'select child.id from public.%I child '
        'join public.card_blocks block '
        'on block.course_id=child.course_id and block.id=child.block_id '
        'join public.cards card '
        'on card.course_id=block.course_id and card.id=block.card_id '
        'where child.course_id=$1 and card.microsequence_id=$2 '
        'and card.deleted_at is null',
        p_table_name
      ) using p_course_id,p_microsequence_id;
    end if;
  elsif p_table_name = 'flow_practices' then
    return query
      select practice.id
      from public.flow_practices practice
      left join public.flow_nodes node
        on node.course_id=practice.course_id and node.id=practice.flow_node_id
      left join public.flow_cases flow_case
        on flow_case.course_id=practice.course_id and flow_case.id=practice.flow_case_id
      join public.card_blocks block
        on block.course_id=practice.course_id
       and block.id=coalesce(node.block_id,flow_case.block_id)
      join public.cards card
        on card.course_id=block.course_id and card.id=block.card_id
      where practice.course_id=p_course_id
        and card.microsequence_id=p_microsequence_id
        and card.deleted_at is null;
  elsif p_table_name = 'node_practices' then
    return query
      select entry.id
      from public.node_practices entry
      join public.flow_practices practice
        on practice.course_id=entry.course_id and practice.id=entry.practice_id
      where entry.course_id=p_course_id
        and practice.id in (
          select private.course_revision_entity_ids(
            'flow_practices',p_course_id,p_microsequence_id
          )
        );
  elsif p_table_name = 'node_practice_items' then
    return query
      select item.id
      from public.node_practice_items item
      left join public.node_practices entry
        on entry.course_id=item.course_id and entry.id=item.entry_id
      where item.course_id=p_course_id
        and (
          entry.id in (
            select private.course_revision_entity_ids(
              'node_practices',p_course_id,p_microsequence_id
            )
          )
          or item.flow_practice_id in (
            select private.course_revision_entity_ids(
              'flow_practices',p_course_id,p_microsequence_id
            )
          )
        );
  else
    raise exception 'Tabela fora do recorte de revisão: %.',p_table_name
      using errcode='22023';
  end if;
end;
$$;

create or replace function private.course_revision_store_rows(
  p_store_name text,
  p_course_id uuid,
  p_microsequence_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,private
as $$
declare
  v_table regclass := private.table_for_store(p_store_name);
  v_table_name text;
  v_order text;
  v_rows jsonb;
begin
  if v_table is null
     or not(p_store_name=any(private.course_revision_descendant_store_names())) then
    raise exception 'Store fora do recorte de revisão: %.',p_store_name
      using errcode='22023';
  end if;
  select relation.relname into v_table_name from pg_class relation where relation.oid=v_table;
  v_order := case when exists(
    select 1 from pg_attribute attribute
    where attribute.attrelid=v_table and attribute.attname='position'
      and attribute.attnum>0 and not attribute.attisdropped
  ) then 'row_value.position,row_value.id' else 'row_value.id' end;
  execute format(
    'select coalesce(jsonb_agg(case when $1=''cards'' '
    'then private.local_row($1,to_jsonb(row_value))-''deletedAt'' '
    'else private.local_row($1,to_jsonb(row_value)) end order by %s),'
    '''[]''::jsonb) from %s row_value '
    'where row_value.id in (select private.course_revision_entity_ids($2,$3,$4)) '
    'and private.store_name($2,to_jsonb(row_value))=$1',
    v_order,v_table
  ) into v_rows using p_store_name,v_table_name,p_course_id,p_microsequence_id;
  return v_rows;
end;
$$;

create or replace function private.course_revision_fragment_rows(
  p_course_id uuid,
  p_microsequence_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_result jsonb := jsonb_build_object(
    'microsequences','[]'::jsonb,
    'dependencies','[]'::jsonb,
    'microsequenceStatements','[]'::jsonb
  );
  v_store text;
begin
  if not exists(
    select 1 from public.microsequences
    where course_id=p_course_id and id=p_microsequence_id
  ) then
    raise exception 'Microssequência não encontrada.' using errcode='P0002';
  end if;
  select jsonb_set(
    v_result,'{microsequences}',
    jsonb_build_array(private.local_row('microsequences',to_jsonb(microsequence)))
  ) into v_result
  from public.microsequences microsequence
  where microsequence.course_id=p_course_id and microsequence.id=p_microsequence_id;
  v_result := jsonb_set(v_result,'{dependencies}',coalesce((
    select jsonb_agg(private.local_row('dependencies',to_jsonb(dependency))
      order by dependency.position,dependency.id)
    from public.microsequence_dependencies dependency
    where dependency.course_id=p_course_id
      and dependency.microsequence_id=p_microsequence_id
  ),'[]'::jsonb));
  v_result := jsonb_set(v_result,'{microsequenceStatements}',coalesce((
    select jsonb_agg(private.local_row('microsequenceStatements',to_jsonb(statement))
      order by statement.statement_kind,statement.position,statement.id)
    from public.microsequence_statements statement
    where statement.course_id=p_course_id
      and statement.microsequence_id=p_microsequence_id
  ),'[]'::jsonb));
  foreach v_store in array private.course_revision_descendant_store_names() loop
    v_result := jsonb_set(
      v_result,array[v_store],
      private.course_revision_store_rows(v_store,p_course_id,p_microsequence_id)
    );
  end loop;
  return v_result;
end;
$$;

create or replace function private.course_revision_document_rows(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_store text;
  v_table regclass;
begin
  if not exists(
    select 1 from public.courses
    where id=p_course_id and deleted_at is null
  ) then
    raise exception 'Curso não encontrado.' using errcode='P0002';
  end if;
  v_result := jsonb_set(v_result,'{courses}',jsonb_build_array((
    select private.local_row('courses',to_jsonb(course))
    from public.courses course where course.id=p_course_id
  )));
  foreach v_store in array private.official_import_store_names() loop
    v_table := private.table_for_store(v_store);
    v_result := jsonb_set(
      v_result,array[v_store],
      private.camel_active_rows(v_table,p_course_id,v_store)
    );
  end loop;
  return v_result;
end;
$$;

create or replace function private.course_revision_fragment_hash(
  p_course_id uuid,
  p_microsequence_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog,private,extensions
as $$
  select encode(
    extensions.digest(
      convert_to(private.course_revision_fragment_rows(
        p_course_id,p_microsequence_id
      )::text,'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function private.course_revision_access_allowed(
  p_actor_user_id uuid,
  p_api_client_id uuid,
  p_target text,
  p_course_id uuid,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog,public,private
as $$
  select exists(
    select 1
    from public.courses course
    where course.id=p_course_id
      and course.status='published'
      and course.deleted_at is null
      and case p_target
        when 'catalog' then
          course.owner_id is null
          and p_action in ('read','write')
          and private.user_can_use_authoring_scope(
            p_actor_user_id,
            case when p_action='read' then 'authoring:read' else 'catalog:publish' end
          )
          and private.authoring_client_has_scope(
            p_api_client_id,p_actor_user_id,
            case when p_action='read' then 'authoring:read' else 'catalog:publish' end
          )
        when 'private' then
          course.owner_id=p_actor_user_id
          and p_action in ('read','write')
          and private.user_can_use_authoring_scope(
            p_actor_user_id,
            case when p_action='read'
              then 'authoring:private:read' else 'authoring:private:write' end
          )
          and private.authoring_client_has_scope(
            p_api_client_id,p_actor_user_id,
            case when p_action='read'
              then 'authoring:private:read' else 'authoring:private:write' end
          )
        else false
      end
  );
$$;

create or replace function private.course_revision_public_row(
  p_revision private.course_content_revisions
)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'revisionId',p_revision.id,
    'target',p_revision.target,
    'courseId',p_revision.course_id,
    'microsequenceId',p_revision.microsequence_id,
    'focusCardId',p_revision.focus_card_id,
    'baseContentHash',p_revision.base_content_hash,
    'basePublicationSeq',p_revision.base_publication_seq,
    'baseFragmentHash',p_revision.base_fragment_hash,
    'status',p_revision.status,
    'authoringFragmentHash',p_revision.authoring_fragment_hash,
    'compiledFragmentHash',p_revision.compiled_fragment_hash,
    'diff',p_revision.scoped_diff,
    'expectedContentHash',p_revision.expected_content_hash,
    'validation',p_revision.validation_report,
    'openedAt',p_revision.opened_at,
    'patchedAt',p_revision.patched_at,
    'appliedAt',p_revision.applied_at,
    'updatedAt',p_revision.updated_at
  ));
$$;

-- O copy-on-write ignora cards retirados por uma correção e qualquer metadado
-- pedagógico já desativado. A detecção da coluna é dinâmica porque apenas
-- cards e as tabelas pedagógicas posteriores ao corte enxuto têm tombstones.
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
  v_active_sql text;
  v_tables constant text[] := array[
    'modules','lessons','course_guides','guide_items','lesson_topics',
    'topic_statements','microsequences','microsequence_dependencies',
    'microsequence_statements','cards','card_blocks','block_options',
    'block_nodes','flow_nodes','flow_cases','flow_practices',
    'node_practices','node_practice_items','block_edges',
    'block_matrix_items','block_cells','block_points','block_lines',
    'block_highlights','card_refs',
    'learning_components','learning_component_topic_links',
    'learning_component_relations','learning_component_placements'
  ];
begin
  if p_clone_id is null
     or p_source_course_id is null
     or p_target_course_id is null
     or p_source_course_id=p_target_course_id then
    raise exception 'Identidade inválida para cópia pessoal.'
      using errcode='22023';
  end if;
  set constraints all deferred;

  foreach v_table_name in array v_tables loop
    v_table:=('public.'||v_table_name)::regclass;
    v_active_sql:=case when exists(
      select 1
      from pg_attribute attribute
      where attribute.attrelid=v_table
        and attribute.attname='deleted_at'
        and attribute.attnum>0
        and not attribute.attisdropped
    ) then 'and source.deleted_at is null' else '' end;
    if v_table_name='learning_component_placements' then
      v_active_sql:=v_active_sql
        ||' and (source.card_id is null or exists('
        ||'select 1 from public.cards active_card '
        ||'where active_card.course_id=source.course_id '
        ||'and active_card.id=source.card_id '
        ||'and active_card.deleted_at is null))';
    end if;
    execute format(
      'insert into private.personal_course_clone_map'
      ||'(clone_id,table_name,source_id,target_id) '
      ||'select $1,%L,source.id,gen_random_uuid() '
      ||'from %s source where source.course_id=$2 %s',
      v_table_name,v_table,v_active_sql
    ) using p_clone_id,p_source_course_id;
  end loop;

  foreach v_table_name in array v_tables loop
    v_table:=('public.'||v_table_name)::regclass;
    v_active_sql:=case when exists(
      select 1
      from pg_attribute attribute
      where attribute.attrelid=v_table
        and attribute.attname='deleted_at'
        and attribute.attnum>0
        and not attribute.attisdropped
    ) then 'and source.deleted_at is null' else '' end;
    if v_table_name='learning_component_placements' then
      v_active_sql:=v_active_sql
        ||' and (source.card_id is null or exists('
        ||'select 1 from public.cards active_card '
        ||'where active_card.course_id=source.course_id '
        ||'and active_card.id=source.card_id '
        ||'and active_card.deleted_at is null))';
    end if;

    select string_agg(
      format('%I',attribute.attname),
      ', ' order by attribute.attnum
    )
    into v_columns
    from pg_attribute attribute
    where attribute.attrelid=v_table
      and attribute.attnum>0
      and not attribute.attisdropped
      and attribute.attgenerated='';

    select string_agg(
      case
        when attribute.attname='id' then format(
          '(select map.target_id '
          ||'from private.personal_course_clone_map map '
          ||'where map.clone_id=$1 and map.table_name=%L '
          ||'and map.source_id=source.id)',
          v_table_name
        )
        when attribute.attname='course_id' then '$2'
        when v_table_name in (
          'learning_components',
          'learning_component_topic_links',
          'learning_component_relations',
          'learning_component_placements'
        ) and attribute.attname='source_entity_id' then
          'source.id'
        when v_table_name='course_guides'
             and attribute.attname='owner_id' then
          '(case source.owner_type '
          ||'when ''module'' then (select map.target_id '
          ||'from private.personal_course_clone_map map '
          ||'where map.clone_id=$1 and map.table_name=''modules'' '
          ||'and map.source_id=source.owner_id) '
          ||'when ''lesson'' then (select map.target_id '
          ||'from private.personal_course_clone_map map '
          ||'where map.clone_id=$1 and map.table_name=''lessons'' '
          ||'and map.source_id=source.owner_id) else null end)'
        when v_table_name in ('microsequence_dependencies','cards')
             and attribute.attname='lesson_id' then
          '(select map.target_id '
          ||'from private.personal_course_clone_map map '
          ||'where map.clone_id=$1 and map.table_name=''lessons'' '
          ||'and map.source_id=source.lesson_id)'
        when foreign_key.referenced_table is not null then format(
          '(select map.target_id '
          ||'from private.personal_course_clone_map map '
          ||'where map.clone_id=$1 and map.table_name=%L '
          ||'and map.source_id=source.%I)',
          foreign_key.referenced_table,attribute.attname
        )
        else format('source.%I',attribute.attname)
      end,
      ', ' order by attribute.attnum
    )
    into v_expressions
    from pg_attribute attribute
    left join lateral (
      select referenced.relname as referenced_table
      from pg_constraint constraint_row
      join lateral unnest(constraint_row.conkey)
        with ordinality source_key(attnum,n) on true
      join lateral unnest(constraint_row.confkey)
        with ordinality target_key(attnum,n)
        on target_key.n=source_key.n
      join pg_class referenced
        on referenced.oid=constraint_row.confrelid
      join pg_namespace referenced_schema
        on referenced_schema.oid=referenced.relnamespace
      join pg_attribute referenced_attribute
        on referenced_attribute.attrelid=constraint_row.confrelid
       and referenced_attribute.attnum=target_key.attnum
      where constraint_row.contype='f'
        and constraint_row.conrelid=v_table
        and source_key.attnum=attribute.attnum
        and referenced_schema.nspname='public'
        and referenced_attribute.attname='id'
        and referenced.relname=any(v_tables)
      limit 1
    ) foreign_key on true
    where attribute.attrelid=v_table
      and attribute.attnum>0
      and not attribute.attisdropped
      and attribute.attgenerated='';

    execute format(
      'insert into %s(%s) select %s from %s source '
      ||'where source.course_id=$3 %s',
      v_table,v_columns,v_expressions,v_table,v_active_sql
    ) using p_clone_id,p_target_course_id,p_source_course_id;
  end loop;
end;
$$;

-- A validação editorial antecede os tombstones de card. Atualizamos somente
-- os predicados que percorrem cards; todas as demais projeções continuam
-- físicas e, portanto, não precisam de estado de exclusão.
do $$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'private.validate_catalog_submission_course(uuid)'::regprocedure
  ) into v_definition;

  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'where card.microsequence_id = microsequence.id)',
    'where card.microsequence_id = microsequence.id '
      || 'and card.deleted_at is null)'
  );
  if v_definition=v_previous then
    raise exception 'Validador esperado não contém a consulta de cards da microssequência.';
  end if;

  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'where card.course_id = p_course_id and card.resource <> ''composite''',
    'where card.course_id = p_course_id and card.deleted_at is null '
      || 'and card.resource <> ''composite'''
  );
  if v_definition=v_previous then
    raise exception 'Validador esperado não contém a regra de bloco primário.';
  end if;

  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'where card.course_id = p_course_id and card.resource = ''composite''',
    'where card.course_id = p_course_id and card.deleted_at is null '
      || 'and card.resource = ''composite'''
  );
  if v_definition=v_previous then
    raise exception 'Validador esperado não contém a regra composite.';
  end if;

  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'where card.course_id = p_course_id'
      || E'\n      and card.resource <> ''composite''',
    'where card.course_id = p_course_id'
      || E'\n      and card.deleted_at is null'
      || E'\n      and card.resource <> ''composite'''
  );
  if v_definition=v_previous then
    raise exception 'Validador esperado não contém a correspondência de recurso.';
  end if;

  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'where card.course_id = p_course_id'
      || E'\n      and (card.card_kind is distinct from card.kind',
    'where card.course_id = p_course_id'
      || E'\n      and card.deleted_at is null'
      || E'\n      and (card.card_kind is distinct from card.kind'
  );
  if v_definition=v_previous then
    raise exception 'Validador esperado não contém a projeção pública do card.';
  end if;

  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'select 1 from public.cards'
      || E'\n    where course_id = p_course_id'
      || E'\n    group by microsequence_id, position',
    'select 1 from public.cards'
      || E'\n    where course_id = p_course_id and deleted_at is null'
      || E'\n    group by microsequence_id, position'
  );
  if v_definition=v_previous then
    raise exception 'Validador esperado não contém a regra de posições dos cards.';
  end if;

  execute v_definition;
end;
$$;

do $$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'private.catalog_submission_tree_counts(uuid)'::regprocedure
  ) into v_definition;
  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    '(select count(*) from public.cards where course_id = p_course_id)',
    '(select count(*) from public.cards '
      || 'where course_id = p_course_id and deleted_at is null)'
  );
  if v_definition=v_previous then
    raise exception 'Contagem editorial esperada não contém cards.';
  end if;
  execute v_definition;
end;
$$;

-- As funções de administração e de continuidade foram criadas antes de
-- cards.deleted_at existir. Recompilamos apenas os predicados de card depois
-- da adição da coluna, para que um tombstone nunca volte a aparecer como
-- conteúdo atual nem infle as contagens apresentadas ao autor.
do $$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'public.get_catalog_course_admin(uuid,uuid)'::regprocedure
  ) into v_definition;
  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'where card.course_id = course.id',
    'where card.course_id = course.id'
      || E'\n          and card.deleted_at is null'
  );
  if v_definition=v_previous then
    raise exception
      'Consulta administrativa esperada não contém a contagem de cards.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    (
      'public.get_personal_library_course_structure('
      || 'uuid,uuid,uuid,text,uuid,integer,integer,uuid'
      || ')'
    )::regprocedure
  ) into v_definition;

  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'where card.course_id = course.id',
    'where card.course_id = course.id'
      || E'\n        and card.deleted_at is null'
  );
  if v_definition=v_previous then
    raise exception
      'Biblioteca pessoal esperada não contém a contagem total de cards.';
  end if;

  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'where card.microsequence_id = microsequence.id',
    'where card.microsequence_id = microsequence.id'
      || E'\n              and card.deleted_at is null'
  );
  if v_definition=v_previous then
    raise exception
      'Biblioteca pessoal esperada não contém a contagem por microssequência.';
  end if;

  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'and card.microsequence_id = p_parent_id',
    'and card.microsequence_id = p_parent_id'
      || E'\n        and card.deleted_at is null'
  );
  if v_definition=v_previous then
    raise exception
      'Biblioteca pessoal esperada não contém a listagem de cards.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'private.guard_learning_component_placement()'::regprocedure
  ) into v_definition;
  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'and card.id = new.card_id;',
    'and card.id = new.card_id'
      || E'\n      and card.deleted_at is null;'
  );
  if v_definition=v_previous then
    raise exception
      'Guarda pedagógica esperada não contém a resolução do card.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'private.learning_component_continuity(uuid,text)'::regprocedure
  ) into v_definition;
  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'and card.id = placement.card_id',
    'and card.id = placement.card_id'
      || E'\n   and card.deleted_at is null'
  );
  if v_definition=v_previous then
    raise exception
      'Continuidade pedagógica esperada não contém a associação de card.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'private.materialize_authoring_learning_metadata(uuid,uuid)'::regprocedure
  ) into v_definition;
  v_previous:=v_definition;
  v_definition:=replace(
    v_definition,
    'and card.contract_key = card_plan.item->>''cardId''',
    'and card.contract_key = card_plan.item->>''cardId'''
      || E'\n   and card.deleted_at is null'
  );
  if v_definition=v_previous then
    raise exception
      'Materialização pedagógica esperada não contém a resolução do card.';
  end if;
  execute v_definition;
end;
$$;

-- A credencial pessoal pode receber o UUID do curso que o estudante
-- selecionou, mesmo quando ele ainda aponta para a árvore oficial
-- compartilhada. A resolução reutiliza o copy-on-write já empregado pelo
-- aplicativo e devolve as identidades equivalentes da cópia pessoal.
create or replace function public.resolve_private_course_revision_target(
  p_actor_user_id uuid,
  p_api_client_id uuid,
  p_mutation_id uuid,
  p_course_id uuid,
  p_microsequence_id uuid default null,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth
as $$
declare
  v_course public.courses%rowtype;
  v_source_course_id uuid;
  v_source_microsequence_id uuid := p_microsequence_id;
  v_source_card_id uuid := p_card_id;
  v_source_module_key text;
  v_source_lesson_key text;
  v_source_microsequence_key text;
  v_source_card_key text;
  v_target_course_id uuid;
  v_target_microsequence_id uuid;
  v_target_card_id uuid;
  v_selection_id uuid;
  v_fork jsonb;
begin
  perform private.require_service_role();
  if p_actor_user_id is null or p_mutation_id is null or p_course_id is null
     or (p_microsequence_id is null and p_card_id is null)
     or not private.user_can_use_authoring_scope(
       p_actor_user_id,'authoring:private:write'
     )
     or not private.authoring_client_has_scope(
       p_api_client_id,p_actor_user_id,'authoring:private:write'
     ) then
    raise exception 'Cópia pessoal para revisão não autorizada.'
      using errcode='42501';
  end if;
  select * into v_course
  from public.courses course
  where course.id=p_course_id
    and course.status='published'
    and course.deleted_at is null;
  if not found or (
    v_course.owner_id is not null
    and v_course.owner_id is distinct from p_actor_user_id
  ) then
    raise exception 'Curso selecionado não está disponível para revisão pessoal.'
      using errcode='42501';
  end if;
  if p_card_id is not null then
    select card.microsequence_id,card.contract_key
      into v_source_microsequence_id,v_source_card_key
    from public.cards card
    where card.course_id=p_course_id
      and card.id=p_card_id
      and card.deleted_at is null;
    if not found then
      raise exception 'Card não encontrado.' using errcode='P0002';
    end if;
    if p_microsequence_id is not null
       and p_microsequence_id is distinct from v_source_microsequence_id then
      raise exception 'Card não pertence à microssequência informada.'
        using errcode='23514';
    end if;
  end if;
  select
    module.contract_key,
    lesson.contract_key,
    microsequence.contract_key
  into
    v_source_module_key,
    v_source_lesson_key,
    v_source_microsequence_key
  from public.microsequences microsequence
  join public.lessons lesson
    on lesson.course_id=microsequence.course_id
   and lesson.id=microsequence.lesson_id
  join public.modules module
    on module.course_id=lesson.course_id
   and module.id=lesson.module_id
  where microsequence.course_id=p_course_id
    and microsequence.id=v_source_microsequence_id;
  if not found then
    raise exception 'Microssequência não encontrada.' using errcode='P0002';
  end if;

  if v_course.owner_id=p_actor_user_id then
    v_target_course_id:=v_course.id;
    v_target_microsequence_id:=v_source_microsequence_id;
    v_target_card_id:=v_source_card_id;
    select selection.id into v_selection_id
    from public.user_course_selections selection
    where selection.user_id=p_actor_user_id
      and selection.course_id=v_target_course_id;
    return jsonb_strip_nulls(jsonb_build_object(
      'status','resolved',
      'sourceCourseId',v_course.source_course_id,
      'courseId',v_target_course_id,
      'microsequenceId',v_target_microsequence_id,
      'cardId',v_target_card_id,
      'selectionId',v_selection_id,
      'forked',false,
      'idempotent',true
    ));
  end if;

  v_source_course_id:=v_course.id;
  -- fork_catalog_course_for_editing usa auth.uid(). A identidade é injetada
  -- somente nesta transação de servidor e não transforma a chave editorial
  -- nem a service role em credencial do usuário.
  perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true);
  v_fork:=public.fork_catalog_course_for_editing(
    v_source_course_id,p_mutation_id
  );
  v_target_course_id:=private.try_uuid(v_fork->>'courseId');
  v_selection_id:=private.try_uuid(v_fork->>'selectionId');
  if v_target_course_id is null then
    raise exception 'A cópia pessoal não retornou um curso válido.'
      using errcode='23514';
  end if;
  select target_microsequence.id
    into v_target_microsequence_id
  from public.modules target_module
  join public.lessons target_lesson
    on target_lesson.course_id=target_module.course_id
   and target_lesson.module_id=target_module.id
  join public.microsequences target_microsequence
    on target_microsequence.course_id=target_lesson.course_id
   and target_microsequence.lesson_id=target_lesson.id
  where target_module.course_id=v_target_course_id
    and target_module.contract_key=v_source_module_key
    and target_lesson.contract_key=v_source_lesson_key
    and target_microsequence.contract_key=v_source_microsequence_key;
  if not found then
    raise exception 'A cópia pessoal não preservou o recorte solicitado.'
      using errcode='23514';
  end if;
  if v_source_card_id is not null then
    select target_card.id into v_target_card_id
    from public.cards target_card
    where target_card.course_id=v_target_course_id
      and target_card.microsequence_id=v_target_microsequence_id
      and target_card.contract_key=v_source_card_key
      and target_card.deleted_at is null;
    if not found then
      raise exception 'A cópia pessoal não preservou o card solicitado.'
        using errcode='23514';
    end if;
  end if;
  return jsonb_build_object(
    'status','resolved',
    'sourceCourseId',v_source_course_id,
    'courseId',v_target_course_id,
    'microsequenceId',v_target_microsequence_id,
    'cardId',v_target_card_id,
    'selectionId',v_selection_id,
    'forked',true,
    'idempotent',coalesce((v_fork->>'idempotent')::boolean,false)
  );
end;
$$;

create or replace function public.open_course_content_revision(
  p_actor_user_id uuid,
  p_api_client_id uuid,
  p_revision_id uuid,
  p_target text,
  p_course_id uuid,
  p_microsequence_id uuid default null,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_course public.courses%rowtype;
  v_microsequence_id uuid := p_microsequence_id;
  v_existing private.course_content_revisions%rowtype;
  v_revision private.course_content_revisions%rowtype;
begin
  perform private.require_service_role();
  if p_revision_id is null or p_target not in ('catalog','private')
     or p_course_id is null or (p_microsequence_id is null and p_card_id is null) then
    raise exception 'Recorte de revisão inválido.' using errcode='22023';
  end if;
  if not private.course_revision_access_allowed(
    p_actor_user_id,p_api_client_id,p_target,p_course_id,'write'
  ) then
    raise exception 'Revisão de conteúdo não autorizada.' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_revision_id::text,0)
  );
  select * into v_existing from private.course_content_revisions
    where id=p_revision_id;
  if found then
    if v_existing.actor_user_id is distinct from p_actor_user_id
       or v_existing.api_client_id is distinct from p_api_client_id
       or v_existing.target is distinct from p_target
       or v_existing.course_id is distinct from p_course_id
       or (p_microsequence_id is not null
         and v_existing.microsequence_id is distinct from p_microsequence_id)
       or (p_card_id is not null
         and v_existing.focus_card_id is distinct from p_card_id) then
      raise exception 'revisionId reutilizado com outro recorte.'
        using errcode='23514';
    end if;
    return private.course_revision_public_row(v_existing)
      || jsonb_build_object('idempotent',true);
  end if;
  select * into v_course from public.courses course
    where course.id=p_course_id and course.deleted_at is null
      and course.status='published';
  if not found or coalesce(v_course.content_hash,'')!~'^[0-9a-f]{64}$' then
    raise exception 'Curso não possui publicação canônica válida.'
      using errcode='23514';
  end if;
  if p_card_id is not null then
    select card.microsequence_id into v_microsequence_id
    from public.cards card
    where card.course_id=p_course_id
      and card.id=p_card_id
      and card.deleted_at is null;
    if not found then
      raise exception 'Card não encontrado.' using errcode='P0002';
    end if;
    if p_microsequence_id is not null
       and p_microsequence_id is distinct from v_microsequence_id then
      raise exception 'Card não pertence à microssequência informada.'
        using errcode='23514';
    end if;
  end if;
  if not exists(
    select 1 from public.microsequences microsequence
    where microsequence.course_id=p_course_id
      and microsequence.id=v_microsequence_id
  ) then
    raise exception 'Microssequência não encontrada.' using errcode='P0002';
  end if;
  insert into private.course_content_revisions(
    id,actor_user_id,api_client_id,target,course_id,microsequence_id,
    focus_card_id,base_content_hash,base_publication_seq,base_fragment_hash
  ) values(
    p_revision_id,p_actor_user_id,p_api_client_id,p_target,p_course_id,
    v_microsequence_id,p_card_id,v_course.content_hash,
    v_course.publication_seq,
    private.course_revision_fragment_hash(p_course_id,v_microsequence_id)
  ) returning * into v_revision;
  return private.course_revision_public_row(v_revision)
    || jsonb_build_object('idempotent',false);
end;
$$;

create or replace function public.get_course_content_revision(
  p_actor_user_id uuid,
  p_api_client_id uuid,
  p_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,private
as $$
declare v_revision private.course_content_revisions%rowtype;
begin
  perform private.require_service_role();
  select * into v_revision from private.course_content_revisions
    where id=p_revision_id;
  if not found or v_revision.actor_user_id is distinct from p_actor_user_id
     or v_revision.api_client_id is distinct from p_api_client_id
     or not private.course_revision_access_allowed(
       p_actor_user_id,p_api_client_id,v_revision.target,
       v_revision.course_id,'read'
     ) then
    raise exception 'Revisão de conteúdo não encontrada ou não autorizada.'
      using errcode='42501';
  end if;
  return private.course_revision_public_row(v_revision);
end;
$$;

create or replace function public.get_course_content_revision_fragment(
  p_actor_user_id uuid,
  p_api_client_id uuid,
  p_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_revision private.course_content_revisions%rowtype;
  v_context jsonb;
begin
  perform private.require_service_role();
  select * into v_revision from private.course_content_revisions
    where id=p_revision_id;
  if not found or v_revision.actor_user_id is distinct from p_actor_user_id
     or v_revision.api_client_id is distinct from p_api_client_id
     or not private.course_revision_access_allowed(
       p_actor_user_id,p_api_client_id,v_revision.target,
       v_revision.course_id,'read'
     ) then
    raise exception 'Revisão de conteúdo não encontrada ou não autorizada.'
      using errcode='42501';
  end if;
  select jsonb_build_object(
    'course',jsonb_build_object(
      'id',course.id,'contractKey',course.contract_key,'title',course.title
    ),
    'module',jsonb_build_object(
      'id',module.id,'contractKey',module.contract_key,'title',module.title
    ),
    'lesson',jsonb_build_object(
      'id',lesson.id,'contractKey',lesson.contract_key,'title',lesson.title
    ),
    'microsequence',jsonb_build_object(
      'id',microsequence.id,'contractKey',microsequence.contract_key
    )
  ) into v_context
  from public.microsequences microsequence
  join public.lessons lesson on lesson.id=microsequence.lesson_id
  join public.modules module on module.id=lesson.module_id
  join public.courses course on course.id=microsequence.course_id
  where microsequence.id=v_revision.microsequence_id
    and microsequence.course_id=v_revision.course_id;
  return private.course_revision_public_row(v_revision)
    || jsonb_build_object(
      'context',v_context,
      'rows',private.course_revision_fragment_rows(
        v_revision.course_id,v_revision.microsequence_id
      ),
      'authoringFragment',v_revision.authoring_fragment,
      'compiledFragment',v_revision.compiled_fragment
    );
end;
$$;

-- This RPC is deliberately not exposed to an authoring model.  The Edge
-- Function uses it only to reassemble and hash the predicted complete course
-- in memory before accepting a point patch.
create or replace function public.get_course_content_revision_document_rows(
  p_actor_user_id uuid,
  p_api_client_id uuid,
  p_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,private
as $$
declare v_revision private.course_content_revisions%rowtype;
begin
  perform private.require_service_role();
  select * into v_revision from private.course_content_revisions
    where id=p_revision_id;
  if not found or v_revision.actor_user_id is distinct from p_actor_user_id
     or v_revision.api_client_id is distinct from p_api_client_id
     or not private.course_revision_access_allowed(
       p_actor_user_id,p_api_client_id,v_revision.target,
       v_revision.course_id,'write'
     ) then
    raise exception 'Revisão de conteúdo não encontrada ou não autorizada.'
      using errcode='42501';
  end if;
  return private.course_revision_document_rows(v_revision.course_id);
end;
$$;

create or replace function private.course_revision_patch_row(
  p_relational_patch jsonb,
  p_store text,
  p_id uuid
)
returns jsonb
language sql
immutable
set search_path = pg_catalog,private
as $$
  select case when p_id is null then null else (
    select row_value
    from jsonb_array_elements(
      coalesce(p_relational_patch->p_store,'[]'::jsonb)
    ) row_value
    where private.try_uuid(row_value->>'id')=p_id
    limit 1
  ) end;
$$;

create or replace function private.course_revision_patch_has_id(
  p_relational_patch jsonb,
  p_store text,
  p_id uuid
)
returns boolean
language sql
immutable
set search_path = pg_catalog,private
as $$
  select private.course_revision_patch_row(
    p_relational_patch,p_store,p_id
  ) is not null;
$$;

create or replace function private.assert_course_revision_patch(
  p_revision private.course_content_revisions,
  p_relational_patch jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog,private
as $$
declare v_store text; v_row jsonb;
begin
  if jsonb_typeof(p_relational_patch)<>'object'
     or exists(
       select 1 from jsonb_object_keys(p_relational_patch) key_name
       where not(key_name=any(private.course_revision_descendant_store_names()))
     ) then
    raise exception 'Patch relacional contém store fora do recorte.'
      using errcode='22023';
  end if;
  foreach v_store in array private.course_revision_descendant_store_names() loop
    if jsonb_typeof(coalesce(p_relational_patch->v_store,'[]'::jsonb))<>'array' then
      raise exception 'Store % do patch deve ser array.',v_store using errcode='22023';
    end if;
    for v_row in
      select value from jsonb_array_elements(
        coalesce(p_relational_patch->v_store,'[]'::jsonb)
      )
    loop
      if jsonb_typeof(v_row)<>'object'
         or private.try_uuid(v_row->>'id') is null
         or private.try_uuid(v_row->>'courseId') is distinct from p_revision.course_id then
        raise exception 'Linha inválida no store %.',v_store using errcode='22023';
      end if;
      case v_store
        when 'cards' then
          if private.try_uuid(v_row->>'microsequenceId')
               is distinct from p_revision.microsequence_id then
            raise exception 'Card do patch escapou da microssequência.'
              using errcode='23514';
          end if;
        when 'blocks' then
          if not private.course_revision_patch_has_id(
            p_relational_patch,'cards',private.try_uuid(v_row->>'cardId')
          ) then
            raise exception 'Bloco do patch não pertence a um card do recorte.'
              using errcode='23514';
          end if;
        when 'options','nodes','edges','matrixItems','cells','points','lines',
             'highlights' then
          if not private.course_revision_patch_has_id(
            p_relational_patch,'blocks',private.try_uuid(v_row->>'blockId')
          ) then
            raise exception 'Linha do store % não pertence a um bloco do recorte.',
              v_store using errcode='23514';
          end if;
          if v_store='nodes'
             and private.try_uuid(v_row->>'parentNodeId') is not null
             and (
               private.course_revision_patch_row(
                 p_relational_patch,'nodes',
                 private.try_uuid(v_row->>'parentNodeId')
               )->>'blockId'
             ) is distinct from v_row->>'blockId' then
            raise exception 'Nó do patch aponta para pai de outro bloco.'
              using errcode='23514';
          end if;
          if v_store='edges' and (
            (
              private.try_uuid(v_row->>'fromNodeId') is not null
              and (
                private.course_revision_patch_row(
                  p_relational_patch,'nodes',
                  private.try_uuid(v_row->>'fromNodeId')
                )->>'blockId'
              ) is distinct from v_row->>'blockId'
            ) or (
              private.try_uuid(v_row->>'toNodeId') is not null
              and (
                private.course_revision_patch_row(
                  p_relational_patch,'nodes',
                  private.try_uuid(v_row->>'toNodeId')
                )->>'blockId'
              ) is distinct from v_row->>'blockId'
            )
          ) then
            raise exception 'Aresta do patch liga nó fora do próprio bloco.'
              using errcode='23514';
          end if;
          if v_store='lines' and (
            (
              v_row->>'fromPointId' is not null
              and (
                private.try_uuid(v_row->>'fromPointId') is null
                or (
                  private.course_revision_patch_row(
                    p_relational_patch,'points',
                    private.try_uuid(v_row->>'fromPointId')
                  )->>'blockId'
                ) is distinct from v_row->>'blockId'
              )
            ) or (
              v_row->>'toPointId' is not null
              and (
                private.try_uuid(v_row->>'toPointId') is null
                or (
                  private.course_revision_patch_row(
                    p_relational_patch,'points',
                    private.try_uuid(v_row->>'toPointId')
                  )->>'blockId'
                ) is distinct from v_row->>'blockId'
              )
            )
          ) then
            raise exception 'Linha do patch aponta para ponto de outro bloco.'
              using errcode='23514';
          end if;
          if v_store in ('cells','highlights')
             and private.try_uuid(v_row->>'matrixItemId') is not null
             and (
               private.course_revision_patch_row(
                 p_relational_patch,'matrixItems',
                 private.try_uuid(v_row->>'matrixItemId')
               )->>'blockId'
             ) is distinct from v_row->>'blockId' then
            raise exception 'Linha matricial do patch aponta para item de outro bloco.'
              using errcode='23514';
          end if;
        when 'cardSources','cardTopics' then
          if not private.course_revision_patch_has_id(
            p_relational_patch,'cards',private.try_uuid(v_row->>'cardId')
          ) then
            raise exception 'Linha do store % não pertence a um card do recorte.',
              v_store using errcode='23514';
          end if;
        when 'flowNodes' then
          if not private.course_revision_patch_has_id(
            p_relational_patch,'blocks',private.try_uuid(v_row->>'blockId')
          ) or (
            private.try_uuid(v_row->>'parentNodeId') is not null
            and not private.course_revision_patch_has_id(
              p_relational_patch,'flowNodes',
              private.try_uuid(v_row->>'parentNodeId')
            )
          ) or (
            private.try_uuid(v_row->>'parentCaseId') is not null
            and not private.course_revision_patch_has_id(
              p_relational_patch,'flowCases',
              private.try_uuid(v_row->>'parentCaseId')
            )
          ) then
            raise exception 'Nó de fluxo escapou da árvore do bloco revisado.'
              using errcode='23514';
          end if;
          if (
            private.try_uuid(v_row->>'parentNodeId') is not null
            and (
              private.course_revision_patch_row(
                p_relational_patch,'flowNodes',
                private.try_uuid(v_row->>'parentNodeId')
              )->>'blockId'
            ) is distinct from v_row->>'blockId'
          ) or (
            private.try_uuid(v_row->>'parentCaseId') is not null
            and (
              private.course_revision_patch_row(
                p_relational_patch,'flowCases',
                private.try_uuid(v_row->>'parentCaseId')
              )->>'blockId'
            ) is distinct from v_row->>'blockId'
          ) then
            raise exception 'Nó de fluxo aponta para pai de outro bloco.'
              using errcode='23514';
          end if;
        when 'flowCases' then
          if not private.course_revision_patch_has_id(
            p_relational_patch,'blocks',private.try_uuid(v_row->>'blockId')
          ) or not private.course_revision_patch_has_id(
            p_relational_patch,'flowNodes',private.try_uuid(v_row->>'flowNodeId')
          ) then
            raise exception 'Caso de fluxo escapou da árvore do bloco revisado.'
              using errcode='23514';
          end if;
          if (
            private.course_revision_patch_row(
              p_relational_patch,'flowNodes',
              private.try_uuid(v_row->>'flowNodeId')
            )->>'blockId'
          ) is distinct from v_row->>'blockId' then
            raise exception 'Caso de fluxo aponta para nó de outro bloco.'
              using errcode='23514';
          end if;
        when 'flowPractices' then
          if (
            v_row->>'ownerType'='node'
            and not private.course_revision_patch_has_id(
              p_relational_patch,'flowNodes',private.try_uuid(v_row->>'ownerId')
            )
          ) or (
            v_row->>'ownerType'='case'
            and not private.course_revision_patch_has_id(
              p_relational_patch,'flowCases',private.try_uuid(v_row->>'ownerId')
            )
          ) or coalesce(v_row->>'ownerType','') not in ('node','case') then
            raise exception 'Prática de fluxo escapou da árvore revisada.'
              using errcode='23514';
          end if;
        when 'flowPracticeEntries' then
          if not private.course_revision_patch_has_id(
            p_relational_patch,'flowPractices',private.try_uuid(v_row->>'practiceId')
          ) then
            raise exception 'Entrada de prática não pertence à prática revisada.'
              using errcode='23514';
          end if;
        when 'flowPracticeOptions','flowPracticeVariants' then
          if not private.course_revision_patch_has_id(
            p_relational_patch,'flowPracticeEntries',
            private.try_uuid(v_row->>'entryId')
          ) then
            raise exception 'Alternativa de prática escapou da entrada revisada.'
              using errcode='23514';
          end if;
        when 'flowShapeOptions' then
          if not private.course_revision_patch_has_id(
            p_relational_patch,'flowPractices',private.try_uuid(v_row->>'practiceId')
          ) then
            raise exception 'Forma de prática não pertence à prática revisada.'
              using errcode='23514';
          end if;
      end case;
    end loop;
    if exists(
      select private.try_uuid(value->>'id')
      from jsonb_array_elements(
        coalesce(p_relational_patch->v_store,'[]'::jsonb)
      )
      group by private.try_uuid(value->>'id')
      having count(*)>1
    ) then
      raise exception 'Store % contém identidades duplicadas.',v_store
        using errcode='23505';
    end if;
  end loop;
  -- Alguns stores do contrato são projeções semânticas da mesma tabela
  -- física. Um UUID não pode aparecer em dois aliases, pois o segundo upsert
  -- sobrescreveria silenciosamente o primeiro na aplicação do patch.
  if exists(
    select private.table_for_store(alias.store_name), alias.entity_id
    from unnest(private.course_revision_descendant_store_names())
      as store_name
    cross join lateral (
      select
        store_name as store_name,
        private.try_uuid(row_value->>'id') as entity_id
      from jsonb_array_elements(
        coalesce(p_relational_patch->store_name,'[]'::jsonb)
      ) row_value
    ) alias
    group by private.table_for_store(alias.store_name), alias.entity_id
    having count(*)>1
  ) then
    raise exception 'Patch reutiliza o mesmo UUID em stores da mesma tabela física.'
      using errcode='23505';
  end if;
end;
$$;

create or replace function public.save_course_content_revision_patch(
  p_actor_user_id uuid,
  p_api_client_id uuid,
  p_revision_id uuid,
  p_request_id text,
  p_base_content_hash text,
  p_authoring_fragment jsonb,
  p_compiled_fragment jsonb,
  p_relational_patch jsonb,
  p_scoped_diff jsonb,
  p_expected_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_revision private.course_content_revisions%rowtype;
  v_course public.courses%rowtype;
  v_authoring_hash text := private.course_revision_request_hash(p_authoring_fragment);
  v_compiled_hash text := private.course_revision_request_hash(p_compiled_fragment);
  v_request_hash text;
  v_receipt private.course_content_revision_receipts%rowtype;
  v_result jsonb;
begin
  perform private.require_service_role();
  if coalesce(btrim(p_request_id),'')='' or char_length(p_request_id)>160
     or coalesce(p_base_content_hash,'')!~'^[0-9a-f]{64}$'
     or jsonb_typeof(p_authoring_fragment)<>'object'
     or jsonb_typeof(p_compiled_fragment)<>'object'
     or jsonb_typeof(p_scoped_diff)<>'object'
     or coalesce(p_expected_content_hash,'')!~'^[0-9a-f]{64}$' then
    raise exception 'Patch de revisão inválido.' using errcode='22023';
  end if;
  v_request_hash := private.course_revision_request_hash(jsonb_build_object(
    'baseContentHash',p_base_content_hash,
    'authoringFragmentHash',v_authoring_hash,
    'compiledFragmentHash',v_compiled_hash,
    'relationalPatch',p_relational_patch,
    'diff',p_scoped_diff,
    'expectedContentHash',p_expected_content_hash
  ));
  select * into v_revision from private.course_content_revisions
    where id=p_revision_id for update;
  if not found or v_revision.actor_user_id is distinct from p_actor_user_id
     or v_revision.api_client_id is distinct from p_api_client_id
     or not private.course_revision_access_allowed(
       p_actor_user_id,p_api_client_id,v_revision.target,
       v_revision.course_id,'write'
     ) then
    raise exception 'Revisão não está aberta ou não foi autorizada.'
      using errcode='42501';
  end if;
  select * into v_receipt from private.course_content_revision_receipts
    where revision_id=p_revision_id and operation='patch'
      and request_id=p_request_id;
  if found then
    if v_receipt.request_hash<>v_request_hash then
      raise exception 'requestId reutilizado com outro patch.'
        using errcode='23514';
    end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  if v_revision.status not in ('open','patched') then
    raise exception 'Revisão não está aberta ou não foi autorizada.'
      using errcode='42501';
  end if;
  perform private.assert_course_revision_patch(v_revision,p_relational_patch);
  select * into v_course from public.courses where id=v_revision.course_id;
  if v_revision.base_content_hash<>p_base_content_hash
     or v_course.content_hash is distinct from v_revision.base_content_hash
     or v_course.publication_seq is distinct from v_revision.base_publication_seq
     or private.course_revision_fragment_hash(
       v_revision.course_id,v_revision.microsequence_id
     ) is distinct from v_revision.base_fragment_hash then
    raise exception 'A publicação mudou desde a abertura da revisão.'
      using errcode='40001';
  end if;
  update private.course_content_revisions revision set
    status='patched',
    authoring_fragment=p_authoring_fragment,
    authoring_fragment_hash=v_authoring_hash,
    compiled_fragment=p_compiled_fragment,
    compiled_fragment_hash=v_compiled_hash,
    relational_patch=p_relational_patch,
    scoped_diff=p_scoped_diff,
    expected_content_hash=p_expected_content_hash,
    patched_at=now(),
    updated_at=now()
  where revision.id=p_revision_id
  returning * into v_revision;
  v_result := private.course_revision_public_row(v_revision)
    || jsonb_build_object('idempotent',false);
  insert into private.course_content_revision_receipts(
    revision_id,operation,request_id,request_hash,result
  ) values(p_revision_id,'patch',p_request_id,v_request_hash,v_result);
  return v_result;
end;
$$;

create or replace function private.reconcile_official_course_progress(
  p_course_id uuid
)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_updated integer:=0;
begin
  -- O progresso do card tombstonado permanece como histórico, mas somente
  -- cards e microssequências ativos participam do cursor atual da lição.
  with ordered as (
    select
      lesson_progress.id as progress_id,
      row_number() over(
        partition by lesson_progress.id
        order by microsequence.position,card.position,card.id
      ) as card_number,
      card_progress.completed_at
    from public.lesson_progress lesson_progress
    join public.microsequences microsequence
      on microsequence.course_id=lesson_progress.course_id
     and microsequence.lesson_id=lesson_progress.lesson_id
    join public.cards card
      on card.course_id=lesson_progress.course_id
     and card.lesson_id=lesson_progress.lesson_id
     and card.microsequence_id=microsequence.id
     and card.deleted_at is null
    left join public.card_progress card_progress
      on card_progress.selection_id=lesson_progress.selection_id
     and card_progress.card_id=card.id
     and card_progress.completed_at is not null
    where lesson_progress.course_id=p_course_id
  ), stats as (
    select
      progress_id,
      count(*)::integer as total_cards,
      coalesce(
        min(card_number) filter(where completed_at is null)-1,
        count(*)
      )::integer as contiguous_completed,
      max(completed_at) as last_completed_at
    from ordered
    group by progress_id
  ), desired as (
    select
      lesson_progress.id,
      coalesce(stats.contiguous_completed,0)-1 as cursor,
      case
        when coalesce(stats.total_cards,0)>0
          and stats.contiguous_completed=stats.total_cards
        then coalesce(lesson_progress.completed_at,stats.last_completed_at)
        else null
      end as completed_at
    from public.lesson_progress lesson_progress
    left join stats on stats.progress_id=lesson_progress.id
    where lesson_progress.course_id=p_course_id
  )
  update public.lesson_progress lesson_progress set
    cursor=desired.cursor,
    completed_at=desired.completed_at
  from desired
  where lesson_progress.id=desired.id
    and (
      lesson_progress.cursor is distinct from desired.cursor
      or lesson_progress.completed_at is distinct from desired.completed_at
    );
  get diagnostics v_updated=row_count;
  return v_updated;
end;
$$;

create or replace function public.apply_course_content_revision(
  p_actor_user_id uuid,
  p_api_client_id uuid,
  p_revision_id uuid,
  p_request_id text,
  p_base_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,pg_temp
as $$
declare
  v_revision private.course_content_revisions%rowtype;
  v_course public.courses%rowtype;
  v_store text;
  v_row jsonb;
  v_id uuid;
  v_table regclass;
  v_table_name text;
  v_request_hash text;
  v_receipt private.course_content_revision_receipts%rowtype;
  v_validation jsonb;
  v_result jsonb;
  v_selection record;
  v_delete_tables text[] := array[
    'node_practice_items','node_practices','flow_practices','flow_cases',
    'flow_nodes','block_highlights','block_lines','block_points','block_cells',
    'block_matrix_items','block_edges','block_nodes','block_options',
    'card_refs','card_blocks'
  ];
begin
  perform private.require_service_role();
  if coalesce(btrim(p_request_id),'')='' or char_length(p_request_id)>160
     or coalesce(p_base_content_hash,'')!~'^[0-9a-f]{64}$' then
    raise exception 'Aplicação de revisão inválida.' using errcode='22023';
  end if;
  v_request_hash := private.course_revision_request_hash(jsonb_build_object(
    'baseContentHash',p_base_content_hash
  ));
  select * into v_revision from private.course_content_revisions
    where id=p_revision_id for update;
  if not found or v_revision.actor_user_id is distinct from p_actor_user_id
     or v_revision.api_client_id is distinct from p_api_client_id
     or not private.course_revision_access_allowed(
       p_actor_user_id,p_api_client_id,v_revision.target,
       v_revision.course_id,'write'
     ) then
    raise exception 'Revisão não está pronta ou não foi autorizada.'
      using errcode='42501';
  end if;
  select * into v_receipt from private.course_content_revision_receipts
    where revision_id=p_revision_id and operation='apply'
      and request_id=p_request_id;
  if found then
    if v_receipt.request_hash<>v_request_hash then
      raise exception 'requestId reutilizado com outra aplicação.'
        using errcode='23514';
    end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  if v_revision.status<>'patched' then
    raise exception 'Revisão não está pronta ou não foi autorizada.'
      using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('course-content-revision:'||v_revision.course_id::text,0)
  );
  select * into v_course from public.courses
    where id=v_revision.course_id for update;
  if v_revision.base_content_hash<>p_base_content_hash
     or v_course.content_hash is distinct from v_revision.base_content_hash
     or v_course.publication_seq is distinct from v_revision.base_publication_seq
     or private.course_revision_fragment_hash(
       v_revision.course_id,v_revision.microsequence_id
     ) is distinct from v_revision.base_fragment_hash then
    raise exception 'A publicação mudou desde a abertura da revisão.'
      using errcode='40001';
  end if;
  perform private.assert_course_revision_patch(
    v_revision,v_revision.relational_patch
  );
  set constraints all deferred;
  create temporary table course_revision_expected_entities(
    table_name text not null,
    entity_id uuid not null,
    primary key(table_name,entity_id)
  ) on commit drop;
  foreach v_store in array private.course_revision_descendant_store_names() loop
    v_table := private.table_for_store(v_store);
    select relation.relname into v_table_name
      from pg_class relation where relation.oid=v_table;
    for v_row in
      select value from jsonb_array_elements(
        coalesce(v_revision.relational_patch->v_store,'[]'::jsonb)
      )
    loop
      v_id := private.try_uuid(v_row->>'id');
      insert into course_revision_expected_entities(table_name,entity_id)
        values(v_table_name,v_id) on conflict do nothing;
    end loop;
  end loop;
  -- A continuidade pedagógica usa uma tabela posterior ao corte enxuto. Sua
  -- associação com o card acompanha o mesmo tombstone e volta a ficar ativa
  -- se a identidade for restaurada por outra correção.
  update public.learning_component_placements placement set
    deleted_at=case when exists(
      select 1
      from course_revision_expected_entities expected
      where expected.table_name='cards'
        and expected.entity_id=placement.card_id
    ) then null else coalesce(placement.deleted_at,now()) end,
    updated_at=now()
  where placement.course_id=v_revision.course_id
    and placement.microsequence_id=v_revision.microsequence_id
    and placement.card_id is not null;
  -- As projeções abaixo de card não têm estado do estudante. Removê-las
  -- primeiro libera índices de bloco primário, opção correta e posições antes
  -- da reconstrução formal. Os cards que conservam identidade não são
  -- removidos, portanto progresso e comentários continuam ligados ao mesmo UUID.
  foreach v_table_name in array v_delete_tables loop
    execute format(
      'delete from public.%I target '
      'where target.id in (select private.course_revision_entity_ids($1,$2,$3))',
      v_table_name
    ) using v_table_name,v_revision.course_id,v_revision.microsequence_id;
  end loop;

  -- Cards carregam progresso. Só suas chaves imediatas são deslocadas durante
  -- a transação, o que permite inclusão, remoção e reordenação sem colisão.
  with displaced as (
    select card.id,
      (1000000000::bigint+row_number() over(order by card.id))::integer
        as temporary_position,
      '__revision_'||replace(card.id::text,'-','') as temporary_key
    from public.cards card
    where card.course_id=v_revision.course_id
      and card.microsequence_id=v_revision.microsequence_id
  )
  update public.cards card set
    position=displaced.temporary_position,
    contract_key=displaced.temporary_key
  from displaced where card.id=displaced.id;

  foreach v_store in array private.course_revision_descendant_store_names() loop
    for v_row in
      select value from jsonb_array_elements(
        coalesce(v_revision.relational_patch->v_store,'[]'::jsonb)
      )
    loop
      v_id := private.try_uuid(v_row->>'id');
      perform private.apply_official_stage_row(
        v_store,v_revision.course_id,v_id,v_row
      );
      -- A linha pode estar tombstonada por uma revisão anterior. A presença
      -- explícita no novo fragmento a reativa com a mesma identidade.
      if v_store='cards' then
        update public.cards card set deleted_at=null where card.id=v_id;
      end if;
    end loop;
  end loop;
  -- Progresso e comentários referenciam o UUID persistente do card. Cards
  -- ausentes do novo fragmento tornam-se tombstones; não são apagados nem
  -- acionam cascatas sobre o histórico do estudante.
  update public.cards card set
    deleted_at=coalesce(card.deleted_at,now())
  where card.course_id=v_revision.course_id
    and card.microsequence_id=v_revision.microsequence_id
    and not exists(
      select 1 from course_revision_expected_entities expected
      where expected.table_name='cards' and expected.entity_id=card.id
    );
  update public.courses course set
    content_hash=v_revision.expected_content_hash,
    publication_seq=course.publication_seq+1,
    updated_at=now()
  where course.id=v_revision.course_id;
  perform private.reconcile_official_course_progress(v_revision.course_id);
  v_validation := private.validate_catalog_submission_course(
    v_revision.course_id
  );
  if not coalesce((v_validation->>'valid')::boolean,false) then
    raise exception 'A revisão não passou na validação integral: %.',
      coalesce(v_validation->'errors','[]'::jsonb)::text
      using errcode='23514';
  end if;
  if v_revision.target='private' then
    perform pg_advisory_xact_lock(
      hashtextextended('aralearn-sync-feed-commit-order',0)
    );
    for v_selection in
      select selection.id
      from public.user_course_selections selection
      where selection.user_id=v_revision.actor_user_id
        and selection.course_id=v_revision.course_id
    loop
      insert into private.sync_changes(
        audience_user_id,course_id,entity_type,entity_id,operation
      ) values(
        v_revision.actor_user_id,v_revision.course_id,
        'courseSelections',v_selection.id,'upsert'
      );
    end loop;
  end if;
  update private.course_content_revisions revision set
    status='applied',
    validation_report=v_validation,
    applied_at=now(),
    updated_at=now()
  where revision.id=p_revision_id
  returning * into v_revision;
  v_result := private.course_revision_public_row(v_revision)
    || jsonb_build_object('idempotent',false);
  insert into private.course_content_revision_receipts(
    revision_id,operation,request_id,request_hash,result
  ) values(p_revision_id,'apply',p_request_id,v_request_hash,v_result);
  return v_result;
end;
$$;

create or replace function public.course_content_revision_storage_diagnostics(
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,private
set statement_timeout = '8s'
as $$
declare
  v_by_status jsonb;
  v_revision_rows bigint;
  v_revision_bytes bigint;
  v_receipt_rows bigint;
  v_receipt_bytes bigint;
begin
  perform private.require_service_role();
  if p_actor_user_id is null
     or not private.has_active_app_role(p_actor_user_id,'owner') then
    raise exception 'Diagnóstico de correções não autorizado.'
      using errcode='42501';
  end if;
  select count(*),coalesce(sum(pg_column_size(revision)),0)
    into v_revision_rows,v_revision_bytes
  from private.course_content_revisions revision;
  select count(*),coalesce(sum(pg_column_size(receipt)),0)
    into v_receipt_rows,v_receipt_bytes
  from private.course_content_revision_receipts receipt;
  select coalesce(
    jsonb_object_agg(summary.status,summary.row_count order by summary.status),
    '{}'::jsonb
  ) into v_by_status
  from (
    select revision.status,count(*) row_count
    from private.course_content_revisions revision
    group by revision.status
  ) summary;
  return jsonb_build_object(
    'revisionRows',v_revision_rows,
    'revisionBytes',v_revision_bytes,
    'receiptRows',v_receipt_rows,
    'receiptBytes',v_receipt_bytes,
    'byStatus',v_by_status
  );
end;
$$;

create or replace function public.cleanup_course_content_revisions(
  p_actor_user_id uuid,
  p_dry_run boolean default true,
  p_terminal_before timestamptz default (now()-interval '90 days'),
  p_abandoned_before timestamptz default (now()-interval '180 days'),
  p_limit integer default 100,
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,private
set statement_timeout = '8s'
as $$
declare
  v_ids uuid[] := array[]::uuid[];
  v_candidate_rows integer := 0;
  v_candidate_bytes bigint := 0;
  v_candidate_receipts bigint := 0;
  v_deleted_rows integer := 0;
  v_last_updated_at timestamptz;
  v_last_id uuid;
  v_has_more boolean := false;
begin
  perform private.require_service_role();
  if p_actor_user_id is null
     or not private.has_active_app_role(p_actor_user_id,'owner') then
    raise exception 'Limpeza de correções não autorizada.'
      using errcode='42501';
  end if;
  if p_dry_run is null or p_terminal_before is null
     or p_abandoned_before is null
     or p_terminal_before>now()-interval '90 days'
     or p_abandoned_before>now()-interval '180 days'
     or p_limit is null or p_limit<1 or p_limit>500
     or ((p_after_updated_at is null)<>(p_after_id is null)) then
    raise exception 'Parâmetros de retenção de correções inválidos.'
      using errcode='22023';
  end if;
  select
    coalesce(array_agg(candidate.id order by candidate.updated_at,candidate.id),
      array[]::uuid[]),
    count(*)::integer,
    coalesce(sum(pg_column_size(candidate)),0)
  into v_ids,v_candidate_rows,v_candidate_bytes
  from (
    select revision.*
    from private.course_content_revisions revision
    where (
        (
          revision.status in ('applied','cancelled')
          and revision.updated_at<p_terminal_before
        ) or (
          revision.status in ('open','patched')
          and revision.updated_at<p_abandoned_before
        )
      )
      and (
        p_after_updated_at is null
        or (revision.updated_at,revision.id)>(p_after_updated_at,p_after_id)
      )
    order by revision.updated_at,revision.id
    limit p_limit
  ) candidate;
  if v_candidate_rows>0 then
    select revision.updated_at,revision.id
      into v_last_updated_at,v_last_id
    from private.course_content_revisions revision
    where revision.id=v_ids[v_candidate_rows];
    select count(*) into v_candidate_receipts
    from private.course_content_revision_receipts receipt
    where receipt.revision_id=any(v_ids);
    select exists(
      select 1
      from private.course_content_revisions revision
      where (
          (
            revision.status in ('applied','cancelled')
            and revision.updated_at<p_terminal_before
          ) or (
            revision.status in ('open','patched')
            and revision.updated_at<p_abandoned_before
          )
        )
        and (revision.updated_at,revision.id)>(v_last_updated_at,v_last_id)
    ) into v_has_more;
    if not p_dry_run then
      delete from private.course_content_revisions revision
      where revision.id=any(v_ids);
      get diagnostics v_deleted_rows=row_count;
    end if;
  end if;
  return jsonb_build_object(
    'dryRun',p_dry_run,
    'terminalBefore',p_terminal_before,
    'abandonedBefore',p_abandoned_before,
    'candidateRows',v_candidate_rows,
    'candidateBytes',v_candidate_bytes,
    'candidateReceipts',v_candidate_receipts,
    'deletedRows',v_deleted_rows,
    'hasMore',v_has_more,
    'nextCursor',case when v_last_id is null then null else jsonb_build_object(
      'updatedAt',v_last_updated_at,
      'id',v_last_id
    ) end
  );
end;
$$;

create or replace function public.validate_course_graph(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  v_errors jsonb:='[]'::jsonb;
  v_course public.courses%rowtype;
begin
  if not public.is_app_admin() then
    raise exception 'Validação oficial exige administrador.'
      using errcode='42501';
  end if;
  select * into v_course
  from public.courses
  where id=p_course_id and deleted_at is null;
  if not found then
    return jsonb_build_object(
      'valid',false,
      'publishable',false,
      'courseId',p_course_id,
      'errors',jsonb_build_array(
        jsonb_build_object('code','course.missing','path','$.course')
      )
    );
  end if;
  if not exists(
    select 1 from public.modules
    where course_id=p_course_id and deleted_at is null
  ) then
    v_errors:=v_errors||jsonb_build_array(
      jsonb_build_object('code','course.modules.empty','path','$.modules')
    );
  end if;
  if not exists(
    select 1 from public.lessons
    where course_id=p_course_id and deleted_at is null
  ) then
    v_errors:=v_errors||jsonb_build_array(
      jsonb_build_object('code','course.lessons.empty','path','$.lessons')
    );
  end if;
  if not exists(
    select 1 from public.microsequences
    where course_id=p_course_id and deleted_at is null
  ) then
    v_errors:=v_errors||jsonb_build_array(
      jsonb_build_object(
        'code','course.microsequences.empty','path','$.microsequences'
      )
    );
  end if;
  if not exists(
    select 1 from public.cards
    where course_id=p_course_id and deleted_at is null
  ) then
    v_errors:=v_errors||jsonb_build_array(
      jsonb_build_object('code','course.cards.empty','path','$.cards')
    );
  end if;
  if exists(
    select 1 from public.microsequences
    where course_id=p_course_id
      and deleted_at is null
      and status<>'ready'
  ) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object(
      'code','microsequence.not_ready',
      'path','$.microsequences',
      'message','Publicação exige todas as microssequências em ready.'
    ));
  end if;
  if exists(
    select 1
    from public.modules
    where course_id=p_course_id and deleted_at is null
    group by position
    having count(*)>1
  ) then
    v_errors:=v_errors||jsonb_build_array(
      jsonb_build_object(
        'code','module.position.duplicate','path','$.modules'
      )
    );
  end if;
  if exists(
    select 1
    from public.lessons
    where course_id=p_course_id and deleted_at is null
    group by module_id,position
    having count(*)>1
  ) then
    v_errors:=v_errors||jsonb_build_array(
      jsonb_build_object(
        'code','lesson.position.duplicate','path','$.lessons'
      )
    );
  end if;
  if exists(
    select 1
    from public.microsequences
    where course_id=p_course_id and deleted_at is null
    group by lesson_id,position
    having count(*)>1
  ) then
    v_errors:=v_errors||jsonb_build_array(
      jsonb_build_object(
        'code','microsequence.position.duplicate','path','$.microsequences'
      )
    );
  end if;
  return jsonb_build_object(
    'valid',jsonb_array_length(v_errors)=0,
    'publishable',jsonb_array_length(v_errors)=0,
    'courseId',p_course_id,
    'contentHash',v_course.content_hash,
    'errors',v_errors
  );
end;
$$;

comment on table private.course_content_revisions is
  'Draft formal e patch relacional de uma única microssequência. O curso publicado só muda na aplicação transacional.';
comment on function public.get_course_content_revision_document_rows(uuid,uuid,uuid) is
  'Uso interno da Edge Function para remontagem e hash canônico em memória; nunca integra o contrato MCP.';
comment on function public.resolve_private_course_revision_target(
  uuid,uuid,uuid,uuid,uuid,uuid
) is
  'Resolve o recorte pessoal e cria ou reutiliza copy-on-write quando a seleção ainda aponta para o catálogo oficial.';
comment on function public.apply_course_content_revision(uuid,uuid,uuid,text,text) is
  'Aplica somente os cards da microssequência revisada e seus descendentes, valida o curso e confirma tudo em uma transação.';
comment on function public.cleanup_course_content_revisions(
  uuid,boolean,timestamptz,timestamptz,integer,timestamptz,uuid
) is
  'Remove em lotes correções terminais após noventa dias e rascunhos abandonados após cento e oitenta dias; oferece dry-run e cursor.';

revoke all on table private.course_content_revisions
  from public,anon,authenticated,service_role;
revoke all on table private.course_content_revision_receipts
  from public,anon,authenticated,service_role;

revoke execute on function private.course_revision_descendant_store_names()
  from public,anon,authenticated;
revoke execute on function private.course_revision_request_hash(jsonb)
  from public,anon,authenticated;
revoke execute on function private.camel_active_rows(regclass,uuid,text)
  from public,anon,authenticated;
revoke execute on function private.course_revision_entity_ids(text,uuid,uuid)
  from public,anon,authenticated;
revoke execute on function private.course_revision_store_rows(text,uuid,uuid)
  from public,anon,authenticated;
revoke execute on function private.course_revision_fragment_rows(uuid,uuid)
  from public,anon,authenticated;
revoke execute on function private.course_revision_document_rows(uuid)
  from public,anon,authenticated;
revoke execute on function private.course_revision_fragment_hash(uuid,uuid)
  from public,anon,authenticated;
revoke execute on function private.course_revision_access_allowed(
  uuid,uuid,text,uuid,text
) from public,anon,authenticated;
revoke execute on function private.course_revision_public_row(
  private.course_content_revisions
) from public,anon,authenticated;
revoke execute on function private.clone_personal_course_tree(uuid,uuid,uuid)
  from public,anon,authenticated;
revoke execute on function private.course_revision_patch_row(jsonb,text,uuid)
  from public,anon,authenticated;
revoke execute on function private.course_revision_patch_has_id(jsonb,text,uuid)
  from public,anon,authenticated;
revoke execute on function private.assert_course_revision_patch(
  private.course_content_revisions,jsonb
) from public,anon,authenticated;
revoke execute on function private.reconcile_official_course_progress(uuid)
  from public,anon,authenticated;

revoke all on function public.open_course_content_revision(
  uuid,uuid,uuid,text,uuid,uuid,uuid
) from public,anon,authenticated;
revoke all on function public.resolve_private_course_revision_target(
  uuid,uuid,uuid,uuid,uuid,uuid
) from public,anon,authenticated;
revoke all on function public.get_course_content_revision(
  uuid,uuid,uuid
) from public,anon,authenticated;
revoke all on function public.get_course_content_revision_fragment(
  uuid,uuid,uuid
) from public,anon,authenticated;
revoke all on function public.get_course_content_revision_document_rows(
  uuid,uuid,uuid
) from public,anon,authenticated;
revoke all on function public.save_course_content_revision_patch(
  uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text
) from public,anon,authenticated;
revoke all on function public.apply_course_content_revision(
  uuid,uuid,uuid,text,text
) from public,anon,authenticated;
revoke all on function public.course_content_revision_storage_diagnostics(uuid)
  from public,anon,authenticated;
revoke all on function public.cleanup_course_content_revisions(
  uuid,boolean,timestamptz,timestamptz,integer,timestamptz,uuid
) from public,anon,authenticated;

grant execute on function public.open_course_content_revision(
  uuid,uuid,uuid,text,uuid,uuid,uuid
) to service_role;
grant execute on function public.resolve_private_course_revision_target(
  uuid,uuid,uuid,uuid,uuid,uuid
) to service_role;
grant execute on function public.get_course_content_revision(
  uuid,uuid,uuid
) to service_role;
grant execute on function public.get_course_content_revision_fragment(
  uuid,uuid,uuid
) to service_role;
grant execute on function public.get_course_content_revision_document_rows(
  uuid,uuid,uuid
) to service_role;
grant execute on function public.save_course_content_revision_patch(
  uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text
) to service_role;
grant execute on function public.apply_course_content_revision(
  uuid,uuid,uuid,text,text
) to service_role;
grant execute on function public.course_content_revision_storage_diagnostics(uuid)
  to service_role;
grant execute on function public.cleanup_course_content_revisions(
  uuid,boolean,timestamptz,timestamptz,integer,timestamptz,uuid
) to service_role;

commit;
