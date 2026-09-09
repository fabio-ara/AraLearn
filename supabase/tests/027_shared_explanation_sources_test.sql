begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','99270000-0000-4000-8000-000000000001','authenticated','authenticated','explanation-sources@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal,visibility)
values('99270000-0000-4000-8000-000000000101','99270000-0000-4000-8000-000000000001','Curso sintético de fontes da Explicação','Conservar apoio e suas referências.','public');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('99270000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('99270000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('99270000-0000-4000-8000-000000000101','microsequence','s','lesson','l',0,'{"title":"Sequência","dependsOn":[],"explanationPlan":{"purpose":"Relacionar quadro e interface.","prerequisites":[],"relations":[],"sourceIds":[]},"explanation":{"title":"Quadro e interface","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Um quadro transporta dados entre interfaces."}}]}}'),
('99270000-0000-4000-8000-000000000101','microsequence','other','lesson','l',1,'{"title":"Outra sequência","dependsOn":[]}'),
('99270000-0000-4000-8000-000000000101','study_unit','u','microsequence','s',1,'{"title":"Unidade","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Compare as interfaces."}}],"response":null,"feedback":[],"topics":[]}');
create function pg_temp.write_342_sources(command jsonb,request_id text) returns jsonb language sql as $f$
 select public.execute_course_source_command_for_actor_v1('99270000-0000-4000-8000-000000000001','99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),command,'application',request_id)
$f$;
select lives_ok($q$select pg_temp.write_342_sources('{"type":"save_source","sourceId":"source","expectedSourceRevision":0,"source":{"kind":"standard","defaultRoles":["technical_conceptual"],"title":"Fonte sintética","authors":[],"publicationDate":null,"identifier":null,"language":"pt-BR","citationMode":"manual","citationText":"Referência sintética.","url":null,"editionOrVersion":null,"bibliographic":{"editors":[],"containerTitle":null,"publisher":null,"publisherPlace":null,"volume":null,"issue":null,"pages":null,"articleNumber":null,"doi":null,"isbn":null,"issn":null,"accessedDate":null,"genre":null,"number":null},"origin":"author_provided","availability":"unknown","verificationStatus":"unverified","studyVisibility":"citation"}}','source-342-save-01')$q$,'Fonte sintética usa o catálogo existente');
create function pg_temp.links_342() returns jsonb language sql as $f$
 select '[{"linkId":"link","sourceId":"source","relation":"supported_by","roles":["technical_conceptual"],"anchors":[],"occurrences":[{"occurrenceId":"occ","slot":"content","resourceId":"p","path":"text","quote":"Um quadro","prefix":null,"suffix":" transporta"}]}]'::jsonb
$f$;
select is(pg_temp.write_342_sources(jsonb_build_object('type','set_target_sources','targetKind','microsequence_explanation','targetId','s','expectedTargetVersion',
 (select version from private.course_entities where course_id='99270000-0000-4000-8000-000000000101' and entity_type='microsequence' and entity_id='s'),
 'sourceLinks',pg_temp.links_342()),'source-342-link-01')->>'changed','true','Atribuição pertence à microssequência uma única vez');
select is((select count(*) from private.course_source_attributions where course_id='99270000-0000-4000-8000-000000000101' and target_kind='study_unit'),0::bigint,'O vínculo do apoio não foi copiado à unidade');
select is(private.course_source_links_v1('99270000-0000-4000-8000-000000000101',(select id from private.course_effective_source_attribution_v1('99270000-0000-4000-8000-000000000101','microsequence_explanation','s'))),pg_temp.links_342(),'Ocorrência e papéis preservados na leitura efetiva');
select throws_ok($q$select pg_temp.write_342_sources(jsonb_build_object('type','set_target_sources','targetKind','microsequence_explanation','targetId','s','expectedTargetVersion',
 (select version from private.course_entities where course_id='99270000-0000-4000-8000-000000000101' and entity_type='microsequence' and entity_id='s'),
 'sourceLinks',jsonb_set(pg_temp.links_342(),'{0,occurrences,0,slot}','"feedback"')),'source-342-invalid-slot')$q$,'22023','A ocorrência da Explicação exige o slot content.','Apoio rejeita ocorrência em feedback');
select set_config('request.jwt.claim.sub','99270000-0000-4000-8000-000000000001',true);
create temporary table explanation_citations_342 as select public.get_course_explanation_citations_v1('99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'s') value;
select is((select value->>'targetKind' from explanation_citations_342),'microsequence_explanation','Envelope discrimina a superfície de apoio');
select is((select value->>'targetId' from explanation_citations_342),'s','Identidade da microssequência preservada');
select ok((select not value?'studyUnitId' and value::text not like '%storagePath%' and value::text not like '%approvedBy%' from explanation_citations_342),'Citações não fingem unidade nem expõem metadados privados');
select is((select jsonb_array_length(value->'citations') from explanation_citations_342),1,'Proprietário inspeciona fonte do rascunho');
select set_config('request.jwt.claim.sub','',true);
select lives_ok($q$select public.get_course_explanation_citations_v1('99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'s')$q$,'Leitor recebe referências da base completa salva ainda não revisada');
select lives_ok($q$select public.get_course_study_citations_v1('99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'u')$q$,'Unidade salva obedece à política padrão de acesso independente');
select public.set_course_content_review_policy_for_actor_v1('99270000-0000-4000-8000-000000000001','99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'reviewed_only','source-342-policy-reviewed');
select throws_ok($q$select public.get_course_explanation_citations_v1('99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'s')$q$,'42501','Explicação indisponível ou aguardando revisão da autoria.','Política somente revisado expressa restringe base pendente');
select throws_ok($q$select public.get_course_study_citations_v1('99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'u')$q$,'42501','Conteúdo aguardando revisão da autoria.','Política expressa também restringe unidade pendente');
create function pg_temp.review_342(request text) returns jsonb language sql as $$
 select public.set_course_content_review_for_actor_v1('99270000-0000-4000-8000-000000000001','99270000-0000-4000-8000-000000000101',
 'microsequence_explanation','s',private.course_content_basis_hash_v1('99270000-0000-4000-8000-000000000101','microsequence_explanation','s'),true,request)$$;
select is(pg_temp.review_342('source-342-reviewed')#>>'{contentReview,state}','current','Declaração expressa registra revisão da base com suas fontes');
select is(private.course_content_review_v1('99270000-0000-4000-8000-000000000101','study_unit','u')->>'state','draft','Revisão da base não declara inspeção da unidade');
select lives_ok($q$select public.get_course_explanation_citations_v1('99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'s')$q$,'Base revisada conserva leitura conforme política explícita');
update private.course_sources set title='Fonte sintética alterada' where course_id='99270000-0000-4000-8000-000000000101' and source_id='source';
select is(private.course_content_review_v1('99270000-0000-4000-8000-000000000101','microsequence_explanation','s')->>'state','stale','Alteração de fonte usada desatualiza a revisão da base pertinente');
select is(private.course_content_review_v1('99270000-0000-4000-8000-000000000101','microsequence_explanation','other')->>'state','draft','Outra base sem dependência conserva seu estado');
-- Metadados sintéticos comprovam autorização SQL, não upload/decodificação de bytes.
insert into private.course_source_attachments(course_id,source_id,source_revision,content_hash,byte_size,media_type,storage_path)
values('99270000-0000-4000-8000-000000000101','source',1,repeat('a',64),64,'application/pdf','99270000-0000-4000-8000-000000000101/'||repeat('a',64)||'.pdf');
update public.courses set public_file_access='available' where id='99270000-0000-4000-8000-000000000101';
select ok(not private.can_read_course_file_v1('99270000-0000-4000-8000-000000000101',null,'source',repeat('a',64)),'Política pública não revela PDF vinculado somente a rascunho');
select ok(private.can_read_course_file_v1('99270000-0000-4000-8000-000000000101','99270000-0000-4000-8000-000000000001','source',repeat('a',64)),'Proprietário inspeciona PDF do rascunho');
insert into private.course_media(course_id,content_hash,byte_size,media_type,file_name,storage_path)
values('99270000-0000-4000-8000-000000000101',repeat('b',64),524,'audio/wav','audio-sintetico.wav','99270000-0000-4000-8000-000000000101/'||repeat('b',64)||'.wav');
update private.course_entities set content=jsonb_set(content,'{explanation,content}',(content#>'{explanation,content}')||jsonb_build_array(
 jsonb_build_object('id','audio','package','aralearn.resource.audio','version','1.0.0','data',jsonb_build_object('tracks',jsonb_build_array(
 jsonb_build_object('id','track','label','Sinal sintético','locale','pt-BR','kind','file','media',jsonb_build_object('contentHash',repeat('b',64),'byteSize',524,'mediaType','audio/wav'),
 'alternative',jsonb_build_object('text','Sinal sintético','visibility','always')))))))
where course_id='99270000-0000-4000-8000-000000000101' and entity_type='microsequence' and entity_id='s';
select is(public.get_course_explanation_media_download_for_actor_v1('99270000-0000-4000-8000-000000000001','99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'s',repeat('b',64))->>'targetKind','microsequence_explanation','Download autoral de áudio conserva identidade do apoio');
select throws_ok($q$select public.get_course_explanation_media_download_for_actor_v1(null,'99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'s',repeat('b',64))$q$,'42501','O áudio não está disponível neste conteúdo.','Áudio de apoio pendente não é entregue ao público');
select is(pg_temp.review_342('source-342-reviewed-media')#>>'{contentReview,state}','current','Declaração expressa inspeciona base com fonte e áudio atuais');
select ok(private.can_read_course_file_v1('99270000-0000-4000-8000-000000000101',null,'source',repeat('a',64)),'PDF elegível continua sujeito à política pública vigente');
select is(public.get_course_explanation_media_download_for_actor_v1(null,'99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'s',repeat('b',64))#>>'{media,contentHash}',repeat('b',64),'Áudio é localizado na Explicação da microssequência elegível');
select throws_ok($q$select public.get_course_explanation_media_download_for_actor_v1(null,'99270000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99270000-0000-4000-8000-000000000101'),'other',repeat('b',64))$q$,'42501','O áudio não está disponível neste conteúdo.','Outra microssequência não herda o áudio');
update private.course_source_attachments set public_file_access='restricted',version=version+1,updated_at=clock_timestamp() where course_id='99270000-0000-4000-8000-000000000101' and content_hash=repeat('a',64);
select ok(not private.can_read_course_file_v1('99270000-0000-4000-8000-000000000101',null,'source',repeat('a',64)),'Restrição de arquivo prevalece mesmo para recorte elegível');
update private.course_media set status='removed' where course_id='99270000-0000-4000-8000-000000000101' and content_hash=repeat('b',64);
select is(private.course_content_review_v1('99270000-0000-4000-8000-000000000101','microsequence_explanation','s')->>'state','stale','Retirar áudio usado desatualiza a base que o utiliza');
select * from finish();
rollback;
