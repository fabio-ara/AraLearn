begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',id::uuid,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now()
from (values ('93000000-0000-4000-8000-000000000001','public-owner@example.test'),
 ('93000000-0000-4000-8000-000000000002','public-reader@example.test'),
 ('93000000-0000-4000-8000-000000000003','public-other@example.test')) u(id,email);
insert into public.courses(id,owner_id,title,goal) values
 ('93000000-0000-4000-8000-000000000101','93000000-0000-4000-8000-000000000001','Curso sintético público','Provar acesso focal.'),
 ('93000000-0000-4000-8000-000000000102','93000000-0000-4000-8000-000000000001','Curso sintético privado','Provar isolamento.');
insert into private.course_instructional_plans(course_id) values
 ('93000000-0000-4000-8000-000000000101'),('93000000-0000-4000-8000-000000000102');
insert into private.course_entities(course_id,entity_type,entity_id,position,content)
 values('93000000-0000-4000-8000-000000000101','module','public-module',0,'{"title":"Módulo público"}');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
 ('93000000-0000-4000-8000-000000000101','lesson','public-lesson','module','public-module',0,'{"title":"Lição pública"}'),
 ('93000000-0000-4000-8000-000000000101','microsequence','public-sequence','lesson','public-lesson',0,'{"title":"Sequência pública","dependsOn":[]}'),
 ('93000000-0000-4000-8000-000000000101','study_unit','public-unit','microsequence','public-sequence',1,'{"title":"Unidade pública","topics":[]}');

select is(public.get_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000001')->>'handle',null::text,'perfil novo exige escolha de identificador');
select is(public.update_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000001','{"handle":" @AUTOR-um "}')->>'handle','autor-um','identificador canônico aceita @ e minúsculas');
select is(public.update_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000002','{"handle":"aluno.dois"}')->>'handle','aluno.dois','pessoa escolhe seu identificador');
select throws_ok($t$select public.update_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000003','{"handle":"ALUNO.DOIS"}')$t$,
 'PH409','Identificador indisponível.','colisão tem erro próprio');
select throws_ok($t$select public.update_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000003','{"handle":"árvore"}')$t$,
 '22023','Identificador inválido.','não translitera identidade');
select throws_ok($t$select public.update_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000003','{"handle":"ab"}')$t$,
 '22023','Identificador inválido.','handle exige três caracteres');
select throws_ok($t$select public.update_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000003','{"handle":"abc-"}')$t$,
 '22023','Identificador inválido.','handle termina alfanumérico');
select throws_ok($t$select public.update_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000003','{"displayName":"Outro nome"}')$t$,
 '22023','Alteração de perfil inválida.','segundo nome não é entrada de perfil');
select ok(not (public.get_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000001') ?| array['email','displayName']), 'perfil não expõe e-mail nem nome anterior');
select is(jsonb_array_length(public.search_course_access_people_for_actor_v1('93000000-0000-4000-8000-000000000001',
 '93000000-0000-4000-8000-000000000101','@al',10)->'items'),1,'busca prefixo no curso próprio');
select throws_ok($t$select public.search_course_access_people_for_actor_v1('93000000-0000-4000-8000-000000000002',
 '93000000-0000-4000-8000-000000000101','al',10)$t$,'PT404','Curso inexistente ou inacessível.','busca não abre diretório a outra pessoa');
select throws_ok($t$select public.search_course_access_people_for_actor_v1('93000000-0000-4000-8000-000000000001',
 '93000000-0000-4000-8000-000000000101','a',10)$t$,'22023','Identificador inválido.','prefixo mínimo dois');
select throws_ok($t$select public.search_course_access_people_for_actor_v1('93000000-0000-4000-8000-000000000001',
 '93000000-0000-4000-8000-000000000101','al',11)$t$,'22023','Limite inválido.','busca limita dez resultados');
select is(public.manage_course_access_for_actor_v3('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',
 'grant_access','aluno.dois','93000000-0000-4000-8000-000000000002',true,'grant-first-01',false)->>'changed','true','grant confirma UUID e handle');
select is(public.manage_course_access_for_actor_v3('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',
 'grant_access','aluno.dois','93000000-0000-4000-8000-000000000002',true,'grant-first-01',false)->>'idempotent','true','grant reproduz receipt sem mutação');
select throws_ok($t$select public.manage_course_access_for_actor_v3('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',
 'grant_access','aluno.dois','93000000-0000-4000-8000-000000000003',true,'grant-stale-01',false)$t$,
 'PT409','Pessoa selecionada mudou; refaça a busca.','handle de outro UUID não concede acesso');
select is(public.update_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000002','{"handle":"aluno.novo"}')->>'handle','aluno.novo','troca handle preserva UUID');
select is(public.update_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000003','{"handle":"aluno.dois"}')->>'handle','aluno.dois','identificador livre pode ser reutilizado');
select throws_ok($t$select public.manage_course_access_for_actor_v3('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',
 'grant_access','aluno.dois','93000000-0000-4000-8000-000000000002',true,'grant-reused-01',false)$t$,
 'PT409','Pessoa selecionada mudou; refaça a busca.','seleção antiga não segue identificador reutilizado');
select ok(exists(select 1 from public.course_access where course_id='93000000-0000-4000-8000-000000000101' and user_id='93000000-0000-4000-8000-000000000002'),'grant existente sobrevive à troca de handle');
update private.course_access_grant_rate_limits set search_attempt_count=60 where actor_id='93000000-0000-4000-8000-000000000001';
select is(public.search_course_access_people_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101','al',10)->>'rateLimited','true','limite de busca é explícito');
select is((select search_attempt_count from private.course_access_grant_rate_limits where actor_id='93000000-0000-4000-8000-000000000001'),61::bigint,'negação conserva contador de tentativas');

select is((select visibility from public.courses where id='93000000-0000-4000-8000-000000000101'),'private','curso criado é privado');
select throws_ok($t$select public.set_course_visibility_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',1,'public','restricted',false,'publish-no-01')$t$,
 '22023','Publicação exige confirmação e política explícitas.','publicação exige confirmação');
select throws_ok($t$select public.set_course_visibility_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',1,'public',null,true,'publish-no-02')$t$,
 '22023','Publicação exige confirmação e política explícitas.','publicação exige política de arquivos');
select is(public.set_course_visibility_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',1,'public','restricted',true,'publish-yes-01')->>'courseRevision','2','publicar incrementa revisão');
select is(public.set_course_visibility_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',1,'public','restricted',true,'publish-yes-01')->>'idempotent','true','replay de publicação não incrementa novamente');
select throws_ok($t$select public.set_course_visibility_for_actor_v1('93000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000101',2,'private','restricted',true,'publish-other-01')$t$,
 '42501','Edição do Curso não autorizada.','aluno público não edita');
select is(private.require_course_access_v1('93000000-0000-4000-8000-000000000101','93000000-0000-4000-8000-000000000003',false),'public','autenticado público passa a guarda de observação');
select throws_ok($t$select private.require_course_access_v1('93000000-0000-4000-8000-000000000101',null,false)$t$,
 '42501','Autenticação obrigatória.','guarda de escrita continua exigindo ator');

select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
set local role anon;
select is(public.get_course_v1('93000000-0000-4000-8000-000000000101')->>'ownership','public','visitante lê curso público sem conta');
select is(public.get_course_v1('93000000-0000-4000-8000-000000000101')->>'canObserve','false','visitante não pode observar');
select ok(not (public.get_course_v1('93000000-0000-4000-8000-000000000101') ?| array['ownerId','copyOrigin','brief','authoringState','canDerive']), 'projeção pública exclui dados internos');
select is(jsonb_array_length(public.list_course_entities_v1('93000000-0000-4000-8000-000000000101',2,10,null,null)->'items'),4,'visitante lê conteúdo permitido com revisão');
select is(public.list_courses_v1('Curso sintético',10,null,null)->>'contract','aralearn.course-list.v2','visitante usa catálogo projetado');
select is(jsonb_array_length(public.list_courses_v1('Curso sintético',10,null,null)->'items'),1,'catálogo anônimo exclui curso privado');
select is(jsonb_array_length(public.get_course_study_citations_v1('93000000-0000-4000-8000-000000000101',2,'public-unit')->'citations'),0,'visitante lê referências sem conta');
select throws_ok($t$select public.get_course_v1('93000000-0000-4000-8000-000000000102')$t$,
 'PT404','Curso inexistente.','visitante não descobre curso privado');
select throws_ok('select * from public.courses','42501','permission denied for table courses','anon não recebe SELECT amplo');
select throws_ok($t$select public.get_person_profile_for_actor_v2('93000000-0000-4000-8000-000000000001')$t$,
 '42501','permission denied for function get_person_profile_for_actor_v2','anon não chama RPC privilegiada');
reset role;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is(public.get_course_v1('93000000-0000-4000-8000-000000000101')->>'canObserve','true','pessoa autenticada pública pode observar');
select is(public.execute_my_course_anchored_annotation_command_v1('93000000-0000-4000-8000-000000000101',2,
 '{"type":"create_anchored_annotation","annotationId":"93000000-0000-4000-8000-000000000201","target":{"kind":"study_unit","id":"public-unit"},"rawText":"Observação sintética pública","category":null,"capturedAt":null,"briefSummary":null}',
 'public-observe-01')->>'changed','true','observação real funciona para aluno público sem grant');
reset role;
select is((select revision from public.courses where id='93000000-0000-4000-8000-000000000101'),2::bigint,'observação não edita conteúdo do curso');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);

insert into private.course_sources(course_id,source_id,revision,status,kind,title,citation_text,origin,availability,verification_status,study_visibility)
 values('93000000-0000-4000-8000-000000000101','source',1,'active','document','Referência sintética','Autor sintético. Referência.','author_provided','private','author_verified','citation_and_link');
insert into private.course_source_attachments(course_id,source_id,source_revision,content_hash,byte_size,media_type,storage_path)
 values('93000000-0000-4000-8000-000000000101','source',1,repeat('a',64),64,'application/pdf',
 '93000000-0000-4000-8000-000000000101/'||repeat('a',64)||'.pdf');
select ok(not private.can_read_course_file_v1('93000000-0000-4000-8000-000000000101',null,'source',repeat('a',64)),'curso público não torna PDF disponível por padrão');
select throws_ok($t$select public.get_course_source_pdf_download_for_actor_v1(null,'93000000-0000-4000-8000-000000000101',2,'source',1,repeat('a',64))$t$,
 '42501','Arquivo não disponível para este acesso.','RPC de download verifica política');
select is(public.set_course_source_file_access_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',2,'source',1,'available','source-allow-01')->>'sourceRevision','2','exceção de fonte incrementa sua revisão');
select ok(private.can_read_course_file_v1('93000000-0000-4000-8000-000000000101',null,'source',repeat('a',64)),'exceção de fonte permite PDF');
select is(public.get_course_source_pdf_download_for_actor_v1(null,'93000000-0000-4000-8000-000000000101',3,'source',2,repeat('a',64))->>'contract','aralearn.course-source-pdf-download.v1','service role obtém assinatura somente após autorização');
select is(public.set_course_source_file_access_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',3,'source',2,'restricted','file-deny-01',repeat('a',64))->>'sourceRevision','3','exceção por arquivo tem revisão');
select ok(not private.can_read_course_file_v1('93000000-0000-4000-8000-000000000101',null,'source',repeat('a',64)),'arquivo restrito prevalece sobre fonte disponível');
select ok(private.can_read_course_file_v1('93000000-0000-4000-8000-000000000101','93000000-0000-4000-8000-000000000001','source',repeat('a',64)),'proprietário mantém acesso ao arquivo restrito');
select is(public.get_owned_course_sources_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',4,'source','source')->'items'->0->>'publicFileAccess','available','owner lê política de fonte para editar');
select is(public.get_owned_course_sources_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',4,'source','source')->'items'->0->'attachments'->0->>'publicFileAccess','restricted','owner lê exceção do arquivo');
select ok(not (select public from storage.buckets where id='course-source-pdfs'),'bucket PDF continua privado');

select is(public.recover_owned_course_copy_for_actor_v1('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000101',1,1,
 '{"entityId":"missing"}','manual','recovery-none-01')->>'status','unresolved','sem prova recuperação não inventa alvo');
insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result) values(
 '93000000-0000-4000-8000-000000000002','recovery-unchanged-01','recover_owned_course_copy',
 '93000000-0000-4000-8000-000000000101',private.course_source_json_hash_v1(jsonb_build_object(
 'operation','commit_personal_course_copy_edit','actorId','93000000-0000-4000-8000-000000000002',
 'sourceCourseId','93000000-0000-4000-8000-000000000101','expectedSourceRevision',1,'expectedStudyUnitVersion',1,
 'upsert','{"entityId":"missing"}'::jsonb,'applicationOrigin','manual')),'{"changed":false}');
select is(public.recover_owned_course_copy_for_actor_v1('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000101',1,1,
 '{"entityId":"missing"}','manual','recovery-unchanged-01')->>'status','unchanged','receipt sem alteração confirma ausência de cópia');
select is(public.recover_owned_course_copy_for_actor_v1('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000101',1,1,
 '{"entityId":"missing"}','manual','recovery-unchanged-01')->>'targetCourseId',null::text,'unchanged não fabrica alvo ou revisão');
select is((select count(*) from public.courses where owner_id='93000000-0000-4000-8000-000000000002'),0::bigint,'recuperação não cria curso');
select is(to_regprocedure('public.commit_personal_course_copy_edit_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)')::text,null::text,'escritor automático foi removido');
select is(to_regprocedure('public.manage_course_access_for_actor_v1(uuid,uuid,text,text,uuid,boolean,text)')::text,null::text,'grant por e-mail foi removido');
select ok(not has_table_privilege('anon','private.person_profile_identity_migration_backup','select'),'arquivo de migração não é público');
select ok(public.get_aralearn_runtime_manifest()->'features' ?& array['person-profile-v2','public-course-study-v1','private-person-avatar-v1'],'manifesto identifica identidade e acesso protegido a avatares');
select ok(not (public.get_aralearn_runtime_manifest()->'features' ? 'personal-course-copy-edit-v1'),'manifesto não promete escritor retirado');
select * from finish();
rollback;
