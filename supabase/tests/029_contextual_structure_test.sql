begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

-- Synthetic identities only, under rollback. Installed migrations, constraints,
-- triggers, source/review/basis helpers and structural RPCs are real.
-- File rows prove metadata preservation, not Storage bytes; service claims and
-- review declarations below are synthetic test inputs, not human inspection.
create function pg_temp.sc() returns uuid language sql as $$select '93570000-0000-4000-8000-000000000101'::uuid$$;
create function pg_temp.so() returns uuid language sql as $$select '93570000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.sr() returns bigint language sql as $$select revision from public.courses where id=pg_temp.sc()$$;
create function pg_temp.sp() returns bigint language sql as $$select version from private.course_instructional_plans where course_id=pg_temp.sc()$$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','93570000-0000-4000-8000-000000000001','authenticated','authenticated','structure-owner-9357@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','93570000-0000-4000-8000-000000000002','authenticated','authenticated','structure-reader-9357@example.test','',now(),'{}','{}',now(),now());
update public.person_profiles set handle=case user_id when pg_temp.so() then 'structure-owner-9357' else 'structure-reader-9357' end
where user_id in(pg_temp.so(),'93570000-0000-4000-8000-000000000002');
insert into public.courses(id,owner_id,title,goal) values(pg_temp.sc(),pg_temp.so(),'Estrutura sintética 9357','Preservar relações e conteúdo.');
insert into private.course_instructional_plans(course_id,audience,instructional_scope)
values(pg_temp.sc(),'Participantes sintéticos','Explicar relações e aplicações.');
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '93570000-0000-4000-8000-000000000201',course_id,id,'instructional_analysis_unit',0,'Ligação','Relação entre elementos.'
from private.course_instructional_plans where course_id=pg_temp.sc();
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
(pg_temp.sc(),'module','m-a',null,null,0,'{"title":"Fundamentos"}'),
(pg_temp.sc(),'module','m-b',null,null,1,'{"title":"Continuação"}'),
(pg_temp.sc(),'lesson','l-a','module','m-a',0,'{"title":"Lição original"}'),
(pg_temp.sc(),'lesson','l-b','module','m-b',0,'{"title":"Lição externa"}'),
(pg_temp.sc(),'topic','topic-a','lesson','l-a',0,'{"label":"Ligação","kind":"concept","checks":[],"errors":[]}'),
(pg_temp.sc(),'microsequence','a','lesson','l-a',0,'{"title":"Base original","goal":"Explicar ligação.","role":"explain","dependsOn":[],"covers":["topic-a"],"checks":[],"errors":[],"explanationPlan":{"purpose":"Explicar ligação.","prerequisites":[],"relations":[],"sourceIds":[]},"explanation":{"title":"Uma ligação","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma ligação conecta elementos; topic-a continua sendo texto literal."}}]}}'),
(pg_temp.sc(),'microsequence','b','lesson','l-a',1,'{"title":"Aplicação original","goal":"Aplicar ligação.","role":"explain","branchOf":"a","dependsOn":["a"],"covers":["topic-a"],"checks":[],"errors":[]}'),
(pg_temp.sc(),'microsequence','c','lesson','l-b',0,'{"title":"Base externa","goal":"Ampliar.","role":"explain","dependsOn":[],"covers":[],"checks":[],"errors":[]}'),
(pg_temp.sc(),'study_unit','u-a1','microsequence','a',1,'{"title":"Primeira unidade","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma ligação une dois pontos. topic-a é texto literal."}}],"response":null,"feedback":[],"topics":["topic-a"]}'),
(pg_temp.sc(),'study_unit','u-a2','microsequence','a',2,'{"title":"Segunda unidade","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Compare duas ligações."}}],"response":null,"feedback":[],"topics":["topic-a"]}'),
(pg_temp.sc(),'study_unit','u-b1','microsequence','b',1,'{"title":"Unidade dependente","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Aplique a relação."}}],"response":null,"feedback":[],"topics":["topic-a"]}'),
(pg_temp.sc(),'study_unit','u-c1','microsequence','c',1,'{"title":"Unidade externa","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma ligação também aparece fora do ramo."}}],"response":null,"feedback":[],"topics":[]}');

-- Valid retained snapshot v2, matching the historical case in test 022.
update private.course_entities set design_snapshot='{
 "contract":"aralearn.study-unit-design-snapshot.v2","parameterCatalogVersion":"1.1.0",
 "didacticMicrosequenceId":"a","instructionalAnalysisUnitIds":["93570000-0000-4000-8000-000000000201"],"evidenceRequirementIds":[],
 "parameters":[
 {"parameterId":"new_analysis_unit_ceiling_per_expository_study_unit","value":2,"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
 {"parameterId":"required_explanation_forms","value":["plain_definition"],"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
 {"parameterId":"minimum_distinct_practice_opportunities_per_evidence_requirement","value":2,"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
 {"parameterId":"required_practice_variation_dimensions","value":["case_or_data"],"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
 {"parameterId":"authoring_chat_response_word_target","value":120,"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
 {"parameterId":"study_unit_content_word_target","value":180,"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"}],
 "editorialDirections":[],"componentPolicy":{"policy":{"catalogVersion":"1-4616b2e5","availability":"all","allowedRefs":[],"excludedRefs":[],"preferredRefs":[]},"origin":"system_default","sourceScopeKind":null},"appliedAt":"2026-09-01T00:00:00+00:00"}',
 design_application='{"contract":"aralearn.study-unit-design-application.v1","mode":"expository","introducedInstructionalAnalysisUnitIds":["93570000-0000-4000-8000-000000000201"],"usedInstructionalAnalysisUnitIds":["93570000-0000-4000-8000-000000000201"],"curriculumScopeItemIds":[],"explanationApplications":[{"instructionalAnalysisUnitId":"93570000-0000-4000-8000-000000000201","developedForms":["plain_definition"],"notApplicable":[]}],"practiceApplications":[],"componentRefs":["aralearn.resource.paragraph@1.0.0"]}',
 created_origin='gpt',last_revision_origin='human'
where course_id=pg_temp.sc() and entity_type='study_unit' and entity_id='u-a1';
insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind)
values(pg_temp.sc(),'a','93570000-0000-4000-8000-000000000201','instructional_analysis_unit');
insert into private.course_design_parameter_assignments(course_id,parameter_id,scope_kind,scope_ref,value,origin,reason,mode)
values(pg_temp.sc(),'study_unit_content_word_target','didactic_microsequence','a','360','author','Escolha sintética explícita.','fixed');
insert into private.course_authoring_guidance_assignments(course_id,scope_kind,scope_ref,guidance,origin,reason)
values(pg_temp.sc(),'lesson','l-a','Preserve o conteúdo literal.','author','Orientação sintética.');
insert into private.course_component_policy_assignments(course_id,scope_kind,scope_ref,policy,origin,reason)
select pg_temp.sc(),'didactic_microsequence','a',private.course_current_component_policy_v1(pg_temp.sc(),
 private.course_design_scope_path_v1(pg_temp.sc(),'didactic_microsequence','a'))#>'{effectiveAssignment,policy}','author','Política sintética.';
insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,progression)
select '93570000-0000-4000-8000-000000000301',course_id,id,0,'Lote sintético','Produzir relações.','["Estabelecer e aplicar."]'
from private.course_instructional_plans where course_id=pg_temp.sc();
insert into private.course_authoring_part_didactic_microsequences(course_id,authoring_part_id,didactic_microsequence_id,production_position) values
(pg_temp.sc(),'93570000-0000-4000-8000-000000000301','a',0),
(pg_temp.sc(),'93570000-0000-4000-8000-000000000301','b',1),
(pg_temp.sc(),'93570000-0000-4000-8000-000000000301','c',2);
insert into public.course_personal_states(user_id,course_id,state) values(pg_temp.so(),pg_temp.sc(),
'{"version":2,"progress":{"version":3,"lessons":{"l-a":{"cursorStudyUnitId":"u-a1","completedStudyUnitIds":["u-a1"]}}},"reviewMarks":{"u-a1":"2026-09-01T00:00:00Z"}}');
insert into private.course_anchored_annotations(id,course_id,actor_id,origin,channel,target_kind,target_id,observed_path,
 observed_revision_certainty,raw_text,automatic_method,automatic_method_version,effective_method,effective_method_version)
values('93570000-0000-4000-8000-000000000701',pg_temp.sc(),pg_temp.so(),'imported','imported','course',pg_temp.sc()::text,
 jsonb_build_array(jsonb_build_object('kind','course','id',pg_temp.sc(),'label',null,'version',null)),'unknown','Observação sintética preservada.',
 'imported_unclassified',1,'imported_unclassified',1);

create function pg_temp.source_write(command jsonb,request_id text) returns jsonb language sql as $$
select public.execute_course_source_command_for_actor_v1(pg_temp.so(),pg_temp.sc(),pg_temp.sr(),command,'application',request_id)$$;
select pg_temp.source_write('{"type":"save_source","sourceId":"source-9357","expectedSourceRevision":0,"source":{"kind":"standard","defaultRoles":["technical_conceptual"],"title":"Fonte sintética compartilhada","authors":[],"publicationDate":null,"identifier":null,"language":"pt-BR","citationMode":"manual","citationText":"Referência preservada.","url":null,"editionOrVersion":null,"bibliographic":{"editors":[],"containerTitle":null,"publisher":null,"publisherPlace":null,"volume":null,"issue":null,"pages":null,"articleNumber":null,"doi":null,"isbn":null,"issn":null,"accessedDate":null,"genre":null,"number":null},"origin":"author_provided","availability":"unknown","verificationStatus":"unverified","studyVisibility":"citation"}}','structure-source-save');
insert into private.course_source_attachments(course_id,source_id,source_revision,content_hash,byte_size,media_type,storage_path)
values(pg_temp.sc(),'source-9357',1,repeat('e',64),524,'application/pdf',pg_temp.sc()::text||'/'||repeat('e',64)||'.pdf');
select pg_temp.source_write(jsonb_build_object('type','save_anchor','anchorId','anchor-9357','sourceId','source-9357','sourceRevision',1,'expectedAnchorRevision',0,
 'selector',jsonb_build_object('kind','page_range','startPage',1,'endPage',1),'contentHash',repeat('e',64),'humanLocator','Página 1','verificationExcerpt','Ligação sintética.'),'structure-anchor-save');
create function pg_temp.source_links() returns jsonb language sql as $$select
'[{"linkId":"link-9357","sourceId":"source-9357","relation":"supported_by","roles":["technical_conceptual"],"anchors":[{"anchorId":"anchor-9357"}],"occurrences":[{"occurrenceId":"occ-9357","slot":"content","resourceId":"p","path":"text","quote":"Uma ligação","prefix":null,"suffix":null}]}]'::jsonb$$;
select pg_temp.source_write(jsonb_build_object('type','set_target_sources','targetKind',kind,'targetId',id,'expectedTargetVersion',1,
 'sourceLinks',pg_temp.source_links()),'structure-links-'||id)
from (values('microsequence_explanation','a'),('study_unit','u-a1'),('study_unit','u-c1')) target(kind,id);
select pg_temp.source_write('{"type":"retire_source","sourceId":"source-9357","expectedSourceRevision":1}','structure-source-retire');
select is(private.capture_course_applied_explanation_basis_v1(pg_temp.sc(),
'[{"studyUnitId":"u-a1","didacticMicrosequenceId":"a"},{"studyUnitId":"u-a2","didacticMicrosequenceId":"a"}]'),true,'hook real captura a base completa salva');
select is(public.set_course_content_review_for_actor_v1(pg_temp.so(),pg_temp.sc(),'microsequence_explanation','a',
 private.course_content_basis_hash_v1(pg_temp.sc(),'microsequence_explanation','a'),true,'structure-review-base')#>>'{contentReview,state}',
 'current','declaração sintética real registra revisão da base');
select is(public.set_course_content_review_for_actor_v1(pg_temp.so(),pg_temp.sc(),'study_unit','u-a1',
 private.course_content_basis_hash_v1(pg_temp.sc(),'study_unit','u-a1'),true,'structure-review-unit')#>>'{contentReview,state}',
 'current','declaração sintética real registra revisão da unidade');
select public.manage_course_access_for_actor_v3(pg_temp.so(),pg_temp.sc(),'grant_access','structure-reader-9357',
 '93570000-0000-4000-8000-000000000002',true,'structure-reader-access',false);
select lives_ok('set constraints all immediate','fixture satisfaz FKs e unicidade reais');
set constraints all deferred;

create temporary table structure_before as select * from private.course_entities where course_id=pg_temp.sc();
create temporary table structure_files_before as select to_jsonb(f) value from private.course_source_attachments f where course_id=pg_temp.sc();
create temporary table structure_personal_before as select state from public.course_personal_states where course_id=pg_temp.sc();
create temporary table structure_requests(name text primary key,revision bigint,plan_version bigint,command jsonb,result jsonb);
create function pg_temp.prepare_structure(p_name text,p_operation text,p_kind text,p_target text,p_parent text default null,p_position integer default null,p_title text default null)
returns void language sql as $$insert into structure_requests(name,revision,plan_version,command) values($1,pg_temp.sr(),pg_temp.sp(),
 jsonb_build_object('operation',$2,'kind',$3,'targetId',$4,'parentId',$5,'position',$6,'title',$7))$$;
create function pg_temp.run_structure(p_name text) returns jsonb language plpgsql as $$
declare v_request structure_requests%rowtype; v_result jsonb;
begin
 select * into strict v_request from structure_requests where name=p_name;
 v_result:=public.mutate_course_structure_for_actor_v1(pg_temp.so(),pg_temp.sc(),v_request.revision,v_request.plan_version,v_request.command,'structure-'||p_name);
 update structure_requests set result=v_result where name=p_name;
 return v_result;
end$$;
create function pg_temp.cloned(p_kind text,p_title text) returns text language sql as $$
select entity_id from private.course_entities where course_id=pg_temp.sc() and entity_type=$1 and entity_id like 'copy-%'
 and coalesce(content->>'title',content->>'label')=$2$$;
create function pg_temp.links_for(p_kind text,p_id text) returns jsonb language sql as $$
select private.course_source_links_v1(pg_temp.sc(),(private.course_effective_source_attribution_v1(pg_temp.sc(),p_kind,p_id)).id)$$;

select ok(has_function_privilege('service_role','public.mutate_course_structure_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text)','execute'),'estrutura disponível ao serviço');
select ok(not has_function_privilege('authenticated','public.mutate_course_structure_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text)','execute'),'RPC com ator explícito não é exposta ao cliente');
select ok(not has_function_privilege('anon','public.reorder_course_study_units_for_actor_v1(uuid,uuid,bigint,text,jsonb,text)','execute'),'ordenação não é exposta a visitante');
select throws_ok($$select public.mutate_course_structure_for_actor_v1('93570000-0000-4000-8000-000000000002',pg_temp.sc(),pg_temp.sr(),pg_temp.sp(),
 '{"operation":"move","kind":"module","targetId":"m-a","parentId":null,"position":0,"title":null}','structure-reader-denied')$$,'42501',null,'leitura não autoriza alteração estrutural');
select pg_temp.prepare_structure('cas','move','module','m-a',null,0);
select throws_ok($$select public.mutate_course_structure_for_actor_v1(pg_temp.so(),pg_temp.sc(),revision-1,plan_version,command,'structure-old-revision') from structure_requests where name='cas'$$,'PT409',null,'CAS recusa revisão antiga');
select throws_ok($$select public.mutate_course_structure_for_actor_v1(pg_temp.so(),pg_temp.sc(),revision,plan_version+1,command,'structure-old-plan') from structure_requests where name='cas'$$,'PT409',null,'CAS recusa versão do planejamento diferente');
select throws_ok($$insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
 select pg_temp.sc(),'study_unit','bad-zero','microsequence','c',0,content from structure_before where entity_id='u-c1'$$,'23514',null,'constraint real exige posição positiva para unidade');
select throws_ok($$update private.course_entities set applied_explanation_basis='{}' where course_id=pg_temp.sc() and entity_id='u-a1'$$,'42501',null,'proveniência aplicada continua protegida');
select throws_ok($$update private.course_entities set content_review='{}' where course_id=pg_temp.sc() and entity_id='u-a1'$$,'42501',null,'declaração humana continua protegida');
select pg_temp.prepare_structure('blocked-move','move','microsequence','a','l-b');
select throws_ok($$select pg_temp.run_structure('blocked-move')$$,'23514',null,'mover a base para depois do dependente é recusado');
select pg_temp.prepare_structure('blocked-remove','remove','microsequence','a');
select throws_ok($$select pg_temp.run_structure('blocked-remove')$$,'23514',null,'remoção não apaga dependência sobrevivente');
select is((select jsonb_agg(to_jsonb(e) order by entity_type,entity_id) from private.course_entities e where course_id=pg_temp.sc()),
 (select jsonb_agg(to_jsonb(e) order by entity_type,entity_id) from structure_before e),'guardas preservam toda a árvore e seus metadados');

select pg_temp.prepare_structure('duplicate','duplicate','module','m-a',null,1,'Fundamentos copiados');
select is(pg_temp.run_structure('duplicate')->>'contract','aralearn.course-structure-change.v1','RPC real duplica ramo preenchido');
select is((select (result->>'affectedEntityCount')::integer from structure_requests where name='duplicate'),8,'cópia inclui todos os oito objetos do ramo');
select lives_ok('set constraints all immediate','cópia satisfaz FKs, identidade e ordem reais');
set constraints all deferred;
select is((select count(*) from private.course_entities where course_id=pg_temp.sc() and entity_id like 'copy-%'),8::bigint,'cada descendente recebe uma única identidade');
select is((select content->'explanation' from private.course_entities where course_id=pg_temp.sc() and entity_id=pg_temp.cloned('microsequence','Base original')),
 (select content->'explanation' from structure_before where entity_id='a'),'base literal preservada');
select is((select content-'topics' from private.course_entities where course_id=pg_temp.sc() and entity_id=pg_temp.cloned('study_unit','Primeira unidade')),
 (select content-'topics' from structure_before where entity_id='u-a1'),'texto e componentes permanecem literais, inclusive trechos que parecem IDs');
select is((select content->'dependsOn' from private.course_entities where course_id=pg_temp.sc() and entity_id=pg_temp.cloned('microsequence','Aplicação original')),
 jsonb_build_array(pg_temp.cloned('microsequence','Base original')),'dependência interna aponta para a cópia');
select is((select content->>'branchOf' from private.course_entities where course_id=pg_temp.sc() and entity_id=pg_temp.cloned('microsequence','Aplicação original')),
 pg_temp.cloned('microsequence','Base original'),'branchOf interno acompanha a cópia');
select is((select content->'topics' from private.course_entities where course_id=pg_temp.sc() and entity_id=pg_temp.cloned('study_unit','Primeira unidade')),
 jsonb_build_array(pg_temp.cloned('topic','Ligação')),'tópicos da unidade apontam para a cópia');
select is((select content->'covers' from private.course_entities where course_id=pg_temp.sc() and entity_id=pg_temp.cloned('microsequence','Base original')),
 jsonb_build_array(pg_temp.cloned('topic','Ligação')),'cobertura de tópicos aponta para a cópia');
select is((select jsonb_build_array(design_snapshot,design_application,created_origin,last_revision_origin) from private.course_entities where course_id=pg_temp.sc() and entity_id=pg_temp.cloned('study_unit','Primeira unidade')),
 (select jsonb_build_array(design_snapshot,design_application,created_origin,last_revision_origin) from structure_before where entity_id='u-a1'),'snapshot, aplicação e origens permanecem literais');
select is((select applied_explanation_basis from private.course_entities where course_id=pg_temp.sc() and entity_id=pg_temp.cloned('study_unit','Primeira unidade')),
 (select applied_explanation_basis||jsonb_build_object('sourceCourseId',pg_temp.sc()) from structure_before where entity_id='u-a1'),'base aplicada conserva origem sem inventar uso da base copiada');
select ok(not exists(select 1 from private.course_entities where course_id=pg_temp.sc() and entity_id like 'copy-%' and entity_type in('microsequence','study_unit') and content_review is distinct from '{}'::jsonb),'cópia não herda declaração humana');
select is((select count(*) from private.course_design_target_plan_items where course_id=pg_temp.sc()),2::bigint,'vínculo de análise acompanha o novo escopo');
select is((select value from private.course_design_parameter_assignments where course_id=pg_temp.sc() and scope_ref=pg_temp.cloned('microsequence','Base original')),'360'::jsonb,'intenção atual copiada');
select is((select guidance from private.course_authoring_guidance_assignments where course_id=pg_temp.sc() and scope_ref=pg_temp.cloned('lesson','Lição original')),'Preserve o conteúdo literal.','orientação copiada');
select is((select count(*) from private.course_component_policy_assignments where course_id=pg_temp.sc()),2::bigint,'política copiada para novo escopo');
select is((select count(*) from private.course_authoring_part_didactic_microsequences where course_id=pg_temp.sc()),3::bigint,'cópia não herda lote');
select is((select state from public.course_personal_states where course_id=pg_temp.sc()),(select state from structure_personal_before),'progresso permanece na origem');
select is((select count(*) from private.course_anchored_annotations where course_id=pg_temp.sc()),1::bigint,'observação permanece na origem');
select is((select count(*) from public.course_access where course_id=pg_temp.sc()),1::bigint,'estrutura não cria concessões');
select is((select status from private.course_sources where course_id=pg_temp.sc() and source_id='source-9357'),'retired','fonte retirada não é reativada');
select is(pg_temp.links_for('microsequence_explanation',pg_temp.cloned('microsequence','Base original')),pg_temp.source_links(),'base copiada preserva fonte, âncora, papéis e ocorrência');
select is(pg_temp.links_for('study_unit',pg_temp.cloned('study_unit','Primeira unidade')),pg_temp.source_links(),'unidade copiada preserva fonte efetiva');
select is((select to_jsonb(f) from private.course_source_attachments f where course_id=pg_temp.sc()),(select value from structure_files_before),'arquivo compartilhado não é duplicado nem alterado');
select is(pg_temp.run_structure('duplicate')->>'idempotent','true','replay da cópia precede CAS');
select is(pg_temp.sr(),(select revision+1 from structure_requests where name='duplicate'),'replay não avança revisão');
select throws_ok($$select public.mutate_course_structure_for_actor_v1(pg_temp.so(),pg_temp.sc(),revision,plan_version,
 jsonb_set(command,'{title}','"Outra cópia"'),'structure-duplicate') from structure_requests where name='duplicate'$$,'23514',null,'tentativa repetida rejeita intenção diferente');

create temporary table structure_order_request as select pg_temp.sr() revision,'["u-a2","u-a1"]'::jsonb ids;
create function pg_temp.reorder_structure(p_ids jsonb default null,p_revision bigint default null,p_request text default 'structure-order') returns jsonb language sql as $$
select public.reorder_course_study_units_for_actor_v1(pg_temp.so(),pg_temp.sc(),coalesce(p_revision,revision),'a',coalesce(p_ids,ids),p_request) from structure_order_request$$;
select throws_ok($$select pg_temp.reorder_structure('["u-a1"]')$$,'23514',null,'lista parcial não remove unidades');
select throws_ok($$select pg_temp.reorder_structure('["u-a1","u-a1"]')$$,'22023',null,'ordem recusa identidade repetida');
select throws_ok($$select pg_temp.reorder_structure('["u-a1","u-c1"]')$$,'23514',null,'unidade externa não entra na ordem');
select throws_ok($$select pg_temp.reorder_structure(null,1)$$,'PT409',null,'ordenação exige CAS');
select is(pg_temp.reorder_structure()->>'changed','true','ordenação real troca as unidades');
select lives_ok('set constraints all immediate','ordenação satisfaz posições positivas e unicidade reais');
set constraints all deferred;
select is((select jsonb_agg(entity_id order by position) from private.course_entities where course_id=pg_temp.sc() and entity_type='study_unit' and parent_id='a'),'["u-a2","u-a1"]'::jsonb,'ordem persistida corresponde à intenção');
select is((select position from private.course_entities where course_id=pg_temp.sc() and entity_id='u-a1'),2,'segunda posição é positiva');
select is((select to_jsonb(e)-array['position','version','updated_at'] from private.course_entities e where course_id=pg_temp.sc() and entity_id='u-a1'),
 (select to_jsonb(e)-array['position','version','updated_at'] from structure_before e where entity_id='u-a1'),'ordenação preserva conteúdo, review, snapshots e proveniência');
select is(private.course_content_review_v1(pg_temp.sc(),'study_unit','u-a1')->>'state','current','ordenação sem mudança material conserva revisão');
select is(pg_temp.links_for('study_unit','u-a1'),pg_temp.source_links(),'gatilho mantém fonte efetiva na nova versão');
select is(pg_temp.reorder_structure()->>'idempotent','true','replay da ordem usa recibo original');
select throws_ok($$select pg_temp.reorder_structure('["u-a1","u-a2"]')$$,'23514',null,'replay recusa sequência diferente');

select pg_temp.prepare_structure('move-lesson','move','lesson','l-a','m-b',0);
select is(pg_temp.run_structure('move-lesson')->>'changed','true','movimento de lição preenchida preserva descendentes');
select is((select parent_id from private.course_entities where course_id=pg_temp.sc() and entity_id='l-a'),'m-b','lição pertence ao novo módulo');
select is((select position from private.course_entities where course_id=pg_temp.sc() and entity_id='l-b'),1,'irmão é reindexado sem colisão');
select lives_ok('set constraints all immediate','movimento satisfaz pais e ordem reais');
set constraints all deferred;
select is(pg_temp.run_structure('move-lesson')->>'idempotent','true','movimento recupera recibo sem mover de novo');
select pg_temp.prepare_structure('remove-lesson','remove','lesson','l-a');
select is(pg_temp.run_structure('remove-lesson')->>'affectedEntityCount','7','remoção exclui os sete objetos da lição');
select lives_ok('set constraints all immediate','remoção resolve FKs de lotes, descendentes e vínculos');
set constraints all deferred;
select is((select count(*) from private.course_entities where course_id=pg_temp.sc() and entity_id in('l-a','topic-a','a','b','u-a1','u-a2','u-b1')),0::bigint,'nenhum descendente removido fica órfão');
select is((select count(*) from private.course_entities where course_id=pg_temp.sc() and entity_id like 'copy-%'),8::bigint,'cópia independente preservada');
select is((select to_jsonb(e) from private.course_entities e where course_id=pg_temp.sc() and entity_id='u-c1'),(select to_jsonb(e) from structure_before e where entity_id='u-c1'),'unidade externa permanece intacta');
select is((select jsonb_agg(jsonb_build_array(didactic_microsequence_id,production_position) order by production_position) from private.course_authoring_part_didactic_microsequences where course_id=pg_temp.sc()),'[["c",0]]'::jsonb,'lote remove só alvos excluídos e fecha posições');
select is((select count(*) from private.course_design_parameter_assignments where course_id=pg_temp.sc() and scope_ref='a'),0::bigint,'gatilho limpa atribuição removida');
select is((select count(*) from private.course_authoring_guidance_assignments where course_id=pg_temp.sc() and scope_ref='l-a'),0::bigint,'gatilho limpa orientação removida');
select is((select count(*) from private.course_component_policy_assignments where course_id=pg_temp.sc() and scope_ref='a'),0::bigint,'gatilho limpa política removida');
select is((select count(*) from private.course_source_attributions where course_id=pg_temp.sc()),3::bigint,'atribuições da cópia e unidade externa permanecem');
select is(pg_temp.links_for('study_unit','u-c1'),pg_temp.source_links(),'fonte compartilhada continua resolvida fora do ramo');
select is((select to_jsonb(f) from private.course_source_attachments f where course_id=pg_temp.sc()),(select value from structure_files_before),'remoção não elimina arquivo compartilhado');
select is(pg_temp.run_structure('remove-lesson')->>'idempotent','true','replay confirma remoção após desaparecer o alvo');
select is((select curriculum_map_status from private.course_instructional_plans where course_id=pg_temp.sc()),'draft','alterações deixam mapa para nova inspeção');
select lives_ok('set constraints all immediate','estado final satisfaz todas as constraints diferíveis');
select * from finish();
rollback;
