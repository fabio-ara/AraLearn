-- H1: aplicar metadados, âncoras, vínculos e estilo de Fonte numa única transação.
-- O pacote reutiliza private.execute_course_source_command_core_v1 por sub-comando
-- dentro da mesma chamada (uma transação): falha em qualquer passo reverte tudo e
-- o recibo externo mantém a tentativa idempotente pelo mesmo requestId.
begin;

-- O recibo do pacote usa uma operação própria; amplia o check vigente sem
-- reescrever a definição anterior (preserva todas as operações já aceitas).
do $receipt$
declare
  v_check text;
begin
  select pg_get_expr(conbin,conrelid) into strict v_check from pg_constraint
    where conrelid='private.course_change_receipts'::regclass
      and conname='course_change_receipts_operation_v17';
  alter table private.course_change_receipts drop constraint course_change_receipts_operation_v17;
  execute format('alter table private.course_change_receipts add constraint course_change_receipts_operation_v18 check((%s) or operation in(''execute_course_source_bundle''))',v_check);
end $receipt$;

create or replace function private.execute_course_source_bundle_core_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_commands jsonb,
  p_channel text,
  p_request_id text
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'private', 'auth', 'extensions'
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_count integer;
  v_index integer;
  v_sub jsonb;
  v_step jsonb;
  v_step_type text;
  v_step_request text;
  v_source_revision bigint;
  v_changed boolean := false;
  v_changes jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_channel not in ('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_commands) is distinct from 'array'
     or octet_length(p_commands::text) > 16777216 then
    raise exception 'Pacote de Fonte inválido.' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_commands);
  if v_count < 1 or v_count > 74 then
    raise exception 'O pacote de Fonte aceita de um a 74 comandos.' using errcode = '22023';
  end if;
  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'channel',p_channel,'commands',p_commands
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'execute_course_source_bundle'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com pacote de Fonte incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;
  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text,0
  ));
  select * into strict v_course from public.courses course
  where course.id = p_course_id for update;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de salvar a Fonte.'
      using errcode = 'PT409';
  end if;
  for v_index in 0..(v_count - 1) loop
    v_sub := p_commands -> v_index;
    if jsonb_typeof(v_sub) is distinct from 'object' then
      raise exception 'Comando do pacote de Fonte inválido.' using errcode = '22023';
    end if;
    v_step_type := v_sub->>'type';
    if v_step_type = 'apply_source_bundle' then
      raise exception 'O pacote de Fonte não aceita pacote aninhado.' using errcode = '22023';
    end if;
    if v_step_type = 'save_anchor'
       and (v_sub->'sourceRevision' is null
            or jsonb_typeof(v_sub->'sourceRevision') = 'null') then
      select source.revision into v_source_revision
      from private.course_sources source
      where source.course_id = p_course_id
        and source.source_id = v_sub->>'sourceId'
        and source.status = 'active';
      if v_source_revision is null then
        raise exception 'Âncora exige a Fonte ativa corrente.' using errcode = '23514';
      end if;
      v_sub := jsonb_set(v_sub,'{sourceRevision}',to_jsonb(v_source_revision),true);
    end if;
    v_step_request := 'srcbundle-' || substr(md5(p_request_id || ':' || v_index::text),1,24);
    v_step := private.execute_course_source_command_core_v1(
      p_actor_id,p_course_id,v_course.revision,v_sub,p_channel,v_step_request
    );
    v_course.revision := (v_step->>'courseRevision')::bigint;
    if (v_step->>'changed')::boolean then
      v_changed := true;
      if v_step->'change' is not null then
        v_changes := v_changes || jsonb_build_array(v_step->'change');
      end if;
    end if;
  end loop;
  v_result := jsonb_build_object(
    'contract','aralearn.course-source-change.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'requestId',p_request_id,'idempotent',false,'changed',v_changed,
    'changes',case when v_changed then v_changes else '[]'::jsonb end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values (
    p_actor_id,p_request_id,'execute_course_source_bundle',
    p_course_id,v_hash,v_result
  );
  return v_result;
exception when serialization_failure or sqlstate 'PT409' then
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail = jsonb_build_object(
      'status',409,'headers',jsonb_build_object()
    )::text;
end;
$function$;

revoke all on function private.execute_course_source_bundle_core_v1(
  uuid,uuid,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;

create or replace function public.execute_course_source_bundle_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_commands jsonb,
  p_channel text,
  p_request_id text
)
 returns jsonb
 language sql
 volatile
 security definer
 set search_path=pg_catalog,private
as $function$
  select private.execute_course_source_bundle_core_v1(
    p_actor_id,p_course_id,p_expected_revision,p_commands,p_channel,p_request_id
  )
$function$;

revoke all on function public.execute_course_source_bundle_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.execute_course_source_bundle_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) to service_role;

-- O pacote transacional de Fonte avança o runtime: declara a nova revisão e o
-- recurso corrente, preservando todos os recursos já exigidos pelo manifesto.
do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261005120000' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261005120000',
      'features',(manifest->'features')||jsonb_build_array('course-source-atomic-bundle-v1'));
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

commit;
