begin;

-- Application revision/state conflicts must not use the engine's serialization
-- SQLSTATE. Keep native serialization handling and existing PGRST JSON envelopes.
-- Only these current signatures are rewritten; no data, ACL, owner or lock changes.
do $migration$
declare
  target record;
  function_oid oid;
  definition text;
  original_body text;
  updated_body text;
  original_metadata jsonb;
  updated_metadata jsonb;
  raise_pattern constant text := $rx$(\merrcode[[:space:]]*=[[:space:]]*)'40001'$rx$;
  replacement_raise_pattern constant text := $rx$\merrcode[[:space:]]*=[[:space:]]*'PT409'$rx$;
  catch_pattern constant text := $rx$\mexception[[:space:]]+when[[:space:]]+serialization_failure[[:space:]]+then$rx$;
  replacement_catch_pattern constant text := $rx$\mexception[[:space:]]+when[[:space:]]+serialization_failure[[:space:]]+or[[:space:]]+sqlstate[[:space:]]+'PT409'[[:space:]]+then$rx$;
  json_pattern constant text := $rx$'code'[[:space:]]*,[[:space:]]*'40001'$rx$;
  changed_functions integer := 0;
  replaced_raises integer := 0;
  extended_catches integer := 0;
  remaining_raises integer;
  preserved_json_codes integer;
begin
  for target in
    select * from (values
      ('private.apply_course_source_attribution_v2(uuid, text, text, bigint, jsonb, text)', 2, 0, 0),
      ('private.commit_course_composition_core_v1(uuid, uuid, bigint, jsonb, jsonb, text, jsonb)', 1, 0, 0),
      ('private.decorate_course_inspection_page_v2(uuid, bigint, jsonb)', 1, 0, 0),
      ('private.execute_course_anchored_annotation_command_core_v1(uuid, uuid, bigint, jsonb, text, text, text, boolean)', 2, 0, 0),
      ('private.execute_course_source_command_core_v1(uuid, uuid, bigint, jsonb, text, text)', 5, 1, 1),
      ('private.get_course_anchored_annotations_core_v1(uuid, uuid, bigint, bigint, text, text[], text[], text[], text[], boolean, text[], text, text, boolean, uuid, text, integer, boolean)', 2, 0, 0),
      ('private.guard_course_source_attachment_lifecycle_v1()', 2, 0, 0),
      ('private.guard_shared_course_media_v1()', 1, 0, 0),
      ('private.ingest_course_source_pdf_core_v1(uuid, uuid, bigint, jsonb, jsonb, text, text)', 2, 0, 0),
      ('private.list_course_entities_for_actor_v1(uuid, uuid, bigint, integer, text, text)', 1, 0, 0),
      ('private.list_course_study_units_for_actor_v1(uuid, uuid, bigint, text, text, text, text, text, integer, integer, text)', 1, 0, 0),
      ('private.materialize_course_authoring_part_core_v1(uuid, uuid, uuid, bigint, bigint, jsonb, text, text)', 6, 0, 0),
      ('private.mutate_authoring_profile_v1(uuid, uuid, bigint, text, jsonb, text, text, boolean)', 1, 0, 0),
      ('private.prepare_course_source_pdf_ingestion_core_v1(uuid, uuid, bigint, jsonb, text, bigint, text, text)', 4, 0, 0),
      ('public.apply_course_design_command_for_actor_v3(uuid, uuid, bigint, jsonb, text, text, text)', 1, 0, 0),
      ('public.authorize_current_orphan_removal_for_actor_v1(uuid, text, text, boolean)', 3, 0, 0),
      ('public.commit_course_composition_for_actor_v1(uuid, uuid, bigint, bigint, jsonb, jsonb, jsonb, text, text, text, jsonb)', 1, 0, 0),
      ('public.complete_course_media_delete_for_actor_v1(uuid, uuid, text)', 1, 0, 0),
      ('public.complete_course_source_pdf_delete_for_actor_v1(uuid, uuid, text, text)', 1, 0, 0),
      ('public.complete_current_orphan_removal_for_actor_v1(uuid, text, text)', 1, 0, 0),
      ('public.copy_course_for_actor_v1(uuid, uuid, bigint, text, boolean, text, timestamp with time zone)', 2, 0, 0),
      ('public.create_course_anchored_annotations_for_actor_v1(uuid, uuid, bigint, jsonb, text, text)', 1, 1, 1),
      ('public.execute_course_anchored_annotation_command_for_actor_v1(uuid, uuid, bigint, jsonb, text, text)', 0, 1, 1),
      ('public.execute_course_media_for_actor_v1(uuid, uuid, bigint, jsonb, text)', 2, 0, 0),
      ('public.execute_my_course_anchored_annotation_command_v1(uuid, bigint, jsonb, text)', 0, 1, 1),
      ('public.get_course_media_download_for_actor_v1(uuid, uuid, bigint, text, text)', 1, 0, 0),
      ('public.get_course_media_for_actor_v1(uuid, uuid, bigint, text, text, integer)', 1, 0, 0),
      ('public.get_course_source_pdf_download_for_actor_v1(uuid, uuid, bigint, text, bigint, text)', 1, 0, 0),
      ('public.get_my_course_anchored_annotations_v1(uuid, bigint, bigint, text, text, text, integer)', 0, 1, 1),
      ('public.get_owned_course_anchored_annotations_for_actor_v1(uuid, uuid, bigint, bigint, text, text[], text[], text[], text[], boolean, text[], text, text, boolean, uuid, text, integer)', 0, 1, 1),
      ('public.get_owned_course_authoring_analytics_for_actor_v4(uuid, uuid, bigint, jsonb)', 1, 0, 0),
      ('public.get_owned_course_sources_for_actor_v1(uuid, uuid, bigint, text, text, text, text, text, integer)', 1, 0, 0),
      ('public.ingest_course_source_pdf_for_actor_v1(uuid, uuid, bigint, jsonb, jsonb, jsonb, text, text)', 1, 0, 0),
      ('public.manage_course_access_for_actor_v3(uuid, uuid, text, text, uuid, boolean, text, boolean)', 1, 0, 0),
      ('public.materialize_course_authoring_part_for_actor_v2(uuid, uuid, uuid, bigint, bigint, jsonb, jsonb, jsonb, text, text)', 2, 0, 0),
      ('public.mutate_course_personal_state_v2(uuid, bigint, jsonb, uuid)', 2, 1, 1),
      ('public.prepare_course_audio_for_actor_v1(uuid, uuid, bigint, text, bigint, text, text, text)', 4, 0, 0),
      ('public.preview_course_authoring_profile_for_actor_v1(uuid, uuid, bigint, uuid, bigint)', 2, 0, 0),
      ('public.remove_course_source_pdf_for_actor_v1(uuid, uuid, bigint, jsonb, text, text)', 1, 0, 0),
      ('public.save_course_authoring_part_for_actor_v1(uuid, uuid, bigint, bigint, jsonb, text, text)', 2, 0, 0),
      ('public.save_course_curricular_map_for_actor_v1(uuid, uuid, bigint, bigint, boolean, jsonb, text, text)', 2, 0, 0),
      ('public.set_course_source_file_access_for_actor_v1(uuid, uuid, bigint, text, bigint, text, text, text)', 2, 0, 0),
      ('public.set_course_visibility_for_actor_v1(uuid, uuid, bigint, text, text, boolean, text)', 1, 0, 0)
    ) as manifest(signature, raise_count, catch_count, json_count)
  loop
    function_oid := to_regprocedure(target.signature);
    if function_oid is null then
      raise exception 'Missing current conflict contract: %', target.signature using errcode='55000';
    end if;
    select pg_get_functiondef(p.oid), p.prosrc, to_jsonb(p)-'prosrc'
      into definition, original_body, original_metadata
    from pg_proc p where p.oid=function_oid;
    if regexp_count(original_body,raise_pattern,1,'i')<>target.raise_count
       or regexp_count(original_body,catch_pattern,1,'i')<>target.catch_count
       or regexp_count(original_body,json_pattern,1,'i')<>target.json_count
       or regexp_count(original_body,replacement_raise_pattern,1,'i')<>0
       or regexp_count(original_body,replacement_catch_pattern,1,'i')<>0 then
      raise exception 'Current conflict contract differs from migration: %', target.signature using errcode='55000';
    end if;

    definition := regexp_replace(definition,raise_pattern,$replacement$\1'PT409'$replacement$,'gi');
    definition := regexp_replace(definition,catch_pattern,
      $replacement$exception when serialization_failure or sqlstate 'PT409' then$replacement$,'gi');
    execute definition;

    select p.prosrc, to_jsonb(p)-'prosrc' into updated_body, updated_metadata
    from pg_proc p where p.oid=function_oid;
    if updated_metadata is distinct from original_metadata
       or regexp_count(updated_body,raise_pattern,1,'i')<>0
       or regexp_count(updated_body,replacement_raise_pattern,1,'i')<>target.raise_count
       or regexp_count(updated_body,catch_pattern,1,'i')<>0
       or regexp_count(updated_body,replacement_catch_pattern,1,'i')<>target.catch_count
       or regexp_count(updated_body,json_pattern,1,'i')<>target.json_count then
      raise exception 'Conflict rewrite changed contract metadata or envelope: %', target.signature using errcode='55000';
    end if;
    changed_functions := changed_functions+1;
    replaced_raises := replaced_raises+target.raise_count;
    extended_catches := extended_catches+target.catch_count;
  end loop;

  select coalesce(sum(regexp_count(p.prosrc,raise_pattern,1,'i')),0),
         coalesce(sum(regexp_count(p.prosrc,json_pattern,1,'i')),0)
    into remaining_raises,preserved_json_codes
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.prokind='f';
  if changed_functions<>43 or replaced_raises<>69 or extended_catches<>7
     or remaining_raises<>0 or preserved_json_codes<>8 then
    raise exception 'Current conflict rewrite did not preserve its bounded inventory.' using errcode='55000';
  end if;
end;
$migration$;

notify pgrst,'reload schema';
commit;
