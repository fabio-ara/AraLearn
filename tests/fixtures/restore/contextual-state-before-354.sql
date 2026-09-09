\set ON_ERROR_STOP on
\if :{?contextual_current_probe}
\else
\set contextual_current_probe false
\endif
begin;
set constraints all deferred;

-- Somente no contêiner descartável restaurado, depois da base de #353 e antes
-- das migrations contextuais. Identidades sintéticas exclusivas desta prova.
\if :contextual_current_probe
do $current_probe_checkpoint$
begin
  if to_regprocedure('private.course_content_complete_v1(uuid,text,text)') is null then
    raise exception 'O probe da fixture exige o contrato contextual corrente.';
  end if;
end $current_probe_checkpoint$;
\else
do $checkpoint$
begin
  if (select max(version) from supabase_migrations.schema_migrations)<>'20260908105357' then
    raise exception 'A fixture contextual exige o checkpoint anterior ao programa 354.';
  end if;
end $checkpoint$;
\endif
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('74540000-0000-4000-8000-000000000001','authenticated','authenticated','restore-context-owner@example.test',now(),'{}','{"test":"contextual-upgrade"}',now(),now()),
 ('74540000-0000-4000-8000-000000000002','authenticated','authenticated','restore-context-reader@example.test',now(),'{}','{"test":"contextual-upgrade"}',now(),now());
insert into public.courses(id,owner_id,title,goal,visibility) values
 ('74540000-0000-4000-8000-000000000101','74540000-0000-4000-8000-000000000001','Restauração contextual privada','Distinguir base, unidade, observação e revisão.','private'),
 ('74540000-0000-4000-8000-000000000102','74540000-0000-4000-8000-000000000001','Restauração contextual pública','Conservar leitura de conteúdo salvo e direitos explícitos.','public');
insert into public.course_access(course_id,user_id,granted_by)
values('74540000-0000-4000-8000-000000000101','74540000-0000-4000-8000-000000000002','74540000-0000-4000-8000-000000000001');

insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,version)
select course_id,entity_type,entity_id,parent_type,parent_id,position,content,version
from (values('74540000-0000-4000-8000-000000000101'::uuid),('74540000-0000-4000-8000-000000000102'::uuid)) c(course_id)
cross join (values
 ('module','module-context',null,null,0,'{"title":"Relações"}'::jsonb,1),
 ('lesson','lesson-context','module','module-context',0,'{"title":"Conexões"}'::jsonb,2),
 ('microsequence','micro-context','lesson','lesson-context',0,'{"title":"Base e aplicação","goal":"Relacionar elementos e explicar o efeito da conexão.","dependsOn":[],"explanationPlan":{"purpose":"Desenvolver a relação entre os elementos.","prerequisites":[],"relations":[],"sourceIds":[]},"explanation":{"title":"A conexão entre elementos","content":[{"id":"base-p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"A conexão permite interação entre elementos. Retirar a conexão interrompe essa interação; alterar a cor preserva a relação. A base salva explicita os pressupostos e sustenta a comparação dos casos."}}]}}'::jsonb,4),
 ('study_unit','unit-context-a','microsequence','micro-context',1,'{"title":"Identifique a conexão","role":"theory","content":[{"id":"unit-p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Compare dois elementos ligados e dois elementos sem ligação. Identifique a relação que permite a interação."}}],"response":null,"feedback":[],"topics":[]}'::jsonb,3),
 ('study_unit','unit-context-b','microsequence','micro-context',2,'{"title":"Explique a mudança","role":"theory","content":[{"id":"unit-p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Mantenha os elementos e retire apenas a conexão. Explique por que a interação muda e compare com a mudança de cor."}}],"response":null,"feedback":[],"topics":[]}'::jsonb,7)
) e(entity_type,entity_id,parent_type,parent_id,position,content,version);

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Fontes e atribuições passam pelos escritores completos vigentes em #353.
do $sources$
declare course_id uuid; target record; course_revision bigint;
begin
  foreach course_id in array array['74540000-0000-4000-8000-000000000101'::uuid,'74540000-0000-4000-8000-000000000102'::uuid] loop
    select revision into course_revision from public.courses where id=course_id;
    perform public.execute_course_source_command_for_actor_v1('74540000-0000-4000-8000-000000000001',course_id,course_revision,
      '{"type":"save_source","sourceId":"source-context","expectedSourceRevision":0,"source":{"kind":"document","defaultRoles":["technical_conceptual"],"title":"Referência sintética contextual","authors":[],"publicationDate":null,"identifier":null,"language":"pt-BR","citationMode":"manual","citationText":"Referência sintética. Relações e conexões.","url":null,"editionOrVersion":null,"bibliographic":{"editors":[],"containerTitle":null,"publisher":null,"publisherPlace":null,"volume":null,"issue":null,"pages":null,"articleNumber":null,"doi":null,"isbn":null,"issn":null,"accessedDate":null,"genre":null,"number":null},"origin":"author_provided","availability":"unknown","verificationStatus":"unverified","studyVisibility":"citation"}}',
      'application','restore-context-source-'||right(course_id::text,3));
    for target in select * from (values('microsequence_explanation','micro-context',4),('study_unit','unit-context-a',3)) t(kind,id,version) loop
      select revision into course_revision from public.courses where id=course_id;
      perform public.execute_course_source_command_for_actor_v1('74540000-0000-4000-8000-000000000001',course_id,course_revision,
        jsonb_build_object('type','set_target_sources','targetKind',target.kind,'targetId',target.id,'expectedTargetVersion',target.version,
          'sourceLinks','[{"linkId":"context-link","sourceId":"source-context","relation":"supported_by","roles":["technical_conceptual"],"anchors":[],"occurrences":[]}]'::jsonb),
        'application','restore-context-link-'||right(course_id::text,3)||'-'||target.id);
    end loop;
  end loop;
end $sources$;

-- Criar/revisar/considerar usa a autoridade anterior: versões, contador da
-- fila e recibos unificados são produzidos de fato pela escrita vigente.
do $observations$
declare item record; revision bigint; version_number integer; last_revision integer;
  change jsonb; annotation_version bigint;
begin
  select c.revision into revision from public.courses c where c.id='74540000-0000-4000-8000-000000000101';
  for item in select * from (values
    ('74540000-0000-4000-8000-000000000201'::uuid,'study_unit','unit-context-a',2,'open','Explicite a relação no primeiro caso.'),
    ('74540000-0000-4000-8000-000000000202'::uuid,'study_unit','unit-context-b',5,'considered','Compare a retirada da conexão com a mudança de cor.'),
    ('74540000-0000-4000-8000-000000000203'::uuid,'didactic_microsequence','micro-context',4,'open','Preserve os pressupostos da microssequência.')
  ) t(id,kind,target_id,version,state,body) loop
    change:=public.execute_course_anchored_annotation_command_for_actor_v1('74540000-0000-4000-8000-000000000001',
      '74540000-0000-4000-8000-000000000101',revision,jsonb_build_object('type','create_anchored_annotation','annotationId',item.id,
        'target',jsonb_build_object('kind',item.kind,'id',item.target_id),'rawText',item.body||' Versão 1.','category',null,'capturedAt',null,'briefSummary',null),
      'authoring_interface','restore-context-observation-'||right(item.id::text,3)||'-1');
    revision:=(change->>'courseRevision')::bigint;
    annotation_version:=(change#>>'{annotation,annotationVersion}')::bigint;
    last_revision:=item.version-case when item.state='considered' then 1 else 0 end;
    for version_number in 2..last_revision loop
      -- A revisão do curso só acompanha criação/classificação. Editar e
      -- considerar usam exclusivamente a versão da observação confirmada.
      change:=public.execute_course_anchored_annotation_command_for_actor_v1('74540000-0000-4000-8000-000000000001',
        '74540000-0000-4000-8000-000000000101',null,jsonb_build_object('type','revise_anchored_annotation','annotationId',item.id,
          'expectedAnnotationVersion',annotation_version,'rawText',item.body||' Versão '||version_number||'.','category',null,'briefSummary',null),
        'authoring_interface','restore-context-observation-'||right(item.id::text,3)||'-'||version_number);
      revision:=(change->>'courseRevision')::bigint;
      annotation_version:=(change#>>'{annotation,annotationVersion}')::bigint;
    end loop;
    if item.state='considered' then
      change:=public.execute_course_anchored_annotation_command_for_actor_v1('74540000-0000-4000-8000-000000000001',
        '74540000-0000-4000-8000-000000000101',null,jsonb_build_object('type','consider_anchored_annotation','annotationId',item.id,
          'expectedAnnotationVersion',annotation_version),'authoring_interface','restore-context-considered-'||right(item.id::text,3));
      revision:=(change->>'courseRevision')::bigint;
      annotation_version:=(change#>>'{annotation,annotationVersion}')::bigint;
    end if;
    if annotation_version is distinct from item.version then raise exception 'A versão confirmada da observação divergiu da fixture.'; end if;
  end loop;
end $observations$;

\if :contextual_current_probe
-- Verifica os escritores de preparação e os dados com o contrato atual.
-- Não simula revisão antiga nem substitui a prova de transformação #353→#354.
do $current_probe$
declare pending jsonb; page jsonb; course_revision bigint;
begin
  select jsonb_agg(jsonb_build_object('target',target_kind,'id',target_id,'state',state,'version',version) order by id)
    into pending from private.course_anchored_annotations where course_id='74540000-0000-4000-8000-000000000101';
  if pending is distinct from '[{"target":"study_unit","id":"unit-context-a","state":"open","version":2},{"target":"study_unit","id":"unit-context-b","state":"considered","version":5},{"target":"didactic_microsequence","id":"micro-context","state":"open","version":4}]'::jsonb then
    raise exception 'As pendências da fixture não foram confirmadas nas versões esperadas.';
  end if;
  if (select count(*) from private.course_change_receipts where course_id='74540000-0000-4000-8000-000000000101'
      and operation='execute_course_anchored_annotation')<>11
    or exists(select 1 from private.course_change_receipts where course_id='74540000-0000-4000-8000-000000000101'
      and operation='execute_course_anchored_annotation' and (actor_id is distinct from '74540000-0000-4000-8000-000000000001'::uuid
        or result->>'contract' is distinct from 'aralearn.course-anchored-annotation-receipt.v1' or result->'changed' is distinct from 'true'::jsonb))
    or (select jsonb_agg((result->>'annotationSetVersion')::bigint order by (result->>'annotationSetVersion')::bigint)
      from private.course_change_receipts where course_id='74540000-0000-4000-8000-000000000101'
        and operation='execute_course_anchored_annotation') is distinct from '[1,2,3,4,5,6,7,8,9,10,11]'::jsonb
    or (select annotation_set_version from public.courses where id='74540000-0000-4000-8000-000000000101') is distinct from 11::bigint then
    raise exception 'Recibos unificados ou versões de preparação ausentes.';
  end if;
  if (select count(*) from private.course_entities where course_id in('74540000-0000-4000-8000-000000000101','74540000-0000-4000-8000-000000000102')
    and entity_type in('microsequence','study_unit') and private.course_content_complete_v1(course_id,
      case when entity_type='study_unit' then 'study_unit' else 'microsequence_explanation' end,entity_id))<>6
    or (select count(*) from private.course_sources where course_id in('74540000-0000-4000-8000-000000000101','74540000-0000-4000-8000-000000000102'))<>2
    or (select count(*) from private.course_source_attributions where course_id in('74540000-0000-4000-8000-000000000101','74540000-0000-4000-8000-000000000102'))<>4 then
    raise exception 'Conteúdo completo ou fontes da fixture ausentes.';
  end if;
  select revision into course_revision from public.courses where id='74540000-0000-4000-8000-000000000101';
  page:=public.get_owned_course_anchored_annotations_for_actor_v1('74540000-0000-4000-8000-000000000001','74540000-0000-4000-8000-000000000101',
    course_revision,null,'inbox',array['author'],'{}',array['open','considered'],'{}',true,'{}',null,null,false,null,null,24);
  if jsonb_array_length(page->'items')<>3 or (page->>'hasMore')::boolean then raise exception 'Leitor autoral não confirmou a fixture.'; end if;
end $current_probe$;
select jsonb_build_object('contract','aralearn.contextual-restore-fixture-probe.v1',
  'schemaRevision',public.get_aralearn_runtime_manifest()->>'schemaRevision','completeObjects',6,'sources',2,'sourceAttributions',4,
  'pendingObservations',3,'annotationSetVersion',11,'observationReceipts',11,'historicalReviewExercised',false,'disposition','rollback');
rollback;
\else
-- Declaração exclusivamente sintética pelo RPC protegido anterior, depois
-- de salvar texto e fontes. O curso público fica completo e sem revisão.
insert into auth.sessions(id,user_id,created_at,updated_at)
values('74540000-0000-4000-8000-000000000901','74540000-0000-4000-8000-000000000001',now(),now());
select set_config('request.jwt.claim.sub','74540000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"74540000-0000-4000-8000-000000000001","role":"authenticated","session_id":"74540000-0000-4000-8000-000000000901"}',true);
select public.approve_course_microsequence_content_v1('74540000-0000-4000-8000-000000000101','micro-context',
  private.course_microsequence_basis_hash_v1('74540000-0000-4000-8000-000000000101','micro-context'),'restore-context-review-before');
commit;
\endif
