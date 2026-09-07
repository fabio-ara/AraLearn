begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('00000000-0000-0000-0000-000000000000','96000000-0000-4000-8000-000000000001','authenticated','authenticated','metadata-owner@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','96000000-0000-4000-8000-000000000002','authenticated','authenticated','metadata-reader@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal,visibility) values('96000000-0000-4000-8000-000000000101',
 '96000000-0000-4000-8000-000000000001','Título inicial','Objetivo inicial','public');
insert into private.course_instructional_plans(course_id) values('96000000-0000-4000-8000-000000000101');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
 ('96000000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
 ('96000000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
 ('96000000-0000-4000-8000-000000000101','microsequence','s','lesson','l',0,'{"title":"Sequência","dependsOn":[]}'),
 ('96000000-0000-4000-8000-000000000101','study_unit','u','microsequence','s',1,'{"title":"Unidade","topics":[]}');
create temporary table metadata_result as select public.commit_course_composition_for_actor_v1(
 '96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000101',1,null,'[]','[]','[]',
 'application',null,'metadata-only-01','{"title":"Título novo","objective":"Objetivo novo"}') result;
select is((select result->>'revision' from metadata_result),'2','metadados sem linhas avançam revisão uma vez');
select is((select result->>'updatedCount' from metadata_result),'0','contagens continuam representando entidades');
select is((select title||' / '||goal from public.courses where id='96000000-0000-4000-8000-000000000101'),
 'Título novo / Objetivo novo','título e objetivo persistem juntos');
select is(public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',1,null,'[]','[]','[]','application',null,'metadata-only-01',
 '{"title":"Título novo","objective":"Objetivo novo"}')->>'idempotent','true','retry usa mesmo receipt');
select throws_ok($t$select public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',1,null,'[]','[]','[]','application',null,'metadata-only-01',
 '{"title":"Outro título","objective":"Objetivo novo"}')$t$,'23514','requestId reutilizado com composição incompatível.','hash inclui metadados');
select throws_ok($t$select public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',1,null,'[]','[]','[]','application',null,'metadata-stale-01',
 '{"title":"Outro título","objective":"Objetivo novo"}')$t$,'PT409','O Curso mudou; releia antes de salvar.','CAS rejeita versão antiga');
select throws_ok($t$select public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000002',
 '96000000-0000-4000-8000-000000000101',2,null,'[]','[]','[]','application',null,'metadata-other-01',
 '{"title":"Outro título","objective":"Objetivo novo"}')$t$,'42501','Edição do Curso não autorizada.','estudante público não edita metadados');
select throws_ok($t$select public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',2,1,'[]','[]','[]','application','manual','metadata-focal-01',
 '{"title":"Outro título","objective":"Objetivo novo"}')$t$,'22023','Metadados não pertencem à edição focal de unidade.','metadados não contornam escopo focal');
select throws_ok($t$select public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',2,null,'[]','[]','[]','application',null,'metadata-shape-01',
 '{"title":"Outro título","objective":"Objetivo novo","ownerId":"outro"}')$t$,'22023','Metadados do curso inválidos.','nenhuma autoridade incidental no patch');
select is(public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',2,null,'[]','[]','[]','application',null,'metadata-noop-01',
 '{"title":"Título novo","objective":"Objetivo novo"}')->>'revision','2','metadados iguais não alteram revisão');
select is(public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',2,null,
 '[{"entityType":"module","entityId":"m","parentType":null,"parentId":null,"position":0,"content":{"title":"Módulo alterado"}}]',
 '[]','[]','application',null,'metadata-rows-01','{"title":"Título combinado","objective":"Objetivo combinado"}')->>'revision','3','metadados e linhas usam uma revisão');
select is((select content->>'title' from private.course_entities where course_id='96000000-0000-4000-8000-000000000101' and entity_id='m'),'Módulo alterado','composição grava a entidade no mesmo comando');
select throws_ok($t$select public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',3,null,
 '[{"entityType":"lesson","entityId":"invalid","parentType":"module","parentId":"missing","position":0,"content":{"title":"Lição inválida"}}]',
 '[]','[]','application',null,'metadata-invalid-01','{"title":"Não persistir","objective":"Não persistir"}')$t$,
 '23514','A alteração produziria estrutura de Curso inválida.','erro de estrutura reverte o comando inteiro');
select is((select title from public.courses where id='96000000-0000-4000-8000-000000000101'),'Título combinado','falha não deixa título parcial');
select ok(not exists(select 1 from private.course_entities where course_id='96000000-0000-4000-8000-000000000101' and entity_id='invalid'),'falha não deixa linha parcial');
select ok(not exists(select 1 from private.course_change_receipts where actor_id='96000000-0000-4000-8000-000000000001' and request_id='metadata-invalid-01'),'falha não deixa receipt de sucesso');

insert into private.course_sources(course_id,source_id,revision,status,kind,title,citation_text,origin,availability,verification_status,study_visibility)
 values('96000000-0000-4000-8000-000000000101','source',1,'active','document','Fonte sintética','Referência legível','author_provided','private','author_verified','citation');
insert into private.course_source_anchors(course_id,anchor_id,revision,source_id,source_revision,status,selector,verification_excerpt,human_locator)
 values('96000000-0000-4000-8000-000000000101','anchor',1,'source',1,'active','{"kind":"page_range","startPage":2,"endPage":2}','Trecho privado de verificação','p. 2');
select is(public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',3,null,
 '[{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Unidade","topics":[]}}]',
 '[]','[{"studyUnitId":"u","sourceLinks":[{"linkId":"metadata-source-link","sourceId":"source","relation":"supported_by","roles":[],"anchors":[{"anchorId":"anchor"}],"occurrences":[]}]}]',
 'application',null,'metadata-source-01','{"title":"Título com fonte","objective":"Objetivo com fonte"}')->>'revision','4','metadados e atribuição sem mudança textual não duplicam revisão');
select is(public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',4,null,
 '[{"entityType":"module","entityId":"m","parentType":null,"parentId":null,"position":0,"content":{"title":"Módulo alterado"}}]',
 '[]','[]','application',null,'metadata-omitted-01')->>'revision','4','chamada estrutural existente omite metadados sem ambiguidade');
select is(public.commit_course_composition_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',4,
 '[{"entityType":"module","entityId":"m","parentType":null,"parentId":null,"position":0,"content":{"title":"Módulo alterado"}}]',
 '[]','[]','metadata-inner-01')->>'revision','4','camada de composição existente preserva argumento opcional');
insert into private.course_source_attachments(course_id,source_id,source_revision,content_hash,byte_size,media_type,storage_path)
 values('96000000-0000-4000-8000-000000000101','source',1,repeat('b',64),64,'application/pdf',
 '96000000-0000-4000-8000-000000000101/'||repeat('b',64)||'.pdf');
select ok(not private.can_read_course_file_v1('96000000-0000-4000-8000-000000000101',null,'source',repeat('b',64)),
 'curso público começa com arquivo restrito');
select is(public.set_course_source_file_access_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',4,'source',1,'available','citation-file-01',repeat('b',64))->>'sourceRevision','2',
 'liberação por arquivo confirma revisão da fonte');
select ok(private.can_read_course_file_v1('96000000-0000-4000-8000-000000000101',null,'source',repeat('b',64)),
 'política pública explícita autoriza arquivo de fonte citation');
select is(public.set_course_source_file_access_for_actor_v1('96000000-0000-4000-8000-000000000001',
 '96000000-0000-4000-8000-000000000101',4,'source',1,'available','citation-file-01',repeat('b',64))->>'idempotent','true',
 'retry da liberação não altera revisão novamente');
select is(public.get_course_source_pdf_download_for_actor_v1(null,'96000000-0000-4000-8000-000000000101',5,'source',2,repeat('b',64))->>'contract',
 'aralearn.course-source-pdf-download.v1','autorização interna de download concorda com política pública');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select is(public.get_course_study_citations_v1('96000000-0000-4000-8000-000000000101',5,'u')->'citations'->0->'anchors'->0->>'humanLocator','p. 2','visitante recebe localização legível');
select ok(not (public.get_course_study_citations_v1('96000000-0000-4000-8000-000000000101',5,'u')->'citations'->0->'anchors'->0 ? 'verificationExcerpt'),'projeção pública não contém campo de verificação privado');
select is(public.get_course_study_citations_v1('96000000-0000-4000-8000-000000000101',5,'u')->'citations'->0->'attachments',
 jsonb_build_array(jsonb_build_object('contentHash',repeat('b',64),'byteSize',64,'mediaType','application/pdf')),
 'visitante recebe somente identificação lógica do PDF liberado por arquivo');
reset role;
select is((select verification_excerpt from private.course_source_anchors where course_id='96000000-0000-4000-8000-000000000101' and anchor_id='anchor'),
 'Trecho privado de verificação','valor útil da fonte permanece no banco');
select * from finish();
rollback;
