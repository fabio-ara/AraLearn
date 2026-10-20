begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

-- Ephemeral transport state, never a second source of course content. A read
-- expires after one hour, consumes a bounded live-text budget and is deleted
-- with its course. No client role can inspect the tables directly.
create table private.course_prepared_read_generations (
  course_id uuid primary key references public.courses(id) on delete cascade,
  generation bigint not null default 0 check(generation>=0)
);
insert into private.course_prepared_read_generations(course_id) select id from public.courses;

create table private.course_prepared_reads (
  id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  revision bigint not null,
  annotation_set_version bigint not null,
  generation bigint not null,
  schema_revision text not null,
  selection_fingerprint text not null check(selection_fingerprint ~ '^[0-9a-f]{64}$'),
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  digest text not null check(digest ~ '^[0-9a-f]{64}$'),
  state jsonb not null,
  envelope jsonb not null,
  final_next_decision text,
  next_page text,
  total integer not null check(total>0),
  byte_size integer not null check(byte_size between 1 and 75497472),
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp()+interval '1 hour'
);
create index course_prepared_reads_actor_idx on private.course_prepared_reads(actor_id,created_at,id);
create index course_prepared_reads_course_idx on private.course_prepared_reads(course_id);
create index course_prepared_reads_expiry_idx on private.course_prepared_reads(expires_at);
create table private.course_prepared_read_chunks (
  read_id uuid not null references private.course_prepared_reads(id) on delete cascade,
  ordinal integer not null,
  start_offset integer not null,
  text_value text not null,
  primary key(read_id,ordinal),
  unique(read_id,start_offset)
);
alter table private.course_prepared_read_generations enable row level security;
alter table private.course_prepared_reads enable row level security;
alter table private.course_prepared_read_chunks enable row level security;
revoke all on private.course_prepared_read_generations,private.course_prepared_reads,
  private.course_prepared_read_chunks from public,anon,authenticated,service_role;

-- The generation covers mutations that do not increment the course revision,
-- including source/inspection changes. It never scans or hashes course bodies
-- on a continuation. Receipt/intents and study progress do not affect the read.
create function private.invalidate_prepared_course_reads_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_old uuid; v_new uuid;
begin
  if tg_op='TRUNCATE' or tg_argv[0]='global' then
    update private.course_prepared_read_generations set generation=generation+1;
    return null;
  end if;
  if tg_op<>'INSERT' then
    if tg_argv[0]='course' then v_old:=old.id; else v_old:=old.course_id; end if;
  end if;
  if tg_op<>'DELETE' then
    if tg_argv[0]='course' then v_new:=new.id; else v_new:=new.course_id; end if;
  end if;
  insert into private.course_prepared_read_generations(course_id,generation)
    select id,1 from public.courses where id in (v_old,v_new)
    on conflict(course_id) do update set generation=course_prepared_read_generations.generation+1;
  return null;
end
$function$;
revoke all on function private.invalidate_prepared_course_reads_v1() from public,anon,authenticated,service_role;

create trigger course_prepared_read_invalidation after insert or update or delete on public.courses
  for each row execute function private.invalidate_prepared_course_reads_v1('course');
create trigger course_prepared_read_truncate after truncate on public.courses
  for each statement execute function private.invalidate_prepared_course_reads_v1('course');
do $triggers$
declare v_table text;
begin
  foreach v_table in array array[
    'course_instructional_plans','course_instructional_plan_items','course_entities',
    'course_authoring_parts','course_authoring_part_didactic_microsequences','course_design_target_plan_items',
    'course_design_parameter_assignments','course_source_attributions','course_source_attribution_sources',
    'course_source_attribution_anchors','course_sources','course_source_anchors',
    'course_source_attachments','course_media','course_anchored_annotations',
    'course_observation_targets','course_observation_bases','course_anchored_annotation_viewer_versions'
  ] loop
    execute format('create trigger course_prepared_read_invalidation after insert or update or delete on private.%I for each row execute function private.invalidate_prepared_course_reads_v1(''course_id'')',v_table);
    execute format('create trigger course_prepared_read_truncate after truncate on private.%I for each statement execute function private.invalidate_prepared_course_reads_v1(''course_id'')',v_table);
  end loop;
end $triggers$;
create trigger course_prepared_read_catalog_invalidation
  after insert or update or delete or truncate on private.course_design_parameter_definitions
  for each statement execute function private.invalidate_prepared_course_reads_v1('global');

create function public.get_prepared_course_read_stamp_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private
as $function$
declare v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select jsonb_build_object('courseId',course.id,'revision',course.revision,
    'annotationSetVersion',course.annotation_set_version,'generation',generation.generation,
    -- Titles are the human selection interface. A newly ambiguous title must
    -- invalidate a continuation even if the selected course did not change.
    'selectionFingerprint',encode(sha256(convert_to((select coalesce(jsonb_agg(
      jsonb_build_array(owned.id,owned.title) order by owned.id),'[]'::jsonb)::text
      from public.courses owned where owned.owner_id=p_actor_id),'UTF8')),'hex'),
    'schemaRevision',public.get_aralearn_runtime_manifest()->>'schemaRevision') into strict v_result
  from public.courses course join private.course_prepared_read_generations generation on generation.course_id=course.id
  where course.id=p_course_id;
  if (v_result->>'revision')::bigint is distinct from p_expected_revision then
    raise exception 'O curso mudou; recomece a leitura.' using errcode='40001';
  end if;
  return v_result;
end
$function$;

create function private.cleanup_prepared_course_reads_v1()
returns bigint language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_count bigint;
begin
  delete from private.course_prepared_reads where expires_at<=statement_timestamp();
  get diagnostics v_count=row_count;
  return v_count;
end
$function$;
revoke all on function private.cleanup_prepared_course_reads_v1() from public,anon,authenticated,service_role;

create function public.save_prepared_course_read_for_actor_v1(
  p_actor_id uuid,p_read_id uuid,p_stamp jsonb,p_request_hash text,p_digest text,
  p_state jsonb,p_chunks jsonb,p_next_page text,p_envelope jsonb,p_final_next_decision text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,extensions
as $function$
declare
  v_course_id uuid:=(p_stamp->>'courseId')::uuid;
  v_current jsonb;
  v_total integer;
  v_bytes integer;
  v_digest text;
  v_invalid boolean;
  v_oldest uuid;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(v_course_id,p_actor_id,true);
  -- Serialize budget reservation, not fragment reads. Writers of useful data do
  -- not acquire this lock. The row lock fences mutation during publication.
  perform pg_advisory_xact_lock(620261020005726::bigint);
  perform 1 from private.course_prepared_read_generations where course_id=v_course_id for share;
  v_current:=public.get_prepared_course_read_stamp_for_actor_v1(p_actor_id,v_course_id,(p_stamp->>'revision')::bigint);
  if v_current is distinct from p_stamp then
    raise exception 'O conteúdo mudou durante a preparação; recomece a leitura.' using errcode='40001';
  end if;
  if p_read_id is null or p_request_hash is null or p_request_hash!~'^[0-9a-f]{64}$'
    or p_digest is null or p_digest!~'^[0-9a-f]{64}$'
    or jsonb_typeof(p_chunks) is distinct from 'array' or jsonb_array_length(p_chunks) not between 1 and 8192
    or jsonb_typeof(p_envelope) is distinct from 'object' or octet_length(p_envelope::text)>16384
    or char_length(p_next_page)>240 or char_length(p_final_next_decision)>1000
    or jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>2048
    or p_state->>'c' is distinct from v_course_id::text or p_state->'r' is distinct from p_stamp->'revision'
    or p_state->>'o' is distinct from '0' or p_state->'h' is distinct from 'null'::jsonb
    or not coalesce(p_state->>'q' ~ '^[0-9a-f]{64}$',false) then
    raise exception 'Leitura preparada inválida.' using errcode='22023';
  end if;
  with chunks as (
    select value,ordinality,
      char_length(value #>> '{}')+char_length(regexp_replace(value #>> '{}',U&'[\0001-\FFFF]','','g')) as units
    from jsonb_array_elements(p_chunks) with ordinality
  ) select sum(units),sum(octet_length(value #>> '{}')),
      encode(extensions.digest(convert_to(string_agg(value #>> '{}','' order by ordinality),'UTF8'),'sha256'),'hex'),
      bool_or(jsonb_typeof(value)<>'string' or units not between 1 and 12000
        or ordinality<jsonb_array_length(p_chunks) and units<11999)
    into v_total,v_bytes,v_digest,v_invalid from chunks;
  if v_invalid or v_digest is distinct from p_digest or v_bytes not between 1 and 75497472 then
    raise exception 'Fragmentos da leitura preparada inválidos.' using errcode='22023';
  end if;
  perform private.cleanup_prepared_course_reads_v1();
  -- At most four reads per actor, sixteen globally and 96 MiB of live UTF-8
  -- literal text in total. Expired/evicted continuations fail explicitly.
  loop
    select id into v_oldest from private.course_prepared_reads
      where actor_id=p_actor_id order by created_at,id offset 3 limit 1;
    exit when v_oldest is null;
    delete from private.course_prepared_reads where id=(select id from private.course_prepared_reads
      where actor_id=p_actor_id order by created_at,id limit 1);
  end loop;
  while (select count(*)>=16 or coalesce(sum(byte_size),0)+v_bytes>100663296 from private.course_prepared_reads) loop
    delete from private.course_prepared_reads where id=(select id from private.course_prepared_reads order by created_at,id limit 1);
  end loop;
  insert into private.course_prepared_reads(id,actor_id,course_id,revision,annotation_set_version,generation,
    schema_revision,selection_fingerprint,request_hash,digest,state,envelope,final_next_decision,next_page,total,byte_size)
  values(p_read_id,p_actor_id,v_course_id,(p_stamp->>'revision')::bigint,(p_stamp->>'annotationSetVersion')::bigint,
    (p_stamp->>'generation')::bigint,p_stamp->>'schemaRevision',p_stamp->>'selectionFingerprint',p_request_hash,p_digest,p_state,p_envelope,
    p_final_next_decision,p_next_page,v_total,v_bytes);
  insert into private.course_prepared_read_chunks(read_id,ordinal,start_offset,text_value)
    select p_read_id,ordinality::integer,coalesce(sum(units) over(order by ordinality rows between unbounded preceding and 1 preceding),0)::integer,value
    from (select value,ordinality,char_length(value)+char_length(regexp_replace(value,U&'[\0001-\FFFF]','','g')) as units
      from jsonb_array_elements_text(p_chunks) with ordinality) chunks;
  return jsonb_build_object('readId',p_read_id,'digest',v_digest,'total',v_total);
end
$function$;

create function public.read_prepared_course_read_for_actor_v1(
  p_actor_id uuid,p_read_id uuid,p_request_hash text,p_state jsonb
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private
as $function$
declare v_read private.course_prepared_reads%rowtype; v_current jsonb;
  v_offset integer:=(p_state->>'o')::integer; v_start integer; v_text text;
begin
  perform private.require_service_role();
  select * into v_read from private.course_prepared_reads where id=p_read_id and actor_id=p_actor_id;
  if not found then
    raise exception 'A leitura preparada expirou ou está indisponível; recomece a consulta.' using errcode='40001';
  end if;
  perform private.require_course_access_v1(v_read.course_id,p_actor_id,true);
  v_current:=public.get_prepared_course_read_stamp_for_actor_v1(p_actor_id,v_read.course_id,v_read.revision);
  if v_read.expires_at<=statement_timestamp() or v_read.request_hash is distinct from p_request_hash
    or v_read.generation is distinct from (v_current->>'generation')::bigint
    or v_read.annotation_set_version is distinct from (v_current->>'annotationSetVersion')::bigint
    or v_read.schema_revision is distinct from v_current->>'schemaRevision'
    or v_read.selection_fingerprint is distinct from v_current->>'selectionFingerprint'
    or p_state->>'s' is distinct from p_read_id::text or p_state->>'c' is distinct from v_read.course_id::text
    or p_state->'r' is distinct from to_jsonb(v_read.revision) or p_state->'q' is distinct from v_read.state->'q'
    or p_state->'p' is distinct from v_read.state->'p' or p_state->>'h' is distinct from v_read.digest
    or v_offset is null or v_offset<1 or v_offset>=v_read.total then
    raise exception 'A leitura preparada expirou ou mudou; recomece a consulta.' using errcode='40001';
  end if;
  -- Two adjacent chunks cover a fragment without detoasting the full literal.
  select min(start_offset),string_agg(text_value,'' order by ordinal) into v_start,v_text
  from (select ordinal,start_offset,text_value from private.course_prepared_read_chunks
    where read_id=p_read_id and ordinal >= (select ordinal from private.course_prepared_read_chunks
      where read_id=p_read_id and start_offset<=v_offset order by start_offset desc limit 1)
    order by ordinal limit 2) window_value;
  return jsonb_build_object('readId',p_read_id,'courseId',v_read.course_id,'revision',v_read.revision,
    'queryHash',v_read.state->'q','page',v_read.state->'p','digest',v_read.digest,'total',v_read.total,
    'start',v_start,'text',v_text,'nextPage',v_read.next_page,'envelope',v_read.envelope,
    'finalNextDecision',v_read.final_next_decision);
end
$function$;

revoke all on function public.get_prepared_course_read_stamp_for_actor_v1(uuid,uuid,bigint),
  public.save_prepared_course_read_for_actor_v1(uuid,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text),
  public.read_prepared_course_read_for_actor_v1(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_prepared_course_read_stamp_for_actor_v1(uuid,uuid,bigint),
  public.save_prepared_course_read_for_actor_v1(uuid,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text),
  public.read_prepared_course_read_for_actor_v1(uuid,uuid,text,jsonb) to service_role;

select cron.schedule('aralearn-prepared-read-retention-v1','*/15 * * * *',
  'select private.cleanup_prepared_course_reads_v1();');

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  manifest:=manifest||jsonb_build_object('schemaRevision','20261020005726',
    'features',(select jsonb_agg(value order by value collate "C") from jsonb_array_elements_text(
      (manifest->'features')||'["durable-prepared-human-reads-v1"]'::jsonb)));
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
