begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_function(
  'public',
  'get_catalog_course_structure_admin',
  array['uuid', 'uuid', 'text', 'uuid', 'integer', 'integer', 'uuid'],
  'consulta paginada da estrutura oficial existe'
);
select ok(not has_function_privilege(
  'anon',
  'public.get_catalog_course_structure_admin(uuid,uuid,text,uuid,integer,integer,uuid)',
  'EXECUTE'
), 'anon não consulta a árvore administrativa');
select ok(not has_function_privilege(
  'authenticated',
  'public.get_catalog_course_structure_admin(uuid,uuid,text,uuid,integer,integer,uuid)',
  'EXECUTE'
), 'authenticated não contorna o gateway editorial');
select ok(has_function_privilege(
  'service_role',
  'public.get_catalog_course_structure_admin(uuid,uuid,text,uuid,integer,integer,uuid)',
  'EXECUTE'
), 'gateway servidor pode consultar a estrutura');
select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private' = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.get_catalog_course_structure_admin(uuid,uuid,text,uuid,integer,integer,uuid)'::regprocedure
), 'consulta usa SECURITY DEFINER com search_path fixo');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'ce000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'structure-publisher@aralearn.test', 'x', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'ce000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    'structure-author@aralearn.test', 'x', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  )
on conflict(id) do nothing;

insert into private.app_role_assignments(
  user_id, role, active, granted_by, granted_at, reason, updated_at
) values
  (
    'ce000000-0000-4000-8000-000000000001',
    'catalog_publisher', true,
    'ce000000-0000-4000-8000-000000000001',
    now(), 'Teste da leitura estrutural', now()
  ),
  (
    'ce000000-0000-4000-8000-000000000002',
    'author', true,
    'ce000000-0000-4000-8000-000000000001',
    now(), 'Teste da leitura estrutural', now()
  )
on conflict(user_id, role) do update set
  active = true,
  revoked_at = null,
  revoked_by = null,
  updated_at = now();

select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.courses(
  id, owner_id, source_course_id, status, contract_key, title, goal,
  publication_seq, content_hash, project_id, position
) values (
  'ce100000-0000-4000-8000-000000000001',
  null, null, 'published', 'catalog-structure-course',
  'Curso de estrutura', 'Comprovar leitura formal paginada.',
  4, repeat('e', 64), gen_random_uuid(), 991
);

insert into public.modules(
  id, course_id, contract_key, position, title
) values
  (
    'ce200000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'modulo-a', 0, 'Módulo A'
  ),
  (
    'ce200000-0000-4000-8000-000000000002',
    'ce100000-0000-4000-8000-000000000001',
    'modulo-b', 1, 'Módulo B'
  );

insert into public.learning_components(
  id, course_id, component_key, component_type, label, description,
  position
) values (
  'ce300000-0000-4000-8000-000000000001',
  'ce100000-0000-4000-8000-000000000001',
  'concept-estrutura', 'concept', 'Estrutura formal',
  'Componente pedagógico consultável.', 0
);

select is(
  public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'modules', null, 1, null, null
  )#>>'{items,0,title}',
  'Módulo A',
  'primeira página devolve conteúdo formal'
);
select ok(
  public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'modules', null, 1, null, null
  )->'nextCursor' is not null,
  'primeira página informa cursor estável'
);
select is((
  with first_page as (
    select public.get_catalog_course_structure_admin(
      'ce000000-0000-4000-8000-000000000001',
      'ce100000-0000-4000-8000-000000000001',
      'modules', null, 1, null, null
    ) payload
  )
  select public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'modules', null, 1,
    (payload#>>'{nextCursor,afterPosition}')::integer,
    (payload#>>'{nextCursor,afterId}')::uuid
  )#>>'{items,0,title}'
  from first_page
), 'Módulo B', 'cursor retoma sem repetir a primeira linha');

select is(
  public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'learningComponents', null, 25, null, null
  )#>>'{items,0,componentKey}',
  'concept-estrutura',
  'componentes pedagógicos integram a mesma leitura formal'
);
select ok(not (
  public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'learningComponents', null, 25, null, null
  )#>'{items,0}'
) ? 'materializedFromRunId',
  'metadado interno da execução não é exposto');

select is(
  public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'modules', null, 25, null, null
  )#>>'{authoringUpdate,mode}',
  'update',
  'resposta informa o modo autoral de correção'
);
select is(
  public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'modules', null, 25, null, null
  )#>>'{authoringUpdate,expectedContentHash}',
  repeat('e', 64),
  'correção recebe o hash observado para publicação atômica'
);
select is(
  public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'modules', null, 25, null, null
  )#>>'{authoringUpdate,directTreeMutation}',
  'false',
  'resposta declara que a árvore não admite escrita direta'
);

select throws_ok($call$
  select public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000002',
    'ce100000-0000-4000-8000-000000000001',
    'modules', null, 25, null, null
  )
$call$, '42501', 'Administração do catálogo não autorizada.',
  'autor sem papel editorial não lê a árvore pelo gateway');
select throws_ok($call$
  select public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'unknown', null, 25, null, null
  )
$call$, '22023', 'Consulta de estrutura do catálogo inválida.',
  'seção desconhecida é rejeitada');
select throws_ok($call$
  select public.get_catalog_course_structure_admin(
    'ce000000-0000-4000-8000-000000000001',
    'ce100000-0000-4000-8000-000000000001',
    'modules', 'ce200000-0000-4000-8000-000000000001',
    25, null, null
  )
$call$, '22023', 'A seção informada não recebe parentId.',
  'consulta não aceita parentId sem sentido');

select * from finish();
rollback;
