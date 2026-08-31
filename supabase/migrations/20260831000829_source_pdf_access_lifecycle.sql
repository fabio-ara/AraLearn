-- Fonte e acesso PDF possuem ciclos de vida distintos. O vínculo permanece
-- como tombstone quando os bytes deixam de ser um acesso ativo da Fonte.
begin;

do $source_pdf_access_lifecycle_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260829205000'
     or to_regclass('private.course_source_attachments') is null
     or to_regprocedure(
       'public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'
     ) is null then
    raise exception 'A base corrente de anexos PDF não corresponde à esperada.'
      using errcode = '55000';
  end if;
end;
$source_pdf_access_lifecycle_preflight$;

drop trigger course_source_attachments_append_only_v1
on private.course_source_attachments;

alter table private.course_source_attachments
  add column status text not null default 'active',
  add column version bigint not null default 1,
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references auth.users(id) on delete set null,
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users(id) on delete set null,
  add column removed_course_revision bigint,
  add constraint course_source_attachments_lifecycle_v1 check(
    status in ('active','removed')
    and version > 0
    and updated_at >= created_at
    and (status = 'active' or (
      removed_at is not null
      and removed_course_revision is not null
      and removed_course_revision > 0
    ))
  );

-- Revisões bibliográficas antigas podiam repetir o mesmo hash. Somente o
-- vínculo mais recente começa ativo; os demais viram tombstones equivalentes.
with duplicate as(
  select attachment.ctid,
    row_number() over(
      partition by course_id,source_id,content_hash
      order by source_revision desc,created_at desc,ctid desc
    ) ordinal
  from private.course_source_attachments attachment
)
update private.course_source_attachments attachment
set status = 'removed',version = 2,updated_at = now(),removed_at = now(),
  removed_course_revision = greatest(1,course.revision)
from duplicate,public.courses course
where attachment.ctid = duplicate.ctid and duplicate.ordinal > 1
  and course.id = attachment.course_id;

create unique index course_source_attachments_active_hash_v1_idx
on private.course_source_attachments(course_id,source_id,content_hash)
where status = 'active';

create index course_source_attachments_active_object_v1_idx
on private.course_source_attachments(storage_path,course_id,source_id)
where status = 'active';

create table private.course_source_pdf_delete_intents(
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  course_id uuid not null references public.courses(id) on delete cascade,
  source_id text not null,
  content_hash text not null,
  storage_path text not null,
  state text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(actor_id,request_id),
  constraint course_source_pdf_delete_intents_value_v1 check(
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    and char_length(source_id) between 1 and 2048
    and source_id !~ '[[:cntrl:]]'
    and content_hash ~ '^[a-f0-9]{64}$'
    and storage_path
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
    and split_part(storage_path,'/',2) = content_hash || '.pdf'
    and state in ('pending','deleting')
  )
);

create index course_source_pdf_delete_intents_path_v1_idx
on private.course_source_pdf_delete_intents(storage_path,state);

alter table private.course_source_pdf_delete_intents enable row level security;
alter table private.course_source_pdf_delete_intents force row level security;
revoke all on table private.course_source_pdf_delete_intents
from public,anon,authenticated,service_role;

create function private.guard_course_source_attachment_lifecycle_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth
as $function$
begin
  if tg_op = 'DELETE' then
    if not exists(select 1 from public.courses course where course.id=old.course_id) then
      return old;
    end if;
    raise exception 'O histórico do vínculo PDF não pode ser apagado.'
      using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.updated_at,new.created_at,now());
    new.updated_by := coalesce(new.updated_by,new.actor_id);
    if new.status = 'active' then
      perform pg_advisory_xact_lock(hashtextextended(
        'course-source-pdf-object:'||new.storage_path,0
      ));
      if exists(
        select 1 from private.course_source_pdf_delete_intents intent
        where intent.storage_path=new.storage_path
      ) then
        raise exception 'A remoção física deste PDF ainda está em andamento.'
          using errcode = '40001';
      end if;
    end if;
    return new;
  end if;
  if old.actor_id is not null and new.actor_id is null
     and (to_jsonb(new)-'actor_id')=(to_jsonb(old)-'actor_id')
     and not exists(select 1 from auth.users where id=old.actor_id) then
    return new;
  end if;
  if old.updated_by is not null and new.updated_by is null
     and (to_jsonb(new)-'updated_by')=(to_jsonb(old)-'updated_by')
     and not exists(select 1 from auth.users where id=old.updated_by) then
    return new;
  end if;
  if old.removed_by is not null and new.removed_by is null
     and (to_jsonb(new)-'removed_by')=(to_jsonb(old)-'removed_by')
     and not exists(select 1 from auth.users where id=old.removed_by) then
    return new;
  end if;
  if row(new.course_id,new.source_id,new.source_revision,new.content_hash,
      new.byte_size,new.media_type,new.storage_path,new.actor_id,new.created_at)
     is distinct from row(old.course_id,old.source_id,old.source_revision,
      old.content_hash,old.byte_size,old.media_type,old.storage_path,
      old.actor_id,old.created_at)
     or new.status = old.status or new.version <> old.version+1
     or new.updated_at <= old.updated_at then
    raise exception 'A transição do vínculo PDF é inválida.' using errcode='55000';
  end if;
  if new.status = 'removed' and(
       new.removed_at is null or new.removed_by is null
       or new.removed_course_revision is null
     ) then
    raise exception 'O tombstone do PDF está incompleto.' using errcode='55000';
  end if;
  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-source-pdf-object:'||new.storage_path,0
    ));
    if exists(
      select 1 from private.course_source_pdf_delete_intents intent
      where intent.storage_path=new.storage_path
    ) then
      raise exception 'A remoção física deste PDF ainda está em andamento.'
        using errcode = '40001';
    end if;
  end if;
  return new;
end;
$function$;

create trigger course_source_attachments_lifecycle_v1
before insert or update or delete on private.course_source_attachments
for each row execute function private.guard_course_source_attachment_lifecycle_v1();

create or replace function private.course_source_pdf_unique_bytes_v1(p_course_id uuid)
returns bigint language sql stable security definer
set search_path = pg_catalog,private as $function$
  select coalesce(sum(value.byte_size),0)::bigint from(
    select attachment.content_hash,max(attachment.byte_size) byte_size
    from private.course_source_attachments attachment
    where attachment.course_id=p_course_id and attachment.status='active'
    group by attachment.content_hash
  ) value
$function$;

create or replace function private.course_source_pdf_reserved_bytes_v1(p_course_id uuid)
returns bigint language sql stable security invoker
set search_path = pg_catalog,private as $function$
  with reservation as(
    select attachment.content_hash,attachment.byte_size
    from private.course_source_attachments attachment
    where attachment.course_id=p_course_id and attachment.status='active'
    union all
    select intent.content_hash,intent.byte_size
    from private.course_source_pdf_upload_intents intent
    where intent.course_id=p_course_id and intent.expires_at>statement_timestamp()
  )
  select coalesce(sum(value.byte_size),0)::bigint from(
    select content_hash,max(byte_size) byte_size from reservation group by content_hash
  ) value
$function$;

create or replace function private.can_read_course_source_pdf_v1(p_storage_path text)
returns boolean language sql stable security definer
set search_path = pg_catalog,public,private,auth as $function$
  select coalesce((select auth.uid()) is not null and exists(
    select 1 from private.course_source_attachments attachment
    join public.courses course on course.id=attachment.course_id
    where attachment.storage_path=p_storage_path
      and attachment.status='active'
      and course.owner_id=(select auth.uid())
  ),false)
$function$;

-- Mantém a leitura bibliográfica corrente e substitui somente a projeção do
-- acesso: anexos ativos pertencem à Fonte, não à revisão que os recebeu.
alter function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) set schema private;
alter function private.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) rename to get_owned_course_sources_before_pdf_lifecycle_v1;

create function public.get_owned_course_sources_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,p_mode text,
  p_source_id text default null,p_target_kind text default null,
  p_target_id text default null,p_cursor text default null,p_limit integer default 10
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog,public,private as $function$
declare v_result jsonb; v_items jsonb;
begin
  perform private.require_service_role();
  v_result:=private.get_owned_course_sources_before_pdf_lifecycle_v1(
    p_actor_id,p_course_id,p_expected_revision,p_mode,p_source_id,
    p_target_kind,p_target_id,p_cursor,p_limit
  );
  if p_mode='source' then
    select coalesce(jsonb_agg(
      (item.value-'attachments'-'anchors')||jsonb_build_object(
        'attachments',coalesce((select jsonb_agg(jsonb_build_object(
          'contentHash',a.content_hash,'byteSize',a.byte_size,
          'mediaType',a.media_type,'storagePath',a.storage_path,
          'actorId',a.actor_id,'createdAt',a.created_at
        ) order by a.created_at,a.content_hash)
        from private.course_source_attachments a
        where a.course_id=p_course_id and a.source_id=item.value->>'sourceId'
          and a.status='active'),'[]'::jsonb),
        'anchors',coalesce((select jsonb_agg(anchor.value||jsonb_build_object(
          'needsReverification',case
            when anchor.value#>>'{selector,kind}' in ('page_range','text_quote')
              and exists(select 1
                from private.course_source_attachments active_pdf
                join private.course_source_attachments removed_pdf
                  on removed_pdf.course_id=active_pdf.course_id
                 and removed_pdf.source_id=active_pdf.source_id
                 and removed_pdf.status='removed'
                 and removed_pdf.content_hash<>active_pdf.content_hash
                where active_pdf.course_id=p_course_id
                  and active_pdf.source_id=item.value->>'sourceId'
                  and active_pdf.status='active')
            then true else false end
        ) order by anchor.ordinal)
        from jsonb_array_elements(item.value->'anchors')
          with ordinality anchor(value,ordinal)),'[]'::jsonb)
      ) order by item.ordinal
    ),'[]'::jsonb) into v_items
    from jsonb_array_elements(v_result->'items') with ordinality item(value,ordinal);
    v_result:=jsonb_set(v_result,'{items}',v_items,false);
  end if;
  v_result:=jsonb_set(v_result,'{pdfStorage}',jsonb_build_object(
    'uniqueBytes',private.course_source_pdf_unique_bytes_v1(p_course_id),
    'maxUniqueBytes',67108864
  ),true);
  return v_result;
end;
$function$;

-- O attach legado continua cuidando de vínculos inéditos. Este wrapper trata
-- o mesmo hash como identidade do acesso entre revisões bibliográficas e
-- reativa o tombstone somente depois de o objeto existir novamente.
alter function public.attach_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) set schema private;
alter function private.attach_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) rename to attach_course_source_pdf_before_lifecycle_v1;

create function public.attach_course_source_pdf_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,p_command jsonb,
  p_channel text,p_request_id text
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog,public,private,storage as $function$
declare
  v_attachment private.course_source_attachments%rowtype;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype; v_source private.course_source_revisions%rowtype;
  v_hash text; v_source_id text; v_source_revision bigint;
  v_content_hash text; v_byte_size bigint; v_media_type text;
  v_changed boolean:=false; v_result jsonb;
begin
  if jsonb_typeof(p_command) is distinct from 'object'
     or p_command->>'type' is distinct from 'attach_pdf'
     or p_command->>'contentHash' is not null then
    return private.attach_course_source_pdf_before_lifecycle_v1(
      p_actor_id,p_course_id,p_expected_revision,p_command,p_channel,p_request_id
    );
  end if;
  v_source_id:=p_command->>'sourceId';
  v_source_revision:=(p_command->>'sourceRevision')::bigint;
  v_content_hash:=p_command#>>'{attachment,contentHash}';
  v_byte_size:=(p_command#>>'{attachment,byteSize}')::bigint;
  v_media_type:=p_command#>>'{attachment,mediaType}';
  select * into v_attachment from private.course_source_attachments attachment
  where attachment.course_id=p_course_id and attachment.source_id=v_source_id
    and attachment.content_hash=v_content_hash
  order by (attachment.status='active') desc,attachment.updated_at desc,
    attachment.source_revision desc limit 1;
  if not found then
    return private.attach_course_source_pdf_before_lifecycle_v1(
      p_actor_id,p_course_id,p_expected_revision,p_command,p_channel,p_request_id
    );
  end if;
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision<1
     or p_channel not in('application','mcp')
     or p_request_id is null
     or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or v_source_id is null or v_source_revision is null
     or v_content_hash!~'^[a-f0-9]{64}$'
     or v_byte_size not between 1 and 20971520
     or v_media_type<>'application/pdf' then
    raise exception 'Comando attach_pdf inválido.' using errcode='22023';
  end if;
  if v_attachment.byte_size<>v_byte_size or v_attachment.media_type<>v_media_type then
    raise exception 'O hash já possui metadados binários incompatíveis.'
      using errcode='23514';
  end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'channel',p_channel,'command',p_command
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at>statement_timestamp();
  if found then
    if v_receipt.operation<>'execute_course_source_command'
       or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'requestId reutilizado com vínculo PDF incompatível.'
        using errcode='23514';
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses course
  where course.id=p_course_id for update;
  if v_course.revision<>p_expected_revision then
    raise exception 'O Curso mudou; releia antes de vincular o PDF.' using errcode='40001';
  end if;
  select * into v_source from private.course_source_revisions source
  where source.course_id=p_course_id and source.source_id=v_source_id
  order by source.revision desc limit 1;
  if not found or v_source.status<>'active' or v_source.revision<>v_source_revision then
    raise exception 'O PDF exige a revisão corrente e ativa da Fonte.'
      using errcode='23514';
  end if;
  if not private.valid_course_source_pdf_object_v1(
    v_attachment.storage_path,v_byte_size,v_media_type
  ) then
    raise exception 'O objeto PDF está ausente ou divergiu dos metadados.'
      using errcode='23514';
  end if;
  if v_attachment.status='removed' then
    update private.course_source_attachments attachment set
      status='active',version=attachment.version+1,
      updated_at=clock_timestamp(),updated_by=p_actor_id
    where attachment.course_id=v_attachment.course_id
      and attachment.source_id=v_attachment.source_id
      and attachment.source_revision=v_attachment.source_revision
      and attachment.content_hash=v_attachment.content_hash;
    update public.courses course set revision=course.revision+1,updated_at=now()
    where course.id=p_course_id returning * into v_course;
    insert into private.course_events(course_id,revision,operation,summary,actor_id)
    values(p_course_id,v_course.revision,'update_course_sources',jsonb_build_object(
      'activityKind','course_source_changed','channel',p_channel,
      'commandType','attach_pdf','subjectIdHash',
        private.course_source_json_hash_v1(to_jsonb(v_source_id)),
      'subjectRevision',v_source_revision,'attachmentHash',v_content_hash
    ),p_actor_id);
    v_changed:=true;
  end if;
  v_result:=jsonb_build_object(
    'contract','aralearn.course-source-change.v1','courseId',p_course_id,
    'courseRevision',v_course.revision,'requestId',p_request_id,
    'idempotent',false,'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type','attach_pdf','subjectId',v_source_id,'revision',v_source_revision
    ) else null end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(p_actor_id,p_request_id,'execute_course_source_command',p_course_id,v_hash,v_result);
  return v_result;
end;
$function$;

-- A remoção lógica é transacional; a intenção é consumida pelo adapter via
-- Storage API depois do commit. O hash e a revisão vieram da leitura da Fonte.
create function public.remove_course_source_pdf_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,p_command jsonb,
  p_channel text,p_request_id text
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog,public,private as $function$
declare
  v_hash text; v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype; v_source private.course_source_revisions%rowtype;
  v_attachment private.course_source_attachments%rowtype;
  v_source_id text; v_source_revision bigint; v_content_hash text;
  v_changed boolean:=false; v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision<1
     or p_channel not in('application','mcp')
     or p_request_id is null
     or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or p_command-'type'-'sourceId'-'expectedSourceRevision'-'contentHash'<>'{}'::jsonb
     or not(p_command?&array['type','sourceId','expectedSourceRevision','contentHash'])
     or p_command->>'type'<>'remove_pdf'
     or jsonb_typeof(p_command->'sourceId')<>'string'
     or jsonb_typeof(p_command->'expectedSourceRevision')<>'number'
     or p_command->>'expectedSourceRevision'!~'^[1-9][0-9]*$'
     or p_command->>'contentHash'!~'^[a-f0-9]{64}$' then
    raise exception 'Comando remove_pdf inválido.' using errcode='22023';
  end if;
  v_source_id:=p_command->>'sourceId';
  v_source_revision:=(p_command->>'expectedSourceRevision')::bigint;
  v_content_hash:=p_command->>'contentHash';
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'channel',p_channel,'command',p_command
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at>statement_timestamp();
  if found then
    if v_receipt.operation<>'execute_course_source_command'
       or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'requestId reutilizado com remoção de PDF incompatível.'
        using errcode='23514';
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses course
  where course.id=p_course_id for update;
  if v_course.revision<>p_expected_revision then
    raise exception 'O Curso mudou; releia antes de remover o PDF.' using errcode='40001';
  end if;
  select * into v_source from private.course_source_revisions source
  where source.course_id=p_course_id and source.source_id=v_source_id
  order by source.revision desc limit 1;
  if not found or v_source.status<>'active' or v_source.revision<>v_source_revision then
    raise exception 'A remoção exige a revisão corrente e ativa da Fonte.'
      using errcode='23514';
  end if;
  select * into v_attachment from private.course_source_attachments attachment
  where attachment.course_id=p_course_id and attachment.source_id=v_source_id
    and attachment.content_hash=v_content_hash and attachment.status='active'
  order by attachment.source_revision desc,attachment.created_at desc limit 1
  for update;
  if found then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-source-pdf-object:'||v_attachment.storage_path,0
    ));
    update private.course_source_attachments attachment set
      status='removed',version=attachment.version+1,updated_at=clock_timestamp(),
      updated_by=p_actor_id,removed_at=clock_timestamp(),removed_by=p_actor_id,
      removed_course_revision=v_course.revision+1
    where attachment.course_id=v_attachment.course_id
      and attachment.source_id=v_attachment.source_id
      and attachment.source_revision=v_attachment.source_revision
      and attachment.content_hash=v_attachment.content_hash;
    update public.courses course set revision=course.revision+1,updated_at=now()
    where course.id=p_course_id returning * into v_course;
    insert into private.course_events(course_id,revision,operation,summary,actor_id)
    values(p_course_id,v_course.revision,'update_course_sources',jsonb_build_object(
      'activityKind','course_source_changed','channel',p_channel,
      'commandType','remove_pdf','subjectIdHash',
        private.course_source_json_hash_v1(to_jsonb(v_source_id)),
      'subjectRevision',v_source_revision
    ),p_actor_id);
    if not exists(select 1 from private.course_source_attachments active_link
      where active_link.storage_path=v_attachment.storage_path
        and active_link.status='active') then
      insert into private.course_source_pdf_delete_intents(
        actor_id,request_id,course_id,source_id,content_hash,storage_path
      ) values(p_actor_id,p_request_id,p_course_id,v_source_id,v_content_hash,
        v_attachment.storage_path)
      on conflict(actor_id,request_id) do nothing;
    end if;
    v_changed:=true;
  end if;
  v_result:=jsonb_build_object(
    'contract','aralearn.course-source-change.v1','courseId',p_course_id,
    'courseRevision',v_course.revision,'requestId',p_request_id,
    'idempotent',false,'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type','remove_pdf','subjectId',v_source_id,'revision',v_source_revision
    ) else null end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(p_actor_id,p_request_id,'execute_course_source_command',p_course_id,v_hash,v_result);
  return v_result;
end;
$function$;

create function public.claim_course_source_pdf_delete_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_request_id text
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog,public,private as $function$
declare v_intent private.course_source_pdf_delete_intents%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into v_intent from private.course_source_pdf_delete_intents intent
  where intent.actor_id=p_actor_id and intent.course_id=p_course_id
    and intent.request_id=p_request_id for update;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-source-pdf-object:'||v_intent.storage_path,0
  ));
  if exists(select 1 from private.course_source_attachments attachment
    where attachment.storage_path=v_intent.storage_path and attachment.status='active') then
    delete from private.course_source_pdf_delete_intents intent
    where intent.actor_id=p_actor_id and intent.request_id=p_request_id;
    return null;
  end if;
  update private.course_source_pdf_delete_intents intent
  set state='deleting',updated_at=now()
  where intent.actor_id=p_actor_id and intent.request_id=p_request_id;
  return jsonb_build_object('storagePath',v_intent.storage_path);
end;
$function$;

create function public.complete_course_source_pdf_delete_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_request_id text,p_storage_path text
) returns boolean language plpgsql volatile security definer
set search_path = pg_catalog,public,private as $function$
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  perform pg_advisory_xact_lock(hashtextextended(
    'course-source-pdf-object:'||p_storage_path,0
  ));
  if exists(select 1 from private.course_source_attachments attachment
    where attachment.storage_path=p_storage_path and attachment.status='active') then
    raise exception 'O PDF voltou a possuir vínculo ativo.' using errcode='40001';
  end if;
  delete from private.course_source_pdf_delete_intents intent
  where intent.actor_id=p_actor_id and intent.course_id=p_course_id
    and intent.request_id=p_request_id and intent.storage_path=p_storage_path;
  return found;
end;
$function$;

revoke all on function private.guard_course_source_attachment_lifecycle_v1(),
  public.get_owned_course_sources_for_actor_v1(
    uuid,uuid,bigint,text,text,text,text,text,integer
  ),
  public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text),
  public.remove_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text),
  public.claim_course_source_pdf_delete_for_actor_v1(uuid,uuid,text),
  public.complete_course_source_pdf_delete_for_actor_v1(uuid,uuid,text,text)
from public,anon,authenticated,service_role;
grant execute on function
  public.get_owned_course_sources_for_actor_v1(
    uuid,uuid,bigint,text,text,text,text,text,integer
  ),
  public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text),
  public.remove_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text),
  public.claim_course_source_pdf_delete_for_actor_v1(uuid,uuid,text),
  public.complete_course_source_pdf_delete_for_actor_v1(uuid,uuid,text,text)
to service_role;

do $advance_source_pdf_access_lifecycle_manifest$
declare v_manifest jsonb; v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  v_manifest:=jsonb_set(v_manifest,'{schemaRevision}',to_jsonb('20260831000829'::text));
  v_manifest:=jsonb_set(v_manifest,'{features}',(
    select jsonb_agg(feature order by feature)
    from(select jsonb_array_elements_text(v_manifest->'features') feature
      union select 'course-source-pdf-access-lifecycle-v1') value
  ));
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format('create or replace function public.get_aralearn_runtime_manifest() '
    ||'returns jsonb language sql stable security definer '
    ||'set search_path = pg_catalog as %L',v_body);
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_source_pdf_access_lifecycle_manifest$;

commit;
