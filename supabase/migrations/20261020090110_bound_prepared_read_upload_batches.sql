begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

-- Reserve the complete read's budget before accepting bounded uploads. Partial
-- reads use the same TTL, actor/global limits and course cascade as ready reads.
alter table private.course_prepared_reads
  add column is_ready boolean not null default true,
  add column written_units integer not null default 0 check(written_units>=0),
  add column written_bytes integer not null default 0 check(written_bytes>=0),
  add column written_chunks integer not null default 0 check(written_chunks>=0);

create function public.save_prepared_course_read_batch_for_actor_v1(
  p_actor_id uuid,p_read_id uuid,p_stamp jsonb,p_request_hash text,p_digest text,
  p_state jsonb,p_chunks jsonb,p_next_page text,p_envelope jsonb,p_final_next_decision text,
  p_total integer,p_byte_size integer,p_start integer,p_ordinal integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,extensions
as $function$
declare
  v_course_id uuid:=(p_stamp->>'courseId')::uuid;
  v_current jsonb;
  v_read private.course_prepared_reads%rowtype;
  v_oldest uuid;
  v_count integer;
  v_index integer;
  v_piece text;
  v_pieces text[]:=array[]::text[];
  v_offsets integer[]:=array[]::integer[];
  v_units integer;
  v_offset integer:=p_start;
  v_bytes integer:=0;
  v_digest text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(v_course_id,p_actor_id,true);
  if p_read_id is null or p_request_hash is null or p_request_hash!~'^[0-9a-f]{64}$'
    or p_digest is null or p_digest!~'^[0-9a-f]{64}$'
    or jsonb_typeof(p_chunks) is distinct from 'array'
    or jsonb_typeof(p_envelope) is distinct from 'object' or octet_length(p_envelope::text)>16384
    or char_length(p_next_page)>240 or char_length(p_final_next_decision)>1000
    or jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>2048
    or p_state->>'c' is distinct from v_course_id::text or p_state->'r' is distinct from p_stamp->'revision'
    or p_state->>'o' is distinct from '0' or p_state->'h' is distinct from 'null'::jsonb
    or not coalesce(p_state->>'q' ~ '^[0-9a-f]{64}$',false)
    or p_total is null or p_total not between 1 and 75497472
    or p_byte_size is null or p_byte_size not between p_total and 75497472
    or p_start is null or p_start<0 or p_start>=p_total
    or p_ordinal is null or p_ordinal not between 1 and 8192 then
    raise exception 'Leitura preparada inválida.' using errcode='22023';
  end if;
  v_count:=jsonb_array_length(p_chunks);
  if v_count not between 1 and 128 or p_ordinal+v_count-1>8192
    or octet_length(p_chunks::text)>8388608 then
    raise exception 'Lote da leitura preparada inválido.' using errcode='22023';
  end if;
  for v_index in 0..v_count-1 loop
    if jsonb_typeof(p_chunks->v_index) is distinct from 'string' then
      raise exception 'Fragmentos da leitura preparada inválidos.' using errcode='22023';
    end if;
    v_piece:=p_chunks->>v_index;
    v_units:=char_length(v_piece)+regexp_count(v_piece collate "C",U&'[\+010000-\+10FFFF]');
    if v_units not between 1 and 12000 or v_offset+v_units>p_total
      or (v_offset+v_units<p_total and v_units<11999) then
      raise exception 'Fragmentos da leitura preparada inválidos.' using errcode='22023';
    end if;
    v_offsets:=array_append(v_offsets,v_offset);
    v_pieces:=array_append(v_pieces,v_piece);
    v_offset:=v_offset+v_units;
    v_bytes:=v_bytes+octet_length(v_piece);
  end loop;

  -- A first batch reserves budget under the existing global lock. Other
  -- batches lock only their read; they never reserve the same bytes twice.
  if p_start=0 and p_ordinal=1 then
    perform pg_advisory_xact_lock(620261020005726::bigint);
    perform private.cleanup_prepared_course_reads_v1();
  end if;
  perform 1 from private.course_prepared_read_generations where course_id=v_course_id for share;
  v_current:=public.get_prepared_course_read_stamp_for_actor_v1(p_actor_id,v_course_id,(p_stamp->>'revision')::bigint);
  if v_current is distinct from p_stamp then
    raise exception 'O conteúdo mudou durante a preparação; recomece a leitura.' using errcode='PT409';
  end if;
  select * into v_read from private.course_prepared_reads where id=p_read_id for update;
  if not found then
    if p_start<>0 or p_ordinal<>1 then
      raise exception 'A preparação expirou ou foi interrompida; recomece a leitura.' using errcode='PT409';
    end if;
    loop
      select id into v_oldest from private.course_prepared_reads
        where actor_id=p_actor_id order by created_at,id offset 3 limit 1;
      exit when v_oldest is null;
      delete from private.course_prepared_reads where id=(select id from private.course_prepared_reads
        where actor_id=p_actor_id order by created_at,id limit 1);
    end loop;
    while (select count(*)>=16 or coalesce(sum(byte_size),0)+p_byte_size>100663296 from private.course_prepared_reads) loop
      delete from private.course_prepared_reads where id=(select id from private.course_prepared_reads order by created_at,id limit 1);
    end loop;
    insert into private.course_prepared_reads(id,actor_id,course_id,revision,annotation_set_version,generation,
      schema_revision,selection_fingerprint,request_hash,digest,state,envelope,final_next_decision,next_page,total,byte_size,is_ready)
    values(p_read_id,p_actor_id,v_course_id,(p_stamp->>'revision')::bigint,(p_stamp->>'annotationSetVersion')::bigint,
      (p_stamp->>'generation')::bigint,p_stamp->>'schemaRevision',p_stamp->>'selectionFingerprint',p_request_hash,p_digest,
      p_state,p_envelope,p_final_next_decision,p_next_page,p_total,p_byte_size,false)
    returning * into v_read;
  end if;
  if v_read.actor_id is distinct from p_actor_id or v_read.course_id is distinct from v_course_id
    or v_read.expires_at<=statement_timestamp() or v_read.revision is distinct from (p_stamp->>'revision')::bigint
    or v_read.annotation_set_version is distinct from (p_stamp->>'annotationSetVersion')::bigint
    or v_read.generation is distinct from (p_stamp->>'generation')::bigint
    or v_read.schema_revision is distinct from p_stamp->>'schemaRevision'
    or v_read.selection_fingerprint is distinct from p_stamp->>'selectionFingerprint'
    or v_read.request_hash is distinct from p_request_hash or v_read.digest is distinct from p_digest
    or v_read.total is distinct from p_total or v_read.byte_size is distinct from p_byte_size
    or v_read.state is distinct from p_state or v_read.envelope is distinct from p_envelope
    or v_read.next_page is distinct from p_next_page or v_read.final_next_decision is distinct from p_final_next_decision then
    raise exception 'A preparação expirou ou mudou; recomece a leitura.' using errcode='PT409';
  end if;

  if p_ordinal<=v_read.written_chunks then
    -- An uncertain response may replay the exact whole batch, never overwrite
    -- text or accept a partial overlap with the next batch.
    if p_ordinal+v_count-1>v_read.written_chunks or exists (
      select 1 from generate_series(1,v_count) g(i)
      left join private.course_prepared_read_chunks c on c.read_id=p_read_id and c.ordinal=p_ordinal+g.i-1
      where c.start_offset is distinct from v_offsets[g.i] or c.text_value is distinct from v_pieces[g.i]
    ) then
      raise exception 'O lote não corresponde à preparação salva.' using errcode='PT409';
    end if;
  else
    if v_read.is_ready or p_start<>v_read.written_units or p_ordinal<>v_read.written_chunks+1
      or v_read.written_bytes+v_bytes>p_byte_size then
      raise exception 'O lote não corresponde à continuação da preparação.' using errcode='PT409';
    end if;
    insert into private.course_prepared_read_chunks(read_id,ordinal,start_offset,text_value)
      select p_read_id,p_ordinal+g.i-1,v_offsets[g.i],v_pieces[g.i] from generate_series(1,v_count) g(i);
    update private.course_prepared_reads set written_units=v_offset,written_bytes=written_bytes+v_bytes,
      written_chunks=written_chunks+v_count where id=p_read_id returning * into v_read;
    if v_read.written_units=p_total then
      if v_read.written_bytes<>p_byte_size then
        raise exception 'O tamanho da leitura preparada não corresponde ao texto.' using errcode='22023';
      end if;
      -- Only finalization sees the full text, without a giant JSON request or
      -- another full array of chunks in memory. Publication is atomic with hash
      -- verification and remains fenced against course/source mutations.
      select encode(extensions.digest(convert_to(string_agg(text_value,'' order by ordinal),'UTF8'),'sha256'),'hex')
        into v_digest from private.course_prepared_read_chunks where read_id=p_read_id;
      if v_digest is distinct from p_digest then
        raise exception 'O hash da leitura preparada não corresponde ao texto.' using errcode='22023';
      end if;
      update private.course_prepared_reads set is_ready=true where id=p_read_id returning * into v_read;
    end if;
  end if;
  return jsonb_build_object('readId',p_read_id,'digest',p_digest,'total',p_total,
    'received',v_read.written_units,'ready',v_read.is_ready);
end
$function$;

revoke all on function public.save_prepared_course_read_batch_for_actor_v1(uuid,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text,integer,integer,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.save_prepared_course_read_batch_for_actor_v1(uuid,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text,integer,integer,integer,integer)
  to service_role;
drop function public.save_prepared_course_read_for_actor_v1(uuid,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text);

do $reader$
declare definition text:=pg_get_functiondef('public.read_prepared_course_read_for_actor_v1(uuid,uuid,text,jsonb)'::regprocedure);
begin
  if position('if not found then' in definition)=0 then
    raise exception 'Leitor de preparação divergente; migração interrompida.';
  end if;
  execute replace(definition,'if not found then','if not found or not v_read.is_ready then');
end $reader$;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  manifest:=manifest||jsonb_build_object('schemaRevision','20261020090110');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
