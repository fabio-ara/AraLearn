begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

-- Somente fixtures sintéticas nesta transação. Metadata Storage não prova bytes;
-- cliente real verifica download/decoder separadamente.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','30610000-0000-4000-8000-000000000001','authenticated','authenticated','analytics-owner-306@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal)
values('30610000-0000-4000-8000-000000000101','30610000-0000-4000-8000-000000000001','Curso sintético histórico','Preservar a aplicação anterior.');
insert into private.course_instructional_plans(course_id)
values('30610000-0000-4000-8000-000000000101');
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '30610000-0000-4000-8000-000000000201',course_id,id,'instructional_analysis_unit',0,'Ligação','Relação entre dois pontos.'
from private.course_instructional_plans where course_id='30610000-0000-4000-8000-000000000101';
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('30610000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('30610000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('30610000-0000-4000-8000-000000000101','microsequence','s','lesson','l',0,'{"title":"Sequência","dependsOn":[]}'),
('30610000-0000-4000-8000-000000000101','study_unit','u','microsequence','s',1,'{"title":"Unidade anterior","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma ligação une dois pontos."}}],"response":null,"feedback":[],"topics":[]}');

-- Forma histórica migrada para snapshot v2: seis parâmetros do catálogo 1.1.0,
-- motivos desconhecidos mantidos nulos e política vigente na aplicação antiga.
create temporary table historical_snapshot as select '{
 "contract":"aralearn.study-unit-design-snapshot.v2","parameterCatalogVersion":"1.1.0",
 "didacticMicrosequenceId":"s","instructionalAnalysisUnitIds":["30610000-0000-4000-8000-000000000201"],"evidenceRequirementIds":[],
 "parameters":[
  {"parameterId":"new_analysis_unit_ceiling_per_expository_study_unit","value":2,"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
  {"parameterId":"required_explanation_forms","value":["plain_definition"],"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
  {"parameterId":"minimum_distinct_practice_opportunities_per_evidence_requirement","value":2,"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
  {"parameterId":"required_practice_variation_dimensions","value":["case_or_data"],"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
  {"parameterId":"authoring_chat_response_word_target","value":120,"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"},
  {"parameterId":"study_unit_content_word_target","value":180,"origin":"automatic","reason":null,"sourceScopeKind":"study_unit"}
 ],"editorialDirections":[],
 "componentPolicy":{"policy":{"catalogVersion":"1-4616b2e5","availability":"all","allowedRefs":[],"excludedRefs":[],"preferredRefs":[]},"origin":"system_default","sourceScopeKind":null},
 "appliedAt":"2026-09-01T00:00:00+00:00"
}'::jsonb snapshot,
'{"contract":"aralearn.study-unit-design-application.v1","mode":"expository","introducedInstructionalAnalysisUnitIds":["30610000-0000-4000-8000-000000000201"],"usedInstructionalAnalysisUnitIds":["30610000-0000-4000-8000-000000000201"],"curriculumScopeItemIds":[],"explanationApplications":[{"instructionalAnalysisUnitId":"30610000-0000-4000-8000-000000000201","developedForms":["plain_definition"],"notApplicable":[]}],"practiceApplications":[],"componentRefs":["aralearn.resource.paragraph@1.0.0"]}'::jsonb application;
update private.course_entities set design_snapshot=historical_snapshot.snapshot,design_application=historical_snapshot.application,
 updated_at=(historical_snapshot.snapshot->>'appliedAt')::timestamptz
from historical_snapshot where course_id='30610000-0000-4000-8000-000000000101' and entity_type='study_unit' and entity_id='u';



insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '30610000-0000-4000-8000-000000000202',course_id,id,'instructional_analysis_unit',1,'Planejada sem aplicação','Deve permanecer no inventário.'
from private.course_instructional_plans where course_id='30610000-0000-4000-8000-000000000101';
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '30610000-0000-4000-8000-000000000203',course_id,id,'evidence_requirement',0,'Aplicar a ligação','Exigência ainda sem oportunidade.'
from private.course_instructional_plans where course_id='30610000-0000-4000-8000-000000000101';
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('30610000-0000-4000-8000-000000000101','study_unit','v','microsequence','s',2,'{"title":"Sem declaração","content":[],"response":null,"feedback":[],"topics":[]}');
create function pg_temp.analytics306(p_scope jsonb default '{"kind":"course","ref":null}') returns jsonb language sql as $$
 select public.get_owned_course_authoring_analytics_for_actor_v4('30610000-0000-4000-8000-000000000001','30610000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='30610000-0000-4000-8000-000000000101'),jsonb_build_object('scope',p_scope))
$$;
create temporary table analytics306 as select pg_temp.analytics306() page;
select is((select page->>'contract' from analytics306),'aralearn.course-authoring-analytics.v4','contrato corrente v4');
select is((select jsonb_array_length(page#>'{basis,analysisUnits}') from analytics306),2,'inventário inclui análise planejada ainda não aplicada');
select is((select page#>>'{basis,analysisUnits,1,description}' from analytics306),'Deve permanecer no inventário.','definição literal também pertence ao inventário comparável');
select is((select jsonb_array_length(page#>'{basis,evidenceRequirements}') from analytics306),1,'inventário inclui exigência ainda não aplicada');
select is((select jsonb_array_length(page#>'{basis,studyUnits}') from analytics306),2,'uma base por unidade do escopo');
select is((select page#>>'{basis,studyUnits,0,studyUnitRef}' from analytics306),'u','ordem curricular estável');
select is((select page#>>'{basis,studyUnits,0,components,0,componentRef}' from analytics306),'aralearn.resource.paragraph@1.0.0','instância presente referencia pacote real');
select is((select page#>>'{basis,studyUnits,0,components,0,instanceRef}' from analytics306),'p','instância possui referência navegável');
select is((select page#>>'{basis,studyUnits,0,components,0,slot}' from analytics306),'content','espaço do recurso preservado');
select is((select jsonb_array_length(page#>'{basis,studyUnits,0,requestedParameters}') from analytics306),(select count(*)::integer from private.course_design_parameter_definitions),'solicitado completo vem do resolvedor canônico');
select is((select page#>>'{basis,studyUnits,0,requestedParameters,0,mode}' from analytics306),'automatic','intenção automática atual não vira valor inventado');
select is((select page#>'{basis,studyUnits,0,requestedParameters,0,value}' from analytics306),'null'::jsonb,'automático sem aplicação permanece null');
select is((select jsonb_array_length(page#>'{basis,studyUnits,0,appliedParameters}') from analytics306),6,'aplicação histórica mantém seis parâmetros reais');
select is((select page#>'{basis,studyUnits,0,appliedParameters,0,value}' from analytics306),'2'::jsonb,'valor aplicado histórico preservado');
select is((select page#>'{basis,studyUnits,0,appliedParameters,0,reason}' from analytics306),'null'::jsonb,'motivo desconhecido histórico permanece null');
select is((select page#>'{basis,studyUnits,1,appliedParameters}' from analytics306),'null'::jsonb,'ausência de aplicação não é zero');
select is((select page#>'{basis,studyUnits,1,declaration}' from analytics306),'null'::jsonb,'ausência de declaração não é inferida do conteúdo');
select is((select page#>>'{basis,studyUnits,0,declaration,mode}' from analytics306),'expository','modo declarado preservado');
select ok((select (page#>>'{basis,studyUnits,0,wordCount}')::integer>0 from analytics306),'palavras contadas nos campos autorais');
select is(jsonb_array_length(pg_temp.analytics306('{"kind":"study_unit","ref":"u"}')#>'{basis,studyUnits}'),1,'escopo de unidade limita observação');
select is(jsonb_array_length(pg_temp.analytics306('{"kind":"study_unit","ref":"u"}')#>'{basis,analysisUnits}'),2,'inventário integral permanece explícito no escopo focal');
select is(pg_temp.analytics306('{"kind":"study_unit","ref":"u"}')#>>'{basis,inventoryScope,kind}','course','alcance integral não se confunde com escopo observado');
select throws_ok($$select public.get_owned_course_authoring_analytics_for_actor_v4('30610000-0000-4000-8000-000000000001','30610000-0000-4000-8000-000000000101',999,'{"scope":{"kind":"course","ref":null}}')$$,'40001',null,'CAS recusa revisão divergente');
select throws_ok($$select public.get_owned_course_authoring_analytics_for_actor_v4('30610000-0000-4000-8000-000000000009','30610000-0000-4000-8000-000000000101',1,'{"scope":{"kind":"course","ref":null}}')$$,'PT404',null,'outro ator não recebe inventário');
select throws_ok($$select pg_temp.analytics306('{"kind":"study_unit","ref":"missing"}')$$,'PT404',null,'escopo ausente não retorna curso inteiro');
select ok(not has_function_privilege('anon','public.get_owned_course_authoring_analytics_for_actor_v4(uuid,uuid,bigint,jsonb)','EXECUTE'),'anon sem execução direta');
select ok(not has_function_privilege('authenticated','public.get_owned_course_authoring_analytics_for_actor_v4(uuid,uuid,bigint,jsonb)','EXECUTE'),'authenticated sem execução direta');
select ok(has_function_privilege('service_role','public.get_owned_course_authoring_analytics_for_actor_v4(uuid,uuid,bigint,jsonb)','EXECUTE'),'serviço possui o reader com ator explícito');
select ok(to_regprocedure('public.get_owned_course_authoring_analytics_for_actor_v3(uuid,uuid,bigint,jsonb)') is null,'reader substituído removido');
select * from finish();
rollback;
