begin;

alter table public.block_edges
  add column if not exists has_directed boolean not null default false;

alter table public.block_edges
  drop constraint if exists block_edges_directed_presence;
alter table public.block_edges
  add constraint block_edges_directed_presence check (
    not has_directed or edge_scope = 'graph'
  );

comment on column public.block_edges.directed is
  'Sentido da aresta. Só integra o contrato público quando has_directed é verdadeiro.';
comment on column public.block_edges.has_directed is
  'Preserva a diferença entre directed omitido e directed explicitamente informado.';

create or replace function private.local_row(p_store_name text, p_row jsonb)
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
    return (v_row - 'createdAt') || jsonb_build_object('courseId', p_row -> 'id');
  elsif p_store_name = 'memberships' then
    return v_row - array['createdAt'];
  elsif p_store_name in ('modules','lessons','microsequences','dependencies') then
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
      'contractKey','parentBlockId','role','valueText','scaleFactor','createdAt'
    ];
  elsif p_store_name = 'options' then
    return v_row - array['textValue','enabled','createdAt'];
  elsif p_store_name = 'nodes' then
    return v_row - v_common_server;
  elsif p_store_name in ('flowNodes','flowCases') then
    return v_row - v_common_server;
  elsif p_store_name = 'flowPractices' then
    return (v_row - array['flowNodeId','flowCaseId','createdAt']) ||
      jsonb_build_object('ownerId', coalesce(p_row -> 'flow_node_id', p_row -> 'flow_case_id'));
  elsif p_store_name = 'flowPracticeEntries' then
    return v_row - v_common_server;
  elsif p_store_name = 'flowPracticeOptions' then
    return v_row - array[
      'flowPracticeId','itemKind','regex','hasRegex','createdAt'
    ];
  elsif p_store_name = 'flowPracticeVariants' then
    return v_row - array[
      'flowPracticeId','itemKind','enabled','hasEnabled','createdAt'
    ];
  elsif p_store_name = 'flowShapeOptions' then
    return (v_row - array[
      'entryId','flowPracticeId','itemKind','contractKey','wasPrimitive',
      'hasContractKey','enabled','hasEnabled','hasRegex','regex','createdAt'
    ]) || jsonb_build_object('practiceId', p_row -> 'flow_practice_id');
  elsif p_store_name = 'edges' then
    return v_row - array['contractKey','edgeRole','createdAt'];
  elsif p_store_name = 'matrixItems' then
    return v_row - array[
      'contractKey','itemKind','dividerAfterColumn','rowCount','columnCount','createdAt'
    ];
  elsif p_store_name = 'cells' then
    return v_row - array['cellRole','createdAt'];
  elsif p_store_name = 'points' then
    return v_row - array['contractKey','pointKind','groupIndex','createdAt'];
  elsif p_store_name = 'lines' then
    return v_row - array['contractKey','lineKind','createdAt'];
  elsif p_store_name = 'highlights' then
    return v_row - array[
      'targetKind','textValue','targetNodeId','secondaryNodeId','createdAt'
    ];
  elsif p_store_name = 'cardSources' then
    return v_row - array['topicId','refKind','topicContractKey','createdAt'];
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

commit;
