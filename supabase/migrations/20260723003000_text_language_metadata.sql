begin;

alter table public.cards
  add column if not exists language_tag text,
  add column if not exists text_direction text,
  add column if not exists has_language_tag boolean not null default false,
  add column if not exists has_text_direction boolean not null default false;

alter table public.card_blocks
  add column if not exists language_tag text,
  add column if not exists text_direction text,
  add column if not exists has_language_tag boolean not null default false,
  add column if not exists has_text_direction boolean not null default false;

alter table public.cards
  drop constraint if exists cards_language_tag_shape,
  drop constraint if exists cards_text_direction_shape,
  drop constraint if exists cards_language_metadata_presence;
alter table public.cards
  add constraint cards_language_tag_shape check (
    language_tag is null or (
      language_tag = btrim(language_tag)
      and length(language_tag) <= 63
      and language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$'
    )
  ),
  add constraint cards_text_direction_shape check (
    text_direction is null or text_direction in ('auto', 'ltr', 'rtl')
  ),
  add constraint cards_language_metadata_presence check (
    has_language_tag = (language_tag is not null)
    and has_text_direction = (text_direction is not null)
  );

alter table public.card_blocks
  drop constraint if exists card_blocks_language_tag_shape,
  drop constraint if exists card_blocks_text_direction_shape,
  drop constraint if exists card_blocks_language_metadata_presence;
alter table public.card_blocks
  add constraint card_blocks_language_tag_shape check (
    language_tag is null or (
      language_tag = btrim(language_tag)
      and length(language_tag) <= 63
      and language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$'
    )
  ),
  add constraint card_blocks_text_direction_shape check (
    text_direction is null or text_direction in ('auto', 'ltr', 'rtl')
  ),
  add constraint card_blocks_language_metadata_presence check (
    has_language_tag = (language_tag is not null)
    and has_text_direction = (text_direction is not null)
  );

comment on column public.cards.language_tag is
  'Idioma predominante do recurso, em uma etiqueta BCP 47 conservadora.';
comment on column public.cards.text_direction is
  'Direção do texto do recurso: auto, ltr ou rtl.';
comment on column public.cards.has_language_tag is
  'Preserva a diferença entre languageTag omitido e informado no contrato.';
comment on column public.cards.has_text_direction is
  'Preserva a diferença entre textDirection omitido e informado no contrato.';
comment on column public.card_blocks.language_tag is
  'Idioma predominante do bloco composto, em uma etiqueta BCP 47 conservadora.';
comment on column public.card_blocks.text_direction is
  'Direção do texto do bloco composto: auto, ltr ou rtl.';
comment on column public.card_blocks.has_language_tag is
  'Preserva a diferença entre languageTag omitido e informado no bloco.';
comment on column public.card_blocks.has_text_direction is
  'Preserva a diferença entre textDirection omitido e informado no bloco.';

commit;
