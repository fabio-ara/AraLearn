begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
set constraints all deferred;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','99290000-0000-4000-8000-000000000001','authenticated','authenticated','review-synthetic@example.test','',now(),'{}','{}',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values('99290000-0000-4000-8000-000000000011','99290000-0000-4000-8000-000000000001',now(),now());
insert into public.courses(id,owner_id,title,goal,visibility)
values('99290000-0000-4000-8000-000000000101','99290000-0000-4000-8000-000000000001','Revisão sintética','Provar identidade da decisão.','public');
insert into private.course_instructional_plans(course_id) values('99290000-0000-4000-8000-000000000101');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('99290000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('99290000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('99290000-0000-4000-8000-000000000101','microsequence','a','lesson','l',0,'{"title":"Relações","goal":"Explicar conexões","dependsOn":[],"explanationPlan":{"purpose":"Desenvolver conexões.","prerequisites":[],"relations":[],"sourceIds":[]},"explanation":{"title":"Conectar elementos","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma conexão permite interação entre elementos. Quando ela é retirada, essa interação deixa de ocorrer; mudar apenas a cor dos elementos não retira a conexão."}}]}}'),
('99290000-0000-4000-8000-000000000101','microsequence','b','lesson','l',1,'{"title":"Independente","dependsOn":[]}'),
('99290000-0000-4000-8000-000000000101','microsequence','c','lesson','l',2,'{"title":"Dependente","dependsOn":["a"]}'),
('99290000-0000-4000-8000-000000000101','study_unit','u1','microsequence','a',1,'{"title":"Observe a conexão","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"A ligação permite que os elementos interajam."}}],"response":null,"feedback":[],"topics":[]}'),
('99290000-0000-4000-8000-000000000101','study_unit','u2','microsequence','a',2,'{"title":"Compare situações","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Compare retirar a ligação e mudar a cor. Qual mudança impede a interação?"}}],"response":null,"feedback":[],"topics":[]}');
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '99290000-0000-4000-8000-000000000201',course_id,id,'instructional_analysis_unit',0,'Conexão','Relação entre elementos.' from private.course_instructional_plans where course_id='99290000-0000-4000-8000-000000000101';

create function pg_temp.read_target(kind text,target text) returns jsonb language sql as $$
 select public.get_owned_course_sources_for_actor_v1('99290000-0000-4000-8000-000000000001','99290000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99290000-0000-4000-8000-000000000101'),'target',null,kind,target)
$$;
select is(pg_temp.read_target('plan_item','99290000-0000-4000-8000-000000000201')->'items','[]'::jsonb,'Item de plano sem atribuição retorna lista vazia');
select is(pg_temp.read_target('study_unit','u1')->'items','[]'::jsonb,'Unidade sem atribuição retorna lista vazia');
select is(pg_temp.read_target('microsequence_explanation','a')->'items','[]'::jsonb,'Explicação sem atribuição retorna lista vazia');
select throws_ok($$select pg_temp.read_target('microsequence_explanation','absent')$$,'PT404','Alvo de proveniência inexistente.','Alvo ausente continua distinto de atribuição ausente');
create temporary table before_noop as select version,content from private.course_entities where course_id='99290000-0000-4000-8000-000000000101' and entity_id='a';
create temporary table no_op_result as select public.commit_course_composition_for_actor_v1(
 '99290000-0000-4000-8000-000000000001','99290000-0000-4000-8000-000000000101',1,null,
 jsonb_build_array(jsonb_build_object('entityType','microsequence','entityId','a','parentType','lesson','parentId','l','position',0,'content',content)),
 '[]','[{"targetKind":"microsequence_explanation","targetId":"a","sourceLinks":[]}]','application','manual','empty-sources-noop',version,null) value from before_noop;
select is((select (value->>'revision')::bigint from no_op_result),2::bigint,'A primeira atribuição vazia avança a revisão do curso');
select is((select (value->>'updatedCount')::integer from no_op_result),0,'Criar atribuição vazia não reescreve a entidade');
select is((select (value->>'microsequenceVersion')::bigint from no_op_result),(select version from before_noop),'Recibo sem mudança conserva versão real da microssequência');
select is(pg_temp.read_target('microsequence_explanation','a')#>'{items,0,sourceLinks}','[]'::jsonb,'Atribuição vazia criada permanece explicitamente legível');
select throws_ok($$select public.commit_course_composition_for_actor_v1(
 '99290000-0000-4000-8000-000000000001','99290000-0000-4000-8000-000000000101',1,null,
 jsonb_build_array(jsonb_build_object('entityType','microsequence','entityId','a','parentType','lesson','parentId','l','position',0,'content',content)),
 '[]','[{"targetKind":"microsequence_explanation","targetId":"a","sourceLinks":[]}]','application','manual','utf8-version-conflict',99,null) from before_noop$$,
 'PT409','A microssequência mudou; releia antes de salvar.','Mensagem de conflito preserva português UTF-8');
create function pg_temp.write_342_sources(command jsonb,request_id text) returns jsonb language sql as $f$
 select public.execute_course_source_command_for_actor_v1('99290000-0000-4000-8000-000000000001','99290000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99290000-0000-4000-8000-000000000101'),command,'application',request_id)
$f$;
select lives_ok($q$select pg_temp.write_342_sources('{"type":"save_source","sourceId":"source","expectedSourceRevision":0,"source":{"kind":"standard","defaultRoles":["technical_conceptual"],"title":"Fonte sintética","authors":[],"publicationDate":null,"identifier":null,"language":"pt-BR","citationMode":"manual","citationText":"Referência sintética.","url":null,"editionOrVersion":null,"bibliographic":{"editors":[],"containerTitle":null,"publisher":null,"publisherPlace":null,"volume":null,"issue":null,"pages":null,"articleNumber":null,"doi":null,"isbn":null,"issn":null,"accessedDate":null,"genre":null,"number":null},"origin":"author_provided","availability":"unknown","verificationStatus":"unverified","studyVisibility":"citation"}}','source-342-save-01')$q$,'Fonte sintética usa o catálogo existente');
create function pg_temp.links_342() returns jsonb language sql as $f$
 select '[{"linkId":"link","sourceId":"source","relation":"supported_by","roles":["technical_conceptual"],"anchors":[],"occurrences":[{"occurrenceId":"occ","slot":"content","resourceId":"p","path":"text","quote":"Uma conexão","prefix":null,"suffix":" permite"}]}]'::jsonb
$f$;
select is(pg_temp.write_342_sources(jsonb_build_object('type','set_target_sources','targetKind','microsequence_explanation','targetId','a','expectedTargetVersion',
 (select version from private.course_entities where course_id='99290000-0000-4000-8000-000000000101' and entity_type='microsequence' and entity_id='a'),
 'sourceLinks',pg_temp.links_342()),'source-342-link-01')->>'changed','true','Atribuição pertence à microssequência uma única vez');
select is(jsonb_array_length(pg_temp.read_target('microsequence_explanation','a')->'items'),1,'Atribuição existente permanece um item');
select is(pg_temp.read_target('microsequence_explanation','a')#>>'{items,0,targetId}','a','Identidade real é preservada');
select is((pg_temp.read_target('microsequence_explanation','a')#>>'{items,0,targetVersion}')::bigint,(select version from private.course_entities where course_id='99290000-0000-4000-8000-000000000101' and entity_id='a'),'Versão real é preservada');
select is(pg_temp.read_target('microsequence_explanation','a')#>'{items,0,sourceLinks}',pg_temp.links_342(),'Fonte e ocorrência existentes são preservadas');
select * from finish();
rollback;
