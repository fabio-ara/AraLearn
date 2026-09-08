begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
set constraints all deferred;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','99260000-0000-4000-8000-000000000001','authenticated','authenticated','review-synthetic@example.test','',now(),'{}','{}',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values('99260000-0000-4000-8000-000000000011','99260000-0000-4000-8000-000000000001',now(),now());
insert into public.courses(id,owner_id,title,goal,visibility)
values('99260000-0000-4000-8000-000000000101','99260000-0000-4000-8000-000000000001','Revisão sintética','Provar identidade da decisão.','public');
insert into private.course_instructional_plans(course_id) values('99260000-0000-4000-8000-000000000101');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('99260000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('99260000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('99260000-0000-4000-8000-000000000101','microsequence','a','lesson','l',0,'{"title":"Relações","goal":"Explicar conexões","dependsOn":[],"explanationPlan":{"purpose":"Desenvolver conexões.","prerequisites":[],"relations":[],"sourceIds":[]},"explanation":{"title":"Conectar elementos","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma conexão permite interação entre elementos. Quando ela é retirada, essa interação deixa de ocorrer; mudar apenas a cor dos elementos não retira a conexão."}}]}}'),
('99260000-0000-4000-8000-000000000101','microsequence','b','lesson','l',1,'{"title":"Independente","dependsOn":[]}'),
('99260000-0000-4000-8000-000000000101','microsequence','c','lesson','l',2,'{"title":"Dependente","dependsOn":["a"]}'),
('99260000-0000-4000-8000-000000000101','study_unit','u1','microsequence','a',1,'{"title":"Observe a conexão","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"A ligação permite que os elementos interajam."}}],"response":null,"feedback":[],"topics":[]}'),
('99260000-0000-4000-8000-000000000101','study_unit','u2','microsequence','a',2,'{"title":"Compare situações","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Compare retirar a ligação e mudar a cor. Qual mudança impede a interação?"}}],"response":null,"feedback":[],"topics":[]}');
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '99260000-0000-4000-8000-000000000201',course_id,id,'instructional_analysis_unit',0,'Conexão','Relação entre elementos.' from private.course_instructional_plans where course_id='99260000-0000-4000-8000-000000000101';
insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind)
values('99260000-0000-4000-8000-000000000101','b','99260000-0000-4000-8000-000000000201','instructional_analysis_unit');
select is(private.course_microsequence_review_v1('99260000-0000-4000-8000-000000000101','a')->>'state','draft','Novo conjunto nasce rascunho sem aprovação do mapa');
select is((select count(*) from private.course_entities where course_id='99260000-0000-4000-8000-000000000101' and content ? 'explanation'),1::bigint,'Duas unidades compartilham uma única Explicação');
select throws_ok($$update private.course_entities set content=content||'{"approvedAt":"2026-09-07"}' where entity_id='a' and course_id='99260000-0000-4000-8000-000000000101'$$,'42501',null,'Conteúdo livre não fabrica revisão');
select throws_ok($$update private.course_entities set content_review='{"approvedBasisHash":"fake"}' where entity_id='a' and course_id='99260000-0000-4000-8000-000000000101'$$,'42501',null,'Escritor de conteúdo não altera metadado protegido');
select ok(not has_function_privilege('service_role','public.approve_course_microsequence_content_v1(uuid,text,text,text)','execute'),'Canal service role não tem concessão de aprovação');
select ok(not has_function_privilege('anon','public.approve_course_microsequence_content_v1(uuid,text,text,text)','execute'),'Anônimo não tem concessão de aprovação');
select set_config('request.jwt.claims','{"sub":"99260000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99260000-0000-4000-8000-000000000011"}',true);
select set_config('request.jwt.claim.sub','99260000-0000-4000-8000-000000000001',true);
create temporary table inspected as select public.get_course_microsequence_review_v1('99260000-0000-4000-8000-000000000101','a') value;
select ok((select value->>'basisHash' ~ '^[a-f0-9]{64}$' from inspected),'Inspeção fornece impressão opaca do conjunto corrente');
select throws_ok($$select public.approve_course_microsequence_content_v1('99260000-0000-4000-8000-000000000101','b',private.course_microsequence_basis_hash_v1('99260000-0000-4000-8000-000000000101','b'),'review-incomplete')$$,'23514',null,'Apoio e unidades ausentes impedem aprovação');
update private.course_entities set content=jsonb_set(content,'{title}','"Outra microssequência"') where course_id='99260000-0000-4000-8000-000000000101' and entity_id='b';
select is(private.course_microsequence_basis_hash_v1('99260000-0000-4000-8000-000000000101','a'),(select value->>'basisHash' from inspected),'Outra microssequência independente não muda a base');
create temporary table decision as select public.approve_course_microsequence_content_v1('99260000-0000-4000-8000-000000000101','a',(select value->>'basisHash' from inspected),'review-exact-0001') value;
select is((select value#>>'{contentReview,state}' from decision),'current','Decisão explícita aprova exatamente a base inspecionada');
select ok(not((select value->'contentReview' from decision) ? 'approvedBy'),'Projeção não expõe identidade privada da pessoa revisora');
select is((select revision from public.courses where id='99260000-0000-4000-8000-000000000101'),2::bigint,'Aprovação incrementa a revisão corrente uma única vez');
select is(public.approve_course_microsequence_content_v1('99260000-0000-4000-8000-000000000101','a',(select value->>'basisHash' from inspected),'review-exact-0001')->>'idempotent','true','Resposta perdida recupera a mesma decisão pelo recibo');
select is((select revision from public.courses where id='99260000-0000-4000-8000-000000000101'),2::bigint,'Replay não cria outra revisão');
create temporary table copy_decision as select public.copy_course_for_actor_v1(
 '99260000-0000-4000-8000-000000000001','99260000-0000-4000-8000-000000000101',2,'Cópia sintética revisável',true,
 'copy:'||(extract(epoch from date_trunc('milliseconds',statement_timestamp()))*1000)::bigint::text||':99260000-0000-4000-8000-000000000099',date_trunc('milliseconds',statement_timestamp())) value;
select is(private.course_microsequence_review_v1((select (value->>'targetCourseId')::uuid from copy_decision),'a')->>'state','draft','Cópia preserva conteúdo útil sem herdar aprovação da origem');
select is((select content->'explanation' from private.course_entities where course_id=(select (value->>'targetCourseId')::uuid from copy_decision) and entity_id='a'),
 (select content->'explanation' from private.course_entities where course_id='99260000-0000-4000-8000-000000000101' and entity_id='a'),'Cópia mantém uma Explicação completa no novo curso');
select ok(private.course_entity_readable_v1('99260000-0000-4000-8000-000000000101',null,'study_unit','u1','a'),'Leitor acessa unidade da base aprovada');
update private.course_entities set content=content where course_id='99260000-0000-4000-8000-000000000101' and entity_id='u1';
select is(private.course_microsequence_review_v1('99260000-0000-4000-8000-000000000101','a')->>'state','current','Gravação idêntica conserva decisão');
create temporary table dependency_basis as select private.course_microsequence_basis_hash_v1('99260000-0000-4000-8000-000000000101','c') value;
update private.course_entities set content=jsonb_set(content,'{title}','"Texto alterado na outra aba"'),version=version+1 where course_id='99260000-0000-4000-8000-000000000101' and entity_id='u1';
select is(private.course_microsequence_review_v1('99260000-0000-4000-8000-000000000101','a')->>'state','stale','Alteração material desatualiza decisão sem apagá-la');
select isnt(private.course_microsequence_basis_hash_v1('99260000-0000-4000-8000-000000000101','c'),(select value from dependency_basis),'Dependência existente participa da base focal');
select throws_ok($$select public.approve_course_microsequence_content_v1('99260000-0000-4000-8000-000000000101','a',(select value->>'basisHash' from inspected),'review-stale-0002')$$,'PT409',null,'Aba antiga não aprova conteúdo novo por rebase');
select is(public.approve_course_microsequence_content_v1('99260000-0000-4000-8000-000000000101','a',(select value->>'basisHash' from inspected),'review-exact-0001')#>>'{contentReview,state}','current','Replay informa a decisão original, não uma aprovação nova da base alterada');
select ok(not private.course_entity_readable_v1('99260000-0000-4000-8000-000000000101',null,'study_unit','u1','a'),'Backend não distribui o texto novo pendente');
create temporary table reader_page as select private.list_course_entities_for_actor_v1(null,'99260000-0000-4000-8000-000000000101',2,500,null,null) value;
select is((select count(*) from reader_page,jsonb_array_elements(value->'items') e where e->>'entityType'='study_unit'),0::bigint,'Projeção pública omite unidades pendentes');
select is((select e#>>'{content,title}' from reader_page,jsonb_array_elements(value->'items') e where e->>'entityId'='a'),'Aguardando revisão da autoria','Microssequência redigida indica a pendência sem novo texto');
select ok((select value->'pendingReviewMicrosequenceIds' ? 'a' from reader_page),'Leitura indica limite para preservar a cópia local anterior');
select is(private.list_course_entities_for_actor_v1('99260000-0000-4000-8000-000000000001','99260000-0000-4000-8000-000000000101',2,500,null,null)->'pendingReviewMicrosequenceIds','[]'::jsonb,'Proprietário inspeciona rascunhos sem bloquear sua cópia autoral');
select set_config('request.jwt.claims','{"sub":"99260000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99260000-0000-4000-8000-000000000011","client_id":"oauth-client"}',true);
select throws_ok($$select public.approve_course_microsequence_content_v1('99260000-0000-4000-8000-000000000101','a',private.course_microsequence_basis_hash_v1('99260000-0000-4000-8000-000000000101','a'),'review-oauth-0001')$$,'42501',null,'Sessão OAuth não pode conceder aprovação humana');
select throws_ok($$select private.save_course_part_explanations_v1('99260000-0000-4000-8000-000000000101','[{"didacticMicrosequenceId":"a"},{"didacticMicrosequenceId":"b"}]','[{"microsequenceId":"a","content":{"title":"Incompleto","content":[]}}]')$$,'23514',null,'Lote com apoio faltante é recusado atomicamente');
select lives_ok($$select public.commit_course_composition_for_actor_v1('99260000-0000-4000-8000-000000000001','99260000-0000-4000-8000-000000000101',2,
 (select jsonb_build_array(jsonb_build_object('entityType','microsequence','entityId',entity_id,'parentType','lesson','parentId',parent_id,'position',position,
 'content',jsonb_set(content,'{explanation,title}','"Explicação corrigida"'))) from private.course_entities where course_id='99260000-0000-4000-8000-000000000101' and entity_id='a'),
 '[]','[{"targetKind":"microsequence_explanation","targetId":"a","sourceLinks":[]}]','review-correction-0001')$$,'Correção salva apoio e atribuição no escritor corrente');
select is((select target_kind from private.course_source_attributions where course_id='99260000-0000-4000-8000-000000000101' and target_id='a'),'microsequence_explanation','Correção não converte o alvo compartilhado em unidade');
select is(private.course_microsequence_review_v1('99260000-0000-4000-8000-000000000101','a')->>'state','stale','Correção não reaplica a aprovação antiga');
select set_config('aralearn.content_review_write','approved-command',true);
update private.course_entities set content_review=null where course_id='99260000-0000-4000-8000-000000000101' and entity_id='b';
select set_config('aralearn.content_review_write','',true);
update private.course_instructional_plan_items set statement='Conexão entre pontos' where course_id='99260000-0000-4000-8000-000000000101' and id='99260000-0000-4000-8000-000000000201';
select is(private.course_microsequence_review_v1('99260000-0000-4000-8000-000000000101','b')->>'state','draft','Alterar ideia atribuída inicia revisão focal no acervo antigo');
select * from finish();
rollback;
