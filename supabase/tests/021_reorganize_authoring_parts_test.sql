begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

-- Somente esta conta e este curso sintéticos; toda a prova termina em rollback.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','30400000-0000-4000-8000-000000000001','authenticated','authenticated','parts-owner@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal)
values('30400000-0000-4000-8000-000000000101','30400000-0000-4000-8000-000000000001','Curso sintético histórico','Preservar a aplicação anterior.');
insert into private.course_instructional_plans(course_id)
values('30400000-0000-4000-8000-000000000101');
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '30400000-0000-4000-8000-000000000201',course_id,id,'instructional_analysis_unit',0,'Ligação','Relação entre dois pontos.'
from private.course_instructional_plans where course_id='30400000-0000-4000-8000-000000000101';
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('30400000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('30400000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('30400000-0000-4000-8000-000000000101','microsequence','s','lesson','l',0,'{"title":"Sequência","dependsOn":[]}'),
('30400000-0000-4000-8000-000000000101','study_unit','u','microsequence','s',1,'{"title":"Unidade anterior","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma ligação une dois pontos."}}],"response":null,"feedback":[],"topics":[]}');

-- Forma histórica migrada para snapshot v2: seis parâmetros do catálogo 1.1.0,
-- motivos desconhecidos mantidos nulos e política vigente na aplicação antiga.
create temporary table historical_snapshot as select '{
 "contract":"aralearn.study-unit-design-snapshot.v2","parameterCatalogVersion":"1.1.0",
 "didacticMicrosequenceId":"s","instructionalAnalysisUnitIds":["30400000-0000-4000-8000-000000000201"],"evidenceRequirementIds":[],
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
'{"contract":"aralearn.study-unit-design-application.v1","mode":"expository","introducedInstructionalAnalysisUnitIds":["30400000-0000-4000-8000-000000000201"],"usedInstructionalAnalysisUnitIds":["30400000-0000-4000-8000-000000000201"],"curriculumScopeItemIds":[],"explanationApplications":[{"instructionalAnalysisUnitId":"30400000-0000-4000-8000-000000000201","developedForms":["plain_definition"],"notApplicable":[]}],"practiceApplications":[],"componentRefs":["aralearn.resource.paragraph@1.0.0"]}'::jsonb application;
update private.course_entities set design_snapshot=historical_snapshot.snapshot,design_application=historical_snapshot.application,
 updated_at=(historical_snapshot.snapshot->>'appliedAt')::timestamptz
from historical_snapshot where course_id='30400000-0000-4000-8000-000000000101' and entity_type='study_unit' and entity_id='u';


update private.course_instructional_plans set curriculum_map_status='approved'
where course_id='30400000-0000-4000-8000-000000000101';
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('30400000-0000-4000-8000-000000000101','microsequence','t','lesson','l',1,'{"title":"Segundo","dependsOn":[]}'),
('30400000-0000-4000-8000-000000000101','microsequence','r','lesson','l',2,'{"title":"Terceiro","dependsOn":[]}'),
('30400000-0000-4000-8000-000000000101','microsequence','z','lesson','l',3,'{"title":"Quarto","dependsOn":[]}');
insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,progression)
select '30400000-0000-4000-8000-000000000301',course_id,id,0,'Inicial','Intenção inicial.','["Passo inicial."]'::jsonb
from private.course_instructional_plans where course_id='30400000-0000-4000-8000-000000000101';
insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,progression)
select '30400000-0000-4000-8000-000000000302',course_id,id,1,'Final','Intenção final.','["Passo final."]'::jsonb
from private.course_instructional_plans where course_id='30400000-0000-4000-8000-000000000101';
insert into private.course_authoring_part_didactic_microsequences(course_id,authoring_part_id,didactic_microsequence_id,production_position) values
('30400000-0000-4000-8000-000000000101','30400000-0000-4000-8000-000000000301','s',0),
('30400000-0000-4000-8000-000000000101','30400000-0000-4000-8000-000000000301','t',1),
('30400000-0000-4000-8000-000000000101','30400000-0000-4000-8000-000000000301','r',2),
('30400000-0000-4000-8000-000000000101','30400000-0000-4000-8000-000000000302','z',0);
create temporary table before_entities as select jsonb_agg(to_jsonb(e) order by entity_type,entity_id) value
from private.course_entities e where course_id='30400000-0000-4000-8000-000000000101';
create temporary table part_requests(name text primary key,revision bigint,plan_version bigint,payload jsonb,result jsonb);
create function pg_temp.save_part(p_name text,p_id uuid,p_position int,p_micros jsonb) returns jsonb language plpgsql as $f$
declare v_payload jsonb; v_revision bigint; v_plan bigint; v_result jsonb;
begin
  select revision into v_revision from public.courses where id='30400000-0000-4000-8000-000000000101';
  select version into v_plan from private.course_instructional_plans where course_id='30400000-0000-4000-8000-000000000101';
  v_payload:=jsonb_build_object('partId',p_id,'position',p_position,'title','Reorganizado',
    'intent','Intenção inicial. Intenção final.','progression',jsonb_build_array('Passo inicial.','Passo final.'),'microsequences',p_micros);
  v_result:=public.save_course_authoring_part_for_actor_v1('30400000-0000-4000-8000-000000000001',
    '30400000-0000-4000-8000-000000000101',v_revision,v_plan,v_payload,p_name,encode(extensions.digest(v_payload::text,'sha256'),'hex'));
  insert into part_requests values(p_name,v_revision,v_plan,v_payload,v_result);
  return v_result;
end;$f$;
select lives_ok($$select pg_temp.save_part('parts-split-304',null,1,'[{"microsequenceId":"t","position":0}]')$$,
 'divisão cria grupo e move membro intermediário em uma transação');
select is((select course_revision from (select (result->>'courseRevision')::bigint course_revision from part_requests where name='parts-split-304') r),2::bigint,'divisão avança curso uma vez');
select is((select count(*) from private.course_authoring_parts where course_id='30400000-0000-4000-8000-000000000101'),3::bigint,'divisão mantém grupos e cria um');
select is((select jsonb_agg(production_position order by production_position) from private.course_authoring_part_didactic_microsequences where authoring_part_id='30400000-0000-4000-8000-000000000301'),'[0,1]'::jsonb,'membro intermediário removido não deixa lacuna');
select is((select position from private.course_authoring_parts where id=(select (result->>'authoringPartId')::uuid from part_requests where name='parts-split-304')),1,'UUID gerado respeita a posição escolhida');
select lives_ok($$select pg_temp.save_part('parts-reorder-304','30400000-0000-4000-8000-000000000302',0,'[{"microsequenceId":"z","position":0}]')$$,
 'parte com UUID maior pode vir antes da primeira');
select is((select position from private.course_authoring_parts where id='30400000-0000-4000-8000-000000000302'),0,'reordenar usa inserção e não empate de UUID');
select is((select jsonb_agg(position order by position) from private.course_authoring_parts where course_id='30400000-0000-4000-8000-000000000101'),'[0,1,2]'::jsonb,'ordem fica contínua');
select lives_ok($$select pg_temp.save_part('parts-merge-304','30400000-0000-4000-8000-000000000301',0,
 '[{"microsequenceId":"s","position":0},{"microsequenceId":"t","position":1},{"microsequenceId":"r","position":2},{"microsequenceId":"z","position":3}]')$$,
 'reunião transfere membros e elimina apenas grupos doadores vazios');
select is((select count(*) from private.course_authoring_parts where course_id='30400000-0000-4000-8000-000000000101'),1::bigint,'reunião termina com um grupo');
select is((select count(*) from private.course_authoring_part_didactic_microsequences where course_id='30400000-0000-4000-8000-000000000101'),4::bigint,'nenhuma microssequência perdeu vínculo');
select is((select intent from private.course_authoring_parts where id='30400000-0000-4000-8000-000000000301'),'Intenção inicial. Intenção final.','intenção reunida é persistida sem truncar');
select is((select progression from private.course_authoring_parts where id='30400000-0000-4000-8000-000000000301'),'["Passo inicial.","Passo final."]'::jsonb,'progressão reunida é persistida');
select is((select public.save_course_authoring_part_for_actor_v1('30400000-0000-4000-8000-000000000001',
 '30400000-0000-4000-8000-000000000101',revision,plan_version,payload,name,encode(extensions.digest(payload::text,'sha256'),'hex'))->>'idempotent'
 from part_requests where name='parts-split-304'),'true','resposta perdida de criação retorna o recibo original mesmo depois da reunião');
select is((select revision from public.courses where id='30400000-0000-4000-8000-000000000101'),4::bigint,'retry não repete criação nem avança revisão');
select throws_ok($$select public.save_course_authoring_part_for_actor_v1('30400000-0000-4000-8000-000000000001',
 '30400000-0000-4000-8000-000000000101',revision,plan_version,payload,'parts-stale-304',encode(extensions.digest(payload::text,'sha256'),'hex'))
 from part_requests where name='parts-split-304'$$,'PT409',null,'CAS recusa revisão obsoleta sem mutação');
select throws_ok($$select public.save_course_authoring_part_for_actor_v1('30400000-0000-4000-8000-000000000001',
 '30400000-0000-4000-8000-000000000101',revision,plan_version,payload,name,repeat('a',64))
 from part_requests where name='parts-split-304'$$,'23514',null,'recibo não aceita payload divergente');
select is((select jsonb_agg(to_jsonb(e) order by entity_type,entity_id) from private.course_entities e where course_id='30400000-0000-4000-8000-000000000101'),
 (select value from before_entities),'IDs, hierarquia, conteúdo, revisões e snapshots permanecem literalmente iguais');
select is((select design_snapshot from private.course_entities where course_id='30400000-0000-4000-8000-000000000101' and entity_id='u'),
 (select snapshot from historical_snapshot),'snapshot histórico permanece intacto');
select is((select design_application from private.course_entities where course_id='30400000-0000-4000-8000-000000000101' and entity_id='u'),
 (select application from historical_snapshot),'aplicação pedagógica permanece intacta');
select lives_ok($$select pg_temp.save_part('parts-noop-304','30400000-0000-4000-8000-000000000301',0,
 '[{"microsequenceId":"s","position":0},{"microsequenceId":"t","position":1},{"microsequenceId":"r","position":2},{"microsequenceId":"z","position":3}]')$$,'salvar sem mudança é válido');
select is((select result->>'changed' from part_requests where name='parts-noop-304'),'false','no-op não finge mudança');
select is((select revision from public.courses where id='30400000-0000-4000-8000-000000000101'),4::bigint,'no-op mantém CAS');
select throws_ok($$select pg_temp.save_part('parts-foreign-304','30400000-0000-4000-8000-000000000301',0,'[{"microsequenceId":"missing","position":0}]')$$,
 '23514',null,'não cria microssequência fora do curso');
set local role authenticated;
select throws_ok($$select public.save_course_authoring_part_for_actor_v1(null,null,1,1,'{}','test-auth-denied',repeat('a',64))$$,
 '42501',null,'JWT autenticado não invoca o RPC privilegiado diretamente');
reset role;
-- Append to 021 after its existing assertions and reset role, before finish()/rollback.
-- The historical study_unit u and its content/snapshots are not changed.
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,updated_at) values
('30400000-0000-4000-8000-000000000101','study_unit','latest-t-first','microsequence','t',1,
 '{"title":"Primeiro caso adicional","content":[{"id":"latest-p1","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Um caso sintético para ordenar a inspeção."}}],"response":null,"feedback":[],"topics":[]}', '2030-01-01T00:00:00Z'),
('30400000-0000-4000-8000-000000000101','study_unit','latest-t-second','microsequence','t',2,
 '{"title":"Segundo caso adicional","content":[{"id":"latest-p2","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Outro caso sintético para ordenar a inspeção."}}],"response":null,"feedback":[],"topics":[]}', '2031-01-01T00:00:00Z'),
('30400000-0000-4000-8000-000000000101','study_unit','latest-r-first','microsequence','r',1,
 '{"title":"Caso em outro escopo","content":[{"id":"latest-p3","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Um caso sintético em outra microssequência."}}],"response":null,"feedback":[],"topics":[]}', '2031-01-01T00:00:00Z');

create function pg_temp.inspection_latest304(
 p_scope_kind text default 'course', p_scope_id text default null,
 p_entry text default 'latest_updated', p_anchor text default null, p_cursor text default null,
 p_direction text default 'forward', p_revision bigint default null
) returns jsonb language sql as $$
 select public.list_owned_course_study_units_for_actor_v2(
  '30400000-0000-4000-8000-000000000001','30400000-0000-4000-8000-000000000101',
  coalesce(p_revision,(select revision from public.courses where id='30400000-0000-4000-8000-000000000101')),
  p_scope_kind,p_scope_id,p_anchor,p_cursor,p_direction,1,524288,p_entry
 )
$$;

select is((select public.list_owned_course_study_units_for_actor_v2(
 '30400000-0000-4000-8000-000000000001','30400000-0000-4000-8000-000000000101',revision,
 'course',null,null,null,'forward',1,524288)#>>'{items,0,studyUnit,id}'
 from public.courses where id='30400000-0000-4000-8000-000000000101'),
 'u','caller anterior de dez argumentos continua no início curricular');
select is(pg_temp.inspection_latest304()->>'contract','aralearn.course-study-unit-inspection-page.v2',
 'entrada recente conserva o contrato da página curricular existente');
select is(pg_temp.inspection_latest304()#>>'{items,0,studyUnit,id}','latest-t-second',
 'entrada recente procura no escopo inteiro além da primeira página e desempata pela ordem curricular');
select is((pg_temp.inspection_latest304()#>>'{items,0,ordinal}')::integer,3,
 'âncora recente conserva ordinal curricular em vez de posição numa lista paralela');
select is((pg_temp.inspection_latest304()->>'totalCount')::integer,4,'contagem continua abrangendo todo o escopo');
select is(pg_temp.inspection_latest304()->>'hasPrevious','true','âncora permite voltar ao conteúdo anterior');
select is(pg_temp.inspection_latest304()->>'hasMore','true','âncora conserva continuação curricular');
select is(pg_temp.inspection_latest304(p_entry=>null,p_cursor=>'latest-t-second')#>>'{items,0,studyUnit,id}',
 'latest-r-first','cursor seguinte continua pela ordem curricular, sem repetir modo de entrada');
select is(pg_temp.inspection_latest304(p_entry=>null,p_cursor=>'latest-t-second',p_direction=>'backward')#>>'{items,0,studyUnit,id}',
 'latest-t-first','cursor anterior conserva a direção normal da inspeção');
select is(pg_temp.inspection_latest304('didactic_microsequence','r')#>>'{items,0,studyUnit,id}',
 'latest-r-first','entrada recente respeita o escopo da microssequência');
select is(pg_temp.inspection_latest304('lesson','l')#>>'{items,0,studyUnit,id}',
 'latest-t-second','entrada recente respeita o escopo da lição');
select is(pg_temp.inspection_latest304('didactic_microsequence','z')->'items','[]'::jsonb,
 'escopo vazio retorna página vazia sem inventar âncora');

-- All earlier grouping/snapshot invariance assertions have completed before this setup change.
delete from private.course_authoring_part_didactic_microsequences
where course_id='30400000-0000-4000-8000-000000000101' and didactic_microsequence_id='t';
select is(pg_temp.inspection_latest304('unassigned')#>>'{items,0,studyUnit,id}',
 'latest-t-second','entrada recente sem parte filtra o conjunto antes de escolher a âncora');
select is(pg_temp.inspection_latest304('authoring_part','30400000-0000-4000-8000-000000000301')#>>'{items,0,studyUnit,id}',
 'latest-r-first','entrada recente por parte não vaza a unidade mais nova de outro agrupamento');
select throws_ok($$select pg_temp.inspection_latest304(p_entry=>'latest_created')$$,'22023',null,'recusa modo de entrada desconhecido');
select throws_ok($$select pg_temp.inspection_latest304(p_anchor=>'u')$$,'22023',null,'entrada recente e âncora explícita são exclusivas');
select throws_ok($$select pg_temp.inspection_latest304(p_cursor=>'u')$$,'22023',null,'entrada recente e cursor são exclusivos');
select throws_ok($$select pg_temp.inspection_latest304(p_direction=>'backward')$$,'22023',null,'entrada recente exige direção forward');
select throws_ok($$select pg_temp.inspection_latest304(p_revision=>1)$$,'PT409',null,'entrada recente não ignora CAS da leitura');
select ok(to_regprocedure('public.list_owned_course_study_units_for_actor_v2(uuid,uuid,bigint,text,text,text,text,text,integer,integer)') is null,
 'overload antigo foi substituído, sem duas rotas RPC ambíguas');
set local role authenticated;
select throws_ok($$select public.list_owned_course_study_units_for_actor_v2(
 '30400000-0000-4000-8000-000000000001','30400000-0000-4000-8000-000000000101',4,
 p_entry=>'latest_updated')$$,'42501',null,'entrada recente não expõe o reader privilegiado ao JWT autenticado');
reset role;

select * from finish();
rollback;
