begin;

-- Publicações criadas antes do protocolo pedagógico não possuem plan nem
-- ledger. Elas continuam válidas como publicação de catálogo, mas não há
-- metadados pedagógicos a materializar durante a compactação terminal.
create or replace function private.materialize_learning_metadata_before_compaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_course_id uuid;
  v_result jsonb;
begin
  if new.status = 'publishing'
     and old.terminal_compacted_at is null
     and new.terminal_compacted_at is not null
     and new.plan is not null then
    v_course_id := new.course_id;

    if v_course_id is null then
      select stage.course_id into v_course_id
      from private.official_catalog_imports stage
      where stage.authoring_run_id = new.id;
    end if;

    if v_course_id is null then
      select stage.course_id into v_course_id
      from private.authoring_private_imports stage
      where stage.run_id = new.id;
    end if;

    if v_course_id is not null then
      v_result := private.materialize_authoring_learning_metadata(
        new.id, v_course_id
      );
      new.validation_report := coalesce(
        new.validation_report, '{}'::jsonb
      ) || jsonb_build_object(
        'pedagogicalMaterialization', v_result
      );
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.materialize_learning_metadata_before_compaction()
  from public, anon, authenticated;

commit;
