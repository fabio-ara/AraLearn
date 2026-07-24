begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_column(
  'private',
  'authoring_parts',
  'authoring_fragment',
  'a fonte formal fica em coluna privada'
);
select has_column(
  'private',
  'authoring_parts',
  'authoring_fragment_hash',
  'a fonte formal possui hash próprio'
);
select has_function(
  'public',
  'dispatch_authoring_command_v2',
  array['uuid', 'uuid', 'text', 'uuid', 'text', 'text', 'jsonb'],
  'dispatcher v2 preserva a fonte formal'
);
select has_function(
  'public',
  'get_authoring_part_submission_v2',
  array['uuid', 'text', 'uuid'],
  'getter v2 devolve as duas representações'
);
select ok(not has_function_privilege(
  'anon',
  'public.dispatch_authoring_command_v2(uuid,uuid,text,uuid,text,text,jsonb)',
  'EXECUTE'
), 'anon não chama o dispatcher v2');
select ok(not has_function_privilege(
  'authenticated',
  'public.get_authoring_part_submission_v2(uuid,text,uuid)',
  'EXECUTE'
), 'authenticated não contorna o gateway para ler a fonte formal');
select ok(has_function_privilege(
  'service_role',
  'public.dispatch_authoring_command_v2(uuid,uuid,text,uuid,text,text,jsonb)',
  'EXECUTE'
), 'gateway servidor chama o dispatcher v2');
select ok(has_function_privilege(
  'service_role',
  'public.get_authoring_part_submission_v2(uuid,text,uuid)',
  'EXECUTE'
), 'gateway servidor lê a submissão v2');
select ok((
  select procedure.prosecdef
    and 'search_path=pg_catalog, public, private, extensions' = any(procedure.proconfig)
    and 'statement_timeout=30s' = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.dispatch_authoring_command_v2(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
), 'dispatcher v2 usa SECURITY DEFINER, search_path e timeout fixos');
select ok((
  select procedure.prosecdef
    and procedure.provolatile = 's'
    and 'search_path=pg_catalog, public, private' = any(procedure.proconfig)
  from pg_proc procedure
  where procedure.oid =
    'public.get_authoring_part_submission_v2(uuid,text,uuid)'::regprocedure
), 'getter v2 é estável e fixa o search_path');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'fa000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'formal-source-author@aralearn.test', 'x', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
)
on conflict(id) do nothing;

select set_config('request.jwt.claim.role', 'service_role', true);

insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, plan, plan_hash
) values (
  'fa100000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  'private', null, false, 'create',
  'formal-source-course', 'Fonte formal', 'building',
  jsonb_build_object('ledgerFinalized', true),
  repeat('a', 64)
);

insert into private.authoring_parts(
  id, run_id, part_key, position, title, outline, specification,
  submission_meta, status, attempt
) values (
  'fa200000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  'parte-formal', 0, 'Parte formal',
  jsonb_build_object('key', 'parte-formal'),
  jsonb_build_object('outcomeIds', jsonb_build_array()),
  jsonb_build_object(
    'planHash', repeat('a', 64),
    'specificationHash', repeat('b', 64)
  ),
  'planned', 0
);

create temporary table formal_fragment_cases(
  version integer primary key,
  compiled_fragment jsonb not null,
  authoring_fragment jsonb not null,
  payload jsonb not null
) on commit drop;

with fragments as (
  select
    1 as version,
    jsonb_build_object(
      'courseId', 'course-stable',
      'moduleId', 'module-stable',
      'lessonId', 'lesson-stable',
      'microsequences', jsonb_build_array(jsonb_build_object(
        'id', 'micro-stable',
        'title', 'Microssequência estável',
        'goal', 'Resolver a igualdade.',
        'role', 'practice',
        'status', 'generated',
        'cards', jsonb_build_array(jsonb_build_object(
          'id', 'card-stable',
          'resource', 'table',
          'kind', 'exercise',
          'exercise', 'gap',
          'rows', jsonb_build_array(jsonb_build_array(
            '2 + 2', '[[4::4|3|5]]'
          ))
        ))
      ))
    ) as compiled_fragment,
    jsonb_build_object(
      'courseId', 'course-stable',
      'moduleId', 'module-stable',
      'lessonId', 'lesson-stable',
      'microsequences', jsonb_build_array(jsonb_build_object(
        'id', 'micro-stable',
        'title', 'Microssequência estável',
        'goal', 'Resolver a igualdade.',
        'role', 'practice',
        'status', 'generated',
        'cards', jsonb_build_array(jsonb_build_object(
          'id', 'card-stable',
          'resource', 'table',
          'kind', 'exercise',
          'exercise', 'gap',
          'rows', jsonb_build_array(jsonb_build_array(
            '2 + 2', '{gap:resultado}'
          )),
          'gaps', jsonb_build_array(jsonb_build_object(
            'id', 'resultado',
            'response', 'choice',
            'answer', '4',
            'distractors', jsonb_build_array('3', '5')
          ))
        ))
      ))
    ) as authoring_fragment
  union all
  select
    2,
    jsonb_build_object(
      'courseId', 'course-stable',
      'moduleId', 'module-stable',
      'lessonId', 'lesson-stable',
      'microsequences', jsonb_build_array(jsonb_build_object(
        'id', 'micro-stable',
        'title', 'Microssequência estável',
        'goal', 'Resolver a nova igualdade.',
        'role', 'practice',
        'status', 'generated',
        'cards', jsonb_build_array(jsonb_build_object(
          'id', 'card-stable',
          'resource', 'table',
          'kind', 'exercise',
          'exercise', 'gap',
          'rows', jsonb_build_array(jsonb_build_array(
            '2 + 3', '[[5::5|4|6]]'
          ))
        ))
      ))
    ),
    jsonb_build_object(
      'courseId', 'course-stable',
      'moduleId', 'module-stable',
      'lessonId', 'lesson-stable',
      'microsequences', jsonb_build_array(jsonb_build_object(
        'id', 'micro-stable',
        'title', 'Microssequência estável',
        'goal', 'Resolver a nova igualdade.',
        'role', 'practice',
        'status', 'generated',
        'cards', jsonb_build_array(jsonb_build_object(
          'id', 'card-stable',
          'resource', 'table',
          'kind', 'exercise',
          'exercise', 'gap',
          'rows', jsonb_build_array(jsonb_build_array(
            '2 + 3', '{gap:resultado}'
          )),
          'gaps', jsonb_build_array(jsonb_build_object(
            'id', 'resultado',
            'response', 'choice',
            'answer', '5',
            'distractors', jsonb_build_array('4', '6')
          ))
        ))
      ))
    )
)
insert into formal_fragment_cases(version, compiled_fragment, authoring_fragment, payload)
select
  version,
  compiled_fragment,
  authoring_fragment,
  jsonb_build_object(
    'mode', case when version = 1 then 'build' else 'rebuild' end,
    'expectedAttempt', version,
    'baseLedgerSha256', repeat('c', 64),
    'fragment', compiled_fragment,
    'authoringFragment', authoring_fragment,
    'evidence', jsonb_build_array(),
    'stateDelta', jsonb_build_object(
      'introducedTermIds', jsonb_build_array(),
      'usedClaimIds', jsonb_build_array(),
      'coveredOutcomeIds', jsonb_build_array(),
      'resolvedErrorIds', jsonb_build_array(),
      'notes', jsonb_build_array()
    )
  )
from fragments;

select throws_ok($call$
  select public.dispatch_authoring_command_v2(
    'fa000000-0000-4000-8000-000000000001',
    null,
    'formal-invalid-shape-0001',
    'fa100000-0000-4000-8000-000000000001',
    'submit_part',
    'parte-formal',
    (select payload || jsonb_build_object(
      'authoringFragment', jsonb_build_array('inválido')
    ) from formal_fragment_cases where version = 1)
  )
$call$, '22023', 'Fragmento formal de autoria ausente.',
  'dispatcher rejeita fonte formal que não seja objeto');

select throws_ok($call$
  select public.dispatch_authoring_command_v2(
    'fa000000-0000-4000-8000-000000000001',
    null,
    'formal-oversized-0001',
    'fa100000-0000-4000-8000-000000000001',
    'submit_part',
    'parte-formal',
    (select payload || jsonb_build_object(
      'authoringFragment', jsonb_build_object('padding', repeat('x', 92160))
    ) from formal_fragment_cases where version = 1)
  )
$call$, '22023', 'O fragmento formal de autoria deve ocupar menos de 90 KiB.',
  'dispatcher rejeita fonte formal acima do limite');

select throws_ok($call$
  select public.dispatch_authoring_command_v2(
    'fa000000-0000-4000-8000-000000000001',
    null,
    'formal-id-mismatch-0001',
    'fa100000-0000-4000-8000-000000000001',
    'submit_part',
    'parte-formal',
    (select payload || jsonb_build_object(
      'authoringFragment',
      jsonb_set(authoring_fragment, '{microsequences,0,id}', '"micro-trocada"')
    ) from formal_fragment_cases where version = 1)
  )
$call$, '22023', 'A fonte formal não preserva os identificadores do compilado.',
  'dispatcher rejeita vínculo formal com identificadores divergentes');

select is(
  (select attempt from private.authoring_parts
    where id = 'fa200000-0000-4000-8000-000000000001'),
  0,
  'validações formais falham antes de alterar a tentativa'
);

select is(
  public.dispatch_authoring_command_v2(
    'fa000000-0000-4000-8000-000000000001',
    null,
    'formal-submit-0001',
    'fa100000-0000-4000-8000-000000000001',
    'submit_part',
    'parte-formal',
    (select payload from formal_fragment_cases where version = 1)
  )->>'partStatus',
  'awaiting_audit',
  'submissão persiste o compilado e a fonte formal atomicamente'
);

create temporary table first_formal_submission(
  payload jsonb not null
) on commit drop;
insert into first_formal_submission(payload)
select public.get_authoring_part_submission_v2(
  'fa100000-0000-4000-8000-000000000001',
  'parte-formal',
  'fa000000-0000-4000-8000-000000000001'
);

select is(
  (select payload->'fragment' from first_formal_submission),
  (select compiled_fragment from formal_fragment_cases where version = 1),
  'getter devolve o fragmento compilado auditável'
);
select is(
  (select payload->'authoringFragment' from first_formal_submission),
  (select authoring_fragment from formal_fragment_cases where version = 1),
  'getter devolve a fonte formal sem recompô-la'
);
select is(
  (select payload->>'compiledFragmentHash' from first_formal_submission),
  (select payload->>'fragmentHash' from first_formal_submission),
  'hash compilado do getter corresponde ao hash causal da auditoria'
);
select is(
  (select payload->>'authoringFragmentHash' from first_formal_submission),
  encode(extensions.digest(convert_to(
    (select authoring_fragment::text
      from formal_fragment_cases where version = 1),
    'UTF8'
  ), 'sha256'), 'hex'),
  'hash formal corresponde ao JSONB efetivamente preservado'
);
select ok((
  select
    payload#>>'{authoringFragment,courseId}' =
      payload#>>'{fragment,courseId}'
    and payload#>>'{authoringFragment,moduleId}' =
      payload#>>'{fragment,moduleId}'
    and payload#>>'{authoringFragment,lessonId}' =
      payload#>>'{fragment,lessonId}'
  from first_formal_submission
), 'identificadores de curso, módulo e lição são preservados');
select is(
  (select payload#>>'{authoringFragment,microsequences,0,id}'
    from first_formal_submission),
  (select payload#>>'{fragment,microsequences,0,id}'
    from first_formal_submission),
  'identificador da microssequência é preservado entre fonte e compilado'
);
select is(
  (select payload#>>'{authoringFragment,microsequences,0,cards,0,id}'
    from first_formal_submission),
  (select payload#>>'{fragment,microsequences,0,cards,0,id}'
    from first_formal_submission),
  'identificador do card é preservado entre fonte e compilado'
);
select is(
  (select payload#>>'{authoringFragment,microsequences,0,cards,0,gaps,0,id}'
    from first_formal_submission),
  'resultado',
  'identificador formal da lacuna continua disponível para reparo'
);
select ok(
  (select payload->'fragment' from first_formal_submission)
    is distinct from
  (select payload->'authoringFragment' from first_formal_submission),
  'auditoria recebe o compilado sem confundir as duas representações'
);
select is(
  (select event.result->>'authoringFragmentHash'
   from private.authoring_command_events event
   where event.actor_user_id = 'fa000000-0000-4000-8000-000000000001'
     and event.request_id = 'formal-submit-0001'),
  (select payload->>'authoringFragmentHash' from first_formal_submission),
  'recibo idempotente conserva o hash formal no mesmo commit'
);

select is(
  public.dispatch_authoring_command_v2(
    'fa000000-0000-4000-8000-000000000001',
    null,
    'formal-submit-0001',
    'fa100000-0000-4000-8000-000000000001',
    'submit_part',
    'parte-formal',
    (select payload from formal_fragment_cases where version = 1)
  )->>'idempotent',
  'true',
  'repetição idêntica da submissão formal é idempotente'
);
select is((
  select count(*) from private.authoring_command_events
  where actor_user_id = 'fa000000-0000-4000-8000-000000000001'
    and request_id = 'formal-submit-0001'
), 1::bigint, 'idempotência conserva um único evento causal');
select is(
  public.get_authoring_part_submission_v2(
    'fa100000-0000-4000-8000-000000000001',
    'parte-formal',
    'fa000000-0000-4000-8000-000000000001'
  )->>'authoringFragmentHash',
  (select payload->>'authoringFragmentHash' from first_formal_submission),
  'repetição não recalcula nem substitui a fonte formal'
);

create temporary table formal_audit_payload(payload jsonb not null) on commit drop;
insert into formal_audit_payload(payload) values (jsonb_build_object(
  'expectedAttempt', 1,
  'submissionSha256', (
    select payload->>'fragmentHash' from first_formal_submission
  ),
  'decision', 'rebuild',
  'gates', jsonb_build_object(
    'planAlignment', false,
    'contract', true,
    'outcomeCoverage', true,
    'sources', true,
    'continuity', true,
    'interactionCoherence', true,
    'language', true,
    'fieldPreservation', true,
    'structuredElements', true,
    'feedback', true
  ),
  'findings', jsonb_build_array(jsonb_build_object(
    'issueId', 'formal-rebuild',
    'severity', 'error',
    'gate', 'planAlignment',
    'pointer', '/microsequences/0',
    'observed', 'A parte precisa ser reconstruída.',
    'requiredChange', 'Reconstruir sem trocar identificadores.',
    'preserveFields', jsonb_build_array('/microsequences/0/id'),
    'acceptanceTest', 'A nova tentativa conserva os identificadores.'
  )),
  'instructions', 'Reconstrua a parte a partir da fonte formal.'
));

select is(
  public.dispatch_authoring_command_v2(
    'fa000000-0000-4000-8000-000000000001',
    null,
    'formal-audit-rebuild-0001',
    'fa100000-0000-4000-8000-000000000001',
    'audit_part',
    'parte-formal',
    (select payload from formal_audit_payload)
  )->>'decision',
  'rebuild',
  'auditoria solicita rebuild'
);
select is(
  public.get_authoring_part_submission_v2(
    'fa100000-0000-4000-8000-000000000001',
    'parte-formal',
    'fa000000-0000-4000-8000-000000000001'
  )->>'fragment',
  null::text,
  'rebuild remove o fragmento compilado'
);
select is(
  public.get_authoring_part_submission_v2(
    'fa100000-0000-4000-8000-000000000001',
    'parte-formal',
    'fa000000-0000-4000-8000-000000000001'
  )->>'authoringFragment',
  null::text,
  'rebuild remove a fonte formal na mesma transação'
);
select ok((
  select fragment_hash is null
    and authoring_fragment_hash is null
  from private.authoring_parts
  where id = 'fa200000-0000-4000-8000-000000000001'
), 'rebuild limpa os dois hashes');

select is(
  public.dispatch_authoring_command_v2(
    'fa000000-0000-4000-8000-000000000001',
    null,
    'formal-submit-0002',
    'fa100000-0000-4000-8000-000000000001',
    'submit_part',
    'parte-formal',
    (select payload from formal_fragment_cases where version = 2)
  )->>'attempt',
  '2',
  'rebuild grava uma nova tentativa formal'
);
select is(
  public.get_authoring_part_submission_v2(
    'fa100000-0000-4000-8000-000000000001',
    'parte-formal',
    'fa000000-0000-4000-8000-000000000001'
  )->'authoringFragment',
  (select authoring_fragment from formal_fragment_cases where version = 2),
  'nova tentativa relê exatamente a nova fonte formal'
);

select is(
  public.dispatch_authoring_command_v2(
    'fa000000-0000-4000-8000-000000000001',
    null,
    'formal-submit-0001',
    'fa100000-0000-4000-8000-000000000001',
    'submit_part',
    'parte-formal',
    (select payload from formal_fragment_cases where version = 1)
  )->>'idempotent',
  'true',
  'resposta antiga continua idempotente depois da tentativa nova'
);
select is(
  public.get_authoring_part_submission_v2(
    'fa100000-0000-4000-8000-000000000001',
    'parte-formal',
    'fa000000-0000-4000-8000-000000000001'
  )->'authoringFragment',
  (select authoring_fragment from formal_fragment_cases where version = 2),
  'repetição antiga não sobrescreve a fonte formal da tentativa atual'
);

select * from finish();
rollback;
