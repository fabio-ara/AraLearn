begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select hasnt_column(
  'public',
  'node_practice_items',
  'regex',
  'variantes de fluxograma não armazenam expressão regular'
);
select hasnt_column(
  'public',
  'node_practice_items',
  'has_regex',
  'variantes de fluxograma não preservam presença de expressão regular'
);

select ok(
  pg_get_functiondef(
    'private.local_row(text,jsonb)'::regprocedure
  ) not like '%hasRegex%',
  'réplica local não projeta o campo removido'
);
select ok(
  pg_get_functiondef(
    'private.local_row(text,jsonb)'::regprocedure
  ) not like '%''regex''%',
  'serialização da réplica não conserva a chave removida'
);

select is(
  private.local_row(
    'flowPracticeVariants',
    jsonb_build_object(
      'item_kind', 'variant',
      'value', 'Resposta literal',
      'enabled', true,
      'has_enabled', true,
      'created_at', '2026-07-23T00:00:00Z'
    )
  ),
  '{"value":"Resposta literal"}'::jsonb,
  'variante literal continua sendo projetada sem metadado obsoleto'
);

select throws_ok(
  $call$
    select private.shape_store_payload(
      'flowPracticeVariants',
      '{"value":"^resposta$","regex":true}'::jsonb,
      'insert'
    )
  $call$,
  '22023',
  'Variantes de fluxograma aceitam somente respostas literais.',
  'payload com regex é rejeitado em vez de perder semântica silenciosamente'
);
select throws_ok(
  $call$
    select private.shape_store_payload(
      'flowPracticeVariants',
      '{"value":"Resposta","has_regex":true}'::jsonb,
      'insert'
    )
  $call$,
  '22023',
  'Variantes de fluxograma aceitam somente respostas literais.',
  'payload com marcador de presença antigo também é rejeitado'
);

select is(
  private.shape_store_payload(
    'flowPracticeVariants',
    '{"value":"Resposta literal"}'::jsonb,
    'insert'
  ),
  '{
    "value":"Resposta literal",
    "item_kind":"variant",
    "flow_practice_id":null
  }'::jsonb,
  'payload literal continua aceito'
);

select * from finish();
rollback;
