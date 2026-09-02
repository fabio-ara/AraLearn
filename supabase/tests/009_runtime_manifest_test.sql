begin;

select plan(21);

select has_function('public','get_aralearn_runtime_manifest',array[]::text[],
  'o banco expõe o manifesto final');
select is(public.get_aralearn_runtime_manifest()->>'schemaRevision',
  '20260902044404','o manifesto identifica o corte final');
select is(public.get_aralearn_runtime_manifest()->>'contractVersion','1',
  'o contrato do manifesto permanece estável');
select is(jsonb_array_length(public.get_aralearn_runtime_manifest()->'features'),38,
  'o manifesto contém somente capacidades correntes');
select ok((public.get_aralearn_runtime_manifest()->'features') @> '[
  "course-anchored-annotations-atomic-create-v1",
  "course-authoring-configuration-v2",
  "course-authoring-part-save-v1",
  "course-authoring-part-materialization-atomic-v1",
  "course-instructional-plan-v2",
  "course-source-current-state-v1",
  "course-study-unit-inspection-v2",
  "single-authoring-runtime-v1"
]'::jsonb,'o manifesto anuncia o runtime corrente');
select ok(not (public.get_aralearn_runtime_manifest()->'features' ?| array[
  'authenticated-course-source-pdf-upload-v1',
  'course-audit-cycle-v1','course-authoring-corrections-v1',
  'course-authoring-part-materialization-v1',
  'course-authoring-part-materialization-history-v1',
  'course-design-parameters-v1','course-variant-comparisons-v1'
]),'o manifesto não anuncia mecanismos substituídos');

select is(array(
  select name from unnest(array[
    'public.courses','public.course_access','public.course_personal_states',
    'private.course_entities','private.course_instructional_plans',
    'private.course_instructional_plan_items','private.course_authoring_parts',
    'private.course_authoring_part_didactic_microsequences',
    'private.course_design_parameter_definitions',
    'private.course_design_parameter_assignments',
    'private.course_authoring_guidance_assignments',
    'private.course_component_policy_assignments',
    'private.course_design_target_plan_items','private.course_sources',
    'private.course_source_anchors','private.course_source_attributions',
    'private.course_source_attribution_sources',
    'private.course_source_attribution_anchors',
    'private.course_source_attachments','private.course_source_pdf_upload_intents',
    'private.course_source_pdf_delete_intents',
    'private.course_anchored_annotations',
    'private.course_anchored_annotation_viewer_versions',
    'private.course_change_receipts'
  ]) name where to_regclass(name) is null
),array[]::text[],'todas as autoridades correntes existem');

select is(array(
  select name from unnest(array[
    'private.course_events','private.course_authoring_part_materializations',
    'private.course_authoring_part_materialization_steps',
    'private.course_instructional_audit_runs','private.course_audit_findings',
    'private.course_audit_finding_annotations','private.course_authoring_corrections',
    'private.course_variant_plan_checkpoints','private.course_variant_comparison_sets',
    'private.course_variant_comparison_members',
    'private.course_design_parameter_changes',
    'private.course_authoring_guidance_revisions',
    'private.course_authoring_guidance_interpretations',
    'private.course_component_policy_changes',
    'private.course_anchored_annotation_events',
    'private.course_anchored_annotation_receipts','private.course_inspection_focuses',
    'private.course_source_revisions','private.course_source_anchor_revisions'
  ]) name where to_regclass(name) is not null
),array[]::text[],'todas as tabelas substituídas foram removidas');

select is(array(
  select signature from unnest(array[
    'public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)',
    'public.materialize_course_authoring_part_for_actor_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)',
    'public.get_owned_course_instructional_plan_for_actor_v2(uuid,uuid)',
    'public.get_owned_course_design_for_actor_v2(uuid,uuid,text,text,integer,text)',
    'public.apply_course_design_command_for_actor_v2(uuid,uuid,bigint,jsonb,text,text,text)',
    'public.create_course_anchored_annotations_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)',
    'public.get_course_source_pdf_download_for_actor_v1(uuid,uuid,bigint,text,bigint,text)'
  ]) signature where to_regprocedure(signature) is null
),array[]::text[],'todas as fronteiras finais existem');

select is(array(
  select signature from unnest(array[
    'public.get_owned_course_instructional_plan_for_actor_v1(uuid,uuid,integer)',
    'public.get_owned_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid)',
    'public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)',
    'public.advance_course_authoring_part_materialization_for_actor_v2(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)',
    'public.get_owned_course_design_for_actor_v1(uuid,uuid,text,text,integer,text)',
    'public.apply_course_design_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.create_course_inspection_focus_for_actor_v1(uuid,uuid,bigint,text,jsonb,text)',
    'public.get_course_inspection_focus_for_actor_v1(uuid,uuid,uuid)',
    'public.list_owned_course_inspection_focus_units_for_actor_v1(uuid,uuid,bigint,uuid,text,text,integer,integer)',
    'public.get_course_source_attachment_access_for_actor_v1(uuid,uuid,bigint,text,text,bigint,text,bigint,text)',
    'public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.get_owned_course_audit_cycle_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,integer)',
    'public.execute_course_audit_cycle_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.create_course_variants_for_actor_v1(uuid,uuid,bigint,jsonb,text)',
    'public.get_owned_course_variant_comparison_for_actor_v1(uuid,uuid,bigint,uuid)'
  ]) signature where to_regprocedure(signature) is not null
),array[]::text[],'fronteiras antigas não existem');

select is(array(
  select signature from unnest(array[
    'public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)',
    'public.materialize_course_authoring_part_for_actor_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)',
    'public.get_owned_course_design_for_actor_v2(uuid,uuid,text,text,integer,text)',
    'public.apply_course_design_command_for_actor_v2(uuid,uuid,bigint,jsonb,text,text,text)',
    'public.create_course_anchored_annotations_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.get_course_source_pdf_download_for_actor_v1(uuid,uuid,bigint,text,bigint,text)'
  ]) signature where not has_function_privilege('service_role',signature,'execute')
),array[]::text[],'service_role executa as fronteiras internas');

select is(array(
  select signature from unnest(array[
    'public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)',
    'public.materialize_course_authoring_part_for_actor_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)',
    'public.get_owned_course_design_for_actor_v2(uuid,uuid,text,text,integer,text)',
    'public.apply_course_design_command_for_actor_v2(uuid,uuid,bigint,jsonb,text,text,text)',
    'public.create_course_anchored_annotations_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.get_course_source_pdf_download_for_actor_v1(uuid,uuid,bigint,text,bigint,text)'
  ]) signature where has_function_privilege('authenticated',signature,'execute')
    or has_function_privilege('anon',signature,'execute')
),array[]::text[],'clientes não chamam fronteiras internas');

select is((select count(*) from pg_policy policy_value
  join pg_class relation on relation.oid=policy_value.polrelid
  join pg_namespace namespace_value on namespace_value.oid=relation.relnamespace
  where namespace_value.nspname='storage' and relation.relname='objects'
    and (coalesce(pg_get_expr(policy_value.polqual,policy_value.polrelid),'')
      ||coalesce(pg_get_expr(policy_value.polwithcheck,policy_value.polrelid),''))
      like '%course-source-pdfs%'),0::bigint,
  'bucket PDF não possui acesso direto por policy');

select is((select count(*) from pg_class relation
  join pg_namespace namespace_value on namespace_value.oid=relation.relnamespace
  where namespace_value.nspname='private' and relation.relkind='r'
    and relation.relname in(
      'course_design_parameter_assignments','course_authoring_guidance_assignments',
      'course_component_policy_assignments','course_sources','course_source_anchors'
    ) and relation.relrowsecurity and relation.relforcerowsecurity),5::bigint,
  'autoridades correntes privadas mantêm FORCE RLS');

select is((with candidate as materialized(
    select procedure_value.oid from pg_proc procedure_value
    join pg_namespace namespace_value on namespace_value.oid=procedure_value.pronamespace
    where namespace_value.nspname in('public','private') and procedure_value.prokind='f'
  ) select count(*) from candidate where pg_get_functiondef(candidate.oid) ~
    '(course_events|course_authoring_part_materializations|course_instructional_audit_runs|course_variant_comparison_sets|course_design_parameter_changes|course_source_revisions|course_anchored_annotation_receipts|attach_course_source_pdf_for_actor_v1|unresolved_legacy|imported_legacy|legacy_reference|before_pdf_lifecycle|valid_course_source_links_shape_v1)'
),0::bigint,'nenhuma função final referencia o runtime removido');

select ok((select count(*) from pg_constraint constraint_value
  join pg_class relation on relation.oid=constraint_value.conrelid
  join pg_namespace namespace_value on namespace_value.oid=relation.relnamespace
  where namespace_value.nspname='private'
    and relation.relname in('course_sources','course_source_anchors',
      'course_source_attributions')
    and constraint_value.contype='u')=4
  and not exists(select 1 from information_schema.columns column_value
    where column_value.table_schema='private' and (
      column_value.table_name='course_authoring_parts'
        and column_value.column_name='retired_at'
      or column_value.table_name in(
        'course_source_attributions','course_source_attribution_sources',
        'course_source_attribution_anchors'
      ) and column_value.column_name in(
        'revision','attribution_hash','source_revision','anchor_revision'
      )
    )),
  'estado corrente não conserva tombstones nem revisões de atribuição');

select ok(exists(select 1 from pg_constraint constraint_value
  join pg_class relation on relation.oid=constraint_value.conrelid
  join pg_namespace namespace_value on namespace_value.oid=relation.relnamespace
  where namespace_value.nspname='private'
    and relation.relname='course_change_receipts'
    and pg_get_constraintdef(constraint_value.oid) like
      '%execute_course_anchored_annotation%'),
  'Observações usam o receipt TTL comum');

select ok(not exists(select 1 from pg_proc procedure_value
  join pg_namespace namespace_value on namespace_value.oid=procedure_value.pronamespace
  where namespace_value.nspname='private'
    and procedure_value.proname in(
      'can_upload_course_source_pdf_v1','can_read_course_source_pdf_v1'
    )),'helpers de acesso direto ao PDF foram removidos');

select is((select public.get_aralearn_runtime_manifest()->'features'),
  (select jsonb_agg(to_jsonb(value) order by value)
    from jsonb_array_elements_text(
      public.get_aralearn_runtime_manifest()->'features'
    ) feature(value)),
  'features do manifesto estão em ordem canônica');

select is((select count(*) from pg_trigger trigger_value
  join pg_class relation on relation.oid=trigger_value.tgrelid
  join pg_namespace namespace_value on namespace_value.oid=relation.relnamespace
  where namespace_value.nspname='private' and not trigger_value.tgisinternal
    and relation.relname in(
      'course_sources','course_source_anchors','course_source_attributions',
      'course_source_attribution_sources','course_source_attribution_anchors'
    )),0::bigint,'estado corrente de Fonte não possui trigger append-only');

select is((select count(*) from private.course_design_parameter_definitions),
  4::bigint,'permanecem exatamente quatro parâmetros pedagógicos');

select * from finish();
rollback;
