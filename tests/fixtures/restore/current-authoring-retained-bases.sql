\set ON_ERROR_STOP on
-- Runs only in the disposable restored database after every current migration.
-- These PDF rows are metadata: recovery of actual bytes is a separate Storage proof.
do $fixture$
declare actor uuid:='74540000-0000-4000-8000-000000000001';
  course uuid:='74540000-0000-4000-8000-000000000101'; note uuid; course_revision bigint;
  targets jsonb:='[{"kind":"study_unit","id":"unit-context-a"},{"kind":"microsequence_explanation","id":"micro-context"}]';
begin
  if to_regclass('private.course_observation_bases') is null or not exists(
    select 1 from public.courses where id=course and owner_id=actor and title='Restauração contextual privada') then
    raise exception 'A fixture exige a restauração contextual sintética no contrato corrente.';
  end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into private.course_source_attachments(course_id,source_id,source_revision,content_hash,byte_size,media_type,
    storage_path,status,version)
    select course,'source-context',revision,repeat('e',64),512,'application/pdf',course::text||'/'||repeat('e',64)||'.pdf','active',1
    from private.course_sources where course_id=course and source_id='source-context';
  foreach note in array array['74540000-0000-4000-8000-000000000301'::uuid,'74540000-0000-4000-8000-000000000302'::uuid] loop
    select revision into course_revision from public.courses where id=course;
    perform private.execute_course_anchored_annotation_command_core_v1(actor,course,course_revision,
      jsonb_build_object('type','create_anchored_annotation','annotationId',note,'target',targets->0,'targets',targets,
        'rawText','Conservar a intenção nos dois objetos e a base compartilhada.','category',null,'capturedAt',null,'briefSummary',null),
      'author','authoring_interface','restore-current-note-'||note::text,true);
  end loop;
  perform set_config('aralearn.editorial_actor',actor::text,true);
  perform set_config('aralearn.editorial_channel','restore-fixture',true);
  perform set_config('aralearn.editorial_origin','human',true);
  update private.course_entities set content=jsonb_set(content,'{title}','"Intervenção humana preservada"')
    where course_id=course and entity_type='study_unit' and entity_id='unit-context-a';
  perform set_config('aralearn.editorial_origin','ai',true);
  update private.course_entities set content=jsonb_set(content,'{title}','"Revisão por IA preservada"')
    where course_id=course and entity_type='study_unit' and entity_id='unit-context-a';
  update private.course_source_attachments set status='removed',removed_at=now(),removed_course_revision=course_revision,updated_at=clock_timestamp(),
    version=version+1 where course_id=course and source_id='source-context';
  perform public.record_course_ai_inspection_for_actor_v1(actor,course,'study_unit','unit-context-a',
    private.course_ai_inspection_basis_hash_v1(course,'study_unit','unit-context-a'),
    '{"summary":"Conteúdo sintético inspecionado na base corrente.","outcome":"consistent","findings":[]}',
    'restore-current-inspection');
  perform private.execute_course_anchored_annotation_command_core_v1(actor,course,null,
    jsonb_build_object('type','decide_anchored_annotation','annotationId','74540000-0000-4000-8000-000000000301',
      'expectedAnnotationVersion',1,'expectedTargetSetVersion',1,'decision','cancel','reason','Intenção cancelada apenas neste alvo.',
      'targets',jsonb_build_array(jsonb_build_object('kind','study_unit','id','unit-context-a',
        'expectedBasisHash',private.course_observation_basis_hash_v1(course,'study_unit','unit-context-a')))),
    'author','authoring_interface','restore-current-partial-decision',true);
  if (select count(*) from private.course_observation_bases b where course_id=course and exists(
      select 1 from private.course_observation_targets t where t.course_id=b.course_id and t.target_kind=b.target_kind
        and t.target_id=b.target_id and t.basis_hash=b.basis_hash and t.annotation_id in
        ('74540000-0000-4000-8000-000000000301','74540000-0000-4000-8000-000000000302')))<>2
    or (select count(*) from private.course_observation_targets where course_id=course and basis_hash is not null
      and annotation_id in ('74540000-0000-4000-8000-000000000301','74540000-0000-4000-8000-000000000302'))<>3
    or private.course_ai_inspection_state_v1(course,'study_unit','unit-context-a')->>'state'<>'current'
    or not private.course_file_is_referenced_v1('course-source-pdfs',course::text||'/'||repeat('e',64)||'.pdf')
    or private.course_current_file_is_referenced_v1('course-source-pdfs',course::text||'/'||repeat('e',64)||'.pdf') then
    raise exception 'A fixture atual não preservou as bases, decisões, inspeção ou PDF retido esperados.';
  end if;
end $fixture$;
