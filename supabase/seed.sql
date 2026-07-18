-- Deterministic, deliberately small official course for local catalog and RPC
-- smoke tests.  It is relational data; no operational course JSON is seeded.
insert into public.courses (
  id, owner_id, kind, status, contract_key, title, goal, publication_seq,
  identity_key, position
) values (
  '10000000-0000-4000-8000-000000000001', null, 'official', 'draft',
  'curso-local-exemplo', 'Curso local de exemplo',
  'Validar catálogo, clonagem, progresso e sincronização no Supabase local.', 0,
  'course:curso-local-exemplo', 0
) on conflict (id) do nothing;

insert into public.modules (id, course_id, contract_key, position, title, identity_key)
values (
  '11000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'modulo-inicial', 0, 'Módulo inicial',
  'course:curso-local-exemplo/module:modulo-inicial'
) on conflict (id) do nothing;

insert into public.course_guides (id, course_id, module_id, goal, identity_key, owner_type, owner_id)
values (
  '11100000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Apresentar o fluxo relacional mínimo.',
  'course:curso-local-exemplo/module:modulo-inicial/guide', 'module',
  '11000000-0000-4000-8000-000000000001'
) on conflict (id) do nothing;

insert into public.lessons (id, course_id, module_id, contract_key, position, title, identity_key)
values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001', 'licao-inicial', 0, 'Lição inicial',
  'course:curso-local-exemplo/module:modulo-inicial/lesson:licao-inicial'
) on conflict (id) do nothing;

insert into public.course_guides (id, course_id, lesson_id, goal, identity_key, owner_type, owner_id)
values (
  '12100000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'Explicar o armazenamento granular.',
  'course:curso-local-exemplo/module:modulo-inicial/lesson:licao-inicial/guide', 'lesson',
  '12000000-0000-4000-8000-000000000001'
) on conflict (id) do nothing;

insert into public.microsequences (
  id, course_id, lesson_id, contract_key, position, title, goal, role, status
) values (
-- identity_key is populated separately to keep this seed readable.
  '13000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001', 'micro-inicial', 0,
  'Primeira microssequência', 'Mostrar um card persistido em linhas.', 'explain', 'ready'
) on conflict (id) do nothing;

update public.microsequences set
  identity_key = 'course:curso-local-exemplo/module:modulo-inicial/lesson:licao-inicial/micro:micro-inicial'
where id = '13000000-0000-4000-8000-000000000001';

insert into public.cards (
  id, course_id, microsequence_id, contract_key, position,
  resource, kind, exercise, title, after_text, identity_key, lesson_id,
  card_kind, after, has_after
) values (
  '14000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001', 'card-inicial', 1,
  'paragraph', 'theory', 'none', 'Persistência relacional', '',
  'course:curso-local-exemplo/module:modulo-inicial/lesson:licao-inicial/micro:micro-inicial/card:card-inicial',
  '12000000-0000-4000-8000-000000000001', 'theory', '', true
) on conflict (id) do nothing;

insert into public.card_blocks (
  id, course_id, card_id, contract_key, position, role, block_type, value_text
) values (
-- local-row projection columns are updated below.
  '15000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001', 'bloco-inicial', 0,
  'primary', 'paragraph', 'Cada alteração grava somente as linhas afetadas.'
) on conflict (id) do nothing;

update public.card_blocks set
  identity_key = 'course:curso-local-exemplo/module:modulo-inicial/lesson:licao-inicial/micro:micro-inicial/card:card-inicial/block:primary',
  region = 'primary', is_primary = true,
  value = 'Cada alteração grava somente as linhas afetadas.', has_value = true
where id = '15000000-0000-4000-8000-000000000001';

update public.courses
set status = 'published', publication_seq = 1,
    content_hash = private.course_content_hash(id)
where id = '10000000-0000-4000-8000-000000000001'
  and status = 'draft';
