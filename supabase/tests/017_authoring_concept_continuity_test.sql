begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_function(
  'private',
  'authoring_continuity_slice',
  array['uuid', 'uuid'],
  'continuidade de autoria possui consulta causal por parte'
);

select ok(
  position(
    '''introducedConcepts'''
    in pg_get_functiondef(
      'private.authoring_continuity_slice(uuid,uuid)'::regprocedure
    )
  ) > 0,
  'continuidade transporta os conceitos apresentados'
);

select ok(
  position(
    'card->''retrievedConceptIds'''
    in pg_get_functiondef(
      'private.authoring_continuity_slice(uuid,uuid)'::regprocedure
    )
  ) > 0,
  'conceito já marcado como retomado não é registrado como nova introdução'
);

select ok(
  position(
    'part.status = ''approved'''
    in pg_get_functiondef(
      'private.authoring_continuity_slice(uuid,uuid)'::regprocedure
    )
  ) > 0,
  'somente partes aprovadas alimentam a continuidade'
);

select ok(
  position(
    'card->>''learningFunction'' in (''foundation'', ''worked_example'')'
    in pg_get_functiondef(
      'private.authoring_continuity_slice(uuid,uuid)'::regprocedure
    )
  ) > 0,
  'continuidade causal transporta operações fundadas e exemplos resolvidos'
);

select ok(not has_function_privilege(
  'anon',
  'private.authoring_continuity_slice(uuid,uuid)',
  'EXECUTE'
), 'anon não consulta continuidade privada');

select ok(not has_function_privilege(
  'authenticated',
  'private.authoring_continuity_slice(uuid,uuid)',
  'EXECUTE'
), 'authenticated não contorna o gateway para consultar continuidade');

select * from finish();
rollback;
