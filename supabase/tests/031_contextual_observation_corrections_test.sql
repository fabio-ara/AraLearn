begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
set constraints all deferred;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','99316000-0000-4000-8000-000000000001','authenticated','authenticated','review-synthetic@example.test','',now(),'{}','{}',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values('99316000-0000-4000-8000-000000000011','99316000-0000-4000-8000-000000000001',now(),now());
insert into public.courses(id,owner_id,title,goal,visibility)
values('99316000-0000-4000-8000-000000000101','99316000-0000-4000-8000-000000000001','Revisão sintética','Provar identidade da decisão.','public');
insert into private.course_instructional_plans(course_id) values('99316000-0000-4000-8000-000000000101');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('99316000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('99316000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('99316000-0000-4000-8000-000000000101','microsequence','a','lesson','l',0,'{"title":"Relações","goal":"Explicar conexões","dependsOn":[],"explanationPlan":{"purpose":"Desenvolver conexões.","prerequisites":[],"relations":[],"sourceIds":[]},"explanation":{"title":"Conectar elementos","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma conexão permite interação entre elementos. Quando ela é retirada, essa interação deixa de ocorrer; mudar apenas a cor dos elementos não retira a conexão."}}]}}'),
('99316000-0000-4000-8000-000000000101','microsequence','b','lesson','l',1,'{"title":"Independente","dependsOn":[]}'),
('99316000-0000-4000-8000-000000000101','microsequence','c','lesson','l',2,'{"title":"Dependente","dependsOn":["a"]}'),
('99316000-0000-4000-8000-000000000101','study_unit','u1','microsequence','a',1,'{"title":"Observe a conexão","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"A ligação permite que os elementos interajam."}}],"response":null,"feedback":[],"topics":[]}'),
('99316000-0000-4000-8000-000000000101','study_unit','u2','microsequence','a',2,'{"title":"Compare situações","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Compare retirar a ligação e mudar a cor. Qual mudança impede a interação?"}}],"response":null,"feedback":[],"topics":[]}');
create function pg_temp.qcourse() returns uuid language sql as $$select '99316000-0000-4000-8000-000000000101'::uuid$$;
create function pg_temp.qowner() returns uuid language sql as $$select '99316000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.qrevision() returns bigint language sql as $$select revision from public.courses where id=pg_temp.qcourse()$$;
create function pg_temp.qid(n integer) returns uuid language sql as $$select ('99316000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.qcreate(n integer,kind text default 'study_unit',target text default 'u1') returns jsonb language sql as $$
 select public.execute_course_anchored_annotation_command_for_actor_v1(pg_temp.qowner(),pg_temp.qcourse(),pg_temp.qrevision(),
 jsonb_build_object('type','create_anchored_annotation','annotationId',pg_temp.qid(n),'target',jsonb_build_object('kind',kind,'id',target),
 'rawText','Esclarecer a conexão e o contraste.','category',null,'capturedAt',null,'briefSummary',null),'authoring_interface','queue-create-'||n)
$$;
create function pg_temp.qref(n integer,version bigint default 1,kind text default 'study_unit',target text default 'u1') returns jsonb language sql as $$
 select jsonb_build_object('annotationId',pg_temp.qid(n),'annotationVersion',version,'targetKind',kind,'targetId',target)
$$;
create function pg_temp.qupsert(kind text,target text,message text) returns jsonb language sql as $$
 select jsonb_build_object('entityType',entity_type,'entityId',entity_id,'parentType',parent_type,'parentId',parent_id,'position',position,
 'content',jsonb_set(content,case when entity_type='microsequence' then '{explanation,content,0,data,text}'::text[] else '{content,0,data,text}'::text[] end,to_jsonb(message)))
 from private.course_entities where course_id=pg_temp.qcourse() and entity_type=kind and entity_id=target
$$;
create function pg_temp.qsources(upserts jsonb) returns jsonb language sql as $$
 select jsonb_agg(case when u->>'entityType'='study_unit' then jsonb_build_object('studyUnitId',u->>'entityId','sourceLinks','[]'::jsonb)
 else jsonb_build_object('targetKind','microsequence_explanation','targetId',u->>'entityId','sourceLinks','[]'::jsonb) end) from jsonb_array_elements(upserts) u
$$;
create function pg_temp.qconfirm(request_id text,items jsonb) returns jsonb language sql as $$
 select public.confirm_course_observation_correction_for_actor_v1(pg_temp.qowner(),pg_temp.qcourse(),request_id,
 coalesce((select jsonb_agg(jsonb_build_object('annotationId',o->'annotationId','annotationVersion',o->'annotationVersion','effectHash',o->'effectHash')) from jsonb_array_elements(items) o),'[]'::jsonb))
$$;

select pg_temp.qcreate(301);
select pg_temp.qcreate(302);
select pg_temp.qcreate(303,'microsequence_explanation','a');
select is((select count(*) from private.course_anchored_annotations where course_id=pg_temp.qcourse() and state='open'),3::bigint,'Duas observações na unidade e uma na base permanecem pendentes');
create temporary table queue_requests(name text primary key,revision bigint,upserts jsonb,refs jsonb,result jsonb);
insert into queue_requests values('queue-unit-correction',pg_temp.qrevision(),jsonb_build_array(pg_temp.qupsert('study_unit','u1','A ligação permite interação; mudar a cor conserva a conexão, enquanto retirar a ligação interrompe a interação.')),jsonb_build_array(pg_temp.qref(301),pg_temp.qref(302)),null);
update queue_requests set result=public.commit_course_observation_corrections_for_actor_v1(pg_temp.qowner(),pg_temp.qcourse(),revision,null,upserts,pg_temp.qsources(upserts),'mcp',null,name,refs) where name='queue-unit-correction';
select is((select result->>'contract' from queue_requests where name='queue-unit-correction'),'aralearn.course-observation-correction.v1','Correção usa a composição real, sem ambiguidade entre assinaturas');
select ok((select bool_and((o->>'changed')::boolean and not(o->>'confirmed')::boolean) from queue_requests r,jsonb_array_elements(r.result->'observations') o),'Efeito persistido ainda não consome observações');
select is((select state from private.course_anchored_annotations where id=pg_temp.qid(301)),'open','Primeira pendência permanece até confirmação');
select is((select content_review->>'reviewedAt' from private.course_entities where course_id=pg_temp.qcourse() and entity_id='u1'),null::text,'Correção não declara revisão humana');
select is((select content#>>'{content,0,data,text}' from private.course_entities where course_id=pg_temp.qcourse() and entity_id='u1'),'A ligação permite interação; mudar a cor conserva a conexão, enquanto retirar a ligação interrompe a interação.','Releitura confirma texto persistido');
select pg_temp.qconfirm(name,jsonb_build_array(result#>'{observations,0}')) from queue_requests where name='queue-unit-correction';
select is((select state from private.course_anchored_annotations where id=pg_temp.qid(301)),'resolved','Confirmação consome a primeira versão exata');
select is((select state from private.course_anchored_annotations where id=pg_temp.qid(302)),'open','Aplicação parcial conserva a outra observação');
select public.execute_course_anchored_annotation_command_for_actor_v1(pg_temp.qowner(),pg_temp.qcourse(),null,
 jsonb_build_object('type','revise_anchored_annotation','annotationId',pg_temp.qid(302),'expectedAnnotationVersion',1,
 'rawText','Agora comparar uma ligação dupla.','category',null,'briefSummary',null),'authoring_interface','queue-revise-pending');
create temporary table queue_before_resume as select pg_temp.qrevision() revision,(select version from private.course_entities where course_id=pg_temp.qcourse() and entity_id='u1') unit_version;
select pg_temp.qconfirm('queue-unit-correction',public.get_course_observation_correction_for_actor_v1(pg_temp.qowner(),pg_temp.qcourse(),'queue-unit-correction')->'observations');
select is((select state from private.course_anchored_annotations where id=pg_temp.qid(302)),'open','Resposta perdida reconciliada preserva versão editada');
select is((select version from private.course_anchored_annotations where id=pg_temp.qid(302)),2::bigint,'Versão nova conserva identidade e texto');
select is(pg_temp.qrevision(),(select revision from queue_before_resume),'Retomada não reescreve curso');
select is((select version from private.course_entities where course_id=pg_temp.qcourse() and entity_id='u1'),(select unit_version from queue_before_resume),'Retomada não reaplica texto');
select ok((select (public.commit_course_observation_corrections_for_actor_v1(pg_temp.qowner(),pg_temp.qcourse(),revision,null,upserts,pg_temp.qsources(upserts),'mcp',null,name,refs)->>'idempotent')::boolean from queue_requests where name='queue-unit-correction'),'Repetição idêntica devolve recibo original sem nova composição');
select throws_ok($$select public.commit_course_observation_corrections_for_actor_v1(pg_temp.qowner(),pg_temp.qcourse(),pg_temp.qrevision(),null,
 jsonb_build_array(pg_temp.qupsert('study_unit','u1','Outro texto.')),'[]','mcp',null,'queue-old-observation',jsonb_build_array(pg_temp.qref(302)))$$,
 'PT409',null,'Nova tentativa com versão antiga não consome nem altera conteúdo');

insert into queue_requests values('queue-base-correction',pg_temp.qrevision(),jsonb_build_array(pg_temp.qupsert('microsequence','a','A conexão sustenta a interação entre elementos. Retirar a conexão impede essa interação; uma mudança de cor conserva a relação.')),jsonb_build_array(pg_temp.qref(303,1,'microsequence_explanation','a')),null);
update queue_requests set result=public.commit_course_observation_corrections_for_actor_v1(pg_temp.qowner(),pg_temp.qcourse(),revision,null,upserts,pg_temp.qsources(upserts),'mcp',null,name,refs) where name='queue-base-correction';
select is((select state from private.course_anchored_annotations where id=pg_temp.qid(303)),'open','Base corrigida permanece pendente antes da releitura');
select is((select content#>>'{explanation,content,0,data,text}' from private.course_entities where course_id=pg_temp.qcourse() and entity_id='a'),'A conexão sustenta a interação entre elementos. Retirar a conexão impede essa interação; uma mudança de cor conserva a relação.','Releitura da mesma Explicação salva confirma efeito');
select pg_temp.qconfirm(name,result->'observations') from queue_requests where name='queue-base-correction';
select is((select state from private.course_anchored_annotations where id=pg_temp.qid(303)),'resolved','Confirmação exata consome observação da base');
select is((select state from private.course_anchored_annotations where id=pg_temp.qid(302)),'open','Observação independente permanece pendente');
select is((select count(*) from private.course_entities where course_id=pg_temp.qcourse() and content_review ? 'reviewedAt'),0::bigint,'Consumo não produz declaração humana de revisão');
select is(public.get_course_observation_correction_for_actor_v1(pg_temp.qowner(),pg_temp.qcourse(),'queue-absent-attempt')->>'status','absent','Ausência de recibo é observada sem novo writer');
select ok(not has_function_privilege('authenticated','public.confirm_course_observation_correction_for_actor_v1(uuid,uuid,text,jsonb)','execute'),'Confirmação técnica não é concedida diretamente ao cliente comum');
select * from finish();
rollback;
