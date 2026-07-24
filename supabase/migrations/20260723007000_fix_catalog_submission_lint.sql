-- The lean relational cutover removes content-table tombstones.  The first
-- catalog-submission migration was written against the earlier shape, so its
-- validation function retained nonexistent deleted_at predicates.  Keep this
-- correction incremental: migration 20260722233000 is already deployed.

create or replace function private.catalog_submission_tree_counts(p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'modules', (select count(*) from public.modules where course_id = p_course_id),
    'lessons', (select count(*) from public.lessons where course_id = p_course_id),
    'course_guides', (select count(*) from public.course_guides where course_id = p_course_id),
    'guide_items', (select count(*) from public.guide_items where course_id = p_course_id),
    'lesson_topics', (select count(*) from public.lesson_topics where course_id = p_course_id),
    'topic_statements', (select count(*) from public.topic_statements where course_id = p_course_id),
    'microsequences', (select count(*) from public.microsequences where course_id = p_course_id),
    'microsequence_dependencies', (select count(*) from public.microsequence_dependencies where course_id = p_course_id),
    'microsequence_statements', (select count(*) from public.microsequence_statements where course_id = p_course_id),
    'cards', (select count(*) from public.cards where course_id = p_course_id),
    'card_blocks', (select count(*) from public.card_blocks where course_id = p_course_id),
    'block_options', (select count(*) from public.block_options where course_id = p_course_id),
    'block_nodes', (select count(*) from public.block_nodes where course_id = p_course_id),
    'flow_nodes', (select count(*) from public.flow_nodes where course_id = p_course_id),
    'flow_cases', (select count(*) from public.flow_cases where course_id = p_course_id),
    'flow_practices', (select count(*) from public.flow_practices where course_id = p_course_id),
    'node_practices', (select count(*) from public.node_practices where course_id = p_course_id),
    'node_practice_items', (select count(*) from public.node_practice_items where course_id = p_course_id),
    'block_edges', (select count(*) from public.block_edges where course_id = p_course_id),
    'block_matrix_items', (select count(*) from public.block_matrix_items where course_id = p_course_id),
    'block_cells', (select count(*) from public.block_cells where course_id = p_course_id),
    'block_points', (select count(*) from public.block_points where course_id = p_course_id),
    'block_lines', (select count(*) from public.block_lines where course_id = p_course_id),
    'block_highlights', (select count(*) from public.block_highlights where course_id = p_course_id),
    'card_refs', (select count(*) from public.card_refs where course_id = p_course_id)
  );
$$;

create or replace function private.validate_catalog_submission_course(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_course public.courses%rowtype;
  v_valid boolean;
begin
  select * into v_course from public.courses course where course.id = p_course_id;
  if not found or v_course.deleted_at is not null then
    return jsonb_build_object(
      'valid', false,
      'publishable', false,
      'errors', jsonb_build_array(jsonb_build_object('code', 'course.missing'))
    );
  end if;

  if not exists (select 1 from public.modules where course_id = p_course_id) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'course.empty', 'path', '$.modules',
      'message', 'Curso precisa ter ao menos um módulo.'
    ));
  end if;
  if exists (
    select 1 from public.modules module
    where module.course_id = p_course_id
      and not exists (select 1 from public.course_guides guide where guide.module_id = module.id)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'module.guide_missing', 'path', '$.modules',
      'message', 'Módulo precisa de guide.'
    ));
  end if;
  if exists (
    select 1 from public.modules module
    where module.course_id = p_course_id
      and not exists (select 1 from public.lessons lesson where lesson.module_id = module.id)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'module.lesson_missing', 'path', '$.modules',
      'message', 'Módulo precisa ter ao menos uma lição.'
    ));
  end if;
  if exists (
    select 1 from public.lessons lesson
    where lesson.course_id = p_course_id
      and not exists (select 1 from public.course_guides guide where guide.lesson_id = lesson.id)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'lesson.guide_missing', 'path', '$.lessons',
      'message', 'Lição precisa de guide.'
    ));
  end if;
  if exists (
    select 1 from public.lessons lesson
    where lesson.course_id = p_course_id
      and not exists (select 1 from public.microsequences microsequence where microsequence.lesson_id = lesson.id)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'lesson.microsequence_missing', 'path', '$.lessons',
      'message', 'Lição precisa ter ao menos uma microssequência.'
    ));
  end if;
  if exists (
    select 1 from public.microsequences microsequence
    where microsequence.course_id = p_course_id
      and microsequence.status <> 'planned'
      and not exists (select 1 from public.cards card where card.microsequence_id = microsequence.id)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'microsequence.cards_missing', 'path', '$.microsequences',
      'message', 'Microssequência materializada precisa ter cards.'
    ));
  end if;
  if exists (
    select 1 from public.microsequences
    where course_id = p_course_id and status <> 'ready'
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'microsequence.not_ready', 'path', '$.microsequences',
      'message', 'Publicação exige todas as microssequências em ready.'
    ));
  end if;
  if exists (
    select 1
    from public.microsequence_dependencies dependency
    join public.microsequences microsequence on microsequence.id = dependency.microsequence_id
    join public.microsequences predecessor on predecessor.id = dependency.depends_on_microsequence_id
    where dependency.course_id = p_course_id
      and predecessor.position >= microsequence.position
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'dependency.not_previous', 'path', '$.microsequences',
      'message', 'Dependência precisa apontar para microssequência anterior da mesma lição.'
    ));
  end if;
  if exists (
    select 1 from public.cards card
    where card.course_id = p_course_id and card.resource <> 'composite'
      and (select count(*) from public.card_blocks block
           where block.card_id = card.id and block.role = 'primary') <> 1
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'card.primary_block_missing', 'path', '$.cards',
      'message', 'Card precisa de exatamente um bloco primário.'
    ));
  end if;
  if exists (
    select 1 from public.cards card
    where card.course_id = p_course_id and card.resource = 'composite'
      and (
        (select count(*) from public.card_blocks block
         where block.card_id = card.id and block.role = 'composite') < 1
        or (select count(*) from public.card_blocks block
            where block.card_id = card.id and block.role = 'primary') <> 0
      )
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'card.composite_blocks_invalid', 'path', '$.cards',
      'message', 'Card composite precisa de ao menos um bloco composite e nenhum bloco primário.'
    ));
  end if;
  if exists (
    select 1 from public.cards card
    join public.card_blocks block on block.card_id = card.id and block.role = 'primary'
    where card.course_id = p_course_id
      and card.resource <> 'composite'
      and block.block_type <> card.resource::text
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'card.primary_resource_mismatch', 'path', '$.cards',
      'message', 'Tipo do bloco primário diverge do resource do card.'
    ));
  end if;
  if exists (
    select 1 from public.cards card
    where card.course_id = p_course_id
      and (card.card_kind is distinct from card.kind or card.has_after is distinct from (card.after is not null))
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'contract.projection_mismatch', 'path', '$.cards',
      'message', 'Projeção relacional do card diverge dos campos públicos.'
    ));
  end if;
  if exists (
    select 1 from public.card_blocks block
    where block.course_id = p_course_id
      and (
        block.is_primary is distinct from (block.role = 'primary')
        or block.region is distinct from case block.role
          when 'primary' then 'primary' when 'composite' then 'content' else 'after' end
        or block.has_value is distinct from (block.value is not null)
        or block.has_prompt is distinct from (block.prompt is not null)
        or block.has_question is distinct from (block.question is not null)
        or block.has_language is distinct from (block.language is not null)
        or block.has_code is distinct from (block.code is not null)
        or block.has_name is distinct from (block.name is not null)
        or block.has_divider_after_column is distinct from (block.divider_after_column is not null)
        or block.has_x_range is distinct from (block.x_range is not null)
        or block.has_y_range is distinct from (block.y_range is not null)
        or block.has_scale is distinct from (block.scale_k is not null)
        or block.has_result is distinct from (block.result_text is not null)
      )
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'contract.projection_mismatch', 'path', '$.blocks',
      'message', 'Projeção relacional do bloco diverge dos campos públicos.'
    ));
  end if;
  if exists (
    select 1 from public.card_blocks block
    where block.course_id = p_course_id and block.block_type = 'choice'
      and (
        (select count(*) from public.block_options option where option.block_id = block.id) not between 3 and 4
        or (select count(*) from public.block_options option
            where option.block_id = block.id and option.is_correct) <> 1
      )
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'choice.options_invalid', 'path', '$.blocks',
      'message', 'Bloco choice precisa de 3 ou 4 opções e exatamente uma correta.'
    ));
  end if;
  if exists (
    select 1 from public.block_cells cell
    join public.block_matrix_items matrix_item on matrix_item.id = cell.matrix_item_id
    where cell.course_id = p_course_id
      and (cell.row_index >= matrix_item.row_count or cell.column_index >= matrix_item.column_count)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'grid.cell_out_of_bounds', 'path', '$.matrixItems',
      'message', 'Célula fora das dimensões declaradas.'
    ));
  end if;
  if exists (
    select 1 from public.card_blocks block
    where block.course_id = p_course_id and block.block_type = 'flow'
      and (select count(*) from public.flow_nodes node
           where node.block_id = block.id
             and node.node_kind = 'sequence'
             and node.parent_node_id is null
             and node.parent_case_id is null) <> 1
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'flow.root_invalid', 'path', '$.blocks',
      'message', 'Flow precisa de uma única raiz sequence.'
    ));
  end if;
  if exists (
    select 1 from public.modules
    where course_id = p_course_id
    group by position having count(*) > 1
  ) or exists (
    select 1 from public.lessons
    where course_id = p_course_id
    group by module_id, position having count(*) > 1
  ) or exists (
    select 1 from public.microsequences
    where course_id = p_course_id
    group by lesson_id, position having count(*) > 1
  ) or exists (
    select 1 from public.cards
    where course_id = p_course_id
    group by microsequence_id, position having count(*) > 1
  ) or exists (
    select 1 from public.card_blocks
    where course_id = p_course_id
    group by card_id, role, position having count(*) > 1
  ) or exists (
    select 1 from public.block_options
    where course_id = p_course_id
    group by block_id, position having count(*) > 1
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'position.duplicate', 'path', '$.__relationalOrder',
      'message', 'Posições precisam ser únicas dentro de cada conjunto ordenado.'
    ));
  end if;
  v_valid := jsonb_array_length(v_errors) = 0;

  return jsonb_build_object(
    'valid', v_valid,
    'publishable', v_valid,
    'courseId', p_course_id,
    'contentHash', private.course_content_hash(p_course_id),
    'errors', v_errors
  );
end;
$$;

create or replace function public.list_catalog_submission_queue()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
begin
  perform private.require_catalog_submission_editor();
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'submissionId', submission.id,
        'authorUserId', submission.author_user_id,
        'sourceCourseId', submission.source_course_id,
        'title', submission.source_title,
        'sourceContractKey', submission.source_contract_key,
        'sourceContentHash', submission.source_content_hash,
        'license', submission.license_code,
        'attribution', submission.attribution_text,
        'provenance', submission.provenance_text,
        'status', submission.status,
        'submittedAt', submission.submitted_at,
        'reviewStartedAt', submission.review_started_at
      ) order by submission.submitted_at, submission.id)
      from private.catalog_course_submissions submission
      where submission.status in ('submitted', 'in_review')
    ), '[]'::jsonb)
  );
end;
$$;
