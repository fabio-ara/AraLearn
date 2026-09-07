begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

-- Somente fixtures sintéticas nesta transação. Metadata Storage não prova bytes;
-- cliente real verifica download/decoder separadamente.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','30600000-0000-4000-8000-000000000001','authenticated','authenticated','copy-owner-306@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal)
values('30600000-0000-4000-8000-000000000101','30600000-0000-4000-8000-000000000001','Curso sintético histórico','Preservar a aplicação anterior.');
insert into private.course_instructional_plans(course_id)
values('30600000-0000-4000-8000-000000000101');
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '30600000-0000-4000-8000-000000000201',course_id,id,'instructional_analysis_unit',0,'Ligação','Relação entre dois pontos.'
from private.course_instructional_plans where course_id='30600000-0000-4000-8000-000000000101';
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('30600000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('30600000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('30600000-0000-4000-8000-000000000101','microsequence','s','lesson','l',0,'{"title":"Sequência","dependsOn":[]}'),
('30600000-0000-4000-8000-000000000101','study_unit','u','microsequence','s',1,'{"title":"Unidade anterior","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma ligação une dois pontos."}}],"response":null,"feedback":[],"topics":[]}');

-- Forma histórica migrada para snapshot v2: seis parâmetros do catálogo 1.1.0,
-- motivos desconhecidos mantidos nulos e política vigente na aplicação antiga.
create temporary table historical_snapshot as select '{
 "contract":"aralearn.study-unit-design-snapshot.v2","parameterCatalogVersion":"1.1.0",
 "didacticMicrosequenceId":"s","instructionalAnalysisUnitIds":["30600000-0000-4000-8000-000000000201"],"evidenceRequirementIds":[],
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
'{"contract":"aralearn.study-unit-design-application.v1","mode":"expository","introducedInstructionalAnalysisUnitIds":["30600000-0000-4000-8000-000000000201"],"usedInstructionalAnalysisUnitIds":["30600000-0000-4000-8000-000000000201"],"curriculumScopeItemIds":[],"explanationApplications":[{"instructionalAnalysisUnitId":"30600000-0000-4000-8000-000000000201","developedForms":["plain_definition"],"notApplicable":[]}],"practiceApplications":[],"componentRefs":["aralearn.resource.paragraph@1.0.0"]}'::jsonb application;
update private.course_entities set design_snapshot=historical_snapshot.snapshot,design_application=historical_snapshot.application,
 updated_at=(historical_snapshot.snapshot->>'appliedAt')::timestamptz
from historical_snapshot where course_id='30600000-0000-4000-8000-000000000101' and entity_type='study_unit' and entity_id='u';


update private.course_instructional_plans set curriculum_map_status='approved'
where course_id='30600000-0000-4000-8000-000000000101';
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('30600000-0000-4000-8000-000000000101','microsequence','t','lesson','l',1,'{"title":"Segundo","dependsOn":[]}'),
('30600000-0000-4000-8000-000000000101','microsequence','r','lesson','l',2,'{"title":"Terceiro","dependsOn":[]}'),
('30600000-0000-4000-8000-000000000101','microsequence','z','lesson','l',3,'{"title":"Quarto","dependsOn":[]}');
insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,progression)
select '30600000-0000-4000-8000-000000000301',course_id,id,0,'Inicial','Intenção inicial.','["Passo inicial."]'::jsonb
from private.course_instructional_plans where course_id='30600000-0000-4000-8000-000000000101';
insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,progression)
select '30600000-0000-4000-8000-000000000302',course_id,id,1,'Final','Intenção final.','["Passo final."]'::jsonb
from private.course_instructional_plans where course_id='30600000-0000-4000-8000-000000000101';
insert into private.course_authoring_part_didactic_microsequences(course_id,authoring_part_id,didactic_microsequence_id,production_position) values
('30600000-0000-4000-8000-000000000101','30600000-0000-4000-8000-000000000301','s',0),
('30600000-0000-4000-8000-000000000101','30600000-0000-4000-8000-000000000301','t',1),
('30600000-0000-4000-8000-000000000101','30600000-0000-4000-8000-000000000301','r',2),
('30600000-0000-4000-8000-000000000101','30600000-0000-4000-8000-000000000302','z',0);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','30600000-0000-4000-8000-000000000002','authenticated','authenticated','copy-recipient-306@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','30600000-0000-4000-8000-000000000003','authenticated','authenticated','copy-stranger-306@example.test','',now(),'{}','{}',now(),now());
update public.person_profiles set handle=case user_id when '30600000-0000-4000-8000-000000000001' then 'copy-owner-306'
  when '30600000-0000-4000-8000-000000000002' then 'copy-recipient-306' else 'copy-stranger-306' end
  where user_id in('30600000-0000-4000-8000-000000000001','30600000-0000-4000-8000-000000000002','30600000-0000-4000-8000-000000000003');
create function pg_temp.copy_source() returns uuid language sql as $$select '30600000-0000-4000-8000-000000000101'::uuid$$;
create function pg_temp.copy_owner() returns uuid language sql as $$select '30600000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.copy_recipient() returns uuid language sql as $$select '30600000-0000-4000-8000-000000000002'::uuid$$;
create function pg_temp.copy_revision() returns bigint language sql as $$select revision from public.courses where id=pg_temp.copy_source()$$;
create temporary table copy_requests(name text primary key,actor uuid,request_id text,requested_at timestamptz,source_revision bigint,result jsonb);
create function pg_temp.copy_request(p_name text,p_actor uuid,p_offset interval default interval '0 seconds') returns text language plpgsql as $f$
declare v_time timestamptz:=date_trunc('milliseconds',statement_timestamp()+p_offset); v_id text;
begin
  v_id:='copy:'||(extract(epoch from v_time)*1000)::bigint::text||':'||gen_random_uuid()::text;
  insert into copy_requests values(p_name,p_actor,v_id,v_time,pg_temp.copy_revision(),null);
  return v_id;
end $f$;
create function pg_temp.run_copy(p_name text,p_title text default 'Cópia sintética') returns jsonb language plpgsql as $f$
declare v copy_requests%rowtype; r jsonb;
begin
  select * into strict v from copy_requests where name=p_name;
  r:=public.copy_course_for_actor_v1(v.actor,pg_temp.copy_source(),v.source_revision,p_title,true,v.request_id,v.requested_at);
  update copy_requests set result=r where name=p_name;
  return r;
end $f$;
create function pg_temp.copy_target(p_name text default 'recipient') returns uuid language sql as $$
select (result->>'targetCourseId')::uuid from copy_requests where name=p_name$$;

insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind)
values(pg_temp.copy_source(),'s','30600000-0000-4000-8000-000000000201','instructional_analysis_unit');
insert into private.course_design_parameter_assignments(course_id,parameter_id,scope_kind,scope_ref,value,origin,reason,mode)
values(pg_temp.copy_source(),'study_unit_content_word_target','course',pg_temp.copy_source()::text,'420','author','Escolha sintética explícita.','fixed');
insert into private.course_authoring_guidance_assignments(course_id,scope_kind,scope_ref,guidance,origin,reason)
values(pg_temp.copy_source(),'course',pg_temp.copy_source()::text,'Preserve texto e leitura histórica.','author','Orientação da fixture.');
insert into public.course_personal_states(user_id,course_id,state) values(pg_temp.copy_owner(),pg_temp.copy_source(),
  '{"version":2,"progress":{"version":3,"lessons":{"l":{"cursorStudyUnitId":"u","completedStudyUnitIds":["u"]}}},"reviewMarks":{"u":"2026-09-01T00:00:00Z"}}');
insert into private.course_anchored_annotations(id,course_id,actor_id,origin,channel,target_kind,target_id,observed_path,
  observed_revision_certainty,raw_text,automatic_method,automatic_method_version,effective_method,effective_method_version)
values('30600000-0000-4000-8000-000000000701',pg_temp.copy_source(),pg_temp.copy_owner(),'imported','imported','course',pg_temp.copy_source()::text,
  jsonb_build_array(jsonb_build_object('kind','course','id',pg_temp.copy_source(),'label',null,'version',null)),'unknown','Observação pessoal sintética.',
  'imported_unclassified',1,'imported_unclassified',1);

create function pg_temp.copy_source_document() returns jsonb language sql as $f$
 select '{"kind":"internal_document","defaultRoles":["curricular_scope"],"title":null,"authors":[{"literal":"Equipe sintética; autoria preservada"}],"publicationDate":"2026-09","identifier":"Identificador humano","language":"pt-BR","citationMode":"manual","citationText":"  Referência manual preservada.\n","url":null,"editionOrVersion":null,"bibliographic":{"editors":[],"containerTitle":null,"publisher":null,"publisherPlace":null,"volume":null,"issue":null,"pages":null,"articleNumber":null,"doi":null,"isbn":null,"issn":null,"accessedDate":null,"genre":null,"number":null},"origin":"author_provided","availability":"unknown","verificationStatus":"unverified","studyVisibility":"citation"}'::jsonb
$f$;
select public.execute_course_source_command_for_actor_v1(pg_temp.copy_owner(),pg_temp.copy_source(),pg_temp.copy_revision(),
  jsonb_build_object('type','save_source','sourceId','source-306','expectedSourceRevision',0,'source',pg_temp.copy_source_document()),'application','copy-source-306-save');
insert into storage.objects(bucket_id,name,metadata) values('course-source-pdfs',pg_temp.copy_source()::text||'/'||repeat('f',64)||'.pdf','{"size":524,"mimetype":"application/pdf"}');
insert into private.course_source_attachments(course_id,source_id,source_revision,content_hash,byte_size,media_type,storage_path,public_file_access)
values(pg_temp.copy_source(),'source-306',1,repeat('f',64),524,'application/pdf',pg_temp.copy_source()::text||'/'||repeat('f',64)||'.pdf','available');
select public.execute_course_source_command_for_actor_v1(pg_temp.copy_owner(),pg_temp.copy_source(),pg_temp.copy_revision(),
  jsonb_build_object('type','save_anchor','anchorId','anchor-306','sourceId','source-306','sourceRevision',1,'expectedAnchorRevision',0,
    'selector',jsonb_build_object('kind','page_range','startPage',2,'endPage',2),'contentHash',repeat('f',64),
    'humanLocator','Seção conhecida','verificationExcerpt','Trecho privado de conferência'),'application','copy-source-306-anchor');
create function pg_temp.copy_links() returns jsonb language sql as $$
select '[{"linkId":"link-306","sourceId":"source-306","relation":"informed_by","roles":["curricular_scope","technical_conceptual"],"anchors":[{"anchorId":"anchor-306"}],"occurrences":[{"occurrenceId":"occ-306","slot":"content","resourceId":"p","path":"text","quote":"Trecho anterior não localizado.","prefix":null,"suffix":null}]}]'::jsonb$$;
select public.execute_course_source_command_for_actor_v1(pg_temp.copy_owner(),pg_temp.copy_source(),pg_temp.copy_revision(),
  jsonb_build_object('type','set_target_sources','targetKind','study_unit','targetId','u','expectedTargetVersion',1,'sourceLinks',pg_temp.copy_links()),'application','copy-source-306-unit');
select public.execute_course_source_command_for_actor_v1(pg_temp.copy_owner(),pg_temp.copy_source(),pg_temp.copy_revision(),
  jsonb_build_object('type','set_target_sources','targetKind','plan_item','targetId','30600000-0000-4000-8000-000000000201','expectedTargetVersion',1,
    'sourceLinks',jsonb_build_array(jsonb_set(pg_temp.copy_links()->0,'{occurrences}','[]'))),'application','copy-source-306-plan');
select public.prepare_course_audio_for_actor_v1(pg_temp.copy_owner(),pg_temp.copy_source(),pg_temp.copy_revision(),repeat('a',64),524,'audio/wav','Som sintético.wav','copy-audio-306-upload');
insert into storage.objects(bucket_id,name,metadata) values('course-media',pg_temp.copy_source()::text||'/'||repeat('a',64)||'.wav','{"size":524,"mimetype":"audio/wav"}');
select public.execute_course_media_for_actor_v1(pg_temp.copy_owner(),pg_temp.copy_source(),pg_temp.copy_revision(),
 '{"type":"ingest_audio","media":{"contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","byteSize":524,"mediaType":"audio/wav"},"fileName":"Som sintético.wav"}','copy-audio-306-upload');
update public.courses set visibility='public',public_file_access='available',bibliography_style='apa7',audio_config=jsonb_set(audio_config,'{rate}','1.5') where id=pg_temp.copy_source();

select is(private.can_copy_course_v1(pg_temp.copy_source(),pg_temp.copy_owner()),true,'dono pode criar cópia');
select is(private.can_copy_course_v1(pg_temp.copy_source(),null),false,'visibilidade pública não autoriza visitante a copiar');
select pg_temp.copy_request('stranger','30600000-0000-4000-8000-000000000003');
select throws_ok($$select pg_temp.run_copy('stranger')$$,'PT404',null,'conta com leitura pública não recebe permissão de cópia');
select public.manage_course_access_for_actor_v3(pg_temp.copy_owner(),pg_temp.copy_source(),'grant_access','copy-recipient-306',pg_temp.copy_recipient(),true,'copy306-access-read',false);
select pg_temp.copy_request('read-only',pg_temp.copy_recipient());
select throws_ok($$select pg_temp.run_copy('read-only')$$,'PT404',null,'concessão de leitura sozinha não permite copiar');
select is(public.manage_course_access_for_actor_v3(pg_temp.copy_owner(),pg_temp.copy_source(),'grant_access','copy-recipient-306',pg_temp.copy_recipient(),true,'copy306-access-copy',true)#>>'{person,canCopy}','true','concessão explícita usa writer de acesso existente');
select is(public.list_course_access_for_actor_v3(pg_temp.copy_owner(),pg_temp.copy_source())#>>'{people,0,canCopy}','true','lista de pessoas expõe permissão explícita');
select is(private.course_list_projection_v2(pg_temp.copy_source(),pg_temp.copy_recipient())->>'canCopy','true','lista de curso expõe permissão sem editar origem');
select is(private.get_course_for_actor_v1(pg_temp.copy_recipient(),pg_temp.copy_source(),false)->>'canEdit','false','permissão de cópia não concede edição da origem');
select pg_temp.copy_request('recipient',pg_temp.copy_recipient());
select is(pg_temp.run_copy('recipient')->>'contract','aralearn.course-copy.v1','cópia completa confirma contrato corrente');
select is((select owner_id from public.courses where id=pg_temp.copy_target()),pg_temp.copy_recipient(),'solicitante é dono da cópia autorizada por outra pessoa');
select is((select visibility||'/'||public_file_access from public.courses where id=pg_temp.copy_target()),'private/restricted','cópia nasce privada e sem autorização pública');
select is((select revision from public.courses where id=pg_temp.copy_target()),1::bigint,'cópia começa na revisão um');
select is((select bibliography_style||'/'||(audio_config->>'rate') from public.courses where id=pg_temp.copy_target()),'apa7/1.5','estilo e configuração de áudio preservados');
select is((select count(*) from public.course_access where course_id=pg_temp.copy_target()),0::bigint,'acessos de terceiros não são copiados');
select is((select count(*) from public.course_personal_states where course_id=pg_temp.copy_target()),0::bigint,'progresso e marcas pessoais existentes não são copiados');
select is((select count(*) from private.course_anchored_annotations where course_id=pg_temp.copy_target()),0::bigint,'observação pessoal existente não é copiada');
select is((select count(*) from private.course_entities where course_id=pg_temp.copy_target()),(select count(*) from private.course_entities where course_id=pg_temp.copy_source()),'toda a hierarquia local foi copiada');
select is((select jsonb_agg(to_jsonb(e)-array['course_id','design_snapshot','design_application'] order by entity_type,entity_id) from private.course_entities e where course_id=pg_temp.copy_target()),
 (select jsonb_agg(to_jsonb(e)-array['course_id','design_snapshot','design_application'] order by entity_type,entity_id) from private.course_entities e where course_id=pg_temp.copy_source()),'conteúdo, IDs locais, hierarquia, ordem e metadados de autoria são iguais');
select isnt((select id from private.course_instructional_plans where course_id=pg_temp.copy_target()),(select id from private.course_instructional_plans where course_id=pg_temp.copy_source()),'UUID global do plano é novo');
select ok(not exists(select 1 from private.course_authoring_parts d join private.course_authoring_parts s using(id) where d.course_id=pg_temp.copy_target() and s.course_id=pg_temp.copy_source()),'UUIDs globais dos lotes são novos');
select is((select count(*) from private.course_authoring_part_didactic_microsequences where course_id=pg_temp.copy_target()),4::bigint,'pertencimentos dos quatro alvos sobrevivem ao remapeamento');
select is((select statement from private.course_instructional_plan_items where course_id=pg_temp.copy_target()),'Ligação','inventário semântico literal preservado');
select is((select design_snapshot-array['instructionalAnalysisUnitIds','evidenceRequirementIds'] from private.course_entities where course_id=pg_temp.copy_target() and entity_id='u'),
 (select snapshot-array['instructionalAnalysisUnitIds','evidenceRequirementIds'] from historical_snapshot),'decisão histórica conserva valores, motivos, versão e appliedAt');
select is((select design_application->'usedInstructionalAnalysisUnitIds' from private.course_entities where course_id=pg_temp.copy_target() and entity_id='u'),
 (select jsonb_build_array(id) from private.course_instructional_plan_items where course_id=pg_temp.copy_target()),'uso aplicado aponta ao inventário da cópia e não ao UUID antigo');
select is((select scope_ref from private.course_design_parameter_assignments where course_id=pg_temp.copy_target()),pg_temp.copy_target()::text,'fixação corrente é traduzida para escopo do curso novo');
select is((select citation_text from private.course_sources where course_id=pg_temp.copy_target()),E'  Referência manual preservada.\n','citação manual mantém whitespace literal');
select is((select public_file_access from private.course_source_attachments where course_id=pg_temp.copy_target()),'inherit','exceção de publicação do arquivo não é copiada');
select is((select content_hash from private.course_source_anchors where course_id=pg_temp.copy_target()),repeat('f',64),'âncora PDF conserva hash lógico estável');
select is(private.course_source_links_v1(pg_temp.copy_target(),(select id from private.course_source_attributions where course_id=pg_temp.copy_target() and target_kind='study_unit')),pg_temp.copy_links(),'vínculos múltiplos e ocorrência pendente permanecem literais');
select is((select target_id from private.course_source_attributions where course_id=pg_temp.copy_target() and target_kind='plan_item'),
 (select id::text from private.course_instructional_plan_items where course_id=pg_temp.copy_target()),'vínculo bibliográfico do plano aponta ao UUID remapeado');
select is((select storage_path from private.course_media where course_id=pg_temp.copy_target()),pg_temp.copy_source()::text||'/'||repeat('a',64)||'.wav','áudio compartilha objeto específico autorizado');
select is((select storage_path from private.course_source_attachments where course_id=pg_temp.copy_target()),pg_temp.copy_source()::text||'/'||repeat('f',64)||'.pdf','PDF compartilha objeto específico autorizado');
select is(private.course_source_pdf_reserved_bytes_v1(pg_temp.copy_target()),1048::bigint,'cópia contabiliza PDF e áudio na cota lógica conjunta');
select is(pg_temp.run_copy('recipient')->>'idempotent','true','resposta perdida devolve destino único');
select throws_ok($$select pg_temp.run_copy('recipient','Outro título')$$,'23514',null,'mesmo pedido não admite intenção divergente');
delete from private.course_change_receipts where actor_id=pg_temp.copy_recipient() and request_id=(select request_id from copy_requests where name='recipient');
select is(pg_temp.run_copy('recipient')->>'targetCourseId',pg_temp.copy_target()::text,'proveniência recupera cópia mesmo sem recibo');
select pg_temp.copy_request('owner',pg_temp.copy_owner(),interval '4 minutes');
select is(pg_temp.run_copy('owner')->>'idempotent','false','dono também pode copiar com relógio dentro da tolerância');
select ok((select expires_at>=requested_at+interval '14 days' from private.course_change_receipts r
  join copy_requests q on q.request_id=r.request_id where q.name='owner'),'recibo cobre toda a janela original mesmo com pequeno avanço do relógio');
select is(public.maintain_course_for_actor_v1(pg_temp.copy_owner(),pg_temp.copy_target('owner'),'delete_owned_course',true,'copy306-delete-owner-target')->>'status',
  'completed','exclusão da cópia própria retém arquivos da origem e da outra cópia');
select throws_ok($$select pg_temp.run_copy('owner')$$,'PT410',null,'repetição após exclusão deliberada do alvo não cria outra cópia');
select public.manage_course_access_for_actor_v3(pg_temp.copy_owner(),pg_temp.copy_source(),'grant_access','copy-recipient-306',pg_temp.copy_recipient(),true,'copy306-access-disable',false);
select is(pg_temp.run_copy('recipient')->>'idempotent','true','revogação posterior não desfaz uma cópia confirmada');
select pg_temp.copy_request('revoked',pg_temp.copy_recipient());
select throws_ok($$select pg_temp.run_copy('revoked')$$,'PT404',null,'revogação impede nova cópia');
select pg_temp.copy_request('expired',pg_temp.copy_owner(),interval '-15 days');
select throws_ok($$select pg_temp.run_copy('expired')$$,'PT410',null,'pedido antigo sem prova não recria curso após expiração');
select pg_temp.copy_request('future',pg_temp.copy_owner(),interval '6 minutes');
select throws_ok($$select pg_temp.run_copy('future')$$,'22023',null,'relógio futuro além da tolerância é recusado');
select pg_temp.copy_request('stale',pg_temp.copy_owner());
update copy_requests set source_revision=source_revision-1 where name='stale';
select throws_ok($$select pg_temp.run_copy('stale')$$,'PT409',null,'cópia exige revisão coerente da origem');

update private.course_entities set content=jsonb_set(content,'{content,0,data,text}','"Texto independente."'),version=version+1 where course_id=pg_temp.copy_target() and entity_id='u';
select is((select content#>>'{content,0,data,text}' from private.course_entities where course_id=pg_temp.copy_source() and entity_id='u'),'Uma ligação une dois pontos.','editar destino não altera conteúdo da origem');
select is(public.maintain_course_for_actor_v1(pg_temp.copy_owner(),pg_temp.copy_source(),'delete_owned_course',true,'copy306-delete-source')->>'status','completed','origem pode ser excluída sem apagar arquivos compartilhados');
select is((select count(*) from storage.objects where name in(pg_temp.copy_source()::text||'/'||repeat('a',64)||'.wav',pg_temp.copy_source()::text||'/'||repeat('f',64)||'.pdf')),2::bigint,'bytes ainda referenciados permanecem no inventário Storage');
select is(private.current_object_orphan_classification_v1('course-media',pg_temp.copy_source()::text||'/'||repeat('a',64)||'.wav'),null::text,'prefixo de áudio sem curso não torna referência sobrevivente órfã');
select is(private.current_object_orphan_classification_v1('course-source-pdfs',pg_temp.copy_source()::text||'/'||repeat('f',64)||'.pdf'),null::text,'prefixo PDF sem curso não torna referência sobrevivente órfã');
select is(public.get_course_media_download_for_actor_v1(pg_temp.copy_recipient(),pg_temp.copy_target(),1,null,repeat('a',64))->>'storagePath',
  pg_temp.copy_source()::text||'/'||repeat('a',64)||'.wav','leitura autoriza áudio pela cópia depois de excluir origem');
select is(pg_temp.run_copy('recipient')->>'targetCourseId',pg_temp.copy_target()::text,'resposta perdida continua recuperável após exclusão da origem');
select set_config('storage.allow_delete_query','true',true);
select throws_ok($$delete from storage.objects where bucket_id='course-media' and name=pg_temp.copy_source()::text||'/'||repeat('a',64)||'.wav'$$,'23514',null,'guard de Storage impede apagar último áudio ainda referenciado');
select set_config('storage.allow_delete_query','false',true);
select is(public.maintain_course_for_actor_v1(pg_temp.copy_recipient(),pg_temp.copy_target(),'delete_owned_course',true,'copy306-delete-target')->>'status','files_pending','última cópia exige limpeza física confirmada antes da exclusão');
select lives_ok($$select public.claim_course_media_delete_for_actor_v1(pg_temp.copy_recipient(),pg_temp.copy_target(),repeat('a',64))$$,'claim de áudio usa caminho físico de origem já excluída');
select lives_ok($$select public.claim_pending_course_pdf_delete_for_actor_v1(pg_temp.copy_recipient(),pg_temp.copy_target())$$,'claim PDF cobre arquivo herdado do curso excluído');
select throws_ok($$select public.complete_course_media_delete_for_actor_v1(pg_temp.copy_recipient(),pg_temp.copy_target(),repeat('a',64))$$,'PT409',null,'SQL não finge remoção de bytes existentes');
select set_config('storage.allow_delete_query','true',true);
delete from storage.objects where name in(pg_temp.copy_source()::text||'/'||repeat('a',64)||'.wav',pg_temp.copy_source()::text||'/'||repeat('f',64)||'.pdf') and bucket_id in('course-media','course-source-pdfs');
select set_config('storage.allow_delete_query','false',true);
select public.complete_course_media_delete_for_actor_v1(pg_temp.copy_recipient(),pg_temp.copy_target(),repeat('a',64));
select public.complete_course_source_pdf_delete_for_actor_v1(pg_temp.copy_recipient(),pg_temp.copy_target(),'lifecycle:'||md5(pg_temp.copy_source()::text||'/'||repeat('f',64)||'.pdf'),pg_temp.copy_source()::text||'/'||repeat('f',64)||'.pdf');
select is(public.maintain_course_for_actor_v1(pg_temp.copy_recipient(),pg_temp.copy_target(),'delete_owned_course',true,'copy306-delete-target')->>'status','completed','limpeza confirmada permite concluir exclusão da última cópia');
select ok(not has_function_privilege('anon','public.copy_course_for_actor_v1(uuid,uuid,bigint,text,boolean,text,timestamptz)','EXECUTE'),'anon não forja ator no writer de cópia');
select ok(not has_function_privilege('authenticated','public.copy_course_for_actor_v1(uuid,uuid,bigint,text,boolean,text,timestamptz)','EXECUTE'),'authenticated não ignora o principal verificado da Edge');
select ok(not has_table_privilege('authenticated','private.course_media','SELECT'),'cópia não abre catálogo Storage privado');
set constraints all immediate;
select * from finish();
rollback;
