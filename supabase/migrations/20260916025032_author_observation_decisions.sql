-- One author intent owns several independently decidable incidences. Bases are
-- shared relational snapshots; transport receipt expiry never expires a base.
begin;

alter table private.course_anchored_annotations add column target_set_version bigint not null default 1;
alter table private.course_anchored_annotations drop constraint course_anchored_annotations_text_v1;
alter table private.course_anchored_annotations add constraint course_anchored_annotations_text_v3 check (
  (state in ('withdrawn','resolved') and raw_text is null and brief_summary is null and owner_response is null)
  or (state<>'withdrawn' and private.valid_course_annotation_text_v1(raw_text,2000,16384,false)
    and private.valid_course_annotation_text_v1(brief_summary,500,4096,true)
    and private.valid_course_annotation_text_v1(owner_response,2000,16384,true)));
alter table private.course_anchored_annotations drop constraint course_anchored_annotations_state_v1;
alter table private.course_anchored_annotations add constraint course_anchored_annotations_state_v3 check (
  state in ('open','considered','resolved','withdrawn') and (responded_at is null)=(owner_response is null)
  and (state='resolved')=(resolved_at is not null) and (
    state='withdrawn' and withdrawn_at is not null and hard_delete_after=withdrawn_at+interval '14 days'
    or state='resolved' and raw_text is null and withdrawn_at is null and hard_delete_after=resolved_at+interval '14 days'
    or state<>'withdrawn' and raw_text is not null and withdrawn_at is null and hard_delete_after is null));

create table private.course_observation_bases (
  course_id uuid not null references public.courses(id) on delete cascade,
  target_kind text not null check(target_kind in ('study_unit','microsequence_explanation')),
  target_id text not null, basis_hash text not null check(basis_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  primary key(course_id,target_kind,target_id,basis_hash)
);
create table private.course_observation_targets (
  annotation_id uuid not null references private.course_anchored_annotations(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  target_kind text not null check(target_kind in ('study_unit','microsequence_explanation')),
  target_id text not null, observed_path jsonb not null,
  basis_hash text, state text not null default 'pending' check(state in ('pending','approved','cancelled')),
  decision jsonb,
  primary key(annotation_id,target_kind,target_id),
  foreign key(course_id,target_kind,target_id,basis_hash)
    references private.course_observation_bases(course_id,target_kind,target_id,basis_hash)
);
create index course_observation_targets_object_idx on private.course_observation_targets(course_id,target_kind,target_id,state);
alter table private.course_observation_bases enable row level security;
alter table private.course_observation_targets enable row level security;
revoke all on private.course_observation_bases,private.course_observation_targets from public,anon,authenticated;

-- The former system did not preserve content at observation creation. It is
-- deliberately unknown for migrated notes; do not fabricate historical text.
insert into private.course_observation_targets(annotation_id,course_id,target_kind,target_id,observed_path)
select id,course_id,target_kind,target_id,observed_path from private.course_anchored_annotations
where origin='author' and target_kind in ('study_unit','microsequence_explanation') and state in ('open','considered');

create function private.course_observation_basis_hash_v1(p_course uuid,p_kind text,p_id text)
returns text language plpgsql stable security definer set search_path=pg_catalog as $function$
declare result text;
begin
  if to_regprocedure('private.course_ai_inspection_basis_hash_v1(uuid,text,text)') is not null then
    execute 'select private.course_ai_inspection_basis_hash_v1($1,$2,$3)' into result using p_course,p_kind,p_id;
    return result;
  end if;
  return private.course_content_basis_hash_v1(p_course,p_kind,p_id);
end $function$;

create function private.course_observation_snapshot_v1(p_course_id uuid,p_kind text,p_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  with target as (
    select case p_kind when 'microsequence_explanation' then content->'explanation' else content end content
    from private.course_entities where course_id=p_course_id and entity_id=p_id
      and entity_type=case p_kind when 'study_unit' then 'study_unit' when 'microsequence_explanation' then 'microsequence' end
  ), links as (
    select coalesce((select private.course_source_links_v1(p_course_id,a.id)
      from private.course_source_attributions a where a.course_id=p_course_id and a.target_kind=p_kind and a.target_id=p_id),'[]'::jsonb) value
  ), payload as (
    select jsonb_build_object('content',coalesce(target.content,'{}'::jsonb),'sourceLinks',links.value,
      'sources',coalesce((select jsonb_agg((to_jsonb(s)-'course_id')||jsonb_build_object('anchors',
        coalesce((select jsonb_agg(to_jsonb(a)-'course_id' order by a.anchor_id) from private.course_source_anchors a
          where a.course_id=p_course_id and a.source_id=s.source_id and exists(
            select 1 from jsonb_array_elements(links.value) link cross join lateral
              jsonb_array_elements(coalesce(link->'anchors','[]'::jsonb)) selected
            where link->>'sourceId'=s.source_id and selected->>'anchorId'=a.anchor_id)),'[]'::jsonb)) order by s.source_id)
        from private.course_sources s where s.course_id=p_course_id
          and exists(select 1 from jsonb_array_elements(links.value) l where l->>'sourceId'=s.source_id)),'[]'::jsonb)) value
    from target cross join links
  ) select payload.value||jsonb_build_object('hash',private.course_observation_basis_hash_v1(p_course_id,p_kind,p_id)) from payload
$function$;

create function private.capture_course_observation_basis_v1(p_course uuid,p_kind text,p_id text)
returns text language plpgsql security definer set search_path=pg_catalog as $function$
declare snapshot jsonb;
begin
  snapshot:=private.course_observation_snapshot_v1(p_course,p_kind,p_id);
  if snapshot is null or snapshot->>'hash' is null then raise exception 'Alvo inexistente.' using errcode='PT404'; end if;
  insert into private.course_observation_bases(course_id,target_kind,target_id,basis_hash,snapshot)
    values(p_course,p_kind,p_id,snapshot->>'hash',snapshot) on conflict do nothing;
  return snapshot->>'hash';
end $function$;

create function private.collect_course_observation_bases_v1(p_course uuid)
returns void language sql security definer set search_path=pg_catalog as $function$
  delete from private.course_observation_bases b where b.course_id=p_course and not exists (
    select 1 from private.course_observation_targets t where t.course_id=b.course_id
      and t.target_kind=b.target_kind and t.target_id=b.target_id and t.basis_hash=b.basis_hash)
$function$;

-- Preserve the canonical legacy envelope and extend author-owned projections.
alter function private.course_anchored_annotation_item_v1(private.course_anchored_annotations,uuid,boolean)
  rename to course_anchored_annotation_single_item_v1;
create function private.course_anchored_annotation_item_v1(p_annotation private.course_anchored_annotations,p_viewer_id uuid,p_viewer_is_owner boolean)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
declare result jsonb; targets jsonb;
begin
  result:=private.course_anchored_annotation_single_item_v1(p_annotation,p_viewer_id,p_viewer_is_owner);
  if p_annotation.state='resolved' and p_annotation.raw_text is null then
    result:=jsonb_set(result,'{capabilities}',jsonb_build_object('canRevise',false,'canWithdraw',false,'canConsider',false,
      'canRespond',false,'canResolve',false,'canReopen',false,'canCorrectSubjects',false));
  end if;
  if p_annotation.origin='author' and p_annotation.actor_id=p_viewer_id and p_viewer_is_owner then
    select jsonb_agg(jsonb_build_object('kind',t.target_kind,'id',t.target_id,'state',t.state,'path',t.observed_path,
      'basis',case when b.basis_hash is not null then jsonb_build_object('hash',b.basis_hash,'deferred',true) end,
      'current',case when t.state='pending' and private.course_observation_basis_hash_v1(t.course_id,t.target_kind,t.target_id) is not null then
        jsonb_build_object('hash',private.course_observation_basis_hash_v1(t.course_id,t.target_kind,t.target_id),'deferred',true) end)
      order by t.target_kind,t.target_id) into targets from private.course_observation_targets t
      left join private.course_observation_bases b on b.course_id=t.course_id and b.target_kind=t.target_kind
        and b.target_id=t.target_id and b.basis_hash=t.basis_hash where t.annotation_id=p_annotation.id;
    if targets is not null then
      result:=result||jsonb_build_object('targetSetVersion',p_annotation.target_set_version,'targets',targets);
      result:=jsonb_set(result,'{capabilities}',(result->'capabilities')||jsonb_build_object('canWithdraw',false,'canResolve',false,'canReopen',false));
    end if;
  end if;
  return result;
end $function$;

-- Fetch one comparison explicitly. Inbox/change envelopes keep only references,
-- so one observation can cover many real objects without duplicating their bytes.
create function public.get_course_observation_comparison_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_annotation_id uuid,
  p_target_kind text,p_target_id text,p_expected_annotation_version bigint,p_expected_target_set_version bigint)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
declare annotation private.course_anchored_annotations%rowtype; incidence private.course_observation_targets%rowtype; result jsonb;
begin
  perform private.require_service_role(); perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into annotation from private.course_anchored_annotations where id=p_annotation_id and course_id=p_course_id
    and actor_id=p_actor_id and origin='author';
  if not found then raise exception 'Observação não encontrada.' using errcode='PT404'; end if;
  if annotation.version is distinct from p_expected_annotation_version or annotation.target_set_version is distinct from p_expected_target_set_version then
    raise exception 'A observação ou seus alvos mudaram; atualize a central.' using errcode='40001'; end if;
  select * into incidence from private.course_observation_targets where annotation_id=p_annotation_id and course_id=p_course_id
    and target_kind=p_target_kind and target_id=p_target_id and state='pending';
  if not found then raise exception 'Incidência pendente não encontrada.' using errcode='PT404'; end if;
  result:=jsonb_build_object('contract','aralearn.course-observation-comparison.v1','courseId',p_course_id,
    'courseRevision',(select revision from public.courses where id=p_course_id),'annotationId',p_annotation_id,
    'annotationVersion',annotation.version,'targetSetVersion',annotation.target_set_version,'target',jsonb_build_object('kind',p_target_kind,'id',p_target_id),
    'basis',(select snapshot-'files' from private.course_observation_bases where course_id=p_course_id and target_kind=p_target_kind
      and target_id=p_target_id and basis_hash=incidence.basis_hash),'current',private.course_observation_snapshot_v1(p_course_id,p_target_kind,p_target_id)-'files');
  -- 2*(1 MiB content + 128 KiB links + 32*256 KiB source reads) = 18.25 MiB.
  -- Round up for relational metadata/envelope; binary/storage retention stays private.
  -- MCP/Actions independently fragment the literal document into small pages.
  if octet_length(result::text)>20971520 then raise exception 'A comparação deste alvo excede o limite de leitura.' using errcode='54000'; end if;
  return result;
end $function$;
revoke all on function public.get_course_observation_comparison_for_actor_v1(uuid,uuid,uuid,text,text,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.get_course_observation_comparison_for_actor_v1(uuid,uuid,uuid,text,text,bigint,bigint) to service_role;

-- Existing filters count identities and match any incidence, never duplicate a
-- parent row for each target. Descendants continue to use the observed path.
do $matches$
declare definition text;
begin
  definition:=pg_get_functiondef('private.course_anchored_annotation_matches_v1(private.course_anchored_annotations,text,text[],text[],text[],text[],boolean,text[],text,text,boolean,uuid)'::regprocedure);
  definition:=replace(definition,'p_annotation.target_kind=p_target_kind and p_annotation.target_id=p_target_id',
    'p_annotation.target_kind=p_target_kind and p_annotation.target_id=p_target_id
      and not exists(select 1 from private.course_observation_targets known where known.annotation_id=p_annotation.id)
      or exists(select 1 from private.course_observation_targets incidence where incidence.annotation_id=p_annotation.id
        and incidence.state=''pending'' and incidence.target_kind=p_target_kind and incidence.target_id=p_target_id)');
  execute definition;
end $matches$;

do $counter$
declare definition text;
begin
  definition:=pg_get_functiondef('private.list_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text)'::regprocedure);
  definition:=replace(definition,'a.origin=''author'' and a.target_kind=''study_unit''
            and a.target_id=candidate_pool.entity_id and a.state','a.origin=''author'' and a.state');
  execute definition;
end $counter$;

alter function private.execute_course_anchored_annotation_command_core_v1(uuid,uuid,bigint,jsonb,text,text,text,boolean)
  rename to execute_course_single_annotation_command_v1;

create function private.execute_course_anchored_annotation_command_core_v1(p_actor_id uuid,p_course_id uuid,
 p_expected_course_revision bigint,p_command jsonb,p_origin text,p_channel text,p_request_id text,p_actor_is_owner boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare annotation private.course_anchored_annotations%rowtype; receipt private.course_change_receipts%rowtype;
  result jsonb; selected jsonb; entry jsonb; target_snapshot jsonb; basis text; signature text; current_revision bigint;
  kind text:=p_command->>'type'; custom boolean; changed boolean:=false; terminal boolean:=false;
begin
  custom:=kind in ('retarget_anchored_annotation','decide_anchored_annotation');
  if kind in ('resolve_anchored_annotation','withdraw_anchored_annotation','reopen_anchored_annotation')
    and exists(select 1 from private.course_anchored_annotations a join private.course_observation_targets t on t.annotation_id=a.id
      where a.id=(p_command->>'annotationId')::uuid and a.course_id=p_course_id and a.origin='author') then
    perform private.require_course_access_v1(p_course_id,p_actor_id,true);
    raise exception 'Esta observação exige decisão explícita das incidências e versões apresentadas. Para nova intenção, crie outra observação.' using errcode='42501';
  end if;
  if not custom and not(kind='create_anchored_annotation' and p_origin='author'
    and p_command#>>'{target,kind}' in ('study_unit','microsequence_explanation')) then
    if exists(select 1 from private.course_anchored_annotations where id=(p_command->>'annotationId')::uuid
      and course_id=p_course_id and state='resolved' and raw_text is null) then
      raise exception 'Esta observação foi encerrada; crie uma nova intenção.' using errcode='40001'; end if;
    result:=private.execute_course_single_annotation_command_v1(p_actor_id,p_course_id,p_expected_course_revision,p_command,p_origin,p_channel,p_request_id,p_actor_is_owner);
    return result;
  end if;
  if p_actor_is_owner is distinct from true or p_origin<>'author' or p_channel not in ('authoring_interface','authoring_chat') then
    raise exception 'Somente a autoria decide estas observações.' using errcode='42501'; end if;
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' or pg_column_size(p_command)>32768 then
    raise exception 'Comando inválido.' using errcode='22023'; end if;
  signature:=private.course_annotation_hash_v1(jsonb_build_object('courseId',p_course_id,'command',p_command,
    'revision',p_expected_course_revision,'origin',p_origin,'channel',p_channel));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  perform 1 from auth.users where id=p_actor_id for key share;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select revision into current_revision from public.courses where id=p_course_id for update;
  select * into receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if receipt.course_id<>p_course_id or receipt.result->>'observationMutationHash' is distinct from signature then
      raise exception 'requestId reutilizado com comando incompatível.' using errcode='23514'; end if;
    if receipt.expires_at<=statement_timestamp() then raise exception 'Tentativa expirada; reconcilie a decisão.' using errcode='PT409'; end if;
    select * into annotation from private.course_anchored_annotations where id=(p_command->>'annotationId')::uuid;
    return jsonb_build_object('contract','aralearn.course-anchored-annotation-change.v1','courseId',p_course_id,
      'courseRevision',current_revision,'annotationSetVersion',(select annotation_set_version from public.courses where id=p_course_id),
      'requestId',p_request_id,'idempotent',true,'changed',false,'annotation',case when annotation.id is not null
        then private.course_anchored_annotation_item_v1(annotation,p_actor_id,true) end);
  end if;
  selected:=coalesce(p_command->'targets',jsonb_build_array(p_command->'target'));
  if jsonb_typeof(selected) is distinct from 'array' or jsonb_array_length(selected) not between 1 and 64
    or (select count(*)<>count(distinct (value->>'kind',value->>'id')) from jsonb_array_elements(selected)) then
    raise exception 'Selecione alvos únicos entre um e 64.' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(selected) loop
    if jsonb_typeof(entry) is distinct from 'object' or entry->>'kind' not in ('study_unit','microsequence_explanation')
      or nullif(btrim(entry->>'id'),'') is null or entry->>'id'<>btrim(entry->>'id') or char_length(entry->>'id')>240
      or entry->>'id'~'[[:cntrl:]]' or not(entry ?& array['kind','id'])
      or kind='decide_anchored_annotation' and (not(entry ? 'expectedBasisHash')
        or jsonb_typeof(entry->'expectedBasisHash') not in ('string','null')
        or entry->>'expectedBasisHash' is not null and entry->>'expectedBasisHash' !~ '^[a-f0-9]{64}$')
      or entry-(case when kind='decide_anchored_annotation' then array['kind','id','expectedBasisHash'] else array['kind','id'] end)<>'{}'::jsonb then
      raise exception 'Alvo inválido.' using errcode='22023'; end if;
  end loop;
  if kind='create_anchored_annotation' then
    if p_command->>'capturedAt' is not null and (p_command->>'capturedAt')::timestamptz < statement_timestamp()-interval '14 days' then
      raise exception 'Envio autoral expirado. Releia as pendências e inicie uma nova intenção explícita.' using errcode='PT409'; end if;
    if not(selected @> jsonb_build_array(p_command->'target')) then raise exception 'Alvo inicial fora da seleção.' using errcode='22023'; end if;
    result:=private.execute_course_single_annotation_command_v1(p_actor_id,p_course_id,p_expected_course_revision,p_command-'targets',p_origin,p_channel,p_request_id,true);
    select * into annotation from private.course_anchored_annotations where id=(p_command->>'annotationId')::uuid;
    for entry in select value from jsonb_array_elements(selected) loop
      target_snapshot:=private.course_annotation_target_snapshot_v1(p_course_id,entry->>'kind',entry->>'id');
      basis:=private.capture_course_observation_basis_v1(p_course_id,entry->>'kind',entry->>'id');
      insert into private.course_observation_targets(annotation_id,course_id,target_kind,target_id,observed_path,basis_hash)
        values(annotation.id,p_course_id,entry->>'kind',entry->>'id',target_snapshot->'path',basis);
    end loop;
    update private.course_change_receipts set result=course_change_receipts.result||jsonb_build_object('observationMutationHash',signature)
      where actor_id=p_actor_id and request_id=p_request_id;
    return result||jsonb_build_object('annotation',private.course_anchored_annotation_item_v1(annotation,p_actor_id,true));
  end if;
  if p_command-array['type','annotationId','expectedAnnotationVersion','expectedTargetSetVersion','targets','decision','reason']<>'{}'::jsonb
    or not(p_command ?& array['type','annotationId','expectedAnnotationVersion','expectedTargetSetVersion','targets']) then
    raise exception 'Comando inválido.' using errcode='22023'; end if;
  select * into annotation from private.course_anchored_annotations where course_id=p_course_id and id=(p_command->>'annotationId')::uuid for update;
  if not found or annotation.actor_id is distinct from p_actor_id or annotation.origin<>'author' then
    raise exception 'Observação inexistente ou inacessível.' using errcode='PT404'; end if;
  if annotation.version is distinct from (p_command->>'expectedAnnotationVersion')::bigint
    or annotation.target_set_version is distinct from (p_command->>'expectedTargetSetVersion')::bigint
    or annotation.state not in ('open','considered') then
    raise exception 'A observação ou seus alvos mudaram; releia antes de decidir.' using errcode='40001'; end if;
  if kind='retarget_anchored_annotation' then
    if p_expected_course_revision is distinct from current_revision then raise exception 'O curso mudou.' using errcode='40001'; end if;
    if exists(select 1 from jsonb_array_elements(selected) x join private.course_observation_targets t
      on t.annotation_id=annotation.id and t.target_kind=x->>'kind' and t.target_id=x->>'id' where t.state<>'pending') then
      raise exception 'Uma nova intenção para alvo já decidido precisa de nova observação.' using errcode='PT409'; end if;
    delete from private.course_observation_targets t where t.annotation_id=annotation.id and t.state='pending'
      and not exists(select 1 from jsonb_array_elements(selected) x where x->>'kind'=t.target_kind and x->>'id'=t.target_id);
    for entry in select value from jsonb_array_elements(selected) loop
      if not exists(select 1 from private.course_observation_targets t where t.annotation_id=annotation.id and t.target_kind=entry->>'kind' and t.target_id=entry->>'id') then
        target_snapshot:=private.course_annotation_target_snapshot_v1(p_course_id,entry->>'kind',entry->>'id');
        basis:=private.capture_course_observation_basis_v1(p_course_id,entry->>'kind',entry->>'id');
        insert into private.course_observation_targets values(annotation.id,p_course_id,entry->>'kind',entry->>'id',target_snapshot->'path',basis,'pending',null);
      end if;
    end loop;
    update private.course_anchored_annotations set target_set_version=target_set_version+1,version=version+1,updated_at=statement_timestamp()
      where id=annotation.id returning * into annotation;
  else
    if p_expected_course_revision is not null or jsonb_typeof(p_command->'decision') is distinct from 'string'
      or p_command->>'decision' not in ('approve','cancel')
      or not(p_command ?& array['decision','reason']) or p_command->>'decision'='cancel' and nullif(btrim(p_command->>'reason'),'') is null
      or jsonb_typeof(p_command->'reason') not in ('string','null')
      or char_length(p_command->>'reason')>120 then raise exception 'Decisão explícita inválida.' using errcode='22023'; end if;
    for entry in select value from jsonb_array_elements(selected) loop
      if not exists(select 1 from private.course_observation_targets t where t.annotation_id=annotation.id
        and t.target_kind=entry->>'kind' and t.target_id=entry->>'id' and t.state='pending') then
        raise exception 'A incidência mudou ou não pertence à seleção.' using errcode='40001'; end if;
      basis:=private.course_observation_basis_hash_v1(p_course_id,entry->>'kind',entry->>'id');
      if p_command->>'decision'='approve' and basis is null or entry->>'expectedBasisHash' is distinct from basis then
        raise exception 'O conteúdo ou suas fontes mudaram depois da apresentação.' using errcode='40001'; end if;
      if p_command->>'decision'='approve' and private.course_ai_inspection_pending_v1(p_course_id,entry->>'kind',entry->>'id') then
        raise exception 'Inspeção por IA pendente. Salve e inspecione esta versão antes de aprovar.' using errcode='PT409'; end if;
    end loop;
    update private.course_observation_targets t set state=case p_command->>'decision' when 'approve' then 'approved' else 'cancelled' end,
      basis_hash=null,decision=jsonb_build_object('decision',p_command->>'decision','reason',p_command->>'reason','actorId',p_actor_id,
        'at',statement_timestamp(),'annotationVersion',annotation.version,'targetSetVersion',annotation.target_set_version,
        'basisHash',chosen.value->>'expectedBasisHash','requestId',p_request_id)
      from jsonb_array_elements(selected) chosen(value) where t.annotation_id=annotation.id and t.target_kind=chosen.value->>'kind' and t.target_id=chosen.value->>'id';
    terminal:=not exists(select 1 from private.course_observation_targets where annotation_id=annotation.id and state='pending');
    update private.course_anchored_annotations set version=version+1,updated_at=statement_timestamp(),
      state=case when terminal then 'resolved' else state end,resolved_at=case when terminal then statement_timestamp() else resolved_at end,
      raw_text=case when terminal then null else raw_text end,brief_summary=case when terminal then null else brief_summary end,
      owner_response=case when terminal then null else owner_response end,owner_response_kind=case when terminal then null else owner_response_kind end,
      responded_at=case when terminal then null else responded_at end,
      owner_response_source_links=case when terminal then '[]'::jsonb else owner_response_source_links end,
      hard_delete_after=case when terminal then statement_timestamp()+interval '14 days' else hard_delete_after end
      where id=annotation.id returning * into annotation;
  end if;
  changed:=true;
  perform private.collect_course_observation_bases_v1(p_course_id);
  update public.courses set annotation_set_version=annotation_set_version+1 where id=p_course_id;
  perform private.bump_course_annotation_viewer_version_v1(p_course_id,p_actor_id);
  insert into private.course_change_receipts(actor_id,request_id,course_id,operation,request_hash,result)
    values(p_actor_id,p_request_id,p_course_id,'execute_course_anchored_annotation',signature,
      jsonb_build_object('contract','aralearn.course-anchored-annotation-receipt.v1','annotationId',annotation.id,
        'annotationVersion',annotation.version,'annotationSetVersion',(select annotation_set_version from public.courses where id=p_course_id),
        'changed',changed,'observationMutationHash',signature,'decision',p_command->>'decision','reason',p_command->>'reason',
        'targets',selected,'targetSetVersion',annotation.target_set_version));
  return jsonb_build_object('contract','aralearn.course-anchored-annotation-change.v1','courseId',p_course_id,
    'courseRevision',current_revision,'annotationSetVersion',(select annotation_set_version from public.courses where id=p_course_id),
    'requestId',p_request_id,'idempotent',false,'changed',changed,'annotation',private.course_anchored_annotation_item_v1(annotation,p_actor_id,true));
end $function$;

-- A technical reconciliation is read-only. Only the explicit decision command
-- above consumes author intent; legacy correction receipts remain readable.
create or replace function public.confirm_course_observation_correction_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_request_id text,p_confirmations jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
begin
  perform private.require_service_role(); perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if jsonb_typeof(p_confirmations) is distinct from 'array' or jsonb_array_length(p_confirmations)>64 then
    raise exception 'Confirmação inválida.' using errcode='22023'; end if;
  return public.get_course_observation_correction_for_actor_v1(p_actor_id,p_course_id,p_request_id);
end $function$;

do $correction_targets$
declare definition text;
begin
  definition:=pg_get_functiondef('public.commit_course_observation_corrections_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text,text,jsonb)'::regprocedure);
  definition:=replace(definition,'count(distinct value->>''annotationId'')','count(distinct (value->>''annotationId'',value->>''targetKind'',value->>''targetId''))');
  definition:=replace(definition,'or annotation.target_kind<>reference->>''targetKind'' or annotation.target_id<>reference->>''targetId''',
    'or not exists(select 1 from private.course_observation_targets t where t.annotation_id=annotation.id and t.state=''pending''
      and t.target_kind=reference->>''targetKind'' and t.target_id=reference->>''targetId'')');
  definition:=replace(definition,'u->>''entityId''=annotation.target_id','u->>''entityId''=reference->>''targetId''');
  definition:=replace(definition,'case annotation.target_kind when','case reference->>''targetKind'' when');
  definition:=replace(definition,'p_course_id,annotation.target_kind,annotation.target_id','p_course_id,reference->>''targetKind'',reference->>''targetId''');
  definition:=replace(definition,'jsonb_build_object(annotation.id::text,effect_hash)',
    'jsonb_build_object(annotation.id::text||'':''||(reference->>''targetKind'')||'':''||(reference->>''targetId''),effect_hash)');
  definition:=replace(definition,'effects->>(reference->>''annotationId'')',
    'effects->>((reference->>''annotationId'')||'':''||(reference->>''targetKind'')||'':''||(reference->>''targetId''))');
  execute definition;
end $correction_targets$;

revoke all on function private.course_observation_snapshot_v1(uuid,text,text),private.capture_course_observation_basis_v1(uuid,text,text),
  private.course_observation_basis_hash_v1(uuid,text,text),
  private.collect_course_observation_bases_v1(uuid),private.course_anchored_annotation_single_item_v1(private.course_anchored_annotations,uuid,boolean),
  private.course_anchored_annotation_item_v1(private.course_anchored_annotations,uuid,boolean),
  private.execute_course_single_annotation_command_v1(uuid,uuid,bigint,jsonb,text,text,text,boolean),
  private.execute_course_anchored_annotation_command_core_v1(uuid,uuid,bigint,jsonb,text,text,text,boolean) from public,anon,authenticated;

commit;
