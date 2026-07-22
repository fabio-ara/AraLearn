begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_column('public', 'cards', 'language_tag', 'card registra idioma do recurso');
select has_column('public', 'cards', 'text_direction', 'card registra direção do recurso');
select has_column('public', 'cards', 'has_language_tag', 'card preserva presença de languageTag');
select has_column('public', 'cards', 'has_text_direction', 'card preserva presença de textDirection');
select has_column('public', 'card_blocks', 'language_tag', 'bloco registra idioma próprio');
select has_column('public', 'card_blocks', 'text_direction', 'bloco registra direção própria');
select has_column('public', 'card_blocks', 'has_language_tag', 'bloco preserva presença de languageTag');
select has_column('public', 'card_blocks', 'has_text_direction', 'bloco preserva presença de textDirection');

select col_not_null('public', 'cards', 'has_language_tag', 'presença de idioma no card não aceita nulo');
select col_not_null('public', 'cards', 'has_text_direction', 'presença de direção no card não aceita nulo');
select col_default_is('public', 'cards', 'has_language_tag', 'false', 'cards anteriores omitem languageTag');
select col_default_is('public', 'cards', 'has_text_direction', 'false', 'cards anteriores omitem textDirection');
select col_default_is('public', 'card_blocks', 'has_language_tag', 'false', 'blocos anteriores omitem languageTag');
select col_default_is('public', 'card_blocks', 'has_text_direction', 'false', 'blocos anteriores omitem textDirection');

select ok(exists(
  select 1 from pg_constraint
  where conrelid = 'public.cards'::regclass
    and conname = 'cards_language_tag_shape'
    and contype = 'c' and convalidated
), 'cards validam a forma conservadora de BCP 47');
select ok(exists(
  select 1 from pg_constraint
  where conrelid = 'public.cards'::regclass
    and conname = 'cards_text_direction_shape'
    and contype = 'c' and convalidated
), 'cards restringem a direção de texto');
select ok(exists(
  select 1 from pg_constraint
  where conrelid = 'public.card_blocks'::regclass
    and conname = 'card_blocks_language_metadata_presence'
    and contype = 'c' and convalidated
), 'blocos mantêm os indicadores de presença coerentes');

select ok(
  private.personal_tree_payload_key_allowed('cards', 'language_tag')
  and private.personal_tree_payload_key_allowed('cards', 'has_language_tag')
  and private.personal_tree_payload_key_allowed('blocks', 'text_direction')
  and private.personal_tree_payload_key_allowed('blocks', 'has_text_direction'),
  'sincronização granular admite os novos campos nas linhas pessoais'
);

select is(
  private.local_row(
    'cards',
    jsonb_build_object(
      'language_tag', 'ar',
      'text_direction', 'rtl',
      'has_language_tag', true,
      'has_text_direction', true,
      'created_at', '2026-07-23T00:00:00Z'
    )
  ),
  jsonb_build_object(
    'languageTag', 'ar',
    'textDirection', 'rtl',
    'hasLanguageTag', true,
    'hasTextDirection', true
  ),
  'réplica recebe metadados de idioma do card em camelCase'
);

select * from finish();
rollback;
