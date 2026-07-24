begin;

select pg_advisory_xact_lock(
  hashtextextended('aralearn-remove-flow-regex-variants', 0)
);

do $$
begin
  if exists (
    select 1
    from public.node_practice_items item
    where item.regex or item.has_regex
  ) then
    raise exception
      'Há variantes de fluxograma com semântica regex. Substitua-as por respostas literais antes de aplicar a migration.'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.node_practice_items
  drop column regex,
  drop column has_regex;

create or replace function private.shape_store_payload(
  p_store_name text,
  p_payload jsonb,
  p_operation text default 'insert'
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_identity text := coalesce(
    nullif(p_payload ->> 'identity_key', ''),
    nullif(p_payload ->> 'id', '')
  );
begin
  if p_store_name in (
    'flowPracticeOptions',
    'flowPracticeVariants',
    'flowShapeOptions'
  ) and v_payload ?| array['regex', 'has_regex', 'hasRegex'] then
    raise exception
      'Variantes de fluxograma aceitam somente respostas literais.'
      using errcode = '22023';
  end if;

  return v_payload || case p_store_name
    when 'guides' then case
      when p_payload ?| array['owner_type','owner_id'] then jsonb_build_object(
        'module_id', case
          when p_payload ->> 'owner_type' = 'module'
            then p_payload -> 'owner_id'
          else 'null'::jsonb
        end,
        'lesson_id', case
          when p_payload ->> 'owner_type' = 'lesson'
            then p_payload -> 'owner_id'
          else 'null'::jsonb
        end
      )
      else '{}'::jsonb
    end
    when 'guideItems' then case
      when p_payload ? 'item_type'
        then jsonb_build_object('item_kind', p_payload -> 'item_type')
      else '{}'::jsonb
    end
    when 'topics' then case
      when p_payload ? 'topic_kind'
        then jsonb_build_object('kind', p_payload -> 'topic_kind')
      else '{}'::jsonb
    end
    when 'topicStatements' then case
      when p_payload ? 'statement_type'
        then jsonb_build_object(
          'statement_kind',
          p_payload -> 'statement_type'
        )
      else '{}'::jsonb
    end
    when 'microsequenceStatements' then case
      when p_payload ? 'statement_type'
        then jsonb_build_object(
          'statement_kind',
          p_payload -> 'statement_type'
        )
      else '{}'::jsonb
    end
    when 'cards' then
      (
        case
          when p_payload ? 'card_kind'
            then jsonb_build_object('kind', p_payload -> 'card_kind')
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'after'
            then jsonb_build_object('after_text', p_payload -> 'after')
          when p_operation = 'insert'
            then jsonb_build_object('after_text', '')
          else '{}'::jsonb
        end
      )
    when 'blocks' then
      (
        case
          when p_payload ?| array['contract_key','id']
            then jsonb_build_object(
              'contract_key',
              coalesce(nullif(p_payload ->> 'contract_key', ''), v_identity)
            )
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'region'
            then jsonb_build_object(
              'role',
              case p_payload ->> 'region'
                when 'content' then 'composite'
                else p_payload ->> 'region'
              end
            )
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'value'
            then jsonb_build_object('value_text', p_payload -> 'value')
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'scale_k'
            then jsonb_build_object('scale_factor', p_payload -> 'scale_k')
          else '{}'::jsonb
        end
      )
    when 'options' then case
      when p_payload ? 'text'
        then jsonb_build_object('text_value', p_payload -> 'text')
      else '{}'::jsonb
    end
    when 'flowPractices' then case
      when p_payload ?| array['owner_type','owner_id'] then jsonb_build_object(
        'flow_node_id', case
          when p_payload ->> 'owner_type' = 'node'
            then p_payload -> 'owner_id'
          else 'null'::jsonb
        end,
        'flow_case_id', case
          when p_payload ->> 'owner_type' = 'case'
            then p_payload -> 'owner_id'
          else 'null'::jsonb
        end
      )
      else '{}'::jsonb
    end
    when 'flowPracticeOptions' then case
      when p_operation = 'insert' then jsonb_build_object(
        'item_kind',
        'option',
        'flow_practice_id',
        null
      )
      else '{}'::jsonb
    end
    when 'flowPracticeVariants' then case
      when p_operation = 'insert' then jsonb_build_object(
        'item_kind',
        'variant',
        'flow_practice_id',
        null
      )
      else '{}'::jsonb
    end
    when 'flowShapeOptions' then
      (
        case
          when p_operation = 'insert' then jsonb_build_object(
            'entry_id',
            null,
            'item_kind',
            'shape_option'
          )
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'practice_id' then jsonb_build_object(
            'flow_practice_id',
            p_payload -> 'practice_id'
          )
          else '{}'::jsonb
        end
      )
    when 'edges' then
      (
        case
          when p_payload ?| array['identity_key','id']
            then jsonb_build_object('contract_key', v_identity)
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'edge_scope'
            then jsonb_build_object(
              'edge_role',
              p_payload -> 'edge_scope'
            )
          else '{}'::jsonb
        end
      )
    when 'matrixItems' then
      (
        case
          when p_payload ?| array['identity_key','id']
            then jsonb_build_object('contract_key', v_identity)
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'is_sequence' then jsonb_build_object(
            'item_kind',
            case
              when coalesce(
                (p_payload ->> 'is_sequence')::boolean,
                false
              ) then 'sequence'
              else 'matrix'
            end
          )
          else '{}'::jsonb
        end
      )
    when 'cells' then case
      when p_payload ? 'row_index' then jsonb_build_object(
        'cell_role',
        case
          when (p_payload ->> 'row_index')::integer = -1
            then 'header'
          else 'value'
        end
      )
      else '{}'::jsonb
    end
    when 'points' then
      (
        case
          when p_payload ?| array['identity_key','id']
            then jsonb_build_object('contract_key', v_identity)
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'point_role'
            then jsonb_build_object(
              'point_kind',
              p_payload -> 'point_role'
            )
          else '{}'::jsonb
        end
      )
    when 'lines' then
      (
        case
          when p_payload ?| array['identity_key','id']
            then jsonb_build_object('contract_key', v_identity)
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'line_role'
            then jsonb_build_object(
              'line_kind',
              p_payload -> 'line_role'
            )
          else '{}'::jsonb
        end
      )
    when 'highlights' then
      (
        case
          when p_payload ? 'selection_type' then jsonb_build_object(
            'target_kind',
            case p_payload ->> 'selection_type'
              when 'leftItem' then 'left_item'
              when 'rightItem' then 'right_item'
              when 'vertex' then 'node'
              else p_payload ->> 'selection_type'
            end
          )
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'value'
            then jsonb_build_object('text_value', p_payload -> 'value')
          else '{}'::jsonb
        end
      )
    when 'cardSources' then case
      when p_operation = 'insert'
        then jsonb_build_object('ref_kind', 'source')
      else '{}'::jsonb
    end
    when 'cardTopics' then
      (
        case
          when p_operation = 'insert'
            then jsonb_build_object('ref_kind', 'topic')
          else '{}'::jsonb
        end
      ) ||
      (
        case
          when p_payload ? 'topic_contract_key'
            then jsonb_build_object(
              'value',
              p_payload -> 'topic_contract_key'
            )
          else '{}'::jsonb
        end
      )
    else '{}'::jsonb
  end;
end;
$$;

create or replace function private.local_row(
  p_store_name text,
  p_row jsonb
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, private
as $$
declare
  v_row jsonb := private.jsonb_to_camel(p_row);
  v_common_server text[] := array['createdAt'];
begin
  if p_store_name = 'courses' then
    return (v_row - 'createdAt')
      || jsonb_build_object('courseId', p_row -> 'id');
  elsif p_store_name = 'memberships' then
    return v_row - array['createdAt'];
  elsif p_store_name in (
    'modules',
    'lessons',
    'microsequences',
    'dependencies'
  ) then
    return v_row - v_common_server;
  elsif p_store_name = 'microsequenceStatements' then
    return v_row - array['statementKind','createdAt'];
  elsif p_store_name = 'guides' then
    return v_row - array['moduleId','lessonId','createdAt'];
  elsif p_store_name = 'guideItems' then
    return v_row - array['itemKind','createdAt'];
  elsif p_store_name = 'topics' then
    return v_row - array['kind','createdAt'];
  elsif p_store_name = 'topicStatements' then
    return v_row - array['statementKind','createdAt'];
  elsif p_store_name = 'cards' then
    return v_row - array['kind','afterText','createdAt'];
  elsif p_store_name = 'blocks' then
    return v_row - array[
      'contractKey',
      'parentBlockId',
      'role',
      'valueText',
      'scaleFactor',
      'createdAt'
    ];
  elsif p_store_name = 'options' then
    return v_row - array['textValue','enabled','createdAt'];
  elsif p_store_name = 'nodes' then
    return v_row - v_common_server;
  elsif p_store_name in ('flowNodes','flowCases') then
    return v_row - v_common_server;
  elsif p_store_name = 'flowPractices' then
    return (
      v_row - array['flowNodeId','flowCaseId','createdAt']
    ) || jsonb_build_object(
      'ownerId',
      coalesce(p_row -> 'flow_node_id', p_row -> 'flow_case_id')
    );
  elsif p_store_name = 'flowPracticeEntries' then
    return v_row - v_common_server;
  elsif p_store_name = 'flowPracticeOptions' then
    return v_row - array['flowPracticeId','itemKind','createdAt'];
  elsif p_store_name = 'flowPracticeVariants' then
    return v_row - array[
      'flowPracticeId',
      'itemKind',
      'enabled',
      'hasEnabled',
      'createdAt'
    ];
  elsif p_store_name = 'flowShapeOptions' then
    return (
      v_row - array[
        'entryId',
        'flowPracticeId',
        'itemKind',
        'contractKey',
        'wasPrimitive',
        'hasContractKey',
        'enabled',
        'hasEnabled',
        'createdAt'
      ]
    ) || jsonb_build_object(
      'practiceId',
      p_row -> 'flow_practice_id'
    );
  elsif p_store_name = 'edges' then
    return v_row - array['contractKey','edgeRole','createdAt'];
  elsif p_store_name = 'matrixItems' then
    return v_row - array[
      'contractKey',
      'itemKind',
      'dividerAfterColumn',
      'rowCount',
      'columnCount',
      'createdAt'
    ];
  elsif p_store_name = 'cells' then
    return v_row - array['cellRole','createdAt'];
  elsif p_store_name = 'points' then
    return v_row - array[
      'contractKey',
      'pointKind',
      'groupIndex',
      'createdAt'
    ];
  elsif p_store_name = 'lines' then
    return v_row - array['contractKey','lineKind','createdAt'];
  elsif p_store_name = 'highlights' then
    return v_row - array[
      'targetKind',
      'textValue',
      'targetNodeId',
      'secondaryNodeId',
      'createdAt'
    ];
  elsif p_store_name = 'cardSources' then
    return v_row - array[
      'topicId',
      'refKind',
      'topicContractKey',
      'createdAt'
    ];
  elsif p_store_name = 'cardTopics' then
    return v_row - array['value','refKind','createdAt'];
  elsif p_store_name = 'lessonProgress' then
    return v_row - v_common_server;
  elsif p_store_name = 'cardProgress' then
    return v_row - v_common_server;
  elsif p_store_name = 'comments' then
    return v_row;
  end if;
  return v_row;
end;
$$;

revoke execute on function private.shape_store_payload(
  text,
  jsonb,
  text
) from public, anon, authenticated;
revoke execute on function private.local_row(
  text,
  jsonb
) from public, anon, authenticated;

commit;
