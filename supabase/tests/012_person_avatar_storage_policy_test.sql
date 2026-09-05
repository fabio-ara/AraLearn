begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);

-- Somente identidades sintéticas; toda a prova reverte ao final.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,is_anonymous,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',id::uuid,'authenticated','authenticated',email,'',now(),'{}','{}',false,now(),now()
from (values('95000000-0000-4000-8000-000000000001','avatar-owner@example.test'),
 ('95000000-0000-4000-8000-000000000002','avatar-reader@example.test'),
 ('95000000-0000-4000-8000-000000000003','avatar-other@example.test')) u(id,email);
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
 ('95000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000001',now(),now(),now()+interval '1 hour'),
 ('95000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000002',now(),now(),now()+interval '1 hour'),
 ('95000000-0000-4000-8000-000000000013','95000000-0000-4000-8000-000000000003',now(),now(),now()+interval '1 hour');
insert into public.courses(id,owner_id,title,goal) values(
 '95000000-0000-4000-8000-000000000101','95000000-0000-4000-8000-000000000001','Curso de política de avatar','Verificar acesso relacionado.');
update public.person_profiles set handle='avatar.leitor' where user_id='95000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"95000000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
select throws_ok('select * from public.person_profiles','42501','permission denied for table person_profiles','perfil não vira diretório consultável');
select lives_ok($t$insert into storage.objects(bucket_id,name,owner_id) values('person-avatars',
 '95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png',
 '95000000-0000-4000-8000-000000000002')$t$,'policy permite upload próprio sem SELECT de perfil');
select is((select count(*) from storage.objects where bucket_id='person-avatars' and
 name='95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png'),1::bigint,'pessoa lê o próprio avatar');
select throws_ok($t$insert into storage.objects(bucket_id,name,owner_id) values('person-avatars',
 '95000000-0000-4000-8000-000000000003/95000000-0000-4000-8000-000000000023.png',
 '95000000-0000-4000-8000-000000000002')$t$,'42501','new row violates row-level security policy for table "objects"','upload não escreve caminho de outra pessoa');
select throws_ok($t$insert into storage.objects(bucket_id,name,owner_id) values('person-avatars',
 '95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000023.png',
 '95000000-0000-4000-8000-000000000003')$t$,'42501','new row violates row-level security policy for table "objects"','upload não forja proprietário do objeto');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.update_person_profile_for_actor_v2('95000000-0000-4000-8000-000000000002',
 '{"avatarObjectKey":"95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png"}')->>'avatarObjectKey',
 '95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png','perfil vincula objeto próprio enviado');
select is(public.search_course_access_people_for_actor_v1('95000000-0000-4000-8000-000000000001',
 '95000000-0000-4000-8000-000000000101','avatar',10)->'items'->0->>'avatarObjectKey',
 '95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png','busca owned retorna somente referência do avatar selecionado');
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"95000000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id='person-avatars' and
 name='95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png'),0::bigint,'busca não abre leitura Storage genérica');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.manage_course_access_for_actor_v3('95000000-0000-4000-8000-000000000001',
 '95000000-0000-4000-8000-000000000101','grant_access','avatar.leitor',
 '95000000-0000-4000-8000-000000000002',true,'avatar-grant-01',false)->>'changed','true','grant estabelece relação por UUID confirmado');
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"95000000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id='person-avatars' and
 name='95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png'),1::bigint,'relação do curso permite leitura do avatar');
reset role;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"95000000-0000-4000-8000-000000000013"}',true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id='person-avatars' and
 name='95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png'),0::bigint,'terceiro não lê avatar por caminho conhecido');
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select is((select count(*) from storage.objects where bucket_id='person-avatars' and
 name='95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png'),0::bigint,'visitante não lê bucket de avatares');
select throws_ok($t$insert into storage.objects(bucket_id,name,owner_id) values('person-avatars',
 '95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000025.png',
 '95000000-0000-4000-8000-000000000002')$t$,'42501','new row violates row-level security policy for table "objects"','visitante não faz upload');
reset role;
update auth.sessions set not_after=now()-interval '1 second' where id='95000000-0000-4000-8000-000000000012';
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"95000000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id='person-avatars' and
 name='95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000022.png'),0::bigint,'sessão vencida não lê nem o próprio avatar');
select throws_ok($t$insert into storage.objects(bucket_id,name,owner_id) values('person-avatars',
 '95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000026.png',
 '95000000-0000-4000-8000-000000000002')$t$,'42501','new row violates row-level security policy for table "objects"','sessão vencida não envia avatar');
reset role;
select ok(not (select public from storage.buckets where id='person-avatars'),'bucket de avatar permanece privado');
select * from finish();
rollback;
