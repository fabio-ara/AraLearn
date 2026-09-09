-- Preferências pertencem à conta. A resolução combina estas preferências com
-- o desenho corrente; esta escrita não altera atribuições ou conteúdo de curso.
create function private.normalize_authoring_process_preferences_v1(p_preferences jsonb)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,private
as $function$
declare v_parameters jsonb; v_count integer;
begin
  if jsonb_typeof(p_preferences) is distinct from 'object'
    or not(p_preferences ?& array['focus','cadence','reviewPoints','parameters'])
    or p_preferences-array['focus','cadence','reviewPoints','parameters']<>'{}'::jsonb
    or octet_length(p_preferences::text)>8192
    or coalesce(p_preferences->>'focus','') not in('content','full_cycle')
    or coalesce(p_preferences->>'cadence','') not in('microsequence','part','batch')
    or jsonb_typeof(p_preferences->'reviewPoints') is distinct from 'array'
    or jsonb_typeof(p_preferences->'parameters') is distinct from 'array' then
    raise exception 'Preferências de autoria inválidas.' using errcode='22023';
  end if;
  if jsonb_array_length(p_preferences->'reviewPoints')>3
    or exists(select 1 from jsonb_array_elements(p_preferences->'reviewPoints') item
      where jsonb_typeof(item)<>'string' or item#>>'{}' not in('curricular_map','explanation','study_unit'))
    or (select count(*)<>count(distinct item) from jsonb_array_elements(p_preferences->'reviewPoints') item) then
    raise exception 'Pontos de revisão inválidos.' using errcode='22023';
  end if;
  select count(*) into v_count from private.course_design_parameter_definitions
    where definition->>'group' in('cadence','conversation');
  if jsonb_array_length(p_preferences->'parameters')<>v_count then
    raise exception 'Informe os parâmetros de processo do catálogo.' using errcode='22023';
  end if;
  v_parameters:=private.normalize_authoring_profile_preferences_v1(p_preferences->'parameters');
  if exists(select 1 from jsonb_array_elements(v_parameters) item
    where not exists(select 1 from private.course_design_parameter_definitions definition
      where definition.parameter_id=item->>'parameterId'
        and definition.definition->>'group' in('cadence','conversation'))) then
    raise exception 'O processo não recebe parâmetros de conteúdo.' using errcode='22023';
  end if;
  return jsonb_build_object('focus',p_preferences->'focus','cadence',p_preferences->'cadence',
    'reviewPoints',(select coalesce(jsonb_agg(point order by ordinal),'[]'::jsonb)
      from unnest(array['curricular_map','explanation','study_unit']) with ordinality item(point,ordinal)
      where p_preferences->'reviewPoints' ? point),'parameters',v_parameters);
end
$function$;
revoke all on function private.normalize_authoring_process_preferences_v1(jsonb) from public,anon,authenticated,service_role;

create function private.default_authoring_process_preferences_v1()
returns jsonb language sql stable security definer set search_path=pg_catalog,private
as $function$
  select jsonb_build_object('focus','full_cycle','cadence','part',
    'reviewPoints',jsonb_build_array('curricular_map','explanation','study_unit'),
    'parameters',(select jsonb_agg(jsonb_build_object('parameterId',parameter_id,'mode','automatic','value',null) order by ordinal)
      from private.course_design_parameter_definitions where definition->>'group' in('cadence','conversation')))
$function$;
revoke all on function private.default_authoring_process_preferences_v1() from public,anon,authenticated,service_role;

create table private.authoring_process_preferences(
  owner_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null check(preferences=private.normalize_authoring_process_preferences_v1(preferences)),
  revision bigint not null default 1 check(revision>=1),
  updated_at timestamptz not null default now()
);
alter table private.authoring_process_preferences enable row level security;
alter table private.authoring_process_preferences force row level security;
revoke all on table private.authoring_process_preferences from public,anon,authenticated,service_role;

-- Amplia as constraints vigentes sem perder operações adicionadas pelas outras
-- etapas. Recibos de preferências, como perfis, pertencem à conta sem course_id.
do $receipt_operations$
declare v_name text; v_expression text;
begin
  for v_name,v_expression in select conname,pg_get_expr(conbin,conrelid) from pg_constraint
    where conrelid='private.course_change_receipts'::regclass and contype='c'
      and conname like 'course_change_receipts_operation_%' loop
    execute format('alter table private.course_change_receipts drop constraint %I',v_name);
    execute format('alter table private.course_change_receipts add constraint %I check ((%s) or operation=''save_authoring_process_preferences'')',v_name,v_expression);
  end loop;
  select conname,pg_get_expr(conbin,conrelid) into v_name,v_expression from pg_constraint
    where conrelid='private.course_change_receipts'::regclass
      and conname='course_change_receipts_profile_scope_v1';
  if found then
    execute format('alter table private.course_change_receipts drop constraint %I',v_name);
    execute format('alter table private.course_change_receipts add constraint %I check ((%s and operation<>''save_authoring_process_preferences'') or (operation=''save_authoring_process_preferences'' and course_id is null))',v_name,v_expression);
  end if;
end
$receipt_operations$;

create function public.get_authoring_process_preferences_for_actor_v1(p_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private
as $function$
declare v_preferences private.authoring_process_preferences%rowtype;
begin
  perform private.require_service_role();
  if p_actor_id is null or not exists(select 1 from auth.users where id=p_actor_id) then
    raise exception 'Pessoa inexistente.' using errcode='PT404';
  end if;
  select * into v_preferences from private.authoring_process_preferences where owner_id=p_actor_id;
  return jsonb_build_object('contract','aralearn.authoring-process-preferences.v1',
    'revision',coalesce(v_preferences.revision,0),
    'preferences',coalesce(v_preferences.preferences,private.default_authoring_process_preferences_v1()),
    'updatedAt',v_preferences.updated_at);
end
$function$;
revoke all on function public.get_authoring_process_preferences_for_actor_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_authoring_process_preferences_for_actor_v1(uuid) to service_role;

create function public.save_authoring_process_preferences_for_actor_v1(
  p_actor_id uuid,p_expected_revision bigint,p_preferences jsonb,p_request_id text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private
as $function$
declare v_preferences jsonb; v_hash text; v_current private.authoring_process_preferences%rowtype;
  v_receipt private.course_change_receipts%rowtype; v_changed boolean; v_result jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null or p_expected_revision is null or p_expected_revision<0
    or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Gravação de preferências inválida.' using errcode='22023';
  end if;
  perform 1 from auth.users where id=p_actor_id for key share;
  if not found then raise exception 'Pessoa inexistente.' using errcode='PT404'; end if;
  v_preferences:=private.normalize_authoring_process_preferences_v1(p_preferences);
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('operation','save_authoring_process_preferences',
    'expectedRevision',p_expected_revision,'preferences',v_preferences));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  delete from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id
    and expires_at<=statement_timestamp();
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'save_authoring_process_preferences' or v_receipt.course_id is not null or v_receipt.request_hash<>v_hash then
      raise exception 'Identidade de gravação incompatível.' using errcode='23514';
    end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('authoring-process-preferences:'||p_actor_id::text,0));
  select * into v_current from private.authoring_process_preferences where owner_id=p_actor_id for update;
  if coalesce(v_current.revision,0)<>p_expected_revision then
    raise exception 'As preferências mudaram; releia antes de salvar.' using errcode='40001';
  end if;
  v_changed:=v_current.owner_id is null or v_current.preferences<>v_preferences;
  if v_current.owner_id is null then
    insert into private.authoring_process_preferences(owner_id,preferences) values(p_actor_id,v_preferences)
      returning * into v_current;
  elsif v_changed then
    update private.authoring_process_preferences set preferences=v_preferences,revision=revision+1,updated_at=now()
      where owner_id=p_actor_id returning * into v_current;
  end if;
  v_result:=jsonb_build_object('contract','aralearn.authoring-process-preferences-change.v1',
    'revision',v_current.revision,'requestId',p_request_id,'changed',v_changed,'idempotent',false,
    'preferences',v_current.preferences,'updatedAt',v_current.updated_at);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,'save_authoring_process_preferences',null,v_hash,v_result);
  return v_result;
end
$function$;
revoke all on function public.save_authoring_process_preferences_for_actor_v1(uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_authoring_process_preferences_for_actor_v1(uuid,bigint,jsonb,text) to service_role;
