begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','a3350000-0000-4000-8000-000000000001',
  'authenticated','authenticated','conflicts-owner@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal)
values('a3350000-0000-4000-8000-000000000101','a3350000-0000-4000-8000-000000000001',
  'Curso sintético de conflitos','Verificar conflitos sem repetir uma revisão antiga.');

select throws_ok($q$select public.get_owned_course_sources_for_actor_v1(
  'a3350000-0000-4000-8000-000000000001','a3350000-0000-4000-8000-000000000101',2,'catalog')$q$,
  'PT409','O Curso mudou durante a leitura de Fontes.','revisão antiga de Fontes é conflito de aplicação');
select is(public.get_owned_course_sources_for_actor_v1(
  'a3350000-0000-4000-8000-000000000001','a3350000-0000-4000-8000-000000000101',1,'catalog')->>'courseRevision',
  '1','revisão atual continua legível');
select is((select revision from public.courses where id='a3350000-0000-4000-8000-000000000101'),
  1::bigint,'leituras não alteram a revisão');
select is((select count(*) from private.course_change_receipts where course_id='a3350000-0000-4000-8000-000000000101'),
  0::bigint,'leituras não criam recibos de escrita');
select throws_ok($q$select public.get_owned_course_sources_for_actor_v1(
  null,'a3350000-0000-4000-8000-000000000101',1,'catalog')$q$,
  '42501','Autenticação obrigatória.','guarda de ator permanece antes da leitura');
select set_config('request.jwt.claim.role','anon',true);
select throws_ok($q$select public.get_owned_course_sources_for_actor_v1(
  'a3350000-0000-4000-8000-000000000001','a3350000-0000-4000-8000-000000000101',1,'catalog')$q$,
  '42501','Operação restrita ao serviço de autoria.','RPC de proprietário continua restrita ao serviço');
select set_config('request.jwt.claim.role','service_role',true);

create function pg_temp.capture_conflict(statement text) returns jsonb language plpgsql as $function$
declare error_detail text;
begin
  execute statement;
  return jsonb_build_object('sqlstate','00000');
exception when others then
  get stacked diagnostics error_detail=pg_exception_detail;
  return jsonb_build_object('sqlstate',sqlstate,
    'message',case when sqlstate='PGRST' then sqlerrm::jsonb else to_jsonb(sqlerrm) end,
    'detail',case when sqlstate='PGRST' then error_detail::jsonb else to_jsonb(error_detail) end);
end;
$function$;

create temporary table business_conflict as select pg_temp.capture_conflict($q$
  select public.execute_course_source_command_for_actor_v1(
    'a3350000-0000-4000-8000-000000000001','a3350000-0000-4000-8000-000000000101',2,
    '{"type":"set_bibliography_style","style":"apa7"}','application','conflict-business-0001')
$q$) error;
select is((select error->>'sqlstate' from business_conflict),'PGRST','captura inclui PT409 de negócio');
select is((select error#>>'{message,code}' from business_conflict),'40001','envelope JSON de conflito continua compatível');
select is((select error#>>'{detail,status}' from business_conflict),'409','envelope mantém status HTTP409');

-- Force an engine-class error inside the real writer, after its CAS guard. The
-- fixture-only trigger is rolled back and never affects another course.
create function pg_temp.force_native_conflict() returns trigger language plpgsql as $function$
begin
  raise exception 'Synthetic native serialization failure.' using errcode='40001';
end;
$function$;
create trigger conflict_native_fixture before update on public.courses
for each row when(old.id='a3350000-0000-4000-8000-000000000101')
execute function pg_temp.force_native_conflict();
create temporary table native_conflict as select pg_temp.capture_conflict($q$
  select public.execute_course_source_command_for_actor_v1(
    'a3350000-0000-4000-8000-000000000001','a3350000-0000-4000-8000-000000000101',1,
    '{"type":"set_bibliography_style","style":"apa7"}','application','conflict-native-0001')
$q$) error;
select is((select error->>'sqlstate' from native_conflict),'PGRST','captura nativa serialization_failure permanece');
select is((select error#>>'{message,code}' from native_conflict),'40001','40001 nativo mantém envelope JSON');
select is((select error#>>'{detail,status}' from native_conflict),'409','40001 nativo mantém status HTTP409');
select is((select revision from public.courses where id='a3350000-0000-4000-8000-000000000101'),
  1::bigint,'conflitos de negócio e nativo fazem rollback da revisão');
select is((select bibliography_style from public.courses where id='a3350000-0000-4000-8000-000000000101'),
  'abnt-2025','erro interno não confirma configuração');
select is((select count(*) from private.course_change_receipts where course_id='a3350000-0000-4000-8000-000000000101'),
  0::bigint,'erros não persistem recibos de sucesso');
drop trigger conflict_native_fixture on public.courses;

select is(public.execute_course_source_command_for_actor_v1(
  'a3350000-0000-4000-8000-000000000001','a3350000-0000-4000-8000-000000000101',1,
  '{"type":"set_bibliography_style","style":"apa7"}','application','conflict-current-0001')->>'courseRevision',
  '2','CAS atual aplica a configuração uma vez');
select is(public.execute_course_source_command_for_actor_v1(
  'a3350000-0000-4000-8000-000000000001','a3350000-0000-4000-8000-000000000101',1,
  '{"type":"set_bibliography_style","style":"apa7"}','application','conflict-current-0001')->>'idempotent',
  'true','recibo preserva idempotência depois da alteração');

select ok(not has_function_privilege('anon',
  'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)','execute'),
  'grant da RPC de proprietário não alcança anon');
select ok(not has_function_privilege('authenticated',
  'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)','execute'),
  'grant da RPC de proprietário não alcança authenticated');
select ok(has_function_privilege('service_role',
  'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)','execute'),
  'grant do serviço permanece');

select is((select sum(regexp_count(p.prosrc,$rx$\merrcode[[:space:]]*=[[:space:]]*'40001'$rx$,1,'i'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.prokind='f'),0::bigint,'contratos atuais não levantam serialização para conflito de negócio');
select is((select sum(regexp_count(p.prosrc,$rx$\merrcode[[:space:]]*=[[:space:]]*'PT409'$rx$,1,'i'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.prokind='f'),69::bigint,'69 guardas de negócio usam PT409');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.prokind='f'
    and p.prosrc~$rx$exception when serialization_failure or sqlstate 'PT409' then$rx$),
  7::bigint,'sete capturas incluem conflito de negócio sem retirar o caso nativo');
select is((select sum(regexp_count(p.prosrc,$rx$'code'[[:space:]]*,[[:space:]]*'40001'$rx$,1,'i'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.prokind='f'),8::bigint,'oito códigos JSON nos envelopes PGRST permanecem');

select * from finish();
rollback;
