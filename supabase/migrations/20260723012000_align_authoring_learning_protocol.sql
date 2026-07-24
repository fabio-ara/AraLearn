begin;

select pg_advisory_xact_lock(
  hashtextextended('aralearn-align-authoring-learning-protocol', 0)
);

-- O contrato público de autoria usa identificadores explícitos. Estas
-- validações não interpretam texto: apenas comprovam forma, unicidade e
-- integridade referencial entre plano, partes e cards planejados.
create or replace function private.authoring_plan_learning_references_are_valid(
  p_plan jsonb,
  p_parts jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_part jsonb;
  v_relation jsonb;
begin
  if jsonb_typeof(p_plan) is distinct from 'object'
     or jsonb_typeof(p_parts) is distinct from 'array'
     or jsonb_typeof(p_plan->'operations') is distinct from 'array'
     or jsonb_array_length(p_plan->'operations') = 0
     or jsonb_typeof(p_plan->'misconceptions') is distinct from 'array'
     or jsonb_typeof(p_plan->'conceptMap') is distinct from 'object'
     or jsonb_typeof(p_plan->'conceptMap'->'concepts') is distinct from 'array'
     or jsonb_array_length(p_plan->'conceptMap'->'concepts') = 0
     or jsonb_typeof(p_plan->'conceptMap'->'relations') is distinct from 'array'
  then
    return false;
  end if;

  if (select count(*) from jsonb_object_keys(p_plan->'conceptMap')) <> 2
     or exists (
       select 1
       from jsonb_object_keys(p_plan->'conceptMap') field
       where field not in ('concepts', 'relations')
     )
  then
    return false;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_plan->'operations')
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 4
       or exists (
         select 1 from jsonb_object_keys(v_item) field
         where field not in ('id', 'label', 'evidence', 'representation')
       )
       or nullif(btrim(v_item->>'id'), '') is null
       or nullif(btrim(v_item->>'label'), '') is null
       or nullif(btrim(v_item->>'evidence'), '') is null
       or jsonb_typeof(v_item->'representation') is distinct from 'object'
       or (
         select count(*)
         from jsonb_object_keys(v_item->'representation')
       ) <> 3
       or exists (
         select 1
         from jsonb_object_keys(v_item->'representation') field
         where field not in (
           'preferredResources', 'allowedResources', 'rationale'
         )
       )
       or jsonb_typeof(
         v_item->'representation'->'preferredResources'
       ) is distinct from 'array'
       or jsonb_array_length(
         v_item->'representation'->'preferredResources'
       ) not between 1 and 4
       or jsonb_typeof(
         v_item->'representation'->'allowedResources'
       ) is distinct from 'array'
       or jsonb_array_length(
         v_item->'representation'->'allowedResources'
       ) not between 1 and 12
       or nullif(btrim(v_item->'representation'->>'rationale'), '') is null
       or exists (
         select 1
         from jsonb_array_elements(
           v_item->'representation'->'preferredResources'
         ) resource
         where jsonb_typeof(resource) is distinct from 'string'
            or resource #>> '{}' not in (
              'paragraph', 'choice', 'composite', 'code', 'table', 'flow',
              'tree', 'graph', 'relation_map', 'matrix', 'plane', 'formula'
            )
       )
       or exists (
         select 1
         from jsonb_array_elements(
           v_item->'representation'->'allowedResources'
         ) resource
         where jsonb_typeof(resource) is distinct from 'string'
            or resource #>> '{}' not in (
              'paragraph', 'choice', 'composite', 'code', 'table', 'flow',
              'tree', 'graph', 'relation_map', 'matrix', 'plane', 'formula'
            )
       )
       or (
         select count(*) <> count(distinct resource #>> '{}')
         from jsonb_array_elements(
           v_item->'representation'->'preferredResources'
         ) resource
       )
       or (
         select count(*) <> count(distinct resource #>> '{}')
         from jsonb_array_elements(
           v_item->'representation'->'allowedResources'
         ) resource
       )
       or exists (
         select 1
         from jsonb_array_elements_text(
           v_item->'representation'->'preferredResources'
         ) preferred(resource)
         where not (
           v_item->'representation'->'allowedResources'
         ) ? preferred.resource
       )
    then
      return false;
    end if;
  end loop;
  if (
    select count(*) <> count(distinct item->>'id')
    from jsonb_array_elements(p_plan->'operations') item
  ) then
    return false;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_plan->'misconceptions')
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 3
       or exists (
         select 1 from jsonb_object_keys(v_item) field
         where field not in ('id', 'statement', 'correctionEvidence')
       )
       or nullif(btrim(v_item->>'id'), '') is null
       or nullif(btrim(v_item->>'statement'), '') is null
       or nullif(btrim(v_item->>'correctionEvidence'), '') is null
    then
      return false;
    end if;
  end loop;
  if (
    select count(*) <> count(distinct item->>'id')
    from jsonb_array_elements(p_plan->'misconceptions') item
  ) then
    return false;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_plan->'conceptMap'->'concepts')
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 2
       or exists (
         select 1 from jsonb_object_keys(v_item) field
         where field not in ('id', 'label')
       )
       or nullif(btrim(v_item->>'id'), '') is null
       or nullif(btrim(v_item->>'label'), '') is null
    then
      return false;
    end if;
  end loop;
  if (
    select count(*) <> count(distinct item->>'id')
    from jsonb_array_elements(p_plan->'conceptMap'->'concepts') item
  ) then
    return false;
  end if;

  for v_relation in
    select value
    from jsonb_array_elements(p_plan->'conceptMap'->'relations')
  loop
    if jsonb_typeof(v_relation) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_relation)) <> 3
       or exists (
         select 1 from jsonb_object_keys(v_relation) field
         where field not in ('from', 'to', 'relation')
       )
       or nullif(btrim(v_relation->>'from'), '') is null
       or nullif(btrim(v_relation->>'to'), '') is null
       or v_relation->>'from' = v_relation->>'to'
       or v_relation->>'relation' not in (
         'requires', 'part_of', 'contrasts',
         'represents', 'applies', 'causes'
       )
       or not exists (
         select 1
         from jsonb_array_elements(p_plan->'conceptMap'->'concepts') concept
         where concept->>'id' = v_relation->>'from'
       )
       or not exists (
         select 1
         from jsonb_array_elements(p_plan->'conceptMap'->'concepts') concept
         where concept->>'id' = v_relation->>'to'
       )
    then
      return false;
    end if;
  end loop;

  for v_part in select value from jsonb_array_elements(p_parts)
  loop
    if jsonb_typeof(v_part) is distinct from 'object'
       or jsonb_typeof(v_part->'conceptIds') is distinct from 'array'
       or jsonb_array_length(v_part->'conceptIds') = 0
       or jsonb_typeof(v_part->'operationIds') is distinct from 'array'
       or jsonb_array_length(v_part->'operationIds') = 0
       or jsonb_typeof(v_part->'misconceptionIds') is distinct from 'array'
    then
      return false;
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_part->'conceptIds') value
      where jsonb_typeof(value) is distinct from 'string'
         or nullif(btrim(value #>> '{}'), '') is null
    ) or exists (
      select 1 from jsonb_array_elements(v_part->'operationIds') value
      where jsonb_typeof(value) is distinct from 'string'
         or nullif(btrim(value #>> '{}'), '') is null
    ) or exists (
      select 1 from jsonb_array_elements(v_part->'misconceptionIds') value
      where jsonb_typeof(value) is distinct from 'string'
         or nullif(btrim(value #>> '{}'), '') is null
    ) then
      return false;
    end if;

    if (
      select count(*) <> count(distinct value #>> '{}')
      from jsonb_array_elements(v_part->'conceptIds') value
    ) or (
      select count(*) <> count(distinct value #>> '{}')
      from jsonb_array_elements(v_part->'operationIds') value
    ) or (
      select count(*) <> count(distinct value #>> '{}')
      from jsonb_array_elements(v_part->'misconceptionIds') value
    ) then
      return false;
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(v_part->'conceptIds') reference(id)
      where not exists (
        select 1
        from jsonb_array_elements(p_plan->'conceptMap'->'concepts') concept
        where concept->>'id' = reference.id
      )
    ) or exists (
      select 1
      from jsonb_array_elements_text(v_part->'operationIds') reference(id)
      where not exists (
        select 1
        from jsonb_array_elements(p_plan->'operations') operation
        where operation->>'id' = reference.id
      )
    ) or exists (
      select 1
      from jsonb_array_elements_text(v_part->'misconceptionIds') reference(id)
      where not exists (
        select 1
        from jsonb_array_elements(p_plan->'misconceptions') misconception
        where misconception->>'id' = reference.id
      )
    ) then
      return false;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_plan->'operations') operation
    where not exists (
      select 1
      from jsonb_array_elements(p_parts) part
      cross join lateral jsonb_array_elements_text(
        part->'operationIds'
      ) reference(id)
      where reference.id = operation->>'id'
    )
  ) or exists (
    select 1
    from jsonb_array_elements(p_plan->'conceptMap'->'concepts') concept
    where not exists (
      select 1
      from jsonb_array_elements(p_parts) part
      cross join lateral jsonb_array_elements_text(
        part->'conceptIds'
      ) reference(id)
      where reference.id = concept->>'id'
    )
  ) or exists (
    select 1
    from jsonb_array_elements(p_plan->'misconceptions') misconception
    where not exists (
      select 1
      from jsonb_array_elements(p_parts) part
      cross join lateral jsonb_array_elements_text(
        part->'misconceptionIds'
      ) reference(id)
      where reference.id = misconception->>'id'
    )
  ) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function private.authoring_part_learning_references_are_valid(
  p_plan jsonb,
  p_outline jsonb,
  p_specification jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_card jsonb;
  v_field text;
  v_ids jsonb;
begin
  if jsonb_typeof(p_plan) is distinct from 'object'
     or jsonb_typeof(p_outline) is distinct from 'object'
     or jsonb_typeof(p_specification) is distinct from 'object'
     or jsonb_typeof(p_specification->'cardPlan') is distinct from 'array'
  then
    return false;
  end if;

  foreach v_field in array array[
    'outcomeIds', 'conceptIds', 'operationIds', 'misconceptionIds'
  ] loop
    v_ids := p_specification->v_field;
    if jsonb_typeof(v_ids) is distinct from 'array'
       or (
         v_field <> 'misconceptionIds'
         and jsonb_array_length(v_ids) = 0
       )
       or exists (
         select 1 from jsonb_array_elements(v_ids) value
         where jsonb_typeof(value) is distinct from 'string'
            or nullif(btrim(value #>> '{}'), '') is null
       )
       or (
         select count(*) <> count(distinct value #>> '{}')
         from jsonb_array_elements(v_ids) value
       )
       or p_outline->v_field is distinct from v_ids
    then
      return false;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements_text(p_specification->'outcomeIds') reference(id)
    where not exists (
      select 1 from jsonb_array_elements(p_plan->'learningOutcomes') outcome
      where outcome->>'id' = reference.id
    )
  ) or exists (
    select 1
    from jsonb_array_elements_text(p_specification->'conceptIds') reference(id)
    where not exists (
      select 1
      from jsonb_array_elements(p_plan->'conceptMap'->'concepts') concept
      where concept->>'id' = reference.id
    )
  ) or exists (
    select 1
    from jsonb_array_elements_text(p_specification->'operationIds') reference(id)
    where not exists (
      select 1 from jsonb_array_elements(p_plan->'operations') operation
      where operation->>'id' = reference.id
    )
  ) or exists (
    select 1
    from jsonb_array_elements_text(
      p_specification->'misconceptionIds'
    ) reference(id)
    where not exists (
      select 1
      from jsonb_array_elements(p_plan->'misconceptions') misconception
      where misconception->>'id' = reference.id
    )
  ) then
    return false;
  end if;

  for v_card in
    select value from jsonb_array_elements(p_specification->'cardPlan')
  loop
    if jsonb_typeof(v_card) is distinct from 'object'
       or nullif(btrim(v_card->>'operationId'), '') is null
       or jsonb_typeof(v_card->'outcomeIds') is distinct from 'array'
       or jsonb_array_length(v_card->'outcomeIds') = 0
       or jsonb_typeof(v_card->'conceptIds') is distinct from 'array'
       or jsonb_array_length(v_card->'conceptIds') = 0
       or jsonb_typeof(v_card->'retrievedConceptIds') is distinct from 'array'
       or jsonb_typeof(v_card->'misconceptionIds') is distinct from 'array'
       or nullif(btrim(v_card->>'resource'), '') is null
    then
      return false;
    end if;

    foreach v_field in array array[
      'outcomeIds', 'conceptIds', 'retrievedConceptIds', 'misconceptionIds'
    ] loop
      v_ids := v_card->v_field;
      if exists (
        select 1 from jsonb_array_elements(v_ids) value
        where jsonb_typeof(value) is distinct from 'string'
           or nullif(btrim(value #>> '{}'), '') is null
      ) or (
        select count(*) <> count(distinct value #>> '{}')
        from jsonb_array_elements(v_ids) value
      ) then
        return false;
      end if;
    end loop;

    if not (
         (p_specification->'operationIds') ? (v_card->>'operationId')
       )
       or exists (
         select 1
         from jsonb_array_elements_text(v_card->'outcomeIds') reference(id)
         where not ((p_specification->'outcomeIds') ? reference.id)
       )
       or exists (
         select 1
         from jsonb_array_elements_text(v_card->'conceptIds') reference(id)
         where not ((p_specification->'conceptIds') ? reference.id)
       )
       or exists (
         select 1
         from jsonb_array_elements_text(
           v_card->'retrievedConceptIds'
         ) reference(id)
         where not ((p_specification->'conceptIds') ? reference.id)
       )
       or exists (
         select 1
         from jsonb_array_elements_text(
           v_card->'misconceptionIds'
         ) reference(id)
         where not ((p_specification->'misconceptionIds') ? reference.id)
       )
       or (
         v_card->>'learningFunction' = 'error_diagnosis'
         and jsonb_array_length(v_card->'misconceptionIds') = 0
       )
       or not exists (
         select 1
         from jsonb_array_elements(p_plan->'operations') operation
         where operation->>'id' = v_card->>'operationId'
           and (
             operation->'representation'->'allowedResources'
           ) ? (v_card->>'resource')
       )
    then
      return false;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements_text(
      p_specification->'operationIds'
    ) operation_reference(id)
    join lateral (
      select operation
      from jsonb_array_elements(p_plan->'operations') operation
      where operation->>'id' = operation_reference.id
    ) selected on true
    where not exists (
      select 1
      from jsonb_array_elements(p_specification->'cardPlan') card
      where card->>'operationId' = operation_reference.id
        and (
          selected.operation->'representation'->'preferredResources'
        ) ? (card->>'resource')
    )
       or (
         exists (
           select 1
           from jsonb_array_elements(p_specification->'cardPlan') card
           where card->>'operationId' = operation_reference.id
             and card->>'kind' = 'exercise'
         )
         and not exists (
           select 1
           from jsonb_array_elements(p_specification->'cardPlan') card
           where card->>'operationId' = operation_reference.id
             and card->>'kind' = 'exercise'
             and (
               selected.operation->'representation'->'preferredResources'
             ) ? (card->>'resource')
         )
       )
  ) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

-- A função transacional é extensa e já está implantada. A migration altera
-- somente os pontos exatos do protocolo; se a definição de origem divergir,
-- a transação falha antes de instalar uma adaptação incompleta.
do $migration$
declare
  v_definition text;
  v_previous text;
begin
  v_definition := pg_get_functiondef(
    'public.apply_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
  );

  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$or jsonb_array_length(v_plan->'learningOutcomes') = 0$old$,
    $new$or jsonb_array_length(v_plan->'learningOutcomes') = 0
         or not private.authoring_plan_learning_references_are_valid(
           v_plan, v_parts
         )$new$
  );
  if v_definition = v_previous then
    raise exception
      'Não foi possível localizar a validação principal de set_plan.';
  end if;

  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$(select count(*) from jsonb_object_keys(v_item)) <> 8$old$,
    $new$(select count(*) from jsonb_object_keys(v_item)) <> 11$new$
  );
  if v_definition = v_previous then
    raise exception
      'Não foi possível localizar a contagem de campos do contorno em set_plan.';
  end if;

  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$'ownership', 'cardIds', 'outcomeIds'$old$,
    $new$'ownership', 'cardIds', 'outcomeIds', 'conceptIds',
             'operationIds', 'misconceptionIds'$new$
  );
  if v_definition = v_previous then
    raise exception
      'Não foi possível localizar os campos permitidos do contorno em set_plan.';
  end if;

  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$'outcomeIds', v_item->'outcomeIds'$old$,
    $new$'outcomeIds', v_item->'outcomeIds',
          'conceptIds', v_item->'conceptIds',
          'operationIds', v_item->'operationIds',
          'misconceptionIds', v_item->'misconceptionIds'$new$
  );
  if v_definition = v_previous then
    raise exception
      'Não foi possível preservar os identificadores pedagógicos no contorno.';
  end if;

  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$or jsonb_typeof(v_specification->'cardPlan') <> 'array' then$old$,
    $new$or jsonb_typeof(v_specification->'cardPlan') <> 'array'
         or not private.authoring_part_learning_references_are_valid(
           v_run.plan, v_part.outline, v_specification
         ) then$new$
  );
  if v_definition = v_previous then
    raise exception
      'Não foi possível localizar a validação de set_part_specification.';
  end if;

  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$'outcomeIds', coalesce(v_specification->'outcomeIds', '[]'::jsonb)$old$,
    $new$'outcomeIds', coalesce(v_specification->'outcomeIds', '[]'::jsonb),
        'conceptIds', coalesce(v_specification->'conceptIds', '[]'::jsonb),
        'operationIds', coalesce(v_specification->'operationIds', '[]'::jsonb),
        'misconceptionIds',
          coalesce(v_specification->'misconceptionIds', '[]'::jsonb)$new$
  );
  if v_definition = v_previous then
    raise exception
      'Não foi possível reconstruir o contorno pedagógico da especificação.';
  end if;

  execute v_definition;

  v_definition := pg_get_functiondef(
    'public.apply_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
  );
  if position(
       'private.authoring_plan_learning_references_are_valid' in v_definition
     ) = 0
     or position(
       'private.authoring_part_learning_references_are_valid' in v_definition
     ) = 0
     or position('''conceptIds'', v_item->''conceptIds''' in v_definition) = 0
     or position(
       '''operationIds'', coalesce(v_specification->''operationIds'''
       in v_definition
     ) = 0
  then
    raise exception 'A adaptação do protocolo de autoria ficou incompleta.';
  end if;
end;
$migration$;

revoke all on function
  private.authoring_plan_learning_references_are_valid(jsonb,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  private.authoring_part_learning_references_are_valid(jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;

comment on function
  private.authoring_plan_learning_references_are_valid(jsonb,jsonb) is
  'Valida forma e referências explícitas de conceitos, operações e concepções no plano.';
comment on function
  private.authoring_part_learning_references_are_valid(jsonb,jsonb,jsonb) is
  'Valida referências pedagógicas explícitas entre plano, parte e cards planejados.';

commit;
