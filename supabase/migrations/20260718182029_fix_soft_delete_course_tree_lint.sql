begin;

-- Keep this function explicit so plpgsql_check can validate every target on
-- the hosted database. The original dynamic FOREACH implementation is
-- semantically equivalent, but the remote linter treated the complete array
-- literal as one relation name.
create or replace function private.soft_delete_course_tree(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.guide_items set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.topic_statements set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.microsequence_dependencies set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.microsequence_statements set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.block_options set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.node_practice_items set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.node_practices set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.flow_practices set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.flow_cases set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.flow_nodes set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.block_edges set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.block_cells set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.block_highlights set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.block_matrix_items set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.block_points set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.block_lines set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.card_refs set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.block_nodes set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.card_blocks set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.cards set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.lesson_topics set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.course_guides set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.microsequences set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.lessons set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.modules set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
end;
$$;

commit;
