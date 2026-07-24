begin;

-- O lint hospedado verifica SQL estático antes de cada função criar as tabelas
-- temporárias usadas como área de trabalho. Estes modelos privados permanecem
-- vazios: em runtime, a tabela TEMP de mesmo nome tem precedência no search
-- path e é descartada no commit. Eles existem apenas para permitir que o
-- analisador confira colunas e chaves reais.
create table if not exists private.aralearn_desired_learning_components (
  component_key text not null,
  component_type text not null,
  label text,
  description text,
  criterion text,
  language_tag text,
  position integer not null,
  primary key(component_key, component_type)
);

create table if not exists private.aralearn_desired_learning_relations (
  from_component_id uuid not null,
  to_component_id uuid not null,
  relation_kind text not null,
  position integer not null,
  primary key(from_component_id, to_component_id, relation_kind)
);

create table if not exists private.aralearn_planned_learning_cards (
  card_id uuid,
  microsequence_id uuid,
  operation_key text,
  learning_function text,
  learning_role text,
  support_level text,
  evidence_statement text,
  variation_focus text,
  target_error text,
  outcome_keys text[],
  concept_keys text[],
  retrieved_concept_keys text[],
  misconception_keys text[],
  introduced_term_keys text[],
  required_term_keys text[],
  position integer not null
);

create table if not exists private.aralearn_desired_learning_placements (
  component_id uuid not null,
  microsequence_id uuid not null,
  card_id uuid not null,
  learning_role text not null,
  learning_function text,
  support_level text,
  evidence_statement text,
  variation_focus text,
  target_error text,
  position integer not null,
  primary key(component_id, microsequence_id, card_id, learning_role)
);

create table if not exists private.course_revision_expected_entities (
  table_name text not null,
  entity_id uuid not null,
  primary key(table_name, entity_id)
);

revoke all on table private.aralearn_desired_learning_components,
  private.aralearn_desired_learning_relations,
  private.aralearn_planned_learning_cards,
  private.aralearn_desired_learning_placements,
  private.course_revision_expected_entities
from public, anon, authenticated, service_role;

comment on table private.aralearn_desired_learning_components is
  'Modelo vazio para análise estática de tabela temporária; não contém dados operacionais.';
comment on table private.aralearn_desired_learning_relations is
  'Modelo vazio para análise estática de tabela temporária; não contém dados operacionais.';
comment on table private.aralearn_planned_learning_cards is
  'Modelo vazio para análise estática de tabela temporária; não contém dados operacionais.';
comment on table private.aralearn_desired_learning_placements is
  'Modelo vazio para análise estática de tabela temporária; não contém dados operacionais.';
comment on table private.course_revision_expected_entities is
  'Modelo vazio para análise estática de tabela temporária; não contém dados operacionais.';

commit;
