begin;

select plan(15);
select set_config('request.jwt.claim.role','service_role',true);

insert into auth.users(id,email)
values('a1000000-0000-4000-8000-000000000001','pdf-lifecycle@example.invalid');

insert into public.courses(id,owner_id,title,goal,revision)
values(
  'a2000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  'Reanexo PDF descartável','Provar lifecycle',5
);

insert into private.course_source_revisions(
  course_id,source_id,revision,status,kind,title,origin,availability,
  verification_status,study_visibility,actor_id
) values
  ('a2000000-0000-4000-8000-000000000002','source-pdf',1,'active',
   'document','Fonte PDF','author_provided','private','author_verified','hidden',
   'a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002','source-pdf',2,'active',
   'document','Fonte PDF revisada','author_provided','private','author_verified','hidden',
   'a1000000-0000-4000-8000-000000000001');

insert into private.course_source_attachments(
  course_id,source_id,source_revision,content_hash,byte_size,media_type,
  storage_path,actor_id,status,version,removed_at,removed_by,
  removed_course_revision
) values(
  'a2000000-0000-4000-8000-000000000002','source-pdf',1,repeat('a',64),
  1024,'application/pdf',
  'a3000000-0000-4000-8000-000000000003/'||repeat('a',64)||'.pdf',
  'a1000000-0000-4000-8000-000000000001','removed',2,now(),
  'a1000000-0000-4000-8000-000000000001',4
);

create temporary table pdf_preparation as
select public.prepare_course_source_pdf_ingestion_for_actor_v1(
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',5,
  jsonb_build_object(
    'mode','existing','sourceId','source-pdf','sourceRevision',2
  ),repeat('a',64),1024,'application/pdf','request-pdf-reupload-1'
) value;

select is(
  value#>>'{attachment,storagePath}',
  'a3000000-0000-4000-8000-000000000003/'||repeat('a',64)||'.pdf',
  'o preparo conserva o storage_path herdado'
) from pdf_preparation;

select is(
  (value->>'uploadRequired')::boolean,true,
  'o preparo pede novo upload depois da exclusão física'
) from pdf_preparation;

select is(
  (value->>'alreadyLinked')::boolean,true,
  'o preparo distingue o vínculo histórico dos bytes fisicamente ausentes'
) from pdf_preparation;

select is(
  (select count(*)::bigint from private.course_source_attachments
   where course_id='a2000000-0000-4000-8000-000000000002'
     and source_id='source-pdf' and source_revision=2
     and content_hash=repeat('a',64) and status='removed'),
  1::bigint,
  'a revisão corrente recebe somente uma ponte removida para a finalização'
);

select throws_ok(
  $$select public.get_course_source_attachment_access_for_actor_v1(
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',5,'download','source-pdf',1,
    repeat('a',64),null,null
  )$$,
  'PT404','Anexo nao vinculado a revisao solicitada.',
  'o tombstone não pode emitir um novo download'
);

create temporary table transitional_preparation as
select public.get_course_source_attachment_access_for_actor_v1(
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',5,'prepare_upload','source-pdf',2,
  repeat('a',64),1024,'application/pdf'
) value;

select is(
  value#>>'{attachment,storagePath}',
  'a3000000-0000-4000-8000-000000000003/'||repeat('a',64)||'.pdf',
  'o preparo transitório preserva o path histórico'
) from transitional_preparation;
select is((value->>'alreadyLinked')::boolean,false,
  'o tombstone não é projetado como vínculo ativo') from transitional_preparation;
select is((value->>'uploadRequired')::boolean,true,
  'o preparo transitório solicita novamente os bytes ausentes')
from transitional_preparation;

insert into storage.objects(id,bucket_id,name,metadata)
values(
  'a4000000-0000-4000-8000-000000000004','course-source-pdfs',
  'a3000000-0000-4000-8000-000000000003/'||repeat('a',64)||'.pdf',
  jsonb_build_object('size','1024','mimetype','application/pdf')
);

create temporary table pdf_ingestion as
select public.ingest_course_source_pdf_for_actor_v1(
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',5,
  jsonb_build_object(
    'mode','existing','sourceId','source-pdf','sourceRevision',2
  ),(select value->'attachment' from pdf_preparation),
  jsonb_build_object(
    'fileId','fixture-reupload','fileName','fonte.pdf',
    'mediaType','application/pdf'
  ),'application','request-pdf-reupload-1'
) value;

select is((value->>'stored')::boolean,true,'a ingestão confirma os bytes reenviados')
from pdf_ingestion;
select is((value->>'changed')::boolean,true,'o reanexo reativa o acesso lógico')
from pdf_ingestion;
select is(
  (select revision from public.courses
   where id='a2000000-0000-4000-8000-000000000002'),
  6::bigint,'o reanexo avança a revisão do Curso uma vez'
);
select is(
  (select count(*)::bigint from private.course_source_attachments
   where course_id='a2000000-0000-4000-8000-000000000002'
     and source_id='source-pdf' and content_hash=repeat('a',64)
     and status='active'),
  1::bigint,'existe um único vínculo ativo para o mesmo hash'
);
select is(
  (select count(*)::bigint from private.course_source_attachments
   where course_id='a2000000-0000-4000-8000-000000000002'
     and source_id='source-pdf' and source_revision=1
     and content_hash=repeat('a',64) and status='removed'),
  1::bigint,'o tombstone bibliográfico anterior sobrevive ao reanexo'
);
select is(
  private.course_source_pdf_unique_bytes_v1(
    'a2000000-0000-4000-8000-000000000002'
  ),1024::bigint,'a quota volta a contar o PDF ativo uma única vez'
);
select is(
  (select count(*)::bigint from private.course_source_pdf_upload_intents
   where request_id='request-pdf-reupload-1'),
  0::bigint,'a finalização consome a intenção de upload'
);

select * from finish();
rollback;
