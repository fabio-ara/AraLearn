begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_table(
  'public', 'learning_components',
  'componentes pedagógicos possuem identidade própria'
);
select has_table(
  'public', 'learning_component_topic_links',
  'vínculos com lesson_topics são explícitos'
);
select has_table(
  'public', 'learning_component_relations',
  'relações pedagógicas dirigidas possuem tabela própria'
);
select has_table(
  'public', 'learning_component_placements',
  'continuidade entre componentes, microssequências e cards é relacional'
);
select has_function(
  'private', 'materialize_authoring_learning_metadata',
  array['uuid', 'uuid'],
  'publicação possui materializador pedagógico transacional'
);
select has_function(
  'private', 'learning_component_continuity',
  array['uuid', 'text'],
  'continuidade possui consulta interna ordenada'
);
select has_function(
  'private', 'authoring_learning_continuity',
  array['uuid', 'text'],
  'adaptador de autoria possui consulta de continuidade restrita'
);
select ok(
  strpos(
    pg_get_functiondef(
      'private.guard_learning_component_placement()'::regprocedure
    ),
    'microsequence.deleted_at'
  ) = 0
  and strpos(
    pg_get_functiondef(
      'private.guard_learning_component_placement()'::regprocedure
    ),
    'card.deleted_at'
  ) = 0,
  'guarda pedagógica respeita a árvore enxuta sem tombstones por linha'
);
select ok(
  strpos(
    pg_get_functiondef(
      'private.learning_component_continuity(uuid,text)'::regprocedure
    ),
    'module.deleted_at'
  ) = 0
  and strpos(
    pg_get_functiondef(
      'private.learning_component_continuity(uuid,text)'::regprocedure
    ),
    'lesson.deleted_at'
  ) = 0
  and strpos(
    pg_get_functiondef(
      'private.learning_component_continuity(uuid,text)'::regprocedure
    ),
    'microsequence.deleted_at'
  ) = 0
  and strpos(
    pg_get_functiondef(
      'private.learning_component_continuity(uuid,text)'::regprocedure
    ),
    'card.deleted_at'
  ) = 0,
  'consulta pedagógica não reintroduz colunas removidas no corte enxuto'
);
select ok(
  strpos(
    pg_get_functiondef(
      'private.materialize_authoring_learning_metadata(uuid,uuid)'::regprocedure
    ),
    'microsequence.deleted_at'
  ) = 0
  and strpos(
    pg_get_functiondef(
      'private.materialize_authoring_learning_metadata(uuid,uuid)'::regprocedure
    ),
    'card.deleted_at'
  ) = 0,
  'materialização pedagógica resolve a árvore enxuta sem tombstones por entidade'
);

select ok((select relation.relrowsecurity and relation.relforcerowsecurity
  from pg_class relation
  where relation.oid = 'public.learning_components'::regclass),
  'componentes exigem RLS inclusive para o proprietário');
select ok((select relation.relrowsecurity and relation.relforcerowsecurity
  from pg_class relation
  where relation.oid = 'public.learning_component_topic_links'::regclass),
  'vínculos explícitos exigem RLS');
select ok((select relation.relrowsecurity and relation.relforcerowsecurity
  from pg_class relation
  where relation.oid = 'public.learning_component_relations'::regclass),
  'relações exigem RLS');
select ok((select relation.relrowsecurity and relation.relforcerowsecurity
  from pg_class relation
  where relation.oid = 'public.learning_component_placements'::regclass),
  'posições pedagógicas exigem RLS');

select ok(not has_table_privilege(
  'authenticated', 'public.learning_components', 'SELECT'
), 'cliente não consulta componentes diretamente');
select ok(not has_table_privilege(
  'authenticated', 'public.learning_component_topic_links', 'SELECT'
), 'cliente não consulta vínculos pedagógicos diretamente');
select ok(not has_table_privilege(
  'authenticated', 'public.learning_component_relations', 'SELECT'
), 'cliente não consulta relações pedagógicas diretamente');
select ok(not has_table_privilege(
  'authenticated', 'public.learning_component_placements', 'SELECT'
), 'cliente não consulta continuidade diretamente');
select ok(not has_table_privilege(
  'anon', 'public.learning_components', 'SELECT'
), 'anon não recebe metadados pedagógicos');
select ok(not has_function_privilege(
  'authenticated',
  'private.materialize_authoring_learning_metadata(uuid,uuid)',
  'EXECUTE'
), 'materialização permanece encapsulada no servidor');
select ok(not has_function_privilege(
  'authenticated',
  'private.authoring_learning_continuity(uuid,text)',
  'EXECUTE'
), 'cliente autenticado não chama a continuidade do adaptador');
select ok(has_function_privilege(
  'service_role',
  'private.authoring_learning_continuity(uuid,text)',
  'EXECUTE'
), 'somente a função de serviço recebe a consulta do adaptador');
select ok((select procedure.prosecdef
    and 'search_path=pg_catalog, public, private'
      = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'private.materialize_authoring_learning_metadata(uuid,uuid)'::regprocedure
), 'materializador é SECURITY DEFINER com search_path fixo');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'ed100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'learning-a@aralearn.test', 'x', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'ed100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'learning-b@aralearn.test', 'x', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  )
on conflict(id) do nothing;

insert into public.courses(
  id, owner_id, status, contract_key, title, goal,
  publication_seq, content_hash, position
) values
  (
    'ed200000-0000-4000-8000-000000000001',
    'ed100000-0000-4000-8000-000000000001',
    'published', 'learning-course-a', 'Curso pedagógico A',
    'Testar continuidade sem duplicar a árvore.', 1, repeat('a', 64), 0
  ),
  (
    'ed200000-0000-4000-8000-000000000002',
    'ed100000-0000-4000-8000-000000000002',
    'published', 'learning-course-b', 'Curso pedagógico B',
    'Testar isolamento entre cursos.', 1, repeat('b', 64), 0
  );

insert into public.modules(id, course_id, contract_key, position, title) values
  (
    'ed300000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000001',
    'learning-module-a', 0, 'Módulo A'
  ),
  (
    'ed300000-0000-4000-8000-000000000002',
    'ed200000-0000-4000-8000-000000000002',
    'learning-module-b', 0, 'Módulo B'
  );

insert into public.lessons(
  id, course_id, module_id, contract_key, position, title
) values
  (
    'ed400000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000001',
    'ed300000-0000-4000-8000-000000000001',
    'learning-lesson-a', 0, 'Lição A'
  ),
  (
    'ed400000-0000-4000-8000-000000000002',
    'ed200000-0000-4000-8000-000000000002',
    'ed300000-0000-4000-8000-000000000002',
    'learning-lesson-b', 0, 'Lição B'
  );

insert into public.lesson_topics(
  id, course_id, lesson_id, contract_key, position, label, kind, topic_kind
) values
  (
    'ed500000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000001',
    'ed400000-0000-4000-8000-000000000001',
    'topic-contract-a', 0, 'Tópico público A', 'concept', 'concept'
  ),
  (
    'ed500000-0000-4000-8000-000000000002',
    'ed200000-0000-4000-8000-000000000002',
    'ed400000-0000-4000-8000-000000000002',
    'topic-contract-b', 0, 'Tópico público B', 'concept', 'concept'
  );

insert into public.microsequences(
  id, course_id, lesson_id, contract_key, position, title, goal, role, status
) values
  (
    'ed600000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000001',
    'ed400000-0000-4000-8000-000000000001',
    'micro-learning', 0, 'Fundamento e prática',
    'Avaliar um componente.', 'explain', 'ready'
  ),
  (
    'ed600000-0000-4000-8000-000000000002',
    'ed200000-0000-4000-8000-000000000002',
    'ed400000-0000-4000-8000-000000000002',
    'micro-foreign', 0, 'Outra sequência',
    'Preservar isolamento.', 'explain', 'ready'
  );

insert into public.cards(
  id, course_id, lesson_id, microsequence_id, contract_key, position,
  resource, kind, exercise, title
) values
  (
    'ed700000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000001',
    'ed400000-0000-4000-8000-000000000001',
    'ed600000-0000-4000-8000-000000000001',
    'card-worked', 1, 'paragraph', 'theory', 'none', 'Exemplo resolvido'
  ),
  (
    'ed700000-0000-4000-8000-000000000002',
    'ed200000-0000-4000-8000-000000000001',
    'ed400000-0000-4000-8000-000000000001',
    'ed600000-0000-4000-8000-000000000001',
    'card-practice', 2, 'paragraph', 'exercise', 'gap', 'Prática independente'
  );

insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target,
  publication_intent, contract_key, title, status, plan, plan_hash,
  course_id
) values (
  'ed800000-0000-4000-8000-000000000001',
  'ed100000-0000-4000-8000-000000000001',
  'ed100000-0000-4000-8000-000000000001',
  'catalog', 'create', 'learning-course-a', 'Autoria pedagógica',
  'publishing',
  jsonb_build_object(
    'learningOutcomes', jsonb_build_array(jsonb_build_object(
      'id', 'outcome-evaluate',
      'statement', 'Avaliar um componente em uma representação.',
      'evidence', 'Determina o valor correto e justifica a operação.'
    )),
    'operations', jsonb_build_array(jsonb_build_object(
      'id', 'operation-evaluate',
      'label', 'Avaliar uma operação',
      'evidence', 'Determina o resultado e explicita o procedimento.',
      'representation', jsonb_build_object(
        'preferredResources', jsonb_build_array('paragraph'),
        'allowedResources', jsonb_build_array('paragraph'),
        'rationale', 'A proposição formal concentra a operação e o resultado.'
      )
    )),
    'misconceptions', jsonb_build_array(jsonb_build_object(
      'id', 'misconception-order',
      'statement', 'A ordem dos passos não altera o resultado.',
      'correctionEvidence', 'Compara as ordens e identifica a divergência.'
    )),
    'conceptMap', jsonb_build_object(
      'concepts', jsonb_build_array(
        jsonb_build_object('id', 'concept-operation', 'label', 'Operação'),
        jsonb_build_object('id', 'concept-value', 'label', 'Valor')
      ),
      'relations', jsonb_build_array(
        jsonb_build_object(
          'from', 'concept-operation',
          'to', 'concept-value',
          'relation', 'requires'
        )
      )
    )
  ),
  repeat('c', 64),
  'ed200000-0000-4000-8000-000000000001'
);

insert into private.authoring_ledger_chunks(
  run_id, section, position, items, content_hash
) values (
  'ed800000-0000-4000-8000-000000000001',
  'terms',
  0,
  jsonb_build_array(
    jsonb_build_object(
      'termId', 'term-prerequisite',
      'form', 'valor inicial',
      'language', 'pt-BR',
      'explanation', 'Valor disponível antes da operação.',
      'firstTeachingCardId', 'card-worked',
      'requiredByCardIds', jsonb_build_array('card-practice')
    ),
    jsonb_build_object(
      'termId', 'term-result',
      'form', 'resultado',
      'language', 'pt-BR',
      'explanation', 'Valor obtido pela operação.',
      'firstTeachingCardId', 'card-practice',
      'requiredByCardIds', '[]'::jsonb
    )
  ),
  repeat('d', 64)
);

insert into private.authoring_parts(
  run_id, part_key, position, title, outline, specification,
  status, approved_at
) values (
  'ed800000-0000-4000-8000-000000000001',
  'part-learning', 0, 'Parte pedagógica', '{}'::jsonb,
  jsonb_build_object(
    'cardPlan', jsonb_build_array(
      jsonb_build_object(
        'cardId', 'card-worked',
        'microsequenceId', 'micro-learning',
        'position', 1,
        'outcomeIds', jsonb_build_array('outcome-evaluate'),
        'conceptIds', jsonb_build_array('concept-operation'),
        'retrievedConceptIds', '[]'::jsonb,
        'misconceptionIds', '[]'::jsonb,
        'operationId', 'operation-evaluate',
        'learningFunction', 'worked_example',
        'evidence', 'Resolve o caso e justifica a operação.',
        'introducedTermIds', jsonb_build_array('term-prerequisite'),
        'requiredTermIds', '[]'::jsonb
      ),
      jsonb_build_object(
        'cardId', 'card-practice',
        'microsequenceId', 'micro-learning',
        'position', 2,
        'outcomeIds', jsonb_build_array('outcome-evaluate'),
        'conceptIds', jsonb_build_array(
          'concept-operation', 'concept-value'
        ),
        'retrievedConceptIds', jsonb_build_array('concept-operation'),
        'misconceptionIds', jsonb_build_array('misconception-order'),
        'operationId', 'operation-evaluate',
        'learningFunction', 'independent_practice',
        'evidence', 'Determina o resultado sem apoio.',
        'variationFocus', 'Mudar os valores, preservando a operação.',
        'targetError', 'Aplicar a operação em ordem incorreta.',
        'introducedTermIds', jsonb_build_array('term-result'),
        'requiredTermIds', jsonb_build_array('term-prerequisite')
      )
    )
  ),
  'approved', now()
);

update private.authoring_runs
set plan = jsonb_set(
  plan,
  '{conceptMap,relations}',
  (plan #> '{conceptMap,relations}') || jsonb_build_array(
    jsonb_build_object(
      'from', 'concept-operation',
      'to', 'concept-value',
      'relation', 'tem condição definida por'
    )
  )
)
where id = 'ed800000-0000-4000-8000-000000000001';

select throws_ok($call$
  select private.materialize_authoring_learning_metadata(
    'ed800000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000001'
  )
$call$, '23514',
  'O mapa conceitual contém 1 relação(ões) inválida(s) ou não resolvida(s).',
  'relação fora do vocabulário formal é recusada sem perda silenciosa');

update private.authoring_runs
set plan = jsonb_set(
  plan,
  '{conceptMap,relations}',
  jsonb_build_array(jsonb_build_object(
    'from', 'concept-operation',
    'to', 'concept-value',
    'relation', 'requires'
  ))
)
where id = 'ed800000-0000-4000-8000-000000000001';

update private.authoring_parts
set specification = jsonb_set(
  specification,
  '{cardPlan,1,retrievedConceptIds}',
  jsonb_build_array('concept-missing')
)
where run_id = 'ed800000-0000-4000-8000-000000000001'
  and part_key = 'part-learning';

select throws_ok($call$
  select private.materialize_authoring_learning_metadata(
    'ed800000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000001'
  )
$call$, '23514',
  'A especificação contém 1 card(s) pedagógicos não resolvidos.',
  'retomada precisa ser subconjunto explícito dos conceitos do card');

update private.authoring_parts
set specification = jsonb_set(
  specification,
  '{cardPlan,1,retrievedConceptIds}',
  jsonb_build_array('concept-operation')
)
where run_id = 'ed800000-0000-4000-8000-000000000001'
  and part_key = 'part-learning';

select lives_ok($call$
  select private.authoring_compact_terminal_payloads(
    'ed800000-0000-4000-8000-000000000001'
  )
$call$, 'a compactação real materializa antes de descartar o staging');

select ok((select terminal_compacted_at is not null
  from private.authoring_runs
  where id = 'ed800000-0000-4000-8000-000000000001'),
  'compactador registra o instante terminal');
select is((select count(*) from private.authoring_ledger_chunks
  where run_id = 'ed800000-0000-4000-8000-000000000001'),
  0::bigint,
  'compactador remove o ledger transitório depois da materialização');
select is((select specification->>'compacted'
  from private.authoring_parts
  where run_id = 'ed800000-0000-4000-8000-000000000001'
    and part_key = 'part-learning'),
  'true',
  'compactador reduz a especificação somente depois da materialização');

select is((select count(*) from public.learning_components
  where course_id = 'ed200000-0000-4000-8000-000000000001'
    and deleted_at is null),
  7::bigint,
  'conceitos, operação, termos, resultado e concepção incorreta preservam IDs');
select is((select count(*) from public.learning_component_relations
  where course_id = 'ed200000-0000-4000-8000-000000000001'
    and deleted_at is null),
  1::bigint,
  'somente a relação formal tipada é materializada');
select is((select count(*) from public.learning_component_placements
  where course_id = 'ed200000-0000-4000-8000-000000000001'
    and deleted_at is null),
  12::bigint,
  'cards registram conceitos, retomada, erro, operação, resultado e termos');
select is(
  private.materialize_authoring_learning_metadata(
    'ed800000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000001'
  )->>'idempotent',
  'true',
  'repetição depois da compactação usa o recibo sem tocar na árvore'
);
select is((select validation_report
    #>> '{pedagogicalMaterialization,status}'
  from private.authoring_runs
  where id = 'ed800000-0000-4000-8000-000000000001'),
  'materialized',
  'relatório da execução conserva o recibo da materialização');

update private.authoring_runs
set validation_report = jsonb_build_object('valid', true, 'compacted', true)
where id = 'ed800000-0000-4000-8000-000000000001';
select is((select validation_report
    #>> '{pedagogicalMaterialization,status}'
  from private.authoring_runs
  where id = 'ed800000-0000-4000-8000-000000000001'),
  'materialized',
  'relatório final não apaga o diagnóstico pedagógico');
select is((select count(*) from public.learning_component_topic_links
  where course_id = 'ed200000-0000-4000-8000-000000000001'
    and deleted_at is null),
  0::bigint,
  'lesson_topics não recebe vínculo presumido por chave ou rótulo');

select is((select revision from public.learning_components
  where course_id = 'ed200000-0000-4000-8000-000000000001'
    and component_key = 'operation-evaluate' and deleted_at is null),
  1::bigint,
  'materialização idempotente não altera revisão da operação');
select is((select revision from public.learning_component_placements placement
  join public.learning_components component
    on component.id = placement.component_id
  where placement.course_id = 'ed200000-0000-4000-8000-000000000001'
    and component.component_key = 'operation-evaluate'
    and placement.card_id = 'ed700000-0000-4000-8000-000000000001'
    and placement.deleted_at is null),
  1::bigint,
  'posição de continuidade idêntica não é regravada');
select is((select revision from public.learning_components
  where course_id = 'ed200000-0000-4000-8000-000000000001'
    and component_key = 'operation-evaluate' and deleted_at is null),
  1::bigint,
  'operação estável não é regravada após a compactação');

select is((select array_agg(card_key order by
    module_position, lesson_position, microsequence_position, card_position)
  from private.learning_component_continuity(
    'ed200000-0000-4000-8000-000000000001',
    'operation-evaluate'
  )),
  array['card-worked', 'card-practice']::text[],
  'consulta de continuidade respeita a ordem didática');
select is((select array_agg(learning_role order by
    module_position, lesson_position, microsequence_position, card_position)
  from private.learning_component_continuity(
    'ed200000-0000-4000-8000-000000000001',
    'term-prerequisite'
  )),
  array['introduce', 'retrieve']::text[],
  'consulta distingue introdução inicial de retomada posterior');
select is((select array_agg(learning_role order by learning_role)
  from private.learning_component_continuity(
    'ed200000-0000-4000-8000-000000000001',
    'concept-operation'
  )
  where card_key = 'card-practice'),
  array['practice', 'retrieve']::text[],
  'um conceito do card conserva papel principal e retomada explícita');
select is((select array_agg(card_key order by card_position)
  from private.learning_component_continuity(
    'ed200000-0000-4000-8000-000000000001',
    'misconception-order'
  )),
  array['card-practice']::text[],
  'concepção incorreta do plano é materializada no card que a corrige');
select set_config('request.jwt.claim.role', 'service_role', true);
select is(jsonb_array_length(
  private.authoring_learning_continuity(
    'ed200000-0000-4000-8000-000000000001',
    'concept-operation'
  )->'placements'
), 3, 'adaptador recebe continuidade completa por uma função de serviço');

select lives_ok($call$
  insert into public.learning_component_topic_links(
    course_id, component_id, topic_id, link_kind, protocol_path, position
  )
  select
    component.course_id,
    component.id,
    'ed500000-0000-4000-8000-000000000001',
    'contextualizes',
    'futureProtocol.componentTopicLinks[0]',
    0
  from public.learning_components component
  where component.course_id = 'ed200000-0000-4000-8000-000000000001'
    and component.component_key = 'concept-operation'
$call$, 'vínculo explícito com lesson_topic é aceito');

insert into public.courses(
  id, owner_id, source_course_id, status, contract_key, title, goal,
  publication_seq, content_hash, position
) values (
  'ed200000-0000-4000-8000-000000000003',
  'ed100000-0000-4000-8000-000000000002',
  'ed200000-0000-4000-8000-000000000001',
  'published', 'learning-course-copy', 'Cópia pedagógica',
  'Verificar remapeamento completo dos metadados.', 0, repeat('a', 64), 1
);

select lives_ok($call$
  select private.clone_personal_course_tree(
    'eda00000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000001',
    'ed200000-0000-4000-8000-000000000003'
  )
$call$, 'cópia pessoal inclui a semântica pedagógica materializada');

select is((select count(*) from public.learning_components
  where course_id = 'ed200000-0000-4000-8000-000000000003'
    and deleted_at is null),
  7::bigint,
  'cópia pessoal conserva todos os componentes pedagógicos');
select is((select count(*) from public.learning_component_topic_links
  where course_id = 'ed200000-0000-4000-8000-000000000003'
    and deleted_at is null),
  1::bigint,
  'cópia pessoal remapeia vínculos explícitos com tópicos');
select is((select count(*) from public.learning_component_relations
  where course_id = 'ed200000-0000-4000-8000-000000000003'
    and deleted_at is null),
  1::bigint,
  'cópia pessoal remapeia relações pedagógicas');
select is((select count(*) from public.learning_component_placements
  where course_id = 'ed200000-0000-4000-8000-000000000003'
    and deleted_at is null),
  12::bigint,
  'cópia pessoal remapeia a continuidade dos cards');
select ok(not exists(
  select 1
  from public.learning_components clone
  left join public.learning_components source
    on source.id = clone.source_entity_id
   and source.course_id = 'ed200000-0000-4000-8000-000000000001'
  where clone.course_id = 'ed200000-0000-4000-8000-000000000003'
    and source.id is null
), 'cada componente copiado aponta para sua linha de origem');
select ok(
  not exists(
    select 1 from public.learning_component_topic_links
    where course_id = 'ed200000-0000-4000-8000-000000000003'
      and source_entity_id is null
    union all
    select 1 from public.learning_component_relations
    where course_id = 'ed200000-0000-4000-8000-000000000003'
      and source_entity_id is null
    union all
    select 1 from public.learning_component_placements
    where course_id = 'ed200000-0000-4000-8000-000000000003'
      and source_entity_id is null
  ),
  'vínculos, relações e posições copiados conservam sua origem'
);
select ok(not exists(
  select 1
  from public.learning_component_placements placement
  join public.learning_components component
    on component.id = placement.component_id
  join public.microsequences microsequence
    on microsequence.id = placement.microsequence_id
  join public.cards card
    on card.id = placement.card_id
  where placement.course_id = 'ed200000-0000-4000-8000-000000000003'
    and (
      component.course_id <> placement.course_id
      or microsequence.course_id <> placement.course_id
      or card.course_id <> placement.course_id
    )
), 'FKs da continuidade copiada permanecem dentro do curso de destino');

delete from private.personal_course_clone_map
where clone_id = 'eda00000-0000-4000-8000-000000000001';

insert into public.learning_components(
  id, course_id, component_key, component_type, label, position
) values (
  'ed900000-0000-4000-8000-000000000001',
  'ed200000-0000-4000-8000-000000000002',
  'foreign-concept',
  'concept',
  'Conceito de outro curso',
  0
);

select throws_ok($call$
  insert into public.learning_component_relations(
    course_id, from_component_id, to_component_id, relation_kind, position
  )
  select
    'ed200000-0000-4000-8000-000000000001',
    source.id,
    'ed900000-0000-4000-8000-000000000001',
    'contrasts',
    2
  from public.learning_components source
  where source.course_id = 'ed200000-0000-4000-8000-000000000001'
    and source.component_key = 'concept-operation'
$call$, '23503', null,
  'FK composta recusa relação entre cursos');

select throws_ok($call$
  insert into public.learning_component_topic_links(
    course_id, component_id, topic_id, link_kind, protocol_path, position
  )
  select
    component.course_id,
    component.id,
    'ed500000-0000-4000-8000-000000000002',
    'equivalent',
    'futureProtocol.componentTopicLinks[1]',
    1
  from public.learning_components component
  where component.course_id = 'ed200000-0000-4000-8000-000000000001'
    and component.component_key = 'concept-operation'
$call$, '23503', null,
  'lesson_topic de outro curso não pode ser associado');

select throws_ok($call$
  insert into public.learning_component_relations(
    course_id, from_component_id, to_component_id, relation_kind, position
  )
  select
    source.course_id,
    target.id,
    source.id,
    'requires',
    2
  from public.learning_components source
  join public.learning_components target
    on target.course_id = source.course_id
   and target.component_key = 'concept-value'
  where source.course_id = 'ed200000-0000-4000-8000-000000000001'
    and source.component_key = 'concept-operation'
$call$, '23514', 'A relação requires criaria um ciclo pedagógico.',
  'requires recusa ciclo');

select lives_ok($call$
  insert into public.learning_component_relations(
    course_id, from_component_id, to_component_id, relation_kind, position
  )
  select
    source.course_id,
    target.id,
    source.id,
    'causes',
    2
  from public.learning_components source
  join public.learning_components target
    on target.course_id = source.course_id
   and target.component_key = 'concept-value'
  where source.course_id = 'ed200000-0000-4000-8000-000000000001'
    and source.component_key = 'concept-operation'
$call$, 'relação semântica inversa é válida porque somente requires forma DAG');

select throws_ok($call$
  insert into public.learning_component_placements(
    course_id, component_id, microsequence_id, card_id, learning_role,
    learning_function, support_level, evidence_statement, position
  )
  select
    component.course_id,
    component.id,
    'ed600000-0000-4000-8000-000000000002',
    'ed700000-0000-4000-8000-000000000001',
    'practice',
    'worked_example',
    'modeled',
    'Evidência inválida entre cursos.',
    0
  from public.learning_components component
  where component.course_id = 'ed200000-0000-4000-8000-000000000001'
    and component.component_key = 'operation-evaluate'
$call$, '23514', 'O card não pertence à microssequência informada.',
  'posição pedagógica recusa card fora da microssequência');

insert into public.learning_component_placements(
  course_id, component_id, microsequence_id, card_id, learning_role,
  learning_function, support_level, evidence_statement, position
)
select
  component.course_id,
  component.id,
  'ed600000-0000-4000-8000-000000000002',
  null,
  'introduce',
  'foundation',
  'modeled',
  'Apresenta o conceito do segundo curso.',
  0
from public.learning_components component
where component.id = 'ed900000-0000-4000-8000-000000000001';

select lives_ok($call$
  update public.learning_component_placements
  set deleted_at = now()
  where course_id = 'ed200000-0000-4000-8000-000000000002'
    and component_id = 'ed900000-0000-4000-8000-000000000001'
$call$, 'posição pedagógica pode ser desativada enquanto o pai existe');

delete from public.microsequences
where id = 'ed600000-0000-4000-8000-000000000002';

select ok(not exists(
  select 1
  from public.learning_component_placements placement
  where placement.course_id = 'ed200000-0000-4000-8000-000000000002'
    and placement.component_id = 'ed900000-0000-4000-8000-000000000001'
), 'hard delete enxuto elimina a posição pedagógica por cascade');

select set_config(
  'request.jwt.claim.sub',
  'ed100000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(public.user_can_read_course(
  'ed200000-0000-4000-8000-000000000001'
), 'usuário A pode ler seu curso por uma interface autorizada');
select ok(not public.user_can_read_course(
  'ed200000-0000-4000-8000-000000000002'
), 'usuário A não recebe componentes do curso pessoal de B');

select * from finish();
rollback;
