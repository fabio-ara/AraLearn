begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

-- Somente esta conta e este curso sintéticos; toda a prova termina em rollback.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','98000000-0000-4000-8000-000000000001','authenticated','authenticated','snapshot-owner@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal)
values('98000000-0000-4000-8000-000000000101','98000000-0000-4000-8000-000000000001','Curso sintético histórico','Preservar a aplicação anterior.');
insert into private.course_instructional_plans(course_id)
values('98000000-0000-4000-8000-000000000101');
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '98000000-0000-4000-8000-000000000201',course_id,id,'instructional_analysis_unit',0,'Ligação','Relação entre dois pontos.'
from private.course_instructional_plans where course_id='98000000-0000-4000-8000-000000000101';
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('98000000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('98000000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('98000000-0000-4000-8000-000000000101','microsequence','s','lesson','l',0,'{"title":"Sequência","dependsOn":[]}'),
('98000000-0000-4000-8000-000000000101','study_unit','u','microsequence','s',1,'{"title":"Unidade anterior","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma ligação une dois pontos."}}],"response":null,"feedback":[],"topics":[]}');

-- Forma histórica migrada para snapshot v2: seis parâmetros do catálogo 1.1.0,
-- motivos desconhecidos mantidos nulos e política vigente na aplicação antiga.
create temporary table historical_snapshot as select '{
 "contract":"aralearn.study-unit-design-snapshot.v2","parameterCatalogVersion":"1.1.0",
 "didacticMicrosequenceId":"s","instructionalAnalysisUnitIds":["98000000-0000-4000-8000-000000000201"],"evidenceRequirementIds":[],
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
'{"contract":"aralearn.study-unit-design-application.v1","mode":"expository","introducedInstructionalAnalysisUnitIds":["98000000-0000-4000-8000-000000000201"],"usedInstructionalAnalysisUnitIds":["98000000-0000-4000-8000-000000000201"],"curriculumScopeItemIds":[],"explanationApplications":[{"instructionalAnalysisUnitId":"98000000-0000-4000-8000-000000000201","developedForms":["plain_definition"],"notApplicable":[]}],"practiceApplications":[],"componentRefs":["aralearn.resource.paragraph@1.0.0"]}'::jsonb application;
update private.course_entities set design_snapshot=historical_snapshot.snapshot,design_application=historical_snapshot.application,
 updated_at=(historical_snapshot.snapshot->>'appliedAt')::timestamptz
from historical_snapshot where course_id='98000000-0000-4000-8000-000000000101' and entity_type='study_unit' and entity_id='u';

create function pg_temp.edit_historical_unit(request_id text) returns jsonb language sql as $f$
 select public.commit_course_composition_for_actor_v1(
 '98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000101',1,1,
 '[{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Unidade revisada","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma ligação une dois pontos."}}],"response":null,"feedback":[],"topics":[]}}]',
 '[]','[{"studyUnitId":"u","sourceLinks":[]}]','application','manual',request_id)
$f$;
create function pg_temp.historical_analytics(expected_revision bigint) returns jsonb language sql as $f$
 select public.get_owned_course_authoring_analytics_for_actor_v4(
 '98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000101',expected_revision,
 '{"scope":{"kind":"course","ref":null}}')
$f$;
select is((select updated_at from private.course_entities where course_id='98000000-0000-4000-8000-000000000101' and entity_id='u'),
 (select (snapshot->>'appliedAt')::timestamptz from historical_snapshot),
 'fixture representa aplicação histórica ainda correspondente ao conteúdo inicial');
select isnt(private.course_current_component_policy_v1('98000000-0000-4000-8000-000000000101',
 private.course_design_scope_path_v1('98000000-0000-4000-8000-000000000101','study_unit','u'))#>>'{effectiveAssignment,policy,catalogVersion}',
 '1-4616b2e5','configuração corrente já usa o catálogo posterior');
select is(pg_temp.edit_historical_unit('historical-edit-01')->>'revision','2','edição focal aceita snapshot histórico sem reescrever sua aplicação');
select is((select design_snapshot from private.course_entities where course_id='98000000-0000-4000-8000-000000000101' and entity_id='u'),
 (select snapshot from historical_snapshot),'snapshot relido permanece literalmente igual, inclusive política, parâmetros, motivos e data');
select is((select design_application from private.course_entities where course_id='98000000-0000-4000-8000-000000000101' and entity_id='u'),
 (select application from historical_snapshot),'alteração somente do título mantém literalmente a aplicação pedagógica');
select is((select version from private.course_entities where course_id='98000000-0000-4000-8000-000000000101' and entity_id='u'),2::bigint,
 'versão da unidade avança uma vez');
select is(public.list_owned_course_study_units_for_actor_v2('98000000-0000-4000-8000-000000000001',
 '98000000-0000-4000-8000-000000000101',2)#>>'{items,0,studyUnit,title}','Unidade revisada',
 'leitura de inspeção corrente retorna a unidade histórica editada');
select is(pg_temp.historical_analytics(2)#>>'{design,analysisUnits,0,introductionCount}','1',
 'analytics ainda reconhece a introdução aplicada após alteração de título');
select is(pg_temp.historical_analytics(2)#>>'{design,analysisUnits,0,useCount}','1',
 'analytics ainda reconhece o uso aplicado após alteração de título');
select is(pg_temp.historical_analytics(2)#>>'{design,explanationForms,0,applicationCount}','1',
 'analytics preserva a forma de explicação aplicada sem trocar sua data histórica');
select is(pg_temp.edit_historical_unit('historical-edit-01')->>'idempotent','true','resposta perdida recupera a edição existente');
select is((select revision from public.courses where id='98000000-0000-4000-8000-000000000101'),2::bigint,
 'repetição não reaplica mutação');
select throws_ok($$select pg_temp.edit_historical_unit('historical-edit-02')$$,'40001',null,
 'nova edição exige a revisão corrente mesmo com snapshot histórico');
select is((select design_snapshot from private.course_entities where course_id='98000000-0000-4000-8000-000000000101' and entity_id='u'),
 (select snapshot from historical_snapshot),'retry e conflito preservam o snapshot anterior');

-- A alteração da prosa conserva os mesmos pacotes e a estrutura. Ainda assim,
-- a declaração semântica anterior não comprova a aplicação ao conteúdo novo.
create function pg_temp.edit_historical_prose(request_id text) returns jsonb language sql as $f$
 select public.commit_course_composition_for_actor_v1(
 '98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000101',2,2,
 '[{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Unidade revisada","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Agora distinguimos os pontos, sem desenvolver a ligação."}}],"response":null,"feedback":[],"topics":[]}}]',
 '[]','[{"studyUnitId":"u","sourceLinks":[]}]','application','manual',request_id)
$f$;
select is(pg_temp.edit_historical_prose('historical-prose-01')->>'revision','3','edição da prosa avança uma revisão');
select is((select to_jsonb(private.course_component_refs_from_content_v1(content)) from private.course_entities
 where course_id='98000000-0000-4000-8000-000000000101' and entity_id='u'),
 (select application->'componentRefs' from historical_snapshot),'prosa revisada usa exatamente as mesmas referências de componentes');
select is((select design_snapshot from private.course_entities where course_id='98000000-0000-4000-8000-000000000101' and entity_id='u'),
 (select snapshot from historical_snapshot),'alteração de prosa conserva literalmente a decisão histórica');
select is((select design_application from private.course_entities where course_id='98000000-0000-4000-8000-000000000101' and entity_id='u'),
 null::jsonb,'alteração de prosa invalida a aplicação corrente apesar das referências iguais');
select is(public.list_owned_course_study_units_for_actor_v2('98000000-0000-4000-8000-000000000001',
 '98000000-0000-4000-8000-000000000101',3)#>'{items,0,authorship,design,application}',
 'null'::jsonb,'inspeção não apresenta os mapeamentos antigos como aplicação corrente');
select is(pg_temp.historical_analytics(3)#>'{design,analysisUnits}','[]'::jsonb,
 'analytics não atribui identidades aplicadas à prosa nova');
select is(pg_temp.historical_analytics(3)#>>'{design,introductionsByStudyUnit,0,introducedCount}','0',
 'analytics não conta introduções declaradas no conteúdo anterior');
select is(pg_temp.historical_analytics(3)#>'{design,explanationForms}','[]'::jsonb,
 'analytics não atribui a forma de explicação anterior à nova prosa');
select is(pg_temp.historical_analytics(3)#>'{design,practiceSequence,0,mode}','null'::jsonb,
 'sequência não infere função aplicada para o conteúdo alterado');
select is(pg_temp.edit_historical_prose('historical-prose-01')->>'idempotent','true',
 'retry recupera a edição de prosa sem reaplicar');
select is((select revision from public.courses where id='98000000-0000-4000-8000-000000000101'),3::bigint,
 'retry da prosa mantém a revisão');
select throws_ok($$select pg_temp.edit_historical_prose('historical-prose-02')$$,'40001',null,
 'nova edição da prosa também exige CAS corrente');
select is((select design_snapshot from private.course_entities where course_id='98000000-0000-4000-8000-000000000101' and entity_id='u'),
 (select snapshot from historical_snapshot),'retry e CAS da prosa conservam a decisão histórica');
select * from finish();
rollback;
