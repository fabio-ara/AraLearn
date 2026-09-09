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
('99260000-0000-4000-8000-000000000101','study_unit','u1','microsequence','a',1,'{"title":"Observe a conexão","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"A ligação permite que os elementos interajam."}}],"response":null,"feedback":[],"topics":[]}'),
('99260000-0000-4000-8000-000000000101','study_unit','u2','microsequence','a',2,'{"title":"Compare situações","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Compare retirar a ligação e mudar a cor. Qual mudança impede a interação?"}}],"response":null,"feedback":[],"topics":[]}');
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '99260000-0000-4000-8000-000000000201',course_id,id,'instructional_analysis_unit',0,'Conexão','Relação entre elementos.' from private.course_instructional_plans where course_id='99260000-0000-4000-8000-000000000101';
insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind)
values('99260000-0000-4000-8000-000000000101','b','99260000-0000-4000-8000-000000000201','instructional_analysis_unit');

create function pg_temp.review_course() returns uuid language sql as $$select '99260000-0000-4000-8000-000000000101'::uuid$$;
create function pg_temp.review_revision() returns bigint language sql as $$select revision from public.courses where id=pg_temp.review_course()$$;
create function pg_temp.review_read(kind text,id text) returns jsonb language sql as $$
 select public.get_course_content_review_v1(pg_temp.review_course(),kind,id)$$;
create function pg_temp.review_state(kind text,id text) returns text language sql as $$
 select private.course_content_review_v1(pg_temp.review_course(),kind,id)->>'state'$$;
create function pg_temp.review_set(kind text,id text,reviewed boolean,request text,basis text default null) returns jsonb language sql as $$
 select public.set_course_content_review_v1(pg_temp.review_course(),kind,id,
 coalesce(basis,pg_temp.review_read(kind,id)->>'basisHash'),reviewed,request)$$;

select is(pg_temp.review_state('microsequence_explanation','a'),'draft','Base salva nasce rascunho sem inspeção implícita');
select is(pg_temp.review_state('study_unit','u1'),'draft','Unidade tem revisão independente');
select is((select count(*) from private.course_entities where course_id=pg_temp.review_course() and content ? 'explanation'),1::bigint,'Duas unidades compartilham uma única Explicação');
select throws_ok($$update private.course_entities set content=content||'{"approvedAt":"2026-09-07"}' where entity_id='a' and course_id=pg_temp.review_course()$$,'42501',null,'Conteúdo livre não fabrica revisão');
select throws_ok($$update private.course_entities set content_review='{"basisHash":"fake"}' where entity_id='a' and course_id=pg_temp.review_course()$$,'42501',null,'Escritor de conteúdo não altera metadado protegido');
select ok(to_regprocedure('public.approve_course_microsequence_content_v1(uuid,text,text,text)') is null,'Aprovação agregada substituída foi retirada');
select ok(has_function_privilege('service_role','public.set_course_content_review_for_actor_v1(uuid,uuid,text,text,text,boolean,text)','execute'),'Canal autenticado pode executar declaração autoral expressa');
select ok(not has_function_privilege('authenticated','public.set_course_content_review_for_actor_v1(uuid,uuid,text,text,text,boolean,text)','execute'),'Cliente não escolhe ator explícito');
select ok(not has_function_privilege('anon','public.set_course_content_review_v1(uuid,text,text,text,boolean,text)','execute'),'Anônimo não declara revisão');
select set_config('request.jwt.claims','{"sub":"99260000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99260000-0000-4000-8000-000000000011"}',true);
select set_config('request.jwt.claim.sub','99260000-0000-4000-8000-000000000001',true);
create temporary table inspected as select pg_temp.review_read('microsequence_explanation','a') value;
select ok((select value->>'basisHash' ~ '^[a-f0-9]{64}$' from inspected),'Inspeção identifica a base salva por hash');
select throws_ok($$select pg_temp.review_set('microsequence_explanation','b',true,'review-incomplete')$$,'23514',null,'Base ausente não recebe declaração de revisão');
update private.course_entities set content=jsonb_set(content,'{title}','"Outra microssequência"') where course_id=pg_temp.review_course() and entity_id='b';
select is(pg_temp.review_read('microsequence_explanation','a')->>'basisHash',(select value->>'basisHash' from inspected),'Outra microssequência independente não muda a base');
create temporary table decision as select pg_temp.review_set('microsequence_explanation','a',true,'review-exact-0001',(select value->>'basisHash' from inspected)) value;
select is((select value#>>'{contentReview,state}' from decision),'current','Decisão explícita marca exatamente a base inspecionada');
select ok(not((select value->'contentReview' from decision) ?| array['approvedBy','reviewedBy','legacyMicrosequenceReview']),'Projeção não expõe identidade privada da pessoa revisora');
select is(pg_temp.review_state('study_unit','u1'),'draft','Marca da base não revisa suas unidades');
select is(pg_temp.review_revision(),2::bigint,'Declaração incrementa a revisão corrente uma única vez');
select is(pg_temp.review_set('microsequence_explanation','a',true,'review-exact-0001',(select value->>'basisHash' from inspected))->>'idempotent','true','Resposta perdida recupera a mesma decisão pelo recibo');
select is(pg_temp.review_revision(),2::bigint,'Replay não cria outra revisão');
create temporary table copy_decision as select public.copy_course_for_actor_v1(
 '99260000-0000-4000-8000-000000000001',pg_temp.review_course(),2,'Cópia sintética revisável',true,
 'copy:'||(extract(epoch from date_trunc('milliseconds',statement_timestamp()))*1000)::bigint::text||':99260000-0000-4000-8000-000000000099',date_trunc('milliseconds',statement_timestamp())) value;
select is(private.course_content_review_v1((select (value->>'targetCourseId')::uuid from copy_decision),'microsequence_explanation','a')->>'state','draft','Cópia preserva conteúdo útil sem herdar inspeção da origem');
select is((select content->'explanation' from private.course_entities where course_id=(select (value->>'targetCourseId')::uuid from copy_decision) and entity_id='a'),
 (select content->'explanation' from private.course_entities where course_id=pg_temp.review_course() and entity_id='a'),'Cópia mantém uma Explicação completa no novo curso');
select ok(private.course_entity_readable_v1(pg_temp.review_course(),null,'study_unit','u1','a'),'Curso público distribui unidade completa salva sem revisão');
update private.course_entities set content=content where course_id=pg_temp.review_course() and entity_id='u1';
select is(pg_temp.review_state('microsequence_explanation','a'),'current','Gravação idêntica conserva decisão');
create temporary table unit_inspected as select pg_temp.review_read('study_unit','u1') value;
select is(pg_temp.review_set('study_unit','u1',true,'review-unit-0001')->>'changed','true','Unidade recebe sua própria declaração');
create temporary table dependency_basis as select pg_temp.review_read('microsequence_explanation','c')->>'basisHash' value;
update private.course_entities set content=jsonb_set(content,'{title}','"Texto alterado na outra aba"'),version=version+1 where course_id=pg_temp.review_course() and entity_id='u1';
select is(pg_temp.review_state('study_unit','u1'),'stale','Alteração material desatualiza a unidade sem apagar decisão');
select is(pg_temp.review_state('microsequence_explanation','a'),'current','Editar unidade não desatualiza sua base independente');
select is(pg_temp.review_read('microsequence_explanation','c')->>'basisHash',(select value from dependency_basis),'Outra unidade não muda a dependência explicativa');
select throws_ok($$select pg_temp.review_set('study_unit','u1',true,'review-stale-0002',(select value->>'basisHash' from unit_inspected))$$,'PT409',null,'Aba antiga não declara revisão do conteúdo novo por rebase');
select is(pg_temp.review_set('study_unit','u1',true,'review-unit-0001',(select value->>'basisHash' from unit_inspected))#>>'{contentReview,state}','current','Replay informa a decisão original sem reaplicá-la');
select is(pg_temp.review_state('study_unit','u1'),'stale','Releitura conserva a pendência da unidade editada');
select ok(private.course_entity_readable_v1(pg_temp.review_course(),null,'study_unit','u1','a'),'Política padrão permite texto completo salvo mesmo com revisão desatualizada');
create temporary table saved_reader_page as select private.list_course_entities_for_actor_v1(null,pg_temp.review_course(),pg_temp.review_revision(),500,null,null) value;
select is((select count(*) from saved_reader_page,jsonb_array_elements(value->'items') e where e->>'entityType'='study_unit'),2::bigint,'Projeção pública inclui ambas as unidades salvas');

select lives_ok($$select public.commit_course_composition_for_actor_v1('99260000-0000-4000-8000-000000000001',pg_temp.review_course(),pg_temp.review_revision(),
 (select jsonb_build_array(jsonb_build_object('entityType','microsequence','entityId',entity_id,'parentType','lesson','parentId',parent_id,'position',position,
 'content',jsonb_set(content,'{explanation,title}','"Explicação corrigida"'))) from private.course_entities where course_id=pg_temp.review_course() and entity_id='a'),
 '[]','[{"targetKind":"microsequence_explanation","targetId":"a","sourceLinks":[]}]','review-correction-0001')$$,'Correção salva apoio e atribuição no escritor corrente');
select is((select target_kind from private.course_source_attributions where course_id=pg_temp.review_course() and target_id='a'),'microsequence_explanation','Correção conserva o alvo compartilhado');
select is(pg_temp.review_state('microsequence_explanation','a'),'stale','Correção não reaplica a revisão antiga');
select isnt(pg_temp.review_read('microsequence_explanation','c')->>'basisHash',(select value from dependency_basis),'Alteração da base declarada muda a dependência pertinente');
select is(public.set_course_content_review_policy_v1(pg_temp.review_course(),pg_temp.review_revision(),'reviewed_only','review-policy-explicit')->>'reviewPolicy','reviewed_only','Proprietário escolhe política somente revisado expressamente');
select ok(not private.course_entity_readable_v1(pg_temp.review_course(),null,'study_unit','u1','a'),'Política expressa omite unidade cuja revisão ficou desatualizada');
create temporary table reader_page as select private.list_course_entities_for_actor_v1(null,pg_temp.review_course(),pg_temp.review_revision(),500,null,null) value;
select is((select count(*) from reader_page,jsonb_array_elements(value->'items') e where e->>'entityType'='study_unit'),0::bigint,'Política expressa omite unidades pendentes');
select is((select e#>>'{content,title}' from reader_page,jsonb_array_elements(value->'items') e where e->>'entityId'='a'),'Aguardando revisão da autoria','Base pendente recebe marcador sem texto sob política expressa');
select ok((select value->'pendingReviewMicrosequenceIds' ? 'a' from reader_page),'Leitura informa alcance indisponível para preservar cópia anterior');
select is(private.list_course_entities_for_actor_v1('99260000-0000-4000-8000-000000000001',pg_temp.review_course(),pg_temp.review_revision(),500,null,null)->'pendingReviewMicrosequenceIds','[]'::jsonb,'Proprietário continua inspecionando rascunhos');
select is(pg_temp.review_set('study_unit','u1',false,'review-unit-remove')#>>'{contentReview,state}','draft','Marca autoral pode ser retirada sem editar texto');
select is(public.set_course_content_review_policy_v1(pg_temp.review_course(),pg_temp.review_revision(),'saved','review-policy-saved')->>'reviewPolicy','saved','Política retorna ao conteúdo salvo sem alterar visibilidade');
select is((select visibility from public.courses where id=pg_temp.review_course()),'public','Revisão e política não mudam visibilidade');

select set_config('request.jwt.claims','{"sub":"99260000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99260000-0000-4000-8000-000000000011","client_id":"oauth-client"}',true);
select throws_ok($$select pg_temp.review_set('microsequence_explanation','a',true,'review-oauth-direct')$$,'42501',null,'JWT OAuth não chama entry point da sessão do aplicativo');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.set_course_content_review_for_actor_v1('99260000-0000-4000-8000-000000000001',pg_temp.review_course(),'microsequence_explanation','a',
 private.course_content_basis_hash_v1(pg_temp.review_course(),'microsequence_explanation','a'),true,'review-channel-explicit')#>>'{contentReview,state}','current','Canal autenticado declara revisão expressa pelo proprietário resolvido');
select throws_ok($$select private.save_course_part_explanations_v1(pg_temp.review_course(),'[{"didacticMicrosequenceId":"a"},{"didacticMicrosequenceId":"b"}]','[{"microsequenceId":"a","content":{"title":"Incompleto","content":[]}}]')$$,'23514',null,'Lote com apoio faltante é recusado atomicamente');
select set_config('aralearn.content_review_write','object-review-command',true);
update private.course_entities set content_review=null where course_id=pg_temp.review_course() and entity_id='b';
select set_config('aralearn.content_review_write','',true);
create temporary table legacy_basis as select private.course_content_basis_hash_v1(pg_temp.review_course(),'microsequence_explanation','b') value;
update private.course_instructional_plan_items set statement='Conexão entre pontos' where course_id=pg_temp.review_course() and id='99260000-0000-4000-8000-000000000201';
select is(pg_temp.review_state('microsequence_explanation','b'),'unregistered','Alterar intenção pertinente não inventa revisão do acervo antigo');
select isnt(private.course_content_basis_hash_v1(pg_temp.review_course(),'microsequence_explanation','b'),(select value from legacy_basis),'Mudança de ideia atribuída participa da impressão focal');
select * from finish();
rollback;
