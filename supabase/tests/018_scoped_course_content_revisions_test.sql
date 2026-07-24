begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_table(
  'private', 'course_content_revisions',
  'rascunhos de correção pontual ficam fora do schema público'
);
select has_table(
  'private', 'course_content_revision_receipts',
  'recibos idempotentes da correção ficam encapsulados'
);
select has_column(
  'public', 'cards', 'deleted_at',
  'somente a identidade do card admite tombstone no conteúdo enxuto'
);
select ok(
  pg_get_functiondef(
    'public.validate_course_graph(uuid)'::regprocedure
  ) like '%from public.cards%'
  and pg_get_functiondef(
    'public.validate_course_graph(uuid)'::regprocedure
  ) like '%deleted_at is null%',
  'validação oficial ignora cards removidos por correção pontual'
);
select ok(not exists(
  select 1
  from information_schema.columns column_row
  where column_row.table_schema='public'
    and column_row.table_name=any(array[
      'card_blocks','block_options','block_nodes','flow_nodes','flow_cases',
      'flow_practices','node_practices','node_practice_items','block_edges',
      'block_matrix_items','block_cells','block_points','block_lines',
      'block_highlights','card_refs'
    ])
    and column_row.column_name='deleted_at'
), 'projeções abaixo do card continuam sem tombstones');
select ok((
  select count(*)=2
  from pg_index index_row
  join pg_class index_relation on index_relation.oid=index_row.indexrelid
  where index_relation.relname=any(array[
    'cards_key_lean_uidx','cards_position_lean_uidx'
  ])
    and index_row.indisunique
    and pg_get_expr(index_row.indpred,index_row.indrelid)
      = '(deleted_at IS NULL)'
), 'unicidade enxuta dos cards considera somente linhas ativas');
select has_function(
  'public', 'open_course_content_revision',
  array['uuid','uuid','uuid','text','uuid','uuid','uuid'],
  'RPC abre uma revisão vinculada a um recorte explícito'
);
select has_function(
  'public', 'resolve_private_course_revision_target',
  array['uuid','uuid','uuid','uuid','uuid','uuid'],
  'RPC resolve copy-on-write antes da correção pessoal'
);
select has_function(
  'public', 'save_course_content_revision_patch',
  array['uuid','uuid','uuid','text','text','jsonb','jsonb','jsonb','jsonb','text'],
  'RPC persiste a fonte formal e o patch relacional'
);
select has_function(
  'public', 'apply_course_content_revision',
  array['uuid','uuid','uuid','text','text'],
  'RPC aplica a correção em uma transação'
);
select has_function(
  'public', 'cleanup_course_content_revisions',
  array['uuid','boolean','timestamp with time zone','timestamp with time zone','integer',
    'timestamp with time zone','uuid'],
  'retenção paginada de correções possui RPC própria'
);
select has_function(
  'public', 'course_content_revision_storage_diagnostics',
  array['uuid'],
  'diagnóstico de armazenamento das correções existe'
);
select ok(not has_table_privilege(
  'authenticated', 'private.course_content_revisions', 'SELECT'
), 'usuário autenticado não lê a tabela privada diretamente');
select ok(not has_table_privilege(
  'service_role', 'private.course_content_revisions', 'SELECT'
), 'service role também usa somente as RPCs encapsuladas');
select ok((
  select count(*) = 5
  from pg_constraint constraint_row
  where constraint_row.conrelid =
      'private.course_content_revisions'::regclass
    and constraint_row.conname = any(array[
      'course_content_revisions_fragment_size',
      'course_content_revisions_compiled_size',
      'course_content_revisions_patch_size',
      'course_content_revisions_diff_size',
      'course_content_revisions_validation_size'
    ])
    and pg_get_constraintdef(constraint_row.oid) like '%pg_column_size%'
), 'todos os artefatos JSON do rascunho possuem limite físico');
select ok(not has_function_privilege(
  'authenticated',
  'public.open_course_content_revision(uuid,uuid,uuid,text,uuid,uuid,uuid)',
  'EXECUTE'
), 'frontend não abre uma revisão sem passar pela API de autoria');
select ok(has_function_privilege(
  'service_role',
  'public.apply_course_content_revision(uuid,uuid,uuid,text,text)',
  'EXECUTE'
), 'servidor de autoria pode executar a aplicação atômica');
select ok(not has_function_privilege(
  'authenticated',
  'public.cleanup_course_content_revisions(uuid,boolean,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)',
  'EXECUTE'
), 'usuário comum não executa a retenção administrativa');
select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private, pg_temp'
      = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.apply_course_content_revision(uuid,uuid,uuid,text,text)'::regprocedure
), 'aplicação é SECURITY DEFINER com search_path fixo');
select ok(
  strpos(
    pg_get_functiondef(
      'public.open_course_content_revision(uuid,uuid,uuid,text,uuid,uuid,uuid)'
        ::regprocedure
    ),
    'pg_advisory_xact_lock'
  ) > 0,
  'abertura idempotente serializa chamadas concorrentes pelo revisionId'
);
select ok(
  pg_get_functiondef(
    'public.get_catalog_course_admin(uuid,uuid)'::regprocedure
  ) like '%card.deleted_at is null%',
  'administração do catálogo não conta cards tombstonados'
);
select ok(
  regexp_count(
    pg_get_functiondef((
      'public.get_personal_library_course_structure('
      || 'uuid,uuid,uuid,text,uuid,integer,integer,uuid'
      || ')'
    )::regprocedure),
    'card\.deleted_at is null'
  ) >= 3,
  'biblioteca pessoal não conta nem lista cards tombstonados'
);
select ok(
  pg_get_functiondef(
    'private.guard_learning_component_placement()'::regprocedure
  ) like '%card.deleted_at is null%',
  'associação pedagógica recusa card tombstonado'
);
select ok(
  pg_get_functiondef(
    'private.learning_component_continuity(uuid,text)'::regprocedure
  ) like '%card.deleted_at is null%',
  'continuidade pedagógica não resolve card tombstonado'
);
select ok(
  pg_get_functiondef(
    'private.materialize_authoring_learning_metadata(uuid,uuid)'::regprocedure
  ) like '%card.deleted_at is null%',
  'materialização pedagógica não reutiliza card tombstonado'
);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aa700000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'revision-editor@aralearn.test',
    'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aa700000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'revision-other@aralearn.test',
    'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  )
on conflict(id) do nothing;

select set_config('request.jwt.claim.role', 'service_role', true);

insert into private.app_role_assignments(
  user_id, role, active, granted_by, granted_at, reason, updated_at
) values (
  'aa700000-0000-4000-8000-000000000001',
  'owner',
  true,
  'aa700000-0000-4000-8000-000000000001',
  now(),
  'Teste da correção pontual',
  now()
) on conflict(user_id, role) do update set
  active = true,
  revoked_at = null,
  revoked_by = null,
  updated_at = now();

select public.create_authoring_api_client(
  'aa700000-0000-4000-8000-000000000001',
  'aa700000-0000-4000-8000-000000000001',
  'Correção editorial',
  'arl_revision_catalog',
  repeat('6', 64),
  array['authoring:read','catalog:publish']::text[],
  30,
  null
);
select public.create_authoring_api_client(
  'aa700000-0000-4000-8000-000000000001',
  'aa700000-0000-4000-8000-000000000001',
  'Correção pessoal',
  'arl_revision_private',
  repeat('7', 64),
  array['authoring:private:read','authoring:private:write']::text[],
  30,
  null
);

create temporary table course_revision_fixtures(
  course_id uuid primary key,
  microsequence_a_id uuid not null,
  microsequence_b_id uuid not null,
  module_id uuid not null,
  lesson_id uuid not null,
  card_a_id uuid not null,
  card_b_id uuid not null,
  card_removed_id uuid not null,
  block_a_id uuid not null,
  block_b_id uuid not null,
  block_removed_id uuid not null
);

create function pg_temp.make_revision_course(
  p_course_id uuid,
  p_owner_id uuid,
  p_contract_key text,
  p_hash text
)
returns void
language plpgsql
as $$
declare
  v_module_id uuid := gen_random_uuid();
  v_lesson_id uuid := gen_random_uuid();
  v_microsequence_a_id uuid := gen_random_uuid();
  v_microsequence_b_id uuid := gen_random_uuid();
  v_card_a_id uuid := gen_random_uuid();
  v_card_b_id uuid := gen_random_uuid();
  v_card_removed_id uuid := gen_random_uuid();
  v_block_a_id uuid := gen_random_uuid();
  v_block_b_id uuid := gen_random_uuid();
  v_block_removed_id uuid := gen_random_uuid();
begin
  insert into public.courses(
    id, owner_id, source_course_id, status, contract_key, title, goal,
    contract_scope, publication_seq, content_hash, project_id, position
  ) values (
    p_course_id, p_owner_id, null, 'published', p_contract_key,
    'Curso ' || p_contract_key,
    'Comprovar uma correção pontual sem reconstruir o curso.',
    'Teste de revisão pontual',
    1, p_hash, gen_random_uuid(), 0
  );
  insert into public.modules(
    id, course_id, contract_key, position, title
  ) values (
    v_module_id, p_course_id, 'module-1', 0, 'Módulo'
  );
  insert into public.lessons(
    id, course_id, module_id, contract_key, position, title
  ) values (
    v_lesson_id, p_course_id, v_module_id, 'lesson-1', 0, 'Lição'
  );
  insert into public.course_guides(id, course_id, module_id, goal)
  values(gen_random_uuid(), p_course_id, v_module_id, 'Orientar o módulo.');
  insert into public.course_guides(id, course_id, lesson_id, goal)
  values(gen_random_uuid(), p_course_id, v_lesson_id, 'Orientar a lição.');
  insert into public.microsequences(
    id, course_id, lesson_id, contract_key, position, title, goal, role, status
  ) values
    (
      v_microsequence_a_id, p_course_id, v_lesson_id, 'micro-a', 0,
      'Microssequência A', 'Explicar o primeiro conceito.', 'explain', 'ready'
    ),
    (
      v_microsequence_b_id, p_course_id, v_lesson_id, 'micro-b', 1,
      'Microssequência B', 'Conservar conteúdo fora do recorte.', 'review', 'ready'
    );
  insert into public.cards(
    id, course_id, lesson_id, microsequence_id, contract_key, position,
    resource, kind, exercise, title, after_text, card_kind
  ) values
    (
      v_card_a_id, p_course_id, v_lesson_id, v_microsequence_a_id,
      'card-a', 1, 'paragraph', 'theory', 'none',
      'Card A', '', 'theory'
    ),
    (
      v_card_b_id, p_course_id, v_lesson_id, v_microsequence_b_id,
      'card-b', 1, 'paragraph', 'theory', 'none',
      'Card B', '', 'theory'
    ),
    (
      v_card_removed_id, p_course_id, v_lesson_id, v_microsequence_a_id,
      'card-removed', 2, 'paragraph', 'theory', 'none',
      'Card removível', '', 'theory'
    );
  insert into public.card_blocks(
    id, course_id, card_id, contract_key, position, role, block_type,
    value_text, region, is_primary, value, has_value
  ) values
    (
      v_block_a_id, p_course_id, v_card_a_id, 'block-a', 0, 'primary',
      'paragraph', 'Texto original A.', 'primary', true,
      'Texto original A.', true
    ),
    (
      v_block_b_id, p_course_id, v_card_b_id, 'block-b', 0, 'primary',
      'paragraph', 'Texto original B.', 'primary', true,
      'Texto original B.', true
    ),
    (
      v_block_removed_id, p_course_id, v_card_removed_id,
      'block-removed', 0, 'primary',
      'paragraph', 'Texto que sairá do curso.', 'primary', true,
      'Texto que sairá do curso.', true
    );
  insert into course_revision_fixtures(
    course_id, microsequence_a_id, microsequence_b_id, module_id, lesson_id,
    card_a_id, card_b_id, card_removed_id,
    block_a_id, block_b_id, block_removed_id
  ) values (
    p_course_id, v_microsequence_a_id, v_microsequence_b_id,
    v_module_id, v_lesson_id, v_card_a_id, v_card_b_id,
    v_card_removed_id, v_block_a_id, v_block_b_id, v_block_removed_id
  );
end;
$$;

select pg_temp.make_revision_course(
  'c7000000-0000-4000-8000-000000000001',
  null,
  'revision-official',
  repeat('a', 64)
);
select pg_temp.make_revision_course(
  'c7000000-0000-4000-8000-000000000002',
  'aa700000-0000-4000-8000-000000000001',
  'revision-private',
  repeat('b', 64)
);
select pg_temp.make_revision_course(
  'c7000000-0000-4000-8000-000000000003',
  'aa700000-0000-4000-8000-000000000002',
  'revision-other-private',
  repeat('c', 64)
);
select pg_temp.make_revision_course(
  'c7000000-0000-4000-8000-000000000004',
  'aa700000-0000-4000-8000-000000000001',
  'revision-rollback',
  repeat('d', 64)
);
select pg_temp.make_revision_course(
  'c7000000-0000-4000-8000-000000000005',
  null,
  'revision-copy-on-write',
  repeat('5', 64)
);

insert into public.user_course_selections(
  id, user_id, course_id, position
) values (
  'ce700000-0000-4000-8000-000000000001',
  'aa700000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000002',
  0
);
insert into public.user_course_selections(
  id, user_id, course_id, position
) values (
  'ce700000-0000-4000-8000-000000000006',
  'aa700000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000001',
  2
);
insert into public.lesson_progress(
  id, selection_id, user_id, course_id, lesson_id,
  cursor, first_viewed_at, last_activity_at
) select
  'ce700000-0000-4000-8000-000000000002',
  'ce700000-0000-4000-8000-000000000001',
  'aa700000-0000-4000-8000-000000000001',
  fixture.course_id, fixture.lesson_id, 0, now(), now()
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000002';
insert into public.lesson_progress(
  id, selection_id, user_id, course_id, lesson_id,
  cursor, first_viewed_at, last_activity_at
) select
  'ce700000-0000-4000-8000-000000000007',
  'ce700000-0000-4000-8000-000000000006',
  'aa700000-0000-4000-8000-000000000001',
  fixture.course_id, fixture.lesson_id, 0, now(), now()
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000001';
insert into public.user_course_selections(
  id, user_id, course_id, position
) values (
  'ce700000-0000-4000-8000-000000000005',
  'aa700000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000005',
  1
);
insert into public.card_progress(
  id, selection_id, user_id, course_id, card_id,
  first_viewed_at, attempts, last_activity_at
) select
  'ce700000-0000-4000-8000-000000000003',
  'ce700000-0000-4000-8000-000000000001',
  'aa700000-0000-4000-8000-000000000001',
  fixture.course_id, fixture.card_a_id, now(), 1, now()
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000002';
update public.card_progress
set completed_at=now()
where id='ce700000-0000-4000-8000-000000000003';
insert into public.card_progress(
  id, selection_id, user_id, course_id, card_id,
  first_viewed_at, completed_at, attempts, last_activity_at
)
select
  progress.id,
  progress.selection_id,
  'aa700000-0000-4000-8000-000000000001',
  fixture.course_id,
  case progress.card_key
    when 'card-b' then fixture.card_b_id
    else fixture.card_removed_id
  end,
  now(),
  case when progress.card_key='card-b' then now() else null end,
  1,
  now()
from course_revision_fixtures fixture
cross join (values
  (
    'ce700000-0000-4000-8000-000000000008'::uuid,
    'ce700000-0000-4000-8000-000000000001'::uuid,
    'card-b'
  ),
  (
    'ce700000-0000-4000-8000-000000000009'::uuid,
    'ce700000-0000-4000-8000-000000000001'::uuid,
    'card-removed'
  )
) progress(id,selection_id,card_key)
where fixture.course_id='c7000000-0000-4000-8000-000000000002';
insert into public.card_progress(
  id, selection_id, user_id, course_id, card_id,
  first_viewed_at, completed_at, attempts, last_activity_at
)
select
  progress.id,
  'ce700000-0000-4000-8000-000000000006',
  'aa700000-0000-4000-8000-000000000001',
  fixture.course_id,
  case progress.card_key
    when 'card-a' then fixture.card_a_id
    when 'card-b' then fixture.card_b_id
    else fixture.card_removed_id
  end,
  now(),
  case when progress.card_key<>'card-removed' then now() else null end,
  1,
  now()
from course_revision_fixtures fixture
cross join (values
  ('ce700000-0000-4000-8000-000000000010'::uuid,'card-a'),
  ('ce700000-0000-4000-8000-000000000011'::uuid,'card-b'),
  ('ce700000-0000-4000-8000-000000000012'::uuid,'card-removed')
) progress(id,card_key)
where fixture.course_id='c7000000-0000-4000-8000-000000000001';
insert into public.card_comments(
  id, selection_id, user_id, course_id, card_id, body
) select
  'ce700000-0000-4000-8000-000000000004',
  'ce700000-0000-4000-8000-000000000001',
  'aa700000-0000-4000-8000-000000000001',
  fixture.course_id, fixture.card_a_id,
  'Comentário que deve permanecer ligado ao mesmo card.'
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000002';
insert into public.card_comments(
  id, selection_id, user_id, course_id, card_id, body
)
select
  comment.id,
  comment.selection_id,
  'aa700000-0000-4000-8000-000000000001',
  fixture.course_id,
  fixture.card_removed_id,
  'Comentário de um card removido que deve permanecer como histórico.'
from course_revision_fixtures fixture
cross join (values
  (
    'ce700000-0000-4000-8000-000000000013'::uuid,
    'ce700000-0000-4000-8000-000000000001'::uuid
  )
) comment(id,selection_id)
where fixture.course_id='c7000000-0000-4000-8000-000000000002';
insert into public.card_comments(
  id, selection_id, user_id, course_id, card_id, body
)
select
  'ce700000-0000-4000-8000-000000000014',
  'ce700000-0000-4000-8000-000000000006',
  'aa700000-0000-4000-8000-000000000001',
  fixture.course_id,
  fixture.card_removed_id,
  'Comentário editorial preservado no histórico.'
from course_revision_fixtures fixture
where fixture.course_id='c7000000-0000-4000-8000-000000000001';

create function pg_temp.revision_client(p_target text)
returns uuid
language sql
stable
as $$
  select client.id
  from private.authoring_api_clients client
  where client.key_prefix = case p_target
    when 'catalog' then 'arl_revision_catalog'
    else 'arl_revision_private'
  end;
$$;

create function pg_temp.revision_patch(
  p_course_id uuid,
  p_microsequence_id uuid,
  p_value text
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_patch jsonb;
  v_blocks jsonb;
  v_removed_card_id uuid;
begin
  v_patch := private.course_revision_fragment_rows(
    p_course_id, p_microsequence_id
  ) - array['microsequences','dependencies','microsequenceStatements'];
  select card.id into v_removed_card_id
  from public.cards card
  where card.course_id=p_course_id
    and card.microsequence_id=p_microsequence_id
    and card.contract_key='card-removed'
    and card.deleted_at is null;
  v_patch := jsonb_set(v_patch,'{cards}',coalesce((
    select jsonb_agg(item order by (item->>'position')::integer,item->>'id')
    from jsonb_array_elements(v_patch->'cards') item
    where private.try_uuid(item->>'id') is distinct from v_removed_card_id
  ),'[]'::jsonb));
  v_patch := jsonb_set(v_patch,'{blocks}',coalesce((
    select jsonb_agg(item order by (item->>'position')::integer,item->>'id')
    from jsonb_array_elements(v_patch->'blocks') item
    where private.try_uuid(item->>'cardId') is distinct from v_removed_card_id
  ),'[]'::jsonb));
  v_blocks := v_patch->'blocks';
  v_blocks := jsonb_set(
    v_blocks, '{0,value}', to_jsonb(p_value), true
  );
  return jsonb_set(v_patch, '{blocks}', v_blocks);
end;
$$;

create function pg_temp.empty_revision_patch()
returns jsonb
language plpgsql
immutable
as $$
declare
  v_patch jsonb := '{}'::jsonb;
  v_store text;
begin
  foreach v_store in array private.course_revision_descendant_store_names()
  loop
    v_patch := jsonb_set(v_patch, array[v_store], '[]'::jsonb);
  end loop;
  return v_patch;
end;
$$;

create function pg_temp.reactivation_revision_patch(
  p_course_id uuid,
  p_microsequence_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_patch jsonb;
  v_card_id uuid;
  v_block_id uuid;
  v_card jsonb;
  v_block jsonb;
begin
  select fixture.card_removed_id,fixture.block_removed_id
    into v_card_id,v_block_id
  from course_revision_fixtures fixture
  where fixture.course_id=p_course_id;
  v_patch := private.course_revision_fragment_rows(
    p_course_id,p_microsequence_id
  ) - array['microsequences','dependencies','microsequenceStatements'];
  select private.local_row('cards',to_jsonb(card))
    - array['deletedAt','createdAt','updatedAt','revision']
    || jsonb_build_object(
      'contractKey','card-removed',
      'position',2
    )
    into v_card
  from public.cards card
  where card.id=v_card_id;
  select private.local_row('blocks',to_jsonb(block))
    - array['deletedAt','createdAt','updatedAt','revision']
    || jsonb_build_object(
      'id',v_block_id,
      'cardId',v_card_id,
      'contractKey','block-removed',
      'position',0,
      'value','Texto reativado.',
      'valueText','Texto reativado.'
    )
    into v_block
  from public.card_blocks block
  where block.id=(
    select fixture.block_a_id
    from course_revision_fixtures fixture
    where fixture.course_id=p_course_id
  );
  v_patch := jsonb_set(
    v_patch,'{cards}',(v_patch->'cards')||jsonb_build_array(v_card),true
  );
  return jsonb_set(
    v_patch,'{blocks}',(v_patch->'blocks')||jsonb_build_array(v_block),true
  );
end;
$$;

create function pg_temp.cross_block_line_patch(p_patch jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_course_id text := p_patch->'cards'->0->>'courseId';
  v_card_id text := p_patch->'cards'->0->>'id';
  v_first_block_id text := p_patch->'blocks'->0->>'id';
  v_second_block_id text := 'cb700000-0000-4000-8000-000000000002';
  v_first_point_id text := 'c1700000-0000-4000-8000-000000000001';
  v_second_point_id text := 'c1700000-0000-4000-8000-000000000002';
  v_result jsonb := p_patch;
begin
  v_result := jsonb_set(
    v_result,
    '{blocks}',
    (v_result->'blocks') || jsonb_build_array(jsonb_build_object(
      'id', v_second_block_id,
      'courseId', v_course_id,
      'cardId', v_card_id
    )),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{points}',
    jsonb_build_array(
      jsonb_build_object(
        'id', v_first_point_id,
        'courseId', v_course_id,
        'blockId', v_first_block_id
      ),
      jsonb_build_object(
        'id', v_second_point_id,
        'courseId', v_course_id,
        'blockId', v_second_block_id
      )
    ),
    true
  );
  return jsonb_set(
    v_result,
    '{lines}',
    jsonb_build_array(jsonb_build_object(
      'id', 'c1700000-0000-4000-8000-000000000003',
      'courseId', v_course_id,
      'blockId', v_first_block_id,
      'fromPointId', v_second_point_id,
      'toPointId', v_first_point_id
    )),
    true
  );
end;
$$;

create function pg_temp.capture_revision_apply(
  p_actor_id uuid,
  p_client_id uuid,
  p_revision_id uuid,
  p_request_id text,
  p_base_hash text
)
returns text
language plpgsql
as $$
begin
  perform public.apply_course_content_revision(
    p_actor_id, p_client_id, p_revision_id, p_request_id, p_base_hash
  );
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

create temporary table resolved_private_copy as
select public.resolve_private_course_revision_target(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('private'),
  'ca700000-0000-4000-8000-000000000020',
  fixture.course_id,
  fixture.microsequence_a_id,
  fixture.card_a_id
) result
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000005';

select is(
  (select result->>'forked' from resolved_private_copy),
  'true',
  'chave pessoal cria copy-on-write quando a seleção ainda é oficial'
);
select is(
  (
    select course.source_course_id
    from public.courses course
    where course.id = (
      select (result->>'courseId')::uuid from resolved_private_copy
    )
  ),
  'c7000000-0000-4000-8000-000000000005'::uuid,
  'a correção pessoal nunca aponta a escrita para a árvore oficial'
);
select is(
  (
    select owner_id from public.courses
    where id = (
      select (result->>'courseId')::uuid from resolved_private_copy
    )
  ),
  'aa700000-0000-4000-8000-000000000001'::uuid,
  'cópia criada pertence somente ao autor'
);
select ok(
  (
    select (result->>'cardId')::uuid from resolved_private_copy
  ) <> (
    select card_a_id from course_revision_fixtures
    where course_id = 'c7000000-0000-4000-8000-000000000005'
  ),
  'card da cópia recebe UUID próprio'
);
select is(
  public.resolve_private_course_revision_target(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000020',
    'c7000000-0000-4000-8000-000000000005',
    (
      select microsequence_a_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000005'
    ),
    (
      select card_a_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000005'
    )
  )->>'idempotent',
  'true',
  'repetição da resolução reutiliza a mesma cópia pessoal'
);
select is(
  public.open_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000007',
    'private',
    (
      select (result->>'courseId')::uuid from resolved_private_copy
    ),
    (
      select (result->>'microsequenceId')::uuid from resolved_private_copy
    ),
    (
      select (result->>'cardId')::uuid from resolved_private_copy
    )
  )->>'target',
  'private',
  'recorte mapeado abre a revisão pessoal sem 42501'
);

create temporary table opened_catalog_revision as
select public.open_course_content_revision(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('catalog'),
  'ca700000-0000-4000-8000-000000000001',
  'catalog',
  fixture.course_id,
  fixture.microsequence_a_id,
  fixture.card_a_id
) result
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000001';

select is(
  (select result->>'status' from opened_catalog_revision),
  'open',
  'editor abre um rascunho sobre um card oficial'
);
select is(
  public.open_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('catalog'),
    'ca700000-0000-4000-8000-000000000001',
    'catalog',
    'c7000000-0000-4000-8000-000000000001',
    (
      select microsequence_a_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000001'
    ),
    (
      select card_a_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000001'
    )
  )->>'idempotent',
  'true',
  'abertura repetida não cria outro rascunho'
);
select throws_ok($call$
  select public.open_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000009',
    'catalog',
    'c7000000-0000-4000-8000-000000000001',
    (
      select microsequence_a_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000001'
    ),
    null
  )
$call$, '42501', 'Revisão de conteúdo não autorizada.',
  'cliente pessoal não abre uma correção editorial');
select throws_ok($call$
  select public.open_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000010',
    'private',
    'c7000000-0000-4000-8000-000000000003',
    (
      select microsequence_a_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000003'
    ),
    null
  )
$call$, '42501', 'Revisão de conteúdo não autorizada.',
  'autor não abre curso pessoal de outra conta');

create temporary table opened_private_revision as
select public.open_course_content_revision(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('private'),
  'ca700000-0000-4000-8000-000000000002',
  'private',
  fixture.course_id,
  fixture.microsequence_a_id,
  null
) result
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000002';

select is(
  (select result->>'target' from opened_private_revision),
  'private',
  'autor abre uma correção no próprio curso'
);
select ok(
  public.get_course_content_revision_fragment(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000002'
  )->'rows' ? 'blocks',
  'consulta retorna somente o fragmento relacional necessário'
);
select throws_ok($call$
  select public.get_course_content_revision(
    'aa700000-0000-4000-8000-000000000002',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000002'
  )
$call$, '42501', 'Revisão de conteúdo não encontrada ou não autorizada.',
  'outra conta não lê o rascunho');

create temporary table saved_catalog_patch as
select public.save_course_content_revision_patch(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('catalog'),
  'ca700000-0000-4000-8000-000000000001',
  'revision-catalog-patch-1',
  repeat('a', 64),
  jsonb_build_object(
    'courseId', fixture.course_id,
    'microsequences', jsonb_build_array(
      jsonb_build_object(
        'id', fixture.microsequence_a_id,
        'cards', jsonb_build_array(jsonb_build_object(
          'id', fixture.card_a_id,
          'resource', 'paragraph',
          'kind', 'theory',
          'title', 'Card A',
          'content', jsonb_build_object(
            'type', 'paragraph', 'value', 'Texto editorial corrigido.'
          )
        ))
      )
    )
  ),
  jsonb_build_object(
    'microsequenceId', fixture.microsequence_a_id,
    'compiled', true
  ),
  pg_temp.revision_patch(
    fixture.course_id, fixture.microsequence_a_id,
    'Texto editorial corrigido.'
  ),
  jsonb_build_object(
    'stores', jsonb_build_object(
      'blocks', jsonb_build_object(
        'updated', jsonb_build_array(fixture.block_a_id)
      )
    )
  ),
  repeat('e', 64)
) result
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000001';

select is(
  (select result->>'status' from saved_catalog_patch),
  'patched',
  'fonte formal e patch ficam persistidos sem alterar o curso'
);
select is(
  (
    select authoring_fragment->'microsequences'->0->'cards'->0
      ->'content'->>'value'
    from private.course_content_revisions
    where id = 'ca700000-0000-4000-8000-000000000001'
  ),
  'Texto editorial corrigido.',
  'rascunho conserva a fonte autoral formal'
);
select is(
  (
    select value_text from public.card_blocks
    where id = (
      select block_a_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000001'
    )
  ),
  'Texto original A.',
  'salvar o rascunho não escreve na árvore publicada'
);
select is(
  (
    select public.save_course_content_revision_patch(
      'aa700000-0000-4000-8000-000000000001',
      pg_temp.revision_client('catalog'),
      'ca700000-0000-4000-8000-000000000001',
      'revision-catalog-patch-1',
      repeat('a', 64),
      revision.authoring_fragment,
      revision.compiled_fragment,
      revision.relational_patch,
      revision.scoped_diff,
      revision.expected_content_hash
    )->>'idempotent'
    from private.course_content_revisions revision
    where revision.id = 'ca700000-0000-4000-8000-000000000001'
  ),
  'true',
  'repetição exata do patch retorna o recibo'
);
select throws_ok($call$
  select public.save_course_content_revision_patch(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('catalog'),
    'ca700000-0000-4000-8000-000000000001',
    'revision-catalog-patch-1',
    repeat('a', 64),
    revision.authoring_fragment,
    revision.compiled_fragment,
    revision.relational_patch,
    revision.scoped_diff,
    repeat('1', 64)
  )
  from private.course_content_revisions revision
  where revision.id = 'ca700000-0000-4000-8000-000000000001'
$call$, '23514', 'requestId reutilizado com outro patch.',
  'requestId não admite outro conteúdo');

select public.save_course_content_revision_patch(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('private'),
  'ca700000-0000-4000-8000-000000000002',
  'revision-private-patch-1',
  repeat('b', 64),
  jsonb_build_object(
    'courseId', fixture.course_id,
    'microsequences', jsonb_build_array(jsonb_build_object(
      'id', fixture.microsequence_a_id,
      'cards', jsonb_build_array(jsonb_build_object(
        'id', fixture.card_a_id,
        'content', jsonb_build_object(
          'type', 'paragraph', 'value', 'Texto pessoal corrigido.'
        )
      ))
    ))
  ),
  jsonb_build_object(
    'microsequenceId', fixture.microsequence_a_id,
    'compiled', true
  ),
  pg_temp.revision_patch(
    fixture.course_id, fixture.microsequence_a_id,
    'Texto pessoal corrigido.'
  ),
  jsonb_build_object(
    'stores', jsonb_build_object(
      'blocks', jsonb_build_object(
        'updated', jsonb_build_array(fixture.block_a_id)
      )
    )
  ),
  repeat('f', 64)
)
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000002';

select is(
  public.apply_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('catalog'),
    'ca700000-0000-4000-8000-000000000001',
    'revision-catalog-apply-1',
    repeat('a', 64)
  )->>'status',
  'applied',
  'correção editorial é aplicada integralmente'
);
select is(
  (
    select value_text from public.card_blocks
    where id = (
      select block_a_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000001'
    )
  ),
  'Texto editorial corrigido.',
  'somente o bloco corrigido recebe o novo conteúdo'
);
select is(
  (
    select value_text from public.card_blocks
    where id = (
      select block_b_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000001'
    )
  ),
  'Texto original B.',
  'microssequência externa ao recorte não é reescrita'
);
select is(
  (
    select content_hash || ':' || publication_seq::text
    from public.courses
    where id = 'c7000000-0000-4000-8000-000000000001'
  ),
  repeat('e', 64) || ':2',
  'raiz oficial confirma o novo hash e a nova publicação'
);
select ok(
  (
    select card.deleted_at is not null
    from public.cards card
    join course_revision_fixtures fixture
      on fixture.card_removed_id=card.id
    where fixture.course_id='c7000000-0000-4000-8000-000000000001'
  ),
  'card oficial ausente no novo fragmento vira tombstone'
);
select ok(exists(
  select 1
  from public.card_progress progress
  join course_revision_fixtures fixture
    on fixture.card_removed_id=progress.card_id
  where fixture.course_id='c7000000-0000-4000-8000-000000000001'
), 'progresso do card oficial tombstonado permanece');
select ok(exists(
  select 1
  from public.card_comments comment
  join course_revision_fixtures fixture
    on fixture.card_removed_id=comment.card_id
  where fixture.course_id='c7000000-0000-4000-8000-000000000001'
), 'comentário do card oficial tombstonado permanece');
select is(
  (
    select progress.cursor
    from public.lesson_progress progress
    where progress.id='ce700000-0000-4000-8000-000000000007'
  ),
  1,
  'reconciliação oficial ignora o tombstone ao calcular o cursor'
);
select ok(
  (
    select progress.completed_at is not null
    from public.lesson_progress progress
    where progress.id='ce700000-0000-4000-8000-000000000007'
  ),
  'lição oficial pode concluir quando todos os cards ativos foram concluídos'
);
select is(
  jsonb_array_length(private.course_revision_fragment_rows(
    'c7000000-0000-4000-8000-000000000001',
    (
      select microsequence_a_id from course_revision_fixtures
      where course_id='c7000000-0000-4000-8000-000000000001'
    )
  )->'cards'),
  1,
  'fragmento formal não remonta card oficial tombstonado'
);
select is(
  jsonb_array_length(
    public.get_catalog_course_structure_admin(
      'aa700000-0000-4000-8000-000000000001',
      'c7000000-0000-4000-8000-000000000001',
      'cards',
      (
        select microsequence_a_id from course_revision_fixtures
        where course_id='c7000000-0000-4000-8000-000000000001'
      ),
      25,
      null,
      null
    )->'items'
  ),
  1,
  'leitura paginada do catálogo não expõe card tombstonado'
);
select is(
  (private.catalog_submission_tree_counts(
    'c7000000-0000-4000-8000-000000000001'
  )->>'cards')::integer,
  2,
  'contagem editorial considera somente cards ativos'
);

select set_config(
  'request.jwt.claim.sub',
  'aa700000-0000-4000-8000-000000000001',
  true
);
create temporary table fork_after_catalog_revision as
select public.fork_catalog_course_for_editing(
  'c7000000-0000-4000-8000-000000000001',
  'ca700000-0000-4000-8000-000000000037'
) result;
select is(
  (
    select count(*)::integer
    from public.cards card
    where card.course_id=(
      select (result->>'courseId')::uuid
      from fork_after_catalog_revision
    )
  ),
  2,
  'copy-on-write posterior à correção não clona o tombstone'
);
select ok(not exists(
  select 1
  from public.cards card
  where card.course_id=(
      select (result->>'courseId')::uuid
      from fork_after_catalog_revision
    )
    and (
      card.deleted_at is not null
      or card.contract_key like '__revision_%'
    )
), 'cópia pessoal contém apenas cards públicos ativos');

select is(
  public.apply_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('catalog'),
    'ca700000-0000-4000-8000-000000000001',
    'revision-catalog-apply-1',
    repeat('a', 64)
  )->>'idempotent',
  'true',
  'repetição exata da aplicação não altera outra vez o curso'
);
select throws_ok($call$
  select public.apply_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('catalog'),
    'ca700000-0000-4000-8000-000000000001',
    'revision-catalog-apply-1',
    repeat('0', 64)
  )
$call$, '23514', 'requestId reutilizado com outra aplicação.',
  'recibo de aplicação não admite outro corpo');

update private.authoring_api_clients
set revoked_at = now()
where key_prefix = 'arl_revision_catalog';
select throws_ok($call$
  select public.apply_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('catalog'),
    'ca700000-0000-4000-8000-000000000001',
    'revision-catalog-apply-1',
    repeat('a', 64)
  )
$call$, '42501', 'Revisão não está pronta ou não foi autorizada.',
  'revogação é verificada antes de devolver recibo idempotente');
update private.authoring_api_clients
set revoked_at = null
where key_prefix = 'arl_revision_catalog';

select is(
  public.apply_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000002',
    'revision-private-apply-1',
    repeat('b', 64)
  )->>'status',
  'applied',
  'autor aplica a correção do próprio curso'
);
select is(
  (
    select value_text from public.card_blocks
    where id = (
      select block_a_id from course_revision_fixtures
      where course_id = 'c7000000-0000-4000-8000-000000000002'
    )
  ),
  'Texto pessoal corrigido.',
  'curso pessoal recebe a alteração pontual'
);
select ok(
  (
    select card.deleted_at is not null
    from public.cards card
    join course_revision_fixtures fixture
      on fixture.card_removed_id=card.id
    where fixture.course_id='c7000000-0000-4000-8000-000000000002'
  ),
  'card pessoal ausente no novo fragmento vira tombstone'
);
select ok(exists(
  select 1
  from public.card_progress progress
  join course_revision_fixtures fixture
    on fixture.card_removed_id=progress.card_id
  where fixture.course_id='c7000000-0000-4000-8000-000000000002'
), 'progresso do card pessoal tombstonado permanece');
select ok(exists(
  select 1
  from public.card_comments comment
  join course_revision_fixtures fixture
    on fixture.card_removed_id=comment.card_id
  where fixture.course_id='c7000000-0000-4000-8000-000000000002'
), 'comentário do card pessoal tombstonado permanece');
select is(
  (
    select progress.cursor
    from public.lesson_progress progress
    where progress.id='ce700000-0000-4000-8000-000000000002'
  ),
  1,
  'reconciliação pessoal ignora o tombstone ao calcular o cursor'
);
select ok(
  (
    select progress.completed_at is not null
    from public.lesson_progress progress
    where progress.id='ce700000-0000-4000-8000-000000000002'
  ),
  'lição pessoal pode concluir quando todos os cards ativos foram concluídos'
);
select is(
  (
    select card_id from public.card_progress
    where id = 'ce700000-0000-4000-8000-000000000003'
  ),
  (
    select card_a_id from course_revision_fixtures
    where course_id = 'c7000000-0000-4000-8000-000000000002'
  ),
  'progresso continua ligado ao UUID preservado do card'
);
select is(
  (
    select card_id from public.card_comments
    where id = 'ce700000-0000-4000-8000-000000000004'
  ),
  (
    select card_a_id from course_revision_fixtures
    where course_id = 'c7000000-0000-4000-8000-000000000002'
  ),
  'comentário continua ligado ao UUID preservado do card'
);
select ok(exists(
  select 1
  from private.sync_changes change
  where change.audience_user_id =
      'aa700000-0000-4000-8000-000000000001'
    and change.course_id = 'c7000000-0000-4000-8000-000000000002'
    and change.entity_type = 'courseSelections'
    and change.entity_id = 'ce700000-0000-4000-8000-000000000001'
    and change.operation = 'upsert'
), 'correção pessoal acorda a réplica pela seleção do usuário');
select ok(not exists(
  select 1
  from private.sync_changes change
  where change.course_id = 'c7000000-0000-4000-8000-000000000002'
    and change.entity_type = 'coursePublication'
), 'correção pessoal não cria publicação global no feed');

select public.open_course_content_revision(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('private'),
  'ca700000-0000-4000-8000-000000000036',
  'private',
  fixture.course_id,
  fixture.microsequence_a_id,
  fixture.card_removed_id
)
from course_revision_fixtures fixture
where fixture.course_id='c7000000-0000-4000-8000-000000000002';
select public.save_course_content_revision_patch(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('private'),
  'ca700000-0000-4000-8000-000000000036',
  'revision-reactivation-patch',
  repeat('f',64),
  jsonb_build_object(
    'courseId',fixture.course_id,
    'microsequences',jsonb_build_array(jsonb_build_object(
      'id',fixture.microsequence_a_id,
      'cards',jsonb_build_array(
        jsonb_build_object('id',fixture.card_a_id),
        jsonb_build_object('id',fixture.card_removed_id)
      )
    ))
  ),
  jsonb_build_object('compiled',true),
  pg_temp.reactivation_revision_patch(
    fixture.course_id,fixture.microsequence_a_id
  ),
  jsonb_build_object(
    'stores',jsonb_build_object(
      'cards',jsonb_build_object(
        'inserted',jsonb_build_array(fixture.card_removed_id)
      )
    )
  ),
  repeat('9',64)
)
from course_revision_fixtures fixture
where fixture.course_id='c7000000-0000-4000-8000-000000000002';
select is(
  public.apply_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000036',
    'revision-reactivation-apply',
    repeat('f',64)
  )->>'status',
  'applied',
  'nova revisão reativa o mesmo UUID tombstonado'
);
select is(
  (
    select card.contract_key||':'||(card.deleted_at is null)::text
    from public.cards card
    join course_revision_fixtures fixture
      on fixture.card_removed_id=card.id
    where fixture.course_id='c7000000-0000-4000-8000-000000000002'
  ),
  'card-removed:true',
  'reativação restaura a chave canônica e remove o tombstone'
);
select ok(exists(
  select 1
  from public.card_comments comment
  join course_revision_fixtures fixture
    on fixture.card_removed_id=comment.card_id
  where fixture.course_id='c7000000-0000-4000-8000-000000000002'
), 'reativação preserva o comentário ligado ao mesmo UUID');
select is(
  public.apply_course_content_revision(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000036',
    'revision-reactivation-apply',
    repeat('f',64)
  )->>'idempotent',
  'true',
  'repetição da reativação devolve o recibo sem nova escrita'
);

select public.open_course_content_revision(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('private'),
  'ca700000-0000-4000-8000-000000000004',
  'private',
  fixture.course_id,
  fixture.microsequence_a_id,
  null
)
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000004';
select public.save_course_content_revision_patch(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('private'),
  'ca700000-0000-4000-8000-000000000004',
  'revision-empty-patch',
  repeat('d', 64),
  jsonb_build_object(
    'courseId', 'c7000000-0000-4000-8000-000000000004',
    'microsequences', '[]'::jsonb
  ),
  jsonb_build_object('compiled', true),
  pg_temp.empty_revision_patch(),
  jsonb_build_object('stores', jsonb_build_object(
    'cards', jsonb_build_object('deleted', true)
  )),
  repeat('4', 64)
);
select ok(
  pg_temp.capture_revision_apply(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000004',
    'revision-empty-apply',
    repeat('d', 64)
  ) like '23514:A revisão não passou na validação integral:%',
  'fragmento estruturalmente incompleto falha antes do commit'
);
select is(
  (
    select count(*) from public.cards
    where course_id = 'c7000000-0000-4000-8000-000000000004'
      and microsequence_id = (
        select microsequence_a_id from course_revision_fixtures
        where course_id = 'c7000000-0000-4000-8000-000000000004'
      )
  ),
  1::bigint,
  'falha de validação reverte a remoção transitória dos cards'
);
select is(
  (
    select content_hash from public.courses
    where id = 'c7000000-0000-4000-8000-000000000004'
  ),
  repeat('d', 64),
  'falha de validação também reverte o hash da raiz'
);

select public.open_course_content_revision(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('private'),
  'ca700000-0000-4000-8000-000000000005',
  'private',
  fixture.course_id,
  fixture.microsequence_b_id,
  null
)
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000004';
update public.courses
set content_hash = repeat('9', 64)
where id = 'c7000000-0000-4000-8000-000000000004';
select throws_ok($call$
  select public.save_course_content_revision_patch(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000005',
    'revision-diverged-patch',
    repeat('d', 64),
    jsonb_build_object('microsequences', '[]'::jsonb),
    jsonb_build_object('compiled', true),
    pg_temp.revision_patch(
      'c7000000-0000-4000-8000-000000000004',
      (
        select microsequence_b_id from course_revision_fixtures
        where course_id = 'c7000000-0000-4000-8000-000000000004'
      ),
      'Texto que não deve ser aceito.'
    ),
    '{}'::jsonb,
    repeat('8', 64)
  )
$call$, '40001', 'A publicação mudou desde a abertura da revisão.',
  'hash de base divergente produz conflito autoral explícito');
select is(
  (
    select status from private.course_content_revisions
    where id = 'ca700000-0000-4000-8000-000000000005'
  ),
  'open',
  'conflito preserva o rascunho para nova decisão'
);

select public.open_course_content_revision(
  'aa700000-0000-4000-8000-000000000001',
  pg_temp.revision_client('private'),
  'ca700000-0000-4000-8000-000000000006',
  'private',
  fixture.course_id,
  fixture.microsequence_b_id,
  null
)
from course_revision_fixtures fixture
where fixture.course_id = 'c7000000-0000-4000-8000-000000000002';
select throws_ok($call$
  select public.save_course_content_revision_patch(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000006',
    'revision-cross-scope-patch',
    repeat('f', 64),
    jsonb_build_object('microsequences', '[]'::jsonb),
    jsonb_build_object('compiled', true),
    jsonb_set(
      pg_temp.revision_patch(
        'c7000000-0000-4000-8000-000000000002',
        (
          select microsequence_b_id from course_revision_fixtures
          where course_id = 'c7000000-0000-4000-8000-000000000002'
        ),
        'Tentativa fora do recorte.'
      ),
      '{blocks,0,cardId}',
      to_jsonb((
        select card_a_id::text from course_revision_fixtures
        where course_id = 'c7000000-0000-4000-8000-000000000002'
      )),
      false
    ),
    '{}'::jsonb,
    repeat('7', 64)
  )
$call$, '23514', 'Linha de bloco não pertence a um card do recorte.',
  'filho que aponta para card externo à microssequência é recusado');

select throws_ok($call$
  select public.save_course_content_revision_patch(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000006',
    'revision-alias-reuse-patch',
    repeat('f', 64),
    jsonb_build_object('microsequences', '[]'::jsonb),
    jsonb_build_object('compiled', true),
    jsonb_set(
      jsonb_set(
        pg_temp.revision_patch(
          'c7000000-0000-4000-8000-000000000002',
          (
            select microsequence_b_id from course_revision_fixtures
            where course_id = 'c7000000-0000-4000-8000-000000000002'
          ),
          'Texto original B.'
        ),
        '{cardSources}',
        jsonb_build_array(jsonb_build_object(
          'id', 'cf700000-0000-4000-8000-000000000001',
          'courseId', 'c7000000-0000-4000-8000-000000000002',
          'cardId', (
            select card_b_id from course_revision_fixtures
            where course_id = 'c7000000-0000-4000-8000-000000000002'
          ),
          'position', 0,
          'value', 'Fonte de teste'
        )),
        true
      ),
      '{cardTopics}',
      jsonb_build_array(jsonb_build_object(
        'id', 'cf700000-0000-4000-8000-000000000001',
        'courseId', 'c7000000-0000-4000-8000-000000000002',
        'cardId', (
          select card_b_id from course_revision_fixtures
          where course_id = 'c7000000-0000-4000-8000-000000000002'
        ),
        'position', 0,
        'topicContractKey', 'topic-test'
      )),
      true
    ),
    '{}'::jsonb,
    repeat('7', 64)
  )
$call$, '23505',
  'Patch reutiliza o mesmo UUID em stores da mesma tabela física.',
  'aliases da mesma tabela física não podem sobrescrever o mesmo UUID');

select throws_ok($call$
  select public.save_course_content_revision_patch(
    'aa700000-0000-4000-8000-000000000001',
    pg_temp.revision_client('private'),
    'ca700000-0000-4000-8000-000000000006',
    'revision-cross-block-line-patch',
    repeat('f', 64),
    jsonb_build_object('microsequences', '[]'::jsonb),
    jsonb_build_object('compiled', true),
    pg_temp.cross_block_line_patch(pg_temp.revision_patch(
      'c7000000-0000-4000-8000-000000000002',
      (
        select microsequence_b_id from course_revision_fixtures
        where course_id = 'c7000000-0000-4000-8000-000000000002'
      ),
      'Texto original B.'
    )),
    '{}'::jsonb,
    repeat('7', 64)
  )
$call$, '23514', 'Linha do patch aponta para ponto de outro bloco.',
  'linha não pode ligar ponto pertencente a outro bloco');

insert into private.course_content_revisions(
  id,actor_user_id,target,course_id,microsequence_id,
  base_content_hash,base_publication_seq,base_fragment_hash,status,updated_at
)
select
  source.id,
  'aa700000-0000-4000-8000-000000000001',
  'private',
  fixture.course_id,
  fixture.microsequence_a_id,
  repeat('1',64),
  1,
  repeat('2',64),
  source.status,
  source.updated_at
from course_revision_fixtures fixture
cross join (values
  ('ca700000-0000-4000-8000-000000000030'::uuid,
    'cancelled'::text,now()-interval '120 days'),
  ('ca700000-0000-4000-8000-000000000031'::uuid,
    'cancelled'::text,now()-interval '119 days'),
  ('ca700000-0000-4000-8000-000000000032'::uuid,
    'open'::text,now()-interval '200 days'),
  ('ca700000-0000-4000-8000-000000000033'::uuid,
    'cancelled'::text,now()-interval '10 days'),
  ('ca700000-0000-4000-8000-000000000034'::uuid,
    'open'::text,now()-interval '100 days')
) source(id,status,updated_at)
where fixture.course_id='c7000000-0000-4000-8000-000000000002';
insert into private.course_content_revisions(
  id,actor_user_id,target,course_id,microsequence_id,
  base_content_hash,base_publication_seq,base_fragment_hash,status,
  authoring_fragment,authoring_fragment_hash,
  compiled_fragment,compiled_fragment_hash,
  relational_patch,scoped_diff,expected_content_hash,
  patched_at,updated_at
)
select
  'ca700000-0000-4000-8000-000000000035',
  'aa700000-0000-4000-8000-000000000001',
  'private',
  fixture.course_id,
  fixture.microsequence_a_id,
  repeat('1',64),
  1,
  repeat('2',64),
  'patched',
  '{}'::jsonb,
  repeat('3',64),
  '{}'::jsonb,
  repeat('4',64),
  '{}'::jsonb,
  '{}'::jsonb,
  repeat('5',64),
  now()-interval '210 days',
  now()-interval '210 days'
from course_revision_fixtures fixture
where fixture.course_id='c7000000-0000-4000-8000-000000000002';
insert into private.course_content_revision_receipts(
  revision_id,operation,request_id,request_hash,result,created_at
) values
  (
    'ca700000-0000-4000-8000-000000000030','patch',
    'retention-receipt-30',repeat('3',64),'{"status":"cancelled"}',
    now()-interval '120 days'
  ),
  (
    'ca700000-0000-4000-8000-000000000031','patch',
    'retention-receipt-31',repeat('4',64),'{"status":"cancelled"}',
    now()-interval '119 days'
  );

select throws_ok($call$
  select public.cleanup_course_content_revisions(
    'aa700000-0000-4000-8000-000000000001',
    true,
    now()-interval '30 days',
    now()-interval '180 days',
    100,
    null,
    null
  )
$call$, '22023', 'Parâmetros de retenção de correções inválidos.',
  'retenção mínima impede apagar recibos idempotentes recentes');

create temporary table revision_cleanup_dry_run as
select public.cleanup_course_content_revisions(
  'aa700000-0000-4000-8000-000000000001',
  true,
  now()-interval '90 days',
  now()-interval '365 days',
  1,
  null,
  null
) result;
select is(
  (select (result->>'candidateRows')::integer from revision_cleanup_dry_run),
  1,
  'dry-run limita a primeira página da retenção'
);
select is(
  (select (result->>'candidateReceipts')::integer from revision_cleanup_dry_run),
  1,
  'dry-run contabiliza o recibo que seria removido por cascade'
);
select ok(
  (select (result->>'hasMore')::boolean from revision_cleanup_dry_run),
  'dry-run informa que há outra página terminal'
);
select is(
  (
    select count(*) from private.course_content_revisions
    where id in (
      'ca700000-0000-4000-8000-000000000030',
      'ca700000-0000-4000-8000-000000000031'
    )
  ),
  2::bigint,
  'dry-run não remove correções'
);

create temporary table revision_cleanup_page_one as
select public.cleanup_course_content_revisions(
  'aa700000-0000-4000-8000-000000000001',
  false,
  now()-interval '90 days',
  now()-interval '365 days',
  1,
  null,
  null
) result;
create temporary table revision_cleanup_page_two as
select public.cleanup_course_content_revisions(
  'aa700000-0000-4000-8000-000000000001',
  false,
  now()-interval '90 days',
  now()-interval '365 days',
  10,
  (
    select (result#>>'{nextCursor,updatedAt}')::timestamptz
    from revision_cleanup_page_one
  ),
  (
    select (result#>>'{nextCursor,id}')::uuid
    from revision_cleanup_page_one
  )
) result;
select is(
  (
    select count(*) from private.course_content_revisions
    where id in (
      'ca700000-0000-4000-8000-000000000030',
      'ca700000-0000-4000-8000-000000000031'
    )
  ),
  0::bigint,
  'duas páginas removem somente revisões terminais expiradas'
);
select is(
  (
    select count(*) from private.course_content_revision_receipts
    where revision_id in (
      'ca700000-0000-4000-8000-000000000030',
      'ca700000-0000-4000-8000-000000000031'
    )
  ),
  0::bigint,
  'recibos expiram somente junto da revisão terminal'
);

select throws_ok($call$
  select public.cleanup_course_content_revisions(
    'aa700000-0000-4000-8000-000000000001',
    true,
    now()-interval '90 days',
    now()-interval '30 days',
    100,
    null,
    null
  )
$call$, '22023', 'Parâmetros de retenção de correções inválidos.',
  'rascunhos recentes não podem ser tratados como abandonados');
select is(
  (
    public.cleanup_course_content_revisions(
      'aa700000-0000-4000-8000-000000000001',
      false,
      now()-interval '365 days',
      now()-interval '180 days',
      100,
      null,
      null
    )->>'deletedRows'
  )::integer,
  2,
  'limpeza remove rascunhos open e patched abandonados'
);
select is(
  (
    select count(*) from private.course_content_revisions
    where id in (
      'ca700000-0000-4000-8000-000000000033',
      'ca700000-0000-4000-8000-000000000034'
    )
  ),
  2::bigint,
  'revisão terminal recente e rascunho ativo permanecem intactos'
);
select ok(
  (public.course_content_revision_storage_diagnostics(
    'aa700000-0000-4000-8000-000000000001'
  )->>'revisionBytes')::bigint>0,
  'diagnóstico expõe o volume físico das revisões restantes'
);

select * from finish();
rollback;
