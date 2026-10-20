begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

create or replace function public.save_prepared_course_read_for_actor_v1(
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
    raise exception 'O conteúdo mudou durante a preparação; recomece a leitura.' using errcode='PT409';
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
      char_length(value #>> '{}')+regexp_count((value #>> '{}') collate "C",U&'[\+010000-\+10FFFF]') as units
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
    from (select value,ordinality,char_length(value)+regexp_count(value collate "C",U&'[\+010000-\+10FFFF]') as units
      from jsonb_array_elements_text(p_chunks) with ordinality) chunks;
  return jsonb_build_object('readId',p_read_id,'digest',v_digest,'total',v_total);
end
$function$;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  manifest:=manifest||jsonb_build_object('schemaRevision','20261020045119');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
