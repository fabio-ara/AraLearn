begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','52410000-0000-4000-8000-000000000001','authenticated','authenticated',
  'prepared-owner-524@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal)
values('52410000-0000-4000-8000-000000000101','52410000-0000-4000-8000-000000000001',
  'Leitura sintética preparada','Preservar o literal entre chamadas.');

create temporary table prepared_fixture as
select public.get_prepared_course_read_stamp_for_actor_v1(
  '52410000-0000-4000-8000-000000000001','52410000-0000-4000-8000-000000000101',revision) stamp,
  '{"texto":"á' || chr(65535) || chr(65536) || chr(1114111) || '😀日本語"}' literal
from public.courses where id='52410000-0000-4000-8000-000000000101';
alter table prepared_fixture add column digest text;
alter table prepared_fixture add column state jsonb;
update prepared_fixture set digest=encode(extensions.digest(convert_to(literal,'UTF8'),'sha256'),'hex'),
  state=jsonb_build_object('c',stamp->'courseId','r',stamp->'revision','q',repeat('b',64),'o',0,'h',null,'p',null);
select is((select count(*) from private.course_prepared_read_generations
  where course_id='52410000-0000-4000-8000-000000000101'),1::bigint,'um curso novo recebe geração de invalidação');
select throws_ok($q$select public.get_prepared_course_read_stamp_for_actor_v1(
  '52410000-0000-4000-8000-000000000001','52410000-0000-4000-8000-000000000101',
  (select (stamp->>'revision')::bigint+1 from prepared_fixture))$q$,'PT409',
  'O curso mudou; recomece a leitura.','carimbo obsoleto usa conflito de aplicação');
select is(public.save_prepared_course_read_batch_for_actor_v1(
  '52410000-0000-4000-8000-000000000001','52410000-0000-4000-8000-000000000201',
  stamp,repeat('a',64),digest,state,jsonb_build_array(literal),null,
  '{"result":"Leitura","deepLink":null,"links":[],"nextDecision":null}',null,
  char_length(literal)+3,octet_length(literal),0,1)->>'digest',digest,
  'o SQL verifica o hash real dos bytes guardados') from prepared_fixture;
update prepared_fixture set state=state||jsonb_build_object('s','52410000-0000-4000-8000-000000000201','o',1,'h',digest);
select is(public.read_prepared_course_read_for_actor_v1(
  '52410000-0000-4000-8000-000000000001','52410000-0000-4000-8000-000000000201',repeat('a',64),state)->>'text',
  literal,'a janela conserva Unicode literalmente') from prepared_fixture;
select is((select total from private.course_prepared_reads where id='52410000-0000-4000-8000-000000000201'),
  (select char_length(literal)+3 from prepared_fixture),'o total conta UTF-16 em BMP e pontos suplementares extremos');
select ok(not has_table_privilege('authenticated','private.course_prepared_reads','SELECT') and
  not has_table_privilege('anon','private.course_prepared_read_chunks','SELECT') and
  not has_table_privilege('service_role','private.course_prepared_read_chunks','SELECT'),
  'tabelas não oferecem caminho direto de leitura');
select ok(not has_function_privilege('authenticated','public.read_prepared_course_read_for_actor_v1(uuid,uuid,text,jsonb)','EXECUTE') and
  has_function_privilege('service_role','public.read_prepared_course_read_for_actor_v1(uuid,uuid,text,jsonb)','EXECUTE'),
  'somente o serviço chama a fronteira autorizada');
select ok(not has_function_privilege('authenticated','public.save_prepared_course_read_batch_for_actor_v1(uuid,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text,integer,integer,integer,integer)','EXECUTE') and
  not has_function_privilege('anon','public.save_prepared_course_read_batch_for_actor_v1(uuid,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text,integer,integer,integer,integer)','EXECUTE') and
  has_function_privilege('service_role','public.save_prepared_course_read_batch_for_actor_v1(uuid,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text,integer,integer,integer,integer)','EXECUTE'),
  'o lote tem a mesma fronteira exclusiva do serviço');
select ok(to_regprocedure('public.save_prepared_course_read_for_actor_v1(uuid,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text)') is null,
  'o caminho de requisição integral foi retirado');
update public.courses set annotation_set_version=annotation_set_version+1
where id='52410000-0000-4000-8000-000000000101';
select throws_ok($q$select public.read_prepared_course_read_for_actor_v1(
  '52410000-0000-4000-8000-000000000001','52410000-0000-4000-8000-000000000201',repeat('a',64),
  (select state from prepared_fixture))$q$,'PT409',
  'A leitura preparada expirou ou mudou; recomece a consulta.','observação invalida sem remontar o curso');
select throws_ok($q$select public.save_prepared_course_read_batch_for_actor_v1(
  '52410000-0000-4000-8000-000000000001','52410000-0000-4000-8000-000000000202',
  stamp,repeat('a',64),digest,state-'s'||jsonb_build_object('o',0,'h',null),jsonb_build_array(literal),null,
  '{"result":"Leitura","deepLink":null,"links":[],"nextDecision":null}',null,
  char_length(literal)+3,octet_length(literal),0,1) from prepared_fixture$q$,'PT409',
  'O conteúdo mudou durante a preparação; recomece a leitura.','gravação com carimbo obsoleto usa conflito de aplicação');
update private.course_prepared_reads set expires_at=statement_timestamp()-interval '1 second'
where id='52410000-0000-4000-8000-000000000201';
select is(private.cleanup_prepared_course_reads_v1(),1::bigint,'limpeza remove a leitura expirada');
select throws_ok($q$select public.read_prepared_course_read_for_actor_v1(
  '52410000-0000-4000-8000-000000000001','52410000-0000-4000-8000-000000000201',repeat('a',64),
  (select state from prepared_fixture))$q$,'PT409',
  'A leitura preparada expirou ou está indisponível; recomece a consulta.','leitura removida pela expiração usa conflito de aplicação');

select is((select count(*) from private.course_prepared_read_chunks
  where read_id='52410000-0000-4000-8000-000000000201'),0::bigint,'limpeza remove os trechos por cascade');
select is((select command from cron.job where jobname='aralearn-prepared-read-retention-v1'),
  'select private.cleanup_prepared_course_reads_v1();','Cron executa a rotina limitada de limpeza');
select * from finish();
rollback;
