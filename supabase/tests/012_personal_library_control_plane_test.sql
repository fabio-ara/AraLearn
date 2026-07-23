begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_table(
  'private',
  'personal_library_command_receipts',
  'recibos pessoais ficam fora do schema público'
);
select has_function(
  'public',
  'list_personal_library_courses',
  array['uuid', 'uuid', 'integer', 'integer', 'uuid', 'text'],
  'listagem paginada de cursos pessoais existe'
);
select has_function(
  'public',
  'get_personal_library_course_structure',
  array[
    'uuid', 'uuid', 'uuid', 'text',
    'uuid', 'integer', 'integer', 'uuid'
  ],
  'consulta paginada da estrutura selecionada existe'
);
select has_function(
  'public',
  'list_personal_study_paths',
  array['uuid', 'uuid', 'integer', 'integer', 'uuid'],
  'listagem paginada de trilhas existe'
);
select has_function(
  'public',
  'rename_personal_library_course',
  array['uuid', 'uuid', 'text', 'uuid', 'text'],
  'renomeação estreita de curso pessoal existe'
);
select has_function(
  'public',
  'create_personal_study_path',
  array['uuid', 'uuid', 'text', 'text'],
  'criação de trilha existe'
);
select has_function(
  'public',
  'rename_personal_study_path',
  array['uuid', 'uuid', 'text', 'uuid', 'text'],
  'renomeação de trilha existe'
);
select has_function(
  'public',
  'delete_personal_study_path',
  array['uuid', 'uuid', 'text', 'uuid'],
  'exclusão segura de trilha existe'
);
select has_function(
  'public',
  'move_personal_course_selection',
  array['uuid', 'uuid', 'text', 'uuid', 'uuid'],
  'movimentação entre trilha e Sem trilha existe'
);

select ok(not has_table_privilege(
  'service_role',
  'private.personal_library_command_receipts',
  'SELECT'
), 'gateway não consulta recibos diretamente');
select ok(not has_function_privilege(
  'authenticated',
  'public.list_personal_library_courses(uuid,uuid,integer,integer,uuid,text)',
  'EXECUTE'
), 'cliente autenticado não fornece outra identidade diretamente');
select ok(not has_function_privilege(
  'anon',
  'public.rename_personal_library_course(uuid,uuid,text,uuid,text)',
  'EXECUTE'
), 'anon não altera biblioteca pessoal');
select ok(has_function_privilege(
  'service_role',
  'public.list_personal_library_courses(uuid,uuid,integer,integer,uuid,text)',
  'EXECUTE'
), 'gateway servidor consulta biblioteca pessoal');
select ok(has_function_privilege(
  'service_role',
  'public.move_personal_course_selection(uuid,uuid,text,uuid,uuid)',
  'EXECUTE'
), 'gateway servidor movimenta seleção pessoal');

select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private' =
      any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.list_personal_library_courses(uuid,uuid,integer,integer,uuid,text)'
      ::regprocedure
), 'leitura pessoal é SECURITY DEFINER com search_path fixo');
select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private, extensions' =
      any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.rename_personal_library_course(uuid,uuid,text,uuid,text)'
      ::regprocedure
), 'renomeação pessoal é SECURITY DEFINER com search_path fixo');

insert into auth.users(
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'dc000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'personal-a@aralearn.test',
    'x',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dc000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'personal-b@aralearn.test',
    'x',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict(id) do nothing;

insert into private.authoring_api_clients(
  id,
  owner_user_id,
  name,
  key_prefix,
  api_key_hash,
  scopes,
  rate_limit_per_minute,
  expires_at,
  revoked_at,
  created_by,
  created_at,
  updated_at
) values
  (
    'dc100000-0000-4000-8000-000000000001',
    'dc000000-0000-4000-8000-000000000001',
    'Integração A',
    'arl_plana001',
    repeat('a1', 32),
    array[
      'authoring:private:read',
      'authoring:private:write'
    ],
    120,
    now() + interval '30 days',
    null,
    'dc000000-0000-4000-8000-000000000001',
    now(),
    now()
  ),
  (
    'dc100000-0000-4000-8000-000000000002',
    'dc000000-0000-4000-8000-000000000001',
    'Integração A somente leitura',
    'arl_planar02',
    repeat('a2', 32),
    array['authoring:private:read'],
    120,
    now() + interval '30 days',
    null,
    'dc000000-0000-4000-8000-000000000001',
    now(),
    now()
  ),
  (
    'dc100000-0000-4000-8000-000000000003',
    'dc000000-0000-4000-8000-000000000002',
    'Integração B',
    'arl_planb003',
    repeat('b1', 32),
    array[
      'authoring:private:read',
      'authoring:private:write'
    ],
    120,
    now() + interval '30 days',
    null,
    'dc000000-0000-4000-8000-000000000002',
    now(),
    now()
  ),
  (
    'dc100000-0000-4000-8000-000000000004',
    'dc000000-0000-4000-8000-000000000001',
    'Integração A revogada',
    'arl_planar04',
    repeat('a4', 32),
    array['authoring:private:read'],
    120,
    now() + interval '30 days',
    now(),
    'dc000000-0000-4000-8000-000000000001',
    now(),
    now()
  ),
  (
    'dc100000-0000-4000-8000-000000000005',
    'dc000000-0000-4000-8000-000000000001',
    'Integração A expirada',
    'arl_planar05',
    repeat('a5', 32),
    array['authoring:private:read'],
    120,
    now() - interval '1 day',
    null,
    'dc000000-0000-4000-8000-000000000001',
    now() - interval '2 days',
    now() - interval '1 day'
  );

insert into public.courses(
  id,
  owner_id,
  source_course_id,
  status,
  contract_key,
  title,
  goal,
  publication_seq,
  content_hash,
  project_id,
  position
) values
  (
    'dc200000-0000-4000-8000-000000000001',
    null,
    null,
    'published',
    'personal-control-official',
    'Curso oficial imutável',
    'Comprovar que curso oficial não pode ser renomeado.',
    1,
    repeat('1', 64),
    gen_random_uuid(),
    0
  ),
  (
    'dc200000-0000-4000-8000-000000000002',
    'dc000000-0000-4000-8000-000000000001',
    null,
    'published',
    'personal-control-a',
    'Curso pessoal A',
    'Comprovar o isolamento da conta A.',
    1,
    repeat('2', 64),
    gen_random_uuid(),
    1
  ),
  (
    'dc200000-0000-4000-8000-000000000003',
    'dc000000-0000-4000-8000-000000000002',
    null,
    'published',
    'personal-control-b',
    'Curso pessoal B',
    'Comprovar o isolamento da conta B.',
    1,
    repeat('3', 64),
    gen_random_uuid(),
    0
  );

insert into public.modules(
  id, course_id, contract_key, position, title
) values
  (
    'dc300000-0000-4000-8000-000000000001',
    'dc200000-0000-4000-8000-000000000002',
    'modulo-a-1',
    0,
    'Módulo A1'
  ),
  (
    'dc300000-0000-4000-8000-000000000002',
    'dc200000-0000-4000-8000-000000000002',
    'modulo-a-2',
    1,
    'Módulo A2'
  ),
  (
    'dc300000-0000-4000-8000-000000000003',
    'dc200000-0000-4000-8000-000000000003',
    'modulo-b-1',
    0,
    'Módulo secreto B'
  );

insert into public.lessons(
  id, course_id, module_id, contract_key, position, title
) values (
  'dc400000-0000-4000-8000-000000000001',
  'dc200000-0000-4000-8000-000000000002',
  'dc300000-0000-4000-8000-000000000001',
  'licao-a-1',
  0,
  'Lição A1'
);

insert into public.microsequences(
  id,
  course_id,
  lesson_id,
  contract_key,
  position,
  title,
  goal,
  role,
  status
) values (
  'dc500000-0000-4000-8000-000000000001',
  'dc200000-0000-4000-8000-000000000002',
  'dc400000-0000-4000-8000-000000000001',
  'micro-a-1',
  0,
  'Microssequência A1',
  'Comprovar a estrutura paginada.',
  'explain',
  'ready'
);

insert into public.cards(
  id,
  course_id,
  lesson_id,
  microsequence_id,
  contract_key,
  position,
  resource,
  kind,
  exercise,
  card_kind,
  title
) values (
  'dc600000-0000-4000-8000-000000000001',
  'dc200000-0000-4000-8000-000000000002',
  'dc400000-0000-4000-8000-000000000001',
  'dc500000-0000-4000-8000-000000000001',
  'card-a-1',
  1,
  'paragraph',
  'theory',
  'none',
  'theory',
  'Card A1'
);

insert into public.user_course_selections(
  id, user_id, course_id, position
) values
  (
    'dc700000-0000-4000-8000-000000000001',
    'dc000000-0000-4000-8000-000000000001',
    'dc200000-0000-4000-8000-000000000001',
    0
  ),
  (
    'dc700000-0000-4000-8000-000000000002',
    'dc000000-0000-4000-8000-000000000001',
    'dc200000-0000-4000-8000-000000000002',
    1
  ),
  (
    'dc700000-0000-4000-8000-000000000003',
    'dc000000-0000-4000-8000-000000000002',
    'dc200000-0000-4000-8000-000000000003',
    0
  );

insert into public.lesson_progress(
  id,
  selection_id,
  user_id,
  course_id,
  lesson_id,
  cursor,
  last_activity_at
) values (
  'dc800000-0000-4000-8000-000000000001',
  'dc700000-0000-4000-8000-000000000002',
  'dc000000-0000-4000-8000-000000000001',
  'dc200000-0000-4000-8000-000000000002',
  'dc400000-0000-4000-8000-000000000001',
  0,
  now()
);
insert into public.card_progress(
  id,
  selection_id,
  user_id,
  course_id,
  card_id,
  first_viewed_at,
  attempts,
  last_activity_at
) values (
  'dc800000-0000-4000-8000-000000000002',
  'dc700000-0000-4000-8000-000000000002',
  'dc000000-0000-4000-8000-000000000001',
  'dc200000-0000-4000-8000-000000000002',
  'dc600000-0000-4000-8000-000000000001',
  now(),
  1,
  now()
);
insert into public.card_comments(
  id,
  selection_id,
  user_id,
  course_id,
  card_id,
  body
) values (
  'dc800000-0000-4000-8000-000000000003',
  'dc700000-0000-4000-8000-000000000002',
  'dc000000-0000-4000-8000-000000000001',
  'dc200000-0000-4000-8000-000000000002',
  'dc600000-0000-4000-8000-000000000001',
  'Comentário preservado'
);

insert into public.study_paths(
  id, owner_id, title, position
) values (
  'dc900000-0000-4000-8000-000000000003',
  'dc000000-0000-4000-8000-000000000002',
  'Trilha B',
  0
);

select set_config(
  'request.jwt.claim.role',
  'service_role',
  true
);

select is(
  jsonb_array_length(public.list_personal_library_courses(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    50,
    null,
    null,
    ''
  )->'items'),
  2,
  'conta A lista somente seus dois cursos selecionados'
);
select ok(not exists (
  select 1
  from jsonb_array_elements(public.list_personal_library_courses(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    50,
    null,
    null,
    ''
  )->'items') entry
  where entry->>'title' = 'Curso pessoal B'
), 'conta A não descobre o curso da conta B');
select is(
  jsonb_array_length(public.list_personal_library_courses(
    'dc000000-0000-4000-8000-000000000002',
    'dc100000-0000-4000-8000-000000000003',
    50,
    null,
    null,
    ''
  )->'items'),
  1,
  'conta B não vê os cursos da conta A'
);
select throws_ok($call$
  select public.list_personal_library_courses(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000003',
    50,
    null,
    null,
    ''
  )
$call$, '42501', 'Integração pessoal não autorizada.',
  'cliente de B não pode agir como A');
select throws_ok($call$
  select public.list_personal_library_courses(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000004',
    50,
    null,
    null,
    ''
  )
$call$, '42501', 'Integração pessoal não autorizada.',
  'cliente revogado deixa de ler a conta');
select throws_ok($call$
  select public.list_personal_library_courses(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000005',
    50,
    null,
    null,
    ''
  )
$call$, '42501', 'Integração pessoal não autorizada.',
  'cliente expirado deixa de ler a conta');
select throws_ok($call$
  select public.list_personal_library_courses(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    null,
    null,
    null,
    ''
  )
$call$, '22023', 'Paginação da biblioteca pessoal inválida.',
  'limite nulo não abre uma consulta sem limite');

create temp table personal_structure_page as
select public.get_personal_library_course_structure(
  'dc000000-0000-4000-8000-000000000001',
  'dc100000-0000-4000-8000-000000000001',
  'dc200000-0000-4000-8000-000000000002',
  'modules',
  null,
  1,
  null,
  null
) result;
select is(
  jsonb_array_length((
    select result->'items' from personal_structure_page
  )),
  1,
  'estrutura aplica o limite sem acumular todos os módulos'
);
select ok((
  select result->'nextCursor' is not null
  from personal_structure_page
), 'estrutura informa cursor da página seguinte');
select is(
  public.get_personal_library_course_structure(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'dc200000-0000-4000-8000-000000000002',
    'modules',
    null,
    1,
    (
      select (result->'nextCursor'->>'afterPosition')::integer
      from personal_structure_page
    ),
    (
      select (result->'nextCursor'->>'afterId')::uuid
      from personal_structure_page
    )
  )->'items'->0->>'title',
  'Módulo A2',
  'estrutura retoma exatamente depois do cursor salvo'
);
select throws_ok($call$
  select public.get_personal_library_course_structure(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'dc200000-0000-4000-8000-000000000003',
    'modules',
    null,
    20,
    null,
    null
  )
$call$, '42501', 'Curso selecionado não encontrado.',
  'estrutura de B não é revelada para A');
select throws_ok($call$
  select public.get_personal_library_course_structure(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'dc2fffff-0000-4000-8000-000000000003',
    'modules',
    null,
    20,
    null,
    null
  )
$call$, '42501', 'Curso selecionado não encontrado.',
  'curso alheio e UUID inexistente produzem a mesma resposta');
select throws_ok($call$
  select public.get_personal_library_course_structure(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'dc200000-0000-4000-8000-000000000002',
    null,
    null,
    20,
    null,
    null
  )
$call$, '22023', 'Consulta de estrutura inválida.',
  'seção nula não é interpretada como cards');

create temp table personal_rename_feed_baseline as
select coalesce(max(sequence), 0) as sequence
from private.sync_changes;

select is(
  public.rename_personal_library_course(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-rename-course-01',
    'dc200000-0000-4000-8000-000000000002',
    'Curso pessoal A renomeado'
  )->>'status',
  'renamed',
  'integração renomeia somente o curso pessoal do proprietário'
);
select is((
  select title from public.courses
  where id = 'dc200000-0000-4000-8000-000000000002'
), 'Curso pessoal A renomeado',
  'novo título foi persistido');
select is((
  select count(*)::integer
  from private.sync_changes change
  where change.audience_user_id =
      'dc000000-0000-4000-8000-000000000001'
    and change.course_id =
      'dc200000-0000-4000-8000-000000000002'
    and change.entity_type = 'coursePublication'
    and change.operation = 'upsert'
    and change.sequence > (
      select sequence from personal_rename_feed_baseline
    )
), 1, 'renomeação entra uma vez no feed dos outros dispositivos');
select set_config(
  'request.jwt.claim.sub',
  'dc000000-0000-4000-8000-000000000001',
  true
);
create temp table personal_rename_pull as
select public.pull_sync_changes(
  (select sequence from personal_rename_feed_baseline),
  50,
  'dcf00000-0000-4000-8000-000000000001'
) result;
select is((
  select change->'row'->>'title'
  from personal_rename_pull,
    lateral jsonb_array_elements(result->'changes') change
  where change->>'entityType' = 'courseSelections'
    and change->>'entityId' =
      'dc700000-0000-4000-8000-000000000002'
), 'Curso pessoal A renomeado',
  'pull projeta a raiz renomeada na seleção do dispositivo');
select is(
  public.rename_personal_library_course(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-rename-course-01',
    'dc200000-0000-4000-8000-000000000002',
    'Curso pessoal A renomeado'
  )->>'idempotent',
  'true',
  'repetição idêntica devolve o recibo'
);
select is((
  select count(*)::integer
  from private.sync_changes change
  where change.audience_user_id =
      'dc000000-0000-4000-8000-000000000001'
    and change.course_id =
      'dc200000-0000-4000-8000-000000000002'
    and change.entity_type = 'coursePublication'
    and change.operation = 'upsert'
    and change.sequence > (
      select sequence from personal_rename_feed_baseline
    )
), 1, 'replay não duplica o evento de sincronização');
select throws_ok($call$
  select public.rename_personal_library_course(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-rename-course-01',
    'dc200000-0000-4000-8000-000000000002',
    'Outro título'
  )
$call$, 'PL409',
  'requestId já foi usado com outro comando da biblioteca pessoal.',
  'requestId não aceita outro conteúdo');
select throws_ok($call$
  select public.rename_personal_library_course(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-official-denied-01',
    'dc200000-0000-4000-8000-000000000001',
    'Título proibido'
  )
$call$, '42501', 'Curso pessoal não encontrado.',
  'curso oficial nunca é renomeável pelo plano pessoal');
select throws_ok($call$
  select public.rename_personal_library_course(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000002',
    'personal-read-only-denied',
    'dc200000-0000-4000-8000-000000000002',
    'Título proibido'
  )
$call$, '42501', 'Integração pessoal não autorizada.',
  'escopo somente leitura não altera o curso');
update private.authoring_api_clients
set revoked_at = now(), updated_at = now()
where id = 'dc100000-0000-4000-8000-000000000001';
select throws_ok($call$
  select public.rename_personal_library_course(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-rename-course-01',
    'dc200000-0000-4000-8000-000000000002',
    'Curso pessoal A renomeado'
  )
$call$, '42501', 'Integração pessoal não autorizada.',
  'revogação é conferida antes de devolver recibo antigo');
update private.authoring_api_clients
set revoked_at = null, updated_at = now()
where id = 'dc100000-0000-4000-8000-000000000001';

create temp table created_personal_path as
select public.create_personal_study_path(
  'dc000000-0000-4000-8000-000000000001',
  'dc100000-0000-4000-8000-000000000001',
  'personal-create-path-01',
  'Formação técnica'
) result;
select is(
  (select result->>'status' from created_personal_path),
  'created',
  'integração cria uma trilha'
);
select is(
  public.create_personal_study_path(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-create-path-01',
    'Formação técnica'
  )->>'pathId',
  (select result->>'pathId' from created_personal_path),
  'retry de criação não duplica a trilha'
);
select is(
  public.rename_personal_study_path(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-rename-path-01',
    (
      select (result->>'pathId')::uuid
      from created_personal_path
    ),
    'Formação profissional'
  )->>'status',
  'renamed',
  'integração renomeia a trilha própria'
);
select is(
  public.move_personal_course_selection(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-move-course-01',
    'dc700000-0000-4000-8000-000000000002',
    (
      select (result->>'pathId')::uuid
      from created_personal_path
    )
  )->>'status',
  'moved',
  'curso selecionado entra na trilha'
);
select is((
  select (entry->>'courseCount')::integer
  from jsonb_array_elements(public.list_personal_study_paths(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    50,
    null,
    null
  )->'items') entry
  where entry->>'title' = 'Formação profissional'
), 1, 'listagem reflete o curso movido');
select throws_ok($call$
  select public.move_personal_course_selection(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-move-foreign-selection',
    'dc700000-0000-4000-8000-000000000003',
    (
      select (result->>'pathId')::uuid
      from created_personal_path
    )
  )
$call$, '42501', 'Curso selecionado não encontrado.',
  'A não movimenta seleção de B');
select throws_ok($call$
  select public.move_personal_course_selection(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-move-foreign-path-01',
    'dc700000-0000-4000-8000-000000000002',
    'dc900000-0000-4000-8000-000000000003'
  )
$call$, '42501', 'Trilha pessoal não encontrada.',
  'A não movimenta curso para trilha de B');

select is(
  public.delete_personal_study_path(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-delete-path-01',
    (
      select (result->>'pathId')::uuid
      from created_personal_path
    )
  )->>'detachedCourseCount',
  '1',
  'excluir trilha informa quantos cursos voltaram a Sem trilha'
);
select is((
  select count(*)::integer
  from public.user_course_selections selection
  where selection.id =
    'dc700000-0000-4000-8000-000000000002'
), 1, 'excluir trilha preserva a seleção');
select is((
  select count(*)::integer
  from public.lesson_progress progress
  where progress.selection_id =
    'dc700000-0000-4000-8000-000000000002'
), 1, 'excluir trilha preserva o progresso de lição');
select is((
  select count(*)::integer
  from public.card_progress progress
  where progress.selection_id =
    'dc700000-0000-4000-8000-000000000002'
), 1, 'excluir trilha preserva o progresso de card');
select is((
  select count(*)::integer
  from public.card_comments card_comment
  where card_comment.selection_id =
    'dc700000-0000-4000-8000-000000000002'
), 1, 'excluir trilha preserva os comentários');
select is(
  (
    public.list_personal_study_paths(
      'dc000000-0000-4000-8000-000000000001',
      'dc100000-0000-4000-8000-000000000001',
      50,
      null,
      null
    )->>'unassignedCount'
  )::integer,
  2,
  'Sem trilha é calculada pela ausência de vínculo'
);
select is(
  public.delete_personal_study_path(
    'dc000000-0000-4000-8000-000000000001',
    'dc100000-0000-4000-8000-000000000001',
    'personal-delete-path-01',
    (
      select (result->>'pathId')::uuid
      from created_personal_path
    )
  )->>'idempotent',
  'true',
  'retry da exclusão funciona mesmo depois que a trilha deixou de existir'
);

select * from finish();
rollback;
