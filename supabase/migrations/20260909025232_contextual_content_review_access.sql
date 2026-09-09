begin;

-- Revisão é metadado protegido do objeto salvo. A declaração anterior abrangia
-- o conjunto inteiro; preservá-la não atribui novas inspeções por objeto.
drop trigger course_content_review_guard on private.course_entities;
drop trigger course_content_review_invalidate on private.course_entities;
drop trigger mark_course_review_source on private.course_sources;
drop trigger mark_course_review_anchor on private.course_source_anchors;
drop trigger mark_course_review_attachment on private.course_source_attachments;
drop trigger mark_course_review_attribution on private.course_source_attributions;
drop trigger mark_course_review_link on private.course_source_attribution_sources;
drop trigger mark_course_review_anchor_link on private.course_source_attribution_anchors;
drop trigger mark_course_review_media on private.course_media;
drop trigger mark_course_review_plan_item on private.course_instructional_plan_items;
alter table private.course_entities drop constraint course_content_review_v1;
update private.course_entities set content_review=jsonb_build_object('legacyMicrosequenceReview',content_review)
  where content_review ? 'approvedBasisHash';

create function private.valid_course_content_review_v2(p_review jsonb,p_entity_type text)
returns boolean language sql immutable set search_path=pg_catalog as $function$
  select p_review is null or coalesce(p_entity_type in('microsequence','study_unit')
    and jsonb_typeof(p_review)='object'
    and p_review-array['basisHash','reviewedAt','reviewedBy','reviewedVersion','legacyMicrosequenceReview']='{}'::jsonb
    and (not(p_review ? 'legacyMicrosequenceReview') or p_entity_type='microsequence'
      and jsonb_typeof(p_review->'legacyMicrosequenceReview')='object'
      and p_review->'legacyMicrosequenceReview' ?& array['approvedBasisHash','approvedAt','approvedBy']
      and (p_review->'legacyMicrosequenceReview')-array['approvedBasisHash','approvedAt','approvedBy']='{}'::jsonb
      and p_review#>>'{legacyMicrosequenceReview,approvedBasisHash}' ~ '^[a-f0-9]{64}$')
    and (p_review-'legacyMicrosequenceReview'='{}'::jsonb or
      p_review ?& array['basisHash','reviewedAt','reviewedBy','reviewedVersion']
      and jsonb_typeof(p_review->'basisHash')='string' and p_review->>'basisHash' ~ '^[a-f0-9]{64}$'
      and jsonb_typeof(p_review->'reviewedAt')='string' and nullif(p_review->>'reviewedAt','') is not null
      and jsonb_typeof(p_review->'reviewedBy')='string' and p_review->>'reviewedBy' ~ '^[a-f0-9-]{36}$'
      and jsonb_typeof(p_review->'reviewedVersion')='number' and p_review->>'reviewedVersion' ~ '^[1-9][0-9]*$'),false)
$function$;
alter table private.course_entities add constraint course_content_review_v2
  check(private.valid_course_content_review_v2(content_review,entity_type));

-- Política de acesso, sem alterar visibilidade, concessões ou direitos de arquivos.
alter table public.courses add column content_review_policy text not null default 'saved'
  check(content_review_policy in('saved','reviewed_only'));

create or replace function private.mark_course_content_review_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $function$
begin
  if new.content ?| array['contentReview','content_review','approvedBy','approvedAt','approvedBasisHash',
    'reviewedBy','reviewedAt','reviewedVersion','basisHash','legacyMicrosequenceReview'] then
    raise exception 'Revisão não pertence ao conteúdo editável.' using errcode='42501'; end if;
  if new.entity_type='microsequence' and (
    new.content ? 'explanation' and not private.valid_course_explanation_v1(new.content->'explanation')
    or new.content ? 'explanationPlan' and not private.valid_course_explanation_plan_v1(new.content->'explanationPlan')
  ) then raise exception 'Explicação ou proposta inválida.' using errcode='22023'; end if;
  if tg_op='INSERT' then
    if new.content_review is not null then raise exception 'Revisão não pode ser importada.' using errcode='42501'; end if;
    if new.entity_type in('microsequence','study_unit') then new.content_review:='{}'::jsonb; end if;
  elsif new.content_review is distinct from old.content_review and
    current_setting('aralearn.content_review_write',true) is distinct from 'object-review-command' then
    raise exception 'Metadado de revisão protegido.' using errcode='42501';
  end if;
  return new;
end $function$;
create trigger course_content_review_guard before insert or update on private.course_entities
  for each row execute function private.mark_course_content_review_v1();

-- O hash acompanha o conteúdo do alvo, sua base e dependências declaradas,
-- fontes, âncoras, arquivos e configuração aplicada. Intenção posterior e
-- revisão de outros objetos não reescrevem esse registro.
create function private.course_content_basis_hash_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns text language sql stable security definer set search_path=pg_catalog as $function$
  with recursive target as materialized (
    select e.* from private.course_entities e where e.course_id=p_course_id
      and e.entity_type=case p_target_kind when 'microsequence_explanation' then 'microsequence' when 'study_unit' then 'study_unit' end
      and e.entity_id=p_target_id
  ), scope(id) as (
    select case when entity_type='microsequence' then entity_id else parent_id end from target
    union select dependency.value from scope join private.course_entities m on m.course_id=p_course_id
      and m.entity_type='microsequence' and m.entity_id=scope.id
      cross join lateral jsonb_array_elements_text(coalesce(m.content->'dependsOn','[]'::jsonb)) dependency(value)
  ), bases as materialized (
    select e.entity_id,e.content from private.course_entities e where e.course_id=p_course_id
      and e.entity_type='microsequence' and e.entity_id in(select id from scope)
  ), targets as materialized (
    select p_target_kind kind,p_target_id id union select 'microsequence_explanation',id from scope
    union select 'plan_item',a.plan_item_id::text from private.course_design_target_plan_items a
      where a.course_id=p_course_id and a.didactic_microsequence_id in(select id from scope)
  ), attributions as materialized (
    select a.* from private.course_source_attributions a join targets t on t.kind=a.target_kind and t.id=a.target_id
      where a.course_id=p_course_id
  ), links as materialized (
    select l.* from private.course_source_attribution_sources l where l.course_id=p_course_id
      and l.attribution_id in(select id from attributions)
  ), anchors as materialized (
    select a.* from private.course_source_anchors a where a.course_id=p_course_id
      and a.anchor_id in(select l.anchor_id from private.course_source_attribution_anchors l
        where l.course_id=p_course_id and l.attribution_id in(select id from attributions))
  ), media_hashes as (
    select private.course_content_media_hashes_v1(content->'explanation') hash from bases
    union select private.course_content_media_hashes_v1(content) from target where entity_type='study_unit'
  ) select case when exists(select 1 from target) then private.course_source_json_hash_v1(jsonb_build_object(
    'targetKind',p_target_kind,'targetId',p_target_id,
    'target',(select jsonb_build_object('parentId',parent_id,
      'content',case when entity_type='microsequence' then content->'explanation' else content end,
      'designSnapshot',case when entity_type='study_unit' then design_snapshot-'appliedAt' end,
      'designApplication',case when entity_type='study_unit' then design_application end) from target),
    'bases',coalesce((select jsonb_agg(jsonb_build_object('id',entity_id,'goal',content->'goal',
      'dependsOn',content->'dependsOn','explanation',content->'explanation') order by entity_id) from bases),'[]'::jsonb),
    'planItems',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'kind',i.item_kind,'statement',i.statement,
      'description',i.description) order by i.id) from private.course_instructional_plan_items i
      where i.course_id=p_course_id and i.id::text in(select id from targets where kind='plan_item')),'[]'::jsonb),
    'attributions',coalesce((select jsonb_agg(jsonb_build_object('kind',target_kind,'id',target_id,
      'links',private.course_source_links_v1(p_course_id,id)) order by target_kind,target_id) from attributions),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(s)-array['course_id','revision','created_at','updated_at'] order by s.source_id)
      from private.course_sources s where s.course_id=p_course_id and s.source_id in(select source_id from links)),'[]'::jsonb),
    'anchors',coalesce((select jsonb_agg(to_jsonb(a)-array['course_id','revision','source_revision','created_at','updated_at']
      order by a.anchor_id) from anchors a),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object('hash',m.content_hash,'status',m.status,
      'byteSize',m.byte_size,'mediaType',m.media_type) order by m.content_hash) from private.course_media m
      where m.course_id=p_course_id and m.content_hash in(select hash from media_hashes)),'[]'::jsonb),
    'files',coalesce((select jsonb_agg(jsonb_build_object('sourceId',f.source_id,'hash',f.content_hash,'status',f.status,
      'access',f.public_file_access) order by f.source_id,f.content_hash) from private.course_source_attachments f
      where f.course_id=p_course_id and exists(select 1 from anchors a where a.source_id=f.source_id and a.content_hash=f.content_hash)),'[]'::jsonb)
  )) end
$function$;

create function private.course_content_review_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  select jsonb_strip_nulls(jsonb_build_object('state',case
    when e.content_review is null then 'unregistered'
    when not(e.content_review ? 'basisHash') then 'draft'
    when e.content_review->>'basisHash'=private.course_content_basis_hash_v1(p_course_id,p_target_kind,p_target_id) then 'current'
    else 'stale' end,'reviewedAt',e.content_review->>'reviewedAt'))
  from private.course_entities e where e.course_id=p_course_id and e.entity_id=p_target_id
    and e.entity_type=case p_target_kind when 'microsequence_explanation' then 'microsequence' when 'study_unit' then 'study_unit' end
$function$;

create function private.course_content_complete_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $function$
declare saved jsonb; instances jsonb;
begin
  select e.content into saved from private.course_entities e where e.course_id=p_course_id and e.entity_id=p_target_id
    and e.entity_type=case p_target_kind when 'microsequence_explanation' then 'microsequence' when 'study_unit' then 'study_unit' end;
  if not found then return false; end if;
  if p_target_kind='microsequence_explanation' then
    return coalesce(private.valid_course_explanation_v1(saved->'explanation'),false);
  end if;
  if saved-array['title','role','content','response','feedback','topics']<>'{}'::jsonb
    or not(saved ?& array['title','role','content','response','feedback','topics'])
    or jsonb_typeof(saved->'role') is distinct from 'string'
    or saved->>'role' not in('theory','practice')
    or jsonb_typeof(saved->'content') is distinct from 'array'
    or jsonb_typeof(saved->'feedback') is distinct from 'array'
    or jsonb_typeof(saved->'topics') is distinct from 'array' then return false; end if;
  if saved->>'role'='theory' and (jsonb_array_length(saved->'content')=0 or saved->'response'<>'null'::jsonb)
    or saved->>'role'='practice' and jsonb_typeof(saved->'response') is distinct from 'object'
    or exists(select 1 from jsonb_array_elements(saved->'topics') t
      where jsonb_typeof(t)<>'string' or nullif(btrim(t#>>'{}'),'') is null)
    or (select count(*)<>count(distinct t) from jsonb_array_elements(saved->'topics') t) then return false; end if;
  -- O escritor vigente valida slots e dados pelo registry de packages. O gate
  -- de leitura verifica completude estrutural e referências pelo catálogo SQL
  -- corrente, sem depender dos validadores da antiga auditoria removida.
  instances:=(saved->'content')||(saved->'feedback')||case when jsonb_typeof(saved->'response')='object'
    then jsonb_build_array(saved->'response') else '[]'::jsonb end;
  return coalesce(jsonb_typeof(saved->'title')='string' and char_length(btrim(saved->>'title')) between 1 and 300
    and private.valid_course_component_refs_in_content_v1(saved)
    and not exists(select 1 from jsonb_array_elements(instances) b
      where jsonb_typeof(b) is distinct from 'object' or not(b ?& array['id','package','version','data'])
        or b-array['id','package','version','data']<>'{}'::jsonb
        or jsonb_typeof(b->'data') is distinct from 'object'
        or jsonb_typeof(b->'id') is distinct from 'string' or nullif(btrim(b->>'id'),'') is null)
    and not exists(select 1 from jsonb_array_elements(saved->'content') b where b->>'package' not like 'aralearn.resource.%')
    and not exists(select 1 from jsonb_array_elements(saved->'feedback') b where b->>'package' not like 'aralearn.feedback.%')
    and (saved->'response'='null'::jsonb or saved#>>'{response,package}' like 'aralearn.response.%')
    and (select count(*)=count(distinct b->>'id') from jsonb_array_elements(instances) b),false);
end
$function$;

create function private.course_content_review_payload_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
declare v_entity private.course_entities%rowtype; v_course public.courses%rowtype;
begin
  if p_target_kind is null or p_target_kind not in('microsequence_explanation','study_unit')
    or p_target_id is null or char_length(p_target_id) not between 1 and 300 or p_target_id ~ '[[:cntrl:]]' then
    raise exception 'Objeto de revisão inválido.' using errcode='22023'; end if;
  select * into v_entity from private.course_entities where course_id=p_course_id and entity_id=p_target_id
    and entity_type=case when p_target_kind='study_unit' then 'study_unit' else 'microsequence' end;
  if not found then raise exception 'Objeto de revisão inexistente.' using errcode='PT404'; end if;
  select * into strict v_course from public.courses where id=p_course_id;
  return jsonb_build_object('contract','aralearn.course-content-review.v1','courseId',p_course_id,
    'courseRevision',v_course.revision,'targetKind',p_target_kind,'targetId',p_target_id,'entityVersion',v_entity.version,
    'basisHash',private.course_content_basis_hash_v1(p_course_id,p_target_kind,p_target_id),
    'contentReview',private.course_content_review_v1(p_course_id,p_target_kind,p_target_id),'reviewPolicy',v_course.content_review_policy);
end $function$;

create function private.set_course_content_review_v1(p_actor_id uuid,p_course_id uuid,p_target_kind text,
  p_target_id text,p_expected_basis_hash text,p_reviewed boolean,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare v_hash text; v_receipt private.course_change_receipts%rowtype; v_entity private.course_entities%rowtype;
  v_payload jsonb; v_review jsonb; v_changed boolean; v_setting text;
begin
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_basis_hash is null or p_expected_basis_hash !~ '^[a-f0-9]{64}$' or p_reviewed is null
    or p_request_id is null or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Declaração de revisão inválida.' using errcode='22023'; end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('targetKind',p_target_kind,'targetId',p_target_id,
    'basisHash',p_expected_basis_hash,'reviewed',p_reviewed));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'set_content_review' or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'Identidade de declaração incompatível.' using errcode='23514'; end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform 1 from public.courses where id=p_course_id for update;
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_payload:=private.course_content_review_payload_v1(p_course_id,p_target_kind,p_target_id);
  if v_payload->>'basisHash'<>p_expected_basis_hash then
    raise exception 'O conteúdo inspecionado mudou; releia antes de declarar revisão.' using errcode='PT409'; end if;
  if p_reviewed and not private.course_content_complete_v1(p_course_id,p_target_kind,p_target_id) then
    raise exception 'O conteúdo precisa estar completo e salvo antes da revisão.' using errcode='23514'; end if;
  select * into strict v_entity from private.course_entities where course_id=p_course_id and entity_id=p_target_id
    and entity_type=case when p_target_kind='study_unit' then 'study_unit' else 'microsequence' end for update;
  v_changed:=case when p_reviewed then v_payload#>>'{contentReview,state}'<>'current' else v_entity.content_review ? 'basisHash' end;
  if coalesce(v_changed,false) then
    v_review:=case when v_entity.content_review ? 'legacyMicrosequenceReview' then
      jsonb_build_object('legacyMicrosequenceReview',v_entity.content_review->'legacyMicrosequenceReview') else '{}'::jsonb end;
    if p_reviewed then v_review:=v_review||jsonb_build_object('basisHash',p_expected_basis_hash,
      'reviewedAt',statement_timestamp(),'reviewedBy',p_actor_id,'reviewedVersion',v_entity.version); end if;
    v_setting:=coalesce(current_setting('aralearn.content_review_write',true),'');
    perform set_config('aralearn.content_review_write','object-review-command',true);
    update private.course_entities set content_review=v_review where course_id=p_course_id
      and entity_type=v_entity.entity_type and entity_id=p_target_id;
    perform set_config('aralearn.content_review_write',v_setting,true);
    update public.courses set revision=revision+1,updated_at=clock_timestamp() where id=p_course_id;
  end if;
  v_payload:=private.course_content_review_payload_v1(p_course_id,p_target_kind,p_target_id)||jsonb_build_object(
    'contract','aralearn.course-content-review-change.v1','changed',coalesce(v_changed,false),'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,'set_content_review',p_course_id,v_hash,v_payload);
  return v_payload;
end $function$;

create function private.set_course_content_review_policy_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
  p_policy text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare v_hash text; v_receipt private.course_change_receipts%rowtype; v_course public.courses%rowtype;
  v_changed boolean; v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_policy is null or p_policy not in('saved','reviewed_only') or p_expected_revision is null or p_expected_revision<1
    or p_request_id is null or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Política de revisão inválida.' using errcode='22023'; end if;
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object('revision',p_expected_revision,'policy',p_policy));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'set_content_review_policy' or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'Identidade de política incompatível.' using errcode='23514'; end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses where id=p_course_id for update;
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if v_course.revision<>p_expected_revision then raise exception 'O curso mudou; releia a política.' using errcode='PT409'; end if;
  v_changed:=v_course.content_review_policy<>p_policy;
  if v_changed then update public.courses set content_review_policy=p_policy,revision=revision+1,updated_at=clock_timestamp()
    where id=p_course_id returning * into v_course; end if;
  v_result:=jsonb_build_object('contract','aralearn.course-content-review-policy.v1','courseId',p_course_id,
    'courseRevision',v_course.revision,'reviewPolicy',p_policy,'changed',v_changed,'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,'set_content_review_policy',p_course_id,v_hash,v_result);
  return v_result;
end $function$;

-- Entry points reuse the same writer and ownership predicate. The service role
-- carries an already authenticated actor; application RPCs validate its session.
create function public.get_course_content_review_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
begin
  perform private.require_service_role(); perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  return private.course_content_review_payload_v1(p_course_id,p_target_kind,p_target_id);
end $function$;
create function public.get_course_content_review_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
begin
  perform private.require_course_review_session_v1(p_course_id);
  return private.course_content_review_payload_v1(p_course_id,p_target_kind,p_target_id);
end $function$;
create function public.set_course_content_review_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_target_kind text,p_target_id text,
  p_expected_basis_hash text,p_reviewed boolean,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
begin
  perform private.require_service_role();
  return private.set_course_content_review_v1(p_actor_id,p_course_id,p_target_kind,p_target_id,p_expected_basis_hash,p_reviewed,p_request_id);
end $function$;
create function public.set_course_content_review_v1(p_course_id uuid,p_target_kind text,p_target_id text,
  p_expected_basis_hash text,p_reviewed boolean,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
begin
  return private.set_course_content_review_v1(private.require_course_review_session_v1(p_course_id),p_course_id,
    p_target_kind,p_target_id,p_expected_basis_hash,p_reviewed,p_request_id);
end $function$;
create function public.set_course_content_review_policy_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
  p_policy text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
begin
  perform private.require_service_role();
  return private.set_course_content_review_policy_v1(p_actor_id,p_course_id,p_expected_revision,p_policy,p_request_id);
end $function$;
create function public.set_course_content_review_policy_v1(p_course_id uuid,p_expected_revision bigint,p_policy text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
begin
  return private.set_course_content_review_policy_v1(private.require_course_review_session_v1(p_course_id),p_course_id,
    p_expected_revision,p_policy,p_request_id);
end $function$;

-- Existing read consumers retain a summary; this function never writes a review.
create or replace function private.course_microsequence_review_v1(p_course_id uuid,p_microsequence_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  with objects as (
    select private.course_content_review_v1(p_course_id,'microsequence_explanation',p_microsequence_id) review
    union all select private.course_content_review_v1(p_course_id,'study_unit',e.entity_id)
      from private.course_entities e where e.course_id=p_course_id and e.entity_type='study_unit' and e.parent_id=p_microsequence_id
  ) select case when exists(select 1 from private.course_entities where course_id=p_course_id
    and entity_type='microsequence' and entity_id=p_microsequence_id) then jsonb_strip_nulls(jsonb_build_object(
      'state',case when bool_and(review->>'state'='current') then 'current'
        when bool_or(review->>'state'='stale') then 'stale'
        when bool_and(review->>'state'='unregistered') then 'unregistered' else 'draft' end,
      'approvedAt',case when bool_and(review->>'state'='current') or bool_or(review->>'state'='stale')
        then max(review->>'reviewedAt') end)) end from objects
$function$;

create or replace function private.course_entity_readable_v1(p_course_id uuid,p_actor_id uuid,p_entity_type text,p_entity_id text,p_parent_id text)
returns boolean language sql stable security definer set search_path=pg_catalog as $function$
  select coalesce((select case when c.owner_id=p_actor_id then true
    when c.visibility<>'public' and private.course_ownership_v1(c.id,p_actor_id) is null then false
    when p_entity_type not in('study_unit','microsequence') then true
    when p_entity_type='microsequence' and exists(select 1 from private.course_entities e where e.course_id=c.id
      and e.entity_type='microsequence' and e.entity_id=p_entity_id and not(e.content ? 'explanation')) then true
    else private.course_content_complete_v1(c.id,case when p_entity_type='study_unit' then 'study_unit' else 'microsequence_explanation' end,p_entity_id)
      and (c.content_review_policy='saved' or private.course_content_review_v1(c.id,
        case when p_entity_type='study_unit' then 'study_unit' else 'microsequence_explanation' end,p_entity_id)->>'state'='current') end
    from public.courses c where c.id=p_course_id),false)
$function$;

create or replace function private.can_copy_course_v1(p_course_id uuid,p_actor_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $function$
  select p_actor_id is not null and exists(select 1 from public.person_profiles where user_id=p_actor_id)
    and exists(select 1 from public.courses c where c.id=p_course_id and (c.owner_id=p_actor_id
      or exists(select 1 from public.course_access a where a.course_id=c.id and a.user_id=p_actor_id and a.can_copy)
        and not exists(select 1 from private.course_entities e where e.course_id=c.id and
          (e.entity_type='study_unit' or e.entity_type='microsequence' and e.content ? 'explanation')
          and not private.course_entity_readable_v1(c.id,p_actor_id,e.entity_type,e.entity_id,e.parent_id))))
$function$;

-- Small extra object states in the same read projection; nothing enters content.
do $projection$
declare v_definition text; v_before text;
begin
  v_before:='''contentReview'',case when page.entity_type=''microsequence'' then private.course_microsequence_review_v1(p_course_id,page.entity_id) end,';
  v_definition:=pg_get_functiondef('private.list_course_entities_for_actor_v1(uuid,uuid,bigint,integer,text,text)'::regprocedure);
  if position(v_before in v_definition)=0 then raise exception 'Projeção de revisão precursora divergiu.'; end if;
  v_definition:=replace(v_definition,v_before,'''contentReview'',case when page.entity_type in(''microsequence'',''study_unit'') then private.course_content_review_v1(p_course_id,case when page.entity_type=''study_unit'' then ''study_unit'' else ''microsequence_explanation'' end,page.entity_id) end,');
  execute v_definition;
end $projection$;

do $receipt$
declare v_check text;
begin
  select pg_get_expr(conbin,conrelid) into strict v_check from pg_constraint
    where conrelid='private.course_change_receipts'::regclass and conname='course_change_receipts_operation_v16';
  alter table private.course_change_receipts drop constraint course_change_receipts_operation_v16;
  execute format('alter table private.course_change_receipts add constraint course_change_receipts_operation_v17 check((%s) or operation in(''set_content_review'',''set_content_review_policy''))',v_check);
end $receipt$;

drop function public.approve_course_microsequence_content_v1(uuid,text,text,text);
drop function public.get_course_microsequence_review_v1(uuid,text);
drop function private.course_microsequence_basis_hash_v1(uuid,text);
drop function private.invalidate_course_content_review_v1();
drop function private.mark_course_source_content_review_v1();
drop function private.mark_course_media_content_review_v1();
drop function private.mark_course_plan_item_content_review_v1();

revoke all on function private.valid_course_content_review_v2(jsonb,text),private.course_content_basis_hash_v1(uuid,text,text),
  private.course_content_review_v1(uuid,text,text),private.course_content_complete_v1(uuid,text,text),
  private.course_content_review_payload_v1(uuid,text,text),private.set_course_content_review_v1(uuid,uuid,text,text,text,boolean,text),
  private.set_course_content_review_policy_v1(uuid,uuid,bigint,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.get_course_content_review_for_actor_v1(uuid,uuid,text,text),
  public.set_course_content_review_for_actor_v1(uuid,uuid,text,text,text,boolean,text),
  public.set_course_content_review_policy_for_actor_v1(uuid,uuid,bigint,text,text),
  public.get_course_content_review_v1(uuid,text,text),public.set_course_content_review_v1(uuid,text,text,text,boolean,text),
  public.set_course_content_review_policy_v1(uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_course_content_review_for_actor_v1(uuid,uuid,text,text),
  public.set_course_content_review_for_actor_v1(uuid,uuid,text,text,text,boolean,text),
  public.set_course_content_review_policy_for_actor_v1(uuid,uuid,bigint,text,text) to service_role;
grant execute on function public.get_course_content_review_v1(uuid,text,text),
  public.set_course_content_review_v1(uuid,text,text,text,boolean,text),
  public.set_course_content_review_policy_v1(uuid,bigint,text,text) to authenticated;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260909025232',
    'features',(select jsonb_agg(value order by value collate "C") from jsonb_array_elements_text(
      (public.get_aralearn_runtime_manifest()->'features')||'["object-content-review-v1","independent-review-access-v1"]'::jsonb)));
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
