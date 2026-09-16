begin;

-- Generic production origin is AI. Provider/model identifiers are untouched.
do $origin$
declare definition text; signature regprocedure; constraint_definition text;
begin
  select pg_get_constraintdef(oid) into constraint_definition from pg_constraint
    where conrelid='private.course_entities'::regclass and conname='course_entities_design_current_v1';
  alter table private.course_entities drop constraint course_entities_design_current_v1;
  update private.course_entities set created_origin=case created_origin when 'gpt' then 'ai' else created_origin end,
    last_revision_origin=case last_revision_origin when 'gpt' then 'ai' else last_revision_origin end;
  execute 'alter table private.course_entities add constraint course_entities_design_current_v1 '||replace(constraint_definition,'''gpt''','''ai''');
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('private','public') and p.prokind='f' and p.prosrc like '%course_entities%' and p.prosrc like '%''gpt''%' loop
    definition:=pg_get_functiondef(signature); execute replace(definition,'''gpt''','''ai''');
  end loop;
end $origin$;

alter table private.course_entities add column editorial_interventions jsonb not null
  default '{"lastOrigin":null,"human":0,"ai":0,"historyComplete":false}'::jsonb;

create function private.next_course_editorial_intervention_v1(p_previous jsonb,p_origin text,p_actor text,p_channel text)
returns jsonb language plpgsql immutable set search_path=pg_catalog as $function$
declare result jsonb:=p_previous;
begin
  if p_origin not in ('human','ai') or p_origin is null then return result; end if;
  if result->>'lastOrigin' is distinct from p_origin then
    result:=jsonb_set(result,array[p_origin],to_jsonb(coalesce((result->>p_origin)::bigint,0)+1));
  end if;
  return result||jsonb_build_object('lastOrigin',p_origin,'actorId',nullif(p_actor,''),'channel',nullif(p_channel,''));
end $function$;

create function private.record_course_editorial_intervention_v1(p_course uuid,p_kind text,p_id text,p_origin text)
returns void language sql security definer set search_path=pg_catalog as $function$
  update private.course_entities set editorial_interventions=private.next_course_editorial_intervention_v1(editorial_interventions,p_origin,
    current_setting('aralearn.editorial_actor',true),current_setting('aralearn.editorial_channel',true)),
    last_revision_origin=case when entity_type='study_unit' then p_origin else last_revision_origin end
  where course_id=p_course and entity_id=p_id and entity_type=case p_kind when 'study_unit' then 'study_unit' when 'microsequence_explanation' then 'microsequence' end
    and p_origin in ('human','ai')
$function$;

create function private.count_course_editorial_intervention_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $function$
declare origin text;
begin
  if new.entity_type not in ('study_unit','microsequence') then return new; end if;
  if tg_op='UPDATE' and (case new.entity_type when 'microsequence' then new.content->'explanation' else new.content end)
    is not distinct from (case old.entity_type when 'microsequence' then old.content->'explanation' else old.content end) then return new; end if;
  if new.entity_type='microsequence' and new.content->'explanation' is null and tg_op='INSERT' then return new; end if;
  origin:=coalesce(nullif(current_setting('aralearn.editorial_origin',true),''),new.last_revision_origin);
  if tg_op='INSERT' then new.editorial_interventions:=new.editorial_interventions||'{"historyComplete":true}'::jsonb; end if;
  new.editorial_interventions:=private.next_course_editorial_intervention_v1(new.editorial_interventions,origin,
    current_setting('aralearn.editorial_actor',true),current_setting('aralearn.editorial_channel',true));
  return new;
end $function$;
create trigger count_course_editorial_intervention_v1 before insert or update of content on private.course_entities
for each row execute function private.count_course_editorial_intervention_v1();

-- Origin is known at the authorized writer boundary, before its inner upserts;
-- updating technical provenance after an upsert must not invent a second edit.
do $writers$
declare signature regprocedure; definition text;
begin
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='commit_course_composition_for_actor_v1'
      and p.proargnames @> array['p_channel','p_application_origin'] loop
    definition:=pg_get_functiondef(signature);
    definition:=replace(definition,'perform private.require_service_role();','perform private.require_service_role();
      perform set_config(''aralearn.editorial_origin'',case when p_application_origin=''manual'' then ''human'' else ''ai'' end,true);
      perform set_config(''aralearn.editorial_actor'',p_actor_id::text,true);
      perform set_config(''aralearn.editorial_channel'',p_channel,true);');
    execute definition;
  end loop;
end $writers$;

alter function private.execute_course_source_command_core_v1(uuid,uuid,bigint,jsonb,text,text)
  rename to execute_course_source_command_without_interventions_v1;
create function private.execute_course_source_command_core_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,p_command jsonb,p_channel text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare result jsonb; targets jsonb; candidate jsonb; v_source_id text; origin text;
begin
  v_source_id:=coalesce(p_command->>'sourceId',p_command#>>'{source,id}',
    (select a.source_id from private.course_source_anchors a where a.course_id=p_course_id and a.anchor_id=p_command->>'anchorId'));
  select coalesce(jsonb_agg(distinct jsonb_build_object('kind',a.target_kind,'id',a.target_id)),'[]'::jsonb) into targets
    from private.course_source_attributions a where a.course_id=p_course_id and a.target_kind in ('study_unit','microsequence_explanation')
      and (p_command->>'type'='set_bibliography_style' or exists(select 1 from private.course_source_attribution_sources l
        where l.course_id=a.course_id and l.attribution_id=a.id and l.source_id=v_source_id));
  if p_command->>'type'='set_target_sources' then targets:=jsonb_build_array(jsonb_build_object('kind',p_command->>'targetKind','id',p_command->>'targetId')); end if;
  result:=private.execute_course_source_command_without_interventions_v1(p_actor_id,p_course_id,p_expected_revision,p_command,p_channel,p_request_id);
  if (result->>'changed')::boolean and not coalesce((result->>'idempotent')::boolean,false) then
    origin:=case p_channel when 'application' then 'human' else 'ai' end;
    perform set_config('aralearn.editorial_actor',p_actor_id::text,true); perform set_config('aralearn.editorial_channel',p_channel,true);
    for candidate in select value from jsonb_array_elements(targets) loop
      perform private.record_course_editorial_intervention_v1(p_course_id,candidate->>'kind',candidate->>'id',origin);
    end loop;
  end if;
  return result;
end $function$;

do $projections$
declare definition text;
begin
  definition:=pg_get_functiondef('private.decorate_course_inspection_page_v2(uuid,bigint,jsonb)'::regprocedure);
  definition:=replace(definition,'''lastRevisionOrigin'',entity.last_revision_origin,',
    '''lastRevisionOrigin'',entity.last_revision_origin,''interventions'',entity.editorial_interventions,');
  execute definition;
  definition:=pg_get_functiondef('public.get_owned_course_authoring_analytics_for_actor_v4(uuid,uuid,bigint,jsonb)'::regprocedure);
  definition:=replace(definition,'unit.created_origin,unit.last_revision_origin,','unit.created_origin,unit.last_revision_origin,unit.editorial_interventions,');
  definition:=replace(definition,'''studyUnitsByOrigin'',coalesce(',
    '''interventions'',jsonb_build_object(''human'',coalesce((select sum((editorial_interventions->>''human'')::bigint) from scope_units),0),
      ''ai'',coalesce((select sum((editorial_interventions->>''ai'')::bigint) from scope_units),0),
      ''historyComplete'',coalesce((select bool_and((editorial_interventions->>''historyComplete'')::boolean) from scope_units),true)),
     ''studyUnitsByOrigin'',coalesce(');
  execute definition;
end $projections$;

-- Retained comparison bases reference existing bytes. They never clone files.
-- Inventory is independent from snapshot/hash to avoid recursion and to bind a
-- new capture to PDFs attached after an earlier note, without changing its base.
create function private.course_observation_files_v1(p_course_id uuid,p_kind text,p_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  with target as (
    select case p_kind when 'microsequence_explanation' then content->'explanation' else content end content
      from private.course_entities where course_id=p_course_id and entity_id=p_id
        and entity_type=case p_kind when 'study_unit' then 'study_unit' when 'microsequence_explanation' then 'microsequence' end
  ), files as (
    select 'course-source-pdfs' bucket,a.storage_path path,a.content_hash hash,a.media_type
      from private.course_source_attachments a where a.course_id=p_course_id and a.status='active'
        and exists(select 1 from private.course_source_attributions attribution
          join private.course_source_attribution_sources link on link.course_id=attribution.course_id and link.attribution_id=attribution.id
          where attribution.course_id=p_course_id and attribution.target_kind=p_kind and attribution.target_id=p_id and link.source_id=a.source_id)
    union select 'course-media',m.storage_path,m.content_hash,m.media_type from private.course_media m,target
      where m.course_id=p_course_id and m.status='active' and m.content_hash in (select private.course_content_media_hashes_v1(target.content))
  ) select coalesce(jsonb_agg(to_jsonb(files) order by bucket,path,hash,media_type),'[]'::jsonb) from files
$function$;

alter function private.course_observation_basis_hash_v1(uuid,text,text) rename to course_observation_text_basis_hash_v1;
create function private.course_observation_basis_hash_v1(p_course uuid,p_kind text,p_id text)
returns text language sql stable security definer set search_path=pg_catalog as $function$
  select case when basis.hash is not null then private.course_source_json_hash_v1(jsonb_build_object(
    'contentBasis',basis.hash,'files',private.course_observation_files_v1(p_course,p_kind,p_id))) end
  from (select private.course_observation_text_basis_hash_v1(p_course,p_kind,p_id) hash) basis
$function$;

alter function private.course_observation_snapshot_v1(uuid,text,text) rename to course_observation_text_snapshot_v1;
create function private.course_observation_snapshot_v1(p_course_id uuid,p_kind text,p_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  select case when base.value is not null then base.value||jsonb_build_object('files',private.course_observation_files_v1(p_course_id,p_kind,p_id)) end
    from (select private.course_observation_text_snapshot_v1(p_course_id,p_kind,p_id) value) base
$function$;

alter function private.course_file_is_referenced_v1(text,text) rename to course_current_file_is_referenced_v1;
create function private.course_file_is_referenced_v1(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path=pg_catalog as $function$
  select private.course_current_file_is_referenced_v1(p_bucket,p_path) or exists(select 1 from private.course_observation_bases b
    cross join lateral jsonb_array_elements(coalesce(b.snapshot->'files','[]'::jsonb)) f where f->>'bucket'=p_bucket and f->>'path'=p_path)
$function$;

-- A PDF retained only by a comparison base must never be handed to Storage for
-- deletion. Keep the existing cancellation of protected intents: the collector
-- below schedules a fresh intent when the last reference is released.
do $retained_pdf_deletion$
declare signature regprocedure; definition text; previous_guard text; next_guard text;
begin
  for signature in select unnest(array[
    'public.claim_course_source_pdf_delete_for_actor_v1(uuid,uuid,text)'::regprocedure,
    'public.complete_course_source_pdf_delete_for_actor_v1(uuid,uuid,text,text)'::regprocedure
  ]) loop
    definition:=replace(pg_get_functiondef(signature),chr(13),'');
    previous_guard:='exists(select 1 from private.course_source_attachments attachment
    where attachment.storage_path='||case when signature::text like '%claim_%' then 'v_intent.storage_path' else 'p_storage_path' end||' and attachment.status=''active'')';
    next_guard:='private.course_file_is_referenced_v1(''course-source-pdfs'','||case when signature::text like '%claim_%' then 'v_intent.storage_path' else 'p_storage_path' end||')';
    if strpos(definition,previous_guard)=0 then raise exception 'O guard de remoção de PDF mudou: %.',signature; end if;
    definition:=replace(definition,previous_guard,next_guard);
    definition:=replace(definition,'O PDF voltou a possuir vínculo ativo.','O PDF ainda possui referência vigente ou retida para revisão.');
    execute definition;
  end loop;
end $retained_pdf_deletion$;

create or replace function private.collect_course_observation_bases_v1(p_course uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $function$
declare snapshot jsonb; file jsonb; owner_id uuid;
begin
  select c.owner_id into owner_id from public.courses c where c.id=p_course;
  for snapshot in delete from private.course_observation_bases b where b.course_id=p_course and not exists (
    select 1 from private.course_observation_targets t where t.course_id=b.course_id and t.target_kind=b.target_kind
      and t.target_id=b.target_id and t.basis_hash=b.basis_hash) returning b.snapshot loop
    for file in select value from jsonb_array_elements(coalesce(snapshot->'files','[]'::jsonb)) loop
      if private.course_file_is_referenced_v1(file->>'bucket',file->>'path') then continue; end if;
      if file->>'bucket'='course-media' then
        insert into private.course_media_delete_intents(course_id,content_hash,media_type,storage_path)
          values(p_course,file->>'hash',file->>'media_type',file->>'path') on conflict do nothing;
      elsif file->>'bucket'='course-source-pdfs' then
        insert into private.course_source_pdf_delete_intents(actor_id,request_id,course_id,source_id,content_hash,storage_path)
          values(owner_id,'observation:'||md5(file->>'path'),p_course,'observation-base',file->>'hash',file->>'path') on conflict do nothing;
      end if;
    end loop;
  end loop;
end $function$;

revoke all on function private.next_course_editorial_intervention_v1(jsonb,text,text,text),
  private.record_course_editorial_intervention_v1(uuid,text,text,text),private.count_course_editorial_intervention_v1(),
  private.execute_course_source_command_without_interventions_v1(uuid,uuid,bigint,jsonb,text,text),
  private.execute_course_source_command_core_v1(uuid,uuid,bigint,jsonb,text,text),
  private.course_observation_files_v1(uuid,text,text),private.course_observation_text_basis_hash_v1(uuid,text,text),
  private.course_observation_basis_hash_v1(uuid,text,text),
  private.course_observation_text_snapshot_v1(uuid,text,text),private.course_observation_snapshot_v1(uuid,text,text),
  private.course_current_file_is_referenced_v1(text,text),private.course_file_is_referenced_v1(text,text),
  private.collect_course_observation_bases_v1(uuid) from public,anon,authenticated;

commit;
