-- Executar depois da migration, ainda com a fixture de upgrade presente.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(17);
select set_config('request.jwt.claim.role','service_role',true);
select is((select owner_id::text from public.courses where id='92000000-0000-4000-8000-000000000102'),
 '92000000-0000-4000-8000-000000000002','upgrade conserva o dono do alvo');
select is((select copy_origin->>'sourceCourseId' from public.courses where id='92000000-0000-4000-8000-000000000102'),
 '92000000-0000-4000-8000-000000000101','mapping útil migrou antes do drop');
select is((select visibility from public.courses where id='92000000-0000-4000-8000-000000000101'),'private','curso existente continua privado');
select is((select avatar_object_key from public.person_profiles where user_id='92000000-0000-4000-8000-000000000002'),
 '92000000-0000-4000-8000-000000000002/92000000-0000-4000-8000-000000000009.png','avatar preservado');
create temporary table recovery_result as select public.recover_owned_course_copy_for_actor_v1(
 '92000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000101',3,1,
 '{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Edição inicial"}}',
 'manual','upgrade-lost-response') result;
select is((select result->>'status' from recovery_result),'confirmed','resposta perdida recupera alvo comprovado');
select is((select result->>'currentCourseRevision' from recovery_result),'4','recuperação informa revisão atual');
select is((select result->>'currentStudyUnitVersion' from recovery_result),'3','recuperação informa versão atual');
select is((select result->>'initialCourseRevision' from recovery_result),'2','recuperação distingue revisão inicial');
select is((select content->>'body' from private.course_entities where course_id='92000000-0000-4000-8000-000000000102' and entity_id='u'),
 'Alteração posterior preservada','recuperação não reaplica edição antiga');
select is(to_regclass('private.course_personal_copies')::text,null::text,'mapping substituído foi retirado');
select is((select previous_display_name from private.person_profile_identity_migration_backup
 where user_id='92000000-0000-4000-8000-000000000002'),'Nome legado sintético','nome anterior fica somente no arquivo privado da migração');
delete from private.course_change_receipts where actor_id='92000000-0000-4000-8000-000000000002' and request_id='upgrade-lost-response';
select is(public.recover_owned_course_copy_for_actor_v1('92000000-0000-4000-8000-000000000002',
 '92000000-0000-4000-8000-000000000101',3,1,
 '{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Edição inicial"}}',
 'manual','upgrade-lost-response')->>'status','confirmed','origem migrada recupera mesmo sem recibo temporário');
select is(public.recover_owned_course_copy_for_actor_v1('92000000-0000-4000-8000-000000000002',
 '92000000-0000-4000-8000-000000000101',3,1,
 '{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Outro conteúdo"}}',
 'manual','upgrade-lost-response')->>'status','unresolved','hash diferente conserva rascunho sem inferir confirmação');
update public.courses set owner_id='92000000-0000-4000-8000-000000000001' where id='92000000-0000-4000-8000-000000000102';
select is(public.recover_owned_course_copy_for_actor_v1('92000000-0000-4000-8000-000000000002',
 '92000000-0000-4000-8000-000000000101',3,1,
 '{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Edição inicial"}}',
 'manual','upgrade-lost-response')->>'status','unresolved','recuperação exige propriedade atual do alvo');
update public.courses set owner_id='92000000-0000-4000-8000-000000000002' where id='92000000-0000-4000-8000-000000000102';
delete from private.course_entities where course_id='92000000-0000-4000-8000-000000000102' and entity_type='study_unit' and entity_id='u';
select is(public.recover_owned_course_copy_for_actor_v1('92000000-0000-4000-8000-000000000002',
 '92000000-0000-4000-8000-000000000101',3,1,
 '{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Edição inicial"}}',
 'manual','upgrade-lost-response')->>'currentStudyUnitVersion',null::text,'unidade retirada não retorna versão inicial como atual');
delete from public.courses where id='92000000-0000-4000-8000-000000000101';
select is(public.recover_owned_course_copy_for_actor_v1('92000000-0000-4000-8000-000000000002',
 '92000000-0000-4000-8000-000000000101',3,1,
 '{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Edição inicial"}}',
 'manual','upgrade-lost-response')->>'status','confirmed','origem removida não apaga curso próprio nem prova migrada');
select is((select count(*) from public.courses where owner_id='92000000-0000-4000-8000-000000000002'),1::bigint,'recuperação nunca cria segundo alvo');
select * from finish();
rollback;
