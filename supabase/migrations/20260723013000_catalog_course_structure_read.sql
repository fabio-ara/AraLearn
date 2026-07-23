begin;

-- A árvore publicada permanece imutável fora do fluxo de autoria. Esta RPC
-- oferece leitura paginada das linhas formais para que um agente editorial
-- consiga localizar o trecho que precisa ser corrigido e, então, abra uma
-- execução de autoria em modo update.
create or replace function public.get_catalog_course_structure_admin(
  p_actor_user_id uuid,
  p_course_id uuid,
  p_section text default 'modules',
  p_parent_id uuid default null,
  p_limit integer default 25,
  p_after_position integer default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_course public.courses%rowtype;
  v_table regclass;
  v_position_sql text;
  v_parent_sql text;
  v_store_sql text := 'true';
  v_active_sql text := 'true';
  v_items jsonb := '[]'::jsonb;
  v_item record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_last_position integer;
  v_last_id uuid;
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, false);

  if p_course_id is null
     or p_section is null
     or p_section not in (
       'modules',
       'lessons',
       'guides',
       'guideItems',
       'topics',
       'topicStatements',
       'microsequences',
       'dependencies',
       'microsequenceStatements',
       'cards',
       'blocks',
       'options',
       'nodes',
       'flowNodes',
       'flowCases',
       'flowPractices',
       'flowPracticeEntries',
       'flowPracticeOptions',
       'flowPracticeVariants',
       'flowShapeOptions',
       'edges',
       'matrixItems',
       'cells',
       'points',
       'lines',
       'highlights',
       'cardSources',
       'cardTopics',
       'learningComponents',
       'learningComponentTopicLinks',
       'learningComponentRelations',
       'learningComponentPlacements'
     )
     or p_limit is null
     or p_limit not between 1 and 100
     or ((p_after_position is null) <> (p_after_id is null))
     or (p_after_position is not null and p_after_position < 0) then
    raise exception 'Consulta de estrutura do catálogo inválida.'
      using errcode = '22023';
  end if;

  select course.* into v_course
  from public.courses course
  where course.id = p_course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null;
  if not found then
    raise exception 'Curso oficial inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;

  v_table := case p_section
    when 'learningComponents' then
      to_regclass('public.learning_components')
    when 'learningComponentTopicLinks' then
      to_regclass('public.learning_component_topic_links')
    when 'learningComponentRelations' then
      to_regclass('public.learning_component_relations')
    when 'learningComponentPlacements' then
      to_regclass('public.learning_component_placements')
    else private.table_for_store(p_section)
  end;
  if v_table is null then
    raise exception 'Seção relacional indisponível.'
      using errcode = '55000';
  end if;

  if p_section in ('modules', 'learningComponents')
     and p_parent_id is not null then
    raise exception 'A seção informada não recebe parentId.'
      using errcode = '22023';
  end if;

  v_parent_sql := case p_section
    when 'modules' then '$6 is null'
    when 'lessons' then '($6 is null or t.module_id = $6)'
    when 'guides' then '($6 is null or t.owner_id = $6)'
    when 'guideItems' then '($6 is null or t.guide_id = $6)'
    when 'topics' then '($6 is null or t.lesson_id = $6)'
    when 'topicStatements' then '($6 is null or t.topic_id = $6)'
    when 'microsequences' then '($6 is null or t.lesson_id = $6)'
    when 'dependencies' then
      '($6 is null or t.microsequence_id = $6)'
    when 'microsequenceStatements' then
      '($6 is null or t.microsequence_id = $6)'
    when 'cards' then '($6 is null or t.microsequence_id = $6)'
    when 'blocks' then '($6 is null or t.card_id = $6)'
    when 'options' then '($6 is null or t.block_id = $6)'
    when 'nodes' then '($6 is null or t.block_id = $6)'
    when 'flowNodes' then '($6 is null or t.block_id = $6)'
    when 'flowCases' then '($6 is null or t.flow_node_id = $6)'
    when 'flowPractices' then
      '($6 is null or t.flow_node_id = $6 or t.flow_case_id = $6)'
    when 'flowPracticeEntries' then
      '($6 is null or t.practice_id = $6)'
    when 'flowPracticeOptions' then
      '($6 is null or t.entry_id = $6)'
    when 'flowPracticeVariants' then
      '($6 is null or t.entry_id = $6)'
    when 'flowShapeOptions' then
      '($6 is null or t.flow_practice_id = $6)'
    when 'edges' then '($6 is null or t.block_id = $6)'
    when 'matrixItems' then '($6 is null or t.block_id = $6)'
    when 'cells' then '($6 is null or t.matrix_item_id = $6)'
    when 'points' then '($6 is null or t.block_id = $6)'
    when 'lines' then '($6 is null or t.block_id = $6)'
    when 'highlights' then '($6 is null or t.block_id = $6)'
    when 'cardSources' then '($6 is null or t.card_id = $6)'
    when 'cardTopics' then '($6 is null or t.card_id = $6)'
    when 'learningComponents' then '$6 is null'
    when 'learningComponentTopicLinks' then
      '($6 is null or t.component_id = $6 or t.topic_id = $6)'
    when 'learningComponentRelations' then
      '($6 is null or t.from_component_id = $6 or t.to_component_id = $6)'
    when 'learningComponentPlacements' then
      '($6 is null or t.component_id = $6 or t.microsequence_id = $6'
      || ' or t.card_id = $6)'
  end;

  if p_section = 'flowPracticeOptions' then
    v_store_sql := 't.item_kind = ''option''';
  elsif p_section = 'flowPracticeVariants' then
    v_store_sql := 't.item_kind = ''variant''';
  elsif p_section = 'flowShapeOptions' then
    v_store_sql := 't.item_kind = ''shape_option''';
  elsif p_section = 'cardSources' then
    v_store_sql := 't.ref_kind = ''source''';
  elsif p_section = 'cardTopics' then
    v_store_sql := 't.ref_kind = ''topic''';
  end if;

  if exists (
    select 1
    from pg_attribute attribute
    where attribute.attrelid = v_table
      and attribute.attname = 'deleted_at'
      and not attribute.attisdropped
  ) then
    v_active_sql := 't.deleted_at is null';
  end if;

  if exists (
    select 1
    from pg_attribute attribute
    where attribute.attrelid = v_table
      and attribute.attname = 'position'
      and not attribute.attisdropped
  ) then
    v_position_sql := 't.position';
  else
    v_position_sql := '0';
  end if;

  for v_item in execute format(
    'select %1$s::integer sort_position, t.id, '
    || '(private.local_row($2, to_jsonb(t)) - '
    || 'array[''createdAt'',''updatedAt'',''deletedAt'',''revision'','
    || '''sourceEntityId'',''materializedFromRunId'']) item '
    || 'from %2$s t '
    || 'where t.course_id = $1 and %3$s and %4$s and %5$s '
    || 'and (($3 is null and $4 is null) '
    || 'or (%1$s, t.id) > ($3, $4)) '
    || 'order by %1$s, t.id limit $5',
    v_position_sql,
    v_table,
    v_parent_sql,
    v_store_sql,
    v_active_sql
  ) using
    p_course_id,
    p_section,
    p_after_position,
    p_after_id,
    p_limit + 1,
    p_parent_id
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;
    v_items := v_items || jsonb_build_array(v_item.item);
    v_last_position := v_item.sort_position;
    v_last_id := v_item.id;
  end loop;

  return jsonb_build_object(
    'course',
    jsonb_build_object(
      'courseId', v_course.id,
      'contractKey', v_course.contract_key,
      'title', v_course.title,
      'goal', v_course.goal,
      'publicationSeq', v_course.publication_seq,
      'contentHash', v_course.content_hash,
      'catalogRevision', v_course.catalog_revision
    ),
    'authoringUpdate',
    jsonb_build_object(
      'mode', 'update',
      'existingCourseId', v_course.id,
      'expectedContentHash', v_course.content_hash,
      'directTreeMutation', false
    ),
    'section', p_section,
    'parentId', p_parent_id,
    'items', v_items,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'afterPosition', v_last_position,
      'afterId', v_last_id
    ) else null end
  );
end;
$$;

comment on function public.get_catalog_course_structure_admin(
  uuid, uuid, text, uuid, integer, integer, uuid
) is
  'Lê uma seção formal e paginada do curso oficial. A árvore só muda por execução de autoria update validada e publicada atomicamente.';

revoke all on function public.get_catalog_course_structure_admin(
  uuid, uuid, text, uuid, integer, integer, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.get_catalog_course_structure_admin(
  uuid, uuid, text, uuid, integer, integer, uuid
) to service_role;

commit;
