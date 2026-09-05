begin;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','93000000-0000-4000-8000-000000000001','authenticated','authenticated','preferences-owner@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','93000000-0000-4000-8000-000000000002','authenticated','authenticated','preferences-other@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal,revision) values('93000000-0000-4000-8000-000000000101','93000000-0000-4000-8000-000000000001','Curso sintético','Preservar conteúdo e testar preferências.',1);
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('93000000-0000-4000-8000-000000000101','module','module-a',null,null,0,'{"title":"Módulo sintético","guide":{"goal":"Provar escopos.","include":[],"exclude":[],"notation":[],"avoid":[]}}'),
('93000000-0000-4000-8000-000000000101','lesson','lesson-a','module','module-a',0,'{"title":"Lição de controle","guide":{"goal":"Provar escopos.","include":[],"exclude":[],"notation":[],"avoid":[]}}'),
('93000000-0000-4000-8000-000000000101','lesson','lesson-b','module','module-a',1,'{"title":"Outra lição","guide":{"goal":"Provar isolamento.","include":[],"exclude":[],"notation":[],"avoid":[]}}');
create temporary table content_before as select entity_id,content,version from private.course_entities where course_id='93000000-0000-4000-8000-000000000101';
create function pg_temp.command(request text,command jsonb) returns jsonb language sql as $f$
select public.apply_course_design_command_for_actor_v3('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',(select revision from public.courses where id='93000000-0000-4000-8000-000000000101'),command,request,encode(extensions.digest(command::text,'sha256'),'hex'),'application') $f$;
create function pg_temp.assignment(kind text,ref text) returns jsonb language sql as $f$
select value from jsonb_array_elements(private.course_current_design_parameters_v1('93000000-0000-4000-8000-000000000101',private.course_design_scope_path_v1('93000000-0000-4000-8000-000000000101',kind,ref))) where value->>'parameterId'='study_unit_content_word_target' $f$;
create function pg_temp.apply_profile(request text,policy jsonb) returns jsonb language sql as $f$
select public.apply_course_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',(select revision from public.courses where id='93000000-0000-4000-8000-000000000101'),'93000000-0000-4000-8000-000000000201',(select revision from private.authoring_profiles where id='93000000-0000-4000-8000-000000000201'),policy,request,encode(extensions.digest(request,'sha256'),'hex'),'application') $f$;
select is((select count(*) from private.course_design_parameter_definitions),12::bigint,'catálogo único contém 12 definições');
select ok(private.valid_course_design_parameter_value_v1('practice_distribution','"interleaved"'),'enum atual é válido');
select ok(not private.valid_course_design_parameter_value_v1('practice_distribution','"inventado"'),'enum desconhecido falha fechado');
select ok(not private.valid_course_design_parameter_value_v1('authoring_batch_part_target','1.5'),'granularidade exige inteiro');
select ok(not has_table_privilege('anon','private.authoring_profiles','select') and not has_table_privilege('authenticated','private.authoring_profiles','select'),'perfil não abre diretório de contas');
select ok(not has_function_privilege('authenticated','public.save_authoring_profile_for_actor_v1(uuid,uuid,bigint,text,jsonb,text,text)','execute'),'writer de perfil restrito ao transporte autorizado');
select is(pg_temp.assignment('lesson','lesson-a')#>'{effectiveAssignment,value}','null'::jsonb,'ausência delega sem fabricar valor');
select is(pg_temp.assignment('lesson','lesson-a')->'localAssignment','null'::jsonb,'ausência local permanece herança');
select is(pg_temp.command('delegate-0001','{"type":"delegate_parameter","scope":{"kind":"course","ref":"93000000-0000-4000-8000-000000000101"},"parameterId":"study_unit_content_word_target","reason":"Escolher conforme contexto."}')#>>'{changed}','true','delegação explícita é gravada');
select is(pg_temp.assignment('lesson','lesson-a')#>>'{effectiveAssignment,mode}','automatic','intenção é automática');
select is(pg_temp.assignment('lesson','lesson-a')#>>'{effectiveAssignment,inherited}','true','delegação é herdada');
select is(pg_temp.command('automatic-0001','{"type":"set_parameter","scope":{"kind":"course","ref":"93000000-0000-4000-8000-000000000101"},"parameterId":"study_unit_content_word_target","value":220,"origin":"automatic","reason":"O contexto exige exemplos desenvolvidos."}')#>>'{changed}','true','escolha automática preserva valor e razão');
select is(pg_temp.assignment('lesson','lesson-a')#>>'{effectiveAssignment,value}','220','valor escolhido fica observável');
select is(pg_temp.command('author-fixed-01','{"type":"set_parameter","scope":{"kind":"course","ref":"93000000-0000-4000-8000-000000000101"},"parameterId":"study_unit_content_word_target","value":240,"origin":"author","reason":"Preferência explícita do autor."}')#>>'{changed}','true','autor fixa o parâmetro');
select is(pg_temp.command('automatic-0002','{"type":"set_parameter","scope":{"kind":"lesson","ref":"lesson-a"},"parameterId":"study_unit_content_word_target","value":280,"origin":"automatic","reason":"Tentativa automática descendente."}')#>>'{changed}','false','automático não grava sobre fixação ancestral');
select is(pg_temp.assignment('lesson','lesson-a')->'localAssignment','null'::jsonb,'não deixa atribuição automática paralela');
select is(pg_temp.command('lesson-exception-01','{"type":"set_parameter","scope":{"kind":"lesson","ref":"lesson-a"},"parameterId":"study_unit_content_word_target","value":260,"origin":"author","reason":"Exceção local de desenvolvimento."}')#>>'{changed}','true','exceção humana de escopo existe');
select is(pg_temp.assignment('lesson','lesson-b')#>>'{effectiveAssignment,value}','240','mudança local não afeta lição irmã');
select throws_ok($$select pg_temp.command('research-conflict1','{"type":"set_parameter","scope":{"kind":"course","ref":"93000000-0000-4000-8000-000000000101"},"parameterId":"study_unit_content_word_target","value":300,"origin":"research_condition","reason":"Condição fixa sintética."}')$$,'PD409',null,'condição ascendente conflitante é bloqueada');
select is(pg_temp.assignment('course','93000000-0000-4000-8000-000000000101')#>>'{effectiveAssignment,value}','240','falha reverte toda alteração conflitante');
-- Simula conflito que já existia antes da nova regra, sem silenciar na leitura.
update private.course_design_parameter_assignments set origin='research_condition' where course_id='93000000-0000-4000-8000-000000000101' and scope_kind='course';
select is(jsonb_array_length(pg_temp.assignment('lesson','lesson-a')->'conflicts'),1,'conflito pré-existente é visível');
select is(pg_temp.assignment('lesson','lesson-a')#>>'{effectiveAssignment,value}','240','pesquisa não perde precedência para exceção descendente');
select is(pg_temp.command('resolve-conflict1','{"type":"clear_parameter","scope":{"kind":"lesson","ref":"lesson-a"},"parameterId":"study_unit_content_word_target"}')#>>'{changed}','true','limpar exceção resolve conflito sem apagar pesquisa');
select is(jsonb_array_length(pg_temp.assignment('lesson','lesson-a')->'conflicts'),0,'conflito resolvido fica inequívoco');
select throws_ok($$select public.save_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000201',0,'Inválido','[{"parameterId":"practice_distribution","mode":"fixed","value":"interleaved","origin":"research_condition"}]','profile-invalid-01',repeat('a',64))$$,'22023',null,'perfil não guarda pesquisa, segredo ou campos livres');
select is(public.save_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000201',0,'Perfil sintético','[{"parameterId":"study_unit_content_word_target","mode":"fixed","value":240},{"parameterId":"practice_distribution","mode":"automatic","value":null}]','profile-create-01',repeat('a',64))->>'changed','true','perfil criado com preferências tipadas');
select is(public.save_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000201',0,'Perfil sintético','[{"parameterId":"study_unit_content_word_target","mode":"fixed","value":240},{"parameterId":"practice_distribution","mode":"automatic","value":null}]','profile-create-01',repeat('a',64))->>'idempotent','true','resposta perdida de criação reconcilia pelo recibo');
select is(jsonb_array_length(public.list_authoring_profiles_for_actor_v1('93000000-0000-4000-8000-000000000002')->'profiles'),0,'outra conta não lista perfil alheio');
select throws_ok($$select public.save_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000201',1,'Perfil alheio','[{"parameterId":"practice_distribution","mode":"fixed","value":"clustered"}]','profile-foreign-01',repeat('b',64))$$,'PT404',null,'outra conta não altera perfil');
select throws_ok($$select public.save_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000201',0,'Perfil obsoleto','[{"parameterId":"practice_distribution","mode":"fixed","value":"clustered"}]','profile-stale-01',repeat('b',64))$$,'40001',null,'perfil verifica CAS');
select is(pg_temp.apply_profile('profile-apply-01','{"mode":"preserve","exceptions":[]}')->>'changed','true','aplicação copia preferências de modo atômico');
select is(pg_temp.apply_profile('profile-apply-02','{"mode":"preserve","exceptions":[]}')->>'changed','false','reaplicar resultado equivalente é no-op');
select is(pg_temp.assignment('course','93000000-0000-4000-8000-000000000101')#>>'{effectiveAssignment,origin}','research_condition','perfil equivalente não desativa pesquisa');
select is(pg_temp.command('clear-research1','{"type":"clear_parameter","scope":{"kind":"course","ref":"93000000-0000-4000-8000-000000000101"},"parameterId":"study_unit_content_word_target"}')#>>'{changed}','true','resolução explícita retira condição antes de mudar tratamento');
select is(pg_temp.command('exception-again1','{"type":"set_parameter","scope":{"kind":"lesson","ref":"lesson-a"},"parameterId":"study_unit_content_word_target","value":280,"origin":"author","reason":"Exceção local a preservar."}')#>>'{changed}','true','restabelece exceção sintética');
select is(public.preview_course_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',(select revision from public.courses where id='93000000-0000-4000-8000-000000000101'),'93000000-0000-4000-8000-000000000201',1)#>>'{exceptions,0,scopeLabel}','Lição de controle','prévia identifica escopo pelo nome humano');
select is(pg_temp.apply_profile('profile-preserve1','{"mode":"preserve","exceptions":[]}')->>'changed','true','aplicação preserva exceção por escolha explícita');
select is(pg_temp.assignment('lesson','lesson-a')#>>'{effectiveAssignment,value}','280','exceção local permanece');
select is(pg_temp.apply_profile('profile-remove-01','{"mode":"remove_selected","exceptions":[{"parameterId":"study_unit_content_word_target","scope":{"kind":"lesson","ref":"lesson-a"}}]}')->>'changed','true','aplicação remove somente exceção selecionada');
select is(pg_temp.assignment('lesson','lesson-a')#>>'{effectiveAssignment,value}','240','remoção restaura herança do perfil copiado');
select is(public.save_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000201',1,'Perfil alterado','[{"parameterId":"study_unit_content_word_target","mode":"fixed","value":360}]','profile-edit-01',repeat('c',64))->>'revision','2','perfil editado por CAS');
select is(pg_temp.assignment('lesson','lesson-a')#>>'{effectiveAssignment,value}','240','editar perfil não altera curso por vínculo vivo');
select is(public.delete_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000201',2,'profile-delete-01',repeat('d',64))->>'revision','3','exclusão confirma revisão seguinte');
select is(public.delete_authoring_profile_for_actor_v1('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000201',2,'profile-delete-01',repeat('d',64))->>'idempotent','true','exclusão com resposta perdida é repetível sem tombstone');
select is(pg_temp.assignment('lesson','lesson-a')#>>'{effectiveAssignment,value}','240','apagar perfil preserva cópia no curso');
select ok(not exists((select entity_id,content,version from private.course_entities where course_id='93000000-0000-4000-8000-000000000101' except select * from content_before) union all (select * from content_before except select entity_id,content,version from private.course_entities where course_id='93000000-0000-4000-8000-000000000101')),'todas as mudanças preservam conteúdo e versões de entidades');
select ok(not exists(select 1 from private.course_change_receipts where course_id is null and operation not in('save_authoring_profile','delete_authoring_profile')),'recibos sem curso limitados às duas operações de perfil');
select ok(to_regprocedure('public.get_owned_course_design_for_actor_v2(uuid,uuid,text,text,integer,text)') is null and to_regprocedure('public.apply_course_design_command_for_actor_v2(uuid,uuid,bigint,jsonb,text,text,text)') is null,'reader e writer substituídos foram retirados');
select is(public.get_owned_course_design_for_actor_v3('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101','course','93000000-0000-4000-8000-000000000101')->>'contract','aralearn.course-design.v3','leitura pública de autoria usa contrato novo');
select is(public.get_owned_course_authoring_analytics_for_actor_v3('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000101',(select revision from public.courses where id='93000000-0000-4000-8000-000000000101'),' {"scope":{"kind":"course","ref":null}}')->>'contract','aralearn.course-authoring-analytics.v3','analytics consulta a sequência real no contrato novo');
select throws_ok($$select private.normalize_authoring_profile_preferences_v1('[{"parameterId":"practice_distribution","mode":null,"value":"interleaved"}]')$$,'22023',null,'intenção null não é delegação automática');
select throws_ok($$select pg_temp.command('command-null-01','{"type":null,"scope":{"kind":"course","ref":"93000000-0000-4000-8000-000000000101"}}')$$,'22023',null,'comando null não limpa política incidentalmente');
select * from finish();
rollback;
