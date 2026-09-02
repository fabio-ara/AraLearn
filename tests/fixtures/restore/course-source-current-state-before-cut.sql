\set ON_ERROR_STOP on

begin;

insert into auth.users(
  id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,
  created_at,updated_at
) values(
  '74000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','restore-fixture@example.test',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"test":"backup-restore-cutover"}'::jsonb,now(),now()
);

insert into public.courses(id,owner_id,title,goal,revision)
values(
  '74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000001',
  'Curso descartável de restauração',
  'Provar que o corte preserva o estado corrente de Fontes e PDFs.',
  4
);

set constraints all deferred;
insert into private.course_entities(
  course_id,entity_type,entity_id,parent_type,parent_id,position,content,version
) values
  ('74000000-0000-4000-8000-000000000002','module','module-restore',null,null,0,
    '{"title":"Módulo restaurado"}'::jsonb,1),
  ('74000000-0000-4000-8000-000000000002','lesson','lesson-restore','module','module-restore',0,
    '{"title":"Lição restaurada"}'::jsonb,1),
  ('74000000-0000-4000-8000-000000000002','microsequence','micro-restore','lesson','lesson-restore',0,
    '{"title":"Microssequência restaurada"}'::jsonb,1),
  ('74000000-0000-4000-8000-000000000002','study_unit','unit-restore','microsequence','micro-restore',1,
    '{"title":"StudyUnit restaurada","components":[]}'::jsonb,1);

update private.course_entities
set created_at=now()-interval '30 minutes',
  updated_at=now()-interval '20 minutes'
where course_id='74000000-0000-4000-8000-000000000002'
  and entity_type='study_unit' and entity_id='unit-restore';

insert into private.course_instructional_plans(
  id,course_id,audience,instructional_scope,preferred_authoring_part_min,
  preferred_authoring_part_max,part_count_origin,version
) values(
  '74000000-0000-4000-8000-000000000010',
  '74000000-0000-4000-8000-000000000002',
  'Pessoas iniciantes.','Compreender o papel de uma Fonte verificável.',7,12,
  'automatic',2
);

insert into private.course_instructional_plan_items(
  id,course_id,instructional_plan_id,item_kind,position,statement,version
) values
  ('74000000-0000-4000-8000-000000000011','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000010','intended_learning_outcome',0,
    'Explicar por que uma afirmação precisa de sustentação verificável.',1),
  ('74000000-0000-4000-8000-000000000012','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000010','instructional_analysis_unit',0,
    'Uma Âncora localiza o trecho que sustenta uma afirmação.',1),
  ('74000000-0000-4000-8000-000000000013','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000010','evidence_requirement',0,
    'Relacionar uma afirmação nova à Âncora que a sustenta.',1);

insert into private.course_authoring_parts(
  id,course_id,instructional_plan_id,position,title,intent,version
) values(
  '74000000-0000-4000-8000-000000000014',
  '74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000010',0,
  'Parte 1 · Fonte e Âncora',
  'Apresentar a relação entre afirmação, Fonte e Âncora.',1
);

insert into private.course_authoring_part_didactic_microsequences(
  course_id,authoring_part_id,didactic_microsequence_id,production_position
) values(
  '74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000014','micro-restore',0
);

insert into private.course_design_target_plan_items(
  course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
) values
  ('74000000-0000-4000-8000-000000000002','micro-restore',
    '74000000-0000-4000-8000-000000000012','instructional_analysis_unit'),
  ('74000000-0000-4000-8000-000000000002','micro-restore',
    '74000000-0000-4000-8000-000000000013','evidence_requirement');

insert into private.course_design_parameter_changes(
  course_id,course_revision,parameter_id,scope_kind,scope_ref,action,value,
  origin,reason,actor_id,channel,created_at
) values
  ('74000000-0000-4000-8000-000000000002',2,
    'new_analysis_unit_ceiling_per_expository_study_unit','didactic_microsequence',
    'micro-restore','set','2'::jsonb,'author','Condição anterior.',
    '74000000-0000-4000-8000-000000000001','application',now()-interval '2 days'),
  ('74000000-0000-4000-8000-000000000002',3,
    'new_analysis_unit_ceiling_per_expository_study_unit','didactic_microsequence',
    'micro-restore','set','1'::jsonb,'research_condition','Condição corrente.',
    '74000000-0000-4000-8000-000000000001','application',now()-interval '1 day');

insert into private.course_authoring_guidance_revisions(
  revision_id,course_id,course_revision,scope_kind,scope_ref,action,guidance,
  origin,reason,actor_id,channel,created_at
) values
  ('74000000-0000-4000-8000-000000000015',
    '74000000-0000-4000-8000-000000000002',3,'didactic_microsequence',
    'micro-restore','set','Use títulos diretos e preserve toda novidade necessária.',
    'author','Direção editorial corrente.','74000000-0000-4000-8000-000000000001',
    'application',now()-interval '1 day');

insert into private.course_component_policy_changes(
  course_id,course_revision,scope_kind,scope_ref,action,policy,origin,reason,
  actor_id,channel,created_at
) values(
  '74000000-0000-4000-8000-000000000002',3,'didactic_microsequence',
  'micro-restore','set',
  '{"catalogVersion":"1-3e5629f8","availability":"all","allowedRefs":[],"excludedRefs":[],"preferredRefs":[]}'::jsonb,
  'author','Escolha funcional corrente.','74000000-0000-4000-8000-000000000001',
  'application',now()-interval '1 day'
);

insert into private.course_authoring_part_materializations(
  id,course_id,authoring_part_id,authoring_part_version,actor_id,channel,status,
  version,design_context,result_facts,started_at,updated_at,completed_at
) values
  ('74000000-0000-4000-8000-000000000016','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000014',1,
    '74000000-0000-4000-8000-000000000001','mcp','completed',2,
    '{"targets":[{"didacticMicrosequenceId":"micro-restore","instructionalAnalysisUnitIds":["74000000-0000-4000-8000-000000000012"],"evidenceRequirementIds":["74000000-0000-4000-8000-000000000013"],"parameters":[{"parameterId":"new_analysis_unit_ceiling_per_expository_study_unit","value":2,"origin":"author"}],"guidanceRevisionIds":[],"componentPolicy":null}],"guidanceRevisions":[]}'::jsonb,
    '{}'::jsonb,now()-interval '2 days',now()-interval '1 day',now()-interval '1 day'),
  ('74000000-0000-4000-8000-000000000017','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000014',1,
    '74000000-0000-4000-8000-000000000001','mcp','completed',2,
    '{"targets":[{"didacticMicrosequenceId":"micro-restore","instructionalAnalysisUnitIds":["74000000-0000-4000-8000-000000000012"],"evidenceRequirementIds":["74000000-0000-4000-8000-000000000013"],"parameters":[{"parameterId":"new_analysis_unit_ceiling_per_expository_study_unit","value":1,"origin":"research_condition"}],"guidanceRevisionIds":["74000000-0000-4000-8000-000000000015"],"componentPolicy":{"policy":{"catalogVersion":"1-3e5629f8","availability":"all","allowedRefs":[],"excludedRefs":[],"preferredRefs":[]},"origin":"author","sourceScope":{"kind":"didactic_microsequence","ref":"micro-restore"}}}],"guidanceRevisions":[{"revisionId":"74000000-0000-4000-8000-000000000015","guidance":"Use títulos diretos e preserve toda novidade necessária.","origin":"author","sourceScope":{"kind":"didactic_microsequence","ref":"micro-restore"}}]}'::jsonb,
    '{}'::jsonb,now()-interval '1 hour',now(),now());

insert into private.course_authoring_part_materialization_steps(
  id,course_id,materialization_id,position,step_kind,
  target_didactic_microsequence_id,production_position,status,version,
  result_facts,created_at,updated_at,completed_at
) values
  ('74000000-0000-4000-8000-000000000018','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000016',0,
    'didactic_microsequence_materialization','micro-restore',0,'completed',2,
    '{"designApplication":{"studyUnits":[{"studyUnitId":"unit-restore","mode":"expository","introducedInstructionalAnalysisUnitIds":[],"explanationApplications":[],"practiceApplications":[],"componentRefs":["aralearn.resource.paragraph@1.0.0"]}]}}'::jsonb,
    now()-interval '2 days',now()-interval '1 day',now()-interval '1 day'),
  ('74000000-0000-4000-8000-000000000019','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000017',0,
    'didactic_microsequence_materialization','micro-restore',0,'completed',2,
    '{"designApplication":{"studyUnits":[{"studyUnitId":"unit-restore","mode":"mixed","introducedInstructionalAnalysisUnitIds":["74000000-0000-4000-8000-000000000012"],"explanationApplications":[{"instructionalAnalysisUnitId":"74000000-0000-4000-8000-000000000012","developedForms":["plain_definition","concrete_example"],"notApplicable":[]}],"practiceApplications":[{"evidenceRequirementId":"74000000-0000-4000-8000-000000000013","opportunityId":"restore-practice-1","invariantTaskOperation":"relacionar afirmação e Âncora","variedDimensions":["case_or_data"]}],"componentRefs":["aralearn.resource.paragraph@1.0.0","aralearn.response.choice@1.0.0"]}]}}'::jsonb,
    now()-interval '1 hour',now(),now());

insert into private.course_source_revisions(
  course_id,source_id,revision,status,kind,title,authorship,publication_date,
  identifier,language,citation_text,url,edition_or_version,origin,availability,
  verification_status,study_visibility,actor_id,created_at
) values
  ('74000000-0000-4000-8000-000000000002','source-restore',1,'active','document',
    'Título anterior','AraLearn','2026-08-01',null,'pt-BR','Citação anterior.',null,null,
    'author_provided','private','author_verified','citation',
    '74000000-0000-4000-8000-000000000001',now()-interval '2 days'),
  ('74000000-0000-4000-8000-000000000002','source-restore',2,'active','document',
    'Título corrente','AraLearn','2026-09-02',null,'pt-BR','Citação corrente.',null,null,
    'author_provided','private','author_verified','citation',
    '74000000-0000-4000-8000-000000000001',now()-interval '1 day');

insert into private.course_source_revisions(
  course_id,source_id,revision,status,kind,title,authorship,publication_date,
  identifier,language,citation_text,url,edition_or_version,origin,availability,
  verification_status,study_visibility,actor_id,created_at
)
select
  '74000000-0000-4000-8000-000000000002',
  repeat('legacy-ref-',26)||'end',1,'unresolved_legacy',null,null,null,null,
  null,null,null,null,null,'imported_legacy','unknown','unverified','hidden',
  null,now()-interval '3 days';

insert into private.course_source_anchor_revisions(
  course_id,anchor_id,revision,source_id,source_revision,status,selector,
  verification_excerpt,actor_id,created_at,human_locator
) values
  ('74000000-0000-4000-8000-000000000002','anchor-restore',1,
    'source-restore',1,'active','{"kind":"page_range","startPage":1,"endPage":1}'::jsonb,
    'Trecho anterior.','74000000-0000-4000-8000-000000000001',
    now()-interval '2 days','p. 1'),
  ('74000000-0000-4000-8000-000000000002','anchor-restore',2,
    'source-restore',2,'active','{"kind":"page_range","startPage":2,"endPage":3}'::jsonb,
    'Trecho corrente.','74000000-0000-4000-8000-000000000001',
    now()-interval '1 day','pp. 2–3');

with target as(
  select private.course_source_target_state_v1(
    '74000000-0000-4000-8000-000000000002','study_unit','unit-restore'
  ) value
)
insert into private.course_source_attributions(
  course_id,id,target_kind,target_id,target_version,target_hash,revision,
  attribution_hash,actor_id,created_at
)
select '74000000-0000-4000-8000-000000000002',id,'study_unit','unit-restore',
  (target.value->>'version')::bigint,target.value->>'hash',revision,
  repeat(hash_character,64),'74000000-0000-4000-8000-000000000001',created_at
from target cross join(values
  ('74000000-0000-4000-8000-000000000003'::uuid,1,'a',now()-interval '2 days'),
  ('74000000-0000-4000-8000-000000000004'::uuid,2,'b',now()-interval '1 day')
) value(id,revision,hash_character,created_at);

insert into private.course_source_attribution_sources(
  course_id,attribution_id,source_ordinal,source_id,source_revision,relation
) values
  ('74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000003',
    0,'source-restore',1,'supported_by'),
  ('74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000004',
    0,'source-restore',2,'quoted_from'),
  ('74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000004',
    1,repeat('legacy-ref-',26)||'end',1,'legacy_reference');

insert into private.course_source_attribution_anchors(
  course_id,attribution_id,source_ordinal,anchor_ordinal,source_id,
  source_revision,anchor_id,anchor_revision
) values
  ('74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000003',
    0,0,'source-restore',1,'anchor-restore',1),
  ('74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000004',
    0,0,'source-restore',2,'anchor-restore',2);

insert into private.course_source_attachments(
  course_id,source_id,source_revision,content_hash,byte_size,media_type,
  storage_path,actor_id,created_at,status,version,updated_at,updated_by,
  removed_at,removed_by,removed_course_revision
) values
  ('74000000-0000-4000-8000-000000000002','source-restore',2,repeat('c',64),512,
    'application/pdf','74000000-0000-4000-8000-000000000002/'||repeat('c',64)||'.pdf',
    '74000000-0000-4000-8000-000000000001',now()-interval '1 day','active',1,
    now()-interval '1 day','74000000-0000-4000-8000-000000000001',null,null,null),
  ('74000000-0000-4000-8000-000000000002','source-restore',1,repeat('d',64),384,
    'application/pdf','74000000-0000-4000-8000-000000000002/'||repeat('d',64)||'.pdf',
    '74000000-0000-4000-8000-000000000001',now()-interval '2 days','removed',2,
    now()-interval '1 day','74000000-0000-4000-8000-000000000001',
    now()-interval '1 day','74000000-0000-4000-8000-000000000001',4);

insert into private.course_source_pdf_upload_intents(
  actor_id,course_id,storage_path,content_hash,byte_size,media_type,source_id,
  source_revision,course_revision,created_at,expires_at,request_id,request_fingerprint
) values
  ('74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000002/'||repeat('e',64)||'.pdf',repeat('e',64),
    256,'application/pdf','source-restore',2,4,now(),now()+interval '8 minutes',
    'restore.upload.live',repeat('e',64)),
  ('74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000002/'||repeat('f',64)||'.pdf',repeat('f',64),
    256,'application/pdf','source-restore',2,4,now()-interval '20 minutes',
    now()-interval '12 minutes','restore.upload.expired',repeat('f',64));

insert into private.course_source_pdf_delete_intents(
  actor_id,request_id,course_id,source_id,content_hash,storage_path,state
) values(
  '74000000-0000-4000-8000-000000000001','restore.delete.pending',
  '74000000-0000-4000-8000-000000000002','source-restore',repeat('d',64),
  '74000000-0000-4000-8000-000000000002/'||repeat('d',64)||'.pdf','pending'
);

insert into private.course_anchored_annotations(
  id,course_id,actor_id,origin,channel,target_kind,target_id,observed_path,
  observed_course_revision,observed_target_version,observed_revision_certainty,
  raw_text,category,brief_summary,automatic_method,automatic_method_version,
  automatic_taxonomy_revision,automatic_subject_refs,effective_method,
  effective_method_version,effective_taxonomy_revision,effective_subject_refs,
  owner_response,owner_response_kind,owner_response_source_links,responded_at,
  state,resolved_at,version
) values
  ('74000000-0000-4000-8000-000000000020','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000001','author','authoring_interface',
    'study_unit','unit-restore',jsonb_build_array(
      jsonb_build_object('kind','course','id','74000000-0000-4000-8000-000000000002','label','Curso descartável de restauração','version',4),
      jsonb_build_object('kind','module','id','module-restore','label','Módulo restaurado','version',1),
      jsonb_build_object('kind','lesson','id','lesson-restore','label','Lição restaurada','version',1),
      jsonb_build_object('kind','didactic_microsequence','id','micro-restore','label','Microssequência restaurada','version',1),
      jsonb_build_object('kind','study_unit','id','unit-restore','label','StudyUnit restaurada','version',1)
    ),4,1,'known','Explique melhor a relação com a Âncora.','suggestion',
    'Rever a ligação com a Âncora.','target_scope_unclassified',1,1,'[]'::jsonb,
    'target_scope_unclassified',1,1,'[]'::jsonb,
    null,null,'[]'::jsonb,null,'open',null,1),
  ('74000000-0000-4000-8000-000000000021','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000001','author','authoring_interface',
    'study_unit','unit-restore',jsonb_build_array(
      jsonb_build_object('kind','course','id','74000000-0000-4000-8000-000000000002','label','Curso descartável de restauração','version',4),
      jsonb_build_object('kind','module','id','module-restore','label','Módulo restaurado','version',1),
      jsonb_build_object('kind','lesson','id','lesson-restore','label','Lição restaurada','version',1),
      jsonb_build_object('kind','didactic_microsequence','id','micro-restore','label','Microssequência restaurada','version',1),
      jsonb_build_object('kind','study_unit','id','unit-restore','label','StudyUnit restaurada','version',1)
    ),4,1,'known','A distinção já foi corrigida.','suggestion','Correção conferida.',
    'target_scope_unclassified',1,1,'[]'::jsonb,
    'target_scope_unclassified',1,1,'[]'::jsonb,
    'A Fonte corrente sustenta a reformulação.','reformulation',
    '[{"sourceId":"source-restore","sourceRevision":1,"relation":"supported_by","anchors":[{"anchorId":"anchor-restore","anchorRevision":1}]}]'::jsonb,
    now()-interval '1 hour','resolved',now()-interval '1 hour',2);

insert into private.course_change_receipts(
  actor_id,request_id,operation,course_id,request_hash,result,created_at,expires_at
) values
  ('74000000-0000-4000-8000-000000000001','restore.receipt.live',
    'execute_course_source_command','74000000-0000-4000-8000-000000000002',
    repeat('1',64),'{"contract":"restore-fixture","state":"open"}'::jsonb,
    now(),now()+interval '1 day'),
  ('74000000-0000-4000-8000-000000000001','restore.receipt.expired',
    'update_audit_cycle','74000000-0000-4000-8000-000000000002',
    repeat('2',64),'{"contract":"restore-fixture","state":"closed"}'::jsonb,
    now()-interval '2 days',now()-interval '1 day');

commit;
