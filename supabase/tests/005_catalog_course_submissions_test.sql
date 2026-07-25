begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_table(
  'private', 'catalog_course_submissions',
  'ofertas editoriais ficam fora do schema público'
);
select has_function(
  'public', 'submit_personal_course_to_catalog',
  array['uuid', 'uuid', 'boolean', 'text', 'text', 'text'],
  'autor possui RPC de oferta consentida'
);
select has_function(
  'public', 'list_my_catalog_submission_candidates',
  array[]::text[],
  'autor lista somente candidatos pessoais íntegros por metadados'
);
select has_function(
  'public', 'decide_catalog_submission',
  array['uuid', 'text', 'uuid', 'text', 'text'],
  'decisão editorial possui RPC transacional'
);
select ok(not has_table_privilege(
  'authenticated', 'private.catalog_course_submissions', 'SELECT'
), 'authenticated não consulta diretamente a fila privada');
select ok(not has_table_privilege(
  'service_role', 'private.catalog_course_submissions', 'SELECT'
), 'service_role também usa a interface encapsulada');
select ok(not has_function_privilege(
  'anon',
  'public.submit_personal_course_to_catalog(uuid,uuid,boolean,text,text,text)',
  'EXECUTE'
), 'anon não oferece cursos');
select ok(not has_function_privilege(
  'anon', 'public.list_my_catalog_submission_candidates()', 'EXECUTE'
), 'anon não lista candidatos pessoais');
select ok(not has_function_privilege(
  'anon',
  'public.decide_catalog_submission(uuid,text,uuid,text,text)',
  'EXECUTE'
), 'anon não decide ofertas');
select ok(has_function_privilege(
  'authenticated',
  'public.submit_personal_course_to_catalog(uuid,uuid,boolean,text,text,text)',
  'EXECUTE'
), 'usuário autenticado acessa somente a RPC de oferta');
select ok(has_function_privilege(
  'authenticated', 'public.list_my_catalog_submission_candidates()', 'EXECUTE'
), 'usuário autenticado lista seus próprios candidatos');
select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private, auth' = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.list_my_catalog_submission_candidates()'::regprocedure
), 'lista de candidatos é SECURITY DEFINER com search_path fixo');
select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private, auth' = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.decide_catalog_submission(uuid,text,uuid,text,text)'::regprocedure
), 'decisão é SECURITY DEFINER com search_path fixo');
select ok(
  pg_get_functiondef(
    'public.decide_catalog_submission(uuid,text,uuid,text,text)'::regprocedure
  ) like '%private.validate_catalog_submission_course(v_source.id)%owner_id = null%',
  'publicação promove o próprio curso depois da validação'
);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   'ca500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'submission-a@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'ca500000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'submission-b@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'ca500000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'submission-editor@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict(id) do nothing;

insert into private.app_role_assignments(
  user_id, role, active, granted_by, granted_at, reason, updated_at
) values (
  'ca500000-0000-4000-8000-000000000003', 'catalog_publisher', true,
  'ca500000-0000-4000-8000-000000000003', now(),
  'Revisão de submissões em teste', now()
) on conflict(user_id, role) do update set active = true, revoked_at = null,
  revoked_by = null, updated_at = now();

create function pg_temp.make_personal_course(
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
  v_module_guide_id uuid := gen_random_uuid();
  v_lesson_guide_id uuid := gen_random_uuid();
  v_microsequence_id uuid := gen_random_uuid();
  v_card_id uuid := gen_random_uuid();
begin
  insert into public.courses(
    id, owner_id, source_course_id, status, contract_key, title, goal,
    contract_scope, publication_seq, content_hash, project_id, position
  ) values (
    p_course_id, p_owner_id, null, 'published', p_contract_key,
    'Curso pessoal ' || p_contract_key, 'Comprovar a promoção editorial.',
    'Teste de submissão', 0, p_hash, gen_random_uuid(), 0
  );
  insert into public.modules(id, course_id, contract_key, position, title)
  values(v_module_id, p_course_id, 'module-1', 0, 'Módulo');
  insert into public.lessons(id, course_id, module_id, contract_key, position, title)
  values(v_lesson_id, p_course_id, v_module_id, 'lesson-1', 0, 'Lição');
  insert into public.course_guides(id, course_id, module_id, goal)
  values(v_module_guide_id, p_course_id, v_module_id, 'Orientar o módulo.');
  insert into public.course_guides(id, course_id, lesson_id, goal)
  values(v_lesson_guide_id, p_course_id, v_lesson_id, 'Orientar a lição.');
  insert into public.microsequences(
    id, course_id, lesson_id, contract_key, position, title, goal, role, status
  ) values (
    v_microsequence_id, p_course_id, v_lesson_id, 'micro-1', 0,
    'Microssequência', 'Explicar e praticar.', 'explain', 'ready'
  );
  insert into public.cards(
    id, course_id, lesson_id, microsequence_id, contract_key, position,
    resource, kind, exercise, title, after_text, card_kind
  ) values (
    v_card_id, p_course_id, v_lesson_id, v_microsequence_id, 'card-1', 1,
    'paragraph', 'theory', 'none', 'Card', '', 'theory'
  );
  insert into public.card_blocks(
    id, course_id, card_id, contract_key, position, role, block_type,
    value_text, region, is_primary, value, has_value
  ) values (
    gen_random_uuid(), p_course_id, v_card_id, 'block-1', 0, 'primary',
    'paragraph', 'Conteúdo verificável.', 'primary', true,
    'Conteúdo verificável.', true
  );
end;
$$;

select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000001',
  'ca500000-0000-4000-8000-000000000001', 'offer-accept', repeat('a', 64)
);
select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000002',
  'ca500000-0000-4000-8000-000000000001', 'offer-withdraw', repeat('b', 64)
);
select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000003',
  'ca500000-0000-4000-8000-000000000001', 'offer-reject', repeat('c', 64)
);
select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000004',
  'ca500000-0000-4000-8000-000000000001', 'offer-stale', repeat('d', 64)
);
select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000005',
  'ca500000-0000-4000-8000-000000000001', 'offer-invalid-after', repeat('e', 64)
);
select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000006',
  'ca500000-0000-4000-8000-000000000001', 'offer-duplicate-key', repeat('f', 64)
);
select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000007',
  'ca500000-0000-4000-8000-000000000002', 'offer-user-b', repeat('1', 64)
);
select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000009',
  'ca500000-0000-4000-8000-000000000001', 'offer-source-removed', repeat('3', 64)
);
select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000011',
  'ca500000-0000-4000-8000-000000000001', 'offer-hash-recheck', repeat('5', 64)
);
select throws_ok($call$
  insert into public.cards(
    id, course_id, lesson_id, microsequence_id, contract_key, position,
    resource, kind, exercise, title, after_text, card_kind
  )
  select
    'ca530000-0000-4000-8000-000000000012', microsequence.course_id,
    microsequence.lesson_id, microsequence.id, 'card-duplicate-position', 1,
    'paragraph', 'theory', 'none', 'Card com posição repetida', '', 'theory'
  from public.microsequences microsequence
  where microsequence.course_id = 'ca510000-0000-4000-8000-000000000011'
$call$, '23505', null, 'posição duplicada impede a árvore pessoal inválida');
insert into public.courses(
  id, owner_id, source_course_id, status, contract_key, title, goal,
  publication_seq, content_hash, project_id, position
) values (
  'ca510000-0000-4000-8000-000000000008', null, null, 'published',
  'official-not-submittable', 'Curso oficial', 'Não pode ser oferecido por usuário.',
  1, repeat('2', 64), gen_random_uuid(), 800
);
insert into public.courses(
  id, owner_id, source_course_id, status, contract_key, title, goal,
  publication_seq, content_hash, project_id, position
) values (
  'ca510000-0000-4000-8000-000000000010',
  'ca500000-0000-4000-8000-000000000001', null, 'published',
  'incomplete-personal-course', 'Curso pessoal incompleto',
  'Comprovar a validação anterior à oferta.', 0, repeat('4', 64),
  gen_random_uuid(), 10
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', 'ca500000-0000-4000-8000-000000000001', true
);

select is(jsonb_array_length(
  public.list_my_catalog_submission_candidates()->'items'
), 8, 'usuário A vê somente seus oito cursos pessoais íntegros');
select ok(
  public.list_my_catalog_submission_candidates()->'items'
    @> '[{"courseId":"ca510000-0000-4000-8000-000000000001"}]'::jsonb,
  'lista de candidatos traz somente metadados da fonte pessoal íntegra'
);
select ok(not (
  public.list_my_catalog_submission_candidates()->'items'
    @> '[{"courseId":"ca510000-0000-4000-8000-000000000007"}]'::jsonb
), 'lista de A não revela curso pessoal de B');
select ok(not (
  public.list_my_catalog_submission_candidates()->'items'
    @> '[{"courseId":"ca510000-0000-4000-8000-000000000010"}]'::jsonb
), 'lista omite curso pessoal incompleto');
select throws_ok($call$
  select public.submit_personal_course_to_catalog(
    'ca520000-0000-4000-8000-000000000001',
    'ca510000-0000-4000-8000-000000000001', false,
    'CC-BY-4.0', 'Autor A', 'Produção própria.'
  )
$call$, '22023', 'O consentimento editorial explícito é obrigatório.',
  'oferta sem consentimento explícito é recusada');
select throws_ok($call$
  select public.submit_personal_course_to_catalog(
    'ca520000-0000-4000-8000-000000000009',
    'ca510000-0000-4000-8000-000000000007', true,
    'CC-BY-4.0', 'Autor indevido', 'Tentativa alheia.'
  )
$call$, '42501', 'Curso pessoal indisponível para submissão.',
  'usuário A não oferece curso pessoal de B');
select throws_ok($call$
  select public.submit_personal_course_to_catalog(
    'ca520000-0000-4000-8000-000000000010',
    'ca510000-0000-4000-8000-000000000008', true,
    'CC-BY-4.0', 'Autor indevido', 'Tentativa oficial.'
  )
$call$, '42501', 'Curso pessoal indisponível para submissão.',
  'curso oficial não entra no fluxo de oferta pessoal');
select throws_ok($call$
  select public.submit_personal_course_to_catalog(
    'ca520000-0000-4000-8000-000000000012',
    'ca510000-0000-4000-8000-000000000010', true,
    'CC-BY-4.0', 'Autor A', 'Rascunho ainda incompleto.'
  )
$call$, '23514', 'O curso pessoal ainda está incompleto.',
  'curso pessoal incompleto não entra na fila editorial');
select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000001',
  'ca510000-0000-4000-8000-000000000001', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'status', 'submitted', 'curso completo é oferecido');
select is((
  select item->>'activeSubmissionStatus'
  from jsonb_array_elements(
    public.list_my_catalog_submission_candidates()->'items'
  ) item
  where item->>'courseId' = 'ca510000-0000-4000-8000-000000000001'
), 'submitted', 'candidato informa o estado da oferta ativa sem carregar a árvore');
select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000001',
  'ca510000-0000-4000-8000-000000000001', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'idempotent', 'true', 'repetição da oferta não duplica a fila');
select throws_ok($call$
  select public.submit_personal_course_to_catalog(
    'ca520000-0000-4000-8000-000000000001',
    'ca510000-0000-4000-8000-000000000001', true,
    'CC0-1.0', 'Outro autor', 'Outra procedência.'
  )
$call$, '23514', 'submissionId reutilizado com conteúdo diferente.',
  'identidade idempotente não aceita outra intenção');

select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000002',
  'ca510000-0000-4000-8000-000000000002', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'status', 'submitted', 'segunda oferta prepara teste de retirada');
select is(public.withdraw_catalog_submission(
  'ca520000-0000-4000-8000-000000000002'
)->>'idempotent', 'false', 'autor retira oferta antes da decisão');
select is(public.withdraw_catalog_submission(
  'ca520000-0000-4000-8000-000000000002'
)->>'idempotent', 'true', 'retirada repetida é idempotente');

select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000003',
  'ca510000-0000-4000-8000-000000000003', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'status', 'submitted', 'terceira oferta prepara rejeição');
select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000004',
  'ca510000-0000-4000-8000-000000000004', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'status', 'submitted', 'quarta oferta prepara mudança de origem');
select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000005',
  'ca510000-0000-4000-8000-000000000005', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'status', 'submitted', 'quinta oferta prepara falha de validação');
select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000006',
  'ca510000-0000-4000-8000-000000000006', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'status', 'submitted', 'sexta oferta prepara colisão de chave');
select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000007',
  'ca510000-0000-4000-8000-000000000009', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'status', 'submitted', 'sétima oferta prepara remoção da origem');
select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000008',
  'ca510000-0000-4000-8000-000000000011', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'status', 'submitted', 'oitava oferta prepara rechecagem do marcador');

update public.courses
set content_hash = repeat('9', 64)
where id = 'ca510000-0000-4000-8000-000000000004';
select is((
  select status from private.catalog_course_submissions
  where id = 'ca520000-0000-4000-8000-000000000004'
), 'stale', 'alteração posterior invalida a oferta sem última gravação vencer');
delete from public.courses
where id = 'ca510000-0000-4000-8000-000000000009';
select is((
  select status || ':' || stale_reason
  from private.catalog_course_submissions
  where id = 'ca520000-0000-4000-8000-000000000007'
), 'stale:source_removed', 'remoção da origem invalida a oferta e conserva o registro');
select is((
  select source_course_id
  from private.catalog_course_submissions
  where id = 'ca520000-0000-4000-8000-000000000007'
), null::uuid, 'oferta não mantém referência quebrada após a remoção da origem');
update private.catalog_course_submissions
set source_content_hash = repeat('6', 64)
where id = 'ca520000-0000-4000-8000-000000000008';

select pg_temp.make_personal_course(
  'ca510000-0000-4000-8000-000000000013',
  'ca500000-0000-4000-8000-000000000001',
  'offer-atomic-failure', repeat('7', 64)
);
select is(public.submit_personal_course_to_catalog(
  'ca520000-0000-4000-8000-000000000014',
  'ca510000-0000-4000-8000-000000000013', true,
  'CC-BY-4.0', 'Autor A', 'Produção própria.'
)->>'status', 'submitted', 'oferta adicional prepara falha atômica após a raiz');

select set_config(
  'request.jwt.claim.sub', 'ca500000-0000-4000-8000-000000000002', true
);
select is(jsonb_array_length(
  public.list_my_catalog_submission_candidates()->'items'
), 1, 'usuário B vê somente seu próprio candidato pessoal');
select ok(
  public.list_my_catalog_submission_candidates()->'items'
    @> '[{"courseId":"ca510000-0000-4000-8000-000000000007"}]'::jsonb,
  'candidato de B permanece isolado de A'
);
select is(jsonb_array_length(
  public.list_my_catalog_submissions()->'items'
), 0, 'usuário B não vê ofertas de A');
select throws_ok($call$
  select public.withdraw_catalog_submission(
    'ca520000-0000-4000-8000-000000000001'
  )
$call$, 'P0002', 'Submissão editorial inexistente.',
  'usuário B não retira oferta de A');
select throws_ok($call$
  select public.list_catalog_submission_queue()
$call$, '42501', 'Revisão editorial não autorizada.',
  'usuário comum não consulta a fila');
select throws_ok($call$
  select public.decide_catalog_submission(
    'ca520000-0000-4000-8000-000000000001', 'accept',
    '71000000-0000-4000-8000-000000000004', 'promoted-course', null
  )
$call$, '42501', 'Revisão editorial não autorizada.',
  'usuário comum não decide oferta');

select set_config(
  'request.jwt.claim.sub', 'ca500000-0000-4000-8000-000000000003', true
);
select ok(jsonb_array_length(
  public.list_catalog_submission_queue()->'items'
) >= 4, 'publicador consulta somente a fila editorial ativa');
select is(public.start_catalog_submission_review(
  'ca520000-0000-4000-8000-000000000001'
)->>'idempotent', 'false', 'publicador assume uma oferta');
select is(public.start_catalog_submission_review(
  'ca520000-0000-4000-8000-000000000001'
)->>'idempotent', 'true', 'repetição não cria outra revisão');

select is(public.decide_catalog_submission(
  'ca520000-0000-4000-8000-000000000003', 'reject', null, null,
  'A cobertura precisa ser ampliada.'
)->>'idempotent', 'false', 'publicador rejeita com justificativa');
select is(public.decide_catalog_submission(
  'ca520000-0000-4000-8000-000000000003', 'reject', null, null,
  'A cobertura precisa ser ampliada.'
)->>'idempotent', 'true', 'rejeição repetida é idempotente');
select is((select count(*) from public.courses
  where id = 'ca510000-0000-4000-8000-000000000003'), 1::bigint,
  'rejeição preserva o curso pessoal');
select throws_ok($call$
  select public.decide_catalog_submission(
    'ca520000-0000-4000-8000-000000000002', 'accept',
    '71000000-0000-4000-8000-000000000004', 'withdrawn-course', null
  )
$call$, '23514', 'A submissão não admite nova decisão.',
  'oferta retirada nunca é publicada');
select throws_ok($call$
  select public.decide_catalog_submission(
    'ca520000-0000-4000-8000-000000000004', 'accept',
    '71000000-0000-4000-8000-000000000004', 'stale-course', null
  )
$call$, '23514', 'A submissão não admite nova decisão.',
  'oferta alterada nunca é publicada silenciosamente');
select throws_ok($call$
  select public.decide_catalog_submission(
    'ca520000-0000-4000-8000-000000000007', 'accept',
    '71000000-0000-4000-8000-000000000004', 'removed-source-course', null
  )
$call$, '23514', 'A submissão não admite nova decisão.',
  'origem removida nunca produz uma árvore oficial');
select is(public.decide_catalog_submission(
  'ca520000-0000-4000-8000-000000000008', 'accept',
  '71000000-0000-4000-8000-000000000004', 'hash-rechecked-course', null
)->>'reason', 'source_changed',
  'aceite revalida o marcador sob lock mesmo sem depender do trigger');
select is((select count(*) from public.courses
  where owner_id is null and contract_key = 'hash-rechecked-course'), 0::bigint,
  'marcador divergente não deixa raiz oficial parcial');

delete from public.card_blocks
where course_id = 'ca510000-0000-4000-8000-000000000005';
select is((select status from private.catalog_course_submissions
  where id = 'ca520000-0000-4000-8000-000000000005'), 'stale',
  'alteração estrutural posterior invalida a oferta');
select throws_ok($call$
  select public.decide_catalog_submission(
    'ca520000-0000-4000-8000-000000000005', 'accept',
    '71000000-0000-4000-8000-000000000004', 'invalid-after-course', null
  )
$call$, '23514', 'A submissão não admite nova decisão.',
  'falha estrutural posterior bloqueia a aceitação');
select is((select count(*) from public.courses
  where owner_id is null and contract_key = 'invalid-after-course'), 0::bigint,
  'falha estrutural não deixa raiz oficial parcial');

create function pg_temp.reject_catalog_promotion_membership()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Falha injetada durante a promoção.' using errcode = '23514';
  return new;
end;
$$;
create trigger reject_catalog_promotion_membership
before insert on public.catalog_collection_courses
for each row execute function pg_temp.reject_catalog_promotion_membership();
select throws_ok($call$
  select public.decide_catalog_submission(
    'ca520000-0000-4000-8000-000000000014', 'accept',
    '71000000-0000-4000-8000-000000000004', 'offer-atomic-failure', null
  )
$call$, '23514', 'Falha injetada durante a promoção.',
  'falha durante a promoção reverte a mudança no mesmo comando');
select is((select count(*) from public.courses
  where owner_id is null and contract_key = 'offer-atomic-failure'), 0::bigint,
  'rollback atômico não promove o curso');
select is((select status from private.catalog_course_submissions
  where id = 'ca520000-0000-4000-8000-000000000014'), 'submitted',
  'rollback atômico também preserva a oferta para nova decisão');
drop trigger reject_catalog_promotion_membership on public.catalog_collection_courses;

create temp table accepted_submission as
select public.decide_catalog_submission(
  'ca520000-0000-4000-8000-000000000001', 'accept',
  '71000000-0000-4000-8000-000000000004', 'offer-accept',
  'Aprovado após revisão integral.'
) result;
select is((select result->>'status' from accepted_submission), 'accepted',
  'oferta válida é aceita');
select is((select (result->>'courseId')::uuid from accepted_submission),
  'ca510000-0000-4000-8000-000000000001'::uuid,
  'publicação conserva a identidade raiz');
select is((select owner_id from public.courses where id = (
  select (result->>'courseId')::uuid from accepted_submission
)), null::uuid, 'curso aceito é oficial');
select is((select status::text from public.courses where id = (
  select (result->>'courseId')::uuid from accepted_submission
)), 'published', 'curso só fica visível depois da validação');
select is((select content_hash from public.courses where id = (
  select (result->>'courseId')::uuid from accepted_submission
)), (select content_hash from public.courses where id =
  'ca510000-0000-4000-8000-000000000001'::uuid),
  'publicação conserva o hash canônico da fonte validada');
select is((select collection_id from public.catalog_collection_courses where course_id = (
  select (result->>'courseId')::uuid from accepted_submission
)), '71000000-0000-4000-8000-000000000004'::uuid,
  'publicação usa a coleção escolhida pelo editor');
select is((select count(*) from public.courses
  where id = 'ca510000-0000-4000-8000-000000000001'
    and owner_id is null
    and content_hash = (
      select source_content_hash
      from private.catalog_course_submissions
      where id = 'ca520000-0000-4000-8000-000000000001'
    )), 1::bigint, 'aceitação promove o próprio curso pessoal');
select is((select license_code from private.catalog_course_submissions
  where id = 'ca520000-0000-4000-8000-000000000001'), 'CC-BY-4.0',
  'licença permanece associada à publicação');
select is((select attribution_text from private.catalog_course_submissions
  where id = 'ca520000-0000-4000-8000-000000000001'), 'Autor A',
  'atribuição permanece associada à publicação');
select is((select provenance_text from private.catalog_course_submissions
  where id = 'ca520000-0000-4000-8000-000000000001'), 'Produção própria.',
  'procedência permanece associada à publicação');
select is(public.decide_catalog_submission(
  'ca520000-0000-4000-8000-000000000001', 'accept',
  '71000000-0000-4000-8000-000000000004', 'offer-accept',
  'Aprovado após revisão integral.'
)->>'idempotent', 'true', 'aceitação repetida não duplica o catálogo');

select throws_ok($call$
  select public.decide_catalog_submission(
    'ca520000-0000-4000-8000-000000000006', 'accept',
    '71000000-0000-4000-8000-000000000004', 'promoted-course', null
  )
$call$, '22023', 'A promoção preserva o identificador do curso privado.',
  'identificador público precisa coincidir com o curso privado');
select is((select count(*) from public.courses
  where owner_id is null and contract_key = 'offer-accept'), 1::bigint,
  'a promoção não cria segunda raiz');

select set_config(
  'request.jwt.claim.sub', 'ca500000-0000-4000-8000-000000000001', true
);
select ok(jsonb_array_length(
  public.list_my_catalog_submissions()->'items'
) >= 6, 'autor acompanha apenas suas próprias ofertas e decisões');
select throws_ok($call$
  select public.submit_personal_course_to_catalog(
    'ca520000-0000-4000-8000-000000000011',
    (select (result->>'courseId')::uuid from accepted_submission), true,
    'CC-BY-4.0', 'Autor A', 'Tentativa de reenviar o catálogo.'
  )
$call$, '42501', 'Curso pessoal indisponível para submissão.',
  'curso promovido não pode ser oferecido como curso pessoal');

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($call$
  select public.list_my_catalog_submission_candidates()
$call$, '42501', 'Autenticação obrigatória.',
  'requisição anônima não obtém candidatos pessoais');

select * from finish();
rollback;
