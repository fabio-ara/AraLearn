begin;

-- Uma retomada conceitual só é válida quando a cadeia causal da parte alcança
-- um card aprovado que apresentou o conceito. O contexto transporta
-- identificadores, nunca inferências feitas a partir do texto dos cards.
create or replace function private.authoring_continuity_slice(
  p_run_id uuid,
  p_part_id uuid
)
returns jsonb
language sql
stable
set search_path = pg_catalog, private, extensions
as $$
  with recursive target as (
    select part.* from private.authoring_parts part where part.id = p_part_id
  ), dependency_keys(part_key) as (
    select dependency
    from target
    cross join lateral jsonb_array_elements_text(
      coalesce(target.outline->'dependsOnPartKeys', '[]'::jsonb)
    ) dependency
    union
    select nested_dependency
    from dependency_keys current
    join private.authoring_parts part
      on part.run_id = p_run_id and part.part_key = current.part_key
    cross join lateral jsonb_array_elements_text(
      coalesce(part.outline->'dependsOnPartKeys', '[]'::jsonb)
    ) nested_dependency
  ), dependencies as (
    select part.*
    from private.authoring_parts part
    where part.run_id = p_run_id
      and part.status = 'approved'
      and part.part_key in (select part_key from dependency_keys)
  ), state_rows as (
    select field.name, value
    from dependencies part
    cross join lateral (values
      ('introducedTermIds'), ('usedClaimIds'),
      ('coveredOutcomeIds'), ('resolvedErrorIds')
    ) field(name)
    cross join lateral jsonb_array_elements_text(
      coalesce(part.submission_meta->'stateDelta'->field.name, '[]'::jsonb)
    ) item(value)
  ), dependency_microsequences as (
    select distinct microsequence_id as id
    from dependencies part
    cross join lateral jsonb_array_elements_text(
      coalesce(part.specification->'ownership'->'microsequenceIds', '[]'::jsonb)
    ) item(microsequence_id)
  ), planned_cards as (
    select card
    from dependencies part
    cross join lateral jsonb_array_elements(
      coalesce(part.specification->'cardPlan', '[]'::jsonb)
    ) item(card)
  ), worked_operations as (
    select distinct
      card->>'operationId' as operation_id,
      card->>'microsequenceId' as microsequence_id
    from planned_cards
    where card->>'learningFunction' in ('foundation', 'worked_example')
      and nullif(card->>'operationId', '') is not null
      and nullif(card->>'microsequenceId', '') is not null
  ), introduced_concepts as (
    select distinct
      concept_id as concept_id,
      card->>'microsequenceId' as microsequence_id
    from planned_cards
    cross join lateral jsonb_array_elements_text(
      coalesce(card->'conceptIds', '[]'::jsonb)
    ) concept(concept_id)
    where card->>'learningFunction' in ('foundation', 'worked_example')
      and nullif(card->>'microsequenceId', '') is not null
      and not exists (
        select 1
        from jsonb_array_elements_text(
          coalesce(card->'retrievedConceptIds', '[]'::jsonb)
        ) retrieved(retrieved_id)
        where retrieved.retrieved_id = concept.concept_id
      )
  ), all_approved as (
    select part.part_key, part.fragment_hash,
      part.submission_meta->'stateDelta' as delta
    from private.authoring_parts part
    where part.run_id = p_run_id and part.status = 'approved'
    order by part.position
  )
  select jsonb_build_object(
    'approvedParts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partKey', part.part_key,
        'fragmentHash', part.fragment_hash
      ) order by part.position)
      from dependencies part
    ), '[]'::jsonb),
    'stateDelta', jsonb_build_object(
      'introducedTermIds', coalesce((
        select jsonb_agg(to_jsonb(value) order by value)
        from (
          select distinct value
          from state_rows
          where name = 'introducedTermIds'
        ) valueset
      ), '[]'::jsonb),
      'usedClaimIds', coalesce((
        select jsonb_agg(to_jsonb(value) order by value)
        from (
          select distinct value
          from state_rows
          where name = 'usedClaimIds'
        ) valueset
      ), '[]'::jsonb),
      'coveredOutcomeIds', coalesce((
        select jsonb_agg(to_jsonb(value) order by value)
        from (
          select distinct value
          from state_rows
          where name = 'coveredOutcomeIds'
        ) valueset
      ), '[]'::jsonb),
      'resolvedErrorIds', coalesce((
        select jsonb_agg(to_jsonb(value) order by value)
        from (
          select distinct value
          from state_rows
          where name = 'resolvedErrorIds'
        ) valueset
      ), '[]'::jsonb),
      'notes', '[]'::jsonb
    ),
    'dependencyMicrosequenceIds', coalesce((
      select jsonb_agg(to_jsonb(id) order by id)
      from dependency_microsequences
    ), '[]'::jsonb),
    'workedOperations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'operationId', operation_id,
        'microsequenceId', microsequence_id
      ) order by operation_id, microsequence_id)
      from worked_operations
    ), '[]'::jsonb),
    'introducedConcepts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'conceptId', concept_id,
        'microsequenceId', microsequence_id
      ) order by concept_id, microsequence_id)
      from introduced_concepts
    ), '[]'::jsonb),
    'stateHash', encode(extensions.digest(convert_to(coalesce((
      select jsonb_agg(jsonb_build_object(
        'partKey', part_key,
        'fragmentHash', fragment_hash,
        'stateDelta', delta
      ) order by part_key)
      from all_approved
    ), '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
  );
$$;

comment on function private.authoring_continuity_slice(uuid, uuid) is
  'Transporta somente termos, conceitos e operações apresentados em partes causais aprovadas.';

revoke execute on function private.authoring_continuity_slice(uuid, uuid)
  from public, anon, authenticated;

commit;
