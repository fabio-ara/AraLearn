-- Ensaio local de upgrade: executar antes da migration 20260905062817.
-- Lista exata de identidades persistidas: usuários ...001/...002, cursos ...101/...102.
-- Os demais UUIDs abaixo são IDs locais sintéticos de plano/avatar. Nada hospedado.
begin;
set constraints all deferred;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','92000000-0000-4000-8000-000000000001','authenticated','authenticated','upgrade-owner@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','92000000-0000-4000-8000-000000000002','authenticated','authenticated','upgrade-copy@example.test','',now(),'{}','{}',now(),now());
update public.person_profiles set display_name='Nome legado sintético',
 avatar_object_key='92000000-0000-4000-8000-000000000002/92000000-0000-4000-8000-000000000009.png'
 where user_id='92000000-0000-4000-8000-000000000002';
insert into public.courses(id,owner_id,title,goal,revision) values
 ('92000000-0000-4000-8000-000000000101','92000000-0000-4000-8000-000000000001','Origem sintética','Provar preservação.',7),
 ('92000000-0000-4000-8000-000000000102','92000000-0000-4000-8000-000000000002','Cópia sintética','Provar recuperação.',4);
insert into private.course_instructional_plans(id,course_id) values
 ('92000000-0000-4000-8000-000000000111','92000000-0000-4000-8000-000000000101'),
 ('92000000-0000-4000-8000-000000000112','92000000-0000-4000-8000-000000000102');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,version)
 select '92000000-0000-4000-8000-000000000102'::uuid,entity_type,entity_id,parent_type,parent_id,position,content::jsonb,version
 from (values
 ('module','m',null,null,0,'{"title":"Módulo sintético"}',1),
 ('lesson','l','module','m',0,'{"title":"Lição sintética"}',1),
 ('microsequence','s','lesson','l',0,'{"title":"Sequência sintética"}',1),
 ('study_unit','u','microsequence','s',1,'{"title":"Unidade atual","body":"Alteração posterior preservada"}',3)
 ) e(entity_type,entity_id,parent_type,parent_id,position,content,version);
insert into private.course_personal_copies(target_course_id,actor_id,source_course_ref,source_course_revision,
 study_unit_id,creation_hash,initial_course_revision,initial_study_unit_version,application_origin,initial_updated_at)
 values('92000000-0000-4000-8000-000000000102','92000000-0000-4000-8000-000000000002',
 '92000000-0000-4000-8000-000000000101',3,'u',private.course_source_json_hash_v1(jsonb_build_object(
 'operation','commit_personal_course_copy_edit','actorId','92000000-0000-4000-8000-000000000002',
 'sourceCourseId','92000000-0000-4000-8000-000000000101','expectedSourceRevision',3,'expectedStudyUnitVersion',1,
 'upsert','{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Edição inicial"}}'::jsonb,
 'applicationOrigin','manual')),2,2,'manual',now());
insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
 select actor_id,'upgrade-lost-response','commit_personal_course_copy_edit',target_course_id,creation_hash,
 jsonb_build_object('contract','aralearn.personal-course-copy-edit.v1','sourceCourseId',source_course_ref,
 'targetCourseId',target_course_id,'studyUnitId','u','changed',true,'targetCourseRevision',2,'studyUnitVersion',2)
 from private.course_personal_copies where target_course_id='92000000-0000-4000-8000-000000000102';
commit;
