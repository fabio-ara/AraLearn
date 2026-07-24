begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_table(
  'private', 'catalog_admin_receipts',
  'recibos administrativos ficam fora do schema público'
);
select has_column(
  'public', 'catalog_collections', 'revision',
  'coleção editável possui revisão otimista'
);
select has_column(
  'public', 'catalog_collection_courses', 'revision',
  'classificação editável possui revisão otimista'
);
select has_column(
  'public', 'courses', 'catalog_revision',
  'metadados administrativos do curso possuem revisão otimista'
);
select has_function(
  'public', 'list_catalog_collections_admin',
  array['uuid', 'integer', 'integer', 'uuid', 'text', 'boolean'],
  'descoberta paginada de coleções existe'
);
select has_function(
  'public', 'list_catalog_courses_admin',
  array['uuid', 'uuid', 'integer', 'integer', 'uuid', 'text'],
  'descoberta paginada de cursos existe'
);
select has_function(
  'public', 'get_catalog_course_admin',
  array['uuid', 'uuid'],
  'consulta individual do curso oficial existe'
);
select has_function(
  'public', 'update_catalog_course_metadata_admin',
  array['uuid', 'text', 'uuid', 'bigint', 'text', 'text'],
  'edição estreita dos metadados do curso oficial existe'
);
select has_function(
  'public', 'create_catalog_collection_admin',
  array['uuid', 'text', 'text', 'text', 'text'],
  'criação estreita de coleção existe'
);
select has_function(
  'public', 'rename_catalog_collection_admin',
  array['uuid', 'text', 'uuid', 'bigint', 'text', 'text'],
  'renomeação estreita de coleção existe'
);
select has_function(
  'public', 'retire_catalog_collection_admin',
  array['uuid', 'text', 'uuid', 'uuid', 'bigint'],
  'aposentadoria transacional de coleção existe'
);
select has_function(
  'public', 'reorder_catalog_collections_admin',
  array['uuid', 'text', 'jsonb'],
  'reordenação integral de coleções existe'
);
select has_function(
  'public', 'move_catalog_course_admin',
  array['uuid', 'text', 'uuid', 'uuid', 'bigint'],
  'movimentação estreita de curso existe'
);
select has_function(
  'public', 'reorder_catalog_courses_admin',
  array['uuid', 'text', 'uuid', 'jsonb'],
  'reordenação integral de cursos existe'
);

select ok(not has_table_privilege(
  'service_role', 'private.catalog_admin_receipts', 'SELECT'
), 'service_role não consulta recibos diretamente');
select ok(not has_table_privilege(
  'authenticated', 'private.catalog_admin_receipts', 'SELECT'
), 'authenticated não consulta recibos diretamente');
select ok(not has_function_privilege(
  'authenticated',
  'public.list_catalog_collections_admin(uuid,integer,integer,uuid,text,boolean)',
  'EXECUTE'
), 'authenticated não contorna a API de catálogo');
select ok(not has_function_privilege(
  'anon',
  'public.move_catalog_course_admin(uuid,text,uuid,uuid,bigint)',
  'EXECUTE'
), 'anon não movimenta curso');
select ok(not has_function_privilege(
  'authenticated',
  'public.update_catalog_course_metadata_admin(uuid,text,uuid,bigint,text,text)',
  'EXECUTE'
), 'authenticated não edita curso sem passar pelo gateway');
select ok(has_function_privilege(
  'service_role',
  'public.list_catalog_collections_admin(uuid,integer,integer,uuid,text,boolean)',
  'EXECUTE'
), 'gateway servidor consulta o catálogo pela RPC');
select ok(has_function_privilege(
  'service_role',
  'public.move_catalog_course_admin(uuid,text,uuid,uuid,bigint)',
  'EXECUTE'
), 'gateway servidor movimenta curso pela RPC');
select ok(has_function_privilege(
  'service_role',
  'public.get_catalog_course_admin(uuid,uuid)',
  'EXECUTE'
), 'gateway servidor consulta curso individual');
select ok(has_function_privilege(
  'service_role',
  'public.update_catalog_course_metadata_admin(uuid,text,uuid,bigint,text,text)',
  'EXECUTE'
), 'gateway servidor edita somente os metadados autorizados');

select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private' = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.move_catalog_course_admin(uuid,text,uuid,uuid,bigint)'::regprocedure
), 'movimentação é SECURITY DEFINER com search_path fixo');
select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private' = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.reorder_catalog_courses_admin(uuid,text,uuid,jsonb)'::regprocedure
), 'reordenação é SECURITY DEFINER com search_path fixo');
select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private' = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.update_catalog_course_metadata_admin(uuid,text,uuid,bigint,text,text)'::regprocedure
), 'edição de metadados é SECURITY DEFINER com search_path fixo');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   'cb000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'catalog-owner@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'cb000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'catalog-publisher@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'cb000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'catalog-author@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict(id) do nothing;

insert into private.app_role_assignments(
  user_id, role, active, granted_by, granted_at, reason, updated_at
) values
  ('cb000000-0000-4000-8000-000000000001', 'owner', true,
   'cb000000-0000-4000-8000-000000000001', now(), 'Teste do catálogo', now()),
  ('cb000000-0000-4000-8000-000000000002', 'catalog_publisher', true,
   'cb000000-0000-4000-8000-000000000001', now(), 'Teste do catálogo', now()),
  ('cb000000-0000-4000-8000-000000000003', 'author', true,
   'cb000000-0000-4000-8000-000000000001', now(), 'Teste do catálogo', now())
on conflict(user_id, role) do update set
  active = true,
  revoked_at = null,
  revoked_by = null,
  updated_at = now();

select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  public.create_catalog_collection_admin(
    'cb000000-0000-4000-8000-000000000001',
    'catalog-create-redes-01',
    'controle-redes',
    'Redes',
    ''
  )->>'status',
  'created',
  'owner cria coleção vazia'
);
select is(
  public.create_catalog_collection_admin(
    'cb000000-0000-4000-8000-000000000001',
    'catalog-create-redes-01',
    'controle-redes',
    'Redes',
    ''
  )->>'idempotent',
  'true',
  'repetição idêntica devolve o recibo'
);
select throws_ok($call$
  select public.create_catalog_collection_admin(
    'cb000000-0000-4000-8000-000000000001',
    'catalog-create-redes-01',
    'controle-redes',
    'Outro título',
    ''
  )
$call$, 'AC409', 'requestId já foi usado com outro comando do catálogo.',
  'requestId não pode ser reutilizado com outro payload');
select throws_ok($call$
  select public.create_catalog_collection_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-create-denied',
    'publisher-denied',
    'Sem permissão',
    ''
  )
$call$, '42501', 'A administração de coleções exige o papel owner.',
  'publisher não altera o ciclo de vida das coleções');

select is((
  select (entry->>'courseCount')::integer
  from jsonb_array_elements(public.list_catalog_collections_admin(
    'cb000000-0000-4000-8000-000000000001',
    100, null, null, 'controle-redes', false
  )->'items') entry
  where entry->>'contractKey' = 'controle-redes'
), 0, 'descoberta inclui coleção vazia');
select ok(
  public.list_catalog_collections_admin(
    'cb000000-0000-4000-8000-000000000001',
    1, null, null, '', false
  )->'nextCursor' is not null,
  'paginação informa cursor quando há outra coleção'
);
select throws_ok($call$
  select public.list_catalog_collections_admin(
    'cb000000-0000-4000-8000-000000000003',
    20, null, null, '', false
  )
$call$, '42501', 'Administração do catálogo não autorizada.',
  'author não descobre o plano de controle');

select is(
  public.create_catalog_collection_admin(
    'cb000000-0000-4000-8000-000000000001',
    'catalog-create-legado',
    'controle-legado',
    'Legado',
    ''
  )->>'status',
  'created',
  'owner cria coleção substituível'
);

insert into public.courses(
  id, owner_id, source_course_id, status, contract_key, title, goal,
  publication_seq, content_hash, project_id, position
) values (
  'cb100000-0000-4000-8000-000000000001',
  null, null, 'published', 'catalog-control-course',
  'Curso de controle', 'Comprovar a administração do catálogo.',
  1, repeat('c', 64), gen_random_uuid(), 990
);

select is((
  select count(*)::integer
  from public.catalog_collection_courses item
  where item.course_id = 'cb100000-0000-4000-8000-000000000001'
    and item.deleted_at is null
), 1, 'curso oficial publicado recebe uma única coleção');

select is(
  public.get_catalog_course_admin(
    'cb000000-0000-4000-8000-000000000002',
    'cb100000-0000-4000-8000-000000000001'
  )->>'title',
  'Curso de controle',
  'publisher consulta o curso oficial individual'
);
select is(
  public.update_catalog_course_metadata_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-course-title-01',
    'cb100000-0000-4000-8000-000000000001',
    1,
    'Curso de controle revisado',
    null
  )->>'status',
  'updated',
  'publisher altera somente o título'
);
select is(
  public.update_catalog_course_metadata_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-course-title-01',
    'cb100000-0000-4000-8000-000000000001',
    1,
    'Curso de controle revisado',
    null
  )->>'idempotent',
  'true',
  'edição idêntica pode ser repetida com o mesmo requestId'
);
select throws_ok($call$
  select public.update_catalog_course_metadata_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-course-title-01',
    'cb100000-0000-4000-8000-000000000001',
    1,
    null,
    'Outro objetivo'
  )
$call$, 'AC409', 'requestId já foi usado com outro comando do catálogo.',
  'requestId de metadados não aceita outro conteúdo');
select is(
  public.update_catalog_course_metadata_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-course-noop-01',
    'cb100000-0000-4000-8000-000000000001',
    2,
    'Curso de controle revisado',
    null
  )->>'status',
  'unchanged',
  'valor já corrente não cria nova publicação'
);
select is((
  select publication_seq::text || ':' || catalog_revision::text
  from public.courses
  where id = 'cb100000-0000-4000-8000-000000000001'
), '2:2', 'edição atualiza a sequência pública e a revisão administrativa');
select is((
  select content_hash
  from public.courses
  where id = 'cb100000-0000-4000-8000-000000000001'
), repeat('c', 64), 'edição de metadados não altera o hash da árvore validada');
select throws_ok($call$
  select public.update_catalog_course_metadata_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-course-stale-01',
    'cb100000-0000-4000-8000-000000000001',
    1,
    null,
    'Novo objetivo'
  )
$call$, '40001', 'Os metadados do curso mudaram desde a leitura.',
  'revisão antiga não substitui metadados novos');
select throws_ok($call$
  select public.update_catalog_course_metadata_admin(
    'cb000000-0000-4000-8000-000000000003',
    'catalog-course-author-denied',
    'cb100000-0000-4000-8000-000000000001',
    2,
    'Título proibido',
    null
  )
$call$, '42501', 'Administração do catálogo não autorizada.',
  'author não edita curso oficial');
select throws_ok($call$
  select public.get_catalog_course_admin(
    'cb000000-0000-4000-8000-000000000003',
    'cb100000-0000-4000-8000-000000000001'
  )
$call$, '42501', 'Administração do catálogo não autorizada.',
  'author não consulta os metadados administrativos');

select is(
  public.move_catalog_course_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-move-redes-01',
    'cb100000-0000-4000-8000-000000000001',
    (select id from public.catalog_collections where contract_key = 'controle-redes'),
    (select revision from public.catalog_collection_courses
      where course_id = 'cb100000-0000-4000-8000-000000000001'
        and deleted_at is null)
  )->>'status',
  'moved',
  'publisher movimenta curso oficial'
);
select is(
  public.move_catalog_course_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-move-redes-01',
    'cb100000-0000-4000-8000-000000000001',
    (select id from public.catalog_collections where contract_key = 'controle-redes'),
    1
  )->>'idempotent',
  'true',
  'movimentação pode ser repetida com o mesmo requestId'
);
select throws_ok($call$
  select public.move_catalog_course_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-move-stale-01',
    'cb100000-0000-4000-8000-000000000001',
    (select id from public.catalog_collections where contract_key = 'controle-legado'),
    1
  )
$call$, '40001', 'A classificação do curso mudou desde a leitura.',
  'revisão antiga não substitui movimentação nova');
select throws_ok($call$
  select public.move_catalog_course_admin(
    'cb000000-0000-4000-8000-000000000003',
    'catalog-move-author',
    'cb100000-0000-4000-8000-000000000001',
    (select id from public.catalog_collections where contract_key = 'controle-legado'),
    2
  )
$call$, '42501', 'Administração do catálogo não autorizada.',
  'author não movimenta curso oficial');

select throws_ok($call$
  insert into public.catalog_collection_courses(
    collection_id, course_id, position
  ) values (
    (select id from public.catalog_collections where contract_key = 'controle-legado'),
    'cb100000-0000-4000-8000-000000000001',
    0
  )
$call$, '23505',
  'duplicate key value violates unique constraint "catalog_collection_courses_course_lean_uidx"',
  'índice impede duas coleções ativas para o mesmo curso');

select is(
  public.reorder_catalog_courses_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-order-course',
    (select id from public.catalog_collections where contract_key = 'controle-redes'),
    jsonb_build_array(jsonb_build_object(
      'courseId', 'cb100000-0000-4000-8000-000000000001',
      'baseRevision', (
        select revision from public.catalog_collection_courses
        where course_id = 'cb100000-0000-4000-8000-000000000001'
          and deleted_at is null
      )
    ))
  )->>'orderedCourseCount',
  '1',
  'publisher reordena a lista completa de cursos'
);
select throws_ok($call$
  select public.reorder_catalog_courses_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-order-null',
    (select id from public.catalog_collections where contract_key = 'controle-redes'),
    '[{"courseId":null,"baseRevision":null}]'::jsonb
  )
$call$, '22023', 'Ordem de cursos inválida.',
  'reordenação recusa campos nulos');
select throws_ok($call$
  select public.reorder_catalog_courses_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-order-scalar',
    (select id from public.catalog_collections where contract_key = 'controle-redes'),
    '["inválido"]'::jsonb
  )
$call$, '22023', 'Ordem de cursos inválida.',
  'reordenação recusa item escalar sem erro interno');
select throws_ok($call$
  select public.reorder_catalog_courses_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-order-overflow',
    (select id from public.catalog_collections where contract_key = 'controle-redes'),
    '[{"courseId":"cb100000-0000-4000-8000-000000000001",
       "baseRevision":"9999999999999999999"}]'::jsonb
  )
$call$, '22023', 'Ordem de cursos inválida.',
  'reordenação recusa revisão acima de bigint sem erro interno');

select is(
  public.move_catalog_course_admin(
    'cb000000-0000-4000-8000-000000000002',
    'catalog-move-legado',
    'cb100000-0000-4000-8000-000000000001',
    (select id from public.catalog_collections where contract_key = 'controle-legado'),
    (select revision from public.catalog_collection_courses
      where course_id = 'cb100000-0000-4000-8000-000000000001'
        and deleted_at is null)
  )->>'status',
  'moved',
  'curso entra na coleção que será aposentada'
);
select is(
  public.retire_catalog_collection_admin(
    'cb000000-0000-4000-8000-000000000001',
    'catalog-retire-legado',
    (select id from public.catalog_collections where contract_key = 'controle-legado'),
    (select id from public.catalog_collections where contract_key = 'controle-redes'),
    (select revision from public.catalog_collections where contract_key = 'controle-legado')
  )->>'movedCourseCount',
  '1',
  'aposentadoria move os cursos na mesma transação'
);
select is((
  select collection.contract_key
  from public.catalog_collection_courses item
  join public.catalog_collections collection on collection.id = item.collection_id
  where item.course_id = 'cb100000-0000-4000-8000-000000000001'
    and item.deleted_at is null
), 'controle-redes', 'curso conserva uma classificação ativa após aposentadoria');

select lives_ok($call$
  update public.courses
  set updated_at = updated_at
  where id = 'cb100000-0000-4000-8000-000000000001';
  set constraints catalog_membership_course_invariant immediate;
$call$, 'gatilho de associação aceita atualização de curso sem ler campos de outra tabela');

select is(
  public.reorder_catalog_collections_admin(
    'cb000000-0000-4000-8000-000000000001',
    'catalog-order-all',
    (
      select jsonb_agg(jsonb_build_object(
        'collectionId', collection.id,
        'baseRevision', collection.revision
      ) order by
        (collection.contract_key = 'outros'),
        collection.position,
        collection.id
      )
      from public.catalog_collections collection
      where collection.is_published and collection.deleted_at is null
    )
  )->>'status',
  'reordered',
  'owner substitui a ordem completa das coleções'
);

create function pg_temp.remove_only_catalog_membership()
returns void
language plpgsql
as $$
begin
  delete from public.catalog_collection_courses
  where course_id = 'cb100000-0000-4000-8000-000000000001'
    and deleted_at is null;
  set constraints catalog_membership_course_invariant immediate;
end;
$$;

select throws_ok($call$
  select pg_temp.remove_only_catalog_membership()
$call$, '23514',
  'Curso oficial publicado deve pertencer a uma única coleção ativa.',
  'constraint diferida impede curso oficial sem coleção');

select is((
  select count(*)::integer
  from public.catalog_collection_courses item
  where item.course_id = 'cb100000-0000-4000-8000-000000000001'
    and item.deleted_at is null
), 1, 'falha de cardinalidade preserva a associação anterior');

select * from finish();
rollback;
