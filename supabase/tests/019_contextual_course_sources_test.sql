begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','99000000-0000-4000-8000-000000000001','authenticated','authenticated','sources-302@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal)
values('99000000-0000-4000-8000-000000000101','99000000-0000-4000-8000-000000000001','Curso sintético de fontes','Preservar referências e ocorrências.');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('99000000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('99000000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('99000000-0000-4000-8000-000000000101','microsequence','s','lesson','l',0,'{"title":"Sequência","dependsOn":[]}'),
('99000000-0000-4000-8000-000000000101','study_unit','u','microsequence','s',1,'{"title":"Unidade","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Texto antigo."}}],"response":null,"feedback":[],"topics":[]}');

create function pg_temp.source_302() returns jsonb language sql as $f$
 select '{"kind":"internal_document","defaultRoles":["curricular_scope"],"title":null,"authors":[{"literal":"Equipe sintética; autoria preservada"}],"publicationDate":"2026-09","identifier":"Identificador humano","language":"pt-BR","citationMode":"generated","citationText":"  Referência manual preservada.\n","url":null,"editionOrVersion":null,"bibliographic":{"editors":[],"containerTitle":null,"publisher":null,"publisherPlace":null,"volume":null,"issue":null,"pages":null,"articleNumber":null,"doi":null,"isbn":null,"issn":null,"accessedDate":null,"genre":null,"number":null},"origin":"author_provided","availability":"unknown","verificationStatus":"unverified","studyVisibility":"citation"}'::jsonb
$f$;
create function pg_temp.write_302(command jsonb,request_id text) returns jsonb language sql as $f$
 select public.execute_course_source_command_for_actor_v1('99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000101',
 (select revision from public.courses where id='99000000-0000-4000-8000-000000000101'),command,'application',request_id)
$f$;
select is(pg_temp.write_302(jsonb_build_object('type','save_source','sourceId','source-302','expectedSourceRevision',0,'source',pg_temp.source_302()),'source-302-save-01')->>'changed','true','writer aceita dados conhecidos e título ausente sem inventar');
select is((select citation_text from private.course_sources where course_id='99000000-0000-4000-8000-000000000101' and source_id='source-302'),E'  Referência manual preservada.\n','texto manual literal preservado mesmo no modo gerado');
select is((select authors from private.course_sources where course_id='99000000-0000-4000-8000-000000000101' and source_id='source-302'),'[{"literal":"Equipe sintética; autoria preservada"}]'::jsonb,'autoria literal não é dividida');
select is(pg_temp.write_302('{"type":"save_anchor","anchorId":"anchor-302","sourceId":"source-302","sourceRevision":1,"expectedAnchorRevision":0,"selector":{"kind":"page_range","startPage":2,"endPage":2},"contentHash":null,"humanLocator":"Seção conhecida","verificationExcerpt":"Trecho privado de conferência"}','source-302-anchor-01')->>'changed','true','âncora preserva localização sem escolher arquivo desconhecido');

create function pg_temp.links_302() returns jsonb language sql as $f$
 select '[{"linkId":"link-302","sourceId":"source-302","relation":"informed_by","roles":["curricular_scope","recommended_reading"],"anchors":[],"occurrences":[{"occurrenceId":"occ-302","slot":"content","resourceId":"p","path":"text","quote":"Texto antigo.","prefix":null,"suffix":null}]},{"linkId":"link-second-302","sourceId":"source-302","relation":"quoted_from","roles":["technical_conceptual"],"anchors":[{"anchorId":"anchor-302"}],"occurrences":[]}]'::jsonb
$f$;
create function pg_temp.read_links_302() returns jsonb language sql as $f$
 select private.course_source_links_v1('99000000-0000-4000-8000-000000000101',
  (select id from private.course_effective_source_attribution_v1('99000000-0000-4000-8000-000000000101','study_unit','u')))
$f$;
select is(pg_temp.write_302(jsonb_build_object('type','set_target_sources','targetKind','study_unit','targetId','u','expectedTargetVersion',1,'sourceLinks',pg_temp.links_302()),'source-302-bind-01')->>'changed','true','mesma fonte admite dois usos, papéis múltiplos e obra inteira sem âncora');
select is(pg_temp.read_links_302(),pg_temp.links_302(),'vínculos mantêm identidade e ocorrência literal');

create temporary table citation_302 as select private.course_study_citations_payload_v1('99000000-0000-4000-8000-000000000101','u',4) value;
select is((select value->>'contract' from citation_302),'aralearn.course-study-citations.v2','projeção de estudo anuncia contrato v2');
select is((select value->>'bibliographyStyle' from citation_302),'abnt-2025','estilo inicial pertence ao curso');
select is((select jsonb_array_length(value->'citations') from citation_302),2,'duas referências da mesma fonte são distintas no estudo');
select ok((select value::text not like '%Trecho privado%' and value::text not like '%verificationExcerpt%' and value::text not like '%storagePath%' from citation_302),'projeção não vaza conferência privada nem Storage path');

create function pg_temp.edit_source_unit_302(request_id text) returns jsonb language sql as $f$
 select public.commit_course_composition_for_actor_v1('99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000101',4,1,
 '[{"entityType":"study_unit","entityId":"u","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Unidade","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Texto alterado."}}],"response":null,"feedback":[],"topics":[]}}]',
 '[]','[{"studyUnitId":"u","sourceLinks":[]}]','application','manual',request_id)
$f$;
select is(pg_temp.edit_source_unit_302('source-302-edit-01')->>'revision','5','edição textual avança só uma revisão');
select is(pg_temp.read_links_302(),pg_temp.links_302(),'composição omissa preserva vínculos e quote anterior para revisão');
select is(pg_temp.edit_source_unit_302('source-302-edit-01')->>'idempotent','true','retry da edição não duplica identidade');

select is(pg_temp.write_302('{"type":"set_bibliography_style","style":"apa7"}','source-302-style-01')->>'courseRevision','6','trocar estilo usa CAS do curso');
select is(pg_temp.write_302('{"type":"set_bibliography_style","style":"apa7"}','source-302-style-02')->>'changed','false','estilo repetido não avança revisão');
select is((select citation_text from private.course_sources where course_id='99000000-0000-4000-8000-000000000101' and source_id='source-302'),E'  Referência manual preservada.\n','troca de estilo não reescreve referência manual');
select ok(not private.valid_course_source_links_shape_v2(jsonb_set(pg_temp.links_302(),'{0,occurrences,0,status}','"resolved"')),'writer recusa status de resolução fornecido');
select ok(not private.valid_course_source_document_v3(pg_temp.source_302()||'{"sourceRole":"technical_conceptual"}'::jsonb),'writer antigo não permanece como fallback');
select is(public.commit_course_composition_for_actor_v1('99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000101',6,
 '[{"entityType":"study_unit","entityId":"copy","parentType":"microsequence","parentId":"s","position":2,"content":{"title":"Cópia da unidade","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Texto alterado."}}],"response":null,"feedback":[],"topics":[]}}]',
 '[]',jsonb_build_array(jsonb_build_object('studyUnitId','copy','sourceLinks',pg_temp.links_302())),'source-302-copy-01')->>'revision','7','cópia de unidade transporta os vínculos pelo writer de composição');
select is(private.course_source_links_v1('99000000-0000-4000-8000-000000000101',(select id from private.course_effective_source_attribution_v1('99000000-0000-4000-8000-000000000101','study_unit','copy'))),pg_temp.links_302(),'cópia conserva identidades e citação sem copiar número visível');
select is(public.commit_course_composition_for_actor_v1('99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000101',7,
 '[]','[{"entityType":"study_unit","entityId":"u"}]','[]','source-302-move-01')->>'revision','8','remoção do alvo só conclui após vínculos terem destino preservado');
select throws_ok($q$select public.commit_course_composition_for_actor_v1('99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000101',8,
 '[{"entityType":"study_unit","entityId":"unrelated","parentType":"microsequence","parentId":"s","position":1,"content":{"title":"Outra unidade","content":[{"id":"other","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Outro conteúdo."}}],"response":null,"feedback":[],"topics":[]}}]',
 '[{"entityType":"study_unit","entityId":"copy"}]','[{"studyUnitId":"unrelated","sourceLinks":[]}]','source-302-lose-01')$q$,'23514','A divisão exige conservar os vínculos da unidade; revise as referências pendentes.','divisão sem destino preservado falha sem apagar referência');
select is((select revision from public.courses where id='99000000-0000-4000-8000-000000000101'),8::bigint,'divisão recusada não altera revisão');
select is(pg_temp.write_302('{"type":"retire_source","sourceId":"source-302","expectedSourceRevision":1}','source-302-retire-01')->>'changed','true','retirada marca status sem apagar a fonte');
select is((private.course_study_citations_payload_v1('99000000-0000-4000-8000-000000000101','copy',9)->'citations')#>>'{0,sourceId}','source-302','retirada conserva referência no contexto');
select is((select count(*)::integer from private.course_source_anchors where course_id='99000000-0000-4000-8000-000000000101'),1,'retirada conserva âncora');
insert into private.course_instructional_plans(course_id)
values('99000000-0000-4000-8000-000000000101') on conflict(course_id) do nothing;
insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement)
select '99000000-0000-4000-8000-000000000201',course_id,id,'curriculum_scope_item',0,'Item sintético com referência'
from private.course_instructional_plans where course_id='99000000-0000-4000-8000-000000000101';
update private.course_sources set status='active' where course_id='99000000-0000-4000-8000-000000000101' and source_id='source-302';
select is(pg_temp.write_302(jsonb_build_object('type','set_target_sources','targetKind','plan_item','targetId','99000000-0000-4000-8000-000000000201','expectedTargetVersion',1,'sourceLinks',jsonb_build_array((pg_temp.links_302()->0)||'{"occurrences":[]}'::jsonb)),'source-302-plan-link')->>'changed','true','item do plano recebe vínculo explícito pelo mesmo writer');
select throws_ok($q$delete from private.course_instructional_plan_items where id='99000000-0000-4000-8000-000000000201'$q$,'23514','O item do plano possui referências; retire os vínculos no painel Fontes antes de excluí-lo.','remoção indireta de item não apaga referência');
select is(pg_temp.write_302('{"type":"set_target_sources","targetKind":"plan_item","targetId":"99000000-0000-4000-8000-000000000201","expectedTargetVersion":1,"sourceLinks":[]}','source-302-plan-unlink')->>'changed','true','retirada explícita usa comando disponível ao aplicativo e canais');
select lives_ok($q$delete from private.course_instructional_plan_items where id='99000000-0000-4000-8000-000000000201'$q$,'item sem vínculos pode ser excluído');
select is((select count(*) from private.course_source_attributions where course_id='99000000-0000-4000-8000-000000000101' and target_kind='plan_item'),0::bigint,'exclusão autorizada não deixa atribuição órfã');
select * from finish();
rollback;
