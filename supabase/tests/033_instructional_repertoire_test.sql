begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','53410000-0000-4000-8000-000000000001','authenticated','authenticated',
  'repertoire-owner-534@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal,revision)
values('53410000-0000-4000-8000-000000000101','53410000-0000-4000-8000-000000000001',
  'Repertório sintético','Ler sem reconstruir a revisão global.',1);
insert into private.course_instructional_plans(id,course_id,audience,instructional_scope,version)
values('53410000-0000-4000-8000-000000000111','53410000-0000-4000-8000-000000000101','Iniciantes','Comunicação',3);
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description,version)
values
('53410000-0000-4000-8000-000000000121','53410000-0000-4000-8000-000000000101','53410000-0000-4000-8000-000000000111',
 'instructional_analysis_unit',2,'Distinguir mensagem e sinal.','Uma mensagem pode usar sinais distintos.',2),
('53410000-0000-4000-8000-000000000122','53410000-0000-4000-8000-000000000101','53410000-0000-4000-8000-000000000111',
 'evidence_requirement',0,'Justificar a distinção.','Descrição interna da evidência.',1),
('53410000-0000-4000-8000-000000000123','53410000-0000-4000-8000-000000000101','53410000-0000-4000-8000-000000000111',
 'curriculum_scope_item',4,'Representação da informação.','Descrição interna do escopo.',1);
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
values
('53410000-0000-4000-8000-000000000101','module','repertoire-module',null,null,0,'{"title":"Fundamentos"}'),
('53410000-0000-4000-8000-000000000101','lesson','repertoire-lesson','module','repertoire-module',1,'{"title":"Comunicação"}'),
('53410000-0000-4000-8000-000000000101','microsequence','repertoire-micro','lesson','repertoire-lesson',2,'{"title":"Mensagem e sinal","goal":"Separar informação e transporte."}');

create function pg_temp.read_repertoire(p_actor uuid default '53410000-0000-4000-8000-000000000001',p_revision bigint default null)
returns jsonb language sql as $q$
select public.get_owned_course_instructional_repertoire_for_actor_v1(p_actor,id,coalesce(p_revision,revision))
from public.courses where id='53410000-0000-4000-8000-000000000101'
$q$;
create temporary table repertoire_result as select pg_temp.read_repertoire() value;
select is((select value->>'contract' from repertoire_result),'aralearn.course-instructional-repertoire.v1','contrato explícito');
select is((select value->>'courseId' from repertoire_result),'53410000-0000-4000-8000-000000000101','identidade preservada');
select is((select (value#>>'{plan,version}')::int from repertoire_result),3,'versão do plano preservada');
select is((select value#>'{plan,instructionalAnalysisUnits,0}' from repertoire_result),
  '{"id":"53410000-0000-4000-8000-000000000121","position":2,"statement":"Distinguir mensagem e sinal.","description":"Uma mensagem pode usar sinais distintos.","version":2}'::jsonb,
  'análise conserva identidade, posição, enunciado, descrição e versão');
select is((select value#>'{plan,evidenceRequirements,0}' from repertoire_result),
  '{"id":"53410000-0000-4000-8000-000000000122","position":0,"statement":"Justificar a distinção.","version":1}'::jsonb,
  'evidência conserva a projeção consumida');
select is((select value#>'{plan,curriculumScopeItems,0}' from repertoire_result),
  '{"id":"53410000-0000-4000-8000-000000000123","position":4,"statement":"Representação da informação."}'::jsonb,
  'cobertura conserva referência humana');
select is((select value#>'{plan,curriculum,modules,0,lessons,0,microsequences,0}' from repertoire_result),
  '{"id":"repertoire-micro","position":2,"title":"Mensagem e sinal"}'::jsonb,'hierarquia resolve escopos sem conteúdo didático');
select ok((select not(value->'plan' ?| array['studyUnits','contentReview','sharedExplanations']) from repertoire_result),
  'não transporta corpos nem computa a revisão global');
select ok(not has_function_privilege('anon','public.get_owned_course_instructional_repertoire_for_actor_v1(uuid,uuid,bigint)','EXECUTE') and
  not has_function_privilege('authenticated','public.get_owned_course_instructional_repertoire_for_actor_v1(uuid,uuid,bigint)','EXECUTE') and
  has_function_privilege('service_role','public.get_owned_course_instructional_repertoire_for_actor_v1(uuid,uuid,bigint)','EXECUTE'),
  'somente o serviço chama a fronteira autorizada');
select throws_ok($q$select pg_temp.read_repertoire('53410000-0000-4000-8000-000000000002')$q$,'PT404',null,'terceiro não lê repertório privado');
select throws_ok($q$select pg_temp.read_repertoire(null)$q$,'42501',null,'ator ausente rejeitado');
select throws_ok($q$select pg_temp.read_repertoire(p_revision=>999999)$q$,'PT409',null,'revisão obsoleta rejeitada');
select throws_ok($q$select public.get_owned_course_instructional_repertoire_for_actor_v1(
 '53410000-0000-4000-8000-000000000001','53410000-0000-4000-8000-000000000101',null)$q$,'PT409',null,'revisão obrigatória');
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok($q$select pg_temp.read_repertoire()$q$,'42501',null,'guarda do serviço também protege a execução');
select set_config('request.jwt.claim.role','service_role',true);
update private.course_instructional_plan_items set statement='Explicar a distinção em outro caso.'
where id='53410000-0000-4000-8000-000000000122';
select is(pg_temp.read_repertoire()#>>'{plan,evidenceRequirements,0,statement}','Explicar a distinção em outro caso.',
  'a leitura é atual, não uma cópia cacheada sem invalidação');
select * from finish();
rollback;
