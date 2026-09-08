-- EdiÃ§Ã£o manual focal da ExplicaÃ§Ã£o; a origem humana descreve o ato no recibo,
-- nÃ£o a autoria integral da microssequÃªncia nem aprovaÃ§Ã£o de conteÃºdo.
begin;
create or replace function public.commit_course_composition_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
  p_expected_study_unit_version bigint,p_upserts jsonb,p_deletes jsonb,
  p_source_attribution_applications jsonb,p_channel text,p_application_origin text,
  p_request_id text,p_expected_microsequence_version bigint,p_course_metadata jsonb default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare
  v_entity private.course_entities%rowtype;
  v_receipt private.course_change_receipts%rowtype;
  v_upsert jsonb; v_links jsonb; v_result jsonb; v_version bigint;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_channel is distinct from 'application' or p_application_origin is distinct from 'manual'
    or p_expected_study_unit_version is not null or p_expected_microsequence_version is null
    or p_expected_microsequence_version<1 or p_course_metadata is not null
    or jsonb_typeof(p_upserts) is distinct from 'array' or jsonb_array_length(p_upserts)<>1
    or p_upserts->0->>'entityType' is distinct from 'microsequence'
    or jsonb_typeof(p_deletes) is distinct from 'array' or jsonb_array_length(p_deletes)<>0
    or jsonb_typeof(p_source_attribution_applications) is distinct from 'array'
    or jsonb_array_length(p_source_attribution_applications)<>1
    or p_source_attribution_applications->0->>'targetKind' is distinct from 'microsequence_explanation'
    or p_source_attribution_applications->0->>'targetId' is distinct from p_upserts->0->>'entityId'
    or not private.valid_course_explanation_v1(p_upserts#>'{0,content,explanation}') then
    raise exception 'A ediÃ§Ã£o manual exige somente a ExplicaÃ§Ã£o da microssequÃªncia inspecionada.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts receipt
    where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id and receipt.expires_at>statement_timestamp();
  if found then
    if v_receipt.result->>'channel' is distinct from p_channel
      or v_receipt.result->>'applicationOrigin' is distinct from p_application_origin
      or (v_receipt.result->>'expectedMicrosequenceVersion')::bigint is distinct from p_expected_microsequence_version then
      raise exception 'requestId reutilizado com origem ou microssequÃªncia incompatÃ­vel.' using errcode='23514';
    end if;
    -- O nÃºcleo confere hash, curso e operaÃ§Ã£o antes de devolver o resultado original.
    return public.commit_course_composition_for_actor_v1(p_actor_id,p_course_id,p_expected_revision,
      p_upserts,p_deletes,p_source_attribution_applications,p_request_id,p_course_metadata);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  v_upsert:=p_upserts->0;
  select * into v_entity from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='microsequence'
      and entity.entity_id=v_upsert->>'entityId' for update;
  if not found then raise exception 'MicrossequÃªncia inexistente.' using errcode='PT404'; end if;
  if v_entity.version<>p_expected_microsequence_version then
    raise exception 'A microssequÃªncia mudou; releia antes de salvar.' using errcode='PT409'; end if;
  if row(v_entity.parent_type,v_entity.parent_id,v_entity.position,v_entity.content-'explanation')
    is distinct from row(nullif(v_upsert->>'parentType',''),nullif(v_upsert->>'parentId',''),
      (v_upsert->>'position')::integer,(v_upsert->'content')-'explanation') then
    raise exception 'A ediÃ§Ã£o da ExplicaÃ§Ã£o deve conservar os demais campos da microssequÃªncia.' using errcode='22023'; end if;
  v_links:=private.course_source_links_v1(p_course_id,
    (private.course_effective_source_attribution_v1(p_course_id,'microsequence_explanation',v_entity.entity_id)).id);
  if p_source_attribution_applications#>'{0,sourceLinks}' is distinct from v_links then
    raise exception 'A ediÃ§Ã£o da ExplicaÃ§Ã£o deve conservar os vÃ­nculos atuais; revise fontes no painel Fontes.' using errcode='22023'; end if;
  v_result:=public.commit_course_composition_for_actor_v1(p_actor_id,p_course_id,p_expected_revision,
    p_upserts,p_deletes,p_source_attribution_applications,p_request_id,p_course_metadata);
  select version into strict v_version from private.course_entities
    where course_id=p_course_id and entity_type='microsequence' and entity_id=v_entity.entity_id;
  v_result:=v_result||jsonb_build_object('channel','application','applicationOrigin','manual',
    'expectedStudyUnitVersion',null,'expectedMicrosequenceVersion',p_expected_microsequence_version,
    'microsequenceId',v_entity.entity_id,'microsequenceVersion',v_version,'changeOrigin','human');
  update private.course_change_receipts set result=v_result
    where actor_id=p_actor_id and request_id=p_request_id;
  return v_result;
end $function$;
revoke all on function public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text,bigint,jsonb) to service_role;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260908002120');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
