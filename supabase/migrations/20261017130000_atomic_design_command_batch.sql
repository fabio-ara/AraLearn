-- Um ajuste humano pode produzir vários comandos de desenho. Este wrapper
-- executa os comandos existentes na mesma transação, conservando CAS e a
-- autoridade de cada escritor, mas publica somente um recibo externo. Falha em
-- qualquer passo reverte também os recibos internos e as revisões já avançadas.
begin;

do $receipt_operation$
declare item record;
begin
  for item in
    select conname, pg_get_expr(conbin,conrelid) expression
    from pg_constraint
    where conrelid='private.course_change_receipts'::regclass
      and contype='c'
      and conname like 'course_change_receipts_operation_%'
  loop
    execute format('alter table private.course_change_receipts drop constraint %I',item.conname);
    execute format(
      'alter table private.course_change_receipts add constraint %I check((%s) or operation=''apply_course_design_command_batch_v3'')',
      item.conname,item.expression
    );
  end loop;
  if not exists(
    select 1 from pg_constraint
    where conrelid='private.course_change_receipts'::regclass
      and contype='c'
      and conname like 'course_change_receipts_operation_%'
  ) then
    raise exception 'A restrição de operações de recibo não foi localizada.' using errcode='55000';
  end if;
end $receipt_operation$;

create function public.apply_course_design_command_batch_for_actor_v3(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_commands jsonb,
  p_request_id text,
  p_request_hash text,
  p_channel text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  receipt private.course_change_receipts%rowtype;
  course public.courses%rowtype;
  command_value jsonb;
  command_index integer;
  child_request text;
  child_hash text;
  child_result jsonb;
  child_changed boolean;
  child_revision bigint;
  changed boolean:=false;
  changes jsonb:='[]'::jsonb;
  result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null
     or p_expected_course_revision is null or p_expected_course_revision<1
     or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash!~'^[a-f0-9]{64}$'
     or p_channel is null or p_channel not in('application','mcp','actions')
     or jsonb_typeof(p_commands) is distinct from 'array'
     or jsonb_array_length(p_commands) not between 1 and 13
     or octet_length(p_commands::text)>32768 then
    raise exception 'Lote de comandos de desenho inválido.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts
  where actor_id=p_actor_id and request_id=p_request_id
    and expires_at<=statement_timestamp();
  select * into receipt from private.course_change_receipts
  where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if receipt.operation<>'apply_course_design_command_batch_v3'
       or receipt.course_id<>p_course_id
       or receipt.request_hash<>p_request_hash
       or receipt.result->>'contract'<>'aralearn.course-design-batch-change.v1' then
      raise exception 'requestId reutilizado com lote de desenho incompatível.'
        using errcode='23514';
    end if;
    return (receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict course from public.courses
  where id=p_course_id for update;
  if course.revision<>p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de ajustar a configuração.'
      using errcode='PT409';
  end if;

  for command_index,command_value in
    select ordinal-1,value
    from jsonb_array_elements(p_commands) with ordinality item(value,ordinal)
    order by ordinal
  loop
    child_request:='designbatch-'||substr(md5(p_request_id||':'||command_index::text),1,24);
    child_hash:=encode(sha256(convert_to(jsonb_build_object(
      'courseId',p_course_id,
      'expectedCourseRevision',course.revision,
      'command',command_value,
      'channel',p_channel
    )::text,'UTF8')),'hex');
    child_result:=public.apply_course_design_command_for_actor_v3(
      p_actor_id,p_course_id,course.revision,command_value,
      p_request_id=>child_request,p_request_hash=>child_hash,p_channel=>p_channel
    );
    -- O recibo público pertence ao lote; os recibos dos subcomandos existem só
    -- para a idempotência interna dentro desta transação e não entram no commit.
    delete from private.course_change_receipts
    where actor_id=p_actor_id and request_id=child_request
      and operation='apply_course_design_command_v3';

    if jsonb_typeof(child_result) is distinct from 'object'
       or child_result->>'courseId' is distinct from p_course_id::text
       or child_result->>'requestId' is distinct from child_request
       or jsonb_typeof(child_result->'changed') is distinct from 'boolean'
       or jsonb_typeof(child_result->'courseRevision') is distinct from 'number' then
      raise exception 'A confirmação de um subcomando do lote é inválida.'
        using errcode='55000';
    end if;
    child_changed:=(child_result->>'changed')::boolean;
    child_revision:=(child_result->>'courseRevision')::bigint;
    if child_revision<>course.revision+(case when child_changed then 1 else 0 end) then
      raise exception 'A revisão de um subcomando não corresponde ao lote.'
        using errcode='55000';
    end if;
    if child_changed then
      if jsonb_typeof(child_result->'change') is distinct from 'object' then
        raise exception 'Um subcomando alterado não devolveu a identidade da mudança.'
          using errcode='55000';
      end if;
      changed:=true;
      changes:=changes||jsonb_build_array(child_result->'change');
    end if;
    course.revision:=child_revision;
  end loop;

  result:=jsonb_build_object(
    'contract','aralearn.course-design-batch-change.v1',
    'courseId',p_course_id,
    'courseRevision',course.revision,
    'requestId',p_request_id,
    'idempotent',false,
    'changed',changed,
    'changes',changes
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'apply_course_design_command_batch_v3',
    p_course_id,p_request_hash,result
  );
  return result;
end
$function$;
revoke all on function public.apply_course_design_command_batch_for_actor_v3(
  uuid,uuid,bigint,jsonb,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.apply_course_design_command_batch_for_actor_v3(
  uuid,uuid,bigint,jsonb,text,text,text
) to service_role;

create function public.get_course_design_recovery_receipt_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_operation text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare receipt private.course_change_receipts%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null
     or p_operation is null
     or p_operation not in(
       'apply_course_design_command_v3','apply_course_design_command_batch_v3'
     )
     or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'A recuperação do desenho é inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  select * into receipt from private.course_change_receipts
  where actor_id=p_actor_id and request_id=p_request_id;
  if not found then
    return jsonb_build_object('status','absent');
  end if;
  if receipt.course_id<>p_course_id
     or receipt.operation<>p_operation then
    raise exception 'A tentativa do desenho pertence a outra alteração.'
      using errcode='23514';
  end if;
  if receipt.expires_at<=statement_timestamp() then
    return jsonb_build_object('status','expired');
  end if;
  if (p_operation='apply_course_design_command_batch_v3'
        and receipt.result->>'contract'<>'aralearn.course-design-batch-change.v1'
      or p_operation='apply_course_design_command_v3'
        and receipt.result->>'contract'<>'aralearn.course-design-change.v3')
     or receipt.result->>'courseId'<>p_course_id::text
     or receipt.result->>'requestId'<>p_request_id then
    raise exception 'O recibo do desenho é inválido.' using errcode='55000';
  end if;
  return jsonb_build_object(
    'status','confirmed',
    'result',receipt.result||jsonb_build_object('idempotent',true)
  );
end
$function$;
revoke all on function public.get_course_design_recovery_receipt_for_actor_v1(
  uuid,uuid,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.get_course_design_recovery_receipt_for_actor_v1(
  uuid,uuid,text,text
) to service_role;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261017130000' then
    manifest:=manifest||jsonb_build_object(
      'schemaRevision','20261017130000',
      'features',(select jsonb_agg(value order by value collate "C")
        from jsonb_array_elements_text(
          (manifest->'features')||'["contextual-design-command-atomic-batch-v1"]'::jsonb
        ))
    );
    execute format(
      'create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb'
    );
  end if;
end $manifest$;

notify pgrst,'reload schema';
commit;
