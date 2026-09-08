begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
set constraints all deferred;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','99280000-0000-4000-8000-000000000001','authenticated','authenticated','review-synthetic@example.test','',now(),'{}','{}',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values('99280000-0000-4000-8000-000000000011','99280000-0000-4000-8000-000000000001',now(),now());
insert into public.courses(id,owner_id,title,goal,visibility)
values('99280000-0000-4000-8000-000000000101','99280000-0000-4000-8000-000000000001','Revisão sintética','Provar identidade da decisão.','public');
insert into private.course_instructional_plans(course_id) values('99280000-0000-4000-8000-000000000101');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('99280000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('99280000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('99280000-0000-4000-8000-000000000101','microsequence','a','lesson','l',0,'{"title":"Relações","goal":"Explicar conexões","dependsOn":[],"explanationPlan":{"purpose":"Desenvolver conexões.","prerequisites":[],"relations":[],"sourceIds":[]},"explanation":{"title":"Conectar elementos","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma conexão permite interação entre elementos. Quando ela é retirada, essa interação deixa de ocorrer; mudar apenas a cor dos elementos não retira a conexão."}}]}}'),
('99280000-0000-4000-8000-000000000101','microsequence','b','lesson','l',1,'{"title":"Independente","dependsOn":[]}'),
('99280000-0000-4000-8000-000000000101','microsequence','c','lesson','l',2,'{"title":"Dependente","dependsOn":["a"]}'),
('99280000-0000-4000-8000-000000000101','study_unit','u1','microsequence','a',1,'{"title":"Observe a conexão","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"A ligação permite que os elementos interajam."}}],"response":null,"feedback":[],"topics":[]}'),
('99280000-0000-4000-8000-000000000101','study_unit','u2','microsequence','a',2,'{"title":"Compare situações","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Compare retirar a ligação e mudar a cor. Qual mudança impede a interação?"}}],"response":null,"feedback":[],"topics":[]}');
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
select '99280000-0000-4000-8000-000000000201',course_id,id,'instructional_analysis_unit',0,'Conexão','Relação entre elementos.' from private.course_instructional_plans where course_id='99280000-0000-4000-8000-000000000101';
insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind)
values('99280000-0000-4000-8000-000000000101','b','99280000-0000-4000-8000-000000000201','instructional_analysis_unit');
create function pg_temp.source_302() returns jsonb language sql as $f$
 select '{"kind":"internal_document","defaultRoles":["curricular_scope"],"title":null,"authors":[{"literal":"Equipe sintética; autoria preservada"}],"publicationDate":"2026-09","identifier":"Identificador humano","language":"pt-BR","citationMode":"generated","citationText":"  Referência manual preservada.\n","url":null,"editionOrVersion":null,"bibliographic":{"editors":[],"containerTitle":null,"publisher":null,"publisherPlace":null,"volume":null,"issue":null,"pages":null,"articleNumber":null,"doi":null,"isbn":null,"issn":null,"accessedDate":null,"genre":null,"number":null},"origin":"author_provided","availability":"unknown","verificationStatus":"unverified","studyVisibility":"citation"}'::jsonb
$f$;

select public.execute_course_source_command_for_actor_v1('99280000-0000-4000-8000-000000000001','99280000-0000-4000-8000-000000000101',1,
 jsonb_build_object('type','save_source','sourceId','manual-source','expectedSourceRevision',0,'source',pg_temp.source_302()),'application','manual-source-save');
select public.execute_course_source_command_for_actor_v1('99280000-0000-4000-8000-000000000001','99280000-0000-4000-8000-000000000101',2,
 '{"type":"set_target_sources","targetKind":"microsequence_explanation","targetId":"a","expectedTargetVersion":1,"sourceLinks":[{"linkId":"manual-link","sourceId":"manual-source","relation":"supported_by","roles":["technical_conceptual"],"anchors":[],"occurrences":[]}]}','application','manual-source-link');
select set_config('request.jwt.claims','{"sub":"99280000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99280000-0000-4000-8000-000000000011"}',true);
select set_config('request.jwt.claim.sub','99280000-0000-4000-8000-000000000001',true);
select public.approve_course_microsequence_content_v1('99280000-0000-4000-8000-000000000101','a',private.course_microsequence_basis_hash_v1('99280000-0000-4000-8000-000000000101','a'),'manual-review-simulated');
create temporary table manual_before as select content,content_review,version from private.course_entities
 where course_id='99280000-0000-4000-8000-000000000101' and entity_id='a';
create temporary table manual_units_before as select jsonb_agg(to_jsonb(e) order by entity_id) value from private.course_entities e
 where course_id='99280000-0000-4000-8000-000000000101' and entity_type='study_unit';
create temporary table manual_request as select
 (select revision from public.courses where id='99280000-0000-4000-8000-000000000101') revision,
 version,jsonb_build_array(jsonb_build_object('entityType','microsequence','entityId','a','parentType','lesson','parentId','l','position',0,
 'content',jsonb_set(content,'{explanation,content,0,data,text}','"Uma conexão permite interação; retirar a conexão interrompe esse caminho entre os elementos."'))) upserts,
 jsonb_build_array(jsonb_build_object('targetKind','microsequence_explanation','targetId','a','sourceLinks',
 private.course_source_links_v1('99280000-0000-4000-8000-000000000101',(private.course_effective_source_attribution_v1('99280000-0000-4000-8000-000000000101','microsequence_explanation','a')).id))) applications
 from manual_before;
create function pg_temp.manual_write(request_id text,expected_version bigint default null,upserts_override jsonb default null,
 channel text default 'application',origin text default 'manual',applications_override jsonb default null) returns jsonb language sql as $$
 select public.commit_course_composition_for_actor_v1('99280000-0000-4000-8000-000000000001','99280000-0000-4000-8000-000000000101',
 r.revision,null,coalesce(upserts_override,r.upserts),'[]',coalesce(applications_override,r.applications),channel,origin,request_id,coalesce(expected_version,r.version),null)
 from manual_request r
$$;
select throws_ok($$select pg_temp.manual_write('manual-wrong-version',99)$$,'PT409',null,'CAS de microssequência obsoleta é recusado');
select throws_ok($$select pg_temp.manual_write('manual-wrong-channel',null,null,'mcp')$$,'22023',null,'MCP não fabrica edição manual');
select throws_ok($$select pg_temp.manual_write('manual-provider',null,null,'application','provider_assistance')$$,'22023',null,'assistência API não vira edição manual de apoio');
select throws_ok($$select pg_temp.manual_write('manual-change-goal',null,(select jsonb_set(upserts,'{0,content,goal}','"Mudança fora do apoio"') from manual_request))$$,'22023',null,'editor focal não muda objetivo ou plano');
select throws_ok($$select pg_temp.manual_write('manual-lose-links',null,null,'application','manual',(select jsonb_set(applications,'{0,sourceLinks}','[]') from manual_request))$$,'22023',null,'editor focal não apaga vínculos atuais');
create temporary table manual_result as select pg_temp.manual_write('manual-write-once') value;
select is((select value->>'applicationOrigin' from manual_result),'manual','recibo confirma ato manual');
select is((select value->>'changeOrigin' from manual_result),'human','origem humana pertence ao ato confirmado');
select is((select value->>'microsequenceId' from manual_result),'a','recibo identifica microssequência exata');
select is((select (value->>'microsequenceVersion')::bigint from manual_result),(select version+1 from manual_before),'versão do apoio avança uma vez');
select is((select (value->>'revision')::bigint from manual_result),(select revision+1 from manual_request),'revisão do curso avança uma vez');
select is((select content-'explanation' from private.course_entities where course_id='99280000-0000-4000-8000-000000000101' and entity_id='a'),(select content-'explanation' from manual_before),'objetivo/plano/dependências preservados');
select is((select jsonb_agg(to_jsonb(e) order by entity_id) from private.course_entities e where course_id='99280000-0000-4000-8000-000000000101' and entity_type='study_unit'),(select value from manual_units_before),'unidades preservadas integralmente');
select is(private.course_source_links_v1('99280000-0000-4000-8000-000000000101',(private.course_effective_source_attribution_v1('99280000-0000-4000-8000-000000000101','microsequence_explanation','a')).id),(select applications#>'{0,sourceLinks}' from manual_request),'fontes atuais continuam resolvidas na nova versão');
select is(private.course_microsequence_review_v1('99280000-0000-4000-8000-000000000101','a')->>'state','stale','alteração material torna aprovação anterior não atual');
select is((select content_review from private.course_entities where course_id='99280000-0000-4000-8000-000000000101' and entity_id='a'),(select content_review from manual_before),'decisão histórica de aprovação é preservada');
select ok((select created_origin is null and last_revision_origin is null from private.course_entities where course_id='99280000-0000-4000-8000-000000000101' and entity_id='a'),'ato não atribui autoria humana à microssequência inteira');
select is(pg_temp.manual_write('manual-write-once')->>'idempotent','true','resposta perdida recupera recibo sem nova identidade');
select is((select revision from public.courses where id='99280000-0000-4000-8000-000000000101'),(select revision+1 from manual_request),'replay não altera curso');
select throws_ok($$select pg_temp.manual_write('manual-write-once',99)$$,'23514',null,'replay não aceita versão de inspeção trocada');
select throws_ok($$select pg_temp.manual_write('manual-write-once',null,(select jsonb_set(upserts,'{0,content,explanation,title}','"Outro título"') from manual_request))$$,'23514',null,'replay não aceita payload diferente');
select ok(not has_function_privilege('authenticated','public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text,bigint,jsonb)','execute'),'escrita com ator explícito permanece restrita ao serviço');
select * from finish();
rollback;
