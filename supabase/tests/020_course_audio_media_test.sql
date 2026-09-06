begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

-- Only synthetic rows in this transaction. Storage metadata does not prove audio bytes;
-- course-audio-local.spec.js exercises the actual upload, hash and browser decoder.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','30300000-0000-4000-8000-000000000001','authenticated','authenticated','audio-owner-303@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','30300000-0000-4000-8000-000000000002','authenticated','authenticated','audio-student-303@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','30300000-0000-4000-8000-000000000003','authenticated','authenticated','audio-stranger-303@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal) values
('30300000-0000-4000-8000-000000000101','30300000-0000-4000-8000-000000000001','Áudio sintético','Conferir acesso e ciclo de vida.');
insert into public.course_access(course_id,user_id,granted_by) values
('30300000-0000-4000-8000-000000000101','30300000-0000-4000-8000-000000000002','30300000-0000-4000-8000-000000000001');

create function pg_temp.audio_course() returns uuid language sql as $$select '30300000-0000-4000-8000-000000000101'::uuid$$;
create function pg_temp.audio_owner() returns uuid language sql as $$select '30300000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.audio_revision() returns bigint language sql as $$select revision from public.courses where id=pg_temp.audio_course()$$;
create function pg_temp.audio_config() returns jsonb language sql as $$
select '{"nativeVoiceURI":"voz-sintetica","rate":1.25,"locale":"zh-CN","allowRemoteNativeVoice":false,"service":{"providerId":"gemini","model":"gemini-2.5-flash-preview-tts","voice":"Kore"}}'::jsonb$$;
create function pg_temp.audio_write(command jsonb, request_id text, expected bigint default null) returns jsonb language sql as $$
select public.execute_course_media_for_actor_v1(pg_temp.audio_owner(),pg_temp.audio_course(),coalesce(expected,pg_temp.audio_revision()),command,request_id)$$;
create function pg_temp.audio_prepare(letter text,request_id text,size bigint default 524,expected bigint default null) returns jsonb language sql as $$
select public.prepare_course_audio_for_actor_v1(pg_temp.audio_owner(),pg_temp.audio_course(),coalesce(expected,pg_temp.audio_revision()),repeat(letter,64),size,'audio/wav','audio-sintetico.wav',request_id)$$;
create function pg_temp.audio_ingest(letter text) returns jsonb language sql as $$
select jsonb_build_object('type','ingest_audio','media',jsonb_build_object('contentHash',repeat(letter,64),'byteSize',524,'mediaType','audio/wav'),'fileName','audio-sintetico.wav')$$;
create function pg_temp.audio_download(actor uuid,unit_id text,letter text) returns jsonb language sql as $$
select public.get_course_media_download_for_actor_v1(actor,pg_temp.audio_course(),pg_temp.audio_revision(),unit_id,repeat(letter,64))$$;
create function pg_temp.audio_storage(letter text,size bigint default 524) returns void language sql as $$
insert into storage.objects(bucket_id,name,metadata) values('course-media',pg_temp.audio_course()::text||'/'||repeat(letter,64)||'.wav',jsonb_build_object('size',size,'mimetype','audio/wav'))$$;

select is((select audio_config->>'allowRemoteNativeVoice' from public.courses where id=pg_temp.audio_course()),'false','configuração inicial não autoriza voz remota');
select ok((select public is false from storage.buckets where id='course-media'),'bucket de áudio permanece privado');
select ok(not private.valid_course_audio_config_v1(pg_temp.audio_config()||'{"apiKey":"synthetic-forbidden"}'),'configuração não aceita credencial');
select ok(not private.valid_course_audio_config_v1(jsonb_set(pg_temp.audio_config(),'{rate}','2.01')),'velocidade acima do contrato é recusada');
select is(pg_temp.audio_write(jsonb_build_object('type','set_audio_config','config',pg_temp.audio_config()),'audio303-config01',1)->>'courseRevision','2','salvar configuração faz um CAS e avança uma revisão');
select is(pg_temp.audio_write(jsonb_build_object('type','set_audio_config','config',pg_temp.audio_config()),'audio303-config01',1)->>'idempotent','true','resposta perdida recupera o recibo original antes do CAS');
select is(pg_temp.audio_write(jsonb_build_object('type','set_audio_config','config',pg_temp.audio_config()),'audio303-config02')->>'changed','false','mesma configuração com outro pedido é no-op');
select throws_ok($$select pg_temp.audio_write(jsonb_build_object('type','set_audio_config','config',pg_temp.audio_config()),'audio303-stale01',1)$$,'40001',null,'CAS antigo não aplica nova configuração');
select throws_ok($$select pg_temp.audio_write(jsonb_build_object('type','set_audio_config','config',jsonb_set(pg_temp.audio_config(),'{rate}','1')),'audio303-config01',1)$$,'23514',null,'mesmo requestId não aceita outro conteúdo');
select throws_ok($$select public.execute_course_media_for_actor_v1('30300000-0000-4000-8000-000000000002',pg_temp.audio_course(),pg_temp.audio_revision(),jsonb_build_object('type','set_audio_config','config',pg_temp.audio_config()),'audio303-student')$$,'42501',null,'estudante não altera configuração');
select throws_ok($$select pg_temp.audio_write(pg_temp.audio_ingest('a'),'audio303-unprepared')$$,'23514',null,'finalizar sem preparação não cria mídia');
select throws_ok($$select pg_temp.audio_storage('a')$$,'42501',null,'Storage não recebe objeto sem intenção vigente');

select is(pg_temp.audio_prepare('a','audio303-upload01')->>'uploadRequired','true','preparação reserva identidade e anuncia upload necessário');
select is(pg_temp.audio_prepare('a','audio303-upload01')->>'uploadRequired','true','preparação repetida mantém a mesma reserva');
select is(private.course_source_pdf_reserved_bytes_v1(pg_temp.audio_course()),524::bigint,'reserva repetida é contabilizada uma vez');
select throws_ok($$select pg_temp.audio_write(pg_temp.audio_ingest('a'),'audio303-upload01')$$,'23514',null,'finalizar antes de confirmar Storage falha');
select lives_ok($$select pg_temp.audio_storage('a')$$,'Storage admite metadata sintética da preparação');
select is(private.course_source_pdf_reserved_bytes_v1(pg_temp.audio_course()),524::bigint,'objeto e intenção do mesmo hash não duplicam cota');
select throws_ok($$update storage.objects set metadata='{"size":523,"mimetype":"audio/wav"}' where bucket_id='course-media' and name=pg_temp.audio_course()::text||'/'||repeat('a',64)||'.wav'$$,'23514',null,'objeto existente não admite mutação de bytes declarados');
select is(pg_temp.audio_write(pg_temp.audio_ingest('a'),'audio303-upload01')->>'courseRevision','3','finalização confere objeto e avança a revisão');
select is(pg_temp.audio_prepare('a','audio303-upload01',524,2)#>>'{receipt,idempotent}','true','retry de upload já finalizado devolve recibo sem outro writer');
select is((select count(*) from private.course_media_upload_intents where course_id=pg_temp.audio_course()),0::bigint,'finalização consome intenção de upload');
select is(pg_temp.audio_download(pg_temp.audio_owner(),null,'a')#>>'{media,byteSize}','524','owner pode ouvir mídia ainda sem vínculo de unidade');
select throws_ok($$select pg_temp.audio_download('30300000-0000-4000-8000-000000000002','u','a')$$,'42501',null,'compartilhado não recebe arquivo órfão');
select throws_ok($$select pg_temp.audio_download('30300000-0000-4000-8000-000000000003','u','a')$$,'PT404',null,'estranho não lê curso privado');
select throws_ok($$select pg_temp.audio_download(null,'u','a')$$,'PT404',null,'visitante não lê curso privado');

insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
(pg_temp.audio_course(),'module','m',null,null,0,'{"title":"Módulo"}'),
(pg_temp.audio_course(),'lesson','l','module','m',0,'{"title":"Lição"}'),
(pg_temp.audio_course(),'microsequence','s','lesson','l',0,'{"title":"Sequência","dependsOn":[]}'),
(pg_temp.audio_course(),'study_unit','u','microsequence','s',1,jsonb_build_object('title','Escuta sintética','role','theory','content',jsonb_build_array(
 jsonb_build_object('id','audio','package','aralearn.resource.audio','version','1.0.0','data',jsonb_build_object('tracks',jsonb_build_array(
 jsonb_build_object('id','track','label','Sinal sintético','locale','pt-BR','kind','file','media',pg_temp.audio_ingest('a')->'media','alternative',jsonb_build_object('text','Sinal sintético','visibility','always')))))),'response',null,'feedback','[]'::jsonb,'topics','[]'::jsonb));
select is(pg_temp.audio_download('30300000-0000-4000-8000-000000000002','u','a')#>>'{media,contentHash}',repeat('a',64),'compartilhado recebe o trio da unidade autorizada');
select throws_ok($$select pg_temp.audio_download('30300000-0000-4000-8000-000000000002',null,'a')$$,'42501',null,'compartilhado não utiliza audition genérica de owner');
select throws_ok($$select public.get_course_media_for_actor_v1('30300000-0000-4000-8000-000000000002',pg_temp.audio_course(),pg_temp.audio_revision(),'catalog')$$,'42501',null,'compartilhado não enumera biblioteca');
select is(public.get_course_media_for_actor_v1('30300000-0000-4000-8000-000000000002',pg_temp.audio_course(),pg_temp.audio_revision(),'configuration')->'audioConfig',pg_temp.audio_config(),'configuração necessária à reprodução é projetada ao compartilhado');
update public.courses set visibility='public',public_file_access='restricted' where id=pg_temp.audio_course();
select throws_ok($$select pg_temp.audio_download(null,'u','a')$$,'42501',null,'curso público restrito não libera bytes por vínculo sozinho');
update public.courses set public_file_access='available' where id=pg_temp.audio_course();
select is(pg_temp.audio_download(null,'u','a')#>>'{media,contentHash}',repeat('a',64),'público explicitamente disponível recebe somente trio vinculado');
select throws_ok($$select pg_temp.audio_download(null,'missing','a')$$,'42501',null,'público não troca a identidade da unidade');
select is(public.get_course_media_for_actor_v1(null,pg_temp.audio_course(),pg_temp.audio_revision(),'configuration')->'items','[]'::jsonb,'configuração pública não revela biblioteca');
select is(public.get_course_media_for_actor_v1(null,pg_temp.audio_course(),pg_temp.audio_revision(),'configuration')->'storage','null'::jsonb,'configuração pública não revela cota');
update private.course_entities set content=jsonb_set(content,'{content,0,data,tracks,0,media,byteSize}','523') where course_id=pg_temp.audio_course() and entity_id='u';
select throws_ok($$select pg_temp.audio_download(null,'u','a')$$,'42501',null,'hash igual com tamanho divergente não autoriza arquivo');
update private.course_entities set content=jsonb_set(content,'{content,0,data,tracks,0,media,byteSize}','524') where course_id=pg_temp.audio_course() and entity_id='u';
update public.courses set visibility='private',public_file_access='restricted' where id=pg_temp.audio_course();
delete from public.course_access where course_id=pg_temp.audio_course();
select throws_ok($$select pg_temp.audio_download('30300000-0000-4000-8000-000000000002','u','a')$$,'PT404',null,'revogação nega novas leituras mesmo com hash e unidade conhecidos');

select is(pg_temp.audio_write(jsonb_build_object('type','remove_media','contentHash',repeat('a',64)),'audio303-remove01')->>'changed','true','remoção retira mídia ativa e cria limpeza pendente');
select throws_ok($$select pg_temp.audio_download(pg_temp.audio_owner(),'u','a')$$,'PT404',null,'vínculo antigo preservado não torna arquivo removido legível');
select throws_ok($$select pg_temp.audio_prepare('a','audio303-reupload')$$,'40001',null,'reupload aguarda limpeza confirmada do mesmo hash');
select throws_ok($$select public.complete_course_media_delete_for_actor_v1(pg_temp.audio_owner(),pg_temp.audio_course(),repeat('a',64))$$,'40001',null,'concluir limpeza com objeto presente falha');
-- Test metadata only; production cleanup uses Storage API. This transaction
-- permits deletion solely for the synthetic object explicitly named below.
select set_config('storage.allow_delete_query','true',true);
delete from storage.objects where bucket_id='course-media' and name=pg_temp.audio_course()::text||'/'||repeat('a',64)||'.wav';
select set_config('storage.allow_delete_query','false',true);
select lives_ok($$select public.complete_course_media_delete_for_actor_v1(pg_temp.audio_owner(),pg_temp.audio_course(),repeat('a',64))$$,'limpeza física simulada confirma a retirada da intenção');
select is(pg_temp.audio_prepare('a','audio303-reupload')->>'uploadRequired','true','hash removido pode ser reenviado depois da limpeza');
select lives_ok($$select pg_temp.audio_storage('a')$$,'reupload conserva identidade lógica do arquivo');
select is(pg_temp.audio_write(pg_temp.audio_ingest('a'),'audio303-reupload')->>'changed','true','reupload reativa mídia sem duplicar registro');
select is((select count(*) from private.course_media where course_id=pg_temp.audio_course()),1::bigint,'uma mídia por hash no curso');
select lives_ok($$select pg_temp.audio_prepare('b','audio303-quota01',20971520)$$,'reserva de20MiB aceita dentro da cota');
select lives_ok($$select pg_temp.audio_prepare('c','audio303-quota02',20971520)$$,'segunda reserva usa mesma cota');
select lives_ok($$select pg_temp.audio_prepare('d','audio303-quota03',20971520)$$,'terceira reserva ainda cabe');
select throws_ok($$select pg_temp.audio_prepare('e','audio303-quota04',8388608)$$,'23514',null,'reservas concorrentes não ultrapassam64MiB');
select throws_ok($$select pg_temp.audio_prepare('e','audio303-oversize',20971521)$$,'22023',null,'arquivo individual acima20MiB não cria intenção');
insert into storage.objects(bucket_id,name,metadata) values('course-source-pdfs',pg_temp.audio_course()::text||'/'||repeat('f',64)||'.pdf','{"size":3145728,"mimetype":"application/pdf"}');
select is(private.course_source_pdf_reserved_bytes_v1(pg_temp.audio_course()),66060812::bigint,'PDF existente soma à mesma reserva de áudio, sem segunda cota');
select throws_ok($$select pg_temp.audio_prepare('e','audio303-jointquota',2097152)$$,'23514',null,'PDF mais áudio juntos impedem novo envio acima64MiB');
update private.course_media_upload_intents set expires_at=statement_timestamp()-interval '1 second' where course_id=pg_temp.audio_course() and content_hash=repeat('b',64);
select is(public.claim_course_media_delete_for_actor_v1(pg_temp.audio_owner(),pg_temp.audio_course(),repeat('b',64))->>'contentHash',repeat('b',64),'expiração transfere identidade de envio incompleto à limpeza recuperável');
select is((select count(*) from private.course_media_upload_intents where course_id=pg_temp.audio_course() and content_hash=repeat('b',64)),0::bigint,'envio expirado deixa de reservar upload após criar intenção de remoção');
select lives_ok($$select public.complete_course_media_delete_for_actor_v1(pg_temp.audio_owner(),pg_temp.audio_course(),repeat('b',64))$$,'envio sem objeto permite confirmar limpeza e tentar novamente');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.course_media'::regclass),'mídia privada mantém RLS forçada');
select ok(not has_table_privilege('authenticated','private.course_media','SELECT'),'authenticated não tem SELECT de tabela privada');
select ok(not has_table_privilege('anon','private.course_media','SELECT'),'anon não tem SELECT de tabela privada');
select ok(not has_function_privilege('authenticated','public.get_course_media_download_for_actor_v1(uuid,uuid,bigint,text,text)','EXECUTE'),'authenticated não pode forjar ator em RPC de serviço');
select ok(not has_function_privilege('anon','public.prepare_course_audio_for_actor_v1(uuid,uuid,bigint,text,bigint,text,text,text)','EXECUTE'),'anon não prepara Storage');
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values('30300000-0000-4000-8000-000000000901',pg_temp.audio_owner(),now(),now(),now()+interval '1 hour');
select set_config('request.jwt.claim.sub',pg_temp.audio_owner()::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"30300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"30300000-0000-4000-8000-000000000901"}',true);
select ok(private.current_auth_session_is_active_v1(),'negações Storage seguintes usam sessão própria realmente ativa');
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id='course-media'),0::bigint,'sessão owner ativa não enumera Storage de áudio diretamente');
select throws_ok($$select * from private.course_media$$,'42501',null,'consulta direta authenticated à tabela privada é negada');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values('course-media','30300000-0000-4000-8000-000000000101/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.wav','{"size":20971520,"mimetype":"audio/wav"}')$$,'42501',null,'RLS Storage nega upload direto mesmo com reserva conhecida');
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from storage.objects where bucket_id='course-media'),0::bigint,'visitante não enumera metadata Storage de áudio');
select throws_ok($$select * from private.course_media$$,'42501',null,'consulta direta anon à tabela privada é negada');
reset role;
select finish();
rollback;
