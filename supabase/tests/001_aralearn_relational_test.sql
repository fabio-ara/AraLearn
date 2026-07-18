begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select plan(172);

select has_table('public', 'courses', 'courses existe');
select has_table('public', 'modules', 'modules existe');
select has_table('public', 'cards', 'cards existe');
select has_table('public', 'flow_practices', 'flow_practices existe');
select has_table('public', 'sync_changes', 'sync_changes existe');
select has_function('public', 'clone_catalog_course', array['uuid'], 'RPC de clone existe');
select has_function('public', 'apply_sync_batch', array['uuid','jsonb'], 'RPC de push existe');
select has_function('public', 'bootstrap_replica', array['uuid'], 'RPC de bootstrap existe');
select has_function(
  'public', 'compact_sync_history', array['boolean','timestamp with time zone'],
  'RPC administrativa de compactação existe'
);
select has_function('public', 'sync_storage_diagnostics', array[]::text[], 'RPC de diagnóstico existe');
select has_function(
  'public', 'refresh_personal_course_from_source', array['uuid','uuid'],
  'RPC idempotente de refresh existe'
);
select has_function(
  'public', 'replace_microsequence_cards', array['uuid','uuid','jsonb','bigint'],
  'RPC interna de substituição granular existe'
);
select has_function(
  'public', 'replace_microsequence_cards', array['uuid','uuid','jsonb','bigint','uuid'],
  'RPC idempotente de substituição granular existe'
);
select has_function(
  'public', 'delete_personal_course', array['uuid','bigint','uuid'],
  'RPC idempotente de exclusão pessoal existe'
);
select hasnt_function(
  'public', 'delete_personal_course', array['uuid','uuid'],
  'exclusão sem baseRevision não permanece exposta'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.replace_microsequence_cards(uuid,uuid,jsonb,bigint)', 'EXECUTE'
  ) and has_function_privilege(
    'authenticated', 'public.replace_microsequence_cards(uuid,uuid,jsonb,bigint,uuid)', 'EXECUTE'
  ),
  'cliente autenticado só executa overload idempotente de cinco argumentos'
);
select ok(
  not has_function_privilege('authenticated', 'public.clone_catalog_course(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.clone_catalog_course(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege(
    'authenticated', 'public.refresh_personal_course_from_source(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.refresh_personal_course_from_source(uuid,uuid)', 'EXECUTE'
  ),
  'clone e refresh públicos exigem mutationId'
);
select col_type_is('public', 'courses', 'id', 'uuid', 'identidade persistida é UUID');
select col_type_is(
  'public', 'sync_devices', 'inactive_at', 'timestamp with time zone',
  'dispositivo possui desativação persistente'
);
select col_type_is(
  'public', 'microsequences', 'cards_revision', 'bigint',
  'microssequência possui token agregado exclusivo da subárvore de cards'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.cards'::regclass and contype = 'f'
      and conname = 'cards_microsequence_fk'
  ),
  'cards possui FK composta para microsequences'
);
select is(
  (select count(*) from pg_class relation join pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public' and relation.relkind = 'r' and not relation.relrowsecurity),
  0::bigint,
  'todas as tabelas públicas usam RLS'
);
select ok(
  not exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public' and grantee in ('anon', 'PUBLIC')
  ),
  'anon não possui privilégios nas tabelas'
);
select ok(
  not exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public' and grantee = 'authenticated'
  ),
  'authenticated acessa dados somente pelas RPCs autorizadas'
);
select ok(
  not has_table_privilege('authenticated', 'public.sync_devices', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sync_mutations', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sync_changes', 'SELECT'),
  'tabelas internas de sincronização não têm leitura direta para authenticated'
);
select ok(
  not has_function_privilege('anon', 'public.clone_catalog_course(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.apply_sync_batch(uuid,jsonb)', 'EXECUTE')
  and not has_function_privilege(
    'anon', 'public.pull_sync_changes(bigint,integer,uuid)', 'EXECUTE'
  )
  and not has_function_privilege('anon', 'public.bootstrap_replica(uuid)', 'EXECUTE')
  and not has_function_privilege(
    'anon', 'public.replace_microsequence_cards(uuid,uuid,jsonb,bigint,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.delete_personal_course(uuid,bigint,uuid)', 'EXECUTE'
  ),
  'anon não executa RPCs sensíveis de dados ou sincronização'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner@aralearn.local',
   extensions.crypt('local-test-password', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'other@aralearn.local',
   extensions.crypt('local-test-password', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'learner-b@aralearn.local',
   extensions.crypt('local-test-password', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'editor@aralearn.local',
   extensions.crypt('local-test-password', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  (public.validate_course_graph('10000000-0000-4000-8000-000000000001') ->> 'valid')::boolean,
  'seed relacional é válido'
);
select ok(
  (public.validate_course_graph('10000000-0000-4000-8000-000000000001') ->> 'publishable')::boolean,
  'seed relacional é publicável'
);
select matches(
  public.compute_course_content_hash('10000000-0000-4000-8000-000000000001'),
  '^[0-9a-f]{64}$', 'hash canônico usa SHA-256 estável'
);

savepoint published_official_tree_edit;
select set_config('request.jwt.claim.role', 'service_role', true);
create temp table official_replace_result as
select public.replace_microsequence_cards(
  '10000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'cards', private.camel_active_rows(
      'public.cards'::regclass, '10000000-0000-4000-8000-000000000001', 'cards'
    ),
    'blocks', private.camel_active_rows(
      'public.card_blocks'::regclass, '10000000-0000-4000-8000-000000000001', 'blocks'
    )
  ),
  (select cards_revision from public.microsequences
   where id = '13000000-0000-4000-8000-000000000001')
) payload;
select ok(
  (select status = 'draft' and content_hash is null from public.courses
   where id = '10000000-0000-4000-8000-000000000001')
  and (select payload ->> 'microsequenceId' from official_replace_result)
      = '13000000-0000-4000-8000-000000000001',
  'replace service-role não deixa curso oficial alterado publicado com hash antigo'
);
rollback to published_official_tree_edit;
select set_config('request.jwt.claim.role', 'authenticated', true);

savepoint published_official_self_edit;
update public.courses set title = title || ' alterado'
where id = '10000000-0000-4000-8000-000000000001';
select ok(
  (select status = 'draft' and content_hash is null from public.courses
   where id = '10000000-0000-4000-8000-000000000001'),
  'edição autoral na própria linha remove curso oficial publicado do catálogo'
);
rollback to published_official_self_edit;

insert into public.courses (id, kind, status, contract_key, title, goal)
values (
  '10000000-0000-4000-8000-000000000099', 'official', 'draft',
  'curso-incompleto', 'Curso incompleto', 'Nunca deve ser publicado.'
);
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_like(
  $$select public.publish_official_course('10000000-0000-4000-8000-000000000099')$$,
  'Curso incompleto ou inválido:%', 'curso parcial não é publicado'
);
select is(
  (select status::text from public.courses where id = '10000000-0000-4000-8000-000000000099'),
  'draft', 'falha de publicação é atômica'
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.clone_catalog_course(
    '10000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001'
  )$$,
  'clone oficial é transacional'
);

create temp table test_state as
select
  personal.id personal_course_id,
  (select id from public.modules where course_id = personal.id and deleted_at is null limit 1) module_id,
  (select id from public.lessons where course_id = personal.id and deleted_at is null limit 1) lesson_id,
  (select id from public.microsequences where course_id = personal.id and deleted_at is null limit 1) microsequence_id,
  (select id from public.cards where course_id = personal.id and deleted_at is null limit 1) old_card_id,
  (select id from public.card_blocks where course_id = personal.id and deleted_at is null limit 1) old_block_id,
  (select revision from public.cards where course_id = personal.id and deleted_at is null limit 1) card_revision,
  (select revision from public.card_blocks where course_id = personal.id and deleted_at is null limit 1) block_revision
from public.courses personal
where personal.kind = 'personal'
  and personal.owner_id = '20000000-0000-4000-8000-000000000001'
  and personal.source_course_id = '10000000-0000-4000-8000-000000000001'
order by personal.created_at desc limit 1;
grant select on test_state to authenticated;

select is(
  public.clone_catalog_course(
    '10000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001'
  ),
  (select personal_course_id from test_state),
  'replay do clone retorna o mesmo curso'
);
select ok(
  (
    select bool_and('statement_timeout=60s' = any(coalesce(proconfig, '{}'::text[])))
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'clone_catalog_course'
      and pronargs in (1, 2)
  ),
  'RPCs de clone possuem prazo explícito para catálogos grandes'
);
select is(
  (
    select count(*)
    from public.sync_changes
    where course_id = (select personal_course_id from test_state)
      and entity_type not in ('courses', 'course_memberships')
  ),
  0::bigint,
  'clone anuncia membership sem duplicar a árvore inteira no feed'
);
select isnt(
  (select contract_key from public.courses where id = (select personal_course_id from test_state)),
  'curso-local-exemplo', 'clone usa contract_key pessoal único'
);
select ok(
  (select identity_key from public.modules
   where course_id = (select personal_course_id from test_state) and deleted_at is null limit 1)
    like 'course:' || (select contract_key from public.courses where id = (select personal_course_id from test_state)) || '/%',
  'clone rebaseia identity_key para o contract_key pessoal'
);
select isnt(
  public.clone_catalog_course(
    '10000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000002'
  ),
  (select personal_course_id from test_state),
  'duas cópias da mesma publicação recebem UUIDs distintos'
);
select is(
  (select count(*) from public.courses
   where owner_id = '20000000-0000-4000-8000-000000000001'
     and source_course_id = '10000000-0000-4000-8000-000000000001' and deleted_at is null),
  2::bigint, 'duas cópias pessoais coexistem'
);
savepoint refresh_hash_semantics;
update public.courses set title = title || ' — publicação 2'
where id = '10000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.role', 'service_role', true);
select public.publish_official_course('10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.role', 'authenticated', true);
create temp table refresh_hash_result as
select public.refresh_personal_course_from_source(
  (select result_course_id from private.rpc_idempotency
   where user_id = '20000000-0000-4000-8000-000000000001'
     and mutation_id = '21000000-0000-4000-8000-000000000002'),
  '21000000-0000-4000-8000-000000000003'
) course_id;
select ok(
  exists (
    select 1 from refresh_hash_result result
    join public.courses personal on personal.id = result.course_id
    join public.courses source on source.id = personal.source_course_id
    where personal.source_content_hash = source.content_hash
      and personal.baseline_content_hash = private.course_content_hash(personal.id)
      and personal.source_content_hash <> personal.baseline_content_hash
      and personal.personalized_at is null
  ),
  'refresh preserva hash exato da nova publicação e recalcula baseline da cópia pessoal'
);
rollback to refresh_hash_semantics;
select set_config('request.jwt.claim.role', 'authenticated', true);

savepoint refresh_denormalized_keys;
create temp table refresh_key_state as
select
  course.id course_id, course.contract_key course_key,
  module.id module_id, module.contract_key module_key,
  lesson.id lesson_id, lesson.contract_key lesson_key,
  lesson.source_entity_id source_lesson_id,
  microsequence.id microsequence_id, microsequence.contract_key microsequence_key,
  card.id card_id, card.contract_key card_key, card.position card_position,
  card.source_entity_id source_card_id
from public.courses course
join public.modules module on module.course_id = course.id and module.deleted_at is null
join public.lessons lesson on lesson.module_id = module.id and lesson.deleted_at is null
join public.microsequences microsequence
  on microsequence.lesson_id = lesson.id and microsequence.deleted_at is null
join public.cards card on card.microsequence_id = microsequence.id and card.deleted_at is null
where course.id = (
  select result_course_id from private.rpc_idempotency
  where user_id = auth.uid()
    and mutation_id = '21000000-0000-4000-8000-000000000002'
)
limit 1;
insert into public.lesson_progress (
  id, user_id, course_id, module_id, lesson_id, source_entity_id,
  course_key, module_key, lesson_key, path_key, first_viewed_at, last_activity_at
)
select
  '21200000-0000-4000-8000-000000000001', auth.uid(), course_id, module_id, lesson_id,
  source_lesson_id, course_key, module_key, lesson_key,
  course_key || '::' || module_key || '::' || lesson_key, now(), now()
from refresh_key_state;
insert into public.card_progress (
  id, user_id, course_id, module_id, lesson_id, lesson_progress_id, card_id,
  source_entity_id, path_key, card_key, position, first_viewed_at, attempts, last_activity_at
)
select
  '21200000-0000-4000-8000-000000000002', auth.uid(), course_id, module_id, lesson_id,
  '21200000-0000-4000-8000-000000000001', card_id, source_card_id,
  course_key || '::' || module_key || '::' || lesson_key,
  card_key, card_position, now(), 1, now()
from refresh_key_state;
insert into public.card_comments (
  id, user_id, course_id, module_id, lesson_id, microsequence_id, card_id,
  source_entity_id, course_key, module_key, lesson_key, microsequence_key, card_key, body
)
select
  '21200000-0000-4000-8000-000000000003', auth.uid(), course_id, module_id, lesson_id,
  microsequence_id, card_id, source_card_id, course_key, module_key, lesson_key,
  microsequence_key, card_key, 'Comentário preservado durante refresh.'
from refresh_key_state;

update public.modules set contract_key = 'modulo-inicial-renomeado'
where id = '11000000-0000-4000-8000-000000000001';
update public.lessons set contract_key = 'licao-inicial-renomeada'
where id = '12000000-0000-4000-8000-000000000001';
update public.microsequences set contract_key = 'micro-inicial-renomeada'
where id = '13000000-0000-4000-8000-000000000001';
update public.cards set contract_key = 'card-inicial-renomeado'
where id = '14000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.role', 'service_role', true);
select public.publish_official_course('10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.refresh_personal_course_from_source(
  (select course_id from refresh_key_state),
  '21100000-0000-4000-8000-000000000001'
);
select ok(
  (select progress.lesson_id <> before.lesson_id
              and progress.module_id <> before.module_id
              and progress.source_entity_id = '12000000-0000-4000-8000-000000000001'
              and progress.course_key = before.course_key
              and progress.module_key = 'modulo-inicial-renomeado'
              and progress.lesson_key = 'licao-inicial-renomeada'
              and progress.path_key = before.course_key
                || '::modulo-inicial-renomeado::licao-inicial-renomeada'
       from public.lesson_progress progress, refresh_key_state before
       where progress.id = '21200000-0000-4000-8000-000000000001'
         and progress.deleted_at is null)
  and (select progress.card_id <> before.card_id
              and progress.lesson_id <> before.lesson_id
              and progress.module_id <> before.module_id
              and progress.source_entity_id = '14000000-0000-4000-8000-000000000001'
              and progress.path_key = before.course_key
                || '::modulo-inicial-renomeado::licao-inicial-renomeada'
              and progress.card_key = 'card-inicial-renomeado'
              and progress.position = 1
       from public.card_progress progress, refresh_key_state before
       where progress.id = '21200000-0000-4000-8000-000000000002'
         and progress.deleted_at is null)
  and (select comment.card_id <> before.card_id
              and comment.lesson_id <> before.lesson_id
              and comment.module_id <> before.module_id
              and comment.microsequence_id <> before.microsequence_id
              and comment.source_entity_id = '14000000-0000-4000-8000-000000000001'
              and comment.course_key = before.course_key
              and comment.module_key = 'modulo-inicial-renomeado'
              and comment.lesson_key = 'licao-inicial-renomeada'
              and comment.microsequence_key = 'micro-inicial-renomeada'
              and comment.card_key = 'card-inicial-renomeado'
       from public.card_comments comment, refresh_key_state before
       where comment.id = '21200000-0000-4000-8000-000000000003'
         and comment.deleted_at is null),
  'refresh reconcilia FKs e chaves desnormalizadas de progresso/comentários por source_entity_id'
);
select is(
  (select personal.cards_revision
   from public.microsequences personal
   where personal.course_id = (select course_id from refresh_key_state)
     and personal.deleted_at is null),
  (select source.cards_revision from public.microsequences source
   where source.id = '13000000-0000-4000-8000-000000000001'),
  'refresh preserva cardsRevision atual da publicação de origem'
);
rollback to refresh_denormalized_keys;
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.pull_sync_changes(0, 1, '30000000-0000-4000-8000-000000000099')$$,
  'pull registra dispositivo novo mesmo com outbox vazia'
);

select isnt(
  (select personal_course_id from test_state),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'clone recebe novo UUID'
);
select is(
  (select count(*) from public.modules where course_id = (select personal_course_id from test_state) and deleted_at is null),
  (select count(*) from public.modules where course_id = '10000000-0000-4000-8000-000000000001' and deleted_at is null),
  'clone preserva todos os módulos'
);
select is(
  (select count(*) from public.cards where course_id = (select personal_course_id from test_state) and deleted_at is null),
  (select count(*) from public.cards where course_id = '10000000-0000-4000-8000-000000000001' and deleted_at is null),
  'clone preserva todos os cards'
);
select is(
  (select count(*) from public.card_blocks where course_id = (select personal_course_id from test_state) and deleted_at is null),
  (select count(*) from public.card_blocks where course_id = '10000000-0000-4000-8000-000000000001' and deleted_at is null),
  'clone preserva todos os blocos'
);
select is(
  (select personal.cards_revision
   from public.microsequences personal
   where personal.id = (select microsequence_id from test_state)),
  (select source.cards_revision
   from public.microsequences personal
   join public.microsequences source on source.id = personal.source_entity_id
   where personal.id = (select microsequence_id from test_state)),
  'clone preserva cardsRevision da microssequência de origem'
);
select ok(
  not exists (
    select 1 from public.modules
    where course_id = (select personal_course_id from test_state)
      and deleted_at is null and source_entity_id is null
  ),
  'clone registra source_entity_id'
);
select is(
  public.compute_course_content_hash((select personal_course_id from test_state)),
  (select baseline_content_hash from public.courses where id = (select personal_course_id from test_state)),
  'clone registra seu baseline canônico pessoal'
);
select is(
  (select source_content_hash from public.courses where id = (select personal_course_id from test_state)),
  (select content_hash from public.courses where id = '10000000-0000-4000-8000-000000000001'),
  'clone preserva o hash exato da publicação de origem'
);
select isnt(
  (select source_content_hash from public.courses where id = (select personal_course_id from test_state)),
  (select baseline_content_hash from public.courses where id = (select personal_course_id from test_state)),
  'hash da publicação não é confundido com baseline da cópia de contract_key pessoal'
);
select ok(
  exists (
    select 1 from public.list_user_course_summaries() summary
    where summary.course_id = (select personal_course_id from test_state)
      and summary.source_content_hash = (
        select content_hash from public.courses where id = '10000000-0000-4000-8000-000000000001'
      )
      and summary.baseline_content_hash = public.compute_course_content_hash(summary.course_id)
      and not summary.is_personalized
  ),
  'resumo expõe hash de origem e baseline pessoal com semânticas distintas'
);
savepoint personal_course_self_edit;
update public.courses set goal = goal || ' Personalizado.'
where id = (select personal_course_id from test_state);
select ok(
  (select content_hash is null and personalized_at is not null
   from public.courses where id = (select personal_course_id from test_state)),
  'edição autoral na própria linha marca curso pessoal como personalizado'
);
rollback to personal_course_self_edit;
select is(
  (select role::text from public.course_memberships
   where course_id = (select personal_course_id from test_state) and deleted_at is null),
  'owner', 'clone cria associação owner'
);

savepoint nested_authorial_revision;
create temp table nested_revision_before as
select lesson.revision lesson_revision, module.revision module_revision
from public.lessons lesson
join public.modules module on module.id = lesson.module_id
where lesson.id = (select lesson_id from test_state);
insert into public.guide_items (
  id, course_id, guide_id, item_kind, item_type, position, value
) values (
  '62500000-0000-4000-8000-000000000001',
  (select personal_course_id from test_state),
  (select id from public.course_guides
   where lesson_id = (select lesson_id from test_state) and deleted_at is null),
  'include', 'include',
  (select coalesce(max(position), -1) + 1 from public.guide_items
   where guide_id = (select id from public.course_guides
     where lesson_id = (select lesson_id from test_state) and deleted_at is null)
     and item_kind = 'include' and deleted_at is null),
  'Item aninhado que invalida a revisão da lição.'
);
select ok(
  (select lesson.revision > before.lesson_revision
   from public.lessons lesson, nested_revision_before before
   where lesson.id = (select lesson_id from test_state))
  and (select module.revision > before.module_revision
       from public.modules module, nested_revision_before before
       where module.id = (select module_id from test_state)),
  'guideItem avança os tokens agregados de lesson e module'
);
create temp table topic_revision_before as
select lesson.revision lesson_revision, module.revision module_revision
from public.lessons lesson
join public.modules module on module.id = lesson.module_id
where lesson.id = (select lesson_id from test_state);
insert into public.lesson_topics (
  id, course_id, lesson_id, contract_key, position, label, kind, topic_kind
) values (
  '62500000-0000-4000-8000-000000000002',
  (select personal_course_id from test_state), (select lesson_id from test_state),
  'topico-revisao-aninhada',
  (select coalesce(max(position), -1) + 1 from public.lesson_topics
   where lesson_id = (select lesson_id from test_state) and deleted_at is null),
  'Tópico para revisão aninhada', 'concept', 'concept'
);
insert into public.topic_statements (
  id, course_id, topic_id, statement_kind, statement_type, position, value
) values (
  '62500000-0000-4000-8000-000000000003',
  (select personal_course_id from test_state),
  '62500000-0000-4000-8000-000000000002',
  'check', 'check', 0, 'A revisão dos ancestrais precisa avançar.'
);
select ok(
  (select lesson.revision > before.lesson_revision
   from public.lessons lesson, topic_revision_before before
   where lesson.id = (select lesson_id from test_state))
  and (select module.revision > before.module_revision
       from public.modules module, topic_revision_before before
       where module.id = (select module_id from test_state)),
  'topic e topicStatement avançam os tokens agregados de lesson e module'
);
rollback to nested_authorial_revision;

savepoint free_card_topic;
create temp table free_card_topic_result as
select public.apply_sync_batch(
  '62800000-0000-4000-8000-000000000002',
  jsonb_build_array(jsonb_build_object(
    'mutationId','62900000-0000-4000-8000-000000000001',
    'courseId',(select personal_course_id from test_state),
    'entityType','cardTopics','entityId','62900000-0000-4000-8000-000000000001',
    'operation','insert','baseRevision',0,
    'changedFields',jsonb_build_array('topicContractKey'),
    'payload',jsonb_build_object(
      'cardId',(select old_card_id from test_state),
      'identityKey','course:test/card:original/topic:tag-livre',
      'topicId',null,'topicContractKey','tag-livre-sem-entidade','position',0
    )
  ))
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'status' = 'applied'
   from free_card_topic_result)
  and (select topic_id is null and value = 'tag-livre-sem-entidade'
              and topic_contract_key = 'tag-livre-sem-entidade'
       from public.card_refs where id = '62900000-0000-4000-8000-000000000001')
  and (select row_value ? 'topicId'
              and row_value -> 'topicId' = 'null'::jsonb
              and row_value ->> 'topicContractKey' = 'tag-livre-sem-entidade'
       from (
         select private.local_row('cardTopics', to_jsonb(reference)) row_value
         from public.card_refs reference
         where reference.id = '62900000-0000-4000-8000-000000000001'
       ) projected),
  'cardTopics preserva tag livre e topicId nulo no round-trip relacional'
);
insert into public.lesson_topics (
  id, course_id, lesson_id, contract_key, position, label, kind, topic_kind
) values (
  '62900000-0000-4000-8000-000000000002',
  (select personal_course_id from test_state), (select lesson_id from test_state),
  'topico-fk-removivel',
  (select coalesce(max(position), -1) + 1 from public.lesson_topics
   where lesson_id = (select lesson_id from test_state) and deleted_at is null),
  'Tópico removível', 'concept', 'concept'
);
insert into public.card_refs (
  id, course_id, card_id, topic_id, ref_kind, position, value, topic_contract_key
) values (
  '62900000-0000-4000-8000-000000000003',
  (select personal_course_id from test_state), (select old_card_id from test_state),
  '62900000-0000-4000-8000-000000000002', 'topic', 1,
  'topico-fk-removivel', 'topico-fk-removivel'
);
delete from public.lesson_topics where id = '62900000-0000-4000-8000-000000000002';
select ok(
  (select course_id = (select personal_course_id from test_state)
              and topic_id is null and value = 'topico-fk-removivel'
       from public.card_refs where id = '62900000-0000-4000-8000-000000000003'),
  'hard delete de topic nulifica somente topicId e preserva courseId da tag'
);
rollback to free_card_topic;

savepoint sync_course_creation;
create temp table sync_course_creation_result as
select public.apply_sync_batch(
  '62800000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','62700000-0000-4000-8000-000000000001',
      'courseId','62600000-0000-4000-8000-000000000001',
      'entityType','courses','entityId','62600000-0000-4000-8000-000000000001',
      'operation','insert','baseRevision',0,
      'changedFields',jsonb_build_array('title','goal','contractScope'),
      'payload',jsonb_build_object(
        'id','62600000-0000-4000-8000-000000000001',
        'courseId','62600000-0000-4000-8000-000000000001',
        'identityKey','course:curso-criado-via-sync',
        'contractKey','curso-criado-via-sync', 'position',0,
        'title','Curso criado via sync', 'goal','Exercitar criação relacional.',
        'contractScope','Escopo público preservado no PostgreSQL.'
      )
    ),
    jsonb_build_object(
      'mutationId','62700000-0000-4000-8000-000000000002',
      'courseId','62600000-0000-4000-8000-000000000001',
      'entityType','modules','entityId','62600000-0000-4000-8000-000000000002',
      'operation','insert','baseRevision',0,
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object(
        'identityKey','course:curso-criado-via-sync/module:modulo',
        'contractKey','modulo','position',0,'title','Módulo'
      )
    ),
    jsonb_build_object(
      'mutationId','62700000-0000-4000-8000-000000000003',
      'courseId','62600000-0000-4000-8000-000000000001',
      'entityType','lessons','entityId','62600000-0000-4000-8000-000000000003',
      'operation','insert','baseRevision',0,
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object(
        'moduleId','62600000-0000-4000-8000-000000000002',
        'identityKey','course:curso-criado-via-sync/module:modulo/lesson:licao',
        'contractKey','licao','position',0,'title','Lição'
      )
    ),
    jsonb_build_object(
      'mutationId','62700000-0000-4000-8000-000000000004',
      'courseId','62600000-0000-4000-8000-000000000001',
      'entityType','microsequences','entityId','62600000-0000-4000-8000-000000000004',
      'operation','insert','baseRevision',0,
      'changedFields',jsonb_build_array('title','goal','status'),
      'payload',jsonb_build_object(
        'lessonId','62600000-0000-4000-8000-000000000003',
        'identityKey','course:curso-criado-via-sync/module:modulo/lesson:licao/micro:micro',
        'contractKey','micro','position',0,'title','Microssequência',
        'goal','Persistir a árvore em linhas.','role','explain','status','ready'
      )
    ),
    jsonb_build_object(
      'mutationId','62700000-0000-4000-8000-000000000005',
      'courseId','62600000-0000-4000-8000-000000000001',
      'entityType','cards','entityId','62600000-0000-4000-8000-000000000005',
      'operation','insert','baseRevision',0,
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object(
        'lessonId','62600000-0000-4000-8000-000000000003',
        'microsequenceId','62600000-0000-4000-8000-000000000004',
        'identityKey','course:curso-criado-via-sync/module:modulo/lesson:licao/micro:micro/card:card',
        'contractKey','card','position',1,'resource','paragraph',
        'cardKind','theory','exercise','none','title','Card','after','','hasAfter',true
      )
    ),
    jsonb_build_object(
      'mutationId','62700000-0000-4000-8000-000000000006',
      'courseId','62600000-0000-4000-8000-000000000001',
      'entityType','blocks','entityId','62600000-0000-4000-8000-000000000006',
      'operation','insert','baseRevision',0,
      'changedFields',jsonb_build_array('value'),
      'payload',jsonb_build_object(
        'cardId','62600000-0000-4000-8000-000000000005',
        'identityKey','course:curso-criado-via-sync/module:modulo/lesson:licao/micro:micro/card:card/block:primary',
        'contractKey','bloco','position',0,'region','primary','isPrimary',true,
        'blockType','paragraph','value','Persistência granular.','hasValue',true
      )
    )
  )
) payload;
select is(
  (select count(*) from sync_course_creation_result,
   jsonb_array_elements(payload -> 'results') result
   where result ->> 'status' = 'applied'),
  6::bigint, 'curso pessoal e árvore mínima são criados atomicamente pelo sync'
);
select ok(
  exists (
    select 1 from public.courses course
    where course.id = '62600000-0000-4000-8000-000000000001'
      and course.kind = 'personal' and course.owner_id = auth.uid()
      and course.contract_scope = 'Escopo público preservado no PostgreSQL.'
      and private.local_row('courses', to_jsonb(course)) ->> 'contractScope'
          = 'Escopo público preservado no PostgreSQL.'
  )
  and exists (
    select 1 from public.course_memberships membership
    where membership.course_id = '62600000-0000-4000-8000-000000000001'
      and membership.user_id = auth.uid() and membership.role = 'owner'
      and membership.deleted_at is null
  )
  and exists (select 1 from public.card_blocks
              where id = '62600000-0000-4000-8000-000000000006'),
  'criação via sync preserva contractScope, owner membership e filhos relacionais'
);
rollback to sync_course_creation;

savepoint tree_coherence;
insert into public.modules (id, course_id, contract_key, position, title)
values ('62000000-0000-4000-8000-000000000001',
  (select personal_course_id from test_state), 'modulo-coerencia', 1, 'Módulo coerência');
insert into public.lessons (id, course_id, module_id, contract_key, position, title)
values ('62000000-0000-4000-8000-000000000002',
  (select personal_course_id from test_state), '62000000-0000-4000-8000-000000000001',
  'licao-coerencia', 0, 'Lição coerência');
insert into public.microsequences (
  id, course_id, lesson_id, contract_key, position, title, goal, role, status
) values ('62000000-0000-4000-8000-000000000003',
  (select personal_course_id from test_state), '62000000-0000-4000-8000-000000000002',
  'micro-coerencia', 0, 'Micro coerência', 'Validar FKs.', 'explain', 'ready');
select throws_like(
  $sql$insert into public.cards (
    id, course_id, lesson_id, microsequence_id, contract_key, position,
    resource, kind, card_kind, exercise, title, after_text, after, has_after
  ) values (
    '62000000-0000-4000-8000-000000000004', (select personal_course_id from test_state),
    (select lesson_id from test_state), '62000000-0000-4000-8000-000000000003',
    'card-incoerente', 1, 'paragraph', 'theory', 'theory', 'none', 'Inválido', '', '', true
  )$sql$,
  '%violates foreign key constraint%',
  'card não pode combinar lesson e microsequence de árvores diferentes'
);
select throws_like(
  $sql$insert into public.lesson_progress (
    id, user_id, course_id, module_id, lesson_id
  ) values (
    '62000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
    (select personal_course_id from test_state), '62000000-0000-4000-8000-000000000001',
    (select lesson_id from test_state)
  )$sql$,
  '%violates foreign key constraint%',
  'lesson_progress exige module correspondente à lesson'
);
insert into public.lesson_progress (
  id, user_id, course_id, module_id, lesson_id
) values (
  '62000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001',
  (select personal_course_id from test_state), '62000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002'
);
select throws_like(
  $sql$insert into public.card_progress (
    id, user_id, course_id, module_id, lesson_id, lesson_progress_id, card_id
  ) values (
    '62000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001',
    (select personal_course_id from test_state), (select module_id from test_state),
    (select lesson_id from test_state), '62000000-0000-4000-8000-000000000006',
    (select old_card_id from test_state)
  )$sql$,
  '%violates foreign key constraint%',
  'card_progress exige lesson_progress do mesmo user/module/lesson'
);
select throws_like(
  $sql$insert into public.card_comments (
    id, user_id, course_id, module_id, lesson_id, microsequence_id, card_id, body
  ) values (
    '62000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001',
    (select personal_course_id from test_state), (select module_id from test_state),
    (select lesson_id from test_state), '62000000-0000-4000-8000-000000000003',
    (select old_card_id from test_state), 'Incoerente'
  )$sql$,
  '%violates foreign key constraint%',
  'comentário exige module/lesson/microsequence correspondentes ao card'
);
insert into public.cards (
  id, course_id, lesson_id, microsequence_id, contract_key, position,
  resource, kind, card_kind, exercise, title, after_text, after, has_after
) values (
  '62000000-0000-4000-8000-000000000009', (select personal_course_id from test_state),
  '62000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000003',
  'card-coerencia', 1, 'paragraph', 'theory', 'theory', 'none', 'Card coerência', '', '', true
);
insert into public.card_blocks (
  id, course_id, card_id, contract_key, position, role, region, is_primary,
  block_type, value_text, value, has_value
) values (
  '62000000-0000-4000-8000-000000000010', (select personal_course_id from test_state),
  '62000000-0000-4000-8000-000000000009', 'block-coerencia', 0,
  'primary', 'primary', true, 'paragraph', 'B', 'B', true
);
insert into public.block_matrix_items (
  id, course_id, block_id, contract_key, position, item_kind, row_count, column_count
) values (
  '62000000-0000-4000-8000-000000000011', (select personal_course_id from test_state),
  (select old_block_id from test_state), 'matrix-coerencia', 0, 'matrix', 1, 1
);
select throws_like(
  $sql$insert into public.block_cells (
    id, course_id, block_id, matrix_item_id, row_index, column_index,
    cell_role, text_value, cell_kind, position, value_type
  ) values (
    '62000000-0000-4000-8000-000000000012', (select personal_course_id from test_state),
    '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000011',
    0, 0, 'value', 'X', 'matrix', 0, 'string'
  )$sql$,
  '%violates foreign key constraint%',
  'cell.matrixItemId deve pertencer ao mesmo blockId'
);
rollback to tree_coherence;
select ok(
  public.get_personal_course_graph((select personal_course_id from test_state))
    -> 'courses' -> 0 ? 'contractKey',
  'grafo remoto usa rows camelCase'
);
select ok(
  public.get_personal_course_graph((select personal_course_id from test_state))
    -> 'courses' -> 0 ?& array[
      'ownerId','kind','status','sourceCourseId','sourcePublicationSeq',
      'sourceContentHash','baselineContentHash','publicationSeq','contentHash','personalizedAt'
    ],
  'snapshot/feed de courses preserva metadados autoritativos usados pela réplica local'
);
select ok(
  not (public.get_personal_course_graph((select personal_course_id from test_state))
    -> 'courses' -> 0 ? 'contract_key'),
  'grafo remoto não vaza nomes snake_case'
);

savepoint composite_card_validation;
insert into public.cards (
  id, course_id, microsequence_id, lesson_id, contract_key, position,
  resource, kind, card_kind, exercise, title, after_text, after, has_after
) values (
  '61000000-0000-4000-8000-000000000001', (select personal_course_id from test_state),
  (select microsequence_id from test_state), (select lesson_id from test_state),
  'card-composite-real', 2, 'composite', 'theory', 'theory', 'none',
  'Card composite real', '', '', true
);
insert into public.card_blocks (
  id, course_id, card_id, contract_key, position, role, region, is_primary,
  block_type, value_text, value, has_value
) values (
  '61000000-0000-4000-8000-000000000002', (select personal_course_id from test_state),
  '61000000-0000-4000-8000-000000000001', 'composite-paragraph', 0,
  'composite', 'content', false, 'paragraph', 'Conteúdo composto.', 'Conteúdo composto.', true
);
select ok(
  not exists (
    select 1 from jsonb_array_elements(
      public.validate_course_graph((select personal_course_id from test_state)) -> 'errors'
    ) error where error ->> 'code' in ('card.primary_block_missing','card.composite_blocks_invalid')
  ),
  'card composite exige blocos content/composite e não exige bloco primary'
);
rollback to composite_card_validation;

savepoint contract_projection_validation;
update public.card_blocks set has_value = false
where id = (select old_block_id from test_state);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.validate_course_graph((select personal_course_id from test_state)) -> 'errors'
    ) error where error ->> 'code' = 'contract.projection_mismatch'
  ),
  'publicação rejeita flags de presença incompatíveis com a reconstrução v3'
);
rollback to contract_projection_validation;

savepoint public_key_scopes;
select lives_ok(
  $sql$do $body$
  begin
    insert into public.modules (id, course_id, contract_key, position, title)
    values ('61000000-0000-4000-8000-000000000010',
      (select personal_course_id from test_state), 'modulo-secundario', 1, 'Módulo secundário');
    insert into public.lessons (id, course_id, module_id, contract_key, position, title)
    values ('61000000-0000-4000-8000-000000000011',
      (select personal_course_id from test_state), '61000000-0000-4000-8000-000000000010',
      'licao-inicial', 0, 'Outra lição com chave pública repetida');
    insert into public.lesson_topics (
      id, course_id, lesson_id, contract_key, position, label, kind
    ) values
      ('61000000-0000-4000-8000-000000000012', (select personal_course_id from test_state),
       (select lesson_id from test_state), 'topico-repetido', 0, 'Tópico A', 'concept'),
      ('61000000-0000-4000-8000-000000000013', (select personal_course_id from test_state),
       '61000000-0000-4000-8000-000000000011', 'topico-repetido', 0, 'Tópico B', 'concept');
    insert into public.microsequences (
      id, course_id, lesson_id, contract_key, position, title, goal, role, status
    ) values ('61000000-0000-4000-8000-000000000014',
      (select personal_course_id from test_state), '61000000-0000-4000-8000-000000000011',
      'micro-inicial', 0, 'Micro B', 'Testar escopo.', 'explain', 'ready');
    insert into public.cards (
      id, course_id, lesson_id, microsequence_id, contract_key, position,
      resource, kind, card_kind, exercise, title, after_text, after, has_after
    ) values ('61000000-0000-4000-8000-000000000015',
      (select personal_course_id from test_state), '61000000-0000-4000-8000-000000000011',
      '61000000-0000-4000-8000-000000000014', 'card-inicial', 1,
      'paragraph', 'theory', 'theory', 'none', 'Card B', '', '', true);
  end
  $body$$sql$,
  'contract_key pode repetir nos diferentes pais previstos pelo contrato v3'
);
rollback to public_key_scopes;

savepoint position_scope_shapes;
insert into public.block_nodes (
  id, course_id, block_id, contract_key, position, node_scope, node_kind
) values
  ('61000000-0000-4000-8000-000000000020', (select personal_course_id from test_state),
   (select old_block_id from test_state), 'tree-node', 0, 'tree', 'folder'),
  ('61000000-0000-4000-8000-000000000021', (select personal_course_id from test_state),
   (select old_block_id from test_state), 'graph-node', 0, 'graph', 'vertex');
insert into public.block_matrix_items (
  id, course_id, block_id, contract_key, position, item_kind, is_sequence,
  row_count, column_count
) values
  ('61000000-0000-4000-8000-000000000022', (select personal_course_id from test_state),
   (select old_block_id from test_state), 'matrix-values', 0, 'matrix', false, 1, 1),
  ('61000000-0000-4000-8000-000000000023', (select personal_course_id from test_state),
   (select old_block_id from test_state), 'matrix-sequence', 0, 'sequence', true, 1, 1);
insert into public.block_lines (
  id, course_id, block_id, contract_key, position, line_kind, line_role, x1, y1, x2, y2
) values
  ('61000000-0000-4000-8000-000000000024', (select personal_course_id from test_state),
   (select old_block_id from test_state), 'axis-line', 0, 'axis', 'axis', 0, 0, 1, 0),
  ('61000000-0000-4000-8000-000000000025', (select personal_course_id from test_state),
   (select old_block_id from test_state), 'vector-line', 0, 'vector', 'vector', 0, 0, 1, 1);
insert into public.block_highlights (
  id, course_id, block_id, position, target_kind, text_value, selection_type, value
) values
  ('61000000-0000-4000-8000-000000000026', (select personal_course_id from test_state),
   (select old_block_id from test_state), 0, 'pattern', 'a', 'pattern', 'a'),
  ('61000000-0000-4000-8000-000000000027', (select personal_course_id from test_state),
   (select old_block_id from test_state), 0, 'pattern', 'b', 'vertex', 'b');
insert into public.flow_nodes (
  id, course_id, block_id, branch, position, node_kind
) values (
  '61000000-0000-4000-8000-000000000028', (select personal_course_id from test_state),
  (select old_block_id from test_state), 'root', 0, 'sequence'
);
insert into public.flow_practices (
  id, course_id, owner_type, flow_node_id
) values (
  '61000000-0000-4000-8000-000000000029', (select personal_course_id from test_state),
  'node', '61000000-0000-4000-8000-000000000028'
);
insert into public.node_practices (
  id, course_id, practice_id, entry_kind, label_key, position
) values
  ('61000000-0000-4000-8000-000000000030', (select personal_course_id from test_state),
   '61000000-0000-4000-8000-000000000029', 'label', 'first', 0),
  ('61000000-0000-4000-8000-000000000031', (select personal_course_id from test_state),
   '61000000-0000-4000-8000-000000000029', 'label', 'second', 1),
  ('61000000-0000-4000-8000-000000000032', (select personal_course_id from test_state),
   '61000000-0000-4000-8000-000000000029', 'text', null, 0);
select ok(
  not exists (
    select 1 from private.position_findings((select personal_course_id from test_state)) finding
    where finding.path like any (array[
      '$.__relationalOrder.nodes%', '$.__relationalOrder.matrixItems%',
      '$.__relationalOrder.lines%', '$.__relationalOrder.highlights%',
      '$.__relationalOrder.flowPracticeEntries%'
    ])
  ),
  'position usa os mesmos escopos públicos do conversor para nós, matrizes, linhas, destaques e práticas'
);
rollback to position_scope_shapes;

create temp table rls_course_count (value bigint);
grant select, insert, delete on rls_course_count to authenticated;
grant select on public.courses to authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
set local role authenticated;
insert into rls_course_count select count(*) from public.courses
where id = (select personal_course_id from test_state);
reset role;
select is(
  (select value from rls_course_count),
  0::bigint, 'RLS oculta curso pessoal de outro usuário'
);
delete from rls_course_count;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into rls_course_count select count(*) from public.courses
where id = (select personal_course_id from test_state);
reset role;
select is(
  (select value from rls_course_count),
  1::bigint, 'RLS permite leitura ao proprietário'
);
revoke select on public.courses from authenticated;

select ok(
  not exists (
    select 1
    from pg_index index_definition
    join pg_class index_relation on index_relation.oid = index_definition.indexrelid
    join pg_namespace namespace on namespace.oid = index_relation.relnamespace
    where namespace.nspname = 'public' and index_definition.indisunique
      and pg_get_indexdef(index_definition.indexrelid) ~* '\mposition\M'
  ),
  'position usa índice normal para permitir swaps sem colisão intermediária'
);

create temp table reorder_push as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000010',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId', '31000000-0000-4000-8000-000000000010',
      'courseId', (select personal_course_id from test_state),
      'entityType', 'modules', 'entityId', '32000000-0000-4000-8000-000000000010',
      'operation', 'insert', 'baseRevision', 0,
      'changedFields', jsonb_build_array('position'),
      'payload', jsonb_build_object(
        'id', '32000000-0000-4000-8000-000000000010',
        'courseId', (select personal_course_id from test_state),
        'identityKey', 'course:' || (
          select contract_key from public.courses where id = (select personal_course_id from test_state)
        ) || '/module:reorder-test',
        'contractKey', 'module-reorder-test', 'position', 1, 'title', 'Módulo para reorder'
      )
    ),
    jsonb_build_object(
      'mutationId', '31000000-0000-4000-8000-000000000011',
      'courseId', (select personal_course_id from test_state),
      'entityType', 'modules',
      'entityId', (select id from public.modules
        where course_id = (select personal_course_id from test_state)
          and contract_key <> 'module-reorder-test' and deleted_at is null limit 1),
      'operation', 'update',
      'baseRevision', (select revision from public.modules
        where course_id = (select personal_course_id from test_state)
          and contract_key <> 'module-reorder-test' and deleted_at is null limit 1),
      'changedFields', jsonb_build_array('position'),
      'payload', jsonb_build_object('position', 1)
    ),
    jsonb_build_object(
      'mutationId', '31000000-0000-4000-8000-000000000012',
      'courseId', (select personal_course_id from test_state),
      'entityType', 'modules', 'entityId', '32000000-0000-4000-8000-000000000010',
      'operation', 'update', 'baseRevision', 1,
      'changedFields', jsonb_build_array('position'),
      'payload', jsonb_build_object('position', 0)
    )
  )
) payload;
select is(
  (select count(*) from reorder_push,
    jsonb_array_elements(payload -> 'results') result where result ->> 'status' = 'applied'),
  3::bigint, 'insert e swap de posições são aceitos no mesmo lote'
);
select is(
  (select position from public.modules where id = '32000000-0000-4000-8000-000000000010'),
  0, 'entidade movida para o início recebe position zero'
);
select is(
  (select position from public.modules
   where course_id = (select personal_course_id from test_state)
     and id <> '32000000-0000-4000-8000-000000000010' and deleted_at is null limit 1),
  1, 'entidade anterior é deslocada sem rejeição intermediária'
);
update public.modules set position = 5 where id = '32000000-0000-4000-8000-000000000010';
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.validate_course_graph((select personal_course_id from test_state)) -> 'errors'
    ) error where error ->> 'code' = 'position.invalid'
  ),
  'validação relacional rejeita lacuna de position no estado final'
);
update public.modules set position = 0 where id = '32000000-0000-4000-8000-000000000010';
select ok(
  not exists (
    select 1 from jsonb_array_elements(
      public.validate_course_graph((select personal_course_id from test_state)) -> 'errors'
    ) error where error ->> 'code' = 'position.invalid'
  ),
  'validação relacional aceita positions únicos e contíguos após o swap'
);

create temp table ancestor_before_block as
select
  card.revision card_revision,
  microsequence.revision microsequence_revision,
  lesson.revision lesson_revision,
  module.revision module_revision
from public.cards card
join public.microsequences microsequence on microsequence.id = card.microsequence_id
join public.lessons lesson on lesson.id = microsequence.lesson_id
join public.modules module on module.id = lesson.module_id
where card.id = (select old_card_id from test_state);

create temp table first_push as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'mutationId', '31000000-0000-4000-8000-000000000001',
    'courseId', (select personal_course_id from test_state),
    'entityType', 'blocks', 'entityId', (select old_block_id from test_state),
    'operation', 'upsert',
    'baseRevision', (select revision from public.card_blocks where id = (select old_block_id from test_state)),
    'changedFields', jsonb_build_array('value'),
    'payload', jsonb_build_object('value', 'Texto alterado em uma única linha.')
  ))
) payload;
select is(
  (select payload -> 'results' -> 0 ->> 'status' from first_push),
  'applied', 'push bottom-up é aplicado'
);
select is(
  (select value_text from public.card_blocks where id = (select old_block_id from test_state)),
  'Texto alterado em uma única linha.', 'push altera o bloco solicitado'
);
select ok(
  (select card.revision > before.card_revision
   from public.cards card, ancestor_before_block before
   where card.id = (select old_card_id from test_state))
  and (select microsequence.revision > before.microsequence_revision
       from public.microsequences microsequence, ancestor_before_block before
       where microsequence.id = (select microsequence_id from test_state))
  and (select lesson.revision > before.lesson_revision
       from public.lessons lesson, ancestor_before_block before
       where lesson.id = (select lesson_id from test_state))
  and (select module.revision > before.module_revision
       from public.modules module, ancestor_before_block before
       where module.id = (select module_id from test_state)),
  'bloco altera só conteúdo próprio e avança tokens agregados de card, micro, lesson e module'
);

savepoint aggregate_batch_snapshot;
create temp table aggregate_batch_before as
select
  (select revision from public.card_blocks where id = (select old_block_id from test_state)) block_revision,
  (select revision from public.cards where id = (select old_card_id from test_state)) card_revision,
  (select revision from public.courses where id = (select personal_course_id from test_state)) course_revision;
create temp table child_then_parent_batch as
select public.apply_sync_batch(
  '63000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','63100000-0000-4000-8000-000000000001',
      'courseId',(select personal_course_id from test_state),
      'entityType','blocks','entityId',(select old_block_id from test_state),
      'operation','update','baseRevision',(select block_revision from aggregate_batch_before),
      'changedFields',jsonb_build_array('value'),
      'payload',jsonb_build_object('value','Filho alterado antes do pai no mesmo lote.')
    ),
    jsonb_build_object(
      'mutationId','63100000-0000-4000-8000-000000000002',
      'courseId',(select personal_course_id from test_state),
      'entityType','cards','entityId',(select old_card_id from test_state),
      'operation','update','baseRevision',(select card_revision from aggregate_batch_before),
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object('title','Pai alterado depois do filho')
    )
  )
) payload;
select ok(
  (select count(*) = 2 from child_then_parent_batch,
   jsonb_array_elements(payload -> 'results') result where result ->> 'status' = 'applied')
  and (select title = 'Pai alterado depois do filho'
       from public.cards where id = (select old_card_id from test_state))
  and (select revision = before.course_revision + 2
       from public.courses course, aggregate_batch_before before
       where course.id = (select personal_course_id from test_state)),
  'snapshot do lote aceita filho antes do pai e avança o token do curso uma vez por linha'
);
rollback to aggregate_batch_snapshot;

savepoint interleaved_parent_batch;
create temp table interleaved_batch_before as
select
  (select revision from public.card_blocks where id = (select old_block_id from test_state)) block_revision,
  (select revision from public.cards where id = (select old_card_id from test_state)) card_revision,
  (select revision from public.courses where id = (select personal_course_id from test_state)) course_revision;
create temp table interleaved_parent_batch_result as
select public.apply_sync_batch(
  '63000000-0000-4000-8000-000000000002',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','63100000-0000-4000-8000-000000000003',
      'courseId',(select personal_course_id from test_state),
      'entityType','cards','entityId',(select old_card_id from test_state),
      'operation','update','baseRevision',(select card_revision from interleaved_batch_before),
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object('title','Primeira edição direta do pai')
    ),
    jsonb_build_object(
      'mutationId','63100000-0000-4000-8000-000000000004',
      'courseId',(select personal_course_id from test_state),
      'entityType','blocks','entityId',(select old_block_id from test_state),
      'operation','update','baseRevision',(select block_revision from interleaved_batch_before),
      'changedFields',jsonb_build_array('value'),
      'payload',jsonb_build_object('value','Filho intercalado entre duas edições do pai.')
    ),
    jsonb_build_object(
      'mutationId','63100000-0000-4000-8000-000000000005',
      'courseId',(select personal_course_id from test_state),
      'entityType','cards','entityId',(select old_card_id from test_state),
      'operation','update','baseRevision',(select card_revision + 1 from interleaved_batch_before),
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object('title','Segunda edição direta do pai')
    )
  )
) payload;
select ok(
  (select count(*) = 3 from interleaved_parent_batch_result,
   jsonb_array_elements(payload -> 'results') result where result ->> 'status' = 'applied')
  and (select title = 'Segunda edição direta do pai'
              and revision = before.card_revision + 3
       from public.cards card, interleaved_batch_before before
       where card.id = (select old_card_id from test_state))
  and (select revision = before.course_revision + 3
       from public.courses course, interleaved_batch_before before
       where course.id = (select personal_course_id from test_state)),
  'contagem direta aceita pai-filho-pai sem esconder concorrência externa'
);
rollback to interleaved_parent_batch;

savepoint inserted_parent_batch;
create temp table inserted_parent_batch_result as
select public.apply_sync_batch(
  '63000000-0000-4000-8000-000000000003',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','63100000-0000-4000-8000-000000000006',
      'courseId',(select personal_course_id from test_state),
      'entityType','cards','entityId','63200000-0000-4000-8000-000000000001',
      'operation','insert','baseRevision',0,
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object(
        'lessonId',(select lesson_id from test_state),
        'microsequenceId',(select microsequence_id from test_state),
        'identityKey','course:sync/card:insert-parent',
        'contractKey','card-insert-parent','position',2,'resource','paragraph',
        'cardKind','theory','exercise','none','title','Card recém-inserido',
        'after','','hasAfter',true
      )
    ),
    jsonb_build_object(
      'mutationId','63100000-0000-4000-8000-000000000007',
      'courseId',(select personal_course_id from test_state),
      'entityType','blocks','entityId','63200000-0000-4000-8000-000000000002',
      'operation','insert','baseRevision',0,
      'changedFields',jsonb_build_array('value'),
      'payload',jsonb_build_object(
        'cardId','63200000-0000-4000-8000-000000000001',
        'identityKey','course:sync/card:insert-parent/block:primary',
        'contractKey','block-insert-parent','position',0,'region','primary','isPrimary',true,
        'blockType','paragraph','value','Filho do card novo.','hasValue',true
      )
    ),
    jsonb_build_object(
      'mutationId','63100000-0000-4000-8000-000000000008',
      'courseId',(select personal_course_id from test_state),
      'entityType','cards','entityId','63200000-0000-4000-8000-000000000001',
      'operation','update','baseRevision',1,
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object('title','Card novo atualizado após inserir o filho')
    )
  )
) payload;
select ok(
  (select count(*) = 3 from inserted_parent_batch_result,
   jsonb_array_elements(payload -> 'results') result where result ->> 'status' = 'applied')
  and (select title = 'Card novo atualizado após inserir o filho' and revision = 3
       from public.cards where id = '63200000-0000-4000-8000-000000000001'),
  'snapshot também aceita insert do pai, insert do filho e update direto do pai'
);
rollback to inserted_parent_batch;

savepoint atomic_subtree_delete;
insert into public.modules (id, course_id, contract_key, position, title) values (
  '63300000-0000-4000-8000-000000000001',
  (select personal_course_id from test_state), 'modulo-delete-atomico',
  (select coalesce(max(position), -1) + 1 from public.modules
   where course_id = (select personal_course_id from test_state) and deleted_at is null),
  'Módulo para delete atômico'
);
insert into public.lessons (id, course_id, module_id, contract_key, position, title) values (
  '63300000-0000-4000-8000-000000000002',
  (select personal_course_id from test_state), '63300000-0000-4000-8000-000000000001',
  'licao-delete-atomico', 0, 'Lição para delete atômico'
);
insert into public.microsequences (
  id, course_id, lesson_id, contract_key, position, title, goal, role, status
) values (
  '63300000-0000-4000-8000-000000000003',
  (select personal_course_id from test_state), '63300000-0000-4000-8000-000000000002',
  'micro-delete-atomico', 0, 'Micro para delete atômico', 'Validar rollback.', 'explain', 'ready'
);
insert into public.cards (
  id, course_id, lesson_id, microsequence_id, contract_key, position,
  resource, kind, card_kind, exercise, title, after_text, after, has_after
) values (
  '63300000-0000-4000-8000-000000000004',
  (select personal_course_id from test_state), '63300000-0000-4000-8000-000000000002',
  '63300000-0000-4000-8000-000000000003', 'card-delete-atomico', 1,
  'paragraph', 'theory', 'theory', 'none', 'Card para delete atômico', '', '', true
);
insert into public.card_blocks (
  id, course_id, card_id, contract_key, position, role, region, is_primary,
  block_type, value_text, value, has_value
) values (
  '63300000-0000-4000-8000-000000000005',
  (select personal_course_id from test_state), '63300000-0000-4000-8000-000000000004',
  'block-delete-atomico', 0, 'primary', 'primary', true,
  'paragraph', 'Bloco para delete atômico.', 'Bloco para delete atômico.', true
);
create temp table atomic_subtree_before as
select
  (select revision from public.card_blocks where id = '63300000-0000-4000-8000-000000000005') block_revision,
  (select revision from public.cards where id = '63300000-0000-4000-8000-000000000004') card_revision,
  (select revision from public.microsequences where id = '63300000-0000-4000-8000-000000000003') micro_revision,
  (select revision from public.lessons where id = '63300000-0000-4000-8000-000000000002') lesson_revision,
  (select revision from public.modules where id = '63300000-0000-4000-8000-000000000001') module_revision,
  (select revision from public.courses where id = (select personal_course_id from test_state)) course_revision;
create temp table failed_atomic_subtree_delete as
select public.apply_sync_batch(
  '63000000-0000-4000-8000-000000000004',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','63400000-0000-4000-8000-000000000001',
      'courseId',(select personal_course_id from test_state),
      'entityType','blocks','entityId','63300000-0000-4000-8000-000000000005',
      'operation','delete','baseRevision',(select block_revision from atomic_subtree_before),
      'changedFields','[]'::jsonb,'payload','{}'::jsonb
    ),
    jsonb_build_object(
      'mutationId','63400000-0000-4000-8000-000000000002',
      'courseId',(select personal_course_id from test_state),
      'entityType','cards','entityId','63300000-0000-4000-8000-000000000004',
      'operation','delete','baseRevision',(select card_revision - 1 from atomic_subtree_before),
      'changedFields','[]'::jsonb,'payload','{}'::jsonb
    )
  )
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'reason' = 'atomic_batch_rolled_back'
          and (payload -> 'results' -> 0 ->> 'rolledBack')::boolean
          and (payload -> 'results' -> 0 ->> 'blocked')::boolean
          and payload -> 'results' -> 1 ->> 'reason' = 'revision_mismatch'
          and (payload ->> 'rolledBack')::boolean
   from failed_atomic_subtree_delete)
  and (select deleted_at is null and revision = before.block_revision
       from public.card_blocks block, atomic_subtree_before before
       where block.id = '63300000-0000-4000-8000-000000000005')
  and (select deleted_at is null and revision = before.card_revision
       from public.cards card, atomic_subtree_before before
       where card.id = '63300000-0000-4000-8000-000000000004')
  and (select revision = before.course_revision
       from public.courses course, atomic_subtree_before before
       where course.id = (select personal_course_id from test_state)),
  'conflito tardio reverte mutações, revisões e tombstones anteriores do lote'
);
savepoint rolled_back_mutation_retry;
create temp table rolled_back_mutation_retry_result as
select public.apply_sync_batch(
  '63000000-0000-4000-8000-000000000004',
  jsonb_build_array(jsonb_build_object(
    'mutationId','63400000-0000-4000-8000-000000000001',
    'courseId',(select personal_course_id from test_state),
    'entityType','blocks','entityId','63300000-0000-4000-8000-000000000005',
    'operation','delete','baseRevision',(select block_revision from atomic_subtree_before),
    'changedFields','[]'::jsonb,'payload','{}'::jsonb
  ))
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'status' = 'applied'
   from rolled_back_mutation_retry_result)
  and exists (
    select 1 from public.sync_mutations
    where user_id = auth.uid()
      and mutation_id = '63400000-0000-4000-8000-000000000001'
      and status = 'applied'
  ),
  'mutationId de irmã revertida fica reutilizável depois da resolução do blocker'
);
rollback to rolled_back_mutation_retry;
create temp table successful_atomic_subtree_delete as
select public.apply_sync_batch(
  '63000000-0000-4000-8000-000000000005',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','63400000-0000-4000-8000-000000000003',
      'courseId',(select personal_course_id from test_state),
      'entityType','blocks','entityId','63300000-0000-4000-8000-000000000005',
      'operation','delete','baseRevision',(select block_revision from atomic_subtree_before),
      'changedFields','[]'::jsonb,'payload','{}'::jsonb
    ),
    jsonb_build_object(
      'mutationId','63400000-0000-4000-8000-000000000004',
      'courseId',(select personal_course_id from test_state),
      'entityType','cards','entityId','63300000-0000-4000-8000-000000000004',
      'operation','delete','baseRevision',(select card_revision from atomic_subtree_before),
      'changedFields','[]'::jsonb,'payload','{}'::jsonb
    ),
    jsonb_build_object(
      'mutationId','63400000-0000-4000-8000-000000000005',
      'courseId',(select personal_course_id from test_state),
      'entityType','microsequences','entityId','63300000-0000-4000-8000-000000000003',
      'operation','delete','baseRevision',(select micro_revision from atomic_subtree_before),
      'changedFields','[]'::jsonb,'payload','{}'::jsonb
    ),
    jsonb_build_object(
      'mutationId','63400000-0000-4000-8000-000000000006',
      'courseId',(select personal_course_id from test_state),
      'entityType','lessons','entityId','63300000-0000-4000-8000-000000000002',
      'operation','delete','baseRevision',(select lesson_revision from atomic_subtree_before),
      'changedFields','[]'::jsonb,'payload','{}'::jsonb
    ),
    jsonb_build_object(
      'mutationId','63400000-0000-4000-8000-000000000007',
      'courseId',(select personal_course_id from test_state),
      'entityType','modules','entityId','63300000-0000-4000-8000-000000000001',
      'operation','delete','baseRevision',(select module_revision from atomic_subtree_before),
      'changedFields','[]'::jsonb,'payload','{}'::jsonb
    )
  )
) payload;
select ok(
  (select count(*) = 5 from successful_atomic_subtree_delete,
   jsonb_array_elements(payload -> 'results') result where result ->> 'status' = 'applied')
  and (select bool_and(deleted_at is not null) from (
    select deleted_at from public.card_blocks where id = '63300000-0000-4000-8000-000000000005'
    union all select deleted_at from public.cards where id = '63300000-0000-4000-8000-000000000004'
    union all select deleted_at from public.microsequences where id = '63300000-0000-4000-8000-000000000003'
    union all select deleted_at from public.lessons where id = '63300000-0000-4000-8000-000000000002'
    union all select deleted_at from public.modules where id = '63300000-0000-4000-8000-000000000001'
  ) tombstones)
  and (select revision = before.course_revision + 5
       from public.courses course, atomic_subtree_before before
       where course.id = (select personal_course_id from test_state)),
  'delete bottom-up completo usa o snapshot inicial e aplica toda a subárvore atomicamente'
);
rollback to atomic_subtree_delete;

create temp table stale_parent_revision as
select revision from public.cards where id = (select old_card_id from test_state);
create temp table concurrent_child_insert as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000002',
  jsonb_build_array(jsonb_build_object(
    'mutationId','31500000-0000-4000-8000-000000000001',
    'courseId',(select personal_course_id from test_state),
    'entityType','blocks','entityId','31000000-0000-4000-8000-000000000011',
    'operation','insert','baseRevision',0,'changedFields',jsonb_build_array('value'),
    'payload',jsonb_build_object(
      'id','31000000-0000-4000-8000-000000000011',
      'courseId',(select personal_course_id from test_state),
      'cardId',(select old_card_id from test_state),
      'identityKey','course:test/card:original/block:after-concorrente',
      'contractKey','after-concorrente','position',0,'region','after','isPrimary',false,
      'blockType','paragraph','value','Filho inserido por outro dispositivo.','hasValue',true
    )
  ))
) payload;
create temp table stale_parent_delete as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'mutationId','31500000-0000-4000-8000-000000000002',
    'courseId',(select personal_course_id from test_state),
    'entityType','cards','entityId',(select old_card_id from test_state),
    'operation','delete','baseRevision',(select revision from stale_parent_revision),
    'changedFields','[]'::jsonb,'payload','{}'::jsonb
  ))
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'status' from concurrent_child_insert) = 'applied'
  and (select payload -> 'results' -> 0 ->> 'status' from stale_parent_delete) = 'conflict'
  and (select deleted_at is null from public.cards where id = (select old_card_id from test_state)),
  'filho concorrente invalida baseRevision e impede exclusão stale do pai'
);

create temp table replay_push as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_array((
    select request from public.sync_mutations
    where user_id = auth.uid()
      and mutation_id = '31000000-0000-4000-8000-000000000001'
  ))
) payload;
select ok(
  (select (payload -> 'results' -> 0 ->> 'idempotent')::boolean from replay_push),
  'mutationId repetido é idempotente'
);
select is(
  (select revision from public.card_blocks where id = (select old_block_id from test_state)),
  (select block_revision + 1 from test_state), 'repetição não incrementa revision'
);
create temp table incompatible_replay_push as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'mutationId', '31000000-0000-4000-8000-000000000001',
    'courseId', (select personal_course_id from test_state),
    'entityType', 'blocks', 'entityId', (select old_block_id from test_state),
    'operation', 'update', 'baseRevision', 1,
    'changedFields', jsonb_build_array('value'),
    'payload', jsonb_build_object('value', 'Não deve ser reaplicado.')
  ))
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'status' = 'rejected'
      and payload -> 'results' -> 0 ->> 'code' = '23505'
      and payload -> 'results' -> 0 ->> 'reason' = 'mutation_id_reuse'
   from incompatible_replay_push),
  'mutationId reutilizado com payload incompatível é rejeitado definitivamente'
);

create temp table conflict_push as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'mutationId', '31000000-0000-4000-8000-000000000002',
    'courseId', (select personal_course_id from test_state),
    'entityType', 'blocks', 'entityId', (select old_block_id from test_state),
    'operation', 'update', 'baseRevision', 1,
    'changedFields', jsonb_build_array('value'),
    'payload', jsonb_build_object('value', 'Conflito não sobrescreve.')
  ))
) payload;
select is(
  (select payload -> 'results' -> 0 ->> 'status' from conflict_push),
  'conflict', 'revision divergente registra conflito'
);
create temp table unknown_payload_push as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'mutationId','31000000-0000-4000-8000-000000000020',
    'courseId',(select personal_course_id from test_state),
    'entityType','blocks','entityId',(select old_block_id from test_state),
    'operation','update',
    'baseRevision',(select revision from public.card_blocks where id = (select old_block_id from test_state)),
    'changedFields',jsonb_build_array('value'),
    'payload',jsonb_build_object('value','não aplicar','campoInventado',true)
  ))
) payload;
select is(
  (select payload -> 'results' -> 0 ->> 'status' from unknown_payload_push),
  'rejected', 'sync rejeita campo desconhecido no payload em vez de descartá-lo silenciosamente'
);
create temp table unknown_changed_field_push as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'mutationId','31000000-0000-4000-8000-000000000021',
    'courseId',(select personal_course_id from test_state),
    'entityType','blocks','entityId',(select old_block_id from test_state),
    'operation','update',
    'baseRevision',(select revision from public.card_blocks where id = (select old_block_id from test_state)),
    'changedFields',jsonb_build_array('campoInventado'),
    'payload',jsonb_build_object('value','não aplicar')
  ))
) payload;
select is(
  (select payload -> 'results' -> 0 ->> 'status' from unknown_changed_field_push),
  'rejected', 'sync rejeita changedFields desconhecido'
);
create temp table payload_outside_changed_fields as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'mutationId','31000000-0000-4000-8000-000000000022',
    'courseId',(select personal_course_id from test_state),
    'entityType','blocks','entityId',(select old_block_id from test_state),
    'operation','update',
    'baseRevision',(select revision from public.card_blocks where id = (select old_block_id from test_state)),
    'changedFields',jsonb_build_array('value'),
    'payload',jsonb_build_object('value','não aplicar','position',99)
  ))
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'status' = 'rejected'
      and payload -> 'results' -> 0 ->> 'code' = '22023'
   from payload_outside_changed_fields),
  'payload rejeita campo mutável conhecido ausente de changedFields'
);
create temp table changed_field_without_payload as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'mutationId','31000000-0000-4000-8000-000000000023',
    'courseId',(select personal_course_id from test_state),
    'entityType','blocks','entityId',(select old_block_id from test_state),
    'operation','update',
    'baseRevision',(select revision from public.card_blocks where id = (select old_block_id from test_state)),
    'changedFields',jsonb_build_array('value'),
    'payload','{}'::jsonb
  ))
) payload;
select is(
  (select payload -> 'results' -> 0 ->> 'status' from changed_field_without_payload),
  'rejected', 'changedFields não pode declarar campo ausente do patch'
);
select is(
  (select count(*) from public.sync_mutations
   where user_id = '20000000-0000-4000-8000-000000000001'
     and mutation_id in (
       '31000000-0000-4000-8000-000000000001',
       '31000000-0000-4000-8000-000000000002'
     )),
  2::bigint, 'ledger persiste uma linha por mutationId'
);

create temp table pull_state as
select public.pull_sync_changes(0, 500, '30000000-0000-4000-8000-000000000001') payload;
select ok(
  exists (
    select 1 from pull_state, jsonb_array_elements(payload -> 'changes') change
    where change ->> 'entityType' = 'blocks'
      and change -> 'row' ? 'value' and not (change -> 'row' ? 'valueText')
  ),
  'pull incremental fornece storeName e payload camelCase'
);

insert into public.lesson_progress (
  id, user_id, course_id, module_id, lesson_id, first_viewed_at, last_activity_at
) values (
  '40000000-0000-4000-8000-000000000000',
  '20000000-0000-4000-8000-000000000001',
  (select personal_course_id from test_state), (select module_id from test_state),
  (select lesson_id from test_state), now(), now()
);
insert into public.card_progress (
  id, user_id, course_id, module_id, lesson_id, lesson_progress_id, card_id,
  first_viewed_at, attempts, last_activity_at
) values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  (select personal_course_id from test_state), (select module_id from test_state),
  (select lesson_id from test_state), '40000000-0000-4000-8000-000000000000',
  (select old_card_id from test_state),
  now(), 1, now()
);
savepoint natural_key_collision;
insert into public.card_comments (
  id, user_id, course_id, module_id, lesson_id, microsequence_id, card_id, body
) values (
  '63500000-0000-4000-8000-000000000001', auth.uid(),
  (select personal_course_id from test_state), (select module_id from test_state),
  (select lesson_id from test_state), (select microsequence_id from test_state),
  (select old_card_id from test_state), 'Comentário canônico do dispositivo remoto.'
);
create temp table lesson_progress_collision as
select public.apply_sync_batch(
  '63500000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'mutationId','63600000-0000-4000-8000-000000000001',
    'courseId',(select personal_course_id from test_state),
    'entityType','lessonProgress','entityId','63700000-0000-4000-8000-000000000001',
    'operation','insert','baseRevision',0,
    'changedFields',jsonb_build_array('firstViewedAt'),
    'payload',jsonb_build_object(
      'moduleId',(select module_id from test_state),
      'lessonId',(select lesson_id from test_state),
      'firstViewedAt',now(),'lastActivityAt',now()
    )
  ))
) payload;
create temp table card_progress_collision as
select public.apply_sync_batch(
  '63500000-0000-4000-8000-000000000011',
  jsonb_build_array(jsonb_build_object(
    'mutationId','63600000-0000-4000-8000-000000000002',
    'courseId',(select personal_course_id from test_state),
    'entityType','cardProgress','entityId','63700000-0000-4000-8000-000000000002',
    'operation','insert','baseRevision',0,
    'changedFields',jsonb_build_array('attempts'),
    'payload',jsonb_build_object(
      'moduleId',(select module_id from test_state),
      'lessonId',(select lesson_id from test_state),
      'lessonProgressId','40000000-0000-4000-8000-000000000000',
      'cardId',(select old_card_id from test_state),
      'firstViewedAt',now(),'attempts',2,'lastActivityAt',now()
    )
  ))
) payload;
create temp table comment_collision as
select public.apply_sync_batch(
  '63500000-0000-4000-8000-000000000012',
  jsonb_build_array(jsonb_build_object(
    'mutationId','63600000-0000-4000-8000-000000000003',
    'courseId',(select personal_course_id from test_state),
    'entityType','comments','entityId','63700000-0000-4000-8000-000000000003',
    'operation','insert','baseRevision',0,
    'changedFields',jsonb_build_array('body'),
    'payload',jsonb_build_object(
      'moduleId',(select module_id from test_state),
      'lessonId',(select lesson_id from test_state),
      'microsequenceId',(select microsequence_id from test_state),
      'cardId',(select old_card_id from test_state),
      'body','Comentário concorrente local.'
    )
  ))
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'reason' = 'natural_key_exists'
              and payload -> 'results' -> 0 ->> 'canonicalEntityId'
                  = '40000000-0000-4000-8000-000000000000'
       from lesson_progress_collision)
  and (select payload -> 'results' -> 0 ->> 'reason' = 'natural_key_exists'
              and payload -> 'results' -> 0 ->> 'canonicalEntityId'
                  = '40000000-0000-4000-8000-000000000001'
       from card_progress_collision)
  and (select payload -> 'results' -> 0 ->> 'reason' = 'natural_key_exists'
              and payload -> 'results' -> 0 ->> 'canonicalEntityId'
                  = '63500000-0000-4000-8000-000000000001'
       from comment_collision),
  'inserts concorrentes de progresso e comentário retornam a identidade remota canônica'
);
rollback to natural_key_collision;
with bootstrap_graph as (
  select public.get_personal_course_graph((select personal_course_id from test_state)) payload
)
select ok(
  payload ?& array[
    'courses','memberships','flowNodes','flowCases','flowPractices','flowPracticeEntries',
    'flowPracticeOptions','flowPracticeVariants','flowShapeOptions','cardSources','cardTopics'
  ]
  and not (payload ?| array['course','nodePractices','nodePracticeItems','cardRefs'])
  and jsonb_typeof(payload -> 'courses') = 'array'
  and jsonb_typeof(payload -> 'flowPracticeOptions') = 'array'
  and payload -> 'memberships' -> 0 ? 'courseId'
  and not (payload -> 'memberships' -> 0 ? 'course_id')
  and payload -> 'microsequences' -> 0 ? 'cardsRevision'
  and payload -> 'cardProgress' -> 0 ?& array['firstViewedAt','attempts','lastResult']
  and not (payload -> 'cardProgress' -> 0 ?| array['firstSeenAt','attemptCount']),
  'bootstrap relacional retorna exclusivamente stores e linhas camelCase canônicas'
)
from bootstrap_graph;

create temp table replica_bootstrap as
select public.bootstrap_replica('63800000-0000-4000-8000-000000000001') payload;
select ok(
  (select payload ->> 'status' = 'applied'
      and jsonb_typeof(payload -> 'snapshot') = 'object'
      and jsonb_typeof(payload -> 'snapshot' -> 'courses') = 'array'
      and jsonb_array_length(payload -> 'snapshot' -> 'courses') >= 1
      and jsonb_array_length(payload -> 'snapshot' -> 'memberships') >= 1
   from replica_bootstrap)
  and (select count(*) = 1 from replica_bootstrap,
       jsonb_array_elements(payload -> 'snapshot' -> 'courses') course
       where course ->> 'courseId' = (select personal_course_id::text from test_state))
  and (select last_pulled_sequence from public.sync_devices
       where id = '63800000-0000-4000-8000-000000000001')
      = (select (payload ->> 'highWaterSequence')::bigint from replica_bootstrap),
  'bootstrap materializa snapshot autorizado e cursor no mesmo high-water'
);
create temp table pull_after_bootstrap as
select public.pull_sync_changes(
  (select (payload ->> 'highWaterSequence')::bigint from replica_bootstrap),
  10, '63800000-0000-4000-8000-000000000001'
) payload;
select ok(
  (select jsonb_array_length(payload -> 'changes') = 0
      and (payload ->> 'nextSequence')::bigint >=
          (select (payload ->> 'highWaterSequence')::bigint from replica_bootstrap)
   from pull_after_bootstrap),
  'pull posterior ao bootstrap começa somente depois do high-water'
);
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
create temp table isolated_replica_bootstrap as
select public.bootstrap_replica('63800000-0000-4000-8000-000000000002') payload;
select is(
  (select count(*) from isolated_replica_bootstrap,
    jsonb_array_elements(payload -> 'snapshot' -> 'courses') course
    where course ->> 'courseId' = (select personal_course_id::text from test_state)),
  0::bigint, 'bootstrap não inclui curso pessoal de outro usuário'
);
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

savepoint direct_cell_hash;
insert into public.block_cells (
  id, course_id, block_id, matrix_item_id, row_index, column_index, cell_role,
  text_value, cell_kind, position, value_type
) values (
  '40000000-0000-4000-8000-000000000010', (select personal_course_id from test_state),
  (select old_block_id from test_state), null, -1, 0, 'header',
  'Cabeçalho A', 'table', 0, 'string'
);
create temp table direct_cell_hash_before as
select private.course_content_hash((select personal_course_id from test_state)) value;
update public.block_cells set text_value = 'Cabeçalho B'
where id = '40000000-0000-4000-8000-000000000010';
select isnt(
  private.course_content_hash((select personal_course_id from test_state)),
  (select value from direct_cell_hash_before),
  'hash canônico inclui cells diretas de table/pairList/relationTable sem matrixItemId'
);
rollback to direct_cell_hash;

create temp table replacement_request as
select
  jsonb_build_object(
      'cards', jsonb_build_array(jsonb_build_object(
        'id','41000000-0000-4000-8000-000000000001',
        'courseId',(select personal_course_id from test_state),
        'microsequenceId',(select microsequence_id from test_state),
        'identityKey','course:test/card:substituto',
        'contractKey','card-substituto','position',1,'resource','paragraph',
        'cardKind','theory','exercise','none','title','Card substituto','after','','hasAfter',true,
        'lessonId',(select lesson_id from test_state)
      )),
      'blocks', jsonb_build_array(jsonb_build_object(
        'id','42000000-0000-4000-8000-000000000001',
        'courseId',(select personal_course_id from test_state),
        'cardId','41000000-0000-4000-8000-000000000001',
        'identityKey','course:test/card:substituto/block:primary',
        'position',0,'region','primary','isPrimary',true,
        'blockType','paragraph','value','Fragmento validado antes do commit.','hasValue',true
      ))
    ) fragment,
  (select cards_revision from public.microsequences where id = (select microsequence_id from test_state))
    base_revision;
savepoint metadata_then_card_replace;
create temp table metadata_revision_before_replace as
select revision, cards_revision
from public.microsequences where id = (select microsequence_id from test_state);
insert into public.microsequences (
  id, course_id, lesson_id, contract_key, position, title, goal, role, status
) values (
  '42900000-0000-4000-8000-000000000001',
  (select personal_course_id from test_state), (select lesson_id from test_state),
  'micro-auxiliar-dependencia',
  (select coalesce(max(position), -1) + 1 from public.microsequences
   where lesson_id = (select lesson_id from test_state) and deleted_at is null),
  'Micro auxiliar', 'Testar token da dependência.', 'support', 'planned'
);
insert into public.microsequence_dependencies (
  id, course_id, lesson_id, microsequence_id, depends_on_microsequence_id, position
) values (
  '42900000-0000-4000-8000-000000000002',
  (select personal_course_id from test_state), (select lesson_id from test_state),
  (select microsequence_id from test_state), '42900000-0000-4000-8000-000000000001', 0
);
create temp table metadata_after_dependency as
select revision, cards_revision
from public.microsequences where id = (select microsequence_id from test_state);
create temp table metadata_before_replace_result as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000008',
  jsonb_build_array(jsonb_build_object(
    'mutationId','43000000-0000-4000-8000-000000000008',
    'courseId',(select personal_course_id from test_state),
    'entityType','microsequences','entityId',(select microsequence_id from test_state),
    'operation','update',
    'baseRevision',(select revision from metadata_after_dependency),
    'changedFields',jsonb_build_array('title'),
    'payload',jsonb_build_object('title','Título persistido antes do replace')
  ))
) payload;
create temp table replace_after_metadata_result as
select public.replace_microsequence_cards(
  (select personal_course_id from test_state), (select microsequence_id from test_state),
  (select fragment from replacement_request), (select base_revision from replacement_request),
  '43000000-0000-4000-8000-000000000008'
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'status' = 'applied'
   from metadata_before_replace_result)
  and (select after_dependency.revision > before.revision
              and after_dependency.cards_revision = before.cards_revision
       from metadata_after_dependency after_dependency,
            metadata_revision_before_replace before)
  and (select payload ->> 'status' = 'applied'
              and (payload ->> 'cardsRevision')::bigint
                  = (select cards_revision + 1 from metadata_revision_before_replace)
       from replace_after_metadata_result)
  and (select microsequence.revision > before.revision
              and microsequence.cards_revision = before.cards_revision + 1
       from public.microsequences microsequence, metadata_revision_before_replace before
       where microsequence.id = (select microsequence_id from test_state)),
  'edição de metadata não avança cardsRevision nem cria falso conflito no replace subsequente'
);
rollback to metadata_then_card_replace;
create temp table concurrent_block_before_replace as
select public.apply_sync_batch(
  '30000000-0000-4000-8000-000000000002',
  jsonb_build_array(jsonb_build_object(
    'mutationId','43000000-0000-4000-8000-000000000000',
    'courseId',(select personal_course_id from test_state),
    'entityType','blocks','entityId',(select old_block_id from test_state),
    'operation','update',
    'baseRevision',(select revision from public.card_blocks where id = (select old_block_id from test_state)),
    'changedFields',jsonb_build_array('value'),
    'payload',jsonb_build_object('value','Mudança remota posterior ao baseline composto.')
  ))
) payload;
create temp table aggregate_replace_conflict as
select public.replace_microsequence_cards(
  (select personal_course_id from test_state), (select microsequence_id from test_state),
  (select fragment from replacement_request), (select base_revision from replacement_request),
  '43000000-0000-4000-8000-000000000009'
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'status' from concurrent_block_before_replace) = 'applied'
  and (select payload ->> 'status' from aggregate_replace_conflict) = 'conflict'
  and (select (payload ->> 'remoteRevision')::bigint from aggregate_replace_conflict)
      > (select base_revision from replacement_request),
  'mudança remota de bloco avança token agregado e bloqueia substituição composta stale'
);
update replacement_request set base_revision = (
  select cards_revision from public.microsequences where id = (select microsequence_id from test_state)
);
create temp table first_replace as
select public.replace_microsequence_cards(
  (select personal_course_id from test_state), (select microsequence_id from test_state),
  (select fragment from replacement_request), (select base_revision from replacement_request),
  '43000000-0000-4000-8000-000000000001'
) payload;
select is(
  (select payload ->> 'status' from first_replace),
  'applied', 'substituição de cards da microssequência é transacional'
);
create temp table replay_replace as
select public.replace_microsequence_cards(
  (select personal_course_id from test_state), (select microsequence_id from test_state),
  (select fragment from replacement_request), (select base_revision from replacement_request),
  '43000000-0000-4000-8000-000000000001'
) payload;
select ok(
  (select payload - 'idempotent' from replay_replace)
    = (select payload - 'idempotent' from first_replace)
  and (select (payload ->> 'idempotent')::boolean from replay_replace),
  'replay da substituição retorna o resultado original como idempotente'
);
create temp table incompatible_replace_replay as
select public.replace_microsequence_cards(
    (select personal_course_id from test_state), (select microsequence_id from test_state),
    (select fragment from replacement_request) || jsonb_build_object('payloadDivergente', true),
    (select base_revision from replacement_request),
    '43000000-0000-4000-8000-000000000001'
) payload;
select ok(
  (select payload ->> 'status' = 'rejected'
      and payload ->> 'code' = '23505'
      and payload ->> 'reason' = 'mutation_id_reuse'
   from incompatible_replace_replay),
  'mutationId de substituição não pode ser reutilizado com payload divergente'
);
create temp table replace_conflict as
select public.replace_microsequence_cards(
  (select personal_course_id from test_state), (select microsequence_id from test_state),
  (select fragment from replacement_request), (select base_revision from replacement_request),
  '43000000-0000-4000-8000-000000000002'
) payload;
select ok(
  (select payload ->> 'status' = 'conflict' from replace_conflict)
  and (select (payload ->> 'remoteRevision')::bigint from replace_conflict)
      = (select cards_revision from public.microsequences where id = (select microsequence_id from test_state))
  and (select (payload ->> 'remoteCardsRevision')::bigint from replace_conflict)
      = (select cards_revision from public.microsequences where id = (select microsequence_id from test_state)),
  'conflito composto retorna remoteRevision estruturada'
);
create temp table preserved_replace as
select public.replace_microsequence_cards(
  (select personal_course_id from test_state), (select microsequence_id from test_state),
  jsonb_set(
    (select fragment from replacement_request), '{blocks,0,value}',
    to_jsonb('Texto corrigido preservando os UUIDs.'::text)
  ),
  (select cards_revision from public.microsequences where id = (select microsequence_id from test_state)),
  '43000000-0000-4000-8000-000000000003'
) payload;
select is(
  (select payload ->> 'status' from preserved_replace),
  'applied', 'correção composta reativa e atualiza UUIDs preservados'
);
select ok(
  exists (select 1 from public.cards
          where id = '41000000-0000-4000-8000-000000000001' and deleted_at is null)
  and (select value_text from public.card_blocks
       where id = '42000000-0000-4000-8000-000000000001')
      = 'Texto corrigido preservando os UUIDs.',
  'resultado final espelha o fragmento sem criar novas identidades'
);
select is(
  (select count(*) from public.cards
   where microsequence_id = (select microsequence_id from test_state) and deleted_at is null),
  1::bigint, 'substituição mantém somente os novos cards ativos'
);
select ok(
  (select deleted_at is not null from public.cards where id = (select old_card_id from test_state)),
  'card anterior vira tombstone'
);
select ok(
  (select deleted_at is null from public.card_progress where id = '40000000-0000-4000-8000-000000000001'),
  'progresso fora da árvore substituída permanece intacto'
);
select throws_ok(
  format(
    $$select public.replace_microsequence_cards(%L, %L, %L::jsonb, %s)$$,
    (select personal_course_id from test_state), (select microsequence_id from test_state),
    jsonb_build_object('cards', jsonb_build_array(jsonb_build_object(
      'id','41000000-0000-4000-8000-000000000002',
      'courseId',(select personal_course_id from test_state),
      'microsequenceId',(select microsequence_id from test_state),
      'identityKey','course:test/card:invalido',
      'contractKey','card-invalido','position',1,'resource','paragraph',
      'cardKind','theory','exercise','none','title','Inválido','after','','hasAfter',true,
      'lessonId',(select lesson_id from test_state)
    )))::text,
    (select cards_revision from public.microsequences where id = (select microsequence_id from test_state))
  ),
  '23514', 'Fragmento sem bloco primário único por card.',
  'fragmento inválido faz rollback integral'
);
select ok(
  exists (select 1 from public.cards where id = '41000000-0000-4000-8000-000000000001' and deleted_at is null),
  'estado anterior sobrevive à substituição inválida'
);
create temp table rejected_invalid_fragment as
select public.replace_microsequence_cards(
  (select personal_course_id from test_state),
  (select microsequence_id from test_state),
  jsonb_build_object('cards', jsonb_build_array(jsonb_build_object(
    'id','41000000-0000-4000-8000-000000000012',
    'courseId',(select personal_course_id from test_state),
    'microsequenceId',(select microsequence_id from test_state),
    'identityKey','course:test/card:rejeitado',
    'contractKey','card-rejeitado','position',1,'resource','paragraph',
    'cardKind','theory','exercise','none','title','Rejeitado','after','','hasAfter',true,
    'lessonId',(select lesson_id from test_state)
  ))),
  (select cards_revision from public.microsequences where id = (select microsequence_id from test_state)),
  '43000000-0000-4000-8000-000000000021'
) payload;
select ok(
  (select payload ->> 'status' = 'rejected'
      and payload ->> 'code' = '23514'
      and payload ->> 'reason' = 'structural_violation'
   from rejected_invalid_fragment),
  'fragmento inválido retorna rejeição definitiva estruturada'
);
create temp table rejected_missing_microsequence as
select public.replace_microsequence_cards(
  (select personal_course_id from test_state),
  '43000000-0000-4000-8000-000000000099',
  (select fragment from replacement_request), 1,
  '43000000-0000-4000-8000-000000000022'
) payload;
select ok(
  (select payload ->> 'status' = 'rejected'
      and payload ->> 'code' = '22023'
      and payload ->> 'reason' = 'entity_missing'
   from rejected_missing_microsequence),
  'microssequência removida ou inexistente retorna rejeição definitiva'
);
savepoint revoked_replace_authorization;
insert into public.course_memberships (
  id, course_id, user_id, role, position, deleted_at
) values (
  '43000000-0000-4000-8000-000000000023',
  (select personal_course_id from test_state),
  '20000000-0000-4000-8000-000000000004', 'editor', 9, now()
);
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
create temp table rejected_revoked_editor as
select public.replace_microsequence_cards(
  (select personal_course_id from test_state),
  (select microsequence_id from test_state),
  (select fragment from replacement_request),
  (select cards_revision from public.microsequences where id = (select microsequence_id from test_state)),
  '43000000-0000-4000-8000-000000000024'
) payload;
select ok(
  (select payload ->> 'status' = 'rejected'
      and payload ->> 'code' = '42501'
      and payload ->> 'reason' = 'authorization_denied'
   from rejected_revoked_editor),
  'autorização revogada retorna rejeição definitiva estruturada'
);
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
rollback to revoked_replace_authorization;
select ok(
  not exists (select 1 from public.sync_changes where entity_revision <= 0),
  'feed sempre transporta revisão positiva'
);
select ok(
  not exists (
    select 1 from pg_class relation join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relkind = 'r'
      and not exists (select 1 from pg_policy policy where policy.polrelid = relation.oid)
  ),
  'toda tabela exposta possui ao menos uma policy'
);
select ok(
  not exists (
    select 1 from pull_state, jsonb_array_elements(payload -> 'changes') change
    join public.courses course on course.id = nullif(change ->> 'courseId', '')::uuid
    where course.kind = 'official'
  ),
  'pull não baixa árvores do catálogo oficial'
);
select ok(
  not exists (
    select 1 from public.card_blocks
    where course_id = (select personal_course_id from test_state)
      and source_entity_id is not null and source_entity_id = id
  ),
  'UUIDs clonados nunca reutilizam a identidade da origem'
);
select is(
  (select count(*) from public.card_blocks
   where course_id = (select personal_course_id from test_state) and source_entity_id is not null),
  1::bigint, 'linhagem do bloco clonado é preservada no tombstone'
);

insert into public.course_memberships (id, course_id, user_id, role, position) values
  ('50000000-0000-4000-8000-000000000001', (select personal_course_id from test_state),
   '20000000-0000-4000-8000-000000000002', 'learner', 1),
  ('50000000-0000-4000-8000-000000000002', (select personal_course_id from test_state),
   '20000000-0000-4000-8000-000000000003', 'learner', 2),
  ('50000000-0000-4000-8000-000000000003', (select personal_course_id from test_state),
   '20000000-0000-4000-8000-000000000004', 'editor', 3);

insert into public.lesson_progress (
  id, user_id, course_id, module_id, lesson_id, first_viewed_at, last_activity_at
) values (
  '51000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  (select personal_course_id from test_state), (select module_id from test_state),
  (select lesson_id from test_state),
  now(), now()
);
insert into public.card_progress (
  id, user_id, course_id, module_id, lesson_id, lesson_progress_id, card_id,
  first_viewed_at, attempts, last_result, last_activity_at
) values (
  '51000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  (select personal_course_id from test_state), (select module_id from test_state),
  (select lesson_id from test_state), '51000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  now(), 0, 'pending', now()
);
insert into public.card_comments (
  id, user_id, course_id, module_id, lesson_id, microsequence_id, card_id, body
) values (
  '51000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000002',
  (select personal_course_id from test_state), (select module_id from test_state),
  (select lesson_id from test_state), (select microsequence_id from test_state),
  '41000000-0000-4000-8000-000000000001',
  'Comentário privado do learner A.'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
create temp table learner_membership_visibility (only_self boolean not null);
grant insert, select on learner_membership_visibility to authenticated;
grant select on public.course_memberships to authenticated;
set local role authenticated;
insert into learner_membership_visibility
select count(*) = 1 and bool_and(user_id = auth.uid())
   from public.course_memberships
   where course_id = (select personal_course_id from test_state)
     and deleted_at is null;
reset role;
revoke select on public.course_memberships from authenticated;
select ok(
  (select only_self from learner_membership_visibility),
  'RLS de memberships deixa learner consultar somente a própria associação'
);
select ok(
  jsonb_array_length(
    public.get_personal_course_graph((select personal_course_id from test_state)) -> 'memberships'
  ) = 1
  and public.get_personal_course_graph((select personal_course_id from test_state))
      -> 'memberships' -> 0 ->> 'userId' = '20000000-0000-4000-8000-000000000002',
  'snapshot de membro comum não vaza UUIDs nem papéis das outras associações'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
create temp table learner_attack as
select public.apply_sync_batch(
  '52000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','53000000-0000-4000-8000-000000000001',
      'courseId',(select personal_course_id from test_state),
      'entityType','lessonProgress','entityId','51000000-0000-4000-8000-000000000001',
      'operation','update','baseRevision',1,
      'changedFields',jsonb_build_array('completedAt'),
      'payload',jsonb_build_object('completedAt',now())
    ),
    jsonb_build_object(
      'mutationId','53000000-0000-4000-8000-000000000002',
      'courseId',(select personal_course_id from test_state),
      'entityType','cardProgress','entityId','51000000-0000-4000-8000-000000000002',
      'operation','update','baseRevision',1,
      'changedFields',jsonb_build_array('attempts'),
      'payload',jsonb_build_object('attempts',99)
    ),
    jsonb_build_object(
      'mutationId','53000000-0000-4000-8000-000000000003',
      'courseId',(select personal_course_id from test_state),
      'entityType','comments','entityId','51000000-0000-4000-8000-000000000003',
      'operation','update','baseRevision',1,
      'changedFields',jsonb_build_array('body'),
      'payload',jsonb_build_object('body','Tentativa de sobrescrita alheia.')
    )
  )
) payload;
select is(
  (select count(*) from learner_attack,
    jsonb_array_elements(payload -> 'results') result where result ->> 'status' = 'rejected'),
  3::bigint, 'learner não altera progresso nem comentário de outro learner por UUID'
);
select ok(
  (select completed_at is null from public.lesson_progress where id = '51000000-0000-4000-8000-000000000001')
  and (select attempts = 0 from public.card_progress where id = '51000000-0000-4000-8000-000000000002')
  and (select body = 'Comentário privado do learner A.' from public.card_comments
       where id = '51000000-0000-4000-8000-000000000003'),
  'estado privado da vítima permanece intacto'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
create temp table editor_membership_attack as
select public.apply_sync_batch(
  '52000000-0000-4000-8000-000000000002',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','53000000-0000-4000-8000-000000000004',
      'courseId',(select personal_course_id from test_state),
      'entityType','memberships','entityId','50000000-0000-4000-8000-000000000001',
      'operation','update','baseRevision',1,
      'changedFields',jsonb_build_array('role'),
      'payload',jsonb_build_object('role','editor')
    ),
    jsonb_build_object(
      'mutationId','53000000-0000-4000-8000-000000000005',
      'courseId',(select personal_course_id from test_state),
      'entityType','memberships',
      'entityId',(select id from public.course_memberships
        where course_id = (select personal_course_id from test_state) and role = 'owner' and deleted_at is null),
      'operation','delete',
      'baseRevision',(select revision from public.course_memberships
        where course_id = (select personal_course_id from test_state) and role = 'owner' and deleted_at is null),
      'changedFields','[]'::jsonb,'payload','{}'::jsonb
    )
  )
) payload;
select is(
  (select count(*) from editor_membership_attack,
    jsonb_array_elements(payload -> 'results') result where result ->> 'status' = 'rejected'),
  2::bigint, 'editor não promove membros nem remove owner pela sincronização genérica'
);
select ok(
  (select role = 'learner' from public.course_memberships where id = '50000000-0000-4000-8000-000000000001')
  and exists (
    select 1 from public.course_memberships
    where course_id = (select personal_course_id from test_state) and role = 'owner' and deleted_at is null
  ),
  'papéis permanecem inalterados após ataque do editor'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'service_role', true);
create temp table last_owner_guard as
select public.apply_sync_batch(
  '52000000-0000-4000-8000-000000000003',
  jsonb_build_array(jsonb_build_object(
    'mutationId','53000000-0000-4000-8000-000000000006',
    'courseId',(select personal_course_id from test_state),
    'entityType','memberships',
    'entityId',(select id from public.course_memberships
      where course_id = (select personal_course_id from test_state) and role = 'owner' and deleted_at is null),
    'operation','delete',
    'baseRevision',(select revision from public.course_memberships
      where course_id = (select personal_course_id from test_state) and role = 'owner' and deleted_at is null),
    'changedFields','[]'::jsonb,'payload','{}'::jsonb
  ))
) payload;
select is(
  (select payload -> 'results' -> 0 ->> 'status' from last_owner_guard),
  'rejected', 'nem administração remove o último owner ativo via sync'
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.modules (
  id, course_id, identity_key, contract_key, position, title
) values (
  '54000000-0000-4000-8000-000000000010',
  (select personal_course_id from test_state),
  'course:causal-sync/module:causal-sync',
  'module-causal-sync',
  (select coalesce(max(position), -1) + 1 from public.modules
   where course_id = (select personal_course_id from test_state) and deleted_at is null),
  'Estado remoto inicial'
);
update public.modules
set title = 'Estado remoto C'
where id = '54000000-0000-4000-8000-000000000010';

create temp table causal_batch_guard as
select public.apply_sync_batch(
  '54000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','55000000-0000-4000-8000-000000000001',
      'courseId',(select personal_course_id from test_state),
      'entityType','modules','entityId','54000000-0000-4000-8000-000000000010',
      'operation','update','baseRevision',1,
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object('title','Estado local A')
    ),
    jsonb_build_object(
      'mutationId','55000000-0000-4000-8000-000000000002',
      'courseId',(select personal_course_id from test_state),
      'entityType','modules','entityId','54000000-0000-4000-8000-000000000010',
      'operation','update','baseRevision',2,
      'changedFields',jsonb_build_array('title'),
      'payload',jsonb_build_object('title','Estado local B')
    )
  )
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'status' = 'conflict'
      and payload -> 'results' -> 0 ->> 'reason' = 'revision_mismatch'
      and payload -> 'results' -> 1 ->> 'status' = 'conflict'
      and payload -> 'results' -> 1 ->> 'reason' = 'causal_batch_blocked'
      and (payload -> 'results' -> 1 ->> 'blocked')::boolean
      and payload -> 'results' -> 1 ->> 'blockedByMutationId' = '55000000-0000-4000-8000-000000000001'
      and (payload -> 'results' -> 1 ->> 'remoteRevision')::bigint = 2
      and payload -> 'results' -> 1 -> 'remoteRow' ->> 'title' = 'Estado remoto C'
   from causal_batch_guard),
  'conflito em A bloqueia B causalmente no mesmo lote'
);
select ok(
  (select title = 'Estado remoto C' and revision = 2
   from public.modules where id = '54000000-0000-4000-8000-000000000010'),
  'B com baseRevision coincidente não sobrescreve o estado remoto C'
);
select ok(
  not exists (
    select 1 from public.sync_mutations
    where user_id = '20000000-0000-4000-8000-000000000001'
      and mutation_id = '55000000-0000-4000-8000-000000000002'
  ),
  'ledger persiste somente o blocker real e deixa a irmã causal reutilizável'
);
savepoint causal_sibling_retry;
create temp table causal_sibling_retry_result as
select public.apply_sync_batch(
  '54000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'mutationId','55000000-0000-4000-8000-000000000002',
    'courseId',(select personal_course_id from test_state),
    'entityType','modules','entityId','54000000-0000-4000-8000-000000000010',
    'operation','update','baseRevision',2,
    'changedFields',jsonb_build_array('title'),
    'payload',jsonb_build_object('title','Estado local B')
  ))
) payload;
select ok(
  (select payload -> 'results' -> 0 ->> 'status' = 'applied'
   from causal_sibling_retry_result)
  and (select title = 'Estado local B' and revision = 3
       from public.modules where id = '54000000-0000-4000-8000-000000000010'),
  'irmã causal aplica com o mesmo mutationId após tratar o blocker'
);
rollback to causal_sibling_retry;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
create temp table learner_bootstrap as
select public.pull_sync_changes(0, 500, '52000000-0000-4000-8000-000000000004') payload;
select ok(
  exists (
    select 1 from learner_bootstrap, jsonb_array_elements(payload -> 'changes') change
    where change ->> 'entityType' = 'courses'
      and change ->> 'courseId' = (select personal_course_id::text from test_state)
  ),
  'learner em dispositivo novo recebe a linha compartilhada do curso'
);
select ok(
  (select min((change ->> 'sequence')::bigint)
   from learner_bootstrap, jsonb_array_elements(payload -> 'changes') change
   where change ->> 'entityType' = 'courses'
     and change ->> 'courseId' = (select personal_course_id::text from test_state))
  <
  (select min((change ->> 'sequence')::bigint)
   from learner_bootstrap, jsonb_array_elements(payload -> 'changes') change
   where change ->> 'entityType' not in ('courses','memberships')
     and change ->> 'courseId' = (select personal_course_id::text from test_state)),
  'bootstrap entrega o curso antes de suas entidades filhas'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
create temp table generic_course_delete as
select public.apply_sync_batch(
  '52000000-0000-4000-8000-000000000005',
  jsonb_build_array(jsonb_build_object(
    'mutationId','53000000-0000-4000-8000-000000000007',
    'courseId',(select personal_course_id from test_state),
    'entityType','courses','entityId',(select personal_course_id from test_state),
    'operation','delete',
    'baseRevision',(select revision from public.courses where id = (select personal_course_id from test_state)),
    'changedFields','[]'::jsonb,'payload','{}'::jsonb
  ))
) payload;
select is(
  (select payload -> 'results' -> 0 ->> 'status' from generic_course_delete),
  'rejected', 'delete genérico de courses é bloqueado em favor da RPC transacional'
);
create temp table missing_course_delete as
select public.delete_personal_course(
  '53000000-0000-4000-8000-000000000099',
  0,
  '53000000-0000-4000-8000-000000000010'
) payload;
select ok(
  (select payload ->> 'status' = 'applied' and (payload ->> 'noop')::boolean
   from missing_course_delete),
  'delete de curso nunca materializado é no-op idempotente e não revela existência'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select throws_ok(
  format(
    'select public.delete_personal_course(%L, %s, %L)',
    (select personal_course_id from test_state),
    (select revision from public.courses where id = (select personal_course_id from test_state)),
    '53000000-0000-4000-8000-000000000008'
  ),
  '42501', 'Somente owner pode excluir o curso pessoal.',
  'editor não pode excluir curso pessoal pela RPC security definer'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
savepoint stale_course_delete;
create temp table stale_course_delete_before as
select
  course.revision course_revision,
  (select id from public.card_blocks block
   where block.course_id = course.id and block.deleted_at is null limit 1) active_block_id,
  (select count(*) from public.modules module
   where module.course_id = course.id and module.deleted_at is null) active_module_count
from public.courses course where course.id = (select personal_course_id from test_state);
update public.card_blocks
set value_text = value_text || ' Alteração após o token de delete.',
    value = value || ' Alteração após o token de delete.'
where id = (select active_block_id from stale_course_delete_before);
create temp table stale_course_delete_result as
select public.delete_personal_course(
  (select personal_course_id from test_state),
  (select course_revision from stale_course_delete_before),
  '53000000-0000-4000-8000-000000000013'
) payload;
select ok(
  (select payload ->> 'status' = 'conflict'
              and payload ->> 'reason' = 'revision_mismatch'
              and (payload ->> 'remoteRevision')::bigint = before.course_revision + 1
       from stale_course_delete_result, stale_course_delete_before before)
  and (select deleted_at is null and revision = before.course_revision + 1
       from public.courses course, stale_course_delete_before before
       where course.id = (select personal_course_id from test_state))
  and (select count(*) from public.modules module
       where module.course_id = (select personal_course_id from test_state)
         and module.deleted_at is null)
      = (select active_module_count from stale_course_delete_before),
  'alteração descendente avança o token do curso e delete stale não cria tombstones'
);
create temp table replay_stale_course_delete as
select public.delete_personal_course(
  (select personal_course_id from test_state),
  (select course_revision from stale_course_delete_before),
  '53000000-0000-4000-8000-000000000013'
) payload;
select ok(
  (select payload ->> 'status' = 'conflict'
              and (payload ->> 'idempotent')::boolean
       from replay_stale_course_delete),
  'replay do conflito de delete é idempotente e mantém a base original'
);
rollback to stale_course_delete;
create temp table owner_delete_base as
select revision from public.courses where id = (select personal_course_id from test_state);
create temp table owner_course_delete as
select public.delete_personal_course(
  (select personal_course_id from test_state),
  (select revision from owner_delete_base),
  '53000000-0000-4000-8000-000000000009'
) payload;
select is(
  (select payload ->> 'status' from owner_course_delete),
  'applied', 'owner exclui curso pessoal pela RPC transacional'
);
create temp table replay_course_delete as
select public.delete_personal_course(
  (select personal_course_id from test_state),
  (select revision from owner_delete_base),
  '53000000-0000-4000-8000-000000000009'
) payload;
select ok(
  (select (payload ->> 'idempotent')::boolean from replay_course_delete)
  and (select payload ->> 'courseId' from replay_course_delete)
      = (select personal_course_id::text from test_state),
  'replay da exclusão retorna o tombstone idempotente sem repetir mutações'
);
create temp table tombstoned_course_delete as
select public.delete_personal_course(
  (select personal_course_id from test_state),
  (select revision from public.courses where id = (select personal_course_id from test_state)),
  '53000000-0000-4000-8000-000000000011'
) payload;
select ok(
  (select payload ->> 'status' = 'applied' and (payload ->> 'noop')::boolean
   from tombstoned_course_delete),
  'owner pode repetir exclusão de curso já tombstoneado com novo mutationId'
);
select ok(
  (select deleted_at is not null from public.courses
   where id = (select personal_course_id from test_state))
  and not exists (select 1 from public.course_memberships
                  where course_id = (select personal_course_id from test_state) and deleted_at is null)
  and not exists (select 1 from public.modules
                  where course_id = (select personal_course_id from test_state) and deleted_at is null)
  and not exists (select 1 from public.lessons
                  where course_id = (select personal_course_id from test_state) and deleted_at is null)
  and not exists (select 1 from public.microsequences
                  where course_id = (select personal_course_id from test_state) and deleted_at is null)
  and not exists (select 1 from public.cards
                  where course_id = (select personal_course_id from test_state) and deleted_at is null)
  and not exists (select 1 from public.card_blocks
                  where course_id = (select personal_course_id from test_state) and deleted_at is null)
  and not exists (select 1 from public.lesson_progress
                  where course_id = (select personal_course_id from test_state) and deleted_at is null)
  and not exists (select 1 from public.card_progress
                  where course_id = (select personal_course_id from test_state) and deleted_at is null)
  and not exists (select 1 from public.card_comments
                  where course_id = (select personal_course_id from test_state) and deleted_at is null),
  'RPC tombstoneia curso, associações, árvore, progresso e comentários no mesmo commit'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select throws_ok(
  format(
    'select public.delete_personal_course(%L, %s, %L)',
    (select personal_course_id from test_state),
    (select revision from public.courses where id = (select personal_course_id from test_state)),
    '53000000-0000-4000-8000-000000000012'
  ),
  '42501', 'Somente owner pode excluir o curso pessoal.',
  'editor continua proibido de excluir curso já tombstoneado'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
create temp table learner_tombstone as
select public.pull_sync_changes(
  (select (payload ->> 'nextSequence')::bigint from learner_bootstrap),
  500, '52000000-0000-4000-8000-000000000004'
) payload;
select ok(
  exists (
    select 1 from learner_tombstone, jsonb_array_elements(payload -> 'changes') change
    where change ->> 'entityType' = 'courses'
      and change ->> 'courseId' = (select personal_course_id::text from test_state)
      and (change ->> 'tombstone')::boolean
  ),
  'learner recebe tombstone compartilhado mesmo após deleted_at do curso'
);
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

select set_config('request.jwt.claim.role', 'service_role', true);
update public.sync_devices set inactive_at = now() where inactive_at is null;
insert into public.sync_devices (
  id, user_id, label, last_pulled_sequence, last_seen_at
) values
  ('65000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'active-retention-test', 0, now()),
  ('65000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   'stale-retention-test', 0, now() - interval '200 days');
create temp table old_compaction_changes as
with inserted as (
  insert into public.sync_changes (
    audience_user_id, course_id, entity_type, entity_id, operation,
    entity_revision, row_data, changed_at
  ) values
    ('20000000-0000-4000-8000-000000000001', null, 'retention_probe',
     '65000000-0000-4000-8000-000000000010', 'update', 1,
     '{"id":"65000000-0000-4000-8000-000000000010","revision":1}'::jsonb,
     now() - interval '40 days'),
    ('20000000-0000-4000-8000-000000000001', null, 'retention_tombstone_probe',
     '65000000-0000-4000-8000-000000000011', 'delete', 1,
     '{"id":"65000000-0000-4000-8000-000000000011","revision":1,"deleted_at":"2025-01-01T00:00:00Z"}'::jsonb,
     now() - interval '40 days')
  returning sequence
)
select min(sequence) min_sequence, max(sequence) max_sequence from inserted;
update public.sync_devices
set last_pulled_sequence = (select max_sequence from old_compaction_changes)
where id = '65000000-0000-4000-8000-000000000001';
insert into public.sync_changes (
  audience_user_id, entity_type, entity_id, operation, entity_revision, row_data, changed_at
) values (
  '20000000-0000-4000-8000-000000000001', 'retention_recent_probe',
  '65000000-0000-4000-8000-000000000012', 'update', 1,
  '{"id":"65000000-0000-4000-8000-000000000012","revision":1}'::jsonb, now()
);
insert into public.sync_mutations (
  mutation_id, user_id, device_id, entity_type, entity_id, operation,
  base_revision, status, request, result, created_at
) values
  (
    '65000000-0000-4000-8000-000000000020',
    '20000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000002', 'retention_probe',
    '65000000-0000-4000-8000-000000000010', 'update', 1, 'applied',
    '{}'::jsonb, '{"status":"applied"}'::jsonb, now() - interval '200 days'
  ),
  (
    '65000000-0000-4000-8000-000000000022',
    '20000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000001', 'active_retention_probe',
    '65000000-0000-4000-8000-000000000013', 'update', 1, 'applied',
    '{}'::jsonb, '{"status":"applied"}'::jsonb, now() - interval '200 days'
  );
insert into private.rpc_idempotency (
  user_id, mutation_id, operation, request_course_id, result_course_id,
  result_payload, created_at
) values (
  '20000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000021', 'clone_catalog_course',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '{"status":"applied"}'::jsonb, now() - interval '400 days'
);
create temp table retention_dry_run as
select public.compact_sync_history(true, now()) payload;
select ok(
  (select (payload ->> 'staleDevices')::bigint = 1
      and (payload ->> 'changeCandidates')::bigint >= 2
      and (payload ->> 'mutationCandidates')::bigint >= 2
      and (payload ->> 'rpcIdempotencyCandidates')::bigint >= 1
      and (payload ->> 'deletedChanges')::bigint = 0
   from retention_dry_run),
  'dry-run calcula watermark e candidatos sem remover histórico'
);
create temp table retention_real_run as
select public.compact_sync_history(false, now()) payload;
select ok(
  (select inactive_at is not null from public.sync_devices
   where id = '65000000-0000-4000-8000-000000000002')
  and not exists (
    select 1 from public.sync_changes
    where sequence between (select min_sequence from old_compaction_changes)
                       and (select max_sequence from old_compaction_changes)
  )
  and exists (
    select 1 from public.sync_changes
    where entity_type = 'retention_recent_probe'
      and entity_id = '65000000-0000-4000-8000-000000000012'
  ),
  'compactação desativa dispositivo stale e remove somente feed abaixo do watermark e retenção'
);
select ok(
  not exists (
    select 1 from public.sync_mutations
    where mutation_id = '65000000-0000-4000-8000-000000000022'
  ),
  'retenção expira ledger terminal mesmo quando o dispositivo continua ativo'
);
select ok(
  not exists (
    select 1 from public.sync_mutations
    where mutation_id = '65000000-0000-4000-8000-000000000020'
  )
  and not exists (
    select 1 from private.rpc_idempotency
    where mutation_id = '65000000-0000-4000-8000-000000000021'
  )
  and exists (
    select 1 from public.courses
    where id = (select personal_course_id from test_state) and deleted_at is not null
  )
  and (select (payload ->> 'tombstoneRowsDeleted')::integer = 0 from retention_real_run),
  'retenção limpa ledgers expirados sem apagar tombstones relacionais'
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.begin_official_course_import(uuid,jsonb,text,jsonb,boolean)',
    'EXECUTE'
  ),
  'usuário comum não inicia staging de catálogo oficial'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.begin_official_course_import(uuid,jsonb,text,jsonb,boolean)',
    'EXECUTE'
  ),
  'service role pode iniciar staging administrativo de catálogo'
);

select set_config('request.jwt.claim.role', 'service_role', true);
create temp table staged_catalog_manifest as
select jsonb_object_agg(
  store_name,
  case when store_name = 'modules' then 1 else 0 end
) payload
from unnest(private.official_import_store_names()) store_name;
create temp table staged_catalog_begin as
select public.begin_official_course_import(
  '66000000-0000-5000-8000-000000000001',
  jsonb_build_object(
    'id','66000000-0000-5000-8000-000000000002',
    'contractKey','curso-staging-incompleto',
    'identityKey','course:curso-staging-incompleto',
    'title','Curso em staging',
    'goal','Validar retomada administrativa.',
    'position',0
  ),
  repeat('a', 64),
  (select payload from staged_catalog_manifest),
  true
) payload;
select ok(
  (select payload ->> 'status' = 'staging' and not (payload ->> 'idempotent')::boolean
   from staged_catalog_begin),
  'staging cria draft oculto com manifesto persistido'
);

create temp table staged_catalog_chunk as
select public.apply_official_course_import_chunk(
  '66000000-0000-5000-8000-000000000001',
  'modules',
  0,
  jsonb_build_array(jsonb_build_object(
    'id','66000000-0000-5000-8000-000000000003',
    'courseId','66000000-0000-5000-8000-000000000002',
    'identityKey','course:curso-staging-incompleto/module:modulo',
    'contractKey','modulo',
    'position',0,
    'title','Módulo'
  ))
) payload;
select ok(
  (select payload ->> 'status' = 'applied' and not (payload ->> 'idempotent')::boolean
   from staged_catalog_chunk),
  'chunk administrativo aplica somente o lote declarado'
);
select ok(
  (public.apply_official_course_import_chunk(
    '66000000-0000-5000-8000-000000000001',
    'modules',
    0,
    jsonb_build_array(jsonb_build_object(
      'id','66000000-0000-5000-8000-000000000003',
      'courseId','66000000-0000-5000-8000-000000000002',
      'identityKey','course:curso-staging-incompleto/module:modulo',
      'contractKey','modulo',
      'position',0,
      'title','Módulo'
    ))
  ) ->> 'idempotent')::boolean,
  'repetição do mesmo chunk é idempotente'
);
select throws_like(
  $$select public.apply_official_course_import_chunk(
    '66000000-0000-5000-8000-000000000001',
    'modules',
    0,
    '[{"id":"66000000-0000-5000-8000-000000000003","courseId":"66000000-0000-5000-8000-000000000002","identityKey":"course:curso-staging-incompleto/module:modulo","contractKey":"modulo","position":0,"title":"Outro módulo"}]'::jsonb
  )$$,
  'Chunk reutilizado com payload incompatível.%',
  'reuso incompatível de chunk é rejeitado'
);
select throws_like(
  $$select public.finalize_official_course_import('66000000-0000-5000-8000-000000000001')$$,
  'Curso importado é inválido:%',
  'staging estruturalmente incompleto não pode ser publicado'
);
select is(
  (select status::text from public.courses where id = '66000000-0000-5000-8000-000000000002'),
  'draft',
  'falha de finalização conserva o curso fora do catálogo'
);
select is(
  (select count(*) from private.official_catalog_import_chunks
   where import_id = '66000000-0000-5000-8000-000000000001'),
  1::bigint,
  'falha final preserva chunks confirmados para retomada'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.apply_official_course_import_flow_chunk(uuid,integer,jsonb,jsonb)',
    'EXECUTE'
  ),
  'usuário comum não aplica grafo de flow no staging oficial'
);

create temp table staged_flow_manifest as
select jsonb_object_agg(
  store_name,
  case store_name when 'flowNodes' then 2 when 'flowCases' then 1 else 0 end
) payload
from unnest(private.official_import_store_names()) store_name;
insert into private.official_catalog_imports (
  import_id, course_id, contract_key, source_hash, expected_counts, publish_requested
) values (
  '67000000-0000-5000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'curso-staging-flow-ciclico', repeat('b', 64),
  (select payload from staged_flow_manifest), true
);
select is(
  public.begin_official_course_import_flow(
    '67000000-0000-5000-8000-000000000001'
  ) ->> 'status',
  'reset',
  'preparação de flow remove somente tentativa parcial do staging'
);
create temp table staged_flow_payload as
select
  jsonb_build_array(
    jsonb_build_object(
      'id','67000000-0000-5000-8000-000000000002',
      'courseId','10000000-0000-4000-8000-000000000001',
      'blockId', block.id,
      'identityKey','staged-flow/root',
      'branch','root','position',0,'nodeKind','sequence'
    ),
    jsonb_build_object(
      'id','67000000-0000-5000-8000-000000000003',
      'courseId','10000000-0000-4000-8000-000000000001',
      'blockId', block.id,
      'parentCaseId','67000000-0000-5000-8000-000000000004',
      'identityKey','staged-flow/case/body',
      'branch','body','position',0,'nodeKind','process'
    )
  ) nodes,
  jsonb_build_array(
    jsonb_build_object(
      'id','67000000-0000-5000-8000-000000000004',
      'courseId','10000000-0000-4000-8000-000000000001',
      'blockId', block.id,
      'flowNodeId','67000000-0000-5000-8000-000000000002',
      'identityKey','staged-flow/case',
      'position',0,'caseKind','switch'
    )
  ) flow_cases
from public.card_blocks block
where block.course_id = '10000000-0000-4000-8000-000000000001'
  and block.deleted_at is null
order by block.id limit 1;
create temp table staged_flow_result as
select public.apply_official_course_import_flow_chunk(
  '67000000-0000-5000-8000-000000000001', 0,
  (select nodes from staged_flow_payload),
  (select flow_cases from staged_flow_payload)
) payload;
select ok(
  (select payload ->> 'status' = 'applied' and not (payload ->> 'idempotent')::boolean
   from staged_flow_result)
  and exists (
    select 1 from public.flow_nodes
    where id = '67000000-0000-5000-8000-000000000003'
      and parent_case_id = '67000000-0000-5000-8000-000000000004'
  )
  and exists (
    select 1 from public.flow_cases
    where id = '67000000-0000-5000-8000-000000000004'
      and flow_node_id = '67000000-0000-5000-8000-000000000002'
  ),
  'nós e cases cíclicos são confirmados atomicamente no mesmo bloco'
);
select ok(
  (public.apply_official_course_import_flow_chunk(
    '67000000-0000-5000-8000-000000000001', 0,
    (select nodes from staged_flow_payload),
    (select flow_cases from staged_flow_payload)
  ) ->> 'idempotent')::boolean,
  'repetição do mesmo bloco de flow é idempotente'
);
select is(
  public.begin_official_course_import_flow(
    '67000000-0000-5000-8000-000000000001'
  ) ->> 'status',
  'complete',
  'flow completo não é apagado ao retomar depois de outra etapa'
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select * from finish();
rollback;
