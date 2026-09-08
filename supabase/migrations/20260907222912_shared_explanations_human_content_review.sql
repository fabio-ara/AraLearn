begin;

-- A microssequência corrente possui o apoio. A decisão humana nunca integra
-- o JSON importável e o acervo anterior permanece sem revisão inventada.
alter table private.course_entities add column content_review jsonb;
alter table private.course_entities add constraint course_content_review_v1 check (
  content_review is null or entity_type='microsequence' and (
    content_review='{}'::jsonb or jsonb_typeof(content_review)='object'
    and content_review ?& array['approvedBasisHash','approvedAt','approvedBy']
    and content_review-array['approvedBasisHash','approvedAt','approvedBy']='{}'::jsonb
    and content_review->>'approvedBasisHash' ~ '^[a-f0-9]{64}$'
    and nullif(content_review->>'approvedAt','') is not null
    and nullif(content_review->>'approvedBy','') is not null
  )
);

create function private.course_content_media_hashes_v1(p_content jsonb) returns setof text
language sql immutable set search_path=pg_catalog as $function$
  select distinct t#>>'{media,contentHash}'
  from jsonb_array_elements(coalesce(p_content->'content','[]'::jsonb)||coalesce(p_content->'feedback','[]'::jsonb)) i
  cross join lateral jsonb_array_elements(case when i->>'package'='aralearn.resource.audio' then i#>'{data,tracks}' else '[]'::jsonb end) t
  where t->>'kind'='file' and t#>>'{media,contentHash}' is not null
$function$;

create function private.course_microsequence_basis_hash_v1(p_course_id uuid,p_microsequence_id text)
returns text language sql stable security definer set search_path=pg_catalog,private as $function$
  with recursive scope(id) as (
    select p_microsequence_id
    union
    select dependency.value from scope
    join private.course_entities micro on micro.course_id=p_course_id
      and micro.entity_type='microsequence' and micro.entity_id=scope.id
    cross join lateral jsonb_array_elements_text(coalesce(micro.content->'dependsOn','[]'::jsonb)) dependency(value)
  ), entities as materialized (
    select e.* from private.course_entities e where e.course_id=p_course_id
      and (e.entity_type='microsequence' and e.entity_id in(select id from scope)
        or e.entity_type='study_unit' and e.parent_id in(select id from scope))
  ), targets as materialized (
    select 'study_unit' kind,entity_id id from entities where entity_type='study_unit'
    union select 'microsequence_explanation',id from scope
    union select 'plan_item',a.plan_item_id::text from private.course_design_target_plan_items a
      where a.course_id=p_course_id and a.didactic_microsequence_id in(select id from scope)
  ), attributions as materialized (
    select a.* from private.course_source_attributions a join targets t
      on t.kind=a.target_kind and t.id=a.target_id where a.course_id=p_course_id
  ), links as materialized (
    select l.* from private.course_source_attribution_sources l
      where l.course_id=p_course_id and l.attribution_id in(select id from attributions)
  ), anchors as materialized (
    select a.* from private.course_source_anchors a where a.course_id=p_course_id
      and a.anchor_id in(select l.anchor_id from private.course_source_attribution_anchors l
        where l.course_id=p_course_id and l.attribution_id in(select id from attributions))
  ) select private.course_source_json_hash_v1(jsonb_build_object(
    'microsequenceId',p_microsequence_id,
    'entities',coalesce((select jsonb_agg(jsonb_build_object('type',entity_type,'id',entity_id,
      'parent',parent_id,'position',position,'content',content,
      'designSnapshot',design_snapshot-'appliedAt','designApplication',design_application)
      order by entity_type,parent_id,position,entity_id) from entities),'[]'::jsonb),
    'planItems',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'kind',i.item_kind,
      'statement',i.statement,'description',i.description) order by i.id)
      from private.course_instructional_plan_items i where i.course_id=p_course_id
        and i.id::text in(select id from targets where kind='plan_item')),'[]'::jsonb),
    'attributions',coalesce((select jsonb_agg(jsonb_build_object('kind',target_kind,'id',target_id,
      'links',private.course_source_links_v1(p_course_id,id)) order by target_kind,target_id)
      from attributions),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(s)-array['course_id','revision','created_at','updated_at'] order by s.source_id)
      from private.course_sources s where s.course_id=p_course_id and s.source_id in(select source_id from links)),'[]'::jsonb),
    'anchors',coalesce((select jsonb_agg(to_jsonb(a)-array['course_id','revision','source_revision','created_at','updated_at'] order by a.anchor_id)
      from anchors a),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object('hash',m.content_hash,'status',m.status,'byteSize',m.byte_size,'mediaType',m.media_type) order by m.content_hash) from private.course_media m where m.course_id=p_course_id and exists(select 1 from entities e cross join lateral private.course_content_media_hashes_v1(case when e.entity_type='microsequence' then e.content->'explanation' else e.content end) h where h=m.content_hash)), '[]'::jsonb),
    'files',coalesce((select jsonb_agg(jsonb_build_object('sourceId',f.source_id,'hash',f.content_hash,
      'status',f.status,'access',f.public_file_access) order by f.source_id,f.content_hash)
      from private.course_source_attachments f where f.course_id=p_course_id
      and exists(select 1 from anchors a where a.source_id=f.source_id
        and a.content_hash=f.content_hash)),'[]'::jsonb)
  ))
$function$;

create function private.course_microsequence_review_v1(p_course_id uuid,p_microsequence_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  select jsonb_strip_nulls(jsonb_build_object('state',case
    when content_review is null then 'unregistered'
    when not(content_review ? 'approvedBasisHash') then 'draft'
    when content_review->>'approvedBasisHash'=private.course_microsequence_basis_hash_v1(p_course_id,p_microsequence_id)
      then 'current' else 'stale' end,'approvedAt',content_review->>'approvedAt'))
  from private.course_entities where course_id=p_course_id
    and entity_type='microsequence' and entity_id=p_microsequence_id
$function$;

create function private.course_entity_readable_v1(p_course_id uuid,p_actor_id uuid,p_entity_type text,p_entity_id text,p_parent_id text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $function$
  select exists(select 1 from public.courses where id=p_course_id and owner_id=p_actor_id)
    or p_entity_type not in('study_unit','microsequence')
    or coalesce(private.course_microsequence_review_v1(p_course_id,
      case when p_entity_type='microsequence' then p_entity_id else p_parent_id end)->>'state'
        in('unregistered','current'),false)
$function$;

create or replace function private.can_copy_course_v1(p_course_id uuid,p_actor_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,private,public as $function$
  select p_actor_id is not null and exists(select 1 from public.person_profiles where user_id=p_actor_id)
    and exists(select 1 from public.courses c where c.id=p_course_id and (c.owner_id=p_actor_id
      or exists(select 1 from public.course_access a where a.course_id=c.id and a.user_id=p_actor_id and a.can_copy)
        and not exists(select 1 from private.course_entities e where e.course_id=c.id and e.entity_type='microsequence'
          and not private.course_entity_readable_v1(c.id,p_actor_id,e.entity_type,e.entity_id,e.parent_id))))
$function$;

create function private.mark_course_content_review_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,private as $function$
begin
  if tg_op<>'DELETE' and new.content ?| array['contentReview','content_review','approvedBy','approvedAt','approvedBasisHash'] then
    raise exception 'Revisão não pertence ao conteúdo editável.' using errcode='42501';
  end if;
  if new.entity_type='microsequence' and (
    new.content ? 'explanation' and not private.valid_course_explanation_v1(new.content->'explanation')
    or new.content ? 'explanationPlan' and not private.valid_course_explanation_plan_v1(new.content->'explanationPlan')
  ) then raise exception 'Explicação ou proposta inválida.' using errcode='22023'; end if;
  if tg_op='INSERT' then
    if new.content_review is not null then raise exception 'Revisão não pode ser importada.' using errcode='42501'; end if;
    if new.entity_type='microsequence' then new.content_review:='{}'::jsonb; end if;
  elsif tg_op='UPDATE' then
    if new.content_review is distinct from old.content_review
      and current_setting('aralearn.content_review_write',true) is distinct from 'approved-command' then
      raise exception 'Metadado de revisão protegido.' using errcode='42501';
    end if;
    if row(new.content,new.parent_id,new.position,new.design_application,new.design_snapshot-'appliedAt')
      is not distinct from row(old.content,old.parent_id,old.position,old.design_application,old.design_snapshot-'appliedAt') then return new; end if;
    if new.entity_type='microsequence' then new.content_review:=coalesce(old.content_review,'{}'::jsonb); end if;
  end if;
  return new;
end $function$;
create trigger course_content_review_guard before insert or update on private.course_entities
  for each row execute function private.mark_course_content_review_v1();

create function private.invalidate_course_content_review_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,private as $function$
declare v_id text; v_old_id text; v_course uuid; v_previous_setting text;
begin
  if tg_op='UPDATE' and row(new.content,new.parent_id,new.position,new.design_application,new.design_snapshot-'appliedAt')
    is not distinct from row(old.content,old.parent_id,old.position,old.design_application,old.design_snapshot-'appliedAt') then return new; end if;
  if tg_op='DELETE' then v_course:=old.course_id; else v_course:=new.course_id; end if;
  v_id:=case when tg_op='DELETE' then case when old.entity_type='microsequence' then old.entity_id when old.entity_type='study_unit' then old.parent_id end
    else case when new.entity_type='microsequence' then new.entity_id when new.entity_type='study_unit' then new.parent_id end end;
  if v_id is not null then
    if tg_op='UPDATE' and old.entity_type='study_unit' then v_old_id:=old.parent_id; end if;
    v_previous_setting:=coalesce(current_setting('aralearn.content_review_write',true),'');
    perform set_config('aralearn.content_review_write','approved-command',true);
    with recursive affected(id) as (
      select unnest(array[v_id,v_old_id]) union select e.entity_id from private.course_entities e join affected a
        on e.content->'dependsOn' ? a.id where e.course_id=v_course and e.entity_type='microsequence'
    ) update private.course_entities set content_review='{}'::jsonb
      where course_id=v_course and entity_type='microsequence' and entity_id in(select id from affected)
      and content_review is null;
    perform set_config('aralearn.content_review_write',v_previous_setting,true);
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $function$;
create trigger course_content_review_invalidate after insert or update or delete on private.course_entities
  for each row execute function private.invalidate_course_content_review_v1();

create function private.require_course_review_session_v1(p_course_id uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,auth,public,private as $function$
declare v_actor uuid:=auth.uid(); v_session text:=auth.jwt()->>'session_id';
begin
  if v_actor is null or auth.jwt()->>'role' is distinct from 'authenticated'
    or nullif(auth.jwt()->>'client_id','') is not null
    or v_session is null or v_session !~ '^[a-f0-9-]{36}$'
    or not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
      where s.id::text=v_session and s.user_id=v_actor and s.oauth_client_id is null
        and (s.not_after is null or s.not_after>statement_timestamp())
        and u.deleted_at is null and not u.is_anonymous
        and (u.banned_until is null or u.banned_until<statement_timestamp()))
    or not exists(select 1 from public.courses where id=p_course_id and owner_id=v_actor) then
    raise exception 'A revisão exige sessão do aplicativo da pessoa proprietária.' using errcode='42501';
  end if;
  return v_actor;
end $function$;

create function public.get_course_microsequence_review_v1(p_course_id uuid,p_microsequence_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $function$
begin
  perform private.require_course_review_session_v1(p_course_id);
  if private.course_microsequence_review_v1(p_course_id,p_microsequence_id) is null then
    raise exception 'Microssequência inexistente.' using errcode='PT404'; end if;
  return jsonb_build_object('courseId',p_course_id,'microsequenceId',p_microsequence_id,
    'basisHash',private.course_microsequence_basis_hash_v1(p_course_id,p_microsequence_id),
    'contentReview',private.course_microsequence_review_v1(p_course_id,p_microsequence_id));
end $function$;

create function public.approve_course_microsequence_content_v1(p_course_id uuid,p_microsequence_id text,p_expected_basis_hash text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare v_actor uuid; v_hash text; v_basis text; v_receipt private.course_change_receipts%rowtype;
  v_micro private.course_entities%rowtype; v_revision bigint; v_result jsonb;
begin
  v_actor:=private.require_course_review_session_v1(p_course_id);
  if p_expected_basis_hash is null or p_expected_basis_hash !~ '^[a-f0-9]{64}$'
    or p_request_id is null or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Decisão de revisão inválida.' using errcode='22023'; end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('microsequenceId',p_microsequence_id,'basisHash',p_expected_basis_hash));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||v_actor::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=v_actor and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'approve_microsequence_content' or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'Identidade de decisão incompatível.' using errcode='23514'; end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform 1 from public.courses where id=p_course_id for update;
  select * into v_micro from private.course_entities where course_id=p_course_id
    and entity_type='microsequence' and entity_id=p_microsequence_id for update;
  if not found then raise exception 'Microssequência inexistente.' using errcode='PT404'; end if;
  v_basis:=private.course_microsequence_basis_hash_v1(p_course_id,p_microsequence_id);
  if v_basis<>p_expected_basis_hash then
    raise exception 'O conjunto inspecionado mudou; releia antes de aprovar.' using errcode='PT409'; end if;
  if not private.valid_course_explanation_v1(v_micro.content->'explanation')
    or not exists(select 1 from private.course_entities where course_id=p_course_id
      and entity_type='study_unit' and parent_id=p_microsequence_id)
    or exists(select 1 from private.course_entities where course_id=p_course_id
      and entity_type='study_unit' and parent_id=p_microsequence_id
      and (jsonb_typeof(content->'content') is distinct from 'array' or jsonb_array_length(content->'content')=0)) then
    raise exception 'Unidades e Explicação precisam estar produzidas antes da revisão.' using errcode='23514'; end if;
  perform set_config('aralearn.content_review_write','approved-command',true);
  update private.course_entities set content_review=jsonb_build_object('approvedBasisHash',v_basis,
    'approvedAt',statement_timestamp(),'approvedBy',v_actor) where course_id=p_course_id
      and entity_type='microsequence' and entity_id=p_microsequence_id;
  perform set_config('aralearn.content_review_write','',true);
  update public.courses set revision=revision+1,updated_at=clock_timestamp()
    where id=p_course_id returning revision into v_revision;
  v_result:=jsonb_build_object('courseId',p_course_id,'courseRevision',v_revision,'microsequenceId',p_microsequence_id,
    'basisHash',v_basis,'contentReview',private.course_microsequence_review_v1(p_course_id,p_microsequence_id),'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(v_actor,p_request_id,'approve_microsequence_content',p_course_id,v_hash,v_result);
  return v_result;
end $function$;

do $receipt$
declare v_check text;
begin
  select pg_get_expr(conbin,conrelid) into strict v_check from pg_constraint
    where conrelid='private.course_change_receipts'::regclass and conname='course_change_receipts_operation_v15';
  alter table private.course_change_receipts drop constraint course_change_receipts_operation_v15;
  execute format('alter table private.course_change_receipts add constraint course_change_receipts_operation_v16 check((%s) or operation=''approve_microsequence_content'')',v_check);
end $receipt$;

revoke all on function private.course_microsequence_basis_hash_v1(uuid,text),
  private.course_microsequence_review_v1(uuid,text),private.course_entity_readable_v1(uuid,uuid,text,text,text),
  private.mark_course_content_review_v1(),private.invalidate_course_content_review_v1(),private.require_course_review_session_v1(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.get_course_microsequence_review_v1(uuid,text),
  public.approve_course_microsequence_content_v1(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_course_microsequence_review_v1(uuid,text),
  public.approve_course_microsequence_content_v1(uuid,text,text,text) to authenticated;

-- O escritor do lote recebe uma única Explicação por MS e compartilha a
-- transação/recibo existentes. A assinatura substituída é retirada no corte.
create function private.save_course_part_explanations_v1(p_course_id uuid,p_units jsonb,p_explanations jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,private as $function$
declare v_item jsonb; v_micro private.course_entities%rowtype; v_changed boolean:=false; v_application jsonb;
begin
  if jsonb_typeof(p_explanations) is distinct from 'array' or jsonb_array_length(p_explanations) not between 1 and 32
    or octet_length(p_explanations::text)>1572864 then
    raise exception 'Explicações do lote inválidas.' using errcode='22023'; end if;
  if (select count(*)<>count(distinct value->>'microsequenceId') from jsonb_array_elements(p_explanations))
    or exists(select 1 from jsonb_array_elements(p_explanations) e where not exists(
      select 1 from jsonb_array_elements(p_units) u where u->>'didacticMicrosequenceId'=e->>'microsequenceId'))
    or exists(select 1 from jsonb_array_elements(p_units) u where not exists(
      select 1 from jsonb_array_elements(p_explanations) e where e->>'microsequenceId'=u->>'didacticMicrosequenceId')) then
    raise exception 'Cada microssequência produzida exige exatamente uma Explicação.' using errcode='23514'; end if;
  for v_item in select value from jsonb_array_elements(p_explanations) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or v_item-array['microsequenceId','content','sourceLinks']<>'{}'::jsonb
      or jsonb_typeof(v_item->'content') is distinct from 'object'
      or (v_item->'content')-array['title','content']<>'{}'::jsonb
      or jsonb_typeof(v_item#>'{content,title}') is distinct from 'string'
      or nullif(btrim(v_item#>>'{content,title}'),'') is null
      or jsonb_typeof(v_item#>'{content,content}') is distinct from 'array'
      or jsonb_array_length(v_item#>'{content,content}')=0
      or not private.valid_course_component_refs_in_content_v1(v_item->'content')
      or exists(select 1 from jsonb_array_elements(v_item#>'{content,content}') b
        where jsonb_typeof(b) is distinct from 'object' or not(b ?& array['id','package','version','data'])
          or b-array['id','package','version','data']<>'{}'::jsonb
          or nullif(b->>'id','') is null
          or not exists(select 1 from jsonb_array_elements(private.course_component_catalog_v1()->'options') o
            where o->>'ref'=(b->>'package')||'@'||(b->>'version') and b->>'package' like 'aralearn.resource.%'))
      or (select count(*)<>count(distinct b->>'id') from jsonb_array_elements(v_item#>'{content,content}') b) then
      raise exception 'Conteúdo de Explicação inválido.' using errcode='22023'; end if;
    select * into v_micro from private.course_entities where course_id=p_course_id
      and entity_type='microsequence' and entity_id=v_item->>'microsequenceId' for update;
    if not found then raise exception 'Microssequência de Explicação inexistente.' using errcode='PT404'; end if;
    if v_micro.content->'explanation' is distinct from v_item->'content' then
      update private.course_entities set content=jsonb_set(content,'{explanation}',v_item->'content',true),
        version=version+1,updated_at=clock_timestamp()
        where course_id=p_course_id and entity_type='microsequence' and entity_id=v_micro.entity_id
        returning * into v_micro;
      v_changed:=true;
    end if;
    if v_item ? 'sourceLinks' then
      v_application:=private.apply_course_source_attribution_v2(p_course_id,'microsequence_explanation',
        v_micro.entity_id,v_micro.version,v_item->'sourceLinks');
      v_changed:=v_changed or coalesce((v_application->>'changed')::boolean,false);
    end if;
  end loop;
  return v_changed;
end $function$;
revoke all on function private.save_course_part_explanations_v1(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

do $materializer$
declare v_definition text;
begin
  select replace(pg_get_functiondef('public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  if position('p_request_hash text)' in v_definition)=0
    or position('v_extra_changed:=v_plan_changed or v_application_extension_changed;' in v_definition)=0 then
    raise exception 'Materializador precursor divergiu.'; end if;
  v_definition:=replace(v_definition,'p_request_hash text)','p_request_hash text, p_explanations jsonb)');
  v_definition:=replace(v_definition,'v_extra_changed:=v_plan_changed or v_application_extension_changed;',
    'v_extra_changed:=private.save_course_part_explanations_v1(p_course_id,p_units,p_explanations) or v_plan_changed or v_application_extension_changed;');
  execute v_definition;
  drop function public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text);
end $materializer$;
revoke all on function public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb) to service_role;

-- Paginação conserva seus cursores. O leitor recebe marcador sem o texto novo;
-- o proprietário recebe o conjunto inteiro para a inspeção autoral.
do $projection$
declare v_definition text;
begin
  select replace(pg_get_functiondef('private.list_course_entities_for_actor_v1(uuid,uuid,bigint,integer,text,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  if position('''content'', page.content,' in v_definition)=0 or position('''items'', v_items,' in v_definition)=0 then
    raise exception 'Projeção de entidades precursora divergiu.'; end if;
  v_definition:=replace(v_definition,'where entity.course_id = p_course_id',
    'where entity.course_id = p_course_id and (entity.entity_type<>''study_unit'' or private.course_entity_readable_v1(p_course_id,p_actor_id,entity.entity_type,entity.entity_id,entity.parent_id))');
  v_definition:=replace(v_definition,'''content'', page.content,',
    '''content'', case when private.course_entity_readable_v1(p_course_id,p_actor_id,page.entity_type,page.entity_id,page.parent_id) then page.content else jsonb_build_object(''title'',''Aguardando revisão da autoria'') end,
      ''contentReview'',case when page.entity_type=''microsequence'' then private.course_microsequence_review_v1(p_course_id,page.entity_id) end,');
  v_definition:=replace(v_definition,'''items'', v_items,',
    '''items'', v_items,
    ''pendingReviewMicrosequenceIds'',coalesce((select jsonb_agg(e.entity_id order by e.entity_id) from private.course_entities e where e.course_id=p_course_id and e.entity_type=''microsequence'' and not private.course_entity_readable_v1(p_course_id,p_actor_id,e.entity_type,e.entity_id,e.parent_id)),''[]''::jsonb),');
  execute v_definition;
  select replace(pg_get_functiondef('private.get_course_for_actor_v1(uuid,uuid,boolean)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'microsequence.content->>''title''',
    'case when private.course_entity_readable_v1(p_course_id,p_actor_id,''microsequence'',microsequence.entity_id,null) then microsequence.content->>''title'' else ''Aguardando revisão da autoria'' end');
  v_definition:=replace(v_definition,'microsequence.content->>''goal''',
    'case when private.course_entity_readable_v1(p_course_id,p_actor_id,''microsequence'',microsequence.entity_id,null) then microsequence.content->>''goal'' end');
  v_definition:=replace(v_definition,'''studyUnitCount'', (',
    '''contentReview'',private.course_microsequence_review_v1(p_course_id,microsequence.entity_id),''studyUnitCount'', (');
  execute v_definition;
end $projection$;

create function private.valid_course_explanation_v1(p_explanation jsonb) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,private as $function$
begin
  if jsonb_typeof(p_explanation) is distinct from 'object'
    or p_explanation-array['title','content']<>'{}'::jsonb
    or jsonb_typeof(p_explanation->'title') is distinct from 'string'
    or char_length(btrim(p_explanation->>'title')) not between 1 and 300
    or jsonb_typeof(p_explanation->'content') is distinct from 'array' then return false; end if;
  return jsonb_array_length(p_explanation->'content')>0 and octet_length(p_explanation::text)<=1572864
    and private.valid_course_component_refs_in_content_v1(p_explanation)
    and not exists(select 1 from jsonb_array_elements(p_explanation->'content') b
      where jsonb_typeof(b) is distinct from 'object' or not(b ?& array['id','package','version','data'])
        or b-array['id','package','version','data']<>'{}'::jsonb
        or jsonb_typeof(b->'data') is distinct from 'object'
        or jsonb_typeof(b->'id') is distinct from 'string' or nullif(btrim(b->>'id'),'') is null
        or b->>'package' not like 'aralearn.resource.%')
    and (select count(*)=count(distinct b->>'id') from jsonb_array_elements(p_explanation->'content') b);
end $function$;
revoke all on function private.valid_course_explanation_v1(jsonb) from public,anon,authenticated,service_role;

create function private.valid_course_explanation_plan_v1(p_plan jsonb) returns boolean
language sql immutable set search_path=pg_catalog as $function$
  select coalesce(jsonb_typeof(p_plan)='object' and p_plan ?& array['purpose','prerequisites','relations','sourceIds']
    and p_plan-array['purpose','prerequisites','relations','sourceIds']='{}'::jsonb
    and jsonb_typeof(p_plan->'purpose')='string' and char_length(btrim(p_plan->>'purpose')) between 1 and 2000
    and not exists(select 1 from unnest(array['prerequisites','relations','sourceIds']) key
      where jsonb_typeof(p_plan->key) is distinct from 'array')
    and not exists(select 1 from unnest(array['prerequisites','relations','sourceIds']) key
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p_plan->key)='array' then p_plan->key else '[]'::jsonb end) value
      where jsonb_typeof(value) is distinct from 'string' or nullif(btrim(value#>>'{}'),'') is null),false)
$function$;
revoke all on function private.valid_course_explanation_plan_v1(jsonb) from public,anon,authenticated,service_role;
do $map$
declare v_definition text; v_name regprocedure;
begin
  foreach v_name in array array['private.current_course_curricular_map_v1(uuid)'::regprocedure,
    'private.get_course_instructional_plan_for_actor_v3(uuid,uuid)'::regprocedure] loop
    select replace(pg_get_functiondef(v_name),E'\r\n',E'\n') into v_definition;
    v_definition:=replace(v_definition,'''objective'',coalesce(microsequence.content->>''goal'',''''),',
      '''objective'',coalesce(microsequence.content->>''goal'',''''),''explanationPlan'',microsequence.content->''explanationPlan'',');
    v_definition:=replace(v_definition,'''goal'',coalesce(microsequence.content->>''goal'',''''),',
      '''goal'',coalesce(microsequence.content->>''goal'',''''),''explanationPlan'',microsequence.content->''explanationPlan'',''explanation'',microsequence.content->''explanation'',''contentReview'',private.course_microsequence_review_v1(p_course_id,microsequence.entity_id),');
    execute v_definition;
  end loop;
  select replace(pg_get_functiondef('private.valid_course_curricular_map_shape_v1(jsonb)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'''dependencyMicrosequenceIds''-''scopeItemIds''<>',
    '''dependencyMicrosequenceIds''-''scopeItemIds''-''explanationPlan''<>');
  v_definition:=replace(v_definition,'or jsonb_typeof(microsequence.value->''microsequenceId'')<>''string''',
    'or not private.valid_course_explanation_plan_v1(microsequence.value->''explanationPlan'')
        or jsonb_typeof(microsequence.value->''microsequenceId'')<>''string''');
  execute v_definition;
  select replace(pg_get_functiondef('public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'''scopeItemIds'',microsequence.value->''scopeItemIds'',',
    '''scopeItemIds'',microsequence.value->''scopeItemIds'',''explanationPlan'',microsequence.value->''explanationPlan'',');
  v_definition:=replace(v_definition,'''scopeItemIds'',excluded.content->''scopeItemIds'',',
    '''scopeItemIds'',excluded.content->''scopeItemIds'',''explanationPlan'',excluded.content->''explanationPlan'',');
  v_definition:=replace(v_definition,'course_entities.content->''scopeItemIds'') is distinct from row(',
    'course_entities.content->''scopeItemIds'',course_entities.content->''explanationPlan'') is distinct from row(');
  v_definition:=replace(v_definition,'excluded.content->''dependsOn'',excluded.content->''scopeItemIds''',
    'excluded.content->''dependsOn'',excluded.content->''scopeItemIds'',excluded.content->''explanationPlan''');
  execute v_definition;
end $map$;

create function private.valid_course_composition_source_applications_v1(p_upserts jsonb,p_applications jsonb)
returns boolean language sql stable security definer set search_path=pg_catalog,private as $function$
  select coalesce(jsonb_typeof(p_upserts)='array' and jsonb_typeof(p_applications)='array'
    and jsonb_array_length(p_applications)<=96 and octet_length(p_applications::text)<=196608
    and not exists(select 1 from jsonb_array_elements(p_applications) a where
      jsonb_typeof(a) is distinct from 'object' or not private.valid_course_source_links_shape_v2(a->'sourceLinks')
      or not(case when a ? 'studyUnitId' then a-array['studyUnitId','sourceLinks']='{}'::jsonb
        and jsonb_typeof(a->'studyUnitId')='string' and char_length(a->>'studyUnitId') between 1 and 240
        else a-array['targetKind','targetId','sourceLinks']='{}'::jsonb
          and a->>'targetKind'='microsequence_explanation' and jsonb_typeof(a->'targetId')='string'
          and char_length(a->>'targetId') between 1 and 240 end)
      or not exists(select 1 from jsonb_array_elements(p_upserts) u
        where u->>'entityType'=case when a ? 'studyUnitId' then 'study_unit' else 'microsequence' end
          and u->>'entityId'=coalesce(a->>'studyUnitId',a->>'targetId')))
    and (select count(*)=count(distinct (coalesce(a->>'targetKind','study_unit'),coalesce(a->>'studyUnitId',a->>'targetId')))
      from jsonb_array_elements(p_applications) a)
    and not exists(select 1 from jsonb_array_elements(p_upserts) u where u->>'entityType'='study_unit'
      and (u->'content' ? 'sources' or not exists(select 1 from jsonb_array_elements(p_applications) a where a->>'studyUnitId'=u->>'entityId'))),false)
$function$;
revoke all on function private.valid_course_composition_source_applications_v1(jsonb,jsonb) from public,anon,authenticated,service_role;
do $composition$
declare v_definition text; v_start integer; v_end integer;
begin
  select replace(pg_get_functiondef('public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text,jsonb)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_start:=position('  if p_expected_revision is null' in v_definition);
  v_end:=position('  v_hash :=' in v_definition);
  if v_start=0 or v_end<=v_start then raise exception 'Composição precursora divergiu.'; end if;
  v_definition:=substring(v_definition,1,v_start-1)||$replacement$
  if p_expected_revision is null or p_expected_revision<1 or p_request_id is null
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' or jsonb_typeof(p_deletes) is distinct from 'array'
    or not private.valid_course_composition_source_applications_v1(p_upserts,p_source_attribution_applications) then
    raise exception 'Composição exige proveniência explícita dos alvos.' using errcode='22023'; end if;
$replacement$||substring(v_definition,v_end);
  v_definition:=replace(v_definition,'v_application.value->>''studyUnitId''',
    'coalesce(v_application.value->>''studyUnitId'',v_application.value->>''targetId'')');
  v_definition:=replace(v_definition,'v_application.value#>>''{application,studyUnitId}''',
    'coalesce(v_application.value#>>''{application,studyUnitId}'',v_application.value#>>''{application,targetId}'')');
  v_definition:=replace(v_definition,'where upsert_item.value->>''entityType'' = ''study_unit''',
    'where upsert_item.value->>''entityType'' = case when v_application.value ? ''studyUnitId'' then ''study_unit'' else ''microsequence'' end');
  v_definition:=replace(v_definition,'and entity.entity_type = ''study_unit''',
    'and entity.entity_type = case when v_application.value ? ''studyUnitId'' then ''study_unit'' else ''microsequence'' end');
  v_definition:=replace(v_definition,E'p_course_id,''study_unit'',\n      coalesce(v_application.value#>>',
    E'p_course_id,coalesce(v_application.value#>>''{application,targetKind}'',''study_unit''),\n      coalesce(v_application.value#>>');
  v_definition:=replace(v_definition,'p_course_id,''study_unit'',coalesce(v_application.value->>',
    'p_course_id,coalesce(v_application.value->>''targetKind'',''study_unit''),coalesce(v_application.value->>');
  execute v_definition;
end $composition$;


alter table private.course_source_attributions
  drop constraint course_source_attributions_target_v2,
  add constraint course_source_attributions_target_v2 check(
    target_kind in('plan_item','study_unit','microsequence_explanation')
      and nullif(btrim(target_id),'') is not null
      and target_id=btrim(target_id) and char_length(target_id)<=240
      and target_id!~'[[:cntrl:]]' and target_version>0 and target_hash~'^[a-f0-9]{64}$'
  );

do $migration$
declare v_definition text; v_previous text; v_signature text;
begin
  select replace(pg_get_functiondef('private.course_source_target_state_v1(uuid,text,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_previous:=v_definition;
  v_definition:=replace(v_definition,E'  else\n    raise exception ''Tipo do alvo de proveniência inválido.''',E'  elsif p_target_kind = ''microsequence_explanation'' then\n    select entity.version,jsonb_build_object(\n      ''targetKind'',''microsequence_explanation'',''content'',entity.content->''explanation''\n    ) into v_version,v_document from private.course_entities entity\n    where entity.course_id=p_course_id and entity.entity_type=''microsequence'' and entity.entity_id=p_target_id;\n  else\n    raise exception ''Tipo do alvo de proveniência inválido.''');
  if v_definition=v_previous then raise exception 'Ramo do alvo de Fonte não encontrado.'; end if;
  execute v_definition;
  foreach v_signature in array array[
    'private.apply_course_source_attribution_v2(uuid,text,text,bigint,jsonb,text)',
    'private.execute_course_source_command_core_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'
  ] loop
    select replace(pg_get_functiondef(v_signature::regprocedure),E'\r\n',E'\n') into v_definition;
    v_previous:=v_definition;
    v_definition:=replace(v_definition,'''plan_item'',''study_unit''','''plan_item'',''study_unit'',''microsequence_explanation''');
    if v_definition=v_previous then raise exception 'Enum do alvo de Fonte não encontrado: %',v_signature; end if;
    if v_signature like 'private.apply_course_source_attribution%' then
      v_definition:=replace(v_definition,'  v_state := private.course_source_target_state_v1(',
        '  if p_target_kind=''microsequence_explanation'' and exists(
          select 1 from jsonb_array_elements(p_links) l
          cross join lateral jsonb_array_elements(l->''occurrences'') o
          where o->>''slot''<>''content'') then
          raise exception ''A ocorrência da Explicação exige o slot content.'' using errcode=''22023'';
        end if;
  v_state := private.course_source_target_state_v1(');
    elsif v_signature like 'private.execute_course_source_command%' then
      v_definition:=replace(v_definition,'select distinct attribution.target_id','select distinct attribution.target_kind,attribution.target_id');
      v_definition:=replace(v_definition,'and attribution.target_kind = ''study_unit''','and attribution.target_kind in (''study_unit'',''microsequence_explanation'')');
      v_definition:=replace(v_definition,'p_course_id,''study_unit'',v_study_unit.target_id','p_course_id,v_study_unit.target_kind,v_study_unit.target_id');
    end if;
    execute v_definition;
  end loop;
  select replace(pg_get_functiondef('private.invalidate_course_source_attribution_after_target_v1()'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'old.entity_type<>''study_unit''','old.entity_type not in(''study_unit'',''microsequence'')');
  v_definition:=replace(v_definition,'v_target_kind:=''study_unit'';',
    'v_target_kind:=case when old.entity_type=''microsequence'' then ''microsequence_explanation'' else ''study_unit'' end;');
  -- A exclusão do apoio não pode deixar referências órfãs ou descartá-las implicitamente.
  v_definition:=replace(v_definition,'tg_op=''DELETE'' and v_target_kind=''plan_item''',
    'tg_op=''DELETE'' and v_target_kind in(''plan_item'',''microsequence_explanation'')');
  execute v_definition;
end $migration$;

-- Um payload comum de citações atende os dois alvos de conteúdo atuais.
do $migration$
declare v_definition text;
begin
  select replace(pg_get_functiondef('private.course_study_citations_payload_v1(uuid,text,bigint)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'private.course_study_citations_payload_v1(p_course_id uuid, p_study_unit_id text, p_course_revision bigint)',
    'private.course_target_citations_payload_v1(p_course_id uuid, p_target_kind text, p_target_id text, p_course_revision bigint)');
  v_definition:=replace(v_definition,'p_study_unit_id','p_target_id');
  v_definition:=replace(v_definition,'if p_course_id is null or p_target_id is null',
    'if p_target_kind is null or p_target_kind not in(''study_unit'',''microsequence_explanation'') or p_course_id is null or p_target_id is null');
  v_definition:=replace(v_definition,'p_course_id,''study_unit'',p_target_id','p_course_id,p_target_kind,p_target_id');
  v_definition:=replace(v_definition,'''studyUnitId'',p_target_id,''citations'',v_citations',
    '''citations'',v_citations');
  v_definition:=replace(v_definition,'  if octet_length(v_result::text)>262144 then',
    '  v_result:=v_result||case when p_target_kind=''study_unit'' then jsonb_build_object(''studyUnitId'',p_target_id)
       else jsonb_build_object(''targetKind'',p_target_kind,''targetId'',p_target_id) end;
  if octet_length(v_result::text)>262144 then');
  if position('course_target_citations_payload_v1' in v_definition)=0 then raise exception 'Cabeçalho de citações não encontrado.'; end if;
  execute v_definition;
end $migration$;

create or replace function private.course_study_citations_payload_v1(p_course_id uuid,p_study_unit_id text,p_course_revision bigint)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  select private.course_target_citations_payload_v1(p_course_id,'study_unit',p_study_unit_id,p_course_revision)
$function$;

create or replace function private.assert_course_source_target_citation_budget_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns void language plpgsql volatile security definer set search_path=pg_catalog,private as $function$
begin
  if p_target_kind in('study_unit','microsequence_explanation') then
    perform private.course_target_citations_payload_v1(p_course_id,p_target_kind,p_target_id,9223372036854775807);
  elsif p_target_kind is distinct from 'plan_item' then
    raise exception 'Tipo do alvo da cerca de citações inválido.' using errcode='22023';
  end if;
end $function$;

do $migration$
declare v_definition text; v_previous text;
begin
  select replace(pg_get_functiondef('private.get_course_study_citations_core_v1(uuid,bigint,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_previous:=v_definition;
  v_definition:=replace(v_definition,'  return private.course_study_citations_payload_v1(',
    '  if not exists(select 1 from private.course_entities e where e.course_id=p_course_id
      and e.entity_type=''study_unit'' and e.entity_id=p_study_unit_id
      and private.course_entity_readable_v1(e.course_id,v_actor_id,e.entity_type,e.entity_id,e.parent_id)) then
      raise exception ''Conteúdo aguardando revisão da autoria.'' using errcode=''42501'';
    end if;
  return private.course_study_citations_payload_v1(');
  if v_definition=v_previous then raise exception 'Guarda de citações não encontrada.'; end if;
  execute v_definition;
end $migration$;

create function public.get_course_explanation_citations_v1(p_course_id uuid,p_expected_revision bigint,p_microsequence_id text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,private as $function$
declare v_actor_id uuid:=auth.uid(); v_revision bigint;
begin
  if v_actor_id is not null then perform pg_advisory_xact_lock(hashtextextended('course-access:'||p_course_id::text||':'||v_actor_id::text,0)); end if;
  perform private.require_course_read_access_v1(p_course_id,v_actor_id);
  if p_expected_revision is null or p_expected_revision<1 or p_microsequence_id is null
    or char_length(p_microsequence_id) not between 1 and 240 or p_microsequence_id<>btrim(p_microsequence_id)
    or p_microsequence_id~'[[:cntrl:]]' then raise exception 'Alvo das citações inválido.' using errcode='22023'; end if;
  select revision into strict v_revision from public.courses where id=p_course_id for share;
  if v_revision<>p_expected_revision then raise exception 'O Curso mudou durante a leitura de citações.' using errcode='40001'; end if;
  if not exists(select 1 from private.course_entities e where e.course_id=p_course_id and e.entity_type='microsequence'
    and e.entity_id=p_microsequence_id and private.course_entity_readable_v1(e.course_id,v_actor_id,e.entity_type,e.entity_id,e.parent_id)) then
    raise exception 'Explicação indisponível ou aguardando revisão da autoria.' using errcode='42501'; end if;
  return private.course_target_citations_payload_v1(p_course_id,'microsequence_explanation',p_microsequence_id,v_revision);
end $function$;
revoke all on function public.get_course_explanation_citations_v1(uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.get_course_explanation_citations_v1(uuid,bigint,text) to anon,authenticated;
revoke all on function private.course_target_citations_payload_v1(uuid,text,text,bigint) from public,anon,authenticated,service_role;

-- O PDF mantém sua política de acesso; a atribuição exclusiva a rascunho não a contorna.
create or replace function private.can_read_course_file_v1(p_course_id uuid,p_actor_id uuid,p_source_id text,p_content_hash text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $function$
  select coalesce((select c.owner_id=p_actor_id or (
    ((c.visibility='private' and s.study_visibility='citation_and_link' and private.course_ownership_v1(c.id,p_actor_id)='shared')
      or (c.visibility='public' and coalesce(nullif(a.public_file_access,'inherit'),nullif(s.public_file_access,'inherit'),c.public_file_access)='available'))
    and (not exists(select 1 from private.course_source_attribution_sources l join private.course_source_attributions t
      on t.course_id=l.course_id and t.id=l.attribution_id
      where l.course_id=c.id and l.source_id=s.source_id and t.target_kind in('study_unit','microsequence_explanation'))
    or exists(select 1 from private.course_source_attribution_sources l join private.course_source_attributions t
      on t.course_id=l.course_id and t.id=l.attribution_id join private.course_entities e
      on e.course_id=t.course_id and e.entity_id=t.target_id
      and e.entity_type=case when t.target_kind='study_unit' then 'study_unit' else 'microsequence' end
      where l.course_id=c.id and l.source_id=s.source_id and t.target_kind in('study_unit','microsequence_explanation')
        and private.course_entity_readable_v1(e.course_id,p_actor_id,e.entity_type,e.entity_id,e.parent_id)))
    ) from public.courses c join private.course_sources s on s.course_id=c.id
    join private.course_source_attachments a on a.course_id=s.course_id and a.source_id=s.source_id and a.source_revision=s.revision
    where c.id=p_course_id and s.source_id=p_source_id and a.content_hash=p_content_hash
      and s.status='active' and a.status='active'),false);
$function$;

-- Núcleo único de download de áudio. O alvo seleciona somente a superfície salva.
do $migration$
declare v_definition text;
begin
  select replace(pg_get_functiondef('public.get_course_media_download_for_actor_v1(uuid,uuid,bigint,text,text)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_definition:=replace(v_definition,'public.get_course_media_download_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_study_unit_id text, p_content_hash text)',
    'private.get_course_target_media_download_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_target_kind text, p_target_id text, p_content_hash text)');
  v_definition:=replace(v_definition,'p_study_unit_id','p_target_id');
  v_definition:=replace(v_definition,'if p_expected_revision is null or p_expected_revision<1',
    'if p_target_kind is null or p_target_kind not in(''study_unit'',''microsequence_explanation'') or p_expected_revision is null or p_expected_revision<1');
  v_definition:=replace(v_definition,'O áudio não está disponível nesta unidade.','O áudio não está disponível neste conteúdo.');
  v_definition:=replace(v_definition,'coalesce(e.content->''content'',''[]''::jsonb)',
    'coalesce(case when p_target_kind=''microsequence_explanation'' then e.content#>''{explanation,content}'' else e.content->''content'' end,''[]''::jsonb)');
  v_definition:=replace(v_definition,'e.entity_type=''study_unit'' and e.entity_id=p_target_id',
    'e.entity_type=case when p_target_kind=''microsequence_explanation'' then ''microsequence'' else ''study_unit'' end and e.entity_id=p_target_id
      and private.course_entity_readable_v1(e.course_id,p_actor_id,e.entity_type,e.entity_id,e.parent_id)');
  v_definition:=replace(v_definition,'''studyUnitId'',p_target_id,''media''','''media''');
  if position('private.get_course_target_media_download_v1' in v_definition)=0 then raise exception 'Cabeçalho de áudio não encontrado.'; end if;
  execute v_definition;
end $migration$;
create or replace function public.get_course_media_download_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,p_study_unit_id text,p_content_hash text)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  select private.get_course_target_media_download_v1(p_actor_id,p_course_id,p_expected_revision,'study_unit',p_study_unit_id,p_content_hash)
    ||jsonb_build_object('studyUnitId',p_study_unit_id)
$function$;
create function public.get_course_explanation_media_download_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,p_microsequence_id text,p_content_hash text)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  select private.get_course_target_media_download_v1(p_actor_id,p_course_id,p_expected_revision,'microsequence_explanation',p_microsequence_id,p_content_hash)
    ||jsonb_build_object('targetKind','microsequence_explanation','targetId',p_microsequence_id)
$function$;
revoke all on function private.get_course_target_media_download_v1(uuid,uuid,bigint,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_course_explanation_media_download_for_actor_v1(uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_course_explanation_media_download_for_actor_v1(uuid,uuid,bigint,text,text) to service_role;

-- Primeira mudança material numa dependência de recorte antigo inicia revisão,
-- sem apagar a aprovação anterior. O hash corrente detecta stale nesse caso.
create function private.mark_course_source_content_review_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,private as $function$
declare v_old jsonb; v_new jsonb; v_row jsonb; v_course uuid; v_source text; v_ms record; v_gate text;
begin
  if tg_op<>'INSERT' then v_old:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then v_new:=to_jsonb(new); end if;
  if tg_op='UPDATE' and (v_old-'revision'-'created_at'-'updated_at'-'target_version'-'target_hash')
     is not distinct from (v_new-'revision'-'created_at'-'updated_at'-'target_version'-'target_hash') then return new; end if;
  v_row:=coalesce(v_new,v_old); v_course:=(v_row->>'course_id')::uuid; v_source:=v_row->>'source_id';
  v_gate:=current_setting('aralearn.content_review_write',true);
  perform set_config('aralearn.content_review_write','approved-command',true);
  for v_ms in
    select distinct case when a.target_kind='study_unit' then e.parent_id else e.entity_id end as ms_id
    from private.course_source_attributions a join private.course_entities e
      on e.course_id=a.course_id and e.entity_id=a.target_id
      and e.entity_type=case when a.target_kind='study_unit' then 'study_unit' else 'microsequence' end
    left join private.course_source_attribution_sources l on l.course_id=a.course_id and l.attribution_id=a.id
    where a.course_id=v_course and a.target_kind in('study_unit','microsequence_explanation') and (
      (tg_table_name='course_source_attributions' and a.id=(v_row->>'id')::uuid)
      or (tg_table_name in('course_source_attribution_sources','course_source_attribution_anchors') and a.id=(v_row->>'attribution_id')::uuid)
      or (tg_table_name='course_sources' and l.source_id=v_source)
      or (tg_table_name='course_source_anchors' and exists(select 1 from private.course_source_attribution_anchors x
        where x.course_id=a.course_id and x.attribution_id=a.id and x.anchor_id=v_row->>'anchor_id'))
      or (tg_table_name='course_source_attachments' and exists(select 1 from private.course_source_attribution_anchors x
        join private.course_source_anchors z on z.course_id=x.course_id and z.anchor_id=x.anchor_id
        where x.course_id=a.course_id and x.attribution_id=a.id and z.source_id=v_source
          and z.content_hash=v_row->>'content_hash'))
    )
  loop
    with recursive affected(id) as (select v_ms.ms_id union select e.entity_id from private.course_entities e join affected a on e.content->'dependsOn' ? a.id where e.course_id=v_course and e.entity_type='microsequence')
    update private.course_entities set content_review='{}'::jsonb
      where course_id=v_course and entity_type='microsequence' and entity_id in(select id from affected) and content_review is null;
  end loop;
  perform set_config('aralearn.content_review_write',coalesce(v_gate,''),true);
  if tg_op='DELETE' then return old; else return new; end if;
end $function$;
revoke all on function private.mark_course_source_content_review_v1() from public,anon,authenticated,service_role;
create trigger mark_course_review_source before update or delete on private.course_sources
  for each row execute function private.mark_course_source_content_review_v1();
create trigger mark_course_review_anchor before update or delete on private.course_source_anchors
  for each row execute function private.mark_course_source_content_review_v1();
create trigger mark_course_review_attachment before update or delete on private.course_source_attachments
  for each row execute function private.mark_course_source_content_review_v1();
create trigger mark_course_review_attribution before update or delete on private.course_source_attributions
  for each row execute function private.mark_course_source_content_review_v1();
create trigger mark_course_review_link before insert or update or delete on private.course_source_attribution_sources
  for each row execute function private.mark_course_source_content_review_v1();
create trigger mark_course_review_anchor_link before insert or update or delete on private.course_source_attribution_anchors
  for each row execute function private.mark_course_source_content_review_v1();


revoke all on function private.course_content_media_hashes_v1(jsonb) from public,anon,authenticated,service_role;
create function private.mark_course_media_content_review_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,private as $function$
declare v_media jsonb; v_gate text; v_ms record;
begin
  if tg_op='UPDATE' and row(old.content_hash,old.byte_size,old.media_type,old.status)
    is not distinct from row(new.content_hash,new.byte_size,new.media_type,new.status) then return new; end if;
  v_media:=to_jsonb(old); v_gate:=current_setting('aralearn.content_review_write',true);
  perform set_config('aralearn.content_review_write','approved-command',true);
  for v_ms in select distinct case when e.entity_type='microsequence' then e.entity_id else e.parent_id end as ms_id
    from private.course_entities e where e.course_id=(v_media->>'course_id')::uuid
      and e.entity_type in('microsequence','study_unit')
      and v_media->>'content_hash' in(select private.course_content_media_hashes_v1(
        case when e.entity_type='microsequence' then e.content->'explanation' else e.content end))
  loop
    with recursive affected(id) as (select v_ms.ms_id union select e.entity_id from private.course_entities e join affected a on e.content->'dependsOn' ? a.id where e.course_id=(v_media->>'course_id')::uuid and e.entity_type='microsequence')
    update private.course_entities set content_review='{}'::jsonb where course_id=(v_media->>'course_id')::uuid
      and entity_type='microsequence' and entity_id in(select id from affected) and content_review is null;
  end loop;
  perform set_config('aralearn.content_review_write',coalesce(v_gate,''),true);
  if tg_op='DELETE' then return old; else return new; end if;
end $function$;
revoke all on function private.mark_course_media_content_review_v1() from public,anon,authenticated,service_role;
create trigger mark_course_review_media before update or delete on private.course_media
  for each row execute function private.mark_course_media_content_review_v1();

create function private.mark_course_plan_item_content_review_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,private as $function$
declare v_gate text;
begin
  if tg_op='UPDATE' and row(old.statement,old.description,old.item_kind)
    is not distinct from row(new.statement,new.description,new.item_kind) then return new; end if;
  v_gate:=coalesce(current_setting('aralearn.content_review_write',true),'');
  perform set_config('aralearn.content_review_write','approved-command',true);
  with recursive affected(id) as (
    select a.didactic_microsequence_id from private.course_design_target_plan_items a
      where a.course_id=old.course_id and a.plan_item_id=old.id
    union select e.entity_id from private.course_entities e join affected a
      on e.content->'dependsOn' ? a.id where e.course_id=old.course_id and e.entity_type='microsequence'
  ) update private.course_entities set content_review='{}'::jsonb where course_id=old.course_id
    and entity_type='microsequence' and entity_id in(select id from affected) and content_review is null;
  perform set_config('aralearn.content_review_write',v_gate,true);
  if tg_op='DELETE' then return old; else return new; end if;
end $function$;
revoke all on function private.mark_course_plan_item_content_review_v1() from public,anon,authenticated,service_role;
create trigger mark_course_review_plan_item before update or delete on private.course_instructional_plan_items
  for each row execute function private.mark_course_plan_item_content_review_v1();

-- Uma preferência de cadência automática aplicada não é uma atribuição do
-- curso. Na releitura da própria unidade, recuperar seu valor contextual
-- somente quando não há atribuição vigente; uma fixação nova prevalece.
do $applied_cadence$
declare v_definition text; v_before text;
begin
  select replace(pg_get_functiondef('private.course_current_design_parameters_v1(uuid,jsonb)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_before:=v_definition;
  v_definition:=replace(v_definition,
    'target as(select * from scopes order by depth desc limit 1)',
    'target as(select * from scopes order by depth desc limit 1),
  applied as(select parameter.value from target
    join private.course_entities unit on unit.course_id=p_course_id
      and target.kind=''study_unit'' and unit.entity_type=''study_unit'' and unit.entity_id=target.ref
    cross join lateral jsonb_array_elements(coalesce(unit.design_snapshot->''parameters'',''[]''::jsonb)) parameter(value))');
  v_definition:=replace(v_definition,
    'left join lateral(select * from applicable a where a.parameter_id=d.parameter_id order by (a.origin=''research_condition'') desc,(a.mode=''fixed'') desc,a.depth desc limit 1) e on true',
    'left join lateral(select choice.* from (
      select a.parameter_id,a.mode,a.value,a.origin,a.reason,a.scope_kind,a.scope_ref,a.depth
      from applicable a where a.parameter_id=d.parameter_id
      union all
      select d.parameter_id,''automatic'',p.value->''value'',p.value->>''origin'',p.value->>''reason'',
        p.value->>''sourceScopeKind'',p_course_id::text,(-1)::bigint
      from applied p where p.value->>''parameterId''=d.parameter_id
        and not(''study_unit''=any(d.supported_scopes))
        and p.value->>''origin''=''automatic'' and p.value->>''sourceScopeKind''=''course''
        and private.valid_course_design_parameter_value_v1(d.parameter_id,p.value->''value'')
        and not exists(select 1 from applicable a where a.parameter_id=d.parameter_id)
    ) choice order by (choice.origin=''research_condition'') desc,(choice.mode=''fixed'') desc,choice.depth desc limit 1) e on true');
  if v_definition=v_before or position('from applied p' in v_definition)=0 then
    raise exception 'Resolvedor precursor de parâmetros divergiu.'; end if;
  execute v_definition;
end $applied_cadence$;

-- O inventário literal de Analytics também precisa resolver referências
-- retiradas ainda usadas; seu DTO não afirma estado ativo nem conferência.
do $referenced_inventory$
declare v_definition text; v_anchor text; v_source text;
begin
  select replace(pg_get_functiondef('public.get_owned_course_authoring_analytics_for_actor_v4(uuid,uuid,bigint,jsonb)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_anchor:='from private.course_source_anchors a where a.course_id=p_course_id and a.source_id=s.source_id and a.status=''active''';
  v_source:='from private.course_sources s where s.course_id=p_course_id and s.status=''active''';
  if position(v_anchor in v_definition)=0 or position(v_source in v_definition)=0 then
    raise exception 'Inventário precursor de Analytics divergiu.'; end if;
  v_definition:=replace(v_definition,v_anchor,
    'from private.course_source_anchors a where a.course_id=p_course_id and a.source_id=s.source_id
      and (a.status=''active'' or exists(select 1 from private.course_source_attribution_anchors used
        join private.course_source_attributions attribution on attribution.course_id=used.course_id and attribution.id=used.attribution_id
        where used.course_id=a.course_id and used.source_id=a.source_id and used.anchor_id=a.anchor_id
          and attribution.id=(private.course_effective_source_attribution_v1(attribution.course_id,attribution.target_kind,attribution.target_id)).id))');
  v_definition:=replace(v_definition,v_source,
    'from private.course_sources s where s.course_id=p_course_id
      and (s.status=''active'' or exists(select 1 from private.course_source_attribution_sources used
        join private.course_source_attributions attribution on attribution.course_id=used.course_id and attribution.id=used.attribution_id
        where used.course_id=s.course_id and used.source_id=s.source_id
          and attribution.id=(private.course_effective_source_attribution_v1(attribution.course_id,attribution.target_kind,attribution.target_id)).id))');
  execute v_definition;
end $referenced_inventory$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260907222912',
    'features',(select jsonb_agg(value order by value collate "C") from jsonb_array_elements_text((public.get_aralearn_runtime_manifest()->'features')||'["shared-microsequence-explanation-v1","human-content-review-v1"]'::jsonb)));
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
